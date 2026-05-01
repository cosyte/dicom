/**
 * Deflated Explicit VR Little Endian dataset parser — TS-04
 * (`1.2.840.10008.1.2.1.99`).
 *
 * Per `.planning/phases/02-core-parser/02-CONTEXT.md`:
 *   - D-26 — uses Node's `zlib.inflateRawSync` (RFC 1951 raw deflate).
 *     **MUST NOT** use `inflateSync` (RFC 1950 zlib-wrapped) — that's the
 *     silent-wrong bug per PROJECT.md key decision and PITFALLS.md §1.4.
 *   - D-26 — File Meta is parsed UNCOMPRESSED (FM-01); only the bytes from
 *     `fileMetaEnd` onward are inflated. The inflated bytes are then handed
 *     to `parseExplicitLE` (Deflated TS is just compressed Explicit-LE).
 *   - D-27 — dataset elements parsed from the inflated buffer report
 *     `position.deflated = true` with byte-offsets relative to the INFLATED
 *     buffer (not the on-disk buffer). File Meta warnings emitted before
 *     inflation carry `position.fileMeta = true` and on-disk byte-offsets.
 *
 * Threat model:
 *   - T-02-05-01 — Decompression bomb. The cap is `DEFAULT_MAX_INFLATED_BYTES`
 *     (256 MiB) by default; the test suite overrides via
 *     {@link parseDeflatedLEWithCap}. On exceed, Node throws a `RangeError`
 *     carrying `code === 'ERR_BUFFER_TOO_LARGE'` (or analogous on older
 *     versions); the parser converts to
 *     `DicomParseError(INVALID_FILE_META, ...)`.
 *   - T-02-05-02 — Stream corruption. Any inflate failure is wrapped in
 *     `DicomParseError(INVALID_FILE_META, 'Failed to inflate Deflated TS
 *     payload: <message>', ...)` — never a raw zlib `RangeError`.
 *   - T-02-05-04 — Inflated buffer retention. Element `rawBytes` are
 *     subarrays of the inflated buffer; the inflated buffer is held in
 *     memory until every Element is GC'd. Pass `{ copyValues: true }` to
 *     `parseDicom` to release the inflated buffer immediately after parse.
 *   - T-02-05-05 — Position confusion. The inner emit wrapper tags every
 *     emitted warning's position with `deflated: true` so consumers can
 *     distinguish on-disk offsets from inflated-buffer offsets.
 *
 * @module
 */

import type { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { buildSnippet, DicomParseError, FATAL_CODES } from "./errors.js";
import { parseExplicitLE } from "./explicit-le.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";

/**
 * Default decompression-bomb cap — 256 MiB. Per CONTEXT D-26 + the
 * security threat model T-02-05-01. Exposed via
 * {@link parseDeflatedLEWithCap} so the test suite can override the cap to
 * a small value (~1 KiB) for tractable bomb-cap tests; v1.x may expose
 * this through `ParseOptions`.
 *
 * @internal
 */
export const DEFAULT_MAX_INFLATED_BYTES = 256 * 1024 * 1024;

/**
 * Parse a Deflated Explicit VR LE dataset (TS-04).
 *
 * Inflates `buffer.subarray(datasetStart)` via `zlib.inflateRawSync`
 * (RFC 1951 raw deflate; **NOT** `inflateSync` — see PITFALLS §1.4) and
 * delegates to {@link parseExplicitLE} on the inflated bytes. Warnings
 * emitted from the inflated parse carry `position.deflated = true` per
 * D-27.
 *
 * @remarks
 * Element `rawBytes` from a Deflated TS dataset are subarrays of the
 * inflated buffer; the inflated buffer is pinned in memory until every
 * Element is GC'd. Pass `{ copyValues: true }` to `parseDicom` to release
 * the inflated buffer immediately after parse.
 *
 * Decompression-bomb mitigation: caps inflated output at 256 MiB. On
 * exceed, throws `DicomParseError(INVALID_FILE_META, '... exceeds cap')`.
 *
 * @internal
 */
export function parseDeflatedLE(
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): { elements: ReadonlyMap<Tag, Element>; endOffset: number } {
  return parseDeflatedLEWithCap(
    buffer,
    datasetStart,
    ctx,
    emit,
    DEFAULT_MAX_INFLATED_BYTES,
  );
}

/**
 * Same as {@link parseDeflatedLE} but with a configurable inflated-output
 * cap. Test-only — used by the bomb-cap test to override
 * `DEFAULT_MAX_INFLATED_BYTES` to a tractable value (~1 KiB).
 *
 * @internal
 */
export function parseDeflatedLEWithCap(
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  maxInflatedBytes: number,
): { elements: ReadonlyMap<Tag, Element>; endOffset: number } {
  const compressed = buffer.subarray(datasetStart);

  let inflated: Buffer;
  try {
    inflated = inflateRawSync(compressed, { maxOutputLength: maxInflatedBytes });
  } catch (err) {
    const errAny = err as { code?: string; message?: string };
    const code = errAny.code;
    const message = errAny.message ?? String(err);
    // Node's decompression-bomb signal — `ERR_BUFFER_TOO_LARGE` (Node 16.9+).
    // Older Node versions surface this via a different RangeError shape;
    // detect by class + message regex as a fallback.
    if (
      code === "ERR_BUFFER_TOO_LARGE" ||
      (err instanceof RangeError && /maxOutputLength|too large/i.test(message))
    ) {
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        `Inflated Deflated TS payload exceeds ${String(maxInflatedBytes)}-byte cap.`,
        datasetStart,
        buildSnippet(buffer, datasetStart),
      );
    }
    throw new DicomParseError(
      FATAL_CODES.INVALID_FILE_META,
      `Failed to inflate Deflated TS payload: ${message}`,
      datasetStart,
      buildSnippet(buffer, datasetStart),
    );
  }

  // Inner ParseContext over the inflated buffer. All other fields carry
  // through unchanged (creators, encodingContextStack, nestingDepth,
  // strict, copyValues) so private-creator tracking and nesting-depth
  // accounting work transparently across the inflate boundary.
  const innerCtx: ParseContext = { ...ctx, buffer: inflated };

  // Inner emit wrapper — tags every emitted warning's position with
  // `deflated: true` per D-27, then forwards to the outer chokepoint
  // (which preserves strict-mode escalation + onWarning callback +
  // ds.warnings push semantics).
  const innerEmit = (w: DicomParseWarning): void => {
    const wrapped: DicomParseWarning = {
      ...w,
      position: { ...w.position, deflated: true },
    };
    emit(wrapped);
  };

  const result = parseExplicitLE(inflated, 0, innerCtx, innerEmit);

  // The on-disk endOffset is the end of the source buffer — once the
  // deflate body starts, all remaining bytes belong to it.
  return { elements: result.elements, endOffset: buffer.length };
}

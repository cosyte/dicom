/**
 * Deflated Explicit VR Little Endian dataset parser
 * (`1.2.840.10008.1.2.1.99`).
 *
 * Three rules govern it:
 *   - It uses Node's `zlib.inflateRawSync` (RFC 1951 raw deflate).
 *     It **MUST NOT** use `inflateSync` (RFC 1950 zlib-wrapped): that is a
 *     silent-wrong bug rather than a loud one.
 *   - File Meta is parsed UNCOMPRESSED; only the bytes from `fileMetaEnd`
 *     onward are inflated. The inflated bytes are then handed to
 *     `parseExplicitLE` (Deflated TS is just compressed Explicit-LE).
 *   - Dataset elements parsed from the inflated buffer report
 *     `position.deflated = true` with byte-offsets relative to the INFLATED
 *     buffer (not the on-disk buffer). File Meta warnings emitted before
 *     inflation carry `position.fileMeta = true` and on-disk byte-offsets.
 *
 * Threat model:
 *   - Decompression bomb. The cap is `DEFAULT_MAX_INFLATED_BYTES`
 *     (256 MiB) by default; the test suite overrides via
 *     {@link parseDeflatedLEWithCap}. On exceed, Node throws a `RangeError`
 *     carrying `code === 'ERR_BUFFER_TOO_LARGE'` (or analogous on older
 *     versions); the parser converts to
 *     `DicomParseError(INVALID_FILE_META, ...)`.
 *   - Stream corruption. Any inflate failure is wrapped in
 *     `DicomParseError(INVALID_FILE_META, 'Failed to inflate Deflated TS
 *     payload: <message>', ...)` - never a raw zlib `RangeError`.
 *   - Inflated buffer retention. Element `rawBytes` are subarrays of the
 *     inflated buffer; the inflated buffer is held in memory until every
 *     Element is GC'd. Pass `{ copyValues: true }` to `parseDicom` to
 *     release the inflated buffer immediately after parse.
 *   - Position confusion. The inner emit wrapper tags every emitted
 *     warning's position with `deflated: true` so consumers can distinguish
 *     on-disk offsets from inflated-buffer offsets.
 *
 * @module
 */

import type { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { makeEmitter } from "./emit.js";
import { OFFSET_FRAMES } from "./errors.js";
import { inflateFailed, inflatedPayloadExceedsCap } from "./fatals.js";
import { parseExplicitLE } from "./explicit-le.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";

/**
 * Default decompression-bomb cap - 256 MiB, set by the parser's own
 * security threat model. Exposed via
 * {@link parseDeflatedLEWithCap} so the test suite can override the cap to
 * a small value (~1 KiB) for tractable bomb-cap tests; v1.x may expose
 * this through `ParseOptions`.
 *
 * @internal
 */
export const DEFAULT_MAX_INFLATED_BYTES = 256 * 1024 * 1024;

/**
 * Parse a Deflated Explicit VR LE dataset.
 *
 * Inflates `buffer.subarray(datasetStart)` via `zlib.inflateRawSync`
 * (RFC 1951 raw deflate; **NOT** `inflateSync`) and delegates to
 * {@link parseExplicitLE} on the inflated bytes. Warnings emitted from the
 * inflated parse carry `position.deflated = true`.
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
  return parseDeflatedLEWithCap(buffer, datasetStart, ctx, emit, DEFAULT_MAX_INFLATED_BYTES);
}

/**
 * Same as {@link parseDeflatedLE} but with a configurable inflated-output
 * cap. Test-only - used by the bomb-cap test to override
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
    // Node's decompression-bomb signal - `ERR_BUFFER_TOO_LARGE` (Node 16.9+).
    // Older Node versions surface this via a different RangeError shape;
    // detect by class + message regex as a fallback.
    if (
      code === "ERR_BUFFER_TOO_LARGE" ||
      (err instanceof RangeError && /maxOutputLength|too large/i.test(message))
    ) {
      throw inflatedPayloadExceedsCap(ctx.frame, datasetStart, maxInflatedBytes);
    }
    // `message` is zlib's, and it is deliberately not forwarded. It is an
    // `err.message` from a library handed the sender's bytes, which is the one
    // shape of third-party string this parser cannot vouch for; the zlib error
    // `code` is a closed set and says the same thing safely. Since the fatal
    // registry that closure is enforced rather than asserted: `inflateFailed`
    // renders `code` only when it names one of the nine `zlib.codes` entries.
    throw inflateFailed(ctx.frame, datasetStart, code);
  }

  // Inner ParseContext over the inflated buffer. All other fields carry
  // through unchanged (creators, encodingContextStack, nestingDepth,
  // strict, copyValues) so private-creator tracking and nesting-depth
  // accounting work transparently across the inflate boundary.
  const innerCtx: ParseContext = {
    ...ctx,
    frame: { buffer: inflated, name: OFFSET_FRAMES.INFLATED_DATASET },
  };

  // Inner emit wrapper - tags every emitted warning's position with
  // `deflated: true`, then forwards to the outer chokepoint
  // (which preserves strict-mode escalation + onWarning callback +
  // ds.warnings push semantics).
  //
  // It builds a chokepoint over `innerCtx` rather than forwarding to the outer
  // one, and that is not cosmetic: `makeEmitter` closes over `ctx.frame` to cut
  // the strict-mode snippet and to name the offset's frame, so forwarding meant
  // slicing the COMPRESSED source at an offset that indexes the INFLATED stream
  // and labelling it `"input"`. The snippet was confidently wrong. `innerCtx` shares the outer `warnings` array, `onWarning` and
  // `strict`, so every other semantic is unchanged.
  const innerChokepoint = makeEmitter(innerCtx);
  const innerEmit = (w: DicomParseWarning): void => {
    const wrapped: DicomParseWarning = {
      ...w,
      position: { ...w.position, deflated: true },
    };
    innerChokepoint(wrapped);
  };

  const result = parseExplicitLE(inflated, 0, innerCtx, innerEmit);

  // The on-disk endOffset is the end of the source buffer - once the
  // deflate body starts, all remaining bytes belong to it.
  return { elements: result.elements, endOffset: buffer.length };
}

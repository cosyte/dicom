/**
 * Public parser entry — `parseDicom`.
 *
 * Pipeline (Phase 2 plan 02-02):
 *   1. Dual EMPTY_INPUT check (raw input + post-normalize) per CONTEXT D-13.
 *   2. {@link normalizeInput} converts `Buffer | Uint8Array | ArrayBuffer`
 *      to a zero-copy `Buffer` view per PARSE-04.
 *   3. {@link parsePart10Header} resolves preamble + DICM framing per D-14.
 *   4. {@link parseFileMeta} parses the (always Explicit VR LE) File Meta
 *      group per FM-01 / D-17.
 *   5. {@link TRANSFER_SYNTAX_PARSERS} dispatches on TS UID per D-20;
 *      unsupported UIDs throw `UNSUPPORTED_TRANSFER_SYNTAX` carrying the
 *      `Dictionary.uid(uid)?.name` in `err.snippet`.
 *   6. The chosen strategy returns a `ReadonlyMap<Tag, Element>` (Phase 2
 *      stubs — real bodies arrive in plans 02-03 / 02-04 / 02-05).
 *   7. The result is assembled into a structural {@link Dataset}.
 *
 * Phase 6 (D-45) wires a source/vendor `Profile` via `ParseOptions.profile`:
 * its `escalations` / `suppressions` reshape Tier-2 emission at the
 * {@link makeEmitter} chokepoint, and its private-dictionary overlay resolves
 * the Implicit VR of vendor private data elements.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { Dataset } from "../dataset/dataset.js";
import { uid as dictionaryUid } from "../dictionary/index.js";
import { makeEmitter } from "./emit.js";
import { buildSnippet, DicomParseError, FATAL_CODES } from "./errors.js";
import { parseFileMeta } from "./file-meta.js";
import { parsePart10Header } from "./part10-header.js";
import { TRANSFER_SYNTAX_PARSERS } from "./transfer-syntax.js";
import type { OnWarningCallback, ParseContext, ParseOptions } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";

/**
 * Parse a DICOM Part 10 buffer into a structural {@link Dataset}.
 *
 * Lenient by default — recoverable deviations (missing preamble, File Meta
 * group-length mismatch, odd-length value, etc.) are pushed into
 * `ds.warnings` with stable codes from `WARNING_CODES`. Four unrecoverable
 * structural failures throw `DicomParseError`:
 *
 *   - `EMPTY_INPUT` — empty `Buffer | Uint8Array | ArrayBuffer`.
 *   - `NOT_DICOM_PART_10` — input lacks both `DICM` magic at offset 128 and
 *     a recognizable `(0002,0000)` File Meta Group Length at offset 0.
 *   - `INVALID_FILE_META` — File Meta is truncated or `(0002,0010)`
 *     Transfer Syntax UID is missing.
 *   - `UNSUPPORTED_TRANSFER_SYNTAX` — Transfer Syntax UID is not one of the
 *     four v1 UIDs (`1.2.840.10008.1.2`, `…1.2.1`, `…1.2.2`, `…1.2.1.99`).
 *
 * Pass `{ strict: true }` to escalate every Tier-2 warning to a thrown
 * `DicomParseError` carrying the warning code.
 *
 * @example
 * ```ts
 * import { parseDicom, WARNING_CODES, DicomParseError } from "@cosyte/dicom";
 * import { readFileSync } from "node:fs";
 *
 * // Three input shapes (PARSE-04): Buffer, Uint8Array, ArrayBuffer.
 * const bytes = readFileSync("study.dcm");
 * const ds1 = parseDicom(bytes);
 * const ds2 = parseDicom(new Uint8Array(bytes));
 * const ds3 = parseDicom(bytes.buffer);
 *
 * // Inspect File Meta + warnings.
 * console.log(ds1.fileMeta?.transferSyntaxUID);
 * for (const w of ds1.warnings) {
 *   if (w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE) {
 *     console.warn("bare File Meta input at offset", w.position.byteOffset);
 *   }
 * }
 *
 * // Strict mode + onWarning callback.
 * try {
 *   parseDicom(bytes, {
 *     strict: true,
 *     onWarning: (w) => console.error(w.code, "at offset", w.position.byteOffset),
 *   });
 * } catch (err) {
 *   if (err instanceof DicomParseError) {
 *     console.error(err.code, err.byteOffset, err.snippet);
 *   }
 * }
 * ```
 */
export function parseDicom(input: Buffer | Uint8Array | ArrayBuffer): Dataset;
export function parseDicom(
  input: Buffer | Uint8Array | ArrayBuffer,
  options: ParseOptions,
): Dataset;
/** @internal — implementation signature. Public JSDoc lives on the overloads above. */
export function parseDicom(
  input: Buffer | Uint8Array | ArrayBuffer,
  options: ParseOptions = {},
): Dataset {
  // First EMPTY_INPUT check — raw input length (D-13 dual-check, first half).
  if (rawInputIsEmpty(input)) {
    throw new DicomParseError(FATAL_CODES.EMPTY_INPUT, "Input is empty.", 0, "");
  }

  const buffer = normalizeInput(input);

  // Second EMPTY_INPUT check — after normalization (D-13 corner-case for views).
  if (buffer.length === 0) {
    throw new DicomParseError(
      FATAL_CODES.EMPTY_INPUT,
      "Input is empty after normalization.",
      0,
      "",
    );
  }

  // Build ParseContext. `copyValues: false` default per D-16. `onWarning` is
  // omitted (not set to undefined) per exactOptionalPropertyTypes / D-02.
  const warnings: DicomParseWarning[] = [];
  const ctx: ParseContext = buildContext(buffer, options, warnings);
  const emit = makeEmitter(ctx);

  // Step 1: Detect Part 10 framing (preamble + DICM, with stripPreamble tri-state per D-14).
  const { datasetStart } = parsePart10Header(buffer, ctx, emit);

  // Step 2: Parse File Meta (always Explicit VR LE per FM-01 / D-17).
  const { fileMeta, fileMetaEnd } = parseFileMeta(buffer, datasetStart, ctx, emit);

  // Step 3: Dispatch on transfer syntax UID (D-20).
  const tsUid = fileMeta.transferSyntaxUID;
  const strategy = TRANSFER_SYNTAX_PARSERS[tsUid];
  if (strategy === undefined) {
    const tsName = dictionaryUid(tsUid)?.name ?? "";
    throw new DicomParseError(
      FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX,
      `Transfer Syntax UID "${tsUid}" is not supported by @cosyte/dicom v1.`,
      fileMetaEnd,
      tsName.length > 0 ? tsName : buildSnippet(buffer, fileMetaEnd),
    );
  }

  // Step 4: Parse the dataset with the chosen strategy.
  const { elements } = strategy(buffer, fileMetaEnd, ctx, emit);

  return new Dataset({ fileMeta, warnings: ctx.warnings, elements });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rawInputIsEmpty(input: Buffer | Uint8Array | ArrayBuffer): boolean {
  if (input instanceof ArrayBuffer) return input.byteLength === 0;
  return input.byteLength === 0;
}

function normalizeInput(input: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  return Buffer.from(input);
}

function buildContext(
  buffer: Buffer,
  options: ParseOptions,
  warnings: DicomParseWarning[],
): ParseContext {
  const base: Omit<ParseContext, "onWarning" | "profile"> = {
    buffer,
    strict: options.strict === true,
    stripPreamble: options.stripPreamble ?? "tolerate",
    warnings,
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: options.copyValues === true,
  };
  // Per D-45 — thread the source/vendor profile (Phase 6) when supplied;
  // omit the key entirely otherwise (exactOptionalPropertyTypes / D-02).
  const withProfile: Omit<ParseContext, "onWarning"> =
    options.profile !== undefined ? { ...base, profile: options.profile } : base;
  if (options.onWarning !== undefined) {
    const onWarning: OnWarningCallback = options.onWarning;
    return { ...withProfile, onWarning };
  }
  return withProfile;
}

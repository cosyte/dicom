/**
 * Part 10 framing detection — preamble + DICM magic recognition.
 *
 * Per `.planning/phases/02-core-parser/02-CONTEXT.md`:
 *   - D-14 — `stripPreamble` tri-state semantics (`"tolerate"` default,
 *     `"require"` strict-equivalent for this one code).
 *   - D-15 — NOT_DICOM_PART_10 detection heuristic: input must have either
 *     `DICM` magic at offset 128 OR a plausible `(0002,0000)` File Meta
 *     Group Length element in valid Explicit VR LE form at offset 0.
 *   - T-02-02-02 / T-02-02-03 — Truncated and spoofed inputs are rejected
 *     with a fatal throw rather than indexing past buffer end.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { buildSnippet, DicomParseError, FATAL_CODES } from "./errors.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";
import { missingPreamble } from "./warnings.js";

const DICM_MAGIC = Buffer.from("DICM", "ascii");

/** Result of {@link parsePart10Header}. */
export interface Part10HeaderResult {
  /** Offset where the File Meta group begins (132 with preamble; 0 without). */
  readonly datasetStart: number;
  /** True when DICM magic was present at offset 128. */
  readonly hadPreamble: boolean;
}

/**
 * Detect the Part 10 framing (128-byte preamble + `DICM` magic) and return
 * the offset where the File Meta group begins.
 *
 * Behavior per CONTEXT.md D-14 + D-15:
 *
 * - `DICM` at offset 128 → strip 128 + 4 bytes; `{ datasetStart: 132,
 *   hadPreamble: true }` (silent).
 * - `stripPreamble === "require"` AND no DICM → throw
 *   `DicomParseError(NOT_DICOM_PART_10)`.
 * - `stripPreamble === "tolerate"` (default) AND no DICM:
 *     - If buffer has a plausible `(0002,0000)` UL element at offset 0 →
 *       emit `DICOM_MISSING_PREAMBLE`; `{ datasetStart: 0, hadPreamble: false }`.
 *     - Else → throw `DicomParseError(NOT_DICOM_PART_10)`.
 *
 * Buffers shorter than 12 bytes that lack `DICM` magic are always thrown as
 * `NOT_DICOM_PART_10` rather than indexing past the buffer end (T-02-02-02).
 *
 * @internal
 */
export function parsePart10Header(
  buffer: Buffer,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): Part10HeaderResult {
  if (buffer.length >= 132 && buffer.subarray(128, 132).equals(DICM_MAGIC)) {
    return { datasetStart: 132, hadPreamble: true };
  }

  if (ctx.stripPreamble === "require") {
    throw new DicomParseError(
      FATAL_CODES.NOT_DICOM_PART_10,
      "Missing DICM magic at offset 128 (stripPreamble='require').",
      0,
      buildSnippet(buffer, 0),
    );
  }

  // Default `stripPreamble === "tolerate"`: try detecting a bare File Meta
  // group at offset 0.
  if (looksLikeFileMetaGroupLengthAtOffsetZero(buffer)) {
    emit(missingPreamble({ byteOffset: 0 }));
    return { datasetStart: 0, hadPreamble: false };
  }

  throw new DicomParseError(
    FATAL_CODES.NOT_DICOM_PART_10,
    "Input is not a DICOM Part 10 file (no DICM magic at offset 128 and no recognizable File Meta group at offset 0).",
    0,
    buildSnippet(buffer, 0),
  );
}

/**
 * Heuristic per CONTEXT.md D-15: detect a `(0002,0000)`
 * FileMetaInformationGroupLength element at offset 0 in valid Explicit VR LE
 * form.
 *
 * Layout (12 bytes): group(2) + element(2) + VR='UL'(2) + length=0x0004(2) +
 * value(4). The value bytes themselves are not validated here — they are the
 * declared File Meta group length, which `parseFileMeta` cross-checks.
 */
function looksLikeFileMetaGroupLengthAtOffsetZero(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.readUInt16LE(0) === 0x0002 &&
    buffer.readUInt16LE(2) === 0x0000 &&
    buffer.readUInt8(4) === 0x55 && // 'U'
    buffer.readUInt8(5) === 0x4c && // 'L'
    buffer.readUInt16LE(6) === 0x0004
  );
}

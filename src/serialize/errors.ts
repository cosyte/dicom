/**
 * Serializer error taxonomy for the Part 10 writer.
 *
 * Like {@link "../dataset/helpers/errors".DicomValueError}, this
 * is **separate** from the parser's four-code `FATAL_CODES` /
 * `DicomParseError` (which are locked to *read*-side Part 10 structural
 * corruption - see `../parser/errors.ts`). The serializer throws only when
 * it is asked to emit a buffer it cannot make spec-clean:
 *
 *   - `MISSING_TRANSFER_SYNTAX` - the `Dataset` has no `fileMeta`, or its
 *     `fileMeta.transferSyntaxUID` is empty. The Transfer Syntax UID is the
 *     dispatch input that decides every byte of the encoding, so there is no
 *     safe default to fall back to.
 *   - `UNSUPPORTED_TRANSFER_SYNTAX` - the Transfer Syntax UID is neither one of
 *     the four native syntaxes nor one PS3.5 2026c section A.4 names for
 *     encapsulated Pixel Data (the JPIP Referenced and SMPTE ST 2110 syntaxes
 *     and every retired UID stay here). The writer never transcodes, so it
 *     cannot emit a syntax it does not understand.
 *   - `INVALID_ENCAPSULATED_PIXEL_DATA` - the Transfer Syntax UID is a section
 *     A.4 one, but the top-level Data Set is not one that syntax may carry: no
 *     top-level Pixel Data `(7FE0,0010)`, Float or Double Float Pixel Data
 *     `(7FE0,0008)` / `(7FE0,0009)` present, Pixel Data with a defined Value
 *     Length (Native Format), or a fragment stream that is not a Basic Offset
 *     Table Item and one or more fragment Items of even, defined, non-zero
 *     Item Length, ended by a Sequence Delimitation Item. The writer refuses
 *     such a stream rather than repairing it: appending a delimiter to a stream
 *     the reader flagged as possibly short would write a well-formed file that
 *     may be missing frames.
 *   - `DIRECTORY_OFFSET_UNRESOLVED` - the `Dataset` is a DICOMDIR (File Meta
 *     Media Storage SOP Class UID `1.2.840.10008.1.3.10`) and one of its offset
 *     attributes, `(0004,1200)`, `(0004,1202)`, or a Directory Record's
 *     `(0004,1400)` or `(0004,1420)`, cannot be tied to a Directory Record the
 *     `Dataset` holds: a non-zero value that is not the `Item.fileOffset` of an
 *     Item of its Directory Record Sequence `(0004,1220)`, or a value that is
 *     not one 32-bit unsigned integer. The writer recomputes every offset it
 *     can tie; one it cannot is refused, never written stale (it would name the
 *     wrong bytes) and never written as zero (zero means "no record" and would
 *     silently prune the tree).
 *   - `DIRECTORY_OFFSET_DEFLATED` - the DICOMDIR is to be written in Deflated
 *     Explicit VR Little Endian and carries a non-zero offset (or one that is
 *     not one 32-bit unsigned integer). A position inside a deflated stream
 *     names no Item a reader can seek to, so no offset can be written for it.
 *     A Deflated DICOMDIR whose offsets are all zero is written.
 *
 * The message is built only from structural constants (never a decoded
 * attribute value, a Transfer Syntax UID, or a length or byte read from the
 * input), so it is always safe to log.
 *
 * @module
 */

/**
 * Stable string codes the serializer may throw. Narrow on
 * {@link DicomSerializeError.code} to react to a specific failure.
 *
 * @example
 * ```ts
 * import { SERIALIZE_ERROR_CODES } from "@cosyte/dicom";
 * SERIALIZE_ERROR_CODES.MISSING_TRANSFER_SYNTAX; // "MISSING_TRANSFER_SYNTAX"
 * ```
 */
export const SERIALIZE_ERROR_CODES = {
  MISSING_TRANSFER_SYNTAX: "MISSING_TRANSFER_SYNTAX",
  UNSUPPORTED_TRANSFER_SYNTAX: "UNSUPPORTED_TRANSFER_SYNTAX",
  INVALID_ENCAPSULATED_PIXEL_DATA: "INVALID_ENCAPSULATED_PIXEL_DATA",
  DIRECTORY_OFFSET_UNRESOLVED: "DIRECTORY_OFFSET_UNRESOLVED",
  DIRECTORY_OFFSET_DEFLATED: "DIRECTORY_OFFSET_DEFLATED",
} as const;

/**
 * Discriminant for {@link DicomSerializeError.code}, enabling exhaustive
 * `switch` narrowing (the `switch-exhaustiveness-check` lint rule).
 *
 * @example
 * ```ts
 * import type { SerializeErrorCode } from "@cosyte/dicom";
 * function describe(code: SerializeErrorCode): string {
 *   switch (code) {
 *     case "MISSING_TRANSFER_SYNTAX":
 *       return "dataset has no Transfer Syntax UID to serialize under";
 *     case "UNSUPPORTED_TRANSFER_SYNTAX":
 *       return "Transfer Syntax UID is neither native nor a section A.4 one";
 *     case "INVALID_ENCAPSULATED_PIXEL_DATA":
 *       return "top-level Pixel Data is not a section A.4 fragment stream";
 *     case "DIRECTORY_OFFSET_UNRESOLVED":
 *       return "a DICOMDIR offset names no Directory Record the dataset holds";
 *     case "DIRECTORY_OFFSET_DEFLATED":
 *       return "a Deflated DICOMDIR carries a non-zero Directory Record offset";
 *   }
 * }
 * ```
 */
export type SerializeErrorCode = (typeof SERIALIZE_ERROR_CODES)[keyof typeof SERIALIZE_ERROR_CODES];

/**
 * Thrown by `serializeDicom` when a `Dataset`
 * cannot be emitted as spec-clean Part 10. Never carries a decoded value, so
 * it is safe to log without leaking PHI: the `message` is built only from the
 * code and structural constants, never from the Transfer Syntax UID, a length
 * or a byte the `Dataset` holds.
 *
 * @example
 * ```ts
 * import { parseDicom, serializeDicom, DicomSerializeError } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * try {
 *   serializeDicom(ds);
 * } catch (err) {
 *   if (err instanceof DicomSerializeError && err.code === "MISSING_TRANSFER_SYNTAX") {
 *     // dataset is missing the File Meta Transfer Syntax UID
 *   }
 *   if (err instanceof DicomSerializeError && err.code === "INVALID_ENCAPSULATED_PIXEL_DATA") {
 *     // a section A.4 object whose top-level Pixel Data is not a fragment stream
 *   }
 *   if (err instanceof DicomSerializeError && err.code === "DIRECTORY_OFFSET_UNRESOLVED") {
 *     // a DICOMDIR offset the writer cannot tie to a Directory Record
 *   }
 * }
 * ```
 */
export class DicomSerializeError extends Error {
  public readonly code: SerializeErrorCode;

  /**
   * Construct a new `DicomSerializeError`. The `message` MUST be built only
   * from structural facts (never a decoded attribute value) so the error is
   * always safe to log.
   *
   * @internal
   */
  public constructor(code: SerializeErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "DicomSerializeError";
    this.code = code;
  }
}

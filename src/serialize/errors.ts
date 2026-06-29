/**
 * Serializer error taxonomy for the Phase 5 Part 10 writer.
 *
 * Like the Phase 4 {@link "../dataset/helpers/errors".DicomValueError}, this
 * is **separate** from the parser's four-code `FATAL_CODES` /
 * `DicomParseError` (which are locked to *read*-side Part 10 structural
 * corruption — see `../parser/errors.ts`). The serializer throws only when
 * it is asked to emit a buffer it cannot make spec-clean:
 *
 *   - `MISSING_TRANSFER_SYNTAX` — the `Dataset` has no `fileMeta`, or its
 *     `fileMeta.transferSyntaxUID` is empty. The Transfer Syntax UID is the
 *     dispatch input that decides every byte of the encoding, so there is no
 *     safe default to fall back to.
 *   - `UNSUPPORTED_TRANSFER_SYNTAX` — the Transfer Syntax UID is not one of
 *     the four v1 syntaxes the writer (and parser) support. The writer never
 *     transcodes, so it cannot emit a syntax it does not understand.
 *
 * The message is built only from the Transfer Syntax UID and structural
 * facts (never a decoded attribute value), so it is always safe to log.
 *
 * @module
 */

/**
 * Stable string codes the Phase 5 serializer may throw. Narrow on
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
 *       return "Transfer Syntax UID is outside the v1 set";
 *   }
 * }
 * ```
 */
export type SerializeErrorCode = (typeof SERIALIZE_ERROR_CODES)[keyof typeof SERIALIZE_ERROR_CODES];

/**
 * Thrown by `serializeDicom` when a `Dataset`
 * cannot be emitted as spec-clean Part 10. Never carries a decoded value, so
 * it is safe to log without leaking PHI: the `message` is built only from the
 * code and the offending Transfer Syntax UID.
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

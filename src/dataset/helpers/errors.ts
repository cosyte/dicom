/**
 * Value-layer error taxonomy for the Phase 4 domain helpers.
 *
 * This is **separate** from the parser's four-code `FATAL_CODES` /
 * `DicomParseError` (locked to unrecoverable Part 10 structural corruption
 * — see `../../parser/errors.ts`). The §4 helpers are otherwise fail-safe:
 * a missing *value* is typed-absent (`undefined`), never an exception. The
 * helper layer throws only for a **structural contract violation** the
 * caller asked it to resolve and that cannot be answered safely:
 *
 *   - `FRAME_INDEX_OUT_OF_RANGE` — `image.frame(i)` called with an index
 *     outside `[0, numberOfFrames)`. Returning a guessed frame would be a
 *     silent wrong-image, so we refuse.
 *   - `MISSING_REQUIRED_FUNCTIONAL_GROUP` — an Enhanced multi-frame object
 *     lacks a required geometry macro (Pixel Measures / Plane Position /
 *     Plane Orientation) in *both* the Per-Frame and Shared groups, so the
 *     frame cannot be spatially placed.
 *
 * @module
 */

/**
 * Stable string codes the Phase 4 helpers may throw. Narrow on
 * {@link DicomValueError.code} to react to a specific contract violation.
 *
 * @example
 * ```ts
 * import { VALUE_ERROR_CODES } from "@cosyte/dicom";
 * VALUE_ERROR_CODES.FRAME_INDEX_OUT_OF_RANGE; // "FRAME_INDEX_OUT_OF_RANGE"
 * ```
 */
export const VALUE_ERROR_CODES = {
  FRAME_INDEX_OUT_OF_RANGE: "FRAME_INDEX_OUT_OF_RANGE",
  MISSING_REQUIRED_FUNCTIONAL_GROUP: "MISSING_REQUIRED_FUNCTIONAL_GROUP",
} as const;

/**
 * Discriminant for {@link DicomValueError.code}, enabling exhaustive
 * `switch` narrowing (the `switch-exhaustiveness-check` lint rule).
 *
 * @example
 * ```ts
 * import type { ValueErrorCode } from "@cosyte/dicom";
 * function describe(code: ValueErrorCode): string {
 *   switch (code) {
 *     case "FRAME_INDEX_OUT_OF_RANGE":
 *       return "frame index outside [0, numberOfFrames)";
 *     case "MISSING_REQUIRED_FUNCTIONAL_GROUP":
 *       return "enhanced object lacks a required geometry macro";
 *   }
 * }
 * ```
 */
export type ValueErrorCode = (typeof VALUE_ERROR_CODES)[keyof typeof VALUE_ERROR_CODES];

/**
 * Thrown by the Phase 4 helpers for a structural contract violation that
 * cannot be answered safely (see module doc). Never carries a decoded
 * value, so it is safe to log without leaking PHI: the `message` is built
 * only from the code and structural facts (indices, tag/macro names).
 *
 * @example
 * ```ts
 * import { parseDicom, DicomValueError } from "@cosyte/dicom";
 * const img = parseDicom(buf).image;
 * try {
 *   img.frame(9999);
 * } catch (err) {
 *   if (err instanceof DicomValueError && err.code === "FRAME_INDEX_OUT_OF_RANGE") {
 *     // handle the out-of-range request
 *   }
 * }
 * ```
 */
export class DicomValueError extends Error {
  public readonly code: ValueErrorCode;

  /**
   * Construct a new `DicomValueError`. The `message` MUST be built only
   * from structural facts (never a decoded attribute value) so the error
   * is always safe to log.
   *
   * @internal
   */
  public constructor(code: ValueErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "DicomValueError";
    this.code = code;
  }
}

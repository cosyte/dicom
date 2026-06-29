/**
 * `ProfileDefinitionError` — the single typed failure surface for
 * `defineProfile()`. Thrown (never returned) when profile-author input is
 * malformed: a bad name, an unknown option key, an unknown warning code, an
 * invalid VR, or a private-tag key that does not match the canonical
 * `GGGGxxEE` notation.
 *
 * This is distinct from the parse-time taxonomy (`DicomParseError` /
 * `DicomValueError` / `DicomSerializeError`) — a profile is built once, at
 * author time, long before any byte is parsed, so its errors never carry a
 * byte offset.
 *
 * @module
 */

/**
 * Thrown by `defineProfile()` when the supplied options are invalid.
 *
 * @example
 * ```ts
 * import { defineProfile, ProfileDefinitionError } from "@cosyte/dicom";
 * try {
 *   defineProfile({ name: "" });
 * } catch (err) {
 *   if (err instanceof ProfileDefinitionError) {
 *     console.error(err.message); // "Profile name must be a non-empty string."
 *   }
 * }
 * ```
 */
export class ProfileDefinitionError extends Error {
  /**
   * The offending profile's `name` when known (`undefined` when the failure
   * is the name itself). Lets callers attribute a composed-lineage failure to
   * the specific profile that introduced it.
   */
  readonly profileName?: string;

  /**
   * @param message - Actionable description of what made the options invalid.
   * @param profileName - The offending profile's `name`, when known.
   */
  constructor(message: string, profileName?: string) {
    super(message);
    this.name = "ProfileDefinitionError";
    if (profileName !== undefined) this.profileName = profileName;
    // Restore the prototype chain (transpilation-to-ES2023-class safety).
    Object.setPrototypeOf(this, ProfileDefinitionError.prototype);
  }
}

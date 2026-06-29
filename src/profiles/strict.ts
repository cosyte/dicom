/**
 * Built-in **strict** tolerance preset — a posture profile (no private
 * dictionary) that escalates the integrity-relevant Tier-2 warnings to thrown
 * `DicomParseError`s. Use it for conformance gating: an archive-validation or
 * gateway-ingest path that should *reject* a file the moment it deviates in a
 * way that could change the meaning of the data, rather than tolerating it and
 * emitting a warning.
 *
 * It escalates only deviations where silent tolerance risks a wrong decode or a
 * structural surprise (VR mismatch, pixel-data length mismatch, undefined
 * length under Explicit VR, non-zero reserved bytes, an orphaned private
 * element, a UN-as-SQ descent, a File Meta group-length mismatch). Purely
 * cosmetic deviations (odd-length padding, a SPACE-padded UI, a missing
 * preamble) are left as warnings — strict is conformance gating, not pedantry.
 *
 * A preset never *loosens* the parse: outside the four Tier-3 fatals the
 * unprofiled default already tolerates everything, and `strict` only tightens.
 *
 * @module
 */

import { defineProfile } from "./define.js";
import { WARNING_CODES } from "../parser/warnings.js";
import type { Profile } from "../parser/types.js";

/**
 * The strict conformance preset. Escalates integrity-relevant Tier-2 codes.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles, DicomParseError } from "@cosyte/dicom";
 * try {
 *   parseDicom(buf, { profile: profiles.strict });
 * } catch (err) {
 *   if (err instanceof DicomParseError) {
 *     // a tolerated deviation was escalated to a hard failure
 *   }
 * }
 * ```
 */
export const strict: Profile = defineProfile({
  name: "strict",
  description: "Conformance-gating preset: escalates integrity-relevant Tier-2 warnings to errors.",
  escalate: [
    WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH,
    WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH,
    WARNING_CODES.DICOM_VR_MISMATCH,
    WARNING_CODES.DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR,
    WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES,
    WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR,
    WARNING_CODES.DICOM_UN_PARSED_AS_SQ,
  ],
});

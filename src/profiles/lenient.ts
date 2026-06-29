/**
 * Built-in **lenient** tolerance preset — a posture profile (no private
 * dictionary) that *suppresses* the cosmetic, high-volume Tier-2 warnings a
 * conformance-loose source (older modalities, archive CDs, anonymizer output)
 * routinely emits. The decode is byte-for-byte identical to the unprofiled
 * default; lenient only quiets the noise so a real anomaly is not buried under
 * dozens of benign padding / preamble warnings.
 *
 * It suppresses only deviations that cannot change the meaning of the data: a
 * missing preamble, odd-length padding, retired in-dataset group lengths, a
 * SPACE-padded UI, a trailing NULL in a text VR, a missing File Meta group
 * length (recovered by forward scan). Integrity-relevant codes (VR mismatch,
 * pixel-data length mismatch, …) are left intact — lenient quiets cosmetics, it
 * does not blind you to corruption.
 *
 * A preset never *loosens* the parse past the lenient default it inherits:
 * suppression drops a warning that was already tolerated, never makes a fatal
 * non-fatal.
 *
 * @module
 */

import { defineProfile } from "./define.js";
import { WARNING_CODES } from "../parser/warnings.js";
import type { Profile } from "../parser/types.js";

/**
 * The lenient preset. Suppresses cosmetic, high-volume Tier-2 codes.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles } from "@cosyte/dicom";
 * const ds = parseDicom(buf, { profile: profiles.lenient });
 * // ds.warnings holds only integrity-relevant deviations; padding/preamble
 * // noise is suppressed.
 * ```
 */
export const lenient: Profile = defineProfile({
  name: "lenient",
  description: "Quiet preset: suppresses cosmetic, high-volume Tier-2 warnings.",
  suppress: [
    WARNING_CODES.DICOM_MISSING_PREAMBLE,
    WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED,
    WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET,
    WARNING_CODES.DICOM_UI_TRAILING_SPACE,
    WARNING_CODES.DICOM_TRAILING_NULL_IN_TEXT_VR,
    WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
  ],
});

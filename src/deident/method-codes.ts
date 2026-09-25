/**
 * PS3.16 2026d CID 7050 "De-identification Method", carried as pinned data, and
 * the map from what a `deidentify()` run activated to the code it records.
 *
 * PS3.15 2026c §E.1.1: "one or more codes from CID 7050 "De-identification
 * Method" corresponding to the Profile and Options used shall be added to
 * De-identification Method Code Sequence (0012,0064), and/or a text string
 * describing the method used shall be inserted in or added to De-identification
 * Method (0012,0063)." This package writes both halves: the text on
 * `(0012,0063)` and these codes on `(0012,0064)`.
 *
 * **A cited constant, not a vendored PS3.16 plus a generator.** The context group
 * is thirteen rows and its version, `20170914`, is unchanged between the PS3.15
 * 2026d edition this package vendors and the PS3.16 2026d page these rows are
 * quoted from (Type Extensible, UID `1.2.840.10008.6.1.925`, every row
 * designator `DCM`). The "Option" suffix is part of each Code Meaning.
 *
 * Two rows are carried and **never written**: `113101` Clean Pixel Data Option and
 * `113102` Clean Recognizable Visual Features Option. This is a metadata-only
 * de-identifier and cannot inspect pixels, which is why neither is a
 * {@link DeidentifyOption}.
 *
 * @module
 */

import type { DeidentifyOption } from "./types.js";

/**
 * One row of PS3.16 CID 7050 "De-identification Method": the three Basic Coded
 * Entry Attributes (PS3.3 2026d Table 8.8-1a) of one code, exactly as the context
 * group spells them.
 *
 * `deidentify()` writes each code it records as one Item of
 * `(0012,0064)` De-identification Method Code Sequence carrying Code Value
 * `(0008,0100)`, Coding Scheme Designator `(0008,0102)` and Code Meaning
 * `(0008,0104)`, and nothing else. Coding Scheme Version is omitted because PS3.3
 * requires it only where the designator is not sufficient to identify the code,
 * and `DCM` is.
 *
 * @example
 * ```ts
 * import { DEIDENTIFICATION_METHOD_CODES, type DeidentificationMethodCode } from "@cosyte/dicom";
 * const profile: DeidentificationMethodCode = DEIDENTIFICATION_METHOD_CODES.profile;
 * profile.codeValue; // "113100"
 * ```
 */
export interface DeidentificationMethodCode {
  /** Code Value `(0008,0100)`, a VR `SH` value. */
  readonly codeValue: string;
  /** Coding Scheme Designator `(0008,0102)`. Every CID 7050 row is `DCM`. */
  readonly codingSchemeDesignator: "DCM";
  /** Code Meaning `(0008,0104)`, a VR `LO` value, spelled as CID 7050 spells it. */
  readonly codeMeaning: string;
}

/** Build one frozen CID 7050 row. */
function row(codeValue: string, codeMeaning: string): DeidentificationMethodCode {
  return Object.freeze({ codeValue, codingSchemeDesignator: "DCM", codeMeaning });
}

const BASIC_PROFILE = row("113100", "Basic Application Confidentiality Profile");
const CLEAN_PIXEL_DATA = row("113101", "Clean Pixel Data Option");
const CLEAN_RECOGNIZABLE_VISUAL_FEATURES = row(
  "113102",
  "Clean Recognizable Visual Features Option",
);
const CLEAN_GRAPHICS = row("113103", "Clean Graphics Option");
const CLEAN_STRUCTURED_CONTENT = row("113104", "Clean Structured Content Option");
const CLEAN_DESCRIPTORS = row("113105", "Clean Descriptors Option");
const RETAIN_TEMPORAL_FULL_DATES = row(
  "113106",
  "Retain Longitudinal Temporal Information Full Dates Option",
);
const RETAIN_TEMPORAL_MODIFIED_DATES = row(
  "113107",
  "Retain Longitudinal Temporal Information Modified Dates Option",
);
const RETAIN_PATIENT_CHARACTERISTICS = row("113108", "Retain Patient Characteristics Option");
const RETAIN_DEVICE_IDENTITY = row("113109", "Retain Device Identity Option");
const RETAIN_UIDS = row("113110", "Retain UIDs Option");
const RETAIN_SAFE_PRIVATE = row("113111", "Retain Safe Private Option");
const RETAIN_INSTITUTION_IDENTITY = row("113112", "Retain Institution Identity Option");

/**
 * PS3.16 2026d CID 7050 "De-identification Method" (context group version
 * `20170914`, UID `1.2.840.10008.6.1.925`), with the code `deidentify()` records
 * for the Profile and for each {@link DeidentifyOption}.
 *
 * - `rows` - all thirteen rows, in the context group's own order.
 * - `profile` - `113100` Basic Application Confidentiality Profile, written by
 *   every run.
 * - `options` - the code written when that Option was active for the run. An
 *   Option "ran" when it was active: the Annex E column it selects is resolved
 *   off the option set, whether or not the object carried an attribute it acts
 *   on. `113107` therefore says the modified-dates column was resolved, **not**
 *   that any date was shifted; this library transforms no date, and every such
 *   run carries `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on `report.warnings`.
 *
 * `113101` and `113102` are in `rows` and are never written: they name the two
 * pixel-level Options, which this metadata-only layer does not perform.
 *
 * @example
 * ```ts
 * import { DEIDENTIFICATION_METHOD_CODES } from "@cosyte/dicom";
 * DEIDENTIFICATION_METHOD_CODES.contextGroupUid; // "1.2.840.10008.6.1.925"
 * DEIDENTIFICATION_METHOD_CODES.options.RetainUIDs.codeValue; // "113110"
 * DEIDENTIFICATION_METHOD_CODES.rows.length; // 13
 * ```
 */
export const DEIDENTIFICATION_METHOD_CODES: {
  readonly contextGroupUid: "1.2.840.10008.6.1.925";
  readonly contextGroupVersion: "20170914";
  readonly rows: readonly DeidentificationMethodCode[];
  readonly profile: DeidentificationMethodCode;
  readonly options: Readonly<Record<DeidentifyOption, DeidentificationMethodCode>>;
} = Object.freeze({
  contextGroupUid: "1.2.840.10008.6.1.925",
  contextGroupVersion: "20170914",
  rows: Object.freeze([
    BASIC_PROFILE,
    CLEAN_PIXEL_DATA,
    CLEAN_RECOGNIZABLE_VISUAL_FEATURES,
    CLEAN_GRAPHICS,
    CLEAN_STRUCTURED_CONTENT,
    CLEAN_DESCRIPTORS,
    RETAIN_TEMPORAL_FULL_DATES,
    RETAIN_TEMPORAL_MODIFIED_DATES,
    RETAIN_PATIENT_CHARACTERISTICS,
    RETAIN_DEVICE_IDENTITY,
    RETAIN_UIDS,
    RETAIN_SAFE_PRIVATE,
    RETAIN_INSTITUTION_IDENTITY,
  ]),
  profile: BASIC_PROFILE,
  options: Object.freeze({
    CleanGraphics: CLEAN_GRAPHICS,
    CleanStructuredContent: CLEAN_STRUCTURED_CONTENT,
    CleanDescriptors: CLEAN_DESCRIPTORS,
    RetainLongitudinalTemporal: RETAIN_TEMPORAL_FULL_DATES,
    RetainLongitudinalTemporalModifiedDates: RETAIN_TEMPORAL_MODIFIED_DATES,
    RetainPatientCharacteristics: RETAIN_PATIENT_CHARACTERISTICS,
    RetainDeviceIdentity: RETAIN_DEVICE_IDENTITY,
    RetainUIDs: RETAIN_UIDS,
    RetainSafePrivate: RETAIN_SAFE_PRIVATE,
    RetainInstitutionIdentity: RETAIN_INSTITUTION_IDENTITY,
  }),
});

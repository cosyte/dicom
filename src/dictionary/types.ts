/**
 * Type definitions for the Phase 1 public Dictionary namespace.
 *
 * Frozen by `.planning/phases/01-project-foundation/01-02-PLAN.md`. Phase 2
 * (parser), Phase 3 (dataset/VR), and Phase 7 (validate) all depend on this
 * shape — schema-breaking changes here cascade through the codebase.
 *
 * @module
 */

/**
 * 8-character uppercase hex DICOM tag, e.g., `"00100010"` (Patient's Name).
 *
 * For repeating-group attribute families (`(50xx,xxxx)` curves, `(60xx,xxxx)`
 * overlays, etc.), the tag string preserves lowercase `x` placeholders verbatim
 * — those entries cannot be looked up by concrete tag and are flagged via
 * {@link DictionaryEntry.repeatingGroup}.
 *
 * @example
 *   const tag: Tag = "00100010"; // Patient's Name
 */
export type Tag = string;

/**
 * The 33 standard DICOM Value Representations from PS3.5 §6.2 plus the 64-bit
 * additions (`OV`, `SV`, `UV`) introduced in DICOM 2018.
 *
 * Note that some attributes in the data dictionary list MULTIPLE possible VRs
 * — see {@link DictionaryEntry.vr} (which is always an array, possibly empty
 * for retired entries with no VR or special "See Note" entries).
 *
 * @example
 *   const vr: VR = "PN"; // Person Name
 */
export type VR =
  | "AE"
  | "AS"
  | "AT"
  | "CS"
  | "DA"
  | "DS"
  | "DT"
  | "FL"
  | "FD"
  | "IS"
  | "LO"
  | "LT"
  | "OB"
  | "OD"
  | "OF"
  | "OL"
  | "OV"
  | "OW"
  | "PN"
  | "SH"
  | "SL"
  | "SQ"
  | "SS"
  | "ST"
  | "SV"
  | "TM"
  | "UC"
  | "UI"
  | "UL"
  | "UN"
  | "UR"
  | "US"
  | "UT"
  | "UV";

/**
 * One DICOM attribute as published in PS3.6 (Data Dictionary).
 *
 * @example
 *   import { Dictionary } from "@cosyte/dicom";
 *   const entry = Dictionary.lookup("00100010");
 *   if (entry) {
 *     // entry.keyword === "PatientName"
 *     // entry.vr      === ["PN"]
 *   }
 */
export interface DictionaryEntry {
  readonly tag: Tag;
  readonly keyword: string;
  readonly name: string;
  readonly vr: readonly VR[];
  readonly vm: string;
  readonly retired: boolean;
  /**
   * `true` for repeating-group families (`(50xx,xxxx)`, `(60xx,xxxx)` —
   * curves/overlays); the {@link DictionaryEntry.tag} field for these contains
   * lowercase `x` placeholders, NOT a concrete 8-hex-char tag. Repeating-group
   * entries are not surfaced by `Dictionary.lookup(tag)` for concrete tags.
   */
  readonly repeatingGroup?: boolean;
}

/**
 * One DICOM UID as published in PS3.6 / PS3.4 (UID registry).
 *
 * @example
 *   import { Dictionary } from "@cosyte/dicom";
 *   const ts = Dictionary.uid("1.2.840.10008.1.2.1");
 *   if (ts) {
 *     // ts.name === "Explicit VR Little Endian"
 *     // ts.type === "TransferSyntax"
 *   }
 */
export interface UidEntry {
  readonly uid: string;
  readonly name: string;
  readonly type:
    | "TransferSyntax"
    | "SOPClass"
    | "MetaSOPClass"
    | "WellKnownFrameOfReference"
    | "WellKnownSOPInstance"
    | "CodingScheme"
    | "ApplicationContext"
    | "ServiceClass"
    | "Other";
  readonly retired: boolean;
}

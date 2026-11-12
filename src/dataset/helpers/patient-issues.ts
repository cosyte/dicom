/**
 * Issue registry for the non-human patient attributes on {@link PatientView}.
 *
 * Veterinary headers are often non-conformant, so the patient view reads species, breed, neutered
 * status and the responsible person tolerantly: nothing here throws, and what the view could not
 * read as written is reported on `patient.issues` with a stable code. An issue's message comes by
 * code from the frozen table below with only the attribute's tag substituted, so it carries no
 * byte of the file's value.
 *
 * @module
 */

import { renderTag } from "../../parser/tokens.js";
import type { PatientIssue } from "./types.js";

/**
 * Stable codes for what the patient view reports about the non-human patient attributes. Compare
 * `issue.code` against a member to narrow.
 *
 * @example
 * ```ts
 * import { parseDicom, PATIENT_ISSUE_CODES } from "@cosyte/dicom";
 * const p = parseDicom(buf).patient;
 * if (p.issues?.some((i) => i.code === PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_NOT_ENUMERATED)) {
 *   // sexNeutered holds a value other than ALTERED or UNALTERED
 * }
 * ```
 */
export const PATIENT_ISSUE_CODES = {
  DICOM_PATIENT_CODE_INCOMPLETE: "DICOM_PATIENT_CODE_INCOMPLETE",
  DICOM_PATIENT_CODE_SEQUENCE_EMPTY: "DICOM_PATIENT_CODE_SEQUENCE_EMPTY",
  DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS: "DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS",
  DICOM_PATIENT_VALUE_NOT_ENUMERATED: "DICOM_PATIENT_VALUE_NOT_ENUMERATED",
  DICOM_PATIENT_VALUE_WRONG_TYPE: "DICOM_PATIENT_VALUE_WRONG_TYPE",
} as const;

/**
 * Discriminant for {@link PatientIssue.code}, so a `switch` over it is exhaustive.
 *
 * @example
 * ```ts
 * import type { PatientIssueCode } from "@cosyte/dicom";
 * const code: PatientIssueCode = "DICOM_PATIENT_CODE_SEQUENCE_EMPTY";
 * ```
 */
export type PatientIssueCode = (typeof PATIENT_ISSUE_CODES)[keyof typeof PATIENT_ISSUE_CODES];

/**
 * The registry text for a code. A `switch`, not a table: a table is built once when the module
 * loads, which the mutation run cannot judge per test.
 */
function messageFor(code: PatientIssueCode): string {
  switch (code) {
    case "DICOM_PATIENT_CODE_INCOMPLETE":
      return "the code item lacks a code value, a coding scheme designator or a code meaning; what it carries is kept";
    case "DICOM_PATIENT_CODE_SEQUENCE_EMPTY":
      return "the code sequence holds no item; the code is left absent";
    case "DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS":
      return "the code sequence holds more than the one item allowed; the first is read";
    case "DICOM_PATIENT_VALUE_NOT_ENUMERATED":
      return "the value is not one of the standard's enumerated values; it is kept as written";
    case "DICOM_PATIENT_VALUE_WRONG_TYPE":
      return "the element is not encoded as its dictionary VR, so its value is not read";
  }
}

/**
 * Build one frozen {@link PatientIssue}: the code, the tag, and the registry message.
 *
 * @internal
 */
export function patientIssue(code: PatientIssueCode, tag: string): PatientIssue {
  return Object.freeze({ code, tag, message: `${renderTag(tag)}: ${messageFor(code)}` });
}

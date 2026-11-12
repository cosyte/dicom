/**
 * Patient-identity view builder (the wrong-patient failure class).
 *
 * Surfaces the `{id, issuer, qualifiers}` tuple plus Other Patient IDs so a
 * caller is never tempted to match on a bare, non-unique `(0010,0020)`, and
 * keeps `PN` in its structured form. For a non-human patient it also reads species, breed,
 * neutered status and the responsible person, tolerantly: a value it cannot read as written is
 * reported on `issues` by code, never thrown.
 *
 * @module
 */

import type { Dataset } from "../dataset.js";
import type { DicomValue } from "../vr/types.js";
import { readCode } from "./coded.js";
import { PATIENT_ISSUE_CODES, patientIssue } from "./patient-issues.js";
import { readDate, readItems, readPersonName, readString } from "./read.js";
import type {
  CodedConcept,
  OtherPatientId,
  PatientIssue,
  PatientView,
  ResponsiblePerson,
} from "./types.js";

const PATIENT_ID: Tag = "00100020";
const ISSUER_OF_PATIENT_ID: Tag = "00100021";
const ISSUER_QUALIFIERS_SEQ: Tag = "00100024";
const OTHER_PATIENT_IDS_SEQ: Tag = "00101002";
const PATIENT_NAME: Tag = "00100010";
const PATIENT_BIRTH_DATE: Tag = "00100030";
const PATIENT_SEX: Tag = "00100040";
const TYPE_OF_PATIENT_ID: Tag = "00100022";
type Tag = string;

function readOtherPatientIds(ds: Dataset): readonly OtherPatientId[] {
  const items = readItems(ds, OTHER_PATIENT_IDS_SEQ);
  if (items === undefined) return [];
  return items.map((item) => {
    const o: { -readonly [K in keyof OtherPatientId]: OtherPatientId[K] } = {};
    const id = readString(item, PATIENT_ID);
    const issuer = readString(item, ISSUER_OF_PATIENT_ID);
    const typeCode = readString(item, TYPE_OF_PATIENT_ID);
    if (id !== undefined) o.id = id;
    if (issuer !== undefined) o.issuer = issuer;
    if (typeCode !== undefined) o.typeCode = typeCode;
    return o;
  });
}

// The non-human attributes' tags are written where they are read, inside the functions below,
// rather than as module constants: a value fixed when the module loads is a mutant the mutation
// run cannot switch per test, so it would go unjudged.

/**
 * The value at `tag` when it decoded to one of `kinds`, the value kinds its dictionary VR gives.
 * Absent or empty is `undefined` with nothing reported. Any other kind (an explicit VR the sender
 * got wrong, or a value left as bytes) is `undefined` with a wrong-type issue. One lookup per tag.
 */
function readValue<K extends DicomValue["kind"]>(
  ds: Dataset,
  tag: Tag,
  kinds: readonly K[],
  issues: PatientIssue[],
): Extract<DicomValue, { kind: K }> | undefined {
  const v = ds.get(tag)?.value;
  if (v === undefined || v.kind === "empty") return undefined;
  if ((kinds as readonly DicomValue["kind"][]).includes(v.kind)) {
    return v as Extract<DicomValue, { kind: K }>;
  }
  issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, tag));
  return undefined;
}

/** A string attribute: the first non-empty value, as `readString` gives it. */
function readTolerantString(ds: Dataset, tag: Tag, issues: PatientIssue[]): string | undefined {
  const v = readValue(ds, tag, ["strings", "text"], issues);
  if (v === undefined) return undefined;
  const text = v.kind === "strings" ? v.values[0] : v.value;
  // A decoded `strings` value always holds at least one value (it is a split), so `text` is never
  // undefined here; the check is for the type checker only.
  // Stryker disable next-line ConditionalExpression: equivalent, `text` is never undefined here
  return text !== undefined && text.length > 0 ? text : undefined;
}

/**
 * The code of a single-item code sequence through {@link readCode}. An empty sequence leaves the
 * code absent; extra items are reported and the first is read; an item with no code value in any
 * of its three forms, no designator beside a non-URN value, or no meaning is reported and kept.
 */
function readCodeSequence(ds: Dataset, tag: Tag, issues: PatientIssue[]): CodedConcept | undefined {
  const items = readValue(ds, tag, ["sequence"], issues)?.items;
  if (items === undefined) return undefined;
  const first = items[0];
  if (first === undefined) {
    issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_SEQUENCE_EMPTY, tag));
    return undefined;
  }
  if (items.length > 1) {
    issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS, tag));
  }
  const code = readCode(first);
  const longValue = readString(first, "00080119"); // Long Code Value
  const urnValue = readString(first, "00080120"); // URN Code Value
  const hasValue =
    code.codeValue !== undefined || longValue !== undefined || urnValue !== undefined;
  const needsDesignator = urnValue === undefined;
  if (
    !hasValue ||
    code.codeMeaning === undefined ||
    (needsDesignator && code.codingSchemeDesignator === undefined)
  ) {
    issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_INCOMPLETE, tag));
  }
  return code;
}

function readResponsiblePerson(ds: Dataset, issues: PatientIssue[]): ResponsiblePerson | undefined {
  const person: { -readonly [K in keyof ResponsiblePerson]: ResponsiblePerson[K] } = {};
  const name = readValue(ds, "00102297", ["personName"], issues)?.values[0]; // Responsible Person
  if (name !== undefined) person.name = name;
  const role = readTolerantString(ds, "00102298", issues); // Responsible Person Role
  const organization = readTolerantString(ds, "00102299", issues); // Responsible Organization
  if (role !== undefined) person.role = role;
  if (organization !== undefined) person.organization = organization;
  return Object.keys(person).length > 0 ? person : undefined;
}

/**
 * Read the non-human patient attributes onto `view`. Nothing here throws; what cannot be read as
 * written is left absent or kept as written, and reported on `view.issues`.
 */
function readAnimalAttributes(
  ds: Dataset,
  view: { -readonly [K in keyof PatientView]: PatientView[K] },
): void {
  const issues: PatientIssue[] = [];
  // Patient Species Description and Patient Species Code Sequence.
  const speciesDescription = readTolerantString(ds, "00102201", issues);
  const speciesCode = readCodeSequence(ds, "00102202", issues);
  // Patient's Sex Neutered, whose enumerated values are ALTERED and UNALTERED (PS3.3, Patient
  // Module). Another value is kept as written and reported.
  const neuteredTag = "00102203";
  const sexNeutered = readTolerantString(ds, neuteredTag, issues);
  if (sexNeutered !== undefined && sexNeutered !== "ALTERED" && sexNeutered !== "UNALTERED") {
    issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_NOT_ENUMERATED, neuteredTag));
  }
  // Patient Breed Description and Patient Breed Code Sequence.
  const breedDescription = readTolerantString(ds, "00102292", issues);
  const breedCode = readCodeSequence(ds, "00102293", issues);
  const responsiblePerson = readResponsiblePerson(ds, issues);
  if (speciesDescription !== undefined) view.speciesDescription = speciesDescription;
  if (speciesCode !== undefined) view.speciesCode = speciesCode;
  if (sexNeutered !== undefined) view.sexNeutered = sexNeutered;
  if (breedDescription !== undefined) view.breedDescription = breedDescription;
  if (breedCode !== undefined) view.breedCode = breedCode;
  if (responsiblePerson !== undefined) view.responsiblePerson = responsiblePerson;
  if (issues.length > 0) view.issues = Object.freeze(issues);
}

/**
 * Build the {@link PatientView} for a dataset. Every field is fail-safe
 * typed-absent; `otherIds` is always an array (possibly empty).
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const p = parseDicom(buf).patient;
 * if (p.id !== undefined && p.issuerOfId === undefined) {
 *   // do NOT treat p.id as globally unique
 * }
 * ```
 */
export function buildPatient(ds: Dataset): PatientView {
  const view: { -readonly [K in keyof PatientView]: PatientView[K] } = {
    otherIds: readOtherPatientIds(ds),
  };
  const id = readString(ds, PATIENT_ID);
  const issuerOfId = readString(ds, ISSUER_OF_PATIENT_ID);
  const issuerQualifiers = readItems(ds, ISSUER_QUALIFIERS_SEQ);
  const name = readPersonName(ds, PATIENT_NAME);
  const birthDate = readDate(ds, PATIENT_BIRTH_DATE);
  const sex = readString(ds, PATIENT_SEX);
  if (id !== undefined) view.id = id;
  if (issuerOfId !== undefined) view.issuerOfId = issuerOfId;
  if (issuerQualifiers !== undefined) view.issuerQualifiers = issuerQualifiers;
  if (name !== undefined) view.name = name;
  if (birthDate !== undefined) view.birthDate = birthDate;
  if (sex !== undefined) view.sex = sex;
  readAnimalAttributes(ds, view);
  return view;
}

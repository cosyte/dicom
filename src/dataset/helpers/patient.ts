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
const SPECIES_DESCRIPTION: Tag = "00102201";
const SPECIES_CODE_SEQ: Tag = "00102202";
const SEX_NEUTERED: Tag = "00102203";
const BREED_DESCRIPTION: Tag = "00102292";
const BREED_CODE_SEQ: Tag = "00102293";
const RESPONSIBLE_PERSON: Tag = "00102297";
const RESPONSIBLE_PERSON_ROLE: Tag = "00102298";
const RESPONSIBLE_ORGANIZATION: Tag = "00102299";
const LONG_CODE_VALUE: Tag = "00080119";
const URN_CODE_VALUE: Tag = "00080120";

/** Patient's Sex Neutered's enumerated values (PS3.3, Patient Module). */
const SEX_NEUTERED_VALUES: ReadonlySet<string> = new Set(["ALTERED", "UNALTERED"]);

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

/**
 * Whether the element at `tag` is present but decoded to a value kind other than the ones its
 * dictionary VR gives: an explicit VR the sender got wrong, or a value left as bytes. An empty
 * value is absent, not wrong.
 */
function wrongType(ds: Dataset, tag: Tag, kinds: readonly DicomValue["kind"][]): boolean {
  const v = ds.get(tag)?.value;
  return v !== undefined && v.kind !== "empty" && !kinds.includes(v.kind);
}

const STRING_KINDS: readonly DicomValue["kind"][] = ["strings", "text"];

/** A string attribute, with a wrong-type issue when it is present in a form that is not text. */
function readTolerantString(ds: Dataset, tag: Tag, issues: PatientIssue[]): string | undefined {
  if (wrongType(ds, tag, STRING_KINDS)) {
    issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, tag));
    return undefined;
  }
  return readString(ds, tag);
}

/**
 * The code of a single-item code sequence through {@link readCode}. An empty sequence leaves the
 * code absent; extra items are reported and the first is read; an item with no code value in any
 * of its three forms, no designator beside a non-URN value, or no meaning is reported and kept.
 */
function readCodeSequence(ds: Dataset, tag: Tag, issues: PatientIssue[]): CodedConcept | undefined {
  if (wrongType(ds, tag, ["sequence"])) {
    issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, tag));
    return undefined;
  }
  const items = readItems(ds, tag);
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
  const longValue = readString(first, LONG_CODE_VALUE);
  const urnValue = readString(first, URN_CODE_VALUE);
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
  if (wrongType(ds, RESPONSIBLE_PERSON, ["personName"])) {
    issues.push(
      patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, RESPONSIBLE_PERSON),
    );
  } else {
    const name = readPersonName(ds, RESPONSIBLE_PERSON);
    if (name !== undefined) person.name = name;
  }
  const role = readTolerantString(ds, RESPONSIBLE_PERSON_ROLE, issues);
  const organization = readTolerantString(ds, RESPONSIBLE_ORGANIZATION, issues);
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
  const speciesDescription = readTolerantString(ds, SPECIES_DESCRIPTION, issues);
  const speciesCode = readCodeSequence(ds, SPECIES_CODE_SEQ, issues);
  const sexNeutered = readTolerantString(ds, SEX_NEUTERED, issues);
  if (sexNeutered !== undefined && !SEX_NEUTERED_VALUES.has(sexNeutered)) {
    issues.push(patientIssue(PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_NOT_ENUMERATED, SEX_NEUTERED));
  }
  const breedDescription = readTolerantString(ds, BREED_DESCRIPTION, issues);
  const breedCode = readCodeSequence(ds, BREED_CODE_SEQ, issues);
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

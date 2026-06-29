/**
 * Patient-identity view builder (§4.1 — the wrong-patient failure class).
 *
 * Surfaces the `{id, issuer, qualifiers}` tuple plus Other Patient IDs so a
 * caller is never tempted to match on a bare, non-unique `(0010,0020)`, and
 * keeps `PN` in its structured form.
 *
 * @module
 */

import type { Dataset } from "../dataset.js";
import { readDate, readItems, readPersonName, readString } from "./read.js";
import type { OtherPatientId, PatientView } from "./types.js";

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
  return view;
}

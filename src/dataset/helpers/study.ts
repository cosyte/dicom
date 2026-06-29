/**
 * Study-identity view builder (§4.1 — the wrong-patient/wrong-study class).
 *
 * `instanceUid` is the cross-system study key; `accessionNumber` ties the
 * study back to the placer/filler order. Every field is fail-safe
 * typed-absent — a missing value is `undefined`, never a substituted
 * default.
 *
 * @module
 */

import type { Dataset } from "../dataset.js";
import { readDate, readString, readTime } from "./read.js";
import type { StudyView } from "./types.js";

const STUDY_INSTANCE_UID: Tag = "0020000D";
const STUDY_ID: Tag = "00200010";
const ACCESSION_NUMBER: Tag = "00080050";
const STUDY_DATE: Tag = "00080020";
const STUDY_TIME: Tag = "00080030";
const STUDY_DESCRIPTION: Tag = "00081030";

type Tag = string;

/**
 * Build the {@link StudyView} for a dataset. Every field is fail-safe
 * typed-absent.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const s = parseDicom(buf).study;
 * s.instanceUid;     // "1.2.840.113619..." — the cross-system study key
 * s.accessionNumber; // "ACC123"
 * ```
 */
export function buildStudy(ds: Dataset): StudyView {
  const view: { -readonly [K in keyof StudyView]: StudyView[K] } = {};
  const instanceUid = readString(ds, STUDY_INSTANCE_UID);
  const id = readString(ds, STUDY_ID);
  const accessionNumber = readString(ds, ACCESSION_NUMBER);
  const date = readDate(ds, STUDY_DATE);
  const time = readTime(ds, STUDY_TIME);
  const description = readString(ds, STUDY_DESCRIPTION);
  if (instanceUid !== undefined) view.instanceUid = instanceUid;
  if (id !== undefined) view.id = id;
  if (accessionNumber !== undefined) view.accessionNumber = accessionNumber;
  if (date !== undefined) view.date = date;
  if (time !== undefined) view.time = time;
  if (description !== undefined) view.description = description;
  return view;
}

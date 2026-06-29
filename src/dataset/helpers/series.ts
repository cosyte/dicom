/**
 * Series-identity & co-registration view builder (§4.1, §4.3).
 *
 * `instanceUid` is the cross-system series key; images that share a
 * `frameOfReferenceUid` are spatially co-registered and may be fused.
 * Every field is fail-safe typed-absent.
 *
 * @module
 */

import type { Dataset } from "../dataset.js";
import { readNumber, readString } from "./read.js";
import type { SeriesView } from "./types.js";

const SERIES_INSTANCE_UID: Tag = "0020000E";
const SERIES_NUMBER: Tag = "00200011";
const MODALITY: Tag = "00080060";
const SERIES_DESCRIPTION: Tag = "0008103E";
const FRAME_OF_REFERENCE_UID: Tag = "00200052";

type Tag = string;

/**
 * Build the {@link SeriesView} for a dataset. Every field is fail-safe
 * typed-absent.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const s = parseDicom(buf).series;
 * s.modality;            // "CT"
 * s.frameOfReferenceUid; // shared ⇒ co-registered with peers
 * ```
 */
export function buildSeries(ds: Dataset): SeriesView {
  const view: { -readonly [K in keyof SeriesView]: SeriesView[K] } = {};
  const instanceUid = readString(ds, SERIES_INSTANCE_UID);
  const number = readNumber(ds, SERIES_NUMBER);
  const modality = readString(ds, MODALITY);
  const description = readString(ds, SERIES_DESCRIPTION);
  const frameOfReferenceUid = readString(ds, FRAME_OF_REFERENCE_UID);
  if (instanceUid !== undefined) view.instanceUid = instanceUid;
  if (number !== undefined) view.number = number;
  if (modality !== undefined) view.modality = modality;
  if (description !== undefined) view.description = description;
  if (frameOfReferenceUid !== undefined) view.frameOfReferenceUid = frameOfReferenceUid;
  return view;
}

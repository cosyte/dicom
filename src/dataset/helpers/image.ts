/**
 * Pixel-interpretation + geometry view builder (§4.2 / §4.3 / §4.4 / §4.5).
 *
 * This is the "wrong pixels look fine" / "looks fine, measures wrong"
 * surface. v1 does **not** decode pixels — it surfaces exactly the metadata
 * a renderer needs so it never has to guess. Every safety-critical omission
 * is deliberate and load-bearing:
 *
 *   - `rescaleSlope` is **absent** (not `1`) when `(0028,1053)` is absent;
 *   - `signed` is **absent** (not a guess) unless `(0028,0103)` was present,
 *     and is then exactly `1 → true` / `0 → false`;
 *   - `photometricInterpretation` is **absent** (not `MONOCHROME2`) when
 *     absent — MONOCHROME1 vs MONOCHROME2 is an inversion, never defaulted;
 *   - the three pixel-spacing tags are three **distinct** fields, never
 *     aliased (patient-plane vs detector-plane vs nominal-scanned).
 *
 * @module
 */

import type { Dataset } from "../dataset.js";
import { readCode } from "./coded.js";
import { hasFunctionalGroups, resolveFrame } from "./functional-groups.js";
import { readItems, readNumber, readNumberArray, readString } from "./read.js";
import type { FrameFunctionalGroups, ImageView, RealWorldValueMap } from "./types.js";

const SOP_INSTANCE_UID: Tag = "00080018";
const ROWS: Tag = "00280010";
const COLUMNS: Tag = "00280011";
const SAMPLES_PER_PIXEL: Tag = "00280002";
const PHOTOMETRIC_INTERPRETATION: Tag = "00280004";
const PLANAR_CONFIGURATION: Tag = "00280006";
const BITS_ALLOCATED: Tag = "00280100";
const BITS_STORED: Tag = "00280101";
const HIGH_BIT: Tag = "00280102";
const PIXEL_REPRESENTATION: Tag = "00280103";
const RESCALE_SLOPE: Tag = "00281053";
const RESCALE_INTERCEPT: Tag = "00281052";
const RESCALE_TYPE: Tag = "00281054";
const WINDOW_CENTER: Tag = "00281050";
const WINDOW_WIDTH: Tag = "00281051";
const MODALITY_LUT_SEQ: Tag = "00283000";
const VOI_LUT_SEQ: Tag = "00283010";
const PIXEL_SPACING: Tag = "00280030";
const IMAGER_PIXEL_SPACING: Tag = "00181164";
const NOMINAL_SCANNED_PIXEL_SPACING: Tag = "00182010";
const SLICE_THICKNESS: Tag = "00180050";
const SPACING_BETWEEN_SLICES: Tag = "00180088";
const IMAGE_POSITION_PATIENT: Tag = "00200032";
const IMAGE_ORIENTATION_PATIENT: Tag = "00200037";
const FRAME_OF_REFERENCE_UID: Tag = "00200052";
const NUMBER_OF_FRAMES: Tag = "00280008";
const UNITS: Tag = "00541001";
const REAL_WORLD_VALUE_MAPPING_SEQ: Tag = "00409096";
const REAL_WORLD_VALUE_SLOPE: Tag = "00409225";
const REAL_WORLD_VALUE_INTERCEPT: Tag = "00409224";
const MEASUREMENT_UNITS_CODE_SEQ: Tag = "004008EA";

type Tag = string;

function readRealWorldValueMaps(ds: Dataset): readonly RealWorldValueMap[] | undefined {
  const items = readItems(ds, REAL_WORLD_VALUE_MAPPING_SEQ);
  if (items === undefined) return undefined;
  return items.map((item) => {
    const map: { -readonly [K in keyof RealWorldValueMap]: RealWorldValueMap[K] } = {};
    const slope = readNumber(item, REAL_WORLD_VALUE_SLOPE);
    const intercept = readNumber(item, REAL_WORLD_VALUE_INTERCEPT);
    const unitsItem = readItems(item, MEASUREMENT_UNITS_CODE_SEQ)?.[0];
    if (slope !== undefined) map.slope = slope;
    if (intercept !== undefined) map.intercept = intercept;
    if (unitsItem !== undefined) map.unitsCode = readCode(unitsItem);
    return map;
  });
}

/**
 * Build the {@link ImageView} for a dataset. Every field is fail-safe
 * typed-absent; the safety-critical omissions documented on
 * {@link ImageView} are preserved exactly.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const img = parseDicom(buf).image;
 * img.rescaleSlope; // undefined ⇒ caller MUST NOT assume 1
 * img.signed;       // undefined ⇒ signedness unknown, never guess
 * ```
 */
export function buildImage(ds: Dataset): ImageView {
  const isEnhancedMultiFrame = hasFunctionalGroups(ds);
  const numberOfFrames = readNumber(ds, NUMBER_OF_FRAMES);
  const frameBound = numberOfFrames ?? 1;

  const view: { -readonly [K in keyof ImageView]: ImageView[K] } = {
    isEnhancedMultiFrame,
    frame(index: number): FrameFunctionalGroups {
      return resolveFrame(ds, index, frameBound);
    },
  };

  const sopInstanceUid = readString(ds, SOP_INSTANCE_UID);
  const rows = readNumber(ds, ROWS);
  const columns = readNumber(ds, COLUMNS);
  const samplesPerPixel = readNumber(ds, SAMPLES_PER_PIXEL);
  const photometricInterpretation = readString(ds, PHOTOMETRIC_INTERPRETATION);
  const planarConfiguration = readNumber(ds, PLANAR_CONFIGURATION);
  const bitsAllocated = readNumber(ds, BITS_ALLOCATED);
  const bitsStored = readNumber(ds, BITS_STORED);
  const highBit = readNumber(ds, HIGH_BIT);
  const pixelRepresentation = readNumber(ds, PIXEL_REPRESENTATION);
  const rescaleSlope = readNumber(ds, RESCALE_SLOPE);
  const rescaleIntercept = readNumber(ds, RESCALE_INTERCEPT);
  const rescaleType = readString(ds, RESCALE_TYPE);
  const windowCenter = readNumberArray(ds, WINDOW_CENTER);
  const windowWidth = readNumberArray(ds, WINDOW_WIDTH);
  const modalityLutSequence = readItems(ds, MODALITY_LUT_SEQ);
  const voiLutSequence = readItems(ds, VOI_LUT_SEQ);
  const pixelSpacing = readNumberArray(ds, PIXEL_SPACING);
  const imagerPixelSpacing = readNumberArray(ds, IMAGER_PIXEL_SPACING);
  const nominalScannedPixelSpacing = readNumberArray(ds, NOMINAL_SCANNED_PIXEL_SPACING);
  const sliceThickness = readNumber(ds, SLICE_THICKNESS);
  const spacingBetweenSlices = readNumber(ds, SPACING_BETWEEN_SLICES);
  const imagePositionPatient = readNumberArray(ds, IMAGE_POSITION_PATIENT);
  const imageOrientationPatient = readNumberArray(ds, IMAGE_ORIENTATION_PATIENT);
  const frameOfReferenceUid = readString(ds, FRAME_OF_REFERENCE_UID);
  const units = readString(ds, UNITS);
  const realWorldValueMaps = readRealWorldValueMaps(ds);

  if (sopInstanceUid !== undefined) view.sopInstanceUid = sopInstanceUid;
  if (rows !== undefined) view.rows = rows;
  if (columns !== undefined) view.columns = columns;
  if (samplesPerPixel !== undefined) view.samplesPerPixel = samplesPerPixel;
  if (photometricInterpretation !== undefined)
    view.photometricInterpretation = photometricInterpretation;
  if (planarConfiguration !== undefined) view.planarConfiguration = planarConfiguration;
  if (bitsAllocated !== undefined) view.bitsAllocated = bitsAllocated;
  if (bitsStored !== undefined) view.bitsStored = bitsStored;
  if (highBit !== undefined) view.highBit = highBit;
  if (pixelRepresentation !== undefined) {
    view.pixelRepresentation = pixelRepresentation;
    // `signed` derives ONLY from a present (0028,0103): 1 → true, 0 → false;
    // any other value leaves both raw field set and `signed` unguessed.
    if (pixelRepresentation === 0) view.signed = false;
    else if (pixelRepresentation === 1) view.signed = true;
  }
  if (rescaleSlope !== undefined) view.rescaleSlope = rescaleSlope;
  if (rescaleIntercept !== undefined) view.rescaleIntercept = rescaleIntercept;
  if (rescaleType !== undefined) view.rescaleType = rescaleType;
  if (windowCenter !== undefined) view.windowCenter = windowCenter;
  if (windowWidth !== undefined) view.windowWidth = windowWidth;
  if (modalityLutSequence !== undefined) view.modalityLutSequence = modalityLutSequence;
  if (voiLutSequence !== undefined) view.voiLutSequence = voiLutSequence;
  if (pixelSpacing !== undefined) view.pixelSpacing = pixelSpacing;
  if (imagerPixelSpacing !== undefined) view.imagerPixelSpacing = imagerPixelSpacing;
  if (nominalScannedPixelSpacing !== undefined)
    view.nominalScannedPixelSpacing = nominalScannedPixelSpacing;
  if (sliceThickness !== undefined) view.sliceThickness = sliceThickness;
  if (spacingBetweenSlices !== undefined) view.spacingBetweenSlices = spacingBetweenSlices;
  if (imagePositionPatient !== undefined) view.imagePositionPatient = imagePositionPatient;
  if (imageOrientationPatient !== undefined) view.imageOrientationPatient = imageOrientationPatient;
  if (frameOfReferenceUid !== undefined) view.frameOfReferenceUid = frameOfReferenceUid;
  if (numberOfFrames !== undefined) view.numberOfFrames = numberOfFrames;
  if (units !== undefined) view.units = units;
  if (realWorldValueMaps !== undefined) view.realWorldValueMaps = realWorldValueMaps;

  return view;
}

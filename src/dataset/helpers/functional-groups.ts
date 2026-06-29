/**
 * Enhanced multi-frame functional-group resolution (§4.4, PS3.3 §C.7.6.16).
 *
 * An Enhanced object carries two parallel structures:
 *
 *   - Per-Frame Functional Groups Sequence `(5200,9230)` — one item per
 *     frame, holding the macros that vary frame-to-frame;
 *   - Shared Functional Groups Sequence `(5200,9229)` — a single item with
 *     the macros constant across every frame.
 *
 * A frame's value for any macro is resolved **Per-Frame-else-Shared**: look
 * in this frame's per-frame item first, then fall back to the shared item.
 * Each macro is itself a single-item nested sequence. The three *geometry*
 * macros (Pixel Measures, Plane Position, Plane Orientation) are required
 * for an enhanced object — if one is absent from *both* groups the frame
 * cannot be placed and we throw {@link DicomValueError}
 * `MISSING_REQUIRED_FUNCTIONAL_GROUP` rather than silently mis-locate it.
 *
 * @module
 */

import type { Dataset } from "../dataset.js";
import type { Item } from "../item.js";
import { DicomValueError } from "./errors.js";
import { readNumber, readNumberArray, readItems, readString } from "./read.js";
import type { FrameFunctionalGroups } from "./types.js";

const PER_FRAME_FG_SEQ: Tag = "52009230";
const SHARED_FG_SEQ: Tag = "52009229";

const PIXEL_MEASURES_SEQ: Tag = "00289110";
const PLANE_POSITION_SEQ: Tag = "00209113";
const PLANE_ORIENTATION_SEQ: Tag = "00209116";
const PIXEL_VALUE_TRANSFORMATION_SEQ: Tag = "00289145";
const FRAME_VOI_LUT_SEQ: Tag = "00289132";

const PIXEL_SPACING: Tag = "00280030";
const SLICE_THICKNESS: Tag = "00180050";
const SPACING_BETWEEN_SLICES: Tag = "00180088";
const IMAGE_POSITION_PATIENT: Tag = "00200032";
const IMAGE_ORIENTATION_PATIENT: Tag = "00200037";
const RESCALE_SLOPE: Tag = "00281053";
const RESCALE_INTERCEPT: Tag = "00281052";
const RESCALE_TYPE: Tag = "00281054";
const WINDOW_CENTER: Tag = "00281050";
const WINDOW_WIDTH: Tag = "00281051";

type Tag = string;

/**
 * `true` when this dataset carries either functional-group sequence
 * (Per-Frame `(5200,9230)` or Shared `(5200,9229)`) — i.e. it is an
 * Enhanced multi-frame object.
 *
 * @example
 * ```ts
 * import { parseDicom, hasFunctionalGroups } from "@cosyte/dicom";
 * hasFunctionalGroups(parseDicom(enhancedBuf)); // true
 * ```
 */
export function hasFunctionalGroups(ds: Dataset): boolean {
  return ds.has(PER_FRAME_FG_SEQ) || ds.has(SHARED_FG_SEQ);
}

/**
 * Resolve one macro's single item Per-Frame-else-Shared: the first item of
 * the macro sequence on this frame's per-frame group, else on the shared
 * group, else `undefined`.
 */
function resolveMacroItem(
  perFrameItem: Item | undefined,
  sharedItem: Item | undefined,
  macroTag: Tag,
): Item | undefined {
  if (perFrameItem !== undefined) {
    const fromFrame = readItems(perFrameItem, macroTag)?.[0];
    if (fromFrame !== undefined) return fromFrame;
  }
  if (sharedItem !== undefined) return readItems(sharedItem, macroTag)?.[0];
  return undefined;
}

function buildPixelMeasures(item: Item): NonNullable<FrameFunctionalGroups["pixelMeasures"]> {
  const out: {
    -readonly [K in keyof NonNullable<FrameFunctionalGroups["pixelMeasures"]>]: NonNullable<
      FrameFunctionalGroups["pixelMeasures"]
    >[K];
  } = {};
  const pixelSpacing = readNumberArray(item, PIXEL_SPACING);
  const sliceThickness = readNumber(item, SLICE_THICKNESS);
  const spacingBetweenSlices = readNumber(item, SPACING_BETWEEN_SLICES);
  if (pixelSpacing !== undefined) out.pixelSpacing = pixelSpacing;
  if (sliceThickness !== undefined) out.sliceThickness = sliceThickness;
  if (spacingBetweenSlices !== undefined) out.spacingBetweenSlices = spacingBetweenSlices;
  return out;
}

function buildPlanePosition(item: Item): NonNullable<FrameFunctionalGroups["planePosition"]> {
  const out: {
    -readonly [K in keyof NonNullable<FrameFunctionalGroups["planePosition"]>]: NonNullable<
      FrameFunctionalGroups["planePosition"]
    >[K];
  } = {};
  const imagePositionPatient = readNumberArray(item, IMAGE_POSITION_PATIENT);
  if (imagePositionPatient !== undefined) out.imagePositionPatient = imagePositionPatient;
  return out;
}

function buildPlaneOrientation(item: Item): NonNullable<FrameFunctionalGroups["planeOrientation"]> {
  const out: {
    -readonly [K in keyof NonNullable<FrameFunctionalGroups["planeOrientation"]>]: NonNullable<
      FrameFunctionalGroups["planeOrientation"]
    >[K];
  } = {};
  const imageOrientationPatient = readNumberArray(item, IMAGE_ORIENTATION_PATIENT);
  if (imageOrientationPatient !== undefined) out.imageOrientationPatient = imageOrientationPatient;
  return out;
}

function buildPixelValueTransformation(
  item: Item,
): NonNullable<FrameFunctionalGroups["pixelValueTransformation"]> {
  const out: {
    -readonly [K in keyof NonNullable<
      FrameFunctionalGroups["pixelValueTransformation"]
    >]: NonNullable<FrameFunctionalGroups["pixelValueTransformation"]>[K];
  } = {};
  const rescaleSlope = readNumber(item, RESCALE_SLOPE);
  const rescaleIntercept = readNumber(item, RESCALE_INTERCEPT);
  const rescaleType = readString(item, RESCALE_TYPE);
  if (rescaleSlope !== undefined) out.rescaleSlope = rescaleSlope;
  if (rescaleIntercept !== undefined) out.rescaleIntercept = rescaleIntercept;
  if (rescaleType !== undefined) out.rescaleType = rescaleType;
  return out;
}

function buildFrameVoiLut(item: Item): NonNullable<FrameFunctionalGroups["frameVoiLut"]> {
  const out: {
    -readonly [K in keyof NonNullable<FrameFunctionalGroups["frameVoiLut"]>]: NonNullable<
      FrameFunctionalGroups["frameVoiLut"]
    >[K];
  } = {};
  const windowCenter = readNumberArray(item, WINDOW_CENTER);
  const windowWidth = readNumberArray(item, WINDOW_WIDTH);
  if (windowCenter !== undefined) out.windowCenter = windowCenter;
  if (windowWidth !== undefined) out.windowWidth = windowWidth;
  return out;
}

/**
 * Resolve the {@link FrameFunctionalGroups} for frame `index` of an
 * Enhanced multi-frame object, Per-Frame-else-Shared.
 *
 * @throws {@link DicomValueError} `FRAME_INDEX_OUT_OF_RANGE` when `index`
 *   is outside `[0, numberOfFrames)`, and `MISSING_REQUIRED_FUNCTIONAL_GROUP`
 *   when a required geometry macro (Pixel Measures / Plane Position / Plane
 *   Orientation) is absent from both the per-frame and shared groups.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const f = parseDicom(enhancedBuf).image.frame(0);
 * f.planePosition?.imagePositionPatient; // this frame's [x,y,z]
 * f.pixelMeasures?.pixelSpacing;         // this frame's [row,col] mm
 * ```
 */
export function resolveFrame(
  ds: Dataset,
  index: number,
  numberOfFrames: number,
): FrameFunctionalGroups {
  if (!Number.isInteger(index) || index < 0 || index >= numberOfFrames) {
    throw new DicomValueError(
      "FRAME_INDEX_OUT_OF_RANGE",
      `frame index ${String(index)} is outside [0, ${String(numberOfFrames)})`,
    );
  }

  const perFrameItem = readItems(ds, PER_FRAME_FG_SEQ)?.[index];
  const sharedItem = readItems(ds, SHARED_FG_SEQ)?.[0];

  const pixelMeasuresItem = resolveMacroItem(perFrameItem, sharedItem, PIXEL_MEASURES_SEQ);
  const planePositionItem = resolveMacroItem(perFrameItem, sharedItem, PLANE_POSITION_SEQ);
  const planeOrientationItem = resolveMacroItem(perFrameItem, sharedItem, PLANE_ORIENTATION_SEQ);
  const pixelValueTransformationItem = resolveMacroItem(
    perFrameItem,
    sharedItem,
    PIXEL_VALUE_TRANSFORMATION_SEQ,
  );
  const frameVoiLutItem = resolveMacroItem(perFrameItem, sharedItem, FRAME_VOI_LUT_SEQ);

  if (pixelMeasuresItem === undefined) {
    throw new DicomValueError(
      "MISSING_REQUIRED_FUNCTIONAL_GROUP",
      `frame ${String(index)} lacks the required Pixel Measures macro (0028,9110) in both groups`,
    );
  }
  if (planePositionItem === undefined) {
    throw new DicomValueError(
      "MISSING_REQUIRED_FUNCTIONAL_GROUP",
      `frame ${String(index)} lacks the required Plane Position macro (0020,9113) in both groups`,
    );
  }
  if (planeOrientationItem === undefined) {
    throw new DicomValueError(
      "MISSING_REQUIRED_FUNCTIONAL_GROUP",
      `frame ${String(index)} lacks the required Plane Orientation macro (0020,9116) in both groups`,
    );
  }

  const frame: { -readonly [K in keyof FrameFunctionalGroups]: FrameFunctionalGroups[K] } = {
    index,
    pixelMeasures: buildPixelMeasures(pixelMeasuresItem),
    planePosition: buildPlanePosition(planePositionItem),
    planeOrientation: buildPlaneOrientation(planeOrientationItem),
  };
  if (pixelValueTransformationItem !== undefined) {
    frame.pixelValueTransformation = buildPixelValueTransformation(pixelValueTransformationItem);
  }
  if (frameVoiLutItem !== undefined) {
    frame.frameVoiLut = buildFrameVoiLut(frameVoiLutItem);
  }
  return frame;
}

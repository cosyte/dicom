import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { DicomValueError, parseDicom } from "../../index.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../../../test/helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

function ascii(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ", "ascii")]);
}

const pixelMeasuresShared: BuildDicomSqElement = {
  tag: "00289110",
  items: [
    {
      elements: [
        { tag: "00280030", vr: "DS", value: ascii("0.5\\0.5") },
        { tag: "00180050", vr: "DS", value: ascii("1.0") },
      ],
    },
  ],
};
const planeOrientationShared: BuildDicomSqElement = {
  tag: "00209116",
  items: [{ elements: [{ tag: "00200037", vr: "DS", value: ascii("1\\0\\0\\0\\1\\0") }] }],
};
function planePositionPerFrame(z: string): BuildDicomSqElement {
  return {
    tag: "00209113",
    items: [{ elements: [{ tag: "00200032", vr: "DS", value: ascii(`0\\0\\${z}`) }] }],
  };
}
const planePositionShared: BuildDicomSqElement = {
  tag: "00209113",
  items: [{ elements: [{ tag: "00200032", vr: "DS", value: ascii("0\\0\\0") }] }],
};
// Pixel Value Transformation macro (0028,9145) — an optional functional group.
const pixelValueTransformation: BuildDicomSqElement = {
  tag: "00289145",
  items: [
    {
      elements: [
        { tag: "00281053", vr: "DS", value: ascii("2.5") }, // Rescale Slope
        { tag: "00281052", vr: "DS", value: ascii("-1024") }, // Rescale Intercept
        { tag: "00281054", vr: "LO", value: ascii("HU") }, // Rescale Type
      ],
    },
  ],
};
// Frame VOI LUT macro (0028,9132) — an optional functional group.
const frameVoiLut: BuildDicomSqElement = {
  tag: "00289132",
  items: [
    {
      elements: [
        { tag: "00281050", vr: "DS", value: ascii("40") }, // Window Center
        { tag: "00281051", vr: "DS", value: ascii("400") }, // Window Width
      ],
    },
  ],
};

function enhanced(opts: {
  readonly numberOfFrames?: string;
  readonly shared?: readonly (BuildDicomElement | BuildDicomSqElement)[];
  readonly perFrame: readonly (readonly (BuildDicomElement | BuildDicomSqElement)[])[];
}) {
  const elements: (BuildDicomElement | BuildDicomSqElement)[] = [];
  if (opts.numberOfFrames !== undefined) {
    elements.push({ tag: "00280008", vr: "IS", value: ascii(opts.numberOfFrames) });
  }
  if (opts.shared !== undefined) {
    elements.push({ tag: "52009229", items: [{ elements: opts.shared }] });
  }
  elements.push({
    tag: "52009230",
    items: opts.perFrame.map((els) => ({ elements: els })),
  });
  return parseDicom(buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements }));
}

describe("resolveFrame (§4.4 enhanced multi-frame, Per-Frame-else-Shared)", () => {
  it("resolves geometry macros per-frame, falling back to shared", () => {
    const ds = enhanced({
      numberOfFrames: "2",
      shared: [pixelMeasuresShared, planeOrientationShared],
      perFrame: [[planePositionPerFrame("0")], [planePositionPerFrame("1")]],
    });
    expect(ds.image.isEnhancedMultiFrame).toBe(true);

    const f0 = ds.image.frame(0);
    expect(f0.index).toBe(0);
    expect(f0.planePosition?.imagePositionPatient).toEqual([0, 0, 0]);
    expect(f0.pixelMeasures?.pixelSpacing).toEqual([0.5, 0.5]); // from shared
    expect(f0.planeOrientation?.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);

    const f1 = ds.image.frame(1);
    expect(f1.planePosition?.imagePositionPatient).toEqual([0, 0, 1]); // per-frame varies
  });

  it("a per-frame macro overrides the shared one for that frame", () => {
    const perFramePixelMeasures: BuildDicomSqElement = {
      tag: "00289110",
      items: [{ elements: [{ tag: "00280030", vr: "DS", value: ascii("0.9\\0.9") }] }],
    };
    const ds = enhanced({
      numberOfFrames: "1",
      shared: [pixelMeasuresShared, planeOrientationShared],
      perFrame: [[planePositionPerFrame("0"), perFramePixelMeasures]],
    });
    expect(ds.image.frame(0).pixelMeasures?.pixelSpacing).toEqual([0.9, 0.9]);
  });

  it("throws FRAME_INDEX_OUT_OF_RANGE for an index outside [0, numberOfFrames)", () => {
    const ds = enhanced({
      numberOfFrames: "2",
      shared: [pixelMeasuresShared, planeOrientationShared],
      perFrame: [[planePositionPerFrame("0")], [planePositionPerFrame("1")]],
    });
    expect(() => ds.image.frame(2)).toThrow(DicomValueError);
    expect(() => ds.image.frame(-1)).toThrow(/FRAME_INDEX_OUT_OF_RANGE/u);
  });

  it("throws MISSING_REQUIRED_FUNCTIONAL_GROUP when a geometry macro is absent in both groups", () => {
    // Plane Position present in neither shared nor per-frame.
    const ds = enhanced({
      numberOfFrames: "1",
      shared: [pixelMeasuresShared, planeOrientationShared],
      perFrame: [[]],
    });
    expect(() => ds.image.frame(0)).toThrow(DicomValueError);
    try {
      ds.image.frame(0);
    } catch (err) {
      expect(err).toBeInstanceOf(DicomValueError);
      if (err instanceof DicomValueError) {
        expect(err.code).toBe("MISSING_REQUIRED_FUNCTIONAL_GROUP");
        // PHI discipline: message carries only structural facts, no values.
        expect(err.message).toContain("Plane Position");
      }
    }
  });

  it("throws MISSING_REQUIRED_FUNCTIONAL_GROUP naming Pixel Measures when it is absent in both groups", () => {
    // Pixel Measures (the first required geometry macro checked) present nowhere.
    const ds = enhanced({
      numberOfFrames: "1",
      shared: [planeOrientationShared],
      perFrame: [[planePositionPerFrame("0")]],
    });
    try {
      ds.image.frame(0);
      expect.unreachable("frame(0) must throw for a missing Pixel Measures macro");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomValueError);
      if (err instanceof DicomValueError) {
        expect(err.code).toBe("MISSING_REQUIRED_FUNCTIONAL_GROUP");
        expect(err.message).toContain("Pixel Measures");
      }
    }
  });

  it("throws MISSING_REQUIRED_FUNCTIONAL_GROUP naming Plane Orientation when it is absent in both groups", () => {
    // Pixel Measures + Plane Position present; Plane Orientation present nowhere.
    const ds = enhanced({
      numberOfFrames: "1",
      shared: [pixelMeasuresShared],
      perFrame: [[planePositionPerFrame("0")]],
    });
    try {
      ds.image.frame(0);
      expect.unreachable("frame(0) must throw for a missing Plane Orientation macro");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomValueError);
      if (err instanceof DicomValueError) {
        expect(err.code).toBe("MISSING_REQUIRED_FUNCTIONAL_GROUP");
        expect(err.message).toContain("Plane Orientation");
      }
    }
  });

  it("resolves the optional Pixel Value Transformation and Frame VOI LUT macros when present", () => {
    const ds = enhanced({
      numberOfFrames: "1",
      shared: [pixelMeasuresShared, planeOrientationShared],
      perFrame: [[planePositionPerFrame("0"), pixelValueTransformation, frameVoiLut]],
    });
    const f = ds.image.frame(0);
    expect(f.pixelValueTransformation?.rescaleSlope).toBe(2.5);
    expect(f.pixelValueTransformation?.rescaleIntercept).toBe(-1024);
    expect(f.pixelValueTransformation?.rescaleType).toBe("HU");
    expect(f.frameVoiLut?.windowCenter).toEqual([40]);
    expect(f.frameVoiLut?.windowWidth).toEqual([400]);
  });

  it("leaves the optional macros typed-absent when they are present in neither group", () => {
    const ds = enhanced({
      numberOfFrames: "1",
      shared: [pixelMeasuresShared, planeOrientationShared],
      perFrame: [[planePositionPerFrame("0")]],
    });
    const f = ds.image.frame(0);
    expect(f.pixelValueTransformation).toBeUndefined();
    expect(f.frameVoiLut).toBeUndefined();
  });

  it("surfaces Pixel Measures sliceThickness and spacingBetweenSlices independently", () => {
    const pixelMeasuresFull: BuildDicomSqElement = {
      tag: "00289110",
      items: [
        {
          elements: [
            { tag: "00280030", vr: "DS", value: ascii("0.5\\0.5") }, // Pixel Spacing
            { tag: "00180050", vr: "DS", value: ascii("1.0") }, // Slice Thickness
            { tag: "00180088", vr: "DS", value: ascii("1.5") }, // Spacing Between Slices
          ],
        },
      ],
    };
    const ds = enhanced({
      numberOfFrames: "1",
      shared: [pixelMeasuresFull, planeOrientationShared],
      perFrame: [[planePositionPerFrame("0")]],
    });
    const measures = ds.image.frame(0).pixelMeasures;
    expect(measures?.pixelSpacing).toEqual([0.5, 0.5]);
    expect(measures?.sliceThickness).toBe(1.0);
    expect(measures?.spacingBetweenSlices).toBe(1.5);
  });

  it("resolves entirely from the per-frame group when no Shared Functional Groups Sequence exists", () => {
    // hasFunctionalGroups must be true on Per-Frame alone, and resolveMacroItem
    // must not consult a (non-existent) shared item.
    const ds = enhanced({
      numberOfFrames: "1",
      perFrame: [[pixelMeasuresShared, planePositionShared, planeOrientationShared, frameVoiLut]],
    });
    expect(ds.image.isEnhancedMultiFrame).toBe(true);
    const f = ds.image.frame(0);
    expect(f.pixelMeasures?.pixelSpacing).toEqual([0.5, 0.5]);
    expect(f.planePosition?.imagePositionPatient).toEqual([0, 0, 0]);
    expect(f.planeOrientation?.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
    expect(f.frameVoiLut?.windowCenter).toEqual([40]);
    // No Pixel Value Transformation anywhere ⇒ typed-absent.
    expect(f.pixelValueTransformation).toBeUndefined();
  });

  it("hasFunctionalGroups is false for a non-enhanced object", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080060", vr: "CS", value: ascii("CT") }],
      }),
    );
    expect(ds.image.isEnhancedMultiFrame).toBe(false);
  });

  it("resolves macros from the Shared group when no Per-Frame Functional Groups Sequence exists", () => {
    // Only a Shared Functional Groups Sequence (5200,9229); no per-frame seq.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00280008", vr: "IS", value: ascii("1") },
          {
            tag: "52009229",
            items: [
              {
                elements: [pixelMeasuresShared, planePositionShared, planeOrientationShared],
              },
            ],
          },
        ],
      }),
    );
    expect(ds.image.isEnhancedMultiFrame).toBe(true);
    const f = ds.image.frame(0);
    expect(f.pixelMeasures?.pixelSpacing).toEqual([0.5, 0.5]);
    expect(f.planePosition?.imagePositionPatient).toEqual([0, 0, 0]);
    expect(f.planeOrientation?.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("keeps inner macro attributes typed-absent when a macro item omits them (lenient)", () => {
    // Each required geometry macro item is PRESENT (so the frame resolves) but
    // carries none of its inner attributes, and the optional macros are present
    // but empty — every field must come back undefined, never a coerced value.
    const emptyItem = (tag: string): BuildDicomSqElement => ({ tag, items: [{ elements: [] }] });
    const ds = enhanced({
      numberOfFrames: "1",
      perFrame: [
        [
          emptyItem("00289110"), // Pixel Measures, no inner attrs
          emptyItem("00209113"), // Plane Position, no Image Position Patient
          emptyItem("00209116"), // Plane Orientation, no Image Orientation Patient
          emptyItem("00289145"), // Pixel Value Transformation, empty
          emptyItem("00289132"), // Frame VOI LUT, empty
        ],
      ],
    });
    const f = ds.image.frame(0);
    expect(f.pixelMeasures).toEqual({});
    expect(f.planePosition).toEqual({});
    expect(f.planeOrientation).toEqual({});
    expect(f.pixelValueTransformation).toEqual({});
    expect(f.frameVoiLut).toEqual({});
  });
});

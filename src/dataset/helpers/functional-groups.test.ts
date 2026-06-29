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
});

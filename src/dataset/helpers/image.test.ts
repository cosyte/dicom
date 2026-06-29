import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { parseDicom } from "../../index.js";
import { buildDicom } from "../../../test/helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

function ascii(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ", "ascii")]);
}
function us(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}
function fd(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n, 0);
  return b;
}

describe("buildImage (§4.2 wrong-pixels class)", () => {
  it("surfaces a signed CT with rescale slope/intercept/type and dimensions", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00280010", vr: "US", value: us(512) },
          { tag: "00280011", vr: "US", value: us(512) },
          { tag: "00280100", vr: "US", value: us(16) },
          { tag: "00280101", vr: "US", value: us(12) },
          { tag: "00280102", vr: "US", value: us(11) },
          { tag: "00280103", vr: "US", value: us(1) },
          { tag: "00280004", vr: "CS", value: ascii("MONOCHROME2") },
          { tag: "00281053", vr: "DS", value: ascii("1") },
          { tag: "00281052", vr: "DS", value: ascii("-1024") },
          { tag: "00281054", vr: "LO", value: ascii("HU") },
        ],
      }),
    );
    const img = ds.image;
    expect(img.rows).toBe(512);
    expect(img.columns).toBe(512);
    expect(img.bitsAllocated).toBe(16);
    expect(img.bitsStored).toBe(12);
    expect(img.highBit).toBe(11);
    expect(img.pixelRepresentation).toBe(1);
    expect(img.signed).toBe(true);
    expect(img.photometricInterpretation).toBe("MONOCHROME2");
    expect(img.rescaleSlope).toBe(1);
    expect(img.rescaleIntercept).toBe(-1024);
    expect(img.rescaleType).toBe("HU");
    expect(img.isEnhancedMultiFrame).toBe(false);
  });

  it("§4.2 PROHIBITION: rescaleSlope is absent (NOT defaulted to 1) when the tag is absent", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00280010", vr: "US", value: us(64) }],
      }),
    );
    expect(ds.image.rescaleSlope).toBeUndefined();
    expect(ds.image.rescaleIntercept).toBeUndefined();
  });

  it("§4.2 PROHIBITION: signed is absent (never guessed) unless (0028,0103) is present", () => {
    const noRep = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00280010", vr: "US", value: us(64) }],
      }),
    );
    expect(noRep.image.pixelRepresentation).toBeUndefined();
    expect(noRep.image.signed).toBeUndefined();

    const unsigned = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00280103", vr: "US", value: us(0) }],
      }),
    );
    expect(unsigned.image.pixelRepresentation).toBe(0);
    expect(unsigned.image.signed).toBe(false);
  });

  it("§4.2 PROHIBITION: MONOCHROME1 is preserved, never defaulted to MONOCHROME2; absent ⇒ undefined", () => {
    const mono1 = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00280004", vr: "CS", value: ascii("MONOCHROME1") }],
      }),
    );
    expect(mono1.image.photometricInterpretation).toBe("MONOCHROME1");

    const absent = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00280010", vr: "US", value: us(8) }],
      }),
    );
    expect(absent.image.photometricInterpretation).toBeUndefined();
  });
});

describe("buildImage (full surface — present-arm coverage)", () => {
  it("surfaces every pixel-interpretation + geometry field when present", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080018", vr: "UI", value: ascii("1.2.3.4") },
          { tag: "00280002", vr: "US", value: us(3) },
          { tag: "00280006", vr: "US", value: us(0) },
          { tag: "00280004", vr: "CS", value: ascii("RGB") },
          { tag: "00281050", vr: "DS", value: ascii("40") },
          { tag: "00281051", vr: "DS", value: ascii("400") },
          { tag: "00283000", vr: "SQ", items: [{ elements: [] }] },
          { tag: "00283010", vr: "SQ", items: [{ elements: [] }] },
          { tag: "00200032", vr: "DS", value: ascii("0\\0\\0") },
          { tag: "00200037", vr: "DS", value: ascii("1\\0\\0\\0\\1\\0") },
          { tag: "00200052", vr: "UI", value: ascii("1.2.3.FOR") },
          { tag: "00280008", vr: "IS", value: ascii("1") },
          { tag: "00541001", vr: "CS", value: ascii("HU") },
        ],
      }),
    );
    const img = ds.image;
    expect(img.sopInstanceUid).toBe("1.2.3.4");
    expect(img.samplesPerPixel).toBe(3);
    expect(img.planarConfiguration).toBe(0);
    expect(img.windowCenter).toEqual([40]);
    expect(img.windowWidth).toEqual([400]);
    expect(img.modalityLutSequence).toHaveLength(1);
    expect(img.voiLutSequence).toHaveLength(1);
    expect(img.imagePositionPatient).toEqual([0, 0, 0]);
    expect(img.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
    expect(img.frameOfReferenceUid).toBe("1.2.3.FOR");
    expect(img.numberOfFrames).toBe(1);
    expect(img.units).toBe("HU");
  });

  it("§4.2 PROHIBITION: a non-binary pixelRepresentation leaves signed unguessed", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00280103", vr: "US", value: us(2) }],
      }),
    );
    expect(ds.image.pixelRepresentation).toBe(2);
    expect(ds.image.signed).toBeUndefined();
  });

  it("a Real World Value Map with no units code omits unitsCode", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "00409096",
            items: [{ elements: [{ tag: "00409225", vr: "FD", value: fd(1) }] }],
          },
        ],
      }),
    );
    expect(ds.image.realWorldValueMaps?.[0]?.slope).toBe(1);
    expect(ds.image.realWorldValueMaps?.[0]?.unitsCode).toBeUndefined();
  });
});

describe("buildImage (§4.3 looks-fine-measures-wrong class)", () => {
  it("§4.3 PROHIBITION: the three pixel-spacing tags are distinct and never aliased", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00280030", vr: "DS", value: ascii("0.7\\0.7") },
          { tag: "00181164", vr: "DS", value: ascii("0.5\\0.5") },
          { tag: "00182010", vr: "DS", value: ascii("0.3\\0.3") },
          { tag: "00180050", vr: "DS", value: ascii("1.5") },
          { tag: "00180088", vr: "DS", value: ascii("2.5") },
        ],
      }),
    );
    const img = ds.image;
    expect(img.pixelSpacing).toEqual([0.7, 0.7]);
    expect(img.imagerPixelSpacing).toEqual([0.5, 0.5]);
    expect(img.nominalScannedPixelSpacing).toEqual([0.3, 0.3]);
    expect(img.sliceThickness).toBe(1.5);
    expect(img.spacingBetweenSlices).toBe(2.5);
  });

  it("preserves a null component of a malformed pixel-spacing pair (never coerced)", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00280030", vr: "DS", value: ascii("0.7\\abc") }],
      }),
    );
    expect(ds.image.pixelSpacing).toEqual([0.7, null]);
  });
});

describe("buildImage (§4.5 units/quantitation)", () => {
  it("binds a Real World Value Map's slope/intercept to its UCUM units code", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "00409096",
            items: [
              {
                elements: [
                  { tag: "00409225", vr: "FD", value: fd(2.5) },
                  { tag: "00409224", vr: "FD", value: fd(0) },
                  {
                    tag: "004008EA",
                    items: [
                      {
                        elements: [
                          { tag: "00080100", vr: "SH", value: ascii("[hnsf'U]") },
                          { tag: "00080102", vr: "SH", value: ascii("UCUM") },
                          { tag: "00080104", vr: "LO", value: ascii("Hounsfield unit") },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const maps = ds.image.realWorldValueMaps;
    expect(maps).toHaveLength(1);
    expect(maps?.[0]?.slope).toBe(2.5);
    expect(maps?.[0]?.intercept).toBe(0);
    expect(maps?.[0]?.unitsCode?.codeValue).toBe("[hnsf'U]");
    expect(maps?.[0]?.unitsCode?.schemeUid).toBe("2.16.840.1.113883.6.8");
  });
});

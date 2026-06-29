import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { parseDicom } from "../../index.js";
import { buildDicom } from "../../../test/helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

function ascii(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ", "ascii")]);
}

describe("buildSeries (§4.1, §4.3 co-registration)", () => {
  it("surfaces instanceUid, number, modality, description and frameOfReferenceUid", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "0020000E", vr: "UI", value: ascii("1.2.840.113619.2.55.3") },
          { tag: "00200011", vr: "IS", value: ascii("4") },
          { tag: "00080060", vr: "CS", value: ascii("CT") },
          { tag: "0008103E", vr: "LO", value: ascii("AXIAL") },
          { tag: "00200052", vr: "UI", value: ascii("1.2.840.113619.2.55.FOR") },
        ],
      }),
    );
    const s = ds.series;
    expect(s.instanceUid).toBe("1.2.840.113619.2.55.3");
    expect(s.number).toBe(4);
    expect(s.modality).toBe("CT");
    expect(s.description).toBe("AXIAL");
    expect(s.frameOfReferenceUid).toBe("1.2.840.113619.2.55.FOR");
  });

  it("never invents absent fields", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080060", vr: "CS", value: ascii("MR") }],
      }),
    );
    const s = ds.series;
    expect(s.modality).toBe("MR");
    expect(s.instanceUid).toBeUndefined();
    expect(s.number).toBeUndefined();
    expect(s.frameOfReferenceUid).toBeUndefined();
  });
});

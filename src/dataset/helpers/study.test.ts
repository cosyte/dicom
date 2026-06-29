import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { parseDicom } from "../../index.js";
import { buildDicom } from "../../../test/helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

function ascii(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ", "ascii")]);
}

describe("buildStudy (§4.1)", () => {
  it("surfaces the cross-system instanceUid, accessionNumber, date/time and description", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "0020000D", vr: "UI", value: ascii("1.2.840.113619.2.55") },
          { tag: "00200010", vr: "SH", value: ascii("STID7") },
          { tag: "00080050", vr: "SH", value: ascii("ACC123") },
          { tag: "00080020", vr: "DA", value: ascii("20240115") },
          { tag: "00080030", vr: "TM", value: ascii("133015") },
          { tag: "00081030", vr: "LO", value: ascii("CHEST CT") },
        ],
      }),
    );
    const s = ds.study;
    expect(s.instanceUid).toBe("1.2.840.113619.2.55");
    expect(s.id).toBe("STID7");
    expect(s.accessionNumber).toBe("ACC123");
    expect(s.date?.year).toBe(2024);
    expect(s.time?.hours).toBe(13);
    expect(s.description).toBe("CHEST CT");
  });

  it("never invents absent fields", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "0020000D", vr: "UI", value: ascii("1.2.3") }],
      }),
    );
    const s = ds.study;
    expect(s.instanceUid).toBe("1.2.3");
    expect(s.accessionNumber).toBeUndefined();
    expect(s.date).toBeUndefined();
    expect(s.time).toBeUndefined();
    expect(s.description).toBeUndefined();
  });
});

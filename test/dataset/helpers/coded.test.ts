import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { CODING_SCHEME_OIDS, codingSchemeOid, parseDicom, readCode } from "../../../src/index.js";
import { buildDicom } from "../../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

function ascii(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ", "ascii")]);
}

describe("codingSchemeOid (§4.6, CP-730)", () => {
  it("resolves the four standard designators to their canonical OIDs", () => {
    expect(codingSchemeOid("DCM")).toBe(CODING_SCHEME_OIDS.DCM);
    expect(codingSchemeOid("SCT")).toBe("2.16.840.1.113883.6.96");
    expect(codingSchemeOid("UCUM")).toBe("2.16.840.1.113883.6.8");
    expect(codingSchemeOid("LN")).toBe("2.16.840.1.113883.6.1");
  });

  it("does NOT treat legacy SNOMED designators as SCT (CP-730)", () => {
    expect(codingSchemeOid("SRT")).toBeUndefined();
    expect(codingSchemeOid("SNM3")).toBeUndefined();
    expect(codingSchemeOid("99SDM")).toBeUndefined();
  });

  it("returns undefined for an absent or unknown designator", () => {
    expect(codingSchemeOid(undefined)).toBeUndefined();
    expect(codingSchemeOid("FOO")).toBeUndefined();
  });
});

describe("readCode (§4.6 coded triplet)", () => {
  it("reads the triplet and resolves schemeUid for a standard designator", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080100", vr: "SH", value: ascii("C-B1003") },
          { tag: "00080102", vr: "SH", value: ascii("SCT") },
          { tag: "00080104", vr: "LO", value: ascii("Hounsfield unit") },
        ],
      }),
    );
    expect(readCode(ds)).toEqual({
      codeValue: "C-B1003",
      codingSchemeDesignator: "SCT",
      codeMeaning: "Hounsfield unit",
      schemeUid: "2.16.840.1.113883.6.96",
    });
  });

  it("omits schemeUid for a non-standard designator (no false equality)", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080100", vr: "SH", value: ascii("M-01000") },
          { tag: "00080102", vr: "SH", value: ascii("SRT") },
          { tag: "00080104", vr: "LO", value: ascii("Morphologic") },
        ],
      }),
    );
    const code = readCode(ds);
    expect(code.codingSchemeDesignator).toBe("SRT");
    expect(code.schemeUid).toBeUndefined();
  });

  it("returns an empty triplet when the code item carries no parts", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080060", vr: "CS", value: ascii("CT") }],
      }),
    );
    expect(readCode(ds)).toEqual({});
  });
});

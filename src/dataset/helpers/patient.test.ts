import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { parseDicom } from "../../index.js";
import { buildDicom } from "../../../test/helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

function ascii(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ", "ascii")]);
}

describe("buildPatient (§4.1 wrong-patient class)", () => {
  it("surfaces the {id, issuerOfId} tuple, structured PN, birthDate and sex", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00100010", vr: "PN", value: ascii("Doe^Jane") },
          { tag: "00100020", vr: "LO", value: ascii("MRN-42") },
          { tag: "00100021", vr: "LO", value: ascii("HOSP_A") },
          { tag: "00100030", vr: "DA", value: ascii("19800101") },
          { tag: "00100040", vr: "CS", value: ascii("F") },
        ],
      }),
    );
    const p = ds.patient;
    expect(p.id).toBe("MRN-42");
    expect(p.issuerOfId).toBe("HOSP_A");
    expect(p.name?.alphabetic.familyName).toBe("Doe");
    expect(p.name?.alphabetic.givenName).toBe("Jane");
    expect(p.birthDate?.year).toBe(1980);
    expect(p.birthDate?.month).toBe(1);
    expect(p.birthDate?.day).toBe(1);
    expect(p.sex).toBe("F");
    expect(p.otherIds).toEqual([]);
  });

  it("surfaces Other Patient IDs as {id, issuer, typeCode} triples", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00100020", vr: "LO", value: ascii("MRN-42") },
          {
            tag: "00101002",
            items: [
              {
                elements: [
                  { tag: "00100020", vr: "LO", value: ascii("ALT-1") },
                  { tag: "00100021", vr: "LO", value: ascii("HOSP_B") },
                  { tag: "00100022", vr: "CS", value: ascii("TEXT") },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(ds.patient.otherIds).toEqual([{ id: "ALT-1", issuer: "HOSP_B", typeCode: "TEXT" }]);
  });

  it("surfaces Issuer Qualifiers Sequence items when present", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00100020", vr: "LO", value: ascii("MRN-42") },
          {
            tag: "00100024",
            items: [{ elements: [{ tag: "00400032", vr: "UT", value: ascii("UQ") }] }],
          },
        ],
      }),
    );
    expect(ds.patient.issuerQualifiers).toHaveLength(1);
  });

  it("an Other Patient ID item with only an id omits issuer/typeCode", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "00101002",
            items: [{ elements: [{ tag: "00100020", vr: "LO", value: ascii("ALT-1") }] }],
          },
        ],
      }),
    );
    expect(ds.patient.otherIds).toEqual([{ id: "ALT-1" }]);
  });

  it("never invents an absent id/issuer — typed-absent, otherIds always []", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100010", vr: "PN", value: ascii("Doe^Jane") }],
      }),
    );
    const p = ds.patient;
    expect(p.id).toBeUndefined();
    expect(p.issuerOfId).toBeUndefined();
    expect(p.birthDate).toBeUndefined();
    expect(p.sex).toBeUndefined();
    expect(p.otherIds).toEqual([]);
  });

  it("memoises the view (same reference on repeat access)", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100020", vr: "LO", value: ascii("MRN-42") }],
      }),
    );
    expect(ds.patient).toBe(ds.patient);
  });
});

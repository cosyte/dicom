/**
 * The non-human patient attributes on `ds.patient`: species, breed, neutered status and the
 * responsible person, read tolerantly. Every value here is synthetic: invented codes in a private
 * `99SYNTH` scheme and plainly invented names.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { PATIENT_ISSUE_CODES, parseDicom } from "../../../src/index.js";
import type { PatientIssueCode } from "../../../src/index.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_IMPLICIT_LE = "1.2.840.10008.1.2";

function ascii(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ", "ascii")]);
}

function code(value: string, meaning: string): BuildDicomElement[] {
  return [
    { tag: "00080100", vr: "SH", value: ascii(value) },
    { tag: "00080102", vr: "SH", value: ascii("99SYNTH") },
    { tag: "00080104", vr: "LO", value: ascii(meaning) },
  ];
}

const ANIMAL: readonly (BuildDicomElement | BuildDicomSqElement)[] = [
  { tag: "00100010", vr: "PN", value: ascii("SYNTHETIC^PET") },
  { tag: "00100020", vr: "LO", value: ascii("SYNTH-PET-1") },
  { tag: "00102201", vr: "LO", value: ascii("SYNTHETIC SPECIES") },
  { tag: "00102202", items: [{ elements: code("SYN-SP-1", "Synthetic species") }] },
  { tag: "00102203", vr: "CS", value: ascii("ALTERED") },
  { tag: "00102292", vr: "LO", value: ascii("SYNTHETIC BREED") },
  { tag: "00102293", items: [{ elements: code("SYN-BR-1", "Synthetic breed") }] },
  { tag: "00102297", vr: "PN", value: ascii("SYNTHETIC^OWNER") },
  { tag: "00102298", vr: "CS", value: ascii("OWNER") },
  { tag: "00102299", vr: "LO", value: ascii("SAMPLE CLINIC") },
];

function parse(
  elements: readonly (BuildDicomElement | BuildDicomSqElement)[],
  transferSyntax = TS_EXPLICIT_LE,
): ReturnType<typeof parseDicom> {
  return parseDicom(buildDicom({ transferSyntax, elements }));
}

function issueCodes(ds: ReturnType<typeof parseDicom>): readonly [PatientIssueCode, string][] {
  return (ds.patient.issues ?? []).map((i) => [i.code, i.tag]);
}

describe("the patient view on a non-human patient", () => {
  for (const ts of [TS_EXPLICIT_LE, TS_IMPLICIT_LE]) {
    it(`reads species, breed, neutered status and the responsible person (${ts})`, () => {
      const p = parse(ANIMAL, ts).patient;
      expect(p.speciesDescription).toBe("SYNTHETIC SPECIES");
      expect(p.speciesCode).toEqual({
        codeValue: "SYN-SP-1",
        codingSchemeDesignator: "99SYNTH",
        codeMeaning: "Synthetic species",
      });
      expect(p.sexNeutered).toBe("ALTERED");
      expect(p.breedDescription).toBe("SYNTHETIC BREED");
      expect(p.breedCode).toEqual({
        codeValue: "SYN-BR-1",
        codingSchemeDesignator: "99SYNTH",
        codeMeaning: "Synthetic breed",
      });
      expect(p.responsiblePerson?.name?.alphabetic.familyName).toBe("SYNTHETIC");
      expect(p.responsiblePerson?.name?.alphabetic.givenName).toBe("OWNER");
      expect(p.responsiblePerson?.role).toBe("OWNER");
      expect(p.responsiblePerson?.organization).toBe("SAMPLE CLINIC");
      expect(p.issues).toBeUndefined();
    });
  }

  it("resolves a standard designator's scheme OID through the coded helper", () => {
    const p = parse([
      {
        tag: "00102202",
        items: [
          {
            elements: [
              { tag: "00080100", vr: "SH", value: ascii("SYN-SP-2") },
              { tag: "00080102", vr: "SH", value: ascii("SCT") },
              { tag: "00080104", vr: "LO", value: ascii("Synthetic species") },
            ],
          },
        ],
      },
    ]).patient;
    expect(p.speciesCode?.schemeUid).toBe("2.16.840.1.113883.6.96");
  });

  it("shows nothing new on a human patient", () => {
    const p = parse([
      { tag: "00100010", vr: "PN", value: ascii("SYNTHETIC^PERSON") },
      { tag: "00100020", vr: "LO", value: ascii("SYNTH-1") },
      { tag: "00100040", vr: "CS", value: ascii("O") },
    ]).patient;
    expect(Object.keys(p).sort()).toEqual(["id", "name", "otherIds", "sex"]);
  });

  it("reads a responsible organization with no person", () => {
    const p = parse([{ tag: "00102299", vr: "LO", value: ascii("SAMPLE CLINIC") }]).patient;
    expect(p.responsiblePerson).toEqual({ organization: "SAMPLE CLINIC" });
  });

  it("keeps a role outside the listed terms and reports nothing", () => {
    const p = parse([
      { tag: "00102297", vr: "PN", value: ascii("SYNTHETIC^KEEPER") },
      { tag: "00102298", vr: "CS", value: ascii("KEEPER") },
    ]).patient;
    expect(p.responsiblePerson?.role).toBe("KEEPER");
    expect(p.issues).toBeUndefined();
  });

  it("treats empty values as absent and reports nothing", () => {
    const p = parse([
      { tag: "00102201", vr: "LO", value: Buffer.alloc(0) },
      { tag: "00102203", vr: "CS", value: Buffer.alloc(0) },
      { tag: "00102297", vr: "PN", value: Buffer.alloc(0) },
      { tag: "00102292", vr: "LO", value: ascii("  ") },
      { tag: "00102299", vr: "UT", value: ascii("  ") },
    ]).patient;
    expect(p.breedDescription).toBeUndefined();
    expect(p.speciesDescription).toBeUndefined();
    expect(p.sexNeutered).toBeUndefined();
    expect(p.responsiblePerson).toBeUndefined();
    expect(p.issues).toBeUndefined();
  });
});

describe("malformed non-human attributes never throw and are reported by code", () => {
  it("keeps a neutered value outside ALTERED and UNALTERED and reports it", () => {
    const ds = parse([{ tag: "00102203", vr: "CS", value: ascii("YES") }]);
    expect(ds.patient.sexNeutered).toBe("YES");
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_NOT_ENUMERATED, "00102203"],
    ]);
  });

  it("reports an attribute written in a VR that does not decode to its value", () => {
    const ds = parse([
      { tag: "00102201", vr: "OB", value: ascii("SYNTHETIC SPECIES") },
      { tag: "00102297", vr: "OB", value: ascii("SYNTHETIC^OWNER") },
    ]);
    expect(ds.patient.speciesDescription).toBeUndefined();
    expect(ds.patient.responsiblePerson).toBeUndefined();
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, "00102201"],
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, "00102297"],
    ]);
  });

  it("reports a code sequence written as a leaf", () => {
    const ds = parse([{ tag: "00102202", vr: "OB", value: ascii("SYN-SP-1") }]);
    expect(ds.patient.speciesCode).toBeUndefined();
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, "00102202"],
    ]);
  });

  it("reports an empty code sequence and leaves the code absent", () => {
    const ds = parse([{ tag: "00102293", items: [] }]);
    expect(ds.patient.breedCode).toBeUndefined();
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_SEQUENCE_EMPTY, "00102293"],
    ]);
  });

  it("reads the first of several code items and reports the rest", () => {
    const ds = parse([
      {
        tag: "00102202",
        items: [
          { elements: code("SYN-SP-1", "Synthetic species") },
          { elements: code("SYN-SP-2", "Another synthetic species") },
        ],
      },
    ]);
    expect(ds.patient.speciesCode?.codeValue).toBe("SYN-SP-1");
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS, "00102202"],
    ]);
  });

  it("keeps what an incomplete code item carries and reports it", () => {
    const ds = parse([
      {
        tag: "00102293",
        items: [{ elements: [{ tag: "00080104", vr: "LO", value: ascii("Synthetic breed") }] }],
      },
    ]);
    expect(ds.patient.breedCode).toEqual({ codeMeaning: "Synthetic breed" });
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_INCOMPLETE, "00102293"],
    ]);
  });

  it("takes a Long Code Value or a URN Code Value as a code value", () => {
    const ds = parse([
      {
        tag: "00102202",
        items: [
          {
            elements: [
              { tag: "00080102", vr: "SH", value: ascii("99SYNTH") },
              { tag: "00080104", vr: "LO", value: ascii("Synthetic species") },
              { tag: "00080119", vr: "UC", value: ascii("SYNTHETIC-LONG-CODE-VALUE") },
            ],
          },
        ],
      },
      {
        tag: "00102293",
        items: [
          {
            elements: [
              { tag: "00080104", vr: "LO", value: ascii("Synthetic breed") },
              { tag: "00080120", vr: "UR", value: ascii("urn:example:synthetic-breed") },
            ],
          },
        ],
      },
    ]);
    expect(ds.patient.issues).toBeUndefined();
  });

  it("gives every issue a message built from its code and tag, never from the file", () => {
    const ds = parse([
      { tag: "00102203", vr: "CS", value: ascii("SYNTHETICMARKER") },
      { tag: "00102201", vr: "OB", value: ascii("SYNTHETICMARKER") },
    ]);
    const issues = ds.patient.issues ?? [];
    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(issue.message).not.toContain("SYNTHETICMARKER");
      expect(issue.message).toContain(issue.tag);
    }
  });

  it("freezes the issue list and each issue", () => {
    const ds = parse([{ tag: "00102203", vr: "CS", value: ascii("YES") }]);
    expect(Object.isFrozen(ds.patient.issues)).toBe(true);
    expect(Object.isFrozen(ds.patient.issues?.[0])).toBe(true);
  });

  it("reports a code item with no meaning, and one with no designator beside its value", () => {
    const ds = parse([
      {
        tag: "00102202",
        items: [
          {
            elements: [
              { tag: "00080100", vr: "SH", value: ascii("SYNSPECIES") },
              { tag: "00080102", vr: "SH", value: ascii("99SYNTH") },
            ],
          },
        ],
      },
      {
        tag: "00102293",
        items: [
          {
            elements: [
              { tag: "00080100", vr: "SH", value: ascii("SYNBREED") },
              { tag: "00080104", vr: "LO", value: ascii("Synthetic breed") },
            ],
          },
        ],
      },
    ]);
    expect(ds.patient.speciesCode).toEqual({
      codeValue: "SYNSPECIES",
      codingSchemeDesignator: "99SYNTH",
    });
    expect(ds.patient.breedCode).toEqual({ codeValue: "SYNBREED", codeMeaning: "Synthetic breed" });
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_INCOMPLETE, "00102202"],
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_INCOMPLETE, "00102293"],
    ]);
  });

  it("reports a role, an organization or a breed written in a VR that does not decode", () => {
    const ds = parse([
      { tag: "00102292", vr: "OB", value: ascii("SYNTHETIC BREED") },
      { tag: "00102297", vr: "PN", value: ascii("SYNTHETIC^OWNER") },
      { tag: "00102298", vr: "OB", value: ascii("OWNER") },
      { tag: "00102299", vr: "OB", value: ascii("SAMPLE CLINIC") },
    ]);
    expect(ds.patient.breedDescription).toBeUndefined();
    expect(ds.patient.responsiblePerson?.role).toBeUndefined();
    expect(ds.patient.responsiblePerson?.organization).toBeUndefined();
    expect(ds.patient.responsiblePerson?.name?.alphabetic.familyName).toBe("SYNTHETIC");
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, "00102292"],
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, "00102298"],
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_WRONG_TYPE, "00102299"],
    ]);
  });

  it("accepts UNALTERED, and reads a text-VR species written as UT", () => {
    const ds = parse([
      { tag: "00102201", vr: "UT", value: ascii("SYNTHETIC SPECIES") },
      { tag: "00102203", vr: "CS", value: ascii("UNALTERED") },
    ]);
    expect(ds.patient.speciesDescription).toBe("SYNTHETIC SPECIES");
    expect(ds.patient.sexNeutered).toBe("UNALTERED");
    expect(ds.patient.issues).toBeUndefined();
  });

  it("reports a code item with a designator and a meaning but no value in any form", () => {
    const ds = parse([
      {
        tag: "00102202",
        items: [
          {
            elements: [
              { tag: "00080102", vr: "SH", value: ascii("99SYNTH") },
              { tag: "00080104", vr: "LO", value: ascii("Synthetic species") },
            ],
          },
        ],
      },
    ]);
    expect(issueCodes(ds)).toEqual([
      [PATIENT_ISSUE_CODES.DICOM_PATIENT_CODE_INCOMPLETE, "00102202"],
    ]);
  });

  it("words each code's message from the registry, after the tag", () => {
    const ds = parse([
      { tag: "00102201", vr: "OB", value: ascii("SYNTHETIC SPECIES") },
      { tag: "00102202", items: [] },
      { tag: "00102203", vr: "CS", value: ascii("YES") },
      {
        tag: "00102293",
        items: [
          { elements: [{ tag: "00080104", vr: "LO", value: ascii("Synthetic breed") }] },
          { elements: code("SYNBREED", "Synthetic breed") },
        ],
      },
    ]);
    expect(ds.patient.issues?.map((i) => i.message)).toEqual([
      "00102201: the element is not encoded as its dictionary VR, so its value is not read",
      "00102202: the code sequence holds no item; the code is left absent",
      "00102203: the value is not one of the standard's enumerated values; it is kept as written",
      "00102293: the code sequence holds more than the one item allowed; the first is read",
      "00102293: the code item lacks a code value, a coding scheme designator or a code meaning; what it carries is kept",
    ]);
  });
});

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { parseDicom } from "../../index.js";
import { buildDicom, type BuildDicomElement } from "../../../test/helpers/build-dicom.js";
import type { Dataset } from "../dataset.js";
import {
  readDate,
  readItems,
  readNumber,
  readNumberArray,
  readPersonName,
  readString,
  readTime,
} from "./read.js";

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
function ds(elements: readonly BuildDicomElement[]): Dataset {
  return parseDicom(buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements }));
}

describe("fail-safe readers", () => {
  it("readString: first non-empty string / text; absent, empty, or wrong-kind ⇒ undefined", () => {
    expect(readString(ds([{ tag: "00080060", vr: "CS", value: ascii("CT") }]), "00080060")).toBe(
      "CT",
    );
    expect(
      readString(ds([{ tag: "00084000", vr: "LT", value: ascii("a comment") }]), "00084000"),
    ).toBe("a comment");
    expect(
      readString(ds([{ tag: "00080060", vr: "CS", value: Buffer.alloc(0) }]), "00080060"),
    ).toBeUndefined();
    expect(readString(ds([]), "00080060")).toBeUndefined();
    // wrong kind: a binary-numeric VR is not a string
    expect(
      readString(ds([{ tag: "00280010", vr: "US", value: us(5) }]), "00280010"),
    ).toBeUndefined();
  });

  it("readNumber: numbers / DS / IS first scalar; null, absent, or wrong-kind ⇒ undefined", () => {
    expect(readNumber(ds([{ tag: "00280010", vr: "US", value: us(512) }]), "00280010")).toBe(512);
    expect(readNumber(ds([{ tag: "00281053", vr: "DS", value: ascii("3.5") }]), "00281053")).toBe(
      3.5,
    );
    expect(readNumber(ds([{ tag: "00200011", vr: "IS", value: ascii("7") }]), "00200011")).toBe(7);
    // malformed DS first component stays null ⇒ undefined (never coerced)
    expect(
      readNumber(ds([{ tag: "00281053", vr: "DS", value: ascii("abc") }]), "00281053"),
    ).toBeUndefined();
    expect(readNumber(ds([]), "00280010")).toBeUndefined();
    // wrong kind: a PN VR is not numeric
    expect(
      readNumber(ds([{ tag: "00100010", vr: "PN", value: ascii("Doe^Jane") }]), "00100010"),
    ).toBeUndefined();
  });

  it("readNumberArray: preserves null components; wrong-kind ⇒ undefined", () => {
    expect(
      readNumberArray(ds([{ tag: "00280030", vr: "DS", value: ascii("0.7\\abc") }]), "00280030"),
    ).toEqual([0.7, null]);
    expect(readNumberArray(ds([{ tag: "00280010", vr: "US", value: us(8) }]), "00280010")).toEqual([
      8,
    ]);
    expect(
      readNumberArray(ds([{ tag: "00100010", vr: "PN", value: ascii("Doe^Jane") }]), "00100010"),
    ).toBeUndefined();
  });

  it("readPersonName / readDate / readTime: matched VR or undefined", () => {
    expect(
      readPersonName(ds([{ tag: "00100010", vr: "PN", value: ascii("Doe^Jane") }]), "00100010")
        ?.alphabetic.familyName,
    ).toBe("Doe");
    expect(
      readPersonName(ds([{ tag: "00080060", vr: "CS", value: ascii("CT") }]), "00080060"),
    ).toBeUndefined();
    expect(
      readDate(ds([{ tag: "00080020", vr: "DA", value: ascii("20240115") }]), "00080020")?.year,
    ).toBe(2024);
    expect(
      readDate(ds([{ tag: "00080060", vr: "CS", value: ascii("CT") }]), "00080060"),
    ).toBeUndefined();
    expect(
      readTime(ds([{ tag: "00080030", vr: "TM", value: ascii("133015") }]), "00080030")?.hours,
    ).toBe(13);
    expect(
      readTime(ds([{ tag: "00080060", vr: "CS", value: ascii("CT") }]), "00080060"),
    ).toBeUndefined();
  });

  it("readItems: SQ items or undefined for absent / non-sequence", () => {
    const withSeq = ds([{ tag: "00080060", vr: "CS", value: ascii("CT") }]);
    expect(readItems(withSeq, "00101002")).toBeUndefined();
    expect(readItems(withSeq, "00080060")).toBeUndefined();
  });
});

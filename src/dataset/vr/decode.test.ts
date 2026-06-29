import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import type { Tag, VR } from "../../dictionary/types.js";
import { Element } from "../element.js";
import { Item } from "../item.js";
import { decodeElementValue } from "./decode.js";

function el(
  vr: VR,
  rawBytes: Buffer,
  opts: { tag?: Tag; littleEndian?: boolean; charset?: readonly string[]; items?: Item[] } = {},
): Element {
  return new Element({
    tag: opts.tag ?? "00100010",
    vr,
    vm: 1,
    length: rawBytes.length,
    rawBytes,
    byteOffset: 0,
    littleEndian: opts.littleEndian ?? true,
    ...(opts.charset !== undefined ? { specificCharacterSet: opts.charset } : {}),
    ...(opts.items !== undefined ? { items: opts.items } : {}),
  });
}

const ascii = (s: string): Buffer => Buffer.from(s, "latin1");

describe("decodeElementValue — structural kinds", () => {
  it("SQ → sequence, exposing the threaded items", () => {
    const item = new Item({ index: 0, warnings: [], elements: new Map() });
    const v = decodeElementValue(el("SQ", Buffer.alloc(0), { items: [item] }));
    expect(v.kind).toBe("sequence");
    if (v.kind === "sequence") expect(v.items).toHaveLength(1);
  });

  it("SQ with no threaded items → empty sequence (never undefined)", () => {
    const v = decodeElementValue(el("SQ", Buffer.alloc(0)));
    expect(v).toEqual({ kind: "sequence", items: [] });
  });

  it.each(["OB", "OD", "OF", "OL", "OV", "OW", "UN"] as const)(
    "%s → binary (raw preserved, not interpreted)",
    (vr) => {
      const bytes = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const v = decodeElementValue(el(vr, bytes));
      expect(v.kind).toBe("binary");
      if (v.kind === "binary") expect(v.bytes).toBe(bytes);
    },
  );

  it("zero-length non-binary value → empty", () => {
    expect(decodeElementValue(el("PN", Buffer.alloc(0)))).toEqual({ kind: "empty" });
  });
});

describe("decodeElementValue — numeric kinds", () => {
  it.each(["US", "UL", "SS", "SL", "FL", "FD"] as const)("%s → numbers", (vr) => {
    const bytes = Buffer.alloc(8); // enough for any stride
    const v = decodeElementValue(el(vr, bytes));
    expect(v.kind).toBe("numbers");
  });

  it.each(["SV", "UV"] as const)("%s → bigints", (vr) => {
    const v = decodeElementValue(el(vr, Buffer.alloc(8)));
    expect(v.kind).toBe("bigints");
  });

  it("AT → attributeTags", () => {
    const v = decodeElementValue(el("AT", Buffer.from([0x10, 0x00, 0x10, 0x00])));
    expect(v).toEqual({ kind: "attributeTags", values: ["00100010"] });
  });
});

describe("decodeElementValue — string / text kinds", () => {
  it("PN → personName, charset-decoded", () => {
    const v = decodeElementValue(el("PN", ascii("Doe^Jane")));
    expect(v.kind).toBe("personName");
    if (v.kind === "personName") expect(v.values[0]?.alphabetic.familyName).toBe("Doe");
  });

  it.each(["LO", "SH", "UC"] as const)("%s → strings, split on backslash", (vr) => {
    const v = decodeElementValue(el(vr, ascii("a\\b")));
    expect(v).toMatchObject({ kind: "strings", values: ["a", "b"] });
  });

  it.each(["LT", "ST", "UT"] as const)("%s → single text (backslash literal)", (vr) => {
    const v = decodeElementValue(el(vr, ascii("a\\b")));
    expect(v).toMatchObject({ kind: "text", value: "a\\b" });
  });

  it("UR → text (ASCII, no multiplicity)", () => {
    const v = decodeElementValue(el("UR", ascii("http://x/y")));
    expect(v).toMatchObject({ kind: "text", value: "http://x/y" });
  });

  it.each(["AE", "CS", "AS", "UI"] as const)("%s → strings (ASCII)", (vr) => {
    const v = decodeElementValue(el(vr, ascii("CT")));
    expect(v).toMatchObject({ kind: "strings", values: ["CT"] });
  });
});

describe("decodeElementValue — numeric strings (fail-safe, never NaN→0)", () => {
  it("DS → decimalString, non-numeric → null (raw still preserved on element)", () => {
    const e = el("DS", ascii("1.5\\bad\\"));
    const v = decodeElementValue(e);
    expect(v).toMatchObject({ kind: "decimalString", values: [1.5, null, null] });
    expect(e.rawBytes.toString("latin1")).toBe("1.5\\bad\\");
  });

  it("DS rejects non-conformant numeric literals (hex/octal/binary) → null, not coerced", () => {
    const v = decodeElementValue(el("DS", ascii("0x1A\\0o17\\0b101\\1.5e2")));
    expect(v).toMatchObject({ kind: "decimalString", values: [null, null, null, 150] });
  });

  it("IS → integerString, non-integer → null + DICOM_IS_NONINTEGER_VALUE warning", () => {
    const v = decodeElementValue(el("IS", ascii("42\\3.5")));
    expect(v.kind).toBe("integerString");
    if (v.kind === "integerString") {
      expect(v.values).toEqual([42, null]);
      expect(v.warnings?.[0]?.code).toBe("DICOM_IS_NONINTEGER_VALUE");
    }
  });
});

describe("decodeElementValue — temporal kinds", () => {
  it("DA → dates; dotted legacy form emits DICOM_DA_LEGACY_FORMAT", () => {
    const v = decodeElementValue(el("DA", ascii("2024.01.15"), { tag: "00080020" }));
    expect(v.kind).toBe("dates");
    if (v.kind === "dates") {
      expect(v.values[0]?.valid).toBe(true);
      expect(v.warnings?.[0]?.code).toBe("DICOM_DA_LEGACY_FORMAT");
    }
  });

  it("TM → times", () => {
    const v = decodeElementValue(el("TM", ascii("133015")));
    expect(v.kind).toBe("times");
    if (v.kind === "times") expect(v.values[0]?.hours).toBe(13);
  });

  it("DT → dateTimes; malformed offset emits DICOM_DT_NONSTANDARD_OFFSET", () => {
    const v = decodeElementValue(el("DT", ascii("20240115+99"), { tag: "0040A120" }));
    expect(v.kind).toBe("dateTimes");
    if (v.kind === "dateTimes") expect(v.warnings?.[0]?.code).toBe("DICOM_DT_NONSTANDARD_OFFSET");
  });
});

describe("decodeElementValue — padding & tolerance", () => {
  it("string VR strips trailing SPACE pad", () => {
    const v = decodeElementValue(el("LO", ascii("VALUE ")));
    expect(v).toMatchObject({ kind: "strings", values: ["VALUE"] });
  });

  it("UI strips trailing NULL pad", () => {
    const v = decodeElementValue(el("UI", Buffer.concat([ascii("1.2.840"), Buffer.from([0x00])])));
    expect(v).toMatchObject({ kind: "strings", values: ["1.2.840"] });
  });

  it("UI with a SPACE pad is tolerated + DICOM_UI_TRAILING_SPACE", () => {
    const v = decodeElementValue(el("UI", ascii("1.2.840 ")));
    if (v.kind === "strings") {
      expect(v.values).toEqual(["1.2.840"]);
      expect(v.warnings?.[0]?.code).toBe("DICOM_UI_TRAILING_SPACE");
    }
  });

  it("text VR with a NULL pad is tolerated + DICOM_TRAILING_NULL_IN_TEXT_VR", () => {
    const v = decodeElementValue(el("CS", Buffer.concat([ascii("CT"), Buffer.from([0x00])])));
    if (v.kind === "strings") {
      expect(v.values).toEqual(["CT"]);
      expect(v.warnings?.[0]?.code).toBe("DICOM_TRAILING_NULL_IN_TEXT_VR");
    }
  });

  it("non-ASCII byte in an ASCII-only VR emits DICOM_NON_ASCII_IN_ASCII_VR", () => {
    const v = decodeElementValue(el("CS", Buffer.from([0x43, 0xe9])));
    if (v.kind === "strings") expect(v.warnings?.[0]?.code).toBe("DICOM_NON_ASCII_IN_ASCII_VR");
  });

  it("a leading UTF-8 BOM in a charset text VR is stripped + DICOM_BOM_IN_TEXT_VR", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), ascii("Doe^Jane")]);
    const v = decodeElementValue(el("PN", bytes, { charset: ["ISO_IR 192"] }));
    if (v.kind === "personName") {
      expect(v.values[0]?.alphabetic.familyName).toBe("Doe");
      expect(v.warnings?.[0]?.code).toBe("DICOM_BOM_IN_TEXT_VR");
    }
  });

  it("clean values carry no warnings array", () => {
    const v = decodeElementValue(el("LO", ascii("clean")));
    if (v.kind === "strings") expect(v.warnings).toBeUndefined();
  });
});

describe("decodeElementValue — charset threading", () => {
  it("LO honors UTF-8 via the element's specificCharacterSet", () => {
    const v = decodeElementValue(
      el("LO", Buffer.from("Müller", "utf-8"), { charset: ["ISO_IR 192"] }),
    );
    expect(v).toMatchObject({ kind: "strings", values: ["Müller"] });
  });
});

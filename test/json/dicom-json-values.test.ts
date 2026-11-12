/**
 * `toDicomJson` and `fromDicomJson`, value by value: the edges of each VR's JSON form, the
 * Specific Character Sets text is encoded under, the bounds of each number, and each refusal's
 * exact message. Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DICOM_JSON_ERROR_CODES,
  Dataset,
  DicomJsonError,
  Element,
  fromDicomJson,
  parseDicom,
  serializeDicom,
  toDicomJson,
  type DicomJsonAttribute,
  type DicomJsonDataset,
  type FromDicomJsonOptions,
} from "../../src/index.js";
import type { VR } from "../../src/dictionary/types.js";
import { buildDicom, type BuildDicomElement } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

const LE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE } };
const BE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_EXPLICIT_BE } };

function latin1(s: string): Buffer {
  return Buffer.from(s, "latin1");
}

/** The JSON of a file of `elements` under `ts`. */
function jsonOf(elements: BuildDicomElement[], ts = TS_EXPLICIT_LE): DicomJsonDataset {
  return toDicomJson(parseDicom(buildDicom({ transferSyntax: ts, elements })));
}

/** The JSON of one element, read from a file that holds only it. */
function one(tag: string, vr: VR, value: Buffer, ts = TS_EXPLICIT_LE): DicomJsonAttribute {
  return jsonOf([{ tag, vr, value }], ts)[tag] as DicomJsonAttribute;
}

/** JSON to a Dataset to JSON. */
function again(json: DicomJsonDataset, options: FromDicomJsonOptions = LE): DicomJsonDataset {
  const ds = fromDicomJson(json, options);
  expect(ds.warnings).toEqual([]);
  return toDicomJson(ds);
}

/** The bytes `fromDicomJson` writes for one attribute's value. */
function valueBytes(tag: string, attr: DicomJsonAttribute, options = LE): Buffer {
  const ds = fromDicomJson({ [tag]: attr }, options);
  return Buffer.from(ds.get(tag)?.rawBytes ?? Buffer.alloc(0));
}

function refusal(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof DicomJsonError) return err.code;
    throw err;
  }
  return undefined;
}

describe("text values", () => {
  it("removes trailing SPACE and NUL padding, every byte of it, and keeps the rest", () => {
    expect(one("00100020", "LO", latin1("  MRN 42  "))).toEqual({ vr: "LO", Value: ["  MRN 42"] });
    expect(one("00081030", "LO", latin1("SYNTH\0\0"))).toEqual({ vr: "LO", Value: ["SYNTH"] });
    expect(one("0020000D", "UI", latin1("1.2.3\0"))).toEqual({ vr: "UI", Value: ["1.2.3"] });
    expect(one("00104000", "LT", latin1("Line one\r\nTwo  "))).toEqual({
      vr: "LT",
      Value: ["Line one\r\nTwo"],
    });
  });

  it("writes a value of only padding as an attribute with no value", () => {
    expect(one("00100020", "LO", latin1("  "))).toEqual({ vr: "LO" });
    expect(one("00104000", "LT", latin1("  "))).toEqual({ vr: "LT" });
    expect(one("00100010", "PN", latin1("=="))).toEqual({ vr: "PN" });
  });

  it("writes null for an empty value among several, first, middle or last", () => {
    expect(one("00080008", "CS", latin1("\\A"))).toEqual({ vr: "CS", Value: [null, "A"] });
    expect(one("00080008", "CS", latin1("A\\\\B "))).toEqual({ vr: "CS", Value: ["A", null, "B"] });
    expect(one("00080008", "CS", latin1("A\\"))).toEqual({ vr: "CS", Value: ["A", null] });
    expect(one("00200032", "DS", latin1("1\\ \\2 "))).toEqual({ vr: "DS", Value: [1, null, 2] });
  });

  it("writes each Person Name group present, and no group that is empty", () => {
    expect(one("00100010", "PN", latin1("A^B=I^J=P^Q "))).toEqual({
      vr: "PN",
      Value: [{ Alphabetic: "A^B", Ideographic: "I^J", Phonetic: "P^Q" }],
    });
    expect(one("00100010", "PN", latin1("=I^J"))).toEqual({
      vr: "PN",
      Value: [{ Ideographic: "I^J" }],
    });
    expect(one("00100010", "PN", latin1("A==P "))).toEqual({
      vr: "PN",
      Value: [{ Alphabetic: "A", Phonetic: "P" }],
    });
    expect(one("00100010", "PN", latin1("A\\\\B "))).toEqual({
      vr: "PN",
      Value: [{ Alphabetic: "A" }, null, { Alphabetic: "B" }],
    });
  });

  it("writes a Person Name back with no `=` after its last group", () => {
    for (const [pn, text] of [
      [{ Alphabetic: "A" }, "A "],
      [{ Alphabetic: "A", Ideographic: "I" }, "A=I "],
      [{ Ideographic: "I" }, "=I"],
      [{ Alphabetic: "A", Phonetic: "P" }, "A==P"],
      [{ Alphabetic: "A", Ideographic: "I", Phonetic: "P" }, "A=I=P "],
    ] as const) {
      expect(valueBytes("00100010", { vr: "PN", Value: [pn] }).toString("latin1")).toBe(text);
    }
    expect(valueBytes("00100010", { vr: "PN", Value: [null, { Alphabetic: "B" }] })).toEqual(
      latin1("\\B"),
    );
  });

  it("pads an odd-length UI and binary value with NUL and other text with SPACE", () => {
    expect(valueBytes("0020000D", { vr: "UI", Value: ["1.2.3"] })).toEqual(latin1("1.2.3\0"));
    expect(valueBytes("00080060", { vr: "CS", Value: ["MRI"] })).toEqual(latin1("MRI "));
    expect(valueBytes("00080008", { vr: "CS", Value: ["A", null] })).toEqual(latin1("A\\"));
    expect(valueBytes("00282000", { vr: "OB", InlineBinary: "AQID" })).toEqual(
      Buffer.from([1, 2, 3, 0]),
    );
    expect(valueBytes("00282000", { vr: "OB", InlineBinary: "AQIDBA==" })).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
  });

  it("writes the Data Set in ascending tag order, whatever the JSON order", () => {
    const json: DicomJsonDataset = {
      "00100020": { vr: "LO", Value: ["MRN-42"] },
      "00080060": { vr: "CS", Value: ["CT"] },
      "0020000D": { vr: "UI", Value: ["1.2.3"] },
      "00100010": { vr: "PN", Value: [{ Alphabetic: "DOE^JANE" }] },
    };
    const ds = fromDicomJson(json, LE);
    expect(ds.elements().map((el) => el.tag)).toEqual([
      "00080060",
      "00100010",
      "00100020",
      "0020000D",
    ]);
    const lower = fromDicomJson({ "0010abcd": { vr: "LO", Value: ["A"] } }, LE);
    expect(lower.elements().map((el) => el.tag)).toEqual(["0010ABCD"]);
  });
});

describe("Specific Character Set", () => {
  const charsetVrs: [string, VR][] = [
    ["00080050", "SH"],
    ["00100020", "LO"],
    ["00080119", "UC"],
    ["00080081", "ST"],
    ["00104000", "LT"],
    ["0040A160", "UT"],
    ["00100010", "PN"],
  ];

  it("decodes the text of each charset VR under ISO_IR 192, and writes it back the same", () => {
    const text = "ŁUKASZ É";
    const elements: BuildDicomElement[] = [
      { tag: "00080005", vr: "CS", value: latin1("ISO_IR 192") },
      ...charsetVrs.map(([tag, vr]): BuildDicomElement => ({
        tag,
        vr,
        value: Buffer.from(`${text} `, "utf8"),
      })),
    ];
    elements.sort((a, b) => a.tag.localeCompare(b.tag));
    const json = jsonOf(elements);
    for (const [tag, vr] of charsetVrs) {
      const expected = vr === "PN" ? [{ Alphabetic: text }] : [text];
      expect(json[tag]).toEqual({ vr, Value: expected });
    }
    expect(again(json)).toEqual(json);
  });

  it("reads a Default Repertoire VR as Latin-1 whatever the Specific Character Set", () => {
    const json = jsonOf([
      { tag: "00080005", vr: "CS", value: latin1("ISO_IR 192") },
      { tag: "00080060", vr: "CS", value: latin1("ÉX") },
    ]);
    expect(json["00080060"]).toEqual({ vr: "CS", Value: ["ÉX"] });
    expect(valueBytes("00080060", { vr: "CS", Value: ["ÉX"] })).toEqual(latin1("ÉX"));
    const utf8: DicomJsonDataset = {
      "00080005": { vr: "CS", Value: ["ISO_IR 192"] },
      "00080060": { vr: "CS", Value: ["ÉX"] },
    };
    expect(fromDicomJson(utf8, LE).get("00080060")?.rawBytes).toEqual(latin1("ÉX"));
  });

  it("writes Latin-1 text under ISO_IR 100, and refuses it under the default repertoire, which is ISO-IR 6", () => {
    const name = { vr: "PN", Value: [{ Alphabetic: "JÉRÔME^ÿ" }] };
    const bytes = latin1("JÉRÔME^ÿ");
    const latin = fromDicomJson(
      { "00080005": { vr: "CS", Value: ["ISO_IR 100"] }, "00100010": name },
      LE,
    );
    expect(latin.get("00100010")?.rawBytes).toEqual(bytes);
    expect(refusal(() => valueBytes("00100010", name))).toBe("UNSUPPORTED_CHARACTER_SET");
    for (const charset of [
      { vr: "CS" },
      { vr: "CS", Value: [null] },
      { vr: "CS", Value: ["ISO_IR 6"] },
    ]) {
      expect(
        refusal(() => fromDicomJson({ "00080005": charset, "00100010": name }, LE)),
        JSON.stringify(charset),
      ).toBe("UNSUPPORTED_CHARACTER_SET");
    }
  });

  it("refuses a character Latin-1 cannot hold under the sets it encodes as Latin-1", () => {
    for (const charset of [undefined, "ISO_IR 6", "ISO_IR 100"]) {
      const json: DicomJsonDataset = {
        ...(charset === undefined ? {} : { "00080005": { vr: "CS", Value: [charset] } }),
        "00100010": { vr: "PN", Value: [{ Alphabetic: "Ł" }] },
      };
      expect(refusal(() => fromDicomJson(json, LE))).toBe("UNSUPPORTED_CHARACTER_SET");
    }
    expect(refusal(() => fromDicomJson({ "00080060": { vr: "CS", Value: ["Ł"] } }, LE))).toBe(
      "UNSUPPORTED_CHARACTER_SET",
    );
  });

  it("writes 7-bit text under any set it carries, and refuses more only where it does not encode", () => {
    const ascii = { vr: "LO", Value: ["SYNTH\u007f"] };
    const charset = { vr: "CS", Value: ["ISO_IR 101"] };
    const ds = fromDicomJson({ "00080005": charset, "00100020": ascii }, LE);
    expect(ds.get("00100020")?.rawBytes).toEqual(latin1("SYNTH\u007f"));
    const json = { "00080005": charset, "00100020": { vr: "LO", Value: ["é"] } };
    expect(refusal(() => fromDicomJson(json, LE))).toBe("UNSUPPORTED_CHARACTER_SET");
    // Code extensions are not carried, so even 7-bit text under them is refused.
    const multi = { vr: "CS", Value: ["ISO_IR 100", "ISO 2022 IR 87"] };
    expect(refusal(() => fromDicomJson({ "00080005": multi, "00100020": ascii }, LE))).toBe(
      "UNSUPPORTED_CHARACTER_SET",
    );
  });

  it("encodes an Item's text under the set it inherits, or its own", () => {
    const item = (charset?: string): DicomJsonDataset => ({
      ...(charset === undefined ? {} : { "00080005": { vr: "CS", Value: [charset] } }),
      "00100020": { vr: "LO", Value: ["é"] },
    });
    const sq = (root: string, own?: string): DicomJsonDataset => ({
      "00080005": { vr: "CS", Value: [root] },
      "0040A730": { vr: "SQ", Value: [item(own)] },
    });
    const value = (json: DicomJsonDataset): Buffer | undefined =>
      fromDicomJson(json, LE).get("0040A730")?.items?.[0]?.get("00100020")?.rawBytes;
    expect(value(sq("ISO_IR 192"))).toEqual(Buffer.from("é", "utf8"));
    expect(value(sq("ISO_IR 192", "ISO_IR 100"))).toEqual(latin1("é "));
    expect(value(sq("ISO_IR 100", "ISO_IR 192"))).toEqual(Buffer.from("é", "utf8"));
  });

  it("refuses a Specific Character Set of another shape", () => {
    for (const charset of [
      { vr: "CS", Value: "ISO_IR 192" },
      { vr: "CS", Value: [5] },
      // A term of another shape is refused as one, even beside a valid one.
      { vr: "CS", Value: ["ISO_IR 100", 5] },
    ]) {
      const json = { "00080005": charset } as unknown as DicomJsonDataset;
      expect(refusal(() => fromDicomJson(json, LE))).toBe("INVALID_JSON");
    }
  });

  it("refuses a Specific Character Set of another shape before writing text that sorts ahead of it", () => {
    // (0004,1130) sorts before (0008,0005): read as terms, the string would refuse that text instead.
    for (const value of ["ISO_IR 192", 5]) {
      const json = {
        "00041130": { vr: "LO", Value: ["é"] },
        "00080005": { vr: "CS", Value: value },
      } as unknown as DicomJsonDataset;
      let caught: unknown;
      try {
        fromDicomJson(json, LE);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DicomJsonError);
      expect((caught as DicomJsonError).code).toBe("INVALID_JSON");
      expect((caught as DicomJsonError).tag).toBe("00080005");
    }
  });
});

describe("numbers", () => {
  it("reads DS and IS in every form PS3.5 gives them", () => {
    const ds = (text: string): DicomJsonAttribute => one("00101020", "DS", latin1(text));
    expect(ds("1e10")).toEqual({ vr: "DS", Value: [1e10] });
    expect(ds("+1E-3 ")).toEqual({ vr: "DS", Value: [0.001] });
    expect(ds("1.")).toEqual({ vr: "DS", Value: [1] });
    expect(ds(".55 ")).toEqual({ vr: "DS", Value: [0.55] });
    expect(ds("-.5 ")).toEqual({ vr: "DS", Value: [-0.5] });
    expect(ds(" 1024 ")).toEqual({ vr: "DS", Value: [1024] });
    expect(ds("5\t")).toEqual({ vr: "DS", Value: [5] });
    expect(ds("12.75\\-3")).toEqual({ vr: "DS", Value: [12.75, -3] });
    expect(one("00200013", "IS", latin1(" +42 "))).toEqual({ vr: "IS", Value: [42] });
    expect(one("00200013", "IS", latin1("-120"))).toEqual({ vr: "IS", Value: [-120] });
  });

  it("refuses DS and IS text that is not a number, or not a finite one", () => {
    for (const text of [
      "x5",
      "5x",
      "0x10",
      "0b1 ",
      "1.2.3",
      "e5 ",
      "1e ",
      "1e+",
      "+",
      ".",
      "1e400 ",
    ]) {
      expect(refusal(() => one("00101020", "DS", latin1(text)))).toBe("UNREPRESENTABLE_NUMBER");
    }
    for (const text of ["x5", "5x", "0x10", "0b1 ", "1.5 ", "+ "]) {
      expect(refusal(() => one("00200013", "IS", latin1(text)))).toBe("UNREPRESENTABLE_NUMBER");
    }
  });

  it("writes DS in JavaScript's shortest text, up to the 16 characters DS allows", () => {
    expect(valueBytes("00101020", { vr: "DS", Value: [-0.0000012345678] })).toEqual(
      latin1("-0.0000012345678"),
    );
    expect(valueBytes("00101020", { vr: "DS", Value: [1e21, null] })).toEqual(latin1("1e+21\\"));
    // Past 16 characters, the same value as significant digits and a power of ten.
    expect(valueBytes("00101020", { vr: "DS", Value: [-0.00000123456789] })).toEqual(
      latin1("-123456789e-14"),
    );
    expect(valueBytes("00101020", { vr: "DS", Value: [1e16] })).toEqual(latin1("1e16"));
    expect(
      refusal(() => valueBytes("00101020", { vr: "DS", Value: [-1.234567890123456e-300] })),
    ).toBe("UNREPRESENTABLE_NUMBER");
  });

  it("holds each integer VR and IS to its range, both ends included", () => {
    const ranges: [string, string, number, number][] = [
      ["00280010", "US", 0, 0xffff],
      ["00189219", "SS", -0x8000, 0x7fff],
      ["00081161", "UL", 0, 0xffffffff],
      ["00186020", "SL", -0x80000000, 0x7fffffff],
      ["00200013", "IS", -0x80000000, 0x7fffffff],
    ];
    for (const [tag, vr, min, max] of ranges) {
      expect(again({ [tag]: { vr, Value: [min, max] } })).toEqual({
        [tag]: { vr, Value: [min, max] },
      });
      for (const bad of [min - 1, max + 1, 1.5]) {
        expect(refusal(() => fromDicomJson({ [tag]: { vr, Value: [bad] } }, LE))).toBe(
          "UNREPRESENTABLE_NUMBER",
        );
      }
    }
  });

  it("refuses a number JSON or the VR cannot hold, and a value that is not a number", () => {
    for (const [tag, vr] of [
      ["00280010", "US"],
      ["00189089", "FD"],
      ["00089459", "FL"],
      ["00101020", "DS"],
      ["00200013", "IS"],
    ] as const) {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(refusal(() => fromDicomJson({ [tag]: { vr, Value: [bad] } }, LE))).toBe(
          "UNREPRESENTABLE_NUMBER",
        );
      }
      // PS3.18 F.2.3 gives DS and IS a JSON string as well as a number; the binary numbers only
      // a number.
      expect(refusal(() => fromDicomJson({ [tag]: { vr, Value: ["1"] } }, LE))).toBe(
        vr === "DS" || vr === "IS" ? undefined : "INVALID_JSON",
      );
    }
    expect(refusal(() => fromDicomJson({ "00089459": { vr: "FL", Value: [1e300] } }, LE))).toBe(
      "UNREPRESENTABLE_NUMBER",
    );
    const nan = Buffer.alloc(4);
    nan.writeFloatLE(Number.NaN);
    expect(refusal(() => one("00089459", "FL", nan))).toBe("UNREPRESENTABLE_NUMBER");
  });

  it("writes an empty number, AT, binary, SV and UV value as an attribute with no value", () => {
    for (const [tag, vr] of [
      ["00280010", "US"],
      ["00209165", "AT"],
      ["00282000", "OB"],
      ["00720082", "SV"],
      ["0008040C", "UV"],
    ] as const) {
      expect(one(tag, vr, Buffer.alloc(0))).toEqual({ vr });
      expect(again({ [tag]: { vr } })).toEqual({ [tag]: { vr } });
    }
  });

  it("refuses an AT value whose length is not a whole number of tags", () => {
    expect(refusal(() => one("00209165", "AT", Buffer.alloc(6)))).toBe("MALFORMED_VALUE");
    expect(refusal(() => one("00209165", "AT", Buffer.alloc(2)))).toBe("MALFORMED_VALUE");
  });
});

describe("binary values", () => {
  it("reads every binary VR as InlineBinary and refuses the swapped ones inline under Big Endian", () => {
    const swapped: [string, VR][] = [
      ["0014410C", "OD"],
      ["0014410B", "OF"],
      ["00660040", "OL"],
      ["00720081", "OV"],
      ["00281201", "OW"],
    ];
    const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const [tag, vr] of swapped) {
      expect(one(tag, vr, bytes)).toEqual({ vr, InlineBinary: bytes.toString("base64") });
      expect(refusal(() => one(tag, vr, bytes, TS_EXPLICIT_BE))).toBe("UNSUPPORTED_BYTE_ORDER");
      expect(
        refusal(() => fromDicomJson({ [tag]: { vr, InlineBinary: bytes.toString("base64") } }, BE)),
      ).toBe("UNSUPPORTED_BYTE_ORDER");
      // Bulk data fetched by URI is Little Endian (PS3.18 8.7.3.3.1), swapped rather than refused.
      expect(
        refusal(() =>
          fromDicomJson(
            { [tag]: { vr, BulkDataURI: "https://example.com/bulk/1" } },
            { ...BE, resolveBulkData: () => bytes },
          ),
        ),
      ).toBeUndefined();
      expect(again({ [tag]: { vr } }, BE)).toEqual({ [tag]: { vr } });
    }
    expect(one("00282000", "OB", bytes, TS_EXPLICIT_BE)).toEqual({
      vr: "OB",
      InlineBinary: bytes.toString("base64"),
    });
  });

  it("reads only canonical base64, as a string", () => {
    for (const inline of ["AQ=", "AQIDB", "AQ ID", "AQIDBA=", "AQ==\n", 5]) {
      const attr = { vr: "OB", InlineBinary: inline } as unknown as DicomJsonAttribute;
      expect(refusal(() => fromDicomJson({ "00282000": attr }, LE))).toBe("INVALID_JSON");
    }
    expect(valueBytes("00282000", { vr: "OB", InlineBinary: "AQIDBAU=" })).toEqual(
      Buffer.from([1, 2, 3, 4, 5, 0]),
    );
    expect(valueBytes("00282000", { vr: "OB", InlineBinary: "+/+/" })).toEqual(
      Buffer.from([0xfb, 0xff, 0xbf, 0x00]),
    );
  });

  it("takes a BulkDataURI's bytes from resolveBulkData, as a Buffer or a Uint8Array", () => {
    const seen: [string, string][] = [];
    const ds = fromDicomJson(
      { "00282000": { vr: "OB", BulkDataURI: "https://example.com/bulk/7" } },
      {
        ...LE,
        resolveBulkData: (uri, vr) => {
          seen.push([uri, vr]);
          return new Uint8Array([9, 8]);
        },
      },
    );
    expect(seen).toEqual([["https://example.com/bulk/7", "OB"]]);
    expect(ds.get("00282000")?.rawBytes).toEqual(Buffer.from([9, 8]));
    const uri = { vr: "OB", BulkDataURI: 5 } as unknown as DicomJsonAttribute;
    expect(
      refusal(() =>
        fromDicomJson({ "00282000": uri }, { ...LE, resolveBulkData: () => Buffer.alloc(2) }),
      ),
    ).toBe("INVALID_JSON");
    expect(
      refusal(() =>
        fromDicomJson(
          { "00282000": { vr: "OB", BulkDataURI: "https://example.com/bulk/8" } },
          { ...LE, resolveBulkData: () => undefined },
        ),
      ),
    ).toBe("BULK_DATA_UNRESOLVED");
  });

  it("refuses a binary VR carried as a Value, or both inline and by URI", () => {
    const attrs: DicomJsonAttribute[] = [
      { vr: "OB", Value: [1] },
      { vr: "OB", InlineBinary: "AQI=", BulkDataURI: "https://example.com/bulk/1" },
      { vr: "OB", Value: [1], InlineBinary: "AQI=" },
    ];
    for (const attr of attrs) {
      expect(refusal(() => fromDicomJson({ "00282000": attr }, LE))).toBe("INVALID_JSON");
    }
  });
});

describe("structure", () => {
  it("leaves out a retired Group Length", () => {
    const json = jsonOf([
      { tag: "00080000", vr: "UL", value: Buffer.from([4, 0, 0, 0]) },
      { tag: "00080060", vr: "CS", value: latin1("CT") },
    ]);
    expect(json).toEqual({ "00080060": { vr: "CS", Value: ["CT"] } });
  });

  it("refuses a Sequence the reader did not descend", () => {
    const sq = new Element({
      tag: "0040A730",
      vr: "SQ",
      vm: 1,
      length: 0,
      rawBytes: Buffer.alloc(0),
      byteOffset: 0,
      littleEndian: true,
    });
    const ds = new Dataset({ warnings: [], elements: new Map([["0040A730", sq]]) });
    expect(refusal(() => toDicomJson(ds))).toBe("UNSUPPORTED_ELEMENT");
  });

  it("refuses a Sequence of another shape", () => {
    for (const attr of [
      { vr: "SQ", Value: "item" },
      { vr: "SQ", Value: 5 },
      { vr: "SQ", Value: {} },
      { vr: "SQ", Value: [null] },
      { vr: "SQ", BulkDataURI: "https://example.com/bulk/1" },
    ]) {
      expect(refusal(() => fromDicomJson({ "0040A730": attr as DicomJsonAttribute }, LE))).toBe(
        "INVALID_JSON",
      );
    }
  });

  it("refuses keys and attributes of another shape", () => {
    for (const json of [
      null,
      { "00209165": { vr: "AT", Value: [12345678] } },
      { "001000100": { vr: "LO" } },
      { "100100010": { vr: "LO" } },
      { "00100010": null },
      { "00100010": { vr: 5 } },
      { "00020000": { vr: "UL", Value: [4] } },
      { FFFEE00D: { vr: "UN" } },
      { "00100020": { vr: "LO", BulkDataURI: "https://example.com/bulk/1" } },
      { "00100010": { vr: "PN", Value: [{ Alphabetic: 5 }] } },
      { "00100010": { vr: "PN", Value: [{ Phonetic: "P", Ideographic: 5 }] } },
      { "00100010": { vr: "PN", Value: [5] } },
      { "00100010": { vr: "PN", Value: [[]] } },
    ]) {
      expect(refusal(() => fromDicomJson(json as unknown as DicomJsonDataset, LE))).toBe(
        "INVALID_JSON",
      );
    }
    expect(refusal(() => fromDicomJson({ "00100020": { vr: "XX" } }, LE))).toBe("UNSUPPORTED_VR");
  });

  it("writes a short-form value up to 65,534 bytes and refuses one past it", () => {
    const max = "A".repeat(0xfffe);
    expect(valueBytes("00100020", { vr: "LO", Value: [max] }).length).toBe(0xfffe);
    expect(
      refusal(() => fromDicomJson({ "00100020": { vr: "LO", Value: [`${max}AB`] } }, LE)),
    ).toBe("VALUE_TOO_LONG");
    const implicit = { fileMeta: { transferSyntaxUID: TS_IMPLICIT_LE } };
    expect(valueBytes("00100020", { vr: "LO", Value: [`${max}AB`] }, implicit).length).toBe(
      0x10000,
    );
  });

  it("writes the same bytes from its own JSON, and serializeDicom writes them unchanged", () => {
    const json: DicomJsonDataset = {
      "00080060": { vr: "CS", Value: ["CT"] },
      "0040A730": {
        vr: "SQ",
        Value: [{ "00100020": { vr: "LO", Value: ["MRN-42"] } }, { "00100020": { vr: "LO" } }],
      },
    };
    for (const sequenceLength of ["defined", "undefined"] as const) {
      const ds = fromDicomJson(json, { ...LE, sequenceLength });
      expect(ds.warnings.map((w) => w.code)).toEqual([]);
      const bytes = serializeDicom(ds);
      expect(
        serializeDicom(fromDicomJson(toDicomJson(parseDicom(bytes)), { ...LE, sequenceLength })),
      ).toEqual(bytes);
      expect(ds.get("0040A730")?.length).toBe(sequenceLength === "undefined" ? 0xffffffff : 38);
    }
  });
});

describe("DicomJsonError", () => {
  it("carries the code, the rendered tag and fixed text, and nothing else", () => {
    const messages: Record<string, string> = {
      UNSUPPORTED_VR:
        "The element's VR has no DICOM JSON form we write: SV and UV are refused until their JSON form is confirmed, and a VR PS3.5 does not define has none.",
      UNSUPPORTED_ELEMENT:
        "The element's value cannot be held as DICOM JSON metadata: an encapsulated fragment stream with no BulkDataURI, an undefined-length value that is not a Sequence, or a Sequence that was not read.",
      UNSUPPORTED_BYTE_ORDER:
        "An OW, OF, OD, OL or OV value under Explicit VR Big Endian is refused: PS3.18 Annex F leaves the byte order of its InlineBinary open.",
      UNREPRESENTABLE_NUMBER:
        "A number cannot be carried exactly: NaN, an infinity or an FL or FD negative zero, a DS or IS value that is not a number or that a JSON number does not hold exactly, one too long for its VR, or an FL value outside float32's normal range.",
      MALFORMED_VALUE:
        "A value is not well formed for its VR: a binary length that is not a whole number of values, a DS or IS string that is not one or is too long, a Person Name with more than three component groups, text its Specific Character Set does not decode, or a control character the VR does not allow.",
      INVALID_JSON:
        "The input is not a DICOM JSON Model object of the shape PS3.18 Annex F gives, or one value holds a delimiter its VR splits on.",
      BULK_DATA_UNRESOLVED:
        "A BulkDataURI was not resolved to bytes by the resolveBulkData option.",
      UNSUPPORTED_CHARACTER_SET:
        "The Specific Character Set is not one we carry: only one value, the default repertoire, a single-byte ISO_IR set or ISO_IR 192, with no code extensions; and text outside 7-bit ASCII is written only under the default repertoire, ISO_IR 100 and ISO_IR 192, and only where it reads back as the same text.",
      UNSUPPORTED_TRANSFER_SYNTAX:
        "fromDicomJson writes only Implicit VR Little Endian, Explicit VR Little Endian, Explicit VR Big Endian and Deflated Explicit VR Little Endian.",
      VALUE_TOO_LONG: "A value is too long for the Value Length Field of its VR.",
      BULK_DATA_URI_REQUIRED:
        "A bulk value such as Pixel Data is not written inline unless the inlineBulkData option is set: give it a URI through the bulkDataUri option.",
      VR_MISMATCH:
        "The written Data Set reads back with another VR than the JSON gives: under Implicit VR Little Endian the reader takes the VR PS3.5 and the dictionary give the tag, and UN for a private one.",
      NESTING_TOO_DEEP: "Sequences are nested more than 64 deep, past what parseDicom reads.",
      INVALID_OPTION:
        "An option is not a value the converter takes: fallbackCharacterSet must be a term of FALLBACK_CHARACTER_SETS, and fallbackCharacterSetForUnknown a boolean given with it.",
      CONVERSION_FAILED:
        "The conversion failed with an error no other code names, such as one a callback threw; that error is not kept, since its message could hold a value.",
    };
    expect(Object.keys(DICOM_JSON_ERROR_CODES).sort()).toEqual(Object.keys(messages).sort());
    for (const [key, code] of Object.entries(DICOM_JSON_ERROR_CODES)) {
      expect(code).toBe(key);
      const err = new DicomJsonError(code, "00100010");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("DicomJsonError");
      expect(err.code).toBe(code);
      expect(err.tag).toBe("00100010");
      expect(err.message).toBe(`[${code}] ${messages[code] ?? ""} Tag: 00100010.`);
    }
    expect(Object.isFrozen(DICOM_JSON_ERROR_CODES)).toBe(true);
  });

  it("names a registered tag and withholds any other", () => {
    const tagOf = (json: unknown): string | undefined => {
      try {
        fromDicomJson(json as DicomJsonDataset, LE);
      } catch (err) {
        return (err as DicomJsonError).tag;
      }
      return undefined;
    };
    expect(tagOf({ "00100020": { vr: "LO", Value: [1] } })).toBe("00100020");
    expect(tagOf({ "0020000D": { vr: "UI", Value: [1] } })).toBe("0020000D");
    expect(tagOf({ "00080005": { vr: "CS", Value: "ISO_IR 192" } })).toBe("00080005");
    expect(tagOf({ "00080005": { vr: "CS", Value: [5] } })).toBe("00080005");
    expect(tagOf({ "00080005": { vr: "CS", Value: ["ISO 2022 IR 100"] } })).toBe("00080005");
    expect(tagOf({ "00091001": { vr: "LO", Value: [1] } })).toBe("<withheld>");
    expect(tagOf({ "0010002": { vr: "LO" } })).toBe("<withheld>");
    expect(tagOf([])).toBe("<withheld>");
    expect(
      (() => {
        try {
          fromDicomJson({}, { fileMeta: { transferSyntaxUID: "1.2.3" } });
        } catch (err) {
          return (err as DicomJsonError).tag;
        }
        return undefined;
      })(),
    ).toBe("<withheld>");
  });
});

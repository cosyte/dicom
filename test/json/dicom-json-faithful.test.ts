/**
 * The converters give back exactly what they were given, or refuse with a code: never a value
 * changed on the way. One case for each way a value could change silently, each seen to change
 * before the converters refused it. Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DICOM_JSON_ERROR_CODES,
  DicomJsonError,
  decodeText,
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

const LE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE } };
const IMPLICIT: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_IMPLICIT_LE } };

function latin1(s: string): Buffer {
  return Buffer.from(s, "latin1");
}

function u16(...values: number[]): Buffer {
  const out = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => out.writeUInt16LE(v, i * 2));
  return out;
}

function parsed(elements: BuildDicomElement[]): ReturnType<typeof parseDicom> {
  return parseDicom(buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements }));
}

function one(tag: string, vr: VR, value: Buffer): DicomJsonAttribute {
  return toDicomJson(parsed([{ tag, vr, value }]))[tag] as DicomJsonAttribute;
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

describe("Implicit VR: the VR the JSON names is the VR read back", () => {
  it("refuses a VR the reader would not give the tag under Implicit VR", () => {
    const cases: DicomJsonDataset[] = [
      // Smallest Image Pixel Value reads as US with no Pixel Representation of 1.
      { "00280106": { vr: "SS", Value: [-1] } },
      // Rows is US alone.
      { "00280010": { vr: "UL", Value: [70000] } },
      // A private value under Implicit VR reads as UN.
      {
        "00090010": { vr: "LO", Value: ["SYNTHETIC CREATOR"] },
        "00091001": { vr: "DS", Value: [1.5] },
      },
      // A public text tag carried as UN would be read back as its own VR.
      { "00100020": { vr: "UN", InlineBinary: latin1("ID42").toString("base64") } },
    ];
    for (const json of cases) {
      expect(refusal(() => fromDicomJson(json, IMPLICIT))).toBe("VR_MISMATCH");
    }
  });

  it("refuses a private Sequence of defined length, which reads back as UN, and keeps one of undefined length", () => {
    const json: DicomJsonDataset = {
      "00090010": { vr: "LO", Value: ["SYNTHETIC CREATOR"] },
      "00091002": { vr: "SQ", Value: [{ "00100020": { vr: "LO", Value: ["ID42"] } }] },
    };
    expect(refusal(() => fromDicomJson(json, IMPLICIT))).toBe("VR_MISMATCH");
    const undefinedLength = { ...IMPLICIT, sequenceLength: "undefined" } as const;
    expect(toDicomJson(fromDicomJson(json, undefinedLength))).toEqual(json);
  });

  it("refuses a mismatch inside a Sequence Item too", () => {
    const json: DicomJsonDataset = {
      "0040A730": { vr: "SQ", Value: [{ "00280010": { vr: "SS", Value: [-2] } }] },
    };
    expect(refusal(() => fromDicomJson(json, IMPLICIT))).toBe("VR_MISMATCH");
  });

  it("names a withheld tag for a private mismatch, and the registered one otherwise", () => {
    const priv: DicomJsonDataset = {
      "00090010": { vr: "LO", Value: ["SYNTHETIC CREATOR"] },
      "00091001": { vr: "DS", Value: [1.5] },
    };
    try {
      fromDicomJson(priv, IMPLICIT);
      expect.unreachable();
    } catch (err) {
      expect((err as DicomJsonError).tag).toBe("<withheld>");
    }
    try {
      fromDicomJson({ "00280010": { vr: "UL", Value: [70000] } }, IMPLICIT);
      expect.unreachable();
    } catch (err) {
      expect((err as DicomJsonError).tag).toBe("00280010");
    }
  });

  it("checks a key given in lowercase hex against the tag it names", () => {
    const json = { "0008103e": { vr: "LO", Value: ["SYNTH"] } };
    expect(toDicomJson(fromDicomJson(json, IMPLICIT))).toEqual({
      "0008103E": { vr: "LO", Value: ["SYNTH"] },
    });
  });

  it("writes the VR the multi-VR rules give, and the same JSON under Explicit VR", () => {
    const json: DicomJsonDataset = {
      "00280103": { vr: "US", Value: [1] },
      "00280106": { vr: "SS", Value: [-1] },
    };
    expect(toDicomJson(fromDicomJson(json, IMPLICIT))).toEqual(json);
    const ss = { "00280010": { vr: "UL", Value: [70000] } };
    expect(toDicomJson(fromDicomJson(ss, LE))).toEqual(ss);
  });
});

describe("a delimiter inside a value is refused, never split on", () => {
  it("refuses a backslash in a multi-valued string VR", () => {
    for (const vr of ["AE", "AS", "CS", "DA", "DT", "LO", "SH", "TM", "UC", "UI"]) {
      const json = { "00090010": { vr, Value: ["A\\B"] } };
      expect(refusal(() => fromDicomJson(json, LE))).toBe(DICOM_JSON_ERROR_CODES.INVALID_JSON);
    }
  });

  it("keeps a backslash in a single-valued text VR", () => {
    const json = { "00104000": { vr: "LT", Value: ["A\\B"] } };
    expect(toDicomJson(fromDicomJson(json, LE))).toEqual(json);
  });

  it("refuses = or a backslash inside a Person Name group, and keeps ^", () => {
    for (const group of ["A=B", "A\\B", "=", "\\"]) {
      for (const key of ["Alphabetic", "Ideographic", "Phonetic"]) {
        const json = { "00100010": { vr: "PN", Value: [{ [key]: group }] } };
        expect(refusal(() => fromDicomJson(json, LE))).toBe(DICOM_JSON_ERROR_CODES.INVALID_JSON);
      }
    }
    const caret = { "00100010": { vr: "PN", Value: [{ Alphabetic: "DOE^JANE^^^" }] } };
    expect(toDicomJson(fromDicomJson(caret, LE))).toEqual(caret);
  });
});

describe("a number JSON cannot carry exactly is refused", () => {
  it("refuses a DS whose double is not its decimal value", () => {
    for (const text of ["9007199254740993", "9999999999999999", "1e-400", "0.10000000000000001"]) {
      expect(refusal(() => one("00101020", "DS", latin1(text)))).toBe(
        DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER,
      );
    }
  });

  it("keeps a DS whose text changes form but not value", () => {
    for (const [text, n] of [
      ["1.0", 1],
      ["+0012.50", 12.5],
      ["-0", 0],
      ["0.000", 0],
      ["-2.50", -2.5],
      ["-0012.50", -12.5],
      ["0.1", 0.1],
      ["1.5E3", 1500],
      ["9007199254740992", 9007199254740992],
    ] as const) {
      expect(one("00101020", "DS", latin1(text))).toEqual({ vr: "DS", Value: [n] });
    }
  });

  it("writes back a DS whose shortest JavaScript text is past 16 characters", () => {
    const json = toDicomJson(parsed([{ tag: "00101020", vr: "DS", value: latin1("100E14") }]));
    expect(json["00101020"]).toEqual({ vr: "DS", Value: [1e16] });
    const back = fromDicomJson(json, LE).get("00101020")?.rawBytes ?? Buffer.alloc(0);
    expect(Buffer.from(back)).toEqual(latin1("1e16"));
  });

  it("refuses an FL that underflows float32, and keeps one float32 holds or rounds normally", () => {
    for (const n of [1e-50, 1e-45, -1e-42, 4e38]) {
      const json = { "00089459": { vr: "FL", Value: [n] } };
      expect(refusal(() => fromDicomJson(json, LE))).toBe(
        DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER,
      );
    }
    const subnormal = Math.fround(1e-45);
    const exact = { "00089459": { vr: "FL", Value: [subnormal, 0, 0.5] } };
    expect(toDicomJson(fromDicomJson(exact, LE))).toEqual(exact);
    // Rounding to the nearest float32 in its normal range is how every FL writer reads a number.
    const near = [0.1, -0.1, 2 ** -126 * (1 + 2 ** -30)];
    const rounded = fromDicomJson({ "00089459": { vr: "FL", Value: near } }, LE);
    expect(toDicomJson(rounded)).toEqual({
      "00089459": { vr: "FL", Value: [Math.fround(0.1), Math.fround(-0.1), 2 ** -126] },
    });
  });
});

describe("a Person Name has at most three component groups", () => {
  it("refuses a fourth group rather than drop it", () => {
    expect(refusal(() => one("00100010", "PN", latin1("A=B=C=D ")))).toBe(
      DICOM_JSON_ERROR_CODES.MALFORMED_VALUE,
    );
    expect(refusal(() => one("00100010", "PN", latin1("X\\A=B=C=D=")))).toBe(
      DICOM_JSON_ERROR_CODES.MALFORMED_VALUE,
    );
    expect(one("00100010", "PN", latin1("A=B=C "))).toEqual({
      vr: "PN",
      Value: [{ Alphabetic: "A", Ideographic: "B", Phonetic: "C" }],
    });
  });
});

describe("text bytes its character set does not decode are refused", () => {
  function utf8Lo(bytes: number[]): () => unknown {
    return () =>
      toDicomJson(
        parsed([
          { tag: "00080005", vr: "CS", value: latin1("ISO_IR 192") },
          { tag: "00100020", vr: "LO", value: Buffer.from(bytes) },
        ]),
      );
  }

  it("refuses invalid UTF-8 under ISO_IR 192, never writing U+FFFD", () => {
    expect(refusal(utf8Lo([0x41, 0x42, 0xff, 0xfe]))).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
    expect(refusal(utf8Lo([0x41, 0xc3]))).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
  });

  it("keeps a real U+FFFD and a leading byte order mark", () => {
    const fffd = [0x41, 0xef, 0xbf, 0xbd];
    expect((utf8Lo(fffd)() as DicomJsonDataset)["00100020"]).toEqual({
      vr: "LO",
      Value: ["A�"],
    });
    const bom = [0xef, 0xbb, 0xbf, 0x41];
    const json = utf8Lo(bom)() as DicomJsonDataset;
    expect(json["00100020"]).toEqual({ vr: "LO", Value: ["﻿A"] });
    expect(Buffer.from(fromDicomJson(json, LE).get("00100020")?.rawBytes ?? [])).toEqual(
      Buffer.from([...bom]),
    );
  });

  it("decodes code extensions as the reader does, escape sequences left out", () => {
    const terms = ["", "ISO 2022 IR 149"];
    // ESC $ ) C designates KS X 1001 to G1; then the two bytes of one Hangul syllable.
    const bytes = Buffer.from([0x1b, 0x24, 0x29, 0x43, 0xb1, 0xe8]);
    const json = toDicomJson(
      parsed([
        { tag: "00080005", vr: "CS", value: latin1("\\ISO 2022 IR 149 ") },
        { tag: "00100020", vr: "LO", value: bytes },
      ]),
    );
    const text = decodeText(bytes, terms);
    expect(text).not.toContain("\u001b");
    expect(json["00100020"]).toEqual({ vr: "LO", Value: [text] });
  });

  it("refuses bytes no designated set decodes under code extensions", () => {
    const run = (): unknown =>
      toDicomJson(
        parsed([
          { tag: "00080005", vr: "CS", value: latin1("\\ISO 2022 IR 87") },
          // ESC $ B, then a JIS X 0208 row no character is in, then ESC ( B.
          {
            tag: "00100020",
            vr: "LO",
            value: Buffer.from([0x1b, 0x24, 0x42, 0x75, 0x21, 0x1b, 0x28, 0x42]),
          },
        ]),
      );
    expect(refusal(run)).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
  });
});

describe("bulk values are never written inline by default", () => {
  const bulk: [string, VR][] = [
    ["7FE00008", "OF"],
    ["7FE00009", "OD"],
    ["7FE00010", "OW"],
    ["60003000", "OW"],
    ["601E3000", "OW"],
    ["54001010", "OW"],
    ["56000020", "OF"],
    ["00420011", "OB"],
  ];

  it("refuses Pixel Data and the other bulk tags with no URI and no opt-in", () => {
    for (const [tag, vr] of bulk) {
      const ds = parsed([{ tag, vr, value: u16(1, 2) }]);
      expect(refusal(() => toDicomJson(ds))).toBe("BULK_DATA_URI_REQUIRED");
      expect(refusal(() => toDicomJson(ds, { bulkDataUri: () => undefined }))).toBe(
        "BULK_DATA_URI_REQUIRED",
      );
      expect(toDicomJson(ds, { inlineBulkData: true })[tag]).toEqual({
        vr,
        InlineBinary: u16(1, 2).toString("base64"),
      });
      expect(toDicomJson(ds, { bulkDataUri: () => "https://example.com/b" })[tag]).toEqual({
        vr,
        BulkDataURI: "https://example.com/b",
      });
    }
  });

  it("refuses a bulk tag inside a Sequence Item too, and writes an empty one", () => {
    const ds = parsed([
      {
        tag: "54000100",
        items: [{ elements: [{ tag: "54001010", vr: "OW", value: u16(7) }] }],
      } as unknown as BuildDicomElement,
    ]);
    expect(refusal(() => toDicomJson(ds))).toBe("BULK_DATA_URI_REQUIRED");
    const empty = parsed([{ tag: "7FE00010", vr: "OW", value: Buffer.alloc(0) }]);
    expect(toDicomJson(empty)).toEqual({ "7FE00010": { vr: "OW" } });
  });

  it("writes any other binary value inline as before", () => {
    // Overlay Data is the even groups 6000 to 601E only, and element 3000 only.
    for (const tag of ["60013000", "60203000", "5FFE3000", "60003002", "7FE00011"]) {
      expect(one(tag, "OW", u16(5))).toEqual({ vr: "OW", InlineBinary: u16(5).toString("base64") });
    }
    expect(one("00282000", "OB", Buffer.from([1, 2, 3, 4]))).toEqual({
      vr: "OB",
      InlineBinary: "AQIDBA==",
    });
    const bytes = serializeDicom(parsed([{ tag: "00282000", vr: "OB", value: u16(9) }]));
    expect(toDicomJson(parseDicom(bytes))["00282000"]).toEqual({
      vr: "OB",
      InlineBinary: u16(9).toString("base64"),
    });
  });
});

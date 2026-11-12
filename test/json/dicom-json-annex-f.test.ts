/**
 * `toDicomJson` and `fromDicomJson` against the clauses of PS3.18 Annex F that settle a form the
 * converters once refused: `DS` and `IS` as JSON strings (F.2.3), a `BulkDataURI` on each VR F.2.2
 * names, the byte order of bulk data fetched by URI (PS3.18 8.7.3.3.1), and encapsulated Pixel Data,
 * for which the annex has no inline form. Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
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
import { buildDicom } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_JPEG_2000 = "1.2.840.10008.1.2.4.90";

const LE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE } };
const BE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_EXPLICIT_BE } };

function refusal(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof DicomJsonError) return err.code;
    throw err;
  }
  return undefined;
}

/** The bytes `fromDicomJson` writes for one attribute, as the reader holds them. */
function written(tag: string, attr: DicomJsonAttribute, options: FromDicomJsonOptions): Buffer {
  const ds = fromDicomJson({ [tag]: attr }, options);
  expect(ds.warnings).toEqual([]);
  return Buffer.from(ds.get(tag)?.rawBytes ?? Buffer.alloc(0));
}

describe("DS and IS as JSON strings (PS3.18 F.2.3)", () => {
  it("writes a DS or IS string as its own text, padded to even length", () => {
    const cases: [string, "DS" | "IS", NonNullable<DicomJsonAttribute["Value"]>, string][] = [
      ["00101020", "DS", ["1.50"], "1.50"],
      ["00101020", "DS", ["+1.0E2"], "+1.0E2"],
      ["00101020", "DS", ["3.14159265358979"], "3.14159265358979"],
      ["00101020", "DS", ["9007199254740993"], "9007199254740993"],
      ["00101020", "DS", ["  7  "], "  7   "],
      ["00101020", "DS", ["1e999"], "1e999 "],
      ["0040A30A", "DS", ["1.50", 2, null, " 7 "], "1.50\\2\\\\ 7  "],
      ["00200013", "IS", ["007"], "007 "],
      ["00200013", "IS", ["+42"], "+42 "],
      ["00720064", "IS", ["-2147483648", "2147483647"], "-2147483648\\2147483647"],
      ["00720064", "IS", ["1", "-2147483648"], "1\\-2147483648 "],
      ["00720064", "IS", ["000000000012"], "000000000012"],
    ];
    for (const [tag, vr, value, text] of cases) {
      expect(written(tag, { vr, Value: value }, LE).toString("latin1")).toBe(text);
    }
  });

  it("reads the written text back as the number it names", () => {
    const ds = fromDicomJson(
      {
        "00101020": { vr: "DS", Value: ["1.50"] },
        "00200013": { vr: "IS", Value: ["007"] },
      },
      LE,
    );
    expect(toDicomJson(ds)).toEqual({
      "00101020": { vr: "DS", Value: [1.5] },
      "00200013": { vr: "IS", Value: [7] },
    });
  });

  it("refuses a string that is not a DS or IS, or is longer than its VR allows", () => {
    const malformed: [string, "DS" | "IS", string][] = [
      ["00101020", "DS", "TALL"],
      ["00101020", "DS", "1.5.0"],
      ["00101020", "DS", "1,5"],
      ["00101020", "DS", "1\\2"],
      ["00101020", "DS", "1 2"],
      ["00200013", "IS", "1 2"],
      ["00101020", "DS", "0.10000000000000001"],
      ["00101020", "DS", "12345678901234567"],
      ["00200013", "IS", "1.5"],
      ["00200013", "IS", "1e3"],
      ["00200013", "IS", "+0000000000042"],
    ];
    for (const [tag, vr, value] of malformed) {
      expect(refusal(() => fromDicomJson({ [tag]: { vr, Value: [value] } }, LE))).toBe(
        "MALFORMED_VALUE",
      );
    }
    for (const value of ["2147483648", "-2147483649"]) {
      expect(refusal(() => fromDicomJson({ "00200013": { vr: "IS", Value: [value] } }, LE))).toBe(
        "UNREPRESENTABLE_NUMBER",
      );
    }
  });

  it("writes an empty string as an empty value", () => {
    expect(written("00101020", { vr: "DS", Value: [""] }, LE)).toEqual(Buffer.alloc(0));
    expect(written("0040A30A", { vr: "DS", Value: ["", "1"] }, LE).toString("latin1")).toBe("\\1");
  });
});

/** One tag of each VR PS3.18 F.2.2 allows a BulkDataURI on. */
const BULK_DATA_URI_VRS: readonly [string, string][] = [
  ["00720072", "DS"],
  ["00720076", "FL"],
  ["00720074", "FD"],
  ["00720064", "IS"],
  ["00720068", "LT"],
  ["00282000", "OB"],
  ["0014410C", "OD"],
  ["0014410B", "OF"],
  ["00660040", "OL"],
  ["00720081", "OV"],
  ["00281201", "OW"],
  ["0072007C", "SL"],
  ["0072007E", "SS"],
  ["0072006E", "ST"],
  ["00720082", "SV"],
  ["0072006F", "UC"],
  ["00720078", "UL"],
  ["0072006D", "UN"],
  ["0072007A", "US"],
  ["00720070", "UT"],
  ["0008040C", "UV"],
];

describe("BulkDataURI on each VR PS3.18 F.2.2 names", () => {
  it("hands the URI and the VR to resolveBulkData and writes the bytes it returns", () => {
    expect(BULK_DATA_URI_VRS).toHaveLength(21);
    const bytes = Buffer.from("SYNTHETIC 12345678 VALUE", "latin1");
    for (const [tag, vr] of BULK_DATA_URI_VRS) {
      const seen: [string, string][] = [];
      const options: FromDicomJsonOptions = {
        ...LE,
        resolveBulkData: (uri, asked) => {
          seen.push([uri, asked]);
          return bytes;
        },
      };
      const uri = `https://example.com/bulk/${tag}`;
      expect(written(tag, { vr, BulkDataURI: uri }, options)).toEqual(bytes);
      expect(seen).toEqual([[uri, vr]]);
    }
  });

  it("refuses a BulkDataURI on the VRs F.2.2 does not name, and one beside a Value", () => {
    const resolveBulkData = (): Buffer => Buffer.from("SYNTHETIC1", "latin1");
    const options = { ...LE, resolveBulkData };
    const refused: [string, string][] = [
      ["00080054", "AE"],
      ["00101010", "AS"],
      ["00209165", "AT"],
      ["00720062", "CS"],
      ["00080020", "DA"],
      ["0008002A", "DT"],
      ["00720066", "LO"],
      ["0072006A", "PN"],
      ["0072006C", "SH"],
      ["00080030", "TM"],
      ["0020000D", "UI"],
      ["0040E010", "UR"],
    ];
    for (const [tag, vr] of refused) {
      expect(
        refusal(() =>
          fromDicomJson({ [tag]: { vr, BulkDataURI: "https://example.com/b" } }, options),
        ),
      ).toBe("INVALID_JSON");
    }
    for (const attr of [
      { vr: "US", Value: [1], BulkDataURI: "https://example.com/b" },
      { vr: "LT", Value: ["SYNTHETIC"], BulkDataURI: "https://example.com/b" },
      { vr: "US", InlineBinary: "AQA=" },
      { vr: "US", BulkDataURI: 5 },
    ]) {
      expect(
        refusal(() =>
          fromDicomJson({ "0072007A": attr as unknown as DicomJsonAttribute }, options),
        ),
      ).toBe("INVALID_JSON");
    }
    expect(
      refusal(() =>
        fromDicomJson({ "0072007A": { vr: "US", BulkDataURI: "https://example.com/b" } }, LE),
      ),
    ).toBe("BULK_DATA_UNRESOLVED");
  });

  it("refuses resolved bytes that are not a whole number of values of a number VR", () => {
    for (const [tag, vr, length] of [
      ["0072007A", "US", 3],
      ["0072007E", "SS", 1],
      ["00720078", "UL", 6],
      ["0072007C", "SL", 2],
      ["00720076", "FL", 2],
      ["00720074", "FD", 4],
      ["00720082", "SV", 4],
      ["0008040C", "UV", 12],
    ] as const) {
      expect(
        refusal(() =>
          fromDicomJson(
            { [tag]: { vr, BulkDataURI: "https://example.com/b" } },
            { ...LE, resolveBulkData: () => Buffer.alloc(length) },
          ),
        ),
      ).toBe("MALFORMED_VALUE");
    }
  });

  it("reads text fetched by URI back as the reader decodes it", () => {
    const store = new Map([
      ["https://example.com/note", Buffer.from("SYNTHETIC NOTE", "latin1")],
      ["https://example.com/ds", Buffer.from("1.5\\2", "latin1")],
    ]);
    const ds = fromDicomJson(
      {
        "00720068": { vr: "LT", BulkDataURI: "https://example.com/note" },
        "00720072": { vr: "DS", BulkDataURI: "https://example.com/ds" },
      },
      { ...LE, resolveBulkData: (uri) => store.get(uri) },
    );
    expect(toDicomJson(ds)).toEqual({
      "00720068": { vr: "LT", Value: ["SYNTHETIC NOTE"] },
      "00720072": { vr: "DS", Value: [1.5, 2] },
    });
  });

  it("still refuses a VR the read-back gives otherwise, under Implicit VR", () => {
    expect(
      refusal(() =>
        fromDicomJson(
          { "00280106": { vr: "SS", BulkDataURI: "https://example.com/b" } },
          {
            fileMeta: { transferSyntaxUID: TS_IMPLICIT_LE },
            resolveBulkData: () => Buffer.from([0xff, 0xff]),
          },
        ),
      ),
    ).toBe("VR_MISMATCH");
  });
});

describe("bulk data under Explicit VR Big Endian (PS3.18 8.7.3.3.1)", () => {
  /** Eight bytes in Little Endian order, the order PS3.18 serves uncompressed bulk data in. */
  const LE_BYTES = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

  it("swaps fetched bytes by the width of each value", () => {
    const widths: [string, string, number[]][] = [
      ["00281201", "OW", [2, 1, 4, 3, 6, 5, 8, 7]],
      ["0072007A", "US", [2, 1, 4, 3, 6, 5, 8, 7]],
      ["0072007E", "SS", [2, 1, 4, 3, 6, 5, 8, 7]],
      ["0014410B", "OF", [4, 3, 2, 1, 8, 7, 6, 5]],
      ["00660040", "OL", [4, 3, 2, 1, 8, 7, 6, 5]],
      ["00720078", "UL", [4, 3, 2, 1, 8, 7, 6, 5]],
      ["0072007C", "SL", [4, 3, 2, 1, 8, 7, 6, 5]],
      ["00720076", "FL", [4, 3, 2, 1, 8, 7, 6, 5]],
      ["0014410C", "OD", [8, 7, 6, 5, 4, 3, 2, 1]],
      ["00720081", "OV", [8, 7, 6, 5, 4, 3, 2, 1]],
      ["00720074", "FD", [8, 7, 6, 5, 4, 3, 2, 1]],
      ["00720082", "SV", [8, 7, 6, 5, 4, 3, 2, 1]],
      ["0008040C", "UV", [8, 7, 6, 5, 4, 3, 2, 1]],
      ["00282000", "OB", [1, 2, 3, 4, 5, 6, 7, 8]],
      ["0072006D", "UN", [1, 2, 3, 4, 5, 6, 7, 8]],
    ];
    for (const [tag, vr, expected] of widths) {
      const options = { ...BE, resolveBulkData: () => new Uint8Array(LE_BYTES) };
      expect(written(tag, { vr, BulkDataURI: "https://example.com/b" }, options)).toEqual(
        Buffer.from(expected),
      );
    }
    // The resolver's own bytes are left as they were.
    const mine = Buffer.from(LE_BYTES);
    written(
      "00281201",
      { vr: "OW", BulkDataURI: "https://example.com/b" },
      {
        ...BE,
        resolveBulkData: () => mine,
      },
    );
    expect(mine).toEqual(LE_BYTES);
  });

  it("reads the swapped values as the numbers the Little Endian bytes hold", () => {
    const ds = fromDicomJson(
      {
        "0072007A": { vr: "US", BulkDataURI: "https://example.com/us" },
        "00720074": { vr: "FD", BulkDataURI: "https://example.com/fd" },
      },
      {
        ...BE,
        resolveBulkData: (uri) => {
          const b = Buffer.alloc(uri.endsWith("us") ? 4 : 8);
          if (uri.endsWith("us")) {
            b.writeUInt16LE(512, 0);
            b.writeUInt16LE(7, 2);
          } else b.writeDoubleLE(2.5, 0);
          return b;
        },
      },
    );
    expect(toDicomJson(ds)).toEqual({
      "00720074": { vr: "FD", Value: [2.5] },
      "0072007A": { vr: "US", Value: [512, 7] },
    });
  });

  it("refuses fetched bytes that are not a whole number of values", () => {
    for (const [tag, vr, length] of [
      ["00281201", "OW", 3],
      ["0014410B", "OF", 6],
      ["0014410C", "OD", 12],
    ] as const) {
      expect(
        refusal(() =>
          fromDicomJson(
            { [tag]: { vr, BulkDataURI: "https://example.com/b" } },
            { ...BE, resolveBulkData: () => Buffer.alloc(length) },
          ),
        ),
      ).toBe("MALFORMED_VALUE");
    }
  });

  it("keeps refusing InlineBinary for the swapped VRs, whose byte order the annex leaves open", () => {
    for (const [tag, vr] of [
      ["00281201", "OW"],
      ["0014410B", "OF"],
      ["0014410C", "OD"],
      ["00660040", "OL"],
      ["00720081", "OV"],
    ] as const) {
      expect(
        refusal(() =>
          fromDicomJson({ [tag]: { vr, InlineBinary: LE_BYTES.toString("base64") } }, BE),
        ),
      ).toBe("UNSUPPORTED_BYTE_ORDER");
    }
  });
});

describe("encapsulated Pixel Data", () => {
  const source = buildDicom({
    transferSyntax: TS_JPEG_2000,
    elements: [
      { tag: "00280010", vr: "US", value: Buffer.from([2, 0]) },
      {
        tag: "7FE00010",
        items: [],
        explicitVr: "OB",
        encapsulatedPixelData: true,
        encapsulatedFragments: [Buffer.alloc(0), Buffer.from([1, 2, 3, 4])],
      },
    ],
  });

  it("is written as the BulkDataURI the caller gives", () => {
    const asked: string[] = [];
    const json = toDicomJson(parseDicom(source), {
      bulkDataUri: (el) => {
        asked.push(el.tag);
        return el.tag === "7FE00010" ? "https://example.com/frames" : undefined;
      },
    });
    expect(asked).toEqual(["7FE00010"]);
    expect(json).toEqual({
      "00280010": { vr: "US", Value: [2] },
      "7FE00010": { vr: "OB", BulkDataURI: "https://example.com/frames" },
    });
  });

  it("is refused with no URI, inline or not, since the annex has no inline form for it", () => {
    const ds = parseDicom(source);
    expect(refusal(() => toDicomJson(ds))).toBe("UNSUPPORTED_ELEMENT");
    expect(refusal(() => toDicomJson(ds, { inlineBulkData: true }))).toBe("UNSUPPORTED_ELEMENT");
    expect(refusal(() => toDicomJson(ds, { bulkDataUri: () => undefined }))).toBe(
      "UNSUPPORTED_ELEMENT",
    );
  });

  it("refuses an undefined-length value of another tag even with a URI", () => {
    const un = new Element({
      tag: "00091010",
      vr: "UN",
      vm: 1,
      length: 0xffffffff,
      rawBytes: Buffer.from([1, 2, 3, 4]),
      byteOffset: 0,
      littleEndian: true,
    });
    const ds = new Dataset({ warnings: [], elements: new Map([["00091010", un]]) });
    expect(refusal(() => toDicomJson(ds, { bulkDataUri: () => "https://example.com/b" }))).toBe(
      "UNSUPPORTED_ELEMENT",
    );
  });
});

describe("round trips that worked before", () => {
  it("still carries a number-form DS and IS, and a binary BulkDataURI, unchanged", () => {
    const json: DicomJsonDataset = {
      "00101020": { vr: "DS", Value: [1.5] },
      "00200013": { vr: "IS", Value: [7] },
      "00282000": { vr: "OB", BulkDataURI: "https://example.com/icc" },
    };
    const ds = fromDicomJson(json, {
      ...LE,
      resolveBulkData: () => Buffer.from([1, 2]),
    });
    expect(serializeDicom(ds).length).toBeGreaterThan(0);
    // Under Little Endian a binary VR's fetched bytes are written as they are, an odd count padded.
    for (const [tag, vr] of [
      ["00281201", "OW"],
      ["0014410C", "OD"],
      ["00282000", "OB"],
    ] as const) {
      expect(
        written(
          tag,
          { vr, BulkDataURI: "https://example.com/b" },
          { ...LE, resolveBulkData: () => Buffer.from([1, 2, 3]) },
        ),
      ).toEqual(Buffer.from([1, 2, 3, 0]));
    }
    expect(toDicomJson(ds, { bulkDataUri: () => "https://example.com/icc" })).toEqual(json);
  });
});

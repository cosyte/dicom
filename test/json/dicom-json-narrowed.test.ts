/**
 * What the DICOM JSON converters accept, narrowed to what they carry faithfully, with each case
 * seen to change a value silently before the converters refused it:
 *
 *   - Specific Character Set: only the default repertoire, the single-byte `ISO_IR` sets without
 *     code extension, and `ISO_IR 192`, one value, at any depth. Text is decoded by the package's
 *     own reader, so `toDicomJson` and `Element.value` never disagree.
 *   - Control characters: `fromDicomJson` writes no C0 control a VR does not allow (PS3.5 section
 *     6.2), so no escape sequence can ride in on text.
 *   - Negative zero in `FL` and `FD`: JSON writes `-0` as `0`, so it is refused.
 *   - Nesting: `fromDicomJson` refuses Sequences nested past the reader's limit with its own code,
 *     and no error but a `DicomJsonError` leaves either converter.
 *
 * Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  Dataset,
  DICOM_JSON_ERROR_CODES,
  DicomJsonError,
  Element,
  fromDicomJson,
  parseDicom,
  serializeDicom,
  toDicomJson,
  type DicomJsonDataset,
  type FromDicomJsonOptions,
} from "../../src/index.js";
import type { VR } from "../../src/dictionary/types.js";
import { NESTING_DEPTH_LIMIT } from "../../src/parser/sequence.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const LE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE } };

function latin1(s: string): Buffer {
  return Buffer.from(s, "latin1");
}

function even(b: Buffer): Buffer {
  return b.length % 2 === 1 ? Buffer.concat([b, Buffer.from(" ")]) : b;
}

function parsed(
  elements: (BuildDicomElement | BuildDicomSqElement)[],
): ReturnType<typeof parseDicom> {
  return parseDicom(buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements }));
}

/** The code `fn` is refused with, `undefined` when it returns; any other error is rethrown. */
function refusal(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof DicomJsonError) return err.code;
    throw err;
  }
  return undefined;
}

describe("Specific Character Set: one value, no code extensions", () => {
  it("refuses the ISO 2022 Data Set whose Person Name and second LO value it read wrong", () => {
    // Value 1 ISO 2022 IR 100 puts Latin-1 in G1; ESC - F puts Greek there. The reader resets G1
    // at the PN `=` and the LO backslash, so the second reading of 0xE1 is Latin-1 again.
    const pn = even(
      Buffer.concat([
        latin1("A"),
        Buffer.from([0x1b, 0x2d, 0x46, 0xe1]),
        latin1("="),
        Buffer.from([0xe1]),
      ]),
    );
    const lo = even(
      Buffer.concat([Buffer.from([0x1b, 0x2d, 0x46, 0xe1]), latin1("\\"), Buffer.from([0xe1])]),
    );
    const ds = parsed([
      { tag: "00080005", vr: "CS", value: latin1("ISO 2022 IR 100\\ISO 2022 IR 126 ") },
      { tag: "00100010", vr: "PN", value: pn },
      { tag: "00100020", vr: "LO", value: lo },
    ]);
    expect(refusal(() => toDicomJson(ds))).toBe(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
  });

  it("refuses an ISO 2022 term, a GB set, or two values, in a Data Set with no text at all", () => {
    for (const terms of [
      "ISO 2022 IR 100",
      "ISO 2022 IR 6",
      "\\ISO 2022 IR 87",
      "ISO_IR 100\\ISO_IR 192",
      "ISO_IR 192\\ISO 2022 IR 6",
      "GB18030 ",
      "GBK ",
      "ISO_IR 14 ",
    ]) {
      const ds = parsed([
        { tag: "00080005", vr: "CS", value: even(latin1(terms)) },
        { tag: "00280010", vr: "US", value: Buffer.from([1, 0]) },
      ]);
      expect(
        refusal(() => toDicomJson(ds)),
        terms,
      ).toBe(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
    }
  });

  it("refuses an Item's own ISO 2022 set", () => {
    const ds = parsed([
      { tag: "00080005", vr: "CS", value: latin1("ISO_IR 100") },
      {
        tag: "0040A730",
        items: [
          {
            elements: [
              { tag: "00080005", vr: "CS", value: latin1("\\ISO 2022 IR 149 ") },
              { tag: "00100020", vr: "LO", value: latin1("AB") },
            ],
          },
        ],
      },
    ]);
    expect(refusal(() => toDicomJson(ds))).toBe(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
  });

  it("refuses text an Element carries under a set of several values, however it was built", () => {
    const el = new Element({
      tag: "00100020",
      vr: "LO",
      vm: 1,
      length: 2,
      rawBytes: latin1("AB"),
      byteOffset: 0,
      littleEndian: true,
      specificCharacterSet: ["", "ISO 2022 IR 87"],
    });
    const ds = new Dataset({ warnings: [], elements: new Map([["00100020", el]]) });
    expect(refusal(() => toDicomJson(ds))).toBe(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
  });

  it("keeps the sets it carries: none, empty, ISO_IR 6, each single-byte ISO_IR set and ISO_IR 192", () => {
    for (const terms of [
      undefined,
      "",
      "ISO_IR 6",
      "ISO_IR 100",
      "ISO_IR 101",
      "ISO_IR 109",
      "ISO_IR 110",
      "ISO_IR 144",
      "ISO_IR 127",
      "ISO_IR 126",
      "ISO_IR 138",
      "ISO_IR 148",
      "ISO_IR 203",
      "ISO_IR 13",
      "ISO_IR 166",
      "ISO_IR 192",
    ]) {
      const elements: BuildDicomElement[] = [{ tag: "00100020", vr: "LO", value: latin1("AB") }];
      if (terms !== undefined) {
        elements.unshift({ tag: "00080005", vr: "CS", value: even(latin1(terms)) });
      }
      const json = toDicomJson(parsed(elements));
      expect(json["00100020"], String(terms)).toEqual({ vr: "LO", Value: ["AB"] });
      expect(serializeDicom(fromDicomJson(json, LE))).toEqual(serializeDicom(parsed(elements)));
    }
  });

  it("decodes every byte of every set it carries as the reader does, or refuses it", () => {
    const bytes = Buffer.from(Array.from({ length: 0xff - 0x20 }, (_, i) => i + 0x21));
    let refused = 0;
    for (const terms of [
      "ISO_IR 100",
      "ISO_IR 101",
      "ISO_IR 109",
      "ISO_IR 110",
      "ISO_IR 144",
      "ISO_IR 127",
      "ISO_IR 126",
      "ISO_IR 138",
      "ISO_IR 148",
      "ISO_IR 203",
      "ISO_IR 166",
      "ISO_IR 192",
    ]) {
      for (const byte of bytes) {
        const ds = parsed([
          { tag: "00080005", vr: "CS", value: even(latin1(terms)) },
          { tag: "00104000", vr: "LT", value: Buffer.from([0x41, byte]) },
        ]);
        const read = ds.get("00104000")?.value;
        const text = read?.kind === "text" ? read.value : undefined;
        let json: DicomJsonDataset | undefined;
        const code = refusal(() => {
          json = toDicomJson(ds);
        });
        // Refused exactly where the reader has no character for the byte, and the same text
        // everywhere else.
        const lost = text?.includes(String.fromCharCode(0xfffd)) === true;
        if (lost) refused += 1;
        expect(code, `${terms} ${byte}`).toBe(
          lost ? DICOM_JSON_ERROR_CODES.MALFORMED_VALUE : undefined,
        );
        if (!lost) expect(json?.["00104000"]?.Value, `${terms} ${byte}`).toEqual([text]);
      }
    }
    // Single-byte sets with holes (ISO_IR 109, 127, 126, 138, 166) and UTF-8 are among them.
    expect(refused).toBeGreaterThan(128);
  });

  it("sets aside only a whole leading byte order mark under ISO_IR 192, and refuses a second", () => {
    const lo = (bytes: number[]): string | undefined =>
      refusal(() =>
        toDicomJson(
          parsed([
            { tag: "00080005", vr: "CS", value: latin1("ISO_IR 192") },
            { tag: "00100020", vr: "LO", value: Buffer.from(bytes) },
          ]),
        ),
      );
    // Three bytes that are not a byte order mark, each one byte off it, are invalid UTF-8.
    for (const bytes of [
      [0x41, 0xbb, 0xbf, 0x41],
      [0xef, 0x41, 0xbf, 0x41],
      [0xef, 0xbb, 0x41, 0x41],
    ]) {
      expect(lo(bytes), String(bytes)).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
    }
    // UTF-8 decoding drops a byte order mark after the one set aside: refused, never lost.
    expect(lo([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf])).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
    expect(lo([0xef, 0xbb, 0xbf, 0x41])).toBeUndefined();
  });

  it("refuses a JSON Specific Character Set of an ISO 2022 term or several values", () => {
    for (const value of [
      ["ISO 2022 IR 6", "ISO 2022 IR 87"],
      ["ISO 2022 IR 100"],
      [null, "ISO 2022 IR 149"],
      ["ISO_IR 100", "ISO_IR 192"],
      ["GB18030"],
      ["ISO_IR 14"],
    ]) {
      const json: DicomJsonDataset = {
        "00080005": { vr: "CS", Value: value },
        "00100020": { vr: "LO", Value: ["AB"] },
      };
      expect(
        refusal(() => fromDicomJson(json, LE)),
        String(value),
      ).toBe(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
    }
    const nested: DicomJsonDataset = {
      "0040A730": {
        vr: "SQ",
        Value: [{ "00080005": { vr: "CS", Value: ["ISO 2022 IR 13"] } }],
      },
    };
    expect(refusal(() => fromDicomJson(nested, LE))).toBe(
      DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET,
    );
  });
});

describe("control characters: none a VR does not allow", () => {
  it("refuses the escape sequences that turned two JSON values into a name", () => {
    // Under the default repertoire and ISO_IR 192 alike, an ESC in text is refused.
    for (const charset of [undefined, "ISO_IR 192", "ISO_IR 100"]) {
      const json: DicomJsonDataset = {
        ...(charset === undefined ? {} : { "00080005": { vr: "CS", Value: [charset] } }),
        "00100010": { vr: "PN", Value: [{ Alphabetic: "\u001b$B;3ED\u001b(B" }] },
      };
      expect(
        refusal(() => fromDicomJson(json, LE)),
        String(charset),
      ).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
      const lo: DicomJsonDataset = { "00100020": { vr: "LO", Value: ["\u001b$B;3ED\u001b(B"] } };
      expect(refusal(() => fromDicomJson(lo, LE))).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
    }
  });

  it("refuses every C0 control in a VR that allows none", () => {
    const vrs: [string, VR, (s: string) => unknown][] = [
      ["00080060", "CS", (s) => s],
      ["00100020", "LO", (s) => s],
      ["00080050", "SH", (s) => s],
      ["00100010", "PN", (s) => ({ Alphabetic: s })],
      ["0020000D", "UI", (s) => s],
      ["00080020", "DA", (s) => s],
      ["00081190", "UR", (s) => s],
    ];
    for (let c = 0; c < 0x20; c++) {
      for (const [tag, vr, wrap] of vrs) {
        const json = { [tag]: { vr, Value: [wrap(`A${String.fromCharCode(c)}B`)] } };
        expect(
          refusal(() => fromDicomJson(json as DicomJsonDataset, LE)),
          `${vr} ${c}`,
        ).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
      }
    }
  });

  it("writes TAB, LF, FF and CR in LT, ST and UT, and refuses every other C0 control there", () => {
    const allowed = new Set([0x09, 0x0a, 0x0c, 0x0d]);
    for (const [tag, vr] of [
      ["00104000", "LT"],
      ["00080081", "ST"],
      ["0040A160", "UT"],
    ] as const) {
      for (let c = 0; c < 0x20; c++) {
        const text = `A${String.fromCharCode(c)}B`;
        const json: DicomJsonDataset = { [tag]: { vr, Value: [text] } };
        const code = refusal(() => fromDicomJson(json, LE));
        if (allowed.has(c)) {
          expect(code, `${vr} ${c}`).toBeUndefined();
          expect(toDicomJson(fromDicomJson(json, LE))[tag]).toEqual({ vr, Value: [text] });
        } else {
          expect(code, `${vr} ${c}`).toBe(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE);
        }
      }
    }
  });
});

describe("FL and FD negative zero", () => {
  it("refuses -0, which JSON writes as 0, rather than change the stored value", () => {
    const fd = Buffer.alloc(16);
    fd.writeDoubleLE(1.5, 0);
    fd.writeDoubleLE(-0, 8);
    const fl = Buffer.alloc(4);
    fl.writeFloatLE(-0);
    for (const [tag, vr, value] of [
      ["00189087", "FD", fd],
      ["00189089", "FL", fl],
    ] as const) {
      const ds = parsed([{ tag, vr, value }]);
      expect(
        refusal(() => toDicomJson(ds)),
        vr,
      ).toBe(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER);
    }
  });

  it("keeps positive zero", () => {
    const ds = parsed([{ tag: "00189087", vr: "FD", value: Buffer.alloc(8) }]);
    expect(toDicomJson(ds)["00189087"]).toEqual({ vr: "FD", Value: [0] });
  });
});

/** JSON with `levels` Sequences, each Item holding the next. */
function nested(levels: number): DicomJsonDataset {
  let json: DicomJsonDataset = { "00100020": { vr: "LO", Value: ["X"] } };
  for (let i = 0; i < levels; i++) json = { "00081115": { vr: "SQ", Value: [json] } };
  return json;
}

describe("nesting depth and uncoded errors", () => {
  it("writes Sequences nested as deep as the reader reads", () => {
    const ds = fromDicomJson(nested(NESTING_DEPTH_LIMIT), LE);
    expect(toDicomJson(ds)).toEqual(nested(NESTING_DEPTH_LIMIT));
  });

  it("refuses one level past it with its own code, before the reader or the stack refuses", () => {
    for (const levels of [NESTING_DEPTH_LIMIT + 1, 100, 1000, 5000]) {
      for (const sequenceLength of ["defined", "undefined"] as const) {
        expect(
          refusal(() => fromDicomJson(nested(levels), { ...LE, sequenceLength })),
          `${levels} ${sequenceLength}`,
        ).toBe(DICOM_JSON_ERROR_CODES.NESTING_TOO_DEEP);
      }
    }
  });

  it("refuses a resolveBulkData that throws with a code, never its error", () => {
    const json: DicomJsonDataset = {
      "00091001": { vr: "OB", BulkDataURI: "https://example.com/1" },
    };
    const resolveBulkData = (): Uint8Array => {
      throw new TypeError("synthetic");
    };
    expect(refusal(() => fromDicomJson(json, { ...LE, resolveBulkData }))).toBe(
      DICOM_JSON_ERROR_CODES.CONVERSION_FAILED,
    );
  });

  it("refuses a bulkDataUri that throws with a code, never its error", () => {
    const ds = parsed([{ tag: "00282000", vr: "OB", value: Buffer.from([1, 2]) }]);
    const bulkDataUri = (): string => {
      throw new RangeError("synthetic");
    };
    expect(refusal(() => toDicomJson(ds, { bulkDataUri }))).toBe(
      DICOM_JSON_ERROR_CODES.CONVERSION_FAILED,
    );
  });

  it("refuses JSON whose reading throws with a code, and keeps a code it was refused with", () => {
    const json = {
      get "00100020"(): unknown {
        throw new Error("synthetic");
      },
    } as unknown as DicomJsonDataset;
    expect(refusal(() => fromDicomJson(json, LE))).toBe(DICOM_JSON_ERROR_CODES.CONVERSION_FAILED);
    let caught: unknown;
    try {
      fromDicomJson({ "00100020": { vr: "LO", Value: [5] } }, LE);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DicomJsonError);
    expect((caught as DicomJsonError).code).toBe("INVALID_JSON");
    expect((caught as DicomJsonError).tag).toBe("00100020");
  });
});

describe("odd-length binary values", () => {
  it("writes an odd-length InlineBinary with the NUL pad byte PS3.5 asks for", () => {
    const json: DicomJsonDataset = {
      "00090010": { vr: "LO", Value: ["SYNTHETIC CREATOR"] },
      "00091001": { vr: "OB", InlineBinary: "AAAA" },
    };
    expect(toDicomJson(fromDicomJson(json, LE))["00091001"]).toEqual({
      vr: "OB",
      InlineBinary: "AAAAAA==",
    });
  });
});

/**
 * `fromDicomJson` reads back every value it writes, through the reader's own decoder, and refuses
 * one that does not read back as the text the JSON gave:
 *
 *   - A C1 code point (U+0080 to U+009F) under the default repertoire, `ISO_IR 6` and `ISO_IR 100`
 *     is written as one ISO 8859-1 byte, and the reader decodes those sets as windows-1252, which
 *     reads 27 of those bytes as other characters (0x80 as the euro sign).
 *   - A lone surrogate under `ISO_IR 192` is written as the UTF-8 of U+FFFD.
 *
 * Both were written and read back as other text with no refusal. It also refuses an element in an
 * odd group below `0008`, which PS3.5 section 7.8.1 says shall not be used.
 *
 * Every value is synthetic.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import {
  DICOM_JSON_ERROR_CODES,
  DicomJsonError,
  fromDicomJson,
  toDicomJson,
  type DicomJsonDataset,
  type FromDicomJsonOptions,
} from "../../src/index.js";

const LE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: "1.2.840.10008.1.2.1" } };

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

/** The C1 code points windows-1252 decodes as themselves: they come back as they were sent. */
const KEPT_C1 = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

function withCharset(charset: string | undefined, attrs: DicomJsonDataset): DicomJsonDataset {
  return charset === undefined ? attrs : { "00080005": { vr: "CS", Value: [charset] }, ...attrs };
}

describe("text that does not read back as it was sent", () => {
  it("refuses a C1 code point the reader decodes as another character, under each Latin-1 set", () => {
    let refused = 0;
    for (const charset of [undefined, "ISO_IR 6", "ISO_IR 100"]) {
      for (let cp = 0x80; cp <= 0x9f; cp++) {
        const text = `SYN${String.fromCharCode(cp)}ID`;
        const json = withCharset(charset, { "00100020": { vr: "LO", Value: [text] } });
        let back: DicomJsonDataset | undefined;
        const code = refusal(() => {
          back = toDicomJson(fromDicomJson(json, LE));
        });
        const label = `${String(charset)} U+${cp.toString(16)}`;
        if (KEPT_C1.has(cp)) {
          expect(code, label).toBeUndefined();
          expect(back?.["00100020"]?.Value, label).toEqual([text]);
        } else {
          expect(code, label).toBe(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
          refused += 1;
        }
      }
    }
    expect(refused).toBe(27 * 3);
  });

  it("refuses the reviewer's two inputs: U+0080 in an LO and U+0092 in a Person Name", () => {
    const lo = withCharset("ISO_IR 100", { "00100020": { vr: "LO", Value: ["SYN\u0080ID"] } });
    expect(refusal(() => fromDicomJson(lo, LE))).toBe(
      DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET,
    );
    const pn: DicomJsonDataset = {
      "00100010": { vr: "PN", Value: [{ Alphabetic: "O\u0092FAKE^TEST" }] },
    };
    expect(refusal(() => fromDicomJson(pn, LE))).toBe(
      DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET,
    );
  });

  it("refuses a C1 code point inside a Sequence Item, under the Item's set or the one it inherits", () => {
    const own: DicomJsonDataset = {
      "0040A730": {
        vr: "SQ",
        Value: [withCharset("ISO_IR 100", { "00100020": { vr: "LO", Value: ["A\u0085B"] } })],
      },
    };
    const inherited = withCharset("ISO_IR 100", {
      "0040A730": { vr: "SQ", Value: [{ "00104000": { vr: "LT", Value: ["A\u009fB"] } }] },
    });
    for (const json of [own, inherited]) {
      for (const sequenceLength of ["defined", "undefined"] as const) {
        expect(refusal(() => fromDicomJson(json, { ...LE, sequenceLength }))).toBe(
          DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET,
        );
      }
    }
  });

  it("refuses a lone surrogate under ISO_IR 192, and keeps a pair", () => {
    for (const text of ["A\ud800B", "A\udc00B", "A\udc00\ud800B", "\ud83d", "AB\udfff"]) {
      for (const vr of ["LO", "LT"]) {
        const tag = vr === "LO" ? "00100020" : "00104000";
        const json = withCharset("ISO_IR 192", { [tag]: { vr, Value: [text] } });
        expect(
          refusal(() => fromDicomJson(json, LE)),
          `${vr} ${JSON.stringify(text)}`,
        ).toBe(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
      }
    }
    const pn = withCharset("ISO_IR 192", {
      "00100010": { vr: "PN", Value: [{ Alphabetic: "FAKE^\ud800" }] },
    });
    expect(refusal(() => fromDicomJson(pn, LE))).toBe(
      DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET,
    );
    const pair = withCharset("ISO_IR 192", {
      "00100020": { vr: "LO", Value: ["A😀B"] },
    });
    expect(toDicomJson(fromDicomJson(pair, LE))).toEqual(pair);
  });

  it("keeps text that reads back as it was sent: Latin-1 letters, a real U+FFFD, a UI pad", () => {
    const latin = withCharset("ISO_IR 100", {
      "00100020": { vr: "LO", Value: ["Éèÿ X"] },
    });
    expect(toDicomJson(fromDicomJson(latin, LE))).toEqual(latin);
    const replacement = withCharset("ISO_IR 192", {
      "00100020": { vr: "LO", Value: ["A�B"] },
    });
    expect(toDicomJson(fromDicomJson(replacement, LE))).toEqual(replacement);
    const uid: DicomJsonDataset = {
      "0020000D": { vr: "UI", Value: ["1.2.826.0.1.3680043.8.498.1"] },
    };
    expect(toDicomJson(fromDicomJson(uid, LE))).toEqual(uid);
  });
});

describe("odd groups below 0008", () => {
  it("refuses an element in group 0001, 0003, 0005 or 0007, at the top and in an Item", () => {
    for (const group of ["0001", "0003", "0005", "0007"]) {
      const top: DicomJsonDataset = { [`${group}0010`]: { vr: "LO", Value: ["SYN"] } };
      const nested: DicomJsonDataset = {
        "0040A730": { vr: "SQ", Value: [{ [`${group}1001`]: { vr: "UN", InlineBinary: "AAA=" } }] },
      };
      for (const json of [top, nested]) {
        expect(
          refusal(() => fromDicomJson(json, LE)),
          group,
        ).toBe(DICOM_JSON_ERROR_CODES.INVALID_JSON);
      }
    }
  });

  it("keeps an odd group from 0009 up", () => {
    const json: DicomJsonDataset = {
      "00090010": { vr: "LO", Value: ["SYNTHETIC CREATOR"] },
      "00091001": { vr: "UN", InlineBinary: "AAA=" },
    };
    expect(toDicomJson(fromDicomJson(json, LE))).toEqual(json);
  });
});

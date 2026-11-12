/**
 * A value `fromDicomJson` fetches through `BulkDataURI` is held to the same checks as the same
 * value given inline as `Value`, and refused with the same code: a `DS` or `IS` that is not one, or
 * is too long, an `IS` out of range, a control character its VR does not allow, and bytes its
 * Specific Character Set does not define. Also the `DS` that no JSON number holds exactly, which
 * `toDicomJson` writes as a JSON string. Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomJsonError,
  fromDicomJson,
  parseDicom,
  toDicomJson,
  type DicomJsonAttribute,
  type DicomJsonDataset,
  type FromDicomJsonOptions,
} from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

const LE: FromDicomJsonOptions = { fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE } };

function refusal(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof DicomJsonError) return err.code;
    throw err;
  }
  return undefined;
}

/** One tag of each text VR PS3.18 F.2.2 allows a BulkDataURI on. */
const TAGS = {
  DS: "00720072",
  IS: "00720064",
  LT: "00720068",
  ST: "0072006E",
  UC: "0072006F",
  UT: "00720070",
} as const;

type FetchedVr = keyof typeof TAGS;

/** The text's values as an inline `Value`: one string for a single-valued VR, else split. */
function inlineValue(vr: FetchedVr, text: string): string[] {
  return vr === "LT" || vr === "ST" || vr === "UT" ? [text] : text.split("\\");
}

/**
 * The code `fromDicomJson` refuses `text` with, given inline as `Value` and fetched through a
 * `BulkDataURI` as its bytes, under the Specific Character Set `charset` names, if any.
 */
function both(
  vr: FetchedVr,
  text: string,
  bytes: Buffer,
  charset?: string,
  transferSyntaxUID = TS_EXPLICIT_LE,
): [string | undefined, string | undefined] {
  const head: DicomJsonDataset =
    charset === undefined ? {} : { "00080005": { vr: "CS", Value: [charset] } };
  const options: FromDicomJsonOptions = {
    fileMeta: { transferSyntaxUID },
    resolveBulkData: () => bytes,
  };
  const tag = TAGS[vr];
  const inline = refusal(() =>
    fromDicomJson({ ...head, [tag]: { vr, Value: inlineValue(vr, text) } }, options),
  );
  const fetched = refusal(() =>
    fromDicomJson({ ...head, [tag]: { vr, BulkDataURI: "https://example.com/bulk/1" } }, options),
  );
  return [inline, fetched];
}

/** The same, for text of 7-bit ASCII, whose bytes are the same under every set we carry. */
function ascii(vr: FetchedVr, text: string, transferSyntaxUID?: string): string[] {
  return both(vr, text, Buffer.from(text, "latin1"), undefined, transferSyntaxUID).map(
    (code) => code ?? "accepted",
  );
}

describe("a value fetched through BulkDataURI is checked as the same value inline", () => {
  it("refuses a DS or IS that is not one, or is longer than its VR allows, as MALFORMED_VALUE", () => {
    const cases: [FetchedVr, string][] = [
      ["DS", "abc"],
      ["DS", "1.5.0"],
      ["DS", "1,5"],
      ["DS", "1 2"],
      ["DS", "1.5\\abc"],
      ["DS", "12345678901234567"],
      ["DS", "1\\12345678901234567"],
      ["IS", "1.5"],
      ["IS", "1e3"],
      ["IS", "7\\x"],
      ["IS", "+0000000000042"],
    ];
    for (const [vr, text] of cases) {
      expect(ascii(vr, text), `${vr} ${text}`).toEqual(["MALFORMED_VALUE", "MALFORMED_VALUE"]);
    }
  });

  it("refuses an IS out of range as UNREPRESENTABLE_NUMBER", () => {
    for (const text of ["2147483648", "-2147483649", "1\\99999999999"]) {
      expect(ascii("IS", text), text).toEqual(["UNREPRESENTABLE_NUMBER", "UNREPRESENTABLE_NUMBER"]);
    }
  });

  it("refuses a control character the VR does not allow, ESC among them, as MALFORMED_VALUE", () => {
    const cases: [FetchedVr, string][] = [
      ["LT", "SYNTHETIC \u001b$B NOTE"],
      ["ST", "SYNTHETIC\u0000"],
      ["UT", "SYNTHETIC\u0007NOTE"],
      ["UC", "SYNTHETIC\nNOTE"],
      ["UC", "SYNTHETIC\tNOTE"],
      ["DS", "1.5\r"],
    ];
    for (const [vr, text] of cases) {
      expect(ascii(vr, text), `${vr} ${JSON.stringify(text)}`).toEqual([
        "MALFORMED_VALUE",
        "MALFORMED_VALUE",
      ]);
    }
  });

  it("refuses the same values under Explicit VR Big Endian, where text is not swapped", () => {
    expect(ascii("DS", "abc", TS_EXPLICIT_BE)).toEqual(["MALFORMED_VALUE", "MALFORMED_VALUE"]);
    expect(ascii("LT", "A\u001bB", TS_EXPLICIT_BE)).toEqual(["MALFORMED_VALUE", "MALFORMED_VALUE"]);
  });

  it("accepts what is accepted inline, and writes the fetched bytes as they are", () => {
    const cases: [FetchedVr, string][] = [
      ["DS", "1.5"],
      ["DS", " 1.50\\-2E3 "],
      ["DS", "1234567890123456"],
      ["DS", "1.5\\\\2"],
      ["IS", "+42\\-2147483648"],
      ["LT", "SYNTHETIC\r\nNOTE\tONE\fTWO \\ THREE"],
      ["ST", "SYNTHETIC\\NOTE"],
      ["UT", "SYNTHETIC NOTE "],
      ["UC", "SYNTHETIC\\NOTE"],
    ];
    for (const [vr, text] of cases) {
      expect(ascii(vr, text), `${vr} ${JSON.stringify(text)}`).toEqual(["accepted", "accepted"]);
      const tag = TAGS[vr];
      const ds = fromDicomJson(
        { [tag]: { vr, BulkDataURI: "https://example.com/bulk/1" } },
        { ...LE, resolveBulkData: () => Buffer.from(text, "latin1") },
      );
      const raw = Buffer.from(ds.get(tag)?.rawBytes ?? []).toString("latin1");
      expect(raw === text || raw === `${text} `).toBe(true);
    }
  });

  it("refuses bytes the Specific Character Set does not define, as text inline is refused", () => {
    // U+00E9 under the default repertoire (ISO-IR 6), which defines no byte past 0x7F.
    expect(both("LT", "SYNTHETIC é", Buffer.from("SYNTHETIC é", "latin1"))).toEqual([
      "UNSUPPORTED_CHARACTER_SET",
      "UNSUPPORTED_CHARACTER_SET",
    ]);
    // A C1 byte under ISO_IR 100, which no set defines.
    expect(
      both("UT", "SYNTHETIC \u0085", Buffer.from("SYNTHETIC \u0085", "latin1"), "ISO_IR 100"),
    ).toEqual(["UNSUPPORTED_CHARACTER_SET", "UNSUPPORTED_CHARACTER_SET"]);
    // A byte past 0x7F in a DS is no DS: its text is in the default repertoire.
    expect(both("DS", "1.5é", Buffer.from("1.5é", "latin1"))).toEqual([
      "MALFORMED_VALUE",
      "MALFORMED_VALUE",
    ]);
    // The same characters under a set that holds them are accepted either way.
    expect(both("LT", "SYNTHETIC é", Buffer.from("SYNTHETIC é", "latin1"), "ISO_IR 100")).toEqual([
      undefined,
      undefined,
    ]);
    expect(both("UC", "SYNTHETIC é", Buffer.from("SYNTHETIC é", "utf8"), "ISO_IR 192")).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("refuses bytes that are not UTF-8 under ISO_IR 192, which no inline text can be", () => {
    const options: FromDicomJsonOptions = {
      ...LE,
      resolveBulkData: () => Buffer.from([0x53, 0x59, 0xc3]),
    };
    expect(
      refusal(() =>
        fromDicomJson(
          {
            "00080005": { vr: "CS", Value: ["ISO_IR 192"] },
            "00720068": { vr: "LT", BulkDataURI: "https://example.com/bulk/1" },
          },
          options,
        ),
      ),
    ).toBe("MALFORMED_VALUE");
  });

  it("checks a fetched value inside a Sequence Item too", () => {
    const options: FromDicomJsonOptions = {
      ...LE,
      resolveBulkData: () => Buffer.from("abc", "latin1"),
    };
    const json: DicomJsonDataset = {
      "0040A730": {
        vr: "SQ",
        Value: [{ "00720072": { vr: "DS", BulkDataURI: "https://example.com/bulk/1" } }],
      },
    };
    expect(refusal(() => fromDicomJson(json, options))).toBe("MALFORMED_VALUE");
  });
});

describe("a DS no JSON number holds exactly", () => {
  function json(text: string): DicomJsonAttribute | undefined {
    const padded = text.length % 2 === 1 ? `${text} ` : text;
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "0040A30A", vr: "DS", value: Buffer.from(padded, "latin1") }],
      }),
    );
    return toDicomJson(ds)["0040A30A"];
  }

  it("is written as a JSON string of its text, which PS3.18 F.2.3 allows", () => {
    expect(json("9007199254740993")).toEqual({ vr: "DS", Value: ["9007199254740993"] });
    expect(json("9999999999999999")).toEqual({ vr: "DS", Value: ["9999999999999999"] });
    expect(json("1e-400")).toEqual({ vr: "DS", Value: ["1e-400"] });
    expect(json("1E400")).toEqual({ vr: "DS", Value: ["1E400"] });
    expect(json(" 9007199254740995")).toEqual({ vr: "DS", Value: ["9007199254740995"] });
  });

  it("is refused when the text is past the 16 bytes fromDicomJson reads, as before", () => {
    expect(refusal(() => json("0.10000000000000001"))).toBe("UNREPRESENTABLE_NUMBER");
    expect(refusal(() => json(" 0.10000000000000001"))).toBe("UNREPRESENTABLE_NUMBER");
    expect(refusal(() => json("1.5\\0.10000000000000001"))).toBe("UNREPRESENTABLE_NUMBER");
  });

  it("stays a number where a JSON number holds it, each value on its own", () => {
    expect(json("1.5\\9007199254740993\\\\-2")).toEqual({
      vr: "DS",
      Value: [1.5, "9007199254740993", null, -2],
    });
    expect(json("9007199254740992")).toEqual({ vr: "DS", Value: [9007199254740992] });
  });

  it("is still refused when it is not a decimal string at all", () => {
    expect(refusal(() => json("TALL"))).toBe("UNREPRESENTABLE_NUMBER");
    expect(refusal(() => json("NaN"))).toBe("UNREPRESENTABLE_NUMBER");
  });

  it("is not how an IS goes: one no double holds, past the 12 bytes PS3.5 allows, is refused", () => {
    const is = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00200013", vr: "IS", value: Buffer.from("99999999999999999999", "latin1") },
        ],
      }),
    );
    expect(refusal(() => toDicomJson(is))).toBe("UNREPRESENTABLE_NUMBER");
  });

  it("comes back through fromDicomJson as the same text", () => {
    const attr = json("9007199254740993") as DicomJsonAttribute;
    const back = fromDicomJson({ "0040A30A": attr }, LE).get("0040A30A")?.rawBytes ?? [];
    expect(Buffer.from(back).toString("latin1")).toBe("9007199254740993");
  });
});

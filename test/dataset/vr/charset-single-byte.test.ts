/**
 * Every byte `0x00` to `0xFF` under every single-byte Specific Character Set we decode, held to
 * the published table of its set and to the pinned PS3.5:
 *
 * - The default repertoire is ISO-IR 6 (PS3.5 section 6.1.2.1): nothing at `0x80` to `0xFF`.
 * - "Characters from the C1 set shall not be used" (PS3.5 section 6.1.1): nothing at `0x80` to
 *   `0x9F` under any set, though the Unicode files map those bytes to the C1 controls.
 * - Under `ISO_IR 13` and `ISO 2022 IR 13`, `0x5C` is YEN SIGN in ISO-IR 14 (PS3.5 section
 *   6.1.2.3), and `0x7E` OVERLINE; a `0x5C` byte still separates Values in a multi-valued VR.
 * - At `0xA0` to `0xFF`, the Unicode mapping file of the set (`_unicode-single-byte-tables.ts`),
 *   less the rows a later edition added than the one ISO-IR registered: the Greek `0xA4`, `0xA5`
 *   and `0xAA` of ISO 8859-7:2003 (ISO-IR 227, not 126) and the Hebrew `0xFD` and `0xFE` of
 *   ISO 8859-8:1999 (ISO-IR 198, not 138).
 *
 * A byte its set does not define reads as U+FFFD with `DICOM_CHARSET_BYTES_UNDECODABLE`, and never
 * as another set's character. Before this, the reader decoded through WHATWG `TextDecoder` labels:
 * `latin1` (windows-1252) for the default repertoire and `ISO_IR 100`, `iso-8859-9` (windows-1254),
 * `windows-874`, and `shift_jis` for `ISO_IR 13`, so 0x80 under `ISO_IR 100` read as the euro sign,
 * and `81 5C` under `ISO_IR 13` as one kanji.
 *
 * Every fixture is synthetic: one or three bytes in a Part 10 buffer built in memory.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { singleByteSetIn } from "../../../src/dataset/vr/charset.js";
import { decodeText, parseDicom, type Element } from "../../../src/index.js";
import { buildDicom } from "../../helpers/build-dicom.js";
import { PUBLISHED_G1_ROWS } from "./_unicode-single-byte-tables.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const REPLACEMENT = "�";
const UNDECODABLE = "DICOM_CHARSET_BYTES_UNDECODABLE";

/** Rows the Unicode file maps that the edition ISO-IR registered does not define. */
const LATER_EDITION_ROWS: ReadonlyMap<number, readonly number[]> = new Map([
  [126, [0xa4, 0xa5, 0xaa]],
  [138, [0xfd, 0xfe]],
]);

/** The published G1 table of set `ir` as byte to character, less the later editions' rows. */
function g1Table(ir: number): ReadonlyMap<number, string> {
  const table = new Map<number, string>();
  const rows = PUBLISHED_G1_ROWS.get(ir) ?? "";
  for (const row of rows.trim().split(/\s+/u)) {
    const [byte, cp] = row.split(":").map((h) => parseInt(h, 16)) as [number, number];
    table.set(byte, String.fromCharCode(cp));
  }
  for (const byte of LATER_EDITION_ROWS.get(ir) ?? []) table.delete(byte);
  return table;
}

/** The single-byte sets, by the ISO-IR number of their G1 set (6: the default repertoire). */
const SETS: readonly number[] = [6, 100, 101, 109, 110, 144, 127, 126, 138, 148, 203, 166, 13];

/** Every way a single-valued `(0008,0005)` can name set `ir`. */
function termsOf(ir: number): readonly (readonly string[] | undefined)[] {
  const twins = [[`ISO_IR ${String(ir)}`], [`ISO 2022 IR ${String(ir)}`]];
  return ir === 6 ? [undefined, [], [""], ...twins] : twins;
}

/**
 * What byte `byte` reads as under set `ir`, `undefined` for a byte the set does not define.
 * `text` is the delimiter class: in `ST`, `LT` and `UT` a `0x5C` is a character.
 */
function expected(ir: number, byte: number, text: boolean): string | undefined {
  if (byte < 0x80) {
    if (ir === 13 && byte === 0x5c) return text ? "¥" : "\\";
    if (ir === 13 && byte === 0x7e) return "‾";
    return String.fromCharCode(byte);
  }
  if (byte < 0xa0 || ir === 6) return undefined;
  return g1Table(ir).get(byte);
}

const BYTES = Array.from({ length: 256 }, (_, b) => b);

/** One file under `charset` with an `LT` and an `LO` that each hold `A`, `byte`, `A`. */
function elementsWith(charset: readonly string[] | undefined, byte: number): [Element, Element] {
  const value = Buffer.from([0x41, byte, 0x41, 0x20]);
  const term = charset?.join("\\");
  const ds = parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        ...(term === undefined
          ? []
          : [
              {
                tag: "00080005",
                vr: "CS" as const,
                value: Buffer.from(term.length % 2 === 0 ? term : `${term} `, "latin1"),
              },
            ]),
        { tag: "00100020", vr: "LO", value },
        { tag: "00104000", vr: "LT", value },
      ],
    }),
  );
  return [ds.get("00104000") as Element, ds.get("00100020") as Element];
}

function warningCodes(element: Element): readonly string[] {
  const value = element.value as { warnings?: readonly { code: string }[] };
  return (value.warnings ?? []).map((w) => w.code);
}

describe("the published tables cover what they should", () => {
  it("each table maps all of 0xA0 to 0xFF but the bytes its set leaves out", () => {
    // The undefined positions of each part, as the Unicode files leave them unmapped.
    const unmapped: ReadonlyMap<number, number> = new Map([
      [100, 0],
      [101, 0],
      [109, 7],
      [110, 0],
      [144, 0],
      [127, 45],
      [126, 3],
      [138, 36],
      [148, 0],
      [203, 0],
      [166, 8],
      [13, 33],
    ]);
    for (const [ir, count] of unmapped) {
      const rows = (PUBLISHED_G1_ROWS.get(ir) ?? "").trim().split(/\s+/u);
      expect(96 - rows.length, String(ir)).toBe(count);
    }
  });
});

describe("decodeText: every byte under every single-byte set", () => {
  for (const ir of SETS) {
    for (const terms of termsOf(ir)) {
      it(`${JSON.stringify(terms)}: each byte reads as its table gives, or U+FFFD`, () => {
        const wrong: string[] = [];
        for (const byte of BYTES) {
          const want = expected(ir, byte, true) ?? REPLACEMENT;
          const got = decodeText(Buffer.from([byte]), terms);
          if (got !== want) wrong.push(`${byte.toString(16)}: ${escape(got)} for ${escape(want)}`);
        }
        expect(wrong).toEqual([]);
      });
    }
  }
});

describe("parseDicom: every byte under every single-byte set, with the warning", () => {
  for (const ir of SETS) {
    for (const terms of termsOf(ir)) {
      it(`${JSON.stringify(terms)}: LT and LO hold the table's character, or U+FFFD and the warning`, () => {
        const wrong: string[] = [];
        for (const byte of BYTES) {
          const [lt, lo] = elementsWith(terms, byte);
          const inText = expected(ir, byte, true);
          const inLo = expected(ir, byte, false);
          const ltWant = { kind: "text", value: `A${inText ?? REPLACEMENT}A` };
          const loText = `A${inLo ?? REPLACEMENT}A`;
          const loWant = { kind: "strings", values: loText.split("\\").map((v) => v.trim()) };
          const warn = inText === undefined ? [UNDECODABLE] : [];
          const ltGot = lt.value as { kind: string; value?: string };
          const loGot = lo.value as { kind: string; values?: readonly string[] };
          if (ltGot.kind !== ltWant.kind || ltGot.value !== ltWant.value) {
            wrong.push(`LT ${byte.toString(16)}: ${escape(String(ltGot.value))}`);
          }
          if (
            loGot.kind !== loWant.kind ||
            JSON.stringify(loGot.values) !== JSON.stringify(loWant.values)
          ) {
            wrong.push(`LO ${byte.toString(16)}: ${escape(JSON.stringify(loGot.values))}`);
          }
          if (JSON.stringify(warningCodes(lt)) !== JSON.stringify(warn)) {
            wrong.push(`LT warnings ${byte.toString(16)}: ${warningCodes(lt).join(",")}`);
          }
          if (JSON.stringify(warningCodes(lo)) !== JSON.stringify(warn)) {
            wrong.push(`LO warnings ${byte.toString(16)}: ${warningCodes(lo).join(",")}`);
          }
        }
        expect(wrong).toEqual([]);
      });
    }
  }
});

describe("the reviewed cases", () => {
  it("0x80 under ISO_IR 100 is no euro sign: U+FFFD, with the warning", () => {
    const [lt] = elementsWith(["ISO_IR 100"], 0x80);
    expect(lt.value).toMatchObject({ kind: "text", value: "A�A" });
    expect(warningCodes(lt)).toEqual([UNDECODABLE]);
    expect(decodeText(Buffer.from([0x80]), ["ISO_IR 100"])).not.toBe("€");
  });

  it("0x80 to 0x9F under ISO_IR 148 read as no windows-1254 character", () => {
    for (let byte = 0x80; byte <= 0x9f; byte++) {
      expect(decodeText(Buffer.from([byte]), ["ISO_IR 148"])).toBe(REPLACEMENT);
    }
  });

  it("81 5C under ISO_IR 13 is no kanji: an undefined byte and the YEN SIGN in an LT", () => {
    expect(decodeText(Buffer.from([0x81, 0x5c]), ["ISO_IR 13"])).toBe("�¥");
  });

  it("5C under ISO_IR 13 is the YEN SIGN in an LT and still splits the Values of an LO", () => {
    const [lt, lo] = elementsWith(["ISO_IR 13"], 0x5c);
    expect(lt.value).toMatchObject({ kind: "text", value: "A¥A" });
    expect(lo.value).toMatchObject({ kind: "strings", values: ["A", "A"] });
    expect(warningCodes(lt)).toEqual([]);
  });

  it("half-width katakana and an OVERLINE under ISO_IR 13", () => {
    // Half-width YA MA, then 7E.
    expect(decodeText(Buffer.from([0xd4, 0xcf, 0x7e]), ["ISO_IR 13"])).toBe("ﾔﾏ‾");
  });

  it("the Greek euro sign and the Hebrew LRM, which the registered editions lack, read as U+FFFD", () => {
    expect(decodeText(Buffer.from([0xa4]), ["ISO_IR 126"])).toBe(REPLACEMENT);
    expect(decodeText(Buffer.from([0xfd]), ["ISO_IR 138"])).toBe(REPLACEMENT);
  });

  it("a term no set answers to decodes as the default repertoire, ISO-IR 6", () => {
    for (const terms of [["ISO_IR 9999"], ["ISO_IR 14"]]) {
      expect(decodeText(Buffer.from([0x41, 0x80, 0xe9, 0x5c]), terms)).toBe("A��\\");
    }
  });

  it("a multi-byte term wins over a single-byte one, as the decoder label does", () => {
    expect(singleByteSetIn(["ISO_IR 100", "ISO_IR 192"])).toBeUndefined();
    expect(singleByteSetIn(["ISO_IR 9999", "ISO_IR 126", "ISO_IR 100"])).toBe(126);
    expect(decodeText(Buffer.from("é", "utf-8"), ["ISO_IR 192"])).toBe("é");
    expect(decodeText(Buffer.from([0xd5, 0xc5]), ["GBK"])).toBe("张");
  });

  it("a high byte with no (0008,0005) is undefined in the default repertoire", () => {
    const [lt] = elementsWith(undefined, 0xe9);
    expect(lt.value).toMatchObject({ kind: "text", value: "A�A" });
    expect(warningCodes(lt)).toEqual([UNDECODABLE]);
  });
});

function escape(text: string): string {
  return [...text]
    .map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`)
    .join(" ");
}

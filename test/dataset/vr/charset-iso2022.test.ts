/**
 * ISO 2022 code-extension decoding under a multi-valued `(0008,0005)` Specific
 * Character Set: the escape sequences of PS3.3 2026d Tables C.12-3 and C.12-4,
 * and the reset points of PS3.5 2026d section 6.1.2.5.3.
 *
 * Every fixture in this file is synthetic and built in memory: byte strings
 * written in hex, wrapped in a Part 10 buffer by `build-dicom` where a test goes
 * through `parseDicom`. The Japanese, Korean and Chinese names are the
 * standard's own published worked examples (PS3.5 2026d Examples H.3-1 and
 * I.2-1), each named where it is used; no byte here came from a real file.
 *
 * Every expected character comes from an oracle independent of the decoder under
 * test: the single-valued `ISO_IR nnn` twin (the path that predates this
 * decoder), Node's own `TextDecoder`, or the characters the annex prints.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Element } from "../../../src/dataset/element.js";
import { decodeText, resolveDecoderLabel } from "../../../src/dataset/vr/charset.js";
import type { DicomValue, PersonNameGroup } from "../../../src/dataset/vr/types.js";
import type { VR } from "../../../src/dictionary/types.js";
import { parseDicom } from "../../../src/index.js";
import { buildDicom } from "../../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const REPLACEMENT = String.fromCharCode(0xfffd);
/** Half-width katakana YA and MA, U+FF94 U+FF8F. */
const HALF_WIDTH_YAMA = String.fromCharCode(0xff94, 0xff8f);
/** Hangul Jamo, Hangul Compatibility Jamo, Hangul Syllables, CJK Unified and Compatibility Ideographs. */
const HANGUL_OR_HANJA: readonly (readonly [number, number])[] = [
  [0x1100, 0x11ff],
  [0x3130, 0x318f],
  [0xac00, 0xd7a3],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
];
const hasHangulOrHanja = (text: string): boolean =>
  [...text].some((c) => {
    const cp = c.codePointAt(0) ?? 0;
    return HANGUL_OR_HANJA.some(([low, high]) => cp >= low && cp <= high);
  });

const TAG_FOR_VR: Readonly<Record<string, string>> = {
  PN: "00100010",
  LO: "00100020",
  SH: "00080050",
  UC: "00080119",
  ST: "00080081",
  LT: "00104000",
  UT: "0040A160",
};

/** Hex, whitespace ignored, to bytes. */
function hex(text: string): Buffer {
  return Buffer.from(text.replace(/\s+/gu, ""), "hex");
}

/** Pad to the even length PS3.5 section 7.1 requires, with the SPACE text VRs use. */
function even(bytes: Buffer): Buffer {
  return bytes.length % 2 === 0 ? bytes : Buffer.concat([bytes, Buffer.from([0x20])]);
}

/** The single element a synthetic file carries under `charset`, after `parseDicom`. */
function parsed(charset: string, vr: VR, value: Buffer): Element {
  const tag = TAG_FOR_VR[vr] ?? "00104000";
  const ds = parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00080005", vr: "CS", value: even(Buffer.from(charset, "latin1")) },
        { tag, vr, value: even(value) },
      ],
    }),
  );
  const element = ds.get(tag);
  if (element === undefined) throw new Error(`fixture lost ${tag}`);
  return element;
}

/** The `(0008,0005)` terms, as `parseSpecificCharacterSet` splits them. */
function terms(charset: string): string[] {
  return charset.split("\\");
}

function codes(value: DicomValue): string[] {
  return "warnings" in value ? (value.warnings ?? []).map((w) => w.code) : [];
}

function textOf(value: DicomValue): string {
  if (value.kind !== "text") throw new Error(`expected text, got ${value.kind}`);
  return value.value;
}

function namesOf(value: DicomValue): readonly {
  readonly alphabetic: PersonNameGroup;
  readonly ideographic?: PersonNameGroup;
  readonly phonetic?: PersonNameGroup;
}[] {
  if (value.kind !== "personName") throw new Error(`expected personName, got ${value.kind}`);
  return value.values;
}

function stringsOf(value: DicomValue): readonly string[] {
  if (value.kind !== "strings") throw new Error(`expected strings, got ${value.kind}`);
  return value.values;
}

/** The single-valued twin's reading of `bytes`: the pre-existing path, as an oracle. */
function twin(term: string, bytes: string): string {
  return decodeText(hex(bytes), [term]);
}

const eucJp = (bytes: readonly number[]): string =>
  new TextDecoder("euc-jp").decode(Uint8Array.from(bytes));
const iso2022jp = (bytes: Buffer): string => new TextDecoder("iso-2022-jp").decode(bytes);

describe("AC-1: every escape sequence of PS3.3 Tables C.12-3 and C.12-4 designates its set", () => {
  // One row per escape sequence: the declaring (0008,0005), the value bytes,
  // and the oracle's reading of the character those bytes encode.
  const ROWS: readonly (readonly [string, string, string, () => string])[] = [
    // ESC ( B is tested coming out of ISO-IR 87, so a GL byte it failed to
    // designate back would be half of a two-byte character instead of "A".
    [
      "1B 28 42 ISO-IR 6 into G0",
      "\\ISO 2022 IR 87",
      "1B 24 42 1B 28 42 41",
      () => twin("ISO_IR 6", "41"),
    ],
    [
      "1B 2D 41 ISO-IR 100 into G1",
      "\\ISO 2022 IR 100",
      "1B 2D 41 E9",
      () => twin("ISO_IR 100", "E9"),
    ],
    [
      "1B 2D 42 ISO-IR 101 into G1",
      "\\ISO 2022 IR 101",
      "1B 2D 42 B1",
      () => twin("ISO_IR 101", "B1"),
    ],
    [
      "1B 2D 43 ISO-IR 109 into G1",
      "\\ISO 2022 IR 109",
      "1B 2D 43 A1",
      () => twin("ISO_IR 109", "A1"),
    ],
    [
      "1B 2D 44 ISO-IR 110 into G1",
      "\\ISO 2022 IR 110",
      "1B 2D 44 A1",
      () => twin("ISO_IR 110", "A1"),
    ],
    [
      "1B 2D 4C ISO-IR 144 into G1",
      "\\ISO 2022 IR 144",
      "1B 2D 4C D0",
      () => twin("ISO_IR 144", "D0"),
    ],
    [
      "1B 2D 47 ISO-IR 127 into G1",
      "\\ISO 2022 IR 127",
      "1B 2D 47 C7",
      () => twin("ISO_IR 127", "C7"),
    ],
    [
      "1B 2D 46 ISO-IR 126 into G1",
      "\\ISO 2022 IR 126",
      "1B 2D 46 E1",
      () => twin("ISO_IR 126", "E1"),
    ],
    [
      "1B 2D 48 ISO-IR 138 into G1",
      "\\ISO 2022 IR 138",
      "1B 2D 48 E0",
      () => twin("ISO_IR 138", "E0"),
    ],
    [
      "1B 2D 4D ISO-IR 148 into G1",
      "\\ISO 2022 IR 148",
      "1B 2D 4D FD",
      () => twin("ISO_IR 148", "FD"),
    ],
    [
      "1B 2D 62 ISO-IR 203 into G1",
      "\\ISO 2022 IR 203",
      "1B 2D 62 A4",
      () => twin("ISO_IR 203", "A4"),
    ],
    [
      "1B 2D 54 ISO-IR 166 into G1",
      "\\ISO 2022 IR 166",
      "1B 2D 54 A1",
      () => twin("ISO_IR 166", "A1"),
    ],
    [
      "1B 29 49 ISO-IR 13 into G1",
      "\\ISO 2022 IR 13",
      "1B 29 49 B1",
      () => twin("ISO_IR 13", "B1"),
    ],
    // ESC ( J likewise comes out of ISO-IR 87, and is declared by the IR 13 row.
    [
      "1B 28 4A ISO-IR 14 into G0",
      "ISO 2022 IR 13\\ISO 2022 IR 87",
      "1B 24 42 1B 28 4A 41",
      () => twin("ISO_IR 13", "41"),
    ],
    // PS3.5 Example H.3-1 encodes its first ideograph as JIS X 0208 3B 33.
    ["1B 24 42 ISO-IR 87 into G0", "\\ISO 2022 IR 87", "1B 24 42 3B 33 1B 28 42", () => "山"],
    // JIS X 0212 row 16 cell 1, read by Node's EUC-JP decoder as 8F B0 A1.
    [
      "1B 24 28 44 ISO-IR 159 into G0",
      "\\ISO 2022 IR 159",
      "1B 24 28 44 30 21 1B 28 42",
      () => eucJp([0x8f, 0xb0, 0xa1]),
    ],
    // PS3.5 Example I.2-1 encodes the first Hangul syllable as C8 AB.
    ["1B 24 29 43 ISO-IR 149 into G1", "\\ISO 2022 IR 149", "1B 24 29 43 C8 AB", () => "홍"],
    // PS3.5 Example K.2-1 encodes its first Hanzi as D5 C5.
    ["1B 24 29 41 ISO-IR 58 into G1", "\\ISO 2022 IR 58", "1B 24 29 41 D5 C5", () => "张"],
  ];

  it.each(ROWS)("AC-1: %s", (_row, charset, bytes, oracle) => {
    const expected = oracle();
    // The oracle itself must name one real character, or the row proves nothing.
    expect([...expected]).toHaveLength(1);
    expect(expected).not.toBe(REPLACEMENT);

    const value = parsed(charset, "LT", hex(bytes)).value;
    expect(textOf(value)).toBe(expected);
    expect(codes(value)).toStrictEqual([]);
    expect(decodeText(hex(bytes), terms(charset))).toBe(expected);
    expect(decodeText(hex(bytes), terms(charset))).not.toContain("\u001b");
  });
});

describe("AC-3: a reset point brings back the Value 1 designations", () => {
  it("AC-3(a): after a PN ^, G1 is Value 1's ISO-IR 13 again, not KS X 1001", () => {
    const value = parsed(
      "ISO 2022 IR 13\\ISO 2022 IR 149",
      "PN",
      hex("1B 24 29 43 FB F3 5E D4 CF"),
    ).value;
    const [name] = namesOf(value);
    expect(twin("ISO_IR 13", "D4 CF")).toBe(HALF_WIDTH_YAMA);
    expect(name?.alphabetic.givenName).toBe(HALF_WIDTH_YAMA);
    // The family name is the KS X 1001 hanja the escape designated, per Example I.2-1.
    expect(name?.alphabetic.familyName).toBe("洪");
    expect(codes(value)).toStrictEqual([]);
  });

  it("AC-3(b): in an LT value a backslash is literal and does not reset", () => {
    const value = parsed("\\ISO 2022 IR 149", "LT", hex("1B 24 29 43 C8 AB 5C C8 AB")).value;
    expect(textOf(value)).toBe("홍\\홍");
    expect(codes(value)).toStrictEqual([]);
  });

  it("AC-3(c): in an LT value the bytes after CR LF decode from Value 1", () => {
    const charset = "ISO 2022 IR 100\\ISO 2022 IR 149";
    const bytes = hex("1B 24 29 43 C8 AB 0D 0A C8 AB");
    const expected = `홍\r\n${twin("ISO_IR 100", "C8 AB")}`;
    expect(textOf(parsed(charset, "LT", bytes).value)).toBe(expected);
    expect(decodeText(bytes, terms(charset))).toBe(expected);
  });

  it("AC-3: after FF the bytes decode from Value 1 too", () => {
    const charset = "ISO 2022 IR 100\\ISO 2022 IR 149";
    const value = parsed(charset, "UT", hex("1B 24 29 43 C8 AB 0C C8 AB")).value;
    expect(textOf(value)).toBe(`홍\f${twin("ISO_IR 100", "C8 AB")}`);
  });

  it.each(["LO", "SH", "UC"] as const)(
    "AC-3: in %s the backslash value delimiter resets to Value 1",
    (vr) => {
      const charset = "ISO 2022 IR 100\\ISO 2022 IR 149";
      const value = parsed(charset, vr, hex("1B 24 29 43 C8 AB 5C C8 AB")).value;
      expect(stringsOf(value)).toStrictEqual(["홍", twin("ISO_IR 100", "C8 AB")]);
      expect(codes(value)).toStrictEqual([]);
    },
  );

  it("AC-3: in PN the = and \\ delimiters reset to Value 1 as ^ does", () => {
    const charset = "ISO 2022 IR 100\\ISO 2022 IR 149";
    const value = parsed(
      charset,
      "PN",
      hex("1B 24 29 43 C8 AB 3D C8 AB 5C 1B 24 29 43 C8 AB 5C C8 AB"),
    ).value;
    const latin = twin("ISO_IR 100", "C8 AB");
    expect(
      namesOf(value).map((n) => [n.alphabetic.familyName, n.ideographic?.familyName]),
    ).toStrictEqual([
      ["홍", latin],
      ["홍", undefined],
      [latin, undefined],
    ]);
    expect(codes(value)).toStrictEqual([]);
  });

  it("AC-3: ST decodes with the text reset rules, like LT", () => {
    const value = parsed("\\ISO 2022 IR 149", "ST", hex("1B 24 29 43 C8 AB 5C C8 AB")).value;
    expect(textOf(value)).toBe("홍\\홍");
  });
});

describe("AC-4: in a 94x94 G0 set, 5C, 5E and 3D inside a character are not delimiters", () => {
  it("AC-4: PN 1B 24 42 49 3D 1B 28 42 is one component group whose family name is one character", () => {
    const bytes = hex("1B 24 42 49 3D 1B 28 42");
    const expected = iso2022jp(bytes);
    expect(expected).toBe("表");
    const value = parsed("\\ISO 2022 IR 87", "PN", bytes).value;
    const names = namesOf(value);
    expect(names).toHaveLength(1);
    expect(names[0]?.alphabetic.familyName).toBe(expected);
    expect(names[0]?.alphabetic.givenName).toBe("");
    expect(names[0]?.ideographic).toBeUndefined();
    expect(codes(value)).toStrictEqual([]);
  });

  it("AC-4: a PN 5E inside JIS X 0208 24 5E (Example H.3-1's phonetic character) is not a component delimiter", () => {
    const bytes = hex("1B 24 42 24 5E 1B 28 42");
    const names = namesOf(parsed("\\ISO 2022 IR 87", "PN", bytes).value);
    expect(names[0]?.alphabetic.familyName).toBe(iso2022jp(bytes));
    expect(names[0]?.alphabetic.givenName).toBe("");
  });

  it("AC-4: an LO 5C inside a JIS X 0208 character is not the value delimiter", () => {
    const bytes = hex("1B 24 42 30 5C 1B 28 42");
    const value = parsed("\\ISO 2022 IR 87", "LO", bytes).value;
    expect(stringsOf(value)).toStrictEqual([iso2022jp(bytes)]);
    expect(iso2022jp(bytes)).not.toContain("\\");
  });
});

describe("AC-5: an escape for a set (0008,0005) does not declare is decoded and flagged", () => {
  it("AC-5: PN ESC $ B yamada ESC ( B under \\ISO 2022 IR 149 is the family name with the warning", () => {
    const value = parsed("\\ISO 2022 IR 149", "PN", hex("1B 24 42 3B 33 45 44 1B 28 42")).value;
    expect(namesOf(value)[0]?.alphabetic.familyName).toBe("山田");
    expect(codes(value)).toStrictEqual(["DICOM_CHARSET_ESCAPE_UNDECLARED"]);
  });

  it("AC-5: an undeclared single-byte G1 escape is decoded in its set and flagged", () => {
    const value = parsed("\\ISO 2022 IR 87", "LO", hex("1B 2D 41 E9")).value;
    expect(stringsOf(value)).toStrictEqual([twin("ISO_IR 100", "E9")]);
    expect(codes(value)).toStrictEqual(["DICOM_CHARSET_ESCAPE_UNDECLARED"]);
  });
});

describe("AC-6: bytes no designated set decodes are U+FFFD, never another set's reading", () => {
  it("AC-6(a): ESC $ ( Q (JIS X 0213, in neither table) and what follows it read as U+FFFD", () => {
    const bytes = hex("1B 24 28 51 30 21");
    const element = parsed("\\ISO 2022 IR 87", "LT", bytes);
    expect(textOf(element.value)).toBe(REPLACEMENT);
    expect(codes(element.value)).toStrictEqual(["DICOM_CHARSET_BYTES_UNDECODABLE"]);
    expect(element.rawBytes.equals(bytes)).toBe(true);
    expect(decodeText(bytes, terms("\\ISO 2022 IR 87"))).toBe(REPLACEMENT);
  });

  it("AC-6(b): Example I.2-1 missing its second ESC $ ) C: the given name holds no Hangul or Hanja", () => {
    // PS3.5 Example I.2-1 with the 1B 24 29 43 before D1 CE D4 D7 removed, so
    // those GR bytes arrive in a component where G1 holds no set.
    const bytes = hex(
      "48 6F 6E 67 5E 47 69 6C 64 6F 6E 67 3D 1B 24 29 43 FB F3 5E D1 CE D4 D7 3D 1B 24 29 43 C8 AB 5E 1B 24 29 43 B1 E6 B5 BF",
    );
    const element = parsed("\\ISO 2022 IR 149", "PN", bytes);
    const [name] = namesOf(element.value);
    const given = name?.ideographic?.givenName ?? "";
    expect(given).not.toBe("");
    expect(hasHangulOrHanja(given)).toBe(false);
    expect(given.replaceAll(REPLACEMENT, "")).toBe("");
    // Non-vacuity: the same check does see the Hanja a KS X 1001 read would give.
    expect(hasHangulOrHanja(new TextDecoder("euc-kr").decode(hex("D1 CE D4 D7")))).toBe(true);
    // The groups either side still decode: the loss is confined to those bytes.
    expect(name?.ideographic?.familyName).toBe("洪");
    expect(name?.phonetic?.familyName).toBe("홍");
    expect(codes(element.value)).toStrictEqual(["DICOM_CHARSET_BYTES_UNDECODABLE"]);
    expect(element.rawBytes.equals(bytes)).toBe(true);
  });

  it("AC-6(c): a lone E at a character boundary of ISO-IR 87 is U+FFFD after the whole character", () => {
    const value = parsed("\\ISO 2022 IR 87", "PN", hex("1B 24 42 3B 33 45 1B 28 42")).value;
    expect(namesOf(value)[0]?.alphabetic.familyName).toBe(`山${REPLACEMENT}`);
    expect(codes(value)).toStrictEqual(["DICOM_CHARSET_BYTES_UNDECODABLE"]);
  });

  it("AC-6: after an unrecognized ESC every byte up to the next recognized escape sequence is U+FFFD, delimiters included", () => {
    const value = parsed(
      "\\ISO 2022 IR 87",
      "PN",
      hex("1B 24 28 51 30 21 41 5E 42 1B 28 42 43"),
    ).value;
    const names = namesOf(value);
    expect(names).toHaveLength(1);
    expect(names[0]?.alphabetic.familyName).toBe(`${REPLACEMENT}C`);
    expect(names[0]?.alphabetic.givenName).toBe("");
  });

  it("AC-6: an unrecognized ESC's run also ends at CR, LF or FF, and Value 1 decodes after it", () => {
    const bytes = hex("1B 24 28 51 30 21 0D 0A 41");
    expect(decodeText(bytes, terms("\\ISO 2022 IR 87"))).toBe(`${REPLACEMENT}\r\nA`);
    expect(decodeText(hex("1B 24 28 51 30 21 0C 41"), terms("\\ISO 2022 IR 87"))).toBe(
      `${REPLACEMENT}\fA`,
    );
  });

  it.each([
    // NEC row 13 is in Node's JIS X 0208 index but not in JIS X 0208.
    [
      "ISO-IR 87 row 13 (a vendor extension)",
      "\\ISO 2022 IR 87",
      "1B 24 42 2D 21 1B 28 42",
      "iso-2022-jp",
    ],
    // JIS X 0212 ends at row 77; Node's index has cells in row 83.
    ["ISO-IR 159 row 83", "\\ISO 2022 IR 159", "1B 24 28 44 73 21 1B 28 42", undefined],
    // A2A1 is GBK's small roman numeral one, not a GB 2312 character.
    ["ISO-IR 58 A2 A1 (a GBK addition)", "\\ISO 2022 IR 58", "1B 24 29 41 A2 A1", undefined],
    // C9 A1 is in KS X 1001's user-defined row.
    ["ISO-IR 149 C9 A1 (user-defined)", "\\ISO 2022 IR 149", "1B 24 29 43 C9 A1", undefined],
    // ISO 8859-3 leaves A5 unassigned.
    ["ISO-IR 109 A5 (unassigned)", "\\ISO 2022 IR 109", "1B 2D 43 A5", undefined],
    // ISO-IR 13 is a 94-character set with no character at E0.
    ["ISO-IR 13 E0 (outside the katakana)", "\\ISO 2022 IR 13", "1B 29 49 E0", undefined],
    // 0x80 is a C1 control, which no set in either table covers.
    ["a C1 byte", "ISO 2022 IR 100\\ISO 2022 IR 87", "80", undefined],
  ] as const)(
    "AC-6: a code the designated set does not define is U+FFFD: %s",
    (_name, charset, bytes, supersetLabel) => {
      if (supersetLabel !== undefined) {
        // The runtime's own decoder reads a character here: refusing it is a choice.
        expect(new TextDecoder(supersetLabel).decode(hex(bytes))).not.toContain(REPLACEMENT);
      }
      const value = parsed(charset, "LT", hex(bytes)).value;
      expect(textOf(value)).toBe(REPLACEMENT);
      expect(codes(value)).toStrictEqual(["DICOM_CHARSET_BYTES_UNDECODABLE"]);
    },
  );

  it.each([
    // The repertoire sizes JIS X 0208:1990, JIS X 0212-1990 and GB 2312-80
    // publish; for KS X 1001, Node's euc-kr index less its user-defined cells.
    ["ISO-IR 87", "\\ISO 2022 IR 87", [0x1b, 0x24, 0x42], 0x21, 6879],
    ["ISO-IR 159", "\\ISO 2022 IR 159", [0x1b, 0x24, 0x28, 0x44], 0x21, 6067],
    ["ISO-IR 149", "\\ISO 2022 IR 149", [0x1b, 0x24, 0x29, 0x43], 0xa1, 8224],
    ["ISO-IR 58", "\\ISO 2022 IR 58", [0x1b, 0x24, 0x29, 0x41], 0xa1, 7445],
  ] as const)(
    "AC-6: %s decodes exactly its own repertoire, every other cell is U+FFFD",
    (_name, charset, escape, base, size) => {
      let decoded = 0;
      for (let row = 0; row < 94; row += 1) {
        const cells: number[] = [];
        for (let cell = 0; cell < 94; cell += 1) cells.push(base + row, base + cell);
        const characters = [...decodeText(Buffer.from([...escape, ...cells]), terms(charset))];
        expect(characters).toHaveLength(94);
        decoded += characters.filter((c) => c !== REPLACEMENT).length;
      }
      expect(decoded).toBe(size);
    },
  );
});

describe("AC-6: a set this build has no decoder for", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("AC-6: with no euc-kr decoder in the runtime, KS X 1001 bytes read as U+FFFD with the warning", async () => {
    // A double for the runtime's ICU, which is outside the library: it refuses
    // one label, as a small-ICU Node build does.
    const Real = globalThis.TextDecoder;
    class NoEucKr extends Real {
      constructor(...args: ConstructorParameters<typeof Real>) {
        if (args[0] === "euc-kr") throw new RangeError("euc-kr is not supported");
        super(...args);
      }
    }
    vi.stubGlobal("TextDecoder", NoEucKr);
    vi.resetModules();
    const fresh = await import("../../../src/index.js");
    const ds = fresh.parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: even(Buffer.from("\\ISO 2022 IR 149", "latin1")) },
          { tag: "00104000", vr: "LT", value: hex("1B 24 29 43 C8 AB") },
        ],
      }),
    );
    const value = ds.get("00104000")?.value;
    expect(value).toMatchObject({ kind: "text", value: REPLACEMENT });
    expect(value === undefined ? [] : codes(value)).toStrictEqual([
      "DICOM_CHARSET_BYTES_UNDECODABLE",
    ]);
  });
});

describe("AC-7: a line, value or PN component that ends without switching back", () => {
  it("AC-7(a): an ideographic family name that omits its switch back before ^", () => {
    const bytes = Buffer.concat([
      Buffer.from("Yamada^Tarou=", "latin1"),
      hex("1B 24 42 3B 33 45 44 5E 1B 24 42 42 40 4F 3A 1B 28 42"),
    ]);
    const value = parsed("\\ISO 2022 IR 87", "PN", bytes).value;
    const [name] = namesOf(value);
    expect(name?.ideographic?.familyName).toBe("山田");
    expect(name?.ideographic?.givenName).toBe("太郎");
    expect(codes(value)).toStrictEqual(["DICOM_CHARSET_EXTENSION_NOT_RESET"]);
  });

  it("AC-7(b): 1B 24 42 3B 33 45 44 ending the value", () => {
    const value = parsed("\\ISO 2022 IR 87", "PN", hex("1B 24 42 3B 33 45 44")).value;
    expect(namesOf(value)[0]?.alphabetic.familyName).toBe("山田");
    expect(codes(value)).toStrictEqual(["DICOM_CHARSET_EXTENSION_NOT_RESET"]);
  });

  it("AC-7: a lone backslash at a character boundary of ISO-IR 87 ends an LO value, and the next decodes from Value 1", () => {
    // 5C then ESC: nothing after it could complete a character, so it is the
    // delimiter. (5C then a GL byte would be half of one, per AC-4.)
    const value = parsed("\\ISO 2022 IR 87", "LO", hex("1B 24 42 3B 33 5C 1B 28 42 41")).value;
    expect(stringsOf(value)).toStrictEqual(["山", "A"]);
    expect(codes(value)).toStrictEqual(["DICOM_CHARSET_EXTENSION_NOT_RESET"]);
  });

  it("AC-7: an LT line that ends at CR LF still in ISO-IR 87", () => {
    const value = parsed("\\ISO 2022 IR 87", "LT", hex("1B 24 42 3B 33 0D 0A 41")).value;
    expect(textOf(value)).toBe("山\r\nA");
    expect(codes(value)).toStrictEqual(["DICOM_CHARSET_EXTENSION_NOT_RESET"]);
  });

  it("AC-7: a G1 left designated at a delimiter is reset silently (Example K.2-1's note)", () => {
    const value = parsed("\\ISO 2022 IR 149", "PN", hex("1B 24 29 43 C8 AB 5E 41")).value;
    expect(namesOf(value)[0]?.alphabetic.givenName).toBe("A");
    expect(codes(value)).toStrictEqual([]);
  });
});

describe("AC-9: every other (0008,0005) decodes exactly as the pin's single-label path", () => {
  const pin = (bytes: Buffer, t: readonly string[]): string =>
    new TextDecoder(resolveDecoderLabel(t)).decode(bytes);

  it.each([
    ["ISO_IR 192\\ISO 2022 IR 87", Buffer.from("Müller", "utf-8")],
    // GB 2312 / GBK / GB 18030 bytes of 张, as Example K.2-1 encodes it.
    ["GB18030\\ISO 2022 IR 149", hex("D5 C5")],
    ["GBK\\ISO 2022 IR 149", hex("D5 C5")],
    ["ISO 2022 IR 87", hex("1B 24 42 3B 33 45 44 1B 28 42")],
  ] as const)("AC-9: %s", (charset, bytes) => {
    const t = terms(charset);
    expect(decodeText(bytes, t)).toBe(pin(bytes, t));
    expect(textOf(parsed(charset, "LT", bytes).value)).toBe(pin(bytes, t));
  });
});

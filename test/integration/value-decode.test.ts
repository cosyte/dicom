/**
 * Phase 3 capstone - end-to-end value decode through the public surface.
 *
 * Exercises `Element.value` + the `Dataset.get/has/elements/getAll`
 * navigation API over full Part 10 fixtures built by `build-dicom.ts`,
 * including `(0008,0005)` Specific Character Set threading and big-endian
 * numeric decode (signedness from VR, endianness from transfer syntax).
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { decodeText } from "../../src/dataset/vr/charset.js";
import { parseDicom } from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

describe("Element.value - end-to-end decode", () => {
  it("decodes PN to its structured form via Dataset.get", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("Doe^Jane", "ascii") }],
      }),
    );
    const v = ds.get("00100010")?.value;
    expect(v?.kind).toBe("personName");
    if (v?.kind === "personName") expect(v.values[0]?.alphabetic.givenName).toBe("Jane");
  });

  it("decodes US (Rows) - endianness honored for Explicit BE", () => {
    // US=512 → caller passes native LE bytes; encoder swaps to BE for the BE TS.
    const value = Buffer.from([0x00, 0x02]);
    for (const ts of [TS_EXPLICIT_LE, TS_EXPLICIT_BE]) {
      const ds = parseDicom(
        buildDicom({ transferSyntax: ts, elements: [{ tag: "00280010", vr: "US", value }] }),
      );
      const v = ds.get("00280010")?.value;
      expect(v?.kind).toBe("numbers");
      if (v?.kind === "numbers") expect(v.values[0]).toBe(512);
    }
  });

  it("memoizes - repeated .value access returns the same object", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") }],
      }),
    );
    const el = ds.get("00080060");
    expect(el?.value).toBe(el?.value);
  });

  it("an unknown (0008,0005) term emits DICOM_UNSUPPORTED_CHARSET; text still decodes best-effort", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 9999", "ascii") },
          { tag: "00080080", vr: "LO", value: Buffer.from("Clinic", "utf-8") },
        ],
      }),
    );
    expect(ds.warnings.some((w) => w.code === "DICOM_UNSUPPORTED_CHARSET")).toBe(true);
    expect(ds.get("00080080")?.value).toMatchObject({ kind: "strings", values: ["Clinic"] });
  });

  it("threads (0008,0005) so a later LO decodes as UTF-8", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 192", "ascii") },
          { tag: "00080080", vr: "LO", value: Buffer.from("Müller-Klinik", "utf-8") },
        ],
      }),
    );
    const v = ds.get("00080080")?.value;
    expect(v).toMatchObject({ kind: "strings", values: ["Müller-Klinik"] });
  });

  it("navigation: has / getAll / elements over a parsed dataset", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") },
          { tag: "00100010", vr: "PN", value: Buffer.from("Doe^Jane", "ascii") },
        ],
      }),
    );
    expect(ds.has("00080060")).toBe(true);
    expect(ds.has("7FE00010")).toBe(false);
    expect(ds.getAll("00100010")).toHaveLength(1);
    expect(ds.getAll("7FE00010")).toEqual([]);
    expect(ds.elements().length).toBeGreaterThanOrEqual(2);
  });

  it("a root (0008,0005) charset is inherited by SQ items and restored after the sequence", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 192", "ascii") },
          {
            tag: "00081140",
            items: [
              {
                elements: [{ tag: "00080080", vr: "LO", value: Buffer.from("Müller", "utf-8") }],
              },
            ],
          },
          { tag: "00100020", vr: "LO", value: Buffer.from("Müller", "utf-8") },
        ],
      }),
    );
    const sq = ds.get("00081140")?.value;
    if (sq?.kind === "sequence") {
      expect(sq.items[0]?.get("00080080")?.value).toMatchObject({ values: ["Müller"] });
    }
    // A sibling AFTER the SQ still sees the parent charset (restored, not leaked away).
    expect(ds.get("00100020")?.value).toMatchObject({ kind: "strings", values: ["Müller"] });
  });

  describe("AC-2: PS3.5 2026d's code-extension Person Name examples, byte for byte", () => {
    // Synthetic: each fixture is the standard's own published worked example,
    // copied from its encoded representation (PS3.5 2026d Examples H.3-1, H.3-2,
    // I.2-1 and K.2-1) and wrapped in a Part 10 buffer by `build-dicom`. The
    // names are the standard's, and name nobody.
    const group = (familyName: string, givenName: string): Record<string, string> => ({
      familyName,
      givenName,
      middleName: "",
      namePrefix: "",
      nameSuffix: "",
    });
    const hex = (text: string): Buffer => Buffer.from(text.replace(/\s+/gu, ""), "hex");
    const EXAMPLES = [
      {
        example: "H.3-1",
        charset: "\\ISO 2022 IR 87",
        bytes:
          "59 61 6D 61 64 61 5E 54 61 72 6F 75 3D 1B 24 42 3B 33 45 44 1B 28 42 5E 1B 24 42 42 40 4F 3A 1B 28 42 3D 1B 24 42 24 64 24 5E 24 40 1B 28 42 5E 1B 24 42 24 3F 24 6D 24 26 1B 28 42",
        shown: "Yamada^Tarou=山田^太郎=やまだ^たろう",
        groups: [group("Yamada", "Tarou"), group("山田", "太郎"), group("やまだ", "たろう")],
      },
      {
        example: "H.3-2",
        charset: "ISO 2022 IR 13\\ISO 2022 IR 87",
        bytes:
          "D4 CF C0 DE 5E C0 DB B3 3D 1B 24 42 3B 33 45 44 1B 28 4A 5E 1B 24 42 42 40 4F 3A 1B 28 4A 3D 1B 24 42 24 64 24 5E 24 40 1B 28 4A 5E 1B 24 42 24 3F 24 6D 24 26 1B 28 4A",
        shown: "ﾔﾏﾀﾞ^ﾀﾛｳ=山田^太郎=やまだ^たろう",
        groups: [group("ﾔﾏﾀﾞ", "ﾀﾛｳ"), group("山田", "太郎"), group("やまだ", "たろう")],
      },
      {
        example: "I.2-1",
        charset: "\\ISO 2022 IR 149",
        bytes:
          "48 6F 6E 67 5E 47 69 6C 64 6F 6E 67 3D 1B 24 29 43 FB F3 5E 1B 24 29 43 D1 CE D4 D7 3D 1B 24 29 43 C8 AB 5E 1B 24 29 43 B1 E6 B5 BF",
        shown: "Hong^Gildong=洪^吉洞=홍^길동",
        groups: [group("Hong", "Gildong"), group("洪", "吉洞"), group("홍", "길동")],
      },
      {
        example: "K.2-1",
        charset: "\\ISO 2022 IR 58",
        // The final 20 is the example's own SPACE pad.
        bytes:
          "5A 68 61 6E 67 5E 58 69 61 6F 44 6F 6E 67 3D 1B 24 29 41 D5 C5 5E 1B 24 29 41 D0 A1 B6 AB 3D 20",
        shown: "Zhang^XiaoDong=张^小东=",
        groups: [group("Zhang", "XiaoDong"), group("张", "小东"), group("", "")],
      },
    ] as const;

    it.each(EXAMPLES)(
      "AC-2: Example $example reads as the component groups the standard shows, with no warning",
      ({ charset, bytes, shown, groups }) => {
        const value = hex(bytes);
        const ds = parseDicom(
          buildDicom({
            transferSyntax: TS_EXPLICIT_LE,
            elements: [
              {
                tag: "00080005",
                vr: "CS",
                value: Buffer.from(charset.length % 2 === 0 ? charset : `${charset} `, "ascii"),
              },
              { tag: "00100010", vr: "PN", value },
            ],
          }),
        );
        const element = ds.get("00100010");
        const v = element?.value;
        expect(v?.kind).toBe("personName");
        if (v?.kind !== "personName") return;
        expect(v.warnings).toBeUndefined();
        expect(v.values).toHaveLength(1);
        const [alphabetic, ideographic, phonetic] = groups;
        expect(v.values[0]?.alphabetic).toStrictEqual(alphabetic);
        expect(v.values[0]?.ideographic).toStrictEqual(ideographic);
        expect(v.values[0]?.phonetic).toStrictEqual(phonetic);

        let end = value.length;
        while (end > 0 && value[end - 1] === 0x20) end -= 1;
        expect(decodeText(value.subarray(0, end), element?.specificCharacterSet)).toBe(shown);
      },
    );
  });

  it("navigates into a parsed SQ item via Element.value → Item.get", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "00081140", // Referenced Image Sequence
            items: [
              {
                elements: [{ tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") }],
              },
            ],
          },
        ],
      }),
    );
    const sq = ds.get("00081140")?.value;
    expect(sq?.kind).toBe("sequence");
    if (sq?.kind === "sequence") {
      const inner = sq.items[0]?.get("00080060")?.value;
      expect(inner).toMatchObject({ kind: "strings", values: ["CT"] });
    }
  });
});

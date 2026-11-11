/**
 * A parsed Dataset keeps its elements in the parse's compact table and builds each Element and
 * Item the first time a caller asks for it.
 *
 * Two kinds of claim live here. The model's shape: a parsed Dataset and Item no longer carry the
 * element map as an own property (so `Object.keys`, a spread and `JSON.stringify` no longer list
 * every element), while an Element keeps exactly the own keys it had. And the lookups: whatever
 * order the tags come in, however many, and however often one repeats, `get`, `has`, `getAll` and
 * `elements` answer as the `Map` keyed by tag did, with the earlier position and the later value
 * for a repeated tag, and the same object every time.
 *
 * Synthetic data only.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { Dataset, Element, Item, parseDicom } from "../../src/index.js";
import { buildDicom, type BuildDicomElement } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

const text = (s: string): Buffer => {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
};

/** One short string element for each tag, in the order given. */
function shortStrings(tags: readonly string[]): BuildDicomElement[] {
  return tags.map((tag, i) => ({ tag, vr: "SH", value: text(`V${String(i)}`) }));
}

/** What a Map keyed by tag holds after `set` in this order: first position, last value. */
function mapOf(elements: readonly BuildDicomElement[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of elements) map.set(el.tag, el.value.toString("latin1").trimEnd());
  return map;
}

function valueText(el: Element | undefined): string | undefined {
  return el?.rawBytes.toString("latin1").trimEnd();
}

describe("the model's shape", () => {
  const ds = parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN", value: text("SYNTHETIC^PATIENT") },
        {
          tag: "0040A730",
          items: [{ elements: [{ tag: "0040A040", vr: "CS", value: text("TEXT") }] }],
        },
      ],
    }),
  );

  it("keeps no element map on a parsed Dataset or Item", () => {
    expect(Object.keys(ds)).toEqual([
      "fileMeta",
      "warnings",
      "_patient",
      "_study",
      "_series",
      "_image",
      "_directory",
    ]);
    const item = ds.get("0040A730")?.items?.[0];
    expect(item).toBeInstanceOf(Item);
    expect(Object.keys(item ?? {})).toEqual([
      "fileMeta",
      "warnings",
      "_patient",
      "_study",
      "_series",
      "_image",
      "_directory",
      "index",
      "fileOffset",
    ]);
    expect(JSON.stringify(ds)).not.toContain("SYNTHETIC");
  });

  it("keeps every own key an Element had", () => {
    const el = ds.get("00100010");
    expect(Object.keys(el ?? {})).toEqual([
      "tag",
      "vr",
      "vm",
      "length",
      "byteOffset",
      "privateCreator",
      "cp246Promoted",
      "littleEndian",
      "specificCharacterSet",
      "items",
      "_valueCache",
    ]);
  });

  it("keeps the element map of a Dataset built by hand", () => {
    const el = new Element({
      tag: "00100010",
      vr: "PN",
      vm: 1,
      length: 18,
      rawBytes: text("SYNTHETIC^PATIENT"),
      byteOffset: 0,
      littleEndian: true,
    });
    const elements = new Map([["00100010", el]]);
    const built = new Dataset({ warnings: [], elements });
    expect(built.get("00100010")).toBe(el);
    expect((built as unknown as { _elements: unknown })._elements).toBe(elements);
  });
});

describe("lookups over the compact table", () => {
  // Ascending, then out of order and long enough for a map, then with repeats in both.
  const ascending = shortStrings(
    Array.from({ length: 40 }, (_v, i) => `0011${(0x1000 + i).toString(16).toUpperCase()}`),
  );
  const shuffled = [...ascending].reverse();
  const repeated: BuildDicomElement[] = [
    ...shuffled.slice(0, 20),
    { tag: "00111005", vr: "SH", value: text("LATER") },
    ...shuffled.slice(20),
    { tag: "00111020", vr: "SH", value: text("LAST") },
    { tag: "00111005", vr: "SH", value: text("LATEST") },
  ];
  const shortRepeated: BuildDicomElement[] = [
    { tag: "00111002", vr: "SH", value: text("A") },
    { tag: "00111001", vr: "SH", value: text("B") },
    { tag: "00111002", vr: "SH", value: text("C") },
  ];
  const sortedRepeat: BuildDicomElement[] = [
    { tag: "00111001", vr: "SH", value: text("A") },
    { tag: "00111001", vr: "SH", value: text("B") },
  ];

  for (const [label, ts] of [
    ["Implicit VR LE", TS_IMPLICIT_LE],
    ["Explicit VR LE", TS_EXPLICIT_LE],
    ["Explicit VR BE", TS_EXPLICIT_BE],
  ] as const) {
    for (const [shape, elements] of [
      ["ascending", ascending],
      ["out of order", shuffled],
      ["out of order with repeats", repeated],
      ["short with repeats", shortRepeated],
      ["ascending with a repeat", sortedRepeat],
    ] as const) {
      it(`answers as a Map keyed by tag: ${label}, ${shape}`, () => {
        const root = parseDicom(buildDicom({ transferSyntax: ts, elements }));
        const item = parseDicom(
          buildDicom({
            transferSyntax: ts,
            elements: [{ tag: "0040A730", items: [{ elements }] }],
          }),
        ).get("0040A730")?.items?.[0];
        for (const ds of [root, item]) {
          if (ds === undefined) throw new Error("no Item");
          const expected = mapOf(elements);
          const got = ds.elements();
          expect(got.map((el) => el.tag)).toEqual([...expected.keys()]);
          expect(got.map(valueText)).toEqual([...expected.values()]);
          for (const [tag, value] of expected) {
            expect(ds.has(tag)).toBe(true);
            expect(ds.has(tag.toLowerCase())).toBe(true);
            expect(valueText(ds.get(tag.toLowerCase()))).toBe(value);
            expect(ds.get(tag)).toBe(ds.get(tag));
            expect(ds.getAll(tag)).toEqual([ds.get(tag)]);
          }
          expect(ds.elements()[0]).toBe(got[0]);
          expect(ds.get("00111FFF")).toBeUndefined();
          expect(ds.has("0011100")).toBe(false);
          expect(ds.has("0x111001")).toBe(false);
          expect(ds.getAll("00111FFF")).toEqual([]);
        }
        if (shape.includes("repeat")) {
          expect(root.warnings.map((w) => w.code)).toContain("DICOM_DUPLICATE_TAG_IN_DATA_SET");
        }
      });
    }
  }

  it("matches a tag whose upper case is eight hex digits, and throws for a non-string", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "0010FF10", vr: "SH", value: text("SYN") }],
      }),
    );
    // The Latin small ligature ff, U+FB00, upper-cases to "FF".
    expect(ds.has(`0010${String.fromCharCode(0xfb00)}10`)).toBe(true);
    expect(() => ds.get(7 as unknown as string)).toThrow(TypeError);
  });
});

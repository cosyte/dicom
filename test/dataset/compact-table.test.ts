/**
 * A parsed Dataset keeps its elements in the parse's compact table and builds each Element and
 * Item the first time a caller asks for it.
 *
 * Two kinds of claim live here. The model's shape: a parsed Dataset and Item no longer carry the
 * element map as an own property (so `Object.keys`, a spread and `JSON.stringify` no longer list
 * every element), and an Element has no own keys at all: its fields are accessors that read the
 * table row, or the init of an Element built by hand. And the lookups: whatever
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

  it("reads every field of a parsed Element from the table, with no own key", () => {
    const el = ds.get("00100010");
    expect(el).toBeInstanceOf(Element);
    expect(Object.keys(el ?? {})).toEqual([]);
    expect(JSON.stringify(el)).toBe("{}");
    expect({ ...el }).toEqual({});
    expect(el?.tag).toBe("00100010");
    expect(el?.vr).toBe("PN");
    expect(el?.vm).toBe(1);
    expect(el?.length).toBe(18);
    expect(el?.privateCreator).toBeUndefined();
    expect(el?.cp246Promoted).toBeUndefined();
    expect(el?.littleEndian).toBe(true);
    expect(el?.specificCharacterSet).toBeUndefined();
    expect(el?.items).toBeUndefined();
    expect(el?.rawBytes.toString("latin1")).toBe("SYNTHETIC^PATIENT ");
    const sq = ds.get("0040A730");
    expect(Object.keys(sq ?? {})).toEqual([]);
    expect(sq?.vm).toBe(1);
    expect(sq?.items).toBe(sq?.items);
    expect(sq?.items?.[0]?.get("0040A040")?.vr).toBe("CS");
  });

  it("gives an Element built by hand the fields it was built with, and no own key", () => {
    const init = {
      tag: "00091010",
      vr: "LO" as const,
      vm: 1,
      length: 18,
      rawBytes: text("SYNTHETIC^PATIENT"),
      byteOffset: 7,
      privateCreator: "SYNTHETIC CREATOR",
      cp246Promoted: true,
      littleEndian: false,
      specificCharacterSet: ["ISO_IR 100"],
      items: [],
    };
    const el = new Element(init);
    expect(Object.keys(el)).toEqual([]);
    expect(JSON.stringify(el)).toBe("{}");
    expect(el.tag).toBe("00091010");
    expect(el.vr).toBe("LO");
    expect(el.vm).toBe(1);
    expect(el.length).toBe(18);
    expect(el.byteOffset).toBe(7);
    expect(el.privateCreator).toBe("SYNTHETIC CREATOR");
    expect(el.cp246Promoted).toBe(true);
    expect(el.littleEndian).toBe(false);
    expect(el.specificCharacterSet).toBe(init.specificCharacterSet);
    expect(el.items).toBe(init.items);
    expect(el.rawBytes).toBe(init.rawBytes);
    // The constructor copies the init, as it always did: a later change to it is not seen.
    (init as { tag: string }).tag = "00100020";
    expect(el.tag).toBe("00091010");
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

describe("an Element kept apart from its Dataset", () => {
  /** A worklist-shaped file: a name, a code, and a Sequence with one Item. */
  function fileOf(name: string, code: string): Buffer {
    return buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN", value: text(name) },
        { tag: "00100020", vr: "LO", value: text(code) },
        {
          tag: "0040A730",
          items: [{ elements: [{ tag: "0040A160", vr: "UT", value: text(`${code} NOTE`) }] }],
        },
      ],
    });
  }

  /** The Elements of one parse, with the Dataset itself dropped once they are taken. */
  function keep(bytes: Buffer, copyValues: boolean): (Element | undefined)[] {
    const ds = parseDicom(bytes, { copyValues });
    return [ds.get("00100010"), ds.get("00100020"), ds.get("0040A730")];
  }

  function readBack(el: Element | undefined): unknown {
    return {
      tag: el?.tag,
      vr: el?.vr,
      vm: el?.vm,
      length: el?.length,
      byteOffset: el?.byteOffset,
      bytes: el?.rawBytes.toString("latin1"),
      value: el?.value,
      inner: el?.items?.[0]?.get("0040A160")?.value,
    };
  }

  for (const copyValues of [false, true]) {
    it(`reads its own values after its Dataset is dropped and another file is parsed (copyValues: ${String(copyValues)})`, () => {
      const first = fileOf("SYNTHETIC^FIRST", "SYN-0001");
      const kept = keep(first, copyValues);
      // Read nothing yet: every field and value is read from the table after the second parse.
      const second = parseDicom(fileOf("SYNTHETIC^SECONDNAME", "SYN-0000002"), { copyValues });
      expect(second.get("00100010")?.rawBytes.toString("latin1")).toBe("SYNTHETIC^SECONDNAME");
      const fresh = keep(first, copyValues);
      expect(kept.map(readBack)).toEqual(fresh.map(readBack));
      expect(kept[0]?.rawBytes.toString("latin1")).toBe("SYNTHETIC^FIRST ");
      expect(kept[1]?.value).toEqual({ kind: "strings", values: ["SYN-0001"] });
      expect(kept[2]?.items?.[0]?.get("0040A160")?.rawBytes.toString("latin1")).toBe(
        "SYN-0001 NOTE ",
      );
    });
  }
});

describe("deep equality of Elements", () => {
  it("sees no field, so two different Elements compare equal and their fields must be compared", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00100010", vr: "PN", value: text("SYNTHETIC^PATIENT") },
          { tag: "00100020", vr: "LO", value: text("SYN-0001") },
        ],
      }),
    );
    const name = ds.get("00100010");
    const id = ds.get("00100020");
    expect(name).toEqual(id);
    expect(name).toStrictEqual(id);
    expect({ tag: name?.tag, value: name?.value }).not.toEqual({ tag: id?.tag, value: id?.value });
  });
});

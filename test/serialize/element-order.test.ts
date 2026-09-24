/**
 * S0361-dicom-5: `serializeDicom` emits every Data Set in ascending tag order.
 *
 * PS3.5 2026c section 7.1 orders a Data Set's elements "by increasing Data
 * Element Tag Number"; section 7.5.1 repeats it inside every Item, and section
 * 7.5 keeps the Items themselves an ordered set. The parser accepts any order
 * and the model keeps parse order, so the writer normalizes order on emit. Every
 * test below names the acceptance criterion it grades.
 *
 * Everything here is **synthetic**: fixtures are built in memory by
 * `build-dicom` or hand-assembled by the wire helpers below, and every
 * name-bearing value is an invented, allow-listed placeholder. No real patient
 * data is used. Tiers (`standards-conformance` S4): the out-of-order fixtures
 * are Tier 2 (a vendor quirk reproduced synthetically), the already-ascending
 * control (AC-5) and the de-identify round trip (AC-12) are Tier 3.
 *
 * "Read back" means `parseDicom(output)` with default options, whose
 * `elements()` order is the order the bytes carry.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { Dataset, Element, Item, deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { NESTING_DEPTH_LIMIT } from "../../src/parser/sequence.js";
import {
  buildDicom,
  type BuildDicomOptions,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";
const ALL_TS = [TS_IMPLICIT_LE, TS_EXPLICIT_LE, TS_EXPLICIT_BE, TS_DEFLATED_LE] as const;
/** The syntaxes that can carry a VR on the wire (so a `UN` or an encapsulated value). */
const EXPLICIT_TS = [TS_EXPLICIT_LE, TS_EXPLICIT_BE] as const;

const UNDEFINED_LENGTH = 0xffffffff;
/** `(0040,A730)` Content Sequence: `SQ` in PS3.6, so Implicit VR LE resolves it too. */
const CONTENT_SEQ: Tag = "0040A730";
/** A private tag: `UN` under Implicit VR LE with no creator, CP-246 at undefined length. */
const PRIVATE_TAG: Tag = "00091010";
const CANARY = "SYNTHETIC^CANARY";

type BuiltElement = BuildDicomOptions["elements"][number];

/** Even-pad a text value with SPACE so every fixture value is even-length. */
function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

function text(tag: Tag, vr: VR, s: string): BuiltElement {
  return { tag, vr, value: pad(s) };
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test fixture: ${what} is missing`);
  return value;
}

// ---------------------------------------------------------------------------
// Reading order back
// ---------------------------------------------------------------------------

function tagsOf(ds: Dataset | undefined): Tag[] {
  return (ds?.elements() ?? []).map((el) => el.tag);
}

function isAscending(tags: readonly Tag[]): boolean {
  return tags.every((tag, i) => i === 0 || parseInt(tags[i - 1] ?? "", 16) < parseInt(tag, 16));
}

interface DataSetOrder {
  readonly path: string;
  readonly depth: number;
  readonly tags: readonly Tag[];
}

/** Every Data Set in `ds`: the root at depth 0, then every Item at every depth. */
function dataSetsOf(
  ds: Dataset,
  path = "root",
  depth = 0,
  out: DataSetOrder[] = [],
): DataSetOrder[] {
  out.push({ path, depth, tags: tagsOf(ds) });
  for (const el of ds.elements()) {
    if (el.vr !== "SQ") continue;
    (el.items ?? []).forEach((item, i) => {
      dataSetsOf(item, `${path}/${el.tag}[${String(i)}]`, depth + 1, out);
    });
  }
  return out;
}

/** The bytes after the File Meta group; inflated for the Deflated syntax. */
function bodyOf(out: Buffer, ts: string): Buffer {
  // Preamble (128) + DICM (4) + (0002,0000) UL header (8) = 140; its value is the
  // byte count of the rest of the group.
  const body = out.subarray(144 + out.readUInt32LE(140));
  return ts === TS_DEFLATED_LE ? inflateRawSync(body) : body;
}

// ---------------------------------------------------------------------------
// Hand-assembled wire bytes, for the shapes the builder cannot express
// ---------------------------------------------------------------------------

interface Wire {
  readonly le: boolean;
  readonly explicit: boolean;
}

function wireOf(ts: string): Wire {
  if (ts === TS_IMPLICIT_LE) return { le: true, explicit: false };
  return { le: ts !== TS_EXPLICIT_BE, explicit: true };
}

const LONG_FORM: ReadonlySet<string> = new Set([
  "OB",
  "OW",
  "OF",
  "OD",
  "OL",
  "OV",
  "SQ",
  "UT",
  "UN",
  "UC",
  "UR",
  "SV",
  "UV",
]);

function u16(n: number, le: boolean): Buffer {
  const b = Buffer.alloc(2);
  if (le) b.writeUInt16LE(n, 0);
  else b.writeUInt16BE(n, 0);
  return b;
}

function u32(n: number, le: boolean): Buffer {
  const b = Buffer.alloc(4);
  if (le) b.writeUInt32LE(n, 0);
  else b.writeUInt32BE(n, 0);
  return b;
}

function tagBytes(tag: Tag, le: boolean): Buffer {
  return Buffer.concat([
    u16(parseInt(tag.slice(0, 4), 16), le),
    u16(parseInt(tag.slice(4), 16), le),
  ]);
}

/** One element header + value; `declared` is what the length field says. */
function wireEl(w: Wire, tag: Tag, vr: VR, value: Buffer, declared = value.length): Buffer {
  const t = tagBytes(tag, w.le);
  if (!w.explicit) return Buffer.concat([t, u32(declared, true), value]);
  const vrBytes = Buffer.from(vr, "ascii");
  if (LONG_FORM.has(vr)) {
    return Buffer.concat([t, vrBytes, Buffer.alloc(2), u32(declared, w.le), value]);
  }
  return Buffer.concat([t, vrBytes, u16(declared, w.le), value]);
}

/** A `(FFFE,xxxx)` marker: Item `E000`, Item Delimitation `E00D`, Sequence Delimitation `E0DD`. */
function marker(w: Wire, element: number, length: number): Buffer {
  return Buffer.concat([u16(0xfffe, w.le), u16(element, w.le), u32(length, w.le)]);
}

function wireItem(w: Wire, body: Buffer, undefinedLength = false): Buffer {
  if (undefinedLength) {
    return Buffer.concat([marker(w, 0xe000, UNDEFINED_LENGTH), body, marker(w, 0xe00d, 0)]);
  }
  return Buffer.concat([marker(w, 0xe000, body.length), body]);
}

function sqHeader(w: Wire, tag: Tag, length: number): Buffer {
  const t = tagBytes(tag, w.le);
  if (!w.explicit) return Buffer.concat([t, u32(length, true)]);
  return Buffer.concat([t, Buffer.from("SQ", "ascii"), Buffer.alloc(2), u32(length, w.le)]);
}

/** The complete on-wire span of an `SQ` whose Item stream is `stream`. */
function wireSq(w: Wire, tag: Tag, stream: Buffer, undefinedLength = false): Buffer {
  if (undefinedLength) {
    return Buffer.concat([sqHeader(w, tag, UNDEFINED_LENGTH), stream, marker(w, 0xe0dd, 0)]);
  }
  return Buffer.concat([sqHeader(w, tag, stream.length), stream]);
}

function scalar(tag: Tag, vr: VR, value: Buffer, le: boolean): Element {
  return new Element({
    tag,
    vr,
    vm: 1,
    length: value.length,
    rawBytes: value,
    byteOffset: 0,
    littleEndian: le,
  });
}

/**
 * A hand-built `SQ` {@link Element} over an on-wire span, in the `rawBytes`
 * convention the writer's input contract states: the full span, except a
 * defined-length `SQ` under Implicit VR LE, whose `rawBytes` are value-only.
 */
function sqElement(
  ts: string,
  tag: Tag,
  span: Buffer,
  undefinedLength: boolean,
  items?: readonly Item[],
): Element {
  const w = wireOf(ts);
  const headerLength = w.explicit ? 12 : 8;
  const rawBytes = !w.explicit && !undefinedLength ? span.subarray(headerLength) : span;
  return new Element({
    tag,
    vr: "SQ",
    vm: items?.length ?? 0,
    length: undefinedLength ? UNDEFINED_LENGTH : span.length - headerLength,
    rawBytes: Buffer.from(rawBytes),
    byteOffset: 0,
    littleEndian: w.le,
    ...(items !== undefined ? { items } : {}),
  });
}

function handDataset(ts: string, elements: readonly Element[]): Dataset {
  return new Dataset({
    fileMeta: { transferSyntaxUID: ts },
    warnings: [],
    elements: new Map(elements.map((el) => [el.tag, el] as const)),
  });
}

/** An Item body whose two elements are out of order: `(0040,A040)` before `(0008,0100)`. */
function outOfOrderBody(w: Wire, code: string): Buffer {
  return Buffer.concat([
    wireEl(w, "0040A040", "CS", pad("TEXT")),
    wireEl(w, "00080100", "SH", pad(code)),
  ]);
}

// ---------------------------------------------------------------------------
// AC-1
// ---------------------------------------------------------------------------

describe("AC-1: the root Data Set is emitted in ascending order", () => {
  const ascendingRoot: BuiltElement[] = [
    text("00080060", "CS", "OT"),
    text("00100020", "LO", "SYNTH-ID-1"),
    text("00200013", "IS", "7"),
  ];

  it.each(ALL_TS)("AC-1: a root the source file wrote out of order, under %s", (ts) => {
    const src = parseDicom(
      buildDicom({
        transferSyntax: ts,
        elements: [
          text("00200013", "IS", "7"),
          text("00080060", "CS", "OT"),
          text("00100020", "LO", "SYNTH-ID-1"),
          text("00080016", "UI", "1.2.840.10008.5.1.4.1.1.7"),
        ],
      }),
    );
    expect(isAscending(tagsOf(src))).toBe(false);
    const back = parseDicom(serializeDicom(src));
    expect(tagsOf(back)).toEqual(["00080016", "00080060", "00100020", "00200013"]);
  });

  it.each(ALL_TS)("AC-1: an element a caller added after the rest, under %s", (ts) => {
    const src = parseDicom(buildDicom({ transferSyntax: ts, elements: ascendingRoot }));
    const value = pad("1.2.840.10008.5.1.4.1.1.7");
    const added = scalar("00080016", "UI", value, ts !== TS_EXPLICIT_BE);
    const ds = new Dataset({
      ...(src.fileMeta !== undefined ? { fileMeta: src.fileMeta } : {}),
      warnings: [],
      elements: new Map([
        ...src.elements().map((el) => [el.tag, el] as const),
        [added.tag, added] as const,
      ]),
    });
    expect(isAscending(tagsOf(ds))).toBe(false);
    const back = parseDicom(serializeDicom(ds));
    expect(tagsOf(back)).toEqual(["00080016", "00080060", "00100020", "00200013"]);
    expect(back.get("00080016")?.rawBytes.equals(value)).toBe(true);
  });

  it.each(ALL_TS)("AC-1: the elements deidentify() inserted, under %s", (ts) => {
    const src = parseDicom(buildDicom({ transferSyntax: ts, elements: ascendingRoot }));
    expect(isAscending(tagsOf(src))).toBe(true);
    const { dataset } = deidentify(src);
    // The insertion is what put the model out of order; the source was not.
    expect(isAscending(tagsOf(dataset))).toBe(false);
    const back = parseDicom(serializeDicom(dataset));
    expect(isAscending(tagsOf(back))).toBe(true);
    expect(tagsOf(back)).toEqual(expect.arrayContaining(["00120062", "00120063", "00280303"]));
  });
});

// ---------------------------------------------------------------------------
// AC-2
// ---------------------------------------------------------------------------

/**
 * A chain of `(0040,A730)` Sequences `maxLevel` deep. Each level has two Items,
 * both out of order: the first carries the next level, the second only leaves.
 * The Sequence's and each Item's length form alternate with the level, and
 * `phase` swaps them, so across the two phases every depth carries a defined-
 * and an undefined-length Sequence and a defined- and an undefined-length Item.
 */
function chain(level: number, maxLevel: number, phase: 0 | 1): BuildDicomSqElement {
  const odd = (level + phase) % 2 === 1;
  const leaves = (label: string): BuiltElement[] => [
    text("0040A040", "CS", "TEXT"),
    text("00080100", "SH", label),
  ];
  const first: BuiltElement[] =
    level < maxLevel
      ? [chain(level + 1, maxLevel, phase), ...leaves(`L${String(level)}I0`)]
      : leaves(`L${String(level)}I0`);
  return {
    tag: CONTENT_SEQ,
    undefinedLength: odd,
    items: [
      { undefinedLength: !odd, elements: first },
      { undefinedLength: odd, elements: leaves(`L${String(level)}I1`) },
    ],
  };
}

describe("AC-2: every Item's Data Set is emitted ascending, at every depth up to the bound", () => {
  const cases = ALL_TS.flatMap((ts): [string, 0 | 1][] => [
    [ts, 0],
    [ts, 1],
  ]);

  it.each(cases)("AC-2: a %s chain nested to the bound (phase %i)", (ts, phase) => {
    const src = parseDicom(
      buildDicom({
        transferSyntax: ts,
        elements: [
          text("00100020", "LO", "SYNTH-ID-2"),
          chain(1, NESTING_DEPTH_LIMIT, phase),
          text("00080060", "CS", "OT"),
        ],
      }),
    );
    const before = dataSetsOf(src);
    expect(Math.max(...before.map((d) => d.depth))).toBe(NESTING_DEPTH_LIMIT);
    // Every Item Data Set in the source is out of order, so none is ascending by luck.
    expect(before.filter((d) => d.depth > 0 && isAscending(d.tags))).toEqual([]);

    const after = dataSetsOf(parseDicom(serializeDicom(src)));
    expect(after.length).toBe(before.length);
    expect(Math.max(...after.map((d) => d.depth))).toBe(NESTING_DEPTH_LIMIT);
    expect(after.filter((d) => !isAscending(d.tags))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-3
// ---------------------------------------------------------------------------

describe("AC-3: Items keep their source order", () => {
  it.each(ALL_TS)(
    "AC-3: Items are re-emitted in order while their elements move, under %s",
    (ts) => {
      const item = (label: string, extra: BuiltElement[] = []): BuildDicomOptions["elements"] => [
        ...extra,
        text("0040A040", "CS", "TEXT"),
        text("00080100", "SH", label),
      ];
      const nested: BuildDicomSqElement = {
        tag: CONTENT_SEQ,
        items: [{ elements: item("NESTED-0") }, { elements: item("NESTED-1") }],
      };
      const src = parseDicom(
        buildDicom({
          transferSyntax: ts,
          elements: [
            {
              tag: CONTENT_SEQ,
              items: [
                { elements: item("ITEM-0") },
                { elements: item("ITEM-1", [nested]) },
                { elements: item("ITEM-2") },
              ],
            },
          ],
        }),
      );
      const back = parseDicom(serializeDicom(src));
      const code = (d: Dataset | undefined): string | undefined =>
        d?.get("00080100")?.rawBytes.toString("latin1").trimEnd();

      const items = back.get(CONTENT_SEQ)?.items ?? [];
      expect(items.map(code)).toEqual(["ITEM-0", "ITEM-1", "ITEM-2"]);
      const inner = items[1]?.get(CONTENT_SEQ)?.items ?? [];
      expect(inner.map(code)).toEqual(["NESTED-0", "NESTED-1"]);
      // The elements inside them did move.
      expect([...items, ...inner].map((i) => isAscending(tagsOf(i)))).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);
    },
  );
});

// ---------------------------------------------------------------------------
// AC-4
// ---------------------------------------------------------------------------

/** Same tags in every Data Set, each element's VR and value bytes identical. */
function expectSameContent(a: Dataset, b: Dataset, path: string): void {
  const tagsA = [...tagsOf(a)].sort();
  expect([...tagsOf(b)].sort(), `${path}: tag set`).toEqual(tagsA);
  for (const tag of tagsA) {
    const ea = must(a.get(tag), `${path}/${tag} (source)`);
    const eb = must(b.get(tag), `${path}/${tag} (read back)`);
    expect(eb.vr, `${path}/${tag}: VR`).toBe(ea.vr);
    if (ea.vr === "SQ") {
      const itemsA = ea.items ?? [];
      const itemsB = eb.items ?? [];
      expect(itemsB.length, `${path}/${tag}: item count`).toBe(itemsA.length);
      itemsA.forEach((item, i) => {
        expectSameContent(
          item,
          must(itemsB[i], `${path}/${tag}[${String(i)}]`),
          `${path}/${tag}[${String(i)}]`,
        );
      });
    } else {
      expect(eb.rawBytes.toString("hex"), `${path}/${tag}: value bytes`).toBe(
        ea.rawBytes.toString("hex"),
      );
    }
  }
}

describe("AC-4: an out-of-order source is emitted ascending with nothing dropped, added, merged or changed", () => {
  it.each(ALL_TS)("AC-4: root and nested Items, under %s", (ts) => {
    const src = parseDicom(
      buildDicom({
        transferSyntax: ts,
        elements: [
          text("00200013", "IS", "7"),
          {
            tag: CONTENT_SEQ,
            items: [
              {
                elements: [
                  {
                    tag: CONTENT_SEQ,
                    items: [
                      {
                        elements: [
                          text("0040A040", "CS", "TEXT"),
                          { tag: "00280010", vr: "US", value: Buffer.from([0x00, 0x02]) },
                          text("00080100", "SH", "CODE-N"),
                        ],
                      },
                    ],
                  },
                  text("0040A040", "CS", "CONTAINER"),
                  text("00080100", "SH", "CODE-A"),
                ],
              },
              {
                elements: [text("00100020", "LO", "SYNTH-ID-4"), text("00080100", "SH", "CODE-B")],
              },
            ],
          },
          text("00100020", "LO", "SYNTH-ID-4"),
          text("00080060", "CS", "OT"),
        ],
      }),
    );
    expect(dataSetsOf(src).filter((d) => isAscending(d.tags))).toEqual([]);

    const out = serializeDicom(src);
    const back = parseDicom(out);
    expect(dataSetsOf(back).filter((d) => !isAscending(d.tags))).toEqual([]);
    expectSameContent(src, back, "root");
    expect(() => parseDicom(out, { strict: true })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC-5
// ---------------------------------------------------------------------------

describe("AC-5: an already-ascending source is re-emitted byte-identical after File Meta", () => {
  it("AC-5: Explicit VR LE with an undefined-length Sequence", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        text("00080016", "UI", "1.2.840.10008.5.1.4.1.1.7"),
        text("00080060", "CS", "OT"),
        text("00100020", "LO", "SYNTH-ID-5"),
        {
          tag: CONTENT_SEQ,
          undefinedLength: true,
          items: [
            { elements: [text("00080100", "SH", "CODE-A"), text("0040A040", "CS", "TEXT")] },
            {
              undefinedLength: true,
              elements: [
                text("00080100", "SH", "CODE-B"),
                text("0040A040", "CS", "CONTAINER"),
                {
                  tag: CONTENT_SEQ,
                  undefinedLength: true,
                  items: [{ undefinedLength: true, elements: [text("00080100", "SH", "CODE-C")] }],
                },
              ],
            },
          ],
        },
      ],
    });
    const out = serializeDicom(parseDicom(buf));
    expect(bodyOf(out, TS_EXPLICIT_LE).equals(bodyOf(buf, TS_EXPLICIT_LE))).toBe(true);
  });

  it("AC-5: Implicit VR LE with a defined-length Sequence", () => {
    const buf = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        text("00080016", "UI", "1.2.840.10008.5.1.4.1.1.7"),
        text("00080060", "CS", "OT"),
        text("00100020", "LO", "SYNTH-ID-5"),
        {
          tag: CONTENT_SEQ,
          items: [
            { elements: [text("00080100", "SH", "CODE-A"), text("0040A040", "CS", "TEXT")] },
            {
              elements: [
                text("00080100", "SH", "CODE-B"),
                text("0040A040", "CS", "CONTAINER"),
                { tag: CONTENT_SEQ, items: [{ elements: [text("00080100", "SH", "CODE-C")] }] },
              ],
            },
          ],
        },
      ],
    });
    const out = serializeDicom(parseDicom(buf));
    expect(bodyOf(out, TS_IMPLICIT_LE).equals(bodyOf(buf, TS_IMPLICIT_LE))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-6
// ---------------------------------------------------------------------------

describe("AC-6: a tag an Item carries twice is kept twice", () => {
  it.each(ALL_TS)(
    "AC-6: both copies, in source relative order, same survivor on read back, under %s",
    (ts) => {
      const src = parseDicom(
        buildDicom({
          transferSyntax: ts,
          elements: [
            {
              tag: CONTENT_SEQ,
              items: [
                {
                  elements: [
                    text("00100020", "LO", "DUP-FIRST"),
                    text("00080100", "SH", "CODE"),
                    text("00100020", "LO", "DUP-LAST"),
                  ],
                },
              ],
            },
          ],
        }),
      );
      const survivor = (ds: Dataset): string | undefined =>
        ds.get(CONTENT_SEQ)?.items?.[0]?.get("00100020")?.rawBytes.toString("latin1");
      const out = serializeDicom(src);
      const body = bodyOf(out, ts);
      const first = body.indexOf(Buffer.from("DUP-FIRST", "latin1"));
      const last = body.indexOf(Buffer.from("DUP-LAST", "latin1"));
      const code = body.indexOf(Buffer.from("CODE", "latin1"));
      expect(first).toBeGreaterThan(-1);
      expect(last).toBeGreaterThan(first);
      // The element between them moved ahead of both, so the Item was re-ordered.
      expect(code).toBeGreaterThan(-1);
      expect(code).toBeLessThan(first);
      expect(survivor(parseDicom(out))).toBe(must(survivor(src), "source survivor"));
    },
  );
});

// ---------------------------------------------------------------------------
// AC-7
// ---------------------------------------------------------------------------

describe("AC-7: a Sequence whose Item stream cannot be walked to its end is emitted unchanged", () => {
  /**
   * Serialize a Data Set holding the one `SQ` over `span` and return the emitted
   * body. The first Item of every stream below is well formed and out of order,
   * so an emit that re-ordered any part of the Sequence would differ from it.
   */
  function emitOnly(ts: string, span: Buffer): Buffer {
    const ds = handDataset(ts, [sqElement(ts, CONTENT_SEQ, span, false)]);
    let out: Buffer | undefined;
    expect(() => {
      out = serializeDicom(ds);
    }).not.toThrow();
    return bodyOf(must(out, "output"), ts);
  }

  it.each(ALL_TS)(
    "AC-7: an element or Item whose declared length runs past its container, under %s",
    (ts) => {
      const w = wireOf(ts);
      const good = wireItem(w, outOfOrderBody(w, "GOOD"));
      // An element that declares 40 bytes where its Item has 4 left.
      const elementPast = wireItem(
        w,
        Buffer.concat([
          wireEl(w, "00080100", "SH", pad("CODE")),
          wireEl(w, "0040A040", "CS", pad("TEXT"), 40),
        ]),
      );
      const span1 = wireSq(w, CONTENT_SEQ, Buffer.concat([good, elementPast]));
      expect(emitOnly(ts, span1).equals(span1)).toBe(true);

      // An Item that declares 16 bytes more than its Sequence has left.
      const body = outOfOrderBody(w, "LONG");
      const itemPast = Buffer.concat([marker(w, 0xe000, body.length + 16), body]);
      const span2 = wireSq(w, CONTENT_SEQ, Buffer.concat([good, itemPast]));
      expect(emitOnly(ts, span2).equals(span2)).toBe(true);

      // The same over-run one level down: the nested Sequence's bytes are unchanged,
      // and so is the Sequence enclosing it.
      const nested = wireSq(w, CONTENT_SEQ, Buffer.concat([good, elementPast]));
      const outer = wireItem(
        w,
        Buffer.concat([
          wireEl(w, "0040A040", "CS", pad("TEXT")),
          nested,
          wireEl(w, "00080100", "SH", pad("OUTER")),
        ]),
      );
      const span3 = wireSq(w, CONTENT_SEQ, Buffer.concat([good, outer]));
      const emitted3 = emitOnly(ts, span3);
      expect(emitted3.includes(nested)).toBe(true);
      expect(emitted3.equals(span3)).toBe(true);
    },
  );

  it.each(ALL_TS)(
    "AC-7: an undefined-length Item with no Item Delimitation Item, under %s",
    (ts) => {
      const w = wireOf(ts);
      const good = wireItem(w, outOfOrderBody(w, "GOOD"));
      const unterminated = Buffer.concat([
        marker(w, 0xe000, UNDEFINED_LENGTH),
        outOfOrderBody(w, "OPEN"),
      ]);
      const span = wireSq(w, CONTENT_SEQ, Buffer.concat([good, unterminated]));
      expect(emitOnly(ts, span).equals(span)).toBe(true);
    },
  );

  it.each(ALL_TS)("AC-7: bytes that are not an Item stream, under %s", (ts) => {
    const w = wireOf(ts);
    const good = wireItem(w, outOfOrderBody(w, "GOOD"));
    const notAnItem = wireEl(w, "00080100", "SH", pad("NOT-AN-ITEM"));
    const span = wireSq(w, CONTENT_SEQ, Buffer.concat([good, notAnItem]));
    expect(emitOnly(ts, span).equals(span)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-8
// ---------------------------------------------------------------------------

/** An Implicit VR LE Item stream (the CP-246 encoding) with one out-of-order Item. */
function cp246Stream(): Buffer {
  const lw: Wire = { le: true, explicit: false };
  return Buffer.concat([wireItem(lw, outOfOrderBody(lw, "INSIDE-UN")), marker(lw, 0xe0dd, 0)]);
}

/** An undefined-length element header: `UN` on the wire, or Implicit VR's none. */
function undefinedLengthHeader(w: Wire, tag: Tag): Buffer {
  const t = tagBytes(tag, w.le);
  if (!w.explicit) return Buffer.concat([t, u32(UNDEFINED_LENGTH, true)]);
  return Buffer.concat([
    t,
    Buffer.from("UN", "ascii"),
    Buffer.alloc(2),
    u32(UNDEFINED_LENGTH, w.le),
  ]);
}

describe("AC-8: a value whose on-wire VR is not SQ is emitted unchanged", () => {
  it.each([...EXPLICIT_TS, TS_DEFLATED_LE])("AC-8: encapsulated Pixel Data, under %s", (ts) => {
    // A fragment whose bytes happen to read as two out-of-order Explicit VR LE elements.
    const fragment = outOfOrderBody({ le: true, explicit: true }, "FRAGMENT");
    const src = parseDicom(
      buildDicom({
        transferSyntax: ts,
        elements: [
          {
            tag: "7FE00010",
            encapsulatedPixelData: true,
            items: [],
            encapsulatedFragments: [Buffer.alloc(0), fragment],
          },
          text("00080060", "CS", "OT"),
        ],
      }),
    );
    const before = must(src.get("7FE00010"), "pixel data").rawBytes;
    const out = serializeDicom(src);
    expect(tagsOf(parseDicom(out))).toEqual(["00080060", "7FE00010"]);
    const body = bodyOf(out, ts);
    expect(body.subarray(body.length - before.length).equals(before)).toBe(true);
  });

  it.each([TS_IMPLICIT_LE, ...EXPLICIT_TS])("AC-8: a CP-246 promoted UN, under %s", (ts) => {
    const w = wireOf(ts);
    const src = parseDicom(
      buildDicom({
        transferSyntax: ts,
        elements: [text("00100020", "LO", "SYNTH-ID-8")],
        trailingBytes: Buffer.concat([undefinedLengthHeader(w, PRIVATE_TAG), cp246Stream()]),
      }),
    );
    const promoted = must(src.get(PRIVATE_TAG), "promoted element");
    expect(promoted.cp246Promoted).toBe(true);
    const back = parseDicom(serializeDicom(src));
    const reread = must(back.get(PRIVATE_TAG), "promoted element read back");
    expect(reread.rawBytes.equals(promoted.rawBytes)).toBe(true);
    // Its Item is still in source order: the writer did not open it.
    expect(tagsOf(reread.items?.[0])).toEqual(["0040A040", "00080100"]);
    expect(tagsOf(back)).toEqual([PRIVATE_TAG, "00100020"]);
  });

  it.each([TS_IMPLICIT_LE, ...EXPLICIT_TS])(
    "AC-8: an undefined-length UN inside an Item the writer re-orders, under %s",
    (ts) => {
      const w = wireOf(ts);
      const un = Buffer.concat([undefinedLengthHeader(w, PRIVATE_TAG), cp246Stream()]);
      const item = wireItem(
        w,
        Buffer.concat([
          wireEl(w, "0040A040", "CS", pad("TEXT")),
          un,
          wireEl(w, "00080100", "SH", pad("CODE")),
        ]),
      );
      const src = parseDicom(
        buildDicom({
          transferSyntax: ts,
          elements: [],
          trailingBytes: wireSq(w, CONTENT_SEQ, item),
        }),
      );
      const before = must(src.get(CONTENT_SEQ)?.items?.[0]?.get(PRIVATE_TAG), "nested UN");
      const out = serializeDicom(src);
      expect(bodyOf(out, ts).includes(un)).toBe(true);
      const back = parseDicom(out);
      const outerItem = back.get(CONTENT_SEQ)?.items?.[0];
      expect(tagsOf(outerItem)).toEqual(["00080100", PRIVATE_TAG, "0040A040"]);
      const after = must(outerItem?.get(PRIVATE_TAG), "nested UN read back");
      expect(after.rawBytes.equals(before.rawBytes)).toBe(true);
      expect(tagsOf(after.items?.[0])).toEqual(["0040A040", "00080100"]);
    },
  );

  it.each(EXPLICIT_TS)(
    "AC-8: an undefined-length UN that is not an Item stream, under %s",
    (ts) => {
      const w = wireOf(ts);
      const opaque = Buffer.concat([
        undefinedLengthHeader(w, PRIVATE_TAG),
        outOfOrderBody({ le: true, explicit: true }, "OPAQUE"),
      ]);
      const src = parseDicom(
        buildDicom({
          transferSyntax: ts,
          elements: [text("00100020", "LO", "SYNTH-ID-8")],
          trailingBytes: opaque,
        }),
      );
      expect(src.get(PRIVATE_TAG)?.vr).toBe("UN");
      const out = serializeDicom(src);
      expect(bodyOf(out, ts).subarray(0, opaque.length).equals(opaque)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// AC-9
// ---------------------------------------------------------------------------

describe("AC-9: nothing the parsed items carry beyond rawBytes is emitted", () => {
  it.each(ALL_TS)("AC-9: a name only the model holds never reaches the output, under %s", (ts) => {
    const w = wireOf(ts);
    const le = w.le;
    const canary = pad(CANARY);
    // The model's Item says more than the bytes do: it also holds Patient's Name.
    const leakyItem = new Item({
      index: 0,
      warnings: [],
      elements: new Map([
        ["00080100", scalar("00080100", "SH", pad("CODE"), le)],
        ["00100010", scalar("00100010", "PN", canary, le)],
        ["0040A040", scalar("0040A040", "CS", pad("TEXT"), le)],
      ]),
    });
    // The bytes are out of order, so the re-ordering walk runs over this Item.
    const cleanItem = wireItem(w, outOfOrderBody(w, "CODE"));
    const leaky = sqElement(ts, CONTENT_SEQ, wireSq(w, CONTENT_SEQ, cleanItem), false, [leakyItem]);
    const out = serializeDicom(handDataset(ts, [leaky]));
    const body = bodyOf(out, ts);
    expect(body.includes(Buffer.from(CANARY, "latin1"))).toBe(false);
    expect(tagsOf(parseDicom(out).get(CONTENT_SEQ)?.items?.[0])).toEqual(["00080100", "0040A040"]);

    // Control: the same value carried IN rawBytes is found, so the search can fail.
    const carriedItem = wireItem(
      w,
      Buffer.concat([outOfOrderBody(w, "CODE"), wireEl(w, "00100010", "PN", canary)]),
    );
    const carried = sqElement(ts, CONTENT_SEQ, wireSq(w, CONTENT_SEQ, carriedItem), false, [
      leakyItem,
    ]);
    const controlBody = bodyOf(serializeDicom(handDataset(ts, [carried])), ts);
    expect(controlBody.includes(Buffer.from(CANARY, "latin1"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-10
// ---------------------------------------------------------------------------

/**
 * A `(0040,A730)` Sequence nested `levels` deep in Explicit VR LE, each level
 * one Item holding two out-of-order leaves and then the next level. Built front
 * to back rather than by recursion: every level's prefix is the same length, so
 * level `k` (1-based) starts at `(k - 1) * unit`.
 */
function deepSequence(levels: number, undefinedLength: boolean): { span: Buffer; unit: number } {
  const w: Wire = { le: true, explicit: true };
  const leaves = outOfOrderBody(w, "C1");
  const unit = 12 + 8 + leaves.length;
  const parts: Buffer[] = [];
  if (undefinedLength) {
    const prefix = Buffer.concat([
      sqHeader(w, CONTENT_SEQ, UNDEFINED_LENGTH),
      marker(w, 0xe000, UNDEFINED_LENGTH),
      leaves,
    ]);
    const suffix = Buffer.concat([marker(w, 0xe00d, 0), marker(w, 0xe0dd, 0)]);
    for (let k = 0; k < levels; k++) parts.push(prefix);
    for (let k = 0; k < levels; k++) parts.push(suffix);
  } else {
    for (let k = 1; k <= levels; k++) {
      const span = unit * (levels - k + 1);
      parts.push(sqHeader(w, CONTENT_SEQ, span - 12), marker(w, 0xe000, span - 20), leaves);
    }
  }
  return { span: Buffer.concat(parts), unit };
}

describe("AC-10: Sequence bytes nested past NESTING_DEPTH_LIMIT", () => {
  const LEVELS = 10_000;

  it.each([
    ["defined", false],
    ["undefined", true],
  ] as const)("AC-10: a %s-length Sequence 10,000 levels deep", (_form, undefinedLength) => {
    const { span, unit } = deepSequence(LEVELS, undefinedLength);
    const el = sqElement(TS_EXPLICIT_LE, CONTENT_SEQ, span, undefinedLength);
    let out: Buffer | undefined;
    expect(() => {
      out = serializeDicom(handDataset(TS_EXPLICIT_LE, [el]));
    }).not.toThrow();
    const body = bodyOf(must(out, "output"), TS_EXPLICIT_LE);
    expect(body.length).toBe(span.length);

    const firstLeafTag = (level: number): number => {
      const at = (level - 1) * unit + 20;
      return body.readUInt16LE(at) * 0x10000 + body.readUInt16LE(at + 2);
    };
    // Every level within the bound was ordered ...
    for (let level = 1; level <= NESTING_DEPTH_LIMIT; level++) {
      expect(firstLeafTag(level), `level ${String(level)}`).toBe(0x00080100);
    }
    // ... and the span below it is exactly the source's.
    const start = NESTING_DEPTH_LIMIT * unit;
    const end = undefinedLength ? span.length - NESTING_DEPTH_LIMIT * 16 : span.length;
    expect(firstLeafTag(NESTING_DEPTH_LIMIT + 1)).toBe(0x0040a040);
    expect(body.subarray(start, end).equals(span.subarray(start, end))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-11
// ---------------------------------------------------------------------------

/** Every element of every Data Set, in `elements()` order, with its bytes. */
function snapshotOf(ds: Dataset, path = "root"): string[] {
  const out: string[] = [];
  for (const el of ds.elements()) {
    out.push(`${path}/${el.tag}=${el.rawBytes.toString("hex")}`);
    (el.items ?? []).forEach((item, i) => {
      out.push(...snapshotOf(item, `${path}/${el.tag}[${String(i)}]`));
    });
  }
  return out;
}

describe("AC-11: the input Dataset is left unchanged", () => {
  it.each(ALL_TS)("AC-11: same tags, same order, same bytes after serializing, under %s", (ts) => {
    const src = parseDicom(
      buildDicom({
        transferSyntax: ts,
        elements: [
          text("00200013", "IS", "7"),
          {
            tag: CONTENT_SEQ,
            items: [
              {
                elements: [
                  {
                    tag: CONTENT_SEQ,
                    items: [
                      {
                        elements: [
                          text("0040A040", "CS", "TEXT"),
                          text("00080100", "SH", "CODE-N"),
                        ],
                      },
                    ],
                  },
                  text("0040A040", "CS", "CONTAINER"),
                  text("00080100", "SH", "CODE-A"),
                ],
              },
            ],
          },
          text("00080060", "CS", "OT"),
        ],
      }),
    );
    const before = snapshotOf(src);
    const out = serializeDicom(src);
    // The output did re-order, so the call exercised the path that could mutate.
    expect(dataSetsOf(parseDicom(out)).filter((d) => !isAscending(d.tags))).toEqual([]);
    expect(snapshotOf(src)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// AC-12
// ---------------------------------------------------------------------------

describe("AC-12: deidentify() output is emitted ascending at every depth", () => {
  it.each(ALL_TS)("AC-12: root, kept Sequences and inserted elements, under %s", (ts) => {
    // (0008,1115) and (0008,1199) are not in Table E.1-1, so both are kept and walked.
    const src = parseDicom(
      buildDicom({
        transferSyntax: ts,
        elements: [
          text("00200013", "IS", "7"),
          text("00100010", "PN", "DOE^JANE"),
          {
            tag: "00081115",
            items: [
              {
                elements: [
                  text("0040A040", "CS", "TEXT"),
                  {
                    tag: "00081199",
                    items: [
                      {
                        elements: [
                          text("0040A040", "CS", "TEXT"),
                          text("00080100", "SH", "CODE-N"),
                        ],
                      },
                    ],
                  },
                  text("00080100", "SH", "CODE-S"),
                ],
              },
            ],
          },
          text("00080060", "CS", "OT"),
        ],
      }),
    );
    const { dataset } = deidentify(src);
    // The model deidentify() hands back is out of order at the root and in the kept Items.
    const kept = dataset.get("00081115")?.items?.[0];
    expect(isAscending(tagsOf(dataset))).toBe(false);
    expect(isAscending(tagsOf(kept))).toBe(false);
    expect(isAscending(tagsOf(kept?.get("00081199")?.items?.[0]))).toBe(false);

    const back = parseDicom(serializeDicom(dataset));
    expect(dataSetsOf(back).filter((d) => !isAscending(d.tags))).toEqual([]);
    expect(tagsOf(back)).toEqual(expect.arrayContaining(["00120062", "00120063", "00280303"]));
    expect(back.get("00081115")?.items?.[0]?.get("00081199")?.items?.length).toBe(1);
  });
});

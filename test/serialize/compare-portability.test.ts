/**
 * `serializeDicom` runs on a `node:buffer` that rejects `compare` with source offsets.
 *
 * Deno 2.9.8's `node:buffer` throws `RangeError: The value of "sourceEnd" is out of range` from
 * `Buffer.prototype.compare` when it is given a source range, on arguments Node accepts, so every
 * write that compared an element's bytes in place failed there. The writer now compares with
 * `equals` over views, which every runtime implements alike. These cases replace `compare` with one
 * that throws on a source range, the way that runtime did, and write files whose elements were read
 * first (so each value sits in a view of its own) and files whose elements were not.
 *
 * CI also runs the whole suite under Deno, in the `deno` job.
 *
 * Everything here is **synthetic**: fixtures are built in memory by `build-dicom`, and the
 * name-bearing values are invented placeholders. No real patient data is used.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { afterEach, describe, expect, it } from "vitest";

import { Dataset, Element, parseDicom, serializeDicom } from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_IMPLICIT_LE = "1.2.840.10008.1.2";

/** Even-pad a text value (space) so the fixture builder gets a legal length. */
function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

function fixture(transferSyntax: string): Buffer {
  return buildDicom({
    transferSyntax,
    elements: [
      { tag: "00080060", vr: "CS", value: pad("OT") },
      { tag: "00100010", vr: "PN", value: pad("SYNTHETIC^PATIENT") },
      {
        tag: "00081115",
        items: [
          {
            elements: [{ tag: "0020000E", vr: "UI", value: pad("1.2.3.4.5.6.7.8.9") }],
          },
        ],
      },
      { tag: "00204000", vr: "LT", value: pad("SYNTHETIC COMMENT TEXT") },
    ],
  });
}

/** The shared prototype every Buffer reads `compare` from, typed as what it holds. */
const proto = Reflect.getPrototypeOf(Buffer.alloc(0)) as { compare: Buffer["compare"] };
const original = proto.compare;

/** Run `write` with a `compare` that throws on a source range, the way Deno 2.9.8's did. */
function withoutRangeCompare<T>(write: () => T): T {
  proto.compare = function compare(
    this: Buffer,
    target: Uint8Array,
    targetStart?: number,
    targetEnd?: number,
    sourceStart?: number,
    sourceEnd?: number,
  ): -1 | 0 | 1 {
    if (sourceStart !== undefined || sourceEnd !== undefined) {
      throw new RangeError('The value of "sourceEnd" is out of range.');
    }
    return original.call(this, target, targetStart, targetEnd);
  };
  try {
    return write();
  } finally {
    proto.compare = original;
  }
}

afterEach(() => {
  proto.compare = original;
});

/** Read every value, at the top level and in each Item, so each sits in a view of its own. */
function readEveryValue(ds: ReturnType<typeof parseDicom>): void {
  for (const el of ds.elements()) void el.rawBytes;
  for (const item of ds.get("00081115")?.items ?? []) {
    for (const el of item.elements()) void el.rawBytes;
  }
}

describe("serializeDicom without compare over a source range", () => {
  for (const [label, ts] of [
    ["Explicit VR Little Endian", TS_EXPLICIT_LE],
    ["Implicit VR Little Endian", TS_IMPLICIT_LE],
  ] as const) {
    it(`writes a file in ${label} whose values were read first`, () => {
      const input = fixture(ts);
      const expected = serializeDicom(parseDicom(input));
      const ds = parseDicom(input);
      readEveryValue(ds);
      const out = withoutRangeCompare(() => serializeDicom(ds));
      expect(out.equals(expected)).toBe(true);
      expect(parseDicom(out).get("00100010")?.rawBytes.toString("latin1")).toBe(
        "SYNTHETIC^PATIENT ",
      );
    });

    it(`writes a file in ${label} whose values were never read`, () => {
      const input = fixture(ts);
      const expected = serializeDicom(parseDicom(input));
      const ds = parseDicom(input);
      const out = withoutRangeCompare(() => serializeDicom(ds));
      expect(out.equals(expected)).toBe(true);
    });
  }
});

/**
 * The comparison covers the whole value, its first byte and its last.
 *
 * The writer re-orders the Data Elements inside an Item only when every element's bytes on the
 * wire are the bytes the model read. Here the model is the reading of one file and the Sequence's
 * bytes are the same file with exactly one value byte changed, so a comparison whose range starts
 * one byte late or ends one byte early would call them equal and re-order the Item. It must instead
 * write the Sequence exactly as given.
 */
describe("serializeDicom compares an element's value from its first byte to its last", () => {
  /** `(0008,1115)` Referenced Series Sequence, and two Code attributes written out of order. */
  const SEQUENCE = "00081115";
  const LATER = "00080104";
  const EARLIER = "00080100";
  const MEANING = "SYNTHETIC MEANING ";

  function outOfOrder(): Buffer {
    return buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: SEQUENCE,
          items: [
            {
              elements: [
                { tag: LATER, vr: "LO", value: pad(MEANING) },
                { tag: EARLIER, vr: "SH", value: pad("C1") },
              ],
            },
          ],
        },
      ],
    });
  }

  /** Write a Data Set whose Sequence is the file's, with `edit` applied to its bytes alone. */
  function writeWith(edit: (raw: Buffer, valueAt: number) => void): {
    given: Buffer;
    out: Buffer;
  } {
    const parsed = parseDicom(outOfOrder());
    const sq = parsed.get(SEQUENCE);
    if (sq?.items === undefined) throw new Error("fixture has no Sequence");
    const raw = Buffer.from(sq.rawBytes);
    const valueAt = raw.indexOf(Buffer.from(MEANING, "latin1"));
    expect(valueAt).toBeGreaterThan(0);
    edit(raw, valueAt);
    const element = new Element({
      tag: SEQUENCE,
      vr: "SQ",
      vm: sq.items.length,
      length: raw.length,
      rawBytes: raw,
      byteOffset: 0,
      littleEndian: true,
      items: sq.items,
    });
    const ds = new Dataset({
      ...(parsed.fileMeta !== undefined ? { fileMeta: parsed.fileMeta } : {}),
      warnings: [],
      elements: new Map([[SEQUENCE, element]]),
    });
    const written = serializeDicom(ds);
    // The Sequence is the last thing written.
    return { given: raw, out: written.subarray(written.length - raw.length) };
  }

  /** The tags of the one Item in the written Sequence, in written order. */
  function itemTags(sequenceBytes: Buffer): string[] {
    const laterAt = sequenceBytes.indexOf(Buffer.from([0x08, 0x00, 0x04, 0x01]));
    const earlierAt = sequenceBytes.indexOf(Buffer.from([0x08, 0x00, 0x00, 0x01]));
    expect(laterAt).toBeGreaterThan(0);
    expect(earlierAt).toBeGreaterThan(0);
    return laterAt < earlierAt ? [LATER, EARLIER] : [EARLIER, LATER];
  }

  it("the control: bytes that agree with the model are re-ordered", () => {
    expect(itemTags(writeWith(() => undefined).out)).toEqual([EARLIER, LATER]);
  });

  it("sees a change to the value's first byte, and writes the Sequence as given", () => {
    const { given, out } = writeWith((raw, at) => {
      raw[at] = 0x58; // "S" becomes "X"
    });
    expect(out.equals(given)).toBe(true);
    expect(itemTags(out)).toEqual([LATER, EARLIER]);
  });

  it("sees a change to the value's last byte, and writes the Sequence as given", () => {
    const { given, out } = writeWith((raw, at) => {
      raw[at + MEANING.length - 1] = 0x58; // the trailing space becomes "X"
    });
    expect(out.equals(given)).toBe(true);
    expect(itemTags(out)).toEqual([LATER, EARLIER]);
  });
});

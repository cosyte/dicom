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

import { parseDicom, serializeDicom } from "../../src/index.js";
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

/**
 * The writer encodes an element as parts (a header Buffer, a view of the value, and a shared pad
 * byte) and copies them once into its output. These hold that the parts are the bytes the
 * one-Buffer encoding writes, that the value part is a view rather than a copy, and that no part
 * is shared with another element's header.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { Element } from "../../src/dataset/element.js";
import type { VR } from "../../src/dictionary/types.js";
import {
  type BodyEncoding,
  encodeDatasetElement,
  encodeDatasetElementParts,
} from "../../src/serialize/element.js";

function element(tag: string, vr: string, value: Buffer, length = value.length): Element {
  return new Element({
    tag,
    vr: vr as VR,
    vm: 1,
    length,
    rawBytes: value,
    byteOffset: 0,
    littleEndian: true,
  });
}

const ENCODINGS: readonly BodyEncoding[] = ["implicit", "explicitLE", "explicitBE"];

describe("encodeDatasetElementParts", () => {
  const cases: readonly (readonly [string, Element])[] = [
    ["even short form", element("00100010", "PN", Buffer.from("DOE^JANE", "latin1"))],
    ["odd text, space pad", element("00100020", "LO", Buffer.from("SYN01", "latin1"))],
    ["odd UID, NUL pad", element("00080018", "UI", Buffer.from("1.2.3", "latin1"))],
    ["long form", element("7FE00010", "OW", Buffer.alloc(16, 0x11))],
    ["an unrecognized two-byte VR", element("00091010", "ZZ", Buffer.from("AB", "latin1"))],
    ["a three-byte VR on a hand-built element", element("00091010", "ZZZ", Buffer.alloc(3, 1))],
    ["an empty VR on a hand-built element", element("00091010", "", Buffer.alloc(2, 1))],
    ["a 70,000-byte LO, written as UN", element("00101000", "LO", Buffer.alloc(70_001, 0x41))],
    [
      "an undefined-length span, verbatim",
      element("00091011", "UN", Buffer.alloc(24, 0x22), 0xffffffff),
    ],
  ];

  for (const [name, el] of cases) {
    for (const encoding of ENCODINGS) {
      it(`${name}, ${encoding}: the parts are the bytes encodeDatasetElement writes`, () => {
        const parts: Buffer[] = [];
        const length = encodeDatasetElementParts(el, encoding, parts);
        const joined = Buffer.concat(parts);
        expect(joined.length).toBe(length);
        expect(joined.equals(encodeDatasetElement(el, encoding))).toBe(true);
        // Twice gives the same bytes: nothing kept between calls changes them.
        const again: Buffer[] = [];
        encodeDatasetElementParts(el, encoding, again);
        expect(Buffer.concat(again).equals(joined)).toBe(true);
      });
    }
  }

  it("writes a hand-built three-byte VR long form, as the one-Buffer writer always did", () => {
    const parts: Buffer[] = [];
    encodeDatasetElementParts(element("00091010", "ZZZ", Buffer.alloc(3, 1)), "explicitLE", parts);
    expect(Buffer.concat(parts).toString("hex")).toBe(
      "09001010" + "5a5a5a" + "0000" + "04000000" + "010101" + "20",
    );
  });

  it("pushes the value as a view of the element's own bytes, not a copy", () => {
    const value = Buffer.alloc(1_024, 0x33);
    const el = element("7FE00010", "OW", value);
    const parts: Buffer[] = [];
    encodeDatasetElementParts(el, "explicitLE", parts);
    expect(parts[1]?.buffer).toBe(value.buffer);
    expect(parts[1]?.byteOffset).toBe(value.byteOffset);
  });

  it("gives each element a header of its own", () => {
    const a: Buffer[] = [];
    const b: Buffer[] = [];
    encodeDatasetElementParts(element("00100010", "PN", Buffer.from("AB")), "explicitLE", a);
    encodeDatasetElementParts(element("00100010", "PN", Buffer.from("AB")), "explicitLE", b);
    expect(a[0]).not.toBe(b[0]);
  });
});

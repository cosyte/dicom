/**
 * The writer measures every element first and then writes each one straight into its output, so a
 * value is copied once and no header is a Buffer of its own. These hold that the bytes written are
 * the bytes the writer wrote before it worked this way (each digest below was taken from
 * `encodeDatasetElement` at the commit before the change), that a measure returns exactly the
 * length a write fills, that a write touches no byte outside its element, and that a measure
 * refuses an element exactly where the write would.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { Element } from "../../src/dataset/element.js";
import type { VR } from "../../src/dictionary/types.js";
import {
  type BodyEncoding,
  encodeDatasetElement,
  tagParts,
  writeDatasetElement,
} from "../../src/serialize/element.js";
import { DicomSerializeError, SERIALIZE_ERROR_CODES } from "../../src/serialize/errors.js";

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

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const ENCODINGS: readonly BodyEncoding[] = ["implicit", "explicitLE", "explicitBE"];

/** Each case, and the SHA-256 of its bytes under Implicit LE, Explicit LE and Explicit BE. */
const CASES: readonly (readonly [string, Element, readonly [string, string, string]])[] = [
  [
    "even short form",
    element("00100010", "PN", Buffer.from("DOE^JANE", "latin1")),
    [
      "0529984eb8322ef8be3696f16d54b416003586eabc267a98755d8aa46b7eddbf",
      "33f00c911f62ec8cbe3fbe7334b4b1f6b60e6a6cffd92e4f78f78e913d1540d8",
      "957171e93a599ca8fa83d9e8ec9568891d96aaacc7f9e57902d6447a2c96fa42",
    ],
  ],
  [
    "odd text, space pad",
    element("00100020", "LO", Buffer.from("SYN01", "latin1")),
    [
      "82d4ecf09ba41583ef512e65a54acf03df28dff6a883b149f807829570f4174e",
      "1697a8c6146131d3eeb292752cc34bc1f01d0b2d2fc4b2f9f2db050483c8aa6d",
      "069513d938f8eb4d815fd08224db48aa024ffaf171961f0e31faea3fa42c9023",
    ],
  ],
  [
    "odd UID, NUL pad",
    element("00080018", "UI", Buffer.from("1.2.3", "latin1")),
    [
      "27b5fa5735c30771490ce8cf41863fa9c13fc603596c1725184eb81669cb097d",
      "888752f0ea7d33d204f81f445b23c1b7b489ffb4709fa09b876dc41646f1be09",
      "f47cd3104bf3e4ed01f700f0cdd8ed83dcd8a1d51c236b84f009ddf6dd9736f7",
    ],
  ],
  [
    "long form",
    element("7FE00010", "OW", Buffer.alloc(16, 0x11)),
    [
      "5321e4a7703fed63f38d54369985e183b3b6809afe645275778487e6f990a42c",
      "5d386047e2bf9c4a4f81d34ab14829afa03a120f72bd4253324e9b2ef9ca734d",
      "ceb2025f77cadd08162ae6bc0ee2d4769bc767c64c61fe7bfc992280f005b559",
    ],
  ],
  [
    "an unrecognized two-byte VR",
    element("00091010", "ZZ", Buffer.from("AB", "latin1")),
    [
      "02c4ea8727e22867a9ad2eefa633dc259c24a73163dc8c65990bb6daec975ec0",
      "3d217a1dcc74ab57d16a8912fbdd859083c9e9bc0e06db887125161f758e4c62",
      "c5a623ec5bd8ec4213d88c54826e954d5de1f44e3e6077cd8db8fcf324d75d04",
    ],
  ],
  [
    "a three-byte VR on a hand-built element",
    element("00091010", "ZZZ", Buffer.alloc(3, 1)),
    [
      "ce575b882db54a171a7105eb80a3f19b5613dcc3cb92431d7d231f93bf10877b",
      "58b45704b41a1a02cd4553521b106c887c5e0d9e9f9a161bed6f9bd542fef64b",
      "b5d6f65d3359bad40818db461a102dc8d513b5b8809a4eb20c634d620913580e",
    ],
  ],
  [
    "an empty VR on a hand-built element",
    element("00091010", "", Buffer.alloc(2, 1)),
    [
      "028de5b15d1774999753a8df7cc9a0d5c8adba2cec5a1eeec082c831c5a601ae",
      "5202fd57135548dbd21ecce084f9697f80a5f6677e86ff6b4dd3f04b10f200c2",
      "ba55a3959908f92f37db4d18f8d1d01ab1a8105f36086d86c2e5f7d36b7b88e3",
    ],
  ],
  [
    "a 70,000-byte LO, written as UN",
    element("00101000", "LO", Buffer.alloc(70_001, 0x41)),
    [
      "fecfd54886dbe2f0c1fc6430c451dac7c862f1b742c71e4a0eb55b2907ef1cf3",
      "3fdf3e9f859a12a3013bdf295fffd7d93974fa6ad1025a062e0425b19416f1c8",
      "8350da5867eebd323819d2bebafdba17d00fbf1b00d47d5f0dff4db530ccec99",
    ],
  ],
  [
    "a 70,001-byte US, swapped as UN",
    element("00280010", "US", Buffer.from(Array.from({ length: 70_001 }, (_v, i) => i % 251))),
    [
      "6d1dd5018f14d5d1fad9df111447657374504eb7d840f66b03507979f92014f0",
      "c814c332c9c8f0fb27c459670309c5085f7620e5da837018745095587093943e",
      "e45624a1a3db38e90eca656e343707330a48f2aab841039107ad9cd8c4bd607e",
    ],
  ],
  [
    "an undefined-length span, verbatim",
    element("00091011", "UN", Buffer.alloc(24, 0x22), 0xffffffff),
    [
      "0c85b1fdb4d0c4851053bfab2480ba4206c9245b356dbc760578cbd1d7b2f395",
      "0c85b1fdb4d0c4851053bfab2480ba4206c9245b356dbc760578cbd1d7b2f395",
      "0c85b1fdb4d0c4851053bfab2480ba4206c9245b356dbc760578cbd1d7b2f395",
    ],
  ],
];

describe("writeDatasetElement", () => {
  for (const [name, el, digests] of CASES) {
    ENCODINGS.forEach((encoding, e) => {
      it(`${name}, ${encoding}: writes the bytes the writer wrote before, measured exactly`, () => {
        const length = writeDatasetElement(el, encoding, el.rawBytes, undefined, 0);
        // Written at an offset into a larger buffer: nothing outside the element moves.
        const out = Buffer.alloc(length + 7, 0xee);
        const written = writeDatasetElement(el, encoding, el.rawBytes, out, 3);
        expect(written).toBe(length);
        expect(out.subarray(0, 3).equals(Buffer.alloc(3, 0xee))).toBe(true);
        expect(out.subarray(3 + length).equals(Buffer.alloc(4, 0xee))).toBe(true);
        expect(sha256(out.subarray(3, 3 + length))).toBe(digests[e]);
        expect(sha256(encodeDatasetElement(el, encoding))).toBe(digests[e]);
      });
    });
  }

  it("writes a hand-built three-byte VR long form, as the one-Buffer writer always did", () => {
    const el = element("00091010", "ZZZ", Buffer.alloc(3, 1));
    expect(encodeDatasetElement(el, "explicitLE").toString("hex")).toBe(
      "09001010" + "5a5a5a" + "0000" + "04000000" + "010101" + "20",
    );
  });

  it("measures a hand-built VR too long for the scratch header, and writes what it measured", () => {
    const el = element("00091010", "ZZZZZZZZ", Buffer.alloc(4, 1));
    const length = writeDatasetElement(el, "explicitLE", el.rawBytes, undefined, 0);
    expect(length).toBe(4 + 8 + 6 + 4);
    expect(encodeDatasetElement(el, "explicitLE").toString("hex")).toBe(
      "09001010" + "5a".repeat(8) + "0000" + "04000000" + "01010101",
    );
  });

  it("writes in place of the element's own bytes the bytes it is handed", () => {
    const el = element("00100010", "PN", Buffer.from("DOE^JANE", "latin1"));
    const other = Buffer.from("ROE^JOHN", "latin1");
    expect(encodeDatasetElement(el, "explicitLE", other).toString("latin1")).toBe(
      "\u0010\u0000\u0010\u0000PN\u0008\u0000ROE^JOHN",
    );
  });

  it("refuses a Private Creator past 65,534 bytes when it measures, as the write does", () => {
    const el = element("00090010", "LO", Buffer.alloc(65_536, 0x41));
    const measure = (): number => writeDatasetElement(el, "explicitLE", el.rawBytes, undefined, 0);
    expect(measure).toThrow(DicomSerializeError);
    try {
      measure();
    } catch (error) {
      expect((error as DicomSerializeError).code).toBe(SERIALIZE_ERROR_CODES.VALUE_TOO_LONG_FOR_VR);
    }
  });

  it("throws a header write's RangeError when it measures, before any output exists", () => {
    // A hand-built tag whose Group Number parses negative: the 16-bit write refuses it.
    const el = element("-0010010", "PN", Buffer.from("AB"));
    expect(() => writeDatasetElement(el, "explicitLE", el.rawBytes, undefined, 0)).toThrow(
      RangeError,
    );
    expect(() => writeDatasetElement(el, "implicit", el.rawBytes, undefined, 0)).toThrow(
      RangeError,
    );
  });
});

describe("tagParts", () => {
  it("splits a tag as splitTag does, and gives the same answer every time", () => {
    expect(tagParts("0040A730")).toEqual({ group: 0x0040, element: 0xa730 });
    expect(tagParts("0040A730")).toBe(tagParts("0040A730"));
  });

  it("still answers once it has stopped keeping answers, past 16,384 tags", () => {
    for (let i = 0; i < 16_400; i++) {
      const tag = `7777${i.toString(16).padStart(4, "0").toUpperCase()}`;
      expect(tagParts(tag)).toEqual({ group: 0x7777, element: i });
    }
  });
});

/**
 * Unit coverage for the embedded-Data-Element detector itself
 * (`src/deident/embedded.ts`).
 *
 * The integration behaviour lives in `embedded-attribute.test.ts`; this file
 * exercises the decoder's refusals one at a time. Every refusal here is a case
 * where the bytes *nearly* look like a swallowed element, and each one exists so
 * that a value is never emptied on a coincidence: the cost of a false positive
 * is deleting data a caller needed, which is a different failure from the leak
 * this module closes but still a real one.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { findEmbeddedAttributes, MAX_SCAN_BYTES } from "../../src/deident/embedded.js";
import type { Tag } from "../../src/dictionary/types.js";

const PATIENT_ID_TAG: Tag = "00100020";
const always = (): boolean => true;

/** An Explicit VR LE short-form element: 4-byte tag, 2-byte VR, 2-byte length. */
function shortForm(group: number, element: number, vr: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, "latin1");
  head.writeUInt16LE(body.length, 6);
  return Buffer.concat([head, body]);
}

/** An Explicit VR LE long-form element: 4-byte tag, 2-byte VR, 2 reserved, 4-byte length. */
function longForm(group: number, element: number, vr: string, body: Buffer, reserved = 0): Buffer {
  const head = Buffer.alloc(12);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, "latin1");
  head.writeUInt16LE(reserved, 6);
  head.writeUInt32LE(body.length, 8);
  return Buffer.concat([head, body]);
}

/** An implicit-VR element: 4-byte tag, 4-byte length, no VR field. */
function implicit(group: number, element: number, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

const ID = Buffer.from("MRN-11111 ", "latin1");

describe("findEmbeddedAttributes: what it refuses", () => {
  it("finds a short-form Explicit VR LE element at the end of a value", () => {
    const value = Buffer.concat([Buffer.from("ORIGINAL"), shortForm(0x0010, 0x0020, "LO", ID)]);
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
  });

  it("finds a long-form element, and refuses the same bytes with non-zero reserved bytes", () => {
    const body = Buffer.from("2.25.1234567890 ", "latin1");
    const ok = Buffer.concat([Buffer.from("ORIGINAL"), longForm(0x0010, 0x0020, "UC", body)]);
    expect(findEmbeddedAttributes(ok, "CS", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
    // PS3.5 Table 7.1-2 fixes those two bytes at 0000H, so a non-zero pair is
    // not something a conformant encoder produced.
    const bad = Buffer.concat([
      Buffer.from("ORIGINAL"),
      longForm(0x0010, 0x0020, "UC", body, 0x01),
    ]);
    expect(findEmbeddedAttributes(bad, "CS", "explicitLE", always)).toBeUndefined();
  });

  it("refuses an odd declared length in either header form", () => {
    // PS3.5 section 7.1: every Value Field is an even number of bytes.
    const odd = shortForm(0x0010, 0x0020, "LO", ID);
    odd.writeUInt16LE(ID.length - 1, 6);
    expect(
      findEmbeddedAttributes(Buffer.concat([Buffer.from("AB"), odd]), "CS", "explicitLE", always),
    ).toBeUndefined();
    const oddLong = longForm(0x0010, 0x0020, "UC", ID);
    oddLong.writeUInt32LE(ID.length - 1, 8);
    expect(
      findEmbeddedAttributes(
        Buffer.concat([Buffer.from("AB"), oddLong]),
        "CS",
        "explicitLE",
        always,
      ),
    ).toBeUndefined();
  });

  it("refuses an undefined length in either header form", () => {
    // 0xFFFFFFFF says "look for a delimiter", which a value cannot promise.
    const undef = longForm(0x0010, 0x0020, "UC", ID);
    undef.writeUInt32LE(0xffffffff, 8);
    expect(findEmbeddedAttributes(undef, "CS", "explicitLE", always)).toBeUndefined();
    const undefImplicit = implicit(0x0010, 0x0020, ID);
    undefImplicit.writeUInt32LE(0xffffffff, 4);
    expect(findEmbeddedAttributes(undefImplicit, "CS", "implicit", always)).toBeUndefined();
  });

  it("refuses a declared length that runs past the end of the value", () => {
    const over = shortForm(0x0010, 0x0020, "LO", ID);
    over.writeUInt16LE(ID.length + 2, 6);
    expect(findEmbeddedAttributes(over, "CS", "explicitLE", always)).toBeUndefined();
    const overLong = longForm(0x0010, 0x0020, "UC", ID);
    overLong.writeUInt32LE(ID.length + 2, 8);
    expect(findEmbeddedAttributes(overLong, "CS", "explicitLE", always)).toBeUndefined();
    const overImplicit = implicit(0x0010, 0x0020, ID);
    overImplicit.writeUInt32LE(ID.length + 2, 4);
    expect(findEmbeddedAttributes(overImplicit, "CS", "implicit", always)).toBeUndefined();
  });

  it("refuses a long-form header the value is too short to hold", () => {
    const truncated = longForm(0x0010, 0x0020, "UC", Buffer.alloc(0)).subarray(0, 10);
    expect(findEmbeddedAttributes(truncated, "CS", "explicitLE", always)).toBeUndefined();
  });

  it("refuses two bytes that are not one of the 34 VRs", () => {
    const value = Buffer.concat([Buffer.from("ORIGINAL"), shortForm(0x0010, 0x0020, "ZZ", ID)]);
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", always)).toBeUndefined();
  });

  it("refuses (0000,0000), so a run of NUL padding cannot tile", () => {
    // Eight NULs decode as tag (0000,0000) with length 0 under implicit VR, and
    // would otherwise chain to the end of any NUL-padded value.
    expect(findEmbeddedAttributes(Buffer.alloc(64), "CS", "implicit", always)).toBeUndefined();
  });

  it("refuses an odd declared length under implicit VR", () => {
    const odd = implicit(0x0010, 0x0020, ID);
    odd.writeUInt32LE(ID.length - 1, 4);
    expect(findEmbeddedAttributes(odd, "CS", "implicit", always)).toBeUndefined();
  });

  it("walks an item stream, stepping over the (FFFE,xxxx) markers", () => {
    // The shape a swallowed *sequence* leaves behind: item header, elements,
    // item delimiter. The markers carry no tag of their own, so only the real
    // element is reported.
    const itemBody = shortForm(0x0010, 0x0020, "LO", ID);
    const itemHeader = Buffer.alloc(8);
    itemHeader.writeUInt16LE(0xfffe, 0);
    itemHeader.writeUInt16LE(0xe000, 2);
    itemHeader.writeUInt32LE(itemBody.length, 4);
    const delim = Buffer.alloc(8);
    delim.writeUInt16LE(0xfffe, 0);
    delim.writeUInt16LE(0xe0dd, 2);
    const value = Buffer.concat([Buffer.from("ORIGINAL"), itemHeader, itemBody, delim]);
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
  });

  it("decodes big-endian headers when the file is Explicit VR BE", () => {
    const head = Buffer.alloc(8);
    head.writeUInt16BE(0x0010, 0);
    head.writeUInt16BE(0x0020, 2);
    head.write("LO", 4, "latin1");
    head.writeUInt16BE(ID.length, 6);
    const value = Buffer.concat([Buffer.from("ORIGINAL"), head, ID]);
    expect(findEmbeddedAttributes(value, "CS", "explicitBE", always)).toEqual([PATIENT_ID_TAG]);
    // The same bytes read little-endian are tag (1000,2000), which nothing here
    // recognises - the endianness is not guessed.
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", (t) => t === PATIENT_ID_TAG)).toBe(
      undefined,
    );
  });

  it("refuses a value too short to hold any header at all", () => {
    expect(findEmbeddedAttributes(Buffer.from("ABCD"), "CS", "explicitLE", always)).toBeUndefined();
  });

  it("tolerates the five formatting control characters in LT/ST/UT/UC", () => {
    // PS3.5 section 6.1.2.1 lets those four VRs carry ESC/TAB/CR/LF/FF, so a
    // value made only of them is conformant and must not be treated as evidence
    // of a swallowed header.
    const body = Buffer.from("LINE ONE\r\nLINE TWO\t", "latin1");
    const value = Buffer.concat([body, Buffer.from(body.length % 2 === 0 ? "" : " ")]);
    expect(findEmbeddedAttributes(value, "LT", "explicitLE", always)).toBeUndefined();
  });

  it("scans the trailing window of an over-long value", () => {
    // The window bound exists so the memo arrays are sized here rather than by a
    // declared length. A swallow ends at the end of the value, so it is inside
    // the window by construction - which this proves rather than assumes.
    const embedded = shortForm(0x0010, 0x0020, "LO", ID);
    const filler = Buffer.alloc(MAX_SCAN_BYTES, 0x41);
    const value = Buffer.concat([filler, embedded]);
    expect(findEmbeddedAttributes(value, "UT", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
  });
});

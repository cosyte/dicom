import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { decodeAttributeTags, decodeBigInts, decodeNumbers } from "./numeric.js";

describe("decodeNumbers (PS3.5 §6.2 — signedness from VR, endianness from flag)", () => {
  it("US decodes little- and big-endian unsigned 16-bit words", () => {
    const le = Buffer.from([0x05, 0x00, 0xff, 0xff]);
    expect(decodeNumbers(le, "US", true)).toEqual([5, 65535]);
    const be = Buffer.from([0x00, 0x05, 0xff, 0xff]);
    expect(decodeNumbers(be, "US", false)).toEqual([5, 65535]);
  });

  it("SS decodes signed 16-bit (negative values, never reinterpreted as unsigned)", () => {
    const le = Buffer.from([0xff, 0xff]); // -1
    expect(decodeNumbers(le, "SS", true)).toEqual([-1]);
    expect(decodeNumbers(le, "US", true)).toEqual([65535]);
  });

  it("UL / SL decode 32-bit words by signedness", () => {
    const le = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    expect(decodeNumbers(le, "UL", true)).toEqual([4294967295]);
    expect(decodeNumbers(le, "SL", true)).toEqual([-1]);
  });

  it("FL / FD decode IEEE-754 floats", () => {
    const fl = Buffer.alloc(4);
    fl.writeFloatLE(1.5, 0);
    expect(decodeNumbers(fl, "FL", true)).toEqual([1.5]);
    const fd = Buffer.alloc(8);
    fd.writeDoubleLE(-2.25, 0);
    expect(decodeNumbers(fd, "FD", true)).toEqual([-2.25]);
  });

  it("ignores a trailing partial unit (fail-safe, never throws)", () => {
    const le = Buffer.from([0x05, 0x00, 0x07]); // one whole US + 1 stray byte
    expect(decodeNumbers(le, "US", true)).toEqual([5]);
  });

  it("returns [] for a non-numeric VR (defensive default branch)", () => {
    expect(decodeNumbers(Buffer.from([0x01, 0x02]), "PN", true)).toEqual([]);
  });
});

describe("decodeBigInts (SV signed / UV unsigned 64-bit → bigint)", () => {
  it("UV keeps full precision above 2^53", () => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(0xffffffffffffffffn, 0);
    expect(decodeBigInts(buf, "UV", true)).toEqual([0xffffffffffffffffn]);
  });

  it("SV decodes negative 64-bit values", () => {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(-5n, 0);
    expect(decodeBigInts(buf, "SV", true)).toEqual([-5n]);
  });

  it("big-endian honored", () => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(42n, 0);
    expect(decodeBigInts(buf, "UV", false)).toEqual([42n]);
  });

  it("ignores a trailing partial 8-byte unit", () => {
    const buf = Buffer.alloc(9);
    buf.writeBigUInt64LE(1n, 0);
    expect(decodeBigInts(buf, "UV", true)).toEqual([1n]);
  });
});

describe("decodeAttributeTags (AT — group/element pairs → 8-hex tag)", () => {
  it("decodes one tag little-endian", () => {
    // (0010,0010): group 0x0010, element 0x0010
    const buf = Buffer.from([0x10, 0x00, 0x10, 0x00]);
    expect(decodeAttributeTags(buf, true)).toEqual(["00100010"]);
  });

  it("decodes big-endian and multiple tags", () => {
    const buf = Buffer.from([0x00, 0x10, 0x00, 0x10, 0x7f, 0xe0, 0x00, 0x10]);
    expect(decodeAttributeTags(buf, false)).toEqual(["00100010", "7FE00010"]);
  });

  it("ignores a trailing partial 4-byte unit", () => {
    const buf = Buffer.from([0x10, 0x00, 0x10, 0x00, 0xff]);
    expect(decodeAttributeTags(buf, true)).toEqual(["00100010"]);
  });
});

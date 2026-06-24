import { Buffer } from "node:buffer";
import { describe, it, expect } from "vitest";

import { ByteCursor } from "./byte-cursor.js";

describe("ByteCursor (D-05; T-02-01-06 truncation mitigation)", () => {
  it("readUInt16 honours littleEndian flag", () => {
    const buf = Buffer.from([0x01, 0x02]);
    const le = new ByteCursor(buf, true);
    const be = new ByteCursor(buf, false);
    expect(le.readUInt16()).toBe(0x0201);
    expect(be.readUInt16()).toBe(0x0102);
  });

  it("readUInt32 honours littleEndian flag", () => {
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const le = new ByteCursor(buf, true);
    const be = new ByteCursor(buf, false);
    expect(le.readUInt32()).toBe(0x04030201);
    expect(be.readUInt32()).toBe(0x01020304);
  });

  it("readUInt16 advances position by 2", () => {
    const cur = new ByteCursor(Buffer.from([0x10, 0x00, 0x10, 0x00]), true);
    cur.readUInt16();
    expect(cur.position).toBe(2);
    cur.readUInt16();
    expect(cur.position).toBe(4);
  });

  it("readUInt32 advances position by 4", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]), true);
    cur.readUInt32();
    expect(cur.position).toBe(4);
  });

  it("readUInt16At does not advance position", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02, 0x03, 0x04]), true);
    cur.position = 0;
    expect(cur.readUInt16At(2)).toBe(0x0403);
    expect(cur.position).toBe(0);
  });

  it("readUInt32At does not advance position", () => {
    const cur = new ByteCursor(
      Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
      false,
    );
    cur.position = 0;
    expect(cur.readUInt32At(0)).toBe(0x01020304);
    expect(cur.position).toBe(0);
  });

  it("slice returns a Buffer view of `length` bytes and advances position", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02, 0x03, 0x04]), true);
    const view = cur.slice(2);
    expect(view).toEqual(Buffer.from([0x01, 0x02]));
    expect(cur.position).toBe(2);
  });

  it("remaining reports bytes left", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02, 0x03, 0x04]), true);
    expect(cur.remaining()).toBe(4);
    cur.readUInt16();
    expect(cur.remaining()).toBe(2);
  });

  it("readUInt16 throws RangeError on read past end (T-02-01-06)", () => {
    const cur = new ByteCursor(Buffer.from([0x01]), true);
    expect(() => cur.readUInt16()).toThrow(RangeError);
  });

  it("readUInt32 throws RangeError on read past end", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02, 0x03]), true);
    expect(() => cur.readUInt32()).toThrow(RangeError);
  });

  it("readUInt16At throws RangeError on out-of-range offset (negative or beyond end)", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02]), true);
    expect(() => cur.readUInt16At(-1)).toThrow(RangeError);
    expect(() => cur.readUInt16At(1)).toThrow(RangeError);
  });

  it("readUInt32At throws RangeError on out-of-range offset", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02, 0x03]), true);
    expect(() => cur.readUInt32At(0)).toThrow(RangeError);
    expect(() => cur.readUInt32At(-1)).toThrow(RangeError);
  });

  it("slice throws RangeError on negative or over-long length", () => {
    const cur = new ByteCursor(Buffer.from([0x01, 0x02]), true);
    expect(() => cur.slice(-1)).toThrow(RangeError);
    expect(() => cur.slice(3)).toThrow(RangeError);
  });
});

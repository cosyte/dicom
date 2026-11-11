/**
 * The writer's walk of an Item whose Data Elements were read in ascending tag order.
 *
 * Most Items are already in order, so `serializeDicom` takes them without the sort and without a
 * second array (see `orderedAscending` in `src/serialize/order.ts`). These hold that it decides
 * exactly what the general walk decides: an Item whose model holds an element its bytes do not is
 * refused (bar a group length), an element whose own bytes do not show where it ends still goes
 * last, and a later Item that moves still moves when the Items before it did not.
 *
 * Each Data Set is assembled by hand, as a caller may, so the model and the bytes can differ in
 * exactly one place. Every byte is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { Dataset, Element, Item, parseDicom, serializeDicom } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** `(0008,1115)` Referenced Series Sequence: registered `SQ`. */
const SEQUENCE: Tag = "00081115";
const CODE_VALUE: Tag = "00080100";
const CODE_MEANING: Tag = "00080104";
const UNDEFINED_LENGTH = 0xffffffff;

function u16(n: number, littleEndian = true): Buffer {
  const out = Buffer.alloc(2);
  if (littleEndian) out.writeUInt16LE(n, 0);
  else out.writeUInt16BE(n, 0);
  return out;
}

function u32(n: number, littleEndian = true): Buffer {
  const out = Buffer.alloc(4);
  if (littleEndian) out.writeUInt32LE(n, 0);
  else out.writeUInt32BE(n, 0);
  return out;
}

function wireTag(tag: Tag, littleEndian = true): Buffer {
  return Buffer.concat([
    u16(Number.parseInt(tag.slice(0, 4), 16), littleEndian),
    u16(Number.parseInt(tag.slice(4), 16), littleEndian),
  ]);
}

/** An Explicit VR LE short-form element's header and value, and its model. */
function short(tag: Tag, vr: VR, text: string): { bytes: Buffer; model: Element } {
  const value = Buffer.from(text, "latin1");
  const bytes = Buffer.concat([wireTag(tag), Buffer.from(vr, "ascii"), u16(value.length), value]);
  return { bytes, model: modelOf(tag, vr, value, value.length) };
}

/**
 * An undefined-length `UN` span (header, then a Sequence Delimitation Item) and its model. Nothing
 * in it shows a reader where the value ends, so it is not closed.
 */
function openUn(tag: Tag): { bytes: Buffer; model: Element } {
  const bytes = Buffer.concat([
    wireTag(tag),
    Buffer.from("UN", "ascii"),
    u16(0),
    u32(UNDEFINED_LENGTH),
    wireTag("FFFEE0DD"),
    u32(0),
  ]);
  return { bytes, model: modelOf(tag, "UN", bytes, UNDEFINED_LENGTH) };
}

function modelOf(tag: Tag, vr: VR, rawBytes: Buffer, length: number): Element {
  return new Element({ tag, vr, vm: 1, length, rawBytes, byteOffset: 0, littleEndian: true });
}

/** A defined-length Item holding `parts` in this order. */
function itemBytes(parts: readonly Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([wireTag("FFFEE000"), u32(body.length), body]);
}

function itemModel(index: number, elements: readonly Element[]): Item {
  return new Item({ index, warnings: [], elements: new Map(elements.map((el) => [el.tag, el])) });
}

/** A defined-length Explicit VR LE `SQ` element over `items`, as `rawBytes` holds it. */
function sequence(items: readonly Buffer[], models: readonly Item[]): Element {
  const value = Buffer.concat(items);
  const rawBytes = Buffer.concat([
    wireTag(SEQUENCE),
    Buffer.from("SQ", "ascii"),
    u16(0),
    u32(value.length),
    value,
  ]);
  return new Element({
    tag: SEQUENCE,
    vr: "SQ",
    vm: models.length,
    length: value.length,
    rawBytes,
    byteOffset: 0,
    littleEndian: true,
    items: models,
  });
}

function holding(sq: Element, transferSyntax = TS_EXPLICIT_LE): Dataset {
  const meta = parseDicom(buildDicom({ transferSyntax, elements: [] })).fileMeta;
  return new Dataset({
    ...(meta !== undefined ? { fileMeta: meta } : {}),
    warnings: [],
    elements: new Map([[sq.tag, sq]]),
  });
}

/** The tags of each Item of the written Sequence, in the order they were written. */
function writtenItems(ds: Dataset): readonly (readonly Tag[])[] {
  const items = parseDicom(serializeDicom(ds)).get(SEQUENCE)?.items ?? [];
  return items.map((item) => item.elements().map((el) => el.tag));
}

/**
 * Two Items: the first in ascending order, its model holding `extra` besides its two elements; the
 * second out of order. The second is re-ordered only when the walk accepts the first.
 */
function withExtraInFirstItem(extra: Element): Dataset {
  const value = short(CODE_VALUE, "SH", "C1");
  const meaning = short(CODE_MEANING, "LO", "MEANING ");
  const later = short(CODE_MEANING, "LO", "LATER ");
  const earlier = short(CODE_VALUE, "SH", "C2");
  return holding(
    sequence(
      [itemBytes([value.bytes, meaning.bytes]), itemBytes([later.bytes, earlier.bytes])],
      [
        itemModel(0, [value.model, extra, meaning.model]),
        itemModel(1, [later.model, earlier.model]),
      ],
    ),
  );
}

describe("an ascending Item whose model holds an element its bytes do not", () => {
  it("the control: with nothing extra, the second Item is re-ordered", () => {
    const value = short(CODE_VALUE, "SH", "C1");
    const meaning = short(CODE_MEANING, "LO", "MEANING ");
    const later = short(CODE_MEANING, "LO", "LATER ");
    const earlier = short(CODE_VALUE, "SH", "C2");
    const ds = holding(
      sequence(
        [itemBytes([value.bytes, meaning.bytes]), itemBytes([later.bytes, earlier.bytes])],
        [itemModel(0, [value.model, meaning.model]), itemModel(1, [later.model, earlier.model])],
      ),
    );
    expect(writtenItems(ds)).toEqual([
      [CODE_VALUE, CODE_MEANING],
      [CODE_VALUE, CODE_MEANING],
    ]);
  });

  it("is refused, so the whole Sequence is written as read", () => {
    // (0008,0102) Coding Scheme Designator: in the model, between the two, and not on the wire.
    const ds = withExtraInFirstItem(modelOf("00080102", "SH", Buffer.from("99"), 2));
    expect(writtenItems(ds)).toEqual([
      [CODE_VALUE, CODE_MEANING],
      [CODE_MEANING, CODE_VALUE],
    ]);
  });

  it("is refused when the missing element sorts after every element on the wire", () => {
    const ds = withExtraInFirstItem(modelOf("00080105", "CS", Buffer.from("AB"), 2));
    expect(writtenItems(ds)).toEqual([
      [CODE_VALUE, CODE_MEANING],
      [CODE_MEANING, CODE_VALUE],
    ]);
  });

  it("is accepted when that element is a group length, which the writer leaves out", () => {
    const ds = withExtraInFirstItem(modelOf("00080000", "UL", u32(28), 4));
    expect(writtenItems(ds)).toEqual([
      [CODE_VALUE, CODE_MEANING],
      [CODE_VALUE, CODE_MEANING],
    ]);
  });
});

describe("an ascending Item whose bytes disagree with its model", () => {
  it("is refused, so the whole Sequence is written as read", () => {
    const value = short(CODE_VALUE, "SH", "C1");
    const meaning = short(CODE_MEANING, "LO", "MEANING ");
    const later = short(CODE_MEANING, "LO", "LATER ");
    const earlier = short(CODE_VALUE, "SH", "C2");
    // The model read "C9" where the wire now holds "C1".
    const misread = modelOf(CODE_VALUE, "SH", Buffer.from("C9", "latin1"), 2);
    const ds = holding(
      sequence(
        [itemBytes([value.bytes, meaning.bytes]), itemBytes([later.bytes, earlier.bytes])],
        [itemModel(0, [misread, meaning.model]), itemModel(1, [later.model, earlier.model])],
      ),
    );
    expect(writtenItems(ds)).toEqual([
      [CODE_VALUE, CODE_MEANING],
      [CODE_MEANING, CODE_VALUE],
    ]);
  });
});

describe("an ascending Item with elements whose own bytes do not show where they end", () => {
  it("writes the closed elements ascending, then the open ones in the order read", () => {
    const value = short(CODE_VALUE, "SH", "C1");
    const first = openUn("00080101");
    const second = openUn("00080102");
    const meaning = short(CODE_MEANING, "LO", "MEANING ");
    const item = itemBytes([value.bytes, first.bytes, second.bytes, meaning.bytes]);
    const ds = holding(
      sequence([item], [itemModel(0, [value.model, first.model, second.model, meaning.model])]),
    );

    const written = serializeDicom(ds);
    const at = (bytes: Buffer): number => written.indexOf(bytes);

    expect(at(value.bytes)).toBeLessThan(at(meaning.bytes));
    expect(at(meaning.bytes)).toBeLessThan(at(first.bytes));
    expect(at(first.bytes)).toBeLessThan(at(second.bytes));
    // The Item's length is unchanged: only whole spans moved inside it.
    expect(written.includes(item.subarray(0, 8))).toBe(true);
  });
});

describe("a hand-built Sequence whose declared length runs past its own bytes", () => {
  // The walk reads up to the declared end, so a read past the bytes throws the RangeError
  // `Buffer.readUInt16LE` and its kin throw, as the writer always has for such a Data Set.
  for (const littleEndian of [true, false]) {
    const order = littleEndian ? "Little Endian" : "Big Endian";
    const header = (declared: number): Buffer =>
      Buffer.concat([
        wireTag(SEQUENCE, littleEndian),
        Buffer.from("SQ", "ascii"),
        u16(0, littleEndian),
        u32(declared, littleEndian),
      ]);
    const element = (rawBytes: Buffer): Element =>
      new Element({
        tag: SEQUENCE,
        vr: "SQ",
        vm: 1,
        length: 100,
        rawBytes,
        byteOffset: 0,
        littleEndian,
        items: [itemModel(0, [])],
      });
    const syntax = littleEndian ? TS_EXPLICIT_LE : TS_EXPLICIT_BE;

    it(`${order}: an Item tag cut in half`, () => {
      const raw = Buffer.concat([header(100), wireTag("FFFEE000", littleEndian).subarray(0, 2)]);
      expect(() => serializeDicom(holding(element(raw), syntax))).toThrow(RangeError);
    });

    it(`${order}: an Item with no room for its length`, () => {
      const raw = Buffer.concat([header(100), wireTag("FFFEE000", littleEndian)]);
      expect(() => serializeDicom(holding(element(raw), syntax))).toThrow(RangeError);
    });
  }
});

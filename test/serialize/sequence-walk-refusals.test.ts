/**
 * Where the writer's walk of a Sequence's Item stream refuses, and what it writes instead.
 *
 * `serializeDicom` re-orders the Data Elements inside each Item ascending, but only when the bytes
 * of the `SQ` walk to their end and agree, element by element, with the model the reader built
 * (see `src/serialize/order.ts`). A Data Set a caller assembled, or one whose input buffer changed
 * after a zero-copy parse, can carry bytes the model does not describe. Each refusal must write the
 * Sequence exactly as read, never a guess, and an element whose bytes do not show where it ends
 * must go last in its Item.
 *
 * The rows that change bytes after the parse do it on purpose: `parseDicom` without `copyValues`
 * keeps views into its input, so the model and the bytes then disagree in exactly one place.
 *
 * Every byte is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { Dataset, Element, parseDicom, serializeDicom, type Item } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** `(0008,1115)` Referenced Series Sequence: registered `SQ`. */
const SEQUENCE: Tag = "00081115";
/** `(0008,0104)` Code Meaning and `(0008,0100)` Code Value, written out of order. */
const LATER: Tag = "00080104";
const EARLIER: Tag = "00080100";

function ascii(text: string): Buffer {
  const buf = Buffer.from(text, "latin1");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x20])]);
}

/** A Little Endian tag as it sits on the wire. */
function wireTag(tag: Tag): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt16LE(Number.parseInt(tag.slice(0, 4), 16), 0);
  out.writeUInt16LE(Number.parseInt(tag.slice(4), 16), 2);
  return out;
}

/** An Explicit VR LE file with one Sequence whose one Item holds LATER then EARLIER. */
function outOfOrder(): Buffer {
  return buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [
      {
        tag: SEQUENCE,
        items: [
          {
            elements: [
              { tag: LATER, vr: "LO" as VR, value: ascii("MEANING") },
              { tag: EARLIER, vr: "SH" as VR, value: ascii("C1") },
            ],
          },
        ],
      },
    ],
  });
}

/** An Explicit VR LE Data Set holding only `sq`, with a parsed File Meta. */
function holding(sq: Element): Dataset {
  const meta = parseDicom(buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: [] })).fileMeta;
  return new Dataset({
    ...(meta !== undefined ? { fileMeta: meta } : {}),
    warnings: [],
    elements: new Map([[sq.tag, sq]]),
  });
}

function sequenceElement(rawBytes: Buffer, items: readonly Item[]): Element {
  return new Element({
    tag: SEQUENCE,
    vr: "SQ",
    vm: items.length,
    length: rawBytes.length,
    rawBytes,
    byteOffset: 0,
    littleEndian: true,
    items,
  });
}

describe("the control: a Sequence whose bytes agree with the model is ordered", () => {
  it("writes the Item's elements ascending", () => {
    const out = parseDicom(serializeDicom(parseDicom(outOfOrder())));
    const tags = out
      .get(SEQUENCE)
      ?.items?.[0]?.elements()
      .map((el) => el.tag);
    expect(tags).toEqual([EARLIER, LATER]);
  });
});

describe("a Sequence the walk refuses is written exactly as read", () => {
  it("when an element in an Item is one the model's Item does not hold", () => {
    const input = outOfOrder();
    const ds = parseDicom(input);
    const raw = ds.get(SEQUENCE)?.rawBytes;
    if (raw === undefined) throw new Error("fixture has no Sequence");
    // Rename (0008,0100) to (0008,0102) in the input, under the model.
    const at = raw.indexOf(wireTag(EARLIER));
    raw.writeUInt16LE(0x0102, at + 2);

    const written = serializeDicom(ds);

    expect(written.includes(raw)).toBe(true);
    expect(written.indexOf(wireTag(LATER))).toBeLessThan(written.indexOf(wireTag("00080102")));
  });

  it("when an Item element's header declares a long-form VR its Item has no room for", () => {
    const input = outOfOrder();
    const ds = parseDicom(input);
    const raw = ds.get(SEQUENCE)?.rawBytes;
    if (raw === undefined) throw new Error("fixture has no Sequence");
    // (0008,0100) SH "C1" is 10 bytes, the last element of its Item. As OB it needs a 12-byte
    // header, past the end of the Item.
    const at = raw.indexOf(wireTag(EARLIER));
    raw.write("OB", at + 4, "ascii");

    const written = serializeDicom(ds);

    expect(written.includes(raw)).toBe(true);
  });

  it("when the Sequence's own bytes are too short to hold an element header", () => {
    const raw = Buffer.from([0x08, 0x00, 0x15, 0x11, 0x53, 0x51]);
    const written = serializeDicom(holding(sequenceElement(raw, [])));
    expect(written.subarray(written.length - raw.length).equals(raw)).toBe(true);
  });

  it("when the Sequence's long-form header is cut short", () => {
    const raw = Buffer.concat([wireTag(SEQUENCE), Buffer.from("SQ", "ascii"), Buffer.alloc(4)]);
    const written = serializeDicom(holding(sequenceElement(raw, [])));
    expect(written.subarray(written.length - raw.length).equals(raw)).toBe(true);
  });

  it("when the Sequence's on-wire VR is not SQ, whatever the model calls it", () => {
    const parsed = parseDicom(outOfOrder()).get(SEQUENCE);
    if (parsed?.items === undefined) throw new Error("fixture has no Sequence");
    const raw = Buffer.from(parsed.rawBytes);
    raw.write("OB", 4, "ascii");

    const written = serializeDicom(holding(sequenceElement(raw, parsed.items)));

    expect(written.subarray(written.length - raw.length).equals(raw)).toBe(true);
  });
});

describe("an element whose own bytes do not show where it ends", () => {
  /** (FFFC,FFFC) Data Set Trailing Padding: a tag that sorts after Pixel Data. */
  const TRAILING_PADDING: Tag = "FFFCFFFC";

  function itemWithPixelData(): Buffer {
    return buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: SEQUENCE,
          items: [
            {
              elements: [
                { tag: TRAILING_PADDING, vr: "OB" as VR, value: Buffer.alloc(4) },
                {
                  tag: "7FE00010",
                  encapsulatedPixelData: true,
                  encapsulatedFragments: [Buffer.alloc(0), Buffer.alloc(8, 0x11)],
                  items: [],
                },
              ],
            },
          ],
        },
      ],
    });
  }

  function writtenOrder(ds: Dataset): readonly number[] {
    const written = serializeDicom(ds);
    return [written.indexOf(wireTag("7FE00010")), written.indexOf(wireTag(TRAILING_PADDING))];
  }

  it("the control: encapsulated Pixel Data that ends on its delimiter is ordered with the rest", () => {
    const [pixelData, padding] = writtenOrder(parseDicom(itemWithPixelData()));
    expect(pixelData).toBeLessThan(padding ?? -1);
  });

  it("goes last in its Item: Pixel Data whose fragment stream holds a foreign marker", () => {
    const input = itemWithPixelData();
    const ds = parseDicom(input);
    const raw = ds.get(SEQUENCE)?.rawBytes;
    if (raw === undefined) throw new Error("fixture has no Sequence");
    // The second fragment's Item tag becomes an Item Delimitation Item: not a fragment, and not
    // the Sequence Delimitation Item that would end the stream.
    const pixelAt = raw.indexOf(wireTag("7FE00010"));
    const secondItem = raw.indexOf(wireTag("FFFEE000"), pixelAt + 12 + 8);
    raw.writeUInt16LE(0xe00d, secondItem + 2);

    const [pixelData, padding] = writtenOrder(ds);

    expect(pixelData).toBeGreaterThan(padding ?? Number.MAX_SAFE_INTEGER);
  });
});

describe("Implicit VR LE: an Item element in a repeating group", () => {
  it("is resolved by its group family and ordered with the rest", () => {
    // (6000,0010) Overlay Rows has no literal PS3.6 row; the (60xx,0010) family names it US.
    const OVERLAY_ROWS: Tag = "60000010";
    const REFERENCED_SOP: Tag = "00081155";
    const rows = Buffer.alloc(2);
    rows.writeUInt16LE(512, 0);
    const input = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        {
          tag: SEQUENCE,
          items: [
            {
              elements: [
                { tag: OVERLAY_ROWS, vr: "US" as VR, value: rows },
                { tag: REFERENCED_SOP, vr: "UI" as VR, value: ascii("2.25.1") },
              ],
            },
          ],
        },
      ],
    });

    const item = parseDicom(serializeDicom(parseDicom(input))).get(SEQUENCE)?.items?.[0];

    expect(item?.elements().map((el) => el.tag)).toEqual([REFERENCED_SOP, OVERLAY_ROWS]);
    expect(item?.get(OVERLAY_ROWS)?.rawBytes.readUInt16LE(0)).toBe(512);
  });
});

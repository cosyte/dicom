/**
 * The public model readers on a Data Set a caller assembled by hand rather than one `parseDicom`
 * returned: `readPixelDataFragments` and `Dataset.directory`.
 *
 * `Dataset`, `Item` and `Element` are exported with public constructors, so a caller can hand
 * these readers a shape the parser never builds: Big Endian fragment bytes, an Item stream the
 * parser would have refused, or two Directory Records claiming one file offset. Each reader must
 * still answer from the bytes it holds, and refuse what it cannot read with a typed fatal that
 * carries none of those bytes.
 *
 * Every byte here is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  Dataset,
  DicomParseError,
  Element,
  FATAL_CODES,
  Item,
  parseDicom,
  readPixelDataFragments,
} from "../../src/index.js";
import { buildDicomdir, TS_EXPLICIT_LE } from "../helpers/build-dicomdir.js";

const PIXEL_DATA = "7FE00010";
const UNDEFINED_LENGTH = 0xffffffff;

/** A 12-byte Explicit VR header for `(7FE0,0010) OB` with undefined length, in either byte order. */
function pixelDataHeader(littleEndian: boolean): Buffer {
  const header = Buffer.alloc(12);
  if (littleEndian) {
    header.writeUInt16LE(0x7fe0, 0);
    header.writeUInt16LE(0x0010, 2);
  } else {
    header.writeUInt16BE(0x7fe0, 0);
    header.writeUInt16BE(0x0010, 2);
  }
  header.write("OB", 4, "ascii");
  header.writeUInt32LE(UNDEFINED_LENGTH, 8);
  return header;
}

/** An 8-byte `(FFFE,xxxx)` marker with a 32-bit length, in either byte order. */
function marker(element: number, length: number, littleEndian: boolean): Buffer {
  const out = Buffer.alloc(8);
  if (littleEndian) {
    out.writeUInt16LE(0xfffe, 0);
    out.writeUInt16LE(element, 2);
    out.writeUInt32LE(length, 4);
  } else {
    out.writeUInt16BE(0xfffe, 0);
    out.writeUInt16BE(element, 2);
    out.writeUInt32BE(length, 4);
  }
  return out;
}

function pixelDataSet(rawBytes: Buffer, littleEndian: boolean): Dataset {
  const el = new Element({
    tag: PIXEL_DATA,
    vr: "OB",
    vm: 1,
    length: UNDEFINED_LENGTH,
    rawBytes,
    byteOffset: 0,
    littleEndian,
  });
  return new Dataset({ warnings: [], elements: new Map([[PIXEL_DATA, el]]) });
}

function fatalFrom(run: () => unknown): DicomParseError {
  try {
    run();
  } catch (err) {
    if (err instanceof DicomParseError) return err;
    throw err;
  }
  throw new Error("expected a DicomParseError");
}

describe("readPixelDataFragments on a hand-assembled Data Set", () => {
  const BOT = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const FRAGMENT_A = Buffer.alloc(6, 0x41);
  const FRAGMENT_B = Buffer.alloc(4, 0x42);

  it("reads a Big Endian Item stream by the Element's own byte order", () => {
    const raw = Buffer.concat([
      pixelDataHeader(false),
      marker(0xe000, BOT.length, false),
      BOT,
      marker(0xe000, FRAGMENT_A.length, false),
      FRAGMENT_A,
      marker(0xe000, FRAGMENT_B.length, false),
      FRAGMENT_B,
      marker(0xe0dd, 0, false),
    ]);

    const out = readPixelDataFragments(pixelDataSet(raw, false));

    expect(out?.basicOffsetTable?.equals(BOT)).toBe(true);
    expect(out?.fragments).toHaveLength(2);
    expect(out?.fragments[0]?.equals(FRAGMENT_A)).toBe(true);
    expect(out?.fragments[1]?.equals(FRAGMENT_B)).toBe(true);
  });

  it("refuses an Item header cut short with SQ_ITEM_HEADER_TRUNCATED's code and no bytes of it", () => {
    const raw = Buffer.concat([
      pixelDataHeader(true),
      marker(0xe000, 0, true),
      Buffer.from([0xfe, 0xff, 0x00]),
    ]);

    const err = fatalFrom(() => readPixelDataFragments(pixelDataSet(raw, true)));

    expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(err.message).toContain("Truncated dataset (SQ item header read past buffer end).");
    expect(err.byteOffset).toBe(20);
  });

  it("refuses a tag that is neither an Item nor the Sequence Delimitation Item", () => {
    // `(0010,0010)` mid-stream: a foreign element where an Item belongs.
    const foreign = Buffer.from([0x10, 0x00, 0x10, 0x00, 0x04, 0x00, 0x00, 0x00]);
    const raw = Buffer.concat([pixelDataHeader(true), marker(0xe000, 0, true), foreign]);

    const err = fatalFrom(() => readPixelDataFragments(pixelDataSet(raw, true)));

    expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(err.message).toContain("neither (FFFE,E000) Item nor (FFFE,E0DD)");
    expect(err.byteOffset).toBe(20);
    expect(err.message).not.toContain("0010,0010");
  });

  it("refuses a fragment whose declared length reaches past the bytes, withholding that length", () => {
    const raw = Buffer.concat([
      pixelDataHeader(true),
      marker(0xe000, 0, true),
      marker(0xe000, 0x40, true),
      Buffer.alloc(4, 0x43),
    ]);

    const err = fatalFrom(() => readPixelDataFragments(pixelDataSet(raw, true)));

    expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(err.message).toContain("declares a length reaching past the end");
    expect(err.message).not.toContain("64");
    expect(err.byteOffset).toBe(20);
  });

  it("reads an Item stream that runs to the end of the bytes with no delimiter", () => {
    const raw = Buffer.concat([
      pixelDataHeader(true),
      marker(0xe000, 0, true),
      marker(0xe000, FRAGMENT_A.length, true),
      FRAGMENT_A,
    ]);

    const out = readPixelDataFragments(pixelDataSet(raw, true));

    expect(out?.basicOffsetTable?.length).toBe(0);
    expect(out?.fragments.map((f) => f.toString("latin1"))).toEqual(["AAAAAA"]);
  });
});

describe("Dataset.directory on a hand-assembled DICOMDIR", () => {
  /** Rebuild `ds` with the Directory Record Sequence's Items replaced by `items`. */
  function withRecords(ds: Dataset, build: (items: readonly Item[]) => Item[]): Dataset {
    const sequence = ds.get("00041220");
    if (sequence?.items === undefined) throw new Error("fixture has no Record Sequence");
    const replaced = new Element({
      tag: sequence.tag,
      vr: sequence.vr,
      vm: sequence.vm,
      length: sequence.length,
      rawBytes: sequence.rawBytes,
      byteOffset: sequence.byteOffset,
      littleEndian: sequence.littleEndian,
      items: build(sequence.items),
    });
    const elements = new Map(ds.elements().map((el) => [el.tag, el] as const));
    elements.set(replaced.tag, replaced);
    return new Dataset({
      ...(ds.fileMeta !== undefined ? { fileMeta: ds.fileMeta } : {}),
      warnings: [],
      elements,
    });
  }

  function copyAt(item: Item, index: number, fileOffset: number): Item {
    return new Item({
      index,
      fileOffset,
      warnings: [],
      elements: new Map(item.elements().map((el) => [el.tag, el] as const)),
    });
  }

  it("ties an offset to neither of two records that claim the same file offset", () => {
    const { bytes, recordOffsets } = buildDicomdir({
      transferSyntax: TS_EXPLICIT_LE,
      records: [{ type: "PATIENT" }, { type: "PATIENT" }],
    });
    const parsed = parseDicom(bytes);
    // The parsed file resolves its First Root Record to record 0.
    expect(parsed.directory?.root.map((r) => r.index)).toEqual([0]);

    const first = recordOffsets[0] ?? 0;
    const ambiguous = withRecords(parsed, (items) =>
      items.map((item, index) => copyAt(item, index, first)),
    );

    const directory = ambiguous.directory;
    expect(directory?.records).toHaveLength(2);
    expect(directory?.root).toEqual([]);
  });

  it("keeps a record with an empty Record Type and file ID as no type and no components", () => {
    const { bytes } = buildDicomdir({
      transferSyntax: TS_EXPLICIT_LE,
      records: [{ type: "", fileId: [""] }],
    });

    const record = parseDicom(bytes).directory?.records[0];

    expect(record?.type).toBeUndefined();
    expect(record?.referencedFileId).toEqual([]);
  });
});

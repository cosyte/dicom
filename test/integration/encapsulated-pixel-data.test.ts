/**
 * The public fragment surface, `readPixelDataFragments`, and the unhappy paths of the encapsulated
 * Pixel Data walk, under PS3.5 2026c section A.4 encapsulation Transfer Syntaxes.
 *
 * Every fixture is synthetic (see `test/fixtures/encapsulated/objects.ts`). Where a row is about
 * what a diagnostic may carry, the payload is NAME-BEARING on purpose: a fragment filled with
 * `JANE`, and a declared length whose four bytes spell `DOE^`, so a leak of either is visible as
 * text, as hex and as the decimal a `readUInt32LE` gives.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { readPixelDataFragments, WARNING_CODES } from "../../src/index.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import { DicomParseError, FATAL_CODES } from "../../src/parser/errors.js";
import { parseDicom } from "../../src/parser/index.js";
import { WARNING_MESSAGES } from "../../src/parser/warnings.js";
import {
  DEFAULT_FRAGMENT,
  TS_EXPLICIT_LE,
  encapsulatedObject,
} from "../fixtures/encapsulated/objects.js";

const JPEG_BASELINE = "1.2.840.10008.1.2.4.50";
const RLE_LOSSLESS = "1.2.840.10008.1.2.5";
const HTJ2K = "1.2.840.10008.1.2.4.201";

/** A Basic Offset Table of two 32-bit offsets, and three fragments of distinct fill bytes. */
const BOT_TWO_OFFSETS = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x18, 0x00, 0x00, 0x00]);
const FRAGMENT_A = Buffer.alloc(16, 0x11);
const FRAGMENT_B = Buffer.alloc(10, 0x22);
const FRAGMENT_C = Buffer.alloc(6, 0x33);

/** The eight bytes of a Sequence Delimitation Item, `(FFFE,E0DD)` with length 0. */
const SEQ_DELIM_BYTES = Buffer.from([0xfe, 0xff, 0xdd, 0xe0, 0x00, 0x00, 0x00, 0x00]);

/** A name-bearing fragment: `JANE` repeated. */
const NAME_FRAGMENT = Buffer.from("JANEJANEJANEJANE", "latin1");
/** A declared length whose four little-endian bytes are `DOE^`. */
const NAME_LENGTH = Buffer.from("DOE^", "latin1").readUInt32LE(0);

function fatalFrom(bytes: Buffer): DicomParseError {
  let ds: Dataset | undefined;
  try {
    ds = parseDicom(bytes);
  } catch (err) {
    if (err instanceof DicomParseError) {
      expect(ds).toBeUndefined();
      return err;
    }
    throw err;
  }
  throw new Error("expected a DicomParseError and got a Dataset");
}

/** Every representation of the name-bearing payload and its length a leak could take. */
function renderings(): string[] {
  const hex = (b: Buffer): string => b.toString("hex");
  const spaced = (b: Buffer): string =>
    [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(NAME_LENGTH, 0);
  return [
    "JANE",
    "DOE^",
    hex(Buffer.from("JANE", "latin1")),
    spaced(Buffer.from("JANE", "latin1")),
    String(NAME_LENGTH),
    NAME_LENGTH.toString(16),
    hex(len),
    spaced(len),
  ];
}

/** Every field of the error except `snippet`, as text. */
function nonSnippetText(err: DicomParseError): string {
  return JSON.stringify({
    code: err.code,
    message: err.message,
    name: err.name,
    byteOffset: err.byteOffset,
    offsetFrame: err.offsetFrame,
    contextPath: err.contextPath,
    stack: err.stack,
  });
}

describe("AC-3: the Basic Offset Table and every fragment, as raw bytes in file order", () => {
  it.each([JPEG_BASELINE, RLE_LOSSLESS, HTJ2K])(
    "AC-3: a populated Basic Offset Table and three fragments under %s",
    (uid) => {
      const bytes = encapsulatedObject({
        transferSyntax: uid,
        items: [BOT_TWO_OFFSETS, FRAGMENT_A, FRAGMENT_B, FRAGMENT_C],
      });
      const pixels = readPixelDataFragments(parseDicom(bytes));
      expect(pixels).toBeDefined();
      expect(pixels?.basicOffsetTable?.equals(BOT_TWO_OFFSETS)).toBe(true);
      expect(pixels?.fragments.map((f) => f.toString("hex"))).toStrictEqual(
        [FRAGMENT_A, FRAGMENT_B, FRAGMENT_C].map((f) => f.toString("hex")),
      );

      // Byte-identical to its own span of the input: each value sits in the input
      // right after its 8-byte Item header, and the header is not in the value.
      const pdAt = bytes.indexOf(Buffer.from([0xe0, 0x7f, 0x10, 0x00, 0x4f, 0x42]));
      let at = pdAt + 12;
      for (const value of [pixels?.basicOffsetTable, ...(pixels?.fragments ?? [])]) {
        const length = bytes.readUInt32LE(at + 4);
        expect(bytes.readUInt16LE(at)).toBe(0xfffe);
        expect(bytes.readUInt16LE(at + 2)).toBe(0xe000);
        expect(value?.equals(bytes.subarray(at + 8, at + 8 + length))).toBe(true);
        at += 8 + length;
      }
      // What follows the last fragment is the delimiter, and no value holds it.
      expect(bytes.subarray(at, at + 8).equals(SEQ_DELIM_BYTES)).toBe(true);
      for (const value of pixels?.fragments ?? []) {
        expect(value.includes(SEQ_DELIM_BYTES)).toBe(false);
        expect(value.includes(Buffer.from([0xfe, 0xff, 0x00, 0xe0]))).toBe(false);
      }
    },
  );

  it("AC-3: an empty Basic Offset Table reads as zero bytes", () => {
    const pixels = readPixelDataFragments(
      parseDicom(encapsulatedObject({ transferSyntax: JPEG_BASELINE })),
    );
    expect(pixels?.basicOffsetTable).toBeDefined();
    expect(pixels?.basicOffsetTable?.length).toBe(0);
    expect(pixels?.fragments).toHaveLength(1);
    expect(pixels?.fragments[0]?.equals(DEFAULT_FRAGMENT)).toBe(true);
  });
});

describe("AC-4: a fragment is returned whole, whatever its bytes", () => {
  it.each([JPEG_BASELINE, RLE_LOSSLESS])(
    "AC-4: filler and embedded Sequence Delimitation Item bytes under %s",
    (uid) => {
      const holdsDelimiter = Buffer.concat([
        Buffer.alloc(4, 0xaa),
        SEQ_DELIM_BYTES,
        Buffer.alloc(4, 0xaa),
      ]);
      const endsInDelimiter = Buffer.concat([Buffer.alloc(8, 0x5c), SEQ_DELIM_BYTES]);
      const opensWithDelimiter = Buffer.concat([SEQ_DELIM_BYTES, Buffer.alloc(2, 0x00)]);
      const filler = Buffer.alloc(12, 0xff);
      const written = [holdsDelimiter, endsInDelimiter, opensWithDelimiter, filler];
      const bytes = encapsulatedObject({
        transferSyntax: uid,
        items: [Buffer.alloc(0), ...written],
      });

      const ds = parseDicom(bytes);
      expect(ds.warnings).toStrictEqual([]);
      const pixels = readPixelDataFragments(ds);
      expect(pixels?.fragments).toHaveLength(written.length);
      pixels?.fragments.forEach((fragment, i) => {
        expect(fragment.equals(written[i] ?? Buffer.alloc(0))).toBe(true);
      });
      // ...and strict mode has nothing to escalate on account of the content.
      expect(() => parseDicom(bytes, { strict: true })).not.toThrow();
    },
  );
});

describe("AC-5: no encapsulated Pixel Data reads as a value no encapsulated result can be", () => {
  it.each([TS_EXPLICIT_LE, JPEG_BASELINE])("AC-5: Pixel Data absent under %s", (uid) => {
    const ds = parseDicom(encapsulatedObject({ transferSyntax: uid, pixelDataElements: [] }));
    expect(ds.has("7FE00010")).toBe(false);
    expect(readPixelDataFragments(ds)).toBeUndefined();
  });

  it.each([TS_EXPLICIT_LE, JPEG_BASELINE])(
    "AC-5: native Pixel Data with an explicit Value Length under %s",
    (uid) => {
      const ds = parseDicom(
        encapsulatedObject({
          transferSyntax: uid,
          pixelDataElements: [{ tag: "7FE00010", vr: "OW", value: Buffer.alloc(32, 0x01) }],
        }),
      );
      expect(ds.get("7FE00010")?.length).toBe(32);
      const result = readPixelDataFragments(ds);
      expect(result).toBeUndefined();
      // Distinguishable from every encapsulated result, including the smallest one.
      const smallest = readPixelDataFragments(
        parseDicom(encapsulatedObject({ transferSyntax: uid, items: [Buffer.alloc(0)] })),
      );
      expect(smallest).toBeDefined();
      expect(smallest?.fragments).toStrictEqual([]);
      expect(result).not.toStrictEqual(smallest);
    },
  );
});

describe("AC-6: copyValues keeps the fragments after the input is overwritten", () => {
  it("AC-6: the original bytes survive an overwrite with { copyValues: true }, and do not without it", () => {
    const items = [BOT_TWO_OFFSETS, FRAGMENT_A, FRAGMENT_B, FRAGMENT_C];
    const copied = encapsulatedObject({ transferSyntax: JPEG_BASELINE, items });
    const ds = parseDicom(copied, { copyValues: true });
    copied.fill(0x00);
    const pixels = readPixelDataFragments(ds);
    expect(pixels?.basicOffsetTable?.equals(BOT_TWO_OFFSETS)).toBe(true);
    expect(pixels?.fragments.map((f) => f.toString("hex"))).toStrictEqual(
      [FRAGMENT_A, FRAGMENT_B, FRAGMENT_C].map((f) => f.toString("hex")),
    );

    // Control: the same overwrite reaches a zero-copy parse, so the row above is
    // measuring the copy and not an overwrite that never happened.
    // Only fragment A's bytes are overwritten here, so the Item headers the walk
    // reads are intact and the difference is in the value alone.
    const viewed = encapsulatedObject({ transferSyntax: JPEG_BASELINE, items });
    const view = parseDicom(viewed);
    const aAt = viewed.indexOf(FRAGMENT_A);
    viewed.fill(0x00, aAt, aAt + FRAGMENT_A.length);
    expect(readPixelDataFragments(view)?.fragments[0]?.equals(FRAGMENT_A)).toBe(false);
    expect(readPixelDataFragments(ds)?.fragments[0]?.equals(FRAGMENT_A)).toBe(true);
  });
});

describe("AC-7: an Item declaring a length past the bytes is a typed fatal that carries neither", () => {
  it.each([JPEG_BASELINE, RLE_LOSSLESS])("AC-7: an over-declared fragment under %s", (uid) => {
    const bytes = encapsulatedObject({
      transferSyntax: uid,
      items: [Buffer.alloc(0), NAME_FRAGMENT],
      fragmentDeclaredLengthDelta: { index: 1, delta: NAME_LENGTH - NAME_FRAGMENT.length },
    });
    // The fixture really does declare the name-bearing length, and really does carry the name.
    expect(bytes.includes(Buffer.from("DOE^", "latin1"))).toBe(true);
    expect(bytes.includes(NAME_FRAGMENT)).toBe(true);

    const err = fatalFrom(bytes);
    expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    const text = nonSnippetText(err);
    for (const r of renderings()) {
      expect(text, r).not.toContain(r);
    }
    expect(err.byteOffset).not.toBe(NAME_LENGTH);

    // Non-vacuity: the same search finds the payload where it IS disclosed, in
    // the 16-byte snippet, so a clean result above is not a search that cannot match.
    expect(renderings().some((r) => err.snippet.includes(r))).toBe(true);
  });

  it.each([JPEG_BASELINE, RLE_LOSSLESS])(
    "AC-7: an over-declared Basic Offset Table Item under %s",
    (uid) => {
      const bytes = encapsulatedObject({
        transferSyntax: uid,
        items: [NAME_FRAGMENT],
        fragmentDeclaredLengthDelta: { index: 0, delta: NAME_LENGTH - NAME_FRAGMENT.length },
      });
      const err = fatalFrom(bytes);
      expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
      const text = nonSnippetText(err);
      for (const r of renderings()) {
        expect(text, r).not.toContain(r);
      }
      expect(err.byteOffset).not.toBe(NAME_LENGTH);
    },
  );
});

describe("AC-8: a foreign tag in the Item stream, or an input cut inside an Item header, is fatal", () => {
  const cases: readonly (readonly [string, Buffer])[] = [
    ["an Item Delimitation Item (FFFE,E00D)", Buffer.from([0xfe, 0xff, 0x0d, 0xe0, 0, 0, 0, 0])],
    [
      "a Data Element tag (0010,0010)",
      Buffer.from([0x10, 0x00, 0x10, 0x00, 0x50, 0x4e, 0x08, 0x00]),
    ],
    ["half an Item header", Buffer.from([0xfe, 0xff, 0x00, 0xe0])],
  ];
  for (const uid of [JPEG_BASELINE, RLE_LOSSLESS]) {
    it.each(cases)(`AC-8: %s after the last fragment under ${uid}`, (_label, tail) => {
      const bytes = encapsulatedObject({
        transferSyntax: uid,
        omitSequenceDelim: true,
        trailingBytes: tail,
      });
      const err = fatalFrom(bytes);
      expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    });
  }
});

describe("AC-9: a stream that ends before its Sequence Delimitation Item is a declared Tier-2 code", () => {
  it.each([JPEG_BASELINE, RLE_LOSSLESS])("AC-9: under %s", (uid) => {
    const items = [Buffer.alloc(0), NAME_FRAGMENT, FRAGMENT_A];
    const bytes = encapsulatedObject({ transferSyntax: uid, items, omitSequenceDelim: true });
    // The input ends on the last fragment's bytes, not on a delimiter.
    expect(bytes.subarray(bytes.length - FRAGMENT_A.length).equals(FRAGMENT_A)).toBe(true);

    const ds = parseDicom(bytes);
    expect(ds.warnings).toHaveLength(1);
    const [w] = ds.warnings;
    expect(w?.code).toBe(WARNING_CODES.DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED);
    // The message is the registry string with nothing substituted into it, so it
    // carries no fragment byte, no length and no count.
    expect(w?.message).toBe(WARNING_MESSAGES.DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED);
    for (const r of renderings()) {
      expect(w?.message, r).not.toContain(r);
    }
    // The position is the Pixel Data element's own header.
    expect(ds.get("7FE00010")?.byteOffset).toBe(w?.position.byteOffset);
    // Every whole fragment that was read is on the surface.
    expect(readPixelDataFragments(ds)?.fragments).toHaveLength(2);

    // And `{ strict: true }` refuses it under that code.
    try {
      parseDicom(bytes, { strict: true });
      expect.fail("expected the strict escalation");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe(WARNING_CODES.DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED);
    }
  });

  it("AC-9: a delimited stream raises nothing, so the code is about the delimiter alone", () => {
    const items = [Buffer.alloc(0), NAME_FRAGMENT, FRAGMENT_A];
    expect(
      parseDicom(encapsulatedObject({ transferSyntax: JPEG_BASELINE, items })).warnings,
    ).toStrictEqual([]);
  });
});

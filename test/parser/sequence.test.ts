/**
 * Tests for `parseSequence` — Phase 2 plan 02-04 task 1.
 *
 * Covers the shared SQ + FFFE marker handling consumed by the three
 * structural parsers (Implicit-LE, Explicit-LE, Explicit-BE):
 *   - Defined-length items + items array shape (D-28)
 *   - Undefined-length SQ termination via FFFE,E0DD (D-25)
 *   - Empty item tolerance (D-28 → DICOM_EMPTY_ITEM_IN_SEQUENCE)
 *   - Nesting-depth cap of 64 (T-02-04-02)
 *   - FFFE-under-BE bug closure (D-25 + PITFALLS §2.3)
 *   - CP-246 fallback success/failure (D-30 + tryParseUnAsSQ)
 *   - Encapsulated pixel data structural recognition (D-31)
 *   - Truncated SQ fixture → typed throw (T-02-04-01)
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import type { Tag } from "../../src/dictionary/types.js";
import { DicomParseError } from "../../src/parser/errors.js";
import {
  parseSequence,
  tryParseUnAsSQ,
  type InnerParser,
  type ParseSequenceOptions,
} from "../../src/parser/sequence.js";
import type { ParseContext } from "../../src/parser/types.js";
import { WARNING_CODES, type DicomParseWarning } from "../../src/parser/warnings.js";
import { parseImplicitLE } from "../../src/parser/implicit-le.js";

function makeContext(buffer: Buffer, overrides: Partial<ParseContext> = {}): ParseContext {
  return {
    buffer,
    strict: false,
    stripPreamble: "tolerate",
    warnings: [],
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
    ...overrides,
  };
}

function makeEmit(ctx: ParseContext): (w: DicomParseWarning) => void {
  return (w) => {
    ctx.warnings.push(w);
  };
}

/**
 * Build a 12-byte Implicit-VR-LE element header for the given tag + length.
 * Used to programmatically construct SQ items + their inner element bytes
 * without relying on the full buildDicom helper for unit-level checks.
 */
function buildImplicitLeElement(tag: Tag, length: number, value: Buffer): Buffer {
  const group = parseInt(tag.slice(0, 4), 16);
  const element = parseInt(tag.slice(4, 8), 16);
  const buf = Buffer.alloc(8);
  buf.writeUInt16LE(group, 0);
  buf.writeUInt16LE(element, 2);
  buf.writeUInt32LE(length, 4);
  return Buffer.concat([buf, value]);
}

function buildItemHeader(length: number, littleEndian: boolean): Buffer {
  const buf = Buffer.alloc(8);
  if (littleEndian) {
    buf.writeUInt16LE(0xfffe, 0);
    buf.writeUInt16LE(0xe000, 2);
    buf.writeUInt32LE(length, 4);
  } else {
    buf.writeUInt16BE(0xfffe, 0);
    buf.writeUInt16BE(0xe000, 2);
    buf.writeUInt32BE(length, 4);
  }
  return buf;
}

function buildSeqDelim(littleEndian: boolean): Buffer {
  const buf = Buffer.alloc(8);
  if (littleEndian) {
    buf.writeUInt16LE(0xfffe, 0);
    buf.writeUInt16LE(0xe0dd, 2);
    buf.writeUInt32LE(0, 4);
  } else {
    buf.writeUInt16BE(0xfffe, 0);
    buf.writeUInt16BE(0xe0dd, 2);
    buf.writeUInt32BE(0, 4);
  }
  return buf;
}

describe("parseSequence — defined-length item (D-28)", () => {
  it("parses a single defined-length item with one inner Implicit-LE element", () => {
    // Inner element: (0008,0100) CodeValue SH "CODE" (4 bytes, even length).
    const innerElement = buildImplicitLeElement("00080100", 4, Buffer.from("CODE", "ascii"));
    const item = Buffer.concat([buildItemHeader(innerElement.length, true), innerElement]);
    const ctx = makeContext(item);
    const emit = makeEmit(ctx);
    const opts: ParseSequenceOptions = {
      explicitLength: item.length,
      littleEndian: true,
      innerStrategy: parseImplicitLE,
    };
    const result = parseSequence(item, 0, ctx, emit, opts);
    expect(result.items.length).toBe(1);
    expect(result.endOffset).toBe(item.length);
  });
});

describe("parseSequence — undefined-length SQ + SeqDelim (D-25 + D-29)", () => {
  it("parses two defined-length items terminated by FFFE,E0DD SeqDelim", () => {
    const inner1 = buildImplicitLeElement("00080100", 4, Buffer.from("AAAA", "ascii"));
    const item1 = Buffer.concat([buildItemHeader(inner1.length, true), inner1]);
    const inner2 = buildImplicitLeElement("00080100", 4, Buffer.from("BBBB", "ascii"));
    const item2 = Buffer.concat([buildItemHeader(inner2.length, true), inner2]);
    const buffer = Buffer.concat([item1, item2, buildSeqDelim(true)]);
    const ctx = makeContext(buffer);
    const emit = makeEmit(ctx);
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: parseImplicitLE,
    };
    const result = parseSequence(buffer, 0, ctx, emit, opts);
    expect(result.items.length).toBe(2);
    expect(result.endOffset).toBe(buffer.length);
  });
});

describe("parseSequence — empty item tolerance (D-28)", () => {
  it("emits DICOM_EMPTY_ITEM_IN_SEQUENCE; the empty item is still in items array", () => {
    const buffer = Buffer.concat([buildItemHeader(0, true), buildSeqDelim(true)]);
    const ctx = makeContext(buffer);
    const emit = makeEmit(ctx);
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: parseImplicitLE,
    };
    const result = parseSequence(buffer, 0, ctx, emit, opts);
    expect(result.items.length).toBe(1);
    expect(ctx.warnings.some((w) => w.code === WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE)).toBe(
      true,
    );
  });
});

describe("parseSequence — nesting-depth cap (T-02-04-02)", () => {
  it("succeeds at nesting depth 64", () => {
    // Build a synthetic buffer; we drive parseSequence directly with a
    // mock InnerParser that recurses by calling parseSequence again on
    // the slice. We cap depth at 64 by counting; the parser also caps.
    const ctx = makeContext(Buffer.alloc(0));
    ctx.nestingDepth = 63; // After the next push, depth = 64 → still allowed.
    const emit = makeEmit(ctx);
    const buffer = buildSeqDelim(true);
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: parseImplicitLE,
    };
    expect(() => parseSequence(buffer, 0, ctx, emit, opts)).not.toThrow();
    // After the call, depth must be restored to 63.
    expect(ctx.nestingDepth).toBe(63);
  });

  it("throws INVALID_FILE_META at depth 65", () => {
    const ctx = makeContext(Buffer.alloc(0));
    ctx.nestingDepth = 64; // After the next push, depth = 65 → exceeds limit.
    const emit = makeEmit(ctx);
    const buffer = buildSeqDelim(true);
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: parseImplicitLE,
    };
    expect(() => parseSequence(buffer, 0, ctx, emit, opts)).toThrow(DicomParseError);
    try {
      parseSequence(buffer, 0, ctx, emit, opts);
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      if (err instanceof DicomParseError) {
        expect(err.code).toBe("INVALID_FILE_META");
        expect(err.message).toContain("depth exceeds 64");
      }
    }
  });
});

describe("parseSequence — FFFE under BE (D-25 + PITFALLS §2.3)", () => {
  it("undefined-length SQ in BE terminates correctly via FFFE,E0DD", () => {
    // Build BE item with one inner element (use a minimal SH-encoded
    // synthetic; the inner parser is a stub here that returns empty
    // elements + endOffset).
    const itemBody = Buffer.alloc(0); // empty body — matches "two empty items" pattern
    const buffer = Buffer.concat([
      buildItemHeader(itemBody.length, /* LE */ false),
      itemBody,
      buildSeqDelim(/* LE */ false),
    ]);
    const ctx = makeContext(buffer);
    const emit = makeEmit(ctx);
    // Mock InnerParser — returns empty elements + endOffset = startOffset.
    const innerStub: InnerParser = (_buf, start) => ({ elements: new Map(), endOffset: start });
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: false,
      innerStrategy: innerStub,
    };
    const result = parseSequence(buffer, 0, ctx, emit, opts);
    expect(result.items.length).toBe(1);
    expect(result.endOffset).toBe(buffer.length);
  });
});

describe("tryParseUnAsSQ — CP-246 fallback (D-30)", () => {
  it("success: descends a UN-undefined-length value containing valid Implicit-LE SQ", () => {
    // A UN value carrying an Implicit-LE-encoded SQ:
    //   undefined-length item with empty body + SeqDelim.
    const seqBody = Buffer.concat([buildItemHeader(0, true), buildSeqDelim(true)]);
    const ctx = makeContext(seqBody);
    const emit = makeEmit(ctx);
    const result = tryParseUnAsSQ(seqBody, 0, 0xffffffff, ctx, emit, parseImplicitLE);
    expect(result.success).toBe(true);
    // CP-246 success emits DICOM_UN_PARSED_AS_SQ.
    expect(ctx.warnings.some((w) => w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ)).toBe(true);
  });

  it("failure: random bytes do NOT descend; restores state; NO warning emitted", () => {
    // 16 bytes of random non-DICOM gibberish. The inner SQ parser will
    // attempt to read a (FFFE,E000) item header; the bytes won't form
    // valid headers and the descent will throw → caught + restored.
    const garbage = Buffer.from([
      0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44,
      0x55,
    ]);
    const ctx = makeContext(garbage);
    const emit = makeEmit(ctx);
    const before = ctx.warnings.length;
    const result = tryParseUnAsSQ(garbage, 0, garbage.length, ctx, emit, parseImplicitLE);
    expect(result.success).toBe(false);
    expect(result.items.length).toBe(0);
    // No warning emitted on the failure path.
    expect(ctx.warnings.length).toBe(before);
    // State preserved: nestingDepth restored to 0.
    expect(ctx.nestingDepth).toBe(0);
  });
});

describe("parseSequence — encapsulated pixel data (D-31)", () => {
  it("collects fragments + Basic Offset Table as items", () => {
    // 3 fragments + BOT. Each fragment is FFFE,E000 + length + raw bytes.
    const bot = Buffer.alloc(0); // empty BOT
    const frag1 = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const frag2 = Buffer.from([0x05, 0x06, 0x07, 0x08]);
    const frag3 = Buffer.from([0x09, 0x0a, 0x0b, 0x0c]);
    const buffer = Buffer.concat([
      buildItemHeader(bot.length, true),
      bot,
      buildItemHeader(frag1.length, true),
      frag1,
      buildItemHeader(frag2.length, true),
      frag2,
      buildItemHeader(frag3.length, true),
      frag3,
      buildSeqDelim(true),
    ]);
    const ctx = makeContext(buffer);
    const emit = makeEmit(ctx);
    const innerStub: InnerParser = (_buf, start) => ({ elements: new Map(), endOffset: start });
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: innerStub,
      encapsulatedPixelData: true,
    };
    const result = parseSequence(buffer, 0, ctx, emit, opts);
    // 4 items: BOT + 3 fragments.
    expect(result.items.length).toBe(4);
  });

  it("throws INVALID_FILE_META when a fragment declares more bytes than remain", () => {
    // A fragment item header claims 64 bytes of pixel data but only a few
    // follow — the bounds check must reject it (T-02-04-01) rather than
    // over-reading past the buffer.
    const buffer = Buffer.concat([
      buildItemHeader(0, true), // empty BOT
      buildItemHeader(64, true), // fragment claims 64 bytes...
      Buffer.from([0x01, 0x02, 0x03, 0x04]), // ...but only 4 are present
    ]);
    const ctx = makeContext(buffer);
    const emit = makeEmit(ctx);
    const innerStub: InnerParser = (_buf, start) => ({ elements: new Map(), endOffset: start });
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: innerStub,
      encapsulatedPixelData: true,
    };
    try {
      parseSequence(buffer, 0, ctx, emit, opts);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      if (err instanceof DicomParseError) {
        expect(err.code).toBe("INVALID_FILE_META");
        expect(err.message).toMatch(/fragment/);
      }
    }
  });
});

describe("parseSequence — truncated input (T-02-04-01)", () => {
  it("throws DicomParseError(INVALID_FILE_META) on truncated item header", () => {
    // Just half of an item header — 4 bytes instead of 8.
    const buffer = Buffer.from([0xfe, 0xff, 0x00, 0xe0]);
    const ctx = makeContext(buffer);
    const emit = makeEmit(ctx);
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: parseImplicitLE,
    };
    expect(() => parseSequence(buffer, 0, ctx, emit, opts)).toThrow(DicomParseError);
  });

  it("throws INVALID_FILE_META when defined-length item exceeds buffer", () => {
    // Item header declares 999 bytes but only 0 bytes follow.
    const buffer = buildItemHeader(999, true);
    const ctx = makeContext(buffer);
    const emit = makeEmit(ctx);
    const opts: ParseSequenceOptions = {
      explicitLength: undefined,
      littleEndian: true,
      innerStrategy: parseImplicitLE,
    };
    try {
      parseSequence(buffer, 0, ctx, emit, opts);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      if (err instanceof DicomParseError) {
        expect(err.code).toBe("INVALID_FILE_META");
      }
    }
  });
});

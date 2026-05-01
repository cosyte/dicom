/**
 * Tests for `parsePart10Header` — Phase 2 plan 02-02 task 1.
 *
 * Covers CONTEXT.md D-13 / D-14 / D-15 + threat T-02-02-02 / T-02-02-03 from
 * the plan threat model.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { DicomParseError } from "./errors.js";
import { parsePart10Header } from "./part10-header.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";
import { WARNING_CODES } from "./warnings.js";

function makeCtx(buffer: Buffer, stripPreamble: "tolerate" | "require" = "tolerate"): {
  ctx: ParseContext;
  emitted: DicomParseWarning[];
} {
  const warnings: DicomParseWarning[] = [];
  const emitted: DicomParseWarning[] = [];
  const ctx: ParseContext = {
    buffer,
    strict: false,
    stripPreamble,
    warnings,
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
  return { ctx, emitted };
}

/** Minimal "looks like (0002,0000) UL length=4" header at offset 0. */
function bareFileMetaPrefix(): Buffer {
  // group=0x0002, element=0x0000, VR='UL', length=0x0004, value=0x000000ce
  return Buffer.from([
    0x02, 0x00, 0x00, 0x00, 0x55, 0x4c, 0x04, 0x00, 0xce, 0x00, 0x00, 0x00,
  ]);
}

describe("parsePart10Header — DICM at offset 128", () => {
  it("returns datasetStart=132, hadPreamble=true and emits no warnings", () => {
    const buf = Buffer.concat([
      Buffer.alloc(128, 0x00),
      Buffer.from("DICM", "ascii"),
      bareFileMetaPrefix(),
    ]);
    const { ctx, emitted } = makeCtx(buf);
    const result = parsePart10Header(buf, ctx, (w) => emitted.push(w));
    expect(result.datasetStart).toBe(132);
    expect(result.hadPreamble).toBe(true);
    expect(ctx.warnings).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });
});

describe("parsePart10Header — stripPreamble='tolerate' (default)", () => {
  it("emits DICOM_MISSING_PREAMBLE and returns datasetStart=0 when bare File Meta is at offset 0", () => {
    const buf = bareFileMetaPrefix();
    const { ctx, emitted } = makeCtx(buf, "tolerate");
    const result = parsePart10Header(buf, ctx, (w) => {
      ctx.warnings.push(w);
      emitted.push(w);
    });
    expect(result.datasetStart).toBe(0);
    expect(result.hadPreamble).toBe(false);
    expect(emitted).toHaveLength(1);
    const w = emitted[0];
    if (w === undefined) throw new Error("expected one warning");
    expect(w.code).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
    expect(w.position.byteOffset).toBe(0);
    expect(w.position.fileMeta).toBeUndefined();
  });
});

describe("parsePart10Header — stripPreamble='require'", () => {
  it("throws NOT_DICOM_PART_10 when DICM magic is absent even with valid bare File Meta", () => {
    const buf = bareFileMetaPrefix();
    const { ctx } = makeCtx(buf, "require");
    expect(() => parsePart10Header(buf, ctx, (w) => ctx.warnings.push(w))).toThrow(
      DicomParseError,
    );
    try {
      parsePart10Header(buf, ctx, (w) => ctx.warnings.push(w));
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("NOT_DICOM_PART_10");
      expect(err.byteOffset).toBe(0);
    }
  });
});

describe("parsePart10Header — non-DICOM input", () => {
  it("throws NOT_DICOM_PART_10 with byteOffset=0 and a non-empty hex snippet for random binary blob", () => {
    const buf = Buffer.alloc(200);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 13 + 7) & 0xff;
    // Defang: ensure first 12 bytes do not coincidentally look like (0002,0000) UL.
    buf[0] = 0xff;
    buf[1] = 0xfe;
    const { ctx } = makeCtx(buf);
    try {
      parsePart10Header(buf, ctx, (w) => ctx.warnings.push(w));
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("NOT_DICOM_PART_10");
      expect(err.byteOffset).toBe(0);
      expect(err.snippet.length).toBeGreaterThan(0);
    }
  });

  it("throws NOT_DICOM_PART_10 (not RangeError) for buffers shorter than 12 bytes — T-02-02-02", () => {
    const buf = Buffer.from([0x02, 0x00]);
    const { ctx } = makeCtx(buf);
    expect(() => parsePart10Header(buf, ctx, (w) => ctx.warnings.push(w))).toThrowError(
      /NOT_DICOM_PART_10/,
    );
  });

  it("throws NOT_DICOM_PART_10 for a fully empty-buffer-like 8-byte input", () => {
    const buf = Buffer.alloc(8);
    const { ctx } = makeCtx(buf);
    expect(() => parsePart10Header(buf, ctx, (w) => ctx.warnings.push(w))).toThrowError(
      /NOT_DICOM_PART_10/,
    );
  });
});

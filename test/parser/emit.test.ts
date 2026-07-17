import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

import { DicomParseError, FATAL_CODES } from "../../src/parser/errors.js";
import { makeEmitter } from "../../src/parser/emit.js";
import type { ParseContext } from "../../src/parser/types.js";
import { WARNING_CODES, type DicomParseWarning } from "../../src/parser/warnings.js";

function makeCtx(overrides: Partial<ParseContext> = {}): ParseContext {
  const base: ParseContext = {
    buffer: Buffer.from([0x44, 0x49, 0x43, 0x4d, 0x00, 0x01, 0x02, 0x03]),
    strict: false,
    stripPreamble: "tolerate",
    warnings: [],
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
  return { ...base, ...overrides };
}

const sampleWarning: DicomParseWarning = {
  code: WARNING_CODES.DICOM_MISSING_PREAMBLE,
  message: "test",
  position: { byteOffset: 0 },
};

describe("makeEmitter (D-03, D-11, D-35)", () => {
  it("lenient mode pushes warning into ctx.warnings", () => {
    const ctx = makeCtx();
    const emit = makeEmitter(ctx);
    emit(sampleWarning);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]?.code).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
  });

  it("D-03 ordering: onWarning fires AFTER push (sees warning already in ctx.warnings)", () => {
    let observedLen = -1;
    const ctx: ParseContext = makeCtx({
      onWarning: () => {
        observedLen = ctx.warnings.length;
      },
    });
    const emit = makeEmitter(ctx);
    emit(sampleWarning);
    expect(observedLen).toBe(1);
  });

  it("throwing onWarning is silently swallowed; subsequent emits still succeed (T-02-01-02)", () => {
    const onWarning = vi.fn(() => {
      throw new Error("boom");
    });
    const ctx = makeCtx({ onWarning });
    const emit = makeEmitter(ctx);
    expect(() => emit(sampleWarning)).not.toThrow();
    expect(() => emit(sampleWarning)).not.toThrow();
    expect(ctx.warnings).toHaveLength(2);
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it("strict mode throws DicomParseError carrying warning code (D-35)", () => {
    const ctx = makeCtx({ strict: true });
    const emit = makeEmitter(ctx);
    expect(() => emit(sampleWarning)).toThrow(DicomParseError);
    try {
      emit(sampleWarning);
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      const e = err as DicomParseError;
      expect(e.code as string).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
      expect(e.byteOffset).toBe(0);
      // First 4 bytes of the test buffer are "DICM" → "44 49 43 4d" lowercase.
      expect(e.snippet.startsWith("44 49 43 4d")).toBe(true);
    }
  });

  it("strict mode does not push to ctx.warnings on throw (no residue)", () => {
    const ctx = makeCtx({ strict: true });
    const emit = makeEmitter(ctx);
    try {
      emit(sampleWarning);
    } catch {
      // expected
    }
    expect(ctx.warnings).toHaveLength(0);
  });

  it("strict mode never invokes onWarning (no callback fires before throw)", () => {
    const onWarning = vi.fn();
    const ctx = makeCtx({ strict: true, onWarning });
    const emit = makeEmitter(ctx);
    try {
      emit(sampleWarning);
    } catch {
      // expected
    }
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("strict-thrown error carries contextPath when warning.position.contextPath is set", () => {
    const ctx = makeCtx({ strict: true });
    const emit = makeEmitter(ctx);
    const w: DicomParseWarning = {
      code: WARNING_CODES.DICOM_VR_MISMATCH,
      message: "vr mismatch",
      position: { byteOffset: 4, contextPath: ["0040A730", "0", "00080100"] },
    };
    try {
      emit(w);
    } catch (err) {
      const e = err as DicomParseError;
      expect(e.contextPath).toEqual(["0040A730", "0", "00080100"]);
      expect(e.message).toContain("… in 0040A730/0/00080100");
    }
  });

  it("FATAL_CODES are not subject to chokepoint — emit only operates on DicomParseWarning", () => {
    // Type-level check: FatalCode and WarningCode are disjoint string literal
    // unions. Runtime smoke: registry has exactly 4 fatal codes.
    expect(Object.keys(FATAL_CODES)).toHaveLength(4);
  });
});

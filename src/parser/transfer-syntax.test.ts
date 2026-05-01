/**
 * Tests for `TRANSFER_SYNTAX_PARSERS` dispatch table — Phase 2 plan 02-02
 * task 2. Covers CONTEXT.md D-20 + threat T-02-02-04.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
  parseDeflatedLE,
  parseExplicitBE,
  parseExplicitLE,
  parseImplicitLE,
  TRANSFER_SYNTAX_PARSERS,
} from "./transfer-syntax.js";
import type { ParseContext } from "./types.js";

function makeCtx(buffer: Buffer): ParseContext {
  return {
    buffer,
    strict: false,
    stripPreamble: "tolerate",
    warnings: [],
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
}

describe("TRANSFER_SYNTAX_PARSERS dispatch table", () => {
  it("contains exactly 4 entries (D-20)", () => {
    expect(Object.keys(TRANSFER_SYNTAX_PARSERS)).toHaveLength(4);
  });

  it("registers each of the 4 v1 transfer syntax UIDs", () => {
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2"]).toBe(parseImplicitLE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1"]).toBe(parseExplicitLE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.2"]).toBe(parseExplicitBE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1.99"]).toBe(parseDeflatedLE);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(TRANSFER_SYNTAX_PARSERS)).toBe(true);
  });

  it("does not register JPEG Baseline or any other v1-out-of-scope UID (T-02-02-04)", () => {
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.4.50"]).toBeUndefined();
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.5"]).toBeUndefined();
  });

  describe("each strategy is callable as a Plan 02-02 stub", () => {
    const buf = Buffer.alloc(0);

    it("parseImplicitLE returns empty elements with no throw", () => {
      const ctx = makeCtx(buf);
      const result = parseImplicitLE(buf, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });

    it("parseExplicitLE returns empty elements with no throw", () => {
      const ctx = makeCtx(buf);
      const result = parseExplicitLE(buf, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });

    it("parseExplicitBE returns empty elements with no throw", () => {
      const ctx = makeCtx(buf);
      const result = parseExplicitBE(buf, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });

    it("parseDeflatedLE returns empty elements with no throw", () => {
      const ctx = makeCtx(buf);
      const result = parseDeflatedLE(buf, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });
  });
});

/**
 * Tests for `TRANSFER_SYNTAX_PARSERS` dispatch table — Phase 2 plan 02-02
 * task 2. Covers CONTEXT.md D-20 + threat T-02-02-04.
 *
 * Plan 02-05 update: all four strategies are now backed by real parsers.
 * The "callable as a stub" suite has been retargeted to assert that each
 * strategy is callable end-to-end on a minimally valid input — an empty
 * Explicit/Implicit-LE/BE buffer parses to an empty element map; an
 * empty deflate stream (the 2-byte raw-deflate empty marker) inflates to
 * zero bytes which then parses to an empty element map.
 */

import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  parseDeflatedLE,
  parseExplicitBE,
  parseExplicitLE,
  parseImplicitLE,
  TRANSFER_SYNTAX_PARSERS,
} from "../../src/parser/transfer-syntax.js";
import type { ParseContext } from "../../src/parser/types.js";

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

  describe("each strategy is callable end-to-end (all four real after plan 02-05)", () => {
    const emptyBuf = Buffer.alloc(0);

    it("parseImplicitLE returns empty elements on empty buffer", () => {
      const ctx = makeCtx(emptyBuf);
      const result = parseImplicitLE(emptyBuf, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });

    it("parseExplicitLE returns empty elements on empty buffer", () => {
      const ctx = makeCtx(emptyBuf);
      const result = parseExplicitLE(emptyBuf, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });

    it("parseExplicitBE returns empty elements on empty buffer", () => {
      const ctx = makeCtx(emptyBuf);
      const result = parseExplicitBE(emptyBuf, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });

    it("parseDeflatedLE inflates an empty raw-deflate stream and parses to empty elements", () => {
      // Empty raw-deflate stream — `deflateRawSync(Buffer.alloc(0))`
      // produces the canonical RFC 1951 empty-stored-block marker. Round
      // trip: inflate yields 0 bytes; parseExplicitLE on 0 bytes yields
      // an empty element map.
      const emptyDeflateStream = deflateRawSync(emptyBuf);
      const ctx = makeCtx(emptyDeflateStream);
      const result = parseDeflatedLE(emptyDeflateStream, 0, ctx, () => undefined);
      expect(result.elements.size).toBe(0);
    });
  });
});

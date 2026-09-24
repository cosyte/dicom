/**
 * Tests for `TRANSFER_SYNTAX_PARSERS` dispatch table - Phase 2 plan 02-02
 * task 2. Covers CONTEXT.md D-20 + threat T-02-02-04.
 *
 * Plan 02-05 update: all four strategies are now backed by real parsers.
 * The "callable as a stub" suite has been retargeted to assert that each
 * strategy is callable end-to-end on a minimally valid input - an empty
 * Explicit/Implicit-LE/BE buffer parses to an empty element map; an
 * empty deflate stream (the 2-byte raw-deflate empty marker) inflates to
 * zero bytes which then parses to an empty element map.
 */

import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { UIDS } from "../../src/dictionary/generated/uids.js";
import { parseDicom } from "../../src/parser/index.js";
import {
  parseDeflatedLE,
  parseExplicitBE,
  parseExplicitLE,
  parseImplicitLE,
  TRANSFER_SYNTAX_PARSERS,
} from "../../src/parser/transfer-syntax.js";
import { DicomParseError, FATAL_CODES, OFFSET_FRAMES } from "../../src/parser/errors.js";
import type { ParseContext } from "../../src/parser/types.js";
import { buildDicom } from "../helpers/build-dicom.js";
import {
  NATIVE_TRANSFER_SYNTAXES,
  registeredTransferSyntaxes,
  sectionA4TransferSyntaxes,
} from "../helpers/ps35-section-a4.js";

/** `true` when `parseDicom` gets past Transfer Syntax dispatch for `uid`. */
function accepts(uid: string): boolean {
  try {
    parseDicom(buildDicom({ transferSyntax: uid, elements: [] }));
    return true;
  } catch (err) {
    if (err instanceof DicomParseError && err.code === FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX) {
      return false;
    }
    throw err;
  }
}

const sortUnits = (xs: Iterable<string>): string[] =>
  [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function makeCtx(buffer: Buffer): ParseContext {
  return {
    frame: { buffer, name: OFFSET_FRAMES.INPUT },
    strict: false,
    stripPreamble: "tolerate",
    warnings: [],
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
}

describe("AC-12: the accepted set is the four native syntaxes plus PS3.5 2026c section A.4", () => {
  // The expectation is read out of the vendored part05.xml (one section located
  // by `xml:id="sect_A.4"`, exactly one match required), never typed here, and
  // the helper that reads it shares no code with the generator it grades.
  const a4 = sectionA4TransferSyntaxes();

  it("AC-12: section A.4 names only non-retired TransferSyntax rows of the generated PS3.6 registry", () => {
    // The extraction is pinned to a size so a regex that silently matched fewer
    // UIDs cannot pass as a smaller, still self-consistent set.
    expect(a4).toHaveLength(35);
    for (const uid of a4) {
      const row = UIDS[uid];
      expect(row?.type, uid).toBe("TransferSyntax");
      expect(row?.retired, uid).toBe(false);
    }
  });

  it("AC-12: parseDicom accepts exactly the native four and the section A.4 set, among every registered Transfer Syntax", () => {
    const expected = sortUnits(new Set([...NATIVE_TRANSFER_SYNTAXES, ...a4]));
    const accepted = sortUnits(registeredTransferSyntaxes().filter((uid) => accepts(uid)));
    expect(accepted).toStrictEqual(expected);
  });

  it("AC-12: the dispatch table registers exactly that set and nothing unregistered", () => {
    // The behavioural sweep above only visits registered UIDs; this row catches
    // a UID added to the table that PS3.6 does not register at all.
    const expected = sortUnits(new Set([...NATIVE_TRANSFER_SYNTAXES, ...a4]));
    expect(sortUnits(Object.keys(TRANSFER_SYNTAX_PARSERS))).toStrictEqual(expected);
  });

  it("AC-12: every section A.4 UID dispatches to the Explicit VR Little Endian reader", () => {
    for (const uid of a4) {
      expect(TRANSFER_SYNTAX_PARSERS[uid], uid).toBe(parseExplicitLE);
    }
  });
});

describe("TRANSFER_SYNTAX_PARSERS dispatch table", () => {
  it("registers each of the 4 v1 transfer syntax UIDs", () => {
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2"]).toBe(parseImplicitLE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1"]).toBe(parseExplicitLE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.2"]).toBe(parseExplicitBE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1.99"]).toBe(parseDeflatedLE);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(TRANSFER_SYNTAX_PARSERS)).toBe(true);
  });

  it("AC-11: does not register JPIP Referenced, SMPTE ST 2110 or a retired JPEG process (T-02-02-04)", () => {
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.4.94"]).toBeUndefined();
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.7.1"]).toBeUndefined();
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.4.52"]).toBeUndefined();
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
      // Empty raw-deflate stream - `deflateRawSync(Buffer.alloc(0))`
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

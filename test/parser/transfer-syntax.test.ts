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
  JPIP_SECTION_IDS,
  NATIVE_TRANSFER_SYNTAXES,
  jpipTransferSyntaxes,
  registeredTransferSyntaxes,
  sectionA4TransferSyntaxes,
  sectionById,
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

describe("AC-11: the accepted set is the native four, PS3.5 2026c section A.4 and the four JPIP Referenced syntaxes", () => {
  // Both expectations are read out of the vendored part05.xml, never typed here:
  // section A.4 by `xml:id="sect_A.4"`, and the JPIP set as the one UID each of
  // sections A.6, A.7, A.11 and A.12 names, each located by its `xml:id` with
  // exactly one match required. The helper shares no code with the generator or
  // with `src/parser/jpip-referenced.ts`, the two lists it grades.
  const a4 = sectionA4TransferSyntaxes();
  const jpip = jpipTransferSyntaxes();

  it("AC-11: section A.4 names only non-retired TransferSyntax rows of the generated PS3.6 registry", () => {
    // The extraction is pinned to a size so a regex that silently matched fewer
    // UIDs cannot pass as a smaller, still self-consistent set.
    expect(a4).toHaveLength(35);
    for (const uid of a4) {
      const row = UIDS[uid];
      expect(row?.type, uid).toBe("TransferSyntax");
      expect(row?.retired, uid).toBe(false);
    }
  });

  it("AC-11: sections A.6, A.7, A.11 and A.12 each name one UID, four non-retired TransferSyntax rows in all", () => {
    // Pinned to four for the same reason; each section is located exactly once.
    for (const id of JPIP_SECTION_IDS) {
      expect(sectionById(id).length, id).toBeGreaterThan(0);
    }
    expect(jpip).toHaveLength(4);
    for (const uid of jpip) {
      const row = UIDS[uid];
      expect(row?.type, uid).toBe("TransferSyntax");
      expect(row?.retired, uid).toBe(false);
      expect(a4, uid).not.toContain(uid);
    }
  });

  it("AC-11: a section located zero times or twice is refused, never first-matched", () => {
    const one = '<section xml:id="sect_A.6"><para>"1.2.840.10008.1.2.4.94"</para></section>';
    expect(sectionById("sect_A.6", one)).toBe(one);
    expect(() => sectionById("sect_A.6", "<section></section>")).toThrow(/exactly one/u);
    expect(() => sectionById("sect_A.6", `${one}${one}`)).toThrow(/exactly one/u);
  });

  it("AC-11: parseDicom accepts exactly the native four, the section A.4 set and the JPIP set, among every registered Transfer Syntax", () => {
    const expected = sortUnits(new Set([...NATIVE_TRANSFER_SYNTAXES, ...a4, ...jpip]));
    const accepted = sortUnits(registeredTransferSyntaxes().filter((uid) => accepts(uid)));
    expect(accepted).toStrictEqual(expected);
  });

  it("AC-11: the dispatch table registers exactly that set and nothing unregistered", () => {
    // The behavioural sweep above only visits registered UIDs; this row catches
    // a UID added to the table that PS3.6 does not register at all.
    const expected = sortUnits(new Set([...NATIVE_TRANSFER_SYNTAXES, ...a4, ...jpip]));
    expect(sortUnits(Object.keys(TRANSFER_SYNTAX_PARSERS))).toStrictEqual(expected);
  });

  it("AC-11: every section A.4 UID dispatches to the Explicit VR Little Endian reader", () => {
    for (const uid of a4) {
      expect(TRANSFER_SYNTAX_PARSERS[uid], uid).toBe(parseExplicitLE);
    }
  });

  it("AC-11, AC-8: sections A.6 and A.11 go to the Explicit VR LE reader, A.7 and A.12 to the capped Deflated reader", () => {
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.4.94"]).toBe(parseExplicitLE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.4.204"]).toBe(parseExplicitLE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.4.95"]).toBe(parseDeflatedLE);
    expect(TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.4.205"]).toBe(parseDeflatedLE);
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

/**
 * Phase 2 capstone — security-vector sweep across plans 02-01..02-05.
 *
 * Each `describe` block targets a STRIDE threat declared in a prior plan's
 * threat model and asserts that the documented mitigation activates
 * correctly under adversarial input. All fixtures are programmatically
 * built — no curated `.dcm` PHI files (D-38).
 *
 * Coverage map (by threat ID):
 *   - T-02-01-06, T-02-02-01, T-02-04-01 — buffer over-read on truncated
 *     input (Implicit-LE / Explicit-LE / Explicit-BE / Deflated-LE).
 *   - T-02-04-02 — SQ stack-overflow protection at the 64-depth cap.
 *   - T-02-04-03 — CP-246 pathological-input bound (CPU DoS).
 *   - T-02-05-01 — decompression-bomb cap (256 MiB default; 1 KiB override).
 *   - T-02-01-04 / T-02-05-04 — `copyValues` opt-out for Buffer-slice
 *     retention (heap pressure).
 *
 * @module
 */

import { performance } from "node:perf_hooks";
import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomParseError,
  FATAL_CODES,
  parseDicom,
  WARNING_CODES,
  type Element,
} from "../../src/index.js";
import { parseDeflatedLEWithCap } from "../../src/parser/deflated-le.js";
import type { Tag } from "../../src/dictionary/types.js";
import { makeEmitter } from "../../src/parser/emit.js";
import type { ParseContext } from "../../src/parser/types.js";
import { buildDicom } from "../helpers/build-dicom.js";

// ---------------------------------------------------------------------------
// Test-only structural accessor for parsed Dataset._elements (mirrors the
// pattern used in src/parser/implicit-le.test.ts + explicit-le.test.ts).
// ---------------------------------------------------------------------------

interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}

function elementsOf(ds: object): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

// ===========================================================================
// T-02-01-06 / T-02-02-01 / T-02-04-01 / T-02-05-02 — buffer over-read on
// truncated input. Every cursor read across all four parsers is wrapped
// such that a buffer overflow surfaces as a typed `DicomParseError` —
// never a raw `RangeError`.
// ===========================================================================

describe("Security: buffer over-read on truncated input (T-02-01-06, T-02-02-01, T-02-04-01)", () => {
  it("truncated File Meta (declared > buffer remaining) throws INVALID_FILE_META", () => {
    // Fixture: declare a 10_000-byte File Meta group with only ~30 bytes
    // actually present after the group-length element. Mirrors the
    // T-02-02-01 unit-test fixture in src/parser/file-meta.test.ts.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
      fileMetaGroupLength: 10_000,
    });
    let thrown: unknown;
    try {
      parseDicom(buf);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    expect((thrown as DicomParseError).code).toBe(FATAL_CODES.INVALID_FILE_META);
  });

  it("truncated Implicit-LE dataset throws DicomParseError (not RangeError)", () => {
    const buf = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        {
          tag: "00100010",
          vr: "PN",
          value: Buffer.from("A".repeat(100), "ascii"),
        },
      ],
    });
    // Chop 50 bytes off the end — declared element length now overruns
    // the available buffer.
    const truncated = buf.subarray(0, buf.length - 50);
    let thrown: unknown;
    try {
      parseDicom(truncated);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    // Truncations inside the dataset are reported as INVALID_FILE_META by
    // the per-TS parsers (the cursor catch-and-rethrow path).
    expect((thrown as DicomParseError).code).toBe(FATAL_CODES.INVALID_FILE_META);
  });

  it("truncated Explicit-LE dataset throws DicomParseError", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("A".repeat(100), "ascii") }],
    });
    const truncated = buf.subarray(0, buf.length - 50);
    let thrown: unknown;
    try {
      parseDicom(truncated);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    expect((thrown as DicomParseError).code).toBe(FATAL_CODES.INVALID_FILE_META);
  });

  it("truncated Explicit-BE dataset throws DicomParseError", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("A".repeat(100), "ascii") }],
    });
    const truncated = buf.subarray(0, buf.length - 50);
    let thrown: unknown;
    try {
      parseDicom(truncated);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    expect((thrown as DicomParseError).code).toBe(FATAL_CODES.INVALID_FILE_META);
  });

  it("truncated Deflated-LE buffer throws DicomParseError (T-02-05-02 stream corruption)", () => {
    // Build a valid Deflated-LE buffer, then truncate inside the deflate
    // stream — `inflateRawSync` will raise, the parser converts to
    // INVALID_FILE_META.
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const truncated = buf.subarray(0, buf.length - 4);
    let thrown: unknown;
    try {
      parseDicom(truncated);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    expect((thrown as DicomParseError).code).toBe(FATAL_CODES.INVALID_FILE_META);
  });
});

// ===========================================================================
// T-02-04-02 — SQ stack-overflow protection. NESTING_DEPTH_LIMIT = 64 in
// `parseSequence`. Plan 02-04 ships unit tests at the parseSequence level;
// this end-to-end test asserts the cap activates for a real `parseDicom`
// call carrying a 65-deep SQ tree.
// ===========================================================================

describe("Security: SQ stack-overflow protection — 64-depth cap (T-02-04-02)", () => {
  /** Build an SQ-element JSON shape `depth` levels deep. */
  function buildNestedSqShape(depth: number): {
    tag: Tag;
    items: { elements: unknown[] }[];
  } {
    if (depth === 0) {
      return { tag: "0040A730", items: [{ elements: [] }] };
    }
    return {
      tag: "0040A730",
      items: [{ elements: [buildNestedSqShape(depth - 1)] }],
    };
  }

  it("65-level deeply-nested SQ throws DicomParseError(INVALID_FILE_META) with 'depth exceeds 64' message", () => {
    // 65 `parseSequence` invocations nested — depth-66 push would trigger
    // the cap. Constructing 64-deep means the check at the next descent
    // (depth=65) fires.
    const elements = [buildNestedSqShape(65)];
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: elements as never,
    });
    let thrown: unknown;
    try {
      parseDicom(buf);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    const e = thrown as DicomParseError;
    expect(e.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(e.message).toMatch(/depth exceeds 64/i);
  });

  it("32-level deeply-nested SQ parses successfully (well below the cap)", () => {
    const elements = [buildNestedSqShape(32)];
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: elements as never,
    });
    expect(() => parseDicom(buf)).not.toThrow();
  });
});

// ===========================================================================
// T-02-04-03 — CP-246 pathological-input bound. tryParseUnAsSQ saves and
// restores parser state on inner-parse failure; the descent must complete
// in bounded time even for adversarial UN-undefined-length payloads.
// ===========================================================================

describe("Security: CP-246 pathological-input bound (T-02-04-03)", () => {
  it("UN-undefined-length with 1 KiB of adversarial random bytes parses cleanly within 1s", () => {
    // Build adversarial inner bytes: 1 KiB of pseudo-random content with
    // FFFE markers scattered throughout to confuse the SQ-descent path.
    const adversarial = Buffer.alloc(1024);
    // Deterministic PRNG-ish fill (no crypto dep needed).
    let seed = 0x9e3779b9;
    for (let i = 0; i < adversarial.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      adversarial[i] = seed & 0xff;
    }
    // Sprinkle FFFE markers at offsets 100, 300, 500.
    for (const off of [100, 300, 500]) {
      adversarial.writeUInt16LE(0xfffe, off);
      adversarial.writeUInt16LE(0xe000, off + 2);
      adversarial.writeUInt32LE(0x1000_0000, off + 4); // bogus huge length
    }

    // Build a valid Part 10 buffer + manually-appended UN-undefined-length
    // element carrying the adversarial payload. Use a private tag so the
    // VR-mismatch check is skipped (TOL-08 only fires for standard tags).
    const wrapper = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
    });
    const tag = Buffer.from([0x09, 0x00, 0x00, 0x10]); // (0009,1000) private LE
    const unVr = Buffer.from("UN", "ascii");
    const reserved = Buffer.from([0x00, 0x00]);
    const undefLen = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const unElement = Buffer.concat([tag, unVr, reserved, undefLen, adversarial]);
    const buf = Buffer.concat([wrapper, unElement]);

    const start = performance.now();
    const ds = parseDicom(buf);
    const elapsed = performance.now() - start;

    // Bound: must complete well under 1s on commodity hardware.
    expect(elapsed).toBeLessThan(1000);
    // CP-246 descent on adversarial input fails → element stored as VR=UN
    // per D-30 ("restore VR=UN with raw bytes preserved"). No
    // DICOM_UN_PARSED_AS_SQ warning emitted on failure.
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ)).toBe(false);
    const el = elementsOf(ds).get("00091000");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("UN");
  });
});

// ===========================================================================
// T-02-05-01 — Decompression bomb. Default cap is 256 MiB; the parser
// re-exports `parseDeflatedLEWithCap` for tractable bomb-cap tests at a
// 1 KiB cap. Plan 02-05 ships the unit-level test; this re-asserts the
// mitigation is reachable from the public surface and the typed throw
// carries the expected fields.
// ===========================================================================

describe("Security: decompression-bomb cap (T-02-05-01)", () => {
  it("1 KiB cap on a 2 KiB-inflated payload throws INVALID_FILE_META with 'exceeds' + cap value", () => {
    // Build a Deflated-LE buffer whose inflated size is ~2 KiB.
    const repeating = Buffer.alloc(2048, 0x41); // 2 KiB of 'A'
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "PN", value: repeating }],
    });

    // Locate datasetStart by parsing File Meta only (skipping the dataset)
    // is overkill — instead, assemble a fresh ParseContext + outer emitter
    // and call parseDeflatedLEWithCap directly with the 1 KiB cap.
    // The deflate stream begins after File Meta; the simplest reach for
    // datasetStart is to parse the Part-10 frame ourselves. For test
    // simplicity, locate the deflate stream by scanning for the (0002)
    // group-length offset and walking forward past File Meta.
    const datasetStart = findDatasetStart(buf);

    const innerCtx: ParseContext = {
      buffer: buf,
      strict: false,
      stripPreamble: "tolerate",
      warnings: [],
      creators: new Map(),
      encodingContextStack: ["Root"],
      nestingDepth: 0,
      copyValues: false,
    };
    const emit = makeEmitter(innerCtx);

    let thrown: unknown;
    try {
      parseDeflatedLEWithCap(buf, datasetStart, innerCtx, emit, 1024);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    const e = thrown as DicomParseError;
    expect(e.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(e.message).toMatch(/exceeds/);
    expect(e.message).toMatch(/1024/);
    expect(e.byteOffset).toBe(datasetStart);
  });
});

/**
 * Locate the offset where the dataset (post File Meta) starts. Used by the
 * decompression-bomb test to call `parseDeflatedLEWithCap` directly with a
 * tractable cap. Implements a minimal walk: 132 (preamble + DICM) + the
 * declared `(0002,0000)` group-length value.
 */
function findDatasetStart(buf: Buffer): number {
  // Preamble + DICM = 132 bytes. (0002,0000) UL element starts there.
  const fileMetaHeaderStart = 132;
  // (0002,0000) UL header layout: 2 (group) + 2 (element) + 2 (VR) +
  // 2 (length) + 4 (value) = 12 bytes. Value is the FM group length in LE.
  const groupLenValueOffset = fileMetaHeaderStart + 8;
  const fmGroupLength = buf.readUInt32LE(groupLenValueOffset);
  return fileMetaHeaderStart + 12 + fmGroupLength;
}

// ===========================================================================
// T-02-01-04 / T-02-05-04 — Buffer-slice retention. Default `copyValues:
// false` makes Element.rawBytes a Buffer.subarray view that pins the source
// ArrayBuffer; `copyValues: true` opts into Buffer.from(slice) so the
// source can be released. Verified by mutating the source buffer post-parse
// and observing whether parsed Elements see the change (D-16 / MODEL-03).
// ===========================================================================

describe("Security: Buffer-slice retention (T-02-01-04 / T-02-05-04 / D-16)", () => {
  it("copyValues=false (default): rawBytes is a view; mutating the source mutates the parsed Element", () => {
    const value = Buffer.from("DOE^JANE", "ascii");
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value }],
    });
    const ds = parseDicom(buf); // default copyValues=false
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    if (el === undefined) return;
    expect(el.rawBytes.toString("ascii")).toBe("DOE^JANE");

    // Find the value bytes in the source and mutate them.
    const valueOffset = buf.indexOf(value);
    expect(valueOffset).toBeGreaterThan(0);
    buf[valueOffset] = "X".charCodeAt(0); // replace 'D' with 'X'

    // With zero-copy view, the parsed Element observes the mutation.
    expect(el.rawBytes.toString("ascii")).toBe("XOE^JANE");
  });

  it("copyValues=true: rawBytes is detached; mutating the source does NOT mutate the parsed Element", () => {
    const value = Buffer.from("DOE^JANE", "ascii");
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value }],
    });
    const ds = parseDicom(buf, { copyValues: true });
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    if (el === undefined) return;
    expect(el.rawBytes.toString("ascii")).toBe("DOE^JANE");

    const valueOffset = buf.indexOf(value);
    expect(valueOffset).toBeGreaterThan(0);
    buf[valueOffset] = "X".charCodeAt(0);

    // With copy, the parsed Element keeps its own bytes.
    expect(el.rawBytes.toString("ascii")).toBe("DOE^JANE");
  });

  it("copyValues=true under Deflated-LE: rawBytes detached from inflated buffer (T-02-05-04)", () => {
    const value = Buffer.from("DEFLATE^TEST", "ascii");
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "PN", value }],
    });
    const dsCopy = parseDicom(buf, { copyValues: true });
    const dsView = parseDicom(buf, { copyValues: false });
    const elCopy = elementsOf(dsCopy).get("00100010");
    const elView = elementsOf(dsView).get("00100010");
    expect(elCopy).toBeDefined();
    expect(elView).toBeDefined();
    if (elCopy === undefined || elView === undefined) return;

    // Both yield the same value bytes regardless of copy mode.
    expect(elCopy.rawBytes.toString("ascii")).toBe("DEFLATE^TEST");
    expect(elView.rawBytes.toString("ascii")).toBe("DEFLATE^TEST");
    // The underlying ArrayBuffers differ — copyValues=true detaches into a
    // fresh allocation (Buffer.from), copyValues=false views the inflated
    // buffer (Buffer.subarray).
    expect(elCopy.rawBytes.buffer).not.toBe(elView.rawBytes.buffer);
  });
});

// ===========================================================================
// PHI-fixture invariant (D-38). Phase 2 commits zero curated DICOM fixtures.
// The PHI-scan CI hook (Phase 1) gates against this on every commit; this
// test re-asserts the structural rule for visibility.
// ===========================================================================

describe("Security: D-38 — Phase 2 ships zero curated DICOM fixtures", () => {
  it("no .dcm files exist under test/integration/", async () => {
    const { readdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const here = path.dirname(new URL(import.meta.url).pathname);
    const entries = await readdir(here);
    const dcmFiles = entries.filter((name) => name.endsWith(".dcm"));
    expect(dcmFiles).toEqual([]);
  });
});

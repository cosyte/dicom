/**
 * Fuzz property test — the load-bearing byte-parser invariant.
 *
 * A DICOM parser is fed bytes from untrusted sources (disk, the wire, a PACS).
 * The hard guarantee is robustness: for ANY input buffer — pure random noise,
 * DICOM-shaped garbage, or a random truncation of a valid file — `parseDicom`
 * must
 *
 *   1. never throw an UNEXPECTED error (only a sanctioned `DicomParseError`
 *      carrying one of the four Tier-3 fatal codes may escape; a raw
 *      `RangeError`/`TypeError` from an unchecked buffer read is a bug);
 *   2. never hang (each case is wall-clock-bounded);
 *   3. never OOM (the parser's bounded accumulators — the 256 MiB deflate-bomb
 *      cap and the 64-deep SQ nesting cap — keep memory finite; fuzz inputs are
 *      small so a blow-up would surface as the time bound tripping or an
 *      allocation throw, neither of which is a sanctioned fatal).
 *
 * This complements (does not duplicate) the example-based adversarial coverage
 * in `test/integration/parser-security.test.ts` (specific truncation /
 * stack-overflow / decompression-bomb / CP-246 fixtures): this file sweeps
 * *thousands* of unstructured buffers to catch the cases no one thought to pin.
 *
 * @module
 */

import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { DicomParseError, FATAL_CODES, parseDicom } from "../../src/index.js";

import {
  arbitraryBytes,
  dicomShapedGarbage,
  fuzzInput,
  truncatedValidFile,
} from "./_arbitraries.js";

/** Stable, generous run budget — fuzz wants volume. */
const NUM_RUNS = 2000;

/** Per-case wall-clock ceiling (ms). A parse that exceeds this is a hang/DoS. */
const PER_CASE_BUDGET_MS = 250;

/** The four sanctioned Tier-3 fatal codes — the ONLY codes allowed to throw. */
const FATAL_CODE_SET: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));

/**
 * Parse `bytes` and assert the robustness contract for a single case:
 *   - any throw is a `DicomParseError` with a registered Tier-3 fatal code;
 *   - the call returns within {@link PER_CASE_BUDGET_MS}.
 * Returns `true` so it composes inside `fc.property`.
 */
function parseIsRobust(bytes: Buffer): boolean {
  const start = performance.now();
  try {
    parseDicom(bytes);
  } catch (err) {
    // The ONLY sanctioned escape: a DicomParseError carrying a Tier-3 code.
    if (!(err instanceof DicomParseError)) {
      throw new Error(
        `fuzz: parseDicom threw a non-DicomParseError (${describeThrown(err)}) on ${bytes.length} bytes: ${hexPreview(bytes)}`,
        { cause: err },
      );
    }
    if (!FATAL_CODE_SET.has(err.code)) {
      throw new Error(
        `fuzz: parseDicom threw an unregistered fatal code ${JSON.stringify(err.code)} on ${bytes.length} bytes: ${hexPreview(bytes)}`,
        { cause: err },
      );
    }
    // A thrown fatal must still carry positional context (TOL-02).
    if (typeof err.byteOffset !== "number" || !Number.isFinite(err.byteOffset)) {
      throw new Error(`fuzz: fatal ${err.code} has a non-finite byteOffset`, { cause: err });
    }
  }
  const elapsed = performance.now() - start;
  if (elapsed > PER_CASE_BUDGET_MS) {
    throw new Error(
      `fuzz: parseDicom took ${elapsed.toFixed(1)}ms (> ${String(PER_CASE_BUDGET_MS)}ms) on ${bytes.length} bytes — possible hang/DoS: ${hexPreview(bytes)}`,
    );
  }
  return true;
}

/** First 32 bytes as hex, for a readable counterexample. */
function hexPreview(buf: Buffer): string {
  return buf.subarray(0, 32).toString("hex");
}

/** Render a thrown value without assuming it is an Error. */
function describeThrown(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

describe("dicom conformance: fuzz — arbitrary bytes never crash, hang, or OOM the parser", () => {
  it("pure random byte buffers only ever throw a sanctioned Tier-3 fatal", () => {
    fc.assert(fc.property(arbitraryBytes(), parseIsRobust), { numRuns: NUM_RUNS });
  });

  it("DICOM-shaped garbage (valid preamble + DICM, then noise) is parsed robustly", () => {
    fc.assert(fc.property(dicomShapedGarbage(), parseIsRobust), { numRuns: NUM_RUNS });
  });

  it("random truncations of valid files (all 4 transfer syntaxes) are parsed robustly", () => {
    fc.assert(fc.property(truncatedValidFile(), parseIsRobust), { numRuns: NUM_RUNS });
  });

  it("the combined fuzz corpus never escapes the robustness contract", () => {
    fc.assert(fc.property(fuzzInput(), parseIsRobust), { numRuns: NUM_RUNS });
  });

  it("strict mode on arbitrary bytes also only throws DicomParseError (escalation stays typed)", () => {
    // Strict mode escalates every Tier-2 warning to a throw; the thrown error is
    // still a DicomParseError (carrying the warning code per D-35). So under
    // fuzz, strict mode must never produce a non-DicomParseError either.
    fc.assert(
      fc.property(dicomShapedGarbage(), (bytes) => {
        try {
          parseDicom(bytes, { strict: true });
        } catch (err) {
          expect(err).toBeInstanceOf(DicomParseError);
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

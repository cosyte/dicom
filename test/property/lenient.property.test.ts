/**
 * Lenient-mode property test - the Postel's-Law *parse* side, via the shared
 * `@cosyte/test-utils` `lenientNeverThrowsProperty` runner.
 *
 * The contract (parser/index.ts + emit.ts + errors.ts): in lenient (default)
 * mode `parseDicom` may throw ONLY a `DicomParseError` carrying one of the four
 * Tier-3 fatal codes (`EMPTY_INPUT`, `NOT_DICOM_PART_10`, `INVALID_FILE_META`,
 * `UNSUPPORTED_TRANSFER_SYNTAX`). Every other deviation - missing preamble,
 * group-length mismatch/missing, odd-length value, retired group-length,
 * non-zero reserved bytes, undefined-length under Explicit VR, empty SQ item,
 * trailing junk, even arbitrary bytes - must be recovered into `ds.warnings`,
 * never thrown.
 *
 * Wiring to dicom's real shapes:
 *   - isFatal       → `err instanceof DicomParseError && FATAL_CODES has err.code`
 *   - getWarnings   → `(ds) => ds.warnings`  (the frozen DicomParseWarning[])
 *   - isKnownCode   → membership in `WARNING_CODES`
 *   - hasPositional → `w.position.byteOffset` is a finite number (TOL-02)
 *
 * Depth and seed come from `COSYTE_PROPERTY_RUNS` and `COSYTE_PROPERTY_SEED`
 * (`test/helpers/property.ts`): 100 cases on a pull request, 10,000 nightly,
 * each property's seed printed before it runs.
 *
 * @module
 */

import { describe, it } from "vitest";
import { lenientNeverThrowsProperty } from "@cosyte/test-utils";

import {
  DicomParseError,
  FATAL_CODES,
  WARNING_CODES,
  parseDicom,
  type DicomParseWarning,
  type Dataset,
} from "../../src/index.js";

import { propertyRun } from "../helpers/property.js";

import { arbitraryBytes, recoverableInput, truncatedValidFile } from "./_arbitraries.js";

/** The only throwable codes - the four Tier-3 fatals. */
const FATAL_CODE_SET: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));

/** The full Tier-2 warning-code registry. */
const WARNING_CODE_SET: ReadonlySet<string> = new Set(Object.values(WARNING_CODES));

/** Only a `DicomParseError` carrying a registered Tier-3 code may escape. */
function isFatal(err: unknown): boolean {
  return err instanceof DicomParseError && FATAL_CODE_SET.has(err.code);
}

/** Read the frozen warnings array off a parsed Dataset. */
function getWarnings(parsed: unknown): readonly DicomParseWarning[] {
  return (parsed as Dataset).warnings;
}

/** A warning carries positional context when `position.byteOffset` is finite. */
function hasPositionalContext(w: { readonly position?: unknown }): boolean {
  if (typeof w.position !== "object" || w.position === null) return false;
  const off = (w.position as { byteOffset?: unknown }).byteOffset;
  return typeof off === "number" && Number.isFinite(off);
}

describe("dicom conformance: lenient mode never throws except sanctioned Tier-3 fatals", () => {
  it("recoverable/quirky/garbage input either parses or throws a Tier-3 fatal - nothing else", () => {
    const { seed } = propertyRun("lenient: recoverable input");
    lenientNeverThrowsProperty({
      arbitrary: recoverableInput(),
      parse: (raw: Buffer) => parseDicom(raw),
      isFatal,
      getWarnings,
      isKnownCode: (code) => WARNING_CODE_SET.has(code),
      hasPositionalContext,
      seed,
    });
  });

  it("pure random byte buffers never throw a non-fatal / non-DicomParseError", () => {
    const { seed } = propertyRun("lenient: random bytes");
    lenientNeverThrowsProperty({
      arbitrary: arbitraryBytes(),
      parse: (raw: Buffer) => parseDicom(raw),
      isFatal,
      getWarnings,
      isKnownCode: (code) => WARNING_CODE_SET.has(code),
      hasPositionalContext,
      seed,
    });
  });

  it("random truncations of valid files recover or throw a sanctioned fatal", () => {
    const { seed } = propertyRun("lenient: truncated files");
    lenientNeverThrowsProperty({
      arbitrary: truncatedValidFile(),
      parse: (raw: Buffer) => parseDicom(raw),
      isFatal,
      getWarnings,
      isKnownCode: (code) => WARNING_CODE_SET.has(code),
      hasPositionalContext,
      seed,
    });
  });
});

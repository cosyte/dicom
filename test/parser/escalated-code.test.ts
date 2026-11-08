/**
 * An escalated warning is thrown as a `DicomParseError` whose `code` is the
 * warning's own code, and the type of `DicomParseError.code` admits it.
 *
 * Both escalation routes go through the one `emit` chokepoint: `{ strict: true }`
 * escalates every Tier-2 code, and a profile's `escalate` list the codes it
 * names. The runtime half asserts the thrown code on each route; the type half
 * is checked by `pnpm typecheck`, which covers `test/**`, so narrowing
 * `DicomParseError.code` back to `FatalCode` turns this file red there.
 */

import { Buffer } from "node:buffer";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DicomParseError,
  FATAL_CODES,
  WARNING_CODES,
  defineProfile,
  parseDicom,
  type FatalCode,
  type ParseOptions,
  type WarningCode,
} from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

/** A synthetic object with no preamble: its only deviation is `DICOM_MISSING_PREAMBLE`. */
function noPreamble(): Buffer {
  return buildDicom({ transferSyntax: "1.2.840.10008.1.2.1", elements: [], skipPreamble: true });
}

function thrownBy(opts: ParseOptions): DicomParseError {
  try {
    parseDicom(noPreamble(), opts);
  } catch (err) {
    if (err instanceof DicomParseError) return err;
    throw err;
  }
  throw new Error("expected parseDicom to throw");
}

describe("an escalated warning keeps its own code on DicomParseError", () => {
  it("the fixture's lenient reading raises exactly the warning escalated below", () => {
    expect(parseDicom(noPreamble()).warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.DICOM_MISSING_PREAMBLE,
    ]);
  });

  it("{ strict: true } throws the warning's code, outside FATAL_CODES", () => {
    const err = thrownBy({ strict: true });
    expect(err.code).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
    expect(err.code in FATAL_CODES).toBe(false);
    expect(err.message.startsWith("[DICOM_MISSING_PREAMBLE] ")).toBe(true);
  });

  it("a profile's escalate list throws the warning's code, outside FATAL_CODES", () => {
    const profile = defineProfile({
      name: "escalate-missing-preamble",
      escalate: [WARNING_CODES.DICOM_MISSING_PREAMBLE],
    });
    const err = thrownBy({ profile });
    expect(err.code).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
    expect(err.code in FATAL_CODES).toBe(false);
  });

  it("a fatal still throws one of the four fatal codes", () => {
    let code: unknown;
    try {
      parseDicom(Buffer.alloc(0), { strict: true });
    } catch (err) {
      if (err instanceof DicomParseError) code = err.code;
    }
    expect(code).toBe(FATAL_CODES.EMPTY_INPUT);
  });

  it("the type of DicomParseError.code is FatalCode | WarningCode", () => {
    expectTypeOf<DicomParseError["code"]>().toEqualTypeOf<FatalCode | WarningCode>();

    const err = thrownBy({ strict: true });
    // An escalated warning's code is assignable without a cast...
    const asWarning: FatalCode | WarningCode = err.code;
    // ...and the type no longer claims every code is a fatal one.
    // @ts-expect-error - DicomParseError.code also carries escalated warning codes.
    const asFatal: FatalCode = err.code;
    expect([asWarning, asFatal]).toEqual([
      WARNING_CODES.DICOM_MISSING_PREAMBLE,
      WARNING_CODES.DICOM_MISSING_PREAMBLE,
    ]);
  });

  it("a switch over the code reaches its default branch for an escalated warning", () => {
    function classify(code: DicomParseError["code"]): string {
      // The documented pattern for an open union is a default branch, which this
      // repo's lint rule does not count as exhaustive.
      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
      switch (code) {
        case FATAL_CODES.EMPTY_INPUT:
        case FATAL_CODES.NOT_DICOM_PART_10:
        case FATAL_CODES.INVALID_FILE_META:
        case FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX:
          return "fatal";
        default:
          return `escalated ${code}`;
      }
    }
    expect(classify(thrownBy({ strict: true }).code)).toBe("escalated DICOM_MISSING_PREAMBLE");
  });
});

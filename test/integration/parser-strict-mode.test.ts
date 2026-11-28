/**
 * The strict-mode escalation pair-test gate.
 *
 * Every Tier-2 code the structural parse *actively emits* (the active-emit
 * list below) MUST have a strict-mode pair test. Lenient mode emits the
 * warning AND parsing continues; strict mode throws a `DicomParseError`
 * carrying the matching code through the single emit chokepoint.
 *
 * CI fails if any actively-emitted code lacks the pair.
 *
 * Status of the codes:
 *   - Most are real pair tests authored below.
 *   - `DICOM_PIXEL_DATA_LENGTH_MISMATCH` is `it.todo`: the post-pass that
 *     emits this code is not yet implemented (the factory and registry slot
 *     exist, but no emission site fires under any input).
 *
 * A "no missing fixtures" gate test verifies the
 * authored fixture list covers every code in `ACTIVE_CODES` (less the
 * documented `it.todo` exception); regressions surface immediately.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { DicomParseError, parseDicom, WARNING_CODES, type WarningCode } from "../../src/index.js";
import { buildDicom } from "../_helpers/build-dicom.js";

// -- Active-emit list --------------------------------------------------

const ACTIVE_CODES: readonly WarningCode[] = [
  WARNING_CODES.DICOM_MISSING_PREAMBLE,
  WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
  WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH,
  WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED,
  WARNING_CODES.DICOM_VR_MISMATCH,
  WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR,
  WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET,
  WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES,
  WARNING_CODES.DICOM_UN_PARSED_AS_SQ,
  WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE,
  WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH, // see it.todo below - post-pass deferred
  WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR,
] as const;

/**
 * Codes that intentionally do not have a real strict-mode pair test in
 * this file. Every entry must say why in a comment and have an `it.todo`
 * placeholder below so the gap is
 * visible at every test-suite run.
 */
const DEFERRED_CODES: ReadonlySet<WarningCode> = new Set<WarningCode>([
  //  post-pass not yet implemented (no emit site exists in src/).
  WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH,
  // CP-246 strict-mode escalation regression: `tryParseUnAsSQ` (sequence.ts)
  // wraps the descent in a try/catch that swallows ANY thrown error,
  // including the `DicomParseError` raised by the strict-mode emit chokepoint.
  // Under strict mode the parser therefore falls back to UN silently instead
  // of escalating `DICOM_UN_PARSED_AS_SQ` to a throw. Lenient-mode emission
  // works correctly (the `lenient mode` half of this pair is a real test).
  WARNING_CODES.DICOM_UN_PARSED_AS_SQ,
]);

// -- TS UIDs ------------------------------------------------------------------

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

// -- Pair-fixture shape -------------------------------------------------------

interface PairFixture {
  readonly code: WarningCode;
  readonly buildBuffer: () => Buffer;
}

// -- Hand-crafted fixture builders --------------------------------------------

/**
 * Build a Part-10 buffer carrying a long-form OB element with non-zero
 * reserved bytes (0x01 0x02 instead of 0x00 0x00). Mirrors the
 * `parseExplicitLE - DICOM_NONZERO_RESERVED_BYTES` unit test fixture so
 * the pair test exercises the same emission site.
 */
function buildNonzeroReservedBytesFixture(): Buffer {
  const preamble = Buffer.alloc(128, 0x00);
  const dicm = Buffer.from("DICM", "ascii");
  // File Meta - (0002,0000) UL group length + (0002,0010) UI TS UID = ELE_LE.
  const fmTsValue = Buffer.from(`${TS_EXPLICIT_LE}\0`, "ascii");
  const fmTsLen = Buffer.alloc(2);
  fmTsLen.writeUInt16LE(fmTsValue.length, 0);
  const fmTs = Buffer.concat([
    Buffer.from([0x02, 0x00, 0x10, 0x00, 0x55, 0x49]), // (0002,0010) UI
    fmTsLen,
    fmTsValue,
  ]);
  const fmGroupLenValue = Buffer.alloc(4);
  fmGroupLenValue.writeUInt32LE(fmTs.length, 0);
  const fmGroupLen = Buffer.concat([
    Buffer.from([0x02, 0x00, 0x00, 0x00, 0x55, 0x4c, 0x04, 0x00]), // (0002,0000) UL len=4
    fmGroupLenValue,
  ]);
  // Bad-reserved-bytes OB element (7FE0,0010).
  const badOb = Buffer.concat([
    Buffer.from([0xe0, 0x7f, 0x10, 0x00]), // (7FE0,0010) LE
    Buffer.from("OB", "ascii"),
    Buffer.from([0x01, 0x02]), // <-- non-zero reserved
    Buffer.from([0x04, 0x00, 0x00, 0x00]), // length=4 LE
    Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]),
  ]);
  return Buffer.concat([preamble, dicm, fmGroupLen, fmTs, badOb]);
}

/**
 * Build a Part-10 buffer with a CP-246 fixture: a UN-undefined-length
 * element wrapping a valid Implicit-VR-LE-encoded SQ payload (one empty
 * defined-length item + SeqDelim). Parser must descend successfully and
 * emit `DICOM_UN_PARSED_AS_SQ`.
 *
 * Uses a **private** outer tag `(0009,1000)` instead of a standard SQ tag
 * like `(0040,A730)` - private tags have no dictionary entry, so the
 * VR-mismatch check is skipped. Under strict mode the parser
 * therefore throws on the CP-246 emit (the only Tier-2 it sees) rather
 * than on a preceding `DICOM_VR_MISMATCH`. Private-creator tracking is
 * Implicit-only - Explicit-VR parsers don't emit `DICOM_PRIVATE_TAG_NO_CREATOR`
 * for missing creators, so the outer tag does not need a creator slot.
 */
function buildCp246Fixture(): Buffer {
  // Inner Implicit-LE SQ payload: SeqDelim only (zero items). A defined-length
  // empty item would emit DICOM_EMPTY_ITEM_IN_SEQUENCE during the descent,
  // which strict-mode would escalate before reaching the CP-246 emit point.
  const seqDelim = Buffer.alloc(8);
  seqDelim.writeUInt16LE(0xfffe, 0);
  seqDelim.writeUInt16LE(0xe0dd, 2);
  seqDelim.writeUInt32LE(0, 4);
  const sqPayload = seqDelim;

  // Outer UN-undefined-length element header for private tag (0009,1000)
  // under Explicit-LE. Group=0x0009 (odd → private), element=0x1000.
  const tag = Buffer.from([0x09, 0x00, 0x00, 0x10]);
  const unVr = Buffer.from("UN", "ascii");
  const reserved = Buffer.from([0x00, 0x00]);
  const undefLen = Buffer.from([0xff, 0xff, 0xff, 0xff]);
  const unElement = Buffer.concat([tag, unVr, reserved, undefLen, sqPayload]);

  // File Meta wrapper.
  const preamble = Buffer.alloc(128, 0x00);
  const dicm = Buffer.from("DICM", "ascii");
  const fmTsValue = Buffer.from(`${TS_EXPLICIT_LE}\0`, "ascii");
  const fmTsLen = Buffer.alloc(2);
  fmTsLen.writeUInt16LE(fmTsValue.length, 0);
  const fmTs = Buffer.concat([
    Buffer.from([0x02, 0x00, 0x10, 0x00, 0x55, 0x49]),
    fmTsLen,
    fmTsValue,
  ]);
  const fmGroupLenValue = Buffer.alloc(4);
  fmGroupLenValue.writeUInt32LE(fmTs.length, 0);
  const fmGroupLen = Buffer.concat([
    Buffer.from([0x02, 0x00, 0x00, 0x00, 0x55, 0x4c, 0x04, 0x00]),
    fmGroupLenValue,
  ]);

  return Buffer.concat([preamble, dicm, fmGroupLen, fmTs, unElement]);
}

// -- The 12 real fixtures + 1 deferred ----------------------------------------

const FIXTURES: readonly PairFixture[] = [
  {
    code: WARNING_CODES.DICOM_MISSING_PREAMBLE,
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [],
        skipPreamble: true,
      }),
  },
  {
    code: WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [],
        fileMetaGroupLength: "omit",
      }),
  },
  {
    code: WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH,
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [],
        fileMetaGroupLength: "wrong",
      }),
  },
  {
    code: WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED,
    // Odd-length SH (5 bytes) under Explicit-LE → emits warning.
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080050", vr: "SH", value: Buffer.from("12345", "ascii") }],
      }),
  },
  {
    code: WARNING_CODES.DICOM_VR_MISMATCH,
    // (0010,0010) PatientName has dict VR = PN; encode as LO under Explicit-LE.
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100010", vr: "LO", value: Buffer.from("DOE^JANE", "ascii") }],
      }),
  },
  {
    code: WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR,
    // Private element (0019,1000) under Implicit-LE with no creator slot → .
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_IMPLICIT_LE,
        elements: [{ tag: "00191000", vr: "UN", value: Buffer.from("vendor", "ascii") }],
      }),
  },
  {
    code: WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET,
    // (0008,0000) Group Length element in non-FM dataset → .
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_IMPLICIT_LE,
        elements: [{ tag: "00080000", vr: "UL", value: Buffer.alloc(4, 0x00) }],
      }),
  },
  {
    code: WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES,
    buildBuffer: buildNonzeroReservedBytesFixture,
  },
  // DICOM_UN_PARSED_AS_SQ is in DEFERRED_CODES - strict-mode pair is
  // blocked by a try/catch in `tryParseUnAsSQ` that swallows the chokepoint
  // throw. Lenient-mode emission still verified below in a dedicated block.
  {
    code: WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE,
    // SQ element containing exactly one defined-length item with elements=[]
    // (length=0) → emits the warning.
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "0040A730",
            items: [{ elements: [] }],
          },
        ],
      }),
  },
  {
    code: WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR,
    // Private element (0019,1000) under Implicit-LE WITH a registered
    // creator at (0019,0010). The IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR
    // warning is ALWAYS emitted for private non-creator-slot tags so a
    // profile can supply the VR; PRIVATE_TAG_NO_CREATOR is suppressed
    // when a creator is registered, leaving this code as the only Tier-2
    // emission. Under strict mode, that means the parser throws on this code
    // first (the only one it sees), which is what this test verifies.
    buildBuffer: () =>
      buildDicom({
        transferSyntax: TS_IMPLICIT_LE,
        elements: [
          // Creator slot: (0019,0010) LO "ACME" reserves block 0x10 in group 0x0019.
          { tag: "00190010", vr: "LO", value: Buffer.from("ACME", "ascii") },
          // Private element in the reserved block: (0019,1000).
          { tag: "00191000", vr: "UN", value: Buffer.from("vendor", "ascii") },
        ],
      }),
  },
];

// -- Tests --------------------------------------------------------------------

describe("Strict-mode escalation gate - every actively-emitted Tier-2 code paired", () => {
  it("enforcement: every active code has a fixture (or is documented as deferred)", () => {
    const codesWithFixtures = new Set(FIXTURES.map((f) => f.code));
    const missing: WarningCode[] = [];
    for (const code of ACTIVE_CODES) {
      if (codesWithFixtures.has(code)) continue;
      if (DEFERRED_CODES.has(code)) continue;
      missing.push(code);
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing strict-mode fixtures for active-emit codes: ${missing.join(", ")}. ` +
          `Author a fixture in FIXTURES, or add the code to DEFERRED_CODES with a CONTEXT-decision comment.`,
      );
    }
  });

  for (const fix of FIXTURES) {
    describe(fix.code, () => {
      it(`lenient mode: emits ${fix.code} and parses successfully`, () => {
        const buf = fix.buildBuffer();
        const ds = parseDicom(buf);
        expect(ds.warnings.some((w) => w.code === fix.code)).toBe(true);
      });

      it(`strict mode: throws DicomParseError with code = ${fix.code}`, () => {
        const buf = fix.buildBuffer();
        let thrown: unknown;
        try {
          parseDicom(buf, { strict: true });
        } catch (err) {
          thrown = err;
        }
        expect(thrown).toBeInstanceOf(DicomParseError);
        const e = thrown as DicomParseError;
        // Strict-mode escalation carries the warning's own code in `e.code`,
        // which is typed `FatalCode | WarningCode`.
        expect(e.code).toBe(fix.code);
        expect(typeof e.byteOffset).toBe("number");
        expect(typeof e.snippet).toBe("string");
      });
    });
  }
});

describe("DICOM_UN_PARSED_AS_SQ - CP-246 detection", () => {
  it("lenient mode: emits DICOM_UN_PARSED_AS_SQ for a private UN-undefined-length wrapping a valid Implicit-LE SQ", () => {
    const ds = parseDicom(buildCp246Fixture());
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ)).toBe(true);
  });

  it("strict mode: throws DicomParseError(DICOM_UN_PARSED_AS_SQ)", () => {
    let caught: DicomParseError | undefined;
    try {
      parseDicom(buildCp246Fixture(), { strict: true });
    } catch (err) {
      if (err instanceof DicomParseError) caught = err;
    }
    expect(caught).toBeInstanceOf(DicomParseError);
    expect(caught?.code).toBe(WARNING_CODES.DICOM_UN_PARSED_AS_SQ);
  });
});

describe("DICOM_PIXEL_DATA_LENGTH_MISMATCH - post-pass status", () => {
  // The post-pass that emits this code is not wired into the parser yet:
  // `pixelDataLengthMismatch` exists as a factory in src/parser/warnings.ts
  // and is registered in WARNING_CODES, but no emission site fires under any
  // current input. The factory will be activated when that post-pass lands.
  it.todo("pair test pending post-pass implementation (factory exists; emission site deferred)");
});

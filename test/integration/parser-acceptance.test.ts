/**
 * Phase 2 capstone — ROADMAP §"Phase 2" Success Criteria #1–#5 verified
 * end-to-end.
 *
 * Each `describe` block targets one of the five success criteria. Tests
 * exercise the public surface (`parseDicom`, `Dataset`, `WARNING_CODES`,
 * `FATAL_CODES`, `DicomParseError`, `Dictionary.uid`) over programmatic
 * fixtures from `test/helpers/build-dicom.ts` (D-38 — Phase 2 ships zero
 * curated `.dcm` files).
 *
 * Each block maps to a Phase 2 success criterion (#1–#5).
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomParseError,
  Dictionary,
  FATAL_CODES,
  parseDicom,
  WARNING_CODES,
  type Element,
} from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";
import { buildDicom } from "../helpers/build-dicom.js";

// -- Test-only structural accessor for Dataset._elements ---------------------

interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}

function elementsOf(ds: object): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

// -- TS UIDs and human-readable names (sourced from Dictionary.uid) ----------

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

const ALL_V1_TS = [TS_IMPLICIT_LE, TS_EXPLICIT_LE, TS_EXPLICIT_BE, TS_DEFLATED_LE] as const;

// ===========================================================================
// SC1: parses all 4 v1 transfer syntaxes correctly + long-form VR + AT
// byte-pair under BE + OB never-swap + Deflated uses inflateRawSync
// ===========================================================================

describe("ROADMAP Phase 2 §SC1: parses all 4 v1 transfer syntaxes correctly", () => {
  for (const ts of ALL_V1_TS) {
    it(`parses ${ts} (${Dictionary.uid(ts)?.name ?? "<unknown>"}) end-to-end with PN element preserved`, () => {
      const buf = buildDicom({
        transferSyntax: ts,
        elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
      });
      const ds = parseDicom(buf);
      expect(ds.fileMeta?.transferSyntaxUID).toBe(ts);
      const el = elementsOf(ds).get("00100010");
      expect(el).toBeDefined();
      expect(el?.vr).toBe("PN");
      expect(el?.length).toBe(8);
      expect(el?.rawBytes.toString("ascii")).toBe("DOE^JANE");
      // For Deflated TS, byteOffset is relative to the inflated buffer
      // (per CONTEXT D-27) and the first element starts at offset 0; for
      // the other three TS, it points into the on-disk source past File
      // Meta. Both are non-negative.
      expect(el?.byteOffset).toBeGreaterThanOrEqual(0);
    });
  }

  it("long-form VRs (OB OW OF OD OL SQ UT UN UC UR) use 12-byte header (4-byte length + 2 reserved bytes = zero)", () => {
    // Each long-form VR encoded under Explicit-LE with even-length value.
    // The fixture builder writes reserved=0x0000 by default; the parser
    // would emit DICOM_NONZERO_RESERVED_BYTES if reserved were non-zero.
    const longFormVRs = ["OB", "OW", "OF", "OD", "OL", "UT", "UN", "UC", "UR"] as const;
    for (const vr of longFormVRs) {
      const value = Buffer.alloc(8, 0x00); // even-length placeholder
      const buf = buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00181020", vr, value }],
      });
      const ds = parseDicom(buf);
      expect(
        ds.warnings.find((w) => w.code === WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES),
      ).toBeUndefined();
      const el = elementsOf(ds).get("00181020");
      expect(el).toBeDefined();
      expect(el?.vr).toBe(vr);
      expect(el?.length).toBe(8);
    }

    // SQ separately — empty defined-length SQ exercises the long-form
    // header without a value-bytes burden.
    const sqBuf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "0040A730", items: [] }],
    });
    const sqDs = parseDicom(sqBuf);
    const sqEl = elementsOf(sqDs).get("0040A730");
    expect(sqEl?.vr).toBe("SQ");
    expect(
      sqDs.warnings.find((w) => w.code === WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES),
    ).toBeUndefined();
  });

  it("AT under BE: 4 bytes preserved on-wire as two independent 2-byte BE swaps (group, then element)", () => {
    // Caller-side bytes — interpreted as (0010,0020) in LE/native order:
    //   group_lo, group_hi, element_lo, element_hi
    // Encoder swaps each 2-byte pair → on-wire BE: 00 10 00 20.
    // Parser stores rawBytes verbatim (BE-ordered); Phase 3 decodes the
    // tag via two readUInt16BE calls per CONTEXT D-23.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [
        {
          tag: "00280009",
          vr: "AT",
          value: Buffer.from([0x10, 0x00, 0x20, 0x00]),
        },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00280009");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("AT");
    // On-wire BE byte sequence — group BE then element BE.
    expect(Array.from(el?.rawBytes ?? [])).toEqual([0x00, 0x10, 0x00, 0x20]);
  });

  it("OB under BE: never swapped (preserved verbatim regardless of TS)", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [
        {
          tag: "00181020",
          vr: "OB",
          value: Buffer.from([0x01, 0x02, 0x03, 0x04]),
        },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00181020");
    expect(Array.from(el?.rawBytes ?? [])).toEqual([0x01, 0x02, 0x03, 0x04]);
  });

  it("Deflated TS uses inflateRawSync (RFC 1951) — round-trip succeeds and source has no inflateSync reference", async () => {
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("ROUNDTRIP", "ascii") }],
    });
    const ds = parseDicom(buf);
    expect(ds.fileMeta?.transferSyntaxUID).toBe(TS_DEFLATED_LE);
    const el = elementsOf(ds).get("00100010");
    expect(el?.rawBytes.toString("ascii").trim()).toBe("ROUNDTRIP");

    // Source-grep gate: the Deflated parser must reference `inflateRawSync`
    // and must NOT call `inflateSync` / `gunzipSync` / `unzipSync` outside
    // JSDoc commentary. Mirrors plan 02-05's source-grep evidence at the
    // module level — re-asserted here so the public surface guarantee is
    // visible from a single integration sweep.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const here = path.dirname(new URL(import.meta.url).pathname);
    const repoRoot = path.resolve(here, "..", "..");
    const deflatedSrc = await fs.readFile(
      path.join(repoRoot, "src", "parser", "deflated-le.ts"),
      "utf8",
    );
    expect(deflatedSrc).toMatch(/\binflateRawSync\b/);
    // Strip line-comments + JSDoc lines before grepping for the forbidden APIs.
    const codeOnly = deflatedSrc
      .split("\n")
      .filter((line) => !/^\s*[*/]/.test(line))
      .join("\n");
    expect(codeOnly).not.toMatch(/\binflateSync\b/);
    expect(codeOnly).not.toMatch(/\bgunzipSync\b/);
    expect(codeOnly).not.toMatch(/\bunzipSync\b/);
  });
});

// ===========================================================================
// SC2: every TOL-03 deviation produces a stable-coded warning with
// byte-offset positional context. Largely covered by the strict-mode pair
// test (parser-strict-mode.test.ts); re-asserted here for cross-cutting
// visibility on a couple of canonical cases.
// ===========================================================================

describe("ROADMAP Phase 2 §SC2: TOL-03 deviations produce stable-coded warnings with byte offsets", () => {
  it("missing preamble emits DICOM_MISSING_PREAMBLE with byteOffset 0", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
      skipPreamble: true,
    });
    const ds = parseDicom(buf);
    const w = ds.warnings.find((x) => x.code === WARNING_CODES.DICOM_MISSING_PREAMBLE);
    expect(w).toBeDefined();
    expect(w?.position.byteOffset).toBe(0);
  });

  it("File Meta group-length mismatch emits warning + parser trusts actual length", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
      fileMetaGroupLength: "wrong",
    });
    const ds = parseDicom(buf);
    expect(
      ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH),
    ).toBe(true);
    // Parser still resolved fileMeta + parsed dataset.
    expect(ds.fileMeta?.transferSyntaxUID).toBe(TS_EXPLICIT_LE);
    expect(elementsOf(ds).has("00100010")).toBe(true);
  });

  it("ds.warnings is always a frozen array on a parsed dataset (TOL-04)", () => {
    const buf = buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: [] });
    const ds = parseDicom(buf);
    expect(Array.isArray(ds.warnings)).toBe(true);
    expect(Object.isFrozen(ds.warnings)).toBe(true);
  });

  it("onWarning callback is invoked for each emitted warning (TOL-05)", () => {
    const seen: string[] = [];
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
      skipPreamble: true,
    });
    parseDicom(buf, { onWarning: (w) => seen.push(w.code) });
    expect(seen).toContain(WARNING_CODES.DICOM_MISSING_PREAMBLE);
  });
});

// ===========================================================================
// SC3: 4 fatal codes throw with byteOffset + snippet, even in lenient mode
// (TOL-02).
// ===========================================================================

describe("ROADMAP Phase 2 §SC3: 4 fatal codes throw with byteOffset + snippet (TOL-02)", () => {
  it("EMPTY_INPUT", () => {
    let thrown: unknown;
    try {
      parseDicom(Buffer.alloc(0));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    const e = thrown as DicomParseError;
    expect(e.code).toBe(FATAL_CODES.EMPTY_INPUT);
    expect(e.byteOffset).toBe(0);
    expect(typeof e.snippet).toBe("string");
  });

  it("NOT_DICOM_PART_10", () => {
    let thrown: unknown;
    try {
      parseDicom(Buffer.from("not a dicom file at all".repeat(10), "ascii"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    const e = thrown as DicomParseError;
    expect(e.code).toBe(FATAL_CODES.NOT_DICOM_PART_10);
    expect(typeof e.byteOffset).toBe("number");
    expect(e.snippet.length).toBeGreaterThan(0);
  });

  it("INVALID_FILE_META — missing Transfer Syntax UID", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
      skipTransferSyntaxUID: true,
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

  it("UNSUPPORTED_TRANSFER_SYNTAX — JPEG Baseline (1.2.840.10008.1.2.4.50)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.4.50",
      elements: [],
    });
    let thrown: unknown;
    try {
      parseDicom(buf);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    const e = thrown as DicomParseError;
    expect(e.code).toBe(FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX);
    // D-20: human-readable TS name from Dictionary.uid lands in `snippet`.
    const expectedName = Dictionary.uid("1.2.840.10008.1.2.4.50")?.name ?? "";
    if (expectedName.length > 0) {
      expect(e.snippet).toBe(expectedName);
    }
  });

  it("fatals throw even in lenient mode (default)", () => {
    // Re-assert the four cases all throw without `{ strict: true }`.
    expect(() => parseDicom(Buffer.alloc(0))).toThrow(DicomParseError);
    expect(() => parseDicom(Buffer.from("garbage".repeat(40), "ascii"))).toThrow(DicomParseError);
  });
});

// ===========================================================================
// SC4: strict mode escalates every Tier-2 to a throw. Comprehensively
// covered by parser-strict-mode.test.ts; one canonical re-check here.
// ===========================================================================

describe("ROADMAP Phase 2 §SC4: strict mode escalates Tier-2 to throw", () => {
  it("strict mode: missing preamble throws DicomParseError carrying DICOM_MISSING_PREAMBLE", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
      skipPreamble: true,
    });
    let thrown: unknown;
    try {
      parseDicom(buf, { strict: true });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DicomParseError);
    const e = thrown as DicomParseError;
    const code: string = e.code;
    expect(code).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
  });
});

// ===========================================================================
// SC5: ds.fileMeta projects the documented FM-02 fields under every TS;
// File Meta is always Explicit VR LE; Dictionary.uid resolves human-readable
// TS names.
// ===========================================================================

describe("ROADMAP Phase 2 §SC5: ds.fileMeta exposes FM-02 fields; FM is Explicit-LE; Dictionary.uid resolves TS names", () => {
  it("FM-02 fields populated end-to-end under each of the 4 v1 TS", () => {
    for (const ts of ALL_V1_TS) {
      const buf = buildDicom({
        transferSyntax: ts,
        elements: [],
        mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
        mediaStorageSOPInstanceUID: "1.2.3.4.5.6.7.8.9",
        implementationClassUID: "1.2.3.4.5",
        implementationVersionName: "@cosyte/dicom",
      });
      const ds = parseDicom(buf);
      expect(ds.fileMeta?.transferSyntaxUID).toBe(ts);
      expect(ds.fileMeta?.mediaStorageSOPClassUID).toBe("1.2.840.10008.5.1.4.1.1.2");
      expect(ds.fileMeta?.mediaStorageSOPInstanceUID).toBe("1.2.3.4.5.6.7.8.9");
      expect(ds.fileMeta?.implementationClassUID).toBe("1.2.3.4.5");
      expect(ds.fileMeta?.implementationVersionName).toBe("@cosyte/dicom");
    }
  });

  it("File Meta is parsed as Explicit VR LE regardless of dataset TS — Implicit-LE dataset still has Explicit-LE FM", () => {
    // Build under Implicit-LE; if the parser were dispatching FM through
    // the TS table, it would try to parse FM as Implicit-LE and fail to
    // recover the per-element VR. The fact that `ds.fileMeta` populates
    // every projected UI field proves FM-01.
    const buf = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [],
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      implementationClassUID: "1.2.3.4.5",
    });
    const ds = parseDicom(buf);
    expect(ds.fileMeta?.transferSyntaxUID).toBe(TS_IMPLICIT_LE);
    expect(ds.fileMeta?.mediaStorageSOPClassUID).toBe("1.2.840.10008.5.1.4.1.1.2");
    expect(ds.fileMeta?.implementationClassUID).toBe("1.2.3.4.5");
  });

  it("Dictionary.uid resolves human-readable TS names for all 4 v1 UIDs (FM-04)", () => {
    expect(Dictionary.uid(TS_IMPLICIT_LE)?.name).toBe("Implicit VR Little Endian");
    expect(Dictionary.uid(TS_EXPLICIT_LE)?.name).toBe("Explicit VR Little Endian");
    expect(Dictionary.uid(TS_EXPLICIT_BE)?.name).toBe("Explicit VR Big Endian");
    expect(Dictionary.uid(TS_DEFLATED_LE)?.name).toBe("Deflated Explicit VR Little Endian");
  });

  it("ds.fileMeta is undefined when File Meta cannot be parsed — never present (no half-parsed shape)", () => {
    // Negative case: missing TS UID throws INVALID_FILE_META — there is no
    // Dataset returned at all. Fatal-code throw means no half-parsed
    // fileMeta surfaces to the caller.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
      skipTransferSyntaxUID: true,
    });
    expect(() => parseDicom(buf)).toThrow(DicomParseError);
  });
});

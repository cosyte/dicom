/**
 * Tests for `parseExplicitBE` — Phase 2 plan 02-04 task 3.
 *
 * Covers TS-03 (`1.2.840.10008.1.2.2`):
 *   - Short-form / long-form happy paths under BE.
 *   - rawBytes preserved on-wire (Phase 2 does NOT swap; Phase 3's lazy
 *     decoders use BE_VR_STRIDE — D-44).
 *   - AT special case (D-23): rawBytes is 4 bytes verbatim (two
 *     independent 2-byte BE swaps at decode time, NOT one 4-byte swap).
 *   - OB / UN never swap (D-24).
 *   - FFFE under BE bug closure (D-25 + PITFALLS §2.3).
 *   - TOL-08 / TOL-07 / DICOM_NONZERO_RESERVED_BYTES under BE.
 *   - CP-246 under BE — STILL uses Implicit-LE inner per D-30.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { buildDicom } from "../helpers/build-dicom.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import type { Element } from "../../src/dataset/element.js";
import type { Tag } from "../../src/dictionary/types.js";
import { parseDicom } from "../../src/parser/index.js";
import { WARNING_CODES } from "../../src/parser/warnings.js";

interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}
function elementsOf(ds: Dataset): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

describe("parseExplicitBE — TS-03 short-form happy path", () => {
  it("parses (0010,0010) PN under BE", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("PN");
    expect(el?.length).toBe(8);
    expect(el?.byteOffset).toBeGreaterThan(0);
  });
});

describe("parseExplicitBE — TS-03 long-form (D-22 + D-25)", () => {
  it("parses (7FE0,0010) OB with 12-byte long-form BE header", () => {
    const pixel = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "7FE00010", vr: "OB", value: pixel }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("7FE00010");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("OB");
    expect(el?.length).toBe(4);
    // OB never swaps (D-24).
    expect(el?.rawBytes.equals(pixel)).toBe(true);
  });
});

describe("parseExplicitBE — numeric rawBytes preserved on-wire (D-23 + D-44)", () => {
  it("US value 0x0005 (LE caller bytes) is stored as on-wire BE bytes 0x05 0x00", () => {
    // Caller passes value bytes in native/LE order: 0x05, 0x00 = 5.
    // The BE encoder swaps to 0x00, 0x05 on-wire.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "00280010", vr: "US", value: Buffer.from([0x05, 0x00]) }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00280010");
    expect(el).toBeDefined();
    // Phase 2 does NOT swap on read (per CONTEXT D-44); rawBytes is
    // verbatim on-wire BE bytes.
    expect(el?.rawBytes.equals(Buffer.from([0x00, 0x05]))).toBe(true);
  });
});

describe("parseExplicitBE — AT special case (D-23)", () => {
  it("AT value (group, element) tag(0010,0020) — rawBytes is 4 bytes verbatim BE", () => {
    // AT carries a tag value: pass caller-side bytes in LE format
    // (0x10 0x00 0x20 0x00 = (0010,0020) when read LE-pair-wise).
    // Encoder's swapBytes(stride=2) yields BE bytes: (0x00,0x10,0x00,0x20).
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "00280009", vr: "AT", value: Buffer.from([0x10, 0x00, 0x20, 0x00]) }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00280009");
    expect(el).toBeDefined();
    expect(el?.rawBytes.equals(Buffer.from([0x00, 0x10, 0x00, 0x20]))).toBe(true);
  });
});

describe("parseExplicitBE — OB never swaps (D-24)", () => {
  it("OB rawBytes is verbatim on-wire (no per-VR swap)", () => {
    const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "7FE00010", vr: "OB", value: data }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("7FE00010");
    expect(el?.rawBytes.equals(data)).toBe(true);
  });
});

describe("parseExplicitBE — UN never swaps (D-24)", () => {
  it("UN rawBytes is verbatim on-wire (no per-VR swap)", () => {
    const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "00191000", vr: "UN", value: data }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00191000");
    expect(el?.rawBytes.equals(data)).toBe(true);
  });
});

describe("parseExplicitBE — FFFE under BE (D-25 + PITFALLS §2.3)", () => {
  it("undefined-length SQ in BE terminates correctly via FFFE,E0DD SeqDelim", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [
        {
          tag: "0040A730",
          undefinedLength: true,
          items: [
            {
              elements: [{ tag: "00080100", vr: "SH", value: Buffer.from("CODE", "ascii") }],
            },
          ],
        },
      ],
    });
    const ds = parseDicom(buf);
    expect(
      ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR),
    ).toBe(true);
    const el = elementsOf(ds).get("0040A730");
    expect(el?.vr).toBe("SQ");
    // The bug being closed: a naive BE parser reading FFFE markers as
    // 2 LE bytes would fail to recognize FFFE,E0DD and either over-read
    // or miscount items. Successful parse + correct SQ vr proves
    // termination worked.
  });
});

describe("parseExplicitBE — TOL-08 + TOL-07 + DICOM_NONZERO_RESERVED_BYTES under BE", () => {
  it("emits DICOM_VR_MISMATCH when on-wire VR != dict VR", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "00100010", vr: "LO", value: Buffer.from("X ", "ascii") }],
    });
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_VR_MISMATCH)).toBe(true);
  });

  it("emits DICOM_ODD_LENGTH_VALUE_PADDED for odd-length SH", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "00080050", vr: "SH", value: Buffer.from("12345", "ascii") }],
    });
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED)).toBe(
      true,
    );
  });
});

describe("parseExplicitBE — CP-246 under BE (D-30)", () => {
  it("UN-undefined-length carrying valid Implicit-LE SQ → STILL uses Implicit-LE inner; promoted to SQ", () => {
    // Inner SQ payload encoded as Implicit-VR-LE bytes: empty defined-length
    // item + SeqDelim (LE byte order — that's the spec for CP-246 inner).
    const itemHdr = Buffer.alloc(8);
    itemHdr.writeUInt16LE(0xfffe, 0);
    itemHdr.writeUInt16LE(0xe000, 2);
    itemHdr.writeUInt32LE(0, 4);
    const seqDelim = Buffer.alloc(8);
    seqDelim.writeUInt16LE(0xfffe, 0);
    seqDelim.writeUInt16LE(0xe0dd, 2);
    seqDelim.writeUInt32LE(0, 4);
    const sqPayload = Buffer.concat([itemHdr, seqDelim]);

    // Hand-build the OUTER UN element header — written BIG-ENDIAN per TS-03.
    const tag = Buffer.from([0x00, 0x40, 0xa7, 0x30]); // (0040,A730) BE
    const unVr = Buffer.from("UN", "ascii");
    const reserved = Buffer.from([0x00, 0x00]);
    const undefLen = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const unElement = Buffer.concat([tag, unVr, reserved, undefLen, sqPayload]);

    // File Meta — always Explicit VR LE per FM-01 / D-17.
    const preamble = Buffer.alloc(128, 0x00);
    const dicm = Buffer.from("DICM", "ascii");
    const fmTsValue = Buffer.from(`${TS_EXPLICIT_BE}\0`, "ascii");
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

    const buf = Buffer.concat([preamble, dicm, fmGroupLen, fmTs, unElement]);
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ)).toBe(true);
    const el = elementsOf(ds).get("0040A730");
    expect(el?.vr).toBe("SQ");
    expect(el?.cp246Promoted).toBe(true);
  });
});

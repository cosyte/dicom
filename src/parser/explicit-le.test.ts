/**
 * Tests for `parseExplicitLE` — Phase 2 plan 02-04 task 2.
 *
 * Covers TS-02 end-to-end through `parseDicom`, plus the per-VR Explicit-LE
 * header layout (short-form / long-form), TOL-07 (odd-length-padded),
 * TOL-08 (VR mismatch), DICOM_NONZERO_RESERVED_BYTES, undefined-length-SQ
 * (DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR), CP-246 success + failure
 * (DICOM_UN_PARSED_AS_SQ + cp246Promoted hint), encapsulated pixel data
 * structural recognition (D-31), private-creator block-reservation, and
 * truncation throws (T-02-04-01).
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { buildDicom } from "../../test/helpers/build-dicom.js";
import type { Dataset } from "../dataset/dataset.js";
import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { DicomParseError } from "./errors.js";
import { parseDicom } from "./index.js";
import { WARNING_CODES } from "./warnings.js";

interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}
function elementsOf(ds: Dataset): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

describe("parseExplicitLE — TS-02 short-form happy path", () => {
  it("parses (0010,0010) PN with 8-byte short-form header", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("PN");
    expect(el?.length).toBe(8);
    expect(el?.rawBytes.toString("ascii")).toBe("DOE^JANE");
  });
});

describe("parseExplicitLE — TS-02 long-form happy path (D-22)", () => {
  it("parses (7FE0,0010) OB with 12-byte long-form header", () => {
    const pixel = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "7FE00010", vr: "OB", value: pixel }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("7FE00010");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("OB");
    expect(el?.length).toBe(8);
    expect(el?.rawBytes.equals(pixel)).toBe(true);
  });
});

describe("parseExplicitLE — TOL-07 odd-length value", () => {
  it("emits DICOM_ODD_LENGTH_VALUE_PADDED for odd-length SH; element parsed with declared length", () => {
    // SH with 5-byte value "12345" (odd-length on wire).
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00080050", vr: "SH", value: Buffer.from("12345", "ascii") }],
    });
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED)).toBe(
      true,
    );
    const el = elementsOf(ds).get("00080050");
    expect(el?.length).toBe(5);
  });
});

describe("parseExplicitLE — TOL-08 VR mismatch", () => {
  it("emits DICOM_VR_MISMATCH when in-file VR differs from dictionary", () => {
    // (0010,0010) is dictionary VR=PN; encode with on-wire VR=LO.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "LO", value: Buffer.from("X ", "ascii") }],
    });
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_VR_MISMATCH)).toBe(true);
    const el = elementsOf(ds).get("00100010");
    expect(el?.vr).toBe("LO"); // Trust on-wire VR per Postel's Law.
  });
});

describe("parseExplicitLE — DICOM_NONZERO_RESERVED_BYTES", () => {
  it("emits warning when long-form reserved bytes are non-zero", () => {
    // Hand-build a buffer with one OB element whose reserved bytes are
    // 0x01 0x02 (instead of 0x00 0x00).
    const preamble = Buffer.alloc(128, 0x00);
    const dicm = Buffer.from("DICM", "ascii");

    // Build a valid File Meta with TS UID = Explicit VR LE.
    const fmTsValue = Buffer.from(`${TS_EXPLICIT_LE}\0`, "ascii"); // even-length pad
    const fmTsHeader = Buffer.from([
      0x02,
      0x00,
      0x10,
      0x00,
      0x55,
      0x49, // (0002,0010) UI
      fmTsValue.length,
      0x00, // 2-byte LE length
    ]);
    const fmTsElement = Buffer.concat([fmTsHeader, fmTsValue]);
    const fmGroupLen = Buffer.alloc(4);
    fmGroupLen.writeUInt32LE(fmTsElement.length, 0);
    const fmGroupLenElement = Buffer.concat([
      Buffer.from([0x02, 0x00, 0x00, 0x00, 0x55, 0x4c, 0x04, 0x00]), // (0002,0000) UL len=4
      fmGroupLen,
    ]);

    // Hand-craft (7FE0,0010) OB long-form with bad reserved bytes.
    const badOb = Buffer.concat([
      Buffer.from([0xe0, 0x7f, 0x10, 0x00]), // (7FE0,0010) LE
      Buffer.from("OB", "ascii"),
      Buffer.from([0x01, 0x02]), // <-- BAD reserved
      Buffer.from([0x04, 0x00, 0x00, 0x00]), // length=4 LE
      Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]),
    ]);

    const buf = Buffer.concat([preamble, dicm, fmGroupLenElement, fmTsElement, badOb]);
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES)).toBe(
      true,
    );
    // Element still parsed despite the reserved-byte issue.
    const el = elementsOf(ds).get("7FE00010");
    expect(el?.length).toBe(4);
  });
});

describe("parseExplicitLE — explicit-length SQ", () => {
  it("parses (0040,A730) ContentSequence with one defined-length item", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "0040A730",
          items: [
            {
              elements: [
                {
                  tag: "00080100",
                  vr: "SH",
                  value: Buffer.from("CODE", "ascii"),
                },
              ],
            },
          ],
        },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("0040A730");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("SQ");
    // No DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR for explicit-length SQ.
    expect(
      ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR),
    ).toBe(false);
  });
});

describe("parseExplicitLE — undefined-length SQ (D-29)", () => {
  it("emits DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR; SQ parsed correctly", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
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
  });
});

describe("parseExplicitLE — CP-246 (D-30)", () => {
  it("UN-undefined-length carrying valid Implicit-LE SQ → promoted to SQ + cp246Promoted=true", () => {
    // Construct an Implicit-LE-encoded SQ payload (one undefined-length
    // item with empty body + SeqDelim) and stuff it into a UN
    // undefined-length value.
    const itemHdr = Buffer.alloc(8);
    itemHdr.writeUInt16LE(0xfffe, 0);
    itemHdr.writeUInt16LE(0xe000, 2);
    itemHdr.writeUInt32LE(0, 4); // empty defined-length item
    const seqDelim = Buffer.alloc(8);
    seqDelim.writeUInt16LE(0xfffe, 0);
    seqDelim.writeUInt16LE(0xe0dd, 2);
    seqDelim.writeUInt32LE(0, 4);
    const sqPayload = Buffer.concat([itemHdr, seqDelim]);

    // Use buildDicom encapsulatedPixelData=false but build an SQ-shaped
    // helper element as raw bytes via encapsulatedPixelData with explicitVr=UN.
    // The encapsulated-pixel-data path emits:
    //   (tag) UN undefined-length + raw-byte-fragments + SeqDelim
    // which is exactly what we need (the inner bytes happen to be a
    // valid Implicit-LE SQ — the parser must recognize that via CP-246).
    //
    // But the encapsulated-pixel-data encoder emits its OWN FFFE,E000
    // wrapper for fragments. We want the raw payload directly. Hand-craft
    // the UN element via a buildDicom + a single fragment-less custom
    // element layout instead. Approach: use the Buffer concat path.

    // Simpler: hand-build the UN element header and append the payload.
    const tag = Buffer.from([0x40, 0x00, 0x30, 0xa7]); // (0040,A730) LE
    const unVr = Buffer.from("UN", "ascii");
    const reserved = Buffer.from([0x00, 0x00]);
    const undefLen = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const unElement = Buffer.concat([tag, unVr, reserved, undefLen, sqPayload]);

    // File Meta + preamble.
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

    const buf = Buffer.concat([preamble, dicm, fmGroupLen, fmTs, unElement]);
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ)).toBe(true);
    const el = elementsOf(ds).get("0040A730");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("SQ"); // Promoted.
    expect(el?.cp246Promoted).toBe(true);
  });

  it("UN-undefined-length with random bytes → falls back; vr stays UN; cp246Promoted unset; NO warning", () => {
    // 16 bytes of garbage that won't parse as Implicit-LE SQ.
    const garbage = Buffer.from([
      0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44,
      0x55,
    ]);
    const tag = Buffer.from([0x40, 0x00, 0x30, 0xa7]);
    const unVr = Buffer.from("UN", "ascii");
    const reserved = Buffer.from([0x00, 0x00]);
    const undefLen = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const unElement = Buffer.concat([tag, unVr, reserved, undefLen, garbage]);
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
    const buf = Buffer.concat([preamble, dicm, fmGroupLen, fmTs, unElement]);
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ)).toBe(false);
    const el = elementsOf(ds).get("0040A730");
    // Element exists with vr=UN (fallback path keeps UN).
    expect(el?.vr).toBe("UN");
    expect(el?.cp246Promoted).toBeUndefined();
  });
});

describe("parseExplicitLE — encapsulated pixel data (D-31)", () => {
  it("(7FE0,0010) OB undefined-length with fragments parses structurally; vr stays OB", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "7FE00010",
          encapsulatedPixelData: true,
          encapsulatedFragments: [
            Buffer.alloc(0), // empty BOT
            Buffer.from([0x01, 0x02, 0x03, 0x04]),
            Buffer.from([0x05, 0x06, 0x07, 0x08]),
          ],
          items: [], // unused for encapsulatedPixelData path
        },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("7FE00010");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("OB"); // NOT promoted.
    expect(el?.cp246Promoted).toBeUndefined();
  });
});

describe("parseExplicitLE — private-creator block-reservation", () => {
  it("Element.privateCreator populated for (0019,1000) when (0019,0010)='ACME'", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00190010", vr: "LO", value: Buffer.from("ACME", "ascii") },
        { tag: "00191000", vr: "UN", value: Buffer.from([0xaa, 0xbb]) },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00191000");
    expect(el?.privateCreator).toBe("ACME");
    // Off-by-0x1000 trap: (0019,2000) does NOT resolve to ACME.
    // (Not built in this fixture — verified in element-header.test.ts.)
  });
});

describe("parseExplicitLE — truncation (T-02-04-01)", () => {
  it("throws DicomParseError(INVALID_FILE_META) on truncated header", () => {
    // Build a valid buffer, then chop the last 4 bytes off mid-element.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const truncated = buf.subarray(0, buf.length - 4); // chop value mid-byte
    try {
      parseDicom(truncated);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      if (err instanceof DicomParseError) {
        expect(err.code).toBe("INVALID_FILE_META");
      }
    }
  });
});

describe("parseExplicitLE — TOL-10 group-length element in dataset", () => {
  it("(0009,0000) private-group length in the dataset emits DICOM_GROUP_LENGTH_IN_DATASET", () => {
    // A (gggg,0000) group-length element outside File Meta (group != 0002) is
    // legal-but-discouraged; the parser keeps the element and warns. Using an
    // odd private group avoids a standard-tag VR-mismatch warning muddying the
    // assertion. UL is the canonical group-length VR.
    const value = Buffer.alloc(4);
    value.writeUInt32LE(0, 0);
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00090000", vr: "UL", value }],
    });
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET)).toBe(
      true,
    );
    expect(elementsOf(ds).has("00090000")).toBe(true);
  });
});

describe("parseExplicitLE — undefined length on a non-SQ VR is fatal", () => {
  it("throws INVALID_FILE_META for a long-form VR carrying 0xFFFFFFFF on a non-pixel-data tag", () => {
    // Undefined length is only legal for SQ, the (7FE0,0010) OB encapsulated-
    // pixel-data special case, or CP-246 UN. An OB element on a NON-pixel-data
    // tag with undefined length therefore falls through to the structural
    // "undefined length on non-SQ" fatal. (0008,0008) ImageType is not
    // (7FE0,0010), so it exercises that branch.
    const fmOnly = buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: [] });
    const nonPdTag = Buffer.from([0x08, 0x00, 0x08, 0x00]); // (0008,0008) LE
    const obVr = Buffer.from("OB", "ascii"); // long-form VR -> 12-byte header
    const reserved = Buffer.from([0x00, 0x00]);
    const undefLen = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const element = Buffer.concat([nonPdTag, obVr, reserved, undefLen]);
    const buf = Buffer.concat([fmOnly, element]);
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
      expect(err.message).toMatch(/non-SQ/);
    }
  });
});

describe("parseExplicitLE — unexpected FFFE marker at dataset root", () => {
  it("throws INVALID_FILE_META for a stray (FFFE,E000) item header at the root", () => {
    const fmOnly = buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: [] });
    const itemHeader = Buffer.alloc(8);
    itemHeader.writeUInt16LE(0xfffe, 0);
    itemHeader.writeUInt16LE(0xe000, 2);
    itemHeader.writeUInt32LE(0, 4);
    const buf = Buffer.concat([fmOnly, itemHeader]);
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
      expect(err.message).toContain("FFFE");
    }
  });
});

describe("parseExplicitLE — undefined-length SQ with an undefined-length item", () => {
  it("terminates the inner item on (FFFE,E00D) ItemDelim and still parses the item body", () => {
    // Both the SQ and its single item use undefined length, so the SQ is
    // delimited by (FFFE,E0DD) and the item body by (FFFE,E00D). The inner
    // explicit parser is invoked with stopOnItemDelim=true and must exit on
    // the ItemDelim marker (the FFFE-at-item-level early-return path).
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "0040A730",
          undefinedLength: true,
          items: [
            {
              undefinedLength: true,
              elements: [{ tag: "00080100", vr: "SH", value: Buffer.from("CODE", "ascii") }],
            },
          ],
        },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("0040A730");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("SQ");
    expect(el?.vm).toBe(1);
  });
});

describe("parseExplicitLE — truncation points (T-02-04-01)", () => {
  it("throws INVALID_FILE_META when the buffer ends with a single dangling byte (peek overrun)", () => {
    // Build a clean buffer, then leave exactly one trailing byte where the
    // next element header would start. The 2-byte group peek overruns ->
    // typed INVALID_FILE_META, not a raw RangeError.
    const base = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const buf = Buffer.concat([base, Buffer.from([0x10])]); // one dangling byte
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });

  it("throws INVALID_FILE_META when an FFFE marker's header is truncated", () => {
    // An FFFE tag (group peeks as 0xFFFE) but only the 4 tag bytes are present
    // — reading the 4-byte length overruns inside the FFFE branch.
    const fmOnly = buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: [] });
    const danglingFffe = Buffer.from([0xfe, 0xff, 0x00, 0xe0]); // (FFFE,E000), no length
    const buf = Buffer.concat([fmOnly, danglingFffe]);
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });

  it("throws INVALID_FILE_META when a standard element header is truncated after the group peek", () => {
    // Group peek succeeds (group 0010), but only 3 bytes follow — the full
    // explicit-VR header read overruns inside readExplicitElementHeader.
    const fmOnly = buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: [] });
    const partialHeader = Buffer.from([0x10, 0x00, 0x10]); // (0010,00..) cut mid-header
    const buf = Buffer.concat([fmOnly, partialHeader]);
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });
});

describe("parseExplicitLE — D-16 copyValues on composite values", () => {
  it("copyValues=true isolates an undefined-length SQ element's rawBytes", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "0040A730",
          undefinedLength: true,
          items: [
            { elements: [{ tag: "00080100", vr: "SH", value: Buffer.from("CODE", "ascii") }] },
          ],
        },
      ],
    });
    const ds = parseDicom(buf, { copyValues: true });
    const el = elementsOf(ds).get("0040A730");
    expect(el).toBeDefined();
    const before = Buffer.from(el?.rawBytes ?? Buffer.alloc(0));
    buf.fill(0xff, 0, buf.length);
    expect(el?.rawBytes.equals(before)).toBe(true);
  });

  it("copyValues=true isolates encapsulated pixel-data rawBytes", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "7FE00010",
          encapsulatedPixelData: true,
          encapsulatedFragments: [Buffer.alloc(0), Buffer.from([0x01, 0x02, 0x03, 0x04])],
          items: [],
        },
      ],
    });
    const ds = parseDicom(buf, { copyValues: true });
    const el = elementsOf(ds).get("7FE00010");
    expect(el?.vr).toBe("OB");
    const before = Buffer.from(el?.rawBytes ?? Buffer.alloc(0));
    buf.fill(0xff, 0, buf.length);
    expect(el?.rawBytes.equals(before)).toBe(true);
  });
});

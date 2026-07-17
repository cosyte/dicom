/**
 * Tests for `parseImplicitLE` — Phase 2 plan 02-03 task 2.
 *
 * Covers TS-01 (Implicit VR LE) end-to-end through `parseDicom`, plus
 * TOL-09 (private-tag-no-creator), TOL-10 (group-length-in-dataset),
 * the D-34 Element.privateCreator population path, and the threat-model
 * mitigations T-02-03-01 (truncation) and T-02-03-02 (length overflow).
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { buildDicom } from "../helpers/build-dicom.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import type { Element } from "../../src/dataset/element.js";
import type { Tag } from "../../src/dictionary/types.js";
import { DicomParseError } from "../../src/parser/errors.js";
import { parseDicom } from "../../src/parser/index.js";
import { WARNING_CODES } from "../../src/parser/warnings.js";

/**
 * Reach the protected `_elements` map for Phase 2 verification. Phase 3
 * promotes this to a public navigation surface (per D-42); until then,
 * tests cast through a structural shape that mirrors the protected slot.
 */
interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}
function elementsOf(ds: Dataset): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

describe("parseImplicitLE — TS-01 happy path", () => {
  it("parses (0010,0010) PatientName from a minimal Implicit VR LE buffer", () => {
    // 8-byte even-length value; Implicit VR LE has no on-wire VR so the
    // VR field on Element is resolved from the dictionary (PN).
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const ds = parseDicom(buf);
    const els = elementsOf(ds);
    const el = els.get("00100010");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("PN");
    expect(el?.length).toBe(8);
    expect(el?.byteOffset).toBeGreaterThan(0);
    expect(el?.rawBytes.toString("ascii")).toBe("DOE^JANE");
  });

  it("Element.byteOffset points at the element header (not the value)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    // The 8 bytes at byteOffset are the Implicit VR LE header
    // (group 2 + element 2 + length 4). Verify by reading them.
    const off = el?.byteOffset ?? 0;
    expect(buf.readUInt16LE(off)).toBe(0x0010);
    expect(buf.readUInt16LE(off + 2)).toBe(0x0010);
    expect(buf.readUInt32LE(off + 4)).toBe(8);
  });
});

describe("parseImplicitLE — D-16 buffer-view vs copy", () => {
  it("default: rawBytes shares the source ArrayBuffer (zero-copy view)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    expect(el?.rawBytes.buffer).toBe(buf.buffer);
  });

  it("copyValues=true: mutating the source does NOT affect rawBytes", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const ds = parseDicom(buf, { copyValues: true });
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    const before = el?.rawBytes.toString("ascii");
    // Smash the source buffer where the value lived. With copyValues=true
    // the Element.rawBytes was Buffer.from(slice) (independent storage)
    // so the read-back must be unchanged.
    buf.fill(0xff, 0, buf.length);
    expect(el?.rawBytes.toString("ascii")).toBe(before);
  });

  it("default (copyValues=false): mutating the source DOES affect rawBytes (zero-copy view)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    const before = el?.rawBytes.toString("ascii");
    buf.fill(0xff, 0, buf.length);
    // Subarray view sees the mutation.
    expect(el?.rawBytes.toString("ascii")).not.toBe(before);
  });
});

describe("parseImplicitLE — TOL-10 group-length-in-dataset", () => {
  it("(0008,0000) group length in non-FM group emits DICOM_GROUP_LENGTH_IN_DATASET; element preserved", () => {
    const value = Buffer.alloc(4);
    value.writeUInt32LE(0, 0);
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00080000", vr: "UL", value }],
    });
    const ds = parseDicom(buf);
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET)).toBe(
      true,
    );
    expect(elementsOf(ds).has("00080000")).toBe(true);
  });
});

describe("parseImplicitLE — TOL-09 + Case 4a private-tag-no-creator", () => {
  it("private element with no creator emits both TOL-09 codes; element.vr === 'UN'", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00191000", vr: "LO", value: Buffer.from("vendor-data", "ascii") }],
    });
    const ds = parseDicom(buf);
    const codes = ds.warnings.map((w) => w.code);
    expect(codes).toContain(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR);
    expect(codes).toContain(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR);
    const el = elementsOf(ds).get("00191000");
    expect(el?.vr).toBe("UN");
  });
});

describe("parseImplicitLE — D-33 / D-34 private-creator block-reservation", () => {
  it("creator at (0019,0010)='ACME' covers (0019,1000): privateCreator='ACME', vr='UN', no NO_CREATOR warning", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [
        { tag: "00190010", vr: "LO", value: Buffer.from("ACME", "ascii") },
        { tag: "00191000", vr: "LO", value: Buffer.from("payload!", "ascii") },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00191000");
    expect(el).toBeDefined();
    expect(el?.privateCreator).toBe("ACME");
    expect(el?.vr).toBe("UN");
    const codes = ds.warnings.map((w) => w.code);
    expect(codes).not.toContain(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR);
    // Still flagged for Phase 6 profile-supplied VR override.
    expect(codes).toContain(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR);
  });

  it("off-by-0x1000 trap: creator at (0019,0010) does NOT cover (0019,2000)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [
        { tag: "00190010", vr: "LO", value: Buffer.from("ACME", "ascii") },
        { tag: "00192000", vr: "LO", value: Buffer.from("foreign!", "ascii") },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00192000");
    expect(el).toBeDefined();
    expect(el?.privateCreator).toBeUndefined();
    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR);
  });
});

describe("parseImplicitLE — undefined-length SQ descent (D-21 + parseSequence)", () => {
  it("(0040,A730) ContentSequence with undefined length descends into the item body", () => {
    // Implicit VR LE has no on-wire VR; the parser resolves SQ from the
    // dictionary for ContentSequence, sees length 0xFFFFFFFF, and delegates
    // to parseSequence. The inner item carries one Implicit-LE element.
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
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
    expect(el?.length).toBe(0xffffffff);
    // vm reflects the one parsed item.
    expect(el?.vm).toBe(1);
  });

  it("explicit-length SQ also descends (defined item body, no SeqDelim)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [
        {
          tag: "0040A730",
          items: [
            { elements: [{ tag: "00080100", vr: "SH", value: Buffer.from("ABCD", "ascii") }] },
          ],
        },
      ],
    });
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("0040A730");
    expect(el?.vr).toBe("SQ");
    expect(el?.vm).toBe(1);
  });

  it("copyValues=true on an SQ element isolates the composite rawBytes from the source", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
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
    const ds = parseDicom(buf, { copyValues: true });
    const el = elementsOf(ds).get("0040A730");
    expect(el).toBeDefined();
    const before = Buffer.from(el?.rawBytes ?? Buffer.alloc(0));
    // Smash the source; copied composite bytes must be unaffected.
    buf.fill(0xff, 0, buf.length);
    expect(el?.rawBytes.equals(before)).toBe(true);
  });
});

describe("parseImplicitLE — undefined length on a non-SQ VR is fatal", () => {
  it("throws INVALID_FILE_META for a non-SQ tag carrying length 0xFFFFFFFF", () => {
    // (0010,0010) PatientName resolves to PN, not SQ. Under Implicit VR LE
    // there is no way to encode an explicit UN, so undefined length here is
    // structurally invalid and must not be mistaken for a sequence.
    const headerBuf = buildDicom({ transferSyntax: "1.2.840.10008.1.2", elements: [] });
    const malformed = Buffer.alloc(8);
    malformed.writeUInt16LE(0x0010, 0); // group
    malformed.writeUInt16LE(0x0010, 2); // element -> PN
    malformed.writeUInt32LE(0xffffffff, 4); // undefined length on a non-SQ VR
    const buf = Buffer.concat([headerBuf, malformed]);
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

describe("parseImplicitLE — threat model mitigations", () => {
  it("T-02-03-01: truncated dataset throws DicomParseError(INVALID_FILE_META) not RangeError", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    // Truncate inside the dataset element's header (after File Meta).
    // The element header is 8 bytes; cut into the middle.
    const truncated = buf.subarray(0, buf.length - 6);
    try {
      parseDicom(truncated);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });

  it("T-02-03-01: buffer ending INSIDE an element header (not its value) → INVALID_FILE_META", () => {
    // Distinct from the value-overflow case: here the 8-byte element header
    // itself is truncated, so the group/element/length cursor reads overrun
    // and the RangeError is caught and re-thrown as a typed fatal.
    const headerBuf = buildDicom({ transferSyntax: "1.2.840.10008.1.2", elements: [] });
    const partialHeader = Buffer.from([0x10, 0x00, 0x10, 0x00]); // 4 of 8 header bytes
    const buf = Buffer.concat([headerBuf, partialHeader]);
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });

  it("T-02-03-02: declared element length exceeds remaining buffer → INVALID_FILE_META", () => {
    // Manually craft a buffer: valid Part 10 + File Meta from buildDicom,
    // then a single Implicit-LE header declaring length 999_999 with no
    // value bytes following.
    const headerBuf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [],
    });
    const malformedHeader = Buffer.alloc(8);
    malformedHeader.writeUInt16LE(0x0010, 0); // group
    malformedHeader.writeUInt16LE(0x0010, 2); // element
    malformedHeader.writeUInt32LE(999_999, 4); // length
    const buf = Buffer.concat([headerBuf, malformedHeader]);
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });

  it("unexpected FFFE marker at root throws INVALID_FILE_META", () => {
    const headerBuf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2",
      elements: [],
    });
    // (FFFE,E000) Item header at root with length=0 — valid only inside
    // a sequence; at root it must throw.
    const itemHeader = Buffer.alloc(8);
    itemHeader.writeUInt16LE(0xfffe, 0);
    itemHeader.writeUInt16LE(0xe000, 2);
    itemHeader.writeUInt32LE(0, 4);
    const buf = Buffer.concat([headerBuf, itemHeader]);
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

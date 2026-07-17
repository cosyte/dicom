import { describe, it, expect } from "vitest";

import {
  WARNING_CODES,
  emptyItemInSequence,
  fileMetaGroupLengthMismatch,
  fileMetaGroupLengthMissing,
  groupLengthInDataset,
  implicitVRForPrivateTagWithoutVR,
  missingPreamble,
  nonzeroReservedBytes,
  oddLengthValuePadded,
  pixelDataLengthMismatch,
  privateTagNoCreator,
  unParsedAsSQ,
  undefinedLengthInExplicitVR,
  vrMismatch,
} from "../../src/parser/warnings.js";

describe("WARNING_CODES (D-08)", () => {
  it("has at least 24 codes (D-08 — full TOL-03 catalog enumeration)", () => {
    // CONTEXT.md D-08 enumerates 24 unique codes: 13 actively-emitted + 7
    // VR-decode-time (Phase 3) + 2 charset (Phase 4) + 2 reserved
    // (Phase 6 PRIVATE_CREATOR_UNKNOWN + Phase 7 BURNED_IN_ANNOTATION_NOT_REMOVED).
    // The plan's ≥25 verification grep counts lines containing "DICOM_" across
    // both the registry and the factory references — that grep is satisfied
    // independently of the unique-key count.
    expect(Object.keys(WARNING_CODES).length).toBeGreaterThanOrEqual(24);
  });

  it("every value equals its key (string-literal registry)", () => {
    for (const [k, v] of Object.entries(WARNING_CODES)) {
      expect(v).toBe(k);
    }
  });

  it("contains every Phase-2 actively-emitted code", () => {
    const active: ReadonlyArray<keyof typeof WARNING_CODES> = [
      "DICOM_EMPTY_ITEM_IN_SEQUENCE",
      "DICOM_FILE_META_GROUP_LENGTH_MISMATCH",
      "DICOM_FILE_META_GROUP_LENGTH_MISSING",
      "DICOM_GROUP_LENGTH_IN_DATASET",
      "DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR",
      "DICOM_MISSING_PREAMBLE",
      "DICOM_NONZERO_RESERVED_BYTES",
      "DICOM_ODD_LENGTH_VALUE_PADDED",
      "DICOM_PIXEL_DATA_LENGTH_MISMATCH",
      "DICOM_PRIVATE_TAG_NO_CREATOR",
      "DICOM_UN_PARSED_AS_SQ",
      "DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR",
      "DICOM_VR_MISMATCH",
    ];
    for (const code of active) {
      expect(WARNING_CODES[code]).toBe(code);
    }
  });

  it("contains every reserved (declared but not emitted in Phase 2) code", () => {
    const reserved: ReadonlyArray<keyof typeof WARNING_CODES> = [
      // Phase 3 — VR-decode-time
      "DICOM_BOM_IN_TEXT_VR",
      "DICOM_DA_LEGACY_FORMAT",
      "DICOM_DT_NONSTANDARD_OFFSET",
      "DICOM_IS_NONINTEGER_VALUE",
      "DICOM_NON_ASCII_IN_ASCII_VR",
      "DICOM_TRAILING_NULL_IN_TEXT_VR",
      "DICOM_UI_TRAILING_SPACE",
      // Phase 4 — charset-decode
      "DICOM_CHARSET_AMBIGUOUS_SEPARATOR",
      "DICOM_UNSUPPORTED_CHARSET",
      // Phase 6 / Phase 7 — reserved
      "DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED",
      "DICOM_PRIVATE_CREATOR_UNKNOWN",
    ];
    for (const code of reserved) {
      expect(WARNING_CODES[code]).toBe(code);
    }
  });
});

describe("warning factories (D-12 — one named factory per active-emit code)", () => {
  const pos = { byteOffset: 0 } as const;

  it("missingPreamble", () => {
    const w = missingPreamble(pos);
    expect(w.code).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
    expect(w.position).toBe(pos);
    expect(w.message.length).toBeGreaterThan(0);
  });

  it("fileMetaGroupLengthMissing", () => {
    const w = fileMetaGroupLengthMissing(pos);
    expect(w.code).toBe(WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING);
  });

  it("fileMetaGroupLengthMismatch (carries declared + actual in message)", () => {
    const w = fileMetaGroupLengthMismatch(pos, 200, 208);
    expect(w.code).toBe(WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH);
    expect(w.message).toContain("200");
    expect(w.message).toContain("208");
  });

  it("undefinedLengthInExplicitVR", () => {
    const w = undefinedLengthInExplicitVR(pos, "0040A730");
    expect(w.code).toBe(WARNING_CODES.DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR);
    expect(w.message).toContain("0040A730");
  });

  it("oddLengthValuePadded", () => {
    const w = oddLengthValuePadded(pos, "00100010", 9);
    expect(w.code).toBe(WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED);
    expect(w.message).toContain("9");
  });

  it("vrMismatch", () => {
    const w = vrMismatch(pos, "00100010", "PN", "LO");
    expect(w.code).toBe(WARNING_CODES.DICOM_VR_MISMATCH);
    expect(w.message).toContain("PN");
    expect(w.message).toContain("LO");
  });

  it("privateTagNoCreator", () => {
    const w = privateTagNoCreator(pos, "00191020");
    expect(w.code).toBe(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR);
  });

  it("groupLengthInDataset", () => {
    const w = groupLengthInDataset(pos, "00080000");
    expect(w.code).toBe(WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET);
  });

  it("nonzeroReservedBytes", () => {
    const w = nonzeroReservedBytes(pos, "7FE00010", "00ff");
    expect(w.code).toBe(WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES);
    expect(w.message).toContain("00ff");
  });

  it("unParsedAsSQ", () => {
    const w = unParsedAsSQ(pos, "0040A730");
    expect(w.code).toBe(WARNING_CODES.DICOM_UN_PARSED_AS_SQ);
  });

  it("emptyItemInSequence", () => {
    const w = emptyItemInSequence(pos, "0040A730");
    expect(w.code).toBe(WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE);
  });

  it("pixelDataLengthMismatch", () => {
    const w = pixelDataLengthMismatch(pos, 524288, 524300);
    expect(w.code).toBe(WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH);
    expect(w.message).toContain("524288");
    expect(w.message).toContain("524300");
  });

  it("implicitVRForPrivateTagWithoutVR", () => {
    const w = implicitVRForPrivateTagWithoutVR(pos, "00191020");
    expect(w.code).toBe(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR);
  });
});

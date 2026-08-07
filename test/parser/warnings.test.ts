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
  privateCreatorUnknown,
  privateTagNoCreator,
  unParsedAsSQ,
  undefinedLengthInExplicitVR,
  vrMismatch,
} from "../../src/parser/warnings.js";

describe("WARNING_CODES (D-08)", () => {
  it("has at least 24 codes (D-08 - full TOL-03 catalog enumeration)", () => {
    // 25 today. CONTEXT.md D-08 enumerated 24 unique codes: 13 actively-emitted + 7
    // VR-decode-time (Phase 3) + 2 charset (Phase 4) + 2 reserved
    // (Phase 6 PRIVATE_CREATOR_UNKNOWN + Phase 7 BURNED_IN_ANNOTATION_NOT_REMOVED).
    // The plan's ≥25 verification grep counts lines containing "DICOM_" across
    // both the registry and the factory references - that grep is satisfied
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
      // Added by `DICOM-TAG-COLLISION-DESTROYS-ELEMENT`: emitted by
      // `defineElement` when an element replaces one the Data Set already holds.
      "DICOM_DUPLICATE_TAG_IN_DATA_SET",
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
      // Phase 3 - VR-decode-time
      "DICOM_BOM_IN_TEXT_VR",
      "DICOM_DA_LEGACY_FORMAT",
      "DICOM_DT_NONSTANDARD_OFFSET",
      "DICOM_IS_NONINTEGER_VALUE",
      "DICOM_NON_ASCII_IN_ASCII_VR",
      "DICOM_TRAILING_NULL_IN_TEXT_VR",
      "DICOM_UI_TRAILING_SPACE",
      // Phase 4 - charset-decode
      "DICOM_CHARSET_AMBIGUOUS_SEPARATOR",
      "DICOM_UNSUPPORTED_CHARSET",
      // Phase 6 / Phase 7 - reserved
      "DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED",
      "DICOM_PRIVATE_CREATOR_UNKNOWN",
    ];
    for (const code of reserved) {
      expect(WARNING_CODES[code]).toBe(code);
    }
  });
});

describe("warning factories (D-12 - one named factory per active-emit code)", () => {
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

  it("oddLengthValuePadded takes no declared length, so no call site can pass one", () => {
    // The fifth instance of `DICOM-DIAGNOSTIC-PHI-RESIDUALS`, and the worst of
    // the six: this message rendered a fabricated tag AND a fabricated 32-bit
    // declared length, eight consecutive payload bytes. The tag survives because
    // `renderTag` is a membership test now; the length cannot, because a raw
    // number has neither a shape nor a membership to check. So the bound is the
    // signature, exactly as for `itemCrossesSequenceEnd`.
    expect(oddLengthValuePadded.length).toBe(2);
    const w = oddLengthValuePadded(pos, "00100010");
    expect(w.code).toBe(WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED);
    // The tag is a literal PS3.6 row, so it still renders: the bound must not
    // have cost a well-formed file its tag.
    expect(w.message).toContain("00100010");
    expect(w.message).toContain("withheld");
    // Non-vacuity on the LENGTH half: rebuild `0.0.14`'s own template and prove
    // this assertion could fail. A green row must not mean "there was never a
    // number here to look for".
    const shipped =
      "Element (00100010) has odd declared length 9; cursor advanced by one padding byte.";
    expect(/\bodd declared length \d/u.test(shipped)).toBe(true);
    expect(/\bodd declared length \d/u.test(w.message)).toBe(false);
  });

  it("vrMismatch", () => {
    const w = vrMismatch(pos, "00100010", "PN", "LO");
    expect(w.code).toBe(WARNING_CODES.DICOM_VR_MISMATCH);
    expect(w.message).toContain("PN");
    expect(w.message).toContain("LO");
  });

  it("privateTagNoCreator", () => {
    const w = privateTagNoCreator(pos);
    expect(w.code).toBe(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR);
  });

  it.each([
    ["privateTagNoCreator", privateTagNoCreator],
    ["implicitVRForPrivateTagWithoutVR", implicitVRForPrivateTagWithoutVR],
    ["privateCreatorUnknown", privateCreatorUnknown],
  ] as const)("%s takes no tag at all, so no call site can pass one", (_name, factory) => {
    // The bound is the SIGNATURE, as it is for `nonzeroReservedBytes` - but the
    // reason is the tag's CLASS rather than the trigger. All three fire only on
    // an ODD group, and an odd group is the one class of tag no closed table
    // this library holds can vouch for: PS3.6's registry is even-group, and a
    // Profile's private dictionary is keyed by a creator string. `renderTag` is
    // a MEMBERSHIP test now and would withhold every one of these tags anyway;
    // the signature bound stays because a slot that cannot render is a slot a
    // future call site can still be handed.
    expect(factory.length).toBe(1);
    const w = factory({ byteOffset: 284 });
    expect(w.message).not.toMatch(/[0-9A-F]{8}/u);
    expect(w.message).toContain("withheld");
    expect(w.message).toContain("byte offset");
  });

  it("groupLengthInDataset takes no tag, because the membership rule emptied the slot", () => {
    // Not a judgement taken here. PS3.6 carries exactly one literal row ending
    // `0000` - `(0002,0000)`, which is File Meta and never reaches this code -
    // so every tag this slot could have rendered was already withheld. A slot
    // that can never render invites a future call site to pass one.
    expect(groupLengthInDataset.length).toBe(1);
    const w = groupLengthInDataset(pos);
    expect(w.code).toBe(WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET);
    expect(w.message).not.toMatch(/[0-9A-F]{8}/u);
    expect(w.message).toContain("withheld");
    expect(w.message).toContain("byte offset");
  });

  it("nonzeroReservedBytes takes neither a tag NOR the two byte values", () => {
    // The SIXTH instance of `DICOM-DIAGNOSTIC-PHI-RESIDUALS`, measured by this
    // slice and filed nowhere before it. The tag was already bound out here
    // because the trigger is "these bytes are not what PS3.5 7.1.2 requires", so
    // the header may not be a header - and the two reserved bytes come off that
    // same header. They shipped through `0.0.14` as two decimals, which is a
    // re-encoding a reader reverses by looking at it. The bound is the
    // SIGNATURE, so no call site can put either back.
    expect(nonzeroReservedBytes.length).toBe(1);
    const w = nonzeroReservedBytes({ byteOffset: 284 });
    expect(w.code).toBe(WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES);
    expect(w.message).not.toMatch(/[0-9A-F]{8}/u);
    expect(w.message).toContain("withheld");
    expect(w.message).toContain("byte offset");
    // Non-vacuity: `0.0.14`'s own template, so a green row cannot mean the
    // pattern never matched anything.
    const shipped =
      "Non-zero reserved bytes between VR and length (first byte 78, second byte 32); ignoring.";
    expect(/(?:first|second) byte \d/u.test(shipped)).toBe(true);
    expect(/(?:first|second) byte \d/u.test(w.message)).toBe(false);
  });

  it("unParsedAsSQ", () => {
    const w = unParsedAsSQ(pos, "0040A730");
    expect(w.code).toBe(WARNING_CODES.DICOM_UN_PARSED_AS_SQ);
  });

  it("emptyItemInSequence", () => {
    const w = emptyItemInSequence(pos, "0040A730");
    expect(w.code).toBe(WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE);
  });

  it("pixelDataLengthMismatch keeps the COMPUTED count and drops the DECLARED length", () => {
    // Not emitted by this build, which is the reason to bind it NOW: with no
    // call site the change costs nothing, and a later phase switching the code
    // on would otherwise ship `oddLengthValuePadded`'s leak one code over. The
    // computed figure is a product this parser calculates, not a number it read.
    expect(pixelDataLengthMismatch.length).toBe(2);
    const w = pixelDataLengthMismatch(pos, 524300);
    expect(w.code).toBe(WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH);
    expect(w.message).toContain("524300");
    expect(w.message).not.toContain("524288");
    expect(w.message).toContain("withheld");
  });

  it("implicitVRForPrivateTagWithoutVR", () => {
    const w = implicitVRForPrivateTagWithoutVR(pos);
    expect(w.code).toBe(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR);
  });
});

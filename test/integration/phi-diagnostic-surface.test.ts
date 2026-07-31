/**
 * The diagnostic-surface PHI gate: does a byte a sender authored reach a place
 * a consumer will log?
 *
 * Bound by the shared runner `assertNoDiagnosticPhiLeak` from
 * `@cosyte/test-utils`, not by a hand-rolled sweep. What it proves is narrow and
 * stated in that package's README; what it proves *here* is decided entirely by
 * the slot table below, which is the real deliverable.
 *
 * ## Why the slot table is the deliverable
 *
 * This package already had property tests that could not have failed. Their
 * generator blocked the leaking path three independent ways, and the third is
 * the one to remember: `TEXT_ALPHABET` in `test/property/_arbitraries.ts`
 * excludes the backslash "so a single-valued element stays single-valued", and
 * the backslash is exactly the byte `(0008,0005)` Specific Character Set splits
 * on before the leaking branch. `TAG_VR` also never generates `(0008,0005)` at
 * all, and no generator emits a Private Creator element, so two more leaking
 * factories were unreachable. A suite green over unreachable space is not
 * evidence.
 *
 * So the table below enumerates **every consumer-controlled position**, not the
 * ones that look like PHI: element values across the VRs, private creator tags,
 * transfer syntax and SOP class UIDs, character-set values, and multi-valued
 * elements **containing the backslash delimiter**. Every slot names the
 * diagnostic code it must reach, and the runner fails a slot whose code never
 * appeared.
 *
 * ## The marker alphabet, dealt with rather than assumed
 *
 * `PHI_MARKER_UNIT` is `ZqPhI7xK`, which is not valid in `UI` (PS3.5 section 6.2
 * allows digits and `.`) or in `CS` (upper case, digits, space, `_`) - the two
 * VRs most worth probing here. That matters only if the parser rejects or
 * normalizes the marker *before* the leaking branch, and it does not: Postel's
 * Law is the documented read-path posture, so no VR character set is validated
 * on parse. `(0008,0005)` terms are tested for **membership** in a closed table,
 * not for shape, and `(0002,0010)` is tested for membership in the four
 * supported syntaxes; a marker misses both and reaches the branch verbatim.
 * `expectCode` on every slot is what turns that from an assumption into a
 * measurement, and {@link markerReachesTheModelVerbatim} pins the one case where
 * the parser does fold case (`(0028,0301)`, upper-cased before comparison) -
 * runner matching is case-insensitive, so a folded echo is still caught.
 *
 * ## Codes deliberately not slotted
 *
 * `DICOM_PIXEL_DATA_LENGTH_MISMATCH` is declared in `WARNING_CODES` and has no
 * emit site anywhere in `src/` (its factory is dead code this build never
 * reaches), so no input can carry a marker through it. It is named here rather
 * than silently omitted, because "the table skipped it" and "the code cannot
 * fire" are different facts and only the second is safe.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { PHI_MARKER_UNIT, assertNoDiagnosticPhiLeak } from "@cosyte/test-utils";
import type { DiagnosticSlot } from "@cosyte/test-utils";
import { describe, expect, it } from "vitest";

import { Dataset } from "../../src/dataset/dataset.js";
import type { Element } from "../../src/dataset/element.js";
import { deidentify } from "../../src/deident/index.js";
import type { DeidentifyReport } from "../../src/deident/types.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { parseDicom } from "../../src/parser/index.js";
import { WARNING_CODES } from "../../src/parser/warnings.js";
import { defineProfile } from "../../src/profiles/index.js";
import { serializeDicom } from "../../src/serialize/serialize.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Pad to even length with the ASCII space DICOM uses for text VRs. */
function even(bytes: Buffer): Buffer {
  return bytes.length % 2 === 0 ? bytes : Buffer.concat([bytes, Buffer.from([0x20])]);
}

/** Latin-1 bytes for a value, padded to the even length PS3.5 section 7.1 requires. */
function val(text: string): Buffer {
  return even(Buffer.from(text, "latin1"));
}

/** A spec-clean filler element so a fixture is never a bare File Meta group. */
const FILLER = { tag: "00080060" as Tag, vr: "CS" as VR, value: val("CT") };

// ---------------------------------------------------------------------------
// Fixtures that `buildDicom` cannot express.
// ---------------------------------------------------------------------------

/**
 * An Explicit-LE `OB` element whose long-form header carries non-zero reserved
 * bytes between the VR and the 4-byte length. `buildDicom` always writes zeroes,
 * so the two bytes are poked in afterwards.
 */
function nonzeroReservedFixture(marker: string): Buffer {
  const buf = buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [{ tag: "00181020" as Tag, vr: "OB" as VR, value: val(marker) }],
  });
  const obIdx = buf.lastIndexOf(Buffer.from("OB", "ascii"));
  if (obIdx <= 0 || obIdx + 3 >= buf.length) {
    throw new Error("nonzeroReservedFixture: OB header not located");
  }
  buf[obIdx + 3] = 0xff;
  return buf;
}

/**
 * A CP-246 fixture: a private `UN` element of undefined length whose value is an
 * Implicit-VR-LE sequence, so the parser descends it and emits
 * `DICOM_UN_PARSED_AS_SQ`. The marker sits in `(0010,0010)` inside the item, which
 * is only reachable through that descent.
 */
function cp246Fixture(marker: string): Buffer {
  const value = val(marker);
  const pnHeader = Buffer.alloc(8);
  pnHeader.writeUInt16LE(0x0010, 0);
  pnHeader.writeUInt16LE(0x0010, 2);
  pnHeader.writeUInt32LE(value.length, 4);
  const itemBody = Buffer.concat([pnHeader, value]);
  const itemHeader = Buffer.alloc(8);
  itemHeader.writeUInt16LE(0xfffe, 0);
  itemHeader.writeUInt16LE(0xe000, 2);
  itemHeader.writeUInt32LE(itemBody.length, 4);
  const seqDelim = Buffer.alloc(8);
  seqDelim.writeUInt16LE(0xfffe, 0);
  seqDelim.writeUInt16LE(0xe0dd, 2);
  seqDelim.writeUInt32LE(0, 4);
  const unElement = Buffer.concat([
    Buffer.from([0x09, 0x00, 0x00, 0x10]),
    Buffer.from("UN", "ascii"),
    Buffer.from([0x00, 0x00]),
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    itemHeader,
    itemBody,
    seqDelim,
  ]);
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
  return Buffer.concat([Buffer.alloc(128, 0x00), Buffer.from("DICM", "ascii"), fmGroupLen, fmTs, unElement]);
}

// ---------------------------------------------------------------------------
// The model selectors. Both are required by the runner, and both are the place
// a wrong answer turns the whole suite green over nothing.
// ---------------------------------------------------------------------------

/**
 * Every diagnostic collection the model exposes, and there are **two**.
 *
 * `Dataset.warnings` is the structural-parse array. The second is easy to miss:
 * VR decode is lazy and post-parse, so a decode-time deviation cannot be folded
 * into the frozen `Dataset.warnings` and rides on `Element.value.warnings`
 * instead (`src/dataset/vr/types.ts`). Seven of the twenty-four codes live only
 * there. Reading `.value` here is what forces the lazy decode, so a selector
 * that only walked `ds.warnings` would report green for the entire Phase 3
 * decode surface.
 */
function allDiagnostics(parsed: { readonly dataset: Dataset }): readonly unknown[] {
  const out: unknown[] = [...parsed.dataset.warnings];
  const walk = (ds: Dataset): void => {
    for (const el of ds.elements()) {
      const decoded = el.value as { readonly warnings?: readonly unknown[] };
      out.push(...(decoded.warnings ?? []));
      for (const item of el.items ?? []) walk(item);
    }
  };
  walk(parsed.dataset);
  return out;
}

/**
 * Every **structural identifier** string the model carries: the fields a
 * downstream package would interpolate to describe a location. Enumerated from
 * the exported type definitions rather than from memory, because a list
 * assembled by intuition is how the sibling slice shipped an unbounded field
 * past two rounds of review. The full field-by-field accounting, including which
 * fields are deliberately absent because the model legitimately carries them as
 * data, is in `docs-content/spec-notes-safety.md`.
 *
 * Present: `Element.tag`, `Element.vr`, `Element.privateCreator`,
 * `Element.specificCharacterSet[]`, `FileMeta.transferSyntaxUID`,
 * `FileMetaRawElement.tag` / `.vr`, recursively through `Element.items`.
 *
 * Absent, as data rather than identifiers: `Element.rawBytes`, `Element.value`,
 * `FileMeta.mediaStorageSOPClassUID` / `.mediaStorageSOPInstanceUID` /
 * `.implementationClassUID` / `.implementationVersionName` /
 * `.sourceApplicationEntityTitle` / `.fileMetaInformationVersion`,
 * `FileMetaRawElement.value`.
 */
function modelIdentifiers(parsed: { readonly dataset: Dataset }): readonly string[] {
  const out: string[] = [];
  const fm = parsed.dataset.fileMeta;
  if (fm !== undefined) {
    out.push(fm.transferSyntaxUID);
    for (const extra of fm.extraElements ?? []) out.push(extra.tag, extra.vr);
  }
  const walk = (ds: Dataset): void => {
    for (const el of ds.elements()) {
      out.push(el.tag, el.vr);
      if (el.privateCreator !== undefined) out.push(el.privateCreator);
      out.push(...(el.specificCharacterSet ?? []));
      for (const item of el.items ?? []) walk(item);
    }
  };
  walk(parsed.dataset);
  return out;
}

const parse = (raw: Buffer): { readonly dataset: Dataset } => ({ dataset: parseDicom(raw) });
const parseStrict = (raw: Buffer): { readonly dataset: Dataset } => ({
  dataset: parseDicom(raw, { strict: true }),
});

// ---------------------------------------------------------------------------
// The slot table.
// ---------------------------------------------------------------------------

const PARSE_SLOTS: readonly DiagnosticSlot<Buffer>[] = [
  {
    name: "(0002,0010) TransferSyntaxUID [UI]",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        skipTransferSyntaxUID: true,
        fileMetaExtraElements: [{ tag: "00020010" as Tag, vr: "UI" as VR, value: val(m) }],
        elements: [],
      }),
    expectCode: "UNSUPPORTED_TRANSFER_SYNTAX",
  },
  {
    name: "(0008,0005) SpecificCharacterSet [CS], sole value",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080005" as Tag, vr: "CS" as VR, value: val(m) }, FILLER],
      }),
    expectCode: WARNING_CODES.DICOM_UNSUPPORTED_CHARSET,
  },
  {
    name: "(0008,0005) SpecificCharacterSet [CS], SECOND value after the backslash delimiter",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005" as Tag, vr: "CS" as VR, value: val(`ISO_IR 100\\${m}`) },
          FILLER,
        ],
      }),
    expectCode: WARNING_CODES.DICOM_UNSUPPORTED_CHARSET,
  },
  {
    name: "(0008,0005) SpecificCharacterSet [CS], FIRST value before the backslash delimiter",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005" as Tag, vr: "CS" as VR, value: val(`${m}\\ISO_IR 100`) },
          FILLER,
        ],
      }),
    expectCode: WARNING_CODES.DICOM_UNSUPPORTED_CHARSET,
  },
  {
    name: "(0009,0010) Private Creator [LO], no active profile",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_IMPLICIT_LE,
        elements: [
          { tag: "00090010" as Tag, vr: "LO" as VR, value: val(m) },
          { tag: "00091001" as Tag, vr: "UN" as VR, value: val("X") },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR,
  },
  {
    name: "(0009,1001) private data element value, no creator registered",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_IMPLICIT_LE,
        elements: [{ tag: "00091001" as Tag, vr: "UN" as VR, value: val(m) }],
      }),
    expectCode: WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR,
  },
  {
    name: "(0010,0010) PatientName value under an on-wire VR the dictionary disagrees with",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100010" as Tag, vr: "LO" as VR, value: val(m) }],
      }),
    expectCode: WARNING_CODES.DICOM_VR_MISMATCH,
  },
  {
    name: "(0010,0020) PatientID [LO], odd declared length",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00100020" as Tag, vr: "LO" as VR, value: Buffer.from(`${m}X`, "latin1") },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED,
  },
  {
    name: "(0008,0018) SOPInstanceUID [UI], SPACE-padded",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080018" as Tag, vr: "UI" as VR, value: Buffer.from(`${m}  `, "latin1") },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_UI_TRAILING_SPACE,
  },
  {
    name: "(0008,0060) Modality [CS], non-ASCII byte in an ASCII-only VR",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080060" as Tag, vr: "CS" as VR, value: Buffer.from(`${m}\xe9 `, "latin1") },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_NON_ASCII_IN_ASCII_VR,
  },
  {
    name: "(0020,0013) InstanceNumber [IS], not a base-10 integer",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00200013" as Tag, vr: "IS" as VR, value: val(m) }],
      }),
    expectCode: WARNING_CODES.DICOM_IS_NONINTEGER_VALUE,
  },
  {
    name: "(0008,0020) StudyDate [DA], non-canonical form",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080020" as Tag, vr: "DA" as VR, value: val(m) }],
      }),
    expectCode: WARNING_CODES.DICOM_DA_LEGACY_FORMAT,
  },
  {
    name: "(0040,A120) DateTime [DT], malformed UTC offset",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "0040A120" as Tag, vr: "DT" as VR, value: val(`20240101120000+${m}`) },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_DT_NONSTANDARD_OFFSET,
  },
  {
    name: "(0008,1030) StudyDescription [LO], behind a UTF-8 BOM",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "00081030" as Tag,
            vr: "LO" as VR,
            value: even(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(m, "latin1")])),
          },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_BOM_IN_TEXT_VR,
  },
  {
    name: "(0010,0020) PatientID [LO], NUL-padded where SPACE is expected",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00100020" as Tag, vr: "LO" as VR, value: Buffer.from(`${m}\0\0`, "latin1") },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_TRAILING_NULL_IN_TEXT_VR,
  },
  {
    name: "(0040,A730) ContentSequence item value, undefined length under Explicit VR",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "0040A730" as Tag,
            undefinedLength: true,
            items: [{ elements: [{ tag: "00100010" as Tag, vr: "PN" as VR, value: val(m) }] }],
          },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR,
  },
  {
    name: "(0040,A730) ContentSequence, value in the item beside an empty item",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "0040A730" as Tag,
            undefinedLength: true,
            items: [
              { elements: [] },
              { elements: [{ tag: "00100010" as Tag, vr: "PN" as VR, value: val(m) }] },
            ],
          },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE,
  },
  {
    name: "(0010,0020) PatientID [LO] beside a retired (0008,0000) group length",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080000" as Tag, vr: "UL" as VR, value: Buffer.from([4, 0, 0, 0]) },
          { tag: "00100020" as Tag, vr: "LO" as VR, value: val(m) },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET,
  },
  {
    name: "(0018,1020) SoftwareVersions [OB] with non-zero reserved header bytes",
    plant: nonzeroReservedFixture,
    expectCode: WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES,
  },
  {
    name: "(0010,0020) PatientID [LO] in a file with no preamble",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        skipPreamble: true,
        elements: [{ tag: "00100020" as Tag, vr: "LO" as VR, value: val(m) }],
      }),
    expectCode: WARNING_CODES.DICOM_MISSING_PREAMBLE,
  },
  {
    name: "(0002,0013) ImplementationVersionName [SH], File Meta group length omitted",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        fileMetaGroupLength: "omit",
        implementationVersionName: m,
        elements: [FILLER],
      }),
    expectCode: WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
  },
  {
    name: "(0002,0013) ImplementationVersionName [SH], File Meta group length wrong",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        fileMetaGroupLength: "wrong",
        implementationVersionName: m,
        elements: [FILLER],
      }),
    expectCode: WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH,
  },
  {
    name: "(0009,1000) UN undefined length, value inside the CP-246 inner item",
    plant: cp246Fixture,
    expectCode: WARNING_CODES.DICOM_UN_PARSED_AS_SQ,
  },
  // ---------------------------------------------------------------------
  // File Meta typed fields. These four reach no diagnostic at all: File Meta
  // is projected by `parseFileMeta` with no VR decode and no validation, so
  // there is no code for `expectCode` to name and `null` is the honest answer
  // rather than a shortcut. Their reach is proven a stronger way instead, by
  // `markerReachesTheModelVerbatim` below, which asserts the planted marker is
  // literally the value of the model field: a probe that lands ON the surface
  // under test cannot have been ignored. They stay in the table because the
  // runner still sweeps every diagnostic and every model identifier for them,
  // which is what proves a File Meta value never reaches either.
  // ---------------------------------------------------------------------
  {
    name: "(0002,0002) MediaStorageSOPClassUID [UI]",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        mediaStorageSOPClassUID: m,
        elements: [FILLER],
      }),
    expectCode: null,
  },
  {
    name: "(0002,0003) MediaStorageSOPInstanceUID [UI]",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        mediaStorageSOPInstanceUID: m,
        elements: [FILLER],
      }),
    expectCode: null,
  },
  {
    name: "(0002,0012) ImplementationClassUID [UI]",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        implementationClassUID: m,
        elements: [FILLER],
      }),
    expectCode: null,
  },
  {
    name: "(0002,0016) SourceApplicationEntityTitle [AE]",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        fileMetaExtraElements: [{ tag: "00020016" as Tag, vr: "AE" as VR, value: val(m) }],
        elements: [FILLER],
      }),
    expectCode: null,
  },
];

/** A profile that recognizes one creator, so an unrecognized one degrades and warns. */
const PROBE_PROFILE = defineProfile({
  name: "probe",
  privateTags: {
    "PROBE KNOWN 01": { "0009XX01": { vr: "LO", keyword: "ProbeThing", name: "Probe Thing" } },
  },
});

const PROFILE_SLOTS: readonly DiagnosticSlot<Buffer>[] = [
  {
    name: "(0009,0010) Private Creator [LO], active profile does not recognize it",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_IMPLICIT_LE,
        elements: [
          { tag: "00090010" as Tag, vr: "LO" as VR, value: val(m) },
          { tag: "00091001" as Tag, vr: "UN" as VR, value: val("X") },
        ],
      }),
    expectCode: WARNING_CODES.DICOM_PRIVATE_CREATOR_UNKNOWN,
  },
];

// ---------------------------------------------------------------------------
// The de-identify surface. `deidentify` is the product's "safe to share"
// promise, so its output dataset AND its report are swept as one model.
// ---------------------------------------------------------------------------

interface DeidSurface {
  readonly dataset: Dataset;
  readonly report: DeidentifyReport;
}

function deidentifySurface(raw: Buffer): DeidSurface {
  const { dataset, report } = deidentify(parseDicom(raw));
  return { dataset, report };
}

function deidDiagnostics(parsed: DeidSurface): readonly unknown[] {
  return [...allDiagnostics(parsed), ...parsed.report.warnings];
}

/**
 * Structural identifiers on the de-identified model, plus every identifier the
 * report composes: the per-attribute tag, keyword, sequence context path and
 * repeating-group mask, the removed private tags, and the active option names.
 *
 * `report.uidMap` is deliberately absent, and it is the one part of the report
 * that is not value-free: its keys are the source UIDs read out of the file, kept
 * so a caller can make UID replacement consistent across a study. That is data
 * the report must carry to do its job, not an identifier the parser composed,
 * and the docs now say so instead of calling the whole report value-free.
 */
function deidIdentifiers(parsed: DeidSurface): readonly string[] {
  const out: string[] = [...modelIdentifiers(parsed)];
  for (const attr of parsed.report.attributes) {
    out.push(attr.tag, attr.keyword, attr.action, attr.applied);
    out.push(...(attr.contextPath ?? []));
    if (attr.repeatingGroup !== undefined) out.push(attr.repeatingGroup);
  }
  out.push(...parsed.report.removedPrivateTags, ...parsed.report.retained);
  return out;
}

/** Pixel Data present with a Burned In Annotation value that is not `"NO"`. */
function burnedInFixture(marker: string): Buffer {
  return buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [
      { tag: "00280301" as Tag, vr: "CS" as VR, value: val(marker) },
      { tag: "7FE00010" as Tag, vr: "OW" as VR, value: val("\0\0") },
    ],
  });
}

const DEID_SLOTS: readonly DiagnosticSlot<Buffer>[] = [
  {
    name: "deidentify: (0008,0005) SpecificCharacterSet [CS] carried onto the shared dataset",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080005" as Tag, vr: "CS" as VR, value: val(m) }, FILLER],
      }),
    expectCode: WARNING_CODES.DICOM_UNSUPPORTED_CHARSET,
  },
  {
    name: "deidentify: (0028,0301) BurnedInAnnotation [CS]",
    plant: burnedInFixture,
    expectCode: WARNING_CODES.DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED,
  },
  {
    name: "deidentify: (0010,0010) PatientName [PN], an attribute Annex E removes",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100010" as Tag, vr: "PN" as VR, value: val(m) }],
      }),
    expectCode: null,
  },
  {
    name: "deidentify: (0002,0003) MediaStorageSOPInstanceUID [UI], remapped into report.uidMap",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        mediaStorageSOPInstanceUID: m,
        elements: [FILLER],
      }),
    expectCode: null,
  },
  {
    name: "deidentify: (6000,4000) OverlayComments, removed by the repeating-group mask",
    plant: (m) =>
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "60004000" as Tag, vr: "LT" as VR, value: val(m) }],
      }),
    expectCode: null,
  },
];

// ---------------------------------------------------------------------------

// One `it` per slot, deliberately. The runner stops at the first violation, so
// a single call over the whole table reports one leaking slot and hides the
// rest. Run per slot, the base commit named every leak in one pass, which is
// what a table is for.

describe("PHI: the diagnostic surface", () => {
  it.each(PARSE_SLOTS.map((slot) => [slot.name, slot] as const))("%s", (_name, slot) => {
    assertNoDiagnosticPhiLeak({
      slots: [slot],
      parse,
      parseStrict,
      getDiagnostics: allDiagnostics,
      getModelIdentifiers: modelIdentifiers,
    });
  });

  it.each(PROFILE_SLOTS.map((slot) => [slot.name, slot] as const))("%s", (_name, slot) => {
    assertNoDiagnosticPhiLeak({
      slots: [slot],
      parse: (raw: Buffer) => ({ dataset: parseDicom(raw, { profile: PROBE_PROFILE }) }),
      parseStrict: (raw: Buffer) => ({
        dataset: parseDicom(raw, { strict: true, profile: PROBE_PROFILE }),
      }),
      getDiagnostics: allDiagnostics,
      getModelIdentifiers: modelIdentifiers,
    });
  });

  it.each(DEID_SLOTS.map((slot) => [slot.name, slot] as const))("%s", (_name, slot) => {
    assertNoDiagnosticPhiLeak({
      slots: [slot],
      parse: deidentifySurface,
      parseStrict: null,
      getDiagnostics: deidDiagnostics,
      getModelIdentifiers: deidIdentifiers,
    });
  });
});

describe("PHI: the probes reach what they claim to", () => {
  /**
   * The positive control for the four `expectCode: null` File Meta slots, and
   * for the marker-alphabet question. A marker that the parser rejected or
   * normalized before it mattered would prove nothing, so each is asserted to
   * arrive on the model **verbatim**, invalid `UI` / `CS` characters and all.
   */
  it("markerReachesTheModelVerbatim", () => {
    const m = PHI_MARKER_UNIT;

    const fm = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        mediaStorageSOPClassUID: m,
        mediaStorageSOPInstanceUID: m,
        implementationClassUID: m,
        fileMetaExtraElements: [{ tag: "00020016" as Tag, vr: "AE" as VR, value: val(m) }],
        elements: [FILLER],
      }),
    ).fileMeta;
    expect(fm?.mediaStorageSOPClassUID).toBe(m);
    expect(fm?.mediaStorageSOPInstanceUID).toBe(m);
    expect(fm?.implementationClassUID).toBe(m);

    // CS: lower case is not in the `CS` repertoire and is not folded on parse.
    const cs = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080005" as Tag, vr: "CS" as VR, value: val(`ISO_IR 100\\${m}`) }, FILLER],
      }),
    );
    expect(cs.get("00080060")?.specificCharacterSet).toContain(m);
  });

  it("the sweep can actually fail: a deliberately leaking parser is caught", () => {
    // Constructed control, not a borrowed one. A control that happens not to
    // contain what is hunted returns clean and proves nothing.
    expect(() => {
      assertNoDiagnosticPhiLeak({
        slots: PARSE_SLOTS.slice(1, 2),
        parse,
        parseStrict: null,
        getDiagnostics: (parsed) => [
          ...allDiagnostics(parsed),
          { code: "CONTROL", message: parsed.dataset.get("00080005")?.rawBytes.toString("latin1") },
        ],
        getModelIdentifiers: modelIdentifiers,
      });
    }).toThrow(/leaked into/u);
  });
});

describe("PHI: the de-identified bytes", () => {
  const m = PHI_MARKER_UNIT;

  it("a removed attribute's value is gone from the serialized output", () => {
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010" as Tag, vr: "PN" as VR, value: val(m) },
        { tag: "00101001" as Tag, vr: "PN" as VR, value: val(m) },
        FILLER,
      ],
    });
    const { dataset } = deidentify(parseDicom(raw));
    expect(serializeDicom(dataset).includes(Buffer.from(m, "latin1"))).toBe(false);
  });

  it("a private element's value and its creator are gone from the serialized output", () => {
    const raw = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        { tag: "00090010" as Tag, vr: "LO" as VR, value: val(m) },
        { tag: "00091001" as Tag, vr: "UN" as VR, value: val(m) },
        FILLER,
      ],
    });
    const { dataset } = deidentify(parseDicom(raw));
    expect(serializeDicom(dataset).includes(Buffer.from(m, "latin1"))).toBe(false);
  });

  it("an overlay comment matched only by the repeating-group mask is gone too", () => {
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "60004000" as Tag, vr: "LT" as VR, value: val(m) }, FILLER],
    });
    const { dataset } = deidentify(parseDicom(raw));
    expect(serializeDicom(dataset).includes(Buffer.from(m, "latin1"))).toBe(false);
  });

  it("a value nested in a kept sequence is gone from the serialized output", () => {
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "00081115" as Tag,
          items: [{ elements: [{ tag: "00100010" as Tag, vr: "PN" as VR, value: val(m) }] }],
        },
        FILLER,
      ],
    });
    const { dataset } = deidentify(parseDicom(raw));
    expect(serializeDicom(dataset).includes(Buffer.from(m, "latin1"))).toBe(false);
  });
});

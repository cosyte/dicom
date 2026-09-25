/**
 * A de-identified DICOMDIR, written and read back, still points each record at
 * the right bytes, and carries no Patient's Name or Patient ID.
 *
 * `deidentify()` keeps a DICOMDIR's group 0004 (PS3.15 2026c section E.1.1's
 * carve-out) and re-encodes every Sequence as defined-length Items, so every
 * record moves. Each rebuilt Item keeps its source Item's `fileOffset`, and
 * `serializeDicom` ties each offset to the record it named through it.
 *
 * Every fixture is SYNTHETIC, built in memory by `build-dicomdir`: the patient
 * names are `SYNTHETIC^` values the PHI scan allow-lists, chosen so a leak is a
 * visible leak. No byte comes from real media.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  deidentify,
  parseDicom,
  serializeDicom,
  type Dataset,
  type DirectoryRecord,
} from "../../src/index.js";
import { WARNING_MESSAGES } from "../../src/parser/warnings.js";
import { buildDicom } from "../helpers/build-dicom.js";
import {
  DICOMDIR_SOP_CLASS,
  PATIENTS,
  TS_EXPLICIT_LE,
  TS_IMPLICIT_LE,
  buildDicomdir,
  twoPatientRecords,
} from "../helpers/build-dicomdir.js";

const DIRECTORY_CODES: readonly string[] = [
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED,
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_MALFORMED,
  WARNING_CODES.DICOM_DIRECTORY_RECORD_REVISITED,
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_DEFLATED,
];

const SYNTAXES = [
  ["Implicit VR LE", TS_IMPLICIT_LE],
  ["Explicit VR LE", TS_EXPLICIT_LE],
] as const;

/** A walked tree as record types, parent-child and sibling order kept. */
interface TypeShape {
  readonly type: string | undefined;
  readonly lower: readonly TypeShape[];
}

function types(records: readonly DirectoryRecord[]): TypeShape[] {
  return records.map((r) => ({ type: r.type, lower: types(r.lowerLevel) }));
}

/** Each walked record's Referenced File ID bytes, in walk order. */
function fileIdBytes(records: readonly DirectoryRecord[]): (Buffer | undefined)[] {
  return records.flatMap((r) => [r.item.get("00041500")?.rawBytes, ...fileIdBytes(r.lowerLevel)]);
}

function readUl(ds: Dataset, index: number | undefined, tag: string): number {
  const el = index === undefined ? ds.get(tag) : ds.get("00041220")?.items?.[index]?.get(tag);
  if (el === undefined) return 0;
  return el.littleEndian ? el.rawBytes.readUInt32LE(0) : el.rawBytes.readUInt32BE(0);
}

describe("[AC-8] a de-identified DICOMDIR, written and re-read, resolves every record offset", () => {
  for (const [name, ts] of SYNTAXES) {
    it(`[AC-8] ${name}: the re-read tree is the source tree`, () => {
      const source = parseDicom(
        buildDicomdir({ transferSyntax: ts, ...twoPatientRecords() }).bytes,
      );
      const sourceTree = source.directory?.root ?? [];
      expect(sourceTree).toHaveLength(2);

      const { dataset } = deidentify(source);
      const written = serializeDicom(dataset);
      const reread = parseDicom(written);

      // No offset of the re-read file fails to resolve.
      expect(reread.warnings.filter((w) => DIRECTORY_CODES.includes(w.code))).toEqual([]);
      const rereadTree = reread.directory?.root ?? [];
      // Same record types, same parent-child and sibling order.
      expect(types(rereadTree)).toEqual(types(sourceTree));
      // Referenced File IDs are byte-identical to the source's.
      const hex = (bytes: Buffer | undefined): string | undefined => bytes?.toString("hex");
      const before = fileIdBytes(sourceTree).map(hex);
      expect(before.filter((b) => b !== undefined)).toHaveLength(4);
      expect(fileIdBytes(rereadTree).map(hex)).toEqual(before);
      expect(rereadTree[0]?.lowerLevel[0]?.lowerLevel[0]?.lowerLevel[0]?.referencedFileId).toEqual([
        "SYNTH",
        "IMAGES",
        "IM11",
      ]);

      // The fixture proves positions moved: an offset the de-identified Dataset
      // carried before the write is not where its record landed in the output.
      const items = dataset.get("00041220")?.items ?? [];
      const outItems = reread.get("00041220")?.items ?? [];
      let moved = 0;
      items.forEach((item, i) => {
        for (const tag of ["00041400", "00041420"]) {
          const carried = readUl(dataset, i, tag);
          if (carried === 0) continue;
          const named = items.findIndex((it) => it.fileOffset === carried);
          expect(named).toBeGreaterThanOrEqual(0);
          const landed = outItems[named]?.fileOffset;
          expect(readUl(reread, i, tag)).toBe(landed);
          if (landed !== carried) moved += 1;
        }
        expect(item.fileOffset).toBeDefined();
      });
      expect(moved).toBeGreaterThan(0);
    });
  }
});

describe("[AC-9] a de-identified DICOMDIR's PATIENT records carry no name or ID into the output", () => {
  for (const [name, ts] of SYNTAXES) {
    it(`[AC-9] ${name}: neither value is anywhere in the written buffer`, () => {
      const source = parseDicom(
        buildDicomdir({ transferSyntax: ts, ...twoPatientRecords() }).bytes,
      );

      // Mutation control: written WITHOUT deidentify(), both values are there,
      // so the fixture is not vacuous.
      const control = serializeDicom(source);
      for (const p of PATIENTS) {
        expect(control.includes(Buffer.from(p.name, "latin1"))).toBe(true);
        expect(control.includes(Buffer.from(p.id, "latin1"))).toBe(true);
      }

      const written = serializeDicom(deidentify(source).dataset);
      for (const p of PATIENTS) {
        expect(written.includes(Buffer.from(p.name, "latin1"))).toBe(false);
        expect(written.includes(Buffer.from(p.id, "latin1"))).toBe(false);
      }
      // Still a DICOMDIR whose tree reads back.
      expect(parseDicom(written).directory?.root).toHaveLength(2);
    });
  }
});

describe("[AC-10] DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED names the two File-set clauses", () => {
  const MESSAGE = WARNING_MESSAGES.DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED;

  function fileSetWarnings(ds: Dataset): string[] {
    return deidentify(ds)
      .report.warnings.filter(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED,
      )
      .map((w) => w.message);
  }

  it("[AC-10] raised on the two-patient DICOMDIR", () => {
    const ds = parseDicom(
      buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...twoPatientRecords() }).bytes,
    );
    expect(fileSetWarnings(ds)).toEqual([MESSAGE]);
  });

  it("[AC-10] raised on a DICOMDIR with no group-0004 element", () => {
    const bytes = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: DICOMDIR_SOP_CLASS,
      elements: [{ tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 100", "latin1") }],
    });
    const ds = parseDicom(bytes);
    expect(ds.elements().some((el) => el.tag.startsWith("0004"))).toBe(false);
    expect(fileSetWarnings(ds)).toEqual([MESSAGE]);
  });

  it("[AC-10] the message names both File-set clauses and neither retired claim", () => {
    // PS3.15 E.1.1: a DICOMDIR created from the de-identified files...
    expect(MESSAGE).toContain("no DICOMDIR was created from the de-identified DICOM Files");
    // ...and removal of the non-de-identified DICOMDIR from the File-set.
    expect(MESSAGE).toContain("no non-de-identified DICOMDIR File was removed from the File-set");
    expect(MESSAGE).not.toMatch(/directory records were not de-identified/i);
    expect(MESSAGE).not.toMatch(/does not model DICOMDIR|DICOMDIR is not modelled/i);
  });
});

/**
 * Writing a DICOMDIR: every offset is rewritten to where the record it named
 * lands in the written bytes, and an offset the writer cannot tie to a record is
 * refused rather than written stale or as zero.
 *
 * PS3.3 2026d Table F.3-3 defines each of `(0004,1200)`, `(0004,1202)`,
 * `(0004,1400)` and `(0004,1420)` as the offset "of the first byte (of the Item
 * Data Element)" of a Directory Record, including "the File Preamble and the
 * DICM Prefix". PS3.10 2026d section 8.6: "The DICOMDIR File shall use the
 * Explicit VR Little Endian Transfer Syntax (UID=1.2.840.10008.1.2.1)".
 *
 * Every fixture is SYNTHETIC, built in memory by `build-dicomdir` (tier 3
 * round trips of a tier-1 tree, and tier-2 non-conformant offsets); no byte
 * comes from real media.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  Dataset,
  DicomSerializeError,
  Element,
  SERIALIZE_ERROR_CODES,
  WARNING_CODES,
  parseDicom,
  serializeDicom,
  type FileMeta,
  type Item,
} from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";
import {
  DICOMDIR_SOP_CLASS,
  TS_DEFLATED_LE,
  TS_EXPLICIT_BE,
  TS_EXPLICIT_LE,
  TS_IMPLICIT_LE,
  buildDicomdir,
  twoPatientRecords,
} from "../helpers/build-dicomdir.js";

const SYNTAXES = [
  ["Implicit VR LE", TS_IMPLICIT_LE],
  ["Explicit VR LE", TS_EXPLICIT_LE],
  ["Explicit VR BE", TS_EXPLICIT_BE],
] as const;

const DIRECTORY_CODES: readonly string[] = [
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED,
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_MALFORMED,
  WARNING_CODES.DICOM_DIRECTORY_RECORD_REVISITED,
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_DEFLATED,
];

function readUl(el: Element | undefined): number | undefined {
  if (el === undefined) return undefined;
  return el.littleEndian ? el.rawBytes.readUInt32LE(0) : el.rawBytes.readUInt32BE(0);
}

/** Every offset a DICOMDIR carries, root ones first, keyed for comparison. */
function offsets(ds: Dataset): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  out.set("root:1200", readUl(ds.get("00041200")));
  out.set("root:1202", readUl(ds.get("00041202")));
  (ds.get("00041220")?.items ?? []).forEach((item, i) => {
    out.set(`${String(i)}:1400`, readUl(item.get("00041400")));
    out.set(`${String(i)}:1420`, readUl(item.get("00041420")));
  });
  return out;
}

/** A parsed Dataset's File Meta, which a Part 10 parse always has. */
function fileMetaOf(ds: Dataset): FileMeta {
  if (ds.fileMeta === undefined) throw new Error("parsed Dataset has no File Meta");
  return ds.fileMeta;
}

function recordIndexAt(items: readonly Item[], fileOffset: number): number {
  return items.findIndex((item) => item.fileOffset === fileOffset);
}

/** The (FFFE,E000) Item tag's four bytes in the syntax's byte order. */
function itemTag(ts: string): Buffer {
  return ts === TS_EXPLICIT_BE
    ? Buffer.from([0xff, 0xfe, 0xe0, 0x00])
    : Buffer.from([0xfe, 0xff, 0x00, 0xe0]);
}

function expectRefused(write: () => Buffer, code: string, offending: readonly number[]): void {
  let thrown: unknown;
  let returned: Buffer | undefined;
  try {
    returned = write();
  } catch (err) {
    thrown = err;
  }
  expect(returned).toBeUndefined();
  expect(thrown).toBeInstanceOf(DicomSerializeError);
  const err = thrown as DicomSerializeError;
  expect(err.code).toBe(code);
  for (const value of offending) expect(err.message).not.toContain(String(value));
}

describe("[AC-6] serializeDicom writes each offset as the byte offset of the record it names", () => {
  for (const [name, ts] of SYNTAXES) {
    for (const sequenceUndefinedLength of [false, true]) {
      const form = sequenceUndefinedLength ? "undefined-length" : "defined-length";
      it(`[AC-6] ${name}, ${form} Directory Record Sequence`, () => {
        const built = buildDicomdir({
          transferSyntax: ts,
          sequenceUndefinedLength,
          ...twoPatientRecords(),
        });
        const source = parseDicom(built.bytes);
        const sourceItems = source.get("00041220")?.items ?? [];
        const written = serializeDicom(source);
        const out = parseDicom(written);
        const outItems = out.get("00041220")?.items ?? [];
        expect(outItems).toHaveLength(sourceItems.length);

        const before = offsets(source);
        const after = offsets(out);
        expect([...after.keys()]).toEqual([...before.keys()]);
        let moved = 0;
        for (const [key, sourceValue] of before) {
          const writtenValue = after.get(key);
          if (sourceValue === 0) {
            // A zero offset is written as zero.
            expect(writtenValue, key).toBe(0);
            continue;
          }
          // The record it named in the source, by sequence index...
          const named = recordIndexAt(sourceItems, sourceValue ?? -1);
          expect(named, key).toBeGreaterThanOrEqual(0);
          // ...is the Item it names in the output, counted from byte 0 (the
          // first preamble byte), and the bytes there are that Item's tag.
          expect(writtenValue, key).toBe(outItems[named]?.fileOffset);
          const at = writtenValue ?? 0;
          expect(written.subarray(at, at + 4).equals(itemTag(ts)), key).toBe(true);
          if (writtenValue !== sourceValue) moved += 1;
        }
        // The File Meta group grew on write (the source carries no (0002,0001)
        // or (0002,0012)), so a writer that passed offsets through fails here.
        expect(moved).toBeGreaterThan(0);
        expect(written.length).not.toBe(built.bytes.length);
        expect(out.warnings.filter((w) => DIRECTORY_CODES.includes(w.code))).toEqual([]);
      });
    }
  }
});

describe("[AC-7] an offset the writer cannot tie to a Directory Record is refused", () => {
  it("[AC-7] a Dataset parsed with an unresolved offset", () => {
    const built = buildDicomdir({
      transferSyntax: TS_EXPLICIT_LE,
      ...twoPatientRecords({ 8: { next: { midRecord: 5 } } }),
    });
    const ds = parseDicom(built.bytes);
    expect(ds.warnings.map((w) => w.code)).toContain(
      WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED,
    );
    const offending = readUl(ds.get("00041220")?.items?.[8]?.get("00041400")) ?? 0;
    expectRefused(() => serializeDicom(ds), SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_UNRESOLVED, [
      offending,
    ]);
  });

  it("[AC-7] a Dataset whose Directory Record Sequence was removed while offsets remain", () => {
    const built = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...twoPatientRecords() });
    const ds = parseDicom(built.bytes);
    const elements = new Map<Tag, Element>(
      ds
        .elements()
        .filter((el) => el.tag !== "00041220")
        .map((el) => [el.tag, el]),
    );
    const removed = new Dataset({ fileMeta: fileMetaOf(ds), warnings: [], elements });
    expectRefused(
      () => serializeDicom(removed),
      SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_UNRESOLVED,
      [readUl(ds.get("00041200")) ?? 0, readUl(ds.get("00041202")) ?? 0],
    );
  });

  it("[AC-7] a Dataset whose Directory Record Sequence was emptied while offsets remain", () => {
    const built = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...twoPatientRecords() });
    const ds = parseDicom(built.bytes);
    const sequence = ds.get("00041220");
    expect(sequence).toBeDefined();
    // An empty defined-length SQ as the parser would read it: the full span, a
    // 12-byte Explicit VR header declaring length 0, and no Items.
    const header = Buffer.from([0x04, 0x00, 0x20, 0x12, 0x53, 0x51, 0, 0, 0, 0, 0, 0]);
    const emptied = new Element({
      tag: "00041220",
      vr: "SQ",
      vm: 0,
      length: 0,
      rawBytes: header,
      byteOffset: sequence?.byteOffset ?? 0,
      littleEndian: true,
      items: [],
    });
    const elements = new Map<Tag, Element>(
      ds.elements().map((el) => [el.tag, el.tag === "00041220" ? emptied : el]),
    );
    const emptiedDs = new Dataset({ fileMeta: fileMetaOf(ds), warnings: [], elements });
    expectRefused(
      () => serializeDicom(emptiedDs),
      SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_UNRESOLVED,
      [readUl(ds.get("00041200")) ?? 0],
    );
  });

  it("[AC-7] a Dataset whose Directory Record Sequence Items do not match its bytes", () => {
    // The writer places records by walking the Sequence against its Items; one
    // Item short, the walk cannot say where any record lands, so no offset can
    // be tied to a written record.
    const built = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...twoPatientRecords() });
    const ds = parseDicom(built.bytes);
    const sequence = ds.get("00041220");
    if (sequence === undefined) throw new Error("fixture has no Directory Record Sequence");
    const short = new Element({
      tag: sequence.tag,
      vr: sequence.vr,
      vm: sequence.vm,
      length: sequence.length,
      rawBytes: sequence.rawBytes,
      byteOffset: sequence.byteOffset,
      littleEndian: sequence.littleEndian,
      items: (sequence.items ?? []).slice(0, 9),
    });
    const elements = new Map<Tag, Element>(
      ds.elements().map((el) => [el.tag, el.tag === "00041220" ? short : el]),
    );
    const mismatched = new Dataset({ fileMeta: fileMetaOf(ds), warnings: [], elements });
    expectRefused(
      () => serializeDicom(mismatched),
      SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_UNRESOLVED,
      built.recordOffsets,
    );
  });

  it("[AC-7] a hand-built Dataset declaring the DICOMDIR SOP Class with a non-zero offset and no records", () => {
    const value = Buffer.alloc(4);
    value.writeUInt32LE(4242, 0);
    const offset = new Element({
      tag: "00041200",
      vr: "UL",
      vm: 1,
      length: 4,
      rawBytes: value,
      byteOffset: 0,
      littleEndian: true,
    });
    const ds = new Dataset({
      fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE, mediaStorageSOPClassUID: DICOMDIR_SOP_CLASS },
      warnings: [],
      elements: new Map<Tag, Element>([["00041200", offset]]),
    });
    expectRefused(
      () => serializeDicom(ds),
      SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_UNRESOLVED,
      [4242],
    );
  });

  it("[AC-7] an offset whose Value Length is not 4 is refused, not written through", () => {
    const built = buildDicomdir({
      transferSyntax: TS_EXPLICIT_LE,
      ...twoPatientRecords({ 8: { next: { raw: Buffer.alloc(8) } } }),
    });
    expectRefused(
      () => serializeDicom(parseDicom(built.bytes)),
      SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_UNRESOLVED,
      [],
    );
  });
});

describe("[AC-5] a Deflated DICOMDIR carrying a non-zero offset", () => {
  it("[AC-5] parseDicom warns and resolves no record; serializeDicom throws and returns no bytes", () => {
    const built = buildDicomdir({
      transferSyntax: TS_DEFLATED_LE,
      records: [
        { type: "PATIENT", lower: 1, fileId: ["SYNTH", "P1"] },
        { type: "STUDY", fileId: ["SYNTH", "S1"] },
      ],
    });
    const seen: string[] = [];
    const ds = parseDicom(built.bytes, { onWarning: (w) => seen.push(w.code) });
    const warned = ds.warnings.filter((w) => DIRECTORY_CODES.includes(w.code));
    expect(warned.map((w) => w.code)).toEqual([WARNING_CODES.DICOM_DIRECTORY_OFFSET_DEFLATED]);
    expect(seen).toContain(WARNING_CODES.DICOM_DIRECTORY_OFFSET_DEFLATED);
    // Both records are listed, and no offset resolved to either.
    expect(ds.directory?.records).toHaveLength(2);
    expect(ds.directory?.root).toEqual([]);
    expect(ds.directory?.records.every((r) => r.lowerLevel.length === 0)).toBe(true);

    expectRefused(() => serializeDicom(ds), SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_DEFLATED, []);
  });

  it("[AC-5] a Deflated DICOMDIR whose offsets are all zero (an empty root) still writes", () => {
    const built = buildDicomdir({ transferSyntax: TS_DEFLATED_LE, records: [] });
    const ds = parseDicom(built.bytes);
    expect(ds.warnings.filter((w) => DIRECTORY_CODES.includes(w.code))).toEqual([]);
    const written = serializeDicom(ds);
    const again = parseDicom(written);
    expect(again.fileMeta?.transferSyntaxUID).toBe(TS_DEFLATED_LE);
    expect(readUl(again.get("00041200"))).toBe(0);
    expect(again.directory?.root).toEqual([]);
  });
});

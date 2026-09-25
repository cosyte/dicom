/**
 * Reading a DICOMDIR's Directory Record tree, and the offsets that name no
 * record.
 *
 * PS3.3 2026d Table F.3-3 defines `(0004,1200)`, `(0004,1202)`, `(0004,1400)` and
 * `(0004,1420)` as the offset "of the first byte (of the Item Data Element)" of a
 * Directory Record, a number of bytes that "includes the File Preamble and the
 * DICM Prefix", and zero as no record. `Dataset.directory` follows them; an
 * offset that is not exactly a record's Item tag names nothing, and the parser
 * says so with a registry-only warning.
 *
 * Every fixture is SYNTHETIC, built in memory by `build-dicomdir` (tier 1 for
 * the well-formed tree, tier 2 for each non-conformant offset, reproduced by
 * hand). No byte comes from real media.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomParseError,
  WARNING_CODES,
  parseDicom,
  type Dataset,
  type DicomParseWarning,
  type DirectoryRecord,
} from "../../src/index.js";
import { WARNING_MESSAGES } from "../../src/parser/warnings.js";
import {
  TS_EXPLICIT_BE,
  TS_EXPLICIT_LE,
  TS_IMPLICIT_LE,
  buildDicomdir,
  twoPatientRecords,
  type OffsetSpec,
  type RecordSpec,
} from "../helpers/build-dicomdir.js";

/** This spec's parse codes. */
const DIRECTORY_CODES: readonly string[] = [
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED,
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_MALFORMED,
  WARNING_CODES.DICOM_DIRECTORY_RECORD_REVISITED,
  WARNING_CODES.DICOM_DIRECTORY_OFFSET_DEFLATED,
];

const SYNTAXES = [
  ["Implicit VR LE", TS_IMPLICIT_LE],
  ["Explicit VR LE", TS_EXPLICIT_LE],
  ["Explicit VR BE", TS_EXPLICIT_BE],
] as const;

/** The tree the two-patient fixture's offsets describe, as record indices. */
interface Shape {
  readonly index: number;
  readonly type: string | undefined;
  readonly lower: readonly Shape[];
}

function shape(records: readonly DirectoryRecord[]): Shape[] {
  return records.map((r) => ({ index: r.index, type: r.type, lower: shape(r.lowerLevel) }));
}

const leaf = (index: number): Shape => ({ index, type: "IMAGE", lower: [] });
const EXPECTED_TREE: readonly Shape[] = [
  {
    index: 0,
    type: "PATIENT",
    lower: [
      {
        index: 3,
        type: "STUDY",
        lower: [{ index: 4, type: "SERIES", lower: [leaf(5), leaf(8)] }],
      },
    ],
  },
  {
    index: 1,
    type: "PATIENT",
    lower: [
      {
        index: 2,
        type: "STUDY",
        lower: [{ index: 6, type: "SERIES", lower: [leaf(7), leaf(9)] }],
      },
    ],
  },
];

const FILE_IDS: Readonly<Record<number, readonly string[]>> = {
  5: ["SYNTH", "IMAGES", "IM11"],
  7: ["SYNTH", "IMAGES", "IM21"],
  8: ["SYNTH", "IMAGES", "IM12"],
  9: ["SYNTH", "IMAGES", "IM22"],
};

function parseWithCallback(bytes: Buffer): { ds: Dataset; seen: DicomParseWarning[] } {
  const seen: DicomParseWarning[] = [];
  const ds = parseDicom(bytes, { onWarning: (w) => seen.push(w) });
  return { ds, seen };
}

function directoryWarnings(ws: readonly DicomParseWarning[]): DicomParseWarning[] {
  return ws.filter((w) => DIRECTORY_CODES.includes(w.code));
}

/** The two-patient fixture with record `index` overridden. */
function withRecord(
  ts: string,
  index: number,
  override: Partial<RecordSpec>,
): ReturnType<typeof buildDicomdir> {
  const base = twoPatientRecords({ [index]: override });
  return buildDicomdir({ transferSyntax: ts, ...base });
}

describe("[AC-1] a DICOMDIR's Directory Records, their types, lower-level records and Referenced File IDs", () => {
  for (const [name, ts] of SYNTAXES) {
    for (const sequenceUndefinedLength of [false, true]) {
      const form = sequenceUndefinedLength ? "undefined-length" : "defined-length";
      it(`[AC-1] ${name}, ${form} Directory Record Sequence: the tree follows the offsets`, () => {
        const built = buildDicomdir({
          transferSyntax: ts,
          sequenceUndefinedLength,
          ...twoPatientRecords(),
        });
        const { ds, seen } = parseWithCallback(built.bytes);
        const dir = ds.directory;
        expect(dir).toBeDefined();
        if (dir === undefined) return;

        // Every Item of the Directory Record Sequence is a record, in order.
        const items = ds.get("00041220")?.items ?? [];
        expect(items).toHaveLength(10);
        expect(dir.records.map((r) => r.item)).toEqual(items);
        expect(dir.records.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        // Each Item's file offset is where the builder put its Item tag.
        expect(items.map((it) => it.fileOffset)).toEqual(built.recordOffsets);

        // Root entity: (0004,1200)'s record, then each (0004,1400) successor;
        // lower-level: (0004,1420)'s record, then each successor. A zero offset
        // names no record, so a leaf's lowerLevel is empty.
        expect(shape(dir.root)).toEqual(EXPECTED_TREE);

        // Types are the (0004,1430) values; File IDs are the components, in order.
        expect(dir.records.map((r) => r.type)).toEqual([
          "PATIENT",
          "PATIENT",
          "STUDY",
          "STUDY",
          "SERIES",
          "IMAGE",
          "SERIES",
          "IMAGE",
          "IMAGE",
          "IMAGE",
        ]);
        for (const r of dir.records) {
          expect(r.referencedFileId).toEqual(FILE_IDS[r.index]);
        }

        // Tier 1: a well-formed DICOMDIR raises none of this spec's codes.
        expect(directoryWarnings(ds.warnings)).toEqual([]);
        expect(directoryWarnings(seen)).toEqual([]);
      });
    }
  }

  it("[AC-1] a file read without its preamble still counts the 132 bytes it lacks", () => {
    const built = buildDicomdir({
      transferSyntax: TS_EXPLICIT_LE,
      skipPreamble: true,
      ...twoPatientRecords(),
    });
    const ds = parseDicom(built.bytes);
    expect(ds.get("00041220")?.items?.map((it) => it.fileOffset)).toEqual(built.recordOffsets);
    expect(shape(ds.directory?.root ?? [])).toEqual(EXPECTED_TREE);
    expect(directoryWarnings(ds.warnings)).toEqual([]);
  });

  it("[AC-1] an object that is not a DICOMDIR has no directory", () => {
    const built = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...twoPatientRecords() });
    // Same bytes with the File Meta SOP Class rewritten: group 0004 alone does
    // not make a DICOMDIR (the (0002,0002) value is the one test).
    const at = built.bytes.indexOf(Buffer.from("1.2.840.10008.1.3.10", "latin1"));
    const other = Buffer.from(built.bytes);
    other.write("1.2.840.10008.1.3.11", at, "latin1");
    const ds = parseDicom(other);
    expect(ds.directory).toBeUndefined();
    expect(directoryWarnings(ds.warnings)).toEqual([]);
  });
});

/**
 * One bad landing on record 8's `(0004,1400)`, which is zero in the well-formed
 * fixture: IM12 is the last image of its series, so the rest of the tree is
 * intact whatever the offset does, and anything appended after IM12 came from it.
 */
const LANDINGS: readonly (readonly [string, OffsetSpec])[] = [
  ["inside a record's Data Set (mid-Item)", { midRecord: 5 }],
  ["on the (FFFE,E000) Item tag of a Sequence nested inside a record", { nestedItemOf: 5 }],
  ["on the Directory Record Sequence element header", "sequenceHeader"],
  ["past the end of the input", "pastEnd"],
];

/** Record 5 (IM11) carries a nested Sequence, so an Item tag exists inside it. */
const NESTED = {
  keys: [
    {
      tag: "00081115",
      items: [
        {
          elements: [
            {
              tag: "0020000E",
              vr: "UI",
              value: Buffer.from("2.25.4001\0", "latin1"),
            },
          ],
        },
      ],
    },
  ],
} as const satisfies Partial<RecordSpec>;

describe("[AC-2] an offset that does not land on an Item of the Directory Record Sequence", () => {
  for (const [landing, spec] of LANDINGS) {
    it(`[AC-2] ${landing}: warns, resolves nothing from it, and every other record resolves`, () => {
      const base = twoPatientRecords({ 5: { ...NESTED }, 8: { next: spec } });
      const built = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...base });
      // The nested landing is a real Item tag: a reader that scanned for one
      // would accept it, which is exactly what must not happen.
      if (typeof spec === "object" && "nestedItemOf" in spec) {
        const value = parseDicom(built.bytes)
          .get("00041220")
          ?.items?.[8]?.get("00041400")
          ?.rawBytes.readUInt32LE(0);
        expect(value).toBeDefined();
        expect(built.bytes.readUInt32LE(value ?? 0)).toBe(0xe000fffe);
      }

      const { ds, seen } = parseWithCallback(built.bytes);
      const warned = directoryWarnings(ds.warnings);
      expect(warned).toHaveLength(1);
      const [w] = warned;
      expect(w?.code).toBe(WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED);
      expect(directoryWarnings(seen)).toEqual(warned);
      // The message is the registry string, exactly: no offset, no key.
      expect(w?.message).toBe(WARNING_MESSAGES.DICOM_DIRECTORY_OFFSET_UNRESOLVED);
      expect(w?.position.contextPath).toEqual(["00041220", "8", "00041400"]);
      expect(w?.position.byteOffset).toBe(built.recordOffsets[8]);

      // Nothing is reached through it, and every other record resolves.
      expect(shape(ds.directory?.root ?? [])).toEqual(EXPECTED_TREE);
    });
  }

  it("[AC-2] a root offset that names no record leaves the root entity empty", () => {
    const base = twoPatientRecords();
    const built = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...base, firstRoot: "pastEnd" });
    const ds = parseDicom(built.bytes);
    const warned = directoryWarnings(ds.warnings);
    expect(warned.map((w) => w.code)).toEqual([WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED]);
    expect(warned[0]?.position.contextPath).toBeUndefined();
    expect(ds.directory?.root).toEqual([]);
    expect(ds.directory?.records).toHaveLength(10);
  });

  it("[AC-2] { strict: true } escalates it as it does every Tier-2 code", () => {
    const base = twoPatientRecords({ 8: { next: { midRecord: 5 } } });
    const built = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...base });
    expect(() => parseDicom(built.bytes, { strict: true })).toThrow(DicomParseError);
    try {
      parseDicom(built.bytes, { strict: true });
    } catch (err) {
      expect((err as DicomParseError).code).toBe(WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED);
    }
  });
});

describe("[AC-3] an offset that would reach a record already reached", () => {
  const CYCLES: readonly (readonly [string, Partial<Record<number, Partial<RecordSpec>>>])[] = [
    ["a record whose (0004,1400) names itself", { 8: { next: 8 } }],
    ["an IMAGE record whose (0004,1420) names its own PATIENT", { 9: { lower: 1 } }],
  ];
  for (const [name, overrides] of CYCLES) {
    it(`[AC-3] ${name}: warns, exposes the record once, and finishes`, () => {
      const built = buildDicomdir({
        transferSyntax: TS_EXPLICIT_LE,
        ...twoPatientRecords(overrides),
      });
      const { ds, seen } = parseWithCallback(built.bytes);
      const warned = directoryWarnings(ds.warnings);
      expect(warned.map((w) => w.code)).toEqual([WARNING_CODES.DICOM_DIRECTORY_RECORD_REVISITED]);
      expect(warned[0]?.message).toBe(WARNING_MESSAGES.DICOM_DIRECTORY_RECORD_REVISITED);
      expect(directoryWarnings(seen)).toEqual(warned);
      // Each record appears in the tree exactly once.
      expect(shape(ds.directory?.root ?? [])).toEqual(EXPECTED_TREE);
    });
  }
});

describe("[AC-4] an offset attribute whose Value Length is not 4", () => {
  for (const length of [0, 2, 8]) {
    it(`[AC-4] (0004,1400) of Value Length ${String(length)}: warns and resolves no record`, () => {
      // Built once for the layout, then again with the value naming IM22 in its
      // first four bytes where it has them: a reader that took those four bytes
      // would append IM22 after IM12.
      const probe = withRecord(TS_EXPLICIT_LE, 8, { next: { raw: Buffer.alloc(length) } });
      const raw = Buffer.alloc(length);
      if (length >= 4) raw.writeUInt32LE(probe.recordOffsets[9] ?? 0, 0);
      const built = withRecord(TS_EXPLICIT_LE, 8, { next: { raw } });

      const { ds, seen } = parseWithCallback(built.bytes);
      const warned = directoryWarnings(ds.warnings);
      expect(warned.map((w) => w.code)).toEqual([WARNING_CODES.DICOM_DIRECTORY_OFFSET_MALFORMED]);
      expect(warned[0]?.message).toBe(WARNING_MESSAGES.DICOM_DIRECTORY_OFFSET_MALFORMED);
      expect(warned[0]?.position.contextPath).toEqual(["00041220", "8", "00041400"]);
      expect(directoryWarnings(seen)).toEqual(warned);
      expect(shape(ds.directory?.root ?? [])).toEqual(EXPECTED_TREE);
    });
  }
});

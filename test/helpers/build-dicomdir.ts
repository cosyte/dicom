/**
 * Synthetic DICOMDIR builder - internal test utility, not exported from `src/`.
 *
 * **Every fixture it builds is SYNTHETIC**: records, keys, names and file IDs
 * are made up here, in memory, and no byte comes from real media (`phi-safety`
 * P1 to P3). Patient names use the `SYNTHETIC^` family the PHI scan allow-lists.
 *
 * A DICOMDIR's offsets are byte positions (PS3.3 2026d Table F.3-3: counted
 * from the first byte of the File Preamble), so the builder lays the file out
 * twice with the same encoder `buildDicom` uses: once with every offset value
 * at its final length to measure where each record's `(FFFE,E000)` Item tag
 * lands, and once with the true offsets written in. Knobs place an offset
 * somewhere a record is not, for the parser's unhappy paths: inside a record's
 * Data Set, on the Item tag of a Sequence nested in a record, on the Directory
 * Record Sequence's own header, past the end of the file, or as raw value bytes
 * of any length.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { Tag } from "../../src/dictionary/types.js";
import {
  buildDicom,
  encodeBuiltElement,
  encodeBuiltItem,
  type BuildDicomElement,
  type BuildDicomOptions,
  type BuildDicomSqElement,
  type BuildDicomSqItem,
} from "./build-dicom.js";

/** Media Storage Directory Storage. */
export const DICOMDIR_SOP_CLASS = "1.2.840.10008.1.3.10";

export const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
export const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
export const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
export const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

/**
 * Where an offset attribute points.
 *
 * - a number: the true file offset of that record (by index in the sequence)
 * - `zero`: `0`, no record
 * - `midRecord`: two bytes into that record's first element, inside its Data Set
 * - `nestedItemOf`: the `(FFFE,E000)` tag of the first Item of the first
 *   Sequence nested in that record (the scan-for-an-Item-tag trap)
 * - `sequenceHeader`: the Directory Record Sequence element's own first byte
 * - `pastEnd`: beyond the last byte of the file
 * - `raw`: these value bytes, verbatim, at whatever length they have
 */
export type OffsetSpec =
  | number
  | "zero"
  | { readonly midRecord: number }
  | { readonly nestedItemOf: number }
  | "sequenceHeader"
  | "pastEnd"
  | { readonly raw: Buffer };

/** One Directory Record. */
export interface RecordSpec {
  /** Directory Record Type `(0004,1430)`. */
  readonly type: string;
  /** `(0004,1400)`; omitted means zero. */
  readonly next?: OffsetSpec;
  /** `(0004,1420)`; omitted means zero. */
  readonly lower?: OffsetSpec;
  /** Referenced File ID `(0004,1500)` components. */
  readonly fileId?: readonly string[];
  /** Record keys and anything else the record carries (a nested Sequence, say). */
  readonly keys?: readonly (BuildDicomElement | BuildDicomSqElement)[];
  /** Encode the record's Item with undefined length. */
  readonly undefinedLength?: boolean;
  /**
   * Write the keys BEFORE the group-0004 attributes, so the record's Data Set is
   * out of ascending tag order and a writer must move the offsets inside it.
   */
  readonly keysFirst?: boolean;
}

/** Options for {@link buildDicomdir}. */
export interface DicomdirOptions {
  readonly transferSyntax: string;
  readonly records: readonly RecordSpec[];
  /** `(0004,1200)`; omitted means record 0 when there is one, else zero. */
  readonly firstRoot?: OffsetSpec;
  /** `(0004,1202)`; omitted means zero. */
  readonly lastRoot?: OffsetSpec;
  /** Encode the Directory Record Sequence with undefined length. */
  readonly sequenceUndefinedLength?: boolean;
  /** Leave the Directory Record Sequence out entirely. */
  readonly omitSequence?: boolean;
  /** Passed through to `buildDicom`. */
  readonly skipPreamble?: boolean;
  readonly fileMetaGroupLength?: BuildDicomOptions["fileMetaGroupLength"];
}

/** The built file, and where each record's Item tag sits in it. */
export interface BuiltDicomdir {
  readonly bytes: Buffer;
  /** File offset (from the first preamble byte) of each record's Item tag. */
  readonly recordOffsets: readonly number[];
}

function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

/** A `UL` value, little-endian (the builder swaps it for Big Endian). */
function ul(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

const FILE_SET_ID: BuildDicomElement = { tag: "00041130", vr: "CS", value: pad("SYNTHSET") };
const CONSISTENCY_FLAG: BuildDicomElement = {
  tag: "00041212",
  vr: "US",
  value: Buffer.from([0x00, 0x00]),
};
const IN_USE: BuildDicomElement = { tag: "00041410", vr: "US", value: Buffer.from([0xff, 0xff]) };

function offsetElement(tag: Tag, value: Buffer): BuildDicomElement {
  return { tag, vr: "UL", value };
}

/** The value bytes an offset spec writes, given the file's layout. */
type Resolve = (spec: OffsetSpec | undefined) => Buffer;

function recordItem(spec: RecordSpec, resolve: Resolve): BuildDicomSqItem {
  const directory: BuildDicomElement[] = [
    offsetElement("00041400", resolve(spec.next)),
    IN_USE,
    offsetElement("00041420", resolve(spec.lower)),
    { tag: "00041430", vr: "CS", value: pad(spec.type) },
  ];
  if (spec.fileId !== undefined) {
    directory.push({ tag: "00041500", vr: "CS", value: pad(spec.fileId.join("\\")) });
  }
  const keys = spec.keys ?? [];
  return {
    elements: spec.keysFirst === true ? [...keys, ...directory] : [...directory, ...keys],
    ...(spec.undefinedLength === true ? { undefinedLength: true } : {}),
  };
}

function rootElements(
  opts: DicomdirOptions,
  resolve: Resolve,
): (BuildDicomElement | BuildDicomSqElement)[] {
  const first = opts.firstRoot ?? (opts.records.length > 0 ? 0 : "zero");
  const head: BuildDicomElement[] = [
    FILE_SET_ID,
    offsetElement("00041200", resolve(first)),
    offsetElement("00041202", resolve(opts.lastRoot)),
    CONSISTENCY_FLAG,
  ];
  if (opts.omitSequence === true) return head;
  const sequence: BuildDicomSqElement = {
    tag: "00041220",
    items: opts.records.map((r) => recordItem(r, resolve)),
    ...(opts.sequenceUndefinedLength === true ? { undefinedLength: true } : {}),
  };
  return [...head, sequence];
}

/** Where a nested Sequence's first Item tag sits inside a record's Item. */
function nestedItemWithin(spec: RecordSpec, resolve: Resolve, ts: string): number {
  const item = recordItem(spec, resolve);
  let at = 8; // the record's own Item header
  for (const el of item.elements) {
    if (Object.prototype.hasOwnProperty.call(el, "items")) {
      return at + (ts === TS_IMPLICIT_LE ? 8 : 12);
    }
    at += encodeBuiltElement(el, ts).length;
  }
  throw new Error("buildDicomdir: nestedItemOf names a record with no nested Sequence.");
}

/**
 * Build a synthetic DICOMDIR whose offsets are the true file offsets of the
 * records they name, except where a knob says otherwise.
 */
export function buildDicomdir(opts: DicomdirOptions): BuiltDicomdir {
  const ts = opts.transferSyntax;
  const layoutTs = ts === TS_DEFLATED_LE ? TS_EXPLICIT_LE : ts;
  const meta: BuildDicomOptions = {
    transferSyntax: ts,
    mediaStorageSOPClassUID: DICOMDIR_SOP_CLASS,
    mediaStorageSOPInstanceUID: "2.25.1234567890",
    elements: [],
    ...(opts.skipPreamble === true ? { skipPreamble: true } : {}),
    ...(opts.fileMetaGroupLength !== undefined
      ? { fileMetaGroupLength: opts.fileMetaGroupLength }
      : {}),
  };
  // The Data Set starts after the File Meta group; offsets count the 132
  // preamble bytes whether or not the file carries them.
  const dataSetStart = buildDicom(meta).length + (opts.skipPreamble === true ? 132 : 0);

  // Pass 1: every offset at its final LENGTH, so the layout is the final one.
  const placeholder: Resolve = (spec) =>
    typeof spec === "object" && "raw" in spec ? spec.raw : ul(0);
  const layout = rootElements(opts, placeholder);
  const lengths = layout.map((el) => encodeBuiltElement(el, layoutTs).length);
  const sequenceStart = dataSetStart + lengths.slice(0, 4).reduce((a, b) => a + b, 0);
  const itemsStart = sequenceStart + (layoutTs === TS_IMPLICIT_LE ? 8 : 12);
  const recordOffsets: number[] = [];
  let at = itemsStart;
  for (const record of opts.records) {
    recordOffsets.push(at);
    at += encodeBuiltItem(recordItem(record, placeholder), layoutTs).length;
  }
  const fileEnd = dataSetStart + lengths.reduce((a, b) => a + b, 0);

  // Pass 2: the true values.
  const resolve: Resolve = (spec) => {
    if (spec === undefined || spec === "zero") return ul(0);
    if (typeof spec === "number") return ul(recordOffsets[spec] ?? 0);
    if (spec === "sequenceHeader") return ul(sequenceStart);
    if (spec === "pastEnd") return ul(fileEnd + 1000);
    if ("raw" in spec) return spec.raw;
    if ("midRecord" in spec) return ul((recordOffsets[spec.midRecord] ?? 0) + 10);
    const record = opts.records[spec.nestedItemOf];
    if (record === undefined) throw new Error("buildDicomdir: nestedItemOf is out of range.");
    return ul(
      (recordOffsets[spec.nestedItemOf] ?? 0) + nestedItemWithin(record, placeholder, layoutTs),
    );
  };
  const bytes = buildDicom({ ...meta, elements: rootElements(opts, resolve) });
  return { bytes, recordOffsets };
}

/** A record key, space-padded. */
export function key(tag: Tag, vr: BuildDicomElement["vr"], value: string): BuildDicomElement {
  return { tag, vr, value: vr === "UI" ? uid(value) : pad(value) };
}

function uid(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x00])]);
}

/** The synthetic identities the AC-9 test looks for in written bytes. */
export const PATIENTS = [
  { name: "SYNTHETIC^ALPHAWOLF", id: "SYNPID0001" },
  { name: "SYNTHETIC^BRAVOHAWK", id: "SYNPID0002" },
] as const;

/**
 * The two-patient tree: each PATIENT has one STUDY > one SERIES > two IMAGE
 * records, mixing defined- and undefined-length Items, and the records are NOT
 * in tree order in the sequence, so only the offsets say what is under what.
 *
 * Sequence order (index: record):
 *   0 P1  1 P2  2 S2  3 S1  4 SE1  5 I1a  6 SE2  7 I2a  8 I1b  9 I2b
 *
 * P1 keeps its keys ahead of its group-0004 attributes, so a writer that orders
 * a Data Set ascending moves P1's offsets.
 */
export function twoPatientRecords(overrides: Partial<Record<number, Partial<RecordSpec>>> = {}): {
  records: RecordSpec[];
  firstRoot: OffsetSpec;
  lastRoot: OffsetSpec;
} {
  const image = (
    n: string,
    next: OffsetSpec | undefined,
    undefinedLength: boolean,
  ): RecordSpec => ({
    type: "IMAGE",
    fileId: ["SYNTH", "IMAGES", n],
    ...(next !== undefined ? { next } : {}),
    undefinedLength,
    keys: [
      key("00041510", "UI", "1.2.840.10008.5.1.4.1.1.7"),
      key("00041511", "UI", `2.25.99000${n.slice(-1)}`),
      key("00041512", "UI", "1.2.840.10008.1.2.1"),
      key("00200013", "IS", n.slice(-1)),
    ],
  });
  const base: RecordSpec[] = [
    {
      type: "PATIENT",
      next: 1,
      lower: 3,
      keysFirst: true,
      keys: [key("00100010", "PN", PATIENTS[0].name), key("00100020", "LO", PATIENTS[0].id)],
    },
    {
      type: "PATIENT",
      lower: 2,
      undefinedLength: true,
      keys: [key("00100010", "PN", PATIENTS[1].name), key("00100020", "LO", PATIENTS[1].id)],
    },
    { type: "STUDY", lower: 6, keys: [key("0020000D", "UI", "2.25.2002")] },
    { type: "STUDY", lower: 4, undefinedLength: true, keys: [key("0020000D", "UI", "2.25.2001")] },
    {
      type: "SERIES",
      lower: 5,
      keys: [key("00080060", "CS", "OT"), key("0020000E", "UI", "2.25.3001")],
    },
    image("IM11", 8, false),
    {
      type: "SERIES",
      lower: 7,
      undefinedLength: true,
      keys: [key("00080060", "CS", "OT"), key("0020000E", "UI", "2.25.3002")],
    },
    image("IM21", 9, true),
    image("IM12", undefined, true),
    image("IM22", undefined, false),
  ];
  const records = base.map((r, i) => ({ ...r, ...(overrides[i] ?? {}) }));
  return { records, firstRoot: 0, lastRoot: 1 };
}

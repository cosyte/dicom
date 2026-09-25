/**
 * The DICOMDIR Directory Record model: which records a DICOMDIR's offsets name,
 * and the tree they form.
 *
 * A DICOMDIR is a Dataset whose File Meta Media Storage SOP Class UID
 * `(0002,0002)` is `1.2.840.10008.1.3.10` (Media Storage Directory Storage). Its
 * Directory Record Sequence `(0004,1220)` holds one Item per record, and four
 * `UL` attributes link them by byte offset: `(0004,1200)` and `(0004,1202)` name
 * the first and last record of the root directory entity, and each record's
 * `(0004,1400)` names its next sibling and `(0004,1420)` the first record of its
 * lower-level entity. PS3.3 2026d Table F.3-3 counts each offset as "a number of
 * bytes starting with the first byte of the File Meta Information" and says it
 * "includes the File Preamble and the DICM Prefix"; zero means no record.
 *
 * **An offset resolves to a record only when it is exactly the file offset of
 * that record's `(FFFE,E000)` Item tag**, which the parser records on each Item
 * as {@link Item.fileOffset}. Nothing here scans the bytes for an Item tag: an
 * offset that lands on an Item of a Sequence nested inside a record, inside a
 * record's Data Set, on the Sequence's own header, or past the end of the file
 * names no record, and the parser warns (`DICOM_DIRECTORY_OFFSET_UNRESOLVED`).
 *
 * The analysis is one pure function of a Dataset, {@link analyzeDirectory}, read
 * three ways: `parseDicom` turns its findings into warnings, `Dataset.directory`
 * exposes its tree, and `serializeDicom` ties each offset it writes to a record
 * through the same {@link Item.fileOffset} identity.
 *
 * @module
 */

import type { Tag } from "../dictionary/types.js";
import type { Element } from "./element.js";
import type { FileMeta } from "./file-meta.js";
import type { Item } from "./item.js";

/**
 * Media Storage Directory Storage: the SOP Class a DICOMDIR declares in
 * `(0002,0002)`, and the one test for whether a Dataset is one.
 *
 * @internal
 */
export const MEDIA_STORAGE_DIRECTORY_STORAGE_UID = "1.2.840.10008.1.3.10";

/** Deflated Explicit VR Little Endian. */
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

/**
 * The tags this model reads.
 *
 * @internal
 */
export const DIRECTORY_TAGS = {
  /** Offset of the First Directory Record of the Root Directory Entity. */
  FIRST_ROOT_RECORD: "00041200",
  /** Offset of the Last Directory Record of the Root Directory Entity. */
  LAST_ROOT_RECORD: "00041202",
  /** Directory Record Sequence. */
  RECORD_SEQUENCE: "00041220",
  /** Offset of the Next Directory Record. */
  NEXT_RECORD: "00041400",
  /** Offset of Referenced Lower-Level Directory Entity. */
  LOWER_LEVEL: "00041420",
  /** Directory Record Type. */
  RECORD_TYPE: "00041430",
  /** Referenced File ID. */
  REFERENCED_FILE_ID: "00041500",
} as const satisfies Record<string, Tag>;

/**
 * One Directory Record of a DICOMDIR: an Item of the Directory Record Sequence
 * `(0004,1220)`, with the records its offsets name.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const dir = parseDicom(buf).directory;
 * for (const patient of dir?.root ?? []) {
 *   patient.type; // "PATIENT"
 *   for (const study of patient.lowerLevel) study.item.get("0020000D"); // Study Instance UID
 * }
 * ```
 */
export interface DirectoryRecord {
  /** The record's 0-based index in the Directory Record Sequence. */
  readonly index: number;
  /**
   * The Directory Record Type `(0004,1430)` value (`"PATIENT"`, `"STUDY"`,
   * `"SERIES"`, `"IMAGE"` and the rest PS3.3 F.5 defines), or `undefined` when
   * the record carries none.
   */
  readonly type: string | undefined;
  /**
   * The Referenced File ID `(0004,1500)`: its components in order (a path
   * relative to the File-set root, one component per value), as the file wrote
   * them less only the padding PS3.5 makes insignificant in `CS` (the trailing
   * pad, and each value's leading and trailing spaces). Kept verbatim: never
   * de-identified, rewritten or joined, and the element's own bytes on `item`
   * are untouched. `undefined` when the record carries none.
   */
  readonly referencedFileId: readonly string[] | undefined;
  /**
   * The records of this record's lower-level directory entity: the one its
   * `(0004,1420)` names, then each `(0004,1400)` successor in order. Empty when
   * the offset is zero or names no record.
   */
  readonly lowerLevel: readonly DirectoryRecord[];
  /** The record's own Data Set, for its record keys. */
  readonly item: Item;
}

/**
 * The Directory Record tree of a DICOMDIR, read from its offsets.
 *
 * `records` is every Item of the Directory Record Sequence, in order, whether
 * or not an offset reaches it. `root` is the root directory entity: the record
 * `(0004,1200)` names, then each `(0004,1400)` successor in order. A record is
 * reached at most once: an offset that would reach one again is not followed.
 *
 * @example
 * ```ts
 * import { parseDicom, type DirectoryRecord } from "@cosyte/dicom";
 * const dir = parseDicom(buf).directory; // undefined unless the object is a DICOMDIR
 * const walk = (records: readonly DirectoryRecord[], depth = 0): void => {
 *   for (const r of records) {
 *     console.log(" ".repeat(depth), r.type, r.referencedFileId?.join("/"));
 *     walk(r.lowerLevel, depth + 1);
 *   }
 * };
 * if (dir !== undefined) walk(dir.root);
 * ```
 */
export interface DicomDirectory {
  /** Every Directory Record, in Directory Record Sequence order. */
  readonly records: readonly DirectoryRecord[];
  /** The root directory entity, in `(0004,1400)` order. */
  readonly root: readonly DirectoryRecord[];
}

/**
 * An offset attribute's value, read as PS3.3 Table F.3-3 defines it: exactly one
 * 32-bit unsigned integer (`UL`, VM 1), zero meaning no record.
 *
 * @internal
 */
export type OffsetValue =
  | { readonly kind: "zero" }
  | { readonly kind: "offset"; readonly value: number }
  | { readonly kind: "malformed" };

const ZERO: OffsetValue = Object.freeze({ kind: "zero" });
const MALFORMED: OffsetValue = Object.freeze({ kind: "malformed" });

/**
 * Read an offset attribute. A Value Length other than 4 (an empty value, two
 * bytes, two values), an undefined length or a Sequence is not one 32-bit
 * unsigned integer, so it is `malformed` and names no record.
 *
 * @internal
 */
export function readOffsetValue(el: Element): OffsetValue {
  if (el.vr === "SQ" || el.length !== 4 || el.rawBytes.length !== 4) return MALFORMED;
  const value = el.littleEndian ? el.rawBytes.readUInt32LE(0) : el.rawBytes.readUInt32BE(0);
  return value === 0 ? ZERO : { kind: "offset", value };
}

/**
 * `true` when `fileMeta` declares Media Storage Directory Storage: the same
 * test `deidentify()` applies.
 *
 * @internal
 */
export function isDicomdir(fileMeta: FileMeta | undefined): boolean {
  return fileMeta?.mediaStorageSOPClassUID === MEDIA_STORAGE_DIRECTORY_STORAGE_UID;
}

/**
 * `true` when `fileMeta` names Deflated Explicit VR Little Endian, where no byte
 * of the Data Set has a file position.
 *
 * @internal
 */
export function isDeflated(fileMeta: FileMeta | undefined): boolean {
  return fileMeta?.transferSyntaxUID === TS_DEFLATED_LE;
}

/**
 * What {@link analyzeDirectory} reads: a File Meta view and root element
 * lookup, so the parser can run it before its `Dataset` exists.
 *
 * @internal
 */
export interface DirectorySource {
  readonly fileMeta: FileMeta | undefined;
  get(tag: Tag): Element | undefined;
}

/**
 * One offset that does not resolve, or one that reaches a record twice.
 * `element` is the offset attribute (for `deflated`, the first non-zero one) and
 * `item` the Directory Record carrying it, or `undefined` for a root attribute.
 * The parser reads positions off them and never their values.
 *
 * @internal
 */
export interface DirectoryFinding {
  readonly kind: "unresolved" | "malformed" | "revisited" | "deflated";
  readonly element: Element;
  readonly item: Item | undefined;
}

/**
 * The records of a DICOMDIR's Directory Record Sequence, and a lookup from an
 * Item's file offset to its index. Two Items claiming one file offset (only a
 * hand-assembled Dataset can hold such a pair) are dropped from the lookup, so
 * an offset naming that position ties to neither.
 *
 * @internal
 */
export interface DirectoryRecords {
  readonly items: readonly Item[];
  readonly byFileOffset: ReadonlyMap<number, number>;
}

/**
 * Read the Directory Record Sequence and index its Items by file offset. Under
 * the Deflated syntax no Item has a file offset, so the lookup is empty.
 *
 * @internal
 */
export function directoryRecords(source: DirectorySource): DirectoryRecords {
  // Only a Sequence the parser descended has `items`.
  const items = source.get(DIRECTORY_TAGS.RECORD_SEQUENCE)?.items ?? [];
  const byFileOffset = new Map<number, number>();
  const shared = new Set<number>();
  items.forEach((item, index) => {
    const at = item.fileOffset;
    if (at === undefined) return;
    if (byFileOffset.has(at)) shared.add(at);
    else byFileOffset.set(at, index);
  });
  for (const at of shared) byFileOffset.delete(at);
  return { items, byFileOffset };
}

/**
 * A `CS` attribute's values, or `undefined` when the record does not carry it:
 * the Value Field split at each backslash, less the trailing pad and each
 * value's leading and trailing spaces, which PS3.5 makes insignificant in `CS`.
 * Read from the bytes whatever VR the wire declared, so a record keeps its type
 * and file ID under a mis-declared VR, and nothing else is changed.
 */
function csValues(el: Element | undefined): readonly string[] | undefined {
  if (el === undefined) return undefined;
  const text = el.rawBytes.toString("latin1").replace(/[\0 ]+$/u, "");
  return Object.freeze(text === "" ? [] : text.split("\\").map((v) => v.replace(/^ +| +$/gu, "")));
}

/**
 * Resolve every offset of a DICOMDIR and build its record tree, or return
 * `undefined` when `source` is not a DICOMDIR.
 *
 * Every offset attribute is resolved, whether or not the walk reaches the
 * record carrying it, so each one that names no record is a finding. Under
 * Deflated Explicit VR LE a position in the deflated stream names nothing a
 * reader can seek to, so no offset resolves and one `deflated` finding stands
 * for all of them. The walk is iterative, so no input depth reaches the call
 * stack, and it visits each record at most once.
 *
 * @internal
 */
export function analyzeDirectory(
  source: DirectorySource,
):
  | { readonly directory: DicomDirectory; readonly findings: readonly DirectoryFinding[] }
  | undefined {
  if (!isDicomdir(source.fileMeta)) return undefined;
  const deflated = isDeflated(source.fileMeta);
  const { items, byFileOffset } = directoryRecords(source);
  const findings: DirectoryFinding[] = [];
  let deflatedOffset: DirectoryFinding | undefined;

  /** One offset attribute, and the record it resolved to (if any). */
  interface Link {
    readonly element: Element;
    readonly item: Item | undefined;
    readonly target: number | undefined;
  }
  const resolve = (element: Element | undefined, item: Item | undefined): Link | undefined => {
    if (element === undefined) return undefined;
    const offset = readOffsetValue(element);
    if (offset.kind === "zero") return undefined;
    if (offset.kind === "malformed") {
      findings.push({ kind: "malformed", element, item });
      return undefined;
    }
    if (deflated) {
      deflatedOffset ??= { kind: "deflated", element, item };
      return undefined;
    }
    const target = byFileOffset.get(offset.value);
    if (target === undefined) findings.push({ kind: "unresolved", element, item });
    return { element, item, target };
  };

  const first = resolve(source.get(DIRECTORY_TAGS.FIRST_ROOT_RECORD), undefined);
  resolve(source.get(DIRECTORY_TAGS.LAST_ROOT_RECORD), undefined);
  const next: (Link | undefined)[] = [];
  const lower: (Link | undefined)[] = [];
  for (const item of items) {
    next.push(resolve(item.get(DIRECTORY_TAGS.NEXT_RECORD), item));
    lower.push(resolve(item.get(DIRECTORY_TAGS.LOWER_LEVEL), item));
  }
  if (deflatedOffset !== undefined) findings.push(deflatedOffset);

  // `children[i]` is record `i`'s `lowerLevel`, filled by the walk and frozen
  // after it. Both arrays are indexed by an Item's index, and every `at` the
  // walk reads is a value of `byFileOffset`, which holds only such indices: that
  // is what the two casts below rest on.
  const children: DirectoryRecord[][] = [];
  const records: DirectoryRecord[] = items.map((item, index) => {
    const lowerLevel: DirectoryRecord[] = [];
    children.push(lowerLevel);
    return Object.freeze({
      index,
      type: csValues(item.get(DIRECTORY_TAGS.RECORD_TYPE))?.[0],
      referencedFileId: csValues(item.get(DIRECTORY_TAGS.REFERENCED_FILE_ID)),
      lowerLevel,
      item,
    });
  });

  const reached = new Set<number>();
  const expand: number[] = [];
  // Follow one entity's chain: the record `start` names, then each (0004,1400)
  // successor. A link that would reach a record already reached is reported
  // against the attribute that carries it, and not followed.
  const chain = (start: Link | undefined, into: DirectoryRecord[]): void => {
    const entity: number[] = [];
    let link = start;
    while (link?.target !== undefined) {
      const at = link.target;
      if (reached.has(at)) {
        findings.push({ kind: "revisited", element: link.element, item: link.item });
        break;
      }
      reached.add(at);
      into.push(records[at] as DirectoryRecord);
      entity.push(at);
      link = next[at];
    }
    // Pushed in reverse so the first record of the entity is expanded first.
    for (const at of entity.reverse()) expand.push(at);
  };

  const root: DirectoryRecord[] = [];
  chain(first, root);
  for (let at = expand.pop(); at !== undefined; at = expand.pop()) {
    chain(lower[at], children[at] as DirectoryRecord[]);
  }
  for (const list of children) Object.freeze(list);

  return {
    directory: Object.freeze({ records: Object.freeze(records), root: Object.freeze(root) }),
    findings,
  };
}

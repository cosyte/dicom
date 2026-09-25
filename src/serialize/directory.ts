/**
 * The writer's half of the DICOMDIR record model: rewrite each offset attribute
 * of a DICOMDIR to the byte offset, in the bytes being written, of the
 * Directory Record it named when the DICOMDIR was read.
 *
 * PS3.3 2026d Table F.3-3 defines `(0004,1200)`, `(0004,1202)`, `(0004,1400)` and
 * `(0004,1420)` as the offset "of the first byte (of the Item Data Element)" of a
 * Directory Record, counted so that it "includes the File Preamble and the DICM
 * Prefix". Everything the writer does ahead of a record moves it: the rebuilt
 * File Meta group, a Data Set's elements put in ascending order, an Item that
 * `deidentify()` re-encoded at another length. So an offset copied through names
 * the wrong bytes, and a viewer walking it can step from one patient's record
 * into another's images.
 *
 * **How an offset is tied to a record.** Each Item the parser read carries
 * {@link Item.fileOffset}, the file offset of its `(FFFE,E000)` tag in the file
 * it came from, and `deidentify()` carries it to the Item it rebuilds. A non-zero
 * offset names the Item of the Directory Record Sequence `(0004,1220)` whose
 * `fileOffset` it equals, and nothing else: never an Item found by scanning for
 * an Item tag, which would tie an offset landing on a Sequence nested inside a
 * record to a record it never named. Each offset is read where it will be
 * written, so every copy of a repeated attribute is tied on its own value.
 *
 * **Refuse, never repair.** An offset it cannot tie is refused with
 * `DIRECTORY_OFFSET_UNRESOLVED`, written neither stale nor as zero; under
 * Deflated Explicit VR LE any non-zero offset is `DIRECTORY_OFFSET_DEFLATED`,
 * because a position in a deflated stream names no Item a reader can seek to.
 * Both are checked before a byte is patched, and `serializeDicom` returns
 * nothing on a throw.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Dataset } from "../dataset/dataset.js";
import {
  DIRECTORY_TAGS,
  directoryRecords,
  readOffsetValue,
  type OffsetValue,
} from "../dataset/directory.js";
import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { type BodyEncoding, isFullSpanElement } from "./element.js";
import { DicomSerializeError, SERIALIZE_ERROR_CODES } from "./errors.js";
import { type ItemPlacement, tagNumber } from "./order.js";

/**
 * Where one root Data Element landed in the body: its first byte, the bytes
 * written for it, and, for the Directory Record Sequence, where its Items and
 * their elements landed inside those bytes.
 *
 * @internal
 */
export interface PlacedElement {
  readonly el: Element;
  readonly start: number;
  readonly bytes: Buffer;
  readonly placements: readonly ItemPlacement[] | undefined;
}

/** The root tags the rewrite reads, and the only ones `encodeBody` records. */
export const PLACED_TAGS: ReadonlySet<Tag> = new Set<Tag>([
  DIRECTORY_TAGS.FIRST_ROOT_RECORD,
  DIRECTORY_TAGS.LAST_ROOT_RECORD,
  DIRECTORY_TAGS.RECORD_SEQUENCE,
]);

/** The record-level offset attributes, as Tag Numbers. */
const RECORD_OFFSET_TAGS: ReadonlySet<number> = new Set([
  tagNumber(DIRECTORY_TAGS.NEXT_RECORD),
  tagNumber(DIRECTORY_TAGS.LOWER_LEVEL),
]);

/** An Implicit VR LE element header: tag (4) + Value Length (4). */
const IMPLICIT_HEADER_LENGTH = 8;

/** One offset the writer will write: its value as read, and where it is written. */
interface Slot {
  readonly value: OffsetValue;
  /** Body offset of its four value bytes, or `undefined` when not placed. */
  readonly at: number | undefined;
}

// The messages are fixed strings with no digit in them, so no digit string of
// an offending offset can appear in one, and nothing read from the Dataset is
// interpolated.
const UNRESOLVED_MESSAGE =
  "The Dataset is a DICOMDIR and carries a Directory Record offset attribute that the writer cannot tie to a Directory Record the Dataset holds: a non-zero offset that names no Item of the Directory Record Sequence, or a value that is not one unsigned integer of four bytes. Written stale it would name the wrong bytes, and written as zero it would silently prune the tree, so nothing is written.";
const DEFLATED_MESSAGE =
  "The Dataset is a DICOMDIR to be written in Deflated Explicit VR Little Endian and carries a non-zero Directory Record offset. A position inside a deflated stream names no Item a reader can seek to, so nothing is written. A DICOMDIR File is to be written in Explicit VR Little Endian.";

function refuse(deflated: boolean): never {
  throw deflated
    ? new DicomSerializeError(SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_DEFLATED, DEFLATED_MESSAGE)
    : new DicomSerializeError(
        SERIALIZE_ERROR_CODES.DIRECTORY_OFFSET_UNRESOLVED,
        UNRESOLVED_MESSAGE,
      );
}

/** Read the four value bytes at `at` in the syntax's byte order. */
function readValue(body: Buffer, at: number, littleEndian: boolean): OffsetValue {
  const value = littleEndian ? body.readUInt32LE(at) : body.readUInt32BE(at);
  return value === 0 ? { kind: "zero" } : { kind: "offset", value };
}

/**
 * Rewrite, in place in `body`, every offset attribute of the DICOMDIR `ds` to
 * the file offset of the Directory Record it names, or throw.
 *
 * `placed` maps each of {@link PLACED_TAGS} the body carries to where it landed;
 * `bodyFileOffset` is the file offset of the body's first byte (the preamble,
 * `DICM` and File Meta group come before it).
 *
 * @throws {@link DicomSerializeError} `DIRECTORY_OFFSET_UNRESOLVED` or
 *   `DIRECTORY_OFFSET_DEFLATED`, before any byte of `body` is changed.
 *
 * @internal
 */
export function rewriteDirectoryOffsets(
  ds: Dataset,
  body: Buffer,
  placed: ReadonlyMap<Tag, PlacedElement>,
  encoding: BodyEncoding,
  bodyFileOffset: number,
  deflated: boolean,
): void {
  const littleEndian = encoding !== "explicitBE";
  const { items, byFileOffset } = directoryRecords(ds);
  const sequence = placed.get(DIRECTORY_TAGS.RECORD_SEQUENCE);
  const placements = sequence?.placements;

  const slots: Slot[] = [];
  for (const tag of [DIRECTORY_TAGS.FIRST_ROOT_RECORD, DIRECTORY_TAGS.LAST_ROOT_RECORD]) {
    const root = placed.get(tag);
    if (root === undefined) continue;
    // A well-formed offset is written as a header and its four value bytes.
    slots.push({ value: readOffsetValue(root.el), at: root.start + root.bytes.length - 4 });
  }

  // Where the Sequence's `rawBytes` begin in the body: after the header the
  // writer rebuilds for a value-only (Implicit VR LE, defined length) `SQ`.
  const rawStart =
    sequence === undefined
      ? 0
      : sequence.start + (isFullSpanElement(sequence.el, encoding) ? 0 : IMPLICIT_HEADER_LENGTH);
  if (placements !== undefined) {
    for (const placement of placements) {
      for (const span of placement.elements) {
        if (!RECORD_OFFSET_TAGS.has(span.tag)) continue;
        const at = rawStart + span.valueStart;
        const value: OffsetValue =
          span.end - span.valueStart === 4
            ? readValue(body, at, littleEndian)
            : { kind: "malformed" };
        slots.push({ value, at });
      }
    }
  } else {
    // The Sequence is written as read, so where its records land is not known:
    // any offset it carries that is not zero cannot be written.
    for (const item of items) {
      for (const tag of [DIRECTORY_TAGS.NEXT_RECORD, DIRECTORY_TAGS.LOWER_LEVEL]) {
        const el = item.get(tag);
        if (el !== undefined) slots.push({ value: readOffsetValue(el), at: undefined });
      }
    }
  }

  const patches: { readonly at: number; readonly value: number }[] = [];
  for (const slot of slots) {
    if (slot.value.kind === "zero") continue;
    if (slot.value.kind === "malformed" || deflated) refuse(deflated);
    const target = byFileOffset.get(slot.value.value);
    const record = target === undefined ? undefined : placements?.[target];
    if (record === undefined || slot.at === undefined) refuse(false);
    patches.push({ at: slot.at, value: bodyFileOffset + rawStart + record.itemStart });
  }
  for (const patch of patches) {
    if (littleEndian) body.writeUInt32LE(patch.value, patch.at);
    else body.writeUInt32BE(patch.value, patch.at);
  }
}

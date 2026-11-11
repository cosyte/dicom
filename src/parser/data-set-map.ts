/**
 * The one place a Data Set's elements are written during a parse: one row each in the parse's
 * compact table (`../dataset/compact.ts`), which keeps them as a `Map<Tag, Element>` would.
 *
 * A parsed Data Set is keyed by tag, so `Map.set` on a tag the map already
 * holds overwrites in place: the earlier element's value leaves the object,
 * silently, and the survivor is indistinguishable from an element the sender
 * wrote once. PS3.5 2026c section 7.1 makes that shape non-conformant on the
 * wire ("shall occur at most once in a Data Set", and section 7.5.1 says the
 * same inside an Item), but a decoder still has to read the bytes it was given,
 * and the ordinary route to one is a length field that lies rather than a sender
 * writing a tag twice.
 *
 * The two dataset element loops (`_parseExplicit` and `parseImplicitLE`, which
 * are also the per-item parsers, so this covers every Data Set at every depth)
 * route their inserts through {@link defineRow} so the replacement is
 * disclosed at the site that performs it. Nothing else changes: the last element
 * read still wins, no value is guessed for the one that lost, and no reading
 * moves.
 *
 * @module
 */

import type { CompactTable, ParsedDataSet, SetWriter } from "../dataset/compact.js";
import type { VR } from "../dictionary/types.js";
import { rowMeta } from "../dataset/compact.js";
import { duplicateTagInDataSet, type DicomParseWarning } from "./warnings.js";

/**
 * Write one element of Data Set `set` into the table, emitting
 * `DICOM_DUPLICATE_TAG_IN_DATA_SET` when its tag is already there. As a `Map` keyed by tag does,
 * the element takes the earlier one's place and the earlier one is gone.
 *
 * The check costs nothing that follows an attacker-chosen length: while a Data Set's tags ascend
 * it is one comparison, and once they do not, a scan of at most 16 rows or one map lookup. It is
 * complete for the Data Set by construction: this is its only writer.
 *
 * `end` is -1 for an element whose value is `length` bytes from its start; anything else is a
 * Sequence-like span with its own end, and its Items when `itemCount` is not -1.
 *
 * @internal
 */
export function defineRow(
  table: CompactTable,
  set: SetWriter,
  emit: (w: DicomParseWarning) => void,
  group: number,
  element: number,
  vr: VR,
  length: number,
  byteOffset: number,
  littleEndian: boolean,
  startBytes: 0 | 8 | 12,
  charset: readonly string[] | undefined,
  privateCreator: string | undefined,
  end: number,
  itemFirst: number,
  itemCount: number,
  cp246: boolean,
): void {
  const complex = end !== -1;
  const meta = rowMeta(
    table.vrIndex(vr),
    littleEndian,
    startBytes,
    complex,
    itemCount !== -1,
    cp246,
  );
  const aux = complex
    ? table.addSeq(end, itemFirst, itemCount === -1 ? 0 : itemCount)
    : table.charsetIndex(charset);
  const duplicate = table.addRow(
    set,
    group * 0x10000 + element,
    length,
    byteOffset,
    meta,
    aux,
    table.creatorIndex(privateCreator),
  );
  if (duplicate) emit(duplicateTagInDataSet({ byteOffset }));
}

/** @internal */
export type { ParsedDataSet };

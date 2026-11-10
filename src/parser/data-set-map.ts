/**
 * The one place a Data Set's `Map<Tag, Element>` is written during a parse.
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
 * route their inserts through {@link defineElement} so the replacement is
 * disclosed at the site that performs it. Nothing else changes: the last element
 * read still wins, no value is guessed for the one that lost, and no reading
 * moves.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import { Element, elementOverRange, type ElementInit } from "../dataset/element.js";
import type { Item } from "../dataset/item.js";
import type { Tag, VR } from "../dictionary/types.js";
import { copyValueBytes } from "./byte-cursor.js";
import type { ParseContext } from "./types.js";
import { duplicateTagInDataSet, type DicomParseWarning } from "./warnings.js";

/**
 * The one init every parsed Element is built from, filled in place for each
 * element. The constructor copies every field out of it, so it is free again as
 * soon as the Element exists, and a parse builds no init object per element.
 * `rawBytes` is never set on it: a range stands in (see {@link parsedElement}).
 */
const INIT: { -readonly [K in keyof ElementInit]: ElementInit[K] | undefined } = {
  tag: "",
  vr: "UN",
  vm: 0,
  length: 0,
  rawBytes: undefined,
  byteOffset: 0,
  privateCreator: undefined,
  cp246Promoted: undefined,
  littleEndian: true,
  specificCharacterSet: undefined,
  items: undefined,
};

/**
 * The Element the parser reads at `start` to `end` of `buffer`. Under
 * `{ copyValues: true }` its `rawBytes` is a standalone copy, made now, as it
 * always was; otherwise the view of that range is made the first time
 * `rawBytes` is read, so an element nobody reads costs no Buffer. Either way a
 * caller reads the same bytes. An `undefined` field is read by the constructor
 * exactly as an omitted one.
 *
 * @internal
 */
export function parsedElement(
  ctx: ParseContext,
  buffer: Buffer,
  start: number,
  end: number,
  tag: Tag,
  vr: VR,
  vm: number,
  length: number,
  byteOffset: number,
  littleEndian: boolean,
  specificCharacterSet: readonly string[] | undefined,
  privateCreator: string | undefined,
  items: readonly Item[] | undefined,
): Element {
  INIT.tag = tag;
  INIT.vr = vr;
  INIT.vm = vm;
  INIT.length = length;
  INIT.byteOffset = byteOffset;
  INIT.privateCreator = privateCreator;
  INIT.littleEndian = littleEndian;
  INIT.specificCharacterSet = specificCharacterSet;
  INIT.items = items;
  if (ctx.copyValues) {
    const copied = { ...INIT, rawBytes: copyValueBytes(buffer.subarray(start, end)) };
    return new Element(copied as ElementInit);
  }
  return elementOverRange(INIT as ElementInit, buffer, start, end);
}

/**
 * Insert `element` into the Data Set map under its own tag, emitting
 * `DICOM_DUPLICATE_TAG_IN_DATA_SET` first when that tag is already present.
 *
 * The check is one `Map.has` per element, so it costs nothing that follows an
 * attacker-chosen length, and it is complete for this map by construction: it is
 * the only writer.
 *
 * @internal
 */
export function defineElement(
  elements: Map<Tag, Element>,
  element: Element,
  emit: (w: DicomParseWarning) => void,
): void {
  if (elements.has(element.tag)) {
    emit(duplicateTagInDataSet({ byteOffset: element.byteOffset }));
  }
  elements.set(element.tag, element);
}

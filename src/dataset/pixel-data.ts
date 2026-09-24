/**
 * Encapsulated Pixel Data, handed back as raw bytes: the Basic Offset Table and
 * every fragment, exactly as the file carries them.
 *
 * An object under a PS3.5 2026c section A.4 Transfer Syntax (JPEG, JPEG-LS,
 * JPEG 2000, HTJ2K, RLE and the rest) carries its Pixel Data `(7FE0,0010)` as an
 * Item stream: a Basic Offset Table Item, then one Item per fragment of the
 * encoded pixel stream, then a Sequence Delimitation Item. The parser reads that
 * structure and never reads a fragment's content. This module is how a caller
 * gets the content: as opaque, **undecoded** bytes. No pixel is decompressed, no
 * frame is assembled from fragments, and the Basic Offset Table's offsets are
 * not interpreted, because each of those is a codec's or a viewer's decision and
 * this package decodes no pixels.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Tag } from "../dictionary/types.js";
import { OFFSET_FRAMES, type ParseFrame } from "../parser/errors.js";
import {
  encapsulatedFragmentExceedsBuffer,
  sqItemHeaderTruncated,
  unexpectedTagInsideSequence,
} from "../parser/fatals.js";
import type { Dataset } from "./dataset.js";
import type { Element } from "./element.js";

const PIXEL_DATA: Tag = "7FE00010";
const UNDEFINED_LENGTH = 0xffffffff;
/** An Explicit VR long-form header: tag (4), VR (2), reserved (2), Value Length (4). */
const ELEMENT_HEADER_LENGTH = 12;
/** An Item or Sequence Delimitation Item header: tag (4), Item Length (4). */
const ITEM_HEADER_LENGTH = 8;
const ITEM_GROUP = 0xfffe;
const ITEM = 0xe000;
const SEQUENCE_DELIMITATION = 0xe0dd;

/**
 * The Basic Offset Table and the fragments of one encapsulated Pixel Data
 * element, each as the raw bytes of its Item Value.
 *
 * Every `Buffer` here is a view over the element's own `Element.rawBytes`, with
 * no Item header and no Sequence Delimitation Item in it, so it follows that
 * element's retention: a zero-copy view over your input by default, and a copy
 * that outlives it under `parseDicom(bytes, { copyValues: true })`.
 *
 * @example
 * ```ts
 * import { parseDicom, readPixelDataFragments } from "@cosyte/dicom";
 * const pixels = readPixelDataFragments(parseDicom(buf));
 * if (pixels !== undefined) {
 *   pixels.basicOffsetTable?.length; // 0 when the table is empty
 *   pixels.fragments.length; // how many fragment Items the file carries
 * }
 * ```
 */
export interface PixelDataFragments {
  /**
   * The Basic Offset Table's Item Value, uninterpreted. **Zero bytes when the
   * table is empty**, which PS3.5 2026c section A.4 permits and decoders must
   * accept. `undefined` only when the Item stream holds no Item at all, which
   * A.4 does not permit; nothing is invented in its place.
   */
  readonly basicOffsetTable: Buffer | undefined;
  /**
   * The Item Value of every Item after the Basic Offset Table, in file order.
   * Each is returned whole: its content is never read, so bytes inside a
   * fragment that happen to look like a delimiter are fragment bytes (A.4: a
   * decoder "may not scan for a Sequence Delimitation Item").
   */
  readonly fragments: readonly Buffer[];
}

/**
 * Read the Basic Offset Table and every fragment of a Data Set's encapsulated
 * Pixel Data `(7FE0,0010)` as raw bytes, without decoding anything.
 *
 * Pass the root {@link Dataset} `parseDicom` returned: its Pixel Data is the
 * top-level element PS3.5 2026c section A.4 encapsulates. An `Item` is a
 * `Dataset` too, and is read the same way over its own elements.
 *
 * **`undefined` means this Data Set has no encapsulated fragments**: Pixel Data
 * is absent, or it is present in native format with an explicit Value Length.
 * That is never an empty list and never a Basic Offset Table, so it cannot be
 * mistaken for an encapsulated result.
 *
 * **The list can be short, and the parse says so.** A stream that ends with the
 * input before its Sequence Delimitation Item still parses, and
 * `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED` on `ds.warnings` says that the
 * fragments read may not be all the sender wrote. Read the warnings before
 * treating the list as complete.
 *
 * @throws `DicomParseError` with code `INVALID_FILE_META` when the element's
 *   bytes are not an Item stream (an Item header cut short, an Item reaching past
 *   the bytes, or a tag other than `(FFFE,E000)` / `(FFFE,E0DD)`). `parseDicom`
 *   refuses such bytes itself, so only a hand-built `Element` reaches this; the
 *   error carries no fragment byte and no length outside its 16-byte `snippet`.
 *
 * @example
 * ```ts
 * import { parseDicom, readPixelDataFragments } from "@cosyte/dicom";
 * const ds = parseDicom(buf); // e.g. a JPEG 2000 object
 * const pixels = readPixelDataFragments(ds);
 * if (pixels === undefined) {
 *   // no encapsulated Pixel Data: absent, or native
 * } else {
 *   for (const fragment of pixels.fragments) {
 *     // hand `fragment` to a codec of your choice; it is the bytes as written
 *   }
 * }
 * ```
 */
export function readPixelDataFragments(ds: Dataset): PixelDataFragments | undefined {
  const el = ds.get(PIXEL_DATA);
  if (el === undefined || !isEncapsulated(el)) return undefined;
  return walkItems(el);
}

/**
 * `true` for the one shape the parser gives encapsulated Pixel Data: `OB` with
 * undefined length, whose `rawBytes` is the full on-wire span, header included.
 */
function isEncapsulated(el: Element): boolean {
  return el.vr === "OB" && el.length === UNDEFINED_LENGTH;
}

/** Walk the Item stream after the element header, taking each Item Value whole. */
function walkItems(el: Element): PixelDataFragments {
  const raw = el.rawBytes;
  const frame: ParseFrame = { buffer: raw, name: OFFSET_FRAMES.VALUE_SLICE };
  const read16 = (at: number): number =>
    el.littleEndian ? raw.readUInt16LE(at) : raw.readUInt16BE(at);
  const read32 = (at: number): number =>
    el.littleEndian ? raw.readUInt32LE(at) : raw.readUInt32BE(at);

  let basicOffsetTable: Buffer | undefined;
  const fragments: Buffer[] = [];
  let at = ELEMENT_HEADER_LENGTH;
  while (at < raw.length) {
    if (at + ITEM_HEADER_LENGTH > raw.length) throw sqItemHeaderTruncated(frame, at);
    const group = read16(at);
    const element = read16(at + 2);
    if (group === ITEM_GROUP && element === SEQUENCE_DELIMITATION) break;
    if (group !== ITEM_GROUP || element !== ITEM) throw unexpectedTagInsideSequence(frame, at);
    const valueStart = at + ITEM_HEADER_LENGTH;
    const valueEnd = valueStart + read32(at + 4);
    if (valueEnd > raw.length) throw encapsulatedFragmentExceedsBuffer(frame, at);
    const value = raw.subarray(valueStart, valueEnd);
    if (basicOffsetTable === undefined) basicOffsetTable = value;
    else fragments.push(value);
    at = valueEnd;
  }
  return { basicOffsetTable, fragments };
}

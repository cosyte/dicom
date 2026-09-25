/**
 * Top-level encapsulated Pixel Data for the Part 10 writer, under the Transfer
 * Syntaxes PS3.5 2026c section A.4 names.
 *
 * Section A.4 makes the whole Data Set Explicit VR Little Endian and puts one
 * rule on the top-level Pixel Data `(7FE0,0010)`: it "shall be Encapsulated
 * Format if present in the top-level Data Set", with "the Value Representation
 * OB", a Length of "the Value for Undefined Length (FFFFFFFFH)", a first Item
 * that "shall be a Basic Offset Table item", each fragment "a DICOM Item with a
 * specific Data Element Tag of Value (FFFE,E000)" whose length is "an even
 * number of bytes greater or equal to two", and the stream "terminated by a
 * Sequence Delimitation Item with the Tag (FFFE,E0DD) and an Value (Item)
 * Length Field of Value (00000000H)". The syntaxes "shall only be used when
 * Pixel Data (7FE0,0010) is present in the top level Data Set, and hence shall
 * not be used when Float Pixel Data (7FE0,0008) or Double Float Pixel Data
 * (7FE0,0009) are present."
 *
 * The parser tolerates every departure from that shape it can read past (an
 * absent or native top-level Pixel Data, odd or empty fragments, a stream that
 * ends before its delimiter). The writer is the conservative half: it checks
 * the whole shape before anything is emitted and refuses a departure with
 * `INVALID_ENCAPSULATED_PIXEL_DATA`, never repairing it. A delimiter appended
 * to a stream the reader flagged as possibly short would be a well-formed file
 * that may be missing frames.
 *
 * What it emits is built, not blitted: the element header is written as
 * `(7FE0,0010) OB`, two zero reserved bytes and `FFFFFFFFH` whatever VR and
 * reserved bytes the input span carried, then the Basic Offset Table Item and
 * every fragment Item exactly as the input holds them (Item tag, Item Length
 * and value, in order, never read inside), then a Sequence Delimitation Item
 * of length zero. The fragments are opaque: no offset table is interpreted or
 * rebuilt and no frame is assembled.
 *
 * Only the TOP-LEVEL element is checked. Pixel Data inside a Sequence Item (an
 * Icon Image Sequence Item, for one) "may or may not be compressed" and is
 * written as read with the rest of its Sequence.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { Dataset } from "../dataset/dataset.js";
import type { Tag } from "../dictionary/types.js";
import { DicomSerializeError, SERIALIZE_ERROR_CODES } from "./errors.js";

/** `(7FE0,0010)` Pixel Data. */
export const PIXEL_DATA: Tag = "7FE00010";
/** `(7FE0,0008)` Float Pixel Data. */
const FLOAT_PIXEL_DATA: Tag = "7FE00008";
/** `(7FE0,0009)` Double Float Pixel Data. */
const DOUBLE_FLOAT_PIXEL_DATA: Tag = "7FE00009";

/** `0xFFFFFFFF` - the undefined-length sentinel (PS3.5 section 7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;
/** An Explicit VR long-form header: tag (4), VR (2), reserved (2), Value Length (4). */
const ELEMENT_HEADER_LENGTH = 12;
/** An Item or Sequence Delimitation Item header: tag (4), Item Length (4). */
const ITEM_HEADER_LENGTH = 8;
const ITEM_GROUP = 0xfffe;
const ITEM = 0xe000;
const SEQUENCE_DELIMITATION = 0xe0dd;

/** `(7FE0,0010) OB`, reserved `0000H`, Value Length `FFFFFFFFH`, Little Endian. */
const PIXEL_DATA_HEADER: Buffer = Buffer.from([
  0xe0, 0x7f, 0x10, 0x00, 0x4f, 0x42, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
]);
/** `(FFFE,E0DD)` with Item Length `00000000H`, Little Endian. */
const SEQUENCE_DELIMITATION_ITEM: Buffer = Buffer.from([
  0xfe, 0xff, 0xdd, 0xe0, 0x00, 0x00, 0x00, 0x00,
]);

/**
 * Every refusal's message: fixed strings, so no length, byte, index or UID
 * read from the `Dataset` reaches `err.message`. The fields that would name
 * the offending Item are input on exactly the files this refuses.
 */
const MESSAGES = {
  absent:
    "A PS3.5 section A.4 Transfer Syntax needs Pixel Data (7FE0,0010) in the top-level Data Set, and it has none.",
  float:
    "A PS3.5 section A.4 Transfer Syntax cannot carry Float Pixel Data (7FE0,0008) or Double Float Pixel Data (7FE0,0009) in the top-level Data Set.",
  native:
    "Top-level Pixel Data (7FE0,0010) under a PS3.5 section A.4 Transfer Syntax has a defined Value Length (Native Format); it must be Encapsulated Format.",
  notFragmentSpan:
    "Top-level Pixel Data (7FE0,0010) is not held as an undefined-length (7FE0,0010) span, so it is not a fragment stream the writer can emit.",
  notItem:
    "The top-level Pixel Data fragment stream holds something other than an Item (FFFE,E000) of defined Item Length before its Sequence Delimitation Item.",
  notDelimited:
    "The top-level Pixel Data fragment stream does not end on a Sequence Delimitation Item (FFFE,E0DD); the writer does not append one to a stream that may be short.",
  afterDelimiter:
    "The top-level Pixel Data span holds bytes after its Sequence Delimitation Item (FFFE,E0DD).",
  oddLength:
    "An Item in the top-level Pixel Data fragment stream has an odd Item Length; PS3.5 section A.4 requires an even number of bytes.",
  emptyFragment:
    "A fragment Item after the Basic Offset Table in the top-level Pixel Data fragment stream has Item Length zero; PS3.5 section A.4 requires two bytes or more.",
  noBasicOffsetTable:
    "The top-level Pixel Data fragment stream holds no Item, so it has no Basic Offset Table Item.",
  noFragment:
    "The top-level Pixel Data fragment stream holds a Basic Offset Table Item and no fragment Item.",
} as const;

function refuse(reason: keyof typeof MESSAGES): never {
  throw new DicomSerializeError(
    SERIALIZE_ERROR_CODES.INVALID_ENCAPSULATED_PIXEL_DATA,
    MESSAGES[reason],
  );
}

/**
 * The end of the Item stream in `raw` (the offset of its Sequence
 * Delimitation Item), after checking every Item section A.4 describes. Walked
 * by each Item's declared length and never by scanning, since a fragment's
 * bytes may look like a delimiter (section A.4, Note).
 */
function itemStreamEnd(raw: Buffer): number {
  let at = ELEMENT_HEADER_LENGTH;
  let items = 0;
  for (;;) {
    if (at + ITEM_HEADER_LENGTH > raw.length) refuse("notDelimited");
    const group = raw.readUInt16LE(at);
    const element = raw.readUInt16LE(at + 2);
    const length = raw.readUInt32LE(at + 4);
    if (group === ITEM_GROUP && element === SEQUENCE_DELIMITATION) break;
    if (group !== ITEM_GROUP || element !== ITEM || length === UNDEFINED_LENGTH) refuse("notItem");
    if (length % 2 === 1) refuse("oddLength");
    if (length === 0 && items > 0) refuse("emptyFragment");
    if (at + ITEM_HEADER_LENGTH + length > raw.length) refuse("notDelimited");
    at += ITEM_HEADER_LENGTH + length;
    items += 1;
  }
  if (at + ITEM_HEADER_LENGTH !== raw.length) refuse("afterDelimiter");
  if (items === 0) refuse("noBasicOffsetTable");
  if (items === 1) refuse("noFragment");
  return at;
}

/**
 * The on-wire bytes of a section A.4 Data Set's top-level Pixel Data: `OB` of
 * undefined length, the input's Basic Offset Table Item and fragment Items
 * byte for byte, then a zero-length Sequence Delimitation Item. Reads `ds`,
 * never changes it.
 *
 * @throws {@link DicomSerializeError} with code
 *   `INVALID_ENCAPSULATED_PIXEL_DATA` when the top-level Data Set is not one a
 *   section A.4 Transfer Syntax may carry (see the module doc).
 *
 * @internal
 */
export function encapsulatedPixelData(ds: Dataset): Buffer {
  if (ds.has(FLOAT_PIXEL_DATA) || ds.has(DOUBLE_FLOAT_PIXEL_DATA)) refuse("float");
  const el = ds.get(PIXEL_DATA);
  if (el === undefined) refuse("absent");
  if (el.length !== UNDEFINED_LENGTH) refuse("native");
  // The input contract: an undefined-length element's `rawBytes` is its whole
  // on-wire span, so the span's own header must say `(7FE0,0010)` of
  // undefined length before the bytes after it can be read as its Items.
  const raw = el.rawBytes;
  if (
    raw.length < ELEMENT_HEADER_LENGTH ||
    raw.readUInt16LE(0) !== 0x7fe0 ||
    raw.readUInt16LE(2) !== 0x0010 ||
    raw.readUInt32LE(8) !== UNDEFINED_LENGTH
  ) {
    refuse("notFragmentSpan");
  }
  const end = itemStreamEnd(raw);
  return Buffer.concat([
    PIXEL_DATA_HEADER,
    raw.subarray(ELEMENT_HEADER_LENGTH, end),
    SEQUENCE_DELIMITATION_ITEM,
  ]);
}

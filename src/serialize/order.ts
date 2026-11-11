/**
 * Emit-side Data Element ordering for the Part 10 writer.
 *
 * PS3.5 2026c section 7.1: "The Data Elements in a Data Set shall be ordered by
 * increasing Data Element Tag Number and shall occur at most once in a Data
 * Set." Section 7.5.1 repeats it one level down, for the Data Set an Item
 * carries: its Data Elements "shall be ordered by increasing Data Element Tag
 * value and appear only once". The parser accepts a Data Set in any order and
 * the model keeps parse order, so the order is normalized here, at the emit
 * boundary, and nowhere else.
 *
 * The root Data Set is ordered by `serializeDicom`'s `planBody`, from
 * {@link emissionOf}. This module also orders the Data Sets inside a Sequence,
 * which the model cannot do: an `SQ` element's `items` are the parser's
 * reading, while the bytes the writer emits are the element's `rawBytes`. So
 * the Item stream is walked ON THE WIRE, and every byte emitted is a byte
 * `rawBytes` already carried. Nothing is re-encoded from `items`, which on
 * the de-identify path could put back a value the de-identifier removed.
 *
 * What the walk does, and the rules it holds to:
 *
 *  - **A pure permutation of element spans.** Each Item's Data Elements are
 *    re-emitted in ascending Tag order, compared as the unsigned Group Number
 *    then the unsigned Element Number (section 7.1.1). A span moves whole, so
 *    no value byte changes, and because an Explicit Length Item's length "shall
 *    include the total length of all Data Elements conveyed by this Item"
 *    (section 7.5.1), every Item and Sequence length stays valid.
 *  - **Items keep their order.** Section 7.5: "Items present in an SQ Data
 *    Element shall be an ordered set where each Item may be referenced by its
 *    ordinal position". Only the elements inside an Item move.
 *  - **Only where the source's read agrees with the bytes.** The reader decides
 *    things the writer cannot see from the bytes alone: under Implicit VR LE it
 *    resolves a VR from a `Profile` and the Private Creators before it, it holds
 *    a Sequence whose descent it refused (`DICOM_SQ_NOT_DESCENDED`) as an opaque
 *    value, and it reads a `UN` it cannot read as a Sequence to the end of its
 *    Data Set. So the parsed model is the record of how these bytes were read,
 *    and a Sequence is ordered only when that record matches the walk: the
 *    Sequence was descended, with one model Item per Item on the wire; each
 *    Item holds the same tags; and each element's `rawBytes` are the bytes of
 *    its span. Two differences are the writer's own normalizations and are
 *    accepted: a value padded to even length, and a group-length element left
 *    out, both of which `deidentify()` output carries. The model decides what
 *    may NOT move; it is never a source of bytes.
 *  - **A repeated tag keeps both copies, in source relative order.** The sort is
 *    stable. The model holds the last copy only (the reader lets it replace the
 *    earlier one), so an earlier copy is emitted as read and must have a
 *    defined length: nothing else shows where a reader ends it.
 *  - **Walked by declared length, never by scanning.** Section 7.1.2, Note: a
 *    decoder "may not scan for a Sequence Delimitation Item since the series of
 *    bytes of which it is composed may be a valid value within the Value Field".
 *    An undefined-length value the walk does not descend (encapsulated Pixel
 *    Data, a `UN`, a Sequence past the bound) ends where the source's read of
 *    it ended, and its bytes are compared to that read's before anything moves.
 *  - **All or nothing per top-level Sequence.** If any part of a top-level
 *    `SQ`'s Item stream cannot be walked to exactly its end (a length that runs
 *    past its container, an undefined-length Item with no Item Delimitation
 *    Item, bytes that are not an Item stream) or disagrees with the model, that
 *    whole Sequence is emitted as read. A length that lies anywhere inside it
 *    means the reader's framing is unknown, and moving any span near it could
 *    change what a reader sees.
 *  - **An element whose own bytes do not show where it ends goes last.** A
 *    reader that finds no delimiter reads to the end of the Data Set, so moving
 *    another element after such a value would put that element inside it on the
 *    next read. An element is closed when its length is defined (and it is not
 *    an Explicit VR `SQ`, whose items a reader follows past a lying length), a
 *    Sequence the walk descended to its end, an encapsulated Pixel Data value
 *    whose fragments end on its Sequence Delimitation Item, or a Sequence the
 *    reader descended and the walk does not order (a CP-246 `UN`, or a private
 *    `SQ` a `Profile` resolved under Implicit VR LE) whose Item stream, walked
 *    against the model, does. Every other element keeps its source order after
 *    the ascending rest; that is what an undefined-length `UN` the reader could
 *    not read as a Sequence gets. The same rule holds at the root.
 *  - **Only on-wire `SQ` is ordered inside.** A value whose on-wire VR is not
 *    `SQ` (encapsulated Pixel Data, `UN` at undefined length including a
 *    CP-246 promoted one, `OB`/`OW`) is emitted as read. Under Implicit VR LE
 *    there is no VR on the wire, so a nested element is a Sequence when PS3.6
 *    names its tag `SQ`, the same resolution the parser makes with no
 *    `Profile`; a private element is never one.
 *  - **Bounded by `NESTING_DEPTH_LIMIT`, in one pass.** Sequences nested deeper
 *    than the library's bound are emitted as read, their extent taken from the
 *    model, so no input depth reaches the call stack. Seeing where a reader ends
 *    one would take the walk past the bound, so such a Sequence is not shown to
 *    close and goes after the ascending rest of its Item, unless it is a
 *    defined-length Sequence under Implicit VR LE. No byte is walked twice at
 *    one level: a failed walk returns rather than retrying another way.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import {
  type Element,
  elementValueEnd,
  elementValueSource,
  elementValueStart,
} from "../dataset/element.js";
import type { Item } from "../dataset/item.js";
import { splitTag } from "../dataset/tag.js";
import { tagEntry } from "../dictionary/registry.js";
import type { Tag } from "../dictionary/types.js";
import { LONG_FORM_VRS, matchRepeatingGroup } from "../parser/element-header.js";
import { isRecognizedVr } from "../parser/endian.js";
import { tagOf, vrAt } from "../parser/wire-tokens.js";
import { NESTING_DEPTH_LIMIT } from "../parser/sequence.js";
import { type BodyEncoding, isFullSpanElement, padValue } from "./element.js";

/** `0xFFFFFFFF` - the undefined-length sentinel (PS3.5 section 7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;

/** `(FFFE,E000)` Item, as a Tag Number. */
const ITEM = 0xfffee000;
/** `(FFFE,E00D)` Item Delimitation Item, as a Tag Number. */
const ITEM_DELIMITATION = 0xfffee00d;
/** `(FFFE,E0DD)` Sequence Delimitation Item, as a Tag Number. */
const SEQUENCE_DELIMITATION = 0xfffee0dd;
/** `(7FE0,0010)` Pixel Data. */
const PIXEL_DATA: Tag = "7FE00010";

/** Header bytes shared by every Item and delimiter: tag (4) + length (4). */
const MARKER_LENGTH = 8;

/** The on-wire layout an Item stream is encoded in. */
interface WireSyntax {
  readonly encoding: BodyEncoding;
  readonly littleEndian: boolean;
  readonly explicitVr: boolean;
}

const IMPLICIT_LE: WireSyntax = { encoding: "implicit", littleEndian: true, explicitVr: false };

const SYNTAX: Readonly<Record<BodyEncoding, WireSyntax>> = {
  implicit: IMPLICIT_LE,
  explicitLE: { encoding: "explicitLE", littleEndian: true, explicitVr: true },
  explicitBE: { encoding: "explicitBE", littleEndian: false, explicitVr: true },
};

/**
 * The result of walking one span: where it starts and the offset just past it,
 * whether anything in it moved, and, when something did, the views that
 * re-emit it in order. A span nothing moved in is emitted as the bytes from
 * `start` to `end`, and no view is made of it unless something around it moves
 * (see {@link pushParts}).
 */
interface Walked {
  readonly parts: readonly Buffer[] | undefined;
  readonly changed: boolean;
  readonly start: number;
  readonly end: number;
}

/**
 * A span as an Item emits it: where it started and its value started, and the
 * Tag Number it sorts by.
 */
interface Emitted extends Walked {
  readonly tag: number;
  readonly valueStart: number;
}

/** One Data Element span inside an Item. */
interface ElementSpan extends Emitted {
  readonly undefinedLength: boolean;
  /** `true` when the walk descended this span's Items. */
  readonly descended: boolean;
  /** The model's element for this span's tag: the last one the reader read. */
  readonly model: Element;
}

/**
 * Where one Data Element of a placed Item's own Data Set lands, counted in the
 * element's emitted `rawBytes`: its first byte, its value's first byte, and the
 * byte just past it.
 *
 * @internal
 */
export interface PlacedSpan {
  readonly tag: number;
  readonly start: number;
  readonly valueStart: number;
  readonly end: number;
}

/**
 * Where one Item of a root Sequence lands, counted in the element's emitted
 * `rawBytes`: its `(FFFE,E000)` Item tag, and each Data Element of its own Data
 * Set in the order they are written. Items keep their order and every Item is
 * written at its own length, so an Item starts where it started in `rawBytes`;
 * only the elements inside it move.
 *
 * @internal
 */
export interface ItemPlacement {
  readonly itemStart: number;
  readonly elements: readonly PlacedSpan[];
}

/** How the writer emits one root Data Element. */
export interface ElementEmission {
  /**
   * Stands in for the element's `rawBytes` (same representation) when the Data
   * Sets of its Items were re-ordered; `undefined` means emit `rawBytes` as
   * they are.
   */
  readonly rawBytes: Buffer | undefined;
  /**
   * `false` when the element's own bytes do not show where a reader ends it, so
   * it is written after the ascending rest rather than moved among them.
   */
  readonly closed: boolean;
  /**
   * One {@link ItemPlacement} per Item, when {@link emissionOf} was asked to place
   * them and walked the Sequence to its end; `undefined` otherwise, which means
   * the Sequence is written as read and where its Items' elements land is not
   * known.
   */
  readonly placements?: readonly ItemPlacement[];
}

// The reads take the bytes straight from the buffer when they are all inside it, which is what
// `Buffer.readUInt16LE` and its kin return, without the argument list Node's offset check builds on
// every call. A read that reaches past either end goes to the Buffer method, so it throws as it did.

function readUint16(buf: Buffer, offset: number, littleEndian: boolean): number {
  if (offset < 0 || offset + 2 > buf.length) {
    return littleEndian ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
  }
  const a = buf[offset] as number;
  const b = buf[offset + 1] as number;
  return littleEndian ? a | (b << 8) : (a << 8) | b;
}

function readUint32(buf: Buffer, offset: number, littleEndian: boolean): number {
  if (offset < 0 || offset + 4 > buf.length) {
    return littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
  }
  const a = buf[offset] as number;
  const b = buf[offset + 1] as number;
  const c = buf[offset + 2] as number;
  const d = buf[offset + 3] as number;
  return littleEndian
    ? a + b * 0x100 + c * 0x10000 + d * 0x1000000
    : a * 0x1000000 + b * 0x10000 + c * 0x100 + d;
}

/** The Tag Number at `offset`: unsigned Group Number, then unsigned Element Number. */
function readTagNumber(buf: Buffer, offset: number, littleEndian: boolean): number {
  return (
    readUint16(buf, offset, littleEndian) * 0x10000 + readUint16(buf, offset + 2, littleEndian)
  );
}

/** `true` for a `(FFFE,xxxx)` Item or delimiter tag, which carries no VR. */
function isMarker(tagNumber: number): boolean {
  return tagNumber >= 0xfffe0000 && tagNumber < 0xffff0000;
}

function appendAll(target: Buffer[], source: readonly Buffer[]): void {
  for (const part of source) target.push(part);
}

/** Push the views that re-emit `walked`: its own when it moved, else its bytes as read. */
function pushParts(target: Buffer[], buf: Buffer, walked: Walked): void {
  if (walked.parts !== undefined) appendAll(target, walked.parts);
  else target.push(buf.subarray(walked.start, walked.end));
}

/**
 * A tag as PS3.5 2026c section 7.1.1 defines one, "An ordered pair of 16-bit
 * unsigned integers representing the Group Number followed by Element Number",
 * folded into one number that sorts the same way.
 *
 * @internal
 */
export function tagNumber(tag: Tag): number {
  let n = TAG_NUMBERS.get(tag);
  if (n === undefined) {
    const { group, element } = splitTag(tag);
    n = group * 0x10000 + element;
    if (TAG_NUMBERS.size < TAG_NUMBER_CACHE_LIMIT) TAG_NUMBERS.set(tag, n);
  }
  return n;
}

/** Tag Numbers already worked out, by tag; bounded, as a hand-built tag can be any string. */
const TAG_NUMBERS = new Map<Tag, number>();
const TAG_NUMBER_CACHE_LIMIT = 16_384;

/**
 * The model's `Tag` spelling of a Tag Number: eight upper-case hex digits, the
 * same string the reader built for the tag.
 */
function tagOfNumber(tagNumberValue: number): Tag {
  return tagOf(Math.floor(tagNumberValue / 0x10000), tagNumberValue % 0x10000);
}

/**
 * `true` when an Implicit VR LE element with this Tag Number is a Sequence. The
 * wire carries no VR, so this is the parser's own `resolveImplicitVR` answer for
 * a standard tag with no `Profile`: the first PS3.6 VR of the tag's own entry,
 * else of its repeating-group family. A private (odd-group) tag is never one.
 */
function isImplicitSequence(tagNumberValue: number): boolean {
  const group = Math.floor(tagNumberValue / 0x10000);
  if (group % 2 === 1) return false;
  const tag = tagOfNumber(tagNumberValue);
  const entry = tagEntry(tag) ?? matchRepeatingGroup(tag);
  return entry?.vr[0] === "SQ";
}

/** A Data Element header read off the wire. */
interface ElementHeader {
  tag: number;
  headerLength: number;
  length: number;
  /** The on-wire VR; `undefined` under Implicit VR. */
  vr: string | undefined;
}

/**
 * The one header {@link readElementHeader} fills. A walk reads a header for every Data Element at
 * every depth, so one record is reused rather than one built per element; a caller copies what it
 * needs out of it before it reads the next header.
 */
const HEADER: ElementHeader = { tag: 0, headerLength: 0, length: 0, vr: undefined };

/**
 * Read the Data Element (or delimiter) header at `p` into {@link HEADER}, or
 * return `undefined` when it does not fit inside `stop`. The Explicit VR layout
 * is decided exactly as the parser's `readExplicitElementHeader` decides it:
 * long form for `LONG_FORM_VRS` and for any VR PS3.5 2026c does not define
 * (section 6.2). A `(FFFE,xxxx)` marker has no VR on the wire in either syntax.
 */
function readElementHeader(
  buf: Buffer,
  p: number,
  stop: number,
  syntax: WireSyntax,
): ElementHeader | undefined {
  if (p + MARKER_LENGTH > stop) return undefined;
  const le = syntax.littleEndian;
  const header = HEADER;
  header.tag = readTagNumber(buf, p, le);
  if (!syntax.explicitVr || isMarker(header.tag)) {
    header.headerLength = MARKER_LENGTH;
    header.length = readUint32(buf, p + 4, le);
    header.vr = undefined;
    return header;
  }
  const vr = vrAt(buf, p + 4);
  if (LONG_FORM_VRS.has(vr) || !isRecognizedVr(vr)) {
    if (p + 12 > stop) return undefined;
    header.headerLength = 12;
    header.length = readUint32(buf, p + 8, le);
    header.vr = vr;
    return header;
  }
  header.headerLength = MARKER_LENGTH;
  header.length = readUint16(buf, p + 6, le);
  header.vr = vr;
  return header;
}

/** `true` when this header opens a Sequence the ordering walk may descend. */
function isSequence(header: ElementHeader, syntax: WireSyntax): boolean {
  return syntax.explicitVr ? header.vr === "SQ" : isImplicitSequence(header.tag);
}

/** A span emitted as read. */
function verbatim(start: number, end: number): Walked {
  return { parts: undefined, changed: false, start, end };
}

/**
 * `true` when encapsulated Pixel Data's fragments, each an Item of defined
 * length (PS3.5 section A.4), end on its Sequence Delimitation Item exactly at
 * the end of its span. A reader that finds no such Item reads to the end of the
 * Data Set.
 */
function fragmentsClose(buf: Buffer, start: number, littleEndian: boolean): boolean {
  let p = start;
  while (p + MARKER_LENGTH <= buf.length) {
    const tag = readTagNumber(buf, p, littleEndian);
    p += MARKER_LENGTH;
    if (tag === SEQUENCE_DELIMITATION) return p === buf.length;
    if (tag !== ITEM) return false;
    p += readUint32(buf, p - 4, littleEndian);
  }
  return false;
}

/**
 * `true` when an undefined-length value the walk does not order still ends on
 * its own Sequence Delimitation Item exactly at the end of its span, so a
 * reader stops there wherever it is placed: encapsulated Pixel Data, or a
 * Sequence the reader descended whose Item stream agrees with the model's
 * reading of it. That Sequence is a CP-246 `UN`, whose Items are Implicit VR LE
 * as the parser reads them, or an `SQ` the walk does not order, such as a
 * private one a `Profile` resolved under Implicit VR LE, whose Items are in the
 * syntax it was read in. `depth` is the level its Items sit at. Anything else, a
 * `UN` the reader could not read as a Sequence first of all, is not shown to
 * close.
 */
function closesItself(el: Element, syntax: WireSyntax, depth: number): boolean {
  const raw = el.rawBytes;
  const valueStart = syntax.explicitVr ? 12 : MARKER_LENGTH;
  if (el.cp246Promoted === true || el.vr === "SQ") {
    if (depth > NESTING_DEPTH_LIMIT) return false;
    const itemSyntax = el.cp246Promoted === true ? IMPLICIT_LE : syntax;
    const walked = walkItems(raw, valueStart, undefined, raw.length, itemSyntax, depth, el.items);
    return walked?.end === raw.length;
  }
  return el.tag === PIXEL_DATA && fragmentsClose(raw, valueStart, syntax.littleEndian);
}

/**
 * Walk one Data Element inside an Item at nesting `depth`, ordering the Items
 * of a Sequence it opens when that Sequence is within the bound and the model
 * says the reader descended it.
 */
function walkElement(
  buf: Buffer,
  p: number,
  stop: number,
  syntax: WireSyntax,
  depth: number,
  item: Item,
): ElementSpan | undefined {
  const header = readElementHeader(buf, p, stop, syntax);
  if (header === undefined) return undefined;
  // Copied out first: the walk below reads the headers inside this element into the same record.
  const tag = header.tag;
  const valueStart = p + header.headerLength;
  const declared = header.length;
  const sequence = isSequence(header, syntax);
  const model = item.get(tagOfNumber(tag));
  if (model === undefined) return undefined;
  const undefinedLength = declared === UNDEFINED_LENGTH;
  const items =
    depth < NESTING_DEPTH_LIMIT && sequence && model.vr === "SQ" ? model.items : undefined;

  if (items === undefined) {
    // Not descended. A defined length frames it; an undefined-length one ends
    // where the source's read of it ended (its `rawBytes` are the whole span),
    // and `agrees` compares those bytes once the Item has been walked.
    const end = undefinedLength ? p + elementValueLength(model) : valueStart + declared;
    if (end < valueStart || end > stop) return undefined;
    return {
      tag,
      start: p,
      valueStart,
      undefinedLength,
      descended: false,
      model,
      parts: undefined,
      changed: false,
      end,
    };
  }
  const definedEnd = undefinedLength ? undefined : valueStart + declared;
  const walked =
    definedEnd !== undefined && definedEnd > stop
      ? undefined
      : walkItems(buf, valueStart, definedEnd, stop, syntax, depth + 1, items);
  if (walked === undefined) return undefined;
  let parts: Buffer[] | undefined;
  if (walked.changed) {
    parts = [buf.subarray(p, valueStart)];
    pushParts(parts, buf, walked);
  }
  return {
    tag,
    start: p,
    valueStart,
    undefinedLength,
    descended: true,
    model,
    parts,
    changed: walked.changed,
    end: walked.end,
  };
}

/** The length of an Element's `rawBytes`, read without making the view. */
function elementValueLength(el: Element): number {
  return elementValueEnd(el) - elementValueStart(el);
}

/** Values up to this long are compared byte by byte, with no view made of either side. */
const COMPARE_IN_PLACE_BYTES = 64;

/** `true` when `length` bytes of `a` from `aStart` are the bytes of `b` from `bStart`. */
function sameBytes(a: Buffer, aStart: number, b: Buffer, bStart: number, length: number): boolean {
  if (length > COMPARE_IN_PLACE_BYTES) {
    // `equals` over views: `compare` with a source range throws a RangeError under Deno's
    // `node:buffer` on arguments Node accepts.
    return a.subarray(aStart, aStart + length).equals(b.subarray(bStart, bStart + length));
  }
  for (let i = 0; i < length; i++) {
    if (a[aStart + i] !== b[bStart + i]) return false;
  }
  return true;
}

/**
 * `true` when the model's element is the reading of exactly this span: its
 * `rawBytes`, in the representation the writer's input contract gives them
 * (value-only, or the whole on-wire span), are the span's bytes, or those bytes
 * less the writer's own even-length pad. For a descended Sequence the walk has
 * already matched every Item, so its extent is what is left to agree.
 */
function agrees(buf: Buffer, span: ElementSpan, encoding: BodyEncoding): boolean {
  const model = span.model;
  const valueOnly = !isFullSpanElement(model, encoding);
  const from = valueOnly ? span.valueStart : span.start;
  const length = span.end - from;
  const src = elementValueSource(model);
  const start = elementValueStart(model);
  const end = elementValueEnd(model);
  if (span.descended) return end - start === length;
  if (end - start === length && sameBytes(src, start, buf, from, length)) return true;
  return (
    valueOnly &&
    length === end - start + 1 &&
    padValue(model.rawBytes, model.vr).equals(buf.subarray(from, span.end))
  );
}

/**
 * `true` when an Item's Data Set, whose spans carry `count` distinct Tag
 * Numbers in ascending order, has a span for every element the reader found
 * (bar a group length, which the writer itself leaves out of an Item it
 * encodes). Every span's tag is one of the model's, so equal counts mean the
 * same tags.
 */
function coversAscending(model: Item, spans: readonly ElementSpan[]): boolean {
  const elements = model.elements();
  if (elements.length === spans.length) return true;
  for (const el of elements) {
    if (splitTag(el.tag).element !== 0x0000 && !hasSpan(spans, tagNumber(el.tag))) return false;
  }
  return true;
}

/** `true` when `spans`, in ascending Tag Number order, hold one with Tag Number `tag`. */
function hasSpan(spans: readonly ElementSpan[], tag: number): boolean {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const at = (spans[mid] as ElementSpan).tag;
    if (at === tag) return true;
    if (at < tag) low = mid + 1;
    else high = mid - 1;
  }
  return false;
}

/** Whether a span that agrees with its model shows where a reader ends it. */
function spanCloses(span: ElementSpan, syntax: WireSyntax, depth: number): boolean {
  return (
    span.descended ||
    !isFullSpanElement(span.model, syntax.encoding) ||
    closesItself(span.model, syntax, depth + 1)
  );
}

/**
 * The spans of an Item's Data Set in the order they are written, when they
 * were read in strictly ascending Tag order, or `undefined` when the Item
 * cannot be ordered. No tag repeats, so every span is the model's last copy;
 * the closed spans keep their order, already ascending, and the open ones
 * follow. That is what {@link orderedAnyOrder} returns for the same spans,
 * without the sort and with no array made when nothing moves.
 */
function orderedAscending(
  buf: Buffer,
  spans: ElementSpan[],
  syntax: WireSyntax,
  depth: number,
  model: Item,
): readonly Emitted[] | undefined {
  if (!coversAscending(model, spans)) return undefined;
  let closed: Emitted[] | undefined;
  let open: Emitted[] | undefined;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i] as ElementSpan;
    if (!agrees(buf, span, syntax.encoding)) return undefined;
    const closes = spanCloses(span, syntax, depth);
    if (open === undefined) {
      if (closes) continue;
      // The first open span: every span before it is closed, in order.
      closed = spans.slice(0, i);
      open = [];
    }
    (closes ? (closed as Emitted[]) : open).push(span);
  }
  return open === undefined ? spans : [...(closed as Emitted[]), ...open];
}

/**
 * The spans of an Item's Data Set in the order they are written, in any order
 * they were read, or `undefined` when the Item cannot be ordered.
 */
function orderedAnyOrder(
  buf: Buffer,
  spans: readonly ElementSpan[],
  syntax: WireSyntax,
  depth: number,
  model: Item,
): readonly Emitted[] | undefined {
  const last = new Map<number, ElementSpan>();
  for (const span of spans) last.set(span.tag, span);
  // Every element the reader found has its span (bar a group length, which the
  // writer itself leaves out of an Item it encodes).
  for (const el of model.elements()) {
    if (!last.has(tagNumber(el.tag)) && splitTag(el.tag).element !== 0x0000) return undefined;
  }
  const closed: Emitted[] = [];
  const open: Emitted[] = [];
  for (const span of spans) {
    if (last.get(span.tag) !== span) {
      // An earlier copy of a repeated tag: another element follows it, so the
      // reader ended it on its own length.
      if (span.undefinedLength) return undefined;
      closed.push({
        tag: span.tag,
        valueStart: span.valueStart,
        parts: undefined,
        changed: false,
        start: span.start,
        end: span.end,
      });
    } else if (!agrees(buf, span, syntax.encoding)) {
      return undefined;
    } else if (spanCloses(span, syntax, depth)) {
      closed.push(span);
    } else {
      open.push(span);
    }
  }
  // Array.prototype.sort is stable (ES2019), so a repeated tag keeps its copies
  // in source relative order.
  return [...closed.sort((a, b) => a.tag - b.tag), ...open];
}

/**
 * Walk the Data Set one Item carries and emit its elements in ascending Tag
 * order, closed elements first. `definedEnd` is the end an Explicit Length Item
 * declares; `undefined` means the Item runs to its Item Delimitation Item,
 * which must come before `limit`. `model` is the reader's Item for it.
 */
function walkDataSet(
  buf: Buffer,
  start: number,
  definedEnd: number | undefined,
  limit: number,
  syntax: WireSyntax,
  depth: number,
  model: Item,
  placed?: PlacedSpan[],
): Walked | undefined {
  const stop = definedEnd ?? limit;
  const spans: ElementSpan[] = [];
  let delimiterAt: number | undefined;
  let ascending = true;
  let previous = -1;
  let p = start;
  while (definedEnd === undefined || p < definedEnd) {
    if (p + MARKER_LENGTH > stop) return undefined;
    const tag = readTagNumber(buf, p, syntax.littleEndian);
    if (isMarker(tag)) {
      if (definedEnd !== undefined || tag !== ITEM_DELIMITATION) return undefined;
      delimiterAt = p;
      p += MARKER_LENGTH;
      break;
    }
    const span = walkElement(buf, p, stop, syntax, depth, model);
    if (span === undefined) return undefined;
    if (span.tag <= previous) ascending = false;
    previous = span.tag;
    spans.push(span);
    p = span.end;
  }

  const ordered = ascending
    ? orderedAscending(buf, spans, syntax, depth, model)
    : orderedAnyOrder(buf, spans, syntax, depth, model);
  if (ordered === undefined) return undefined;
  if (placed !== undefined) {
    // Each span is written whole and at its own length, so where it lands is
    // the Item body's start plus the spans written before it.
    let at = start;
    for (const span of ordered) {
      const length = span.end - span.start;
      placed.push({
        tag: span.tag,
        start: at,
        valueStart: at + (span.valueStart - span.start),
        end: at + length,
      });
      at += length;
    }
  }
  if (!movedOrChanged(ordered, spans)) return verbatim(start, p);
  const parts: Buffer[] = [];
  for (const span of ordered) pushParts(parts, buf, span);
  if (delimiterAt !== undefined) parts.push(buf.subarray(delimiterAt, delimiterAt + MARKER_LENGTH));
  return { parts, changed: true, start, end: p };
}

/** `true` when a span of `ordered` sits elsewhere than in `spans`, or was itself re-ordered. */
function movedOrChanged(ordered: readonly Emitted[], spans: readonly ElementSpan[]): boolean {
  for (let i = 0; i < ordered.length; i++) {
    const span = ordered[i] as Emitted;
    if (span.changed || span.start !== spans[i]?.start) return true;
  }
  return false;
}

/**
 * Walk a Sequence's Item stream at nesting `depth`, keeping the Items in order
 * and ordering each Item's Data Set against its model Item. `definedEnd` is the
 * end a defined-length Sequence declares, and the stream must reach it exactly;
 * `undefined` means it runs to its Sequence Delimitation Item, which must come
 * before `limit`. The reader must have read as many Items as the wire carries.
 * `placements`, when given, collects where each Item and its elements land.
 */
function walkItems(
  buf: Buffer,
  start: number,
  definedEnd: number | undefined,
  limit: number,
  syntax: WireSyntax,
  depth: number,
  items: readonly Item[] | undefined,
  placements?: ItemPlacement[],
): Walked | undefined {
  if (items === undefined) return undefined;
  const stop = definedEnd ?? limit;
  const le = syntax.littleEndian;
  // Each Item's walk from the first one that changed, kept until the end decides whether any view
  // is needed. Every Item before it was written as read, so those Items are one run of bytes.
  let walkedItems: Walked[] | undefined;
  let unchangedEnd = start;
  let delimiterAt: number | undefined;
  let index = 0;
  let p = start;
  while (definedEnd === undefined || p < definedEnd) {
    if (p + MARKER_LENGTH > stop) return undefined;
    const tag = readTagNumber(buf, p, le);
    if (tag === SEQUENCE_DELIMITATION && definedEnd === undefined) {
      delimiterAt = p;
      p += MARKER_LENGTH;
      break;
    }
    const model = items[index];
    if (tag !== ITEM || model === undefined) return undefined;
    const length = readUint32(buf, p + 4, le);
    const bodyStart = p + MARKER_LENGTH;
    const collect: PlacedSpan[] | undefined = placements !== undefined ? [] : undefined;
    let item: Walked | undefined;
    if (length === UNDEFINED_LENGTH) {
      item = walkDataSet(buf, bodyStart, undefined, stop, syntax, depth, model, collect);
    } else if (bodyStart + length <= stop) {
      item = walkDataSet(buf, bodyStart, bodyStart + length, stop, syntax, depth, model, collect);
    }
    if (item === undefined) return undefined;
    if (placements !== undefined && collect !== undefined) {
      placements.push({ itemStart: p, elements: collect });
    }
    if (walkedItems !== undefined) walkedItems.push(item);
    else if (item.changed) walkedItems = [item];
    else unchangedEnd = item.end;
    p = item.end;
    index += 1;
  }
  if (index !== items.length) return undefined;
  if (walkedItems === undefined) return verbatim(start, p);
  // Every Item keeps its place, so each one's Item header is the 8 bytes before
  // its body, and its body is its walk.
  const parts: Buffer[] = [];
  if (unchangedEnd > start) parts.push(buf.subarray(start, unchangedEnd));
  for (const item of walkedItems) {
    parts.push(buf.subarray(item.start - MARKER_LENGTH, item.start));
    pushParts(parts, buf, item);
  }
  if (delimiterAt !== undefined) parts.push(buf.subarray(delimiterAt, delimiterAt + MARKER_LENGTH));
  return { parts, changed: true, start, end: p };
}

/**
 * Walk a root `SQ` element's Item stream against its model Items, or
 * `undefined` when it cannot be walked to exactly the end of its `rawBytes` or
 * the reader did not descend it. `placements`, when given, collects where each
 * of its Items and their elements land.
 */
function walkSequence(
  el: Element,
  syntax: WireSyntax,
  placements?: ItemPlacement[],
): Walked | undefined {
  const raw = el.rawBytes;
  let valueStart = 0;
  let definedEnd: number | undefined = raw.length;
  if (isFullSpanElement(el, syntax.encoding)) {
    const header = readElementHeader(raw, 0, raw.length, syntax);
    // Under Explicit VR the on-wire VR decides, so a `UN` span is never opened.
    if (header === undefined || (syntax.explicitVr && header.vr !== "SQ")) return undefined;
    valueStart = header.headerLength;
    definedEnd = header.length === UNDEFINED_LENGTH ? undefined : valueStart + header.length;
  }
  const walked = walkItems(
    raw,
    valueStart,
    definedEnd,
    raw.length,
    syntax,
    1,
    el.items,
    placements,
  );
  if (walked?.end !== raw.length) return undefined;
  if (!walked.changed) return walked;
  const parts: Buffer[] = [raw.subarray(0, valueStart)];
  pushParts(parts, raw, walked);
  return { parts, changed: true, start: 0, end: raw.length };
}

/**
 * How the writer emits one root Data Element under `encoding`: for an `SQ`, its
 * `rawBytes` with every Data Set of every Item it can walk re-ordered
 * ascending, and for every element whether its own bytes show where a reader
 * ends it. A Sequence is re-ordered only from the bytes it carries, and the
 * result is the same length as its `rawBytes`, so the header the writer
 * reconstructs for an Implicit VR LE defined-length `SQ` (whose `rawBytes` are
 * value-only) declares the same length it did.
 *
 * With `place`, an `SQ` the walk reaches to its end also reports where each of
 * its Items and their elements land ({@link ElementEmission.placements}), which
 * is how `serializeDicom` finds a DICOMDIR's Directory Records in its output.
 *
 * @internal
 */
export function emissionOf(el: Element, encoding: BodyEncoding, place = false): ElementEmission {
  const syntax = SYNTAX[encoding];
  const valueOnly = !isFullSpanElement(el, encoding);
  if (el.vr !== "SQ" || el.cp246Promoted === true) {
    return { rawBytes: undefined, closed: valueOnly || closesItself(el, syntax, 1) };
  }
  const placements: ItemPlacement[] | undefined = place ? [] : undefined;
  const walked = walkSequence(el, syntax, placements);
  if (walked === undefined) return { rawBytes: undefined, closed: valueOnly };
  return {
    rawBytes: walked.changed ? Buffer.concat(walked.parts as readonly Buffer[]) : undefined,
    closed: true,
    ...(placements !== undefined ? { placements } : {}),
  };
}

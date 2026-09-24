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
 * The root Data Set is ordered by `serializeDicom`'s `encodeBody`, from
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

import type { Element } from "../dataset/element.js";
import type { Item } from "../dataset/item.js";
import { splitTag } from "../dataset/tag.js";
import { TAGS } from "../dictionary/generated/tags.js";
import type { Tag, VR } from "../dictionary/types.js";
import { LONG_FORM_VRS, matchRepeatingGroup } from "../parser/element-header.js";
import { isRecognizedVr } from "../parser/endian.js";
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
 * The result of walking one span: the views that re-emit it in order, whether
 * anything in it moved, and the offset just past it.
 */
interface Walked {
  readonly parts: readonly Buffer[];
  readonly changed: boolean;
  readonly end: number;
}

/** A span as an Item emits it: where it started, and the Tag Number it sorts by. */
interface Emitted extends Walked {
  readonly tag: number;
  readonly start: number;
}

/** One Data Element span inside an Item. */
interface ElementSpan extends Emitted {
  readonly valueStart: number;
  readonly undefinedLength: boolean;
  /** `true` when the walk descended this span's Items. */
  readonly descended: boolean;
  /** The model's element for this span's tag: the last one the reader read. */
  readonly model: Element;
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
}

function readUint16(buf: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function readUint32(buf: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
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

/**
 * A tag as PS3.5 2026c section 7.1.1 defines one, "An ordered pair of 16-bit
 * unsigned integers representing the Group Number followed by Element Number",
 * folded into one number that sorts the same way.
 *
 * @internal
 */
export function tagNumber(tag: Tag): number {
  const { group, element } = splitTag(tag);
  return group * 0x10000 + element;
}

/** The model's `Tag` spelling of a Tag Number: eight upper-case hex digits. */
function tagOf(tagNumberValue: number): Tag {
  return tagNumberValue.toString(16).padStart(8, "0").toUpperCase();
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
  const tag = tagOf(tagNumberValue);
  const entry = TAGS[tag] ?? matchRepeatingGroup(tag);
  return entry?.vr[0] === "SQ";
}

/** A Data Element header read off the wire. */
interface ElementHeader {
  readonly tag: number;
  readonly headerLength: number;
  readonly length: number;
  /** The on-wire VR; `undefined` under Implicit VR. */
  readonly vr: string | undefined;
}

/**
 * Read the Data Element (or delimiter) header at `p`, or `undefined` when it
 * does not fit inside `stop`. The Explicit VR layout is decided exactly as the
 * parser's `readExplicitElementHeader` decides it: long form for
 * `LONG_FORM_VRS` and for any VR PS3.5 2026c does not define (section 6.2).
 * A `(FFFE,xxxx)` marker has no VR on the wire in either syntax.
 */
function readElementHeader(
  buf: Buffer,
  p: number,
  stop: number,
  syntax: WireSyntax,
): ElementHeader | undefined {
  if (p + MARKER_LENGTH > stop) return undefined;
  const le = syntax.littleEndian;
  const tag = readTagNumber(buf, p, le);
  if (!syntax.explicitVr || isMarker(tag)) {
    return { tag, headerLength: MARKER_LENGTH, length: readUint32(buf, p + 4, le), vr: undefined };
  }
  const vr = buf.toString("ascii", p + 4, p + 6);
  if (LONG_FORM_VRS.has(vr as VR) || !isRecognizedVr(vr)) {
    if (p + 12 > stop) return undefined;
    return { tag, headerLength: 12, length: readUint32(buf, p + 8, le), vr };
  }
  return { tag, headerLength: MARKER_LENGTH, length: readUint16(buf, p + 6, le), vr };
}

/** `true` when this header opens a Sequence the ordering walk may descend. */
function isSequence(header: ElementHeader, syntax: WireSyntax): boolean {
  return syntax.explicitVr ? header.vr === "SQ" : isImplicitSequence(header.tag);
}

/** A span emitted as read. */
function verbatim(buf: Buffer, start: number, end: number): Walked {
  return { parts: [buf.subarray(start, end)], changed: false, end };
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
  const model = item.get(tagOf(header.tag));
  if (model === undefined) return undefined;
  const valueStart = p + header.headerLength;
  const undefinedLength = header.length === UNDEFINED_LENGTH;
  const items =
    depth < NESTING_DEPTH_LIMIT && isSequence(header, syntax) && model.vr === "SQ"
      ? model.items
      : undefined;

  let walked: Walked | undefined;
  if (items !== undefined) {
    const definedEnd = undefinedLength ? undefined : valueStart + header.length;
    walked =
      definedEnd !== undefined && definedEnd > stop
        ? undefined
        : walkItems(buf, valueStart, definedEnd, stop, syntax, depth + 1, items);
  } else {
    // Not descended. A defined length frames it; an undefined-length one ends
    // where the source's read of it ended (its `rawBytes` are the whole span),
    // and `agrees` compares those bytes once the Item has been walked.
    const end = undefinedLength ? p + model.rawBytes.length : valueStart + header.length;
    walked = end < valueStart || end > stop ? undefined : verbatim(buf, valueStart, end);
  }
  if (walked === undefined) return undefined;
  const span = {
    tag: header.tag,
    start: p,
    valueStart,
    undefinedLength,
    descended: items !== undefined,
    model,
  };
  if (!walked.changed) return { ...span, ...verbatim(buf, p, walked.end) };
  const parts: Buffer[] = [buf.subarray(p, valueStart)];
  appendAll(parts, walked.parts);
  return { ...span, parts, changed: true, end: walked.end };
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
  const bytes = buf.subarray(valueOnly ? span.valueStart : span.start, span.end);
  if (span.descended) return model.rawBytes.length === bytes.length;
  if (model.rawBytes.equals(bytes)) return true;
  return (
    valueOnly &&
    bytes.length === model.rawBytes.length + 1 &&
    padValue(model.rawBytes, model.vr).equals(bytes)
  );
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
): Walked | undefined {
  const stop = definedEnd ?? limit;
  const spans: ElementSpan[] = [];
  let delimiter: Buffer | undefined;
  let p = start;
  while (definedEnd === undefined || p < definedEnd) {
    if (p + MARKER_LENGTH > stop) return undefined;
    const tag = readTagNumber(buf, p, syntax.littleEndian);
    if (isMarker(tag)) {
      if (definedEnd !== undefined || tag !== ITEM_DELIMITATION) return undefined;
      delimiter = buf.subarray(p, p + MARKER_LENGTH);
      p += MARKER_LENGTH;
      break;
    }
    const span = walkElement(buf, p, stop, syntax, depth, model);
    if (span === undefined) return undefined;
    spans.push(span);
    p = span.end;
  }

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
      closed.push({ tag: span.tag, start: span.start, ...verbatim(buf, span.start, span.end) });
    } else if (!agrees(buf, span, syntax.encoding)) {
      return undefined;
    } else if (
      span.descended ||
      !isFullSpanElement(span.model, syntax.encoding) ||
      closesItself(span.model, syntax, depth + 1)
    ) {
      closed.push(span);
    } else {
      open.push(span);
    }
  }
  // Array.prototype.sort is stable (ES2019), so a repeated tag keeps its copies
  // in source relative order.
  const ordered = [...closed.sort((a, b) => a.tag - b.tag), ...open];
  const moved = ordered.some((span, i) => span.start !== spans[i]?.start);
  if (!moved && !ordered.some((span) => span.changed)) return verbatim(buf, start, p);
  const parts: Buffer[] = [];
  for (const span of ordered) appendAll(parts, span.parts);
  if (delimiter !== undefined) parts.push(delimiter);
  return { parts, changed: true, end: p };
}

/**
 * Walk a Sequence's Item stream at nesting `depth`, keeping the Items in order
 * and ordering each Item's Data Set against its model Item. `definedEnd` is the
 * end a defined-length Sequence declares, and the stream must reach it exactly;
 * `undefined` means it runs to its Sequence Delimitation Item, which must come
 * before `limit`. The reader must have read as many Items as the wire carries.
 */
function walkItems(
  buf: Buffer,
  start: number,
  definedEnd: number | undefined,
  limit: number,
  syntax: WireSyntax,
  depth: number,
  items: readonly Item[] | undefined,
): Walked | undefined {
  if (items === undefined) return undefined;
  const stop = definedEnd ?? limit;
  const le = syntax.littleEndian;
  const parts: Buffer[] = [];
  let changed = false;
  let index = 0;
  let p = start;
  while (definedEnd === undefined || p < definedEnd) {
    if (p + MARKER_LENGTH > stop) return undefined;
    const tag = readTagNumber(buf, p, le);
    if (tag === SEQUENCE_DELIMITATION && definedEnd === undefined) {
      parts.push(buf.subarray(p, p + MARKER_LENGTH));
      p += MARKER_LENGTH;
      break;
    }
    const model = items[index];
    if (tag !== ITEM || model === undefined) return undefined;
    const length = readUint32(buf, p + 4, le);
    const bodyStart = p + MARKER_LENGTH;
    let item: Walked | undefined;
    if (length === UNDEFINED_LENGTH) {
      item = walkDataSet(buf, bodyStart, undefined, stop, syntax, depth, model);
    } else if (bodyStart + length <= stop) {
      item = walkDataSet(buf, bodyStart, bodyStart + length, stop, syntax, depth, model);
    }
    if (item === undefined) return undefined;
    parts.push(buf.subarray(p, bodyStart));
    appendAll(parts, item.parts);
    changed ||= item.changed;
    p = item.end;
    index += 1;
  }
  if (index !== items.length) return undefined;
  if (!changed) return verbatim(buf, start, p);
  return { parts, changed, end: p };
}

/**
 * Walk a root `SQ` element's Item stream against its model Items, or
 * `undefined` when it cannot be walked to exactly the end of its `rawBytes` or
 * the reader did not descend it.
 */
function walkSequence(el: Element, syntax: WireSyntax): Walked | undefined {
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
  const walked = walkItems(raw, valueStart, definedEnd, raw.length, syntax, 1, el.items);
  if (walked?.end !== raw.length) return undefined;
  if (!walked.changed) return walked;
  return { parts: [raw.subarray(0, valueStart), ...walked.parts], changed: true, end: raw.length };
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
 * @internal
 */
export function emissionOf(el: Element, encoding: BodyEncoding): ElementEmission {
  const syntax = SYNTAX[encoding];
  const valueOnly = !isFullSpanElement(el, encoding);
  if (el.vr !== "SQ" || el.cp246Promoted === true) {
    return { rawBytes: undefined, closed: valueOnly || closesItself(el, syntax, 1) };
  }
  const walked = walkSequence(el, syntax);
  if (walked === undefined) return { rawBytes: undefined, closed: valueOnly };
  return { rawBytes: walked.changed ? Buffer.concat(walked.parts) : undefined, closed: true };
}

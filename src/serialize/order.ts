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
 * The root Data Set is ordered by `serializeDicom`'s `encodeBody` (see
 * {@link compareTags}). This module orders the Data Sets inside a Sequence,
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
 *  - **A repeated tag keeps both copies, in source relative order.** The sort is
 *    stable. Resolving which copy survives is not this module's decision, and a
 *    reader that keeps the last one read sees the same survivor it did before.
 *  - **Walked by declared length, never by scanning.** Section 7.1.2, Note: a
 *    decoder "may not scan for a Sequence Delimitation Item since the series of
 *    bytes of which it is composed may be a valid value within the Value Field".
 *  - **All or nothing per top-level Sequence.** If any part of a top-level
 *    `SQ`'s Item stream cannot be walked to exactly its end (a length that runs
 *    past its container, an undefined-length Item with no Item Delimitation
 *    Item, bytes that are not an Item stream), that whole Sequence is emitted as
 *    read. A length that lies anywhere inside it means the reader's framing is
 *    unknown, and moving any span near it could change what a reader sees.
 *  - **Only on-wire `SQ` is ordered inside.** A value whose on-wire VR is not
 *    `SQ` (encapsulated Pixel Data, `UN` at undefined length including a
 *    CP-246 promoted one, `OB`/`OW`) is emitted as read. Its extent is still
 *    found by walking its Items, so the enclosing Item can be ordered around it.
 *    Under Implicit VR LE there is no VR on the wire, so a nested element is a
 *    Sequence when PS3.6 names its tag `SQ`, the same resolution the parser
 *    makes with no `Profile`; a private element is never one.
 *  - **Bounded by `NESTING_DEPTH_LIMIT`, in one pass.** Sequences nested deeper
 *    than the library's bound are emitted as read. Finding the end of such a
 *    span, or of any non-`SQ` item stream, is an iterative walk with its own
 *    stack, so no input depth reaches the call stack. No byte is walked twice
 *    at one level: a failed walk returns rather than retrying another way.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import { TAGS } from "../dictionary/generated/tags.js";
import type { VR } from "../dictionary/types.js";
import { LONG_FORM_VRS, matchRepeatingGroup } from "../parser/element-header.js";
import { isRecognizedVr } from "../parser/endian.js";
import { NESTING_DEPTH_LIMIT } from "../parser/sequence.js";
import { type BodyEncoding, isFullSpanElement } from "./element.js";

/** `0xFFFFFFFF` - the undefined-length sentinel (PS3.5 section 7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;

/** `(FFFE,E000)` Item, as a Tag Number. */
const ITEM = 0xfffee000;
/** `(FFFE,E00D)` Item Delimitation Item, as a Tag Number. */
const ITEM_DELIMITATION = 0xfffee00d;
/** `(FFFE,E0DD)` Sequence Delimitation Item, as a Tag Number. */
const SEQUENCE_DELIMITATION = 0xfffee0dd;
/** `(7FE0,0010)` Pixel Data, as a Tag Number. */
const PIXEL_DATA = 0x7fe00010;

/** Header bytes shared by every Item and delimiter: tag (4) + length (4). */
const MARKER_LENGTH = 8;

/** The on-wire layout an Item stream is encoded in. */
interface WireSyntax {
  readonly littleEndian: boolean;
  readonly explicitVr: boolean;
}

const IMPLICIT_LE: WireSyntax = { littleEndian: true, explicitVr: false };
const EXPLICIT_LE: WireSyntax = { littleEndian: true, explicitVr: true };
const EXPLICIT_BE: WireSyntax = { littleEndian: false, explicitVr: true };

const SYNTAX: Readonly<Record<BodyEncoding, WireSyntax>> = {
  implicit: IMPLICIT_LE,
  explicitLE: EXPLICIT_LE,
  explicitBE: EXPLICIT_BE,
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

/** One Data Element span inside an Item, with the Tag Number it sorts by. */
interface ElementSpan extends Walked {
  readonly tag: number;
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
 * Compare two tags as PS3.5 2026c section 7.1.1 defines one: "An ordered pair
 * of 16-bit unsigned integers representing the Group Number followed by
 * Element Number". Used for the root Data Set, where each element's tag is the
 * model's.
 *
 * @internal
 */
export function compareTags(a: Element, b: Element): number {
  return tagNumberOf(a) - tagNumberOf(b);
}

function tagNumberOf(el: Element): number {
  return parseInt(el.tag.slice(0, 4), 16) * 0x10000 + parseInt(el.tag.slice(4, 8), 16);
}

/**
 * `true` when an Implicit VR LE element with this Tag Number is a Sequence. The
 * wire carries no VR, so this is the parser's own `resolveImplicitVR` answer for
 * a standard tag with no `Profile`: the first PS3.6 VR of the tag's own entry,
 * else of its repeating-group family. A private (odd-group) tag is never one.
 */
function isImplicitSequence(tagNumber: number): boolean {
  const group = Math.floor(tagNumber / 0x10000);
  if (group % 2 === 1) return false;
  const tag = tagNumber.toString(16).padStart(8, "0").toUpperCase();
  const entry = TAGS[tag] ?? matchRepeatingGroup(tag);
  return entry?.vr[0] === "SQ";
}

/**
 * Find the end of an undefined-length Item stream WITHOUT re-ordering anything
 * in it, or `undefined` when it cannot be walked to its Sequence Delimitation
 * Item inside `stop`.
 *
 * Iterative, with an explicit stack, because what it walks is by construction
 * the part the ordering walk does not recurse into: a Sequence past
 * `NESTING_DEPTH_LIMIT`, or a value whose VR is not `SQ` and whose nesting no
 * bound has been applied to. A defined-length Item is stepped over by its length
 * and never opened; only undefined-length constructs have to be entered to find
 * where they end.
 *
 * `fragments` marks encapsulated Pixel Data, whose Items are fragments with a
 * defined length each (PS3.5 section A.4). `UN` content is Implicit VR LE, the
 * CP-246 encoding the parser reads it with.
 */
function skipItemStream(
  buf: Buffer,
  start: number,
  stop: number,
  outer: WireSyntax,
  fragments: boolean,
): number | undefined {
  interface Frame {
    readonly items: boolean;
    readonly syntax: WireSyntax;
    readonly fragments: boolean;
  }
  const stack: Frame[] = [{ items: true, syntax: outer, fragments }];
  let p = start;
  let top = stack[0];
  while (top !== undefined) {
    const le = top.syntax.littleEndian;
    if (p + MARKER_LENGTH > stop) return undefined;
    if (top.items) {
      const tag = readTagNumber(buf, p, le);
      const length = readUint32(buf, p + 4, le);
      p += MARKER_LENGTH;
      if (tag === SEQUENCE_DELIMITATION) {
        stack.pop();
      } else if (tag !== ITEM) {
        return undefined;
      } else if (length === UNDEFINED_LENGTH) {
        if (top.fragments) return undefined;
        stack.push({ items: false, syntax: top.syntax, fragments: false });
      } else {
        if (p + length > stop) return undefined;
        p += length;
      }
    } else {
      const header = readElementHeader(buf, p, stop, top.syntax);
      if (header === undefined) return undefined;
      if (header.tag === ITEM_DELIMITATION) {
        p += MARKER_LENGTH;
        stack.pop();
      } else if (isMarker(header.tag)) {
        return undefined;
      } else if (header.length === UNDEFINED_LENGTH) {
        const inner = innerStreamOf(header, top.syntax);
        if (inner === undefined) return undefined;
        stack.push({ items: true, syntax: inner.syntax, fragments: inner.fragments });
        p += header.headerLength;
      } else {
        const end = p + header.headerLength + header.length;
        if (end > stop) return undefined;
        p = end;
      }
    }
    top = stack[stack.length - 1];
  }
  return p;
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

/**
 * For an undefined-length element: the syntax its Item stream is encoded in,
 * or `undefined` when the parser gives that shape no Item stream at all.
 */
function innerStreamOf(
  header: ElementHeader,
  syntax: WireSyntax,
): { syntax: WireSyntax; fragments: boolean } | undefined {
  if (isSequence(header, syntax)) return { syntax, fragments: false };
  if (!syntax.explicitVr || header.vr === "UN") return { syntax: IMPLICIT_LE, fragments: false };
  if (header.tag === PIXEL_DATA && header.vr === "OB") return { syntax, fragments: true };
  return undefined;
}

/** A span emitted as read. */
function verbatim(buf: Buffer, start: number, end: number): Walked {
  return { parts: [buf.subarray(start, end)], changed: false, end };
}

/**
 * Walk one Data Element inside an Item at nesting `depth`, ordering the Items
 * of a Sequence it opens when that Sequence is within the bound.
 */
function walkElement(
  buf: Buffer,
  p: number,
  stop: number,
  syntax: WireSyntax,
  depth: number,
): ElementSpan | undefined {
  const header = readElementHeader(buf, p, stop, syntax);
  if (header === undefined) return undefined;
  const valueStart = p + header.headerLength;
  const descend = isSequence(header, syntax) && depth + 1 <= NESTING_DEPTH_LIMIT;

  let walked: Walked | undefined;
  if (header.length === UNDEFINED_LENGTH) {
    if (descend) {
      walked = walkItems(buf, valueStart, undefined, stop, syntax, depth + 1);
    } else {
      const inner = innerStreamOf(header, syntax);
      const end =
        inner === undefined
          ? undefined
          : skipItemStream(buf, valueStart, stop, inner.syntax, inner.fragments);
      walked = end === undefined ? undefined : verbatim(buf, valueStart, end);
    }
  } else {
    const valueEnd = valueStart + header.length;
    if (valueEnd > stop) return undefined;
    walked = descend
      ? walkItems(buf, valueStart, valueEnd, valueEnd, syntax, depth + 1)
      : verbatim(buf, valueStart, valueEnd);
  }
  if (walked === undefined) return undefined;
  if (!walked.changed) return { tag: header.tag, ...verbatim(buf, p, walked.end) };
  const parts: Buffer[] = [buf.subarray(p, valueStart)];
  appendAll(parts, walked.parts);
  return { tag: header.tag, parts, changed: true, end: walked.end };
}

/**
 * Walk the Data Set one Item carries and emit its elements in ascending Tag
 * order. `definedEnd` is the end an Explicit Length Item declares; `undefined`
 * means the Item runs to its Item Delimitation Item, which must come before
 * `limit`.
 */
function walkDataSet(
  buf: Buffer,
  start: number,
  definedEnd: number | undefined,
  limit: number,
  syntax: WireSyntax,
  depth: number,
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
    const span = walkElement(buf, p, stop, syntax, depth);
    if (span === undefined) return undefined;
    spans.push(span);
    p = span.end;
  }

  // Array.prototype.sort is stable (ES2019), so a repeated tag keeps its copies
  // in source relative order.
  const ordered = [...spans].sort((a, b) => a.tag - b.tag);
  const moved = ordered.some((span, i) => span !== spans[i]);
  if (!moved && !spans.some((span) => span.changed)) return verbatim(buf, start, p);
  const parts: Buffer[] = [];
  for (const span of ordered) appendAll(parts, span.parts);
  if (delimiter !== undefined) parts.push(delimiter);
  return { parts, changed: true, end: p };
}

/**
 * Walk a Sequence's Item stream at nesting `depth`, keeping the Items in order
 * and ordering each Item's Data Set. `definedEnd` is the end a defined-length
 * Sequence declares, and the stream must reach it exactly; `undefined` means it
 * runs to its Sequence Delimitation Item, which must come before `limit`.
 */
function walkItems(
  buf: Buffer,
  start: number,
  definedEnd: number | undefined,
  limit: number,
  syntax: WireSyntax,
  depth: number,
): Walked | undefined {
  const stop = definedEnd ?? limit;
  const le = syntax.littleEndian;
  const parts: Buffer[] = [];
  let changed = false;
  let p = start;
  while (definedEnd === undefined || p < definedEnd) {
    if (p + MARKER_LENGTH > stop) return undefined;
    const tag = readTagNumber(buf, p, le);
    if (tag === SEQUENCE_DELIMITATION && definedEnd === undefined) {
      parts.push(buf.subarray(p, p + MARKER_LENGTH));
      p += MARKER_LENGTH;
      break;
    }
    if (tag !== ITEM) return undefined;
    const length = readUint32(buf, p + 4, le);
    const bodyStart = p + MARKER_LENGTH;
    let item: Walked | undefined;
    if (length === UNDEFINED_LENGTH) {
      item = walkDataSet(buf, bodyStart, undefined, stop, syntax, depth);
    } else if (bodyStart + length <= stop) {
      item = walkDataSet(buf, bodyStart, bodyStart + length, stop, syntax, depth);
    }
    if (item === undefined) return undefined;
    parts.push(buf.subarray(p, bodyStart));
    appendAll(parts, item.parts);
    changed ||= item.changed;
    p = item.end;
  }
  if (!changed) return verbatim(buf, start, p);
  return { parts, changed, end: p };
}

/**
 * The bytes to emit for an `SQ` element in place of its `rawBytes`: the same
 * bytes, with every Data Set in every Item it can walk re-ordered ascending.
 * `undefined` means emit `rawBytes` as they are, either because nothing moves or
 * because the Item stream cannot be walked to exactly its end.
 *
 * The result is the same length as `rawBytes`, so the header the writer
 * reconstructs for an Implicit VR LE defined-length `SQ` (whose `rawBytes` are
 * value-only) declares the same length it did.
 *
 * @internal
 */
export function orderedSequenceBytes(el: Element, encoding: BodyEncoding): Buffer | undefined {
  if (el.vr !== "SQ" || el.cp246Promoted === true) return undefined;
  const syntax = SYNTAX[encoding];
  const raw = el.rawBytes;
  let valueStart: number;
  let definedEnd: number | undefined;
  if (!isFullSpanElement(el, encoding)) {
    // Implicit VR LE, defined length: value-only, the Item stream is all of it.
    valueStart = 0;
    definedEnd = raw.length;
  } else if (!syntax.explicitVr) {
    // Implicit VR LE, undefined length: tag (4) + length (4), then the stream.
    if (raw.length < MARKER_LENGTH) return undefined;
    if (raw.readUInt32LE(4) !== UNDEFINED_LENGTH) return undefined;
    valueStart = MARKER_LENGTH;
    definedEnd = undefined;
  } else {
    // Explicit VR: tag (4) + VR (2) + reserved (2) + length (4). The on-wire VR
    // decides, so a `UN` span the model promoted is never opened.
    if (raw.length < 12 || raw.toString("ascii", 4, 6) !== "SQ") return undefined;
    const length = readUint32(raw, 8, syntax.littleEndian);
    valueStart = 12;
    definedEnd = length === UNDEFINED_LENGTH ? undefined : valueStart + length;
    if (definedEnd !== undefined && definedEnd !== raw.length) return undefined;
  }

  const walked = walkItems(raw, valueStart, definedEnd, raw.length, syntax, 1);
  if (walked === undefined || walked.end !== raw.length || !walked.changed) return undefined;
  const parts: Buffer[] = [raw.subarray(0, valueStart)];
  appendAll(parts, walked.parts);
  let total = 0;
  for (const part of parts) total += part.length;
  // A permutation of spans cannot change the length; if it did, emit as read.
  if (total !== raw.length) return undefined;
  return Buffer.concat(parts, total);
}

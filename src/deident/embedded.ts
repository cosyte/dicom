/**
 * Detection of a **Data Element embedded in another element's Value Field**, for
 * the de-identification boundary.
 *
 * ## The defect this exists for
 *
 * PS3.5 2026c defines Value Length as "The length of the Value Field of the Data
 * Element" - that element's own value, and nothing after it. A sender that
 * writes a Value Length longer than the value it actually encoded does not
 * produce a detectably broken file: the reader consumes the declared count, and
 * the bytes it over-consumes are the *next* element, header and all. The reading
 * is self-consistent, every subsequent offset lines up, and nothing on the wire
 * says which length field lied. `parseDicom` therefore reads it exactly the way
 * the file says, and that is the right posture for a parser.
 *
 * It is **not** a safe posture for a de-identifier. PS3.15 §E.1 obliges an
 * implementation claiming the Basic Application Level Confidentiality Profile
 * "to protect or retain all instances of the Attributes listed in [Table E.1-1],
 * whether contained in the top level Data Set or embedded in an Item of a
 * Sequence of Items". An absorbed `(0010,0020)` Patient ID is such an instance,
 * and it is invisible to an action table keyed by tag, because after the swallow
 * there is no `(0010,0020)` in the object at all - only bytes inside some other
 * attribute's value. Table E.1-1 is consulted, finds nothing to do, and the
 * identifier is written into de-identified output verbatim with a clean report.
 * Measured on the grid at `0.0.6`, that is not a corner: **877 of the 6,348
 * cells that parse** leak a source value this way.
 *
 * The standard also settles the direction of the remedy rather than leaving it
 * to taste. §E.3.5, the Clean Descriptors Option, requires that "any information
 * that is embedded in text or string Attributes corresponding to the Attribute
 * information specified to be removed by the Profile ... shall also be removed".
 * That Option is about a human typing a name into Study Description, not about a
 * length field; but it is the standard's own statement that PHI *inside a string
 * attribute's value* is in scope for removal, which is the principle applied
 * here. Removing is fail-safe; keeping is not.
 *
 * ## What is claimed, and what is not
 *
 * This module makes **no** claim to recover the correct reading. The two
 * readings - "the length is right and the value is odd" versus "the length lied
 * and the next element was swallowed" - are byte-identical, so a parser cannot
 * choose between them and this module does not try. It answers a strictly
 * narrower question, and only for values the de-identifier was about to
 * **keep**:
 *
 * > Does this value's tail decode, in this file's own transfer syntax, as a
 * > complete run of Data Elements ending exactly at the end of the value, at
 * > least one of which is an attribute this run would have acted on, and does
 * > that run contain a byte the carrier's VR cannot legally hold?
 *
 * All three conjuncts are load-bearing, and the third is what keeps this from
 * being a guess:
 *
 *  - **Exact tiling** is the swallow's own signature. An over-declaring element
 *    absorbs whole elements, so the absorbed bytes end where the value ends. A
 *    run that overshoots, undershoots, or needs an odd-length Value Field is not
 *    a swallow and is rejected.
 *  - **An actionable tag** is what makes it PHI rather than a curiosity. The
 *    test is the same {@link resolveAction} the caller's own options resolve
 *    through, so `RetainUIDs` or `RetainLongitudinalTemporal` narrow this in
 *    exactly the way they narrow the Basic Profile - one authority, not two.
 *  - **A byte outside the carrier VR's repertoire** turns "these bytes happen to
 *    decode as an element" into "these bytes are provably not a conformant value
 *    of this VR". PS3.5 §6.1.2.1 admits no control characters in the string VRs
 *    at all, and only ESC/CR/LF/FF/TAB in `LT`/`ST`/`UT`/`UC`; a Data Element
 *    header carries tag and length bytes that are overwhelmingly outside that.
 *    Without this conjunct a long uppercase `LO` value could in principle tile;
 *    with it, a false positive additionally requires the carrier to already be
 *    non-conformant.
 *
 * **Carriers are string VRs only** ({@link SCANNABLE_CARRIER_VRS}), which is
 * where the third conjunct has meaning. A swallow into `OB`, `OW`, `UN` or any
 * other binary VR is undetectable by content - arbitrary bytes are exactly what
 * those VRs are for - and is a stated residual, not something quietly covered.
 * `SQ` is also out of scope here: a sequence the parser declined to descend
 * keeps its item stream as opaque bytes, which is a different defect with a
 * different remedy (`DICOM-DEIDENT-RAWBYTES-PASSTHROUGH`), and folding it in
 * would make this module answer a question it has not measured.
 *
 * ## Cost
 *
 * Linear in the value's length. `tiles[]`/`hit[]` are computed by one backward
 * pass over even offsets, each doing one constant-time header decode, so a
 * pathological value cannot buy super-linear work - the trap the sibling
 * sequence slice was refuted on twice. Values longer than
 * {@link MAX_SCAN_BYTES} are scanned over their trailing window only; a swallow
 * lives at the tail by construction, and the bound is what keeps the memo arrays
 * from following an attacker-chosen length.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import { joinTag } from "../dataset/tag.js";
import type { Tag, VR } from "../dictionary/types.js";
import { BE_VR_STRIDE } from "../parser/endian.js";
import { LONG_FORM_VRS } from "../parser/element-header.js";
import type { BodyEncoding } from "../serialize/element.js";

/** The 34 VRs PS3.5 §6.2 defines, as a closed set to check an on-wire VR against. */
const KNOWN_VRS: ReadonlySet<string> = new Set<string>(Object.keys(BE_VR_STRIDE));

const UNDEFINED_LENGTH = 0xffffffff;

/** `(FFFE,E000)` Item, `(FFFE,E00D)` Item Delimitation, `(FFFE,E0DD)` Sequence Delimitation. */
const FFFE_GROUP = 0xfffe;

/**
 * The carrier VRs this scan runs on: the string VRs of PS3.5 §6.2, i.e. exactly
 * those whose Default Character Repertoire excludes the control bytes a Data
 * Element header is made of.
 *
 * Binary VRs are deliberately absent. A value whose legal content is arbitrary
 * bytes cannot be shown by content to have swallowed anything, so including them
 * would trade a measured guarantee for a coin-flip that removes real pixel and
 * lookup-table data.
 */
export const SCANNABLE_CARRIER_VRS: ReadonlySet<VR> = new Set<VR>([
  "AE",
  "AS",
  "CS",
  "DA",
  "DS",
  "DT",
  "IS",
  "LO",
  "LT",
  "PN",
  "SH",
  "ST",
  "TM",
  "UC",
  "UI",
  "UR",
  "UT",
]);

/**
 * The VRs PS3.5 §6.1.2.1 lets carry the five formatting control characters
 * (ESC, TAB, CR, LF, FF). Every other string VR admits none at all.
 */
const CONTROL_TOLERANT_VRS: ReadonlySet<VR> = new Set<VR>(["LT", "ST", "UT", "UC"]);

const ALLOWED_CONTROL_BYTES: ReadonlySet<number> = new Set<number>([
  0x09, // TAB
  0x0a, // LF
  0x0c, // FF
  0x0d, // CR
  0x1b, // ESC
]);

/**
 * Trailing window scanned on an over-long value. A swallow ends at the end of
 * the value, so the window is at the tail; the bound exists so the memo arrays
 * are sized by this module and not by a declared length.
 */
export const MAX_SCAN_BYTES = 1 << 20;

/** Smallest possible Data Element: 4-byte tag + 4-byte length, empty value. */
const MIN_HEADER = 8;

interface Decoded {
  /** Offset just past this element (header + value). */
  readonly next: number;
  /** The element's tag, or `undefined` for an `(FFFE,xxxx)` structural marker. */
  readonly tag: Tag | undefined;
}

function readU16(buf: Buffer, off: number, littleEndian: boolean): number {
  return littleEndian ? buf.readUInt16LE(off) : buf.readUInt16BE(off);
}

function readU32(buf: Buffer, off: number, littleEndian: boolean): number {
  return littleEndian ? buf.readUInt32LE(off) : buf.readUInt32BE(off);
}

/**
 * Decode one Data Element header at `off`, in `encoding`, refusing anything a
 * conformant encoder could not have written.
 *
 * Returns `undefined` for "not a Data Element here", which is the only answer
 * this function is allowed to be loose about - being loose the other way would
 * mean deleting a value on the strength of a coincidence.
 */
function decodeAt(value: Buffer, off: number, encoding: BodyEncoding): Decoded | undefined {
  if (off + MIN_HEADER > value.length) return undefined;
  const littleEndian = encoding !== "explicitBE";
  const group = readU16(value, off, littleEndian);
  const element = readU16(value, off + 2, littleEndian);

  if (group === FFFE_GROUP) {
    // Item and delimitation markers have no VR under any transfer syntax, and a
    // defined-length Item's body is itself an element stream - so the walk just
    // steps over the 8-byte marker and continues into it. The exact-tiling test
    // still has to come out even, which is what bounds the run.
    return { next: off + 8, tag: undefined };
  }
  // (0000,0000) is not a Data Element any encoder writes into a Value Field; it
  // is what a run of NUL padding decodes as, and admitting it would let padding
  // tile.
  if (group === 0 && element === 0) return undefined;

  const tag = joinTag(group, element);

  if (encoding === "implicit") {
    const length = readU32(value, off + 4, littleEndian);
    if (length === UNDEFINED_LENGTH || length % 2 !== 0) return undefined;
    const next = off + 8 + length;
    return next > value.length ? undefined : { next, tag };
  }

  const vr = value.toString("latin1", off + 4, off + 6);
  if (!KNOWN_VRS.has(vr)) return undefined;
  if (LONG_FORM_VRS.has(vr as VR)) {
    if (off + 12 > value.length) return undefined;
    // PS3.5 Table 7.1-2: the two bytes after a long-form VR are reserved and
    // shall be 0000H.
    if (value[off + 6] !== 0x00 || value[off + 7] !== 0x00) return undefined;
    const length = readU32(value, off + 8, littleEndian);
    if (length === UNDEFINED_LENGTH || length % 2 !== 0) return undefined;
    const next = off + 12 + length;
    return next > value.length ? undefined : { next, tag };
  }
  const length = readU16(value, off + 6, littleEndian);
  if (length % 2 !== 0) return undefined;
  const next = off + 8 + length;
  return next > value.length ? undefined : { next, tag };
}

/**
 * `true` when this carrier's value is worth scanning at all.
 *
 * Two disjoint cases, and the second is not an afterthought:
 *
 *  - a **string VR** ({@link SCANNABLE_CARRIER_VRS}), where a Data Element
 *    header's bytes are provably outside the value's Default Character
 *    Repertoire; and
 *  - a VR that is **not one of the 34 PS3.5 §6.2 defines at all**. Under an
 *    Explicit VR syntax the VR field is two bytes the sender chose, and this
 *    parser trusts them (Postel's Law on the read path, `DICOM_VR_MISMATCH` for
 *    a standard tag). An element *under*-declaring its length desynchronizes the
 *    reader, and the fabricated element that follows routinely carries two bytes
 *    of somebody's value in the VR field. Such an element is not a Data Element,
 *    has no repertoire to violate, and has no legitimate content to protect - so
 *    the repertoire conjunct is waived for it and the tiling test stands alone.
 */
function isScannableCarrier(vr: VR): boolean {
  return SCANNABLE_CARRIER_VRS.has(vr) || !KNOWN_VRS.has(vr);
}

/**
 * True when `region` holds a byte the carrier VR's repertoire cannot contain.
 * Vacuously true for a VR PS3.5 does not define - see {@link isScannableCarrier}.
 */
function hasByteOutsideRepertoire(region: Buffer, carrierVr: VR): boolean {
  if (!KNOWN_VRS.has(carrierVr)) return true;
  const tolerant = CONTROL_TOLERANT_VRS.has(carrierVr);
  for (const byte of region) {
    if (byte >= 0x20 && byte !== 0x7f) continue;
    if (tolerant && ALLOWED_CONTROL_BYTES.has(byte)) continue;
    return true;
  }
  return false;
}

/**
 * The tags of a complete Data Element run embedded at the end of `value`, or
 * `undefined` when the value shows no such run.
 *
 * `isActionable` is supplied by the caller so the test is the run's own resolved
 * Annex E action - the same authority the Basic Profile and every active Retain
 * Option resolve through - rather than a second, drifting copy of it.
 *
 * @param value        The carrier element's Value Field bytes.
 * @param carrierVr    The carrier's VR; decides the repertoire test.
 * @param encoding     The file's on-wire element encoding.
 * @param isActionable `true` for a tag this de-identification run would act on.
 *
 * @example
 * ```ts
 * const hidden = findEmbeddedAttributes(el.rawBytes, "CS", "explicitLE", (t) => t === "00100020");
 * if (hidden !== undefined) {
 *   // el's value ends with a whole (0010,0020) Patient ID - do not keep it
 * }
 * ```
 */
export function findEmbeddedAttributes(
  value: Buffer,
  carrierVr: VR,
  encoding: BodyEncoding,
  isActionable: (tag: Tag) => boolean,
): readonly Tag[] | undefined {
  if (!isScannableCarrier(carrierVr)) return undefined;
  if (value.length < MIN_HEADER) return undefined;

  // Scan the trailing window only. Offsets are relative to `window`; a run that
  // tiles to the end of `value` and starts inside the window is entirely inside
  // it, which is the shape a swallow has.
  const windowStart = value.length > MAX_SCAN_BYTES ? value.length - MAX_SCAN_BYTES : 0;
  const window = value.subarray(windowStart);
  const n = window.length;

  // One backward pass, each offset decoded once: `tiles[o]` is "a valid run from
  // o ends exactly at n"; `hit[o]` adds "and that run acts on something".
  const half = (n >> 1) + 1;
  const tiles = new Uint8Array(half);
  const hit = new Uint8Array(half);

  for (let off = (n - MIN_HEADER) & ~1; off >= 0; off -= 2) {
    const decoded = decodeAt(window, off, encoding);
    if (decoded === undefined) continue;
    // `decodeAt` always advances by at least the 8-byte header, so the walk
    // strictly increases and the memo below is always already computed.
    const atEnd = decoded.next === n;
    const onward = decoded.next < n ? tiles[decoded.next >> 1] === 1 : false;
    if (!atEnd && !onward) continue;
    tiles[off >> 1] = 1;
    const actionable = decoded.tag !== undefined && isActionable(decoded.tag);
    const onwardHit = decoded.next < n ? hit[decoded.next >> 1] === 1 : false;
    if (actionable || onwardHit) hit[off >> 1] = 1;
  }

  for (let off = 0; off + MIN_HEADER <= n; off += 2) {
    if (hit[off >> 1] !== 1) continue;
    if (!hasByteOutsideRepertoire(window.subarray(off), carrierVr)) continue;
    const tags: Tag[] = [];
    let pos = off;
    while (pos < n) {
      const decoded = decodeAt(window, pos, encoding);
      /* v8 ignore next -- unreachable: `hit` proves every step of this run decodes. */
      if (decoded === undefined) break;
      if (decoded.tag !== undefined) tags.push(decoded.tag);
      pos = decoded.next;
    }
    return tags;
  }
  return undefined;
}

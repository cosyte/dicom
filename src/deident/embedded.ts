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
 *    of this VR". PS3.5 §6.1.3 and Table 6.1-1 permit exactly **five** C0
 *    control characters anywhere in DICOM text (TAB, LF, FF, CR, ESC), and
 *    **Table 6.2-1 decides which of the five each VR may actually hold** - the
 *    per-VR statement is the governing one and the three tiers are transcribed
 *    in {@link CONTROL_TOLERANT_VRS} / {@link ESC_ONLY_VRS}. A Data Element
 *    header carries tag and length bytes that are overwhelmingly outside that.
 *    Without this conjunct a long uppercase `LO` value could in principle tile;
 *    with it, a false positive additionally requires the carrier to already be
 *    non-conformant.
 *
 * **Carriers are string VRs only** ({@link SCANNABLE_CARRIER_VRS}), which is
 * where the third conjunct has meaning. A swallow into `OB`, `OW`, `UN`, `US`
 * or any other binary VR is undetectable by content - arbitrary bytes are
 * exactly what those VRs are for - and **it leaks exactly as it did before this
 * module existed**: the identifier reaches de-identified output, with no warning
 * and no report entry. That is a live, disclosed residual with no remedy here,
 * not something quietly covered, and it is pinned by a test rather than left to
 * this paragraph. Measured on the grid at `35adc2d`: **11 cells**, at `delta=18`
 * on `OB`/`OW`/`US`/`UN`, with the `LO`/`ST` controls on the identical fixture
 * at 0. The obvious remedy - drop the third conjunct for binary VRs and scan on
 * the other two - was measured too, and it takes those 11 to 0 while emptying
 * **all 5** of the grid's conformant binary tiling controls: a de-identifier
 * deleting a legal `OB`/`UN` value because 8 of its bytes happened to read as a
 * zero-length `(0010,0020)`. That is a product call, not a bug fix.
 *
 * An element whose **on-wire VR is not one of the 34** is a different matter and
 * is no longer this module's problem: `deidentify()` empties it before the scan
 * is reached (`hasUndefinedVr` in `./deidentify.ts`). It used to be a second
 * scannable-carrier case here with the repertoire conjunct waived, which left
 * one whose bytes did not tile still kept - 8 grid cells, measured. `SQ` is out
 * of scope for the same style of reason: a sequence
 * the parser declined to descend keeps its item stream as opaque bytes, which is
 * a different defect with a different remedy
 * (`DICOM-DEIDENT-RAWBYTES-PASSTHROUGH`), and folding it in would make this
 * module answer a question it has not measured.
 *
 * ## Cost
 *
 * Linear in the value's length, and the second loop is where that was **not**
 * true for one round. `tiles[]`/`hit[]` are computed by a single backward pass
 * over even offsets, each doing one constant-time header decode. The forward
 * loop then does **at most one** repertoire scan, because the repertoire test is
 * monotone in the offset: the region it examines is `window.subarray(off)`, so a
 * later candidate's region is a *subset* of an earlier one's, and if the lowest
 * candidate shows no violating byte no later one can either. Continuing past
 * that point instead of returning would re-scan the tail once per candidate -
 * and `(FFFE,xxxx)` bytes make **every** even offset a candidate, which is a
 * quadratic value an attacker composes in a few hundred bytes. That is the same
 * CPU-DoS class the sibling sequence slice was refused on twice, and it is the
 * reason `findEmbeddedAttributes` returns rather than continues.
 *
 * Values longer than {@link MAX_SCAN_BYTES} are scanned over their trailing
 * window only; a swallow lives at the tail by construction, and the bound is
 * what keeps the memo arrays from following an attacker-chosen length. Note the
 * cap is **per element**, so it bounds one call and not a whole file - the
 * linearity above is what actually keeps a file affordable.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import { joinTag } from "../dataset/tag.js";
import type { Tag, VR } from "../dictionary/types.js";
import { KNOWN_VRS } from "../parser/endian.js";
import { LONG_FORM_VRS } from "../parser/element-header.js";
import type { BodyEncoding } from "../serialize/element.js";

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
 * The five C0 control characters PS3.5 §6.1.3 and Table 6.1-1 permit anywhere in
 * DICOM text: "only a subset of five Control Characters from the C0 set shall be
 * used in DICOM for the encoding of Control Characters in text strings".
 *
 * That clause bounds the whole standard. **Which of the five a given VR may
 * hold is decided per VR by Table 6.2-1**, and the two tiers below transcribe
 * it. Getting that split wrong is unsafe in both directions - too tolerant lets
 * a header byte pass as legitimate content, too strict makes a conformant value
 * look like evidence of a swallow - so it is written out rather than
 * approximated by a single set.
 */
const ALLOWED_CONTROL_BYTES: ReadonlySet<number> = new Set<number>([
  0x09, // TAB
  0x0a, // LF
  0x0c, // FF
  0x0d, // CR
  0x1b, // ESC
]);

/**
 * The three VRs Table 6.2-1 lets carry all five. Verbatim, for `LT`, `ST` and
 * `UT` alike: "It may contain the Graphic Character set and the Control
 * Characters, TAB, CR, LF, FF, and ESC."
 *
 * `UC` is deliberately **not** here, and that is the correction worth keeping:
 * its own row reads "The string shall not have Control Characters except for
 * ESC", so admitting TAB/CR/LF/FF for it would be fail-open on a text VR.
 */
const CONTROL_TOLERANT_VRS: ReadonlySet<VR> = new Set<VR>(["LT", "ST", "UT"]);

/**
 * The VRs Table 6.2-1 permits `ESC` in and nothing else - `LO`, `SH`, `UC` and
 * `PN` each say "shall not have Control Characters except ESC", `PN`'s row
 * adding "when used for escape sequences". `ESC` is how ISO 2022 code extension
 * is invoked under `(0008,0005)`, so a conformant Japanese or Korean patient
 * name legitimately contains it: treating it as evidence of a swallow would put
 * a false positive on precisely the attributes that carry names.
 *
 * Every remaining VR in {@link SCANNABLE_CARRIER_VRS} admits no control
 * character at all (`AE`'s row: "and all control characters"; `CS`, `DA`, `DS`,
 * `DT`, `IS`, `TM`, `UI`, `AS`, `UR` are restricted to narrow graphic subsets).
 */
const ESC_ONLY_VRS: ReadonlySet<VR> = new Set<VR>(["LO", "SH", "UC", "PN"]);

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
 * `true` when this carrier's value is worth scanning at all: a **string VR**
 * ({@link SCANNABLE_CARRIER_VRS}), where a Data Element header's bytes are
 * provably outside the value's Default Character Repertoire.
 *
 * **A carrier whose VR is not one of the 34 PS3.5 §6.2 defines used to be a
 * second case here, with the repertoire conjunct waived. It is not, any more,
 * and the guard did not shrink** - it moved somewhere strictly stronger.
 * `deidentify()` now empties such an element outright (`hasUndefinedVr` in
 * `./deidentify.ts`, `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`), because a VR
 * that is not a VR means these bytes were never decoded as a Value Field at all
 * - PS3.5 §6.2 requires every undefined VR to be long-form, and this parser
 * reads it short-form. That answer needs no tiling run to be true, so
 * conditioning it on one only meant an undefined-VR element whose bytes happened
 * *not* to tile was kept. Measured, that was 8 grid cells writing a source
 * Patient ID into de-identified output. Everything this branch caught, the new
 * rule catches first; it never reaches here.
 */
function isScannableCarrier(vr: VR): boolean {
  return SCANNABLE_CARRIER_VRS.has(vr);
}

/** True when `region` holds a byte the carrier VR's repertoire cannot contain. */
function hasByteOutsideRepertoire(region: Buffer, carrierVr: VR): boolean {
  const allFive = CONTROL_TOLERANT_VRS.has(carrierVr);
  const escOnly = ESC_ONLY_VRS.has(carrierVr);
  for (const byte of region) {
    // 0x7F (DELETE) is neither a graphic character nor one of the five C0
    // controls Table 6.1-1 admits, so it is out of every VR's repertoire.
    if (byte >= 0x20 && byte !== 0x7f) continue;
    if (allFive && ALLOWED_CONTROL_BYTES.has(byte)) continue;
    if (escOnly && byte === 0x1b) continue;
    return true;
  }
  return false;
}

/**
 * `true` when a published table can vouch for this tag, which is the second
 * conjunct of {@link EmbeddedRun.hidden}'s bound.
 *
 * **An EVEN group is the test, and it is not a proxy for "in the dictionary".**
 * `isActionable` is the caller's resolved Annex E action, and that action is
 * `true` for **any** odd-group tag, because the Basic Profile removes private
 * attributes as a class rather than by naming them. So `isActionable` alone
 * admits a fabricated odd-group header - measured, and the shape that made this
 * bound necessary rather than merely tidy. For an **even** group the action
 * table has to name the tag (or a repeating-group mask has to), so
 * `isActionable && even` is exactly "PS3.15 Table E.1-1 as this run resolved
 * it", a published, closed set whose members carry nothing about the file.
 *
 * The cost, stated: a genuinely swallowed **private** attribute is no longer
 * named here. It is still emptied - the carrier is emptied whole - and the
 * warning still counts it. What is given up is its tag on the report, which is
 * the same trade `privateTagNoCreator` makes and for the identical reason: an
 * odd group is the one class of tag this package has no closed table to check.
 */
function isTableBound(tag: Tag): boolean {
  return parseInt(tag.slice(0, 4), 16) % 2 === 0;
}

/** What a scan found: the run's size, and only the tags the run acted on. */
export interface EmbeddedRun {
  /**
   * The tags in the run that `isActionable` answered `true` for, in wire order.
   *
   * **🛑 THE NON-ACTIONABLE TAGS OF THE RUN ARE NOT HERE AND MUST NOT COME
   * BACK.** Every tag in this run was composed from four bytes sitting *inside*
   * another element's value - that is the position this module exists to
   * distrust - so a run needing only ONE actionable attribute to be reported
   * dragged its neighbours' four-byte windows onto the report with it. Measured
   * through `0.0.13`: a `CS` carrier over-declaring across a fabricated
   * `"SMIT"` header beside a genuine `(0010,0020)` reported
   * `hidden: ["4D535449", "00100020"]`, and `4D535449` is four letters of the
   * surname in wire order.
   *
   * The bound is a **membership** test rather than a shape test - the posture
   * `renderVr` and `Element.privateCreator` already take in this package - and
   * it has **two** conjuncts, because one was measured insufficient. A tag
   * reaches this array only if `isActionable` fired on it **and**
   * {@link isTableBound} holds: `isActionable` alone answers `true` for every
   * odd-group tag, since the Basic Profile removes private attributes as a
   * class, so the `"SMIT"` header above survived the first draft of this filter.
   * With both, a surviving entry is an entry in PS3.15 Table E.1-1 as this run
   * resolved it: a published, closed table whose members carry nothing about the
   * file. A fabricated window still reaches this array if it happens to spell
   * one of those tags, and that is the same trade `renderVr` makes with the 34
   * VRs - it discloses a table entry, not a document byte.
   *
   * **It may be empty while the run is real** - a run whose only actionable
   * members are private attributes names none of them - and **it is still
   * uncapped**, like every other consumer-controlled diagnostic this module has
   * not yet reached. The filter narrows what an entry can be, not how many there
   * are.
   */
  readonly hidden: readonly Tag[];
  /**
   * How many whole Data Elements the run holds, actionable or not, excluding
   * `(FFFE,xxxx)` markers. It is a count this scan made, not a field a sender
   * wrote, and it is what `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED` reports as
   * `{n}` - which is why narrowing `hidden` did not change that message.
   */
  readonly elementCount: number;
}

/**
 * A complete Data Element run embedded at the end of `value`, or `undefined`
 * when the value shows no such run.
 *
 * `isActionable` is supplied by the caller so the test is the run's own resolved
 * Annex E action - the same authority the Basic Profile and every active Retain
 * Option resolve through - rather than a second, drifting copy of it. It decides
 * two separate things: whether the run is reportable at all, and (since
 * `DICOM-DIAGNOSTIC-PHI-RESIDUALS`) which of the run's tags reach
 * {@link EmbeddedRun.hidden}.
 *
 * @param value        The carrier element's Value Field bytes.
 * @param carrierVr    The carrier's VR; decides the repertoire test.
 * @param encoding     The file's on-wire element encoding.
 * @param isActionable `true` for a tag this de-identification run would act on.
 *
 * @example
 * ```ts
 * const run = findEmbeddedAttributes(el.rawBytes, "CS", "explicitLE", (t) => t === "00100020");
 * if (run !== undefined) {
 *   // el's value ends with a whole (0010,0020) Patient ID - do not keep it
 * }
 * ```
 */
export function findEmbeddedAttributes(
  value: Buffer,
  carrierVr: VR,
  encoding: BodyEncoding,
  isActionable: (tag: Tag) => boolean,
): EmbeddedRun | undefined {
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
    // At most one repertoire scan per call, and `return` rather than `continue`
    // is what makes that true. The region examined is `window.subarray(off)`, so
    // every later candidate's region is a subset of this one's: if the lowest
    // candidate holds no byte outside the repertoire, none of the later ones can
    // either. Continuing would re-scan the tail once per candidate, and a value
    // whose every even offset is a candidate - trivially built out of
    // `(FFFE,xxxx)` marker bytes - would then cost O(n^2) on the de-identify
    // path. Same CPU-DoS class the sibling sequence slice was refused on twice.
    if (!hasByteOutsideRepertoire(window.subarray(off), carrierVr)) return undefined;
    const hidden: Tag[] = [];
    let elementCount = 0;
    let pos = off;
    while (pos < n) {
      const decoded = decodeAt(window, pos, encoding);
      /* v8 ignore next -- unreachable: `hit` proves every step of this run decodes. */
      if (decoded === undefined) break;
      if (decoded.tag !== undefined) {
        elementCount += 1;
        // The filter, and the whole of this field's PHI bound. See
        // `EmbeddedRun.hidden` for why it has two conjuncts and why neither is
        // optional.
        if (isActionable(decoded.tag) && isTableBound(decoded.tag)) hidden.push(decoded.tag);
      }
      pos = decoded.next;
    }
    return { hidden, elementCount };
  }
  return undefined;
}

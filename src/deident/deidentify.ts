/**
 * `deidentify` - PS3.15 Annex E metadata-level de-identification.
 *
 * Applies the **Basic Application Level Confidentiality Profile** plus any of the
 * nine *metadata-affecting* Annex E Options, driven by the generated Table E.1-1
 * action map ({@link annexE}). It is a **pure** function: the input {@link Dataset}
 * is never mutated; a fresh `Dataset` (with a rebuilt element map and File Meta)
 * is returned alongside a {@link DeidentifyReport} whose two non-value-free
 * fields are named on that type: `uidMap` and `removedPrivateTags`.
 *
 * **What it does**
 * - Resolves each attribute's action (basic profile, overridden by an active
 *   Retain/Clean Option), collapsing conditional codes to their leftmost branch
 *   (see {@link resolveAction}), and applies it: `X` remove, `Z` zero-length, `D`
 *   VR-consistent dummy (falling back to `Z` where no safe dummy exists), `C`
 *   conservative blank, `U` deterministic consistent-UID remap, `K` keep.
 * - Resolves the three Table E.1-1 rows the standard states as a repeating-group
 *   mask (`(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data, `(60xx,4000)`
 *   Overlay Comments) across the groups PS3.5 §7.6 bounds them to, on an
 *   exact-tag miss. A match is removed *and* reported, with
 *   `DeidentifiedAttribute.repeatingGroup` naming the mask.
 * - Recurses into kept sequences and **re-encodes** them so nested PHI is removed
 *   in the *serialized* bytes too - not just the object model (the Phase 5 writer
 *   blits `SQ` spans verbatim, so a rebuilt `items` array alone would not survive
 *   serialization). Rebuilt sequences are normalized to defined length.
 * - Removes all private attributes by default; with `RetainSafePrivate` + a
 *   {@link Profile}, keeps the private data elements the profile's overlay names
 *   as safe (and the private-creator elements the profile recognizes).
 * - Remaps `(0002,0003)` Media Storage SOP Instance UID consistently (unless
 *   `RetainUIDs`), writes `(0012,0062)` Patient Identity Removed = `YES`, **adds**
 *   its method text to `(0012,0063)` De-identification Method rather than
 *   replacing what the file already recorded there (PS3.15 E.1.1 - see
 *   `addDeidentificationMethod`), and warns
 *   (`DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`) when Pixel Data is present and not
 *   marked free of burned-in annotation - this metadata-only pass cannot clean
 *   pixels (deferred to `@cosyte/dicom-pixel`).
 *
 * **Known limitations** (documented, fail-safe toward *more* removal):
 * - No IOD Type-1 conformance analysis, so conditional codes always take the
 *   most-protective leftmost branch - a Type-1 attribute that strictly needed a
 *   dummy is instead removed/emptied.
 * - `C` (clean) is a conservative blank, not a meaning-preserving structured
 *   replacement (which needs domain context the metadata layer lacks).
 * - Pixel-level options (`CleanPixelData`, `CleanRecognizableVisual`) are out of
 *   scope; burned-in text is warned, never cleaned.
 * - A private data element kept under `RetainSafePrivate` is kept *verbatim* - if
 *   it is itself a sequence carrying standard PHI attributes, that nested content
 *   is not recursed. The profile vouches the element is safe; nest accordingly.
 * - A **standard** (non-private) `SQ` whose `items` the parser did not
 *   materialize is **emptied**, not kept:
 *   its value is by PS3.5 §7.5.1 a stream of Data Sets, and a run that cannot
 *   enumerate them cannot discharge §E.1.1's obligation inside them, so the
 *   fail-safe answer is to drop the carrier and say so
 *   (`DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` + `report.unauditableSequences`).
 *   That costs content, and the trade is deliberate: it used to be *kept
 *   verbatim*, which wrote the sender's own un-audited Data Elements - measured,
 *   `(0010,0020)` Patient IDs among them - into output stamped
 *   `(0012,0062) PatientIdentityRemoved = YES`
 *   (`DICOM-DEIDENT-RAWBYTES-PASSTHROUGH`, live through `0.0.6`).
 * - Two things are still kept verbatim, deliberately. A **private** `SQ`
 *   retained under `RetainSafePrivate` + a {@link Profile}, where the profile has
 *   vouched for the element by creator and tag - the pre-existing "kept
 *   verbatim" limitation above, unchanged. And an undefined-length **`UN`** whose
 *   CP-246 descent was refused: it keeps `vr === "UN"`, and since every ordinary
 *   `UN` element also has no items, the test above cannot be applied there
 *   without emptying every unknown-VR element in every file. That one is
 *   measured and **still leaks** (`PRE-EXISTING`); the reliable consumer-side
 *   test remains `el.items === undefined` on a `UN` element you are trusting a
 *   report about.
 * - An element whose **on-wire VR is not one of the 34** PS3.5 §6.2 defines is
 *   **emptied**, not kept (`DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` +
 *   `report.undefinedVrElements`). Such an element is what an *under*-declared
 *   Value Length upstream produces: the reader desynchronizes, reads leftover
 *   value bytes as a Data Element header, and the element that genuinely
 *   followed becomes its "value" - measured carrying a `(0010,0020)` Patient ID
 *   in full. §6.2 requires every undefined VR to be long-form, and this parser
 *   reads it short-form, so those bytes are not a Value Field this library
 *   decoded under any VR. See {@link hasUndefinedVr}. **Unlike the `SQ` rule
 *   above this one has no carve-out** - it sits in `keepOrEmpty`, the only path
 *   that keeps a value verbatim, so `RetainSafePrivate` does not exempt it.
 * - **Still leaking, measured, and its own decision:** the over-declare swallow
 *   into a **binary** carrier (`OB`/`OW`/`US`/`UN`), 11 grid cells at
 *   `35adc2d`. No content test can decide it - arbitrary bytes are what those
 *   VRs are for - and the one candidate remedy empties conformant binary values.
 *   See `./embedded.ts`.
 * - `RetainSafePrivate` **retains nothing inside a Sequence Item whose Data Set
 *   boundary the file contradicts** - an item stream that ran past its
 *   sequence's own declared Value Length. Which elements are in the Item is then
 *   not determined by the file, and PS3.5 §7.8.1 scopes a private block
 *   reservation to exactly that boundary, so PS3.15 §E.3.10's "known ... to be
 *   safe" cannot be established and its "all other Private Attributes shall be
 *   removed **or processed in the element-specific manner recommended by
 *   Deidentification Action (0008,0307), if present within Private Data Element
 *   Characteristics Sequence (0008,0300)**" applies - a two-branch clause, of
 *   which removal is the branch available here (`(0008,0307)` is not
 *   implemented). Every private element the recursion **reaches** in such an
 *   Item, at any depth below it, is removed and named in
 *   `report.removedPrivateTags`. **There is one carve-out, and it is the same one
 *   `#54` was refused for asserting away**: `keepsPrivate` decides *before* the
 *   descent, so a **private `SQ`** the profile vouches for is kept **verbatim**,
 *   its items are never walked, and this rule is never consulted inside it -
 *   measured, and it still leaks a private value absorbed from the root
 *   (`PRE-EXISTING`, identical on `164eb39`, its own item). That costs content
 *   on a malformed file and nothing at all on a conformant one; without it a
 *   private value the sender wrote **outside** the sequence was retained on the
 *   Item's reservation and written into output stamped `PatientIdentityRemoved =
 *   YES` with `removedPrivateTags: []` (`DICOM-PRIVATE-CREATOR-RESERVATION-LEAK`,
 *   measured on the published `0.0.8` tarball and fixed on `0.0.10`; there is no `0.0.9` on
 *   the registry). See {@link itemStreamOverrunsSequence}.
 * - `RetainSafePrivate` **retains nothing that a Data Set holds after a sequence
 *   whose own contents contradict the extent it declared** - the mirror
 *   direction, where an Item that *under*-declares **ejects** its trailing
 *   elements out and a Private Creator landing in the enclosing Data Set reserves
 *   a block for elements the sender never put beside it. The same false
 *   attestation, and it applies **in every Data Set, not just the root**: an
 *   inner sequence ejecting a creator into the still-usable Item that encloses it
 *   is measured and pinned. The cut is positional, so a reservation the sender
 *   wrote **ahead of** the offending sequence is untouched. Every private element
 *   after that point is removed and named in `report.removedPrivateTags`, and the
 *   **private-`SQ` carve-out above still applies**: a private `SQ` inside the
 *   settled run that the profile vouches for is kept verbatim and never walked.
 *   See {@link settledBound}.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { annexE, type AnnexEAction, type AnnexEActionCode } from "../dictionary/annex-e.js";
import type { Tag, VR } from "../dictionary/types.js";
import { KNOWN_VRS } from "../parser/endian.js";
import { Dataset, type DatasetInit } from "../dataset/dataset.js";
import { Element, type ElementInit } from "../dataset/element.js";
import type { FileMeta } from "../dataset/file-meta.js";
import { Item } from "../dataset/item.js";
import { isPrivateTag, splitTag } from "../dataset/tag.js";
import type { Profile } from "../parser/types.js";
import type { DicomParseWarning } from "../parser/warnings.js";
import {
  burnedInAnnotationNotRemoved,
  deidentMethodNotAdded,
  embeddedAttributeRemoved,
  sequenceNotAuditable,
  undefinedVrNotAuditable,
} from "../parser/warnings.js";
import { resolvePrivateTag } from "../profiles/lookup.js";
import { type BodyEncoding, encodeDatasetElement } from "../serialize/element.js";
import { dummyBytes, remapUidBytes, resolveAction, uidValueMultiplicity } from "./actions.js";
import { findEmbeddedAttributes } from "./embedded.js";
import {
  DEIDENTIFY_OPTIONS,
  DeidentifyError,
  type AppliedAction,
  type DeidentifiedAttribute,
  type DeidentifyOption,
  type DeidentifyOptions,
  type DeidentifyReport,
  type DeidentifyResult,
  type EmbeddedAttributeFinding,
  type UnauditableSequenceFinding,
  type UndefinedVrFinding,
} from "./types.js";
import { makeUidRemapper, type UidRemapper } from "./uid.js";

const TAG_PATIENT_IDENTITY_REMOVED: Tag = "00120062";
const TAG_DEIDENTIFICATION_METHOD: Tag = "00120063";
const TAG_PIXEL_DATA: Tag = "7FE00010";
const TAG_BURNED_IN_ANNOTATION: Tag = "00280301";

/** Map a transfer syntax UID to the on-wire element encoding (mirrors the writer). */
const BODY_ENCODING: Readonly<Record<string, BodyEncoding>> = {
  "1.2.840.10008.1.2": "implicit",
  "1.2.840.10008.1.2.1": "explicitLE",
  "1.2.840.10008.1.2.2": "explicitBE",
  "1.2.840.10008.1.2.1.99": "explicitLE",
};

/**
 * Cap on how many un-auditable sequences one run will *describe*
 * ({@link DeidentifyReport.unauditableSequences} and the matching warnings).
 *
 * `#48` bound every consumer-controlled diagnostic in this package for a reason:
 * a finding emitted per element is amplified by an element count the input
 * chooses, and a 1 MiB crafted file can carry tens of thousands of un-auditable
 * elements. It is a bound on the **record**, never on the action - every
 * un-auditable sequence is emptied whether or not it is listed.
 *
 * A report whose array is exactly this long means "at least this many"; treat it
 * as truncated.
 */
export const MAX_UNAUDITABLE_SEQUENCE_FINDINGS = 64;

/**
 * Cap on how many undefined-VR elements one run will *describe*
 * ({@link DeidentifyReport.undefinedVrElements} and the matching warnings).
 *
 * The amplification here is worse than its sibling's, not better: an element
 * whose VR is not one of the 34 is read short-form, so the cheapest one an input
 * can encode is an **8-byte** header with a zero-length value. A 1 MiB file is
 * therefore 131,072 of them, and an uncapped record would answer with 131,072
 * findings and 131,072 warning strings.
 *
 * It is a bound on the **record**, never on the action - every such element is
 * emptied whether or not it is listed. A report whose array is exactly this long
 * means "at least this many"; treat it as truncated.
 */
export const MAX_UNDEFINED_VR_FINDINGS = 64;

interface DeidentifyContext {
  readonly active: ReadonlySet<DeidentifyOption>;
  readonly remap: UidRemapper;
  readonly profile: Profile | undefined;
  readonly encoding: BodyEncoding;
  readonly littleEndian: boolean;
  /**
   * Run-scoped diagnostic budget. **Deliberately mutable**, and deliberately on
   * the context rather than on a `ProcessResult`: `processElements` builds a
   * fresh result per Data Set and merges them upward, so a per-result cap would
   * bound each item independently and not the run - which is exactly the
   * amplification the cap exists to stop.
   */
  readonly budget: { unauditableSequences: number; undefinedVrElements: number };
}

/** Validate caller-supplied options; throws {@link DeidentifyError} on misconfig. */
function validateRetain(
  retain: readonly DeidentifyOption[] | undefined,
): ReadonlySet<DeidentifyOption> {
  const valid = new Set<string>(DEIDENTIFY_OPTIONS);
  const active = new Set<DeidentifyOption>();
  for (const opt of retain ?? []) {
    if (!valid.has(opt)) {
      throw new DeidentifyError(
        `Unknown de-identify option "${String(opt)}"; expected one of ${DEIDENTIFY_OPTIONS.join(", ")}.`,
        "INVALID_OPTIONS",
      );
    }
    active.add(opt);
  }
  return active;
}

/**
 * The action code in effect for an attribute: the first active Option (in the
 * canonical {@link DEIDENTIFY_OPTIONS} order) that overrides it wins; otherwise
 * the Basic Profile action.
 */
function effectiveCode(
  action: AnnexEAction,
  active: ReadonlySet<DeidentifyOption>,
): AnnexEActionCode {
  for (const opt of DEIDENTIFY_OPTIONS) {
    if (active.has(opt)) {
      const override = action.optionSet[opt];
      if (override !== undefined) return override;
    }
  }
  return action.basicProfile;
}

/** Build a fresh value-only scalar {@link Element}, preserving structural fields. */
function freshScalar(orig: Element, value: Buffer, vm: number): Element {
  const init: ElementInit = {
    tag: orig.tag,
    vr: orig.vr,
    vm,
    length: value.length,
    rawBytes: value,
    byteOffset: orig.byteOffset,
    littleEndian: orig.littleEndian,
    ...(orig.privateCreator !== undefined ? { privateCreator: orig.privateCreator } : {}),
    ...(orig.specificCharacterSet !== undefined
      ? { specificCharacterSet: orig.specificCharacterSet }
      : {}),
  };
  return new Element(init);
}

/** Build a brand-new scalar {@link Element} for an inserted de-identification tag. */
function insertedScalar(tag: Tag, vr: VR, value: Buffer, littleEndian: boolean): Element {
  return new Element({
    tag,
    vr,
    vm: 1,
    length: value.length,
    rawBytes: value,
    byteOffset: 0,
    littleEndian,
  });
}

function le16(buf: Buffer, n: number, off: number, littleEndian: boolean): void {
  if (littleEndian) buf.writeUInt16LE(n, off);
  else buf.writeUInt16BE(n, off);
}

function le32(buf: Buffer, n: number, off: number, littleEndian: boolean): void {
  if (littleEndian) buf.writeUInt32LE(n, off);
  else buf.writeUInt32BE(n, off);
}

/** Encode one item's body (its elements, less retired group lengths) under `encoding`. */
function encodeItemBody(item: Item, encoding: BodyEncoding): Buffer {
  const parts: Buffer[] = [];
  for (const el of item.elements()) {
    if (splitTag(el.tag).element === 0x0000) continue;
    parts.push(encodeDatasetElement(el, encoding));
  }
  return Buffer.concat(parts);
}

/** Encode a sequence's value as defined-length items (FFFE,E000 + length + body). */
function encodeSequenceValue(items: readonly Item[], encoding: BodyEncoding): Buffer {
  const littleEndian = encoding !== "explicitBE";
  const parts: Buffer[] = [];
  for (const item of items) {
    const body = encodeItemBody(item, encoding);
    const header = Buffer.alloc(8);
    le16(header, 0xfffe, 0, littleEndian);
    le16(header, 0xe000, 2, littleEndian);
    le32(header, body.length, 4, littleEndian);
    parts.push(header, body);
  }
  return Buffer.concat(parts);
}

/**
 * Rebuild an `SQ` {@link Element} from cleaned `items`, re-encoding `rawBytes` to
 * the representation the Phase 5 writer expects: value-only for Implicit VR LE
 * (defined length), full on-wire span for Explicit VR. Always defined length.
 */
function rebuildSequence(orig: Element, items: readonly Item[], encoding: BodyEncoding): Element {
  const value = encodeSequenceValue(items, encoding);
  let rawBytes: Buffer;
  if (encoding === "implicit") {
    rawBytes = value;
  } else {
    const littleEndian = encoding === "explicitLE";
    const { group, element } = splitTag(orig.tag);
    const header = Buffer.alloc(12);
    le16(header, group, 0, littleEndian);
    le16(header, element, 2, littleEndian);
    header.write("SQ", 4, "ascii");
    le32(header, value.length, 8, littleEndian);
    rawBytes = Buffer.concat([header, value]);
  }
  const init: ElementInit = {
    tag: orig.tag,
    vr: "SQ",
    vm: items.length,
    length: value.length,
    rawBytes,
    byteOffset: orig.byteOffset,
    littleEndian: encoding !== "explicitBE",
    items,
    ...(orig.privateCreator !== undefined ? { privateCreator: orig.privateCreator } : {}),
    ...(orig.specificCharacterSet !== undefined
      ? { specificCharacterSet: orig.specificCharacterSet }
      : {}),
  };
  return new Element(init);
}

/** Decode a private-creator element's value (an `LO` vendor schema id - not PHI). */
function decodeCreator(el: Element): string {
  return el.rawBytes
    .toString("latin1")
    .replace(/[\0 ]+$/, "")
    .trim();
}

/** True when the (private) tag is a Private Creator data element `(gggg,00EE)`. */
function isPrivateCreatorElement(tag: Tag): boolean {
  const { element } = splitTag(tag);
  return element >= 0x0010 && element <= 0x00ff;
}

interface ProcessResult {
  readonly elements: Map<Tag, Element>;
  readonly attributes: DeidentifiedAttribute[];
  readonly removedPrivateTags: Tag[];
  readonly embeddedAttributes: EmbeddedAttributeFinding[];
  readonly unauditableSequences: UnauditableSequenceFinding[];
  readonly undefinedVrElements: UndefinedVrFinding[];
  readonly warnings: DicomParseWarning[];
}

/**
 * `true` when this run would act on `tag` - the same resolution the Basic
 * Profile and the active Retain Options go through, so the embedded-attribute
 * scan can never disagree with the action table it is protecting.
 *
 * A private tag is always actionable. A private data element found inside
 * another element's value carries no reachable `(gggg,00EE)` reservation, so no
 * profile can vouch for it even with `RetainSafePrivate` active, and the Basic
 * Profile removes private attributes by default.
 */
function actsOnTag(tag: Tag, ctx: DeidentifyContext): boolean {
  if (isPrivateTag(tag)) return true;
  const action = annexE(tag);
  if (action === undefined) return false;
  return resolveAction(effectiveCode(action, ctx.active)) !== "K";
}

/**
 * `true` when `el`'s **on-wire VR is not one of the 34** PS3.5 2026c section 6.2
 * defines, so this library never decoded its bytes as a Value Field at all.
 *
 * Like the `SQ`-with-no-items test below, this reads a field the parser already
 * recorded rather than inspecting the value: a set membership check, O(1), no
 * per-offset loop and no cost that follows an attacker-chosen value length.
 *
 * ## Why an unrecognized VR is not auditable
 *
 * PS3.5 section 6.2 fixes the structure of every VR that does not exist yet:
 * "All new VRs defined in future versions of DICOM shall be of the same Data
 * Element Structure as defined in [section 7.1.2] with reserved bytes after the
 * VR and a 32-bit unsigned integer VL (i.e., following the format for VRs such
 * as OB or UT)". **The parser applies that rule** - see
 * `readExplicitElementHeader` - so the header is read the way the standard
 * defines it and the *span* is no longer in doubt.
 *
 * What is still in doubt is the only thing this rule turns on: **what the bytes
 * mean.** Table E.1-1 acts per attribute, and the de-identifier has no way to
 * know whether a VR published after this edition holds free text, a name, a
 * date, or an opaque blob. Emptying is the fail-safe answer, and it is the same
 * answer the sibling `SQ`-with-no-items rule gives for the same reason.
 *
 * ## Where these come from, and what they carry
 *
 * **Until `DICOM-UNRECOGNIZED-VR-SHORT-FORM` the routine producer was a
 * malformed file, and now it is a conformant one.** The old reader took an
 * unrecognized VR short-form, so an **under**-declared Value Length upstream
 * would leave the remainder of a value to be read as the next Data Element
 * header - tag, VR and length all fragments of somebody's value. Most of those
 * files are now refused outright at parse (measured: every one of the 932 grid
 * cells this reader newly refuses had an unrecognized VR in its old parse tree).
 *
 * The fabricated shape is **not gone**, because bytes that happen to form a
 * complete long-form header still tile: `test/integration/deident-undefined-vr.test.ts`
 * builds one whose four tag bytes are four letters of a surname, which is why
 * the finding and the warning below still name no tag. What is new is the other
 * producer - a **section 6.2 conformant** file carrying a VR from a future
 * edition, which this parser now reads correctly and this rule then empties.
 * That is a real cost and it is the `DICOM-DEIDENT-OVER-REDACTION` trade, not a
 * defect.
 *
 * **There is no account here of what the old reader did with such a file, and
 * that is a decision.** `#55` published "on a file conformant to PS3.5 2026c the
 * cost is zero"; it was never true. Three further attempts were made in the
 * slice that closed `DICOM-UNRECOGNIZED-VR-SHORT-FORM` to say what *was* true in
 * one sentence, and its gate refuted all three. The behaviour is shape-specific
 * and no sentence covers it. `scripts/measure-unrecognized-vr.ts` prints what
 * each named shape does on each tree - **add a shape rather than a sentence.**
 *
 * ## What it deliberately does not cover
 *
 * **`UN` is one of the 34**, so this never fires on an ordinary unknown-VR
 * element: not the Implicit VR fallback for an unpublished tag, not a private
 * element with no reachable creator, and not the CP-246 `UN` whose descent was
 * refused. That last one is still leaking and still needs a parser-set mark; it
 * is not admitted here by relaxing this test, because relaxing it to "unknown to
 * the dictionary" is exactly the sweep that would empty every `UN` in every file.
 *
 * It also cannot fire on **Implicit VR LE at all**: there the VR is resolved
 * from the dictionary, so it is always one of the 34. Implicit VR LE is this
 * rule's control population, not an omission.
 */
function hasUndefinedVr(el: Element): boolean {
  return !KNOWN_VRS.has(el.vr);
}

/**
 * Keep `el`'s value - unless its VR is not a VR, or whole Data Elements are
 * encoded inside it.
 *
 * **This function is the only path in this module that writes a source value
 * into de-identified output unchanged**, which is what makes the two refusals
 * below unconditional rather than a promise: every other outcome (`X` remove,
 * `Z`/`C` empty, `D` dummy, `U` remap, and a private tag the Basic Profile
 * drops) has already replaced the value by the time it would matter. A private
 * element a {@link Profile} vouches for under `RetainSafePrivate` does route
 * here, so it is covered too - which is the carve-out its `SQ` sibling has and
 * this does not.
 *
 * Order matters and is not arbitrary. The undefined-VR test comes first because
 * it is the cheaper and the stronger of the two: it settles the element from a
 * recorded field, whereas `findEmbeddedAttributes` has to walk the value to
 * *prove* it is not what its VR says. Running the scan first would cost a walk
 * to reach the same emptying. See `./embedded.ts` for what that scan does and
 * does not claim; the short version is that an over-declared Value Length
 * swallows the element that follows it into this element's value, where
 * Table E.1-1 cannot see it, and the fail-safe answer is to empty rather
 * than keep.
 */
function keepOrEmpty(
  el: Element,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
): boolean {
  if (hasUndefinedVr(el)) {
    emptyUndefinedVrElement(el, ctx, contextPath, out);
    return false;
  }
  const hidden = findEmbeddedAttributes(el.rawBytes, el.vr, ctx.encoding, (t) => actsOnTag(t, ctx));
  if (hidden === undefined) {
    out.elements.set(el.tag, el);
    return true;
  }
  out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));
  out.embeddedAttributes.push({
    tag: el.tag,
    vr: el.vr,
    hidden,
    ...(contextPath.length > 0 ? { contextPath: [...contextPath] } : {}),
  });
  out.warnings.push(
    embeddedAttributeRemoved({ byteOffset: el.byteOffset }, el.tag, el.vr, hidden.length),
  );
  return false;
}

/**
 * Empty an element whose on-wire VR is not one of the 34, and record why.
 *
 * `freshScalar` rather than `rebuildSequence`: the element is not an `SQ` (`SQ`
 * is one of the 34), so what is written back is a zero-length scalar carrying
 * the same tag. The attribute keeps existing and the report says it was emptied
 * - a report claiming retention over a value that was dropped is the false-audit
 * class this module has been refused for before.
 *
 * See {@link hasUndefinedVr} for why emptying is the only answer available, and
 * {@link MAX_UNDEFINED_VR_FINDINGS} for why the record is capped and the action
 * is not.
 */
function emptyUndefinedVrElement(
  el: Element,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
): void {
  // The ACTION is never capped. Whatever the count, every element whose VR is
  // not a VR is emptied - a bound on how much we are willing to *say* must never
  // become a bound on what we are willing to *remove*.
  out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));

  // The RECORD is capped, against a budget that spans the whole run rather than
  // this one Data Set: `processElements` builds a fresh `ProcessResult` per Data
  // Set and merges upward, so a per-result cap would bound each sequence item
  // independently and not the file.
  if (ctx.budget.undefinedVrElements >= MAX_UNDEFINED_VR_FINDINGS) return;
  ctx.budget.undefinedVrElements += 1;
  // NO TAG on either channel, and this is the one refusal in the module that is
  // about the diagnostic rather than the data. `el.tag` here was composed from
  // four bytes the reader found mid-value, so it is document content, not a
  // structural field - see `UndefinedVrFinding`. The byte offset identifies the
  // element and is a position this parser counted.
  out.undefinedVrElements.push({
    byteOffset: el.byteOffset,
    byteLength: el.rawBytes.length,
    ...(contextPath.length > 0 ? { contextPath: [...contextPath] } : {}),
  });
  out.warnings.push(undefinedVrNotAuditable({ byteOffset: el.byteOffset }, el.rawBytes.length));
}

/**
 * `true` when `el` is an `SQ` the de-identifier **cannot audit**: the parser did
 * not materialize its items, so there is no item stream to walk.
 *
 * This is a fact the parser recorded on the element, not an inference from its
 * bytes. **Exactly one route in this parser reaches it**: a defined-length
 * Implicit VR LE value whose dictionary-resolved `SQ` was not a valid item
 * stream, which raises `DICOM_SQ_NOT_DESCENDED`. Do not promote that to "it is
 * always announced on `Dataset.warnings`" - a {@link Profile} carrying
 * `suppress: ["DICOM_SQ_NOT_DESCENDED"]` leaves `ds.warnings` empty while the
 * element still arrives here, and `Element` is publicly constructible, so this
 * is a statement about the parser and not about every `Dataset`. The
 * de-identify channel reports it either way. `items: []` is a *materialized empty* sequence and
 * is deliberately not this: nothing is hidden in zero items.
 *
 * **An undefined-length `UN` whose CP-246 descent was refused is NOT a route
 * here**, and saying otherwise would be a false assurance about a shape that
 * still writes an identifier into output. It keeps `vr === "UN"`, so the first
 * conjunct is false; and it cannot be admitted by relaxing that conjunct,
 * because every ordinary `UN` element also has `items === undefined` and the
 * relaxed test would empty every unknown-VR element in every file. Telling the
 * two apart needs a mark the parser does not set. Measured, still leaking.
 *
 * Note also what a `true` here does **not** guarantee: `keepsPrivate` runs
 * before this on a private element, so a private `SQ` a {@link Profile} vouches
 * for under `RetainSafePrivate` never reaches this predicate and is kept
 * verbatim. See {@link deidentify}'s module notes.
 */
function isUnauditableSequence(el: Element): boolean {
  return el.vr === "SQ" && el.items === undefined;
}

/**
 * Empty an `SQ` whose item stream this run cannot walk, and record why.
 *
 * ## Why emptying, and not keeping
 *
 * PS3.5 2026c §7.5.1 "Item Encoding Rules": "Each Item Value shall contain a
 * DICOM Data Set composed of Data Elements." An `SQ` element's value is
 * therefore never an opaque blob the way an `OB` value legitimately is - it is
 * Data Elements, and PS3.15 2026c §E.1.1 "De-identifier" obliges an
 * implementation claiming the Basic Application Level Confidentiality Profile to
 * "protect or retain all instances of the Attributes listed in [Table E.1-1],
 * whether contained in the top level Data Set or embedded in an Item of a
 * Sequence of Items". With no items materialized, that obligation cannot be
 * discharged attribute by attribute, so it falls on the carrier. §E.1.1 makes
 * the same escalation itself for a SOP Instance UID inside a Sequence - "the
 * enclosing Attribute in the top-level Data Set must be encrypted in its
 * entirety" - and while that sentence is about the encrypt-and-replace mechanism
 * for SOP Instance UIDs rather than about Table E.1-1 in general, it is the
 * standard's own statement that an unreachable nested instance is answered at
 * the enclosing attribute.
 *
 * ## Why this is not a guess, and costs nothing to compute
 *
 * The sibling defect in `./embedded.ts` has to *prove* a value is not what its
 * VR says, because an over-declaring string element and a well-formed one are
 * byte-identical. Here there is nothing to prove: the parser already refused the
 * reading and said so on `Dataset.warnings`, and this function reads that
 * refusal off the element (`items === undefined`) rather than re-deriving it.
 * So there is **no scan** - no per-offset loop, no cost that grows with an
 * attacker-chosen value length, and none of the quadratic surface a
 * content test would reintroduce. Re-parsing the bytes here to recover the items
 * would be the opposite trade: it is the try-then-fallback shape that has been
 * refused on this family before, and it would let a value the parser could not
 * read decide how long de-identification takes.
 *
 * ## What it costs
 *
 * Content. A sequence the sender encoded in a way this parser could not read is
 * dropped from the de-identified output, and the report and warning say so
 * rather than leaving a caller to diff the bytes. That is the fail-safe
 * direction: the alternative, measured on the grid at `0.0.6`, was writing the
 * sender's own `(0010,0020)` Patient ID into output stamped
 * `(0012,0062) PatientIdentityRemoved = YES` with a clean report.
 */
function emptyUnauditableSequence(
  el: Element,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
): void {
  // The ACTION is never capped. Whatever the count, every un-auditable sequence
  // is emptied - a bound on how much we are willing to *say* must never become a
  // bound on what we are willing to *remove*.
  out.elements.set(el.tag, rebuildSequence(el, [], ctx.encoding));

  // The RECORD is capped, per `#48`'s discipline for consumer-controlled
  // diagnostics, against a budget that spans the whole run rather than this one
  // Data Set. `report.unauditableSequences.length === MAX_UNAUDITABLE_SEQUENCE_
  // FINDINGS` is the signal that more were emptied than are listed.
  if (ctx.budget.unauditableSequences >= MAX_UNAUDITABLE_SEQUENCE_FINDINGS) return;
  ctx.budget.unauditableSequences += 1;
  out.unauditableSequences.push({
    tag: el.tag,
    byteLength: el.rawBytes.length,
    ...(contextPath.length > 0 ? { contextPath: [...contextPath] } : {}),
  });
  out.warnings.push(
    sequenceNotAuditable({ byteOffset: el.byteOffset }, el.tag, el.rawBytes.length),
  );
}

/**
 * Map the private blocks reserved **in one Data Set** to the creators that
 * reserved them, read from that Data Set's own `(gggg,00EE)` elements rather
 * than from `Element.privateCreator`.
 *
 * `Element.privateCreator` is membership-bounded against the profile that was
 * active **at parse time** (`src/parser/tokens.ts`), and a caller may perfectly
 * reasonably parse without a profile and pass one here. Re-deriving the
 * reservation from the elements in front of us makes `RetainSafePrivate` behave
 * identically whether the profile arrived at parse or at de-identification. The
 * decoded string never leaves this map: it is a lookup key, not a value on any
 * surface.
 *
 * **Per Data Set, not per run, and the difference is a PHI defect.** PS3.5 §7.5
 * makes each Sequence Item its own Data Set and §7.8.1 scopes a block
 * reservation to the Data Set the creator appears in, so the same block number
 * means different vendors at the root and inside an item. Resolving an
 * item-scoped private element against the root's reservation retains an element
 * no profile ever vouched for and writes it into the serialized output, and
 * drops one that was correctly reserved inside the item it is used in. Both
 * were reproduced before this was scoped; `processElements` therefore derives
 * this at every depth it recurses to.
 */
function creatorsInScope(source: readonly Element[]): ReadonlyMap<string, string> {
  const byBlock = new Map<string, string>();
  for (const el of source) {
    if (!isPrivateTag(el.tag) || !isPrivateCreatorElement(el.tag)) continue;
    const { group, element } = splitTag(el.tag);
    byBlock.set(`${String(group)}:${String(element & 0xff)}`, decodeCreator(el));
  }
  return byBlock;
}

/** The creator that reserved a private data element's block, per PS3.5 section 7.8. */
function creatorFor(tag: Tag, creators: ReadonlyMap<string, string>): string | undefined {
  const { group, element } = splitTag(tag);
  return creators.get(`${String(group)}:${String((element >> 8) & 0xff)}`);
}

/** PS3.5 2026c section 7.5.2's "undefined length" sentinel for a Value Length field. */
const UNDEFINED_LENGTH = 0xffffffff;

/**
 * On-wire header size of a defined-length `SQ` under Explicit VR: tag (4) + `SQ`
 * (2) + two reserved bytes + a 32-bit Value Length, per PS3.5 2026c section
 * 7.1.2. `SQ` is one of the long-form VRs, so this is a constant and never 8.
 * Under Implicit VR LE the parser keeps a **value-only** slice for this shape
 * (`isFullSpanElement` in `../serialize/element.ts` keys exactly that case off
 * the encoding), so there is no header to subtract there.
 */
const EXPLICIT_SQ_HEADER_BYTES = 12;

/**
 * `true` when the parser consumed **more** bytes for this defined-length `SQ`
 * than its own Value Length field declared - i.e. its item stream ran past the
 * end the sequence itself named.
 *
 * ## Why this is a recorded fact and not a re-parse
 *
 * `Element.length` is the Value Length read off the wire and `Element.rawBytes`
 * is the span the parser actually consumed, both set once at parse time. This
 * compares two numbers already on the element - the same shape as
 * {@link isUnauditableSequence}, which reads the parser's own refusal rather than
 * re-deriving it. There is no scan, no per-offset loop and no cost that follows
 * an attacker-chosen value length.
 *
 * ## Why only the over-run direction
 *
 * The over-run is the direction that **moves an element into a Data Set it was
 * not encoded in**: an item that declares more bytes than its enclosing sequence
 * does absorbs whatever follows the sequence. The opposite comparison would also
 * fire on a hand-built {@link Element} whose `length` and `rawBytes` a caller set
 * independently ({@link Element} is publicly constructible and `deidentify` runs
 * on any `Dataset`), and nothing is moved anywhere in that case.
 *
 * ## What it deliberately does not answer
 *
 * An **undefined-length** `SQ` declares no extent, so there is nothing for its
 * item stream to contradict and this returns `false` for it - measured, not
 * assumed: across the shape sweep in
 * `test/integration/deident-private-reservation.test.ts` no undefined-length
 * sequence produces the retention this guards, because an item that reads past
 * the `(FFFE,E0DD)` Sequence Delimitation Item is refused by the parser outright.
 *
 * It is also **not** a claim about which reading of the file is right. PS3.5
 * gives the item's length field and the sequence's length field equal standing
 * (section 7.5.1 and section 7.5.2), and an over-declaring item is byte-identical
 * to an under-declaring sequence, so no predicate can separate the sender's two
 * possible intents. This says only that the file contradicts itself about where
 * the Item ends - which is exactly the boundary section 7.8.1 scopes a private
 * block reservation to.
 */
function itemStreamOverrunsSequence(el: Element, encoding: BodyEncoding): boolean {
  if (el.vr !== "SQ" || el.length === UNDEFINED_LENGTH) return false;
  const headerBytes = encoding === "implicit" ? 0 : EXPLICIT_SQ_HEADER_BYTES;
  return el.rawBytes.length - headerBytes > el.length;
}

/**
 * Where one Data Set stops accounting for its own membership: the first sequence
 * whose extent its own contents contradict, named **twice** - by its place in the
 * Data Set's order and by the byte offset it was read at.
 *
 * ## Why two bounds and not one
 *
 * 🛑 **A Data Set is a `Map<Tag, Element>`, so its order is not its file order.**
 * When an ejected element carries a tag the Data Set **already holds**, `Map.set`
 * overwrites in place and the newcomer inherits the **earlier** element's
 * position - ahead of the sequence it was ejected from. An index cut alone reads
 * that element as settled and retains it; measured on a root holding a genuine
 * `(0009,0010)` + `(0009,1001)` reservation ahead of a sequence whose item ejects
 * a second `(0009,1001)`, which lands at index 2 with `byteOffset` 274 while the
 * sequence sits at index 3 with `byteOffset` 238 - the fixture pinned in
 * `test/integration/deident-private-reservation.test.ts`, whose File Meta is the
 * minimum THIS PARSER requires rather than PS3.10's; a longer File Meta group
 * shifts both numbers together. `Element.byteOffset` is the
 * position the parser counted and the overwrite cannot move it, so the offset
 * bound is what closes that shape.
 *
 * **The two are conjunctive, and each covers what the other cannot.** Offsets are
 * comparable *within* one Data Set - all of an Item's elements share that Item's
 * frame, measured 0/16/36 for three elements of a defined-length item - but
 * {@link Element} is publicly constructible and `deidentify` runs on any
 * {@link Dataset}, so a hand-built object may carry no meaningful offsets at all;
 * there the index bound is the one that still bites. Neither is a re-parse.
 *
 * The offset bound is taken as the **minimum** over every disputed sequence in
 * the Data Set while the index bound is taken from the **first** one, because the
 * same `Map` overwrite is what lets those two orderings disagree. Where they do,
 * the conjunction refuses more than either alone, which is the fail-safe
 * direction.
 *
 * ## What goes wrong after that point (the EJECT direction)
 *
 * {@link itemStreamOverrunsSequence} is about elements moving **into** an Item.
 * The mirror moves them **out**: when a sequence's contents and its declared
 * Value Length disagree, the parser resumes the enclosing Data Set at the
 * declared end, and the bytes the sender encoded as Item content are then read
 * as elements of the enclosing Data Set. A Private Creator that lands there
 * reserves a `(gggg,00EE)` block for elements the sender never put beside it, so
 * the very next private element is retained under `RetainSafePrivate` on a
 * reservation PS3.5 2026c section 7.8.1 never gave it - "The scope of the
 * reservation is just within the Item. Items do not inherit the Private Data
 * Element reservations made by Private Creator Data Elements in the Data Set in
 * which the Item is nested." As with the absorb direction, PS3.15 2026c section
 * E.3.10 licenses retention only for what is **known** safe, and a file that
 * contradicts itself about where an Item ends establishes no such knowledge, so
 * its other branch applies: "all other Private Attributes shall be removed **or
 * processed in the element-specific manner recommended by Deidentification
 * Action (0008,0307), if present within Private Data Element Characteristics
 * Sequence (0008,0300)**" - two branches, of which removal is the one available
 * here (`(0008,0307)` is not implemented).
 *
 * ## The two ways the parser records the same contradiction
 *
 * Both are facts already on the element. Neither is a re-parse, a scan, or a
 * claim about which of the file's length fields is the lie.
 *
 *  - **Explicit VR.** `parseSequence` bounds an item against the buffer rather
 *    than against the sequence, so an item that runs past the sequence's
 *    declared end is *read*, and the span shows up as `rawBytes.length` exceeding
 *    `length` ({@link itemStreamOverrunsSequence}).
 *  - **Implicit VR LE.** That path slices the item stream to the declared Value
 *    Length, so an item claiming more than fits is not a valid item stream at
 *    all: the descent is refused, `items` is `undefined`, and
 *    `DICOM_SQ_NOT_DESCENDED` is raised ({@link isUnauditableSequence}). Nothing
 *    over-runs, so the first test reads `false` on every one of these - which is
 *    why one predicate does not cover both, and why this is its own slice rather
 *    than a widening of the absorb rule.
 *
 * **The second test is broader than the ejection it is here for, deliberately
 * and in the fail-safe direction.** `isUnauditableSequence` says the parser could
 * not walk the sequence, not specifically that an item claimed to extend past the
 * declared end; another unwalkable item stream reaches it too. What the two share
 * is the only thing this function needs: the sequence's own contents do not
 * corroborate the boundary the enclosing Data Set resumed at, so which elements
 * that Data Set holds from there on is not established by the file. Such a
 * sequence is **already** emptied by {@link emptyUnauditableSequence}; this adds
 * that its neighbours' membership is not settled either.
 *
 * ## Why a prefix and not the whole Data Set
 *
 * An element read **before** the sequence cannot have come out of it. Narrowing
 * the whole Data Set instead was built and measured on
 * `scripts/measure-sq-bound-grid.ts` and rejected: it costs root retentions on
 * files whose reservation the sender wrote entirely ahead of the offending
 * sequence, which is a conformant arrangement and is pinned as a control in
 * `test/integration/deident-private-reservation.test.ts`. The disputed sequence
 * itself is inside the prefix - its own header was read at a settled offset, and
 * only what follows it is in doubt.
 *
 * Both the reservation map and the retention decision are taken from this prefix,
 * so a creator ejected into the enclosing Data Set cannot vouch for anything
 * there either, whichever side of it the private data element sits on.
 */
interface SettledBound {
  /** Elements from this index of the Data Set's own order onward are disputed. */
  readonly index: number;
  /** Elements read past this byte offset are disputed; `undefined` when none are. */
  readonly byteOffset: number | undefined;
}

function settledBound(source: readonly Element[], encoding: BodyEncoding): SettledBound {
  let index = source.length;
  let byteOffset: number | undefined;
  for (const [at, el] of source.entries()) {
    if (!itemStreamOverrunsSequence(el, encoding) && !isUnauditableSequence(el)) continue;
    if (index === source.length) index = at + 1;
    if (byteOffset === undefined || el.byteOffset < byteOffset) byteOffset = el.byteOffset;
  }
  return { index, byteOffset };
}

/**
 * Whether this Data Set accounts for holding `el`, per {@link settledBound}. The
 * disputed sequence itself is settled: its own header was read at an offset
 * nothing contradicts, and only what the file places *after* it is in doubt.
 */
function isSettled(el: Element, at: number, bound: SettledBound): boolean {
  return at < bound.index && (bound.byteOffset === undefined || el.byteOffset <= bound.byteOffset);
}

/**
 * Decide whether to keep a private element under `RetainSafePrivate` + a
 * profile. `creators` is the reservation map of the Data Set this element lives
 * in, never an enclosing one.
 *
 * The caller must also have established that this Data Set's boundary is the one
 * the file declares - see `reservationsUsable` on {@link processElements}. This
 * function answers "does the profile vouch for this element in this Data Set",
 * not "is this Data Set well defined".
 */
function keepsPrivate(
  el: Element,
  ctx: DeidentifyContext,
  creators: ReadonlyMap<string, string>,
): boolean {
  if (!ctx.active.has("RetainSafePrivate") || ctx.profile === undefined) return false;
  if (isPrivateCreatorElement(el.tag)) {
    return ctx.profile.privateDictionary.has(decodeCreator(el));
  }
  const creator = creatorFor(el.tag, creators);
  if (creator === undefined) return false;
  return resolvePrivateTag(ctx.profile, el.tag, creator) !== undefined;
}

/**
 * De-identify one ordered run of elements (a dataset body or a sequence item),
 * returning the rebuilt element map plus the audit accumulated at this depth.
 *
 * ## `reservationsUsable`
 *
 * `false` when this Data Set was reached through a sequence whose item stream
 * over-ran its own declared Value Length ({@link itemStreamOverrunsSequence}).
 * On such a file, which elements are inside the Item and which are outside it is
 * **not determined by the file**, and PS3.5 2026c section 7.8.1 scopes a private
 * block reservation to exactly that boundary: "Items within a sequence are self
 * contained Data Sets ..., any Item in the sequence that contains Private Data
 * Elements shall also have Private Creator Data Element reserving a block of
 * Elements for those Private Data Elements. The scope of the reservation is just
 * within the Item. Items do not inherit the Private Data Element reservations
 * made by Private Creator Data Elements in the Data Set in which the Item is
 * nested."
 *
 * So a `(gggg,00EE)` element found here may be reserving a block for elements the
 * sender never put in this Item, and a `(gggg,eeee)` element found here may be
 * borrowing a reservation it never had. PS3.15 2026c section E.3.10 licenses
 * retention only for what the de-identifier **knows** to be safe - "Private
 * Attributes that are known by the de-identifier to be safe from identity
 * leakage shall be retained, together with the Private Creator IDs that are
 * required to fully define the retained Private Attributes; all other Private
 * Attributes shall be removed **or processed in the element-specific manner
 * recommended by Deidentification Action (0008,0307), if present within Private
 * Data Element Characteristics Sequence (0008,0300)**" - a two-branch clause, of
 * which removal is the branch available here (`(0008,0307)` is not implemented).
 * That knowledge is keyed by the reservation. With the reservation undetermined
 * nothing here is known to be safe, so `RetainSafePrivate` retains nothing in
 * this Data Set and every private element **this function is given** is removed
 * and named in `report.removedPrivateTags`.
 *
 * **What that does NOT cover, and the sentence is qualified rather than the guard
 * widened** (`#54`'s rule, and `#54`'s exact refusal): a **private `SQ`** the
 * profile vouches for is settled by `keepsPrivate` -> `keepOrEmpty` **before**
 * {@link descendSequence} runs, so its items are never walked and this flag is
 * never carried into them. A private element absorbed into such a carrier's item
 * by an over-run is kept verbatim. Measured, `PRE-EXISTING`, identical on
 * `164eb39`, and pinned as a residual test rather than asserted away.
 *
 * **It propagates downward and never recovers.** A nested sequence inside a
 * disputed Item is itself made of disputed bytes, so its items' boundaries are no
 * better determined than their parent's.
 *
 * **🩺 This flag is about what an Item ABSORBS, and the root Data Set's value for
 * it is always `true`. That is not a claim that nothing leaves an Item.** The
 * mirror direction - an Item that *under*-declares **ejecting** its trailing
 * elements out into the enclosing Data Set - is answered by
 * {@link settledBound}, inside whichever Data Set they land in, at every
 * depth. The two are separate mechanisms with separate predicates: this one reads
 * an over-run recorded on the sequence, and the Implicit VR LE half of the eject
 * route records no over-run at all.
 */
function processElements(
  source: readonly Element[],
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  reservationsUsable: boolean,
): ProcessResult {
  const out: ProcessResult = {
    elements: new Map<Tag, Element>(),
    attributes: [],
    removedPrivateTags: [],
    embeddedAttributes: [],
    unauditableSequences: [],
    undefinedVrElements: [],
    warnings: [],
  };
  // The run this Data Set actually accounts for. Everything after it was read at
  // an offset the file's own contents contradict - see {@link settledBound} for
  // the two shapes, for why the cut is positional, and for why it takes two
  // bounds rather than one.
  const bound = settledBound(source, ctx.encoding);
  // Derived here, at every depth: `source` is exactly one Data Set. Only the
  // settled run reserves anything, so a creator ejected out of a sequence
  // reserves no block in the Data Set it landed in.
  const creators = creatorsInScope(source.filter((el, at) => isSettled(el, at, bound)));

  for (const [at, el] of source.entries()) {
    if (isPrivateTag(el.tag)) {
      if (reservationsUsable && isSettled(el, at, bound) && keepsPrivate(el, ctx, creators))
        keepOrEmpty(el, ctx, contextPath, out);
      else out.removedPrivateTags.push(el.tag);
      continue;
    }

    const action = annexE(el.tag);
    if (action === undefined) {
      // Not in Table E.1-1: unaffected (keep). Still recurse into sequences so
      // nested attributes that *are* listed get de-identified - and refuse to
      // keep one whose items were never materialized, because "not listed" is a
      // statement about this tag, not about the Data Sets inside its value.
      if (el.vr === "SQ") {
        if (isUnauditableSequence(el)) emptyUnauditableSequence(el, ctx, contextPath, out);
        else
          out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out, reservationsUsable));
      } else {
        keepOrEmpty(el, ctx, contextPath, out);
      }
      continue;
    }

    const resolved = resolveAction(effectiveCode(action, ctx.active));

    if (el.vr === "SQ") {
      applySequenceAction(el, resolved, action, ctx, contextPath, out, reservationsUsable);
      continue;
    }

    let applied: AppliedAction;
    switch (resolved) {
      case "K":
        // A `K` whose value turned out to carry whole Data Elements is emptied,
        // and the audit says `emptied` rather than `kept`: a report that claims
        // an attribute was retained when its value was dropped is worse than no
        // report.
        applied = keepOrEmpty(el, ctx, contextPath, out) ? "kept" : "emptied";
        break;
      case "X":
        applied = "removed";
        break;
      case "Z":
        out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));
        applied = "emptied";
        break;
      case "C":
        out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));
        applied = "cleaned";
        break;
      case "D": {
        const dummy = dummyBytes(el.vr);
        if (dummy !== null) {
          out.elements.set(el.tag, freshScalar(el, dummy, 1));
          applied = "dummied";
        } else {
          out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));
          applied = "emptied";
        }
        break;
      }
      case "U": {
        const remapped = remapUidBytes(el.rawBytes, ctx.remap.map);
        out.elements.set(el.tag, freshScalar(el, remapped, uidValueMultiplicity(remapped)));
        applied = "uid-remapped";
        break;
      }
    }

    out.attributes.push(auditAttribute(el.tag, action, resolved, applied, contextPath));
  }

  return out;
}

/**
 * Recurse into a sequence's items and rebuild it, merging nested audit upward.
 *
 * This is where `reservationsUsable` is narrowed: each Item is a Data Set whose
 * boundary is this sequence's Value Length, so a sequence whose item stream ran
 * past that length hands its items down as Data Sets whose membership the file
 * does not determine. Once `false` it stays `false` at every deeper level.
 */
function descendSequence(
  el: Element,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
  reservationsUsable: boolean,
): Element {
  const childReservationsUsable =
    reservationsUsable && !itemStreamOverrunsSequence(el, ctx.encoding);
  const newItems: Item[] = [];
  (el.items ?? []).forEach((item, index) => {
    const childPath = [...contextPath, `${el.tag}[${String(index)}]`];
    const inner = processElements(item.elements(), ctx, childPath, childReservationsUsable);
    out.attributes.push(...inner.attributes);
    out.removedPrivateTags.push(...inner.removedPrivateTags);
    out.embeddedAttributes.push(...inner.embeddedAttributes);
    out.unauditableSequences.push(...inner.unauditableSequences);
    out.undefinedVrElements.push(...inner.undefinedVrElements);
    out.warnings.push(...inner.warnings);
    newItems.push(new Item({ index, warnings: [], elements: inner.elements }));
  });
  return rebuildSequence(el, newItems, ctx.encoding);
}

/**
 * Apply a resolved action to an `SQ` element (X remove · Z/D empty · else recurse).
 *
 * `C`, `U` and `K` all mean "keep this sequence and clean what is inside it",
 * which is only answerable when the items exist. When they do not, the branch is
 * the same fail-safe empty as the unlisted case - and, just as importantly, the
 * audit says `emptied`. It used to say `kept` while `descendSequence` quietly
 * rebuilt the element from `el.items ?? []` and produced a zero-item sequence: a
 * report claiming an attribute was retained when its content was dropped is the
 * same class of false audit as one claiming a scrub it did not perform.
 */
function applySequenceAction(
  el: Element,
  resolved: ReturnType<typeof resolveAction>,
  action: AnnexEAction,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
  reservationsUsable: boolean,
): void {
  let applied: AppliedAction;
  switch (resolved) {
    case "X":
      applied = "removed";
      break;
    case "Z":
    case "D":
      out.elements.set(el.tag, rebuildSequence(el, [], ctx.encoding));
      applied = "emptied";
      break;
    case "C":
      if (isUnauditableSequence(el)) {
        emptyUnauditableSequence(el, ctx, contextPath, out);
        applied = "emptied";
      } else {
        out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out, reservationsUsable));
        applied = "cleaned";
      }
      break;
    case "U":
    case "K":
      if (isUnauditableSequence(el)) {
        emptyUnauditableSequence(el, ctx, contextPath, out);
        applied = "emptied";
      } else {
        out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out, reservationsUsable));
        applied = "kept";
      }
      break;
  }
  out.attributes.push(auditAttribute(el.tag, action, resolved, applied, contextPath));
}

function auditAttribute(
  tag: Tag,
  source: AnnexEAction,
  action: DeidentifiedAttribute["action"],
  applied: AppliedAction,
  contextPath: readonly string[],
): DeidentifiedAttribute {
  return {
    tag,
    keyword: source.keyword,
    action,
    applied,
    ...(contextPath.length > 0 ? { contextPath: [...contextPath] } : {}),
    // Say when a removal came from a repeating-group mask rather than a
    // single-tag row, so an audit can tell the two apart without re-deriving it.
    ...(source.repeatingGroup !== undefined ? { repeatingGroup: source.repeatingGroup } : {}),
  };
}

/** Rebuild File Meta, remapping the SOP Instance UID unless `RetainUIDs`. */
function rebuildFileMeta(
  fileMeta: FileMeta | undefined,
  ctx: DeidentifyContext,
): FileMeta | undefined {
  if (fileMeta === undefined) return undefined;
  if (ctx.active.has("RetainUIDs") || fileMeta.mediaStorageSOPInstanceUID === undefined)
    return fileMeta;
  return {
    ...fileMeta,
    mediaStorageSOPInstanceUID: ctx.remap.map(fileMeta.mediaStorageSOPInstanceUID),
  };
}

function defaultMethod(active: ReadonlySet<DeidentifyOption>): string {
  const base = "Cosyte @cosyte/dicom: PS3.15 Basic Application Level Confidentiality Profile";
  return active.size === 0 ? base : `${base} + ${[...active].join(", ")}`;
}

/** The DICOM value delimiter, `\` (5CH), for a multi-valued string VR. */
const VALUE_DELIMITER = 0x5c;

/**
 * The largest **even** Value Length an Explicit VR short form can express
 * (`0xFFFE`). `encodeDatasetElement` writes a 16-bit length for every VR outside
 * `LONG_FORM_VRS`, and `padValue` runs first, so an odd 65,535-byte value would
 * pad past the field as well. `LO` is a short-form VR.
 */
const MAX_SHORT_FORM_VALUE_BYTES = 0xfffe;

/**
 * Build the `(0012,0063)` De-identification Method value: `method` **added to**
 * whatever the incoming Data Set already recorded there, never replacing it.
 *
 * PS3.15 2026c E.1.1 "De-identifier", read from the SHA-pinned
 * `vendor/nema/part15/` and occurring exactly once in that document: "a text
 * string describing the method used shall be **inserted in or added to**
 * De-identification Method (0012,0063)". Replacing it is neither of those. It
 * destroyed the record of every de-identification the file had already been
 * through - the provenance chain that attribute exists to carry - and it did so
 * silently, on a file whose prior pass may have been the one a recipient was
 * relying on.
 *
 * The neighbouring obligation in the same paragraph is worded differently on
 * purpose and is left alone: `(0012,0062)` Patient Identity Removed "shall be
 * **replaced or added to** the Data Set with a value of YES". It is a CS of VM 1
 * whose only conformant value here is YES, so `deidentify` still replaces it.
 * The asymmetry is the standard's, not a judgement call.
 *
 * `(0012,0063)` is **not in Table E.1-1**, so the Basic Profile never acted on
 * it and the incoming value reaches this point untouched: the replacement was
 * the only thing removing it, and removing it was an action no profile asked
 * for. **Disclosed rather than glossed:** de-identified output now carries the
 * source file's own method text. That is the retained-by-omission posture every
 * other unlisted attribute already has, and a sender who put a name in
 * `(0012,0063)` is now no worse served than one who put it in any other unlisted
 * attribute.
 *
 * Four shapes, each pinned by a test:
 *
 *  - **No usable prior value** (absent, empty, or padding only) - the method is
 *    the whole value, exactly as before this change.
 *  - **A prior value** - the method is appended as a further value of this
 *    `1-n` attribute, after a `\`. The prior bytes are copied through verbatim,
 *    so a value encoded under a `(0008,0005)` repertoire survives byte for byte;
 *    only the even-length pad and any trailing NUL are trimmed before the join.
 *  - **A prior value that already records this method** - appending it again
 *    would record nothing, and repeated application would grow the attribute
 *    without bound, so only the values that are not already there are added, and
 *    a method every one of whose values is present leaves the attribute alone.
 *    **The comparison is per VALUE on BOTH sides, and a graded pass refuted the
 *    draft that compared the whole added string against each prior value.**
 *    `deidentificationMethod` is a `1-n` value like any other, so a caller string
 *    that carries a `\` never matched any single prior value and every pass
 *    appended a whole further copy - measured at 29 -> 59 -> 89 -> 119 bytes over
 *    four passes, against a flat 29 on base, and it reaches the ceiling below and
 *    throws at pass 2185. `deidentify(deidentify(ds))` is a fixed point on both
 *    shapes now.
 *  - **A prior value the join cannot be encoded beside** - see the ceiling below.
 *
 * **🩺 THE CEILING IS NOT A STYLE CHOICE. AN UNBOUNDED APPEND CRASHES THE
 * SERIALIZER, AND A GRADED PASS FOUND IT ON A FILE THE PARSER CALLS CLEAN.**
 * `LO` is not in `LONG_FORM_VRS`, so under an Explicit VR transfer syntax
 * `encodeDatasetElement` writes its Value Length with a **16-bit** field. A
 * `(0012,0063)` carrying a legal 65,534-byte chain of `1-n` values - exactly the
 * provenance chain this function exists to build - parses with **no warnings**,
 * and appending to it produced a 65,611-byte value that `serializeDicom` could
 * not encode: a raw `RangeError` out of Node's `Buffer` internals, outside the
 * documented `DicomSerializeError` surface, taking the whole de-identified object
 * down. On base the same file serialized, because base replaced.
 *
 * So when the join would exceed {@link MAX_SHORT_FORM_VALUE_BYTES}, this falls
 * back to the **pre-existing replacement** and says so, by returning
 * `replacedPrior`. That is not a new loss - it is what every released version did
 * on *every* file - and this slice narrows it from "always" to "only when the
 * prior chain is within a few bytes of the ceiling". **It is not silent**: the
 * caller gets `DICOM_DEIDENT_METHOD_NOT_ADDED` on `report.warnings`. Truncating
 * the chain instead was refused: choosing which of the sender's earlier
 * de-identification records to drop is a policy the standard does not state, and
 * this package reports rather than invents.
 *
 * The bound is applied uniformly rather than per encoding. Under Implicit VR LE
 * the length field is 32 bits and a longer value would encode, but one rule that
 * holds for every transfer syntax is worth more than a few thousand bytes of
 * chain in a case this extreme.
 *
 * **One route to an unencodable value is left exactly as it was on base and is
 * NOT closed here**: a caller who passes a `deidentificationMethod` longer than
 * the ceiling. That is `PRE-EXISTING` - base replaces with it and hits the same
 * `RangeError` - and it is caller-supplied rather than file-supplied, so it is a
 * backlog line and not a rider on this one.
 *
 * One more bound worth stating: the VR must be `LO`; a `(0012,0063)` a file
 * encoded as something else is not a De-identification Method this can
 * concatenate into, so that case still replaces. And the delimiter split is a
 * comparison only - a repertoire where 5CH is not the delimiter can at worst make
 * it append a value it could have skipped, which loses nothing.
 */
function addDeidentificationMethod(
  existing: Element | undefined,
  method: string,
): { readonly value: Buffer; readonly replacedPrior: boolean } {
  const added = Buffer.from(method, "latin1");
  if (existing === undefined || existing.vr !== "LO") return { value: added, replacedPrior: false };
  let end = existing.rawBytes.length;
  while (end > 0) {
    const last = existing.rawBytes[end - 1];
    if (last === 0x20 || last === 0x00) end--;
    else break;
  }
  const kept = Buffer.from(existing.rawBytes.subarray(0, end));
  if (kept.length === 0) return { value: added, replacedPrior: false };

  const keptValues = splitValues(kept);
  const missing = splitValues(added).filter((v) => !keptValues.some((k) => k.equals(v)));
  if (missing.length === 0) return { value: kept, replacedPrior: false };

  const parts: Buffer[] = [kept];
  for (const value of missing) {
    parts.push(Buffer.from([VALUE_DELIMITER]), value);
  }
  const joined = Buffer.concat(parts);
  if (joined.length > MAX_SHORT_FORM_VALUE_BYTES) {
    return { value: added, replacedPrior: true };
  }
  return { value: joined, replacedPrior: false };
}

/** Split a string-VR value on the `\` delimiter. Never empty: `[]` splits to `[""]`. */
function splitValues(value: Buffer): readonly Buffer[] {
  const out: Buffer[] = [];
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    if (i === value.length || value[i] === VALUE_DELIMITER) {
      out.push(value.subarray(start, i));
      start = i + 1;
    }
  }
  return out;
}

/** True when Pixel Data is present and not affirmatively marked free of burned-in text. */
function hasUncleanedBurnedIn(ds: Dataset): boolean {
  if (!ds.has(TAG_PIXEL_DATA)) return false;
  const flag = ds.get(TAG_BURNED_IN_ANNOTATION);
  if (flag === undefined) return true;
  return (
    flag.rawBytes
      .toString("latin1")
      .replace(/[\0 ]+$/, "")
      .trim()
      .toUpperCase() !== "NO"
  );
}

/**
 * De-identify a {@link Dataset} per PS3.15 Annex E - the Basic Application Level
 * Confidentiality Profile, plus any Retain/Clean Options passed in `retain`.
 *
 * Pure: `ds` is never mutated. Returns a fresh dataset and a
 * {@link DeidentifyReport} of tags, keywords, action codes, warnings and the UID
 * map. Everything in it is composed from static tables except `uidMap`, whose
 * keys are the source UIDs the file carried: treat that field as PHI.
 *
 * @throws {@link DeidentifyError} (`INVALID_OPTIONS`) for an unknown Retain option
 *   or a malformed `uidRoot`.
 *
 * @example
 * ```ts
 * import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";
 * const { dataset, report } = deidentify(parseDicom(buf));
 * const clean = serializeDicom(dataset); // safe to share
 * console.log(report.attributes.length, "attributes acted on");
 * ```
 */
export function deidentify(
  ds: Dataset,
  options: DeidentifyOptions = {},
): DeidentifyResult<Dataset> {
  const active = validateRetain(options.retain);
  const remap = makeUidRemapper(options.uidRoot, options.uidMap);
  const tsUid = ds.fileMeta?.transferSyntaxUID ?? "";
  const encoding = BODY_ENCODING[tsUid] ?? "explicitLE";
  const littleEndian = encoding !== "explicitBE";
  const ctx: DeidentifyContext = {
    active,
    remap,
    profile: options.profile,
    encoding,
    littleEndian,
    budget: { unauditableSequences: 0, undefinedVrElements: 0 },
  };

  // The root starts usable. That is a LIMITATION, not a proof: an Item that
  // under-declares DOES eject elements into the enclosing Data Set, the root
  // included, and a Private Creator that lands there is still trusted here. See
  // `processElements`' `reservationsUsable` note for the measurement and for why
  // the widening was priced and refused.
  const processed = processElements(ds.elements(), ctx, [], true);
  const {
    elements,
    attributes,
    removedPrivateTags,
    embeddedAttributes,
    unauditableSequences,
    undefinedVrElements,
  } = processed;

  // Required de-identification metadata (PS3.15 §E.1.1), inserted last.
  elements.set(
    TAG_PATIENT_IDENTITY_REMOVED,
    insertedScalar(TAG_PATIENT_IDENTITY_REMOVED, "CS", Buffer.from("YES", "latin1"), littleEndian),
  );
  const method = options.deidentificationMethod ?? defaultMethod(active);
  const priorMethod = elements.get(TAG_DEIDENTIFICATION_METHOD);
  const deidentMethod = addDeidentificationMethod(priorMethod, method);
  elements.set(
    TAG_DEIDENTIFICATION_METHOD,
    insertedScalar(TAG_DEIDENTIFICATION_METHOD, "LO", deidentMethod.value, littleEndian),
  );

  const warnings: DicomParseWarning[] = [...processed.warnings];
  if (deidentMethod.replacedPrior) {
    warnings.push(
      deidentMethodNotAdded({ byteOffset: priorMethod?.byteOffset ?? 0, fileMeta: false }),
    );
  }
  if (hasUncleanedBurnedIn(ds)) {
    const offset = ds.get(TAG_PIXEL_DATA)?.byteOffset ?? 0;
    warnings.push(burnedInAnnotationNotRemoved({ byteOffset: offset, fileMeta: false }));
  }

  const newFileMeta = rebuildFileMeta(ds.fileMeta, ctx);
  const datasetInit: DatasetInit = {
    warnings: ds.warnings,
    elements,
    ...(newFileMeta !== undefined ? { fileMeta: newFileMeta } : {}),
  };
  const dataset = new Dataset(datasetInit);

  const report: DeidentifyReport = {
    attributes,
    removedPrivateTags,
    embeddedAttributes,
    unauditableSequences,
    undefinedVrElements,
    uidMap: remap.cache,
    warnings,
    retained: [...active],
  };

  return { dataset, report };
}

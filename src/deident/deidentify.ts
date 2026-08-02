/**
 * `deidentify` - PS3.15 Annex E metadata-level de-identification.
 *
 * Applies the **Basic Application Level Confidentiality Profile** plus any of the
 * nine *metadata-affecting* Annex E Options, driven by the generated Table E.1-1
 * action map ({@link annexE}). It is a **pure** function: the input {@link Dataset}
 * is never mutated; a fresh `Dataset` (with a rebuilt element map and File Meta)
 * is returned alongside a {@link DeidentifyReport} that is value-free except for
 * `uidMap`, whose keys are the file's own source UIDs.
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
 *   `RetainUIDs`), writes `(0012,0062)` Patient Identity Removed = `YES` and
 *   `(0012,0063)` De-identification Method, and warns
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
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { annexE, type AnnexEAction, type AnnexEActionCode } from "../dictionary/annex-e.js";
import type { Tag, VR } from "../dictionary/types.js";
import { BE_VR_STRIDE } from "../parser/endian.js";
import { Dataset, type DatasetInit } from "../dataset/dataset.js";
import { Element, type ElementInit } from "../dataset/element.js";
import type { FileMeta } from "../dataset/file-meta.js";
import { Item } from "../dataset/item.js";
import { isPrivateTag, splitTag } from "../dataset/tag.js";
import type { Profile } from "../parser/types.js";
import type { DicomParseWarning } from "../parser/warnings.js";
import {
  burnedInAnnotationNotRemoved,
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

/**
 * The 34 VRs PS3.5 2026c section 6.2 defines, as a closed set to test an element's
 * recorded on-wire VR against. Keyed off the serializer's own stride table so
 * the set cannot drift from the one the rest of the package uses.
 */
const KNOWN_VRS: ReadonlySet<string> = new Set<string>(Object.keys(BE_VR_STRIDE));

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
 * ## Why an unrecognized VR is not a value
 *
 * PS3.5 section 6.2 fixes the structure of every VR that does not exist yet:
 * "All new VRs defined in future versions of DICOM shall be of the same Data
 * Element Structure as defined in [section 7.1.2] with reserved bytes after the
 * VR and a 32-bit unsigned integer VL (i.e., following the format for VRs such
 * as OB or UT)". This parser reads an unrecognized VR **short-form** - it trusts
 * the two on-wire bytes (Postel's Law, `explicit-le.ts`) and only
 * `LONG_FORM_VRS` takes the long layout - so its length field is read from the
 * wrong two bytes and its "value" spans the wrong bytes, by the standard's own
 * structure rule. Nothing about the content has to be argued.
 *
 * ## Where these come from, and what they carry
 *
 * The routine producer is an **under**-declared Value Length upstream: the
 * reader finishes the short value early and reads the remainder of the value
 * that was actually encoded as the next Data Element header, so tag, VR and
 * length are all fragments of somebody's value - and the element that genuinely
 * followed is swallowed as this fabricated element's value. Measured on
 * `scripts/measure-sq-bound-grid.ts` at `35adc2d`: a carrier under-declaring by
 * 6 yields `(4156,554C)` with VR bytes `"E "` holding the source `(0010,0020)`
 * Patient ID, on **8** grid cells, silently, and on **string** carriers as
 * readily as binary ones - the carrier's own VR is not what decides it.
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
  out.undefinedVrElements.push({
    tag: el.tag,
    byteLength: el.rawBytes.length,
    ...(contextPath.length > 0 ? { contextPath: [...contextPath] } : {}),
  });
  out.warnings.push(
    undefinedVrNotAuditable({ byteOffset: el.byteOffset }, el.tag, el.rawBytes.length),
  );
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

/**
 * Decide whether to keep a private element under `RetainSafePrivate` + a
 * profile. `creators` is the reservation map of the Data Set this element lives
 * in, never an enclosing one.
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
 */
function processElements(
  source: readonly Element[],
  ctx: DeidentifyContext,
  contextPath: readonly string[],
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
  // Derived here, at every depth: `source` is exactly one Data Set.
  const creators = creatorsInScope(source);

  for (const el of source) {
    if (isPrivateTag(el.tag)) {
      if (keepsPrivate(el, ctx, creators)) keepOrEmpty(el, ctx, contextPath, out);
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
        else out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out));
      } else {
        keepOrEmpty(el, ctx, contextPath, out);
      }
      continue;
    }

    const resolved = resolveAction(effectiveCode(action, ctx.active));

    if (el.vr === "SQ") {
      applySequenceAction(el, resolved, action, ctx, contextPath, out);
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

/** Recurse into a sequence's items and rebuild it, merging nested audit upward. */
function descendSequence(
  el: Element,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
): Element {
  const newItems: Item[] = [];
  (el.items ?? []).forEach((item, index) => {
    const childPath = [...contextPath, `${el.tag}[${String(index)}]`];
    const inner = processElements(item.elements(), ctx, childPath);
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
        out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out));
        applied = "cleaned";
      }
      break;
    case "U":
    case "K":
      if (isUnauditableSequence(el)) {
        emptyUnauditableSequence(el, ctx, contextPath, out);
        applied = "emptied";
      } else {
        out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out));
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

  const processed = processElements(ds.elements(), ctx, []);
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
  elements.set(
    TAG_DEIDENTIFICATION_METHOD,
    insertedScalar(TAG_DEIDENTIFICATION_METHOD, "LO", Buffer.from(method, "latin1"), littleEndian),
  );

  const warnings: DicomParseWarning[] = [...processed.warnings];
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

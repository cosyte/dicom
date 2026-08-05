/**
 * Public types + error taxonomy for Phase 7 metadata de-identification
 * (PS3.15 Annex E).
 *
 * @module
 */

import type { AnnexEActionCode, AnnexEOption } from "../dictionary/annex-e.js";
import type { Tag, VR } from "../dictionary/types.js";
import type { Profile } from "../parser/types.js";
import type { DicomParseWarning } from "../parser/warnings.js";

/**
 * The PS3.15 Annex E option sets `deidentify` honours - the nine
 * *metadata-affecting* columns of Table E.1-1. The two pixel-level options
 * (`CleanPixelData` §E.3.1, `CleanRecognizableVisual` §E.3.2) are deliberately
 * excluded: this is a metadata-only de-identifier and cannot inspect pixels
 * (deferred to `@cosyte/dicom-pixel`). When pixel data is present it always
 * warns rather than claiming the image is clean.
 *
 * **`RetainLongitudinalTemporal` gives you the full-dates branch.** PS3.15
 * §E.3.6 is *two* options, and Table E.1-1 gives them separate columns:
 * `Rtn. Long. Full Dates` (keep dates and times as they are) and
 * `Rtn. Long. Modif. Dates` (keep them only as modified/shifted values). One
 * name here covers both, and it carries the **full-dates** column - the *less*
 * protective branch. That is not a rounding difference: the two columns disagree
 * on **169** rows, and on every one of them full-dates says `K` (keep the real
 * value) where modified-dates says `C` (clean it). Activate it only when real
 * dates are genuinely required; leave it off and the Basic Profile action
 * applies, which removes or empties them. Date *shifting* is not implemented at
 * this layer - a caller who needs the modified-dates behaviour shifts the values
 * themselves after the call.
 *
 * @example
 *   const retain: DeidentifyOption[] = ["RetainLongitudinalTemporal", "RetainSafePrivate"];
 */
export type DeidentifyOption = Exclude<AnnexEOption, "CleanPixelData" | "CleanRecognizableVisual">;

/**
 * The nine metadata option-set names, frozen for runtime validation.
 *
 * @example
 * ```ts
 * import { DEIDENTIFY_OPTIONS } from "@cosyte/dicom";
 * DEIDENTIFY_OPTIONS.includes("RetainUIDs"); // true
 * ```
 */
export const DEIDENTIFY_OPTIONS: readonly DeidentifyOption[] = Object.freeze([
  "CleanGraphics",
  "CleanStructuredContent",
  "CleanDescriptors",
  "RetainLongitudinalTemporal",
  "RetainPatientCharacteristics",
  "RetainDeviceIdentity",
  "RetainUIDs",
  "RetainSafePrivate",
  "RetainInstitutionIdentity",
]);

/**
 * What `deidentify` actually did to one attribute - the concrete outcome of the
 * resolved Annex E action.
 *
 * - `removed` - the element was deleted (`X`).
 * - `emptied` - replaced with a zero-length value (`Z`).
 * - `dummied` - replaced with a non-identifying dummy of compatible VR (`D`).
 * - `uid-remapped` - UID(s) replaced with internally-consistent UIDs (`U`).
 * - `cleaned` - conservatively blanked because a safe similar-meaning value
 *   cannot be synthesised at the metadata layer (`C`; see known limitations).
 * - `kept` - retained, either by an active Retain option or because the SQ was
 *   kept and its items cleaned recursively.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type AppliedAction } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * const removed = report.attributes.filter((a) => a.applied === ("removed" satisfies AppliedAction));
 * ```
 */
export type AppliedAction = "removed" | "emptied" | "dummied" | "uid-remapped" | "cleaned" | "kept";

/**
 * One audited attribute outcome. Carries only structural facts - tag, keyword,
 * the resolved Annex E action code, and the SQ context path - **never** a
 * decoded value, so a report is always safe to log.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type DeidentifiedAttribute } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * report.attributes.forEach((a: DeidentifiedAttribute) => {
 *   console.log(a.keyword, a.action, a.applied); // structural facts only - safe to log
 * });
 * ```
 */
export interface DeidentifiedAttribute {
  readonly tag: Tag;
  readonly keyword: string;
  /** The resolved single action after collapsing any conditional code. */
  readonly action: Exclude<AnnexEActionCode, `${string}/${string}`>;
  readonly applied: AppliedAction;
  /** Tag/index chain for an attribute inside a sequence; omitted at the root. */
  readonly contextPath?: readonly string[];
  /**
   * Present when the action came from a Table E.1-1 row that names a
   * repeating-group family rather than this single tag: the mask that matched,
   * e.g. `"60xx4000"` for Overlay Comments in any overlay plane. `tag` is always
   * the concrete tag that was in the file. Absent for every exact-tag row.
   */
  readonly repeatingGroup?: string;
}

/**
 * One value that was emptied because a Data Element was found **inside** it.
 *
 * PS3.5 defines Value Length as the length of that element's own Value Field. A
 * sender that over-declares it produces a file whose reading is self-consistent
 * and whose next element has been absorbed into the previous one's value - and
 * Table E.1-1 is keyed by tag, so an absorbed `(0010,0020)` is not an attribute
 * any longer and no action fires on it. `deidentify` therefore refuses to keep a
 * value whose tail decodes as whole Data Elements it would have acted on
 * (PS3.15 §E.1 "all instances"; §E.3.5 is the standard's own precedent for
 * removing identifying information embedded inside a string attribute).
 *
 * Every field is structural: `tag` and `vr` are the carrier's, and `hidden`
 * holds tags composed from four bytes each. No decoded value appears here, so
 * this is safe to log.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * for (const e of report.embeddedAttributes) {
 *   console.warn(`${e.tag} hid ${e.hidden.join(", ")} in its value`);
 * }
 * ```
 */
export interface EmbeddedAttributeFinding {
  /** The carrier - the element whose over-declared value held the others. */
  readonly tag: Tag;
  /** The carrier's VR. Always one of the string VRs; binary VRs are not scanned. */
  readonly vr: VR;
  /** The tags of the Data Elements found inside the carrier's value, in wire order. */
  readonly hidden: readonly Tag[];
  /** Tag/index chain when the carrier is inside a sequence item; omitted at the root. */
  readonly contextPath?: readonly string[];
}

/**
 * One `SQ` element that was emptied because the parser never materialized its
 * items, so the de-identifier had no Data Sets to walk.
 *
 * PS3.5 2026c §7.5.1 "Item Encoding Rules" states that "Each Item Value shall
 * contain a DICOM Data Set composed of Data Elements", so an `SQ` element's
 * value is never opaque bytes - it is Data Elements this run is obliged to
 * reach. PS3.15 2026c §E.1.1 "De-identifier" states that obligation directly:
 * an implementation claiming the Basic Application Level Confidentiality
 * Profile "shall protect or retain all instances of the Attributes listed in
 * [Table E.1-1], whether contained in the top level Data Set or embedded in an
 * Item of a Sequence of Items". When the item stream cannot be enumerated the
 * obligation cannot be discharged element by element, so it falls on the
 * enclosing attribute - the escalation §E.1.1 itself uses for a SOP Instance
 * UID inside a Sequence, where "the enclosing Attribute in the top-level Data
 * Set must be encrypted in its entirety". (That sentence is written about the
 * encrypt-and-replace mechanism for SOP Instance UIDs, not about Table E.1-1
 * generally; it is cited here as the standard's own precedent for escalating to
 * the carrier, not as a rule about this case.)
 *
 * Both fields are structural: `tag` is the carrier's and `byteLength` is the
 * declared size of the value that was dropped. No decoded value appears here,
 * so this is safe to log.
 *
 * The parser always announces the underlying refusal first, on
 * `Dataset.warnings`: `DICOM_SQ_NOT_DESCENDED` for a defined-length Implicit VR
 * LE value whose dictionary-resolved `SQ` was not a valid item stream.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * for (const s of report.unauditableSequences) {
 *   console.warn(`${s.tag}: ${String(s.byteLength)} bytes dropped, item stream unreadable`);
 * }
 * ```
 */
export interface UnauditableSequenceFinding {
  /** The `SQ` element that was emptied. */
  readonly tag: Tag;
  /** Byte length of the value field that was dropped. Structural, never a value. */
  readonly byteLength: number;
  /** Tag/index chain when the carrier is inside a sequence item; omitted at the root. */
  readonly contextPath?: readonly string[];
}

/**
 * One element that was emptied because its **on-wire VR is not one of the 34
 * PS3.5 section 6.2 defines**, so nothing this library did to its bytes counts
 * as decoding a Value Field.
 *
 * ## Why such an element exists at all
 *
 * Under an Explicit VR Transfer Syntax the VR is two bytes the sender wrote, and
 * this parser trusts them (Postel's Law on the read path). The routine way two
 * arbitrary bytes end up in a VR field is an **under**-declared Value Length
 * upstream: the reader finishes the short value, and the leftover bytes of the
 * value that was actually encoded are read as the next Data Element header. Tag,
 * VR and length are then all fragments of somebody's value, and the element that
 * genuinely followed is consumed as this fabricated element's "value".
 *
 * Measured on `scripts/measure-sq-bound-grid.ts`: a carrier under-declaring by 6
 * produces `(4156,554C)` with the VR bytes `"E "`, whose value holds the source
 * `(0010,0020)` Patient ID in full. It reaches **string** carriers exactly as it
 * reaches binary ones, because the carrier's own VR is not what decides it.
 *
 * ## Why emptying, and why it is not a guess
 *
 * PS3.5 2026c section 6.2 requires every VR not yet defined to use the long-form
 * Data Element Structure - "with reserved bytes after the VR and a 32-bit
 * unsigned integer VL" - so an unrecognized VR read short-form, which is what
 * this parser does, is by the standard's own structure rule not a reading of a
 * Value Field. There is nothing to prove about the content: the test is a
 * membership check against the closed 34-VR set on a field the parser already
 * recorded, so there is no scan, no per-offset loop, and no cost that follows an
 * attacker-chosen value length.
 *
 * PS3.15 2026c section E.1.1 obliges an implementation claiming the Basic
 * Application Level Confidentiality Profile to "protect or retain all instances
 * of the Attributes listed in [Table E.1-1]". Those instances cannot be reached
 * inside bytes that were never a value, so the obligation falls on the carrier.
 *
 * **`UN` is not this.** `UN` is one of the 34, so an ordinary unknown-VR element
 * - the Implicit VR fallback for a tag this build's dictionary does not publish,
 * and the CP-246 shape - never reaches here. That is the line the sibling
 * `SQ`-with-no-items rule could not draw.
 *
 * ## Why this finding names no tag, when every sibling finding does
 *
 * Because the tag **may be content**, and nothing here can tell. The paragraph
 * above is the whole argument: when an under-declare desynchronized the reader,
 * the four tag bytes and the two VR bytes were read out of the middle of some
 * element's Value Field, so reporting the "tag" would republish four bytes of
 * the document. An unrecognized VR written honestly, at a correct length, raises
 * this same code and has an ordinary tag - **and the two are indistinguishable
 * here**, so the tag is withheld on both routes rather than on a guess. Measured on a synthetic `ST` carrier holding
 * `"MR BRAIN SMITHSON"`, the fabricated tag is `48544F53` - four bytes of the
 * surname. {@link EmbeddedAttributeFinding} and
 * {@link UnauditableSequenceFinding} may carry a tag because theirs came from a
 * header the sender really wrote; this one may not, and the asymmetry is the
 * finding rather than an inconsistency.
 *
 * `byteOffset` locates the element instead - a position this parser counted.
 * Nothing here renders a document byte: an offset the parser counted, a decoded
 * length, and the structural `contextPath`. Safe to log.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * for (const u of report.undefinedVrElements) {
 *   console.warn(`offset ${String(u.byteOffset)}: ${String(u.byteLength)} bytes dropped`);
 * }
 * ```
 */
export interface UndefinedVrFinding {
  /**
   * Byte offset of the emptied element's header. **This is how the element is
   * identified, and there is deliberately no `tag` field** - see the note above:
   * a fabricated header's tag bytes are part of some element's value.
   */
  readonly byteOffset: number;
  /**
   * Byte length of the value field that was dropped.
   *
   * **An input-derived count, and on this finding specifically that is not a
   * formality.** For the sibling findings the length came from a header the
   * sender wrote; here the two length bytes can themselves be value bytes, like
   * the tag bytes. What is published is the *number* they decode to, never the
   * bytes - the same footing as every `{n}` in the warning registry, which is
   * documented there as "an input-derived count". A number is not a rendering,
   * and the reach is at most a character or so, but do not describe this field
   * as "structural, never a value" the way its siblings are described.
   */
  readonly byteLength: number;
  /** Tag/index chain when the carrier is inside a sequence item; omitted at the root. */
  readonly contextPath?: readonly string[];
}

/**
 * The audit trail returned alongside the de-identified dataset.
 *
 * Most fields are composed from static tables: Part 6 keywords, Annex E action
 * codes, structural `TAG[index]` sequence paths, and registry warning messages.
 * **Two are not, and both are named here rather than in a footnote.**
 *
 * 1. **`uidMap`** - its keys are the source UIDs read out of the file, kept so a
 *    caller can make UID replacement consistent across a study or an archive. A
 *    Study or SOP Instance UID is a unique identifying number, so treat it as
 *    PHI.
 * 2. **`removedPrivateTags`** - see the field's own note. On a *well-formed*
 *    file these are the sender's own private tag numbers and carry nothing; on a
 *    malformed one a tag can be four bytes of a value, and it is measured, not
 *    theoretical.
 *
 * So "the report is safe to log apart from `uidMap`" is **not** an accurate
 * description of this type, and was corrected rather than kept convenient.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type DeidentifyReport } from "@cosyte/dicom";
 * const { report }: { report: DeidentifyReport } = deidentify(parseDicom(buf));
 * console.log(report.attributes.length, "attributes acted on");
 * console.log(report.warnings.map((w) => w.code)); // e.g. burned-in annotation
 * ```
 */
export interface DeidentifyReport {
  /** Per-attribute outcomes for every attribute Annex E acted on. */
  readonly attributes: readonly DeidentifiedAttribute[];
  /**
   * Private tags removed under the Basic Profile (kept ones are omitted).
   *
   * **This is the second field that is not value-free, and the qualification is
   * measured.** A tag here is composed from four bytes of the source, and on a
   * file whose Value Lengths disagree with its bytes those four bytes can be
   * document content rather than a tag the sender wrote: an `OB` carrier holding
   * `"SECRET-NOTE-"` followed by a well-formed odd-group header reports
   * `["41534342"]`, whose wire-order bytes read `"SABC"`. That reproduces
   * identically on every release that has shipped this field.
   *
   * It is reported anyway, because *which* private tags were removed is the
   * whole audit value of the field and withholding them would destroy it on
   * every well-formed file to bound a malformed one. Narrowing it - to blocks a
   * creator in the same Data Set actually reserved, say - is a product decision
   * about audit value versus a four-byte echo, not a defect fix, and it has not
   * been made. Treat this array as PHI when the source is untrusted.
   */
  readonly removedPrivateTags: readonly Tag[];
  /**
   * Values emptied because whole Data Elements were encoded inside them by an
   * over-declared Value Length. Empty on a well-formed file; a non-empty array
   * means the *source* was malformed in a way that hid attributes from the
   * action table, so treat it as a data-quality alarm on the sender as well as
   * an audit line. See {@link EmbeddedAttributeFinding}.
   */
  readonly embeddedAttributes: readonly EmbeddedAttributeFinding[];
  /**
   * `SQ` elements emptied because the parser did not materialize their items, so
   * the run had no Data Sets to walk and could not discharge PS3.15 §E.1.1's
   * obligation inside them. Empty on a well-formed file; a non-empty array means
   * content was dropped from the de-identified output, and the matching
   * `DICOM_SQ_NOT_DESCENDED` entry on `Dataset.warnings` says why the parse
   * refused. See {@link UnauditableSequenceFinding}.
   *
   * **Capped, and the cap is on the record only.** A crafted input can carry
   * tens of thousands of un-auditable elements, so this array (and its matching
   * warnings) stops at `MAX_UNAUDITABLE_SEQUENCE_FINDINGS`. Every un-auditable
   * sequence is still emptied; an array exactly that long means "at least this
   * many", so read it as truncated rather than as a total.
   *
   * **It is not a complete list of what went un-audited, either**: a private
   * `SQ` a {@link Profile} vouches for under `RetainSafePrivate` is kept
   * verbatim and never appears here.
   */
  readonly unauditableSequences: readonly UnauditableSequenceFinding[];
  /**
   * Elements emptied because their on-wire VR is not one of the 34 PS3.5 §6.2
   * defines, so their bytes are not a Value Field this library decoded and
   * PS3.15 §E.1.1's obligation over what is inside them could not be discharged.
   * Empty on a file conformant to **PS3.5 2026c**: a sender that writes one of
   * the 34 VRs that edition defines never produces one, and an Implicit VR LE
   * file **cannot** - there the VR comes from the dictionary. The edition is not
   * pedantry: §6.2 exists precisely to say how a *future* VR will be encoded, so
   * a file conformant to a later edition using a newly defined VR is the
   * population that sentence exists for. (What such a file does on this
   * library's parse path is not summarized here - it was measured and the
   * shapes disagree.) A non-empty array
   * means the source desynchronized the reader, usually by under-declaring a
   * Value Length somewhere earlier. See {@link UndefinedVrFinding}.
   *
   * **Capped, and the cap is on the record only**, exactly as
   * {@link DeidentifyReport.unauditableSequences} is: a crafted 1 MiB input can
   * carry over a hundred thousand such elements, so this array and its matching
   * warnings stop at `MAX_UNDEFINED_VR_FINDINGS`. Every one of them is still
   * emptied; an array exactly that long means "at least this many".
   *
   * **A finding here names a byte offset, not a tag** - uniquely among the
   * report's findings, and for a reason worth reading in
   * {@link UndefinedVrFinding}: the tag of a fabricated header is itself part of
   * some element's value.
   *
   * Unlike its sibling this list has **no carve-out**, and the reason is
   * structural rather than a promise: `keepOrEmpty` is the **only** path that
   * writes a source value into de-identified output unchanged, and the test sits
   * at the top of it. Every other outcome - `X` remove, `Z`/`C` empty, `D` dummy,
   * `U` remap, and a private tag the Basic Profile drops - already replaces the
   * value. So a `RetainSafePrivate` element a {@link Profile} vouches for still
   * reaches this test and is still emptied, which is where the sibling
   * `SQ`-with-no-items rule has a real carve-out and this one does not.
   */
  readonly undefinedVrElements: readonly UndefinedVrFinding[];
  /**
   * Source UID → replacement UID, for cross-file consistency. The **keys are
   * document values**, not composed identifiers: this is the one field of the
   * report that carries PHI.
   */
  readonly uidMap: ReadonlyMap<string, string>;
  /** Safety warnings - notably burned-in-pixel annotation that cannot be cleaned. */
  readonly warnings: readonly DicomParseWarning[];
  /** The Retain/Clean options that were active for this run. */
  readonly retained: readonly DeidentifyOption[];
}

/**
 * Options controlling a de-identification run. All optional - the default is
 * the Basic Application Level Confidentiality Profile with no Retain options.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type DeidentifyOptions } from "@cosyte/dicom";
 * const opts: DeidentifyOptions = { retain: ["RetainLongitudinalTemporal", "CleanDescriptors"] };
 * const { dataset } = deidentify(parseDicom(buf), opts);
 * ```
 */
export interface DeidentifyOptions {
  /** Annex E option sets to activate (Retain* / Clean*). Default: none. */
  readonly retain?: readonly DeidentifyOption[];
  /** Root for generated UIDs (action `U`). Default `"2.25"`. */
  readonly uidRoot?: string;
  /**
   * A caller-owned source→replacement UID cache. Pass one shared map across a
   * whole study/archive to make UID remapping consistent by construction even
   * across separate calls (it is consistent anyway - the mapping is content-
   * derived - but a shared map also makes repeats O(1)).
   */
  readonly uidMap?: Map<string, string>;
  /**
   * A Phase 6 {@link Profile} whose private-dictionary overlay names the
   * known-safe private attributes to keep when `RetainSafePrivate` is active.
   * Without it, `RetainSafePrivate` keeps nothing (fail-safe).
   */
  readonly profile?: Profile;
  /**
   * Text **added to** `(0012,0063)` De-identification Method. Default names the
   * Basic Profile and the active options.
   *
   * PS3.15 E.1.1 says this string is "inserted in or added to" the attribute, so
   * a value the incoming Data Set already carried is kept and this one is
   * appended after a `\` as a further value of the `1-n` attribute - the
   * provenance chain, not a replacement.
   *
   * **This string is itself a `1-n` value**: it is split on `\` and only the
   * values not already recorded are added, so repeated de-identification is a
   * fixed point whether or not it carries a delimiter.
   *
   * One bound. When the join would exceed the largest Value Length an `LO` can
   * encode, the prior value is **replaced** rather than added to - an element the
   * serializer cannot encode would take the whole de-identified object down - and
   * `report.warnings` carries `DICOM_DEIDENT_METHOD_NOT_ADDED`. A string longer
   * than that ceiling on its own is not bounded here and will fail to serialize,
   * exactly as it did before this option grew a join.
   */
  readonly deidentificationMethod?: string;
}

/**
 * The result of {@link deidentify}: a new dataset plus its audit report.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, serializeDicom, type DeidentifyResult } from "@cosyte/dicom";
 * const { dataset, report }: DeidentifyResult<ReturnType<typeof parseDicom>> = deidentify(parseDicom(buf));
 * const safe = serializeDicom(dataset); // input dataset is never mutated
 * void report;
 * ```
 */
export interface DeidentifyResult<TDataset> {
  readonly dataset: TDataset;
  readonly report: DeidentifyReport;
}

/**
 * Stable codes for {@link DeidentifyError}.
 *
 * @example
 * ```ts
 * import { DEIDENTIFY_ERROR_CODES } from "@cosyte/dicom";
 * DEIDENTIFY_ERROR_CODES.INVALID_OPTIONS; // "INVALID_OPTIONS"
 * ```
 */
export const DEIDENTIFY_ERROR_CODES = Object.freeze({
  INVALID_OPTIONS: "INVALID_OPTIONS",
} as const);

/**
 * One of the {@link DEIDENTIFY_ERROR_CODES} values.
 *
 * @example
 * ```ts
 * import { DeidentifyError, type DeidentifyErrorCode } from "@cosyte/dicom";
 * const code: DeidentifyErrorCode = "INVALID_OPTIONS";
 * throw new DeidentifyError("unknown retain option", code);
 * ```
 */
export type DeidentifyErrorCode =
  (typeof DEIDENTIFY_ERROR_CODES)[keyof typeof DEIDENTIFY_ERROR_CODES];

/**
 * Thrown for an author-time misconfiguration of {@link deidentify} (an unknown
 * Retain option, a malformed UID root). Distinct from the parser's fatal codes,
 * the value layer's `DicomValueError`, and the serializer's `DicomSerializeError`.
 * The message carries only structural facts (option names, the UID root) - never
 * a decoded value.
 *
 * @example
 * ```ts
 * import { deidentify, DeidentifyError } from "@cosyte/dicom";
 * try {
 *   // @ts-expect-error - not a valid option
 *   deidentify(ds, { retain: ["RetainEverything"] });
 * } catch (e) {
 *   if (e instanceof DeidentifyError) console.error(e.code); // "INVALID_OPTIONS"
 * }
 * ```
 */
export class DeidentifyError extends Error {
  public readonly code: DeidentifyErrorCode;

  /**
   * @param message Human-readable, PHI-free description.
   * @param code    One of {@link DEIDENTIFY_ERROR_CODES}.
   */
  public constructor(message: string, code: DeidentifyErrorCode) {
    super(message);
    this.name = "DeidentifyError";
    this.code = code;
  }
}

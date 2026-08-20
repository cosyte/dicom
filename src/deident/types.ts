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
 * One audited attribute outcome. `tag`, `keyword`, `action`, `applied` and
 * `repeatingGroup` carry **never** a decoded value: `keyword`, `action` and
 * `repeatingGroup` come from the Part 6 and Annex E tables, and `tag` is bound to
 * a tag those tables carry a row for, which is membership in a closed table
 * rather than a shape test.
 *
 * **🩺 `contextPath` is NOT in that class and this docstring used to say it was.**
 * It is a chain of tags read off the wire, bound by nothing - see
 * {@link DeidentifiedAttribute.contextPath} and the note on
 * {@link DeidentifyReport}.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type DeidentifiedAttribute } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * report.attributes.forEach((a: DeidentifiedAttribute) => {
 *   console.log(a.keyword, a.action, a.applied); // composed from tables - safe to log
 * });
 * ```
 */
export interface DeidentifiedAttribute {
  readonly tag: Tag;
  readonly keyword: string;
  /** The resolved single action after collapsing any conditional code. */
  readonly action: Exclude<AnnexEActionCode, `${string}/${string}`>;
  readonly applied: AppliedAction;
  /**
   * Tag/index chain for an attribute inside a sequence; omitted at the root.
   *
   * **🩺 Each segment is `TAG[index]`, and the `TAG` half is read off the wire
   * with no table behind it.** It is whatever tag the descent walked, so it is
   * bound by neither a shape test nor membership in a closed one - which is what
   * separates it from `tag`, `keyword`, `action` and `repeatingGroup`. On a file
   * where an under-declared Value Length desynchronized the reader onto four
   * bytes sitting **inside** somebody's value, those four bytes become a segment
   * here. It is not the only identifier on this report read off the wire -
   * {@link DeidentifyReport.removedPrivateTags} and
   * {@link UnauditableSequenceFinding.tag} are too - but those two are disclosed
   * as such, and this one was documented as structural.
   *
   * Measured on a synthetic `LO` carrier holding `"MRS BRAIN SMITHSON"` that
   * under-declares by four: the reader resynchronizes onto a fabricated `SQ`
   * header, descends it, and the report reads `contextPath: ["53484E4F[0]"]` -
   * `"HSON"` in wire order, recovered by writing the two halves back with
   * `writeUInt16LE`. **No warning is raised and every finding array on the
   * report is empty.** Change the surname and the published segment changes with
   * it. `PRE-EXISTING`, on every release that has shipped the field.
   *
   * **🛑 IT IS NOT THE ONLY PLACE THOSE BYTES SURFACE, AND AN EARLIER DRAFT OF
   * THIS NOTE SAID IT WAS. A GRADED PASS REFUTED THAT AND IT MUST NOT COME
   * BACK.** On the same file the de-identified `Dataset` still carries the
   * fabricated `(5348,4E4F)`, so `serializeDicom` writes its header back out in
   * full - `"HSON"` included - inside an object stamped
   * `(0012,0062) Patient Identity Removed = YES`. That re-emission belongs to
   * the disclosed under-declare carrier class, not to this field, and neither is
   * a bound on the other: **redacting `contextPath` from a log does not make the
   * object safe to share.** Pinned in
   * `test/integration/phi-diagnostic-surface.test.ts`.
   *
   * It is published anyway, on the same footing as
   * {@link DeidentifyReport.removedPrivateTags}: **where** an attribute sat is
   * the whole audit value of the field, and withholding it would destroy that on
   * every well-formed file in order to bound a malformed one. **Treat it as PHI
   * when the source is untrusted.**
   */
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
 * `tag` and `vr` are the carrier's own and are structural. **`hidden` was not,
 * and it is bound now.** Every tag in an embedded run is composed from four
 * bytes that were sitting *inside* the carrier's value - that is the whole
 * reason this type exists - and a run needs only ONE actionable attribute to be
 * reported, so through `0.0.13` the rest of the run was listed beside it.
 * Measured: a `CS` carrier over-declaring across a fabricated `"SMIT"` header
 * beside a genuine `(0010,0020)` reported `hidden: ["4D535449", "00100020"]`,
 * and `4D535449` is `"SMIT"` in wire order.
 *
 * **An entry is now one of the 652 literal rows of PS3.15 Table E.1-1 that this
 * run's options left actionable.** That is a **membership** bound rather than a
 * shape one - the posture this package already takes for a VR and for a Private
 * Creator - so what survives names a published table entry rather than a
 * document byte, the same trade rendering a VR makes with the 34. **A
 * repeating-group mask hit is NOT in that set and is excluded**: `(50xx,xxxx)`
 * Curve Data leaves the whole 16-bit element number free, so a mask match proves
 * a rule exists without making the membership finite. A graded pass caught a
 * draft of this filter that admitted it.
 *
 * **🛑 THAT IS NOT AN ALL-CLEAR OVER THIS TYPE.** `contextPath` below is
 * unbound and unchanged, `hidden` is uncapped, and
 * {@link DeidentifyReport} names the report's other value-bearing fields. A
 * `DeidentifyReport` is still not safe to log whole.
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
  /**
   * The tags found inside the carrier's value **that this run acts on and that a
   * published table names**, in wire order. **Not every tag in the run** - see
   * this type's own remarks.
   *
   * **🩺 IT MAY BE EMPTY, AND EMPTY DOES NOT MEAN "NOTHING WAS HIDDEN HERE".**
   * A run whose only actionable members are private attributes, Curve Data or
   * Overlay elements reports a finding with no tags: the carrier was still
   * emptied, and the accompanying `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED`
   * warning still counts the whole run. The presence of the finding is the fact;
   * this list is the part of it that can be named.
   */
  readonly hidden: readonly Tag[];
  /**
   * Tag/index chain when the carrier is inside a sequence item; omitted at the
   * root. **Built by the same descent as
   * {@link DeidentifiedAttribute.contextPath} and carrying the same caveat:
   * each segment's tag is read off the wire, bound by nothing, so on a
   * desynchronized read it can be four bytes of a value.** Read that field's
   * note before logging this one.
   */
  readonly contextPath?: readonly string[];
}

/**
 * One carrier this run could not reach the Data Sets inside, and **emptied** for
 * it. {@link UnauditableSequenceFinding.applied} names that outcome and is the
 * field to read first; it is the only outcome this finding has.
 *
 * **Two producers, and neither ships bytes.** The ordinary one is an
 * `SQ` element whose `items` the parser never materialized. The second is a
 * private data element retained under `RetainSafePrivate` whose `Profile` entry
 * declares it `SQ` while the parse tree says otherwise - `UN` under Implicit VR
 * LE when the profile was passed to `deidentify()` but not to `parseDicom`, or
 * whatever binary VR the sender wrote under Explicit VR, which wins in the
 * parser. The profile is the authority that retained the element, and it has
 * said the value is a Sequence of Items; with no items on the tree, the §E.1.1
 * obligation below falls on the carrier just the same. Such an element keeps its
 * parsed VR in the output and is emptied rather than re-typed to `SQ`
 * (`DICOM-PRIVATE-SQ-PARSE-VR`).
 *
 * **🛑 THERE WAS A THIRD PRODUCER AND IT IS RETIRED: `applied: "kept"` IS GONE
 * FROM THIS TYPE AND FROM EVERY RUN.** Through `0.0.19` a private data element
 * the profile vouched for whose value this run never enumerated was **retained
 * verbatim** and named here with `applied: "kept"` - the package reporting that
 * it had shipped a value it did not read. Such an instance is now **removed**
 * instead, and its record moved to
 * {@link DeidentifyReport.unenumerablePrivateRemovals}, which is a different
 * surface with a different guarantee: uncapped, complete, and stating a reason.
 * This array never carries a retained private value again, so an entry here
 * always means content is **not** in your output. That is an audit-contract
 * change for anyone who switched on `applied`; see
 * {@link UnenumerablePrivateRemoval}.
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
 * recorded span of the value that was dropped. **No _decoded_ value appears
 * here, and that is not the same as "safe to log".** On the second producer
 * `tag` can be four bytes of another element's value: a length under-declared
 * upstream resynchronizes the reader mid-value, and if the bytes it lands on
 * spell a private block this caller's profile declares `SQ`, followed by a VR
 * that is one of the 34, the fabricated header is what you get here. The
 * package's answer to that class is normally `report.undefinedVrElements`,
 * which names a byte offset and **no tag**, and it still answers the case where
 * the fabricated VR is outside the 34 - but it cannot answer this one, because
 * a fabricated `OB` header and a genuine one are byte-identical. So this shares
 * the standing exception `report.removedPrivateTags` and `uidMap` already have:
 * a `DeidentifyReport` is **not** a value-free surface. Treat it as document
 * content, at the sensitivity of the file it came from.
 *
 * For the first producer the parser announces the underlying refusal on
 * `Dataset.warnings`: `DICOM_SQ_NOT_DESCENDED` for a defined-length Implicit VR
 * LE value whose dictionary-resolved `SQ` was not a valid item stream. **Do not
 * generalise that to the second.** There the file may be entirely conformant -
 * an honest defined-length `OB` carrier raises nothing at all - so this report
 * field, not `Dataset.warnings`, is where that drop is visible.
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
  /** The carrier element. */
  readonly tag: Tag;
  /**
   * What happened to that carrier's value: `"emptied"`, always. The value is not
   * in the de-identified output.
   *
   * **🛑 `"kept"` WAS A MEMBER OF THIS UNION AND IS NOT ANY MORE.** It meant "the
   * value IS in the output, byte for byte, unexamined", and a report field that
   * can say so is exactly what this package no longer does: that instance is
   * removed now and recorded on
   * {@link DeidentifyReport.unenumerablePrivateRemovals}. The field itself is
   * kept, so `applied === "emptied"` keeps compiling and keeps meaning what it
   * always meant; a comparison against `"kept"` does not compile any more, which
   * is the intended way to find out.
   */
  readonly applied: "emptied";
  /**
   * Byte length of the carrier's value field that was **dropped**. Structural,
   * never a decoded value.
   */
  readonly byteLength: number;
  /**
   * Tag/index chain when the carrier is inside a sequence item; omitted at the
   * root. **Built by the same descent as
   * {@link DeidentifiedAttribute.contextPath} and carrying the same caveat:
   * each segment's tag is read off the wire, bound by nothing, so on a
   * desynchronized read it can be four bytes of a value.** Read that field's
   * note before logging this one.
   */
  readonly contextPath?: readonly string[];
}

/**
 * One private attribute **removed** because this run did not enumerate its
 * value - the record that discharges the audit half of the fail-safe, and the
 * one report surface that is complete at any input size.
 *
 * ## What "enumerated" means here, and what it deliberately does not
 *
 * A run has enumerated a private value when it **walked it as DICOM Data
 * Elements** and put each of them through the Annex E action table (a private
 * `SQ` the parser materialized items for), when the whole value **was matched
 * as a member of a closed table the caller supplied** (a Private Creator
 * `(gggg,00EE)` whose decoded value is in the profile's private dictionary), or
 * when the value is **zero-length** and so encodes no Data Set. Nothing else.
 *
 * **🛑 DECODING A VALUE UNDER THE VR THE PROFILE RESOLVED FOR IT IS NOT
 * ENUMERATION, AND NEITHER IS THE EMBEDDED-ATTRIBUTE SCANNER'S SILENCE.** A
 * decoded `LO`, `ST`, `OB`, `OW` or `UN` value is a byte run that can carry a
 * Data Set written in a transfer syntax this run never tested for; two cells of
 * the matrix in `test/integration/deident-private-reservation.test.ts` are
 * perfectly scannable Implicit VR LE string carriers whose values the scanner
 * DID read and found nothing in, and which carried a nested `(0010,0010)`
 * anyway, because the nested tiles are Explicit VR and the file is Implicit. So
 * the predicate is **what the run did with the value**, never the VR and never
 * the scanner's reach.
 *
 * ## The cost, stated at its real size
 *
 * With `RetainSafePrivate` plus a `Profile`, exactly three classes of private
 * value now reach the output: an instance the run walked as Data Elements, a
 * Private Creator the profile's dictionary vouches for, and a zero-length value.
 * **An ordinary vendor scalar under an ordinary string VR is removed**, because
 * this package enumerates nothing inside a retained private value that is not
 * one of those three. That is over-redaction traded for a closed identity leak:
 * PS3.15 2026c §E.3.10 retains Private Attributes "known by the de-identifier to
 * be safe from identity leakage" and sends "all other Private Attributes" to
 * removal or to the `(0008,0307)` element-specific action, which this library
 * does not implement - and a value nothing enumerated is not known to be safe
 * however ordinary it looks. Through `0.0.19` such a value was **kept** and
 * disclosed instead; the disclosure said outright that it was not a fix.
 *
 * ## Per INSTANCE, never per tag
 *
 * An entry names one **occurrence**: a tag together with the Data Set it lived
 * in, which `contextPath` identifies (absent means the root Data Set). Private
 * blocks are reserved per Data Set (PS3.5 §7.8.1), so the same private tag can
 * occur several times in one object with different enumerability, and removing
 * one occurrence never removes a sibling one.
 *
 * ## Uncapped, and that is a decision rather than an oversight
 *
 * Every consumer-controlled **diagnostic** in this package is capped, because a
 * finding emitted per element is amplified by an element count the input
 * chooses. This is not a diagnostic: it is the record of an **action**, on the
 * same footing as {@link DeidentifyReport.removedPrivateTags}, which is uncapped
 * for the same reason. A caller's whole guarantee is that they can separate the
 * unenumerable removals from the Annex E ones for **every** removal, so a cap
 * here would silently take the guarantee away exactly on the files that need it
 * most. The matching warnings stay bounded; this array does not.
 *
 * ## What it carries, and what that is worth logging
 *
 * `tag` is composed from four bytes of the source. On a well-formed file it is
 * the sender's own private tag number and carries nothing, but on a file whose
 * Value Lengths disagree with its bytes those four bytes can be document
 * content - the standing exception {@link DeidentifyReport.removedPrivateTags}
 * and {@link UnauditableSequenceFinding} already carry, by the same route, and
 * `contextPath` is unbound in the same way. It is published anyway, because
 * *which* attribute was removed and *where* is the whole audit value of the
 * record. Treat this array as PHI when the source is untrusted.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type UnenumerablePrivateRemoval } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf), { retain: ["RetainSafePrivate"], profile });
 * report.unenumerablePrivateRemovals.forEach((r: UnenumerablePrivateRemoval) => {
 *   console.warn(`${r.tag} ${r.applied} (${r.reason})`, r.contextPath ?? "root");
 * });
 * ```
 */
export interface UnenumerablePrivateRemoval {
  /** The removed instance's tag. */
  readonly tag: Tag;
  /**
   * The outcome, always `"removed"`: the Data Set that held this instance
   * carries no element bearing that tag, in the returned dataset and in the
   * serialized bytes. Distinct from **emptied**, where an element with that tag
   * is present carrying a zero-length value.
   */
  readonly applied: "removed";
  /**
   * Why, always `"unenumerable"`: this run did not enumerate the value, so
   * PS3.15 §E.3.10's "known ... to be safe" was never established for it. This
   * is what separates an entry here from an attribute the Annex E action table
   * removed (`report.attributes`, `applied: "removed"`) and from one whose value
   * was emptied.
   */
  readonly reason: "unenumerable";
  /**
   * Tag/index chain naming the Data Set this instance lived in; **omitted at the
   * root**, which is what identifies the removal as per-instance rather than
   * per-tag. **Built by the same descent as
   * {@link DeidentifiedAttribute.contextPath} and carrying the same caveat:
   * each segment's tag is read off the wire, bound by nothing, so on a
   * desynchronized read it can be four bytes of a value.** Read that field's
   * note before logging this one.
   */
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
 *
 * **🩺 THAT WITHHOLDING IS NOT WHOLE, AND THIS PARAGRAPH USED TO CLAIM IT WAS.**
 * It said "nothing here renders a document byte ... and the structural
 * `contextPath`. Safe to log." `contextPath` is not structural: its segments are
 * tags read off the wire by the same descent, so the header this type refuses to
 * name by `tag` can be named by the `contextPath` of a finding one level down.
 * See {@link DeidentifiedAttribute.contextPath} for the measurement. `byteOffset`
 * and `byteLength` are unaffected and the reasoning above them still stands.
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
   * sender wrote; here the four length bytes can themselves be value bytes, like
   * the tag bytes. What is published is the *number* they decode to, and one
   * `readUInt32LE` puts the bytes back: a fabricated header reading `"SO\0\0"`
   * publishes `20307`, two letters of a surname. Do not describe this field as
   * "structural, never a value" the way its siblings are described.
   *
   * **🩺 IT IS NO LONGER "the same footing as every `{n}` in the warning
   * registry", AND THAT SENTENCE WAS THE ONE THIS FIELD SHIPPED WITH.**
   * `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` rendered exactly this number and
   * does not any more - it is bound out of `undefinedVrNotAuditable`'s
   * signature. So this field is now a **model field**, on the same standing
   * exception as `removedPrivateTags`, `unauditableSequences[].tag`, `uidMap`
   * and `contextPath`: narrowing it is a product call, because a bound empties
   * it on every well-formed file, where it is exactly the audit number the field
   * exists to carry. Deliberately unchanged; see this type's own summary.
   */
  readonly byteLength: number;
  /**
   * Tag/index chain when the carrier is inside a sequence item; omitted at the
   * root. **Built by the same descent as
   * {@link DeidentifiedAttribute.contextPath} and carrying the same caveat:
   * each segment's tag is read off the wire, bound by nothing, so on a
   * desynchronized read it can be four bytes of a value.** Read that field's
   * note before logging this one.
   */
  readonly contextPath?: readonly string[];
}

/**
 * The audit trail returned alongside the de-identified dataset.
 *
 * Most fields are composed from static tables: Part 6 keywords, Annex E action
 * codes, the active option names.
 * **Several fields are not, and they are named here rather than in a footnote.**
 * 🛑 **Do not quote a COUNT of them, here or anywhere else.** The count read
 * "one" and then "two" and then "three", and was wrong every time it was read,
 * because each correction bumped the numeral without re-deriving the list.
 * **The list below carried its own numerals until one had to be added, which is
 * the same disease one step removed, so they are gone.** Treat it as the current
 * reading of a surface that has grown, not as a proof of exhaustiveness.
 *
 * - **`uidMap`** - its keys are the source UIDs read out of the file, kept so a
 *   caller can make UID replacement consistent across a study or an archive. A
 *   Study or SOP Instance UID is a unique identifying number, so treat it as
 *   PHI.
 * - **`removedPrivateTags`** - see the field's own note. On a *well-formed*
 *   file these are the sender's own private tag numbers and carry nothing; on a
 *   malformed one a tag can be four bytes of a value, and it is measured, not
 *   theoretical.
 * - **`unauditableSequences[].tag`** - see
 *   {@link UnauditableSequenceFinding}. Same shape as `removedPrivateTags` by a
 *   narrower route: a private carrier a {@link Profile} vouched for and this run
 *   emptied is named there, and an under-declared length upstream can
 *   resynchronize the reader onto four bytes that spell such a block. The
 *   package's usual answer to a
 *   fabricated header, `undefinedVrElements`, carries a byte offset and no tag,
 *   and still answers it whenever the fabricated VR is outside the 34 PS3.5
 *   §6.2 defines. It cannot when the fabricated VR is one of them, because those
 *   two files are byte-identical.
 * - **`unenumerablePrivateRemovals[].tag`** - see
 *   {@link UnenumerablePrivateRemoval}. The same four bytes by the same route,
 *   on the record of the removal rather than of an emptying, and this one is
 *   **uncapped** because it is the record of an action rather than a diagnostic.
 * - **`undefinedVrElements[].byteLength` and
 *   `unauditableSequences[].byteLength`** - the declared Value Length read off
 *   the element header, so on a fabricated header it is four document bytes
 *   wearing a decimal: `"SO\0\0"` publishes `20307`, two letters of a surname,
 *   put back with one `readUInt32LE`. **They JOINED this list rather than
 *   always having been on it.** Through `0.0.14` the two
 *   `DICOM_DEIDENT_*_NOT_AUDITABLE` **messages** rendered the same number;
 *   binding it out of those factory signatures left these model fields as its
 *   only publisher, which is a smaller surface and not a closed one. Narrowing
 *   them is a product call rather than a defect fix: a bound empties the field
 *   on every well-formed file, where the number is exactly the audit
 *   information it exists to carry.
 * - **`contextPath`, on all four findings that carry one** - see
 *   {@link DeidentifiedAttribute.contextPath}, which holds the measurement. The
 *   segment tags come off the wire with no table behind them, so a fabricated
 *   `SQ` header the reader descended is named there, `PRE-EXISTING`, with **no
 *   warning and no finding array to correlate it with**. This is the field the
 *   rest of this docstring, the tolerance table and the troubleshooting guide
 *   all called structural. **It is a logging hazard and nothing more: on that
 *   same file the de-identified object itself re-emits the fabricated header, so
 *   redacting this field does not make the object safe.**
 *
 * `embeddedAttributes[].hidden` **left that list** in
 * `DICOM-DIAGNOSTIC-PHI-RESIDUALS` - an entry is now a literal PS3.15 Table
 * E.1-1 row, so it is not value-bearing. Its own disclosure had been reworded
 * twice by then, and this repo deletes a disclosure at that point rather than
 * writing a third; what is true of the field is stated once, on
 * {@link EmbeddedAttributeFinding}. The field is **still uncapped**.
 *
 * So "the report is safe to log apart from `uidMap`" is **not** an accurate
 * description of this type, and was corrected rather than kept convenient.
 * **This is the only copy of that list.** Two others lived in module docstrings,
 * still naming `hidden` after it left and never naming `contextPath` at all; a
 * graded pass found them and they were deleted rather than resynced.
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
   * Private tags removed (kept ones are omitted) - **every one of them,
   * whichever rule removed it**: the Basic Profile's default removal, a
   * reservation the file did not settle, and, since the unenumerable class
   * became a removal, a private attribute this run did not enumerate. Its
   * meaning is unchanged and it is still uncapped; what it does not carry is a
   * **reason**, which is why the unenumerable removals are also recorded on
   * {@link DeidentifyReport.unenumerablePrivateRemovals}, where they can be told
   * apart from the rest.
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
   * Carriers whose nested Data Sets this run could not reach and **emptied** for
   * it: an `SQ` whose items the parser did not materialize, so the run had no
   * Data Sets to walk and could not discharge PS3.15 §E.1.1's obligation inside
   * them, and a private carrier a {@link Profile} declares `SQ` that the parse
   * tree resolved otherwise. Content was dropped from the de-identified output,
   * and for the first producer the matching `DICOM_SQ_NOT_DESCENDED` entry on
   * `Dataset.warnings` says why the parse refused.
   *
   * 🛑 **THIS ARRAY NO LONGER PRODUCES `applied: "kept"`, AND THAT IS AN
   * AUDIT-CONTRACT CHANGE.** A private attribute retained under
   * `RetainSafePrivate` whose value this run never enumerated used to be listed
   * here, kept verbatim, with the array saying so. That instance is **removed**
   * now and recorded on
   * {@link DeidentifyReport.unenumerablePrivateRemovals}. An entry here has one
   * meaning again: this content is **not** in your output.
   *
   * **Empty on a well-formed file**, including one whose private attributes a
   * profile vouches for. It stopped being populated by ordinary conformant files
   * when the retained class left it.
   *
   * **Capped, and the cap is on the record only.** A crafted input can carry
   * tens of thousands of un-auditable elements, so this array (and its matching
   * warnings) stops at `MAX_UNAUDITABLE_SEQUENCE_FINDINGS`. Every un-auditable
   * carrier is still emptied whether or not it is listed; an array exactly that
   * long means "at least this many", so read it as truncated rather than as a
   * total. The unenumerable **removals** are budgeted apart from it and their
   * record is not capped at all.
   *
   * **It covers private sequences too, since `DICOM-PRIVATE-SQ-CARVE-OUT`.** A
   * private `SQ` a {@link Profile} vouches for under `RetainSafePrivate` used to
   * be kept verbatim and never appear here; it is now emptied and listed on the
   * same terms as any other, because the profile's licence under PS3.15 §E.3.10
   * is over a private attribute and not over an item stream nothing could read.
   */
  readonly unauditableSequences: readonly UnauditableSequenceFinding[];
  /**
   * Private attributes **removed because this run did not enumerate their
   * value** - one entry per instance, naming the tag, the outcome (`"removed"`),
   * the reason (`"unenumerable"`) and the Data Set it lived in.
   *
   * **This is the surface the fail-safe's audit half is built on, and it is the
   * one array on this report that is never capped or truncated.** A caller can
   * separate, from this record alone and for every such removal at any input
   * size, the attributes removed for being unenumerable from the attributes
   * removed by the Annex E action table (`report.attributes`) and from the ones
   * whose value was emptied. The matching warnings ARE bounded, so past their
   * cap this record is the only complete account and the diagnostics are the
   * bounded one.
   *
   * **Empty unless `RetainSafePrivate` plus a `Profile` is active**, because
   * without both nothing private is retained far enough to be judged: the Basic
   * Profile removes every private attribute and names it in
   * {@link DeidentifyReport.removedPrivateTags} instead. A profile lookup that
   * **misses** is that case too, and never appears here.
   *
   * See {@link UnenumerablePrivateRemoval} for what counts as enumeration, for
   * the over-redaction this costs, and for why it names an instance rather than
   * a tag.
   */
  readonly unenumerablePrivateRemovals: readonly UnenumerablePrivateRemoval[];
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
   * This list has **no carve-out**, and the reason is structural rather than a
   * promise: `keepOrEmpty` is the **only** path that writes a source value into
   * de-identified output unchanged, and the test sits at the top of it. Every
   * other outcome - `X` remove, `Z`/`C` empty, `D` dummy, `U` remap, and a
   * private tag the Basic Profile drops - already replaces the value. So a
   * `RetainSafePrivate` element a {@link Profile} vouches for still reaches this
   * test and is still emptied. Its sibling
   * {@link DeidentifyReport.unauditableSequences} had a real one until
   * `DICOM-PRIVATE-SQ-CARVE-OUT`; neither has one now, and they arrive at that by
   * different routes - this one because nothing bypasses `keepOrEmpty`, that one
   * because a vouched-for private `SQ` is routed into the ordinary `SQ` branches.
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
  /**
   * The Retain/Clean options that were active for this run.
   *
   * **Not a list of what survived.** Attributes Table E.1-1 does not list are
   * kept without appearing anywhere in this field - `(0012,0063)`
   * De-identification Method is the one whose retention is disclosed, and it is
   * disclosed as `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` on
   * {@link DeidentifyReport.warnings}, because it is not an option set.
   */
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
   * **The default is multi-valued, one Value per name, and that is a conformance
   * fix rather than a style choice.** PS3.5 2026c Table 6.2-1 caps an `LO` at
   * **64 characters per Value**, and `(0012,0063)` is `1-n`; the single-value
   * default this replaced measured 76 characters with no options and 272 with
   * all nine, so every run this library ever made wrote a value no `LO` may
   * legally carry. The Profile name is now one Value of 61 characters and each
   * active option is its own, so no option subset can exceed the maximum.
   *
   * **Your string is not bounded here, but it is no longer silent.** A value of
   * your own longer than 64 characters is written through as given - it is
   * yours, and splitting or truncating it would invent a record you did not
   * write - and `report.warnings` carries
   * `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH` to say so. Split it on `\` yourself
   * if a strict receiver is in your path. The same code covers an over-long
   * value the **source file** wrote and this run kept, which in the common case
   * is this library's own 76-character text from a release before the default
   * became multi-valued. The measurement is over **bytes**: a Value of 64 bytes
   * or fewer can never carry more than 64 characters, so it cannot miss one that
   * is genuinely over, but PS3.5 §6.2 specifies the bound in characters rather
   * than bytes and excludes Code Extension escape sequences from the count, so it
   * raises on any conformant Value whose bytes outnumber its counted characters.
   *
   * PS3.15 E.1.1 says this string is "inserted in or added to" the attribute, so
   * a value the incoming Data Set already carried is kept and this one is
   * appended after a `\` as a further value of the `1-n` attribute - the
   * provenance chain, not a replacement.
   *
   * **This string is itself a `1-n` value**: it is split on `\` and only the
   * values not already recorded are added.
   *
   * **Trailing SPACE and NUL are padding, not content** (PS3.5 Table 6.2-1's `LO`
   * row, which describes a **Value** - and `LO` is `1-n`). They are ignored when
   * a value here is matched against one already recorded, **per value, on both
   * sides**, and they are trimmed from the value written. That makes repeated
   * de-identification a fixed point **from the first pass**, for every string:
   * with or without a delimiter, and with a pad byte on any value, last or not.
   * A string that is padding only records nothing. Leading spaces are yours and
   * are written through untouched.
   *
   * One bound, and it is over the value that would be **written**, not over the
   * join: when that value would exceed the largest Value Length an `LO` can
   * encode, the prior value is **replaced** rather than added to - an element the
   * serializer cannot encode would take the whole de-identified object down - and
   * `report.warnings` carries `DICOM_DEIDENT_METHOD_NOT_ADDED`. That includes a
   * prior value already at the ceiling which records this method already, where
   * there is no join to exceed anything. A string longer than that ceiling on its
   * own is not bounded here and will fail to serialize, exactly as it did before
   * this option grew a join.
   *
   * `DICOM_DEIDENT_METHOD_NOT_ADDED` means "the length ceiling was reached", never
   * "every fallback is disclosed": a `(0012,0063)` a file encoded under a VR other
   * than `LO` is also replaced, and that one raises `DICOM_DEIDENT_METHOD_NOT_LO`.
   * Two codes rather than one because the causes are unrelated - the chain outgrew
   * the VR, or the bytes were never in that VR at all - and a prior value that is
   * empty or padding only raises neither, because nothing was lost.
   *
   * When the prior value **is** kept, `report.warnings` carries
   * `DICOM_DEIDENT_METHOD_PRIOR_RETAINED`: `(0012,0063)` is not in Table E.1-1, so
   * nothing in the run inspected or redacted those bytes, and a name a sender
   * wrote there is in output stamped `(0012,0062) = YES`. That code discloses the
   * **retention** only; the **length** of what is written, from whatever source,
   * is disclosed by `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH` and by nothing else.
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

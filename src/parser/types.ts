/**
 * Shared parser-pipeline types for `@cosyte/dicom`.
 *
 * Phase 2 core-parser context:
 *   - D-02 - `ParseOptions` shape (Phase 2 only; no `profile` field).
 *   - D-03 - `OnWarningCallback` ordering contract (invoked AFTER push to `ctx.warnings`).
 *   - D-07 - `DicomPosition` shape (`byteOffset`, optional `fileMeta` / `deflated` / `contextPath`).
 *   - D-45 - `ParseContext.profile?: unknown` is reserved for Phase 6; Phase 2 never sets it.
 *
 * Public types (exported via `src/index.ts`): `DicomPosition`, `ParseOptions`, `OnWarningCallback`.
 * Internal type (NOT exported from `src/index.ts`): `ParseContext`.
 *
 * @module
 */

import type { VR } from "../dictionary/types.js";
import type { ParseFrame } from "./errors.js";
import type { DicomParseWarning, WarningCode } from "./warnings.js";

/**
 * One private-data attribute definition supplied by a {@link Profile}'s
 * private-dictionary overlay. The `vr` resolves the Implicit-VR of a private
 * data element whose on-wire encoding carries no VR; `keyword` / `name` carry
 * the vendor-documented identity for tooling and docs.
 *
 * @example
 * ```ts
 * import type { PrivateTagDefinition } from "@cosyte/dicom";
 * const def: PrivateTagDefinition = {
 *   vr: "OB",
 *   keyword: "CSAImageHeaderInfo",
 *   name: "CSA Image Header Info",
 * };
 * ```
 */
export interface PrivateTagDefinition {
  readonly vr: VR;
  readonly keyword: string;
  readonly name: string;
}

/**
 * A source/vendor tolerance preset (Phase 6). A `Profile` bundles three
 * things that only ever **tighten or annotate** a parse - never loosen it
 * past the Postel's-Law default:
 *
 *  - `escalations` - Tier-2 warning codes promoted to a thrown
 *    `DicomParseError` (a stricter posture for known-unsafe deviations).
 *  - `suppressions` - Tier-2 warning codes silenced because they are a
 *    documented, benign quirk of the named source (annotation, not loss).
 *  - `privateDictionary` - a private-creator-keyed overlay resolving the
 *    Implicit-VR of vendor private data elements via the file's **live**
 *    private-creator string (never a hard-coded block number).
 *
 * Build one with `defineProfile()`; never hand-author the frozen shape.
 * Profiles are immutable and composable via `extends`.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles } from "@cosyte/dicom";
 * const ds = parseDicom(buf, { profile: profiles.siemens });
 * console.log(ds.fileMeta?.transferSyntaxUID);
 * ```
 */
export interface Profile {
  readonly name: string;
  readonly lineage: readonly string[];
  readonly description?: string;
  readonly escalations: ReadonlySet<WarningCode>;
  readonly suppressions: ReadonlySet<WarningCode>;
  /**
   * Creator string → canonical private-tag key (`"GGGGxxEE"`, e.g.
   * `"0029xx10"`) → definition. The `xx` placeholder stands for the
   * file-assigned private block byte, mirroring the published DICOM
   * private-dictionary notation; resolution is therefore by creator string,
   * never by a fixed block number.
   */
  readonly privateDictionary: ReadonlyMap<string, ReadonlyMap<string, PrivateTagDefinition>>;
  /** Render a human-readable, deterministic one-line summary of the profile. */
  readonly describe?: () => string;
}

/**
 * Positional context for a `DicomParseWarning` or `DicomParseError`.
 *
 * **🛑 `byteOffset` IS NOT ALWAYS RELATIVE TO THE SOURCE BUFFER, AND THIS
 * JSDOC SAID IT WAS.** For the Deflated Explicit VR LE transfer syntax (D-27),
 * `deflated: true` says the offset indexes the inflated dataset buffer rather
 * than the on-disk source. That flag is the only frame this type carries, and
 * it is not the only frame this parser has: a defined-length Sequence Item is
 * parsed from a **slice**, so a warning raised inside one carries an
 * item-relative offset with nothing on the position to say so. The same is true
 * of `Element.byteOffset`, and has been since the parser was written.
 *
 * **The residual is `PRE-EXISTING` and is not closed here.** What is closed is
 * the thrown side: `DicomParseError.offsetFrame` names the coordinate system
 * from a closed set (see `OFFSET_FRAMES`), and that covers a Tier-3 fatal and
 * the `{ strict: true }` escalation of a Tier-2 warning. It does not reach a
 * warning on the lenient path, which is this type. Do not read the fatal's
 * frame contract as one this type has.
 *
 * With `exactOptionalPropertyTypes: true`, callers should omit unset keys
 * rather than passing `undefined` (mirrors `@cosyte/hl7` sibling discipline).
 *
 * @example
 * ```ts
 * import type { DicomPosition } from "@cosyte/dicom";
 * const p: DicomPosition = { byteOffset: 132, fileMeta: true };
 * ```
 */
export interface DicomPosition {
  readonly byteOffset: number;
  /** True when offset is inside the File Meta group. Omit (do not pass `undefined`) when not applicable. */
  readonly fileMeta?: boolean;
  /** True when offset is into the inflated dataset buffer (Deflated TS only). Omit when not applicable. */
  readonly deflated?: boolean;
  /** Tag chain for nested SQ items, e.g. `["0040A730", "0", "00080100"]`. Omit when at root. */
  readonly contextPath?: readonly string[];
}

/**
 * Synchronous callback invoked once per Tier-2 warning emitted during parse.
 *
 * Per `02-CONTEXT.md` D-03, the callback fires AFTER the warning has been
 * pushed to `ctx.warnings`; if the callback throws, the parser silently
 * swallows the exception and continues (mirrors `@cosyte/hl7` sibling).
 *
 * @example
 * ```ts
 * import type { OnWarningCallback } from "@cosyte/dicom";
 * const onWarning: OnWarningCallback = (w) => {
 *   if (w.code === "DICOM_MISSING_PREAMBLE") {
 *     // ...
 *   }
 * };
 * ```
 */
export type OnWarningCallback = (warning: DicomParseWarning) => void;

/**
 * Options accepted by `parseDicom`.
 *
 * Per `02-CONTEXT.md` D-02 - Phase 2 form only. No `profile` field; Phase 6
 * adds it. With `exactOptionalPropertyTypes: true`, callers omit unset keys
 * rather than passing `undefined` for any field below.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf, {
 *   strict: false,
 *   stripPreamble: "tolerate",
 *   copyValues: false,
 *   onWarning: (w) => console.warn(w.code),
 * });
 * ```
 */
export interface ParseOptions {
  /**
   * When `true`, every Tier-2 warning is escalated to a thrown
   * `DicomParseError` carrying the warning code. Default `false`.
   *
   * 🛑 **THE ESCALATED DIAGNOSTIC CARRIES SOURCE BYTES THAT THE WARNING DOES
   * NOT.** A `DicomParseWarning.message` is a frozen registry string with only
   * structural tokens filled in: `{tag}` renders only a tag PS3.6's element
   * registry carries a literal row for, `{vr}` only one of the 34 VRs PS3.5
   * section 6.2 defines, and a raw length or byte value a header carries is
   * bound out of the factory signature rather than rendered. That now holds on
   * the `deidentify()` codes too:
   * `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` and
   * `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` rendered `Element.rawBytes.length`
   * through `0.0.14`, which equals the declared Value Length and was reachable
   * from a fabricated header, and both slots are gone. So is
   * `DICOM_ITEM_CROSSES_SEQUENCE_END`'s remaining-bytes count, because **a raw
   * number shifted by a constant the reader can compute is that raw number**: it
   * was the enclosing sequence's declared Value Length less the bytes of that
   * sequence already consumed. **The exceptions are named in one place that is
   * not a record of a past change, and are deliberately not restated here** -
   * the `WARNING_MESSAGES` docblock in `./warnings.ts`, which this JSDoc used to
   * carry a copy of.
   * **This is a statement about `w.message` and about nothing else**: the two
   * byte counts still exist on `report.undefinedVrElements[].byteLength` and
   * `report.unauditableSequences[].byteLength`, model fields on a type whose own
   * docs say it is not a value-free surface. **No
   * safe-to-log verdict is stated here** - that sentence was corrected twice and
   * is deleted rather than tried a third time; the mechanism is above and the
   * treatment is in the package's troubleshooting docs. The `DicomParseError`
   * this option raises in its place is a different and larger surface: it also
   * carries `snippet`,
   * **16 raw bytes, unredacted** (D-10), read at the warning's own `byteOffset`.
   * A message-only PHI review of the lenient path therefore does not transfer to
   * the strict one. Log `err.code`, `err.byteOffset`, `err.offsetFrame` and
   * `err.message`; treat `err.snippet` as PHI.
   *
   * **The snippet is cut in the SAME FRAME the `byteOffset` is counted in**, so
   * it is the bytes at the offset the diagnostic names: file-absolute at the
   * root, relative to the enclosing slice inside a defined-length Sequence or
   * Item, and into the inflated stream under Deflated Explicit VR LE. It was not
   * always: until `DICOM-FATAL-MESSAGE-REGISTRY` the offset moved with the frame
   * while the cut was always taken from the whole file, so inside a
   * defined-length Item the 16 bytes were **an unrelated element's** - a
   * diagnostic disclosing data from a part of the document the reader was never
   * asked about. That is closed. **What is NOT closed, and never was a defect:
   * the bytes are still raw source bytes.** Reading them as safe because the
   * message beside them is registry-bound is the mistake this whole paragraph
   * exists to prevent.
   *
   * **`byteOffset` NOW CARRIES A FRAME-OF-REFERENCE CONTRACT, AND IT IS A NAME
   * AND NOT AN ORIGIN.** `err.offsetFrame` says which of three coordinate
   * systems the number is counted in (`OFFSET_FRAMES`), so a consumer can tell a
   * root offset from an Item-relative one instead of guessing. **A nested offset
   * is still not a key you can look up against the root**, and it is not made
   * into one here: where a slice begins is deliberately unpublished, because the
   * distance between two frames is a declared Value Length off the wire. The
   * escalated warning's own `position` is unchanged and still carries no frame
   * beyond `deflated` - see `DicomPosition`.
   *
   * Omit (do not pass `undefined`) to use the default.
   */
  readonly strict?: boolean;
  /**
   * Preamble policy:
   *   - `"tolerate"` (default): attempt to start at offset 0 if `DICM` magic
   *     is missing at offset 128; emit `DICOM_MISSING_PREAMBLE`.
   *   - `"require"`: throw `DicomParseError(NOT_DICOM_PART_10)` when no
   *     `DICM` magic is present.
   *
   * Omit to use the default.
   */
  readonly stripPreamble?: "tolerate" | "require";
  /**
   * Synchronous callback invoked once per Tier-2 warning, after the warning
   * has been pushed to `Dataset.warnings`. Throwing handlers are silently
   * swallowed (parser-state safety per D-03).
   *
   * Omit to skip the callback entirely.
   */
  readonly onWarning?: OnWarningCallback;
  /**
   * When `true`, every `Element.rawBytes` is `Buffer.from(slice)` - copying
   * each value out so the source buffer can be released. When `false` (the
   * default), `Element.rawBytes` is `Buffer.subarray(slice)` - a zero-copy
   * view that pins the source ArrayBuffer until every Element is GC'd.
   *
   * Per D-16 / MODEL-03. Omit to use the default.
   */
  readonly copyValues?: boolean;
  /**
   * Source/vendor tolerance preset (Phase 6, D-45). Applies the profile's
   * `escalations` / `suppressions` to warning emission and its
   * `privateDictionary` to Implicit-VR resolution of private data elements.
   * A profile only tightens or annotates - it never makes the default
   * lenient parse throw outside the four Tier-3 fatals, and a private
   * creator the profile does not recognize degrades to generic UN handling
   * plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning, never a wrong decode.
   *
   * Omit (do not pass `undefined`) for the unprofiled default behaviour.
   */
  readonly profile?: Profile;
}

/**
 * Internal pipeline state threaded through every parser stage.
 *
 * Not exported from `src/index.ts`. Phase 6 will populate the `profile`
 * field reserved here per D-45; Phase 2 always leaves it absent.
 *
 * @internal
 */
export interface ParseContext {
  /**
   * **The CURRENT frame: the buffer this frame's byte offsets index into, and
   * the name of the coordinate system they are counted in.** Not the file.
   *
   * It has two readers, both in `makeEmitter`: `frame.buffer` is what the
   * `{ strict: true }` escalation's 16-byte `snippet` is cut from at the
   * warning's own `position.byteOffset`, and `frame.name` is what the thrown
   * `DicomParseError` publishes as `offsetFrame`. Every Tier-3 fatal factory
   * takes the same object for the same two reasons. That is the whole reason
   * it is mutable: an offset, the bytes cut at it and the name of its frame
   * all have to agree, and this parser changes frame in four places.
   * `parseDeflatedLE` recognized that first and swaps in the inflated stream;
   * `parseSequence`, `tryParseDefinedLengthSQ` and `tryParseUnAsSQ` hand a
   * descent a **slice**, so they swap too and restore in a `finally`, exactly
   * as they already do for {@link ParseContext.creators} and
   * {@link ParseContext.currentCharset}.
   *
   * **🛑 IT WAS THE FILE EVERYWHERE UNTIL `DICOM-FATAL-MESSAGE-REGISTRY`, AND
   * THAT MADE THE SNIPPET RETURN AN UNRELATED ELEMENT'S BYTES.** A warning
   * raised inside a defined-length Sequence Item carries an item-relative
   * offset, so cutting the file at it returned whatever happened to sit at that
   * offset from byte 0 - a diagnostic handing back data from somewhere the
   * reader never looked. Do not "simplify" this back to a `readonly` field
   * holding the whole input: the swap is what keeps the offset and the bytes
   * talking about the same element.
   *
   * **🛑 AND DO NOT SPLIT IT BACK INTO TWO FIELDS.** The name was absent
   * entirely until the tenth instance of `DICOM-DIAGNOSTIC-PHI-RESIDUALS`, and
   * a `buffer` beside a `frameName` is the same defect one step removed: two
   * assignments where a frame change is one fact, so a future swap site can
   * move the bytes and leave the label behind. {@link ParseFrame} closes that
   * OMISSION mode and only that one: a deliberately mismatched pair is still
   * writable, a graded pass built one, and this must not be described as making
   * a disagreement inexpressible.
   */
  frame: ParseFrame;
  readonly strict: boolean;
  readonly stripPreamble: "tolerate" | "require";
  readonly onWarning?: OnWarningCallback;
  readonly warnings: DicomParseWarning[];
  /**
   * Group → block-id (low byte `0x10..0xFF`) → creator string for **the Data
   * Set currently being parsed**. Populated as Private Creator elements
   * `(gggg,00XX)` are seen during parse. Phase 2's private-creator stack
   * tracking lives here (D-33).
   *
   * **Mutable, and per Data Set rather than per parse.** PS3.5 section 7.5.1
   * says "Each Item Value shall contain a DICOM Data Set composed of Data
   * Elements", and section 7.8.1's block reservation is a statement about the
   * Data Set the Private Creator Data Element appears in. `parseSequence`
   * therefore swaps a fresh map in for each Sequence Item and restores the
   * enclosing Data Set's map on the way out, exactly as it already does for
   * {@link ParseContext.currentCharset}. One map for the whole parse resolves
   * a block number to whichever creator was seen last at any depth, and that
   * feeds `resolveImplicitVR`: the failure is a wrong VR, a mis-decoded value.
   */
  creators: Map<number, Map<number, string>>;
  /**
   * Sequence-encoding stack - the top entry determines FFFE-marker semantics
   * per D-28. Initial stack is `["Root"]`.
   */
  readonly encodingContextStack: Array<"Root" | "SqItem" | "EncapsulatedPixelData">;
  /**
   * Hard-cap counter - incremented on SQ descent, decremented on ascent.
   * Plan 02-04 enforces a depth cap; Phase 2-06 adds the overflow security
   * test (T-02-01-07).
   */
  nestingDepth: number;
  /**
   * The `(0008,0005)` Specific Character Set terms resolved so far during
   * this parse, threaded onto each `Element` so Phase 3 text decoders can
   * honour the dataset's charset. Mutable: set when `(0008,0005)` is read,
   * inherited into SQ items and restored per-item by `parseSequence`.
   * `undefined` means the Default Repertoire (ISO_IR 6).
   */
  currentCharset?: readonly string[];
  /**
   * Active source/vendor {@link Profile} (Phase 6, D-45). Threaded from
   * `ParseOptions.profile`. When absent the parse is unprofiled (the Phase 2
   * baseline). Consulted by the emitter (escalations / suppressions) and by
   * Implicit-VR private-tag resolution (private-dictionary overlay).
   */
  readonly profile?: Profile;
  /**
   * When `true`, `Element.rawBytes` is `Buffer.from(slice)` (copy); when
   * `false` (default), `Buffer.subarray(slice)` (view). Per D-16.
   */
  readonly copyValues: boolean;
}

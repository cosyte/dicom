/**
 * Tier-2 warning registry and factories for the `@cosyte/dicom` parser
 * pipeline.
 *
 * Phase 2 core-parser context:
 *   - D-08 - `WARNING_CODES` is a frozen `as const` registry with every code
 *     in the TOL-03 catalog (≥25 entries). Phase 2 actively emits 13;
 *     7 VR-decode-time codes are reserved for Phase 3; 2 charset codes are
 *     reserved for Phase 4; 2 codes are reserved for Phase 6 / Phase 7.
 *   - D-12 - Exactly one named factory per actively-emitted code; each
 *     factory carries its own JSDoc + `@example` and returns a typed
 *     `DicomParseWarning`.
 *
 * Consumers compare `warning.code === WARNING_CODES.<CODE>` to narrow and
 * react; the parser uses the factories here so message templates, payload
 * shape, and positional context stay consistent across stages.
 *
 * @module
 */

import type { Tag, VR } from "../dictionary/types.js";
import { renderTag, renderVr } from "./tokens.js";
import type { DicomPosition } from "./types.js";

/**
 * Stable string codes for every Tier-2 warning the parser may emit.
 *
 * The registry is frozen via `as const` so TypeScript infers the exact
 * string-literal union for `WarningCode` - there is zero runtime cost and
 * no magic-string comparisons for consumers. Reserved-but-not-emitted
 * codes carry inline comments documenting which phase activates them
 * (Phase 2 declares the union so the schema is stable for downstream
 * phases per D-08, D-42, D-43).
 *
 * @example
 * ```ts
 * import { parseDicom, WARNING_CODES } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * if (ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE)) {
 *   // handle bare File Meta input
 * }
 * ```
 */
export const WARNING_CODES = {
  // === Phase 2 actively emits (D-08 active list - alphabetical-within-prefix per CONTEXT specifics §) ===
  DICOM_DUPLICATE_FILE_META_ELEMENT: "DICOM_DUPLICATE_FILE_META_ELEMENT",
  DICOM_DUPLICATE_TAG_IN_DATA_SET: "DICOM_DUPLICATE_TAG_IN_DATA_SET",
  DICOM_EMPTY_ITEM_IN_SEQUENCE: "DICOM_EMPTY_ITEM_IN_SEQUENCE",
  DICOM_FILE_META_GROUP_LENGTH_MISMATCH: "DICOM_FILE_META_GROUP_LENGTH_MISMATCH",
  DICOM_FILE_META_GROUP_LENGTH_MISSING: "DICOM_FILE_META_GROUP_LENGTH_MISSING",
  DICOM_GROUP_LENGTH_IN_DATASET: "DICOM_GROUP_LENGTH_IN_DATASET",
  DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR: "DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR",
  DICOM_ITEM_CROSSES_SEQUENCE_END: "DICOM_ITEM_CROSSES_SEQUENCE_END",
  DICOM_MISSING_PREAMBLE: "DICOM_MISSING_PREAMBLE",
  DICOM_NONZERO_RESERVED_BYTES: "DICOM_NONZERO_RESERVED_BYTES",
  DICOM_ODD_LENGTH_VALUE_PADDED: "DICOM_ODD_LENGTH_VALUE_PADDED",
  DICOM_PIXEL_DATA_LENGTH_MISMATCH: "DICOM_PIXEL_DATA_LENGTH_MISMATCH",
  DICOM_PRIVATE_TAG_NO_CREATOR: "DICOM_PRIVATE_TAG_NO_CREATOR",
  DICOM_SQ_NOT_DESCENDED: "DICOM_SQ_NOT_DESCENDED",
  DICOM_UN_PARSED_AS_SQ: "DICOM_UN_PARSED_AS_SQ",
  DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR: "DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR",
  DICOM_VR_MISMATCH: "DICOM_VR_MISMATCH",

  // === VR-decode-time codes (declared but not emitted in Phase 2; Phase 3 lazy decoders fire these - D-08, D-42) ===
  DICOM_BOM_IN_TEXT_VR: "DICOM_BOM_IN_TEXT_VR",
  DICOM_DA_LEGACY_FORMAT: "DICOM_DA_LEGACY_FORMAT",
  DICOM_DT_NONSTANDARD_OFFSET: "DICOM_DT_NONSTANDARD_OFFSET",
  DICOM_IS_NONINTEGER_VALUE: "DICOM_IS_NONINTEGER_VALUE",
  DICOM_NON_ASCII_IN_ASCII_VR: "DICOM_NON_ASCII_IN_ASCII_VR",
  DICOM_TRAILING_NULL_IN_TEXT_VR: "DICOM_TRAILING_NULL_IN_TEXT_VR",
  DICOM_UI_TRAILING_SPACE: "DICOM_UI_TRAILING_SPACE",

  // === Phase 4 charset-decode codes (declared, not emitted in Phase 2 - D-08, D-43) ===
  DICOM_CHARSET_AMBIGUOUS_SEPARATOR: "DICOM_CHARSET_AMBIGUOUS_SEPARATOR",
  DICOM_UNSUPPORTED_CHARSET: "DICOM_UNSUPPORTED_CHARSET",

  // === Reserved by later phases (declared, not emitted in Phase 2) ===
  DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED: "DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED", // reserved by Phase 7 - not emitted in Phase 2
  DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED: "DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED", // emitted by deidentify(), never by the parser
  DICOM_DEIDENT_METHOD_NOT_ADDED: "DICOM_DEIDENT_METHOD_NOT_ADDED", // emitted by deidentify(), never by the parser
  DICOM_DEIDENT_METHOD_NOT_LO: "DICOM_DEIDENT_METHOD_NOT_LO", // emitted by deidentify(), never by the parser
  DICOM_DEIDENT_METHOD_PRIOR_RETAINED: "DICOM_DEIDENT_METHOD_PRIOR_RETAINED", // emitted by deidentify(), never by the parser
  DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE: "DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE", // emitted by deidentify(), never by the parser
  DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE: "DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE", // emitted by deidentify(), never by the parser
  DICOM_PRIVATE_CREATOR_UNKNOWN: "DICOM_PRIVATE_CREATOR_UNKNOWN", // reserved by Phase 6 - not emitted in Phase 2
} as const;

/**
 * Discriminant type for `DicomParseWarning.code`. Narrowing a warning by
 * this code lets consumers write exhaustive `switch` blocks (enabled by
 * the `switch-exhaustiveness-check` lint rule) and guarantees a typo-free
 * comparison against the `WARNING_CODES` registry.
 *
 * @example
 * ```ts
 * import type { DicomParseWarning, WarningCode } from "@cosyte/dicom";
 * function describe(w: DicomParseWarning): string {
 *   const code: WarningCode = w.code;
 *   if (code === "DICOM_MISSING_PREAMBLE") return "preamble missing";
 *   return `warning: ${code}`;
 * }
 * ```
 */
export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

/**
 * Data shape for every Tier-2 warning emitted by the parser. Warnings are
 * plain data (distinct from `DicomParseError`, which is a thrown `Error`
 * subclass) so they can be safely accumulated into `Dataset.warnings` and
 * passed to `onWarning` callbacks.
 *
 * Per D-07 there is intentionally NO `snippet` field on warnings:
 * real-world files routinely produce 50+ warnings and a per-warning
 * snippet would balloon retained memory. Snippets appear only on
 * `DicomParseError` (the strict-mode escalation path).
 *
 * @example
 * ```ts
 * import type { DicomParseWarning } from "@cosyte/dicom";
 * const w: DicomParseWarning = {
 *   code: "DICOM_MISSING_PREAMBLE",
 *   message: "No DICM magic at offset 128.",
 *   position: { byteOffset: 0 },
 * };
 * ```
 */
export interface DicomParseWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly position: DicomPosition;
}

/**
 * The frozen message registry: one entry per {@link WarningCode}, and the only
 * place a warning's prose exists.
 *
 * **This is the whole PHI control, and it is structural rather than a
 * discipline.** The audited defect across the `@cosyte/*` parsers had exactly
 * one distinguishing property: *does the warning factory take a value parameter
 * at all?* Everything that leaked did; `astm`, `transform` and `fhir`, the three
 * that were genuinely prevented, do not. So no factory below accepts a string
 * read out of the document. A template's only substitutions are
 * {@link WarningTokens}, whose fields are a `Tag`, a `VR` and numbers - each
 * either composed by this parser or checked against a closed set before it is
 * rendered, so a document byte has no path into a message even if a future call
 * site passes one by mistake.
 *
 * A token a check refuses renders as {@link WITHHELD} rather than being echoed
 * or dropped, so a message never silently loses a field it claims to carry.
 *
 * **🛑 THE `{n}` SLOTS ARE NOT ALL ALIKE, AND THE RULE THAT SEPARATES THEM IS THE
 * ONE THIS REGISTRY LOST A DEFECT TO.** A number may be rendered when this parser
 * **derived** it - a count it kept, an offset it counted, a remainder the buffer
 * bounds. A number it read **verbatim out of a header it may be reading out of
 * frame** is four (or one) document bytes wearing a decimal, reversible with one
 * typed read, and the bound available for it is the factory signature rather
 * than a check: a raw number has neither a shape nor a membership to test.
 * `renderTag` and `renderVr` are checks; there is no `renderLength` and there
 * must not be one.
 *
 * **🔴 THE RULE IS NOT UNIFORMLY APPLIED, AND SAYING SO IS THE POINT - A GRADED
 * PASS REFUSED THE DRAFT THAT STATED IT AS AN ABSOLUTE.** The exceptions are
 * named rather than counted, because a count in prose is the thing this package
 * deletes:
 *
 * - {@link fileMetaGroupLengthMismatch}'s `{n}` is a raw declared length and
 *   stays, because `parseFileMeta` reads it in a frame nothing can
 *   desynchronize. Its own JSDoc carries the argument and the measurement.
 * - **🔴 {@link itemCrossesSequenceEnd}'s `{n2}` IS A SECOND ONE, `PRE-EXISTING`,
 *   AND A DRAFT OF THIS BULLET SAID IT WAS NOT.** It is `endLimit -
 *   cursor.position`, and `endLimit` is the **enclosing Sequence's declared
 *   Value Length off its own header**, so it is that declared length minus the
 *   reporting Item's offset into the sequence value. For the FIRST Item that
 *   offset is the 8-byte Item header PS3.5 7.5.1 fixes, so one addition on a
 *   published constant reverses it; for a later Item the subtrahend is larger
 *   and the render discloses correspondingly less. Measured on a name-bearing payload, with the same reachable
 *   length class this slice established: a `SQ` whose length field reads
 *   `"SO\0\0"` renders `20299`, and `20299 + 8 = 20307 = readUInt32LE("SO\0\0")`.
 *   It tracks - `"ON\0\0"` renders `20039` for `20047`, `"TH\0\0"` renders
 *   `18508` for `18516` - and the parse **survives**, so it reaches
 *   `Dataset.warnings` and not only `onWarning`. Binding it is a behaviour
 *   change on a leak this slice did not introduce, so it is disclosed here and
 *   in {@link itemCrossesSequenceEnd}, and asserted by a row in
 *   `test/integration/explicit-sq-item-bound.test.ts` that is green on both
 *   trees.
 * - {@link embeddedAttributeRemoved}'s `{n}` is how many whole Data Elements the
 *   embedded-attribute scanner counted inside a value, {@link
 *   pixelDataLengthMismatch}'s `{n2}` is a size this parser multiplied out of
 *   the image description attributes, {@link unsupportedCharset}'s `{n}` is a
 *   value index, and {@link undefinedVrNotAuditable}'s `{n2}` is a byte offset.
 *   **No sentence here says that list is exhaustive**: a draft wrote "every one
 *   of those is a number this parser produced; none is read out of a header"
 *   over exactly the slot above and a graded pass refuted it in one measurement.
 *   The list is what has been measured, not a clearance.
 *
 * **{@link undefinedVrNotAuditable} and {@link sequenceNotAuditable} used to be
 * on the exception list and are not any more.** Their `{n}` was
 * `Element.rawBytes.length` - the declared Value Length for a value-only
 * element, declared-plus-header for a full-span one (`isFullSpanElement`), and
 * document-derived either way, so a fabricated header carrying `"SO\0\0"`
 * rendered `20307`. Both slots are bound out of the factory signatures now. The
 * numbers still exist on `report.unauditableSequences[].byteLength` and
 * `report.undefinedVrElements[].byteLength`, which are **model fields on a type
 * whose own docs say it is not a value-free surface** - a different surface from
 * a registry message, and deliberately not changed here.
 *
 * Two codes are declared and never emitted by this build:
 * `DICOM_CHARSET_AMBIGUOUS_SEPARATOR` and `DICOM_PIXEL_DATA_LENGTH_MISMATCH`.
 * They still carry a registry entry so the record stays total over
 * `WarningCode`, which is what makes "every message comes from here" checkable
 * by the type system rather than by reading.
 */
export const WARNING_MESSAGES: Readonly<Record<WarningCode, string>> = Object.freeze({
  DICOM_MISSING_PREAMBLE: "No DICM magic at offset 128; falling back to offset-0 dataset.",
  DICOM_FILE_META_GROUP_LENGTH_MISSING:
    "(0002,0000) FileMetaInformationGroupLength missing; scanning forward to first non-(0002,xxxx) element.",
  DICOM_FILE_META_GROUP_LENGTH_MISMATCH:
    "(0002,0000) FileMetaInformationGroupLength declared {n} bytes; actual File Meta group size is {n2} bytes. Trusting actual.",
  DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR:
    "Element ({tag}) uses undefined length (0xFFFFFFFF) under an Explicit VR transfer syntax.",
  // The declared length is gone from this string and the reason is measured, not
  // cautious: this code fires on ANY element header, including one a lying Value
  // Length upstream composed out of somebody's value, and it then rendered four
  // payload bytes as {tag} and four more as the decimal {n} - eight consecutive
  // bytes of a name in one message. See `oddLengthValuePadded`.
  DICOM_ODD_LENGTH_VALUE_PADDED:
    "Element ({tag}) has an odd declared length; cursor advanced by one padding byte to maintain alignment. The declared length is withheld; the byte offset identifies the element.",
  DICOM_VR_MISMATCH:
    "Element ({tag}) on-wire VR is {vr2}; dictionary lists {vr}. Trusting on-wire VR.",
  // No tag, and the reason is the one `nonzeroReservedBytes` states: this code's
  // three siblings below fire only on an ODD group, and an odd group is the one
  // class of tag no closed table this library holds can ever vouch for. See
  // `privateTagNoCreator`.
  DICOM_PRIVATE_TAG_NO_CREATOR:
    "A private element has no Private Creator registered for its block; treating as VR=UN. Its tag is withheld; the byte offset identifies the element.",
  // No tag, and it is the membership bound in `renderTag` that made the slot
  // dead rather than a judgement here: this code fires on a (gggg,0000), the
  // element number is a constant of the code, and PS3.6 carries a literal row
  // for exactly one such tag - (0002,0000), which is File Meta and never
  // reaches this code. So every tag this slot could ever have rendered was one
  // no closed table names, leaving the group number as sixteen free bits of a
  // header that may itself be fabricated. See `groupLengthInDataset`.
  DICOM_GROUP_LENGTH_IN_DATASET:
    "A retired Group Length element (gggg,0000) was encountered in the dataset; preserved as-is. Its group number is withheld; the byte offset identifies the element.",
  // The tag is deliberately absent, and this is the only *parser* message where
  // that is true. See `nonzeroReservedBytes`. Kept terse for the same reason the
  // de-identify messages are: it is emitted once per element, and element count
  // is attacker-chosen.
  // 🩺 THE TWO BYTE VALUES ARE GONE FOR THE REASON THE TAG WAS ALREADY GONE, AND
  // LEAVING THEM MADE THAT BOUND HALF A BOUND. This code's trigger is "these two
  // bytes are not what PS3.5 7.1.2 says they must be", so the header may not be
  // a header - and then the reserved pair is two bytes from inside some
  // element's value, printed as two decimals that reverse with no work at all.
  // Measured on a name-bearing payload across six under-declare deltas. See
  // `nonzeroReservedBytes`.
  DICOM_NONZERO_RESERVED_BYTES:
    "Non-zero reserved bytes between VR and length; ignoring. Their two values are withheld with the tag; the byte offset identifies the element.",
  DICOM_SQ_NOT_DESCENDED:
    "Element ({tag}) resolved to VR=SQ from the dictionary but its defined-length value is not a valid item stream; kept as opaque bytes and NOT descended, so nothing nested inside it is visible to navigation, and deidentify() cannot audit it. See DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE.",
  DICOM_UN_PARSED_AS_SQ:
    "Element ({tag}) has VR=UN with undefined length; descended as Implicit VR LE sequence per CP-246.",
  DICOM_EMPTY_ITEM_IN_SEQUENCE: "Sequence ({tag}) contains an empty item (length=0); tolerated.",
  // Neither the tag nor the replaced element's value is here, and the tag's
  // absence is specific to this code rather than caution. See
  // `duplicateTagInDataSet`. Short by measurement rather than by intention: one
  // is raised per collision and the collision count is chosen by the input, so a
  // 400-character draft was measured at 50 M characters over a 1 MiB file and
  // cut. The reasoning lives in the factory's JSDoc, not in the string.
  DICOM_DUPLICATE_TAG_IN_DATA_SET:
    "A Data Element carrying a tag this Data Set already holds replaced the earlier one at this byte offset; that element's value is not in the parsed object. PS3.5 7.1 and 7.5.1. Tag withheld.",
  // The tag is deliberately absent for the same reason as the code above, and
  // the surviving copy is named because the File Meta group resolves a repeat
  // the OPPOSITE way round to a Data Set: first copy wins here, last read wins
  // there. Short for the same measured reason - one is raised per repeat and the
  // repeat count is chosen by the input.
  // 🛑 NO SPEC CITATION HERE, AND ITS ABSENCE IS DELIBERATE. A draft ended this
  // string "PS3.5 7.1.", which asserts that section's "at most once in a Data
  // Set" governs the File Meta group - the applicability this slice states it
  // cannot establish, because PS3.10 governs that group and is not vendored
  // here. Under `{ strict: true }` this string is also the thrown message, so an
  // unqualified citation there is the claim, not a footnote. Do not put it back.
  DICOM_DUPLICATE_FILE_META_ELEMENT:
    "A File Meta Data Element repeats a (0002,xxxx) tag the group already carries; the copy at this byte offset is not in the parsed File Meta, and the FIRST copy of that tag is the one projected. Tag withheld.",
  // No value and no length: the prior value is the file's own text. The tag is a
  // constant of this code rather than composed from input, as in the two
  // (0002,0000) messages above.
  DICOM_DEIDENT_METHOD_NOT_ADDED:
    "The De-identification Method this run recorded could not be added beside the value (0012,0063) already carried without exceeding the largest Value Length that VR can encode, so the earlier value was replaced (PS3.15 E.1.1). The replaced text is not in the output.",
  // No value, no length AND NO VR. The VR is two bytes read from the file, and a
  // fabricated header makes those two bytes document content - the shape that
  // put "ITHS" into DICOM_NONZERO_RESERVED_BYTES. Naming the VR here would read
  // as harmless and is exactly the same defect.
  DICOM_DEIDENT_METHOD_NOT_LO:
    "The (0012,0063) value the source file carried is encoded under a Value Representation other than LO, which is not a De-identification Method this run can add its own text to (PS3.15 E.1.1), so the earlier value was replaced. The replaced text is not in the output. The text and the VR are both withheld from this message.",
  // No value and no length, for the same reason as the code above: the retained
  // text is the file's own. The tag is a constant of this code.
  DICOM_DEIDENT_METHOD_PRIOR_RETAINED:
    "A De-identification Method (0012,0063) value the source file already carried was kept beside the one this run recorded, as PS3.15 E.1.1 requires. That attribute is not in Table E.1-1, so no rule in this run inspected, audited or redacted those bytes: if the sender wrote identifying text there it is in the de-identified output, under (0012,0062) = YES. The text is withheld from this message.",
  // The Item's own declared length is deliberately absent. See
  // `itemCrossesSequenceEnd`; `{n2}` stays because the emit site's
  // `endLimit < buffer.length` conjunct bounds it by the buffer.
  DICOM_ITEM_CROSSES_SEQUENCE_END:
    "Item ({tag}) declares a length reaching past its enclosing sequence's declared end, so it reads the enclosing Data Set's bytes; {n2} bytes remained inside the sequence. The file's two length fields disagree (PS3.5 7.5.1 and 7.5.2 govern them); the item's is used. The declared length is withheld; the byte offset locates the item.",
  // Declared but not emitted by this build. The declared length is bound out
  // anyway: it is a raw 32-bit read off a header, so activating this code later
  // with the slot still here would ship the leak this slice closed one code
  // over. `{n2}` stays - it is the product this parser computed from the image
  // description attributes, not a number it read. The tag is a constant.
  DICOM_PIXEL_DATA_LENGTH_MISMATCH:
    "(7FE0,0010) PixelData declared length does not match the computed {n2} bytes. The declared length is withheld; the byte offset identifies the element.",
  DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR:
    "A private element under Implicit VR LE has no VR override; falling back to UN. Its tag is withheld; the byte offset identifies the element.",
  DICOM_PRIVATE_CREATOR_UNKNOWN:
    "A private element has a Private Creator the active profile's private dictionary does not name; falling back to UN. The creator string is not reproduced here - read the (gggg,00EE) element if you need it. Its tag is withheld; the byte offset identifies the element.",
  DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED:
    "Pixel Data is present and Burned In Annotation is not 'NO'; this metadata-only de-identifier cannot inspect or clean pixels. Recognizable text may remain burned into the image.",
  DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED:
    "Element ({tag}) {vr} was kept by the action table, but its value ends with {n} whole Data Element(s) - an over-declared Value Length swallowed what followed it. Emptied rather than kept, because the action table cannot see an attribute encoded inside a value. report.embeddedAttributes names the ones this run acts on that also have a literal Table E.1-1 row, which may be none of them.",
  // Deliberately short. One of these is raised per un-auditable element, so a
  // long message is multiplied by an element count the input controls; the
  // reasoning belongs in the docs, not in a string repeated thousands of times.
  // 🛑 IT DOES NOT SAY "is VR=SQ", AND THAT IS NOT A WORDING PREFERENCE. One of
  // its two producers is an element the profile declares a Sequence while the
  // wire says UN or OB, so naming a VR here would state a fact about the file
  // that the file contradicts - on the one channel this class designates.
  // The recorded byte count is gone from this string, and the reason is the same
  // one that took the declared length out of `DICOM_ODD_LENGTH_VALUE_PADDED`:
  // `Element.rawBytes.length` EQUALS the Value Length off the element header, so
  // when that header is fabricated the decimal is four document bytes. See
  // `sequenceNotAuditable`. `report.unauditableSequences[].byteLength` still
  // carries it, on a type documented as not value-free.
  DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE:
    "Element ({tag}) is a Sequence carrier with no parsed items, so its recorded bytes could not be audited (PS3.15 E.1.1); emptied. The byte count is withheld; see report.unauditableSequences.",
  // Deliberately short for the same reason as the code above: one per element,
  // and the element count is chosen by the input.
  //
  // NEITHER THE TAG NOR THE VR NOR THE BYTE COUNT IS ECHOED, and that is
  // specific to this code rather than caution. Every other factory's {tag} is
  // composed from a real Data Element header; the condition that raises THIS one
  // is that the header was fabricated from bytes inside some element's value, so
  // its four tag bytes, its two VR bytes AND its four length bytes are document
  // content. `renderTag` is a membership test against PS3.6's registry and would
  // refuse this one - but a slot that has to rely on that is a slot a future
  // call site can still be handed, so the withholding stays at the call site
  // where it does not depend on a table. The length had no table to fall back on
  // at all: the message withheld the two fields a renderer could check and then
  // printed the one it could not, which is the shape this code was already
  // written to refuse.
  // The byte offset locates the element instead, and is a position this parser
  // counted rather than anything the document said.
  DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE:
    "An element at byte offset {n2} carries an on-wire VR that is not one of the 34 PS3.5 6.2 defines, so its value bytes are not a Value Field this library decoded; emptied (PS3.15 E.1.1). Its tag, VR and byte count are withheld: an earlier under-declared length can make them fragments of some element's value. See report.undefinedVrElements.",
  DICOM_BOM_IN_TEXT_VR: "Element ({tag}) {vr} value begins with a UTF-8 BOM; stripped on decode.",
  DICOM_TRAILING_NULL_IN_TEXT_VR:
    "Element ({tag}) {vr} value has a trailing NULL pad where SPACE is expected; trimmed.",
  DICOM_UI_TRAILING_SPACE:
    "Element ({tag}) UI value is SPACE-padded; UI requires NULL padding (PS3.5 §6.2). Trimmed.",
  DICOM_NON_ASCII_IN_ASCII_VR:
    "Element ({tag}) {vr} is an ASCII-only VR but contains non-ASCII bytes; decoded as Latin-1 best-effort.",
  DICOM_IS_NONINTEGER_VALUE:
    "Element ({tag}) IS value is not a base-10 integer; surfaced as null with raw bytes preserved.",
  DICOM_DA_LEGACY_FORMAT:
    "Element ({tag}) DA value is not in canonical YYYYMMDD form; decoded best-effort, raw preserved.",
  DICOM_DT_NONSTANDARD_OFFSET:
    "Element ({tag}) DT value has a non-standard UTC offset; decoded best-effort, raw preserved.",
  DICOM_UNSUPPORTED_CHARSET:
    "(0008,0005) Specific Character Set value {n} names a defined term this build does not support; decoding text as UTF-8 best-effort. The term is not reproduced here - read the element if you need it.",
  DICOM_CHARSET_AMBIGUOUS_SEPARATOR:
    "(0008,0005) Specific Character Set value {n} is ambiguous under the active code extensions; decoding text as UTF-8 best-effort.",
});

/**
 * The substitutions a registry template may take. Every field is structural by
 * construction, and the type is the enforcement: there is no `string` field, so
 * a decoded value cannot be passed to a factory even by accident.
 *
 * @internal
 */
interface WarningTokens {
  /**
   * An 8-hex-char tag this parser composed from the element header's four bytes,
   * checked against PS3.6's element registry before rendering.
   */
  readonly tag?: Tag;
  /** A VR, checked against the closed 34-VR set before rendering. */
  readonly vr?: VR;
  /** A second VR, for the code that reports a dictionary/on-wire divergence. */
  readonly vr2?: VR;
  /**
   * A count, index or byte span **this parser derived**. Never a length or a
   * byte value read verbatim off a header - see the registry's note above; those
   * are bound out of the factory signature instead, because a raw number has
   * neither a shape nor a membership a renderer could test.
   */
  readonly n?: number;
  /** A second such number. */
  readonly n2?: number;
}

/**
 * The single construction point for every Tier-2 warning: look the message up
 * in {@link WARNING_MESSAGES} and substitute only checked structural tokens.
 *
 * @internal
 */
function build(
  code: WarningCode,
  position: DicomPosition,
  tokens: WarningTokens = {},
): DicomParseWarning {
  const message = WARNING_MESSAGES[code]
    .replace("{tag}", renderTag(tokens.tag))
    .replace("{vr2}", renderVr(tokens.vr2))
    .replace("{vr}", renderVr(tokens.vr))
    .replace("{n2}", String(tokens.n2 ?? 0))
    .replace("{n}", String(tokens.n ?? 0));
  return { code, message, position };
}

/**
 * Build a `DICOM_MISSING_PREAMBLE` warning. Emitted once per parse when no
 * `DICM` magic is present at offset 128 and `stripPreamble` is `"tolerate"`.
 *
 * @example
 * ```ts
 * const w = missingPreamble({ byteOffset: 0 });
 * ```
 */
export function missingPreamble(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_MISSING_PREAMBLE, position);
}

/**
 * Build a `DICOM_FILE_META_GROUP_LENGTH_MISSING` warning. Emitted when the
 * File Meta group does not start with `(0002,0000)
 * FileMetaInformationGroupLength` - the parser falls back to scanning
 * forward until the first non-`(0002,xxxx)` element (D-18).
 *
 * @example
 * ```ts
 * const w = fileMetaGroupLengthMissing({ byteOffset: 132, fileMeta: true });
 * ```
 */
export function fileMetaGroupLengthMissing(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING, position);
}

/**
 * Build a `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` warning. Emitted when
 * `(0002,0000)` declares a byte count that does not match the actual size
 * of the File Meta group; the parser trusts the actual size (D-18).
 *
 * ## `{n}` is a raw declared length and it STAYS. The asymmetry is structural
 *
 * {@link oddLengthValuePadded} and {@link nonzeroReservedBytes} lose theirs
 * because the header those numbers come off may itself be four bytes of somebody
 * else's value - a lying Value Length upstream leaves the reader mid-value.
 * **There is no upstream here.** `parseFileMeta` is called exactly once per
 * parse, from `parseDicom`, at the post-`DICM` offset, and it is never nested;
 * `(0002,0000)` is the first element it reads or this code does not fire at all
 * (the absence raises `DICOM_FILE_META_GROUP_LENGTH_MISSING` instead). So
 * `declared` is the Value Field of the group-length attribute itself, read at a
 * structurally determined offset, and no Data Set value can be read into that
 * position. It is the same argument {@link duplicateFileMetaElement} makes for
 * its offset being file-absolute.
 *
 * Measured rather than argued alone: the desynchronized-read sweep over both
 * transfer syntaxes and ten under-declare deltas reaches this code zero times.
 * `{n2}` is `consumedAfterGroupLength`, a byte count this parser kept.
 *
 * @example
 * ```ts
 * const w = fileMetaGroupLengthMismatch({ byteOffset: 132, fileMeta: true }, 200, 208);
 * ```
 */
export function fileMetaGroupLengthMismatch(
  position: DicomPosition,
  declared: number,
  actual: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH, position, {
    n: declared,
    n2: actual,
  });
}

/**
 * Build a `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` warning. Emitted for an
 * SQ element with length `0xFFFFFFFF` parsed under an Explicit VR transfer
 * syntax - legal per the standard but commonly misencoded by older tools
 * (D-29).
 *
 * @example
 * ```ts
 * const w = undefinedLengthInExplicitVR({ byteOffset: 512 }, "0040A730");
 * ```
 */
export function undefinedLengthInExplicitVR(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR, position, { tag });
}

/**
 * Build a `DICOM_ODD_LENGTH_VALUE_PADDED` warning. Emitted when an element's
 * declared length is odd and the parser pads forward by one byte to keep
 * cursor alignment (PITFALLS.md §6.1).
 *
 * ## 🛑 THE DECLARED LENGTH IS BOUND OUT OF THIS SIGNATURE AND MUST NOT COME BACK
 *
 * This is the code the fifth instance of `DICOM-DIAGNOSTIC-PHI-RESIDUALS` was
 * measured on, and it rendered **eight consecutive payload bytes in one
 * message** - the worst of the six the item's sweeps found. An `ST` carrier
 * holding `"MR BRAIN SMITHSON "` whose Value Length under-declares by 12
 * desynchronizes the Explicit VR LE reader onto a fabricated header whose
 * declared length happens to be odd, and this message printed `4E495320`
 * (`"IN S"`) in `{tag}` beside the decimal `542003027` (`"SON "`) in `{n}`. At
 * delta -16 the pair is `42204152` (`" BRA"`) and `1213483341` (`"MITH"`).
 *
 * The two halves have **different** remedies, and that is the whole shape of
 * this slice:
 *
 * - `{tag}` survives, because `renderTag` is a **membership** test now - PS3.6's
 *   registry either carries a literal row for the tag or it does not, and
 *   `4E495320` is not one of the 5,221 it does. On a well-formed file the tag a
 *   consumer wants is still printed.
 * - `{n}` cannot survive, because **a raw length has neither a shape nor a
 *   membership to test**. There is no set of "lengths PS3.6 names". So the bound
 *   is the signature, exactly as in {@link itemCrossesSequenceEnd},
 *   {@link nonzeroReservedBytes} and every Tier-3 message in `./fatals.ts`: the
 *   factory cannot be handed the value, so no future call site can put it back
 *   without changing this signature.
 *
 * **What it costs, stated rather than minimised.** On a well-formed file the
 * message no longer says *how* odd the length was. The element is in the Data
 * Set under the tag this message still prints, its `rawBytes` carry the value
 * the length described, and `position.byteOffset` locates the header.
 *
 * @example
 * ```ts
 * const w = oddLengthValuePadded({ byteOffset: 240 }, "00100010");
 * ```
 */
export function oddLengthValuePadded(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED, position, { tag });
}

/**
 * Build a `DICOM_VR_MISMATCH` warning. Emitted when an Explicit VR element's
 * on-wire VR differs from the value the data dictionary lists for that tag.
 * The parser trusts the on-wire VR (Postel's Law) but flags the divergence.
 *
 * @example
 * ```ts
 * const w = vrMismatch({ byteOffset: 300 }, "00100010", "PN", "LO");
 * ```
 */
export function vrMismatch(
  position: DicomPosition,
  tag: Tag,
  dictVR: VR,
  fileVR: VR,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_VR_MISMATCH, position, { tag, vr: dictVR, vr2: fileVR });
}

/**
 * Build a `DICOM_PRIVATE_TAG_NO_CREATOR` warning. Emitted when a private
 * element `(gggg,EEFF)` is encountered without a preceding Private Creator
 * `(gggg,00EE)` registration in the same group (PITFALLS.md §7.1, D-33).
 *
 * ## 🛑 THE TAG IS BOUND OUT OF THIS SIGNATURE AND MUST NOT COME BACK
 *
 * It shipped here as a `{tag}` slot through `0.0.13` and was measured leaking:
 * an `ST` carrier holding `"MR BRAIN SMITHSON "` whose Value Length
 * under-declares by 12 desynchronizes the Implicit VR LE reader onto a
 * fabricated header at `(4E49,5320)` - `"IN S"` in wire order, four letters from
 * inside the name - and `resolveImplicitVR` calls that odd group a private
 * element, so this message rendered it, because `renderTag` was a shape check
 * then and a shape check cannot refuse a fabricated tag; identical remedy and
 * identical reasoning to {@link nonzeroReservedBytes},
 * {@link itemCrossesSequenceEnd}, {@link duplicateTagInDataSet} and
 * {@link duplicateFileMetaElement}.
 *
 * **What is different here, and it is why this one is a bound rather than a
 * product call.** The other five are bound because their *trigger* implies the
 * header may be fabricated. This code's trigger does not: plenty of conformant
 * senders write a private element with no creator, and on those files the tag
 * was real. The bound holds anyway, from the tag's own class rather than from
 * the trigger - **this code fires only on an ODD group, and an odd group is
 * precisely the class of tag no closed table this library holds can vouch for.**
 * PS3.6's registry is even-group; a `Profile`'s private dictionary is keyed by a
 * creator string this code fires because it does not have. `renderVr` may render
 * a VR because membership in the 34 is checkable; there is no such check
 * available for a private tag, ever.
 *
 * **`renderTag` is a membership test now and would withhold every tag this code
 * could carry, and the signature bound still stands.** The two are not
 * alternatives. A renderer refuses what a published table does not name; the
 * absence of a slot refuses what a future edition might start naming, and it
 * survives a call site being added by someone who has not read this paragraph.
 *
 * **What it costs, stated rather than minimised.** On a well-formed file the tag
 * this message used to carry was the sender's own private tag number, and it is
 * no longer in the message. It has not left the object: the element is in the
 * Data Set under that tag, and `position.byteOffset` - a count this parser kept -
 * locates the header. That is the same trade {@link duplicateTagInDataSet}
 * makes, with the same frame-of-reference caveat on the offset.
 *
 * @example
 * ```ts
 * const w = privateTagNoCreator({ byteOffset: 800 });
 * ```
 */
export function privateTagNoCreator(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR, position);
}

/**
 * Build a `DICOM_GROUP_LENGTH_IN_DATASET` warning. Emitted when a `(gggg,0000)`
 * Group Length element is encountered outside the File Meta group - the
 * standard retired group-length elements in PS3.5 §7.2 but real-world
 * encoders still emit them.
 *
 * ## The tag is bound out of this signature, and the membership rule is what
 * emptied the slot rather than a judgement taken here
 *
 * `renderTag` renders a tag PS3.6's registry carries a literal row for.
 * Group Length elements were retired, and the registry carries exactly one row
 * ending `0000` - `(0002,0000)` FileMetaInformationGroupLength, which is File
 * Meta and never reaches this code. So **every** tag this slot could ever have
 * rendered was one no closed table names, measured over this repo's own suite:
 * four distinct tags reached it and all four withheld.
 *
 * A slot that can never render is worse than no slot: it invites a future call
 * site to pass a tag and leaves the reader thinking one is available. And the
 * sixteen bits it would carry are not free of the leak this item is about - the
 * element number is a constant of the code, so the whole tag is the group
 * number, off a header a lying Value Length upstream may have fabricated.
 *
 * @example
 * ```ts
 * const w = groupLengthInDataset({ byteOffset: 400 });
 * ```
 */
export function groupLengthInDataset(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET, position);
}

/**
 * Build a `DICOM_NONZERO_RESERVED_BYTES` warning. Emitted when an Explicit
 * VR long-form header has non-zero bytes in its 2-byte reserved field
 * (between VR and the 4-byte length per D-22).
 *
 * ## It takes no tag, uniquely among the parser's factories
 *
 * `WarningTokens`' "structural by construction" property has to be kept at the
 * call site wherever the trigger is itself "these bytes are not what they claim
 * to be" - `renderTag` was a shape check when this bound was taken, and a shape
 * check cannot refuse a fabricated tag. **That is exactly this code's trigger**,
 * and the signature bound outlives `renderTag` becoming a membership test. PS3.5 §7.1.2 requires those
 * two bytes to be `0x0000`; a header where they are not may not be a header at
 * all, in which case the four bytes this message would call a tag are four bytes
 * of some element's value.
 *
 * Measured, on a name-bearing payload: an `ST` carrier holding
 * `"MR BRAIN SMITHSON "` whose Value Length under-declares by 6 desynchronizes
 * the reader onto a fabricated header at `(4854,4F53)` - `"THSO"` in wire order,
 * four letters of the surname - and the old message rendered it. `#55` paid a
 * blocker for the identical mistake in `report.undefinedVrElements[].tag`; the
 * remedy is the same one, and so is the reason it is not a guard: the honestly
 * written case and the fabricated case are indistinguishable here, so the tag is
 * withheld on both rather than on a guess. `position.byteOffset` locates the
 * element and is a count the parser kept.
 *
 * ## 🛑 THE TWO BYTE VALUES ARE BOUND OUT OF THIS SIGNATURE TOO, AND THAT IS THE
 * SIXTH INSTANCE OF THIS ITEM
 *
 * They shipped here through `0.0.14` as `{n}` and `{n2}`, on the reasoning that
 * "an input-derived number is the prescribed shape here, and a re-rendered slice
 * of input is not, however short". **That reasoning was wrong, and it was wrong
 * against this factory's own argument two paragraphs up.** The bytes are not
 * *derived* from input; they *are* input - the two bytes at `headerStart + 6` -
 * and printing them as decimals is a re-encoding a reader reverses by looking at
 * them. The tag was withheld here because the header may not be a header; the
 * reserved pair comes off that same header.
 *
 * Measured on a name-bearing payload, `"MR BRAIN SMITHSON "` under Explicit VR
 * LE: six under-declare deltas each put two letters of the name into this
 * message, `-8` through `-18` (`" N"`, `"SO"`, `"TH"`, `"MI"`, `" S"`, `"IN"`).
 * The shipped PHI detector could not see it - it hunts four-byte windows as tags
 * and as 32-bit decimals and two-byte windows as VRs, and nothing hunted a
 * **single** byte as a decimal. A detector that has never looked for a shape has
 * not cleared it.
 *
 * The endianness paragraph this replaces is retired with the slots: there is no
 * longer a pair to compose, so there is no endianness to pick.
 *
 * @example
 * ```ts
 * const w = nonzeroReservedBytes({ byteOffset: 500 });
 * ```
 */
export function nonzeroReservedBytes(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES, position);
}

/**
 * Build a `DICOM_UN_PARSED_AS_SQ` warning. Emitted when a `VR=UN` element
 * with undefined length is successfully descended as an Implicit VR LE
 * sequence (CP-246 fallback per D-30).
 *
 * The message says the element *has* `VR=UN` rather than *declared* it, and
 * that distinction is load-bearing on one of the two paths that raise this: an
 * Explicit VR syntax carries `UN` on the wire, but under Implicit VR LE the
 * `UN` is *resolved*, often because the element's Data Set never claimed the
 * private block (PS3.5 section 7.8.1). Saying "declared" there would tell a
 * consumer the sender wrote something it did not.
 *
 * The earlier message printed the literal string `"UN"` in its tag slot,
 * because the descent primitive is handed a byte range rather than a tag. The
 * tag is not unavailable, though: both call sites hold it, so it is threaded
 * through rather than dropped.
 *
 * @example
 * ```ts
 * const w = unParsedAsSQ({ byteOffset: 600 }, "0040A730");
 * ```
 */
export function unParsedAsSQ(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_UN_PARSED_AS_SQ, position, { tag });
}

/**
 * Build a `DICOM_SQ_NOT_DESCENDED` warning. Emitted when a **defined-length**
 * element whose VR was resolved to `SQ` from the dictionary under Implicit VR LE
 * turns out not to hold a valid `(FFFE,E000)` item stream, so the parser keeps
 * the declared byte range as an opaque value instead of descending it.
 *
 * The asymmetry against Explicit VR is the reason this is a warning rather than
 * the Tier-3 fatal that path raises. Under Explicit VR the sender wrote `SQ` on
 * the wire, so bytes that are not items are a contradiction in the file. Under
 * Implicit VR LE there is no VR on the wire at all: `SQ` is this parser's
 * inference from PS3.6, and a defined length leaves a complete alternative
 * reading (the value is exactly `length` bytes) that undefined length does not.
 * Failing the whole object over an inference the file never made would lose
 * patient, study and modality to recover nothing.
 *
 * It is a warning rather than silence for the opposite reason: an undescended
 * sequence is invisible to `deidentify()`, which recurses only into a sequence
 * whose `items` the parser materialized. A caller that is about to share the
 * file needs to be told the audit did not reach inside this element - and
 * `deidentify()` needs to be told too, which is why it now **empties** such an
 * element rather than passing its bytes through
 * (`DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE`). The warning is what stops that
 * emptying being a silent drop. `RetainSafePrivate` plus a profile used to
 * exempt a private `SQ` from it; since `DICOM-PRIVATE-SQ-CARVE-OUT` it does not.
 *
 * **Do not read it as "the sender is at fault".** It usually is, but the same
 * refusal is raised for a *conformant* file whose sequences nest deeper than
 * this library's own `NESTING_DEPTH_LIMIT` - PS3.5 sets no nesting bound, so
 * that limit is ours, not the standard's.
 *
 * **`ds.warnings` is uncapped, and this message is emitted once per refused
 * element**, so a crafted file multiplies its length by an element count the
 * input chooses. That unboundedness is pre-existing and shared with every other
 * parser warning; the length is why this text is kept terse and defers the
 * reasoning to `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` and the docs instead of
 * restating it.
 *
 * @example
 * ```ts
 * const w = sqNotDescended({ byteOffset: 320 }, "00081115");
 * ```
 */
export function sqNotDescended(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_SQ_NOT_DESCENDED, position, { tag });
}

/**
 * Build a `DICOM_ITEM_CROSSES_SEQUENCE_END` warning. Emitted when a
 * defined-length `(FFFE,E000)` Item inside a defined-length `SQ` being read **in
 * place** declares a length reaching past the end that `SQ` declared, so the
 * item's value read takes bytes belonging to the enclosing Data Set.
 *
 * PS3.5 2026c section 7.5.2 "Delimitation of The Sequence of Items" makes the
 * `SQ` element's Value Length "the total length resulting from the sequence of
 * zero or more items conveyed by this Data Element"; section 7.5.1 governs the
 * Item's own length field. A malformed file makes the two disagree, and this
 * warning is the disclosure of that disagreement, not a decision about it: the
 * reader follows the Item's field, which is what every released version does.
 *
 * **It does not fire wherever the two merely differ.** `endLimit <
 * buffer.length` is required, so it fires only where the disagreement is
 * consequential - an item reaching into a larger Data Set's bytes. A sequence
 * handed a slice cut at its declared end (`tryParseDefinedLengthSQ`,
 * `tryParseUnAsSQ`), an undefined-length sequence, and a sequence that is the
 * last thing in its buffer all have nothing to reach into.
 *
 * **Provenance:** both citations are traced, not stated. PS3.5 2026c section
 * 7.5.2's "This length shall include the total length resulting from the
 * sequence of zero or more items conveyed by this Data Element" and section
 * 7.5.1 "Item Encoding Rules" are read from the SHA-pinned `vendor/nema/part05/`
 * and each occurs once in that document. Neither clause says what a decoder must
 * do when the two disagree, so no reading is derived from either: this code only
 * reports the contradiction.
 *
 * ## Slots, and what is input
 *
 * `{tag}` carries the Item tag `FFFEE000`, matching {@link emptyItemInSequence}:
 * a constant this parser recognised, not four bytes echoed back.
 *
 * `position.byteOffset` is the item header's offset **in the buffer
 * `parseSequence` was handed**, which is the file for a root-level sequence and
 * the enclosing item's slice for a nested one. It is frame-dependent for the
 * same reason `Element.byteOffset` is, and neither documents a
 * frame-of-reference contract. Measured and pinned rather than described.
 *
 * **🛑 THE ITEM'S DECLARED LENGTH IS BOUND OUT OF THIS SIGNATURE AND MUST NOT
 * COME BACK. A DIAGNOSTIC ABOUT A LENGTH FIELD THAT LIES IS ITSELF A PHI
 * SURFACE.** It shipped here as a `{n}` slot and was refused. The condition that
 * raises this code is precisely "these length fields are not what they claim to
 * be", so the Item's 32-bit Value Length can be four bytes of somebody's value:
 * measured, an item header fabricated over the payload `"SMITHSON"` rendered it
 * as the decimal **1414090067**, `"SMIT"` in wire order, losslessly reversible
 * with one `readUInt32LE` - and it is emitted **above** the truncation guard, so
 * the message reaches `onWarning` on a file the parse then refuses. Identical
 * remedy and identical reasoning to {@link nonzeroReservedBytes} and to `#55`:
 * where `renderTag` and `renderVr` each check membership in a closed set and a
 * raw length has no such set to check, the bound has to be **the signature**
 * rather than a branch. The
 * factory cannot be handed the value, so no future call site can put it back
 * without changing this signature.
 *
 * **🔴 `{n2}` STAYS, AND THE ARGUMENT THAT IT IS STRUCTURAL IS RETRACTED. IT IS A
 * DISCLOSED RESIDUAL NOW, NOT AN ASYMMETRY.** It is `endLimit -
 * cursor.position` under the emit site's `endLimit < buffer.length` conjunct,
 * and "bounded by the buffer" was read as "not read out of a header". It is:
 * `endLimit` is the enclosing **Sequence's** declared Value Length off its own
 * header, and `cursor.position` sits one Item header past the START of that
 * Item, so `{n2}` is the declared length minus the reporting Item's offset into
 * the sequence value. **For the FIRST Item** that offset is exactly the 8-byte
 * Item header PS3.5 7.5.1 fixes, so `{n2} + 8` IS the declared length and one
 * addition on a published constant reverses it; a later Item subtracts more and
 * discloses correspondingly less. The row that pins this measures the first.
 *
 * **The retracted measurement is the lesson, not the leak.** It fabricated the
 * `SQ`'s length field over `"SMITHSON"` - four printable bytes, so `endLimit`
 * landed past the buffer, the code did not fire, and the conjunct looked like a
 * bound. That is the payload class this package has since proved **unreachable**:
 * a declared length only survives a parse if the buffer really holds that many
 * bytes, so every fabricated length that reaches this code has zero high-order
 * bytes and a short decimal. Re-measured on that class: a `SQ` length field
 * reading `"SO\0\0"` renders `20299`, and `20299 + 8 = 20307`, recovering
 * `"SO"`; `"ON\0\0"` renders `20039`, `"TH\0\0"` renders `18508`; the parse
 * **survives**, so it reaches `Dataset.warnings`, not only `onWarning`.
 *
 * `PRE-EXISTING` and deliberately not closed here: binding `{n2}` is a behaviour
 * change, and this package's rule when a claim and a guard disagree is to
 * correct the claim. Asserted by a row in
 * `test/integration/explicit-sq-item-bound.test.ts` that is green on both trees,
 * with a name-bearing payload and a mutation control, so no reader can take this
 * paragraph for an all-clear;
 * `test/integration/phi-diagnostic-surface.test.ts` holds the slot.
 *
 * ## Two things it does NOT do
 *
 * **`profiles.strict` does not escalate it.** The `{ strict: true }` option
 * does, through the `makeEmitter` chokepoint, but the preset's escalation list
 * is unchanged: adding a code to a shipped preset moves every `profiles.strict`
 * consumer's parse and is a measured behaviour change of its own, not a side
 * effect of adding a code. Pinned by a test.
 *
 * **It is not bounded, and "at most one per sequence" is not a bound.** The
 * shape does hold - an overrunning item consumes to its own declared end and the
 * item loop then exits - but a file is free to carry as many sequences as it can
 * encode, and `ds.warnings` is uncapped. That is `#48`'s pre-existing,
 * package-wide posture for parser warnings rather than anything new here. Pinned
 * by a test that asserts the growth rather than a cap.
 *
 * @example
 * ```ts
 * const w = itemCrossesSequenceEnd({ byteOffset: 320 }, "FFFEE000", 12);
 * ```
 */
export function itemCrossesSequenceEnd(
  position: DicomPosition,
  tag: Tag,
  availableLength: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END, position, {
    tag,
    n2: availableLength,
  });
}

/**
 * Build a `DICOM_EMPTY_ITEM_IN_SEQUENCE` warning. Emitted when an
 * `(FFFE,E000) Item` marker has length 0 - tolerated per D-28 but flagged
 * as it usually signals a sender bug.
 *
 * @example
 * ```ts
 * const w = emptyItemInSequence({ byteOffset: 700 }, "0040A730");
 * ```
 */
export function emptyItemInSequence(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE, position, { tag });
}

/**
 * Build a `DICOM_DUPLICATE_TAG_IN_DATA_SET` warning. Emitted by
 * {@link defineElement} when an element is read whose tag the Data Set being
 * built already holds, at the moment the second one replaces the first.
 *
 * ## What it discloses, and why a warning is the whole remedy
 *
 * A parsed Data Set is a `Map<Tag, Element>`. `Map.set` on a key the map
 * already has overwrites in place, so the first element's value leaves the
 * object and nothing in the model records that it was ever there: the survivor
 * looks exactly like an element the sender wrote once. That is a loss a reader
 * cannot detect and a round trip cannot reveal, which is why the disclosure is
 * the fix. **This code decides nothing.** The reading is unchanged, the last
 * element read still wins, and no value is invented for the one that lost.
 *
 * ## Citations, traced rather than stated
 *
 * PS3.5 2026c section 7.1 "Data Elements": "The Data Elements in a Data Set
 * shall be ordered by increasing Data Element Tag Number and shall occur at most
 * once in a Data Set." Section 7.5.1 "Item Encoding Rules" repeats it one level
 * down: within an Item the Data Elements "shall be ordered by increasing Data
 * Element Tag value and appear only once". Both are read from the SHA-pinned
 * `vendor/nema/part05/`, and each sentence occurs exactly once in that document.
 * So this code cannot fire on a conformant file, which is what makes it safe to
 * add under the `{ strict: true }` escalation every Tier-2 code takes.
 *
 * ## Slots, and what is input
 *
 * **🛑 THE TAG IS BOUND OUT OF THIS SIGNATURE AND MUST NOT COME BACK.** The
 * ordinary way a Data Set comes to hold one tag twice is not a sender typing it
 * twice: it is a length field that lies, so bytes inside somebody's value are
 * read as a Data Element header. The four tag bytes are then document content,
 * and `renderTag` was a shape check when this bound was taken, so it could not
 * refuse one. Identical remedy and reasoning to {@link nonzeroReservedBytes} and
 * {@link itemCrossesSequenceEnd}: the bound is the signature, so no future call
 * site can put it back without changing it.
 *
 * The survivor's tag is still reachable, and from the model rather than from a
 * message: `position.byteOffset` is the byte offset the parser counted for the
 * replacing element's header, which is the `Element.byteOffset` the Data Set now
 * carries under that tag. The element that was replaced is gone, and its tag is
 * the survivor's.
 *
 * **🛑 THAT LOOKUP IS ROOT-ONLY, AND SAYING IT UNQUALIFIED IS A DEFECT A GATE
 * ALREADY CAUGHT.** `position.byteOffset` is frame-dependent exactly as
 * `Element.byteOffset` is: file-absolute at the root, relative to the item's own
 * slice inside a defined-length item, with no frame-of-reference contract
 * documented either way. **So it is not a unique key over the object.** A
 * collision inside an item reports an offset a *root* element may also occupy -
 * measured: a `(0010,0020)` collision inside item 0 of `(0040,A730)` reports
 * offset 172, where the root's untouched `(0008,0008)` also sits, so a
 * root-only search names the wrong attribute. `position.contextPath` would
 * disambiguate it and **no parser warning populates it**; giving them one is a
 * package-wide change, not a rider on this code. Both frames are measured and
 * pinned in `test/integration/tag-collision.test.ts` rather than described.
 *
 * ## What it does not do
 *
 * **🩺 "Names no tag" is about THIS MESSAGE, not about the strict channel.**
 * `{ strict: true }` escalates every Tier-2 code through `makeEmitter`, and the
 * `DicomParseError` it throws carries `snippet`: 16 raw source bytes at the same
 * offset, rendered as hex. On a plain duplicate that is
 * `10 00 20 00 4c 4f 0e 00 53 4d 49 54 48 53 4f 4e` - the withheld tag, and
 * eight bytes of the value. That is D-10 and package-wide: the same file with
 * its even-length padding removed produces the identical bytes on `0ead071`
 * through `DICOM_ODD_LENGTH_VALUE_PADDED` (`0d` for `0e`), and the
 * PHI-diagnostic runner cannot see either, because hex is a re-encoding. Pinned in `test/integration/tag-collision`, so
 * that the guarantee is never restated as "this code cannot surface a tag".
 *
 * **It is not bounded.** A file may encode as many collisions as it can fit, and
 * `ds.warnings` is uncapped: that is this package's pre-existing, package-wide
 * posture for parser warnings, not something new here.
 *
 * **It does not reach the File Meta group, and the reason that was ever worth
 * saying was WRONG.** `parseFileMeta` accumulates into an array, so nothing is
 * overwritten there - but a repeated `(0002,xxxx)` tag the group models is
 * *projected* by a first-match search and *filtered out* of `extraElements`, so
 * the second copy left the object anyway, with no warning and no residue. That
 * is {@link duplicateFileMetaElement}'s code, not this one, and until it existed
 * this sentence read as an all-clear over the one group that decides how every
 * following byte is read.
 *
 * @example
 * ```ts
 * const w = duplicateTagInDataSet({ byteOffset: 274 });
 * ```
 */
export function duplicateTagInDataSet(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET, position);
}

/**
 * Build a `DICOM_DUPLICATE_FILE_META_ELEMENT` warning for a second
 * `(0002,xxxx)` element whose tag `parseFileMeta` projects into a typed
 * {@link FileMeta} field, emitted at the moment the projection is about to drop
 * it.
 *
 * @remarks
 * ## Why the File Meta group needs its own code
 *
 * The File Meta group is not a `Map<Tag, Element>`, so nothing is overwritten
 * there and {@link duplicateTagInDataSet} never fires on it. It is still lossy,
 * by a different route and in the opposite direction. `parseFileMeta` collects
 * every `(0002,xxxx)` element into an array and then projects the eight tags in
 * `MODELED_FM_TAGS` into typed fields with a **first-match** search, while
 * `extraElements` - the verbatim residue that gives the group its byte-exact
 * round trip - is built by **excluding** exactly those eight tags. A second copy
 * of a modeled tag is therefore in neither: not projected, because the first
 * copy already answered, and not preserved, because its tag is modeled. It left
 * the object with no warning and no residue.
 *
 * So the two codes disagree about which copy survives, deliberately, because the
 * two readings do: **the FIRST copy wins in the File Meta group, the LAST read
 * wins in a Data Set**, and neither reading moves. As in `#70`, nothing is
 * guessed for the copy that lost and no bound is chosen - the remedy is the
 * disclosure and nothing else.
 *
 * `(0002,0010)` Transfer Syntax UID makes this the more dangerous of the two
 * shapes: it is the element that decides how every byte after the group is read,
 * and a second copy carrying a *different* UID selected a different parse of the
 * rest of the file for whoever wrote it. This library reads the first and says
 * so; it does not attempt to decide which the sender meant, because the bytes do
 * not carry that.
 *
 * ## The tag is not in the message, and that is the fifth code to need the bound
 *
 * Identical remedy and reasoning to {@link duplicateTagInDataSet},
 * {@link nonzeroReservedBytes}, {@link itemCrossesSequenceEnd} and
 * `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`: the trigger is "a header appeared
 * where the group did not expect one", and a header that should not be there may
 * be composed of somebody's value bytes, so the four tag bytes are input.
 * `renderTag` was a shape check when this bound was taken and could not refuse
 * one; it is a membership test now and would, and the bound stays where it is
 * anyway. The bound is the **factory signature** - position only - so no future
 * call site can put it back without changing it.
 *
 * ## `position.byteOffset` here IS file-absolute, and that is structural
 *
 * The frame-of-reference caveat that {@link duplicateTagInDataSet} carries does
 * not apply. The File Meta group is never nested: `parseFileMeta` is called
 * exactly once per parse, from `parseDicom`, with the whole buffer and the
 * post-`DICM` offset, and there is no item slice anywhere on that path. The
 * offset is the dropped element's own header start, counted from byte 0 of the
 * file. It is **not** the surviving element's offset - the survivor is the
 * earlier copy, so its offset is lower.
 *
 * ## What it does not do
 *
 * It does not fire for a repeated `(0002,xxxx)` tag that is **not** modeled:
 * every copy of those is kept verbatim in `FileMeta.extraElements`, so nothing
 * is dropped and there is nothing to disclose. **What that does NOT mean, and a
 * graded pass refuted the draft that said it did: `encodeFileMeta` re-emits both
 * copies, so this package writes a `(0002,xxxx)` tag twice on such a file.**
 * That is `PRE-EXISTING` and unchanged here, it is not what "the serializer is
 * conservative" covers, and it is a backlog line rather than a rider on this
 * code - the round-trip promise and the spec-clean promise disagree on exactly
 * this input, and choosing between them is a decision, not a fix.
 *
 * **It does not reach a copy that sits past an honest `(0002,0000)`.** The group
 * loop stops at the declared length when the declaration is consistent, so a
 * second `(0002,0010)` an intermediary appended without updating the group
 * length is never a File Meta element to this parser at all: it is relocated
 * into the main Data Set, silently, on this tree and on every earlier one. Also
 * `PRE-EXISTING`, also a backlog line, and the reason this code is described as
 * covering the group **as the parser delimits it** rather than the group.
 *
 * It does not change which copy is read and it adds no residue. And
 * "names no tag" is about this message only: `{ strict: true }` escalates every
 * Tier-2 code through `makeEmitter`, and the `DicomParseError` it throws carries
 * `snippet`, 16 raw source bytes at the same offset rendered as hex (D-10,
 * package-wide).
 *
 * @example
 * ```ts
 * const w = duplicateFileMetaElement({ byteOffset: 152, fileMeta: true });
 * ```
 */
export function duplicateFileMetaElement(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT, position);
}

/**
 * Build a `DICOM_PIXEL_DATA_LENGTH_MISMATCH` warning for a defined-length
 * `(7FE0,0010)` element whose declared length does not match
 * `rows × columns × samplesPerPixel × bitsAllocated/8 × numberOfFrames` (D-32).
 *
 * @remarks
 * Declared but **not emitted** by this build: no call site exists in `src/`.
 * Kept so the code and its shape stay stable for the phase that activates it.
 *
 * **The declared length is bound out of the signature anyway, and "it is not
 * emitted" is the reason to do it now rather than a reason to skip it.** It is a
 * raw 32-bit read off an element header, the same class as
 * {@link oddLengthValuePadded}'s, so a later phase that switched this code on
 * would ship the leak this slice just closed one code over - with no call site
 * today, the change costs nothing and no measurement can catch it later.
 * `{n2}` stays: it is `rows x columns x samplesPerPixel x bitsAllocated/8 x
 * numberOfFrames`, a product this parser computes, not a number it reads.
 *
 * @example
 * ```ts
 * const w = pixelDataLengthMismatch({ byteOffset: 1024 }, 524300);
 * ```
 */
export function pixelDataLengthMismatch(
  position: DicomPosition,
  computed: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH, position, {
    n2: computed,
  });
}

/**
 * Build a `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` warning. Emitted
 * under Implicit VR LE for a private tag whose creator is registered but
 * whose VR cannot be resolved (Phase 2 always falls back to UN; Phase 6
 * adds profile-supplied VR overrides per D-21 / D-34).
 *
 * **The tag is bound out of this signature for the reason
 * {@link privateTagNoCreator} states, and leaving it here would have made that
 * bound decorative.** Both codes are emitted from the same branch of
 * `resolveImplicitVR` on the same element, so the identical fixture that
 * measured `"IN S"` into `DICOM_PRIVATE_TAG_NO_CREATOR` measured it into this
 * message too, on the same parse. Closing one carrier of a pair is not closing
 * the leak.
 *
 * @example
 * ```ts
 * const w = implicitVRForPrivateTagWithoutVR({ byteOffset: 900 });
 * ```
 */
export function implicitVRForPrivateTagWithoutVR(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR, position);
}

/**
 * Build a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning (Phase 6, D-45). Emitted
 * under Implicit VR LE when a parse-time {@link Profile} is active and a
 * private data element carries a registered Private Creator that the profile's
 * private-dictionary overlay does not recognize - the element degrades to the
 * generic `UN` fallback rather than risking a wrong decode.
 *
 * The creator string is **not** a parameter. It reads as a vendor schema
 * identifier and usually is one, but it is an `LO` a sender authored, and this
 * warning fires precisely when no closed set vouches for it. `position` says
 * where to look; the bytes stay on the `(gggg,00EE)` element.
 *
 * **The tag is bound out of this signature too, and it is the one of the three
 * private-tag codes that is bound by ARGUMENT rather than by MEASUREMENT.** It
 * needs an active {@link Profile} and a reserved block to fire at all, so the
 * desynchronized-read sweep in
 * `test/integration/phi-diagnostic-surface.test.ts` does not reach it and no
 * fixture here renders a fabricated tag through it. It is bound because
 * {@link privateTagNoCreator}'s reason is about the tag's *class* and not about
 * the trigger: this code also fires only on an odd group, so no closed table
 * this library holds can vouch for its tag either. Leaving the slot in one of
 * three sibling codes because only two were caught is how a bound becomes a
 * coincidence.
 *
 * @example
 * ```ts
 * const w = privateCreatorUnknown({ byteOffset: 900 });
 * ```
 */
export function privateCreatorUnknown(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_PRIVATE_CREATOR_UNKNOWN, position);
}

/**
 * Build a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning (Phase 7). Emitted by
 * `deidentify` when a dataset carries Pixel Data `(7FE0,0010)` and either
 * `(0028,0301)` Burned In Annotation is absent or its value is not `"NO"` - the
 * metadata-only de-identifier cannot inspect or clean pixels (that is deferred to
 * `@cosyte/dicom-pixel`), so it warns rather than silently implying the image is
 * clean (PS3.15 §E.3.1 / §E.3.2 are out of scope here).
 *
 * @example
 * ```ts
 * const w = burnedInAnnotationNotRemoved({ byteOffset: 4096, fileMeta: false });
 * ```
 */
export function burnedInAnnotationNotRemoved(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED, position);
}

/**
 * Build a `DICOM_DEIDENT_METHOD_NOT_ADDED` warning for a `(0012,0063)` whose
 * prior value `deidentify()` had to **replace** rather than add to, because the
 * join would not fit the largest Value Length an `LO` can encode.
 *
 * @remarks
 * PS3.15 2026c E.1.1 obliges a de-identifier to insert its method text in, or
 * add it to, `(0012,0063)`. `deidentify()` adds; this code is raised when the
 * value it would have to write is longer than that VR can encode. **The fallback
 * is not a new loss** - it is what every released version did on every file -
 * but it is still a loss, and an audit that reads as a complete provenance chain
 * it did not preserve is the worse half of every leak in this package.
 *
 * **🛑 IT IS NOT "the one shape where `deidentify` cannot add", AND A GRADED PASS
 * REFUTED THAT SENTENCE.** There is a second - a `(0012,0063)` a file encoded
 * under a VR other than `LO` - and it is no longer silent: it raises
 * {@link deidentMethodNotLo}. Read this code as "the length ceiling was
 * reached", never as "every fallback is disclosed"; the two shapes replace for
 * unrelated reasons and a consumer that has to tell them apart can.
 *
 * Truncating the chain instead was refused deliberately: choosing which of the
 * sender's earlier de-identification records to drop is a policy the standard
 * does not state. This package reports rather than invents.
 *
 * **No value, no length, no VR.** The prior text is the file's own, and the
 * length that failed to fit is a count over it. The tag in the message is a
 * constant of this code, like `(7FE0,0010)` in
 * `DICOM_PIXEL_DATA_LENGTH_MISMATCH`, never composed from input.
 *
 * Emitted by `deidentify()` only, so it reaches `report.warnings` and is not
 * subject to the parser's `{ strict: true }` escalation.
 *
 * @example
 * ```ts
 * const w = deidentMethodNotAdded({ byteOffset: 4096, fileMeta: false });
 * ```
 */
export function deidentMethodNotAdded(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED, position);
}

/**
 * Build a `DICOM_DEIDENT_METHOD_NOT_LO` warning for a `(0012,0063)` the source
 * file encoded under a VR other than `LO`, which `deidentify()` therefore
 * **replaced** rather than added to.
 *
 * @remarks
 * PS3.15 2026c E.1.1 obliges a de-identifier to insert its method text in, or
 * add it to, `(0012,0063)`. `deidentify()` adds - by concatenating `LO` values
 * with the `5CH` delimiter, which is a text operation and only defined for the
 * VR the Data Dictionary gives that tag. Bytes under any other VR are not values
 * this can join into: an `OB` or `UN` value is arbitrary octets, and appending
 * text to it would emit something no receiver can read as either.
 *
 * **So the fallback is deliberate, and it is the DISCLOSURE that is new.** Every
 * released version replaced these bytes with `report.warnings` empty, which is
 * the shape this package keeps opening items for: an audit stamped
 * `(0012,0062) = YES` over a record it silently destroyed. Guessing an encoding
 * for the prior text instead was refused for the reason every other guess in
 * this package is - it reports rather than invents.
 *
 * **A prior value that is empty or padding only is not disclosed**, because
 * nothing was lost: that matches the `LO` path, which raises no
 * `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` for an empty prior either.
 *
 * **No value, no length and NO VR.** The VR is two bytes read out of the file
 * and a fabricated header makes them document content - the shape that rendered
 * four letters of a surname through `DICOM_NONZERO_RESERVED_BYTES`. The tag in
 * the message is a constant of this code. `position.byteOffset` locates the
 * element.
 *
 * Emitted by `deidentify()` only, so it reaches `report.warnings` and is not
 * subject to the parser's `{ strict: true }` escalation.
 *
 * @example
 * ```ts
 * const w = deidentMethodNotLo({ byteOffset: 4096, fileMeta: false });
 * ```
 */
export function deidentMethodNotLo(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_LO, position);
}

/**
 * Build a `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` warning for a `(0012,0063)`
 * whose prior value `deidentify()` **kept** beside the method it recorded.
 *
 * @remarks
 * PS3.15 2026c E.1.1 obliges a de-identifier to insert its method text in, or
 * add it to, `(0012,0063)`, so keeping the sender's earlier record is the
 * conformant act and this code is not a defect report. It is a **disclosure**:
 * `(0012,0063)` is not in Table E.1-1, so no action fired on it, nothing
 * inspected those bytes, and a sender who wrote a name there has that name in
 * output stamped `(0012,0062) Patient Identity Removed = YES`. Before this code
 * existed that happened with `report.warnings` empty and `report.retained` `[]` -
 * **a stamp that outran the redaction**, which is the shape of failure this
 * package has opened items for twice.
 *
 * **Read it as "bytes from the input file are in `(0012,0063)`", never as "the
 * sender wrote something identifying".** De-identifying an object this library
 * already de-identified raises it too: the prior value is then this library's own
 * earlier record, and nothing on the wire distinguishes that from a third party's.
 *
 * **It is not on `report.retained`, deliberately.** That field is the list of
 * Annex E option sets active for the run, typed `DeidentifyOption[]`; a retained
 * `(0012,0063)` is not an option set, and widening the type to carry it would
 * break every consumer that switches over the nine names.
 *
 * **No value, no length, no VR** - the retained text is the file's own, and the
 * tag in the message is a constant of this code rather than composed from input,
 * exactly as in `DICOM_DEIDENT_METHOD_NOT_ADDED`. `position.byteOffset` locates
 * the element.
 *
 * Emitted by `deidentify()` only, so it reaches `report.warnings` and is not
 * subject to the parser's `{ strict: true }` escalation - which is why adding it
 * cannot refuse a conformant file.
 *
 * @example
 * ```ts
 * const w = deidentMethodPriorRetained({ byteOffset: 4096, fileMeta: false });
 * ```
 */
export function deidentMethodPriorRetained(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED, position);
}

/**
 * Build a `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED` warning. Emitted by
 * `deidentify()` - never by the parser - when a value the action table resolved
 * to *keep* ends with a complete run of Data Elements that the run would have
 * acted on had they been parsed as attributes (PS3.15 §E.1, §E.3.5).
 *
 * The carrier's tag and VR are this parser's own composed structural fields, and
 * `n` is a count; the hidden tags travel on the report, not through a message.
 *
 * @example
 * ```ts
 * const w = embeddedAttributeRemoved({ byteOffset: 320 }, "00080008", "CS", 1);
 * ```
 */
export function embeddedAttributeRemoved(
  position: DicomPosition,
  tag: Tag,
  vr: VR,
  count: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED, position, {
    tag,
    vr,
    n: count,
  });
}

/**
 * Build a `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` warning. Emitted by
 * `deidentify()` - never by the parser - when an element the run was about to
 * **keep** carries a Sequence of Items it has no materialized `items` for, so
 * there is an item stream the de-identifier cannot walk.
 *
 * **Two producers, and only the first is an `SQ` on the parse tree.**
 *
 * 1. An `SQ` element with no `items`. The parser announces that one first: a
 *    defined-length Implicit VR LE value whose dictionary-resolved `SQ` was not
 *    a valid item stream (`DICOM_SQ_NOT_DESCENDED`).
 * 2. A private element retained under `RetainSafePrivate` whose `Profile` entry
 *    declares it `SQ` while the parse tree says otherwise - `UN` under Implicit
 *    VR LE when the profile did not reach `parseDicom`, or whatever VR the
 *    sender wrote under Explicit VR, where the wire wins
 *    (`DICOM-PRIVATE-SQ-PARSE-VR`). **That file may be entirely conformant and
 *    raise nothing on `Dataset.warnings` at all**, so do not describe this code
 *    as always following a parse warning.
 *
 * PS3.5 section 7.5.1 says an Item Value is "a DICOM Data Set composed of Data
 * Elements" and PS3.15 section E.1.1 obliges the de-identifier to protect the
 * listed Attributes "whether contained in the top level Data Set or embedded in
 * an Item of a Sequence of Items". Unable to enumerate them, it empties the
 * carrier.
 *
 * **The message names no VR**, because producer 2's whole premise is that the
 * parse tree and the profile disagree about which one it is.
 *
 * **The CP-246 `UN` shape is covered only where producer 2 reaches it**, i.e.
 * only when a profile declared that private attribute a Sequence. It is not
 * covered in general and cannot be: an undefined-length `UN` whose descent was
 * refused keeps `vr === "UN"`, every ordinary `UN` element also has
 * `items === undefined`, and the same test applied to all of them would empty
 * every unknown-VR element in every file. Distinguishing a refused descent from
 * a plain `UN` needs a mark the parser does not currently set. Measured, still
 * leaking outside that route, and disclosed rather than guessed at.
 *
 * **🩺 THE BYTE SPAN IS BOUND OUT OF THIS SIGNATURE, AND IT IS THE SEVENTH
 * INSTANCE OF "A DIAGNOSTIC ABOUT A PHI LEAK IS ITSELF A PHI SURFACE".** Through
 * `0.0.14` this factory took a `byteLength` and rendered it as `{n}`. That
 * number is `Element.rawBytes.length`, which is not a count this parser
 * invented: it EQUALS the Value Length read off the element header, and
 * producer 2's whole premise is that the header may have been composed out of
 * somebody's value by an under-declared length upstream. Measured on a
 * fabricated header whose length field is `"SO\0\0"` - two letters of a planted
 * surname followed by the zero high bytes any reachable length must have - the
 * message printed `20307`, reversible with one `readUInt32LE`. A raw length has
 * neither a shape nor a membership for a renderer to test, so the bound is the
 * absence of the parameter; there is no `renderLength` and there must not be one.
 *
 * `tag` stays and is `renderTag`'s membership test against PS3.6's element
 * registry, which is what keeps the audit useful on a well-formed file.
 * `report.unauditableSequences[].byteLength` still carries the number, on a type
 * whose docs say it is not a value-free surface.
 *
 * @example
 * ```ts
 * const w = sequenceNotAuditable({ byteOffset: 320 }, "00081115");
 * ```
 */
export function sequenceNotAuditable(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE, position, { tag });
}

/**
 * Build a `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` warning. Emitted by
 * `deidentify()` - never by the parser - when an element the run was about to
 * **keep** carries an on-wire VR that is not one of the 34 PS3.5 section 6.2
 * defines.
 *
 * PS3.5 2026c section 6.2 requires that "All new VRs defined in future versions
 * of DICOM shall be of the same Data Element Structure as defined in [section
 * 7.1.2] with reserved bytes after the VR and a 32-bit unsigned integer VL". An
 * unrecognized VR is therefore, by the standard's own rule, long-form - while
 * this parser reads it short-form, because it trusts the two on-wire bytes
 * (Postel's Law) and only `LONG_FORM_VRS` takes the long layout. So the bytes
 * this element carries are not a Value Field this library decoded under any VR,
 * and PS3.15 section E.1.1's obligation over what is inside them cannot be
 * discharged attribute by attribute. Emptying is the fail-safe answer.
 *
 * **Neither the tag nor the VR nor the byte count is passed in, and that is the
 * point.** Every other factory in this file names the element by tag because the
 * tag came from a real Data Element header. The condition that raises *this*
 * code is that the header did not: an under-declared Value Length upstream
 * leaves the reader mid-value, so the four tag bytes, the two VR bytes **and the
 * four length bytes** are content out of some element's Value Field. Measured on
 * a synthetic `ST` carrier holding `"MR BRAIN SMITHSON"`, the fabricated tag
 * renders as `48544F53` - four bytes of the surname. `renderTag` was a shape
 * check when that bound was taken and so could not refuse one, unlike
 * `renderVr`, which means this factory is one of the places the "structural by
 * construction" property of {@link WarningTokens} has to be kept by not passing
 * the field at all. It is a membership test now; the signature bound is kept
 * because it does not depend on a table.
 *
 * **🩺 THE LENGTH WAS THE SEVENTH INSTANCE, AND THIS FACTORY IS THE SHARPEST
 * CASE OF IT.** Through `0.0.14` a `byteLength` was passed and rendered as
 * `{n}` - on the one code whose stated reason for withholding tag and VR is that
 * the header may be fabricated. It withheld the two fields a renderer could
 * check and printed the one it could not. `Element.rawBytes.length` EQUALS the
 * declared Value Length, so a fabricated header whose length field reads
 * `"SO\0\0"` published `20307`: two letters of a surname and the zero high bytes
 * every reachable fabricated length carries, reversible with one `readUInt32LE`.
 * `report.undefinedVrElements[].byteLength` still carries the number, on a type
 * documented as not value-free.
 *
 * **That leak was invisible to this package's own PHI detector for its whole
 * life**, because the `length` arm in
 * `test/integration/fatal-diagnostic-surface.test.ts` skipped any rendering
 * under seven digits, and a length a parse can actually reach is short by
 * construction: the buffer has to hold that many bytes, so its high-order bytes
 * are zero. The floor is gone.
 *
 * `byteOffset` locates the element in its place: a count this parser kept, not
 * anything the document said.
 *
 * @example
 * ```ts
 * const w = undefinedVrNotAuditable({ byteOffset: 320 });
 * ```
 */
export function undefinedVrNotAuditable(position: DicomPosition): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE, position, {
    n2: position.byteOffset,
  });
}

// ---------------------------------------------------------------------------
// Phase 3 VR-decode-time factories (D-08 / D-42).
// ---------------------------------------------------------------------------

/**
 * Build a `DICOM_BOM_IN_TEXT_VR` warning. Emitted when a charset-decoded
 * text value begins with a UTF-8 byte-order mark (`EF BB BF`) - tolerated
 * (the BOM is stripped on decode) but non-conformant per PS3.5 §6.1.2.3.
 *
 * @example
 * ```ts
 * const w = bomInTextVR({ byteOffset: 320 }, "00081030", "LO");
 * ```
 */
export function bomInTextVR(position: DicomPosition, tag: Tag, vr: VR): DicomParseWarning {
  return build(WARNING_CODES.DICOM_BOM_IN_TEXT_VR, position, { tag, vr });
}

/**
 * Build a `DICOM_TRAILING_NULL_IN_TEXT_VR` warning. Emitted when a text VR
 * that should pad with SPACE (`0x20`) instead carries a trailing NULL
 * (`0x00`) - tolerated (trimmed on decode) per PS3.5 §6.2.
 *
 * @example
 * ```ts
 * const w = trailingNullInTextVR({ byteOffset: 320 }, "00080060", "CS");
 * ```
 */
export function trailingNullInTextVR(position: DicomPosition, tag: Tag, vr: VR): DicomParseWarning {
  return build(WARNING_CODES.DICOM_TRAILING_NULL_IN_TEXT_VR, position, { tag, vr });
}

/**
 * Build a `DICOM_UI_TRAILING_SPACE` warning. Emitted when a `UI` value is
 * padded with SPACE (`0x20`) instead of the spec-mandated NULL (`0x00`)
 * per PS3.5 §6.2; tolerated (trimmed on decode).
 *
 * @example
 * ```ts
 * const w = uiTrailingSpace({ byteOffset: 132 }, "00080016");
 * ```
 */
export function uiTrailingSpace(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_UI_TRAILING_SPACE, position, { tag });
}

/**
 * Build a `DICOM_NON_ASCII_IN_ASCII_VR` warning. Emitted when a VR defined
 * as the Default Character Repertoire (ASCII) - e.g. `AE CS DA DT TM UI UR
 * DS IS AS` - contains a byte ≥ `0x80`; tolerated (decoded as Latin-1
 * best-effort) per Postel's Law.
 *
 * @example
 * ```ts
 * const w = nonAsciiInAsciiVR({ byteOffset: 200 }, "00080060", "CS");
 * ```
 */
export function nonAsciiInAsciiVR(position: DicomPosition, tag: Tag, vr: VR): DicomParseWarning {
  return build(WARNING_CODES.DICOM_NON_ASCII_IN_ASCII_VR, position, { tag, vr });
}

/**
 * Build a `DICOM_IS_NONINTEGER_VALUE` warning. Emitted when an `IS`
 * (Integer String) value does not parse to a base-10 integer - the value
 * is surfaced as `null` (never `NaN`-coerced-to-0) with the raw bytes
 * preserved on the Element.
 *
 * @example
 * ```ts
 * const w = isNonintegerValue({ byteOffset: 240 }, "00200013");
 * ```
 */
export function isNonintegerValue(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_IS_NONINTEGER_VALUE, position, { tag });
}

/**
 * Build a `DICOM_DA_LEGACY_FORMAT` warning. Emitted when a `DA` value uses
 * a tolerated non-`YYYYMMDD` form (retired dotted `YYYY.MM.DD`, or a
 * partial/empty date) - decoded best-effort, raw preserved, never thrown.
 *
 * @example
 * ```ts
 * const w = daLegacyFormat({ byteOffset: 260 }, "00080020");
 * ```
 */
export function daLegacyFormat(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DA_LEGACY_FORMAT, position, { tag });
}

/**
 * Build a `DICOM_DT_NONSTANDARD_OFFSET` warning. Emitted when a `DT` value
 * carries a malformed or out-of-range UTC offset suffix - decoded
 * best-effort, raw preserved, never thrown.
 *
 * @example
 * ```ts
 * const w = dtNonstandardOffset({ byteOffset: 280 }, "0040A120");
 * ```
 */
export function dtNonstandardOffset(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DT_NONSTANDARD_OFFSET, position, { tag });
}

/**
 * Build a `DICOM_UNSUPPORTED_CHARSET` warning. Emitted when `(0008,0005)`
 * Specific Character Set names a defined term this build cannot map to a
 * decoder - text is decoded best-effort as UTF-8 and raw bytes preserved.
 *
 * The term is **not** a parameter, and this is the site that leaked: a
 * `(0008,0005)` value is multi-valued on the backslash, every component is a
 * string a sender authored, and the warning fires precisely when PS3.3's closed
 * table does not recognize one - so there is no spelling left to vouch for it.
 * The **1-based value index** says which component instead, which is enough to
 * find it and carries nothing.
 *
 * @example
 * ```ts
 * const w = unsupportedCharset({ byteOffset: 180, fileMeta: false }, 2);
 * ```
 */
export function unsupportedCharset(position: DicomPosition, valueIndex: number): DicomParseWarning {
  return build(WARNING_CODES.DICOM_UNSUPPORTED_CHARSET, position, { n: valueIndex });
}

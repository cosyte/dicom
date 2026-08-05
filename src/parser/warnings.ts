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
import { KNOWN_VRS } from "./endian.js";
import { WITHHELD } from "./tokens.js";
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
  DICOM_ODD_LENGTH_VALUE_PADDED:
    "Element ({tag}) has odd declared length {n}; cursor advanced by one padding byte to maintain alignment.",
  DICOM_VR_MISMATCH:
    "Element ({tag}) on-wire VR is {vr2}; dictionary lists {vr}. Trusting on-wire VR.",
  DICOM_PRIVATE_TAG_NO_CREATOR:
    "Private element ({tag}) has no Private Creator registered for its block; treating as VR=UN.",
  DICOM_GROUP_LENGTH_IN_DATASET:
    "Retired Group Length element ({tag}) encountered in dataset; preserved as-is.",
  // The tag is deliberately absent, and this is the only *parser* message where
  // that is true. See `nonzeroReservedBytes`. Kept terse for the same reason the
  // de-identify messages are: it is emitted once per element, and element count
  // is attacker-chosen.
  DICOM_NONZERO_RESERVED_BYTES:
    "Non-zero reserved bytes between VR and length (first byte {n}, second byte {n2}); ignoring. Tag withheld; the byte offset identifies the element.",
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
  // The Item's own declared length is deliberately absent. See
  // `itemCrossesSequenceEnd`; `{n2}` stays because the emit site's
  // `endLimit < buffer.length` conjunct bounds it by the buffer.
  DICOM_ITEM_CROSSES_SEQUENCE_END:
    "Item ({tag}) declares a length reaching past its enclosing sequence's declared end, so it reads the enclosing Data Set's bytes; {n2} bytes remained inside the sequence. The file's two length fields disagree (PS3.5 7.5.1 and 7.5.2 govern them); the item's is used. The declared length is withheld; the byte offset locates the item.",
  DICOM_PIXEL_DATA_LENGTH_MISMATCH:
    "(7FE0,0010) PixelData declared length {n} does not match computed {n2} bytes.",
  DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR:
    "Private element ({tag}) under Implicit VR LE has no VR override; falling back to UN.",
  DICOM_PRIVATE_CREATOR_UNKNOWN:
    "Private element ({tag}) has a Private Creator the active profile's private dictionary does not name; falling back to UN. The creator string is not reproduced here - read the (gggg,00EE) element if you need it.",
  DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED:
    "Pixel Data is present and Burned In Annotation is not 'NO'; this metadata-only de-identifier cannot inspect or clean pixels. Recognizable text may remain burned into the image.",
  DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED:
    "Element ({tag}) {vr} was kept by the action table, but its value ends with {n} whole Data Element(s) - an over-declared Value Length swallowed what followed it. Emptied rather than kept, because the action table cannot see an attribute encoded inside a value. Read report.embeddedAttributes for the tags that were hidden there.",
  // Deliberately short. One of these is raised per un-auditable element, so a
  // long message is multiplied by an element count the input controls; the
  // reasoning belongs in the docs, not in a string repeated thousands of times.
  DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE:
    "Element ({tag}) is VR=SQ with no parsed items, so its {n} value bytes could not be audited (PS3.15 E.1.1); emptied. See report.unauditableSequences.",
  // Deliberately short for the same reason as the code above: one per element,
  // and the element count is chosen by the input.
  //
  // NEITHER THE TAG NOR THE VR IS ECHOED, and that is specific to this code
  // rather than caution. Every other factory's {tag} is composed from a real
  // Data Element header; the condition that raises THIS one is that the header
  // was fabricated from bytes inside some element's value, so its four tag bytes
  // and its two VR bytes are document content. `renderTag` shape-checks a tag
  // and cannot refuse one, so the withholding has to happen at the call site.
  // The byte offset locates the element instead, and is a position this parser
  // counted rather than anything the document said.
  DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE:
    "An element at byte offset {n2} carries an on-wire VR that is not one of the 34 PS3.5 6.2 defines, so its {n} value bytes are not a Value Field this library decoded; emptied (PS3.15 E.1.1). Its tag and VR are withheld: an earlier under-declared length can make them fragments of some element's value. See report.undefinedVrElements.",
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
  /** An 8-hex-char tag this parser composed from the element header's four bytes. */
  readonly tag?: Tag;
  /** A VR, checked against the closed 34-VR set before rendering. */
  readonly vr?: VR;
  /** A second VR, for the code that reports a dictionary/on-wire divergence. */
  readonly vr2?: VR;
  /** An input-derived count, length, index or byte value. */
  readonly n?: number;
  /** A second such number. */
  readonly n2?: number;
}

/** An 8-hex-char tag as this parser composes it: uppercase, exactly four bytes. */
const TAG_SHAPE = /^[0-9A-F]{8}$/u;

/**
 * Render a tag token. A tag reaching a factory is always composed here (two
 * `uint16` reads, hex-padded, upper-cased), so the check can never fire on
 * correct code; it is the guard that keeps that true if a future call site
 * passes something else, which is precisely how `unParsedAsSQ` came to be
 * passing the string `"UN"` in the tag slot.
 */
function renderTag(tag: Tag | undefined): string {
  return tag !== undefined && TAG_SHAPE.test(tag) ? tag : WITHHELD;
}

/**
 * Render a VR token. Under Explicit VR the on-wire VR is two bytes a sender
 * chose, so it is checked against the closed set rather than trusted: two bytes
 * cannot carry much, but "cannot carry much" is not a bound.
 */
function renderVr(vr: VR | undefined): string {
  return vr !== undefined && KNOWN_VRS.has(vr) ? vr : WITHHELD;
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
 * @example
 * ```ts
 * const w = oddLengthValuePadded({ byteOffset: 240 }, "00100010", 9);
 * ```
 */
export function oddLengthValuePadded(
  position: DicomPosition,
  tag: Tag,
  declaredLength: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED, position, {
    tag,
    n: declaredLength,
  });
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
 * @example
 * ```ts
 * const w = privateTagNoCreator({ byteOffset: 800 }, "00191020");
 * ```
 */
export function privateTagNoCreator(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR, position, { tag });
}

/**
 * Build a `DICOM_GROUP_LENGTH_IN_DATASET` warning. Emitted when a `(gggg,0000)`
 * Group Length element is encountered outside the File Meta group - the
 * standard retired group-length elements in PS3.5 §7.2 but real-world
 * encoders still emit them.
 *
 * @example
 * ```ts
 * const w = groupLengthInDataset({ byteOffset: 400 }, "00080000");
 * ```
 */
export function groupLengthInDataset(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET, position, { tag });
}

/**
 * Build a `DICOM_NONZERO_RESERVED_BYTES` warning. Emitted when an Explicit
 * VR long-form header has non-zero bytes in its 2-byte reserved field
 * (between VR and the 4-byte length per D-22).
 *
 * ## It takes no tag, uniquely among the parser's factories
 *
 * `renderTag` validates a tag's SHAPE and therefore cannot refuse one, so
 * `WarningTokens`' "structural by construction" property has to be kept at the
 * call site wherever the trigger is itself "these bytes are not what they claim
 * to be". **That is exactly this code's trigger.** PS3.5 §7.1.2 requires those
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
 * The two reserved bytes are reported as the **numbers** they are, in wire
 * order, rather than as a hex echo: an input-derived number is the prescribed
 * shape here, and a re-rendered slice of input is not, however short. They are
 * reported separately because composing them into one 16-bit value would have
 * to pick an endianness, and the reserved field has none: the message would then
 * read unambiguously and be wrong under one of the two transfer syntaxes.
 *
 * @example
 * ```ts
 * const w = nonzeroReservedBytes({ byteOffset: 500 }, 0x00, 0xff);
 * ```
 */
export function nonzeroReservedBytes(
  position: DicomPosition,
  first: number,
  second: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES, position, {
    n: first,
    n2: second,
  });
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
 * (`DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE`), unless `RetainSafePrivate` plus a
 * profile has vouched for it. The warning is what stops that emptying being a
 * silent drop.
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
 * where `renderTag` and `renderVr` check a shape or a closed set and a raw length
 * has neither, the bound has to be **the signature** rather than a branch. The
 * factory cannot be handed the value, so no future call site can put it back
 * without changing this signature.
 *
 * **`{n2}` stays, and the asymmetry is structural rather than a judgement call.**
 * It is `endLimit - cursor.position` under the emit site's `endLimit <
 * buffer.length` conjunct, so it is bounded by the buffer: a byte count inside
 * the file, which is the class this package's frozen-registry contract already
 * names. Measured against the same attack: fabricating the **`SQ`**'s length
 * field over `"SMITHSON"` puts `endLimit` past the buffer, so this code does not
 * fire at all and the parse dies on the pre-existing item-header truncation
 * guard. Both measurements are pinned in
 * `test/integration/explicit-sq-item-bound.test.ts` with a name-bearing payload
 * and a mutation control, and
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
 * and `renderTag` shape-checks a tag and therefore cannot refuse one. Identical
 * remedy and reasoning to {@link nonzeroReservedBytes} and
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
 * posture for parser warnings, not something new here. **And it does not reach
 * the File Meta group**, which `parseFileMeta` accumulates into an array and not
 * a map, so nothing is overwritten there.
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
 * Build a `DICOM_PIXEL_DATA_LENGTH_MISMATCH` warning for a defined-length
 * `(7FE0,0010)` element whose declared length does not match
 * `rows × columns × samplesPerPixel × bitsAllocated/8 × numberOfFrames` (D-32).
 *
 * @remarks
 * Declared but **not emitted** by this build: no call site exists in `src/`.
 * Kept so the code and its shape stay stable for the phase that activates it.
 *
 * @example
 * ```ts
 * const w = pixelDataLengthMismatch({ byteOffset: 1024 }, 524288, 524300);
 * ```
 */
export function pixelDataLengthMismatch(
  position: DicomPosition,
  declared: number,
  computed: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH, position, {
    n: declared,
    n2: computed,
  });
}

/**
 * Build a `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` warning. Emitted
 * under Implicit VR LE for a private tag whose creator is registered but
 * whose VR cannot be resolved (Phase 2 always falls back to UN; Phase 6
 * adds profile-supplied VR overrides per D-21 / D-34).
 *
 * @example
 * ```ts
 * const w = implicitVRForPrivateTagWithoutVR({ byteOffset: 900 }, "00191020");
 * ```
 */
export function implicitVRForPrivateTagWithoutVR(
  position: DicomPosition,
  tag: Tag,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR, position, { tag });
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
 * warning fires precisely when no closed set vouches for it. `position` and the
 * element tag say where to look; the bytes stay on the `(gggg,00EE)` element.
 *
 * @example
 * ```ts
 * const w = privateCreatorUnknown({ byteOffset: 900 }, "00191020");
 * ```
 */
export function privateCreatorUnknown(position: DicomPosition, tag: Tag): DicomParseWarning {
  return build(WARNING_CODES.DICOM_PRIVATE_CREATOR_UNKNOWN, position, { tag });
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
 * `deidentify()` - never by the parser - when an `SQ` element the run was about
 * to **keep** carries no materialized `items`, so its value is an item stream
 * the de-identifier cannot walk.
 *
 * The shape that reaches it is announced by the parser first: a defined-length
 * Implicit VR LE value whose dictionary-resolved `SQ` was not a valid item
 * stream (`DICOM_SQ_NOT_DESCENDED`). PS3.5 section 7.5.1 says those bytes are
 * "a DICOM Data Set composed of Data Elements" and PS3.15 section E.1.1 obliges
 * the de-identifier to protect the listed Attributes "whether contained in the
 * top level Data Set or embedded in an Item of a Sequence of Items". Unable to
 * enumerate them, it empties the carrier.
 *
 * **It does NOT cover the CP-246 `UN` shape, and that is a deliberate line.** An
 * undefined-length `UN` whose descent was refused keeps `vr === "UN"`, and every
 * ordinary `UN` element also has `items === undefined`, so the same test applied
 * there would empty every unknown-VR element in every file. Distinguishing a
 * refused descent from a plain `UN` needs a mark the parser does not currently
 * set. Measured, still leaking, and disclosed rather than guessed at.
 *
 * `tag` is this parser's own composed structural field and `n` is the value's
 * byte length; no decoded value travels through the message.
 *
 * @example
 * ```ts
 * const w = sequenceNotAuditable({ byteOffset: 320 }, "00081115", 48);
 * ```
 */
export function sequenceNotAuditable(
  position: DicomPosition,
  tag: Tag,
  byteLength: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE, position, {
    tag,
    n: byteLength,
  });
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
 * **Neither the tag nor the VR is passed in, and that is the point.** Every
 * other factory in this file names the element by tag because the tag came from
 * a real Data Element header. The condition that raises *this* code is that the
 * header did not: an under-declared Value Length upstream leaves the reader
 * mid-value, so the four tag bytes and the two VR bytes are content out of some
 * element's Value Field. Measured on a synthetic `ST` carrier holding
 * `"MR BRAIN SMITHSON"`, the fabricated tag renders as `48544F53` - four bytes
 * of the surname. `renderTag` validates a tag's *shape* and so cannot refuse
 * one, unlike `renderVr`, which means this factory is the one place the
 * "structural by construction" property of {@link WarningTokens} has to be kept
 * by not passing the field at all.
 *
 * `byteOffset` locates the element in its place: a count this parser kept, not
 * anything the document said.
 *
 * @example
 * ```ts
 * const w = undefinedVrNotAuditable({ byteOffset: 320 }, 16);
 * ```
 */
export function undefinedVrNotAuditable(
  position: DicomPosition,
  byteLength: number,
): DicomParseWarning {
  return build(WARNING_CODES.DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE, position, {
    n: byteLength,
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

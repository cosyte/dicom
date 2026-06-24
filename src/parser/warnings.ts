/**
 * Tier-2 warning registry and factories for the `@cosyte/dicom` parser
 * pipeline.
 *
 * Phase 2 core-parser context:
 *   - D-08 — `WARNING_CODES` is a frozen `as const` registry with every code
 *     in the TOL-03 catalog (≥25 entries). Phase 2 actively emits 13;
 *     7 VR-decode-time codes are reserved for Phase 3; 2 charset codes are
 *     reserved for Phase 4; 2 codes are reserved for Phase 6 / Phase 7.
 *   - D-12 — Exactly one named factory per actively-emitted code; each
 *     factory carries its own JSDoc + `@example` and returns a typed
 *     `DicomParseWarning`.
 *
 * Consumers compare `warning.code === WARNING_CODES.<CODE>` to narrow and
 * react; the parser uses the factories here so message templates, payload
 * shape, and positional context stay consistent across stages.
 *
 * @module
 */

import type { VR } from "../dictionary/types.js";
import type { DicomPosition } from "./types.js";

/**
 * Stable string codes for every Tier-2 warning the parser may emit.
 *
 * The registry is frozen via `as const` so TypeScript infers the exact
 * string-literal union for `WarningCode` — there is zero runtime cost and
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
  // === Phase 2 actively emits (D-08 active list — alphabetical-within-prefix per CONTEXT specifics §) ===
  DICOM_EMPTY_ITEM_IN_SEQUENCE: "DICOM_EMPTY_ITEM_IN_SEQUENCE",
  DICOM_FILE_META_GROUP_LENGTH_MISMATCH: "DICOM_FILE_META_GROUP_LENGTH_MISMATCH",
  DICOM_FILE_META_GROUP_LENGTH_MISSING: "DICOM_FILE_META_GROUP_LENGTH_MISSING",
  DICOM_GROUP_LENGTH_IN_DATASET: "DICOM_GROUP_LENGTH_IN_DATASET",
  DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR: "DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR",
  DICOM_MISSING_PREAMBLE: "DICOM_MISSING_PREAMBLE",
  DICOM_NONZERO_RESERVED_BYTES: "DICOM_NONZERO_RESERVED_BYTES",
  DICOM_ODD_LENGTH_VALUE_PADDED: "DICOM_ODD_LENGTH_VALUE_PADDED",
  DICOM_PIXEL_DATA_LENGTH_MISMATCH: "DICOM_PIXEL_DATA_LENGTH_MISMATCH",
  DICOM_PRIVATE_TAG_NO_CREATOR: "DICOM_PRIVATE_TAG_NO_CREATOR",
  DICOM_UN_PARSED_AS_SQ: "DICOM_UN_PARSED_AS_SQ",
  DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR: "DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR",
  DICOM_VR_MISMATCH: "DICOM_VR_MISMATCH",

  // === VR-decode-time codes (declared but not emitted in Phase 2; Phase 3 lazy decoders fire these — D-08, D-42) ===
  DICOM_BOM_IN_TEXT_VR: "DICOM_BOM_IN_TEXT_VR",
  DICOM_DA_LEGACY_FORMAT: "DICOM_DA_LEGACY_FORMAT",
  DICOM_DT_NONSTANDARD_OFFSET: "DICOM_DT_NONSTANDARD_OFFSET",
  DICOM_IS_NONINTEGER_VALUE: "DICOM_IS_NONINTEGER_VALUE",
  DICOM_NON_ASCII_IN_ASCII_VR: "DICOM_NON_ASCII_IN_ASCII_VR",
  DICOM_TRAILING_NULL_IN_TEXT_VR: "DICOM_TRAILING_NULL_IN_TEXT_VR",
  DICOM_UI_TRAILING_SPACE: "DICOM_UI_TRAILING_SPACE",

  // === Phase 4 charset-decode codes (declared, not emitted in Phase 2 — D-08, D-43) ===
  DICOM_CHARSET_AMBIGUOUS_SEPARATOR: "DICOM_CHARSET_AMBIGUOUS_SEPARATOR",
  DICOM_UNSUPPORTED_CHARSET: "DICOM_UNSUPPORTED_CHARSET",

  // === Reserved by later phases (declared, not emitted in Phase 2) ===
  DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED: "DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED", // reserved by Phase 7 — not emitted in Phase 2
  DICOM_PRIVATE_CREATOR_UNKNOWN: "DICOM_PRIVATE_CREATOR_UNKNOWN", // reserved by Phase 6 — not emitted in Phase 2
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
 * Per D-07 there is intentionally NO `snippet` field on warnings —
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
 * Build a `DICOM_MISSING_PREAMBLE` warning. Emitted once per parse when no
 * `DICM` magic is present at offset 128 and `stripPreamble` is `"tolerate"`.
 *
 * @example
 * ```ts
 * import { missingPreamble } from "@cosyte/dicom";
 * const w = missingPreamble({ byteOffset: 0 });
 * ```
 */
export function missingPreamble(position: DicomPosition): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_MISSING_PREAMBLE,
    message: "No DICM magic at offset 128; falling back to offset-0 dataset.",
    position,
  };
}

/**
 * Build a `DICOM_FILE_META_GROUP_LENGTH_MISSING` warning. Emitted when the
 * File Meta group does not start with `(0002,0000)
 * FileMetaInformationGroupLength` — the parser falls back to scanning
 * forward until the first non-`(0002,xxxx)` element (D-18).
 *
 * @example
 * ```ts
 * import { fileMetaGroupLengthMissing } from "@cosyte/dicom";
 * const w = fileMetaGroupLengthMissing({ byteOffset: 132, fileMeta: true });
 * ```
 */
export function fileMetaGroupLengthMissing(position: DicomPosition): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
    message:
      "(0002,0000) FileMetaInformationGroupLength missing; scanning forward to first non-(0002,xxxx) element.",
    position,
  };
}

/**
 * Build a `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` warning. Emitted when
 * `(0002,0000)` declares a byte count that does not match the actual size
 * of the File Meta group; the parser trusts the actual size (D-18).
 *
 * @example
 * ```ts
 * import { fileMetaGroupLengthMismatch } from "@cosyte/dicom";
 * const w = fileMetaGroupLengthMismatch({ byteOffset: 132, fileMeta: true }, 200, 208);
 * ```
 */
export function fileMetaGroupLengthMismatch(
  position: DicomPosition,
  declared: number,
  actual: number,
): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH,
    message: `(0002,0000) FileMetaInformationGroupLength declared ${String(declared)} bytes; actual File Meta group size is ${String(actual)} bytes. Trusting actual.`,
    position,
  };
}

/**
 * Build a `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` warning. Emitted for an
 * SQ element with length `0xFFFFFFFF` parsed under an Explicit VR transfer
 * syntax — legal per the standard but commonly misencoded by older tools
 * (D-29).
 *
 * @example
 * ```ts
 * import { undefinedLengthInExplicitVR } from "@cosyte/dicom";
 * const w = undefinedLengthInExplicitVR({ byteOffset: 512 }, "0040A730");
 * ```
 */
export function undefinedLengthInExplicitVR(
  position: DicomPosition,
  tag: string,
): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR,
    message: `Element (${tag}) uses undefined length (0xFFFFFFFF) under an Explicit VR transfer syntax.`,
    position,
  };
}

/**
 * Build a `DICOM_ODD_LENGTH_VALUE_PADDED` warning. Emitted when an element's
 * declared length is odd and the parser pads forward by one byte to keep
 * cursor alignment (PITFALLS.md §6.1).
 *
 * @example
 * ```ts
 * import { oddLengthValuePadded } from "@cosyte/dicom";
 * const w = oddLengthValuePadded({ byteOffset: 240 }, "00100010", 9);
 * ```
 */
export function oddLengthValuePadded(
  position: DicomPosition,
  tag: string,
  declaredLength: number,
): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED,
    message: `Element (${tag}) has odd declared length ${String(declaredLength)}; cursor advanced by one padding byte to maintain alignment.`,
    position,
  };
}

/**
 * Build a `DICOM_VR_MISMATCH` warning. Emitted when an Explicit VR element's
 * on-wire VR differs from the value the data dictionary lists for that tag.
 * The parser trusts the on-wire VR (Postel's Law) but flags the divergence.
 *
 * @example
 * ```ts
 * import { vrMismatch } from "@cosyte/dicom";
 * const w = vrMismatch({ byteOffset: 300 }, "00100010", "PN", "LO");
 * ```
 */
export function vrMismatch(
  position: DicomPosition,
  tag: string,
  dictVR: VR,
  fileVR: VR,
): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_VR_MISMATCH,
    message: `Element (${tag}) on-wire VR is ${fileVR}; dictionary lists ${dictVR}. Trusting on-wire VR.`,
    position,
  };
}

/**
 * Build a `DICOM_PRIVATE_TAG_NO_CREATOR` warning. Emitted when a private
 * element `(gggg,EEFF)` is encountered without a preceding Private Creator
 * `(gggg,00EE)` registration in the same group (PITFALLS.md §7.1, D-33).
 *
 * @example
 * ```ts
 * import { privateTagNoCreator } from "@cosyte/dicom";
 * const w = privateTagNoCreator({ byteOffset: 800 }, "00191020");
 * ```
 */
export function privateTagNoCreator(position: DicomPosition, tag: string): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR,
    message: `Private element (${tag}) has no Private Creator registered for its block; treating as VR=UN.`,
    position,
  };
}

/**
 * Build a `DICOM_GROUP_LENGTH_IN_DATASET` warning. Emitted when a `(gggg,0000)`
 * Group Length element is encountered outside the File Meta group — the
 * standard retired group-length elements in PS3.5 §7.2 but real-world
 * encoders still emit them.
 *
 * @example
 * ```ts
 * import { groupLengthInDataset } from "@cosyte/dicom";
 * const w = groupLengthInDataset({ byteOffset: 400 }, "00080000");
 * ```
 */
export function groupLengthInDataset(position: DicomPosition, tag: string): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET,
    message: `Retired Group Length element (${tag}) encountered in dataset; preserved as-is.`,
    position,
  };
}

/**
 * Build a `DICOM_NONZERO_RESERVED_BYTES` warning. Emitted when an Explicit
 * VR long-form header has non-zero bytes in its 2-byte reserved field
 * (between VR and the 4-byte length per D-22).
 *
 * @example
 * ```ts
 * import { nonzeroReservedBytes } from "@cosyte/dicom";
 * const w = nonzeroReservedBytes({ byteOffset: 500 }, "7FE00010", "00ff");
 * ```
 */
export function nonzeroReservedBytes(
  position: DicomPosition,
  tag: string,
  observed: string,
): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES,
    message: `Element (${tag}) has non-zero reserved bytes (${observed}) between VR and length; ignoring.`,
    position,
  };
}

/**
 * Build a `DICOM_UN_PARSED_AS_SQ` warning. Emitted when a `VR=UN` element
 * with undefined length is successfully descended as an Implicit VR LE
 * sequence (CP-246 fallback per D-30).
 *
 * @example
 * ```ts
 * import { unParsedAsSQ } from "@cosyte/dicom";
 * const w = unParsedAsSQ({ byteOffset: 600 }, "0040A730");
 * ```
 */
export function unParsedAsSQ(position: DicomPosition, tag: string): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_UN_PARSED_AS_SQ,
    message: `Element (${tag}) declared VR=UN with undefined length; descended as Implicit VR LE sequence per CP-246.`,
    position,
  };
}

/**
 * Build a `DICOM_EMPTY_ITEM_IN_SEQUENCE` warning. Emitted when an
 * `(FFFE,E000) Item` marker has length 0 — tolerated per D-28 but flagged
 * as it usually signals a sender bug.
 *
 * @example
 * ```ts
 * import { emptyItemInSequence } from "@cosyte/dicom";
 * const w = emptyItemInSequence({ byteOffset: 700 }, "0040A730");
 * ```
 */
export function emptyItemInSequence(position: DicomPosition, tag: string): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE,
    message: `Sequence (${tag}) contains an empty item (length=0); tolerated.`,
    position,
  };
}

/**
 * Build a `DICOM_PIXEL_DATA_LENGTH_MISMATCH` warning. Emitted when a
 * defined-length `(7FE0,0010)` element's declared length does not match
 * `rows × columns × samplesPerPixel × bitsAllocated/8 × numberOfFrames`
 * (D-32). Phase 2 emits this in a small post-pass after structural parsing.
 *
 * @example
 * ```ts
 * import { pixelDataLengthMismatch } from "@cosyte/dicom";
 * const w = pixelDataLengthMismatch({ byteOffset: 1024 }, 524288, 524300);
 * ```
 */
export function pixelDataLengthMismatch(
  position: DicomPosition,
  declared: number,
  computed: number,
): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_PIXEL_DATA_LENGTH_MISMATCH,
    message: `(7FE0,0010) PixelData declared length ${String(declared)} does not match computed ${String(computed)} bytes.`,
    position,
  };
}

/**
 * Build a `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` warning. Emitted
 * under Implicit VR LE for a private tag whose creator is registered but
 * whose VR cannot be resolved (Phase 2 always falls back to UN; Phase 6
 * adds profile-supplied VR overrides per D-21 / D-34).
 *
 * @example
 * ```ts
 * import { implicitVRForPrivateTagWithoutVR } from "@cosyte/dicom";
 * const w = implicitVRForPrivateTagWithoutVR({ byteOffset: 900 }, "00191020");
 * ```
 */
export function implicitVRForPrivateTagWithoutVR(
  position: DicomPosition,
  tag: string,
): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR,
    message: `Private element (${tag}) under Implicit VR LE has no VR override; falling back to UN.`,
    position,
  };
}

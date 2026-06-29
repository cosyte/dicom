/**
 * Shared element-header primitives for Phase 2's transfer-syntax parsers.
 *
 * Phase 2 core-parser context:
 *   - D-22 — `LONG_FORM_VRS` is the set of VRs that use the long-form
 *     header layout (2-byte VR + 2 reserved bytes + 4-byte length).
 *     Internally exported for the Phase 5 serializer per D-44.
 *   - D-21 — `resolveImplicitVR` implements the 5-case Implicit VR LE
 *     fallback decision tree (single VR / multi-VR / repeating-group
 *     family / private tag → UN / unknown standard tag → UN).
 *   - D-33 / D-34 + PITFALLS §7.1 — private-creator stack tracking via
 *     `registerPrivateCreator` / `resolvePrivateCreator`. Implements the
 *     PS3.5 §7.8 block-reservation rule (creator at `(gggg,00XX)` reserves
 *     `(gggg,XX00)..(gggg,XXFF)`) and closes the off-by-0x1000 trap.
 *
 * The module is internal-export only; consumers reach these primitives
 * through the per-TS parser strategies (plans 02-03 / 02-04 / 02-05).
 *
 * @module
 */

import { TAGS } from "../dictionary/generated/tags.js";
import type { Buffer } from "node:buffer";

import { isKnownCharsetTerm, parseSpecificCharacterSet } from "../dataset/vr/charset.js";
import type { DictionaryEntry, Tag, VR } from "../dictionary/types.js";
import type { ByteCursor } from "./byte-cursor.js";
import type { DicomPosition, ParseContext } from "./types.js";
import {
  implicitVRForPrivateTagWithoutVR,
  nonzeroReservedBytes,
  privateCreatorUnknown,
  privateTagNoCreator,
  unsupportedCharset,
  type DicomParseWarning,
} from "./warnings.js";
import { resolvePrivateTag } from "../profiles/lookup.js";

/** The `(0008,0005)` Specific Character Set tag. */
const SPECIFIC_CHARACTER_SET_TAG: Tag = "00080005";

/**
 * When `tag` is `(0008,0005)`, parse its value into Specific Character Set
 * terms and record them on `ctx.currentCharset` so subsequent elements
 * decode their text correctly (PS3.3 §C.12.1.1.2). Unknown terms emit
 * `DICOM_UNSUPPORTED_CHARSET` and decoding falls back to UTF-8 best-effort.
 *
 * @internal
 */
export function applySpecificCharacterSet(
  tag: Tag,
  value: Buffer,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  position: DicomPosition,
): void {
  if (tag !== SPECIFIC_CHARACTER_SET_TAG) return;
  const terms = parseSpecificCharacterSet(value);
  for (const term of terms) {
    if (!isKnownCharsetTerm(term)) emit(unsupportedCharset(position, term));
  }
  ctx.currentCharset = terms;
}

/**
 * VRs whose Explicit VR header uses the long form: 2-byte VR + 2 reserved
 * bytes (must be `0x00 0x00`; non-zero emits
 * `DICOM_NONZERO_RESERVED_BYTES`) + 4-byte length.
 *
 * Per D-22, corrected for CP-2199: the 13-VR set is the union of
 * OB/OW/OF/OD/OL/OV (octet-stream variants), SQ (sequences),
 * UT/UN/UC/UR (unlimited-length text / unknown / unlimited-character / URI),
 * and the 64-bit SV/UV (which are long-form, NOT short-form). Phase 5
 * serializer reuses this set for symmetric long-form encoding (D-44).
 *
 * @example
 * ```ts
 * import { LONG_FORM_VRS } from "@cosyte/dicom";
 * LONG_FORM_VRS.has("SQ"); // true
 * LONG_FORM_VRS.has("PN"); // false
 * ```
 */
export const LONG_FORM_VRS: ReadonlySet<VR> = new Set<VR>([
  "OB",
  "OW",
  "OF",
  "OD",
  "OL",
  "OV",
  "SQ",
  "UT",
  "UN",
  "UC",
  "UR",
  "SV",
  "UV",
]);

// ---------------------------------------------------------------------------
// Implicit VR LE — VR resolution (D-21)
// ---------------------------------------------------------------------------

/**
 * Resolve the VR for an Implicit VR LE element via the 5-case fallback per
 * CONTEXT.md D-21:
 *
 *   1. Standard tag with single VR in dict → use it.
 *   2. Standard tag with multi-VR entry → use the first array entry. The
 *      multi-VR ambiguity is a known DICOM data-dictionary quirk; resolved
 *      here by always picking the first listed VR.
 *   3. Standard tag matching a repeating-group family
 *      (`(50xx,xxxx)`, `(60xx,xxxx)`, `(7Fxx,xxxx)`, `(1000,xxxX)`,
 *      `(1010,xxxx)`) → use the family entry's first VR.
 *   4. Private tag (odd group):
 *        - `(gggg,0010..00FF)` Private Creator slot → VR=LO (PS3.5 §7.8).
 *        - No creator registered for the block → fallback UN; emit
 *          `DICOM_PRIVATE_TAG_NO_CREATOR` (TOL-09) +
 *          `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`.
 *        - Creator registered + active profile resolves the
 *          `(group, creator, element-byte)` triple → vendor-documented VR,
 *          no warning (Phase 6 / D-45).
 *        - Creator registered but unresolved → fallback UN; emit
 *          `DICOM_PRIVATE_CREATOR_UNKNOWN` when an active profile does not
 *          recognize the creator, plus
 *          `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`.
 *   5. Unknown standard tag (not in dict, not a repeating-group family)
 *      → fallback UN silently — the standard explicitly allows this.
 *
 * @internal
 */
export function resolveImplicitVR(
  tag: Tag,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  position: DicomPosition,
): VR {
  // Case 4 first — private (odd-group) tags never resolve via dictionary
  // tag lookup (they're vendor-specific) other than the creator-slot path.
  const group = parseInt(tag.slice(0, 4), 16);
  const isPrivate = group % 2 === 1;
  if (isPrivate) {
    const element = parseInt(tag.slice(4, 8), 16);
    if (element >= 0x0010 && element <= 0x00ff) {
      // Private Creator slot — VR is always LO per PS3.5 §7.8.
      return "LO";
    }
    const creator = resolvePrivateCreator(tag, ctx);
    if (creator === undefined) {
      emit(privateTagNoCreator(position, tag));
      emit(implicitVRForPrivateTagWithoutVR(position, tag));
      return "UN";
    }
    // Phase 6 (D-45): an active profile's private-dictionary overlay may
    // resolve the VR from the live creator string. A hit returns the
    // vendor-documented VR with no warning; otherwise we degrade to UN. When
    // the profile does not recognize the creator at all, that degrade is
    // flagged with DICOM_PRIVATE_CREATOR_UNKNOWN — never a wrong decode.
    if (ctx.profile !== undefined) {
      const def = resolvePrivateTag(ctx.profile, tag, creator);
      if (def !== undefined) return def.vr;
      if (!ctx.profile.privateDictionary.has(creator)) {
        emit(privateCreatorUnknown(position, tag, creator));
      }
    }
    emit(implicitVRForPrivateTagWithoutVR(position, tag));
    return "UN";
  }

  // Cases 1, 2, 3, 5 — standard (even-group) tag.
  const direct = TAGS[tag];
  if (direct !== undefined) {
    // Case 1 / 2: dict has a direct entry. Pick first VR (multi-VR
    // ambiguity documented above).
    return direct.vr[0] ?? "UN";
  }
  // Case 3: try repeating-group family match.
  const family = matchRepeatingGroup(tag);
  if (family !== undefined) {
    return family.vr[0] ?? "UN";
  }
  // Case 5: unknown standard tag — silent UN fallback.
  return "UN";
}

// ---------------------------------------------------------------------------
// Private-creator stack (D-33 / D-34, PITFALLS §7.1)
// ---------------------------------------------------------------------------

/**
 * Resolve the registered Private Creator for a private element via the
 * block-reservation rule per PS3.5 §7.8 + PITFALLS §7.1.
 *
 * The block-reservation mechanic: a Private Creator declaration at
 * `(gggg,00XX)` (where `0x10 ≤ XX ≤ 0xFF`, VR=LO) reserves the block
 * `(gggg,XX00)..(gggg,XXFF)` for that vendor. Element `(gggg,EEFF)` (with
 * `0x10 ≤ EE ≤ 0xFF` in the high byte of the element id) is owned by
 * `creators[gggg].get(EE)`.
 *
 * Returns `undefined` for non-private (even-group) tags, for private
 * creator slots themselves (`(gggg,0010..00FF)`), or when no creator is
 * registered for the element's block.
 *
 * @internal
 */
export function resolvePrivateCreator(tag: Tag, ctx: ParseContext): string | undefined {
  const group = parseInt(tag.slice(0, 4), 16);
  if (group % 2 === 0) return undefined;
  const element = parseInt(tag.slice(4, 8), 16);
  // The creator slot itself is below 0x1000; only data elements above
  // 0x1000 reference back to a creator block.
  if (element < 0x1000 || element > 0xffff) return undefined;
  // Element (gggg,EEFF) with 0x10 ≤ EE ≤ 0xFF is owned by Private
  // Creator (gggg,00EE). Extract EE from the high byte of the element id.
  const blockId = (element >> 8) & 0xff;
  if (blockId < 0x10 || blockId > 0xff) return undefined;
  return ctx.creators.get(group)?.get(blockId);
}

/**
 * Register a Private Creator declaration `(gggg,00XX) VR=LO` into
 * `ctx.creators`. Called by per-TS parser strategies when a creator
 * element is read.
 *
 * Trims trailing ASCII space (`0x20`) and NUL (`0x00`) padding from the
 * decoded creator string per PS3.5 LO conventions. Empty creator strings
 * (all padding) are silently ignored.
 *
 * @internal
 */
export function registerPrivateCreator(tag: Tag, value: Buffer, ctx: ParseContext): void {
  const group = parseInt(tag.slice(0, 4), 16);
  if (group % 2 === 0) return;
  const element = parseInt(tag.slice(4, 8), 16);
  if (element < 0x0010 || element > 0x00ff) return;
  // Trim trailing space / NUL padding per PS3.5 LO conventions.
  let end = value.length;
  while (end > 0 && (value[end - 1] === 0x20 || value[end - 1] === 0x00)) end--;
  const creatorString = value.subarray(0, end).toString("ascii");
  if (creatorString.length === 0) return;
  let inner = ctx.creators.get(group);
  if (inner === undefined) {
    inner = new Map<number, string>();
    ctx.creators.set(group, inner);
  }
  inner.set(element, creatorString);
}

// ---------------------------------------------------------------------------
// Repeating-group family resolution (D-21 case 3)
// ---------------------------------------------------------------------------

/**
 * Memoized list of repeating-group family entries from the dictionary.
 * Computed once on first call (the dictionary is frozen and the family
 * list is small).
 */
let cachedFamilyEntries: readonly DictionaryEntry[] | undefined;

function getFamilyEntries(): readonly DictionaryEntry[] {
  if (cachedFamilyEntries !== undefined) return cachedFamilyEntries;
  const out: DictionaryEntry[] = [];
  for (const k of Object.keys(TAGS)) {
    const e = TAGS[k];
    if (e !== undefined && e.repeatingGroup === true) out.push(e);
  }
  cachedFamilyEntries = Object.freeze(out);
  return cachedFamilyEntries;
}

/**
 * Match a concrete 8-hex-char tag against any repeating-group family
 * pattern from the dictionary. The family pattern's `tag` field carries
 * lowercase `x` placeholders that act as wildcards (e.g., `"50xx3000"`
 * matches concrete tag `"50A03000"`).
 *
 * Returns the first matching family entry or `undefined` when no family
 * matches.
 *
 * @internal
 */
export function matchRepeatingGroup(tag: Tag): DictionaryEntry | undefined {
  const families = getFamilyEntries();
  for (const fam of families) {
    if (matchesFamilyPattern(fam.tag, tag)) return fam;
  }
  return undefined;
}

function matchesFamilyPattern(pattern: string, concrete: Tag): boolean {
  if (pattern.length !== 8 || concrete.length !== 8) return false;
  for (let i = 0; i < 8; i++) {
    const p = pattern[i];
    const c = concrete[i];
    if (p === undefined || c === undefined) return false;
    if (p === "x" || p === "X") continue;
    if (p.toUpperCase() !== c.toUpperCase()) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Explicit VR LE / BE — element-header reader (D-22 + D-25)
// ---------------------------------------------------------------------------

/**
 * Result of reading an Explicit-VR element header (LE or BE — endianness
 * is determined by the supplied `ByteCursor`'s `littleEndian` field).
 *
 * @internal
 */
export interface ExplicitElementHeader {
  readonly tag: Tag;
  readonly vr: VR;
  readonly length: number;
  /** Offset of the first byte of the header (group bytes). */
  readonly headerStart: number;
  /** Header byte length: 8 (short-form) or 12 (long-form). */
  readonly headerLength: 8 | 12;
}

/**
 * Read an Explicit-VR element header from `cursor` per D-22:
 *   - Short-form: group(2) + element(2) + VR(2 ASCII) + length(2).
 *   - Long-form (when VR ∈ {@link LONG_FORM_VRS}): group(2) + element(2) +
 *     VR(2 ASCII) + reserved(2 — must be `0x00 0x00`) + length(4).
 *
 * Endianness comes from the cursor — group / element / length use
 * `cursor.readUInt16` / `readUInt32`. The 2-byte VR field is ASCII and
 * never byte-swapped; reserved bytes are read directly from the buffer
 * (also endian-agnostic — they're a 2-byte zero-pad regardless).
 *
 * Non-zero reserved bytes emit `DICOM_NONZERO_RESERVED_BYTES` (D-22)
 * and parsing continues — length is read from the explicit 4-byte field
 * regardless of the reserved-byte payload.
 *
 * Caller is responsible for catching `RangeError` from the cursor and
 * re-throwing as `DicomParseError(INVALID_FILE_META)` with positional
 * context (per the per-TS parser's truncation-mitigation pattern).
 *
 * @internal
 */
export function readExplicitElementHeader(
  cursor: ByteCursor,
  _ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): ExplicitElementHeader {
  const headerStart = cursor.position;
  const group = cursor.readUInt16();
  const element = cursor.readUInt16();
  const tag: Tag =
    `${group.toString(16).padStart(4, "0")}${element.toString(16).padStart(4, "0")}`.toUpperCase();
  // VR is always 2 ASCII bytes regardless of cursor endianness.
  const vrSlice = cursor.slice(2);
  const vr = vrSlice.toString("ascii") as VR;

  let length: number;
  let headerLength: 8 | 12;
  if (LONG_FORM_VRS.has(vr)) {
    // 2 reserved bytes (must be 0x00 0x00 per D-22) + 4-byte length.
    const reserved0 = cursor.buffer[cursor.position];
    const reserved1 = cursor.buffer[cursor.position + 1];
    cursor.position += 2;
    if ((reserved0 ?? 0) !== 0x00 || (reserved1 ?? 0) !== 0x00) {
      const observed =
        (reserved0 ?? 0).toString(16).padStart(2, "0") +
        (reserved1 ?? 0).toString(16).padStart(2, "0");
      emit(nonzeroReservedBytes({ byteOffset: headerStart }, tag, observed));
    }
    length = cursor.readUInt32();
    headerLength = 12;
  } else {
    length = cursor.readUInt16();
    headerLength = 8;
  }
  return { tag, vr, length, headerStart, headerLength };
}

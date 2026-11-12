/**
 * VR-aware value dispatch - the body behind `Element.value`.
 *
 * `decodeElementValue` maps an `Element`'s `vr` + raw bytes to a typed
 * {@link DicomValue}, applying the fail-safe rules from PS3.5 §6.2:
 *
 *   - **Signedness / endianness from the VR + transfer syntax**, never
 *     guessed (numeric VRs via `./numeric`).
 *   - **Padding**: `UI` strips trailing NULL (`0x00`); every other string VR
 *     strips trailing SPACE (`0x20`). A mismatched pad is tolerated and
 *     flagged (`DICOM_UI_TRAILING_SPACE` / `DICOM_TRAILING_NULL_IN_TEXT_VR`).
 *   - **Charset**: `LO SH UC LT ST UT PN` decode through `(0008,0005)`;
 *     the remaining string VRs are the Default Repertoire (ASCII, decoded
 *     Latin-1-lenient with `DICOM_NON_ASCII_IN_ASCII_VR` on stray bytes).
 *     A single-byte set decodes by its own table (`./single-byte`), and a
 *     byte it does not define reads as U+FFFD with
 *     `DICOM_CHARSET_BYTES_UNDECODABLE`, once per value.
 *     A multi-valued `(0008,0005)` decodes with ISO 2022 code extensions
 *     (`./iso2022`), resetting to Value 1 at the VR's own delimiters, and
 *     flags `DICOM_CHARSET_ESCAPE_UNDECLARED`,
 *     `DICOM_CHARSET_BYTES_UNDECODABLE` and
 *     `DICOM_CHARSET_EXTENSION_NOT_RESET` at most once each per value.
 *   - **Numeric strings** `DS`/`IS` → `number | null` (never `NaN`→0).
 *   - **Temporal** `DA`/`TM`/`DT` → tolerant typed values (warn + preserve).
 *   - **Bulk** `OB OD OF OL OV OW UN` → raw `binary` (not interpreted in v1).
 *
 * Decode is lazy/post-parse, so any deviation surfaces on the returned
 * value's `warnings` (it cannot join the frozen `Dataset.warnings`).
 *
 * This module is kept OUT of `vr/index.ts` so the dispatch logic is
 * coverage-measured (barrels are excluded from the gate).
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { VR } from "../../dictionary/types.js";
import type { DicomPosition } from "../../parser/types.js";
import {
  bomInTextVR,
  charsetBytesUndecodable,
  charsetEscapeUndeclared,
  charsetExtensionNotReset,
  daLegacyFormat,
  dtNonstandardOffset,
  isNonintegerValue,
  nonAsciiInAsciiVR,
  trailingNullInTextVR,
  uiTrailingSpace,
  type DicomParseWarning,
} from "../../parser/warnings.js";
import {
  type Element,
  elementValueEnd,
  elementValueSource,
  elementValueStart,
} from "../element.js";
import { decodeText, singleByteSetIn } from "./charset.js";
import { parseDate, parseDateTime, parseTime } from "./datetime.js";
import { decodeWithCodeExtensions, usesCodeExtensions, type DelimiterClass } from "./iso2022.js";
import { decodeAttributeTags, decodeBigInts, decodeNumbersIn } from "./numeric.js";
import { parsePersonName } from "./person-name.js";
import { decodeSingleByte } from "./single-byte.js";
import type { DicomDate, DicomDateTime, DicomTime, DicomValue, PersonName } from "./types.js";

const BINARY_VRS: ReadonlySet<VR> = new Set<VR>(["OB", "OD", "OF", "OL", "OV", "OW", "UN"]);
const NUMBER_VRS: ReadonlySet<VR> = new Set<VR>(["US", "UL", "SS", "SL", "FL", "FD"]);

const SPACE = 0x20;
const NULL = 0x00;

// The warnings of the value being decoded, and the one position they share.
// Both are made only when a warning is raised: most values raise none. A decode
// never decodes another value, so one pair serves every call; `begin` resets
// them and `finish` hands the warnings to the value that raised them.
let pending: DicomParseWarning[] | undefined;
let pendingPosition: DicomPosition | undefined;
let pendingOffset = 0;

function begin(byteOffset: number): void {
  pending = undefined;
  pendingPosition = undefined;
  pendingOffset = byteOffset;
}

/** The position every warning of this value carries: one object, shared, as it always was. */
function position(): DicomPosition {
  pendingPosition ??= { byteOffset: pendingOffset };
  return pendingPosition;
}

function warn(w: DicomParseWarning): void {
  (pending ??= []).push(w);
}

/** `value`, with this decode's warnings attached when it raised any. */
function finish<T extends DicomValue>(value: T): T {
  const warnings = pending;
  pending = undefined;
  return warnings !== undefined ? { ...value, warnings } : value;
}

/**
 * Where a string value ends once its trailing pad is stripped: `UI` strips
 * trailing NULL and SPACE and flags a SPACE; every other VR strips trailing
 * SPACE and NULL and flags a NULL (PS3.5 §6.2).
 */
function paddedEnd(src: Buffer, start: number, end: number, tag: string, vr: VR): number {
  let e = end;
  if (vr === "UI") {
    if (e > start && src[e - 1] === SPACE) warn(uiTrailingSpace(position(), tag));
    while (e > start && (src[e - 1] === NULL || src[e - 1] === SPACE)) e--;
  } else {
    if (e > start && src[e - 1] === NULL) warn(trailingNullInTextVR(position(), tag, vr));
    while (e > start && (src[e - 1] === SPACE || src[e - 1] === NULL)) e--;
  }
  return e;
}

function trimSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === SPACE) start++;
  while (end > start && value.charCodeAt(end - 1) === SPACE) end--;
  return value.slice(start, end);
}

const DECIMAL_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const INTEGER_STRING = /^[+-]?\d+$/u;

/** A Default Repertoire value: Latin-1-lenient, with stray non-ASCII bytes flagged once. */
function asciiText(src: Buffer, start: number, end: number, tag: string, vr: VR): string {
  for (let i = start; i < end; i++) {
    if ((src[i] as number) >= 0x80) {
      warn(nonAsciiInAsciiVR(position(), tag, vr));
      break;
    }
  }
  return src.toString("latin1", start, end);
}

function delimiterClass(vr: VR): DelimiterClass {
  if (vr === "PN") return "personName";
  if (vr === "LO" || vr === "SH" || vr === "UC") return "multiValued";
  return "text";
}

/**
 * `true` when every byte is ASCII other than SO (`0x0E`), SI (`0x0F`) and ESC
 * (`0x1B`). Every decoder `decodeText` can pick (each single-byte table but
 * JIS X 0201's, UTF-8, GB18030, GBK, EUC-KR, and ISO-2022-JP outside an escape)
 * maps those bytes to themselves, so their Latin-1 reading is their decoding.
 * JIS X 0201 reads `0x5C` and `0x7E` otherwise, so the caller skips this under
 * `ISO_IR 13`.
 */
function isPlainAscii(src: Buffer, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const b = src[i] as number;
    if (b >= 0x80 || b === 0x0e || b === 0x0f || b === 0x1b) return false;
  }
  return true;
}

/** A value of a charset-dependent VR, decoded through `(0008,0005)`. */
function charsetText(
  src: Buffer,
  start: number,
  end: number,
  tag: string,
  vr: VR,
  charset: readonly string[] | undefined,
): string {
  let s = start;
  if (end - s >= 3 && src[s] === 0xef && src[s + 1] === 0xbb && src[s + 2] === 0xbf) {
    warn(bomInTextVR(position(), tag, vr));
    s += 3;
  }
  if (!usesCodeExtensions(charset)) {
    const set = singleByteSetIn(charset);
    if (set !== 13 && isPlainAscii(src, s, end)) return src.toString("latin1", s, end);
    if (set === undefined) return decodeText(src.subarray(s, end), charset);
    const decoded = decodeSingleByte(src.subarray(s, end), set, delimiterClass(vr) !== "text");
    if (decoded.bytesUndecodable) warn(charsetBytesUndecodable(position(), tag, vr));
    return decoded.text;
  }
  const decoded = decodeWithCodeExtensions(src.subarray(s, end), charset, delimiterClass(vr));
  if (decoded.escapeUndeclared) warn(charsetEscapeUndeclared(position(), tag, vr));
  if (decoded.bytesUndecodable) warn(charsetBytesUndecodable(position(), tag, vr));
  if (decoded.extensionNotReset) warn(charsetExtensionNotReset(position(), tag, vr));
  return decoded.text;
}

/**
 * Decode an {@link Element}'s value to a typed {@link DicomValue}. Pure +
 * fail-safe: it never throws and never coerces a malformed value to a
 * plausible-but-wrong one. Called lazily (and memoized) by `Element.value`.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * const v = ds.get("00280010")?.value; // Rows (US)
 * if (v?.kind === "numbers") console.log(v.values[0]);
 * ```
 */
export function decodeElementValue(element: Element): DicomValue {
  const { vr, tag } = element;
  const le = element.littleEndian;

  if (vr === "SQ") return { kind: "sequence", items: element.items ?? [] };
  if (BINARY_VRS.has(vr)) return { kind: "binary", bytes: element.rawBytes };
  // The value is read where it sits, so a decode makes no view of it.
  const src = elementValueSource(element);
  const start = elementValueStart(element);
  const end = elementValueEnd(element);
  if (end === start) return { kind: "empty" };

  if (NUMBER_VRS.has(vr))
    return { kind: "numbers", values: decodeNumbersIn(src, start, end, vr, le) };
  if (vr === "SV" || vr === "UV")
    return { kind: "bigints", values: decodeBigInts(element.rawBytes, vr, le) };
  if (vr === "AT")
    return { kind: "attributeTags", values: decodeAttributeTags(element.rawBytes, le) };

  begin(element.byteOffset);
  const trimmed = paddedEnd(src, start, end, tag, vr);
  const charset = element.specificCharacterSet;

  if (vr === "PN") {
    // Each value replaces its own text in the array `split` made, so a value
    // list costs one array of exactly its length.
    const values: (string | PersonName)[] = charsetText(
      src,
      start,
      trimmed,
      tag,
      vr,
      charset,
    ).split("\\");
    for (let i = 0; i < values.length; i++) values[i] = parsePersonName(values[i] as string);
    return finish({ kind: "personName", values: values as PersonName[] } as const);
  }
  if (vr === "LO" || vr === "SH" || vr === "UC") {
    const values = charsetText(src, start, trimmed, tag, vr, charset).split("\\");
    for (let i = 0; i < values.length; i++) values[i] = trimSpaces(values[i] as string);
    return finish({ kind: "strings", values } as const);
  }
  if (vr === "LT" || vr === "ST" || vr === "UT") {
    // Single-value text VRs: backslash is literal; trailing pad already
    // stripped, leading whitespace preserved.
    const value = charsetText(src, start, trimmed, tag, vr, charset);
    return finish({ kind: "text", value } as const);
  }
  if (vr === "UR") {
    // ASCII single value, no backslash multiplicity.
    const value = asciiText(src, start, trimmed, tag, vr);
    return finish({ kind: "text", value } as const);
  }
  if (vr === "AE" || vr === "CS" || vr === "AS" || vr === "UI") {
    const values = asciiText(src, start, trimmed, tag, vr).split("\\");
    for (let i = 0; i < values.length; i++) values[i] = trimSpaces(values[i] as string);
    return finish({ kind: "strings", values } as const);
  }
  if (vr === "DS") {
    const values: (string | number | null)[] = asciiText(src, start, trimmed, tag, vr).split("\\");
    for (let i = 0; i < values.length; i++) {
      const t = (values[i] as string).trim();
      // PS3.5 DS grammar only - reject hex/binary/octal/Infinity literals that
      // `Number()` would otherwise coerce to a plausible-but-wrong value.
      if (t.length === 0 || !DECIMAL_STRING.test(t)) {
        values[i] = null;
        continue;
      }
      const n = Number(t);
      values[i] = Number.isFinite(n) ? n : null;
    }
    return finish({ kind: "decimalString", values: values as (number | null)[] } as const);
  }
  if (vr === "IS") {
    const values: (string | number | null)[] = asciiText(src, start, trimmed, tag, vr).split("\\");
    for (let i = 0; i < values.length; i++) {
      const t = (values[i] as string).trim();
      if (t.length === 0) {
        values[i] = null;
      } else if (!INTEGER_STRING.test(t)) {
        warn(isNonintegerValue(position(), tag));
        values[i] = null;
      } else {
        values[i] = Number(t);
      }
    }
    return finish({ kind: "integerString", values: values as (number | null)[] } as const);
  }
  if (vr === "DA") {
    const values: (string | DicomDate)[] = asciiText(src, start, trimmed, tag, vr).split("\\");
    for (let i = 0; i < values.length; i++) {
      const { value, legacy } = parseDate((values[i] as string).trim());
      if (legacy) warn(daLegacyFormat(position(), tag));
      values[i] = value;
    }
    return finish({ kind: "dates", values: values as DicomDate[] } as const);
  }
  if (vr === "TM") {
    const values: (string | DicomTime)[] = asciiText(src, start, trimmed, tag, vr).split("\\");
    for (let i = 0; i < values.length; i++) {
      values[i] = parseTime((values[i] as string).trim()).value;
    }
    return finish({ kind: "times", values: values as DicomTime[] } as const);
  }
  if (vr === "DT") {
    const values: (string | DicomDateTime)[] = asciiText(src, start, trimmed, tag, vr).split("\\");
    for (let i = 0; i < values.length; i++) {
      const { value, nonstandardOffset } = parseDateTime((values[i] as string).trim());
      if (nonstandardOffset) warn(dtNonstandardOffset(position(), tag));
      values[i] = value;
    }
    return finish({ kind: "dateTimes", values: values as DicomDateTime[] } as const);
  }

  // Any VR not enumerated above (should be unreachable - all 34 are handled).
  // Fail-safe: surface the raw decoded Latin-1 text.
  const value = asciiText(src, start, trimmed, tag, vr);
  return finish({ kind: "text", value } as const);
}

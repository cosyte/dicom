/**
 * VR-aware value dispatch — the body behind `Element.value`.
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
  daLegacyFormat,
  dtNonstandardOffset,
  isNonintegerValue,
  nonAsciiInAsciiVR,
  trailingNullInTextVR,
  uiTrailingSpace,
  type DicomParseWarning,
} from "../../parser/warnings.js";
import type { Element } from "../element.js";
import { decodeText } from "./charset.js";
import { parseDate, parseDateTime, parseTime } from "./datetime.js";
import { decodeAttributeTags, decodeBigInts, decodeNumbers } from "./numeric.js";
import { parsePersonName } from "./person-name.js";
import type { DicomValue } from "./types.js";

const BINARY_VRS: ReadonlySet<VR> = new Set<VR>(["OB", "OD", "OF", "OL", "OV", "OW", "UN"]);
const NUMBER_VRS: ReadonlySet<VR> = new Set<VR>(["US", "UL", "SS", "SL", "FL", "FD"]);

const SPACE = 0x20;
const NULL = 0x00;

/** Strip the VR-appropriate trailing pad, flagging a mismatched pad byte. */
function stripPad(
  bytes: Buffer,
  tag: string,
  vr: VR,
  position: DicomPosition,
  warnings: DicomParseWarning[],
): Buffer {
  let end = bytes.length;
  if (vr === "UI") {
    if (end > 0 && bytes[end - 1] === SPACE) warnings.push(uiTrailingSpace(position, tag));
    while (end > 0 && (bytes[end - 1] === NULL || bytes[end - 1] === SPACE)) end--;
  } else {
    if (end > 0 && bytes[end - 1] === NULL) warnings.push(trailingNullInTextVR(position, tag, vr));
    while (end > 0 && (bytes[end - 1] === SPACE || bytes[end - 1] === NULL)) end--;
  }
  return bytes.subarray(0, end);
}

function attachWarnings<T extends DicomValue>(value: T, warnings: DicomParseWarning[]): T {
  return warnings.length > 0 ? { ...value, warnings } : value;
}

/** Decode an ASCII (Default Repertoire) string VR, flagging stray non-ASCII. */
function decodeAsciiString(
  bytes: Buffer,
  tag: string,
  vr: VR,
  position: DicomPosition,
  warnings: DicomParseWarning[],
): string {
  for (const byte of bytes) {
    if (byte >= 0x80) {
      warnings.push(nonAsciiInAsciiVR(position, tag, vr));
      break;
    }
  }
  return bytes.toString("latin1");
}

/** Decode a charset-dependent string VR, stripping + flagging a leading UTF-8 BOM. */
function decodeCharsetString(
  bytes: Buffer,
  tag: string,
  vr: VR,
  charset: readonly string[] | undefined,
  position: DicomPosition,
  warnings: DicomParseWarning[],
): string {
  let b = bytes;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    warnings.push(bomInTextVR(position, tag, vr));
    b = b.subarray(3);
  }
  return decodeText(b, charset);
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
  const { vr, rawBytes, tag } = element;
  const le = element.littleEndian;
  const position: DicomPosition = { byteOffset: element.byteOffset };

  if (vr === "SQ") return { kind: "sequence", items: element.items ?? [] };
  if (BINARY_VRS.has(vr)) return { kind: "binary", bytes: rawBytes };
  if (rawBytes.length === 0) return { kind: "empty" };

  if (NUMBER_VRS.has(vr)) return { kind: "numbers", values: decodeNumbers(rawBytes, vr, le) };
  if (vr === "SV" || vr === "UV")
    return { kind: "bigints", values: decodeBigInts(rawBytes, vr, le) };
  if (vr === "AT") return { kind: "attributeTags", values: decodeAttributeTags(rawBytes, le) };

  const warnings: DicomParseWarning[] = [];
  const trimmed = stripPad(rawBytes, tag, vr, position, warnings);
  const charset = element.specificCharacterSet;

  if (vr === "PN") {
    const text = decodeCharsetString(trimmed, tag, vr, charset, position, warnings);
    const values = text.split("\\").map((v) => parsePersonName(v));
    return attachWarnings({ kind: "personName", values } as const, warnings);
  }
  if (vr === "LO" || vr === "SH" || vr === "UC") {
    const text = decodeCharsetString(trimmed, tag, vr, charset, position, warnings);
    const values = text.split("\\").map((v) => v.replace(/^ +| +$/gu, ""));
    return attachWarnings({ kind: "strings", values } as const, warnings);
  }
  if (vr === "LT" || vr === "ST" || vr === "UT") {
    // Single-value text VRs: backslash is literal; trailing pad already
    // stripped, leading whitespace preserved.
    const value = decodeCharsetString(trimmed, tag, vr, charset, position, warnings);
    return attachWarnings({ kind: "text", value } as const, warnings);
  }
  if (vr === "UR") {
    // ASCII single value, no backslash multiplicity.
    const value = decodeAsciiString(trimmed, tag, vr, position, warnings);
    return attachWarnings({ kind: "text", value } as const, warnings);
  }
  if (vr === "AE" || vr === "CS" || vr === "AS" || vr === "UI") {
    const text = decodeAsciiString(trimmed, tag, vr, position, warnings);
    const values = text.split("\\").map((v) => v.replace(/^ +| +$/gu, ""));
    return attachWarnings({ kind: "strings", values } as const, warnings);
  }
  if (vr === "DS") {
    const text = decodeAsciiString(trimmed, tag, vr, position, warnings);
    const values = text.split("\\").map((v) => {
      const t = v.trim();
      if (t.length === 0) return null;
      // PS3.5 DS grammar only — reject hex/binary/octal/Infinity literals that
      // `Number()` would otherwise coerce to a plausible-but-wrong value.
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/u.test(t)) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    });
    return attachWarnings({ kind: "decimalString", values } as const, warnings);
  }
  if (vr === "IS") {
    const text = decodeAsciiString(trimmed, tag, vr, position, warnings);
    const values = text.split("\\").map((v) => {
      const t = v.trim();
      if (t.length === 0) return null;
      if (!/^[+-]?\d+$/u.test(t)) {
        warnings.push(isNonintegerValue(position, tag));
        return null;
      }
      return Number(t);
    });
    return attachWarnings({ kind: "integerString", values } as const, warnings);
  }
  if (vr === "DA") {
    const text = decodeAsciiString(trimmed, tag, vr, position, warnings);
    const values = text.split("\\").map((v) => {
      const { value, legacy } = parseDate(v.trim());
      if (legacy) warnings.push(daLegacyFormat(position, tag));
      return value;
    });
    return attachWarnings({ kind: "dates", values } as const, warnings);
  }
  if (vr === "TM") {
    const text = decodeAsciiString(trimmed, tag, vr, position, warnings);
    const values = text.split("\\").map((v) => parseTime(v.trim()).value);
    return attachWarnings({ kind: "times", values } as const, warnings);
  }
  if (vr === "DT") {
    const text = decodeAsciiString(trimmed, tag, vr, position, warnings);
    const values = text.split("\\").map((v) => {
      const { value, nonstandardOffset } = parseDateTime(v.trim());
      if (nonstandardOffset) warnings.push(dtNonstandardOffset(position, tag));
      return value;
    });
    return attachWarnings({ kind: "dateTimes", values } as const, warnings);
  }

  // Any VR not enumerated above (should be unreachable — all 34 are handled).
  // Fail-safe: surface the raw decoded Latin-1 text.
  const value = decodeAsciiString(trimmed, tag, vr, position, warnings);
  return attachWarnings({ kind: "text", value } as const, warnings);
}

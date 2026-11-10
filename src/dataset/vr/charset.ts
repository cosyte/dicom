/**
 * Specific Character Set `(0008,0005)` resolution + text decoding for the
 * VR value decoders.
 *
 * Zero runtime deps: decoding rides on Node 22's full-ICU `TextDecoder`
 * (the `@cosyte/dicom` ≤3-dep ceiling keeps `iconv-lite` in reserve only if
 * a future CJK case forces it). A multi-valued set's ISO 2022 code
 * extensions are decoded by `./iso2022`, set by set, on the same labels.
 *
 * Term-list corrections verified against PS3.3 §C.12.1.1.2 for this build
 * (the easy-to-get-wrong ones):
 *   - There is **no `ISO_IR 14`** - only `ISO_IR 13` (JIS X 0201 Katakana).
 *   - `IR 87` / `IR 159` are **code-extension-only**: the bare `ISO_IR 87` /
 *     `ISO_IR 159` terms do NOT exist; only `ISO 2022 IR 87` / `ISO 2022 IR
 *     159` are valid (so they are absent from the single-byte term list).
 *   - **`ISO_IR 203`** (Latin-9 → ISO-8859-15) IS included.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import { WITHHELD } from "../../parser/tokens.js";
import { decodeWithCodeExtensions, usesCodeExtensions } from "./iso2022.js";

/**
 * Defined term → `TextDecoder` label. Both the single-byte (`ISO_IR nnn`)
 * and the ISO-2022 code-extension (`ISO 2022 IR nnn`) spellings map to the
 * same decoder where a single-byte mapping exists; the multibyte
 * code-extension terms (87/159/149/58) map to their multibyte decoders.
 */
const TERM_TO_LABEL: ReadonlyMap<string, string> = new Map([
  // Default repertoire (ISO 646 IRV / ASCII). Latin-1 is a lenient,
  // never-throws 1:1 superset for the ASCII range.
  ["", "latin1"],
  ["ISO_IR 6", "latin1"],
  ["ISO 2022 IR 6", "latin1"],
  // Single-byte Latin / Cyrillic / Arabic / Greek / Hebrew / Thai.
  ["ISO_IR 100", "latin1"],
  ["ISO 2022 IR 100", "latin1"],
  ["ISO_IR 101", "iso-8859-2"],
  ["ISO 2022 IR 101", "iso-8859-2"],
  ["ISO_IR 109", "iso-8859-3"],
  ["ISO 2022 IR 109", "iso-8859-3"],
  ["ISO_IR 110", "iso-8859-4"],
  ["ISO 2022 IR 110", "iso-8859-4"],
  ["ISO_IR 144", "iso-8859-5"],
  ["ISO 2022 IR 144", "iso-8859-5"],
  ["ISO_IR 127", "iso-8859-6"],
  ["ISO 2022 IR 127", "iso-8859-6"],
  ["ISO_IR 126", "iso-8859-7"],
  ["ISO 2022 IR 126", "iso-8859-7"],
  ["ISO_IR 138", "iso-8859-8"],
  ["ISO 2022 IR 138", "iso-8859-8"],
  ["ISO_IR 148", "iso-8859-9"],
  ["ISO 2022 IR 148", "iso-8859-9"],
  ["ISO_IR 203", "iso-8859-15"],
  ["ISO 2022 IR 203", "iso-8859-15"],
  ["ISO_IR 13", "shift_jis"],
  ["ISO 2022 IR 13", "shift_jis"],
  ["ISO_IR 166", "windows-874"],
  ["ISO 2022 IR 166", "windows-874"],
  // Unicode / Chinese single-shot.
  ["ISO_IR 192", "utf-8"],
  ["GB18030", "gb18030"],
  ["GBK", "gbk"],
  // Multibyte code-extension terms (no bare ISO_IR form).
  ["ISO 2022 IR 87", "iso-2022-jp"],
  ["ISO 2022 IR 159", "iso-2022-jp"],
  ["ISO 2022 IR 149", "euc-kr"],
  ["ISO 2022 IR 58", "gb18030"],
]);

/** Labels carrying multibyte / extended content - preferred when a value mixes terms. */
const MULTIBYTE_LABELS: ReadonlySet<string> = new Set([
  "utf-8",
  "iso-2022-jp",
  "euc-kr",
  "gb18030",
  "gbk",
  "shift_jis",
]);

/**
 * Parse a `(0008,0005)` Specific Character Set value (a `CS`, possibly
 * multi-valued via `\`) into its trimmed **defined terms**.
 *
 * The first value may be empty (the ISO-2022 "G0 starts as ISO_IR 6" rule);
 * it is preserved as `""` rather than dropped so {@link resolveDecoderLabel}
 * can apply the default-repertoire fallback.
 *
 * A component this closed table does not name is not a defined term, and it is
 * **withheld** rather than returned. This value is multi-valued on the
 * backslash, every component is a string a sender authored, and the result
 * lands on `Element.specificCharacterSet`, where it presents itself as an
 * identifier a downstream package may interpolate: that is the field, and the
 * delimiter, this package's measured PHI leak ran through. Decoding is
 * unaffected, because {@link resolveDecoderLabel} already skipped any term it
 * could not map and skips the withheld marker for the same reason.
 *
 * @example
 * ```ts
 * import { parseSpecificCharacterSet } from "@cosyte/dicom";
 * // bytes for "ISO 2022 IR 6\\ISO 2022 IR 87"
 * const terms = parseSpecificCharacterSet(buf);
 * ```
 */
export function parseSpecificCharacterSet(bytes: Buffer): readonly string[] {
  // CS is ASCII; trailing pad is SPACE. Decode 1:1 then split on backslash.
  const raw = bytes.toString("latin1");
  return raw
    .split("\\")
    .map(trimTermPad)
    .map((t) => (t === "" || TERM_TO_LABEL.has(t) ? t : WITHHELD));
}

/**
 * Strip one term's trailing NULL (`0x00`) and SPACE (`0x20`) pad, then its leading SPACE,
 * scanning in from each end once. Linear in the term's length: the `/[\x00 ]+$/` this
 * replaces re-scanned a run of pad bytes from every position in it, so a long run that
 * ended in any other byte cost quadratic time.
 */
function trimTermPad(term: string): string {
  let end = term.length;
  while (end > 0) {
    const code = term.charCodeAt(end - 1);
    if (code !== 0x00 && code !== 0x20) break;
    end--;
  }
  let start = 0;
  while (start < end && term.charCodeAt(start) === 0x20) start++;
  return term.slice(start, end);
}

/**
 * `true` when `term` is a Specific Character Set defined term this build can
 * map to a decoder (the empty default-repertoire term counts as known).
 *
 * @example
 * ```ts
 * import { isKnownCharsetTerm } from "@cosyte/dicom";
 * isKnownCharsetTerm("ISO_IR 192"); // true
 * isKnownCharsetTerm("ISO_IR 14"); // false - does not exist
 * ```
 */
export function isKnownCharsetTerm(term: string): boolean {
  return TERM_TO_LABEL.has(term);
}

/**
 * Resolve the `TextDecoder` label to use for a value, given the dataset's
 * Specific Character Set terms. Prefers a multibyte/extended decoder when
 * the term list mixes single-byte and code-extension sets; falls back to
 * the default repertoire (Latin-1, lenient) when no term resolves.
 *
 * {@link decodeText} decodes under this label when the list has one term, or
 * when Value 1 is `ISO_IR 192`, `GB18030` or `GBK`. Any other multi-term list
 * decodes with ISO 2022 code extensions instead, whatever label this returns.
 *
 * @example
 * ```ts
 * import { resolveDecoderLabel } from "@cosyte/dicom";
 * resolveDecoderLabel(["ISO 2022 IR 6", "ISO 2022 IR 87"]); // "iso-2022-jp"
 * resolveDecoderLabel(undefined); // "latin1"
 * ```
 */
export function resolveDecoderLabel(terms: readonly string[] | undefined): string {
  if (terms === undefined || terms.length === 0) return "latin1";
  let firstKnown: string | undefined;
  for (const term of terms) {
    const label = TERM_TO_LABEL.get(term);
    if (label === undefined) continue;
    if (MULTIBYTE_LABELS.has(label)) return label;
    firstKnown ??= label;
  }
  return firstKnown ?? "latin1";
}

/**
 * Decode bytes to a string under the Specific Character Set terms, never
 * throwing.
 *
 * With more than one term, and a Value 1 other than `ISO_IR 192`, `GB18030` or
 * `GBK`, the bytes decode with ISO 2022 code extensions (PS3.5 section
 * 6.1.2.5): every PS3.3 Table C.12-3 and C.12-4 escape sequence switches G0 or
 * G1, no escape byte reaches the string, and the Value 1 designations come back
 * after each CR, LF or FF, which are the reset points of a text VR. Bytes no
 * designated set decodes read as U+FFFD. Only the string is returned here;
 * `Element.value` carries the warnings for an element's value.
 *
 * Every other term list decodes under {@link resolveDecoderLabel}'s label: an
 * unsupported label falls back to UTF-8, then to Latin-1 (1:1, cannot fail).
 *
 * @example
 * ```ts
 * import { decodeText } from "@cosyte/dicom";
 * const s = decodeText(buf, ["ISO_IR 192"]); // UTF-8
 * // ESC $ B, the JIS X 0208 bytes of one character, ESC ( B
 * decodeText(Buffer.from([0x1b, 0x24, 0x42, 0x3b, 0x33, 0x1b, 0x28, 0x42]), ["", "ISO 2022 IR 87"]);
 * ```
 */
export function decodeText(bytes: Buffer, terms: readonly string[] | undefined): string {
  if (usesCodeExtensions(terms)) return decodeWithCodeExtensions(bytes, terms, "text").text;
  const label = resolveDecoderLabel(terms);
  try {
    return decoderFor(label).decode(bytes);
  } catch {
    try {
      return decoderFor("utf-8").decode(bytes);
    } catch {
      return bytes.toString("latin1");
    }
  }
}

type Decoder = InstanceType<typeof TextDecoder>;

/**
 * One `TextDecoder` per label, made on first use and kept. A decoder used
 * without `{ stream: true }` keeps no state between calls, so a kept one decodes
 * exactly as a new one does; the labels are the closed set `TERM_TO_LABEL`
 * maps to. A label the runtime refuses throws here, as `new TextDecoder` did,
 * and is not kept. The decoders are the global `TextDecoder`'s: when that is
 * replaced, they are dropped and made again from the one in place.
 */
const DECODERS = new Map<string, Decoder>();
let decodersOf: typeof TextDecoder | undefined;

function decoderFor(label: string): Decoder {
  if (decodersOf !== globalThis.TextDecoder) {
    DECODERS.clear();
    decodersOf = globalThis.TextDecoder;
  }
  let decoder = DECODERS.get(label);
  if (decoder === undefined) {
    decoder = new TextDecoder(label, { fatal: false });
    DECODERS.set(label, decoder);
  }
  return decoder;
}

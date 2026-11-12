/**
 * `ParseOptions.fallbackCharacterSet`: the set text reads under where a Data Set declares none,
 * checked before the parse reads a byte, and the one warning that says it was assumed.
 *
 * @internal
 * @module
 */

import { fallbackOf } from "../dataset/vr/charset.js";
import type { Tag, VR } from "../dictionary/types.js";
import type { DicomPosition, FallbackState, ParseContext, ParseOptions } from "./types.js";
import { charsetAssumed, type DicomParseWarning } from "./warnings.js";

/** The `code` of the `TypeError` an option the parse does not take is refused with. */
const INVALID_OPTION = "DICOM_INVALID_OPTION";

/**
 * The parse's {@link FallbackState}, or `undefined` when no fallback is asked for. A value the
 * options do not take is refused with a `TypeError` whose `code` is `DICOM_INVALID_OPTION` and
 * whose message does not echo it.
 *
 * @internal
 */
export function fallbackStateOf(options: ParseOptions): FallbackState | undefined {
  const fallback = fallbackOf(options.fallbackCharacterSet, options.fallbackCharacterSetForUnknown);
  if (fallback === null) {
    throw Object.assign(
      new TypeError(
        'ParseOptions.fallbackCharacterSet must be a term of FALLBACK_CHARACTER_SETS, such as "ISO_IR 100", and fallbackCharacterSetForUnknown a boolean given with it.',
      ),
      { code: INVALID_OPTION },
    );
  }
  return fallback === undefined ? undefined : { ...fallback, warned: false };
}

/**
 * Emit `DICOM_CHARSET_ASSUMED` for the element about to be written when it is the parse's first
 * text element read under the fallback: a VR whose text `(0008,0005)` governs, in a Data Set whose
 * charset is the fallback's own list.
 *
 * @internal
 */
export function noteAssumedCharset(
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  position: DicomPosition,
  tag: Tag,
  vr: VR,
): void {
  const fallback = ctx.fallback;
  if (fallback === undefined || fallback.warned || ctx.currentCharset !== fallback.terms) return;
  if (!isCharsetTextVr(vr)) return;
  fallback.warned = true;
  emit(charsetAssumed(position, tag));
}

/**
 * The VRs whose text is read through `(0008,0005)`: PS3.5 section 6.1.2.3 lets a set replace the
 * default repertoire "for use in Value Representations SH, LO, ST, LT, PN, UC and UT".
 */
const CHARSET_TEXT_VRS: readonly VR[] = ["SH", "LO", "UC", "ST", "LT", "UT", "PN"];

function isCharsetTextVr(vr: VR): boolean {
  return CHARSET_TEXT_VRS.includes(vr);
}

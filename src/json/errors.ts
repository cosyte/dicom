/**
 * Error taxonomy for the DICOM JSON Model converters, `toDicomJson` and `fromDicomJson`.
 *
 * The converters refuse rather than guess. Every case the JSON Model (PS3.18 Annex F) cannot carry
 * without changing the value, and every case whose JSON form we could not confirm against the
 * standard, throws one of these codes:
 *
 *   - `UNSUPPORTED_VR` - the element's VR is `SV`, `UV` or one PS3.5 does not define. We do not
 *     write the 64-bit integer VRs into JSON until we have confirmed their JSON form.
 *   - `UNSUPPORTED_ELEMENT` - an element whose value the model cannot hold as metadata: an
 *     encapsulated (undefined-length) Pixel Data fragment stream, an undefined-length `UN` value
 *     the reader could not read as a Sequence, or a Sequence the reader did not descend.
 *   - `UNSUPPORTED_BYTE_ORDER` - a binary value whose bytes would need swapping between Explicit
 *     VR Big Endian and the base64 of an `InlineBinary` (`OW`, `OF`, `OD`, `OL`, `OV`). We have not
 *     confirmed the byte order `InlineBinary` carries for those, so we refuse them under Big Endian.
 *   - `UNREPRESENTABLE_NUMBER` - a number one side cannot carry exactly: NaN, an infinity or
 *     negative zero in `FL` or `FD` (JSON writes `-0` as `0`), a `DS` or `IS` value that is not a number or whose decimal value a JSON number
 *     does not hold (past 2^53, or more digits than a double keeps), a number whose `DS` or `IS`
 *     text would be too long for its VR, or an `FL` number float32 does not hold, past its range or
 *     below its smallest normal value.
 *   - `MALFORMED_VALUE` - a value not well formed for its VR: a binary value whose length is not a
 *     whole number of values, a Person Name with more than three component groups, text bytes
 *     its Specific Character Set does not decode, or text for `fromDicomJson` holding a control
 *     character its VR does not allow (PS3.5 section 6.2: none but TAB, LF, FF and CR in `LT`,
 *     `ST` and `UT`, none at all elsewhere, and so never ESC).
 *   - `INVALID_JSON` - the input to `fromDicomJson` is not a DICOM JSON Model object we read: a key
 *     that is not eight hex digits, a File Meta `(0002,xxxx)` or item delimitation `(FFFE,xxxx)`
 *     tag, a tag in group `0001`, `0003`, `0005` or `0007`, which PS3.5 section 7.8.1 says
 *     shall not be used, an attribute with no `vr`, a value of the wrong JSON type for its VR, an attribute with
 *     more than one of `Value`, `InlineBinary` and `BulkDataURI`, or a delimiter inside one value
 *     (a backslash in a multi-valued string or a Person Name, an `=` in a Person Name group).
 *   - `BULK_DATA_UNRESOLVED` - a `BulkDataURI` that no `resolveBulkData` option resolved.
 *   - `BULK_DATA_URI_REQUIRED` - `toDicomJson` met a bulk value (Pixel Data, Float and Double
 *     Float Pixel Data, Overlay Data, Waveform Data, Spectroscopy Data, Encapsulated Document) that
 *     the `bulkDataUri` option gave no URI for, and the `inlineBulkData` option was not set.
 *   - `VR_MISMATCH` - the Data Set `fromDicomJson` wrote reads back with another VR than the JSON
 *     gives: under Implicit VR Little Endian the VR is not written, and the reader takes the one
 *     PS3.5 and the dictionary give the tag, or `UN` for a private one.
 *   - `UNSUPPORTED_CHARACTER_SET` - a Data Set, at any depth, whose Specific Character Set has
 *     more than one value or names a set other than the default repertoire, a single-byte
 *     `ISO_IR` set or `ISO_IR 192` (so no ISO 2022 code extensions, and no `GB18030` or `GBK`);
 *     or text `fromDicomJson` does not encode: a character outside 7-bit ASCII under a set other
 *     than the default repertoire, `ISO_IR 100` and `ISO_IR 192`, one that set cannot hold, or
 *     text that does not read back as itself. `fromDicomJson` reads every text value it writes
 *     back through the reader's decoder, which reads a byte its set does not define as U+FFFD:
 *     so under the default repertoire (ISO-IR 6) any character past U+007F is refused, under
 *     `ISO_IR 100` the C1 code points U+0080 to U+009F are, and under `ISO_IR 192` a lone
 *     surrogate is.
 *   - `UNSUPPORTED_TRANSFER_SYNTAX` - `fromDicomJson` was asked for a Transfer Syntax other than
 *     Implicit VR Little Endian, Explicit VR Little Endian, Explicit VR Big Endian or Deflated
 *     Explicit VR Little Endian.
 *   - `VALUE_TOO_LONG` - a value too long for the Value Length Field its VR is written with.
 *   - `NESTING_TOO_DEEP` - `fromDicomJson` was given Sequences nested more than 64 deep, past
 *     what `parseDicom` reads back.
 *   - `CONVERSION_FAILED` - any other error inside a converter, a callback's own included: no
 *     error but a `DicomJsonError` leaves either one, and the error it replaces is not kept,
 *     since its message could hold a value.
 *
 * The message is built only from the code and fixed text, plus a tag rendered through
 * `renderTag`, which names only a tag PS3.6 registers one at a time. No value, no private tag and
 * no byte of the input reaches it, so it is safe to log.
 *
 * @module
 */

import { WITHHELD } from "../parser/tokens.js";

/**
 * Stable string codes `toDicomJson` and `fromDicomJson` may throw. Narrow on
 * {@link DicomJsonError.code} to react to a specific refusal.
 *
 * @example
 * ```ts
 * import { DICOM_JSON_ERROR_CODES } from "@cosyte/dicom";
 * DICOM_JSON_ERROR_CODES.UNSUPPORTED_VR; // "UNSUPPORTED_VR"
 * ```
 */
export const DICOM_JSON_ERROR_CODES = Object.freeze({
  UNSUPPORTED_VR: "UNSUPPORTED_VR",
  UNSUPPORTED_ELEMENT: "UNSUPPORTED_ELEMENT",
  UNSUPPORTED_BYTE_ORDER: "UNSUPPORTED_BYTE_ORDER",
  UNREPRESENTABLE_NUMBER: "UNREPRESENTABLE_NUMBER",
  MALFORMED_VALUE: "MALFORMED_VALUE",
  INVALID_JSON: "INVALID_JSON",
  BULK_DATA_UNRESOLVED: "BULK_DATA_UNRESOLVED",
  BULK_DATA_URI_REQUIRED: "BULK_DATA_URI_REQUIRED",
  UNSUPPORTED_CHARACTER_SET: "UNSUPPORTED_CHARACTER_SET",
  UNSUPPORTED_TRANSFER_SYNTAX: "UNSUPPORTED_TRANSFER_SYNTAX",
  VALUE_TOO_LONG: "VALUE_TOO_LONG",
  VR_MISMATCH: "VR_MISMATCH",
  NESTING_TOO_DEEP: "NESTING_TOO_DEEP",
  CONVERSION_FAILED: "CONVERSION_FAILED",
} as const);

/**
 * Discriminant for {@link DicomJsonError.code}.
 *
 * @example
 * ```ts
 * import type { DicomJsonErrorCode } from "@cosyte/dicom";
 * const code: DicomJsonErrorCode = "BULK_DATA_UNRESOLVED";
 * ```
 */
export type DicomJsonErrorCode =
  (typeof DICOM_JSON_ERROR_CODES)[keyof typeof DICOM_JSON_ERROR_CODES];

/** The fixed text of each code. Nothing read from the input is ever added to it but a rendered tag. */
function messageOf(code: DicomJsonErrorCode): string {
  switch (code) {
    case "UNSUPPORTED_VR":
      return "The element's VR has no DICOM JSON form we write: SV and UV are refused until their JSON form is confirmed, and a VR PS3.5 does not define has none.";
    case "UNSUPPORTED_ELEMENT":
      return "The element's value cannot be held as DICOM JSON metadata: an encapsulated fragment stream, an undefined-length value that is not a Sequence, or a Sequence that was not read.";
    case "UNSUPPORTED_BYTE_ORDER":
      return "An OW, OF, OD, OL or OV value under Explicit VR Big Endian is refused: the byte order of its InlineBinary is not confirmed.";
    case "UNREPRESENTABLE_NUMBER":
      return "A number cannot be carried exactly: NaN, an infinity or an FL or FD negative zero, a DS or IS value that is not a number or that a JSON number does not hold exactly, one too long for its VR, or an FL value outside float32's normal range.";
    case "MALFORMED_VALUE":
      return "A value is not well formed for its VR: a binary length that is not a whole number of values, a Person Name with more than three component groups, text its Specific Character Set does not decode, or a control character the VR does not allow.";
    case "INVALID_JSON":
      return "The input is not a DICOM JSON Model object of the shape PS3.18 Annex F gives, or one value holds a delimiter its VR splits on.";
    case "BULK_DATA_UNRESOLVED":
      return "A BulkDataURI was not resolved to bytes by the resolveBulkData option.";
    case "BULK_DATA_URI_REQUIRED":
      return "A bulk value such as Pixel Data is not written inline unless the inlineBulkData option is set: give it a URI through the bulkDataUri option.";
    case "UNSUPPORTED_CHARACTER_SET":
      return "The Specific Character Set is not one we carry: only one value, the default repertoire, a single-byte ISO_IR set or ISO_IR 192, with no code extensions; and text outside 7-bit ASCII is written only under the default repertoire, ISO_IR 100 and ISO_IR 192, and only where it reads back as the same text.";
    case "UNSUPPORTED_TRANSFER_SYNTAX":
      return "fromDicomJson writes only Implicit VR Little Endian, Explicit VR Little Endian, Explicit VR Big Endian and Deflated Explicit VR Little Endian.";
    case "VALUE_TOO_LONG":
      return "A value is too long for the Value Length Field of its VR.";
    case "VR_MISMATCH":
      return "The written Data Set reads back with another VR than the JSON gives: under Implicit VR Little Endian the reader takes the VR PS3.5 and the dictionary give the tag, and UN for a private one.";
    case "NESTING_TOO_DEEP":
      return "Sequences are nested more than 64 deep, past what parseDicom reads.";
    case "CONVERSION_FAILED":
      return "The conversion failed with an error no other code names, such as one a callback threw; that error is not kept, since its message could hold a value.";
  }
}

/**
 * Thrown by `toDicomJson` and `fromDicomJson` when a value cannot cross between the Part 10 model
 * and the DICOM JSON Model without being changed or guessed at. Never carries a value, so it is
 * safe to log: `tag` is the element's tag only when PS3.6 registers it one at a time, and
 * `"<withheld>"` otherwise.
 *
 * @example
 * ```ts
 * import { parseDicom, toDicomJson, DicomJsonError } from "@cosyte/dicom";
 * try {
 *   toDicomJson(parseDicom(buf));
 * } catch (err) {
 *   if (err instanceof DicomJsonError && err.code === "UNSUPPORTED_ELEMENT") {
 *     // an encapsulated Pixel Data stream: hand it out as a BulkDataURI instead
 *   }
 * }
 * ```
 */
export class DicomJsonError extends Error {
  public readonly code: DicomJsonErrorCode;
  /** The element's tag when PS3.6 registers it one at a time, otherwise `"<withheld>"`. */
  public readonly tag: string;

  /**
   * Construct a new `DicomJsonError`. `renderedTag` must already have gone through `renderTag`.
   *
   * @internal
   */
  public constructor(code: DicomJsonErrorCode, renderedTag: string) {
    super(`[${code}] ${messageOf(code)} Tag: ${renderedTag}.`);
    this.name = "DicomJsonError";
    this.code = code;
    this.tag = renderedTag;
  }
}

/**
 * `err` when it is a {@link DicomJsonError}, otherwise a `CONVERSION_FAILED` one in its place, so
 * that nothing else leaves a converter. The error replaced is dropped: its message could hold a
 * value.
 *
 * @internal
 */
export function codedError(err: unknown): DicomJsonError {
  if (err instanceof DicomJsonError) return err;
  return new DicomJsonError(DICOM_JSON_ERROR_CODES.CONVERSION_FAILED, WITHHELD);
}

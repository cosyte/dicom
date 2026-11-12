/**
 * `toDicomJson`: a parsed {@link Dataset} as the DICOM JSON Model of PS3.18 Annex F.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Dataset } from "../dataset/dataset.js";
import type { Element } from "../dataset/element.js";
import { resolveDecoderLabel } from "../dataset/vr/charset.js";
import { decodeWithCodeExtensions, usesCodeExtensions } from "../dataset/vr/iso2022.js";
import { renderTag } from "../parser/tokens.js";
import { DICOM_JSON_ERROR_CODES, DicomJsonError, type DicomJsonErrorCode } from "./errors.js";
import type {
  DicomJsonAttribute,
  DicomJsonDataset,
  DicomJsonPersonName,
  DicomJsonValue,
  ToDicomJsonOptions,
} from "./types.js";
import {
  decimalKey,
  isBinaryVr,
  isBulkTag,
  isCharsetVr,
  isDecimalString,
  isIntegerString,
  isMultiStringVr,
  isSingleStringVr,
  isSwappedBinaryVr,
  numberWidth,
} from "./vr.js";

/** `0xFFFFFFFF` - the undefined-length sentinel (PS3.5 section 7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;

function refuse(code: DicomJsonErrorCode, el: Element): never {
  throw new DicomJsonError(code, renderTag(el.tag));
}

/** `text` without the trailing SPACE and NUL padding a value may carry. */
function trimEnd(text: string): string {
  let end = text.length;
  // Stryker disable next-line EqualityOperator: equivalent, at 0 charCodeAt(-1) is NaN, which is no pad
  while (end > 0) {
    const c = text.charCodeAt(end - 1);
    if (c !== 0x20 && c !== 0x00) break;
    end--;
  }
  return text.slice(0, end);
}

/**
 * The element's text: through `(0008,0005)` for a charset VR, Latin-1 for the rest. Bytes the set
 * does not decode are refused, never read as U+FFFD, and a leading byte order mark is kept.
 */
function textOf(el: Element): string {
  const bytes = el.rawBytes;
  if (!isCharsetVr(el.vr)) return bytes.toString("latin1");
  const terms = el.specificCharacterSet;
  if (usesCodeExtensions(terms)) {
    const decoded = decodeWithCodeExtensions(bytes, terms, "text");
    if (decoded.bytesUndecodable) refuse(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE, el);
    return decoded.text;
  }
  try {
    const decoder = new TextDecoder(resolveDecoderLabel(terms), { fatal: true, ignoreBOM: true });
    return decoder.decode(bytes);
  } catch {
    return refuse(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE, el);
  }
}

function personName(el: Element, text: string): DicomJsonPersonName | null {
  const groups = text.split("=");
  // PS3.5 section 6.2: "There shall be no more than two component group delimiters". A fourth
  // group is refused, never dropped.
  if (groups.length > 3) refuse(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE, el);
  // `split` returns at least one string, so the first group needs no default.
  const [alphabetic, ideographic = "", phonetic = ""] = groups as [string, ...string[]];
  const out: { Alphabetic?: string; Ideographic?: string; Phonetic?: string } = {};
  if (alphabetic !== "") out.Alphabetic = alphabetic;
  if (ideographic !== "") out.Ideographic = ideographic;
  if (phonetic !== "") out.Phonetic = phonetic;
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * A `DS` or `IS` value as the JSON number of the same decimal value, or a refusal: a double that
 * does not hold the text's value exactly (past 2^53, or more digits than a double keeps) is never
 * written in its place. Only the text's form may change: `"1.0"` is written as `1`.
 */
function numberString(el: Element, text: string, valid: (text: string) => boolean): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!valid(trimmed)) refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, el);
  const n = Number(trimmed);
  if (!Number.isFinite(n) || decimalKey(String(n)) !== decimalKey(trimmed)) {
    refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, el);
  }
  // `-0` is zero, and JSON writes it as `0`.
  return n === 0 ? 0 : n;
}

function binaryNumbers(el: Element, bytes: Buffer, width: 2 | 4 | 8): number[] {
  if (bytes.length % width !== 0) refuse(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE, el);
  const le = el.littleEndian;
  const vr: string = el.vr;
  const out: number[] = [];
  for (let at = 0; at < bytes.length; at += width) {
    let n: number;
    switch (vr) {
      case "US":
        n = le ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at);
        break;
      case "SS":
        n = le ? bytes.readInt16LE(at) : bytes.readInt16BE(at);
        break;
      case "UL":
        n = le ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
        break;
      case "SL":
        n = le ? bytes.readInt32LE(at) : bytes.readInt32BE(at);
        break;
      case "FL":
        n = le ? bytes.readFloatLE(at) : bytes.readFloatBE(at);
        break;
      default:
        n = le ? bytes.readDoubleLE(at) : bytes.readDoubleBE(at);
    }
    if (!Number.isFinite(n)) refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, el);
    out.push(n);
  }
  return out;
}

function attributeTags(el: Element, bytes: Buffer): string[] {
  if (bytes.length % 4 !== 0) refuse(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE, el);
  const le = el.littleEndian;
  const out: string[] = [];
  for (let at = 0; at < bytes.length; at += 4) {
    const group = le ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at);
    const element = le ? bytes.readUInt16LE(at + 2) : bytes.readUInt16BE(at + 2);
    out.push((group * 0x10000 + element).toString(16).toUpperCase().padStart(8, "0"));
  }
  return out;
}

/**
 * `true` for a VR this module writes as `Value`: every string VR, the binary numbers and `AT`.
 * `SV` and `UV` are not among them; their JSON form is not confirmed against PS3.18.
 *
 * @internal
 * @example
 * ```ts
 * hasValueForm("PN"); // true
 * hasValueForm("UV"); // false
 * ```
 */
export function hasValueForm(vr: string): boolean {
  return (
    isMultiStringVr(vr) ||
    isSingleStringVr(vr) ||
    numberWidth(vr) !== undefined ||
    vr === "AT" ||
    vr === "PN" ||
    vr === "DS" ||
    vr === "IS"
  );
}

/** The value fields of one scalar element. */
function scalarAttribute(el: Element, options: ToDicomJsonOptions): DicomJsonAttribute {
  const vr = el.vr;
  const bytes = el.rawBytes;
  // An empty value has no form in question, whatever its VR: an empty SV or UV is written too.
  if (bytes.length === 0) return { vr };
  if (isBinaryVr(vr)) {
    if (!el.littleEndian && isSwappedBinaryVr(vr)) {
      refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_BYTE_ORDER, el);
    }
    const uri = options.bulkDataUri?.(el);
    if (uri !== undefined) return { vr, BulkDataURI: uri };
    // Pixel Data and the other bulk values go inline only when the caller asks for it.
    if (isBulkTag(el.tag) && options.inlineBulkData !== true) {
      refuse(DICOM_JSON_ERROR_CODES.BULK_DATA_URI_REQUIRED, el);
    }
    return { vr, InlineBinary: bytes.toString("base64") };
  }
  if (!hasValueForm(vr)) refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_VR, el);
  const width = numberWidth(vr);
  if (width !== undefined) return { vr, Value: binaryNumbers(el, bytes, width) };
  if (vr === "AT") return { vr, Value: attributeTags(el, bytes) };
  if (isSingleStringVr(vr)) {
    const text = trimEnd(textOf(el));
    return text === "" ? { vr } : { vr, Value: [text] };
  }
  const values = textOf(el).split("\\").map(trimEnd);
  let out: DicomJsonValue[];
  if (vr === "PN") out = values.map((v) => personName(el, v));
  else if (vr === "DS") out = values.map((v) => numberString(el, v, isDecimalString));
  else if (vr === "IS") out = values.map((v) => numberString(el, v, isIntegerString));
  else out = values.map((v) => (v === "" ? null : v));
  // A value of padding alone, or one Person Name with no group, is an empty value.
  if (out.length === 1 && out[0] === null) return { vr };
  return { vr, Value: out };
}

function attributeOf(el: Element, options: ToDicomJsonOptions): DicomJsonAttribute {
  if (el.vr === "SQ") {
    const items = el.items;
    if (items === undefined) refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_ELEMENT, el);
    if (items.length === 0) return { vr: "SQ" };
    return { vr: "SQ", Value: items.map((item) => datasetOf(item, options)) };
  }
  if (el.length === UNDEFINED_LENGTH) refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_ELEMENT, el);
  return scalarAttribute(el, options);
}

function datasetOf(ds: Dataset, options: ToDicomJsonOptions): DicomJsonDataset {
  const out: Record<string, DicomJsonAttribute> = {};
  for (const el of ds.elements()) {
    // Group Length (gggg,0000) is left out, as serializeDicom leaves it out (PS3.5 section 7.2).
    if (el.tag.endsWith("0000")) continue;
    out[el.tag] = attributeOf(el, options);
  }
  return out;
}

/**
 * The DICOM JSON Model (PS3.18 Annex F) of a {@link Dataset}: one JSON object whose keys are the
 * tags, eight uppercase hex digits, in the order the Data Set holds them, each with its `vr` and
 * its value as `Value`, `InlineBinary` or `BulkDataURI`. Metadata only: no File Meta Information,
 * which the model does not carry, and no retired Group Length.
 *
 * How each VR is written: text VRs as JSON strings with their padding removed, `null` for an empty
 * value among several; `PN` as an object of `Alphabetic`, `Ideographic` and `Phonetic` groups;
 * `DS`, `IS`, `US`, `SS`, `UL`, `SL`, `FL` and `FD` as JSON numbers; `AT` as eight hex digits;
 * `SQ` as an array of nested Data Sets; and `OB`, `OD`, `OF`, `OL`, `OV`, `OW` and `UN` as base64
 * `InlineBinary`, or as a `BulkDataURI` where the `bulkDataUri` option gives one. Pixel Data and
 * the other bulk values are written inline only with the `inlineBulkData` option. An attribute
 * with an empty value has no value field. Text is decoded through `(0008,0005)` Specific Character
 * Set and `(0008,0005)` is kept as it is.
 *
 * The result is a plain object: `JSON.stringify` writes it, and `fromDicomJson` reads it back.
 *
 * @param ds - The Data Set, usually from `parseDicom`.
 * @param options - Where to hand binary values out as a `BulkDataURI`, and whether bulk values may
 *   go inline.
 * @returns The Data Set as a DICOM JSON object.
 * @throws {@link DicomJsonError} rather than change or guess a value: `UNSUPPORTED_VR` for `SV`
 *   and `UV`, `UNSUPPORTED_ELEMENT` for encapsulated Pixel Data or another undefined-length value
 *   that is not a read Sequence, `UNSUPPORTED_BYTE_ORDER` for an `OW`, `OF`, `OD`, `OL` or `OV`
 *   value under Explicit VR Big Endian, `UNREPRESENTABLE_NUMBER` for NaN, an infinity, or a `DS`
 *   or `IS` value that is not a number or that no JSON number holds exactly, `MALFORMED_VALUE` for
 *   a binary value whose length is not a whole number of values, a Person Name of more than three
 *   groups or text its Specific Character Set does not decode, and `BULK_DATA_URI_REQUIRED` for a
 *   bulk value with no URI and no `inlineBulkData`.
 * @example
 * ```ts
 * import { parseDicom, toDicomJson } from "@cosyte/dicom";
 * const json = toDicomJson(parseDicom(buf), {
 *   bulkDataUri: (el) => `https://example.com/bulk/${el.tag}`,
 * });
 * json["00100010"]; // { vr: "PN", Value: [{ Alphabetic: "DOE^JANE" }] }
 * JSON.stringify(json);
 * ```
 */
export function toDicomJson(ds: Dataset, options: ToDicomJsonOptions = {}): DicomJsonDataset {
  return datasetOf(ds, options);
}

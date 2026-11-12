/**
 * `fromDicomJson`: a DICOM JSON Model object (PS3.18 Annex F) back to a {@link Dataset}.
 *
 * The Data Set is written as Part 10 bytes under the Transfer Syntax the caller names, then read
 * by `parseDicom`, so the `Dataset` it returns holds its bytes exactly as a parsed one does and
 * `serializeDicom` writes it like any other.
 *
 * The tables here are functions rather than module constants, so that each is built where it is
 * read.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { zlibModule } from "../builtins.js";
import type { Dataset } from "../dataset/dataset.js";
import type { Element } from "../dataset/element.js";
import { LONG_FORM_VRS } from "../parser/element-header.js";
import { parseDicom } from "../parser/index.js";
import { NESTING_DEPTH_LIMIT } from "../parser/sequence.js";
import { renderTag } from "../parser/tokens.js";
import { encodeFileMeta } from "../serialize/file-meta.js";
import type { VR } from "../dictionary/types.js";
import {
  codedError,
  DICOM_JSON_ERROR_CODES,
  DicomJsonError,
  type DicomJsonErrorCode,
} from "./errors.js";
import { hasValueForm, textOf } from "./to-json.js";
import type { DicomJsonDataset, FromDicomJsonOptions } from "./types.js";
import {
  carriesCharset,
  decimalKey,
  hasForbiddenControl,
  isBinaryVr,
  isCharsetVr,
  isSingleStringVr,
  isSwappedBinaryVr,
  numberWidth,
} from "./vr.js";

/** How a Data Set body is encoded: Implicit or Explicit VR, and its byte order. */
interface Encoding {
  readonly implicit: boolean;
  readonly le: boolean;
}

/** The undefined-length sentinel (PS3.5 section 7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;
/** The largest even length a 16-bit Value Length Field holds. */
const MAX_SHORT_LENGTH = 0xfffe;
/** The largest even length a 32-bit Value Length Field holds, short of the sentinel. */
const MAX_LONG_LENGTH = 0xfffffffe;

/** The body encoding of a Transfer Syntax this writes, or `undefined`. */
function encodingOf(transferSyntaxUID: string): Encoding | undefined {
  if (transferSyntaxUID === "1.2.840.10008.1.2") return { implicit: true, le: true };
  // Explicit VR Little Endian, and Deflated, whose body is Explicit VR LE (PS3.5 section A.5).
  if (
    transferSyntaxUID === "1.2.840.10008.1.2.1" ||
    transferSyntaxUID === "1.2.840.10008.1.2.1.99"
  ) {
    return { implicit: false, le: true };
  }
  // Stryker disable next-line ObjectLiteral: equivalent, every read of implicit and le tests truthiness and the encoding never leaves this module, so {} reads as both false
  if (transferSyntaxUID === "1.2.840.10008.1.2.2") return { implicit: false, le: false };
  return undefined;
}

/** `true` for eight hex digits, a tag as the model keys it. */
function isTagKey(text: string): boolean {
  return /^[0-9A-Fa-f]{8}$/u.test(text);
}

/** The lowest and highest value of an integer VR, or `undefined` for another VR. */
function rangeOf(vr: string): readonly [number, number] | undefined {
  if (vr === "US") return [0, 0xffff];
  if (vr === "SS") return [-0x8000, 0x7fff];
  if (vr === "UL") return [0, 0xffffffff];
  if (vr === "SL" || vr === "IS") return [-0x80000000, 0x7fffffff];
  return undefined;
}

function refuse(code: DicomJsonErrorCode, tag: string | undefined): never {
  throw new DicomJsonError(code, renderTag(tag));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What every Data Set of one call is written with. */
interface Context {
  readonly encoding: Encoding;
  readonly undefinedLength: boolean;
  readonly resolveBulkData: FromDicomJsonOptions["resolveBulkData"];
}

class Writer {
  readonly #chunks: Buffer[] = [];
  readonly #le: boolean;
  length = 0;

  constructor(le: boolean) {
    this.#le = le;
  }

  bytes(b: Buffer): void {
    this.#chunks.push(b);
    this.length += b.length;
  }

  u16(n: number): void {
    const b = Buffer.alloc(2);
    if (this.#le) b.writeUInt16LE(n);
    else b.writeUInt16BE(n);
    this.bytes(b);
  }

  u32(n: number): void {
    const b = Buffer.alloc(4);
    if (this.#le) b.writeUInt32LE(n);
    else b.writeUInt32BE(n);
    this.bytes(b);
  }

  /** A placeholder 32-bit length; returns a function that fills it in. */
  u32Later(): (n: number) => void {
    const b = Buffer.alloc(4);
    this.bytes(b);
    const le = this.#le;
    return (n) => {
      if (le) b.writeUInt32LE(n);
      else b.writeUInt32BE(n);
    };
  }

  concat(): Buffer {
    return Buffer.concat(this.#chunks, this.length);
  }
}

/**
 * The Specific Character Set terms a JSON Data Set names, or `inherited` when it names none.
 * {@link encodeText} reads a `null` first term as the empty one. A term that is neither a string
 * nor `null` is refused as another shape; more than one term, or a set we do not carry (an ISO
 * 2022 term with its code extensions, `GB18030`, `GBK`), as `UNSUPPORTED_CHARACTER_SET`.
 */
function charsetOf(
  json: Record<string, unknown>,
  inherited: readonly unknown[],
): readonly unknown[] {
  const attr = json["00080005"];
  if (!isRecord(attr)) return inherited;
  const value = attr["Value"];
  if (value === undefined) return [];
  if (!Array.isArray(value)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, "00080005");
  const terms: readonly unknown[] = value;
  if (terms.some((term) => term !== null && typeof term !== "string")) {
    refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, "00080005");
  }
  if (!carriesCharset(terms.map((term) => term ?? ""))) {
    refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET, "00080005");
  }
  return terms;
}

/**
 * Encode text under the one term in effect, which {@link charsetOf} has checked we carry. Text
 * of 7-bit ASCII is the same bytes under each of those sets, none of which uses code extensions,
 * and holds no control character {@link hasForbiddenControl} lets through but TAB, LF, FF and
 * CR; anything else is encoded only for the default repertoire and `ISO_IR 100` (as ISO 8859-1)
 * and `ISO_IR 192` (UTF-8). That is not yet a promise the text reads back the same: the default
 * repertoire is ISO-IR 6 and defines no byte past `0x7F`, neither set defines the C1 bytes
 * `0x80` to `0x9F`, and UTF-8 has no lone surrogate. Nor does ISO 8859-1 hold a character past
 * U+00FF, of which `Buffer` writes the low byte only. {@link refuseChangedElements} reads every
 * value back and refuses the ones that differ, those among them: the reader decodes a byte its set
 * does not define as U+FFFD, and no byte as the character past U+00FF it was cut from.
 */
function encodeText(text: string, vr: string, terms: readonly unknown[], tag: string): Buffer {
  if (text.split("").every((c) => c.charCodeAt(0) <= 0x7f)) return Buffer.from(text);
  const first = terms[0] ?? "";
  if (!isCharsetVr(vr) || first === "" || first === "ISO_IR 6" || first === "ISO_IR 100") {
    return Buffer.from(text, "latin1");
  }
  if (first === "ISO_IR 192") return Buffer.from(text);
  return refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET, tag);
}

/**
 * One string value. PS3.5 section 6.1.2.3 says a backslash "shall only be used in character
 * strings with Value Representations of UT, ST and LT"; in any other string VR it separates
 * Values, so one value holding one would be read back as two: it is refused, never written.
 */
function stringValue(value: unknown, vr: string, tag: string): string {
  if (value === null) return "";
  if (typeof value !== "string") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  if (!isSingleStringVr(vr) && value.includes("\\")) {
    refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  }
  return value;
}

function personNameText(value: unknown, tag: string): string {
  if (value === null) return "";
  if (!isRecord(value)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  const groups = ["Alphabetic", "Ideographic", "Phonetic"].map((key) => {
    const group = value[key];
    if (group === undefined) return "";
    if (typeof group !== "string") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    // `=` splits the groups and a backslash the values: inside a group, either would change them.
    if (group.includes("=") || group.includes("\\")) {
      refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    }
    return group;
  });
  for (const key of Object.keys(value)) {
    if (key !== "Alphabetic" && key !== "Ideographic" && key !== "Phonetic") {
      refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    }
  }
  // A group the value leaves out after the last it carries writes no `=` (two at most, so linear).
  return groups.join("=").replace(/=+$/u, "");
}

/** A number the JSON gave, checked as a JSON number and against the range of its VR. */
function numberOf(value: unknown, vr: string, tag: string): number {
  if (typeof value !== "number") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  if (!Number.isFinite(value)) refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
  const range = rangeOf(vr);
  if (range !== undefined) {
    if (!Number.isInteger(value) || value < range[0] || value > range[1]) {
      refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
    }
  }
  return value;
}

function numberText(value: unknown, vr: string, tag: string): string {
  if (value === null) return "";
  const n = numberOf(value, vr, tag);
  const text = String(n);
  // A DS value is at most 16 bytes (PS3.5 section 6.2); an IS in range is never longer.
  if (text.length <= 16) return text;
  // Past 16 characters, the same value in the fewest: its significant digits and a power of ten,
  // so 1e16, whose shortest text is 17 digits, is written as "1e16".
  const compact = `${text.startsWith("-") ? "-" : ""}${decimalKey(text)}`;
  if (compact.length > 16) refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
  return compact;
}

function binaryNumbers(values: readonly unknown[], vr: string, le: boolean, tag: string): Buffer {
  const width = numberWidth(vr) as 2 | 4 | 8;
  const out = Buffer.alloc(values.length * width);
  values.forEach((raw, i) => {
    const value = numberOf(raw, vr, tag);
    const at = i * width;
    switch (vr) {
      case "US":
        if (le) out.writeUInt16LE(value, at);
        else out.writeUInt16BE(value, at);
        break;
      case "SS":
        if (le) out.writeInt16LE(value, at);
        else out.writeInt16BE(value, at);
        break;
      case "UL":
        if (le) out.writeUInt32LE(value, at);
        else out.writeUInt32BE(value, at);
        break;
      case "SL":
        if (le) out.writeInt32LE(value, at);
        else out.writeInt32BE(value, at);
        break;
      case "FL": {
        // A number is rounded to the nearest float32, as every FL writer rounds it; one past
        // float32's range, or below its normal range and not a float32 itself, is refused, since
        // there the nearest float32 is not near (1e-50 would be written as 0). 2^-126 is float32's
        // smallest positive normal value.
        const single = Math.fround(value);
        if (!Number.isFinite(single) || (single !== value && Math.abs(single) < 2 ** -126)) {
          refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
        }
        if (le) out.writeFloatLE(value, at);
        else out.writeFloatBE(value, at);
        break;
      }
      default:
        if (le) out.writeDoubleLE(value, at);
        else out.writeDoubleBE(value, at);
    }
  });
  return out;
}

function attributeTags(values: readonly unknown[], le: boolean, tag: string): Buffer {
  const out = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => {
    if (typeof value !== "string" || !isTagKey(value)) {
      refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    }
    const group = parseInt(value.slice(0, 4), 16);
    const element = parseInt(value.slice(4), 16);
    if (le) {
      out.writeUInt16LE(group, i * 4);
      out.writeUInt16LE(element, i * 4 + 2);
    } else {
      out.writeUInt16BE(group, i * 4);
      out.writeUInt16BE(element, i * 4 + 2);
    }
  });
  return out;
}

/** The value bytes of one non-Sequence attribute, unpadded. */
function scalarValue(
  attr: Record<string, unknown>,
  vr: string,
  tag: string,
  terms: readonly unknown[],
  ctx: Context,
): Buffer {
  const le = ctx.encoding.le;
  const value = attr["Value"];
  const inline = attr["InlineBinary"];
  const uri = attr["BulkDataURI"];
  if (isBinaryVr(vr)) {
    // A binary VR carries its bytes one way: never as a Value, never both inline and by URI.
    if (value !== undefined || (inline !== undefined && uri !== undefined)) {
      refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    }
    if (!le && isSwappedBinaryVr(vr)) {
      if (inline !== undefined || uri !== undefined) {
        refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_BYTE_ORDER, tag);
      }
    }
    if (inline !== undefined) {
      if (typeof inline !== "string") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
      const bytes = Buffer.from(inline, "base64");
      // Node's decoder skips what is not base64, so only the canonical encoding of the bytes is read.
      if (bytes.toString("base64") !== inline) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
      return bytes;
    }
    if (uri !== undefined) {
      if (typeof uri !== "string") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
      const bytes = ctx.resolveBulkData?.(uri, vr);
      if (bytes === undefined) refuse(DICOM_JSON_ERROR_CODES.BULK_DATA_UNRESOLVED, tag);
      return Buffer.from(bytes);
    }
    return Buffer.alloc(0);
  }
  if (inline !== undefined || uri !== undefined) {
    // A Value-form VR carried as bytes: its byte order and padding are not confirmed, so refused.
    refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  }
  if (value === undefined && (vr === "SV" || vr === "UV")) return Buffer.alloc(0);
  if (!hasValueForm(vr)) refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_VR, tag);
  if (value === undefined) return Buffer.alloc(0);
  if (!Array.isArray(value)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  const values: readonly unknown[] = value;
  if (numberWidth(vr) !== undefined) return binaryNumbers(values, vr, le, tag);
  if (vr === "AT") return attributeTags(values, le, tag);
  return encodeText(textValue(values, vr, tag), vr, terms, tag);
}

/** `true` for a VR whose `Value` is written as text: every string VR, `PN`, `DS` and `IS`. */
function isTextVr(vr: string): boolean {
  return hasValueForm(vr) && numberWidth(vr) === undefined && vr !== "AT";
}

/** The text of a text VR's values: joined by backslashes, before it is encoded. */
function textValue(values: readonly unknown[], vr: string, tag: string): string {
  if (isSingleStringVr(vr) && values.length > 1) {
    refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  }
  let texts: string[];
  if (vr === "PN") texts = values.map((v) => personNameText(v, tag));
  else if (vr === "DS" || vr === "IS") texts = values.map((v) => numberText(v, vr, tag));
  else texts = values.map((v) => stringValue(v, vr, tag));
  const text = texts.join("\\");
  // PS3.5 section 6.2: no control character but TAB, LF, FF and CR in LT, ST and UT, none in
  // another VR, and ESC only for code extensions, which are not carried.
  if (hasForbiddenControl(text, vr)) refuse(DICOM_JSON_ERROR_CODES.MALFORMED_VALUE, tag);
  return text;
}

/** The bytes of one Sequence's Items, each with its Item header and, if undefined, delimiter. */
function writeItems(
  w: Writer,
  items: readonly unknown[],
  tag: string,
  terms: readonly unknown[],
  ctx: Context,
  depth: number,
): void {
  for (const item of items) {
    if (!isRecord(item)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    w.u16(0xfffe);
    w.u16(0xe000);
    if (ctx.undefinedLength) {
      w.u32(UNDEFINED_LENGTH);
      writeDataset(w, item, terms, ctx, depth);
      w.u16(0xfffe);
      w.u16(0xe00d);
      w.u32(0);
    } else {
      const fill = w.u32Later();
      const start = w.length;
      writeDataset(w, item, terms, ctx, depth);
      fill(w.length - start);
    }
  }
}

/** Refuse a value longer than the largest even length its Value Length Field holds. */
function refuseIfLonger(length: number, max: number, tag: string): void {
  if (length > max) refuse(DICOM_JSON_ERROR_CODES.VALUE_TOO_LONG, tag);
}

function writeHeader(
  w: Writer,
  group: number,
  element: number,
  vr: string,
  length: number,
  ctx: Context,
  tag: string,
): void {
  // Implicit VR and the long-form VRs have a 32-bit Value Length Field, the rest 16 bits.
  const long = ctx.encoding.implicit || LONG_FORM_VRS.has(vr as VR);
  refuseIfLonger(length, long ? MAX_LONG_LENGTH : MAX_SHORT_LENGTH, tag);
  w.u16(group);
  w.u16(element);
  if (ctx.encoding.implicit) {
    w.u32(length);
    return;
  }
  w.bytes(Buffer.from(vr));
  if (long) {
    w.u16(0);
    w.u32(length);
    return;
  }
  w.u16(length);
}

function writeSequence(
  w: Writer,
  group: number,
  element: number,
  items: readonly unknown[],
  tag: string,
  terms: readonly unknown[],
  ctx: Context,
  depth: number,
): void {
  w.u16(group);
  w.u16(element);
  if (!ctx.encoding.implicit) {
    w.bytes(Buffer.from("SQ"));
    w.u16(0);
  }
  if (ctx.undefinedLength) {
    w.u32(UNDEFINED_LENGTH);
    writeItems(w, items, tag, terms, ctx, depth);
    w.u16(0xfffe);
    w.u16(0xe0dd);
    w.u32(0);
    return;
  }
  const fill = w.u32Later();
  const start = w.length;
  writeItems(w, items, tag, terms, ctx, depth);
  const length = w.length - start;
  // Stryker disable next-line CallExpression: a Sequence past 4 GiB cannot be built in a test
  refuseIfLonger(length, MAX_LONG_LENGTH, tag);
  fill(length);
}

/**
 * Write one Data Set. `depth` counts the Sequences it is nested in, 0 at the top: a Sequence it
 * holds is nested one deeper, and past `NESTING_DEPTH_LIMIT` the reader would refuse it, so it is
 * refused here first, before the next level is read.
 */
function writeDataset(
  w: Writer,
  json: Record<string, unknown>,
  inherited: readonly unknown[],
  ctx: Context,
  depth: number,
): void {
  const terms = charsetOf(json, inherited);
  const entries: [number, string, unknown][] = [];
  const seen = new Set<string>();
  for (const [key, attr] of Object.entries(json)) {
    if (!isTagKey(key)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, undefined);
    const tag = key.toUpperCase();
    if (seen.has(tag)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    seen.add(tag);
    const n = parseInt(tag, 16);
    const group = Math.floor(n / 0x10000);
    // File Meta Information is not part of a Data Set, and FFFE tags are item delimitation.
    if (group === 0x0002 || group === 0xfffe) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    // PS3.5 section 7.8.1: "Elements with Tags (0001,xxxx), (0003,xxxx), (0005,xxxx), (0007,xxxx)
    // and (FFFF,xxxx) shall not be used."
    if ((group <= 0x0007 && group % 2 === 1) || group === 0xffff) {
      refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    }
    entries.push([n, tag, attr]);
  }
  entries.sort((a, b) => a[0] - b[0]);
  for (const [n, tag, attr] of entries) {
    const group = Math.floor(n / 0x10000);
    const element = n % 0x10000;
    if (!isRecord(attr) || typeof attr["vr"] !== "string") {
      refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    }
    const vr = attr["vr"];
    if (vr === "SQ") {
      if (attr["InlineBinary"] !== undefined || attr["BulkDataURI"] !== undefined) {
        refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
      }
      const items = attr["Value"] ?? [];
      if (!Array.isArray(items)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
      if (depth >= NESTING_DEPTH_LIMIT) refuse(DICOM_JSON_ERROR_CODES.NESTING_TOO_DEEP, tag);
      writeSequence(w, group, element, items, tag, terms, ctx, depth + 1);
      continue;
    }
    const value = scalarValue(attr, vr, tag, terms, ctx);
    const length = value.length + (value.length % 2);
    writeHeader(w, group, element, vr, length, ctx, tag);
    w.bytes(value);
    // PS3.5 pads an odd-length UI or binary value with NUL, and other text with SPACE.
    if (value.length % 2 === 1) {
      w.bytes(Buffer.from([vr === "UI" || isBinaryVr(vr) ? 0x00 : 0x20]));
    }
  }
}

/**
 * Refuse a Data Set whose elements read back as anything but what its JSON gives, at every depth.
 *
 * - The VR: under Implicit VR Little Endian no VR is written, and the reader takes the one PS3.5
 *   and the dictionary give the tag (`UN` for a private one), so a value written as one VR would be
 *   read as another: `SS` -1 as `US` 65535. That is `VR_MISMATCH`.
 * - The text of a text VR, as {@link textOf} reads it through the reader's own decoder under the
 *   Specific Character Set the reader gives the element, against the text the JSON asked for and
 *   the one pad character an odd length takes. Any difference is `UNSUPPORTED_CHARACTER_SET`: the
 *   set the text was encoded in does not give it back (a character past U+007F under the default
 *   repertoire, a C1 code point under `ISO_IR 100`, a lone surrogate under `ISO_IR 192`).
 *
 * Binary numbers, `AT` and binary VRs are written by fixed-width writes or as bytes, and read by
 * the same reads, with nothing decoded between.
 */
function refuseChangedElements(json: Record<string, unknown>, ds: Dataset): void {
  for (const [key, attr] of Object.entries(json)) {
    const tag = key.toUpperCase();
    // `writeDataset` has already refused an attribute that is not a record with a string `vr`.
    const fields = attr as Record<string, unknown>;
    const el = ds.get(tag);
    // Stryker disable next-line OptionalChaining: equivalent, the reader reads back every element written; the check is there so a dropped one is refused with a code
    const vr = el?.vr;
    if (vr !== fields["vr"]) refuse(DICOM_JSON_ERROR_CODES.VR_MISMATCH, tag);
    const read = el as Element;
    if (vr === "SQ") {
      // The reader descends every Sequence it reads as SQ, one Item for each the JSON gives.
      const items = read.items as readonly Dataset[];
      ((fields["Value"] ?? []) as Record<string, unknown>[]).forEach((item, i) => {
        refuseChangedElements(item, items[i] as Dataset);
      });
      continue;
    }
    if (!isTextVr(read.vr)) continue;
    // `writeDataset` has already refused a `Value` that is not an array, and wrote this text.
    const text = textValue((fields["Value"] ?? []) as readonly unknown[], read.vr, tag);
    // Bytes the set does not define are text it does not encode, refused as such.
    const back = textOf(read, DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET);
    const pad = read.vr === "UI" ? "\0" : " ";
    if (back !== text && back !== `${text}${pad}`) {
      refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET, tag);
    }
  }
}

/**
 * A {@link Dataset} from a DICOM JSON Model object (PS3.18 Annex F), written under the File Meta
 * the caller gives and read back by `parseDicom`, so `serializeDicom` writes it as Part 10.
 *
 * Each attribute is written from its `vr` and its `Value`, `InlineBinary` or `BulkDataURI`, the
 * inverse of `toDicomJson`: strings joined by backslashes and padded to even length (`UI` with a
 * NUL, the rest with a space), Person Name groups joined by `=`, `DS` and `IS` numbers in
 * JavaScript's shortest text for them (or, past 16 characters, as significant digits and a power
 * of ten: `1e16`), binary numbers and `AT` in the Transfer Syntax's byte
 * order, and base64 or resolved bulk data as it is. Data Elements are written in ascending tag
 * order at every depth. Sequences and Items take the `sequenceLength` option, defined lengths by
 * default. Text is encoded under the `(0008,0005)` Specific Character Set of its Data Set.
 *
 * @param json - One Data Set of the DICOM JSON Model, as `JSON.parse` returns it.
 * @param options - The File Meta to write under, how to delimit Sequences, and how to resolve a
 *   `BulkDataURI`.
 * @returns The Data Set, read by `parseDicom`.
 * @throws {@link DicomJsonError} rather than guess: `INVALID_JSON` for an object of another shape,
 *   `UNSUPPORTED_TRANSFER_SYNTAX` for a Transfer Syntax other than the four uncompressed and
 *   Deflated ones, `UNSUPPORTED_VR` for `SV`, `UV` or a VR PS3.5 does not define,
 *   `BULK_DATA_UNRESOLVED` for a `BulkDataURI` nothing resolved, `UNSUPPORTED_CHARACTER_SET` for
 *   text its Specific Character Set is not encoded under here or that the written Data Set does
 *   not read back as (a character past U+007F under the default repertoire, which is ISO-IR 6, a
 *   C1 code point under `ISO_IR 100`, which no set defines, or a lone surrogate under
 *   `ISO_IR 192`), `UNSUPPORTED_BYTE_ORDER` for an
 *   `OW`, `OF`, `OD`, `OL` or `OV` value under Explicit VR Big Endian, `UNREPRESENTABLE_NUMBER` for
 *   a number out of its VR's range or an `FL` number float32 does not hold, `VALUE_TOO_LONG` for a
 *   value its Value Length Field cannot hold, and `VR_MISMATCH` for an attribute whose VR the
 *   written Data Set does not read back with, as under Implicit VR Little Endian, where no VR is
 *   written. One value holding a delimiter its VR splits on (a backslash in a multi-valued string
 *   or a Person Name, an `=` in a Person Name group) is `INVALID_JSON`, never split, and so is a
 *   tag in group `0001`, `0003`, `0005`, `0007` or `FFFF`. A Specific
 *   Character Set of more than one value, or one we do not carry (an ISO 2022 term, `GB18030`,
 *   `GBK`), at any depth, is `UNSUPPORTED_CHARACTER_SET`; text holding a control character its
 *   VR does not allow, ESC among them, is `MALFORMED_VALUE`; Sequences nested more than 64 deep
 *   are `NESTING_TOO_DEEP`; and any other error, one the `resolveBulkData` option threw included,
 *   is `CONVERSION_FAILED`: no other error leaves this function.
 * @example
 * ```ts
 * import { fromDicomJson, parseDicom, serializeDicom, toDicomJson } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * const json = JSON.parse(JSON.stringify(toDicomJson(ds)));
 * const back = fromDicomJson(json, { fileMeta: ds.fileMeta ?? { transferSyntaxUID: "1.2.840.10008.1.2.1" } });
 * serializeDicom(back);
 * ```
 */
export function fromDicomJson(json: DicomJsonDataset, options: FromDicomJsonOptions): Dataset {
  try {
    return datasetFrom(json, options);
  } catch (err) {
    throw codedError(err);
  }
}

function datasetFrom(json: DicomJsonDataset, options: FromDicomJsonOptions): Dataset {
  const fileMeta = options.fileMeta;
  const encoding = encodingOf(fileMeta.transferSyntaxUID);
  if (encoding === undefined) refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX, undefined);
  if (!isRecord(json)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, undefined);
  const ctx: Context = {
    encoding,
    undefinedLength: options.sequenceLength === "undefined",
    resolveBulkData: options.resolveBulkData,
  };
  const w = new Writer(encoding.le);
  writeDataset(w, json, [], ctx, 0);
  let body = w.concat();
  if (fileMeta.transferSyntaxUID === "1.2.840.10008.1.2.1.99") {
    body = zlibModule().deflateRawSync(body);
  }
  // The 128-byte preamble and the `DICM` prefix (PS3.10).
  const preamble = Buffer.concat([Buffer.alloc(128), Buffer.from([0x44, 0x49, 0x43, 0x4d])]);
  const ds = parseDicom(Buffer.concat([preamble, encodeFileMeta(fileMeta), body]));
  refuseChangedElements(json, ds);
  return ds;
}

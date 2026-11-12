/**
 * `fromDicomJson`: a DICOM JSON Model object (PS3.18 Annex F) back to a {@link Dataset}.
 *
 * The Data Set is written as Part 10 bytes under the Transfer Syntax the caller names, then read
 * by `parseDicom`, so the `Dataset` it returns holds its bytes exactly as a parsed one does and
 * `serializeDicom` writes it like any other.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { zlibModule } from "../builtins.js";
import type { Dataset } from "../dataset/dataset.js";
import { LONG_FORM_VRS } from "../parser/element-header.js";
import { parseDicom } from "../parser/index.js";
import { renderTag } from "../parser/tokens.js";
import { encodeFileMeta } from "../serialize/file-meta.js";
import type { VR } from "../dictionary/types.js";
import { DICOM_JSON_ERROR_CODES, DicomJsonError, type DicomJsonErrorCode } from "./errors.js";
import { hasValueForm } from "./to-json.js";
import type { DicomJsonDataset, FromDicomJsonOptions } from "./types.js";
import {
  BINARY_VRS,
  CHARSET_VRS,
  NUMBER_WIDTH,
  SINGLE_STRING_VRS,
  SWAPPED_BINARY_VRS,
} from "./vr.js";

type Encoding = "implicit" | "explicitLE" | "explicitBE";

const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

const ENCODINGS: Readonly<Record<string, Encoding>> = {
  "1.2.840.10008.1.2": "implicit",
  "1.2.840.10008.1.2.1": "explicitLE",
  "1.2.840.10008.1.2.2": "explicitBE",
  [TS_DEFLATED_LE]: "explicitLE",
};

const UNDEFINED_LENGTH = 0xffffffff;
const MAX_SHORT_LENGTH = 0xfffe;
const MAX_LONG_LENGTH = 0xfffffffe;
const TAG_KEY = /^[0-9A-Fa-f]{8}$/u;
const CHARSET_TAG = "00080005";

/** The ranges of the integer VRs. */
const INTEGER_RANGE: Readonly<Record<string, readonly [number, number]>> = {
  US: [0, 0xffff],
  SS: [-0x8000, 0x7fff],
  UL: [0, 0xffffffff],
  SL: [-0x80000000, 0x7fffffff],
};

const IS_MIN = -0x80000000;
const IS_MAX = 0x7fffffff;
const DS_MAX_CHARS = 16;

function refuse(code: DicomJsonErrorCode, tag: string | undefined): never {
  throw new DicomJsonError(code, renderTag(tag));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How a Data Set's text is encoded: the Specific Character Set terms in effect. */
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

/** The Specific Character Set terms a JSON Data Set names, or `inherited` when it names none. */
function charsetOf(json: Record<string, unknown>, inherited: readonly string[]): readonly string[] {
  const attr = json[CHARSET_TAG];
  if (!isRecord(attr)) return inherited;
  const value = attr["Value"];
  if (value === undefined) return [];
  if (!Array.isArray(value)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, CHARSET_TAG);
  return value.map((term: unknown) => {
    if (term === null) return "";
    if (typeof term !== "string") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, CHARSET_TAG);
    return term;
  });
}

/**
 * Encode text under the terms in effect. Text of the Default Repertoire's 7-bit range is the same
 * bytes under every Specific Character Set; anything else is encoded only for the default
 * repertoire and `ISO_IR 100` (Latin-1, as the reader decodes them) and `ISO_IR 192` (UTF-8).
 */
function encodeText(text: string, vr: string, terms: readonly string[], tag: string): Buffer {
  if (text.split("").every((c) => c.charCodeAt(0) <= 0x7f)) return Buffer.from(text);
  const first = terms[0] ?? "";
  const single = terms.length <= 1;
  if (!CHARSET_VRS.has(vr) || (single && (first === "" || first === "ISO_IR 6"))) {
    return latin1(text, tag);
  }
  if (single && first === "ISO_IR 100") return latin1(text, tag);
  if (single && first === "ISO_IR 192") return Buffer.from(text);
  return refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET, tag);
}

function latin1(text: string, tag: string): Buffer {
  if (text.split("").some((c) => c.charCodeAt(0) > 0xff)) {
    refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET, tag);
  }
  return Buffer.from(text, "latin1");
}

function stringValue(value: unknown, tag: string): string {
  if (value === null) return "";
  if (typeof value !== "string") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  return value;
}

function personNameText(value: unknown, tag: string): string {
  if (value === null) return "";
  if (!isRecord(value)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  const groups = ["Alphabetic", "Ideographic", "Phonetic"].map((key) => {
    const group = value[key];
    if (group === undefined) return "";
    if (typeof group !== "string") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
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

function numberText(value: unknown, vr: string, tag: string): string {
  if (value === null) return "";
  if (typeof value !== "number") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  if (!Number.isFinite(value)) refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
  if (vr === "IS") {
    if (!Number.isInteger(value) || value < IS_MIN || value > IS_MAX) {
      refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
    }
    return String(value);
  }
  const text = String(value);
  if (text.length > DS_MAX_CHARS) refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
  return text;
}

function binaryNumbers(values: readonly unknown[], vr: string, le: boolean, tag: string): Buffer {
  const width = NUMBER_WIDTH[vr] as 2 | 4 | 8;
  const out = Buffer.alloc(values.length * width);
  values.forEach((value, i) => {
    if (typeof value !== "number") refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    if (!Number.isFinite(value)) refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
    const at = i * width;
    const range = INTEGER_RANGE[vr];
    if (range !== undefined) {
      if (!Number.isInteger(value) || value < range[0] || value > range[1]) {
        refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
      }
    }
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
      case "FL":
        if (!Number.isFinite(Math.fround(value))) {
          refuse(DICOM_JSON_ERROR_CODES.UNREPRESENTABLE_NUMBER, tag);
        }
        if (le) out.writeFloatLE(value, at);
        else out.writeFloatBE(value, at);
        break;
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
    if (typeof value !== "string" || !TAG_KEY.test(value)) {
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
  terms: readonly string[],
  ctx: Context,
): Buffer {
  const le = ctx.encoding !== "explicitBE";
  const value = attr["Value"];
  const inline = attr["InlineBinary"];
  const uri = attr["BulkDataURI"];
  if (BINARY_VRS.has(vr)) {
    // A binary VR carries its bytes one way: never as a Value, never both inline and by URI.
    if (value !== undefined || (inline !== undefined && uri !== undefined)) {
      refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    }
    if (!le && SWAPPED_BINARY_VRS.has(vr)) {
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
  if (NUMBER_WIDTH[vr] !== undefined) return binaryNumbers(values, vr, le, tag);
  if (vr === "AT") return attributeTags(values, le, tag);
  if (SINGLE_STRING_VRS.has(vr) && values.length > 1) {
    refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
  }
  let texts: string[];
  if (vr === "PN") texts = values.map((v) => personNameText(v, tag));
  else if (vr === "DS" || vr === "IS") texts = values.map((v) => numberText(v, vr, tag));
  else texts = values.map((v) => stringValue(v, tag));
  return encodeText(texts.join("\\"), vr, terms, tag);
}

/** The bytes of one Sequence's Items, each with its Item header and, if undefined, delimiter. */
function writeItems(
  w: Writer,
  items: readonly unknown[],
  tag: string,
  terms: readonly string[],
  ctx: Context,
): void {
  for (const item of items) {
    if (!isRecord(item)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    w.u16(0xfffe);
    w.u16(0xe000);
    if (ctx.undefinedLength) {
      w.u32(UNDEFINED_LENGTH);
      writeDataset(w, item, terms, ctx);
      w.u16(0xfffe);
      w.u16(0xe00d);
      w.u32(0);
    } else {
      const fill = w.u32Later();
      const start = w.length;
      writeDataset(w, item, terms, ctx);
      fill(w.length - start);
    }
  }
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
  const long = ctx.encoding === "implicit" || LONG_FORM_VRS.has(vr as VR);
  refuseIfLonger(length, long ? MAX_LONG_LENGTH : MAX_SHORT_LENGTH, tag);
  w.u16(group);
  w.u16(element);
  if (ctx.encoding === "implicit") {
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

/** Refuse a value longer than the largest even length its Value Length Field holds. */
function refuseIfLonger(length: number, max: number, tag: string): void {
  if (length > max) refuse(DICOM_JSON_ERROR_CODES.VALUE_TOO_LONG, tag);
}

function writeSequence(
  w: Writer,
  group: number,
  element: number,
  items: readonly unknown[],
  tag: string,
  terms: readonly string[],
  ctx: Context,
): void {
  w.u16(group);
  w.u16(element);
  if (ctx.encoding !== "implicit") {
    w.bytes(Buffer.from("SQ"));
    w.u16(0);
  }
  if (ctx.undefinedLength) {
    w.u32(UNDEFINED_LENGTH);
    writeItems(w, items, tag, terms, ctx);
    w.u16(0xfffe);
    w.u16(0xe0dd);
    w.u32(0);
    return;
  }
  const fill = w.u32Later();
  const start = w.length;
  writeItems(w, items, tag, terms, ctx);
  const length = w.length - start;
  refuseIfLonger(length, MAX_LONG_LENGTH, tag);
  fill(length);
}

function writeDataset(
  w: Writer,
  json: Record<string, unknown>,
  inherited: readonly string[],
  ctx: Context,
): void {
  const terms = charsetOf(json, inherited);
  const entries: [number, string, unknown][] = [];
  const seen = new Set<string>();
  for (const [key, attr] of Object.entries(json)) {
    if (!TAG_KEY.test(key)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, undefined);
    const tag = key.toUpperCase();
    if (seen.has(tag)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
    seen.add(tag);
    const n = parseInt(tag, 16);
    const group = Math.floor(n / 0x10000);
    // File Meta Information is not part of a Data Set, and FFFE tags are item delimitation.
    if (group === 0x0002 || group === 0xfffe) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, tag);
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
      writeSequence(w, group, element, items, tag, terms, ctx);
      continue;
    }
    const value = scalarValue(attr, vr, tag, terms, ctx);
    const length = value.length + (value.length % 2);
    writeHeader(w, group, element, vr, length, ctx, tag);
    w.bytes(value);
    // PS3.5 pads an odd-length UI or binary value with NUL, and other text with SPACE.
    if (value.length % 2 === 1) {
      w.bytes(Buffer.from([vr === "UI" || BINARY_VRS.has(vr) ? 0x00 : 0x20]));
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
 * JavaScript's shortest text for them, binary numbers and `AT` in the Transfer Syntax's byte
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
 *   text its Specific Character Set is not encoded under here, `UNSUPPORTED_BYTE_ORDER` for an
 *   `OW`, `OF`, `OD`, `OL` or `OV` value under Explicit VR Big Endian, `UNREPRESENTABLE_NUMBER` for
 *   a number out of its VR's range, and `VALUE_TOO_LONG` for a value its Value Length Field cannot
 *   hold.
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
  const fileMeta = options.fileMeta;
  const encoding = ENCODINGS[fileMeta.transferSyntaxUID];
  if (encoding === undefined) refuse(DICOM_JSON_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX, undefined);
  if (!isRecord(json)) refuse(DICOM_JSON_ERROR_CODES.INVALID_JSON, undefined);
  const ctx: Context = {
    encoding,
    undefinedLength: options.sequenceLength === "undefined",
    resolveBulkData: options.resolveBulkData,
  };
  const w = new Writer(encoding !== "explicitBE");
  writeDataset(w, json, [], ctx);
  let body = w.concat();
  if (fileMeta.transferSyntaxUID === TS_DEFLATED_LE) body = zlibModule().deflateRawSync(body);
  // The 128-byte preamble and the `DICM` prefix (PS3.10).
  const preamble = Buffer.concat([Buffer.alloc(128), Buffer.from([0x44, 0x49, 0x43, 0x4d])]);
  return parseDicom(Buffer.concat([preamble, encodeFileMeta(fileMeta), body]));
}

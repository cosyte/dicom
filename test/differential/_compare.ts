/**
 * The two readings the differential test compares, brought to one shape, and the walk that lists
 * where they differ.
 *
 * Each side is reduced to a tree of nodes, one per element: its tag, its VR, and its value as
 * bytes, as text, or as the items of a sequence. The reduction keeps what the two readers must
 * agree on and nothing either one adds of its own:
 *
 * - A numeric binary value (`US SS UL SL FL FD AT SV UV`) becomes its bytes in little-endian
 *   order: ours are swapped from the wire when the transfer syntax is big endian, and dcmjs's
 *   numbers are written back out. A number that does not survive the round trip, which is a NaN
 *   payload, is the only loss, and no document here carries one.
 * - A value of an ASCII string VR (`AE AS CS DA DS DT IS TM UI UR`) is its bytes: dcmjs reads
 *   these one byte to one character, so its strings are written back to bytes with `latin1`.
 * - A value of a VR whose text the Specific Character Set governs (`LO LT PN SH ST UC UT`) is
 *   compared as decoded text, since the two readers decode it and neither returns the bytes.
 * - Any other value (`OB OD OF OL OV OW UN`, encapsulated Pixel Data among them) is its bytes as
 *   read from the wire. Encapsulated Pixel Data is its fragments concatenated, without the Basic
 *   Offset Table, which dcmjs reads to group fragments into frames and does not return.
 *
 * For the string VRs, the padding PS3.5 section 6.2 adds to make a value even (a trailing space,
 * or a trailing NUL for `UI`) is not part of the value, and dcmjs drops it where it can tell, so
 * trailing spaces and NULs are dropped on both sides before the comparison.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { DcmjsDict, DcmjsElement } from "dcmjs";

import type { Dataset, Element, FileMeta } from "../../src/index.js";
import { decodeText, readPixelDataFragments } from "../../src/index.js";

/** The value of one element, reduced. */
export type Value =
  | { readonly kind: "bytes"; readonly hex: string }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "items"; readonly items: readonly (readonly Node[])[] };

/** One element, reduced. */
export interface Node {
  readonly tag: string;
  readonly vr: string;
  readonly value: Value;
  /**
   * Our side only: the value's bytes as they were on the wire, for an element that is not a
   * sequence. Where dcmjs reads another VR it returns the value as bytes, and these are what they
   * are held to.
   */
  readonly wire?: Value;
}

/** What one difference is about. */
export type DifferenceKind =
  | "refused-by-dcmjs"
  | "unreadable-by-dcmjs"
  | "refused-by-cosyte"
  | "only-in-cosyte"
  | "only-in-dcmjs"
  | "vr"
  | "value";

/** One place the two readings differ. */
export interface Difference {
  readonly document: string;
  /** `meta` or `dataset`, then the tag path: `0040A730[0].0040A160`. */
  readonly path: string;
  readonly kind: DifferenceKind;
  /** What each side read, for the failure message. Every document is synthetic. */
  readonly detail: string;
}

const NUMERIC_WIDTH: Readonly<Record<string, number>> = {
  US: 2,
  SS: 2,
  AT: 2,
  UL: 4,
  SL: 4,
  FL: 4,
  FD: 8,
  SV: 8,
  UV: 8,
};

const ASCII_VRS = new Set(["AE", "AS", "CS", "DA", "DS", "DT", "IS", "TM", "UI", "UR"]);
const TEXT_VRS = new Set(["LO", "LT", "PN", "SH", "ST", "UC", "UT"]);
const MULTI_VALUED_TEXT_VRS = new Set(["LO", "PN", "SH", "UC"]);

/** Drop the trailing spaces and NULs PS3.5 section 6.2 pads a string value with. */
function stripPadBytes(bytes: Buffer): Buffer {
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0x20 || bytes[end - 1] === 0x00)) end--;
  return bytes.subarray(0, end);
}

/**
 * Our text of a value whose characters the Specific Character Set governs, with its Values joined
 * by a backslash. That is `decodeText` of the whole value, except under JIS X 0201, where a 0x5C
 * byte separates the Values of a `PN`, `LO`, `SH` or `UC` and `decodeText`, which reads text as an
 * `LT` does, reads it as YEN SIGN; each Value is decoded apart there, as `Element.value` does.
 */
function charsetText(el: Element): string {
  const terms = el.specificCharacterSet;
  const jis = terms?.length === 1 && (terms[0] === "ISO_IR 13" || terms[0] === "ISO 2022 IR 13");
  if (!jis || !MULTI_VALUED_TEXT_VRS.has(el.vr)) return decodeText(el.rawBytes, terms);
  const values: string[] = [];
  let start = 0;
  for (let i = 0; i <= el.rawBytes.length; i++) {
    if (i === el.rawBytes.length || el.rawBytes[i] === 0x5c) {
      values.push(decodeText(el.rawBytes.subarray(start, i), terms));
      start = i + 1;
    }
  }
  return values.join("\\");
}

function stripPadText(text: string): string {
  return text.replace(/[ \0]+$/u, "");
}

function bytesValue(bytes: Buffer): Value {
  return { kind: "bytes", hex: bytes.toString("hex") };
}

/** Swap each `width`-byte word of a big-endian value to little-endian. */
function toLittleEndian(bytes: Buffer, width: number): Buffer {
  const out = Buffer.from(bytes);
  for (let at = 0; at + width <= out.length; at += width) out.subarray(at, at + width).reverse();
  return out;
}

// ---------------------------------------------------------------------------
// Our reading
// ---------------------------------------------------------------------------

function cosyteValue(el: Element, owner: Dataset): Value {
  if (el.tag === "7FE00010") {
    const encapsulated = readPixelDataFragments(owner);
    // dcmjs returns the fragments and keeps no Basic Offset Table, so the table is left out here.
    if (encapsulated !== undefined) return bytesValue(Buffer.concat(encapsulated.fragments));
  }
  if (el.items !== undefined) {
    return { kind: "items", items: el.items.map((item) => cosyteNodes(item)) };
  }
  const width = NUMERIC_WIDTH[el.vr];
  if (width !== undefined) {
    return bytesValue(el.littleEndian ? el.rawBytes : toLittleEndian(el.rawBytes, width));
  }
  if (ASCII_VRS.has(el.vr)) return bytesValue(stripPadBytes(el.rawBytes));
  if (TEXT_VRS.has(el.vr)) return { kind: "text", text: stripPadText(charsetText(el)) };
  return bytesValue(el.rawBytes);
}

/** Our reading of one Data Set, reduced. */
export function cosyteNodes(ds: Dataset): Node[] {
  return ds.elements().map((el) => {
    const value = cosyteValue(el, ds);
    return value.kind === "items"
      ? { tag: el.tag, vr: el.vr, value }
      : { tag: el.tag, vr: el.vr, value, wire: bytesValue(el.rawBytes) };
  });
}

/** Our reading of the File Meta group, reduced: its modeled fields and the elements it kept. */
export function cosyteMetaNodes(meta: FileMeta): Node[] {
  const nodes: Node[] = [];
  const ascii = (tag: string, vr: string, value: string | undefined): void => {
    if (value !== undefined) {
      nodes.push({ tag, vr, value: bytesValue(stripPadBytes(Buffer.from(value, "latin1"))) });
    }
  };
  if (meta.fileMetaInformationVersion !== undefined) {
    nodes.push({ tag: "00020001", vr: "OB", value: bytesValue(meta.fileMetaInformationVersion) });
  }
  ascii("00020002", "UI", meta.mediaStorageSOPClassUID);
  ascii("00020003", "UI", meta.mediaStorageSOPInstanceUID);
  ascii("00020010", "UI", meta.transferSyntaxUID);
  ascii("00020012", "UI", meta.implementationClassUID);
  if (meta.implementationVersionName !== undefined) {
    nodes.push({
      tag: "00020013",
      vr: "SH",
      value: { kind: "text", text: stripPadText(meta.implementationVersionName) },
    });
  }
  ascii("00020016", "AE", meta.sourceApplicationEntityTitle);
  for (const extra of meta.extraElements ?? []) {
    const width = NUMERIC_WIDTH[extra.vr];
    let value: Value;
    if (width !== undefined) value = bytesValue(extra.value);
    else if (ASCII_VRS.has(extra.vr)) value = bytesValue(stripPadBytes(extra.value));
    else if (TEXT_VRS.has(extra.vr)) {
      value = { kind: "text", text: stripPadText(extra.value.toString("latin1")) };
    } else value = bytesValue(extra.value);
    nodes.push({ tag: extra.tag, vr: extra.vr, value });
  }
  return nodes.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

// ---------------------------------------------------------------------------
// dcmjs's reading
// ---------------------------------------------------------------------------

/** dcmjs's values as it read them, before its formatting: a string, or a list of them. */
function rawStrings(el: DcmjsElement): string {
  const raw = el._rawValue;
  const parts: readonly unknown[] = Array.isArray(raw) ? raw : [raw];
  return parts.map((part) => (typeof part === "string" ? part : "")).join("\\");
}

/** Every ArrayBuffer under a dcmjs binary value, in order, as one Buffer. */
function binaryBytes(values: readonly unknown[] | undefined): Buffer {
  const parts: Buffer[] = [];
  const visit = (value: unknown): void => {
    if (value instanceof ArrayBuffer) parts.push(Buffer.from(value));
    else if (ArrayBuffer.isView(value)) {
      parts.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    } else if (Array.isArray(value)) value.forEach(visit);
  };
  (values ?? []).forEach(visit);
  return Buffer.concat(parts);
}

/** dcmjs's numbers, written back out little-endian at the VR's width. */
function numericBytes(vr: string, el: DcmjsElement): Buffer {
  const raw = el._rawValue;
  const values = Array.isArray(raw) ? (raw as unknown[]) : raw === undefined ? [] : [raw];
  const parts = values.map((value): Buffer => {
    const out = Buffer.alloc(vr === "AT" ? 4 : (NUMERIC_WIDTH[vr] ?? 0));
    switch (vr) {
      case "US":
        out.writeUInt16LE(Number(value));
        break;
      case "SS":
        out.writeInt16LE(Number(value));
        break;
      case "UL":
        out.writeUInt32LE(Number(value));
        break;
      case "SL":
        out.writeInt32LE(Number(value));
        break;
      case "FL":
        out.writeFloatLE(Number(value));
        break;
      case "FD":
        out.writeDoubleLE(Number(value));
        break;
      case "SV":
        out.writeBigInt64LE(BigInt(value as bigint));
        break;
      case "UV":
        out.writeBigUInt64LE(BigInt(value as bigint));
        break;
      default: {
        const tag = Number(value) >>> 0;
        out.writeUInt16LE(tag >>> 16, 0);
        out.writeUInt16LE(tag & 0xffff, 2);
      }
    }
    return out;
  });
  return Buffer.concat(parts);
}

function dcmjsValue(el: DcmjsElement): Value {
  const vr = el.vr;
  if (vr === "SQ") {
    const items = (el.Value ?? []) as readonly DcmjsDict[];
    return { kind: "items", items: items.map((item) => dcmjsNodes(item)) };
  }
  if (NUMERIC_WIDTH[vr] !== undefined) return bytesValue(numericBytes(vr, el));
  if (ASCII_VRS.has(vr)) {
    return bytesValue(stripPadBytes(Buffer.from(rawStrings(el), "latin1")));
  }
  if (TEXT_VRS.has(vr)) return { kind: "text", text: stripPadText(rawStrings(el)) };
  return bytesValue(binaryBytes(el.Value));
}

/** dcmjs's reading of one Data Set, reduced, in tag order. */
export function dcmjsNodes(dict: DcmjsDict): Node[] {
  return Object.keys(dict)
    .sort()
    .map((tag) => {
      const el = dict[tag] as DcmjsElement;
      return { tag, vr: el.vr, value: dcmjsValue(el) };
    });
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

function show(value: Value): string {
  switch (value.kind) {
    case "bytes":
      return value.hex.length > 96 ? `${String(value.hex.length / 2)} bytes` : `hex ${value.hex}`;
    case "text":
      return JSON.stringify(value.text);
    case "items":
      return `${String(value.items.length)} items`;
  }
}

/** Every place two reduced Data Sets differ, the path of each under `prefix`. */
export function compareNodes(
  document: string,
  prefix: string,
  ours: readonly Node[],
  theirs: readonly Node[],
): Difference[] {
  const out: Difference[] = [];
  const theirsByTag = new Map(theirs.map((node) => [node.tag, node]));
  const oursByTag = new Map(ours.map((node) => [node.tag, node]));
  const tags = [...new Set([...oursByTag.keys(), ...theirsByTag.keys()])].sort();
  for (const tag of tags) {
    const path = `${prefix}${tag}`;
    const a = oursByTag.get(tag);
    const b = theirsByTag.get(tag);
    if (a === undefined) {
      out.push({ document, path, kind: "only-in-dcmjs", detail: `dcmjs ${String(b?.vr)}` });
      continue;
    }
    if (b === undefined) {
      out.push({ document, path, kind: "only-in-cosyte", detail: `cosyte ${a.vr}` });
      continue;
    }
    if (a.vr !== b.vr) {
      out.push({ document, path, kind: "vr", detail: `cosyte ${a.vr}, dcmjs ${b.vr}` });
      // Read under another VR, a value can still be held to its bytes: dcmjs returns an unknown
      // VR's value as the bytes on the wire, and a number in a little-endian file as itself.
      if (a.wire !== undefined && b.value.kind === "bytes") {
        if (JSON.stringify(a.wire) !== JSON.stringify(b.value)) {
          out.push({
            document,
            path,
            kind: "value",
            detail: `cosyte ${show(a.wire)}, dcmjs ${show(b.value)}`,
          });
        }
      }
      continue;
    }
    if (a.value.kind === "items" && b.value.kind === "items") {
      if (a.value.items.length !== b.value.items.length) {
        out.push({ document, path, kind: "value", detail: `${show(a.value)} / ${show(b.value)}` });
        continue;
      }
      const theirItems = b.value.items;
      a.value.items.forEach((item, i) => {
        out.push(...compareNodes(document, `${path}[${String(i)}].`, item, theirItems[i] ?? []));
      });
      continue;
    }
    if (JSON.stringify(a.value) !== JSON.stringify(b.value)) {
      out.push({
        document,
        path,
        kind: "value",
        detail: `cosyte ${show(a.value)}, dcmjs ${show(b.value)}`,
      });
    }
  }
  return out;
}

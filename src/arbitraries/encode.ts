/**
 * The small Part 10 writer behind `@cosyte/dicom/arbitraries`. It is not `serializeDicom`: the
 * generators need files that are wrong on purpose (no preamble, a File Meta group length that
 * disagrees with the group, no Transfer Syntax UID, bytes after the Data Set), and a spec-clean
 * writer refuses to write any of them. It writes only what the generators ask for: leaf elements,
 * and sequences of undefined length holding defined-length items, under the four uncompressed
 * transfer syntaxes. It is internal to the subpath and never exported. Tags and VRs are plain
 * strings here, so the subpath's types share nothing with the main entry point's.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";

/** Implicit VR Little Endian. */
export const IMPLICIT_LE = "1.2.840.10008.1.2";
/** Explicit VR Little Endian. */
export const EXPLICIT_LE = "1.2.840.10008.1.2.1";
/** Explicit VR Big Endian, retired but still read. */
export const EXPLICIT_BE = "1.2.840.10008.1.2.2";
/** Deflated Explicit VR Little Endian. */
export const DEFLATED_LE = "1.2.840.10008.1.2.1.99";

/** One leaf element. `value` is in little-endian order; a big-endian file swaps it on write. */
export interface LeafElement {
  readonly tag: string;
  readonly vr: string;
  readonly value: Buffer;
}

/** A sequence of undefined length; each item is a defined-length list of leaf elements. */
export interface SequenceElement {
  readonly tag: string;
  readonly items: readonly (readonly LeafElement[])[];
}

/** What {@link writePart10} writes. Every flag left out writes the conformant form. */
export interface Part10Spec {
  readonly transferSyntax: string;
  readonly elements: readonly (LeafElement | SequenceElement)[];
  /** Leave out the 128-byte preamble and the `DICM` prefix. */
  readonly noPreamble?: boolean;
  /** `(0002,0000)`: the true length, eight bytes short of it, or left out. */
  readonly groupLength?: "short" | "omit";
  /** Leave out `(0002,0010)` Transfer Syntax UID. */
  readonly noTransferSyntaxUid?: boolean;
  /** Bytes written after the Data Set. */
  readonly trailing?: Buffer;
}

/** The VRs whose explicit header has two reserved bytes and a 32-bit length (PS3.5 section 7.1.2). */
const LONG_FORM: ReadonlySet<string> = new Set([
  "OB",
  "OD",
  "OF",
  "OL",
  "OV",
  "OW",
  "SQ",
  "SV",
  "UC",
  "UN",
  "UR",
  "UT",
  "UV",
]);

/** The width of one numeric value, which a big-endian file writes byte-reversed. */
const SWAP_WIDTH: Readonly<Partial<Record<string, number>>> = {
  AT: 2,
  OW: 2,
  SS: 2,
  US: 2,
  FL: 4,
  OF: 4,
  OL: 4,
  SL: 4,
  UL: 4,
  FD: 8,
  OD: 8,
  OV: 8,
  SV: 8,
  UV: 8,
};

const UNDEFINED_LENGTH = 0xffffffff;

/** How a Data Set is laid out on the wire. */
interface Layout {
  readonly explicit: boolean;
  readonly littleEndian: boolean;
}

function u16(value: number, littleEndian: boolean): Buffer {
  const out = Buffer.alloc(2);
  if (littleEndian) out.writeUInt16LE(value);
  else out.writeUInt16BE(value);
  return out;
}

function u32(value: number, littleEndian: boolean): Buffer {
  const out = Buffer.alloc(4);
  if (littleEndian) out.writeUInt32LE(value);
  else out.writeUInt32BE(value);
  return out;
}

function tagBytes(tag: string, littleEndian: boolean): Buffer {
  return Buffer.concat([
    u16(parseInt(tag.slice(0, 4), 16), littleEndian),
    u16(parseInt(tag.slice(4), 16), littleEndian),
  ]);
}

function header(tag: string, vr: string, length: number, layout: Layout): Buffer {
  const le = layout.littleEndian;
  if (!layout.explicit) return Buffer.concat([tagBytes(tag, le), u32(length, le)]);
  if (LONG_FORM.has(vr)) {
    return Buffer.concat([tagBytes(tag, le), Buffer.from(vr), Buffer.alloc(2), u32(length, le)]);
  }
  return Buffer.concat([tagBytes(tag, le), Buffer.from(vr), u16(length, le)]);
}

/** `value` with each `width`-byte number reversed; a copy, `value` is left as it was. */
function swap(value: Buffer, width: number): Buffer {
  const out = Buffer.from(value);
  for (let start = 0; start < out.length; start += width) {
    out.subarray(start, start + width).reverse();
  }
  return out;
}

function leaf(element: LeafElement, layout: Layout): Buffer {
  const width = SWAP_WIDTH[element.vr];
  const value =
    layout.littleEndian || width === undefined ? element.value : swap(element.value, width);
  return Buffer.concat([header(element.tag, element.vr, value.length, layout), value]);
}

function sequence(element: SequenceElement, layout: Layout): Buffer {
  const le = layout.littleEndian;
  const items = element.items.map((item) => {
    const body = Buffer.concat(item.map((inner) => leaf(inner, layout)));
    return Buffer.concat([tagBytes("FFFEE000", le), u32(body.length, le), body]);
  });
  return Buffer.concat([
    header(element.tag, "SQ", UNDEFINED_LENGTH, layout),
    ...items,
    tagBytes("FFFEE0DD", le),
    u32(0, le),
  ]);
}

function dataSet(elements: Part10Spec["elements"], layout: Layout): Buffer {
  return Buffer.concat(
    elements.map((element) =>
      "items" in element ? sequence(element, layout) : leaf(element, layout),
    ),
  );
}

/** A UID value, padded with one NUL to an even length (PS3.5 section 9.1). */
function uid(text: string): Buffer {
  const bytes = Buffer.from(text);
  return bytes.length % 2 === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(1)]);
}

const FILE_META: Layout = { explicit: true, littleEndian: true };

/**
 * The bytes of a Part 10 file: the preamble and `DICM`, the File Meta group, the Data Set in the
 * named transfer syntax, and any trailing bytes. A syntax this writer does not know is written as
 * Explicit VR Little Endian, the Data Set encoding of every encapsulated syntax.
 * @example
 * ```ts
 * writePart10({ transferSyntax: EXPLICIT_LE, elements: [], noPreamble: true }).length; // 40
 * ```
 */
export function writePart10(spec: Part10Spec): Buffer {
  const parts: Buffer[] = [];
  if (spec.noPreamble !== true) parts.push(Buffer.alloc(128), Buffer.from("DICM"));

  const meta =
    spec.noTransferSyntaxUid === true
      ? Buffer.alloc(0)
      : leaf({ tag: "00020010", vr: "UI", value: uid(spec.transferSyntax) }, FILE_META);
  if (spec.groupLength !== "omit") {
    const length = spec.groupLength === "short" ? Math.max(0, meta.length - 8) : meta.length;
    parts.push(leaf({ tag: "00020000", vr: "UL", value: u32(length, true) }, FILE_META));
  }
  parts.push(meta);

  const ts = spec.transferSyntax;
  if (ts === DEFLATED_LE) parts.push(deflateRawSync(dataSet(spec.elements, FILE_META)));
  else {
    parts.push(
      dataSet(spec.elements, {
        explicit: ts !== IMPLICIT_LE,
        littleEndian: ts !== EXPLICIT_BE,
      }),
    );
  }

  if (spec.trailing !== undefined) parts.push(spec.trailing);
  return Buffer.concat(parts);
}

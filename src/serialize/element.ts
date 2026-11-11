/**
 * Per-element byte encoder for the Part 10 writer.
 *
 * Two element shapes are handled, distinguished by the parser's `rawBytes`
 * representation:
 *
 *  - **Full-span elements** - Explicit-VR `SQ` (defined or undefined length),
 *    *undefined-length* Implicit-VR `SQ`, encapsulated Pixel Data
 *    (`(7FE0,0010) OB` undefined length), CP-246-promoted `UN→SQ`, and the `UN`
 *    undefined-length fallback. For all of these the parser stored `rawBytes` as
 *    the *complete on-wire span* (header + value), so this encoder emits them as
 *    given: pixel fragments and `UN` spans byte-for-byte (PS3.5 §A.4). Because
 *    the writer never transcodes, the stored span is already in the output
 *    transfer syntax. For an `SQ`, `serializeDicom` passes in the span with the
 *    Data Elements of every Item it can walk re-ordered ascending (see
 *    `./order.ts`): the same bytes, permuted, and nothing the span did not carry.
 *
 *    The one SQ that is *not* full-span is a **defined-length SQ under Implicit
 *    VR LE**: that strategy only takes its full-span SQ branch for undefined
 *    length (`implicit-le.ts`), so a defined-length SQ arrives as a value-only
 *    slice and is reconstructed like any other long-form element below.
 *
 *  - **Scalar (leaf) elements** - the parser stored `rawBytes` as the *value
 *    only*. The writer reconstructs the element header for the chosen encoding
 *    (PS3.5 §7.1.2 short/long form) and re-emits the value, padded to even
 *    length (PS3.5 §6.2). This is where the conservative half of Postel's Law
 *    lives: an odd-length value parsed leniently is padded correctly on write.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import { splitTag } from "../dataset/tag.js";
import type { VR } from "../dictionary/types.js";
import { LONG_FORM_VRS } from "../parser/element-header.js";
import { BE_VR_STRIDE, isRecognizedVr } from "../parser/endian.js";
import { DicomSerializeError, SERIALIZE_ERROR_CODES } from "./errors.js";

/** `0xFFFFFFFF` - the undefined-length sentinel (PS3.5 §7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;

/**
 * `FFFEH`, the largest even Value Length a 16-bit Explicit VR Value Length Field carries (PS3.5
 * 2026c section 6.2.2). A longer value in a VR that has the 16-bit field is written as `UN`, or
 * refused where that section forbids `UN` (see {@link refuseTooLongForVr}).
 *
 * @internal
 */
export const MAX_SHORT_FORM_LENGTH = 0xfffe;

// Fixed strings: nothing read from the Dataset, no tag, no length and no byte of the value is
// interpolated, so the message is safe to log.
const PRIVATE_CREATOR_TOO_LONG_MESSAGE =
  "A Private Creator Data Element carries a value longer than 65,534 bytes under an Explicit VR Transfer Syntax, in a VR whose Value Length Field is 16 bits. PS3.5 section 6.2.2 has such a value written with VR UN, but says UN shall not be used for a Private Creator Data Element, so the value has no encoding and nothing is written.";
const FILE_META_TOO_LONG_MESSAGE =
  "A File Meta Information element carries a value longer than 65,534 bytes in a VR whose Explicit VR Value Length Field is 16 bits. PS3.5 section 6.2.2 has such a value written with VR UN, but says UN shall not be used for a File Meta Information element, so the value has no encoding and nothing is written.";

/**
 * Throw `VALUE_TOO_LONG_FOR_VR` for a value past {@link MAX_SHORT_FORM_LENGTH} in a 16-bit-length
 * VR that PS3.5 2026c section 6.2.2 forbids writing as `UN`: a Private Creator Data Element, or a
 * File Meta Information element (any tag `(0002,xxxx)`). The message names which of the two, and
 * nothing else.
 *
 * @throws {@link DicomSerializeError} `VALUE_TOO_LONG_FOR_VR`, always.
 *
 * @internal
 */
export function refuseTooLongForVr(kind: "privateCreator" | "fileMeta"): never {
  throw new DicomSerializeError(
    SERIALIZE_ERROR_CODES.VALUE_TOO_LONG_FOR_VR,
    kind === "privateCreator" ? PRIVATE_CREATOR_TOO_LONG_MESSAGE : FILE_META_TOO_LONG_MESSAGE,
  );
}

/**
 * The dataset-body encoding a {@link Element} is serialized under. Mirrors the
 * three on-wire element layouts; the Deflated TS reuses `"explicitLE"` for its
 * (pre-compression) body per PS3.5 Annex A.5.
 *
 * @internal
 */
export type BodyEncoding = "implicit" | "explicitLE" | "explicitBE";

/**
 * VRs that pad an odd-length value with a NULL (`0x00`) byte rather than a
 * SPACE (`0x20`) per PS3.5 §6.2: `UI` (UID) and the byte-stream VRs. Every
 * other VR that can carry an odd-length value (the text VRs) pads with SPACE.
 * The fixed-width binary VRs (`US`/`SS`/`UL`/… ) are always even by
 * construction, so their pad byte is never actually consulted.
 *
 * @internal
 */
const NULL_PAD_VRS: ReadonlySet<VR> = new Set<VR>(["UI", "OB", "OW", "OF", "OD", "OL", "OV", "UN"]);

/**
 * Return `value` padded to even length per PS3.5 §6.2. The original buffer is
 * never mutated - an already-even value is returned as a defensive copy so the
 * caller can freely concat without aliasing the parsed dataset (immutability).
 *
 * @internal
 */
export function padValue(value: Buffer, vr: VR): Buffer {
  if (value.length % 2 === 0) return Buffer.from(value);
  return Buffer.concat([value, Buffer.from([padByte(vr)])]);
}

/** The pad byte PS3.5 section 6.2 gives a VR's odd-length value: NULL, or SPACE. */
function padByte(vr: VR): number {
  return NULL_PAD_VRS.has(vr) ? 0x00 : 0x20;
}

/**
 * Copy `value` and, when its length is odd, its pad byte into `out` at `at`, per PS3.5 section
 * 6.2: the same bytes {@link padValue} returns, without a copy of the value in between. Returns the
 * padded length.
 *
 * @internal
 */
export function writePadded(out: Buffer, at: number, value: Buffer, vr: VR): number {
  out.set(value, at);
  if (value.length % 2 === 0) return value.length;
  out[at + value.length] = padByte(vr);
  return value.length + 1;
}

/**
 * The buffer a header is measured into when nothing is being written: the writes run all the same,
 * so a measure throws exactly where a write would, and the bytes are thrown away.
 */
let scratch = Buffer.alloc(16);

/** {@link scratch}, grown to hold `length` bytes. Only a hand-built VR longer than two needs more. */
function scratchOf(length: number): Buffer {
  if (scratch.length < length) scratch = Buffer.alloc(length);
  return scratch;
}

/** A VR's two ASCII bytes, as `Buffer.from(vr, "ascii")` writes them, kept per VR string. */
const VR_BYTES = new Map<string, Buffer>();

/**
 * A VR's bytes as `Buffer.from(vr, "ascii")` writes them, made once per VR string.
 *
 * @internal
 */
export function vrBytes(vr: string): Buffer {
  let bytes = VR_BYTES.get(vr);
  if (bytes === undefined) {
    bytes = Buffer.from(vr, "ascii");
    // Bounded: a VR the reader produced is two bytes, so at most 65,536 strings; a longer one,
    // which only a hand-built Element carries, is not kept.
    if (vr.length === 2) VR_BYTES.set(vr, bytes);
  }
  return bytes;
}

/** A tag's Group and Element Numbers, by tag; bounded, as a hand-built tag can be any string. */
const TAG_PARTS = new Map<string, { readonly group: number; readonly element: number }>();
const TAG_PARTS_LIMIT = 16_384;

/**
 * `splitTag(tag)`, worked out once per tag: the writer asks for every element it writes, and the
 * answer for one tag never changes.
 *
 * @internal
 */
export function tagParts(tag: string): { readonly group: number; readonly element: number } {
  let parts = TAG_PARTS.get(tag);
  if (parts === undefined) {
    parts = splitTag(tag);
    if (TAG_PARTS.size < TAG_PARTS_LIMIT) TAG_PARTS.set(tag, parts);
  }
  return parts;
}

function writeUint16(buf: Buffer, n: number, at: number, littleEndian: boolean): void {
  if (littleEndian) buf.writeUInt16LE(n, at);
  else buf.writeUInt16BE(n, at);
}

function writeUint32(buf: Buffer, n: number, at: number, littleEndian: boolean): void {
  if (littleEndian) buf.writeUInt32LE(n, at);
  else buf.writeUInt32BE(n, at);
}

/**
 * `value` in Little Endian byte order. PS3.5 2026c section 6.2.2 makes a `UN` value Little Endian
 * "irrespective of the current Transfer Syntax", and the Explicit VR Big Endian reader stores a
 * numeric value as it came off the wire, so a value written as `UN` under Big Endian is swapped
 * unit by unit (`AT` as two 16-bit units, per {@link BE_VR_STRIDE}). A trailing partial unit, which
 * only a malformed value carries, is left as it is.
 */
function littleEndianValue(value: Buffer, vr: VR, littleEndian: boolean): Buffer {
  const stride = BE_VR_STRIDE[vr];
  if (littleEndian || stride === 0) return value;
  const swapped = Buffer.from(value);
  const whole = swapped.subarray(0, swapped.length - (swapped.length % stride));
  if (stride === 2) whole.swap16();
  else if (stride === 4) whole.swap32();
  else whole.swap64();
  return swapped;
}

/**
 * `true` for a Private Creator Data Element: an odd group, element `0010` to `00FF`. PS3.5 2026c
 * section 6.2.2 says the `UN` VR "shall not be used" for one.
 */
function isPrivateCreator(group: number, element: number): boolean {
  return group % 2 === 1 && element >= 0x0010 && element <= 0x00ff;
}

/**
 * `true` when the element's `rawBytes` are a full on-wire span (header +
 * value) that the writer blits verbatim, rather than a value-only slice that
 * needs a reconstructed header. See the module doc for the cases.
 *
 * Encoding matters for exactly one shape: a defined-length `SQ` is full-span
 * under Explicit VR (the parser kept its header) but value-only under Implicit
 * VR LE, so it must be reconstructed there.
 *
 * @internal
 */
export function isFullSpanElement(el: Element, encoding: BodyEncoding): boolean {
  if (el.length === UNDEFINED_LENGTH) return true;
  return el.vr === "SQ" && encoding !== "implicit";
}

/**
 * Encode one dataset {@link Element} to its on-wire bytes under `encoding`.
 *
 * Full-span elements are blitted verbatim (a defensive copy). Scalar elements
 * get a reconstructed header (Implicit: group+element+4-byte length; Explicit
 * short form: +2-byte VR+2-byte length; Explicit long form for
 * {@link LONG_FORM_VRS}: +2-byte VR+2 reserved zero bytes+4-byte length) plus
 * the value padded to even length.
 *
 * `rawBytes` stands in for `el.rawBytes` when given, in the same representation
 * (full span or value only), which is how the writer emits an `SQ` whose Items
 * it re-ordered without building a second {@link Element}.
 *
 * @internal
 */
export function encodeDatasetElement(
  el: Element,
  encoding: BodyEncoding,
  rawBytes: Buffer = el.rawBytes,
): Buffer {
  const out = Buffer.allocUnsafe(writeDatasetElement(el, encoding, rawBytes, undefined, 0));
  writeDatasetElement(el, encoding, rawBytes, out, 0);
  return out;
}

/**
 * Write one dataset {@link Element}'s on-wire bytes under `encoding` into `out`
 * at `at`, as {@link encodeDatasetElement} returns them, and return how many
 * bytes they are. With `out` undefined nothing is written and only the length
 * comes back; the header is still written, to a scratch buffer, so measuring
 * throws exactly where writing would and the write that follows a measure does
 * not throw.
 *
 * @internal
 */
export function writeDatasetElement(
  el: Element,
  encoding: BodyEncoding,
  rawBytes: Buffer,
  out: Buffer | undefined,
  at: number,
): number {
  if (isFullSpanElement(el, encoding)) {
    // Verbatim passthrough - already in the output transfer syntax (no
    // transcode). The output is a copy, so it never aliases the parsed
    // dataset.
    if (out !== undefined) rawBytes.copy(out, at);
    return rawBytes.length;
  }

  const { group, element } = tagParts(el.tag);
  const valueLength = rawBytes.length + (rawBytes.length % 2);

  if (encoding === "implicit") {
    const header = out ?? scratchOf(8);
    const h = out === undefined ? 0 : at;
    header.writeUInt16LE(group, h);
    header.writeUInt16LE(element, h + 2);
    header.writeUInt32LE(valueLength, h + 4);
    if (out !== undefined) writePadded(out, at + 8, rawBytes, el.vr);
    return 8 + valueLength;
  }

  const littleEndian = encoding === "explicitLE";
  const vrBuf = vrBytes(el.vr);
  // The write side of PS3.5 2026c section 6.2's structure rule: a VR outside the
  // 34 this edition defines is long-form. Keeping the reader and the writer on
  // one predicate is not symmetry for its own sake - the short form's length
  // field is 16 bits, so writing a 70,000-byte unrecognized-VR value through it
  // would truncate the declared length to 4,464 silently, and the reader can now
  // produce such a value.
  if (LONG_FORM_VRS.has(el.vr) || !isRecognizedVr(el.vr)) {
    const headerLength = 4 + vrBuf.length + 6;
    const header = out ?? scratchOf(headerLength);
    const h = out === undefined ? 0 : at;
    writeUint16(header, group, h, littleEndian);
    writeUint16(header, element, h + 2, littleEndian);
    vrBuf.copy(header, h + 4);
    header.writeUInt16LE(0, h + 4 + vrBuf.length); // reserved (PS3.5 §7.1.2)
    writeUint32(header, valueLength, h + 6 + vrBuf.length, littleEndian);
    if (out !== undefined) writePadded(out, at + headerLength, rawBytes, el.vr);
    return headerLength + valueLength;
  }
  // PS3.5 2026c section 6.2.2: a Data Element whose VR has a 16-bit Value Length Field under
  // Explicit VR "and whose Value Length exceeds 65534" is encoded with a VR of UN, in the long
  // form. Without this branch the 16-bit length write threw a RangeError: a value the reader took
  // at the odd length FFFFH pads to 65,536 bytes, and `deidentify` grows a multi-valued UI past
  // 65,534 bytes when it remaps every value. The same section says the UN VR "shall not be used"
  // for a Private Creator Data Element or a File Meta Information element (any (0002,xxxx), which
  // only a hand-built Dataset puts in the body), so such a value has no encoding at all and is
  // refused with a typed error rather than left to the 16-bit length write below.
  if (valueLength > MAX_SHORT_FORM_LENGTH) {
    if (isPrivateCreator(group, element)) refuseTooLongForVr("privateCreator");
    if (group === 0x0002) refuseTooLongForVr("fileMeta");
    const header = out ?? scratchOf(12);
    const h = out === undefined ? 0 : at;
    writeUint16(header, group, h, littleEndian);
    writeUint16(header, element, h + 2, littleEndian);
    header.write("UN", h + 4, "ascii");
    header.writeUInt16LE(0, h + 6); // reserved (PS3.5 §7.1.2)
    writeUint32(header, valueLength, h + 8, littleEndian);
    // Swapped as one unit sequence over the padded value, as the copy it always was.
    if (out !== undefined) {
      littleEndianValue(padValue(rawBytes, el.vr), el.vr, littleEndian).copy(out, at + 12);
    }
    return 12 + valueLength;
  }
  const headerLength = 4 + vrBuf.length + 2;
  const header = out ?? scratchOf(headerLength);
  const h = out === undefined ? 0 : at;
  writeUint16(header, group, h, littleEndian);
  writeUint16(header, element, h + 2, littleEndian);
  vrBuf.copy(header, h + 4);
  writeUint16(header, valueLength, h + 4 + vrBuf.length, littleEndian);
  if (out !== undefined) writePadded(out, at + headerLength, rawBytes, el.vr);
  return headerLength + valueLength;
}

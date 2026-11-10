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
  const pad = NULL_PAD_VRS.has(vr) ? 0x00 : 0x20;
  return Buffer.concat([value, Buffer.from([pad])]);
}

/** The one-byte pads, shared: a part is only ever copied out of, never written to. */
const NULL_PAD = Buffer.from([0x00]);
const SPACE_PAD = Buffer.from([0x20]);

/**
 * Push `value` and, when its length is odd, its pad byte onto `parts`, per PS3.5 §6.2: the same
 * bytes {@link padValue} returns, without copying the value. Returns the padded length.
 */
function pushPadded(parts: Buffer[], value: Buffer, vr: VR): number {
  parts.push(value);
  if (value.length % 2 === 0) return value.length;
  parts.push(NULL_PAD_VRS.has(vr) ? NULL_PAD : SPACE_PAD);
  return value.length + 1;
}

/** A VR's two ASCII bytes, as `Buffer.from(vr, "ascii")` writes them, kept per VR string. */
const VR_BYTES = new Map<string, Buffer>();

function vrBytes(vr: string): Buffer {
  let bytes = VR_BYTES.get(vr);
  if (bytes === undefined) {
    bytes = Buffer.from(vr, "ascii");
    // Bounded: a VR the reader produced is two bytes, so at most 65,536 strings; a longer one,
    // which only a hand-built Element carries, is not kept.
    if (vr.length === 2) VR_BYTES.set(vr, bytes);
  }
  return bytes;
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
  const parts: Buffer[] = [];
  const length = encodeDatasetElementParts(el, encoding, parts, rawBytes);
  return Buffer.concat(parts, length);
}

/**
 * {@link encodeDatasetElement} without the copy: push the element's on-wire
 * bytes onto `parts`, in order, and return how many bytes they are. The value
 * is pushed as the view it is, so whoever joins the parts copies it once; a
 * part is never written to afterwards, and a header is a Buffer of its own.
 *
 * @internal
 */
export function encodeDatasetElementParts(
  el: Element,
  encoding: BodyEncoding,
  parts: Buffer[],
  rawBytes: Buffer = el.rawBytes,
): number {
  if (isFullSpanElement(el, encoding)) {
    // Verbatim passthrough - already in the output transfer syntax (no
    // transcode). The joined output is a copy, so it never aliases the parsed
    // dataset.
    parts.push(rawBytes);
    return rawBytes.length;
  }

  const { group, element } = splitTag(el.tag);
  const valueLength = rawBytes.length + (rawBytes.length % 2);

  if (encoding === "implicit") {
    const header = Buffer.allocUnsafe(8);
    header.writeUInt16LE(group, 0);
    header.writeUInt16LE(element, 2);
    header.writeUInt32LE(valueLength, 4);
    parts.push(header);
    return 8 + pushPadded(parts, rawBytes, el.vr);
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
    const header = Buffer.allocUnsafe(4 + vrBuf.length + 6);
    writeUint16(header, group, 0, littleEndian);
    writeUint16(header, element, 2, littleEndian);
    vrBuf.copy(header, 4);
    header.writeUInt16LE(0, 4 + vrBuf.length); // reserved (PS3.5 §7.1.2)
    writeUint32(header, valueLength, 6 + vrBuf.length, littleEndian);
    parts.push(header);
    return header.length + pushPadded(parts, rawBytes, el.vr);
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
    const header = Buffer.allocUnsafe(12);
    writeUint16(header, group, 0, littleEndian);
    writeUint16(header, element, 2, littleEndian);
    header.write("UN", 4, "ascii");
    header.writeUInt16LE(0, 6); // reserved (PS3.5 §7.1.2)
    writeUint32(header, valueLength, 8, littleEndian);
    parts.push(header);
    // Swapped as one unit sequence over the padded value, as the copy it always was.
    parts.push(littleEndianValue(padValue(rawBytes, el.vr), el.vr, littleEndian));
    return 12 + valueLength;
  }
  const header = Buffer.allocUnsafe(4 + vrBuf.length + 2);
  writeUint16(header, group, 0, littleEndian);
  writeUint16(header, element, 2, littleEndian);
  vrBuf.copy(header, 4);
  writeUint16(header, valueLength, 4 + vrBuf.length, littleEndian);
  parts.push(header);
  return header.length + pushPadded(parts, rawBytes, el.vr);
}

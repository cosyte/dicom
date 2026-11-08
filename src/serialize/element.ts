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

/** `0xFFFFFFFF` - the undefined-length sentinel (PS3.5 §7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;

/**
 * `FFFEH`, the largest even Value Length a 16-bit Explicit VR Value Length Field carries (PS3.5
 * 2026c section 6.2.2). A longer value in a VR that has the 16-bit field is written as `UN`.
 */
const MAX_SHORT_FORM_LENGTH = 0xfffe;

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

/** Allocate a 2-byte buffer holding `n` in the requested endianness. */
function uint16(n: number, littleEndian: boolean): Buffer {
  const buf = Buffer.alloc(2);
  if (littleEndian) buf.writeUInt16LE(n, 0);
  else buf.writeUInt16BE(n, 0);
  return buf;
}

/** Allocate a 4-byte buffer holding `n` in the requested endianness. */
function uint32(n: number, littleEndian: boolean): Buffer {
  const buf = Buffer.alloc(4);
  if (littleEndian) buf.writeUInt32LE(n, 0);
  else buf.writeUInt32BE(n, 0);
  return buf;
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
  if (isFullSpanElement(el, encoding)) {
    // Verbatim passthrough - already in the output transfer syntax (no
    // transcode). Copy so the result never aliases the parsed dataset.
    return Buffer.from(rawBytes);
  }

  const { group, element } = splitTag(el.tag);
  const value = padValue(rawBytes, el.vr);

  if (encoding === "implicit") {
    return Buffer.concat([
      uint16(group, true),
      uint16(element, true),
      uint32(value.length, true),
      value,
    ]);
  }

  const littleEndian = encoding === "explicitLE";
  const vrBuf = Buffer.from(el.vr, "ascii");
  // The write side of PS3.5 2026c section 6.2's structure rule: a VR outside the
  // 34 this edition defines is long-form. Keeping the reader and the writer on
  // one predicate is not symmetry for its own sake - the short form's length
  // field is 16 bits, so writing a 70,000-byte unrecognized-VR value through it
  // would truncate the declared length to 4,464 silently, and the reader can now
  // produce such a value.
  if (LONG_FORM_VRS.has(el.vr) || !isRecognizedVr(el.vr)) {
    return Buffer.concat([
      uint16(group, littleEndian),
      uint16(element, littleEndian),
      vrBuf,
      Buffer.from([0x00, 0x00]), // reserved (PS3.5 §7.1.2)
      uint32(value.length, littleEndian),
      value,
    ]);
  }
  // PS3.5 2026c section 6.2.2: a Data Element whose VR has a 16-bit Value Length Field under
  // Explicit VR "and whose Value Length exceeds 65534" is encoded with a VR of UN, in the long
  // form. Without this branch the 16-bit length write threw a RangeError: a value the reader took
  // at the odd length FFFFH pads to 65,536 bytes, and `deidentify` grows a multi-valued UI past
  // 65,534 bytes when it remaps every value. A Private Creator is not rewritten, because the same
  // section says UN "shall not be used" for one, so a creator past 65,534 bytes still has no
  // encoding here and still fails at the length write below.
  if (value.length > MAX_SHORT_FORM_LENGTH && !isPrivateCreator(group, element)) {
    return Buffer.concat([
      uint16(group, littleEndian),
      uint16(element, littleEndian),
      Buffer.from("UN", "ascii"),
      Buffer.from([0x00, 0x00]), // reserved (PS3.5 §7.1.2)
      uint32(value.length, littleEndian),
      littleEndianValue(value, el.vr, littleEndian),
    ]);
  }
  return Buffer.concat([
    uint16(group, littleEndian),
    uint16(element, littleEndian),
    vrBuf,
    uint16(value.length, littleEndian),
    value,
  ]);
}

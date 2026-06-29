/**
 * Per-element byte encoder for the Phase 5 Part 10 writer.
 *
 * Two element shapes are handled, distinguished by the parser's `rawBytes`
 * representation (D-16 + the per-strategy parsers):
 *
 *  - **Full-span elements** — Explicit-VR `SQ` (defined or undefined length),
 *    *undefined-length* Implicit-VR `SQ`, encapsulated Pixel Data
 *    (`(7FE0,0010) OB` undefined length), CP-246-promoted `UN→SQ`, and the `UN`
 *    undefined-length fallback. For all of these the parser stored `rawBytes` as
 *    the *complete on-wire span* (header + value), so the writer blits them
 *    **verbatim** — this is the byte-for-byte pixel-fragment and nested-sequence
 *    passthrough the spec requires (PS3.5 §A.4 / §7.5). Because the writer never
 *    transcodes, the stored span is already in the output transfer syntax.
 *
 *    The one SQ that is *not* full-span is a **defined-length SQ under Implicit
 *    VR LE**: that strategy only takes its full-span SQ branch for undefined
 *    length (`implicit-le.ts`), so a defined-length SQ arrives as a value-only
 *    slice and is reconstructed like any other long-form element below.
 *
 *  - **Scalar (leaf) elements** — the parser stored `rawBytes` as the *value
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

/** `0xFFFFFFFF` — the undefined-length sentinel (PS3.5 §7.1.1). */
const UNDEFINED_LENGTH = 0xffffffff;

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
 * never mutated — an already-even value is returned as a defensive copy so the
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
 * @internal
 */
export function encodeDatasetElement(el: Element, encoding: BodyEncoding): Buffer {
  if (isFullSpanElement(el, encoding)) {
    // Verbatim passthrough — already in the output transfer syntax (no
    // transcode). Copy so the result never aliases the parsed dataset.
    return Buffer.from(el.rawBytes);
  }

  const { group, element } = splitTag(el.tag);
  const value = padValue(el.rawBytes, el.vr);

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
  if (LONG_FORM_VRS.has(el.vr)) {
    return Buffer.concat([
      uint16(group, littleEndian),
      uint16(element, littleEndian),
      vrBuf,
      Buffer.from([0x00, 0x00]), // reserved (PS3.5 §7.1.2)
      uint32(value.length, littleEndian),
      value,
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

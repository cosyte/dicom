/**
 * Binary numeric decoders for the fixed-width VRs (PS3.5 §6.2).
 *
 * Endianness comes from the parsed Element (`littleEndian`, set per transfer
 * syntax). **Signedness comes from the VR, never guessed** — `SS/SL/SV` are
 * signed; `US/UL/UV` unsigned; `FL/FD` IEEE-754. 64-bit `SV/UV` decode to
 * `bigint` so values above 2^53 keep full precision. `AT` decodes each
 * 4-byte group/element pair to an 8-hex tag string.
 *
 * A trailing partial unit (length not a whole multiple of the stride) is
 * ignored — fail-safe, never throws.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Tag, VR } from "../../dictionary/types.js";
import { joinTag } from "../tag.js";

/**
 * Decode `US UL SS SL FL FD` to a `number[]` (endianness from `littleEndian`;
 * signedness from the VR). A non-numeric VR yields `[]` (defensive).
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * import { decodeNumbers } from "@cosyte/dicom";
 * decodeNumbers(Buffer.from([0x05, 0x00]), "US", true); // [5]
 * ```
 */
export function decodeNumbers(bytes: Buffer, vr: VR, littleEndian: boolean): number[] {
  const out: number[] = [];
  if (vr === "US") {
    for (let i = 0; i + 2 <= bytes.length; i += 2)
      out.push(littleEndian ? bytes.readUInt16LE(i) : bytes.readUInt16BE(i));
  } else if (vr === "SS") {
    for (let i = 0; i + 2 <= bytes.length; i += 2)
      out.push(littleEndian ? bytes.readInt16LE(i) : bytes.readInt16BE(i));
  } else if (vr === "UL") {
    for (let i = 0; i + 4 <= bytes.length; i += 4)
      out.push(littleEndian ? bytes.readUInt32LE(i) : bytes.readUInt32BE(i));
  } else if (vr === "SL") {
    for (let i = 0; i + 4 <= bytes.length; i += 4)
      out.push(littleEndian ? bytes.readInt32LE(i) : bytes.readInt32BE(i));
  } else if (vr === "FL") {
    for (let i = 0; i + 4 <= bytes.length; i += 4)
      out.push(littleEndian ? bytes.readFloatLE(i) : bytes.readFloatBE(i));
  } else if (vr === "FD") {
    for (let i = 0; i + 8 <= bytes.length; i += 8)
      out.push(littleEndian ? bytes.readDoubleLE(i) : bytes.readDoubleBE(i));
  }
  return out;
}

/**
 * Decode the 64-bit VRs `SV` (signed) / `UV` (unsigned) to a `bigint[]` so no
 * precision is lost above 2^53.
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * import { decodeBigInts } from "@cosyte/dicom";
 * const b = Buffer.alloc(8);
 * b.writeBigUInt64LE(42n, 0);
 * decodeBigInts(b, "UV", true); // [42n]
 * ```
 */
export function decodeBigInts(bytes: Buffer, vr: VR, littleEndian: boolean): bigint[] {
  const out: bigint[] = [];
  if (vr === "SV") {
    for (let i = 0; i + 8 <= bytes.length; i += 8)
      out.push(littleEndian ? bytes.readBigInt64LE(i) : bytes.readBigInt64BE(i));
  } else if (vr === "UV") {
    for (let i = 0; i + 8 <= bytes.length; i += 8)
      out.push(littleEndian ? bytes.readBigUInt64LE(i) : bytes.readBigUInt64BE(i));
  }
  return out;
}

/**
 * Decode an `AT` value (group/element uint16 pairs) to 8-hex tag strings.
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * import { decodeAttributeTags } from "@cosyte/dicom";
 * decodeAttributeTags(Buffer.from([0x10, 0x00, 0x10, 0x00]), true); // ["00100010"]
 * ```
 */
export function decodeAttributeTags(bytes: Buffer, littleEndian: boolean): Tag[] {
  const out: Tag[] = [];
  for (let i = 0; i + 4 <= bytes.length; i += 4) {
    const group = littleEndian ? bytes.readUInt16LE(i) : bytes.readUInt16BE(i);
    const element = littleEndian ? bytes.readUInt16LE(i + 2) : bytes.readUInt16BE(i + 2);
    out.push(joinTag(group, element));
  }
  return out;
}

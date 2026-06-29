/**
 * Endian-aware cursor over a Node `Buffer` — the single byte-level read
 * primitive shared by all four Phase 2 transfer-syntax parsers (D-05).
 *
 * Uses Node `Buffer.readUInt16LE/BE` and `Buffer.readUInt32LE/BE` rather
 * than `DataView` per `02-CONTEXT.md` specifics § (Buffer methods are
 * faster and the project idiom). Every read validates
 * `position + N <= buffer.length` before touching memory and throws a
 * `RangeError` on under-read — this is the cross-cutting truncation
 * mitigation declared by the Phase 2 threat model T-02-01-06.
 *
 * @module
 */

import { Buffer } from "node:buffer";

/**
 * Copy `src` into a freshly allocated, **standalone** Buffer for the
 * `copyValues: true` path (D-16 / T-02-05-04).
 *
 * `Buffer.from(src)` is not sufficient: for small slices Node serves the
 * copy from the shared internal Buffer pool, so its backing `ArrayBuffer`
 * can be shared with unrelated small allocations (including a small source
 * dataset buffer). That defeats the detachment guarantee `copyValues: true`
 * exists to provide — releasing the source buffer and not co-locating a PHI
 * value with foreign bytes. `Buffer.allocUnsafeSlow` always allocates a
 * dedicated `ArrayBuffer`; copying the exact length over it leaves no
 * uninitialised bytes exposed.
 *
 * @internal
 */
export function copyValueBytes(src: Buffer): Buffer {
  const out = Buffer.allocUnsafeSlow(src.length);
  src.copy(out);
  return out;
}

/**
 * Endian-aware Buffer cursor used by all Phase 2 parser strategies.
 *
 * The cursor carries a mutable `position` and an immutable `littleEndian`
 * orientation. Reads at `position` advance the cursor; reads at an
 * explicit offset (`*At`) do not.
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * import { ByteCursor } from "@cosyte/dicom";
 * const cur = new ByteCursor(Buffer.from([0x10, 0x00, 0x10, 0x00]), true);
 * cur.readUInt16(); // 0x0010 — group
 * cur.readUInt16(); // 0x0010 — element
 * ```
 */
export class ByteCursor {
  public readonly buffer: Buffer;
  public readonly littleEndian: boolean;
  public position: number;

  /**
   * Construct a new cursor at `position` (default 0) over `buffer` with
   * the given endian orientation.
   *
   * @internal
   */
  public constructor(buffer: Buffer, littleEndian: boolean, position = 0) {
    this.buffer = buffer;
    this.littleEndian = littleEndian;
    this.position = position;
  }

  /** Read a 16-bit unsigned integer at the current position; advance by 2. */
  public readUInt16(): number {
    if (this.position + 2 > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    const v = this.littleEndian
      ? this.buffer.readUInt16LE(this.position)
      : this.buffer.readUInt16BE(this.position);
    this.position += 2;
    return v;
  }

  /** Read a 32-bit unsigned integer at the current position; advance by 4. */
  public readUInt32(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    const v = this.littleEndian
      ? this.buffer.readUInt32LE(this.position)
      : this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return v;
  }

  /** Read a 16-bit unsigned integer at an explicit offset; cursor unchanged. */
  public readUInt16At(offset: number): number {
    if (offset < 0 || offset + 2 > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    return this.littleEndian ? this.buffer.readUInt16LE(offset) : this.buffer.readUInt16BE(offset);
  }

  /** Read a 32-bit unsigned integer at an explicit offset; cursor unchanged. */
  public readUInt32At(offset: number): number {
    if (offset < 0 || offset + 4 > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    return this.littleEndian ? this.buffer.readUInt32LE(offset) : this.buffer.readUInt32BE(offset);
  }

  /**
   * Take a `length`-byte view starting at the current position; advance
   * the cursor by `length`. Returns a `Buffer.subarray` (zero-copy view);
   * callers wanting a copy must `Buffer.from(slice)` themselves.
   */
  public slice(length: number): Buffer {
    if (length < 0 || this.position + length > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    const out = this.buffer.subarray(this.position, this.position + length);
    this.position += length;
    return out;
  }

  /** Bytes remaining between the current position and the end of the buffer. */
  public remaining(): number {
    return this.buffer.length - this.position;
  }
}

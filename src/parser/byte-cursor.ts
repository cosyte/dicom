/**
 * Endian-aware cursor over a Node `Buffer` - the single byte-level read
 * primitive shared by all four transfer-syntax parsers.
 *
 * Uses Node `Buffer.readUInt16LE/BE` and `Buffer.readUInt32LE/BE` rather
 * than `DataView`: the Buffer methods are faster and are this package's
 * idiom. Every read validates `position + N <= buffer.length` before
 * touching memory and throws a `RangeError` on under-read - this is the
 * cross-cutting truncation mitigation the parser's threat model requires.
 *
 * @module
 */

import { Buffer } from "node:buffer";

/**
 * Copy `src` into a freshly allocated, **standalone** Buffer for the
 * `copyValues: true` path.
 *
 * `Buffer.from(src)` is not sufficient: for small slices Node serves the
 * copy from the shared internal Buffer pool, so its backing `ArrayBuffer`
 * can be shared with unrelated small allocations (including a small source
 * dataset buffer). That defeats the detachment guarantee `copyValues: true`
 * exists to provide - releasing the source buffer and not co-locating a PHI
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
 * The unsigned 16-bit integer at `at`, from its two bytes, which the caller has bounds-checked.
 * The same number `readUInt16LE` / `readUInt16BE` gives, read from the bytes directly: Node's
 * readers are functions of their own that allocate on every call until they are optimized again,
 * which after a collection is every read of a small file.
 *
 * @internal
 */
export function uint16At(buffer: Buffer, at: number, littleEndian: boolean): number {
  const a = buffer[at] as number;
  const b = buffer[at + 1] as number;
  return littleEndian ? a | (b << 8) : (a << 8) | b;
}

/**
 * The unsigned 32-bit integer at `at`, from its four bytes, which the caller has bounds-checked:
 * what `readUInt32LE` / `readUInt32BE` gives.
 *
 * @internal
 */
export function uint32At(buffer: Buffer, at: number, littleEndian: boolean): number {
  const a = buffer[at] as number;
  const b = buffer[at + 1] as number;
  const c = buffer[at + 2] as number;
  const d = buffer[at + 3] as number;
  return littleEndian
    ? (a | (b << 8) | (c << 16)) + d * 0x1000000
    : a * 0x1000000 + ((b << 16) | (c << 8) | d);
}

/**
 * Endian-aware Buffer cursor used by every parser strategy.
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
 * cur.readUInt16(); // 0x0010 - group
 * cur.readUInt16(); // 0x0010 - element
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
    const v = uint16At(this.buffer, this.position, this.littleEndian);
    this.position += 2;
    return v;
  }

  /** Read a 32-bit unsigned integer at the current position; advance by 4. */
  public readUInt32(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    const v = uint32At(this.buffer, this.position, this.littleEndian);
    this.position += 4;
    return v;
  }

  /** Read a 16-bit unsigned integer at an explicit offset; cursor unchanged. */
  public readUInt16At(offset: number): number {
    if (offset < 0 || offset + 2 > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    return uint16At(this.buffer, offset, this.littleEndian);
  }

  /** Read a 32-bit unsigned integer at an explicit offset; cursor unchanged. */
  public readUInt32At(offset: number): number {
    if (offset < 0 || offset + 4 > this.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    return uint32At(this.buffer, offset, this.littleEndian);
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

/**
 * Instances kept for the life of the process so V8 keeps this class's hidden classes.
 *
 * A hidden class past an object's first field is reachable only from the objects that use it, so
 * once a collection finds no live instance it drops the chain, and the next instance built pays to
 * make every one of them again: 1 to 2 KiB a field, measured, which after a collection
 * outweighs the parse of a small file. These instances hold the chain. They are built with the
 * field kinds a parse stores (a number or nothing, a string or nothing, an object or nothing), so
 * later instances share their hidden classes rather than branching from them.
 */
export const BYTE_CURSOR_SHAPES: readonly ByteCursor[] = [
  new ByteCursor(Buffer.alloc(0), true, 0),
  new ByteCursor(Buffer.alloc(0), false),
];

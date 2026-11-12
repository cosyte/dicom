/**
 * The stop of `ParseOptions.stopBeforeTag`: where a top-level element loop ends early.
 *
 * Each Data Set reader (Explicit VR Little and Big Endian, Implicit VR Little Endian, and through
 * the first the Deflated and encapsulated syntaxes) asks {@link stopsHere} before it reads an
 * element's header. Only the top-level Data Set stops: a Sequence Item is read at a nesting depth
 * of one or more, and so is every speculative descent, because each enters through
 * `parseSequence`, which counts the depth first.
 *
 * @internal
 * @module
 */

import type { Buffer } from "node:buffer";

import type { ParseContext } from "./types.js";
import { parseStoppedBeforeTag, type DicomParseWarning } from "./warnings.js";
import { tagOf } from "./wire-tokens.js";

/** A tag as `ParseOptions.stopBeforeTag` takes it: eight hexadecimal digits, either case. */
const TAG_SHAPE = /^[0-9A-Fa-f]{8}$/u;

/**
 * `ParseOptions.stopBeforeTag` as the number the loops compare against. A value that is not eight
 * hexadecimal digits is refused with a `TypeError` whose message does not echo it.
 *
 * @internal
 */
export function stopTagNumber(stopBeforeTag: unknown): number {
  if (typeof stopBeforeTag !== "string" || !TAG_SHAPE.test(stopBeforeTag)) {
    throw new TypeError(
      'ParseOptions.stopBeforeTag must be a tag of eight hexadecimal digits, such as "7FE00010" for Pixel Data.',
    );
  }
  return Number.parseInt(stopBeforeTag, 16);
}

/**
 * Whether the parse stops before the element whose header starts at `at`: it is in the top-level
 * Data Set, its tag is at or after the stop tag, and it is not an `(FFFE,xxxx)` delimiter, which is
 * no Data Element. On a stop it records the offset and emits `DICOM_PARSE_STOPPED_BEFORE_TAG` once.
 * Fewer than four bytes left is never a stop: the reader goes on to its own truncation fatal.
 *
 * @internal
 */
export function stopsHere(
  buffer: Buffer,
  at: number,
  littleEndian: boolean,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): boolean {
  const stop = ctx.stop;
  if (stop === undefined || ctx.nestingDepth !== 0 || at + 4 > buffer.length) return false;
  const group = littleEndian ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
  if (group === 0xfffe) return false;
  const element = littleEndian ? buffer.readUInt16LE(at + 2) : buffer.readUInt16BE(at + 2);
  if (group * 0x10000 + element < stop.tag) return false;
  stop.at = at;
  emit(parseStoppedBeforeTag({ byteOffset: at }, tagOf(group, element)));
  return true;
}

/**
 * The tag and VR strings the readers build from header bytes, built once per distinct value and
 * shared, rather than once per element.
 *
 * A tag string was three `toString(16)`, two `padStart`, a concatenation and a `toUpperCase` for
 * every element read, and a VR a two-byte Buffer view and an ASCII decode. Both are pure functions
 * of the header's numbers, so the same numbers give the same string either way; these give the
 * string built the first time. The cache of tags is bounded, because a damaged file can carry any
 * of 2^32 of them: past the bound a tag is built afresh each time, as it always was.
 *
 * @internal
 * @module
 */

import type { Buffer } from "node:buffer";

import { joinTag } from "../dataset/tag.js";
import type { Tag, VR } from "../dictionary/types.js";
import { KNOWN_VRS } from "./endian.js";

/** At most this many distinct tags are kept: well past the 5,310 rows of PS3.6's registry. */
const TAG_CACHE_LIMIT = 16_384;

const tags = new Map<number, Tag>();

/**
 * The tag `joinTag(group, element)` builds, for a group and element of 16 bits each.
 *
 * @internal
 */
export function tagOf(group: number, element: number): Tag {
  const key = group * 0x10000 + element;
  let tag = tags.get(key);
  if (tag === undefined) {
    tag = joinTag(group, element);
    if (tags.size < TAG_CACHE_LIMIT) tags.set(key, tag);
  }
  return tag;
}

/** The 34 VRs PS3.5 defines, by their two bytes as a big-endian 16-bit number. */
const KNOWN_VR_CODES: ReadonlyMap<number, VR> = new Map(
  [...KNOWN_VRS].map((vr) => [vr.charCodeAt(0) * 0x100 + vr.charCodeAt(1), vr as VR]),
);

/**
 * The VR in the two bytes at `at`, as `buffer.toString("ascii", at, at + 2)` decodes them. Throws
 * a `RangeError` when the two bytes are not both inside `buffer`, as the cursor's read does.
 *
 * @internal
 */
export function vrAt(buffer: Buffer, at: number): VR {
  const known = KNOWN_VR_CODES.get(buffer.readUInt16BE(at));
  return known ?? (buffer.toString("ascii", at, at + 2) as VR);
}

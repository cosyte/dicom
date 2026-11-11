/**
 * Tag hex utilities for the structural dataset shell.
 *
 * Utility functions only, deliberately: there is no `Tag` class, because
 * nothing here needs navigation methods hanging off the type.
 *
 * @module
 */

import type { Tag } from "../dictionary/types.js";

const TAG_HEX_RE = /^[0-9A-F]{8}$/;

/**
 * Validate that a string is a well-formed 8-char uppercase hex tag.
 * Lowercase hex strings return `false`; callers should `.toUpperCase()`
 * before validating.
 *
 * @example
 * ```ts
 * import { isValidTag } from "@cosyte/dicom";
 * isValidTag("00100010"); // true
 * isValidTag("0010001");  // false (length 7)
 * isValidTag("0010001x"); // false (not hex)
 * ```
 */
export function isValidTag(s: string): boolean {
  return typeof s === "string" && TAG_HEX_RE.test(s);
}

/**
 * Split a tag into its numeric `group` (high 4 hex chars) and `element`
 * (low 4 hex chars) halves. Caller must pre-validate via {@link isValidTag}.
 *
 * @example
 * ```ts
 * import { splitTag } from "@cosyte/dicom";
 * const { group, element } = splitTag("00100010");
 * // group === 0x0010, element === 0x0010
 * ```
 */
export function splitTag(tag: Tag): { group: number; element: number } {
  return {
    group: parseInt(tag.slice(0, 4), 16),
    element: parseInt(tag.slice(4, 8), 16),
  };
}

/**
 * Join numeric `group` + `element` (each in `[0, 0xFFFF]`) into an 8-char
 * uppercase hex tag.
 *
 * @example
 * ```ts
 * import { joinTag } from "@cosyte/dicom";
 * joinTag(0x0010, 0x0010); // "00100010"
 * joinTag(0xfffe, 0xe00d); // "FFFEE00D"
 * ```
 */
export function joinTag(group: number, element: number): Tag {
  const g = group.toString(16).padStart(4, "0");
  const e = element.toString(16).padStart(4, "0");
  return (g + e).toUpperCase();
}

/**
 * True when the tag's group is odd - i.e. a private group per PS3.5 §7.8.
 *
 * @example
 * ```ts
 * import { isPrivateTag } from "@cosyte/dicom";
 * isPrivateTag("00190010"); // true
 * isPrivateTag("00100010"); // false
 * ```
 */
export function isPrivateTag(tag: Tag): boolean {
  return splitTag(tag).group % 2 === 1;
}

/**
 * True when the tag's group is `0x0002` - i.e. inside the File Meta
 * group per PS3.10.
 *
 * @example
 * ```ts
 * import { isFileMetaTag } from "@cosyte/dicom";
 * isFileMetaTag("00020010"); // true
 * isFileMetaTag("00100010"); // false
 * ```
 */
export function isFileMetaTag(tag: Tag): boolean {
  return splitTag(tag).group === 0x0002;
}

/**
 * The tag a caller names, as `group * 0x10000 + element`, or -1 when it names none: exactly the
 * tags `Map.get(tag.toUpperCase())` would find in a map keyed by eight upper-case hex digits.
 *
 * @internal
 */
export function tagNumber(tag: Tag): number {
  if (typeof tag === "string" && tag.length === 8) {
    let n = 0;
    let i = 0;
    for (; i < 8; i++) {
      const c = tag.charCodeAt(i);
      let v: number;
      if (c >= 0x30 && c <= 0x39) v = c - 0x30;
      else if (c >= 0x41 && c <= 0x46) v = c - 0x37;
      else if (c >= 0x61 && c <= 0x66) v = c - 0x57;
      else break;
      n = n * 16 + v;
    }
    if (i === 8) return n;
  }
  // Anything else goes the way it always went: upper-cased (which throws for a non-string, as it
  // did), then matched only when that is eight upper-case hex digits.
  const upper = tag.toUpperCase();
  if (!/^[0-9A-F]{8}$/u.test(upper)) return -1;
  return Number.parseInt(upper, 16);
}

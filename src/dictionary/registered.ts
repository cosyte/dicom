/**
 * PS3.6 registry membership for one concrete tag, on the de-identify path.
 *
 * `deidentify()` removes a non-private Data Element whose tag this build's pinned
 * PS3.6 2026d registry does not carry and whose tag Table E.1-1 does not list
 * (`../deident/deidentify.ts`). That rule needs a membership test, and
 * `Dictionary.lookup` is not one: it returns `undefined` for every member of a masked
 * family such as `(60xx,0010)` Overlay Rows, so a test built on it alone would
 * remove every overlay plane in every file.
 *
 * A concrete tag is **registered** when the generated registry
 * (`./generated/tags.ts`, generated from PS3.6 2026d) carries either
 *
 * - a **literal row** for it, or
 * - a **masked row** it matches. For the `50xx` and `60xx` families the group
 *   must lie inside PS3.5 2026c section 7.6's bound (even groups `5000`-`501E`
 *   and `6000`-`601E`), applied by {@link matchesRepeatingPattern} exactly as the
 *   Table E.1-1 mask rows apply it. For every other masked row each printed `x`
 *   is one hex digit, read as the registry prints it.
 *
 * ## Why the 7.6 bound and not the printed mask for `50xx` / `60xx`
 *
 * `(6020,0010)` matches the printed `60xx0010` digit for digit, but PS3.5 7.6
 * says "Repeating Groups shall only be allowed in the even numbered Groups
 * 6000-601E", so no edition registers it. Reading the mask wider would keep an
 * attribute the standard never defined; reading it narrower would remove overlay
 * planes the standard does define. Over-broad and under-broad are different
 * unsafe directions, so this reuses the de-identify bound rather than the
 * parser's `matchRepeatingGroup`, which answers a different question (a lenient
 * VR guess) and treats every `x` as an unbounded wildcard. The two matchers are
 * deliberately not unified.
 *
 * ## Why every other masked row is read as printed
 *
 * `(0020,31xx)`, the `(0028,04x0)` and `(0028,08x0)` families, the
 * `(1000,xxx0)` family, `(1010,xxxx)` and `(7Fxx,...)` are all PS3.6 rows, no
 * normative bound narrower than the printed mask was found for them, and reading
 * them as printed is the keep direction this package already took for them before
 * the removal rule existed.
 *
 * @module
 */

import { TAGS } from "./generated/tags.js";
import { REPEATING_GROUP_RANGES, matchesRepeatingPattern } from "./repeating-groups.js";
import type { Tag } from "./types.js";

const CONCRETE_TAG_RE = /^[0-9A-F]{8}$/;

/** The mask character PS3.6 prints, as the generated registry spells it. */
const MASK_CHAR = "x";

/**
 * Every masked registry row, read once. A literal row's key is eight uppercase
 * hex digits; a masked row's key carries at least one lowercase `x`.
 */
const MASKED_ROWS: readonly string[] = Object.freeze(
  Object.keys(TAGS).filter((key) => key.includes(MASK_CHAR)),
);

/**
 * `true` when `pattern` is one of the PS3.5 section 7.6 repeating-group families,
 * whose group half is bounded rather than read digit by digit.
 */
function isSection76Family(pattern: string): boolean {
  return (
    REPEATING_GROUP_RANGES[pattern.slice(0, 2).toUpperCase()] !== undefined &&
    pattern.slice(2, 4) === MASK_CHAR + MASK_CHAR
  );
}

/** `true` when the concrete, uppercase `tag` matches one masked registry row. */
function matchesMaskedRow(pattern: string, tag: string): boolean {
  if (isSection76Family(pattern)) return matchesRepeatingPattern(pattern, tag);
  for (let i = 0; i < pattern.length; i++) {
    const printed = pattern.charAt(i);
    if (printed === MASK_CHAR) continue;
    if (printed.toUpperCase() !== tag.charAt(i)) return false;
  }
  return true;
}

/**
 * `true` when this build's PS3.6 2026d registry registers the concrete `tag`:
 * a literal row, or a masked row it matches under the rules in this module's
 * note. Input of any case is accepted; anything that is not eight hex digits is
 * not a concrete tag and is not registered.
 *
 * Private (odd-group) tags are not the subject of this test: PS3.6 registers
 * none of them, and the de-identifier decides private tags before it asks.
 *
 * @example
 * ```ts
 * isRegisteredTag("00100010"); // true  - a literal row
 * isRegisteredTag("60020010"); // true  - (60xx,0010), group inside PS3.5 7.6's bound
 * isRegisteredTag("60200010"); // false - one group past that bound
 * isRegisteredTag("00280410"); // true  - (0028,04x0), read as printed
 * isRegisteredTag("48544F53"); // false - no row carries it
 * ```
 */
export function isRegisteredTag(tag: Tag): boolean {
  if (typeof tag !== "string") return false;
  const upper = tag.toUpperCase();
  if (!CONCRETE_TAG_RE.test(upper)) return false;
  if (Object.prototype.hasOwnProperty.call(TAGS, upper)) return true;
  return MASKED_ROWS.some((pattern) => matchesMaskedRow(pattern, upper));
}

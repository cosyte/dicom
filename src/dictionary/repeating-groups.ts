/**
 * PS3.5 §7.6 Repeating Groups - which concrete groups a `50xx` / `60xx` mask covers.
 *
 * DICOM prints some attributes with a masked group number: `(60xx,4000)` Overlay
 * Comments, `(60xx,3000)` Overlay Data, `(50xx,xxxx)` Curve Data. The `xx` is a
 * **repeating group number**, not a wildcard over arbitrary hex, and the
 * difference is load-bearing for anything that acts on the match. PS3.5 §7.6
 * bounds it, verbatim (2026c edition):
 *
 * > Standard Data Elements with even Group Numbers 6000-601E represent Overlay
 * > Planes. [...] Repeating Groups shall only be allowed in the even numbered
 * > Groups 6000-601E.
 *
 * and, in the same section's Note:
 *
 * > Encoding of Curves in the even Group Numbers 50xx was previously defined but
 * > has been retired. See PS3.5-2004
 *
 * PS3.5-2004 §7.6, the edition that note delegates to, states the curve bound:
 *
 * > Standard Data Elements with even Group Numbers (5000-501E,eeee) represent
 * > Curves, while elements with even Group Numbers (6000-601E,eeee) represent
 * > Overlay Planes. [...] Repeating Groups shall only be allowed in the even
 * > Groups (6000-601E,eeee) and even Groups (5000-501E,eeee) cases.
 *
 * So each mask covers **sixteen** groups, not 256: the low byte runs `00` to `1E`
 * **even**. Both bounds matter in opposite directions. Reading `xx` as any hex
 * digit would match groups the standard never defined as repeating, and PS3.5
 * says of the odd ones explicitly:
 *
 * > Private Groups in the odd Group Numbers 6001-601F may still be used, but
 * > there is no implication of repeating semantics, nor any implied shadowing of
 * > the standard Repeating Groups.
 *
 * Matching those would remove attributes PS3.15 never marked, which is silent
 * data loss on a call the caller believes is conservative. Reading the mask as an
 * exact tag matches nothing at all, which is a silent PHI leak. This module is
 * the one place that bound lives **for de-identification**, so the generator that
 * reads PS3.15 and the runtime that applies it cannot drift apart.
 *
 * **It is not the only mask matcher in the package, and deliberately so.**
 * `../parser/element-header.ts`'s `matchRepeatingGroup` resolves an Implicit VR
 * from the PS3.6 registry's masked entries and treats every `x` as an unbounded
 * hex wildcard, so it will answer for `(6020,4000)` where this module will not.
 * That is the right shape there and the wrong shape here, because the two are
 * paying for different mistakes. A too-wide VR guess on a tag nobody defined
 * yields a lenient decode of an element that would otherwise be `UN`; a too-wide
 * *removal* deletes data the standard never marked. Postel's Law on the read
 * path, the standard's own bound on the de-identify path. Do not unify them
 * without deciding which failure you are choosing.
 *
 * The bound itself is transcribed from PS3.5, which this package does **not**
 * vendor (PS3.6 and PS3.15 are pinned by SHA-256 and re-hashed before use; PS3.5
 * is not). So the citations above are the audit trail for it, and the generator's
 * guard catches a new mask *prefix* rather than a changed *bound*. Vendoring
 * PS3.5 to close that is a real change and belongs in its own slice.
 *
 * @module
 */

/** Inclusive bounds on the low byte of a repeating group number, even values only. */
export interface RepeatingGroupRange {
  /** The high byte of the group number, e.g. `0x60` for the `60xx` overlay mask. */
  readonly prefix: number;
  /** Lowest low-byte value the mask covers (PS3.5: `00`). */
  readonly lowMin: number;
  /** Highest low-byte value the mask covers (PS3.5: `1E`). */
  readonly lowMax: number;
  /** What the family is, for diagnostics. */
  readonly label: string;
}

/**
 * Every group-number mask PS3.5 §7.6 defines, keyed by the printed two-hex-digit
 * prefix. A mask on any other prefix is not a repeating group and must not be
 * expanded: `(7Fxx,0010)` Variable Pixel Data, for instance, is a retired
 * registry mask with no PS3.5 repeating-group semantics behind it.
 *
 * @example
 * ```ts
 * REPEATING_GROUP_RANGES["60"]?.lowMax; // 0x1e
 * REPEATING_GROUP_RANGES["7F"];         // undefined - not a repeating group
 * ```
 */
export const REPEATING_GROUP_RANGES: Readonly<Record<string, RepeatingGroupRange>> = Object.freeze({
  "50": Object.freeze({ prefix: 0x50, lowMin: 0x00, lowMax: 0x1e, label: "Curves (retired)" }),
  "60": Object.freeze({ prefix: 0x60, lowMin: 0x00, lowMax: 0x1e, label: "Overlay Planes" }),
});

/** The printed prefixes {@link REPEATING_GROUP_RANGES} covers, e.g. `["50", "60"]`. */
export const REPEATING_GROUP_PREFIXES: readonly string[] = Object.freeze(
  Object.keys(REPEATING_GROUP_RANGES).sort(),
);

/**
 * Expand one mask prefix to the concrete group numbers PS3.5 allows it to take.
 *
 * @param prefix Two-hex-digit group prefix as printed, e.g. `"60"`.
 * @returns Ascending group numbers, or an empty array for a prefix PS3.5 does
 *   not define as a repeating group.
 *
 * @example
 * ```ts
 * expandRepeatingGroups("60").length;    // 16
 * expandRepeatingGroups("60")[15];       // 0x601e
 * expandRepeatingGroups("7F");           // []
 * ```
 */
export function expandRepeatingGroups(prefix: string): readonly number[] {
  const range = REPEATING_GROUP_RANGES[prefix.toUpperCase()];
  if (range === undefined) return [];
  const out: number[] = [];
  for (let low = range.lowMin; low <= range.lowMax; low += 2) {
    out.push((range.prefix << 8) | low);
  }
  return out;
}

/**
 * Test a concrete 8-hex-char tag against a repeating-group pattern such as
 * `"60xx4000"` or `"50xxxxxx"` (prefix + `xx` + a concrete element or `xxxx`).
 *
 * The group half is checked against PS3.5's bound, **not** treated as a wildcard:
 * `(6020,4000)` and `(6001,4000)` both fail, because neither is a group PS3.5
 * admits as an overlay repeating group. The element half, where masked, is a true
 * wildcard - PS3.15 writes `(50xx,xxxx)` to mean every element of a curve group.
 *
 * @param pattern 8-char pattern; group prefix + `xx`, then 4 element chars.
 * @param tag 8-char concrete hex tag (any case).
 *
 * @example
 * ```ts
 * matchesRepeatingPattern("60xx4000", "601E4000"); // true
 * matchesRepeatingPattern("60xx4000", "60204000"); // false - 0x6020 is out of range
 * matchesRepeatingPattern("60xx4000", "60014000"); // false - odd group, private
 * ```
 */
export function matchesRepeatingPattern(pattern: string, tag: string): boolean {
  if (pattern.length !== 8 || tag.length !== 8) return false;
  if (!/^[0-9A-Fa-f]{8}$/.test(tag)) return false;

  const range = REPEATING_GROUP_RANGES[pattern.slice(0, 2).toUpperCase()];
  if (range === undefined) return false;
  if (pattern.slice(2, 4).toLowerCase() !== "xx") return false;

  const group = Number.parseInt(tag.slice(0, 4), 16);
  if (group >> 8 !== range.prefix) return false;
  const low = group & 0xff;
  if (low % 2 !== 0) return false;
  if (low < range.lowMin || low > range.lowMax) return false;

  const elementPattern = pattern.slice(4);
  if (elementPattern.toLowerCase() === "xxxx") return true;
  return elementPattern.toUpperCase() === tag.slice(4).toUpperCase();
}

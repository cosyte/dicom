/**
 * Deterministic UID remapping for PS3.15 Annex E action `U` ("replace with an
 * internally-consistent UID").
 *
 * The replacement is a pure function of the source UID and the chosen root:
 * `sha256(sourceUid)` reduced to a decimal string under `<root>.…`. Because it
 * is content-derived, the *same* source UID maps to the *same* replacement
 * across separate `deidentify` calls and across files in a study set — without
 * any shared state — so cross-instance referential integrity (Study ⇄ Series ⇄
 * SOP, Frame of Reference, referenced instances) is preserved. A per-call cache
 * `Map` makes repeats within one call O(1) and lets a caller thread one map
 * through a whole archive if they prefer explicit sharing.
 *
 * Default root `2.25` is the DICOM-sanctioned UUID-derived arc (PS3.5 §B.2) —
 * a globally-unique root that needs no registration.
 *
 * @module
 */

import { createHash } from "node:crypto";

import { DeidentifyError } from "./types.js";

/** DICOM `2.25` UUID-derived root (PS3.5 §B.2) — no registration required. */
export const DEFAULT_UID_ROOT = "2.25";

const ROOT_RE = /^[0-9]+(\.[0-9]+)*$/;
const MAX_UID_LENGTH = 64;

/** A UID remapper: a stable `map(src)` plus the backing cache it fills. */
export interface UidRemapper {
  /** Map one source UID to its deterministic replacement (cached). */
  readonly map: (sourceUid: string) => string;
  /** The source→replacement cache, exposed for reporting / reuse. */
  readonly cache: Map<string, string>;
}

/**
 * Build a {@link UidRemapper} rooted at `root`, optionally seeded with (and
 * writing through to) a caller-owned `cache` for cross-call sharing.
 *
 * @param root  Dotted-decimal UID root (default {@link DEFAULT_UID_ROOT}).
 * @param cache Source→replacement map to fill (default a fresh `Map`).
 * @throws {DeidentifyError} when `root` is not a valid dotted-decimal OID prefix
 *   or leaves no room for a value component within the 64-char UID limit.
 *
 * @example
 * ```ts
 * import { makeUidRemapper } from "@cosyte/dicom";
 * const remap = makeUidRemapper();
 * remap.map("1.2.840.113619.2.55.3") === remap.map("1.2.840.113619.2.55.3"); // true
 * ```
 */
export function makeUidRemapper(
  root: string = DEFAULT_UID_ROOT,
  cache: Map<string, string> = new Map(),
): UidRemapper {
  if (typeof root !== "string" || !ROOT_RE.test(root)) {
    throw new DeidentifyError(
      `Invalid UID root "${String(root)}"; expected a dotted-decimal OID prefix (e.g. "2.25").`,
      "INVALID_OPTIONS",
    );
  }
  if (root.length + 2 > MAX_UID_LENGTH) {
    throw new DeidentifyError(
      `UID root "${root}" is too long to append a value component within the 64-character limit.`,
      "INVALID_OPTIONS",
    );
  }
  const map = (sourceUid: string): string => {
    const existing = cache.get(sourceUid);
    if (existing !== undefined) return existing;
    const out = deriveUid(root, sourceUid);
    cache.set(sourceUid, out);
    return out;
  };
  return { map, cache };
}

function deriveUid(root: string, sourceUid: string): string {
  const hex = createHash("sha256").update(sourceUid, "utf8").digest("hex");
  const fullDecimal = BigInt(`0x${hex}`).toString(10);
  // Budget: "<root>." prefix + the value component, total ≤ 64 chars. The digest
  // is truncated to fit — deterministically, so referential integrity holds — but
  // a longer `root` leaves fewer value digits and so trades away collision margin.
  // The default `2.25` root keeps ~62 digits (collision-free in practice).
  const budget = MAX_UID_LENGTH - root.length - 1;
  // No leading zero in a UID component (PS3.5 §9.1); strip, never empty.
  const body = fullDecimal.slice(0, budget).replace(/^0+/, "") || "0";
  return `${root}.${body}`;
}

/**
 * Annex E action resolution + VR-consistent dummy synthesis.
 *
 * **Conditional codes.** PS3.15 §E.1 lists some actions as a slash-separated
 * fallback list (`Z/D`, `X/Z`, `X/D`, `X/Z/D`, `X/Z/U*`, `C/X`) where the
 * stricter action applies only as IOD Type conformance requires. A metadata-only
 * de-identifier does not perform IOD Type-1 conformance analysis, so it resolves
 * every conditional to its **leftmost** branch — which §E.1 lists first as the
 * primary action and which is the most privacy-protective (`X` before `Z` before
 * `D`/`U`). This is conservative and spec-aligned; the trade-off is that a
 * Type-1 attribute that strictly needed a dummy is instead removed/emptied.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { AnnexEActionCode } from "../dictionary/annex-e.js";
import type { VR } from "../dictionary/types.js";

/** A resolved, non-conditional Annex E action. */
export type ResolvedAction = "D" | "Z" | "X" | "K" | "C" | "U";

/**
 * Collapse a (possibly conditional) Annex E action code to a single action by
 * taking the leftmost branch. `"X/Z/U*"` → `"X"`, `"C/X"` → `"C"`, `"Z"` → `"Z"`.
 *
 * @example
 * ```ts
 * resolveAction("X/Z/U*"); // "X"
 * resolveAction("Z");      // "Z"
 * ```
 */
export function resolveAction(code: AnnexEActionCode): ResolvedAction {
  const first = code.split("/", 1)[0]?.replace("*", "") ?? "K";
  return first as ResolvedAction;
}

const TEXT_DUMMIES: Partial<Record<VR, string>> = {
  PN: "Anonymized",
  LO: "ANONYMIZED",
  SH: "ANONYMIZED",
  LT: "ANONYMIZED",
  ST: "ANONYMIZED",
  UT: "ANONYMIZED",
  UC: "ANONYMIZED",
  AE: "ANONYMIZED",
  CS: "ANONYMIZED",
  UR: "anonymized",
  DA: "10000101",
  DT: "10000101000000",
  TM: "000000",
  AS: "000Y",
  DS: "0",
  IS: "0",
};

/**
 * The dummy value bytes for action `D` on a VR, padded to even length, or
 * `null` when no safe textual dummy exists (binary numeric VRs, `UI`, `SQ`) —
 * in which case the caller falls back to a zero-length value (action `Z`), which
 * is still non-identifying.
 *
 * @example
 * ```ts
 * dummyBytes("DA")?.toString("latin1"); // "10000101"
 * dummyBytes("US"); // null — no safe textual dummy; caller empties instead
 * ```
 */
export function dummyBytes(vr: VR): Buffer | null {
  const text = TEXT_DUMMIES[vr];
  if (text === undefined) return null;
  const buf = Buffer.from(text, "latin1");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x20])]);
}

/**
 * Re-encode a `UI` value, replacing each backslash-separated UID via `remap`.
 * UIDs are ASCII digits + dots; the result is null-padded to even length per
 * PS3.5 §6.2.
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * remapUidBytes(Buffer.from("1.2.3"), (uid) => `9.${uid}`); // <Buffer "9.1.2.3\0">
 * ```
 */
export function remapUidBytes(rawBytes: Buffer, remap: (uid: string) => string): Buffer {
  const raw = rawBytes.toString("latin1").replace(/\0+$/, "");
  const remapped = raw
    .split("\\")
    .map((uid) => remap(uid.trim()))
    .join("\\");
  const buf = Buffer.from(remapped, "latin1");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x00])]);
}

/**
 * Count backslash-separated values in a UI buffer (for the rebuilt element's VM).
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * uidValueMultiplicity(Buffer.from("1.2\\3.4")); // 2
 * ```
 */
export function uidValueMultiplicity(rawBytes: Buffer): number {
  const raw = rawBytes.toString("latin1").replace(/\0+$/, "");
  if (raw.length === 0) return 0;
  return raw.split("\\").length;
}

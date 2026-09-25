/**
 * PS3.15 Annex E attribute-action table - DICOM Basic Application Confidentiality
 * Profile plus its retention/clean option sets.
 *
 * Consumed by the de-identifier.
 *
 * NOTE: This module is NOT re-exported from the package's `src/index.ts`. The
 * `Dictionary` namespace's external surface is `Dictionary.{lookup,byKeyword,uid}`
 * plus `VERSION`; `annexE` is reached internally through
 * `@cosyte/dicom/dictionary/annex-e`.
 *
 * The 10 *metadata-affecting* option columns of Table E.1-1 populate
 * `AnnexEAction.optionSet` keys per attribute. Ten rather than nine because
 * E.3.6 is two mutually exclusive Options with a column each, and both are
 * carried: `RetainLongitudinalTemporal` for full dates and
 * `RetainLongitudinalTemporalModifiedDates` for modified dates. The two
 * *pixel-level* options - E.3.1 `CleanPixelData` and E.3.2
 * `CleanRecognizableVisual` - are not represented per-attribute (PS3.15 Table
 * E.1-1 has no column for them); they are enforced at the pixel-decode layer.
 * Both names remain in `AnnexEOption` for completeness and for that API.
 */

import type { Tag } from "./types.js";
import { ANNEX_E, ANNEX_E_REPEATING } from "./generated/annex-e.js";
import { matchesRepeatingPattern } from "./repeating-groups.js";

/**
 * PS3.15 Annex E Table E.1-1 action codes.
 *
 * - `D` = replace with dummy value of compatible VR
 * - `Z` = replace with zero-length value
 * - `X` = remove element entirely
 * - `K` = keep original value
 * - `C` = clean / structured replacement per the action table
 * - `U` = replace UID with a consistent new UID per session
 *
 * Compound codes (`Z/D`, `X/Z/D`, `X/Z/U*`, `C/X`) are preserved verbatim from the
 * Annex E source; the de-identifier interprets them per the table's per-attribute semantics
 * (e.g. `Z/D` = `Z` if absent, `D` if present).
 *
 * @example
 *   const code: AnnexEActionCode = "Z";
 */
export type AnnexEActionCode =
  | "D"
  | "Z"
  | "X"
  | "K"
  | "C"
  | "U"
  | "Z/D"
  | "X/Z"
  | "X/D"
  | "X/Z/D"
  | "X/Z/U*"
  | "C/X";

/**
 * One name per PS3.15 Annex E option column (E.3.1 to E.3.11), plus the second
 * of the two Options E.3.6 defines.
 *
 * `CleanPixelData` (E.3.1) and `CleanRecognizableVisual` (E.3.2) act on pixel
 * data, not metadata, and never appear as `optionSet` keys in the generated
 * `ANNEX_E` map; they remain in the union for the pixel-decode API.
 *
 * **E.3.6 is two mutually exclusive Options and Table E.1-1 gives them separate
 * columns**, so it takes two names here: `RetainLongitudinalTemporal` carries
 * `Rtn. Long. Full Dates Opt.` (keep the real dates) and
 * `RetainLongitudinalTemporalModifiedDates` carries `Rtn. Long. Modif. Dates
 * Opt.` (keep them only as modified values), which is the more protective of
 * the two on every row where they differ.
 *
 * @example
 *   const opt: AnnexEOption = "RetainLongitudinalTemporalModifiedDates";
 */
export type AnnexEOption =
  | "CleanPixelData"
  | "CleanRecognizableVisual"
  | "CleanGraphics"
  | "CleanStructuredContent"
  | "CleanDescriptors"
  | "RetainLongitudinalTemporal"
  | "RetainLongitudinalTemporalModifiedDates"
  | "RetainPatientCharacteristics"
  | "RetainDeviceIdentity"
  | "RetainUIDs"
  | "RetainSafePrivate"
  | "RetainInstitutionIdentity";

/**
 * The PS3.15 Annex E action for one DICOM attribute.
 *
 * `basicProfile` is the action under the Basic Profile with no retention/clean
 * options activated. `optionSet` carries per-option-set overrides - keys are the
 * `AnnexEOption` names; values are the action that applies IF the caller has
 * activated that option set. Missing keys = no override (the `basicProfile`
 * action wins).
 *
 * @example
 *   import { annexE } from "@cosyte/dicom/dictionary/annex-e";
 *   const action = annexE("00100010"); // PatientName
 *   if (action !== undefined) {
 *     // action.basicProfile === "Z"
 *     // action.optionSet may carry e.g. { RetainPatientCharacteristics: "K" }
 *   }
 */
export interface AnnexEAction {
  readonly tag: Tag;
  readonly keyword: string;
  /** Action under the Basic Profile with NO retention/clean options. */
  readonly basicProfile: AnnexEActionCode;
  /**
   * Per-option-set overrides. Keys are `AnnexEOption` names; values are action
   * codes. Frozen at generator time.
   */
  readonly optionSet: Readonly<Partial<Record<AnnexEOption, AnnexEActionCode>>>;
  /**
   * Set only when the action came from a repeating-group family row rather than
   * a single-tag row: the pattern that matched, e.g. `"60xx4000"`. Absent for
   * every exact-tag lookup.
   */
  readonly repeatingGroup?: string;
}

/**
 * One repeating-group family row of Table E.1-1 - a row whose tag cell names a
 * mask (`(50xx,xxxx)`, `(60xx,3000)`, `(60xx,4000)`) rather than one attribute.
 *
 * `pattern` is the printed mask flattened to 8 chars (`"60xx4000"`); the concrete
 * groups it covers are bounded by PS3.5 §7.6, not by the shape of the mask - see
 * `./repeating-groups.js`.
 *
 * @example
 *   import { ANNEX_E_REPEATING } from "@cosyte/dicom/dictionary/generated/annex-e";
 *   ANNEX_E_REPEATING.map((r) => r.pattern); // ["50xxxxxx", "60xx3000", "60xx4000"]
 */
export interface AnnexERepeatingRule {
  readonly pattern: string;
  readonly keyword: string;
  readonly basicProfile: AnnexEActionCode;
  readonly optionSet: Readonly<Partial<Record<AnnexEOption, AnnexEActionCode>>>;
}

/**
 * Look up the PS3.15 Annex E action for a DICOM tag.
 *
 * Returns `undefined` for tags not listed in Annex E Table E.1-1. **`undefined`
 * is not "keep"**: `deidentify()` keeps such an attribute only when this build's
 * PS3.6 registry carries its tag, and removes a non-private one the registry does
 * not carry (see `isRegisteredTag` in `./registered.ts`).
 * `deidentify()` consumes this; library users invoke `deidentify()` directly,
 * not `annexE()`.
 *
 * Resolution order, and the order is the answer to which row wins when both could
 * apply: **the exact-tag row first**, then the repeating-group family rows. A
 * single-tag row is the more specific statement the standard makes about that
 * tag, so it takes precedence over a mask that happens to cover it. PS3.15 2026c
 * publishes no such overlap (the generator counts and prints it every run); the
 * order is fixed now so a future edition that introduces one resolves the way the
 * standard reads rather than the way the map happens to iterate.
 *
 * The input is normalized to 8-char uppercase hex: a string of any case is
 * accepted; non-string inputs and empty strings return `undefined`.
 *
 * @param tag 8-character hex DICOM tag (case-insensitive, e.g. `"00100010"`).
 * @returns The Annex E action, or `undefined` if the tag has no Annex E entry.
 *
 * @example
 *   import { annexE } from "@cosyte/dicom/dictionary/annex-e";
 *   const a = annexE("00100010");
 *   // a?.basicProfile === "Z"
 *   const overlay = annexE("60004000");
 *   // overlay?.basicProfile === "X", overlay?.repeatingGroup === "60xx4000"
 */
export function annexE(tag: Tag): AnnexEAction | undefined {
  if (typeof tag !== "string" || tag.length === 0) return undefined;
  const upper = tag.toUpperCase();
  const entry = ANNEX_E[upper];
  if (entry !== undefined) return entry;
  return matchRepeatingRule(upper);
}

/**
 * Resolve a concrete tag against the repeating-group family rows, returning an
 * action carried on the **concrete** tag so a caller's audit trail names the
 * element that was actually present.
 */
function matchRepeatingRule(upper: string): AnnexEAction | undefined {
  for (const rule of ANNEX_E_REPEATING) {
    if (!matchesRepeatingPattern(rule.pattern, upper)) continue;
    return Object.freeze({
      tag: upper,
      keyword: rule.keyword,
      basicProfile: rule.basicProfile,
      optionSet: rule.optionSet,
      repeatingGroup: rule.pattern,
    });
  }
  return undefined;
}

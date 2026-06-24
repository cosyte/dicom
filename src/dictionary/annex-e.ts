/**
 * PS3.15 Annex E attribute-action table — DICOM Basic Application Confidentiality
 * Profile + 11 retention/clean option sets.
 *
 * Phase 1 deliverable (D-08 / D-09 / D-14). Consumed by Phase 7 `anonymize()`
 * (ANON-01..ANON-10).
 *
 * NOTE: This module is NOT re-exported from the package's `src/index.ts` (per D-10 +
 * D-27 — Phase 1's external surface is `Dictionary.{lookup,byKeyword,uid}` + `VERSION`
 * only). Phase 7 imports `annexE` via the `@cosyte/dicom/dictionary/annex-e` internal
 * path, which the `package.json` `exports` map will admit when Phase 7 lands its plans.
 *
 * The 9 *metadata-affecting* PS3.15 Annex E option-set columns (E.3.3–E.3.11 plus the
 * collapsed E.3.6 "RetainLongitudinalTemporal") populate `AnnexEAction.optionSet`
 * keys per attribute. The two *pixel-level* options — E.3.1 `CleanPixelData` and
 * E.3.2 `CleanRecognizableVisual` — are not represented per-attribute (PS3.15 Table
 * E.1-1 has no column for them); Phase 7 enforces them at the pixel-decode layer.
 * Both names remain in `AnnexEOption` for completeness and for Phase 7's API.
 */

import type { Tag } from "./types.js";
import { ANNEX_E } from "./generated/annex-e.js";

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
 * Annex E source; Phase 7 interprets them per the table's per-attribute semantics
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
 * One of the 11 PS3.15 Annex E option sets (E.3.1–E.3.11).
 *
 * Names match REQUIREMENTS.md ANON-02 verbatim. `CleanPixelData` (E.3.1) and
 * `CleanRecognizableVisual` (E.3.2) act on pixel data, not metadata, and never
 * appear as `optionSet` keys in the generated `ANNEX_E` map; they remain in the
 * union for Phase 7's pixel-decode API.
 *
 * @example
 *   const opt: AnnexEOption = "RetainLongitudinalTemporal";
 */
export type AnnexEOption =
  | "CleanPixelData"
  | "CleanRecognizableVisual"
  | "CleanGraphics"
  | "CleanStructuredContent"
  | "CleanDescriptors"
  | "RetainLongitudinalTemporal"
  | "RetainPatientCharacteristics"
  | "RetainDeviceIdentity"
  | "RetainUIDs"
  | "RetainSafePrivate"
  | "RetainInstitutionIdentity";

/**
 * The PS3.15 Annex E action for one DICOM attribute.
 *
 * `basicProfile` is the action under the Basic Profile with no retention/clean
 * options activated. `optionSet` carries per-option-set overrides — keys are the
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
}

/**
 * Look up the PS3.15 Annex E action for a DICOM tag.
 *
 * Returns `undefined` for tags not listed in Annex E Table E.1-1; those attributes
 * are unaffected by anonymization (effectively `K` — keep). Phase 7's
 * `anonymize()` consumes this; library users invoke `anonymize()` directly,
 * not `annexE()`.
 *
 * The input is normalized to 8-char uppercase hex: a string of any case is
 * accepted; non-string inputs and empty strings return `undefined`.
 *
 * @param tag 8-character hex DICOM tag (case-insensitive, e.g. `"00100010"` or `"00100010"`).
 * @returns The Annex E action, or `undefined` if the tag has no Annex E entry.
 *
 * @example
 *   import { annexE } from "@cosyte/dicom/dictionary/annex-e";
 *   const a = annexE("00100010");
 *   // a?.basicProfile === "Z"
 */
export function annexE(tag: Tag): AnnexEAction | undefined {
  if (typeof tag !== "string" || tag.length === 0) return undefined;
  const upper = tag.toUpperCase();
  const entry = ANNEX_E[upper];
  return entry;
}

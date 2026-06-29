/**
 * Coded-terminology surfacing (§4.6, PS3.16 §8 Table 8-1).
 *
 * A coded concept is the triplet `Code Value (0008,0100)` /
 * `Coding Scheme Designator (0008,0102)` / `Code Meaning (0008,0104)`. This
 * module **surfaces** the triplet and resolves the canonical scheme OID for
 * the four standard designators — it performs **no lookup, validation, or
 * mapping** (deferred). Detaching a code value from its scheme is unsafe, so
 * the three parts always travel together.
 *
 * @module
 */

import type { Dataset } from "../dataset.js";
import { readString } from "./read.js";
import type { CodedConcept } from "./types.js";

const CODE_VALUE: Tag = "00080100";
const CODING_SCHEME_DESIGNATOR: Tag = "00080102";
const CODE_MEANING: Tag = "00080104";

type Tag = string;

/**
 * Canonical coding-scheme OIDs (PS3.16 §8). **Only** the four standard
 * designators are mapped. Legacy SNOMED designators (`SRT` / `SNM3` /
 * `99SDM`) are intentionally absent: their code values differ from `SCT`
 * (CP-730), so resolving them to the SNOMED OID would imply a false
 * equality.
 *
 * @example
 * ```ts
 * import { CODING_SCHEME_OIDS } from "@cosyte/dicom";
 * CODING_SCHEME_OIDS.SCT; // "2.16.840.1.113883.6.96"
 * ```
 */
export const CODING_SCHEME_OIDS = {
  DCM: "1.2.840.10008.2.16.4",
  SCT: "2.16.840.1.113883.6.96",
  UCUM: "2.16.840.1.113883.6.8",
  LN: "2.16.840.1.113883.6.1",
} as const;

/**
 * Resolve a coding-scheme designator to its canonical OID, or `undefined`
 * for any non-standard / legacy designator (including `SRT`/`SNM3`/`99SDM`,
 * which are NOT treated as `SCT`).
 *
 * @example
 * ```ts
 * import { codingSchemeOid } from "@cosyte/dicom";
 * codingSchemeOid("UCUM"); // "2.16.840.1.113883.6.8"
 * codingSchemeOid("SRT");  // undefined — not SCT (CP-730)
 * ```
 */
export function codingSchemeOid(designator: string | undefined): string | undefined {
  if (designator === undefined) return undefined;
  return designator in CODING_SCHEME_OIDS
    ? CODING_SCHEME_OIDS[designator as keyof typeof CODING_SCHEME_OIDS]
    : undefined;
}

/**
 * Read the coded triplet off a code-item dataset (e.g. one item of a Code
 * Sequence). Every part is independently fail-safe; `schemeUid` is the
 * resolved OID for the designator when standard, else `undefined`.
 *
 * @example
 * ```ts
 * import { parseDicom, readCode } from "@cosyte/dicom";
 * const units = parseDicom(buf).image.realWorldValueMaps?.[0]?.unitsCode;
 * // units?.codeValue / units?.codingSchemeDesignator / units?.codeMeaning
 * ```
 */
export function readCode(item: Dataset): CodedConcept {
  const designator = readString(item, CODING_SCHEME_DESIGNATOR);
  const result: { -readonly [K in keyof CodedConcept]: CodedConcept[K] } = {};
  const codeValue = readString(item, CODE_VALUE);
  const codeMeaning = readString(item, CODE_MEANING);
  const schemeUid = codingSchemeOid(designator);
  if (codeValue !== undefined) result.codeValue = codeValue;
  if (designator !== undefined) result.codingSchemeDesignator = designator;
  if (codeMeaning !== undefined) result.codeMeaning = codeMeaning;
  if (schemeUid !== undefined) result.schemeUid = schemeUid;
  return result;
}

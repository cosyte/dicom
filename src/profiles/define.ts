/**
 * `defineProfile()` — the public factory for building immutable {@link Profile}
 * objects (Phase 6). Mirrors the `@cosyte/hl7` sibling's profile factory: a
 * validated options object in, a frozen `Profile` with a `describe()` method
 * out. Invalid input throws {@link ProfileDefinitionError} with an actionable
 * message rather than producing a half-built profile.
 *
 * A profile composes via `extends` (single parent or an array). Merge rules:
 *   - `lineage` = parents' lineages then this name, de-duplicated in order.
 *   - `escalations` / `suppressions` = set union of parents' and this
 *     profile's, with the contradiction guard (a code may not be both
 *     escalated and suppressed) applied to the *merged* result.
 *   - `privateDictionary` = parents merged left-to-right, then this profile's
 *     entries layered on top (child wins on a `(creator, key)` collision).
 *   - `description` = this profile's, else the first parent that declares one.
 *
 * Zero runtime deps; immutability is enforced at the return boundary via
 * `Object.freeze` (top-level) over already-frozen inner maps/sets.
 *
 * @module
 */

import type { PrivateTagDefinition, Profile } from "../parser/types.js";
import type { VR } from "../dictionary/types.js";
import { WARNING_CODES, type WarningCode } from "../parser/warnings.js";
import { ProfileDefinitionError } from "./errors.js";

/** Every valid VR string — the runtime mirror of the `VR` type union. */
const VALID_VRS: ReadonlySet<string> = new Set<VR>([
  "AE",
  "AS",
  "AT",
  "CS",
  "DA",
  "DS",
  "DT",
  "FL",
  "FD",
  "IS",
  "LO",
  "LT",
  "OB",
  "OD",
  "OF",
  "OL",
  "OV",
  "OW",
  "PN",
  "SH",
  "SL",
  "SQ",
  "SS",
  "ST",
  "SV",
  "TM",
  "UC",
  "UI",
  "UL",
  "UN",
  "UR",
  "US",
  "UT",
  "UV",
]);

/** Every valid warning code — the runtime mirror used for option validation. */
const VALID_WARNING_CODES: ReadonlySet<string> = new Set<string>(Object.values(WARNING_CODES));

/** Recognized top-level option keys (drives the unknown-key typo guard). */
const KNOWN_OPTION_KEYS: ReadonlySet<string> = new Set([
  "name",
  "description",
  "escalate",
  "suppress",
  "privateTags",
  "extends",
]);

/** Canonical private-tag key shape: 4 hex (group) + `XX` placeholder + 2 hex (element byte). */
const PRIVATE_KEY_RE = /^[0-9A-F]{4}XX[0-9A-F]{2}$/;

/**
 * One vendor's private-dictionary overlay as authored: canonical
 * `"GGGGXXLL"` key → definition. Case-insensitive on input; normalized to
 * uppercase on store.
 *
 * @example
 * ```ts
 * import type { ProfilePrivateTags } from "@cosyte/dicom";
 * const csa: ProfilePrivateTags = {
 *   "0029XX10": { vr: "OB", keyword: "CSAImageHeaderInfo", name: "CSA Image Header Info" },
 * };
 * ```
 */
export type ProfilePrivateTags = Readonly<Record<string, PrivateTagDefinition>>;

/**
 * Options accepted by {@link defineProfile}. Only `name` is required; every
 * other field defaults to empty. With `exactOptionalPropertyTypes`, omit an
 * unset key rather than passing `undefined`.
 *
 * @example
 * ```ts
 * import { defineProfile, WARNING_CODES } from "@cosyte/dicom";
 * const lenientCd = defineProfile({
 *   name: "lenient-cd",
 *   description: "Tolerant of conformance-loose archive CDs",
 *   suppress: [WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED],
 * });
 * ```
 */
export interface DefineProfileOptions {
  readonly name: string;
  readonly description?: string;
  readonly escalate?: readonly WarningCode[];
  readonly suppress?: readonly WarningCode[];
  readonly privateTags?: Readonly<Record<string, ProfilePrivateTags>>;
  readonly extends?: Profile | readonly Profile[];
}

/**
 * Build a frozen {@link Profile} from a validated options object.
 *
 * @example
 * ```ts
 * import { defineProfile, parseDicom } from "@cosyte/dicom";
 * const acme = defineProfile({
 *   name: "acme",
 *   description: "ACME PACS quirks",
 *   privateTags: {
 *     "ACME_PRIV_01": {
 *       "0019XX10": { vr: "DS", keyword: "AcmeDose", name: "ACME Dose" },
 *     },
 *   },
 * });
 * const ds = parseDicom(buf, { profile: acme });
 * console.log(acme.describe?.());
 * ```
 */
export function defineProfile(opts: DefineProfileOptions): Profile {
  validateName(opts);
  validateOptionKeys(opts);

  const parents = normalizeParents(opts.extends);

  const selfEscalations = validateCodes(opts.escalate ?? [], "escalate", opts.name);
  const selfSuppressions = validateCodes(opts.suppress ?? [], "suppress", opts.name);
  const selfDictionary = buildSelfDictionary(opts.privateTags ?? {}, opts.name);

  const lineage = mergeLineage(parents, opts.name);
  const escalations = unionCodes(
    parents.map((p) => p.escalations),
    selfEscalations,
  );
  const suppressions = unionCodes(
    parents.map((p) => p.suppressions),
    selfSuppressions,
  );
  assertNoContradiction(escalations, suppressions, opts.name);
  const privateDictionary = mergeDictionaries(parents, selfDictionary);
  const description = resolveDescription(parents, opts.description);

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const profile: Mutable<Profile> = {
    name: opts.name,
    lineage: Object.freeze(lineage),
    escalations,
    suppressions,
    privateDictionary,
  };
  if (description !== undefined) profile.description = description;

  const finalised = profile as Profile;
  profile.describe = (): string => describeProfile(finalised);

  return Object.freeze(profile) as Profile;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateName(opts: DefineProfileOptions): void {
  if (typeof opts.name !== "string" || opts.name.trim().length === 0) {
    throw new ProfileDefinitionError("Profile name must be a non-empty string.");
  }
}

function validateOptionKeys(opts: DefineProfileOptions): void {
  for (const key of Object.keys(opts)) {
    if (!KNOWN_OPTION_KEYS.has(key)) {
      throw new ProfileDefinitionError(
        `Unknown defineProfile option "${key}". Valid keys: ${[...KNOWN_OPTION_KEYS].join(", ")}.`,
        opts.name,
      );
    }
  }
}

function validateCodes(
  codes: readonly WarningCode[],
  field: "escalate" | "suppress",
  name: string,
): ReadonlySet<WarningCode> {
  const out = new Set<WarningCode>();
  for (const code of codes) {
    if (!VALID_WARNING_CODES.has(code)) {
      throw new ProfileDefinitionError(
        `Profile "${name}" ${field} lists unknown warning code "${String(code)}".`,
        name,
      );
    }
    out.add(code);
  }
  return out;
}

function buildSelfDictionary(
  privateTags: Readonly<Record<string, ProfilePrivateTags>>,
  name: string,
): Map<string, Map<string, PrivateTagDefinition>> {
  const out = new Map<string, Map<string, PrivateTagDefinition>>();
  for (const [creator, table] of Object.entries(privateTags)) {
    if (creator.length === 0) {
      throw new ProfileDefinitionError(`Profile "${name}" has an empty private-creator key.`, name);
    }
    const inner = new Map<string, PrivateTagDefinition>();
    for (const [rawKey, def] of Object.entries(table)) {
      const key = rawKey.toUpperCase();
      if (!PRIVATE_KEY_RE.test(key)) {
        throw new ProfileDefinitionError(
          `Profile "${name}" creator "${creator}" has invalid private-tag key "${rawKey}"; expected canonical "GGGGxxEE" (e.g. "0029xx10").`,
          name,
        );
      }
      if (!VALID_VRS.has(def.vr)) {
        throw new ProfileDefinitionError(
          `Profile "${name}" creator "${creator}" key "${rawKey}" has invalid VR "${String(def.vr)}".`,
          name,
        );
      }
      if (typeof def.keyword !== "string" || typeof def.name !== "string") {
        throw new ProfileDefinitionError(
          `Profile "${name}" creator "${creator}" key "${rawKey}" must supply string "keyword" and "name".`,
          name,
        );
      }
      inner.set(key, { vr: def.vr, keyword: def.keyword, name: def.name });
    }
    out.set(creator, inner);
  }
  return out;
}

function assertNoContradiction(
  escalations: ReadonlySet<WarningCode>,
  suppressions: ReadonlySet<WarningCode>,
  name: string,
): void {
  for (const code of escalations) {
    if (suppressions.has(code)) {
      throw new ProfileDefinitionError(
        `Profile "${name}" both escalates and suppresses "${code}"; a warning code can be one or the other, not both.`,
        name,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

function normalizeParents(ext: DefineProfileOptions["extends"]): readonly Profile[] {
  if (ext === undefined) return [];
  return isProfileArray(ext) ? ext : [ext];
}

/** Narrow `extends` to its array form (`Array.isArray` cannot refine `readonly` arrays). */
function isProfileArray(ext: Profile | readonly Profile[]): ext is readonly Profile[] {
  return Array.isArray(ext);
}

function mergeLineage(parents: readonly Profile[], name: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parents) {
    for (const ancestor of p.lineage) {
      if (!seen.has(ancestor)) {
        seen.add(ancestor);
        out.push(ancestor);
      }
    }
  }
  if (!seen.has(name)) out.push(name);
  return out;
}

function unionCodes(
  parentSets: readonly ReadonlySet<WarningCode>[],
  self: ReadonlySet<WarningCode>,
): ReadonlySet<WarningCode> {
  const out = new Set<WarningCode>();
  for (const set of parentSets) for (const c of set) out.add(c);
  for (const c of self) out.add(c);
  return Object.freeze(out);
}

function mergeDictionaries(
  parents: readonly Profile[],
  self: Map<string, Map<string, PrivateTagDefinition>>,
): ReadonlyMap<string, ReadonlyMap<string, PrivateTagDefinition>> {
  const merged = new Map<string, Map<string, PrivateTagDefinition>>();
  const layer = (src: ReadonlyMap<string, ReadonlyMap<string, PrivateTagDefinition>>): void => {
    for (const [creator, table] of src) {
      let inner = merged.get(creator);
      if (inner === undefined) {
        inner = new Map<string, PrivateTagDefinition>();
        merged.set(creator, inner);
      }
      for (const [key, def] of table) inner.set(key, def);
    }
  };
  for (const p of parents) layer(p.privateDictionary);
  layer(self);
  for (const inner of merged.values()) Object.freeze(inner);
  return Object.freeze(merged);
}

function resolveDescription(
  parents: readonly Profile[],
  own: string | undefined,
): string | undefined {
  if (own !== undefined) return own;
  for (const p of parents) if (p.description !== undefined) return p.description;
  return undefined;
}

// ---------------------------------------------------------------------------
// describe()
// ---------------------------------------------------------------------------

function describeProfile(profile: Profile): string {
  let creatorCount = 0;
  let entryCount = 0;
  for (const table of profile.privateDictionary.values()) {
    creatorCount++;
    entryCount += table.size;
  }
  const parts = [
    `profile "${profile.name}"`,
    `lineage [${profile.lineage.join(" → ")}]`,
    `escalations ${String(profile.escalations.size)}`,
    `suppressions ${String(profile.suppressions.size)}`,
    `private ${String(entryCount)} tag(s) across ${String(creatorCount)} creator(s)`,
  ];
  return parts.join("; ");
}

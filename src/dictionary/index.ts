/**
 * Public Dictionary namespace for `@cosyte/dicom` — Phase 1 deliverable.
 *
 * Per `.planning/phases/01-project-foundation/01-CONTEXT.md` D-10:
 *
 *  - {@link lookup} — accepts either an 8-char hex tag (`"00100010"`) or a
 *    keyword (`"PatientName"`) and returns the typed {@link DictionaryEntry}
 *    or `undefined`.
 *  - {@link byKeyword} — keyword-only lookup; for cases where the caller has
 *    already validated the input shape and wants a narrower call.
 *  - {@link uid} — UID lookup (DICT-06).
 *
 * No function throws on miss (D-10: "Returns the typed entry or `undefined`.
 * No throws on miss."). Returned entries are deeply frozen — mutation attempts
 * throw `TypeError` in strict mode (which all of `@cosyte/dicom`'s emitted code
 * runs under, given `"use strict"` is implicit for ES modules).
 *
 * @module
 */

import { KEYWORDS } from "./generated/keywords.js";
import { TAGS } from "./generated/tags.js";
import { UIDS } from "./generated/uids.js";

import type { DictionaryEntry, Tag, UidEntry, VR } from "./types.js";

export type { DictionaryEntry, Tag, UidEntry, VR };

const TAG_HEX_RE = /^[0-9A-F]{8}$/;

// Freeze the generated maps and every nested entry on first module load.
// The generated files emit declarative `as const` literals (no Object.freeze)
// so that re-running the generator stays byte-identical; the runtime freeze
// happens here, exactly once. This is the immutability guardrail required by
// CLAUDE.md and verified by the unit tests in `src/dictionary/index.test.ts`.
function deepFreezeEntries<T extends object>(map: {
  readonly [k: string]: T;
}): {
  readonly [k: string]: T;
} {
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (v !== undefined && !Object.isFrozen(v)) {
      Object.freeze(v);
    }
  }
  Object.freeze(map);
  return map;
}

const FROZEN_TAGS = deepFreezeEntries(TAGS);
const FROZEN_UIDS = deepFreezeEntries(UIDS);
Object.freeze(KEYWORDS);

/**
 * Look up a DICOM attribute by tag (`"00100010"`) or keyword (`"PatientName"`).
 *
 * Hex tag input is normalized to uppercase; keyword input is case-sensitive.
 * Returns `undefined` for unknown tags, unknown keywords, malformed input, or
 * tags from repeating-group families (those resolve via the family entry's
 * `repeatingGroup` flag — see {@link DictionaryEntry}).
 *
 * @example
 *   import { Dictionary } from "@cosyte/dicom";
 *   const a = Dictionary.lookup("00100010");        // by tag
 *   const b = Dictionary.lookup("PatientName");     // by keyword (DICT-04)
 *   const c = Dictionary.lookup("not-real");        // undefined (D-10 no-throw)
 */
export function lookup(tagOrKeyword: string): DictionaryEntry | undefined {
  if (typeof tagOrKeyword !== "string" || tagOrKeyword.length === 0) {
    return undefined;
  }
  const upper = tagOrKeyword.toUpperCase();
  if (TAG_HEX_RE.test(upper)) {
    return FROZEN_TAGS[upper];
  }
  return byKeyword(tagOrKeyword);
}

/**
 * Look up a DICOM attribute strictly by keyword (`"PatientName"`).
 *
 * Returns `undefined` for unknown keywords or malformed input. Use
 * {@link lookup} if the input could be either a tag or a keyword.
 *
 * @example
 *   import { Dictionary } from "@cosyte/dicom";
 *   const e = Dictionary.byKeyword("StudyInstanceUID");
 *   // e?.tag === "0020000D"
 */
export function byKeyword(keyword: string): DictionaryEntry | undefined {
  if (typeof keyword !== "string" || keyword.length === 0) {
    return undefined;
  }
  const tag = KEYWORDS[keyword];
  if (tag === undefined) {
    return undefined;
  }
  return FROZEN_TAGS[tag];
}

/**
 * Look up a DICOM UID by its dotted-decimal value.
 *
 * Returns `undefined` for unknown UIDs or malformed input. Used by
 * `parseDicom()` (Phase 2) to render human-readable Transfer Syntax names
 * (DICT-06).
 *
 * @example
 *   import { Dictionary } from "@cosyte/dicom";
 *   const ts = Dictionary.uid("1.2.840.10008.1.2.1");
 *   // ts?.name === "Explicit VR Little Endian"
 *   // ts?.type === "TransferSyntax"
 */
export function uid(uidValue: string): UidEntry | undefined {
  if (typeof uidValue !== "string" || uidValue.length === 0) {
    return undefined;
  }
  return FROZEN_UIDS[uidValue];
}

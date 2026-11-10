/**
 * The PS3.6 element registry, read by tag on demand from the generated `TAG_ROWS`.
 *
 * The registry used to be one object literal of 5,310 entries, frozen whole when the package
 * loaded: most of the package's import time, spent before a caller asked for a single tag. The
 * generator now emits it as rows of one string (see `./generated/tags.ts`), which costs the
 * JavaScript engine a scan to load, and this module builds an entry the first time its tag is
 * asked for. An entry is built once and kept, frozen, so a tag asked for twice, or by tag and then
 * by keyword, returns the same object. Its `vr` array is not frozen, as it never was.
 *
 * The first call indexes the rows (one pass over the string, keeping where each row starts);
 * nothing else is built until it is asked for. Every function here returns exactly what the
 * object literal answered: a row's fields are the literal's fields, in the same order, and the
 * rows are in the order of their keys, so the repeating-group rows come back in the order the
 * literal kept them.
 *
 * @internal
 * @module
 */

import { TAG_ROWS } from "./generated/tags.js";
import type { DictionaryEntry, Tag, VR } from "./types.js";

/** Where each row starts in `TAG_ROWS`, by its key, built on first use. */
let rowAt: Map<string, number> | undefined;
/** The entries built so far, by key. */
const entries = new Map<string, DictionaryEntry>();
/** Keyword to tag, for concrete rows with a keyword, built on first use. */
let keywords: Map<string, Tag> | undefined;
/** The repeating-group rows' entries, in row order, built on first use. */
let families: readonly DictionaryEntry[] | undefined;
/** The keys carrying a masked `x`, in row order, built on first use. */
let masked: readonly string[] | undefined;

function index(): Map<string, number> {
  if (rowAt !== undefined) return rowAt;
  const out = new Map<string, number>();
  // The rows start after the literal's opening line break, and each ends on one.
  let at = TAG_ROWS.indexOf("\n") + 1;
  while (at < TAG_ROWS.length) {
    const end = TAG_ROWS.indexOf("\n", at);
    out.set(TAG_ROWS.slice(at, TAG_ROWS.indexOf("|", at)), at);
    at = end + 1;
  }
  rowAt = out;
  return out;
}

function build(at: number): DictionaryEntry {
  const fields = TAG_ROWS.slice(at, TAG_ROWS.indexOf("\n", at)).split("|");
  const [tag = "", keyword = "", name = "", vrs = "", vm = "", retired = "", family = ""] = fields;
  const vr = (vrs === "" ? [] : vrs.split("/")) as VR[];
  const entry: DictionaryEntry =
    family === "x"
      ? { tag, keyword, name, vr, vm, retired: retired === "R", repeatingGroup: true }
      : { tag, keyword, name, vr, vm, retired: retired === "R" };
  return Object.freeze(entry);
}

/** `true` for a repeating-group row: its last field, just before its line break, is `x`. */
function isRepeatingGroupRow(at: number): boolean {
  return TAG_ROWS.charCodeAt(TAG_ROWS.indexOf("\n", at) - 1) === 0x78;
}

/**
 * The entry whose key is exactly `key`: an upper-case 8-hex-digit tag for a literal row, or a
 * masked key such as `60xx0010` for a repeating-group row. `undefined` when no row has it.
 *
 * @internal
 */
export function tagEntry(key: string): DictionaryEntry | undefined {
  const known = entries.get(key);
  if (known !== undefined) return known;
  const at = index().get(key);
  if (at === undefined) return undefined;
  const entry = build(at);
  entries.set(key, entry);
  return entry;
}

/**
 * `true` when a row's key is exactly `key`.
 *
 * @internal
 */
export function hasRow(key: string): boolean {
  return index().has(key);
}

/**
 * The tag of the concrete row whose keyword is `keyword`, or `undefined`. A repeating-group row's
 * keyword names no single tag and is not here.
 *
 * @internal
 */
export function keywordTag(keyword: string): Tag | undefined {
  if (keywords === undefined) {
    const out = new Map<string, Tag>();
    for (const [key, at] of index()) {
      if (isRepeatingGroupRow(at)) continue;
      const from = TAG_ROWS.indexOf("|", at) + 1;
      const word = TAG_ROWS.slice(from, TAG_ROWS.indexOf("|", from));
      if (word.length > 0) out.set(word, key);
    }
    keywords = out;
  }
  return keywords.get(keyword);
}

/**
 * The repeating-group rows' entries, in row order.
 *
 * @internal
 */
export function repeatingGroupEntries(): readonly DictionaryEntry[] {
  if (families === undefined) {
    const out: DictionaryEntry[] = [];
    for (const [key, at] of index()) {
      if (!isRepeatingGroupRow(at)) continue;
      const entry = tagEntry(key);
      /* v8 ignore next -- unreachable: every key in the index has a row. */
      if (entry !== undefined) out.push(entry);
    }
    families = Object.freeze(out);
  }
  return families;
}

/**
 * Every key that carries the masked `x` PS3.6 prints, in row order.
 *
 * @internal
 */
export function maskedKeys(): readonly string[] {
  masked ??= Object.freeze([...index().keys()].filter((key) => key.includes("x")));
  return masked;
}

/**
 * Every row's key, in row order.
 *
 * @internal
 */
export function registryKeys(): readonly string[] {
  return [...index().keys()];
}

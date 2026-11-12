/**
 * `stringifyDicomJson`: the text of a DICOM JSON Model object with its attributes in the order
 * PS3.18 F.2.2 gives them.
 *
 * @module
 */

import { WITHHELD } from "../parser/tokens.js";
import { codedError, DICOM_JSON_ERROR_CODES, DicomJsonError } from "./errors.js";
import type { DicomJsonDataset } from "./types.js";

/**
 * What a value is where it sits: a Data Set, one attribute, or a Sequence's Items. `undefined` is
 * any other JSON, which `JSON.stringify` writes.
 */
type Kind = "dataset" | "attribute" | "items" | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The indent of one level, as `JSON.stringify` reads its `space` argument. */
function gapOf(space: string | number | undefined): string {
  if (typeof space === "number") return " ".repeat(Math.min(10, Math.max(0, Math.floor(space))));
  if (typeof space === "string") return space.slice(0, 10);
  return "";
}

/** `parts` inside `open` and `close`, one to a line under a gap, as `JSON.stringify` writes them. */
function wrap(parts: string[], open: string, close: string, indent: string, gap: string): string {
  if (parts.length === 0) return `${open}${close}`;
  if (gap === "") return `${open}${parts.join(",")}${close}`;
  const inner = `${indent}${gap}`;
  return `${open}\n${inner}${parts.join(`,\n${inner}`)}\n${indent}${close}`;
}

/**
 * The order of two keys of a Data Set: by their tags' values, so by the uppercase of their hex
 * digits, and two keys of one tag in different case (which `fromDicomJson` refuses) by their code
 * units, so the order is fixed.
 */
function byTag(a: string, b: string): number {
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  // Stryker disable next-line EqualityOperator: equivalent, x and y differ here, so x <= y is x < y
  if (x !== y) return x < y ? -1 : 1;
  // Stryker disable next-line EqualityOperator: equivalent, Object.keys never gives one key twice, so a and b differ here
  return a < b ? -1 : 1;
}

/**
 * What `JSON.stringify` makes of `value` before it writes it: the result of its `toJSON` method,
 * called with the key `value` is held under, if it has one. A bigint is asked too, as there.
 */
function toJsonOf(value: unknown, key: string): unknown {
  if ((typeof value !== "object" || value === null) && typeof value !== "bigint") return value;
  const method = (value as { toJSON?: unknown }).toJSON;
  return typeof method === "function" ? (method as (k: string) => unknown).call(value, key) : value;
}

/**
 * The text `JSON.stringify` writes for `value` held under `key`, at `indent`, or `undefined` where
 * it writes nothing. `value` is written inside an object of that one key, so that a `toJSON`
 * method is called with its own key, and the text is cut out and indented where it goes.
 */
function native(value: unknown, key: string, indent: string, gap: string): string | undefined {
  const text = JSON.stringify({ [key]: value }, null, gap);
  if (text === "{}") return undefined;
  const name = JSON.stringify(key);
  if (gap === "") return text.slice(name.length + 2, -1);
  const body = text.slice(gap.length + name.length + 4, -2);
  // A JSON string holds no raw line break, so each one begins a line, one gap deeper than here.
  return body
    .split("\n")
    .map((line, i) => (i === 0 ? line : `${indent}${line.slice(gap.length)}`))
    .join("\n");
}

/**
 * The text of `value` at `indent`, held under `key`, or `undefined` where `JSON.stringify` writes
 * nothing (an `undefined` field). A Data Set's keys are written in ascending order of their tags.
 * Everything else is written as `JSON.stringify` writes it, a `toJSON` method called once with its
 * key, so the two write the same text but for that order.
 */
function write(
  value: unknown,
  key: string,
  kind: Kind,
  indent: string,
  gap: string,
): string | undefined {
  if (kind === undefined) return native(value, key, indent, gap);
  const v = toJsonOf(value, key);
  const inner = `${indent}${gap}`;
  if (Array.isArray(v)) {
    const child: Kind = kind === "items" ? "dataset" : undefined;
    const parts = v.map((item, i) => write(item, String(i), child, inner, gap) ?? "null");
    return wrap(parts, "[", "]", indent, gap);
  }
  if (isRecord(v)) {
    const keys = Object.keys(v);
    if (kind === "dataset") keys.sort(byTag);
    const parts: string[] = [];
    for (const k of keys) {
      let child: Kind;
      if (kind === "dataset") child = "attribute";
      else if (kind === "attribute" && k === "Value" && v["vr"] === "SQ") child = "items";
      const text = write(v[k], k, child, inner, gap);
      if (text === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${gap === "" ? "" : " "}${text}`);
    }
    return wrap(parts, "{", "}", indent, gap);
  }
  // A primitive, whose `toJSON`, if any, has been called: `JSON.stringify` writes it as it is.
  return JSON.stringify(v);
}

/**
 * The JSON text of a DICOM JSON Model Data Set, its attributes in ascending order of their tags at
 * every depth, as PS3.18 F.2.2 orders them. `JSON.stringify` cannot write that order for every
 * Data Set: an all-digit tag with no leading zero, such as `60000010` Overlay Rows or `20000010`
 * Number of Copies, is an integer index, which a JavaScript object lists before its other keys
 * whatever order they were added in. Tags are ordered by their value, so `0010000a` before
 * `0010000B`, whatever the case of their hex letters. Everything else is written as
 * `JSON.stringify` writes it, `space` included, so where the order already holds the two give the
 * same text; a `toJSON` method, the Data Set's own included, is called as `JSON.stringify` calls
 * it, once, with the key it is held under, and what it returns is written in its place.
 *
 * @param json - A Data Set of the DICOM JSON Model, usually from `toDicomJson`.
 * @param space - Indentation, as `JSON.stringify` takes it: a number of spaces up to 10, or a
 *   string of up to 10 characters.
 * @returns The JSON text.
 * @throws `DicomJsonError` with `CONVERSION_FAILED` for a value `JSON.stringify` cannot
 *   write, such as a `bigint` or a cycle, for an error a `toJSON` method throws, and where the
 *   Data Set's own `toJSON` leaves no text; the error it replaces is not kept.
 * @example
 * ```ts
 * import { parseDicom, stringifyDicomJson, toDicomJson } from "@cosyte/dicom";
 * const text = stringifyDicomJson(toDicomJson(parseDicom(buf)));
 * // '{"00080005":{...},...,"60000010":{"vr":"US","Value":[512]}}'
 * ```
 */
export function stringifyDicomJson(json: DicomJsonDataset, space?: string | number): string {
  try {
    const text = write(json, "", "dataset", "", gapOf(space));
    // Only a toJSON method in the Data Set's place can leave it no text.
    if (text === undefined)
      throw new DicomJsonError(DICOM_JSON_ERROR_CODES.CONVERSION_FAILED, WITHHELD);
    return text;
  } catch (err) {
    throw codedError(err);
  }
}

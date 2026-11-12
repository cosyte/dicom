/**
 * `stringifyDicomJson`: the text of a DICOM JSON Model object with its attributes in the order
 * PS3.18 F.2.2 gives them.
 *
 * @module
 */

import { codedError } from "./errors.js";
import type { DicomJsonDataset } from "./types.js";

/** What a value is where it sits: a Data Set, one attribute, a Sequence's Items, or other JSON. */
type Kind = "dataset" | "attribute" | "items" | "plain";

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
 * The text of `value` at `indent`, or `undefined` where `JSON.stringify` writes nothing (an
 * `undefined` field). A Data Set's keys are written in ascending order; everything else in the
 * order its object holds, by `JSON.stringify` itself, so the two write the same text but for that.
 */
function write(value: unknown, kind: Kind, indent: string, gap: string): string | undefined {
  if (kind === "items" && Array.isArray(value)) {
    const inner = `${indent}${gap}`;
    const parts = value.map((item) => write(item, "dataset", inner, gap) ?? "null");
    return wrap(parts, "[", "]", indent, gap);
  }
  if ((kind === "dataset" || kind === "attribute") && isRecord(value)) {
    const keys = Object.keys(value);
    if (kind === "dataset") keys.sort();
    const inner = `${indent}${gap}`;
    const parts: string[] = [];
    for (const key of keys) {
      let child: Kind = "plain";
      if (kind === "dataset") child = "attribute";
      else if (key === "Value" && value["vr"] === "SQ") child = "items";
      const text = write(value[key], child, inner, gap);
      if (text === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${gap === "" ? "" : " "}${text}`);
    }
    return wrap(parts, "{", "}", indent, gap);
  }
  const text = JSON.stringify(value, null, gap) as string | undefined;
  // A JSON string holds no raw line break, so each one is a line `JSON.stringify` began.
  return text?.replace(/\n/gu, `\n${indent}`);
}

/**
 * The JSON text of a DICOM JSON Model Data Set, its attributes in ascending order of their tags at
 * every depth, as PS3.18 F.2.2 orders them. `JSON.stringify` cannot write that order for every
 * Data Set: an all-digit tag with no leading zero, such as `60000010` Overlay Rows or `20000010`
 * Number of Copies, is an integer index, which a JavaScript object lists before its other keys
 * whatever order they were added in. Everything else is written as `JSON.stringify` writes it,
 * `space` included, so where the order already holds the two give the same text.
 *
 * @param json - A Data Set of the DICOM JSON Model, usually from `toDicomJson`.
 * @param space - Indentation, as `JSON.stringify` takes it: a number of spaces up to 10, or a
 *   string of up to 10 characters.
 * @returns The JSON text.
 * @throws `DicomJsonError` with `CONVERSION_FAILED` for a value `JSON.stringify` cannot
 *   write, such as a `bigint` or a cycle; the error it replaces is not kept.
 * @example
 * ```ts
 * import { parseDicom, stringifyDicomJson, toDicomJson } from "@cosyte/dicom";
 * const text = stringifyDicomJson(toDicomJson(parseDicom(buf)));
 * // '{"00080005":{...},...,"60000010":{"vr":"US","Value":[512]}}'
 * ```
 */
export function stringifyDicomJson(json: DicomJsonDataset, space?: string | number): string {
  try {
    // A Data Set is an object, which always writes some text.
    return write(json, "dataset", "", gapOf(space)) as string;
  } catch (err) {
    throw codedError(err);
  }
}

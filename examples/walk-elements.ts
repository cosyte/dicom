/**
 * Walk every element of an object with its dictionary name and the shape of its typed value.
 *
 * `ds.elements()` visits every data element; `Dictionary.lookup` names a tag from the Part 6 data
 * dictionary compiled into the package; `element.value` decodes the raw bytes into a discriminated
 * `DicomValue` on first read. Each line prints the tag, the VR, the name, the value's kind and how
 * many values and bytes it holds, never the value itself: an element dump of a real object is PHI.
 * The input is the synthetic CT object in `examples/data/ct-object.ts`.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/walk-elements.ts
 */

import assert from "node:assert/strict";

import { Dictionary, parseDicom, type DicomValue } from "@cosyte/dicom";

import { SYNTHETIC_CT } from "./data/ct-object.js";

/**
 * What a decoded value is, without the value: its kind and how many values it holds. The values
 * themselves are what the sender wrote (a name, an ID, a date, a UID), so a line about an element
 * prints its shape and never its content.
 */
function shape(value: DicomValue): string {
  if (value.kind === "empty") return "empty";
  if (value.kind === "text") return `text, ${String(value.value.length)} characters`;
  if (value.kind === "binary") return `binary, ${String(value.bytes.length)} bytes`;
  if (value.kind === "sequence") return `sequence, ${String(value.items.length)} items`;
  return `${value.kind}, ${String(value.values.length)} value(s)`;
}

const ds = parseDicom(SYNTHETIC_CT);
const seen: string[] = [];
for (const element of ds.elements()) {
  const entry = Dictionary.lookup(element.tag);
  seen.push(entry?.keyword ?? element.tag);
  console.log(
    `(${element.tag.slice(0, 4)},${element.tag.slice(4)}) ${element.vr}`,
    `${String(entry?.name).padEnd(28)} ${shape(element.value)}, ${String(element.length)} bytes`,
  );
}

// The decoded values are read and asserted on, never printed. These are synthetic.
const name = ds.get("00100010")?.value;
assert.ok(name?.kind === "personName");
assert.equal(name.values[0]?.alphabetic.familyName, "Doe");

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(seen.length, 17);
assert.ok(seen.includes("PatientName") && seen.includes("RescaleIntercept"));
const spacing = ds.get("00280030")?.value;
assert.ok(spacing?.kind === "decimalString");
assert.deepEqual(spacing.values, [0.5, 0.5]);

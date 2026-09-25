/**
 * Walk every element of an object with its dictionary name and its typed value.
 *
 * `ds.elements()` visits every data element; `Dictionary.lookup` names a tag from the Part 6 data
 * dictionary compiled into the package; `element.value` decodes the raw bytes into a discriminated
 * `DicomValue` on first read. The input is the synthetic CT object in `examples/data/ct-object.ts`.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/walk-elements.ts
 */

import assert from "node:assert/strict";

import { Dictionary, parseDicom, type DicomValue } from "@cosyte/dicom";

import { SYNTHETIC_CT } from "./data/ct-object.js";

/** One readable line for a decoded value; every kind this object carries is spelled out. */
function show(value: DicomValue): string {
  switch (value.kind) {
    case "strings":
      return value.values.join(" | ");
    case "numbers":
    case "integerString":
    case "decimalString":
      return value.values.join(" \\ ");
    case "personName":
      return value.values
        .map((pn) => `${String(pn.alphabetic?.familyName)}^${String(pn.alphabetic?.givenName)}`)
        .join(" | ");
    case "dates":
      return value.values.map((d) => d.raw).join(" | ");
    // Kinds this object does not carry: named rather than decoded here.
    case "text":
    case "bigints":
    case "attributeTags":
    case "times":
    case "dateTimes":
    case "binary":
    case "sequence":
    case "empty":
      return `(${value.kind})`;
  }
}

const ds = parseDicom(SYNTHETIC_CT);
const seen: string[] = [];
for (const element of ds.elements()) {
  const entry = Dictionary.lookup(element.tag);
  seen.push(entry?.keyword ?? element.tag);
  console.log(
    `(${element.tag.slice(0, 4)},${element.tag.slice(4)}) ${element.vr}`,
    `${String(entry?.name).padEnd(28)} ${show(element.value)}`,
  );
}

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(seen.length, 17);
assert.ok(seen.includes("PatientName") && seen.includes("RescaleIntercept"));
const spacing = ds.get("00280030")?.value;
assert.ok(spacing?.kind === "decimalString");
assert.deepEqual(spacing.values, [0.5, 0.5]);

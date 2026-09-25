/**
 * De-identify an object's metadata, audit what was done, and write the result out.
 *
 * `deidentify` applies the PS3.15 Annex E Basic Profile to the header and returns a fresh dataset
 * plus a report of every attribute it acted on (tag, keyword, action; never a value). The input
 * dataset is not mutated. It does not touch pixels. The input is the synthetic CT object in
 * `examples/data/ct-object.ts`.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/deidentify.ts
 */

import assert from "node:assert/strict";

import { deidentify, parseDicom, serializeDicom } from "@cosyte/dicom";

import { SYNTHETIC_CT } from "./data/ct-object.js";

const source = parseDicom(SYNTHETIC_CT);
const { dataset, report } = deidentify(source);

for (const a of report.attributes) {
  console.log(`(${a.tag.slice(0, 4)},${a.tag.slice(4)}) ${a.keyword}: ${a.action}, ${a.applied}`);
}

const safe = parseDicom(serializeDicom(dataset));
const method = safe.get("00120063")?.value;
console.log("Patient ID after:", JSON.stringify(safe.patient.id));
console.log("Study UID after:", safe.study.instanceUid);
console.log("Method recorded:", method?.kind === "strings" ? method.values[0] : undefined);
console.log("Source untouched:", source.patient.id);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
const applied = new Map(report.attributes.map((a) => [a.keyword, a.applied]));
assert.equal(applied.get("Patient's Name"), "emptied");
assert.equal(applied.get("Patient ID"), "emptied");
assert.equal(applied.get("Issuer of Patient ID"), "removed");
assert.equal(applied.get("Study Instance UID"), "uid-remapped");
assert.equal(safe.patient.id, undefined);
assert.equal(safe.patient.name, undefined);
assert.notEqual(safe.study.instanceUid, source.study.instanceUid);
assert.equal(method?.kind, "strings");
assert.equal(source.patient.id, "MRN-42");

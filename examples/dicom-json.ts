/**
 * Convert a DICOM Part 10 object to the DICOM JSON Model (PS3.18 Annex F) and back.
 *
 * `examples/data/ct-object.ts` holds a synthetic CT object (an invented patient, example-root
 * UIDs). `toDicomJson` writes its Data Set as one JSON object keyed by tag; `fromDicomJson` reads
 * that JSON back into a `Dataset` under the File Meta you give it, and `serializeDicom` writes the
 * same Part 10 bytes it writes for the object as read. The JSON Model holds no File Meta, so the
 * trip passes the source's `fileMeta` back in.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/dicom-json.ts
 */

import assert from "node:assert/strict";

import {
  fromDicomJson,
  parseDicom,
  serializeDicom,
  toDicomJson,
  type DicomJsonDataset,
} from "@cosyte/dicom";

import { SYNTHETIC_CT } from "./data/ct-object.js";

const ds = parseDicom(SYNTHETIC_CT);
// The object carries no Pixel Data. One that does needs a `bulkDataUri` option to hand it out by
// URI, or `inlineBulkData: true` to write it inline; without either the call is refused.
const json = toDicomJson(ds);
const text = JSON.stringify(json);

console.log(`Attributes: ${String(Object.keys(json).length)}`);
console.log("Patient's Name:", JSON.stringify(json["00100010"]));
console.log("Modality:", JSON.stringify(json["00080060"]));
console.log("Pixel Spacing:", JSON.stringify(json["00280030"]));
console.log(`JSON text: ${String(text.length)} characters`);

if (ds.fileMeta === undefined) throw new Error("the object has no File Meta");
// JSON.parse returns `any`: name the shape the text was written in.
const parsed = JSON.parse(text) as DicomJsonDataset;
const back = fromDicomJson(parsed, { fileMeta: ds.fileMeta });
const bytes = serializeDicom(back);
const written = serializeDicom(ds);
console.log(
  `Part 10 again: ${String(bytes.length)} bytes, identical: ${String(bytes.equals(written))}`,
);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.deepEqual(json["00100010"], { vr: "PN", Value: [{ Alphabetic: "Doe^Jane" }] });
assert.deepEqual(json["00080060"], { vr: "CS", Value: ["CT"] });
assert.deepEqual(json["00280030"], { vr: "DS", Value: [0.5, 0.5] });
assert.deepEqual(json["00280010"], { vr: "US", Value: [512] });
assert.ok(bytes.equals(written));
assert.deepEqual(toDicomJson(back), json);

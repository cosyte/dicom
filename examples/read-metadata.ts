/**
 * Read who, what and how out of a DICOM Part 10 object through the four typed views.
 *
 * What identifies the patient or the study (the name, the ID, the date, the UIDs) is read and
 * asserted on, never printed: what this prints is what is safe to log.
 *
 * `examples/data/ct-object.ts` holds a synthetic CT object (an invented patient, example-root
 * UIDs). The views answer the safety-critical questions without a tag table: whose object, which
 * study and series, and the image geometry you need before interpreting a pixel. A missing value
 * stays `undefined`, never a substituted default.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/read-metadata.ts
 */

import assert from "node:assert/strict";

import { Dictionary, parseDicom, toISO } from "@cosyte/dicom";

import { SYNTHETIC_CT } from "./data/ct-object.js";

const ds = parseDicom(SYNTHETIC_CT);
const sopClass = ds.get("00080016")?.value;
const sopClassUid = sopClass?.kind === "strings" ? sopClass.values[0] : undefined;

// Who the object belongs to, and which study. These identify a person and a study, so they are read
// into variables and asserted on below, never printed. The values in the comments are synthetic.
const name = ds.patient.name?.alphabetic; // familyName "Doe", givenName "Jane", synthetic
const patientId = ds.patient.id; // "MRN-42", synthetic
const issuer = ds.patient.issuerOfId; // "SAMPLE-HOSP", synthetic
const studyDate = toISO(ds.study.date); // "1900-01-01", synthetic

// What is safe to print: the kind of object, the modality, the geometry and counts.
console.log(`SOP class: ${String(Dictionary.uid(sopClassUid ?? "")?.name)}`);
console.log(
  `Patient ID present: ${String(patientId !== undefined)}, with issuer: ${String(issuer !== undefined)}`,
);
console.log(`Study date valid: ${String(ds.study.date?.valid)}`);
console.log(`Series ${String(ds.series.number)}: ${String(ds.series.modality)}`);
console.log(
  `Image: ${String(ds.image.rows)} x ${String(ds.image.columns)},`,
  `signed ${String(ds.image.signed)}, rescale ${String(ds.image.rescaleSlope)} / ${String(ds.image.rescaleIntercept)},`,
  `spacing ${JSON.stringify(ds.image.pixelSpacing)}`,
);
console.log("Warnings:", ds.warnings.length);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(name?.familyName, "Doe");
assert.equal(name?.givenName, "Jane");
assert.equal(patientId, "MRN-42");
assert.equal(issuer, "SAMPLE-HOSP");
assert.equal(Dictionary.uid(sopClassUid ?? "")?.name, "CT Image Storage");
assert.equal(studyDate, "1900-01-01");
assert.equal(ds.series.modality, "CT");
assert.deepEqual([ds.image.rows, ds.image.columns], [512, 512]);
assert.equal(ds.image.signed, true);
assert.deepEqual([ds.image.rescaleSlope, ds.image.rescaleIntercept], [1, -1024]);
assert.equal(ds.warnings.length, 0);

/**
 * Read a vendor-quirky object leniently, then write it back out as spec-clean Part 10.
 *
 * The input is the synthetic CT object from `examples/data/ct-object.ts` with its 128-byte preamble
 * and `DICM` magic cut off, as some writers save it. The parser reads it anyway and records the
 * deviation as the stable code `DICOM_MISSING_PREAMBLE`. `serializeDicom` writes a conformant file
 * in the same transfer syntax, with the preamble, File Meta rebuilt and elements in ascending tag
 * order, and no value changed; reading that back raises no warning.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/tolerate-and-reserialize.ts
 */

import assert from "node:assert/strict";

import { parseDicom, serializeDicom } from "@cosyte/dicom";

import { SYNTHETIC_CT } from "./data/ct-object.js";

// Preamble (128 bytes) plus the "DICM" magic (4 bytes), removed.
const quirky = SYNTHETIC_CT.subarray(132);
const read = parseDicom(quirky);
console.log(
  `Read ${String(quirky.length)} bytes, tolerated:`,
  read.warnings.map((w) => w.code),
);

const written = serializeDicom(read);
const reread = parseDicom(written);
console.log(
  `Wrote ${String(written.length)} bytes, magic "${written.toString("ascii", 128, 132)}"`,
);
console.log(
  "Reading it back tolerated:",
  reread.warnings.map((w) => w.code),
);
console.log("Transfer syntax kept:", reread.fileMeta?.transferSyntaxUID);

const tags = [...reread.elements()].map((e) => e.tag);
const values = (ds: typeof read): string[] =>
  [...ds.elements()].map((e) => `${e.tag}=${JSON.stringify(e.value)}`).sort();

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.deepEqual(
  read.warnings.map((w) => w.code),
  ["DICOM_MISSING_PREAMBLE"],
);
assert.equal(written.toString("ascii", 128, 132), "DICM");
assert.equal(reread.warnings.length, 0);
assert.equal(reread.fileMeta?.transferSyntaxUID, "1.2.840.10008.1.2.1");
assert.deepEqual(tags, [...tags].sort());
assert.deepEqual(values(reread), values(read));

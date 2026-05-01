// test/smoke/esm/index.mjs
//
// ESM smoke harness — runs against the built dist/ artifacts.
// Invoked by scripts/smoke.ts via spawnSync('node', [...]); no package install.
// See test/smoke/README.md for the harness shape and intent.

import { Dictionary, VERSION } from "../../../dist/index.mjs";
import assert from "node:assert/strict";

assert.strictEqual(typeof VERSION, "string", "VERSION export missing or wrong type");
assert.ok(VERSION.length > 0, "VERSION is empty");

// Dictionary.lookup by tag (DICT-03)
const pnByTag = Dictionary.lookup("00100010");
assert.ok(pnByTag, "Dictionary.lookup('00100010') returned undefined");
assert.strictEqual(pnByTag.keyword, "PatientName", "PN keyword mismatch");
assert.ok(Array.isArray(pnByTag.vr), "vr should be a readonly array");
assert.ok(pnByTag.vr.includes("PN"), "PN VR missing from vr array");

// Dictionary.lookup by keyword (DICT-04 bidirectional)
const pnByKeyword = Dictionary.lookup("PatientName");
assert.ok(pnByKeyword, "Dictionary.lookup('PatientName') returned undefined");
assert.strictEqual(pnByKeyword.tag, "00100010", "tag-from-keyword mismatch");

// Dictionary.byKeyword (narrower call)
const studyUid = Dictionary.byKeyword("StudyInstanceUID");
assert.ok(studyUid, "Dictionary.byKeyword('StudyInstanceUID') returned undefined");
assert.strictEqual(studyUid.tag, "0020000D", "StudyInstanceUID tag mismatch");

// Dictionary.uid (DICT-06)
const ts = Dictionary.uid("1.2.840.10008.1.2.1");
assert.ok(ts, "Dictionary.uid for Explicit VR LE returned undefined");
assert.strictEqual(ts.name, "Explicit VR Little Endian", "TS name mismatch");
assert.strictEqual(ts.type, "TransferSyntax", "TS type mismatch");

// Undefined-on-miss (D-10 no-throw contract)
assert.strictEqual(Dictionary.lookup("ZZZ_NOT_REAL"), undefined);
assert.strictEqual(Dictionary.uid("not-a-uid"), undefined);

console.log("[smoke:esm] OK — VERSION=" + VERSION + " PN=" + pnByTag.keyword + " TS=" + ts.name);

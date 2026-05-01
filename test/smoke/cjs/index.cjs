// test/smoke/cjs/index.cjs
//
// CJS smoke harness — runs against the built dist/ artifacts.
// `.cjs` runs as CommonJS regardless of package "type": "module".
// See test/smoke/README.md for the harness shape and intent.

const { Dictionary, VERSION } = require("../../../dist/index.cjs");
const assert = require("node:assert/strict");

assert.strictEqual(typeof VERSION, "string", "VERSION export missing or wrong type");
assert.ok(VERSION.length > 0, "VERSION is empty");

const pnByTag = Dictionary.lookup("00100010");
assert.ok(pnByTag, "Dictionary.lookup('00100010') returned undefined");
assert.strictEqual(pnByTag.keyword, "PatientName", "PN keyword mismatch");
assert.ok(Array.isArray(pnByTag.vr), "vr should be a readonly array");
assert.ok(pnByTag.vr.includes("PN"), "PN VR missing from vr array");

const pnByKeyword = Dictionary.lookup("PatientName");
assert.ok(pnByKeyword, "Dictionary.lookup('PatientName') returned undefined");
assert.strictEqual(pnByKeyword.tag, "00100010", "tag-from-keyword mismatch");

const studyUid = Dictionary.byKeyword("StudyInstanceUID");
assert.ok(studyUid, "Dictionary.byKeyword('StudyInstanceUID') returned undefined");
assert.strictEqual(studyUid.tag, "0020000D", "StudyInstanceUID tag mismatch");

const ts = Dictionary.uid("1.2.840.10008.1.2.1");
assert.ok(ts, "Dictionary.uid for Explicit VR LE returned undefined");
assert.strictEqual(ts.name, "Explicit VR Little Endian", "TS name mismatch");
assert.strictEqual(ts.type, "TransferSyntax", "TS type mismatch");

assert.strictEqual(Dictionary.lookup("ZZZ_NOT_REAL"), undefined);
assert.strictEqual(Dictionary.uid("not-a-uid"), undefined);

console.log("[smoke:cjs] OK — VERSION=" + VERSION + " PN=" + pnByTag.keyword + " TS=" + ts.name);

// test/smoke/esm/index.mjs
//
// ESM smoke harness — runs against the built dist/ artifacts.
// Invoked by scripts/smoke.ts via spawnSync('node', [...]); no package install.
// See test/smoke/README.md for the harness shape and intent.

import {
  Dictionary,
  VERSION,
  parseDicom,
  serializeDicom,
  deidentify,
  defineProfile,
  profiles,
  makeUidRemapper,
  DEFAULT_UID_ROOT,
  DEIDENTIFY_OPTIONS,
  DEIDENTIFY_ERROR_CODES,
  DeidentifyError,
  WARNING_CODES,
  FATAL_CODES,
  SERIALIZE_ERROR_CODES,
  VALUE_ERROR_CODES,
} from "../../../dist/index.mjs";
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

// Phase 1–7 entrypoints are callable functions on the published surface.
for (const fn of [parseDicom, serializeDicom, deidentify, defineProfile, makeUidRemapper]) {
  assert.strictEqual(typeof fn, "function", "expected a callable export");
}

// Profiles (Phase 6) — five built-ins, each a frozen Profile with a private-dictionary Map.
assert.strictEqual(Object.keys(profiles).length, 5, "expected 5 built-in profiles");
for (const key of ["ge", "siemens", "philips", "strict", "lenient"]) {
  assert.ok(profiles[key], `profiles.${key} missing`);
  assert.strictEqual(typeof profiles[key].name, "string", `profiles.${key}.name not a string`);
  assert.strictEqual(
    typeof profiles[key].privateDictionary.get,
    "function",
    `profiles.${key}.privateDictionary is not a Map`,
  );
}
const customProfile = defineProfile({ name: "smoke-test", extends: profiles.strict });
assert.strictEqual(customProfile.name, "smoke-test", "defineProfile name mismatch");
assert.strictEqual(typeof customProfile.describe, "function", "Profile.describe missing");

// UID remapper (Phase 7) — deterministic, content-derived, rooted at 2.25.
assert.strictEqual(DEFAULT_UID_ROOT, "2.25", "DEFAULT_UID_ROOT mismatch");
const remap = makeUidRemapper();
assert.strictEqual(remap.map("1.2.3"), remap.map("1.2.3"), "UID remap not deterministic");
assert.ok(remap.map("1.2.3").startsWith("2.25."), "UID remap not rooted at 2.25");

// De-identify options + error taxonomy (Phase 7).
assert.ok(DEIDENTIFY_OPTIONS.includes("RetainUIDs"), "RetainUIDs option missing");
assert.strictEqual(DEIDENTIFY_ERROR_CODES.INVALID_OPTIONS, "INVALID_OPTIONS", "error code mismatch");
const dErr = new DeidentifyError("smoke", "INVALID_OPTIONS");
assert.ok(dErr instanceof Error, "DeidentifyError not an Error");
assert.strictEqual(dErr.code, "INVALID_OPTIONS", "DeidentifyError.code mismatch");

// Stable code registries (Phases 1–5) present on the published surface.
assert.strictEqual(WARNING_CODES.DICOM_MISSING_PREAMBLE, "DICOM_MISSING_PREAMBLE", "warning code mismatch");
assert.strictEqual(FATAL_CODES.NOT_DICOM_PART_10, "NOT_DICOM_PART_10", "fatal code mismatch");
assert.strictEqual(
  SERIALIZE_ERROR_CODES.MISSING_TRANSFER_SYNTAX,
  "MISSING_TRANSFER_SYNTAX",
  "serialize error code mismatch",
);
assert.strictEqual(
  VALUE_ERROR_CODES.FRAME_INDEX_OUT_OF_RANGE,
  "FRAME_INDEX_OUT_OF_RANGE",
  "value error code mismatch",
);

console.log("[smoke:esm] OK — VERSION=" + VERSION + " PN=" + pnByTag.keyword + " TS=" + ts.name);

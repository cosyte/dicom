import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import { defineProfile, deidentify, parseDicom, serializeDicom } from "../src/index.js";
import { buildDicom } from "./helpers/build-dicom.js";

/**
 * Refuter probe for S0058-dicom-1 (impl gate, loop 1).
 *
 * NOT a shipped vitest test: this repo's vitest `include` is
 * `test/[*][*]/[*].test.ts` and the refuter guard only lets me write a
 * `regress_*` artifact with a single-dot extension, so the two patterns cannot
 * both be satisfied. It runs as a script instead, which is a reproducible
 * command under decision 26:
 *
 *   pnpm exec tsx test/regress_0058_F1.ts
 *
 * Exit 0 = every probe held. A FAIL line names the probe that did not, and its
 * assertion message.
 */

const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";
const PRIVATE_TAG = "00091001";
const NESTED = "BOND^JAMES";

function ascii(s: string): Buffer {
  return Buffer.from(s.length % 2 === 0 ? s : `${s} `, "ascii");
}

/** A well-formed `(FFFE,E000)` item stream carrying a real Patient's Name. */
const itemStream = ((): Buffer => {
  const body = Buffer.concat([
    Buffer.from([0x10, 0x00, 0x10, 0x00]),
    Buffer.from("PN", "ascii"),
    Buffer.from([NESTED.length, 0x00]),
    Buffer.from(NESTED, "ascii"),
  ]);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0xfffe, 0);
  header.writeUInt16LE(0xe000, 2);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
})();

const nameEl = { tag: "00100010", vr: "PN" as const, value: ascii("ROOT^PATIENT") };
const creatorEl = { tag: "00090010", vr: "LO" as const, value: ascii("ACME") };

const acmeOb = defineProfile({
  name: "acme-ob",
  description: "probe",
  privateTags: { ACME: { "0009XX01": { vr: "OB", keyword: "AcmeBlob", name: "Acme Blob" } } },
});
const acmeSq = defineProfile({
  name: "acme-sq",
  description: "probe",
  privateTags: { ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } } },
});

const results: string[] = [];
function probe(name: string, fn: () => void): void {
  try {
    fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}\n      ${(err as Error).message.split("\n").join("\n      ")}`);
  }
}

// ---------------------------------------------------------------------------
// P1. The `DeidentifyReport.unauditableSequences` docstring claim, measured.
// ---------------------------------------------------------------------------
probe("P1 unauditableSequences is EMPTY on a well-formed vouched-for file", () => {
  // Explicit VR LE, honest Value Length, sender wrote OB, profile declares SQ.
  // Nothing about this file is malformed: the parse says nothing and a strict
  // parse does not throw.
  const buf = buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [nameEl, creatorEl, { tag: PRIVATE_TAG, vr: "OB", value: itemStream }],
  });
  const ds = parseDicom(buf, { profile: acmeSq });
  assert.deepEqual(
    ds.warnings.map((w) => w.code),
    [],
    "precondition: the file is conformant, so the parse says nothing",
  );
  assert.doesNotThrow(
    () => parseDicom(buf, { profile: acmeSq, strict: true }),
    "precondition: a strict parse accepts it",
  );

  const { report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acmeSq });
  // src/deident/types.ts on DeidentifyReport.unauditableSequences:
  //   "Empty on a well-formed file, including one whose private attributes a
  //    profile vouches for. It stopped being populated by ordinary conformant
  //    files when the retained class left it."
  assert.deepEqual(
    report.unauditableSequences,
    [],
    `docstring says empty on a well-formed file; got ${JSON.stringify(report.unauditableSequences)}`,
  );
});

// ---------------------------------------------------------------------------
// P2. AC1/AC4/AC5 at depth, on bytes, with the source object as the control.
// ---------------------------------------------------------------------------
probe("P2 the nested Patient's Name is gone from the emitted bytes two Data Sets down", () => {
  const buf = buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [
      nameEl,
      {
        tag: "00081115",
        items: [{ elements: [creatorEl, { tag: PRIVATE_TAG, vr: "OB", value: itemStream }] }],
      },
    ] as never,
  });
  const ds = parseDicom(buf, { profile: acmeOb });
  // Non-vacuity: the payload really is on the wire before the call.
  assert.ok(serializeDicom(ds).toString("latin1").includes(NESTED));

  const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acmeOb });
  assert.equal(dataset.get("00081115")?.items?.[0]?.has(PRIVATE_TAG), false);
  assert.ok(!serializeDicom(dataset).toString("latin1").includes(NESTED), "nested name in bytes");
  assert.deepEqual(report.unenumerablePrivateRemovals, [
    { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable", contextPath: ["00081115[0]"] },
  ]);
  assert.equal(dataset.get("00120062")?.rawBytes.toString("latin1").trimEnd(), "YES");
  // Control: the source object is untouched, so "not in the output" is what
  // deidentify did rather than what the fixture held.
  assert.ok(serializeDicom(ds).toString("latin1").includes(NESTED));
});

// ---------------------------------------------------------------------------
// P3. AC3 non-regression: an enumerated, vouched-for value is retained.
// ---------------------------------------------------------------------------
probe(
  "P3 a vouched private SQ that parses cleanly keeps its attribute and its non-PHI content",
  () => {
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        creatorEl,
        {
          tag: PRIVATE_TAG,
          items: [
            {
              elements: [
                { tag: "00100010", vr: "PN", value: ascii(NESTED) },
                { tag: "00080060", vr: "CS", value: ascii("MR") },
              ],
            },
          ],
        },
      ] as never,
    });
    const ds = parseDicom(buf, { profile: acmeSq });
    const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acmeSq });
    assert.equal(
      dataset.get(PRIVATE_TAG)?.items?.length,
      1,
      "the attribute survives as an attribute",
    );
    assert.equal(
      dataset.get(PRIVATE_TAG)?.items?.[0]?.get("00080060")?.rawBytes.toString("latin1").trim(),
      "MR",
      "the non-PHI element inside survives the descent",
    );
    assert.ok(!serializeDicom(dataset).toString("latin1").includes(NESTED));
    assert.deepEqual(report.unenumerablePrivateRemovals, []);
    assert.equal(dataset.get("00090010")?.rawBytes.toString("latin1").trim(), "ACME");
  },
);

// ---------------------------------------------------------------------------
// P4. AC9 idempotence over a mixed file.
// ---------------------------------------------------------------------------
probe("P4 a second pass removes nothing further and records nothing further", () => {
  const buf = buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [
      nameEl,
      creatorEl,
      { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
      { tag: "00091002", vr: "OB", value: Buffer.alloc(0) },
    ],
  });
  const opts = { retain: ["RetainSafePrivate" as const], profile: acmeOb };
  const first = deidentify(parseDicom(buf, { profile: acmeOb }), opts);
  const second = deidentify(first.dataset, opts);
  assert.deepEqual(second.report.unenumerablePrivateRemovals, []);
  assert.deepEqual(second.report.removedPrivateTags, []);
  assert.ok(serializeDicom(second.dataset).equals(serializeDicom(first.dataset)));
});

// ---------------------------------------------------------------------------
// P5. AC12: option off / profile absent removes every private attribute.
// ---------------------------------------------------------------------------
probe(
  "P5 option off and profile absent both remove every private attribute, recording nothing",
  () => {
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [nameEl, creatorEl, { tag: PRIVATE_TAG, vr: "OB", value: itemStream }],
    });
    const ds = parseDicom(buf, { profile: acmeOb });
    for (const opts of [{ profile: acmeOb }, { retain: ["RetainSafePrivate" as const] }]) {
      const { dataset, report } = deidentify(ds, opts);
      assert.equal(dataset.has(PRIVATE_TAG), false);
      assert.equal(dataset.has("00090010"), false);
      assert.deepEqual(report.unenumerablePrivateRemovals, []);
      assert.ok(!serializeDicom(dataset).toString("latin1").includes(NESTED));
    }
  },
);

// ---------------------------------------------------------------------------
// P6. Explicit VR BE: the same rule on the third transfer syntax the
//     reservation suite exercises but the flipped matrix does not.
// ---------------------------------------------------------------------------
probe("P6 Explicit VR BE removes an unenumerated vouched scalar and keeps a walked SQ", () => {
  const scalar = buildDicom({
    transferSyntax: EXPLICIT_BE,
    elements: [nameEl, creatorEl, { tag: PRIVATE_TAG, vr: "OB", value: ascii("VENDOR-SCALAR") }],
  });
  const outScalar = deidentify(parseDicom(scalar, { profile: acmeOb }), {
    retain: ["RetainSafePrivate"],
    profile: acmeOb,
  });
  assert.equal(outScalar.dataset.has(PRIVATE_TAG), false, "BE: the scalar is removed");
  assert.deepEqual(outScalar.report.unenumerablePrivateRemovals, [
    { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
  ]);
  assert.ok(!serializeDicom(outScalar.dataset).toString("latin1").includes("VENDOR-SCALAR"));

  const walked = buildDicom({
    transferSyntax: EXPLICIT_BE,
    elements: [
      nameEl,
      creatorEl,
      {
        tag: PRIVATE_TAG,
        items: [{ elements: [{ tag: "00080060", vr: "CS", value: ascii("MR") }] }],
      },
    ] as never,
  });
  const outWalked = deidentify(parseDicom(walked, { profile: acmeSq }), {
    retain: ["RetainSafePrivate"],
    profile: acmeSq,
  });
  assert.equal(outWalked.dataset.get(PRIVATE_TAG)?.items?.length, 1, "BE: the walked SQ is kept");
  assert.deepEqual(outWalked.report.unenumerablePrivateRemovals, []);
});

// ---------------------------------------------------------------------------
// P7. AC4 per instance in the sharper arrangement: the SAME private tag in two
//     ITEMS of one sequence, both unenumerable, both name-bearing.
// ---------------------------------------------------------------------------
probe("P7 two items of one sequence are judged and recorded separately", () => {
  const buf = buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [
      nameEl,
      {
        tag: "00081115",
        items: [
          { elements: [creatorEl, { tag: PRIVATE_TAG, vr: "OB", value: itemStream }] },
          { elements: [creatorEl, { tag: PRIVATE_TAG, vr: "OB", value: itemStream }] },
        ],
      },
    ] as never,
  });
  const ds = parseDicom(buf, { profile: acmeOb });
  assert.equal(ds.get("00081115")?.items?.length, 2, "precondition: two items on the wire");
  const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acmeOb });
  assert.equal(dataset.get("00081115")?.items?.[0]?.has(PRIVATE_TAG), false);
  assert.equal(dataset.get("00081115")?.items?.[1]?.has(PRIVATE_TAG), false);
  assert.ok(!serializeDicom(dataset).toString("latin1").includes(NESTED));
  assert.deepEqual(report.unenumerablePrivateRemovals, [
    { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable", contextPath: ["00081115[0]"] },
    { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable", contextPath: ["00081115[1]"] },
  ]);
});

// ---------------------------------------------------------------------------
// P8. AC4's other half with the RETAINED instance at depth: a removed root
//     instance leaves a zero-length sibling inside an item alone.
// ---------------------------------------------------------------------------
probe("P8 a removed root instance leaves a zero-length sibling inside an item alone", () => {
  const buf = buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [
      nameEl,
      creatorEl,
      { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
      {
        tag: "00081115",
        items: [{ elements: [creatorEl, { tag: PRIVATE_TAG, vr: "OB", value: Buffer.alloc(0) }] }],
      },
    ] as never,
  });
  const ds = parseDicom(buf, { profile: acmeOb });
  const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acmeOb });
  assert.equal(dataset.has(PRIVATE_TAG), false, "the root instance is removed");
  assert.equal(
    dataset.get("00081115")?.items?.[0]?.get(PRIVATE_TAG)?.rawBytes.length,
    0,
    "the item's zero-length sibling survives",
  );
  assert.ok(!serializeDicom(dataset).toString("latin1").includes(NESTED));
  assert.deepEqual(report.unenumerablePrivateRemovals, [
    { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
  ]);
});

for (const line of results) console.log(line);
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;

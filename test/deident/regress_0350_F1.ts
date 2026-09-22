/**
 * S0350-dicom-6 impl-gate finding F1, as a runnable check.
 *
 * The change makes a private value the FILE's own (0008,0300) declaration names
 * safe reach de-identified output. Five released surfaces still state the
 * opposite, unqualified, and one of them is a public export's JSDoc that ships
 * in `dist/index.d.ts`.
 *
 * Run from the dicom checkout:
 *   pnpm exec tsx test/deident/regress_0350_F1.ts
 *
 * It exits non-zero while a surface that says an ordinary vendor scalar under an
 * ordinary string VR is removed, or that the enumeration set has exactly three
 * members, is still present beside the shipped behaviour that contradicts it.
 */

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import type { DeidentifyOptions } from "../../src/deident/types.js";
import type { BuildDicomElement, BuildDicomSqItem } from "../helpers/build-dicom.js";
import { buildDicom } from "../helpers/build-dicom.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const SAFE_CREATOR = "ACME SAFE BLOCK";
/** An ordinary vendor scalar under an ordinary string VR, non-zero-length, not a Private Creator. */
const ORDINARY_SCALAR = "acme-pitch-1.5";

function ascii(value: string): Buffer {
  return Buffer.from(value.length % 2 === 0 ? value : `${value} `, "ascii");
}

function unsignedShorts(...values: readonly number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => {
    buf.writeUInt16LE(value, index * 2);
  });
  return buf;
}

function declItem(group: number, creator: string, status: string): BuildDicomSqItem {
  const elements: BuildDicomElement[] = [
    { tag: "00080301", vr: "US", value: unsignedShorts(group) },
    { tag: "00080302", vr: "LO", value: ascii(creator) },
    { tag: "00080303", vr: "CS", value: ascii(status) },
  ];
  return { elements };
}

/** Markdown emphasis, code fencing and hard wraps are formatting, not content. */
function plain(text: string): string {
  return text.replaceAll("*", "").replaceAll("`", "").replaceAll(/\s+/gu, " ");
}

// ---------------------------------------------------------------------------
// 1. The shipped behaviour.
// ---------------------------------------------------------------------------

const buf = buildDicom({
  transferSyntax: EXPLICIT_LE,
  elements: [
    { tag: "00080300", items: [declItem(0x0009, SAFE_CREATOR, "SAFE")] },
    { tag: "00090010", vr: "LO", value: ascii(SAFE_CREATOR) },
    { tag: "00091001", vr: "LO", value: ascii(ORDINARY_SCALAR) },
  ],
});
const options: DeidentifyOptions = { retain: ["RetainSafePrivate"] };
const { dataset, report } = deidentify(parseDicom(buf), options);
const output = serializeDicom(dataset);

const retained = output.includes(ascii(ORDINARY_SCALAR));
const recordedAsRemoved = report.unenumerablePrivateRemovals.map((r) => r.tag);

console.log("MEASURED, on this branch, with no caller profile:");
console.log(`  (0009,1001) LO "${ORDINARY_SCALAR}" in de-identified output : ${String(retained)}`);
console.log(
  `  report.unenumerablePrivateRemovals                          : ${JSON.stringify(recordedAsRemoved)}`,
);
console.log(
  `  report.removedPrivateTags                                   : ${JSON.stringify(report.removedPrivateTags)}`,
);
console.log("");

// ---------------------------------------------------------------------------
// 2. The surfaces that still say the opposite.
// ---------------------------------------------------------------------------

const COLLAPSE = "ordinary vendor scalar under an ordinary string VR is removed";

const SITES: readonly { readonly file: string; readonly claim: string }[] = [
  {
    file: "README.md",
    claim: "So the retained class collapses to those three, and an " + COLLAPSE,
  },
  { file: "docs-content/troubleshooting.md", claim: "Enumeration is one of exactly three things" },
  { file: "docs-content/troubleshooting.md", claim: COLLAPSE },
  { file: "docs-content/limitations.md", claim: COLLAPSE },
  {
    file: "src/deident/types.ts",
    claim:
      "With RetainSafePrivate plus a Profile, exactly three classes of private value now reach the output",
  },
  { file: "src/deident/types.ts", claim: "An " + COLLAPSE },
  {
    file: "src/deident/deidentify.ts",
    claim: "private value beyond the three classes named on",
  },
  {
    file: "src/deident/deidentify.ts",
    claim:
      "not one of the three classes below, so an ordinary vendor scalar under an ordinary string VR is now removed",
  },
];

let standing = 0;
for (const site of SITES) {
  const text = plain(readFileSync(join(REPO_ROOT, site.file), "utf8"));
  const present = text.includes(site.claim);
  if (present) standing += 1;
  console.log(`${present ? "STANDING" : "corrected"}  ${site.file}  ${JSON.stringify(site.claim)}`);
}

console.log("");
if (retained && standing > 0) {
  console.log(
    `FAIL  the declaration route retains an ordinary vendor scalar under an ordinary string VR, and ${String(standing)} released surface claim(s) still say it is removed.`,
  );
  process.exitCode = 1;
} else {
  console.log("PASS  no released surface contradicts the shipped behaviour.");
}

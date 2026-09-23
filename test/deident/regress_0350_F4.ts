/**
 * S0350-dicom-6 impl-gate finding F4, as a runnable check.
 *
 * `docs-content/troubleshooting.md` still tells a consumer, in the remedy cell
 * for `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE`, that "everything else
 * private that a profile vouched for is now removed, an ordinary scalar under
 * an ordinary string VR included". After this change that is false whenever the
 * file's own (0008,0300) declaration names the block safe: the declaration is
 * consulted inside `keepRetainedPrivate` ahead of the unenumerable-removal rule,
 * so a profile-vouched ordinary scalar in a declared-`SAFE` block reaches
 * de-identified output.
 *
 * Run from the dicom checkout:
 *   pnpm exec tsx test/deident/regress_0350_F4.ts
 *
 * It exits non-zero while that sentence is still on the released page beside the
 * shipped behaviour that contradicts it. The control run below is what keeps the
 * measurement from being vacuous: with the same profile and no declaration, the
 * same scalar IS removed and recorded, which is the case the sentence describes.
 */

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defineProfile, deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import type { DeidentifyOptions } from "../../src/deident/types.js";
import type {
  BuildDicomElement,
  BuildDicomSqElement,
  BuildDicomSqItem,
} from "../helpers/build-dicom.js";
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

/** The private block, with or without the file's own declaration ahead of it. */
function fixture(declared: boolean): Buffer {
  const block: BuildDicomElement[] = [
    { tag: "00090010", vr: "LO", value: ascii(SAFE_CREATOR) },
    { tag: "00091001", vr: "LO", value: ascii(ORDINARY_SCALAR) },
  ];
  const decl: BuildDicomSqElement[] = declared
    ? [{ tag: "00080300", items: [declItem(0x0009, SAFE_CREATOR, "SAFE")] }]
    : [];
  return buildDicom({ transferSyntax: EXPLICIT_LE, elements: [...decl, ...block] });
}

/** Markdown emphasis, code fencing and hard wraps are formatting, not content. */
function plain(text: string): string {
  return text.replaceAll("*", "").replaceAll("`", "").replaceAll(/\s+/gu, " ");
}

// ---------------------------------------------------------------------------
// 1. The shipped behaviour, WITH the profile the sentence is about.
// ---------------------------------------------------------------------------

/** The profile vouches for (0009,1001), which is exactly the sentence's subject. */
const profile = defineProfile({
  name: "acme",
  privateTags: {
    [SAFE_CREATOR]: { "0009XX01": { vr: "LO", keyword: "AcmePitch", name: "Acme Pitch" } },
  },
});
const options: DeidentifyOptions = { retain: ["RetainSafePrivate"], profile };

const declaredRun = deidentify(parseDicom(fixture(true)), options);
const declaredOut = serializeDicom(declaredRun.dataset);
const retainedWithDeclaration = declaredOut.includes(ascii(ORDINARY_SCALAR));

const controlRun = deidentify(parseDicom(fixture(false)), options);
const controlOut = serializeDicom(controlRun.dataset);
const retainedWithoutDeclaration = controlOut.includes(ascii(ORDINARY_SCALAR));

console.log("MEASURED, on this branch, WITH a profile that vouches for (0009,1001):");
console.log(
  `  declaration SAFE  -> (0009,1001) LO "${ORDINARY_SCALAR}" in output : ${String(retainedWithDeclaration)}`,
);
console.log(
  `  declaration SAFE  -> report.unenumerablePrivateRemovals            : ${JSON.stringify(declaredRun.report.unenumerablePrivateRemovals.map((r) => r.tag))}`,
);
console.log(
  `  no declaration    -> (0009,1001) LO "${ORDINARY_SCALAR}" in output : ${String(retainedWithoutDeclaration)}`,
);
console.log(
  `  no declaration    -> report.unenumerablePrivateRemovals            : ${JSON.stringify(controlRun.report.unenumerablePrivateRemovals.map((r) => r.tag))}`,
);
console.log("");

// ---------------------------------------------------------------------------
// 2. The released page that still says the opposite.
// ---------------------------------------------------------------------------

const CLAIM =
  "everything else private that a profile vouched for is now removed, an ordinary scalar under an ordinary string VR included";
const PAGE = "docs-content/troubleshooting.md";

const pageText = plain(readFileSync(join(REPO_ROOT, PAGE), "utf8"));
const standing = pageText.includes(CLAIM);
console.log(`${standing ? "STANDING" : "corrected"}  ${PAGE}  ${JSON.stringify(CLAIM)}`);
console.log("");

// ---------------------------------------------------------------------------
// 3. Non-vacuity, then the verdict.
// ---------------------------------------------------------------------------

if (retainedWithoutDeclaration) {
  console.log(
    "INCONCLUSIVE  the control kept the scalar too, so this fixture does not isolate the declaration.",
  );
  process.exitCode = 2;
} else if (retainedWithDeclaration && standing) {
  console.log(
    `FAIL  a profile-vouched ordinary vendor scalar under an ordinary string VR is RETAINED when the file's own declaration names its block safe, and ${PAGE} still says every such value is now removed.`,
  );
  process.exitCode = 1;
} else {
  console.log("PASS  no released surface contradicts the shipped behaviour on this point.");
}

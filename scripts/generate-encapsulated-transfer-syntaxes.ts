#!/usr/bin/env tsx
//
// PS3.5 section A.4 encapsulation Transfer Syntaxes -> committed TS module.
//
// Runs via `pnpm gen:encapsulated-transfer-syntaxes` (devDep `tsx`). Writes:
//   - src/dictionary/generated/encapsulated-transfer-syntaxes.ts
//
// WHY THIS GENERATOR EXISTS
//
// PS3.5 section A.4 is the one place the standard says which Transfer Syntaxes
// encapsulate encoded Pixel Data, and its opening rule applies to every one of
// them: the Data Set is Explicit VR Little Endian and only Pixel Data
// (7FE0,0010) is encapsulated. `parseDicom` dispatches each of those UIDs to its
// Explicit VR Little Endian reader, so which UIDs are on that list decides which
// objects are read at all. A list typed into the source is a claim; this
// generator reads it out of the SHA-pinned normative document the repeating-group
// bound is already read out of.
//
// HOW THE SECTION IS FOUND
//
// Never first-match. Every occurrence of `xml:id="sect_A.4"` is collected and
// exactly one is required; zero and two are both refusals. The section is then
// sliced to its MATCHING close tag, counting the nested A.4.1 to A.4.x
// subsections, and its title is checked. Inside it, UIDs are matched on the
// `1.2.840.10008.1.2` Transfer Syntax arc after removing U+200B ZERO WIDTH SPACE,
// which PS3.5's DocBook uses as a line-break hint inside long UIDs elsewhere in
// the same document.
//
// THE CROSS-CHECK
//
// Every UID read out of section A.4 must be a non-retired `TransferSyntax` row of
// the generated PS3.6 registry (`src/dictionary/generated/uids.ts`, written by
// `gen:dictionary`, which `gen:all` runs first). A UID PS3.6 does not register,
// registers as something else, or retires, fails the run rather than being
// dropped or kept silently.
//
// There is deliberately NO staleness clock (see vendor/nema/README.md). What CI
// gates is byte-identical regen, offline and deterministic.
//
// Output is deterministic (no wall-clock, sorted by UID code units, frozen).

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { UIDS } from "../src/dictionary/generated/uids.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PART05_ROOT = join(REPO_ROOT, "vendor", "nema", "part05");

const SECTION_ID = 'xml:id="sect_A.4"';
const SECTION_TITLE = "Transfer Syntaxes for Encapsulation of Encoded Pixel Data";
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const TRANSFER_SYNTAX_UID = /1\.2\.840\.10008\.1\.2(?:\.[0-9]+)*/g;

function fail(message: string): never {
  console.error("generate-encapsulated-transfer-syntaxes: " + message);
  process.exit(1);
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function readPinnedPart05(): { xml: string; sha: string } {
  const shaFile = join(PART05_ROOT, "SHA.txt");
  let sha: string;
  try {
    sha = (readFileSync(shaFile, "utf8").trim().split(/\s+/)[0] ?? "").toLowerCase();
  } catch (err) {
    fail("cannot read " + shaFile + ": " + String(err));
  }
  if (!/^[0-9a-f]{64}$/.test(sha)) {
    fail("part05/SHA.txt must contain a 64-char hex SHA-256 (got: '" + sha + "')");
  }
  const path = join(PART05_ROOT, sha, "part05.xml");
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch (err) {
    fail("cannot read " + path + ": " + String(err));
  }
  const actual = sha256(buf);
  if (actual !== sha) {
    fail(
      "PS3.5 pin mismatch:\n  pinned:   " +
        sha +
        "\n  on disk:  " +
        actual +
        "\n  file:     " +
        path +
        "\nRe-fetch the document and update SHA.txt, or restore the pinned bytes.",
    );
  }
  return { xml: buf.toString("utf8"), sha };
}

/** Pull the edition out of `<subtitle>DICOM PS3.5 2026c - Data Structures ...</subtitle>`. */
function part05Edition(xml: string): string {
  const m = /<subtitle>\s*DICOM PS3\.5 ([0-9]{4}[a-z]?) - [^<]*<\/subtitle>/.exec(xml);
  if (!m?.[1]) {
    fail(
      "part05.xml: cannot find the `<subtitle>DICOM PS3.5 <edition> - ...</subtitle>` line. " +
        "Refusing to generate from a document that does not identify itself as PS3.5.",
    );
  }
  return m[1];
}

/** Slice section A.4, nested subsections included, after requiring exactly one candidate. */
function sectionA4(xml: string): string {
  const hits: number[] = [];
  for (let at = xml.indexOf(SECTION_ID); at >= 0; at = xml.indexOf(SECTION_ID, at + 1)) {
    hits.push(at);
  }
  if (hits.length !== 1 || hits[0] === undefined) {
    fail(
      "part05.xml: expected exactly one section carrying " +
        SECTION_ID +
        ", found " +
        String(hits.length) +
        ". Refusing to pick one.",
    );
  }
  const open = xml.lastIndexOf("<section", hits[0]);
  if (open < 0) fail("part05.xml: " + SECTION_ID + " is not on a <section> element.");
  const tags = /<section\b|<\/section>/g;
  tags.lastIndex = open;
  let depth = 0;
  let end = -1;
  for (let m = tags.exec(xml); m !== null; m = tags.exec(xml)) {
    depth += m[0] === "</section>" ? -1 : 1;
    if (depth === 0) {
      end = m.index + m[0].length;
      break;
    }
  }
  if (end < 0) fail("part05.xml: section A.4 has no matching </section>.");
  const frag = xml.slice(open, end);
  const title = /^<section\b[^>]*>\s*<title>([^<]*)<\/title>/.exec(frag);
  if (title?.[1]?.trim() !== SECTION_TITLE) {
    fail(
      "part05.xml: section A.4 is not titled '" +
        SECTION_TITLE +
        "'. Refusing to read a Transfer Syntax list from it.",
    );
  }
  return frag;
}

function emit(
  uids: readonly { uid: string; name: string }[],
  meta: { edition: string; sha: string },
): string {
  const lines: string[] = [];
  lines.push("/* eslint-disable */");
  lines.push(
    "// AUTO-GENERATED by scripts/generate-encapsulated-transfer-syntaxes.ts -- DO NOT EDIT BY HAND.",
  );
  lines.push("// Regen: pnpm gen:encapsulated-transfer-syntaxes");
  lines.push("//");
  lines.push("// Normative source, pinned by SHA-256 and re-hashed before use:");
  lines.push(
    "//   NEMA DICOM PS3.5 " + meta.edition + " DocBook, section A.4 (" + SECTION_TITLE + ").",
  );
  lines.push("//     vendor/nema/part05/<sha>/part05.xml -> " + meta.sha);
  lines.push("//");
  lines.push("// Every Transfer Syntax UID section A.4 names, each checked against the");
  lines.push("// generated PS3.6 registry (uids.ts) as a non-retired TransferSyntax row.");
  lines.push("// The name beside each UID is that registry's.");
  lines.push("");
  lines.push("/** The PS3.5 edition {@link ENCAPSULATED_TRANSFER_SYNTAX_UIDS} was read from. */");
  lines.push(
    "export const ENCAPSULATED_TRANSFER_SYNTAX_EDITION = " + JSON.stringify(meta.edition) + ";",
  );
  lines.push("");
  lines.push("/**");
  lines.push(" * The Transfer Syntax UIDs PS3.5 section A.4 names: the Data Set is Explicit VR");
  lines.push(" * Little Endian and only Pixel Data (7FE0,0010) is encapsulated. Sorted by code");
  lines.push(" * units.");
  lines.push(" *");
  lines.push(" * @example");
  lines.push(" * ```ts");
  lines.push(' * ENCAPSULATED_TRANSFER_SYNTAX_UIDS.includes("1.2.840.10008.1.2.4.50"); // true');
  lines.push(" * ```");
  lines.push(" */");
  lines.push("export const ENCAPSULATED_TRANSFER_SYNTAX_UIDS: readonly string[] = Object.freeze([");
  for (const { uid, name } of uids) {
    lines.push("  " + JSON.stringify(uid) + ", // " + name);
  }
  lines.push("]);");
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const { xml, sha } = readPinnedPart05();
  const edition = part05Edition(xml);
  const section = sectionA4(xml).split(ZERO_WIDTH_SPACE).join("");

  const found = [...new Set(section.match(TRANSFER_SYNTAX_UID) ?? [])].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  if (found.length === 0) fail("part05.xml: section A.4 names no Transfer Syntax UID.");

  const rows: { uid: string; name: string }[] = [];
  for (const uid of found) {
    const row = UIDS[uid];
    if (row === undefined) {
      fail("section A.4 names " + uid + ", which the generated PS3.6 registry does not carry.");
    }
    if (row.type !== "TransferSyntax") {
      fail("section A.4 names " + uid + ", which PS3.6 registers as " + row.type + ".");
    }
    if (row.retired) {
      fail("section A.4 names " + uid + ", which PS3.6 marks retired.");
    }
    rows.push({ uid, name: row.name });
  }

  console.log(
    "[gen:encapsulated-transfer-syntaxes] PS3.5 " +
      edition +
      " (sha256 " +
      sha.slice(0, 12) +
      "): section A.4 names " +
      String(rows.length) +
      " Transfer Syntax UIDs, every one a non-retired PS3.6 row",
  );

  const outDir = join(REPO_ROOT, "src", "dictionary", "generated");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "encapsulated-transfer-syntaxes.ts");
  writeFileSync(outPath, emit(rows, { edition, sha }), "utf8");
  console.log("[gen:encapsulated-transfer-syntaxes] done - wrote " + outPath);
}

main();

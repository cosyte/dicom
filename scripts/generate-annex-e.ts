#!/usr/bin/env tsx
//
// Phase 1 Plan 03 generator: PS3.15 Annex E action table -> committed TS module.
//
// Runs via `pnpm gen:annex-e` (devDep `tsx`). Writes:
//   - src/dictionary/generated/annex-e.ts  (Tag -> AnnexEAction map)
//
// Input source resolution: see scripts/_annex-e-discovery.md.
//   - Innolitics path:   vendor/innolitics/<short-sha>/confidentiality_profile_attributes.json
//   - NEMA fallback:     vendor/nema/<sha-256>/part15-annex-e.xml
//
// The path is derived from `vendor/innolitics/SHA.txt` (Innolitics path) or
// `vendor/nema/SHA.txt` (NEMA fallback). The discovery doc records which path is
// active; the generator branches on the doc's "Decision:" line. This keeps
// discovery + generator decisions in lockstep.
//
// Output is deterministic (no wall-clock, sorted by tag, frozen literals). The
// DICT-05-style byte-identical regen gate is enforced by plan 05's CI.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ----------------------------------------------------------------------------
// Closed unions -- must match src/dictionary/annex-e.ts exactly.
// ----------------------------------------------------------------------------

const ACTION_CODES = new Set([
  "D",
  "Z",
  "X",
  "K",
  "C",
  "U",
  "Z/D",
  "X/Z",
  "X/D",
  "X/Z/D",
  "X/Z/U*",
  "C/X",
]);

// Innolitics field name -> AnnexEOption name (PS3.15 Annex E Table E.1-1 columns).
// CleanPixelData (E.3.1) and CleanRecognizableVisual (E.3.2) are pixel-level options
// with no per-attribute overrides in Table E.1-1; they remain in the AnnexEOption
// union but never appear in the generated optionSet keys.
const INNOLITICS_FIELD_TO_OPTION: Readonly<Record<string, string>> = Object.freeze({
  cleanGraphOpt: "CleanGraphics",
  cleanStructContOpt: "CleanStructuredContent",
  cleanDescOpt: "CleanDescriptors",
  rtnLongFullDatesOpt: "RetainLongitudinalTemporal",
  // rtnLongModifDatesOpt collapsed into RetainLongitudinalTemporal -- see discovery doc.
  rtnPatCharsOpt: "RetainPatientCharacteristics",
  rtnDevIdOpt: "RetainDeviceIdentity",
  rtnUIDsOpt: "RetainUIDs",
  rtnSafePrivOpt: "RetainSafePrivate",
  rtnInstIdOpt: "RetainInstitutionIdentity",
});

// ----------------------------------------------------------------------------
// Discovery-doc parsing.
// ----------------------------------------------------------------------------

interface Discovery {
  decision: "Innolitics-machine-readable" | "NEMA-DocBook-fallback";
  pinnedSha: string;
  shortSha: string;
  inputPath: string;
  sourceLabel: string;
}

function parseDiscovery(): Discovery {
  const discoveryPath = join(REPO_ROOT, "scripts", "_annex-e-discovery.md");
  let text: string;
  try {
    text = readFileSync(discoveryPath, "utf8");
  } catch (err) {
    console.error("generate-annex-e: cannot read " + discoveryPath + ": " + String(err));
    process.exit(1);
  }

  const decisionMatch =
    /\*\*Decision:\*\*\s*`?(Innolitics-machine-readable|NEMA-DocBook-fallback)`?/.exec(text);
  if (!decisionMatch) {
    console.error("generate-annex-e: cannot find Decision line in scripts/_annex-e-discovery.md");
    process.exit(1);
  }
  const decision = decisionMatch[1] as Discovery["decision"];

  if (decision === "Innolitics-machine-readable") {
    const shaPath = join(REPO_ROOT, "vendor", "innolitics", "SHA.txt");
    let pinnedSha: string;
    try {
      pinnedSha = readFileSync(shaPath, "utf8").trim().split(/\s+/)[0] ?? "";
    } catch (err) {
      console.error(
        "generate-annex-e: cannot read " + shaPath + " (plan 01-02 owns this file): " + String(err),
      );
      process.exit(1);
    }
    if (!/^[0-9a-f]{40}$/i.test(pinnedSha)) {
      console.error(
        "generate-annex-e: vendor/innolitics/SHA.txt does not contain a 40-char hex SHA-1 (got: '" +
          pinnedSha +
          "')",
      );
      process.exit(1);
    }
    const shortSha = pinnedSha.toLowerCase().slice(0, 7);
    const inputPath = join(
      REPO_ROOT,
      "vendor",
      "innolitics",
      shortSha,
      "confidentiality_profile_attributes.json",
    );
    return {
      decision,
      pinnedSha: pinnedSha.toLowerCase(),
      shortSha,
      inputPath,
      sourceLabel: "innolitics/dicom-standard@" + shortSha,
    };
  }

  const shaPath = join(REPO_ROOT, "vendor", "nema", "SHA.txt");
  let pinnedSha: string;
  try {
    pinnedSha = readFileSync(shaPath, "utf8").trim().split(/\s+/)[0] ?? "";
  } catch (err) {
    console.error("generate-annex-e: cannot read " + shaPath + ": " + String(err));
    process.exit(1);
  }
  if (!/^[0-9a-f]{64}$/i.test(pinnedSha)) {
    console.error(
      "generate-annex-e: vendor/nema/SHA.txt must contain a 64-char hex SHA-256 for the NEMA fallback (got: '" +
        pinnedSha +
        "')",
    );
    process.exit(1);
  }
  const inputPath = join(
    REPO_ROOT,
    "vendor",
    "nema",
    pinnedSha.toLowerCase(),
    "part15-annex-e.xml",
  );
  return {
    decision,
    pinnedSha: pinnedSha.toLowerCase(),
    shortSha: pinnedSha.toLowerCase(),
    inputPath,
    sourceLabel: "dicom.nema.org/part15.xml@sha256:" + pinnedSha.toLowerCase().slice(0, 12),
  };
}

// ----------------------------------------------------------------------------
// Innolitics JSON parser.
// ----------------------------------------------------------------------------

interface RawInnoliticsEntry {
  readonly id: string;
  readonly tag: string;
  readonly name: string;
  readonly basicProfile?: string;
}

interface NormalizedEntry {
  readonly tag: string;
  readonly keyword: string;
  readonly basicProfile: string;
  readonly optionSet: ReadonlyArray<readonly [string, string]>;
}

function normalizeTag(rawId: string): string {
  if (typeof rawId !== "string") return "";
  if (rawId.includes(":")) return "";
  if (!/^[0-9a-f]{8}$/i.test(rawId)) return "";
  return rawId.toUpperCase();
}

function parseInnolitics(jsonText: string): NormalizedEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    console.error("generate-annex-e: input JSON parse failed: " + String(err));
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    console.error("generate-annex-e: expected top-level JSON array");
    process.exit(1);
  }

  const out: NormalizedEntry[] = [];
  for (const entry of raw as RawInnoliticsEntry[]) {
    if (entry === null || typeof entry !== "object") continue;
    const tag = normalizeTag(entry.id);
    if (tag.length === 0) continue;

    const basicProfile = entry.basicProfile;
    if (typeof basicProfile !== "string" || basicProfile.length === 0) {
      console.error(
        "generate-annex-e: entry " +
          entry.id +
          " (" +
          String(entry.name) +
          ") missing basicProfile",
      );
      process.exit(1);
    }
    if (!ACTION_CODES.has(basicProfile)) {
      console.error(
        "generate-annex-e: entry " +
          entry.id +
          " has unknown basicProfile action code '" +
          basicProfile +
          "'",
      );
      process.exit(1);
    }

    const optionPairs: Array<[string, string]> = [];
    for (const [innoField, optionName] of Object.entries(INNOLITICS_FIELD_TO_OPTION)) {
      const v = (entry as unknown as Record<string, unknown>)[innoField];
      if (typeof v !== "string" || v.length === 0) continue;
      if (!ACTION_CODES.has(v)) {
        console.error(
          "generate-annex-e: entry " +
            entry.id +
            " field " +
            innoField +
            " has unknown action code '" +
            v +
            "'",
        );
        process.exit(1);
      }
      optionPairs.push([optionName, v]);
    }
    optionPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    out.push({
      tag,
      keyword: typeof entry.name === "string" ? entry.name : "",
      basicProfile,
      optionSet: optionPairs,
    });
  }

  out.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const seen = new Set<string>();
  for (const e of out) {
    if (seen.has(e.tag)) {
      console.error("generate-annex-e: duplicate tag " + e.tag + " in input");
      process.exit(1);
    }
    seen.add(e.tag);
  }

  return out;
}

// ----------------------------------------------------------------------------
// NEMA DocBook XML fallback (not implemented in v1 -- Innolitics path resolved).
// ----------------------------------------------------------------------------

function parseNemaDocBook(_xmlText: string): NormalizedEntry[] {
  console.error(
    "generate-annex-e: NEMA-DocBook-fallback parser not implemented in v1. " +
      "If Innolitics drops Annex E, implement here per scripts/_annex-e-discovery.md " +
      "and vendor/nema/README.md procedure.",
  );
  process.exit(1);
}

// ----------------------------------------------------------------------------
// Output emission.
// ----------------------------------------------------------------------------

function escapeJsString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    const code = s.charCodeAt(i);
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20) out += "\\u" + code.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out;
}

function emit(entries: ReadonlyArray<NormalizedEntry>, sourceLabel: string): string {
  const lines: string[] = [];
  lines.push("/* eslint-disable */");
  lines.push("// AUTO-GENERATED by scripts/generate-annex-e.ts -- DO NOT EDIT BY HAND.");
  lines.push("// Source: " + sourceLabel);
  lines.push("// Regen: pnpm gen:annex-e");
  lines.push("//");
  lines.push("// PS3.15 Annex E attribute-action table -- Basic Profile + 9 metadata-affecting");
  lines.push("// retention/clean option columns from Table E.1-1. Pixel-level options (E.3.1");
  lines.push("// CleanPixelData, E.3.2 CleanRecognizableVisual) are not represented per-attribute");
  lines.push("// here; Phase 7 handles them in the pixel-decode path.");
  lines.push("");
  lines.push('import type { AnnexEAction } from "../annex-e.js";');
  lines.push("");
  lines.push("export const ANNEX_E: Readonly<Record<string, AnnexEAction>> = Object.freeze({");
  for (const e of entries) {
    const optionSetEntries = e.optionSet.map(
      ([k, v]) => '"' + escapeJsString(k) + '": "' + escapeJsString(v) + '"',
    );
    const optionSetLiteral =
      optionSetEntries.length === 0
        ? "Object.freeze({})"
        : "Object.freeze({ " + optionSetEntries.join(", ") + " })";
    lines.push(
      '  "' +
        e.tag +
        '": Object.freeze({ tag: "' +
        e.tag +
        '", keyword: "' +
        escapeJsString(e.keyword) +
        '", basicProfile: "' +
        escapeJsString(e.basicProfile) +
        '", optionSet: ' +
        optionSetLiteral +
        " }),",
    );
  }
  lines.push("});");
  lines.push("");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Main.
// ----------------------------------------------------------------------------

function main(): void {
  const discovery = parseDiscovery();

  let inputText: string;
  try {
    inputText = readFileSync(discovery.inputPath, "utf8");
  } catch (err) {
    console.error(
      "generate-annex-e: cannot read input file " + discovery.inputPath + ": " + String(err),
    );
    console.error(
      "  Hint: in wave-2 parallel execution, plan 01-02 owns vendor/innolitics/. " +
        "If 01-02 has not yet committed the JSON, the orchestrator's post-merge step " +
        "is responsible for re-running this generator.",
    );
    process.exit(1);
  }

  const entries =
    discovery.decision === "Innolitics-machine-readable"
      ? parseInnolitics(inputText)
      : parseNemaDocBook(inputText);

  if (entries.length < 200) {
    console.error(
      "generate-annex-e: parsed only " +
        String(entries.length) +
        " entries -- expected >= 200 (Annex E covers ~600 attributes). Parser bug?",
    );
    process.exit(1);
  }

  const outDir = join(REPO_ROOT, "src", "dictionary", "generated");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "annex-e.ts");
  writeFileSync(outPath, emit(entries, discovery.sourceLabel), "utf8");

  console.log(
    "generate-annex-e: wrote " +
      String(entries.length) +
      " entries to " +
      outPath +
      " (source: " +
      discovery.sourceLabel +
      ")",
  );
}

main();

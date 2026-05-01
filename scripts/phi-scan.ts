#!/usr/bin/env tsx
/**
 * Phase 1 Plan 04 PHI scanner — TEST-09 CI-scan half.
 *
 * Pure Node. Zero runtime deps. Walks committed/staged DICOM fixtures and
 * non-DICOM data files under `test/fixtures/**` and rejects:
 *   1. PN values not matching the synthetic allow-list (scripts/phi-allow-list.txt)
 *   2. DA / DT values within the last 120 years of TODAY
 *
 * SECURITY: All git invocations use execFileSync with array args. Never any
 * shell-form spawn. The single subprocess this script makes is `git`, called
 * exclusively via array-form arguments.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached --name-only`
 *   --allow-fixture <path>   - bypass for one path; rejected if not logged in phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all test/fixtures/** files in the working tree
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 *
 * D-15 / D-16 / D-17 / TEST-09.
 */

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, extname, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");
const FIXTURE_ROOT = join(REPO_ROOT, "test", "fixtures");
const CUTOFF_YEAR = new Date().getFullYear() - 120;

// Hardcoded PN/DA/DT tags. We intentionally avoid depending on the generated
// Dictionary (which may regenerate within the same CI build). Tags are stored
// as 8-char uppercase hex (group + element concatenated, no comma).
const PN_TAGS = new Set<string>([
  "00100010", // PatientName
  "00080090", // ReferringPhysicianName
  "00081048", // PhysiciansOfRecord
  "00081050", // PerformingPhysicianName
  "00081060", // NameOfPhysiciansReadingStudy
  "00081070", // OperatorsName
  "00101001", // OtherPatientNames
  "00101005", // PatientBirthName
  "00101060", // PatientMotherBirthName
  "0040A123", // PersonName (in content sequences)
]);
const DA_TAGS = new Set<string>([
  "00080020", // StudyDate
  "00080021", // SeriesDate
  "00080022", // AcquisitionDate
  "00080023", // ContentDate
  "00100030", // PatientBirthDate
  "0040A030", // VerificationDateTime (DA half)
]);
const DT_TAGS = new Set<string>([
  "0008002A", // AcquisitionDateTime
  "0040A12C", // (Referenced) DateTime
  "0040A13A", // ReferencedDateTime
]);

// VRs that use the long form length encoding in Explicit VR LE.
// 2 reserved bytes + 4-byte length.
const LONG_FORM_VRS = new Set<string>(["OB", "OW", "OF", "OD", "OL", "SQ", "UT", "UN", "UC", "UR"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  path: string;
  tag: string; // formatted "(gggg,eeee)"
  vr: string;
  offset: number;
  value: string;
  reason: string;
}

interface AllowList {
  pnExact: Set<string>;
  pnPrefix: string[];
  dates: Set<string>;
}

interface Args {
  mode: "all" | "staged" | "paths";
  paths: string[];
  allowFixtures: string[]; // paths bypassed via --allow-fixture
}

class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  let staged = false;
  const paths: string[] = [];
  const allowFixtures: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      // POSIX `--` separator (also forwarded by pnpm). Treat all subsequent
      // args as positional paths, even if they start with `-`.
      for (let j = i + 1; j < argv.length; j += 1) {
        const v = argv[j];
        if (v !== undefined) paths.push(v);
      }
      break;
    } else if (a === "--staged") {
      staged = true;
      i += 1;
    } else if (a === "--allow-fixture") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--allow-fixture requires a path argument");
      }
      allowFixtures.push(next);
      i += 2;
    } else if (a !== undefined && a.startsWith("--")) {
      throw new InvocationError(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      paths.push(a);
      i += 1;
    } else {
      i += 1;
    }
  }

  if (staged && paths.length > 0) {
    throw new InvocationError("--staged cannot be combined with positional paths");
  }

  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (paths.length > 0 || allowFixtures.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths, allowFixtures };
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  const raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  const pnExact = new Set<string>();
  const pnPrefix: string[] = [];
  const dates = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith("DATE:")) {
      dates.add(line.slice("DATE:".length).trim());
      continue;
    }
    if (line.endsWith("^")) {
      pnPrefix.push(line);
    } else {
      pnExact.add(line);
    }
  }
  return { pnExact, pnPrefix, dates };
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) {
    return new Set();
  }
  const raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  const out = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(lineRaw);
    if (m && m[1] !== undefined) {
      out.add(normalizePath(m[1]));
    }
  }
  return out;
}

function normalizePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  const rel = relative(REPO_ROOT, abs);
  // Use forward slashes for stable comparison even on Windows.
  return rel.split(sep).join("/");
}

function validateAllowFixtures(allowFixtures: string[]): void {
  if (allowFixtures.length === 0) return;
  const overrides = loadOverrideLog();
  const missing: string[] = [];
  for (const p of allowFixtures) {
    const norm = normalizePath(p);
    if (!overrides.has(norm)) {
      missing.push(norm);
    }
  }
  if (missing.length > 0) {
    const lines = missing.map((p) => `  - ${p}`).join("\n");
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Target enumeration
// ---------------------------------------------------------------------------

function enumerateAll(): string[] {
  if (!existsSync(FIXTURE_ROOT)) return [];
  const out: string[] = [];
  walk(FIXTURE_ROOT, out);
  return out;
}

function walk(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.isFile()) {
      // Skip README.md files: they're documentation that may legitimately
      // describe synthetic violator values (e.g., this repo's
      // `test/fixtures/phi-scan/README.md` documents the SMITH^JOHN /
      // 20250612 fixtures). Documentation is not a fixture.
      if (e.name.toLowerCase() === "readme.md") continue;
      out.push(full);
    }
  }
}

interface Target {
  path: string; // relative repo path (forward-slash) for reporting
  read: () => Buffer;
}

function buildTargetsForPaths(paths: string[]): Target[] {
  const out: Target[] = [];
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) {
      throw new InvocationError(`File not found: ${p}`);
    }
    const st = statSync(abs);
    if (!st.isFile()) {
      throw new InvocationError(`Not a regular file: ${p}`);
    }
    const rel = normalizePath(abs);
    out.push({
      path: rel,
      read: () => readFileSync(abs),
    });
  }
  return out;
}

function buildTargetsForAll(): Target[] {
  const all = enumerateAll();
  // Filter out gitignored files. Transient fixtures regenerated by tests
  // (e.g., `test/fixtures/phi-scan/*.dcm`) are intentionally gitignored and
  // are NOT in scope for the scanner — only commit-eligible content is.
  // SECURITY: array-form execFileSync, no shell.
  const ignored = new Set<string>();
  if (all.length > 0) {
    try {
      // NOTE: when `input` is set, do NOT pass `encoding: "buffer"` — Node
      // rejects that combination ("Unknown encoding: buffer"). Default
      // (undefined) encoding returns a Buffer, which is what we want.
      const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
        input: all.map((p) => normalizePath(p)).join("\0"),
        stdio: ["pipe", "pipe", "ignore"],
      });
      for (const p of out.toString("utf8").split("\0")) {
        if (p.length > 0) ignored.add(p);
      }
    } catch {
      // git check-ignore exits 1 when no input matches — that's fine.
      // It exits non-zero on real failure too; we treat both as "no
      // ignored entries" (best effort).
    }
  }
  return all
    .filter((abs) => !ignored.has(normalizePath(abs)))
    .map((abs) => ({
      path: normalizePath(abs),
      read: () => readFileSync(abs),
    }));
}

function buildTargetsForStaged(): Target[] {
  // SECURITY: array-form execFileSync, no shell.
  let listBuf: Buffer;
  try {
    listBuf = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=AM", "-z"], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const list = listBuf
    .toString("utf8")
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => p.startsWith("test/fixtures/"));

  return list.map((relPath) => ({
    path: relPath,
    read: (): Buffer => {
      // SECURITY: array-form execFileSync, no shell. The `:<path>` form is a
      // git-pathspec, not a shell argument.
      return execFileSync("git", ["show", `:${relPath}`], {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      });
    },
  }));
}

// ---------------------------------------------------------------------------
// DICOM scanner
// ---------------------------------------------------------------------------

function isDicom(buf: Buffer): boolean {
  return buf.length >= 132 && buf.toString("ascii", 128, 132) === "DICM";
}

function tagKey(group: number, element: number): string {
  return (
    group.toString(16).padStart(4, "0").toUpperCase() +
    element.toString(16).padStart(4, "0").toUpperCase()
  );
}

function tagDisplay(key: string): string {
  return `(${key.slice(0, 4).toLowerCase()},${key.slice(4).toLowerCase()})`;
}

interface ElementHeader {
  group: number;
  element: number;
  vr: string;
  valueOffset: number;
  valueLength: number;
  nextOffset: number;
}

function readElementExplicit(buf: Buffer, offset: number): ElementHeader | null {
  if (offset + 8 > buf.length) return null;
  const group = buf.readUInt16LE(offset);
  const element = buf.readUInt16LE(offset + 2);
  const vr = buf.toString("ascii", offset + 4, offset + 6);
  if (!/^[A-Z]{2}$/.test(vr)) return null;

  let valueOffset: number;
  let valueLength: number;
  if (LONG_FORM_VRS.has(vr)) {
    if (offset + 12 > buf.length) return null;
    valueLength = buf.readUInt32LE(offset + 8);
    valueOffset = offset + 12;
  } else {
    valueLength = buf.readUInt16LE(offset + 6);
    valueOffset = offset + 8;
  }
  // Undefined-length sequences (0xFFFFFFFF) — we don't recurse, just stop.
  if (valueLength === 0xffffffff) return null;
  const nextOffset = valueOffset + valueLength;
  if (nextOffset > buf.length) return null;
  return { group, element, vr, valueOffset, valueLength, nextOffset };
}

function readElementImplicit(buf: Buffer, offset: number): ElementHeader | null {
  if (offset + 8 > buf.length) return null;
  const group = buf.readUInt16LE(offset);
  const element = buf.readUInt16LE(offset + 2);
  const valueLength = buf.readUInt32LE(offset + 4);
  if (valueLength === 0xffffffff) return null;
  const valueOffset = offset + 8;
  const nextOffset = valueOffset + valueLength;
  if (nextOffset > buf.length) return null;
  // Resolve VR from our hardcoded subset.
  const key = tagKey(group, element);
  let vr = "UN";
  if (PN_TAGS.has(key)) vr = "PN";
  else if (DA_TAGS.has(key)) vr = "DA";
  else if (DT_TAGS.has(key)) vr = "DT";
  return { group, element, vr, valueOffset, valueLength, nextOffset };
}

function decodeAscii(buf: Buffer, offset: number, length: number): string {
  if (length <= 0) return "";
  const end = Math.min(buf.length, offset + length);
  return buf.toString("latin1", offset, end);
}

function isPnAllowed(value: string, allow: AllowList): boolean {
  if (allow.pnExact.has(value)) return true;
  for (const prefix of allow.pnPrefix) {
    if (value.startsWith(prefix)) return true;
  }
  return false;
}

function checkDate(value: string, allow: AllowList): string | null {
  if (!/^\d{8}$/.test(value)) return null; // not a strict YYYYMMDD; skip
  if (allow.dates.has(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year >= CUTOFF_YEAR) {
    return `DA/DT within last 120 years (>= ${String(CUTOFF_YEAR)})`;
  }
  return null;
}

function inspectElement(
  target: Target,
  buf: Buffer,
  group: number,
  element: number,
  vr: string,
  valueOffset: number,
  valueLength: number,
  allow: AllowList,
  hits: Hit[],
): void {
  const key = tagKey(group, element);
  const isPn = vr === "PN" || PN_TAGS.has(key);
  const isDa = vr === "DA" || DA_TAGS.has(key);
  const isDt = vr === "DT" || DT_TAGS.has(key);
  if (!isPn && !isDa && !isDt) return;

  const raw = decodeAscii(buf, valueOffset, valueLength);
  const value = raw.replace(/[\0\s]+$/, "");
  if (value.length === 0) return;

  if (isPn && PN_TAGS.has(key)) {
    if (!isPnAllowed(value, allow)) {
      hits.push({
        path: target.path,
        tag: tagDisplay(key),
        vr: "PN",
        offset: valueOffset,
        value,
        reason: "PN not in allow-list",
      });
    }
  } else if (isDa && DA_TAGS.has(key)) {
    const violation = checkDate(value, allow);
    if (violation !== null) {
      hits.push({
        path: target.path,
        tag: tagDisplay(key),
        vr: "DA",
        offset: valueOffset,
        value,
        reason: violation,
      });
    }
  } else if (isDt && DT_TAGS.has(key)) {
    // DT first 8 chars = YYYYMMDD.
    const head = value.slice(0, 8);
    const violation = checkDate(head, allow);
    if (violation !== null) {
      hits.push({
        path: target.path,
        tag: tagDisplay(key),
        vr: "DT",
        offset: valueOffset,
        value,
        reason: violation,
      });
    }
  }
}

function scanDicom(target: Target, buf: Buffer, allow: AllowList, hits: Hit[]): void {
  // Walk File Meta group (always Explicit VR LE) starting at offset 132.
  // Then walk the dataset, dispatching by transfer syntax UID found in
  // (0002,0010).
  if (!isDicom(buf)) return;

  let offset = 132;
  let transferSyntax = "1.2.840.10008.1.2.1"; // default Explicit VR LE

  // Walk file meta — group 0002 only, Explicit VR LE.
  while (offset + 8 <= buf.length) {
    const peekGroup = buf.readUInt16LE(offset);
    if (peekGroup !== 0x0002) break;
    const result = readElementExplicit(buf, offset);
    if (result === null) break;
    const { group, element, vr, valueOffset, valueLength, nextOffset } = result;
    if (group === 0x0002 && element === 0x0010 && vr === "UI") {
      transferSyntax = decodeAscii(buf, valueOffset, valueLength).replace(/\0+$/, "").trim();
    }
    inspectElement(target, buf, group, element, vr, valueOffset, valueLength, allow, hits);
    offset = nextOffset;
  }

  const implicit = transferSyntax === "1.2.840.10008.1.2";
  // Continue with dataset.
  while (offset + 8 <= buf.length) {
    const result = implicit ? readElementImplicit(buf, offset) : readElementExplicit(buf, offset);
    if (result === null) break;
    const { group, element, vr, valueOffset, valueLength, nextOffset } = result;
    inspectElement(target, buf, group, element, vr, valueOffset, valueLength, allow, hits);
    if (nextOffset <= offset || nextOffset > buf.length) break;
    offset = nextOffset;
  }
}

// ---------------------------------------------------------------------------
// Non-DICOM (text/json) scanner
// ---------------------------------------------------------------------------

function scanText(target: Target, content: string, allow: AllowList, hits: Hit[]): void {
  // ISO date `YYYY-MM-DD`
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = isoRe.exec(content)) !== null) {
    const yyyy = m[1];
    const mm = m[2];
    const dd = m[3];
    const full = m[0];
    if (yyyy === undefined || mm === undefined || dd === undefined) continue;
    const compact = `${yyyy}${mm}${dd}`;
    if (allow.dates.has(compact)) continue;
    const year = Number(yyyy);
    if (year >= CUTOFF_YEAR) {
      hits.push({
        path: target.path,
        tag: "(text)",
        vr: "DA",
        offset: m.index,
        value: full,
        reason: `text date within last 120 years (>= ${String(CUTOFF_YEAR)})`,
      });
    }
  }

  // 8-char YYYYMMDD as a standalone token
  const compactRe = /\b(\d{4})(\d{2})(\d{2})\b/g;
  while ((m = compactRe.exec(content)) !== null) {
    const yyyy = m[1];
    const mm = m[2];
    const dd = m[3];
    const full = m[0];
    if (yyyy === undefined || mm === undefined || dd === undefined) continue;
    if (allow.dates.has(full)) continue;
    const year = Number(yyyy);
    const month = Number(mm);
    const day = Number(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (year >= CUTOFF_YEAR) {
      hits.push({
        path: target.path,
        tag: "(text)",
        vr: "DA",
        offset: m.index,
        value: full,
        reason: `text date within last 120 years (>= ${String(CUTOFF_YEAR)})`,
      });
    }
  }

  // FAMILY^GIVEN PN-shaped tokens
  const pnRe = /\b[A-Z][A-Za-z\-']+\^[A-Z][A-Za-z\-']+\b/g;
  while ((m = pnRe.exec(content)) !== null) {
    const value = m[0];
    if (!isPnAllowed(value, allow)) {
      hits.push({
        path: target.path,
        tag: "(text)",
        vr: "PN",
        offset: m.index,
        value,
        reason: "text PN not in allow-list",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function scanTarget(target: Target, allow: AllowList, hits: Hit[]): void {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const ext = extname(target.path).toLowerCase();
  if (ext === ".dcm" || ext === ".bin") {
    if (isDicom(buf)) {
      scanDicom(target, buf, allow, hits);
    } else {
      // best-effort text fallback
      scanText(target, buf.toString("utf8"), allow, hits);
    }
  } else if (ext === ".json" || ext === ".txt" || ext === ".md" || ext === ".csv") {
    scanText(target, buf.toString("utf8"), allow, hits);
  } else {
    // Unknown extension — try DICOM magic, else text.
    if (isDicom(buf)) {
      scanDicom(target, buf, allow, hits);
    } else {
      scanText(target, buf.toString("utf8"), allow, hits);
    }
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[]): void {
  if (hits.length === 0) {
    process.stdout.write("[phi-scan] OK — no hits\n");
    return;
  }
  const byPath = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byPath.get(h.path);
    if (arr) arr.push(h);
    else byPath.set(h.path, [h]);
  }
  for (const [path, group] of byPath) {
    process.stderr.write(`[phi-scan] HIT: ${path}\n`);
    for (const h of group) {
      process.stderr.write(
        `  tag=${h.tag} vr=${h.vr} offset=${String(h.offset)} value=${JSON.stringify(h.value)} (${h.reason})\n`,
      );
    }
  }
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hits across ${String(byPath.size)} file(s). ` +
      `To bypass for a synthetic fixture, add to scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log in phi-scan-overrides.md.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  try {
    validateAllowFixtures(args.allowFixtures);
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const allow = loadAllowList();
  const allowedSet = new Set<string>(args.allowFixtures.map((p) => normalizePath(p)));

  let targets: Target[];
  try {
    if (args.mode === "staged") {
      targets = buildTargetsForStaged();
    } else if (args.mode === "paths") {
      targets = buildTargetsForPaths(args.paths);
    } else {
      targets = buildTargetsForAll();
    }
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  // Filter out --allow-fixture targets entirely. These have already been
  // validated against the override log above.
  targets = targets.filter((t) => !allowedSet.has(t.path));

  const hits: Hit[] = [];
  for (const t of targets) {
    try {
      scanTarget(t, allow, hits);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  report(hits);
  return hits.length === 0 ? 0 : 1;
}

const exitCode = main();
process.exit(exitCode);

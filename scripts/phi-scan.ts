#!/usr/bin/env tsx
/**
 * Phase 1 Plan 04 PHI scanner - TEST-09 CI-scan half.
 *
 * Pure Node. Zero runtime deps. Walks two corpora and rejects:
 *   1. PN values not matching the synthetic allow-list (scripts/phi-allow-list.txt)
 *   2. DA / DT values within the last 120 years of TODAY
 *
 * THE TWO CORPORA:
 *   - `test/fixtures/**`  - committed/staged DICOM fixtures and non-DICOM data files.
 *   - `README.md` + `docs-content/**` - the DOC corpus. The documentation ships DICOM
 *     objects as base64-encoded Part 10 buffers inline in markdown, so a recipe needs no
 *     `.dcm` on disk; those buffers are fixtures in every respect that matters here, and
 *     the text sweep alone cannot see into one (see `scanEmbeddedObjects`).
 *
 * SECURITY: All git invocations use execFileSync with array args. Never any
 * shell-form spawn. The single subprocess this script makes is `git`, called
 * exclusively via array-form arguments.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass for one path; rejected if not logged in phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan both corpora in the working tree
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 *
 * ---------------------------------------------------------------------------
 * AN IN-SCOPE ENTRY THAT IS NOT A REGULAR FILE REFUSES THE SCAN (exit 2). It is
 * never silently skipped, because BOTH enumerating routes are blind to it in a
 * way that reads as clean:
 *
 *   - the walk enumerates `Dirent.isFile()`, which is an lstat answer, so a
 *     symbolic link is neither a file nor a directory and used to fall out of
 *     the loop silently, whatever it pointed at. `isDirectory()` answers false
 *     for a LINKED DIRECTORY too, so a whole subtree vanished the same way;
 *   - `--staged` reads content with `git show :<path>`, and git stores a
 *     symbolic link as its TARGET PATH under mode 120000, so that route is
 *     handed the path text and never the target's bytes.
 *
 * So a link under `test/fixtures/` pointing at a PHI-bearing file scanned CLEAN
 * on both. Neither route is made to follow it: following would read bytes the
 * enumeration does not control (outside the repo, a loop, a device, a FIFO that
 * blocks the gate forever), and git does not carry those bytes anyway, so a hit
 * on them would be a claim about something no commit contains. Refusing states
 * the only true thing available: there is an entry here the scan cannot account
 * for, so the scan is not clean.
 *
 * "IN SCOPE" IS A NARROWER THING THAN THE PATH PREFIX, AND THE EXACT BOUNDARY IS
 * WORTH STATING RATHER THAN LEAVING TO BE INFERRED, BECAUSE THE GAP BETWEEN THE
 * TWO IS WHERE THIS DEFECT LIVED. The walk covers everything under
 * `test/fixtures/` except a gitignored entry (the same rule that already excludes
 * a gitignored fixture, so links do not get a second, stricter boundary of their
 * own). `--staged` covers `test/fixtures` and everything under it, restricted to
 * the staged records git reports as ADDED, MODIFIED or TYPECHANGED - a deletion
 * has no staged blob to scan and an unmerged path has no single one, and both are
 * still out of scope.
 *
 * Almost all of that is unchanged; the two places it MOVED are called out rather
 * than folded into "narrowing", because both admit MORE than before: rename
 * detection is off, so a rename destination now arrives as an ordinary add
 * instead of vanishing with its two-path record, and the fixture root's own path
 * is in scope as well as its contents. Both are the same one entry-shape this
 * banner is about, reached by a route the prefix test did not cover.
 *
 * A refusal names the entry's own repo-relative path and an engine-owned token
 * for its kind. IT NEVER REPORTS THE LINK TARGET, which is text off the working
 * tree and can itself carry PHI - a target path of the shape
 * `../patients/<surname>-<given>-<dob>.txt` is the whole reason, and it is not
 * hypothetical here: a link to exactly that shape made the `--staged` route exit
 * 1 by matching the DATE IN THE FILENAME, reporting a hit that was never about
 * the target's contents. The shape is written out rather than an example,
 * because a diagnostic ABOUT a PHI leak is itself a PHI surface, and that
 * applies to the prose explaining it too.
 *
 * The entry's OWN name is a different matter and is printed deliberately, but it
 * is a new line on a channel that used to print nothing for a link, so say what
 * it is: it is the same locus every hit already carries, it is a path a developer
 * chose and git would record in a commit, and a refusal that will not say WHICH
 * entry it means cannot be acted on. Nothing from the other side of the link
 * joins it.
 * ---------------------------------------------------------------------------
 *
 * D-15 / D-16 / D-17 / TEST-09.
 */

import { readFileSync, statSync, existsSync, readdirSync, type Dirent } from "node:fs";
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

/**
 * THE DOC CORPUS. Roadmap Phase 8 requires that "the PHI scanner covers doc fixtures", and the
 * documentation ships DICOM objects the same way the test suite does: as base64-encoded Part 10
 * buffers inline in markdown, so a recipe needs no `.dcm` file on disk. Those buffers are fixtures
 * in every respect that matters here, and until this route existed the scanner never opened one.
 *
 * `README.md` is in the corpus even though the fixture walk deliberately skips a `readme.md`. That
 * exemption is about a file that DOCUMENTS violator values (`test/fixtures/phi-scan/README.md` names
 * the SMITH^JOHN fixtures on purpose); the package's own README is the npm-visible front page and
 * carries no such role. `docs-content/` is walked whole rather than filtered to `.md`, because
 * `scanTarget` already dispatches by content and a doc asset that is not markdown is still a doc
 * asset.
 */
const DOC_ROOTS = [join(REPO_ROOT, "README.md"), join(REPO_ROOT, "docs-content")];

/** The same roots as `DOC_ROOTS`, repo-relative, for the `--staged` scope test. */
const DOC_SCOPE = ["README.md", "docs-content"];

/**
 * The shortest base64 run worth decoding: enough characters to encode ONE Explicit VR LE short-form
 * Data Element header, which is the least that `fileMetaStart` could ever recognize.
 *
 * 🛑 THE FLOOR IS NOT THE FILTER, AND SETTING IT AS THOUGH IT WERE IS HOW THIS ROUTE FIRST SHIPPED
 * BLIND. A first draft floored the run at 120 characters on the reasoning that a Part 10 object is
 * big; the preamble-less fixture `docs-content/cookbook.md` ships to demonstrate
 * `DICOM_MISSING_PREAMBLE` is 88, so the one file the route's own comments named as its reason was
 * the one file it never opened, and the gate printed `OK - no hits` over a name-bearing payload in
 * exactly that shape. The decode does the filtering now: a run that does not decode to something
 * `fileMetaStart` recognizes is dropped, and nothing about a doc fixture's SIZE is assumed. No
 * measured length is written here either, because a doc fixture's length is whatever the next recipe
 * needs it to be.
 */
const MIN_BASE64_RUN = 16;

/**
 * Built from the floor so the two cannot drift: a hardcoded quantifier made the constant dead, and a
 * dead constant is the shape where changing the number changes nothing. A fresh `RegExp` per call
 * rather than one module-level object, so no `lastIndex` can be carried between files.
 */
function base64RunRe(): RegExp {
  return new RegExp(`[A-Za-z0-9+/]{${String(MIN_BASE64_RUN)},}={0,2}`, "g");
}

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

/**
 * An entry the enumeration reached but cannot scan. Both fields are safe to
 * print: `path` is the entry's own repo-relative path (the same locus every hit
 * already carries) and `kind` is a token from the closed set below. Nothing off
 * the other side of a link is ever recorded here.
 */
interface Unscannable {
  path: string;
  kind: string;
}

/** Closed-set, engine-owned description of a directory entry's kind. */
function direntKind(e: Dirent): string {
  if (e.isSymbolicLink()) return "a symbolic link";
  if (e.isFIFO()) return "a FIFO";
  if (e.isSocket()) return "a socket";
  if (e.isBlockDevice()) return "a block device";
  if (e.isCharacterDevice()) return "a character device";
  return "not a regular file";
}

function enumerateAll(): { files: string[]; unscannable: Unscannable[] } {
  const files: string[] = [];
  const unscannable: Unscannable[] = [];
  if (existsSync(FIXTURE_ROOT)) walk(FIXTURE_ROOT, files, unscannable, true);
  for (const root of DOC_ROOTS) {
    if (!existsSync(root)) continue;
    if (statSync(root).isDirectory()) walk(root, files, unscannable, false);
    else files.push(root);
  }
  return { files, unscannable };
}

/**
 * Enumerate the fixture root. `Dirent`'s predicates are lstat answers and are
 * not exhaustive: an entry that is neither a directory nor a regular file is
 * collected into `unscannable` rather than dropped, so the caller can refuse
 * instead of reporting clean over it.
 */
function walk(dir: string, out: string[], unscannable: Unscannable[], skipReadme: boolean): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out, unscannable, skipReadme);
    } else if (e.isFile()) {
      // Skip README.md files under the FIXTURE root: they're documentation that
      // may legitimately describe synthetic violator values (e.g., this repo's
      // `test/fixtures/phi-scan/README.md` documents the SMITH^JOHN /
      // 20250612 fixtures). Documentation is not a fixture.
      //
      // The DOC corpus is walked with this off, because there the documentation
      // IS the corpus: a doc that carried a violator value would be exactly the
      // thing the doc route was added to catch.
      if (skipReadme && e.name.toLowerCase() === "readme.md") continue;
      out.push(full);
    } else {
      // Deliberately NOT subject to the `readme.md` exemption above. That
      // exemption is a judgement about a file whose bytes the walk could have
      // read; a link's name is no evidence at all about what is on the other
      // side of it.
      unscannable.push({ path: normalizePath(full), kind: direntKind(e) });
    }
  }
}

/**
 * Refuse (exit 2) over entries the enumeration reached and cannot scan. EVERY
 * offender is named, not just the first: a developer who has to re-run the gate
 * once per link learns to distrust it.
 */
function refuseUnscannable(entries: Unscannable[], why: string, remedy: string): void {
  if (entries.length === 0) return;
  const lines = entries.map((u) => `  - ${u.path} (${u.kind})`).join("\n");
  const noun =
    entries.length === 1 ? "entry is not a regular file" : "entries are not regular files";
  throw new InvocationError(
    `refusing the scan: ${String(entries.length)} ${noun}:\n${lines}\n${why} ${remedy}`,
  );
}

/**
 * Filter a path list through `git check-ignore`. Transient fixtures regenerated
 * by tests (e.g., `test/fixtures/phi-scan/*.dcm`) are intentionally gitignored
 * and are NOT in scope for the scanner - only commit-eligible content is.
 */
function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell.
    // NOTE: when `input` is set, do NOT pass `encoding: "buffer"` - Node
    // rejects that combination ("Unknown encoding: buffer"). Default
    // (undefined) encoding returns a Buffer, which is what we want.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      input: paths.map((p) => normalizePath(p)).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // git check-ignore exits 1 when no input matches - that's fine.
    // It exits non-zero on real failure too; we treat both as "no
    // ignored entries" (best effort).
  }
  return ignored;
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
  const { files, unscannable } = enumerateAll();

  // One `git check-ignore` over both lists. An ignored entry is already out of
  // scope for the file route, so applying the same rule to a link keeps a single
  // boundary rather than inventing a second, stricter one for links alone.
  const ignored = gitIgnored([
    ...files.map((p) => normalizePath(p)),
    ...unscannable.map((u) => u.path),
  ]);

  refuseUnscannable(
    unscannable.filter((u) => !ignored.has(u.path)),
    "The walk can neither read such an entry nor vouch for what is on the other side of it.",
    "Remove it, replace it with a regular file, or (if it is genuinely not part of the " +
      "corpus) untrack it and add it to .gitignore.",
  );

  return files
    .filter((abs) => !ignored.has(normalizePath(abs)))
    .map((abs) => ({
      path: normalizePath(abs),
      read: () => readFileSync(abs),
    }));
}

/** git's file modes for a regular blob. Every other mode is not a file to read. */
const REGULAR_BLOB_MODES = new Set(["100644", "100755"]);

/** Closed-set, engine-owned description of a git file mode. */
function gitModeKind(mode: string): string {
  if (mode === "120000") return "a symbolic link";
  if (mode === "160000") return "a gitlink (a nested repository)";
  return `a git mode-${mode} entry`;
}

/** `:<srcmode> <dstmode> <srcsha> <dstsha> <status>` - the info half of a `--raw -z` record. */
const RAW_RECORD = /^:(?:\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\d*$/;

function buildTargetsForStaged(): Target[] {
  // SECURITY: array-form execFileSync, no shell.
  let listBuf: Buffer;
  try {
    // `--raw` rather than `--name-only` because the DESTINATION MODE is the only
    // thing this route can read a non-regular entry off. `git show :<path>` does
    // not stand in for it: for a symbolic link it answers the target path as if
    // it were content, and it is the mode, not the answer, that says so.
    //
    // `T` (TYPECHANGE) IS IN THE FILTER, AND LEAVING IT OUT MADE THE MODE CHECK
    // BELOW UNREACHABLE WHENEVER THE FIXTURE WAS ALREADY TRACKED. Replacing a
    // TRACKED regular file with a link is not an add and not a modify - git
    // raises it as `T` (`:100644 120000 <sha> <sha> T`), so `--diff-filter=AM`
    // deleted the record before any mode could be read and the pre-commit hook
    // passed the link green. Typechange carries a single path, exactly like `A`
    // and `M`, so admitting it costs the two-field stride below nothing, and the
    // reverse typechange (a link replaced by a real file) is now scanned as the
    // file it became.
    //
    // `--no-renames` FOR THE SAME REASON, AND THE FILTER ALONE WAS NOT ENOUGH.
    // With rename detection on (it is on by default, and `diff.renames` can turn
    // copy detection on too) `git mv <link> test/fixtures/<name>` stages as
    // `:120000 120000 <sha> <sha> R100` with TWO paths, which `--diff-filter=AMT`
    // then deletes outright - so an ordinary `git mv` put a mode-120000 entry
    // under the scan root and this route printed "OK - no hits". Turning
    // detection off makes the destination arrive as an ordinary single-path `A`
    // (`:000000 120000 0000000 <sha> A`) and the source as a `D` the filter drops,
    // which costs the stride nothing and needs no two-path record shape. It also
    // makes the two-field stride STRUCTURAL rather than conditional: with
    // detection off, no `R` or `C` record can be produced whatever the caller's
    // `diff.renames` setting is.
    listBuf = execFileSync(
      "git",
      ["diff", "--cached", "--raw", "-z", "--no-renames", "--diff-filter=AMT"],
      {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `--raw -z` emits `<info>\0<path>\0` per record. `R` (rename) and `C` (copy)
  // are the only statuses carrying a SECOND path, and `--no-renames` above means
  // git cannot emit either, so the stride is two fields. The regex still admits a
  // score-suffixed status: if one ever reached here the stride would desync and
  // the next record would fail to parse, which REFUSES - the same outcome as any
  // other unparseable record, and the safe one. A record that does not parse
  // REFUSES rather than being skipped: a silently shortened list is exactly the
  // shape this scan must never report clean over.
  //
  // What this route still does NOT enumerate, stated because the boundary is
  // narrower than the path prefix alone: `--diff-filter=AMT` also drops `D`
  // (a deletion has no staged blob to scan) and `U` (an unmerged path has no
  // single one). Both are PRE-EXISTING.
  const fields = listBuf.toString("utf8").split("\0");
  const staged: { path: string; mode: string }[] = [];
  let i = 0;
  while (i < fields.length) {
    const info = fields[i];
    if (info === undefined || info.length === 0) {
      i += 1;
      continue;
    }
    const m = RAW_RECORD.exec(info);
    const mode = m?.[1];
    const path = fields[i + 1];
    if (mode === undefined || path === undefined || path.length === 0) {
      throw new InvocationError(
        "could not read the output of `git diff --cached --raw -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    staged.push({ path, mode });
    i += 2;
  }

  // The fixture ROOT'S OWN PATH is in scope as well as everything under it. An
  // index entry at exactly `test/fixtures` is never a directory - git records no
  // entry for one - so it is the corpus root replaced by a blob, a link or a
  // gitlink, and the prefix test alone let that through (measured: exit 0 over a
  // staged mode-120000 `test/fixtures`). Only the "never a directory" half is
  // load-bearing for the `===` test; the other three are all handled below.
  // The doc corpus joins the fixture corpus here on the same terms: the root's own path as well as
  // everything under it, so a `docs-content` replaced by a blob, a link or a gitlink is refused
  // rather than skipped. `README.md` is a file, so only the `===` half can ever match it.
  const roots = ["test/fixtures", ...DOC_SCOPE];
  const inScope = staged.filter((s) =>
    roots.some((root) => s.path === root || s.path.startsWith(`${root}/`)),
  );

  refuseUnscannable(
    inScope
      .filter((s) => !REGULAR_BLOB_MODES.has(s.mode))
      .map((s) => ({ path: s.path, kind: gitModeKind(s.mode) })),
    // Deliberately says what the INDEX holds, not what `git show` would answer:
    // `git show :<path>` answers a symbolic link with its target path as though
    // that were content, but for a gitlink it fails outright (`fatal: bad
    // object`), so a sentence about `git show` would be false for every mode
    // here except 120000.
    "The index records such an entry by reference rather than as file content, so nothing " +
      "readable through it would be evidence about what it names.",
    "Unstage it, or replace it with a regular file.",
  );

  return inScope.map(({ path: relPath }) => ({
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
  // Undefined-length sequences (0xFFFFFFFF) - we don't recurse, just stop.
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

/**
 * Where the File Meta group starts, or `null` when the bytes are not a DICOM stream at all.
 *
 * A Part 10 object begins its File Meta group at 132, after the preamble and `DICM`. A **preamble-
 * less** stream begins it at 0, which is a deviation this package tolerates on the read path and
 * therefore one the documentation demonstrates: `docs-content/cookbook.md` ships exactly such a
 * fixture to show the `DICOM_MISSING_PREAMBLE` warning. Recognizing only the first shape would have
 * left that fixture unscanned while the gate reported clean, which is the failure mode this whole
 * script is written against.
 */
function fileMetaStart(buf: Buffer): number | null {
  if (isDicom(buf)) return 132;
  // The preamble-less branch has no magic number to key on, so it keys on the shape the File Meta
  // group always has in this package's reader and writer: group `0002` in Explicit VR LE, which
  // puts two ASCII letters where the VR belongs. Requiring the VR as well as the group is what
  // keeps the low run floor above from turning ordinary prose into candidate objects.
  if (
    buf.length >= 8 &&
    buf.readUInt16LE(0) === 0x0002 &&
    /^[A-Z]{2}$/.test(buf.toString("latin1", 4, 6))
  ) {
    return 0;
  }
  return null;
}

function scanDicom(target: Target, buf: Buffer, allow: AllowList, hits: Hit[]): void {
  // Walk File Meta group (always Explicit VR LE) starting after the preamble, or at 0 for a
  // preamble-less stream. Then walk the dataset, dispatching by transfer syntax UID found in
  // (0002,0010).
  const start = fileMetaStart(buf);
  if (start === null) return;

  let offset = start;
  let transferSyntax = "1.2.840.10008.1.2.1"; // default Explicit VR LE

  // Walk file meta - group 0002 only, Explicit VR LE.
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

/**
 * Decode every base64 run in a text file and scan the ones that are DICOM objects.
 *
 * THIS IS THE DOC-FIXTURE ROUTE, AND WITHOUT IT THE DOC CORPUS SCANS CLEAN BY CONSTRUCTION.
 * A doc fixture is a Part 10 object encoded as base64 and pasted inline, so to the text scanner it
 * is one long alphanumeric token: no `FAMILY^GIVEN`, no `YYYYMMDD`, nothing to match. The values
 * inside it are exactly as identifying as the ones in a `.dcm` under `test/fixtures/`.
 *
 * A run that does not decode to a DICOM stream is dropped in silence rather than reported. There is
 * no evidence in an arbitrary base64 blob about what it is, and a scanner that guessed would spend
 * its credibility on false hits over checksums and image data.
 */
function scanEmbeddedObjects(target: Target, text: string, allow: AllowList, hits: Hit[]): void {
  for (const m of text.matchAll(base64RunRe())) {
    const run = m[0];
    let decoded: Buffer;
    try {
      decoded = Buffer.from(run, "base64");
    } catch {
      continue;
    }
    if (fileMetaStart(decoded) === null) continue;
    // The hit's `path` stays the markdown file's, because that is the file a developer has to edit.
    // The offset a hit carries is into the DECODED object, which is the only frame in which the
    // element it names has one; the run's own index is not reported, deliberately, since a second
    // number in the same message reads as though one of them located the value in the source.
    scanDicom(target, decoded, allow, hits);
  }
}

/**
 * Extensions dispatched to the TEXT route (plus the embedded-object decode). Membership here is
 * about a file whose bytes are markup a human wrote, not about what those bytes might encode.
 */
const TEXT_EXTENSIONS = new Set([".json", ".txt", ".md", ".csv"]);

/**
 * Dispatch one target to the route that can actually read it.
 *
 * 🛑 THE BINARY ROUTE ASKS `fileMetaStart`, NEVER `isDicom`. `isDicom` is the 128-byte-preamble +
 * `DICM` test, and it is one of the TWO shapes this package reads; a **preamble-less** stream begins
 * its File Meta group at byte 0 and answers `false` to it. Gating on it here sent every preamble-less
 * object on disk to `scanText` instead, so the DICOM-aware sweep - the tag table, the transfer-syntax
 * dispatch, the per-VR value decode - never ran on one, and the gate printed `OK - no hits` over it.
 * That is not a narrower scan; it is a DIFFERENT one, and it cannot see what the tag table sees: a
 * single-component `(0010,0010)` carries no `FAMILY^GIVEN` caret, so the text sweep's PN regex has
 * nothing to match, and a `DT` value's `YYYYMMDD` head is not a standalone 8-digit token either.
 * `scanDicom` already called `fileMetaStart`, so the two shapes disagreed only at this gate, and only
 * for an object ON DISK - the doc-corpus route reached `scanDicom` through `scanEmbeddedObjects`,
 * which had asked `fileMetaStart` since it was written.
 *
 * 🛑 AND THE TWO ROUTES ARE NOT ALTERNATIVES: ADDING THE DICOM ONE MUST NOT SUBTRACT THE TEXT ONE.
 * Recognizing a preamble-less object and handing it to `scanDicom` INSTEAD of `scanText` is a
 * regression, not a fix, because `scanDicom` gives up quietly. Its walk `break`s at the first header
 * it cannot read, and `readElementExplicit` returns `null` for an undefined-length value
 * (`0xFFFFFFFF`) - which PS3.5 2026c §7.5.2 defines as one of TWO Sequence delimitations, the
 * encoder's choice, both of which "shall be supported by decoders". (It is not "the normative
 * encoding": the clause has two branches and quoting one is how it reads as absolute.) §7.1 then
 * orders tags ascending, so `(0008,1110) SQ` sits BEFORE `(0010,0010)` in a conformant file. An
 * exclusive swap therefore took a preamble-less object whose PatientName hides behind an
 * undefined-length `SQ` from exit 1 (the text sweep saw the name) to exit 0 and `OK - no hits`.
 * A non-LE transfer syntax does the same thing for the same reason.
 *
 * So the binary branch asks TWO independent questions and runs BOTH answers. What it does is a strict
 * SUPERSET of what gating on `isDicom` did, on every input, which is the property to preserve if this
 * ever changes again:
 *
 *   - `isDicom` true  -> `scanDicom` only. Byte-for-byte the old behaviour.
 *   - preamble-less   -> `scanDicom` AND `scanText`. The text sweep is what it always got; the DICOM
 *                        sweep is the addition. Nothing that used to be found can be lost.
 *   - neither         -> `scanText` only. Byte-for-byte the old behaviour.
 *
 * The cost is that a preamble-less object can now report the same value twice, once as its tag and
 * once as `(text)`. Two lines naming one value is not a defect in a gate whose output a human reads
 * before committing; a missing line is.
 *
 * A text extension is still dispatched by NAME rather than by content: a `.md` whose first bytes
 * happened to look like group `0002` is still a document, and losing `scanEmbeddedObjects` on it
 * would trade one blind spot for another.
 *
 * WHAT THIS DOES NOT CLOSE, because it is `PRE-EXISTING` and closing it is a product call with its own
 * false-positive surface: a **preamble-ful** Part 10 object gets no text sweep, so `scanDicom` giving
 * up early on one is still silent. Measured on base and unchanged here. Sweeping every Part 10 object
 * as text as well would flag 8-digit runs inside pixel data, which is a gate-behaviour change, not a
 * side effect of this one.
 */
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
  if (TEXT_EXTENSIONS.has(ext)) {
    const text = buf.toString("utf8");
    scanText(target, text, allow, hits);
    scanEmbeddedObjects(target, text, allow, hits);
    return;
  }
  // Two questions, not one choice. See the superset table above before making either an `else`.
  if (fileMetaStart(buf) !== null) {
    scanDicom(target, buf, allow, hits);
  }
  if (!isDicom(buf)) {
    scanText(target, buf.toString("utf8"), allow, hits);
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[]): void {
  if (hits.length === 0) {
    process.stdout.write("[phi-scan] OK - no hits\n");
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

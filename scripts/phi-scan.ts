#!/usr/bin/env tsx
/**
 * Phase 1 Plan 04 PHI scanner - TEST-09 CI-scan half.
 *
 * Pure Node. Zero runtime deps. Walks two corpora and rejects:
 *   1. PN values not matching the synthetic allow-list (scripts/phi-allow-list.txt)
 *   2. DA / DT values within the last 120 years of TODAY
 *
 * THE TWO CORPORA:
 *   - `test/**` - the TEST corpus: every tracked file under `test/`, not just the
 *     `test/fixtures/` subtree. See "WHY THE ROOT IS `test/`" below; this is the half
 *     `PHI-SCAN-WALK-ROOT-SCOPE` was filed against.
 *   - `README.md` + `docs-content/**` - the DOC corpus. The documentation ships DICOM
 *     objects as base64-encoded Part 10 buffers inline in markdown, so a recipe needs no
 *     `.dcm` on disk; those buffers are fixtures in every respect that matters here, and
 *     the text sweep alone cannot see into one (see `scanEmbeddedObjects`).
 *
 * ---------------------------------------------------------------------------
 * WHY THE ROOT IS `test/` AND NOT `test/fixtures/`, AND WHAT THAT COST WHILE IT WAS NOT
 * (`PHI-SCAN-WALK-ROOT-SCOPE`, measured on `8982a16`).
 *
 * The walk rooted at `test/fixtures/`, and every file this package commits under that
 * directory is GITIGNORED - `.gitignore` sends `test/fixtures/phi-scan/*.dcm|json|txt` away
 * as regenerated-per-run, exempting only a `README.md` that the walk then skipped by name.
 * So the fixture corpus contributed EXACTLY ZERO files and the all-mode run opened 13: the
 * README and the twelve pages under `docs-content/`. Against 226 tracked files, 213 were
 * outside the all-mode walk, 82 of them under `test/`. ONE of those 82 was still reachable
 * by `--staged`, which has never applied the corpus exemption, so the figure for "scanned by
 * NEITHER route" is 212 and 81. Both are written down because the two are easy to quote as
 * each other.
 *
 * That is not a small gap, because this package has no committed `.dcm` files at all: every
 * fixture it owns is BUILT IN A `.ts` SOURCE FILE by `test/helpers/build-dicom.ts`, so the
 * whole committed fixture corpus lived in the 81 tracked files under `test/` that the walk
 * root excluded. Pointing this scanner at that root finds 81 PN/date hits across 20 files,
 * none of which any run of this gate had ever looked at. (Naming all 82 tracked files under
 * `test/` by path finds 83 across 21: the two extra are in the one corpus-exempt README, which
 * all-mode does not open. Both numbers are stated so neither can be quoted as the other.)
 *
 * 🛑 AND ENUMERATING THEM BUYS THE PN/DATE FLOOR AND NOTHING ELSE. The recognizers here look
 * for `FAMILY^GIVEN`, `YYYY-MM-DD`, a standalone `YYYYMMDD`, and PN/DA/DT values under a
 * hardcoded tag table. They do NOT look for an MRN, an accession number, an institution
 * name, a phone number, an email address, an SSN, or a vendor UID root. The tracked files
 * this change opens carry all of those shapes (synthetic ones: `MRN-11111`, `ACC0099`,
 * `ACME GENERAL HOSPITAL`, `1.2.276.0.7230010.*`), and a clean run says nothing about any of
 * them. "Newly scanned" is not "newly cleared"; the 81 files were HAND-READ for this change,
 * and that reading, not this gate, is what cleared them.
 *
 * WHAT IS STILL OUT OF SCOPE, DELIBERATELY AND WITH THE REASON. Of 229 tracked files, 95 are
 * opened, 1 is corpus-exempt, and 133 are outside the declared roots entirely: `src/` (72),
 * `vendor/` (17), `scripts/` (13), `.github/` (8), `.changeset/` (4), `documentation/` (3),
 * `.claude/` (1) and 15 files at the repository root.
 *
 * Admitting them is a PRODUCT call with its own false-positive surface rather than a side
 * effect of this one, and the two largest groups are structural rather than accidental:
 * `src/dictionary/generated/annex-e.ts` is a generated table of DICOM tags, and a tag such as
 * `(4008,0101)` written as eight digits satisfies the `YYYYMMDD` shape, so the compact-date
 * pass matches hundreds of them; `vendor/nema/` is a SHA-pinned copy of a standards document
 * full of real publication dates. Neither is PHI and neither is fixed by a walk root.
 *
 * NO HIT COUNT FOR THEM IS WRITTEN DOWN, deliberately: it is a number about prose as much as
 * about code, and a draft of this comment moved it by one just by naming a tag in eight-digit
 * form. It is one command, so derive it rather than quoting a stale copy:
 *   `git ls-files -z <dir> | xargs -0 pnpm phi-scan --`
 *
 * 🛑 AND THE ALLOW-LIST IS GLOBAL, WHICH MEANS WIDENING THE WALK ROOT WIDENED IT TOO. Every value
 * `scripts/phi-allow-list.txt` carries is read into ONE Set and applied to EVERY corpus this
 * scanner opens, so a name or a date listed because a `.ts` fixture under `test/` needed it is
 * equally excused in `README.md`, in `docs-content/` and in a `.dcm`. Measured: a `docs-content`
 * page carrying the values this change added exits 1 on `8982a16` and 0 here. The two worth
 * naming are `DATE:19800101` and `DATE:20240115`, which are plausible real birth and study
 * dates. Path scoping is a change to the allow-list FORMAT and is deliberately not made; the
 * reasoning lives beside the entries, in the file itself.
 * ---------------------------------------------------------------------------
 *
 * SECURITY: All git invocations use execFileSync with array args. Never any
 * shell-form spawn. The single subprocess this script makes is `git`, called
 * exclusively via array-form arguments.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass for one path; rejected if not logged in phi-scan-overrides.md
 *   --max-hit-lines <n>      - print at most n hit lines PER FILE; `0` prints every one
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan both corpora in the working tree
 *
 * Exit codes: 0 (no hits), 1 (hits found), 2 (invocation error). The word "clean" used to stand
 * where "no hits" does, and it is cut rather than qualified: a run can exit 0 having stopped the
 * DICOM sweep partway through an object, which `reportUnread` states on stderr and the exit code
 * deliberately does not carry. See the note at the bottom of `main`.
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
 * TWO IS WHERE THIS DEFECT LIVED. The walk covers everything under each declared
 * root except a gitignored entry (the same rule that already excludes a gitignored
 * fixture, so links do not get a second, stricter boundary of their own) and the
 * single corpus exemption, which is NAMED ON STDOUT EVERY RUN. `--staged` covers
 * each declared root's own path and everything under it, restricted to the staged
 * records git reports as ADDED, MODIFIED or TYPECHANGED - a deletion has no staged
 * blob to scan and an unmerged path has no single one, and both are still out of
 * scope.
 *
 * The places that boundary has MOVED are called out rather than folded into
 * "narrowing", because each admits MORE than before: rename detection is off, so a
 * rename destination now arrives as an ordinary add instead of vanishing with its
 * two-path record; each root's own path is in scope as well as its contents; and
 * the walk root is `test/` rather than `test/fixtures/`.
 *
 * NOTHING HAS MOVED THE OTHER WAY, AND A DRAFT THAT MOVED ONE WAS REFUTED. The one
 * corpus exemption belongs to the `all` route alone; teaching `--staged` to honour
 * it would have subtracted a detection the base had on the route the pre-commit
 * hook runs. So the two routes disagree about exactly one file, they disagreed
 * about it on base too, and `--staged` is the stricter of the two.
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

import { readFileSync, statSync, lstatSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");
const CUTOFF_YEAR = new Date().getFullYear() - 120;

/**
 * How many hit lines `report` prints PER FILE before it stops printing them and says how many
 * it did not print. `--max-hit-lines 0` prints every one.
 *
 * 🛑 THIS IS A PRINT CAP AND NOTHING ELSE, AND THAT IS THE ONLY REASON IT IS SAFE. `main` derives
 * the exit code from `hits.length`, the summary line reports `hits.length`, and neither is capped,
 * so a line this cap withholds CANNOT turn exit 1 into exit 0 or shrink the number a reader sees.
 * A cap that could do either would be a net leak dressed as tidy output: the gate would print less
 * over a corpus carrying a real name and look calmer for it.
 *
 * 🛑 AND IT IS PER FILE, NEVER GLOBAL. A global cap is the net-leak shape: one flooding file would
 * consume the whole budget and every later file's hits - including a file whose hit names an actual
 * patient - would go unprinted, with the flooding file's path the only one on screen. Per file, the
 * set of PATHS reported is uncapped, every file with a hit still prints its header and its first
 * lines, and the suppression is bounded by a count the same line states exactly.
 *
 * WHY THERE IS A CAP AT ALL, MEASURED RATHER THAN ASSERTED. `DICOM-SCANDICOM-SILENT-HALT` made the
 * text sweep run over every Part 10 object's bytes, and its recognizers fire on image noise at a
 * rate that is a property of the payload's byte histogram. Re-measured on `b784c38` over 8 MiB of
 * synthetic `(7FE0,0010) OW` pixel data: a uniform `0x41-0x60` payload produced tens of thousands of
 * hits and one stderr line each. The figures, the generator and the negative control are in
 * `documentation/agent-notes/dicom-phi-scan-report-cap.md`; no rate is copied here, because it is a
 * fact about that payload's histogram and not about this script.
 */
const DEFAULT_HIT_LINES_PER_FILE = 20;

/**
 * The TEST corpus root, repo-relative. `test`, not `test/fixtures`: see the banner.
 *
 * 🛑 THE ROOTS MUST STAY DISJOINT. Listing `test` beside `test/fixtures` would enumerate
 * everything under the latter TWICE and report every hit in it twice, so `test` REPLACES the
 * old root rather than joining it.
 */
const TEST_SCOPE = "test";

/**
 * A declared root, with the SHAPE it is declared to have.
 *
 * The shape is carried rather than inferred, because `README.md` is legitimately a regular
 * file and `test` legitimately a directory, and "whatever is there" is exactly the reading
 * that let a corpus root replaced by a blob through. A root that is the wrong shape is
 * refused, not silently scanned as whatever it became.
 */
interface Root {
  rel: string;
  shape: "directory" | "file";
}

/**
 * The DOC corpus roots, repo-relative.
 *
 * `README.md` is in the corpus even though the walk exempts `test/fixtures/phi-scan/README.md`.
 * That exemption is about a file that DOCUMENTS violator values on purpose; the package's own
 * README is the npm-visible front page and carries no such role. `docs-content/` is walked
 * whole rather than filtered to `.md`, because `scanTarget` already dispatches by content and
 * a doc asset that is not markdown is still a doc asset.
 */
const DOC_ROOTS: Root[] = [
  { rel: "README.md", shape: "file" },
  { rel: "docs-content", shape: "directory" },
];

/** Every declared root. Used by the walk, `--staged`, and the reconciliation. */
const SCAN_ROOTS: Root[] = [{ rel: TEST_SCOPE, shape: "directory" }, ...DOC_ROOTS];

/** The declared roots' repo-relative paths, for the `--staged` scope test and `git ls-files`. */
const SCAN_SCOPE = SCAN_ROOTS.map((r) => r.rel);

/**
 * THE ONE EXEMPTION, AND IT IS THE ONE THAT WAS ALREADY HERE.
 *
 * `test/fixtures/phi-scan/README.md` documents the synthetic violator values the scanner's own
 * unit tests plant (it names them in a table, so a reader can tell a deliberate violator from a
 * mistake). Scanning it would red the gate on a file whose entire purpose is to carry those
 * values.
 *
 * 🛑 IT IS ONE LITERAL PATH, NOT A PREDICATE, AND THE DIRECTION IT FAILS IN IS WHY. A first
 * draft wrote it as "a `readme.md` under `test/fixtures/`" on the reasoning that a rule cannot
 * go stale. A refuter refused that, correctly: a STALE EXACT PATH fails CLOSED (the file moved,
 * so it is scanned, and the gate reds until somebody looks), while a PREDICATE fails OPEN
 * (every future `README.md` anywhere under `test/fixtures/`, at any depth, is exempt for as
 * long as nobody notices). Staleness that reds is the cheap failure; an exemption that quietly
 * grows is the expensive one.
 *
 * Widening the walk root to `test/` therefore does not widen this by one file: a `README.md`
 * anywhere else is scanned like any other file, and `test/smoke/README.md` now is.
 *
 * 🛑 AND IT IS THE `all` ROUTE'S EXEMPTION ONLY. `--staged` never applied it, and this change
 * does NOT teach it to: that would SUBTRACT a detection the base had, on the route the
 * pre-commit hook runs, which is the one direction this item forbids. The two routes therefore
 * disagree about exactly one file, and they did on base too. `PRE-EXISTING`, and it fails
 * closed: staging that README reds the hook.
 *
 * It never reaches an entry that is not a regular file. This exemption is a judgement about a
 * file whose bytes the walk could have read; a link's NAME is no evidence at all about what is
 * on the other side of it.
 *
 * Every exempt path is PRINTED ON EVERY RUN (see `reportExemptions`). An exemption nobody can
 * see is the same shape as a root nobody notices is empty.
 */
const CORPUS_EXEMPT = new Set(["test/fixtures/phi-scan/README.md"]);

function isCorpusExempt(relPath: string): boolean {
  return CORPUS_EXEMPT.has(relPath);
}

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

/** The base64 alphabet, as a character test. `=` is padding and is handled by the caller. */
function isBase64Char(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x30 && code <= 0x39) || // 0-9
    code === 0x2b || // +
    code === 0x2f // /
  );
}

/**
 * Every maximal base64 run of at least `MIN_BASE64_RUN` characters, with up to two `=` of padding.
 *
 * 🛑 THIS WAS `new RegExp("[A-Za-z0-9+/]{" + MIN_BASE64_RUN + ",}={0,2}", "g")` AND A REGEX IS THE
 * WRONG TOOL FOR IT, MEASURED RATHER THAN ASSERTED. V8's backtracking engine keeps per-character
 * state for a greedy quantifier, so ONE long run overflows the backtrack stack: an 8 MiB run threw
 * `RangeError: Maximum call stack size exceeded`, which `run()` turns into exit 2 - the scan refusing
 * outright. Measured on `21e25a0`, on a plain `.md` carrying one run, so it is `PRE-EXISTING` and
 * reachable on the doc corpus: 0.5/1/2/4 MiB exit 0, 8 MiB exits 2. It is closed here rather than
 * disclosed because `DICOM-SCANDICOM-SILENT-HALT` sends whole Part 10 objects down this route, and a
 * Part 10 object is routinely megabytes of pixel data.
 *
 * The loop yields exactly what the pattern matched - maximal runs, the same floor, the same trailing
 * `=` allowance - in one forward pass with no backtracking and no per-character stack. It is a
 * different REPRESENTATION of the same predicate, not a wider or narrower one.
 *
 * 🛑 NO TEST PINS THAT EQUIVALENCE, AND AN EARLIER DRAFT OF THIS PARAGRAPH SAID ONE DID. It named
 * `test/scripts/phi-scan.test.ts`, which pins the no-refusal PROPERTY and nothing about the run set;
 * a disclosure that names a test must name one that exists, so the sentence is DELETED rather than
 * reworded. It cannot be a unit test as things stand: this is a CLI that runs its scan at module
 * scope, so `base64Runs` is not importable. What the suite does pin is the FLOOR, which is the
 * end a narrowing would show up at first - `"reaches the SHORTEST real fixture in docs-content, not
 * just a test-built one"` takes the shortest DICOM-shaped run out of the shipped `docs-content/`
 * corpus and requires the scanner to find a name appended to it. The whole-corpus comparison is
 * measured out of band, and it is one command rather than a numeral copied into prose:
 *
 *   git ls-files -z -- docs-content README.md test src scripts | xargs -0 node -e '...'
 *
 * comparing `[...t.matchAll(/[A-Za-z0-9+\/]{16,}={0,2}/g)].map(m => m[0])` with `[...base64Runs(t)]`.
 *
 * Built from the floor so the two cannot drift: a hardcoded quantifier made the constant dead, and a
 * dead constant is the shape where changing the number changes nothing. It is a generator holding no
 * cursor between calls, so nothing can be carried between files (the `lastIndex` hazard a fresh
 * `RegExp` per call used to answer).
 */
function* base64Runs(text: string): Generator<string> {
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (!isBase64Char(text.charCodeAt(i))) {
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end < n && isBase64Char(text.charCodeAt(end))) end += 1;
    if (end - i < MIN_BASE64_RUN) {
      i = end;
      continue;
    }
    let padded = end;
    while (padded < n && padded - end < 2 && text.charCodeAt(padded) === 0x3d) padded += 1;
    yield text.slice(i, padded);
    i = padded;
  }
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

/**
 * What one file's Part 10 objects left UNREAD by the tag walk, aggregated over every object in it.
 *
 * 🩺 WHY THERE IS A RECORD HERE AT ALL. `scanDicom` stops at the first header it cannot read and
 * says nothing, so a caller got `OK - no hits` over a file the DICOM sweep had abandoned partway
 * through. A guard that has never been pointed at an input has not cleared that input, and the
 * commonest way in is CONFORMANT: PS3.5 2026c §7.5.2 makes `0xFFFFFFFF` one of two Sequence
 * delimitations, both of which decoders shall support, and §7.1 orders tags ascending, so
 * `(0008,1110)` sits before `(0010,0010)` in a conformant file.
 *
 * 🛑 WHAT IT CARRIES, AND THE LIST IS THE CONTRACT: the file's own repo-relative path (the same
 * locus every hit already carries), two COUNTS, and tokens from the closed `HALT_REASONS` table.
 * WHAT IT DELIBERATELY DOES NOT CARRY: no tag, no VR, no value, and no byte of the object. The
 * bytes at a halt are precisely the bytes that did not read as a header, so anything named off
 * them is unvouched-for input.
 *
 * 🩺 "NO OFFSET" IS NOT ON THAT LIST AND MUST NOT BE PUT BACK ON IT. No offset is PRINTED, but for
 * a file holding one object `bytes` is `objectLength - haltOffset`, and the object's length is the
 * file's own committed size, so the halt offset is recoverable. That is the same locus a hit line
 * already prints outright, beside a value; the honest statement is that the counts are structural
 * positions and not content, not that a position is absent.
 *
 * 🛑 AND IT IS BOUNDED IN MEMORY, WHICH `hits` IS NOT. One entry per file, each holding two
 * numbers and a Set that cannot exceed the six literals in `HALT_REASONS`, so an attacker-chosen
 * object count moves the counts and not the footprint. That is a deliberate difference from
 * `hits`, whose unbounded growth is this item's other open residual.
 */
interface UnreadTally {
  /** How many objects in this file the tag walk stopped short of the end of. */
  objects: number;
  /** How many bytes, summed over those objects, the tag walk never reached. */
  bytes: number;
  /** Which of the closed reasons were seen. A Set, so the line cannot repeat itself. */
  reasons: Set<HaltReason>;
}

/** Per-file unread tallies, keyed by the same `target.path` a hit carries. */
type UnreadByPath = Map<string, UnreadTally>;

function recordUnread(unread: UnreadByPath, path: string, bytes: number, reason: HaltReason): void {
  const existing = unread.get(path);
  if (existing === undefined) {
    unread.set(path, { objects: 1, bytes, reasons: new Set([reason]) });
    return;
  }
  existing.objects += 1;
  existing.bytes += bytes;
  existing.reasons.add(reason);
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
  maxHitLines: number; // hit lines printed per file; 0 prints every one
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
  let maxHitLines = DEFAULT_HIT_LINES_PER_FILE;
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
    } else if (a === "--max-hit-lines") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--max-hit-lines requires a count argument");
      }
      // A non-negative INTEGER only. `Number` alone accepts `1e9`, `0x10`, ` 3 `
      // and `Infinity`, and a cap silently read off one of those is a cap nobody
      // set. A bad value REFUSES (exit 2) rather than falling back to the
      // default, because a run that quietly printed a different amount than it
      // was told to is the same shape of unobservable behaviour this whole
      // script is written against.
      if (!/^\d+$/.test(next)) {
        throw new InvocationError(
          `--max-hit-lines expects a non-negative integer, got ${JSON.stringify(next)} ` +
            "(use 0 to print every hit line).",
        );
      }
      maxHitLines = Number(next);
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
  return { mode, paths, allowFixtures, maxHitLines };
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

/**
 * The predicates `Dirent` and `Stats` share. Structural on purpose: the walk reads a
 * `Dirent` and the ROOT check reads an `lstat` `Stats`, and both must classify an entry
 * from the same closed set or the two routes would describe the same shape differently.
 */
interface KindProbe {
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
}

/** Closed-set, engine-owned description of a directory entry's kind. */
function entryKind(e: KindProbe): string {
  if (e.isSymbolicLink()) return "a symbolic link";
  if (e.isFIFO()) return "a FIFO";
  if (e.isSocket()) return "a socket";
  if (e.isBlockDevice()) return "a block device";
  if (e.isCharacterDevice()) return "a character device";
  return "not a regular file";
}

interface Enumeration {
  files: string[];
  unscannable: Unscannable[];
  missingRoots: string[];
}

/**
 * Enumerate every declared root.
 *
 * 🛑 THE ROOT IS `lstat`ed, NEVER `existsSync`ed, AND THAT IS THE WHOLE POINT OF THIS
 * FUNCTION'S SHAPE. `existsSync` FOLLOWS a symbolic link, so a DANGLING one answers `false`
 * and the old code `continue`d past the root without a word: `walk()` was never called, so
 * `readdirSync` never ran and the not-a-regular-file rule that catches a link INSIDE the root
 * never fired for the root itself. Measured on `8982a16`: `test/fixtures` replaced by a link
 * to a nonexistent path, and by a link to a real directory, both printed `OK - no hits` and
 * exited 0. `lstat` answers about the link, not the target, so the root is classified by the
 * same closed set as any entry under it.
 *
 * A MISSING root is recorded rather than skipped, for the reason `terminology` paid for: a
 * declared root that never existed prints clean on every run it ever makes.
 *
 * 🛑 AND A COUNT IS NOT A DETECTOR. Recording missing roots does not stand in for
 * `reconcileWithGit`: a root that EXISTS and has been EMPTIED opens nothing while remaining
 * perfectly present, and a denominator counts the roots that DID exist. Both checks run.
 */
function enumerateAll(): Enumeration {
  const files: string[] = [];
  const unscannable: Unscannable[] = [];
  const missingRoots: string[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root.rel);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      missingRoots.push(root.rel);
      continue;
    }
    if (st.isDirectory()) {
      if (root.shape === "directory") walk(abs, files, unscannable);
      else
        unscannable.push({ path: root.rel, kind: "a directory, where a regular file is declared" });
    } else if (st.isFile()) {
      if (root.shape === "file") files.push(abs);
      else
        unscannable.push({ path: root.rel, kind: "a regular file, where a directory is declared" });
    } else {
      unscannable.push({ path: root.rel, kind: entryKind(st) });
    }
  }
  return { files, unscannable, missingRoots };
}

/**
 * Enumerate one root. `Dirent`'s predicates are lstat answers and are not exhaustive: an
 * entry that is neither a directory nor a regular file is collected into `unscannable`
 * rather than dropped, so the caller can refuse instead of reporting clean over it.
 *
 * The corpus exemption is NOT applied here. The walk collects every regular file it reaches
 * and `buildTargetsForAll` partitions them, so an exempt file is a path the reconciliation
 * can ACCOUNT FOR and the report can NAME, rather than one that silently never existed.
 */
function walk(dir: string, out: string[], unscannable: Unscannable[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out, unscannable);
    } else if (e.isFile()) {
      out.push(full);
    } else {
      unscannable.push({ path: normalizePath(full), kind: entryKind(e) });
    }
  }
}

/**
 * Every path git TRACKS under the declared roots.
 *
 * This is the reconciliation's authority, and it is deliberately a different source from the
 * filesystem walk: the walk can only report what a root handed it, so a root that is missing,
 * emptied, dangling or swapped hands it nothing and the walk has nothing to be suspicious
 * about. `git ls-files` answers from the index instead, which does not care what the working
 * tree currently looks like.
 *
 * A failure here REFUSES rather than returning an empty list. An empty list would silently
 * make the reconciliation vacuous, which is precisely the failure mode being closed.
 *
 * 🔴 WHAT IT STILL CANNOT DO, DISCLOSED: a LEGITIMATELY empty answer is indistinguishable from
 * nothing to check. In a repository where nothing under the declared roots is tracked yet, the
 * reconciliation has no authority to reconcile against and passes in silence. It is a check
 * against the INDEX, so it is exactly as strong as the index is, and it is at its weakest on a
 * fresh tree - which is also where a corpus is least likely to exist to be missed.
 */
function trackedInScope(): string[] {
  try {
    // SECURITY: array-form execFileSync, no shell.
    const out = execFileSync("git", ["ls-files", "-z", "--", ...SCAN_SCOPE], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out
      .toString("utf8")
      .split("\0")
      .filter((p) => p.length > 0);
  } catch (err) {
    throw new InvocationError(
      `git ls-files failed: ${err instanceof Error ? err.message : String(err)}. ` +
        "Refusing rather than reconciling against a list that may be short.",
    );
  }
}

/**
 * Refuse (exit 2) when git tracks a file under a declared root that the walk did not account
 * for. Every tracked path must land in exactly one of three buckets: OPENED, GITIGNORED, or
 * corpus-EXEMPT. Anything else means the walk did not reach a file a commit carries.
 *
 * 🔴 WHAT THIS DOES NOT CLOSE, AND NO REPO IN THIS ORG HAS: THE COMPARISON IS OVER PATH SETS,
 * NOT OVER THE BYTES GIT CARRIES AT THOSE PATHS. A root swapped for a directory that mirrors
 * the tracked NAMES still reconciles and still exits 0, over whatever decoy contents those
 * names hold. Widening the root makes that narrower rather than safer: a decoy now has to
 * mirror 94 tracked names instead of 13. It is disclosed rather than claimed away.
 */
function reconcileWithGit(accounted: Set<string>): void {
  const missed = trackedInScope().filter((p) => !accounted.has(p));
  if (missed.length === 0) return;
  const lines = missed
    .slice(0, 40)
    .map((p) => `  - ${p}`)
    .join("\n");
  const more = missed.length > 40 ? `\n  ... and ${String(missed.length - 40)} more` : "";
  throw new InvocationError(
    `refusing the scan: git tracks ${String(missed.length)} file(s) under the declared roots ` +
      `(${SCAN_SCOPE.join(", ")}) that the walk did not open:\n${lines}${more}\n` +
      // The message names the CONDITION it actually observed and lists the causes as causes.
      // A first draft asserted "a root that is missing, emptied, dangling or swapped", which is
      // wrong for the commonest way to reach this line by far: an ordinary `rm` of a tracked
      // file mid-refactor, with every root perfectly intact.
      "Every tracked path under a declared root has to be opened, gitignored or corpus-exempt. " +
      "The usual cause is an unstaged deletion of a tracked file; the ones this check exists " +
      "for are a root that is emptied, swapped, or replaced by something the walk cannot " +
      "enumerate, because a clean result over one of those is a statement about an unopened " +
      "corpus. Restore the files, stage the deletion, or narrow the declared scope deliberately.",
  );
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

/** Corpus-exempt paths the last `all`-mode enumeration accounted for, for the report. */
const exemptThisRun: string[] = [];

function buildTargetsForAll(): Target[] {
  const { files, unscannable, missingRoots } = enumerateAll();

  if (missingRoots.length > 0) {
    throw new InvocationError(
      `refusing the scan: ${String(missingRoots.length)} declared root(s) do not exist:\n` +
        missingRoots.map((p) => `  - ${p}`).join("\n") +
        "\nA declared root that is not there opens nothing and reports clean on every run it " +
        "ever makes. Restore it, or remove it from the declared scope deliberately.",
    );
  }

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

  const opened: string[] = [];
  exemptThisRun.length = 0;
  for (const abs of files) {
    const rel = normalizePath(abs);
    if (ignored.has(rel)) continue;
    if (isCorpusExempt(rel)) exemptThisRun.push(rel);
    else opened.push(rel);
  }

  // Both routes' outputs are accounted for, plus the ignore set: a tracked-and-ignored path
  // (`git add -f` over a `.gitignore` line) is out of scope for the scan but is not a walk
  // failure, so it must not read as one.
  reconcileWithGit(new Set([...opened, ...exemptThisRun, ...ignored]));

  return opened.map((rel) => ({
    path: rel,
    read: () => readFileSync(join(REPO_ROOT, rel)),
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

  // Each ROOT'S OWN PATH is in scope as well as everything under it. An index entry at exactly
  // `test` is never a directory - git records no entry for one - so it is a corpus root replaced
  // by a blob, a link or a gitlink, and the prefix test alone let that through (measured: exit 0
  // over a staged mode-120000 `test/fixtures`). Only the "never a directory" half is load-bearing
  // for the `===` test; the other three are all handled below. `README.md` is a file, so only the
  // `===` half can ever match it.
  //
  // The scope root is `test`, matching the all-mode walk. The two routes are meant to answer the
  // same question about the same corpus, and they disagreed while one rooted at `test/fixtures`.
  const inScope = staged.filter((s) =>
    SCAN_SCOPE.some((root) => s.path === root || s.path.startsWith(`${root}/`)),
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

  // 🛑 THE CORPUS EXEMPTION IS DELIBERATELY NOT APPLIED HERE, AND A DRAFT THAT APPLIED IT WAS
  // REFUTED. This route has never exempted `test/fixtures/phi-scan/README.md`, so teaching it to
  // would SUBTRACT a detection the base had, on the route the pre-commit hook runs
  // (`package.json`'s `pre-commit` is `pnpm phi-scan --staged`). Measured on `8982a16`: staging a
  // README under `test/fixtures/` carrying a name exits 1 there, and a draft of this change made
  // the same input exit 0.
  //
  // So the two routes disagree about exactly one file, they disagreed about it on base too, and
  // the disagreement fails CLOSED: `--staged` is the stricter of the two. `PRE-EXISTING`,
  // disclosed rather than closed, because closing it in the only direction available here means
  // scanning less.
  exemptThisRun.length = 0;

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

/**
 * Closed-set, engine-owned descriptions of why the tag walk stopped short of an object's end.
 *
 * 🛑 IT IS A CLOSED TABLE FOR THE SAME REASON `entryKind` AND `gitModeKind` ARE, AND THAT IS THE
 * WHOLE OF WHAT MAKES THE DISCLOSURE SAFE. The trigger for every one of these is "these bytes did
 * not read as a Data Element header", so the bytes at the halt ARE INPUT: they can be the middle
 * of somebody's value, and a message that quoted them, or named the tag or VR it thinks it saw
 * there, would be a diagnostic about a PHI leak that carries PHI. Each value below is a LITERAL
 * chosen at authoring time; nothing read off a scanned file can reach one, and there is no string
 * parameter for anything to travel through.
 */
const HALT_REASONS = {
  /** Fewer bytes remain than the shortest header needs. Reached only through the long form. */
  truncatedHeader: "a header the remaining bytes cannot hold",
  /** Explicit VR only: the two bytes where a VR belongs are not two uppercase letters. */
  vrNotTwoLetters: "a header whose VR field is not two uppercase letters",
  /** PS3.5 2026c §7.5.2's other Sequence delimitation. A CONFORMANT file reaches this. */
  undefinedLength: "an undefined-length value (0xFFFFFFFF)",
  /** The declared length would run the walk past the last byte of the object. */
  valuePastEnd: "a value length that runs past the end of the object",
  /** Defensive: a header that would not move the cursor forward. */
  noAdvance: "a header that does not advance the walk",
  /** Not a halt on a header at all: the walk consumed everything an element could start in. */
  tailTooShort: "a tail too short to hold an element header",
} as const;

type HaltReason = (typeof HALT_REASONS)[keyof typeof HALT_REASONS];

/**
 * One header read: the header, or the reason the walk cannot go on.
 *
 * It was `ElementHeader | null`, and the `null` is the whole of what
 * `DICOM-PHI-SCAN-RESIDUALS` was filed against: five distinguishable conditions arrived at the
 * caller as one indistinguishable value, so the caller could not say anything about them and
 * said nothing. The PREDICATES below are unchanged, in the same order, with the same outcomes;
 * only what a refusal CARRIES is new.
 */
type ElementRead = { ok: true; header: ElementHeader } | { ok: false; reason: HaltReason };

function readElementExplicit(buf: Buffer, offset: number): ElementRead {
  if (offset + 8 > buf.length) return { ok: false, reason: HALT_REASONS.truncatedHeader };
  const group = buf.readUInt16LE(offset);
  const element = buf.readUInt16LE(offset + 2);
  const vr = buf.toString("ascii", offset + 4, offset + 6);
  if (!/^[A-Z]{2}$/.test(vr)) return { ok: false, reason: HALT_REASONS.vrNotTwoLetters };

  let valueOffset: number;
  let valueLength: number;
  if (LONG_FORM_VRS.has(vr)) {
    if (offset + 12 > buf.length) return { ok: false, reason: HALT_REASONS.truncatedHeader };
    valueLength = buf.readUInt32LE(offset + 8);
    valueOffset = offset + 12;
  } else {
    valueLength = buf.readUInt16LE(offset + 6);
    valueOffset = offset + 8;
  }
  // Undefined-length sequences (0xFFFFFFFF) - we don't recurse, just stop.
  if (valueLength === 0xffffffff) return { ok: false, reason: HALT_REASONS.undefinedLength };
  const nextOffset = valueOffset + valueLength;
  if (nextOffset > buf.length) return { ok: false, reason: HALT_REASONS.valuePastEnd };
  return { ok: true, header: { group, element, vr, valueOffset, valueLength, nextOffset } };
}

function readElementImplicit(buf: Buffer, offset: number): ElementRead {
  if (offset + 8 > buf.length) return { ok: false, reason: HALT_REASONS.truncatedHeader };
  const group = buf.readUInt16LE(offset);
  const element = buf.readUInt16LE(offset + 2);
  const valueLength = buf.readUInt32LE(offset + 4);
  if (valueLength === 0xffffffff) return { ok: false, reason: HALT_REASONS.undefinedLength };
  const valueOffset = offset + 8;
  const nextOffset = valueOffset + valueLength;
  if (nextOffset > buf.length) return { ok: false, reason: HALT_REASONS.valuePastEnd };
  // Resolve VR from our hardcoded subset.
  const key = tagKey(group, element);
  let vr = "UN";
  if (PN_TAGS.has(key)) vr = "PN";
  else if (DA_TAGS.has(key)) vr = "DA";
  else if (DT_TAGS.has(key)) vr = "DT";
  return { ok: true, header: { group, element, vr, valueOffset, valueLength, nextOffset } };
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

/**
 * Walk one Part 10 object's tag table, and RECORD what the walk did not reach.
 *
 * 🛑 THE WALK IS UNCHANGED. Every predicate, in the same order, with the same outcome: this reads
 * exactly the elements it read before, `inspectElement` is called on exactly the same set, and
 * `hits` is therefore identical on every input. The addition is `unread`, and it is a second
 * output channel rather than a change to the first one, so the exit code cannot move.
 *
 * 🛑 THE FILE-META LOOP RECORDS NOTHING, AND ITS `break` IS NOT A HALT. `peekGroup !== 0x0002` is
 * how a well-formed object leaves the File Meta group for its dataset; recording that would put a
 * disclosure on EVERY object and make the one that matters unreadable.
 *
 * 🔴 SO A FILE-META HALT IS REPORTED ONLY IF THE DATASET LOOP ALSO STOPS AT THAT OFFSET, AND UNDER
 * IMPLICIT VR LE IT MAY NOT. A first draft of this comment said the dataset loop "re-reads the same
 * offset and records the same reason, so nothing is lost", and a refuter falsified both halves:
 * `readElementImplicit` is a DIFFERENT predicate set, so the same bytes can yield a different
 * reason, or read as a header and let the walk continue past the offset the File Meta group gave
 * up at. Under Explicit VR the two loops do agree, because they call the same reader. It is stated
 * rather than closed: the remedy is to record in the file-meta loop too, and that is a second
 * disclosure with its own shape.
 *
 * The tail check is `offset < buf.length` and not "the loop broke", because the two are different
 * conditions and only the first is the question being asked. A walk can also run out of room
 * WITHOUT a broken header, when fewer than eight bytes remain; those bytes were never read either,
 * and `tailTooShort` is what says so.
 */
function scanDicom(
  target: Target,
  buf: Buffer,
  allow: AllowList,
  hits: Hit[],
  unread: UnreadByPath,
): void {
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
    if (!result.ok) break;
    const { group, element, vr, valueOffset, valueLength, nextOffset } = result.header;
    if (group === 0x0002 && element === 0x0010 && vr === "UI") {
      transferSyntax = decodeAscii(buf, valueOffset, valueLength).replace(/\0+$/, "").trim();
    }
    inspectElement(target, buf, group, element, vr, valueOffset, valueLength, allow, hits);
    offset = nextOffset;
  }

  const implicit = transferSyntax === "1.2.840.10008.1.2";
  let stoppedOn: HaltReason | null = null;
  // Continue with dataset.
  while (offset + 8 <= buf.length) {
    const result = implicit ? readElementImplicit(buf, offset) : readElementExplicit(buf, offset);
    if (!result.ok) {
      stoppedOn = result.reason;
      break;
    }
    const { group, element, vr, valueOffset, valueLength, nextOffset } = result.header;
    inspectElement(target, buf, group, element, vr, valueOffset, valueLength, allow, hits);
    if (nextOffset <= offset || nextOffset > buf.length) {
      stoppedOn = nextOffset <= offset ? HALT_REASONS.noAdvance : HALT_REASONS.valuePastEnd;
      break;
    }
    offset = nextOffset;
  }

  if (offset < buf.length) {
    recordUnread(unread, target.path, buf.length - offset, stoppedOn ?? HALT_REASONS.tailTooShort);
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
 *
 * 🛑 A DECODED OBJECT GETS THE TEXT SWEEP TOO, FOR THE REASON IN `scanTarget`'S SUPERSET TABLE, AND
 * THE BASE64 IS WHY IT IS NOT ALREADY COVERED. `scanDicom` gives up quietly, so an object whose name
 * sits behind an undefined-length `SQ` is read no further; and the enclosing file's own text sweep
 * cannot stand in for it here, because the object arrives BASE64-ENCODED - the name is not in the
 * page's bytes in any form the PN regex could match. Measured on `21e25a0`, a preamble-ful object
 * carrying `(0008,1110)` undefined-length `SQ` before a name-bearing `(0010,0010)`: exit 0 and
 * `OK - no hits` as a `.md`, exit 1 here. The decoded text sweep is an ADDITION beside `scanDicom`,
 * never a replacement for it.
 *
 * The decode is NOT re-entered on the decoded bytes. One level is what a doc fixture is; a scanner
 * that recursed would spend unbounded time on an object whose pixel data happens to be alphanumeric.
 */
function scanEmbeddedObjects(
  target: Target,
  text: string,
  allow: AllowList,
  hits: Hit[],
  unread: UnreadByPath,
): void {
  for (const run of base64Runs(text)) {
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
    // An embedded object's unread tail is attributed to the PAGE, which is the file a developer
    // has to edit, exactly as its hits are. The tallies aggregate, so a page carrying several
    // halting objects reports one line with a count rather than one line each.
    scanDicom(target, decoded, allow, hits, unread);
    scanText(target, decoded.toString("utf8"), allow, hits);
  }
}

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
 * 🛑 AND THE PREAMBLE IS NOT WHAT MAKES `scanDicom` GIVE UP, SO IT MUST NOT DECIDE WHO GETS THE TEXT
 * SWEEP (`DICOM-SCANDICOM-SILENT-HALT`). The halt above is a property of the DATASET - an
 * undefined-length `SQ`, a non-LE transfer syntax, a header that will not read - and 132 bytes of
 * preamble and magic in front of it change none of that. While the text sweep was an `isDicom`-false
 * `else`, the identical dataset was caught without a preamble and MISSED with one, in silence.
 * Measured on `21e25a0` over `(0008,1110)` undefined-length `SQ` then a name-bearing `(0010,0010)`:
 * preamble-less exit 1, preamble-ful exit 0 and `OK - no hits`. A gate that reports clean over a name
 * is a false green; the text sweep therefore runs on EVERY binary target, unconditionally.
 *
 * So the dispatch asks TWO independent questions and runs BOTH answers. What it does is a strict
 * SUPERSET of what gating on `isDicom` did, on every input, which is the property to preserve if this
 * ever changes again:
 *
 *   - `isDicom` true  -> `scanDicom` AND `scanText` AND `scanEmbeddedObjects`. The DICOM sweep is what
 *                        it always got; the other two are the addition, and nothing can be lost.
 *   - preamble-less   -> the same three. Both halves since `DICOM-SCANTARGET-PREAMBLELESS`.
 *   - neither         -> `scanText` AND `scanEmbeddedObjects`. Byte-for-byte the old behaviour.
 *
 * (`scanEmbeddedObjects` is named in every row on purpose. A table that stopped at `scanText` read as
 * though the base64 decode were a markdown feature, and this file already records what scoping it that
 * way cost.)
 *
 * The cost is stated rather than left to be discovered, and it was taken deliberately. A DICOM object
 * can now report the same value twice, once under its tag and once as `(text)`; two lines naming one
 * value is not a defect in a gate whose output a human reads before committing, and a missing line is.
 *
 * 🛑 THE REAL PRICE IS FALSE POSITIVES OVER BINARY VALUES, AND NO SENTENCE HERE SAYS WHICH RECOGNIZER
 * PRODUCES THEM. That is deliberate. Two drafts tried, one naming the compact-date pass and one naming
 * the PN-shape pass, and a `conformance-refuter` refuted both; a claim reworded twice is DELETED here
 * rather than written a third time. WHICH RECOGNIZER DOMINATES IS A PROPERTY OF THE PAYLOAD'S BYTE
 * HISTOGRAM, not of this script: measured over 8 MiB of synthetic pixel data, the hit count runs from
 * 0 to five figures, with the PN pass dominant on some histograms and a date pass dominant on others.
 * Read the table in `documentation/agent-notes/dicom-scandicom-silent-halt.md` rather than carrying a
 * rate, or a recognizer's name, out of here.
 *
 * It is still the `DICOM-DEIDENT-OVER-REDACTION` shape, and the trade is still not symmetric: a false
 * positive costs a developer one look at a hit line, while the silent halt it replaces printed
 * `OK - no hits` over a patient name.
 *
 * 🛑 AND THE THREE ROWS ABOVE ARE THE WHOLE TABLE, BECAUSE NOTHING IS DISPATCHED BY NAME ANY MORE.
 * There was a fourth row, keyed on the file's EXTENSION and taken before any of them: `.json`,
 * `.txt`, `.md` and `.csv` ran `scanText` and `scanEmbeddedObjects` and returned, so `scanDicom`
 * never ran on one whatever its bytes were. That is the same defect as the two above, wearing a
 * name instead of a preamble: the halt, the preamble and now the FILENAME are all things that do
 * not decide what the bytes are. Measured on `08ed3ee` over one Part 10 object carrying a
 * single-component `(0010,0010)` - a shape with no caret, so the text sweep's PN pass cannot match
 * it and only the tag table can - the SAME BYTES exited 1 as `.dcm`, `.bin` and `.dat`, and 0 with
 * `OK - no hits` as `.md`, `.txt`, `.json` and `.csv`. Preamble-less, the same. A de-identification
 * report, a bug repro or a fixture saved under the wrong name therefore carried a patient name
 * straight through the gate.
 *
 * 🛑 THE REMEDY IS A DELETION, AND THAT IS WHY IT CANNOT BE THE NET LEAK `#97` PAID FOR. The removed
 * branch's two calls are `scanText` and `scanEmbeddedObjects`; the branch that replaces it makes the
 * SAME two calls unconditionally and adds one more. `hits` is only ever appended to, so the HIT SET,
 * the TOTALS and the EXIT CODE are a strict superset on every input, and no route was swapped for
 * another.
 *
 * What the deleted branch was FOR, and why the reason does not survive: a `.md` whose first bytes
 * look like group `0002` is still a document, so it must not lose `scanEmbeddedObjects`. It does not.
 * That argument was only ever against an exclusive swap, and there is no swap here.
 *
 * The full 11-object x 7-extension matrix, the mechanical superset check over its 77 cells, and the
 * reason the sibling residual is NOT closed with it are in
 * `documentation/agent-notes/dicom-phi-scan-name-dispatch.md`. No count off it is copied here.
 */
function scanTarget(target: Target, allow: AllowList, hits: Hit[], unread: UnreadByPath): void {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // 🛑 NOTHING IS READ OFF THE PATH HERE, AND `extname` IS GONE ON PURPOSE. Every target gets the
  // same two questions, and they are two questions rather than one choice. See the superset table
  // above before adding a test on the NAME back, or before making either of these an `else`.
  if (fileMetaStart(buf) !== null) {
    scanDicom(target, buf, allow, hits, unread);
  }
  // 🛑 UNCONDITIONAL, AND `if (!isDicom(buf))` IS WHAT USED TO BE HERE. That guard made the text
  // sweep an `else` for a preamble-ful Part 10 object, so `scanDicom` halting early on one was
  // SILENT (`DICOM-SCANDICOM-SILENT-HALT`). Do not reintroduce it, and do not reach for any other
  // predicate that decides who is owed a text sweep: the halt is a property of the dataset, and no
  // cheap test on the first 132 bytes can see it.
  const text = buf.toString("utf8");
  scanText(target, text, allow, hits);
  // 🛑 THE EMBEDDED DECODE IS NOT A MARKDOWN FEATURE, AND SCOPING IT TO A SET OF TEXT EXTENSIONS
  // MADE IT ONE. A Part 10 object pasted as base64 into a `.ts` source is the same fixture as one
  // pasted into a `.md` page, and every fixture this package commits is built in a `.ts` file.
  // Measured on `8982a16` with one object and one name: as `probe.md` it was found, as
  // `probe.dcm` it was found, as `probe.ts` the run printed `OK - no hits`. Widening the walk
  // root to `test/` without this would have opened 81 `.ts` files and still read past every
  // encoded object in them.
  scanEmbeddedObjects(target, text, allow, hits, unread);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Print the corpus exemptions this run accounted for, whether or not there were hits.
 *
 * An exemption that is not printed is indistinguishable from a file the walk never reached,
 * which is the whole class of defect this script keeps paying for. Printing it makes the
 * exemption an OBSERVATION rather than an assumption, and makes a stale one visible the moment
 * the file it names moves.
 *
 * 🛑 THIS IS NOT A DENOMINATOR AND MUST NOT BE READ AS ONE. It names what was deliberately
 * skipped. What DETECTS an unopened corpus is `reconcileWithGit`; a count of the files that
 * were reached counts only the roots that were there to reach.
 */
function reportExemptions(): void {
  if (exemptThisRun.length === 0) return;
  process.stdout.write(
    `[phi-scan] corpus exemption in force for ${String(exemptThisRun.length)} file(s): ` +
      `${exemptThisRun.join(", ")}\n`,
  );
}

/**
 * Print, per file, what the DICOM sweep did not read.
 *
 * 🛑 THESE ARE NOT HITS AND ARE NOT CAPPED, AND BOTH HALVES ARE DELIBERATE. Not hits, because a
 * halt is not evidence that a name is there; `hits` stays the only input to the exit code and to
 * the totals, so nothing here can move either. Not capped, because the output is already bounded
 * by the number of FILES rather than by anything an object can choose: a page with ten thousand
 * halting objects prints ONE line carrying a count. That is also what keeps it clear of `#104`'s
 * per-file hit cap and of the non-monotonicity underneath it. A file loud enough to bury its own
 * hit lines cannot bury this line, because this line is not in that budget.
 *
 * 🛑 THE MESSAGE STATES THE OBSERVATION AND STOPS THERE. It does not say what the text sweep did
 * with the same bytes. `scanTarget` and `scanEmbeddedObjects` both run `scanText` over the whole
 * buffer unconditionally, so it is tempting to write "but they were swept anyway"; the sweep runs
 * over `buf.toString("utf8")`, which is a lossy decode of arbitrary bytes, and the text pass has
 * no tag table, so the sentence would be a claim about coverage that neither half supports. It is
 * in `documentation/agent-notes/dicom-phi-scan-unread-tail.md` with its bounds, and not here.
 */
function reportUnread(unread: UnreadByPath): void {
  if (unread.size === 0) return;
  for (const [path, tally] of unread) {
    process.stderr.write(
      `[phi-scan] PARTIAL: ${path}: the DICOM sweep stopped before the end of ` +
        `${String(tally.objects)} object(s), leaving ${String(tally.bytes)} byte(s) it never ` +
        `read: ${[...tally.reasons].join("; ")}\n`,
    );
  }
  process.stderr.write(
    `[phi-scan] the DICOM sweep stopped early in ${String(unread.size)} file(s). A clean ` +
      "result over an object it did not read to the end is not a clearance of that object.\n",
  );
}

/**
 * Print the hits, at most `maxHitLines` of them per file.
 *
 * The three properties that make the cap safe are stated at `DEFAULT_HIT_LINES_PER_FILE` and
 * enforced here: the exit code and the totals are computed off `hits`, not off what was printed;
 * the cap is per file, so no path goes unnamed; and a file that had lines withheld says so, with
 * the exact number and the flag that prints them.
 *
 * The suppression line carries a COUNT and nothing else - no tag, no VR, no value, no offset. A
 * diagnostic about a PHI leak is itself a PHI surface, and a line whose whole job is to say
 * "there is more here" must not become a second way to spill some of it.
 *
 * 🛑 WHICH LINES SURVIVE THE CAP IS SCAN ORDER, NOT FILE ORDER, and it is worth saying because the
 * obvious reading is the wrong one. "The first n hits" is not "the first n in the file".
 */
function report(hits: Hit[], maxHitLines: number, partialFiles: number): void {
  if (hits.length === 0) {
    // 🛑 `OK` IS A CLAIM AND THE OTHER TWO WORDS ARE A MEASUREMENT, so the claim is what goes when
    // the sweep stopped early. "No hits" stays, because it is true and it is what was counted;
    // what cannot stand is the line reading as a clearance of a corpus part of which the tag
    // table never saw. The wording is not a qualified `OK`: the token is gone.
    //
    // With no partial file the line is BYTE-IDENTICAL to what it always was. That is what lets
    // the whole change be a strict superset of the old output rather than a rewrite of it.
    //
    // It says "on stderr" and not "above": this line goes to STDOUT and `reportUnread` writes to
    // STDERR, so a consumer capturing the two separately would find "above" pointing at nothing.
    if (partialFiles === 0) {
      process.stdout.write("[phi-scan] OK - no hits\n");
    } else {
      process.stdout.write(
        `[phi-scan] no hits, over a corpus in which the DICOM sweep stopped early in ` +
          `${String(partialFiles)} file(s), listed on stderr. This run is not an all-clear.\n`,
      );
    }
    return;
  }
  const byPath = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byPath.get(h.path);
    if (arr) arr.push(h);
    else byPath.set(h.path, [h]);
  }
  let withheld = 0;
  for (const [path, group] of byPath) {
    process.stderr.write(`[phi-scan] HIT: ${path}\n`);
    const shown = maxHitLines === 0 ? group.length : Math.min(group.length, maxHitLines);
    for (let i = 0; i < shown; i += 1) {
      // `noUncheckedIndexedAccess` is on, and an out-of-range read here would be a bug in the
      // bound above rather than a missing hit, so it refuses instead of printing a partial line.
      const h = group[i];
      if (h === undefined) throw new Error("report: hit index out of range");
      process.stderr.write(
        `  tag=${h.tag} vr=${h.vr} offset=${String(h.offset)} value=${JSON.stringify(h.value)} (${h.reason})\n`,
      );
    }
    const rest = group.length - shown;
    if (rest > 0) {
      withheld += rest;
      process.stderr.write(
        `  ... and ${String(rest)} more hit(s) in this file, not printed. ` +
          `Re-run with --max-hit-lines 0 to print every one.\n`,
      );
    }
  }
  // The totals are over `hits`, never over what was printed. The withheld count is stated once
  // more here so a reader who scrolls to the end of a long report cannot mistake the lines above
  // for the whole of it.
  const withheldNote =
    withheld > 0 ? ` ${String(withheld)} hit line(s) were not printed (see --max-hit-lines).` : "";
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hits across ${String(byPath.size)} file(s).${withheldNote} ` +
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
  const unread: UnreadByPath = new Map();
  for (const t of targets) {
    try {
      scanTarget(t, allow, hits, unread);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  reportExemptions();
  reportUnread(unread);
  report(hits, args.maxHitLines, unread.size);
  // Off `hits`, never off what `report` printed. The print cap must not be able to move this.
  //
  // 🛑 AND `unread` IS NOT IN IT, DELIBERATELY, WITH THE COST STATED RATHER THAN CLAIMED AWAY. An
  // unread tail is neither of the two non-zero codes this file declares in its banner: nothing was
  // found, and nothing refused the scan. Exit 2 would also fire on a file PS3.5 2026c §7.5.2 makes
  // legal, an undefined-length Sequence being the encoder's choice, and it would MASK a real hit
  // whenever both were present.
  //
  // 🔴 SO A CI JOB THAT READS ONLY THE EXIT CODE STILL CANNOT SEE THIS, AND THAT IS AN OPEN
  // RESIDUAL, not a property being argued for. Making it visible to one is a change to this
  // script's contract with every caller and is its own decision, taken deliberately or not at all.
  return hits.length === 0 ? 0 : 1;
}

/**
 * 🛑 AN UNEXPECTED ERROR MUST NOT EXIT 1. This script's contract is 0 no hits / 1 hits found / 2
 * invocation error, and an uncaught throw exits 1 on Node - the one code that means "PHI was
 * found", to a CI job that reads exit codes rather than stderr. `readdirSync` raising `EACCES`
 * on an unreadable subdirectory is the live case, and widening the walk root from
 * `test/fixtures/` to `test/` enlarged the surface it can happen on, so it is closed here rather
 * than disclosed. Measured before this catch existed: a mode-000 directory under the walk root
 * exited 1.
 *
 * The message is `err.message` only, never a stack or a cause chain, and never any bytes read
 * off a scanned file: a diagnostic about a PHI-bearing corpus is itself a PHI surface. Node's
 * own filesystem errors name the PATH they failed on, which is the same locus every hit and
 * every refusal already carries.
 */
function run(): number {
  try {
    return main();
  } catch (err) {
    process.stderr.write(
      `[phi-scan] refusing the scan: ${err instanceof Error ? err.message : String(err)}\n` +
        "This is not a hit. The scan did not complete, so it says nothing about the corpus.\n",
    );
    return 2;
  }
}

/**
 * 🛑 `process.exitCode`, NEVER `process.exit()`. `process.exit()` tears the process down without
 * waiting for stdio libuv has accepted but not yet written, and this script's stderr is a PIPE
 * under every caller that matters - `spawnSync` in this repo's own suite, and the shell pipeline
 * a CI job runs it in. A pipe write that cannot complete immediately is queued and flushed on a
 * later loop turn, so `report()` returning is NOT the same as its bytes having left the process.
 *
 * That is a PHI-gate defect and not a cosmetic one: the exit code is computed off `hits` and was
 * always right, so a truncated report is a run that REFUSES while under-naming what it found.
 * The dropped bytes are the END of the report - the last hit lines and the total - which is the
 * part a reader trusts to say how much there was.
 *
 * Measured on `21d42f5`, `scripts/phi-scan.ts --max-hit-lines 0` over a 200-hit file, stderr on a
 * pipe whose reader is not keeping up: **30 of 60 runs delivered fewer than 200 hit lines** (190,
 * 191, 192, 170, 171 seen) with exit 1 every time, and **60 of 60 delivered all 200 with the line
 * below**. The generator and the conditions are in
 * `documentation/agent-notes/dicom-phi-scan-exit-flush.md`.
 *
 * Setting `exitCode` lets Node return from the main script and exit once the loop has drained,
 * which is the only thing that makes the report's tail a guarantee rather than a race.
 *
 * 🛑 IT ALSO MAKES A LATE STDIO ERROR REACHABLE, WHICH `process.exit()` HID, AND THAT IS WHY THE
 * LISTENERS BELOW ARE NOT OPTIONAL. A write to a pipe whose reader has gone fails with `EPIPE` on
 * a LATER TICK, after `run()` has already returned, so `run()`'s try/catch cannot see it and
 * Node's default unhandled-`'error'` path exits **1** - the one code that means "PHI was found".
 * Measured on `21d42f5` versus this file without the listeners, reader closed (`| head -n 0`): a
 * clean corpus went **0 -> 1** and an invocation error went **2 -> 1**, turning "the scan says
 * nothing about the corpus" into a confident wrong answer, and printing an uncaught-exception
 * stack that the `run()` JSDoc above forbids.
 *
 * The error is DISCARDED rather than reported, and that is base parity rather than a judgement
 * that it does not matter: `process.exit()` made every late stdio error unreachable, so the exit
 * code was always exactly what `run()` returned. It stays exactly that. There is also nowhere to
 * report it - the stream that failed is the one a diagnostic would go to.
 *
 * 🔴 THE RESIDUAL, MEASURED AND NOT CLOSED HERE: with a reader that never drains at all, this
 * script now WAITS instead of exiting, where `process.exit()` ended it by dropping the report.
 * That is INTRODUCED, on `node` and under `tsx` alike, which is the runner `pnpm phi-scan` uses.
 * Blocking until the reader takes the bytes is what makes the report whole; a timeout here would
 * re-introduce the defect this file just closed.
 */
const discardLateStdioError = (): void => {};
process.stdout.on("error", discardLateStdioError);
process.stderr.on("error", discardLateStdioError);

process.exitCode = run();

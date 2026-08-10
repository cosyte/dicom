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
 *   --max-hit-lines <n>      - print at most n hit lines PER RECOGNIZER PER FILE; `0` prints
 *                              every one
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
 * How many hit lines `report` prints PER RECOGNIZER PER FILE before it stops printing them and
 * says how many it did not print. `--max-hit-lines 0` prints every one.
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
 * 🛑 AND IT IS PER RECOGNIZER WITHIN THAT FILE, WHICH IS THE SAME ARGUMENT ONE LEVEL DOWN. One
 * budget shared by every recognizer let a file's loud recognizer spend the quiet one's share, and
 * the tag walk appends before the text sweep, so how many of the text sweep's findings were printed
 * was decided by how many the tag walk had already made. Per recognizer, a hit prints if its index
 * among that file's hits FROM ITS OWN RECOGNIZER is under the budget, a question no OTHER
 * recognizer's findings are an input to. Every line printed at a given budget before is still
 * printed at that budget: a hit that was among a file's first n overall is among its own
 * recognizer's first n. The per-file line bound is therefore n x `RECOGNIZERS`, and that table is
 * closed.
 *
 * ⚖️ THIS IS NOT MONOTONICITY AND MUST NOT BE CALLED THAT, LABEL OR SENTENCE. Under ANY budget that
 * cuts at all (`--max-hit-lines 0` does not), n+1 hits from one entry print n, so adding a hit can always remove a line; the general property is not
 * available at a cap at all, and a claim that it is was refused here. What is closed is one entry's
 * budget being spent by ANOTHER entry's findings.
 *
 * 🛑 AND SEVERAL SWEEPS SHARE AN ENTRY, SO THE COST IS LARGER THAN "THE SAME SWEEP TWICE".
 * `scanText`'s ISO pass and its compact `YYYYMMDD` pass both push `textDate`, and `scanText` runs
 * AGAIN on every object `scanEmbeddedObjects` decodes, so a doc page's own tokens and its embedded
 * objects' share one entry each. Measured, and IDENTICAL on base `7754a6c` and here: over 200 ISO
 * dates followed by 200 compact ones the report prints 20 ISO and 0 compact, and adding a 20th ISO
 * date in front of one compact DOB takes that DOB off the default report. Splitting the two date
 * passes is available; splitting per embedded object is NOT, because the number of objects is the
 * PAYLOAD's choice and a per-class budget times a payload-chosen class count is no budget.
 * `test/scripts/phi-scan.test.ts` pins both measurements rather than this comment claiming them
 * away.
 *
 * WHY THERE IS A CAP AT ALL, MEASURED RATHER THAN ASSERTED. `DICOM-SCANDICOM-SILENT-HALT` made the
 * text sweep run over every Part 10 object's bytes, and its recognizers fire on image noise at a
 * rate that is a property of the payload's byte histogram. Re-measured on `b784c38` over 8 MiB of
 * synthetic `(7FE0,0010) OW` pixel data: a uniform `0x41-0x60` payload produced tens of thousands of
 * hits and one stderr line each. The figures, the generator and the negative control are in
 * `documentation/agent-notes/dicom-phi-scan-report-cap.md`; no rate is copied here, because it is a
 * fact about that payload's histogram and not about this script.
 */
const DEFAULT_HIT_LINES_PER_RECOGNIZER = 20;

/**
 * How much of a violating value one hit line may echo, in `String.length`.
 *
 * 🛑 THE VALUE WAS THE ONLY UNBOUNDED PAYLOAD-DERIVED SLOT ON THE LINE, AND A DIAGNOSTIC ABOUT A
 * PHI LEAK IS ITSELF A PHI SURFACE. Every other field is structural or comes from a closed set:
 * `path` is the path the enumeration chose, `tag` is `tagDisplay`'s rendering of two 16-bit
 * numbers, `offset` is a position, `reason` is one of this file's own literals, and `vr` is a
 * literal at each `hits.push` and never the two bytes off the wire. `value` is the bytes, and how
 * many of them was decided by the payload: an element declares its own length, so a
 * `(0010,0010)` claiming the rest of the object put the rest of the object - other elements'
 * values, pixel data, whatever follows - on one stderr line, to say that a name was not on the
 * allow-list.
 *
 * WHERE 194 COMES FROM, AND WHY IT IS AN ENGINEERING BOUND AND NOT THE STANDARD'S. PS3.5 2026c
 * Table 6.2-1's PN row - the one row of that table carrying `64 chars maximum per component group`,
 * `up to 3 groups of components` and `no more than two component group delimiters` - gives
 * 3 x 64 + 2 = 194 for one PN value, and PN is the longest of the three VRs this scanner reads.
 *
 * 🛑 BUT TABLE 6.2-1'S LENGTHS ARE IN CHARACTERS, AND THIS BOUND IS IN `String.length`. The PN
 * row's length cell cross-references `note_6.1-2-1`, which says the lengths of VRs whose Character
 * Repertoire can be extended or replaced are `expressly specified in characters rather than bytes`
 * precisely because the byte mapping depends on the character set. This script has no such unit:
 * the tag route decodes latin1, so it counts BYTES, and the text route counts UTF-16 code units.
 * A single conformant PN of exactly 194 characters under `(0008,0005) ISO_IR 192` is longer than
 * 194 in this script's units and IS cut here; how much longer depends on the characters, so no byte
 * figure is written here and a test pins the arithmetic. So 194 bounds what this script prints and
 * says nothing about what the standard admits. Every cut says how much was withheld.
 *
 * AND THE PRINTED FIELD IS BOUNDED, WHICH IS THE NUMBER THAT MATTERS: `report` writes the excerpt
 * through `JSON.stringify`, whose longest expansion of one unit is a six-character `\uXXXX` escape,
 * so the field is at most `6 x 194 + 2` however many bytes the element declared.
 */
const MAX_HIT_VALUE_LENGTH = 194;

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

// ---------------------------------------------------------------------------
// Matching WITHOUT handing anything to a RegExp
// ---------------------------------------------------------------------------

/**
 * 🛑 THIS FILE CONSTRUCTS NO `RegExp`, AND THE PREDICATES BELOW ARE WHAT MAKES THAT TRUE RATHER
 * THAN A CONVENTION.
 *
 * V8 keeps the last successful match on the `RegExp` CONSTRUCTOR: `RegExp.input` (`$_`) is the
 * whole subject string, `RegExp.lastMatch` (`$&`) is the matched text verbatim, and
 * `RegExp.leftContext`, `RegExp.rightContext`, `RegExp.lastParen` and `RegExp.$1` to `RegExp.$9`
 * are the rest of it. Those are readable properties of a global object. So a gate that hands text
 * to a regex leaves that text readable from anywhere in the process until something else matches,
 * with the matched value (a name, a date) NOT excerpted.
 *
 * `DICOM-RESIDUALS` bounded what a hit line prints (`#109`), what a hit holds (`#110`), and then
 * took the scan route's own bytes out of every pattern (`#112`). `#112` left the gate's own
 * CONFIGURATION parsed with patterns and disclosed it as a measured figure rather than a
 * description: every clean column of its instrument read `input 3772`, the code-unit length of
 * `scripts/phi-allow-list.txt`. That figure is what this pass closed, so the sentence carving the
 * configuration out is DELETED rather than worded again - it was refused in three wordings across
 * `#112`'s passes 1, 2 and 3, and the way to stop wording a carve-out is to remove what it carved
 * out. `scripts/measure-phi-scan-regex-statics.ts` is the instrument,
 * `test/integration/phi-scan-regex-statics.test.ts` is the pin, and the two records are
 * `documentation/agent-notes/dicom-phi-scan-regex-statics.md` (the scan route) and
 * `documentation/agent-notes/dicom-phi-scan-config-parsers.md` (this one, and what is left).
 *
 * 🛑 THE BOUND IS ON THE SUBJECT, NOT ON A CLEANUP CALL. Overwriting the statics after the scan
 * would be a bound that holds only from where the cleanup is called, and this lineage has ruled
 * that shape out three times (`#109`, `#111`, `#112`): remove the slot, do not filter the value.
 * There is no cleanup here because there is nothing to clean up.
 *
 * `base64Runs` above already replaced a regex with a forward scanner in this file, for a different
 * reason (a backtrack stack that an 8 MiB run overflowed). This is the same shape and the same
 * standard of evidence: each function below is a different REPRESENTATION of the pattern it
 * replaces, never a wider or narrower predicate. The trims and the two fixed-shape tests are pinned
 * EXHAUSTIVELY over every code point their inputs can hold, and the three text recognizers are
 * pinned by a differential fuzz against the patterns they replace. Both live in
 * `test/scripts/phi-scan-matchers.test.ts`.
 *
 * 🔴 THE ONE PLACE THAT IS DELIBERATELY NOT AN EQUIVALENCE IS `overrideLogPaths`, WHICH IS NARROWER
 * ON PURPOSE AND IN THE FAIL-CLOSED DIRECTION. Its two departures from the pattern it replaces are
 * enumerated on that function, and a dropped entry REFUSES a `--allow-fixture` bypass at exit 2,
 * so the target is not exempted.
 *
 * 🔴 AND THE CONFIG PARSERS ARE NOT ALL PINNED TO THE SAME STANDARD AS THE SCAN ROUTE. Two shapes
 * are unreachable from outside this script and no test claims them: `splitLines`'s `CRLF` handling
 * (both callers trim, so a `CR`-blind split is invisible) and two `rawRecordMode` shapes git cannot
 * emit. Each is named on its own function together with the mutant that passes the suite. They are
 * still written the pattern's way, because a predicate keyed to what today's caller happens to do
 * afterwards is a bound that holds only from the call site - the shape this file refuses elsewhere.
 */
function isDigitCode(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function isUpperCode(code: number): boolean {
  return code >= 0x41 && code <= 0x5a;
}

/** `\w`: the character class a `\b` boundary is defined against. */
function isWordCode(code: number): boolean {
  return (
    isDigitCode(code) ||
    isUpperCode(code) ||
    (code >= 0x61 && code <= 0x7a) || // a-z
    code === 0x5f // _
  );
}

/** The `[A-Za-z\-']` body class of the PN pattern. It deliberately does NOT admit the caret. */
function isPnBodyCode(code: number): boolean {
  return (
    isUpperCode(code) ||
    (code >= 0x61 && code <= 0x7a) || // a-z
    code === 0x2d || // -
    code === 0x27 // '
  );
}

/**
 * `\s`, and the WHOLE of it, written out rather than narrowed to what a latin1 decode can hold.
 *
 * Every caller here decodes latin1 today, so the reachable set is smaller. Keying on that would be
 * a bound that holds only from where the function is called, which is the shape this file's own
 * rules refuse, and it would go wrong silently the first time a caller decoded anything else.
 * ES2023 `WhiteSpace` + `LineTerminator`, pinned against the pattern over all 65,536 code points.
 */
function isSpaceCode(code: number): boolean {
  return (
    code === 0x20 ||
    (code >= 0x09 && code <= 0x0d) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/**
 * `\b` at `index`: exactly one side is a word character, with either end of the string counting as
 * a non-word side.
 */
function isWordBoundary(text: string, index: number): boolean {
  const before = index > 0 && isWordCode(text.charCodeAt(index - 1));
  const after = index < text.length && isWordCode(text.charCodeAt(index));
  return before !== after;
}

/** `text.replace(/[\0\s]+$/, "")`: drop a trailing run of NUL and whitespace. */
function trimTrailingPad(text: string): string {
  let end = text.length;
  while (end > 0) {
    const code = text.charCodeAt(end - 1);
    if (code !== 0 && !isSpaceCode(code)) break;
    end -= 1;
  }
  return end === text.length ? text : text.slice(0, end);
}

/** `text.replace(/\0+$/, "")`: drop a trailing run of NUL only. */
function trimTrailingNuls(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 0) end -= 1;
  return end === text.length ? text : text.slice(0, end);
}

/** `/^\d{8}$/.test(text)`. */
function isEightDigits(text: string): boolean {
  if (text.length !== 8) return false;
  for (let i = 0; i < 8; i += 1) if (!isDigitCode(text.charCodeAt(i))) return false;
  return true;
}

/** `/^[A-Z]{2}$/.test(text)`. */
function isTwoUpperLetters(text: string): boolean {
  return text.length === 2 && isUpperCode(text.charCodeAt(0)) && isUpperCode(text.charCodeAt(1));
}

/**
 * ES2023 `LineTerminator`, which is the part of `\s` that `.` does NOT match.
 *
 * It is a separate predicate from `isSpaceCode` because the two answer different questions and one
 * of the patterns below depends on the difference: `\s` admits `\r`, `.` does not, so a `###`
 * heading with a bare `CR` inside it captures nothing at all.
 */
function isLineTerminatorCode(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;
}

/** `/^\d+$/.test(text)`: at least one character, every one an ASCII digit. */
function isAllDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i += 1) if (!isDigitCode(text.charCodeAt(i))) return false;
  return true;
}

/**
 * `text.split(/\r?\n/)`.
 *
 * A separator is an `LF`, together with a `CR` immediately before it. A lone `CR` is NOT a
 * separator and stays in the line, which is the pattern's behaviour and not an approximation of it:
 * `"a\rb"` is one line, and `"a\r\r\nb"` is `["a\r", "b"]`.
 *
 * The `CR` test is against the raw index rather than against the current line's start. A `CR` at
 * `i - 1` can never already belong to the previous separator, because a separator ends on its `LF`
 * and the character before this `LF` would then be that `LF` rather than a `CR`.
 *
 * 🔴 THE `CRLF` HALF IS NOT OBSERVABLE THROUGH EITHER OF TODAY'S CALLERS, AND NO TEST CLAIMS IT IS.
 * `loadAllowList` runs `lineRaw.trim()` and `tripleHashValue` trims trailing whitespace, so a `CR`
 * left on the end of a line by a `CR`-blind split is eaten by both before anything reads it - a
 * mutant that drops the `i - 1` test passes the whole suite. It is written the pattern's way
 * regardless, for the reason `isSpaceCode` above gives at length: keying on what today's callers
 * happen to do afterwards is a bound that holds only from the call site, and it goes wrong silently
 * the first time a caller stops trimming. What IS observable, and IS pinned, is that a LONE `CR` is
 * not a separator.
 */
function splitLines(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) !== 0x0a) continue;
    const end = i > 0 && text.charCodeAt(i - 1) === 0x0d ? i - 1 : i;
    out.push(text.slice(start, end));
    start = i + 1;
  }
  out.push(text.slice(start));
  return out;
}

/**
 * `/\b(\d{4})-(\d{2})-(\d{2})\b/g`, as start offsets.
 *
 * Fixed width with no quantifier, so there is nothing to backtrack: a start offset either satisfies
 * every position or it does not. On a match the cursor moves to the end of it, which is what a
 * global `exec` loop does with `lastIndex`; otherwise it moves on by one, which is what the engine
 * does with its start index.
 */
function* isoDateRuns(text: string): Generator<number> {
  const n = text.length;
  let i = 0;
  while (i + 10 <= n) {
    if (
      isDigitCode(text.charCodeAt(i)) &&
      isDigitCode(text.charCodeAt(i + 1)) &&
      isDigitCode(text.charCodeAt(i + 2)) &&
      isDigitCode(text.charCodeAt(i + 3)) &&
      text.charCodeAt(i + 4) === 0x2d &&
      isDigitCode(text.charCodeAt(i + 5)) &&
      isDigitCode(text.charCodeAt(i + 6)) &&
      text.charCodeAt(i + 7) === 0x2d &&
      isDigitCode(text.charCodeAt(i + 8)) &&
      isDigitCode(text.charCodeAt(i + 9)) &&
      isWordBoundary(text, i) &&
      isWordBoundary(text, i + 10)
    ) {
      yield i;
      i += 10;
      continue;
    }
    i += 1;
  }
}

/** `/\b(\d{4})(\d{2})(\d{2})\b/g`, as start offsets. Fixed width, same reasoning as above. */
function* compactDateRuns(text: string): Generator<number> {
  const n = text.length;
  let i = 0;
  outer: while (i + 8 <= n) {
    for (let k = 0; k < 8; k += 1) {
      if (!isDigitCode(text.charCodeAt(i + k))) {
        i += 1;
        continue outer;
      }
    }
    if (isWordBoundary(text, i) && isWordBoundary(text, i + 8)) {
      yield i;
      i += 8;
      continue;
    }
    i += 1;
  }
}

/**
 * `/\b[A-Z][A-Za-z\-']+\^[A-Z][A-Za-z\-']+\b/g`, as `[start, end)` offsets.
 *
 * This is the only one of the three with anything to backtrack, and only one of its two quantifiers
 * can productively do so:
 *
 * * the FIRST `[A-Za-z\-']+` cannot. The caret is not in the class, so a greedy run never consumed
 *   one, and giving characters back only exposes class characters. The caret therefore has to sit
 *   exactly where the greedy run stopped, or this start offset has no match at all;
 * * the SECOND can, because the class admits `-` and `'`, which are not word characters, so a run
 *   ending in one fails the trailing `\b`. The engine gives them back one at a time while the `+`
 *   keeps at least one character. That is the `while` below.
 */
function* pnRuns(text: string): Generator<[number, number]> {
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (!isUpperCode(text.charCodeAt(i)) || !isWordBoundary(text, i)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < n && isPnBodyCode(text.charCodeAt(j))) j += 1;
    if (j === i + 1 || j >= n || text.charCodeAt(j) !== 0x5e) {
      i += 1;
      continue;
    }
    const second = j + 1;
    if (second >= n || !isUpperCode(text.charCodeAt(second))) {
      i += 1;
      continue;
    }
    let k = second + 1;
    while (k < n && isPnBodyCode(text.charCodeAt(k))) k += 1;
    if (k === second + 1) {
      i += 1;
      continue;
    }
    // `second + 2`, NOT `second + 1`: `second` is the `[A-Z]`, so the `+` starts at `second + 1`
    // and giving back to `second + 1` would leave it holding nothing. An earlier draft floored it
    // one character lower, and the adversarial cell of
    // `scripts/measure-phi-scan-regex-statics.ts` reported the difference on `ABC^D-`: this
    // scanner matched `ABC^D`, where the pattern matches nothing at all.
    let end = k;
    while (end > second + 2 && !isWordBoundary(text, end)) end -= 1;
    if (!isWordBoundary(text, end)) {
      i += 1;
      continue;
    }
    yield [i, end];
    i = end;
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

/**
 * A violating value, bounded AT CONSTRUCTION, with the length it had before it was bounded.
 *
 * 🛑 THE SLOT IS REMOVED, NOT THE PRINTED STRING FILTERED, AND THIS LINEAGE HAS PAID FOR THE
 * DIFFERENCE. Truncating inside `report` would be a bound that holds only from where the printer
 * is CALLED: the hit would still carry the whole payload, and the next thing to read `Hit.value` -
 * a second printer, a summary line, a JSON mode - would start from an unbounded string again.
 * `Hit.value` is this type, this type is not a `string`, and `excerptValue` is the only thing that
 * makes one, so there is no `hits.push` that can put an unbounded value on a hit.
 *
 * 🛑 AND IT IS ON EVERY PUSH SITE, NOT ON THE ONES THAT NEEDED IT. Three of the six can exceed the
 * bound today (the PN and DT tag routes, and the text sweep's PN token); the other three are held
 * under it by their own recognizers - the two text date passes match a fixed-width run, and
 * `checkDate` refuses a `DA` value that is not exactly eight digits. That is an analysis of what
 * each caller happens to pass, which is exactly the kind of bound this lineage has watched
 * relocate to a sibling. The type does not consult it.
 */
declare const HIT_VALUE: unique symbol;
interface HitValue {
  /** At most `MAX_HIT_VALUE_LENGTH` of the value. */
  readonly text: string;
  /** What the value's `length` was. Never less than `text.length`. */
  readonly length: number;
  /** The brand. It has no runtime existence; `excerptValue` is the only way past it. */
  readonly [HIT_VALUE]: true;
}

/**
 * Bound a value for the report.
 *
 * 🛑 THE UNIT IS `String.length` AND IT IS NOT ONE UNIT, WHICH IS WHY IT IS NAMED HERE RATHER THAN
 * IN THE MESSAGE. The tag route hands this a latin1 decode, so its length is BYTES; the text route
 * hands it a UTF-8 decode, so its length is UTF-16 CODE UNITS. Neither is the character count
 * PS3.5 Table 6.2-1 measures in (see `MAX_HIT_VALUE_LENGTH`).
 *
 * The assertion adds the brand and nothing else: the object literal below already IS every
 * readable field of the type, and the property being asserted in is one no caller can write.
 *
 * 🛑 THE COPY IS PART OF THE BOUND, AND WITHOUT IT THE BOUND WAS PRINTED-ONLY. V8 answers
 * `raw.slice(0, n)` and a regexp match alike with a string that POINTS INTO ITS PARENT, so an
 * excerpt cut from an 8 MiB decode kept the whole 8 MiB alive for the run. Measured: retention grew
 * by one whole file per hit-bearing file and did not grow at all once the excerpt owned its bytes.
 * The tables, the direction this COSTS on, and the residual it does not close are in
 * `documentation/agent-notes/dicom-phi-scan-value-retention.md`; `pnpm measure:phi-scan-retention`
 * re-derives the tables.
 *
 * 🛑 AND THE ROUND TRIP IS `utf16le` BECAUSE `utf8` IS LOSSY AND WOULD HAVE BEEN A SILENT VALUE
 * CORRUPTION. `Buffer.from(s, "utf8")` turns an unpaired surrogate into U+FFFD, so the excerpt
 * would print a character the file does not contain, which is the same class of wrong answer as
 * printing too much. `utf16le` round-trips every one of the 65,536 code units, paired or not. That
 * no CALLER can hand this an unpaired surrogate today is exactly the reasoning this slot is built
 * to not depend on: it is one recognizer away from being false.
 */
function excerptValue(raw: string): HitValue {
  const cut = raw.length > MAX_HIT_VALUE_LENGTH ? raw.slice(0, MAX_HIT_VALUE_LENGTH) : raw;
  const bounded = {
    text: Buffer.from(cut, "utf16le").toString("utf16le"),
    length: raw.length,
  };
  return bounded as HitValue;
}

/**
 * Which recognizer produced a hit. The print budget in `report` is spent PER ENTRY OF THIS TABLE,
 * so this table's size is the only thing that multiplies the per-file line bound.
 *
 * 🛑 IT IS A CLOSED TABLE AND THAT IS THE WHOLE BOUND. Budgeting on `reason` would have been one
 * field cheaper and would not have been a bound: `reason` is assembled at the push site, so one
 * future recognizer interpolating a payload-derived token into it gives the payload a vote on how
 * many classes exist, and a per-class budget times an attacker-chosen class count is no budget.
 * The type refuses that instead of an analysis of what today's push sites happen to pass - the same
 * shape `HitValue` is built in, and this lineage's own rule: remove the slot, do not filter the
 * value.
 *
 * The entries are the recognizers, not the VRs. `tagPn` and `textPn` are one VR and two routes, and
 * separating them is the point: `scanDicom` appends before `scanText` within a file, so with one
 * shared budget the tag route's findings decide how many of the text route's are printed.
 *
 * 🛑 AN ENTRY IS A CLASS OF SWEEP AND SEVERAL SWEEPS SHARE ONE. `scanText`'s two date passes both
 * push `textDate`, and `scanText` runs once per embedded object as well as once on the page, so
 * those hits land in the page's entries too. What that costs is measured at
 * `DEFAULT_HIT_LINES_PER_RECOGNIZER`. Adding an entry per sweep is available for the date passes
 * and NOT for the embedded route, where the count of sweeps is the payload's choice.
 */
const RECOGNIZERS = {
  /** `inspectElement`, a `PN` tag off the tag table. */
  tagPn: "tag-pn",
  /** `inspectElement`, a `DA` or `DT` tag off the tag table. */
  tagDate: "tag-date",
  /** `scanText`'s PN-shaped token sweep. */
  textPn: "text-pn",
  /** `scanText`'s two date sweeps, ISO and compact. */
  textDate: "text-date",
} as const;

type Recognizer = (typeof RECOGNIZERS)[keyof typeof RECOGNIZERS];

interface Hit {
  path: string;
  tag: string; // formatted "(gggg,eeee)"
  vr: string;
  offset: number;
  value: HitValue;
  reason: string;
  /** Which recognizer found it. Budgeted on in `report`; never printed. */
  recognizer: Recognizer;
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
  maxHitLines: number; // hit lines printed per recognizer per file; 0 prints every one
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
  let maxHitLines = DEFAULT_HIT_LINES_PER_RECOGNIZER;
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
      if (!isAllDigits(next)) {
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
  for (const lineRaw of splitLines(raw)) {
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

/** An opening or closing code fence: which character, how many, and whether anything follows. */
interface Fence {
  code: number;
  length: number;
  /**
   * Nothing but SPACES AND TABS after the run. A CLOSING fence must be bare; an opening one need
   * not be, because what follows an opening fence is its info string.
   *
   * 🛑 SPACE AND TAB, NOT `isSpaceCode`, AND BOTH ARMS ARE LOAD-BEARING. CommonMark 0.31.2 §4.5:
   * a closing fence "may be followed only by spaces or tabs, which are ignored." Anything else is
   * an info string and does not close. Dropping either arm reds one case in
   * `test/scripts/phi-scan-matchers.test.ts`, and it is the same case for both. What a wrong answer
   * here does is on `fenceRun` below; it is not a thing this field can be reasoned about locally.
   */
  bare: boolean;
}

/**
 * A fenced-code-block delimiter: three or more backticks or tildes, indented at most three spaces.
 *
 * 🛑 FENCE STATE IS PARITY, SO THERE IS NO SAFE DIRECTION TO ERR IN AND THE ARGUMENT THAT THERE WAS
 * IS DELETED RATHER THAN WORDED AGAIN. Two drafts of this comment claimed one, each refused by a
 * gate, and the second was refused with the measurement that kills the whole shape: getting one
 * fence wrong does not merely drop or admit that block's headings, it swaps every block boundary
 * after it. On `open / A / close-with-a-trailer / B / close / C`, reading the trailer as bare drops
 * `A` and `C` and admits `B`; reading it as an info string drops `A` and `B` and admits `C`. A
 * wrong answer moves entries in BOTH directions at once.
 *
 * What is left is not a safety heuristic but a specification: this follows CommonMark 0.31.2 §4.5,
 * and where it is measured to diverge that divergence is written down rather than argued to be
 * harmless. `documentation/agent-notes/dicom-phi-scan-config-parsers.md` carries the one known
 * divergence. This file does not render markdown and none of this is here because it does; it is
 * here because `overrideLogPaths` has to agree with what a human reviewing that file sees.
 */
function fenceRun(line: string): Fence | null {
  let i = 0;
  while (i < 3 && i < line.length && line.charCodeAt(i) === 0x20) i += 1;
  const code = line.charCodeAt(i);
  if (code !== 0x60 && code !== 0x7e) return null; // ` and ~
  let end = i;
  while (end < line.length && line.charCodeAt(end) === code) end += 1;
  if (end - i < 3) return null;
  let bare = true;
  for (let k = end; k < line.length; k += 1) {
    const c = line.charCodeAt(k);
    if (c !== 0x20 && c !== 0x09) {
      bare = false;
      break;
    }
  }
  return { code, length: end - i, bare };
}

/**
 * `/^###\s+(.+?)\s*$/` over one line, as a forward scan.
 *
 * The pattern is: exactly `###` at column 0, at least one whitespace character, then a capture that
 * runs to the last non-whitespace character on the line. The capture is written `(.+?)` and `.`
 * excludes `LineTerminator`, so a bare `CR` or `LS`/`PS` inside the captured span makes the whole
 * pattern fail - which is why `isLineTerminatorCode` exists separately from `isSpaceCode`.
 */
function tripleHashValue(line: string): string | null {
  if (!line.startsWith("###")) return null;
  let start = 3;
  while (start < line.length && isSpaceCode(line.charCodeAt(start))) start += 1;
  if (start === 3) return null; // `\s+` needs at least one
  let end = line.length;
  while (end > start && isSpaceCode(line.charCodeAt(end - 1))) end -= 1;
  if (end === start) return null; // NARROWING 2, see `overrideLogPaths`
  for (let k = start; k < end; k += 1) {
    if (isLineTerminatorCode(line.charCodeAt(k))) return null;
  }
  return line.slice(start, end);
}

/**
 * The paths `phi-scan-overrides.md` logs, as `### <path>` headings OUTSIDE any fenced code block.
 *
 * 🛑 THIS IS THE ONE PARSER HERE THAT IS DELIBERATELY NOT AN EQUIVALENCE, AND BOTH DEPARTURES ARE
 * FAIL-CLOSED. Dropping an entry makes `validateAllowFixtures` REFUSE the `--allow-fixture` flag
 * naming it (exit 2), so the target is not exempted. Exit 2 does not scan it either: the run stops
 * before enumeration and says nothing about the corpus, which is a refusal and not a clearance.
 * Admitting an entry that no human wrote is the direction that silently exempts a PHI target, and
 * it is what both of these were.
 *
 * 1. **Fence-awareness.** The pattern this replaces was FENCE-BLIND, so the `### <path>` line in
 *    this repository's own committed `phi-scan-overrides.md` - a TEMPLATE, inside the fenced block
 *    under "Format", showing a contributor what to write - parsed as a live allow entry.
 *    `DICOM-RESIDUALS` `#112` disclosed it as `PRE-EXISTING` and inert. Re-measured here rather
 *    than inherited, and the inertness holds twice over: no tracked path normalizes to `<path>`,
 *    AND the placeholder normalizes to a ROOT-LEVEL path, which neither of the two gating routes
 *    can ever produce a target for (`all` enumerates `SCAN_ROOTS`, `--staged` filters to
 *    `SCAN_SCOPE`; a root-level file named `<path>` was staged and dropped by both). It was live
 *    only in explicit-paths mode, where a caller names the file itself - measured, exit 0 with the
 *    target exempted, against exit 1 for the same bytes without the flag and exit 2 for a path
 *    with no entry at all.
 *
 * 2. **A heading whose text is entirely whitespace no longer registers one.** Found while measuring
 *    the pattern rather than inherited from anywhere: `\s+` is greedy and `(.+?)` needs one
 *    character, so on `###` followed by two or more spaces the engine gives ONE SPACE back out of
 *    the whitespace run and captures it. `"###  "` yields `" "`, which `normalizePath` turns into a
 *    root-level entry for a file named with a single space. Same shape as the template line, same
 *    inertness, and it is closed here rather than disclosed because it is the same mechanism and
 *    the same two lines of code.
 *
 * Everything else is the pattern exactly. `test/scripts/phi-scan-matchers.test.ts` holds the
 * pattern itself as the oracle and drives this parser through `--allow-fixture`, which is
 * repeatable and names every path it could not find an entry for - so one run reports exactly which
 * of a candidate set the parser produced. Both directions are asked: the captures the pattern finds
 * outside a fence must all be present, and the ones it finds inside a fence, the lone space, and
 * what a merely-trimming parser would have produced must all be absent.
 */
function overrideLogPaths(raw: string): string[] {
  const out: string[] = [];
  let open: Fence | null = null;
  for (const line of splitLines(raw)) {
    const fence = fenceRun(line);
    if (open === null) {
      if (fence !== null) {
        open = fence;
        continue;
      }
      const value = tripleHashValue(line);
      if (value !== null) out.push(value);
      continue;
    }
    // Strict on the way out: same character, at least as long, and nothing after it.
    if (fence !== null && fence.bare && fence.code === open.code && fence.length >= open.length) {
      open = null;
    }
  }
  return out;
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) {
    return new Set();
  }
  const out = new Set<string>();
  for (const value of overrideLogPaths(readFileSync(OVERRIDE_LOG_PATH, "utf8"))) {
    out.add(normalizePath(value));
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

/**
 * The DESTINATION MODE out of `:<srcmode> <dstmode> <srcsha> <dstsha> <status>`, the info half of a
 * `--raw -z` record, or `null` if the record is not that shape.
 *
 * `/^:(?:\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\d*$/` as a forward scan. Every field is
 * fixed-width or a run of a closed character class, so there is nothing to backtrack and the two
 * are the same predicate rather than an approximation of it.
 *
 * 🔴 WHAT PINS IT IS THE `--staged` SUITE IN `test/scripts/phi-scan.test.ts`, AND THAT IS NARROWER
 * THAN A DIFFERENTIAL. Measured rather than assumed: a mutant that never parses a record reds 14 of
 * its 138 cases and one that returns the SOURCE mode reds 12, so the field this reads and the fact
 * that it reads one at all are both covered. Two shapes are NOT covered and cannot be, because the
 * subject is `git diff --cached --raw` output and no test can make git emit them: a sha in UPPERCASE
 * hex, and trailing bytes after the status. Mutants widening either pass the whole suite. They are
 * written the pattern's way regardless, on the same reasoning as `splitLines` - a predicate keyed to
 * what today's producer happens to emit is not a predicate - and a record that fails to parse
 * REFUSES the scan, which is the fail-closed direction.
 */
function rawRecordMode(info: string): string | null {
  let i = 0;
  const lit = (code: number): boolean => {
    if (info.charCodeAt(i) !== code) return false;
    i += 1;
    return true;
  };
  const digits = (n: number): boolean => {
    for (let k = 0; k < n; k += 1) {
      if (!isDigitCode(info.charCodeAt(i))) return false;
      i += 1;
    }
    return true;
  };
  const hexRun = (): boolean => {
    const from = i;
    while (i < info.length) {
      const c = info.charCodeAt(i);
      if (!(isDigitCode(c) || (c >= 0x61 && c <= 0x66))) break; // 0-9 a-f
      i += 1;
    }
    return i > from;
  };
  if (!lit(0x3a) || !digits(6) || !lit(0x20)) return null; // `:` <srcmode> ` `
  const modeAt = i;
  if (!digits(6) || !lit(0x20)) return null; // <dstmode> ` `
  if (!hexRun() || !lit(0x20)) return null; // <srcsha> ` `
  if (!hexRun() || !lit(0x20)) return null; // <dstsha> ` `
  if (!isUpperCode(info.charCodeAt(i))) return null; // <status>
  i += 1;
  while (i < info.length && isDigitCode(info.charCodeAt(i))) i += 1; // the score suffix
  return i === info.length ? info.slice(modeAt, modeAt + 6) : null;
}

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
  // git cannot emit either, so the stride is two fields. `rawRecordMode` still admits a
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
    const mode = rawRecordMode(info) ?? undefined;
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
  if (!isTwoUpperLetters(vr)) return { ok: false, reason: HALT_REASONS.vrNotTwoLetters };

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
  if (!isEightDigits(value)) return null; // not a strict YYYYMMDD; skip
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
  const value = trimTrailingPad(raw);
  if (value.length === 0) return;

  if (isPn && PN_TAGS.has(key)) {
    if (!isPnAllowed(value, allow)) {
      hits.push({
        path: target.path,
        tag: tagDisplay(key),
        vr: "PN",
        offset: valueOffset,
        value: excerptValue(value),
        reason: "PN not in allow-list",
        recognizer: RECOGNIZERS.tagPn,
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
        value: excerptValue(value),
        reason: violation,
        recognizer: RECOGNIZERS.tagDate,
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
        value: excerptValue(value),
        reason: violation,
        recognizer: RECOGNIZERS.tagDate,
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
    isTwoUpperLetters(buf.toString("latin1", 4, 6))
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
      transferSyntax = trimTrailingNuls(decodeAscii(buf, valueOffset, valueLength)).trim();
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

/**
 * The three text recognizers.
 *
 * 🛑 `content` IS A SCAN TARGET'S OWN BYTES AND IS NEVER HANDED TO A `RegExp`. The three patterns
 * this used to run are now the forward scanners above, for the reason written on them: a matched
 * subject stays readable from `RegExp.input` and `RegExp.lastMatch`, which are process globals, so
 * the whole page and the matched name outlived the scan. The scanners take the same offsets and
 * the same substrings; the sub-match groups are sliced off the run instead of being read out of
 * `m[1]`, which is why the `undefined` guards those groups needed are gone.
 */
function scanText(target: Target, content: string, allow: AllowList, hits: Hit[]): void {
  // ISO date `YYYY-MM-DD`
  for (const index of isoDateRuns(content)) {
    const full = content.slice(index, index + 10);
    const compact = `${full.slice(0, 4)}${full.slice(5, 7)}${full.slice(8, 10)}`;
    if (allow.dates.has(compact)) continue;
    const year = Number(full.slice(0, 4));
    if (year >= CUTOFF_YEAR) {
      hits.push({
        path: target.path,
        tag: "(text)",
        vr: "DA",
        offset: index,
        value: excerptValue(full),
        reason: `text date within last 120 years (>= ${String(CUTOFF_YEAR)})`,
        recognizer: RECOGNIZERS.textDate,
      });
    }
  }

  // 8-char YYYYMMDD as a standalone token
  for (const index of compactDateRuns(content)) {
    const full = content.slice(index, index + 8);
    if (allow.dates.has(full)) continue;
    const year = Number(full.slice(0, 4));
    const month = Number(full.slice(4, 6));
    const day = Number(full.slice(6, 8));
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (year >= CUTOFF_YEAR) {
      hits.push({
        path: target.path,
        tag: "(text)",
        vr: "DA",
        offset: index,
        value: excerptValue(full),
        reason: `text date within last 120 years (>= ${String(CUTOFF_YEAR)})`,
        recognizer: RECOGNIZERS.textDate,
      });
    }
  }

  // FAMILY^GIVEN PN-shaped tokens
  for (const [start, end] of pnRuns(content)) {
    const value = content.slice(start, end);
    if (!isPnAllowed(value, allow)) {
      hits.push({
        path: target.path,
        tag: "(text)",
        vr: "PN",
        offset: start,
        value: excerptValue(value),
        reason: "text PN not in allow-list",
        recognizer: RECOGNIZERS.textPn,
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
 * Print the hits, at most `maxHitLines` of them per recognizer per file, each with an excerpt of
 * its value rather than the value - bounded where the hit is made, not here. See
 * `MAX_HIT_VALUE_LENGTH`.
 *
 * The properties that make the cap safe are stated at `DEFAULT_HIT_LINES_PER_RECOGNIZER` and
 * enforced here: the exit code and the totals are computed off `hits`, not off what was printed;
 * the cap is per file, so no path goes unnamed; it is per recognizer within that file, so no
 * recognizer's findings decide how many of another's are printed; and a file that had lines
 * withheld says so, with the exact number and the flag that prints them.
 *
 * The suppression line carries a COUNT and nothing else - no tag, no VR, no value, no offset, and
 * no per-recognizer breakdown. A diagnostic about a PHI leak is itself a PHI surface, and a line
 * whose whole job is to say "there is more here" must not become a second way to spill some of it.
 *
 * 🛑 WHICH LINES SURVIVE THE CAP IS SCAN ORDER, NOT FILE ORDER, and it is worth saying because the
 * obvious reading is the wrong one. "The first n hits" is not "the first n in the file". It is now
 * the first n of each recognizer's, which is scan order restricted, never reordered.
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
    // One counter per recognizer, RESET PER FILE. A budget carried across files would be the
    // global cap this has never been, one axis at a time.
    const spent = new Map<Recognizer, number>();
    let shown = 0;
    for (const h of group) {
      if (maxHitLines !== 0) {
        const used = spent.get(h.recognizer) ?? 0;
        // `continue`, not `break`: the group is in scan order and a later hit may belong to a
        // recognizer that still has budget. Breaking here is what made this non-monotone.
        if (used >= maxHitLines) continue;
        spent.set(h.recognizer, used + 1);
      }
      shown += 1;
      // The value arrives bounded (`HitValue`), so this is a format and not a filter. The
      // withheld amount is printed OUTSIDE the quotes: inside them it would read as content, and
      // it carries NO UNIT, because the two routes measure in two different ones (`excerptValue`).
      const withheld = h.value.length - h.value.text.length;
      const cut = withheld > 0 ? ` [+${String(withheld)} not printed]` : "";
      process.stderr.write(
        `  tag=${h.tag} vr=${h.vr} offset=${String(h.offset)} value=${JSON.stringify(h.value.text)}${cut} (${h.reason})\n`,
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

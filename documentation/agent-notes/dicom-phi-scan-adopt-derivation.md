# `PHI-SCAN-ADOPT`: what `dicom` needs `@cosyte/script-utils/phi-scan` to parameterize

_Derivation only. **Nothing is adopted, nothing ships, and this branch must not be merged.**
`scripts/phi-scan.ts` on this branch is byte-identical to `origin/main`. Written 2026-08-11 against
`b8fd5ae` (branch base, which was `origin/main`'s tip) with `@cosyte/script-utils@0.0.2` installed as
a devDependency so the engine could be driven directly._

**Why this file exists rather than a pull request.** Adoption was re-scoped mid-slice by founder
directive: _"all updates go to script-utils to parameterize the process"_. Process means walking,
reading, enumeration, the index union, staged-blob handling, completeness and bookkeeping, reporting,
exit codes and refusals. None of it is this repo's. `dicom` carries the largest hand-maintained
scanner in the fleet, so the gap between what it does and what the engine can express is the widest,
and closing it repo-locally is exactly what this item exists to delete. **The adoption is blocked on
an engine that does not have these parameters yet.**

## Provenance, and how the numbers here were taken

Every figure below is a measurement on this repo at `b8fd5ae`, or a run of
`@cosyte/script-utils@0.0.2` driven in process against this working tree. Spec claims are read from
the SHA-pinned vendored copy at `vendor/nema/part05/`, **PS3.5 2026c**.

**Counts are cross-checked with two tools, because `grep -c` has returned NO MATCH on a
`phi-scan.ts` that `rg` read fine.** `scripts/phi-scan.ts` is **2,928** lines by `wc -l`, `rg -c ''`
and `awk 'END{print NR}'` alike. Under the three scan roots git tracks **101** files by
`git ls-files | wc -l` and by `git ls-files | awk 'END{print NR}'`, of which **14** are `.md` by both
`rg -c` and `grep -c`.

## The two pre-checks the item demands, both re-derived

**1. Is any scan root `./`-prefixed? NO.** The declared roots are the string literals `"test"`
(`TEST_SCOPE`, line 264) and `"README.md"` / `"docs-content"` (`DOC_ROOTS`, lines 288 to 291). None
carries a leading `./`, a trailing slash, or an absolute prefix, so each is already the spelling the
engine's `normalizeConfig` maps onto. Nothing here would silently empty the index union or the two
index refusals.

**2. Does `isStagedReadable` admit anything outside `scanRoots`? NO, and it cannot, because the
predicate IS the root test.** Base restricts `--staged` to `SCAN_SCOPE` inside
`buildTargetsForStaged`; the parameter form below is written as `SCAN_ROOTS.some((root) => relPath
=== root || relPath.startsWith(root + "/"))`, which is the engine's own `isUnderScanRoot` verbatim,
so the two keys cannot drift apart. This matters because a staged **mode-120000** entry outside every
root was measured in a sibling to be enumerated, read, handed the LINK'S TARGET PATH as content, and
reported `OK: no hits` at exit 0.

**Validated end to end, not reasoned about.** Driving `runPhiScan` against this working tree with the
parameters in Part A, an allow-list holding the single line `EMAILDOMAIN example.com`, and NO
detector, the run reports `[phi-scan] OK: no hits` and exits **0**. It raises no completeness
refusal, so every target the roots enumerate is one the read filter also admits. With an EMPTY
allow-list the same run exits **1** with **6** hits across **2** files, and both the files and the
values are named rather than counted: five `t@example.com` and one `changelog@example.com`, in
`test/scripts/phi-scan.test.ts` and `test/scripts/changelog-generation.test.ts`, all from the
engine's email floor. No SSN shape anywhere in the corpus.

---

# PART A. `dicom`'s five axes, as data

```
exitCodes         { clean: 0, hits: 1, refuse: 2 }
scanRoots         ["test", "README.md", "docs-content"]
isWalkReadable    admit everything EXCEPT "test/fixtures/phi-scan/README.md"
isStagedReadable  every path equal to, or under, one of the three roots
excludedPaths     (empty: see the note below, this is NOT where the exemption goes)
regularBlobModes  engine default
```

**AXIS 1, exit codes.** Stated in this repo's own banner and not inherited. `1` is reserved for
"this corpus contains something that looks like PHI" because CI and the pre-commit hook branch on it.

**AXIS 2, roots.** Two corpora, and the split is the design. `test/**` is the TEST corpus: this
package commits NO `.dcm` files at all, because every fixture it owns is BUILT IN A `.ts` SOURCE FILE
by `test/helpers/build-dicom.ts`, so its whole committed fixture corpus is PN and date literals in
TypeScript. Rooting at `test/fixtures/` left 81 tracked files unread carrying 81 PN/date hits across
20 of them (`PHI-SCAN-WALK-ROOT-SCOPE`, measured on `8982a16`). `README.md` plus `docs-content/**` is
the DOC corpus: the documentation ships DICOM objects as base64-encoded Part 10 buffers inline in
markdown, and the text sweep alone cannot see into one.

**The root KIND is derived from the filesystem under the engine, and this repo used to declare it.**
`Root { rel, shape: "directory" | "file" }` refused a root that was not the shape it was declared to
be. The engine derives instead, and the item is right that the shape is expressible without the
richer type: a file root is scanned as one target, a link-shaped root is refused rather than followed
(`lstat`, never `stat`), a root that is neither is refused, a missing one is skipped. **What
deriving gives up is what the declaration bought: a root that CHANGES KIND is silently treated as
what it has become.** That is a shared boundary and a low-priority engine item, listed in Part E.

**AXIS 2, the subtractive half: the corpus exemption does NOT go in `excludedPaths`, and that is
load-bearing.** `test/fixtures/phi-scan/README.md` documents the synthetic violator values the
scanner's own tests plant, so scanning it reds the gate on a file whose whole purpose is to carry
them. It is ONE LITERAL PATH and not a predicate: a stale exact path fails CLOSED, a predicate fails
OPEN. But `excludedPaths` subtracts from EVERY route including `--staged`, and `--staged` has never
applied this exemption. Moving it there would SUBTRACT a detection the base has on the route the
pre-commit hook runs, which is the one direction this item forbids. It therefore belongs in the
read filter for the two SWEEPING routes. The two routes disagree about exactly one file, they
disagreed about it on base too, and `--staged` is the stricter of the two.

**AXIS 3, `--staged` scope.** Every path equal to or under a root, with no markdown exemption and no
corpus exemption. Base parity.

**AXIS 4, gitlinks.** Engine default (`100644`, `100755`). Base uses the identical pair.

**AXIS 5, EOL normalization.** Nothing to set. The engine deduplicates the walk against the index BY
CONTENT, so where the two copies differ both are scanned. Checked rather than skipped: this repo
declares no `.gitattributes` at all, so no eol rule rewrites anything and the union adds nothing on a
clean checkout.

# PART B. `dicom`'s detector vocabulary, as data

The engine ships the detector KINDS; only the vocabulary is this standard's.

**Person names (PN).** Ten tags, hardcoded rather than read from the generated Dictionary, which may
regenerate within the same CI build: `(0010,0010)` PatientName, `(0008,0090)`
ReferringPhysicianName, `(0008,1048)` PhysiciansOfRecord, `(0008,1050)` PerformingPhysicianName,
`(0008,1060)` NameOfPhysiciansReadingStudy, `(0008,1070)` OperatorsName, `(0010,1001)`
OtherPatientNames, `(0010,1005)` PatientBirthName, `(0010,1060)` PatientMotherBirthName,
`(0040,A123)` PersonName.

**Dates (DA).** Six tags: `(0008,0020)`, `(0008,0021)`, `(0008,0022)`, `(0008,0023)`, `(0010,0030)`
PatientBirthDate, `(0040,A030)`.

**Date-times (DT).** Three tags: `(0008,002A)`, `(0040,A12C)`, `(0040,A13A)`. The first eight
characters are the `YYYYMMDD` head.

**The rule over those values.** A PN not positively declared synthetic is a hit. A DA or DT head
whose year is within the last 120 years (`new Date().getFullYear() - 120`) and is not declared is a
hit. **MRN, accession number, institution name, phone, address and vendor UID root are NOT detected,
and a clean run says nothing about them.** The tracked corpus carries all of those shapes in
synthetic form.

**Three text recognizers, over every target's bytes whatever its name.** An ISO `YYYY-MM-DD`, a
standalone compact `YYYYMMDD`, and a `FAMILY^GIVEN` PN-shaped token. Plus a fourth route that is
`dicom`-specific and without which the DOC corpus scans clean by construction: **decode every maximal
base64 run of at least 16 characters, and if it decodes to a Part 10 stream, run the tag walk and the
text sweep over the decoded bytes**, attributing anything found to the enclosing page.

**Three predicates have each been measured to make this gate print `OK - no hits` over a patient
name, and the engine must not reintroduce any of them as a dispatch rule.** Gating the tag walk on
`isDicom` (a preamble-less object went to the text sweep alone, which has no tag table and cannot see
a single-component `(0010,0010)`); making the text sweep an `else` (a preamble-ful object whose name
sits behind an undefined-length `SQ` was read no further, silently); and dispatching on the FILE'S
EXTENSION (the same bytes exited 1 as `.dcm`, `.bin` and `.dat`, and 0 with `OK - no hits` as `.md`,
`.txt`, `.json` and `.csv`). The halt, the preamble and the filename are all things that do not
decide what the bytes are.

**The allow-list vocabulary, translated into the engine's `<TAG> <value>` format.** `NAME` entries
carry this standard's own shape: a trailing caret makes an entry a PREFIX, because a PN value is
`FAMILY^GIVEN^MIDDLE^PREFIX^SUFFIX` and `ANON^` declares a family name whose given names are all
synthetic. Everything else is exact. `DOB` entries are raw 8-character `YYYYMMDD`. `EMAILDOMAIN
example.com` is required by the engine's own email floor and by nothing this repo does today: it is
the six addresses measured above.

**🛑 THE TRANSLATION LOSES CASE SENSITIVITY, AND THAT IS A WIDENING RATHER THAN A TIDY-UP.** This
repo's allow-list matched case-sensitively on purpose, and lists `DOE^` and `Doe^` as two entries
because the documentation writes the same synthetic family name in title case. The engine UPPERCASES
every `NAME` entry, so the casing a fixture uses is no longer available to compare against and every
casing of every declared name is excused. It is the permissive direction. See Part E for the
parameter that would give it back.

**🛑 THE ALLOW-LIST IS GLOBAL AND HAS NO PATH SCOPING, WHICH IS UNCHANGED AND STILL A REAL COST.** A
value listed because a `.ts` fixture under `test/` needed it is equally excused in `README.md`, in
`docs-content/` and in a decoded `.dcm`. The two worth naming are `19800101` and `20240115`, which
are plausible real birth and study dates.

---

# PART C. ENGINE SPECIFICATION 1: completeness reporting for a detector that reads a target in part

**This is the one the fleet has no other instance of, and it is the reason `dicom` is not mechanical.**

## The defect it exists to close

`scanDicom` walks a Part 10 object's tag table and `break`s at the first header it cannot read. Before
`DICOM-PHI-SCAN-RESIDUALS` it said nothing, so a file the tag table abandoned partway through produced
the same `[phi-scan] OK - no hits` as one it read end to end. **A guard that has never been pointed at
an input has not cleared that input.**

**The way in is CONFORMANT, which is what makes it a disclosure rather than a bug.** PS3.5 2026c
§7.5.2 makes `0xFFFFFFFF` one of TWO Sequence delimitations, the encoder's choice, both of which
"shall be supported by decoders"; §7.1 orders tags ascending, so `(0008,1110)` precedes
`(0010,0010)` in a conformant file. Encapsulated `(7FE0,0010) OB` pixel data is the same shape.

**`DetectContext` has no channel for it.** A detector can raise a HIT or it can THROW. Neither is the
answer: a halt is not evidence that a name is there, and throwing refuses the scan over a file the
standard permits. **A default cannot cover this**, because the engine hands the detector a whole
buffer and gets nothing back: whether every byte was parsed is a fact only the per-standard parser
holds.

## The API

```ts
// PhiScanConfig
/**
 * The CLOSED set of reasons a detector may give for reading a target only in part. Declared as
 * data so the engine can refuse anything else: the bytes at a halt are precisely the bytes that
 * did not parse, so a reason interpolated from them is unvouched-for input on a CI log.
 * REQUIRED when a detector calls `ctx.incomplete`; there is no default, and no free-text arm.
 */
incompleteReasons?: readonly string[];

/**
 * What an incomplete read does to the exit code.
 *   "report-only"  print it, do not move the code. THE DEFAULT.
 *   "refuse"       take `exitCodes.refuse`.
 */
incompleteExitPolicy?: "report-only" | "refuse";

// DetectContext
/**
 * Report that this detector read the current target only in part. May be called MORE THAN ONCE
 * per target. `reason` must be a member of `incompleteReasons` or the engine REFUSES the scan.
 */
incomplete: (report: { bytes: number; reason: string }) => void;
```

**`dicom` would declare `incompleteReasons` as exactly these six literals**, which are its
`HALT_REASONS` table today:

```
"a header the remaining bytes cannot hold"                 truncated header, long form only
"a header whose VR field is not two uppercase letters"     Explicit VR only
"an undefined-length value (0xFFFFFFFF)"                   PS3.5 §7.5.2. A CONFORMANT file reaches this
"a value length that runs past the end of the object"      the declared length overruns
"a header that does not advance the walk"                  defensive; measured UNREACHABLE, and kept
"a tail too short to hold an element header"               not a halt on a header at all
```

## What the engine must do with it, and every clause is a measured requirement

**Aggregate per LOCUS, never per path the caller names.** `ctx.incomplete` takes no path, on purpose:
an embedded object's unread tail is attributed to the PAGE, which is the file a developer has to
edit, exactly as its hits are. One entry per locus holding an occurrence count, a byte sum, and a Set
of reasons.

**Print one stderr line per locus, after the hits, plus a total.** The shape that exists today and is
worth keeping verbatim:

```
[phi-scan] PARTIAL: <locus>: the DICOM sweep stopped before the end of N object(s),
  leaving M byte(s) it never read: <reasons>
```

The wording "the DICOM sweep" is caller vocabulary; the engine needs a noun. `incompleteNoun?:
string` defaulting to `"the detector"` is enough.

**CARRIES:** the locus, two counts, and tokens from the declared set. **DOES NOT CARRY:** no tag, no
VR, no value, no byte of the object. **"No offset" is NOT on that list and a draft that put it there
was refused**: for a file holding one object, `bytes` is `objectLength - haltOffset` and the object's
length is the file's committed size, so the halt offset is recoverable. The honest statement is that
the counts are structural positions rather than content, not that a position is absent.

**🛑 THE CLEAN LINE MUST CHANGE WHEN THE SET IS NON-EMPTY.** `OK: no hits` is a clearance and may not
stand over a target a detector read only in part. **The token `OK` is CUT rather than qualified**, and
with no incomplete read the line stays byte-identical to what it always was, which is what lets the
whole feature be a strict superset of the existing output. Today's replacement reads: `no hits, over
a corpus in which the DICOM sweep stopped early in N file(s), listed on stderr. This run is not an
all-clear.` It says "on stderr" and not "above" because the clean line goes to stdout and the
`PARTIAL` lines to stderr.

**🛑 IT MUST NOT MOVE THE EXIT CODE UNDER THE DEFAULT POLICY, AND THE COST IS STATED RATHER THAN
CLAIMED AWAY.** An incomplete read is neither non-zero code: nothing was found, and nothing refused
the scan. `refuse` would fire on a file §7.5.2 makes LEGAL, and it would MASK a real hit whenever both
were present, downgrading a detection to an invocation error. **🔴 So a CI job that reads only the
exit code still cannot see this. Open, disclosed, and not argued away.** `incompleteExitPolicy` is
offered so a sibling can take the other side, and `dicom` will state `"report-only"` explicitly
rather than inherit it, on the same reasoning that gives `exitCodes` no default.

**Bounded in memory by construction, which `hits` is not.** One entry per locus holding two numbers
and a Set that cannot exceed the declared vocabulary. An attacker-chosen object count moves the counts
and not the footprint. **That bound is exactly why `reason` may not be free text**: a payload-derived
token would give the payload a vote on how many classes exist.

**It needs no print cap of its own, and that is structural.** The output is bounded by the number of
LOCI. A page carrying ten thousand halting objects prints ONE line with the count on it. Pinned
today at `--max-hit-lines 1` over a file whose hits run to the hundreds: the hit line, the suppression
line and the `PARTIAL` line are all present.

## The evidence the `config` worker should lift

`scripts/measure-phi-scan-unread.ts` is committed on `main` and re-derives the whole matrix:
**13 objects x 5 carriers x 3 cap settings = 195 cells**, each a run on base and on the shipped tree
over byte-identical input. It reported exit code identical **195/195**, hit detail lines identical as
a multiset **195/195**, output strictly larger in **105**, the withdrawn `OK - no hits` replaced in
**30**, violations **0**. Every object is put through `@cosyte/dicom`'s own `parseDicom` and
**classified by what the parse produced, never by its label**, which caught a real mislabel. Point it
at a base scanner path and it prints the table.

## What `dicom` still owes here, and it is NOT mine to close in this slice

**🔴 A FILE-META HALT IS REPORTED ONLY IF THE DATASET LOOP ALSO STOPS AT THAT OFFSET, AND UNDER
IMPLICIT VR LE IT MAY NOT.** Only the dataset loop records today. `readElementImplicit` is a different
predicate set, so the same bytes can report a different reason, or read as a header and let the walk
continue past the offset the File Meta group gave up at, reporting nothing. This is an open item on
`DICOM-RESIDUALS`, it is measured, and it is named here only because **the API above must accept more
than one report per target or the remedy is not expressible.** That is the single design constraint it
places on the engine.

---

# PART D. ENGINE SPECIFICATION 2: the Markdown read-filter default is a false green, reachable by default

## The defect, measured

`isWalkReadable` defaults to `exemptsMarkdown`, so a tracked `.md` is read by NEITHER sweeping route.
When a scan root IS a `.md` file, or the corpus under a root is markdown, the run reports clean over a
corpus it never opened. **The completeness rule does not catch it**, and that is the sharp edge: the
read filter drops the path UPSTREAM of enumeration, so the target never exists and there is no
"enumerated and never read" for the rule to fire on.

**Reproduced at `@cosyte/script-utils@0.0.2`, exit codes and all:**

```
--- default isWalkReadable (the engine's Markdown exemption) ---
[phi-scan] OK: no hits
exit: 0
--- isWalkReadable: () => true ---
[phi-scan] HIT: README.md
  segment=(ssn) value="<the dashed identifier, redacted here>" (dashed SSN pattern)
exit: 1
```

_The value is redacted in this transcript on purpose, and the case below assembles it at runtime for
the same reason: a document that spells out a violator run is a document that reds the gate proving
the gate works, and this repo's own test corpus follows that rule everywhere._

**The reproducing case, to be pinned in `cosyte/config` with a test that reds if the fix regresses:**

```js
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPhiScan } from "@cosyte/script-utils/phi-scan";

const root = mkdtempSync(join(tmpdir(), "phi-md-root-"));
const git = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
git("init", "-q");
git("config", "user.email", "t@example.com");
git("config", "user.name", "t");
// Assembled at runtime so this test file does not itself carry a live identifier.
const SSN = ["123", "45", "6789"].join(String.fromCharCode(0x2d));
writeFileSync(join(root, "README.md"), `# doc\n\nsubject ${SSN} end\n`);
writeFileSync(join(root, "allow.txt"), "# none\n");
writeFileSync(join(root, "overrides.md"), "# log\n");
git("add", "-A");
git("commit", "-qm", "x");

// EXPECTED AFTER THE FIX: exit 1, one (ssn) hit. MEASURED AT 0.0.2: exit 0, "OK: no hits".
runPhiScan({
  exitCodes: { clean: 0, hits: 1, refuse: 2 },
  scanRoots: ["README.md"],
  isStagedReadable: (p) => p === "README.md",
  repoRoot: root,
  argv: [],
  allowListPath: join(root, "allow.txt"),
  overrideLogPath: join(root, "overrides.md"),
});
rmSync(root, { recursive: true, force: true });
```

## Why it is not a `dicom` problem with a `dicom` remedy

Under the default, **13 of the 101 tracked files under this repo's roots are dropped by both sweeping
routes**, and they are named rather than counted: `README.md`, the eleven `docs-content/*.md` pages,
and `test/smoke/README.md`. The fourteenth `.md`, `test/fixtures/phi-scan/README.md`, is this repo's
declared corpus exemption and is dropped on purpose. So the default does not merely blind a root, it
blinds the entire DOC corpus, which is the half that carries base64-encoded Part 10 objects and the
half that **ships**: `README.md` goes in the npm tarball and `docs-content/` goes to
docs.cosyte.com.

## The corrected default

**A ROOT NAMED AS A FILE MUST BE READ, whatever its extension.** The engine already treats an
explicitly-named argv path that way ("a `.md` named explicitly on argv IS scanned"), and a scan root
is a stronger declaration than an argv path: it is committed configuration. A root the caller named
and the engine silently declined to read is the same defect class as a root nobody notices is empty.
Minimum fix, and the one with no cost to the twelve repos that root at `["."]`:

```
isWalkReadable defaults to: (relPath) => isDeclaredFileRoot(relPath) || exemptsMarkdown(relPath)
```

**What it costs:** a repo whose scan roots name a `.md` file starts reading it. That is one file per
such root and it is a file the repo declared. Zero repos root at `["."]` lose anything, because `.`
is a directory root.

**The wider question the fleet has already answered, and it is not mine to decide:** `phi-scan.md`
records this as the THIRD escape class, confirmed independently in three repos, with `deid`'s direct
probe showing a full HL7 message and a bare SSN in markdown returning `OK, no hits` at exit 0 while
the identical bytes in `src/control.ts` returned 7 hits at exit 1. Dropping `exemptsMarkdown` as a
default entirely would close the class rather than this instance of it, at the cost of every repo's
`.md` prose that legitimately describes a violator value. **`dicom` needs only the file-root arm.**
Whether the wider default moves is a `cosyte/config` decision with thirteen consumers.

---

# PART E. The rest of the gap, as parameters

Each row is something base does that `@cosyte/script-utils@0.0.2` cannot express. None is
re-implementable locally under the directive.

## 1. A hit line echoes the violating value unbounded

**Parameter:** `maxHitValueLength?: number` (default: no bound, which is current engine behaviour).
`dicom` declares **194**.

A diagnostic about a PHI leak is itself a PHI surface, and `value` is the one payload-derived slot on
the line: an element declares its own length, so a `(0010,0010)` claiming the rest of the object put
the rest of the object on one stderr line to say that a name was not on the allow-list. **194 comes
from PS3.5 2026c Table 6.2-1's PN row** (`64 chars maximum per component group`, `up to 3 groups`,
`no more than two component group delimiters`, so 3 x 64 + 2), and PN is the longest of the three VRs
this scanner reads. 🛑 **That row's lengths are in CHARACTERS and this bound is in `String.length`**:
the tag route decodes latin1 and counts bytes, the text route counts UTF-16 code units, so the bound
says what this scanner prints and nothing about what the standard admits.

**Three clauses the engine must get right, each paid for here:**

- **Bound at construction, inside `ctx.hit`, never in the printer.** A bound in the printer holds only
  from where the printer is called, and the hit still carries the whole payload for the next thing to
  read it.
- **The excerpt must OWN its bytes.** V8 answers `raw.slice(0, n)` with a string that POINTS INTO ITS
  PARENT, so an excerpt cut from an 8 MiB decode keeps the whole 8 MiB alive for the run. Measured:
  retention grew by one whole file per hit-bearing file, and did not grow at all once the excerpt
  owned its bytes. The round trip must be `utf16le`, because `Buffer.from(s, "utf8")` turns an
  unpaired surrogate into U+FFFD and would print a character the file does not contain.
- **The withheld amount is printed OUTSIDE the quotes and carries NO UNIT**, because the two routes
  measure in two different ones.

## 2. There is no print cap, and one recognizer's findings can bury another's

**Parameters:** `recognizers?: readonly string[]` (the closed class table, declared as data),
`hitLinesPerRecognizer?: number` (default 0, meaning uncapped, which is current engine behaviour), and
a `--max-hit-lines <n>` flag in the engine's own argument parser. `dicom` declares the four
recognizers `tag-pn`, `tag-date`, `text-pn`, `text-date` and a budget of **20**, and
`ctx.hit` gains an optional `recognizer` field.

Why there is a cap at all, measured rather than asserted: the text recognizers fire on image noise at
a rate that is a property of the payload's byte histogram, and re-measured over 8 MiB of synthetic
`(7FE0,0010) OW` pixel data a uniform payload produced tens of thousands of hits and one stderr line
each.

**Four properties the engine must preserve, each of which a draft here got wrong once:**

- **It is a PRINT cap and nothing else.** The exit code and the summary total are computed from
  `hits.length` and neither is capped. A cap that could move either would be a net leak dressed as
  tidy output.
- **PER LOCUS, never global.** A global cap is the net-leak shape: one flooding file consumes the
  whole budget and every later file's hits go unprinted, with the flooding file the only path on
  screen.
- **PER RECOGNIZER within that locus**, and keyed on the DECLARED class, **never on `reason`**.
  `reason` is assembled at the push site, so one detector interpolating a payload-derived token into
  it gives the payload a vote on how many classes exist, and a per-class budget times an
  attacker-chosen class count is no budget.
- **⚖️ THIS IS NOT MONOTONICITY AND MUST NOT BE LABELLED THAT.** Under any budget that cuts at all,
  n+1 hits from one entry print n, so adding a hit can always remove a line. What is closed is one
  entry's budget being spent by ANOTHER entry's findings. A claim that the general property holds was
  refused here.

## 3. The engine hands scan-target bytes to a `RegExp`, which leaves them on a process global

**Parameter:** none. This is a straight engine fix.

**Measured at 0.0.2.** `scanCommonShapes` runs `content.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)` and
`content.matchAll(/...@.../g)` over every target's text, and `loadAllowList` / `loadOverrideLog` run
`raw.split(/\r?\n/)` over their own files. V8 keeps the last successful match on the `RegExp`
CONSTRUCTOR: after one match `RegExp.input` holds the WHOLE SCANNED FILE and `RegExp.lastMatch` holds
the matched identifier VERBATIM, and both are readable properties of a global object.

**Measured THROUGH `runPhiScan` itself, not in isolation, because a snippet proves nothing about what
the engine leaves behind.** Driving the run described at the top of this note over this repo's own
corpus and then reading the constructor from the caller: `RegExp.input.length` is **153,954** and the
string is one of the scanned files, and `RegExp.lastMatch` is `"t@example.com"`, the identifier the
last floor match found. Both survive the return of `runPhiScan`, so they are readable for the rest of
the process's life or until something else matches.

`dicom` closed exactly this in `#109`, `#111` and `#112` and the file constructs no `RegExp` at all
today. **Adoption reintroduces it, and it is an ENGINE defect rather than a local one.** The remedy
this repo has already paid for is a forward scanner per pattern, pinned by differential fuzz against
the pattern it replaces (`test/scripts/phi-scan-matchers.test.ts`), plus
`scripts/measure-phi-scan-regex-statics.ts` as the instrument. **🛑 The bound is on the SUBJECT, not
on a cleanup call**: overwriting the statics after the scan is a bound that holds only from where the
cleanup runs, and this lineage has ruled that shape out three times. Remove the slot, do not filter
the value.

## 4. The CLI epilogue drops the tail of its own report

**Parameter:** none, or better, `runPhiScanCli(config): void` so the epilogue is engine-owned too.

The parser template's epilogue is `process.exit(runPhiScan({...}))`. **`process.exit()` tears the
process down without waiting for stdio libuv has accepted but not yet written**, and this script's
stderr is a PIPE under every caller that matters. Measured on `21d42f5` over a 200-hit file with
stderr on a pipe whose reader is not keeping up: **30 of 60 runs delivered FEWER THAN 200 hit lines**
(190, 191, 192, 170, 171 seen) with exit 1 every time, and **60 of 60 delivered all 200** with
`process.exitCode` instead. A truncated report is a run that under-names what it found.

`process.exitCode` also makes a late stdio error REACHABLE, which `process.exit()` hid, so two
discarding `'error'` listeners on stdout and stderr are not optional: an `EPIPE` on a later tick takes
node's default handler, which exits **1**, the one code that means "PHI was found". Measured with the
reader closed: a clean corpus went 0 to 1 and an invocation error 2 to 1.

**🔴 One residual, introduced by the fix and not closed by it:** with a reader that never drains,
the script now WAITS instead of exiting. Blocking until the reader takes the bytes is what makes the
report whole; a timeout would re-introduce the defect.

## 5. The override log is parsed with a naive line split, so what a human sees and what the gate reads disagree

**Parameter:** none. `dicom` has three closed escapes the engine does not have.

The engine reads `/^###\s+(.+?)\s*$/` over `raw.split(/\r?\n/)`. `dicom` closed three things in
`#116`, `#117` and `#118`: **CommonMark's line ending** (a lone `CR` is a line ending, and a
`CR`-blind split hides both a `###` heading and a fence OPENER, so a `### <path>` a human sees INSIDE
a rendered code block is a live allow entry), **CommonMark's HTML blocks** (a comment cannot exempt a
target), and **an invisible character between `###` and the path**.

**⚖️ SCOPE THIS ONE HONESTLY: under the engine none of it can buy a clean run.** All three
`--allow-fixture` branches refuse. An unlogged path is rejected at the argument tier; a logged path
the run does not enumerate is refused because the flag subtracts nothing; and a logged path the run
DOES enumerate is admitted, recorded, withdrawn, and then refused by the completeness rule. So an
over-admitting parse is a diagnostic-fidelity defect at exit 2, not a false green at exit 0. That is
a materially weaker case than items 1 to 4 and it is stated as such.

`dicom` carries a SHA-pinned CommonMark 0.31.2 under `vendor/commonmark/spec/` with
`test/scripts/commonmark-pin.test.ts` re-hashing it, and a worked `splitCommonMarkLines` /
`htmlBlockStart` / `fenceRun` implementation the `config` worker can lift. **🛑 No direction is
claimable for either split, because fence state is PARITY**: reading a line ending wrongly moves
every boundary after it, and on one log the two readings' entry sets were measured DISJOINT.

## 6. The allow-list destroys the casing a detector may need

**Parameter:** add `namesRaw: Set<string>` to `AllowList`, alongside the uppercased `names`.

`loadAllowList` does `names.add(value.toUpperCase())`, so a detector cannot match case-sensitively at
all. `dicom` matched case-sensitively on purpose. A second Set costs the engine nothing and lets each
caller pick; a boolean flag would make one repo's choice change the shape every other repo reads.

## 7. Nothing prints which paths the read filters dropped

**Parameter:** none, or `reportDroppedPaths?: boolean`. The engine should print, per run, the
in-scope paths its read filters dropped.

Base prints `[phi-scan] corpus exemption in force for N file(s): <paths>` on **every** run, from the
paths the walk actually reached and skipped. **An exemption nobody can see is the same shape as a root
nobody notices is empty**, and this is an OBSERVATION rather than a declaration: it goes stale
visibly the moment the file it names moves. It is deliberately not a denominator.

## 8. A root that changes kind is silently treated as what it became

**Parameter:** allow `scanRoots: readonly (string | { path: string; kind: "file" | "directory" })[]`.

Base declares `{ rel, shape }` and refuses a mismatch; the engine derives. Lowest priority of the
eight, listed because it is a real property this adoption gives up and the item's own note about
derivation says the same thing.

---

# What this branch does NOT do, and why

- **No adoption.** `scripts/phi-scan.ts` is byte-identical to `origin/main`.
- **No changeset, no CHANGELOG entry, no version bump.** Nothing ships. (This repo's `CHANGELOG.md`
  is GENERATED from changeset summaries and must never be hand-edited or given back an
  `[Unreleased]` heading.)
- **No test surgery.** `test/scripts/phi-scan.test.ts` (3,259 lines),
  `test/scripts/phi-scan-matchers.test.ts` (1,320) and
  `test/integration/phi-scan-regex-statics.test.ts` (238) all assert behaviour the engine will move,
  and cutting them before the engine's messages are settled would be re-done.
- **The only tracked change is the `@cosyte/script-utils@^0.0.2` devDependency and its lockfile
  entry**, which is what made every measurement above possible.
- **`DICOM-RESIDUALS` is untouched.** One residual is NAMED here because the completeness API must
  accept more than one report per target or the remedy for it is not expressible: the file-meta halt
  under Implicit VR LE. Nothing about it is closed, and none of the rest of that ledger is this
  slice's.

# The gate constructs no `RegExp` at all, and its override log is no longer fence-blind

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. **That is HEADROOM, not file size,
> and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> `.claude/hooks/doc-budget.mjs`. `documentation/agent-notes.md` is **257,209 B, over its 250,000
> ceiling** on `main`, so this record is here instead (**budgeted at `REPO_DOC_MAX`, not unbudgeted**).
> **No trap deleted, no ceiling raised.** What points at it, verified by `git grep` rather than
> asserted: `scripts/phi-scan.ts`, `scripts/measure-phi-scan-regex-statics.ts` and
> `documentation/agent-notes/dicom-phi-scan-regex-statics.md`. **No always-read file does.**
>
> 🩺 **The refuter's pass-1 major was this paragraph.** It named those three pointers when only the
> third existed, called the destination unbudgeted when the hook gives it `REPO_DOC_MAX`, and the
> same commit **deleted** `scripts/phi-scan.ts`'s only citation of this lineage's record without
> replacing it. So the one compensating control for `CLAUDE.md`'s six bytes of headroom was a
> sentence that was false by inspection, in the commit that wrote it. The citations are restored and
> the claim is now checked by the command above.

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `01d0983`. Last verified 2026-08-10.

Closes the two residuals `#112` left open, and they turned out to be **one mechanism**, which the
census showed rather than an argument:

- _"The gate's own CONFIGURATION is still a `RegExp` subject"_, disclosed **by a measured figure
  rather than a description**: every clean column read `input 3772`.
- _"`PRE-EXISTING`: `loadOverrideLog` is FENCE-BLIND, so the committed `phi-scan-overrides.md`
  template line parses as a live allow entry."_

## The disclosed figure, verified before anything was built to it

`scripts/phi-allow-list.txt` is **3,774 bytes** and **3,772 UTF-16 code units**. The two differ by
exactly the one astral emoji in it, four bytes for two units. So `input 3772` is the allow-list
**in code units**, and quoting the byte count would have been wrong by two.

A runtime census over five invocation modes on `01d0983`, taken by wrapping `RegExp.prototype`'s
`exec`/`test` and the four `Symbol` methods and recording every call with its stack:

| route                      | regex operations                             | subject held at exit                       |
| -------------------------- | -------------------------------------------- | ------------------------------------------ |
| no arguments (all-mode)    | **3,773**, every one `loadAllowList`'s split | `input` 3,772, `lastMatch` `"\n"`          |
| `--max-hit-lines 5 <path>` | 3,775                                        | `input` 3,772                              |
| `--staged`                 | 3,774                                        | `input` 32, the git raw record             |
| `--allow-fixture <path>`   | 597                                          | **`input` = `lastMatch` = `"### <path>"`** |
| `--max-hit-lines banana`   | 2                                            | `input` 0                                  |

## 🛑 The census is what made this ONE slice rather than two

The last row is the finding. On the route that reads the override log, **the retained `RegExp`
subject IS the fence-blind template line**, held verbatim in both `input` and `lastMatch`. The two
residuals are not neighbours, they are the same eleven lines of code: `loadOverrideLog` held **two
of the five** live regex sites, and its fence-blindness is a defect of the same line-oriented parse
the regex was doing.

Every one of the five sites was on the configuration route. There were none anywhere else, which is
what `#112` had already achieved for the scan route.

## The fix

**The script now constructs no `RegExp`.** Five sites became forward scanners: `isAllDigits`,
`splitLines`, `tripleHashValue`, `fenceRun` + `overrideLogPaths`, and `rawRecordMode`.

**The carve-out sentence is DELETED rather than worded a fifth time.** `#112` was refused in passes
1, 2 and 3 for a universal its own config parsers falsified, and its final remedy deleted the
sentence. The way to stop wording a carve-out is to remove what it carved out, and the universal is
now simply true. **A scrub was again available and again refused** (`#109`, `#111`, `#112`): a bound
that holds only from where a cleanup is called is not a bound. There is nothing to clean up.

## 🔴 One parser is DELIBERATELY narrower, in the fail-closed direction

`overrideLogPaths` is **not** an equivalence, and this is the only intended behaviour change:

1. **Fence-awareness**, the residual itself.
2. **An all-whitespace heading no longer registers a lone space as a path.** Found while measuring
   the pattern, not inherited: `\s+` is greedy and `(.+?)` needs one character, so `"###  "` makes
   the engine hand one space back out of the run and capture it. `normalizePath(" ")` is then a
   root-level entry for a file named with a single space.

Both narrowings are fail-closed **as narrowings of `overrideLogPaths`**: a dropped entry makes
`--allow-fixture` **refuse the run** (exit 2), so the target is not exempted. Exit 2 does not scan
it either, and saying so was a third wording this record had to correct: the run stops and says
nothing about the corpus, which is a refusal rather than a clearance.

## 🛑 But `fenceRun` has no safe direction, and two passes were spent learning it

**FENCE STATE IS PARITY.** Three drafts of `fenceRun`'s comment claimed a fail-safe direction and
two gates refused it, the second with the measurement that kills the shape entirely. On
`open / A / close-with-a-trailer / B / close / C`:

| how the trailer is read           | dropped  | live    |
| --------------------------------- | -------- | ------- |
| as bare, so it closes             | `A`, `C` | **`B`** |
| as an info string, so it does not | `A`, `B` | **`C`** |

Getting one fence wrong does not merely drop or admit that block's headings, **it swaps every block
boundary after it**, moving entries in both directions at once. So "narrower is safer" is false
here, and the argument is **DELETED rather than worded a third time**. What replaces it is not a
safety heuristic but a specification: CommonMark 0.31.2 §4.5.

Two defects were found this way, each by a different pass, each measured on the head that carried
it and each now a named test plus a mutant:

1. **Pass 1:** `bare` used `isSpaceCode`, the whole of `\s`. §4.5 admits only spaces and tabs after
   a closing run. A closing run trailed by an invisible `NBSP` or `IDEOGRAPHIC SPACE` **closed the
   block**, and a heading written inside what a human sees as a code block became a live allow
   entry, exempting the target at exit 0.
2. **Pass 2:** after narrowing to space and tab, **the tab arm was unpinned** and dropping it passed
   all 18 cases. Dropped, the same parity flip happens with a tab. The control in the other
   direction had only ever used a space; it now uses both.

## 🔴 Two corrections applied AFTER the fourth pass, and therefore UNGRADED

The gate returned `NOT REFUTED` at the cap with two `minor` findings, and named both as backlog
lines safe to ship around. They were applied anyway, because each is a **deletion of a false
sentence** and a comment cannot change behaviour. **They carry no refuter verdict and that is stated
rather than glossed:**

1. `Fence.bare` claimed _"each arm has been wrong once and each is pinned by its own case."_ Both
   halves false: `isSpaceCode` admits `0x20` and `0x09`, so no head ever shipped a wrong arm, and
   dropping **either** arm reds the **same** single case. Replaced with that measurement.
2. The exit-2 misstatement was corrected in the note and the changeset but **left standing in the
   two code carriers**, which are what a maintainer reads first. Corrected to the wording the fourth
   pass measured as true.

**🔴 And one RED GATE that no refuter pass caught, because it is not a conformance question.** CI's
`CodeQL` check refused the first push with **1 new high-severity alert in code changed by this PR**:
`js/file-system-race` on `missingFromOverrideLog`'s `existsSync`-then-`writeFileSync`. A
check-then-act race, in the helper written to prove the override log is parsed correctly. Closed by
**deleting the check** and writing unconditionally, which is also what the helper wanted: every
candidate is a throwaway file whose only job is to make the refusal be about the missing LOG ENTRY
rather than about a missing file. Worth recording because `scripts/verify.sh dicom` was green
throughout and **does not run CodeQL**: a locally green gate is not the whole gate.

## 🔴 One known divergence from §4.5, PRE-EXISTING and disclosed rather than argued harmless

§4.5 also says an info string after a **backtick** fence may not contain backticks. `fenceRun` opens
on ` ```a\`b `anyway. Measured: on`open-with-that-info-string / X / close / Y / close`, this tree
makes `Y`a live allow entry where CommonMark renders it inside a code block. **Base`01d0983`is
fence-blind and makes both live**, so this tree is strictly the smaller surface and the divergence
is`PRE-EXISTING` in outcome. It is a backlog line, not this slice's to close: narrowing the opener
is a third selection change on a function that has already cost two passes.

## 🛑 The inertness was RE-MEASURED, not inherited, and it holds twice over

`#112` recorded the fence-blind entry as inert. Re-measured here, in a throwaway repository with a
PHI-bearing file whose repo-relative path IS the placeholder:

| route                                      | can a target normalize to `<path>`?                                                                  | outcome                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `all` (what CI runs)                       | **no**, the placeholder is a ROOT-LEVEL path and `SCAN_ROOTS` is `test`, `README.md`, `docs-content` | never a target                        |
| `--staged` (what the pre-commit hook runs) | **no**; the file was staged, git listed it in `--raw`, and `SCAN_SCOPE` dropped it                   | never a target                        |
| explicit paths                             | **yes**                                                                                              | **exit 0, target exempted, silently** |

So the inertness is stronger than "no tracked path is named `<path>`": **neither gating route can
produce such a target at all.** It was live only where a caller names the file itself. Pinned beside
its controls: the same bytes with no flag exit **1**, and a path with no entry at all exits **2**.

**This is NOT a stop-the-line finding.** It is closed here regardless, because an allow-list entry
no human wrote is a silent exemption waiting for a path to match it.

## Figures, all re-measured on the shipped artifact

Base `01d0983` restored **by file copy**, never `git checkout`. Instrument extended and shipped as
`scripts/measure-phi-scan-regex-statics.ts`.

|                                                   | base                     | here                                           |
| ------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| scan shapes leaving a `RegExp` subject            | **7 of 7**, `input 3772` | **0 of 7**                                     |
| config routes leaving one                         | **5 of 6**               | **0 of 6**                                     |
| config routes byte-identical to base, as required |                          | **5**                                          |
| config routes DELIBERATELY different              |                          | **1**, and the instrument refuses if it is not |
| routes disagreeing with either expectation        |                          | **0**                                          |

| equivalence, whole output byte for byte             |                                                     |
| --------------------------------------------------- | --------------------------------------------------- |
| cells (real corpus + adversarial + 32 fuzz corpora) | **34**                                              |
| **cells differing from base in any byte**           | **0**                                               |
| cells that refused (exit 1)                         | 33                                                  |
| hit lines compared                                  | **9,283**                                           |
| **MUTATION CONTROL, same cells, one character**     | **17 cells differ**                                 |
| detector positive control                           | fires, and **the instrument throws if it does not** |

**🛑 THE ZERO IS PINNED BESIDE POSITIVE CONTROLS AT BOTH ENDS.** The detector must report a token a
regex has just matched; the equivalence grid must report a one-character mutant; and the config
comparison names the one route that MUST differ, refusing with `NO CHANGE, where one was intended`
if the fence fix ever stops working. A control that cannot fail is not a control.

## Tests: 12 new cases, 8 red on base, and why 4 are green by design

**8 of 12 are red on `01d0983`.** The other **4 are GREEN ON BASE BY DESIGN**: they assert that
removing the regexes moved nothing, so a red one would mean the slice changed behaviour it should
not have. The figure that says they are not vacuous is the mutation grid, over the 18 cases in the
two files:

| mutant                                                             | cases red |
| ------------------------------------------------------------------ | --------- |
| `splitLines` splits on a lone `CR`                                 | 1         |
| `isAllDigits` widened to `Number()`                                | 1         |
| `tripleHashValue` drops the `LineTerminator` check                 | 1         |
| `fenceRun` never sees a fence (base behaviour)                     | **6**     |
| a closing fence need not be bare                                   | 2         |
| fence indent allowance removed                                     | 1         |
| tilde fences not recognized                                        | 1         |
| all-whitespace narrowing reverted (base behaviour)                 | 1         |
| `isSpaceCode` drops `NBSP`                                         | **5**     |
| **`bare` computed over all of `\s` (the refuter's pass-1 defect)** | **1**     |
| **`bare` drops its tab arm (the refuter's pass-2 defect)**         | **1**     |
| **`rawRecordMode` accepts UPPERCASE hex**                          | **0**     |

The override-log parser is driven as a **membership oracle**: `--allow-fixture` is repeatable and
the refusal names every path it could not find an entry for, so one subprocess reports exactly which
of a candidate set the parser produced. Both directions are asked separately.

## 🔴 Not closed, and named rather than claimed away

- **One shape is unreachable from outside the script and NO TEST CLAIMS IT.** `rawRecordMode`
  cannot be shown an uppercase-hex sha or trailing bytes after the status, because git does not emit
  either, and mutants widening both pass. **`splitLines`'s `CRLF` handling was named here as a
  second such shape and that was WRONG** - it is observable through `overrideLogPaths`, and the
  section below closes it. **A first draft of this
  slice's JSDoc claimed an exhaustive differential for each. Both sentences were DELETED** rather
  than reworded, on this repo's own rule that a disclosure naming a test must name one that exists.
  What does pin `rawRecordMode` was measured instead: a mutant that never parses a record reds **14**
  of `phi-scan.test.ts`'s 138 cases, and one returning the SOURCE mode reds **12**.
- **The `#112` note's own two carriers of the closed disclosure were found by a `-a` phrase sweep
  with newlines folded** and updated rather than left to read as current. The sweep's positive
  control is `test/integration/fatal-diagnostic-surface.test.ts`, which plain `grep` prints nothing
  for: **5 tracked files in this repo carry a literal NUL.** A first draft said 7, which is what
  `grep -I` rejects; the other two are the empty `.gitkeep` files, and rejecting-for-no-match is not
  the same measurement as carrying a NUL.
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a later
  hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the exit code still
  cannot see an unread tail. **This slice measures nothing about the heap.**

## 🛑 The `CRLF` half WAS observable, and the disclosure saying it was not is DELETED

> **This section is `#115`'s record and describes the call graph AS IT WAS.** `#116` moved
> `overrideLogPaths` onto its own CommonMark splitter, so the caller named below is now
> `splitCommonMarkLines` and `splitLines` is the allow list's alone. The finding stands; the
> function names have moved. See `dicom-phi-scan-line-endings.md`.

`#113` shipped `splitLines` with a 🔴 disclosure on it: the `CRLF` half was unobservable through
either caller and claimed by no test, because `loadAllowList` trims and `tripleHashValue` trims.
Those two premises are true. **The conclusion is FALSE, and false in exactly the way this file's own
`isSpaceCode` paragraph warns about** - it reasoned from what a caller does to a line AFTERWARDS,
which is the "bound that holds only from the call site" shape the slice was otherwise built to
refuse.

`overrideLogPaths` hands the RAW line to `fenceRun` BEFORE anything trims it, and `bare` there
admits a space or a tab and nothing else (CommonMark 0.31.2 §4.5, the rule `#113`'s own two refuter
passes were spent on). So on an override log written with `CRLF`, a `CR`-blind split leaves a `CR`
after the closing run, the run is read as an info string rather than as a close, the block never
ends, and every entry below it is dropped.

**Measured on one log - a fenced template, two live entries below it - both `--allow-fixture`
directions asked on each arm:**

| arm                           | the two entries below the fence | the fenced template |
| ----------------------------- | ------------------------------- | ------------------- |
| shipped, `CRLF` log           | exit 0, both honoured           | exit 2, refused     |
| `CR`-blind mutant, `CRLF` log | **exit 2, both dropped**        | exit 2, refused     |
| shipped AND mutant, `LF` log  | exit 0, both honoured           | exit 2, refused     |

The `LF` row is what makes this a fact about the line ending rather than about the fence rules
`#113` already pinned, and the template column is the other direction, so a parser that made
everything below an entry fails it too. The test runs both arms before asserting either, so a mutant
reports both in one failure (`{ crlf: Set{2}, lf: Set{} }`) instead of stopping at the first.

## 🛑 NO DIRECTION IS CLAIMED FOR THAT MUTANT, and the draft that claimed one was refuted BY MEASUREMENT

A draft of the section above argued the `CR`-blind mutant was **fail-CLOSED** - a `CR` can only
prevent a close and never cause one, `tripleHashValue` trims one off a heading, therefore the
mutant's entry set is a strict SUBSET and its cost is a refused `--allow-fixture` rather than an
exempted target. **That is the parity fallacy, it is the THIRD attempt at a fail-safe direction on
`fenceRun` in this lineage, and the gate falsified it with an input.** On a log whose lines are all
`CRLF` except one opening fence:

| target                     | shipped              | `CR`-blind mutant    |
| -------------------------- | -------------------- | -------------------- |
| `--allow-fixture decoy`    | **exit 0, exempted** | exit 2, refused      |
| `--allow-fixture smuggled` | exit 2, refused      | **exit 0, EXEMPTED** |

The two entry sets are `{decoy}` and `{smuggled}` - **disjoint, not nested** - and the mutant
exempts a target the shipped script refuses. A prevented close CAN invert later boundaries, which
is what "fence state is PARITY" means and what the `fenceRun` section above already measured. **The
argument is DELETED, not narrowed.** The branch is claimed by a test; nothing needs a direction.

**Mutation figure, re-measured on this slice's own head rather than inherited** (a figure
without its sha is not a fact, and the base moves): the `CR`-blind mutant (dropping the `i - 1`
test) reds **1 of 1,369 cases across all 75 test files**, the 1 being the new case. The run is
`1 failed | 1,367 passed | 1 todo`; the **`todo` is what makes those three numerals add up**, and
the shipped tree reads `1,368 passed | 1 todo`. On base `fd0b92a`, the same mutant over the base
suite reds **0 of 1,368**, so `#113`'s "passes the whole suite" is re-measured as **0 before, 1
after** rather than restated.

**This slice changes no behaviour.** Every changed line in `scripts/phi-scan.ts` is a comment line -
checked with the TypeScript transpiler rather than by eye, `removeComments` output byte-identical on
base and head - so the gate's exit codes, hits and totals are what `fd0b92a` produced.

**🔴 THE CARRIER COUNT IS SCOPED TO THIS SUBMODULE, AND THE SCOPING IS THE POINT.** A draft said the
false disclosure had "exactly four carriers"; the sweep that produced that numeral never left
`/workspace/dicom`, so the numeral asserted an exhaustiveness it had not measured. **Four carriers
inside this repository** are corrected: two in `scripts/phi-scan.ts` (the config-parser header list
and the `splitLines` JSDoc), one in `test/scripts/phi-scan-matchers.test.ts`, and the bullet above.
The sweep was `-a` and newline-folded, positive control
`test/integration/fatal-diagnostic-surface.test.ts` - **read whole, 84,556 bytes carrying 4 NULs** -
so the zero elsewhere is one the sweep could have broken. **TWO MORE CARRIERS ARE LIVE IN THE
META-REPO AND ARE NOT THIS PR'S TO EDIT**, both now false by this slice's measurement:
`operations/BACKLOG.md`'s `DICOM-RESIDUALS` line and
`documentation/repos/dicom/phi-scan-value-excerpt.md`, each still reading _"`splitLines`'s CRLF half
is claimed by no test (both callers `trim()`, so a `CR`-blind mutant passes the suite)"_. They are
handed to the meta-repo, named rather than left to read as current.

**Unchanged by this slice, in either direction:** `hits` unbounded as an array; the relocation,
`contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a later hit;
the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the `rawRecordMode` shapes
git cannot emit. **It measures nothing about the heap and nothing about the corpus.**

**🟢 AND ONE THE GATE RAISED THAT IS NOW CLOSED.** `splitLines` mirrored `/\r?\n/`, so a LONE `CR`
was not a separator; CommonMark counts one as a line ending, which made `overrideLogPaths` diverge
on a log carrying one, in the direction that admits an entry a human reading the rendered log does
not see. It was filed here as a backlog line rather than absorbed (ADR 0016 rule 2), with the figure
left un-retaken because grounding it needed a CommonMark oracle this repository did not vendor.
**`#116` vendored one and closed it**: `dicom-phi-scan-line-endings.md`.

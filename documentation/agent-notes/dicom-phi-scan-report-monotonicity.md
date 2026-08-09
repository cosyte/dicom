# dicom - the PHI gate's print budget is spent PER RECOGNIZER (2026-08-09)

`DICOM-RESIDUALS`, the slice `dicom-phi-scan-report-cap.md` left open and `#109`, `#110` and
`dicom-phi-scan-unread-tail.md` each re-disclosed unchanged: **`report()` was not monotone at the
per-file cap.** Written here rather than in `documentation/agent-notes.md` because that file is over
its 250,000-byte budget on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Derive the headroom, never restate it: `git show origin/main:CLAUDE.md | wc -c` against this
repo's entry in the meta-repo's `.claude/hooks/doc-budget.mjs`. It is a handful of bytes, which is not
a line. So the rule lives where a worker touching this code reads it: the JSDoc on
`DEFAULT_HIT_LINES_PER_RECOGNIZER`, on `RECOGNIZERS` and on `report`, the block in
`test/scripts/phi-scan.test.ts` under
`"phi-scan: the print budget is spent PER RECOGNIZER, so no class spends another's"`, and this file.

**Provenance.** Every figure below is a measurement on the tree that shipped, against base
**`7754a6c`** restored **by file copy**, never `git checkout`. **The grid and every count in it come
out of the committed instrument**, which prints them in one run:

```
git show 7754a6c:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
pnpm measure:phi-scan-monotonicity /tmp/base-phi-scan.ts
```

**The red-on-base test figure is NOT from that script** and says so where it is written. Nothing else
on this page is a figure.

## The defect

`report()` grouped a file's hits and printed the first `n` in scan order. That is one budget for the
whole file, and the file's routes do not append to it independently: **`scanDicom` appends before
`scanText` within a file, so how many of the text sweep's findings were printed was decided by how
many the tag walk had already made.** So ADDING hits could REMOVE a printed line. The text sweep's PN
recognizer is the only route that can see a caret-joined name in bytes the tag table never typed
(`#102`, `dicom-scandicom-silent-halt.md`), and it is the one at the end of the queue.

**IT WAS NEVER A FALSE GREEN AND IS NOT DESCRIBED AS ONE.** The exit code, the total, the set of files
named and the withheld count are computed off `hits` and were right throughout. What moved was
**which** lines a reader saw.

**AND THE ITEM'S OWN WORD FOR IT IS WIDER THAN WHAT ANY CAP CAN FIX.** See the section below: this
slice closes the cross-entry half and measures the rest rather than claiming it.

**WHY A 77-CELL CHECK WAS BLIND TO IT:** it never got a file above three hits against a default budget
of twenty. A cap that is never reached selects nothing.

## The fix, and where the bound lives

The budget is spent **per entry of a closed `RECOGNIZERS` table, per file**. A hit prints when its
index among that file's hits **from its own recognizer** is under the budget - a question no other
recognizer's findings are an input to.

**THE TABLE IS A TYPE, NOT AN ANALYSIS OF THE PUSH SITES.** Budgeting on `reason` would have been one
field cheaper and would not have been a bound: `reason` is assembled at the push site, so one future
recognizer interpolating a payload-derived token into it hands the payload a vote on how many classes
exist, and a per-class budget times an attacker-chosen class count is no budget. `Hit.recognizer` is a
union of four literals, so the per-file line bound is `n x |RECOGNIZERS|` and TypeScript refuses a
push site that does not name one. Same shape as `HitValue` in `#109`: **remove the slot, do not filter
the value.**

**THE `hits` ARRAY IS STILL NOT CAPPED, DELIBERATELY.** A cap there makes the totals a claim about
what was kept rather than about what was found. Unchanged, and not revisited.

**THE RECOGNIZER IS NOT PRINTED.** This slice answers a selection question, not a reporting one; the
hit line's fields and the suppression line are byte-for-byte the shapes they were. A diagnostic about
a PHI leak is itself a PHI surface, and a per-recognizer breakdown on the suppression line would be a
new one for no gain.

## 🛑 THIS IS NOT MONOTONICITY, AND CALLING IT THAT WAS THIS SLICE'S OWN REFUSED CLAIM

Pass 1 refused the sentence *"adding hits cannot remove a printed line"*, in the commit subject, the
changeset, a test name and this page. **Pass 2 then found it still in a fifth carrier - the header
comment over the test block - after the other four had been scoped**, which is this repo's own trap
arriving inside its remedy: a first pass that sweeps the VOCABULARY leaves the carriers still
carrying the CLAIM. It is DELETED in all five, never reworded. It is false, and not narrowly:

- **Under ANY budget that cuts it is unavailable** (`--max-hit-lines 0` does not cut). `n+1` hits
  from one entry print `n`. There is no
  print cap for which the general property holds, so no amount of partitioning would have made the
  sentence true.
- **Several sweeps share one entry**, so the shortfall is larger than "the same sweep twice".
  `scanText`'s ISO pass and its compact `YYYYMMDD` pass both push `textDate`, and `scanText` runs
  AGAIN on every object `scanEmbeddedObjects` decodes.

Re-measured on the shipped tree and on base `7754a6c` restored by file copy, **identical on both**:

| | base `7754a6c` | here |
|---|---|---|
| 200 ISO dates then 200 compact ones, default budget: ISO lines / compact lines | **20 / 0** | **20 / 0** |
| 19 ISO dates then one compact DOB: is the DOB printed | yes | yes |
| **20** ISO dates then one compact DOB: is the DOB printed | **no** | **no** |

So the compact pass, the only route that sees a bare eight-digit DOB, can print nothing at all while
the ISO pass spends the entry. **`PRE-EXISTING`, unchanged in both directions by this slice**, and now
pinned by a test rather than left to prose.

**Splitting the two date passes is available and was NOT taken here** - the claim was cut instead,
because growing the table would not have made the refused sentence true and this lineage has converged
only by deleting. **Splitting per embedded object is NOT available at all:** the number of objects on
a page is the payload's choice, and a per-class budget times a payload-chosen class count is no
budget.

**What IS closed, and it is the whole of what is claimed: one entry's budget cannot be spent by
another entry's findings.**

**Pass 3 (NOT REFUTED, and the ADR 0016 ceiling) found a SIXTH carrier - the word "monotonicity" as a
comment LABEL inside the block the pass-2 remedy had just swept.** Cut too. Three refuter passes and
five sweeps to get one sentence out of one slice is the measurement worth keeping: in this lineage a
phrase sweep that finds nothing on its first pass has not finished.

## The superset, which is the only question a selection-policy change gets asked

A selection-policy change is exactly the class that refused `#97`, `#104` and `#105`: routing
differently took a name from exit 1 to exit 0 once. So the claim is the strong one and it is
mechanical: **a hit that was among a file's first `n` overall is among its own recognizer's first
`n`**, so at every cap the printed set is a SUPERSET of base's. Nothing base printed goes unprinted,
which is what makes a net leak structurally unavailable here rather than merely unobserved.

Measured over the grid, both scanners run on byte-identical corpora at the same cap:

| | |
|---|---|
| cells (9 shapes x 8 caps) | **72** |
| **superset violations** | **0** |
| cells that refused (exit 1) | 64 |
| hit lines compared, base / here | **2,936 / 3,268** |
| cells printing strictly more than base | **29** |
| cells that withheld lines (a cut line) | 49 |
| cells with a recognizer at its ceiling | 50 |
| **cells where base STARVED a recognizer entirely** | **23** |
| largest cell, in hits | 803 |

Exit code, total, the set of files named, and `withheld == total - printed` are re-checked in every
cell and never differ.

**🛑 WHAT THE GRID'S LAST THREE COUNTERS CANNOT SEE, and the superset does not depend on it.** The
counters label a line by its printed REASON, and several sweeps share a reason, so `cells where base
STARVED a recognizer` cannot see one date pass starving the other. **The superset comparison is over
the raw hit DETAIL lines and uses no labelling at all**, so the 0 and the 332 stand whatever the
labels do. The starvation the counters miss is measured in the table above instead.

**🩺 THE ZERO IS PINNED BESIDE A POSITIVE THE DETECTOR DOES CATCH.** A grid that cannot fail reports
zero violations on anything. Run with the two scanners SWAPPED - base in the tree, the shipped one
passed as the base argument - the same 72 cells report **332 violations**. The detector fires.

**AND THE INSTRUMENT REFUSES BEFORE IT REPORTS:** each scanner handed to it must answer a bad
`--max-hit-lines` with this script's own message and exit 2 (the negative control against a sibling
package's file of the same name, which this shared-scratch environment has produced before); the
hit-free control must exit 0 with no hit lines; and every shape must produce a hit from each
recognizer it claims, so a shape that silently produced nothing cannot read as a clean cell. The
default budget is **derived from a run**, not written into the instrument as a numeral, so the
`default` rows are checked against a ceiling rather than skipped.

## What it costs, stated rather than claimed away

**A FILE'S REPORT CAN NOW BE LONGER.** The bound went from `n` lines per file to `n` per recognizer
per file. Measured at the default budget on the loudest shape in the grid: **20 lines on base, 61
here**, over a file carrying 803 hits. That is the price of the quiet recognizer's line being printed,
and it is bounded by a closed table rather than by the payload.

**⚖️ AND WITHIN ONE ENTRY A FLOOD STILL BURIES A LATER HIT.** A per-recognizer budget makes an
entry's budget its own; it does not make it infinite, and the section above says which parts of that
are closable and which are not. `--max-hit-lines 0` still prints every line, the total still counts
them, and tests pin both measurements.

## Tests

**Eight cases changed or added. Four are red on base `7754a6c`**, measured by restoring the base
scanner **by file copy** and re-running the suite. **Four are green on base by design** and are named
as such here so nobody quotes "eight tests" as "eight regressions caught": they pin what this change
must NOT move (the verdict, the totals, the files named, the withheld arithmetic), the two costs it
does NOT close, and the line shape it does not touch.

**🛑 AND ONLY TWO OF THE FOUR ARE RED ON THE DEFECT.** The other two are red on a NON-VACUITY guard
whose own half is green on base, which a second refuter pass caught this page under-stating as one:
the doubling case requires more than one printed REASON before it compares the two line counts (a
reason, not a recognizer - the guard can only see what the line carries), and at a budget of one on
base there is only one; the strengthened scan-order case requires
more lines printed than the flag's value, and on base there are exactly as many. **Both arithmetic
halves are green on base.** This is stated because "red on base" reads as "caught a regression", and
for two of these four it does not.

**No case writes the budget as a numeral.**

**🛑 AND THE FIRST DRAFT OF THE BOUND CASE PINNED THE SHORTFALL RATHER THAN THE BOUND.** It asserted
that each printed reason appears EXACTLY the cap times. That passes only because the two date passes
share an entry, so a correct split of them would turn it red: it was a guard against fixing the
residual above. **Deleted rather than reworded.** What is asserted in its place is the property a
reader actually depends on and that the output can carry: **doubling every flood prints the same
lines**, so past the ceiling the report stops growing with the hits and a payload cannot choose the
size of the diagnostic.

The one existing case that had assumed "printed == the flag's value" now reads the printed count off
the run: that assumption is precisely what a per-recognizer budget breaks, and writing the flag's
value there would have pinned an arithmetic the report does not do.

## Still open, and NOT touched by this slice

- **`hits` is still unbounded IN MEMORY.** Each entry is bounded (`#109`) and owns its bytes (`#110`);
  the array is not. Unchanged.
- **Within one entry of `RECOGNIZERS`, `report()` is still not monotone**, as above, and the two date
  passes plus every embedded-object sweep share entries. Measured, `PRE-EXISTING`, unchanged.
- **V8's legacy `RegExp` statics retain one subject string** (`#110`). Untouched: this slice adds no
  recognizer and no match.
- **A never-draining reader still makes the gate WAIT** (`#107`), and `test/helpers/run-script.ts`
  still inherits `spawnSync`'s 1 MiB `maxBuffer`. This slice moves the largest report UP, by the
  factor above, so it makes the second one easier to reach rather than harder. Bounded by a closed
  table, disclosed here, and not closed.
- **A CI job that reads only the exit code still cannot see an unread tail** (`#106`).
- The relocation, `position.contextPath` and `attributes[].tag` are parser-side residuals.

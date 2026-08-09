# dicom - `report()` printed one stderr line per hit, uncapped (2026-08-09)

`DICOM-PHI-SCAN-RESIDUALS`, the slice the `DICOM-SCANDICOM-SILENT-HALT` write-up deferred to an item
of its own. Written here rather than in `documentation/agent-notes.md` because that file is **over**
its 250,000-byte budget on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which is not a
line. Relocation is the remedy, never deleting an existing trap to make room and never raising the
ceiling. So the rule lives where a worker touching this code reads it: the JSDoc on
`DEFAULT_HIT_LINES_PER_FILE` and on `report`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: the hit report is capped PER FILE, and the cap cannot move the verdict"`, and this file.

**Provenance.** Every figure below is a measurement taken against base **`b784c38`**, quoted with
that sha and no other. The base column is reproducible with
`git show b784c38:scripts/phi-scan.ts > /tmp/base-phi-scan.ts && node /tmp/base-phi-scan.ts <path>`
run with `cwd=<repo root>`, since the script resolves its allow-list from `process.cwd()`.

## The defect, re-measured before it was built to

`report()` grouped hits by path and wrote one stderr line per hit with no bound. `#102` widened what
reaches it: the text sweep now runs over **every** Part 10 object's bytes, and its recognizers fire
on image noise at a rate that is a property of the payload's **byte histogram**.

**THE FILED FIGURE IS CONFIRMED IN MAGNITUDE AND IS NOT A CONSTANT.** The item carried
**71,122 hits per 8 MiB**. Re-measured on `b784c38` with a fresh generator and a different seed, the
same histogram produced **71,447**. Both are single draws over a random payload, so they are the same
finding and neither is a rate. **Do not quote either as a fact about the scanner.**

| 8 MiB `(7FE0,0010) OW` payload | base `b784c38` exit | hits | stderr lines | stderr bytes |
|---|---|---|---|---|
| uniform `0x41-0x60` (letters, the caret `0x5E` is inside the band) | 1 | 71,447 | 71,449 | 6,037,715 |
| uniform `0x30-0x3F` (4-bit-quantised region) | 1 | 849 | 851 | 80,872 |
| uniform `0x00-0x2F` (dark frame) | 0 | 0 | 0 | 0 |

**THE DARK FRAME IS THE NEGATIVE CONTROL AND IT IS LOAD-BEARING.** A run that emitted nothing on it
is what says the two loud rows are the payload's doing and not the harness's.

**🩺 THE GENERATOR IS AN INSTRUMENT AND WAS VERIFIED BEFORE ANY ZERO WAS BELIEVED.** `#102` caught two
of its own generators wrong (an LCG whose product exceeds 2^53 loses its low bits to float precision
and degenerates into structured bytes) and nearly shipped their zeros as findings. This one is
`Math.imul`-based xorshift32, and it **prints the realised histogram of every payload it writes**
before writing it: for the letters row, 32 distinct byte values spanning `0x41` to `0x60`, per-value
counts between 260,664 and 263,051, and 262,208 occurrences of the caret. A zero from a generator
that has not printed its own histogram is not evidence here.

## What shipped

A **print cap**, per file, defaulting to `DEFAULT_HIT_LINES_PER_FILE`, with `--max-hit-lines <n>` to
change it and `--max-hit-lines 0` to print every line. Same three payloads, same shas:

| payload | base lines | capped-default lines | `--max-hit-lines 0` lines |
|---|---|---|---|
| uniform `0x41-0x60` | 71,449 | 23 | 71,449 |
| uniform `0x30-0x3F` | 851 | 23 | 851 |
| dark frame | 0 | 0 | 0 |

**THE SUPERSET IS PROVED IN THE STRONGEST FORM AVAILABLE: `--max-hit-lines 0` REPRODUCES BASE'S
STDERR BYTE FOR BYTE** on all three payloads (`cmp` identical), and so does the **default** run on
the committed corpus and on any file whose hits fit under the cap. Nothing was removed from the
report. One thing was defaulted off, and it is one flag away.

## Why a cap is not a net leak here, which is the only question that matters

**A CAPPED REPORT THAT DROPS THE LINE NAMING REAL PHI IS A NET LEAK EVEN THOUGH NOTHING BROKE.** That
is the shape `#97` paid a blocker for, arriving in the output layer instead of the dispatch layer.
Three properties stop it, each pinned by a test:

1. **It is a PRINT cap and nothing else.** `main` derives the exit code from `hits.length` and the
   summary reports `hits.length`; neither is capped. A withheld line **cannot** turn exit 1 into
   exit 0 or shrink the number a reader sees. Pinned at `--max-hit-lines 1` over a 200-hit file:
   one line printed, exit **1**, and `OK - no hits` absent.
2. **It is PER FILE, never global.** A global cap is the net-leak shape: one flooding file consumes
   the budget and every later file's hits, including one naming an actual patient, go unprinted with
   the flooding file's path the only one on screen. Pinned by scanning a 200-hit flood **first** and
   a name-bearing file second, in paths mode so the order is the test's: both paths are named and
   the name is printed.
3. **The withholding is stated exactly.** The per-file line carries the exact remainder and the flag
   that prints it; the summary repeats the total withheld. Both are derived, never written down.

**AND THE COST IS STATED RATHER THAN CLAIMED AWAY: A WITHHELD LINE IS WITHHELD.** A hit naming a
person, sitting behind more hits than the cap in the same file, is **not printed by default**. The
run still refuses, the count still includes it, the file is still named, and `--max-hit-lines 0`
prints it. A test asserts exactly that, in both directions, rather than asserting nothing is lost.

**🛑 WHICH LINES SURVIVE IS RECOGNIZER ORDER, NOT FILE ORDER, AND THE OBVIOUS READING IS WRONG.**
`scanText` makes three whole-file passes in sequence (ISO date, compact date, PN shape), so **every**
date hit in a file precedes **every** PN hit in it whatever their byte offsets are, and a binary
target's `scanDicom` hits precede all of them. Measured: with the person name at the start of an
appended block and the DOB two lines later, the capped report prints the **DOB** and not the name.
"The first n hits" is not "the first n in the file".

**Reserving cap slots per recognizer was considered and NOT done, and the reason is the one that
generalises:** it does not help the case that matters. Where the noise and the real hit are the same
shape (200 PN noise hits and one real PN) a per-class budget still starves the real one inside its
own class. It buys complexity and no safety.

## The false-positive spread, which is the reason none of this narrows the detector

**⚖️ THE RATE IS NOT ONE NUMBER: 0 to tens of thousands of hits per 8 MiB on payloads differing only
in which bytes they use.** The spread and its full table belong to
`dicom-scandicom-silent-halt.md`; it is named here only because a cap is exactly the place somebody
would be tempted to answer it by narrowing a recognizer instead. **Do not.** The trade is not
symmetric: a false positive costs a developer one look at a hit line, and the silent halt it replaced
printed `OK - no hits` over a patient name.

**IT IS ZERO ON THE CORPUS THIS GATE ACTUALLY READS, BECAUSE THE PACKAGE COMMITS NO `.dcm` FILES AT
ALL.** `pnpm phi-scan` exits 0 on base and exits 0 here, with byte-identical output. **So a green
local run says nothing about this fix, and the fix was not narrowed on the strength of one.**
**🛑 If imaging fixtures are ever committed here, that spread is the first thing to look at.**

## Residuals, disclosed and NOT closed

- **THE `hits` ARRAY IS STILL UNBOUNDED IN MEMORY.** This slice caps what is **printed**, not what is
  **accumulated**: one `Hit` object, holding the matched value as a string, is retained per hit for
  the life of the run. That is a deliberate boundary, not an oversight. The exit code and the totals
  are computed from that array, so capping it would make the count a claim about what was kept rather
  than about the corpus, which is the failure this whole script is written against. A bound with
  honest totals is a different change.
- **A TEXT EXTENSION IS STILL DISPATCHED BY NAME**, so a `.md` whose raw bytes are a DICOM object is
  never scanned as one. `PRE-EXISTING`, unchanged, its own slice.
- **`scanDicom` STILL REPORTS NOTHING ABOUT BYTES IT NEVER READ.** `PRE-EXISTING`, unchanged, its own
  slice.
- **THE NUMBER OF FILE HEADERS IS UNCAPPED**, on purpose. Capping the set of paths named is the
  net-leak shape in property 2, so the report grows with the number of hit-bearing FILES and not with
  the number of hits. That is the direction to keep if this is ever revisited.
- **THE DEFAULT'S VALUE IS WRITTEN IN EXACTLY ONE PLACE**, the constant. No test and no prose here
  quotes it: the suite pins that a default run prints strictly fewer lines than an uncapped one over
  the same corpus while reporting the same total, which fails **closed** if the default is ever
  raised past the fixture's hit count.

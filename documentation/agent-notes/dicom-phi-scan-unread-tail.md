# `scanDicom` said nothing about the bytes it never read, so `OK - no hits` covered them

_`DICOM-PHI-SCAN-RESIDUALS`, 2026-08-09. Base `21d42f5`. The ADDITION half of that item; the
by-name dispatch (`#105`) was the deletion half, and the two did not land together on purpose.
See `dicom-phi-scan-name-dispatch.md` § "Why this was one slice and not two"._

**Provenance.** The spec claims are read from the SHA-pinned vendored copy at `vendor/nema/part05/`,
**PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every other figure is a
measurement taken on this repo against base **`21d42f5`**, quoted with that sha and no other. The
base column is reproducible with `git show 21d42f5:scripts/phi-scan.ts > /tmp/base-phi-scan.ts &&
node /tmp/base-phi-scan.ts <path>` run with `cwd=<repo root>`, since the script resolves its
allow-list from `process.cwd()`.

## The defect

`scanDicom`'s two walks each `break` at the first header they cannot read, and both `readElement`
helpers answered `ElementHeader | null`. Five distinguishable conditions therefore arrived at the
caller as ONE indistinguishable value, the caller had nothing to say about them, and it said
nothing. A file the tag table abandoned partway through produced the same `[phi-scan] OK - no hits`
as one it read end to end.

**The way in is CONFORMANT, which is what makes it worth a disclosure.** PS3.5 2026c §7.5.2 defines
`0xFFFFFFFF` as one of TWO Sequence delimitations, the encoder's choice, both of which "shall be
supported by decoders"; §7.1 orders tags ascending, so `(0008,1110)` precedes `(0010,0010)` in a
conformant file. Encapsulated `(7FE0,0010) OB` pixel data is the same shape.

**🛑 EXPLICIT VR BIG ENDIAN IS NOT A SECOND CONFORMANT ROUTE AND MUST NOT BE QUOTED AS ONE.** A
draft of this note said it was, and a refuter refused it against the pinned edition: PS3.5 2026c
§A.3's whole body is _"This Transfer Syntax was retired in 2006. For the most recent description of
it, see PS3.5 2016b."_, the UID `1.2.840.10008.1.2.2` appears **nowhere** in the document, and this
package's own generated `src/dictionary/generated/uids.ts` marks it `retired: true`. What is true is
the measurement, and it is worth keeping for a different reason: **`@cosyte/dicom`'s own parser
reads such an object with ZERO warnings and hands back both values**, while this scanner's tag walk
treats every transfer syntax other than `1.2.840.10008.1.2` as little endian and stops on it. **A
lenient parser's silence is not a spec verdict**, and reading it as one is how the word got written.
The conformance leg above rests on §7.5.2 alone and does not need this row.

**A guard that has never been pointed at an input has not cleared that input.** That is the
sentence, and it is the same one `#102` and `#105` were filed under.

## What the new output carries, and what it deliberately does not

Per file, one line on stderr:

```
[phi-scan] PARTIAL: <path>: the DICOM sweep stopped before the end of N object(s),
  leaving M byte(s) it never read: <reasons>
```

**CARRIES:** the file's own repo-relative path (the same locus every hit already carries), two
counts, and tokens from the closed `HALT_REASONS` table.

**DOES NOT CARRY:** no tag, no VR, no value, no byte of the object. The bytes at a halt are
precisely the bytes that did not read as a Data Element header, so a tag or a VR named off them
would be unvouched-for input, and the value bytes are the leak itself.

**🩺 "NO OFFSET" IS NOT ON THAT LIST, AND A DRAFT THAT PUT IT THERE WAS REFUSED.** No offset is
printed, but for a file holding one object `bytes` is `objectLength - haltOffset`, and the object's
length is the file's own committed size, so the halt offset is recoverable from the line. That is
the same locus a hit line already prints outright, beside a value. The honest statement is that the
two counts are structural positions rather than content, not that a position is absent.

**🛑 THE SLOT IS REMOVED, NOT FILTERED.** There is no string parameter for anything to travel
through: `recordUnread` takes a path, a number and a `HaltReason`, and `HaltReason` is a union over
six literals fixed at authoring time. That is the same shape as `entryKind` and `gitModeKind`
already in this script, and the same reason `warnings.ts` has no message parameter. A bound that
held only at the call site would not be a bound.

**Bounded in memory, which `hits` is not.** One `Map` entry per file, holding two numbers and a
`Set` that cannot exceed six members. An attacker-chosen object count moves the counts, not the
footprint. `hits` staying unbounded is this item's other open residual and is untouched here.

## The exit code does not move, and that is a decision with a cost

The banner declares 0 no hits / 1 hits found / 2 invocation error, and **that enumeration is quoted
from the banner rather than restated**: a draft wrote "0 clean" back into a comment four lines above
the `return`, in the same commit that cut the word from the banner, and gave exit 2 a second
definition while it was there. An unread tail is neither non-zero code: nothing was found, and
nothing refused the scan.

Two reasons it is not exit 2. It would fire on a file **§7.5.2 makes legal**, which is what "do not
add a code for a conformant file" means on this side of the package. And it would **mask a real
hit** whenever both were present, downgrading a detection to an invocation error.

**🔴 SO A CI JOB THAT READS ONLY THE EXIT CODE STILL CANNOT SEE THIS.** Open, disclosed, not argued
away. Making it visible to one is a change to this script's contract with every caller.

**And the word `OK` is CUT rather than qualified.** With any partial file the clean line reads
`no hits, over a corpus in which the DICOM sweep stopped early in N file(s), listed on stderr. This
run is not an all-clear.` With none, it is byte-identical to what it always was. It says "on stderr"
and not "above" because the clean line goes to stdout and the `PARTIAL:` lines to stderr, so a
consumer capturing the two separately would read a locative pointing at nothing.

**🛑 THE COVERAGE SENTENCE IS NOT WRITTEN ANYWHERE, INCLUDING AS A SUPPORTING CLAUSE.** `scanTarget`
and `scanEmbeddedObjects` both run `scanText` unconditionally over the whole buffer, so "they were
swept anyway" is tempting; the sweep runs over `buf.toString("utf8")`, a lossy decode of arbitrary
bytes, and the text pass has **no tag table**, so it cannot see a single-component PN or the date at
the head of a `DT`. Neither half supports the sentence. A draft refused it in two places and then
deployed it as a parenthetical propping up "the scan did complete"; a refuter caught that, and the
parenthetical is cut. This paragraph is where the bounds live.

## The measurement

**13 objects x 5 carriers x 3 cap settings = 195 cells**, each one run of
`node <scanner> [cap flags] <path>` on base and on the shipped tree over byte-identical input.
Carriers: `.dcm`, `.md`, `.bin`, base64 inside a `.md` page, base64 inside a `.ts` source. Cap
settings: default, `--max-hit-lines 0`, `--max-hit-lines 1`.

|                                                                                         |               |
| --------------------------------------------------------------------------------------- | ------------- |
| exit code identical                                                                     | **195 / 195** |
| hit detail lines identical as a multiset                                                | **195 / 195** |
| output identical                                                                        | **60**        |
| output strictly larger (a `PARTIAL` line added)                                         | **105**       |
| output differs ONLY by the withdrawn `OK - no hits`, with a `PARTIAL` line in its place | **30**        |
| violations                                                                              | **0**         |
| cells printing a `PARTIAL` line                                                         | **135**       |

**The 30 are the ONE line this change removes, and the checker tests for exactly that** rather than
reading it off the table: a cell counts as a claim-cut only when the missing set is exactly
`{"[phi-scan] OK - no hits"}` with multiplicity 1, a `PARTIAL` line is present, and the replacement
line is present. Anything else in the missing set is a violation.

**The 60 identical cells are the detector-zero pin.** They are the four objects with no unread tail,
across all fifteen carrier/cap combinations, and **they are silent for TWO different reasons that
must not be collapsed**: three are complete walks that reach the last byte (an allow-listed object,
a name-bearing one, a recent-`DA` one), and the fourth is not a DICOM stream at all, so
`fileMetaStart` answers null and the DICOM route is **never entered**. A draft called all four "the
walk reads to the end", which is false for the fourth. The detector is silent exactly there and loud
on the other nine, in the same runs, so a zero is a measurement rather than a wiring failure.

Reasons observed, one object each: `an undefined-length value (0xFFFFFFFF)` (SQ, encapsulated pixel
data), `a value length that runs past the end of the object` (over-declare, and Explicit VR BE),
`a header whose VR field is not two uppercase letters`, `a header the remaining bytes cannot hold`
(eight bytes of a twelve-byte long-form header), `a tail too short to hold an element header`.

**`noAdvance` is unreachable and stays in the table as the defensive arm.** `nextOffset` is
`valueOffset + valueLength` and `valueOffset` is at least eight past the cursor, so the check that
predates this change cannot fire. It is named here so the next reader does not hunt for a fixture.

**The corpus is unmoved.** `node scripts/phi-scan.ts` with no arguments produces byte-identical
stdout and stderr before and after, and still exits 0. Measured with a probe on base: the all-mode
run reaches `scanDicom` **17 times** across seven `docs-content/` pages, and **all 17 read to the
last byte** (`end == objlen` on every one), so there is no `PARTIAL` line to print. **That zero is
pinned by the 135 cells that do print one**, not asserted.

**This is not a false-positive rate and there is none to quote here.** The rate is a property of a
payload's byte histogram, and this package commits no `.dcm` files at all. See
`dicom-scandicom-silent-halt.md`.

## The generator, verified before any zero it produced was believed

Every object was put through **`@cosyte/dicom`'s own `parseDicom`** and **classified by what the
parse produced, never by its label**: the well-formed ones had to read the planted value back, and
the malformed ones had to FATAL. That caught a real mislabel: `08-big-endian-dataset` was written as
`parses: false`, and the parser accepted it with **zero warnings** and both values readable. It is
**well formed under a RETIRED transfer syntax**, which is what the row above rests on, and the label
was corrected from the measurement rather than from the intent behind the fixture. Separately, every
planted value is asserted present in the RAW BYTES, so nothing is claimed about a value the
assembler never wrote.

**The generator is committed as `scripts/measure-phi-scan-unread.ts`**, so the table is
re-derivable rather than a figure only its author could produce. `pnpm measure:phi-scan-unread
[<base scanner path>]` prints the object verification, the row summary and the cell counts; with no
argument it verifies the generator and prints the reasons without a base comparison.

## Interaction with `#104`'s cap and `#105`'s non-monotone finding: none, and it is structural

`#104` capped **hit** lines per file, and `#105` found `report()` is not monotone in `hits` at that
cap, because `scanDicom`'s hits append before `scanText`'s. Neither can reach this line. It is not a
hit, it is written by a different function, and it is in no budget. Pinned at `--max-hit-lines 1`
over a file whose hits run to the hundreds: one hit line, the suppression line, and the `PARTIAL`
line all present; and with a second file behind it, both files' `PARTIAL` lines survive.

**It cannot flood, so it needs no cap of its own.** The output is bounded by the number of FILES.
A page carrying ten thousand halting objects prints ONE line with the count on it.

## What is still open

- **The exit code, as above.** A CI job reading only exit codes still sees a green.
- **🔴 A FILE-META HALT IS REPORTED ONLY IF THE DATASET LOOP ALSO STOPS AT THAT OFFSET, AND UNDER
  IMPLICIT VR LE IT MAY NOT.** Only the dataset loop records, so the file-meta loop's own halt is
  covered only when the second loop reaches the same verdict at the same offset. Under Explicit VR
  the two agree, because they call the same reader; `readElementImplicit` is a different predicate
  set, so the same bytes can report a DIFFERENT reason, or read as a header and let the walk
  continue past the offset the File Meta group gave up at, reporting nothing. Measured on two
  objects differing only in the transfer-syntax UID. Stated, not closed: the remedy is to record in
  the file-meta loop too, and that is a second disclosure with its own shape.
- **`hits` is still unbounded IN MEMORY.** Untouched. This slice adds no hits at all, so it does not
  move that surface in either direction.
- **A hit line still echoes the violating `value` unbounded.** Untouched.
- **The recognizers are unchanged.** Widening the walk's REPORTING and widening the recognizer are
  different changes. Nothing here teaches the scanner an MRN, an accession number, an institution
  name, a phone number, an email address, an SSN or a vendor UID root. **`PARTIAL` on a file is not
  a finding, and no `PARTIAL` on a file is not a clearance of it either.**
- **The walk itself is unchanged.** This slice says what the walk did not read; it does not read
  more. Teaching `scanDicom` to descend an undefined-length Sequence is a separate change with its
  own false-positive surface, and it is deliberately not made here.

## For the next worker

- **Rebuild the matrix rather than trusting the table**, and it is one command:
  `git show 21d42f5:scripts/phi-scan.ts > /tmp/base.ts && pnpm measure:phi-scan-unread /tmp/base.ts`.
  13 objects x 5 carriers x 3 cap settings, comparing exit code, hit-line multiset and output-line
  multiset per cell.
- **Reverting `scripts/phi-scan.ts` alone turns 9 tests red**, measured on `21d42f5` over the suite
  as it stands after this slice. **No count of the new cases is written beside it** - a draft said
  "eleven" where the block holds ten, and a numeral that has been wrong once in an index is cut
  rather than corrected. The two cases green on base by design are the non-vacuity control and the
  byte-identical clean line.
- **The clean line is the assertion that moves.** One pre-existing case (`#102`'s
  `"a preamble-FUL object whose payload is allow-listed is still clean"`) asserted `OK - no hits`
  over an object carrying an undefined-length `SQ`. That assertion WAS the other half of this
  defect, and it is corrected rather than deleted: same exit code, no `OK`.

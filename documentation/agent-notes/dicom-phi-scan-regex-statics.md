# The scan route hands no target bytes to a `RegExp`

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited:
> derived headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. Derive it, never restate
> it: `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> `.claude/hooks/doc-budget.mjs`. `documentation/agent-notes.md` is **257,209 B, over its 250,000
> ceiling** on `main`, so this record is here instead. **No trap deleted, no ceiling raised.**
> What points at it is `scripts/phi-scan.ts` and `scripts/measure-phi-scan-regex-statics.ts`, which
> are unbudgeted and cite this slug. **No always-read file does.**

`DICOM-RESIDUALS`, `conformance-refuter` gate. Last verified 2026-08-09.

Closes the retention path `#110` disclosed and **left unmeasured**: *"V8's legacy `RegExp` statics
retain one subject string, bounded by the largest single file rather than the corpus."*

## Why this slice, out of the six that were open

The five others were each ruled out on the record rather than on preference:

- the **relocation** and **`position.contextPath`** are the `#81` mis-structure, where an
  over-declaring item and an under-declaring sequence are byte-identical. Both sanctioned cut-backs
  are refused standing;
- **`attributes[].tag`** is table-bound and `contextPath` is inert, so neither carries a payload;
- **`hits` as an array** has no remedy that is not a cap, and a cap makes the totals a claim about
  what was **kept** rather than what was **found**;
- **a flood burying a later hit within one entry** is a selection-policy change, the class that
  refused `#97`, `#104` and `#105`. Its only available remedy, the date-pass split, `#111` weighed
  and declined as growing the code to fit the claim. Re-taking it a slice later would be re-opening
  a decision, not closing a residual.

This one is the opposite shape, and for the same reason `#110` gave for taking its own slice first:
**the printed output is byte-identical to base**, so the net-leak class is structurally absent, and
the thing being closed is measurable. It was also the only open item nobody had put a number on.

## It is a PHI question, not only a memory one

V8 keeps the last successful match on the `RegExp` **constructor**: `RegExp.input` (`$_`) is the
whole subject string, `RegExp.lastMatch` (`$&`) is the matched text **verbatim**, and
`leftContext`, `rightContext`, `lastParen` and `$1` to `$9` sit beside them. These are ordinary
readable properties of a global object.

So the shape is worse than the retention framing `#110` used. `#109` bounded the hit line's excerpt
to 194 characters and `#110` made that excerpt own its bytes, and all the while
**`RegExp.lastMatch` held the same patient name UNEXCERPTED**, readable from anywhere in the
process, with the whole page behind it in `RegExp.input`.

## The fix, and why it is not a scrub

**The scan route hands no target bytes to a `RegExp`.** Seven sites moved to forward scanners and
character predicates: the three `scanText` recognizers, the tag route's pad trim, the
transfer-syntax NUL trim, `checkDate`'s eight-digit test, and the two-letter VR test in
`readElementExplicit` and `fileMetaStart`. The gate's own configuration is a different route and is
untouched; the section below measures what it leaves.

**Overwriting the statics after the scan was available and is not what was done.** A scrub is a
bound that holds only from where the cleanup is called, which this lineage has refused twice
(`#109`, `#111`): remove the slot, do not filter the value. There is no cleanup here because there
is nothing left to clean up.

`base64Runs` had already replaced a regex with a forward scanner **in this same file**, for an
unrelated reason (an 8 MiB run overflowed V8's backtrack stack). Same shape, same standard of
evidence: each function is a different REPRESENTATION of the pattern it replaces, never a wider or
narrower predicate.

**`isSpaceCode` writes out the whole of `\s`** rather than the subset a latin1 decode can reach.
Keying on what today's callers happen to decode would be a bound that holds only from the call
site, and it would go wrong silently the first time a caller decoded something else.

## Figures, all re-measured on the shipped artifact

Base `7fbc8e9` restored **by file copy**, never `git checkout`. Instrument shipped as
`scripts/measure-phi-scan-regex-statics.ts`.

| shape | base | here |
| --- | --- | --- |
| hit-free control | clean | clean |
| text PN, one small page | `input`, `lastMatch` | clean |
| text PN, 4 MiB page | `input` (4,195,860), `lastMatch` | clean |
| text ISO date, 4 MiB page | `input` (4,195,852), `lastMatch` | clean |
| text compact date, 4 MiB page | `input` (4,195,850), `lastMatch` | clean |
| tag PN + tag DA, Part 10 object | `input`, `lastMatch`, `rightContext` | clean |
| loud 4 MiB page, then a clean one | `input` (4,195,860), `lastMatch` | clean |

**6 of 7 shapes carried a token on base, 0 here.** The `rightContext` column on the Part 10 shape is
a carrier the first draft of the detector did not look for, which is why it looks for all ten.

**🛑 THE ZERO IS PINNED BESIDE A POSITIVE CONTROL.** The same observer over a child that does
nothing but match the same token reports `input, lastMatch`, and the instrument **throws instead of
reporting** if it does not. A detector that cannot fire is not a detector. Three further refusals
run before any number is printed: each scanner must behave like this package's phi-scan (the
wrong-package negative control), the hit-free control must scan clean, and every shape must produce
the hit lines it claims.

### Equivalence, which is the other half

| | |
| --- | --- |
| cells (real corpus + adversarial + 32 fuzz corpora) | **34** |
| **cells differing from base in any byte** | **0** |
| cells that refused (exit 1) | 33 |
| hit lines compared | **9,283** |
| **MUTATION CONTROL, same cells, one character changed** | **17 cells differ** |

Whole output compared: stdout, stderr and exit code, byte for byte, no labelling and no class
counting, so a single differing byte is a violation.

## 🛑 The grid caught a defect in the remedy, and the defect is now the control

The first draft of `pnRuns` floored the trailing backtrack at `second + 1`, which lets the second
`[A-Za-z\-']+` hold nothing. On `ABC^D-` it matched `ABC^D`, where the pattern matches nothing at
all: **a hit the gate would have printed that the pattern never found**, in a scanner written to
change no hit. The adversarial cell reported it on the first run.

That one character is now the grid's mutation control and a named test case, so the zero above is a
clearance rather than a gap. **A generator is an instrument: it is verified before a zero it prints
is believed, and it ships so the figures can be re-run.**

## What the tests pin, and what they do not

- `test/integration/phi-scan-regex-statics.test.ts`: no carrier after a scan, **beside a positive
  control in the same file.** It is a subprocess because it has to be: the statics are overwritten
  by the next successful match anywhere in the realm, so an in-process assertion reads clean whether
  or not the scanner left anything behind.
- `test/scripts/phi-scan-matchers.test.ts`: the **patterns themselves are the oracle**, held in the
  test and run over the same bytes, across adversarial shapes and an 800-line seeded fuzz. The pad
  trim is pinned over **all 256 values a latin1 decode can end with**, in one object.

**🛑 5 of the 6 new test cases are GREEN ON BASE, BY DESIGN, AND THAT IS THE POINT.** They assert
base's behaviour is preserved, so a red one would mean the slice moved a hit. The figure that says
they are not vacuous is the mutation one: **3 of 6 go red on a one-character mutant** of `pnRuns`,
and the pad case goes red on dropping `0xa0` from `isSpaceCode`. Only the retention pin is red on
base, because only it asserts a property base did not have.

## 🔴 Not closed, and named rather than claimed away

- **The gate's own CONFIGURATION is still a `RegExp` subject**, and the residual is visible in the
  numbers rather than described: every clean column above reads `input 3772`, which is the exact
  length in code units of `scripts/phi-allow-list.txt`. The remaining subjects are `process.argv`,
  the allow-list, `phi-scan-overrides.md` and `git diff --cached --raw` output. **Neither config
  file is inside `SCAN_ROOTS`** (`test`, `README.md`, `docs-content`), so the walk and `--staged`
  never reach either as a target. Unchanged here.
- `hits` is still unbounded as an array; the relocation, `contextPath` and `attributes[].tag` stand;
  a flood within one recognizer entry still buries a later hit; the never-draining-reader wait and
  `run-script.ts`'s 1 MiB `maxBuffer` are untouched by this slice in either direction.
- This slice says nothing about heap retention. `#110` closed the excerpt's copy; **the subject
  string is no longer held by a static, but nothing here measures the heap**, and inheriting
  `#110`'s figures for a different mechanism would be exactly the trap `#109` pass 2 was refused for.

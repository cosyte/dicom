# `scanTarget` dispatched by NAME, so a `.md` whose bytes were a DICOM object was never scanned as one

_`DICOM-PHI-SCAN-RESIDUALS`, 2026-08-09. Base `08ed3ee`. The `PRE-EXISTING` half of that item; the
sibling residual (`scanDicom` reports nothing about bytes it never read) is **not** closed here and is
**not** part of this slice - see "Why this was one slice and not two" below._

**Provenance.** The spec claims are read from the SHA-pinned vendored copy at `vendor/nema/part05/`,
**PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every other figure is a
measurement taken on this repo against base **`08ed3ee`**, quoted with that sha and no other. The
base column is reproducible with `git show 08ed3ee:scripts/phi-scan.ts > /tmp/base-phi-scan.ts &&
node /tmp/base-phi-scan.ts <path>` run with `cwd=<repo root>`, since the script resolves its
allow-list from `process.cwd()`.

## The defect

`scanTarget` branched on the file's **extension** before it read a byte:

```
const TEXT_EXTENSIONS = new Set([".json", ".txt", ".md", ".csv"]);
...
if (TEXT_EXTENSIONS.has(ext)) { scanText(...); scanEmbeddedObjects(...); return; }
```

so `scanDicom` never ran on one of those four whatever its bytes were. The halt (`#102`), the
preamble (`DICOM-SCANTARGET-PREAMBLELESS`) and now the **filename** are the same defect three times:
each is a thing that does not decide what the bytes are, used to decide which sweep reads them.

**The real path is not exotic.** A de-identification report, a bug repro, or a fixture saved under
the wrong extension carries patient identifiers past the gate entirely.

**What the extension cost, concretely:** the tag table is the only route that can see a
**single-component** `(0010,0010)`. That shape has no caret, so the text sweep's PN pass has nothing
to match, and losing `scanDicom` loses the name completely rather than losing a second opinion.

## The measurement

11 objects x 7 extensions = **77 cells**, one `node scripts/phi-scan.ts <path>` run each, recording
the exit code and which planted value the run printed. Base `08ed3ee` against the shipped tree.

Legend: `B` = a single-component name printed, `C` = a caret-bearing name printed, `D` = a recent
`DA` printed, `t` = the hit named `(0010,0010)`.

| object                                                        | `.md` `.txt` `.json` `.csv` base | ... shipped | `.dcm` `.bin` `.dat` (both) |
| ------------------------------------------------------------- | -------------------------------- | ----------- | --------------------------- |
| preamble-FUL, single-component PN                             | `0----`                          | **`1B--t`** | `1B--t`                     |
| preamble-LESS, single-component PN                            | `0----`                          | **`1B--t`** | `1B--t`                     |
| preamble-FUL, recent `DA`                                     | `1--D-`                          | `1--D-`     | `1--D-`                     |
| preamble-FUL, caret PN behind an undefined-length `SQ`        | `1-C--`                          | `1-C--`     | `1-C--`                     |
| preamble-FUL, Explicit VR BE dataset                          | `1-C--`                          | `1-C--`     | `1-C--`                     |
| preamble-FUL, single-component PN then a halt then a caret PN | `1-C--`                          | **`1BC--`** | `1BC--`                     |
| preamble-FUL, allow-listed PN + allow-listed `DA`             | `0----`                          | `0----`     | `0----`                     |
| not a DICOM stream, caret PN in prose                         | `1-C--`                          | `1-C--`     | `1-C--`                     |
| not a DICOM stream, allow-listed PN                           | `0----`                          | `0----`     | `0----`                     |
| a base64 object inside a markdown page                        | `1-C--`                          | `1-C--`     | `1-C--`                     |
| preamble-LESS, caret PN behind an undefined-length `SQ`       | `1-C--`                          | `1-C--`     | `1-C--`                     |

**The superset, checked mechanically over all 77 cells rather than read off the table: 65 identical,
12 strictly more reported, 0 violations.** No cell went exit 1 -> 0, no cell went to exit 2, and no
cell lost a mark it had on base. The 12 are 8 cells that went **0 -> 1** (the leak) and 4 that gained
a **second** name that the text sweep alone could not see.

**🛑 THE `DA` ROW IS NOT A LEAK AND MUST NOT BE QUOTED AS ONE.** A `DA` value is eight digits, which
the text sweep's compact-date pass matches as a standalone token, so it exited 1 under every
extension on base too. Only the PN rows leaked. A first draft of this note said "the tag route's
findings were lost"; the measurement says which ones.

**The corpus is unmoved.** `node scripts/phi-scan.ts` with no arguments produces **byte-identical**
stdout and stderr before and after, and still exits 0. It has to: `fileMetaStart` answers non-null
only for a 132-byte preamble plus `DICM`, or for a first `uint16le` of `0x0002` with two ASCII
uppercase letters at offset 4 - a leading NUL byte, which no file in this corpus has. **This is not a
false-positive rate and there is none to quote here**; the rate is a property of a payload's byte
histogram, and this package commits no `.dcm` files at all. See `dicom-scandicom-silent-halt.md`.

## Why this cannot be `#97`'s net leak, and why the argument is structural

**`#97` paid a blocker for the rule that an `if/else` dispatch can make a fix a NET LEAK**, because
`scanDicom` gives up quietly at an undefined-length `SQ` (PS3.5 2026c §7.5.2 defines `0xFFFFFFFF` as
one of two Sequence delimitations, both of which decoders shall support; §7.1 orders tags ascending,
so `(0008,1110)` precedes `(0010,0010)` in a conformant file). Routing a file to `scanDicom`
**instead of** the text sweep once took a name behind an `SQ` from exit 1 to exit 0.

**The remedy here is a DELETION.** The removed branch's two calls were `scanText` and
`scanEmbeddedObjects`. The branch that replaces it makes the **same two calls unconditionally** and
adds one conditional `scanDicom`. `hits` is only ever appended to, so the **hit set, the totals and
the exit code** are a strict superset on every input. The by-name branch's own justification - that a
`.md` whose first bytes look like group `0002` must not lose `scanEmbeddedObjects` - was an argument
against an exclusive **swap**, and there is no swap.

Rows 4, 10 and 11 of the table are that claim under measurement rather than under assertion: each is
a file whose only detectable name is behind a halt, and each is still exit 1.

## Why this was one slice and not two

The item names two `PRE-EXISTING` residuals. They were treated as **two slices**, and only the first
is closed:

- **Dispatch** (closed here) is a **deletion** whose superset is structural. It adds no output, no
  new diagnostic field, and no new false-positive surface beyond `scanDicom` running on bytes that
  are a DICOM object.
- **`scanDicom` reporting nothing about bytes it never read** is an **addition**: a new diagnostic
  surface, and `documentation/repos/dicom/diagnostic-phi-traps.md` opens on the rule that a
  diagnostic about a PHI leak is itself a PHI surface. It has to decide what a halt disclosure says,
  whether it moves the exit code, and what it costs on a corpus of conformant files carrying
  undefined-length Sequences. Mixing an addition into a deletion-only remedy would forfeit the one
  property that makes this one safe to reason about.

They also fail differently. This one is about **which sweep reads the bytes**; the sibling is about
**what the sweep says when it stops**. `#102` already mitigated the sibling by putting the text sweep
behind every Part 10 object, so the two do not have to land together to close a leak.

## What is still open

- **`scanDicom` STILL REPORTS NOTHING ABOUT THE BYTES IT NEVER READ.** Unchanged, and the reason it
  is unchanged is above. A value past the halt that is neither `FAMILY^GIVEN` nor an eight-digit date
  run is still invisible - an MRN and an institution name among them.
  **▶ CLOSED SINCE, as its own slice, in `dicom-phi-scan-unread-tail.md`. The REPORTING is what
  closed: the walk is unchanged, so the sentence above about what is invisible still stands.**
- **The `hits` array is still unbounded IN MEMORY** (`#104`'s residual). Untouched. This slice can
  only add hits, so it moves that surface in the wrong direction on a corpus that has any; it is
  disclosed rather than claimed away, and it is zero on this corpus.
- **The recognizers are unchanged.** Widening the walk and widening the recognizer are two different
  changes. Nothing here teaches the scanner an MRN, an accession number, an institution name, a phone
  number, an email address, an SSN or a vendor UID root.

## For the next worker

- **The probe is 11 objects x 7 extensions and it is worth rebuilding rather than trusting this
  table.** Every object was verified through `@cosyte/dicom`'s **own parser** before any zero it
  produced was believed - `parseDicom` read each planted value back - because a generator is an
  instrument and `#102` caught two of its own wrong.
- **Reverting `scripts/phi-scan.ts` alone turns 11 tests red.**
- **Do not use a text extension to disable the DICOM route in a test.** One pre-existing control did
  (`"the payload is invisible to the text sweep"` wrote the bytes as `.txt` and expected exit 0), and
  that method **is** the defect. It now disables the route by CONTENT - one byte in front of the
  stream, so `fileMetaStart` answers `null` and every other byte, including the name, stays put - and
  it pins the unshifted bytes under the same name as a hit, so the control cannot pass by asserting
  the leak.

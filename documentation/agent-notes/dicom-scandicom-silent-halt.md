# dicom - `scanDicom` halted SILENTLY behind a preamble, and no text sweep followed (2026-08-08)

`DICOM-SCANDICOM-SILENT-HALT`, filed `PRE-EXISTING` and surfaced by `#97`'s refuter pass. Written
here rather than in `documentation/agent-notes.md` because that file is **over** its 250,000-byte
budget on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which is not a
line. Relocation is the remedy, never deleting an existing trap to make room and never raising the
ceiling. So the rule lives where a worker touching this code actually reads it: the JSDoc on
`scanTarget` and on `base64Runs`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: a preamble-FUL object's silent halt"`, and this file.

**Provenance.** The spec claims are read from the SHA-pinned vendored copy at `vendor/nema/part05/`,
**PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every other figure is a
measurement taken on this repo against base **`21e25a0`**, quoted with that sha and no other. The
base column is reproducible with `git show 21e25a0:scripts/phi-scan.ts` run with
`cwd=<repo root>`, since the script resolves its allow-list from `process.cwd()`.

## The defect

`scanTarget` ran the text sweep under `if (!isDicom(buf))`. That made the sweep an `else` for a
preamble-**ful** Part 10 object, and `scanDicom` **gives up quietly**: its walk `break`s at the first
header it cannot read, and `readElementExplicit` answers `null` for an undefined-length value
(`0xFFFFFFFF`).

**THE HALT IS A PROPERTY OF THE DATASET, AND THE PREAMBLE IS NOT PART OF THE DATASET.** That is the
whole defect in one line. 132 bytes of preamble and `DICM` change nothing about whether the walk can
read the elements behind them, so `isDicom` was deciding who is owed a text sweep on evidence that
has no bearing on the question. The identical dataset was caught **without** a preamble and missed
**with** one, in silence, over a name-bearing `(0010,0010)`.

`#97` closed the preamble-**less** half by running both routes. This is the mirror case, and the
lesson generalises past both: **`scanDicom` returning without a hit is not evidence of anything.**
It has no way to say how far it got, so nothing may be conditioned on it having got anywhere.

Quote **PS3.5 §7.5.2 whole**: it defines TWO Sequence delimitations, the encoder chooses, and "Both
ways of encoding shall be supported by decoders." A file carrying an undefined-length `SQ` is
conformant, not malformed; calling it "the normative encoding" overstates it and is not needed here.
§7.1 then orders Data Elements by ascending tag, so a conformant object puts `(0008,1110) SQ`
**before** `(0010,0010)`. A non-LE transfer syntax stops the walk the same way, at the first dataset
element.

## Measured, base `21e25a0`

One object per row. The name is this suite's own synthetic `RIVERA^JUANITA`; `ANON^PATIENT` and
`DATE:20240115` are on the allow-list and are the clean controls.

| target | base | shipped |
|---|---|---|
| preamble-FUL, `(0008,1110)` undefined-length `SQ` then `(0010,0010) PN` | exit **0**, `OK - no hits` | exit 1 |
| preamble-FUL, the name at `(0008,1030) LO` (no tag table covers it) | exit **0** | exit 1 |
| preamble-FUL, Explicit VR **Big Endian** dataset, `(0010,0010) PN` | exit **0** | exit 1 |
| the first row's object **base64'd into a `.md`** | exit **0** | exit 1 |
| **CONTROL** the first row's object **without** the preamble | exit 1 | exit 1 |
| **CONTROL** preamble-FUL `(0010,0010) PN`, no halt in front of it | exit 1 | exit 1 |
| **CONTROL** the same `.md` shape, no halt | exit 1 | exit 1 |
| **CLEAN** preamble-FUL, allow-listed PN + allow-listed DA | exit 0 | exit 0 |
| **CLEAN** preamble-FUL, allow-listed name at `(0008,1030) LO` | exit 0 | exit 0 |
| **UNCHANGED** preamble-less, plain `(0010,0010) PN` | exit 1 | exit 1 |
| **UNCHANGED** a `.dcm` that is not a DICOM stream at all | exit 1 | exit 1 |

**THE LAST FIVE ROWS ARE WHAT MAKE THE FIRST FOUR EVIDENCE.** Three are positives the detector
already caught on base, so a green anywhere here would be a **gap** rather than a clearance; two are
clean results pinned **beside** them.

**A NEGATIVE CONTROL AGAINST THE WRONG PACKAGE.** The first row's object was handed to
`hl7/scripts/phi-scan.ts` and `x12/scripts/phi-scan.ts`, each with its own repo as `cwd`: both exit
**0**, and neither script is byte-identical to this one. So the exit codes above are `dicom`'s.

**A `N OF M` FIGURE HAS A MOVING BASE.** Quoted with its sha and no other: with the tests as they
stand at the end of this slice, `test/scripts/phi-scan.test.ts` runs **5 failed, 76 passed, of 81**
against base `21e25a0`'s `scripts/phi-scan.ts`. The passing majority is the point: a control that
only passes after the fix is not a control.

## The remedy, and the superset property to preserve

The binary branch asks two independent questions and runs **both** answers, unconditionally:

| input | base `21e25a0` | shipped |
|---|---|---|
| `isDicom` true | `scanDicom` only | `scanDicom` **and** `scanText`. Pure addition. |
| preamble-less | `scanDicom` and `scanText` | unchanged |
| neither | `scanText` only | unchanged |

`scanEmbeddedObjects` gained the same second route on the object it decodes, for the same reason and
one level down. **The enclosing page's own text sweep does not stand in for it**: the object arrives
base64-encoded, so the name is not in the page's bytes in any form the PN regex could match. That is
pinned by a control which strips the base64 run from the same page and requires exit 0.

**WIDEN BY UNION, NEVER BY REPLACEMENT.** `#97` paid a blocker for this and it has not softened: an
`if`/`else` dispatch can make a fix a net leak. Nothing here may become an `else`, and no cheaper
predicate may be reached for to decide who is owed a text sweep, because the halt is invisible to any
test on the first 132 bytes.

## The cost, taken deliberately and MEASURED rather than asserted

The text sweep now runs over binary values, so the compact-date pass can read eight ASCII digits
bounded by non-digits as `YYYYMMDD`. This is the `DICOM-DEIDENT-OVER-REDACTION` false-positive shape
and it was accepted before coding: **a silent PHI-scan halt over a name-bearing `(0010,0010)` is a
false green, and a false positive is not.** The trade is not symmetric. A false positive costs a
developer one look at a hit line; the halt it replaces printed `OK - no hits` over a patient name.

Rates, per 8 MiB of `(7FE0,0010) OW` value, base `21e25a0` vs shipped. **Base is 0 on every row,
because base swept none of it.**

| payload | shipped hits | note |
|---|---|---|
| CSPRNG bytes | 12 | ~1.5 per MiB. The worst REALISTIC case: an encapsulated JPEG frame is high-entropy. |
| 8-bit ramp | 0 | A digit run in a ramp is 10 long, and `\b\d{8}\b` needs EXACTLY 8. |
| 16-bit LE ramp | 0 | Same, and the high byte breaks every run at length 1. |
| realistic metadata + CSPRNG | 10 | With UIDs, a `TM`, an institution name and an MRN in front of it. |
| ASCII digits and dots only | 1,012 | ~126 per MiB. **Adversarial, and not a frame any modality writes.** |

**THE RATE IS A PROPERTY OF THE CORPUS, NOT OF THIS SCRIPT, so do not quote one of these as "the"
false-positive rate.** On the corpus this gate actually reads it is **zero**: `pnpm phi-scan` exits 0
on `main` and exits 0 here, because the package commits **no `.dcm` files at all** and a `.ts` source
was already getting the text sweep. Every figure above is a statement about a hypothetical corpus of
committed imaging objects.

**A ZERO IN THE TABLE ABOVE IS A FIXTURE PROPERTY, NOT A CLEARANCE.** The two ramp rows read 0
because `\b(\d{4})(\d{2})(\d{2})\b` needs a run of **exactly** eight digits, and a ramp produces runs
of ten. Do not restate them as "pixel data does not false-positive".

**🛑 AND A FIRST DRAFT OF THIS TABLE READ 0 ON EVERY ROW, WHICH WAS A FIXTURE ARTIFACT REPORTED AS A
FINDING** - this repo's recurring failure mode. The generator was `x = (x * 1103515245 + 12345) >>> 0`,
and that product exceeds 2^53, so the low bits are lost to float precision and the sequence degenerates
into structured bytes rather than noise. Any pseudo-random fixture here uses `Math.imul`-based
xorshift32 or `crypto.randomFillSync`, and the test that needs a big deterministic run says so in a
comment for exactly this reason.

**COST: LINEAR, ~40 ms per MiB**, best of three at 1/2/4/8/16 MiB on both a CSPRNG and an
adversarial digits-only payload, with the ~130 ms process-start floor subtracted. Base was ~0 on
every size because it did no sweep. There is no superlinear term: the sweep is three linear regex
passes plus one linear run scan.

## What this ALSO closed, `PRE-EXISTING`, because this item put weight on it

**A MULTI-MEGABYTE BASE64 RUN REFUSED THE SCAN (exit 2).** The run matcher was
`new RegExp("[A-Za-z0-9+/]{16,}={0,2}", "g")`, and V8 keeps per-character backtrack state for a
greedy quantifier, so ONE long run threw `RangeError: Maximum call stack size exceeded`. `run()`
turns that into exit 2. Measured on base `21e25a0` over a plain `.md` carrying one run: 0.5, 1, 2 and
4 MiB exit 0; 8 MiB exits **2**. It was reachable on the doc corpus and on any preamble-less object,
which is why it is `PRE-EXISTING` rather than introduced here; **this item made it reachable on
preamble-ful objects too** (base 0, first draft 2), and a Part 10 object is routinely megabytes, so it
is closed rather than disclosed.

`base64Runs()` is a forward scan with no backtracking and no per-character stack. It is a different
**representation** of the same predicate, not a wider or narrower one, and the equivalence is
measured, not asserted: over the 181 tracked files under `docs-content/`, `README.md`, `test/`,
`src/` and `scripts/` it yields **13,307 runs, 0 mismatches** against the pattern it replaced, plus
14 edge and adversarial strings (including a 4 MiB single run, below the threshold where the pattern
throws) with 0 mismatches.

**🛑 THE THRESHOLD IS A PROPERTY OF V8'S STACK, NOT OF THIS SCRIPT.** The test pins the PROPERTY (a
6 MiB run is swept, and the object after it is still reported) and not the number. On a build with a
larger stack the old matcher would have passed it too, and that is fine: the assertion carrying the
weight is the HIT, which a refusal loses.

## Residuals, disclosed and NOT closed

- **A TEXT EXTENSION IS STILL DISPATCHED BY NAME, SO A `.md`/`.json`/`.txt`/`.csv` FILE WHOSE RAW
  BYTES ARE A DICOM OBJECT IS NEVER SCANNED AS ONE.** `PRE-EXISTING` and **unchanged** by this slice.
  It is a dispatch-by-name defect, not a preamble one, and it was true on base for both shapes. Left
  deliberately: the text route is what runs `scanEmbeddedObjects`, and a doc page sent to the DICOM
  route on the strength of its first eight bytes would lose the base64 decode that is the only thing
  that reads the doc corpus at all. Closing it means running **both** routes on a text extension,
  which is its own change with its own false-positive surface.
- **`scanDicom` STILL REPORTS NOTHING ABOUT THE BYTES IT NEVER READ.** The text sweep behind it is a
  net, not a fix for the walk: a value that is neither `FAMILY^GIVEN` nor an eight-digit date run is
  still invisible past the halt, an MRN and an institution name among them. Teaching the walk to
  descend a Sequence, or to report where it stopped, is a different change and is not made here.
- **THE EMBEDDED DECODE IS NOT RE-ENTERED ON THE DECODED BYTES.** One level is what a doc fixture is;
  recursing would spend unbounded time on an object whose pixel data happens to be alphanumeric.
- The `--staged` route still drops `D` (a deletion has no staged blob) and `U` (an unmerged path has
  no single one). `PRE-EXISTING`, untouched, and already stated in the script's own banner.
- **A DUPLICATE LINE IS THE PRICE AND IT IS THE RIGHT WAY ROUND.** A DICOM object can now report one
  value twice, once under its tag and once as `(text)`. Two lines naming one value is not a defect in
  a gate whose output a human reads before committing. A missing line is.

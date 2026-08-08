# dicom - `scanTarget` sent a preamble-less object on disk to the TEXT sweep (2026-08-08)

`DICOM-SCANTARGET-PREAMBLELESS`, filed `PRE-EXISTING` and the last open item from the finished
roadmap. Written here rather than in `documentation/agent-notes.md` because that file is **over** its
250,000-byte budget on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.**

**Provenance:** the spec claims are read from the SHA-pinned vendored copy at
`vendor/nema/part05/`, **PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every
other figure is a measurement taken on this repo, quoted with the sha it was taken at, and the two
mutation controls are reproducible with `git show <sha>:scripts/phi-scan.ts` over the current tests.

**`CLAUDE.md` CARRIES NO LINE FOR THIS, DELIBERATELY, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT
THE TRAP IS SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which
is not a line. The remedy in that situation is relocation, never deleting an existing trap to make
room, and never raising the ceiling. So the rule lives in three places that a worker touching this
code actually reads: the JSDoc on `scanTarget` itself, the ten cases in
`test/scripts/phi-scan.test.ts` under "a preamble-less object ON DISK reaches the DICOM route", and
this file.

## The defect

`scripts/phi-scan.ts` has two DICOM shape tests and they are not the same test.

- `isDicom(buf)` is the Part 10 test: 132 bytes minimum, `DICM` at 128. It answers **false** for a
  preamble-less stream.
- `fileMetaStart(buf)` knows **both** shapes: 132 for a Part 10 object, and 0 for a stream that opens
  directly on group `0002` in Explicit VR LE. It is what `scanDicom` calls, and what
  `scanEmbeddedObjects` has called since the doc-corpus route was written.

`scanTarget` dispatched on the wrong one. A `.dcm` or `.bin`, and anything under an unknown
extension, was gated on `isDicom` **before** reaching `scanDicom`; a preamble-less object failed that
gate and fell to the `scanText` fallback instead. So the DICOM-aware sweep - the PN/DA/DT tag table,
the transfer-syntax dispatch off `(0002,0010)`, the per-element value decode - **never ran on a
preamble-less object on disk**, and the gate printed `[phi-scan] OK - no hits` over it.

A missing preamble is not an exotic input here. It is a deviation the parser tolerates on the read
path and warns about with `DICOM_MISSING_PREAMBLE`, and `docs-content/cookbook.md` ships a fixture in
exactly that shape to demonstrate the warning. The doc corpus reached `scanDicom` correctly; only an
object **on disk** did not.

## Why the text fallback is not a narrower scan but a different one

This is the part worth keeping, because "it still got scanned, just by the other route" is the
reading that makes the defect look cosmetic. The two routes detect different things, and the text
route cannot see what the tag table sees:

- The text pass matches PN only as `FAMILY^GIVEN` (`/\b[A-Z][A-Za-z\-']+\^[A-Z][A-Za-z\-']+\b/`). A
  **single-component** `(0010,0010)` carries no caret, so there is nothing to match. The DICOM route
  does not care about the shape of the value at all: any value at a `PN_TAGS` tag that is not on the
  allow-list is a hit.
- The text pass matches a date only as `YYYY-MM-DD` or as a standalone eight-digit token. A `DT`
  value's `YYYYMMDD` head sits inside a longer digit run, so the word-boundary anchors miss it; the
  DICOM route slices the head off and checks it.
- Under Implicit VR LE there is no VR on the wire at all, so only a tag table can classify a value.

## Measured, base `5ae8fe4`

One preamble-less object per row, Explicit VR LE, `(0008,0020) DA` and `(0010,0010) PN`, written to
disk and handed to the scanner in paths mode. The name is `WESTERGAARD` - invented, single-component,
and **not** matchable by the text sweep, which is what makes the exit codes evidence rather than
coincidence.

| target | base | with the fix |
|---|---|---|
| preamble-less `.dcm`, name-bearing PN | exit **0**, no hit | exit 1, `(0010,0010)` |
| preamble-less `.bin`, same | exit **0**, no hit | exit 1, `(0010,0010)` |
| preamble-less `.dat` (unknown ext), same | exit **0**, no hit | exit 1, `(0010,0010)` |
| the same object **with** a preamble | exit 1, `(0010,0010)` | exit 1, `(0010,0010)` |
| preamble-less `.dcm`, allow-listed `ANON^PATIENT` | exit 0 | exit 0 |

The fourth row is what makes the first three a gate defect rather than an undetectable payload: the
identical bytes, plus 132 bytes of preamble and magic, were caught all along. The fifth is the clean
result pinned beside the positives, so a green is a green and not an absent detector.

**A `N OF M` FIGURE HAS A MOVING BASE.** Quoted with its sha and no other: with the tests as they
stand at the end of this slice, `test/scripts/phi-scan.test.ts` runs **6 failed, 46 passed, of 52**
against base `5ae8fe4`'s `scripts/phi-scan.ts`, and **3 failed, 49 passed, of 52** against the
refused first draft `1ff2ab4`'s. The passing majority in both columns is the point: a control that
only passes after the fix is not a control.

## 🛑 THE FIRST DRAFT WAS REFUSED, AND THE FINDING IS THE RULE

The first draft made the binary branch an if/else: recognized by `fileMetaStart` goes to `scanDicom`,
otherwise `scanText`. A `conformance-refuter` pass refused it, and the finding reproduced
independently. **ADDING THE DICOM ROUTE MUST NOT SUBTRACT THE TEXT ONE, BECAUSE `scanDicom` GIVES UP
QUIETLY.** Its walk `break`s at the first header it cannot read, and `readElementExplicit` answers
`null` for an undefined-length value (`0xFFFFFFFF`). That is not a malformed file. **Quote §7.5.2
whole: it defines TWO delimitations, the encoder chooses, and "Both ways of encoding shall be
supported by decoders."** Calling undefined length "the normative encoding" overstates it and was
corrected here; the argument needs only the half the clause states outright, which is that a
conformant file may carry it and a decoder shall support it. §7.1 then orders Data Elements by
ascending tag, so a conformant object puts `(0008,1110) SQ` **before** `(0010,0010)`. A non-LE
transfer syntax stops the walk the same way, at the first dataset element.

Measured, same bytes, three scanners. Preamble-less, `(0008,1110)` undefined-length SQ, then
`(0010,0010) PN` carrying this suite's own synthetic `RIVERA^JUANITA`:

| scanner | result |
|---|---|
| base `5ae8fe4` | exit 1, the text sweep reports the name |
| refused draft `1ff2ab4` | **exit 0, `OK - no hits`** |
| shipped | exit 1 |

A gate that reports clean over a name it used to report is a worse defect than the one being fixed.

## The remedy

`scanTarget` dispatches a text extension by NAME. For everything else it asks **two independent
questions and runs both answers**, which makes it a strict **superset** of the `isDicom` gate on
every input. That superset property is the thing to preserve if this is ever touched again:

| input | base `5ae8fe4` | shipped |
|---|---|---|
| `isDicom` true | `scanDicom` | `scanDicom`. Byte-for-byte unchanged. |
| preamble-less | `scanText` | `scanDicom` **and** `scanText`. Pure addition. |
| neither | `scanText` | `scanText`. Byte-for-byte unchanged. |

Because the middle row keeps the text sweep it used to get, **nothing that was found before can be
lost**, which is what the refused draft could not say. `.dcm`, `.bin` and unknown extensions were
three copies of one branch and are one branch now. `isDicom` is not deleted - `fileMetaStart` calls
it as the Part 10 half of the answer, and the branch calls it again to decide whether the text sweep
is owed - but nothing may gate the **DICOM** scan on it. **The DICOM route asks `fileMetaStart`,
never `isDicom`; the text route is not an `else`.**

The cost, stated rather than left to be discovered: a preamble-less object can now report one value
twice, once under its tag and once as `(text)`. Two lines naming one value is not a defect in a gate
whose output a human reads before committing. A missing line is.

The superset shape also settles a second question the exclusive draft had opened. `fileMetaStart`'s
preamble-less test is **looser** than the library's own tolerated shape (`src/parser/part10-header.ts`
requires exactly `(0002,0000) UL 0x0004`; the scanner accepts any `(0002,eeee)` with two ASCII
capitals at bytes 4-5). Under an if/else that looseness could **remove** a text sweep from a binary
the library itself would refuse as `NOT_DICOM_PART_10`. Running both routes means a false recognition
costs a wasted walk and never a lost scan, so the two tests do not have to be reconciled here.

## Residuals, disclosed and NOT closed

- **🩺 `scanDicom` HALTS SILENTLY AND REPORTS NOTHING ABOUT THE BYTES IT NEVER READ, AND A
  PREAMBLE-FUL PART 10 OBJECT HAS NO TEXT SWEEP BEHIND IT.** So the identical fixture above **plus**
  a 128-byte preamble and `DICM` measures **exit 0, `OK - no hits`, on base `5ae8fe4` and on the
  shipped tree alike**, over `(0010,0010) = RIVERA^JUANITA`. `PRE-EXISTING`, surfaced by the refuter
  pass on this slice, and **NOT closed here**. It is not an oversight: closing it means sweeping
  every Part 10 object as text as well, which would flag 8-digit runs inside pixel data and
  encapsulated fragments. That is a gate-behaviour change with its own false-positive surface and its
  own product call, in the shape this repo already knows from `DICOM-DEIDENT-OVER-REDACTION` - not a
  side effect of this one. It needs its own backlog item.
  **▶ 🛑 AND A TEST PINS THE BOUNDARY, SO THE ITEM THAT CLOSES THIS WILL GO RED BEFORE IT GOES
  GREEN.** `"a PREAMBLE-FUL object is still scanned by the DICOM route ALONE, byte-for-byte as
  before"` in `test/scripts/phi-scan.test.ts` asserts exit 0 over a preamble-ful object carrying
  `RIVERA^JUANITA` at `(0008,1030) LO`, which only a text sweep could report. Measured at `28e75e0`:
  make the text sweep unconditional and the suite reads **1 failed, 51 passed, of 52**, that test
  being the one. **It is a scope boundary, not a clearance** - its non-vacuity control sits beside it,
  asserting that the same value at `(0010,0010)` in the same shape of object IS caught. Whoever
  closes the residual should expect that red and move the boundary deliberately, not treat it as a
  regression. **An earlier draft of this bullet said no test pinned it; that was false and is
  corrected, not reworded.**
  **▶ This also bounds what the row-4 control above proves.** "The identical bytes plus 132 bytes of
  preamble were caught all along" is true of a fixture with no undefined-length element in it, and is
  **not** a general property of the preamble-ful route. Do not restate it as one.
- **A TEXT EXTENSION IS STILL DISPATCHED BY NAME, SO A `.md`/`.json`/`.txt`/`.csv` FILE WHOSE RAW
  BYTES ARE A DICOM OBJECT IS NEVER SCANNED AS ONE.** `PRE-EXISTING` and **unchanged** by this slice:
  it was true on base for a preamble-ful object as well, so it is a dispatch-by-name defect and not a
  preamble one. Left deliberately, because the trade is not free in the other direction either - the
  text route is what runs `scanEmbeddedObjects`, and a doc page dispatched to the DICOM route on the
  strength of its first eight bytes would lose the base64 decode that is the only thing that reads
  the doc corpus at all. Closing it means running **both** routes on a text extension, which is a
  scanner-behaviour change with its own false-positive surface, not a side effect of this one.
- The `--staged` route still drops `D` (a deletion has no staged blob) and `U` (an unmerged path has
  no single one). `PRE-EXISTING`, untouched here, and already stated in the script's own banner.
- Nothing about the **hit** surface moved. A hit still reports the element's tag, VR, offset and
  value, which is what the scanner is for; the PHI-diagnostic bounds that govern the *library's*
  warnings do not apply to a developer-facing gate that exists to print the violating value.

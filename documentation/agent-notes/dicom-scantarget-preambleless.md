# dicom - `scanTarget` sent a preamble-less object on disk to the TEXT sweep (2026-08-08)

`DICOM-SCANTARGET-PREAMBLELESS`, filed `PRE-EXISTING` and the last open item from the finished
roadmap. Written here rather than in `documentation/agent-notes.md` because that file is **over** its
250,000-byte budget on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.**

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

**A `N OF M` FIGURE HAS A MOVING BASE.** Quoted with its sha and no other: with this slice's tests
applied to base `5ae8fe4`'s `scripts/phi-scan.ts`, `test/scripts/phi-scan.test.ts` runs **5 failed,
43 passed, of 48**. The 43 include every control in the new block, which is the point - a control
that only passes after the fix is not a control.

## The remedy

`scanTarget` dispatches text extensions by NAME, and everything else by CONTENT via `fileMetaStart`:

```
TEXT_EXTENSIONS -> scanText + scanEmbeddedObjects
fileMetaStart(buf) !== null -> scanDicom
otherwise -> scanText (unchanged fallback)
```

`.dcm`, `.bin` and unknown extensions were already three copies of one branch; they are one branch
now. `isDicom` is not deleted - `fileMetaStart` calls it as the Part 10 half of the answer - but
nothing else in the script may gate a scan on it. **The binary route asks `fileMetaStart`, never
`isDicom`.**

## Residuals, disclosed and NOT closed

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

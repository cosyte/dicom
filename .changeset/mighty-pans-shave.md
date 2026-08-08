---
"@cosyte/dicom": patch
---

Fix the repo's PHI gate skipping a preamble-less DICOM object on disk (`DICOM-SCANTARGET-PREAMBLELESS`).

`scripts/phi-scan.ts`'s `scanTarget` gated a `.dcm`, a `.bin` and any unknown extension on `isDicom`
(the 128-byte preamble plus `DICM`) before handing the bytes to `scanDicom`. A preamble-less stream,
whose File Meta group starts at byte 0, failed that gate and fell through to the text sweep, so the
DICOM-aware scan never ran on one and the gate printed `OK - no hits` over it. The text sweep is not
a narrower scan but a different one: it matches a person name only in `FAMILY^GIVEN` form, so a
single-component `(0010,0010)` is invisible to it, and a `DT` value's date head is not a standalone
eight-digit token either.

The DICOM route now asks `fileMetaStart`, which knows both shapes and is what `scanDicom` and the
doc-corpus route already used. **The text route is not an `else`.** Detection moved in one direction
only, and that is deliberate: `scanDicom` stops at the first header it cannot read, including an
undefined-length Sequence, which PS3.5 2026c makes the normative encoding and which a conformant file
places ahead of `(0010,0010)`. So a recognized object is now swept by both routes rather than handed
from one to the other, which makes the branch a strict superset of the old behaviour on every input:
`isDicom` true is unchanged, a preamble-less object gains the DICOM sweep on top of the text sweep it
already had, and an unrecognized file is unchanged. One value can now be reported twice, once under
its tag and once as `(text)`.

Still open, `PRE-EXISTING` and unchanged: a preamble-ful Part 10 object gets no text sweep behind
`scanDicom`, so an early halt on one is silent; and a text extension is still dispatched by name, so
a `.md` whose raw bytes are a DICOM object is not scanned as one.

Gate-only: no runtime, API or parser behaviour changes, and no published surface moves.

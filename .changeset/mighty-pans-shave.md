---
"@cosyte/dicom": patch
---

Fix the repo's PHI gate skipping a preamble-less DICOM object on disk (`DICOM-SCANTARGET-PREAMBLELESS`).

`scripts/phi-scan.ts`'s `scanTarget` gated a `.dcm`, a `.bin` and any unknown extension on `isDicom`
(the 128-byte preamble plus `DICM`) before handing the bytes to `scanDicom`. A preamble-less stream,
whose File Meta group starts at byte 0, failed that gate and fell through to the text sweep, so the
DICOM-aware scan never ran on one and the gate printed `OK - no hits` over it. That is not a narrower
scan but a different one: the text sweep matches a person name only in `FAMILY^GIVEN` form, so a
single-component `(0010,0010)` is invisible to it, and a `DT` value's date head is not a standalone
eight-digit token either.

The binary route now asks `fileMetaStart`, which knows both shapes and is what `scanDicom` and the
doc-corpus route already used. A file that is not a DICOM stream by either shape still gets the text
sweep, unchanged, and a text extension is still dispatched by name so that the base64 doc-fixture
decode is kept.

Gate-only: no runtime, API or parser behaviour changes, and no published surface moves.

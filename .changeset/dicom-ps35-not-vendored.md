---
"@cosyte/dicom": patch
---

**Build-provenance change with no runtime impact**: the PS3.5 repeating-group bound is now derived
from pinned normative documents instead of transcribed into a source file.

`deidentify()` expands the `(50xx,xxxx)`, `(60xx,3000)` and `(60xx,4000)` rows of PS3.15 Table E.1-1
over the concrete group numbers PS3.5 section 7.6 admits: sixteen even groups per mask, `5000`-`501E`
and `6000`-`601E`, not 256. That bound decides in both directions whether an identifier is removed or
whether data the standard never marked is deleted, and it was the last input in this package that was
a **quotation in a source file** while PS3.6 and PS3.15 were SHA-pinned and re-hashed before use. The
generator's guard could catch a new mask prefix but never a changed bound.

`vendor/nema/part05/` now pins `part05.xml` (PS3.5 2026c) and `vendor/nema/part05-2004/` pins
`04_05pu.pdf`, both by SHA-256 and both re-hashed as a precondition, and
`scripts/generate-repeating-groups.ts` emits `src/dictionary/generated/repeating-groups.ts` from them.
Two documents because the bound is split across two editions: the current one states the overlay
bound normatively and excludes the odd `6001`-`601F`, but says nothing about the curve bound, having
retired curve encoding and delegated it to PS3.5-2004 by URL in section 7.6's own Note. The generator
proves that delegation rather than assuming it, and because both editions state the overlay bound it
requires them to agree.

**The emitted bound is identical to the transcribed one**, so no behavior changes and no public API
moves; the values were already correct. What changes is that they are now falsifiable: mutating the
overlay bound in either vendored edition reds the cross-check, mutating the curve bound in the 2004
edition moves the emitted artifact (which the byte-identical regen gate then catches), and removing
the delegation link stops the 2004 document being used at all. Each mutation was confirmed
non-vacuous by disabling the guard and watching the test fail.

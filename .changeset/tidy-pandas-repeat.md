---
"@cosyte/dicom": patch
---

Cap the repository's PHI gate (`scripts/phi-scan.ts`) at a per-file number of printed hit lines,
which is developer tooling and not part of the published surface.

`report()` wrote one stderr line per hit with no bound, and the preceding slice widened what reaches
it: the text sweep now runs over every Part 10 object's bytes, and its recognizers fire on image
noise at a rate that is a property of the payload's byte histogram. Measured on `b784c38` over 8 MiB
of synthetic pixel data uniform over `0x41-0x60`, one run wrote 71,447 hits as 6,037,715 bytes of
stderr.

The cap is on **printing only**. The exit code and the reported totals are derived from the hits and
not from what was printed, so a withheld line cannot turn a refusal into a clean run. It is applied
**per file**, never globally, so a loud file cannot push a later file's hits off the report. A file
with lines withheld says so, with the exact remainder. `--max-hit-lines <n>` sets the bound and
`--max-hit-lines 0` prints every line, reproducing the previous output byte for byte.

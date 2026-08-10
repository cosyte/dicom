---
"@cosyte/dicom": patch
---

Parse the PHI gate's override log with CommonMark's line ending, and pin the spec that says so.

A lone `CR` in `phi-scan-overrides.md` hid a fence OPENER from the gate's line split, so a
`### <path>` a human sees inside a rendered code block was a live allow entry and `--allow-fixture`
exempted that PHI scan target at exit 0. `overrideLogPaths` now splits per CommonMark 0.31.2 section
2.1; the allow list keeps `/\r?\n/` deliberately, because `scripts/phi-allow-list.txt` is not a
markdown document. No direction is claimed for either split, on the override log or on the allow
list: each pair of readings has been measured with entry sets that are disjoint rather than nested,
so neither is the conservative one. The spec is vendored under `vendor/commonmark/` and re-hashed
as a precondition, so the section numbers the gate cites are derived rather than asserted.

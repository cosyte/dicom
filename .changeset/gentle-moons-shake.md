---
"@cosyte/dicom": patch
---

Scan a file by its CONTENT in the repository's PHI gate (`scripts/phi-scan.ts`), which is developer
tooling and not part of the published surface.

`scanTarget` branched on the file's extension before it read a byte: `.json`, `.txt`, `.md` and
`.csv` ran the text sweep and the base64 decode and returned, so the DICOM-aware sweep never ran on
one whatever its bytes were. A file whose raw bytes are a Part 10 object was therefore never scanned
as one if it happened to be named `.md`, which a de-identification report, a bug repro or a fixture
saved under the wrong extension plausibly is.

What that cost is narrower than "a second opinion", and the fixture is built to show it: only the
tag table can see a **single-component** `(0010,0010)`, because that shape carries no caret for the
text sweep's person-name pass to match. Measured on `08ed3ee` over one object, the same bytes exited
1 as `.dcm`, `.bin` and `.dat`, and 0 with `OK - no hits` as `.md`, `.txt`, `.json` and `.csv`.
Preamble-less, the same.

The remedy is the DELETION of the branch, and that is what makes it safe rather than a net leak.
`scanDicom` gives up quietly at an undefined-length Sequence (PS3.5 2026c section 7.5.2 defines
`0xFFFFFFFF` as one of two Sequence delimitations, both of which decoders shall support, and section
7.1 orders tags ascending, so `(0008,1110)` precedes `(0010,0010)` in a conformant file), so routing
a file to it INSTEAD of the text sweep has previously taken a name from exit 1 to exit 0. The removed
branch's two calls were the text sweep and the base64 decode; the branch that replaces it makes the
same two unconditionally and adds one conditional DICOM sweep. Hits are only ever appended, so the
hit set, the totals and the exit code are a strict superset on every input.

That superset was checked mechanically over 11 objects times 7 extensions, 77 cells: 65 identical,
12 strictly more reported, 0 cells that lost an exit code or a reported value. Every fixture was
verified through this package's own parser before any zero it produced was believed. The scan of the
repository's real corpus is byte-identical, exit code and output alike.

Two residuals are unchanged and disclosed rather than closed: the DICOM sweep still reports nothing
about the bytes it never read, and the hit array is still unbounded in memory. The matrix, the
superset check and the reason the first of those is a separate slice are in
`documentation/agent-notes/dicom-phi-scan-name-dispatch.md`.

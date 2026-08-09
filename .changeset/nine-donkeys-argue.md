---
"@cosyte/dicom": patch
---

Make the repository's PHI gate (`scripts/phi-scan.ts`) report the bytes its DICOM sweep never read.
This is developer tooling and not part of the published surface.

`scanDicom` stops at the first Data Element header it cannot read and said nothing about what came
after it, so a run printed `OK - no hits` over a file whose tag table it had abandoned partway
through. The way in is conformant: PS3.5 2026c section 7.5.2 defines an undefined-length Sequence as
one of two delimitations, both of which decoders shall support, and section 7.1 orders tags
ascending, so `(0008,1110)` precedes `(0010,0010)`. Encapsulated pixel data has the same shape.

Each halt is now recorded per file and printed as a `PARTIAL:` line, and the word `OK` is withdrawn
from the clean line when any file has one. The line carries a path, two counts and a reason from a
closed table: no tag, no VR, no value and no byte of the object, because the bytes at a halt are
exactly the bytes that did not read as a header. The tally is bounded by the number of files rather
than by anything an object can choose, so it needs no cap and cannot be pushed off the report by a
file loud enough to bury its own hits.

The exit code deliberately does not move. Nothing was found, nothing refused the scan, the same
disclosure would fire on input section 7.5.2 makes legal, and folding it into exit 2 would mask a
real hit whenever both were present. A CI job that reads only the exit code therefore still cannot
see this, which is disclosed rather than claimed away.

Proved over 13 objects x 5 carriers x 3 cap settings: exit code and hit lines identical in all 195
cells, 60 outputs identical, 105 strictly larger, 30 differing only by the withdrawn `OK` line, 0
violations. The generator ships as `scripts/measure-phi-scan-unread.ts` so the table can be
re-derived. What the disclosure does and does not carry, and the residuals left open, are in
`documentation/agent-notes/dicom-phi-scan-unread-tail.md`.

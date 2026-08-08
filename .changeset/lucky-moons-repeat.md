---
"@cosyte/dicom": patch
---

Close a silent halt in the repository's PHI gate (`scripts/phi-scan.ts`), which is developer
tooling and not part of the published surface.

`scanDicom` gives up quietly at the first Data Element header it cannot read, and an
undefined-length Sequence is one of those (PS3.5 2026c section 7.5.2 defines it as one of two
delimitations, both of which decoders shall support). The text sweep behind it ran only when
`isDicom` answered false, so a **preamble-ful** Part 10 object had nothing behind the halt: the
identical dataset was reported without a preamble and missed with one, and the gate printed
`OK - no hits` over a name-bearing `(0010,0010)`. The preamble is not part of the dataset, so it
cannot decide who is owed a text sweep.

The text sweep now runs on every binary target, and `scanEmbeddedObjects` runs it on the object it
decodes as well, where the base64 hides the name from the enclosing page. Both are additions beside
`scanDicom`, never replacements for it. The accepted cost is false positives from the compact-date
pass over binary values, measured and reasoned in
`documentation/agent-notes/dicom-scandicom-silent-halt.md`.

Also closes a pre-existing refusal on the same route: the base64 run matcher was a greedy regular
expression, and one multi-megabyte run overflowed V8's backtrack stack, exiting 2 rather than
scanning. It is a forward scan now, yielding the same runs.

---
"@cosyte/dicom": patch
---

Bound the value a PHI-gate hit line echoes. `scripts/phi-scan.ts` printed the whole violating value
on one stderr line, and how large that was is chosen by the payload: an element declares its own
length, so a `(0010,0010)` claiming the rest of the object put the rest of the object on one line
to report that a name was not on the allow-list. It was the only unbounded payload-derived field on
the line; the others are a path, a rendered tag, an offset and a literal reason.

A hit now carries an excerpt of at most 194, bounded where the hit is made rather than where it is
printed: `Hit.value` is no longer a `string`, and one factory is the only way to make one. 194 is
PS3.5 2026c Table 6.2-1's PN arithmetic (three component groups of 64, two delimiters), but that
table measures in characters and this scanner measures a latin1 decode, so 194 bounds what the
report prints and says nothing about what the standard admits: a conformant 194-character PN under
`ISO_IR 192` is cut here, and a test pins it. Every cut states exactly how much was withheld,
outside the quotes.

Detection is unchanged: the exit code, the totals and the set of files named come from the hits and
not from what was printed. Developer-facing only, no public API change.

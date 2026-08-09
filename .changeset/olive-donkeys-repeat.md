---
"@cosyte/dicom": patch
---

Make the PHI gate's hit excerpt own its bytes, so a hit cannot retain the payload it was cut from.
`scripts/phi-scan.ts` bounded what a hit line prints, but not what a hit holds: V8 answers
`raw.slice(0, n)`, and a regexp match, with a string that points into its parent, so a 19 character
name matched inside an 8 MiB page kept that whole page alive for the rest of the run, and `hits`
lives for the whole run. Measured against `88be779`, retained memory grew by one whole file for
every hit-bearing file scanned and now does not grow at all: 178 MiB against 34 MiB over a 160 MiB
corpus, with a hit-free control of the same size reading 26 MiB on both.

The copy is inside the one factory that makes a hit value, so the bound is on the slot rather than
on a caller, and it is on both branches: a value already under the excerpt bound is a pointer too,
which is the route the text sweep's name recognizer takes. The round trip is `utf16le` rather than
`utf8` because `utf8` turns an unpaired surrogate into a replacement character, and a report naming
a value the file does not carry is the same class of wrong answer as a report printing too much.

The cost direction is stated rather than claimed away, and it is narrow: where one page is nothing
but violating tokens, a resident copy per hit replaces a resident pointer per hit, and the two are
within a few MiB of each other in either direction depending on token length.

Nothing printed changes: 42 of 42 grid cells across six routes, five value lengths and three cap
settings are byte-identical on exit code, stdout and stderr.
`pnpm measure:phi-scan-retention` re-derives both tables and the grid against any base.
Developer-facing only, no public API change.

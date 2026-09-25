---
"@cosyte/dicom": patch
---

Claim the PHI gate's `CRLF` line split, and delete the disclosure that said it could not be claimed.

`#113` shipped `scripts/phi-scan.ts`'s `splitLines` with a disclosure that its `CRLF` half was
unobservable through either caller and claimed by no test, because `loadAllowList` trims and
`tripleHashValue` trims. Both premises are true and the conclusion is false: `overrideLogPaths`
hands the RAW line to `fenceRun` before anything trims it, and a closing fence run is `bare` only
when it is followed by spaces or tabs (CommonMark 0.31.2 section 4.5). On an override log written
with `CRLF`, a `CR`-blind split therefore leaves a `CR` after the closing run, the run reads as an
info string rather than as a close, the block never ends, and every entry below it is dropped.

Measured on one log carrying a fenced template and two live entries below it: the shipped script
exits 0 with both entries honoured, a `CR`-blind mutant exits 2 having dropped both, and with the
same log written `LF` the two agree. Both `--allow-fixture` directions are asked on each arm, so a
parser that made everything below an entry fails it too.

No direction is claimed for that mutant. A draft called it fail-closed, on the grounds that a `CR`
can only prevent a close and never cause one; the gate falsified that with an input, and it is
deleted rather than narrowed. On a log whose lines are `CRLF` except one opening fence the two
entry sets are disjoint rather than nested, and the mutant exempts at exit 0 a target the shipped
script refuses at exit 2. Fence state is parity, so a wrong answer moves entries in both directions.

The behaviour was already correct and is unchanged: comment-stripped, `scripts/phi-scan.ts` is
byte-identical on base and head. What changed is that four carriers of the false disclosure inside
this package are corrected.

The mutation figure that stood here is DELETED rather than restated: a later change in this same
release moved `overrideLogPaths` onto its own CommonMark splitter, so the `CR`-blind mutant of
`splitLines` no longer reds anything, and both changesets land in one generated `CHANGELOG.md`.

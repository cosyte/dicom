---
"@cosyte/dicom": patch
---

Spend the PHI gate's per-file print budget per recognizer, so one recognizer's flood cannot spend
another's share. `scripts/phi-scan.ts` printed the first `n` of a file's hits in scan order, and a
file's routes do not queue independently: the tag walk appends before the text sweep, so how many of
the text sweep's findings a reader saw was decided by how many the tag walk had already made. The
text sweep's PN recognizer is the only route that can see a caret-joined name in bytes the tag table
never typed, and it is the one at the end of the queue. Nothing was ever mis-counted, and this was
not a false green: the exit code, the total, the set of files named and the withheld count are
computed off the hits and were right throughout. What moved was which lines a reader saw.

The budget is now spent per entry of a closed recognizer table, per file, so whether a hit prints
depends on its own recognizer and its index among that file's hits from that recognizer, and on
nothing another recognizer found. The table is a type rather than an analysis of today's push sites:
budgeting on the printed reason string would have let one future recognizer interpolate a
payload-derived token into it and hand the payload a vote on how many classes exist. The `hits`
array is still deliberately not capped, because a cap there would make the totals a claim about what
was kept rather than about what was found.

Because a hit among a file's first `n` overall is among its own recognizer's first `n`, the printed
set is a superset of the previous scanner's at every cap: 72 grid cells over nine corpus shapes and
eight caps, zero cells where a line the old scanner printed goes unprinted, 29 cells printing
strictly more, and 23 cells where the old scanner printed nothing at all from a recognizer that had
hits. With the two scanners swapped the same grid reports 332 violations, so the zero is a
measurement rather than a blind check. `pnpm measure:phi-scan-monotonicity` re-derives it against
any base.

This is not monotonicity and is not described as it: under any finite budget `n+1` hits from one
entry print `n`, so adding a hit can always remove a line. Several sweeps also share an entry, which
costs more than the same sweep twice: the two text date passes share one, so over 200 ISO dates
followed by 200 compact ones the report prints 20 ISO lines and no compact one, and the compact pass
is the only route that sees a bare eight-digit date. That is measured, identical on the previous
scanner, unchanged here, and pinned by a test rather than argued away.

The cost is stated rather than claimed away: a file's report can be longer, bounded by the cap times
the closed table instead of by the cap, measured at 20 lines against 61 on the loudest grid shape at
the default budget. `--max-hit-lines 0` still prints every line. Developer-facing only, no public API
change.

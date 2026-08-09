---
"@cosyte/dicom": patch
---

Let the repository's PHI gate (`scripts/phi-scan.ts`) finish writing its report before it exits.
This is developer tooling and not part of the published surface.

The script ended `process.exit(run())`. `process.exit()` tears the process down without waiting for
stdio that libuv has accepted but not yet written, and under every caller that matters this script's
stderr is a **pipe**: `spawnSync` in this repo's own suite, and the shell pipeline a CI job runs it
in. A pipe write that cannot complete immediately is queued and flushed on a later loop turn, which
`process.exit()` never allows, so `report()` returning was not the same as its bytes having left the
process.

**The failure mode is a gate defect, not a cosmetic one.** The exit code is computed from
`hits.length` and was always right, so a truncated report is a run that REFUSES while under-naming
what it found, and the bytes it drops are the END of the report: the last hit lines and the total,
which is the part a reader trusts to say how much there was.

This was red on `main`. `ci / verify (24, ubuntu-latest)` is a required check and it failed on
`08ed3ee` and `21d42f5`, both times on `countHitLines(...) === 200` reading 193, and on `#106`'s PR
head reading 191, with `verify (22)` green throughout and the exit code correct in every case.

The scan is deterministic, so the hit COUNT cannot vary between runs: the fixture is 200 distinct
tokens and the recognizers are plain global regexes over the whole file. What varied is what
arrived. Measured on `21d42f5` with the reader stalled, 5,000 small stderr writes: `process.exit(1)`
delivered 784 lines, about one 64 KiB pipe, on 3 of 3 runs; `process.exitCode = 1` delivered 5,000
on 3 of 3. Node 22.23.1 and 24.19.0 behaved identically there, so the version split is scheduling
and not stdio semantics. The CI failure itself reproduced on the real script and the real fixture
once the reader was made to lose (single-page pipes plus CPU contention): **30 of 60 runs truncated,
counts including 190, 191 and 192, exit 1 every time; 0 of 60 with this change.**

Not calling `process.exit()` has a cost, and it is paid here rather than discovered later: it makes
a late stdio error reachable. A write to a pipe whose reader has gone fails with `EPIPE` on a later
tick, after `run()` has returned, so `run()`'s try/catch cannot see it and Node's default
unhandled-`'error'` path exits 1, the one code that means "PHI was found". Without a listener a
clean corpus went 0 to 1 and an invocation error went 2 to 1. Both stdio streams now discard a late
error, which is exactly what `process.exit()` did by making it unreachable, so the exit code stays
exactly what `run()` returned. **The residual, disclosed and not closed: with a reader that never
drains at all this script now waits instead of exiting, where `process.exit()` ended it by dropping
the report.** That is introduced, on `node` and under `tsx` alike. A timeout would re-introduce the
defect this closes, so it is disclosed rather than answered.

It changes what ARRIVES, never what is WRITTEN. Over a draining reader, base and fixed emit
byte-identical stdout, stderr and exit code across 12 cases spanning all three of the contract's
exit codes, the per-file print cap at its default and at 0, 1 and 3, the net-leak control and both
cells of the finding that `report()` is not monotone in `hits` at the cap. Nothing about the cap or
its non-monotonicity is changed or claimed away here; the printed set simply arrives.

Still open and NOT fixed here: `test/helpers/run-script.ts` inherits `spawnSync`'s 1 MiB
`maxBuffer`, which truncates at roughly 15,400 lines in both exit modes. That is the parent dropping
bytes it was handed rather than the child failing to hand them over, and it is a different defect.

Detail, controls and the superset check: `documentation/agent-notes/dicom-phi-scan-exit-flush.md`.

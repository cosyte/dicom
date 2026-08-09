# `phi-scan` ended `process.exit()`, so the tail of its report was dropped on a pipe

_`DICOM-PHI-SCAN-EXIT-FLUSH`, 2026-08-09. Base **`21d42f5`**. Filed because `ci / verify (24,
ubuntu-latest)` - a REQUIRED check - was red on `main` itself._

Written here rather than in `documentation/agent-notes.md` because that file is **over** its
250,000-byte budget on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.**

**`CLAUDE.md` carries no line for this.** Its ratchet is 39,550 bytes and it measures 39,544 on
`main`: six bytes, which is not a line. Relocation is the remedy, never deleting an existing trap to
make room and never raising the ceiling. So the rule lives where a worker touching this code reads
it: the JSDoc on the last statement of `scripts/phi-scan.ts`, the case in
`test/scripts/phi-scan.test.ts` under `"phi-scan: the report's TAIL survives a stderr pipe the reader
is not draining"`, and this file.

**Provenance.** Every figure below is a measurement taken on this repo against base **`21d42f5`**,
quoted with that sha and no other. The base column is reproducible with
`git show 21d42f5:scripts/phi-scan.ts > /tmp/base-phi-scan.ts`.

## What was red, and what it was not

| sha | slice | `verify (22)` | `verify (24)` |
| --- | --- | --- | --- |
| `b784c38` | `#103` | success | success |
| `08ed3ee` | `#104` | success | **failure** |
| `21d42f5` | `#105` | success | **failure** |

Plus `#106`'s own PR head `e32e595`: `verify (22)` success, `verify (24)` **failure**. Against that,
`#104`'s and `#105`'s PR heads were both **green** on `verify (24)`. Six observations, three red:
**this is a roughly 50% flake, not a step change at a commit.** `#104` did not introduce it. It was
the first slice to emit a 200-line report, and that is all it did.

Every failure is one of the two `--max-hit-lines 0` cases and always the same shape:

| run | test | got | expected |
| --- | --- | --- | --- |
| `08ed3ee` main | `caps by DEFAULT, with no flag` | 193 | 200 |
| `21d42f5` main | `caps by DEFAULT, with no flag` | 193 | 200 |
| `e32e595` (`#106` PR) | `` `--max-hit-lines 0` prints every one `` | 191 | 200 |

## The deduction that fixed the search, before any experiment

**The exit code was right in every failure.** `main` computes it from `hits.length` and the
assertion above the failing one - `expect(r.code).toBe(1)` - passed every time. `report()` therefore
ran to completion and **issued all 200 writes**. Nothing was mis-scanned and no hit was lost.

That rules out the whole class of "the scanner found fewer hits on Node 24" explanations and leaves
exactly one: **the bytes were issued and did not arrive.** Everything below is about delivery.

## The mechanism, established rather than assumed

`scripts/phi-scan.ts` ended:

```js
const exitCode = run();
process.exit(exitCode);
```

`process.exit()` tears the process down without waiting for stdio that libuv has accepted but not
yet written. Under every caller that matters this script's stderr is a **pipe** - `spawnSync` in
this repo's own suite, and the shell pipeline a CI job runs it in - and a pipe write that cannot
complete immediately is queued and flushed on a later loop turn, which `process.exit()` never
allows. `report()` returning is not the same as its bytes having left the process.

**Control 1 - the mechanism in isolation.** 5,000 small stderr writes, reader deliberately stalled:

| script tail | hit lines delivered | exit code |
| --- | --- | --- |
| `process.exit(1)` | **784** of 5,000, 3 of 3 runs | 1 |
| `process.exitCode = 1` | **5,000** of 5,000, 3 of 3 runs | 1 |

784 lines is ~64 KiB, which is a Linux pipe. **Node 22.23.1 and Node 24.19.0 gave the same 784 on
the same box**, so the stdio semantics are NOT the version split - the split is scheduling, and Node
24 is where this suite happens to lose the race.

**Control 2 - the CI failure itself, reproduced.** Real `scripts/phi-scan.ts` at `21d42f5`, real
200-hit fixture, real `spawnSync`, with two knobs turned to make the reader lose: `fs.pipe-user-pages-soft`
exhausted by holding 1,400 open FIFOs, so newly created pipes get a single page instead of 64 KiB,
plus 220 busy loops for CPU contention. Rootless, no `sudo`, no sysctl.

| script tail | runs | truncated | hit-line counts seen |
| --- | --- | --- | --- |
| `process.exit(exitCode)` | 60 | **30** | 200 x30, 190 x17, 191 x6, 170 x2, 192 x1, 171 x1 |
| `process.exitCode = run()` | 60 | **0** | 200 x60 |

**That is the CI signature, on this box: the same ~50% rate, the same short-by-7-to-10 counts (191
and 192 among them), exit 1 every time.** The coordinator's 150+ clean local runs were clean because
an idle box drains the pipe faster than the child fills it; the defect needs a reader that does not.

## What shipped

One statement, plus a case that makes the defect deterministic:

```js
process.exitCode = run();
```

Node returns from the main script and exits once the loop has drained. Nothing in this script keeps
the loop alive on its own - the scan is entirely synchronous - so this changes only that the process
ends **after** its own output, not when.

## Why this could not be folded into `#106`

`#106` had identified the same one-liner and **declined to apply it**, correctly: it changes the
stdio contract of the very script that slice's 195-cell matrix was graded against. That makes the
contract change its own slice, and it makes "what does it break" the question this slice owes an
answer to.

## The superset, checked rather than argued

**It changes WHAT ARRIVES, never WHAT IS WRITTEN.** Base and fixed, same corpus, same argv,
`spawnSync` with a normally-draining reader so neither side is truncated, comparing exit code +
stdout bytes + stderr bytes:

| case | exit | stderr bytes | identical |
| --- | --- | --- | --- |
| clean corpus, all mode | 0 | 0 | yes |
| flood, DEFAULT cap | 1 | 2,007 | yes |
| flood, `--max-hit-lines 0` | 1 | 16,745 | yes |
| flood, `--max-hit-lines 1` | 1 | 455 | yes |
| flood, `--max-hit-lines 3` | 1 | 617 | yes |
| net-leak control: flood THEN named | 1 | 828 | yes |
| non-monotone case: mixed, capped at 3 | 1 | 630 | yes |
| non-monotone case: mixed, uncapped | 1 | 16,921 | yes |
| hits fit under the cap | 1 | 385 | yes |
| bad `--max-hit-lines` | 2 | 102 | yes |
| missing flag argument | 2 | 53 | yes |
| all mode, leak in `docs-content/` | 1 | 382 | yes |

**12 of 12 byte-identical, and all three exit codes of the contract (0 / 1 / 2) are exercised and
preserved.** So:

- **`#104`'s per-file print cap is untouched.** The default, `0`, `1` and `3` all emit the same bytes
  as base, and the net-leak control still names both paths.
- **`#105`'s finding that `report()` is NOT monotone in `hits` at the cap still holds, unchanged.**
  Both cells of it are byte-identical to base. This slice does not make the printed set monotone and
  does not claim to; it makes the printed set **arrive**.
- **`#106`'s 195-cell matrix, graded against `21d42f5`, is not invalidated.** Every cell of it is an
  exit code and a set of printed values, and both are byte-identical here. Checked concretely as
  well as argued: `#106`'s tree at `e32e595` with this one statement applied runs **1,329 tests, 73
  files, all green**, in a throwaway detached worktree. The branch itself was not touched.

## The regression case, and why it is not the flaky one

The two assertions that were failing are a ~50% flake in CI and never fire on an idle box, so they
pin nothing. The new case stalls the reader instead of hoping the scheduler does: it reads one chunk
from the child's stderr, pauses 500 ms, then resumes.

| script tail | result |
| --- | --- |
| `21d42f5` | 171 of 5,000 hit lines, **3 of 3 runs**, total line absent |
| shipped | 5,000 of 5,000, total line present |

The fixture is 25 x `floodText()` = 5,000 hits, ~400 KB of report, deliberately: a stalled reader can
still receive one chunk plus one full pipe, about 128 KiB, so a smaller fixture lets a truncating
scanner pass. Measured at 1,500 hits, one draw in five reached 79,592 bytes. **Do not shrink it.**

## Residual, unchanged by this slice and NOT closed here

**`test/helpers/run-script.ts` inherits `spawnSync`'s 1 MiB `maxBuffer`, which truncates at ~15,400
lines - in BOTH exit modes.** It is a real latent hazard for any future case that scans a loud
object, and it is a different defect: it is the PARENT dropping bytes it was handed, not the child
failing to hand them over. It is not this one, and 200 lines is ~16 KB. Filed, not fixed.

**The other `process.exit()` call sites in `scripts/` are untouched and unmeasured.** They are error
paths that write a line or two before exiting, so the same hazard is available to them in principle
and was not observed. This slice measured `phi-scan.ts` and changed `phi-scan.ts`.

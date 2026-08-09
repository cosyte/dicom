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

## What rules out "the scanner found fewer hits on Node 24"

**The scan is deterministic.** The fixture is 200 distinct PN-shaped tokens written by the test, the
allow-list is copied from this repo, and `scanText`'s three passes are plain global regexes over the
whole file. The same bytes produce the same 200 hits on every run and every Node version, so the hit
COUNT cannot vary. What varied is what arrived.

**"With no ordering or timing input" was in that sentence and is DELETED**: `CUTOFF_YEAR` is
`new Date().getFullYear() - 120`, a wall-clock read, so the premise was false as written even though
the conclusion holds - the 200 tokens carry no digits, so neither date pass can fire on them. A
refuter caught it as the same shape as the syllogism it replaced.

**🛑 AN EARLIER DRAFT ARGUED THIS FROM THE EXIT CODE INSTEAD - "exit 1 was correct, therefore all
200 writes were issued" - AND A REFUTER FALSIFIED IT.** Exit 1 means `hits.length >= 1` and nothing
more, so it is equally consistent with 193 hits having been found. The conclusion held; the argument
did not. It is DELETED rather than reworded. Do not write it again.

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

```js
const discardLateStdioError = (): void => {};
process.stdout.on("error", discardLateStdioError);
process.stderr.on("error", discardLateStdioError);

process.exitCode = run();
```

Node returns from the main script and exits once the loop has drained.

**The two listeners are not decoration, and they are here because pass 1 of the gate REFUTED the
slice without them.** `process.exit()` hid every late stdio error; without it a write to a pipe
whose reader has gone fails with `EPIPE` on a **later tick**, after `run()` has returned, so
`run()`'s try/catch cannot see it and Node's default unhandled-`'error'` path exits **1** - the one
code that means "PHI was found". Measured, reader closed (`| head -n 0`):

| run | `21d42f5` | one statement, no listeners | shipped |
| --- | --- | --- | --- |
| clean corpus | 0 | **1** | 0 |
| invocation error (`--max-hit-lines banana`) | 2 | **1** | 2 |

`2 -> 1` turns "the scan did not complete, so it says nothing about the corpus" into a confident
wrong answer, and it printed an uncaught-exception stack that the `run()` JSDoc forbids. Both codes
hold again under `node` and under `tsx`, which is the invocation `pnpm phi-scan` uses.

**The error is DISCARDED rather than reported, and that is base parity rather than a judgement that
it does not matter.** `process.exit()` made every late stdio error unreachable, so the exit code was
always exactly what `run()` returned; it stays exactly that. There is also nowhere to report it -
the stream that failed is the one a diagnostic would go to.

**🔴 THE COST, MEASURED AND NOT CLOSED HERE: with a reader that never drains at all, the script now
WAITS instead of exiting**, where `process.exit()` ended it by dropping the report. An earlier draft
of the JSDoc claimed this "does not change when the process ends"; that is FALSE and is deleted.
It is INTRODUCED, on `node` and under `tsx` alike, which is the runner `pnpm phi-scan` uses.
Blocking until the reader takes the bytes is what makes the report whole; a timeout here would
re-introduce the defect this slice closed.

**🛑 A SECOND DRAFT TRIED TO SOFTEN THAT RESIDUAL AND A REFUTER FALSIFIED THE SOFTENER TOO.** It
read "every caller in this repo drains, and the shipped `pnpm phi-scan` path runs under `tsx`, which
does not exit on a stalled reader on `21d42f5` either." Both halves were wrong: base exits under
`tsx` in ~430 ms as well as under `node`, so the hang is this slice's; and the suite has had TWO
`spawn` sites since this slice added one, and the one it added destroys its read ends rather than
attaching a listener. **The clause is DELETED, not reworded a third time.** The residual stands
unqualified, which is the honest form of it.

**🛑 AND A NOTE ON HOW THAT ONE GOT IN, BECAUSE IT IS THE REUSABLE PART.** It was inherited from a
refuter's own finding and written into the tree WITHOUT BEING RE-MEASURED. When it finally was, the
first draw agreed with the false version and four repeats refuted it. A single draw against a
process that races a timeout is not a measurement.

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

**12 of 12 byte-identical, over a DRAINING reader, and all three exit codes of the contract
(0 / 1 / 2) are exercised.** The draining qualifier is load-bearing and was added because a refuter
refused the sentence without it: a vanished reader is a different question and is answered by its
own table under "What shipped". So:

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
| `21d42f5` | short, **3 of 3 runs**, total line absent |
| shipped | 5,000 of 5,000, total line present |

**No numeral is quoted for how short, deliberately.** How much of the report base delivers depends
on the reader, and two honest measurements of it disagree: through this case in the suite it read
171 of 5,000, and a refuter running the same shape standalone read 962-964 of 5,000. Both are the
defect. Neither is a property of the scanner, so neither belongs in prose as one.

The fixture is 25 x `floodText()` = 5,000 hits, ~400 KB of report, deliberately: a stalled reader can
still receive one chunk plus one full pipe, about 128 KiB, and the 962-964 measurement is ~80 KB
against that bound, so a smaller fixture lets a truncating scanner pass. **Do not shrink it.**

The second case pins the cost of the remedy rather than the defect: with both read ends destroyed,
a clean corpus must still exit 0 and an invocation error must still exit 2. It **fails** on the
one-statement version and **passes** on `21d42f5`, which is what makes it a parity guard and not a
new invention.

## Residual, unchanged by this slice and NOT closed here

**`test/helpers/run-script.ts` inherits `spawnSync`'s 1 MiB `maxBuffer`, which truncates at ~15,400
lines - in BOTH exit modes.** It is a real latent hazard for any future case that scans a loud
object, and it is a different defect: it is the PARENT dropping bytes it was handed, not the child
failing to hand them over. It is not this one, and 200 lines is ~16 KB. Filed, not fixed.

**The other `process.exit()` call sites in `scripts/` are untouched and unmeasured.** They are error
paths that write a line or two before exiting, so the same hazard is available to them in principle
and was not observed. This slice measured `phi-scan.ts` and changed `phi-scan.ts`.

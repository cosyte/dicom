# AGENTS.md

`@cosyte/dicom` is our DICOM Part 10 parser and utility library for Node.js and TypeScript. It reads
vendor-quirky files leniently with coded warnings, writes spec-clean Part 10, and de-identifies
header metadata per PS3.15 Annex E. We publish it to npm under MIT from this repository.

## Build and test

Use Node.js 22 or later and the pnpm that `packageManager` in `package.json` pins (10.34.5): another
major refuses the frozen lockfile, and `test/docs-content.test.ts` shells out to `pnpm build`. If
`pnpm --version` prints another version, run `corepack enable pnpm --install-directory <dir>` and
put `<dir>` first on PATH.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## The gate

From the repo root, in this order, before you push. CI runs steps 1 to 9 on Node 22, 24, and 26.

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm format:check`
5. `pnpm phi-scan`
6. `pnpm test`
7. `pnpm test:coverage`
8. `pnpm build`
9. `pnpm attw`
10. `pnpm check:readme`, `pnpm check:claude-card`, `pnpm check:catalog`, and
    `pnpm check:process` (CI's `standards` job: the house checks from `@cosyte/script-utils`, and
    the process wiring check from `@cosyte/process`, which runs the build, test, lint, typecheck,
    and format tools at the versions it pins)
11. `pnpm check:no-emdash`
12. `pnpm check:no-internal-refs`

After the build, CI's `examples` job runs `pnpm typecheck:examples`, `pnpm lint:examples`,
`pnpm examples`, and `pnpm phi-scan:examples`. A change under `vendor/`, to the generators in
`scripts/`, to `src/dictionary/generated/`, or to `package.json` also runs the regen check:
`pnpm gen:clean`, `pnpm gen:all`, then `git diff --exit-code src/dictionary/generated/` must print
nothing.

CI's `scaling-gate` job runs `pnpm test:perf`, the scaling gates in `test/perf/scaling-gate.perf.ts`:
they fail when `parseDicom`, reading every tag, or `serializeDicom` grows faster than its input. They
run apart from `pnpm test` and never under coverage.

## Benchmarks

`bench/dicom.bench.mjs` measures the built package on synthetic files in the shapes real traffic
has: the Modality Worklist entry a modality reads all day, a 512 by 512 by 16-bit CT slice, an
Enhanced CT series of 20 and 200 frames (100 MiB of Pixel Data), and a header-only SR of many small
tags in sequences nested four deep. Each is parsed, parsed then read, and written.
`bench/shapes.mjs` builds every file in code; `test/perf/bench-shapes.test.ts` holds that each reads
cleanly and writes back to its own bytes.

```sh
pnpm build
pnpm bench:reading --out bench-results/reading.json --summary bench-results/reading.md
node bench/budgets.mjs bench-results/reading.json
pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
pnpm bench:profile --out bench-results/profile
```

A reading reports throughput, latency p50/p95/p99, allocations, peak heap, a long run for leaks,
and the cold import with its gzip size. Its peak heap is the V8 heap only, so Pixel Data, a Buffer,
is not in it: `pnpm bench:profile` measures each large size's peak resident memory and single-call
time in a fresh process, then profiles the hottest paths.

### Budgets and the floor

On every pull request `.github/workflows/budgets.yml` takes a reading of the whole suite on a
GitHub-hosted runner at Node 22 and runs `cosyte-bench gate` against two files, and fails on a miss.
The `budgets` check is advisory: it is not a required check, and making it one is the owner's
decision.

- `bench/budgets.json`, the limits we commit to: a peak (`budgetPeakBytes`, heap and external
  memory, or for an input under 64 KiB the median call above the empty-call floor) under 20 times one
  input for the worklist item and the SR, and under 3 times for the CT shapes; bytes allocated an
  operation; bytes a second; a median cold import under 15 ms; and the gzipped bytes the import
  loads. A change to it is the owner's to approve.
- `bench/floor.json`, what main measured: 21 readings of one commit by
  `.github/workflows/bench-floor.yml`, each on its own runner, each case's highest reading and
  spread. A reading above the highest plus three spreads fails, and so does a floor file looser than
  the base branch's. To move it, run that workflow and copy its `bench-floor` artifact here; it only
  improves.

#### Allocation: two levels, and what a budget with room hides

The bytes one operation allocates fall on two levels about 3.4% apart. For
`serializeDicom: SR, header only`, 1,000 measurements, the 35 readings of three A/A sets (Bench
floor runs 43109166865, 43110461726 and 43113425128) sit at 6,563,325 to 6,572,292 bytes, and one Budgets reading of unchanged code read 6,792,222 (Budgets run 43110461576,
commit 40130a3); at 10,000 measurements the same 35 readings sit at 65,571,990 to 65,586,938 bytes,
but for two at 67,831,014 and 67,845,666. The gap is about 225 bytes for every measurement at both sizes.

It is neither a collection inside the measured window nor a buffer growing a step: the reading at
the higher level measured with no collection in either window, and its external bytes, where the
written Buffer lives, were the same as at the lower level. It is V8's optimizing compiler. It
compiles on a background thread, and which code it produces for the writer depends on when that
compile finishes. Once compiled, a process stays on its level. Measured on a developer machine
(Node 26), eight processes running the same 100 calls before the same measurement put two at the
lower level and six at the higher, about 227 KB an operation apart; with
`--no-concurrent-recompilation` all eight read the same. The tier matters this much: with only the
mid-tier compiler (`--no-opt`) the same write allocates 7.2 MB, and with no optimizing compiler at
all 24 MB, so the level is set by the compiled code, not by the writer's own work.

The higher level came up in 2 of the first 14 floor readings at 10,000 measurements, in none of the
21 the floor now holds (Bench floor run 43113425128, commit 73c387f) at either size, and in 1 of the
first 2 Budgets readings at 1,000. So the floor, recorded at the lower level with a spread of about
0.1%, fails a pull request that lands on the higher level, unchanged code included. Read such a
failure in the job summary: a figure about 3.4% over the floor on a SR write, with nothing else
over, is this level, not a regression.

Each allocation budget is 1.25 times the highest of the floor's 21 readings, rounded up to three
significant figures, so the higher level never breaks a budget. The cost is plain: **a real
allocation regression of 3%, or of anything up to about 25%, passes every allocation budget.** The
floor still sees one where its spread is small, as it is for most cases, but there a 3% regression
and the compiler's higher level read the same. Where the floor's spread is large it sees nothing
either: in one of the 21 readings `parseDicom, then read tags: SR, header only @ 1,000
measurements, 503 KiB` measured a negative allocation, so that measure's floor spread is 28,349,744
bytes and only its budget holds it. A small allocation regression is the base against head
comparison's to find, not the budgets'.

#### Code size

The gzipped bytes the import loads have no noise, so the floor holds them exactly: 169,927 bytes in
all 21 readings, against a budget of 170,000. A pull request that adds code on purpose fails the
`budgets` job on its size. It records the floor again with one command, run by a maintainer on its
branch:

```sh
gh workflow run bench-floor.yml --ref <branch> -f size=true
```

That set takes the gzipped size afresh; every other measure moves only on an improvement, as
always. Copy the
`bench-floor` artifact the run keeps to `bench/floor.json`. The job still reports the larger size,
as a floor raised over the base branch's, and the pull request must say why the size grew. A size
over the 170,000-byte budget is a budget change, the owner's to approve.

#### What we still miss

The cases still over their peak multiple have no peak limit until they meet it, rather than a
looser one. Each is the budget figure as a multiple of one input, the lowest to the highest of the
floor's 21 readings:

| Case                                                                      | Input     | Peak multiple    | Budget |
| ------------------------------------------------------------------------- | --------- | ---------------- | ------ |
| parseDicom, then read tags: worklist item @ 1 KiB                         | 1,070 B   | 34.07x to 34.09x | 20x    |
| parseDicom, then read tags: SR, header only @ 50 measurements, 26 KiB     | 26,586 B  | 34.13x to 36.51x | 20x    |
| parseDicom, then read tags: SR, header only @ 1,000 measurements, 503 KiB | 515,546 B | 30.59x to 33.39x | 20x    |

The median cold import was 8.587 to 15.469 ms across the 21 readings, and 2 of them were over the
15 ms budget, by 0.12 and 0.469 ms: the slowest runners still miss it, and the `budgets` job fails
when one reads it. The budget stays at 15 ms.

`serializeDicom: CT` at a single frame and at 20 frames has no throughput limit: a reading of the
floor's set skipped each one's throughput (`warmup-unstable`), so the floor keeps no time for it.
`test/perf/budgets-file.test.ts` holds the two files to the suite and to these lists. `node
bench/budgets.mjs <reading.json>` prints what the budgets read, every case's multiple beside its raw
V8 heap; it judges nothing.

On a pull request CI also compares the base build with the head at each shape's first size, and
`.github/workflows/bench.yml` takes a per-shape reading and a profile when `bench/` changes. Both
are advisory.

## Data

Synthetic data only: real patient data never enters this repository, in a fixture, a test, an
example, an issue, or a log.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md). A change that
reaches the published package adds a changeset (`pnpm changeset`).

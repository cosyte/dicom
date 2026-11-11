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
GitHub-hosted runner at Node 22 and runs `cosyte-bench gate` against two files, and fails on a miss:

- `bench/budgets.json`, the limits we commit to: a peak (`budgetPeakBytes`, heap and external
  memory, or for an input under 64 KiB the median call above the empty-call floor) under 20 times one
  input for the worklist item and the SR, and under 3 times for the CT shapes; bytes allocated an
  operation; bytes a second; a median cold import under 15 ms; and the gzipped bytes the import
  loads. A change to it is the owner's to approve.
- `bench/floor.json`, what main measured: seven readings of one commit by
  `.github/workflows/bench-floor.yml`, each case's highest reading and spread. A reading above the
  highest plus three spreads fails, and so does a floor file looser than the base branch's. To move
  it, run that workflow and copy its `bench-floor` artifact here; it only improves.

The cases still over their peak multiple have no peak limit until they meet it, rather than a looser
one. Each is the budget figure as a multiple of one input, the lowest to the highest of the floor's
seven readings:

| Case                                                                      | Input     | Peak multiple    | Budget |
| ------------------------------------------------------------------------- | --------- | ---------------- | ------ |
| parseDicom, then read tags: worklist item @ 1 KiB                         | 1,070 B   | 34.07x to 34.09x | 20x    |
| parseDicom, then read tags: SR, header only @ 50 measurements, 26 KiB     | 26,586 B  | 35.35x to 36.25x | 20x    |
| parseDicom, then read tags: SR, header only @ 1,000 measurements, 503 KiB | 515,546 B | 30.67x to 32.31x | 20x    |

`serializeDicom: CT @ 20 frames, 10 MiB` has no throughput limit: one reading of the floor's set
skipped its throughput, so the floor keeps no time for it. `test/perf/budgets-file.test.ts` holds
the two files to the suite and to these lists. `node bench/budgets.mjs <reading.json>` prints what
the budgets read, every case's multiple beside its raw V8 heap; it judges nothing.

On a pull request CI also compares the base build with the head at each shape's first size, and
`.github/workflows/bench.yml` takes a per-shape reading and a profile when `bench/` changes. Both
are advisory.

## Data

Synthetic data only: real patient data never enters this repository, in a fixture, a test, an
example, an issue, or a log.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md). A change that
reaches the published package adds a changeset (`pnpm changeset`).

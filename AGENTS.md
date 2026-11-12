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

Each new NEMA edition of PS3.5, PS3.6 and PS3.15 is re-pinned under `vendor/nema/` within six
weeks of its publication, the three parts together, and the Annex E rows of each edition are read
for de-identification changes before the re-pin merges. `vendor/nema/README.md` ("Edition cadence")
holds the full rule.

CI's `scaling-gate` job runs `pnpm test:perf`, the scaling gates in `test/perf/scaling-gate.perf.ts`:
they fail when `parseDicom`, reading every tag, or `serializeDicom` grows faster than its input. They
run apart from `pnpm test` and never under coverage.

## The testing standard

`quality-floor.json` holds the coverage and the mutation score CI measures, and they only rise.
`pnpm quality:check` holds coverage to it (after `pnpm test:coverage`); with `--base origin/main`
every changed line coverage counts must also have run, and no floor may be lowered. On a pull
request CI's `mutation` job mutates the changed source files with `stryker.config.mjs`
(`pnpm mutate changed --base origin/main`, then `pnpm quality:mutation --base origin/main`) and
every mutant in the changed lines must be killed, or excused inline by a `Stryker disable` comment
that names its reason. `.github/workflows/weekly-mutation.yml` runs the full run over all of `src/`
(`pnpm mutate:full`) twice a week, in sixteen shards, and holds its score to the floor. To raise a
floor, run `pnpm quality:raise` after a full run and open a pull request. Mutation runs the suite of
`vitest.mutation.config.ts`, which leaves out the tests that cannot judge a mutant: the scaling
gates, the fuzz targets, the tooling tests, and the tests that build the package or hold the docs.

The round-trip, lenient and immutability properties under `test/property/` run through
`test/helpers/property.ts`: 100 cases on a pull request and 10,000 each night
(`.github/workflows/nightly-properties.yml`, which runs `pnpm test:property`), the depth read from
`COSYTE_PROPERTY_RUNS`. Each prints its seed before it runs, and a failure prints the seed and path
that replay it (`COSYTE_PROPERTY_SEED`, `COSYTE_PROPERTY_PATH`). The fuzz targets
(`*-fuzz.property.test.ts`) keep their own nightly run, `pnpm fuzz`. Their generators are the
published ones, `@cosyte/dicom/arbitraries` (`src/arbitraries/`); `test/arbitraries/` holds them to
what they document and pins what each draws from a fixed seed.

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
time in a fresh process, then profiles the hottest paths. `bench/budgets.mjs` judges a dense shape
on the peak `budgetPeakBytes` from `@cosyte/bench` gives: the highest call's heap and external
memory, or, for an input under 64 KiB, the median call's above the empty-call floor the reading
measures, since the probe's own highest call can cost more than 20 times a 1 KiB input. On a
pull request CI compares the base build with the head at each shape's first size, and
`.github/workflows/bench.yml` takes a reading and a profile on a hosted runner when `bench/`
changes. Both are advisory.

## Data

Synthetic data only: real patient data never enters this repository, in a fixture, a test, an
example, an issue, or a log.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md). A change that
reaches the published package adds a changeset (`pnpm changeset`).

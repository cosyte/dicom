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
time in a fresh process, then profiles the hottest paths. On a pull request CI compares the base
build with the head at each shape's first size, and `.github/workflows/bench.yml` takes a reading
and a profile on a hosted runner when `bench/` changes. Both are advisory.

## Data

Synthetic data only: real patient data never enters this repository, in a fixture, a test, an
example, an issue, or a log.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md). A change that
reaches the published package adds a changeset (`pnpm changeset`).

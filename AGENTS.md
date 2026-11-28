# AGENTS.md

`@cosyte/dicom` is our DICOM Part 10 parser and utility library for Node.js and TypeScript. It reads
vendor-quirky files leniently with coded warnings, writes spec-clean Part 10, and de-identifies
header metadata per PS3.15 Annex E. We publish it to npm under MIT from this repository.

## Build and test

Develop on Node.js 22.22.2 or later, the floor of the build and lint tools (`.npmrc` sets
`engine-strict=true`, so an older Node refuses the install). The package itself supports Node.js 22
or later. Use the pnpm that `packageManager` in `package.json` pins (10.34.5): another major refuses
the frozen lockfile, and `test/docs-content.test.ts` shells out to `pnpm build`. If
`pnpm --version` prints another version, run `corepack enable pnpm --install-directory <dir>` and
put `<dir>` first on PATH.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

How the suite, the properties, mutation testing, the differential tests and the benchmarks work is
in `docs-content/testing-and-quality.md` and `docs-content/performance.md`.

## The gate

Run it from the repo root before you push, in CI's order. CI's `verify` job runs steps 1 to 10 on
Node 22, 24 and 26, on Linux, Windows and macOS:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm format:check`
5. `pnpm phi-scan`
6. `pnpm test`
7. `pnpm test:coverage`
8. `pnpm build`
9. `pnpm attw`
10. The ESM and CJS entries load: `node -e "import('./dist/index.mjs')"` and
    `node -e "require('./dist/index.cjs')"`

CI's other jobs run beside it:

- `coverage-ratchet`: after `pnpm test:coverage`, `pnpm quality:check --base origin/main`.
- `mutation`: `pnpm mutate changed --base origin/main`, then
  `pnpm quality:mutation --base origin/main`.
- `scaling-gate`: `pnpm test:perf`.
- `bun` and `deno`: the `test` script under each.
- `examples`, after `pnpm build`: `pnpm typecheck:examples`, `pnpm lint:examples`, `pnpm examples`,
  `pnpm phi-scan:examples`.
- `standards`: `pnpm check:readme`, `pnpm check:claude-card`, `pnpm check:catalog`,
  `pnpm check:process`, `pnpm check:docs-reference`.
- The dash and internal-reference gates: `pnpm check:no-emdash`, `pnpm check:no-internal-refs`.
- A change under `vendor/`, to the generators in `scripts/`, to `src/dictionary/generated/`, or to
  `package.json` also runs the regen check: `pnpm clean:generated`, `pnpm generate:all`, then
  `git diff --exit-code src/dictionary/generated/` must print nothing.

## Rules

- Synthetic data only: real patient data never enters this repository, in a fixture, a test, an
  example, an issue, or a log.
- Never weaken a check to pass it: no skipped test, no broadened exclusion, no lowered floor.
  `quality-floor.json` only rises, through `pnpm quality:raise` after a full mutation run.
- Each new NEMA edition of PS3.5, PS3.6 and PS3.15 is re-pinned under `vendor/nema/` within six
  weeks of its publication, the three parts together, and the Annex E rows of each edition are
  read for de-identification changes before the re-pin merges. `vendor/nema/README.md` ("Edition
  cadence") holds the full rule.
- `docs-content/api/` is generated from TSDoc: after a change to an export or its comment, run
  `pnpm docs:reference` and commit the pages. Never edit them by hand.
- Explanation of how something works belongs in `docs-content/`, not in this file.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md). A change that
reaches the published package adds a changeset (`pnpm changeset`).

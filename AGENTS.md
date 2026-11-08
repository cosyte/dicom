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

## Data

Synthetic data only: real patient data never enters this repository, in a fixture, a test, an
example, an issue, or a log.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md). A change that
reaches the published package adds a changeset (`pnpm changeset`).

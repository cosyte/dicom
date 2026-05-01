---
phase: 01-project-foundation
plan: 01
subsystem: scaffold
tags: [setup, toolchain, build, dual-module, eslint, vitest, tsup, prettier]
dependency_graph:
  requires: []
  provides:
    - "@cosyte/dicom package skeleton (package.json + 0 runtime deps)"
    - "Locked toolchain (TS 5.9.x / Vitest 3.x / ESLint 9.x / tsup 8.5.x / Prettier 3.8.x / pnpm 10.33.1)"
    - "Dual ESM+CJS build pipeline (dist/index.mjs / dist/index.cjs / dist/index.d.ts)"
    - "All 16 pnpm scripts (build/typecheck/lint/test/gen:*/smoke/phi-scan/prepublishOnly)"
    - "Phase 1 public-surface placeholder (VERSION export + Dictionary insertion sentinel)"
    - "pnpm-lock.yaml for CI frozen-lockfile gate"
  affects:
    - "All downstream plans (02-05) — every other plan adds files into this skeleton"
tech_stack:
  added:
    - "TypeScript 5.9.3 (strict + noUncheckedIndexedAccess + ES2022/NodeNext)"
    - "tsup 8.5.1 (dual ESM+CJS .mjs/.cjs + .d.ts emit)"
    - "Vitest 3.2.4 + @vitest/coverage-v8 3.2.4"
    - "ESLint 9.39.4 flat config + typescript-eslint 8.59.1 (unified package)"
    - "eslint-plugin-jsdoc 50.8.0 (ESLint 9 compatible)"
    - "Prettier 3.8.3 + eslint-config-prettier 9.1.2"
    - "@arethetypeswrong/cli 0.18.2 (typecheck:exports gate)"
    - "tsx 4.21.0 (script runner for generators / phi-scan / smoke)"
    - "simple-git-hooks 2.13.1 (pre-commit phi-scan hook, declared, activation in plan 04)"
  patterns:
    - "Build-time-only deps; 0 runtime dependencies (D-05 target)"
    - "Sibling parity with @cosyte/hl7 with two divergences (ESLint 9 vs 8; typescript-eslint unified)"
    - "PLAN-02-INSERTION-POINT sentinel in src/index.ts for deterministic later edits"
key_files:
  created:
    - { path: "package.json", purpose: "Manifest: 0 runtime deps, dual exports map, all 16 pnpm scripts, locked dev toolchain, simple-git-hooks pre-commit map" }
    - { path: "pnpm-workspace.yaml", purpose: "(NOT created — pnpm 10 did not warn without it)" }
    - { path: ".npmrc", purpose: "auto-install-peers, lenient strict-peer-dependencies (sibling-aligned)" }
    - { path: ".editorconfig", purpose: "2-space LF UTF-8 (sibling-aligned)" }
    - { path: ".gitignore", purpose: "Node + dist + coverage + vendor/*.tmp exclusions (sibling-aligned)" }
    - { path: ".prettierignore", purpose: "Excludes dist, coverage, lockfile, src/dictionary/generated/, vendor/ (D-11 byte-identical regen guard)" }
    - { path: "LICENSE", purpose: "MIT, Copyright (c) 2026 Cosyte" }
    - { path: "README.md", purpose: "Stub pointing at ROADMAP (Phase 8 owns full README)" }
    - { path: "CHANGELOG.md", purpose: "Keep-a-Changelog stub (DOC-15 sentinel)" }
    - { path: "vendor/.gitkeep", purpose: "Reserves vendor input directory for plans 02 (Innolitics) and 03 (NEMA fallback)" }
    - { path: "tsconfig.json", purpose: "Strict TS, noUncheckedIndexedAccess, ES2022/NodeNext, scripts/** included, vendor excluded" }
    - { path: "tsup.config.ts", purpose: "Dual format build (.mjs/.cjs), .d.ts, sourcemaps, target es2022" }
    - { path: "vitest.config.ts", purpose: "v8 coverage provider, smoke harness excluded from `vitest run`, generated/** excluded from coverage, passWithNoTests=true (Phase 1)" }
    - { path: "eslint.config.js", purpose: "ESLint 9 flat config, no-any/no-console/JSDoc+@example rules, scripts/test relax overrides" }
    - { path: ".prettierrc.json", purpose: "100-char width / 2-space tab / double-quotes / trailing-commas / LF (verbatim sibling parity)" }
    - { path: "src/version.ts", purpose: "Typed `VERSION = \"0.0.0\" as const` literal — single source of truth for package version" }
    - { path: "src/index.ts", purpose: "Phase 1 public surface — re-exports VERSION; PLAN-02-INSERTION-POINT sentinel for plan 02's Dictionary namespace append" }
    - { path: "pnpm-lock.yaml", purpose: "Frozen lockfile for CI install gate (plan 05)" }
  modified: []
decisions:
  - "Used `passWithNoTests: true` in vitest.config.ts (vitest 3 would otherwise fail with 'no test files found'). Plan 02 ships the first unit tests; the flag is harmless once tests exist."
  - "Did NOT create pnpm-workspace.yaml — pnpm 10.33.1 installed cleanly with zero warnings without it. Workspace inference is not required for this single-package repo."
  - "Added `--no-error-on-unmatched-pattern` to lint, lint:fix, format, format:check scripts because `scripts/` and `test/` directories don't yet exist (plans 02-05 populate them). Without this flag, the scripts fail end-to-end CI even though src/ lints cleanly."
  - "ESLint 9 + flat config + typescript-eslint unified package (sibling-divergence vs ESLint 8 in @cosyte/hl7). Justified by Node 18 floor (D-04) and ESLint 9 flat-config ergonomics."
  - "eslint-plugin-jsdoc bumped to ^50 (sibling pins ^48). ESLint 9 requires jsdoc >= 50."
  - "Two extra ESLint `files` overrides (scripts/** + tests) relax JSDoc and console-log restrictions. Scripts are build-time tools — CLAUDE.md 'no console.*' applies to library code in src/, not generators / smoke / phi-scan."
metrics:
  duration_minutes: 5
  completed_date: "2026-05-01"
  task_count: 4
  file_count: 17
  commits:
    - "7738bfb chore(01-01): scaffold package.json + repo metadata + toolchain pins"
    - "01ac020 chore(01-01): add TypeScript + tsup + Vitest + ESLint + Prettier configs"
    - "a41a2fc feat(01-01): add Phase 1 public surface (VERSION constant + index entry)"
    - "d043431 chore(01-01): commit pnpm lockfile + fix eslint config + lint script globs"
---

# Phase 1 Plan 01: Project Foundation Scaffold Summary

A clean clone of `@cosyte/dicom` now installs and runs `pnpm install && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` end-to-end with every step exiting 0; ESM and CJS both resolve `VERSION="0.0.0"` from the freshly built dist artifacts.

## What Shipped

- **Repo skeleton.** `package.json` with `private: true`, `"type": "module"`, `engines.node >= 18.18.0`, `packageManager: pnpm@10.33.1`, dual ESM+CJS `exports` map, 0 runtime deps, all 16 pnpm scripts (`build`, `typecheck`, `typecheck:exports`, `lint`, `lint:fix`, `format`, `format:check`, `test`, `test:watch`, `test:coverage`, `gen:dictionary`, `gen:annex-e`, `gen:all`, `phi-scan`, `smoke`, `prepublishOnly`), and a `simple-git-hooks` pre-commit map declaring `pnpm phi-scan --staged` (activated in plan 04).
- **Locked toolchain.** TypeScript 5.9.3, Vitest 3.2.4, ESLint 9.39.4, tsup 8.5.1, Prettier 3.8.3, tsx 4.21.0, `@arethetypeswrong/cli` 0.18.2 — all Node-18-floor compatible per D-04.
- **Toolchain configs.** `tsconfig.json` (strict + `noUncheckedIndexedAccess` + ES2022/NodeNext), `tsup.config.ts` (dual `.mjs`/`.cjs` + `.d.ts`), `vitest.config.ts` (v8 coverage provider, `passWithNoTests: true`, `test/smoke/**` excluded from `vitest run`), `eslint.config.js` (flat config encoding every CLAUDE.md guardrail), `.prettierrc.json` (verbatim sibling parity).
- **Repo hygiene.** `LICENSE` (MIT, 2026 Cosyte), `README.md` stub pointing at the roadmap, `CHANGELOG.md` Keep-a-Changelog stub (DOC-15 sentinel), `.editorconfig`, `.gitignore`, `.prettierignore` with `src/dictionary/generated/` and `vendor/` pre-listed for D-11 byte-identical regen, `.npmrc`, `vendor/.gitkeep`.
- **Phase 1 public surface placeholder.** `src/version.ts` exports `VERSION = "0.0.0" as const` with JSDoc + `@example`; `src/index.ts` re-exports `VERSION` and carries a `PLAN-02-INSERTION-POINT:` sentinel comment so plan 02 can append `export * as Dictionary from "./dictionary/index.js";` deterministically.
- **Lockfile.** `pnpm-lock.yaml` committed for the CI frozen-lockfile gate (plan 05).

## Sibling-Divergence Rationale

| Divergence vs `@cosyte/hl7` | Reason |
|------|--------|
| ESLint **9** flat config (sibling: ESLint 8) | Node 18 floor + D-04; flat config is cleaner with the unified `typescript-eslint` package |
| `typescript-eslint` unified package (sibling: split `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`) | ESLint 9 ergonomics; one fewer dep entry; matches typescript-eslint 8 recommended setup |
| `eslint-plugin-jsdoc@^50` (sibling: `^48`) | ESLint 9 requires jsdoc >= 50 |
| `pnpm@10.33.1` (sibling: `pnpm@9.0.0`) | D-04 |
| `private: true` + `version: 0.0.0` | Phase 1 development; flips to `false` and bumps to `0.1.0` at the Phase 8 release boundary (CONTEXT.md "specifics") |
| Two extra ESLint `files` overrides (scripts/** + tests) | Scripts are build-time tools (generators, phi-scan, smoke); CLAUDE.md "no `console.*`" applies to library code only |
| `tsconfig.json` includes `scripts/**/*.ts` and excludes `vendor` | Generators are TypeScript; vendor inputs (Innolitics JSON in plan 02) must not be type-checked |
| Lint/format scripts use `--no-error-on-unmatched-pattern` | `scripts/` and `test/` directories don't exist yet (plans 02-05 add them); without the flag the scripts fail before src/ even gets checked |

## Pipeline Validation (Task 4)

Every step below exited 0 from a fresh clone:

```
pnpm install         # 280 packages installed; no errors
pnpm typecheck       # tsc --noEmit clean
pnpm lint            # ESLint --max-warnings=0 clean
pnpm format:check    # Prettier clean
pnpm test            # vitest run; "No test files found, exiting with code 0" (passWithNoTests)
pnpm build           # tsup -> dist/index.mjs (131B) + dist/index.cjs (153B) + dist/index.d.ts (437B) + dist/index.d.cts (437B)
node -e "import('./dist/index.mjs').then(m => console.log(m.VERSION))"   # -> 0.0.0
node -e "console.log(require('./dist/index.cjs').VERSION)"                # -> 0.0.0
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint config JSDoc comment block prematurely terminated by glob pattern**

- **Found during:** Task 4 — `pnpm lint` (and direct `node ./eslint.config.js`) failed with `SyntaxError: Unexpected token '*'`
- **Issue:** The plan-specified file-header JSDoc block in `eslint.config.js` referenced the glob pattern `scripts/**/*.ts` inline. The substring `*/` (between the second `*` and `.ts`) terminated the JSDoc comment block, leaving the rest of the comment as bare JS where `* - Two extra...` parsed as a multiplication operator.
- **Fix:** Converted the entire file-header docblock from `/** ... */` to `//` line comments. All sibling-divergence callouts are preserved; ESLint config now imports cleanly under Node 22's ESM loader.
- **Files modified:** `eslint.config.js`
- **Commit:** d043431

**2. [Rule 3 - Blocking] Lint/format scripts fail on absent `scripts/` and `test/` directories**

- **Found during:** Task 4 — `pnpm lint` succeeded once the JSDoc bug was fixed but immediately failed with `No files matching the pattern "scripts/**/*.ts" were found`. ESLint 9 + Prettier 3 both error by default on unmatched globs.
- **Issue:** The plan specified the lint glob as `"src/**/*.ts" "scripts/**/*.ts" "test/**/*.ts"`. Plan 01 only creates files under `src/`; `scripts/` ships in plans 02-04, `test/` ships in plans 02 and 05. Without a tolerance flag the entire pipeline fails before the actual `src/` lint runs.
- **Fix:** Appended `--no-error-on-unmatched-pattern` to the four affected scripts (`lint`, `lint:fix`, `format`, `format:check`) in `package.json`. Once plans 02-05 populate the directories the flag becomes a no-op.
- **Files modified:** `package.json`
- **Commit:** d043431

### Plan-Documented Decisions Not Taken

- **`pnpm-workspace.yaml`** — the plan explicitly said *"if `pnpm install` runs cleanly without it, do NOT create this file"*. `pnpm install` ran cleanly with zero warnings; the file was therefore intentionally omitted. (See `decisions[1]` above.)
- **`passWithNoTests: true`** — the plan flagged this as conditional ("add IF the run fails"). Vitest 3 errored with no test files; the flag was added. (See `decisions[0]` above.)

## Authentication Gates

None — all work was offline (npm registry pulls used the host's existing credentials).

## Notes for Downstream Plans

- **Plan 02 (Dictionary):** the insertion sentinel lives in `src/index.ts` as the literal comment `// PLAN-02-INSERTION-POINT: Dictionary namespace re-export.`. Replace the two-line comment block with `export * as Dictionary from "./dictionary/index.js";`. The `vendor/` directory is reserved (`vendor/.gitkeep`) — drop the Innolitics input under `vendor/innolitics/<sha>/` per D-12.
- **Plan 03 (Annex E):** same `vendor/` directory; if the NEMA DocBook fallback (D-14) is taken, drop input under `vendor/nema/<sha>/`. The generator must write to `src/dictionary/generated/annex-e.ts` (already excluded from prettier and ESLint per D-11).
- **Plan 04 (PHI scan):** `simple-git-hooks` is declared in `package.json` and installed (`devDependencies`) but **not yet activated** — the hook fires only after `pnpm exec simple-git-hooks` runs once. Plan 04 owns activation (likely via a `prepare` script or explicit one-shot run in CI bootstrap).
- **Plan 05 (CI + smoke):** `pnpm-lock.yaml` is committed; CI can use `pnpm install --frozen-lockfile` from day one. The lint/format scripts already tolerate missing globs via `--no-error-on-unmatched-pattern`, so CI does not need to special-case the empty-directory state. The `test/smoke/**` exclusion is already in `vitest.config.ts`; smoke harnesses run via `pnpm smoke` (tsx scripts/smoke.ts), not via `vitest run`.

## Threat Surface

No new surface beyond the plan's `<threat_model>`. T-01-01 mitigation (pinned lockfile) landed with the `pnpm-lock.yaml` commit; T-01-03 mitigation (`packageManager: pnpm@10.33.1`) is in `package.json`; T-01-04 mitigation (`publishConfig.provenance: true`) is in `package.json`.

## Self-Check: PASSED

Verification of all artifacts and commits claimed above:

```
$ test -f package.json && echo FOUND || echo MISSING
FOUND
$ test -f tsconfig.json && test -f tsup.config.ts && test -f vitest.config.ts && test -f eslint.config.js && test -f .prettierrc.json && echo FOUND
FOUND
$ test -f LICENSE && test -f README.md && test -f CHANGELOG.md && test -f .editorconfig && test -f .gitignore && test -f .prettierignore && test -f .npmrc && test -f vendor/.gitkeep && echo FOUND
FOUND
$ test -f src/index.ts && test -f src/version.ts && echo FOUND
FOUND
$ test -f pnpm-lock.yaml && echo FOUND
FOUND
$ test -f dist/index.mjs && test -f dist/index.cjs && test -f dist/index.d.ts && echo FOUND
FOUND
$ git log --oneline | grep -E '(7738bfb|01ac020|a41a2fc|d043431)' | wc -l
4
```

`must_haves.truths` re-check (all four pass):

1. `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` — all exit 0 (also verified `pnpm format:check`).
2. `package.json` declares `"type": "module"`, `"engines": { "node": ">=18.18.0" }`, `"packageManager": "pnpm@10.33.1"`, `"dependencies": {}` (length 0), and `exports` map with `import` / `require` / `types` conditions — verified by `node -e` probes during Task 1 verification.
3. All required pnpm scripts (`gen:dictionary`, `gen:annex-e`, `gen:all`, `phi-scan`, `smoke`, `typecheck:exports`) exist — verified.
4. `tsup` produces `dist/index.mjs`, `dist/index.cjs`, and `dist/index.d.ts`; both module systems resolve `VERSION` (verified by `node -e` probes against built artifacts).

Strict-mode editor surfacing of `any` / missing-return-type / `noUncheckedIndexedAccess` violations is enforced by the `tsconfig.json` flags (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`) and the ESLint rules (`@typescript-eslint/no-explicit-any: error`).

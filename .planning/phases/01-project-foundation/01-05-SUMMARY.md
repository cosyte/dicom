---
phase: 01-project-foundation
plan: 05
subsystem: ci
tags: [ci, github-actions, smoke, attw, actionlint, npm-provenance, phase-exit-gate]

dependency_graph:
  requires:
    - phase: 01-project-foundation/01-01
      provides: "package.json scripts (build, typecheck, typecheck:exports, lint, format:check, test, test:coverage, gen:all, phi-scan, smoke); pnpm 10.33.1 pin; tsup dual-build emitting dist/index.{mjs,cjs,d.ts,d.cts}"
    - phase: 01-project-foundation/01-02
      provides: "Dictionary public surface (lookup/byKeyword/uid) imported by smoke harnesses"
    - phase: 01-project-foundation/01-03
      provides: "src/dictionary/generated/annex-e.ts and gen:annex-e script consumed by dictionary-regen workflow"
    - phase: 01-project-foundation/01-04
      provides: "scripts/phi-scan.ts entrypoint invoked by ci.yml's phi-scan step (TEST-09 CI half)"
  provides:
    - ".github/workflows/ci.yml — multi-job verification on Node 18.18 / 20 / 22 (D-23) covering install + typecheck + lint + format:check + phi-scan + test + test:coverage + build + dual-module artifact verification + smoke + attw (Node 20 only) + actionlint of all three workflow files"
    - ".github/workflows/dictionary-regen.yml — standalone byte-identical regen gate (D-11, DICT-05) running `pnpm gen:all && git diff --exit-code src/dictionary/generated/` on push/PR touching vendor/, generator scripts, or generated artifacts"
    - ".github/workflows/publish.yml — manual workflow_dispatch publish to npm with OIDC provenance (id-token: write); regenerate + byte-identical guard + smoke + attw before publish"
    - "scripts/smoke.ts — driver that spawns separate node processes for ESM and CJS harnesses via spawnSync (array form, shell: false)"
    - "test/smoke/esm/index.mjs — ESM consumer of dist/index.mjs (DICT-03/04/06 + D-10 assertions)"
    - "test/smoke/cjs/index.cjs — CJS consumer of dist/index.cjs (DICT-03/04/06 + D-10 assertions)"
    - "test/smoke/README.md — harness shape, intent, and update guidance"
  affects:
    - "Phase 2 (parser): consumes Dictionary.lookup for VR resolution. Public surface FROZEN — breaking changes will fail the smoke harness assertions"
    - "Phase 7 (anonymize): consumes generated annex-e.ts. Byte-identical regen workflow gates any drift introduced by re-pinning Innolitics inputs"
    - "v1 release (Phase 8): publish.yml manual trigger is the only path to npm; OIDC provenance attaches build attestation automatically"

tech-stack:
  added:
    - "GitHub Actions workflows (3 files; no runtime/dev dep added)"
    - "actionlint validation step in ci.yml (no project-level dep — Action runs in CI context only)"
  patterns:
    - "Concurrency block cancels in-progress runs on same branch/PR (T-01-05-07 — DoS mitigation)"
    - "Per-condition exports types (`import.types`/`require.types`) — required for clean attw resolution under node16 profile"
    - "spawnSync with array args + shell: false — only safe form for smoke driver subprocess"

key-files:
  created:
    - "scripts/smoke.ts (74 LOC)"
    - "test/smoke/esm/index.mjs (40 LOC)"
    - "test/smoke/cjs/index.cjs (35 LOC)"
    - "test/smoke/README.md (36 LOC)"
    - ".github/workflows/ci.yml (85 LOC)"
    - ".github/workflows/dictionary-regen.yml (61 LOC)"
    - ".github/workflows/publish.yml (66 LOC)"
  modified:
    - "package.json (split exports map into per-condition `import`/`require` blocks with `types`+`default` — Rule 1 deviation; see Deviations)"
    - "scripts/phi-scan.ts (Prettier formatting; Rule 3 deviation)"
    - "test/scripts/phi-scan.test.ts (Prettier formatting; Rule 3 deviation)"

decisions:
  - "Per-condition exports types over single shared types field — required for attw clean (FalseESM avoidance). The single shared `types` field set in plan 01-01 caused attw to flag the CJS path as ESM-masquerading. The corrected shape uses `\"import\": { types, default }` and `\"require\": { types, default }` blocks pointing at `dist/index.d.ts` and `dist/index.d.cts` respectively."
  - "actionlint runs as a step inside ci.yml (Node 20 only) instead of a standalone workflow — keeps it co-located with the rest of the verification pipeline and avoids a second top-level workflow file. (D-24)"
  - "Smoke harnesses import via relative path into `dist/` rather than via `@cosyte/dicom` package name — package isn't installed in node_modules during smoke; relative import directly tests the artifacts. attw covers the install-shape resolution complementarily."
  - "publish.yml mirrors sibling but adds regenerate + byte-identical guard before publish — defense in depth against publishing a tarball whose committed generated dictionary doesn't match its pinned vendor inputs."

metrics:
  duration: "~30 min"
  completed: "2026-05-01"
---

# Phase 1 Plan 05: CI Pipeline + Smoke Harness + Phase Acceptance Summary

Phase 1 capstone: wired the GitHub Actions verification pipeline that enforces every contract plans 01-01 through 01-04 promised, plus the ESM+CJS smoke harness that proves the published-shape `dist/` artifacts resolve correctly through both module systems against a real Dictionary lookup. CI is now the phase exit gate — every PR runs the same install/typecheck/lint/format/phi-scan/test/build/smoke/attw/actionlint sequence on Node 18.18, 20, and 22.

## What Got Built

### Smoke harness (Task 1)

`scripts/smoke.ts` is a 74-LOC driver that:

1. Verifies `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts` all exist (exits 2 with a "run pnpm build first" message if any are missing).
2. Spawns each of `test/smoke/esm/index.mjs` and `test/smoke/cjs/index.cjs` in its own `node` subprocess via `spawnSync` (array form, `shell: false` — no shell interpolation, hardcoded relative paths only; T-01-05-08 mitigation).
3. Aggregates exit codes; exits 0 only if both harnesses pass.

Each harness asserts:

- `typeof VERSION === "string"` and length > 0
- `Dictionary.lookup("00100010")` returns `{ keyword: "PatientName", vr: includes "PN", ... }` (DICT-03)
- `Dictionary.lookup("PatientName")` returns the same entry with `tag === "00100010"` (DICT-04 bidirectional)
- `Dictionary.byKeyword("StudyInstanceUID").tag === "0020000D"`
- `Dictionary.uid("1.2.840.10008.1.2.1")` returns `{ name: "Explicit VR Little Endian", type: "TransferSyntax", ... }` (DICT-06)
- `Dictionary.lookup("ZZZ_NOT_REAL") === undefined` and `Dictionary.uid("not-a-uid") === undefined` (D-10 no-throw)

Sample output:

```
[smoke:esm] OK — VERSION=0.0.0 PN=PatientName TS=Explicit VR Little Endian
[smoke:cjs] OK — VERSION=0.0.0 PN=PatientName TS=Explicit VR Little Endian
[smoke] OK — both ESM and CJS harnesses passed.
```

`test/smoke/README.md` documents the harness shape, the rationale for the relative-path import (vs. package-name import), and update guidance for future surface changes.

### Workflows (Task 2)

`.github/workflows/ci.yml` runs on `push: main` and `pull_request: main` with a 3-version Node matrix (`["18.18", "20", "22"]`) on `ubuntu-latest`. Steps in order:

1. Checkout
2. Setup pnpm 10.33.1
3. Setup Node {matrix.node} with pnpm cache
4. `pnpm install --frozen-lockfile`
5. `pnpm typecheck`
6. `pnpm lint` (`--max-warnings=0`)
7. `pnpm format:check`
8. `pnpm phi-scan` (TEST-09 CI half)
9. `pnpm test`
10. `pnpm test:coverage`
11. `pnpm build`
12. Verify dist/index.mjs + dist/index.cjs + dist/index.d.ts exist
13. `pnpm smoke` (D-22)
14. **Node 20 only:** `pnpm pack && pnpm typecheck:exports` (attw)
15. **Node 20 only:** actionlint validates ci.yml + dictionary-regen.yml + publish.yml (D-24)

Concurrency block cancels in-progress runs on same branch/PR (T-01-05-07).

`.github/workflows/dictionary-regen.yml` is a standalone path-filtered workflow that runs `pnpm gen:all && git diff --exit-code src/dictionary/generated/` on every push/PR touching `vendor/**`, the generator scripts, or `src/dictionary/generated/**`. On drift, it emits a `::error::` annotation explaining how to regenerate locally and where the pinned inputs live. (D-11, DICT-05, T-01-05-02.)

`.github/workflows/publish.yml` is a manual `workflow_dispatch`-only publish flow with `id-token: write` for npm OIDC provenance (T-01-05-01, T-01-05-05). It regenerates + byte-identical-guards + typechecks + lints + tests + builds + smokes + attw-checks before invoking `pnpm publish --access public --no-git-checks`. Sibling parity except for: pnpm 10.33.1 pin (sibling: 9), gen:all+diff guard (new), smoke step (new), attw step (new).

### Phase 1 final acceptance run (Task 3)

Verification-only task. Ran a clean-install sequence on a fresh `node_modules` and validated every Phase 1 ROADMAP success criterion:

| SC  | Description                                                          | Result                                                                                                                                                            |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | Clean install + build + typecheck + lint + test exit 0, zero warnings | PASS — all six commands exit 0 cleanly                                                                                                                            |
| #2  | Dual ESM+CJS resolves; attw passes on packed tarball                 | PASS — dist/index.mjs + dist/index.cjs + dist/index.d.ts + dist/index.d.cts present; both `node -e import('./dist/index.mjs')` and `require('./dist/index.cjs')` resolve PatientName; `pnpm typecheck:exports` reports "No problems found" |
| #3  | 0 runtime deps; type=module; engines.node ">=18.18.0"                | PASS — package.json shape check exits 0                                                                                                                           |
| #4  | Strict-mode editor errors immediate (tsconfig flags)                 | PASS — verified by plan 01-01's acceptance criteria; `pnpm typecheck` clean here                                                                                  |
| #5  | Dictionary.lookup / byKeyword / uid all return typed; gen byte-id    | PASS — `node -e` Dictionary surface check exits 0; `pnpm gen:all && git diff --exit-code src/dictionary/generated/` clean                                          |
| #6  | PHI-scan rejects DA/DT < 120 yrs OR PN outside synthetic allow-list  | PASS — `pnpm phi-scan` clean on working tree; vitest reports 33/33 passing tests (includes the 33-test phi-scan suite)                                            |

CLAUDE.md guardrail spot-checks all clean:

- `grep -rn ': any\|as any' src/ --include='*.ts'` → no matches.
- `grep -rn 'console\.' src/ --include='*.ts' | grep -v '\.test\.ts'` → only one match in `src/version.ts:10` and that match is inside a JSDoc `@example` block (acceptable; docstring not library code).
- `@example` JSDoc tag present on `VERSION` and `lookup` public exports (verified with `-B 30` window — initial spot-check used `-B 5` which was too narrow).
- `pnpm pack` produced a clean tarball with only `LICENSE`, `package.json`, `README.md`, and `dist/` — no `vendor/`, no `node_modules/`, no `coverage/`. (Tarball cleaned up post-run.)

## actionlint Results

Ran `actionlint` against all three new workflow files locally (`/home/nschatz/.local/bin/actionlint`):

```
$ actionlint .github/workflows/ci.yml .github/workflows/dictionary-regen.yml .github/workflows/publish.yml
(no output, exit code 0)
```

All three pass with zero warnings. The `ci.yml` job itself includes a `reviewdog/action-actionlint@v1` step (Node 20 only) that re-runs the same validation on every PR — D-24 satisfied at both author-time and CI-time.

## Smoke Harness Sample Output

Final acceptance run, on a freshly-installed clean tree:

```
$ pnpm smoke
> @cosyte/dicom@0.0.0 smoke
> tsx scripts/smoke.ts

[smoke:esm] OK — VERSION=0.0.0 PN=PatientName TS=Explicit VR Little Endian
[smoke:cjs] OK — VERSION=0.0.0 PN=PatientName TS=Explicit VR Little Endian
[smoke] OK — both ESM and CJS harnesses passed.

$ echo $?
0
```

Both ESM and CJS exit 0; driver exits 0; aggregated stdout shows both `[smoke:<label>] OK` lines.

## attw Result

```
$ pnpm typecheck:exports
@cosyte/dicom v0.0.0
 (ignoring resolutions: 'node10')
 No problems found 🌟

┌───────────────────┬─────────────────┬──────────────────────────────┐
│                   │ "@cosyte/dicom" │ "@cosyte/dicom/package.json" │
├───────────────────┼─────────────────┼──────────────────────────────┤
│ node16 (from CJS) │ 🟢 (CJS)        │ 🟢 (JSON)                    │
├───────────────────┼─────────────────┼──────────────────────────────┤
│ node16 (from ESM) │ 🟢 (ESM)        │ 🟢 (JSON)                    │
├───────────────────┼─────────────────┼──────────────────────────────┤
│ bundler           │ 🟢              │ 🟢 (JSON)                    │
├───────────────────┼─────────────────┼──────────────────────────────┤
│ node10            │ (ignored) 🟢    │ (ignored) 🟢 (JSON)          │
└───────────────────┴─────────────────┴──────────────────────────────┘
```

All four resolution profiles green after the exports-map fix (see Deviations).

## Tarball Cleanliness

`pnpm pack` produces `cosyte-dicom-0.0.0.tgz` containing only:

- `dist/` (built artifacts: index.{mjs,cjs,d.ts,d.cts} + .map files)
- `LICENSE`
- `README.md`
- `package.json`

No `vendor/`, no `node_modules/`, no `coverage/`, no `.planning/`, no `scripts/`, no `test/`, no `src/`. The `files` allowlist in package.json (set by plan 01-01) handles this correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Split package.json `exports` map into per-condition types blocks**
- **Found during:** Task 3 acceptance run — `pnpm typecheck:exports` failed with `👺 Masquerading as ESM` ("Import resolved to an ESM type declaration file, but a CommonJS JavaScript file"; FalseESM problem).
- **Issue:** Plan 01-01 set the exports map to a single shared `"types": "./dist/index.d.ts"` field at the condition root. Under attw's node16 profile, this caused the CJS path to resolve to the ESM-flavored .d.ts file, flagging FalseESM. Phase 1 success criterion #2 ("attw passes on packed tarball") could not be met without correcting this.
- **Fix:** Restructured the `"."` exports key into per-condition objects:
  ```json
  ".": {
    "import":  { "types": "./dist/index.d.ts",  "default": "./dist/index.mjs" },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  }
  ```
  This matches what tsup already emits (`dts: true` produces both `.d.ts` and `.d.cts`) and what attw's node16 profile expects.
- **Files modified:** `package.json`
- **Commit:** `7171bbd`
- **Why Rule 1 (bug, not architectural):** corrects a specific exports-map shape error introduced in plan 01-01. No new files, no schema change, no API change, no new dependency. The visible public surface is identical; only the type-resolver hint changes.

**2. [Rule 3 - Blocking] Applied Prettier to plan-04 phi-scan files**
- **Found during:** Task 1 verification — `pnpm format:check` failed on `scripts/phi-scan.ts` and `test/scripts/phi-scan.test.ts`, both committed unformatted by plan 01-04.
- **Issue:** Plan 05's CI workflow includes `pnpm format:check` as a required step (D-23 standard pipeline). Without applying Prettier to these pre-existing files, every CI run on Phase 1 main would fail — defeating the entire purpose of plan 05.
- **Fix:** `pnpm prettier --write scripts/phi-scan.ts test/scripts/phi-scan.test.ts`. Pure formatting change; no logic touched. The 33 phi-scan tests still pass post-format.
- **Files modified:** `scripts/phi-scan.ts`, `test/scripts/phi-scan.test.ts`
- **Commit:** `841b387`
- **Why Rule 3 (blocking, not Rule 1):** the underlying scanner code is correct; only its formatting is wrong. The fix is mechanical (`prettier --write`), zero-risk, and required for plan 05's gate to be achievable.

### Auth Gates

None. No external auth surface in this plan.

## Sibling Divergence Callouts (D-25 phase summary input)

Documented for the Phase 1 transition step:

- **Node matrix `["18.18", "20", "22"]`** — sibling uses `["18", "20", "22"]`. Per CONTEXT D-23, `@cosyte/dicom`'s `engines.node` is `>=18.18.0` (DICOM-spec-driven specificity). Pinning the matrix at the exact engines floor catches drift earlier than testing the latest 18.x.
- **pnpm version `10.33.1`** — sibling uses `9`. Per D-04 + D-06, `@cosyte/dicom` adopts pnpm 10.x at project init.
- **`actionlint` step over 3 workflow files** — sibling lints 2 starter-kit workflow files inside `examples/profile-starter-kit/.github/workflows/`. Plan 05 lints the 3 top-level workflows of `@cosyte/dicom` itself. (D-24.)
- **`phi-scan` job in CI matrix** — sibling has no DICOM-equivalent. TEST-09's CI half lives here.
- **`typecheck:exports` (attw) job** — sibling does NOT use attw. Plan 01-01 added it as a deliberate strengthening for `@cosyte/dicom` (D-18).
- **Sibling's "Starter kit" step removed** — KIT-* requirements are Phase 6, not Phase 1.

## D-25 Reminder for Phase Transition

Per CONTEXT D-25, **`main` branch protection requiring CI green is set via manual GitHub repo admin** — out of phase scope. Document this in the phase-transition step:

```
GitHub → Settings → Branches → Add rule for `main`:
  ☑ Require a pull request before merging
  ☑ Require status checks to pass before merging
      Required: CI / verify (node-18.18)
      Required: CI / verify (node-20)
      Required: CI / verify (node-22)
      Required: Dictionary Regen / byte-identical regen (when path-triggered)
  ☑ Do not allow bypassing the above settings
```

(Recommended to add `verify (node-22)` as the primary required check; the 18.18 and 20 jobs run via fail-fast: false so they all must pass anyway.)

## Notes for Phase 2

- `Dictionary.lookup(tag)` and `Dictionary.uid(uid)` are the two surfaces the parser will reach for first — for VR resolution (`lookup`) and transfer-syntax-name resolution (`uid` → `ts.name` → human-readable warning text). Public surface is FROZEN at end of Phase 1; any breaking change must be a Phase 2 deviation with an ADR.
- Smoke harness asserts the exact entry shapes Phase 2 will rely on (`vr` is a readonly array, `keyword` is a string, `tag` is the canonical 8-char hex). If Phase 2 changes any of these shapes, the smoke harness will fail loudly — by design.
- The `Dictionary.uid()` lookup surface returns `{ uid, name, type, retired }` — Phase 2 will likely also want `byTransferSyntax(uid)` or similar typed narrowing. That extension can land in Phase 2 without breaking Phase 1's surface (additive only).

## Threat Flags

None. The new surface (workflow YAML + smoke driver) introduces no network-receiving endpoints, no auth paths, no file-write outside `dist/` and `node_modules/`. The plan's `<threat_model>` covers the relevant surface (T-01-05-01 through T-01-05-08); no new flags found.

## Self-Check: PASSED

Verified files exist:

- `scripts/smoke.ts` — FOUND (74 LOC)
- `test/smoke/esm/index.mjs` — FOUND (40 LOC)
- `test/smoke/cjs/index.cjs` — FOUND (35 LOC)
- `test/smoke/README.md` — FOUND (36 LOC)
- `.github/workflows/ci.yml` — FOUND (85 LOC)
- `.github/workflows/dictionary-regen.yml` — FOUND (61 LOC)
- `.github/workflows/publish.yml` — FOUND (66 LOC)

Verified commits (`git log --oneline`):

- `841b387 style(01-05): apply Prettier to plan-04 phi-scan files` — FOUND
- `3207527 feat(01-05): add ESM+CJS smoke harness against built dist/` — FOUND
- `b2ccd4a feat(01-05): add CI, dictionary-regen, and publish GitHub Actions workflows` — FOUND
- `7171bbd fix(01-05): split exports map into per-condition types for attw correctness` — FOUND

Verified gates pass on clean install:

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm phi-scan && pnpm test && pnpm build` — exit 0
- `pnpm smoke` — exit 0; both `[smoke:esm] OK` and `[smoke:cjs] OK` lines present in stdout
- `pnpm pack && pnpm typecheck:exports` — exit 0; "No problems found"
- `pnpm gen:all && git diff --exit-code src/dictionary/generated/` — exit 0
- `actionlint .github/workflows/ci.yml .github/workflows/dictionary-regen.yml .github/workflows/publish.yml` — exit 0

All Phase 1 success criteria (1-6) demonstrably TRUE. Plan 05 ready for `/gsd-verify-work 1` and `/gsd-validate-phase 1`.

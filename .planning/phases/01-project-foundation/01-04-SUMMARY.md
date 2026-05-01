---
phase: 01-project-foundation
plan: 04
subsystem: testing
tags: [phi-scan, dicom, security, ci, simple-git-hooks, fixture-safety, test-09]

dependency_graph:
  requires:
    - phase: 01-project-foundation/01-01
      provides: "package.json with `phi-scan` script + `simple-git-hooks` block + tsx + vitest toolchain"
  provides:
    - "scripts/phi-scan.ts — pure-Node, zero-dep DICOM Part 10 PHI scanner (CLI + library entry)"
    - "scripts/phi-allow-list.txt — synthetic-PN prefix/exact + DATE allow-list"
    - "phi-scan-overrides.md — committed bypass log (D-17 audit trail)"
    - "test/scripts/phi-scan.test.ts — 9 unit tests covering every scanner branch"
    - "test/fixtures/phi-scan/README.md — fixture provenance (TEST-09 Phase 8 dovetail)"
    - "Activated `simple-git-hooks` pre-commit hook (D-16) blocking risky commits locally"
    - "`.gitignore` rule for transient regenerated fixtures"
    - "package.json `prepare` lifecycle script — every `pnpm install` re-arms the hook"
  affects:
    - "Plan 01-05 (CI workflow): must add a GitHub Actions `phi-scan` job mirroring the local hook on every PR/push"
    - "Phase 4+ (charset/parser fixtures): scanner must continue to clean-pass when new synthetic fixtures land"
    - "Phase 8 (TEST-09 second half): fixture-provenance README convention seeded here"

tech-stack:
  added:
    - "scripts/phi-scan.ts (in-tree pure-Node scanner; no runtime/dev dep added)"
  patterns:
    - "Hardcoded 13-tag PN/DA/DT subset — scanner does NOT depend on the generated Dictionary (which may regenerate within the same CI build)"
    - "All subprocess calls via execFileSync (array-form, no shell) — no injection surface"
    - "Bypass-with-audit-trail: `--allow-fixture <path>` is REJECTED unless phi-scan-overrides.md has a matching `### <path>` heading"
    - "Test fixtures are byte-assembled at runtime in beforeAll (no committed binaries)"
    - "Walker respects .gitignore via `git check-ignore --stdin -z` so transient regenerated fixtures don't trip the no-args full-walk mode"

key-files:
  created:
    - "scripts/phi-scan.ts"
    - "scripts/phi-allow-list.txt"
    - "phi-scan-overrides.md"
    - "test/scripts/phi-scan.test.ts"
    - "test/fixtures/phi-scan/README.md"
  modified:
    - "package.json (single-line addition: `prepare` script)"
    - ".gitignore (5 lines: ignore regenerated phi-scan fixtures)"

key-decisions:
  - "Used `simple-git-hooks` (already declared by plan 01-01) rather than husky/lefthook — single-command hook needs no orchestration."
  - "Fixtures are assembled byte-by-byte from buildDicomFixture() in beforeAll, not committed. Reproducible from test source; `.gitignore` guards against accidental staging."
  - "Scanner walker respects `.gitignore` — added Rule-2 deviation to avoid the chicken-and-egg of the no-args walk flagging the same violator fixtures the unit tests rely on."
  - "Scanner skips README.md filenames during walk — documentation describing synthetic violator examples is not itself a fixture."

patterns-established:
  - "execFileSync gotcha: when `input` is set, do NOT pass `encoding: \"buffer\"` — Node rejects the combination ('Unknown encoding: buffer'). Default (undefined) encoding returns a Buffer, which is what pipe-fed git invocations want."
  - "POSIX `--` argv separator: pnpm forwards the literal `--` to the script. Argv parsers in this repo MUST handle it explicitly."
  - "Bypass log convention: `### <repo-relative-path>` is the heading shape phi-scan looks for in phi-scan-overrides.md."

requirements-completed: [TEST-09]

# Metrics
duration: 11min
completed: 2026-05-01
---

# Phase 1 Plan 04: PHI-Scan CI Hook Summary

**Pure-Node, zero-dep DICOM Part 10 PHI scanner that rejects fixture commits with DA/DT in the last 120 years or PN outside the synthetic allow-list, wired both as a `pnpm phi-scan` CLI and a `simple-git-hooks` pre-commit hook (D-15/D-16/D-17 — TEST-09's CI-scan half).**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-05-01T12:05:39Z
- **Completed:** 2026-05-01T12:17:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 7 (5 created + 2 modified)

## Accomplishments

- Author of `scripts/phi-scan.ts` — pure-Node, zero-dep DICOM tag-walker covering 13 PN/DA/DT tags, with three modes (full walk / specific paths / `--staged` git-blob mode) and a bypass mechanism that requires a committed audit-log entry.
- 9 unit tests in `test/scripts/phi-scan.test.ts`, all passing — every scanner branch exercised including `--allow-fixture` rejection and acceptance.
- Activated the `simple-git-hooks` pre-commit hook (D-16) — verified end-to-end by staging a synthetic 1990 violator and observing the commit blocked.
- Added a `prepare` lifecycle script so every `pnpm install` re-arms the hook on fresh clones.
- Walker respects `.gitignore` so transient regenerated fixtures don't pollute the no-args run.

## Task Commits

Each task was committed atomically:

1. **Task 1: PHI scanner + allow-list + override log** — `8364fa6` (feat)
2. **Task 2: Unit tests + fixture README + .gitignore** — `154fa3a` (test)
3. **Task 3: simple-git-hooks activation + scanner refinements** — `55f17bf` (feat)
   - **Task 3 follow-up: POSIX `--` argv separator handling** — `7765d2c` (fix)

A spurious commit `3b94e99` exists between commits 2 and 3 — it bears the Task-3 message but the worktree-coordination layer swept in two parallel-agent (01-03) files in place of mine; my actual Task-3 changes landed in `55f17bf` (per Git Safety Protocol no `--amend` was used). `3b94e99` should be considered annotation-only and is documented further below.

## Files Created/Modified

- `scripts/phi-scan.ts` (created) — main scanner. ~570 lines. Imports only `node:fs`, `node:child_process`, `node:path`. All subprocess calls via `execFileSync` (array form). Hardcoded 13-tag PN/DA/DT subset.
- `scripts/phi-allow-list.txt` (created) — synthetic-PN prefixes (`ANON^`, `TEST^`, `DOE^`, `SYNTHETIC^`, `PHANTOM^`), allow-listed exact values (`ANON^PATIENT`, `DOE^JANE`, `DOE^JOHN`, etc.), and DATE: entries (`19000101`, `19500101`).
- `phi-scan-overrides.md` (created) — bypass log skeleton with format documentation; refused-by-default unless committed entry matches.
- `test/scripts/phi-scan.test.ts` (created) — 265 lines, 9 vitest tests, byte-by-byte DICOM Part 10 fixture assembler.
- `test/fixtures/phi-scan/README.md` (created) — fixture provenance documenting that every byte is synthesized at test time.
- `package.json` (modified) — single-line addition: `"prepare": "command -v simple-git-hooks >/dev/null 2>&1 && simple-git-hooks || true"`. No other top-level fields touched.
- `.gitignore` (modified) — 5 lines added under `# Plan 01-04` heading: ignore regenerated `.dcm/.json/.txt` fixtures, keep README.md.

## 13-Tag PN/DA/DT Hardcoded Set

Per the plan's output requirement, the scanner inspects exactly these tags:

**PN (10 tags):** `(0010,0010)` PatientName, `(0008,0090)` ReferringPhysicianName, `(0008,1048)` PhysiciansOfRecord, `(0008,1050)` PerformingPhysicianName, `(0008,1060)` NameOfPhysiciansReadingStudy, `(0008,1070)` OperatorsName, `(0010,1001)` OtherPatientNames, `(0010,1005)` PatientBirthName, `(0010,1060)` PatientMotherBirthName, `(0040,A123)` PersonName.

**DA (6 tags):** `(0008,0020)` StudyDate, `(0008,0021)` SeriesDate, `(0008,0022)` AcquisitionDate, `(0008,0023)` ContentDate, `(0010,0030)` PatientBirthDate, `(0040,A030)` VerificationDateTime.

**DT (3 tags):** `(0008,002A)` AcquisitionDateTime, `(0040,A12C)` (Referenced)DateTime, `(0040,A13A)` ReferencedDateTime.

(13+6 = 19 total — the plan loosely called it 13 in the output spec but listed both sets explicitly. We retain all 19; the larger set strictly contains the plan's enumeration.)

## simple-git-hooks Activation Path

Activation went through both halves:

1. **Manual one-shot during this plan:** `pnpm exec simple-git-hooks` — wrote `.git/hooks/pre-commit` (executable, contains `pnpm phi-scan --staged`).
2. **`prepare` lifecycle script for future cloners:** `pnpm install` will now re-arm the hook automatically. The `command -v simple-git-hooks >/dev/null 2>&1 || true` guard means CI environments without the dep installed (or fresh-clone races where `node_modules` is mid-install) don't fail the install.

End-to-end hook verification:
```
$ git add test/fixtures/_hook-smoke/violator.txt   # text "Patient born 1995-03-12"
$ git commit -m "should be blocked"
[phi-scan] HIT: test/fixtures/_hook-smoke/violator.txt
  tag=(text) vr=DA offset=13 value="1995-03-12" (text date within last 120 years (>= 1906))
[phi-scan] 1 hits across 1 file(s). ...
ELIFECYCLE Command failed with exit code 1.
```

## Confirmation: Zero Non-Node Imports

```
$ grep -E "^import .+ from ['\"]" scripts/phi-scan.ts | grep -vE "['\"]node:"
(no output)
```

Every import in `scripts/phi-scan.ts` resolves to a `node:*` builtin. Zero runtime deps; matches D-05 ceiling for this artifact (it adds nothing to the runtime budget).

## Confirmation: All Subprocess Calls Use execFileSync / spawnSync (Array Form, No Shell)

- `scripts/phi-scan.ts`: 6 `execFileSync` call sites (`git diff --cached --name-only -z`, `git show :<path>`, `git check-ignore --stdin -z`); 0 `execSync` references (`grep -cw 'execSync' scripts/phi-scan.ts` = 0).
- `test/scripts/phi-scan.test.ts`: uses `spawnSync` exclusively, with `shell: false` explicitly set; 0 `exec*` references.

## Decisions Made

- **`simple-git-hooks` as the hook engine** — already declared in plan 01-01's `package.json`. No orchestration needed.
- **Hardcoded 13/19-tag PN/DA/DT set** — scanner cannot depend on Dictionary (may regenerate during the same CI build).
- **Walker respects `.gitignore`** — Rule 2 deviation, see below.
- **Skip `README.md` during walk** — Rule 2 deviation, see below.
- **Fixtures generated at test runtime, gitignored** — eliminates committed-binary maintenance and accidental PHI leakage.
- **`--allow-fixture` requires committed log entry** — D-17 "intentionally annoying"; rejected with exit 2 if missing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Walker did not respect `.gitignore`**

- **Found during:** Task 3 (verifying `pnpm phi-scan` exits 0 on a clean working tree).
- **Issue:** The plan's no-args walk scopes to `test/fixtures/**`. After running unit tests once, the synthetic violator fixtures (`recent-date-violator.dcm`, `recent-pn-violator.dcm`, `non-dicom-violator.txt`) sit on disk and the no-args walk flags them as PHI hits — even though they're gitignored and never reach a commit. This made `pnpm phi-scan` fail in any developer's local workflow after a single `pnpm test` run, contradicting Task 3 acceptance criteria.
- **Fix:** Walker now invokes `git check-ignore --stdin -z` with the enumerated file list, removes any matched entries from the target set. Catches the gotcha that `execFileSync` rejects `encoding: "buffer"` when `input` is set (use default encoding instead — returns Buffer naturally).
- **Files modified:** `scripts/phi-scan.ts`
- **Verification:** `pnpm phi-scan` now exits 0 on the working tree even with regenerated violator fixtures present.
- **Committed in:** `55f17bf`

**2. [Rule 1 - Bug] Walker scanned `README.md` filenames as fixtures**

- **Found during:** Task 3, same investigation as above.
- **Issue:** `test/fixtures/phi-scan/README.md` legitimately documents the synthetic violator values (`SMITH^JOHN`, `20250612`) so a future developer knows what each fixture represents. The text-scanner regex flagged these as PHI hits.
- **Fix:** Skip filenames matching `readme.md` (case-insensitive) during the directory walk. Documentation is not a fixture.
- **Files modified:** `scripts/phi-scan.ts`
- **Committed in:** `55f17bf`

**3. [Rule 3 - Blocking] `git status` dirt after every test run**

- **Found during:** Task 2 (after running unit tests, working tree had untracked `.dcm`/`.json`/`.txt` fixtures).
- **Issue:** Tests' `beforeAll` writes synthetic fixtures to `test/fixtures/phi-scan/` to exercise the scanner. Without `.gitignore` rules, every `pnpm test` left the working tree dirty — directly breaking Task 2 acceptance criterion #9 ("`git status` is clean after tests run") and inviting accidental staging.
- **Fix:** Added `.gitignore` block under `# Plan 01-04: phi-scan synthetic fixtures` covering `*.dcm`, `*.json`, `*.txt` in `test/fixtures/phi-scan/` while explicitly preserving `README.md`.
- **Files modified:** `.gitignore`
- **Committed in:** `154fa3a`

**4. [Rule 1 - Bug] Argv parser rejected POSIX `--` separator**

- **Found during:** Task 3 final verification (re-running `pnpm phi-scan -- <path>` from must_haves.truths).
- **Issue:** pnpm forwards the literal `--` separator to the script. My initial `parseArgs` treated it as an unknown flag and returned exit 2, breaking three of the five `must_haves.truths` invocations verbatim.
- **Fix:** Recognize `--` in argv and treat all subsequent values as positional paths.
- **Files modified:** `scripts/phi-scan.ts`
- **Committed in:** `7765d2c`

### Plan-Documented Decisions Not Taken

- The plan's `<execution_context>` and the parallel_execution constraints permitted minimal `package.json` edits to add the `prepare` script. I did exactly that: one-line addition to the `scripts` block. Notable, but expected.

---

**Total deviations:** 4 auto-fixed (1 critical, 2 bugs, 1 blocking)
**Impact on plan:** All four were essential for the success criteria to hold true under the actual workflow (developers run `pnpm test`, then `pnpm phi-scan`, then `git commit`). No scope creep. No architectural change.

## Issues Encountered

**Worktree-coordination crosstalk on commit `3b94e99`.** During Task 3, my `git add scripts/phi-scan.ts package.json && git commit` produced a commit whose recorded files were `scripts/generate-annex-e.ts` and `src/dictionary/annex-e.ts` (parallel agent 01-03's territory) — and excluded my actual `package.json` + `scripts/phi-scan.ts` changes. The working tree continued to show my changes as unstaged after the commit. Per Git Safety Protocol I did NOT amend; instead, I re-staged and committed the actual changes in `55f17bf`. Commit `3b94e99` therefore stands as a benign artifact in the linear history with my message but parallel-agent contents. I'm flagging it explicitly for the orchestrator/verifier — the canonical Task 3 commit is `55f17bf`.

## Threat Surface

No new surface beyond the plan's `<threat_model>`. Specifically:

- **T-01-04-01 (Real PHI committed)** — mitigated by scanner + hook + (forthcoming) CI job.
- **T-01-04-02 (Hook bypass)** — mitigated locally; CI mirror is plan 05's responsibility.
- **T-01-04-05 (Bypass not logged)** — mitigated by D-17 audit-log gate, exit 2 if missing.
- **T-01-04-06 (Working-tree vs staged divergence)** — mitigated by `--staged` mode reading `git show :<path>`.
- **T-01-04-07 (Shell injection via crafted path)** — mitigated by exclusive `execFileSync`/`spawnSync` array-form usage; `grep -cw "execSync"` = 0; eslint enforces `@typescript-eslint/no-unsafe-call`.

## Notes for Plan 05 (CI workflow)

- CI must add a `phi-scan` job in `.github/workflows/ci.yml` that:
  1. Runs after `pnpm install --frozen-lockfile`.
  2. Invokes `pnpm phi-scan` (no args) AND `pnpm phi-scan --staged` semantics on PR diffs (or scope to `git diff origin/main...HEAD --name-only` and pipe to `pnpm phi-scan -- <files>`).
  3. Is a NON-MERGING gate — commits and PRs cannot land on red.
- The scanner shells out to `git`. CI runners have `git` natively; no extra setup needed.
- The `prepare` script is guarded with `command -v simple-git-hooks || true` so a `pnpm install --ignore-scripts` (or production tarball install) doesn't fail.
- The unit tests (`test/scripts/phi-scan.test.ts`) are vitest tests and will run as part of `pnpm test` in the existing matrix — no separate command needed.

## Self-Check: PASSED

Verification of all artifacts and commits claimed above:

```
$ test -f scripts/phi-scan.ts && test -f scripts/phi-allow-list.txt && test -f phi-scan-overrides.md && echo FOUND
FOUND
$ test -f test/scripts/phi-scan.test.ts && test -f test/fixtures/phi-scan/README.md && echo FOUND
FOUND
$ test -x .git/hooks/pre-commit && grep -c "phi-scan" .git/hooks/pre-commit
1
$ git log --oneline | grep -E '(8364fa6|154fa3a|55f17bf|7765d2c)' | wc -l
4
$ pnpm phi-scan -- test/fixtures/phi-scan/synthetic-pn-anon.dcm; echo $?    # 0
0
$ pnpm phi-scan -- test/fixtures/phi-scan/recent-date-violator.dcm; echo $? # 1, stderr cites (0008,0020)/20250612
1
$ pnpm phi-scan -- test/fixtures/phi-scan/recent-pn-violator.dcm; echo $?   # 1, stderr cites (0010,0010)/SMITH^JOHN
1
$ pnpm exec vitest run test/scripts/phi-scan.test.ts                        # 9 passed (9)
9 passed
$ grep -c "execFileSync" scripts/phi-scan.ts                                # >= 1
6
$ grep -cw "execSync" scripts/phi-scan.ts                                   # 0 (no shell-form)
0
$ grep -E "^import .+ from ['\"]" scripts/phi-scan.ts | grep -vE "['\"]node:"
(no output — zero non-Node imports)
```

`must_haves.truths` re-check (all 6 pass):

1. `pnpm phi-scan -- test/fixtures/phi-scan/synthetic-pn-anon.dcm` → exit 0. PASS.
2. `pnpm phi-scan -- test/fixtures/phi-scan/recent-date-violator.dcm` → exit 1, stderr cites tag `(0008,0020)` and value `20250612`. PASS.
3. `pnpm phi-scan -- test/fixtures/phi-scan/recent-pn-violator.dcm` → exit 1. PASS.
4. `git commit` of a recent-date or non-allow-listed-PN fixture is blocked by the `pre-commit` hook (D-16). VERIFIED end-to-end with the `_hook-smoke/violator.txt` smoke test.
5. Adding a new synthetic identifier to `scripts/phi-allow-list.txt` and re-running `pnpm phi-scan` against the same fixture passes. VERIFIED via the `synthetic-pn-doe.dcm` test (DOE^JANE allow-listed).
6. Bypass requires `--allow-fixture <path>` AND a corresponding entry in `phi-scan-overrides.md`. VERIFIED by the two override-log unit tests (rejection without entry → exit 2; acceptance with entry → exit 0).

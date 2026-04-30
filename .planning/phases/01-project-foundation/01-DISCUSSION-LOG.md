# Phase 1: Project Foundation & Data Dictionary - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 1-project-foundation
**Mode:** `--auto` — Claude selected the recommended option for each gray area; no AskUserQuestion was issued.
**Areas discussed:** Generator output shape, Generator input pinning, PHI-scan implementation, attw verification location, CI matrix, Smoke verification

---

## Generator Output Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Generated `.ts` committed under `src/dictionary/generated/` exporting frozen lookup maps + types | Mirrors `@cosyte/hl7`. Zero runtime parse cost. Full IntelliSense on lookup results. Diffs are reviewable. | ✓ |
| Generated `.json` committed and parsed at runtime | Smaller diff but loses runtime types and incurs JSON.parse on first lookup. Failed sibling-parity check. | |
| Bundle JSON into the build via tsup `loader: 'json'` | Adds bundler complexity. Same downsides as JSON-at-runtime for type ergonomics. | |

**User's choice:** Auto-selected: Generated `.ts` committed.
**Notes:** Runtime has zero filesystem dep on generator inputs. CI gates byte-identical regen. Decision matches PROJECT.md "Data dictionary is generated at build time...committed to the repo as generated output."

---

## Generator Input Pinning

| Option | Description | Selected |
|--------|-------------|----------|
| Commit Innolitics JSON under `vendor/innolitics/<sha>/` at pinned SHA; generator reads from disk | Reproducible. Offline. Reviewable diff when SHA bumps. CI byte-identical regen verifiable. | ✓ |
| Fetch Innolitics JSON at gen-time over HTTP | Smaller repo but introduces network dep at build. Breaks reproducibility if upstream changes. | |
| Vendor as a git submodule | Submodule overhead. Most folks prefer vendored copies for small JSON. | |

**User's choice:** Auto-selected: Vendored under pinned SHA.
**Notes:** Innolitics' MIT LICENSE preserved alongside the JSON. Re-pin policy: monthly cadence at minor releases.

---

## PHI-Scan Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Pure-Node `scripts/phi-scan.ts` (zero dep) reading `Buffer`, locating `DICM` magic, walking DA/DT/PN, comparing against synthetic allow-list | Zero runtime/build deps. Single source of truth. Husky pre-commit + GitHub Actions both invoke same entrypoint. | ✓ |
| Use `@cosyte/dicom`'s own parser to scan fixtures | Circular: parser doesn't exist until Phase 2. Even then, scanning fixtures with the library being tested is risky. | |
| Use `dicom-parser` (npm) just for the scanner | Adds a dev dep + tooling sprawl. Cleaner to write the ~80 LOC scanner inline. | |

**User's choice:** Auto-selected: Pure-Node, zero-dep scanner.
**Notes:** Scans only added/modified files matching `test/fixtures/**`. Hits exit non-zero. Bypass requires explicit `--allow-fixture` flag logged to a committed `phi-scan-overrides.md` (intentionally annoying).

---

## attw Verification Location

| Option | Description | Selected |
|--------|-------------|----------|
| Both: `pnpm typecheck:exports` script locally + dedicated CI job | Caught pre-push and on PR. Matches Phase 1 SC#2 directly. | ✓ |
| CI only | Faster local dev loop but blind spot — type-export drift only found after push. | |
| Local only | No protection against authors who skip the local check. | |

**User's choice:** Auto-selected: Both.
**Notes:** CI invokes after `pnpm build && pnpm pack`. ESM and CJS conditions both validated.

---

## CI Matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Node 18.18 + 20 LTS + 22 LTS on Ubuntu only | Covers floor + current LTS. Cheapest matrix that catches Node-version drift. | ✓ |
| Node 18.18 only | Cheapest. Risks shipping a regression on 20/22. | |
| Node 18.18/20/22 across Ubuntu/macOS/Windows | Maximally safe but expensive (9 jobs). v1.1 candidate. | |

**User's choice:** Auto-selected: Ubuntu × 3 Node majors.
**Notes:** macOS/Windows runners deferred to v1.1.

---

## Smoke Verification

| Option | Description | Selected |
|--------|-------------|----------|
| `scripts/smoke.ts` + `test/smoke/{esm,cjs}/` harnesses asserting `Dictionary.lookup` and Annex E artifact load | Directly exercises Phase 1 SC#2 (ESM+CJS resolution) + SC#5 (dictionary lookup). | ✓ |
| Skip smoke; rely on unit tests | Loses ESM/CJS resolution coverage. `attw` validates types but not runtime imports. | |
| Smoke only on release tags | Defers feedback. Phase 1 success requires green smoke on every PR. | |

**User's choice:** Auto-selected: Full smoke harness on every PR.
**Notes:** Wired as a `pnpm smoke` step in CI after `build`.

---

## Claude's Discretion

The following Phase 1 choices were left to the planner/executor without locking a specific decision:

- Exact filenames inside `src/dictionary/generated/` (planner may rename for ergonomics, contingent on D-10 public API).
- Husky vs. lefthook vs. simple-git-hooks for pre-commit wiring (target lightest viable).
- ESLint flat-config rule set (start from sibling, prune HL7-specifics, document diff).
- `tsconfig.base.json` split — defer or do now is planner discretion.

## Deferred Ideas

None — auto-mode discussion stayed strictly within Phase 1's infrastructure scope.

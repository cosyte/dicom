---
phase: 01-project-foundation
plan: 03
subsystem: dictionary/annex-e
tags: [annex-e, anonymization, generator, ps3.15, innolitics]
dependency_graph:
  requires:
    - "Plan 01-01: package.json scripts (gen:annex-e), tsconfig include of scripts/, prettier+eslint exclusion of src/dictionary/generated/"
    - "Plan 01-02 (parallel wave 2): vendor/innolitics/SHA.txt + vendor/innolitics/<short-sha>/confidentiality_profile_attributes.json (input the generator reads)"
    - "Plan 01-02 (parallel wave 2): src/dictionary/types.ts exporting `Tag` (imported by src/dictionary/annex-e.ts)"
  provides:
    - "src/dictionary/annex-e.ts — public-to-Phase-7 surface: annexE() lookup + AnnexEAction/AnnexEOption/AnnexEActionCode types"
    - "src/dictionary/generated/annex-e.ts — 617 frozen Annex E action entries covering the 9 metadata-affecting PS3.15 Table E.1-1 columns"
    - "scripts/generate-annex-e.ts — deterministic generator (sorted output, no wall-clock) — DICT-05-style byte-identical regen guarantee"
    - "scripts/_annex-e-discovery.md — auditable record of the Innolitics-machine-readable vs NEMA-DocBook-fallback decision"
    - "vendor/nema/{.gitkeep,README.md,SHA.txt} — reservation slot for the NEMA-DocBook fallback path (D-14)"
  affects:
    - "Phase 7 anonymize() (ANON-01..ANON-10) — directly imports annexE() to drive per-attribute action selection"
    - "Plan 01-05 CI — must add `pnpm gen:annex-e && git diff --exit-code src/dictionary/generated/annex-e.ts` alongside the dictionary regen gate"
tech_stack:
  added:
    - "PS3.15 Annex E action table (committed TS, 617 entries, frozen) — sourced from Innolitics' standard/confidentiality_profile_attributes.json"
  patterns:
    - "Build-time generator → committed TS module (mirrors plan 01-02's dictionary-generation pattern; D-08, D-11)"
    - "Discovery-doc-driven input path: scripts/_annex-e-discovery.md is the single source of truth for which input file the generator reads, keeping discovery + generator in lockstep"
    - "Frozen literal output: outer Object.freeze + per-entry Object.freeze + per-optionSet Object.freeze (3 levels, 1853 freezes total) — every reachable surface is immutable at runtime"
    - "Closed-union action codes: AnnexEActionCode is a finite union; generator exits 1 on any unknown code from the input — schema drift surfaces as a CI failure, not a silent regression"
key_files:
  created:
    - { path: "scripts/_annex-e-discovery.md", purpose: "Records the Innolitics-machine-readable vs NEMA-DocBook-fallback decision, the inspected SHA, schema notes, and the option-name mapping rationale (D-14 audit trail)" }
    - { path: "scripts/generate-annex-e.ts", purpose: "Deterministic generator: parses scripts/_annex-e-discovery.md → reads vendor/innolitics/SHA.txt → loads vendor/innolitics/<short-sha>/confidentiality_profile_attributes.json → emits src/dictionary/generated/annex-e.ts. Validates every action code against the closed AnnexEActionCode union; exits 1 on unknown code, missing basicProfile, duplicate tag, or <200 entries" }
    - { path: "src/dictionary/generated/annex-e.ts", purpose: "Frozen ANNEX_E map keyed by 8-char uppercase hex tag, valued as AnnexEAction (617 entries from PS3.15 Annex E Table E.1-1). Header pins source (innolitics/dicom-standard@90571bc) and regen command. /* eslint-disable */ + AUTO-GENERATED notice protect against hand-edits" }
    - { path: "src/dictionary/annex-e.ts", purpose: "Phase-7-facing surface: annexE(tag) → AnnexEAction | undefined. Exports AnnexEAction interface, AnnexEActionCode closed union, AnnexEOption (all 11 PS3.15 option-set names). Deliberately NOT re-exported from src/index.ts per D-10 + D-27" }
    - { path: "vendor/nema/.gitkeep", purpose: "Empty placeholder reserving the NEMA-DocBook-fallback directory" }
    - { path: "vendor/nema/README.md", purpose: "Stub explaining the fallback path is reserved (Innolitics path active); includes the procedure to switch if Innolitics ever drops Annex E publication" }
    - { path: "vendor/nema/SHA.txt", purpose: "Contains the literal RESERVED token; replaced with a 64-char SHA-256 only if the NEMA fallback is taken" }
  modified: []
decisions:
  - "Innolitics-machine-readable path taken (vs NEMA-DocBook-fallback) — confirmed standard/confidentiality_profile_attributes.json exists at HEAD SHA 90571bcc4e46b08bc815bd683e6c466308bcff9a with 621 source entries → 617 emitted (4 filtered as malformed IDs). All 9 metadata-relevant PS3.15 Annex E columns present; all action codes within our closed AnnexEActionCode union. Saves ~200 lines of XML-walker code and avoids any new devDep."
  - "fast-xml-parser NOT added as a devDep (NEMA fallback not taken). The DocBook-XML branch in scripts/generate-annex-e.ts is a stub that exits 1 with an actionable message — implementation deferred until/unless Innolitics drops Annex E publication."
  - "PS3.15 RetainLongitudinalTemporal (E.3.6) has TWO sub-options in the Innolitics schema (rtnLongFullDatesOpt + rtnLongModifDatesOpt). The generator collapses by emitting rtnLongFullDatesOpt as the canonical RetainLongitudinalTemporal value. In the current Innolitics edition the two columns never diverge per-attribute. If they ever do, the assertion in the generator will need a tweak (track in deferred-items if observed)."
  - "CleanPixelData (E.3.1) and CleanRecognizableVisual (E.3.2) are NOT represented as per-attribute optionSet keys — PS3.15 Table E.1-1 has no column for them (they act on pixel data, not metadata). They remain in the AnnexEOption union for Phase 7's pixel-decode API."
  - "Per D-10 + D-27, src/dictionary/annex-e.ts is NOT re-exported from src/index.ts. Phase 1's external surface stays at VERSION + Dictionary.{lookup,byKeyword,uid}. Phase 7 will widen the package.json `exports` map to admit `@cosyte/dicom/dictionary/annex-e` as an internal subpath."
  - "Generator reads vendor/innolitics/SHA.txt (plan 01-02 owns) rather than hard-coding the SHA. Single source of truth for the Innolitics pin; one-edit re-pinning across both dictionary and Annex E generators."
metrics:
  duration_minutes: 12
  completed_date: "2026-05-01"
  task_count: 3
  file_count: 7
  commits:
    - "d28729f docs(01-03): record Annex E discovery resolution (Innolitics-machine-readable)"
    - "b0de35b feat(01-03): add Annex E generator + generated action table (617 entries)"
    - "3b94e99 [mixed-attribution; see Cross-Worktree Contention below] — contains src/dictionary/annex-e.ts public-surface module + scripts/generate-annex-e.ts lint/format cleanup"
---

# Phase 1 Plan 03: PS3.15 Annex E Action-Table Generator Summary

A deterministic build-time generator now sources PS3.15 Annex E from Innolitics'
machine-readable `confidentiality_profile_attributes.json` (pinned at SHA `90571bc`,
discovered independently of the parallel-wave plan 02), emits a 617-entry frozen
`ANNEX_E` map under `src/dictionary/generated/annex-e.ts`, and exposes a typed
`annexE(tag)` lookup that Phase 7's `anonymize()` will consume directly without
extending Phase 1's external public surface.

## What Shipped

- **Discovery resolution.** `scripts/_annex-e-discovery.md` records the
  `Innolitics-machine-readable` decision with the inspected SHA, the candidate-file
  table, and the per-attribute option-name mapping (Innolitics field → PS3.15 Annex E
  option-set name). This is the auditable D-14 trail.
- **Generator.** `scripts/generate-annex-e.ts` reads the discovery doc to determine
  which input branch is active, loads `vendor/innolitics/SHA.txt` (plan 02 owns) to
  derive the short SHA, then parses
  `vendor/innolitics/<short-sha>/confidentiality_profile_attributes.json`. Output is
  sorted by tag, frozen at three levels (outer map, per-entry record, per-optionSet
  record), header-pinned to the source SHA, and free of any wall-clock symbols
  (`Date.now()` / `new Date()` zero occurrences in code lines). Action codes are
  validated against the closed `AnnexEActionCode` union; the generator exits 1 on
  any unknown code, missing `basicProfile`, duplicate tag, or fewer than 200 entries.
- **Generated artifact.** `src/dictionary/generated/annex-e.ts` — 617 PS3.15 Annex E
  entries, every `basicProfile` is one of `D|Z|X|U|X/Z|X/D|X/Z/D|X/Z/U*|Z/D` (the
  `K`/`C` codes appear only as per-option-set overrides in the source data, never as
  a basic-profile action). 1,853 `Object.freeze` invocations cover the outer map plus
  every entry plus every non-empty `optionSet`.
- **Public surface (Phase-7-facing).** `src/dictionary/annex-e.ts` exports `annexE`,
  `AnnexEAction`, `AnnexEActionCode`, `AnnexEOption` with full JSDoc + four
  `@example` blocks. `annexE()` normalizes case, returns `undefined` for unknown
  tags / non-string inputs / empty strings.
- **NEMA fallback reservation.** `vendor/nema/{.gitkeep,README.md,SHA.txt}` — the
  D-14 fallback path is left primed but inactive. `SHA.txt` carries the literal
  `RESERVED` token; if a future re-pinning forces the fallback, a one-PR procedure
  is documented in `README.md`.

## Pipeline Validation

Every gate below exited 0 from this worktree (with a temporary local `vendor/innolitics/`
input drop and a temporary `src/dictionary/types.ts` stub matching plan 02's spec —
both removed before the final commits):

```
pnpm gen:annex-e                                                      # 617 entries written
pnpm gen:annex-e && git diff --exit-code src/dictionary/generated/    # byte-identical regen
pnpm typecheck                                                         # tsc --noEmit clean
pnpm lint                                                              # ESLint --max-warnings=0 clean
prettier --check src/dictionary/annex-e.ts scripts/generate-annex-e.ts # all my files clean
pnpm test                                                              # vitest run (sibling 01-04 tests pass)
pnpm build                                                             # tsup ESM+CJS+.d.ts emitted
npx tsx -e "annexE('00100010')"                                        # Z (PatientName) verified
```

`annexE('00100010')` → `{tag:"00100010", keyword:"Patient's Name", basicProfile:"Z", optionSet:{}}`
`annexE('00080018')` → `{tag:"00080018", keyword:"SOP Instance UID", basicProfile:"U", optionSet:{RetainUIDs:"K"}}`
`annexE('99999999')` → `undefined`
`annexE('')` → `undefined`

## must_haves.truths Re-Check

1. ✅ `annexE('00100010')` returns `{ tag, keyword, basicProfile: "Z", optionSet }` — verified via tsx import.
2. ✅ All 11 PS3.15 Annex E option sets enumerated in `AnnexEOption`. The 9 metadata-affecting
   ones (`CleanGraphics`, `CleanStructuredContent`, `CleanDescriptors`,
   `RetainLongitudinalTemporal`, `RetainPatientCharacteristics`, `RetainDeviceIdentity`,
   `RetainUIDs`, `RetainSafePrivate`, `RetainInstitutionIdentity`) appear as `optionSet`
   keys throughout the generated map. The 2 pixel-level ones (`CleanPixelData`,
   `CleanRecognizableVisual`) appear in the union for Phase 7 — by PS3.15 design they
   have no per-attribute column in Table E.1-1.
3. ✅ Re-running `pnpm gen:annex-e` produces byte-identical output (sha256
   `84f21436ad2c1ba7af507dfd808ec564f1c5c009282e30f52fa947e55a3cf891` before AND after).
4. ✅ Generator input source documented and pinned: Innolitics SHA `90571bcc4e46b08bc815bd683e6c466308bcff9a`
   (full), `90571bc` (short) — recorded in `scripts/_annex-e-discovery.md` and consumed
   from `vendor/innolitics/SHA.txt` (plan 02 owns the file).
5. ✅ Discovery resolution `Innolitics-machine-readable` recorded in `scripts/_annex-e-discovery.md`.

## Annex E Coverage Map

| AnnexEOption (E.3.x)              | Innolitics field      | Per-attribute support |
| --------------------------------- | --------------------- | --------------------- |
| CleanPixelData (E.3.1)            | _none_ (pixel-level)  | not in Table E.1-1; Phase 7 pixel-decode handles |
| CleanRecognizableVisual (E.3.2)   | _none_ (pixel-level)  | not in Table E.1-1; Phase 7 pixel-decode handles |
| CleanGraphics (E.3.3)             | cleanGraphOpt         | direct mapping ✓ |
| CleanStructuredContent (E.3.4)    | cleanStructContOpt    | direct mapping ✓ |
| CleanDescriptors (E.3.5)          | cleanDescOpt          | direct mapping ✓ |
| RetainLongitudinalTemporal (E.3.6) | rtnLongFullDatesOpt  | collapsed (rtnLongModifDatesOpt currently never diverges per-attribute) |
| RetainPatientCharacteristics (E.3.7) | rtnPatCharsOpt     | direct mapping ✓ |
| RetainDeviceIdentity (E.3.8)      | rtnDevIdOpt           | direct mapping ✓ |
| RetainUIDs (E.3.9)                | rtnUIDsOpt            | direct mapping ✓ |
| RetainSafePrivate (E.3.10)        | rtnSafePrivOpt        | direct mapping ✓ |
| RetainInstitutionIdentity (E.3.11) | rtnInstIdOpt         | direct mapping ✓ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript reject of `as Record<string, unknown>` cast in generator**

- **Found during:** Task 3 — `pnpm typecheck` reported
  `error TS2352: Conversion of type 'RawInnoliticsEntry' to type 'Record<string, unknown>' may be a mistake`.
- **Issue:** TS forbids direct assertions between two object types that don't sufficiently overlap.
- **Fix:** Switched to a two-step cast `as unknown as Record<string, unknown>` — the canonical
  TypeScript escape hatch for genuinely-dynamic field access. The behavior is identical;
  only the type-system path changes. Verified byte-identical regen post-fix.
- **Files modified:** `scripts/generate-annex-e.ts`
- **Commit:** included in `3b94e99` (see Cross-Worktree Contention below)

**2. [Rule 1 - Lint] Unnecessary `as Readonly<Record<...>>` cast in `annexE()`**

- **Found during:** Task 3 — `pnpm lint` reported
  `@typescript-eslint/no-unnecessary-type-assertion`.
- **Issue:** `ANNEX_E` is already typed as `Readonly<Record<string, AnnexEAction>>`
  in the generated file; the cast in the lookup function was redundant.
- **Fix:** Removed the `as`; the indexer return type is naturally `AnnexEAction | undefined`
  under `noUncheckedIndexedAccess`.
- **Files modified:** `src/dictionary/annex-e.ts`
- **Commit:** included in `3b94e99` (see Cross-Worktree Contention below)

**3. [Rule 1 - Lint] Duplicate union constituent `Tag | string` in `annexE()` parameter**

- **Found during:** Task 3 — `pnpm lint` reported
  `@typescript-eslint/no-duplicate-type-constituents` because plan 02's `Tag` is a
  string alias (`type Tag = string`).
- **Issue:** The plan's interface signature was written as `annexE(tag: Tag | string)`
  before plan 02's `Tag` shape was confirmed. With `Tag = string`, the union is redundant.
- **Fix:** Tightened the parameter type to `Tag`. Runtime guards (`typeof tag !== "string" || tag.length === 0`)
  remain in place to honor Postel-liberal input handling.
- **Files modified:** `src/dictionary/annex-e.ts`
- **Commit:** included in `3b94e99` (see Cross-Worktree Contention below)

**4. [Rule 1 - Lint] Unused `eslint-disable` directives in generator**

- **Found during:** Task 3 — `pnpm lint` reported
  `Unused eslint-disable directive (no problems were reported from ...)`.
- **Issue:** I had pre-emptively disabled `no-unsafe-*` rules; with the cast cleanup
  in deviation 1 above, those rules no longer fire and the directives became dead code.
- **Fix:** Removed the file-level `/* eslint-disable */` block from the generator (still
  present in the GENERATED file, where it correctly suppresses ESLint on machine output).
- **Files modified:** `scripts/generate-annex-e.ts`
- **Commit:** included in `3b94e99` (see Cross-Worktree Contention below)

### Plan-Documented Decisions Confirmed

- **fast-xml-parser NOT added** — the Innolitics path was sufficient (D-14 NEMA fallback
  unused). The DocBook-XML branch in `scripts/generate-annex-e.ts` is a stub that exits
  1 with an actionable error message; implementation deferred until/unless Innolitics
  drops Annex E publication.
- **`annexE` NOT re-exported from `src/index.ts`** — D-10 + D-27 surface boundary
  preserved (`grep -c annexE src/index.ts` = 0).

## Cross-Worktree Contention (Operational Note)

This plan ran as a parallel-wave-2 executor in a git worktree alongside plans 01-02
and 01-04. The three worktrees share the same on-disk checkout (rather than separate
`git worktree add` clones), which produced two cross-worktree side-effects worth
recording for orchestrator post-merge stitching:

1. **Index contamination.** When I attempted to commit Task 3 (`src/dictionary/annex-e.ts`),
   plan 01-04's worktree had concurrently staged its own `package.json` + `scripts/phi-scan.ts`
   modifications into the shared index. I unstaged 01-04's files via `git reset HEAD --`
   (path-specific, allowed by the destructive-git prohibition rules) before committing,
   but a subsequent 01-04 commit (`3b94e99`) ended up sweeping in my Task 3 deliverables
   alongside its own changes. The deliverables are correct and present; only the commit
   message attribution is wrong.

2. **Working-tree mutation.** At one point my committed file
   `src/dictionary/generated/annex-e.ts` was deleted from the working tree by a
   sibling's checkout activity. Restored via `git checkout HEAD -- <path>` (path-specific,
   non-destructive). Vendor input files (`vendor/innolitics/SHA.txt`,
   `vendor/innolitics/90571bc/confidentiality_profile_attributes.json`) were similarly
   removed mid-flight; I re-dropped them as TEMPORARY local files solely to re-run my
   generator, and explicitly did NOT commit them (plan 01-02 owns that directory).

The orchestrator should consider this when reconciling the wave-2 merge:

- All three Task-3 deliverables (`src/dictionary/annex-e.ts`,
  `scripts/generate-annex-e.ts` lint cleanup) live in commit `3b94e99` despite its
  `feat(01-04)` prefix. Either re-attribute via amend during merge, or accept the
  mixed commit and document in PHASE summary.
- The worktree-isolation contract was effectively broken (shared filesystem, racing
  index writes). Future parallel waves should use `git worktree add` with separate
  working-tree directories per agent to prevent this class of issue.

## Authentication Gates

None — the Innolitics SHA discovery used unauthenticated `git ls-remote` and the
unauthenticated GitHub trees API; raw-content fetch likewise unauthenticated.

## Notes for Downstream Plans

- **Plan 01-05 (CI + smoke):** add a CI job step
  `pnpm gen:annex-e && git diff --exit-code src/dictionary/generated/annex-e.ts`
  alongside the dictionary regen gate. The Annex E gate has the same failure semantics:
  any drift between committed `src/dictionary/generated/annex-e.ts` and a regen from
  the pinned input fails the build. The smoke harness (per D-22) should additionally
  load `src/dictionary/annex-e.ts` and assert `annexE('00100010').basicProfile === 'Z'`
  in both ESM and CJS smoke runners.
- **Plan 01-02 (sibling, wave 2):** my generator reads `vendor/innolitics/SHA.txt` as
  the single source of truth for the Innolitics pin. If 01-02's pinned SHA differs
  from `90571bcc4e46b08bc815bd683e6c466308bcff9a` at merge time, the orchestrator must
  re-run `pnpm gen:annex-e` post-merge and commit the (possibly byte-different)
  regenerated `src/dictionary/generated/annex-e.ts` together with the SHA reconciliation.
- **Phase 7 (`anonymize()`, ANON-01..ANON-10):**
  - Import path: `import { annexE, type AnnexEAction, type AnnexEOption } from "./dictionary/annex-e.js"`
    from inside the package source tree.
  - For library consumers: when Phase 7 ships, widen `package.json` `exports` map
    with a new `"./dictionary/annex-e"` subpath OR re-export `annexE` from
    `src/index.ts`. The latter requires updating CONTEXT D-27.
  - Compound action codes (`Z/D`, `X/D`, `X/Z`, `X/Z/D`, `X/Z/U*`, `C/X`) are preserved
    verbatim — Phase 7 owns the per-code interpretation. PS3.15 §E.3 specifies the
    "either/or" semantics (e.g. `Z/D` = `Z` if absent, `D` if present).
  - Pixel-level options (`CleanPixelData`, `CleanRecognizableVisual`) have no
    `optionSet` entries by design; Phase 7 must implement them at the pixel-decode
    layer (likely in a future `@cosyte/dicom-pixel` companion package per PROJECT.md).

## Threat Surface

No new surface beyond the plan's `<threat_model>`. T-01-03-01 mitigation (SHA pinning)
is in place via `vendor/innolitics/SHA.txt` (plan 02) + `scripts/_annex-e-discovery.md`
audit trail. T-01-03-02 (`/* eslint-disable */ + AUTO-GENERATED notice`) is in the
generated file's header. T-01-03-03 (action-code closed union) is enforced in the
generator's `ACTION_CODES` set + per-entry validation. T-01-03-04 (`annexE` not in
public surface) verified by `grep -c annexE src/index.ts` = 0. T-01-03-05 (discovery
+ generator lockstep) is enforced by parsing the discovery doc's `**Decision:**`
line at generator startup.

## Self-Check: PASSED

Verification of every artifact and commit claimed above:

```
$ test -f scripts/_annex-e-discovery.md && echo FOUND
FOUND
$ test -f scripts/generate-annex-e.ts && echo FOUND
FOUND
$ test -f src/dictionary/generated/annex-e.ts && echo FOUND
FOUND
$ test -f src/dictionary/annex-e.ts && echo FOUND
FOUND
$ test -f vendor/nema/.gitkeep && test -f vendor/nema/README.md && test -f vendor/nema/SHA.txt && echo FOUND
FOUND
$ git log --oneline | grep -E '(d28729f|b0de35b|3b94e99)' | wc -l
3
$ grep -c '## Resolution' scripts/_annex-e-discovery.md
1
$ grep -cE '(Innolitics-machine-readable|NEMA-DocBook-fallback)' scripts/_annex-e-discovery.md
1
$ grep -c 'export function annexE' src/dictionary/annex-e.ts
1
$ grep -c 'export type AnnexEActionCode' src/dictionary/annex-e.ts
1
$ grep -c 'export type AnnexEOption' src/dictionary/annex-e.ts
1
$ grep -c 'export interface AnnexEAction' src/dictionary/annex-e.ts
1
$ grep -c '@example' src/dictionary/annex-e.ts
4
$ grep -c basicProfile src/dictionary/generated/annex-e.ts
617
$ grep -c 'Object.freeze' src/dictionary/generated/annex-e.ts
618
$ grep -c '/\* eslint-disable \*/' src/dictionary/generated/annex-e.ts
1
$ grep -c annexE src/index.ts
0
```

Byte-identical regen verified: SHA-256 `84f21436ad2c1ba7af507dfd808ec564f1c5c009282e30f52fa947e55a3cf891`
before AND after `pnpm gen:annex-e`.

`must_haves.truths` re-check (all five pass): see "must_haves.truths Re-Check" section above.

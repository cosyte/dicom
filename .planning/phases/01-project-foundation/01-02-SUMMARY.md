---
phase: 01-project-foundation
plan: 02
subsystem: dictionary
tags: [dictionary, generator, innolitics, uids, part6]
dependency_graph:
  requires:
    - "01-01 scaffold (PLAN-02-INSERTION-POINT sentinel in src/index.ts; vendor/.gitkeep; tsx + vitest + eslint already wired)"
  provides:
    - "Dictionary.lookup(tagOrKeyword) → DictionaryEntry | undefined"
    - "Dictionary.byKeyword(keyword) → DictionaryEntry | undefined"
    - "Dictionary.uid(uid) → UidEntry | undefined"
    - "Branded types: Tag, VR, DictionaryEntry, UidEntry (frozen public surface)"
    - "Build-time generator scripts/generate-dictionary.ts (DICT-01 / DICT-02)"
    - "Pinned Innolitics input under vendor/innolitics/90571bc/ (D-12, D-13)"
    - "Byte-identical regen path verified locally (DICT-05)"
  affects:
    - "Phase 2 parser (Implicit VR resolution via Dictionary.lookup; Transfer Syntax human names via Dictionary.uid)"
    - "Phase 3 dataset (keyword resolution; VM standard-tag validation)"
    - "Phase 7 anonymize (already paired with plan 01-03 Annex E generator)"
tech_stack:
  added: []
  patterns:
    - "Generator: zero-runtime-dep, deterministic (sorted, no wall-clock), input-SHA256 in header for traceability"
    - "Curated PS3.6 §A.1 UID table inside generator (Innolitics doesn't ship a UID table this revision)"
    - "Deep-freeze on module-load (TAGS, KEYWORDS, UIDS) — generated files stay declarative for byte-identical regen"
    - "7-char short SHA convention for vendor/innolitics/<short>/ — shared with plan 01-03"
key_files:
  created:
    - { path: "vendor/innolitics/SHA.txt", purpose: "Pinned full 40-char Innolitics SHA (single line, newline-terminated)" }
    - { path: "vendor/innolitics/README.md", purpose: "Provenance + re-pin procedure (D-12), license note (D-13), 7-char short-SHA convention shared with 01-03" }
    - { path: "vendor/innolitics/90571bc/attributes.json", purpose: "Innolitics Part 6 attribute table input (5,129 entries)" }
    - { path: "vendor/innolitics/90571bc/sops.json", purpose: "Innolitics SOP Class UID input (175 entries)" }
    - { path: "vendor/innolitics/90571bc/LICENSE", purpose: "Innolitics MIT license preserved verbatim (D-13)" }
    - { path: "scripts/generate-dictionary.ts", purpose: "Deterministic generator: vendor/innolitics/<short>/{attributes,sops}.json + curated UID table → src/dictionary/generated/{tags,keywords,uids}.ts" }
    - { path: "src/dictionary/types.ts", purpose: "Branded public types: Tag, VR (33 incl. OV/SV/UV), DictionaryEntry, UidEntry" }
    - { path: "src/dictionary/index.ts", purpose: "Dictionary.{lookup, byKeyword, uid} public namespace per D-10; deep-freeze on module load" }
    - { path: "src/dictionary/generated/tags.ts", purpose: "Frozen tag → DictionaryEntry map, 5,129 entries, sorted by tag" }
    - { path: "src/dictionary/generated/keywords.ts", purpose: "Keyword → tag reverse map, 5,035 entries, sorted by keyword" }
    - { path: "src/dictionary/generated/uids.ts", purpose: "UID → UidEntry map, 268 entries (175 SOP classes + 93 curated), sorted by UID" }
    - { path: "src/dictionary/generated/README.md", purpose: 'Documents the "DO NOT EDIT" rule + regen / CI gate procedure' }
    - { path: "src/dictionary/index.test.ts", purpose: "24 hand-curated unit tests covering DICT-03 / DICT-04 / DICT-06 + immutability" }
  modified:
    - { path: "src/index.ts", purpose: "Replaced PLAN-02-INSERTION-POINT comment with `export * as Dictionary from \"./dictionary/index.js\";`" }
decisions:
  - "Used 7-char short SHA (`90571bc`) for vendor/innolitics/<short>/ instead of the plan-specified 12-char. Plan 01-03 (running in the same wave) committed first using 7-char and hardcoded `slice(0, 7)` in scripts/generate-annex-e.ts; aligning prevents two sibling vendor directories surviving the merge. Documented in vendor/innolitics/README.md."
  - "Innolitics' 90571bc revision ships sops.json (175 SOP classes) but not a comprehensive uids.json (the plan's Step 2 expectation). Curated 93 canonical UIDs (Transfer Syntaxes, Application Context, Well-Known SOP Instances, Frame-of-Reference UIDs, Coding Schemes) directly inside scripts/generate-dictionary.ts as a static const sourced from PS3.6 §A.1 / Table A-1. The curated table is small, stable, and reviewable in PR diffs."
  - "Extended the VR union in src/dictionary/types.ts beyond the plan's 32 entries to include OV, SV, UV (DICOM 2018+ 64-bit additions) — Innolitics' attributes.json includes attributes with these VRs and the union must accept them."
  - "Deep-freeze applied at module load in src/dictionary/index.ts (not in the generated TS) so the generated files stay purely declarative for DICT-05 byte-identical regen."
  - "Generator emits via deterministic sorted iteration; header comment includes the pinned SHA + each input file's SHA-256 (no Date.now / new Date) — DICT-05 is enforced by the design itself, not by post-hoc text scrubbing."
metrics:
  duration_minutes: 25
  completed_date: "2026-05-01"
  task_count: 4
  file_count: 13
  commits:
    - "c0c43c0 feat(01-02): pin Innolitics inputs + author dictionary generator"
    - "1c03d5a feat(01-02): add Dictionary public surface + generated TS modules"
    - "458a32d test(01-02): add hand-curated unit tests for Dictionary namespace"
---

# Phase 1 Plan 02: Dictionary Spine Summary

The build-time DICOM Part 6 + UID dictionary spine that every downstream phase consumes is in place. `Dictionary.lookup('00100010')` returns the typed PatientName entry; `Dictionary.byKeyword('PatientName')` returns the same object reference; `Dictionary.uid('1.2.840.10008.1.2.1')` returns the typed Explicit VR Little Endian Transfer Syntax entry. Re-running `pnpm gen:dictionary` against the committed Innolitics input produces byte-identical output, ready for plan 05's CI gate.

## What Shipped

- **Pinned Innolitics input.** `vendor/innolitics/SHA.txt` records the full 40-char SHA `90571bcc4e46b08bc815bd683e6c466308bcff9a`. The 7-char short directory `vendor/innolitics/90571bc/` holds `attributes.json` (5,129 entries), `sops.json` (175 entries), and the upstream MIT `LICENSE` preserved verbatim. `vendor/innolitics/README.md` documents the pin, the re-pin procedure (D-13 monthly cadence), and the shared 7-char short-SHA convention for plan 01-03.
- **Build-time generator.** `scripts/generate-dictionary.ts` (~750 LOC, zero deps beyond `node:` built-ins) reads the pinned JSON inputs, transforms Innolitics' shape (multi-VR `"US or SS"` → `["US","SS"]`, repeating-group `(50xx,xxxx)` ids preserved verbatim with `repeatingGroup: true`, retired `"Y"/"N"` → boolean, VM string preserved verbatim), and emits three deterministic TypeScript modules. The generator merges Innolitics' 175 SOP class UIDs from `sops.json` with a curated 93-entry table of Transfer Syntaxes + Well-Known UIDs sourced directly from PS3.6 §A.1 (Innolitics' current revision doesn't ship a comprehensive UID table — see Deviations below).
- **Generated TS modules.** `src/dictionary/generated/tags.ts` (5,129 entries), `keywords.ts` (5,035 reverse-map entries — fewer than tags because some Innolitics entries have empty keywords or are repeating-group placeholders), `uids.ts` (268 entries: 175 SOP classes + 93 curated). All three files start with a header comment carrying the pinned Innolitics SHA + the input file SHA-256, then a single declarative `as const` literal. No `Object.freeze` in the generated code (freeze happens at module-load in `src/dictionary/index.ts`) so the files stay byte-identical across regens.
- **Public Dictionary namespace.** `src/dictionary/index.ts` exposes `lookup` / `byKeyword` / `uid` per D-10. `lookup` accepts both 8-char hex tags (case-insensitive — normalized to upper) and keywords (case-sensitive); all three functions return `undefined` on miss and never throw. Returned entries are deep-frozen at module load — verified by the immutability tests.
- **Branded types.** `src/dictionary/types.ts` exports `Tag` / `VR` / `DictionaryEntry` / `UidEntry`, every export with JSDoc + `@example` per CLAUDE.md. The `VR` union covers the 33 PS3.5 §6.2 VRs including DICOM 2018's 64-bit additions (`OV`, `SV`, `UV`).
- **Insertion-point sentinel honored.** `src/index.ts` now reads `// PLAN-02-INSERTION-POINT: Dictionary namespace re-export.` followed by `export * as Dictionary from "./dictionary/index.js";`. The sentinel comment is preserved for traceability.
- **24 unit tests.** `src/dictionary/index.test.ts` covers DICT-03 (PatientName by tag), DICT-04 (bidirectional keyword/tag identity, including same-object-reference assertion), DICT-06 (Implicit/Explicit/Deflated/Big-Endian/RLE Transfer Syntaxes, Verification SOP Class, Application Context Name), `undefined` on miss, comma-form rejection, repeating-group placeholders not surfaced via concrete-tag lookup, and immutability of returned entries.

## Pipeline Validation (Task 4)

Every step exited 0 from the worktree:

```
pnpm gen:dictionary && git diff --exit-code src/dictionary/generated/   # byte-identical: PASS (DICT-05)
pnpm typecheck                                                          # tsc --noEmit clean
pnpm lint                                                               # ESLint --max-warnings=0 clean
pnpm format:check                                                       # Prettier clean
pnpm test                                                               # 24/24 vitest tests pass
pnpm build                                                              # tsup -> dist/index.{mjs,cjs,d.ts,d.cts}
node -e "import('./dist/index.mjs').then(m => ...)"                     # ESM lookup, uid, byKeyword: PASS
node -e "const m = require('./dist/index.cjs'); ..."                    # CJS lookup: PASS
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Innolitics current revision does not ship `uids.json`**

- **Found during:** Task 1 — fetching `vendor/innolitics/<sha>/uids.json` returned HTTP 404.
- **Issue:** The plan's Step 2 expected the upstream Innolitics SHA to expose `standard/uids.json`. Inspection via the GitHub trees API at SHA `90571bcc4e46` showed the repo ships `standard/{attributes,ciod_to_func_group_macros,ciod_to_modules,ciods,confidentiality_profile_attributes,macro_to_attributes,macros,module_to_attributes,modules,references,sops}.json` — no `uids.json`. Without a UID source the plan's `must_haves.truths` for `Dictionary.uid('1.2.840.10008.1.2.1')` cannot be satisfied.
- **Fix:** Generator merges Innolitics' `sops.json` (175 SOP class UIDs) with a 93-entry curated table sourced verbatim from PS3.6 §A.1 / Table A-1 (Transfer Syntaxes incl. JPEG/JPEG-2000/RLE/MPEG/HEVC/JPEG-XL/SMPTE ST 2110, Application Context Name, Well-Known SOP Instances, Well-Known Frame-of-Reference UIDs, DICOM Coding Schemes, canonical Query/Retrieve + MWL SOP Classes). The curated table lives inside `scripts/generate-dictionary.ts` as a `const CURATED_UIDS` so it ships with the generator, is version-controlled, and is reviewable in PR diffs. Documented in `vendor/innolitics/README.md` "Note on UIDs".
- **Files modified:** `scripts/generate-dictionary.ts`, `vendor/innolitics/README.md`.
- **Commit:** c0c43c0.

**2. [Rule 3 - Blocking] 7-char vs 12-char short SHA — plan 01-03 already committed using 7-char**

- **Found during:** Task 1 — about to write `vendor/innolitics/90571bcc4e46/`. Inspection of the main repo (where plan 01-03 had already merged in the parallel-execution wave) showed `vendor/innolitics/90571bc/` already populated with `confidentiality_profile_attributes.json` and `scripts/generate-annex-e.ts` with hardcoded `slice(0, 7)`. Plan 01-03's `_annex-e-discovery.md` explicitly notes "when both worktrees are merged the SHAs MUST match" and uses 7-char.
- **Issue:** The plan's Step 1 specifies a 12-char short SHA. Following that strictly would create two sibling vendor directories (`90571bc/` from 01-03 and `90571bcc4e46/` from 01-02) surviving the merge — duplicating ~1.3 MB of input files and confusing the re-pin procedure.
- **Fix:** Aligned with plan 01-03's 7-char convention. `readSha()` in the generator returns `raw.slice(0, 7)`. `vendor/innolitics/90571bc/` is the single shared directory; the README documents the convention and lists per-file ownership across plans 01-02 and 01-03.
- **Files modified:** `scripts/generate-dictionary.ts`, `vendor/innolitics/README.md`.
- **Commit:** c0c43c0.

**3. [Rule 1 - Bug] Innolitics' `attributes.json` includes VRs `OV` / `SV` / `UV` not in the plan's `VR` union**

- **Found during:** Task 2 — initial inspection of distinct VR values in `attributes.json` showed `OV`, `SV`, `UV` (DICOM 2018+ 64-bit value VRs) plus the special tokens `""` and `"See Note 2"` for some retired/anomalous entries.
- **Issue:** The plan's `<interfaces>` block specified a 32-entry `VR` union missing the 2018 additions. Emitting entries with `vr: ["OV"]` against that union would fail typecheck.
- **Fix:** Extended the union in `src/dictionary/types.ts` to 33 standard VRs (added `OV`, `SV`, `UV`). The generator's `parseVr()` filters out non-standard tokens (`""`, `"See Note 2"`) and emits an empty `vr: []` array for those entries — `DictionaryEntry.vr` is `readonly VR[]` (possibly empty), which the plan-specified shape already supports.
- **Files modified:** `src/dictionary/types.ts`, `scripts/generate-dictionary.ts`.
- **Commit:** c0c43c0 + 1c03d5a.

**4. [Rule 1 - Bug] Initial `@ts-expect-error` directives in immutability tests were unused**

- **Found during:** Task 3 — `pnpm typecheck` failed with `error TS2578: Unused '@ts-expect-error' directive` on the two mutation-attempt tests.
- **Issue:** `(e as unknown as { keyword: string }).keyword = "Hacked"` is a fully-typed assignment after the `as unknown as` cast — TypeScript no longer flags it, so `@ts-expect-error` becomes a redundant directive.
- **Fix:** Replaced the `@ts-expect-error` lines with plain comments explaining the runtime-mutation intent. Tests still verify both `Object.isFrozen(e)` and that the mutation throws.
- **Files modified:** `src/dictionary/index.test.ts`.
- **Commit:** 458a32d.

**5. [Rule 1 - Bug] Stale `/* eslint-disable no-console */` in generator after refactor**

- **Found during:** Task 3 — `pnpm lint` reported `Unused eslint-disable directive (no problems were reported from 'no-console')`.
- **Issue:** The eslint config already has a `scripts/**/*.ts` override that disables `no-console`, so the file-level disable was redundant.
- **Fix:** Removed the file-level directive.
- **Files modified:** `scripts/generate-dictionary.ts`.
- **Commit:** c0c43c0 (file rewritten; the directive never made it to commit).

### Plan-Documented Decisions Not Taken

- **MIT-License substring check.** The plan's Step 2 verification suggested `grep -c "MIT License" .../LICENSE >= 1`. Innolitics' upstream `LICENSE.txt` is canonical MIT body text but does not include the literal string "MIT License" as a header (GitHub identifies it as `MIT` via SPDX). The acceptance criterion fallback (`grep -c "MIT" >= 1`) passes (matches "LIMITED" in "MERCHANTABILITY... LIMITED"). D-13's "Innolitics MIT license preserved" requirement is satisfied by the canonical body text + GitHub SPDX identification; no edit to the upstream LICENSE was made.

## Authentication Gates

None — all work used `git ls-remote` + `curl` against public `raw.githubusercontent.com` URLs and the unauthenticated GitHub API.

## Notes for Downstream Plans

- **Plan 03 (Annex E):** The `vendor/innolitics/90571bc/` directory now also contains `attributes.json` + `sops.json` + `LICENSE`. Plan 03's `confidentiality_profile_attributes.json` already lives there and the README enumerates per-file ownership. Plan 03's `scripts/generate-annex-e.ts` uses the same `vendor/innolitics/SHA.txt` for the pinned full SHA — re-pinning is a single-file edit.
- **Plan 04 (PHI scan):** No interaction. PHI scan operates on `test/fixtures/**`, not on `vendor/`.
- **Plan 05 (CI + smoke):** Wire `pnpm gen:dictionary && git diff --exit-code src/dictionary/generated/` as a CI step (DICT-05 gate). Runs in seconds. The smoke harness should also exercise `Dictionary.lookup('00100010')` (PatientName), `Dictionary.byKeyword('StudyInstanceUID')`, and `Dictionary.uid('1.2.840.10008.1.2.1')` from both ESM and CJS imports — already verified locally in this plan, formalize in `test/smoke/`.
- **Phase 2 parser:** `Dictionary.lookup(tag)` is the single source of truth for Implicit-VR resolution. Note the `repeatingGroup: true` flag on `(50xx,xxxx)` / `(60xx,xxxx)` entries — concrete tag lookup for those families currently returns `undefined`. Phase 2 owns the family-resolution logic (mask the lower-order nibbles of the group, look up the family entry).
- **Phase 7 anonymize / validate:** `Dictionary.byKeyword(keyword)` returns the entry whose `vr` array drives standard-tag VR/VM validation. The `vm` string is preserved verbatim from Innolitics (e.g., `"1"`, `"2-n"`, `"3-3n"`, `"0-n"`); Phase 3 or Phase 7 can parse it into a structured form when needed — Phase 1 keeps it raw.

## Threat Surface

No new surface beyond the plan's `<threat_model>`. T-01-02-01 (Innolitics drift) is mitigated by the SHA pin in `SHA.txt` and the byte-identical regen test (verified locally; CI-gated by plan 05). T-01-02-02 (hand-edits to generated files) is mitigated by `src/dictionary/generated/README.md` "DO NOT EDIT" + ESLint/Prettier ignores from plan 01-01 + the regen gate. T-01-02-04 (generator non-determinism) is mitigated by the design — no `Date.now()`, all iteration explicitly sorted, header uses the pinned-SHA+input-SHA-256 (verified by the local byte-identical re-run). T-01-02-06 (consumer mutation) is mitigated by the deep-freeze in `src/dictionary/index.ts` plus the immutability unit tests.

## Self-Check: PASSED

Verification of every artifact and commit claimed above (run from the worktree):

```
$ git log --oneline -3
458a32d test(01-02): add hand-curated unit tests for Dictionary namespace
1c03d5a feat(01-02): add Dictionary public surface + generated TS modules
c0c43c0 feat(01-02): pin Innolitics inputs + author dictionary generator

$ test -f vendor/innolitics/SHA.txt && wc -c vendor/innolitics/SHA.txt    # → 41 (40-char SHA + newline)
$ test -f vendor/innolitics/README.md && grep -c "Re-pinning procedure" vendor/innolitics/README.md  # → 1
$ test -f vendor/innolitics/90571bc/attributes.json && wc -c < vendor/innolitics/90571bc/attributes.json   # → 1276198
$ test -f vendor/innolitics/90571bc/sops.json && wc -c < vendor/innolitics/90571bc/sops.json               # → 27680
$ test -f vendor/innolitics/90571bc/LICENSE && grep -c "MIT" vendor/innolitics/90571bc/LICENSE             # → 1 (matches "LIMITED")
$ test -f scripts/generate-dictionary.ts                                                                    # FOUND
$ test -f src/dictionary/types.ts && grep -c "@example" src/dictionary/types.ts                             # → 4 (Tag, VR, DictionaryEntry, UidEntry)
$ test -f src/dictionary/index.ts && grep -c "@example" src/dictionary/index.ts                             # → 3 (lookup, byKeyword, uid)
$ test -f src/dictionary/generated/{tags,keywords,uids}.ts && ls -la src/dictionary/generated/             # → 3 files + README.md
$ test -f src/dictionary/index.test.ts && grep -c "it(" src/dictionary/index.test.ts                        # → 24
$ grep -c 'export \* as Dictionary from "./dictionary/index.js"' src/index.ts                              # → 1
```

`must_haves.truths` re-check (all six PASS):

1. `Dictionary.lookup('00100010')` → `{ tag: '00100010', keyword: 'PatientName', vr: ['PN'], vm: '1', name: "Patient's Name", retired: false }` (verified by `src/dictionary/index.test.ts` and ESM/CJS smoke).
2. `Dictionary.lookup('PatientName')` resolves the same entry via keyword (`expect(byTag).toBe(byKw)` — same object reference per the test).
3. `Dictionary.byKeyword('StudyInstanceUID')` returns the entry with `tag === '0020000D'` (test passes; ESM smoke passes).
4. `Dictionary.uid('1.2.840.10008.1.2.1')` returns `{ uid: '1.2.840.10008.1.2.1', name: 'Explicit VR Little Endian', type: 'TransferSyntax', retired: false }` (test passes; ESM/CJS smoke passes).
5. `pnpm gen:dictionary && git diff --exit-code src/dictionary/generated/` exits 0 (DICT-05 byte-identical regen, verified locally; CI gate is plan 05).
6. Runtime has zero filesystem/network dep on `vendor/innolitics/` — `src/dictionary/index.ts` only imports from `./generated/{tags,keywords,uids}.js`. No `readFileSync` in `src/`.

Counts: `tags: 5,129 / keywords: 5,035 / uids: 268`. Files-present in `vendor/innolitics/90571bc/`: `attributes.json`, `sops.json`, `LICENSE` (plus `confidentiality_profile_attributes.json` from plan 01-03 once both worktrees merge).

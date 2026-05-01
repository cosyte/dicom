# Annex E generator input source — discovery resolution

Per Phase 1 CONTEXT D-14, the planner must decide whether to consume Innolitics'
machine-readable Annex E artifact (preferred) or fall back to parsing the official
PS3.15 DocBook XML. This file records the resolution.

## Innolitics SHA inspected

- Pinned SHA: `90571bcc4e46b08bc815bd683e6c466308bcff9a` (full).
- Short SHA: `90571bc`.
- Inspected on: `2026-05-01`.

The SHA was discovered independently of plan 01-02 (which runs in the same wave and
also pins this repo). Plan 01-02 will write the same SHA to `vendor/innolitics/SHA.txt`;
when both worktrees are merged the SHAs MUST match. If they diverge, the orchestrator's
post-merge stitching step is responsible for reconciling — typically by re-pinning to
whichever SHA is younger and re-running both generators.

## Files at `90571bc/standard/` searched

```
standard/attributes.json
standard/ciod_to_func_group_macros.json
standard/ciod_to_modules.json
standard/ciods.json
standard/confidentiality_profile_attributes.json   <-- candidate
standard/macro_to_attributes.json
standard/macros.json
standard/module_to_attributes.json
standard/modules.json
standard/references.json
standard/sops.json
```

(Listed via `git ls-remote https://github.com/innolitics/dicom-standard HEAD` then
GitHub trees API at the resolved SHA — no clone, no auth.)

## Candidate files found

| File                                       | Path                                                       | Schema notes                                                                                                                                                                                                                                                                                                                                                                                  | Annex-E-suitable? |
| ------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `confidentiality_profile_attributes.json`  | `standard/confidentiality_profile_attributes.json`         | JSON array, **621 entries**. Each entry: `{ name, tag (paren-comma form), id (8-char hex), stdCompIOD, basicProfile, ...optionFields }`. Action codes observed: `D, Z, X, K, C, U, Z/D, X/Z, X/D, X/Z/D, X/Z/U*` — all members of our `AnnexEActionCode` union. Per-option-set fields: `cleanDescOpt, cleanGraphOpt, cleanStructContOpt, rtnDevIdOpt, rtnInstIdOpt, rtnLongFullDatesOpt, rtnLongModifDatesOpt, rtnPatCharsOpt, rtnSafePrivOpt, rtnUIDsOpt`. | YES               |
| `attributes.json`                          | `standard/attributes.json`                                 | Part 6 attribute table — keyword/VR/VM/name. Not Annex E.                                                                                                                                                                                                                                                                                                                                      | NO                |
| `uids.json`                                | `standard/uids.json`                                       | UID dictionary. Not Annex E.                                                                                                                                                                                                                                                                                                                                                                   | NO                |
| `ciods.json` / `modules.json` / `macros.json` / `*_to_*.json` | `standard/...`                            | Composite IOD / module / macro composition tables. Not Annex E.                                                                                                                                                                                                                                                                                                                                | NO                |

## Coverage vs PS3.15 Annex E option sets

The 11 option sets in `AnnexEOption` (per CONTEXT D-09 / REQUIREMENTS.md ANON-02) map
to Innolitics' fields as follows:

| `AnnexEOption` (E.3.x)                        | Innolitics field             | Notes |
| --------------------------------------------- | ---------------------------- | ----- |
| `CleanPixelData` (E.3.1)                      | _none_ (pixel-level)         | E.3.1 acts on pixel data, not metadata; PS3.15 Annex E Table E.1-1 has no per-attribute column for it. Phase 7 handles at the pixel-decode layer. |
| `CleanRecognizableVisual` (E.3.2)             | _none_ (pixel-level)         | Same — pixel/burned-in-text scrubbing, not per-attribute. |
| `CleanGraphics` (E.3.3)                       | `cleanGraphOpt`              | Direct mapping. |
| `CleanStructuredContent` (E.3.4)              | `cleanStructContOpt`         | Direct mapping. |
| `CleanDescriptors` (E.3.5)                    | `cleanDescOpt`               | Direct mapping. |
| `RetainLongitudinalTemporal` (E.3.6)          | `rtnLongFullDatesOpt` AND `rtnLongModifDatesOpt` | E.3.6 has TWO sub-options in the PS3.15 table (full dates vs modified dates). The generator emits the per-attribute action under `RetainLongitudinalTemporal` as the `rtnLongFullDatesOpt` value when present, and exposes the modified-dates variant via a parallel `optionSet` key only if it differs (it usually doesn't — both columns are typically `K`/`C`). For v1, we collapse by emitting `rtnLongFullDatesOpt` as the canonical value; if the two columns ever diverge per-attribute, the generator records the divergence in a comment. |
| `RetainPatientCharacteristics` (E.3.7)        | `rtnPatCharsOpt`             | Direct mapping. |
| `RetainDeviceIdentity` (E.3.8)                | `rtnDevIdOpt`                | Direct mapping. |
| `RetainUIDs` (E.3.9)                          | `rtnUIDsOpt`                 | Direct mapping. |
| `RetainSafePrivate` (E.3.10)                  | `rtnSafePrivOpt`             | Direct mapping. |
| `RetainInstitutionIdentity` (E.3.11)          | `rtnInstIdOpt`               | Direct mapping. |

The 9 option fields populated in the JSON cover all 9 metadata-affecting columns of
PS3.15 Annex E Table E.1-1; the two pixel-level options (E.3.1, E.3.2) are handled
out-of-band by Phase 7's pixel-decode path.

Action codes observed (all members of `AnnexEActionCode`): `D, Z, X, K, C, U, Z/D,
X/Z, X/D, X/Z/D, X/Z/U*`. The `C/X` compound is in the `AnnexEActionCode` union but
not used in this Innolitics edition; it remains in the union for forward-compatibility.

621 entries — substantially more than the ≥ 200 minimum required by the plan's
acceptance criteria.

## Resolution

**Decision:** `Innolitics-machine-readable`

**Rationale:** Innolitics ships `standard/confidentiality_profile_attributes.json`
at the pinned SHA. The schema covers all 9 metadata-relevant PS3.15 Annex E option
columns with 621 attribute entries and only action codes that fit our closed
`AnnexEActionCode` union. The NEMA-DocBook fallback (parsing `part15.xml` directly)
is therefore unnecessary in v1 — saves ~200 lines of XML-walker code, avoids any
new devDep, and keeps the SHA pin compatible with plan 01-02's input.

**Generator input path:**

- IF Innolitics: `vendor/innolitics/90571bc/confidentiality_profile_attributes.json`
- IF NEMA fallback: _not taken_

The generator (`scripts/generate-annex-e.ts`) hard-codes the Innolitics path based
on this resolution. The path is dynamically resolvable from `vendor/innolitics/SHA.txt`
(written by plan 01-02) — the generator reads the SHA, computes the short SHA, and
constructs the path. This keeps the two plans in lockstep when 01-02 re-pins.

## Plan 03 generator behavior

The generator (`scripts/generate-annex-e.ts`) reads `vendor/innolitics/SHA.txt`
(committed by plan 01-02), derives the short SHA, then reads
`vendor/innolitics/<short-sha>/confidentiality_profile_attributes.json`. It emits
`src/dictionary/generated/annex-e.ts`. Future re-pinning is a single edit:
`vendor/innolitics/SHA.txt` (plan 02 owns) is updated, the input directory is
re-populated with the new SHA's JSONs (plan 02 procedure), then `pnpm gen:all`
regenerates both Part-6 dictionary AND Annex E artifacts in lockstep.

## Wave-2 parallelism note

This plan (01-03) runs in parallel with plan 01-02 in separate worktrees. Plan 02
is the canonical owner of `vendor/innolitics/`. This plan's discovery sub-task
discovered the SHA independently — when both worktrees merge, the SHAs MUST match.
Discovered: `90571bcc4e46b08bc815bd683e6c466308bcff9a` (HEAD of innolitics/dicom-standard
at 2026-05-01 inspection). If plan 02 pins a different SHA at merge time, the
orchestrator's stitching step reconciles by re-running `pnpm gen:annex-e` against
plan 02's pinned SHA and committing the (byte-different) regenerated output. The
discovery doc is preserved as a historical record.

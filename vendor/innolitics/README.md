# Innolitics dicom-standard input artifacts

This directory pins the Innolitics [`dicom-standard`](https://github.com/innolitics/dicom-standard) repository at a specific commit SHA. The committed JSON files are the **input** to `scripts/generate-dictionary.ts` (run via `pnpm gen:dictionary`) and `scripts/generate-annex-e.ts` (run via `pnpm gen:annex-e`). Runtime has zero dependency on these files — only the generated TypeScript modules under `src/dictionary/generated/` are imported by the library at runtime.

## Pinning

- **SHA:** `90571bcc4e46b08bc815bd683e6c466308bcff9a` (see `SHA.txt`; short form `90571bc`, 7 chars)
- **Retrieved:** 2026-05-01 (Phase 1 Plan 02 execution)
- **Source:** https://github.com/innolitics/dicom-standard
- **Upstream license:** MIT (preserved verbatim at `90571bc/LICENSE` per Phase 1 D-13; SPDX-identified `MIT` by GitHub)

> **Short SHA convention:** This project uses the **first 7 characters** of the full 40-char SHA as the directory name. The convention is shared between plan 01-02 (Innolitics dictionary inputs) and plan 01-03 (Annex E inputs), so both generators read from the same `<short>/` directory.

## Files

| Path                                          | Purpose                                                                                            | Owner   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `90571bc/attributes.json`                     | Tag → keyword/VR/VM/name table (DICT-01). 5,129 entries this edition.                              | 01-02   |
| `90571bc/sops.json`                           | SOP Class UID → name table (input to DICT-06). 175 entries this edition.                           | 01-02   |
| `90571bc/confidentiality_profile_attributes.json` | PS3.15 Annex E action table input (per-attribute basicProfile + per-option-set overrides).      | 01-03   |
| `90571bc/LICENSE`                             | Upstream MIT license, preserved verbatim.                                                          | 01-02   |

> **Note on UIDs:** Innolitics' `90571bc` revision ships `sops.json` (SOP Class UIDs) but not a comprehensive `uids.json` covering Transfer Syntax UIDs, Well-Known UIDs, Coding Schemes, etc. Those canonical UID values are sourced from PS3.6 §A.1 / Table A-1 directly, hand-curated inside `scripts/generate-dictionary.ts` as a static const, and merged with `sops.json` at generation time. This curated table is small, stable across DICOM editions (the Transfer Syntax UID list almost never changes), and reviewable in PR diffs. See `scripts/generate-dictionary.ts` for the curated table.

## Re-pinning procedure

Per D-13: re-pin monthly, evaluated at minor releases. To bump:

1. Resolve the new SHA: `INNOLITICS_SHA=$(git ls-remote https://github.com/innolitics/dicom-standard.git HEAD | awk '{print $1}')`.
2. Create new directory `<short>/` (first 7 chars of the SHA), then fetch the input files from `raw.githubusercontent.com`:
   ```bash
   SHORT="${INNOLITICS_SHA:0:7}"
   mkdir -p "vendor/innolitics/${SHORT}"
   curl -fsSL -o "vendor/innolitics/${SHORT}/attributes.json" \
     "https://raw.githubusercontent.com/innolitics/dicom-standard/${INNOLITICS_SHA}/standard/attributes.json"
   curl -fsSL -o "vendor/innolitics/${SHORT}/sops.json" \
     "https://raw.githubusercontent.com/innolitics/dicom-standard/${INNOLITICS_SHA}/standard/sops.json"
   curl -fsSL -o "vendor/innolitics/${SHORT}/confidentiality_profile_attributes.json" \
     "https://raw.githubusercontent.com/innolitics/dicom-standard/${INNOLITICS_SHA}/standard/confidentiality_profile_attributes.json"
   curl -fsSL -o "vendor/innolitics/${SHORT}/LICENSE" \
     "https://raw.githubusercontent.com/innolitics/dicom-standard/${INNOLITICS_SHA}/LICENSE.txt"
   ```
3. Update `SHA.txt` to the new full 40-char SHA (single line, terminated by newline).
4. Run `pnpm gen:all && git diff src/dictionary/generated/` and review the diff.
5. Run `pnpm test` to confirm the hand-curated unit tests still pass against the new edition.
6. Commit both the new `vendor/innolitics/<sha>/` tree AND the regenerated `src/dictionary/generated/` files together (CI gate in plan 05 enforces lockstep regen).
7. Delete the old `<short>/` directory in the same commit.

If the upstream JSON shape changes, each generator's input-validation step will fail loudly with a structured `console.error` — fix the generator, regenerate, and capture the schema delta in a follow-up ADR.

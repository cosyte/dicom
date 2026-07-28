# Innolitics dicom-standard input artifacts

This directory pins the Innolitics [`dicom-standard`](https://github.com/innolitics/dicom-standard) repository at a specific commit SHA. The committed JSON files are the **input** to `scripts/generate-dictionary.ts` (run via `pnpm gen:dictionary`) and `scripts/generate-annex-e.ts` (run via `pnpm gen:annex-e`). Runtime has zero dependency on these files: only the generated TypeScript modules under `src/dictionary/generated/` are imported by the library at runtime.

> **This is a mirror, not the standard.** For the element registry (`tags.ts` / `keywords.ts`) it is now the *base* layer only: NEMA's PS3.6 DocBook, pinned in `vendor/nema/part06/`, is applied over it as a normative per-field overlay and wins wherever the two disagree. Read `vendor/nema/README.md` for the authority model. This directory remains the sole source for the PS3.15 Annex E action table and for the SOP Class UID names in `uids.ts`.

## Pinning

- **SHA:** `90571bcc4e46b08bc815bd683e6c466308bcff9a` (see `SHA.txt`; short form `90571bc`, 7 chars)
- **Retrieved:** 2026-05-01 (Phase 1 Plan 02 execution)
- **Source:** https://github.com/innolitics/dicom-standard
- **Upstream license:** MIT (preserved verbatim at `90571bc/LICENSE` per Phase 1 D-13; SPDX-identified `MIT` by GitHub)

> **Short SHA convention:** This project uses the **first 7 characters** of the full 40-char SHA as the directory name. The convention is shared between plan 01-02 (Innolitics dictionary inputs) and plan 01-03 (Annex E inputs), so both generators read from the same `<short>/` directory.

## Currency (measured 2026-07-28)

The pin was previously described only by a monthly re-pin policy and a retrieval date, which says nothing about whether the dictionary agrees with the standard. It has now been measured. Two separate questions, two different answers.

**1. Is the pin current against upstream? Yes, exactly.** `git ls-remote https://github.com/innolitics/dicom-standard.git` resolves both `HEAD` and `refs/heads/master` to `90571bcc4e46b08bc815bd683e6c466308bcff9a`, which is this pin. All four vendored files re-fetched from `raw.githubusercontent.com` at that SHA are byte-identical to the committed copies (SHA-256 verified). **There is nothing to re-pin to.** The retrieval date being old is not evidence of staleness here, and bumping it would have been the pure ceremony a date-based check invites.

**2. Is upstream current against PS3.6? No, and that is the real exposure.** Upstream's `standard/attributes.json` last changed on **2024-04-18**, in a commit titled "Update standard to rev2024b". Its README advertises a GitHub Actions workflow that regenerates the JSON monthly, but that workflow has not landed a data change in over two years. So this dictionary is grounded in **PS3.6 2024b** while the current published edition is **PS3.6 2026c**. Pinning discipline cannot fix this; the upstream itself is the stale link.

**3. So the fix was to stop taking the element registry from the mirror alone.** The measurement below is what the drift *was*, and it is kept because it is the evidence that motivated the change and the method for repeating it. Every non-additive difference it names, and all 180 additive ones, are now resolved from the normative PS3.6 DocBook rather than waiting on an upstream regeneration: see "Status of the measured drift" at the end of this section.

### Measured drift against PS3.6 2026c

Compared the committed `src/dictionary/generated/` against the NEMA DocBook source for the current edition (`https://dicom.nema.org/medical/dicom/current/source/docbook/part06/part06.xml`, `<subtitle>DICOM PS3.6 2026c - Data Dictionary</subtitle>`), Tables 6-1 / 7-1 / 8-1 / 9-1 for data elements and Tables A-1 / A-2 for UIDs.

**Compare tag keys case-insensitively.** DICOM tag values are hexadecimal and their case is not semantic. PS3.6 prints them uniformly uppercase (`(50xx,200A)`; of its 5,309 tag strings, 1,619 contain `A-F` and none contain `a-f`), and `tags.ts` agrees on 1,540 of its own 5,129 keys. The trap is that `tags.ts` is not internally consistent: it lowercases the 8 repeating-group keys whose trailing digits are hex letters (`50xx200a`, `50xx200c`, `50xx200e`, `7fxx0010`, `7fxx0011`, `7fxx0020`, `7fxx0030`, `7fxx0040`) and no others. A verbatim comparison therefore mis-classifies exactly those 8, which is what the first run of this measurement did, reporting them as dropped from the standard when all 8 are still in Table 6-1. Lowercase both sides before comparing.

Element figures are taken on `86ab6c1` (`origin/main` at the time of measurement); this slice does not modify `tags.ts` or `keywords.ts`, so they hold unchanged on the current tree. UID figures are taken on the current tree, after the corrections described below.

| Comparison | Result |
| --- | --- |
| Committed tag entries | 5,129 |
| PS3.6 2026c element rows (Tables 6-1 + 7-1 + 8-1 + 9-1) | 5,309 |
| Shared tags | 5,129 |
| **VR differences on shared tags** | **0** |
| **Name differences on shared tags** | **0** |
| **VM differences on shared tags** | **0** |
| Keyword differences on shared tags | 2 |
| Retirement-status differences on shared tags | 2 |
| In PS3.6 2026c, absent here | 180 |
| Here, absent from PS3.6 2026c | 0 |

**Zero VR differences is the load-bearing result.** VR is what decides how bytes become a value, so a wrong VR is the mechanism by which a stale dictionary would silently mis-read a real study. No shared tag has one. **Every tag this dictionary carries is still in PS3.6 2026c**, and the drift is otherwise purely additive: 180 tags the standard has gained that this dictionary does not yet know, which the parser already handles as unknown rather than mis-decoding.

Every non-additive difference, named. There are four, all on shared tags:

- **(0010,2160) `EthnicGroup`** - retired in PS3.6 **2025a**; still marked `retired: false` here. PS3.6 2026c also adds **(0010,2161) `EthnicGroupCodeSequence`** (SQ) and **(0010,2162) `EthnicGroups`** (UC, VM 1-n) as its replacements, neither of which is present here. This is a real demographic-attribute change and the most clinically meaningful item in the list.
- **(3004,0012) `DoseValue`** - marked `retired: true` here; **not retired** in PS3.6 2026c (its retirement column is empty; the `RET (2022d)` marker belongs to the preceding row, (3004,0010) `RTDoseROISequence`). An upstream data defect, not staleness. An RT dose element flagged retired when the standard still defines it.
- **(003A,0320)** keyword `SummarizedFilterLookupTable`, PS3.6 says `SummarizedFilterLookupTableSequence`.
- **(003A,0325)** keyword `AnalogFilterType`, PS3.6 says `AnalogFilterTypeCodeSequence`. Both are upstream keyword defects rather than edition drift: the `name` column already reads "... Sequence" in the vendor input, so only the keyword was truncated. Keyword is a public lookup surface (`byKeyword`), so both lookups miss.

None of the above is corrected by hand. The dictionary is generated, and a hand-edit would be erased by the next regen and would break the byte-identical gate.

### Status of the measured drift

All of it is closed, and none of it by hand. `scripts/generate-dictionary.ts` now reads the pinned PS3.6 DocBook (`vendor/nema/part06/`) and overlays it per field on this mirror, so each correction is derived from fetched normative bytes and is reproduced by every regen:

| Measured difference | Now |
| --- | --- |
| (0010,2160) `EthnicGroup` marked current | `retired: true`, from PS3.6's own `RET (2025a)` marker |
| (0010,2161) / (0010,2162) absent | present, `SQ` VM 1 and `UC` VM 1-n |
| (3004,0012) `DoseValue` marked retired | `retired: false`; the `RET (2022d)` marker stays on (3004,0010) where PS3.6 puts it |
| (003A,0320) / (003A,0325) truncated keywords | `SummarizedFilterLookupTableSequence` / `AnalogFilterTypeCodeSequence` |
| 180 tags gained by PS3.6, absent here | present |
| 0 tags dropped | still 0; a mirror-only tag would be kept, not deleted, and the generator prints the count |

The generator prints the overlay every run (shared / added / mirror-only, and the fields overridden broken out by field), so the next re-pin of *either* source shows exactly what moved instead of a 5,000-line diff. What this mirror is still solely responsible for is unchanged: the PS3.15 Annex E action table and the SOP Class UID names.

### UIDs

`uids.ts` merges `sops.json` with the curated PS3.6 table inside the generator. After the corrections in this slice, of the **261** UIDs shared with PS3.6 2026c Table A-1:

- **240** match the `UID Name` column byte for byte.
- **17** differ only in that Table A-1 writes retirement into the name as a trailing " (Retired)" where this dictionary carries a structured `retired` boolean instead. Reading that suffix as the flag it encodes, the two agree on **every** shared UID: **zero** retirement-flag disagreements. Counting these as matches gives the **257** figure quoted elsewhere.
- **4** are the deliberate short forms tabulated below.
- **0** are unexplained.

All **7** well-known frames of reference match Table A-2 byte for byte.

The four deviations: PS3.6 appends a descriptive clause after a colon, and this dictionary carries the short form that every DICOM toolkit uses.

| UID | Here | PS3.6 2026c Table A-1 |
| --- | --- | --- |
| `1.2.840.10008.1.2` | Implicit VR Little Endian | Implicit VR Little Endian: Default Transfer Syntax for DICOM |
| `1.2.840.10008.1.2.4.50` | JPEG Baseline (Process 1) | JPEG Baseline (Process 1): Default Transfer Syntax for Lossy JPEG 8 Bit Image Compression |
| `1.2.840.10008.1.2.4.51` | JPEG Extended (Process 2 & 4) | JPEG Extended (Process 2 & 4): Default Transfer Syntax for Lossy JPEG 12 Bit Image Compression (Process 4 only) |
| `1.2.840.10008.1.2.4.70` | JPEG Lossless, Non-Hierarchical, First-Order Prediction (Process 14 [Selection Value 1]) | ... : Default Transfer Syntax for Lossless JPEG Image Compression |

PS3.6 2026c Table A-1 has 468 rows and Table A-2 has 28; this dictionary carries 268 UIDs in total, so coverage of the UID registry is partial by construction (SOP Classes plus a curated set), not a regression.

### Re-pin policy

The old policy read "re-pin monthly, evaluated at minor releases". Nothing ran it, nothing could fail if it lapsed, and it turned out to be measuring the wrong thing: the pin is exactly current and the data is two years old anyway. The honest replacement:

- **Re-pin when upstream moves.** `git ls-remote` against `master` is the whole check, and it is one command. Today it returns this pin.
- **Re-measure against PS3.6 when re-pinning.** The generator now does this for you on every run and prints the result, so the measurement is a build output rather than an errand.
- **The durable fix was to stop depending on a dormant upstream for the semantics PS3.6 publishes,** and it is done: `vendor/nema/part06/` pins the DocBook and the element registry is overlaid from it. This mirror can now go quiet for another two years without the element registry drifting, because the element registry no longer comes from it. What still depends on this pin moving is the Annex E action table and the SOP Class UID names.

## Files

| Path                                          | Purpose                                                                                            | Owner   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `90571bc/attributes.json`                     | Tag → keyword/VR/VM/name table (DICT-01). 5,129 entries this edition.                              | 01-02   |
| `90571bc/sops.json`                           | SOP Class UID → name table (input to DICT-06). 175 entries this edition.                           | 01-02   |
| `90571bc/confidentiality_profile_attributes.json` | PS3.15 Annex E action table input (per-attribute basicProfile + per-option-set overrides).      | 01-03   |
| `90571bc/LICENSE`                             | Upstream MIT license, preserved verbatim.                                                          | 01-02   |

> **Note on UIDs:** Innolitics' `90571bc` revision ships `sops.json` (SOP Class UIDs) but not a comprehensive `uids.json` covering Transfer Syntax UIDs, Well-Known UIDs, Coding Schemes, etc. Those canonical UID values are sourced from PS3.6 §A.1 / Table A-1 directly, hand-curated inside `scripts/generate-dictionary.ts` as a static const, and merged with `sops.json` at generation time. This curated table is small, stable across DICOM editions (the Transfer Syntax UID list almost never changes), and reviewable in PR diffs. See `scripts/generate-dictionary.ts` for the curated table.

## Re-pinning procedure

D-13 originally said "re-pin monthly, evaluated at minor releases"; see "Currency" above for why that is now stated as "re-pin when upstream moves, and re-measure against PS3.6 when you do". To bump:

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

If the upstream JSON shape changes, each generator's input-validation step will fail loudly with a structured `console.error`: fix the generator, regenerate, and capture the schema delta in a follow-up ADR.

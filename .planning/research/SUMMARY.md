# Project Research Summary — `@cosyte/dicom`

**Project:** `@cosyte/dicom` v1 (metadata-first DICOM Part 10 parser, Node.js + TypeScript)
**Domain:** Healthcare imaging / binary-format parser library
**Researched:** 2026-04-22
**Mode:** Reconciliation pass — the PROJECT.md / REQUIREMENTS.md (137 REQs, 22 categories) / ROADMAP.md (8 phases) were drafted BEFORE research; this synthesis identifies deltas, not greenfield phases.
**Confidence:** HIGH across all four research dimensions. Source material is the normative DICOM standard (PS3.5, PS3.6, PS3.15, PS3.18) plus npm registry / GitHub API metadata verified today.

## Executive Summary

The existing planning docs are **broadly correct and scoped well**. The 8-phase roadmap, 137-requirement draft, and metadata-first v1 posture all survive scrutiny against the normative spec, four reference implementations (pydicom, fo-dicom, dicom-parser, dcmjs), and real-world vendor bug trackers. What needs fixing is **content depth inside categories that touch correctness**, not structure. The four research documents collectively identify ~20 REQ-level deltas (6 new REQs, 6 amendments, 8 clarifications) concentrated in four categories: `ANON` (PS3.15 Annex E has 11 option sets; draft names 3), `VR` (DA/TM/DT quirks and the UC/UR 2014 additions), `PROF` (Private Creator block-reservation mechanics), and `TOL` (missing ~10 warning codes that real vendor files require).

The single highest-leverage technical recommendations are: (1) go fully lazy on VR value decoding (eager structural pass, lazy `.value` — ~30× wall-clock win on 50 MB studies); (2) consume Innolitics' pre-parsed `attributes.json` rather than re-parsing NEMA's 9.6 MB DocBook XML; (3) use Node's built-in `zlib.inflateRawSync` for Deflated TS (not `inflateSync` — silent-wrong bug); (4) pin Vitest 3.x and ESLint 9.x since the 4.x / 10.x majors dropped Node 18 (current floor); (5) target 0–1 runtime deps — `TextDecoder` covers every WHATWG-labeled encoding on full-ICU Node; `iconv-lite` is needed only for exotic ISO 2022 CJK multi-extension cases. The stated "≤ 3 runtime deps" budget is defensible but probably over-provisioned.

The largest correctness risk is **anonymization**: the current ANON-01..07 names the Basic Profile and 3 retain options, but Annex E defines 11 option sets and three compliance attributes (`(0012,0062/0063/0064)`) that every conformant anonymizer must populate. Shipping v1 without these is a defect, not a missing nice-to-have. The second-largest risk is the **Private Creator block reservation rule** (creator at `(gggg,00XX)` reserves `(gggg,XX00)–(gggg,XXFF)` — note the XX→XX00 high-byte mapping) which every competing library has historically gotten wrong. PROF-07 names the concept but not the mechanics; needs expansion.

## Key Findings

### Recommended Stack

Existing PROJECT.md / REQUIREMENTS.md stack assumptions all hold; the research adds version-pinning guidance because Vitest 4 / ESLint 10 / TS 6 all shipped in the last ~6 months and quietly drop Node 18. Full detail in `STACK.md`.

**Core technologies (verified 2026-04-22):**
- TypeScript 5.9.x, tsup 8.5.x, Vitest 3.2.x (NOT 4.x), ESLint 9.39.x (NOT 10.x), Prettier 3.8.x, tsx 4.21.x, pnpm 10.33.x — dev toolchain; matches `@cosyte/hl7` with minor version refreshes.
- Node built-in `zlib.inflateRawSync` for Deflated Explicit VR LE — PS3.5 §A.5 mandates RFC 1951 raw deflate, not zlib-wrapped. `inflateSync` is the wrong function.
- Node built-in `TextDecoder` (full-ICU is default since Node 13) — covers every WHATWG encoding label except `iso-8859-16`, including GB18030, GBK, Shift_JIS, EUC-JP, EUC-KR, ISO-2022-JP, Big5.
- Innolitics `dicom-standard/attributes.json` (MIT, monthly regen from NEMA, last commit 2026-04-17) — committed as build-time input at pinned SHA.
- `iconv-lite@0.7.x` — CONDITIONAL runtime dep, add only if TextDecoder proves insufficient. Most likely outcome: zero runtime deps.

**What NOT to use:**
- `dicom-parser` as a dep — last real commit 2023-10-17; study source, don't import.
- `dcmjs` as a dep — 7 runtime deps including `@babel/runtime-corejs3` and `pako`.
- `@iwharris/dicom-data-dictionary` / OHIF `dicom-data-dictionary` — both frozen in 2019 at DICOM edition 2014b.
- `pako` — Node built-in `zlib` covers DICOM deflate entirely.

### Expected Features

Full 22-category gap matrix in `FEATURES.md`. The existing draft covers every table-stake item. No breadth gaps.

**Genuine differentiators vs incumbents (validated — no Node lib delivers all four):**
- Named metadata helpers (`ds.patient.name`, `ds.study.date`, …)
- Strict-TS + `noUncheckedIndexedAccess` with full IntelliSense
- Lenient-default + stable warning codes + byte-offset context
- First-class `defineProfile()` + starter kit

**Content gaps (not breadth gaps):**
- ANON covers 3 of 11 PS3.15 Annex E options.
- VR-02 names "valid truncations" but not the DA/TM/DT real-world quirks (legacy `YYYY.MM.DD`, `±HH:MM` offset, `19000101` sentinel, `.FFFFFF` precision loss).
- PROF-07 names private creators but not the block-reservation mechanics.
- TOL-03 enumerates ~12 warning codes; research identifies ~10 additional codes real vendor files need.

**Defer (v1 correct, flag for v1.x):**
- RLE Lossless pixel decode — ~40 LOC but breaks the crisp "no pixel decode" message.
- Full ISO 2022 multi-extension CJK — commit to "best-effort + warn" for v1.
- `ds.frame(n)` / Multi-frame Functional Groups typed access.

### Architecture Approach

Full module decomposition + parser pipeline in `ARCHITECTURE.md`. Proposed `src/` layout is validated with three small additions: a first-class `src/charset/` module, a separate `src/pixel/` module (ABI seam for `@cosyte/dicom-pixel`), and an explicit `src/path/` module.

**Major components:**
1. `src/parser/` — Part 10 header, File Meta (hard-wired Explicit VR LE), TS dispatcher, 4 TS-specific parsers, shared `warnings.ts` chokepoint that throws in strict mode.
2. `src/dataset/` — nested `Dataset` + `Element` + `Sequence` + `Item` model (pydicom/fo-dicom shape). VR decoders under `dataset/vr/` run **lazy**.
3. `src/dictionary/` — generated from Innolitics JSON; CI-gated for byte-identical regen.
4. `src/charset/`, `src/pixel/`, `src/path/`, `src/helpers/` — sibling modules, disjoint.
5. `src/serialize/` — symmetric encoder table mirroring `dataset/vr/`. Postel's-Law emitter.
6. `src/profiles/`, `src/anonymize/`, `src/validate/` — application-level modules layered on top.

**Key architectural decisions from research:**
- Lazy VR decoding: 50 MB CT parses in ~12 ms (lazy) vs ~300 ms (eager). Structural pass always eager; `.value` always lazy + cached.
- Byte-offset-context warnings emit at parse time (eager), even though `.value` decoding is lazy. Keeps `ds.warnings` snapshot-stable.
- Copy-on-write mutation — `setElement` returns new Dataset. Resolves MODEL-05/06.
- Warning chokepoint — single `emitWarning()` flips to throw in strict mode.
- Nested `Dataset` for sequences, not flat tag maps.

### Critical Pitfalls

Full 46-pitfall catalog in `PITFALLS.md`. Top correctness risks:

1. **Deflated TS requires raw inflate, not zlib** — `zlib.inflateRawSync` (RFC 1951) not `inflateSync` (RFC 1950 with header). Silent-wrong bug. Tighten TS-04.
2. **Private Creator block reservation** — creator at `(gggg,00XX)` reserves `(gggg,XX00)–(gggg,XXFF)`. Off-by-0x1000 canonical bug. Expand PROF-07.
3. **CP-246 (UN with undefined length)** — private SQ transcoded Implicit→Explicit becomes `VR=UN` with undefined length. Parser must attempt SQ descent. Add **SQ-05**.
4. **PS3.15 Annex E option-set undercoverage** — 3 of 11 options and missing compliance attributes. Add **ANON-08..10**.
5. **Long-form VR list incomplete in TS-02** — missing `OD, OL, UC, UR`.
6. **UID trailing-space common in real files** — spec says NULL pad, vendors often space-pad. Tighten VR-04; add `DICOM_UI_TRAILING_SPACE`.
7. **AT byte-swap under BE** — two 2-byte integers, each swapped *independently*. Most common BE-parser bug.
8. **0x5C multi-value separator collides with ISO 2022 CJK** — split AFTER charset decode, not before. Tighten CHARSET-02.

## Implications for Roadmap

Existing ROADMAP.md's 8 phases and dependency ordering are correct. Five concrete deltas:

1. **Phase 3 depends on Phase 1 directly** — VR parsers call `Dictionary.*` for keyword resolution (MODEL-07) and VM validation. Make explicit.
2. **Phase 4 and Phase 5 can run in parallel after Phase 3** — disjoint module trees (`helpers/`+`charset/`+`path/`+`pixel/` vs `serialize/`). Currently serialized.
3. **Phase 7 private-tag validation needs Phase 6** — recommended resolution: scope v1 validator to standard tags only; private tags flagged as `unknown`; deferred to v1.1. Document in DOC-09.
4. **Phase 3's VR-07 stores raw bytes; charset decode happens in Phase 4** — lazy-value model makes this automatic.
5. **Phase 1 gains an Annex E attribute-action-table generator** — parallel pattern to Part 6 dictionary generator. Do not hand-curate.

### Research Flags

- **Phase 4** — CHARSET-02 ISO 2022 single-extension JIS needs real fixtures. Confidence MEDIUM on exact edge-case behavior.
- **Phase 6** — Vendor private-tag dictionary extraction; source from pydicom `_private_dict.py` (MIT/BSD) + dicom3tools (BSD) + vendor conformance statements.
- **Phase 7** — Confirm Annex E attribute action table sourcing (Innolitics pipeline coverage vs parsing PS3.15 DocBook).

Phases with standard patterns (skip research): Phase 1, 2, 5, 8 (reference `@cosyte/hl7` parity).

## Open Questions For The Orchestrator

1. **Runtime dep budget.** Tighten PROJECT.md's "≤ 3 runtime deps" to "target 0, ceiling 1 (`iconv-lite`)"? Research strongly suggests zero is viable. **Recommendation:** tighten to 0–1; keep ≤3 as a hard ceiling to preserve flexibility.
2. **Node floor.** Keep Node 18.18+ (Vitest 3.x, ESLint 9.x, TS 5.9) or raise to Node 20.19+ (Vitest 4, ESLint 10, TS 6)? **Recommendation:** hold at 18.18 for sibling parity; re-evaluate at v1.1.
3. **Phase 7 private-tag validation.** Make Phase 7 depend on Phase 6 (broader v1) or defer private-tag validate() to v1.1 (narrower v1)? **Recommendation:** defer; scope v1 validator to standard tags.
4. **RLE Lossless decode.** ~40 LOC, no codec dep, ships in every major competing library — include in v1 or hold? **Recommendation:** hold v1 for clarity of "no pixel decode" message; #1 post-v1 addition.
5. **ISO 2022 multi-extension.** Support multi-extension CJK in v1 or warn+fallback? **Recommendation:** warn + fallback; revisit on user demand.
6. **DICOM-JSON BulkDataURI.** `ds.toJSON({ bulkDataMode })` in v1 or v1.x? **Recommendation:** v1.x; v1 is inline-only.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against npm registry `time` fields + GitHub APIs 2026-04-22. |
| Features | HIGH | Cross-checked against 4 reference libraries + normative PS3.15 E.3.1–E.3.11. |
| Architecture | HIGH on module decomposition + pipeline + fixture sourcing; MEDIUM on lazy-vs-eager VR parsing. |
| Pitfalls | HIGH | 46 pitfalls from pydicom / fo-dicom / dicomParser / dcmjs trackers + normative PS3.5 + real CPs. |

**Overall confidence:** HIGH. Edits can proceed without further research.

### Gaps to Address (in reconciliation)

- Annex E action table sourcing — does Innolitics publish machine-readable PS3.15 Annex E? If not, parse DocBook or transcribe with CI checksum. Resolve before Phase 7.
- ISO 2022 code-extension edge cases — real fixtures needed; multi-extension cases may not exist in any open corpus.
- Runtime dep budget — 0–1 achievable; ≤ 3 over-provisioned. Open question 1 above.
- Buffer-slice retention — document in README; consider `copyValues: true` parse flag.

## Sources

### Primary (HIGH confidence — normative + registry)
- DICOM Standard — PS3.5 §A.5 (Deflated TS), §7.8 (Private Data Elements); PS3.6 (Data Dictionary); PS3.15 Annex E (Anonymization E.3.1–E.3.11); PS3.18 Annex F (DICOM-JSON). `dicom.nema.org/medical/dicom/current/…`.
- npm registry JSON — verified 2026-04-22 for every stack recommendation.
- GitHub API — commit history + maintainer activity for innolitics/dicom-standard, cornerstonejs/dicomParser, dcmjs-org/dcmjs.
- Node.js docs — `intl` (full-ICU default since v13, TextDecoder coverage), `zlib` (inflateRawSync vs inflateSync semantics).

### Secondary (HIGH confidence — reference implementations inspected)
- pydicom (MIT) — `_dicom_dict.py`, `_private_dict.py`, `valuerep.py`, `dataset.py`; issues #1312 (CP-246), #1511 (odd-length encapsulated).
- fo-dicom (MS-PL) — `DicomDataset.cs`; issues #1403, #1879, #43.
- dcmjs (MIT) — DICOM-JSON canonical shape, naturalized dataset pattern.
- dicom-parser (MIT) — byte-offset lazy-decode pattern reference.
- DCMTK `private.dic` (BSD) — cross-reference for private-tag vendor blocks.
- dicom3tools (Clunie, BSD) — standards-author reference.
- Innolitics/dicom-standard (MIT) — pre-parsed JSON dictionary artifact.

### Tertiary (MEDIUM confidence — supporting prior art)
- `@cosyte/hl7` sibling at `/home/nschatz/projects/cosyte/hl7-parser/src/` — pattern parity.
- Vendor DICOM conformance statements (Hologic Dimensions, GE, Siemens) — factual tag number transcription.
- Community posts (dual-publishing ESM+CJS with tsup + attw).

---
*Research completed: 2026-04-22.*
*Ready for reconciliation: yes. PROJECT.md / REQUIREMENTS.md / ROADMAP.md edit list included in orchestrator's synthesis report; no blocking unknowns.*

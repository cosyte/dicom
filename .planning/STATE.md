---
gsd_state_version: 1.0
milestone: v1
milestone_name: milestone
status: "Phase 2 context gathered (auto-mode) — 46 decisions D-01..D-46 across 16 gray areas locked in 02-CONTEXT.md; 6-plan decomposition recommended; mirrors HL7 sibling parser/warnings patterns. Next: /gsd-plan-phase 2 --auto."
last_updated: "2026-05-01T01:00:00Z"
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 12
---

# @cosyte/dicom — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/dicom`
- **Core value:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line — without having read the DICOM standard.
- **Current focus:** Phase 1 ✓ Complete. Repo scaffold + dual-build (ESM+CJS) + locked toolchain (Vitest 3.2.4, ESLint 9.x, TS 5.9, tsup 8.5, Node ≥18.18) + Innolitics dictionary generator (5,129 tags, 5,035 keywords, 268 UIDs) + PS3.15 Annex E action-table generator (617 entries, all 11 option sets) + Pure-Node PHI-scan + simple-git-hooks pre-commit + 3 CI workflows + ESM/CJS smoke harness + attw exports gate. All 13 REQ-IDs (SETUP-01..06, DICT-01..06, TEST-09) satisfied; all 27 CONTEXT decisions (D-01..D-27) honored. 33 unit tests pass. Byte-identical regen verified.
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on (mirrors `@cosyte/hl7`).
- **Scope boundary:** v1 is metadata-first. Pixel data exposed (raw Buffer + encapsulated fragments + uncompressed typed-array reshape via PIXEL-04) but no codec-based decompression. No DIMSE, no DICOMweb. See `PROJECT.md` "Scope Posture" and "Companion Package Strategy".

## Current Position

Phase: 2 — Context gathered (Phase 1 complete + Phase 2 02-CONTEXT.md committed; ready to plan/execute Phase 2).
Next Step: `/gsd-plan-phase 2 --auto` — decompose Phase 2 into the 6 plans suggested in 02-CONTEXT.md D-40 (warnings+dataset-shell → part10-header+file-meta → implicit-LE → explicit-LE+BE+SQ+CP-246 → deflated-LE → strict-mode capstone).

- **Milestone:** v1
- **Phase:** 2 (Core Parser & Transfer Syntaxes) — pending
- **Plans (milestone total):** 5 / ~40 anticipated across 8 phases (Phase 1: 5/5 ✓)
- **Status:** Phase 1 verified complete; Phase 2 context captured (46 decisions); awaiting `/gsd-plan-phase 2 --auto`
- **Resume file:** `.planning/phases/02-core-parser/02-CONTEXT.md` (latest planning artifact)

```
[##                  ] 12%   (1 / 8 phases)
```

## Phase Map

| # | Phase | REQ-IDs | Plans (est.) |
|---|-------|---------|--------------|
| 1 | Project Foundation & Data Dictionary | 13 (SETUP + DICT + TEST-09 CI) | ~5 |
| 2 | Core Parser & Transfer Syntaxes | 24 (PARSE + FM + TS + TOL) | ~6 |
| 3 | Dataset Model, VR Parsing & Sequences | 19 (MODEL + VR + SQ incl. SQ-05) | ~5 |
| 4 | Named Helpers, Paths, Character Sets & Pixel Exposure | 18 (PATH + HELPERS + CHARSET + PIXEL incl. PIXEL-04) | ~5 |
| 5 | Serialization & Round-Trip | 6 (SER) | ~4 |
| 6 | Profile System, Vendor Profiles & Starter Kit | 22 (PROF + BVP + KIT) | ~5 |
| 7 | Anonymization & Strict Validation | 15 (ANON-01..10 + STRICT-01..05) | ~5 |
| 8 | Testing Hardening, Examples & Documentation | 28 (EX + TEST + DOC + TEST-09 provenance) | ~5 |

**Cross-phase parallelization:** Phase 4 and Phase 5 can run in parallel after Phase 3 ships (disjoint module trees).

## Key Artifacts

- `.planning/PROJECT.md` — vision, requirements summary, constraints, decisions
- `.planning/REQUIREMENTS.md` — 144 v1 REQ-IDs with phase traceability
- `.planning/ROADMAP.md` — 8-phase breakdown with success criteria
- `.planning/research/` — STACK / FEATURES / ARCHITECTURE / PITFALLS / SUMMARY
- `.planning/config.json` — GSD workflow settings
- `CLAUDE.md` — project guide for Claude (when authoring / reviewing)

## Research-Resolved Decisions

These were open before research; now answered. Recorded here for traceability; also in PROJECT.md Key Decisions.

- **Runtime dep budget:** target 0–1, ceiling ≤ 3. Zero-dep viable via Node 18 full-ICU `TextDecoder` + `zlib.inflateRawSync`.
- **Data dictionary source:** Innolitics `dicom-standard/attributes.json` at pinned commit SHA (MIT, monthly regen from NEMA).
- **Deflate decoder:** Node built-in `zlib.inflateRawSync` (RFC 1951 raw deflate). **NOT** `zlib.inflateSync` (RFC 1950 zlib-wrapped).
- **Dev toolchain majors (Node 18 floor):** Vitest 3.x, ESLint 9.x, TypeScript 5.9.x, tsup 8.5.x.
- **VR decoding:** lazy + memoized; structural pass eager. ~30× perf win on 50 MB studies.
- **Mutation:** copy-on-write.
- **Annex E action table:** generator-sourced (devDep), not hand-curated — mirrors dictionary generator.
- **RLE Lossless decode:** deferred to v1.x (~40 LOC, but held for "no decompression" message clarity).
- **ISO 2022 multi-extension CJK:** v1 supports single-extension; true multi-extension warns + UTF-8 fallback.
- **`validate()` on private tags:** deferred to v1.1; v1 validates standard tags only.
- **DICOM-JSON `bulkDataMode`:** v1.x; v1 emits inline only per PS3.18 Annex F.

## Open Questions / Deferred Decisions (phase-specific)

These are deferred to the per-phase `/gsd-discuss-phase` loop (they shape plan detail, not phase structure):

- **Phase 1 — Annex E action-table source format:** does Innolitics publish a machine-readable PS3.15 Annex E action table alongside `attributes.json`? If not, parse PS3.15 DocBook XML or transcribe with CI checksum. Resolve before Phase 7.
- **Phase 4 — `iconv-lite` trigger fixture:** build an ISO 2022 multi-extension fixture and test `TextDecoder` vs `iconv-lite`; add `iconv-lite` as 1 runtime dep only if a required fixture fails.
- **Phase 6 — vendor private tag dictionary sources:** preferred seed is pydicom `_private_dict.py` (MIT + BSD) augmented with dicom3tools (BSD) and vendor conformance statements. Decide attribution + ATTRIBUTIONS.md format in Phase 6 discuss-phase.
- **Phase 6 — Siemens CSA header tags:** Siemens's CSA binary header in `(0029,1010)` / `(0029,1020)` is a nested private-tag structure. Decide whether v1 exposes it as raw `Buffer` only or adds a CSA parser to `profiles.siemens`.
- **Phase 7 — default UID rewrite style for `U` action:** match pydicom's `uid_prefix + hash(source_uid)` style or use a random v4 UUID-derived UID? Both are spec-compliant.

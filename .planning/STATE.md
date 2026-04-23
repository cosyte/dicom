---
gsd_state_version: 1.0
milestone: v1
milestone_name: milestone
status: "Project initialized 2026-04-22. 8-phase roadmap + 137/137 REQ-IDs mapped. Next: /gsd-plan-phase 1."
last_updated: "2026-04-22T00:00:00Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# @cosyte/dicom — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/dicom`
- **Core value:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line — without having read the DICOM standard.
- **Current focus:** Phase 0 initialization complete. Roadmap + requirements committed. Ready to plan Phase 1 (Project Foundation & Data Dictionary).
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on (mirrors `@cosyte/hl7`).
- **Scope boundary:** v1 is metadata-first. Pixel data exposed but not decoded. No DIMSE, no DICOMweb. See `PROJECT.md` "Scope Posture" and "Companion Package Strategy".

## Current Position

Phase: 0 — Initialized.
Next Step: `/gsd-plan-phase 1` — decompose Phase 1 (Project Foundation & Data Dictionary) into plans.

- **Milestone:** v1
- **Phase:** Pre-Phase-1
- **Plans (milestone total):** 0 / ~36 anticipated across 8 phases
- **Status:** Ready to plan Phase 1

```
[                    ] 0%   (0 / 8 phases)
```

## Phase Map

| # | Phase | REQ-IDs | Plans (est.) |
|---|-------|---------|--------------|
| 1 | Project Foundation & Data Dictionary | 11 (SETUP + DICT) | ~4 |
| 2 | Core Parser & Transfer Syntaxes | 24 (PARSE + FM + TS + TOL) | ~6 |
| 3 | Dataset Model, VR Parsing & Sequences | 18 (MODEL + VR + SQ) | ~5 |
| 4 | Named Helpers, Paths & Character Sets | 17 (PATH + HELPERS + CHARSET + PIXEL) | ~5 |
| 5 | Serialization & Round-Trip | 6 (SER) | ~4 |
| 6 | Profile System, Vendor Profiles & Starter Kit | 22 (PROF + BVP + KIT) | ~5 |
| 7 | Anonymization & Strict Validation | 12 (ANON + STRICT) | ~4 |
| 8 | Testing Hardening, Examples & Documentation | 27 (EX + TEST + DOC) | ~5 |

## Key Artifacts

- `.planning/PROJECT.md` — vision, requirements summary, constraints, decisions
- `.planning/REQUIREMENTS.md` — 137 v1 REQ-IDs with phase traceability
- `.planning/ROADMAP.md` — 8-phase breakdown with success criteria
- `.planning/config.json` — GSD workflow settings
- `CLAUDE.md` — project guide for Claude (when authoring / reviewing)

## Open Questions / Deferred Decisions

These are explicitly deferred to the per-phase `/gsd-discuss-phase` loop (they shape plan detail, not phase structure):

- **Character-set decoding dep:** evaluate `iconv-lite` vs Node's built-in `TextDecoder` in Phase 4 discuss-phase. Target ≤ 3 runtime deps total.
- **Data dictionary source format:** choose between the DICOM Part 6 XML source (from the DICOM Standard repo) or an existing parsed JSON fixture — decide in Phase 1 discuss-phase.
- **Dictionary generator language:** plain TypeScript devDep vs a dedicated code-generation tool. Target minimal dev surface.
- **Deflate library:** Node's built-in `zlib` is almost certainly sufficient for Deflated Explicit VR LE — confirm in Phase 2 discuss-phase.
- **Private tag dictionaries for the 5 built-in vendor profiles:** source each vendor's published registrations (public documents + public repositories only). Decide in Phase 6 discuss-phase.

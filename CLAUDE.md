# @cosyte/dicom — Project Guide for Claude

This repo is managed with the **GSD (Get Shit Done)** workflow. Planning artifacts live in `.planning/` and are committed with the code.

## Project

**`@cosyte/dicom`** — a developer-focused DICOM parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT). Sibling to `@cosyte/hl7` at `../hl7-parser`.

**North star:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line — without having read the DICOM standard.

**Scope boundary (v1):** Metadata-first. Pixel data is exposed as raw `Buffer` + encapsulated fragments but **not decoded**. DIMSE network services and DICOMweb are explicit non-goals — tracked as future companion packages (`@cosyte/dicom-pixel`, `@cosyte/dicom-net`, `@cosyte/dicomweb`).

See `.planning/PROJECT.md` for full context, requirements, constraints, and key decisions.

## Status

- **Phase 0 — Initialized.** Next: `/gsd-plan-phase 1`
- Roadmap: 8 phases, 137 v1 REQ-IDs mapped → see `.planning/ROADMAP.md`

## GSD Workflow

**Config** (`.planning/config.json`) — mirrors `@cosyte/hl7` verbatim:

- Mode: `yolo` (auto-approve plans/execution)
- Granularity: `standard` (5–8 phases, 3–5 plans each)
- Parallelization: enabled
- Plan Check + Verifier + Nyquist Validation: enabled
- Commit docs: yes

**Typical phase loop:**

1. `/gsd-discuss-phase N --auto` — gather context / resolve gray-area decisions before planning
2. `/gsd-plan-phase N` — decompose phase into plans (with plan-check agent)
3. `/gsd-execute-phase N` — execute plans in parallel where possible, atomic commits
4. `/gsd-verify-work N` — verifier confirms deliverables match phase goal
5. `/gsd-validate-phase N` — Nyquist validation audits test coverage
6. `/gsd-transition` — update PROJECT.md, advance state

**Commands most likely needed:**

- `/gsd-progress` — status + routing
- `/gsd-next` — auto-advance to next logical step
- `/gsd-plan-phase N` — plan a specific phase
- `/gsd-execute-phase N` — execute a planned phase
- `/gsd-discuss-phase N --auto` — clarify context before planning

## Tech Stack (locked)

- **Language:** TypeScript (strict, `noUncheckedIndexedAccess`)
- **Target:** ES2022, dual ESM + CJS via `tsup`
- **Node:** 18+
- **Package manager:** pnpm
- **Testing:** Vitest
- **Linting:** ESLint + Prettier
- **Runtime deps:** **≤ 3**, each MIT/Apache-licensed and ADR-justified under `.planning/`. Deliberate divergence from `@cosyte/hl7`'s zero-dep rule; DICOM byte-level + charset work earns the exception.
- **License:** MIT

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export — feeds IntelliSense.
- Immutable by default. Mutation only via explicit methods (`setElement`, `addElement`, `removeElement`, `addItem`, `removeItem`).
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings with stable codes and byte-offset positional context); serializer is conservative (always emits spec-clean DICOM Part 10 with correct File Meta group length, even-length values, proper padding).
- Fatal errors only for unrecoverable structural corruption (4 Tier-3 codes: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`). Everything else is a warning.
- Buffer-first API for binary values. String decoding respects `(0008,0005)` Specific Character Set.
- Data dictionary is generated at build time from the official DICOM Part 6 source and committed; runtime has no network/filesystem dependency on it.
- Coverage target: ≥ 90% on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/`.

## Style Reference

This project mirrors `@cosyte/hl7`'s tooling, artifact discipline, and engineering bar — read `../hl7-parser/.planning/` when in doubt. Two deliberate divergences:

1. **Runtime deps allowed (≤ 3)** — see Tech Stack above.
2. **v1 scope narrower than the full standard** — metadata-first, no pixel decode, no network.

## Key Files

- `.planning/PROJECT.md` — vision, requirements summary, constraints, decisions
- `.planning/REQUIREMENTS.md` — 137 v1 REQ-IDs with phase traceability
- `.planning/ROADMAP.md` — 8-phase breakdown with success criteria
- `.planning/STATE.md` — current state (what's next)
- `.planning/config.json` — GSD workflow settings

When in doubt, read `.planning/ROADMAP.md` first to understand the phase structure and which phase a change belongs to.

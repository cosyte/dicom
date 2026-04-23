# @cosyte/dicom

## What This Is

An open-source, developer-focused DICOM parser and utility library for Node.js and TypeScript, published under the Cosyte brand. It lets a developer take a real-world DICOM Part 10 file (the kind PACS systems and modality vendors actually emit), parse it into a typed dataset, and pull useful metadata out in one line — without reading the 6000-page DICOM standard or learning Value Representations, Transfer Syntaxes, and sequence/item nesting rules. The package is both a credibility asset for Cosyte's healthcare imaging integration practice and a production tool used internally on client projects. It is the imaging sibling to `@cosyte/hl7` — same tooling, same guardrails, same artifact discipline, narrower v1 scope.

## Core Value

**A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line — without having read the DICOM standard.** Everything else (typed dataset model, VR-aware value parsing, sequence/item navigation, transfer-syntax handling, profile system for vendor quirks, anonymization helpers, round-trip serialization) supports that north star.

## Scope Posture — Metadata-First

DICOM is enormous: a binary file format, a network protocol family (DIMSE), web services (DICOMweb), dozens of IODs, hundreds of SOP classes, a 4000+ element data dictionary, and several compressed transfer syntaxes for pixel data. v1 deliberately covers the **file-format + metadata slice** that 80% of integration developers actually need. Pixel decoding, DIMSE network services, and DICOMweb are explicit non-goals for v1 and are planned as separate companion packages — see "Companion Package Strategy" below. Pixel data is **exposed but not decoded** in v1: the raw `(7FE0,0010)` pixel data element and its encapsulated fragments (for compressed transfer syntaxes) are accessible as `Buffer`s, but no image decompression, windowing, or rendering is performed.

This is the single most important scoping decision in v1. It cuts v1 from "the entire DICOM standard" down to something shippable in a milestone.

## Requirements

### Validated

(None yet — ship to validate)

### Active

See `REQUIREMENTS.md` for the full categorized list with REQ-IDs.

**Top-level capabilities (v1):**

- [ ] Parse DICOM Part 10 files (128-byte preamble + `DICM` magic + File Meta Information + dataset) — _(PARSE-*, FM-*)_
- [ ] All standard transfer syntaxes for dataset parsing: Implicit VR Little Endian, Explicit VR Little Endian, Explicit VR Big Endian, Deflated Explicit VR Little Endian — _(TS-*)_
- [ ] Typed dataset model with tag-keyed access, VR-aware value parsing (PN, DA, TM, DT, IS, DS, UI, SQ, etc.), proper sequence/item nesting — _(MODEL-*, VR-*, SQ-*)_
- [ ] Named helpers for common extractions (`ds.patient.name`, `ds.patient.id`, `ds.patient.birthDate`, `ds.study.uid`, `ds.study.date`, `ds.series.uid`, `ds.series.modality`, `ds.instance.uid`, `ds.instance.number`, `ds.equipment.manufacturer`, `ds.equipment.modelName`) — _(HELPERS-*)_
- [ ] Tag-path accessors (`ds.get('00100010')`, `ds.get('0040A730/00080100')` for items in sequences) — both hex and keyword forms — _(PATH-*)_
- [ ] Bundled DICOM data dictionary auto-generated at build time from the official DICOM Part 6 source, with tag → keyword + VR + VM lookup — _(DICT-*)_
- [ ] Pixel data exposed as raw element (`Buffer`) + encapsulated fragments for compressed transfer syntaxes; **no decode** in v1 — _(PIXEL-*)_
- [ ] Character-set-aware string decoding via `(0008,0005)` Specific Character Set for PN/LO/SH/LT/ST/UT — _(CHARSET-*)_
- [ ] Lenient default parsing with stable warning codes for real-world deviations (missing preamble, wrong/missing File Meta group length, undefined-length sequences in explicit VR, padded UI/AE values, incorrect VR for known tag, private tags without private creator, group length in non-File-Meta groups, BOM in PN, etc.) — _(TOL-*)_
- [ ] Round-trip serialization: parse → modify → `toBuffer()` produces a valid DICOM Part 10 file with the same transfer syntax (or convert to a different one) — _(SER-*)_
- [ ] First-class `defineProfile()` API for vendor- and integration-specific quirks; private tag dictionaries live in profiles — _(PROF-*)_
- [ ] 5 built-in vendor profiles (GE, Siemens, Philips, Canon/Toshiba, Hologic) registering each vendor's published private tag dictionary — _(BVP-*)_
- [ ] Profile starter kit (`examples/profile-starter-kit/`) publishable as-is for site-specific or modality-specific private tag profiles — _(KIT-*)_
- [ ] Anonymization / de-identification aligned with DICOM PS3.15 Annex E Basic Application Confidentiality Profile, with composable option sets (Retain Patient Characteristics, Retain Longitudinal Temporal, Retain Device Identity, etc.) — _(ANON-*)_
- [ ] Strict mode runs structural validation (required File Meta elements, IOD-level required tags for the SOP class, value multiplicity, VR conformance) and emits typed validation errors — _(STRICT-*)_
- [ ] Three runnable examples (read tags from a file, anonymize a study, walk a multi-frame enhanced MR sequence) — _(EX-*)_
- [ ] Dual ESM + CJS; strict TypeScript; Node 18+ — _(SETUP-*)_
- [ ] Comprehensive README with cookbook + changelog + contributing + license — _(DOC-*)_
- [ ] ≥ 90% line coverage on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/` — _(TEST-*)_

### Out of Scope (v1 — roadmap or separate packages)

- **Pixel data decoding / decompression** (JPEG Baseline, JPEG 2000, JPEG-LS, RLE Lossless, HTJ2K) — likely `@cosyte/dicom-pixel`; v1 exposes raw pixel-data elements and fragments only
- **Image rendering** (windowing, LUTs, overlays, presentation states) — needs pixel decode
- **DIMSE network services** (C-STORE, C-FIND, C-MOVE, C-GET, C-ECHO, N-\* services) — likely `@cosyte/dicom-net`; classic DIMSE over TCP is a major undertaking on its own
- **DICOMweb** (QIDO-RS, WADO-RS, STOW-RS) — likely `@cosyte/dicomweb`
- **DICOM SR (Structured Reporting)** document semantics beyond raw dataset access — separate package; SR is closer to C-CDA in spirit than to image metadata
- **DICOM-RT** (Radiation Therapy IODs — RT Plan, RT Dose, RT Structure Set) beyond raw access
- **DICOMDIR parsing/writing** (DICOM media filesets) — roadmap
- **DICOS** (security/baggage screening) — different deployment context entirely
- **DICOM print management** — effectively dead protocol
- **Multi-frame functional groups deep typed access** — raw access yes, typed shortcuts roadmap
- **Streaming / pull-parser API** — roadmap; v1 reads full files into a `Buffer`
- **Exhaustive IOD / SOP-class conformance validation** — v1 validates structure + File Meta + VR/VM, not every IOD table

## Companion Package Strategy

v1 is `@cosyte/dicom` and stays purely about files + metadata. Follow-on packages planned (names reserved, scope not locked):

- **`@cosyte/dicom-pixel`** — pixel data decoding across all compressed transfer syntaxes (JPEG Baseline, JPEG 2000, JPEG-LS, RLE, HTJ2K) + windowing / LUT / overlay support. Depends on `@cosyte/dicom`.
- **`@cosyte/dicom-net`** — classic DIMSE over TCP (C-ECHO, C-STORE, C-FIND, C-MOVE, C-GET, N-\*). Depends on `@cosyte/dicom`.
- **`@cosyte/dicomweb`** — QIDO-RS, WADO-RS, STOW-RS clients (and maybe servers). Depends on `@cosyte/dicom` + optionally `@cosyte/dicom-pixel`.

v1 public API does **not** export network types or pixel-decode types as placeholders — each companion package ships its own surface. `@cosyte/dicom` stays clean and focused.

## Context

- **Market gap:** Existing Node DICOM parsers are either `dicom-parser` (venerable, low-level, weakly typed, byte-offset-oriented) or wrappers around DCMTK bindings (heavy, native deps, painful to install). The DX bar for a strict-TypeScript, developer-first parser is low; clearing it by a wide margin is tractable.
- **Real-world tolerance is the credibility gate:** Production DICOM from major modality vendors (GE, Siemens, Philips, Canon, Hologic) and PACS routinely violates the published standard — missing File Meta group length, undefined-length sequences in explicit VR, incorrect VR for known tags, private tags without private creators, padded UI/AE values, group length elements in non-File-Meta groups. A parser that strictly enforces the spec rejects a meaningful percentage of real files. The default mode is lenient; deviations surface as warnings with stable codes and byte-offset positional context.
- **Profiles are a growth loop:** Built-ins cover broad vendor patterns, but real production specs live at the integration level (specific modality instances, reference-center protocols, enterprise PACS). Every published profile package is a signal of library adoption and a contribution back. The starter kit is designed so publishing a profile takes minutes, not hours — same philosophy as `@cosyte/hl7`.
- **Dogfooding:** Cosyte uses this internally on client imaging projects, so production hardening isn't theoretical — the library's credibility matches the company's.
- **License choice:** MIT, to maximize adoption. This is a library, not a product.
- **Sibling to `@cosyte/hl7`:** Same tooling, same guardrails, same artifact discipline. Two deliberate divergences: (1) runtime dependencies are allowed (see Constraints); (2) v1 scope is intentionally narrower than the full DICOM standard (see "Scope Posture — Metadata-First" above).

## Constraints

- **Language:** TypeScript strict (`"strict": true`, `"noUncheckedIndexedAccess": true`). No `any`, no unjustified `as` casts.
- **Target:** ES2022, dual package (ESM + CJS) via `tsup`. Node 18+.
- **Runtime deps:** **Allowed, but strictly minimized.** Target **≤ 3** runtime dependencies. Each must be MIT/Apache-licensed, carefully chosen, and justified in an ADR committed under `.planning/`. This is a deliberate divergence from `@cosyte/hl7`'s zero-dep rule — DICOM byte-level work and character-set decoding justify carefully chosen deps. Likely candidates to evaluate in discuss-phase: `iconv-lite` for Specific Character Set decoding beyond what Node's built-in `TextDecoder` covers, or nothing at all if `TextDecoder` suffices. **The data dictionary generator runs at build time and is a `devDependency`**, not a runtime dep.
- **Package manager:** pnpm. Package name: `@cosyte/dicom`. License: MIT.
- **Test coverage:** ≥ 90% line coverage on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/`.
- **Performance expectation:** A 50 MB CT dataset parses (metadata only, skipping pixel-data bytes) in < 100 ms on a modern laptop (documented, not a CI gate).
- **No `console.*` in library code.** Throw typed errors or return results.
- **Immutable by default.** Mutation only through explicit methods (`setElement`, `addElement`, `removeElement`, `addItem`, etc.).
- **Buffer-first API for binary values.** String decoding respects `(0008,0005)` Specific Character Set.
- **Postel's Law:** parser is liberal (lenient default + warnings with stable codes and byte-offset positional context); serializer is conservative (always emits spec-clean DICOM Part 10 with correct File Meta group length, even-length values, proper padding).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1 is metadata-first; pixel data is exposed but not decoded | Cuts v1 from "the entire DICOM standard" down to something shippable in a milestone. Pixel decode is a major undertaking that merits its own package. | — Pending |
| Lenient parsing is the default, not strict | Production DICOM from modality vendors + PACS routinely violates the standard. Strict-by-default would reject real-world files. Strict mode still exists for validators / CI. | — Pending |
| Warnings carry stable string codes + byte-offset positional context | Developers need to programmatically react to specific deviations (e.g., `DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_VR_MISMATCH`, `DICOM_PRIVATE_TAG_NO_CREATOR`, `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`, `DICOM_ODD_LENGTH_VALUE_PADDED`). Human messages alone are not enough. | — Pending |
| Data dictionary is generated at build time from the official DICOM Part 6 source and committed to the repo | Runtime has no network or filesystem dependency on the dictionary. The generator is a devDependency, not a runtime concern. | — Pending |
| Private tags are first-class and live in profiles | Registered by Private Creator string per `(gggg,0010-00FF)` block, exactly as the standard specifies. Built-ins and developer-authored profiles are equal citizens of the same API. | — Pending |
| Profiles are plain data produced by `defineProfile()` | Mirrors `@cosyte/hl7`. Anything shipped as a built-in must be expressible through the public API. Keeps the built-ins honest. | — Pending |
| Serializer always emits spec-clean DICOM Part 10, regardless of what was parsed | Postel's Law. Parser is liberal; emitter is conservative. Correct File Meta group length, even-length values, proper padding — every time. Prevents quirks from propagating downstream. | — Pending |
| Profile starter kit is a first-class deliverable, not a doc section | The growth loop depends on frictionless publishing. "Copy this directory, customize, `pnpm publish`" is the entire target DX. | — Pending |
| Anonymization implements PS3.15 Annex E option sets composably | Default action set is the Basic Application Confidentiality Profile with no retention options enabled. Retention options (Patient Characteristics, Longitudinal Temporal, Device Identity, etc.) compose on top. | — Pending |
| Fatal errors only for unrecoverable structural corruption | Small Tier-3 set: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`. Everything else is a warning. | — Pending |
| Buffer-first values for binary; string decoding is charset-aware via `(0008,0005)` | DICOM is a binary format with explicit character-set declaration. Hiding that behind eager string decoding loses fidelity; exposing `Buffer` + charset-aware decoder respects the format. | — Pending |
| Build-vs-buy on transfer syntax handling, character set decoding, and the data dictionary generator | Revisit each in discuss-phase before locking in any runtime dep. Target ≤ 3 runtime deps; each one justified in an ADR. | — Pending |
| Runtime deps allowed (≤ 3), MIT/Apache licensed, ADR-justified | Deliberate divergence from `@cosyte/hl7`'s zero-dep rule. DICOM byte-level work + charset handling justify careful deps. `iconv-lite` is the likely candidate if Node's built-in `TextDecoder` doesn't cover required code pages (e.g., ISO 2022 sequences for CJK). | — Pending |
| v1 does not export network or pixel-decode placeholder types | Companion packages (`@cosyte/dicom-pixel`, `@cosyte/dicom-net`, `@cosyte/dicomweb`) ship their own public surface. `@cosyte/dicom` stays purely about files + metadata. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 after initialization.*

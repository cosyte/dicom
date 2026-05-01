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
- [ ] Pixel data exposed as raw element (`Buffer`) + encapsulated fragments for compressed transfer syntaxes; **no decompression** in v1 — _(PIXEL-*)_. For uncompressed transfer syntaxes, `ds.image.frames()` reshapes the raw `Buffer` into typed-array views per frame (`Uint8Array | Uint16Array | Int16Array`, shaped `rows × columns × samplesPerPixel`) — this is array-view reshape, not codec-based decompression.
- [ ] Character-set-aware string decoding via `(0008,0005)` Specific Character Set for PN/LO/SH/LT/ST/UT — _(CHARSET-*)_
- [ ] Lenient default parsing with stable warning codes for real-world deviations (missing preamble, wrong/missing File Meta group length, undefined-length sequences in explicit VR, padded UI/AE values, incorrect VR for known tag, private tags without private creator, group length in non-File-Meta groups, BOM in PN, etc.) — _(TOL-*)_
- [ ] Round-trip serialization: parse → modify → `toBuffer()` produces a valid DICOM Part 10 file with the same transfer syntax (or convert to a different one) — _(SER-*)_
- [ ] First-class `defineProfile()` API for vendor- and integration-specific quirks; private tag dictionaries live in profiles — _(PROF-*)_
- [ ] 5 built-in vendor profiles (GE, Siemens, Philips, Canon/Toshiba, Hologic) registering each vendor's published private tag dictionary — _(BVP-*)_
- [ ] Profile starter kit (`examples/profile-starter-kit/`) publishable as-is for site-specific or modality-specific private tag profiles — _(KIT-*)_
- [ ] Anonymization / de-identification aligned with DICOM PS3.15 Annex E Basic Application Confidentiality Profile, with composable option sets covering all 11 Annex E retention / clean options (E.3.1 Clean Pixel Data, E.3.2 Clean Recognizable Visual Features, E.3.3 Clean Graphics, E.3.4 Clean Structured Content, E.3.5 Clean Descriptors, E.3.6 Retain Longitudinal Temporal, E.3.7 Retain Patient Characteristics, E.3.8 Retain Device Identity, E.3.9 Retain UIDs, E.3.10 Retain Safe Private, E.3.11 Retain Institution Identity); always populates audit-trail attributes `(0012,0062)`/`(0012,0063)`/`(0012,0064)`. Pixel-dependent options (E.3.1, E.3.2) throw typed errors directing to `@cosyte/dicom-pixel`. — _(ANON-*)_
- [ ] Strict mode runs structural validation (required File Meta elements, IOD-level required tags for the SOP class, value multiplicity, VR conformance) and emits typed validation errors — _(STRICT-*)_
- [ ] Three runnable examples (read tags from a file, anonymize a study, walk a multi-frame enhanced MR sequence) — _(EX-*)_
- [ ] Dual ESM + CJS; strict TypeScript; Node 18+ — _(SETUP-*)_
- [ ] Comprehensive README with cookbook + changelog + contributing + license — _(DOC-*)_
- [ ] ≥ 90% line coverage on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/` — _(TEST-*)_

### Out of Scope (v1 — roadmap or separate packages)

- **Pixel data decoding / decompression** (JPEG Baseline, JPEG 2000, JPEG-LS, RLE Lossless, HTJ2K) — likely `@cosyte/dicom-pixel`; v1 exposes raw pixel-data elements and fragments only. Note: RLE Lossless is ~40 LOC and would fit inside v1, but is deliberately held back to keep the "no decompression" message crisp; flagged as the #1 post-v1 addition (v1.x).
- **ISO 2022 multi-extension CJK charset combinations** — v1 supports single-extension (e.g., `ISO 2022 IR 6 \ ISO 2022 IR 87` Japanese) via `TextDecoder`; true multi-extension combinations emit `DICOM_UNSUPPORTED_CHARSET` and fall back to UTF-8 with raw bytes still accessible. Revisit in v1.x.
- **DICOM-JSON `bulkDataMode: 'uri'`** — v1 `ds.toJSON()` emits inline binary only (per PS3.18 Annex F). `bulkDataMode: 'uri' | 'omit'` deferred to v1.x.
- **Private-tag validation in `validate()`** — v1 `validate()` covers standard tags only (File Meta / VR / VM). Private-tag validation against profile dictionaries depends on Phase 6 output and is deferred to v1.1 to keep Phase 7's scope clean.
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
- **Runtime deps:** **Target 0–1. Ceiling ≤ 3.** Each must be MIT/Apache-licensed, carefully chosen, and justified in an ADR committed under `.planning/`. Research (`.planning/research/STACK.md`) finds zero-dep viable: Node 18+ ships full-ICU by default so `TextDecoder` covers every WHATWG-labeled DICOM charset (including GB18030, GBK, Shift_JIS, EUC-JP, EUC-KR, ISO-2022-JP), and Node `zlib.inflateRawSync` covers Deflated Explicit VR LE (RFC 1951 raw deflate, **not** `inflateSync`). The one conditional candidate is `iconv-lite@0.7.x` — added only if a required ISO 2022 multi-extension fixture proves `TextDecoder` insufficient, gated on a failing fixture. **The data dictionary generator and the PS3.15 Annex E attribute-action-table generator are `devDependencies`**, not runtime deps.
- **Dev toolchain pinning (because of Node 18 floor):** Vitest **3.x** (Vitest 4 dropped Node 18), ESLint **9.x** (ESLint 10 dropped Node 18), TypeScript **5.9.x** (TS 6.0 shipped 2026-04-16 — defer), tsup **8.5.x**, Prettier **3.8.x**, tsx **4.21.x**, pnpm **10.33.x**.
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
| Data dictionary is generated at build time from Innolitics' `dicom-standard/attributes.json` (MIT, monthly regen from NEMA) at a pinned commit SHA, committed to the repo as generated output | NEMA publishes PS3.6 as 9.6 MB DocBook XML; Innolitics already parses it monthly into clean JSON. Using the parsed JSON saves a parser devDep and tracks NEMA freshness without in-repo XML work. Runtime has no network or filesystem dependency. | — Pending |
| PS3.15 Annex E attribute action table is generator-sourced, not hand-curated | Same pattern as the Part 6 dictionary — Annex E's 11 option sets × ~200 attributes is too big to maintain by hand. Generator is a devDependency. | — Pending |
| VR value decoding is lazy + memoized; structural pass (tag/VR/length/offset/rawBytes) is eager | Eager decoding of every VR for a 50 MB CT dataset takes ~300 ms; lazy + memoized is ~12 ms. Byte-offset-dependent warnings (VR mismatch, odd length, private-tag-no-creator) still emit during the eager structural pass so `ds.warnings` is snapshot-stable after parse. | — Pending |
| Mutation is copy-on-write | `setElement` / `addElement` / `removeElement` return new `Dataset` objects, preserving the immutable-by-default contract at the API surface. Mirrors `@cosyte/hl7`. | — Pending |
| Private Creator block reservation: creator at `(gggg,00XX)` reserves `(gggg,XX00)–(gggg,XXFF)` | The element's low byte XX becomes the reserved sub-range's high byte. Off-by-0x1000 is the canonical parser bug — every competing library has historically gotten this wrong. Called out explicitly so implementation + tests cover it. | — Pending |
| Private tags are first-class and live in profiles | Registered by Private Creator string per `(gggg,0010-00FF)` block, exactly as the standard specifies. Built-ins and developer-authored profiles are equal citizens of the same API. | — Pending |
| Profiles are plain data produced by `defineProfile()` | Mirrors `@cosyte/hl7`. Anything shipped as a built-in must be expressible through the public API. Keeps the built-ins honest. | — Pending |
| Serializer always emits spec-clean DICOM Part 10, regardless of what was parsed | Postel's Law. Parser is liberal; emitter is conservative. Correct File Meta group length, even-length values, proper padding — every time. Prevents quirks from propagating downstream. | — Pending |
| Profile starter kit is a first-class deliverable, not a doc section | The growth loop depends on frictionless publishing. "Copy this directory, customize, `pnpm publish`" is the entire target DX. | — Pending |
| Anonymization implements PS3.15 Annex E option sets composably | Default action set is the Basic Application Confidentiality Profile with no retention options enabled. Retention options (Patient Characteristics, Longitudinal Temporal, Device Identity, etc.) compose on top. | — Pending |
| Fatal errors only for unrecoverable structural corruption | Small Tier-3 set: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`. Everything else is a warning. | — Pending |
| Buffer-first values for binary; string decoding is charset-aware via `(0008,0005)` | DICOM is a binary format with explicit character-set declaration. Hiding that behind eager string decoding loses fidelity; exposing `Buffer` + charset-aware decoder respects the format. | — Pending |
| Runtime deps: target 0–1, ceiling ≤ 3 | Research finds zero-dep viable: Node 18+ full-ICU `TextDecoder` + `zlib.inflateRawSync` cover the stack. `iconv-lite@0.7.x` is a conditional candidate gated on a failing ISO 2022 multi-extension fixture. Ceiling ≤ 3 preserves flexibility. Deliberate divergence from `@cosyte/hl7`'s zero-dep rule remains available but rarely needed. | — Pending |
| Deflated Explicit VR LE uses `zlib.inflateRawSync` (RFC 1951 raw deflate), NOT `zlib.inflateSync` (RFC 1950 zlib-wrapped) | PS3.5 §A.5 mandates raw deflate. `inflateSync` fails silently on raw deflate input. Critical: called out to avoid a canonical silent-wrong bug. | — Pending |
| Dev toolchain pinned to Node-18-compatible majors | Vitest 4 + ESLint 10 dropped Node 18 in late 2025 / early 2026; TS 6.0 shipped 2026-04-16. Pinning Vitest 3.x + ESLint 9.x + TS 5.9.x keeps sibling parity with `@cosyte/hl7` and a Node 18 floor. Re-evaluate at v1.1. | — Pending |
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
*Last updated: 2026-05-01 after Phase 1 (Project Foundation & Data Dictionary) verified complete — 13 REQ-IDs satisfied, 27 CONTEXT decisions honored, 33 unit tests passing, dual-build pipeline + dictionary + Annex E generators + PHI-scan + CI workflows all green.*

# @cosyte/dicom — Roadmap (v1)

North star: **A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line — without having read the DICOM standard.**

- **Granularity:** standard (8 phases, 3–5 plans each anticipated)
- **Mode:** yolo (auto-advance enabled)
- **Parallelization:** enabled — plans within a phase may run in parallel where they touch disjoint modules
- **Coverage:** 137 / 137 v1 REQ-IDs mapped to exactly one phase
- **Scope boundary:** v1 is metadata-first. Pixel data exposed but not decoded. No DIMSE, no DICOMweb. See `PROJECT.md` "Scope Posture" and "Companion Package Strategy".

---

## Phases

- [ ] **Phase 1: Project Foundation & Data Dictionary** — Scaffold the repo (tsup, pnpm, TypeScript strict, Node 18+, Vitest, ESLint, Prettier) and build the Part 6 data dictionary generator + generated output so every subsequent phase consumes a stable tag → VR / keyword / VM lookup.
- [ ] **Phase 2: Core Parser & Transfer Syntaxes** — Parse DICOM Part 10 (preamble + `DICM` + File Meta Information + dataset) across all four v1 transfer syntaxes (Implicit VR LE, Explicit VR LE, Explicit VR BE, Deflated Explicit VR LE) with a lenient default, warnings system, and strict-mode escalation.
- [ ] **Phase 3: Dataset Model, VR Parsing & Sequences** — Expose the parsed dataset as an immutable, tag-keyed model with VR-aware value parsing (PN, DA/TM/DT, IS/DS, UI, numeric binaries, text) and proper sequence/item nesting for SQ elements.
- [ ] **Phase 4: Named Helpers, Paths & Character Sets** — Ship the one-line DX: `ds.patient`, `ds.study`, `ds.series`, `ds.instance`, `ds.equipment`, `ds.image`; tag-path accessors (`ds.get('0040A730/00080100')`); `(0008,0005)` Specific Character Set decoding; raw pixel-data exposure (no decode).
- [ ] **Phase 5: Serialization & Round-Trip** — `toBuffer()`, `toJSON()`, `prettyPrint()` emit spec-clean DICOM Part 10 and preserve semantics across parse → mutate → serialize → parse, including transfer-syntax transcoding among the 4 v1 syntaxes.
- [ ] **Phase 6: Profile System, Vendor Profiles & Starter Kit** — `defineProfile()` API with merge/extend semantics, 5 built-in vendor profiles (GE, Siemens, Philips, Canon, Hologic) registering each vendor's published private tag dictionary, plus the publishable profile starter kit.
- [ ] **Phase 7: Anonymization & Strict Validation** — `anonymize()` implementing PS3.15 Annex E Basic Application Confidentiality Profile with composable retention option sets; `validate()` structural validator for File Meta, VR, and VM conformance.
- [ ] **Phase 8: Testing Hardening, Examples & Documentation** — Canonical / edge-case / vendor-quirk / profile / anonymization test suites verifying ≥ 90% coverage on core modules; three runnable examples; comprehensive README + cookbook + CHANGELOG + CONTRIBUTING + LICENSE.

---

## Phase Details

### Phase 1: Project Foundation & Data Dictionary
**Goal**: A developer cloning the repo can install, build, typecheck, lint, and test with a single command sequence; every downstream phase imports a fully-typed DICOM data dictionary generated at build time from the official Part 6 source.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, DICT-01, DICT-02, DICT-03, DICT-04, DICT-05
**Success Criteria** (what must be TRUE):
  1. A developer can run `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` from a clean clone and every command exits 0 with zero warnings.
  2. A developer importing the package from an ESM project and another from a CJS project both resolve the correct entry through the `exports` map and receive typed IntelliSense.
  3. A developer inspecting `package.json` sees ≤ 3 runtime `dependencies` (each MIT/Apache-licensed and justified in an ADR committed under `.planning/`), `"type": "module"`, dual-build artifacts declared, and Node 18+ engines field.
  4. A developer editing any `.ts` file gets strict-mode errors for `any`, unchecked index access, and missing types from their editor immediately.
  5. A developer calling `Dictionary.lookup('00100010')`, `Dictionary.lookup('PatientName')`, and `Dictionary.byKeyword('StudyInstanceUID')` receives typed `{ keyword, vr, vm, retired }` results; re-running the generator produces byte-identical output (CI gate).
**Plans**: 4–5 plans anticipated (package-scaffold, build-system, lint-and-test, dictionary-generator, smoke-verification)
**UI hint**: no

### Phase 2: Core Parser & Transfer Syntaxes
**Goal**: A developer calling `parseDicom(buffer)` on any well-formed DICOM Part 10 file using any of the four v1 transfer syntaxes — including vendor-quirky input — receives a structurally correct `Dataset` with stable, byte-offset-positional warnings surfaced for every known deviation.
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, PARSE-06, FM-01, FM-02, FM-03, FM-04, TS-01, TS-02, TS-03, TS-04, TOL-01, TOL-02, TOL-03, TOL-04, TOL-05, TOL-06, TOL-07, TOL-08, TOL-09, TOL-10
**Success Criteria** (what must be TRUE):
  1. A developer can parse a Part 10 file using any of the four v1 transfer syntaxes (Implicit VR LE, Explicit VR LE, Explicit VR BE, Deflated Explicit VR LE) and receive correctly decomposed elements with correct VR, length, and byte-offset positioning.
  2. A developer parsing a file with a missing preamble, File Meta group length mismatch, odd-length value, undefined-length sequence in explicit VR, VR mismatch for a known tag, private tag without creator, or group length in non-File-Meta groups gets a parsed dataset in lenient mode plus `ds.warnings` entries with stable codes and byte-offset context — and receives `onWarning` callbacks as they are emitted.
  3. A developer parsing non-DICOM / truncated / unsupported-transfer-syntax / empty input receives a thrown `DicomParseError` with a stable code (`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`), byte offset, and snippet — even in lenient mode.
  4. A developer opting into `{ strict: true }` gets every Tier 2 deviation escalated to a thrown `DicomParseError` rather than a warning.
  5. A developer inspecting `ds.fileMeta` sees the File Meta group always parsed with Explicit VR Little Endian regardless of the dataset's transfer syntax, exposing `transferSyntaxUID`, `mediaStorageSopClassUID`, `mediaStorageSopInstanceUID`, and the implementation identifiers.
**Plans**: 5–6 plans anticipated (warnings/errors/dataset-shell, part10-header-and-file-meta, implicit-VR-LE, explicit-VR-LE-and-BE, deflated-LE, strict-mode-escalation)
**UI hint**: no

### Phase 3: Dataset Model, VR Parsing & Sequences
**Goal**: A developer accessing a parsed dataset can iterate elements, read them by tag, and receive strongly typed composite values (PN, DA/TM/DT, IS/DS, UI, numeric binaries, long-text) — and can navigate sequence items as nested datasets.
**Depends on**: Phase 2
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, VR-01, VR-02, VR-03, VR-04, VR-05, VR-06, VR-07, SQ-01, SQ-02, SQ-03, SQ-04
**Success Criteria** (what must be TRUE):
  1. A developer can call `ds.get('00100010')`, `ds.get('PatientName')`, `ds.has(tag)`, `ds.elements()`, and `ds.getAll(tag)` and receive correctly resolved elements / iterables with full typing.
  2. A developer accessing a non-existent tag receives `undefined` / `[]` rather than an exception.
  3. A developer mutating a dataset via `setElement`, `addElement`, `removeElement`, `addItem`, `removeItem` sees changes reflected on subsequent reads; direct mutation of an unwrapped object has no effect (immutability by default).
  4. A developer importing the library receives typed interfaces for parsed Person Name (PN), Date/Time/DateTime (DA/TM/DT → JS Date with raw string accessible), Integer/Decimal String (IS/DS → number[]), UID (UI with trailing-NULL trimmed), and binary numeric VRs (US/UL/SS/SL/FL/FD/AT) with correct endian handling.
  5. A developer can navigate sequences: `ds.get('0040A730').items[0].get('00080100')` resolves a nested element, and undefined-length sequences parse correctly with their `FFFE,E00D` / `FFFE,E0DD` markers (with Tier 2 warning if the transfer syntax is Explicit VR).
**Plans**: 5 plans anticipated (model-and-tag-access, string-and-numeric-VRs, pn-and-date-VRs, sequence-navigation, mutation-and-barrel)
**UI hint**: no

### Phase 4: Named Helpers, Paths & Character Sets
**Goal**: A developer can fulfill the north star — one-line extraction of common DICOM metadata — through `ds.patient`, `ds.study`, `ds.series`, `ds.instance`, `ds.equipment`, `ds.image`, and tag-path accessors like `ds.get('0040A730/00080100')`, with correct character-set decoding for non-ASCII string values and raw pixel-data exposure.
**Depends on**: Phase 3
**Requirements**: PATH-01, PATH-02, PATH-03, PATH-04, HELPERS-01, HELPERS-02, HELPERS-03, HELPERS-04, HELPERS-05, HELPERS-06, HELPERS-07, CHARSET-01, CHARSET-02, CHARSET-03, PIXEL-01, PIXEL-02, PIXEL-03
**Success Criteria** (what must be TRUE):
  1. A developer can read `ds.patient.name`, `ds.patient.id`, `ds.patient.birthDate` (Date), `ds.study.uid`, `ds.study.date` (Date), `ds.series.modality`, `ds.instance.uid`, `ds.equipment.manufacturer`, `ds.equipment.modelName` and related fields without touching tag hex directly; absent fields return `undefined` and never throw.
  2. A developer can call `ds.get('0040A730/00080100')` for item-in-sequence access, `ds.get('0040A730[1]/00080100')` for explicit item index, and `ds.getAll(path)` for repetition flattening; unresolvable paths return `undefined` / `[]` without throwing.
  3. A developer parsing a file with a non-UTF-8 `(0008,0005)` Specific Character Set (e.g., ISO_IR 100, ISO_IR 192, GB18030, and single-extension ISO 2022 for Japanese) sees PN / LO / SH / LT / ST / UT values decoded correctly; unsupported charsets emit `DICOM_UNSUPPORTED_CHARSET` and fall back to UTF-8 with raw bytes still accessible.
  4. A developer accessing `ds.image.rows`, `ds.image.columns`, `ds.image.bitsAllocated`, `ds.image.pixelSpacing`, `ds.image.numberOfFrames` receives typed values; `ds.pixelData` returns a `Buffer` for uncompressed transfer syntaxes and `{ fragments: Buffer[], basicOffsetTable?: Buffer }` for encapsulated ones.
  5. A developer reading the `ds.pixelData` JSDoc / README section sees an explicit note that v1 does NOT decode pixels and a link to the roadmap `@cosyte/dicom-pixel` companion package.
**Plans**: 5 plans anticipated (tag-path-accessors, helpers-patient-study-series-instance, helpers-equipment-image, charset-decoding, pixel-data-exposure)
**UI hint**: no

### Phase 5: Serialization & Round-Trip
**Goal**: A developer can take a parsed, mutated, or constructed dataset and emit a spec-clean DICOM Part 10 file — or a JSON / pretty-printed view — such that parse → modify → serialize → parse yields an equivalent dataset; transcoding between the 4 v1 transfer syntaxes is supported.
**Depends on**: Phase 3
**Requirements**: SER-01, SER-02, SER-03, SER-04, SER-05, SER-06
**Success Criteria** (what must be TRUE):
  1. A developer calling `ds.toBuffer()` on any parsed dataset (including vendor-quirky input) receives a valid DICOM Part 10 file with a 128-byte preamble, `DICM` magic, correct File Meta (Explicit VR LE, with correct group length), and a dataset encoded in its original transfer syntax.
  2. A developer running `parseDicom(ds.toBuffer())` on any fixture receives a dataset equivalent to the original (same elements, values, sequence structure).
  3. A developer calling `ds.toBuffer({ transferSyntax: 'TARGET_UID' })` transcodes between the 4 v1 transfer syntaxes; unsupported targets throw `UNSUPPORTED_TRANSFER_SYNTAX`.
  4. A developer calling `ds.toJSON()` receives a structured JSON representation (DICOM-JSON-style) suitable for snapshotting / cross-process transport, and `ds.prettyPrint()` returns a human-readable multi-line string.
  5. A developer inspecting a re-serialized file sees correct even-length padding per VR (space for text, NULL for UI), correct File Meta group length, and no leaked quirks from the original input (Postel's Law: conservative emitter).
**Plans**: 4 plans anticipated (emit-element-primitive-and-file-meta, emit-dataset-in-original-TS, transcode-between-v1-TS, toJson-prettyPrint-and-round-trip-sweep)
**UI hint**: no

### Phase 6: Profile System, Vendor Profiles & Starter Kit
**Goal**: A developer can define, extend, and compose vendor / integration profiles via a first-class public API, apply them to parses, and rely on 5 ready-made vendor profiles (GE, Siemens, Philips, Canon, Hologic) that register each vendor's published private tag dictionary and reduce warnings against realistic vendor shapes. A publishable profile starter kit ships alongside.
**Depends on**: Phase 2, Phase 3, Phase 5
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, BVP-01, BVP-02, BVP-03, BVP-04, BVP-05, BVP-06, KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07
**Success Criteria** (what must be TRUE):
  1. A developer calling `defineProfile({ name, ... })` with valid input receives a readonly `Profile` object exposing `name`, `description`, `privateTags`, `lineage`, and `describe()`; invalid input throws `ProfileDefinitionError` with an actionable message.
  2. A developer using `extends: parentProfile` or `extends: [p1, p2]` receives a profile whose merged options follow the documented semantics (scalars overwrite, arrays concat+dedupe, `privateTags` deep-merge by Private Creator, `onWarning` handlers chain).
  3. A developer calling `parseDicom(buf, profile)` sees `ds.profile?.name` and `ds.profile?.lineage` populated, private tags accessible by their declared keyword, and re-serialization producing spec-clean DICOM.
  4. A developer importing `profiles.ge`, `profiles.siemens`, `profiles.philips`, `profiles.canon`, or `profiles.hologic` and parsing a realistic vendor-shape fixture with the profile receives fewer warnings than parsing the same fixture in lenient mode without a profile; each built-in is defined through the public `defineProfile()` API.
  5. A developer copying `examples/profile-starter-kit/` into a new directory can run `pnpm install && pnpm test && pnpm build` against the sample fixture with success; `dist/` entries match the `package.json` exports; CI and publish workflows validate with `actionlint`; `CUSTOMIZING.md` walks through rename → swap base → define private tags → fixtures → publish.
**Plans**: 5 plans anticipated (defineProfile-core-and-validation, extends-merge-semantics, parseDicom-dispatch-and-private-tag-resolution, built-in-vendor-profiles-and-fixtures, starter-kit)
**UI hint**: no

### Phase 7: Anonymization & Strict Validation
**Goal**: A developer can run `anonymize(ds)` on any dataset and receive a de-identified copy per DICOM PS3.15 Annex E Basic Application Confidentiality Profile (with composable retention option sets), and can run `validate(ds)` to get structural + VR + VM conformance errors without throwing.
**Depends on**: Phase 3, Phase 5
**Requirements**: ANON-01, ANON-02, ANON-03, ANON-04, ANON-05, ANON-06, ANON-07, STRICT-01, STRICT-02, STRICT-03, STRICT-04, STRICT-05
**Success Criteria** (what must be TRUE):
  1. A developer calling `anonymize(ds)` receives a new `Dataset` (source unchanged, immutability preserved) with PS3.15 Annex E Basic Application Confidentiality Profile applied: identifying elements removed/zeroed/dummied per the Annex E action table, with no retention options enabled by default.
  2. A developer composing retention options — `anonymize(ds, { retain: ['PatientCharacteristics', 'LongitudinalTemporal', 'DeviceIdentity'] })` — receives a dataset where each option's Annex E action-set overrides layer cleanly on top of the base profile.
  3. A developer inspecting a study anonymized with `K` (Keep) / `D` (Dummy) / `Z` (Zero) / `X` (Remove) / `C` (Clean) / `U` (UID replace) actions sees each action applied per the Annex E spec; internal UID consistency is preserved (if Study UID changes, every reference to that Study UID elsewhere in the dataset is replaced with the same new UID via a per-session map).
  4. A developer calling `validate(ds)` on a malformed-but-parsed dataset receives `{ valid: false, errors: [...] }` with typed errors for: missing required File Meta elements, VR mismatch against the data dictionary, VM violation against the data dictionary.
  5. A developer opting into `parseDicom(buffer, { strict: true })` gets every Tier 2 deviation escalated to a thrown `DicomParseError` (the parser-level flavor of strict; `validate()` is the post-parse, non-throwing flavor).
**Plans**: 4 plans anticipated (annex-e-basic-profile, retention-option-sets, uid-consistency-and-session-map, structural-validator)
**UI hint**: no

### Phase 8: Testing Hardening, Examples & Documentation
**Goal**: A developer running the test suite sees ≥ 90% coverage on parser / dataset / dictionary / helpers plus concrete evidence — canonical fixtures across all 4 transfer syntaxes, edge cases, vendor-quirk fixtures, strict-mode escalation, profile authoring, anonymization — that the library behaves as specified end to end. A developer landing on the README can go from zero to reading a DICOM tag in under a minute, find a recipe for every common task, and copy the profile starter kit recipe into a new directory to publish their own profile package.
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
**Requirements**: EX-01, EX-02, EX-03, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08, DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14, DOC-15, DOC-16
**Success Criteria** (what must be TRUE):
  1. A developer running `pnpm test --coverage` sees ≥ 90% line coverage on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/`, and a green test suite; CI enforces the gate on every PR.
  2. A developer reviewing `test/fixtures/` finds canonical fixtures that round-trip losslessly for a CT (Implicit VR LE), MR (Explicit VR LE), US (Explicit VR BE), SC (Deflated Explicit VR LE), a deep-sequence enhanced MR, a private-tag vendor fixture, a multi-frame fixture, and an encapsulated-compressed-pixel-data fixture (fragments only — no decode).
  3. A developer reviewing `test/fixtures/vendor-quirks/` finds at least one fixture per Tier 2 warning scenario; each one parses in lenient mode with the expected warning code and throws `DicomParseError` under `{ strict: true }`.
  4. A developer running `tsx examples/read-tags.ts`, `examples/anonymize-study.ts`, and `examples/walk-multi-frame-mr.ts` sees each example execute end-to-end and print the documented output.
  5. A developer opening the README on GitHub or npm sees the one-sentence value prop as the first line, badges, a 30-second copy-pasteable quickstart, a 6–8-bullet feature list (with explicit "not in v1" callouts for pixel decode / network), a "DICOM in 90 seconds" section, the three access patterns, the full cookbook (all recipes listed in REQUIREMENTS.md DOC-06), a top-level Profiles section, a 3-tier tolerance section with table and runnable example, an Anonymization section, an Error Handling section, a Scope & Companion Packages section, a Contributing section, and the "Built by Cosyte" footer with license link. CHANGELOG.md (Keep-a-Changelog with `[Unreleased]`) and LICENSE (MIT) exist at repo root.
**Plans**: 5 plans anticipated (fixture-authoring-and-coverage-gate, examples, readme-and-cookbook, changelog-contributing-license, final-smoke-and-coverage)
**UI hint**: no

---

## Parallelization Notes

Within each phase, plans that touch disjoint modules may run in parallel; plans that share a module must serialize.

- **Phase 1:** Toolchain plans (tsup config, Vitest config, ESLint+Prettier, tsconfig + strict flags, package.json exports + scripts) are largely independent and can run in parallel. Dictionary generator is a distinct module (`scripts/generate-dictionary.ts` + `src/dictionary/generated.ts`) and can run in parallel with the toolchain plans. A final smoke-test plan runs last to verify the full `install/build/typecheck/lint/test` pipeline and the dictionary re-gen CI check.
- **Phase 2:** Part 10 header / File Meta reader is the first plan (shared dependency). The four transfer-syntax parsers (Implicit VR LE, Explicit VR LE, Explicit VR BE, Deflated LE) are independent and parallelizable. Warnings / errors registry and `onWarning` plumbing should be built early and consumed by each parser plan; strict-mode escalation is a capstone plan.
- **Phase 3:** `Dataset` + tag-access foundation is serial. VR parsers (PN, DA/TM/DT, IS/DS, UI, binary numerics, long-text) are mutually independent and parallelizable. Sequence/item navigation layers on top of the model. Mutation is a final plan gated on the read path.
- **Phase 4:** `ds.patient`, `ds.study`, `ds.series`, `ds.instance`, `ds.equipment`, `ds.image` helpers are read-only and mutually independent (distinct tag sets) — all parallelizable. Tag-path accessor + character-set decoder are independent of each other and of the helpers. Pixel-data exposure is independent.
- **Phase 5:** `toBuffer()` emitter and `toJSON()` can run in parallel (disjoint emitters). `prettyPrint()` is independent. Transcoding between transfer syntaxes layers on top of the emitter. Round-trip fixture sweep is a final plan.
- **Phase 6:** `defineProfile()` core + validation is the first plan. `extends` / merge semantics and default-profile management can then parallelize. The five built-in profiles (ge, siemens, philips, canon, hologic) are mutually independent and all parallelizable once the API surface stabilizes. The starter kit is an independent subtree that can be built alongside the built-ins.
- **Phase 7:** Annex E Basic Profile action table and retention option sets are serial. UID consistency / session-map layer is a distinct plan. Structural validator (File Meta / VR / VM) is fully independent of anonymization and can run in parallel.
- **Phase 8:** Fixture authoring (canonical per transfer syntax, edge-case, vendor-quirk, profile, anonymization) parallelizes across contributors. The three examples are independent. README decomposes into quickstart + feature list, access patterns, cookbook, profiles section, tolerance section, anonymization section, scope section — most of which parallelize. CHANGELOG and LICENSE are trivially parallel. Coverage gate is a capstone.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation & Data Dictionary | 0/~4 | Pending | — |
| 2. Core Parser & Transfer Syntaxes | 0/~6 | Pending | — |
| 3. Dataset Model, VR Parsing & Sequences | 0/~5 | Pending | — |
| 4. Named Helpers, Paths & Character Sets | 0/~5 | Pending | — |
| 5. Serialization & Round-Trip | 0/~4 | Pending | — |
| 6. Profile System, Vendor Profiles & Starter Kit | 0/~5 | Pending | — |
| 7. Anonymization & Strict Validation | 0/~4 | Pending | — |
| 8. Testing Hardening, Examples & Documentation | 0/~5 | Pending | — |

**v1 milestone:** 0/8 phases complete. Next: `/gsd-plan-phase 1`.

---

*Last updated: 2026-04-22 at initialization.*

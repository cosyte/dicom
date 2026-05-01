# @cosyte/dicom — Roadmap (v1)

North star: **A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line — without having read the DICOM standard.**

- **Granularity:** standard (8 phases, 3–5 plans each anticipated)
- **Mode:** yolo (auto-advance enabled)
- **Parallelization:** enabled — plans within a phase may run in parallel where they touch disjoint modules; **Phase 4 and Phase 5 may run in parallel** after Phase 3 ships (disjoint module trees).
- **Coverage:** 144 / 144 v1 REQ-IDs mapped to exactly one phase
- **Scope boundary:** v1 is metadata-first. Pixel data exposed (raw `Buffer` + encapsulated fragments + uncompressed typed-array reshape via PIXEL-04) but no codec-based decompression. No DIMSE, no DICOMweb. See `PROJECT.md` "Scope Posture" and "Companion Package Strategy".
- **Research-reconciled:** 2026-04-22 against `.planning/research/SUMMARY.md`. Key roadmap deltas folded in: Phase 3 directly depends on Phase 1 (dictionary); Phase 4 + Phase 5 parallelizable after Phase 3; Phase 1 gains an Annex E action-table generator plan; Phase 7 `validate()` scoped to standard tags only (private-tag validation deferred to v1.1); Phase 7 ANON expanded to cover all 11 Annex E option sets + audit-trail attributes + burned-in-annotation guardrail.

---

## Phases

- [x] **Phase 1: Project Foundation & Data Dictionary** — Scaffold the repo (tsup, pnpm, TypeScript strict, Node 18+, Vitest 3.x, ESLint 9.x, Prettier) and build two build-time generators: the Part 6 data + UID dictionary generator (consuming Innolitics' `dicom-standard/attributes.json`) and the PS3.15 Annex E attribute-action-table generator. Plus a PHI-scan CI hook. _Completed 2026-05-01._
- [x] **Phase 2: Core Parser & Transfer Syntaxes** — Parse DICOM Part 10 (preamble + `DICM` + File Meta Information + dataset) across all four v1 transfer syntaxes (Implicit VR LE, Explicit VR LE, Explicit VR BE, Deflated Explicit VR LE — using `zlib.inflateRawSync` for RFC 1951 raw deflate) with a lenient default, warnings system, and strict-mode escalation. **Completed 2026-05-01.**
- [ ] **Phase 3: Dataset Model, VR Parsing & Sequences** — Expose the parsed dataset as an immutable, tag-keyed model with lazy + memoized VR-aware value parsing (PN, DA/TM/DT, IS/DS, UI, numeric binaries, text) and proper sequence/item nesting for SQ elements (including CP-246 UN-as-SQ descent).
- [ ] **Phase 4: Named Helpers, Paths, Character Sets & Pixel Exposure** — Ship the one-line DX: `ds.patient`, `ds.study`, `ds.series`, `ds.instance`, `ds.equipment`, `ds.image`; tag-path accessors (`ds.get('0040A730/00080100')`); `(0008,0005)` Specific Character Set decoding; raw pixel-data exposure plus uncompressed typed-array reshape via `ds.image.frames()` (PIXEL-04).
- [ ] **Phase 5: Serialization & Round-Trip** — `toBuffer()`, `toJSON()` (PS3.18 Annex F DICOM-JSON), `prettyPrint()` emit spec-clean DICOM Part 10 and preserve semantics across parse → mutate → serialize → parse, including transfer-syntax transcoding among the 4 v1 syntaxes. Symmetric VR encoder table in `src/serialize/encode-vr/` mirrors the Phase 3 decoder table.
- [ ] **Phase 6: Profile System, Vendor Profiles & Starter Kit** — `defineProfile()` API with merge/extend semantics and correct Private Creator block-reservation resolution (`(gggg,00XX)` reserves `(gggg,XX00)–(gggg,XXFF)`); 5 built-in vendor profiles (GE, Siemens, Philips, Canon/Toshiba, Hologic) registering each vendor's published private tag dictionary + safe-private declarations (consumed by ANON-10); plus the publishable profile starter kit.
- [ ] **Phase 7: Anonymization & Strict Validation** — `anonymize()` implementing PS3.15 Annex E Basic Application Confidentiality Profile with all 11 composable retention / clean option sets; audit-trail attributes `(0012,0062)`/`(0012,0063)`/`(0012,0064)` always populated; burned-in-annotation guardrail. `validate()` structural validator for File Meta, VR, VM (standard tags only — private-tag validation deferred to v1.1).
- [ ] **Phase 8: Testing Hardening, Examples & Documentation** — Canonical / edge-case / vendor-quirk / profile / anonymization test suites verifying ≥ 90% coverage on core modules; three runnable examples; comprehensive README + cookbook + CHANGELOG + CONTRIBUTING + LICENSE; fixture-provenance documentation.

---

## Phase Details

### Phase 1: Project Foundation & Data Dictionary
**Goal**: A developer cloning the repo can install, build, typecheck, lint, and test with a single command sequence; every downstream phase imports fully-typed DICOM data + UID dictionaries generated at build time, and an Annex E attribute-action table generated at build time; a PHI-scan CI hook blocks accidental commits of real PHI-bearing test fixtures.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, DICT-01, DICT-02, DICT-03, DICT-04, DICT-05, DICT-06, TEST-09 (CI-scan half)
**Success Criteria** (what must be TRUE):
  1. A developer can run `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` from a clean clone and every command exits 0 with zero warnings.
  2. A developer importing the package from an ESM project and another from a CJS project both resolve the correct entry through the `exports` map and receive typed IntelliSense; `attw` passes on the published tarball.
  3. A developer inspecting `package.json` sees **0–1 runtime `dependencies`** (ceiling ≤ 3, each MIT/Apache-licensed and ADR-justified under `.planning/`), `"type": "module"`, dual-build artifacts declared, and `"engines": { "node": ">=18.18.0" }`. Dev toolchain pinned to Vitest 3.x, ESLint 9.x, TypeScript 5.9.x, tsup 8.5.x.
  4. A developer editing any `.ts` file gets strict-mode errors for `any`, unchecked index access, and missing types from their editor immediately.
  5. A developer calling `Dictionary.lookup('00100010')`, `Dictionary.lookup('PatientName')`, `Dictionary.byKeyword('StudyInstanceUID')`, and `Dictionary.uid('1.2.840.10008.1.2.1')` receives typed results; re-running both generators (Part 6 dictionary + Annex E action table) produces byte-identical output (CI gates on both).
  6. CI PHI-scan hook rejects any commit introducing fixture files with DA/DT within the last 120 years or PN values outside the synthetic allow-list.
**Plans**: 5 plans
- [ ] 01-01-PLAN.md — Package scaffold + locked toolchain + ALL pnpm scripts wired (SETUP-01..06)
- [ ] 01-02-PLAN.md — Innolitics dictionary + UID generator → committed `src/dictionary/generated/{tags,keywords,uids}.ts` + public `Dictionary.{lookup,byKeyword,uid}` (DICT-01..06)
- [ ] 01-03-PLAN.md — PS3.15 Annex E action-table generator (Innolitics-first / NEMA-DocBook-fallback per CONTEXT D-14) → `src/dictionary/generated/annex-e.ts` (Phase 7 input artifact)
- [ ] 01-04-PLAN.md — Pure-Node PHI-scan + simple-git-hooks pre-commit hook + 9 unit tests (TEST-09 CI-scan half)
- [ ] 01-05-PLAN.md — CI workflows (ci.yml on Node 18.18/20/22, dictionary-regen.yml, publish.yml) + ESM/CJS smoke harness + final acceptance run
**UI hint**: no

### Phase 2: Core Parser & Transfer Syntaxes
**Goal**: A developer calling `parseDicom(buffer)` on any well-formed DICOM Part 10 file using any of the four v1 transfer syntaxes — including vendor-quirky input — receives a structurally correct `Dataset` with stable, byte-offset-positional warnings surfaced for every known deviation, plus correct handling of CP-246 UN-undefined-length-as-SQ.
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, PARSE-06, FM-01, FM-02, FM-03, FM-04, TS-01, TS-02, TS-03, TS-04, TOL-01, TOL-02, TOL-03, TOL-04, TOL-05, TOL-06, TOL-07, TOL-08, TOL-09, TOL-10
**Success Criteria** (what must be TRUE):
  1. A developer can parse a Part 10 file using any of the four v1 transfer syntaxes and receive correctly decomposed elements with correct VR, length, and byte-offset positioning. Long-form VRs (`OB OW OF OD OL SQ UT UN UC UR`) use 4-byte length with 2 reserved bytes (validated zero). Explicit VR BE correctly swaps numeric VRs including the two-2-byte-swap `AT` case; `OB` is never swapped. Deflated Explicit VR LE uses `zlib.inflateRawSync` (RFC 1951 raw deflate), not `inflateSync`.
  2. A developer parsing a file with a missing preamble, File Meta group length missing or mismatched, odd-length value, undefined-length sequence in explicit VR, VR mismatch for a known tag, private tag without creator, non-zero reserved bytes, or group length in non-File-Meta groups gets a parsed dataset in lenient mode plus `ds.warnings` entries with stable codes from the TOL-03 catalog and byte-offset context — and receives `onWarning` callbacks as they are emitted.
  3. A developer parsing non-DICOM / truncated / unsupported-transfer-syntax / empty input receives a thrown `DicomParseError` with a stable code (`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`), byte offset, and snippet — even in lenient mode.
  4. A developer opting into `{ strict: true }` gets every Tier 2 deviation escalated to a thrown `DicomParseError` rather than a warning.
  5. A developer inspecting `ds.fileMeta` sees the File Meta group always parsed with Explicit VR Little Endian regardless of the dataset's transfer syntax, exposing `transferSyntaxUID`, `mediaStorageSopClassUID`, `mediaStorageSopInstanceUID`, and the implementation identifiers; human-readable TS name resolved via the UID dictionary.
**Plans**: ~6 plans anticipated (warnings/errors/dataset-shell, part10-header-and-file-meta, implicit-VR-LE, explicit-VR-LE-and-BE-with-long-form-VRs, deflated-LE-inflateRaw, strict-mode-escalation)
**UI hint**: no

### Phase 3: Dataset Model, VR Parsing & Sequences
**Goal**: A developer accessing a parsed dataset can iterate elements, read them by tag or keyword, and receive strongly typed composite values (PN, DA/TM/DT, IS/DS, UI, numeric binaries, long-text) — and can navigate sequence items as nested datasets (including CP-246 UN-as-SQ descent). Value decoding is lazy + memoized; structural pass is eager.
**Depends on**: Phase 1 (dictionary), Phase 2 (parser structural pass)
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, VR-01, VR-02, VR-03, VR-04, VR-05, VR-06, VR-07, SQ-01, SQ-02, SQ-03, SQ-04, SQ-05
**Success Criteria** (what must be TRUE):
  1. A developer can call `ds.get('00100010')`, `ds.get('PatientName')`, `ds.has(tag)`, `ds.elements()`, and `ds.getAll(tag)` and receive correctly resolved elements / iterables with full typing. Elements expose `.tag`, `.vr`, `.vm`, `.length`, `.value` (lazy + memoized), `.rawBytes` (source-of-truth), `.byteOffset`, and `.privateCreator?`.
  2. A developer accessing a non-existent tag receives `undefined` / `[]` rather than an exception; iterator / view return types are `Readonly<...>`.
  3. A developer mutating a dataset via `setElement`, `addElement`, `removeElement`, `addItem`, `removeItem` receives a new `Dataset` (copy-on-write); the source dataset remains unchanged.
  4. A developer importing the library receives typed interfaces for parsed Person Name (PN — multi-group preserved), Date/Time/DateTime (DA/TM/DT → JS Date with real-world quirks tolerated: legacy `YYYY.MM.DD`, `±HH:MM` offset, empty-string = undefined, `19000101` sentinel, fractional seconds preserved via raw), Integer/Decimal String (IS/DS → number[]), UID (UI with trailing NULL and trailing space both trimmed), and binary numeric VRs (US/UL/SS/SL/FL/FD/AT) with correct endian handling.
  5. A developer can navigate sequences: `ds.get('0040A730').items[0].get('00080100')` resolves a nested element, and undefined-length sequences parse correctly with their `FFFE,E00D` / `FFFE,E0DD` markers (with Tier 2 warning if the transfer syntax is Explicit VR). CP-246 (UN with undefined length containing an implicit-VR SQ) is auto-descended with `DICOM_UN_PARSED_AS_SQ` warning.
**Plans**: ~5 plans anticipated (model-and-tag-access + copy-on-write mutation, string-and-numeric-VRs, pn-and-date-VRs, sequence-navigation + CP-246, lazy-value-cache)
**UI hint**: no

### Phase 4: Named Helpers, Paths, Character Sets & Pixel Exposure
**Goal**: A developer can fulfill the north star — one-line extraction of common DICOM metadata — through `ds.patient`, `ds.study`, `ds.series`, `ds.instance`, `ds.equipment`, `ds.image`, and tag-path accessors like `ds.get('0040A730/00080100')`, with correct character-set decoding for non-ASCII string values, raw pixel-data exposure, and typed-array reshape for uncompressed pixel data.
**Depends on**: Phase 3
**Parallelizable with**: Phase 5 (disjoint module trees: `helpers/`+`charset/`+`path/`+`pixel/` vs `serialize/`)
**Requirements**: PATH-01, PATH-02, PATH-03, PATH-04, HELPERS-01, HELPERS-02, HELPERS-03, HELPERS-04, HELPERS-05, HELPERS-06, HELPERS-07, CHARSET-01, CHARSET-02, CHARSET-03, PIXEL-01, PIXEL-02, PIXEL-03, PIXEL-04
**Success Criteria** (what must be TRUE):
  1. A developer can read `ds.patient.name`, `ds.patient.id`, `ds.patient.birthDate` (Date), `ds.study.uid`, `ds.study.date` (Date), `ds.series.modality`, `ds.instance.uid`, `ds.equipment.manufacturer`, `ds.equipment.modelName` and related fields without touching tag hex directly; absent fields return `undefined` and never throw.
  2. A developer can call `ds.get('0040A730/00080100')` for item-in-sequence access, `ds.get('0040A730[1]/00080100')` for explicit item index, and `ds.getAll(path)` for repetition flattening; unresolvable paths return `undefined` / `[]` without throwing.
  3. A developer parsing a file with a non-UTF-8 `(0008,0005)` Specific Character Set (ISO_IR 100/101/109/110/126/127/138/144/148/166/192/203, GB18030, GBK, and single-extension ISO 2022 IR 87 / IR 13 / IR 149) sees PN / LO / SH / LT / ST / UT / UC values decoded correctly; true multi-extension combinations emit `DICOM_UNSUPPORTED_CHARSET` and fall back to UTF-8 with raw bytes still accessible. `0x5C` separator splits AFTER charset decoding.
  4. A developer accessing `ds.image.rows`, `ds.image.columns`, `ds.image.bitsAllocated`, `ds.image.pixelSpacing`, `ds.image.numberOfFrames` receives typed values; `ds.pixelData` returns a `Buffer` for uncompressed transfer syntaxes and `{ fragments: Buffer[], basicOffsetTable?: Buffer }` for encapsulated ones. `ds.image.frames()` returns typed-array views (`Uint8Array | Uint16Array | Int16Array`, shaped `rows × columns × samplesPerPixel`) for uncompressed TS and throws `DicomPixelDecodeNotSupportedError` directing to `@cosyte/dicom-pixel` for encapsulated TS.
  5. A developer reading the `ds.pixelData` / `ds.image.frames()` JSDoc / README section sees an explicit note that v1 does NOT decompress pixels and a link to the roadmap `@cosyte/dicom-pixel` companion package.
**Plans**: ~5 plans anticipated (tag-path-accessors, helpers-patient-study-series-instance, helpers-equipment-image, charset-decoding + ISO-2022, pixel-data-exposure + uncompressed-reshape)
**UI hint**: no

### Phase 5: Serialization & Round-Trip
**Goal**: A developer can take a parsed, mutated, or constructed dataset and emit a spec-clean DICOM Part 10 file — or a PS3.18 Annex F DICOM-JSON / pretty-printed view — such that parse → modify → serialize → parse yields an equivalent dataset; transcoding between the 4 v1 transfer syntaxes is supported.
**Depends on**: Phase 3
**Parallelizable with**: Phase 4 (disjoint module trees)
**Requirements**: SER-01, SER-02, SER-03, SER-04, SER-05, SER-06
**Success Criteria** (what must be TRUE):
  1. A developer calling `ds.toBuffer()` on any parsed dataset (including vendor-quirky input) receives a valid DICOM Part 10 file with a 128-byte preamble, `DICM` magic, correct File Meta (Explicit VR LE, with correct group length), and a dataset encoded in its original transfer syntax.
  2. A developer running `parseDicom(ds.toBuffer())` on any fixture receives a dataset semantically equivalent to the original (same elements, values, sequence structure); byte-identity round-trip is explicitly NOT a goal (Postel's Law — emitter may normalize).
  3. A developer calling `ds.toBuffer({ transferSyntax: 'TARGET_UID' })` transcodes between the 4 v1 transfer syntaxes; unsupported targets throw `UNSUPPORTED_TRANSFER_SYNTAX`.
  4. A developer calling `ds.toJSON()` receives a **DICOM-JSON representation per PS3.18 Annex F** (interoperable with DICOMweb services and dcmjs), and `ds.prettyPrint()` returns a human-readable multi-line string. `bulkDataMode: 'uri' | 'omit'` is deferred to v1.x.
  5. A developer inspecting a re-serialized file sees correct even-length padding per VR (space for text, NULL for UI, NULL for OB), correct File Meta group length, and no leaked quirks from the original input.
**Plans**: ~4 plans anticipated (emit-element-primitive-and-file-meta, **VR-encoder-table** (symmetric to Phase 3 decoder), emit-dataset-in-original-TS + transcode, toJson-PS3.18-AnnexF + prettyPrint + round-trip-sweep)
**UI hint**: no

### Phase 6: Profile System, Vendor Profiles & Starter Kit
**Goal**: A developer can define, extend, and compose vendor / integration profiles via a first-class public API with correct Private Creator block-reservation resolution, apply them to parses, and rely on 5 ready-made vendor profiles (GE, Siemens, Philips, Canon/Toshiba, Hologic) that register each vendor's published private tag dictionary + safe-private declarations. A publishable profile starter kit ships alongside.
**Depends on**: Phase 2, Phase 3, Phase 5
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, BVP-01, BVP-02, BVP-03, BVP-04, BVP-05, BVP-06, KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07
**Success Criteria** (what must be TRUE):
  1. A developer calling `defineProfile({ name, ... })` with valid input receives a readonly `Profile` object exposing `name`, `description`, `privateTags`, `safePrivate`, `lineage`, and `describe()`; invalid input throws `ProfileDefinitionError` with an actionable message.
  2. A developer using `extends: parentProfile` or `extends: [p1, p2]` receives a profile whose merged options follow the documented semantics (scalars overwrite, arrays concat+dedupe, `privateTags` deep-merge by Private Creator, `onWarning` handlers chain).
  3. A developer calling `parseDicom(buf, profile)` sees `ds.profile?.name` and `ds.profile?.lineage` populated, private tags accessible by their declared keyword, and re-serialization producing spec-clean DICOM. The `(gggg,00XX)` → `(gggg,XX00)–(gggg,XXFF)` block-reservation rule is correctly resolved (verified by test against an off-by-0x1000 fixture). `DICOM_PRIVATE_CREATOR_UNKNOWN` is emitted when a creator is reserved in the dataset but has no matching profile entry.
  4. A developer importing `profiles.ge`, `profiles.siemens`, `profiles.philips`, `profiles.canon` (with both TOSHIBA and CANON creator registrations), or `profiles.hologic` and parsing a realistic vendor-shape fixture with the profile receives fewer warnings than parsing the same fixture in lenient mode without a profile; each built-in is defined through the public `defineProfile()` API and declares a `safePrivate` list consumed by ANON-10.
  5. A developer copying `examples/profile-starter-kit/` into a new directory can run `pnpm install && pnpm test && pnpm build` against the sample fixture with success; `dist/` entries match the `package.json` exports; CI and publish workflows validate with `actionlint`; `CUSTOMIZING.md` walks through rename → swap base → define private tags → fixtures → publish.
**Plans**: ~5 plans anticipated (defineProfile-core-and-validation, extends-merge-semantics, **private-creator-block-resolution** + parseDicom dispatch, built-in-vendor-profiles-with-safe-private, starter-kit)
**UI hint**: no

### Phase 7: Anonymization & Strict Validation
**Goal**: A developer can run `anonymize(ds)` on any dataset and receive a de-identified copy per DICOM PS3.15 Annex E Basic Application Confidentiality Profile with all 11 composable option sets, correct audit-trail attributes, and a burned-in-annotation guardrail; and can run `validate(ds)` to get structural + VR + VM conformance errors (standard tags only in v1) without throwing.
**Depends on**: Phase 1 (Annex E action table), Phase 3 (Dataset), Phase 5 (serialization for testing), Phase 6 (safe-private declarations for ANON-10)
**Requirements**: ANON-01, ANON-02, ANON-03, ANON-04, ANON-05, ANON-06, ANON-07, ANON-08, ANON-09, ANON-10, STRICT-01, STRICT-02, STRICT-03, STRICT-04, STRICT-05
**Success Criteria** (what must be TRUE):
  1. A developer calling `anonymize(ds)` receives a new `Dataset` (source unchanged, immutability preserved) with PS3.15 Annex E Basic Application Confidentiality Profile applied: identifying elements removed/zeroed/dummied per the Annex E action table (generator-sourced from Phase 1 artifact), with no retention / clean options enabled by default.
  2. A developer composing retention / clean options via `anonymize(ds, { retain: [...], clean: [...] })` can select from all 11 Annex E option sets (E.3.1–E.3.11). Pixel-dependent options (E.3.1 Clean Pixel Data, E.3.2 Clean Recognizable Visual Features) throw `DicomPixelDecodeNotSupportedError` directing to `@cosyte/dicom-pixel`. Longitudinal Temporal offers `fullDates` / `modifiedDates` variants; `modifiedDates` applies a single per-session offset atomically across DA/TM/DT. Retain Safe Private (E.3.10) preserves private tags declared safe by the active profile's `safePrivate` list.
  3. A developer inspecting an anonymized dataset sees PS3.15 audit-trail attributes populated: `(0012,0062) PatientIdentityRemoved = 'YES'`, `(0012,0063) DeidentificationMethod` (human-readable), `(0012,0064) DeidentificationMethodCodeSequence` (one item per applied option set, coded per Annex E Table CID 7050). Internal UID consistency is preserved (per-session UID map).
  4. A developer whose input has `(0028,0301) BurnedInAnnotation = 'YES'` and no pixel handler installed sees `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning (lenient) or a throw (strict) — callers cannot silently produce non-compliant output.
  5. A developer calling `validate(ds)` on a malformed-but-parsed dataset receives `{ valid: false, errors: [...] }` with typed errors for: missing required File Meta elements (including `(0002,0001)` File Meta Information Version), VR mismatch against the standard data dictionary, VM violation against the standard data dictionary. Private-tag VR/VM validation is explicitly deferred to v1.1 and documented as such in DOC-09.
  6. A developer opting into `parseDicom(buffer, { strict: true })` gets every Tier 2 deviation escalated to a thrown `DicomParseError` (the parser-level flavor of strict; `validate()` is the post-parse, non-throwing flavor).
**Plans**: ~5 plans anticipated (**annex-e-eleven-option-sets** (consumes Phase 1 action-table artifact), **retention-and-clean-composition + conflict-detection**, uid-consistency-and-session-map, **audit-trail-attributes + burned-in-annotation-guardrail**, structural-validator-standard-tags-only)
**UI hint**: no

### Phase 8: Testing Hardening, Examples & Documentation
**Goal**: A developer running the test suite sees ≥ 90% coverage on parser / dataset / dictionary / helpers plus concrete evidence — canonical fixtures across all 4 transfer syntaxes, edge cases, vendor-quirk fixtures, strict-mode escalation, profile authoring, anonymization — that the library behaves as specified end to end. A developer landing on the README can go from zero to reading a DICOM tag in under a minute, find a recipe for every common task, and copy the profile starter kit recipe into a new directory to publish their own profile package. Fixture provenance + licensing is documented per-file.
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
**Requirements**: EX-01, EX-02, EX-03, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08, TEST-09 (provenance-doc half), DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14, DOC-15, DOC-16
**Success Criteria** (what must be TRUE):
  1. A developer running `pnpm test --coverage` sees ≥ 90% line coverage on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/`, and a green test suite; CI enforces the gate on every PR.
  2. A developer reviewing `test/fixtures/` finds canonical fixtures that round-trip losslessly for a CT (Implicit VR LE), MR (Explicit VR LE), US (Explicit VR BE), SC (Deflated Explicit VR LE), a deep-sequence enhanced MR, a private-tag vendor fixture, a multi-frame fixture, an encapsulated-compressed-pixel-data fixture (fragments only — no decode), and an anonymization UID-cross-reference fixture (multi-study / multi-series).
  3. A developer reviewing `test/fixtures/vendor-quirks/` finds at least one fixture per Tier 2 warning scenario from TOL-03; plus explicit additions for empty SQ item, CP-246 UN-as-SQ, GB18030 charset, trailing-space-padded UI, and non-ASCII bytes in ASCII-only VR. Each one parses in lenient mode with the expected warning code and throws `DicomParseError` under `{ strict: true }`.
  4. A developer running `tsx examples/read-tags.ts`, `examples/anonymize-study.ts`, and `examples/walk-multi-frame-mr.ts` sees each example execute end-to-end and print the documented output. The anonymize example demonstrates at least one retention option and shows the audit-trail attributes on the output.
  5. A developer opening the README on GitHub or npm sees the one-sentence value prop as the first line, badges, a 30-second copy-pasteable quickstart, a 6–8-bullet feature list (with explicit "not in v1" callouts for pixel decompression / network), a "DICOM in 90 seconds" section, the three access patterns, the full cookbook (all recipes listed in DOC-06 including `ds.image.frames()`), a top-level Profiles section including Private Creator block reservation with worked example, a 3-tier tolerance section with table + stable warning code table + runnable example, an Anonymization section covering all 11 Annex E options + audit-trail attributes, an Error Handling section (including `DicomPixelDecodeNotSupportedError` and `AnonymizationConflictError` + the v1.1 private-tag-validation deferral), a Scope & Companion Packages section, a Contributing section, a Roadmap section (listing v1.1 items: RLE decode, ISO 2022 multi-extension, `bulkDataMode`, private-tag validate), and the "Built by Cosyte" footer with license link. CHANGELOG.md (Keep-a-Changelog with `[Unreleased]`) and LICENSE (MIT) exist at repo root.
  6. A developer reading `test/fixtures/README.md` finds per-file source + license documentation for every committed fixture (TEST-09 provenance half).
**Plans**: ~5 plans anticipated (fixture-authoring-and-coverage-gate + provenance-README, examples, readme-and-cookbook, changelog-contributing-license, final-smoke-and-coverage)
**UI hint**: no

---

## Parallelization Notes

Within each phase, plans that touch disjoint modules may run in parallel; plans that share a module must serialize. **Cross-phase parallel: Phase 4 and Phase 5 can run simultaneously after Phase 3 ships** (disjoint module trees).

- **Phase 1:** Toolchain plans (tsup config, Vitest config, ESLint+Prettier, tsconfig + strict flags, package.json exports + scripts + `attw`) are largely independent and can run in parallel. The data+UID dictionary generator, the Annex E action-table generator, and the PHI-scan CI hook are distinct modules (`scripts/generate-dictionary.ts`, `scripts/generate-annex-e.ts`, `.github/workflows/phi-scan.yml`) and can run in parallel with the toolchain plans. A final smoke-test plan runs last to verify the full pipeline and both re-gen CI checks.
- **Phase 2:** Part 10 header / File Meta reader is the first plan (shared dependency). The four transfer-syntax parsers (Implicit VR LE, Explicit VR LE, Explicit VR BE, Deflated LE) are independent and parallelizable. Warnings / errors registry and `onWarning` plumbing should be built early and consumed by each parser plan; strict-mode escalation is a capstone plan.
- **Phase 3:** `Dataset` + tag-access foundation + copy-on-write mutation is serial. VR parsers (PN, DA/TM/DT, IS/DS, UI, binary numerics, long-text) are mutually independent and parallelizable. Sequence/item navigation (including CP-246) layers on top of the model.
- **Phase 4:** `ds.patient`, `ds.study`, `ds.series`, `ds.instance`, `ds.equipment`, `ds.image` helpers are read-only and mutually independent (distinct tag sets) — all parallelizable. Tag-path accessor + character-set decoder are independent of each other and of the helpers. Pixel-data exposure + typed-array reshape is independent. **Can run in parallel with Phase 5.**
- **Phase 5:** The VR encoder table is the first plan (symmetric to Phase 3 decoder). `toBuffer()` emitter and `toJSON()` (PS3.18 Annex F) can run in parallel (disjoint emitters). `prettyPrint()` is independent. Transcoding between transfer syntaxes layers on top of the emitter. Round-trip fixture sweep is a final plan. **Can run in parallel with Phase 4.**
- **Phase 6:** `defineProfile()` core + validation is the first plan. Private Creator block-reservation resolution + `extends`/merge semantics and default-profile management can then parallelize. The five built-in profiles (ge, siemens, philips, canon, hologic — each with safe-private declarations) are mutually independent and all parallelizable once the API surface stabilizes. The starter kit is an independent subtree that can be built alongside the built-ins.
- **Phase 7:** Annex E option-set composition consumes the generator artifact from Phase 1. Retention / clean option sets (E.3.1–E.3.11) are independently implementable in parallel where non-overlapping; conflict-detection is a capstone. UID consistency / session-map layer is a distinct plan. Audit-trail attribute population + burned-in-annotation guardrail is independent. Structural validator (File Meta / VR / VM) is fully independent of anonymization and can run in parallel.
- **Phase 8:** Fixture authoring (canonical per transfer syntax, edge-case, vendor-quirk, profile, anonymization UID-cross-reference) parallelizes across contributors. The three examples are independent. README decomposes into quickstart + feature list, access patterns, cookbook, profiles section, tolerance section, anonymization section, scope section — most of which parallelize. CHANGELOG, LICENSE, and fixture-provenance README are trivially parallel. Coverage gate is a capstone.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation & Data Dictionary | 5/5 | ✓ Complete | 2026-05-01 |
| 2. Core Parser & Transfer Syntaxes | 6/6 | Plans Complete — verifier next (02-01..02-06 all shipped) | 2026-05-01 |
| 3. Dataset Model, VR Parsing & Sequences | 0/~5 | Pending | — |
| 4. Named Helpers, Paths, Character Sets & Pixel Exposure | 0/~5 | Pending | — |
| 5. Serialization & Round-Trip | 0/~4 | Pending | — |
| 6. Profile System, Vendor Profiles & Starter Kit | 0/~5 | Pending | — |
| 7. Anonymization & Strict Validation | 0/~5 | Pending | — |
| 8. Testing Hardening, Examples & Documentation | 0/~5 | Pending | — |

**v1 milestone:** 1/8 phases complete; Phase 2 plans complete (6/6) — verifier + validator next. Phase 2 capstone integration tests (parser-strict-mode + parser-security + parser-acceptance) verify all five ROADMAP §"Phase 2" success criteria end-to-end; 273/275 tests pass with 2 documented `it.todo` placeholders. Next: `/gsd-verify-work 2` → `/gsd-validate-phase 2` → Phase 3 discuss-loop.

---

*Last updated: 2026-05-01 after plan 02-06 completion (capstone integration tests).*

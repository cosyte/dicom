# @cosyte/dicom — v1 Requirements

All requirements are user-facing behaviors a developer consuming `@cosyte/dicom` can verify. REQ-IDs are stable across phases and referenced from `ROADMAP.md` for traceability.

**Scope boundary:** v1 is metadata-first. Pixel data is exposed but not decoded. DIMSE network services and DICOMweb are explicit non-goals — tracked in "v2+ / Companion Packages" below.

---

## v1 Requirements

### Project Setup & Build (SETUP)

- [ ] **SETUP-01** — Developer can run `pnpm install && pnpm build && pnpm test` from a clean clone and all three succeed.
- [ ] **SETUP-02** — Package publishes as dual ESM + CJS with a correct `exports` map; consumers on either module system resolve the right entry point.
- [ ] **SETUP-03** — Package has ≤ 3 runtime dependencies in `package.json`, each MIT/Apache-licensed and justified in an ADR committed under `.planning/`. Dev deps unconstrained.
- [ ] **SETUP-04** — TypeScript consumers get full IntelliSense (types, JSDoc, `@example` tags) on every public API surface.
- [ ] **SETUP-05** — Repo targets Node 18+ and compiles to ES2022 with `"strict": true` and `"noUncheckedIndexedAccess": true`.
- [ ] **SETUP-06** — `pnpm lint` and `pnpm typecheck` pass with zero warnings.

### Data Dictionary Generator (DICT)

- [ ] **DICT-01** — Build-time generator consumes the official DICOM Part 6 source (committed as an input artifact) and emits a fully-typed TS module mapping tag → keyword, VR(s), VM, and retired flag for every standard element.
- [ ] **DICT-02** — Generator is a `devDependency` / build-step (`pnpm build:dict` or pre-`build` hook); runtime has no network or filesystem dependency on the Part 6 source.
- [ ] **DICT-03** — Developer can import `Dictionary.lookup('00100010')`, `Dictionary.lookup('PatientName')`, and `Dictionary.byKeyword(...)` and receive the element metadata (keyword, VR, VM) with typed results.
- [ ] **DICT-04** — Developer can look up tag metadata in both hex (`00100010`) and keyword (`PatientName`) forms; the dictionary exposes bidirectional resolution.
- [ ] **DICT-05** — Generated dictionary is committed to the repo and regenerating produces byte-identical output; a CI check fails if the committed dictionary drifts from what the source would produce.

### Core Parsing — Part 10 File Structure (PARSE)

- [ ] **PARSE-01** — `parseDicom(buffer)` parses a DICOM Part 10 file (128-byte preamble + `DICM` magic + File Meta Information + dataset) and returns a typed `Dataset` object.
- [ ] **PARSE-02** — Parser reads the 128-byte preamble and `DICM` magic at byte offset 128; missing preamble is tolerated (Tier 2: lenient-mode warning `DICOM_MISSING_PREAMBLE`; strict-mode throw).
- [ ] **PARSE-03** — Parser preserves byte-offset positional context for every parsed element; warnings and errors carry the offset at which the deviation was detected.
- [ ] **PARSE-04** — Parser accepts a `Buffer`, `Uint8Array`, or `ArrayBuffer` input.
- [ ] **PARSE-05** — Parser rejects non-DICOM input with a fatal `DicomParseError(NOT_DICOM_PART_10)` carrying position + snippet.
- [ ] **PARSE-06** — Parser handles empty input with fatal `DicomParseError(EMPTY_INPUT)`.

### File Meta Information (FM)

- [ ] **FM-01** — Parser reads the File Meta Information group `(0002,xxxx)` using Explicit VR Little Endian (the standard-mandated encoding) regardless of the dataset's transfer syntax.
- [ ] **FM-02** — Parser exposes File Meta elements via `ds.fileMeta.transferSyntaxUID`, `ds.fileMeta.mediaStorageSopClassUID`, `ds.fileMeta.mediaStorageSopInstanceUID`, `ds.fileMeta.implementationClassUID`, `ds.fileMeta.implementationVersionName`, and `ds.fileMeta.sourceApplicationEntityTitle`.
- [ ] **FM-03** — Parser validates File Meta group length `(0002,0000)` against actual bytes consumed; mismatch is Tier 2 warning `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` in lenient mode, fatal `INVALID_FILE_META` in strict mode when required elements are absent.
- [ ] **FM-04** — Parser uses the File Meta `(0002,0010)` Transfer Syntax UID to select the dataset parser strategy; unsupported / unrecognised UIDs throw `DicomParseError(UNSUPPORTED_TRANSFER_SYNTAX)`.

### Transfer Syntaxes (TS)

- [ ] **TS-01** — Parser handles **Implicit VR Little Endian** (`1.2.840.10008.1.2`) datasets: 4-byte length, VR inferred from the data dictionary.
- [ ] **TS-02** — Parser handles **Explicit VR Little Endian** (`1.2.840.10008.1.2.1`) datasets: VR encoded in the element header, including the 2-byte / 4-byte length distinction by VR family (OB, OW, OF, SQ, UT, UN use 4-byte length with 2 reserved bytes).
- [ ] **TS-03** — Parser handles **Explicit VR Big Endian** (`1.2.840.10008.1.2.2`) datasets with correct byte-order swapping for all numeric VRs (US, UL, SS, SL, FL, FD, AT, OB, OW, OF).
- [ ] **TS-04** — Parser handles **Deflated Explicit VR Little Endian** (`1.2.840.10008.1.2.1.99`) datasets: transparently inflates the deflated dataset after File Meta and parses the result.

### Dataset Model & Access (MODEL)

- [ ] **MODEL-01** — Parsed `Dataset` exposes elements by tag: `ds.get('00100010')` returns a typed element; `ds.has(tag)` returns boolean.
- [ ] **MODEL-02** — Developer can iterate elements: `ds.elements()` yields `[tag, element]` pairs in original order.
- [ ] **MODEL-03** — Each element exposes `tag`, `vr`, `vm`, `length`, `value`, `rawBytes` (Buffer slice), and `byteOffset` (position in source).
- [ ] **MODEL-04** — Developer accessing a non-existent tag receives `undefined` (not a throw); `ds.getAll(tag)` returns `[]` for absent tags.
- [ ] **MODEL-05** — Parsed `Dataset` is immutable by default; mutation only via explicit methods (`setElement`, `addElement`, `removeElement`, `addItem`, `removeItem`).
- [ ] **MODEL-06** — Developer can mutate via `ds.setElement('00100010', 'DOE^JANE')`, `ds.removeElement(tag)`, and see changes reflected on subsequent reads and serialization.
- [ ] **MODEL-07** — Developer can resolve a tag from a keyword: `ds.get('PatientName')` and `ds.get('00100010')` are equivalent.

### Value Representation Parsing (VR)

- [ ] **VR-01** — Person Name (**PN**) parses into `{ family, given, middle, prefix, suffix }` with multi-group support (alphabetic / ideographic / phonetic groups separated by `=`); raw string always accessible.
- [ ] **VR-02** — Date (**DA**), Time (**TM**), DateTime (**DT**) parse into JS `Date` (or a structured `{ date, time, offset }` for DT) with valid truncations per DICOM format rules; unparseable values return `undefined` for the typed getter with raw string always accessible.
- [ ] **VR-03** — Integer String (**IS**) and Decimal String (**DS**) parse into `number` or `number[]` (VM > 1) respecting VM from the dictionary.
- [ ] **VR-04** — Unique Identifier (**UI**) parses as a string; trailing NULL padding byte is trimmed silently; odd lengths are tolerated with `DICOM_ODD_LENGTH_VALUE_PADDED` warning.
- [ ] **VR-05** — Binary numeric VRs (**US, UL, SS, SL, FL, FD, AT**) parse with correct endian handling per transfer syntax; `AT` parses as a tag (`gggg,eeee` pair).
- [ ] **VR-06** — Binary byte VRs (**OB, OW, OF, OD, OL, UN**) expose the raw `Buffer` and do not attempt decoded interpretation (except where the raw buffer is the meaningful output, e.g. pixel data).
- [ ] **VR-07** — Long-text VRs (**LT, ST, UT**) and short-string VRs (**LO, SH, CS, AE, AS, PN**) decode via `(0008,0005)` Specific Character Set (see CHARSET-\*); trailing whitespace / NULL padding is trimmed.

### Sequences & Items (SQ)

- [ ] **SQ-01** — Sequences (**SQ**) parse into an ordered array of `Item` objects, each itself a nested `Dataset`.
- [ ] **SQ-02** — Parser handles both explicit-length and undefined-length sequences (with `Item` / `SequenceDelimitationItem` / `ItemDelimitationItem` markers `FFFE,E000` / `FFFE,E0DD` / `FFFE,E00D`).
- [ ] **SQ-03** — Parser tolerates undefined-length sequences in Explicit VR transfer syntaxes with Tier 2 warning `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`; strict mode throws.
- [ ] **SQ-04** — Developer can navigate sequence items: `ds.get('0040A730').items[0].get('00080100')` resolves an element inside the first item of the Referenced SOP Sequence.

### Tag-Path Accessors (PATH)

- [ ] **PATH-01** — `ds.get('00100010')` resolves a tag in hex form.
- [ ] **PATH-02** — `ds.get('PatientName')` resolves a tag in keyword form.
- [ ] **PATH-03** — `ds.get('0040A730/00080100')` resolves a path into sequence items; slash separates sequence → item (defaulting to item 0) → inner tag; `0040A730[1]/00080100` targets a specific item index.
- [ ] **PATH-04** — Unresolvable paths return `undefined` rather than throwing; `ds.getAll(path)` returns `[]` for absent paths and flattens repetitions.

### Named Helpers (HELPERS)

- [ ] **HELPERS-01** — `ds.patient` exposes: `name` (parsed PN), `id`, `birthDate` (Date), `sex`, `age`, `identifiers[]`. All return `undefined` (not throw) when absent.
- [ ] **HELPERS-02** — `ds.study` exposes: `uid`, `id`, `date` (Date), `time` (Date), `description`, `accessionNumber`, `referringPhysicianName`.
- [ ] **HELPERS-03** — `ds.series` exposes: `uid`, `number`, `modality`, `description`, `date` (Date), `time` (Date), `bodyPartExamined`.
- [ ] **HELPERS-04** — `ds.instance` exposes: `uid`, `number`, `sopClassUid`, `sopInstanceUid`, `acquisitionDate` (Date), `contentDate` (Date).
- [ ] **HELPERS-05** — `ds.equipment` exposes: `manufacturer`, `modelName`, `stationName`, `institutionName`, `departmentName`, `softwareVersions`, `deviceSerialNumber`.
- [ ] **HELPERS-06** — `ds.image` exposes: `rows`, `columns`, `bitsAllocated`, `bitsStored`, `pixelRepresentation`, `samplesPerPixel`, `photometricInterpretation`, `planarConfiguration`, `numberOfFrames`, `pixelSpacing`.
- [ ] **HELPERS-07** — All helpers return `undefined` / empty arrays for missing optional data; never throw, even on an empty/minimal dataset.

### Character Set Decoding (CHARSET)

- [ ] **CHARSET-01** — String VRs that support extended character sets (PN, LO, SH, LT, ST, UT) decode via `(0008,0005)` Specific Character Set, supporting at minimum ISO_IR 100 (Latin-1), ISO_IR 101 (Latin-2), ISO_IR 144 (Cyrillic), ISO_IR 192 (UTF-8), GB18030, and GBK.
- [ ] **CHARSET-02** — Multi-valued `(0008,0005)` (ISO 2022 code-extension sequences for CJK) is supported at least for single-byte + single code-extension cases (e.g., `\ISO 2022 IR 87` for Japanese); unsupported multi-valued cases emit `DICOM_UNSUPPORTED_CHARSET` warning and fall back to UTF-8 with best-effort decode.
- [ ] **CHARSET-03** — Raw `Buffer` value is always accessible on every element regardless of decoded string form, preserving the original bytes.

### Pixel Data (PIXEL)

- [ ] **PIXEL-01** — `ds.pixelData` exposes the raw `(7FE0,0010)` element as a `Buffer` for uncompressed transfer syntaxes (Implicit/Explicit VR Little Endian, Explicit VR Big Endian).
- [ ] **PIXEL-02** — For encapsulated (compressed) transfer syntaxes, `ds.pixelData.fragments` returns an ordered array of `Buffer` fragments (from the `(FFFE,E000)` item markers), plus the Basic Offset Table when present.
- [ ] **PIXEL-03** — v1 does NOT decode or decompress pixel data. The documented contract explicitly says pixel decoding is out of scope for v1 and directs users to the roadmap `@cosyte/dicom-pixel` package.

### Real-World Tolerance (TOL)

- [ ] **TOL-01** — Default parse mode is lenient; strict mode via `{ strict: true }` escalates every Tier 2 warning to a thrown `DicomParseError`.
- [ ] **TOL-02** — Tier 3 fatal errors throw `DicomParseError` with stable codes even in lenient mode: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`. Each error includes `message`, `position` (byte offset), `snippet`.
- [ ] **TOL-03** — Parser emits Tier 2 warnings with stable codes and byte-offset positional context for all defined scenarios: missing preamble, File Meta group length mismatch, undefined-length sequences in explicit VR, odd-length value padded, VR mismatch for a known tag, private tag without private creator, group length in non-File-Meta groups, BOM in PN, unknown charset, trailing NULL in UI, padded AE/CS values, unexpected item delimiter outside a sequence.
- [ ] **TOL-04** — `ds.warnings` is always an array of `DicomParseWarning` objects (possibly empty) on a parsed dataset.
- [ ] **TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted.
- [ ] **TOL-06** — Missing preamble (`stripPreamble: 'tolerate'`, the default) parses files that start directly with File Meta and emits `DICOM_MISSING_PREAMBLE`; `stripPreamble: 'require'` throws fatal.
- [ ] **TOL-07** — Odd-length values are tolerated (padded per VR rules — space for text VRs, NULL for UI) and emit `DICOM_ODD_LENGTH_VALUE_PADDED`; strict mode throws.
- [ ] **TOL-08** — A known tag whose in-file VR disagrees with the dictionary VR is tolerated: the parser trusts the encoded VR, records the deviation as `DICOM_VR_MISMATCH`, and keeps parsing; strict mode throws.
- [ ] **TOL-09** — Private tags in a `(gggg,0010-00FF)` range without a registered Private Creator are tolerated; emit `DICOM_PRIVATE_TAG_NO_CREATOR`; raw bytes remain accessible via `ds.get(tag)`.
- [ ] **TOL-10** — Group length elements `(gggg,0000)` appearing in non-File-Meta groups are tolerated; emit `DICOM_GROUP_LENGTH_IN_DATASET`; value is exposed but not used for parsing.

### Serialization & Round-Trip (SER)

- [ ] **SER-01** — `ds.toBuffer()` emits a valid DICOM Part 10 file (preamble + `DICM` + File Meta + dataset) in the dataset's original transfer syntax.
- [ ] **SER-02** — Round-trip `parseDicom → toBuffer → parseDicom` yields an equivalent `Dataset` object for every fixture (same elements, values, sequence structure).
- [ ] **SER-03** — `ds.toBuffer({ transferSyntax: '1.2.840.10008.1.2.1' })` transcodes a dataset from its original transfer syntax to a target one (among the 4 v1-supported syntaxes); unsupported targets throw `UNSUPPORTED_TRANSFER_SYNTAX`.
- [ ] **SER-04** — Serializer always writes a correct File Meta group length `(0002,0000)` regardless of whether the source file had one.
- [ ] **SER-05** — Serializer always emits even-length values (pads per VR rules) regardless of what was parsed; Postel's Law (conservative emitter).
- [ ] **SER-06** — `ds.toJSON()` returns a structured JSON representation (DICOM-JSON-style) and `ds.prettyPrint()` returns a human-readable multi-line string for logging / debugging.

### Profiles (PROF)

- [ ] **PROF-01** — `defineProfile({ name, ...options })` returns a valid `Profile` object; name is required.
- [ ] **PROF-02** — `defineProfile()` throws `ProfileDefinitionError` with a clear message for invalid input: bad tag syntax, malformed Private Creator block, duplicate keywords within a profile, unknown option keys.
- [ ] **PROF-03** — `extends: parentProfile` and `extends: [p1, p2]` inherit and compose options; merge semantics match spec (scalars overwrite, arrays concat+dedupe, `privateTags` deep-merge by creator, `onWarning` handlers chain).
- [ ] **PROF-04** — `profile.name`, `profile.description`, `profile.privateTags`, `profile.lineage` are readonly and reflect applied options.
- [ ] **PROF-05** — `profile.describe()` returns a non-empty human-readable summary containing the profile name.
- [ ] **PROF-06** — `parseDicom(buffer, profile)` applies profile behavior to the parse; `ds.profile?.name` and `ds.profile?.lineage` are set on the parsed dataset.
- [ ] **PROF-07** — Registered private tags (via `privateTags`) are accessible by keyword: `ds.get('GE.ScanningSequenceExtended')` or the profile's declared keyword; unknown private tags without a matching profile emit `DICOM_PRIVATE_TAG_NO_CREATOR`.
- [ ] **PROF-08** — `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manage a process-scoped default; explicit argument overrides; `parseDicom(buffer, { profile: null })` opts out for one call.
- [ ] **PROF-09** — Round-trip: a dataset parsed with a custom profile and re-serialized produces spec-clean DICOM (profile quirks affect parsing, not serialization).

### Built-in Vendor Profiles (BVP)

- [ ] **BVP-01** — `profiles.ge` ships and is authored via the public `defineProfile()` API, registering GE's published private tag dictionary.
- [ ] **BVP-02** — `profiles.siemens` ships and is authored via the public `defineProfile()` API, registering Siemens's published private tag dictionary.
- [ ] **BVP-03** — `profiles.philips` ships and is authored via the public `defineProfile()` API, registering Philips's published private tag dictionary.
- [ ] **BVP-04** — `profiles.canon` ships and is authored via the public `defineProfile()` API (formerly Toshiba), registering Canon/Toshiba's published private tag dictionary.
- [ ] **BVP-05** — `profiles.hologic` ships and is authored via the public `defineProfile()` API, registering Hologic's published private tag dictionary.
- [ ] **BVP-06** — Each built-in profile reduces warnings on a realistic vendor-shape fixture versus lenient mode without a profile (verified by test).

### Profile Starter Kit (KIT)

- [ ] **KIT-01** — `examples/profile-starter-kit/` exists and contains every file needed to publish a profile package (package.json, tsconfig, tsup config, vitest config, ESLint config, sample src/, sample test/, sample fixture, CI workflow, publish workflow, README, CUSTOMIZING.md, LICENSE).
- [ ] **KIT-02** — Running `pnpm install && pnpm test` inside the starter kit succeeds against its sample fixture.
- [ ] **KIT-03** — `pnpm build` inside the starter kit produces a `dist/` with correct entry points matching `package.json` exports.
- [ ] **KIT-04** — `.github/workflows/ci.yml` and `publish.yml` are syntactically valid (verified by `actionlint` or equivalent).
- [ ] **KIT-05** — Starter kit `package.json` has correct `peerDependencies` on `@cosyte/dicom`, `publishConfig: { access: public }`, `files: [dist, ...]`, and working `build`/`test`/`lint` scripts.
- [ ] **KIT-06** — `CUSTOMIZING.md` is present and walks through the rename → swap base profile → define private tags → write fixtures → publish flow.
- [ ] **KIT-07** — Starter kit README uses `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` placeholders consistently.

### Anonymization / De-identification (ANON)

- [ ] **ANON-01** — `anonymize(ds)` applies the DICOM PS3.15 Annex E Basic Application Confidentiality Profile with no retention options enabled (the default action set); returns a new `Dataset` (immutability preserved).
- [ ] **ANON-02** — `anonymize(ds, { retain: ['PatientCharacteristics'] })` composes the Retain Patient Characteristics option set on top of the base profile per PS3.15 Annex E.
- [ ] **ANON-03** — `anonymize(ds, { retain: ['LongitudinalTemporal'] })` composes the Retain Longitudinal Temporal Information option set.
- [ ] **ANON-04** — `anonymize(ds, { retain: ['DeviceIdentity'] })` composes the Retain Device Identity option set.
- [ ] **ANON-05** — Anonymization respects the per-action semantics from PS3.15 Annex E: `D` (replace with dummy), `Z` (replace with zero-length), `X` (remove), `K` (keep), `C` (clean / structured replacement), `U` (replace UID with a consistent new UID per session).
- [ ] **ANON-06** — `anonymize` preserves internal UID consistency: if `(0020,000D) StudyInstanceUID` is replaced, every reference to that UID elsewhere in the dataset is replaced with the same new UID (per-session UID map).
- [ ] **ANON-07** — Anonymization never throws on a missing optional element; absent tags are simply skipped.

### Strict Mode & Structural Validation (STRICT)

- [ ] **STRICT-01** — `parseDicom(buffer, { strict: true })` escalates every Tier 2 warning to a thrown `DicomParseError`.
- [ ] **STRICT-02** — `validate(ds)` runs structural validation and returns `{ valid: boolean, errors: ValidationError[] }` without throwing.
- [ ] **STRICT-03** — Validator checks required File Meta elements (Transfer Syntax UID, Media Storage SOP Class UID, Media Storage SOP Instance UID, Implementation Class UID); missing required elements produce typed errors.
- [ ] **STRICT-04** — Validator checks VR conformance for every element against the data dictionary; mismatches produce typed errors.
- [ ] **STRICT-05** — Validator checks Value Multiplicity (VM) for every element against the data dictionary; non-conforming VM produces typed errors.

### Examples (EX)

- [ ] **EX-01** — `examples/read-tags.ts` runs end-to-end and demonstrates named-helper + tag-path access on a real CT DICOM file.
- [ ] **EX-02** — `examples/anonymize-study.ts` runs end-to-end and demonstrates the `anonymize()` API plus option-set composition.
- [ ] **EX-03** — `examples/walk-multi-frame-mr.ts` runs end-to-end and demonstrates sequence/item navigation on a multi-frame enhanced MR dataset.

### Testing & Fixtures (TEST)

- [ ] **TEST-01** — `pnpm test --coverage` reports ≥ 90% line coverage on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/`.
- [ ] **TEST-02** — Canonical fixtures exist and round-trip losslessly for: one CT (Implicit VR LE), one MR (Explicit VR LE), one US (Explicit VR BE), one SC (Deflated Explicit VR LE), one with a deep sequence (enhanced MR functional groups), one with private tags from a vendor, one with multi-frame pixel data, one with compressed pixel data (encapsulated fragments).
- [ ] **TEST-03** — Edge-case fixtures cover: missing preamble, File Meta group length mismatch, odd-length value padded, undefined-length sequence in explicit VR, VR mismatch for a known tag, group length in non-File-Meta groups, multi-valued `(0008,0005)` Specific Character Set, `AT` VR with multiple tag values.
- [ ] **TEST-04** — Malformed files throw `DicomParseError` with descriptive position/snippet (non-DICOM input, truncated File Meta, unsupported transfer syntax UID, empty input).
- [ ] **TEST-05** — `test/fixtures/vendor-quirks/` contains at least one fixture per Tier 2 scenario, each verified to emit the expected warning and still parse in lenient mode.
- [ ] **TEST-06** — Strict-mode escalation test: every Tier 2 vendor-quirks fixture throws `DicomParseError` under `{ strict: true }`.
- [ ] **TEST-07** — At least one fixture per built-in vendor profile (`ge`, `siemens`, `philips`, `canon`, `hologic`) demonstrates fewer warnings with the profile than without.
- [ ] **TEST-08** — Profile-authoring test suite covers: valid `defineProfile` output; `ProfileDefinitionError` cases; `extends` single + array; merge semantics per option category; default-profile set/get/opt-out; `profile.describe()`; `ds.profile` attribution; round-trip with custom profile.

### Documentation (DOC)

- [ ] **DOC-01** — README renders cleanly on GitHub and npm with the one-sentence value prop as the first line, followed by badges.
- [ ] **DOC-02** — README contains a 30-second quickstart (install + parse + extract a patient name) in one copy-pasteable block.
- [ ] **DOC-03** — README has a feature list (6–8 bullets) highlighting developer-centric wins, including explicit "what's not in v1" (no pixel decode, no network).
- [ ] **DOC-04** — README has a "DICOM in 90 seconds" core-concepts section (≤ 2 paragraphs) covering dataset, tag, VR, transfer syntax, sequences, private tags.
- [ ] **DOC-05** — README covers the three access patterns (helpers / tag-paths / element iteration) with runnable examples.
- [ ] **DOC-06** — README Cookbook section contains recipes for: reading patient/study/series/instance metadata, iterating multi-frame pixel data fragments, navigating sequences, anonymizing a study, extending an anonymization action set, "Write your first profile in 10 minutes", extending a profile, composing profiles, publishing a profile package, default profile, transcoding between transfer syntaxes, handling vendor quirks, pretty-printing a dataset.
- [ ] **DOC-07** — README has a top-level "Profiles" section covering authoring, extending, merge semantics, inspection, publishing — not buried in API reference.
- [ ] **DOC-08** — README "Real-World Tolerance" section explains the 3-tier deviation model (silent / warn / fatal) with a compact table, stable warning code table, and a runnable warnings-iteration example.
- [ ] **DOC-09** — README "Error Handling" section covers `DicomParseError`, `DicomParseWarning`, `ProfileDefinitionError`, `ValidationError` with examples.
- [ ] **DOC-10** — README "Anonymization" section documents the PS3.15 Annex E Basic Profile default + how to compose retention option sets.
- [ ] **DOC-11** — README "Scope & Companion Packages" section explicitly calls out: pixel decode → future `@cosyte/dicom-pixel`; DIMSE → future `@cosyte/dicom-net`; DICOMweb → future `@cosyte/dicomweb`.
- [ ] **DOC-12** — README "Contributing" section points to CONTRIBUTING.md and invites vendor quirk fixtures, profile improvements, and standalone profile packages.
- [ ] **DOC-13** — README ends with "Built by [Cosyte](https://cosyte.com)" and a license link.
- [ ] **DOC-14** — Roadmap / stretch goals section documents: pixel decoding package, DIMSE package, DICOMweb package, SR semantics, DICOMDIR, streaming parser, typed IOD overlays, schema-aware validation.
- [ ] **DOC-15** — CHANGELOG.md exists in Keep-a-Changelog format with an `[Unreleased]` section.
- [ ] **DOC-16** — LICENSE (MIT) exists at repo root.

---

## Requirements Count

| Category | Count |
|---|---|
| SETUP | 6 |
| DICT | 5 |
| PARSE | 6 |
| FM | 4 |
| TS | 4 |
| MODEL | 7 |
| VR | 7 |
| SQ | 4 |
| PATH | 4 |
| HELPERS | 7 |
| CHARSET | 3 |
| PIXEL | 3 |
| TOL | 10 |
| SER | 6 |
| PROF | 9 |
| BVP | 6 |
| KIT | 7 |
| ANON | 7 |
| STRICT | 5 |
| EX | 3 |
| TEST | 8 |
| DOC | 16 |
| **Total** | **137** |

---

## v2+ / Companion Package Requirements (Deferred)

Explicitly not part of v1. Listed here so contributors know where each belongs:

**Future `@cosyte/dicom` v2+ roadmap (same package):**

- Streaming / pull-parser API for huge files
- Typed IOD / SOP-class overlays (`ds.is('CT Image Storage')` narrows the dataset type)
- IOD-level required-tag validation per SOP class
- DICOMDIR parsing / writing (media filesets)
- Multi-frame Functional Groups typed shortcuts
- JSON Schema / Zod emission for `toJSON()` output
- DICOM SR document semantics beyond raw dataset access

**Companion packages (future):**

- `@cosyte/dicom-pixel` — pixel decoding across compressed transfer syntaxes (JPEG Baseline, JPEG 2000, JPEG-LS, RLE Lossless, HTJ2K); windowing / LUTs / overlays / presentation states
- `@cosyte/dicom-net` — classic DIMSE services over TCP (C-ECHO, C-STORE, C-FIND, C-MOVE, C-GET, N-\*)
- `@cosyte/dicomweb` — QIDO-RS / WADO-RS / STOW-RS clients (and maybe servers)

## Out of Scope (permanently)

- **HL7 v3 / CDA** — different spec family (see `@cosyte/hl7` / future `@cosyte/ccda`)
- **FHIR conversion** — different spec family; separate concern
- **DICOS** (security / baggage screening) — different deployment context entirely
- **DICOM print management** — effectively dead protocol
- **DICOM-RT IOD semantics** (RT Plan, RT Dose, RT Structure Set beyond raw dataset access) — domain-specific; best served by a dedicated RT library

---

## Traceability

Every v1 REQ-ID maps to exactly one phase in `ROADMAP.md`. 137 / 137 mapped.

(Traceability table populated by roadmapper — see `ROADMAP.md` and the table below once the roadmap is committed.)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SETUP-01 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| SETUP-02 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| SETUP-03 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| SETUP-04 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| SETUP-05 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| SETUP-06 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| DICT-01 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| DICT-02 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| DICT-03 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| DICT-04 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| DICT-05 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| PARSE-01 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| PARSE-02 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| PARSE-03 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| PARSE-04 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| PARSE-05 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| PARSE-06 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| FM-01 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| FM-02 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| FM-03 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| FM-04 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TS-01 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TS-02 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TS-03 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TS-04 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-01 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-02 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-03 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-04 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-05 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-06 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-07 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-08 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-09 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-10 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| MODEL-01 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| MODEL-02 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| MODEL-03 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| MODEL-04 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| MODEL-05 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| MODEL-06 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| MODEL-07 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-01 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-02 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-03 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-04 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-05 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-06 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-07 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| SQ-01 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| SQ-02 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| SQ-03 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| SQ-04 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| PATH-01 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| PATH-02 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| PATH-03 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| PATH-04 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| HELPERS-01 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| HELPERS-02 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| HELPERS-03 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| HELPERS-04 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| HELPERS-05 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| HELPERS-06 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| HELPERS-07 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| CHARSET-01 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| CHARSET-02 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| CHARSET-03 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| PIXEL-01 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| PIXEL-02 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| PIXEL-03 | Phase 4 — Named Helpers, Paths & Character Sets | Pending |
| SER-01 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-02 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-03 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-04 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-05 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-06 | Phase 5 — Serialization & Round-Trip | Pending |
| PROF-01 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-02 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-03 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-04 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-05 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-06 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-07 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-08 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| PROF-09 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| BVP-01 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| BVP-02 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| BVP-03 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| BVP-04 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| BVP-05 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| BVP-06 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-01 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-02 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-03 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-04 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-05 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-06 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-07 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| ANON-01 | Phase 7 — Anonymization & Strict Validation | Pending |
| ANON-02 | Phase 7 — Anonymization & Strict Validation | Pending |
| ANON-03 | Phase 7 — Anonymization & Strict Validation | Pending |
| ANON-04 | Phase 7 — Anonymization & Strict Validation | Pending |
| ANON-05 | Phase 7 — Anonymization & Strict Validation | Pending |
| ANON-06 | Phase 7 — Anonymization & Strict Validation | Pending |
| ANON-07 | Phase 7 — Anonymization & Strict Validation | Pending |
| STRICT-01 | Phase 7 — Anonymization & Strict Validation | Pending |
| STRICT-02 | Phase 7 — Anonymization & Strict Validation | Pending |
| STRICT-03 | Phase 7 — Anonymization & Strict Validation | Pending |
| STRICT-04 | Phase 7 — Anonymization & Strict Validation | Pending |
| STRICT-05 | Phase 7 — Anonymization & Strict Validation | Pending |
| EX-01 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| EX-02 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| EX-03 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-01 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-02 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-03 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-04 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-05 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-06 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-07 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-08 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-01 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-02 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-03 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-04 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-05 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-06 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-07 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-08 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-09 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-10 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-11 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-12 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-13 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-14 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-15 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-16 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |

**Coverage:** 137 / 137 v1 REQ-IDs mapped (no orphans, no duplicates).

*Last updated: 2026-04-22 at initialization.*

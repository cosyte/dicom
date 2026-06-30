# Changelog

All notable changes to `@cosyte/dicom` will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Dev-dependency advisory remediation (no runtime impact — the published
  artifact is unchanged).** Added scoped `pnpm.overrides` pinning two
  transitive **dev/build-time** packages to their patched releases: `esbuild`
  (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal — not
  reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Added

- **Documentation completeness (Phase 8).** Rewrote `README.md` into a full developer guide — quickstart,
  feature tour, a "DICOM in 90 seconds" primer, the two access patterns, an 80/20 **cookbook** (index a
  folder, build routing keys, read pixel-interpretation metadata safely, de-identify, bridge to FHIR
  `ImagingStudy` / HL7 v2, round-trip serialize), the four-tier tolerance model, the warning/fatal code
  taxonomy, typed-error handling, and an explicit known-limitations / non-goals section. Every public
  export now carries a JSDoc `@example`. Extended the dual ESM/CJS smoke harnesses to exercise the full
  Phase 1–7 published surface so the documented entrypoints are guaranteed importable from both module
  systems. Also corrected an `intro.md` snippet that referenced a nonexistent `ds.pixelData` getter (the
  real accessor is `ds.get("PixelData")?.value`). Docs-only — no runtime API change.
- **Metadata-level de-identification (Phase 7).** New `deidentify(ds, options?)` applies the PS3.15
  Annex E **Basic Application Level Confidentiality Profile** plus the nine metadata-affecting Annex E
  Options (`RetainUIDs`, `RetainLongitudinalTemporal`, `RetainPatientCharacteristics`,
  `RetainDeviceIdentity`, `RetainInstitutionIdentity`, `RetainSafePrivate`, `CleanDescriptors`,
  `CleanStructuredContent`, `CleanGraphics`), driven by the generated Table E.1-1 action map. It is a
  **pure** function — the input `Dataset` is never mutated; it returns a fresh de-identified `Dataset`
  and a value-free `DeidentifyReport` (tags, keywords, resolved action codes, the UID map, warnings).
  Each attribute's action (`D` dummy, `Z` zero-length, `X` remove, `K` keep, `C` clean, `U` consistent
  UID) is resolved from the Basic Profile, overridden by any active Option; conditional codes (`Z/D`,
  `X/Z`, `X/D`, `X/Z/D`, `X/Z/U*`, `C/X`) collapse to their most-protective **leftmost** branch (the
  tool does no IOD Type-1 conformance analysis, so it fails safe toward _more_ removal). `U`-coded UIDs
  are remapped to deterministic, content-derived `2.25` replacements that stay referentially consistent
  across files (`makeUidRemapper`, default root `DEFAULT_UID_ROOT`). Kept sequences are recursively
  de-identified and **re-encoded** so nested PHI is removed from the serialized bytes, not just the
  object model. Private attributes are removed by default; `RetainSafePrivate` + a `Profile` keeps only
  the creator-recognized safe private elements. `(0012,0062)` Patient Identity Removed = `YES` and
  `(0012,0063)` De-identification Method are written automatically. Pixel-level cleaning is out of scope
  (deferred to `@cosyte/dicom-pixel`): when Pixel Data is present and not affirmatively marked free of
  burned-in text, a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning is raised rather than silently
  passing identifying pixels. New public exports: `deidentify`, `makeUidRemapper`, `DEFAULT_UID_ROOT`,
  `DEIDENTIFY_OPTIONS`, `DEIDENTIFY_ERROR_CODES`, `DeidentifyError`, and the types `UidRemapper`,
  `AppliedAction`, `DeidentifiedAttribute`, `DeidentifyErrorCode`, `DeidentifyOption`,
  `DeidentifyOptions`, `DeidentifyReport`, `DeidentifyResult`. The reserved
  `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning code is now actively emitted (no change to the
  `WARNING_CODES` registry surface).
- **Source/vendor profile system (Phase 6).** New `defineProfile()` factory builds an immutable,
  composable `Profile` that a parse opts into via `parseDicom(buf, { profile })`. A profile bundles
  three things that only ever _tighten or annotate_ a parse, never loosen it past the lenient default:
  `escalate` (Tier-2 warning codes promoted to a thrown `DicomParseError`), `suppress` (codes silenced
  as a documented benign quirk of the source), and `privateTags` (a private-creator-keyed overlay that
  resolves the Implicit VR of vendor private data elements). Private resolution is keyed on the file's
  **live** private-creator string and the canonical `"GGGGxxLL"` key (PS3.5 §7.8.1) — never a
  hard-coded block number — so the same vendor schema resolves regardless of which block it landed in.
  Profiles compose via `extends` (de-duplicated lineage, union of escalations/suppressions, child-wins
  dictionary merge) and expose a deterministic `describe()` summary. Five built-ins ship under the
  frozen `profiles` namespace: three vendor overlays (`ge`, `siemens`, `philips`, grounded in the
  public GDCM / dcm4che / dcm2niix private dictionaries) and two posture presets (`strict` escalates
  integrity-relevant warnings; `lenient` suppresses cosmetic, high-volume ones). A creator the active
  profile does not recognize degrades to generic `UN` plus the new `DICOM_PRIVATE_CREATOR_UNKNOWN`
  warning — never a wrong decode. Selecting a profile never changes a correct decode. New public
  exports: `defineProfile`, `profiles`, `ProfileDefinitionError`, and the types `Profile`,
  `PrivateTagDefinition`, `DefineProfileOptions`, `ProfilePrivateTags`; `ParseOptions` gains an
  optional `profile` field. The reserved `DICOM_PRIVATE_CREATOR_UNKNOWN` code is now actively emitted
  (no change to the `WARNING_CODES` registry surface).
- **Spec-clean Part 10 serializer (Phase 5).** New `serializeDicom(ds)` writes a `Dataset` back to a
  DICOM Part 10 `Buffer` — the conservative half of Postel's Law. Emits the 128-byte zero preamble +
  `DICM`, a File Meta group (always Explicit VR LE) with a computed `(0002,0000)` group length and
  conservative Type-1 defaults (File Meta Version `0x0001`, cosyte Implementation Class UID under the
  `2.25` UUID arc), then the dataset body in the dataset's own transfer syntax — **no transcode** —
  across all four v1 syntaxes (Implicit VR LE, Explicit VR LE/BE, Deflated Explicit VR LE). Scalar
  values are padded to even length per PS3.5 §6.2 (`0x00` for `UI`/byte-stream VRs, `0x20` for text),
  short vs long-form headers are chosen by VR per §7.1.2 (`SV`/`UV` long-form), retired `(gggg,0000)`
  group-length elements are omitted per §7.2, and sequence + encapsulated-pixel-data spans pass
  through byte-for-byte per §7.5 / §A.4. Pure function — the input `Dataset` is never mutated.
- **Serializer error taxonomy.** New `DicomSerializeError` with codes `MISSING_TRANSFER_SYNTAX`
  (no File Meta Transfer Syntax UID) and `UNSUPPORTED_TRANSFER_SYNTAX` (a UID outside the v1 set) —
  separate from the parser's fatal codes and the value layer's `DicomValueError`. The message is
  built only from the code + the offending Transfer Syntax UID (structural facts), never a decoded
  value, so it is always safe to log. New public exports: `serializeDicom`, `DicomSerializeError`,
  `SERIALIZE_ERROR_CODES`, `SerializeErrorCode`.

### Known limitations

- **File Meta round-trip is over the modeled surface, not byte-exact.** Only the typed `FileMeta`
  fields round-trip; any other `(0002,xxxx)` element a source file carried (e.g. `(0002,0100)` Private
  Information Creator UID) is dropped at _parse_ time (the Phase 2 `FileMeta` view does not model it)
  and so cannot be re-emitted. The preamble is normalized to zeros and odd-length values are padded
  even — the output stays spec-clean but is not a byte-identical copy of a non-conformant input.

### Tests

- **Enhanced multi-frame coverage (DICOM-COV).** Closed the Per-Frame-else-Shared branch gaps left by
  the Phase 4 functional-group resolver (`functional-groups.ts`: ~53% → 100% branch): both optional
  macros (Pixel Value Transformation `(0028,9145)`, Frame VOI LUT `(0028,9132)`), Pixel Measures
  `spacingBetweenSlices`, shared-only resolution (no Per-Frame Functional Groups Sequence), the
  lenient inner-attribute-absence paths (a macro item present but its attributes omitted ⇒ typed-absent,
  never coerced), and all three `MISSING_REQUIRED_FUNCTIONAL_GROUP` throws (Pixel Measures / Plane
  Position / Plane Orientation). Synthetic fixtures only; no public-surface change. Per-directory
  coverage now sits genuinely ≥ 90 on every gated directory (global branches 93.2%).

### Added

- **Safety-critical domain helpers (Phase 4).** New `Dataset` accessors `patient` / `study` /
  `series` / `image` return typed, fail-safe views over the DICOM §4 safety-critical attributes
  (memoized on first access). `patient` surfaces the `{id, issuerOfId, issuerQualifiers}` identity
  tuple plus Other Patient IDs (so a caller never matches on a bare, non-unique `(0010,0020)`) and
  keeps `PN` structured; `study`/`series` surface the cross-system UIDs, accession number, modality
  and Frame of Reference UID. `image` surfaces the pixel-interpretation + geometry metadata a
  renderer needs — with the safety-critical omissions intact: `rescaleSlope` is **absent** (not `1`)
  when the tag is absent, `signed` is absent (never guessed) unless `(0028,0103)` was present,
  `photometricInterpretation` is never defaulted to `MONOCHROME2`, and the three pixel-spacing tags
  (`(0028,0030)` / `(0018,1164)` / `(0018,2010)`) are distinct, never aliased.
- **Enhanced multi-frame functional groups.** `image.frame(i)` resolves the per-frame macros
  Per-Frame-else-Shared (PS3.3 §C.7.6.16): Pixel Measures, Plane Position, Plane Orientation, Pixel
  Value Transformation, Frame VOI LUT. `image.isEnhancedMultiFrame` flags such objects.
- **Value-layer error taxonomy.** New `DicomValueError` (codes `FRAME_INDEX_OUT_OF_RANGE`,
  `MISSING_REQUIRED_FUNCTIONAL_GROUP`) — separate from the parser's four fatal codes. The helpers are
  otherwise fail-safe (typed-absent for missing data) and throw only for a structural contract
  violation; the error message carries only structural facts (indices, tag/macro names), never a
  decoded PHI value.
- **Coded terminology.** `readCode` reads the `Code Value`/`Coding Scheme Designator`/`Code Meaning`
  triplet and resolves the canonical scheme OID via `codingSchemeOid` / `CODING_SCHEME_OIDS` for the
  four standard designators (`DCM`/`SCT`/`UCUM`/`LN`); legacy SNOMED designators
  (`SRT`/`SNM3`/`99SDM`) deliberately do **not** resolve to `SCT` (CP-730). Real World Value Mappings
  bind slope/intercept atomically to their measurement-units code.
- Public types: `PatientView`, `OtherPatientId`, `StudyView`, `SeriesView`, `ImageView`,
  `CodedConcept`, `RealWorldValueMap`, `FrameFunctionalGroups`, `ValueErrorCode`, plus
  `VALUE_ERROR_CODES` and the `readCode` / `codingSchemeOid` / `CODING_SCHEME_OIDS` helpers.
- **VR value decode + dataset navigation (Phase 3).** `Element.value` now lazily decodes (and
  memoizes) an element's raw bytes into a typed, discriminated `DicomValue` covering all 34 VRs —
  numbers (`US/UL/SS/SL/FL/FD`), 64-bit `bigint`s (`SV/UV`), attribute tags (`AT`), person names
  (`PN` → 3-group / 5-component), strings, free text, numeric strings (`DS/IS` → `number | null`,
  never `NaN`→0), temporal values (`DA/TM/DT`), sequences (`SQ` → threaded items), and raw `binary`
  for the bulk VRs. Decode is fail-safe (never throws, never coerces a malformed value to a
  plausible-but-wrong one) and surfaces per-value `warnings` with stable codes + byte offsets.
- String decode honors `(0008,0005)` Specific Character Set, threaded through the parser per
  dataset/SQ-item scope: UTF-8 (`ISO_IR 192`), the ISO-8859 single-byte family, and ISO-2022
  multibyte, with three term-list corrections vs PS3.3 §C.12.1.1.2 (no `ISO_IR 14`; `IR 87/159` are
  code-extension-only; `ISO_IR 203` Latin-9 is included). An unknown term emits
  `DICOM_UNSUPPORTED_CHARSET` and falls back to a best-effort decode.
- `Dataset`/`Item` navigation API: `get` / `has` / `elements` / `getAll`, tag lookup
  case-insensitive.
- Public surface: `decodeElementValue`, `parseSpecificCharacterSet`, `isKnownCharsetTerm`,
  `resolveDecoderLabel`, `decodeText`, `parsePersonName`, `parseDate`, `parseTime`, `parseDateTime`,
  and the `DicomValue` / `PersonName` / `DicomDate` / `DicomTime` / `DicomDateTime` types.
- Initial repo scaffold (Phase 1).
- Unit coverage for the PS3.15 Annex E lookup helper (`annexE`), enabling the per-directory
  coverage gate on `src/dictionary/`.
- Adopted the shared `@cosyte/test-utils` conformance kit (first parser to do so) and added a
  `fast-check` property + fuzz test layer under `test/property/`: synthetic-only generators
  (`_arbitraries.ts`) plus invariant suites for round-trip fidelity, lenient-mode robustness,
  parsed-model immutability, warning/fatal-code stability (snapshot), and a byte-parser fuzz sweep
  that feeds arbitrary buffers + random truncations and asserts the parser only ever throws a
  sanctioned Tier-3 `DicomParseError` — never an unexpected error, hang, or OOM. No public API
  change. (devDeps: `@cosyte/test-utils@^0.0.1`, `fast-check@3.23.2`.)

### Changed

- Migrated onto the shared cosyte engineering standard (Phase E): tooling now flows from the
  published `@cosyte/*` config packages (`@cosyte/tsup-config`, `@cosyte/vitest-config`,
  ESLint 10 via `@cosyte/eslint-config`) instead of repo-local copies; devDependencies pinned to
  the canonical exact versions; `attw` build/publish gate added; the per-directory coverage gate is
  now enabled (transient sub-90 floors with TODOs while the test layer fills in).
- CI/release workflows reduced to thin callers of the reusable `cosyte/.github` pipelines
  (`ci.yml` runs the shared PHI scan; `release.yml` targets `@cosyte/dicom`). The repo-specific
  byte-identical dictionary-regen workflow is kept and bumped to Node 22.

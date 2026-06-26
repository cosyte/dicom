# Changelog

All notable changes to `@cosyte/dicom` will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

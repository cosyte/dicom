# @cosyte/dicom — Project Guide for Claude

## Project

**`@cosyte/dicom`** — a developer-focused DICOM parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT). Sibling to `@cosyte/hl7` at `../hl7`.

**North star:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line — without having read the DICOM standard.

**Scope boundary (v1):** Metadata-first. Pixel data is exposed as raw `Buffer` + encapsulated fragments but **not decoded**. DIMSE network services and DICOMweb are explicit non-goals — tracked as future companion packages (`@cosyte/dicom-pixel`, `@cosyte/dicom-net`, `@cosyte/dicomweb`).

## Status

- **Phase 5 of 8 complete** (500 tests passing, 1 todo). Spec-clean Part 10 serializer live:
  `serializeDicom(ds)` writes a `Dataset` back to a Part 10 `Buffer` (preamble + `DICM`, File Meta
  always Explicit VR LE with computed group length, dataset body in the source transfer syntax — no
  transcode — across all four v1 syntaxes), with even-length padding, short/long-form headers, retired
  group-length omission, and byte-for-byte SQ / encapsulated-pixel-data passthrough; plus the
  `DicomSerializeError` taxonomy. Known limitation: only the typed `FileMeta` fields round-trip.
- **Phase 4 complete.** Safety-critical domain helpers: `ds.patient` / `ds.study` / `ds.series` /
  `ds.image` typed fail-safe views over the §4 attributes, Enhanced multi-frame functional-group
  resolution (`image.frame(i)`, Per-Frame-else-Shared), coded triplets (`readCode`), and the
  value-layer `DicomValueError`. Builds on Phase 3 VR value decode (all 34 VRs via `Element.value`) +
  the `Dataset`/`Item` navigation API.

## Tech Stack (the shared `@cosyte/*` standard)

dicom inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files (Phase E migration). The source of truth is the meta-repo's
`documentation/conventions.md`; this is a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`.
- **Build:** dual ESM + CJS + `.d.ts`/`.d.cts` via `tsup` (`@cosyte/tsup-config`); `attw` is a
  publish gate (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory gates. The
  gate is **enabled**; floors currently sit just below 90 (transient, with TODOs) while the early
  phases fill in coverage — see `vitest.config.ts`.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows; the repo-specific
  `dictionary-regen.yml` byte-identical regen gate is kept.
- **Runtime deps:** **≤ 3**, each MIT/Apache-licensed and ADR-justified. Deliberate divergence from
  `@cosyte/hl7`'s zero-dep rule; DICOM byte-level + charset work earns the exception. (Currently
  zero are taken.)
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
- Coverage: per-directory gate **enabled** on `src/parser/`, `src/dataset/`, `src/dictionary/` (and
  `src/helpers/` once it exists) via `pnpm test:coverage`. Canonical bar is ≥ 90%; early-phase floors
  currently sit just below that as documented transient relaxations with TODOs — raise them toward 90
  as coverage fills in, never disable the gate. `vitest.config.ts` is the source of truth.

## Style Reference

This project mirrors `@cosyte/hl7`'s tooling, artifact discipline, and engineering bar. Two deliberate divergences:

1. **Runtime deps allowed (≤ 3)** — see Tech Stack above.
2. **v1 scope narrower than the full standard** — metadata-first, no pixel decode, no network.

## Standing disciplines (every change)

These three bind every change in this repo (mirrored from the cosyte meta-repo's
`documentation/conventions.md`):

1. **Documentation follows code.** A public-surface / stack / status change isn't done until its
   docs are: this package's own docs (`docs-content/` + JSDoc), and — in the meta-repo — its
   `documentation/repos/<repo>.md` and the `ecosystem-map.md` status table.
2. **Version + changelog every meaningful change.** Add a Changeset (`pnpm changeset`, `patch`
   during pre-alpha) and keep `CHANGELOG.md`'s `[Unreleased]` current. Stay on `0.0.x` until first alpha.
3. **Crew + knowledgebase feedback loop.** When a standard, decision, or public surface changes,
   flag whether a `crew` skill or `knowledgebase` doc needs creating/updating — never silently skip.

Build, lint, format, and TypeScript settings come from the shared `@cosyte/*` config packages
(`@cosyte/tsconfig` · `@cosyte/eslint-config` · `@cosyte/prettier-config`; see
`documentation/conventions.md` → "Canonical toolchain (enforced)"). Node ≥ 22.

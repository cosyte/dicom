---
phase: 02-core-parser
plan: 02-02
subsystem: parser
tags: [parser, file-meta, transfer-syntax, part10, fatal-codes, fixture-builder]
requires:
  - 02-01 (warnings/errors registry, Dataset shell, ByteCursor, LONG_FORM_VRS)
  - Phase 1 Dictionary (uid lookup for human-readable TS names)
provides:
  - parser/index.ts — parseDicom(buffer[, options]) entry point
  - parser/part10-header.ts — preamble + DICM detection (stripPreamble tri-state)
  - parser/file-meta.ts — File Meta parser (hard-wired Explicit VR LE)
  - parser/transfer-syntax.ts — frozen 4-entry dispatch table + 4 stub strategies
  - test/helpers/build-dicom.ts — programmatic Part 10 fixture builder (internal)
affects:
  - All subsequent Phase 2 plans (02-03 / 04 / 05) replace strategy stubs
  - Phase 6 (D-45) — ParseContext profile? field already reserved by 02-01
tech-stack:
  added: []
  patterns:
    - dual EMPTY_INPUT check (raw + normalize)
    - zero-copy Buffer normalization across 3 input shapes
    - frozen Object.freeze dispatch table
    - parser → Dataset boundary: warnings frozen at construction
    - JSDoc @example demonstrates all 3 input shapes + onWarning + strict
key-files:
  created:
    - src/parser/part10-header.ts
    - src/parser/part10-header.test.ts
    - src/parser/file-meta.ts
    - src/parser/file-meta.test.ts
    - src/parser/transfer-syntax.ts
    - src/parser/transfer-syntax.test.ts
    - src/parser/index.test.ts
    - test/helpers/build-dicom.ts
  modified:
    - src/parser/index.ts (replaced 02-01 stub with full implementation)
decisions:
  - "Honored CONTEXT D-13 dual-EMPTY_INPUT (rawInputIsEmpty + post-normalize)"
  - "Honored D-14/D-15 stripPreamble tri-state with offset-0 (0002,0000) heuristic"
  - "Honored D-17 — File Meta parser does not consult dispatch table"
  - "Honored D-18 — group-length missing/wrong fold into Tier-2 warnings; trust actual"
  - "Honored D-19 — only (0002,0010) TS UID is parser-blocking; STRICT-03 deferred"
  - "Honored D-20 — frozen 4-entry dispatch; UNSUPPORTED_TRANSFER_SYNTAX carries Dictionary.uid(uid)?.name in snippet"
  - "Honored D-37/D-38 — buildDicom helper lives in test/helpers/, NOT exported from src/index.ts"
  - "Plan-defined buildDicom 'wrong' under-reports by 8 bytes (split MISMATCH from T-02-02-01 truncated-buffer fatal lane)"
metrics:
  tasks_completed: 3
  duration_minutes: ~15
  completed_date: 2026-05-01
  tests_added: 36 (6 part10-header + 8 file-meta + 8 transfer-syntax + 14 index)
  total_tests: 141 (was 105 at end of 02-01)
---

# Phase 2 Plan 02-02: Part 10 + File Meta + TS Dispatch Summary

`parseDicom(buffer)` is now a working entry point that produces a `Dataset` with `fileMeta` populated for any of the four v1 transfer-syntax UIDs, throws all four Tier-3 fatal codes correctly, and emits the three Phase 2 active File-Meta-time warnings via the single emit chokepoint shipped in 02-01.

## What was built

### Source files

- **`src/parser/part10-header.ts`** — `parsePart10Header(buffer, ctx, emit)` implementing the D-14/D-15 tri-state semantics:
  - `DICM` magic at offset 128 → strip 132 bytes, return `{ datasetStart: 132, hadPreamble: true }`.
  - `stripPreamble: 'require'` AND missing DICM → throw `NOT_DICOM_PART_10`.
  - `stripPreamble: 'tolerate'` (default) AND missing DICM:
    - Plausible `(0002,0000)` UL element at offset 0 → emit `DICOM_MISSING_PREAMBLE`, return `{ datasetStart: 0, hadPreamble: false }`.
    - Otherwise → throw `NOT_DICOM_PART_10`.
  - Buffers shorter than 12 bytes that lack DICM throw `NOT_DICOM_PART_10` rather than indexing past the buffer end (T-02-02-02 mitigation).

- **`src/parser/file-meta.ts`** — `parseFileMeta(buffer, datasetStart, ctx, emit) → { fileMeta, fileMetaEnd }`. Hard-wired Explicit VR LE per FM-01 / D-17 — never consults `TRANSFER_SYNTAX_PARSERS`. Implements D-18 group-length handling:
  - `(0002,0000)` present + accurate → silent.
  - `(0002,0000)` present + actual ≠ declared → emit `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`; trust actual; continue scanning forward through any remaining `(0002,xxxx)` elements.
  - `(0002,0000)` absent → emit `DICOM_FILE_META_GROUP_LENGTH_MISSING`; parse forward until first non-`(0002,xxxx)` group.
  - Declared length > buffer remaining → throw `INVALID_FILE_META` (T-02-02-01 mitigation).
  - `(0002,0010)` Transfer Syntax UID required (D-19) — missing → throw `INVALID_FILE_META` regardless of strict mode.
  - Other FM-02 fields projected when present, NOT enforced (STRICT-03 deferred to Phase 7).
  - UI VR trims trailing NUL (0x00) and SPACE (0x20); SH/AE trim trailing SPACE only.

- **`src/parser/transfer-syntax.ts`** — `TRANSFER_SYNTAX_PARSERS: Readonly<Record<string, ParserStrategy>>` frozen via `Object.freeze` with exactly four entries (D-20):
  - `1.2.840.10008.1.2` → `parseImplicitLE`
  - `1.2.840.10008.1.2.1` → `parseExplicitLE`
  - `1.2.840.10008.1.2.2` → `parseExplicitBE`
  - `1.2.840.10008.1.2.1.99` → `parseDeflatedLE`
  All four strategy bodies are 02-02 stubs returning `{ elements: new Map() }`. Plans 02-03 / 02-04 / 02-05 replace the bodies in place; the dispatch table itself does not change.

- **`src/parser/index.ts`** — replaced 02-01 stub with the full pipeline:
  1. Dual `EMPTY_INPUT` check (D-13): raw input length + post-normalize Buffer length.
  2. `normalizeInput` zero-copy: `Buffer` pass-through; `Uint8Array` → `Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)`; `ArrayBuffer` → `Buffer.from(ab)` (PARSE-04).
  3. `parsePart10Header` resolves preamble + DICM framing.
  4. `parseFileMeta` parses File Meta (Explicit VR LE).
  5. `TRANSFER_SYNTAX_PARSERS[fileMeta.transferSyntaxUID]` dispatches; undefined → throw `UNSUPPORTED_TRANSFER_SYNTAX` carrying `Dictionary.uid(uid)?.name` in `err.snippet` (D-20).
  6. Strategy returns `ReadonlyMap<Tag, Element>`; result wrapped in `new Dataset(...)`.

  JSDoc `@example` demonstrates all three input shapes (Buffer / Uint8Array / ArrayBuffer), the `onWarning` callback, and the `{ strict: true }` throwing path per plan specifics §.

### Test infrastructure

- **`test/helpers/build-dicom.ts`** — `buildDicom(opts)` programmatic Part 10 fixture builder (D-37). NOT exported from `src/index.ts`. Phase 2 ships zero curated `.dcm` fixture files; every test buffer is built in memory by this helper. Supports:
  - Implicit VR LE + Explicit VR LE encoders (BE/Deflated branches throw clearly until plans 02-04/05 extend `encodeElement`).
  - `skipPreamble` for missing-DICM tests.
  - `fileMetaGroupLength: number | 'omit' | 'wrong'` for FM-warning tests. (`'wrong'` under-reports by 8 bytes — see deviation 1 below.)
  - `skipTransferSyntaxUID` for `INVALID_FILE_META` tests.
  - Optional FM-02 extras: `mediaStorageSOPClassUID`, `mediaStorageSOPInstanceUID`, `implementationClassUID`, `implementationVersionName`.
  - `trailingBytes` hook for tests that want junk after the dataset.

## REQ coverage

All 12 plan-listed REQ-IDs satisfied:

| REQ-ID  | Coverage                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------- |
| PARSE-01 | `parseDicom(buf)` returns a `Dataset` for valid Part 10 input (index.test.ts happy path).          |
| PARSE-02 | Missing preamble emits `DICOM_MISSING_PREAMBLE` (lenient) or throws `NOT_DICOM_PART_10` (require). |
| PARSE-03 | Warnings carry `position.byteOffset`; FM warnings carry `position.fileMeta = true` (D-07).         |
| PARSE-04 | Buffer / Uint8Array / ArrayBuffer all yield equivalent Datasets.                                   |
| PARSE-05 | Random binary input throws `NOT_DICOM_PART_10` with non-empty hex snippet.                         |
| PARSE-06 | Empty input (Buffer / Uint8Array / ArrayBuffer) throws `EMPTY_INPUT` via the dual D-13 check.     |
| FM-01    | File Meta parser is hard-wired Explicit VR LE; never consults dispatch table.                       |
| FM-02    | Full FileMeta projection (TS UID + Media* + Implementation* + sourceApplicationEntityTitle).        |
| FM-03    | (0002,0000) missing/wrong handling per D-18; declared > buffer → INVALID_FILE_META.                 |
| FM-04    | All 4 v1 TS UIDs dispatch successfully; out-of-scope UID throws `UNSUPPORTED_TRANSFER_SYNTAX`.      |
| TOL-02   | Fatal errors carry message + byteOffset + snippet (verified for EMPTY_INPUT and NOT_DICOM_PART_10). |
| TOL-06   | Missing preamble is lenient by default (warning), strict via `stripPreamble: 'require'`.            |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] `buildDicom('wrong')` group-length under-reports by 8 bytes instead of over-reporting by 99.**
- **Found during:** Task 2 file-meta.test.ts MISMATCH case.
- **Issue:** The plan's helper code over-reported declared length by 99 bytes. With small fixtures (no trailing dataset elements), declared=body+99 > buffer.length, which hits the T-02-02-01 mitigation lane (`INVALID_FILE_META`) instead of producing `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`. The two test cases (T-02-02-01 truncated-buffer fatal vs MISMATCH warning) require disjoint fixtures.
- **Fix:** `'wrong'` now uses `Math.max(0, fileMetaBody.length - 8)` — under-reports declared length by 8 bytes. Parser still detects mismatch (consumed > declared after the loop) and emits `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`. The dedicated T-02-02-01 case uses `fileMetaGroupLength: 10_000` (numeric override) to trigger the truncated-buffer fatal.
- **Files modified:** `test/helpers/build-dicom.ts`
- **Commit:** 021532a

### Auth gates
None.

### Architectural changes
None.

## Threat model coverage

All five Phase 2-02 threats from the plan threat model are tested:

- **T-02-02-01** (Buffer over-read on truncated File Meta): `parseFileMeta — T-02-02-01 truncated input mitigation` test. Declared length 10_000 with ~30 bytes remaining → `INVALID_FILE_META` thrown.
- **T-02-02-02** (Buffer over-read on truncated preamble): `parsePart10Header` tests for buffers shorter than 12 bytes throw `NOT_DICOM_PART_10` not `RangeError`. `ByteCursor.readUInt16At/readUInt32At` from 02-01 raise `RangeError` on out-of-range; `parseFileMeta` catches and re-throws as `INVALID_FILE_META`.
- **T-02-02-03** (Spoofing non-DICOM input): random binary blob test confirms `NOT_DICOM_PART_10` with non-empty hex snippet.
- **T-02-02-04** (Spoofing via fake TS UID): JPEG Baseline (`1.2.840.10008.1.2.4.50`) test confirms `UNSUPPORTED_TRANSFER_SYNTAX`. The `Dictionary.uid` lookup is informational only — the dispatch table is the sole source of truth.
- **T-02-02-05** (Information disclosure via snippets): documented in `errors.ts` `@remarks` (already shipped in 02-01).

## Strict-mode coverage

Strict-mode escalation verified for `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` via the index.test.ts strict-mode test. The full strict-mode pair-test gate sweep across all actively-emitted Tier-2 codes lives in plan 02-06 per CONTEXT D-36 / D-39.

## Acceptance gates (all pass)

- `pnpm typecheck` ✓ exits 0
- `pnpm lint` ✓ exits 0 (max-warnings=0)
- `pnpm test` ✓ 141/141 pass (12 test files; 36 new tests in 02-02)
- `pnpm build` ✓ ESM 993.67 KB, CJS 993.88 KB, DTS 30.76 KB
- `node test/smoke/esm/index.mjs` ✓ green
- `node test/smoke/cjs/index.cjs` ✓ green
- Pre-commit hook (PHI scan + simple-git-hooks) ✓ green on every task commit

## Commits

| Hash    | Message                                                              |
| ------- | -------------------------------------------------------------------- |
| 7d10af4 | feat(02-02): Part 10 header detection + buildDicom fixture helper    |
| 021532a | feat(02-02): File Meta parser + Transfer Syntax dispatch table       |
| 5129d42 | feat(02-02): wire parseDicom entry — input normalization, dispatch, fatals |

## Phase boundary preserved

- Strategy bodies in `transfer-syntax.ts` are STUBS — plans 02-03 (`parseImplicitLE`) and 02-04 (`parseExplicitLE` / `parseExplicitBE`) and 02-05 (`parseDeflatedLE`) replace them in place WITHOUT modifying the dispatch table or `src/parser/index.ts`.
- `Element` and `Dataset` still have the 02-01 structural surface only — no `.value` getter, no navigation methods (Phase 3, D-42).
- No VR-aware decoders, no charset decoding, no helpers, no serializer, no profiles, no anonymize/validate (later phases).
- File Meta parser tolerates non-zero reserved bytes in long-form headers — the strict reserved-bytes assert lives in dataset parsers (plan 02-04).

## Self-Check: PASSED

Created files exist:
- `src/parser/part10-header.ts` ✓
- `src/parser/part10-header.test.ts` ✓
- `src/parser/file-meta.ts` ✓
- `src/parser/file-meta.test.ts` ✓
- `src/parser/transfer-syntax.ts` ✓
- `src/parser/transfer-syntax.test.ts` ✓
- `src/parser/index.test.ts` ✓
- `test/helpers/build-dicom.ts` ✓

Commits exist in `git log --all`:
- 7d10af4 ✓
- 021532a ✓
- 5129d42 ✓

## Next plan

**02-03** (Wave 3a): Implicit VR LE parser. Replace `parseImplicitLE` body in `src/parser/transfer-syntax.ts` with the real implementation. Implements D-21 fallback rules (standard tag → dict VR; multi-VR → first; repeating-group family → family entry; private tag → UN with creator stack). Also wires the `creators[gggg][XX]` private-creator block-reservation rule (D-33 / D-34, PITFALLS §7.1).

Plan 02-03 runs in parallel with plan 02-04 (Explicit VR LE / BE / SQ + element-header) — disjoint files.

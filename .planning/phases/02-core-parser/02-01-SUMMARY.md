# Plan 02-01 — Summary

**Plan:** 02-01 (Wave 1) — Foundation: warnings/errors registry + dataset shell + parser scaffolding
**Phase:** 02-core-parser
**Status:** ✓ Complete
**Completed:** 2026-05-01

---

## What was built

A parseable, typecheckable, lint-clean Phase 2 foundation. Every downstream Phase 2 plan and Phase 3+ phases (per CONTEXT D-42, D-44, D-45, D-46) will import from these modules — schema-breaking changes after this plan ships will cascade.

### Source files created (parser/)
- `src/parser/types.ts` — `DicomPosition`, `DicomParseWarning`, `ParseOptions`, `OnWarningCallback`, `ParseContext` (internal). All readonly, `exactOptionalPropertyTypes`-clean.
- `src/parser/warnings.ts` — frozen `WARNING_CODES as const` registry (24 distinct codes per TOL-03) + named factory function per actively-emitted code (D-08, D-12). `WarningCode` type derived from registry values.
- `src/parser/errors.ts` — frozen `FATAL_CODES as const` (exactly 4 codes per D-09: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`) + `DicomParseError extends Error` with `code`, `byteOffset`, `snippet`, `contextPath?`. Snippet helper renders ≤ 16 source bytes as space-separated lowercase hex (D-10).
- `src/parser/emit.ts` — single `emitWarning(ctx, warning)` chokepoint that throws `DicomParseError` under `ctx.strict === true` (D-11, D-35); otherwise pushes to `ctx.warnings` and invokes `ctx.onWarning?` synchronously after the push (D-03).
- `src/parser/byte-cursor.ts` — endian-aware `ByteCursor` over Node `Buffer` with `position`, `readU8/16/32` (LE/BE), `slice`, `seek`, `peek*`, bounds-checked advance. Built on `Buffer.readUInt*LE/BE` (NOT `DataView`) per project standard.
- `src/parser/endian.ts` — `BE_VR_STRIDE: Readonly<Record<VR, 0|2|4|8>>` covering all 33 standard VRs + the 3 64-bit additions (`OV`, `SV`, `UV`); per-VR swap function with the `AT` special case documented in JSDoc (stride=2 + count=2 — two independent 2-byte swaps per group/element pair, NOT one 4-byte swap) per D-23. `OB`/`UN` stride=0 (never swapped) per D-24.
- `src/parser/element-header.ts` — `LONG_FORM_VRS: ReadonlySet<VR>` per D-22 (`OB OW OF OD OL SQ UT UN UC UR`). Reused by future explicit-VR parsers (02-04) and Phase 5 serializer (D-44).
- `src/parser/index.ts` — type-stable `parseDicom` overload signature per D-01 (two overloads: `(buffer)` and `(buffer, options)`; the third Profile overload is deferred to Phase 6 per D-45). Implementation throws — actual logic arrives in plan 02-02.

### Source files created (dataset/)
- `src/dataset/dataset.ts` — `Dataset` class with constructor-set `fileMeta`, `warnings`, internal element map. **No** `get`/`has`/`elements`/`getAll`/`setElement`/`addElement`/`removeElement`/`addItem`/`removeItem` methods — those are Phase 3 deliverables per D-42.
- `src/dataset/element.ts` — `Element` class with structural fields: `tag`, `vr`, `vm`, `length`, `rawBytes`, `byteOffset`, `privateCreator?`. **No `.value` getter** in Phase 2 per D-42; Phase 3 adds the lazy/memoized decode.
- `src/dataset/file-meta.ts` — `FileMeta` view interface exposing `transferSyntaxUID`, `mediaStorageSopClassUID`, `mediaStorageSopInstanceUID`, `implementationClassUID`, `implementationVersionName`, `sourceApplicationEntityTitle` (FM-02 fields).
- `src/dataset/sequence.ts` — `Sequence` class with `items: readonly Item[]` and `length`. Navigation methods deferred to Phase 3.
- `src/dataset/item.ts` — `Item` class — a nested Dataset wrapper.
- `src/dataset/tag.ts` — Tag hex utilities (group/element split, validation, normalization). Internal-export only in Phase 2; not added to public barrel.

### Public barrel delta (src/index.ts)
Per D-04: added `parseDicom` (stub), `Dataset`, `Element`, `Sequence`, `Item`, `FileMeta` (type), `WARNING_CODES`, `FATAL_CODES`, `DicomParseError`, and the type aliases `WarningCode`, `FatalCode`, `DicomParseWarning`, `DicomPosition`, `ParseOptions`, `OnWarningCallback`. Phase 1's `VERSION` and `Dictionary` namespace exports preserved unchanged.

### Test files created
- `src/parser/byte-cursor.test.ts` (13 tests) — endian-aware reads, bounds checking, slice, seek, peek.
- `src/parser/warnings.test.ts` (17 tests) — registry shape, every factory, frozen guarantees.
- `src/parser/errors.test.ts` (10 tests) — `DicomParseError` shape, snippet hex rendering, all 4 fatal codes.
- `src/parser/emit.test.ts` (8 tests) — chokepoint behavior, strict-mode escalation, onWarning callback ordering.
- `src/parser/endian.test.ts` (13 tests) — per-VR stride table, AT pair semantics, OB no-swap.
- `src/dataset/tag.test.ts` (11 tests) — tag hex utilities.

**Total Phase 2 tests added in 02-01:** 72. Combined with Phase 1's 33 unit tests (dictionary) + 8 PHI-scan integration tests = 105 tests passing.

---

## Acceptance gates (all pass)
- `pnpm typecheck` ✓ exits 0
- `pnpm lint` ✓ exits 0
- `pnpm test` ✓ 105/105 pass (8 test files)
- `pnpm build` ✓ ESM 980.23 KB, CJS 980.42 KB, DTS 28.88 KB
- Pre-commit hook (PHI scan + simple-git-hooks) ✓ green on every task commit

## Decision coverage
32 distinct CONTEXT D-IDs cited inline across Phase 2 source: D-01, D-02, D-03, D-04, D-05, D-07, D-08, D-09, D-10, D-11, D-12, D-16, D-17, D-18, D-19, D-21, D-22, D-23, D-24, D-27, D-28, D-29, D-30, D-32, D-33, D-34, D-35, D-40, D-42, D-43, D-44, D-45.

## Phase boundary preserved
- Element has **no** `.value` getter → Phase 3 deliverable
- Dataset has **no** navigation methods → Phase 3 deliverable
- No VR-aware decoders, no charset decoding, no helpers, no serializer, no profiles, no anonymize/validate
- 4 fatal codes only (D-09 / PROJECT.md "Fatal errors only for unrecoverable structural corruption")

## REQ coverage
- TOL-03 — frozen WARNING_CODES registry shape locked
- TOL-04 — `Dataset.warnings` always an array (possibly empty)
- TOL-05 — `OnWarningCallback` synchronous invocation in `emitWarning`

## Commits
- `8f5be00` feat(02-01): add WARNING_CODES, FATAL_CODES, type surface, ByteCursor, BE_VR_STRIDE, LONG_FORM_VRS
- `536a9b4` feat(02-01): add single emit chokepoint for Tier-2 warnings with strict-mode escalation
- `a8b8310` feat(02-01): structural Dataset shell + public surface delta

## Next plan
**02-02** (Wave 2): parseDicom entry — input normalization, dual EMPTY-INPUT check, Part 10 header (DICM + stripPreamble tri-state), File Meta parser (Explicit VR LE hard-wired), `TRANSFER_SYNTAX_PARSERS` dispatch table, all 4 fatal codes wired, `test/helpers/build-dicom.ts` programmatic fixture builder. Replaces the parseDicom stub with a real implementation that dispatches to the 4 TS-specific parsers (which are stub-throws until plans 02-03/04/05 land).

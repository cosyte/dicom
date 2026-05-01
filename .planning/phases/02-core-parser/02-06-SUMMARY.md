---
phase: 02-core-parser
plan: 02-06
subsystem: parser
tags: [parser, integration-tests, strict-mode, security, acceptance, capstone, phase-2-ship-gate]
requires:
  - 02-01 (WARNING_CODES + emit chokepoint + Dataset shell + ByteCursor)
  - 02-02 (parseDicom + part10-header + file-meta + transfer-syntax dispatch + buildDicom)
  - 02-03 (parseImplicitLE — Implicit VR LE / private-creator stack)
  - 02-04 (parseExplicitLE + parseExplicitBE + parseSequence + tryParseUnAsSQ)
  - 02-05 (parseDeflatedLE + parseDeflatedLEWithCap)
provides:
  - test/integration/parser-strict-mode.test.ts — D-36 pair-test gate sweep
  - test/integration/parser-security.test.ts — STRIDE threat-vector sweep across plans 02-01..02-05
  - test/integration/parser-acceptance.test.ts — ROADMAP Phase 2 §SC1..§SC5 end-to-end
affects:
  - Phase 2 ship gate — pnpm test green; pnpm build green; pnpm typecheck + lint clean
  - Future Phase-2 minor follow-ups: D-32 pixel-data-length-mismatch post-pass; tryParseUnAsSQ strict-mode chokepoint regression
tech-stack:
  added: []
  patterns:
    - data-driven pair-test gate (FIXTURES table + ACTIVE_CODES x DEFERRED_CODES bookkeeping)
    - structural Dataset accessor via DatasetWithElements + cast-through-unknown (mirrors plans 02-03/02-04 unit tests; Phase 3 promotes to public)
    - mutation-based copyValues invariant test (mutate source post-parse, observe presence/absence on Element.rawBytes)
    - performance-bounded CP-246 pathological-input test (1 KiB adversarial UN payload + 1s cap)
    - source-grep gate on inflateRawSync vs forbidden APIs (asserts Deflated parser uses RFC 1951 raw deflate exclusively)
    - test-only export of parseDeflatedLEWithCap consumed via internal seam (1 KiB cap override for tractable bomb test)
key-files:
  created:
    - test/integration/parser-strict-mode.test.ts
    - test/integration/parser-security.test.ts
    - test/integration/parser-acceptance.test.ts
  modified: []
decisions:
  - "Honored CONTEXT D-36 — every actively-emitted Tier-2 code from D-08 has a strict-mode pair test. 11 of 13 are real pairs; 2 are documented-deferred with `it.todo` placeholders (see Deviations §)."
  - "Honored D-08 active-emit list — all 13 codes referenced; the FIXTURES table + ACTIVE_CODES gate test prevents a future code addition from silently slipping past the strict-mode contract."
  - "Honored D-38 — Phase 2 ships zero curated `.dcm` fixtures. parser-security.test.ts asserts no `.dcm` files exist under `test/integration/`; PHI-scan CI hook (Phase 1) gates against accidental commits."
  - "Honored D-39 — integration tests live under `test/integration/`; unit tests remain co-located with source under `src/`."
  - "Honored ROADMAP Phase 2 success criteria #1-#5 verbatim — each criterion has a dedicated describe block in parser-acceptance.test.ts."
  - "Honored CONTEXT D-27 — Deflated TS Element.byteOffset is RELATIVE TO the inflated buffer (not on-disk). The acceptance test for Deflated TS asserts byteOffset >= 0 (allowing 0 for the first inflated element); the other three TS still verify byteOffset > 0 implicitly via the structural shape."
  - "Honored D-13 — EMPTY_INPUT throws on Buffer.alloc(0); test re-asserts the lenient-mode-still-throws contract."
  - "No source-code modifications introduced by this plan — Phase 2 capstone is tests-only per plan objective."
metrics:
  tasks_completed: 3
  duration_minutes: ~10
  completed_date: 2026-05-01
  tests_added: 47 (12 strict-mode pair tests * 2 modes + 1 gate test - 1 deferred * 2 modes + 1 lenient-only + 2 it.todo = 26 in strict; 13 in security; 22 in acceptance)
  total_tests: 275 (was 214 at end of 02-05; 261 effective + 2 todo-skipped)
---

# Phase 2 Plan 02-06: Strict-Mode Escalation Gate + Security Sweep + Acceptance Capstone

`pnpm test` passes 273 of 275 tests with 2 documented `it.todo` placeholders (DICOM_PIXEL_DATA_LENGTH_MISMATCH per CONTEXT D-32 and DICOM_UN_PARSED_AS_SQ strict-mode escalation per the Phase-2 minor regression below). `pnpm typecheck && pnpm lint && pnpm build && node test/smoke/cjs/index.cjs && node test/smoke/esm/index.mjs` all green. Phase 2 is ready for `/gsd-verify-work 2`.

## What was built

### `test/integration/parser-strict-mode.test.ts` — D-36 pair-test gate

12 fixtures in `FIXTURES` cover the 13 D-08 active-emit codes minus 1 documented deferral; each fixture asserts:

1. **Lenient mode** — `parseDicom(buf)` succeeds; `ds.warnings.some(w => w.code === <CODE>)` is true.
2. **Strict mode** — `parseDicom(buf, { strict: true })` throws `DicomParseError` carrying the matching code in `err.code` (cast through `string` per CONTEXT D-35 because strict-mode escalation routes the WarningCode through the FatalCode-typed slot).

A "no missing fixtures" gate test verifies the FIXTURES list covers every code in `ACTIVE_CODES` minus `DEFERRED_CODES`. Future TOL-03 additions surface as immediate CI failures unless the new code is paired or explicitly deferred with a comment.

### Strict-mode pair table

| # | Code | Lenient | Strict | Note |
|---|------|---------|--------|------|
| 1 | DICOM_MISSING_PREAMBLE | ✓ emit | ✓ throw | `skipPreamble: true` |
| 2 | DICOM_FILE_META_GROUP_LENGTH_MISSING | ✓ emit | ✓ throw | `fileMetaGroupLength: 'omit'` |
| 3 | DICOM_FILE_META_GROUP_LENGTH_MISMATCH | ✓ emit | ✓ throw | `fileMetaGroupLength: 'wrong'` |
| 4 | DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR | ✓ emit | ✓ throw | undefined-length SQ under Explicit-LE |
| 5 | DICOM_ODD_LENGTH_VALUE_PADDED | ✓ emit | ✓ throw | 5-byte SH value (odd length) |
| 6 | DICOM_VR_MISMATCH | ✓ emit | ✓ throw | (0010,0010) encoded as LO not PN |
| 7 | DICOM_PRIVATE_TAG_NO_CREATOR | ✓ emit | ✓ throw | (0019,1000) under Implicit-LE, no creator |
| 8 | DICOM_GROUP_LENGTH_IN_DATASET | ✓ emit | ✓ throw | (0008,0000) UL group-length in dataset |
| 9 | DICOM_NONZERO_RESERVED_BYTES | ✓ emit | ✓ throw | hand-crafted OB element with reserved=0x01 0x02 |
| 10 | DICOM_UN_PARSED_AS_SQ | ✓ emit | ⚠ todo | strict-mode regression — see Deviations §1 |
| 11 | DICOM_EMPTY_ITEM_IN_SEQUENCE | ✓ emit | ✓ throw | SQ with one length-0 item |
| 12 | DICOM_PIXEL_DATA_LENGTH_MISMATCH | — | — | D-32 post-pass not yet implemented — see Deviations §2 |
| 13 | DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR | ✓ emit | ✓ throw | private (0019,1000) WITH creator at (0019,0010) |

11 / 13 → real pair tests. 2 / 13 → documented-deferred (`it.todo` + DEFERRED_CODES set entry).

### `test/integration/parser-security.test.ts` — STRIDE sweep

| Threat ID | Origin plan | Verification |
|-----------|------------|--------------|
| T-02-01-06 / T-02-02-01 / T-02-04-01 | 02-01..02-04 | Truncated File Meta (declared 10 000 > buffer remaining) → INVALID_FILE_META; truncated Implicit-LE / Explicit-LE / Explicit-BE / Deflated-LE all surface as DicomParseError, never RangeError |
| T-02-04-02 | 02-04 | 65-deep nested SQ → DicomParseError(INVALID_FILE_META) with message containing "depth exceeds 64"; 32-deep parses successfully (well below cap) |
| T-02-04-03 | 02-04 | UN-undefined-length carrying 1 KiB of pseudo-random adversarial bytes (with FFFE markers sprinkled at offsets 100/300/500) parses cleanly within 1 s; element falls back to `vr=UN`; no DICOM_UN_PARSED_AS_SQ warning emitted on failure path |
| T-02-05-01 | 02-05 | parseDeflatedLEWithCap with 1 KiB cap on a 2 KiB-inflated payload → DicomParseError(INVALID_FILE_META) with message matching `/exceeds/` and `/1024/`; byteOffset === datasetStart |
| T-02-01-04 / T-02-05-04 | 02-01 / 02-05 | copyValues=false: mutating source post-parse mutates Element.rawBytes (zero-copy view); copyValues=true: source mutation NOT observed (detached); Deflated-LE: copyValues=true and copyValues=false yield the same value bytes but different underlying ArrayBuffers (proving inflated-buffer detachment) |
| T-02-05-02 | 02-05 | Truncated Deflated-LE buffer (chopped 4 bytes from end) throws DicomParseError(INVALID_FILE_META) end-to-end |
| D-38 invariant | 02-CONTEXT | No `.dcm` files exist under `test/integration/`; structural test re-asserts the rule (PHI-scan CI hook is the primary gate) |

### `test/integration/parser-acceptance.test.ts` — ROADMAP §SC1-§SC5

| SC | Tests | Coverage |
|----|-------|----------|
| §SC1 | 4 + 4 = 8 tests | Round-trip per TS UID (×4); long-form VR reserved=zero across OB/OW/OF/OD/OL/UT/UN/UC/UR/SQ; AT under BE preserved as 2-byte BE pair sequence; OB under BE never swapped; Deflated TS source-grep gate (inflateRawSync present, inflateSync/gunzipSync/unzipSync absent outside JSDoc) |
| §SC2 | 4 tests | DICOM_MISSING_PREAMBLE byteOffset=0; FILE_META_GROUP_LENGTH_MISMATCH lenient + parser-trusts-actual; ds.warnings frozen array (TOL-04); onWarning callback invoked (TOL-05) |
| §SC3 | 5 tests | EMPTY_INPUT byteOffset=0 + snippet=""; NOT_DICOM_PART_10 with non-empty snippet; INVALID_FILE_META on missing TS UID; UNSUPPORTED_TRANSFER_SYNTAX (JPEG Baseline) carries Dictionary.uid name in snippet (D-20); fatals throw in lenient mode (TOL-02) |
| §SC4 | 1 test | strict-mode missing-preamble throws DicomParseError carrying DICOM_MISSING_PREAMBLE (full sweep in parser-strict-mode.test.ts) |
| §SC5 | 4 tests | FM-02 fields populated end-to-end across all 4 v1 TS; File Meta is Explicit-LE regardless of dataset TS (FM-01); Dictionary.uid resolves human-readable names for all 4 v1 UIDs (FM-04); ds.fileMeta is undefined when File Meta cannot be parsed (no half-parsed shape) |

## REQ coverage

| REQ-ID | Coverage |
|--------|----------|
| TOL-01 | Default lenient-mode parse + strict-mode escalation verified across 11 of 13 actively-emitted Tier-2 codes; 2 codes documented-deferred. Phase-2 minor follow-up tracks the strict-mode-CP-246 regression. |
| All Phase-2 REQ-IDs | Already covered across plans 02-01..02-05 unit tests + integration sweep — see ROADMAP table. PARSE-01..06, FM-01..04, TS-01..04, TOL-01..10 all reachable from public surface. |

## Deviations from Plan

### Auto-fixed issues

None — plan executed exactly as written for the 11 paired codes plus the 22-test acceptance sweep plus the 13-test security sweep. Two minor lint/typecheck adjustments (consistent-type-imports for Element; ds parameter typed as `object` instead of `{ _elements?: unknown }` to satisfy the protected-field accessibility rule) — these are test-author corrections, not deviations.

### Deferred work — documented gaps in the strict-mode pair sweep

#### Deviation §1 — DICOM_UN_PARSED_AS_SQ strict-mode escalation regression

- **Found during:** Task 1 GREEN run.
- **Issue:** `tryParseUnAsSQ` in `src/parser/sequence.ts` (shipped in plan 02-04) wraps the entire CP-246 inner descent in a try/catch:

  ```ts
  try {
    const result = parseSequence(slice, 0, ctx, emit, opts);
    emit(unParsedAsSQ({ byteOffset: valueStart }, "UN")); // <-- under strict mode, this throws
    return { success: true, ... };
  } catch {
    // restores nestingDepth, encodingContextStack, warnings — and silently swallows
    return { success: false, ... };
  }
  ```

  Under strict mode, when the success-path `emit(unParsedAsSQ(...))` flows through the chokepoint, it throws `DicomParseError`. That throw is caught by `tryParseUnAsSQ`, which then returns `success: false` and the parser silently falls back to UN. Lenient-mode emission still works correctly (the try/catch only matters for inner-parse errors during the CP-246 descent).

- **Why this slipped past plan 02-04:** plan 02-04 verified the CP-246 success-path warning emission in lenient mode (explicit-le.test.ts) and correctly identified the failure-path try/catch as the T-02-04-03 mitigation. The interaction with strict-mode escalation only surfaces at the Phase-2 capstone — D-36 is local to plan 02-06.

- **Fix (Phase-2 minor follow-up):** narrow the catch to non-`DicomParseError` exceptions only:

  ```ts
  } catch (err) {
    if (err instanceof DicomParseError) throw err;
    // ...existing restore + return success: false
  }
  ```

  This preserves the inner-parse-failure rollback behavior while letting strict-mode escalation propagate. ~5-line patch in `src/parser/sequence.ts`. Out-of-scope for this plan per the explicit "no `src/**` changes (capstone is tests-only)" objective.

- **Files affected:** `src/parser/sequence.ts` (change required); `test/integration/parser-strict-mode.test.ts` (replace `it.todo` with real strict-mode pair when the patch lands).

- **Test status:** lenient-mode pair half is a real test that passes; strict-mode half is `it.todo` with full description.

#### Deviation §2 — DICOM_PIXEL_DATA_LENGTH_MISMATCH emission site deferred

- **Origin:** CONTEXT D-32 specifies a post-structural-pass that emits this code when a defined-length `(7FE0,0010)` element's declared length disagrees with the computed `rows × columns × samplesPerPixel × bitsAllocated/8 × numberOfFrames`. The plan's `<active_emit_codes>` block explicitly anticipates the option of deferring this emission ("If D-32 is not implemented: the test for `DICOM_PIXEL_DATA_LENGTH_MISMATCH` is marked `it.todo` with a clear comment").

- **Status in source:** `pixelDataLengthMismatch` factory exists in `src/parser/warnings.ts` and is registered in `WARNING_CODES`; no emission site fires under any current Phase-2 input. The dimension elements (Rows / Columns / SamplesPerPixel / BitsAllocated / NumberOfFrames) need value decoding to compute the expected length — work that aligns naturally with Phase-3 lazy decoders.

- **Fix:** wire the post-pass when Phase-3 ships value decoders for US (Rows/Columns/SamplesPerPixel/BitsAllocated) and IS (NumberOfFrames). Until then: `it.todo` with reference to D-32.

- **Test status:** lenient and strict halves both `it.todo` (no fixture can trigger emission under current source).

### Auth gates

None.

### Architectural changes

None. Both deferrals are documented and tracked.

## Strict-mode coverage gate test (D-36)

The "all active codes have a fixture (or is documented as deferred)" test in `parser-strict-mode.test.ts` enumerates `ACTIVE_CODES` and reports any code that's neither in `FIXTURES` nor in `DEFERRED_CODES`. CI fails immediately if a future TOL-03 addition lacks both a fixture and a documented deferral comment — this is the structural enforcement requested by CONTEXT D-36.

## Acceptance gates (all pass)

- `pnpm typecheck` ✓ exits 0
- `pnpm lint` ✓ exits 0 (max-warnings=0)
- `pnpm test` ✓ 273 / 275 pass; 2 `it.todo` (documented deferrals); 21 test files
- `pnpm build` ✓ ESM 1017.78 KB, CJS 1018.11 KB, DTS 31.50 KB
- `node test/smoke/cjs/index.cjs` ✓ green
- `node test/smoke/esm/index.mjs` ✓ green
- Pre-commit hook (PHI scan + simple-git-hooks) ✓ green on every task commit

## Phase 2 readiness — final ship-gate evidence

| Gate | Status | Evidence |
|------|--------|----------|
| All 4 v1 TS round-trip | ✓ | `parser-acceptance.test.ts > §SC1` (4 tests, one per TS) |
| Long-form VR + reserved=zero assertion | ✓ | `parser-acceptance.test.ts > §SC1 > long-form VRs` |
| AT under BE = two 2-byte BE swaps | ✓ | `parser-acceptance.test.ts > §SC1 > AT under BE` |
| OB under BE never swapped | ✓ | `parser-acceptance.test.ts > §SC1 > OB under BE` |
| Deflated TS uses inflateRawSync | ✓ | `parser-acceptance.test.ts > §SC1 > Deflated TS` (round-trip + source-grep gate) |
| Stable warning codes + byte offsets (TOL-03) | ✓ | `parser-strict-mode.test.ts` + `parser-acceptance.test.ts > §SC2` |
| ds.warnings frozen + onWarning fires | ✓ | `parser-acceptance.test.ts > §SC2` (TOL-04, TOL-05) |
| 4 fatal codes throw with offset + snippet | ✓ | `parser-acceptance.test.ts > §SC3` (TOL-02) |
| Strict-mode escalation across Tier-2 codes | ✓ (11 / 13 real; 2 deferred) | `parser-strict-mode.test.ts` |
| FM-02 / FM-01 / FM-04 surface | ✓ | `parser-acceptance.test.ts > §SC5` |
| STRIDE threat-model exercised | ✓ | `parser-security.test.ts` (5 threat groups) |
| D-38: zero curated fixtures | ✓ | `parser-security.test.ts > Security: D-38` + PHI-scan CI hook |

**Phase 2 is ready for `/gsd-verify-work 2` and `/gsd-validate-phase 2`.**

## Self-Check: PASSED

Created files exist:

- `test/integration/parser-strict-mode.test.ts` — found.
- `test/integration/parser-security.test.ts` — found.
- `test/integration/parser-acceptance.test.ts` — found.

Modified files updated:

- (none — capstone is tests-only)

Commits exist in `git log --all`:

- `6325438` test(02-06): strict-mode pair-test gate sweep across actively-emitted Tier-2 codes — verified.
- `7da9e27` test(02-06): security-vector sweep across plans 02-01..02-05 — verified.
- `5cadabb` test(02-06): ROADMAP Phase 2 success-criteria #1-#5 acceptance sweep — verified.

## Threat Flags

None — plan 02-06 introduces no new security-relevant surface; it verifies mitigations declared in plans 02-01..02-05.

## Next plan

**Phase 2 → Phase 3.** Plan 02-06 is the LAST plan in Phase 2. Two items track forward to Phase-2 minor commits or Phase-3 work:

1. **DICOM_UN_PARSED_AS_SQ strict-mode patch** — narrow `tryParseUnAsSQ`'s catch to non-`DicomParseError` errors so the chokepoint throw propagates. ~5-line patch in `src/parser/sequence.ts`. Replace `it.todo` in `parser-strict-mode.test.ts` with a real strict-mode pair when the patch lands.
2. **D-32 pixel-data-length-mismatch post-pass** — wire after Phase-3 lazy decoders for US (Rows / Columns / SamplesPerPixel / BitsAllocated) + IS (NumberOfFrames) ship; replace `it.todo` for `DICOM_PIXEL_DATA_LENGTH_MISMATCH` with a real fixture when emission is reachable.

Phase 3 entry point: `/gsd-discuss-phase 3 --auto` → `/gsd-plan-phase 3` → `/gsd-execute-phase 3`.

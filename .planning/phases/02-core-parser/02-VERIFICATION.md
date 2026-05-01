---
phase: 02-core-parser
verified: 2026-05-01T16:55:00Z
status: human_needed
score: 4.5/5 must-haves verified (SC4 partial — CP-246 strict-mode regression flagged)
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "ROADMAP SC4 — `{ strict: true }` escalates EVERY Tier-2 deviation to a thrown DicomParseError"
    status: partial
    reason: |
      The CP-246 emission site (`DICOM_UN_PARSED_AS_SQ` from `tryParseUnAsSQ` in
      src/parser/sequence.ts:296-337) wraps the descent in a bare try/catch
      (line 326 `} catch {`) that swallows ANY thrown error — including the
      strict-mode `DicomParseError` raised by the emit chokepoint when
      `unParsedAsSQ()` fires at line 320. Result: under `{ strict: true }` the
      parser silently restores state and falls back to `VR=UN` rather than
      throwing. Lenient mode emission is correct.

      The user's verification brief explicitly identified this as breaking SC4
      partially. 12/13 actively-emitted Tier-2 codes correctly escalate; this
      is the lone regression. Tracked as `it.todo` at
      test/integration/parser-strict-mode.test.ts:379-383.
    artifacts:
      - path: "src/parser/sequence.ts"
        issue: "Bare try/catch at line 326 swallows DicomParseError from strict-mode chokepoint"
      - path: "test/integration/parser-strict-mode.test.ts"
        issue: "it.todo at line 379-383 — strict-mode pair test for DICOM_UN_PARSED_AS_SQ deferred"
    missing:
      - "Replace bare `} catch {` in tryParseUnAsSQ with `} catch (err) { if (err instanceof DicomParseError) throw err; ... }` so strict-mode DicomParseError propagates instead of being swallowed."
      - "Activate the `it.todo` strict-mode pair test for DICOM_UN_PARSED_AS_SQ once the catch is fixed."
human_verification:
  - test: "Confirm acceptance: should the SC4 partial-pass for CP-246 be addressed in Phase 2 or accepted as a follow-up?"
    expected: |
      Two paths forward:
      (A) Fix in Phase 2 (recommended — small surgical change to sequence.ts
          + activate one it.todo) — closes SC4 fully.
      (B) Accept as Phase-2 deviation, log against Phase 3's SQ work
          (which already touches sequence semantics for nested-dataset
          navigation per D-42).
    why_human: |
      Roadmap success criterion is partially unmet (12/13 codes escalate).
      Acceptance is a developer/PM decision, not a programmatic one. The
      executor consciously documented the gap as a deferred follow-up;
      verifier surfaces it for explicit acceptance per Escalation-Gate pattern.
---

# Phase 2: Core Parser & Transfer Syntaxes — Verification Report

**Phase Goal (verbatim):**
> A developer calling `parseDicom(buffer)` on any well-formed DICOM Part 10 file using any of the four v1 transfer syntaxes — including vendor-quirky input — receives a structurally correct `Dataset` with stable, byte-offset-positional warnings surfaced for every known deviation, plus correct handling of CP-246 UN-undefined-length-as-SQ.

**Verified:** 2026-05-01
**Status:** `human_needed` (4.5/5 success criteria; SC4 has one documented partial)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP §"Phase 2" Success Criteria)

| # | Truth (SC) | Status | Evidence |
|---|------------|--------|----------|
| 1 | Parses all 4 v1 TS with correct VR/length/byte-offsets; long-form VRs use 4-byte length + 2 reserved zero bytes; BE swaps numeric VRs incl. AT two-2-byte-swap; OB never swapped; Deflated uses `inflateRawSync` | VERIFIED | `parseDicom` dispatches to all four parsers via `TRANSFER_SYNTAX_PARSERS` (transfer-syntax.ts:59-64). All four registered with real implementations: `parseImplicitLE`, `parseExplicitLE`, `parseExplicitBE` (1-line wrapper over `_parseExplicit` with `littleEndian: false`), `parseDeflatedLE`. `LONG_FORM_VRS` set declared with `OB OW OF OD OL SQ UT UN UC UR` (element-header.ts:52). `BE_VR_STRIDE` table sets `OB: 0, UN: 0, AT: 2` (endian.ts:38-58, AT comments at lines 23-25). `inflateRawSync` imported and called at deflated-le.ts:39, 112; integration test at parser-acceptance.test.ts:154-188 grep-asserts source has NO `inflateSync`/`gunzipSync`/`unzipSync`. Acceptance tests for all 4 TS pass (parser-acceptance.test.ts:55-189). |
| 2 | Lenient mode emits stable-coded warnings with byte-offset context for missing preamble / FM group length / undefined-length SQ in explicit / VR mismatch / private tag w/o creator / non-zero reserved / group length in non-FM / odd-length value; `onWarning` callback fires | VERIFIED | All 11 active-emit codes from D-08 confirmed wired via grep on `emit(...)` factory calls: `missingPreamble` (part10-header.ts:74), `groupLengthInDataset` (implicit-le.ts:175, explicit-le.ts:339), `emptyItemInSequence` (sequence.ts:208), `unParsedAsSQ` (sequence.ts:320), `vrMismatch`, `oddLengthValuePadded`, `undefinedLengthInExplicitVR` (explicit-le.ts:167/175/183), `privateTagNoCreator` (element-header.ts:109), `nonzeroReservedBytes` (element-header.ts:314), `fileMetaGroupLengthMissing`/`Mismatch` (file-meta.ts:94/126), `implicitVRForPrivateTagWithoutVR` (element-header.ts:113). 12/13 strict-mode pair tests pass (parser-strict-mode.test.ts); `onWarning` callback ordering proven via emit.ts:42-65 (push then call) and parser-acceptance.test.ts:235-244. `ds.warnings` is always frozen array (parser-acceptance.test.ts:228-233). |
| 3 | Throws `DicomParseError` with stable code + byte offset + snippet for non-DICOM / truncated / unsupported TS / empty input — even in lenient mode | VERIFIED | All 4 fatal codes registered in `FATAL_CODES` (errors.ts:38-43). `EMPTY_INPUT` thrown via dual-check at index.ts:97-112 (PARSE-06). `NOT_DICOM_PART_10` thrown when neither preamble nor leading FM group at offset 0 (part10-header.ts heuristic). `INVALID_FILE_META` thrown for missing `(0002,0010)` TS UID (file-meta.ts:158-165) and truncated input (file-meta.ts:65-75, 84-91). `UNSUPPORTED_TRANSFER_SYNTAX` thrown for non-v1 UID with TS name from `Dictionary.uid` in `snippet` (index.ts:128-137). All four exercised in lenient mode at parser-acceptance.test.ts:252-325. `DicomParseError` shape verified at errors.ts (code, byteOffset, snippet, contextPath). |
| 4 | `{ strict: true }` escalates every Tier-2 deviation to a thrown `DicomParseError` | **PARTIAL** | Single chokepoint correctly implemented (emit.ts:42-66) — when `ctx.strict === true`, throws `DicomParseError` with `WarningCode` cast through `FatalCode` slot per D-35. **12 of 13 actively-emitted codes pass the strict-mode pair-test gate** (parser-strict-mode.test.ts:339-371, all FIXTURES tests pass). **Regression:** `DICOM_UN_PARSED_AS_SQ` (CP-246 detection) is swallowed by bare `try/catch` in `tryParseUnAsSQ` (sequence.ts:326), so strict-mode does not throw on this code; instead the parser silently falls back to `VR=UN`. The lenient half passes (parser-strict-mode.test.ts:374-377). Documented at parser-strict-mode.test.ts:379-383 as `it.todo`. The user's verification brief flagged this as partially breaking SC4. (`DICOM_PIXEL_DATA_LENGTH_MISMATCH` is also listed as deferred but per user instruction is a Phase 3 concern, not a Phase 2 gap.) |
| 5 | `ds.fileMeta` always parsed with Explicit VR LE regardless of dataset TS — exposes transferSyntaxUID / mediaStorageSopClassUID / mediaStorageSopInstanceUID / implementation identifiers; human-readable TS name via UID dictionary | VERIFIED | `parseFileMeta` is hard-wired Explicit VR LE — `new ByteCursor(buffer, true, datasetStart)` with `littleEndian=true` (file-meta.ts:58), no dispatch on TS UID (D-17). `FileMeta` projection populates all FM-02 fields: `transferSyntaxUID`, `mediaStorageSOPClassUID`, `mediaStorageSOPInstanceUID`, `fileMetaInformationVersion`, `implementationClassUID`, `implementationVersionName`, `sourceApplicationEntityTitle` (file-meta.ts:167-175). Test exercises Implicit-LE dataset proving FM is still Explicit-LE (parser-acceptance.test.ts:378-393). `Dictionary.uid()` resolves all four TS names verbatim (parser-acceptance.test.ts:395-400). |

**Score:** 4.5 / 5 truths verified — SC4 PARTIAL.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/parser/index.ts` | `parseDicom` entry, dual EMPTY_INPUT check, dispatch | VERIFIED | 184 lines; dual-check at lines 97-112; D-13/D-14/D-17/D-20 all honored |
| `src/parser/transfer-syntax.ts` | Frozen 4-entry dispatch table | VERIFIED | All four UIDs map to real strategies; `Object.freeze(...)` at line 59 |
| `src/parser/file-meta.ts` | Explicit VR LE parser independent of TS | VERIFIED | 271 lines; truncated-input throws INVALID_FILE_META (T-02-02-01); D-17/D-18/D-19 honored |
| `src/parser/part10-header.ts` | Preamble + DICM detection w/ tri-state | VERIFIED | `missingPreamble` emit at line 74; D-14/D-15 |
| `src/parser/implicit-le.ts` | TS-01 with 5-case VR fallback | VERIFIED | `groupLengthInDataset` at line 175; resolveImplicitVR honored |
| `src/parser/explicit-le.ts` | TS-02 + shared `_parseExplicit` factored for BE reuse | VERIFIED | `vrMismatch`, `oddLengthValuePadded`, `undefinedLengthInExplicitVR`, `groupLengthInDataset` all emitted |
| `src/parser/explicit-be.ts` | TS-03 wrapper over `_parseExplicit` w/ `littleEndian: false` | VERIFIED | 56 lines; D-23/D-24/D-25/D-30 honored |
| `src/parser/deflated-le.ts` | TS-04 with `inflateRawSync` (NOT `inflateSync`) + 256MiB cap | VERIFIED | `inflateRawSync` at line 39, 112; cap at line 57; bomb-cap mitigation; D-26/D-27 honored |
| `src/parser/sequence.ts` | SQ + FFFE + CP-246 + nesting-depth cap | PARTIAL (see SC4) | 337 lines; encoding-context stack (D-28); 64-depth cap (T-02-04-02). **Bare try/catch at line 326 in `tryParseUnAsSQ` swallows strict-mode DicomParseError** — see gap below. |
| `src/parser/element-header.ts` | Shared header decode + LONG_FORM_VRS + private-creator stack | VERIFIED | LONG_FORM_VRS at line 52; resolveImplicitVR (5-case D-21); resolvePrivateCreator (D-33); registerPrivateCreator with block-reservation (D-33) |
| `src/parser/warnings.ts` | WARNING_CODES registry (25+ codes) + factory-per-code | VERIFIED | All 13 active-emit codes + reserved/deferred codes registered |
| `src/parser/errors.ts` | FATAL_CODES + DicomParseError | VERIFIED | Exactly 4 fatal codes (D-09); DicomParseError with code/byteOffset/snippet/contextPath |
| `src/parser/emit.ts` | Single chokepoint with strict-mode escalation | VERIFIED | makeEmitter at lines 42-66; D-03 push-then-callback; D-11 single chokepoint; D-35 strict throws |
| `test/integration/parser-strict-mode.test.ts` | D-36 pair-test gate | VERIFIED (with documented todos) | 26 tests pass + 2 it.todo (1 for CP-246 SC4 partial, 1 for D-32 deferred) |
| `test/integration/parser-security.test.ts` | STRIDE threat-model sweep | VERIFIED | 13 tests pass (T-02-01-06, T-02-02-01, T-02-04-01, T-02-04-02, T-02-04-03, T-02-05-01, T-02-05-02, T-02-05-04) |
| `test/integration/parser-acceptance.test.ts` | ROADMAP SC1-SC5 end-to-end | VERIFIED | 22 tests pass exercising all five success criteria |
| `test/helpers/build-dicom.ts` | Programmatic fixture builder (D-37) | VERIFIED | Builder consumed by all integration tests; emits valid Part-10 across all 4 TS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|------|-----|--------|---------|
| `parseDicom` | TS dispatch | `TRANSFER_SYNTAX_PARSERS[tsUid]` | WIRED | index.ts:128-137; throws `UNSUPPORTED_TRANSFER_SYNTAX` for unknown UID |
| `parseDicom` | File Meta | `parseFileMeta(buffer, datasetStart, ctx, emit)` | WIRED | index.ts:124; FM hard-wired Explicit-LE |
| `parseDicom` | Strict mode | `makeEmitter(ctx)` | WIRED | index.ts:118; chokepoint at emit.ts:42-66 |
| `parseDeflatedLE` | `parseExplicitLE` | inner-buffer delegation | WIRED | deflated-le.ts:157; warnings tagged `deflated: true` per D-27 |
| `parseExplicitBE` | `_parseExplicit` | `{ littleEndian: false }` | WIRED | explicit-be.ts:47-54 |
| `parseSequence` | Per-TS inner parser | `opts.innerStrategy` | WIRED | sequence.ts:243, 261; circular-import broken via injection |
| `tryParseUnAsSQ` (CP-246) | Implicit-LE inner | `implicitLeInner` | WIRED (lenient) / **NOT WIRED (strict)** | sequence.ts:319-320; **bare `} catch {` at line 326 swallows strict throw** |
| `parser/sequence.ts` | Public surface | not exported | INTENTIONAL | Internal-only per D-04; `Sequence`/`Item` exported as classes |
| `WARNING_CODES`, `FATAL_CODES`, `DicomParseError`, `parseDicom`, `Dataset`, `Element`, `Sequence`, `Item`, `FileMeta` | Public surface | `src/index.ts` | WIRED | All D-04 surface delta exports present (index.ts:22-46) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces Real Data | Status |
|----------|------|--------|---------------------|--------|
| `parseDicom` | `Dataset.fileMeta`, `Dataset.warnings`, `Dataset._elements` | `parseFileMeta` + per-TS strategy | YES — programmatic fixtures produce non-empty maps; FM-02 fields populated; warnings emitted with byte offsets | FLOWING |
| `parseDeflatedLE` | inflated buffer | `inflateRawSync(compressed, { maxOutputLength })` | YES — round-trip test parses element through inflate | FLOWING |
| Strict-mode escalation | `DicomParseError` | `makeEmitter` chokepoint | YES for 12/13 codes, NO for `DICOM_UN_PARSED_AS_SQ` (swallowed) | PARTIAL |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `pnpm test 2>&1 \| tail -30` | 21 files, 273 passed + 2 todo (275 total), 0 failures, 3.47s | PASS |
| All integration tests pass | (within above) | parser-strict-mode (26 tests, 2 skipped via `it.todo`), parser-security (13 tests), parser-acceptance (22 tests) | PASS |
| `inflateRawSync` is the only inflate API used | grep within parser-acceptance.test.ts:154-188 | Asserted in test — regex grep confirms no `inflateSync`/`gunzipSync`/`unzipSync` outside JSDoc | PASS |
| 13 active-emit codes have lenient pair tests | parser-strict-mode.test.ts FIXTURES array | 12 real fixtures + 1 documented `it.todo` for D-32 | PASS (with deferred follow-up) |

### Requirements Coverage

| REQ-ID | Description | Status | Evidence |
|--------|-------------|--------|----------|
| PARSE-01 | `parseDicom(buffer)` returns typed `Dataset` | SATISFIED | index.ts:93-143; `Dataset` exported |
| PARSE-02 | 128-byte preamble + DICM; missing preamble Tier-2 warning | SATISFIED | part10-header.ts:74 emits `missingPreamble` |
| PARSE-03 | Byte-offset positional context preserved | SATISFIED | `DicomPosition.byteOffset` on every warning; `DicomParseError.byteOffset`; tests assert offsets |
| PARSE-04 | Accepts Buffer/Uint8Array/ArrayBuffer | SATISFIED | index.ts:154-160 normalizeInput; tested at parser-acceptance.test.ts:62-64 |
| PARSE-05 | Non-DICOM → fatal `NOT_DICOM_PART_10` w/ position+snippet | SATISFIED | part10-header.ts heuristic; parser-acceptance.test.ts:267-279 |
| PARSE-06 | Empty input → `EMPTY_INPUT` | SATISFIED | Dual-check at index.ts:97-112 |
| FM-01 | FM always Explicit VR LE regardless of dataset TS | SATISFIED | file-meta.ts:58 `littleEndian=true` hard-wired; parser-acceptance.test.ts:378-393 |
| FM-02 | Exposes transferSyntaxUID/sopClass/sopInstance/implementation identifiers | SATISFIED | file-meta.ts:167-175; tested at parser-acceptance.test.ts:359-376 |
| FM-03 | `(0002,0000)` group length missing/mismatch warnings | SATISFIED | file-meta.ts:94, 126 |
| FM-04 | Unsupported TS → fatal w/ Dictionary.uid name in snippet | SATISFIED | index.ts:130-137; parser-acceptance.test.ts:297-316 |
| TS-01 | Implicit VR LE w/ dictionary VR fallback | SATISFIED | implicit-le.ts + resolveImplicitVR (element-header.ts) |
| TS-02 | Explicit VR LE w/ long-form VRs + reserved-zero assert | SATISFIED | explicit-le.ts + LONG_FORM_VRS + nonzeroReservedBytes emit |
| TS-03 | Explicit VR BE w/ AT 2-byte-swap + OB never-swap | SATISFIED | explicit-be.ts + BE_VR_STRIDE table; AT=2, OB=0; tested |
| TS-04 | Deflated Explicit VR LE via `inflateRawSync` | SATISFIED | deflated-le.ts:39, 112; source-grep gate in test |
| TOL-01 | Lenient default; `{ strict: true }` escalates to throw | **PARTIAL** | Chokepoint correctly wired (emit.ts:42-66); 12/13 active codes escalate; CP-246 regression — see SC4 gap |
| TOL-02 | Tier-3 fatals throw even in lenient mode | SATISFIED | parser-acceptance.test.ts:252-324 |
| TOL-03 | Tier-2 stable-coded warnings w/ byte-offset context | SATISFIED | All 11 active-emit codes wired (see SC2 evidence) |
| TOL-04 | `ds.warnings` is always an array (possibly empty) | SATISFIED | parser-acceptance.test.ts:228-233 — also frozen |
| TOL-05 | `onWarning` callback invoked for each emitted warning | SATISFIED | emit.ts:57-64; parser-acceptance.test.ts:235-244 |
| TOL-06 | `stripPreamble: 'tolerate'` default emits warning; `'require'` throws | SATISFIED | part10-header.ts D-14 tri-state |
| TOL-07 | Odd-length values tolerated, emit `DICOM_ODD_LENGTH_VALUE_PADDED` | SATISFIED | explicit-le.ts:175 |
| TOL-08 | VR mismatch tolerated, emit `DICOM_VR_MISMATCH` | SATISFIED | explicit-le.ts:167 |
| TOL-09 | Private tag w/o creator emits `DICOM_PRIVATE_TAG_NO_CREATOR` | SATISFIED | element-header.ts:109 |
| TOL-10 | Group length in non-FM dataset emits `DICOM_GROUP_LENGTH_IN_DATASET` | SATISFIED | implicit-le.ts:175, explicit-le.ts:339 |

**Total:** 23 of 24 requirements SATISFIED; TOL-01 partial due to CP-246 regression (single code does not escalate under strict mode).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/parser/sequence.ts` | 326 | Bare `} catch {` swallows ALL exceptions including `DicomParseError` from strict-mode chokepoint | WARNING | Causes SC4 partial — see CP-246 strict-mode regression. Tracked as `it.todo` in test. |
| `test/integration/parser-strict-mode.test.ts` | 379, 393 | Two `it.todo` placeholders | INFO | Per executor's deviations log; (1) `DICOM_UN_PARSED_AS_SQ` strict-mode gap = SC4 partial; (2) `DICOM_PIXEL_DATA_LENGTH_MISMATCH` D-32 post-pass deferred to Phase 3 (per user brief, NOT a Phase 2 gap) |

No other anti-patterns found. No `console.*` in library code. No unjustified `as` casts beyond the documented D-35 `WarningCode → FatalCode` cast at emit.ts:49. No `TODO`/`FIXME`/placeholder text in source files; only documented architectural notes.

### Honored Decisions Spot-Check

All locked D-decisions confirmed:

- **D-08** Active warning list — All 11 actively-emitted codes wired (verified by grep on factory call sites).
- **D-11** Single emit chokepoint — Confirmed; zero per-call-site `if (strict) throw` checks elsewhere.
- **D-13** EMPTY-INPUT dual check — index.ts:97-112.
- **D-17** File Meta hard-wired Explicit VR LE — file-meta.ts:58, no dispatch branching.
- **D-18** Group length present/absent + mismatch handling — file-meta.ts:81-153.
- **D-19** Only `(0002,0010)` blocks dispatch — file-meta.ts:158-165.
- **D-20** Frozen 4-entry dispatch table — transfer-syntax.ts:59-64.
- **D-21** 5-case Implicit VR fallback — element-header.ts:91-131.
- **D-26** `inflateRawSync` only — deflated-le.ts:39, 112; source-grep gate in test.
- **D-27** Deflated position semantics (`deflated: true` tag) — deflated-le.ts:149-155.
- **D-28** Encoding-context stack — sequence.ts:160-162.
- **D-31** Encapsulated PD structural recognition — sequence.ts:220-238.
- **D-33** Private-creator stack with block-reservation — element-header.ts:153-194.
- **D-36** Strict-mode escalation — emit.ts:42-66; pair-test gate in parser-strict-mode.test.ts:339-371.
- **D-37** `buildDicom` helper — test/helpers/build-dicom.ts (consumed across all integration tests).

### Human Verification Required

#### 1. SC4 Partial Acceptance — CP-246 strict-mode regression

**Test:** Decide whether to fix or accept the bare `try/catch` in `tryParseUnAsSQ` (sequence.ts:326) before closing Phase 2.

**Expected:**
Two paths forward:

**(A) Fix in Phase 2 (recommended).** Replace
```typescript
} catch {
  // Restore state…
}
```
with a `DicomParseError` re-throw guard:
```typescript
} catch (err) {
  if (err instanceof DicomParseError) throw err;
  // Restore state on legitimate descent failure
  ctx.nestingDepth = savedDepth;
  while (ctx.encodingContextStack.length > savedStackLen) ctx.encodingContextStack.pop();
  while (ctx.warnings.length > savedWarningsLen) ctx.warnings.pop();
  return { success: false, items: [], endOffset: valueStart };
}
```
Then activate the deferred `it.todo` strict-mode pair test (parser-strict-mode.test.ts:379-383). This closes SC4 fully and brings TOL-01 to fully satisfied.

**(B) Accept as deviation.** Mark the `it.todo` as a documented Phase-2 gap and roll the fix into Phase 3 (which extends sequence semantics for nested-dataset navigation per D-42). Update the verification override below.

**Why human:** Roadmap success criterion is partially unmet. The executor explicitly documented this as a follow-up rather than fixing it in-phase. Acceptance is a developer/PM decision per the Escalation-Gate pattern.

If accepting (B), add this to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "ROADMAP SC4 — `{ strict: true }` escalates EVERY Tier-2 deviation to a thrown DicomParseError"
    reason: "12/13 active-emit codes escalate correctly; CP-246 regression in tryParseUnAsSQ deferred to Phase 3 sequence-navigation work where the surrounding code is already in flux. Lenient-mode emission is correct."
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
```

### Gaps Summary

Phase 2 is functionally complete and the parser meets the goal for **all four v1 transfer syntaxes end-to-end** with **stable byte-offset-positional warnings** and **CP-246 lenient-mode descent**. 273 tests pass; 2 are documented `it.todo` placeholders.

The single ROADMAP success criterion that does not fully verify is **SC4 (strict-mode escalation)** — for the lone code `DICOM_UN_PARSED_AS_SQ`, the strict-mode `DicomParseError` raised by the emit chokepoint is silently swallowed by the bare `try/catch` in `tryParseUnAsSQ` (sequence.ts:326). 12 of 13 active-emit codes escalate correctly under `{ strict: true }`; this is the regression. The executor documented this as a follow-up and the test suite carries an `it.todo` placeholder.

The user's verification brief explicitly flagged this regression as breaking SC4 partially, hence the `human_needed` status. The fix is small (~5-line patch) and self-contained; the alternative is to accept it as a deferral into Phase 3's sequence-navigation work.

The second `it.todo` (`DICOM_PIXEL_DATA_LENGTH_MISMATCH`) is the D-32 post-pass deferred to Phase 3 lazy decoders per the user brief — **not** counted as a Phase 2 gap.

---

*Verified: 2026-05-01T16:55:00Z*
*Verifier: Claude (gsd-verifier)*

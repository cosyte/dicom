---
phase: 02-core-parser
plan: 02-03
subsystem: parser
tags: [parser, implicit-vr-le, vr-resolution, private-creator, transfer-syntax]
requires:
  - 02-01 (WARNING_CODES + emit chokepoint + ByteCursor + ParseContext)
  - 02-02 (parseDicom entry, transfer-syntax dispatch table, buildDicom helper)
  - Phase 1 Dictionary (TAGS map, repeatingGroup family entries)
provides:
  - src/parser/element-header.ts — resolveImplicitVR, resolvePrivateCreator, registerPrivateCreator, matchRepeatingGroup
  - src/parser/implicit-le.ts — parseImplicitLE strategy (TS-01)
  - Real Implicit VR LE parsing wired into TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2"]
affects:
  - Plan 02-04 — extends element-header.ts with readExplicitElementHeader (append-only); ships parser/sequence.ts which replaces the local parseSequence stub in implicit-le.ts
  - Plan 02-06 — strict-mode pair-test sweep can target DICOM_PRIVATE_TAG_NO_CREATOR, DICOM_GROUP_LENGTH_IN_DATASET, DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR
tech-stack:
  added: []
  patterns:
    - dictionary-driven VR fallback via static import of TAGS (clean ESM+CJS under tsup)
    - memoized repeating-group family enumeration (single pass, frozen result)
    - private-creator block-reservation per PS3.5 §7.8 (closes off-by-0x1000 trap)
    - all RangeError caught at the cursor boundary and re-thrown as DicomParseError(INVALID_FILE_META) with header offset + 16-byte hex snippet
    - bounds-check declared length BEFORE slice (T-02-03-02)
    - parseSequence import seam (local stub replaced when plan 02-04 ships sequence.ts)
key-files:
  created:
    - src/parser/element-header.test.ts
    - src/parser/implicit-le.ts
    - src/parser/implicit-le.test.ts
  modified:
    - src/parser/element-header.ts (extended with VR-resolution + private-creator + repeating-group helpers)
    - src/parser/transfer-syntax.ts (imports parseImplicitLE from ./implicit-le.js; local stub removed; dispatch table unchanged)
decisions:
  - "Honored CONTEXT D-21 — 5-case fallback (single VR / multi-VR first array entry / repeating-group family / private→UN with creator-stack lookup / unknown standard→UN silently)"
  - "Honored D-33 + PITFALLS §7.1 — block-reservation closes the off-by-0x1000 trap"
  - "Honored D-34 — Element.privateCreator populated via resolvePrivateCreator after registerPrivateCreator runs on (gggg,0010..00FF) slots"
  - "Honored TOL-09 — DICOM_PRIVATE_TAG_NO_CREATOR + DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR emit pair (the latter ALWAYS for private non-creator-slot tags so Phase 6 can wire profile VR overrides)"
  - "Honored TOL-10 — (gggg,0000) group-length elements in non-FM groups emit DICOM_GROUP_LENGTH_IN_DATASET; element preserved, value not used"
  - "Honored D-11 — no per-call-site strict checks introduced; all warnings flow through the emit chokepoint shipped in 02-01"
  - "Honored D-22 — LONG_FORM_VRS preserved unchanged (plan 02-04 consumes it for Explicit VR header decoding)"
  - "Used static import of TAGS from generated/tags.js per plan action step 1 — clean under both ESM and CJS build targets, no eslint-disable required"
  - "Implicit VR LE FFFE markers at root throw INVALID_FILE_META — they are SQ-internal markers, owned by plan 02-04"
  - "Implicit VR LE undefined-length on non-SQ resolved VR throws INVALID_FILE_META (no on-wire VR means UN cannot legitimately carry undefined length under this TS)"
  - "parseSequence import seam: local stub returns empty SQ; plan 02-04 replaces with `import { parseSequence } from './sequence.js'`"
metrics:
  tasks_completed: 2
  duration_minutes: ~12
  completed_date: 2026-05-01
  tests_added: 30 (18 element-header + 12 implicit-le)
  total_tests: 171 (was 141 at end of 02-02)
---

# Phase 2 Plan 02-03: Implicit VR Little Endian Parser Summary

`parseDicom(buildDicom({ transferSyntax: "1.2.840.10008.1.2", elements: [...] }))` now returns a `Dataset` with structurally-correct `Element` instances — VR resolved via the D-21 5-case fallback, `Element.privateCreator` populated for private elements with registered creators (block-reservation per PS3.5 §7.8), and TOL-09 / TOL-10 warnings emitted through the single emit chokepoint shipped in 02-01.

## What was built

### `src/parser/element-header.ts` — extended (existing `LONG_FORM_VRS` preserved)

- **`resolveImplicitVR(tag, ctx, emit, position) → VR`** — D-21 5-case decision tree:
  1. Standard tag with single VR in dict → `entry.vr[0]`.
  2. Standard tag with multi-VR entry → `entry.vr[0]` (first array entry; multi-VR ambiguity is a known DICOM data-dictionary quirk).
  3. Standard tag matching a repeating-group family (`(50xx,xxxx)` Curves, `(60xx,xxxx)` Overlays, `(7Fxx,xxxx)` Pixel Data Float/Double, `(1000,xxxX)` Code Tables, `(1010,xxxx)` Zonal Map) → family entry's first VR.
  4. Private (odd-group) tag:
     - `(gggg,0010..00FF)` Private Creator slot → `LO` (PS3.5 §7.8) with NO warnings.
     - Otherwise → `UN`. Emit `DICOM_PRIVATE_TAG_NO_CREATOR` (TOL-09) when no creator is registered for the element's block; ALWAYS emit `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` so Phase 6 profile-supplied VR overrides can be wired cleanly.
  5. Unknown standard tag (not in dict, not repeating-group family) → `UN` silently (allowed by spec).

- **`resolvePrivateCreator(tag, ctx) → string | undefined`** — block-reservation per PS3.5 §7.8 + PITFALLS §7.1. For private element `(gggg,EEFF)` with `0x10 ≤ EE ≤ 0xFF` (the high byte of the 16-bit element id), returns `ctx.creators.get(group)?.get(EE)`. Returns `undefined` for non-private (even-group) tags, for the creator slots themselves (`(gggg,0010..00FF)`, element ids below `0x1000`), or when no creator is registered.

- **`registerPrivateCreator(tag, value, ctx)`** — populates `ctx.creators` from `(gggg,00XX)` LO values; trims trailing `0x20` and `0x00` padding per PS3.5 LO conventions; ignores empty creator strings.

- **`matchRepeatingGroup(tag) → DictionaryEntry | undefined`** — pattern-matches a concrete tag against family entries (filtered by `entry.repeatingGroup === true`). Family `tag` field carries lowercase `x` placeholders; `matchesFamilyPattern` skips `x`/`X` positions and uppercase-compares the rest. Family list is enumerated once over `TAGS` and memoized in a frozen array (the dictionary is frozen at module load).

### `src/parser/implicit-le.ts` — new

`parseImplicitLE(buffer, datasetStart, ctx, emit) → { elements: ReadonlyMap<Tag, Element> }` reads sequential elements with the layout `group(2 LE) + element(2 LE) + length(4 LE) + value(length bytes)` until the cursor reaches end-of-buffer.

For each element:

1. Read `group + element + length`. `RangeError` from the cursor → throw `DicomParseError(INVALID_FILE_META, "Truncated dataset...")` with the header offset + 16-byte hex snippet (T-02-03-01).
2. Reject root-level FFFE markers (those are SQ-internal; plan 02-04 owns them) with `DicomParseError(INVALID_FILE_META)`.
3. Resolve VR via `resolveImplicitVR` (D-21).
4. `length === 0xFFFFFFFF` + resolved VR === SQ → delegate to `parseSequence`. Non-SQ resolved VR → throw `INVALID_FILE_META` (Implicit VR LE has no on-wire VR; UN cannot legitimately carry undefined length).
5. Bounds-check `cursor.position + length <= buffer.length` BEFORE the slice (T-02-03-02). Overflow → `DicomParseError(INVALID_FILE_META)`.
6. Slice value as `Buffer.subarray()` (zero-copy view) by default; `Buffer.from(slice)` (independent storage) when `ctx.copyValues === true`.
7. `(gggg,0000)` in non-FM groups → emit `DICOM_GROUP_LENGTH_IN_DATASET` (TOL-10); preserve the Element with the value, but the value is NOT used to control parsing.
8. `(gggg,0010..00FF)` in odd group → call `registerPrivateCreator(tag, value, ctx)`.
9. Build `Element({ tag, vr, vm: 1, length, rawBytes, byteOffset: headerStart, privateCreator: resolvePrivateCreator(tag, ctx) })`. `vm: 1` is a Phase 2 placeholder — Phase 3 owns VM derivation from VR + value layout (D-42).

### `src/parser/transfer-syntax.ts` — modified

- Imports `parseImplicitLE` from `./implicit-le.js`.
- Local plan-02-02 stub `export function parseImplicitLE(...) { return { elements: new Map() }; }` removed.
- Frozen 4-entry dispatch table unchanged: `"1.2.840.10008.1.2"` now points at the real parser. The other three TS strategy stubs (`parseExplicitLE`, `parseExplicitBE`, `parseDeflatedLE`) are untouched — owned by plans 02-04 / 02-05.

## D-21 5-case decision tree — test matrix

| Case | Input | Expected VR | Warnings | Test |
|------|-------|-------------|----------|------|
| 1 | `(0010,0010)` PatientName (single VR `[PN]`) | `PN` | none | element-header.test.ts |
| 2 | `(0028,0106)` SmallestImagePixelValue (multi VR `[US, SS]`) | `US` (first) | none | element-header.test.ts |
| 3 | `(50A0,3000)` matches `(50xx,3000)` Curve Data family (`[OB, OW]`) | `OB` (first) | none | element-header.test.ts |
| 3 | `(6000,0010)` matches `(60xx,0010)` Overlay Rows family | `US` | none | element-header.test.ts |
| 4a | `(0019,1000)` private, NO creator | `UN` | `DICOM_PRIVATE_TAG_NO_CREATOR` + `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` | element-header.test.ts + implicit-le.test.ts |
| 4b | `(0019,0010)` private creator slot | `LO` | none | element-header.test.ts |
| 4c | `(0019,1000)` private WITH creator `ACME` registered | `UN` | `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` only (no NO_CREATOR) | element-header.test.ts + implicit-le.test.ts |
| 5 | `(0008,FFFE)` even-group, not in dict, not family | `UN` | none | element-header.test.ts |

## Private-creator block-reservation — test matrix

Creator at `(0019,0010) = 'ACME'` (block id `0x10`):

| Tag | Block id | Resolves to | Justification |
|-----|----------|-------------|---------------|
| `(0019,1000)` | `0x10` | `'ACME'` | Block-reserved start |
| `(0019,1050)` | `0x10` | `'ACME'` | Mid-block |
| `(0019,10FF)` | `0x10` | `'ACME'` | Block-reserved end |
| `(0019,1100)` | `0x11` | `undefined` | Off-by-0x100 — different block, no creator at `(0019,0011)` |
| `(0019,2000)` | `0x20` | `undefined` | Off-by-0x1000 trap — closed by tests |

The off-by-0x1000 trap (PITFALLS §7.1) is the canonical bug for Private Creator implementations: a naive `creators[gggg].get(element)` lookup misses the high-byte→low-byte block-reservation mechanic. The test suite (both unit-level in element-header.test.ts and end-to-end in implicit-le.test.ts) explicitly verifies that creator at `(0019,0010)` does NOT cover `(0019,2000)`.

## Plan 02-04 coordination — `parseSequence` import seam

`parseImplicitLE` declares an internal `parseSequence` function with the contract:

```ts
function parseSequence(
  buffer: Buffer,
  startOffset: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): { items: readonly unknown[]; endOffset: number };
```

The plan-02-03 implementation is a stub that returns `{ items: [], endOffset: startOffset }` — sufficient to keep `pnpm test` and `pnpm build` green while `parser/sequence.ts` is owned by plan 02-04. When 02-04 lands, the local stub is removed and replaced with `import { parseSequence } from "./sequence.js"`. The external surface of `parseImplicitLE` does not change. The deeper SQ-under-Implicit-LE matrix (item delimitation, encoding-context-stack push/pop, nested SQ depth) lives in plan 02-04's test file.

## REQ coverage

| REQ-ID | Coverage |
|--------|----------|
| TS-01  | `1.2.840.10008.1.2` registered in `TRANSFER_SYNTAX_PARSERS`; happy-path test parses (0010,0010) via `parseDicom + buildDicom`; element layout `group(2)+element(2)+length(4)+value` verified by reading buf at `Element.byteOffset`. |
| TOL-09 | `DICOM_PRIVATE_TAG_NO_CREATOR` emitted for `(0019,1000)` with no creator; suppressed when creator at `(0019,0010)` is registered. Off-by-0x1000 still emits TOL-09. |
| TOL-10 | `DICOM_GROUP_LENGTH_IN_DATASET` emitted for `(0008,0000)` group-length element in non-FM dataset; element preserved in `_elements`. |

## Threat model coverage

All five Phase 2-03 threats from the plan threat model:

- **T-02-03-01** (Buffer over-read on truncated input): `parseImplicitLE` element loop wraps the cursor reads in try/catch; `RangeError` is converted to `DicomParseError(INVALID_FILE_META, "Truncated dataset...")` with the offending header offset + 16-byte snippet. Test: `T-02-03-01: truncated dataset throws DicomParseError(INVALID_FILE_META) not RangeError`.
- **T-02-03-02** (Resource exhaustion via malformed length): bounds-check `cursor.position + length > buffer.length` before slicing; throws `INVALID_FILE_META`. Test: `T-02-03-02: declared element length exceeds remaining buffer → INVALID_FILE_META`.
- **T-02-03-03** (Tampering of private-creator map): `ctx.creators` is internal to `ParseContext`; never exposed publicly. `Element.privateCreator` is a plain string set on construction (frozen by `_elements: ReadonlyMap` boundary on the Dataset shell). No mutation pathway for downstream code.
- **T-02-03-04** (Spoofing creator with off-by-0x1000 element address): `resolvePrivateCreator` extracts the block id via `(element >> 8) & 0xFF` and looks up `creators[group].get(blockId)`. Tests cover `(0019,1000) → 'ACME'`, `(0019,10FF) → 'ACME'`, `(0019,1100) → undefined`, `(0019,2000) → undefined`.
- **T-02-03-05** (Stack overflow via deep nesting — declared in 02-01, enforced in 02-04): `parseImplicitLE` itself does NOT recurse; SQ descent is delegated. Plan 02-04 owns the `nestingDepth` cap when it ships `parseSequence`.

## Strict-mode coverage

This plan adds three actively-emittable warning codes to the strict-mode escalation surface:

- `DICOM_PRIVATE_TAG_NO_CREATOR` (TOL-09)
- `DICOM_GROUP_LENGTH_IN_DATASET` (TOL-10)
- `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`

The full strict-mode pair-test gate sweep across all actively-emitted Tier-2 codes lives in plan 02-06 per CONTEXT D-36 / D-39. Plan 02-03 does NOT add per-call-site strict checks (D-11 chokepoint preserved); the existing `emit.ts` chokepoint handles escalation transparently.

## Acceptance gates (all pass)

- `pnpm typecheck` ✓ exits 0
- `pnpm lint` ✓ exits 0 (max-warnings=0)
- `pnpm test` ✓ 171/171 pass (14 test files; 30 new tests in 02-03)
- `pnpm build` ✓ ESM 1000.38 KB, CJS 1000.64 KB, DTS 30.76 KB
- `node test/smoke/esm/index.mjs` ✓ green
- `node test/smoke/cjs/index.cjs` ✓ green
- Pre-commit hook (PHI scan + simple-git-hooks) ✓ green on every task commit

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Test helper used a fake subclass method that doesn't exist on instances returned by `parseDicom`.**

- **Found during:** Task 2 GREEN run.
- **Issue:** Initial `implicit-le.test.ts` defined a `TestDataset extends Dataset` with an `elementsMap()` method, then cast `Dataset` instances returned by `parseDicom` through `as unknown as TestDataset`. At runtime the cast does nothing — the `parseDicom`-built object is a plain `Dataset` with no `elementsMap` method, so every test that read elements threw `TypeError: ds.elementsMap is not a function`.
- **Fix:** Replaced the subclass shape with a structural interface `DatasetWithElements { readonly _elements: ReadonlyMap<Tag, Element> }` and cast through it. The protected `_elements` field is a real own-property on every `Dataset` (set by the constructor), so the structural read works at runtime. Test isolation preserved — Phase 3 will replace this idiom with the public navigation surface (D-42).
- **Files modified:** `src/parser/implicit-le.test.ts`
- **Commit:** included in `feat(02-03): implement parseImplicitLE` (cf24976).

**2. [Rule 1 — Bug] Initial happy-path test asserted `length === 10` for a 9-byte odd-length value.**

- **Found during:** Task 2 GREEN run.
- **Issue:** Test built `(0010,0010)` with `Buffer.from("DOE^JANE ", "ascii")` (9 bytes including the trailing space) and asserted `el.length === 10`. The `buildDicom` helper does NOT auto-pad to even length, so the on-wire `length` is exactly 9. Mismatch was a typo in the test, not a parser bug.
- **Fix:** Trimmed the trailing space to use `"DOE^JANE"` (8 bytes, even-length, valid PN value), and asserted `el.length === 8`. The PN pad-to-even rule is a serializer concern (Phase 5); Phase 2 reads what the producer wrote.
- **Files modified:** `src/parser/implicit-le.test.ts`
- **Commit:** included in `feat(02-03): implement parseImplicitLE` (cf24976).

**3. [Rule 1 — Bug] `copyValues=true` test asserted `el.rawBytes.buffer !== source.buffer`, but Node pools small Buffer.from allocations.**

- **Found during:** Task 2 GREEN run.
- **Issue:** Node's `Buffer.from(slice)` for small buffers returns a Buffer backed by a shared 8KB pool (`Buffer.poolSize` default). Two separate `Buffer.from()` calls can both point into the same pool ArrayBuffer. The `.buffer !== ...` identity test was therefore non-deterministic (typically passing because the pool ArrayBuffer differs from the source's, but could fail under different allocation patterns).
- **Fix:** Replaced the identity test with a behavioural test — mutate the source buffer after parse and assert that `el.rawBytes` (with `copyValues: true`) is unchanged, vs the default zero-copy view (where mutation IS observed). This is the user-visible contract of the option per D-16 (MODEL-03).
- **Files modified:** `src/parser/implicit-le.test.ts`
- **Commit:** included in `feat(02-03): implement parseImplicitLE` (cf24976).

### Auth gates
None.

### Architectural changes
None.

## Phase boundary preserved

- `Element` and `Dataset` still have the 02-01 structural surface only — no `.value` getter, no navigation methods (Phase 3, D-42). The test suite reaches `_elements` through a structural cast; Phase 3 promotes it to public API.
- `vm: 1` is a Phase 2 placeholder on every parsed Element. Phase 3 derives VM from VR + value layout (D-42).
- The other three TS strategy stubs in `transfer-syntax.ts` (`parseExplicitLE`, `parseExplicitBE`, `parseDeflatedLE`) are unchanged. Plan 02-04 replaces the first two; plan 02-05 replaces the third.
- D-11 chokepoint preserved: no per-call-site strict checks introduced. All strict-mode escalation continues to flow through `parser/emit.ts`.
- `LONG_FORM_VRS` constant unchanged (plan 02-04 consumes it for Explicit VR header decoding).

## Self-Check: PASSED

Created files exist:
- `src/parser/element-header.test.ts` ✓
- `src/parser/implicit-le.ts` ✓
- `src/parser/implicit-le.test.ts` ✓

Modified files updated:
- `src/parser/element-header.ts` ✓ (resolveImplicitVR + 3 helpers added below LONG_FORM_VRS)
- `src/parser/transfer-syntax.ts` ✓ (imports parseImplicitLE, removes local stub)

Commits exist in `git log --all`:
- `aabcbdd` test(02-03): add failing tests for resolveImplicitVR + private-creator helpers ✓
- `d8c74f6` feat(02-03): implement resolveImplicitVR + private-creator stack helpers ✓
- `771d455` test(02-03): add failing tests for parseImplicitLE end-to-end ✓
- `cf24976` feat(02-03): implement parseImplicitLE and wire into transfer-syntax dispatch ✓

## Next plan

**02-04** (Wave 3, parallel-safe with this plan): Explicit VR LE / BE parser + sequence parser + element-header extensions.
- Replaces the `parseExplicitLE` and `parseExplicitBE` stubs in `src/parser/transfer-syntax.ts`.
- Ships `src/parser/sequence.ts` — once landed, the local `parseSequence` stub in `implicit-le.ts` is replaced by `import { parseSequence } from "./sequence.js"`.
- Extends `src/parser/element-header.ts` with `readExplicitElementHeader` (long-form VR list, reserved-bytes assert) — appends below the helpers shipped by this plan; no conflict.
- Implements CP-246 detection (D-30) under Explicit VR.

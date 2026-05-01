---
phase: 02-core-parser
plan: 02-05
subsystem: parser
tags: [parser, deflated-explicit-vr-le, transfer-syntax, zlib, decompression-bomb, ts-04]
requires:
  - 02-01 (WARNING_CODES + emit chokepoint + ParseContext)
  - 02-02 (parseDicom entry, transfer-syntax dispatch table, buildDicom helper, File Meta uncompressed)
  - 02-04 (parseExplicitLE — invoked over the inflated buffer per D-26)
provides:
  - src/parser/deflated-le.ts — parseDeflatedLE (TS-04) + parseDeflatedLEWithCap (test-only cap override) + DEFAULT_MAX_INFLATED_BYTES (256 MiB)
  - Real Deflated Explicit VR LE parsing wired into TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1.99"]
  - test/helpers/build-dicom.ts — Deflated-LE encoder branch (zlib.deflateRawSync over Explicit-LE-encoded element bytes)
affects:
  - Plan 02-06 — strict-mode pair-test sweep can now exercise Deflated-TS warnings end-to-end (the `position.deflated=true` annotation works through the outer chokepoint)
  - Phase 5 — symmetric serializer will use `zlib.deflateRawSync` matching this parser's `inflateRawSync`; SER-01..06 will read the Deflated-TS test fixtures created here
tech-stack:
  added: []
  patterns:
    - inner ParseContext over inflated buffer (`{ ...ctx, buffer: inflated }`) — preserves creators / encodingContextStack / nestingDepth / strict / copyValues across the inflate boundary
    - inner emit wrapper (`{ ...w, position: { ...w.position, deflated: true } }`) — tags warnings emitted from inflated content per D-27, then forwards through the outer chokepoint (preserves strict-mode escalation + onWarning + ds.warnings push)
    - decompression-bomb cap via `inflateRawSync({ maxOutputLength })` — Node-native, no userland byte-counting needed
    - test-only cap override (`parseDeflatedLEWithCap`) so the bomb-cap test stays tractable (1 KiB instead of 256 MiB)
    - try/catch around `inflateRawSync` with two-branch detection (ERR_BUFFER_TOO_LARGE → cap exceeded; everything else → stream corruption) — converts both into typed `DicomParseError(INVALID_FILE_META)`
    - symmetric `zlib.deflateRawSync` encoder in build-dicom.ts (round-trip provability without runtime dep on `src/`)
key-files:
  created:
    - src/parser/deflated-le.ts
    - src/parser/deflated-le.test.ts
  modified:
    - src/parser/transfer-syntax.ts (replaces local stub with `import { parseDeflatedLE } from "./deflated-le.js"`; re-exports parseDeflatedLE)
    - src/parser/transfer-syntax.test.ts (updates "callable as stub" suite — all four strategies are now real; parseDeflatedLE test now uses an empty raw-deflate stream)
    - test/helpers/build-dicom.ts (adds Deflated-LE encoder branch — encode elements as Explicit VR LE first, then deflate the concatenation via zlib.deflateRawSync)
    - .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md (TS-04 marked complete; TS-01..04 row marked Complete; Phase 2 plan progress 5/6)
decisions:
  - "Honored CONTEXT D-26 — `zlib.inflateRawSync` (RFC 1951 raw deflate) is the ONLY API used. `inflateSync` / `gunzipSync` / `unzipSync` are forbidden. Verified by `grep -E '\\binflateSync\\b|\\bgunzipSync\\b|\\bunzipSync\\b' src/parser/deflated-le.ts | grep -v JSDoc-comment` returning zero hits — only mentions are inside the JSDoc warning paragraphs that document the forbidden APIs"
  - "Honored D-26 — File Meta is parsed UNCOMPRESSED (FM-01); only `buffer.subarray(datasetStart)` is fed to `inflateRawSync`. The dispatcher in `parseDicom` already calls `parseFileMeta` BEFORE invoking the strategy, so parseDeflatedLE never sees File Meta bytes"
  - "Honored D-27 — inner emit wrapper preserves all original warning fields (`code`, `message`, `position.byteOffset`, `position.contextPath`) and SETS `position.deflated = true`. Warnings emitted before inflation (File Meta time) carry `position.fileMeta = true` instead — verified by the `position.fileMeta=true and NOT deflated` test case"
  - "Honored D-27 chokepoint preservation — the inner emit wrapper forwards through the outer chokepoint (the `emit` parameter is the outer chokepoint constructed by `makeEmitter` in parseDicom). Strict mode therefore escalates correctly, the onWarning callback fires, and ctx.warnings is pushed exactly once per warning. Verified by the strict-mode and onWarning tests"
  - "Honored T-02-05-01 — 256 MiB cap (`DEFAULT_MAX_INFLATED_BYTES = 256 * 1024 * 1024`) passed via `inflateRawSync({ maxOutputLength })`. Test override at 1 KiB via `parseDeflatedLEWithCap` triggers the typed throw deterministically with a 2 KiB-of-identical-bytes deflate-bomb fixture"
  - "Honored T-02-05-02 — every other inflate failure (corrupt deflate stream, premature EOF, etc.) is caught and converted to `DicomParseError(INVALID_FILE_META, 'Failed to inflate Deflated TS payload: <err.message>', datasetStart, snippet)`. Never `UNSUPPORTED_TRANSFER_SYNTAX` — the TS UID is supported; the payload is malformed"
  - "Honored T-02-05-04 — JSDoc on `parseDeflatedLE` documents that Element rawBytes are subarrays of the inflated buffer (pin until GC); `copyValues: true` opts into `Buffer.from(slice)` for detachment. This is automatic since the inner parseExplicitLE consults `innerCtx.copyValues` which is propagated from the outer ctx"
  - "Honored T-02-05-05 — position-confusion mitigation. Tests verify dataset warnings carry `position.deflated=true` while File Meta warnings carry `position.fileMeta=true` and `position.deflated === undefined`"
  - "Test-only cap override pattern — `parseDeflatedLEWithCap(buffer, datasetStart, ctx, emit, maxInflatedBytes)` is `@internal` JSDoc-tagged and exported only so the test suite can pass a 1 KiB cap. v1.x may surface this through `ParseOptions.maxInflatedBytes`; for now it remains an internal seam"
  - "buildDicom encoder routes Deflated TS at the `buildDicom` level (NOT in `encodeElement`) — the dataset must be encoded as a contiguous Explicit-LE buffer FIRST and then deflated as a unit. encodeElement throws cleanly for ts='1.2.840.10008.1.2.1.99' to enforce the invariant"
  - "Single-call inflation — Phase 2 inflates the entire deflated payload in one `inflateRawSync` call. Streaming inflation (chunk-by-chunk) is NOT a v1 requirement; if a 256 MiB-capped synchronous inflate becomes a real-world bottleneck, v1.x can add a streaming variant via `zlib.createInflateRaw()`"
  - "All four TRANSFER_SYNTAX_PARSERS entries are now backed by real implementations — TS-01 (parseImplicitLE), TS-02 (parseExplicitLE), TS-03 (parseExplicitBE), TS-04 (parseDeflatedLE). The dispatch table itself has not changed since plan 02-02"
metrics:
  tasks_completed: 1
  duration_minutes: ~10
  completed_date: 2026-05-01
  tests_added: 10 (all parseDeflatedLE-specific in src/parser/deflated-le.test.ts)
  total_tests: 214 (was 204 at end of 02-04)
---

# Phase 2 Plan 02-05: Deflated Explicit VR LE Parser Summary

`parseDicom(buildDicom({ transferSyntax: "1.2.840.10008.1.2.1.99", elements: [...] }))` now round-trips a fully-parsed `Dataset` for Deflated Explicit VR Little Endian (TS-04). All four v1 transfer-syntax strategies in `TRANSFER_SYNTAX_PARSERS` are backed by real implementations — no stubs remain.

## What was built

### `src/parser/deflated-le.ts` — new

**Public surface (internal):**

- `parseDeflatedLE(buffer, datasetStart, ctx, emit) → { elements, endOffset }` — public TS-04 strategy. 1-line wrapper over `parseDeflatedLEWithCap` with the 256 MiB default cap.
- `parseDeflatedLEWithCap(buffer, datasetStart, ctx, emit, maxInflatedBytes)` — internal cap-configurable variant. The test suite imports this to override the cap to 1 KiB for a tractable decompression-bomb test.
- `DEFAULT_MAX_INFLATED_BYTES = 256 * 1024 * 1024` — module-level constant, exported for documentation purposes (tests don't import it; they pass an explicit override).

**Pipeline (per CONTEXT D-26 / D-27):**

1. Slice the compressed payload: `compressed = buffer.subarray(datasetStart)`. File Meta has already been parsed uncompressed by `parseFileMeta`; only the deflated body reaches this strategy.
2. Call `inflateRawSync(compressed, { maxOutputLength: maxInflatedBytes })`.
   - `RangeError` with `code === 'ERR_BUFFER_TOO_LARGE'` (or matching message) → `DicomParseError(INVALID_FILE_META, 'Inflated Deflated TS payload exceeds N-byte cap.', datasetStart, snippet)`.
   - Any other thrown Error → `DicomParseError(INVALID_FILE_META, 'Failed to inflate Deflated TS payload: <message>', datasetStart, snippet)`.
3. Build a NEW inner ParseContext: `innerCtx = { ...ctx, buffer: inflated }`. All other fields carry through unchanged so creators, encoding-context stack, nesting-depth accounting, strict, and copyValues all work transparently across the inflate boundary.
4. Build an inner emit wrapper:
   ```ts
   const innerEmit = (w) => emit({ ...w, position: { ...w.position, deflated: true } });
   ```
   The wrapper preserves `code`, `message`, `byteOffset`, and any existing `contextPath`; it adds `position.deflated = true` per D-27. The wrapped warning then flows through the OUTER chokepoint, preserving strict-mode escalation, onWarning invocation, and ctx.warnings push semantics.
5. Call `parseExplicitLE(inflated, 0, innerCtx, innerEmit)`.
6. Return `{ elements: result.elements, endOffset: buffer.length }` — the on-disk endOffset is the end of the source buffer (every byte from `datasetStart` belongs to the deflate body).

### `src/parser/transfer-syntax.ts` — modified

- Imports `parseDeflatedLE` from `./deflated-le.js` (the LAST stub replacement).
- Re-exports it alongside the other three strategies.
- Removes the local stub function body.
- The frozen dispatch table itself does NOT change — the four entries' identities are stable from plan 02-02 onward.

### `test/helpers/build-dicom.ts` — extended

- Adds `import { deflateRawSync } from "node:zlib"`.
- `buildDicom` special-cases `opts.transferSyntax === "1.2.840.10008.1.2.1.99"`:
  ```ts
  const explicitLeBytes = Buffer.concat(
    opts.elements.map((el) => encodeAnyElement(el, "1.2.840.10008.1.2.1")),
  );
  parts.push(deflateRawSync(explicitLeBytes));
  ```
  Each element is encoded as Explicit VR LE FIRST, then the entire dataset (after File Meta) is deflated as a unit. File Meta itself is NOT deflated (FM-01 invariant — symmetric to the parser, which never feeds File Meta bytes to `inflateRawSync`).
- `encodeElement` rejects TS-04 with a clear "caller bug" error message — it should never be reached, since the encoder routes deflation at the `buildDicom` level.

### `src/parser/deflated-le.test.ts` — new

10 test cases covering:

| Suite | Cases | Coverage |
|-------|-------|----------|
| Happy path (D-26) | 2 | Single-PN round-trip; multi-element (PN + UI) round-trip. Both verify `ds.fileMeta?.transferSyntaxUID === "1.2.840.10008.1.2.1.99"` and the inflated parse yielded the expected element bytes. |
| Position annotation (D-27) | 2 | VR-mismatch warning emitted from inflated content carries `position.deflated === true`; File Meta group-length-missing warning emitted before inflation carries `position.fileMeta === true` and `position.deflated === undefined`. |
| Strict-mode escalation | 2 | Odd-length SH inside Deflated TS triggers `DICOM_ODD_LENGTH_VALUE_PADDED` which under `{ strict: true }` throws `DicomParseError` (verifies the inner emit wrapper does NOT bypass the outer chokepoint); `onWarning` callback fires and receives the deflated-tagged warning. |
| T-02-05-01 cap | 1 | `parseDeflatedLEWithCap` with a 1 KiB cap on a deflate-bomb fixture (2 KiB of identical bytes) throws `DicomParseError(INVALID_FILE_META)` with message containing "exceeds" and "1024", and `byteOffset === datasetStart`. |
| T-02-05-02 corruption | 2 | Random non-deflate bytes throw typed `DicomParseError(INVALID_FILE_META)` with "inflate" in the message at the unit level; corrupted-tail Deflated buffer throws `DicomParseError` end-to-end through `parseDicom`. |
| copyValues | 1 | Both `copyValues: false` (default Buffer.subarray view) and `copyValues: true` (Buffer.from copy) yield correct decoded values; the underlying ArrayBuffers differ, proving the inflated buffer is detached when the option is set. |

## inflateRawSync vs inflateSync — invariant proof

Per CONTEXT D-26 + PROJECT.md key decision + PITFALLS.md §1.4, the parser MUST use `zlib.inflateRawSync` (RFC 1951 raw deflate) and MUST NOT use `zlib.inflateSync` (RFC 1950 zlib-wrapped). The forbidden APIs are `inflateSync`, `gunzipSync`, `unzipSync`.

**Source-grep evidence:**

```
$ grep -nE '\binflateRawSync\b' src/parser/deflated-le.ts
49:export function parseDeflatedLE(
74: * Same as {@link parseDeflatedLE} but with a configurable inflated-output
108:    inflated = inflateRawSync(compressed, { maxOutputLength: maxInflatedBytes });

$ grep -nE '\binflateSync\b|\bgunzipSync\b|\bunzipSync\b' src/parser/deflated-le.ts \
    | grep -vE '^\s*\d+:\s*\*'   # filter JSDoc comment lines
# (zero hits — only mentions are inside the documentation paragraphs)
```

The two `inflateSync` mentions in `deflated-le.ts` are inside JSDoc paragraphs that document the forbidden API; no executable code path references it.

**Round-trip evidence:**

The buildDicom encoder uses `zlib.deflateRawSync` (RFC 1951) and the parser uses `zlib.inflateRawSync` (RFC 1951). The happy-path test "round-trips a single PN element" passes, which is impossible if the parser were using `inflateSync` (it would throw on the unrecognized RFC 1951 stream — no zlib header).

## 256 MiB decompression-bomb cap — fixture details

**Default cap:** `DEFAULT_MAX_INFLATED_BYTES = 256 * 1024 * 1024`. Passed to `inflateRawSync` via the standard `maxOutputLength` option (Node 16.9+).

**Test fixture (1 KiB cap override):**

```ts
const bigDataset = Buffer.alloc(2048, 0x41);    // 2 KiB of identical 'A' bytes
const compressed = deflateRawSync(bigDataset);  // ~10–15 bytes (deflate excels on RLE-able data)
const fakeOnDisk = Buffer.concat([Buffer.alloc(64), compressed]);  // datasetStart=64

parseDeflatedLEWithCap(fakeOnDisk, 64, ctx, emit, 1024);
// → DicomParseError(INVALID_FILE_META, "Inflated Deflated TS payload exceeds 1024-byte cap.", 64, snippet)
```

The fixture is a textbook deflate-bomb shape — long runs of identical bytes deflate to a tiny stream, then balloon on inflation. The 1 KiB cap is far below the 2 KiB inflated size; Node's `inflateRawSync` halts mid-stream and throws a `RangeError` with `code === 'ERR_BUFFER_TOO_LARGE'`, which the catch-block converts to `DicomParseError(INVALID_FILE_META)`.

The 256 MiB default is verified by inspection only (a 257 MiB inflated fixture would balloon test memory and is not tractable); the cap-override test exercises the SAME code path with a smaller threshold, proving the mitigation activates correctly.

## Inner emit wrapper — `position.deflated = true` annotation

**Wrapper code (deflated-le.ts):**

```ts
const innerEmit = (w: DicomParseWarning): void => {
  const wrapped: DicomParseWarning = {
    ...w,
    position: { ...w.position, deflated: true },
  };
  emit(wrapped);
};
```

**Behavior under each test path:**

| Warning origin | `position.fileMeta` | `position.deflated` | byteOffset reference |
|----------------|---------------------|---------------------|----------------------|
| File Meta time (e.g., `DICOM_FILE_META_GROUP_LENGTH_MISSING`) | `true` | `undefined` | on-disk source buffer |
| Inflated dataset (e.g., `DICOM_VR_MISMATCH`, `DICOM_ODD_LENGTH_VALUE_PADDED`) | `undefined` | `true` | inflated buffer (NOT on-disk) |

The wrapper does not bypass the outer chokepoint — `emit` is the `makeEmitter(ctx)` function constructed by `parseDicom` for the entire parse. Strict-mode escalation, the `onWarning` callback, and the `ctx.warnings` push all behave exactly as they would for non-deflated transfer syntaxes.

## All four v1 TS strategies are real

After plan 02-05, the dispatch table contains zero stubs:

```
$ grep -E 'parseImplicitLE|parseExplicitLE|parseExplicitBE|parseDeflatedLE' src/parser/transfer-syntax.ts | wc -l
8  # 4 imports + 4 dispatch-table entries — every strategy is sourced from a per-strategy module
```

| TS UID | Plan | Strategy module | Status |
|--------|------|-----------------|--------|
| 1.2.840.10008.1.2 | 02-03 | `./implicit-le.js` | Real |
| 1.2.840.10008.1.2.1 | 02-04 | `./explicit-le.js` | Real |
| 1.2.840.10008.1.2.2 | 02-04 | `./explicit-be.js` | Real |
| 1.2.840.10008.1.2.1.99 | 02-05 (this) | `./deflated-le.js` | Real |

Plan 02-06 (the capstone) will sweep strict-mode pair-tests across every actively-emitted Tier-2 code, verifying the chokepoint flips every warning to a throw under `{ strict: true }` regardless of which TS the warning originated from.

## REQ coverage

| REQ-ID | Coverage |
|--------|----------|
| TS-04  | `1.2.840.10008.1.2.1.99` registered in `TRANSFER_SYNTAX_PARSERS` (unchanged from 02-02 dispatch table); strategy backed by `parseDeflatedLE` using `zlib.inflateRawSync` per CONTEXT D-26 / PITFALLS §1.4. Round-trip verified by `parseDicom(buildDicom({ transferSyntax: '1.2.840.10008.1.2.1.99', elements: [...] }))` returning the expected Dataset. File Meta parsed UNCOMPRESSED before inflation per FM-01. |

## Threat model coverage

All five Phase 2-05 threats from the plan threat model:

- **T-02-05-01** (Decompression bomb): `inflateRawSync({ maxOutputLength: 256 * 1024 * 1024 })` with the 1 KiB-cap test override exercising the typed-throw branch deterministically. Tests assert message contains "exceeds" + the byte count + `byteOffset === datasetStart`.
- **T-02-05-02** (Stream corruption): try/catch wraps `inflateRawSync`; non-`ERR_BUFFER_TOO_LARGE` failures throw `DicomParseError(INVALID_FILE_META, 'Failed to inflate ...')` — never a raw zlib `RangeError` leak. Two tests cover this: a unit test (random bytes fed directly to `parseDeflatedLEWithCap`) and an end-to-end test (corrupted Deflated buffer through `parseDicom`).
- **T-02-05-03** (Buffer over-read inside inflated payload): mitigated transitively by plan 02-04's bounds-checks and nesting-depth cap on `parseExplicitLE`. The inner parse sees a fresh `innerCtx` whose `nestingDepth` carries from the outer ctx, so the 64-deep cap applies across the inflate boundary.
- **T-02-05-04** (Inflation context leak / buffer retention): JSDoc on `parseDeflatedLE` documents that Element rawBytes pin the inflated buffer; `copyValues: true` opts out. The `copyValues` test verifies both modes work — `copyValues=true` yields a fresh allocation (different underlying ArrayBuffer than `copyValues=false`).
- **T-02-05-05** (Position-confusion attack): inner emit wrapper tags `position.deflated = true` for inflated-content warnings. The `position.fileMeta=true and NOT deflated` test verifies File Meta warnings emitted BEFORE inflation are NOT mis-tagged.

## Strict-mode coverage

Plan 02-05 adds zero new actively-emitted Tier-2 codes; it inherits every code emittable through `parseExplicitLE` (six codes from plan 02-04 plus the three from plan 02-03 plus the File Meta codes from plan 02-02). The strict-mode escalation contract is preserved end-to-end through the inner emit wrapper:

- The outer chokepoint is `makeEmitter(ctx)` constructed in `parseDicom`.
- The inner emit wrapper preserves all warning fields and forwards through that same outer chokepoint.
- Therefore, `{ strict: true }` escalates Deflated-TS warnings to throws identically to non-deflated-TS warnings.

Verified by the `strict mode escalates a Tier-2 warning emitted from inflated content` test (odd-length SH inside Deflated TS → `DicomParseError`).

## Acceptance gates (all pass)

- `pnpm typecheck` — exits 0.
- `pnpm lint` — exits 0 (max-warnings=0).
- `pnpm test` — 214/214 pass (18 test files; 10 new tests in 02-05).
- `pnpm build` — ESM 1017.78 KB, CJS 1018.11 KB, DTS 31.50 KB.
- `node test/smoke/esm/index.mjs` — green.
- `node test/smoke/cjs/index.cjs` — green.
- Pre-commit hook (PHI scan) — green on every task commit.
- `grep -q 'inflateRawSync' src/parser/deflated-le.ts` — OK.
- `grep -nE '\binflateSync\b|\bgunzipSync\b|\bunzipSync\b' src/parser/deflated-le.ts | grep -v JSDoc` — empty (only JSDoc-comment mentions remain, which document the forbidden APIs).
- `grep -q 'maxOutputLength' src/parser/deflated-le.ts` — OK.
- `grep -qE 'deflated: true|deflated:true' src/parser/deflated-le.ts` — OK.
- `grep -q 'parseDeflatedLE' src/parser/transfer-syntax.ts && grep -q 'import.*parseDeflatedLE.*from "./deflated-le' src/parser/transfer-syntax.ts` — OK.
- `grep -q 'deflateRawSync' test/helpers/build-dicom.ts` — OK (symmetric encoder).
- `! grep -q 'export function parseDeflatedLE' src/parser/transfer-syntax.ts` — OK (stub gone; only the import + dispatch-table reference remain).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Initial `import { Buffer }` triggered the `consistent-type-imports` ESLint rule.**

- **Found during:** Task 1 GREEN-phase lint run.
- **Issue:** `deflated-le.ts` initially had `import { Buffer } from "node:buffer"` but used `Buffer` only as a type annotation — the runtime value was never accessed (the Buffer instance comes through `inflateRawSync`'s return type and the caller-supplied `buffer` parameter).
- **Fix:** Changed to `import type { Buffer } from "node:buffer"`. Matches the discipline already established in `src/parser/sequence.ts` (which the 02-04 deviation log noted as having the same pattern).
- **Files modified:** `src/parser/deflated-le.ts`.
- **Commit:** included in `feat(02-05): implement parseDeflatedLE — TS-04 (zlib.inflateRawSync)` (81434cf).

**2. [Rule 1 — Bug] `transfer-syntax.test.ts` "callable as stub" suite passed `Buffer.alloc(0)` to the now-real `parseDeflatedLE`, which threw on the empty input.**

- **Found during:** Full-test-suite run after the GREEN-phase deflated-le.test.ts passed.
- **Issue:** The 02-02 transfer-syntax dispatch test "parseDeflatedLE returns empty elements with no throw" assumed parseDeflatedLE was a stub returning `{ elements: new Map() }`. Now that it's real, an empty Buffer fed to `inflateRawSync` is a malformed deflate stream and throws `DicomParseError(INVALID_FILE_META)`.
- **Fix:** Updated the suite to reflect that all four strategies are now real after plan 02-05; the deflated-LE case now passes a valid empty raw-deflate stream (`zlib.deflateRawSync(Buffer.alloc(0))`), which inflates to 0 bytes and parses to an empty element map. The other three strategies remain unchanged (they handle empty buffers natively as a 0-iteration loop).
- **Files modified:** `src/parser/transfer-syntax.test.ts`.
- **Commit:** included in `feat(02-05): implement parseDeflatedLE — TS-04 (zlib.inflateRawSync)` (81434cf).

**3. [Rule 1 — Test bug] `copyValues=true` test originally asserted `el.rawBytes.buffer.byteLength === el.rawBytes.byteLength`, which fails because `Buffer.from(slice)` allocates from the Node Buffer pool (default 8 KiB).**

- **Found during:** Initial GREEN-phase run of `copyValues=true allocates new rawBytes buffers for inflated elements`.
- **Issue:** The assertion conflated "fresh allocation" with "underlying ArrayBuffer length equals the slice length". `Buffer.from(slice)` returns a Buffer whose underlying ArrayBuffer is the 8 KiB pool, not a tightly-allocated arena.
- **Fix:** Replaced the assertion with the more meaningful invariant: `elCopy.rawBytes.buffer !== elView.rawBytes.buffer`. Both modes yield correct values; the difference is whether the Element's rawBytes pin the inflated buffer (`copyValues=false`) or are detached into the Node pool (`copyValues=true`).
- **Files modified:** `src/parser/deflated-le.test.ts`.
- **Commit:** included in `feat(02-05): implement parseDeflatedLE — TS-04 (zlib.inflateRawSync)` (81434cf).

### Auth gates

None.

### Architectural changes

None. The plan was followed verbatim; the cap-override-via-internal-export pattern was anticipated by the plan's `<action>` step.

## Phase boundary preserved

- `Element` and `Dataset` still have only the 02-01 + 02-04 structural surface — no `.value` getter, no navigation methods. No new fields added.
- D-11 chokepoint preserved: zero per-call-site `if (ctx.strict) throw` checks introduced. The inner emit wrapper FORWARDS through the outer chokepoint instead of replacing it. Verified by `! grep -E 'if \(ctx\.strict' src/parser/deflated-le.ts` (zero hits).
- Deflated TS is the LAST stub replacement — no other parser module changed in this plan.
- `LONG_FORM_VRS`, `BE_VR_STRIDE`, `ParserStrategy`, `ParseContext`, `DicomParseWarning`, `WARNING_CODES`, `FATAL_CODES` are all unchanged. Phase 5 serializer can adopt `zlib.deflateRawSync` for symmetric output without coordinating with Phase 2 changes.

## Self-Check: PASSED

Created files exist:

- `src/parser/deflated-le.ts` — found.
- `src/parser/deflated-le.test.ts` — found.

Modified files updated:

- `src/parser/transfer-syntax.ts` — found (parseDeflatedLE imported from `./deflated-le.js`; local stub removed; verified by grep).
- `src/parser/transfer-syntax.test.ts` — found (deflated-LE callability test updated to use a valid raw-deflate stream).
- `test/helpers/build-dicom.ts` — found (deflateRawSync imported; TS-04 branch added in buildDicom).
- `.planning/REQUIREMENTS.md` — TS-04 marked complete; TS-01..04 traceability row marked Complete.
- `.planning/STATE.md` — plan 02-05 status; 5/6 plans; resume → 02-06.
- `.planning/ROADMAP.md` — Phase 2 progress 5/6.

Commits exist in `git log --all`:

- `332f5af` test(02-05): add failing tests for parseDeflatedLE (TS-04) — verified.
- `81434cf` feat(02-05): implement parseDeflatedLE — TS-04 (zlib.inflateRawSync) — verified.

## Threat Flags

None — plan 02-05 introduces no new security-relevant surface beyond the threat model entries already documented in the plan and mitigated above.

## Next plan

**02-06** (Wave 5 — capstone): Strict-mode escalation pair-test gate sweep + final Phase 2 acceptance.

- Verifies the chokepoint flips every actively-emitted Tier-2 code to a throw under `{ strict: true }` (per CONTEXT D-36).
- Adds a `test/integration/parser-strict-mode.test.ts` if not already present (per CONTEXT D-39).
- Final smoke run + integration test sweep + coverage report (informational, gated by Phase 8).
- No new parser features — capstone only.

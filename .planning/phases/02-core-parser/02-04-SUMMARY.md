---
phase: 02-core-parser
plan: 02-04
subsystem: parser
tags: [parser, explicit-vr-le, explicit-vr-be, sequence, ffffe-markers, cp-246, encapsulated-pixel-data, transfer-syntax]
requires:
  - 02-01 (WARNING_CODES + emit chokepoint + ByteCursor + ParseContext + LONG_FORM_VRS + BE_VR_STRIDE)
  - 02-02 (parseDicom entry, transfer-syntax dispatch table, buildDicom helper)
  - 02-03 (parseImplicitLE — InnerParser used by CP-246 fallback in tryParseUnAsSQ)
provides:
  - src/parser/sequence.ts — parseSequence + tryParseUnAsSQ (shared SQ + FFFE marker handling)
  - src/parser/explicit-le.ts — parseExplicitLE (TS-02) + shared `_parseExplicit` body
  - src/parser/explicit-be.ts — parseExplicitBE (TS-03) — 1-line wrapper over `_parseExplicit`
  - src/parser/element-header.ts — readExplicitElementHeader (append-only below 02-03's helpers)
  - Real Explicit VR LE + BE parsing wired into TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1"] and TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.2"]
  - parseImplicitLE updated to InnerParser contract (endOffset return + stopOnItemDelim opt)
affects:
  - Plan 02-05 — only the deflated-LE entry remains stubbed; plan 02-05 replaces it without touching the four other parser files
  - Plan 02-06 — strict-mode pair-test sweep can target every Tier-2 code emitted in this plan (DICOM_VR_MISMATCH, DICOM_ODD_LENGTH_VALUE_PADDED, DICOM_NONZERO_RESERVED_BYTES, DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR, DICOM_UN_PARSED_AS_SQ, DICOM_EMPTY_ITEM_IN_SEQUENCE)
  - Phase 3 — `Element.cp246Promoted` hint enables the lazy SQ decoder to choose `parseImplicitLE` inner without re-running CP-246 detection on every access
tech-stack:
  added: []
  patterns:
    - shared `_parseExplicit(buffer, start, ctx, emit, mode, opts)` body — parseExplicitLE / parseExplicitBE are 1-line wrappers; only knobs are `littleEndian` + the SQ-inner strategy
    - InnerParser contract (endOffset return + stopOnItemDelim opt) breaks the parseSequence ↔ per-TS-parser circular import
    - peek-then-decide FFFE detection (cursor.readUInt16At before the explicit-VR header read) — closes the canonical BE-FFFE bug per PITFALLS §2.3
    - try/finally state-restore in parseSequence + tryParseUnAsSQ (nestingDepth, encodingContextStack, warnings) — CP-246 failure path emits NO warnings
    - per-VR Big Endian byte-swap deferred to Phase 3 lazy decoders (Phase 2 stores rawBytes verbatim per CONTEXT D-44)
    - 64-deep SQ nesting cap (NESTING_DEPTH_LIMIT = 64) enforced before push
key-files:
  created:
    - src/parser/sequence.ts
    - src/parser/sequence.test.ts
    - src/parser/explicit-le.ts
    - src/parser/explicit-le.test.ts
    - src/parser/explicit-be.ts
    - src/parser/explicit-be.test.ts
  modified:
    - src/parser/element-header.ts (appended readExplicitElementHeader below 02-03's exports)
    - src/parser/transfer-syntax.ts (imports parseExplicitLE + parseExplicitBE; local stubs removed; ParserStrategy widened with `endOffset?`)
    - src/parser/implicit-le.ts (replaces local parseSequence stub with `import { parseSequence } from "./sequence.js"`; adopts InnerParser contract — returns endOffset, accepts stopOnItemDelim opt)
    - src/dataset/element.ts (adds `cp246Promoted?: boolean` hint per D-30)
    - test/helpers/build-dicom.ts (extends BuildDicomOptions to accept BuildDicomSqElement; adds Explicit VR BE encoder with per-VR byte-swap mirroring BE_VR_STRIDE; adds SQ + FFFE encoders + encapsulated-pixel-data form)
decisions:
  - "Honored CONTEXT D-22 — Explicit VR header layouts (8-byte short-form / 12-byte long-form) parsed via `readExplicitElementHeader` from element-header.ts; LONG_FORM_VRS reused unchanged from 02-01"
  - "Honored D-23 — BE_VR_STRIDE consumed only by the test helper for fixture pre-swap; production parser stores rawBytes verbatim per D-44 (Phase 3 lazy decoders own the swap)"
  - "Honored D-24 — OB / UN never swap; verified by tests asserting `el.rawBytes.equals(callerInput)` for both VRs under TS-03"
  - "Honored D-25 — FFFE markers route through ByteCursor with the caller-supplied endianness; FFFE-under-BE termination test (undefined-length SQ in TS-03) closes the canonical bug per PITFALLS §2.3"
  - "Honored D-28 — encoding-context stack push/pop in parseSequence; SqItem on SQ descent, EncapsulatedPixelData on D-31 path; 64-deep nesting cap enforced (T-02-04-02)"
  - "Honored D-29 — undefined-length SQ in Explicit VR emits DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR; SQ still parses correctly via SeqDelim termination"
  - "Honored D-30 — CP-246 fallback wraps state restore (nestingDepth + stack + warnings); on success promotes vr=UN→vr=SQ + sets cp246Promoted=true + emits DICOM_UN_PARSED_AS_SQ; on failure restores state with NO warning emitted"
  - "Honored D-30 conservatively on CP-246 failure path — UN-undefined-length is malformed if not a CP-246 SQ; cursor advances to end-of-buffer with rawBytes covering the remainder. Documented as 'best-effort under CP-246 failure'"
  - "Honored D-31 — (7FE0,0010) VR=OB length=0xFFFFFFFF parses as encapsulated pixel data; vr stays OB (NOT promoted); fragments recognized structurally; Phase 4 surfaces ds.pixelData.fragments"
  - "Honored D-44 — Phase 2 stores BE rawBytes verbatim; Phase 3 lazy decoders consume BE_VR_STRIDE for value-time swap. Documented in JSDoc on parseExplicitBE"
  - "Honored D-11 — no per-call-site strict checks introduced; verified by `grep -RnE 'if \\(ctx\\.strict' src/parser/{explicit-le,explicit-be,sequence,element-header}.ts` (zero hits). All Tier-2 escalation flows through emit.ts"
  - "Honored TOL-07 — DICOM_ODD_LENGTH_VALUE_PADDED emitted for odd-length values; parser reads exactly `length` bytes (no padding — Phase 5 serializer's job)"
  - "Honored TOL-08 — DICOM_VR_MISMATCH emitted only for STANDARD tags (private tags excluded since they have no dictionary entry); on-wire VR trusted (Postel's Law)"
  - "Closed the InnerParser circular-import seam — parseSequence ↔ per-TS-parser cycle broken via the strategy parameter on ParseSequenceOptions.innerStrategy. Each per-TS strategy passes itself in"
  - "Test helper buildDicom extended with BuildDicomSqElement union + per-VR BE swap helper (BE_VR_STRIDE_LOCAL mirror); ESLint-clean; typecheck clean"
metrics:
  tasks_completed: 3
  duration_minutes: ~25
  completed_date: 2026-05-01
  tests_added: 33 (11 sequence + 12 explicit-le + 10 explicit-be)
  total_tests: 204 (was 171 at end of 02-03)
---

# Phase 2 Plan 02-04: Explicit VR LE + Explicit VR BE + Sequence Parser Summary

`parseDicom(buildDicom({ transferSyntax: "1.2.840.10008.1.2.1" | "1.2.840.10008.1.2.2", elements: [...] }))` now returns a fully-parsed `Dataset` for both Explicit VR Little Endian (TS-02) and Explicit VR Big Endian (TS-03) — short-form / long-form headers, per-VR byte-stream rules (D-23 / D-24), undefined-length SQ termination via FFFE markers (D-25 + D-29), CP-246 fallback (D-30) with state restore on failure, and structural recognition of encapsulated pixel data (D-31). Three of four v1 transfer syntaxes are now real; only the Deflated Explicit VR LE strategy (TS-04, plan 02-05) remains stubbed.

## What was built

### `src/parser/sequence.ts` — new (shared SQ + FFFE marker parser)

**Public surface (internal):**

- `parseSequence(buffer, valueStart, ctx, emit, opts) → { items, endOffset }` — handles all four item modes:
  - **Defined-length item**: `(FFFE,E000) length=N` → slice buffer at `[cursor, cursor+N]`, call `innerStrategy(slice, 0, ...)`, advance cursor by N.
  - **Undefined-length item**: `(FFFE,E000) length=0xFFFFFFFF` → call `innerStrategy(buffer, cursor, ..., { stopOnItemDelim: true })` — the inner parser consumes until the matching `(FFFE,E00D)` ItemDelim.
  - **Empty item**: `(FFFE,E000) length=0` → emit `DICOM_EMPTY_ITEM_IN_SEQUENCE`; push empty `Item({ elements: new Map(), warnings: [], index: N })`.
  - **Encapsulated pixel data fragment**: `opts.encapsulatedPixelData === true` → consume `length` raw bytes verbatim; push empty `Item` (Phase 4 re-walks rawBytes for fragment surface).
- `tryParseUnAsSQ(buffer, valueStart, valueLength, ctx, emit, implicitLeInner) → { success, items, endOffset }` — CP-246 fallback per D-30. Saves `nestingDepth + encodingContextStack.length + warnings.length`; on inner-parse throw, restores all three and returns `success: false` with NO warning emitted.

**Loop termination:**

- `opts.explicitLength === undefined` → continue until `(FFFE,E0DD)` SeqDelim (or end-of-buffer).
- `opts.explicitLength === N` → continue until `cursor.position === valueStart + N`.

**Nesting-depth cap (T-02-04-02):**

`ctx.nestingDepth` increments on entry; if `> 64`, throws `DicomParseError(INVALID_FILE_META, "SQ nesting depth exceeds 64", ...)` *before* the try block (so the finally rebalance is correct). On exit (try/finally) the depth is decremented and the encoding-context stack is popped.

**Encoding-context stack (D-28):**

Pushes `"SqItem"` for SQ descent or `"EncapsulatedPixelData"` for the D-31 path. Pops in finally.

**Circular-import seam:**

`parseSequence` calls `opts.innerStrategy(...)` for inner element parsing — never imports per-TS parsers directly. Each per-TS strategy passes itself (and the LE strategy passes `parseImplicitLE` for CP-246).

### `src/parser/explicit-le.ts` — new (TS-02 + shared body)

Exports:

- `parseExplicitLE(buffer, start, ctx, emit, opts) → { elements, endOffset }` — public TS-02 strategy.
- `_parseExplicit(buffer, start, ctx, emit, mode, opts)` — internal shared body. The BE strategy in `explicit-be.ts` calls `_parseExplicit` with `mode.littleEndian: false` and `mode.innerStrategy: parseExplicitBE`.

**Element loop body:**

1. **FFFE pre-detection** — `cursor.readUInt16At(cursor.position)` peeks the group; if `0xFFFE`, read 8-byte FFFE marker (no VR field) and either consume ItemDelim (when `opts.stopOnItemDelim === true`) or throw `INVALID_FILE_META`.
2. **Header read** — `readExplicitElementHeader(cursor, ctx, emit)` returns `{ tag, vr, length, headerStart, headerLength }`. Long-form header validates reserved bytes; non-zero → `DICOM_NONZERO_RESERVED_BYTES`.
3. **VR mismatch (TOL-08)** — for standard tags only; emit `DICOM_VR_MISMATCH(position, tag, dictVR, fileVR)`. On-wire VR trusted.
4. **Odd-length warning (TOL-07)** — when `length !== 0xFFFFFFFF && length % 2 === 1`.
5. **SQ branch** — `vr === "SQ"`:
   - Defined length → `parseSequence({ explicitLength: length, ... })`.
   - Undefined length → emit `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` + `parseSequence({ explicitLength: undefined, ... })`.
   - `Element` constructed with `vr: "SQ"`, `length`, `vm: items.length`, `rawBytes` covering the entire SQ on-wire span (including header).
6. **Encapsulated pixel data branch (D-31)** — `tag === "7FE00010" && vr === "OB" && length === 0xFFFFFFFF`. Element keeps `vr: "OB"` (NOT promoted); `rawBytes` covers the entire encapsulation on-wire.
7. **CP-246 branch (D-30)** — `vr === "UN" && length === 0xFFFFFFFF`. Calls `tryParseUnAsSQ(buffer, valueStart, 0xFFFFFFFF, ctx, emit, parseImplicitLE)`:
   - Success → element constructed with `vr: "SQ"` (promoted), `cp246Promoted: true`, `rawBytes` spanning whole on-wire range, `DICOM_UN_PARSED_AS_SQ` emitted by `tryParseUnAsSQ`.
   - Failure → element constructed with `vr: "UN"`, `cp246Promoted: undefined`, `rawBytes` spanning to end-of-buffer (best-effort per D-30); cursor advances to end-of-buffer.
8. **Plain explicit-length value** — bounds-check `cursor.position + length <= buffer.length`; slice (`Buffer.subarray` by default; `Buffer.from(slice)` when `ctx.copyValues === true`); construct Element. Group-length / private-creator post-checks honored as in 02-03's `parseImplicitLE`.

**Error handling (T-02-04-01):**

Every cursor read wrapped in try/catch; `RangeError` → `DicomParseError(INVALID_FILE_META, "Truncated dataset...", headerStart, snippet)`. Length over-read bounds-checked before slice.

### `src/parser/explicit-be.ts` — new (TS-03)

A 5-line wrapper over `_parseExplicit`:

```ts
export function parseExplicitBE(buffer, start, ctx, emit, opts = {}) {
  return _parseExplicit(buffer, start, ctx, emit, {
    littleEndian: false,
    innerStrategy: parseExplicitBE,
  }, opts);
}
```

Per CONTEXT D-44 ("Phase 5 imports BE_VR_STRIDE for symmetric serializer behavior"), Phase 2 stores rawBytes verbatim from on-wire bytes — Phase 3's lazy decoders use `BE_VR_STRIDE` to swap on access. Verified by tests asserting `el.rawBytes.equals(Buffer.from([0x00, 0x05]))` for a US value built from caller-side LE bytes `[0x05, 0x00]`.

### `src/parser/element-header.ts` — extended

Appended `readExplicitElementHeader(cursor, ctx, emit) → ExplicitElementHeader`:

- Reads group / element / VR (always 2 ASCII bytes) per the cursor's endianness.
- Long-form (`LONG_FORM_VRS.has(vr)`) → 2 reserved bytes + 4-byte length; emits `DICOM_NONZERO_RESERVED_BYTES` if reserved ≠ `0x00 0x00`.
- Short-form → 2-byte length.

The 02-03 helpers (`resolveImplicitVR`, `resolvePrivateCreator`, `registerPrivateCreator`, `matchRepeatingGroup`, `getFamilyEntries`, `matchesFamilyPattern`) are **untouched** per the plan coordination rule.

### `src/parser/implicit-le.ts` — modified

- Imports `parseSequence` from `./sequence.js`; the local stub from 02-03 is **removed**.
- Adopts the InnerParser contract: returns `{ elements, endOffset }`; accepts `opts: { stopOnItemDelim?: boolean }`; on ItemDelim under `stopOnItemDelim === true`, returns the post-delim offset (cursor advanced past the 8-byte marker).

### `src/dataset/element.ts` — modified

Adds `cp246Promoted?: boolean` to `ElementInit` and `Element` (read-only public field). Set only by parseExplicitLE / parseExplicitBE on the CP-246-success branch; Phase 3 reads this hint to choose the Implicit-VR-LE inner decoder for the lazy SQ getter.

### `src/parser/transfer-syntax.ts` — modified

- Imports `parseExplicitLE` from `./explicit-le.js` and `parseExplicitBE` from `./explicit-be.js`.
- The 02-02 stub bodies for both are removed.
- `ParserStrategy` signature widened: `endOffset?: number` (Phase 2's per-TS strategies always populate it; the top-level `parseDicom` dispatch ignores it).

### `test/helpers/build-dicom.ts` — extended

- `BuildDicomOptions.elements` widened to `readonly (BuildDicomElement | BuildDicomSqElement)[]`.
- `buildExplicitBeElement(tag, vr, value)` — group/element/length encoded BE; VR ASCII; reserved 2 bytes; per-VR `swapBytes(stride)` to flip caller-side LE/native bytes to on-wire BE.
- `BuildDicomSqElement` + `BuildDicomSqItem` — encode SQ headers (Implicit-VR-LE for TS-01; long-form Explicit for TS-02/03), FFFE,E000 item headers, FFFE,E00D ItemDelim (when `undefinedLength: true` on the item), FFFE,E0DD SeqDelim (when `undefinedLength: true` on the SQ).
- Encapsulated pixel data form (`encapsulatedPixelData: true`) — emits raw fragment bytes wrapped in FFFE,E000 markers.
- `BE_VR_STRIDE_LOCAL` is a local mirror of the production `BE_VR_STRIDE` table (the helper has no runtime dep on `src/`).

## Byte-layout matrix — TS-02 vs TS-03

| Layer | TS-02 Explicit VR LE | TS-03 Explicit VR BE |
|-------|----------------------|----------------------|
| Group / element fields | 2 LE bytes each | 2 BE bytes each |
| VR field | 2 ASCII bytes (endian-independent) | 2 ASCII bytes (endian-independent) |
| Short-form length | 2 LE bytes | 2 BE bytes |
| Long-form reserved | 2 bytes (must be `0x00 0x00`) | 2 bytes (must be `0x00 0x00`) |
| Long-form length | 4 LE bytes | 4 BE bytes |
| Numeric value bytes | LE per the VR's natural width | BE — Phase 2 stores VERBATIM on-wire (rawBytes is BE-ordered); Phase 3 swaps on access via `BE_VR_STRIDE` (D-44) |
| `OB` / `UN` value bytes | byte-stream — verbatim | byte-stream — verbatim (D-24) |
| `AT` value (single VM) | 4 bytes: `(group_LE_lo, group_LE_hi, element_LE_lo, element_LE_hi)` | 4 bytes verbatim on-wire: `(group_BE_hi, group_BE_lo, element_BE_hi, element_BE_lo)`. Phase 3 reads as TWO independent 2-byte BE swaps — NEVER one 4-byte swap (D-23) |
| FFFE markers | group/element 16-bit LE; length 32-bit LE | group/element 16-bit BE; length 32-bit BE — closes the canonical PITFALLS §2.3 bug (D-25) |

## FFFE-under-BE bug closure

The canonical bug per PITFALLS.md §2.3: a parser that reads `(FFFE,E0DD)` SeqDelim through a hard-coded LE primitive will fail to recognize SeqDelim under BE, since the on-wire bytes `0xFF 0xFE 0xE0 0xDD` decode to `0xFEFF 0xDDE0` under LE — neither value matches the expected `0xFFFE 0xE0DD`.

This plan closes the bug:

1. The shared `_parseExplicit` body uses `cursor.readUInt16At(cursor.position)` for the FFFE peek — `ByteCursor.readUInt16At` honors the cursor's `littleEndian` flag, so under BE the same byte stream decodes to `0xFFFE` correctly.
2. `parseSequence` builds its cursor with `opts.littleEndian` from the caller — the BE strategy passes `false`, the LE strategies pass `true`.
3. SeqDelim termination test: `explicit-be.test.ts` builds an undefined-length SQ under TS-03 with `buildSeqDelim(littleEndian: false)`; `parseDicom` parses the SQ correctly + emits `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` + the resulting `Element` has `vr === "SQ"`.

## CP-246 fallback success / failure paths

**Success path** (`explicit-le.test.ts` + `explicit-be.test.ts`):

- Outer element: `(0040,A730) VR=UN length=0xFFFFFFFF` under TS-02 OR TS-03.
- Inner payload: a valid Implicit-VR-LE-encoded SQ — empty item (`FFFE,E000 length=0`) followed by SeqDelim (`FFFE,E0DD length=0`). All FFFE markers are LE-encoded regardless of outer TS endian, per D-30 ("Implicit VR LE inner encoding").
- Post-parse:
  - `el.vr === "SQ"` (promoted from UN).
  - `el.cp246Promoted === true`.
  - `ctx.warnings` includes `DICOM_UN_PARSED_AS_SQ`.

**Failure path** (`explicit-le.test.ts`):

- Outer element: same UN-undefined-length header.
- Inner payload: 16 bytes of random non-DICOM gibberish.
- Post-parse:
  - `el.vr === "UN"` (NOT promoted).
  - `el.cp246Promoted === undefined`.
  - `ctx.warnings` does NOT include `DICOM_UN_PARSED_AS_SQ`.
- State preserved: `tryParseUnAsSQ` saved-and-restored `ctx.nestingDepth`, `ctx.encodingContextStack.length`, `ctx.warnings.length` — verified at the unit level in `sequence.test.ts`.

## Encoding-context stack — design

Per D-28, the parser carries `ctx.encodingContextStack: ('Root' | 'SqItem' | 'EncapsulatedPixelData')[]` initialized to `['Root']` by `parseDicom`'s `buildContext`. `parseSequence` pushes `'SqItem'` (or `'EncapsulatedPixelData'` when `opts.encapsulatedPixelData === true`) on entry and pops in `finally` — even on throw, the stack is rebalanced.

The stack's role is to disambiguate FFFE marker semantics in future expansion (Phase 4 may surface `ds.pixelData.fragments` based on `EncapsulatedPixelData` context). Phase 2 doesn't directly inspect the stack top from inside `parseSequence` (the explicit `opts.encapsulatedPixelData` flag controls fragment vs. SQ-item parsing) — but the stack is correctly maintained so Phases 3 / 4 can read it.

## 64-depth nesting cap test

`sequence.test.ts > parseSequence — nesting-depth cap (T-02-04-02)`:

1. **Succeeds at depth 64** — pre-set `ctx.nestingDepth = 63` so the next push lands at exactly 64. `parseSequence` does NOT throw; `ctx.nestingDepth` is restored to 63 on return.
2. **Throws at depth 65** — pre-set `ctx.nestingDepth = 64` so the next push would land at 65. `parseSequence` throws `DicomParseError(INVALID_FILE_META)` with `message` containing `"depth exceeds 64"`.

The cap is enforced BEFORE the try block (so the finally rebalance correctly does NOT decrement when the throw fires from the increment-and-check path).

## AT special case — rawBytes invariant

Per D-23: `BE_VR_STRIDE.AT === 2` with count = N×2 (group + element each as a 2-byte BE swap, NEVER one 4-byte swap).

Phase 2 invariant: `el.rawBytes` is verbatim on-wire. For a single-VM AT element under TS-03, that's 4 BE bytes: `(group_hi, group_lo, element_hi, element_lo)`. Phase 3's lazy AT decoder reads as `readUInt16BE(0)` + `readUInt16BE(2)` to recover the tag.

Test (`explicit-be.test.ts > AT special case`):

- Caller passes value bytes in LE/native order: `[0x10, 0x00, 0x20, 0x00]` (interprets as `(0010, 0020)` when read LE pair-wise).
- Encoder's `swapBytes(stride=2)` flips each 2-byte pair → `[0x00, 0x10, 0x00, 0x20]` on-wire.
- Parser stores rawBytes verbatim → `el.rawBytes.equals(Buffer.from([0x00, 0x10, 0x00, 0x20]))` (BE-ordered).

This locks the invariant for Phase 3.

## REQ coverage

| REQ-ID | Coverage |
|--------|----------|
| TS-02  | `1.2.840.10008.1.2.1` registered in `TRANSFER_SYNTAX_PARSERS`; happy-path tests parse short-form (PN) and long-form (OB) elements via `parseDicom + buildDicom`; element layout `group(2)+element(2)+VR(2)+[reserved(2)+length(4)]+value` verified at `Element.byteOffset`. |
| TS-03  | `1.2.840.10008.1.2.2` registered; happy-path tests parse short-form (PN) and long-form (OB) elements under BE; rawBytes preserved on-wire (BE-ordered); FFFE-under-BE termination test closes PITFALLS §2.3. |
| TOL-07 | `DICOM_ODD_LENGTH_VALUE_PADDED` emitted for odd-length SH ("12345" 5 bytes) under both TS-02 and TS-03; element parsed with declared length 5. |
| TOL-08 | `DICOM_VR_MISMATCH` emitted when on-wire VR (LO) differs from `Dictionary.lookup("00100010").vr[0]` (PN); on-wire VR trusted (Postel's Law). |

## Threat model coverage

All six Phase 2-04 threats from the plan threat model:

- **T-02-04-01** (Buffer over-read on truncated input): Every cursor read wrapped in try/catch in `_parseExplicit` and `parseSequence`; `RangeError` → `DicomParseError(INVALID_FILE_META)` with header offset + 16-byte snippet. Length over-reads bounds-checked before slice. Tests: truncated buffer (last 4 bytes chopped off) → typed throw; defined-length item with length=999 in 8-byte buffer → typed throw.
- **T-02-04-02** (Stack overflow via deeply-nested SQ): `NESTING_DEPTH_LIMIT = 64` enforced in `parseSequence` before push. Tests pre-set `ctx.nestingDepth` to 63 (allowed) and 64 (rejected) and assert behavior.
- **T-02-04-03** (CPU DoS via pathological CP-246): `tryParseUnAsSQ` reuses the same nesting cap; on inner-parse failure restores state without re-attempting. Test fixture: 16 bytes of random gibberish → `success: false`, no infinite loop.
- **T-02-04-04** (Tampering of FFFE under BE): All FFFE reads go through the endian-aware `ByteCursor.readUInt16At` / `readUInt16` / `readUInt32`. BE undefined-length SQ test verifies SeqDelim termination works end-to-end through `parseDicom`.
- **T-02-04-05** (Elevation via nonzero reserved bytes): `readExplicitElementHeader` reads reserved bytes for inspection only; emits `DICOM_NONZERO_RESERVED_BYTES` on non-zero. Length is read from the explicit 4-byte field regardless. Tested with hand-crafted buffer carrying reserved=`0x01 0x02`.
- **T-02-04-06** (Heap pressure via Buffer-slice retention): `ctx.copyValues === true` triggers `Buffer.from(slice)` for every value at all four sites (SQ rawBytes, encapsulated PD rawBytes, CP-246 fallback rawBytes, plain value rawBytes). Behavior consistent with `parseImplicitLE` (verified by 02-03's existing tests).

## Strict-mode coverage

This plan adds five actively-emittable warning codes to the strict-mode escalation surface:

- `DICOM_NONZERO_RESERVED_BYTES`
- `DICOM_VR_MISMATCH`
- `DICOM_ODD_LENGTH_VALUE_PADDED`
- `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`
- `DICOM_UN_PARSED_AS_SQ`
- `DICOM_EMPTY_ITEM_IN_SEQUENCE`

Plan 02-06 will sweep these (plus 02-03's three) through the strict-mode pair-test gate per CONTEXT D-36 / D-39. Plan 02-04 does NOT add per-call-site strict checks (D-11 chokepoint preserved); the existing `emit.ts` chokepoint handles escalation transparently.

## Acceptance gates (all pass)

- `pnpm typecheck` ✓ exits 0
- `pnpm lint` ✓ exits 0 (max-warnings=0)
- `pnpm test` ✓ 204/204 pass (17 test files; 33 new tests in 02-04: 11 sequence + 12 explicit-le + 10 explicit-be)
- `pnpm build` ✓ ESM 1016.38 KB, CJS 1016.72 KB, DTS 31.50 KB
- `node test/smoke/esm/index.mjs` ✓ green
- `node test/smoke/cjs/index.cjs` ✓ green
- Pre-commit hook (PHI scan) ✓ green on every task commit
- `! grep -RnE 'if \(ctx\.strict' src/parser/{explicit-le,explicit-be,sequence,element-header}.ts` ✓ (D-11 preserved)
- `grep -q 'parseImplicitLE\|parseExplicitLE\|parseExplicitBE' src/parser/transfer-syntax.ts` ✓ (3 of 4 strategies real)
- `grep -q 'parseDeflatedLE' src/parser/transfer-syntax.ts` ✓ (still imported; plan 02-05 replaces the body)

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Initial CP-246 failure path advanced cursor only past header → caused subsequent garbage bytes to throw INVALID_FILE_META, breaking the test that expects vr=UN element + clean parse.**

- **Found during:** Task 2 GREEN run.
- **Issue:** Initial implementation set `cursor.position = valueStart` on CP-246 fallback failure (matching the plan's "best-effort empty subarray" guidance literally). The next loop iteration then attempted to parse the random 16 bytes as another Explicit-VR header, which triggered a length-overflow throw. The test's expectation — that `parseDicom` returns successfully with `el.vr === "UN"` — was broken.
- **Fix:** Per CONTEXT D-30 ("On failure, restore VR=UN with raw bytes preserved") and the plan's "the conservative path", the CP-246-failure path now sets `cursor.position = buffer.length` and `rawBytes = buffer.subarray(headerStart, buffer.length)` — UN-undefined-length is malformed if not a CP-246 SQ; the safest interpretation is to consume the remainder as the UN value and stop iterating.
- **Files modified:** `src/parser/explicit-le.ts`
- **Commit:** included in `feat(02-04): implement parseExplicitLE` (3163e1b).

**2. [Rule 1 — Bug] Initial sequence.ts had a stale `ITEM_DELIM_TAG` constant.**

- **Found during:** Task 1 lint pass.
- **Issue:** I kept an `ITEM_DELIM_TAG` constant from the original plan skeleton, but the actual implementation routes ItemDelim consumption through the inner-strategy's `stopOnItemDelim` flag — `parseSequence` never reads the constant. ESLint flagged it as unused.
- **Fix:** Removed the constant; replaced with an explanatory comment. Also flipped `import { Buffer }` → `import type { Buffer }` (the file uses `Buffer` only as a type — values come through `ByteCursor`).
- **Files modified:** `src/parser/sequence.ts`, `src/parser/sequence.test.ts`
- **Commit:** included in `feat(02-04): implement parseSequence` (1382023).

**3. [Rule 1 — Bug] Spurious type-assertion `as Tag` on a string literal expression.**

- **Found during:** Task 2 lint pass after Task 2 GREEN.
- **Issue:** `readExplicitElementHeader` built the tag string via `${...}.toUpperCase() as Tag`. ESLint's `@typescript-eslint/no-unnecessary-type-assertion` rule (correctly) noticed the `as Tag` did nothing — `Tag` is a `string` alias, so the assertion is a no-op.
- **Fix:** Replaced with `const tag: Tag = \`${...}\`.toUpperCase()` — typed declaration instead of expression assertion.
- **Files modified:** `src/parser/element-header.ts`
- **Commit:** included in `feat(02-04): implement parseExplicitLE` (3163e1b).

### Auth gates

None.

### Architectural changes

None. The InnerParser contract widening (adding `endOffset` return + `stopOnItemDelim` opt) was anticipated by the plan and is the intended seam.

## Phase boundary preserved

- `Element` and `Dataset` still have only the 02-01 + 02-04 structural surface — no `.value` getter, no navigation methods. The new `cp246Promoted` field is `@internal` JSDoc-tagged and read only by Phase 3 (per plan).
- `vm: 1` is still the Phase 2 placeholder for plain elements; for SQ elements `vm: items.length` is set during parse (Phase 3 will recompute VM from VR + value layout per D-42).
- `parseDeflatedLE` in `transfer-syntax.ts` remains a stub. Plan 02-05 owns it.
- D-11 chokepoint preserved: zero per-call-site strict checks introduced; verified by grep.
- `LONG_FORM_VRS` and `BE_VR_STRIDE` constants from 02-01 are unchanged. Phase 5 serializer will consume both for symmetric serialization (D-44).
- `parseImplicitLE` external contract is unchanged for top-level callers (`parseDicom`); the new `endOffset` return + `stopOnItemDelim` opt are additive (existing callers pass `opts = {}`).

## Self-Check: PASSED

Created files exist:

- `src/parser/sequence.ts` ✓
- `src/parser/sequence.test.ts` ✓
- `src/parser/explicit-le.ts` ✓
- `src/parser/explicit-le.test.ts` ✓
- `src/parser/explicit-be.ts` ✓
- `src/parser/explicit-be.test.ts` ✓

Modified files updated:

- `src/parser/element-header.ts` ✓ (readExplicitElementHeader appended below 02-03's helpers)
- `src/parser/transfer-syntax.ts` ✓ (imports parseExplicitLE + parseExplicitBE; stubs removed; ParserStrategy widened)
- `src/parser/implicit-le.ts` ✓ (parseSequence stub replaced; InnerParser contract adopted)
- `src/dataset/element.ts` ✓ (cp246Promoted hint added)
- `test/helpers/build-dicom.ts` ✓ (BE encoder + SQ encoders + encapsulated-PD form)

Commits exist in `git log --all`:

- `86582e5` test(02-04): add failing tests for parseSequence + tryParseUnAsSQ ✓
- `1382023` feat(02-04): implement parseSequence + tryParseUnAsSQ; wire into parseImplicitLE ✓
- `1b5cfe0` test(02-04): add failing tests for parseExplicitLE; readExplicitElementHeader helper ✓
- `3163e1b` feat(02-04): implement parseExplicitLE; wire into transfer-syntax dispatch ✓
- `124827f` test(02-04): add failing tests for parseExplicitBE (TS-03) ✓
- `a39c282` feat(02-04): implement parseExplicitBE; replace stub in transfer-syntax dispatch ✓

## Next plan

**02-05** (Wave 4): Deflated Explicit VR LE parser (TS-04, `1.2.840.10008.1.2.1.99`).

- Replaces the `parseDeflatedLE` stub in `src/parser/transfer-syntax.ts`.
- `zlib.inflateRawSync` (NOT `inflateSync`) per CONTEXT D-26 (the canonical "silent-wrong" bug per PITFALLS §1.4).
- Delegates to `parseExplicitLE` over the inflated buffer.
- `position.deflated = true` on dataset warnings per D-27.
- Extends `test/helpers/build-dicom.ts`'s `encodeElement` switch to add the deflated-LE branch (compress an Explicit-LE body via `zlib.deflateRawSync`).

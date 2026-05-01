# Phase 2: Core Parser & Transfer Syntaxes - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Mode:** `/gsd-discuss-phase 2 --auto` — recommended defaults auto-selected; see `02-DISCUSSION-LOG.md` for the audit trail.

<domain>
## Phase Boundary

Phase 2 turns a DICOM Part 10 byte stream into a *structurally* parsed `Dataset` shell. It is the first phase that introduces a public runtime API beyond `Dictionary` (Phase 1). Concretely, this phase delivers:

1. **`parseDicom(buffer, options?)` entry point** that accepts `Buffer | Uint8Array | ArrayBuffer`, validates that input is DICOM Part 10, dispatches on Transfer Syntax UID, and returns a typed `Dataset` containing structural elements + File Meta + warnings.
2. **All four v1 transfer-syntax parsers**: Implicit VR LE, Explicit VR LE, Explicit VR BE (with correct AT/OW/OF/OD/OL byte-swap and OB-never-swap), and Deflated Explicit VR LE (using `zlib.inflateRawSync` for RFC 1951 raw deflate).
3. **A structural Dataset / Element / FileMeta / Sequence / Item shell** — Element exposes `tag`, `vr`, `vm`, `length`, `rawBytes`, `byteOffset`, `privateCreator?`. **No `.value` getter and no VR-aware decoders in Phase 2** — those are Phase 3.
4. **Stable, byte-offset-positional warnings registry** with 25+ Tier-2 codes (TOL-03 catalog) plus 4 Tier-3 fatal codes (`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`); single `emitWarning()` chokepoint that throws `DicomParseError` under `{ strict: true }`.
5. **Structural sequence parsing** including `(FFFE,E000)` / `(FFFE,E00D)` / `(FFFE,E0DD)` markers, undefined-length SQ, and **CP-246 detection** (UN with undefined length descended as Implicit VR LE SQ, emitting `DICOM_UN_PARSED_AS_SQ`). The high-level navigation methods (`ds.get('0040A730').items[0].get(...)`) are Phase 3.
6. **Strict-mode escalation** wired through the chokepoint — every Tier-2 code paired with a strict-mode-throws test.

**Out of phase scope (already decided in ROADMAP / REQUIREMENTS / prior decisions):**
- VR-aware *value decoding* (PN, DA/TM/DT, IS/DS, UI, US/UL/SS/SL/FL/FD/AT, text-VR charset decoding) — Phase 3.
- High-level Dataset navigation methods (`ds.get`, `ds.has`, `ds.elements()`, `ds.getAll(path)`, `ds.setElement`/`addElement`/`removeElement`/`addItem`/`removeItem`) — Phase 3.
- Tag-path accessors (`ds.get('0040A730/00080100')`) — Phase 4.
- Named helpers (`ds.patient`, `ds.study`, ...), pixel data exposure, `ds.image.frames()` — Phase 4.
- Serialization (`toBuffer`, `toJSON`, `prettyPrint`) and round-trip — Phase 5.
- Profile system, private-tag dictionaries, vendor profiles — Phase 6. `DICOM_PRIVATE_CREATOR_UNKNOWN` is *reserved* in Phase 2's WARNING_CODES registry but only fires in Phase 6.
- `anonymize()`, `validate()` — Phase 7.
- Full canonical fixture suite (`test/fixtures/canonical/`, `test/fixtures/vendor-quirks/`) — Phase 8. Phase 2 builds minimal fixtures *programmatically* in test code via a tiny `test/helpers/build-dicom.ts` builder (not a public export).
</domain>

<decisions>
## Implementation Decisions

### Public Parser Surface

- **D-01 Entry point overload (Phase 2 form):** `parseDicom(buffer: Buffer | Uint8Array | ArrayBuffer): Dataset` and `parseDicom(buffer, options: ParseOptions): Dataset`. The third overload accepting a `Profile` is **reserved for Phase 6** and not added now. Mirrors `@cosyte/hl7`'s overload pattern; the `discriminateOptionsOrProfile` helper is also deferred to Phase 6.
- **D-02 `ParseOptions` shape (Phase 2 only):**
  ```ts
  export interface ParseOptions {
    readonly strict?: boolean;
    readonly stripPreamble?: 'tolerate' | 'require';
    readonly onWarning?: OnWarningCallback;
    readonly copyValues?: boolean;
  }
  ```
  No `profile` field in Phase 2 (Phase 6 adds it). `exactOptionalPropertyTypes: true` rules apply (omit keys rather than passing `undefined`). All fields readonly.
- **D-03 `OnWarningCallback`:** `(warning: DicomParseWarning) => void`. Synchronous; invoked **after** the warning is pushed to `ds.warnings` (mirrors HL7 sibling's order — verified). Document this ordering in JSDoc.
- **D-04 Phase 2 public exports (delta from Phase 1's barrel):**
  - `parseDicom` (function)
  - `Dataset`, `Element`, `FileMeta`, `Sequence`, `Item` (classes — structural surface only; navigation methods land in Phase 3)
  - `WARNING_CODES`, `FATAL_CODES` (frozen const registries)
  - Types: `WarningCode`, `FatalCode`, `DicomParseWarning`, `DicomPosition`, `ParseOptions`, `OnWarningCallback`
  - `DicomParseError` (Error subclass)
  - **Not exported in Phase 2:** `Tag` (utility type defined inline; promoted to a class in Phase 3 if needed), VR namespace (Phase 3), `parsePath`/`resolvePath` (Phase 4), serialize/profile/anonymize/validate types (later phases).

### Module Layout (validated from `.planning/research/ARCHITECTURE.md`)

- **D-05 `src/parser/` files (Phase 2 ownership):**
  - `parser/index.ts` — `parseDicom()` entry, input normalization, dispatch to TS strategy
  - `parser/part10-header.ts` — preamble + `DICM` magic detection (`stripPreamble` semantics)
  - `parser/file-meta.ts` — File Meta group parser (hard-wired Explicit VR LE)
  - `parser/transfer-syntax.ts` — TS UID → strategy dispatch table
  - `parser/implicit-le.ts` — TS-01
  - `parser/explicit-le.ts` — TS-02 (long-form VR list, reserved-bytes assert)
  - `parser/explicit-be.ts` — TS-03 (per-VR endian-swap table; AT special case; OB never swap)
  - `parser/deflated-le.ts` — TS-04 (calls `explicit-le.ts` over inflated bytes)
  - `parser/byte-cursor.ts` — single endian-aware cursor abstraction shared by all 4 TS parsers
  - `parser/element-header.ts` — shared group/element/VR/length decode + odd-length / VR-mismatch / private-creator-no-creator detection
  - `parser/sequence.ts` — SQ + item / item-delim / seq-delim markers + CP-246 fallback
  - `parser/endian.ts` — per-VR stride table (`BE_VR_STRIDE`) shared with Phase 5 serializer
  - `parser/warnings.ts` — `WARNING_CODES` registry + factory functions + `DicomParseWarning` type + position/snippet helpers
  - `parser/errors.ts` — `FATAL_CODES` + `DicomParseError` class
  - `parser/emit.ts` — single `emitWarning(ctx, warning)` chokepoint (or co-located in `warnings.ts`; planner discretion)
  - `parser/types.ts` — `ParseOptions`, `OnWarningCallback`, `DicomPosition`, `ParseContext` (internal), `RawElement` (internal)
- **D-06 `src/dataset/` files (Phase 2 ownership — *structural shell only*):**
  - `dataset/dataset.ts` — `Dataset` class (constructor + structural fields: `fileMeta`, `warnings`, internal element map; iteration methods land in Phase 3)
  - `dataset/element.ts` — `Element` class (`tag`, `vr`, `vm`, `length`, `rawBytes`, `byteOffset`, `privateCreator?` — **no `.value` getter in Phase 2**)
  - `dataset/file-meta.ts` — `FileMeta` view object (FM-02 fields: `transferSyntaxUID`, `mediaStorageSopClassUID`, etc.)
  - `dataset/sequence.ts` — `Sequence` class (`items: readonly Item[]` and length only; navigation in Phase 3)
  - `dataset/item.ts` — `Item` class (a nested Dataset; structural)
  - `dataset/tag.ts` — Tag hex utilities (group/element split, validation, normalization). May export only internally in Phase 2.
  - **Phase 2 does NOT introduce `dataset/vr/`** — that is Phase 3's deliverable.

### Warnings & Errors Architecture

- **D-07 Warnings shape:**
  ```ts
  export interface DicomPosition {
    readonly byteOffset: number;
    /** True when offset is inside the File Meta group. */
    readonly fileMeta?: boolean;
    /** True when offset is into the inflated dataset buffer (Deflated TS only). */
    readonly deflated?: boolean;
    /** Tag chain for nested SQ items, e.g. ["0040A730", "0", "00080100"]. */
    readonly contextPath?: readonly string[];
  }
  export interface DicomParseWarning {
    readonly code: WarningCode;
    readonly message: string;
    readonly position: DicomPosition;
  }
  ```
  No `snippet` on warnings (memory-conscious — files routinely produce 50+ warnings); snippet appears only on `DicomParseError`.
- **D-08 `WARNING_CODES` registry (Phase 2 — Tier 2):** frozen `as const` object. Phase 2 emits or *reserves* every code listed in TOL-03. Reserved-but-not-emitted in Phase 2 (planner inserts them but their factory is unused until later phase): `DICOM_PRIVATE_CREATOR_UNKNOWN` (Phase 6), `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` (Phase 7). Reserved codes get a `// reserved by Phase {N} — not emitted in Phase 2` comment in source.
  - **Codes Phase 2 actively emits:** `DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISSING`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_VR_MISMATCH`, `DICOM_PRIVATE_TAG_NO_CREATOR`, `DICOM_GROUP_LENGTH_IN_DATASET`, `DICOM_NONZERO_RESERVED_BYTES`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_EMPTY_ITEM_IN_SEQUENCE`, `DICOM_PIXEL_DATA_LENGTH_MISMATCH`, `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`.
  - **VR-decode-time codes (deferred — declared in registry but emitted only when Phase 3 lazy decoders run):** `DICOM_BOM_IN_TEXT_VR`, `DICOM_TRAILING_NULL_IN_TEXT_VR`, `DICOM_NON_ASCII_IN_ASCII_VR`, `DICOM_UI_TRAILING_SPACE`, `DICOM_DA_LEGACY_FORMAT`, `DICOM_DT_NONSTANDARD_OFFSET`, `DICOM_IS_NONINTEGER_VALUE`. Phase 2 declares them in the registry so Phase 3 imports a stable union; Phase 2 tests do not exercise their emission.
  - **Phase 4-emitted (charset-dependent — declared but unused in Phase 2):** `DICOM_UNSUPPORTED_CHARSET`, `DICOM_CHARSET_AMBIGUOUS_SEPARATOR`.
- **D-09 `FATAL_CODES`:** frozen `as const` with exactly the four codes from PROJECT.md "Fatal errors only for unrecoverable structural corruption": `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`. No expansion in Phase 2.
- **D-10 `DicomParseError` shape:**
  ```ts
  export class DicomParseError extends Error {
    readonly code: FatalCode;
    readonly byteOffset: number;
    readonly snippet: string; // hex-string of up to 16 source bytes
    readonly contextPath?: readonly string[];
    // Constructor mirrors HL7 sibling's Hl7ParseError (verified at /home/nschatz/projects/cosyte/hl7-parser/src/parser/errors.ts).
  }
  ```
  Snippet length = 16 bytes max, rendered as space-separated lowercase hex (`"02 00 00 00 55 4c 04 00..."`).
- **D-11 Single `emitWarning` chokepoint:** every Tier-2 emission flows through one function with `(ctx: ParseContext, warning: DicomParseWarning) => void` signature. In strict mode, that function throws `DicomParseError(warning.code, ...)` instead of pushing to `ctx.warnings` and invoking `ctx.onWarning`. **No per-call-site `if (strict) throw` checks.** Mirrors HL7 sibling's `parser/warnings.ts` chokepoint pattern (verified).
- **D-12 Warning factory functions, one per code:** mirrors HL7 sibling — each Tier-2 code has a named factory (e.g., `missingPreamble(position)`, `fileMetaGroupLengthMismatch(position, declared, actual)`) that builds the typed `DicomParseWarning`. Factories carry the human-readable message template + the typed payload shape; consumers narrow on `.code`. The 25-code list is bounded; the factory-per-code pattern scales.

### Input Normalization & Preamble

- **D-13 Input normalization:** `parseDicom` accepts `Buffer | Uint8Array | ArrayBuffer` (PARSE-04). Internal helper `normalizeInput(input): Buffer`:
  - `Buffer` → pass through.
  - `Uint8Array` → `Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)` (zero-copy view).
  - `ArrayBuffer` → `Buffer.from(ab)` (zero-copy view).
  - Empty input → throw `DicomParseError(EMPTY_INPUT)`. Check **twice** (once on raw input, once after normalize, mirroring HL7 sibling's two-stage empty check).
- **D-14 Preamble handling (`stripPreamble` tri-state):**
  - Default `'tolerate'`: if `DICM` magic at offset 128 → strip 128-byte preamble + 4-byte magic and continue. If absent → emit `DICOM_MISSING_PREAMBLE` and try to start at offset 0; if neither preamble nor a plausible File Meta group at offset 0 is detectable, throw `DicomParseError(NOT_DICOM_PART_10)`.
  - `'require'`: missing preamble throws `DicomParseError(NOT_DICOM_PART_10)` (not `INVALID_FILE_META` — the file is not Part 10).
  - `{ strict: true }` overrides the warning to a throw (chokepoint behavior). `stripPreamble: 'require'` is therefore equivalent to `strict: true` for this one code; both options exist for clarity (caller-facing names match the deviation).
- **D-15 NOT_DICOM_PART_10 detection heuristic:** input that has neither (a) `DICM` magic at offset 128 nor (b) a leading `(0002,0000)` File Meta Group Length element in valid Explicit VR LE form at offset 0 (UL VR, 4-byte value) is fatal `NOT_DICOM_PART_10`. The heuristic is byte-level — no semantic validation of Transfer Syntax UID (which is `INVALID_FILE_META` instead).

### Buffer Slicing Strategy

- **D-16 Zero-copy default + opt-out:** Element `rawBytes` is a `Buffer.subarray()` view into the source buffer (no copy). This pins the source ArrayBuffer in memory until every Element is GC'd — documented in `parseDicom` JSDoc. `{ copyValues: true }` opts into `Buffer.from(slice)` per element so the source buffer can be released. Implemented in Phase 2 (cheap to add now, painful to retrofit). MODEL-03 explicitly requires this option.

### File Meta Parser

- **D-17 File Meta is hard-wired Explicit VR LE,** independent of the dataset's Transfer Syntax UID (FM-01). Implemented in `parser/file-meta.ts` with no dispatcher branching on TS.
- **D-18 `(0002,0000)` File Meta Group Length handling:**
  - **Present:** parse it first, treat its value as a hint for how many bytes belong to the File Meta group, then read elements until the cursor advances by exactly that many bytes. If actual ≠ declared, emit `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` and trust the *actual* (parse forward until first non-`(0002,xxxx)` group is encountered).
  - **Absent:** emit `DICOM_FILE_META_GROUP_LENGTH_MISSING` and parse forward until first non-`(0002,xxxx)` group.
- **D-19 Required File Meta elements parser-blocking subset:** Phase 2 enforces only the subset that *blocks dispatch*: `(0002,0010)` Transfer Syntax UID. Missing → fatal `INVALID_FILE_META` regardless of mode (cannot pick a parser). The full FM-03 / STRICT-03 list (File Meta Information Version, Media Storage SOP Class/Instance UID, Implementation Class UID) is **deferred to Phase 7's `validate()`**; Phase 2 parses files that are missing those without throwing. `{ strict: true }` does NOT escalate "missing optional FM Type 1 element" to a fatal in Phase 2 (those are STRICT-03's job). Document this division of labor in `02-DISCUSSION-LOG.md`.

### Transfer-Syntax Dispatch

- **D-20 Dispatch table:** const `TRANSFER_SYNTAX_PARSERS: Readonly<Record<string, ParserStrategy>>` with exactly four entries:
  - `'1.2.840.10008.1.2'` → Implicit VR LE
  - `'1.2.840.10008.1.2.1'` → Explicit VR LE
  - `'1.2.840.10008.1.2.2'` → Explicit VR BE
  - `'1.2.840.10008.1.2.1.99'` → Deflated Explicit VR LE
  Any other UID → fatal `DicomParseError(UNSUPPORTED_TRANSFER_SYNTAX)` with the UID in the message and the human-readable name (if known via `Dictionary.uid`) in the snippet field.

### Implicit VR LE — VR Inference

- **D-21 Implicit VR fallback rules** (resolved during element-header parsing, against `Dictionary.lookup(tag)`):
  1. **Standard tag with single VR in dict** → use it.
  2. **Standard tag with multi-VR entry** → use the first array entry. Document this in the parser's JSDoc; the multi-VR ambiguity is a known DICOM data-dictionary quirk.
  3. **Repeating-group family** (`(50xx,xxxx)`, `(60xx,xxxx)`, `(7Fxx,xxxx)`, `(1000,xxxX)`, etc. — see `Dictionary` `repeatingGroup` flag) → resolve via the family entry. The Phase 1 generated dictionary already exposes these via the `repeatingGroup` flag; Phase 2 implements the family-match resolver.
  4. **Private tag (odd group)** → fall back to `VR=UN`. If no creator is registered in the dataset for the element's block, emit `DICOM_PRIVATE_TAG_NO_CREATOR`. If creator registered but no VR override (Phase 2 has no profiles, so this is always the case) → still `VR=UN`. Phase 6 adds profile-supplied VR overrides; Phase 2 emits `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` to flag the case.
  5. **Unknown standard tag** (tag not in dict at all — possible for retired or future tags) → fall back to `VR=UN`, no warning (this is allowed by the standard).

### Explicit VR LE / BE

- **D-22 Long-form VR set:** single source `LONG_FORM_VRS = new Set<VR>(['OB','OW','OF','OD','OL','SQ','UT','UN','UC','UR']) as const`. Defined in `parser/element-header.ts`; **internally exported** (not in public surface) for Phase 5 serializer reuse. Long-form layout: 2-byte VR + 2 reserved bytes (`0x00 0x00`) + 4-byte length. Non-zero reserved bytes emit `DICOM_NONZERO_RESERVED_BYTES`.
- **D-23 BE per-VR endian-swap table:**
  ```ts
  // parser/endian.ts (internally exported for Phase 5 serializer)
  export const BE_VR_STRIDE: Readonly<Record<VR, 0 | 2 | 4 | 8>> = {
    AT: 2, US: 2, SS: 2, OW: 2,
    UL: 4, SL: 4, FL: 4, OF: 4, OL: 4,
    FD: 8, OD: 8,
    // 0 = no swap (byte stream / ASCII / spec-defined)
    OB: 0, UN: 0, AE: 0, AS: 0, CS: 0, DA: 0, DS: 0, DT: 0,
    IS: 0, LO: 0, LT: 0, PN: 0, SH: 0, ST: 0, TM: 0, UC: 0,
    UI: 0, UR: 0, UT: 0, SQ: 0,
    // 64-bit additions
    OV: 8, SV: 8, UV: 8,
  };
  ```
  **AT special case:** stride=2 + count=2 (group, then element — two independent 2-byte swaps, NEVER one 4-byte swap). Multi-valued AT has stride=4 and count=N×2. Document explicitly in the per-VR swap function's JSDoc.
- **D-24 OB / UN are byte-streams and are never swapped under any TS,** including Explicit VR BE. This is ENFORCED in `BE_VR_STRIDE` (both = 0); call this out in the test suite for both VRs.
- **D-25 FFFE item-marker reads route through the same endian-aware element-header primitive** as all other reads — no special-casing of the `FFFE` group. This is the canonical BE-parser bug per `.planning/research/PITFALLS.md` §2.3; tested explicitly with a BE-encoded SQ fixture.

### Deflated Explicit VR LE

- **D-26 `zlib.inflateRawSync` (RFC 1951 raw deflate), NOT `zlib.inflateSync`:** the silent-wrong bug per PROJECT.md Key Decision and `.planning/research/PITFALLS.md` §1.4. Implemented in `parser/deflated-le.ts`:
  1. Parse File Meta uncompressed (it is always Explicit VR LE).
  2. Slice from `fileMetaEndOffset` to end-of-buffer.
  3. Call `zlib.inflateRawSync(slice)` to get the inflated dataset buffer.
  4. Delegate to `parser/explicit-le.ts` over the inflated buffer.
- **D-27 Position byte offsets in deflated TS** are reported relative to the **inflated** buffer for dataset elements (with `position.deflated = true`); File Meta warnings carry `position.fileMeta = true` and on-disk offsets. Document this in the `DicomPosition.deflated` JSDoc — consumers that want on-disk offsets for deflated data must currently treat them as opaque (acceptable v1 limitation, since DCMTK and pydicom report deflated-buffer offsets too).

### Sequence (SQ) Parsing

- **D-28 Encoding-context stack:** the parser tracks a stack of `'Root' | 'SqItem' | 'EncapsulatedPixelData'` contexts. The three FFFE marker semantics dispatch on the stack top — addresses `.planning/research/PITFALLS.md` §2.1 ("Item / delimiter marker scoping"):
  - `(FFFE,E000)` Item → starts a sequence item under `SqItem` parent, or a pixel-data fragment under `EncapsulatedPixelData` parent.
  - `(FFFE,E00D)` Item Delimitation → ends an undefined-length SQ item (only inside `SqItem`).
  - `(FFFE,E0DD)` Sequence Delimitation → ends an undefined-length SQ or encapsulated pixel-data sequence.
  - Empty item (`(FFFE,E000) length=0`) tolerated; emit `DICOM_EMPTY_ITEM_IN_SEQUENCE`.
- **D-29 Undefined-length SQ in Explicit VR:** parse correctly; emit `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` (Tier 2 — strict throws).
- **D-30 CP-246 detection (in Phase 2 — though SQ-05 is a Phase 3 REQ-ID, the parsing happens here):** when `VR=UN` and `length=0xFFFFFFFF`, attempt SQ descent using **Implicit VR LE inner encoding** (the canonical case is private SQ transcoded Implicit→Explicit that lost its VR). On successful parse, promote element to `VR=SQ` and emit `DICOM_UN_PARSED_AS_SQ`. On failure (descent reads past buffer / encounters invalid headers), restore `VR=UN` with raw bytes preserved and DO NOT emit a warning. Detection only fires under Explicit VR transfer syntaxes (Implicit VR LE has no on-wire VR, so UN cannot be encoded explicitly there). **The high-level `ds.get(...).items[0].get(...)` navigation API is Phase 3** — Phase 2 only delivers the structural descent.

### Encapsulated Pixel Data (Structural Recognition)

- **D-31 Encapsulated pixel data is detected at parse time but NOT exposed via a high-level helper in Phase 2:** when a `(7FE0,0010)` element has `VR=OB` and `length=0xFFFFFFFF` (undefined), the parser pushes `EncapsulatedPixelData` onto the encoding-context stack and consumes fragments + Basic Offset Table per `.planning/research/PITFALLS.md` §9.2. The structural fragment metadata is captured in the Element's internal state. **PIXEL-01/02 access methods (`ds.pixelData.fragments`, `ds.pixelData.basicOffsetTable`) are Phase 4** — Phase 2 only recognizes and structurally records the encapsulation. Document this division of labor.
- **D-32 Phase 2 emits `DICOM_PIXEL_DATA_LENGTH_MISMATCH`** when a defined-length `(7FE0,0010)` element has `length ≠ rows × columns × samplesPerPixel × bitsAllocated/8 × numberOfFrames` (where the computed quantity is well-defined) — this requires reading other elements first, so the warning emits **after** the structural pass completes during a small post-pass. The post-pass is internal-only.

### Private-Tag Creator Tracking

- **D-33 Creator stack tracking (Phase 2):** as elements are parsed in order, `creators[gggg][XX] = creatorString` is built up from `(gggg,00XX)` Private Creator elements (where `0x10 ≤ XX ≤ 0xFF`, VR=LO). For any subsequent element `(gggg,EEFF)` with `0x10 ≤ EE ≤ 0xFF`, look up `creators[gggg][EE]`. The block-reservation mechanic (creator at `(gggg,00XX)` reserves `(gggg,XX00)–(gggg,XXFF)` — element `(gggg,EEFF)` is owned by creator `creators[gggg][EE]`) is the canonical bug per `.planning/research/PITFALLS.md` §7.1 — Phase 2 implements it correctly with a fixture exercising the off-by-0x1000 case.
- **D-34 `Element.privateCreator?: string`** is populated from the resolved creator; absent on standard tags. No creator → `DICOM_PRIVATE_TAG_NO_CREATOR` (TOL-09) emitted; element still parsed with `VR=UN` and rawBytes accessible.

### Strict Mode

- **D-35 Strict-mode wiring:** single chokepoint in `parser/emit.ts` (or co-located in `warnings.ts` — planner discretion per D-05). When `ctx.strict === true`, every Tier-2 warning becomes a thrown `DicomParseError(warning.code, warning.message, position.byteOffset, snippet, position.contextPath)`. Tier-3 fatals throw in both modes.
- **D-36 Strict-mode test coverage gate (Phase 2 — local, not Phase 8):** every Tier-2 code that Phase 2 *actively emits* (the D-08 active-emit list) MUST have at least two tests: lenient-mode emits the warning + parsing continues; strict-mode throws `DicomParseError` with matching code. Phase 2 CI failure if any code lacks the pair. The general ≥90% coverage gate is still Phase 8 — this is a code-level gate, not a coverage gate.

### Test Strategy (Phase 2-Local)

- **D-37 Programmatic fixture builder:** `test/helpers/build-dicom.ts` ships an internal builder that emits a minimal Part 10 Buffer for a given TS UID + element list. NOT exported as public API. Phase 5 serializer subsumes the production version of this; Phase 2 needs the builder NOW for test independence.
- **D-38 Real fixtures deferred to Phase 8:** Phase 2 does NOT land curated `test/fixtures/canonical/` or `test/fixtures/vendor-quirks/` files. Those are Phase 8 deliverables (TEST-02, TEST-05). Phase 2 uses programmatic builders for every test case; the PHI-scan CI hook from Phase 1 still gates any accidental real fixture commits.
- **D-39 Test layout:** unit tests live next to source (`*.test.ts` siblings — established by Phase 1 D-21). New: `test/integration/parser-strict-mode.test.ts` for the strict-mode gate sweep across all actively-emitted Tier-2 codes (D-36).

### Plan Decomposition

- **D-40 Plan structure (mirrors ROADMAP.md §"Phase 2" plan suggestions, with sequencing):**
  1. **02-01 — Warnings/errors registry + dataset shell + parser scaffolding.** Foundation. Creates `parser/{warnings,errors,emit,types,byte-cursor,endian}.ts` + `dataset/{dataset,element,file-meta,sequence,item,tag}.ts`. Exposes only structural fields. No actual parsing yet.
  2. **02-02 — Part 10 header + File Meta parser + TS dispatch.** Creates `parser/{part10-header,file-meta,transfer-syntax}.ts` + entry `parser/index.ts`. End of this plan: a buffer with valid File Meta and any one TS can be sniffed; dispatch returns NOT_IMPLEMENTED for the TS branches not yet written.
  3. **02-03 — Implicit VR LE parser.** Creates `parser/implicit-le.ts` + dictionary-driven VR fallback (D-21).
  4. **02-04 — Explicit VR LE + Explicit VR BE parser.** Creates `parser/{explicit-le,explicit-be,sequence,element-header}.ts`. Includes long-form VR list, reserved-bytes assert, AT/OW endian rules, sequence parser, and CP-246 fallback.
  5. **02-05 — Deflated Explicit VR LE.** Creates `parser/deflated-le.ts`. Depends on plan 02-04 (delegates to explicit-le over inflated bytes). `zlib.inflateRawSync` only.
  6. **02-06 — Strict-mode escalation wiring + final acceptance run.** Verifies the chokepoint flips every Tier-2 to a throw under `{ strict: true }`; D-36 pair-test gate; final smoke run + integration test sweep + coverage report (informational, not gated).
- **D-41 Parallelization within Phase 2:** plans 02-01, 02-02 are serial (foundation). After 02-02, plan 02-03 (`implicit-le.ts`) and plan 02-04 (`explicit-le.ts` + `explicit-be.ts` + `sequence.ts` + `element-header.ts`) can run in parallel — disjoint files. Plan 02-05 depends on plan 02-04. Plan 02-06 is the capstone, runs serially after all four parsers.

### Layout Decisions Carried Forward to Later Phases

- **D-42 Phase 3 inherits and extends:**
  - `Element.value` getter (lazy, memoized) added in Phase 3.
  - `Dataset.get` / `has` / `elements` / `getAll` / `setElement` / `addElement` / `removeElement` / `addItem` / `removeItem` added in Phase 3 (copy-on-write).
  - `dataset/vr/` subtree (PN, DA/TM/DT, IS/DS, UI, binary numerics, text) added in Phase 3.
  - `Sequence.items[N].get(...)` navigation surface added in Phase 3.
  - The VR-decode-time warning codes (`DICOM_BOM_IN_TEXT_VR`, `DICOM_TRAILING_NULL_IN_TEXT_VR`, `DICOM_UI_TRAILING_SPACE`, `DICOM_DA_LEGACY_FORMAT`, `DICOM_DT_NONSTANDARD_OFFSET`, `DICOM_IS_NONINTEGER_VALUE`, `DICOM_NON_ASCII_IN_ASCII_VR`) start being emitted in Phase 3.
- **D-43 Phase 4 inherits and extends:**
  - `dataset.pixelData` accessor + `EncapsulatedPixelData` shape (PIXEL-01/02) — Phase 2 already captured the structural fragment metadata; Phase 4 surfaces it.
  - Charset-aware text-VR decoding via `(0008,0005)` resolution; the `DICOM_UNSUPPORTED_CHARSET` and `DICOM_CHARSET_AMBIGUOUS_SEPARATOR` codes start being emitted in Phase 4.
- **D-44 Phase 5 imports `BE_VR_STRIDE`, `LONG_FORM_VRS`, and the byte-cursor / endian primitives from Phase 2** for symmetric serializer behavior. Phase 5 must NOT redefine these — schema-breaking changes here cascade.
- **D-45 Phase 6 adds `Profile` overload to `parseDicom`** + the `discriminateOptionsOrProfile` helper; activates `DICOM_PRIVATE_CREATOR_UNKNOWN` emission. Schema-stability for Phase 6: the `ParseContext` (internal) must already carry an optional `profile?: Profile` field in Phase 2's type — even though Phase 2 never sets it. Document the field.
- **D-46 Phase 7 imports `WARNING_CODES`, `FATAL_CODES`, `DicomParseError`** for the strict-mode/`validate()` integration — schema-stable from Phase 2.

### Claude's Discretion

- Exact internal representation of the element map inside `Dataset` (Map vs sorted-array vs object) — planner picks based on benchmarks; consumers see only the structural surface.
- Whether `parser/emit.ts` is a separate file or co-located inside `parser/warnings.ts` (D-05 / D-11).
- Internal naming of warning factory functions (camelCase, predicate-style, etc.) — planner discretion as long as one factory exists per actively-emitted code (D-12).
- Whether `dataset/tag.ts` exposes a `Tag` class or just utility functions in Phase 2 — defer to Phase 3 if a class isn't needed for structural parsing.
- The `ParseContext` (internal) shape: what fields it carries beyond `strict`, `onWarning`, `warnings`, `buffer`, `position`, `creators`, `encodingContextStack`. Add as needed; not a public surface.

### Folded Todos

None — auto-mode todo cross-reference returned no matches against Phase 2 scope (`gsd-todo` parking lot is empty per Phase 1 CONTEXT.md and STATE.md).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before acting on this phase.**

### Project planning (this repo)
- `.planning/PROJECT.md` — vision, constraints, key decisions. Specifically: "Lenient parsing default", "Warnings carry stable string codes + byte-offset positional context", "Fatal errors only for unrecoverable structural corruption", "Buffer-first values", "Postel's Law", "Deflated Explicit VR LE uses `zlib.inflateRawSync`".
- `.planning/REQUIREMENTS.md` — REQ-IDs assigned to Phase 2: PARSE-01..06, FM-01..04, TS-01..04, TOL-01..10. The TOL-03 warning-code catalog is the authoritative list of every code Phase 2 declares (and the subset Phase 2 emits per D-08).
- `.planning/ROADMAP.md` §"Phase 2: Core Parser & Transfer Syntaxes" — goal + success criteria + plan suggestions + parallelization notes. **Locked-by-roadmap:** Phase 2 depends on Phase 1; the four v1 transfer syntaxes; warnings/errors/dataset-shell as the first plan; strict-mode escalation as the capstone plan.
- `.planning/STATE.md` — project memory; Phase 1 verified complete with 13 REQ-IDs and 27 CONTEXT decisions honored.
- `CLAUDE.md` (repo root) — engineering guardrails: no `any`, no unjustified `as` casts, JSDoc + `@example` on every public export, no `console.*`, immutability, Buffer-first API, throw typed errors.

### Phase 1 outputs (Phase 2 consumes)
- `.planning/phases/01-project-foundation/01-CONTEXT.md` — Phase 1 decisions D-01..D-27 (toolchain, Dictionary public surface, generated-TS pattern). **D-10 and D-26 lock the public Dictionary API that Phase 2's Implicit VR fallback (D-21) consumes.** D-27 explicitly states: "Phase 1 does NOT introduce a Dataset type, an Element type, parser entry points..." → Phase 2 introduces all of these.
- `.planning/phases/01-project-foundation/01-VERIFICATION.md` — confirms 33 unit tests passing, Innolitics dictionary at pinned SHA, Annex E generator producing 617 entries, byte-identical regen verified, ESM/CJS smoke harness green.
- `src/index.ts` — current public barrel (`VERSION` + `Dictionary` namespace). Phase 2 extends with parser surface per D-04.
- `src/dictionary/types.ts` — `DictionaryEntry`, `Tag`, `VR`, `UidEntry` interfaces. Phase 2 imports `VR` and `DictionaryEntry`.
- `src/dictionary/index.ts` — `Dictionary.lookup`, `Dictionary.byKeyword`, `Dictionary.uid`. Phase 2 calls `lookup(tag)` for Implicit VR fallback (D-21) and `uid(tsUid)` for human-readable TS names in error messages (D-20).
- `src/dictionary/generated/{tags,keywords,uids,annex-e}.ts` — already-frozen artifacts; Phase 2 imports nothing from `annex-e.ts` (Phase 7's input).

### Research (already locked, do not re-research)
- `.planning/research/SUMMARY.md` — overall research synthesis. Resolved questions Q1 (runtime deps target 0–1, ceiling ≤ 3 — Phase 2 ships zero), Q2 (Node 18.18 floor — Phase 2 uses `node:zlib` and `node:buffer` only).
- `.planning/research/STACK.md` — Vitest 3.x / ESLint 9.x / TS 5.9.x pinning rationale (already enforced by Phase 1). Critical Phase 2 callouts: `zlib.inflateRawSync` for RFC 1951 raw deflate (NOT `inflateSync`); zero-dep viable; `iconv-lite` is a Phase 4 conditional, not Phase 2.
- `.planning/research/ARCHITECTURE.md` §1 (module decomposition with `src/parser/` + `src/dataset/` + `src/charset/` + `src/path/` + `src/pixel/` separation), §2 (parser pipeline with single `emitWarning` chokepoint), §3 (nested `Dataset` model — pydicom/fo-dicom shape, NOT dicom-parser byte-offset model and NOT dcmjs naturalized JSON), §4 (lazy VR with eager structural pass — Phase 3 implements lazy decoders; Phase 2 implements the eager structural pass), §5 (Phase 5 needs symmetric VR encoder table — Phase 2 ships shared primitives for it), §6 (`src/index.ts` barrel — Phase 2 adds the parser/dataset/error/warning exports listed in D-04).
- `.planning/research/PITFALLS.md` §1.1 (Implicit VR for private tags), §1.2 (Explicit VR long-form set including OD/OL/UC/UR), §1.3 (BE byte-swap — AT special case + OB never swap), §1.4 (Deflated TS = `zlib.inflateRawSync`, NOT `inflateSync`), §2.1 (item/delimiter marker scoping with encoding-context stack), §2.2 (CP-246 UN-as-SQ), §2.3 (FFFE under BE), §4.5 (AT byte-pair semantics), §4.6 (OB vs OW endian), §5.1 (File Meta always Explicit VR LE), §5.2 (group length missing/mismatch handling), §6.1 (odd-length tolerance), §7.1 (Private Creator block reservation rule).
- `.planning/research/FEATURES.md` — feature gap matrix; informs warning-code catalog completeness.

### External (read at research time, not committed)
- DICOM Standard PS3.5 — `https://dicom.nema.org/medical/dicom/current/output/html/part05.html`. Specifically:
  - §6.2 — Value Representation definitions (the 33 standard VRs + the 64-bit additions OV/SV/UV).
  - §7 — Data Set encoding (element header, length encoding, undefined length, VR/length distinction).
  - §7.5 — Item Encoding Rules (FFFE markers, sequence semantics, encapsulated pixel data).
  - §7.8 — Private Data Elements (Private Creator block reservation rule — the off-by-0x1000 trap).
  - §A.4 — Encapsulated Pixel Data Transfer Syntaxes.
  - §A.5 — Deflated Image Transfer Syntax (raw deflate per RFC 1951, NOT zlib-wrapped).
- DICOM Standard PS3.10 — `https://dicom.nema.org/medical/dicom/current/output/html/part10.html` — Part 10 file format (preamble, DICM magic, File Meta Information).
- DICOM Correction Proposal CP-246 — UN with undefined length parsed as SQ. Reference: `https://www.dicomstandard.org/cps/` (search "CP 246"); fallback discussion at `https://github.com/pydicom/pydicom/issues/1312`.
- Node.js `zlib` docs — `https://nodejs.org/api/zlib.html#zlibinflaterawsyncbuffer-options` (vs `zlib.inflateSync`).
- Node.js `Buffer` docs — `https://nodejs.org/api/buffer.html#static-method-bufferfromarraybuffer-byteoffset-length` (zero-copy `Uint8Array`/`ArrayBuffer` views).

### Sibling reference (read for pattern parity)
- `/home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts` — `parseHL7` overload pattern, `discriminateOptionsOrProfile` helper, dual EMPTY-INPUT check ordering, profile threading via `ParseContext`. Phase 2's `parseDicom` mirrors structure (D-01, D-13, D-14).
- `/home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts` — `WARNING_CODES` frozen registry + factory-per-code pattern + `Hl7ParseWarning` shape. Phase 2's `parser/warnings.ts` mirrors this exactly (D-08, D-12).
- `/home/nschatz/projects/cosyte/hl7-parser/src/parser/errors.ts` — `Hl7ParseError` class shape with `code`, `position`, `snippet`. Phase 2's `DicomParseError` mirrors (D-10).
- `/home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts` — `Hl7Position`, `OnWarningCallback`, `ParseOptions`, internal `RawSegment` shape. Phase 2's analogous types (D-02, D-03, D-07).

</canonical_refs>

<code_context>
## Existing Code Insights

**Codebase state (post-Phase 1):**
- `src/index.ts` — exports `VERSION` + `Dictionary` namespace. Phase 2 extends.
- `src/version.ts` — package version constant.
- `src/dictionary/{index.ts, types.ts, generated/{tags,keywords,uids,annex-e}.ts, index.test.ts}` — frozen Phase 1 artifacts. **Read-only for Phase 2.**
- `package.json` exports map declares `import`, `require`, `types` — Phase 2 needs to add `parser/` subpath if planner chooses subpath exports (D-05 leaves this open; default is to keep all under `@cosyte/dicom` root export).
- `tsup.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`, `.github/workflows/{ci,dictionary-regen,publish}.yml`, `.husky/pre-commit`, `scripts/{generate-dictionary,generate-annex-e,phi-scan,smoke}.ts`, `vendor/innolitics/<sha>/{attributes.json,LICENSE,README.md}`, `test/smoke/{esm/index.mjs,cjs/index.cjs}` — all already in place from Phase 1.

### Reusable Assets (this repo, post-Phase 1)
- **`Dictionary.lookup(tag)`** (in `src/dictionary/index.ts`) — Implicit VR LE parser calls this to resolve VR from tag (D-21).
- **`Dictionary.uid(tsUid)`** — used to render human-readable TS names in `UNSUPPORTED_TRANSFER_SYNTAX` error messages (D-20).
- **`DictionaryEntry`, `VR`, `Tag` types** (in `src/dictionary/types.ts`) — imported by Phase 2's `parser/element-header.ts` and `dataset/element.ts`.
- **`DictionaryEntry.repeatingGroup` flag** — Phase 2's family-match resolver checks this for `(50xx,xxxx)` curves and `(60xx,xxxx)` overlays (D-21 case 3).

### Reusable Assets (sibling — `/home/nschatz/projects/cosyte/hl7-parser/`)
- **`src/parser/warnings.ts`** — pattern template for Phase 2's `parser/warnings.ts`: frozen `WARNING_CODES`, `WarningCode` discriminant union from `as const`, named factory per code, `OnWarningCallback` type. Mirror exactly (D-08, D-12).
- **`src/parser/errors.ts`** — pattern template for `DicomParseError` (D-10).
- **`src/parser/types.ts`** — pattern template for `ParseOptions`, `OnWarningCallback`, `Position` (D-02, D-07).
- **`src/parser/index.ts`** — pattern template for the `parseDicom` entry: input normalization, dual EMPTY-INPUT check, single chokepoint, the (deferred-to-Phase-6) `discriminateOptionsOrProfile` helper.
- **`src/profiles/default.ts`** — pattern template for the (Phase-6) default-profile registry. Phase 2 prepares the integration seam by carrying `profile?: Profile` in internal `ParseContext` (D-45) but does not implement.

### Established Patterns (project-level — already in CLAUDE.md and Phase 1)
- No `any`; no unjustified `as` casts; use `unknown` and narrow.
- `noUncheckedIndexedAccess: true` — Phase 2 must handle `undefined` returns from `KEYWORDS[k]`, `creators[gggg][XX]`, etc.
- JSDoc with `@example` on every public export. The `parseDicom` JSDoc must include a 4–5-line working example.
- Buffer-first for binary; charset-aware string decoding deferred to Phase 4.
- Stable warning codes with byte-offset positional context — Phase 2 *establishes* this pattern in `parser/warnings.ts` for the rest of the codebase to follow.
- Postel's Law — parser is liberal; Phase 5 serializer is conservative.
- Coverage target ≥ 90% on `src/parser/`, `src/dataset/` — Phase 1 sets up the gate config; Phase 8 enforces. Phase 2 should keep coverage above 90% locally as it ships, but no CI gate.

### Integration Points (forward-looking)
- Phase 3 imports `Dataset`, `Element`, `Sequence`, `Item`, `FileMeta` and extends them with VR-aware `.value` + navigation methods — schema-breaking changes after Phase 2 ships will cascade through Phases 3–8 (D-42).
- Phase 4 imports the `EncapsulatedPixelData` structural metadata captured in Phase 2's parser to build `ds.pixelData` and `ds.image.frames()` accessors (D-43).
- Phase 5 imports `BE_VR_STRIDE`, `LONG_FORM_VRS`, byte-cursor / endian primitives from Phase 2 for symmetric serializer behavior (D-44).
- Phase 6 adds the `parseDicom(buffer, profile)` overload + threads `profile?: Profile` through the internal `ParseContext` Phase 2 already declares (D-45).
- Phase 7 imports `WARNING_CODES`, `FATAL_CODES`, `DicomParseError` for strict-mode + `validate()` integration (D-46).
- Phase 8 imports nothing new but enforces ≥ 90% coverage on Phase 2's `src/parser/` and `src/dataset/`.

</code_context>

<specifics>
## Specific Ideas

- `parser/warnings.ts` exports a `WARNING_CODES` const matching the TOL-03 catalog ordering verbatim (alphabetical within prefix groups makes the union deterministic for downstream switch statements).
- `DicomParseError` message format: `[${code}] ${message} (offset=${byteOffset})` — mirrors HL7 sibling exactly. The contextPath, when present, is appended as `… in ${contextPath.join('/')}`.
- The dual EMPTY-INPUT check (D-13) handles the corner case where `ArrayBuffer(0)` byte-coerces to a 0-length `Buffer` only after normalization — without the second check, the empty input would slip past as an undefined-deref further down.
- `parser/index.ts` JSDoc `@example` should demonstrate **all three** input variants (`Buffer`, `Uint8Array`, `ArrayBuffer`) + show `onWarning` callback usage + show `{ strict: true }` throwing path.
- Test fixtures built programmatically in Phase 2 should cover the exact cases in success criterion #1 of ROADMAP.md Phase 2: long-form VR (`OB OW OF OD OL SQ UT UN UC UR`), reserved-bytes-zero assertion, BE AT-byte-swap, BE OB-no-swap, Deflated TS using `inflateRawSync`. Each is a one-shot programmatic Buffer.
- The CP-246 fallback test fixture should be: a private SQ encoded Implicit VR LE, then transcoded to Explicit VR LE so the SQ becomes UN-undefined-length; parser must auto-descend, emit `DICOM_UN_PARSED_AS_SQ`, expose nested elements through Phase 3's API later (Phase 2 verifies the descent worked by checking that the `Element` was promoted to `VR=SQ` and `items.length > 0`).
- `parser/byte-cursor.ts` should NOT use Node `DataView` — `Buffer.readUInt16LE` / `readUInt32LE` / `readUInt16BE` etc. are faster and the standard idiom for the project. Sibling HL7 doesn't have this concern (string-only); Phase 2 establishes it.

</specifics>

<deferred>
## Deferred Ideas

- **Profile-aware private-tag VR override at parse time** — surfaced during private-creator-stack discussion; Phase 6 deliverable. Phase 2 emits `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` to flag the case so Phase 6 can wire VR overrides cleanly. (Aligns with PROJECT.md key decision and `.planning/research/PITFALLS.md` §7.2.)
- **Implicit-creator-by-Manufacturer fallback** for vendor profiles (e.g., `profiles.ge` claiming `(0019,xxxx)` when `(0008,0070) Manufacturer` = "GE MEDICAL SYSTEMS") — Phase 6 (PITFALLS.md §7.2 gap).
- **Streaming / pull-parser API** for huge files — v2+ deferral (PROJECT.md "Out of Scope (v1)").
- **Byte-exact round-trip preservation of fragment boundaries** — Phase 5 / Phase 8 concern; not Phase 2's job. Documented in `.planning/research/PITFALLS.md` §9.2.
- **`ds.toJSON({ bulkDataMode: 'uri' })`** — v1.x deferral (PROJECT.md), tracked in REQUIREMENTS.md "v2+ / Companion Package Requirements".

### Reviewed Todos (not folded)
None reviewed — `gsd-todo` parking lot is empty per Phase 1's `01-CONTEXT.md` and current STATE.md.

</deferred>

---

*Phase: 2-core-parser*
*Context gathered: 2026-05-01*

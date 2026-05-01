# Phase 2: Core Parser & Transfer Syntaxes — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 22 (21 new src/test files + 1 cross-cutting `parser/emit.ts` discretion)
**Analogs found:** 22 / 22 (HL7 sibling primary; Phase 1 dictionary secondary)

> Sibling-primary mapping. CONTEXT.md D-08, D-10, D-11, D-12 explicitly mandate that Phase 2 mirrors `@cosyte/hl7`'s `parser/{warnings,errors,index,types}.ts`. Wherever the sibling has a 1:1 analog, the executor's first move is "open the sibling file, copy the pattern, retype for DICOM positions/codes." Pattern excerpts below are concrete code blocks the planner/executor can quote directly into plan action sections.

---

## File Classification

### `src/parser/` (parser pipeline)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/parser/index.ts` | controller (entry) | request-response (input → Dataset) | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts` | exact (D-01, D-13, D-14) |
| `src/parser/warnings.ts` | registry + factory module | event-driven (emit) | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts` | exact (D-08, D-12) |
| `src/parser/errors.ts` | error taxonomy | exception | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/errors.ts` | exact (D-09, D-10) |
| `src/parser/emit.ts` *(or co-located in `warnings.ts`)* | chokepoint | event-driven (single emit point) | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts` `makeEmitter` (lines 130–181) | exact (D-11, D-35) |
| `src/parser/types.ts` | shared types | type-only | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts` | exact (D-02, D-03, D-07) |
| `src/parser/part10-header.ts` | service (preamble + DICM detect) | byte-stream / file-I/O | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/mllp.ts` (`stripMllp`/`emitIfFramed`) | role-match (preprocessor pattern) |
| `src/parser/file-meta.ts` | service (Explicit VR LE FM parser) | byte-stream | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/delimiters.ts` (`readDelimiters`) | role-match (header/metadata extractor) |
| `src/parser/transfer-syntax.ts` | dispatcher | strategy table | this repo `src/dictionary/index.ts` `uid()` lookup + frozen `Record` constant | role-match (frozen lookup table) |
| `src/parser/implicit-le.ts` | service (TS-01 strategy) | byte-stream / streaming | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/tokenize.ts` | role-match (per-strategy tokenizer) |
| `src/parser/explicit-le.ts` | service (TS-02 strategy) | byte-stream | same as above | role-match |
| `src/parser/explicit-be.ts` | service (TS-03 strategy) | byte-stream w/ endian-swap | same as above | role-match |
| `src/parser/deflated-le.ts` | service (TS-04, delegating) | byte-stream + zlib | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/normalize.ts` (`normalizeBuffer` charset decode → re-decode pattern) | partial (delegate-to-inner-parser pattern) |
| `src/parser/byte-cursor.ts` | utility (endian-aware cursor) | utility | no sibling analog (HL7 is string-only) — green-field; constrained by D-spec "use `Buffer.read*LE/BE`, NOT `DataView`" | no analog (specifics §) |
| `src/parser/element-header.ts` | utility (group/element/VR/length decode) | byte-stream | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/tokenize.ts` (per-element header pattern) | role-match |
| `src/parser/sequence.ts` | service (SQ + FFFE markers) | recursive byte-stream | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/tokenize.ts` (nested-component descent) | partial (recursive-descent shape) |
| `src/parser/endian.ts` | constants (BE_VR_STRIDE table) | type-only | `/home/nschatz/projects/cosyte/hl7-parser/src/parser/delimiters.ts` (`DEFAULT_ENCODING_CHARACTERS` frozen) | role-match (frozen constant) |

### `src/dataset/` (structural shell — Phase 2 owns no `.value` getter)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/dataset/dataset.ts` | model (top-level container) | aggregate root | `/home/nschatz/projects/cosyte/hl7-parser/src/model/message.ts` (`Hl7Message` Phase 2 shell) | exact |
| `src/dataset/element.ts` | model (leaf wrapper) | wrapper over raw bytes | `/home/nschatz/projects/cosyte/hl7-parser/src/model/field.ts` (`Field` wrapper, no value coercion) | role-match |
| `src/dataset/file-meta.ts` | view object (FM-02 fields) | projection over Dataset | `/home/nschatz/projects/cosyte/hl7-parser/src/helpers/meta.ts` (`buildMeta` view-object pattern) | role-match |
| `src/dataset/sequence.ts` | model (SQ wrapper) | aggregate of items | `/home/nschatz/projects/cosyte/hl7-parser/src/model/segment.ts` (collection wrapper) | role-match |
| `src/dataset/item.ts` | model (Item = nested Dataset) | recursive aggregate | `/home/nschatz/projects/cosyte/hl7-parser/src/model/segment.ts` (`Segment` containing `RawField[]`) | role-match (composition shape) |
| `src/dataset/tag.ts` | utility (hex tag helpers) | pure functions | this repo `src/dictionary/index.ts` (`TAG_HEX_RE` + `lookup` validation/normalization) | exact |

### `test/`

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `test/helpers/build-dicom.ts` | test utility (programmatic Buffer builder) | builder pattern | `/home/nschatz/projects/cosyte/hl7-parser/src/builder/build-message.ts` (`buildMessage` factory) | role-match (internal-only per D-37) |

---

## Pattern Assignments

### `src/parser/warnings.ts` (registry + factory module, event-driven)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts` (mirror exactly per D-08, D-12).

**Frozen-registry pattern** (sibling lines 26–62) — copy verbatim, swap codes for the D-08 active+reserved DICOM list:
```typescript
export const WARNING_CODES = {
  DICOM_MISSING_PREAMBLE: "DICOM_MISSING_PREAMBLE",
  DICOM_FILE_META_GROUP_LENGTH_MISSING: "DICOM_FILE_META_GROUP_LENGTH_MISSING",
  DICOM_FILE_META_GROUP_LENGTH_MISMATCH: "DICOM_FILE_META_GROUP_LENGTH_MISMATCH",
  // ...all 25+ Tier-2 codes from D-08, alphabetical-within-prefix per specifics §
} as const;

export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

export interface DicomParseWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly position: DicomPosition;
}
```

**Factory-per-code pattern** (sibling lines 96–103, repeated 13× — one per code):
```typescript
/**
 * Build a `DICOM_MISSING_PREAMBLE` warning. Emitted once per parse when no
 * `DICM` magic is present at offset 128 and `stripPreamble` is `'tolerate'`.
 *
 * @example
 * ```ts
 * import { missingPreamble } from "@cosyte/dicom";
 * const w = missingPreamble({ byteOffset: 0 });
 * ```
 */
export function missingPreamble(position: DicomPosition): DicomParseWarning {
  return {
    code: WARNING_CODES.DICOM_MISSING_PREAMBLE,
    message: "No `DICM` magic at offset 128; falling back to offset-0 dataset.",
    position,
  };
}
```

**JSDoc with `@example` on every public export** is enforced by CLAUDE.md and shown verbatim in the sibling. Reserved-but-not-emitted codes (`DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`) get a `// reserved by Phase {N} — not emitted in Phase 2` comment per CONTEXT.md D-08.

---

### `src/parser/errors.ts` (error taxonomy)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/errors.ts` (mirror exactly per D-09, D-10).

**`FATAL_CODES` frozen registry + `FatalCode` discriminant** (sibling lines 31–61) — DICOM swaps the 4 codes per D-09:
```typescript
export const FATAL_CODES = {
  NOT_DICOM_PART_10: "NOT_DICOM_PART_10",
  INVALID_FILE_META: "INVALID_FILE_META",
  UNSUPPORTED_TRANSFER_SYNTAX: "UNSUPPORTED_TRANSFER_SYNTAX",
  EMPTY_INPUT: "EMPTY_INPUT",
} as const;

export type FatalCode = (typeof FATAL_CODES)[keyof typeof FATAL_CODES];
```

**Error class shape** (sibling lines 86–104) — DICOM adds `byteOffset` (replaces `position`'s segment shape) + `contextPath` per D-10:
```typescript
export class DicomParseError extends Error {
  public readonly code: FatalCode;
  public readonly byteOffset: number;
  public readonly snippet: string;            // up to 16 src bytes, space-sep lowercase hex
  public readonly contextPath: readonly string[] | undefined;

  public constructor(
    code: FatalCode,
    message: string,
    byteOffset: number,
    snippet: string,
    contextPath?: readonly string[],
  ) {
    super(message);
    this.name = "DicomParseError";
    this.code = code;
    this.byteOffset = byteOffset;
    this.snippet = snippet;
    this.contextPath = contextPath;
  }
}
```
Message-format convention from CONTEXT.md specifics: `[${code}] ${message} (offset=${byteOffset})`, append `… in ${contextPath.join('/')}` when present.

---

### `src/parser/emit.ts` (or co-located in `warnings.ts`) — chokepoint

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts` `makeEmitter` (lines 130–181). Mirror per D-11, D-35.

**Chokepoint pattern** (sibling lines 136–158) — DICOM uses byte-offset positions instead of segment indices, snippet builder reads up to 16 bytes from `ctx.buffer`:
```typescript
function makeEmitter(
  ctx: ParseContext,
): (w: DicomParseWarning) => void {
  return (w) => {
    if (ctx.strict === true) {
      // Tier-2 → Tier-3 escalation per D-35. The `code` field is typed as
      // FatalCode at compile time but at runtime under strict mode also
      // carries any WarningCode; consumers narrow on err.code (Plan 06
      // decision (b) in HL7 sibling — same rationale here).
      throw new DicomParseError(
        w.code as unknown as FatalCode,
        w.message,
        w.position.byteOffset,
        buildSnippet(ctx.buffer, w.position.byteOffset),
        w.position.contextPath,
      );
    }
    ctx.warnings.push(w);
    if (ctx.onWarning !== undefined) {
      try { ctx.onWarning(w); } catch { /* silent swallow — sibling pattern */ }
    }
  };
}
```
**Critical:** the order — push first, then invoke callback — must match D-03 ("invoked **after** the warning is pushed to `ds.warnings`"). The HL7 sibling pushes first then fires `onWarning` (lines 158–179); confirms ordering.

**No per-call-site `if (strict) throw` checks** — D-11 explicit. Every Tier-2 emission flows through this one function.

---

### `src/parser/types.ts` (shared types)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts` (mirror per D-02, D-03, D-07).

**`DicomPosition`** (sibling lines 35–41 `Hl7Position` shape, swap fields):
```typescript
export interface DicomPosition {
  readonly byteOffset: number;
  /** True when offset is inside the File Meta group. */
  readonly fileMeta?: boolean;
  /** True when offset is into the inflated dataset buffer (Deflated TS only). */
  readonly deflated?: boolean;
  /** Tag chain for nested SQ items, e.g. ["0040A730", "0", "00080100"]. */
  readonly contextPath?: readonly string[];
}
```

**`OnWarningCallback`** (sibling lines 57):
```typescript
export type OnWarningCallback = (warning: DicomParseWarning) => void;
```

**`ParseOptions`** (sibling lines 82–103 — DICOM has different fields per D-02, but the readonly + `exactOptionalPropertyTypes`-friendly shape matches):
```typescript
export interface ParseOptions {
  readonly strict?: boolean;
  readonly stripPreamble?: 'tolerate' | 'require';
  readonly onWarning?: OnWarningCallback;
  readonly copyValues?: boolean;
  // No `profile` field in Phase 2 — D-45 reserves space in internal ParseContext only.
}
```
**`exactOptionalPropertyTypes: true` discipline** (sibling line 28 + line 85 comment): callers must omit keys rather than passing `undefined`. Document in JSDoc of every optional field, mirroring sibling.

**Internal `ParseContext`** (no public sibling — mirrors HL7 sibling's internal pipeline state). Per D-45, must already carry `profile?: Profile` field for Phase 6 schema-stability:
```typescript
export interface ParseContext {
  readonly buffer: Buffer;
  readonly strict: boolean;
  readonly stripPreamble: 'tolerate' | 'require';
  readonly onWarning?: OnWarningCallback;
  readonly warnings: DicomParseWarning[];
  /** Reserved for Phase 6 — never set in Phase 2 (D-45). */
  readonly profile?: unknown;
  // + creators map, encoding-context stack — per Claude's discretion (D-Discretion §)
}
```

---

### `src/parser/index.ts` (entry / dispatch)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts` (mirror per D-01, D-13, D-14).

**Overload pattern** (sibling lines 336–343 — DICOM Phase 2 form per D-01):
```typescript
export function parseDicom(input: Buffer | Uint8Array | ArrayBuffer): Dataset;
export function parseDicom(
  input: Buffer | Uint8Array | ArrayBuffer,
  options: ParseOptions,
): Dataset;
/** @internal — implementation signature. */
export function parseDicom(
  input: Buffer | Uint8Array | ArrayBuffer,
  options: ParseOptions = {},
): Dataset {
  // ...body
}
```
**No `discriminateOptionsOrProfile` helper** in Phase 2 — D-01 defers it to Phase 6 alongside the third overload. Phase 2 thus omits sibling lines 56–101.

**Pipeline order with dual EMPTY_INPUT check** (sibling lines 343–386 — adapt for byte-buffer input):
```typescript
const buffer = normalizeInput(input);             // Buffer | Uint8Array | ArrayBuffer → Buffer

// First EMPTY_INPUT check — raw input length (D-13 dual check).
if (rawLengthIsZero(input)) {
  throw new DicomParseError(FATAL_CODES.EMPTY_INPUT, "Input is empty.", 0, "");
}

// Second EMPTY_INPUT check — after normalization (D-13 corner-case Bool ArrayBuffer(0)).
if (buffer.length === 0) {
  throw new DicomParseError(FATAL_CODES.EMPTY_INPUT, "Input is empty after normalization.", 0, "");
}

// Build ctx + emitter chokepoint, then dispatch.
const ctx: ParseContext = { buffer, strict: options.strict ?? false, /* ... */ warnings: [] };
const emit = makeEmitter(ctx);

const { datasetStart, fileMetaEnd } = parsePart10Header(buffer, ctx, emit);
const fileMeta = parseFileMeta(buffer, datasetStart, fileMetaEnd, ctx, emit);
const tsUid = fileMeta.transferSyntaxUID;       // D-19 — required, fatal INVALID_FILE_META if missing
const strategy = TRANSFER_SYNTAX_PARSERS[tsUid];
if (strategy === undefined) {
  throw new DicomParseError(
    FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX,
    `Transfer Syntax UID "${tsUid}" is not supported by @cosyte/dicom v1`,
    fileMetaEnd,
    Dictionary.uid(tsUid)?.name ?? "",     // D-20: human-readable name in snippet field
  );
}

const dataset = strategy(buffer, fileMetaEnd, ctx, emit);
return new Dataset({ fileMeta, elements: dataset.elements, warnings: ctx.warnings });
```

**JSDoc `@example` requirement** (sibling lines 320–334 + CONTEXT.md specifics §): the `parseDicom` JSDoc must demonstrate **all three input variants** + `onWarning` callback + `{ strict: true }` throwing path. Use sibling's `@example` block as a template, adapt for DICOM types.

---

### `src/parser/transfer-syntax.ts` (dispatch table)

**Analog:** This repo `src/dictionary/index.ts` lines 21–53 (frozen-`Record` pattern with deep-freeze on first load).

**Dispatch table pattern** per D-20:
```typescript
export type ParserStrategy = (
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
) => { elements: ReadonlyMap<Tag, Element> };

export const TRANSFER_SYNTAX_PARSERS: Readonly<Record<string, ParserStrategy>> = Object.freeze({
  '1.2.840.10008.1.2': parseImplicitLE,
  '1.2.840.10008.1.2.1': parseExplicitLE,
  '1.2.840.10008.1.2.2': parseExplicitBE,
  '1.2.840.10008.1.2.1.99': parseDeflatedLE,
});
```
The `Object.freeze` mirrors sibling dictionary's `deepFreezeEntries` pattern (this repo `src/dictionary/index.ts` lines 36–49).

---

### `src/parser/part10-header.ts` (preamble + DICM detect)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/mllp.ts` `stripMllp` + `emitIfFramed` (preprocessor pattern: detect-strip-warn).

**Pattern shape** — mirror the "detect framing, conditionally strip, optionally emit warning" structure for the 128-byte preamble + `DICM` magic (D-14, D-15):
```typescript
export interface Part10HeaderResult {
  readonly datasetStart: number;       // offset where File Meta begins
  readonly hadPreamble: boolean;
}

export function parsePart10Header(
  buffer: Buffer,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): Part10HeaderResult {
  // 1. If buffer.length >= 132 AND buffer.slice(128, 132).equals(DICM) → strip 128+4, return { datasetStart: 132, hadPreamble: true }.
  // 2. Else, try detecting (0002,0000) at offset 0 in Explicit VR LE form (D-15 heuristic).
  //    - If detected, emit DICOM_MISSING_PREAMBLE; return { datasetStart: 0, hadPreamble: false }.
  //    - Else, throw DicomParseError(NOT_DICOM_PART_10).
  // 3. stripPreamble === 'require' → step 2 throws NOT_DICOM_PART_10 instead of emitting.
}
```

---

### `src/parser/file-meta.ts` (FM parser, hard-wired Explicit VR LE)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/delimiters.ts` (`readDelimiters` — header-extractor that runs before main pipeline). Role-match: it's the "extract metadata before strategy dispatch" step.

**Pattern shape** per D-17, D-18, D-19:
```typescript
export function parseFileMeta(
  buffer: Buffer,
  start: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): { fileMeta: FileMeta; fileMetaEnd: number } {
  // ALWAYS Explicit VR LE — does NOT call into transfer-syntax dispatch.
  // 1. Read (0002,0000) FileMetaInformationGroupLength (UL, 4-byte value).
  //    - Absent → emit DICOM_FILE_META_GROUP_LENGTH_MISSING; parse forward
  //      until first non-(0002,xxxx) group.
  //    - Present → use as hint; verify by parsing forward; mismatch →
  //      emit DICOM_FILE_META_GROUP_LENGTH_MISMATCH; trust actual.
  // 2. Required: (0002,0010) Transfer Syntax UID. Missing → throw
  //    DicomParseError(INVALID_FILE_META) regardless of strict mode (D-19).
  // 3. Other FM-03 elements (FileMetaInfoVersion, MediaStorageSOPClassUID, etc.)
  //    parsed if present, NOT enforced — that's Phase 7's validate() per D-19.
}
```

---

### `src/parser/byte-cursor.ts` (endian-aware cursor)

**Analog:** No sibling analog — HL7 is string-only. Green-field per CONTEXT.md specifics §.

**Constraints (per specifics §):**
- Use `Buffer.readUInt16LE/BE`, `Buffer.readUInt32LE/BE`, `Buffer.readBigUInt64LE/BE`. **Do NOT use Node `DataView`** — Buffer methods are faster and the project idiom.
- Single endian-aware abstraction shared by all 4 TS parsers (D-05 explicit).

**Suggested shape** (Claude's discretion per CONTEXT.md):
```typescript
export interface ByteCursor {
  readonly buffer: Buffer;
  readonly littleEndian: boolean;
  position: number;                    // mutable — only field that mutates
  readUInt16(): number;
  readUInt32(): number;
  readUInt16At(offset: number): number;
  readUInt32At(offset: number): number;
  slice(length: number): Buffer;       // advances position
  remaining(): number;
}
```

---

### `src/parser/element-header.ts` (group/element/VR/length decode)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/tokenize.ts` (per-element header pattern).

**Patterns to consolidate** per D-22:
- `LONG_FORM_VRS = new Set<VR>(['OB','OW','OF','OD','OL','SQ','UT','UN','UC','UR']) as const` — internally exported for Phase 5 reuse.
- Reserved-bytes-zero assertion → `DICOM_NONZERO_RESERVED_BYTES`.
- Implicit VR fallback rules (D-21) — calls `Dictionary.lookup(tag)` from Phase 1's already-shipped surface.
- Private-creator stack tracking (D-33, D-34) — the off-by-0x1000 rule per PITFALLS.md §7.1.

**Implicit VR fallback excerpt** (D-21 cases — concrete decision tree using the existing Dictionary):
```typescript
function resolveImplicitVR(tag: Tag, ctx: ParseContext): VR {
  // Case 4: private tag (odd group) → UN, emit warnings per D-34.
  const groupHi = parseInt(tag.slice(0, 4), 16);
  if (groupHi % 2 === 1) {
    const creator = lookupPrivateCreator(tag, ctx.creators);
    if (creator === undefined) emit(privateTagNoCreator(/* ... */));
    emit(implicitVRForPrivateTagWithoutVR(/* ... */));
    return 'UN';
  }
  // Cases 1–3: standard tag — concrete or repeating-group dict entry.
  const entry = Dictionary.lookup(tag);
  if (entry === undefined) {
    // Case 5: unknown standard tag → UN, no warning (allowed).
    const familyEntry = matchRepeatingGroup(tag);   // D-21 case 3
    if (familyEntry !== undefined) return familyEntry.vr[0] ?? 'UN';
    return 'UN';
  }
  // Case 1 + 2: single-VR or multi-VR entry → first array entry per D-21.
  return entry.vr[0] ?? 'UN';
}
```

---

### `src/parser/sequence.ts` (SQ + FFFE markers)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/tokenize.ts` (recursive-descent over nested fields/components/subcomponents).

**Key patterns** per D-25, D-28, D-29, D-30:
- Encoding-context stack: `'Root' | 'SqItem' | 'EncapsulatedPixelData'` (D-28).
- All FFFE marker reads route through the **same** endian-aware element-header primitive (D-25 — addresses PITFALLS.md §2.3 BE-FFFE bug).
- CP-246 detection (D-30): when `VR=UN` AND `length=0xFFFFFFFF` AND TS is Explicit, attempt SQ descent using **Implicit VR LE inner encoding**; on success promote to `VR=SQ` + emit `DICOM_UN_PARSED_AS_SQ`; on failure restore to UN with raw bytes preserved + NO warning.
- Empty item (`(FFFE,E000) length=0`) tolerated → emit `DICOM_EMPTY_ITEM_IN_SEQUENCE`.

---

### `src/parser/endian.ts` (BE_VR_STRIDE table)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/delimiters.ts` (`DEFAULT_ENCODING_CHARACTERS` frozen constant pattern). Plus this repo `src/dictionary/types.ts` for the `VR` union shape.

**Pattern** per D-23 — `Readonly<Record<VR, 0|2|4|8>>` matches the Phase 1 dictionary's frozen-record idiom:
```typescript
export const BE_VR_STRIDE: Readonly<Record<VR, 0 | 2 | 4 | 8>> = Object.freeze({
  AT: 2, US: 2, SS: 2, OW: 2,
  UL: 4, SL: 4, FL: 4, OF: 4, OL: 4,
  FD: 8, OD: 8,
  OV: 8, SV: 8, UV: 8,
  // 0 = no swap (byte-stream, ASCII, spec-defined)
  OB: 0, UN: 0, AE: 0, AS: 0, CS: 0, DA: 0, DS: 0, DT: 0,
  IS: 0, LO: 0, LT: 0, PN: 0, SH: 0, ST: 0, TM: 0, UC: 0,
  UI: 0, UR: 0, UT: 0, SQ: 0,
});
```
**AT special case JSDoc** (D-23): "stride=2 + count=2 — group, then element. NEVER one 4-byte swap." Multi-valued AT: stride=4, count=N×2. Document in the per-VR swap function's JSDoc per CONTEXT.md.

**Internally exported** for Phase 5 serializer reuse (D-44) — match the `LONG_FORM_VRS` export discipline (D-22).

---

### `src/parser/{implicit-le,explicit-le,explicit-be,deflated-le}.ts` (TS strategies)

**Shared analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/tokenize.ts` (single-strategy recursive byte stream consumer). Each DICOM TS strategy is a `ParserStrategy` matching the `transfer-syntax.ts` table signature.

**Pattern shape** for each strategy (consistent across all 4):
```typescript
export function parseExplicitLE(
  buffer: Buffer,
  start: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): { elements: ReadonlyMap<Tag, Element> } {
  const cursor = new ByteCursor(buffer, true);  // littleEndian=true
  cursor.position = start;
  const elements = new Map<Tag, Element>();
  while (cursor.remaining() > 0) {
    const el = readElement(cursor, ctx, emit, /* TS-specific opts */);
    if (el === undefined) break;
    elements.set(el.tag, el);
  }
  return { elements };
}
```

**`deflated-le.ts` specifics** per D-26, D-27 (the silent-wrong bug per PROJECT.md + PITFALLS.md §1.4):
```typescript
import { inflateRawSync } from "node:zlib";   // RFC 1951 raw deflate — NOT inflateSync.

export function parseDeflatedLE(buffer, start, ctx, emit) {
  // 1. Slice buffer.subarray(start) — File Meta already parsed uncompressed.
  // 2. const inflated = inflateRawSync(buffer.subarray(start));
  // 3. Build a NEW ParseContext over inflated buffer; mark position.deflated=true on emitted warnings.
  // 4. Delegate to parseExplicitLE(inflated, 0, innerCtx, innerEmit).
  // 5. Merge innerCtx.warnings back into outer ctx with deflated=true position flag.
}
```
Position semantics per D-27: dataset elements report inflated-buffer offsets with `position.deflated = true`; File Meta warnings carry `position.fileMeta = true` and on-disk offsets.

---

### `src/dataset/dataset.ts` (top-level container, structural shell)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/model/message.ts` (`Hl7Message` Phase 2 shell — read-only public fields, no traversal methods yet).

**Pattern shape** — Phase 2 ships only structural fields; Phase 3 extends with `get`/`has`/`elements` per D-42:
```typescript
export interface DatasetInit {
  readonly fileMeta?: FileMeta;
  readonly warnings: readonly DicomParseWarning[];
  readonly elements: ReadonlyMap<Tag, Element>;       // internal — Phase 3 promotes to public surface
}

export class Dataset {
  public readonly fileMeta: FileMeta | undefined;
  public readonly warnings: readonly DicomParseWarning[];
  /** Internal — Phase 3 wraps with public get/has/elements. */
  protected readonly _elements: ReadonlyMap<Tag, Element>;

  public constructor(init: DatasetInit) {
    this.fileMeta = init.fileMeta;
    this.warnings = Object.freeze([...init.warnings]);     // freeze at boundary per HL7 sibling
    this._elements = init.elements;
  }
}
```
**Frozen-warnings boundary** — sibling `message.ts` line 117–118 explicitly freezes warnings array at the model boundary so downstream code cannot mutate parser output. Mirror exactly.

**Internal element-map representation** is Claude's discretion (CONTEXT.md). Map is the natural choice; sorted-array or object are alternatives the planner may benchmark.

---

### `src/dataset/element.ts` (leaf wrapper, no `.value` getter)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/model/field.ts` (`Field` wrapper, exposed `raw` reference + light convenience surface).

**Pattern shape** — Phase 2 has structural fields ONLY, no `.value` per D-04 + D-42:
```typescript
export class Element {
  public readonly tag: Tag;
  public readonly vr: VR;
  public readonly vm: number;
  public readonly length: number;
  public readonly rawBytes: Buffer;         // Buffer.subarray view by default (D-16)
  public readonly byteOffset: number;
  public readonly privateCreator: string | undefined;

  // NOTE: No `.value` getter, no decoders, no .items navigation in Phase 2.
  // Phase 3 extends this class (per D-42) — keep constructor surface minimal.

  public constructor(init: { /* all readonly fields */ }) {
    // Assign each field; do NOT freeze the whole object (Buffer reference).
  }
}
```
**Buffer-slice retention behavior** (D-16 + PITFALLS.md §11.2): `rawBytes` defaults to `Buffer.subarray()` (zero-copy view); `{ copyValues: true }` opts into `Buffer.from(slice)` per element. Document in `parseDicom` JSDoc (CONTEXT.md D-16 explicit).

---

### `src/dataset/file-meta.ts` (FM-02 view object)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/helpers/meta.ts` (`buildMeta` view-object pattern — projection over already-parsed data).

**Pattern shape** per D-17 + FM-02:
```typescript
export interface FileMeta {
  readonly transferSyntaxUID: string;
  readonly mediaStorageSOPClassUID?: string;
  readonly mediaStorageSOPInstanceUID?: string;
  readonly fileMetaInformationVersion?: Buffer;
  readonly implementationClassUID?: string;
  readonly implementationVersionName?: string;
  // ... full FM-02 set
}
```
Plain interface (not class) since Phase 2 has no methods — same shape pattern as sibling `Meta` interface. Phase 3 may promote to a class if helpers are added.

---

### `src/dataset/sequence.ts` and `src/dataset/item.ts` (structural)

**Analogs:**
- `Sequence` → `/home/nschatz/projects/cosyte/hl7-parser/src/model/segment.ts` (collection wrapper exposing `.fields` raw reference).
- `Item` → recursive `Dataset` analog (HL7 has no direct equivalent since segments are not nested-message-shaped).

**Pattern shape** per D-04 (structural surface only):
```typescript
export class Sequence {
  public readonly items: readonly Item[];
  public readonly length: number;            // raw byte length, undefined-length signaled by 0xFFFFFFFF
  public constructor(items: readonly Item[], length: number) {
    this.items = Object.freeze([...items]);
    this.length = length;
  }
}

export class Item extends Dataset {
  public readonly index: number;             // 0-based item index in parent Sequence
  public constructor(init: DatasetInit & { index: number }) {
    super(init);
    this.index = init.index;
  }
}
```
**No `.get(...)` navigation** per D-04 + D-42 — Phase 3 adds it.

---

### `src/dataset/tag.ts` (tag hex utilities)

**Analog:** This repo `src/dictionary/index.ts` (existing `TAG_HEX_RE` regex + tag normalization in `lookup`).

**Pattern shape** — utility functions only in Phase 2; class form deferred to Phase 3 if needed (CONTEXT.md Claude's discretion):
```typescript
const TAG_HEX_RE = /^[0-9A-F]{8}$/;       // mirrors src/dictionary/index.ts line 29

export function isValidTag(s: string): boolean { /* uppercase, length 8, hex */ }
export function splitTag(tag: Tag): { group: number; element: number } { /* */ }
export function joinTag(group: number, element: number): Tag { /* uppercase 8-hex */ }
export function isPrivateTag(tag: Tag): boolean { /* group is odd */ }
export function isFileMetaTag(tag: Tag): boolean { /* group === 0x0002 */ }
```
**Internal-only export** in Phase 2 per D-04 ("`Tag` utility type defined inline; promoted to class in Phase 3 if needed"). The `Tag` type alias re-exported from `src/dictionary/types.ts` already.

---

### `test/helpers/build-dicom.ts` (programmatic fixture builder)

**Analog:** `/home/nschatz/projects/cosyte/hl7-parser/src/builder/build-message.ts` (`buildMessage` factory).

**Pattern shape** per D-37 + D-38 (internal-only, NOT a public export):
```typescript
// test/helpers/build-dicom.ts — internal test utility ONLY.

export interface BuildDicomElement {
  readonly tag: Tag;
  readonly vr: VR;
  readonly value: Buffer;         // raw bytes; helper writes the header per TS
}

export interface BuildDicomOptions {
  readonly transferSyntax: string;     // one of the 4 v1 UIDs
  readonly elements: readonly BuildDicomElement[];
  readonly skipPreamble?: boolean;     // for missing-preamble tests
  readonly fileMetaGroupLength?: number | 'omit' | 'wrong';  // for FM warning tests
}

export function buildDicom(opts: BuildDicomOptions): Buffer {
  // 1. Emit 128 zero bytes + "DICM" (unless skipPreamble).
  // 2. Emit File Meta group (always Explicit VR LE) with TS UID.
  // 3. Emit dataset per `transferSyntax`.
}
```
**Coverage targets** (CONTEXT.md specifics § + ROADMAP.md Phase 2 success criteria #1):
- Long-form VR (`OB OW OF OD OL SQ UT UN UC UR`) — one element each.
- Reserved-bytes-zero assertion test.
- BE AT byte-swap test, BE OB no-swap test.
- Deflated TS using `inflateRawSync`.
- CP-246 fallback fixture (private SQ encoded Implicit→Explicit-as-UN).

---

## Shared Patterns

### JSDoc + `@example` on every public export
**Source:** Pervasive in HL7 sibling — `/home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts` lines 17–25 (registry) + lines 88–96 (every factory). Plus this repo `src/dictionary/index.ts` lines 64–67 + 86–89 + 110–114 (public exports already follow this discipline).
**Apply to:** `parseDicom`, every factory function in `warnings.ts`, every error class in `errors.ts`, every public class in `dataset/`, every public type in `parser/types.ts`.
**Excerpt:** see Warnings factory pattern above.

### `as const` frozen registries → discriminated-union types
**Source:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts` lines 26–62 (`WARNING_CODES` + `WarningCode`) + `errors.ts` lines 31–61 (`FATAL_CODES` + `FatalCode`).
**Apply to:** `WARNING_CODES`, `FATAL_CODES`, `BE_VR_STRIDE`, `LONG_FORM_VRS`, `TRANSFER_SYNTAX_PARSERS`.
**Pattern:** `as const` literal on the object; type alias derives the union via `(typeof X)[keyof typeof X]`. Zero runtime cost, exhaustive `switch` checks.

### `Object.freeze` + deep-freeze on first module load
**Source:** This repo `src/dictionary/index.ts` lines 36–53 (`deepFreezeEntries` helper, freezes nested entries + parent map).
**Apply to:** Any public-surface frozen registry that exposes nested objects (warning factories don't need this; `BE_VR_STRIDE` is flat — `Object.freeze` alone suffices).

### `noUncheckedIndexedAccess` discipline
**Source:** This repo `src/dictionary/index.ts` lines 92–99 (`KEYWORDS[k]` returning `string | undefined`, narrowed before use). HL7 sibling `parser/index.ts` lines 298–308 (`extractVersion` chain of `=== undefined` guards).
**Apply to:** Every parser that indexes `creators[gggg][XX]`, `TRANSFER_SYNTAX_PARSERS[uid]`, dictionary lookups in `element-header.ts`. **Never use the `?? ''` fallback as a way to silence the warning unless the empty string is semantically correct.**

### Single chokepoint for warning emission (no per-site `if (strict) throw`)
**Source:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts` lines 130–181 (`makeEmitter`).
**Apply to:** Every Tier-2 emission across all parser files. The factory builds the warning; `emit(ctx, factory(args))` is the only allowed shape. **No `if (ctx.strict) throw new DicomParseError(...)` outside the chokepoint.**

### `exactOptionalPropertyTypes` discipline (omit keys instead of `undefined`)
**Source:** `/home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts` line 28 (Hl7Position JSDoc warning) + `/home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts` lines 522–530 (conditional assignment to `init` object).
**Apply to:** `ParseOptions`, `DicomPosition`, `DatasetInit`, all init-shape interfaces. Documented in JSDoc `@remarks` of every optional field per D-02.

### Buffer-first API, no `console.*` in library code, no `any`
**Source:** CLAUDE.md guardrails + this repo's existing dictionary code (no `any` anywhere; everything narrowed via `unknown`/discriminants).
**Apply to:** All Phase 2 parser/dataset code. Use typed errors (`DicomParseError`) for unrecoverable problems; warnings (`DicomParseWarning`) for everything recoverable.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `src/parser/byte-cursor.ts` | endian-aware cursor utility | HL7 sibling is string-only — no byte-stream reader exists there. Greenfield, constrained by CONTEXT.md specifics § ("use `Buffer.read*LE/BE`, NOT `DataView`"). |

All other files have at least a role-match analog in the HL7 sibling repo.

---

## Metadata

**Analog search scope:**
- `/home/nschatz/projects/cosyte/hl7-parser/src/parser/` (primary — all 12 files reviewed)
- `/home/nschatz/projects/cosyte/hl7-parser/src/model/` (model wrappers — `message.ts`, `segment.ts`, `field.ts`)
- `/home/nschatz/projects/cosyte/hl7-parser/src/builder/build-message.ts` (factory analog for fixture builder)
- `/home/nschatz/projects/cosyte/hl7-parser/test/_helpers/` (test utility shape)
- `/home/nschatz/projects/cosyte/dicom/src/dictionary/` (this repo, frozen-registry + freeze-on-load + lookup patterns)

**Files scanned:** 16
**Pattern extraction date:** 2026-05-01
**Pattern parity directive:** CONTEXT.md `<canonical_refs>` "Sibling reference (read for pattern parity)" — explicitly mandates 1:1 mirror for `parser/{warnings,errors,index,types}.ts`.

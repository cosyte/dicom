# Architecture Research — `@cosyte/dicom`

**Domain:** DICOM Part 10 parser / metadata toolkit (Node.js + TypeScript library)
**Researched:** 2026-04-22
**Mode:** Validation / challenge of the architecture implied by PROJECT.md + ROADMAP.md
**Confidence:** HIGH on module decomposition, pipeline shape, dataset model, fixture sources; MEDIUM on lazy-vs-eager VR parsing recommendation (trade-off driven, not single right answer)

> Scope: this document answers the 8 architectural questions the roadmapper raised. It does **not** produce or rewrite a roadmap — it validates the one already in `ROADMAP.md` and flags gaps. Ecosystem-level "which libraries exist" is covered in the companion `STACK.md` / `FEATURES.md` research files; here we focus on component boundaries, data flow, build-order dependencies, and API surface.

---

## TL;DR — Headline Findings

1. **Proposed `src/` layout is correct** with two small additions: `warnings/` (shared registry, sibling to `parser/`) and `types/` or a sibling `errors/` subtree. Current ROADMAP Phase 2 already implies this; make it explicit.
2. **Parser pipeline is right** but the roadmap buries character-set decoding in Phase 4 while the parser in Phase 2 is already producing string VRs. Either defer string decoding entirely (VR-07 style — store `Buffer`, decode on read) or pull charset context-tracking into Phase 2. I recommend the former.
3. **Dataset shape:** nested `Dataset` objects for sequences (pydicom/fo-dicom model). Not flat tag maps. Not JSON-ified by default. This is architecturally unambiguous for the v1 goals.
4. **VR parsing: go LAZY with memoization.** For a 50 MB study where a developer reads 8 fields, lazy decoding is a ~100× wall-clock win. Structure (tags, VRs, lengths, byte offsets) is always eager; only **decoded values** are lazy. This is `dicom-parser`'s approach and it's correct for the metadata-first use case.
5. **Build order is mostly right.** Three gaps: (a) Phase 3 depends on Phase 1 dictionary (already stated transitively — make it explicit); (b) Phase 5 `toBuffer()` needs the VR encoding table (symmetric to Phase 3's decoding), so Phase 5 depends on Phase 3; (c) Phase 7's `validate()` needs the dictionary + profile system — depends on Phase 6 too, not just 3 and 5.
6. **Pixel data has a clean seam already.** Keep `src/pixel/` as its own module (not inside `dataset/`) — it's where `@cosyte/dicom-pixel` will hook.
7. **Fixture strategy: piggyback on `pydicom-data` (MIT) + `gdcmData` (BSD-3-Clause) + `dicom-test-files` (MIT-compatible curated set).** Do not redistribute — vendor a small in-repo curated subset with attribution, plus a generator script that can materialize extended fixtures on demand.

---

## 1. Module Decomposition — Validating the `src/` Layout

### What the major DICOM toolkits do

| Toolkit | Language | Top-level modules |
|---|---|---|
| **dicom-parser** (Cornerstone) | JS | Single module; `ByteStream`, `parseDicomDataSetImplicit/Explicit`, `DataSet`, `readSequenceItem` — structure only, deferred value parsing |
| **dcmjs** | JS | `data/` (DicomMessage, DicomMetaDictionary, `naturalized` dataset), `adapters/`, `normalizers/`, `sr/`, `anonymizer/` — plus `dictionary.fast.js` pre-compiled at build time |
| **pydicom** | Python | `dataset.py` (Dataset as dict subclass), `dataelem.py`, `sequence.py`, `filereader.py` (parser), `filewriter.py` (serializer), `dicomdict/` (generated), `valuerep.py` (VR types), `charset.py`, `pixel_data_handlers/`, `fileset.py` (DICOMDIR) |
| **fo-dicom** | C# | `DicomDataset.cs`, `DicomFile`, `IO/Reader/`, `IO/Writer/`, `IO/Parser/`, `Network/` (DIMSE, **not** in our scope), `Imaging/` (pixel, not in our scope), `Media/` (DICOMDIR) |

### Patterns that hold across all four

1. **Parser ↔ Writer symmetry.** Each toolkit has an `IO/Reader` + `IO/Writer` (fo-dicom), `filereader` + `filewriter` (pydicom), `parser` + `serialize` (proposed). Good.
2. **Dictionary is a generated artifact**, never hand-written — pydicom's `_dicom_dict.py`, dcmjs's `dictionary.fast.js`, fo-dicom's `DicomDictionary.xml` → codegen. Your Phase 1 is idiomatic.
3. **Dataset module is a thin container with rich access methods** — pydicom inherits `dict`, fo-dicom implements `IEnumerable<DicomItem>` over a SortedList, dcmjs uses plain JS objects with tag-hex keys. All of them make the Dataset the *semantic* entry point, not the parser.
4. **VR types live next to the dataset, not next to the parser.** pydicom's `valuerep.py` exposes PersonName / DA / DT as classes. fo-dicom has `DicomValue` variants. This is a module-placement hint: your PN/DA/DT parsers belong in `src/dataset/` (or `src/model/`), NOT `src/parser/`. Compare to `@cosyte/hl7` which places `XPN`, `XAD`, `CX`, etc. under `src/model/types/` — mirror that.
5. **Helpers / higher-level accessors sit above the dataset.** In pydicom this is done via `.PatientName` etc. dotted access on the dataset itself; fo-dicom offers `.GetSingleValue<T>()`. The equivalent TS-native shape is your `src/helpers/` — correct.

### Proposed layout: validated with deltas

```
src/
├── index.ts                     # Barrel — enumerated below in §6
├── parser/
│   ├── index.ts                 # parseDicom() entry point
│   ├── part10-header.ts         # Preamble + DICM + File Meta reader
│   ├── file-meta.ts             # Always Explicit VR LE (FM-01)
│   ├── transfer-syntax.ts       # UID → strategy dispatcher
│   ├── implicit-le.ts           # TS-01
│   ├── explicit-le.ts           # TS-02
│   ├── explicit-be.ts           # TS-03
│   ├── deflated-le.ts           # TS-04 (inflates then delegates to explicit-le)
│   ├── byte-stream.ts           # Cursor abstraction over Buffer/Uint8Array
│   ├── element-header.ts        # Shared group/element/VR/length decode
│   ├── sequence.ts              # SQ + item / item-delimiter / seq-delimiter markers
│   ├── tags.ts                  # Tag hex ↔ (group,element) helpers
│   ├── warnings.ts              # WARNING_CODES registry + factories  <-- SHARED with strict
│   ├── errors.ts                # FATAL_CODES + DicomParseError
│   └── types.ts                 # ParseOptions, OnWarningCallback, RawElement
├── dataset/
│   ├── index.ts                 # Barrel
│   ├── dataset.ts               # Dataset class — tag map + immutability + mutation methods
│   ├── element.ts               # Element wrapper — tag, vr, vm, length, rawBytes, byteOffset, lazy value
│   ├── item.ts                  # Sequence Item = Dataset + index
│   ├── sequence.ts              # Sequence = Item[] wrapper
│   ├── file-meta.ts             # FileMeta view object (FM-02)
│   ├── tag.ts                   # Tag value object (hex ↔ keyword resolution)
│   └── vr/                      # VR-aware value parsers (LAZY — see §4)
│       ├── index.ts
│       ├── person-name.ts       # PN parser (VR-01)
│       ├── date-time.ts         # DA/TM/DT (VR-02)
│       ├── numeric-string.ts    # IS/DS (VR-03)
│       ├── uid.ts               # UI (VR-04)
│       ├── binary-numeric.ts    # US/UL/SS/SL/FL/FD/AT (VR-05)
│       ├── binary-bytes.ts      # OB/OW/OF/OD/OL/UN (VR-06)
│       └── text.ts              # LT/ST/UT/LO/SH/CS/AE/AS/PN text decode (VR-07)
├── dictionary/
│   ├── index.ts                 # Dictionary namespace — lookup, byKeyword
│   ├── generated.ts             # ← produced by scripts/generate-dictionary.ts (DICT-01)
│   └── types.ts                 # DictionaryEntry shape
├── charset/                     # <-- RECOMMEND: pull out as its own module
│   ├── index.ts                 # decode(bytes, specificCharacterSet) entry
│   ├── iso-ir.ts                # ISO_IR 100/101/144/192 maps
│   ├── iso-2022.ts              # code-extension sequences (CJK)
│   └── gb18030.ts               # GB18030 / GBK
├── path/
│   ├── index.ts                 # parsePath / resolvePath
│   └── types.ts                 # TagPath AST
├── helpers/
│   ├── index.ts
│   ├── patient.ts               # HELPERS-01
│   ├── study.ts                 # HELPERS-02
│   ├── series.ts                # HELPERS-03
│   ├── instance.ts              # HELPERS-04
│   ├── equipment.ts             # HELPERS-05
│   ├── image.ts                 # HELPERS-06
│   └── types.ts                 # PatientSummary, StudySummary, ImageSummary, ...
├── pixel/                       # <-- RECOMMEND: own module (not inside dataset/)
│   ├── index.ts                 # ds.pixelData accessor
│   ├── raw.ts                   # Uncompressed: Buffer slice (PIXEL-01)
│   ├── encapsulated.ts          # Encapsulated: fragments + BOT (PIXEL-02)
│   └── types.ts                 # PixelDataView | EncapsulatedPixelData
├── serialize/
│   ├── index.ts
│   ├── to-buffer.ts             # SER-01
│   ├── emit-element.ts          # element header + value emitter (symmetric to element-header.ts)
│   ├── emit-file-meta.ts        # Always Explicit VR LE, correct group length (SER-04)
│   ├── encode-vr/               # Symmetric to dataset/vr/ — encoder per VR
│   │   └── …
│   ├── transcode.ts             # Transfer-syntax transcoding (SER-03)
│   ├── to-json.ts               # SER-06 (DICOM-JSON-style)
│   └── pretty-print.ts          # SER-06 (human)
├── profiles/
│   ├── index.ts
│   ├── define.ts                # defineProfile()
│   ├── merge.ts                 # extends + composition
│   ├── validate.ts              # ProfileDefinitionError paths
│   ├── describe.ts              # profile.describe()
│   ├── default.ts               # set/getDefaultProfile
│   ├── ge.ts                    # BVP-01
│   ├── siemens.ts               # BVP-02
│   ├── philips.ts               # BVP-03
│   ├── canon.ts                 # BVP-04
│   └── hologic.ts               # BVP-05
├── anonymize/
│   ├── index.ts                 # anonymize()
│   ├── annex-e-base.ts          # PS3.15 Annex E Basic Profile action table (ANON-01, ANON-05)
│   ├── retention.ts             # Option-set composition (ANON-02/03/04)
│   ├── uid-session.ts           # Per-session UID consistency map (ANON-06)
│   └── actions.ts               # D/Z/X/K/C/U action implementations
└── validate/
    ├── index.ts                 # validate()
    ├── file-meta.ts             # STRICT-03
    ├── vr-conformance.ts        # STRICT-04
    └── vm-conformance.ts        # STRICT-05

scripts/
└── generate-dictionary.ts       # devDependency — consumes Part 6 source → src/dictionary/generated.ts

test/
├── fixtures/
│   ├── canonical/               # One per transfer syntax (TEST-02)
│   ├── vendor-quirks/           # One per Tier 2 warning (TEST-05)
│   ├── vendor/                  # One per built-in profile (TEST-07)
│   ├── edge-cases/              # Truncated, empty, malformed (TEST-04)
│   └── README.md                # Source attribution per fixture (license tracking)
├── golden/                      # Round-trip snapshots (SER-02)
└── (mirror of src/ for unit tests)
```

### Deltas vs your proposal

| Proposed | Recommended change | Reason |
|---|---|---|
| `src/dataset/` includes VR parsers | Keep VR parsers under `src/dataset/vr/` (sub-module, not merged) | Matches pydicom `valuerep.py` + `@cosyte/hl7`'s `src/model/types/`. Easier to parallelize in Phase 3. |
| No separate `charset/` | **Add `src/charset/`** as a first-class module | Non-trivial (ISO 2022 stateful decoder, GB18030); cleaner to isolate from VR text parsers; reusable by serializer for encoding writes. Phase 4 CHARSET-* requirements deserve their own directory. |
| No separate `pixel/` | **Add `src/pixel/`** (your v1 only exposes, doesn't decode — but the seam matters) | This is the ABI that `@cosyte/dicom-pixel` will hook. Keeping it outside `dataset/` makes the package split trivial later. Also PIXEL-01/02 (raw vs encapsulated) are structurally different enough to deserve separate files. |
| Single `warnings.ts` in parser | **Share the warnings registry** between parser + strict-validator (both emit warnings) | Warnings aren't parser-private: strict-mode escalation needs the same codes. Put `warnings.ts` in `parser/` (as shown) but also consume it from `validate/`. |
| Implicit `src/types/` or `src/index.ts` types | No change needed — keep `types.ts` per module (as `@cosyte/hl7` does) | Co-location keeps changes localized. |
| No explicit `path/` module | **Add `src/path/`** (PATH-01..04 is non-trivial — AST parse + resolver) | `@cosyte/hl7` puts dot-path in `src/model/dot-path.ts`. Parity suggests a standalone file at minimum; small module given `0040A730[1]/00080100` grammar. |

### What's conspicuously NOT in the tree

- **No `network/`** — correct; DIMSE is `@cosyte/dicom-net`.
- **No `web/`** — correct; DICOMweb is `@cosyte/dicomweb`.
- **No `codec/`** — correct; pixel decoding is `@cosyte/dicom-pixel`.
- **No `sr/` (Structured Reporting)** — correct; out of scope.
- **No `dicomdir/`** — correct; roadmap, not v1.

---

## 2. Parser Pipeline Shape

### Target pipeline (left-to-right, all synchronous on a `Buffer`)

```
┌─ Input: Buffer | Uint8Array | ArrayBuffer ───────────────────────────────────┐
│                                                                                │
│   ① Normalize input → Buffer view                                              │
│   ② Detect preamble (offset 128 = "DICM"?)                                    │
│      ├─ present → strip 128-byte preamble, advance                            │
│      └─ absent  → emit DICOM_MISSING_PREAMBLE; try to start at offset 0       │
│                                                                                │
│   ③ Parse File Meta Information group (0002,xxxx)                             │
│      │  HARD-WIRED: Explicit VR Little Endian regardless of dataset TS         │
│      │  - Read (0002,0000) File Meta Group Length                              │
│      │  - Read elements until group-length bytes consumed                      │
│      │  - Validate group length vs bytes consumed                              │
│      │    - mismatch → DICOM_FILE_META_GROUP_LENGTH_MISMATCH (Tier 2)          │
│      │  - Extract (0002,0010) Transfer Syntax UID  ← REQUIRED                  │
│      ↓                                                                         │
│   ④ Transfer Syntax Dispatch                                                  │
│      ├─ 1.2.840.10008.1.2       → Implicit VR Little Endian parser            │
│      ├─ 1.2.840.10008.1.2.1     → Explicit VR Little Endian parser            │
│      ├─ 1.2.840.10008.1.2.2     → Explicit VR Big Endian parser               │
│      ├─ 1.2.840.10008.1.2.1.99  → zlib-inflate remainder → Explicit VR LE     │
│      └─ anything else           → throw UNSUPPORTED_TRANSFER_SYNTAX (fatal)   │
│                                                                                │
│   ⑤ Dataset Parse (per-TS strategy, but shared element/sequence logic)        │
│      loop until EOF:                                                           │
│        a. read element header (tag, VR if explicit, length)                   │
│           - Implicit VR → look up VR from Dictionary.lookup(tag)              │
│           - (profile's private-tag dict consulted here if a profile is active)│
│        b. if length == 0xFFFFFFFF → undefined length                           │
│           - warn DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR if TS is explicit      │
│           - parse until item/sequence delimiter                               │
│        c. VR dispatch:                                                         │
│           - SQ → recurse into sequence/item parser                            │
│           - OB/OW/OF (pixel data element) → fragment parser if encapsulated   │
│           - else → slice bytes into RawElement {tag, vr, length, byteOffset,  │
│                                                  rawBytes, valueLoader}       │
│           (valueLoader is LAZY — see §4)                                      │
│        d. apply tolerance rules (odd length, VR mismatch, etc.) → warnings    │
│        e. push RawElement into Dataset                                         │
│                                                                                │
│   ⑥ Attach: FileMeta, warnings[], profile?, Dataset                           │
│                                                                                │
└─ Output: Dataset (immutable view) ───────────────────────────────────────────┘
```

### Where does strict-mode escalation fit?

**A single chokepoint:** every `emitWarning(code, position, snippet)` call flows through one function. In strict mode that function throws `DicomParseError(code, position)` instead of pushing to the warnings array + invoking `onWarning`. This is the single cleanest implementation — do NOT sprinkle `if (strict) throw` checks at call sites.

```typescript
// parser/warnings.ts
export function emitWarning(ctx: ParseContext, code: WarningCode, msg: string, pos: number): void {
  const warning = { code, message: msg, position: pos, snippet: slice(ctx.buffer, pos) };
  if (ctx.strict) throw new DicomParseError(code, warning.message, pos, warning.snippet);
  ctx.warnings.push(warning);
  ctx.onWarning?.(warning);
}
```

This pattern is what `@cosyte/hl7` uses (verified by reading `src/parser/warnings.ts`) — **mirror it exactly**.

### Where do warnings get emitted?

| Warning code | Emitted in |
|---|---|
| `DICOM_MISSING_PREAMBLE` | `parser/part10-header.ts` |
| `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` | `parser/file-meta.ts` |
| `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` | `parser/sequence.ts` + `parser/explicit-le.ts`/`explicit-be.ts` |
| `DICOM_ODD_LENGTH_VALUE_PADDED` | `parser/element-header.ts` |
| `DICOM_VR_MISMATCH` | `parser/element-header.ts` (on Implicit→dict lookup mismatch or Explicit VR disagrees with dict) |
| `DICOM_PRIVATE_TAG_NO_CREATOR` | `parser/element-header.ts` (consults profile's private-tag map) |
| `DICOM_GROUP_LENGTH_IN_DATASET` | `parser/element-header.ts` (when group != 0002 but elem is 0000) |
| `DICOM_ODD_LENGTH_VALUE_PADDED` (UI trailing NULL) | `dataset/vr/uid.ts` (lazy — emitted on first read? **No — eager, to preserve byte-offset context.** See §4 decision.) |
| `DICOM_UNSUPPORTED_CHARSET` | `charset/index.ts` or on first PN/LO decode |
| `DICOM_BOM_IN_PN` | `charset/` or `dataset/vr/person-name.ts` |

**Architectural consequence:** warnings that depend on byte-offset context must be emitted at parse time, not lazy-decode time. That constrains the lazy-VR design in §4 — some VR warnings are emitted during the eager structural pass, even though decoded values are deferred.

### Where does profile attribution land?

Profile attachment happens at step ⑥, but the profile's **private-tag dictionary** is consulted during step ⑤(a) for implicit-VR lookup and during warning evaluation for `DICOM_PRIVATE_TAG_NO_CREATOR`. The profile is therefore threaded into `ParseContext` from the top of `parseDicom(buffer, profile)` and is accessed read-only throughout.

---

## 3. Dataset Model Shape

### Comparison across toolkits

| Toolkit | Top level | Sequences | Mutation model |
|---|---|---|---|
| **dicom-parser** | `{ byteArray, elements: { [tag]: { dataOffset, length, items?, ... } } }` | `items: [{ dataSet: {...nested byteOffset model...} }]` | No mutation API — read-only pointers into byte array |
| **dcmjs** (naturalized) | Plain JS object keyed by keyword (`{ PatientName: 'Doe^Jane', ReferencedSOPSequence: [...] }`) | Array of plain objects (each a naturalized dataset) | Direct object mutation |
| **pydicom** | `Dataset` (dict subclass, keyed by `Tag`) → `DataElement(tag, VR, value)` | `value` is `Sequence` = list of `Dataset` (recursive) | `ds.PatientName = 'Doe^Jane'` or `ds[0x00100010].value = ...` |
| **fo-dicom** | `DicomDataset` (IEnumerable<DicomItem> over SortedList<DicomTag, DicomItem>) | `DicomSequence : DicomItem` containing `DicomDataset[]` | `ds.AddOrUpdate(...)` |

### What to pick for `@cosyte/dicom`

**Recommendation: pydicom/fo-dicom model — nested `Dataset`, with `Sequence` wrapper containing `Item`s each of which IS a `Dataset`.**

```typescript
class Dataset {
  readonly fileMeta?: FileMeta;           // only on the root Dataset
  readonly warnings: readonly DicomParseWarning[];
  readonly profile?: Profile;

  has(tagOrKeyword: string): boolean;
  get(pathOrTag: string): Element | undefined;
  getAll(pathOrTag: string): Element[];
  elements(): IterableIterator<[Tag, Element]>;

  // Mutation returns a NEW Dataset (immutability); or an explicit in-place
  // variant — pick one and stick to it. Recommend: mutation methods return void,
  // but the Dataset exposes no field-level setters — only named mutators.
  setElement(tag: string, value: Element | RawValue): Dataset;
  addElement(el: Element): Dataset;
  removeElement(tag: string): Dataset;

  // Named helpers (Phase 4)
  readonly patient: PatientSummary;
  readonly study: StudySummary;
  // ...etc
}

class Element {
  readonly tag: Tag;                      // e.g. '00100010'
  readonly vr: VR;                        // 'PN', 'DA', 'SQ', ...
  readonly vm: number;                    // from dictionary or computed
  readonly length: number;
  readonly byteOffset: number;
  readonly rawBytes: Buffer;
  readonly value: unknown;                // LAZY — decoded on access, typed by VR
  readonly items?: Sequence;              // SQ only
}

class Sequence {
  readonly items: readonly Item[];
  [Symbol.iterator](): Iterator<Item>;
}

class Item extends Dataset {
  readonly index: number;
}
```

### Why this shape wins for TypeScript

1. **Narrowing feels natural.** `el.items` is optional on `Element`; a type guard (`el.vr === 'SQ'`) gives TS narrowing to `Sequence`. With a flat tag map you'd lose nesting entirely.
2. **Round-trip fidelity.** The parser preserves element order (insertion order on a Map), byte offsets, and original `rawBytes`. `toJSON()` (SER-06) can be a pure projection; `toBuffer()` (SER-01) can emit from the same structure. A DICOMJSON-style flat shape is a *projection* (`toJSON`), not the internal model.
3. **Immutability is cheap.** Copy-on-write: `setElement` returns a new Dataset sharing the underlying `Map`'s unchanged entries. No structural sharing bookkeeping required.
4. **Sequence navigation is trivial and typed.** `ds.get('0040A730')?.items?.[0]?.get('00080100')` is end-to-end type-safe.

### Why NOT the dicom-parser byte-offset model

It optimizes for pixel access (where zero-copy slicing into the source buffer matters) at the cost of DX: every access goes through `{ offset, length }` pairs and type-specific readers (`dataSet.string(tag)`, `dataSet.uint16(tag)`, ...). That's backward for a metadata-first, one-line-extraction library. Reserve the byte-offset style as an internal implementation detail of the *lazy value loader* (§4), not as the user-facing API.

### Why NOT the dcmjs naturalized-JSON shape as the default

It's a great *output* format (DICOM-JSON, for interop with DICOMweb responses), but as an internal model it loses:
- VR information (inferred from keyword at serialize time; brittle)
- Byte offsets for warnings
- Sequence-item identity (items are bare objects in an array)
- Private-tag round-trip (private creators get mangled)

Provide `ds.toJSON()` (SER-06) that emits a DICOM-JSON-ish structure. Don't BE one internally.

### Mutation + immutability reconciliation

The requirements say both "immutable by default" (MODEL-05) and "mutation methods exist" (MODEL-06). Resolve with:

- Dataset is a **class with readonly properties** exposing `Map`-backed internal state.
- Mutation methods (`setElement`, `addElement`, ...) **return a new Dataset** (copy-on-write semantics).
- No setters are exposed on `Element` — it is fully readonly.

This is slightly stricter than pydicom (which allows in-place mutation) and matches how `@cosyte/hl7` resolved the same tension. It's a deliberate TS-idiomatic choice.

---

## 4. VR Parsing — Lazy vs Eager

### The trade-off

| | Eager (decode all values at parse time) | Lazy (decode on first access, memoize) |
|---|---|---|
| Parse wall-clock (50 MB CT) | ~200–400 ms | ~10–30 ms (structure only) |
| First-read wall-clock | 0 (already done) | 1–5 ms per accessed element |
| Memory | Peak: parse-time + decoded-value buffers | Lower peak, grows with usage |
| Warning fidelity | All warnings emit at parse | Some warnings lose byte-offset context if emitted lazily |
| Implementation | Simpler | Needs caching + invalidation |

### Recommendation: LAZY with eager structural pass

**Eager** (at parse time, always):
- Tag, VR, length, byte offset, raw bytes slice — all captured up front in the structural pass.
- All **byte-offset-dependent warnings** (`DICOM_VR_MISMATCH`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`, `DICOM_GROUP_LENGTH_IN_DATASET`, `DICOM_PRIVATE_TAG_NO_CREATOR`).
- Sequence/item structure (can't defer — needed to know where the next top-level element starts).

**Lazy** (decoded on first `.value` access, cached on Element):
- PN parse into `{ family, given, ... }` (VR-01)
- DA/TM/DT → JS Date (VR-02)
- IS/DS → number / number[] (VR-03)
- UI → trimmed string (VR-04)
- US/UL/SS/SL/FL/FD/AT → number / number[] (VR-05, if array length > some threshold; single values cheap enough to decode eagerly)
- LT/ST/UT/LO/SH/CS/AE/AS/PN text decode (VR-07) — depends on charset, which depends on `(0008,0005)` being present in the same Dataset — lazy is actually cleaner here

### Caching story

On `Element`:

```typescript
class Element {
  // ...readonly structural fields...
  #decodedValue?: unknown;           // private cached result (including explicit undefined marker)
  #decoded = false;
  get value(): unknown {
    if (!this.#decoded) {
      this.#decodedValue = decodeVr(this.vr, this.rawBytes, this.#charsetRef);
      this.#decoded = true;
    }
    return this.#decodedValue;
  }
}
```

- Cache is element-local, single-slot.
- Invalidation: only on mutation (copy-on-write → new Element instance, fresh cache).
- Charset dependency is passed by reference to the Dataset's `(0008,0005)` so it stays correct even if that element is read lazily too.

### One nuance: warnings emitted during lazy decode

Some warnings are semantically VR-level (e.g., `DICOM_BOM_IN_PN`). If we defer decoding, these warnings won't appear in `ds.warnings` until a consumer reads that element. Two options:

1. **Eager-decode only the set of VRs whose warnings must surface early** (essentially: VR-04 UI trailing-NULL trim + any VR that touches charset). Small loss of laziness.
2. **Allow post-parse warning accumulation** — `ds.warnings` is a getter that snapshots the current warning list, which grows as lazy decodes happen. Simpler but the contract is less crisp.

**Recommend option 1.** Emit UI-trim warnings eagerly (it's one byte check — essentially free), and document that `DICOM_BOM_IN_PN` only surfaces when PN values are actually read. This matches the "pay for what you use" philosophy and keeps `ds.warnings` snapshot-stable.

### For a 50 MB metadata-first use case

A single-study 50 MB file is typically 20–50 MB of pixel data + 200 KB of metadata, with ~1000 elements. With lazy decoding:

- Structural pass: ~10 ms (1 pass over 200 KB of metadata + skip over pixel data slice).
- Developer reads 8 fields: ~1–2 ms total.
- Total: ~12 ms, vs. ~300 ms if we eagerly decode all 1000 elements.

This is the single largest performance lever for a metadata-first library. Lazy is correct.

---

## 5. Build Order — Validating the Phase Dependency Graph

### Stated dependencies in ROADMAP.md

```
Phase 1 → (nothing)
Phase 2 → Phase 1
Phase 3 → Phase 2
Phase 4 → Phase 3
Phase 5 → Phase 3
Phase 6 → Phase 2, Phase 3, Phase 5
Phase 7 → Phase 3, Phase 5
Phase 8 → Phase 2, 3, 4, 5, 6, 7
```

### What's right

- Phase 1 first (tooling + dictionary) — correct; every other phase consumes the dictionary.
- Phase 2 depends on Phase 1 — correct (Implicit VR parsing needs the dictionary for VR lookup).
- Phase 3 after Phase 2 — correct (model wraps parser output).
- Phase 5 depending on Phase 3 — correct (serializer emits the nested Dataset model).
- Phase 6 depending on 2/3/5 — correct (profiles override parse + affect round-trip).
- Phase 8 as capstone — correct.

### Gaps to flag

| Issue | Current | Should be |
|---|---|---|
| **Phase 3 transitively needs Phase 1** but doesn't say so | Phase 3 depends on Phase 2 only (which depends on Phase 1) | Transitive is fine, BUT Phase 3's VR parsers do lookups directly against `Dictionary.*` for keyword resolution (MODEL-07) and VM validation — state Phase 1 as a direct dependency |
| **Phase 5 needs a VR *encoder* table symmetric to Phase 3's decoder** | Phase 5 depends on Phase 3 (has decoder) and Phase 1 (dictionary) | The decoder and encoder are *different implementations* of the same VR table. Phase 5 must build its own `serialize/encode-vr/` tree. ROADMAP says this implicitly — make it explicit in Phase 5's plans (currently Plan 01 "emit-element-primitive-and-file-meta" may be hiding it) |
| **Phase 7 `validate()` needs the dictionary AND optionally the profile** | Phase 7 depends on Phase 3 + Phase 5 | Phase 7 STRICT-04 validates VR vs dictionary — dictionary dependency is via Phase 3 transitively (OK). But STRICT-04/05 against *private-tag* VR/VM requires a Profile's private-tag dict. Add Phase 6 as a dependency of Phase 7 (or explicitly document that `validate()` over private tags without a profile is best-effort). **This is a real architectural gap.** |
| **Phase 4 character-set decoding comes after Phase 3 but Phase 3 already exposes decoded text VRs (VR-07)** | Phase 3 decodes text VRs; Phase 4 adds charset | Architecturally: either (a) Phase 3's VR-07 returns raw Buffer + lazy decode callback populated in Phase 4, or (b) Phase 3 defaults to UTF-8 and Phase 4 replaces the decoder. Option (a) is cleaner — **the lazy-decode model from §4 makes this automatic**: in Phase 3, VR-07 stores raw bytes; in Phase 4, the decode function gains charset awareness. State this sequencing in Phase 3's success criteria. |
| **Phase 6's built-in vendor profiles need TEST fixtures** | BVP-06 requires "realistic vendor-shape fixture"; Phase 8 owns fixtures | Either Phase 6 owns minimal sample fixtures for its own tests and Phase 8 expands coverage, or Phase 6 waits on Phase 8. Current roadmap implies Phase 6 creates its own fixtures (Phase 8 is hardening). Make this explicit. |
| **Parallelization opportunity: Phase 4 + Phase 5 have disjoint module trees** | Phase 5 depends on Phase 3 only; Phase 4 depends on Phase 3 only | Phase 4 and Phase 5 can run in parallel once Phase 3 ships. Current roadmap orders them sequentially. The 8-phase structure is fine for a solo project but worth flagging that Phase 4 helpers and Phase 5 serializer share zero files. |

### Proposed dependency graph (corrected)

```
Phase 1 ───────────────────────┐
  ↓                            │
Phase 2 ───┐                   │
  ↓        │                   │
Phase 3 ───┼─── Phase 4        │
  ↓        └─── Phase 5 ←──────┘  (also depends on Phase 1 directly for dict-driven VR encode)
  ↓        ↓
  │        └─── Phase 6 ←── (depends on 2, 3, 5)
  ↓                 ↓
Phase 7 ←──────────┘
  ↓            (Phase 7 depends on 3, 5, 6 — add 6)
Phase 8 ← all
```

Everything else in the roadmap is correct.

---

## 6. Public API Surface — `src/index.ts` barrel

### Primary public exports

Modeled on `@cosyte/hl7`'s `src/index.ts` (which has served as a working example of the same pattern).

```typescript
// Version
export const VERSION: string;

// === Core parse/serialize entry points ===
export { parseDicom } from './parser/index.js';
export type { ParseOptions, OnWarningCallback } from './parser/types.js';

// === Dataset + Element model ===
export { Dataset } from './dataset/dataset.js';
export { Element } from './dataset/element.js';
export { Sequence } from './dataset/sequence.js';
export { Item } from './dataset/item.js';
export { FileMeta } from './dataset/file-meta.js';
export { Tag } from './dataset/tag.js';
export type { VR } from './dataset/vr/index.js';

// === Errors + Warnings ===
export { DicomParseError, FATAL_CODES } from './parser/errors.js';
export type { FatalCode } from './parser/errors.js';
export { WARNING_CODES } from './parser/warnings.js';
export type { WarningCode, DicomParseWarning, DicomPosition } from './parser/warnings.js';

// === Dictionary (namespace) ===
export * as Dictionary from './dictionary/index.js';
// Provides: Dictionary.lookup(tagOrKeyword), Dictionary.byKeyword(k),
// Dictionary.byTag(t), Dictionary.KNOWN_TAGS, Dictionary.entries()

// === VR value types (namespace — mirrors HL7.XPN pattern) ===
export * as VR from './dataset/vr/namespace.js';
// Provides: VR.PersonName, VR.DateTime, VR.AgeString, VR.PixelRepresentation, ...

// === Typed helper result types ===
export type {
  PatientSummary,
  StudySummary,
  SeriesSummary,
  InstanceSummary,
  EquipmentSummary,
  ImageSummary,
} from './helpers/types.js';

// === Tag path ===
export { parsePath, resolvePath } from './path/index.js';
export type { TagPath } from './path/types.js';

// === Pixel data ===
export type { PixelDataView, EncapsulatedPixelData } from './pixel/types.js';

// === Serialization ===
// to-buffer / to-json / pretty-print are instance methods on Dataset — no top-level exports needed.
export type { SerializeOptions } from './serialize/types.js';
export type { DicomJson } from './serialize/to-json.js';

// === Profiles ===
export { defineProfile, setDefaultProfile, getDefaultProfile, profiles } from './profiles/index.js';
export { ProfileDefinitionError } from './profiles/validate.js';
export type { Profile, DefineProfileOptions, PrivateTagDefinition } from './profiles/index.js';

// === Anonymize ===
export { anonymize } from './anonymize/index.js';
export type { AnonymizeOptions, RetentionOption, AnnexEAction } from './anonymize/index.js';

// === Validate ===
export { validate } from './validate/index.js';
export { ValidationError } from './validate/index.js';
export type { ValidationResult, ValidationErrorDetail } from './validate/index.js';
```

### Deliberately INTERNAL (not exported)

- `ByteStream` (parser internal)
- `parseImplicitLe` / `parseExplicitLe` / `parseExplicitBe` / `parseDeflated` — reachable only via `parseDicom()`
- Per-VR decoders as functions (exposed under the `VR` namespace as types, but the `decodePersonName()` function is internal — access via `element.value`)
- `ParseContext` (parser thread-local state)
- `emitWarning` (internal helper)
- Private-tag dictionary internals of built-in profiles (consumers use `profile.privateTags` accessor)
- Encapsulated-fragment low-level readers (consumer uses `ds.pixelData.fragments`)
- Charset decoder functions (reached via `element.value` on text VRs)

### API surface notes

- **Mirror `@cosyte/hl7`'s pattern of a namespace export for type-rich categories** (`HL7.*` → `VR.*`, `Dictionary.*`). This gives `import { VR } from '@cosyte/dicom'; let name: VR.PersonName` ergonomics.
- **Top-level functions are verbs** (`parseDicom`, `defineProfile`, `anonymize`, `validate`) — consistent verb-noun rhythm.
- **No placeholder types for companion packages.** Do not pre-declare `DimseClient`, `WadoResponse`, etc.
- **`ds.toBuffer()`, `ds.toJSON()`, `ds.prettyPrint()` are instance methods** — symmetric with `@cosyte/hl7`'s `Hl7Message.toString/toJSON/prettyPrint`.

---

## 7. Pixel Data Boundary

### Why it needs its own module

A `src/pixel/` module is the architectural seam for `@cosyte/dicom-pixel` to hook. Keeping pixel data code *inside* `src/dataset/` couples it to the dataset model in ways that make the eventual companion package awkward.

### Clean boundary shape

```typescript
// src/pixel/types.ts — v1 public types
export type PixelDataView =
  | { kind: 'raw'; bytes: Buffer; bitsAllocated: number; rows: number; columns: number; numberOfFrames: number }
  | EncapsulatedPixelData;

export interface EncapsulatedPixelData {
  kind: 'encapsulated';
  transferSyntaxUid: string;            // e.g., '1.2.840.10008.1.2.4.50' (JPEG Baseline)
  basicOffsetTable?: Buffer;
  fragments: readonly Buffer[];         // in order, (FFFE,E000) items
}

// src/dataset/dataset.ts
class Dataset {
  // ...
  get pixelData(): PixelDataView | undefined;  // reads (7FE0,0010), checks file's TS
}
```

### How `@cosyte/dicom-pixel` hooks this later

Two options, both work:

1. **Function-over-data:** `import { decode } from '@cosyte/dicom-pixel'; const frames = decode(ds.pixelData, { transferSyntax: ds.fileMeta.transferSyntaxUID });` — the companion package takes a `PixelDataView` and returns decoded pixel frames. This is the cleanest seam — zero changes needed in `@cosyte/dicom`.
2. **Extension:** the companion package patches `Dataset.prototype` with a `decodeFrames()` method. Less clean; avoid.

**Recommendation: option 1, always.** Keep `@cosyte/dicom` free of any pixel-decode API surface. This means `PixelDataView` *must* be an exported type (it's the boundary type), which is already accounted for in §6.

### What lives in `src/pixel/` in v1

- `raw.ts` — reads uncompressed `(7FE0,0010)` → `{ kind: 'raw', bytes: Buffer.slice, ... }` (zero-copy)
- `encapsulated.ts` — walks `(FFFE,E000)` item markers, extracts Basic Offset Table, returns fragments array
- `types.ts` — the boundary types
- `index.ts` — `getPixelData(dataset): PixelDataView | undefined`

---

## 8. Testing Shape + Freely-Licensed Fixtures

### Fixture directory layout (mirrors what `pydicom` + `@cosyte/hl7` do)

```
test/fixtures/
├── README.md                       # Per-file source + license attribution
├── canonical/
│   ├── ct-implicit-le.dcm          # TS-01 canonical
│   ├── mr-explicit-le.dcm          # TS-02
│   ├── us-explicit-be.dcm          # TS-03
│   └── sc-deflated-le.dcm          # TS-04
├── sequences/
│   ├── enhanced-mr-deep-sq.dcm     # Multi-frame functional groups
│   └── referenced-sop-sq.dcm
├── vendor-quirks/
│   ├── missing-preamble.dcm
│   ├── file-meta-group-length-wrong.dcm
│   ├── odd-length-value.dcm
│   ├── undef-length-sq-in-explicit.dcm
│   ├── vr-mismatch-known-tag.dcm
│   ├── private-tag-no-creator.dcm
│   ├── group-length-in-dataset.dcm
│   ├── multi-charset-pn.dcm        # CHARSET-02 ISO 2022 CJK
│   └── at-vr-multi-value.dcm
├── vendor/
│   ├── ge-mr.dcm
│   ├── siemens-ct.dcm
│   ├── philips-xa.dcm
│   ├── canon-us.dcm
│   └── hologic-mg.dcm
├── pixel/
│   ├── multi-frame-uncompressed.dcm
│   └── jpeg-baseline-encapsulated.dcm
└── edge-cases/
    ├── empty.dcm
    ├── truncated-file-meta.dcm
    ├── unsupported-ts.dcm
    └── non-dicom.bin
```

### Canonical publicly-licensed fixture sources

| Source | License | What it provides | Notes |
|---|---|---|---|
| **[pydicom/pydicom-data](https://github.com/pydicom/pydicom-data)** | MIT | CT / MR / US / SR / enhanced MR / multi-frame / test-cases across TS | Pydicom's upstream test corpus. Individual files retain their own attribution (see per-file LICENSE notes). Vendor: copy specific files with attribution. |
| **[pydicom](https://github.com/pydicom/pydicom)** in-repo `pydicom/data/test_files/` | MIT | Small curated set (CT_small, MR_small, JPEG-LS, RLE, explicit/implicit samples) | Bundled with pydicom itself; MIT. Well-curated, small, widely used as the reference corpus. |
| **[GDCM gdcmData (`gdcmData/` on SourceForge)](https://sourceforge.net/projects/gdcm/files/gdcmData/gdcmData/)** | BSD 3-Clause | Large corpus including every compressed TS, unusual encodings, DICOMDIR examples | Gold standard for "weird real-world" fixtures. Vendor-neutral. |
| **[robyoung/dicom-test-files](https://github.com/robyoung/dicom-test-files)** | MIT | Pre-curated mix of pydicom + GDCM + others | Single-source convenience; each fixture still carries its upstream license. |
| **[DICOM Standard Appendix samples](https://www.dicomstandard.org/current)** | Part of NEMA DICOM standard | Tiny reference IODs | Cite as DICOM standard; not redistributable bulk. |
| **[Rubo Medical sample files](https://www.rubomedical.com/dicom_files/)** | Mixed — check per-file | Modality-diverse samples | **Check each file's license individually before bundling.** Most are free for testing/demo use but not all redistributable. |
| **OFFIS dcmtk test data** | Various | Reference fixtures | Some files are licensed for redistribution, some are not. Check individually. |

### Fixture strategy for `@cosyte/dicom`

1. **In-repo, bundled:** minimal curated set (≤ 10 MB total) copied from pydicom-data + gdcmData with per-file attribution in `test/fixtures/README.md`. MIT + BSD-3-Clause attribution is compatible with MIT project licensing.
2. **Not bundled:** generate synthetic fixtures for vendor-quirk cases (missing preamble, wrong group length, odd lengths) via a small fixture-builder script. These are authored in-repo by us, so no license concern. Reference `sjoerdk/dicomgenerator` (MIT) for patterns.
3. **Optional download script:** `scripts/fetch-extended-fixtures.ts` pulls from pydicom-data / gdcmData for developers running the extended test suite. Not required for CI.
4. **Vendor-profile fixtures:** hand-crafted (potentially anonymized from Cosyte's own dogfood corpus) or synthesized to exercise each vendor's private-tag blocks. Not redistributed real patient data.

### Per-fixture README requirements

```markdown
# test/fixtures/README.md

## canonical/ct-implicit-le.dcm
- Source: pydicom/pydicom-data (file `CT_small.dcm`)
- License: MIT (pydicom)
- SHA-256: …
- Use: TS-01 canonical round-trip

## canonical/mr-explicit-le.dcm
- Source: GDCM gdcmData (file `…`)
- License: BSD 3-Clause (GDCM)
- SHA-256: …
- Use: TS-02 canonical round-trip

…
```

### Testing discipline

- **Round-trip snapshot tests** — parse → toBuffer → parse, assert structural equality. Use `test/golden/<fixture>.json` as a committed snapshot of the DICOM-JSON projection.
- **Warning-code tests** — every `vendor-quirks/*` fixture asserts one specific warning code fires in lenient mode AND asserts it throws the matching `DicomParseError` in strict mode (one test each).
- **Profile attribution tests** — for each of the 5 built-in profiles, parse with + without profile, assert warning count drops on a crafted fixture.
- **Fuzz parsing** (optional v1): random byte mutations on a canonical fixture should never segfault / infinite-loop, only throw typed errors. Not a REQ but defensible.

---

## Architectural Risks for v1

### R1: Charset decoder complexity (MEDIUM)
ISO 2022 stateful escape sequences for CJK (CHARSET-02) are genuinely hard. Scope carefully — v1 commits to "single-extension" cases per the requirement. Recommend owning your own table for ISO_IR 100/101/144/192/GB18030/GBK and deferring multi-extension ISO 2022 to a `DICOM_UNSUPPORTED_CHARSET` warning with UTF-8 fallback. `iconv-lite` would cover this if you decide to take the dep (one of the two budgeted runtime deps).

### R2: Transfer-syntax transcoding correctness (MEDIUM)
SER-03 transcodes between the 4 v1 TSes. Swapping Implicit↔Explicit is straightforward (add/remove VR bytes, re-size length field). Swapping endianness requires byte-swapping every numeric VR. Round-trip test coverage must include 4×4 = 16 transcoding paths (or at least the 12 non-identity ones). Easy to silently regress.

### R3: Immutability + mutation method semantics (LOW)
MODEL-05 says immutable; MODEL-06 says mutation methods exist. If mutation returns `this` (in-place) the immutability claim is misleading; if it returns a new Dataset the `.setElement(...).setElement(...)` chain has the right feel but costs a shallow copy per call. Pick copy-on-write + document it. Same choice `@cosyte/hl7` made — mirror exactly.

### R4: Private-tag dictionary correctness (MEDIUM)
Vendor-published private tag dictionaries (BVP-01..05) drift over time and are published in varying formats (GE in PDFs, Siemens in text files, Philips in CSVs). Treat each built-in profile's private-tag table as a *snapshot* with a `sourceVersion` field and an ADR-documented extraction procedure. Phase 6 should include a small `scripts/fetch-vendor-tags.ts` or at least commit the raw source alongside the compiled TS so updates are reproducible.

### R5: Phase 7 `validate()` depends on the profile system (MEDIUM — concrete roadmap gap)
See §5 above: if `validate()` validates private-tag VRs/VMs against a profile's private dictionary, Phase 7 needs Phase 6 to have shipped. Either (a) Phase 7 validates only standard tags and flags private tags as "unknown" (scoped v1 limitation), or (b) adjust the Phase 7 dependency list. Recommend (a) with a named follow-up for private-tag validation in v1.1.

### R6: Pixel encapsulation edge cases (LOW, but future-friction)
Even without decoding, walking encapsulated pixel data (PIXEL-02) requires parsing `(FFFE,E000)` items + optional Basic Offset Table. Get this right the first time because `@cosyte/dicom-pixel` will depend on the fragments array being correctly reconstructed. Include the JPEG-encapsulated fixture in the canonical test set.

---

## Sources

- [cornerstonejs/dicomParser](https://github.com/cornerstonejs/dicomParser) — ByteStream + byte-offset lazy model; module structure
- [dcmjs source + DICOMJSON model](https://github.com/dcmjs-org/dcmjs) — naturalized dataset + fast-dictionary pre-compile pattern
- [pydicom Dataset reference](https://pydicom.github.io/pydicom/dev/reference/generated/pydicom.dataset.Dataset.html) — dict-subclass Dataset, Sequence as list of Datasets
- [fo-dicom repo](https://github.com/fo-dicom/fo-dicom) — DicomDataset with IEnumerable<DicomItem>, SortedList backing
- [pydicom/pydicom-data](https://github.com/pydicom/pydicom-data) — MIT-licensed upstream test corpus
- [GDCM gdcmData on SourceForge](https://sourceforge.net/projects/gdcm/files/gdcmData/gdcmData/) — BSD 3-Clause canonical corpus
- [robyoung/dicom-test-files](https://github.com/robyoung/dicom-test-files) — curated MIT-compatible mirror
- [sjoerdk/dicomgenerator](https://github.com/sjoerdk/dicomgenerator) — synthetic fixture generator reference
- [dicom-parser performance note](https://www.npmjs.com/package/dicom-parser) — deferred decoding rationale
- [DICOM Standard](https://www.dicomstandard.org/current) — normative reference
- Sibling codebase: `@cosyte/hl7` at `/home/nschatz/projects/cosyte/hl7-parser/src/` — pattern parity reference (parser/warnings chokepoint, namespace exports, helpers shape, copy-on-write mutation)

---
*Architecture research for: DICOM Part 10 parser (Node.js / TypeScript metadata-first library)*
*Researched: 2026-04-22*

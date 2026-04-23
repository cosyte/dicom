# @cosyte/dicom — v1 Requirements

All requirements are user-facing behaviors a developer consuming `@cosyte/dicom` can verify. REQ-IDs are stable across phases and referenced from `ROADMAP.md` for traceability.

**Scope boundary:** v1 is metadata-first. Pixel data is exposed (raw `Buffer` + encapsulated fragments + uncompressed typed-array reshape) but **no codec-based decompression**. DIMSE network services and DICOMweb are explicit non-goals — tracked in "v2+ / Companion Packages" below.

**Research reconciliation:** This document was revised 2026-04-22 against `.planning/research/SUMMARY.md`. Deltas: 7 new REQs (SQ-05, PIXEL-04, DICT-06, ANON-08, ANON-09, ANON-10, TEST-09), ANON-02..04 expanded to cover all 11 PS3.15 Annex E option sets, plus amendments to TS-02/TS-04/VR-02..06/CHARSET-01..02/FM-03/MODEL-03/MODEL-05/STRICT-03/TOL-03/PROF-07/SER-06/TEST-02/TEST-05.

---

## v1 Requirements

### Project Setup & Build (SETUP)

- [ ] **SETUP-01** — Developer can run `pnpm install && pnpm build && pnpm test` from a clean clone and all three succeed.
- [ ] **SETUP-02** — Package publishes as dual ESM + CJS with a correct `exports` map; consumers on either module system resolve the right entry point. `attw` (`@arethetypeswrong/cli`) passes on the published tarball.
- [ ] **SETUP-03** — Package has **0–1** runtime dependencies in `package.json` (ceiling ≤ 3, enforced), each MIT/Apache-licensed and justified in an ADR committed under `.planning/`. Dev deps unconstrained. The data dictionary generator and the PS3.15 Annex E action-table generator are `devDependencies`, not runtime deps.
- [ ] **SETUP-04** — TypeScript consumers get full IntelliSense (types, JSDoc, `@example` tags) on every public API surface.
- [ ] **SETUP-05** — Repo targets Node 18.18+ and compiles to ES2022 with `"strict": true` and `"noUncheckedIndexedAccess": true`. Dev toolchain pinned to Node-18-compatible majors: Vitest 3.x, ESLint 9.x, TypeScript 5.9.x, tsup 8.5.x, Prettier 3.8.x, tsx 4.21.x, pnpm 10.33.x.
- [ ] **SETUP-06** — `pnpm lint` and `pnpm typecheck` pass with zero warnings.

### Data Dictionary Generator (DICT)

- [ ] **DICT-01** — Build-time generator consumes Innolitics' `dicom-standard/attributes.json` (MIT, pinned commit SHA, committed as an input artifact under `vendor/dicom-standard/`) and emits a fully-typed TS module mapping tag → keyword, VR(s), VM, and retired flag for every standard element.
- [ ] **DICT-02** — Generator is a `devDependency` / build-step (`pnpm build:dict` or pre-`build` hook); runtime has no network or filesystem dependency on the Part 6 source.
- [ ] **DICT-03** — Developer can import `Dictionary.lookup('00100010')`, `Dictionary.lookup('PatientName')`, and `Dictionary.byKeyword(...)` and receive the element metadata (keyword, VR, VM) with typed results.
- [ ] **DICT-04** — Developer can look up tag metadata in both hex (`00100010`) and keyword (`PatientName`) forms; the dictionary exposes bidirectional resolution.
- [ ] **DICT-05** — Generated dictionary is committed to the repo and regenerating produces byte-identical output; a CI check fails if the committed dictionary drifts from what the source would produce.
- [ ] **DICT-06** — Generator also produces a **UID dictionary** (Transfer Syntax UIDs, SOP Class UIDs, Well-Known Frame-of-Reference UIDs, etc.); consumed by `FM-04` for human-readable TS name resolution. Developer can call `Dictionary.uid('1.2.840.10008.1.2.1')` and receive `{ name: 'Explicit VR Little Endian', type: 'TransferSyntax', retired: false }`.

### Core Parsing — Part 10 File Structure (PARSE)

- [ ] **PARSE-01** — `parseDicom(buffer)` parses a DICOM Part 10 file (128-byte preamble + `DICM` magic + File Meta Information + dataset) and returns a typed `Dataset` object.
- [ ] **PARSE-02** — Parser reads the 128-byte preamble and `DICM` magic at byte offset 128; missing preamble is tolerated (Tier 2: lenient-mode warning `DICOM_MISSING_PREAMBLE`; strict-mode throw).
- [ ] **PARSE-03** — Parser preserves byte-offset positional context for every parsed element; warnings and errors carry the offset at which the deviation was detected.
- [ ] **PARSE-04** — Parser accepts a `Buffer`, `Uint8Array`, or `ArrayBuffer` input.
- [ ] **PARSE-05** — Parser rejects non-DICOM input with a fatal `DicomParseError(NOT_DICOM_PART_10)` carrying position + snippet.
- [ ] **PARSE-06** — Parser handles empty input with fatal `DicomParseError(EMPTY_INPUT)`.

### File Meta Information (FM)

- [ ] **FM-01** — Parser reads the File Meta Information group `(0002,xxxx)` using Explicit VR Little Endian (the standard-mandated encoding) regardless of the dataset's transfer syntax.
- [ ] **FM-02** — Parser exposes File Meta elements via `ds.fileMeta.transferSyntaxUID`, `ds.fileMeta.mediaStorageSopClassUID`, `ds.fileMeta.mediaStorageSopInstanceUID`, `ds.fileMeta.implementationClassUID`, `ds.fileMeta.implementationVersionName`, and `ds.fileMeta.sourceApplicationEntityTitle`.
- [ ] **FM-03** — Parser validates File Meta group length `(0002,0000)`: **missing** `(0002,0000)` is Tier 2 warning `DICOM_FILE_META_GROUP_LENGTH_MISSING` in lenient mode; **mismatch** against actual bytes consumed is Tier 2 warning `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` in lenient mode; missing Type 1 required elements is fatal `INVALID_FILE_META` in strict mode (and in lenient mode for truly unrecoverable File Meta).
- [ ] **FM-04** — Parser uses the File Meta `(0002,0010)` Transfer Syntax UID to select the dataset parser strategy; unsupported / unrecognised UIDs throw `DicomParseError(UNSUPPORTED_TRANSFER_SYNTAX)`. Human-readable TS names are resolved via the UID dictionary (DICT-06).

### Transfer Syntaxes (TS)

- [ ] **TS-01** — Parser handles **Implicit VR Little Endian** (`1.2.840.10008.1.2`) datasets: 4-byte length, VR inferred from the data dictionary.
- [ ] **TS-02** — Parser handles **Explicit VR Little Endian** (`1.2.840.10008.1.2.1`) datasets: VR encoded in the element header, including the 2-byte / 4-byte length distinction. **Long-form VRs (4-byte length with 2 reserved bytes):** `OB, OW, OF, OD, OL, SQ, UT, UN, UC, UR`. Parser asserts the 2 reserved bytes are `0x00 0x00`; non-zero reserved bytes emit `DICOM_NONZERO_RESERVED_BYTES`.
- [ ] **TS-03** — Parser handles **Explicit VR Big Endian** (`1.2.840.10008.1.2.2`) datasets with correct byte-order swapping for all numeric VRs (US, UL, SS, SL, FL, FD, AT, OW, OF, OD). **Special cases:** `AT` is two independent 2-byte swaps (group, then element — NOT one 4-byte swap); `OB` is byte-stream and never swapped regardless of byte order.
- [ ] **TS-04** — Parser handles **Deflated Explicit VR Little Endian** (`1.2.840.10008.1.2.1.99`) datasets: transparently inflates the deflated dataset using **RFC 1951 raw deflate** via `zlib.inflateRawSync` (NOT `zlib.inflateSync`, which expects RFC 1950 zlib-wrapped input and would silently fail). File Meta is not deflated; inflation begins after File Meta ends.

### Dataset Model & Access (MODEL)

- [ ] **MODEL-01** — Parsed `Dataset` exposes elements by tag: `ds.get('00100010')` returns a typed element; `ds.has(tag)` returns boolean.
- [ ] **MODEL-02** — Developer can iterate elements: `ds.elements()` yields `[tag, element]` pairs in original order.
- [ ] **MODEL-03** — Each element exposes `tag`, `vr`, `vm`, `length`, `value` (lazy, memoized — decoded on first access and cached), `rawBytes` (Buffer slice, source-of-truth), `byteOffset` (position in source), and `privateCreator?: string` (present for private tags resolved against an active profile or a declared private creator in the dataset). `parseDicom(buf, { copyValues: true })` opt-out copies value bytes instead of slicing, breaking buffer retention for memory-sensitive use cases.
- [ ] **MODEL-04** — Developer accessing a non-existent tag receives `undefined` (not a throw); `ds.getAll(tag)` returns `[]` for absent tags.
- [ ] **MODEL-05** — Parsed `Dataset` is immutable by default; mutation only via explicit methods. Mutation is **copy-on-write**: `setElement`, `addElement`, `removeElement`, `addItem`, `removeItem` return new `Dataset` objects without modifying the source. Iterator / view return types (`ds.elements()`, `ds.getAll()`) are `Readonly<...>` so downstream mutation cannot escape the immutability contract.
- [ ] **MODEL-06** — Developer can mutate via `ds.setElement('00100010', 'DOE^JANE')`, `ds.removeElement(tag)`, and see changes reflected on subsequent reads and serialization of the returned dataset.
- [ ] **MODEL-07** — Developer can resolve a tag from a keyword: `ds.get('PatientName')` and `ds.get('00100010')` are equivalent.

### Value Representation Parsing (VR)

- [ ] **VR-01** — Person Name (**PN**) parses into `{ family, given, middle, prefix, suffix }` with multi-group support (alphabetic / ideographic / phonetic groups separated by `=`); raw string always accessible. Multi-group is preserved as a 3-entry structure, not flattened.
- [ ] **VR-02** — Date (**DA**), Time (**TM**), DateTime (**DT**) parse into JS `Date` with valid truncations per DICOM format rules; unparseable values return `undefined` for the typed getter with raw string always accessible. Real-world quirks covered: ACR-NEMA legacy `YYYY.MM.DD` format tolerated with `DICOM_DA_LEGACY_FORMAT` warning; DT `±HH:MM` non-standard offset tolerated with `DICOM_DT_NONSTANDARD_OFFSET`; empty-string DA/TM/DT is valid (Type 2) and returns `undefined` without throwing; `19000101` sentinel is documented in README as "unknown-date" not an error; fractional seconds beyond JS `Date` millisecond precision preserved via raw string.
- [ ] **VR-03** — Integer String (**IS**) and Decimal String (**DS**) parse into `number` or `number[]` (VM > 1) respecting VM from the dictionary. Leading/trailing whitespace tolerated; non-integer content in `IS` emits `DICOM_IS_NONINTEGER_VALUE` warning (parser still returns best-effort numeric).
- [ ] **VR-04** — Unique Identifier (**UI**) parses as a string; trailing **NULL (0x00)** padding byte is trimmed silently; trailing **space (0x20)** padding is also trimmed but emits `DICOM_UI_TRAILING_SPACE` (spec mandates NULL pad, real files routinely ship space pad); odd lengths emit `DICOM_ODD_LENGTH_VALUE_PADDED`.
- [ ] **VR-05** — Binary numeric VRs (**US, UL, SS, SL, FL, FD, AT**) parse with correct endian handling per transfer syntax. **`AT` parses as a tag value (`gggg,eeee` pair):** under BE transfer syntax, two independent 2-byte swaps (group, then element), NOT one 4-byte swap. Multi-valued `AT` has no explicit separator — stride is always 4 bytes.
- [ ] **VR-06** — Binary byte VRs (**OB, OW, OF, OD, OL, UN**) expose the raw `Buffer` and do not attempt decoded interpretation. **Endian rules:** `OB` and `UN` are byte-streams and are never swapped regardless of transfer syntax; `OW`, `OF`, `OD`, `OL` swap per word (2 / 4 / 8 / 4 bytes respectively) under Explicit VR Big Endian.
- [ ] **VR-07** — Long-text VRs (**LT, ST, UT, UC, UR**) and short-string VRs (**LO, SH, CS, AE, AS, PN**) decode via `(0008,0005)` Specific Character Set (see CHARSET-\*); trailing whitespace / NULL padding is trimmed. Text VR raw bytes are stored at parse time; decoded strings are produced lazily (once `(0008,0005)` is known) and memoized per element.

### Sequences & Items (SQ)

- [ ] **SQ-01** — Sequences (**SQ**) parse into an ordered array of `Item` objects, each itself a nested `Dataset`.
- [ ] **SQ-02** — Parser handles both explicit-length and undefined-length sequences (with `Item` / `SequenceDelimitationItem` / `ItemDelimitationItem` markers `FFFE,E000` / `FFFE,E0DD` / `FFFE,E00D`).
- [ ] **SQ-03** — Parser tolerates undefined-length sequences in Explicit VR transfer syntaxes with Tier 2 warning `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`; strict mode throws.
- [ ] **SQ-04** — Developer can navigate sequence items: `ds.get('0040A730').items[0].get('00080100')` resolves an element inside the first item of the Referenced SOP Sequence.
- [ ] **SQ-05** — **CP-246 behavior:** when an element has `VR=UN` and length `0xFFFFFFFF` (undefined), the parser attempts SQ descent using Implicit VR LE as the inner encoding (the common case is a private SQ transcoded Implicit→Explicit that lost its VR); on successful parse, the element is promoted to `VR=SQ` and `DICOM_UN_PARSED_AS_SQ` is emitted; on failure, the element remains `VR=UN` with raw bytes preserved.

### Tag-Path Accessors (PATH)

- [ ] **PATH-01** — `ds.get('00100010')` resolves a tag in hex form.
- [ ] **PATH-02** — `ds.get('PatientName')` resolves a tag in keyword form.
- [ ] **PATH-03** — `ds.get('0040A730/00080100')` resolves a path into sequence items; slash separates sequence → item (defaulting to item 0) → inner tag; `0040A730[1]/00080100` targets a specific item index.
- [ ] **PATH-04** — Unresolvable paths return `undefined` rather than throwing; `ds.getAll(path)` returns `[]` for absent paths and flattens repetitions.

### Named Helpers (HELPERS)

- [ ] **HELPERS-01** — `ds.patient` exposes: `name` (parsed PN), `id`, `birthDate` (Date), `sex`, `age`, `identifiers[]`. All return `undefined` (not throw) when absent.
- [ ] **HELPERS-02** — `ds.study` exposes: `uid`, `id`, `date` (Date), `time` (Date), `description`, `accessionNumber`, `referringPhysicianName`.
- [ ] **HELPERS-03** — `ds.series` exposes: `uid`, `number`, `modality`, `description`, `date` (Date), `time` (Date), `bodyPartExamined`.
- [ ] **HELPERS-04** — `ds.instance` exposes: `uid`, `number`, `sopClassUid`, `sopInstanceUid`, `acquisitionDate` (Date), `contentDate` (Date).
- [ ] **HELPERS-05** — `ds.equipment` exposes: `manufacturer`, `modelName`, `stationName`, `institutionName`, `departmentName`, `softwareVersions`, `deviceSerialNumber`.
- [ ] **HELPERS-06** — `ds.image` exposes: `rows`, `columns`, `bitsAllocated`, `bitsStored`, `pixelRepresentation`, `samplesPerPixel`, `photometricInterpretation`, `planarConfiguration`, `numberOfFrames`, `pixelSpacing`, and the `frames()` iterator (see PIXEL-04).
- [ ] **HELPERS-07** — All helpers return `undefined` / empty arrays for missing optional data; never throw, even on an empty/minimal dataset.

### Character Set Decoding (CHARSET)

- [ ] **CHARSET-01** — String VRs that support extended character sets (**PN, LO, SH, LT, ST, UT, UC**) decode via `(0008,0005)` Specific Character Set. Baseline v1 support: ISO_IR 100 (Latin-1), 101 (Latin-2), 109 (Latin-3), 110 (Latin-4), 126 (Cyrillic), 127 (Arabic), 138 (Hebrew), 144 (Cyrillic/Ukrainian), 148 (Turkish), 166 (Thai), 192 (UTF-8), 203 (Latin-9), GB18030, GBK, and single-extension ISO 2022 IR 87 (Japanese Kanji), IR 13 (Japanese katakana), IR 149 (Korean).
- [ ] **CHARSET-02** — Multi-valued `(0008,0005)` (ISO 2022 code-extension sequences) is supported for single-extension cases in v1 (e.g., `ISO 2022 IR 6\ISO 2022 IR 87`). True multi-extension combinations (3+ entries or complex shift state) emit `DICOM_UNSUPPORTED_CHARSET` and fall back to UTF-8 with raw bytes still accessible. **Separator rule:** the `0x5C` multi-value separator in PN/LO/SH/LT/ST/UT/UC is split AFTER charset decoding, not before — avoiding the JIS `0x5C` collision bug; when in ISO 2022 shift state, `DICOM_CHARSET_AMBIGUOUS_SEPARATOR` is emitted if the split heuristic is uncertain.
- [ ] **CHARSET-03** — Raw `Buffer` value is always accessible on every element regardless of decoded string form, preserving the original bytes. Decoded string is lazy + memoized.

### Pixel Data (PIXEL)

- [ ] **PIXEL-01** — `ds.pixelData` exposes the raw `(7FE0,0010)` element as a `Buffer` for uncompressed transfer syntaxes (Implicit/Explicit VR Little Endian, Explicit VR Big Endian).
- [ ] **PIXEL-02** — For encapsulated (compressed) transfer syntaxes, `ds.pixelData.fragments` returns an ordered array of `Buffer` fragments (from the `(FFFE,E000)` item markers), plus the Basic Offset Table when present.
- [ ] **PIXEL-03** — v1 does NOT decode or decompress pixel data. The documented contract explicitly says pixel decoding is out of scope for v1 and directs users to the roadmap `@cosyte/dicom-pixel` package.
- [ ] **PIXEL-04** — **Uncompressed typed-array reshape.** For uncompressed transfer syntaxes, `ds.image.frames()` returns typed-array views over the existing `Buffer` shaped as `rows × columns × samplesPerPixel` per frame: `Uint8Array` when `bitsAllocated ≤ 8`, `Uint16Array` when `bitsAllocated ≤ 16` and `pixelRepresentation = 0`, `Int16Array` when `bitsAllocated ≤ 16` and `pixelRepresentation = 1`. Respects `planarConfiguration` (0 = interleaved, 1 = planar). For encapsulated transfer syntaxes, `ds.image.frames()` throws `DicomPixelDecodeNotSupportedError` directing users to `@cosyte/dicom-pixel`. This is array-view reshape of raw bytes, not codec-based decompression.

### Real-World Tolerance (TOL)

- [ ] **TOL-01** — Default parse mode is lenient; strict mode via `{ strict: true }` escalates every Tier 2 warning to a thrown `DicomParseError`.
- [ ] **TOL-02** — Tier 3 fatal errors throw `DicomParseError` with stable codes even in lenient mode: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`. Each error includes `message`, `position` (byte offset), `snippet`.
- [ ] **TOL-03** — Parser emits Tier 2 warnings with stable codes and byte-offset positional context. **Baseline warning-code catalog:** `DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISSING`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_VR_MISMATCH`, `DICOM_PRIVATE_TAG_NO_CREATOR`, `DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_GROUP_LENGTH_IN_DATASET`, `DICOM_BOM_IN_TEXT_VR`, `DICOM_UNSUPPORTED_CHARSET`, `DICOM_CHARSET_AMBIGUOUS_SEPARATOR`, `DICOM_UI_TRAILING_SPACE`, `DICOM_DA_LEGACY_FORMAT`, `DICOM_DT_NONSTANDARD_OFFSET`, `DICOM_IS_NONINTEGER_VALUE`, `DICOM_NON_ASCII_IN_ASCII_VR`, `DICOM_NONZERO_RESERVED_BYTES`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_EMPTY_ITEM_IN_SEQUENCE`, `DICOM_TRAILING_NULL_IN_TEXT_VR`, `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`, `DICOM_PIXEL_DATA_LENGTH_MISMATCH`, `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` (see ANON-08).
- [ ] **TOL-04** — `ds.warnings` is always an array of `DicomParseWarning` objects (possibly empty) on a parsed dataset. Warnings are snapshot-stable after parse (structural-pass warnings are emitted eagerly even though value decoding is lazy).
- [ ] **TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted.
- [ ] **TOL-06** — Missing preamble (`stripPreamble: 'tolerate'`, the default) parses files that start directly with File Meta and emits `DICOM_MISSING_PREAMBLE`; `stripPreamble: 'require'` throws fatal.
- [ ] **TOL-07** — Odd-length values are tolerated (padded per VR rules — space for text VRs, NULL for UI, NULL for OB) and emit `DICOM_ODD_LENGTH_VALUE_PADDED`; strict mode throws.
- [ ] **TOL-08** — A known tag whose in-file VR disagrees with the dictionary VR is tolerated: the parser trusts the encoded VR, records the deviation as `DICOM_VR_MISMATCH`, and keeps parsing; strict mode throws.
- [ ] **TOL-09** — Private tags in a `(gggg,0010-00FF)` range without a registered Private Creator are tolerated; emit `DICOM_PRIVATE_TAG_NO_CREATOR`; raw bytes remain accessible via `ds.get(tag)`.
- [ ] **TOL-10** — Group length elements `(gggg,0000)` appearing in non-File-Meta groups are tolerated; emit `DICOM_GROUP_LENGTH_IN_DATASET`; value is exposed but not used for parsing.

### Serialization & Round-Trip (SER)

- [ ] **SER-01** — `ds.toBuffer()` emits a valid DICOM Part 10 file (preamble + `DICM` + File Meta + dataset) in the dataset's original transfer syntax.
- [ ] **SER-02** — Round-trip `parseDicom → toBuffer → parseDicom` yields an equivalent `Dataset` object for every fixture (same elements, values, sequence structure). **Semantic equivalence, not byte-identity** — the serializer is conservative (Postel's Law) and may normalize padding, length encoding, and delimitation style; a separate round-trip byte-diff test is explicitly out of scope.
- [ ] **SER-03** — `ds.toBuffer({ transferSyntax: '1.2.840.10008.1.2.1' })` transcodes a dataset from its original transfer syntax to a target one (among the 4 v1-supported syntaxes); unsupported targets throw `UNSUPPORTED_TRANSFER_SYNTAX`.
- [ ] **SER-04** — Serializer always writes a correct File Meta group length `(0002,0000)` regardless of whether the source file had one.
- [ ] **SER-05** — Serializer always emits even-length values (pads per VR rules — space for text VRs, NULL for UI, NULL for OB) regardless of what was parsed; Postel's Law (conservative emitter).
- [ ] **SER-06** — `ds.toJSON()` returns a **DICOM-JSON Model per PS3.18 Annex F** (interoperable with DICOMweb services and dcmjs); `ds.prettyPrint()` returns a human-readable multi-line string for logging / debugging. `bulkDataMode` option (`'inline' | 'uri' | 'omit'`) is deferred to v1.x — v1 emits inline binary only.

### Profiles (PROF)

- [ ] **PROF-01** — `defineProfile({ name, ...options })` returns a valid `Profile` object; name is required.
- [ ] **PROF-02** — `defineProfile()` throws `ProfileDefinitionError` with a clear message for invalid input: bad tag syntax, malformed Private Creator block, duplicate keywords within a profile, unknown option keys.
- [ ] **PROF-03** — `extends: parentProfile` and `extends: [p1, p2]` inherit and compose options; merge semantics match spec (scalars overwrite, arrays concat+dedupe, `privateTags` deep-merge by creator, `onWarning` handlers chain).
- [ ] **PROF-04** — `profile.name`, `profile.description`, `profile.privateTags`, `profile.lineage` are readonly and reflect applied options.
- [ ] **PROF-05** — `profile.describe()` returns a non-empty human-readable summary containing the profile name.
- [ ] **PROF-06** — `parseDicom(buffer, profile)` applies profile behavior to the parse; `ds.profile?.name` and `ds.profile?.lineage` are set on the parsed dataset.
- [ ] **PROF-07** — **Private Creator block resolution.** Declared private tags are accessible by their profile keyword. The `(gggg,0010-00FF)` creator reservation rule is honored correctly: a Private Creator at `(gggg,00XX)` (where `0x10 ≤ XX ≤ 0xFF`) reserves the block `(gggg,XX00)–(gggg,XXFF)` — the element's low byte `XX` becomes the reserved sub-range's high byte. On read, private tags are resolved by the `(creatorString, low-byte-offset)` pair matched against the profile's registered creators; profile-supplied VR takes precedence over UN fallback. On write (via `setElement`), if no matching creator is reserved in the dataset, the serializer allocates a new creator slot. When a creator is reserved in the dataset but the active profile has no matching entry, `DICOM_PRIVATE_CREATOR_UNKNOWN` is emitted.
- [ ] **PROF-08** — `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manage a process-scoped default; explicit argument overrides; `parseDicom(buffer, { profile: null })` opts out for one call.
- [ ] **PROF-09** — Round-trip: a dataset parsed with a custom profile and re-serialized produces spec-clean DICOM (profile quirks affect parsing, not serialization).

### Built-in Vendor Profiles (BVP)

- [ ] **BVP-01** — `profiles.ge` ships and is authored via the public `defineProfile()` API, registering GE's published private tag dictionary and declaring its safe-private tag list (consumed by ANON-10).
- [ ] **BVP-02** — `profiles.siemens` ships and is authored via the public `defineProfile()` API, registering Siemens's published private tag dictionary (including the Siemens CSA header tags) and declaring its safe-private list.
- [ ] **BVP-03** — `profiles.philips` ships and is authored via the public `defineProfile()` API, registering Philips's published private tag dictionary and declaring its safe-private list.
- [ ] **BVP-04** — `profiles.canon` ships and is authored via the public `defineProfile()` API (formerly Toshiba), registering Canon/Toshiba's published private tag dictionary under **both** `TOSHIBA_*` and `CANON_*` creator strings (pre-2016 scanners use Toshiba creators; post-acquisition use Canon) and declaring its safe-private list.
- [ ] **BVP-05** — `profiles.hologic` ships and is authored via the public `defineProfile()` API, registering Hologic's published private tag dictionary and declaring its safe-private list.
- [ ] **BVP-06** — Each built-in profile reduces warnings on a realistic vendor-shape fixture versus lenient mode without a profile (verified by test).

### Profile Starter Kit (KIT)

- [ ] **KIT-01** — `examples/profile-starter-kit/` exists and contains every file needed to publish a profile package (package.json, tsconfig, tsup config, vitest config, ESLint config, sample src/, sample test/, sample fixture, CI workflow, publish workflow, README, CUSTOMIZING.md, LICENSE).
- [ ] **KIT-02** — Running `pnpm install && pnpm test` inside the starter kit succeeds against its sample fixture.
- [ ] **KIT-03** — `pnpm build` inside the starter kit produces a `dist/` with correct entry points matching `package.json` exports.
- [ ] **KIT-04** — `.github/workflows/ci.yml` and `publish.yml` are syntactically valid (verified by `actionlint` or equivalent).
- [ ] **KIT-05** — Starter kit `package.json` has correct `peerDependencies` on `@cosyte/dicom`, `publishConfig: { access: public }`, `files: [dist, ...]`, and working `build`/`test`/`lint` scripts.
- [ ] **KIT-06** — `CUSTOMIZING.md` is present and walks through the rename → swap base profile → define private tags → write fixtures → publish flow.
- [ ] **KIT-07** — Starter kit README uses `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` placeholders consistently.

### Anonymization / De-identification (ANON)

All PS3.15 Annex E references are to the current edition, sourced from a generator-produced attribute-action-table artifact (see Key Decisions in PROJECT.md), not hand-curated.

- [ ] **ANON-01** — `anonymize(ds)` applies the DICOM PS3.15 Annex E Basic Application Confidentiality Profile with no retention / clean options enabled (the default action set); returns a new `Dataset` (immutability preserved).
- [ ] **ANON-02** — `anonymize(ds, { retain: [...], clean: [...] })` composes **all 11 PS3.15 Annex E option sets** onto the Basic Profile:
  - **E.3.1 Clean Pixel Data** — requires pixel-data manipulation → throws typed error (see ANON-08).
  - **E.3.2 Clean Recognizable Visual Features** — requires pixel-data manipulation → throws typed error (see ANON-08).
  - **E.3.3 Clean Graphics** — removes graphic / text overlays in `(0070,xxxx)` elements and presentation states.
  - **E.3.4 Clean Structured Content** — sanitizes SR content trees (text values, code sequences); SR-aware cleaning is limited in v1 to PS3.15 Table E.1-1 actions (deep SR semantic cleaning deferred).
  - **E.3.5 Clean Descriptors** — sanitizes free-text description fields per the Annex E action table.
  - **E.3.6 Retain Longitudinal Temporal Information** — two variants: `{ option: 'LongitudinalTemporal', variant: 'fullDates' }` or `{ option: 'LongitudinalTemporal', variant: 'modifiedDates', shiftDays?: number }` (see ANON-03).
  - **E.3.7 Retain Patient Characteristics**.
  - **E.3.8 Retain Device Identity**.
  - **E.3.9 Retain UIDs** — disables the default `U` (replace UID) action per Annex E Table E.1-1.
  - **E.3.10 Retain Safe Private** — preserves private tags declared safe by the active profile (see BVP-01..05 safe-private lists).
  - **E.3.11 Retain Institution Identity**.
- [ ] **ANON-03** — When E.3.6 Longitudinal Temporal `modifiedDates` is active, `anonymize()` applies a **single per-session offset** (one `shiftDays` value, optionally one consistent minute offset) to every DA/TM/DT atomically across the dataset; DT timezone offsets are preserved, not naively shifted. `shiftDays` defaults to a random value generated once per session; callers may supply an explicit value for deterministic runs.
- [ ] **ANON-04** — Option-set composition is order-independent and internally deduplicated: providing the same option twice is idempotent; conflicting options (e.g., `retain: ['UIDs']` + a UID-rewriting rule from a caller-supplied extension) throw `AnonymizationConflictError` with the conflicting option names.
- [ ] **ANON-05** — Anonymization respects the per-action semantics from PS3.15 Annex E: `D` (replace with dummy value of compatible VR), `Z` (replace with zero-length value), `X` (remove element entirely), `K` (keep original value), `C` (clean / structured replacement per action table), `U` (replace UID with a consistent new UID per session).
- [ ] **ANON-06** — `anonymize` preserves internal UID consistency: if `(0020,000D) StudyInstanceUID` is replaced, every reference to that UID elsewhere in the dataset (e.g., `(0008,1110) Referenced Study Sequence > (0008,1155) Referenced SOP Instance UID`) is replaced with the same new UID, via a per-session UID map.
- [ ] **ANON-07** — Anonymization never throws on a missing optional element; absent tags are simply skipped. (ANON-08 is the exception — pixel-dependent options do throw.)
- [ ] **ANON-08** — **Pixel-dependent option-set guardrail.** Options requiring pixel-data manipulation (E.3.1 Clean Pixel Data, E.3.2 Clean Recognizable Visual Features) throw `DicomPixelDecodeNotSupportedError` directing users to `@cosyte/dicom-pixel`. Additionally: when `(0028,0301) BurnedInAnnotation = 'YES'` and no pixel handler is installed, `anonymize()` emits `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` (lenient) so callers cannot silently produce non-compliant output; strict mode throws.
- [ ] **ANON-09** — **PS3.15 audit-trail compliance.** `anonymize()` always populates `(0012,0062) PatientIdentityRemoved = 'YES'`, `(0012,0063) DeidentificationMethod` (human-readable string naming the Basic Profile + applied option sets), and `(0012,0064) DeidentificationMethodCodeSequence` (one item per applied option set, coded per Annex E Table CID 7050).
- [ ] **ANON-10** — **Retain Safe Private (E.3.10)** — option set preserves private tags explicitly declared safe by the active profile's `safePrivate` list (populated by BVP-01..05 from each vendor's published safe-private declarations). Private tags not on the safe list follow the Basic Profile's default action for private data (`X` — remove).

### Strict Mode & Structural Validation (STRICT)

- [ ] **STRICT-01** — `parseDicom(buffer, { strict: true })` escalates every Tier 2 warning to a thrown `DicomParseError`.
- [ ] **STRICT-02** — `validate(ds)` runs structural validation and returns `{ valid: boolean, errors: ValidationError[] }` without throwing.
- [ ] **STRICT-03** — Validator checks required File Meta elements `(0002,0001)` File Meta Information Version, `(0002,0002)` Media Storage SOP Class UID, `(0002,0003)` Media Storage SOP Instance UID, `(0002,0010)` Transfer Syntax UID, `(0002,0012)` Implementation Class UID; missing required elements produce typed errors.
- [ ] **STRICT-04** — Validator checks VR conformance for every element against the data dictionary; mismatches produce typed errors. **v1 scope: standard tags only.** Private-tag VR validation against profile dictionaries is deferred to v1.1.
- [ ] **STRICT-05** — Validator checks Value Multiplicity (VM) for every element against the data dictionary; non-conforming VM produces typed errors. **v1 scope: standard tags only** (same rationale as STRICT-04).

### Examples (EX)

- [ ] **EX-01** — `examples/read-tags.ts` runs end-to-end and demonstrates named-helper + tag-path access on a real CT DICOM file.
- [ ] **EX-02** — `examples/anonymize-study.ts` runs end-to-end and demonstrates the `anonymize()` API plus option-set composition (including at least one retention option and the audit-trail attributes).
- [ ] **EX-03** — `examples/walk-multi-frame-mr.ts` runs end-to-end and demonstrates sequence/item navigation on a multi-frame enhanced MR dataset.

### Testing & Fixtures (TEST)

- [ ] **TEST-01** — `pnpm test --coverage` reports ≥ 90% line coverage on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/`.
- [ ] **TEST-02** — Canonical fixtures exist and round-trip losslessly for: one CT (Implicit VR LE), one MR (Explicit VR LE), one US (Explicit VR BE), one SC (Deflated Explicit VR LE), one with a deep sequence (enhanced MR functional groups), one with private tags from a vendor, one with multi-frame pixel data, one with compressed pixel data (encapsulated fragments), and **one anonymization UID-cross-reference fixture** (multi-study / multi-series dataset exercising ANON-06 internal-UID consistency).
- [ ] **TEST-03** — Edge-case fixtures cover: missing preamble, File Meta group length mismatch, odd-length value padded, undefined-length sequence in explicit VR, VR mismatch for a known tag, group length in non-File-Meta groups, multi-valued `(0008,0005)` Specific Character Set, `AT` VR with multiple tag values.
- [ ] **TEST-04** — Malformed files throw `DicomParseError` with descriptive position/snippet (non-DICOM input, truncated File Meta, unsupported transfer syntax UID, empty input).
- [ ] **TEST-05** — `test/fixtures/vendor-quirks/` contains at least one fixture per Tier 2 scenario listed in TOL-03, each verified to emit the expected warning and still parse in lenient mode. **Required additions:** empty SQ item (`FFFE,E000 length=0`), CP-246 UN-undefined-length-as-SQ, GB18030 charset file, trailing-space-padded UI, non-ASCII bytes in ASCII-only VR (CS/AE/UI).
- [ ] **TEST-06** — Strict-mode escalation test: every Tier 2 vendor-quirks fixture throws `DicomParseError` under `{ strict: true }`.
- [ ] **TEST-07** — At least one fixture per built-in vendor profile (`ge`, `siemens`, `philips`, `canon`, `hologic`) demonstrates fewer warnings with the profile than without.
- [ ] **TEST-08** — Profile-authoring test suite covers: valid `defineProfile` output; `ProfileDefinitionError` cases; `extends` single + array; merge semantics per option category; default-profile set/get/opt-out; `profile.describe()`; `ds.profile` attribution; round-trip with custom profile.
- [ ] **TEST-09** — **Fixture provenance + CI PHI scan.** `test/fixtures/README.md` documents per-file source and license for every committed fixture. CI hook rejects any DA / DT within the last 120 years outside a synthetic-date allow-list, and any PN outside a synthetic-name allow-list — blocking accidental commits of real PHI-bearing files.

### Documentation (DOC)

- [ ] **DOC-01** — README renders cleanly on GitHub and npm with the one-sentence value prop as the first line, followed by badges.
- [ ] **DOC-02** — README contains a 30-second quickstart (install + parse + extract a patient name) in one copy-pasteable block.
- [ ] **DOC-03** — README has a feature list (6–8 bullets) highlighting developer-centric wins, including explicit "what's not in v1" (no pixel decompression, no network; uncompressed typed-array reshape IS included via `ds.image.frames()`).
- [ ] **DOC-04** — README has a "DICOM in 90 seconds" core-concepts section (≤ 2 paragraphs) covering dataset, tag, VR, transfer syntax, sequences, private tags.
- [ ] **DOC-05** — README covers the three access patterns (helpers / tag-paths / element iteration) with runnable examples.
- [ ] **DOC-06** — README Cookbook section contains recipes for: reading patient/study/series/instance metadata, iterating multi-frame pixel data fragments, reshaping uncompressed pixel data via `ds.image.frames()`, navigating sequences, anonymizing a study, extending an anonymization action set, "Write your first profile in 10 minutes", extending a profile, composing profiles, publishing a profile package, default profile, transcoding between transfer syntaxes, handling vendor quirks, pretty-printing a dataset.
- [ ] **DOC-07** — README has a top-level "Profiles" section covering authoring, extending, merge semantics, inspection, publishing, and the Private Creator block reservation rule (PROF-07) with a worked example.
- [ ] **DOC-08** — README "Real-World Tolerance" section explains the 3-tier deviation model (silent / warn / fatal) with a compact table, stable warning code table (from TOL-03), and a runnable warnings-iteration example.
- [ ] **DOC-09** — README "Error Handling" section covers `DicomParseError`, `DicomParseWarning`, `ProfileDefinitionError`, `ValidationError`, `DicomPixelDecodeNotSupportedError`, `AnonymizationConflictError` with examples. Explicitly documents the v1.1 deferral: `validate()` covers standard tags only; private-tag VR/VM validation arrives in v1.1.
- [ ] **DOC-10** — README "Anonymization" section documents the PS3.15 Annex E Basic Profile default + how to compose retention / clean option sets (all 11) + the audit-trail attributes written by ANON-09.
- [ ] **DOC-11** — README "Scope & Companion Packages" section explicitly calls out: pixel decode → future `@cosyte/dicom-pixel`; DIMSE → future `@cosyte/dicom-net`; DICOMweb → future `@cosyte/dicomweb`.
- [ ] **DOC-12** — README "Contributing" section points to CONTRIBUTING.md and invites vendor quirk fixtures, profile improvements, and standalone profile packages.
- [ ] **DOC-13** — README ends with "Built by [Cosyte](https://cosyte.com)" and a license link.
- [ ] **DOC-14** — Roadmap / stretch goals section documents: pixel decoding package (RLE Lossless = #1 post-v1 addition), DIMSE package, DICOMweb package, SR semantics, DICOMDIR, streaming parser, typed IOD overlays, schema-aware validation (private tag VM/VR in `validate()`), DICOM-JSON `bulkDataMode: 'uri' | 'omit'`, ISO 2022 multi-extension CJK.
- [ ] **DOC-15** — CHANGELOG.md exists in Keep-a-Changelog format with an `[Unreleased]` section.
- [ ] **DOC-16** — LICENSE (MIT) exists at repo root.

---

## Requirements Count

| Category | Count |
|---|---|
| SETUP | 6 |
| DICT | 6 |
| PARSE | 6 |
| FM | 4 |
| TS | 4 |
| MODEL | 7 |
| VR | 7 |
| SQ | 5 |
| PATH | 4 |
| HELPERS | 7 |
| CHARSET | 3 |
| PIXEL | 4 |
| TOL | 10 |
| SER | 6 |
| PROF | 9 |
| BVP | 6 |
| KIT | 7 |
| ANON | 10 |
| STRICT | 5 |
| EX | 3 |
| TEST | 9 |
| DOC | 16 |
| **Total** | **144** |

---

## v2+ / Companion Package Requirements (Deferred)

Explicitly not part of v1. Listed here so contributors know where each belongs:

**Future `@cosyte/dicom` v1.1 (point release):**

- `validate()` covers private tags against profile dictionaries (STRICT-04/05 extension)
- RLE Lossless pixel decode (`~40 LOC`; #1 post-v1 addition)
- Full ISO 2022 multi-extension CJK charset combinations (CHARSET-02 extension)
- `ds.toJSON({ bulkDataMode: 'uri' | 'omit' })` (SER-06 extension)

**Future `@cosyte/dicom` v2+ (same package):**

- Streaming / pull-parser API for huge files
- Typed IOD / SOP-class overlays (`ds.is('CT Image Storage')` narrows the dataset type)
- IOD-level required-tag validation per SOP class
- DICOMDIR parsing / writing (media filesets)
- Multi-frame Functional Groups typed shortcuts
- JSON Schema / Zod emission for `toJSON()` output
- DICOM SR document semantics beyond raw dataset access

**Companion packages (future):**

- `@cosyte/dicom-pixel` — pixel decoding across compressed transfer syntaxes (JPEG Baseline, JPEG 2000, JPEG-LS, RLE Lossless, HTJ2K); windowing / LUTs / overlays / presentation states
- `@cosyte/dicom-net` — classic DIMSE services over TCP (C-ECHO, C-STORE, C-FIND, C-MOVE, C-GET, N-\*)
- `@cosyte/dicomweb` — QIDO-RS / WADO-RS / STOW-RS clients (and maybe servers)

## Out of Scope (permanently)

- **HL7 v3 / CDA** — different spec family (see `@cosyte/hl7` / future `@cosyte/ccda`)
- **FHIR conversion** — different spec family; separate concern
- **DICOS** (security / baggage screening) — different deployment context entirely
- **DICOM print management** — effectively dead protocol
- **DICOM-RT IOD semantics** (RT Plan, RT Dose, RT Structure Set beyond raw dataset access) — domain-specific; best served by a dedicated RT library

---

## Traceability

Every v1 REQ-ID maps to exactly one phase in `ROADMAP.md`. 144 / 144 mapped.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SETUP-01..06 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| DICT-01..06 | Phase 1 — Project Foundation & Data Dictionary | Pending |
| TEST-09 | Phase 1 — Project Foundation & Data Dictionary (CI scan; provenance doc in Phase 8) | Pending |
| PARSE-01..06 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| FM-01..04 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TS-01..04 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| TOL-01..10 | Phase 2 — Core Parser & Transfer Syntaxes | Pending |
| MODEL-01..07 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| VR-01..07 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| SQ-01..05 | Phase 3 — Dataset Model, VR Parsing & Sequences | Pending |
| PATH-01..04 | Phase 4 — Named Helpers, Paths, Character Sets & Pixel Exposure | Pending |
| HELPERS-01..07 | Phase 4 — Named Helpers, Paths, Character Sets & Pixel Exposure | Pending |
| CHARSET-01..03 | Phase 4 — Named Helpers, Paths, Character Sets & Pixel Exposure | Pending |
| PIXEL-01..04 | Phase 4 — Named Helpers, Paths, Character Sets & Pixel Exposure | Pending |
| SER-01..06 | Phase 5 — Serialization & Round-Trip | Pending |
| PROF-01..09 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| BVP-01..06 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| KIT-01..07 | Phase 6 — Profile System, Vendor Profiles & Starter Kit | Pending |
| ANON-01..10 | Phase 7 — Anonymization & Strict Validation | Pending |
| STRICT-01..05 | Phase 7 — Anonymization & Strict Validation | Pending |
| EX-01..03 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| TEST-01..08 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |
| DOC-01..16 | Phase 8 — Testing Hardening, Examples & Documentation | Pending |

**Coverage:** 144 / 144 v1 REQ-IDs mapped (no orphans, no duplicates). Note: TEST-09 has a split implementation — the PHI CI scan lands in Phase 1 (infrastructure) and the fixture-provenance README lands in Phase 8 (docs).

*Last updated: 2026-04-22 after research reconciliation (v2 — see `.planning/research/SUMMARY.md`).*

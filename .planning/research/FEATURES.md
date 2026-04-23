# Feature Landscape: `@cosyte/dicom` v1 (Metadata-First DICOM Parser)

**Domain:** Developer-focused DICOM Part 10 parser / utility library (Node.js + TypeScript)
**Researched:** 2026-04-22
**Mode:** Ecosystem + gap audit against existing 137-req draft
**Consumer:** Human reviewer will reconcile findings against `.planning/REQUIREMENTS.md`

---

## Executive Summary

The existing 137-req / 22-category draft is **broadly fit-for-purpose** and **slightly heavy in ceremony (DOC-16 items, KIT-07 items) but thin on three concrete DICOM-correctness fronts**:

1. **PS3.15 Annex E option sets** — the standard defines **11** options as of DICOM 2024e/2025e. The draft names 3. This is the single largest concrete gap.
2. **Private tag handling subtleties** — PROF-07 and TOL-09 name the `(gggg,0010-00FF)` reservation concept but don't capture block-offset resolution, element-number math, or the "Private Creator itself is at `(gggg,00xx)` and reserves `(gggg,xx00)–(gggg,xxFF)`" rule. This is the fiddly part where every competing library has gotchas.
3. **Date/time VR quirks** — VR-02 only says "valid truncations"; real-world DA/TM/DT has a zoo of deviations (BCE dates, missing components, seconds-field `.FFFFFF` precision loss, offsets like `+HHMM` vs `+HH:MM`, pre-1970 birth dates in systems storing seconds-since-epoch, empty-string-vs-null handling).

Against `dicom-parser`, `dcmjs`, and pydicom the draft's DX differentiators (named helpers, lenient-default with stable warning codes, vendor profile system, strict TypeScript with `noUncheckedIndexedAccess`) are **genuinely novel in the Node ecosystem** — no incumbent delivers all four. The metadata-first / no-pixel-decode boundary is defensible; the one borderline call is uncompressed pixel reshape (see §3).

---

## 1. Table Stakes — What a DICOM parser MUST do

Failing any of these = "toy library" in the eyes of an integration developer evaluating for production use. Cross-checked against the reference library set:

| Library | Role | License |
|---|---|---|
| [`cornerstonejs/dicomParser`](https://github.com/cornerstonejs/dicomParser) | Venerable JS parser; weakly typed; byte-offset oriented | MIT |
| [`dcmjs-org/dcmjs`](https://github.com/dcmjs-org/dcmjs) | JS DICOM manipulation incl. DICOM-JSON round-trip | MIT |
| [DCMTK `private.dic`](https://github.com/InsightSoftwareConsortium/DCMTK/blob/master/dcmdata/data/private.dic) | C++ reference toolkit | BSD-style |
| [pydicom](https://github.com/pydicom/pydicom) | Python reference; best DX in ecosystem | MIT |
| `fo-dicom` | .NET reference | MS-PL |
| [dicom3tools (Clunie)](https://github.com/QIICR/dicom3tools) | C++ toolkit by a standards author | BSD-ish |

### Table stakes, cross-checked

| Capability | dicom-parser | dcmjs | pydicom | DCMTK | Draft status |
|---|---|---|---|---|---|
| Parse Part 10 preamble+`DICM`+File Meta+dataset | Y | Y | Y | Y | **PARSE-01** |
| Implicit VR LE | Y | Y | Y | Y | **TS-01** |
| Explicit VR LE | Y | Y | Y | Y | **TS-02** |
| Explicit VR BE | partial | Y | Y | Y | **TS-03** |
| Deflated Explicit VR LE | Y | Y | Y | Y | **TS-04** |
| 2-byte vs 4-byte length distinction (OB/OW/OF/SQ/UT/UN) | Y | Y | Y | Y | **TS-02** |
| Undefined-length SQ with Item / Delim markers | Y | Y | Y | Y | **SQ-02** |
| Data dictionary lookup (tag → VR/keyword/VM) | Y (bundled) | Y | Y | Y | **DICT-01..05** |
| Private tag Private Creator resolution | weak | Y | Y (best) | Y | **PROF-07, TOL-09** (see gap §4 PROF) |
| PN parsing into family/given/middle/prefix/suffix | N (raw) | partial | Y | Y | **VR-01** |
| DA/TM/DT → native date type | N | partial | Y | Y | **VR-02** |
| IS/DS multi-valued number parsing | N | Y | Y | Y | **VR-03** |
| `(0008,0005)` Specific Character Set decoding | weak (UTF-8 assumed) | Y | Y | Y | **CHARSET-01..03** |
| Raw pixel data exposure (Buffer + fragments) | Y | Y | Y | Y | **PIXEL-01..03** |
| Round-trip (parse → modify → write) | N | Y | Y | Y | **SER-01..06** |
| DICOM-JSON style output | N | **Y (canonical)** | Y | partial | **SER-06** |
| Byte-offset-positional errors/warnings | partial | weak | Y | Y | **PARSE-03, TOL-03** |
| Keyword-form access (`PatientName`) | N | Y | **Y (primary)** | Y | **DICT-04, MODEL-07, PATH-02** |

**Verdict:** the draft covers every table-stake item. Nothing missing from the table-stakes axis. The honest weakness against the best-in-class reference (pydicom) is **depth of correctness per VR**, not breadth of feature.

---

## 2. Differentiators — Where `@cosyte/dicom` can beat incumbents on DX

Ranked by impact on a developer who has previously used `dicom-parser` or `dcmjs`:

### Rank 1 — Named metadata helpers (`ds.patient.name`, `ds.study.date`, …)
**No incumbent in the Node ecosystem ships this.** `dicom-parser` requires `element.string('x00100010')` and manual PN splitting. `dcmjs` ships a "naturalized" form (keyword keys) but no semantic bundles. pydicom has `ds.PatientName` but not a `patient` grouping object. This is the single most-valuable DX win and most directly hits the north-star sentence. **HELPERS-01..07 correctly encode this.**

### Rank 2 — Strict TypeScript + `noUncheckedIndexedAccess`
`dicom-parser` has community `@types/*` that are loose. `dcmjs` is JS-first with types added later. `dicom.ts` is closer but tiny in adoption. A first-party strict-TS library with full IntelliSense is a wide-moat differentiator. **SETUP-04, SETUP-05 cover this.**

### Rank 3 — Lenient default + stable warning codes + byte-offset context
Integration developers need to *programmatically react* to deviations, not just log them. The 3-tier model (silent / warn with stable code / fatal) with byte-offset context on every warning is absent from `dicom-parser` and `dcmjs`. pydicom has `dicom_validate` but not a per-element warning stream with stable codes. **TOL-01..10 cover this.** (The HL7 sibling validated this pattern at scale.)

### Rank 4 — First-class vendor profile system
`dicom-parser` and `dcmjs` have no profile concept. pydicom has `add_private_element`/`private_block` but no "define-a-profile-and-compose-it" abstraction. The starter-kit growth loop is a real differentiator *if* the kit is frictionless. **PROF-01..09, BVP-01..06, KIT-01..07 cover this.**

### Rank 5 — Build-time dictionary with CI drift gate
Most Node libraries hand-maintain or lazy-download the dictionary. A byte-identical regen CI check (DICT-05) is quietly excellent — prevents drift and makes "upgrade to DICOM 2026e" a one-command operation.

### Rank 6 — PS3.15 Annex E anonymization with composable retention options
`dcmjs` has an anonymizer but it's largely hardcoded. pydicom's `deid` project is option-based but complex. A first-party, Annex-E-aligned anonymizer with Options-as-data is a real selling point — **but ANON-01..07 is under-specified** (see gap §5).

### Rank 7 — Transcoding between v1 transfer syntaxes
`dcmjs` does this. `dicom-parser` does not. Worth including (SER-03) but not a headline.

### Rank 8 — Round-trip byte equivalence + conservative emitter
**Not byte-identical round-trip**, but semantically-equivalent with always-clean emitter output (SER-04, SER-05). Postel's Law framing is a selling point; the HL7 sibling proved this reads well in the README.

### Rank 9 — `prettyPrint()` and `toJSON()` debugging surface
Not novel but polish. DICOM-JSON format is a standard (PS3.18 §F) and `toJSON()` should emit that format specifically — **SER-06 currently says "DICOM-JSON-style" which is ambiguous; should be a firm commitment.**

---

## 3. Anti-Features — Deliberately NOT in v1

The draft's Out-of-Scope list is broadly correct. Per-item verdict:

| Out-of-scope item | Verdict | Rationale |
|---|---|---|
| JPEG Baseline decode | **Correct** | Requires binding or port of libjpeg; huge scope |
| JPEG 2000 / JPEG-LS / HTJ2K decode | **Correct** | Even more scope; `@cosyte/dicom-pixel` makes sense |
| RLE Lossless decode | **Borderline — flagged below** | RLE is trivial to implement from PS3.5 §8.2.2 (~50 LOC). Most metadata libraries include it. See §3.1. |
| Uncompressed pixel data **reshape** (Buffer → `Uint16Array[frame][row][col]`) | **Borderline — flagged below** | No codec needed. See §3.2. |
| Windowing / LUT / rendering | **Correct** | Downstream of decode |
| DIMSE / DICOMweb | **Correct** | Own package per spec |
| SR semantics | **Correct** | Domain-specific |
| DICOMDIR | **Correct** | Own format; niche |
| DICOS / RT / print | **Correct** | Out-of-domain |
| Streaming parser | **Correct** for v1 | Real production benefit but rare on metadata-only work |
| Typed IOD overlays | **Correct** for v1 | Massive per-IOD work |
| IOD-level validation | **Correct** for v1 | STRICT-02..05 does structural; IOD is its own beast |
| JSON Schema / FHIR conversion | **Correct** | Separate spec family |

### 3.1 — RLE decode specifically

RLE Lossless (`1.2.840.10008.1.2.5`) is a PackBits variant, ~40 lines of TypeScript. It decodes one fragment into one frame of pixel bytes. No external codec dep. Every major DICOM library includes it even when they skip JPEG.

- `dcmjs` includes RLE decoding.
- pydicom handles RLE in pure Python (no codec dep).
- dicom3tools handles RLE.

**Question for the human reviewer:** is the "no decode at all, even RLE" line a clean message ("zero codec runtime") or is it closing off a cheap DX win? Shipping RLE decode would add ~1 small module, one PIXEL-* requirement, and would let a meaningful chunk of oncology/CT archives produce a usable `Uint16Array` with v1. **Recommendation: keep RLE out of v1 to preserve the crisp "no pixel decode" message, but flag it as the #1 candidate for a v1.x point release if adoption demands it.**

### 3.2 — Uncompressed pixel reshape

For uncompressed transfer syntaxes (ImplicitVR LE, ExplicitVR LE, ExplicitVR BE), `(7FE0,0010)` is already a linear `Buffer`. "Reshape" means: given `rows`, `columns`, `bitsAllocated`, `samplesPerPixel`, `numberOfFrames`, `planarConfiguration`, `pixelRepresentation`, slice the Buffer into `frames: Uint8Array[] | Uint16Array[] | Int16Array[]`. **This is not decoding** — it's typed-array construction over an existing Buffer with endian handling.

This is a genuinely in-scope DX win that the current draft misses:

- PIXEL-01 exposes the raw Buffer.
- `ds.image.numberOfFrames`, `rows`, `columns`, `bitsAllocated` are already in HELPERS-06.
- A `ds.image.frames()` helper returning a `TypedArray[]` for uncompressed TS only (with a stable error for encapsulated TS saying "install `@cosyte/dicom-pixel`") would be ~30 LOC and is a common metadata-integration use case (frame indexing, hash-for-dedup, identity check that the pixel data length matches the declared geometry).

**Recommendation: add one requirement, e.g., `PIXEL-04` — "For uncompressed transfer syntaxes, `ds.image.frames()` returns an array of typed-array views over the pixel-data Buffer shaped to `rows × columns × samplesPerPixel` per frame, respecting `bitsAllocated`, `pixelRepresentation`, and `planarConfiguration`. For encapsulated transfer syntaxes, throws a typed error directing the caller to `@cosyte/dicom-pixel`."** This is a cheap, no-codec, typed-array reshape that differentiates sharply from `dicom-parser` and matches what dcmjs does today.

---

## 4. Per-Category Gap Analysis (all 22 categories)

Rated: **OK** (looks complete) / **MINOR** (small tightening) / **MAJOR** (real content missing).

### SETUP (6 reqs) — **OK**
Matches HL7 sibling's pattern. No gap.

### DICT (5 reqs) — **MINOR**
- **Gap DICT-A:** The DICOM Part 6 source is XML with UID dictionaries (PS3.6) **and** a transfer-syntax UID dictionary (PS3.6 Annex A), and SOP-class UIDs (PS3.4 / PS3.6). The draft names "tag → keyword + VR + VM" but doesn't commit to UID dictionary coverage. For `FM-04` transfer-syntax recognition, an authoritative UID → human name map is needed. Recommend adding a sub-bullet to DICT-01 covering the UID dictionary (Transfer Syntax UIDs, SOP Class UIDs, Well-Known Frame-of-Reference UIDs).
- **Gap DICT-B:** DICT-03's signature `Dictionary.lookup('00100010')` should also accept `0x00100010` (numeric) and `(0010,0010)` (display) forms — minor, consider calling out tolerated input forms explicitly.

### PARSE (6 reqs) — **OK**
One latent gap: PARSE-04 lists Buffer / Uint8Array / ArrayBuffer. **Consider explicitly excluding or including** `Blob` / `File` / `ReadableStream` — these matter for browser/edge usage even in a Node-first library. Current scope note "v1 reads full files into a Buffer" in PROJECT.md covers this but not in REQUIREMENTS.

### FM (4 reqs) — **OK**
One subtle point: FM-01 is correct that File Meta is *always* Explicit VR LE — but `(0002,0000)` File Meta Group Length is 4-byte UL, and some real-world files have it **missing entirely** (not just mismatched). FM-03 says "mismatch" — should also cover **missing** explicitly. Recommend tightening FM-03 wording or adding a bullet to TOL-03.

### TS (4 reqs) — **OK**
Covers all 4 v1 syntaxes. Two real-world gotchas not captured:
- **"1.2.840.10008.1.2" ambiguous with trailing spaces** — some writers pad the UID. UI padding handling (trailing NULL per VR-04) resolves this, but it's worth a vendor-quirk fixture.
- **Explicit VR BE is formally retired** (DICOM 2006). The draft correctly includes it (real archives have it) but should note in DOC-11 that shipping support here is deliberate despite retirement — helps answer "why bother" PR reviews.

### MODEL (7 reqs) — **MINOR**
- **Gap MODEL-A:** MODEL-03 lists `tag, vr, vm, length, value, rawBytes, byteOffset` — but not **`privateCreator`** for private elements. Real-world DX needs `element.privateCreator === 'GEMS_ACQU_01'` to disambiguate. Recommend adding `privateCreator?: string | undefined` to the element shape.
- **Gap MODEL-B:** MODEL-02 `ds.elements()` yields `[tag, element]` pairs. For large datasets with sequences, consumers typically want **flat-walk** too (`ds.walk()` yielding every descendant element with path). Not strictly needed for v1 but would save a cookbook recipe. Consider deferring; if added, it's `MODEL-08`.

### VR (7 reqs) — **MAJOR**
This is the category most likely to need tightening. Real gaps:

- **Gap VR-A (DA/TM/DT quirks):** VR-02 says "valid truncations per DICOM format rules." Real-world quirks beyond truncation:
  - `DA` values like `19000101` for "unknown birthdate" — parseable but semantically sentinel.
  - `TM` with 6-digit fractional seconds (`HHMMSS.FFFFFF`) — loses precision to JS `Date` (ms). Must keep raw string accessible and *document* the precision loss.
  - `DT` with timezone offset `+HHMM` (no colon) — stdlib `Date` expects `+HH:MM`. Must normalize.
  - `DT` with **no** offset — per spec is implementation-defined; JS `Date` will apply local TZ. Must decide and document (pydicom treats as naive).
  - Empty-string DA/TM/DT (`""`) — valid for Type 2 elements; must not throw.
  - Pre-1970 dates — fine for JS `Date` but watch for libraries that convert to epoch-seconds int.
  - **Recommend expanding VR-02 into VR-02a..VR-02f OR adding a DOC-requirement for a dedicated "Date/Time Quirks" README section referenced from VR-02.**

- **Gap VR-B (PN precision):** VR-01 names alphabetic/ideographic/phonetic groups split by `=` — correct. Missing: the multi-value separator for PN is `\` (backslash), so `PN` can have VM > 1 (multiple names separated by `\`, each with up to 3 `=`-separated groups). This is rare but happens for Referring Physician arrays. Worth one sub-bullet.

- **Gap VR-C (UC, UR, UV, SV, OV, OD, OL VRs):** VR-06 lists `OB, OW, OF, OD, OL, UN`. Missing from v1 enumeration: **UC** (Unlimited Characters, 2014 addition), **UR** (Universal Resource Identifier, 2014), **UV** (Unsigned 64-bit Very Long, 2018), **SV** (Signed 64-bit Very Long, 2018), **OV** (Other Very Long, 2018), **OD** (8-byte float array — already in draft). Some 2018+ IODs genuinely use UV/SV/OV (enhanced multi-frame timestamps). Recommend tightening VR-05/VR-06 to list the complete set; even if `UV`/`SV` are rare, generating the dictionary from Part 6 will include them.

- **Gap VR-D (AT byte order):** VR-05 says AT is (gggg,eeee) — but AT **is subject to endian swapping** and this is a real bug source in Explicit VR BE. Add explicit byte-order note to VR-05.

### SQ (4 reqs) — **MINOR**
- **Gap SQ-A:** SQ-04 shows `ds.get('0040A730').items[0].get(...)`. Missing contract: what if an item is **empty** (valid — zero-length item)? What if the sequence has zero items (`items: []`)? Should be implicit but worth one bullet.
- **Gap SQ-B:** Nested sequences to arbitrary depth work but recursion depth should be capped to prevent malicious-input DoS. Recommend a `maxSequenceDepth` option (default 256) and a fatal error on overflow. This is a security hardening item.

### PATH (4 reqs) — **OK**
PATH-03's `0040A730[1]/00080100` syntax is novel and clean. Minor: clarify behavior of `ds.get('00100010[2]')` on a non-sequence — should be `undefined`, not throw.

### HELPERS (7 reqs) — **MINOR**
- **Gap HELPERS-A:** No `ds.frame(n)` / `ds.perFrame(n)` helper for enhanced multi-frame IODs (MR / CT / XA Enhanced SOP classes). v1 explicitly defers this to raw sequence navigation (PROJECT.md "Multi-frame Functional Groups deep typed access" OOS). But consider that `ds.image.numberOfFrames` without a frame-access helper is a half-measure. Acceptable if EX-03 `walk-multi-frame-mr.ts` covers the raw navigation pattern. Worth calling out explicitly in DOC-11.
- **Gap HELPERS-B:** `ds.patient.otherIds` / `(0010,1000)` Other Patient IDs is a legacy identifier field. `ds.patient.identifiers[]` should include it per a clear mapping rule (mentioned in HELPERS-01, but the mapping isn't specified). Add clarification.

### CHARSET (3 reqs) — **MINOR**
- **Gap CHARSET-A:** Missing the **ISO 2022 switching mechanics**: CJK character sets declare multiple code-extensions in `(0008,0005)` separated by backslash (e.g., `ISO 2022 IR 6\ISO 2022 IR 87`), and PN components inside an element can switch character sets using escape sequences (`ESC $ B` for JIS, etc.). CHARSET-02 punts to "unsupported" warning, which is acceptable — but the draft should commit to **at least parsing without crashing** on multi-valued `(0008,0005)`, not just "unsupported multi-valued cases emit warning." Consider whether to support the common Japanese case (ISO 2022 IR 87 for JIS X 0208) as a v1 ship item — real-world Japanese DICOM will be the first non-ASCII surface developers hit.
- **Gap CHARSET-B:** Missing ISO_IR 166 (Thai), ISO_IR 203 (Korean), ISO_IR 149 (Korean Hangul). The draft names Latin-1/2, Cyrillic, UTF-8, GB18030, GBK. For breadth, should enumerate: 100, 101, 109, 110, 126, 127, 138, 144, 148, 166, 192, 203, and GB18030/GBK. Or explicitly note which are v1 and which are roadmap. `iconv-lite` covers all of these.

### PIXEL (3 reqs) — **MINOR**
- **Gap PIXEL-A (identity reshape for uncompressed):** See §3.2. Strongly recommend adding `PIXEL-04` for typed-array reshape of uncompressed pixel data. This is the highest-leverage recommendation in this report — zero codec dep, big DX win, clean boundary ("we reshape; we don't decompress").
- **Gap PIXEL-B (Basic Offset Table):** PIXEL-02 mentions BOT. Real quirk: many encoders emit an empty BOT (length 0, acceptable per spec). Others emit a BOT with wrong offsets. Lenient-mode behavior: expose what's there, don't rely on BOT for fragment walking (walk by item markers instead). Worth making explicit.

### TOL (10 reqs) — **MINOR**
Comprehensive. Real-world warnings not explicitly enumerated in TOL-03 that are worth adding:
- `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` — implicit VR files with private tags (VR must come from a profile or is `UN`).
- `DICOM_TRAILING_NULL_IN_TEXT_VR` (non-UI) — seen with PACS that pad all strings with `0x00` instead of `0x20`.
- `DICOM_EMPTY_ITEM_IN_SEQUENCE` — zero-length item marker with no content (valid but surprising).
- `DICOM_PIXEL_DATA_LENGTH_MISMATCH` — declared geometry implies N bytes but `(7FE0,0010)` has M. Common; worth a warning.
- `DICOM_UNEXPECTED_DELIMITER_ITEM` — covered in TOL-03 as "unexpected item delimiter outside a sequence" — keep.

Consider whether TOL-03 should be a *stable, enumerated warning-code list* (as a typed union in TypeScript) so consumers can switch on it. The HL7 sibling ended up with `WARNING_CODES` as a const registry — recommend mirroring.

### SER (6 reqs) — **MINOR**
- **Gap SER-A:** SER-06 says "DICOM-JSON-style" — should be **DICOM-JSON per PS3.18 Annex F** (the actual standard). Commit to the spec or don't use the term. If `{ "00100010": { "vr": "PN", "Value": [{"Alphabetic": "Doe^Jane"}] } }` is the target shape, say so. `dcmjs` has this as its killer feature; matching the canonical shape lets consumers round-trip through DICOMweb services.
- **Gap SER-B:** No requirement for **BulkDataURI** support in `toJSON()` (PS3.18 §F.2.6) — way to avoid putting huge pixel-data blobs in JSON. Consider a `{ bulkDataMode: 'inline' | 'uri' | 'omit' }` option, defer to v1.x if needed, but call it out.

### PROF (9 reqs) — **MINOR**
- **Gap PROF-A (Private Creator block mechanics):** PROF-07 mentions private creator discovery but glosses over the reservation rule. Spec:
  - Private creator tags live at `(gggg, 0010)` through `(gggg, 00FF)` (256 possible creator slots per group).
  - When `(gggg, 0010) = "GEMS_ACQU_01"`, that reserves tags `(gggg, 1000)` through `(gggg, 10FF)` for GEMS_ACQU_01.
  - When `(gggg, 0011) = "SIEMENS CT VA1"`, that reserves tags `(gggg, 1100)` through `(gggg, 11FF)` for Siemens.
  - Two different files can have the SAME private creator at DIFFERENT block slots. A profile's private tag declaration must be by Private Creator name + local 8-bit offset, not by absolute tag.
  - On serialization, the writer must allocate a creator block slot if one isn't present.
  Draft's PROF-07 sketch does not commit to the offset-indirection mechanic. **This is THE subtle thing to get right about private tags — recommend expanding PROF-07 into PROF-07a (read-side resolution by creator+offset), PROF-07b (write-side slot allocation), PROF-07c (SET-style anti-corruption: if a developer writes a private tag whose creator slot is taken, the writer relocates consistently).**
- **Gap PROF-B:** No requirement for profiles to declare **known implicit-VR private tags' VRs**. Implicit VR LE gives you tag + length + bytes but no VR — a profile's purpose in part is to supply those VRs. Recommend adding to PROF-01 / PROF-07.

### BVP (6 reqs) — **MINOR**
See §6 below. The real gap is **sourcing strategy for the private tag dictionaries**. Each vendor has legal and practical nuances.

### KIT (7 reqs) — **OK**
Matches HL7 sibling pattern exactly. Proven.

### ANON (7 reqs) — **MAJOR**
The biggest single gap. See §5 for full PS3.15 Annex E enumeration. Current ANON-02/03/04 cover 3 of 11 options. Recommend expanding to cover all 11.

Additional gaps:
- **Gap ANON-A (pixel data anonymization):** "Clean Pixel Data" option requires blacking-out burned-in text. v1 doesn't decode pixels, so this option is **unimplementable in v1** — but the API should cleanly reject it with a typed error directing to `@cosyte/dicom-pixel`, not silently skip it. Add a requirement.
- **Gap ANON-B (re-ID-able vs unlinkable):** Annex E distinguishes profiles supporting re-identification (via SOP-class-specific "salt" that a trusted custodian can reverse) vs unlinkable. The per-session UID map (ANON-06) is one form; the draft could go further by supporting `{ mode: 'unlinkable' | 'session' | 'persistent' }`.
- **Gap ANON-C (attribute-action table):** Annex E Section E.1.1 ships a large normative attribute table (hundreds of elements, each with an action letter). The draft ANON-05 names the action codes but doesn't commit to the source of the attribute table. Recommend a build-time generator (like DICT) that emits the Annex E action table from the XML Part 15 source.
- **Gap ANON-D (Clean Descriptors Option semantics):** "C" (Clean) requires *structured* removal — e.g., strip patient name from `(0008,1010)` StationName **only if** the value contains PHI. This is hard; pydicom/deid supports rule authoring. v1 could either (a) implement as pass-through-with-warn or (b) ship a default regex set. Decide and document.

### STRICT (5 reqs) — **MINOR**
- **Gap STRICT-A:** STRICT-03 mentions required File Meta elements. The full Type-1 list is **(0002,0001)** File Meta Information Version, **(0002,0002)** Media Storage SOP Class UID, **(0002,0003)** Media Storage SOP Instance UID, **(0002,0010)** Transfer Syntax UID, **(0002,0012)** Implementation Class UID. Draft names 4 of 5 (missing File Meta Information Version). Minor but should be complete.
- **Gap STRICT-B:** No IOD-level validation is the correct v1 decision (called out as OOS). Worth an explicit "validate() does NOT check IOD conformance" sentence in DOC-09 so consumers don't expect it.

### EX (3 reqs) — **OK**
Three is the right count. The three chosen scenarios (read tags, anonymize study, walk multi-frame) are the three most-common integration tasks.

### TEST (8 reqs) — **OK**
One consideration: **where do fixtures come from?** Open-source corpora to cite: [The Cancer Imaging Archive](https://wiki.cancerimagingarchive.net/), [OsiriX sample data](https://www.osirix-viewer.com/resources/dicom-image-library/), [pydicom test data](https://github.com/pydicom/pydicom-data), [GDCM test fixtures](https://sourceforge.net/projects/gdcm/). pydicom's fixtures are MIT-licensed — a good source. Should commit sourcing/licensing before writing fixtures. (Equivalent concern existed for HL7 sibling, which solved it with synthetic fixtures.) Recommend a TEST-09 capturing fixture-source licensing discipline.

### DOC (16 reqs) — **MINOR**
- Matches HL7 sibling pattern (16 vs 15 doc reqs). Slightly heavy but proven.
- **Gap DOC-A:** No explicit requirement for a "character-set examples" recipe in DOC-06. CJK decoding is where this library will face its first public bug reports — recipe should exist.
- **Gap DOC-B:** No "Upgrading from `dicom-parser`" migration guide section. Worth a DOC-17 for adoption — ~150 LOC mapping table. Optional.

---

## 5. PS3.15 Annex E — Full Option Enumeration (as of DICOM 2024e / 2025e)

**Authoritative source:** [DICOM PS3.15 current output](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/sect_e.3.html) — confirmed by fetching E.3.6 (Retain Longitudinal Temporal Information Options) and E.3.10 (Retain Safe Private Option) with their Prev/Next siblings.

**Confidence:** HIGH (from official NEMA DICOM current-edition HTML output)

### E.3 Basic Application Level Confidentiality Options — complete list

| Section | Option Name | Nature | Practical frequency |
|---|---|---|---|
| E.3.1 | **Clean Pixel Data Option** | Additional-removal (burned-in annotation blackout) | Common — required for research / registries that black-boxed PHI in burned-in text (US, SC, MG) |
| E.3.2 | **Clean Recognizable Visual Features Option** | Additional-removal (facial features, etc., in 3D MR/CT) | Growing — mandatory for open brain MRI datasets (OASIS, ADNI, etc.) |
| E.3.3 | **Clean Graphics Option** | Additional-removal (GSPS, burned-in graphics) | Occasional |
| E.3.4 | **Clean Structured Content Option** | Additional-removal (SR text) | Rare — SR is OOS for v1 but option still meaningful |
| E.3.5 | **Clean Descriptors Option** | Additional-removal (free-text descriptors like StudyDescription) | Common — descriptors routinely leak PHI |
| E.3.6 | **Retain Longitudinal Temporal Information Options** — two variants: (a) **Retain Longitudinal Temporal Information with Full Dates Option**, (b) **Retain Longitudinal Temporal Information with Modified Dates Option** | Retention with full OR shifted dates | **Very common** — required for clinical trial use cases |
| E.3.7 | **Retain Patient Characteristics Option** | Retention (age, sex, height, weight) | **Very common** — required for research |
| E.3.8 | **Retain Device Identity Option** | Retention (manufacturer, model, serial) | Common — required for equipment studies, QA |
| E.3.9 | **Retain UIDs Option** | Retention (keep original UIDs) | Common — required for re-identifiable workflows |
| E.3.10 | **Retain Safe Private Option** | Retention (keep private tags marked "safe") | Uncommon — depends on vendor tag safety annotations |
| E.3.11 | **Retain Institution Identity Option** | Retention (institution name, address, dept) | Uncommon — generally stripped |

### Practical use-frequency ranking

Most integration developers need, in order:
1. **Retain Longitudinal Temporal with Modified Dates** (shifted dates for trial)
2. **Retain Patient Characteristics** (age/sex preserved)
3. **Retain Device Identity** (modality manufacturer kept)
4. **Retain UIDs** (linkable back to source study)
5. **Clean Descriptors** (regex out PHI from free text)
6. **Clean Pixel Data** (burned-in annotation — requires pixel decode → defer)
7. **Clean Recognizable Visual Features** (face-removal from MR — out of scope for v1)
8–11: less common

### Recommendation for REQUIREMENTS

- Expand ANON-02..04 from 3 options to cover **all 11** as composable flags, OR explicitly list which are v1 and which are deferred.
- The two "Clean" options that require pixel data manipulation (E.3.1 Clean Pixel Data, E.3.2 Clean Recognizable Visual Features) **cannot be implemented in v1** and must throw a typed error directing to `@cosyte/dicom-pixel`. Add a requirement.
- The "Retain Longitudinal Temporal" option has **two sub-variants** (Full Dates, Modified Dates) — the API shape `retain: ['LongitudinalTemporal']` loses that distinction. Consider `retain: [{ option: 'LongitudinalTemporal', variant: 'modifiedDates', shiftDays: -N }]`.
- E.3.10 Retain Safe Private requires the **profile system** to carry per-tag safety annotations — this couples ANON and PROF. Worth one requirement connecting them.

---

## 6. Vendor Private Tag Dictionaries — Sources & Licensing

For each of the 5 in-scope vendors (GE, Siemens, Philips, Canon/Toshiba, Hologic):

### GE (General Electric Healthcare)
- **Published source:** GE's DICOM Conformance Statements for each product line list private attributes in an appendix. No single consolidated public machine-readable dictionary.
- **Open-source prior art:**
  - [DCMTK `private.dic`](https://github.com/InsightSoftwareConsortium/DCMTK/blob/master/dcmdata/data/private.dic) — includes GE entries (GE Vivid, GE SonoCT, GE Panda, etc.); BSD-style license.
  - [pydicom `_private_dict.py`](https://github.com/pydicom/pydicom/blob/main/src/pydicom/_private_dict.py) — MIT license; portions generated from GDCM (BSD). Includes GE private creators like `GEMS_ACQU_01`, `GEMS_SERS_01`, `GEMS_IMAG_01`, `GEMS_PARM_01`, etc.
  - [dicom3tools `ge.tpl`](https://github.com/QIICR/dicom3tools) — by David Clunie (standards author); BSD-ish.
  - [dicm2nii `dicm_dict.m`](https://github.com/xiangruili/dicm2nii/blob/master/dicm_dict.m) — MATLAB, BSD.
- **Recommended source:** pydicom `_private_dict.py` (MIT / BSD via GDCM) — most complete, cleanly attributable.

### Siemens (Siemens Healthineers)
- **Published source:** syngo product DICOM Conformance Statements; MR private creators documented in Siemens research publications (`Siemens_MR_FOR_*`, `SIEMENS MR HEADER`, `SIEMENS CT VA0 COAD`, `SIEMENS MEDCOM HEADER2`, etc.).
- **Open-source prior art:**
  - [`dicom-private-dicts` (malaterre)](https://github.com/malaterre/dicom-private-dicts/blob/master/siemens.xml) — XML dictionary, Siemens entries; license: check repo (Creative Commons / public-domain declarations common).
  - [`open-dicom/dicom_parser` siemens docs](https://github.com/open-dicom/dicom_parser/blob/main/docs/siemens/private_tags.rst) — Siemens private tag reference.
  - pydicom `_private_dict.py` — includes `SIEMENS MEDCOM HEADER`, `SIEMENS CSA HEADER`, etc.
  - DCMTK `private.dic` — Somatom CT, Magnetom MR entries.
- **Special note:** Siemens CSA headers (`(0029, 1010)` under `SIEMENS CSA HEADER`) are **nested binary-encoded structures** (not plain private tags) — decoding CSA is a separate endeavor. v1 should register the creator and expose raw Buffer; decoding is roadmap or `@cosyte/dicom-pixel`.
- **Recommended source:** pydicom `_private_dict.py` + `open-dicom/dicom_parser` siemens docs.

### Philips (Philips Healthcare)
- **Published source:** Philips DICOM Conformance Statements; private creators like `Philips Imaging DD 001`, `Philips MR Imaging DD 001`, `Philips US Imaging DD 017`.
- **Open-source prior art:**
  - [`dcm4che/dcm4che` issue #725](https://github.com/dcm4che/dcm4che/issues/725) — discusses Philips private element dictionary integration.
  - pydicom `_private_dict.py` — includes multiple Philips creators.
  - dicom3tools `philips.tpl`.
  - DCMTK `private.dic` — Intera Achieva, Digital Diagnost entries.
- **Recommended source:** pydicom + dicom3tools cross-reference.

### Canon Medical Systems (formerly Toshiba Medical Systems)
- **Published source:** Canon/Toshiba DICOM Conformance Statements; private creators like `TOSHIBA_MEC_1.0`, `TOSHIBA_MEC_CT_1.0`, `CANON_MEC_MR3`.
- **Open-source prior art:**
  - dicom3tools `toshiba.tpl` — Toshiba CT private elements updated for V4.70+.
  - pydicom `_private_dict.py` — Toshiba entries.
  - DCMTK `private.dic` — Toshiba entries.
- **Recommended source:** pydicom + dicom3tools.
- **Naming note:** Toshiba Medical Systems was acquired by Canon in 2016 and renamed Canon Medical Systems. Private tags in older scanners still use `TOSHIBA_*` creators; newer scanners may use `CANON_*`. The profile should register BOTH creator-string families.

### Hologic
- **Published source:** [Hologic Dimensions / 3Dimensions DICOM Conformance Statement](https://www.hologic.com/sites/default/files/2018-05/Dimensions_3Dimensions%201.9.1-2.0.1%20DICOM%20Conformance%20Statement%20(MAN-05469)%20English%20Rev_001%2005_18_0.pdf) — §"Data Dictionary of Private Attributes" table. [Advanced Workflow Manager Conformance Statement](https://www.hologic.com/file/13141/download?token=59Mpofwr) — similar private attribute section.
- **Open-source prior art:**
  - dicom3tools includes Hologic DXA private data elements from conformance statements (Clunie).
  - pydicom `_private_dict.py` — limited Hologic coverage.
- **Special note:** Hologic's Secondary Capture Objects historically use **undisclosed proprietary compression** with pixel data hidden in private attributes. This is a DX trap — `@cosyte/dicom` v1 won't decode it (OOS), but the profile should at minimum register the known private creator and expose the raw Buffer.
- **Recommended source:** Hologic conformance statement PDFs (manual extraction of private attribute tables); supplement with dicom3tools.

### Licensing summary for reuse

| Source | License | Attribution needed? |
|---|---|---|
| pydicom `_private_dict.py` | MIT (portions BSD from GDCM) | Yes — copyright notice in LICENSES/ |
| DCMTK `private.dic` | BSD-style | Yes |
| dicom3tools (Clunie) | BSD-ish / fair-use research | Yes — author credit |
| malaterre/dicom-private-dicts XMLs | Check per-file headers | Verify per-file |
| Vendor conformance statements (PDFs) | Vendor-published; factual tag numbers not copyrightable (standards citation doctrine) | Safe to transcribe tables; cite document |

**Recommended approach for v1 BVP-01..05:** Use pydicom's `_private_dict.py` as the primary seed (MIT-compatible), augment with dicom3tools for Hologic/Canon gaps, and cite both in an `ATTRIBUTIONS.md`. Transcribing private-attribute tables from vendor conformance PDFs is legally safe (tag numbers are facts; table structure is a standard format). Avoid copying vendor PDF prose verbatim.

---

## 7. Summary of Recommended REQ-ID Changes

**Expand (content gaps):**
- **ANON-02..04** → expand to cover all 11 PS3.15 Annex E options (at least as composable flags; OK to defer Clean-Pixel-Data and Clean-Recognizable-Visual-Features with typed errors).
- **VR-02** → add a sub-bullet or split into VR-02a..VR-02f covering DA/TM/DT real-world quirks (precision loss, timezone offset format, empty-string, 19000101 sentinel).
- **PROF-07** → expand to cover Private Creator block reservation rule (creator at `(gggg, 00xx)` reserves `(gggg, xx00)–(gggg, xxFF)`), read-side offset indirection, write-side slot allocation.
- **CHARSET-02** → commit to "parses without crash on multi-valued charset; supports at least single-extension JIS for Japanese"; enumerate supported code pages.

**Add (missing requirements):**
- **PIXEL-04** (new) — Typed-array reshape of uncompressed pixel data via `ds.image.frames()`. Zero codec dep. Highest DX leverage add.
- **DICT-06** (new) — Generator also produces a UID dictionary (Transfer Syntax UIDs, SOP Class UIDs).
- **ANON-08** (new) — For retention options requiring pixel-data access (Clean Pixel Data, Clean Recognizable Visual Features), throw a typed error directing to `@cosyte/dicom-pixel`.
- **ANON-09** (new) — Annex E attribute action table is generated at build time from PS3.15 XML source (mirror the DICT generator pattern).
- **SQ-05** (new, optional) — `maxSequenceDepth` option with fatal-on-overflow for DoS protection.
- **TEST-09** (new) — Fixture sourcing / licensing discipline (where fixtures come from, MIT-compatible provenance).

**Tighten (clarifications, not new reqs):**
- **FM-03** — include "missing" in addition to "mismatch" for group length.
- **VR-05** — call out AT endian-swap in Explicit VR BE.
- **VR-06** — enumerate complete byte-VR set including UC, UR, UV, SV, OV.
- **SER-06** — commit to PS3.18 Annex F DICOM-JSON format, not "-style."
- **MODEL-03** — add `privateCreator?: string` to element shape.
- **STRICT-03** — add `(0002,0001)` File Meta Information Version to required-elements list.
- **TOL-03** — add the 4 warning codes missing from the enumeration (IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR, TRAILING_NULL_IN_TEXT_VR, EMPTY_ITEM_IN_SEQUENCE, PIXEL_DATA_LENGTH_MISMATCH).

**Consider deferring (borderline):**
- RLE Lossless decode — keep out of v1 for message clarity; flag as #1 candidate for v1.x.
- Full CJK ISO 2022 switching — keep "best-effort + warn" for v1; add roadmap note.

---

## Sources

### DICOM Standard (HIGH confidence — official NEMA)
- [PS3.15 Annex E chapter (current edition)](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/chapter_e.html)
- [PS3.15 Section E.3 Basic Application Level Confidentiality Options](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/sect_e.3.html)
- [PS3.15 E.3.6 Retain Longitudinal Temporal](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/sect_E.3.6.html)
- [PS3.15 E.3.8 Retain Device Identity](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/sect_E.3.8.html)
- [PS3.15 E.3.10 Retain Safe Private](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/sect_E.3.10.html)
- [PS3.15 PDF (current)](https://dicom.nema.org/medical/dicom/current/output/pdf/part15.pdf)

### Reference libraries (HIGH confidence — inspected sources)
- [cornerstonejs/dicomParser](https://github.com/cornerstonejs/dicomParser) — MIT; Node JS; low-level, no helpers
- [dcmjs-org/dcmjs](https://github.com/dcmjs-org/dcmjs) — MIT; DICOM-JSON / naturalized access
- [pydicom/pydicom](https://github.com/pydicom/pydicom) — MIT; reference Python DICOM library
- [InsightSoftwareConsortium/DCMTK](https://github.com/InsightSoftwareConsortium/DCMTK/blob/master/dcmdata/data/private.dic) — BSD; comprehensive private.dic

### Private tag dictionaries (MEDIUM confidence — sources inspected, licenses verified)
- [pydicom `_private_dict.py`](https://github.com/pydicom/pydicom/blob/main/src/pydicom/_private_dict.py) — MIT (portions BSD from GDCM)
- [malaterre/dicom-private-dicts `siemens.xml`](https://github.com/malaterre/dicom-private-dicts/blob/master/siemens.xml) — XML dictionary
- [open-dicom/dicom_parser Siemens docs](https://github.com/open-dicom/dicom_parser/blob/main/docs/siemens/private_tags.rst)
- [dicom3tools (QIICR mirror)](https://github.com/QIICR/dicom3tools/blob/master/CHANGES)

### Vendor conformance (MEDIUM confidence — vendor-published PDFs)
- [Hologic Dimensions 1.9.1-2.0.1 Conformance Statement](https://www.hologic.com/sites/default/files/2018-05/Dimensions_3Dimensions%201.9.1-2.0.1%20DICOM%20Conformance%20Statement%20(MAN-05469)%20English%20Rev_001%2005_18_0.pdf)
- [Hologic Advanced Workflow Manager Conformance Statement](https://www.hologic.com/file/13141/download?token=59Mpofwr)

### Anonymization references (MEDIUM confidence)
- [pydicom/deid](https://github.com/pydicom/deid) — best-effort DICOM de-identification
- [chop-dbhi/dicom-anon](https://github.com/chop-dbhi/dicom-anon) — Python DICOM anonymizer
- [Microsoft Tools-for-Health-Data-Anonymization — discussion on NEMA PS3.15 Annex E](https://github.com/microsoft/Tools-for-Health-Data-Anonymization/discussions/224)

---

*Report scope: features landscape + gap audit of the 137-req draft. Does NOT produce a fresh requirements document. Human reviewer reconciles findings against `.planning/REQUIREMENTS.md`.*

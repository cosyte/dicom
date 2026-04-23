# DICOM Parser Pitfalls — @cosyte/dicom v1

**Domain:** DICOM Part 10 parser library (Node.js / TypeScript)
**Researched:** 2026-04-22
**Confidence:** HIGH (corroborated against DICOM PS3.5 / PS3.15 current, pydicom / fo-dicom / dicomParser / suyashkumar/dicom / DCMTK issue trackers)

Scope: Pitfalls that DICOM parser projects ship as real bugs. Organized by the twelve domains in the research prompt. Each entry includes failure mode, prevention strategy, the phase from `ROADMAP.md` that should address it, and an explicit note on whether `REQUIREMENTS.md` covers it (by REQ-ID) or whether it is a gap.

Stable warning codes referenced below are the codes the library should emit. Codes already present in TOL-03 wording are kept; new codes are flagged with "(new)".

---

## 1. Transfer Syntax Handling

### 1.1 Implicit VR LE — VR inference for private tags
**What goes wrong:** Implicit VR LE carries no on-wire VR; parser resolves VR from the Part 6 dictionary. Private tags `(gggg,eeee)` with `gggg` odd have no dictionary entry. Parsers that crash on dictionary miss reject any file with private data. Parsers that fall back to UN but then emit a 2-byte-length header when re-serializing to Explicit VR produce invalid files (UN requires long-form 4-byte length with 2 reserved bytes).

**Prevention:**
- Fall back to VR=UN on dictionary miss for private tags.
- Emit `DICOM_PRIVATE_TAG_NO_CREATOR` when no registered creator covers the block.
- Honor profile-supplied VR overrides: a registered Private Creator mapping `(gggg,eeXX)` to a specific VR must take precedence over UN.
- Round-trip test: private tag in Implicit LE → serialize as Explicit LE → re-parse → equivalent.

**Warning signs:** Parser throws on a file from a single vendor; bug tracker receives "fails on GE file" / "fails on Siemens file" reports where the file has `(0019,xxxx)` or similar private groups.

**Phase:** Phase 2 (parser), Phase 5 (serializer UN long-form), Phase 6 (profile VR override).
**REQ coverage:** TOL-08, TOL-09, PROF-07. **Partial gap:** no REQ explicitly states "profile-supplied VR takes precedence over UN fallback for private tags."

---

### 1.2 Explicit VR LE — 2-byte vs 4-byte length distinction
**What goes wrong:** Explicit VR uses short-form header (2-byte length) for most VRs, but long-form (2 reserved bytes + 4-byte length) for `OB, OW, OF, OD, OL, SQ, UT, UN, UC, UR`. Hand-rolled lists often omit the newer long-form VRs (OD, OL, UC, UR added after 2007). Additional bugs: reserved bytes interpreted as part of the length, or serializer emitting 2-byte form where 4-byte is required.

**Prevention:**
- Derive the long-form VR set from a single constant, ideally computed at build time from VR metadata, not hand-rolled per parser/serializer.
- Assert the 2 reserved bytes are `0x00 0x00`; emit `DICOM_NONZERO_RESERVED_BYTES` (new) when not.
- Canonical fixture with at least one element of every long-form VR.

**Warning signs:** Huge bogus lengths (reserved bytes leaking into length). Failures only on files containing `UC`, `UR`, `OD`, `OL`.

**Phase:** Phase 2 (parser), Phase 5 (serializer).
**REQ coverage:** TS-02 names `OB, OW, OF, SQ, UT, UN`. **Gap:** `OD, OL, UC, UR` missing from REQ text — amend TS-02 to include the full set.

---

### 1.3 Explicit VR Big Endian — byte-swap coverage
**What goes wrong:** BE requires byte-swapping all multi-byte numeric VRs. Common bugs:

1. **AT (Attribute Tag) forgotten.** AT is a 4-byte value but semantically two 2-byte integers (group, element) — each half needs an independent 2-byte swap, not a single 4-byte swap. This is the single most common BE bug.
2. **OW forgotten.** OW is 16-bit words; each word swaps in BE. OB is byte stream and does not swap. Libraries conflate OB/OW.
3. **Items inside SQ.** The item marker `(FFFE,E000)` and its 4-byte length must byte-swap under BE like any other header.
4. "BE is dead" assumption. Retired for transmission in newer DICOM, but legacy archives still contain BE files.

**Prevention:**
- Per-VR endian-swap table with each VR's stride: `AT=2, US=2, SS=2, UL=4, SL=4, FL=4, FD=8, OW=2, OF=4, OD=8, OL=4`. OB, CS, AE, UI, DA, TM, DT, IS, DS = no swap.
- BE canonical fixture contains at least one element of each numeric VR plus multi-valued AT plus one OB.
- Shared primitive for parser and serializer to prevent drift.

**Warning signs:** Round trip LE → BE → LE loses or corrupts numeric values. AT values serialize as swapped tags (`10001000` instead of `00100010`).

**Phase:** Phase 2 (parser), Phase 3 (VR-aware access), Phase 5 (serializer).
**REQ coverage:** TS-03 lists the VRs. TEST-03 requires AT multi-value fixture. Good. **Minor gap:** no REQ explicitly documents OB-never-swapped / OW-always-swapped in BE (belongs in DOC-level comment on `rawBytes`).

---

### 1.4 Deflated Explicit VR LE — raw deflate vs zlib-wrapped
**What goes wrong:** PS3.5 Annex A.5 specifies **RFC 1951 raw deflate**, not RFC 1950 zlib (which adds a 2-byte header + Adler-32). Node's `zlib.inflateSync` expects zlib format and will error on raw deflate. Correct call: `zlib.inflateRawSync`. Secondary bugs:

1. Parser tries to inflate the entire file. Wrong — only the dataset *after* File Meta is deflated; File Meta is always Explicit VR LE uncompressed.
2. Serializer uses zlib-wrapped deflate on output; recipient tools (DCMTK, dcm4che) reject the file.

**Prevention:**
- Use `zlib.inflateRawSync` / `deflateRawSync` explicitly.
- Inflate the bytes starting immediately after File Meta group length + header bytes.
- Round-trip test: parse deflated fixture → `toBuffer()` → re-parse → equivalent.

**Warning signs:** "Unable to decompress" errors. DCMTK rejects output with "Incorrect Deflate wrapper."

**Phase:** Phase 2 (parser), Phase 5 (serializer).
**REQ coverage:** TS-04 says "transparently inflates the deflated dataset after File Meta." **Gap:** wording does not disambiguate raw vs zlib-wrapped; an implementer defaulting to `zlib.inflateSync` will fail silently until a recipient rejects the output. Tighten TS-04 wording.

---

## 2. Sequence (SQ) Parsing

### 2.1 Item / delimiter marker scoping
**What goes wrong:** The three FFFE markers have context-dependent semantics:

- `(FFFE,E000)` Item: starts a sequence item **or** a pixel-data fragment.
- `(FFFE,E00D)` Item Delimitation: ends an undefined-length SQ item (inside SQ only; never in fragments).
- `(FFFE,E0DD)` Sequence Delimitation: ends an undefined-length SQ **or** the encapsulated pixel-data "sequence" at `(7FE0,0010)`.

Bugs:
1. Parser descends into `(FFFE,E000)` inside encapsulated pixel data expecting a nested SQ item.
2. Parser looks for `(FFFE,E00D)` to end fragments (wrong — fragments have no item delimitation).
3. Parser crashes on empty item (`FFFE,E000 len=0 FFFE,E00D`).
4. Item-delimitation encountered outside an SQ context (malformed input) crashes instead of warning.

**Prevention:**
- Maintain an explicit stack of encoding contexts (`Root`, `SqItem`, `EncapsulatedPixelData`). Marker semantics dispatch on stack top.
- Test matrix: explicit-length SQ with explicit-length items; undefined SQ with explicit items; undefined SQ with undefined items; empty item; ≥3-level nesting.
- Emit `DICOM_UNEXPECTED_ITEM_DELIMITER` when a delimiter appears at the wrong stack level.

**Warning signs:** Crashes on encapsulated compressed pixel data; "double-descend" into pixel-data items that produce garbage elements.

**Phase:** Phase 2 (marker recognition), Phase 3 (SQ navigation), Phase 4 (pixel-data fragments).
**REQ coverage:** SQ-02, SQ-03; TOL-03 mentions "unexpected item delimiter outside a sequence." **Gap:** no REQ explicitly covers empty-item tolerance or ≥3-level deep nesting; add fixture coverage in TEST-03.

---

### 2.2 Explicit VR UN containing a sequence (CP-246)
**What goes wrong:** A private SQ written originally in Implicit VR LE carries no on-wire VR; when the file is transcoded to Explicit VR, the transcoder assigns VR=UN (it cannot know it was SQ). A naive Explicit VR parser sees UN with undefined length and treats the value as opaque bytes — losing access to nested elements.

DICOM Correction Proposal CP-246 addresses this: a parser **SHOULD** attempt to parse a UN element with undefined length as SQ (because only SQ legitimately carries undefined length). Parsers that don't implement CP-246 lose access to nested private data. See https://github.com/pydicom/pydicom/issues/1312.

**Prevention:**
- When encountering `VR=UN, length=0xFFFFFFFF` (undefined), parse the value as SQ using Implicit VR LE inner encoding.
- Emit `DICOM_UN_PARSED_AS_SQ` (new) warning.
- For UN with explicit length, do NOT descend — bytes could be anything.
- Test fixture: private SQ transcoded Implicit→Explicit, re-parsed.

**Warning signs:** Vendor reports "I can see the private tag but cannot read its nested elements."

**Phase:** Phase 2 (UN length handling), Phase 3 (SQ descent through UN).
**REQ coverage:** **Gap** — no REQ covers CP-246 behavior. Recommend new REQ (SQ-05 or similar).

---

### 2.3 SQ item headers under BE
**What goes wrong:** Item markers `(FFFE,E000)` etc. are tag headers and their 4-byte lengths must be byte-swapped in BE. Parsers that treat "FFFE" as a magic byte pattern short-circuit the swap and get the length wrong.

**Prevention:** Route all element-header reads (including FFFE items) through the same endian-aware read primitive. No special-casing of FFFE tag groups.

**Phase:** Phase 2.
**REQ coverage:** Implicit in TS-03; good.

---

## 3. Character Set Decoding

### 3.1 Backslash (0x5C) collides with ISO 2022 shift sequences
**What goes wrong:** DICOM uses 0x5C as the separator for multi-valued elements; but in multi-byte encodings (GB2312, JIS X 0208, KS X 1001) accessed via ISO 2022 escape sequences, 0x5C can appear as the second byte of a 2-byte character. A naive split-on-backslash before charset decoding garbles values. Compounding: under ISO_IR 13 / ISO 2022 IR 13, 0x5C renders as ¥ (YEN SIGN), not backslash; DOS-style paths using backslashes become yen signs.

**Prevention:**
- For multi-valued string VRs, parse the ISO 2022 state machine first; only treat 0x5C as separator when the current code element is in a single-byte GL set.
- For UTF-8 (ISO_IR 192), Latin (ISO_IR 100/101/109/110/148), Cyrillic (ISO_IR 144), Hebrew, Arabic, GB18030, GBK: 0x5C byte-split is always safe (none of these use 0x5C as a trail byte).
- For UT, ST, LT, UC: never split on 0x5C (spec allows 0x5C in these VRs).
- Emit `DICOM_CHARSET_AMBIGUOUS_SEPARATOR` (new) when 0x5C appears in a multi-byte ISO 2022 context.

**Warning signs:** CJK patient names produce garbled values when multi-valued; PN with ideographic group garbled.

**Phase:** Phase 4 (charset decoding).
**REQ coverage:** CHARSET-01, CHARSET-02 cover declared charsets. **Gap:** no REQ explicitly addresses separator-before-decode ordering or ¥-vs-\ under ISO_IR 13.

---

### 3.2 Wrong VRs receiving charset decode
**What goes wrong:** Specific Character Set applies **only** to VRs `PN, LO, SH, LT, ST, UT, UC`. Libraries that apply charset decoding to `CS, AE, UI, DA, TM, DT, IS, DS, AS` produce mojibake on files where a vendor illegally shipped UTF-8 bytes in an ASCII-only field, instead of surfacing the corruption.

**Prevention:**
- Gate charset decoding on a VR allow-list: `PN, LO, SH, LT, ST, UT, UC`. Everything else uses default repertoire (ASCII) with whitespace trim.
- Emit `DICOM_NON_ASCII_IN_ASCII_VR` (new) when non-ASCII bytes appear in CS / AE / UI / DA / TM / DT / IS / DS / AS values.

**Warning signs:** Patient ID search fails because the UID field contains invisible non-ASCII corruption that was silently UTF-8-decoded.

**Phase:** Phase 3 (VR parsing) / Phase 4 (charset plumbing).
**REQ coverage:** VR-07 names the correct decoded VRs. CHARSET-01 names `PN, LO, SH, LT, ST, UT` — **gap:** missing `UC`. **Gap:** no REQ explicitly prohibits charset decode on the ASCII-only VRs.

---

### 3.3 Multi-valued `(0008,0005)` with ISO 2022 code extensions
**What goes wrong:** `(0008,0005)` is itself multi-valued. `\ISO 2022 IR 87` (leading empty component) declares a code-extension context where G0 default = ASCII and escape sequences invoke Kanji. Bugs:
1. Parser treats leading empty component as "no charset" and errors.
2. Parser ignores ISO 2022 escape sequences, decodes raw bytes as UTF-8.
3. Parser crashes on leading `\`.

**Prevention:**
- Parse `(0008,0005)` as an ordered list. First (possibly empty) = default G0; subsequent = extensions.
- v1 MVP: support the common cases — ISO_IR 192, 100, 144, GB18030, GBK, and single-extension ISO 2022 IR 87 (JIS Kanji), ISO 2022 IR 13 (Japanese katakana), ISO 2022 IR 149 (Korean).
- Unsupported combinations: emit `DICOM_UNSUPPORTED_CHARSET`, fall back to UTF-8. Raw Buffer always accessible.

**Warning signs:** Silent failures on Japanese / Korean / Chinese fixtures.

**Phase:** Phase 4.
**REQ coverage:** CHARSET-02 covers this correctly — calibrated MVP.

---

## 4. VR-Specific Parsing

### 4.1 PN multi-group flattening
**What goes wrong:** PN is `alphabetic=ideographic=phonetic` separated by `=` (0x3D). Libraries flatten into a single string, losing the structured distinction. Round-trip through `toString` drops ideographic rep.

**Prevention:**
- Parse PN into `{ alphabetic: NameComponents, ideographic?: NameComponents, phonetic?: NameComponents }` where `NameComponents = { family, given, middle, prefix, suffix }`.
- Raw string always accessible.
- Trailing empty groups and their `=` delimiters may be omitted per spec; do NOT emit trailing `=` on serialization when group is absent.

**Phase:** Phase 3.
**REQ coverage:** VR-01 — good.

---

### 4.2 DA / TM / DT truncation and legacy formats
**What goes wrong:**
- DA strictly `YYYYMMDD`. Legacy ACR-NEMA (pre-1993) files use `YYYY.MM.DD` — strict parsers reject.
- TM can be `HH`, `HHMM`, `HHMMSS`, `HHMMSS.FFFFFF`. Libraries expecting full form fail on shorter truncations.
- DT offset `±HHMM` or (non-standard but in-the-wild) `±HH:MM`. Bugs around offset parsing and its sign.
- Constructing a JS `Date` from DA alone assumes local midnight — wrong.

**Prevention:**
- DA returns structured `{ year, month, day }` + convenience UTC-midnight `Date`. Raw string always accessible.
- TM: parse what's present; missing components default to 0; fractional seconds honored to millisecond precision.
- DT: parse both `+0000` and `+00:00`; emit `DICOM_DT_NONSTANDARD_OFFSET` (new) for the colon form.
- DA with dots: emit `DICOM_DA_LEGACY_FORMAT` (new); still parse.

**Phase:** Phase 3.
**REQ coverage:** VR-02. **Gap:** no warning codes for legacy DA or colon DT offset.

---

### 4.3 UI trailing NULL vs trailing space
**What goes wrong:** Spec: UI is NULL-padded (0x00) for even length. Real files often space-pad (0x20). Parsers that strip only NULL leave a trailing space in UID strings, breaking byte-exact UID comparison.

**Prevention:**
- Strip trailing NULL and trailing space from UI values.
- Emit `DICOM_UI_TRAILING_SPACE` (new) when trailing space is trimmed.
- Odd-length UI triggers `DICOM_ODD_LENGTH_VALUE_PADDED` (TOL-07).

**Phase:** Phase 3.
**REQ coverage:** VR-04 covers NULL + odd-length. **Gap:** trailing-space case not explicit.

---

### 4.4 IS / DS whitespace and scientific notation
**What goes wrong:** IS and DS are space-padded to even length; vendors routinely ship values with leading/trailing whitespace, `+` signs, and (for IS only, invalid) decimal points. `parseInt(' 12 ')` works but masks malformed data.

**Prevention:**
- Trim before parse. Use `Number(value.trim())` for DS.
- Enforce integer-only on IS via post-trim regex; emit `DICOM_IS_NONINTEGER_VALUE` (new) on violation but still return the numeric value (lenient default).
- VM split on 0x5C (safe for IS/DS — ASCII-only).

**Phase:** Phase 3.
**REQ coverage:** VR-03 covers basic parsing. **Gap:** no warning code for malformed IS.

---

### 4.5 AT — not a string, a packed tag
**What goes wrong:** AT is 4 bytes binary: two 2-byte integers (group, element). Libraries that read 4 bytes as string return `"\x00\x10\x00\x10"`-style garbage. Multi-valued AT has no separator — it's binary with 4-byte stride.

**Prevention:**
- Parse AT as `{ group, element }` pair (or canonical hex string `"00100010"`). Multi-valued: 4-byte stride, no 0x5C split.
- In BE, byte-swap each 2-byte half independently.
- Fixture with multi-valued AT (TEST-03 — good).

**Phase:** Phase 3.
**REQ coverage:** VR-05, TEST-03 — good.

---

### 4.6 OB vs OW endian semantics
**What goes wrong:** OB = byte stream, never swapped. OW = 16-bit words, swapped in BE. OF/OD/OL = 32-/64-/32-bit, swapped in BE. Pixel data sometimes declared OB even when `BitsAllocated=16`; byte-swapping OB pixel data in BE produces garbled image.

**Prevention:**
- Never byte-swap OB, regardless of transfer syntax.
- Document: "raw bytes; consumer interprets per `BitsAllocated` and transfer-syntax byte order for OW." Belongs in README under Pixel Data.
- `rawBytes` always accessible (MODEL-03).

**Phase:** Phase 2 (endian), Phase 4 (pixel-data exposure).
**REQ coverage:** VR-06 covers "do not attempt decoded interpretation." **Gap:** no REQ explicitly says OB is not endian-swapped in BE.

---

## 5. File Meta Information

### 5.1 File Meta always Explicit VR LE
**What goes wrong:** Parser uses dataset transfer syntax for File Meta. Standard mandates File Meta is **always** Explicit VR LE regardless of `(0002,0010)`.

**Prevention:** File Meta parser hardcoded to Explicit VR LE; strategy switch happens only after File Meta consumed.

**Phase:** Phase 2.
**REQ coverage:** FM-01 explicit — good.

---

### 5.2 Group length `(0002,0000)` mismatch or missing
**What goes wrong:** `(0002,0000)` is Type 1 but real files ship without it, or with an incorrect value (downstream tool mutated File Meta without recomputing). Strict parsers reject; lenient parsers that blindly trust group length misidentify the first dataset element.

**Prevention:**
- Lenient mode: if group length present, use as hint; verify by parsing elements until no more `(0002,xxxx)` tags. Mismatch → `DICOM_FILE_META_GROUP_LENGTH_MISMATCH` (FM-03).
- Strict mode: throw `INVALID_FILE_META` only when required elements absent.
- Always rewrite correct group length on serialize (SER-04).

**Phase:** Phase 2, Phase 5.
**REQ coverage:** FM-03, SER-04 — good.

---

### 5.3 Implementation Version Name padding
**What goes wrong:** `(0002,0013)` Implementation Version Name VR=SH (16-char max). Parsers that skip trailing-padding trim leak padding into the string, breaking equality.

**Prevention:** Universal trailing-pad trim on SH values (VR-07).

**Phase:** Phase 3.
**REQ coverage:** VR-07 — good.

---

## 6. Odd-Length Values

### 6.1 Vendor odd-length tolerance
**What goes wrong:** Spec: all values even-length with VR-specific padding (space for text VRs, NULL for UI, NULL for OB). Real files ship odd lengths, especially on `(0042,0011)` Encapsulated Document and on Pixel Data (see pydicom#1511, fo-dicom#1403). Bugs:

1. Strict parser rejects.
2. Lenient parser accepts odd length but serializer re-emits odd length → downstream tools reject.
3. Transcoding loses the pad byte (fo-dicom#1403).

**Prevention:**
- Lenient mode: accept, emit `DICOM_ODD_LENGTH_VALUE_PADDED`, conceptually pad on parse (don't expose padding in parsed value).
- Serializer pads per VR rules on emit (SER-05). Closes transcode-loses-padding hole.
- Canonical fixture with odd-length values across several VRs.

**Phase:** Phase 2 (lenient accept), Phase 5 (conservative emit).
**REQ coverage:** TOL-07, SER-05 — excellent, well-covered.

---

## 7. Private Tags

### 7.1 Private Creator block reservation rules
**What goes wrong:** PS3.5 §7.8.1 rule: Private Creator `(gggg,00XX)` where `0x10 ≤ XX ≤ 0xFF` reserves elements `(gggg,XX00)` through `(gggg,XXFF)` — i.e., the element offset's low byte determines the high byte of the reserved sub-range. Common bugs:

1. Parser registers the wrong block (off by 0x1000).
2. Multiple creators at the same group collide because the parser assumes creator string → tag hex mapping is static (it's dynamic — XX slot order depends on element order in the file).
3. Parser treats creator registration as another value element and looks up `(gggg,0010)` expecting one known creator.
4. Private tags without a registered creator returned as opaque UN with no warning.

**Prevention:**
- Build `creators[gggg][XX] = creatorString` as elements are parsed in order.
- For any element `(gggg,EEFF)` with `0x10 ≤ EE ≤ 0xFF`, look up `creators[gggg][EE]` to find owning creator.
- Profile private-tag dictionary keys on `(creatorString, EEFF low-byte-offset)` pair, NOT on tag hex (which floats by XX slot).
- Emit `DICOM_PRIVATE_TAG_NO_CREATOR` (TOL-09) when no creator registered.
- Emit `DICOM_PRIVATE_CREATOR_UNKNOWN` (new) when creator IS registered but no profile dictionary entry matches.

**Warning signs:** Vendor profile works on one file but not another that has different element ordering in the private block.

**Phase:** Phase 2 (creator resolution), Phase 6 (profile dictionary matching).
**REQ coverage:** TOL-09, PROF-07. **Partial gap:** the off-by-0x1000 subtlety is an implementation note, not a REQ — flag in ADR.

---

### 7.2 Profile VR resolution for known private tags
**What goes wrong:** Profile registered a private tag with VR=DS, but the file's Implicit VR encoding has no VR on the wire, and the profile is applied only after parse. Library falls back to UN and loses type information.

**Prevention:**
- When a profile is active at parse time, consult profile-registered VRs for private tags during value parsing.
- Allow "implicit creator via `(0008,0070) Manufacturer`" fallback in vendor profiles (e.g., `profiles.ge` can claim private tags in certain groups when Manufacturer = "GE MEDICAL SYSTEMS").

**Phase:** Phase 6.
**REQ coverage:** PROF-07. **Gap:** no REQ on implicit-creator-by-manufacturer fallback.

---

## 8. PS3.15 Annex E Anonymization

### 8.1 UID consistency across references
**What goes wrong:** Replacing `(0020,000D) StudyInstanceUID` requires replacing every reference to the same UID elsewhere (Referenced Study Sequence, Related Study Sequence, etc.). Libraries that mint per-tag fresh UIDs break cross-referential integrity — anonymized study no longer connects to anonymized series.

**Prevention:**
- Per-session `Map<oldUID, newUID>` populated as UIDs are minted.
- Two-pass walk of the entire dataset tree (including deep SQ): first pass mints new UIDs; second pass substitutes every UI value whose old UID is in the map.
- Fixture: multi-study, multi-series dataset; verify cross-references preserved after anonymization.

**Phase:** Phase 7.
**REQ coverage:** ANON-05, ANON-06 — good.

---

### 8.2 Longitudinal Temporal offset consistency
**What goes wrong:** Retain Longitudinal Temporal preserves relative ordering. Bugs:
1. Different random offset per DA element → intervals between exams broken.
2. Offset at day-granularity breaks TM correlation.
3. DT timezone offset naively shifted together with the date component changes the UTC moment.

**Prevention:**
- Single per-session (more correctly: per-patient) random offset in days + optional consistent minute offset.
- Apply atomically across DA, TM, DT (with explicit timezone handling for DT).
- Silent transformation (no warning).

**Phase:** Phase 7.
**REQ coverage:** ANON-03. **Gap:** REQ does not mandate single-offset-per-session consistency.

---

### 8.3 Curves, Overlays, retired tag groups
**What goes wrong:** Curve data `(50xx,xxxx)` (retired) and Overlay Data `(60xx,3000)` frequently carry burned-in annotations / PHI. Anonymization profiles miss these because retired tags are absent from current dictionaries and overlay is treated as opaque pixel-like data.

**Prevention:**
- Generate the Annex E action table from the PS3.15 CSV as a committed input artifact (parallel to the Part 6 dictionary generator) so the table is complete by construction, not hand-curated.
- Repeating group handling: `(50xx,*)` and `(60xx,*)` match any `xx`, not just the listed row.

**Phase:** Phase 7.
**REQ coverage:** ANON-05. **Gap:** no REQ mandates sourcing the action table from PS3.15 CSV (generator pattern).

---

### 8.4 Burned-in pixel annotations
**What goes wrong:** Patient data rendered into pixel data (ultrasound captures, secondary captures). v1 exposes but does not decode pixels, so cannot redact. Silent omission makes library unsafe for blind anonymization workflows.

**Prevention:**
- `anonymize()` checks `(0028,0301) BurnedInAnnotation`. If `YES`, emit `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` (new) warning.
- Document limitation prominently in README; link forward to `@cosyte/dicom-pixel`.

**Warning signs:** Anonymized fixture passes library test but manual visual inspection reveals overlaid patient name.

**Phase:** Phase 7.
**REQ coverage:** **Gap** — no REQ. Recommend new ANON-* REQ.

---

### 8.5 Retain Safe Private option set
**What goes wrong:** Annex E default for private attributes is `X` (remove). "Retain Safe Private" opts in. If the library defaults to Retain Safe Private, PHI leaks. If it defaults to remove-all, legitimate vendor calibration data is lost (breaks downstream).

**Prevention:**
- Default: remove all private attributes (spec-compliant).
- `retain: ['SafePrivate']` opts in; requires vendor profiles to declare per-creator "safe private" tag lists.
- Built-in vendor profiles (`profiles.ge`, etc.) declare safe-private lists explicitly.

**Phase:** Phase 7, Phase 6.
**REQ coverage:** ANON-05 covers action vocabulary. **Gap:** no REQ on Retain Safe Private option set or the profile-side safe-private declaration.

---

### 8.6 Audit trail — `(0012,0062)`, `(0012,0063)`, `(0012,0064)`
**What goes wrong:** Annex E requires anonymizers declare themselves and their actions:
- `(0012,0062) PatientIdentityRemoved = YES`
- `(0012,0063) DeidentificationMethod` — human-readable
- `(0012,0064) DeidentificationMethodCodeSequence` — coded, one item per applied action set

Many anonymizers skip these entirely.

**Prevention:**
- `anonymize()` always populates these three attributes. Code values for CodeSequence come from Annex E Table E.1-1 for each applied action set.

**Phase:** Phase 7.
**REQ coverage:** **Gap** — no REQ. Compliance requirement, not optional. Recommend new ANON-* REQ.

---

## 9. Serialization / Round-Trip

### 9.1 Explicit vs undefined length on SQ re-emit
**What goes wrong:** Parser tolerated undefined-length SQ under Explicit VR (with warning); serializer emits explicit length → byte-diff. Worse: serializer emits undefined length under Explicit VR → downstream parsers reject.

**Prevention:**
- Documented serializer policy: always emit explicit length for SQ under all Explicit VR TS (conservative). In Implicit VR LE, undefined length is the common convention.
- Exception: encapsulated pixel data at `(7FE0,0010)` always undefined length (only legal form).
- Document: byte-exact round trip is not guaranteed; semantic round trip (SER-02) is.

**Phase:** Phase 5.
**REQ coverage:** SER-02 correctly soft ("equivalent"). SER-05 conservative emitter. **Gap:** SQ length-encoding policy not explicit; log in ADR.

---

### 9.2 Pixel data fragments + Basic Offset Table
**What goes wrong:** Encapsulated pixel data first item is the Basic Offset Table (BOT) — optional, 4-byte-per-frame offsets into the concatenated fragments. Bugs:
1. BOT recomputed against uncompressed offsets instead of compressed.
2. Empty (zero-length) BOT re-emitted as absent rather than zero-length `(FFFE,E000)` item.
3. Fragment boundaries shifted on re-emit (byte-diff, but also a real bug if a tool depends on specific fragment sizes).

**Prevention:**
- Expose BOT as `basicOffsetTable: Buffer | undefined` + `fragments: Buffer[]` on pixel-data element.
- Serialize BOT as first `(FFFE,E000)` item using original bytes; each fragment as `(FFFE,E000)`; close with `(FFFE,E0DD)`.
- If consumer mutates fragments, they must provide new BOT or set to zero-length — documented.
- Round-trip fixture with encapsulated JPEG (TEST-02).

**Phase:** Phase 5.
**REQ coverage:** PIXEL-02, SER-02, TEST-02 — good. **Minor gap:** not-explicit that round trip preserves fragment boundaries exactly.

---

### 9.3 Byte-order on emit
**What goes wrong:** Transcoding to BE forgets to swap some numeric VR (commonly AT, OW, OF).
**Prevention:** Shared per-VR endian primitive between parser and serializer.
**Phase:** Phase 5.
**REQ coverage:** SER-03 — OK.

---

## 10. Testing

### 10.1 Accidental PHI-bearing fixtures
**What goes wrong:** Real patient file committed to public repo. HIPAA breach. Happens more often than one might hope.

**Prevention:**
- CI hook scans `test/fixtures/` for PHI-likely values:
  - Any DA/DT value within last 120 years and not matching a known synthetic date pattern.
  - Any PN value not in an allow-list of synthetic / publicly-licensed source names.
- All fixtures drawn from public sample collections (TCIA, IDC, NEMA) or synthetically generated; provenance documented in `test/fixtures/README.md`.

**Phase:** Phase 1 (CI scan), Phase 8 (fixture curation + provenance doc).
**REQ coverage:** **Gap** — no REQ. Recommend new TEST-* REQ.

---

### 10.2 Single-vendor blindness
**What goes wrong:** All fixtures from one vendor → library works until a file from a different vendor hits production.
**Prevention:** Per-vendor fixtures (TEST-02, TEST-07).
**REQ coverage:** TEST-02, TEST-07 — good.

---

### 10.3 Transfer-syntax coverage
**Prevention:** TEST-02 requires one canonical fixture per v1 TS.
**REQ coverage:** TEST-02 — good.

---

### 10.4 Strict-mode per-warning escalation sweep
**Prevention:** TEST-06.
**REQ coverage:** TEST-06 — good.

---

### 10.5 Must-have test scenarios — consolidated checklist
What the v1 fixture suite should provably cover. `✓` = REQ-covered; `—` = gap.

| # | Scenario | REQ-covered |
|---|----------|-------------|
| 1 | One fixture per TS (Implicit LE, Explicit LE, Explicit BE, Deflated LE) | ✓ TEST-02 |
| 2 | Deep sequence (≥3 levels) | ✓ TEST-02 |
| 3 | Empty SQ item (`FFFE,E000` len=0) | — |
| 4 | Undefined-length SQ in Explicit VR | ✓ TEST-03 |
| 5 | UN with undefined length containing SQ (CP-246) | — |
| 6 | Multi-valued AT | ✓ TEST-03 |
| 7 | Odd-length value (multiple VRs) | ✓ TEST-03 |
| 8 | Missing preamble | ✓ TEST-03 |
| 9 | File Meta group length mismatch | ✓ TEST-03 |
| 10 | VR mismatch for known tag | ✓ TEST-03 |
| 11 | Group length in non-File-Meta groups | ✓ TEST-03 |
| 12 | Private tag without creator | ✓ TEST-05 |
| 13 | Multi-valued `(0008,0005)` with ISO 2022 IR 87 | ✓ TEST-03 |
| 14 | GB18030 charset | — (implied but not explicit) |
| 15 | Encapsulated pixel data with BOT | ✓ TEST-02 |
| 16 | Multi-frame uncompressed pixel data | ✓ TEST-02 |
| 17 | One fixture per built-in vendor profile | ✓ TEST-07 |
| 18 | Trailing-space-padded UI | — |
| 19 | Non-ASCII bytes in ASCII-only VR | — |
| 20 | Anonymize → verify UID cross-reference consistency | — (implied by ANON-06 test) |

**Gaps:** scenarios 3, 5, 14, 18, 19, 20 not explicit. Several can ride on TEST-03 by widening scope; #5 (CP-246) and #20 (UID consistency anonymization fixture) are independent.

**Phase:** Phase 8.

---

### 10.6 Encapsulated pixel data round-trip
**Prevention:** TEST-02 + SER-02.
**REQ coverage:** good.

---

## 11. API Design

### 11.1 Eager vs lazy value parsing
**What goes wrong:** Parsing every element's typed value at parse time is slow on 50MB+ files (PN, DA/TM/DT, numeric conversions). Users who want just `ds.patient.name` pay for everything.

**Prevention:**
- Element stores `rawBytes`; typed `.value` computed on access, memoized per element.
- Pixel data always lazy: record offset/length, don't copy until accessed.
- Performance target: 50MB CT metadata-only parse < 100ms (PROJECT.md).

**Phase:** Phase 3.
**REQ coverage:** MODEL-03 mentions `value` + `rawBytes` but not laziness. **Gap:** implementation ADR, not necessarily new REQ.

---

### 11.2 Buffer slice memory retention
**What goes wrong:** Node `Buffer.slice()` returns view into same backing `ArrayBuffer`. A parsed Dataset holding `rawBytes` views retains the entire source buffer in memory. 50MB input buffer held alive for the Dataset's lifetime even if user discards the source variable.

**Prevention:**
- Document retention behavior in README: `rawBytes` is a view; source is retained for Dataset lifetime.
- Consider `parseDicom(buffer, { copyValues: true })` option — copies every value's bytes into a fresh buffer, breaking retention; default is view-based (zero-copy fast path).
- On pixel data specifically, consider copy-on-materialize (pixel data dominates size).

**Warning signs:** Memory profiler shows 50MB retained after user dropped the source buffer variable.

**Phase:** Phase 3.
**REQ coverage:** **Gap** — no REQ. Recommend README doc (DOC-level) and optional API flag.

---

### 11.3 String decode timing and charset resolution
**What goes wrong:** Eager string decode commits to a charset before the charset is known. `(0008,0005)` typically appears early but not guaranteed.

**Prevention:** Lazy string decode at access time, using the Dataset's resolved `(0008,0005)`. Cache decoded value per element. Raw Buffer always accessible.

**Phase:** Phase 3 / Phase 4.
**REQ coverage:** CHARSET-03 covers raw Buffer. **Gap:** timing of charset resolution not explicit (but arguably implementation detail).

---

### 11.4 Mutation surface leaks
**What goes wrong:** Returning internal maps / arrays from `ds.elements()` etc. lets users mutate internal state, bypassing `setElement` and breaking the immutability guarantee silently.

**Prevention:**
- Iteration surfaces return frozen objects or iterators over cloned pairs.
- Element objects `Object.freeze`-style readonly.
- Mutation only via public methods (covered by MODEL-05).

**Phase:** Phase 3.
**REQ coverage:** MODEL-05 — good. **Minor gap:** iterator-return-is-frozen is an implementation test, not a REQ.

---

## 12. Dependencies & Packaging

### 12.1 `iconv-lite` vs Node `TextDecoder`
**What goes wrong:** `iconv-lite` is venerable, works, but inflates browser bundles. Node `TextDecoder` covers most DICOM-required charsets directly (UTF-8, ISO-8859-1..16, Windows-125x, GB18030, GBK, Big5, EUC-JP, Shift_JIS, EUC-KR). ISO 2022 code-extension is NOT covered by TextDecoder — needs a state machine.

**Prevention:**
- v1 first attempt: Node `TextDecoder` for declared single-charset cases. For ISO 2022 code extension, small state machine over underlying tables.
- Defer `iconv-lite` decision until after the ISO 2022 implementation attempt. Likely outcome: zero runtime deps, OR one dep if ISO 2022 is impractical without iconv-lite.
- Document in ADR per PROJECT.md constraints.

**Phase:** Phase 4 + ADR in Phase 1/4.
**REQ coverage:** SETUP-03 — covered (ADR-justified ≤3 deps).

---

### 12.2 Dual package hazard (ESM + CJS) — default profile state
**What goes wrong:** Node maintains separate caches for ESM and CJS. A library holding module-level state (the default profile) can have two different defaults — one seen by ESM consumers, one by CJS. Subtle, hard to debug.

**Prevention:**
- Data dictionary is a frozen constant — safe.
- Default profile IS module-level state. Two options:
  1. Document that default profile is per-module-cache. Recommend consumers explicitly pass profiles.
  2. Store default profile on `globalThis[Symbol.for('@cosyte/dicom/defaultProfile')]` to share across caches.
- `tsup` dual build emits `.mjs` + `.cjs` + matching `.d.mts` + `.d.cts`. Validate with `@arethetypeswrong/cli` in CI.

**Phase:** Phase 1 (build), Phase 6 (default profile semantics).
**REQ coverage:** SETUP-02 covers dual package. **Gap:** no REQ on default-profile-across-module-caches; pick one option in ADR.

---

### 12.3 Build-time generated dictionary — CI drift
**What goes wrong:** Dictionary regenerated during CI without commit → consumers see stale types. Or non-deterministic generator → spurious PR diffs.

**Prevention:**
- DICT-05 requires byte-identical regen + CI check.
- Generator sorts output deterministically.
- Part 6 source committed as input artifact so dictionary drift traces to source update.

**Phase:** Phase 1.
**REQ coverage:** DICT-01, DICT-02, DICT-05 — excellent.

---

### 12.4 tsup `.d.cts` / `.d.mts` type extensions
**What goes wrong:** tsup default emits only `.d.ts`; consumers with `moduleResolution: "node16"` need separate `.d.cts` / `.d.mts`. Misconfiguration types-fail silently for a subset of consumers.

**Prevention:**
- `tsup.config.ts` with `dts: true` + `format: ['esm', 'cjs']` produces both extensions.
- CI runs `attw --pack .` (Are The Types Wrong) to validate.

**Phase:** Phase 1.
**REQ coverage:** SETUP-02 — high-level covered. Implementation note / ADR recommended.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-curated Annex E action table | Fast to start | Drifts from standard at each PS3.15 update; misses repeating groups; PHI leaks | Never — generate from PS3.15 CSV |
| Hand-curated long-form VR list | Avoids dictionary coupling | Misses OD/OL/UC/UR or future VRs | Never — derive from dictionary metadata |
| Eager string decode at parse time | Simpler access API | 2-5x slower parse, incorrect charset if `(0008,0005)` later in file | Never for v1 |
| Single-vendor fixtures only | Faster Phase 8 | Library fails silently on other vendors in production | Never — each built-in profile needs a fixture (TEST-07) |
| Swallow malformed values silently | "Lenient" feel | Masks real data corruption; consumer debugs blind | Never — every deviation gets a warning code |
| Byte-diff round-trip assertions | Tighter test | Breaks on any valid serializer policy change | Never — semantic equivalence only (SER-02) |
| Block on discovering a new vendor quirk | Complete coverage | Never ships | Ship lenient-by-default; add warning code + fixture per quirk in subsequent PRs |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Node `zlib` for Deflated TS | Default `inflateSync` (zlib-wrapped) | `inflateRawSync` (RFC 1951 raw) |
| Node `TextDecoder` for charsets | Assume it covers everything | Covers most; falls back needed for ISO 2022 code extension |
| `Buffer.slice` for zero-copy element views | Forget that slice retains source backing | Document retention; offer `copyValues` opt-in |
| DCMTK consuming our output | Emit with undefined SQ length in Explicit VR | Emit explicit length in Explicit VR (conservative) |
| Python pydicom consuming our output | Emit invalid `(0012,0064)` CodeSequence on anonymize | Populate CodeSequence per Annex E Table E.1-1 exactly |
| Large CT / MR study parse | Eager parse of every value | Lazy + memoized per-element value computation |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Eager value parsing | 50MB parse > 500ms | Lazy `.value` accessor | Files > 20MB |
| Copy-on-slice for every element | 2x memory for parsed Dataset | View-based `rawBytes`; optional `copyValues` | Parsing large batches |
| String decode every access | Hot loop on `ds.patient.name` slow | Memoize decoded string per element | Tight loops over studies |
| Sequence deep-copy on `ds.get(sqPath)` | GC pressure on every access | Return cached Item view | Deep navigation loops |
| Re-read dictionary on every lookup | N log N parse overhead | Dictionary is frozen singleton | Always |

---

## Pitfall-to-Phase Map

| # | Pitfall | Phase | Covered By | Gap? |
|---|---------|-------|-----------|------|
| 1.1 | Implicit VR private VR fallback | 2, 5, 6 | TOL-08/09, PROF-07 | Partial (profile VR precedence not explicit) |
| 1.2 | Explicit long-form VR list | 2, 5 | TS-02 | **Gap — amend TS-02 to include OD/OL/UC/UR** |
| 1.3 | BE byte-swap (AT, OW) | 2, 3, 5 | TS-03, TEST-03 | Good |
| 1.4 | Deflated — raw not zlib | 2, 5 | TS-04 | **Gap — tighten TS-04 wording** |
| 2.1 | SQ/fragment marker scoping | 2, 3, 4 | SQ-02/03, TOL-03 | Partial (empty item + deep nesting not explicit) |
| 2.2 | UN undefined-length as SQ (CP-246) | 2, 3 | — | **Gap — new SQ-05** |
| 2.3 | BE SQ item headers | 2 | TS-03 | Implicit OK |
| 3.1 | 0x5C collision with ISO 2022 | 4 | CHARSET-01/02 | Partial (order not explicit) |
| 3.2 | Wrong VRs charset-decoded | 3, 4 | VR-07, CHARSET-01 | **Gap — add UC to CHARSET-01; add warning code** |
| 3.3 | Multi-valued charset | 4 | CHARSET-02 | Good |
| 4.1 | PN multi-group | 3 | VR-01 | Good |
| 4.2 | DA/TM/DT truncations + legacy | 3 | VR-02 | **Gap — warning codes** |
| 4.3 | UI trailing space | 3 | VR-04 | **Gap — trailing-space code** |
| 4.4 | IS/DS whitespace + notation | 3 | VR-03 | **Gap — warning code** |
| 4.5 | AT not a string | 3 | VR-05, TEST-03 | Good |
| 4.6 | OB never swapped in BE | 2, 4 | VR-06 | Partial (not explicit) |
| 5.1 | File Meta always Explicit VR LE | 2 | FM-01 | Good |
| 5.2 | Group length mismatch | 2, 5 | FM-03, SER-04 | Good |
| 5.3 | Impl Version Name padding | 3 | VR-07 | Good |
| 6.1 | Odd-length tolerance | 2, 5 | TOL-07, SER-05 | Excellent |
| 7.1 | Private Creator block rules | 2, 6 | TOL-09, PROF-07 | Good (ADR for off-by-0x1000) |
| 7.2 | Private VR from profile | 6 | PROF-07 | Partial (implicit creator via Manufacturer) |
| 8.1 | UID cross-reference consistency | 7 | ANON-05/06 | Good |
| 8.2 | Longitudinal temporal offset | 7 | ANON-03 | **Gap — single-offset-per-session** |
| 8.3 | Curve/Overlay PHI | 7 | ANON-05 | **Gap — sourced from PS3.15 CSV** |
| 8.4 | Burned-in annotation | 7 | — | **Gap — new ANON-* REQ** |
| 8.5 | Retain Safe Private | 7, 6 | ANON-05 | **Gap — new ANON-* REQ + profile safe-private** |
| 8.6 | Audit-trail attributes | 7 | — | **Gap — new ANON-* REQ** |
| 9.1 | SQ length re-emit policy | 5 | SER-02/05 | ADR note |
| 9.2 | Pixel fragments + BOT | 5 | PIXEL-02, SER-02, TEST-02 | Good |
| 9.3 | Byte-order on emit | 5 | SER-03 | Good |
| 10.1 | PHI fixture leakage | 1, 8 | — | **Gap — new TEST-* REQ (CI scan + provenance)** |
| 10.2 | Single-vendor blindness | 8 | TEST-02/07 | Good |
| 10.3 | TS coverage | 8 | TEST-02 | Good |
| 10.4 | Strict-mode sweep | 8 | TEST-06 | Good |
| 10.5 | Must-have scenarios | 8 | TEST-02/03/05 | Partial (empty item, CP-246, GB18030, trailing-space UI, non-ASCII in ASCII VR, anon-UID-consistency) |
| 10.6 | Encapsulated round-trip | 8 | TEST-02, SER-02 | Good |
| 11.1 | Eager vs lazy values | 3 | MODEL-03 | ADR note |
| 11.2 | Buffer slice retention | 3 | — | **Gap — DOC + optional copyValues flag** |
| 11.3 | String decode timing | 3, 4 | CHARSET-03 | Partial (impl detail) |
| 11.4 | Mutation surface | 3 | MODEL-05 | Good |
| 12.1 | iconv-lite vs TextDecoder | 4 | SETUP-03 (ADR) | Good |
| 12.2 | Dual package hazard — default profile | 1, 6 | SETUP-02 | **Gap — default profile semantics ADR** |
| 12.3 | Dictionary drift | 1 | DICT-01/02/05 | Excellent |
| 12.4 | tsup .d.cts/.d.mts + attw | 1 | SETUP-02 | ADR note |

---

## REQUIREMENTS.md reconciliation summary

### New REQs recommended (gaps requiring new REQ-IDs)

1. **SQ-05** — UN with undefined length parsed as SQ (CP-246 behavior) + `DICOM_UN_PARSED_AS_SQ` warning.
2. **ANON-08** — `anonymize()` detects `(0028,0301) BurnedInAnnotation = YES` and emits `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`.
3. **ANON-09** — `anonymize()` populates audit-trail attributes `(0012,0062)`, `(0012,0063)`, `(0012,0064)` per PS3.15 Annex E.
4. **ANON-10** — `retain: ['SafePrivate']` option set; built-in vendor profiles declare per-creator safe-private tag lists.
5. **TEST-09** — Fixture-provenance CI scan (no plausible-real PHI dates or names); `test/fixtures/README.md` documents every fixture's source.
6. **TOL-11** — Extended warning-code catalog:
   - `DICOM_UI_TRAILING_SPACE`
   - `DICOM_DA_LEGACY_FORMAT`
   - `DICOM_DT_NONSTANDARD_OFFSET`
   - `DICOM_IS_NONINTEGER_VALUE`
   - `DICOM_NON_ASCII_IN_ASCII_VR`
   - `DICOM_NONZERO_RESERVED_BYTES`
   - `DICOM_PRIVATE_CREATOR_UNKNOWN`
   - `DICOM_UN_PARSED_AS_SQ`
   - `DICOM_CHARSET_AMBIGUOUS_SEPARATOR`
   - `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`

### Amended REQs recommended

1. **TS-02** — extend long-form VR list from `OB, OW, OF, SQ, UT, UN` to `OB, OW, OF, OD, OL, SQ, UT, UN, UC, UR`.
2. **TS-04** — tighten to "raw deflate per RFC 1951 (`zlib.inflateRawSync`, not zlib-wrapped)."
3. **CHARSET-01** — add `UC` to the VRs supporting extended character sets (`PN, LO, SH, LT, ST, UT, UC`).
4. **MODEL-03** — state explicitly that `.value` is lazily computed and memoized; `rawBytes` is source-of-truth; document buffer-slice retention semantics (with optional `copyValues` API flag).
5. **MODEL-05** — iterator / view return types are frozen so mutation via `ds.elements()` cannot escape.
6. **ANON-03** — specify single per-session offset (consistent across DA / TM / DT) for Longitudinal Temporal.

### Implementation ADRs recommended (not new REQs, but log in PROJECT.md Key Decisions)

- Annex E action table sourced from PS3.15 CSV input artifact (parallel pattern to Part 6 Dictionary generator).
- SQ length-encoding policy on serialize (explicit length in Explicit VR TS; undefined in Implicit VR LE; `(7FE0,0010)` encapsulated always undefined).
- Default profile + dual-package-hazard resolution (per-cache doc vs `globalThis` symbol).
- Private Creator block reservation rule (`XX → XX00-XXFF` high-byte mapping) captured explicitly.
- Decision path on `iconv-lite` vs `TextDecoder`-only: attempt `TextDecoder` + small ISO 2022 state machine first; add `iconv-lite` only if required.
- tsup dual-build + `attw` CI validation.

---

## Sources (confidence annotations)

- [DICOM PS3.5 current — Annex A.5 Deflated Explicit VR LE](https://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_A.5.html) — HIGH (normative spec)
- [DICOM PS3.5 current — §7.8 Private Data Elements](https://dicom.nema.org/dicom/2013/output/chtml/part05/sect_7.8.html) — HIGH (normative spec)
- [DICOM PS3.5 current — §6.2.2 UN VR](https://dicom.nema.org/medical/Dicom/2017e/output/chtml/part05/sect_6.2.2.html) — HIGH
- [DICOM PS3.5 current — Annex H Japanese Character Sets](https://dicom.nema.org/medical/dicom/current/output/chtml/part05/chapter_h.html) — HIGH
- [DICOM PS3.5 current — §6 Value Encoding](https://dicom.nema.org/dicom/2013/output/chtml/part05/chapter_6.html) — HIGH
- [DICOM PS3.15 current — Annex E Attribute Confidentiality Profiles](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/chapter_e.html) — HIGH (normative anonymization spec)
- [pydicom #1312 — UN-undefined-length sequence mishandling](https://github.com/pydicom/pydicom/issues/1312) — HIGH (real bug + discussion)
- [pydicom #1511 — odd-length EncapsulatedDocument invalid DICOM](https://github.com/pydicom/pydicom/issues/1511) — HIGH (real bug)
- [fo-dicom #1403 — PixelData padding lost on transcode](https://github.com/fo-dicom/fo-dicom/issues/1403) — HIGH (real bug)
- [fo-dicom #1879 — IndexOutOfRangeException on empty Specific Character Set](https://github.com/fo-dicom/fo-dicom/issues/1879) — HIGH (real bug)
- [fo-dicom #1847 — VR parsing confusion with blank char VR](https://github.com/fo-dicom/fo-dicom/issues/1847) — MEDIUM
- [fo-dicom #43 — Code Extension support](https://github.com/fo-dicom/fo-dicom/issues/43) — MEDIUM
- [Dicom Correction Proposal for Safe Private Elements (CP-1411)](https://dicom.nema.org/medical/dicom/Final/cp1411_ft_reservedgroupforknownssafeprivateelements.pdf) — HIGH
- [dcm4chee Character Sets conformance](https://dcm4chee-arc-cs.readthedocs.io/en/latest/charsets.html) — MEDIUM (reference implementation docs)
- [cornerstonejs/dicomParser](https://github.com/cornerstonejs/dicomParser) — MEDIUM (reference JS parser behavior)
- [suyashkumar/dicom Go PersonName parsing PR #167](https://github.com/suyashkumar/dicom/pull/167) — MEDIUM (PN parsing details)
- [TypeScript in 2025 — ESM/CJS publishing is still a mess (Liran Tal)](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) — HIGH (current dual-package guidance)
- [johnnyreilly — Dual Publishing ESM and CJS with tsup + Are the Types Wrong](https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong) — HIGH
- [Node.js docs — ESM dual package hazard (PR #30345)](https://github.com/nodejs/node/pull/30345) — HIGH

---

*Research produced 2026-04-22 for downstream synthesis into `SUMMARY.md` and reconciliation against `REQUIREMENTS.md` + `ROADMAP.md`.*

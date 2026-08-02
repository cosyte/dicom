# @cosyte/dicom: Project Guide for Claude

## Project

**`@cosyte/dicom`**: a developer-focused DICOM parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT). Sibling to `@cosyte/hl7` at `../hl7`.

**North star:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line, without having read the DICOM standard.

**Scope boundary (v1):** Metadata-first. Pixel data is exposed as raw `Buffer` + encapsulated fragments but **not decoded**. DIMSE network services and DICOMweb are explicit non-goals, tracked as future companion packages (`@cosyte/dicom-pixel`, `@cosyte/dicom-net`, `@cosyte/dicomweb`).

## Status

- **De-identification refuses to keep a value that has whole Data Elements inside it**
  (`DICOM-OVERDECLARE-SWALLOWS-INTO-VALUE`, closed after `0.0.6`). **This was the biggest PHI defect
  in the package and no sequence was involved in it.** PS3.5 defines Value Length as the length of
  _that_ element's Value Field; a sender that over-declares it produces a file whose reading is
  self-consistent and whose **next element has been absorbed into the previous one's value, header
  and all**. After that there is no `(0010,0020)` for Table E.1-1 to match, so `deidentify()` wrote
  the identifier into its output with a clean report. Measured on `scripts/measure-sq-bound-grid.ts`
  at `244a372`: **877 of 6,348 parsing cells**, 871 of them with no warning on either channel and no
  throw under `{ strict: true }`.
  **▶ THE PARSER IS UNTOUCHED ON PURPOSE, AND THAT IS THE REUSABLE PART.** An over-declaring element
  and a well-formed one with an odd value are **byte-identical**; intent is not on the wire, so no
  bound can choose between them - the same permanent fact about the format that killed one of the
  two sanctioned cut-backs on `#51`. So the remedy is at the **de-identify boundary**, where PS3.15
  actually places the obligation (§E.1 "all instances"; §E.3.5 for identifying information embedded
  inside a string attribute). Consequence worth keeping: **0 of 76,293 grid cells differ in any
  parse respect** - reading, both warning channels, `{ strict: true }`, marker survival - because no
  parser file is touched. A fix that cannot regress a reading is a different risk class from one that
  re-chooses a bound, and this family has now been refused four times for re-choosing bounds.
  **▶ THREE CONJUNCTS, AND EACH HAS A CONTROL TEST THAT DROPS EXACTLY ONE.** `src/deident/embedded.ts`
  empties a kept value only when its tail (1) tiles **exactly** to the end of the value as complete
  Data Elements, (2) contains a tag **this run** would act on - resolved through the same
  `resolveAction` the options resolve through, so `RetainUIDs` narrows it automatically - and (3)
  contains a byte the carrier VR's repertoire cannot hold. The third is what turns "these bytes
  happen to decode as an element" into "this is provably not a conformant value".
  New surface: `EmbeddedAttributeFinding`, `DeidentifyReport.embeddedAttributes`, and
  `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED` (**26 Tier-2 codes, was 25**; snapshot updated deliberately).
  **▶ THE REPERTOIRE CLAUSE IS §6.1.3 + TABLE 6.1-1, NOT §6.1.2.1, AND THE PER-VR RULE IS TABLE
  6.2-1 - THE REFUTER RE-DERIVED BOTH AND THE FIRST ROUND HAD THEM WRONG.** §6.1.2.1 is "Default
  Character Repertoire", two sentences about the ISO-IR 6 graphic set; it says nothing about control
  characters. §6.1.3 and Table 6.1-1 permit exactly five C0 controls in DICOM text, and **Table 6.2-1
  decides which of the five each VR may hold, in three tiers**: all five for `LT`/`ST`/`UT`, **ESC
  only** for `LO`/`SH`/`UC`/`PN` ("shall not have Control Characters except ESC"), none for the rest.
  Grouping `UC` with `LT`/`ST`/`UT` was **fail-open** on a text VR, and treating ESC as evidence in
  `LO`/`SH`/`PN` was **fail-closed on exactly the attributes that carry names** - ESC is how ISO 2022
  code extension is invoked under `(0008,0005)`. Both directions are now pinned by tests whose fixture
  is a run whose only non-graphic byte is the control character under test, so the tier is the only
  thing that can decide them. **A per-VR table transcribed from memory is not a citation.**
  **▶ CARRIERS ARE STRING VRs ONLY, AND THAT RESIDUAL IS LIVE, NOT THEORETICAL.** The identical
  over-declare into an `OB` / `OW` / `UN` / `US` carrier still writes the Patient ID into
  de-identified output with **no warning and no report entry** - measured by the refuter on hand-built
  files, identical on base. Arbitrary bytes are what those VRs are for, so no content test can decide
  it. **The grid never puts a binary VR in the over-declaring role, so this residual is disclosed but
  UNMEASURED and has no backlog item yet.**
  **▶ THE COST BUG THE FIRST ROUND SHIPPED, BECAUSE IT IS THE SAME CLASS `#51` DIED ON TWICE.** The
  backward memo pass was linear, but the forward loop re-scanned the tail **once per candidate
  offset**, and `(FFFE,xxxx)` bytes make **every** even offset a candidate: 256 KiB of attacker-chosen
  value took **22.5 s** in `deidentify()` against 2-4 ms to parse the same file, 257 s at the 1 MiB
  cap. `MAX_SCAN_BYTES` caps it **per element, not per file**. The remedy is one token - `return`
  instead of `continue`, valid because the repertoire test is **monotone in the offset** (a later
  candidate's region is a subset of an earlier one's) - and it is byte-identical in output. The lesson
  is not the token: **the slice asserted "linear" in three artifacts and cited `#51` as the reason to
  believe it, with a cost test whose fixture produced exactly one candidate.** A cost claim needs an
  adversarial fixture, not a big one.
  **▶ STILL OPEN, MEASURED, AND ITS OWN ITEM:** 1,155 grid cells still leak, and **within the grid**
  they are all Implicit VR LE carrying `DICOM_SQ_NOT_DESCENDED` - the `rawBytes` passthrough of a
  sequence the parser declined to descend (`DICOM-DEIDENT-RAWBYTES-PASSTHROUGH`). Read that as a
  statement about the grid, **not** as an exhaustive account of what still leaks: the binary-carrier
  residual above is outside anything the grid sweeps.
  **▶ `scripts/measure-sq-bound-grid.ts` IS NOW ON `main`.** It was written on the refused `#51`
  branch, which made this repo's own "re-run the grid before changing this code" unactionable. Cherry
  -picked with the `declaredLengthDelta` / `omitItemDelim` knobs in `test/helpers/build-dicom.ts` that
  it needs. 76,293 cells; `--diff` prints every number the artifacts state.
- **Phase 7 of 8 complete** (580 tests passing, 1 todo). Metadata-level de-identification live:
  `deidentify(ds, options?)` applies the PS3.15 Annex E Basic Application Level Confidentiality Profile
  plus the nine metadata-affecting Options, driven by the generated Table E.1-1 action map. Pure
  function: input `Dataset` never mutated; returns a fresh de-identified `Dataset` + a value-free
  `DeidentifyReport`. Conditional codes collapse to their most-protective leftmost branch (no IOD
  Type-1 analysis: fail-safe toward more removal); `U`-coded UIDs get deterministic, content-derived
  `2.25` replacements that stay referentially consistent across files; kept sequences are recursively
  de-identified **and re-encoded** so nested PHI is gone from the serialized bytes. Private attributes
  are removed by default (`RetainSafePrivate` + a `Profile` keeps only creator-recognized safe ones).
  Pixel-level cleaning is out of scope (deferred to `@cosyte/dicom-pixel`): burned-in annotation is
  warned (`DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`), never silently passed. New exports: `deidentify`,
  `makeUidRemapper`, `DEFAULT_UID_ROOT`, `DEIDENTIFY_OPTIONS`, `DEIDENTIFY_ERROR_CODES`,
  `DeidentifyError` + the `Deidentify*` types.
- **Phase 6 of 8 complete.** Source/vendor profile system live:
  `defineProfile()` + `parseDicom(buf, { profile })` opt into a composable, immutable `Profile`
  bundling warning `escalate` / `suppress` posture and a private-creator-keyed overlay that resolves
  the Implicit VR of vendor private data elements by the file's live creator string (canonical
  `"GGGGxxLL"` key, PS3.5 §7.8.1, never a hard-coded block). Five built-ins under the frozen
  `profiles` namespace (`ge` / `siemens` / `philips` vendor overlays + `strict` / `lenient` posture
  presets); an unrecognized creator degrades to `UN` plus `DICOM_PRIVATE_CREATOR_UNKNOWN`, never a
  wrong decode. A profile only tightens or annotates. Selecting one never changes a correct decode.
- **Phase 5 of 8 complete.** Spec-clean Part 10 serializer live:
  `serializeDicom(ds)` writes a `Dataset` back to a Part 10 `Buffer` (preamble + `DICM`, File Meta
  always Explicit VR LE with computed group length, dataset body in the source transfer syntax (no
  transcode) across all four v1 syntaxes), with even-length padding, short/long-form headers, retired
  group-length omission, and byte-for-byte SQ / encapsulated-pixel-data passthrough; plus the
  `DicomSerializeError` taxonomy. Known limitation: only the typed `FileMeta` fields round-trip.
- **Phase 4 complete.** Safety-critical domain helpers: `ds.patient` / `ds.study` / `ds.series` /
  `ds.image` typed fail-safe views over the §4 attributes, Enhanced multi-frame functional-group
  resolution (`image.frame(i)`, Per-Frame-else-Shared), coded triplets (`readCode`), and the
  value-layer `DicomValueError`. Builds on Phase 3 VR value decode (all 34 VRs via `Element.value`) +
  the `Dataset`/`Item` navigation API.
- **The element registry is sourced from the normative PS3.6 DocBook, not from a mirror alone.**
  `vendor/nema/part06/` pins `part06.xml` (**PS3.6 2026c**) by SHA-256, and
  `scripts/generate-dictionary.ts` overlays it **per field** on the Innolitics base: PS3.6 wins on
  name / keyword / VR / VM / retired for any tag it publishes, PS3.6-only tags are added, mirror-only
  tags are **kept** (PS3.6 retires, it does not delete, so an absence is more likely a parse gap here
  than a withdrawal there). Registry: 5,309 tags, 5,214 keywords. Scoped to Tables 6-1/7-1/8-1/9-1;
  **UIDs are deliberately not overlaid** (the short forms and the structured `retired` boolean are
  intentional deviations from Table A-1), and PS3.15 Annex E is a different part and generator.
  The pin is a **precondition**: the generator re-hashes the file and refuses to run on a mismatch,
  reads the edition from the document's own `<subtitle>`, and fails loudly on a row that is not six
  cells, a malformed tag, a non-identifier keyword, an unknown VR token, or under 5,000 rows.
  Two DocBook traps, both covered by tests: the keyword column carries 13,470 **ZERO WIDTH SPACE**
  hints (one left in yields a keyword that looks right and never matches), and the sixth column
  carries `DICOS`/`DICONDE` markers next to `RET (edition)` (reading it as a boolean would retire 391
  live tags). **There is no staleness clock and must not be one** - a date gate fires the day it is
  written, demands an action nobody can take on demand, and reds unrelated PRs. "Has NEMA moved" is
  one content-comparing command in `vendor/nema/README.md`; CI gates byte-identical regen, offline.
- **The Annex E action table is sourced from the normative PS3.15 DocBook, not from a mirror alone.**
  `vendor/nema/part15/` pins `part15.xml` (**PS3.15 2026c**) by SHA-256, and
  `scripts/generate-annex-e.ts` overlays Table E.1-1 **per field** on the Innolitics base, the same
  authority rule the dictionary uses: PS3.15 wins on attribute name / Basic Profile code / the nine
  option columns for any tag it publishes, PS3.15-only tags are added, mirror-only tags are **kept**.
  Table: 652 entries, up from 617. The 35 additions were **not cosmetic**: the mirror snapshot was
  2024b-era, and **32 of the 35 missing tags are marked `X` (remove)** by the current standard (the
  other three are `(0040,B020)` `X/D`, `(0070,0006)` `D`, `(300A,0054)` `U`), among them
  `(0010,0011)`-`(0010,0016)` (the preferred-name and pronoun block, including `(0010,0012)` a
  patient's **preferred name**), `(0010,0041)`-`(0010,0047)` (gender identity, sex parameters for
  clinical use), and `(0010,2161)`/`(0010,2162)`. Because `annexE()` returns `undefined` for a tag it
  does not carry and `deidentify()` reads `undefined` as "not listed, keep", **every one of them
  survived `deidentify()` verbatim and the report said nothing** - shipped that way at `0.0.3`.
  `deid`'s `/dicom` adapter delegates here, so it had the same hole. **The lesson: a de-identifier's
  action table lagging the dictionary is a silent PHI leak, not a currency nit. They advance together
  or the gap only widens.** The pin is a **precondition** (re-hashed, refuses on mismatch); the
  edition is read from the document's own `<subtitle>`; the parser fails loudly on a header row whose
  15 labels are not where the column indices expect them (a cell count catches an inserted or dropped
  column, **not a reorder**, which would read one option's code as another's), a body row that is not
  15 cells, an unrecognized tag cell, an unknown action code, an empty Basic Profile cell, an
  unaccounted `<tr>`, or under 600 rows. **No staleness clock, and there must not be one** - same
  reasoning as PS3.6. The mirror-only count prints every run too, so the "retires rather than
  deletes" assumption stays observable. One deliberate exclusion remains, **printed on every run**
  rather than assumed: the **169 rows** where PS3.15's two E.3.6 date columns diverge under the
  single collapsed `RetainLongitudinalTemporal` (which carries the full-dates column, the **less
  protective** branch - `K` on all 169 where modified-dates says `C`; the JSDoc and troubleshooting
  doc now say so, and splitting the option is a public-surface change deliberately not made).
- **Table E.1-1's repeating-group rows are matched by mask, bounded by PS3.5 §7.6.** `(50xx,xxxx)`
  Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay Comments are all marked **X** and
  were all unreachable by an exact-tag matcher, so `(6000,4000)` free text came through
  `deidentify()` verbatim with a **clean report** - shipped that way at `0.0.3`, and `deid`'s
  `/dicom` adapter inherited it. `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` never covered this: it
  keys on `(7FE0,0010)` + `(0028,0301)`, the **image**, not the overlay planes. The generator now
  emits the three rows as `ANNEX_E_REPEATING` pattern rules; `annexE()` consults them **on an
  exact-tag miss only** (an exact row is the more specific statement and wins - the shadowing count
  prints every run and is 0 today), and a match is **removed AND reported** with
  `DeidentifiedAttribute.repeatingGroup` naming the mask. **The range is the load-bearing part and it
  is not the mask's shape:** PS3.5 §7.6 bounds repeating groups to the **even** groups `6000`-`601E`,
  and PS3.5-2004 §7.6 (which the current edition's note delegates to for curves) to the even
  `5000`-`501E`. Sixteen groups per mask, not 256. `src/dictionary/repeating-groups.ts` is the single
  home of that fact **on the de-identify path**, imported by both the generator and the runtime so
  those two cannot drift. It is **not** the only mask matcher in the package and must not be unified
  with the other one: `src/parser/element-header.ts`'s `matchRepeatingGroup` reads `x` as an
  unbounded hex wildcard over the PS3.6 registry's ~88 masked entries and _will_ answer for
  `(6020,4000)`. That is correct there and wrong here, because a too-wide **VR guess** only yields a
  lenient decode of what would otherwise be `UN`, while a too-wide **removal** deletes data the
  standard never marked. Postel's Law on the read path, the standard's bound on the de-identify path.
  Over-broad is a **different** unsafe direction from under-broad, so both are tested: `(6020,4000)`
  and `(6001,4000)` must NOT match on the de-identify path. **The guard is worth more than the fix:**
  a masked row on a prefix
  PS3.5 does not define (e.g. `(7Fxx,0010)`) now **fails the generator** instead of being printed and
  dropped, which is precisely how these three rows went missing. Proven by mutation in
  `test/scripts/generate-annex-e.test.ts`: the pre-remedy generator exits 0 on an injected `(7Fxx,0010)`
  row, the post-remedy one exits 1; a second mutation moves the Overlay Comments code `X` -> `K` and
  proves the emitted rule follows the document rather than a hard-coded `X`.
- **PS3.5 is vendored too, so the repeating-group bound is derived rather than transcribed.** This
  closed the last asymmetry in the authority story: PS3.6 and PS3.15 were SHA-pinned and re-hashed
  while the bound they are expanded by was a **quotation in a source file**, which meant the
  generator's guard caught a new mask _prefix_ but never a changed _bound_. `vendor/nema/part05/`
  pins `part05.xml` (**PS3.5 2026c**) and `vendor/nema/part05-2004/` pins `04_05pu.pdf`;
  `scripts/generate-repeating-groups.ts` emits `src/dictionary/generated/repeating-groups.ts`, and
  `src/dictionary/repeating-groups.ts` re-exports it, so the runtime, the Annex E generator and the
  documents cannot drift. **Two documents because the bound is split across two editions,** and this
  is the part to understand before touching it: the current edition states the **overlay** bound
  (`6000`-`601E` even) normatively and excludes the odd `6001`-`601F`, but says **nothing** about the
  **curve** bound - it retired curve encoding and _delegates_, in section 7.6's own Note, to
  PS3.5-2004 at an explicit URL, which is where `5000`-`501E` even comes from. So the 2004 PDF is not
  a convenience copy, it is the authority the edition in force names. **The overlay bound is stated
  by both editions and the generator requires them to agree** - that cross-check is the real gate,
  and the generator also **proves the delegation** (section 7.6 must link exactly the vendored 2004
  URL) rather than assuming it, so an edition that re-states the bound inline or points elsewhere
  fails loudly instead of being silently overridden by a 22-year-old PDF. `gen:repeating-groups` runs
  **first** in `gen:all` because `generate-annex-e.ts` imports this module, but be precise about what
  that buys: a **missing** artifact fails that generator at import, while a merely **stale** bound
  leaves `annex-e.ts` byte-identical (measured), since the expansion happens at **runtime** in
  `matchesRepeatingPattern` and the generator only uses the bound for a prefix guard and a printed
  statistic. The ordering is right; the **regen gate**, not the ordering, is what catches a wrong bound.
  Falsifiability is the point and is proven by mutation in
  `test/scripts/generate-repeating-groups.test.ts`: moving the overlay bound in **either** edition
  reds the cross-check, moving the **curve** bound in the 2004 edition moves the **emitted artifact**
  (nothing contradicts it, so the byte-identical regen gate is what catches it), and removing the
  delegation link stops the 2004 document being used at all. Each was confirmed non-vacuous by
  disabling the guard and watching the test go red.
  **▶ LOCATING A SPEC SECTION: NEVER FIRST-MATCH. Copy this rule, it generalises.** A heading appears
  at least **twice** in a standards document: in the **table of contents** (dotted leader, page
  number) and on the section itself. First-match reads the TOC. Measured here, not theorised: scoping
  the 2004 read by first-match produced a **130-character** slice instead of the 1,364-character body
  and the generator **exited 1**. It failed closed, which is the only reason this is a note rather
  than a wrong de-identification bound; a first-match that landed on a section with _some_ matching
  text would have failed **open** and silently. The rule instead is **collect every candidate
  section, keep those containing the normative sentence, require exactly one** - which rejects the
  TOC _by content_ rather than by a "skip the first hit" heuristic. Be exact about the second
  half: it proves at most **one heading-delimited candidate** carries the sentence, which is what a
  bare `.exec` silently assumes and does not check. It does **not** prove document-wide uniqueness -
  a second occurrence inside the same slice, or one outside any `7.6`-to-`7.7` window, is invisible
  to the count. (It happens to be unique here: one occurrence in 416,764 characters, measured.) Zero
  and two candidates are both refusals. **Reading the 2004 PDF needs a PDF reader**: a
  deliberately minimal one (Node `zlib` only, inflate the content streams, concatenate the text
  operators' literal strings) lives in that generator. It recovers **one sentence**, checked against a
  precise expected shape. **Do not grow it into a general PDF parser** - if it needs more, prefer
  re-deriving the bound from a current normative source. **No staleness clock here either**, same
  reasoning as PS3.6 and PS3.15.
- **Diagnostics are built from a frozen registry, not from the document** (`PHI-WARNING-MESSAGE-LEAK`).
  Every Tier-2 message is looked up in `WARNING_MESSAGES` keyed by the code; factories take a position
  and structural constants only (a tag this parser composed, a VR checked against the closed 34-VR
  set, input-derived numbers). **There is no string parameter for a value to travel through**, which
  is the single property separating the `@cosyte/*` parsers that leak from the ones that do not. Three
  sites did interpolate one: `DICOM_UNSUPPORTED_CHARSET` echoed the `(0008,0005)` term, which is
  multi-valued **on the backslash** and which `deidentify()` then carried onto the dataset it labels
  safe to share; `DICOM_PRIVATE_CREATOR_UNKNOWN` echoed the Private Creator; and the
  `UNSUPPORTED_TRANSFER_SYNTAX` fatal echoed the UID into `err.message`, with the writer doing the
  same. **The bound also has to reach the model, and this is the part to keep:** `hl7` fixed its
  messages, verified green, and `deid` still leaked, because `Segment.type` stayed unbounded on the
  model. So `Element.specificCharacterSet` and `Element.privateCreator` bound on **membership** (in
  PS3.3's closed term table, and in the active `Profile`'s overlay) rather than on shape, because
  DICOM offers no shape to test: `LO` admits 64 characters of anything, and a defined term is refused
  precisely when the closed table does not name it. **With no profile, `Element.privateCreator` reads
  `<withheld>`**; the raw creator remains available as the `(gggg,00EE)` element's own bytes.
  `deidentify()` re-derives block reservations from the dataset's creator elements so
  `RetainSafePrivate` is unaffected. The gate is `test/integration/phi-diagnostic-surface.test.ts`, a
  38-slot table bound to `assertNoDiagnosticPhiLeak`; **it was run red on the base commit and named
  seven leaking slots.** The suite it joined could not have: `test/property/_arbitraries.ts` excludes
  the backslash from `TEXT_ALPHABET` by design and never generates `(0008,0005)` or a Private Creator
  at all. **`@cosyte/test-utils` must stay pinned `^0.0.2` or higher** - a caret on a `0.0.x` resolves
  to that version exactly, so a `^0.0.1` pin silently tests against a kit with no such runner and
  passes. Four doc claims said the reverse of the source (warnings "PHI-free by construction",
  `DicomParseError` retaining "no raw input snippet" when `snippet` is 16 source bytes) and are
  corrected; the `DeidentifyReport` is value-free **apart from `uidMap`**, whose keys are the file's
  own source UIDs. **The gate does not make the diagnostic surface PHI-free and must not be described
  that way**: `snippet` is still 16 raw bytes as hex, deliberately (D-10), and hex is a re-encoding
  the runner cannot match, so no slot can ever go red on it.
  **Private block reservations are scoped per Data Set, and the refuter caught this the hard way.**
  PS3.5 §7.5 makes each Sequence Item its own Data Set and §7.8.1 scopes a Private Creator's
  reservation to the Data Set it appears in, so the same block number names different vendors at the
  root and inside an item. The first version of the `RetainSafePrivate` creator re-derivation built
  one map from `ds.elements()` and used it at every depth: it **retained an item's private element on
  the root's reservation and wrote the PHI into the serialized output**, and dropped one correctly
  reserved inside the item it was used in. `processElements` now derives the map at every depth it
  recurses to, and `test/deident/deidentify.test.ts` has both directions (each confirmed to red
  against the root-scoped version) plus a third: an item's private element whose creator is declared
  **only at the root** is now removed, because the item has no reservation of its own. That is the
  conformant reading and fail-safe, and it is a **behaviour change against `0.0.5`** for any sender
  that declares a creator once at the root and writes private data into Per-Frame Functional Groups
  items.
- **The parser scopes reservations per Data Set too, and the wrong decode was constructed**
  (`DICOM-PARSE-CREATORS-SCOPE`, the read-path half of the item above). `ctx.creators` was **one map
  for the whole parse**, so a block number claimed by different vendors at the root and inside a
  Sequence Item resolved to whichever creator was read **last**, wherever it sat. That map feeds
  `resolveImplicitVR`, so unlike the de-identify half the failure is **a wrong VR, a mis-decoded
  value**, not an over-retention: with an item claiming block `0x11` and the root afterwards writing
  `(0029,1101)` without claiming it, the root element took the item's vendor and `FF FF` read as a
  signed **`-1`** instead of raw bytes, silently. `parseSequence` now swaps in a **fresh, empty** map
  per Sequence Item and restores the enclosing Data Set's on the way out, alongside the charset
  save/restore that was already there. Note the asymmetry, because it is the easy thing to get
  wrong: **items inherit charset, they do NOT inherit reservations.** All three structural parsers
  and the CP-246 descent route through `parseSequence`, so one place covers every transfer syntax.
  **Do not "simplify" the map back onto the context as a `readonly` field** - the swap is what scopes
  it, and it is why `ParseContext.creators` is deliberately mutable.
  The gate is `test/integration/private-creator-scope.test.ts`, and the shape to copy is that the
  two vendors' overlays **disagree on the VR of the same element byte** (`US` vs `SS`) over the bytes
  `FF FF`, so a mis-scoped reservation is observable as `65535` versus `-1` rather than as a label:
  **8 of its 12 tests were run red against the whole of `src/` at the base commit**, one of them on
  `expected 'SS' not to be 'SS'` at the root. Re-measure that figure if you add a test rather than
  carrying it forward: it read `6 of 9` after the first draft and the remedy below made it stale. All three directions are covered (root does not reach into an item, an item does not
  escape to the root, an item does not reach a sibling item) plus a two-level nesting case and an
  Explicit VR case where only `Element.privateCreator` is wrong because the VR is on the wire.
  **A Data Set that never claimed the block now gets `UN` plus `DICOM_PRIVATE_TAG_NO_CREATOR`**,
  which is a **behaviour change against `0.0.5`** and the fail-safe direction on a read path: the
  bytes are untouched on `Element.rawBytes`, and what is withheld is a typed decode the file never
  licensed. PS3.5 2026c section 7.5.1 grounds it ("Each Item Value shall contain a DICOM Data Set
  composed of Data Elements", closing by delegating to section 7.8 for Sequence Items), with section
  7.8.1 Note 1 saying the nesting case outright: each item needs to claim the corresponding private
  block of Elements. Cited as a Note, so informative, and read from the vendored pin.
  **▶ THE PART THAT ALMOST SHIPPED WRONG, AND THE REUSABLE LESSON: A FAIL-SAFE DEGRADE IS NOT
  AUTOMATICALLY A SMALL ONE. MEASURE WHAT ELSE READS THE FIELD YOU DEGRADED.** The refuter refuted
  pass 1 on it. `parseImplicitLE` treated **any** resolved VR other than `SQ` at length `0xFFFFFFFF`
  as a Tier-3 fatal, so degrading a profile-resolved `SQ` to `UN` turned a file that parsed into
  `INVALID_FILE_META` and lost **the whole object** - patient, study, modality - not just the private
  block. Two shipped artifacts had already been written asserting the opposite ("Nothing is lost").
  The remedy is the **Explicit-VR path's own CP-246 rule applied on the Implicit-VR path**: `UN` at
  undefined length attempts `tryParseUnAsSQ`, promotes to `SQ` with `DICOM_UN_PARSED_AS_SQ` on
  success, and falls through to the identical throw on failure, because that primitive already
  restores state and drops its warnings. Proven non-vacuous by stashing `implicit-le.ts` alone and
  watching the descent test red with that exact fatal. **The second face has no code remedy and is
  disclosed instead:** under `{ strict: true }` the new warning is promoted to a throw, so a file
  whose items borrow an enclosing block parses lenient and throws strict. That is strict doing its
  job on a warning that is now correctly emitted, and the release note says so.
- **Both of PS3.5's sequence-delimitation forms are descended under Implicit VR LE, and only one of
  them used to be** (`DICOM-IMPLICIT-SQ-NOT-DESCENDED`, found by `#49`'s refuter, pre-existing and live on the
  published `0.0.5`). `src/parser/implicit-le.ts` called `parseSequence` **only** in the
  `length === 0xFFFFFFFF` branch, so a defined-length sequence was stored as raw bytes with
  `Element.items` **`undefined`**. **That is a PHI defect, not a navigation gap**, and the mechanism
  is the one to carry forward: `deidentify()` recurses into a kept sequence **only when its items
  exist**, so a `(0010,0010)` Patient's Name nested in a defined-length item reached
  `serializeDicom()` output verbatim while the `DeidentifyReport` named only the root attribute.
  **The report asserting a scrub it had not performed is the worse half** - an incomplete audit that
  reads as a complete one is exactly what a caller trusts before sharing. Same class as the two leaks
  shipped at `0.0.3`.
  **▶ CITE 7.5.2 FOR THIS, NOT 7.5.1, AND THE ITEM ITSELF GOT IT WRONG.** PS3.5 2026c states the
  obligation **twice, about two different length fields**, and both sentences are unique in the
  document (measured). Section **7.5.2 "Delimitation of The Sequence of Items"** governs the `SQ`
  element's OWN length, which is the field this defect defaulted on: "The encoder of a Sequence of
  Items may choose either one of the two ways of encoding. Both ways of encoding shall be supported
  by decoders of the Sequence of Items." Section **7.5.1 "Item Encoding Rules"** says the same of
  each `(FFFE,E000)` Item's length field, and is the right cite for the nested-form cases only. The
  backlog item and this file's own earlier note both quoted 7.5.1's sentence for a 7.5.2 defect;
  read from the pin rather than carrying a quotation forward.
  The gate is `test/integration/implicit-sq-descent.test.ts`, **8 of its 11 tests run red against
  `src/` at `d90105f`**, and the shape to copy is the **control**: the identical fixture under
  Explicit VR LE, whose parser already descended both forms, is compared **report against report**
  rather than against a hand-written expectation - same attributes, same actions, same context paths.
  The three that stay green on base are the deliberate no-loss controls.
  **▶ THE TEST THAT LET THIS SHIP WAS NAMED FOR THE THING IT DID NOT CHECK, AND THAT IS THE REUSABLE
  PART.** `test/parser/implicit-le.test.ts` had "explicit-length SQ also descends" asserting
  `vr === "SQ"`, which dictionary resolution answers whether or not anything descends, and
  `vm === 1`, which was the **Phase 2 scalar placeholder** every non-sequence element already carried.
  Both were green against a parser that never opened the sequence. A test that asserts only values a
  broken implementation also produces is worse than no test: it occupies the slot.
  **▶ A FAILED DESCENT DEGRADES RATHER THAN FAILING THE OBJECT, and the asymmetry against Explicit VR
  is deliberate.** Implicit VR LE has no VR on the wire, so `SQ` is **this parser's inference from
  PS3.6**, not something the sender wrote, and a defined length leaves a complete alternative reading
  of the value. So `tryParseDefinedLengthSQ` rolls the parser back, drops the failed descent's
  warnings, keeps the declared span on `Element.rawBytes`, and raises the new Tier-2
  `DICOM_SQ_NOT_DESCENDED` (**25 codes, was 24**; the locked `WARNING_CODES` snapshot was updated
  deliberately). The **undefined-length** form keeps its Tier-3 fatal, because there is no other way
  to find the end of the value. It warns rather than degrading in silence because silence is the
  defect above. Under `{ strict: true }` the new warning promotes to a throw, so such a file parses
  lenient and throws strict - disclosed in the release note, no code remedy, same shape as `#49`'s.
  **`rawBytes` stays VALUE-ONLY for this shape** and that is load-bearing: `isFullSpanElement` keys
  exactly this case off the encoding (a defined-length SQ is full-span under Explicit VR and
  value-only under Implicit VR), so a full-span slice would make the writer emit the header twice.
  **▶ THE REFUTER REFUTED PASS 1, AND THE FINDING GENERALISES TO EVERY DESCENT PRIMITIVE HERE:
  HAND IT A SLICE, NOT THE WHOLE BUFFER.** The first version passed `parseSequence` the whole buffer
  plus `explicitLength`. `parseSequence` computes `endLimit` from that length but bounds each item's
  value read against **`buffer.length`**, so an item that **over-declares** its own length read
  straight past the sequence and swallowed the next root element - while `parseImplicitLE` resumed at
  the declared end, so the same bytes were **read twice**: a root `(0008,0060)` Modality reported as a
  per-item attribute AND still at the root, then written twice by `deidentify()`'s re-encode. Silent,
  and silent under `{ strict: true }` too. PS3.5 section 7.5.2 makes the Value Length the exact extent
  of the item stream, so a byte past it is not the sequence's to read. `tryParseUnAsSQ` already
  sliced; the new primitive now does the same. **The fixture that catches it has to over-declare by
  EXACTLY the trailing element's size** - over-declaring past the end of the buffer only trips the
  truncation guard that already existed, which is why a first draft of the regression test passed
  against the broken code.
  **▶ AND THE SECOND FINDING: A DOC CLAIM THE CODE DID NOT MAKE.** The README and troubleshooting
  page were written saying both un-auditable shapes "announce themselves". **False:** a failed CP-246
  `UN` descent emits **nothing** (`tryParseUnAsSQ` rolls back and returns without an `emit`, and the
  Explicit VR fallback builds the `UN` element silently) - measured `warnings=[]`, `vr=UN`,
  `items=undefined`. The silence is pre-existing; **the claim was new, so the remedy was to correct
  the claim, not to grow a guard.** The honest test for a consumer is `el.items === undefined`, not
  `ds.warnings`.
  **Residual, pre-existing on the CP-246 path, now reachable from one more shape:** a refused descent
  pops its warnings off `ctx.warnings`, but `makeEmitter` hands them to `onWarning` **before** the
  push it is undoing (D-03 ordering), so a streaming consumer sees warnings `ds.warnings` does not.
  Disclosed, not fixed - buffering emissions is a larger change than the leak it would tidy.
  **Residual, PRE-EXISTING and filed rather than fixed here:** the same unbounded item read
  mis-structures **Explicit VR LE** on `main` and on published `0.0.5` (the root element vanishes from
  the root and exists only inside the item, and the element ships a `length` shorter than its
  `rawBytes`). Bounding `parseSequence` itself would close both, but on the Explicit VR path there is
  no fallback, so it would convert a file that parses today into a whole-object `INVALID_FILE_META` -
  precisely the trap `#49` paid for. It needs its own slice, with that loss measured.
  Also minor, and the second refuter pass caught the wording: **everything raised inside a descent is
  slice-relative, and that covers `Element.byteOffset` on a nested element, not just a warning's
  `position`.** Defined-length items always were (`parseSequence` hands the inner parser an
  `itemSlice`), so the two _item_ forms now agree; they still disagree with the undefined-length
  _sequence_ branch, which passes the whole buffer. `Element.byteOffset` documents no
  frame-of-reference contract either way. The refusal this slice's own primitive emits is the
  exception and is absolute.
- **Em-dash brand gate armed.** `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) plus
  `.github/workflows/no-emdash.yml` enforce the founder directive banning `U+2014` outright
  (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever."). It scans **both** halves the
  rule covers: every tracked file, **and** the PR title, body, and commit messages, on the
  non-default `edited` trigger so retitling a PR re-checks it. What lands on `main` here is a repo
  setting, read rather than assumed: `squash_merge_commit_title: COMMIT_OR_PR_TITLE` and
  `squash_merge_commit_message: COMMIT_MESSAGES`, so the subject comes from the PR title (or from
  the lone commit's subject, when the branch has exactly one) and the body from the branch commit
  messages. The PR body does not land; the gate scans it anyway, as deliberate over-strictness on a
  surface that costs nothing to cover. The script is the **text-only** variant, taken from
  `ncpdp` rather than the older `knowledgebase` copy so that it carries `ncpdp`'s two shape fixes
  (a tracked file named `-` was read as stdin and never opened; `-d skip` silently passed a tracked
  symlink to a directory). dicom was **not** clean when this landed: an earlier markdown-only survey
  said it was, but six em dashes lived in four non-markdown files and this slice removed them,
  including the npm `description`. **Measure every tracked file, not just markdown.**
  It deliberately omits `grep -I`, and that is the choice to understand before touching this file.
  `src/dataset/vr/charset.ts` holds a **functional NUL** inside `/[\x00 ]+$/u` (DICOM's own padding,
  stripped by that regex), so grep classifies it binary. It carries no em dash, so it scans green.
  If it ever gains one, grep writes `binary file matches` to stderr with empty stdout and the
  stderr capture reds the run. Adding `-I` would make that same edit pass in silence, so do not add
  it, and do not remove the NUL to quiet the gate. When the gate goes red the fix is never to
  re-encode the character: rewrite with a period, colon, comma, or parentheses. Known limits are in
  the script header and are shared across every copy, so fix them there, not here.

## Tech Stack (the shared `@cosyte/*` standard)

dicom inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files (Phase E migration). The source of truth is the meta-repo's
`documentation/conventions.md`; this is a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`.
- **Build:** dual ESM + CJS + `.d.ts`/`.d.cts` via `tsup` (`@cosyte/tsup-config`); `attw` is a
  publish gate (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory gates. The
  gate is **enabled**; floors currently sit just below 90 (transient, with TODOs) while the early
  phases fill in coverage (see `vitest.config.ts`).
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows; the repo-specific
  `dictionary-regen.yml` byte-identical regen gate is kept.
- **Runtime deps:** **≤ 3**, each MIT/Apache-licensed and ADR-justified. Deliberate divergence from
  `@cosyte/hl7`'s zero-dep rule; DICOM byte-level + charset work earns the exception. (Currently
  zero are taken.)
- **License:** MIT

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export (feeds IntelliSense).
- Immutable by default. Mutation only via explicit methods (`setElement`, `addElement`, `removeElement`, `addItem`, `removeItem`).
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings with stable codes and byte-offset positional context); serializer is conservative (always emits spec-clean DICOM Part 10 with correct File Meta group length, even-length values, proper padding).
- Fatal errors only for unrecoverable structural corruption (4 Tier-3 codes: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`). Everything else is a warning.
- Buffer-first API for binary values. String decoding respects `(0008,0005)` Specific Character Set.
- Data dictionary is generated at build time from the official DICOM Part 6 source and committed; runtime has no network/filesystem dependency on it.
- Coverage: per-directory gate **enabled** on `src/parser/`, `src/dataset/`, `src/dictionary/` (and
  `src/helpers/` once it exists) via `pnpm test:coverage`. Canonical bar is ≥ 90%; early-phase floors
  currently sit just below that as documented transient relaxations with TODOs. Raise them toward 90
  as coverage fills in, never disable the gate. `vitest.config.ts` is the source of truth.

## Style Reference

This project mirrors `@cosyte/hl7`'s tooling, artifact discipline, and engineering bar. Two deliberate divergences:

1. **Runtime deps allowed (≤ 3)**. See Tech Stack above.
2. **v1 scope narrower than the full standard**: metadata-first, no pixel decode, no network.

## Standing disciplines (every change)

These three bind every change in this repo (mirrored from the cosyte meta-repo's
`documentation/conventions.md`):

1. **Documentation follows code.** A public-surface / stack / status change isn't done until its
   docs are: this package's own docs (`docs-content/` + JSDoc), and (in the meta-repo) its
   `documentation/repos/<repo>.md` and the `ecosystem-map.md` status table.
2. **Version + changelog every meaningful change.** Add a Changeset (`pnpm changeset`, `patch`
   during pre-alpha) and keep `CHANGELOG.md`'s `[Unreleased]` current. Stay on `0.0.x` until first alpha.
3. **Crew + knowledgebase feedback loop.** When a standard, decision, or public surface changes,
   flag whether a `crew` skill or `knowledgebase` doc needs creating/updating, never silently skip.

Build, lint, format, and TypeScript settings come from the shared `@cosyte/*` config packages
(`@cosyte/tsconfig` · `@cosyte/eslint-config` · `@cosyte/prettier-config`; see
`documentation/conventions.md` → "Canonical toolchain (enforced)"). Node ≥ 22.

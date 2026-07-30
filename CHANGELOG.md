# Changelog

All notable changes to `@cosyte/dicom` will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`README.md` now opens with the cosyte social banner for this package** (`ASSETS-P8`). A plain
  markdown image above the H1, matching `hl7`, `x12` and `ccda`: no `<img>`, no `<picture>`, no link
  wrapper. The tile is self-grounded by design and deliberately does not depend on `<picture>`
  surviving npm's markdown sanitizer, which is still unverified. The alt text is content rather than
  decoration, because it is what a screen reader reads on the npm page: it names the package and
  states its purpose in the package's own voice. The image URL was re-verified with `curl -I` as
  `200 image/png`, 19,456 bytes, before this landed, rather than taken from the `live` flag in
  `assets/published-urls.json`, whose own `$fields.status` note says to read `live` for what it is:
  a declaration made on evidence from another repo, never a fact checked there.

### Changed

- **`CHANGELOG.md` now records what each released version contained.** Every entry in this file sat
  under `[Unreleased]` while npm served `0.0.1`, `0.0.3` and `0.0.4`, and `CHANGELOG.md` is in
  `package.json#files`, so the file shipped inside the tarball telling a consumer that the version
  they had installed was unreleased. That is a false claim on a distributed surface rather than
  untidy bookkeeping. No entry's substance is rewritten: each is moved to the version that actually
  shipped it, reconstructed from the tags, the GitHub releases, and the changesets each
  "Version Packages" commit consumed. `0.0.2` gets no heading because it was never published: it was
  version-bumped on 2026-07-27 and the publish that followed did not run, so its four changesets
  reached npm inside `0.0.3` and are recorded there. That is also why npm's version list skips
  `0.0.2`.

### Fixed

- **`README.md` documented an element-access API that does not exist.** `Dataset.get` / `has` /
  `getAll` take the 8-character `(group,element)` tag (`"00080060"`, case-insensitive) and nothing
  else, but the README's quickstart, feature list, access-pattern section, typed-value examples and
  Philips vendor note all showed `ds.get("Modality")` and `ds.get("(0008,0060)")`. Both forms return
  `undefined`, and because the `Tag` type is `string` the compiler catches neither: the first line a
  reader copied out of the quickstart silently produced nothing. Measured against the built package
  rather than read off the source. The identical defect was found and corrected in
  `docs-content/intro.md` before `0.0.3` (see below) and the README was not swept with it, which is
  the reason to state the rule once here: `get` takes a tag, and a keyword is resolved to its tag
  through `Dictionary.byKeyword(...)?.tag` first. Every example is corrected and the section is
  retitled from "By keyword or tag" to "By tag". `docs-content/spec-notes-model.md` carried a
  neighbouring defect and is corrected with it: it said `getAll` "returns every element at a
  repeating tag", where a `Dataset` holds at most one element per tag, so it returns 0 or 1.
- **`README.md` claimed compressed transfer syntaxes were readable at the structural level.** It
  said the supported set was the four v1 syntaxes "and any compressed syntax at the structural level
  (fragments preserved)". The dispatch table holds exactly four entries and any other Transfer
  Syntax UID is the fatal `UNSUPPORTED_TRANSFER_SYNTAX`, so a JPEG, JPEG-LS, JPEG2000, RLE or HTJ2K
  object does not parse at all. Confirmed by parsing a synthetic object in `1.2.840.10008.1.2.4.50`
  and catching the throw. Deflated Explicit VR LE is the one compressed syntax that is supported: it
  deflates the dataset stream rather than the pixels, and the corrected text says so rather than
  calling every compressed syntax unreadable. This mattered most in the "index a folder of studies"
  recipe, whose closing line promised that "nothing here throws on a quirky file" while a real
  archive is full of pixel-compressed objects. That recipe now names all four Tier-3 conditions a
  folder walk meets (`UNSUPPORTED_TRANSFER_SYNTAX`, `INVALID_FILE_META` for a truncated or
  partly-copied file, `NOT_DICOM_PART_10` for a non-DICOM file in the folder, `EMPTY_INPUT` for a
  zero-byte one) and says to catch `DicomParseError` per file and skip. The non-goals entry no
  longer implies a compressed object is read structurally either.
- **`README.md` counted four typed errors where five are exported.** The Error Handling section
  introduced "four typed errors" and then documented `DicomParseError`, `DicomValueError`,
  `DicomSerializeError`, `ProfileDefinitionError` and `DeidentifyError`. The count is now five. The
  same paragraph said warnings are "never thrown", which a profile's `escalate` list contradicts. It
  now says warnings are data unless you ask otherwise, and names `escalate` as the route that asks.
- **`docs-content/` stated the published version as `0.0.1`, two published releases stale.**
  `installation.md`'s status note and `troubleshooting.md`'s scope entry both named `0.0.1` while
  npm served `0.0.4`. Neither quotes a version any more. Both send the reader to the registry, which
  is the only thing that cannot go stale, by naming the command that reads it.
  `troubleshooting.md` also stopped sending readers to `CLAUDE.md`, an internal file that does not
  ship in the tarball.

## [0.0.4] - 2026-07-30

### Added

- **The element registry is now generated from NEMA's PS3.6 DocBook, the normative publication**
  (`DICOM-UPSTREAM-EDITION-LAG`). `vendor/nema/part06/` pins `part06.xml` (PS3.6 **2026c**) by
  SHA-256, and `scripts/generate-dictionary.ts` applies it as a **per-field overlay** over the
  Innolitics mirror: for a tag both sources carry, PS3.6 wins on name, keyword, VR, VM and
  retirement; a tag PS3.6 carries and the mirror does not is added; a tag the mirror carries and
  PS3.6 does not is **kept**, because PS3.6 retires elements rather than deleting them, so an absence
  is far more likely to be a parse gap here than a withdrawal there and dropping the entry would turn
  a decoded element into an unknown one (that set is empty today, and the generator prints its size).
  The overlay is scoped to the four registry tables (6-1, 7-1, 8-1, 9-1). UIDs stay on the
  `sops.json` + curated path deliberately: `uids.ts` carries the four short forms every DICOM toolkit
  uses instead of PS3.6's "...: Default Transfer Syntax for ..." clauses, and retirement as a
  structured `retired` boolean rather than a trailing " (Retired)" glued into the name, and an
  overlay would undo both. PS3.15 Annex E is a different part and a different generator, unchanged.
  This is the durable fix for the edition lag recorded in `vendor/innolitics/README.md`: the mirror's
  pin is exactly current against its own upstream, but that upstream last refreshed its data on
  2024-04-18, so the tables sat on PS3.6 2024b against a current 2026c and no re-pinning discipline
  could have moved them. The registry no longer comes from a source whose regeneration cadence is not
  ours.
  **The pin is a precondition, not a comment.** The generator recomputes the SHA-256 of the file it
  reads and refuses to generate on a mismatch, reads the edition from the document's own
  `<subtitle>` rather than asserting it, and fails loudly rather than emitting a thinner dictionary
  on a row that is not six cells, a malformed `(gggg,eeee)` tag cell, a non-identifier keyword, an
  unrecognized VR token, or a total under 5,000 registry rows. Two traps in the DocBook are handled
  explicitly and covered by tests: the keyword column carries **13,470 ZERO WIDTH SPACE** line-break
  hints in 2026c, one of which left in produces a keyword that looks right and never matches; and the
  sixth column carries `DICOS` and `DICONDE` dictionary markers alongside `RET (edition)`, so reading
  it as a boolean would retire **391** live tags. Only a leading `RET` retires. Row accounting is
  the part that had to be got right rather than merely asserted: every `<tr>` in a registry table
  must resolve to a matched body row or a header row, which covers unrecognized row markup, a second
  `<tbody>`, and a row outside any `<tbody>` in one check. Counting row opens inside the already
  truncated first-`<tbody>` slice, as an earlier draft did, structurally cannot see the rows it
  dropped: splitting Table 6-1 in two made that version read 207 rows instead of 5,309. Cell text
  is likewise stripped of markup to a fixpoint and then refused if any `<` or `>` survives, rather
  than stripped in a single pass that can leave a residue which reassembles into another tag.
  Every run prints the overlay it applied (shared / added / mirror-only, and the fields overridden
  broken out by field, **with every VR override listed individually**), so a future re-pin of either
  source shows what moved instead of a 5,000-line diff. There is deliberately **no staleness clock**:
  a date-based gate would fire the day it was written, demand an action nobody can take on demand
  (NEMA publishes when NEMA publishes), red unrelated pull requests, and train people to bump a date
  instead of re-deriving anything. "Has NEMA published a new edition" is one command against
  _content_, documented in `vendor/nema/README.md`. What is gated in CI is unchanged and offline:
  the committed dictionary must be byte-for-byte what the pinned inputs produce.

### Changed

- **The PS3.5 repeating-group bound is now derived from pinned normative documents rather than
  transcribed (`DICOM-PS35-NOT-VENDORED`). No runtime impact: the emitted bound is identical and no
  public API moves.** `deidentify()` expands PS3.15 Table E.1-1's `(50xx,xxxx)`, `(60xx,3000)` and
  `(60xx,4000)` rows over the concrete groups PS3.5 section 7.6 admits, sixteen even groups per mask
  (`5000`-`501E`, `6000`-`601E`), not 256. That bound is a safety limit in **both** directions, and it
  was the last input here that lived as a **quotation in a source file** while PS3.6 and PS3.15 were
  SHA-pinned and re-hashed before use, so the generator's guard could catch a new mask _prefix_ but
  never a changed _bound_.
  `vendor/nema/part05/` pins `part05.xml` (PS3.5 **2026c**) and `vendor/nema/part05-2004/` pins
  `04_05pu.pdf`, both re-hashed as a precondition, and `scripts/generate-repeating-groups.ts` emits
  `src/dictionary/generated/repeating-groups.ts`, which `src/dictionary/repeating-groups.ts`
  re-exports. **Two documents, because the bound is split across two editions:** the current one
  states the overlay bound normatively and excludes the odd `6001`-`601F`, but says nothing about the
  curve bound, having retired curve encoding and delegated it to PS3.5-2004 by URL in section 7.6's
  own Note. So the 2004 PDF is the authority the edition in force names, not a convenience copy. The
  generator **proves that delegation** (section 7.6 must link exactly the vendored URL) instead of
  assuming it, and because both editions state the overlay bound it **requires them to agree**.
  `gen:repeating-groups` runs first in `gen:all`, since the Annex E generator expands family rows
  through this bound.
  **The values did not change; their falsifiability did.** Moving the overlay bound in either
  vendored edition reds the cross-check, moving the curve bound in the 2004 edition moves the emitted
  artifact (caught by the byte-identical regen gate), and removing the delegation link stops the 2004
  document being used at all. Each was confirmed non-vacuous by disabling the guard and watching the
  test fail. Reading a 2004 PDF needs a PDF reader; the one in that generator is deliberately minimal
  (Node `zlib` only, one sentence recovered, matched against a precise expected shape) and is not to
  be grown into a general parser. There is no staleness clock, for the same reasons as PS3.6 and
  PS3.15.
- **Recorded what the vendor pin is actually current against (`DICOM-DICT-CURRENCY`).**
  `vendor/innolitics/README.md` gains a measured Currency section and drops the "re-pin monthly"
  policy, which nothing ran and which measured the wrong thing. The pin is exactly current against
  upstream: `git ls-remote` resolves `master` to the pinned SHA and all four vendored files are
  byte-identical to upstream at it. Upstream itself is the stale link, having last changed
  `attributes.json` on 2024-04-18 ("Update standard to rev2024b"), so the tag tables are grounded in
  PS3.6 2024b while the current edition is PS3.6 2026c. The drift is now measured rather than
  assumed, against the NEMA DocBook source for 2026c, and every non-additive difference is named in
  that file. Figures on `86ab6c1` (`origin/main` at measurement time; this slice does not touch
  `tags.ts` or `keywords.ts`): all **5,129** committed tags are shared with PS3.6 2026c, and across
  them there are **zero VR differences**, zero name differences and zero VM differences, with 2
  keyword and 2 retirement-status differences. **Every tag this dictionary carries is still in
  PS3.6 2026c**; the drift is otherwise purely additive, 180 tags the standard has gained. VR is
  what turns bytes into a value, so zero VR drift is the result that matters for reading a real
  study. Nothing in the dictionary is hand-edited to close the gap: it is generated, and the
  remaining differences are recorded for the next re-pin. One method note lives with the
  measurement, because getting it wrong is easy and was got wrong on the first run: DICOM tag values
  are hexadecimal and their case is not semantic, so tag keys must be compared case-insensitively.
  PS3.6 prints them uniformly uppercase and `tags.ts` agrees on 1,540 of its 5,129 keys, but
  `tags.ts` lowercases the 8 repeating-group keys whose trailing digits are hex letters and no
  others, so a verbatim comparison mis-classifies exactly those 8.

### Fixed

- **`deidentify()` never removed and never reported the repeating-group attributes PS3.15 marks `X`**
  (`DICOM-REPEATING-GROUP-DEID-GAP`). Table E.1-1 states three of its rows as a group mask rather
  than a single tag: `(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay
  Comments, all three marked **X** (remove). The matcher keyed attributes by exact tag, which cannot
  express a mask, so all three rows were unreachable; `deidentify()` reads "not in the table" as
  "not listed, keep", so a file carrying `(6000,4000)` free text came back with a **clean report and
  the text still in it**. Overlay comments are a classic burned-in-identifier carrier, and
  `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` gives no coverage here: it keys on `(7FE0,0010)` +
  `(0028,0301)`, which describe the image, not the overlay planes. This shipped at `0.0.3`, and
  `deid`'s `/dicom` adapter delegates here, so it had the same hole.
  The three rows are now generated from the pinned PS3.15 DocBook as pattern rules and consulted on
  an exact-tag miss. A matched element is **removed and reported**: the report entry carries the
  concrete tag, the family's attribute name, and a new `DeidentifiedAttribute.repeatingGroup` field
  naming the mask that matched, so an audit distinguishes a mask hit from a single-tag hit. The
  `CleanGraphics` column is honoured on these rows exactly as the table states it. **The exact-tag
  table wins** over a mask that would also cover the tag, as the more specific statement the standard
  makes about it; 2026c publishes no such overlap and the generator counts and prints it every run.
  **The mask covers the groups PS3.5 bounds it to, not any four hex digits.** PS3.5 §7.6: repeating
  groups "shall only be allowed in the even numbered Groups 6000-601E", and PS3.5-2004 §7.6, which
  the current edition's note delegates to for curves, states "even Groups (5000-501E,eeee)". Sixteen
  groups per mask, not 256, and the same section says of the odd ones that there is "no implication
  of repeating semantics". Both bounds are load-bearing in opposite directions: a hex wildcard would
  remove attributes the standard never marked (data loss on a call asked to be conservative), and an
  exact tag matched nothing. Odd groups in the overlay range are private and still go through the
  private-attribute path.
  **The generator now refuses a masked row on a prefix PS3.5 does not define as a repeating group**,
  rather than printing it and carrying on, which is what let these three rows go missing. Proven by
  mutation rather than asserted: against a Table E.1-1 carrying an injected `(7Fxx,0010)` family row
  the pre-remedy generator exits 0 and drops it, the post-remedy one exits 1 and names the prefix. A
  second mutation moves the Overlay Comments Basic Profile code `X` -> `K` and asserts the emitted
  rule moves with it, so the action codes are read from the document rather than assumed. Every run
  prints the rules emitted, the concrete groups each covers, the private family row it does not
  emit, and the shadowing count.
- **`RetainLongitudinalTemporal` now documents which E.3.6 sub-option a caller actually gets.**
  Behaviour is unchanged: PS3.15 §E.3.6 is two options and this package exposes one name carrying the
  **full-dates** column, the less protective branch. It is `K` on all **169** rows where
  modified-dates says `C`. The option's JSDoc and `docs-content/troubleshooting.md` now say so, and
  say that date shifting is not performed at this layer. Splitting the option is a public-surface
  change and is deliberately not made here.
- **`deidentify()` retained 35 patient-identifying attributes and reported nothing**
  (`DICOM-ANNEX-E-DEID-LAG`). The PS3.15 Annex E action table came from a third-party mirror alone,
  pinned at a snapshot whose Table E.1-1 data is 2024b-era. Current PS3.15 publishes 652 concrete
  attributes; that snapshot carried 617. Because `annexE()` returns `undefined` for a tag it does not
  carry and `deidentify()` reads `undefined` as "not listed, keep", every missing attribute came
  through the call verbatim, and the `DeidentifyReport`, whose whole job is to say what was done,
  said nothing about them. The caller's only signal was a clean return. This shipped at `0.0.3`.
  **32 of the 35 are marked X** (remove) by the standard; the other three are `(0040,B020)` Waveform
  Annotation Sequence (`X/D`), `(0070,0006)` Unformatted Text Value (`D`), and `(300A,0054)` Table Top
  Position Alignment UID (`U`). The removals include `(0010,0011)` through `(0010,0016)`,
  the person-names-to-use and pronoun block, of which `(0010,0012)` **Name to Use is a patient's
  preferred name and survived verbatim**; `(0010,0041)` through `(0010,0047)`, the gender-identity
  and sex-parameters-for-clinical-use attributes; `(0010,2161)` `EthnicGroupCodeSequence` and
  `(0010,2162)` `EthnicGroups`, the two attributes that replaced the retired `(0010,2160)`
  `EthnicGroup`; the four `(0008,130x)` diagnosis code sequences; and the waveform, montage,
  acquisition-context and display-URI attributes at `(003A,xxxx)`, `(0040,Axxx)`, `(0040,Bxxx)` and
  `(0040,E012)`. `(0032,1033)` `RequestingService` also gains the `CleanDescriptors: C` column the
  mirror had dropped.
  The fix is the same authority rule the data dictionary already uses, pointed at PS3.15.
  `vendor/nema/part15/` pins `part15.xml` (PS3.15 **2026c**) by SHA-256, and
  `scripts/generate-annex-e.ts` applies Table E.1-1 as a **per-field overlay** over the mirror: for a
  tag both sources carry, PS3.15 wins on attribute name, Basic Profile action code, and all nine
  metadata-affecting option columns; a tag PS3.15 carries and the mirror does not is added; a tag the
  mirror carries and PS3.15 does not is **kept**, because the standard retires rather than deletes,
  so an absence is far more likely to be a parse gap here than a withdrawal there and dropping the
  entry would turn an attribute the de-identifier acts on into one it silently keeps. That set is
  empty today, and its size prints on every run so the assumption stays observable. Nothing is
  hand-corrected: every value is derived from the fetched normative bytes and reproduced by every
  regen. No Basic Profile code changed for a tag both sources carried, which is the reassuring half
  of the finding: the mirror was not wrong about what it had, only silent about what it lacked.
  **The pin is a precondition, not a comment.** The generator recomputes the SHA-256 of the file it
  reads and refuses to generate on a mismatch, reads the edition from the document's own
  `<subtitle>` rather than asserting it, and fails loudly rather than emitting a thinner table on a
  header row whose 15 column labels are not where the generator's indices expect them, a body row that
  is not 15 cells, a tag cell it does not recognize, an action code outside Table E.1-1a in any
  non-empty action column, an empty Basic Profile cell, a `<tr>` that resolves to neither a matched
  body row nor a header row, or a total under 600 concrete rows. The header check is the one that
  catches a column **reorder**, which a cell count cannot see and which would read one option's action
  code as another's. Every run prints the overlay
  it applied, **with every action-code override listed individually**, because a changed action code
  is the one difference that decides whether an identifier survives.
  Two exclusions are deliberate and now **printed on every run** instead of being assumed. Four rows
  of Table E.1-1 state a family rather than a single tag (`(50xx,xxxx)` Curve Data, `(60xx,3000)`
  Overlay Data, `(60xx,4000)` Overlay Comments, and `(gggg,eeee) where gggg is odd` Private
  Attributes); an exact-tag map cannot key them, private attributes are removed through their own
  path, and the three repeating-group rows remain a stated gap. And PS3.15's E.3.6 is two options,
  full dates and modified dates, against this package's single `RetainLongitudinalTemporal`, which
  carries the full-dates column; the two columns diverge on **169** of the 652 rows in 2026c, and
  that count now prints rather than living in a comment that guessed "usually not".
  There is deliberately **no staleness clock**, for the same reasons as PS3.6: a date gate fires the
  day it is written, demands an action nobody can take on demand, and reds unrelated pull requests.
  What CI gates is unchanged and offline: the committed table must be byte-for-byte what the pinned
  inputs produce.
- **Three defects in the shipped data dictionary, all resolved from normative bytes**
  (`DICOM-UPSTREAM-EDITION-LAG`). None is hand-corrected; each is what PS3.6 2026c prints, and each
  is reproduced by every regen.
  - **`(0010,2160)` `EthnicGroup` was marked current although PS3.6 retired it in 2025a**, and its
    replacements were absent entirely. It is now `retired: true`, and `(0010,2161)`
    `EthnicGroupCodeSequence` (`SQ`, VM 1) and `(0010,2162)` `EthnicGroups` (`UC`, VM 1-n) are
    present. This is a real demographic-attribute change: an application reading only `EthnicGroup`
    silently misses what current instances actually carry. Retired does not mean removed, so the
    keyword still resolves and an older study still reads; the caller is told both what the tag is
    and that it is no longer current.
  - **`(3004,0012)` `DoseValue` was marked retired although PS3.6 defines it.** The `RET (2022d)`
    marker belongs to the preceding row, `(3004,0010)` `RTDoseROISequence`, which remains retired.
    `DoseValue` is now `retired: false`. A dose attribute wrongly flagged retired is the dangerous
    direction of that error: it is the one that talks a caller out of reading a real RT dose.
  - **`(003A,0320)` and `(003A,0325)` carried truncated keywords**, `SummarizedFilterLookupTable` and
    `AnalogFilterType`, so `byKeyword` missed on the spelling PS3.6 publishes. They are now
    `SummarizedFilterLookupTableSequence` and `AnalogFilterTypeCodeSequence`. The truncated forms are
    **gone rather than kept as aliases**: they were never PS3.6 keywords, and carrying them would
    preserve the defect under a nicer name.
  - Alongside these, **180 tags PS3.6 has gained are now known**, so `Dictionary.lookup` names them
    and Implicit VR parsing resolves their VR from the dictionary instead of falling back to `UN`.
    The registry goes from **5,129 to 5,309** tags and `byKeyword` from **5,035 to 5,214** keywords.
    Zero VR, name and VM differences existed on the 5,129 shared tags and zero tags were dropped, so
    **no previously-decoded element decodes differently**; the change is corrections plus additions.

- **174 SOP Class UID names in `UIDS` were wrong (`DICOM-DICT-CURRENCY`).** The dictionary generator
  appended `" Storage"` to every name it took from the vendor `sops.json`, but that field is already
  the full PS3.6 Table A-1 UID Name. The result was a doubled suffix on the 164 names that already
  ended in "Storage", so `UIDS["1.2.840.10008.5.1.4.1.1.2"].name` read **"CT Image Storage Storage"**,
  and an equally wrong tail on 10 of the other 11 ("Digital X-Ray Image Storage - For Presentation
  Storage"). Every one shipped in `0.0.1` through `0.0.3`. The suffix is gone and the names now come
  through verbatim.
  The rule was wrong for all 175 entries it touched but landed on the right string for exactly one,
  so removing it needed a compensating correction rather than a second blanket rule:
  `1.2.840.10008.5.1.4.1.1.79.1` is the single UID whose vendor name genuinely lacks the suffix, and
  it is now pinned in the generator's curated table to the "Macular Grid Thickness and Volume Report
  Storage" that PS3.6 2026c Table A-1 gives it.
  One further name is corrected: `1.2.840.10008.1.2.6.1`, the retired RFC 2557 transfer syntax, read
  "RFC 2557 MIME Encapsulation" where PS3.6 prints "RFC 2557 MIME encapsulation".
  Measured against PS3.6 2026c on the branch head: of the **261** UIDs shared with Table A-1,
  **240 match the `UID Name` column byte for byte**; a further **17** differ only in that Table A-1
  writes retirement into the name as a trailing " (Retired)" where this dictionary carries a
  structured `retired` boolean, which gives **257** when those are read as matches and **zero**
  retirement-flag disagreements; the remaining **4** are the deliberate transfer-syntax short forms
  tabulated in `vendor/innolitics/README.md`; **0** are unexplained. All **7** well-known frames of
  reference match Table A-2 byte for byte. `uids.ts` changes on 175 lines in total.
  Name only: no UID value, `type`, or `retired` flag changed. Transfer-syntax dispatch keys off the
  UID **value**, never the name, so no parse or de-identification behavior changes. The one place a
  name reaches a caller at runtime is the human-readable `snippet` on the fatal
  `UNSUPPORTED_TRANSFER_SYNTAX` error, which is improved by the correction rather than altered in
  meaning.
- **The byte-identical regen gate could go green while generating nothing (`DICOM-DICT-CURRENCY`).**
  Two ways, both fixed by making the gate delete `src/dictionary/generated/` (except the hand-written
  `README.md`) before running `pnpm gen:all`, so it measures what the generators produce instead of
  what happens to be on disk. A stale orphan, an artifact a generator used to emit and no longer
  does, was never rewritten and never diffed, so it passed indefinitely. And gutting `gen:all` to a
  no-op wrote nothing, left every committed artifact untouched, and produced an empty `git diff`:
  permanently green. `package.json` also joins the workflow's `paths` filters, without which that
  second case never triggered the gate at all. Both now red, proved by seeding each defect and
  watching the run fail. The delete is `-mindepth 1` rather than `-type f`, so a stale symlink or
  subdirectory cannot become an orphan the gate is blind to, and the step asserts that only
  `README.md` survives instead of printing an expectation nothing checks. `pnpm gen:clean` exposes
  the same delete for local use but is deliberately **not** chained into `gen:all`: the generators
  throw on malformed or missing vendor input, which is the normal state part-way through a re-pin,
  and a chained clean would leave the working tree empty and the build broken. The gate does its own
  delete rather than trusting the script under test.

## [0.0.3] - 2026-07-27

This release carries two version bumps' worth of change. `0.0.2` was bumped on the same day and
never published, so the four changesets it consumed reached npm here, in `0.0.3`, together with
the regen-gate repair below.

### Added

- **Em-dash brand gate in CI (`EMDASH-CONFORMANCE`).** The founder directive of 2026-07-24
  (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever.") bans `U+2014` outright across
  every cosyte surface and names commit messages explicitly, and the meta-repo's
  `documentation/conventions.md` has stated for weeks that the rule is CI-gated. It now actually is,
  here: `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) plus a dedicated
  `.github/workflows/no-emdash.yml` job that scans **both** halves the rule covers, the tracked files
  **and** the PR title, body, and commit messages. The workflow carries the non-default `edited`
  pull-request trigger, which is load-bearing: this repo squash-merges under
  `squash_merge_commit_title: COMMIT_OR_PR_TITLE` and `squash_merge_commit_message: COMMIT_MESSAGES`
  (read off the repo, not assumed), so the subject that lands on `main` is the PR title, or the lone
  commit's subject when the branch has exactly one, and the body is the branch commit messages.
  Without `edited` a title changed after the last push would never be re-checked. The PR body does
  **not** land; the gate scans it anyway, as deliberate over-strictness on a surface that costs
  nothing to cover. It is a separate workflow rather than a job in `ci.yml` because that trigger
  would otherwise re-run the whole Node 22 + 24 matrix on every typo fix, and because the shared
  `cosyte/.github` pipeline runs no arbitrary repo script.
  **This one did change content, unlike the earlier ports.** An ecosystem survey had measured
  markdown only (0 of 25 `.md` files) and read dicom as already clean. Measuring all 178 tracked
  files found six live em dashes in four non-markdown files, all removed here (see Changed, below).
  Measure every tracked file, because that is what the scan covers.
  The script is the **text-only** variant, taken from `ncpdp` (PR #34, `39212bb`) rather than from
  the older `knowledgebase` copy, so it carries `ncpdp`'s two fixes to the shared shape instead of
  inheriting the holes: a tracked file named `-` was read by `grep` as standard input (which `xargs`
  points at `/dev/null`) and so was never opened, and `-d skip` silently passed a tracked symlink to
  a directory. Both are re-proved here rather than taken on faith: with the `./` path prefix removed
  the gate prints OK and exits 0 over a live em dash in a file named `-`, and with `-d skip` restored
  it goes green over an unread symlink.
  It deliberately omits `grep -I`, and in this repo that is the most load-bearing flag choice in the
  file. `src/dataset/vr/charset.ts` holds a functional NUL byte inside `/[\x00 ]+$/u`, the regex that
  strips DICOM's own padding, so grep classifies it binary. It carries no em dash today and scans
  green, which is the whole answer to the belief that this port was blocked: the red would come from
  a match, never from the NUL. **If it ever gains one, the gate reds.** Measured with GNU grep 3.8:
  grep exits 0, writes nothing to stdout, and writes `binary file matches` to stderr, so the hit
  never reaches the hit list and the stderr capture fails the run instead. With `-I` added, the same
  edit goes green, which is why `-I` stays out. The failure message names that case explicitly rather
  than blaming an I/O error that did not happen.
  A gate that prints OK when it did not read its input is worse than no gate, so nine routes by which
  a dead or blind scan could still report green are each checked red, not assumed: a corrupt git
  index, an unreadable tracked file, a tracked file named `-q`, a C-quoted non-ASCII path, a
  mis-encoded text file, an empty tracked-file list, a tracked file named `-`, a tracked symlink to a
  directory, and the NUL-bearing source file gaining an em dash.
  Known limits are documented in the script header and inherited knowingly from the shared shape
  rather than patched in this copy alone: encoded-form matching is literal (so `&#x2014` without the
  semicolon, and lowercase `%e2%80%94`, pass), stderr capture binds to the scanning `grep` rather
  than to the filters ahead of it, an em dash encoded in a non-UTF-8 charset is not matched (a live
  possibility here, given `(0008,0005)` Specific Character Set fixtures), and the scan reads file
  **contents** only, so a tracked path that itself carries an em dash passes. Tooling only: no
  runtime, public-API, or parse-behavior change.
- **`docs-content/` now covers the full canonical Diátaxis spine** (`DOCS-CONTENT-P6`). Beyond the
  existing Overview (`intro`), the sidebar gains **Installation** and **Quickstart** (tutorials),
  five **Core Concepts** notes (the object model, the tolerance/warning model, the typed value
  layer, the safety-critical views, and the source-profile system), a **Guides** cookbook (four
  recipes: re-serialize, de-identify, read raw pixel data, triage warnings), and a
  **Troubleshooting & known limitations** reference. Every documented capability is grounded in the
  package's actually-shipped surface; the metadata-first boundary is stated explicitly, with the
  permanent non-goals named in Troubleshooting (**no pixel decode, no DIMSE networking, no
  DICOMweb**, no pixel-level de-identification).
- **Doc/code-agreement gate (`test/docs-content.test.ts`).** Every ` ```ts runnable ` snippet in
  `docs-content/` is extracted, compiled, and executed against the **built** package via
  `docSnippetSuite()` from `@cosyte/vitest-config/snippets`, with its inline `// =>` assertions
  checked, so a documented example can never silently drift from the code. All examples use
  synthetic, base64-encoded Part 10 objects (invented patient, fake UIDs); no real PHI, no `.dcm`
  file on disk.
- **Trademark notice (`TRADEMARKS.md`).** This package names third-party systems to describe what it
  interoperates with; the notice records that cosyte is not affiliated with, endorsed by, or
  sponsored by any of them, that every reference is descriptive, and that the built-in profiles are
  authored from public sources only. Added to `files` so it ships inside the published tarball, not
  just on GitHub. Documentation only: no runtime or API change.

### Changed

- **Removed the six em dashes the new gate found (`EMDASH-CONFORMANCE`).** Four tracked files, none
  of them markdown: `.github/CODEOWNERS` (2), `.github/workflows/release.yml` (2),
  `vendor/nema/SHA.txt` (1), and the npm `description` in `package.json` (1). The last is the only
  one visible outside the repo: the package description on npm and on the GitHub sidebar now reads
  "Developer-focused DICOM Part 10 parser + utility library for Node.js and TypeScript:
  metadata-first, vendor-quirky-tolerant, dual ESM/CJS." Each rewrite replaces the character with a
  period, colon, or comma, per the rule's own instruction; none re-encodes it, and no wording beyond
  the punctuation changed.
- **Bumped the `@cosyte/vitest-config` devDependency to `^0.0.2`** to pick up the `./snippets`
  export that ships the doc/code-agreement runner.
- **Corrected the element-access examples in `intro.md`.** `Dataset.get` / `has` take the
  8-character `(group,element)` **tag** form only. The prior snippets showed `get("PatientName")`,
  `get("(0010,0010)")`, and `get("StudyDate")`, all of which return `undefined`. They now use the
  tag form (and show resolving a keyword to its tag via `Dictionary.byKeyword`), matching the code.

- **All tests now live in a top-level `test/` mirroring `src/`.** `@cosyte/dicom` was the lone parser
  that co-located `*.test.ts` files beside their source; the 32 co-located suites were moved to
  `test/<path>/` preserving the `src/` sub-structure, bringing the repo in line with the
  `hl7`/`mllp`/`x12`/`ccda`/`ncpdp` archetype (`DICOM-TEST-RELOCATE`). Relative imports in the moved
  files were retargeted (`./foo.js` → `../../src/<path>/foo.js`). `vitest.config.ts` drops the
  `src/**/*.test.ts` include glob, so the config now matches the archetype and a stray co-located
  test is no longer silently collected alongside the `test/` suite. Test-only, no public-surface
  change: same 585 passing tests (+1 todo), coverage gates (still pointed at the `src/` source
  directories) unchanged and green.

### Fixed

- **`Dictionary Regen` is green again (`DICOM-DICT-REGEN`).** The byte-identical regen gate had been
  red since 2026-06-24: seven consecutive failing runs, four of them pushes to `main`, every one of
  them failing in its first real step. The last green run was 2026-05-04.
  `.github/workflows/dictionary-regen.yml` passed `version: 10` to `pnpm/action-setup@v6` while
  `package.json` already declares `packageManager: pnpm@10.0.0`, and v6 treats two sources of truth as
  a hard error: "Multiple versions of pnpm specified". The job died in about 13 seconds having never
  installed anything, never run `pnpm gen:all`, and never compared a single generated byte. Dropping
  the redundant `version:` input lets `packageManager` win, matching the fix `astm` already applied to
  its fuzz workflow (`44c3d88`).
  Two smaller repairs to the same file, both aimed at the gate actually asserting something rather
  than merely starting. The workflow now lists **itself** in its `paths` filters, so a change to the
  gate re-runs the gate; without that, the PR fixing a broken gate could not demonstrate the gate
  fixed. And the verify step now also fails on **untracked** files under `src/dictionary/generated/`:
  `git diff` reports modified tracked files only, so a generator that began emitting a brand-new
  artifact would have left it untracked and invisible to the check.
  The committed dictionary itself is **not** drifted. Regenerating from the pinned inputs
  (`vendor/innolitics/90571bc`) reproduces all four artifacts byte for byte: 5,129 tags, 5,035
  keywords, 268 UIDs, 617 Annex E entries, zero diff. Verified as a positive control rather than
  assumed: perturbing a VR in the vendor input made the gate red, and restoring it made the gate
  green, so the check reads its input. Nothing in the tag tables needed correcting, and nothing
  regenerated was committed.

- **Corrected the `private: true` claim in `.github/workflows/release.yml`.** A comment at the top of
  the release caller asserted that `@cosyte/dicom` is `private: true` and that `changeset publish` is
  therefore "a no-op until that flag is removed". `package.json` carries no `private` field, the repo
  is public, and the package ships on npm at `0.0.1`, so the comment described the release pipeline as
  inert when it is live. Documentation only, no behavior change, but a misleading note on a workflow
  that really does publish is worth more than a stale one elsewhere. (`0.0.1` was the published
  version on that date.)

- **Corrected stale publish-status language in `docs-content/` (`README-ORG-SWEEP`).**
  `installation.md` claimed the package was "not yet published to npm" and that the install command
  was only "the shape it will take at first publish"; `troubleshooting.md` listed a "Not yet
  published … not on npm; the first provenance publish is gated on the coordinated public launch"
  non-goal. `@cosyte/dicom` is published on npm at `0.0.1` and public. Both now state the truth
  (published, public, still pre-alpha on the `0.0.x`-until-first-alpha ladder), and the troubleshooting
  bullet becomes an honest pin-your-version pre-alpha caveat rather than a stale non-goal. (`0.0.1`
  was the published version on that date; `npm view @cosyte/dicom version` is the current one.)

## [0.0.1] - 2026-07-17

### Added

- **Lossless File Meta round-trip.** The parser now retains non-modeled
  `(0002,xxxx)` File Meta elements (e.g. `(0002,0017)`/`(0002,0018)`
  Sending/Receiving AE Title, `(0002,0100)` Private Information Creator UID,
  `(0002,0102)` Private Information) as raw on-wire bytes on the new
  `FileMeta.extraElements` view (each a `FileMetaRawElement` carrying the tag,
  its Explicit-VR-LE VR, and a defensively copied even-length value). The
  serializer merges these with the typed fields and emits the whole group in
  ascending tag order (PS3.5 §7.4) with a recomputed `(0002,0000)` group length
  (PS3.10 §7.1), so an exotic File Meta group now round-trips byte-for-byte,
  not just the typed fields. New exported type: `FileMetaRawElement`. This
  resolves the Phase 5 serializer known-limitation ("only the typed `FileMeta`
  fields round-trip").
- **Documentation completeness (Phase 8).** Rewrote `README.md` into a full developer guide: quickstart,
  feature tour, a "DICOM in 90 seconds" primer, the two access patterns, an 80/20 **cookbook** (index a
  folder, build routing keys, read pixel-interpretation metadata safely, de-identify, bridge to FHIR
  `ImagingStudy` / HL7 v2, round-trip serialize), the four-tier tolerance model, the warning/fatal code
  taxonomy, typed-error handling, and an explicit known-limitations / non-goals section. Every public
  export now carries a JSDoc `@example`. Extended the dual ESM/CJS smoke harnesses to exercise the full
  Phase 1–7 published surface so the documented entrypoints are guaranteed importable from both module
  systems. Also corrected an `intro.md` snippet that referenced a nonexistent `ds.pixelData` getter (the
  real accessor is `ds.get("PixelData")?.value`). Docs-only: no runtime API change.
- **Metadata-level de-identification (Phase 7).** New `deidentify(ds, options?)` applies the PS3.15
  Annex E **Basic Application Level Confidentiality Profile** plus the nine metadata-affecting Annex E
  Options (`RetainUIDs`, `RetainLongitudinalTemporal`, `RetainPatientCharacteristics`,
  `RetainDeviceIdentity`, `RetainInstitutionIdentity`, `RetainSafePrivate`, `CleanDescriptors`,
  `CleanStructuredContent`, `CleanGraphics`), driven by the generated Table E.1-1 action map. It is a
  **pure** function: the input `Dataset` is never mutated; it returns a fresh de-identified `Dataset`
  and a value-free `DeidentifyReport` (tags, keywords, resolved action codes, the UID map, warnings).
  Each attribute's action (`D` dummy, `Z` zero-length, `X` remove, `K` keep, `C` clean, `U` consistent
  UID) is resolved from the Basic Profile, overridden by any active Option; conditional codes (`Z/D`,
  `X/Z`, `X/D`, `X/Z/D`, `X/Z/U*`, `C/X`) collapse to their most-protective **leftmost** branch (the
  tool does no IOD Type-1 conformance analysis, so it fails safe toward _more_ removal). `U`-coded UIDs
  are remapped to deterministic, content-derived `2.25` replacements that stay referentially consistent
  across files (`makeUidRemapper`, default root `DEFAULT_UID_ROOT`). Kept sequences are recursively
  de-identified and **re-encoded** so nested PHI is removed from the serialized bytes, not just the
  object model. Private attributes are removed by default; `RetainSafePrivate` + a `Profile` keeps only
  the creator-recognized safe private elements. `(0012,0062)` Patient Identity Removed = `YES` and
  `(0012,0063)` De-identification Method are written automatically. Pixel-level cleaning is out of scope
  (deferred to `@cosyte/dicom-pixel`): when Pixel Data is present and not affirmatively marked free of
  burned-in text, a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning is raised rather than silently
  passing identifying pixels. New public exports: `deidentify`, `makeUidRemapper`, `DEFAULT_UID_ROOT`,
  `DEIDENTIFY_OPTIONS`, `DEIDENTIFY_ERROR_CODES`, `DeidentifyError`, and the types `UidRemapper`,
  `AppliedAction`, `DeidentifiedAttribute`, `DeidentifyErrorCode`, `DeidentifyOption`,
  `DeidentifyOptions`, `DeidentifyReport`, `DeidentifyResult`. The reserved
  `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning code is now actively emitted (no change to the
  `WARNING_CODES` registry surface).
- **Source/vendor profile system (Phase 6).** New `defineProfile()` factory builds an immutable,
  composable `Profile` that a parse opts into via `parseDicom(buf, { profile })`. A profile bundles
  three things that only ever _tighten or annotate_ a parse, never loosen it past the lenient default:
  `escalate` (Tier-2 warning codes promoted to a thrown `DicomParseError`), `suppress` (codes silenced
  as a documented benign quirk of the source), and `privateTags` (a private-creator-keyed overlay that
  resolves the Implicit VR of vendor private data elements). Private resolution is keyed on the file's
  **live** private-creator string and the canonical `"GGGGxxLL"` key (PS3.5 §7.8.1), never a
  hard-coded block number, so the same vendor schema resolves regardless of which block it landed in.
  Profiles compose via `extends` (de-duplicated lineage, union of escalations/suppressions, child-wins
  dictionary merge) and expose a deterministic `describe()` summary. Five built-ins ship under the
  frozen `profiles` namespace: three vendor overlays (`ge`, `siemens`, `philips`, grounded in the
  public GDCM / dcm4che / dcm2niix private dictionaries) and two posture presets (`strict` escalates
  integrity-relevant warnings; `lenient` suppresses cosmetic, high-volume ones). A creator the active
  profile does not recognize degrades to generic `UN` plus the new `DICOM_PRIVATE_CREATOR_UNKNOWN`
  warning, never a wrong decode. Selecting a profile never changes a correct decode. New public
  exports: `defineProfile`, `profiles`, `ProfileDefinitionError`, and the types `Profile`,
  `PrivateTagDefinition`, `DefineProfileOptions`, `ProfilePrivateTags`; `ParseOptions` gains an
  optional `profile` field. The reserved `DICOM_PRIVATE_CREATOR_UNKNOWN` code is now actively emitted
  (no change to the `WARNING_CODES` registry surface).
- **Spec-clean Part 10 serializer (Phase 5).** New `serializeDicom(ds)` writes a `Dataset` back to a
  DICOM Part 10 `Buffer`, the conservative half of Postel's Law. Emits the 128-byte zero preamble +
  `DICM`, a File Meta group (always Explicit VR LE) with a computed `(0002,0000)` group length and
  conservative Type-1 defaults (File Meta Version `0x0001`, cosyte Implementation Class UID under the
  `2.25` UUID arc), then the dataset body in the dataset's own transfer syntax (**no transcode**)
  across all four v1 syntaxes (Implicit VR LE, Explicit VR LE/BE, Deflated Explicit VR LE). Scalar
  values are padded to even length per PS3.5 §6.2 (`0x00` for `UI`/byte-stream VRs, `0x20` for text),
  short vs long-form headers are chosen by VR per §7.1.2 (`SV`/`UV` long-form), retired `(gggg,0000)`
  group-length elements are omitted per §7.2, and sequence + encapsulated-pixel-data spans pass
  through byte-for-byte per §7.5 / §A.4. Pure function: the input `Dataset` is never mutated.
- **Serializer error taxonomy.** New `DicomSerializeError` with codes `MISSING_TRANSFER_SYNTAX`
  (no File Meta Transfer Syntax UID) and `UNSUPPORTED_TRANSFER_SYNTAX` (a UID outside the v1 set),
  separate from the parser's fatal codes and the value layer's `DicomValueError`. The message is
  built only from the code + the offending Transfer Syntax UID (structural facts), never a decoded
  value, so it is always safe to log. New public exports: `serializeDicom`, `DicomSerializeError`,
  `SERIALIZE_ERROR_CODES`, `SerializeErrorCode`.
- **Safety-critical domain helpers (Phase 4).** New `Dataset` accessors `patient` / `study` /
  `series` / `image` return typed, fail-safe views over the DICOM §4 safety-critical attributes
  (memoized on first access). `patient` surfaces the `{id, issuerOfId, issuerQualifiers}` identity
  tuple plus Other Patient IDs (so a caller never matches on a bare, non-unique `(0010,0020)`) and
  keeps `PN` structured; `study`/`series` surface the cross-system UIDs, accession number, modality
  and Frame of Reference UID. `image` surfaces the pixel-interpretation + geometry metadata a
  renderer needs, with the safety-critical omissions intact: `rescaleSlope` is **absent** (not `1`)
  when the tag is absent, `signed` is absent (never guessed) unless `(0028,0103)` was present,
  `photometricInterpretation` is never defaulted to `MONOCHROME2`, and the three pixel-spacing tags
  (`(0028,0030)` / `(0018,1164)` / `(0018,2010)`) are distinct, never aliased.
- **Enhanced multi-frame functional groups.** `image.frame(i)` resolves the per-frame macros
  Per-Frame-else-Shared (PS3.3 §C.7.6.16): Pixel Measures, Plane Position, Plane Orientation, Pixel
  Value Transformation, Frame VOI LUT. `image.isEnhancedMultiFrame` flags such objects.
- **Value-layer error taxonomy.** New `DicomValueError` (codes `FRAME_INDEX_OUT_OF_RANGE`,
  `MISSING_REQUIRED_FUNCTIONAL_GROUP`), separate from the parser's four fatal codes. The helpers are
  otherwise fail-safe (typed-absent for missing data) and throw only for a structural contract
  violation; the error message carries only structural facts (indices, tag/macro names), never a
  decoded PHI value.
- **Coded terminology.** `readCode` reads the `Code Value`/`Coding Scheme Designator`/`Code Meaning`
  triplet and resolves the canonical scheme OID via `codingSchemeOid` / `CODING_SCHEME_OIDS` for the
  four standard designators (`DCM`/`SCT`/`UCUM`/`LN`); legacy SNOMED designators
  (`SRT`/`SNM3`/`99SDM`) deliberately do **not** resolve to `SCT` (CP-730). Real World Value Mappings
  bind slope/intercept atomically to their measurement-units code.
- Public types: `PatientView`, `OtherPatientId`, `StudyView`, `SeriesView`, `ImageView`,
  `CodedConcept`, `RealWorldValueMap`, `FrameFunctionalGroups`, `ValueErrorCode`, plus
  `VALUE_ERROR_CODES` and the `readCode` / `codingSchemeOid` / `CODING_SCHEME_OIDS` helpers.
- **VR value decode + dataset navigation (Phase 3).** `Element.value` now lazily decodes (and
  memoizes) an element's raw bytes into a typed, discriminated `DicomValue` covering all 34 VRs:
  numbers (`US/UL/SS/SL/FL/FD`), 64-bit `bigint`s (`SV/UV`), attribute tags (`AT`), person names
  (`PN` → 3-group / 5-component), strings, free text, numeric strings (`DS/IS` → `number | null`,
  never `NaN`→0), temporal values (`DA/TM/DT`), sequences (`SQ` → threaded items), and raw `binary`
  for the bulk VRs. Decode is fail-safe (never throws, never coerces a malformed value to a
  plausible-but-wrong one) and surfaces per-value `warnings` with stable codes + byte offsets.
- String decode honors `(0008,0005)` Specific Character Set, threaded through the parser per
  dataset/SQ-item scope: UTF-8 (`ISO_IR 192`), the ISO-8859 single-byte family, and ISO-2022
  multibyte, with three term-list corrections vs PS3.3 §C.12.1.1.2 (no `ISO_IR 14`; `IR 87/159` are
  code-extension-only; `ISO_IR 203` Latin-9 is included). An unknown term emits
  `DICOM_UNSUPPORTED_CHARSET` and falls back to a best-effort decode.
- `Dataset`/`Item` navigation API: `get` / `has` / `elements` / `getAll`, tag lookup
  case-insensitive.
- Public surface: `decodeElementValue`, `parseSpecificCharacterSet`, `isKnownCharsetTerm`,
  `resolveDecoderLabel`, `decodeText`, `parsePersonName`, `parseDate`, `parseTime`, `parseDateTime`,
  and the `DicomValue` / `PersonName` / `DicomDate` / `DicomTime` / `DicomDateTime` types.
- Initial repo scaffold (Phase 1).
- Unit coverage for the PS3.15 Annex E lookup helper (`annexE`), enabling the per-directory
  coverage gate on `src/dictionary/`.
- Adopted the shared `@cosyte/test-utils` conformance kit (first parser to do so) and added a
  `fast-check` property + fuzz test layer under `test/property/`: synthetic-only generators
  (`_arbitraries.ts`) plus invariant suites for round-trip fidelity, lenient-mode robustness,
  parsed-model immutability, warning/fatal-code stability (snapshot), and a byte-parser fuzz sweep
  that feeds arbitrary buffers + random truncations and asserts the parser only ever throws a
  sanctioned Tier-3 `DicomParseError`, never an unexpected error, hang, or OOM. No public API
  change. (devDeps: `@cosyte/test-utils@^0.0.1`, `fast-check@3.23.2`.)

### Changed

- Migrated onto the shared cosyte engineering standard (Phase E): tooling now flows from the
  published `@cosyte/*` config packages (`@cosyte/tsup-config`, `@cosyte/vitest-config`,
  ESLint 10 via `@cosyte/eslint-config`) instead of repo-local copies; devDependencies pinned to
  the canonical exact versions; `attw` build/publish gate added; the per-directory coverage gate is
  now enabled (transient sub-90 floors with TODOs while the test layer fills in).
- CI/release workflows reduced to thin callers of the reusable `cosyte/.github` pipelines
  (`ci.yml` runs the shared PHI scan; `release.yml` targets `@cosyte/dicom`). The repo-specific
  byte-identical dictionary-regen workflow is kept and bumped to Node 22.

### Fixed

- **`private: true` removed: `@cosyte/dicom` can publish.** The flag dated to the very first
  scaffold commit and was never explained; `changeset publish` silently skips a private package, so
  this repo was the one parser that could not reach npm even once its pipeline worked. It also
  contradicted the `publishConfig: { access: "public" }` in the same file. Removed as part of the
  coordinated public launch (`PUB-FLIP`).

- **The release can actually bump the version.** `package.json` had no `version` script, so the
  shared pipeline's `pnpm run version` failed with `Command "version" not found` and the release
  aborted before opening a "Version Packages" PR. Adds `scripts/sync-version.mjs` (the `hl7`
  reference, retargeted at `src/version.ts`) and the `version` script that runs it after
  `changeset version`, so the bump and the `VERSION` constant land in the same commit.
- **`VERSION` is no longer typed as a string literal.** It was declared `export const VERSION =
"0.0.0"`, giving it the literal type `"0.0.0"`, so the exported type would change on every
  release, making each version bump a breaking type change. Now annotated `: string`, matching the
  `hl7` reference. Type-only; the runtime value is unchanged. Done now because the package is
  unpublished. After the first publish this would itself be a breaking change.

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own, so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only: no runtime or API change.

### Security

- **Dev-dependency advisory remediation (no runtime impact: the published
  artifact is unchanged).** Added scoped `pnpm.overrides` pinning two
  transitive **dev/build-time** packages to their patched releases: `esbuild`
  (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal, not
  reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Tests

- **Enhanced multi-frame coverage (DICOM-COV).** Closed the Per-Frame-else-Shared branch gaps left by
  the Phase 4 functional-group resolver (`functional-groups.ts`: ~53% → 100% branch): both optional
  macros (Pixel Value Transformation `(0028,9145)`, Frame VOI LUT `(0028,9132)`), Pixel Measures
  `spacingBetweenSlices`, shared-only resolution (no Per-Frame Functional Groups Sequence), the
  lenient inner-attribute-absence paths (a macro item present but its attributes omitted ⇒ typed-absent,
  never coerced), and all three `MISSING_REQUIRED_FUNCTIONAL_GROUP` throws (Pixel Measures / Plane
  Position / Plane Orientation). Synthetic fixtures only; no public-surface change. Per-directory
  coverage now sits genuinely ≥ 90 on every gated directory (global branches 93.2%).

### Known limitations

- **File Meta round-trip is over the modeled surface, not byte-exact.** Only the typed `FileMeta`
  fields round-trip; any other `(0002,xxxx)` element a source file carried (e.g. `(0002,0100)` Private
  Information Creator UID) is dropped at _parse_ time (the Phase 2 `FileMeta` view does not model it)
  and so cannot be re-emitted. The preamble is normalized to zeros and odd-length values are padded
  even. The output stays spec-clean but is not a byte-identical copy of a non-conformant input.
  **Superseded within this same release** by the lossless File Meta round-trip above, which landed
  after the serializer and before `0.0.1` was cut: as published, `0.0.1` preserves and re-emits non-modeled
  `(0002,xxxx)` elements. The entry is kept because it is what the serializer shipped with.

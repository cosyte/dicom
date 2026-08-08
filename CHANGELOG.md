# Changelog

## 0.0.17

### Patch Changes

- 8982a16: Fix the repo's PHI gate skipping a preamble-less DICOM object on disk (`DICOM-SCANTARGET-PREAMBLELESS`).

  `scripts/phi-scan.ts`'s `scanTarget` gated a `.dcm`, a `.bin` and any unknown extension on `isDicom`
  (the 128-byte preamble plus `DICM`) before handing the bytes to `scanDicom`. A preamble-less stream,
  whose File Meta group starts at byte 0, failed that gate and fell through to the text sweep, so the
  DICOM-aware scan never ran on one and the gate printed `OK - no hits` over it. The text sweep is not
  a narrower scan but a different one: it matches a person name only in `FAMILY^GIVEN` form, so a
  single-component `(0010,0010)` is invisible to it, and a `DT` value's date head is not a standalone
  eight-digit token either.

  The DICOM route now asks `fileMetaStart`, which knows both shapes and is what `scanDicom` and the
  doc-corpus route already used. **The text route is not an `else`.** Detection moved in one direction
  only, and that is deliberate: `scanDicom` stops at the first header it cannot read, including an
  undefined-length Sequence, which PS3.5 2026c §7.5.2 defines as one of two delimitations that decoders
  shall both support, and which §7.1's ascending tag order places ahead of `(0010,0010)` in a
  conformant file. So a recognized object is now swept by both routes rather than handed
  from one to the other, which makes the branch a strict superset of the old behaviour on every input:
  `isDicom` true is unchanged, a preamble-less object gains the DICOM sweep on top of the text sweep it
  already had, and an unrecognized file is unchanged. One value can now be reported twice, once under
  its tag and once as `(text)`.

  Still open, `PRE-EXISTING` and unchanged: a preamble-ful Part 10 object gets no text sweep behind
  `scanDicom`, so an early halt on one is silent; and a text extension is still dispatched by name, so
  a `.md` whose raw bytes are a DICOM object is not scanned as one.

  Gate-only: no runtime, API or parser behaviour changes, and no published surface moves.

- 1028317: Disclose an over-long `(0012,0063)` Value that `deidentify()` did not compose (`DICOM-LO-LENGTH-AND-SILENT-REPLACE`).

  PS3.5 2026c Table 6.2-1 caps an `LO` at "64 chars maximum", and that row describes a **Value**:
  `(0012,0063)` is `1-n`, so the bound falls on each value between `5CH` delimiters and never on the
  Value Field. Reading it the other way is the misreading that left `#74`'s hole, and a field of 619
  bytes made of ten Values of 61 is conformant. The text this library composes for itself has been
  inside the maximum on all 512 option subsets since `#75`. The two Values it does **not** compose can
  be over, and both were written through with `report.warnings` saying nothing about their length: a
  caller's `deidentificationMethod`, and a value the source file already carried and PS3.15 2026c
  E.1.1 obliges this to keep.

  **The likeliest writer of the second one is this library.** Every object any published release
  de-identified without a caller-supplied method carries a 76-character Value, and re-de-identifying
  one keeps it: measured flat at 138 bytes over four passes, Values of 76 and 61. The **retention** has
  been disclosed since `DICOM_DEIDENT_METHOD_PRIOR_RETAINED`; the **length** was disclosed by nothing,
  on that route or on the caller's. So "a sender's non-conformant `LO` is the sender's" does not apply
  to the common case, and the earlier changesets that described the retention are not corrected by
  this: they were about which bytes survive, not about how long they are.

  `report.warnings` now carries `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH` whenever the `(0012,0063)`
  this run writes carries a Value longer than 64 bytes. **It is a disclosure and not a bound: nothing
  is shortened, split or truncated**, because splitting or truncating either Value would invent a
  de-identification record nobody made, and keeping a prior record intact is what E.1.1's provenance
  carrier is for. The code is measured over the value actually written, so one check covers the caller
  route, the retained-prior route and both replacement fallbacks, and it is raised on **every** pass
  rather than only the first, which is what a re-de-identified object needs.

  **Widened by union, never by replacement.** No existing branch moved and no existing code stopped
  firing: `DICOM_DEIDENT_METHOD_NOT_ADDED`, `DICOM_DEIDENT_METHOD_NOT_LO` and
  `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` are unchanged on every shape, pinned by a matrix that strips
  the new code and compares against the base's answers, and a sweep of all 512 option subsets shows
  the new code raised **0** times on the text this library composes for itself.

  **The measurement is over BYTES and that is a deliberate over-approximation, disclosed rather than
  argued away.** No repertoire encodes a character in fewer than one byte, so a Value of 64 bytes or
  fewer can never hold more than 64 characters and this cannot miss a Value that is genuinely over.
  **The converse fails whenever a Value's bytes outnumber its counted characters.** PS3.5 2026c §6.2,
  in the paragraph above Table 6.2-1, is the rule: those lengths are "expressly specified in characters
  rather than bytes ... because the mapping from a character to the number of bytes used for that
  character's encoding may be dependent on the character set used", and "Escape Sequences used for
  Code Extension shall not be included in the count of characters". Measured rather than enumerated:
  40 characters of `ISO_IR 192` is 120 bytes, and `\ISO 2022 IR 100` with `ESC 2/13 4/1` plus 64
  single-byte characters is 67 bytes carrying 64 counted characters and parses with no warnings. Both
  raise the code, and both pins use files that really declare the repertoire rather than fixtures that
  assert bytes are characters. Read the code as "a Value in this attribute is over 64 bytes", which is
  what is measured, never as "the attribute is non-conformant".

  The message is the frozen registry string with nothing substituted: **no value, no length, no count
  of how many Values are over, and no origin.** 64 is a constant of the VR; the offending Value's own
  length is a measurement over document content, which is the number `DICOM-DIAGNOSTIC-PHI-RESIDUALS`
  bound out of six other messages, and which of the two sources a Value came from is not decidable
  when they are equal. **`position.byteOffset` locates the prior element and is `0` when there was
  none**: this is the first method code that can be raised on a Data Set carrying no `(0012,0063)` at
  all, so on the caller route the offset is a sentinel rather than a location, and both routes are
  pinned so the `0` reads as an absence. Emitted by `deidentify()` only, so it never reaches the
  parser's `{ strict: true }` escalation and cannot refuse a conformant file.

  Adding a warning code is a public-surface change and the `WARNING_CODES` snapshot moves with it.

  Still open and unchanged, a backlog line rather than a rider on this one: `(0012,0063)` records the
  **union** of the options ever applied rather than a per-run history, so a later pass with fewer
  options leaves no trace an earlier one had more. The direction is conservative (the union
  over-states retention, never understates it), and changing it would rewrite what every run writes
  and reopen the unbounded growth the fixed-point rule and the ceiling guard exist to stop.

- 4bc6930: Point the repo's PHI gate at the corpus it was named for (`PHI-SCAN-WALK-ROOT-SCOPE`).

  `scripts/phi-scan.ts` rooted its walk at `test/fixtures/`, and every file this package writes there
  is gitignored because the suite regenerates it on each run. So the fixture corpus contributed exactly
  zero files and an all-mode run opened thirteen: the README and the twelve pages under
  `docs-content/`. Against 226 tracked files at `8982a16`, 213 were outside the all-mode walk, 82 of
  them under `test/`; one of those 82 was still reachable by `--staged`, so the figure for neither
  route is 212 and 81.

  That mattered here more than the number suggests, because this package ships no committed `.dcm`
  files at all: every fixture it owns is built in a `.ts` source by `test/helpers/build-dicom.ts`, so
  the whole committed fixture corpus was in the 81 tracked files the walk root excluded. The root is
  now `test/`, which replaces `test/fixtures/` rather than joining it so the roots stay disjoint, and
  `--staged` covers the same three roots. Head opens 95 of 229 tracked files. All 81 newly opened files
  were hand-read before this landed and none carries patient-identifying content; the synthetic fixture
  names and dates the gate now sees are added to `scripts/phi-allow-list.txt` as exact entries, never
  as prefixes. That file is global and has no path scoping, so those entries are excused in every
  corpus the scanner opens and not only in the one that needed them: the two worth naming are
  `DATE:19800101` and `DATE:20240115`. Path scoping is an allow-list format change and is deliberately
  not made here.

  Enumerating buys the recognizer floor and nothing else, so the second half shipped with it.
  `scanEmbeddedObjects` decoded base64 DICOM objects only for a name in `TEXT_EXTENSIONS`. Measured on
  `8982a16` with one object and one name-bearing PatientName: found as `probe.md`, found as
  `probe.dcm`, and `OK - no hits` as `probe.ts`. The decode now runs on the non-`isDicom` branch too,
  in addition to the text sweep and never instead of it.

  Four shapes let a declared root go unopened while the gate printed clean, all measured on
  `8982a16` and all now refusals with exit 2, the code this script's own contract gives an invocation
  error: a missing root (exit 0), a dangling symlink at a root (exit 0, because `existsSync` follows
  the link and answers false so the walk returned before `readdirSync`), a symlink at a real directory
  (exit 0, followed and walked), and a regular file at a root (exit 0 at `test`, and an uncaught
  `ENOTDIR` exiting 1 at `test/fixtures`). Existence is not observation, so the emptied-root half is
  closed separately by reconciling the walked set against `git ls-files`: every tracked path under a
  declared root must be opened, gitignored or corpus-exempt, and anything else refuses. No scanned-file
  count is printed, deliberately: a count counts the roots that did exist.

  Still open and disclosed rather than claimed away: the reconciliation compares path sets, not the
  bytes git carries at those paths, so a working tree that mirrors the tracked names still exits 0 over
  decoy contents. A test pins that escape rather than a fix. Widening the root makes it narrower, not
  closed. Also unchanged: `src/`, `vendor/`, `scripts/` and the root files are still outside the
  declared scope, because a generated DICOM tag table produces hundreds of matches on tag numbers that
  satisfy the `YYYYMMDD` shape and a pinned standards document is full of real publication dates.
  Admitting them is a product call with its own false-positive surface.

  The one corpus exemption is the one that was already here, `test/fixtures/phi-scan/README.md`, which
  documents the deliberate violator values. It is now ONE LITERAL PATH rather than the old
  skip-any-`readme.md`-the-walk-meets rule, so widening the root did not widen it by a file, and it is
  printed on stdout every run. It stays on the `all` route alone: `--staged` has never applied it, and
  teaching it to would subtract a detection the base had on the route the pre-commit hook runs, so the
  two routes disagree about exactly that one file as they did on base, with `--staged` the stricter.
  No new exemption was added: the values the scanner's own tests must have it reject are assembled at
  runtime in `test/helpers/phi-scan-violators.ts`, so that file is scanned like any other.

  One error path is fixed rather than disclosed, because widening the walk root enlarged it: `main()`
  had no top-level catch, so an unexpected throw (a `readdirSync` `EACCES` on an unreadable
  subdirectory) exited 1, the code that means "PHI was found". It now exits 2 and says the scan did not
  complete. Also disclosed: the reconciliation is vacuous on an empty index, since a legitimately empty
  `git ls-files` answer is indistinguishable from nothing to check.

  Gate-only: no runtime, API or parser behaviour changes, and no published surface moves.

## 0.0.16

### Patch Changes

- ce2975a: Fold the `Known limitations` sidebar category into `Troubleshooting`, so the shipped
  `docs-content/sidebars.json` conforms to the documentation IA spine (`DOCS-STALE-BEHIND-IA040`)

  No source, no public API and no parse behaviour changes. `docs-content/limitations.md` is not
  renamed and not moved, and the page keeps its URL, so every existing link to it still resolves. One
  sentence of its prose changes, for the reason given under THE PAGE NO LONGER DESCRIBES ITS OWN
  POSITION below.

  WHAT SHIPS. The top level of `docs-content/sidebars.json` goes from

      intro, Installation, Quickstart, [Known limitations], Core Concepts, Guides, Troubleshooting

  to

      intro, Installation, Quickstart, Core Concepts, Guides, Troubleshooting[troubleshooting, limitations]

  `Known limitations` was never on the canonical spine, which is
  `[Overview, Installation, Quickstart, Core Concepts, Guides, API Reference, Troubleshooting]`.
  The spine's own definition of Troubleshooting is "common error symptoms plus how to debug, plus
  Known Limitations if the package surfaces them", so this is the label's canonical home rather than a
  workaround for the lint. The two docs now sit under one heading in the order a reader meets them:
  `troubleshooting` (what went wrong) then `limitations` (what will never work).

  WHY IT WAS URGENT. `docs.cosyte.com` builds the released corpus and lints each package's SHIPPED
  sidebar against that spine, in strict mode, where a non-canonical top-level label is a hard error.
  A finding inside an ARCHIVED release is downgraded to non-gating info, because immutable bytes have
  no remedy diff. The same finding against the CURRENT release gates, because the remedy is exactly
  this: cut the next release. So the label sat dormant through `v0.0.14` and became blocking the
  moment `v0.0.15` was published and became current. It was not a new defect, and it stopped the whole
  site rebuilding, not just this package's pages.

  WHICH MEANS THE FIX ONLY LANDS ON A RELEASE. `docs` reads `docs-content/` out of the release
  artifact (`docs-content.tar.gz`), never out of `main`, so this changeset is load-bearing rather than
  bookkeeping: without a new version the corrected sidebar never reaches the site.

  THE CATEGORY IS NOT FORCED OPEN. The deleted category carried `"collapsed": false`, and
  `Troubleshooting` deliberately keeps the Docusaurus default instead of inheriting it. That flag
  existed to keep a one-item category permanently expanded so `limitations` read like a top-level
  page, a need that disappears once the page lives inside a real two-item category. `Core Concepts`
  keeps its `"collapsed": false` because it is the five-part reading spine of the package, not a
  destination a reader navigates to on purpose.

  THE PAGE NO LONGER DESCRIBES ITS OWN POSITION. `limitations.md` opened by claiming the boundary
  "lives high in the navigation rather than at the end of a troubleshooting page", which this change
  makes false in the one place a reader can check it: the page is now the last item of the last
  category, immediately after the troubleshooting page. That sentence is rewritten to say what is
  actually load-bearing, that the boundary is a page of its own rather than a closing paragraph, and
  that the introduction and the cookbook link into it. Left alone it would have frozen into an
  immutable release artifact and been correctable only by cutting yet another release, which is the
  same failure this change exists to end.

  NO `API Reference` CATEGORY IS AUTHORED HERE, and none may be. The docs site injects it at the
  canonical position (immediately before Troubleshooting) from the package's generated API set;
  hand-authoring it is a separate hard error in the same lint.

## 0.0.15

### Patch Changes

- 9273a9d: Two Tier-3 fatal messages stop rendering the bytes left in the buffer, because in a Sequence Item
  that count is the Item's own declared length (`DICOM-DIAGNOSTIC-PHI-RESIDUALS`)

  The ninth instance of "a diagnostic about a PHI leak is itself a PHI surface", and the first whose
  shift is not a constant.

  WHAT SHIPS. Through `0.0.14` `ELEMENT_LENGTH_EXCEEDS_BUFFER` and `FILE_META_GROUP_LENGTH_OVERRUNS`
  each filled an `{n}` slot from `buffer.length - cursor.position`. Both slots are gone, and so are the
  parameters: `elementLengthExceedsBuffer(buffer, offset)` and `fileMetaGroupLengthOverruns(buffer,
offset)` take two arguments now, so no call site can put either number back. `{n}` still exists in the
  registry and is filled by exactly two entries whose number nobody on the wire chose:
  `SQ_NESTING_DEPTH_EXCEEDED` renders this library's own `NESTING_DEPTH_LIMIT`, and
  `INFLATED_PAYLOAD_EXCEEDS_CAP` renders the cap the caller passed in. No parse moves, no file that
  threw stops throwing, `err.code` is unchanged everywhere and `err.byteOffset` still locates the
  element.

  BREAKING FOR STRING-MATCHERS: the two message texts change. A consumer matching on either string
  stops matching. Neither code changed.

  WHY A COUNT BOUNDED BY BYTES PRESENT IS STILL THE SENDER'S NUMBER. The old defence was that
  `buffer.length - cursor.position` cannot exceed the input, which bounds the number's MAGNITUDE and
  says nothing about its CONTENT. `parseSequence` parses a defined-length Item from a SLICE, so inside
  one the buffer IS that Item and `buffer.length` IS the Item's 32-bit Value (Item) Length off its own
  header. The message publishes `byteOffset` beside the count and `cursor.position` is that offset plus
  the header just read, so an addition returns the declared length. A raw 32-bit length field a sender
  wrote is already the class this registry refuses everywhere else, and shifting one by an amount the
  reader can compute does not change its class.

  MEASURED, WITH THE DECLARED LENGTH READ BACK OFF THE WIRE RATHER THAN ASSERTED AGAINST A LITERAL. A
  synthetic file declaring an Item Length of 21320: the message read 21312 with the over-declaring
  element first in the Item, 21288 behind one 24-byte element, and 21272 behind one 40-byte element.
  THE SHIFT IS `cursor.position`, SO IT IS VARIABLE, which is why the remedy is the factory signature
  rather than a filter: a filter would have to know the frame, and the factory cannot.

  WHAT THE DETECTOR CAN AND CANNOT SEE HERE, AND IT IS THE HALF THAT TRANSFERS. `#92` added a
  `length-less-item-header` arm to the re-encoding detector in
  `test/integration/fatal-diagnostic-surface.test.ts` that subtracts exactly 8, and said on the constant
  that it covers ONE offset. Pointed at this leak it behaves exactly as documented: it returns the 21312
  shape and reads CLEAN on 21288 and 21272, which are the same leak on the same fixture. Both results
  are pinned as rows, beside a DIRECT render of 21320 that the `length` arm does catch, so the clean
  results are the arms' limit rather than a payload carrying nothing. A ZERO FROM THIS DETECTOR IS A
  GAP, NOT A CLEARANCE. The arm is still not widened to a range, for the reason `#92` gave: a hunt with
  nothing to hunt has no non-vacuity control, and what clears the class is the signature.

  THE COST IS STATED RATHER THAN GLOSSED. `FILE_META_GROUP_LENGTH_OVERRUNS` is raised at the root and
  nowhere else, where `buffer.length` is the caller's own input and the count leaked nothing. It loses
  the number anyway. A bound that holds only because of where a function happens to be called from is
  not a bound, and the sibling that shares the expression is raised inside a slice, so leaving one slot
  open is exactly the shape `#88` measured relocating a leak onto a sibling rendering the identical
  fixture. Both diagnostics are correspondingly less informative: neither says how far the read got.

  NOT IN SCOPE, AND NAMED SO IT IS NOT READ AS CLOSED. `report.removedPrivateTags`,
  `report.unauditableSequences[].tag`, `uidMap`, `contextPath` and the two `byteLength` fields are model
  fields on a type whose own docs say it is not a value-free surface, not messages, and a bound empties
  them on every well-formed file. `DicomParseError.snippet` is still 16 raw source bytes and is still
  documented as PHI. `ds.warnings[].message` is still NOT unconditionally safe to log.

- 2cf2ab0: `DICOM_ITEM_CROSSES_SEQUENCE_END` stops printing how many bytes remained inside the sequence, because
  that count was the sequence's own declared length shifted by an amount the reader can compute
  (`DICOM-DIAGNOSTIC-PHI-RESIDUALS`)

  The eighth instance of "a diagnostic about a PHI leak is itself a PHI surface". Its defence and its
  pinning test were both green, and both were green BY FIXTURE, which is the more valuable half.

  WHAT SHIPS. Through `0.0.14` the message read "`{n2}` bytes remained inside the sequence", filled from
  `Math.max(0, endLimit - cursor.position)`. `endLimit` is `valueStart + explicitLength`, the enclosing
  SEQUENCE's declared Value Length read off its own header, and `cursor.position` is the crossing item's
  header start plus 8, so the rendered count IS that declared length less the bytes of the sequence
  already consumed. An addition the reader can compute reverses it: on the sequence's FIRST item the
  shift is just the 8-byte Item header (PS3.5 2026c section 7.1.1's 4-byte tag plus section 7.5.1's
  4-byte Item Length), and with one 24-byte item ahead of it the same fixture renders 20275 against the
  same declared 20307, a shift of 32. Both shapes are pinned; "less 8" as a universal was refused by a
  graded pass. `itemCrossesSequenceEnd` takes
  `(position, tag)` now; the Item's own declared length was already bound out of that signature, and
  this is the second number to go the same way. The tag slot still carries the constant `FFFEE000`, and
  `position.byteOffset` still locates the item. Which codes fire is unchanged and no parse moves.

  A RAW WIRE NUMBER SHIFTED BY A CONSTANT THE READER CAN COMPUTE IS THE RAW WIRE NUMBER. The registry's
  own rule allowed a number this parser "derived - a count it kept, an offset it counted, a remainder
  the buffer bounds". The third clause is deleted rather than reworded: the `endLimit < buffer.length`
  conjunct at the emit site bounds the rendered number's MAGNITUDE and says nothing about its CONTENT,
  and that reading is what admitted this leak for four releases.

  GREEN BY FIXTURE, TWICE, ON THE SAME PAYLOAD CLASS. The comment and the pinning row both rested on
  that conjunct, and the fixture behind them only ever fabricated the sequence length out of four
  PRINTABLE bytes. Every such window exceeds 538,976,288, so `endLimit` landed past the buffer and the
  conjunct refused - but a length that big is unreachable by construction, because the buffer has to
  hold that many bytes for the parse to get there. The reachable class has zero high-order bytes and
  therefore a SHORT decimal. A TEST THAT PASSES BECAUSE ITS FIXTURE CANNOT REACH THE FAILING CASE IS
  NOT EVIDENCE. The row is kept, because what it measures is true; what it was read as concluding is
  retracted.

  AND THE DETECTOR READ CLEAN ON IT, WHICH IS THE GAP THIS RELEASE ALSO CLOSES. Every arm of the
  re-encoding detector in `test/integration/fatal-diagnostic-surface.test.ts` hunted a rendering EQUAL
  to a typed read of a payload window, so a rendering SHIFTED by a constant was invisible to all of
  them even with the digit floor removed. Measured on the `"SO\0\0"` payload that file already carries:
  the shipped template returned no findings under the whole detector, while a DIRECT render of the same
  length returned the `length` hit, so the detector was working and the miss was structural. A
  `length-less-item-header` arm returns `20299 == "SO\0\0"`. THAT ARM COVERS ONE OFFSET AND IS NOT A
  GENERAL NET, which is stated on the constant rather than left to be discovered: it hunts the first-item
  shift of 8, so on the 32-byte shape above it would still have read clean. It is not widened to
  a range, for the same reason the missing 2-byte-as-`uint16` arm beside it is still named rather than
  armed: a hunt with nothing to hunt has no non-vacuity control, and what clears this class is the
  factory signature, not the arm. A GUARD WITH A FLOOR HAS NOT CLEARED ANYTHING BELOW THE FLOOR, AND A
  DETECTOR WITH NO OFFSET ARM HAS NOT CLEARED A SHIFTED RENDERING.

  THIS ONE REACHES `ds.warnings` ON A SURVIVING PARSE, unlike the three instances before it, which
  reached `onWarning` on a file the parse then refused or `report.warnings` on the de-identify channel.
  So it lands on the channel a consumer is most likely to log. Measured on a synthetic, name-bearing
  fixture whose planted letters are read back OFF THE WIRE rather than asserted against a literal:
  `"SO"` rendered 20299 of a declared 20307, `"ON"` 20039 of 20047, `"TH"` 18508 of 18516, and the two
  low bytes of each declared length are two letters of the planted surname.

  WHAT IT COSTS, STATED RATHER THAN MINIMISED. A consumer reading the message no longer learns how much
  of the sequence was left when the item over-ran it. Unlike the two `deidentify()` codes closed
  alongside it, this number has no model field, so nothing publishes it any more; the parsed sequence
  and `position.byteOffset` are what remain. The warning still says the file's two length fields
  disagree, which is the disclosure it exists for.

  THE EXCEPTION LIST STOPS BEING COPIED, AND NO COUNT OF THE COPIES IS QUOTED. "Which numeric slots are
  exempt from the signature bound" is stated where the strings are - the `WARNING_MESSAGES` docblock in
  `src/parser/warnings.ts` - and `README.md`, `docs-content/limitations.md`,
  `docs-content/troubleshooting.md`, `docs-content/spec-notes-tolerance.md` and `ParseOptions.strict`'s
  JSDoc name that docblock instead of carrying their own. A numeral is deliberately absent: this lineage
  has already corrected such a count twice, and the rule it wrote is that a count corrected twice is
  deleted rather than incremented. The pending `dicom-membership-render-tag.md` keeps its own statement,
  which is not false; only the single clause this collapse falsified was deleted from it, and
  `documentation/agent-notes.md` still argues the same exception in full, which is the record it exists
  to be. Name the sink, do not restate its cost.

  STILL A PRODUCT CALL AND UNTOUCHED: `report.removedPrivateTags`, `report.unauditableSequences[].tag`,
  `report.uidMap`, `contextPath` and the two `byteLength` fields are model fields, not messages. A bound
  on any of them empties the field on every well-formed file.

  FIGURES. Base `ce33ec4`. Head, whole suite: 73 files, 1,223 passing + 1 todo, 0 red. Head tests
  against base `src/` (replaced by file copy, not overlaid): 7 of 1,224 red across 3 files. Split before
  quoting. FOUR are behavioural, because base really put the number in a live message: the two closure
  pins, whose digit runs on base contain `20299` and `20275` respectively; the row asserting the message
  carries neither length, which on base contains the remaining `16`; and the printable-class row, whose
  live control message on base differs from the frozen template. TWO assert the registry template has no
  `{n2}` slot. ONE is the factory-arity row, which fails on its arity line before reaching any message
  assertion and is not evidence that base leaked. Re-measured after the graded pass, which is what added
  the multi-item row.

- b8a3fb5: A tag in a warning message is checked for membership in PS3.6's element registry now, and the
  parser's own codes no longer render a raw number read off an element header. This closes the fifth
  and sixth instances of "a diagnostic about a PHI leak is itself a PHI surface".

  **⚠ BREAKING FOR STRING-MATCHERS, AND FOR ANYONE WHO PARSES A TAG BACK OUT OF A MESSAGE.**
  `w.code` is unchanged everywhere, which codes fire is unchanged, and no parse moves. What changes is
  the prose of six registry entries and what two of the slots contain.

  **`renderTag` is a MEMBERSHIP test.** It renders a tag only when PS3.6's element registry carries a
  **literal row** for it, and `<withheld>` otherwise. Through `0.0.14` it validated a tag's shape, and
  a shape test admits all 2^32 tags, so it could not refuse a tag a lying Value Length composed out of
  somebody's value. Measured on a synthetic, name-bearing payload: an `ST` carrying
  `"MR BRAIN SMITHSON "` whose Value Length under-declares by 12 desynchronizes the Explicit VR LE
  reader onto a fabricated header whose declared length is odd, and `DICOM_ODD_LENGTH_VALUE_PADDED`
  rendered four bytes of the name as its tag (`4E495320`, `"IN S"` in wire order) **and four more as
  its decimal length** - eight consecutive payload bytes in one message, each reversible with one typed
  read. `renderVr` bounds two bytes against the 34 VRs PS3.5 2026c section 6.2 defines; this is the
  same trade against a set of 5,221.

  **A repeating-group family row does not count as membership, and that distinction is load-bearing.**
  `(50xx,xxxx)` Curve Data leaves the whole 16-bit element number free, so a family test would admit
  16 x 65,536 tags whose free bits are raw document bytes: `"\fPAR"` composes `500C5241` and returns
  all four payload bytes with one typed read. Only tags the registry names one at a time are rendered.

  **A raw wire number is bound out of the factory signature on the parser's codes, because there is
  nothing to check.** A
  declared Value Length has neither a shape nor a membership a renderer could test, so there is no
  `renderLength` and there must not be one. `DICOM_ODD_LENGTH_VALUE_PADDED` no longer prints the odd
  length. `DICOM_NONZERO_RESERVED_BYTES` no longer prints its two reserved bytes: that code already
  withheld its **tag** on the reasoning that its trigger is "this header may not be a header", and it
  then printed two bytes off the same header as decimals. Measured on the same payload, six
  under-declare deltas each put two letters of the name into that message. **No detector in this
  package had ever hunted a single byte rendered as a decimal**, which is why this instance had not
  been filed. `DICOM_PIXEL_DATA_LENGTH_MISMATCH` loses its declared length too, although this build has
  no call site for it: with none, the change costs nothing now and no later measurement would catch it
  once a phase switches the code on. `DICOM_GROUP_LENGTH_IN_DATASET` loses its tag for a third reason,
  which the membership rule produced rather than a judgement: PS3.6 carries exactly one literal row
  ending `0000`, and it is File Meta, so that slot could never have rendered anything but `<withheld>`.

  **The exceptions are named rather than counted, and rather than left as an unstated absolute.**
  `(0002,0000)`'s own declared
  File Meta group length is still printed, and that one is argued as well as measured: `parseFileMeta`
  runs once per parse, from `parseDicom`, at the post-`DICM` offset, and is never nested, so those four
  bytes are that attribute's own Value Field at a structurally determined offset that no Data Set value
  can be read into. The desynchronized-read sweep reaches that code zero times.

  **What it costs you, stated rather than minimised.** On any file, well-formed or not, a message about
  a **private** element, a **Group Length** `(gggg,0000)`, or a **repeating-group member** such as
  `(6000,3000)` Overlay Data no longer names its tag. The element is still in the Data Set under that
  tag, and `position.byteOffset` locates the header, with the frame-of-reference caveat every offset in
  this package carries. `DICOM_VR_MISMATCH` is unaffected by construction: it fires only where the
  dictionary already has an entry for the tag.

  **The "safe to log" sentence is deleted rather than reworded a third time**, in `README.md`,
  `docs-content/limitations.md`, `docs-content/troubleshooting.md`,
  `docs-content/spec-notes-tolerance.md`, `docs-content/cookbook.md` and `ParseOptions.strict`'s JSDoc.
  It was written as "safe to log whole on any well-formed file", then corrected to "safe on a
  well-formed file and not unconditionally safe", and this package deletes a disclosure it has reworded
  twice. Every carrier now states the mechanism - which slot is a membership test, which is a signature
  bound - and states no verdict.

  **Not taken, deliberately.** `report.removedPrivateTags` is untouched: it is a private-tag field by
  definition, so no closed table can ever vouch for its contents and a bound would empty it on every
  well-formed file. That is a product call rather than a defect. `report.unauditableSequences[].tag`,
  `report.uidMap` and `contextPath` are model fields rather than messages and are equally untouched.
  A `DicomParseError` still carries `snippet`, 16 raw source bytes as hex.

- ce33ec4: The two `deidentify()` diagnostics stop rendering a raw wire length, and the PHI detector's digit
  floor that hid it is gone (`DICOM-DIAGNOSTIC-PHI-RESIDUALS`)

  The seventh instance of "a diagnostic about a PHI leak is itself a PHI surface", plus the tripwire gap
  that made it invisible. The gap is the more valuable half.

  THE DETECTOR WAS WIDENED BEFORE ANY CODE WAS TOUCHED. The `length` arm of the re-encoding detector in
  `test/integration/fatal-diagnostic-surface.test.ts` skipped any rendering under seven digits, and the
  sentence beside it stated the defect without seeing it: "every 4-byte window of a printable-ASCII
  payload exceeds 1,000,000,000, so nothing in this fixture set is skipped by the floor." That is true
  and it is the whole problem. A declared Value Length is only reachable through a parse if the buffer
  really holds that many bytes, so every fabricated length a fixture can drive through this library has
  zero high-order bytes and therefore a SHORT decimal. `"SO\0\0"` renders `20307`: five digits, two of
  them letters of a surname, structurally under the floor. The floor was not a conservative filter on an
  arm that worked. It excluded the entire class of length leak that can actually happen. A GUARD WITH A
  FLOOR HAS NOT CLEARED ANYTHING BELOW THE FLOOR.

  The floor is removed and the collision it was for is answered by matching instead of skipping, so the
  widening is strictly additive: a rendering of seven digits or more keeps the original substring
  search, and a shorter one must equal a whole maximal digit run of the message.

  WHAT THE WIDENED DETECTOR FOUND, POINTED AT THE `deidentify()` CHANNEL. That channel is the one the
  standing desync sweep states it can never reach, because both codes are emitted by `deidentify()` and
  by nothing else while every desync fixture dies at a Tier-3 fatal first. It returned the two `{n}`
  slots this release closes and nothing else. It also returned `00080008`, a literal PS3.6 row that
  `renderTag`'s membership test renders on every file by design, which is scoped out of the sweep
  explicitly rather than left to pass quietly.

  THE REMEDY IS THE FACTORY SIGNATURE, AS IT WAS THE LAST FIVE TIMES.
  `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` rendered `{n}`
  from `Element.rawBytes.length`, which is not a count this parser invented: it EQUALS the declared
  Value Length off the element header. `sequenceNotAuditable` now takes `(position, tag)` and
  `undefinedVrNotAuditable` takes `(position)`. A raw length has neither a shape nor a membership for a
  renderer to test, so there is no `renderLength` and there must not be one. The second code is the
  sharper case: it withheld its tag and its VR on the stated ground that the header may be fabricated,
  then printed the length off that same header.

  WHAT IT COSTS, STATED RATHER THAN MINIMISED. A consumer reading only the message no longer sees how
  many bytes were emptied. The number is still on `report.unauditableSequences[].byteLength` and
  `report.undefinedVrElements[].byteLength`, and `{tag}` and the byte offset still locate the element.
  Those two model fields JOINED the `DeidentifyReport` not-value-free list rather than always having
  been on it: binding the message left them as the number's only publisher, which is a smaller surface
  and not a closed one.

  STILL A PRODUCT CALL AND UNTOUCHED: `report.removedPrivateTags`, `report.unauditableSequences[].tag`,
  `report.uidMap`, `contextPath` and the two `byteLength` fields are model fields, not messages. A bound
  on any of them empties the field on every well-formed file, where the content is exactly the audit
  information it exists to carry.

  A MIS-TITLED ROW IS CORRECTED. `deident-unauditable-sequence.test.ts` carried a row titled "carrying
  no value" for the very code disclosed as printing a header-derived length; its body only asserted that
  values planted elsewhere were absent, which a message built from a frozen registry cannot carry in any
  case. The title now matches what the code does and the row asserts the number's absence, with a
  non-vacuity control that rebuilds the shipped template.

  AND ONE MORE FIXTURE THAT HAD NEVER RUN. The standing desync sweep built its fixtures inside the `try`
  that swallows the parse failures they are designed to end in, so the `-20` delta, which under-declares
  an 18-byte payload past zero, threw during construction on both syntaxes and was counted as swept.
  Construction moved outside the `try`.

  FIGURES. Base `b8a3fb5`. Head, whole suite: 73 files, 1,220 passing + 1 todo, 0 red. Head tests
  against base `src/` (replaced, not overlaid): 5 of 1,221 red across 3 files. THREE are behavioural;
  TWO are the factory-arity rows, which fail on the arity line and whose message assertions would have
  passed on base, so they grade the new bound and are not evidence that base leaked.

## 0.0.14

### Patch Changes

- 0c53142: Test infrastructure: the generator suites prove their pins in a sandbox, so nothing mutates the
  vendored standards while another worker is reading them.

  **The pin is not relaxed. The mutation is relocated.** Both generator suites prove their vendored
  DocBook pins are preconditions rather than comments, and the only way to prove that is to defeat one:
  repoint `vendor/nema/<part>/SHA.txt` at a mutant document, and, for the check that re-hashes the
  CONTENT rather than the pointer, overwrite the bytes at the pinned path itself. Vitest runs test files
  in parallel, so for as long as a mutation was live every other worker saw it. The documentation
  citation gate re-hashes PS3.5, PS3.6 and PS3.15 at **module load**, which made it a fresh concurrent
  reader of two of the parts those suites mutate, and a reader that throws at module load takes its
  whole file down rather than one case. (Two, not all of them: the gate does not read `part05-2004`,
  which the repeating-groups suite mutates, and nothing mutates `part06`, which the gate does read.)
  The generators now run against a `mkdtemp` copy of `scripts/`, `src/` and `vendor/`, so there is
  nothing for a concurrent reader to observe.

  **Neither generator took a new input, which is what makes this affordable.** Both resolve their own
  repository root from `import.meta.url`, so relocating the script relocates the document it reads and
  the artifact it writes. The byte-identical regen gate keeps depending on a script with no vendor-root
  argument and no output-path argument; the new `root` option is on the test helper that spawns them,
  not on the scripts. The artifact comparison still reads the **committed**
  `src/dictionary/generated/` file as its baseline, so "regenerates what is committed" still means that.

  **The window was measured, and so was the fix.** A probe running the citation gate's `readPinned` in
  a loop over all four vendored part directories, against ten runs of the two generator suites, logged
  1,542 read cycles and 945 anomalous observations in four classes: `SHA.txt` holding a non-hash,
  `SHA.txt` naming a directory not on disk, the file at the pinned path not hashing to its pin, and the
  one that matters most, **a pin that verified against a document that is not the committed one**. 742
  of those 945 are on the two parts the citation gate actually reads. A mutant is written into a directory
  named by its own hash, so re-hashing it succeeds: an integrity check cannot see that at all, and the
  reader resolves clauses against a mutated standard and reports green. A SHA pin rewritten mid-run
  means the thing being corrupted is the integrity check itself, which is why teaching a reader to
  tolerate a writer was never on the table. Same probe after the change: 1,437 read cycles, zero
  observations of any class. End to end, looping the reader file against ten runs of the two mutating
  suites: ten of 31 reader runs failed before, zero of 30 after. Both controls were run, because a clean
  after-figure is also what a dead probe prints.

  **This also closes a flake the repeating-groups suite had disclosed and declined to fix**, and its
  disclosure is deleted rather than reworded: the two generator suites raced each other through
  `src/dictionary/generated/`, which reaches the whole test run and not just those two files, because
  the shipped library imports both artifacts. It was declined then because the obvious fix was an
  output-path override on a script the regen gate depends on. Relocating the tree costs the generators
  no new input at all, so that trade is not the one on the table any more.

  No library code changed, and no public surface moved.

- 023b22d: A diagnostic about a PHI leak is itself a PHI surface: two of the four measured instances are closed,
  and the claim that tied them together is corrected on every surface that carried it.

  **The three private-tag Tier-2 codes take no tag parameter at all.**
  `DICOM_PRIVATE_TAG_NO_CREATOR`, `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` and
  `DICOM_PRIVATE_CREATOR_UNKNOWN` are built from `position` alone. Measured on a synthetic,
  name-bearing payload: an `ST` carrying `"MR BRAIN SMITHSON "` whose Value Length under-declares by 12
  desynchronizes the Implicit VR LE reader onto a fabricated header at an odd group, and the first two
  of those codes rendered its tag as `4E495320` - `"IN S"` in wire order, four letters from inside the
  name - on the same parse, from the same branch of `resolveImplicitVR`. `renderTag` validates a tag's
  shape and therefore cannot refuse a fabricated one, so the bound is the **factory signature**, the
  same remedy `DICOM_NONZERO_RESERVED_BYTES`, `DICOM_ITEM_CROSSES_SEQUENCE_END`,
  `DICOM_DUPLICATE_TAG_IN_DATA_SET` and `DICOM_DUPLICATE_FILE_META_ELEMENT` already take. **What is
  specific here is why it is a bound and not a product call:** all three fire only on an **odd** group,
  and an odd group is the one class of tag no closed table this library holds can vouch for - PS3.6's
  registry is even-group and a `Profile`'s private dictionary is keyed by a creator string this code
  fires because it does not have. The third of the three is bound by that argument rather than by a
  measurement, and is described that way. **The cost, stated:** on a well-formed file with an unclaimed
  private block the tag is no longer in the message. It is still the element's key in the parsed Data
  Set, and `position.byteOffset` locates the header.

  **`report.embeddedAttributes[].hidden` carries only the tags the run acted on.** The embedded scanner
  listed **every** tag in a run it found inside a kept carrier's Value Field, and a run needs only one
  actionable attribute to be reported - so a fabricated header sitting beside a real one was listed
  too. Measured: a `CS` carrier over-declaring across a fabricated `"SMIT"` header beside a genuine
  `(0010,0020)` reported `hidden: ["4D535449", "00100020"]`. An entry is now one of the **652 literal
  rows** of PS3.15 Table E.1-1 that this run's options left actionable, and **two drafts of that filter
  were refuted before the sentence was true**. Filtering on the resolved Annex E action alone admits
  every odd group, because the Basic Profile removes private attributes as a class. Adding "and an even
  group" still admits every **repeating-group mask hit**: `annexE()` falls through to the family rows,
  and `(50xx,xxxx)` Curve Data leaves the whole 16-bit element number free - 16 groups x 65,536
  elements against 652 literal rows - so `"\fPAR"` composes `500C5241` and returns all four payload
  bytes with one typed read. A mask match proves a rule exists; it does not make the membership finite.
  The shipped test is "the tag has a literal row", which subsumes the odd-group case, since no literal
  row is odd-group. **Two consequences that travel with the field:** it can now be **empty on a real
  finding** (a run whose only actionable members are private attributes, Curve Data or Overlay elements
  names none of them, and the carrier is still emptied and still counted), and it is **still uncapped**.
  `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED`'s `{n}` is unchanged and still counts the whole run, so
  narrowing `hidden` did not silently re-scope a shipped message; its closing sentence was reworded,
  because it pointed at a field that can now be empty.

  **`report.removedPrivateTags` is deliberately unchanged.** It is a private-tag field, so no table can
  vouch for its entries and a bound would empty it on every well-formed file - which is what it exists
  to record. That is a product call, and the earlier reading that grouped all three as one call is
  retracted: the test that decides it is whether a closed table can vouch for the tag, not whether the
  tag is real on a good file.

  **The "safe to log" claim is corrected, and a fifth instance was found correcting it.** Sweeping every
  under-declare delta on both transfer syntaxes for every 4-byte window of the payload rendered as a
  tag, every 4-byte window rendered as a `readUInt32LE` decimal and every 2-byte window rendered as a
  VR, found a third leaking Tier-2 code on the base tree: **`DICOM_ODD_LENGTH_VALUE_PADDED` under
  Explicit VR LE renders a fabricated tag AND a fabricated 32-bit declared length** - eight consecutive
  payload bytes in one message, each reversible with one typed read. It is `PRE-EXISTING`, it is **not
  closed here**, and it is why `ds.warnings[].message` is still not unconditionally safe: that code
  fires on any tag, so the remedy is a membership `renderTag` plus a separate answer for the raw
  length, which is a package-wide decision rather than a rider. It is pinned by an asserted row.
  The claim was also attached to the wrong field: every fixture that produces the leak dies before a
  `Dataset` exists, so the carrier is `onWarning` and the `{ strict: true }` `DicomParseError`, not a
  surviving `ds.warnings` - and that no measured fixture put one on a surviving `ds.warnings` is stated
  as a fact about those fixtures, never as a guarantee. Carriers of the old wording were found by
  folding newlines rather than by a line-based search, since a sentence that wraps is invisible to one:
  `README.md`, `limitations.md`, `troubleshooting.md`, `spec-notes-tolerance.md`, `cookbook.md` and the
  JSDoc on `EmbeddedAttributeFinding`, `DeidentifyReport` and the three factories.

  **Consumer-visible:** four warning message strings are reworded (no code, no `position` and no
  `err.code` changes), and `embeddedAttributes[].hidden` may be shorter or empty on a file where it was
  populated before. A consumer that string-matched those messages or read `hidden` as the whole run
  should read the code and the warning's count instead.

- 3f41849: Docs, cookbook and examples: the roadmap's final phase, plus the gates that keep them honest.

  **A cookbook that covers the jobs a metadata parser is actually handed.** Four new recipes, every one
  executable in CI: extract metadata and index a folder of studies, build routing keys (hierarchy UIDs,
  Accession Number, Patient ID paired with its issuer), read pixel-interpretation metadata safely, and
  bridge to FHIR `ImagingStudy` and HL7 v2. The FHIR recipe works from the `ImagingStudy` "Mappings for
  DICOM" tab and says which FHIR that is: the URL is the continuous build, not a balloted release, so
  the recipe tells you to pin the mappings page for the FHIR version your integration targets.

  **A clause citation written with its part beside it is checked against the SHA-pinned normative
  documents, and the gate's coverage is stated rather than rounded up.** A new gate re-hashes
  the vendored PS3.5, PS3.6 and PS3.15 2026c DocBook sources as a precondition, then runs two checks of
  different strength. A clause of a vendored **prose** part (PS3.5, PS3.15) written with its label next
  to its part (`PS3.N §X`, `PS3.N section X`, `PS3.N Annex X`) is resolved by collecting **every**
  candidate section carrying that label and requiring exactly one, so zero and two are both refusals and
  a first-match read cannot take the table of contents. **The gate's coverage is stated rather than
  rounded up to "every citation": a label the text writes away from its part**, a second label in a list
  or a bare `section X` whose part was named a sentence earlier, **is not seen**, and the cookbook says
  so where a reader will meet it. Each clause the text leans
  on for a normative statement is additionally required to carry that sentence **in its own body, not in
  a subsection** (a body that swallowed subsections would certify `§7.5` for a `§7.5.2` fact and `§E.1`
  for an `§E.1.1` one, which are the two confusions this package has already paid for; both are pinned
  as controls). PS3.6 is cited for attribute identity rather than for prose, and is checked by its own
  case: every `(gggg,eeee) Some Name` pair written anywhere in the docs must be the registry's own name
  for that tag. **A numbered clause of a part this repository does not vendor may no longer be cited at
  all**: two such citations were in the README and are replaced by prose that names the part and says
  what is and is not claimed.

  **`@example` on every public export is a gate rather than a convention.** Two exports were missing one
  and now have it. The checker walks the public barrel through the compiler, so a namespace export and a
  type count the same as a function does, and it carries a mutation control that proves it can go red.

  **The PHI scanner reads doc fixtures.** The documentation ships DICOM objects as base64-encoded Part 10
  buffers inline in markdown, and until now the scanner never opened one: to a text sweep a base64 run is
  a single alphanumeric token with no `FAMILY^GIVEN` and no `YYYYMMDD` in it. `README.md` and
  `docs-content/**` are now a second corpus, embedded objects are decoded and walked as DICOM, and both
  the preamble-bearing and the preamble-less shape are recognized, the latter being what the cookbook
  ships to demonstrate `DICOM_MISSING_PREAMBLE`. **The run floor is not the filter, and a first draft
  that treated it as one shipped blind**: it required 120 base64 characters on the reasoning that a Part
  10 object is big, and the cookbook's preamble-less fixture encodes to 88, so the one file the route's
  own comments named as its reason was the one file it never opened while every test still passed. The
  floor is now the shortest run that could encode a single Data Element header, the decode does the
  filtering, and a regression case takes the **shortest real object out of the shipped cookbook** rather
  than building its own. **It found real content the moment it ran**: every
  sample object on the site carried a Study Date inside the 120-year window. Each is now `19000101`, and
  the docs say why rather than leaving it as an unexplained oddity.

  **A prominent "do not over-trust" page.** Known limitations moves out of the end of a long
  troubleshooting page and into its own entry near the top of the navigation, linked from the README's
  opening and from Getting started. It is an index rather than a second copy: scope non-goals, the open
  PHI residuals (the retain-route leak whose extent is a matrix, the over-long `LO` in `(0012,0063)` that
  this library is the likeliest writer of, `contextPath` being inert and not safe to log), the structural
  facts no reader can resolve, and what is deliberately never defaulted.

  **Two owed corrections.** The README described a Tier-2 warning message as "never composed from the
  document", and `ParseOptions.strict`'s JSDoc called one "safe to log whole". Neither is true without a
  qualifier: the registry's tag slot is filled by a shape check, which cannot refuse a tag a lying Value
  Length composed out of somebody's value. Both now say safe on a well-formed file and not
  unconditionally safe, which is what the measurement supports.

## 0.0.13

### Patch Changes

- b7a77fe: Build every Tier-3 fatal message from a frozen registry, and cut the `{ strict: true }` snippet in
  the frame its offset names (`DICOM-FATAL-MESSAGE-REGISTRY`).

  Tier-2 warnings have been registry-bound for several releases; Tier-3 messages were still assembled
  at the throw site out of template literals, and four of them printed four bytes of the document each.
  The messages that interpolated most were the ones raised **when a length field is lying**, which is
  the condition that makes a reader read bytes inside somebody's value as a Data Element header, so the
  tag and the length they printed were that value. Measured on a synthetic `"MR BRAIN SMITHSON "`:
  `Element 41524E49 declared length=1330858068` is `"RAIN"` then `"THSO"`, eight consecutive payload
  bytes, each recoverable with one typed read.

  The bound is the factory signature, matching the three Tier-2 codes that paid for this lesson before
  it: the token type has **no tag field and no wire-length field**, so there is no slot for one to
  travel through, and `err.byteOffset` identifies the element instead. A VR still renders when it names
  one of the 34; a byte count still renders when it is bounded by the buffer being read.

  Separately, `DicomParseError.snippet` is 16 raw source bytes cut at the diagnostic's own
  `byteOffset`. That offset moves with the frame the element was read in, but the cut was always taken
  from the whole file, so a strict-mode escalation raised inside a defined-length Sequence Item cut the
  file at an item-relative number and returned **an unrelated element's** bytes. The parse context's
  buffer now follows the frame at all four places this parser changes one. **The snippet is still
  unredacted source bytes and is still PHI.**

  **⚠ Some fatal messages are reworded, so a consumer string-matching one stops matching.** No count is
  given, deliberately: a first draft said "six", a graded pass measured nine, and the honest remedy for
  a count corrected once is to delete it rather than increment it. Diff `FATAL_MESSAGES` against the
  previous release's template literals if you need the set. **`err.code` is unchanged on every path and
  which files throw is unchanged.** Narrow on the code, never on the prose.

  Three residuals are named rather than closed, each with an asserted test row: the same fabricated
  header still reaches the Tier-2 `DICOM_PRIVATE_TAG_NO_CREATOR` message;
  `report.embeddedAttributes[].hidden` still lists a fabricated tag alongside the real one that made
  its run reportable; and because of the first, `ds.warnings[].message` is **not** unconditionally safe
  to log, which the docs now say. Narrowing any of the three is a product call, not a fix.

- 3617034: 🩺 `DeidentifyReport`'s `contextPath` was documented as structural and it is not: a segment is
  `TAG[index]` and the tag half is read off the wire, bound by neither a shape test nor a closed table.
  A file whose under-declared Value Length desynchronizes the reader onto four bytes inside somebody's
  value, followed by `SQ`, gets that fabricated sequence descended and its fabricated tag published in
  every `contextPath` beneath it. Measured on a synthetic `LO` carrier holding `"MRS BRAIN SMITHSON"`:
  `contextPath: ["53484E4F[0]"]`, which is `"HSON"` in wire order, with no warning raised and every
  finding array empty. **Redacting it is a logging fix and not an object fix**: on that same file the
  de-identified object still carries the fabricated `(5348,4E4F)` and the serializer writes `"HSON"`
  back out under a `Patient Identity Removed = YES` stamp, which is the already-disclosed
  under-declared carrier class and not this field. The claim is corrected in the type, the tolerance table and the
  troubleshooting guide, and `contextPath` is added to the report's list of fields that are not
  value-free; no guard was widened, because withholding the tag would destroy the audit on every
  well-formed file to bound a malformed one. `PRE-EXISTING`; no runtime behaviour changes. **Treat
  `contextPath` as PHI when the source is untrusted.**

  The `DICOM_ITEM_CROSSES_SEQUENCE_END` disclosure no longer says `contextPath` names "an item it was
  never in" - that asserts which of two byte-identical files you have. It is deleted rather than
  reworded a third time, and replaced by the two measurements that were already pinned.

- 369abbe: 🩺 A private `SQ` a `Profile` vouched for under `RetainSafePrivate` is no longer written into de-identified output verbatim (`DICOM-PRIVATE-SQ-CARVE-OUT`, `PRE-EXISTING`, live through the published `0.0.10`).

  `keepsPrivate` decided retention before the descent and routed a "yes" to `keepOrEmpty`, the only path in the module that writes a source value into output unchanged. So the whole vendor sequence was kept without anything inside it being examined: Table E.1-1 attributes the vendor encoded in its items, UIDs inside it, and any private element the file's own length fields pulled into it, all with `report.removedPrivateTags` reading `[]` and the object stamped `(0012,0062) Patient Identity Removed = YES`. On a fully conformant file, a `(0010,0010)` Patient's Name inside such a carrier was copied straight through.

  PS3.15 2026c §E.3.10 licenses retention for "Private Attributes that are known by the de-identifier to be safe from identity leakage", which is knowledge about one Private Attribute and not about a Data Set nested in its value; PS3.5 2026c §7.5.1 makes an Item Value exactly that, and PS3.15 2026c §E.1.1 obliges protecting Table E.1-1 attributes "whether contained in the top level Data Set or embedded in an Item of a Sequence of Items".

  The retention decision is unchanged and no guard is widened. A vouched-for private `SQ` now takes the same two branches every other `SQ` takes: it is walked when its items exist, and emptied with `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` plus a `report.unauditableSequences` entry when the parser never materialized them. A non-`SQ` private element is untouched, and there is no new public surface.

  The price is PS3.5 2026c §7.8.1's per-Data-Set reservation scope, which now applies inside the carrier: a nested private element whose block is reserved only at the root is removed and named, while one whose Private Creator is inside the Item, as §7.8.1 requires, is kept. No reading changes: 0 of 83,037 grid cells differ in any parse respect against base `495c9fc`.

- 92c0373: 🩺 A private carrier a `Profile` declared `SQ` is no longer written into de-identified output verbatim when the parse tree resolved it to something else (`DICOM-PRIVATE-SQ-PARSE-VR`, `PRE-EXISTING`, live through the published `0.0.10`).

  `keepRetainedPrivate` branched on `el.vr === "SQ"`, and the parse tree and the profile disagree about the same bytes in two ordinary, conformant situations. Under Implicit VR LE a private tag carries no VR on the wire (PS3.5 2026c §7.1.3), so `SQ` there is an inference the parser draws from a `Profile` it was given, and a profile passed only to `deidentify()` leaves the element `UN`. Under Explicit VR the wire's VR wins in the parser, so a sender who writes a profile-declared `SQ` attribute as `OB` or `UN` yields that instead, with an honest defined length wrapping a well-formed `(FFFE,E000)` item stream. Both shapes were measured shipping a `(0010,0010)` Patient's Name into output stamped `(0012,0062) Patient Identity Removed = YES`, and the Explicit VR one raises nothing at all on `ds.warnings`.

  The remedy is a second authority rather than a content test: the same `Profile` that vouched for the element declares its VR. A retained private element the profile declares `SQ` whose parse tree carries no items is emptied through the channel a parsed `SQ` with no items already used, `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` plus a `report.unauditableSequences` entry, keeping the VR the file actually carried instead of re-typing the element to `SQ`. `keepsPrivate` and the retention decision are unchanged, no parser file is touched, and there is no new public surface.

  It reaches the CP-246 `UN` too wherever a profile named it, because the test does not look at the length field; the undefined-length `UN` residual is a statement about elements no profile named. Two conjuncts ahead of it keep properties the module already had. An element whose on-wire VR is not one of the 34 still takes the tag-free `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` route, which keeps a header fabricated from bytes inside some element's value off the diagnostic **when its fabricated VR is outside the 34, and only then**: fabricate `OB` and the tag does reach `report.unauditableSequences`. That is disclosed rather than guarded, because a fabricated `OB` header and a genuine one are byte-identical, and because on that same input the previous behaviour kept the carrier verbatim and shipped the whole nested name. `DeidentifyReport` is not a value-free surface: its value-bearing fields are now a list on the type with no count anywhere, and re-deriving that list disclosed a fourth nobody had named, `embeddedAttributes[].hidden`, whose entries are four bytes found inside a value and whose own documentation said "safe to log" (`PRE-EXISTING`, byte-identical on every release that has shipped the field, disclosed rather than narrowed here). And a zero-length value is left alone so a second `deidentify()` pass reports no second drop. `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE`'s message no longer reads "is VR=SQ", because it is shared by both producers and the second one's premise is that the parse tree and the profile disagree about the VR.

  The cost: a caller who passes a profile to `deidentify()` but not to `parseDicom` now loses that vendor sequence's content instead of shipping it unexamined. Pass the same profile to `parseDicom` and the sequence is walked and its non-PHI content retained. Deliberately not closed, and still open rather than decided: a carrier whose profile entry declares a binary VR (`OB`/`OW`/`UN`) over a well-formed item stream, which would need a content test on exactly the VRs arbitrary bytes are for.

- ad675da: The README lockup now links to cosyte.com (`ASSETS`).

  The `<picture>` block above the H1 is wrapped in an anchor to https://cosyte.com, per the founder
  requirement of 2026-08-06. Nothing inside the block moved: the `<source>`, the `<img>`, the alt text
  and both tile URLs are byte-identical.

  What the anchor does was measured on both surfaces by `fhir`, not assumed, because fourteen READMEs
  carry this shape. On GitHub the anchor works and the colour-scheme switch keeps working, because the
  `<img>` stays a direct child of `<picture>`, which is the condition the HTML spec puts on `<source>`
  applying at all. On an npm package page the anchor is lost: npm wraps a README image in its own
  anchor to the image file, a nested anchor is not representable, so the parser closes ours early and
  the image ends up linked to the image file rather than to cosyte.com. Shipped anyway by founder
  decision of 2026-08-07: on npm that is no worse than the unlinked lockup it replaces, and GitHub is
  where these READMEs are read.

- 0a8c6e3: Correct the disclosed extent of the surviving `RetainSafePrivate` retain-route leak
  (`DICOM-RETAIN-ROUTE-RESIDUALS`). Six artifacts described it as "a private carrier whose profile
  entry declares a binary VR". The predicate has two conjuncts and that wording named neither: the
  profile does not declare `SQ`, and the embedded-attribute scanner cannot read the value (it reads
  string carriers only, and decodes tiles in the file's own encoding). The two sets are incomparable,
  not nested - a profile entry declaring `LO` over a carrier the sender wrote `OB` ships the identical
  nested `(0010,0010)`, while one declaring `OB` over a carrier written `LO` is emptied. The
  prose enumeration is deleted rather than reworded, and a measured matrix pins the surface instead:
  declared VR against encoding, and against wire VR under Explicit VR only, because Implicit VR LE
  writes no VR at all. No `src/` predicate changes: the behaviour is `PRE-EXISTING` and identical
  before and after. The matrix also strengthens the `DICOM-PRIVATE-SQ-PARSE-VR` closure beside it,
  proving it on five distinct inputs rather than on the one cell that opened it.
- c0fa362: The UID registry is now sourced from the normative PS3.6 Annex A, and every release from here on writes its own section into `CHANGELOG.md`.

  **`Dictionary.uid` resolves the whole UID registry, not a subset of it.** The transfer syntax and well-known UID names used to be a hand-typed table inside the dictionary generator, merged with a SOP Class list, and nothing compared either one against the normative text. That table is gone. The generator now reads PS3.6 2026c Annex A directly (Table A-1 "UID Values" and Table A-2 "Well-known Frames of Reference") from the SHA-256-pinned DocBook already vendored here, and overlays it per field exactly as the element registry is overlaid: the normative source wins on name, type and retirement for a UID both carry, its own additions are taken, and an entry only the mirror carries is kept rather than dropped, because the standard retires UIDs rather than deleting them.

  The registry goes from 268 entries to 494, and **every one of the 268 comes through byte identical**: no shipped name, type or retirement flag moved. What changed is coverage. Six transfer syntaxes the current edition defines, including the High-Throughput JPEG 2000 family and Deflated Image Frame Compression, previously resolved to `undefined`. Nothing was ever mis-read, because a transfer syntax is dispatched by UID value and never by name, but a caller asking the dictionary what it was holding got no answer.

  **The two deliberate departures from the normative spelling are preserved, and they are now derived rather than typed.** Retirement stays a structured `retired` boolean instead of the trailing `(Retired)` every retired Annex A row carries at the end of its UID Name. Four transfer syntaxes keep the short form every DICOM toolkit prints instead of the longer `...: Default Transfer Syntax for ...` form, and that short form is cut from the normative name at build time rather than written out by hand, so it cannot drift away from it: a name that stops carrying the clause fails the build instead of silently keeping a stale string. Measured on this edition, those four are exactly the Annex A names that carry such a clause, so the departure is the complete set rather than a subset. Two rows that the standard retired and left unnamed in the same edition are excluded rather than shipped with an empty name, because an entry whose name is empty reads as a successful lookup and a caller's fallback stops firing.

  **And the changelog is generated.** `.changeset/config.json` set `changelog: false` for this package's whole published history, so no release ever wrote a version heading and the file was maintained by hand under one `[Unreleased]` heading that nothing rolled over. Ten published versions shipped a changelog inside the tarball describing already-released work as unreleased. The fix is the flag rather than the prose: correcting the text by hand leaves the mechanism that produced it. The hand-written history is preserved verbatim, unsorted and unreworded, under a `Released before this file was generated` divider, and every release from here on prepends its own section above it.

  Both halves are graded by tests rather than asserted. The UID registry is re-parsed from the pinned DocBook independently of the generator and compared against what the package actually exports, so the check cannot pass by agreeing with the generator. The changelog contract runs the real release tool against the real file in a throwaway repository, proves the archived history survives it byte for byte, and proves the region above the divider carries only what a release generates: a fabricated version section is refused wherever it is placed, which closes a gap a sibling package measured as open.

## Released before this file was generated

Every release section above this heading is written by
[Changesets](https://github.com/changesets/changesets) from the changesets in `.changeset/`, newest
release first. The release writes its own version heading, so nothing above this line is maintained
by hand, and a change is recorded here by adding a changeset rather than by editing this file.

Everything below this heading was maintained by hand, in the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format, on the
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) ladder this package still follows. Most
of it sat under a single `[Unreleased]` heading that no release ever rolled over, which is why ten
published versions of this package shipped a `CHANGELOG.md` describing already-released work as
unreleased, inside the tarball, for as long as they did. That heading is gone; its entries are not.

The text is left exactly as it was written rather than re-sorted into version sections. The file
never recorded which release each of those entries went out in, so assigning them now would be a
guess presented as a record, and this is the text that installed copies already carry on disk. Only
the `[Unreleased]` heading itself and the preamble above it were removed.

### Fixed

- **🩺 `DeidentifyReport`'s `contextPath` was documented as structural, and it is not: it can publish
  four bytes of a value, silently** (`DICOM-ITEM-CROSSES-RESIDUALS`). A segment is `TAG[index]`, and
  the tag half is whatever tag the descent walked, read straight off the wire, bound by neither a
  shape test nor a closed table. `attributes[].tag` is bound - it is only populated for a tag Annex E
  carries a row for - and that contrast is the finding. **It is not the only report identifier read
  off the wire**: `removedPrivateTags` and `unauditableSequences[].tag` are as well. Those two were
  already disclosed as such; this one was documented as structural. So a file whose
  under-declared Value Length desynchronizes the reader onto four bytes sitting **inside** somebody's
  value, where those four bytes are followed by `SQ`, gets that fabricated sequence descended and its
  fabricated tag published in the `contextPath` of everything beneath it.

  Measured on a synthetic `LO` carrier holding `"MRS BRAIN SMITHSON"` that under-declares by four:
  the report reads `contextPath: ["53484E4F[0]"]`, which is `"HSON"` in wire order, recovered by
  writing the two halves back with `writeUInt16LE`. Change the surname to `"DAVIDSON"` and the
  published segment changes with it. **No warning is raised and every finding array on the report is
  empty**, so a consumer following the old guidance had no signal at all. A conformant file's segment
  is the tag the sender wrote, which is why the field is still published.

  **🛑 REDACTING `contextPath` IS A LOGGING FIX AND NOT AN OBJECT FIX, AND A GRADED PASS REFUTED THE
  FIRST DRAFT FOR SAYING OTHERWISE.** That draft claimed in six places that this field was "the only
  trace of that header in the entire output". It is not: the de-identified `Dataset` still carries
  the fabricated `(5348,4E4F)`, so `serializeDicom` writes its header back out in full, `"HSON"`
  included, under `(0012,0062) Patient Identity Removed = YES` - and the re-emitted bytes track the
  surname exactly as the log field does. That re-emission is the already-disclosed under-declared
  carrier class, not this field's doing, and **neither one is a bound on the other.** Both rows are
  now pinned.

  **The claim was corrected and no guard was widened**, on the same footing as `removedPrivateTags`:
  _where_ an attribute sat is the whole audit value of the field, and withholding it would destroy
  that on every well-formed file in order to bound a malformed one. **`contextPath` is now named on
  the report's list of fields that are not value-free** - a list whose numerals were deleted rather
  than incremented, per this package's own rule - and corrected in the type, the tolerance table and
  the troubleshooting guide, which all called it structural. **Treat it as PHI when the source is
  untrusted.** `PRE-EXISTING` on every release that has shipped the field; no runtime behaviour
  changes.

  The shared PHI runner has swept this field from the start and could never have gone red on it: it
  hunts a **verbatim** marker and a tag is a re-encoding, the same blind spot already documented for
  `DicomParseError.snippet`. The pin is a purpose-built measurement with a name-bearing payload, a
  mutation control and a conformant negative control.

- **The `DICOM_ITEM_CROSSES_SEQUENCE_END` disclosure no longer claims `contextPath` names "an item it
  was never in".** That sentence asserts which of two byte-identical files you have, which is the one
  thing this package has repeatedly measured the wire as not carrying: the partner file, built from
  the opposite intention, is the same bytes with the element genuinely inside the item, where the
  identical `contextPath` is right. It had already been narrowed once in the troubleshooting guide
  and left standing everywhere else; this package's rule for a disclosure reworded twice is to delete
  it, so it is deleted rather than given a third wording. **What replaces it is the pair of
  measurements that were already there** - one shape puts the element in the item with a
  `contextPath`, the other leaves it at the root with none - **and neither is labelled the mistake.**
  No reading, no warning and no report field moved.

- **🩺 Tier-3 fatal messages are built from a frozen registry, and four of them were printing four
  bytes of the document each** (`DICOM-FATAL-MESSAGE-REGISTRY`). Tier-2 warnings have been
  registry-bound since the warning-message slice; Tier-3 messages were still assembled at the throw
  site out of template literals. That reads as harmless and is not, because the messages that
  interpolated most were the ones raised **when a length field is lying** - the condition that makes
  a reader read bytes inside somebody's value as a Data Element header, so the tag and the length it
  then prints are that value.

  Measured on a synthetic `"MR BRAIN SMITHSON "` carried in an `ST` whose Value Length under-declares:
  `Element 41524E49 declared length=1330858068` is `"RAIN"` then `"THSO"`, eight consecutive payload
  bytes in two fields, each recoverable with one `readUInt16LE` / `readUInt32LE`. Also
  `Unexpected tag 524D4220 inside sequence` and `Item length=1109414477`, both `"MR B"`, and
  `Unexpected FFFE marker FFFEE00D (length=1109414477)`, the same four bytes again.

  **The bound is the factory signature, exactly as it was for the three Tier-2 codes that paid for
  this lesson before it.** The new `FatalTokens` type has **no tag field and no wire-length field**,
  so there is no slot for one to travel through, and a shape check would not have helped: a tag has
  only a shape, so a renderer for one cannot refuse a fabricated tag. `err.byteOffset` identifies the
  element instead, and it is a count the parser kept. What a fatal message may still carry is named
  one registry entry at a time: a VR checked against the closed 34-VR set, a residual byte count
  bounded by the buffer being read, a library constant, PS3.6's own registry name for an unsupported
  Transfer Syntax UID, and a zlib error code checked against zlib's nine-name table.

  **⚠ SOME FATAL MESSAGES ARE REWORDED, SO A CONSUMER STRING-MATCHING ONE STOPS MATCHING. NO COUNT IS
  GIVEN, AND THAT IS DELIBERATE** - the first draft of this notice said "six", a graded pass measured
  nine, and this repo's rule is to **delete a count rather than increment it**. The set is derivable
  in one command and can never go stale: diff `FATAL_MESSAGES` in `src/parser/fatals.ts` against the
  template literals in `git show 0a8c6e3 -- src/parser/`. **`err.code` is unchanged on every path,
  and which files throw is unchanged.** Narrow on the code, never on the prose.

- **🩺 The `{ strict: true }` snippet returned an unrelated element's bytes inside a defined-length
  Sequence or Item.** `PRE-EXISTING`, found and disclosed by the `(0012,0063)` slice rather than
  fixed, and closed here. `DicomParseError.snippet` is 16 raw source bytes cut at the diagnostic's own
  `byteOffset`; that offset moves with the frame the element was read in, but the cut was always taken
  from the whole file. So an escalation raised inside a defined-length Item cut the **file** at an
  **item-relative** number and handed back whatever sat there - a diagnostic disclosing part of an
  element the reader was never asked about, which in a de-identification library is a PHI surface
  rather than a cosmetic offset bug. The parse context's buffer now follows the frame at all four
  places this parser changes one; the deflate boundary already did, and the three sequence boundaries
  did not.

  **This does not make `snippet` safe to log, and nothing here should be read that way.** It is still
  16 unredacted source bytes (the documented design), and making the frame honest makes them more
  certainly the named element's own content, not less.

  **Three residuals are named rather than closed, each with an asserted row in
  `test/integration/fatal-diagnostic-surface.test.ts` so no artifact can read this entry as an
  all-clear.** (1) The identical fabricated-header shape still reaches a **Tier-2** message: the same
  desynchronized read lands on an odd group, so `DICOM_PRIVATE_TAG_NO_CREATOR` names the fabricated
  tag (`4E495320`, `"IN S"`), through the shape-checking `renderTag` that cannot refuse one. (2)
  `report.embeddedAttributes[].hidden` lists every tag in a run the embedded scanner found inside a
  kept value, and a run needs only **one** actionable attribute to be reported, so a fabricated header
  beside a real one is listed too: measured at `4D535449`, `"SMIT"` in wire order, beside the genuine
  `00100020`. (3) Because of (1), **`ds.warnings[].message` is not unconditionally safe to log**, and
  the docs that said so are corrected in this release rather than the guard being widened. All three
  are the same product call as the one already filed for `report.removedPrivateTags`: on a well-formed
  file these are the real tags of real attributes, and withholding them would destroy the field's
  audit value to close a shape only a crafted file produces.

- **🩺 The surviving PHI leak on the `RetainSafePrivate` retain route was disclosed as the WRONG SET,
  in six artifacts at once** (`DICOM-RETAIN-ROUTE-RESIDUALS`). `PRE-EXISTING` and unchanged in
  behaviour: **no `src/` predicate moves in this release entry**, and every cell described below
  leaks identically before and after it. What changed is the claim.

  Every artifact that described what the private-`SQ` closure leaves open said it was "a private
  carrier whose **profile entry declares a binary VR** (`OB`/`OW`/`UN`)". That is not the predicate,
  and the true set is **neither narrower nor wider than it - the two are incomparable**. A profile
  entry declaring `LO` over a carrier the sender wrote `OB` leaks; a profile entry declaring `OB`
  over a carrier the sender wrote `LO` does not. **There are two conjuncts and the deleted wording
  named neither.** `keepRetainedPrivate` asks one question - does the `Profile` declare this
  attribute `SQ`? - and every other answer falls through to the ordinary keep path, where the only
  thing between the value and de-identified output is the embedded-attribute scanner. That scanner
  reads **string carriers only**, and it decodes candidate Data Element headers in the **file's own
  encoding**. So the value survives exactly when the profile does not say `SQ` **and** the scanner
  cannot read it: a string carrier holding Explicit-VR-shaped bytes inside an Implicit VR LE file is
  in the set for the same reason a binary carrier is. In every such case the carrier reaches output
  **byte-identical to the file's own value**, stamped `(0012,0062) Patient Identity Removed = YES`,
  with `report.unauditableSequences` and `ds.warnings` both empty, because none of these files is
  malformed: the Value Length is honest and the value is a well-formed `(FFFE,E000)` item stream.

  **The enumeration is deleted rather than reworded a third time, and a measured matrix replaces it.**
  `test/integration/deident-private-reservation.test.ts` now sweeps the profile's declared VR against
  the encoding and, under Explicit VR only, the wire VR, with a name-bearing payload, and asserts the
  **emptied** set exactly - so the leaking set is whatever is left and cannot go stale in prose. It
  pins the leaking cells as kept verbatim and silent rather than inferring it from a substring
  search. **There is deliberately no wire-VR axis under Implicit VR LE**, which writes no VR at all
  (PS3.5 2026c §7.1.3); crossing one in measures a single file four times. The same sweep strengthens
  the closure it sits beside: a profile-declared `SQ` is emptied to zero bytes and named on all four
  Explicit wire VRs and on the VR-less Implicit encoding, where the case it replaced measured one
  `OB`/Explicit cell. Non-vacuity is by fixture and by mutation: the payload carries a real name,
  every Explicit cell really does present a distinct VR to the parser, and disabling the closure's
  branch reds the matrix.

  **Two remedies exist and both are product calls, so neither is taken here.** A content test on
  binary carriers is already priced in `src/deident/embedded.ts` at 11 grid cells to 0 while emptying
  all 5 conformant binary tiling controls (`DICOM-DEIDENT-OVER-REDACTION`, open). Refusing retention
  wherever the profile's declared VR and the parse tree disagree needs no content test, but a `UN`
  carrier whose profile declares `LO` is the most ordinary real-world private element there is - an
  intermediary without the private dictionary rewrote the VR, PS3.5 2026c §6.2.2 - so it would drop
  vendor values out of a large share of conformant files. Both are recorded as evidence, neither is
  recommended, and the call is not made here.

- **🩺 A private carrier a `Profile` declared `SQ` was still written into de-identified output
  verbatim whenever the parse tree resolved it to anything else** (`DICOM-PRIVATE-SQ-PARSE-VR`).
  `PRE-EXISTING`, live through the published `0.0.10` and through the carve-out below, which closed
  only what the parse tree happened to resolve. `keepRetainedPrivate` branched on `el.vr === "SQ"`,
  and the parse tree and the profile disagree about the same bytes in **two ordinary, conformant
  situations**: under **Implicit VR LE a private tag carries no VR on the wire** (PS3.5 2026c
  §7.1.3), so `SQ` there is an inference the parser draws from a `Profile` _it_ was given and a
  profile passed only to `deidentify()` leaves the element `UN`; and under **Explicit VR the wire's
  VR wins in the parser**, so a sender who writes a profile-declared `SQ` attribute as `OB` or `UN`
  yields that instead - with an honest defined length wrapping a well-formed `(FFFE,E000)` item
  stream. Both were measured shipping a `(0010,0010)` Patient's Name into output stamped
  `(0012,0062) Patient Identity Removed = YES` with an empty `report.unauditableSequences`.

  **The remedy adds a second authority, not a content test.** The `Profile` that vouched for the
  element also declares its VR, and that declaration is what `RetainSafePrivate` is trusting in the
  first place. A retained private element the profile declares `SQ` whose parse tree carries no
  items is now emptied through the same channel a parsed `SQ` with no items already used -
  `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` plus a `report.unauditableSequences` entry - **keeping the
  VR the file actually carried** rather than re-typing the element to `SQ`. Nothing inspects the
  value's bytes, `keepsPrivate` and the retention decision are unchanged, no parser file is touched,
  and there is no new public surface. `UnauditableSequenceFinding`'s documentation now names both
  producers, because the field is no longer only about a parsed `SQ`.

  **🛑 One of the two shapes is silent on `ds.warnings`.** The Implicit VR LE file raises
  `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`; the Explicit VR `OB` file is fully conformant and
  raises nothing at all. `report.unauditableSequences`, not `ds.warnings`, is this class's channel.

  **The cost, stated here rather than discovered later.** A caller who passes a profile to
  `deidentify()` but not to `parseDicom` now **loses** that vendor sequence's content instead of
  shipping it unexamined. **Pass the same profile to `parseDicom`** and the sequence is walked, its
  Table E.1-1 attributes de-identified and the rest retained.

  **It reaches the CP-246 `UN` too, wherever a profile named it.** The test does not look at the
  length **field**, so an undefined-length `UN` whose CP-246 descent this parser refused is emptied
  when a `Profile` declares that private attribute `SQ`. The undefined-length `UN` residual is a
  statement about elements **no profile named**, and survives only there. (Read that as stated: the
  predicate does have a length conjunct, `el.length > 0`, and a refused CP-246 descent carries
  `0xFFFFFFFF`, so it passes.)

  **Two properties of the module are kept by conjuncts ahead of that test, and each is pinned by its
  own test.** An element whose on-wire VR is not one of the 34 is still answered by the tag-free
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` route. And a zero-length value is left alone, so
  de-identifying an already de-identified object reports no second drop.

  **🩺 The first of those is a PARTIAL bound, and it is disclosed rather than grown.** It keeps the
  tag off the diagnostic only when the fabricated header's own VR bytes fall outside the 34. A
  length under-declared upstream can resynchronize the reader onto four bytes that spell a genuine
  private block, and if those bytes are followed by `OB` rather than something unrecognized, the
  fabricated tag reaches `report.unauditableSequences` and the warning. There is nothing to key on:
  a fabricated `OB` header and a genuine one are byte-identical. The direction is still a strict
  improvement, because the previous behaviour kept that carrier **verbatim** and shipped the whole
  nested name, and this one empties it. It joins `report.removedPrivateTags`, which can echo the
  same four bytes from a fabricated odd-group header on both trees: **`DeidentifyReport` is not a
  value-free surface and must not be treated as one.** Pinned as the second row of the
  fabricated-header test.

  **The report's value-bearing fields are now a LIST on `DeidentifyReport`, with no count anywhere.**
  The count read one, then two, then three, and was wrong each time, because each correction bumped
  the numeral instead of re-deriving the list. Re-deriving it found a fourth that no release had
  disclosed: `embeddedAttributes[].hidden`, whose entries are composed from four bytes found
  **inside** a value, so on any file that populates that field they are document content by
  construction, and whose own documentation said "safe to log". That is `PRE-EXISTING` and
  byte-identical on every release that has shipped the field; it is **disclosed** here and on the
  type, and narrowing or capping it is its own change.

  `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE`'s message no longer reads "is VR=SQ". It is shared by both
  producers, and the second one's premise is that the parse tree and the profile disagree about the
  VR, so naming one stated a fact the file contradicts.

  **Deliberately not closed**, and see the entry above for why this paragraph no longer enumerates
  the surviving shape: everything the profile does **not** declare `SQ`, over a value that happens
  to be a well-formed item stream, is still kept verbatim. Closing any of it needs a content test on
  exactly the VRs arbitrary bytes are for. That is the same reasoning
  `DICOM-BINARY-CARRIER-OVERDECLARE` was accepted on, but it is **a different route** - that
  decision priced a measured over-declare swallow, and this is an honest length reached through
  `RetainSafePrivate`. It remains open and undecided, and is pinned as a measured matrix rather than
  described in prose.

  Against base `src/` at `369abbe`, replaced wholesale: **5 of 1,081** tests run red over the full
  suite; suite 1074 to 1080 passing plus the 1 `todo`. Two of the seven new or rewritten tests are
  green on both trees **by design**, because they are controls: that a retained private element the
  profile declares `LO` is still kept **verbatim**, and that a fabricated header keeps the tag-free
  diagnostic (base already withheld it). Every conjunct's non-vacuity was proven by mutation rather
  than asserted. `scripts/measure-sq-bound-grid.ts` was **not** re-run and holds no
  private-`SQ` cell in any family; this remedy is reachable only from inside `keepRetainedPrivate`.

- **🩺 A private `SQ` a `Profile` vouched for under `RetainSafePrivate` was written into
  de-identified output verbatim, so nothing inside it was ever examined for PHI**
  (`DICOM-PRIVATE-SQ-CARVE-OUT`). `PRE-EXISTING`, live through the published `0.0.10`, found by
  `#66`'s `conformance-refuter`. `keepsPrivate` decides retention before the descent, and that part
  was never wrong; what was wrong is that a "yes, retain" routed the element to `keepOrEmpty`, **the
  only path in the module that writes a source value into output unchanged**. So a vendor sequence
  the profile named was blitted whole: Table E.1-1 attributes the vendor encoded in its items, UIDs
  inside it, and any private element the file's own length fields pulled into it all survived, with
  `report.removedPrivateTags` reading `[]` and the object stamped `(0012,0062) Patient Identity
Removed = YES`.

  **The sharper half needs no malformed file at all.** On a fully conformant file, with `ds.warnings`
  empty, a `(0010,0010)` Patient's Name written inside a vouched-for private `SQ` was copied straight
  through. That case is now pinned with a name-bearing payload and non-vacuity assertions, alongside
  the absorb shape the original residual held.

  **What bounds the profile's licence is the spec, not a judgement call here.** PS3.15 2026c §E.3.10
  retains "Private Attributes that are known by the de-identifier to be safe from identity leakage".
  A profile entry is knowledge about **one Private Attribute**. It is not knowledge about a Data Set
  nested inside that attribute's value, and PS3.5 2026c §7.5.1 makes an Item Value exactly that ("a
  DICOM Data Set composed of Data Elements"). PS3.15 2026c §E.1.1 then obliges an implementation
  claiming the Basic Profile to protect Table E.1-1 attributes "whether contained in the top level
  Data Set or embedded in an Item of a Sequence of Items", and a private carrier is one of those
  Sequences. A vendor cannot vouch for `(0010,0010)`; it is not a Private Attribute.

  **The remedy widens no guard.** `keepsPrivate` still decides retention and the profile is still the
  only vouching authority. A vouched-for private `SQ` is simply routed into the two branches every
  other `SQ` in the module already takes: `descendSequence` when its items exist,
  `emptyUnauditableSequence` (with `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` and
  `report.unauditableSequences`) when the parser never materialized them. A non-`SQ` private element
  is untouched. **No new public surface**: no Tier-2 code, no report field, no snapshot change.

  **The price, measured and pinned.** Walking the carrier means PS3.5 2026c §7.8.1's per-Data-Set
  reservation scope applies inside it, and Items do not inherit the enclosing Data Set's
  reservations. A vendor who nests a private element in a private `SQ` and reserves its block only at
  the **root** loses it, named on `report.removedPrivateTags` rather than dropped silently. A vendor
  who writes the Private Creator **inside the Item**, as §7.8.1 requires, keeps it. Both rows are
  pinned as a pair.

  **No reading changes, and the grid cannot see this remedy.** `scripts/measure-sq-bound-grid.ts`
  builds its `priv|` family's private data element as `LO` behind a public `(0008,1115)` carrier, so
  it holds **no private-`SQ` cell**. Against base `495c9fc` over **83,037 cells**: 0 cells differing
  in any parse respect, 0 whose reading differs, 0 changed, 0 PHI regressions, 0 de-identified
  outputs lost a marker, and every `priv:` counter identical. Read that as evidence of blast radius,
  never as a safety measurement. The regression net is the unit tests: against base `src/` at
  `495c9fc`, **5 of the 57** tests across
  `test/integration/deident-private-reservation.test.ts` and
  `test/integration/deident-unauditable-sequence.test.ts` run red: the **4** that assert this
  closure, plus the control row of the `DICOM-PRIVATE-SQ-PARSE-VR` residual, which asserts the same
  closure on a file the parser did resolve. The residual's own leaking row is green on base by
  design. Full suite 1071 to 1074 passing. The two residuals that asserted the leaking behaviour
  were rewritten to assert the closure, which is what those pins existed for.

  **The bound below is CLOSED by the entry above (`DICOM-PRIVATE-SQ-PARSE-VR`), which ships in this
  same release; it is kept because it is why that remedy needed a second authority.** The branch
  keyed on the PARSED VR, not on the VR the profile declares. Under Implicit VR LE a private tag carries no
  VR on the wire, so `SQ` there is an inference the parser draws from a `Profile` it was given. Pass
  the profile to `parseDicom` and the element arrives as an `SQ` with items and is walked; pass it
  only to `deidentify()` and the identical bytes arrive as `UN` with no items, take the non-`SQ`
  branch, and are kept verbatim as before, under `(0012,0062) = YES`, with
  `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` the only signal. That is
  `DICOM-PRIVATE-SQ-PARSE-VR`, `PRE-EXISTING`, its own item and pinned as a residual test. It is
  **not** the undefined-length `UN` residual below: that carrier's length is defined, so CP-246
  never runs. **Pass your profile to `parseDicom` as well as to `deidentify()`.** The
  `creatorsInScope` note claiming `RetainSafePrivate` "behaves identically whether the profile
  arrived at parse or at de-identification" is retracted for the same reason; it was true only while
  every retained private element was kept verbatim.

  **Still open at the time this entry was written, and `DICOM-PRIVATE-SQ-PARSE-VR` has since been
  closed by the entry above:** the undefined-length `UN`
  whose CP-246 descent was refused
  (it keeps `vr === "UN"`, so the rule cannot reach it without emptying every unknown-VR element in
  every file); and the 11 leaf-carrier cells of `DICOM-BINARY-CARRIER-OVERDECLARE` (11 to 11 on the
  grid, with the conformant tiling-control counter unmoved at 7 to 7).

- **🩺 The `(0012,0063)` De-identification Method this library writes for itself exceeded the 64-character
  maximum PS3.5 gives an `LO` Value, on every file it ever de-identified**
  (`DICOM-LO-LENGTH-AND-SILENT-REPLACE`). `PRE-EXISTING`; measured through the built package on
  `da1f209`: **76** characters with no options, **130** with `RetainUIDs + RetainSafePrivate +
RetainDeviceIdentity`, **272** with all nine, and **all 512 option subsets over the maximum**. PS3.5
  2026c **Table 6.2-1**, `LO` row, is "64 chars maximum" and that row describes a **Value**;
  `(0012,0063)` is `1-n`, so the bound falls per value. Reading it as a bound on the Value Field is the
  same misreading that left the fixed-point hole above (where §6.4, a clause about the **encoder**, was
  read as a bound on a **comparison**), and it matters because the attribute concerned is the one a
  receiver reads to decide whether an object was de-identified at all.

  The default method text is now **multi-valued**: one Value naming the Profile
  (`@cosyte/dicom Basic Application Level Confidentiality Profile`, **61** characters) and one Value per
  active Annex E Option, joined with `\`. No option name exceeds **28** characters, so no subset can
  breach the maximum - proved by sweeping **all 512 subsets / 2,816 value cells** rather than by
  argument: **0 over the maximum**, against **512 of 512** on the commit before. The Value Field is
  still 111 and 247 bytes for those two option sets, which is legal and is asserted alongside the
  per-value figure so a remedy that merely shortened the text could not pass. Options are emitted in
  `DEIDENTIFY_OPTIONS` order rather than the caller's, so the same option set always writes the same
  bytes. The fixed point is unaffected and re-measured over six real wire round trips: **62** bytes flat
  by default and **248** flat with all nine.

  **Your own `deidentificationMethod` is not bounded for you** and neither is a prior value the source
  file wrote: splitting or truncating either would invent a de-identification record nobody made. Both
  are pinned as residual tests rather than left to be rediscovered. Split your string on `\` yourself if
  a strict receiver is in your path.

- **🩺 A `(0012,0063)` a file encoded under a VR other than `LO` was replaced silently**, and now raises
  the new Tier-2 code **`DICOM_DEIDENT_METHOD_NOT_LO`** on `report.warnings`. The replacement itself is
  deliberate and unchanged: the provenance chain is built by concatenating `LO` values with the `5CH`
  delimiter, which is a text operation and not defined over the arbitrary octets an `OB` or `UN` value
  holds, so guessing an encoding for them was refused. What was wrong was that the sender's earlier
  de-identification record left the object with `report.warnings` **empty**, under
  `(0012,0062) = YES`. It is a separate code from `DICOM_DEIDENT_METHOD_NOT_ADDED` because the causes
  are unrelated - the chain outgrew the VR, or the bytes were never in that VR at all - and a consumer
  that has to tell them apart now can. A prior value that is empty or padding only raises neither,
  because nothing was lost. The code carries **no value, no length and no VR**: two bytes read out of a
  fabricated header are document content, which is how four letters of a surname once reached
  `DICOM_NONZERO_RESERVED_BYTES`.

- **🩺 `{ strict: true }` renders source bytes the warning it replaces deliberately withholds.**
  `PRE-EXISTING`, **disclosed rather than changed**: the escalation raises a `DicomParseError` whose
  `snippet` is 16 raw source bytes read from the file at the warning's own `byteOffset` (D-10), while
  `err.message` stays the frozen registry string. Measured on
  `DICOM_DUPLICATE_FILE_META_ELEMENT`, whose group is never nested and whose offset is therefore
  unambiguously the dropped copy's header: a `(0002,0016)` Source AE Title of `AE-SMITHSON` comes
  back as `02 00 16 00 41 45 0c 00 41 45 2d 53 4d 49 54 48`, five letters of the surname. **Nothing
  more general is claimed, and two graded passes are why**: which element a snippet's bytes belong to
  is **not contracted** anywhere in this package: that offset's frame follows where the element was
  read (file-absolute at the root, relative to the enclosing slice inside a defined-length Sequence or
  Item, into the inflated stream under Deflated Explicit VR LE), while the snippet is cut from
  whichever buffer the parse is holding, so the two can disagree. Do not reason from a code's message to what its snippet holds;
  measure it, and treat every snippet as document content. Redacting `snippet` is a decision about every Tier-3
  fatal in the library, not a rider on a File Meta disclosure, so the **claim** was corrected instead:
  the test block asserting "the diagnostic is not itself a PHI surface" read `warning.message` and
  nothing else, and is now titled for what it proves, with the strict path pinned beside it as the
  residual it is. `ParseOptions.strict` and the "Keeping PHI out of logs" guide now say so where the
  decision is made. Review the two paths separately.

- **🩺 Repeated de-identification was not a fixed point: `(0012,0063)` grew by the whole method
  string on every pass, for any `deidentificationMethod` ending in a SPACE or a NUL**
  (`DICOM-DEIDENT-NOT-A-FIXED-POINT`). **`INTRODUCED` by the entry below and never published** - it
  was found by a fourth graded pass while this release was still held, so no consumer ever saw it.
  Measured in memory over four passes: `"ACME Anonymizer v3 "` read **19 -> 38 -> 57 -> 76** bytes
  and `"Pass A\Pass B "` read **14 -> 21 -> 28 -> 35**, against a flat **19** and **14** on the
  commit before. Over a real `parse -> deidentify -> serializeDicom -> parse` round trip a 16-byte
  method read **16 -> 32 -> 48 -> 64 -> 80 -> 96** over six cycles. Growth continued to the
  65,534-byte ceiling, where the guard **replaces the entire prior provenance chain** - the exact
  loss the entry below exists to prevent, reached from a benign caller string.

  One asymmetry caused it: the prior value was right-trimmed of `0x20`/`0x00` and the added one was
  not, so a freshly supplied value never equalled its own prior copy - the library wrote the method,
  the serializer's even-length pad folded the trailing byte in, the next parse trimmed it off, and
  the next pass appended the method again. PS3.5 2026c **Table 6.2-1**, `LO` row: "A character string
  that **may be padded with leading and/or trailing spaces**" - trailing spaces are padding, not
  content, so the comparison cannot honour that on one side only.

  **The trim is per VALUE at the comparison, and a graded pass is why.** A first remedy trimmed each
  operand as a whole Value Field, which reaches only its last value, so a pad byte on an interior
  value of a `1-n` method still regrew the attribute byte-identically: `"Pass A \Pass B"` beside a
  prior `"Pass B "` read **14 -> 21 -> 28 -> 35 -> 42**, and the chain was still replaced at the
  ceiling. Table 6.2-1 describes a **Value** and `LO` is `1-n`, so every value's trailing pad is
  padding; **§6.4**'s "single padding character ... to the end of the Value Field (**to the last
  Value**)" is about where the encoder writes its pad, which is why the value **written** is trimmed
  once over the field. Leading spaces a caller wrote are still written through untouched. With both,
  `deidentify` is a fixed point **from the first pass**. A `deidentificationMethod` that is padding
  only records nothing.

- **🩺 A prior `(0012,0063)` value surviving into de-identified output is no longer silent**, via
  the new Tier-2 code **`DICOM_DEIDENT_METHOD_PRIOR_RETAINED`** on `report.warnings`. Keeping it is
  what PS3.15 E.1.1 requires and nothing about the retention changes; the silence was the defect. A
  name a sender wrote into `(0012,0063)` reached output stamped `(0012,0062) Patient Identity
Removed = YES` with `report.warnings` empty **and** `report.retained` `[]` - an audit reading as a
  scrub it had not performed, on an attribute Table E.1-1 does not list and no rule in the run
  inspected. The code carries **no value, no length and no VR**: the retained text is the file's
  own, the tag in the message is a constant of the code, and `position.byteOffset` locates the
  element. It is deliberately **not** on `report.retained`, which lists the Annex E option sets
  active for the run - a kept attribute is not an option set, and widening that type would break
  every consumer switching over the nine names. Emitted by `deidentify()` only, so it never reaches
  the parser's `{ strict: true }` escalation.

- **🩺 A second copy of a MODELED `(0002,xxxx)` element left the parsed object with no warning and
  no residue** (`DICOM-FILE-META-DROPS-DUPLICATE`, raised by `#70`'s gate). **`PRE-EXISTING`**, on
  every released version including the current published `0.0.10`. This is `#70`'s shape one group
  over, and **`(0002,xxxx)` is the group that decides how every following byte is read**, which
  makes it the more dangerous of the two. Disclosed now by the new Tier-2 code
  **`DICOM_DUPLICATE_FILE_META_ELEMENT`**, raised at the moment the projection drops the copy.

  **It is lossy by a different route from the Data Set case, and the difference is the whole
  entry.** The File Meta group is collected into an **array**, so nothing is overwritten and
  `DICOM_DUPLICATE_TAG_IN_DATA_SET` never fired here - `#70`'s own JSDoc said exactly that, and
  reading it as an all-clear was the defect. The eight tags `parseFileMeta` projects into typed
  `FileMeta` fields are answered by a **first-match** search and are **excluded** from
  `FileMeta.extraElements`, the verbatim residue that gives the group its byte-exact round trip. A
  second copy of one is therefore in neither.

  **So the two codes resolve a repeat the opposite way round, deliberately, because the two readings
  do: the FIRST copy wins in the File Meta group, the LAST read wins in a Data Set.** Neither
  reading moves in this release, **no value is guessed for the copy that lost**, and no residue is
  invented for it - inventing one would make the serializer write a group it should not. A repeated
  `(0002,xxxx)` tag this library does **not** model stays silent, because every copy of one is
  already kept verbatim in `extraElements` and nothing is dropped. **Two `PRE-EXISTING` bounds a graded pass named, neither closed here**: `serializeDicom` re-emits BOTH copies of such a non-modeled repeat, which is where this package's round-trip promise and its spec-clean promise disagree; and the disclosure covers the group **as the parser delimits it**, so a copy an intermediary appended past an honest `(0002,0000)` group length is never a File Meta element to this parser at all and is relocated into the main Data Set, silently, on this tree and every earlier one.

  **Measured on the published tarball rather than inferred from a version number.**
  `npm pack @cosyte/dicom@0.0.10` (the registry's current `latest`; there is no `0.0.9`), a file
  carrying `(0002,0010)` twice with two **different** Transfer Syntax UIDs:
  `fileMeta.transferSyntaxUID` reads the first, `fileMeta.extraElements` is `[]`, `ds.warnings` is
  `[]`, and `{ strict: true }` does **not** throw. Silent on every channel, on the released package.
  **And the stakes are not hypothetical**: the same dataset bytes with only the ORDER of those two
  UIDs swapped parse to two different objects, one of which raises `INVALID_FILE_META` out of the
  dataset parser, because a length field read in the wrong encoding declares 1,199,696 bytes.

  **The message names no tag, and the bound is the factory signature** -
  `duplicateFileMetaElement(position)` - as for `DICOM_DUPLICATE_TAG_IN_DATA_SET`,
  `DICOM_NONZERO_RESERVED_BYTES`, `DICOM_ITEM_CROSSES_SEQUENCE_END` and
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`. **Unlike the Data Set code, `position.byteOffset` here
  is unambiguously file-absolute** - `parseFileMeta` is called once per parse with the whole buffer
  and the group is never nested, so none of `Element.byteOffset`'s frame ambiguity can reach it - and
  it locates the copy that was **dropped**, not the survivor.

  **The citation, and the one that is deliberately absent.** PS3.5 2026c section 7.1, read from the
  SHA-pinned `vendor/nema/part05/` and occurring **exactly once** in that document: "The Data
  Elements in a Data Set shall be ordered by increasing Data Element Tag Number and shall occur at
  most once in a Data Set." **PS3.10, which governs the File Meta Information group, is NOT vendored
  in this repo, so no PS3.10 sentence is cited here and no conformance verdict about a repeated
  `(0002,xxxx)` is claimed.** The code's trigger is narrower and needs neither: it fires exactly when
  a value the file carried does not reach the parsed object, and a `{ strict: true }` caller has
  asked to be thrown at rather than handed a lenient reading.

- **🩺 `deidentify()` REPLACED `(0012,0063)` De-identification Method where PS3.15 says it is
  "inserted in or added to" it** (same item, second half). **`PRE-EXISTING`**, measured on `0.0.10`:
  a file recording `"ACME Anonymizer v3 Basic Profile"` came out of `deidentify()` recording only
  this library's own method, with the earlier one gone and nothing saying so. What that destroyed is
  the **provenance chain** the attribute exists to carry, on a file whose earlier pass may be the one
  a recipient was relying on.

  PS3.15 2026c section **E.1.1 "De-identifier"**, read from the SHA-pinned `vendor/nema/part15/` and
  occurring **exactly once**: "a text string describing the method used shall be **inserted in or
  added to** De-identification Method (0012,0063)." Replacing is neither verb. This release appends
  its own text as a further value of the `1-n` attribute after a `\`, copying the prior bytes through
  **verbatim** so a value encoded under a `(0008,0005)` repertoire survives byte for byte. A value
  that already records this method is left alone rather than growing the attribute. **The comparison
  is per VALUE on both sides**: the method string is itself a `1-n` value, and a graded pass refuted
  the draft that compared the whole string against each prior value - a caller method carrying a `\`
  never matched one, and every pass appended a whole further copy (29 -> 59 -> 89 -> 119 bytes over
  four passes, against a flat 29 on base). **Per value was necessary and not sufficient, and the
  fixed-point claim as first written did not hold** - see the trailing-pad entry below, which is what
  makes it true from the first pass.

  **The join is bounded, and the bound is not cosmetic.** `LO` is a short-form VR, so
  `encodeDatasetElement` writes its Value Length with a 16-bit field. A `(0012,0063)` carrying a legal
  65,534-byte chain of `1-n` values - exactly the provenance chain this feature exists to build -
  parses with no warnings, and an unbounded append produced a 65,611-byte value that `serializeDicom`
  could not encode: a raw `RangeError` out of Node's `Buffer` internals, outside the documented
  `DicomSerializeError` surface, taking the whole de-identified object down. When the join would
  exceed the ceiling the prior value is **replaced** instead, which is what every released version did
  on every file, and `report.warnings` carries the new `DICOM_DEIDENT_METHOD_NOT_ADDED`, so THAT
  fallback is disclosed. Read the code as "the length ceiling was reached", never as "every fallback
  is disclosed": the `PRE-EXISTING` non-`LO` replacement below is a second shape where `deidentify`
  cannot add, and it is still silent. Truncating the sender's earlier records instead was refused: choosing
  which to drop is a policy the standard does not state.

  **`(0012,0062)` Patient Identity Removed is still REPLACED with `YES`, and the asymmetry is the
  standard's own**: the sentence immediately above it, in the same list, says it "shall be **replaced
  or added to** the Data Set with a value of YES". Different verbs, different attributes.

  **The cost is disclosed rather than glossed, and a residual test asserts it.** `(0012,0063)` is
  **not in Table E.1-1**, so the Basic Profile never acted on it and the incoming value reached the
  insertion point untouched - the replacement was the only thing removing it, and removing it was an
  action no profile asked for. A sender who wrote something identifying into `(0012,0063)` now sees
  that text in de-identified output, which is the retained-by-omission posture every other unlisted
  attribute already has. **Closing that direction is a product call about unlisted attributes, not a
  fix to this insertion.** A `(0012,0063)` a file encoded under a VR other than `LO` is replaced
  rather than appended to.

  **The evidence, with its sha, because the base moves.** Re-measured at `e75fb38` after the last
  test was added - and again after each conformance-gate remedy added more, which is the rule
  and not a courtesy: **8 of the 12** tests in `test/integration/file-meta-duplicate.test.ts` and
  **11 of the 19** in `test/deident/deident-method-add.test.ts` run red against that base, 19 of 31
  in all. **Neither file can link against base `src/`** - none of
  `WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT`, `duplicateFileMetaElement`,
  `WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED` or `deidentMethodNotAdded` exists there - so both
  figures are measured with those symbols substituted for their literals; unmodified they are 12 of
  12 and 19 of 19 by construction, which is a fact about linking rather than about behaviour. The
  ones that stay green on base are the controls that make the rest non-vacuous. **A figure taken this way is substitution-sensitive and the third pass read 9 rather than 8**, the delta being the factory-signature row, which is red or green purely by how the absent factory is stood in for. Read it as a floor, and re-derive it rather than quoting it. Quote such a figure
  only with the sha it was run on.

- **🩺 A Data Set that carries one tag twice DESTROYED the first element's value at parse time, and
  said nothing** (`DICOM-TAG-COLLISION-DESTROYS-ELEMENT`). **`PRE-EXISTING`**, on every released
  version including the current published `0.0.10`. A parsed Data Set is a `Map<Tag, Element>`, so
  `Map.set` on a tag the map already holds **overwrites in place**: the earlier element's value is
  gone from the object, and the survivor is indistinguishable from an element the sender wrote once.
  No warning, no report entry, nothing a reader could query and nothing a round trip could reveal -
  which is the same harm as a leak, in the other direction. It is now disclosed by the new Tier-2
  code **`DICOM_DUPLICATE_TAG_IN_DATA_SET`**, raised at the moment of the replacement, in every Data
  Set at every depth.

  **Measured on the published tarball rather than inferred from a version number.**
  `npm pack @cosyte/dicom@0.0.10` (the registry's current `latest`; `npm view` is the only source
  for that, and there is no `0.0.9`), an Explicit VR LE file carrying `(0010,0020)` twice:
  `ds.get("00100020")` reads the **second** value, `ds.warnings` is **empty**, and `{ strict: true }`
  does **not** throw. Silent on every channel, on the released package.

  **The remedy is the disclosure and nothing else.** The reading does not move: the last element read
  still wins, exactly as in every released version, and **no value is invented for the one that was
  replaced**. That is deliberate rather than modest. A file whose Item over-declares and a file whose
  Sequence under-declares are byte-identical (pinned by `Buffer.equals` in
  `test/integration/explicit-sq-item-bound.test.ts`), so a reader cannot choose the "right" element
  from the bytes; what it can do is say that it had to choose.

  **Citations, traced rather than stated.** PS3.5 2026c section 7.1 "Data Elements": "The Data
  Elements in a Data Set shall be ordered by increasing Data Element Tag Number and shall occur at
  most once in a Data Set." Section 7.5.1 "Item Encoding Rules", one level down: "Within the context
  of each Item, these Data Elements shall be ordered by increasing Data Element Tag value and appear
  only once." Both read from the SHA-pinned `vendor/nema/part05/`, each occurring exactly once in
  that document. **So this code cannot fire on a conformant file**, which is what makes it safe to add
  under the `{ strict: true }` escalation every Tier-2 code takes.

  **The message names no tag, and that is specific to this code.** A sender writing the same tag twice
  is the rare route; the ordinary one is a length field that lies, so the second header's four tag
  bytes are read out of the middle of some element's value. `renderTag` shape-checks a tag and
  therefore cannot refuse one, so the bound is the factory signature, as it is for
  `DICOM_NONZERO_RESERVED_BYTES` and `DICOM_ITEM_CROSSES_SEQUENCE_END`. `position.byteOffset` is the
  offset of the header that replaced, which is the surviving element's own `Element.byteOffset` -
  so at the **root** the tag is read off the model rather than out of a message. **Inside a
  defined-length Sequence Item it is not a lookup at all**: `Element.byteOffset` is item-relative
  there, so the same number can name an untouched root element, and no parser warning populates
  `position.contextPath` to tell them apart. Read the code as "an element in this object was
  destroyed" unless you have established the frame.

  **What this cost, measured on `scripts/measure-sq-bound-grid.ts` against `0ead071`, because a
  disclosure that changes a `{ strict: true }` parse is a behaviour change.** Of 83,037 cells, **349
  differ and every difference is confined to the warning channels and `{ strict: true }`**: 0 cells
  differ in the element tree, the `DeidentifyReport`, the de-identified bytes, which marker values
  survive, or the root `(0010,0020)`; 0 new lenient fatals; leaking cells 11 -> 11; conformant tiling
  controls 7 -> 7. **345 cells now report a collision that was silent on base** (295 Implicit VR LE,
  25 Explicit VR LE, 25 Explicit VR BE), all of them in the grid's two hoist-collision families -
  a fact about those fixtures, not a rate for real files. **9 cells that parsed under
  `{ strict: true }` now throw** - element trees, reports, root identifiers and surviving markers
  identical on both trees, taken from those per-field counters and **not** from the harness's
  `...on an UNCHANGED lenient reading` line, which reads 0 by construction for any slice that adds a
  code. A further **4** were already fatal there and now carry this code instead of
  `INVALID_FILE_META`, because the escalation happens earlier in the parse. The shipped
  `profiles.strict` preset is unchanged.

  **Three more things a `{ strict: true }` caller should know, none of them fixed here.** (1) On the
  one shape where the parse rolls a descent back - an Implicit VR LE defined-length `SQ` whose value
  holds a duplicate and then a non-Item tag - `{ strict: true }` threw `DICOM_SQ_NOT_DESCENDED`
  before and throws this code now, on a file where **nothing was destroyed**: both values survive in
  `Element.rawBytes`. Both refuse the file, so no object is lost, but the older code was the more
  accurate diagnosis. (2) The same shape streams the code to `onWarning` while `ds.warnings` never
  receives it, which is the pre-existing D-03 ordering reached by one more code. (3) **"Names no tag"
  is about the message.** Strict mode throws a `DicomParseError` whose `snippet` is 16 raw source
  bytes at that offset, rendered as hex - measured on a plain duplicate:
  `10 00 20 00 4c 4f 0e 00 53 4d 49 54 48 53 4f 4e`, the withheld tag plus eight bytes of the value.
  That is the package-wide D-10 design. The same file does not throw at all on `0ead071` (this code is
  what refuses it), but the same file with its even-length padding removed produces the identical 16
  bytes there through `DICOM_ODD_LENGTH_VALUE_PADDED`, one length byte apart - which is why the
  guarantee is worded about the message rather than about the channel.

  **What the grid is NOT evidence for here, stated because it was read that way once.** It reaches
  the collision only through a length lie, and it swept nothing that carries a tag twice honestly.
  The plain duplicate, the duplicate inside an Item, the collision that lands on a sequence's own tag
  and takes the whole `SQ` and everything nested in it out of the object, the frame the byte offset
  is in, and the `{ strict: true }` behaviour are pinned in
  `test/integration/tag-collision.test.ts` or nowhere: **14 of its 15 tests run red against
  `origin/main` at `0ead071`** - re-measured after each gate pass added tests, and written with its sha
  because the figure moves with every test added - the fifteenth being the no-duplicate
  control, which is green there by design.

  **Still open, and not touched here:** the private-`SQ` carve-out (`DICOM-PRIVATE-SQ-CARVE-OUT`),
  and the structural relocation itself under `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` - an
  over-declaring Item still moves the element that follows the sequence. This slice makes the loss
  observable; it does not make the file readable.

- **🩺 The mirror of the above: a private value ejected OUT of a Sequence Item was retained on a
  reservation it borrowed from the Data Set it landed in, in output stamped
  `PatientIdentityRemoved = YES` with `report.removedPrivateTags` reading `[]`**
  (`DICOM-ITEM-EJECT-ROUTE`). **`PRE-EXISTING`**, found by `#66`'s pass-2 `conformance-refuter`,
  pinned by `#66` as residual tests that asserted the leaking behaviour, and re-measured on
  `300af87` before anything changed. The **private-`SQ` carve-out** is still open (below). Read this
  as "the eject direction is refused", never as "the class is closed".

  **Measured on the published tarball, not inferred from a version number.**
  `npm pack @cosyte/dicom@0.0.10` and the Explicit VR LE eject fixture:
  `report.removedPrivateTags` is `[]`, `SECRET-PRIVATE-PHI` is in the serialized output,
  `(0012,0062)` is `YES`, **`ds.warnings` is empty and `{ strict: true }` does not throw**. So on the
  released package this route is silent on every channel, exactly as the item filed it.
  **`0.0.9` is NOT on the registry** - `package.json` carried it, the publish never happened
  (npm `E404`), and the current published version is `0.0.10`. Earlier entries in this file that say
  "live on the published `0.0.9`" name a version that does not exist.

  **On `main` it is no longer silent, and that difference is `#51` being unreleased.** With
  `DICOM_ITEM_CROSSES_SEQUENCE_END` present, the Explicit VR shapes announce themselves on both
  channels and throw under `{ strict: true }`; the Implicit VR LE shape raises the older
  `DICOM_SQ_NOT_DESCENDED` and throws too. The leak was live beside those warnings, which is the
  point: a warning about structure is not an all-clear about what was retained.

  **The shape.** An `(FFFE,E000)` Item that declares **fewer** bytes than its content occupies ends
  early, so the elements the sender encoded as Item content are read as elements of the **enclosing**
  Data Set. A Private Creator that lands there reserves a `(gggg,00EE)` block for elements the sender
  never put beside it, and the next private element is kept verbatim on it. **It is not
  root-specific**: an inner sequence ejecting a creator into the still-usable Item that encloses it
  reproduces the same leak one level down, and a root-scoped remedy would read green on it.

  **Two predicates, because the parser records the same contradiction two different ways, and this is
  why it is its own slice rather than a widening of the absorb rule.** Under **Explicit VR** the item
  stream is bounded against the buffer, so it is read past the sequence's declared end and the span
  shows up as `Element.rawBytes.length` exceeding `Element.length`. Under **Implicit VR LE** that path
  slices the item stream to the declared Value Length, so **nothing over-runs at all**
  (`rawBytes.length === length`); the item does not fit the slice, the descent is refused, and the
  element carries `items === undefined` with `DICOM_SQ_NOT_DESCENDED`. Both are facts the parser had
  already recorded: no re-parse, no scan, no cost that follows an attacker-chosen length. **The second
  predicate is broader than the ejection it is here for, deliberately and in the fail-safe direction**
  - it says the parser could not walk the sequence, which another unwalkable item stream also reaches.

  **The remedy is positional, inside every Data Set, and it removes rather than downgrading the
  stamp.** `settledBound` finds where a Data Set stops accounting for its own membership: the first
  sequence whose own contents contradict its declared extent. Both the reservation map and the
  retention decision are taken from the settled run, so a creator ejected into a Data Set reserves
  nothing there and a private element read after that point is removed and named in
  `report.removedPrivateTags`. An element read **before** the offending sequence cannot have come out
  of it and is untouched. `processElements` derives this at every depth. **No parser file is touched
  and no reading changes.**

  **🛑 TWO BOUNDS, NOT ONE, BECAUSE A DATA SET IS A `Map<Tag, Element>`.** When the ejected element
  carries a tag the Data Set **already holds**, `Map.set` overwrites in place and the newcomer
  inherits the earlier element's **position**, ahead of the sequence it came out of. An index cut
  alone reads it as settled and retains it: measured on a root holding a genuine
  `(0009,0010)` + `(0009,1001)` reservation ahead of a sequence whose item ejects a second
  `(0009,1001)`, which lands at index 2 with `byteOffset` 274 while the sequence sits at index 3 with
  `byteOffset` 238. `Element.byteOffset` is the position the parser counted and the overwrite cannot
  move it, so it is checked beside the index; the two are conjunctive because a hand-built
  `Dataset` may carry no meaningful offsets at all, and there the index bound is what still
  bites. **The grid is blind to this: the index-only and two-bound remedies differ on 0 of 83,037
  cells**, because no `priv|` fixture collides tags. **3 tests, counted over the full suite, are the
  whole pin**: the two collision rows and the creator-flip. Both offsets above are measured on the fixture pinned in `test/integration/deident-private-reservation.test.ts`, whose File Meta is the minimum **this parser** requires rather than PS3.10's - a fixture with more File Meta shifts every offset, and a pass-2 grade read 292 off one that did.

  **🩺 AND THE COLLISION DESTROYS THE ROOT'S OWN VALUE ON THE WAY IN, WHICH THIS SLICE DOES NOT FIX.**
  The overwrite replaces the reservation's genuine root element with the Item's, silently, at parse
  time, with no warning naming it and no report entry - the `Map<Tag, Element>` substitution already
  recorded for `(0010,0020)`, now reached on the private-retention path. `PRE-EXISTING`, identical on
  both trees, **its own item**, and asserted in the tests so it cannot be mistaken for something this
  remedy handled.

  **The spec does the work, and both sentences were re-located in the pins rather than carried
  forward.** PS3.5 2026c §7.8.1, one occurrence in `vendor/nema/part05/4dfd7b8c…`: "Items within a
  sequence are self contained Data Sets ... The scope of the reservation is just within the Item.
  Items do not inherit the Private Data Element reservations made by Private Creator Data Elements in
  the Data Set in which the Item is nested." So the reservation's scope **is** the Item's boundary,
  and a file that contradicts itself about where that boundary falls establishes no knowledge of which
  Data Set an element is in. PS3.15 2026c §E.3.10, one occurrence in
  `vendor/nema/part15/77d60b85…`: "Private Attributes that are known by the de-identifier to be safe
  from identity leakage shall be retained, together with the Private Creator IDs that are required to
  fully define the retained Private Attributes; all other Private Attributes shall be removed **or
  processed in the element-specific manner recommended by Deidentification Action (0008,0307), if
  present within Private Data Element Characteristics Sequence (0008,0300)**" - a two-branch clause,
  quoted whole; this library does not implement `(0008,0307)`, so removal is the branch available to
  it, and **"known"** is the load-bearing word.

  **The price is measured, not asserted.** `scripts/measure-sq-bound-grid.ts` over **83,037** cells
  against `300af87`: `priv: kept at ROOT, file CONTRADICTS` **78 -> 0**, of which the eject leaks
  (`...whose honest control does NOT keep it`) are **22 -> 0** and the remaining **56 are the cost** -
  root retentions on self-contradicting files whose honest control does keep the value. **That cost
  has its own column and it is named rather than folded in: `de-identified OUTPUT lost a marker
(cost)` reads 78**, which is the de-identify-boundary column; the `LOST` and `GAINED a marker value`
  counters beside it are **parse**-tree columns and both read 0, and quoting those two without this
  one is exactly the confusion this repo has paid for before. Retention on files that do **not**
  contradict themselves is unchanged (**9 -> 9** at the root, **6 -> 6** inside an Item),
  `no-creator` rows stay **0 -> 0**, `LEAKING a source value` is **11 -> 11** (the binary-carrier
  residual, untouched), `conformant tiling control emptied` **7 -> 7**, and **0 cells differ in any
  PARSE respect, 0 cells whose READING differs**, 0 new lenient fatals, 0 new strict fatals, 0 wrong
  root `(0010,0020)`, 0 reports losing an attribute. **118 cells changed, every one of them in the
  `priv|` family: 74 Implicit VR LE and 44 Explicit VR.** (`structural` also reads 118 by construction
  - it counts any record difference, including the de-identify columns, so it is not a reading claim.)

  **🛑 THE HARNESS COULD NOT REPORT THAT SPLIT AND NOW CAN.** `--diff` classified a cell's transfer
  syntax by testing whether its key _starts with_ the syntax, which is true only of the sequence
  sweep; the `carrier|`, `legit|` and `priv|` families put their own prefix in that position, so
  **not one of their rows could ever be counted as Implicit VR LE**. This slice's 74 Implicit VR LE
  cells were reported as `Implicit VR LE 0`. `transferSyntaxOf` fixes it, which also moves
  `onWarning != ds.warnings, Explicit VR` from 43 to **0** - those 43 were Implicit VR LE rows in
  other families, i.e. the pre-existing D-03 ordering residual, misattributed. **Any syntax split
  quoted off that line for a slice touching those three families predates this fix; re-run the diff
  rather than carrying the figure forward.**

  **The whole-Data-Set variant was built and measured rather than argued about, and the grid cannot
  tell it apart.** Refusing every private element in a Data Set that _contains_ a disputed sequence
  produces a **byte-identical** grid diff (0 of 83,037 cells differ from what shipped), because every
  `priv|` fixture writes its private block after the sequence. **It differs on exactly 5 tests,
  counted over the full suite rather than one file**, and they are why it is not taken: it reds "a
  root reservation the sender wrote at the root survives an over-running sequence" and both collision
  tests, all three of which are genuine root reservations the sender wrote ahead of the disputed
  sequence, and it also closes **both** private-`SQ` carve-out residuals, which belong to a different
  item - the second of them in `test/integration/deident-unauditable-sequence.test.ts`, which a
  per-file enumeration misses. **The tests are the pin for the positional cut, not the grid.**

  **What is NOT closed, and is not asserted away.** The **private-`SQ` carve-out**: `keepsPrivate`
  decides before `descendSequence`, so a private `SQ` inside the settled run that the profile vouches
  for is kept **verbatim** and nothing inside it is examined. `PRE-EXISTING`, still pinned as a
  residual test that asserts the leaking behaviour. And the `Map<Tag, Element>` substitution above.

  **The base measurement, taken fresh rather than carried forward:** **8 of the 37** tests in
  `test/integration/deident-private-reservation.test.ts` run red against `origin/main`'s `src/` at
  `300af87`, and they are exactly the eight eject tests. The remaining private-`SQ` residual is
  **green** on that base, by design. **The "10 of the 31" figure and the "both residual tests are red
  against base" correction beside it are both retired**: the first was measured against a pre-`#66`
  tree, and the second is false against today's `main`, because `DICOM_ITEM_CROSSES_SEQUENCE_END` has
  been on `main` since `79e9f34`.

  **No new public surface, deliberately** - no Tier-2 code, no report field, no snapshot change, the
  same choice `#66` made. `report.removedPrivateTags` already names every removed tag and is the
  channel this defect read `[]` on.

- **🩺 A private value crossed the PS3.5 §7.8.1 reservation boundary and was retained under
  `RetainSafePrivate`, in output stamped `PatientIdentityRemoved = YES`.** The **absorb** direction
  is closed; the **eject** direction and the private-`SQ` carve-out were measured, pinned and **not**
  closed by this entry. (The **eject** direction has since been closed by `DICOM-ITEM-EJECT-ROUTE`,
  the entry above; the private-`SQ` carve-out is still open.)
  (`DICOM-PRIVATE-CREATOR-RESERVATION-LEAK`). **`PRE-EXISTING`**; found by `#51`'s pass-6
  `conformance-refuter` and measured **identical on `origin/main`**, so it was never introduced by
  that branch. (This entry said "live on the published `0.0.9`". **`0.0.9` was never published** -
  `package.json` carried it and the publish never happened, npm `E404`. The leak is measured on the
  published `0.0.10` tarball.)

  **The shape.** An `(FFFE,E000)` Item that declares more bytes than its enclosing `SQ` element's
  Value Length allows reads past the end of its sequence and absorbs the element that followed it.
  With a Private Creator in the Item's genuine content and the private data element written at the
  **root** - where no creator reserved its block, so the Basic Profile removes it - the absorbed
  element lands beside that creator and is kept verbatim. Measured on `164eb39`, Explicit VR LE and
  BE, `deidentify(ds, { retain: ["RetainSafePrivate"], profile: profiles.ge })`:
  `report.removedPrivateTags` is `[]`, `SECRET-PRIVATE-PHI` is in the serialized output,
  `(0012,0062)` is `YES`, and **the file parses with no warning on either channel**. A stamp that
  outruns the redaction is the worst shape this class has, because a consumer trusting it has no
  signal at all.

  **The remedy is at the de-identify boundary and it removes; it does not downgrade the stamp.**
  PS3.5 2026c §7.8.1, read from the vendored pin (`4dfd7b8c…`), one occurrence in the document:
  "Items within a sequence are self contained Data Sets ..., any Item in the sequence that contains
  Private Data Elements shall also have Private Creator Data Element reserving a block of Elements
  for those Private Data Elements. The scope of the reservation is just within the Item. Items do
  not inherit the Private Data Element reservations made by Private Creator Data Elements in the
  Data Set in which the Item is nested." The reservation's scope **is** the Item's boundary, so a
  file that contradicts itself about where the Item ends does not determine which reservation
  covers an element. PS3.15 2026c §E.3.10 "Retain Safe Private Option": "Private Attributes that
  are known by the de-identifier to be safe from identity leakage shall be retained, together with
  the Private Creator IDs that are required to fully define the retained Private Attributes; all
  other Private Attributes shall be removed **or processed in the element-specific manner recommended by Deidentification Action (0008,0307), if present within Private Data Element Characteristics Sequence (0008,0300)**". **The clause licenses two dispositions and the
  first draft of this entry closed the quote at "removed"**, reading a permissive clause as an
  absolute; this library does not implement `(0008,0307)`, so removal is the branch available to it.
  Nothing there is _known_, so the standard's own
  default applies. Every private element **the recursion reaches** in such an Item, and at every
  depth below it, is removed and named in `report.removedPrivateTags` - **with one carve-out, stated
  in the sentence rather than only in a later paragraph**: a private `SQ` the profile vouches for is
  settled before the descent and is kept verbatim (see below).
  **The unit is the SEQUENCE, not the individual Item**: `descendSequence` decides once and
  applies it to every item, so a two-item sequence where only item 1 over-runs also loses a genuine
  block in the honest item 0 (measured and pinned; the grid sweeps single-item fixtures, so that
  extra cost is NOT inside the priced 20).
  **The unit is the SEQUENCE, not the individual Item**: `descendSequence` decides once and
  applies it to every item, so a two-item sequence where only item 1 over-runs also loses a genuine
  block in the honest item 0 (measured and pinned; the grid sweeps single-item fixtures, so that
  extra cost is NOT inside the priced 20).

  **It is NOT a parser bound, and no reading changes.** An over-declaring Item and an
  under-declaring Sequence are byte-identical - `#51` reached that conclusion three times and its
  refuter could build no predicate separating them. `scripts/measure-sq-bound-grid.ts` over
  **83,037 cells** against `164eb39`: **0 cells differ in any PARSE respect**, **0 cells whose
  READING differs** (a new counter; the existing parse-respect count folds both warning channels
  in), 0 new lenient fatals, 0 new strict fatals, 0 markers lost or gained from the parsed object,
  0 wrong root `(0010,0020)`, 0 reports that lose an attribute, and **0 Implicit VR LE cells
  changed** - a free control, because that path slices the item stream so no Item can over-run.

  **The fail-safe-direction argument `#51` made in five artifacts is RETRACTED, not reworded.** The
  direction is not a property of the two readings; it is a property of **where the sender put the
  Private Creator relative to the disputed bytes**. Both **absorb** placements are pinned by tests
  and both are refused now: the creator inside the Item with the data element absorbed in, and the
  data element inside the Item with the creator absorbed in. The **eject** placement is pinned as a
  residual and is not refused.

  **The price, measured rather than asserted.** The grid gained a `priv|` family - the first
  population in that harness that runs `RetainSafePrivate` at all, which is why three earlier
  refuter passes read "0 PHI regressions" off it while this was live. **58 -> 0** cells keep a
  private value inside an Item on a self-contradicting file, and **20 of those 58 were not leaking
  anything**: the creator and the data element were both genuine Item content and the reservation
  was real. They pay for the guarantee, because nothing on the wire distinguishes them. Retention on
  a file whose length fields agree is **unchanged** - 6 -> 6 inside an Item, **9 -> 9** at the root -
  and 0 -> 0 rows are kept with no creator in scope, on either tree.

  **🩺 Two routes are NOT closed, found by the pass-1 `conformance-refuter` grade.** Both are
  `PRE-EXISTING`, reproduce identically on `164eb39`, and both produce the same false attestation
  (`removedPrivateTags: []`, the value in the output, `(0012,0062) = YES`).
  **(a) The eject direction.** An Item that _under_-declares pushes its trailing elements **out**
  into the enclosing Data Set, which is not narrowed, so a Private Creator that lands there reserves
  a block for elements the sender never gave it. **It is NOT root-specific and an earlier draft of
  this entry said it was** - pass 2 reproduced it one level down, where an inner sequence ejects a
  creator into the still-usable enclosing Item. The item filed for this must be scoped to every
  still-usable Data Set or it will be built to the wrong bar. **It was silent on every channel and
  under `{ strict: true }` when this shipped, and `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` changed
  that on the Explicit VR shapes and nowhere else, so do not carry the old sentence forward.**
  Re-measured on this residual's own fixture: `DICOM_ITEM_CROSSES_SEQUENCE_END` on both channels and
  a throw under `{ strict: true }`, beside an entirely unchanged leak (`removedPrivateTags: []`, the
  value in the serialized output, `(0012,0062) = YES`). That warning is now the only signal on a file
  whose de-identification audit is false, and it is never an all-clear. The 20 Implicit VR LE cells
  stay silent: that path slices the item stream, so no over-run is recorded. **22 grid cells.** The widening was **built
  and measured**: narrowing the flag whenever a Data Set _contains_ an over-running sequence costs
  **24** root retentions and closes **2** of the 22, because the other 20 are Implicit VR LE where
  the sequence records no over-run at all. A different mechanism, and its own item.
  **(b) The private-`SQ` carve-out.** `keepsPrivate` decides **before** the descent, so a private
  `SQ` the profile vouches for is kept **verbatim** and this rule is never consulted inside it. The
  first draft of this entry said "every private element in such an Item ... is removed",
  unconditionally, which is `#54`'s exact refusal repeated; the sentence is corrected rather than the
  guard widened. Both routes are pinned as **residual tests that assert the leaking behaviour**, so
  they go red when fixed.

  **No new public surface**: no new warning code, no new report field, no snapshot change. The
  action is already visible on `report.removedPrivateTags`, the channel this defect read `[]` on.
  What is _not_ on any channel is the reason - a caller sees which private tags went, not that the
  file contradicted itself. Disclosed rather than closed, because a new Tier-2 code would also have
  to answer to `profiles.strict` escalation and to the per-element amplification bound `#48`
  established.

- **An unrecognized Explicit VR was read short-form, contrary to PS3.5 2026c §6.2's normative
  "shall"** (`DICOM-UNRECOGNIZED-VR-SHORT-FORM`). It is now read - and written - long-form. **This
  is a behaviour change on the read path**, and the trade is measured below rather than asserted.

  **The clause, read from the vendored `vendor/nema/part05` pin (`4dfd7b8c…`), one occurrence in the
  document.** §6.2 "Value Representation (VR)": "All new VRs defined in future versions of DICOM
  **shall** be of the same Data Element Structure as defined in [§7.1.2] with reserved bytes after
  the VR and a 32-bit unsigned integer VL (i.e., following the format for VRs such as OB or UT), and
  may or may not permit Undefined Length." §6.2's **note** about an implementation choosing to
  ignore unrecognized VRs is informative, and is deliberately not what this rests on.

  **What a conformant future-VR file used to do: no sentence, deliberately.** Four attempts have
  now been made to summarize that in one sentence and all four were wrong, the fourth by the first
  draft of this entry. It is **shape-specific**: the short-form read took the carrier's length from
  the two bytes §7.1.2 reserves (`0x0000`), got a zero-length value, and resumed inside the 32-bit
  VL field - so what happened next depended on the payload's own bytes. Sometimes a whole-object
  `INVALID_FILE_META`; sometimes a **clean parse into a tree the sender did not write**, with a
  zero-length carrier plus an element manufactured out of the payload and, under Explicit VR BE,
  **no warning on either channel**. `scripts/measure-unrecognized-vr.ts` is new here and prints the
  per-shape table for both trees, including that case (`long-payload-tiles`). **Add a shape rather
  than writing a summary.**

  **What changed, and what deliberately did not.** `readExplicitElementHeader` and the File Meta
  element reader take the 12-byte header for any VR outside the 34 this edition defines;
  `serializeDicom` writes one. Everything after the header read is untouched - the same value read,
  the same "declared length exceeds the remaining buffer" refusal, and the same undefined-length
  refusal that `OB` / `UT` / `UN` already take. **This is one more VR class routed into an existing
  bound, not a new bound**, which is the distinction four refusals in this family were about. No new
  warning code was minted: a §6.2-conformant file is not something to warn about, and a new Tier-2
  code would throw under `{ strict: true }` on exactly such a file.

  **The reader and the writer had to move in one commit.** The short form's length field is 16 bits.
  With the reader fixed alone, a 70,000-byte unrecognized-VR value would have been re-emitted
  declaring **4,464**, silently. Pinned by a round-trip test at that size.

  **The trade, on `scripts/measure-sq-bound-grid.ts` against `66f0c95` (76,611 cells).**
  **1,221 recovered** (fatal before, parse now) against **932 newly refused**; 0 PHI regressions;
  0 cells where the root `(0010,0020)` changes value; 0 reports that lose an attribute on a cell
  that still parses; **0 Implicit VR LE cells changed at all** (a free control - there is no on-wire
  VR there); leaking cells unmoved at 11 (`DICOM-BINARY-CARRIER-OVERDECLARE`, untouched here).
  **All 932** of the newly refused had an unrecognized VR in their `66f0c95` parse tree, so every
  file this refuses is one the old reader only "read" by manufacturing a Data Element header out of
  the middle of somebody's value; the fabricated VRs across that population include `"CT"` - a
  Modality value read as a VR.
  The grid also reads **0 cells that parse on both trees and read differently**. Read that as a
  statement about the grid's fixtures, **not** as "nothing is silently re-read": the
  `long-payload-tiles` shape is exactly such a cell and it is outside anything the grid sweeps.
  **The mirror shape is the honest cost**: a sender that ignores §6.2 and writes an unrecognized VR
  in the 8-byte short form produced a readable object before and is refused now. That is pinned by a
  test rather than left to be discovered.

  **`deidentify()` is unchanged, and one of its claims was not.** The rule that empties an element
  whose VR is not one of the 34 still fires - reading a header is not the same as knowing what its
  value means, and Table E.1-1 acts per attribute. **Disclosed, not fixed**: it is the same
  over-redaction trade the un-auditable-sequence rule makes, and re-deciding it is a product call.

  **`#55` published "on a file conformant to PS3.5 2026c the cost is zero". It was never true**, and
  no replacement account of the old reader belongs here: three were written while this entry was
  drafted and the gate refuted all three. The harness prints what each shape does on each tree, and
  the shape that refutes the shortest version of the story is a row in it
  (`long-payload-tiles-future-vr`). **Add a shape rather than a sentence.**

  **`DICOM_NONZERO_RESERVED_BYTES` no longer names a tag, and that is a PHI fix this slice owed.**
  Reading an unrecognized VR long-form means landing on the two bytes §7.1.2 reserves, so this code
  is newly reachable on a **fabricated** header - one built out of the middle of somebody's value.
  Its message interpolated the four bytes it would call a tag: measured on an `ST` carrier holding
  `"MR BRAIN  SMITHSON"` under-declared by 6, it streamed `Element (54495348) …` - the bytes
  `"ITHS"` in wire order, four letters of the surname - where `66f0c95` emitted nothing naming that
  element on the same file (its only warning there is `DICOM_ODD_LENGTH_VALUE_PADDED`, on a genuine
  `(0010,0010)`). (Quote the payload **with** its tag: `"MR BRAIN SMITHSON "` produces `48544F53`
  instead, and an earlier draft of this entry paired the two wrongly.) **The factory now takes no
  tag parameter**, so the bound is the signature rather than a branch, and `position.byteOffset`
  locates the element. This is exactly the remedy `#55` paid a blocker for in
  `report.undefinedVrElements[].tag`, and the reason is the same: where the trigger is "these bytes
  are not what they claim to be", `renderTag` checks shape and cannot refuse them. It also closes a
  `PRE-EXISTING` instance on the same factory - a long-form VR fabricated the same way rendered its
  tag on `66f0c95` too. Pinned with a name-bearing fixture and a non-vacuity assertion that the code
  really fires.

  **A second `DeidentifyReport` claim corrected rather than widened.** The report was described as
  "value-free apart from `uidMap`". `removedPrivateTags` is a second exception: its entries are four
  source bytes each, and on a malformed file those bytes can be document content. Measured
  identically on **both** trees - an `OB` carrier holding `"SECRET-NOTE-"` followed by a well-formed
  odd-group header reports `["41534342"]`, whose wire-order bytes read `"SABC"`. Reporting the tag
  is the whole audit value of the field on a well-formed file, so it is documented as PHI rather
  than withheld; narrowing it is a product decision that has not been made.

- **A test asserted the machine it ran on rather than the code, and the script suites paid a
  process start they did not need** (`PARSER-TESTTIMEOUT-ASSERTS-AN-IDLE-BOX`). This is a trim plus
  two deletions and nothing else. Test and test-configuration only: no source, parser, de-identify,
  serializer or public API change, and no number in this package moves.

  **The trim.** Three suites spawned this repository's own TypeScript scripts through `tsx`. Node
  strips types natively, so that process start bought nothing and was paid on every invocation.
  They now go through `test/helpers/run-script.ts`, which runs them under `node`, measured with
  byte-identical stdout and the same exit code from both runners. The suites are measurably faster;
  no ratio is quoted here, because independent re-takes on one box do not agree with each other and
  the gap moves with the workload as well as the box.

  **The one script that cannot make that move, pinned rather than asserted.**
  `scripts/generate-annex-e.ts` imports `"../src/dictionary/repeating-groups.js"`, and Node's ESM
  resolver will not rewrite that `.js` specifier onto the `.ts` file; under `node` it exits 1 with
  `ERR_MODULE_NOT_FOUND` at module resolution, before it opens a byte of DocBook or touches the
  tracked `SHA.txt` this suite otherwise rewrites. It stays on `tsx`, and a new test asserts that
  failure **by name**, so the carve-out goes red the day Node can resolve the specifier rather than
  quietly outliving its reason. The rule and its single exception are stated once, in
  `run-script.ts`, rather than copied into each suite: the sibling generator imports nothing from
  `src/` and was measured green under `node` with byte-identical output, so the carve-out is one
  script and not "the generators".

  **Deletion one: a stopwatch that was already a false red.** `embedded-attribute.test.ts` carried
  `expect(performance.now() - started).toBeLessThan(2_000)` over a 512 KiB value. It reads a couple
  of hundred milliseconds on a quiet box, but on an ordinary loaded one it was measured at or over
  that literal with the algorithm untouched. It was also the weakest cost claim in this package: its
  fixture is half a megabyte of `0x41`, which yields zero tiling candidates, so every offset
  short-circuits before the repertoire scan where the quadratic it named lived and the number it
  produced was never a measurement of that cost. Deleted, and the test renamed to what it does
  assert. The cost is still bounded, by `vitest.config.ts`'s per-test
  timeout, which is the mechanism built for it.

  **Deletion two: `hookTimeout: 10_000`, a verbatim no-op.** Measured rather than read: a `beforeAll`
  that sleeps past it reds at "Hook timed out in 10000ms" on this repository's own Vitest with no
  configuration at all, so the line restated the default exactly and said nothing. The one hook that
  needs more (`docs-content.test.ts`, which shells out to `pnpm build`) already passes its own budget
  at the call site.

  **`testTimeout: 10_000` is UNCHANGED.**

  **Disclosed residual, not fixed here.** The two `test/property/` fast-check suites can exceed that
  10,000 ms global on a contended box, which reds them with the parser untouched. A per-test budget
  for them was built and then **withdrawn**: the measurements offered for it did not survive
  re-measurement, and the correct figures do not support the claim they were used to make. Those
  suites therefore remain on the 10,000 ms global - **exactly where `main` is today** - so this
  change neither fixes nor worsens that. It is a live false red and it needs its own slice, measured
  from scratch.

- **The `attw` publish gate exited 0 on a tarball carrying no type declarations, so a broken publish
  read as a pass** (`ATTW-FALSE-GREEN-PORT`). `pnpm attw` now runs `scripts/attw.mjs`, ported from
  `@cosyte/terminology` (#28, `bf153cb`), where the defect was diagnosed; `typecheck:exports` runs
  through the same wrapper with its `--profile node16` forwarded. The code ported, the measurements
  were re-taken on this package rather than carried over.

  **The cause is unconditional CLI semantics, not a lenient invocation and not concurrency.**
  `getExitCode.js` in `@arethetypeswrong/cli@0.18.4` opens with `if (!analysis.types) return 0`,
  returning before the problem list is read, because an untyped package is a legitimate npm package.
  Reproduced here with **zero concurrency**: on a quiet box `rm -f dist/index.d.ts dist/index.d.cts
&& pnpm attw` and `rm -rf dist && pnpm attw` both print "This package does not contain types." and
  exit **0**. Concurrency only supplies the condition. `tsup` writes the JS bundles before the
  declaration files, so every build of this package has a window in which `dist/` holds
  `index.mjs`/`index.cjs` and no `index.d.ts`: measured over three clean `pnpm build` runs on an idle
  box, polling every 25ms, at **1.06s, 1.23s and 1.43s** (JS at +4.83s to +5.36s, declarations at
  +6.06s to +6.49s). That is why the remedy is not a lock, a lease or a build queue - a lock would
  leave the defect intact on an idle box, and the gate is supposed to be able to say its own inputs
  were missing whatever removed them.

  **Two nets, which catch different things.** A **preflight** that every relative path
  `package.json` promises (`main`, `module`, `types`, `typings`, and every string leaf of `exports`,
  which here is `./dist/index.cjs`, `./dist/index.mjs`, `./dist/index.d.ts` and
  `./dist/index.d.cts`) exists and is non-empty; it catches the build window and names the missing
  file rather than leaving a reader to infer it from a sentence about types. And a **post-check**
  that promotes `attw`'s untyped sentence to a failure, which the preflight structurally cannot see:
  the declarations can be on disk and still be absent from the tarball because `files` or
  `.npmignore` left them out. No instance of that second case is on record in this repo. **Neither
  net covers the rest of `files`** (`README.md`, `LICENSE`, `TRADEMARKS.md`, `CHANGELOG.md`), stated
  plainly rather than left to be discovered: `attw` analyses types and never looks at them.

  **The post-check reads a string, so the routes that would hide that string are refused**, by option
  and not by value. **Eleven were measured here** on a fixture whose tarball genuinely carries no
  types, each restoring the exact exit-0 with the sentence unreadable: `--quiet`, `-q`,
  `--format json`, `-f json`, `--format=json`, `-fjson`, `-qf json`, `-Pfjson`, a `.attw.json`
  setting `quiet` or `format` (`readConfig()` applies config after argv), and **`--config-path`**
  pointing at a file that sets one - that last is the difference from terminology's copy, which
  refused it by inference and said so.

  **The three cluster forms are why the predicate is not an exact-token set, and a first draft of
  this change got that wrong.** It matched each whole argument, before any `=`, against a set of
  exact spellings; commander lets a short option's value attach to it and lets shorts combine, so
  `-f` is not visible as a token in `-fjson`. Measured on that draft, on the untyped fixture:
  `-fjson` gave **exit 0 with the gate silent**. A single-dash argument is now refused if any
  character in its cluster is `q` or `f`, which is sound because `-f` is `attw`'s only value-taking
  short option.

  Measured the other way too, and both directions are stated because the bound matters: `--format
  table-flipped` and `--format ascii` still print the sentence and blind nothing, and are refused
  anyway (value-parsing them would be a third moving part in the guard); while `--form json`,
  `--quiet=true` and `-f=json` each look like a route and are not, because commander rejects them
  outright with exit 1. **The over-strictness is bounded and nothing else is refused**: a forwarded
  `--profile node16` or `-P` still reaches `attw`. A forwarded extra positional does not retarget the
  run either - `--pack .` supplies the first positional and `attw` ignores the second, so the
  analysis stays on this package.

  `test/scripts/attw-gate.test.ts` pins both nets against the real binary: the upstream exit-0
  itself, so an `attw` upgrade that fixes it or rewords the sentence reds instead of letting the net
  go slack; the `tsup` window in this package's own dual ESM/CJS `exports` shape, asserting both that
  bare `attw` passes it with exit 0 and that the wrapper reds naming `./dist/index.d.ts`; a negative
  control on a well-formed package; that a real `attw` failure still fails with `attw`'s own status;
  and that other arguments are still forwarded. **Proved non-vacuous by putting the bare invocation
  back into the script: 15 of the 22 tests red**, re-measured on the file as it stands. The 7 that
  survive are exactly the ones that must pass on both: the upstream exit-0 pin, the well-formed
  negative control, the real-failure parity case, argument forwarding, and the three controls that
  only ever invoke the bare tool.
  `scripts/verify.sh` in the meta-repo needed no change and was not touched, and no lock, lease,
  semaphore or queue was added (ADR 0015).

### Changed

- `format` and `format:check` now cover `scripts/**/*.mjs` as well as `scripts/**/*.ts`, so the new
  gate script is actually format-gated. Exactly one pre-existing file entered that glob,
  `scripts/sync-version.mjs`, and it was verified Prettier-clean before the glob widened, so nothing
  is red-flagged retroactively. (The tree's other `.mjs` file, `test/smoke/esm/index.mjs`, is under
  `test/` and is not covered by this glob or by the `test/**/*.ts` one.)

  **`lint` was deliberately NOT widened the same way, and the reason is measured rather than
  assumed.** ESLint applies no rules at all to `.mjs` here: the shared `@cosyte/eslint-config` rule
  blocks are scoped to `**/*.ts`, so `eslint --print-config scripts/attw.mjs` returns only the
  Prettier-conflict disables, and a deliberately seeded unused variable plus a missing semicolon in
  `scripts/attw.mjs` produced **zero** findings. Widening the `lint` glob would have added a
  gate-shaped thing that gates nothing, which is the exact failure this change exists to remove.
  Making ESLint genuinely cover `.mjs` means changing the shared config, and that is its own slice.

### Security

- **A Sequence Item under an Explicit VR transfer syntax can read past the end its own sequence
  declared and swallow the element that followed the sequence, and did so silently. It now says so**
  (`DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`, pre-existing and live on the published `0.0.10`, on both
  Explicit VR Little Endian and Explicit VR Big Endian). New Tier-2 code
  `DICOM_ITEM_CROSSES_SEQUENCE_END` (`WARNING_CODES` is **29, was 28**; the locked snapshot is the
  pin and was updated deliberately), promoted to a throw under the `{ strict: true }` parse option.
  **No reading changes, on any file.** That is the fix's whole shape, and the next paragraph is why.

  **THE FACT THAT DECIDED THIS, AND IT IS PROVEN BY A TEST RATHER THAN ARGUED.** A file whose
  **item over-declares** and a file whose **sequence under-declares** are **the same bytes**.
  `test/integration/explicit-sq-item-bound.test.ts` builds both from two contradictory intentions and
  asserts `Buffer.equals`. So "which of the two length fields is the lie?" has no answer on the wire,
  and any bound that prefers section 7.5.2's extent for the first file imposes it on the second one
  too, because there is no second file. **Five graded attempts at such a bound were refused on
  `#51`.** This slice adds no bound, and that one fact is the entire reason.

  **🛑 THE FAIL-SAFE-DIRECTION ARGUMENT IS DELETED, NOT REWORDED.** Five artifacts on this branch
  said that following the Item's length field is the safe half of the ambiguity, because a Private
  Creator swallowed **into** an item leaves the enclosing block unclaimed and an unclaimed block is
  removed. **That is false, and it was the sixth refusal.** Which direction leaks is a property of
  **where the sender put the Private Creator**, not of which length field a reader follows: with the
  creator as genuine Item content, the absorb direction leaks too
  (`DICOM-PRIVATE-CREATOR-RESERVATION-LEAK`, measured on `164eb39`, closed at the de-identify
  boundary by `#66` and never in the parser). The eject direction is still open. Neither reading is
  safe by construction, which is precisely why this code reports rather than decides. Per this
  repo's own rule, a claim refuted twice is deleted rather than given a third wording.

  Measured, on `0.0.10`: `(0008,1115)` holding one item that over-declares its length by 18 bytes,
  followed by a root `(0010,0020)` Patient ID that is 18 bytes on the wire (an 8-byte Explicit VR
  short-form header plus a 9-character value padded to 10). The Patient ID is **absent from the root**
  and present instead as an attribute of the item; the `DeidentifyReport` names it with a
  `contextPath` pointing at that sequence item. (This entry said "pointing at a sequence item it was
  never in" until `DICOM-ITEM-CROSSES-RESIDUALS` deleted that wording: it asserts which of two
  byte-identical files you have. See the entry at the top of this file.) It is swallowed once and
  relocated, not
  read twice: the parser resumes where the descent actually ended. The parse was silent about all of
  it, including under `{ strict: true }`, and that silence is what is fixed. The mis-structure itself
  is **not repaired here** and is pinned as a residual by a test.

  **▶ AND IT IS THE ONLY SIGNAL ON A FILE WHOSE DE-IDENTIFICATION AUDIT IS FALSE.** `#66` recorded
  the eject direction of `DICOM-PRIVATE-CREATOR-RESERVATION-LEAK` as silent on every channel. On the
  **Explicit VR** shapes that is no longer true: re-measured on that residual's own fixture, this
  code fires on both channels and throws under `{ strict: true }`, beside an unchanged leak
  (`report.removedPrivateTags` `[]`, the private value in the serialized output, the object stamped
  `(0012,0062) Patient Identity Removed = YES`). The leak is not closed here and the warning is not
  an all-clear - **the troubleshooting row says so explicitly**, because the earlier draft of that
  row told an operator "nothing is retained that would not be", which is false on exactly this file.
  Implicit VR LE stays silent: that path slices the item stream, so no over-run is recorded.

  PS3.5 2026c section **7.5.2** "Delimitation of The Sequence of Items" makes the `SQ` element's own
  Value Length the exact extent of the item stream: "This length shall include the total length
  resulting from the sequence of zero or more items conveyed by this Data Element." Section **7.5.1**
  "Item Encoding Rules" governs each `(FFFE,E000)` Item's own length field. Both traced to the
  SHA-pinned `vendor/nema/part05/`, each sentence unique in the document. **Neither clause says what
  a decoder does when the two disagree**, so no reading is derived from them; where they disagree
  this reader follows 7.5.1, which is what every released version does.

  **Where the disclosure fires, exactly.** A defined-length `(FFFE,E000)` item, inside a
  defined-length `SQ`, whose declared end is **not** the end of the buffer it is being read in -
  which is what says the sequence sits inside a larger Data Set whose bytes are there to be taken.
  A sequence handed a slice cut at its declared end (Implicit VR LE's `tryParseDefinedLengthSQ`,
  CP-246's `tryParseUnAsSQ`), an undefined-length sequence, an undefined-length item, and a sequence
  that ends its own buffer all have nothing to reach into and stay silent. Each is a test.

  **🩺 The Item's declared length is WITHHELD from the message, and the bound is the factory
  signature.** A diagnostic about a length field that lies is itself a PHI surface: the condition
  that raises this code is exactly "these length fields are not what they claim to be", so the Item's
  32-bit Value Length can be four bytes of somebody's value. Measured, an item header fabricated over
  the payload `"SMITHSON"` rendered it as `1414090067`, `"SMIT"` in wire order, reversible with one
  `readUInt32LE` - and it is emitted **above** the truncation guard, so the message reaches
  `onWarning` on a file the parse then refuses. `itemCrossesSequenceEnd` takes no parameter for it,
  the same remedy `#64` applied to `DICOM_NONZERO_RESERVED_BYTES` and `#55` to
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`; `position.byteOffset` locates the item. The bytes that
  remained inside the sequence are still reported, and that asymmetry is structural rather than a
  judgement call: the emit site's own `endLimit < buffer.length` conjunct bounds that count by the
  buffer. Measured against the identical attack - fabricating the **`SQ`**'s length field over the
  same name puts `endLimit` past the buffer, so the code does not fire at all. Both pinned with a
  name-bearing payload and a mutation control; the shipped message said "no bytes off the wire", then
  carried the length itself, and both are gone.

  **The measurement, on `scripts/measure-sq-bound-grid.ts` against `2f0abd9`, 83,037 cells.** Both
  sequence length fields and an element's own swept independently, across ten item shapes, both
  Explicit VR syntaxes, an Implicit VR LE control, both `strict` postures, and `#66`'s `priv|`
  private-reservation family:

  |                                                            |                           |
  | ---------------------------------------------------------- | ------------------------- |
  | cells whose **reading** differs                            | **0**                     |
  | cells newly emitting `DICOM_ITEM_CROSSES_SEQUENCE_END`     | 616                       |
  | ...cells that LOSE it                                      | **0**                     |
  | cells that newly fail under `{ strict: true }` (the price) | **576**                   |
  | new lenient fatals                                         | **0**                     |
  | values lost, values gained, wrong root `(0010,0020)`       | **0 / 0 / 0**             |
  | PHI regressions                                            | **0**                     |
  | reports that lose an attribute                             | **0**                     |
  | Implicit VR LE cells changed                               | **0**                     |
  | every `priv\|` column from `#66`                           | unchanged                 |
  | cells leaking a source value, base -> now                  | 11 -> 11 (`PRE-EXISTING`) |

  The other **16,396** of the 17,012 differing cells are **strict-fatal on both trees** and differ
  only in the _class_ of the `{ strict: true }` throw, because the new Tier-2 code escalates before
  the Tier-3 fatal those files already had. All 576 new strict fatals carry the new code, so none is
  collateral. **Quote the reading count and the strict count together or neither** - a new warning is
  a real behaviour change, and 576 files that parsed under `{ strict: true }` now do not. Every one
  is a file whose two normative length fields contradict each other, which is what the strict posture
  exists to refuse; the lenient reading of all 576 is byte-identical to before. `cells whose READING
differs` is the counter that expresses this and it already exists on `main` (`#66` added it); the
  earlier draft of this entry claimed to add it.

  **Disclosed and NOT fixed, deliberately:**
  - **The mis-structure.** An over-declaring item still relocates the element that follows the
    sequence, and `deidentify()` still reports it under a `contextPath` naming an item it was never
    in. Pinned by a test so the claim cannot drift from the code.
  - **`ds.warnings` is uncapped, and "at most one per sequence" is not an amplification bound.** The
    shape holds, but a file may carry as many sequences as it can encode. Pinned by a test that
    asserts the growth. This is `#48`'s pre-existing, package-wide posture for parser warnings.
  - **`profiles.strict` does not escalate this code.** The `{ strict: true }` option does. Adding a
    code to a shipped preset moves every `profiles.strict` consumer's parse and is its own measured
    change. Pinned by a test.
  - **`position.byteOffset` is frame-dependent**, like `Element.byteOffset`: file-absolute for a
    root-level sequence, slice-relative inside an enclosing item. Measured and pinned.
  - **The undefined-length item with no `(FFFE,E00D)`** still runs to the end of the buffer. There is
    no declared item length, so there is no disagreement to disclose.
  - **`Element.byteOffset` inside a sequence item disagrees with itself between the two item forms,
    and always has.** Measured identically on this branch and on `origin/main`: on a 210-byte file
    with the `SQ` at 172, an element inside a **defined-length** item reads `0` (the item slice is its
    own frame) and the same element inside an **undefined-length** item reads `192` (file-absolute,
    because `parseSequence` hands that branch the outer buffer). `PRE-EXISTING`.
  - **11 grid cells still leak a source value** - the over-declare swallow into an `OB`/`OW`/`US`/`UN`
    leaf carrier, `PRE-EXISTING`, identical on both trees, its own item.

- **A symbolic link under `test/fixtures/` pointing at a PHI-bearing file scanned CLEAN on BOTH of
  `scripts/phi-scan.ts`'s enumerating routes, so the commit gate passed it twice over**
  (`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`; pre-existing). Reproduced on `0f898be` with a synthetic
  name-bearing payload outside the walk root and a link to it at `test/fixtures/leak.txt`: all-mode
  exited **0** printing `OK - no hits`, `--staged` exited **0** after `git add`, and naming the
  target explicitly exited **1** with three hits (the PN plus both dates). The payload was always
  detectable; the two routes never looked at it.

  **Two mechanisms, two fixes.** `walk()` enumerates `Dirent.isFile()`, which is an lstat answer, so
  a link is neither a file nor a directory and fell out of the loop silently. `isDirectory()`
  answers false for a **linked directory** too, so a whole subtree vanished the same way (measured:
  a link to a directory holding the payload, exit 0). And `--staged` reads content with
  `git show :<path>`, while git stores a link as its **target path** under mode `120000`, so that
  route was handed the path text and never the target's bytes. `--staged` is this repo's
  `pre-commit` hook.

  **Neither route is made to follow the link.** Following would read bytes the enumeration does not
  control (outside the repo, a loop, a device, a FIFO that blocks the gate forever), and git does not
  carry those bytes anyway, so a hit on them would be a claim about something no commit contains.
  The enumeration is narrowed instead: an **in-scope entry that is not a regular file refuses the
  scan** (exit 2), naming every offender rather than the first. `--staged` now reads
  `git diff --cached --raw -z` so the destination mode is visible; an unparseable `--raw` record
  refuses too, because a silently shortened list is exactly what this scan must never report clean
  over. **Be precise about which mode was blind:** `120000` was the leak. A staged **gitlink**
  (`160000`) already exited 2 on the base scanner, because `git show :<path>` fails outright on one
  (`fatal: bad object`, exit 128) and the read-error path caught it. Its refusal is now a named one
  with a reason instead of a relayed git error, which is an improvement in the message, not the
  closing of a hole.

  **`--diff-filter=AMT`, not `AM`, and the one-letter difference is what makes the mode check
  reachable.** Replacing a **tracked** fixture with a link is neither an add nor a modify: git raises
  it as a typechange, `:100644 120000 <sha> <sha> T`. Measured on git 2.39.5, both
  `git diff --cached --raw --diff-filter=AM` and `--name-only --diff-filter=AM` print **nothing** for
  that stage, so the record died before any mode could be read and the hook would have passed a
  mode-`120000` blob green while this entry claimed it refuses one. Typechange carries a single path,
  exactly like `A` and `M`, so admitting it costs the two-field record stride nothing, and the
  reverse typechange (a link replaced by a real file) is now scanned as the file it became.

  **`--no-renames` as well, and the status filter alone was not enough - the gate's first pass
  claimed otherwise and was refuted by measurement.** Rename detection is on by default, so
  `git mv <link> test/fixtures/<name>` - an ordinary developer action, no crafted input - stages as
  `:120000 120000 <sha> <sha> R100` with **two** paths, which `--diff-filter=AMT` then deletes
  outright: the index held `120000 ... test/fixtures/toplink.txt` and this route printed
  `OK - no hits` and exited **0**. The first pass disclosed that as out of scope on the grounds that
  admitting a rename "needs the two-path record shape handled". It does not. With detection off the
  destination arrives as an ordinary single-path `A` (`:000000 120000 0000000 <sha> A`) and the
  source as a `D` the filter drops, so the two-field stride is untouched and the entry is refused.
  It also makes that stride **structural rather than conditional**: with detection off, no `R` or `C`
  record can be produced whatever the caller's `diff.renames` setting is. The cost is that the
  destination of an ordinary clean rename into `test/fixtures/` is now scanned where it used to be
  dropped, which is more coverage rather than less, and is pinned in both directions.

  **The fixture root's own path is in scope too, not just what is under it.** A prefix test requiring
  the trailing slash let a staged `test/fixtures` through (measured: mode `120000` at exactly that
  path, exit 0) - the corpus root replaced by a link, so the whole corpus goes unscanned. Git records
  no index entry for a directory, so that path can only mean a blob, a link or a gitlink, and it is
  now refused. Only the "never a directory" half is load-bearing; the other three are all handled.

  **A refusal names the entry's own repo-relative path and an engine-owned kind token, never the
  link target**, which is working-tree text that can itself carry PHI. That is not hypothetical
  here: on the base scanner, a link whose target filename carried a name and a date made `--staged`
  exit **1** and print a hit whose value was **the date out of the filename** - a report about the
  working tree's own text, not about anything the target contained. For the same reason the shape of
  such a filename is written out in the scanner's docblock rather than exemplified: a diagnostic
  about a PHI leak is itself a PHI surface, and that applies to the prose explaining it.

  **Almost all of the scope is unchanged, and the two places it moved both admit MORE.** All-mode
  still walks only `test/fixtures/` and still excludes a gitignored entry, by the same rule that
  already excludes a gitignored fixture (`git check-ignore` does not answer for a tracked path, so
  force-adding the link puts it back in scope, and that is pinned). `--staged` still covers only the
  fixture path, and only the staged records git reports as added, modified or typechanged - a
  deletion has no staged blob to scan and an unmerged path has no single one, both pre-existing and
  both stated in the scanner's own banner rather than left to be inferred from the path prefix. The
  two movements are the rename destination and the root path above; neither widens a route to a new
  directory, and a link outside either boundary is still left alone, tested in both directions. The
  `readme.md` exemption deliberately does **not** reach a link: that exemption is a judgement about a
  file whose bytes the walk could have read, and a link's name is no evidence at all about what is on
  the other side.

  Pinned in `test/scripts/phi-scan.test.ts` with a synthetic name-bearing payload whose target
  filename also carries a name, so the no-echo assertions cannot pass by fixture: **13 of the 31
  cases are red on `0f898be`**, and the four cases covering the three corrections above are red on the
  first pass of this change as well. The file also carries a negative control asserting the scanner
  under test is this package's and not a sibling's.

  **Not covered, deliberately, each measured rather than assumed.** Explicit-path mode already read
  through a link and is unchanged. The **enumerate-then-read race** is untouched:
  a file that vanishes between `walk()` and `readFileSync` aborts the whole sweep at exit 2, which
  fails closed and is a different defect from this one. **There is still no rule refusing a scan that
  observed nothing, and that has a measured instance worth naming rather than leaving abstract:** if
  `test/fixtures` is itself a DANGLING link, `existsSync` follows it, answers false, and all-mode
  prints `OK - no hits` and exits **0** over a corpus it never opened (identical on the base
  scanner). If it is a link to a regular file, `readdirSync` raises an uncaught `ENOTDIR` - noisy and
  fail-closed, but exit 1, which this contract reserves for "hits found". The `--staged` half of that
  same shape is closed above; the all-mode half needs the observed-nothing rule, which is its own
  slice. Also `--allow-fixture <path>` with no positional path still scans **nothing** and
  prints `OK - no hits` even for a path that does not exist (measured), which makes this suite's
  existing "honors `--allow-fixture` with an override-log entry" case vacuous. All pre-existing,
  disclosed rather than fixed here.

  No source, parser, de-identify or public API change.

- **An element whose on-wire VR is not one of the 34 PS3.5 §6.2 defines was kept verbatim by
  `deidentify()`, carrying a source `(0010,0020)` Patient ID into de-identified output next to the
  `(0012,0062) PatientIdentityRemoved = YES` this library writes** (`DICOM-CARRIER-LEAF-LEAKS`,
  mechanism 2; pre-existing, live on the published `0.0.6`, identical on both trees). Re-derived on
  `scripts/measure-sq-bound-grid.ts` at `35adc2d` before anything changed: **19 leaking cells → 11**.
  Negative control first - the grid run against `d1031f5`'s `src/` restored **1,174** leaking cells
  and reproduced `#54`'s published 2,448-cell cost - plus a second control confirming the harness
  fails outright when pointed at another package.

  **This is the _under_-declare, not the swallow the entry below closed.** An under-declared Value
  Length desynchronizes the reader: it finishes the short value early, reads the leftover bytes of
  the value that was actually encoded as the next Data Element header, and consumes the element that
  genuinely followed as that fabricated element's "value". Measured: a 14-byte carrier
  under-declaring by 6 yields tag `(4156,554C)` with the VR bytes `"E "`, holding the Patient ID in
  full, **silently** and with a clean report. It reaches **string** carriers as readily as binary
  ones, so it is not bounded by the binary-VR story that frames the residual below.

  **The remedy reads a field the parser already recorded, not the bytes.** PS3.5 2026c §6.2: "All
  new VRs defined in future versions of DICOM shall be of the same Data Element Structure as defined
  in [§7.1.2] with reserved bytes after the VR and a 32-bit unsigned integer VL". An unrecognized VR
  is long-form by that rule while this parser reads it short-form (Postel's Law on the read path), so
  its bytes are not a Value Field this library decoded under any VR and PS3.15 2026c §E.1.1's
  obligation cannot be discharged inside them. Read from the vendored SHA-pinned documents, pins
  re-derived, each sentence unique in its document. Such an element is **emptied**,
  `report.undefinedVrElements` names the **byte offset** and the byte length dropped, and the new
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` is raised. **The finding names no tag, uniquely among
  the report's findings**: the header _may_ have been fabricated out of the middle of some element's
  value, in which case its four tag bytes are document content - on a synthetic `ST` carrier holding
  `"MR BRAIN SMITHSON"` the tag renders as `48544F53`, four letters of the surname. An honestly
  written unrecognized VR raises the same code with an ordinary tag, and the two are
  indistinguishable here, so the tag is withheld either way.
  `renderTag` shape-checks a tag and cannot refuse one, so the withholding happens at the call site.
  An undefined-VR carrier whose bytes happened to tile was reported in `report.embeddedAttributes`
  before and now reports here instead. The test is a set-membership check on
  `el.vr`: O(1), **no scan**. The record is **capped at 64 across the run** and the emptying never is
  - an undefined-VR element costs an attacker only an 8-byte header, so 1 MiB is 131,072 of them.

  **No carve-out, and structurally so:** `keepOrEmpty` is the only path that keeps a source value
  verbatim and the test sits at its top, so `RetainSafePrivate` does not exempt an element - pinned
  by a test. **`UN` is untouched**, being one of the 34, and the rule cannot fire under Implicit VR
  LE at all, where the VR comes from the dictionary; 0 Implicit VR LE cells moved.

  **Cost, published rather than described:** 23 grid cells lose a marker from de-identified output,
  **15 of which were not leaking**. On a file conformant to PS3.5 2026c the cost is zero.

  **The root cause is a parse behaviour this slice does not touch, and it is disclosed rather than
  implied fixed.** §6.2's note says informatively that an unrecognized VR may be handled "by applying
  the rules stated in [§7.1.2]" - i.e. read long-form, value copied unchanged. This parser reads it
  **short-form**. Emptying at the de-identify boundary is therefore compensation, not conformance.
  `PRE-EXISTING`, its own slice. No claim is made here about what a §6.2-conformant future-VR file
  does on either tree.

  **Still leaking, measured, and now priced:** the 11 remaining cells are the over-declare swallow
  into a **binary** carrier at `delta=18`. The one candidate remedy was built and measured - it
  takes 11 to 0 and empties **all 5** conformant binary tiling controls, i.e. deletes a legal
  `OB`/`UN` value because 8 of its bytes read as a zero-length `(0010,0020)`. That is a product
  decision, not a bug fix, and it has its own item.

- **A sequence the parser could not open was passed through `deidentify()` as raw bytes, so a
  `(0010,0020)` Patient ID inside it reached de-identified output next to the
  `(0012,0062) PatientIdentityRemoved = YES` this library writes** (`DICOM-DEIDENT-RAWBYTES-PASSTHROUGH`,
  pre-existing and live on the published `0.0.6`). It is the larger half of the 2,127 leaking grid
  cells the previous entry decomposed: **1,155 of the 6,348 cells that parse**, all Implicit VR LE,
  all carrying exactly `["DICOM_SQ_NOT_DESCENDED"]`. Re-measured before anything was changed, with a
  negative control (reverting the previous entry's call site restored exactly 2,127) so the harness
  is known live rather than assumed.

  When an element resolves to `SQ` from PS3.6 under Implicit VR LE and its defined-length value is
  not a valid `(FFFE,E000)` item stream, the parser refuses the descent and keeps the declared span
  on `Element.rawBytes` with `Element.items` undefined. That is right for a parser. It was not safe
  for `deidentify()`, which recurses only into a sequence whose items exist: for a carrier such as
  `(0008,1115)` with no Table E.1-1 row, the action table resolved "keep" and the span was re-emitted
  verbatim, with the report naming nothing.

  **The remedy reads the parser's recorded refusal, not the bytes.** PS3.5 2026c §7.5.1 "Item
  Encoding Rules" states "Each Item Value shall contain a DICOM Data Set composed of Data Elements",
  so an `SQ` value is never legitimately opaque the way an `OB` value is; PS3.15 2026c §E.1.1
  "De-identifier" obliges an implementation claiming the Basic Profile to "protect or retain all
  instances of the Attributes listed in [Table E.1-1], whether contained in the top level Data Set or
  embedded in an Item of a Sequence of Items". Unable to enumerate the items, the obligation falls on
  the carrier, which is the escalation §E.1.1 itself makes for a SOP Instance UID inside a Sequence.
  Both sentences read from the vendored SHA-pinned documents, pins re-derived, each unique in its
  document. A **standard** `SQ` with no items is therefore **emptied**,
  `report.unauditableSequences` names the tag and the byte length dropped, and the new
  `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` is raised. That record is **capped at 64 across the run**
  (element count is attacker-chosen too, and `#48` bound every other consumer-controlled
  diagnostic); the **emptying is never capped**, so an array exactly 64 long means "at least 64". A
  listed sequence kept by a Retain Option takes the same branch and its audit line now reads
  `emptied` rather than `kept` - previously it produced an empty sequence anyway while claiming the
  attribute was retained.

  **It costs content, and the number is published rather than described:** 2,448 grid cells lose a
  value from their de-identified output, of which **1,293 were not leaking anything** and pay purely
  for the guarantee. The accompanying `DICOM_SQ_NOT_DESCENDED` says why the parse refused, which is
  _usually_ a sender defect - but **not always**: a conformant file nested deeper than this
  library's own `NESTING_DEPTH_LIMIT` of 64 (ours; PS3.5 sets no nesting bound) is refused the same
  way and loses that sequence too. Because the trigger is `items === undefined` rather than a
  content test there is no scan, so no cost follows an attacker-chosen value length; the cost tests
  use a carrier where **every even offset** is a tiling candidate and assert that property rather
  than describing it, as a **forward tripwire** - this path never traverses those bytes.

  **New surface:** `UnauditableSequenceFinding`, `DeidentifyReport.unauditableSequences`, and
  `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` (**27 Tier-2 codes, was 26**; snapshot updated
  deliberately). `DICOM_SQ_NOT_DESCENDED`'s message changed, since it said nested content was
  invisible to de-identification.

  **Not covered, and one of these is measured here for the first time.** An undefined-length `UN`
  whose CP-246 descent was refused keeps `vr === "UN"`, and the rule cannot be extended to it because
  every ordinary `UN` element also has no items - measured on a hand-built file, the identifier still
  reaches output with no report entry. A **private** `SQ` under `RetainSafePrivate` plus a `Profile`
  is still kept verbatim, deliberately - `keepsPrivate` decides first, so it never reaches this rule,
  and measured on a synthetic vendor block the identifier does still reach output. Both carve-outs
  are pinned by tests. And the **binary-VR carrier** residual the previous entry
  disclosed but could not measure now has a number: the grid gained an over-declaring **leaf**
  carrier dimension and finds **19 leaking cells, identical on both trees** - 11 at `delta=18` (the
  swallow into `OB`/`OW`/`US`/`UN`, silent, with `LO`/`ST` controls on the identical fixture at 0)
  and 8 at `delta=-6` (an _under_-declare, where leftover bytes are read as a Data Element header and
  the identifier lands in a manufactured element with an unknown on-wire VR; this one hits string
  carriers too and was not previously disclosed anywhere).

  **Measured, on the now 76,599-cell grid against `d1031f5`:** sequence-sweep leaks 1,155 → **0**;
  **0 cells differing in any parse respect**, now a printed count rather than an inference from
  `changed`, because no parser file is touched; 0 new fatals, 0 lost parse values, 0 reports that
  lose an attribute, 0 new strict fatals.

- **An element that over-declared its own Value Length swallowed the next element into its value,
  where the PS3.15 Annex E action table cannot see it, and `deidentify()` wrote the identifier into
  its output with a clean report** (`DICOM-OVERDECLARE-SWALLOWS-INTO-VALUE`, pre-existing and live
  on the published `0.0.6`). **No sequence is involved.** PS3.5 2026c defines Value Length as "The
  length of the Value Field of the Data Element" - that element's own value. A sender that writes a
  larger number produces a file that is not detectably broken: the reader consumes the declared
  count, the bytes it over-consumes are the following element header and all, every subsequent
  offset still lines up, and nothing on the wire says which length field lied. After the swallow
  there is no `(0010,0020)` in the object for Table E.1-1 to match, only bytes inside some other
  attribute's value, so de-identification passed over PHI it never recognised as an attribute.
  Measured on the committed grid at `244a372`: **877 of the 6,348 cells that parse** wrote a source
  value into de-identified output this way, on Explicit VR LE and Explicit VR BE, **871 of them with
  no warning on either channel and no throw under `{ strict: true }`**.

  **`parseDicom` is unchanged, deliberately.** The two readings - "the length is right and the value
  is odd" and "the length lied and the next element was absorbed" - produce identical bytes, so a
  parser cannot choose between them and this release does not pretend to. `deidentify()` answers a
  strictly narrower question, and only about values it was about to **keep**: does this value's tail
  decode, in the file's own transfer syntax, as a complete run of Data Elements ending exactly at the
  end of the value, at least one of which this run would have acted on, and containing a byte the
  carrier's VR cannot legally hold (PS3.5 §6.1.3 and Table 6.1-1 permit five C0 control characters in
  DICOM text; **Table 6.2-1 decides which of the five each VR may hold**, in three tiers)? All three have to hold. If they do, the value is **emptied**
  rather than kept, a new `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED` warning appears on
  `report.warnings`, and the new `report.embeddedAttributes` names the carrier, its VR and the tags
  that were hiding inside it. PS3.15 §E.1 requires a de-identifier to "protect or retain all
  instances of the Attributes listed in [Table E.1-1]"; §E.3.5 is the standard's own statement that
  identifying information embedded **inside a string attribute's value** is in scope for removal.
  Emptying is the fail-safe direction; keeping is not.

  **What this does not cover, stated rather than implied.** Carriers are **string VRs only**, and the
  residual is live rather than theoretical: the identical over-declare into an `OB`, `OW`, `UN` or
  `US` carrier still writes the identifier into de-identified output, with **no warning and no report
  entry**, exactly as before. Arbitrary bytes are what those VRs are for, so no content test can tell
  a swallow from a legitimate value there, and scanning them would trade a measured guarantee for a
  coin-flip that deletes real pixel and lookup-table data. The committed grid never puts a binary VR
  in the over-declaring role, so this residual is **disclosed but unmeasured** and needs its own
  item. (It was measured later in this same release cycle, by the entry above: **19 grid cells**,
  once the grid gained an over-declaring leaf carrier.) A sequence the
  parser declined to descend and kept as opaque bytes is a **different** defect with a different
  remedy and is untouched here (1,155 grid cells, all Implicit VR LE, all carrying
  `DICOM_SQ_NOT_DESCENDED`). And nothing here recovers the correct reading of a malformed file: the
  carrier's parsed value still holds the absorbed bytes, and `ds.get("00100020")` still returns
  nothing. This closes the leak, not the mis-read.

  **Measured, on the same 76,293-cell grid, against `244a372`:** 2,127 leaking cells → 1,155; every
  Explicit VR cell → **0**; and **0 cells whose parse differs in any respect** - reading, both
  warning channels, `{ strict: true }`, and which values survive anywhere in the object are
  byte-identical, because no parser file is touched. 0 new fatals, 0 lost values, 0 reports that lose
  an attribute. `scripts/measure-sq-bound-grid.ts`, previously only on an unmerged branch, is
  committed so every figure above is one command away.

- **A defined-length sequence under Implicit VR Little Endian was never opened, so PHI nested inside
  one survived `deidentify()` into serialized output while the report said it had been removed**
  (`DICOM-IMPLICIT-SQ-NOT-DESCENDED`, pre-existing and live on the published `0.0.5`). The
  Implicit VR LE parser delegated to the sequence parser **only** in the undefined-length
  (`0xFFFFFFFF`) branch, so `Element.items` was `undefined` for every defined-length sequence under
  that transfer syntax. Nothing that walks items could see inside one, and `deidentify()` recurses
  into a kept sequence only when its items exist: a `(0010,0010)` Patient's Name in a defined-length
  item reached `serializeDicom()` output verbatim, with the `DeidentifyReport` naming only the root
  attribute. **The report therefore asserted a scrub it had not performed**, which is the worse half
  of the defect: an incomplete audit that reads as a complete one is what a caller trusts before
  sharing an object. The identical fixture under Explicit VR LE scrubbed clean, because that path
  already descended both length forms.

  PS3.5 2026c states the obligation twice, about two different length fields, and the one this broke
  is section **7.5.2** "Delimitation of The Sequence of Items", which governs the `SQ` element's own
  length: "The encoder of a Sequence of Items may choose either one of the two ways of encoding. Both
  ways of encoding shall be supported by decoders of the Sequence of Items." Section 7.5.1 "Item
  Encoding Rules" says the same of each Item's length field. The two choices are independent, so both
  are now descended in every combination. The de-identified output of the
  Implicit VR LE fixture and its Explicit VR LE twin are now the same report, attribute for
  attribute and context path for context path.

  **Three smaller consequences of a sequence now being read**, each the descent working rather than a
  separate decision: `Element.vm` is the item count instead of the scalar placeholder `1`;
  `Element.value` yields the real items instead of an empty sequence; and warnings raised **inside**
  a defined-length sequence, which previously could not exist because its bytes were never parsed,
  now appear on `ds.warnings` - so under `{ strict: true }` a file whose nested content was always
  non-conformant now throws. The sequence element itself no longer carries `specificCharacterSet`,
  matching every other sequence element in the package; items still inherit the enclosing charset.

- **A warning message no longer echoes anything the file said** (`PHI-WARNING-MESSAGE-LEAK`). Three
  diagnostics reproduced consumer-controlled bytes verbatim, and one of them carried onto the dataset
  `deidentify()` labels safe to share:
  - `DICOM_UNSUPPORTED_CHARSET` interpolated the `(0008,0005)` term. That value is **multi-valued on
    the backslash**, so any component of it, at any position, reached the message whole. It is the
    measured leak, and `deidentify()` copies `Dataset.warnings` across, so it rode onto the shared
    artifact.
  - `DICOM_PRIVATE_CREATOR_UNKNOWN` interpolated the Private Creator string, which is an `LO` a
    sender authored and which this warning fires on precisely because nothing vouches for it.
  - The `UNSUPPORTED_TRANSFER_SYNTAX` fatal interpolated the `(0002,0010)` UID into `err.message`,
    and so into `err.stack` and into whatever an error reporter ships off-box. The writer's
    equivalent did the same for a `Dataset` a caller built.

  Every message now comes from a **frozen registry** keyed by the warning code. Factories take a
  position and structural constants only: a tag this parser composed, a VR checked against the closed
  34-VR set, and input-derived numbers. There is no string parameter to pass a value through, which
  is the property that distinguishes every `@cosyte/*` parser that does not leak from every one that
  did. A token failing its check renders `<withheld>` rather than being echoed.

  Where a token has to be named, it comes from a closed set this package controls: the unsupported
  transfer syntax reads as the dictionary's own label for the UID (`JPEG Baseline (Process 1)`) when
  PS3.6 publishes one, `DICOM_UNSUPPORTED_CHARSET` names the **1-based value index** of the offending
  component rather than the component, and the inflate failure reports zlib's error _code_ instead of
  forwarding zlib's message.

- **Two model fields are bounded, because a diagnostic fix does not protect a downstream package.**
  `@cosyte/hl7` bounded its messages, went green, and `@cosyte/deid` still leaked off `Segment.type`.
  The same two shapes here now bound on **membership**, not shape, because DICOM offers no shape to
  test (`src/parser/tokens.ts` argues why):
  - `Element.specificCharacterSet` holds only terms PS3.3's closed table names; anything else reads
    `<withheld>`. Decoding is unchanged: an unmappable term was already skipped.
  - `Element.privateCreator` holds only creators the active `Profile`'s overlay names. **With no
    profile, nothing is recognized and the field reads `<withheld>`** - a real reduction in what it
    tells a caller, and deliberate. The raw creator is still available as the `(gggg,00EE)` element's
    own `rawBytes`, as a value, where value discipline applies.

  `RetainSafePrivate` is unaffected in either direction: `deidentify()` now re-derives the block
  reservation from the creator elements of **each Data Set** it walks, so passing a `Profile` at
  de-identification works whether or not one was passed at parse. **One behaviour does change against
  0.0.5:** a private data element inside a sequence item whose creator is declared only at the root is
  now removed rather than retained, because the item has no reservation of its own. That is the
  conformant reading and the fail-safe direction, but a sender that declares a creator once at the
  root and writes private data into Per-Frame Functional Groups items will lose those elements under
  `RetainSafePrivate`. Declare the creator in the Data Set that uses it. Per Data Set is load-bearing, not a
  detail: PS3.5 §7.5 makes each Sequence Item its own Data Set and §7.8.1 scopes a reservation to the
  Data Set the creator appears in, so the same block number names different vendors at the root and
  inside an item. Resolving one against the other retained an item's private element on the root's
  reservation and wrote its value into the serialized output.

### Fixed

- **A malformed defined-length sequence degrades instead of failing the object, and says so.** Under
  Implicit VR Little Endian there is no VR on the wire: `SQ` is this parser's inference from PS3.6,
  not something the sender wrote. So an element whose defined-length value turns out not to be an
  `(FFFE,E000)` item stream keeps its declared byte range on `Element.rawBytes`, leaves the rest of
  the object readable, and raises the new Tier-2 `DICOM_SQ_NOT_DESCENDED` warning. The undefined-length
  form keeps its existing Tier-3 fatal, and that asymmetry is deliberate: a defined length leaves a
  complete alternative reading of the value, and an undefined one leaves none. **The warning exists
  because silence is the defect above**: an undescended sequence is invisible to `deidentify()`, so a
  caller has to be told the audit did not reach inside it. It is not the whole story, though: see the
  next entry for the shape that stays silent.

- **Only one of the two un-auditable shapes warns, and the docs now say which.** `deidentify()`
  recurses on `Element.items`, so a sequence the parser could not open is kept verbatim and appears
  nowhere in the report. The refusal added above raises `DICOM_SQ_NOT_DESCENDED`; an undefined-length
  `UN` value the CP-246 descent could not read as a sequence raises **nothing** and keeps `vr ===
"UN"`. That silence is `PRE-EXISTING` and unchanged. The reliable check is `el.items === undefined`
  on the element, not `ds.warnings`.

- **Residual, pre-existing and now reachable from one more shape.** A refused descent drops its
  warnings from `ds.warnings`, but an `onWarning` callback has already been handed them: the emit
  chokepoint delivers to the callback before the rollback can undo the push. The two disagree for
  exactly those warnings, and `ds.warnings` is the accurate record. Unchanged from the CP-246 path,
  disclosed rather than fixed (buffering emissions is a larger change than this slice).

- **A test named "explicit-length SQ also descends" proved nothing, and that is how this shipped.**
  Its two assertions were the VR, which dictionary resolution answers whether or not anything
  descends, and `vm === 1`, which was the **scalar placeholder** every non-sequence element already
  carried. Both were green against a parser that never opened the sequence. It now asserts the items.

- **A private block reserved in one Data Set resolved the Implicit VR of a private element in
  another, so the same bytes decoded as a different value than the file declared**
  (`DICOM-PARSE-CREATORS-SCOPE`). The parser kept **one** private-creator reservation map for the
  whole file, so a block number claimed by different vendors at the root and inside a Sequence Item
  resolved to whichever creator was read **last**, wherever it sat. That map feeds Implicit-VR
  resolution, which is why this is a wrong decode and not a mislabelling: in a file where an item
  claims block `0x11` and the root afterwards writes `(0029,1101)` without claiming it, the root
  element took the **item's** vendor, and with a `Profile` naming that creator's element byte as `SS`
  the bytes `FF FF` read as **`-1`** rather than as raw bytes. No warning fired. Reservations are now
  scoped to the Data Set the Private Creator Data Element appears in, at every depth the parser
  recurses to: an item does not inherit the enclosing Data Set's blocks, an item's own do not reach a
  sibling item, and none of them survive back out to the enclosing Data Set once the sequence closes.

  PS3.5 2026c section 7.5.1 is the basis: "Each Item Value shall contain a DICOM Data Set composed of
  Data Elements", closing by delegating to section 7.8 for "rules for incorporating Private Data
  Elements into Sequence Items", where a Private Creator Data Element "shall be used to reserve a
  block of Elements with Group Number gggg". Its first Note states the nesting case outright: each
  item needs to claim the corresponding private block of Elements. Both documents are the vendored,
  SHA-pinned copies under `vendor/nema/part05/`.

  **Three behaviour changes against `0.0.5`, all confined to files that mix private data with
  sequences.** (1) A private data element in a Sequence Item whose block is claimed only in an
  enclosing Data Set now resolves to `UN` plus `DICOM_PRIVATE_TAG_NO_CREATOR`, where it previously
  took the enclosing claim's VR. The bytes stay on `Element.rawBytes`; what is withheld is a typed
  decode the file never licensed. Declare the creator in the Data Set that uses it. (2)
  `Element.privateCreator` is `undefined` on those elements rather than naming a vendor from another
  Data Set - and that half applies under **every** transfer syntax, including the Explicit VR ones
  where the VR is on the wire and only the attribution was wrong. (3) **Under `{ strict: true }` the
  same file now throws**, because `DICOM_PRIVATE_TAG_NO_CREATOR` is a Tier-2 warning and strict
  promotes Tier-2 warnings to a thrown `DicomParseError`. Nothing about strict changed; the warning
  is simply now emitted where the standard says the reservation does not reach. The default lenient
  parse keeps the file and records the warning.

- **An undefined-length `UN` under Implicit VR LE is descended as a sequence instead of failing the
  whole parse.** `parseImplicitLE` treated any resolved VR other than `SQ` at length `0xFFFFFFFF` as
  unrecoverable structural corruption, so one private element the reader could not attribute cost the
  entire object: no patient, no study, no modality, a thrown `INVALID_FILE_META`. It now takes the
  same CP-246 route the Explicit VR path already took for exactly this shape (`VR=UN` plus undefined
  length), promoting the element to `SQ` with a `DICOM_UN_PARSED_AS_SQ` warning when the bytes really
  are items. PS3.5 section 7.5.1 requires decoders to support both item encodings, and losing vendor
  context is not corruption. Bytes that are genuinely not a sequence still throw exactly as before:
  the descent restores parser state and drops its warnings on failure. This matters most alongside
  the scoping fix above, which is what can now turn a profile-resolved `SQ` into a `UN`.
  `DICOM_UN_PARSED_AS_SQ`'s message now says the element _has_ `VR=UN` rather than _declared_ it,
  because on this new path nothing was declared: the `UN` is what VR resolution returned.

  This is the read-path half of the defect whose de-identify half shipped above. The harm differs
  and that is why they are separate: there, an out-of-scope reservation **retained** a private
  element and wrote it into serialized output; here it hands correct bytes the wrong meaning.

- **`DICOM_UN_PARSED_AS_SQ` printed the literal string `UN` where its message promised a tag.** The
  descent primitive is handed a byte range rather than a tag, but both call sites hold one, so it is
  threaded through rather than dropped.
- **A warning raised inside a Deflated dataset cut its strict-mode snippet from the wrong buffer.**
  The inner descent forwarded to the outer emission chokepoint, which closes over the **compressed**
  source, while the forwarded `position.byteOffset` indexes the **inflated** stream. The result was a
  confidently wrong 16 bytes. The descent now builds its own chokepoint over the inflated buffer; it
  shares the outer `warnings` array, `onWarning` and `strict`, so warning accumulation, callback
  ordering and profile posture are unchanged. **One thing does change and it is worth saying plainly:
  the snippet on that path now carries the real inflated bytes**, where before it carried whatever
  happened to sit at that offset in the compressed source. It was accidentally uninformative and is
  now correctly PHI, under the same `snippet`-is-raw-input contract every other path already has.
- **`DICOM_NONZERO_RESERVED_BYTES` reported the two reserved bytes as one 16-bit number**, which had
  to pick an endianness the reserved field does not have: it read unambiguously and was wrong under
  one of the two Explicit VR syntaxes. They are now reported separately, in wire order.

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

### Changed

- **Four documentation claims stated the reverse of the source and are corrected.**
  `spec-notes-tolerance.md`, `troubleshooting.md`, `cookbook.md` and `README.md` all said warnings and
  errors were "PHI-free by construction" while three factories interpolated values, and two of them
  added that a `DicomParseError` "retains no raw input snippet" while `DicomParseError.snippet`
  carries up to 16 bytes of the source as hex and its own JSDoc says so. The messages are now safe and
  the docs say why; the snippet is documented as the PHI it is. `troubleshooting.md` also records that
  **value-decode warnings never reach `ds.warnings`** at all (decode is lazy, so they ride on
  `el.value.warnings`), so a logger reading only the dataset array sees none of them.
- **The `DeidentifyReport` is no longer described as value-free without qualification.** It is, apart
  from `uidMap`, whose **keys are the source UIDs read out of the file** and kept so replacement stays
  consistent across a study. A Study or SOP Instance UID is a unique identifying number; that field is
  PHI and the rest of the report is not.

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

### Added

- **`UndefinedVrFinding`, `DeidentifyReport.undefinedVrElements` and
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`** (**28 Tier-2 codes, was 27**; the locked
  `WARNING_CODES` snapshot was updated deliberately). `MAX_UNDEFINED_VR_FINDINGS` (64) caps the
  record, never the emptying.

- **A conformant-tiling control family in `scripts/measure-sq-bound-grid.ts`**
  (`LEGIT_TILING_CARRIERS`) plus the `conformant tiling control emptied` counters in `--diff`. It
  exists to price the remaining binary-carrier leak, which `LEAKING` structurally cannot: a rule that
  empties every binary value whose tail tiles reads as `11 → 0` there and says nothing about what it
  destroyed. Restricted to stride-0 VRs, because `buildDicom` byte-swaps `OW`/`US` values under
  Explicit VR BE - a first draft included them and read 9 emptied rows where the honest number was 6.

- **`DICOM_SQ_NOT_DESCENDED`**, a Tier-2 warning code (25 total, was 24). Public surface: the locked
  `WARNING_CODES` snapshot was updated deliberately, and a profile may `escalate` or `suppress` it
  like any other code.

- **A slot table of consumer-controlled positions in the format**
  (`test/integration/phi-diagnostic-surface.test.ts`), bound to `assertNoDiagnosticPhiLeak` from
  `@cosyte/test-utils` (pin bumped to `^0.0.2`; a caret on a `0.0.x` resolves to that version exactly,
  so the old pin would have tested against a kit without the runner and passed). Thirty-eight slots,
  one test each, across all four transfer syntaxes and encapsulated pixel data, plus the de-identify
  surface and the serialized "safe to share" bytes.

  **It does not make the diagnostic surface PHI-free, and the difference matters.**
  `DicomParseError.snippet` is 16 raw source bytes as hex on every fatal and every strict-mode
  escalation. That is deliberate and long-standing (D-10), the docs name it as PHI, and no slot here
  can go red on it: the runner matches verbatim echoes, and hex is a re-encoding. What the table
  proves is that no _message_, position, thrown value or model identifier carries a planted byte.

  **It was run red on the base commit and named seven leaking slots**, which is the point of it. The
  suite it joins could not have done that: `test/property/_arbitraries.ts` blocks the leaking path
  three independent ways, and the sharpest is that its `TEXT_ALPHABET` excludes the backslash "so a
  single-valued element stays single-valued" - the exact byte `(0008,0005)` splits on before the
  leaking branch. It also never generates `(0008,0005)` or a Private Creator element at all.

  Two things the table pins that a marker search alone would not. Every slot names the diagnostic
  **code** it must reach, so a probe that was quietly normalized away cannot pass as evidence; the
  marker is invalid in `UI` and `CS`, the two VRs most worth probing here, and what makes it reach
  those branches anyway is that this parser validates no VR character set on read. And one test
  compares every emitted message against the **registry template** rather than searching it for the
  marker, so any interpolation of anything at all breaks it, whatever was planted.

- **`README.md` now opens with the shared Cosyte lockup, which follows the reader's color scheme**
  (`ASSETS-P8`). A `<picture>` block above the H1 carries the dark-ground org tile behind a
  `prefers-color-scheme: dark` media query and the light-ground tile as the inner `<img>`, so the
  mark sits on a ground that matches the page it is read on. It replaces the per-package banner,
  which baked the package name and the one-line tagline into pixels while the two lines directly
  beneath it repeated both: the lockup reads "Cosyte" where the H1 reads `@cosyte/dicom`, so the
  duplication goes and the heading stays. The alt text is content rather than decoration, because it
  is what a screen reader reads on the npm page, and it describes the mark itself rather than
  repeating the heading below it.

  **One stated reason is corrected rather than dropped.** The per-package banner was chosen as a
  plain markdown image, with no `<img>` and no `<picture>`, expressly because whether npm's markdown
  sanitizer preserves a `<picture>` was unverified. It has since been measured on a published
  package page: the `<img>` is hoisted out of its `<picture>` by npm's anchor wrapper, so the light
  cut renders there, and npmjs.com has no dark mode, so that is the correct cut. A renderer that
  strips `<source>` still renders the inner `<img>`, so the worst case is a light-ground mark on a
  dark page, never a missing or broken image. Both tile URLs were rechecked with `curl -I` as
  `200 image/png`, 10513 and 10455 bytes, before this landed, rather than taken from the `live` flag
  in `assets/published-urls.json`, whose own `$fields.status` note says to read `live` for what it
  is: a declaration made on evidence from another repo, never a fact checked there.

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

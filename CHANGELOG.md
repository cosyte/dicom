# Changelog

All notable changes to `@cosyte/dicom` will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
  `contextPath` pointing at a sequence item it was never in. It is swallowed once and relocated, not
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

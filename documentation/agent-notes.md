# Agent notes: the narrative behind `CLAUDE.md`

**This file is the long form. `CLAUDE.md` is the card.**

Every section below was moved here **verbatim** from `CLAUDE.md` on 2026-08-04, when
`<submodule>/CLAUDE.md` was first budgeted at write time (`CLAUDE-MD-AUDIT`), so that `CLAUDE.md`
stays a short card. The umbrella has since retired that budget and the hook that enforced it.
**Nothing was deleted.**
`CLAUDE.md` keeps the rules as one-line imperatives, and points at the section here that carries a
rule's measurements, citations, and refuter passes as `documentation/agent-notes.md#<anchor>`.

**Read the section before you re-open the thing its rule guards.** These are clinical-safety
lessons in a parser: every one of them cost a defect, a refused pass, or both. The compressed line in
`CLAUDE.md` is enough to stop you doing the wrong thing; it is _not_ enough to justify doing a new
thing in the same area.

Section order matches the order these entries had in `CLAUDE.md`'s Status list: most recent first,
then the shipped-phase history, then the generator/authority notes, then the older parser incidents,
then the two gates.

After those come seventeen records that were separate files under `documentation/agent-notes/`
until 2026-11-07, written there while this file was over a size limit the umbrella has since
retired. They are folded in unchanged apart from their heading levels and the pointers between
them. Each keeps its old file name as an explicit anchor, so
`documentation/agent-notes.md#dicom-phi-scan-report-cap` is the record that was
`dicom-phi-scan-report-cap.md`. Their opening notes about `CLAUDE.md` headroom describe that
retired limit; the card spec (`documentation/claude-card.md` in cosyte/config) sets the card's
limits now.

---

## The card's rules in full

`CLAUDE.md` keeps each rule as one short line. Below is every rule as the card carried it until
2026-11-07, when the card was cut to the spec in cosyte/config (`documentation/claude-card.md`).
Each still binds, and the pull request it names holds the failure behind it (`gh pr view <n>`).

- Diagnostics take no string from the file: messages come by code from the frozen registries in `src/parser/warnings.ts` and `src/parser/fatals.ts`, and factories take a position and structural constants. (#48, #80)
- A diagnostic names an element only through `renderTag` or `renderVr`, which check membership in a closed table; never render a raw tag, length or byte from the wire, `position.byteOffset` locates it. (#55, #88, #90, #92, #93)
- Cap every diagnostic a file can multiply once per run, on `DeidentifyContext`, not on `ProcessResult`: #53 shipped one unbounded. (#54)
- Keep the Annex E table current with the dictionary, and move the PS3.6 and PS3.15 pins under `vendor/nema/` together: `deidentify()` keeps a registered tag the table lacks, which once kept 35 identifying attributes behind a clean report. (#38, #146)
- PS3.15's repeating-group rows are masks over the even groups `5000`-`501E` and `6000`-`601E`, not exact tags: matched by exact tag, `(6000,4000)` Overlay Comments survived with a clean report. (#39, #40)
- Private block reservations are scoped per Data Set at every depth, on parse and on de-identify: an Item starts with an empty creator map and inherits the charset, not the reservations. (#48, #49)
- A retention decision never decides the Data Sets nested in the retained value: walk a vouched-for private `SQ`, never keep it verbatim. (#77)
- A report never reads as a scrub the run did not perform: a private value the run did not walk is removed and reported, not kept under `PatientIdentityRemoved = YES`. (#119, #121)
- An over-declaring element and a well-formed one are byte-identical, so the remedy is at the de-identify boundary or a warning, never a parser bound; a moved element can replace one with the same tag in the Data Set's `Map`. (#51, #70)
- Hand a descent the slice cut at its declared end, never the whole buffer, or the same bytes are read twice (#50); descend in one pass, as a try-then-fallback cost 2^depth. (#51)
- A PHI test needs a name-bearing payload and a mutation control that turns it red; a benign payload cannot fail. (#55)
- Quote a "red on base" test count only with its sha, re-run after every test you add or strengthen, with `src/` replaced rather than overlaid. (#71)
- Locate a spec section by its normative sentence: collect every heading match, keep those holding the sentence, require exactly one. First match reads the table of contents. (#40)
- Cite the clause that holds the sentence: PS3.5 §7.5.2 for an `SQ`'s own length and §7.5.1 for an Item's, PS3.15 §E.1.1 not §E.1, and §E.3.10 whole, both branches; `test/docs/spec-citations.test.ts` checks the docs. (#50, #54, #66)
- Run attw only as `pnpm attw`, which runs `cosyte-attw` from `@cosyte/script-utils`: the bare CLI exits 0 when the declarations are missing. (#59) Until 2026-11-07 it ran this repository's own `scripts/attw.mjs`, with `pnpm typecheck:exports` as a node16-profile alias; both are gone, since attw's default `strict` profile already grades everything `node16` does.
- `CHANGELOG.md` is generated from changesets: never hand-edit it or add an `[Unreleased]` heading, under which ten versions shipped calling released work unreleased. (#82)
- A changeset's opening sentence fits in 200 characters: the release gate refuses a longer one after the version commit, and nothing publishes. (#42, #57)
- `packageManager` is the only pnpm pin in CI: a `version:` input to `pnpm/action-setup` failed every regen run for weeks. (#34)

The card's gate also said, and it still holds: `pnpm test:coverage` enforces per-directory floors
set in `vitest.config.ts`; `.github/workflows/no-emdash.yml` also scans the PR title, body, and
commit messages; CI also loads `dist/` as ESM and as CJS (`pnpm smoke` does the same here), runs
actionlint, checks the manifest, and installs the packed tarball into a clean directory, which has
no script here; and a change that reaches the published package adds a changeset
(`pnpm changeset`).

---

## DICOM-DIAGNOSTIC-PHI-RESIDUALS

Two of the four instances the item filed are **CLOSED**, one is **left on purpose** as the product
call the item names, and the claim that ties them together is corrected on every surface that carried
it. Base for every figure below is `8b40b32`.

**▶ 🩺 THE TEST THAT DECIDES WHETHER A LEAKING TAG IS A DEFECT OR A PRODUCT CALL, AND IT IS NOT THE
ONE `#80` USED.** `#80` grouped `DICOM_PRIVATE_TAG_NO_CREATOR`, `embeddedAttributes[].hidden` and
`removedPrivateTags` as one product call, on the reasoning that all three name real tags on a
well-formed file. That is true of all three and settles none of them. The question that does settle
it is: **can any closed, published table vouch for this tag?**

- `removedPrivateTags` is a **private**-tag field by definition. PS3.6's registry is even-group and a
  `Profile`'s private dictionary is keyed by a creator string, so nothing can vouch, and a bound
  empties the field on every well-formed file. **Genuine product call, deliberately untaken.**
- `embeddedAttributes[].hidden` had a bound available and was not taking it. **Defect.** But the
  bound is the **literal** rows of Table E.1-1, not "the table" - see instance 2, where calling a
  repeating-group mask part of the closed set cost a refuted pass.
- `DICOM_PRIVATE_TAG_NO_CREATOR` names a private tag, so it has no membership bound - but the
  **signature** bound is available, and the tag is not lost, it moves to the model. **Defect.**

**▶ INSTANCE 1: THE PRIVATE-TAG TIER-2 FAMILY TAKES NO TAG. THREE CODES, NOT ONE, AND THAT IS THE
FINDING.** `resolveImplicitVR` emits `DICOM_PRIVATE_TAG_NO_CREATOR` and
`DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` from the **same branch on the same element**, so the
fixture the item cites rendered `"IN S"` into **both** messages on one parse. Closing only the code
the item named would have relocated the leak. `DICOM_PRIVATE_CREATOR_UNKNOWN` is the third: it needs
an active `Profile` and a reserved block, so **no fixture here reaches it and it is bound by argument
rather than by measurement** - stated that way rather than implied to be measured. All three now take
`position` only, which is the ratified remedy (`nonzeroReservedBytes`, `itemCrossesSequenceEnd`,
`duplicateTagInDataSet`, `duplicateFileMetaElement`, `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`).
**What it costs, and this is a real cost:** on a well-formed file with an unclaimed private block the
tag is no longer in the message. It is still the element's key in the Data Set, and
`position.byteOffset` locates the header, with the frame-of-reference caveat every offset here has.

**▶ 🛑 INSTANCE 2 TOOK THREE DRAFTS, AND THE TWO THAT FAILED ARE THE FINDING. A MASK MATCH PROVES A
RULE EXISTS; IT DOES NOT MAKE THE MEMBERSHIP FINITE.**

- **Draft 1 - `isActionable` alone.** The run's own resolved Annex E action, one authority, no second
  drifting copy. It **still listed `4D535449`**: the Basic Profile removes private attributes **as a
  class**, so `isActionable` answers `true` for every odd-group tag, and a fabricated header lands on
  an odd group about half the time.
- **Draft 2 - `isActionable` + an even group.** Refuted by a graded pass, on this module's own
  shipped fixture with only the four fabricated bytes changed. `annexE()` falls through to
  `matchRepeatingRule`, and `(50xx,xxxx)` Curve Data leaves the **whole 16-bit element number free**:
  16 groups x 65,536 elements against **652** literal rows, so 99.9% of what an even-group test
  admits is a mask whose free bits are raw document bytes. `"\fPAR"` - a form feed plus three letters
  of a surname - composes `500C5241`, which draft 2 admitted and which returns all four bytes with
  one typed read, exactly as `"SMIT"` did. **The draft's own JSDoc wrote the counterexample into the
  sentence** ("the action table has to name the tag, _or a repeating-group mask has to_") and called
  the result closed anyway. This is `#80`'s label-versus-body rule one level up, applied to a table
  instead of a spec section.
- **Draft 3, shipped - `isActionable` + a LITERAL Table E.1-1 row** (`annexE(tag)` resolves with no
  `repeatingGroup`). 652 rows, finite and published, so a fabricated window that spells one discloses
  a table entry rather than a document byte - the `renderVr`-with-34-VRs trade, which is only honest
  against a set of that size. It **subsumes** the odd-group case: `ANNEX_E` has **0** odd-group
  literal rows, asserted by a test rather than assumed, so a future edition that adds one reds.

**Consequences that must travel with the field:** `hidden` can be **empty on a real finding** - a run
whose only actionable members are private attributes, Curve Data or Overlay elements names none of
them - and it is **still uncapped**; the bound is on what an entry can be, not how many. Both costs
are real and stated rather than minimised: a genuinely swallowed private attribute and a genuinely
swallowed `(60xx,3000)` are emptied and counted but not named. The warning's `{n}` is `elementCount`,
deliberately, so narrowing `hidden` did not silently re-scope a shipped message from "how many
elements were swallowed" to "how many this run acts on" - and its closing sentence was reworded too,
because it pointed at a field that can now be empty.

**▶ 🔴 INSTANCE 3 IS THE HALF WITH THE MOST IN IT, AND THE SWEEP FOUND A FIFTH INSTANCE NOBODY HAD
FILED.** The docs claim was already corrected once by `#80` to "safe on a well-formed file, not
unconditionally safe" - so this is its **second** wording, and a third means the sentence is deleted
rather than tried again. Two things were wrong with it, both found by measuring rather than reading:

1. **The named carrier is not the only one, and after this slice it is not a carrier at all.** A
   sweep of every under-declare delta on both transfer syntaxes, hunting every 4-byte window of the
   payload rendered as a tag, every 4-byte window rendered as a `readUInt32LE` decimal and every
   2-byte window rendered as a VR, found **three** leaking Tier-2 codes on base, not one:
   `DICOM_PRIVATE_TAG_NO_CREATOR` and `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` under Implicit
   VR LE, and **`DICOM_ODD_LENGTH_VALUE_PADDED` under Explicit VR LE**. The third is the worse one:
   it renders a fabricated tag **and** a fabricated 32-bit declared length, eight consecutive payload
   bytes in one message - `4E495320` (`"IN S"`) with `542003027` (`"SON "`) at delta -12, and
   `42204152` (`" BRA"`) with `1213483341` (`"MITH"`) at -16. **It is `PRE-EXISTING`, it is left
   open, and it is why the claim stays conditional after two instances closed.** It is not this
   item's to take: that code fires on **any** tag, so withholding unconditionally costs every
   real-world odd-length pad its tag. The remedy that would work is a **membership** `renderTag` -
   render a tag PS3.6's registry names, withhold one it does not - which is a package-wide change to
   every message plus a separate answer for the raw `{n}`. Its own slice, pinned meanwhile by
   `oddLengthValuePaddedStillNamesAFabricatedTagAndLength`.
2. **The claim was attached to the wrong field.** Every fixture that produces this leak **dies before
   a `Dataset` exists**: the parse reaches the truncation guard, so the message travels on
   `onWarning` and on the `{ strict: true }` `DicomParseError`, never onto a surviving `ds.warnings`.
   Nine desync deltas x two syntaxes x four tail lengths, plus a 4 KiB/20 KiB/70 KiB padded tail set
   and a defined-length-sequence-item variant, produced **zero** surviving `ds.warnings` carrying a
   leak. **That is a fact about those fixtures and NOT a claim that `ds.warnings` is safe** - the
   docs say so in those words, because the difference between "not measured" and "cannot happen" is
   exactly what this repo's refusals have been about.

**▶ THE CARRIERS OF THE CLAIM WERE FOUND BY FOLDING NEWLINES, NOT BY `grep`.** A line-based search
misses a sentence that wraps, and `#85`'s cookbook had just added a fresh one. The sweep collapses
all whitespace per file and then windows around `safe to log`, `PHI-free`, `PRIVATE_TAG_NO_CREATOR`
and `embeddedAttributes`, over every tracked `.md` and `.ts`. Corrected: `README.md`,
`docs-content/limitations.md`, `docs-content/troubleshooting.md`,
`docs-content/spec-notes-tolerance.md`, `docs-content/cookbook.md`, `src/deident/types.ts`,
`src/deident/embedded.ts`, `src/parser/warnings.ts`, `src/parser/element-header.ts`. A count is not
quoted here for the same reason no other count in this file is.

**▶ FIGURES. BASE IS `8b40b32` AND NO HEAD SHA IS QUOTED, DELIBERATELY** - a pre-merge head sha is
wrong the moment the PR squash-merges. Head: **1,207 passing + 1 todo across 72 files, 0 red**. Base
`src/` with the head `test/` tree (replaced, not overlaid; all 72 files still collect): **26 of 1,208
red across 4 files.** Re-run after the graded pass added tests rather than carried forward - it read
25 of 1,206 before.

**🛑 THAT 26 IS NOT 26 BEHAVIOURAL FINDINGS, AND SAYING SO WOULD BE THE `#78` DEFECT AGAIN.** Split
it before quoting it. **Ten** are decoder rows that grade the repertoire and header conjuncts and are
red only because `findEmbeddedAttributes` returns a record where base returned an array - an API-shape
casualty, no behaviour in them. The **sixteen** that are behavioural evidence:

- Instance 1 - `tierTwoEscalationNoLongerNamesAFabricatedTag`, `bothPrivateTagCodesAreClosed`, and
  the three `takes no tag at all` factory rows in `test/parser/warnings.test.ts`.
- Instance 2 - `embeddedAttributesHiddenNoLongerCarriesValueBytes`, `the fabricated neighbour is not
named`, `a REPEATING-GROUP MASK hit is excluded`, `an odd group is excluded even when the run's own
action table acts on it`, `a run whose only actionable tags are private`, `elementCount counts the
whole run`, `non-vacuity`, plus the four detector rows whose fixtures carry a tag with no literal
  Table E.1-1 row.

**Three rows are GREEN ON BASE BY DESIGN and must stay that way**: `oddLengthValuePaddedStillNamesA
FabricatedTagAndLength` pins a `PRE-EXISTING` residual, so it has to reproduce on both trees or it is
not a residual pin; `the filter does not decide WHETHER a run is reported` grades an invariant this
slice did not move; and `no literal Table E.1-1 row is an odd group` grades the generated table.

**The RED-before evidence is structural rather than incidental**: the two `#80` residual rows
**asserted the leaks** and now assert their absence, so each is red on base by construction. Both keep
a non-vacuity control - instance 1 rebuilds `0.0.13`'s own message template and asserts the detector
still catches **that**; instance 2 asserts the run really holds two elements while `hidden` names one,
and that the fixture's bytes really do spell the surname. A green run cannot mean "the fixture never
carried the thing". The mask row carries its non-vacuity on the **premise** as well as the outcome:
it asserts that `500C5241` really is actionable, really is an even group, and really resolves only
through `50xxxxxx` - so it cannot pass because the counterexample stopped being one.

**▶ REFUTER PASSES: 2** - `REFUTED`, then `NOT REFUTED` on the remedy. Pass 1's blocker is instance
2's draft 2 above, and its two minor findings are here too: the
`DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED` message's closing sentence, and the `hidden` disclosure on
`DeidentifyReport` - which had been reworded twice by then, so it was **deleted from that list**
rather than given a third wording, per this repo's own rule.

**▶ 🛑 PASS 2 PASSED THE SLICE AND STILL FOUND TWO MINORS INSIDE THE REMEDY, BOTH OF THEM CLAIM
DEFECTS OF THE SHAPE THIS REPO LOSES PASSES TO. THE LESSON IS THE SECOND ONE.**

1. **The residual list existed in THREE places in `src/`,** and deleting `hidden` from the
   authoritative copy on `DeidentifyReport` left `src/deident/index.ts` and `src/deident/deidentify.ts`
   still naming it with the retracted wording. Worse, and older: **neither of those copies ever named
   `contextPath`** - so the drift had already been pointing the _unsafe_ way before this slice pointed
   it the safe way. Both copies are **deleted**, not resynced, and `DeidentifyReport` now says it is
   the only copy. A list in three places drifts in three directions.
2. **The reworded warning string dropped one of the filter's two conjuncts.** "names the ones with a
   literal Table E.1-1 row" promises a superset: `hidden` is `isActionable && isTableBound`, so under
   `RetainUIDs` a swallowed `(0020,000D)` **has** a literal row and is still unnamed, and a reader
   would wrongly infer it had none. Measured by the pass on a synthetic file. A message is
   consumer-facing, so a bound stated in one is the claim - the same rule that keeps a citation out of
   `DICOM_DUPLICATE_FILE_META_ELEMENT`. Both conjuncts are in the string now, matching
   `troubleshooting.md`, which had them right.

**▶ WHAT PASS 2 COULD NOT BREAK, RECORDED BECAUSE IT IS STRONGER THAN THE CLAIM.** It counted the
table in the vendored source rather than trusting the figure - `vendor/nema/part15/.../part15.xml`,
`table_E.1-1`: **652 literal rows and exactly 3 masks**. And it measured something the docs do not
claim and should not start claiming loosely: **0 of the 652 rows are all-printable ASCII**, so an
admitted entry always contains a non-printable byte. That is a property of the current edition's
table, not a bound this package enforces, which is why it is recorded here and not in a docstring.

### The fifth and sixth instances: `renderTag` is a membership test, and a raw wire number has no test at all

The sibling half above closed instances 1 and 2, measured a **fifth** nobody had filed, and named its
remedy without taking it: _a membership `renderTag`, plus a separate answer for the raw `{n}`,
package-wide, not a rider on another slice._ This is that slice. It also found a **sixth** instance in
the same family, on the way.

**▶ THE PREMISE WAS MEASURED BEFORE ANY CODE WAS WRITTEN, WHICH IS WHY THERE IS A SIXTH.** The sweep
that reproduced instance 5 was widened by one arm before it was run: every 4-byte window of the
payload rendered as a tag and as a `readUInt32LE` decimal, every 2-byte window as a VR - and, new,
**every single byte as a decimal.** Ten under-declare deltas x two transfer syntaxes produced **eight
leaking rows across two codes**, not one:

- `DICOM_ODD_LENGTH_VALUE_PADDED`, **2 rows**, tag AND 32-bit length: `4E495320` (`"IN S"`) with
  `542003027` (`"SON "`) at delta -12, and `42204152` (`" BRA"`) with `1213483341` (`"MITH"`) at -16.
  The known fifth instance.
- `DICOM_NONZERO_RESERVED_BYTES`, **6 rows**, the two reserved bytes as two decimals: `" N"`, `"SO"`,
  `"TH"`, `"MI"`, `" S"`, `"IN"` at deltas -8 through -18. **The sixth instance, filed nowhere.** This
  code already withheld its **tag**, and the reason it gave was that its trigger IS "this header may
  not be a header". It then printed two bytes off that same header. **The bound was half a bound, and
  no detector in this repo had ever looked for a single byte as a decimal.** A detector that has never
  looked for a shape has not cleared it.

**▶ 🩺 THE TWO HALVES CLOSE DIFFERENTLY, AND THAT SPLIT IS THE WHOLE SLICE.** The item's deciding test
is _can a FINITE table vouch for this?_

- **A tag can be vouched for.** `renderTag` moves to `tokens.ts` beside `renderVr` and tests
  membership in **PS3.6's element registry**: `Dictionary.lookup` answers, or the token renders
  `<withheld>`. 5,221 literal rows, against the 34 `renderVr` checks. The module doc that said
  `renderTag` was _deliberately not here, because a tag has only a shape to test_ is corrected rather
  than left standing.
- **A raw number cannot.** There is no set of "lengths PS3.6 names", so nothing is available to check
  and the bound has to be **the factory signature**, the remedy this package keeps arriving at. No
  count is written here: the factories that take one are the ones whose JSDoc says so. `oddLengthValuePadded` loses its declared length; `nonzeroReservedBytes` loses both byte
  values; `pixelDataLengthMismatch` loses its declared length **although it has no call site** -
  with none, the change costs nothing today and no later measurement would catch it once a phase
  switches the code on.

**▶ 🛑 LITERAL ROWS ONLY. THE MASK RULE IS INHERITED FROM THE SIBLING HALF AND IT COST A PASS THERE.**
`Dictionary.lookup` answers `undefined` for a tag that resolves only through a repeating-group family,
and that exclusion is load-bearing rather than incidental: `(50xx,xxxx)` Curve Data leaves the whole
16-bit element number free, so a family test admits 16 x 65,536 tags whose free bits are raw document
bytes. `"\fPAR"` composes `500C5241`, which a family test admits and which returns all four payload
bytes with one typed read. The row that pins this asserts the **premise** too - that `500C5241` really
does resolve through `50xx` and really is not a literal row - so it cannot pass because the
counterexample stopped being one.

**▶ ONE MORE SLOT WAS EMPTIED BY THE RULE, NOT A JUDGEMENT, AND THE HONEST ANSWER WAS TO DELETE IT.**
`DICOM_GROUP_LENGTH_IN_DATASET` fires on a `(gggg,0000)` outside File Meta. PS3.6 carries
**exactly one** literal row ending `0000` - `(0002,0000)`, which is File Meta and never reaches this
code - so **every** tag that slot could ever have rendered was already `<withheld>`. Measured over the
suite: four distinct tags reached it, four withheld. A slot that can never render is not harmless; it
invites a future call site to pass one. Bound out of the signature.

**▶ 📏 THE COST, MEASURED OVER THE SUITE RATHER THAN ARGUED.** A probe on the single construction
point recorded every `(code, tag)` pair the suite renders: **50 pairs unaffected, 14 withheld.** Of the 14, **2** are the fabricated tags this slice exists for; **8** are private tags
(`DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_SQ_NOT_DESCENDED` and the two
`deident` codes); **4** are Group Length tags. `DICOM_VR_MISMATCH` is **12 rendered, 0 withheld**, and
that is structural rather than lucky: it fires only where the dictionary already has an entry for the
tag. **No repeating-group member appears in the suite at all**, so `(6000,3000)` Overlay Data losing
its name in a message is a real cost that this repo's fixtures do not exercise - it is pinned by a
direct unit row instead, and stated in the consumer docs rather than left to be discovered.

**▶ `(0002,0000)`'s DECLARED GROUP LENGTH STAYS, AND THE ASYMMETRY IS STRUCTURAL.** `parseFileMeta`
runs **once** per parse, from `parseDicom`, at the post-`DICM` offset, and is never nested;
`(0002,0000)` is the first element it reads or the code does not fire at all (its absence raises
`DICOM_FILE_META_GROUP_LENGTH_MISSING`). So the four bytes are that attribute's own Value Field at a
structurally determined offset, and no Data Set value can be read into that position - the same
argument `duplicateFileMetaElement` already makes for its offset being file-absolute. Measured as
well as argued: the desync sweep reaches that code **zero** times.

**▶ 🔴 THE PASS-1 BLOCKER, AND IT IS THE LESSON OF THIS SLICE: THE DRAFT DELETED A VERDICT AND
REPLACED IT WITH AN ABSOLUTE MECHANISM STATEMENT THAT WAS FALSE.** Six artifacts, five of them
consumer-facing and one of them the public `ParseOptions.strict` JSDoc, said the one raw declared
length still printed anywhere was `(0002,0000)`'s. **Two more are.**
`DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` and `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` render
`Element.rawBytes.length`, which is not a count this parser invented: it **equals the declared Value
Length** off the element header. Reproduced independently before the remedy, on the same
under-declare construction every instance of this item uses - a fabricated header whose length field
is `"SO\0\0"` renders **`20307`**, and one `readUInt32LE` reverses it. The first of the two is the
sharper: **it withholds tag and VR on the stated ground that the header may be fabricated, then
prints the length off that same header.** The second renders `<withheld>` for its tag _because of
this slice_ and still prints the length.

**A SEVENTH INSTANCE, THEREFORE, AND IT IS `PRE-EXISTING`**: byte-identical templates and signatures
on `ff1a64a`, parse path untouched. **Not this slice's to take** - binding those signatures is a
second remedy on a leak it did not introduce, and the grade said so. **The remedy was to CORRECT THE
CLAIM, NEVER WIDEN THE GUARD**, in all six artifacts plus the registry module doc, plus
`deidentUnauditableCodesStillRenderARawWireLength`, an asserted row **green on both trees** with a
non-vacuity assertion. **A disclosure that names a test must name one that exists.**

**▶ 🩺 AND THE SWEEP'S CHANNEL WAS UNSTATED, WHICH IS WHY THE ARTIFACTS COULD READ IT AS PACKAGE-WIDE.**
It calls **only `parseDicom`**, so it can never reach a code `deidentify()` alone emits, and two of
those are the seventh instance. Renamed to say `PARSER`, its docstring states the limit, and the
residual row sits beneath it. A second gap is named rather than closed: `renderings()` has **no
2-byte-as-`uint16` arm**, which is exactly a short-form Value Length. No entry renders one today, so
the arm would have nothing to hunt and no non-vacuity control. Stated so nobody infers coverage from
silence.

**▶ AND A COUNT WENT INTO CONSUMER PROSE AND WAS WRONG IN THE SAME PARAGRAPH THAT LISTED IT.**
`troubleshooting.md` said "Five codes take no tag parameter at all" and then named six, one of which
this slice had just added. **Deleted, not incremented** - the rule this item enforces, and
`CLAUDE.md`'s own "do not write a warning-code COUNT into prose".

**▶ 🛑 PASS 2 PASSED THE SLICE AND STILL FOUND TWO MINORS IN THE REMEDY, AND THE FIRST IS THIS
DISEASE A THIRD TIME IN ONE SLICE: THE REMEDY FOR A FALSE COUNT WAS TWO MORE COUNTS THAT DISAGREED.**
"Two exceptions" in four consumer artifacts against "Three" in the changeset and the registry doc,
over the identical codes. **Every numeral deleted, none renumbered.** The second: **the pin was
singular and the claim was plural** - one row asserted `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`
while five artifacts said the pair was pinned, and the two have **different producers**, so one
fixture cannot reach both. A second fixture was written rather than the claim narrowed. It also corrected a wording exact only where `rawBytes` is value-only:
`isFullSpanElement` makes it declared-plus-header for an undefined-length element and for a
defined-length `SQ` under Explicit VR.

**▶ PASS 2 FILED AS BACKLOG RATHER THAN GATED**, all with the seventh instance: `deident-unauditable-sequence.test.ts`'s row titled _"carrying no value"_ for the very code
now disclosed as printing a header-derived length; the `length` arm's **`>= 7` digit floor** in
`renderings()`, which is why the 5-digit `20307` is invisible to that detector and is a wider gap
than the missing `uint16` arm; and the seventh instance itself.

**▶ 🛑 THE "SAFE TO LOG" SENTENCE IS DELETED, NOT REWORDED A THIRD TIME - THIS REPO'S OWN RULE, APPLIED
TO ITS OWN LINEAGE.** `#80` wrote it once ("safe to log whole on any well-formed file"), the sibling
half corrected it to "safe on a well-formed file and not unconditionally safe", and a third wording
was due. Every carrier now states the **mechanism** - which slot is a membership test, which is a
signature bound - and states **no verdict**. That is `#79`'s remedy shape
(delete the prose enumeration, replace it with something that cannot go stale) applied to a sentence
instead of a list. The carriers were found by **folding newlines** and windowing, not by `grep`:
`README.md`, `docs-content/limitations.md`, `docs-content/troubleshooting.md`,
`docs-content/spec-notes-tolerance.md`, `docs-content/cookbook.md`, `src/parser/types.ts`. Eight more
`src/` JSDoc paragraphs asserting _"`renderTag` shape-checks a tag and therefore cannot refuse one"_
were corrected to the past tense in the same pass - a claim that was true when each bound was taken
and is false now, in `warnings.ts` and `fatals.ts`.

**▶ RECORDED BECAUSE IT IS STRONGER THAN ANYTHING CLAIMED, AND FOR THE SAME REASON THE `E.1-1` FIGURE
IS: 0 of the 5,221 literal rows have all four WIRE bytes in printable ASCII.** So a fabricated window
over printable text cannot spell an admitted tag on this edition. **That is a property of the pinned
PS3.6 2026c, not a bound this package enforces**, which is why it is here and not in a docstring or a
test - exactly where the sibling half's `652`/`0` measurement was put.

**▶ FIGURES. BASE IS `ff1a64a` AND NO HEAD SHA IS QUOTED, DELIBERATELY** - a pre-merge head sha is
wrong the moment the PR squash-merges. Base, whole suite: **72 files, 1,207 passing + 1 todo, 0 red.**
Head: **73 files, 1,216 passing + 1 todo, 0 red.** Head tests against base `src/` (**replaced**, not
overlaid - `rm -rf src && git checkout ff1a64a -- src`; all 73 files still collect): **14 of 1,217
red across 4 files.** Re-run after the pass-1 remedy added a row rather than carried forward: it read
14 of 1,216 before.

**🛑 THAT 14 IS NOT 14 BEHAVIOURAL FINDINGS, AND SAYING SO WOULD BE THE `#78` DEFECT AGAIN.** Split it
before quoting it.

- **FOUR are behavioural**, and each asserted the leak before it asserted its absence:
  `oddLengthValuePaddedNoLongerNamesAFabricatedTagOrLength` and
  `nonzeroReservedBytesNoLongerNamesItsTwoRawHeaderBytes` in
  `test/integration/fatal-diagnostic-surface.test.ts`, the standing desync sweep beside them, and the
  `OB` half of _"a FABRICATED header keeps the tag-free diagnostic"_ in
  `test/integration/deident-private-reservation.test.ts`.
- **TEN are red because the surface does not exist on base, not because base rendered anything.** Six
  in the new `test/parser/tokens.test.ts` - `renderTag` is module-private to `warnings.ts` at base, so
  every row that calls it throws on the import rather than on a string - and four factory rows in
  `test/parser/warnings.test.ts`, each of which asserts an arity that differs at base and fails on
  that line before reaching its message assertion. They grade the new bound on head. They are **not**
  evidence that base leaked.

**TWO ROWS ARE GREEN ON BASE BY DESIGN AND MUST STAY THAT WAY**: _"the closed set is enumerable"_
grades the generated registry, which this slice did not move; and
`deidentUnauditableCodesStillRenderARawWireLength` pins a `PRE-EXISTING` residual, so it has to
reproduce on both trees or it is not a residual pin. Both confirmed green on `ff1a64a` in the same
run.

**The non-vacuity controls are on the rows that closed, not only on the outcome.** Each of the two
inverted pins rebuilds `0.0.14`'s own message template over the bytes its fixture really lands on and
asserts the detector still catches **that** - so a green run cannot mean the search broke. Every
offset in them is measured off the fixture rather than typed: a first draft of both asserted the wrong
windows from memory and was caught by its own assertions.

**▶ WHAT WAS DELIBERATELY NOT TAKEN.** `report.removedPrivateTags` is untouched. It is a
**private**-tag field by definition, so no closed table can ever vouch for its contents and a bound
empties it on every well-formed file - the genuine product call the item names, and not this slice's.
`report.unauditableSequences[].tag`, `report.uidMap` and `contextPath` are model fields rather than
messages and are equally untouched; `#78`'s residual row now asserts **both halves separately**, so
the message closing here cannot be read as the report's.

### The seventh instance, and the digit floor that hid it

The half above measured a **seventh** instance, disclosed it in six artifacts, pinned it as an
asserted row and deliberately left it. This is the slice that takes it. **The more valuable half is
not the instance: it is the tripwire gap that made the instance invisible**, and that gap is the
transferable part.

**▶ 🩺 THE DETECTOR WAS WIDENED BEFORE ANY CODE WAS TOUCHED, WHICH IS THE METHOD THE SIXTH INSTANCE
ESTABLISHED AND THE ONLY REASON THE EXTENT HERE IS A MEASUREMENT.** `renderings()`'s `length` arm
carried a **`>= 7` digit floor**, and the sentence beside it stated the defect without seeing it:
_"every 4-byte window of a printable-ASCII payload exceeds 1,000,000,000, so nothing in this fixture
set is skipped by the floor."_ That is true and it is the whole problem. **A declared Value Length is
only reachable through a parse if the buffer really holds that many bytes**, so every fabricated
length a fixture can drive through this library has zero high-order bytes and therefore a SHORT
decimal. `"SO\0\0"` renders `20307`: five digits, two of them letters of a surname, and structurally
under the floor. The floor was not a conservative filter on an arm that worked - **it excluded the
entire class of length leak that can actually happen.**

**A GUARD THAT HAS NEVER BEEN POINTED AT AN INPUT HAS NOT CLEARED THAT INPUT, AND A GUARD WITH A
FLOOR HAS NOT CLEARED ANYTHING BELOW THE FLOOR.** Same shape as the `phi-scan` that printed clean over
a root it never opened, and as the `byte` arm the sixth instance had to add.

**▶ THE COLLISION THE FLOOR WAS FOR IS ANSWERED BY MATCHING, NOT BY SKIPPING, AND THE WIDENING IS
STRICTLY ADDITIVE.** A rendering of seven digits or more keeps the original `String.includes` search
unchanged, so nothing the shipped detector caught can stop being caught. A shorter one must equal a
**whole maximal digit run** of the message, so `20307` hits `"its 20307 recorded bytes"` and not
`"offset=120307"`, and `PS3.15` and a tag's own digits cannot answer the question by accident.

**▶ 📏 WHAT THE WIDENED DETECTOR FOUND, POINTED AT THE `deidentify()` CHANNEL.** That channel is the
one the standing desync sweep states it can never reach: both `DICOM_DEIDENT_*_NOT_AUDITABLE` codes
are emitted by `deidentify()` and by nothing else, and every desync fixture dies at a Tier-3 fatal
before `deidentify()` runs. With the floor off, over both producers: **the two `{n}` slots this slice
closed, and nothing else.** The two `tag` hits it also returned are `00080008` - a **literal PS3.6
row**, rendered by `renderTag`'s membership test on every file **by the decision `#90` ratified**, and
scoped out of the sweep explicitly rather than left to pass quietly. The sweep pins that scoping is
not a hole: a fabricated tag PS3.6 has no row for is still a finding.

**▶ THE REMEDY IS THE ONE THIS PACKAGE KEEPS ARRIVING AT: THE FACTORY SIGNATURE.**
`sequenceNotAuditable` takes `(position, tag)`, `undefinedVrNotAuditable` takes `(position)`. A raw
length has neither a shape nor a membership for a renderer to test, so there is no `renderLength` and
there must not be one. `undefinedVrNotAuditable` is the sharper of the two and always was: **it
withheld the tag and the VR on the stated ground that the header may be fabricated, then printed the
length off that same header** - it withheld the two fields a renderer could check and printed the one
it could not.

**▶ WHAT IT COSTS, STATED RATHER THAN MINIMISED.** A consumer reading only the message no longer sees
how many bytes were emptied. The number is not lost: it is on
`report.unauditableSequences[].byteLength` and `report.undefinedVrElements[].byteLength`, and the
`{tag}` and `{n2}` byte offset still locate the element. **Those two model fields JOINED the
`DeidentifyReport` not-value-free list rather than always having been on it** - binding the message
left them as the number's only publisher, which is a smaller surface and not a closed one.

**▶ 🔴 STILL A PRODUCT CALL, AND UNTOUCHED.** `report.removedPrivateTags`,
`report.unauditableSequences[].tag`, `report.uidMap`, `contextPath` and the two `byteLength` fields
are **model fields, not messages**. A bound on any of them empties the field on every well-formed
file, where the content is exactly the audit information it exists to carry. Named, disclosed, and
deliberately not narrowed here.

**▶ AND THE MIS-TITLED ROW, WHICH IS A CLAIM DEFECT OF THE KIND THIS REPO GRADES HARDEST.**
`deident-unauditable-sequence.test.ts` carried a row titled _"carrying no value"_ for the very code
disclosed as printing a header-derived length. Its body asserted that three values planted elsewhere
in the file were absent - which a message built from a frozen registry cannot carry in any case - so
the title asserted the opposite of a live disclosure while the check underneath it could not have
failed. **A test named for the thing it did not check occupies the slot.** Corrected rather than
deleted, because after this slice the title is true and there is now something real for it to assert.

**▶ ONE MORE FIXTURE THAT HAD NEVER RUN, FOUND IN THE SAME FILE AND THE SAME CLASS.** The standing
desync sweep listed ten under-declare deltas per syntax, and `-20` under-declares an 18-byte payload
past zero, so `buildDicom` threw while the FIXTURE was being constructed - **inside the `try` that
exists to swallow the parse failures those fixtures are designed to end in**. Both `-20` rows never
reached a parse and were counted as swept. The fixture is built outside the `try` now and `-20` is
off the list, so a delta the helper cannot express fails loudly instead of reading as clean.

**▶ FIGURES. BASE IS `b8a3fb5` AND NO HEAD SHA IS QUOTED, DELIBERATELY** - a pre-merge head sha is
wrong the moment the PR squash-merges. Head, whole suite: **73 files, 1,220 passing + 1 todo, 0 red.**
Head tests against base `src/` (**replaced**, not overlaid - `rm -rf src && git checkout b8a3fb5 --
src`; all 73 files still collect): **5 of 1,221 red across 3 files.**

**🛑 A `git stash push -- src/` DOES NOT PRODUCE THIS FIGURE ONCE THE SLICE IS COMMITTED**, and a
first attempt at the re-run reported the whole suite green off exactly that mistake: with the change
already in a commit there is nothing in `src/` to stash, so it measured head against head. Replace the
directory from the base sha.

**🛑 THAT 5 IS NOT 5 BEHAVIOURAL FINDINGS.** Split it before quoting it.

- **THREE are behavioural**, and each asserted the leak's absence against a message base really did
  render: `deidentUnauditableCodesNoLongerRenderARawWireLength` and _"the deidentify() channel is
  swept, with the floor off"_ in `test/integration/fatal-diagnostic-surface.test.ts`, and the
  corrected _"renders no number the header supplied"_ row in
  `test/integration/deident-unauditable-sequence.test.ts`.
- **TWO are red because the SIGNATURE differs on base, not because base rendered anything.** The two
  factory rows in `test/parser/warnings.test.ts` fail on their arity assertion before reaching the
  message check - and on base, called with the head arity, the missing argument renders `0` rather
  than `20307`, so those message assertions would have passed. They grade the new bound. They are
  **not** evidence that base leaked.

**The non-vacuity controls are on the rows that closed, not only on the outcome.** Each rebuilds
`0.0.14`'s own template over the number the fixture really produces and asserts the widened detector
still catches **that**; the tripwire finding is pinned directly, by asserting that `20307` is under
seven digits and that its two high bytes are zero, so a future re-introduction of the floor cannot be
argued as harmless.

---

---

## DICOM-ITEM-CROSSES-RESIDUALS

**Provenance:** no new normative citation. Every claim below is a measurement taken on this repo at
`b7a77fe` and re-runnable from `test/integration/phi-diagnostic-surface.test.ts`; the PS3.5 sections
this lineage rests on were pinned by earlier slices under `vendor/nema/` and none moved here.

The residual this item carried was undecidable; the one next door on the same field was not.

**▶ THE EVIDENCE FOR `CLAUDE.md`'s BASE-RED TRAP LIVES HERE, RELOCATED RATHER THAN DELETED.** Two
"N of M tests run red on base" claims in this repo were wrong against `main` **in opposite directions
at once**, and one went stale at `6 of 9` inside a single draft. That is why the line demands a sha
and a re-run after every test you add or strengthen.

**▶ MEASURE THE PREMISE FIRST, AND IT PAID A THIRD TIME.** At `b7a77fe` the mis-structure is live and
reproduces exactly as disclosed: the over-declaring file relocates `(0010,0020)` into the item, the
report reads `contextPath: ["00081115[0]"]`, and the under-declaring shape leaves it at the root with
none. Nothing was stale. What the measurement changed was the reading of what that means.

**▶ 🛑 "NAMES AN ITEM IT WAS NEVER IN" IS A CLAIM DEFECT, AND IT IS DELETED, NOT REWORDED A THIRD
TIME.** The sentence asserts which of two byte-identical files you have. On the partner file -
`sqUnderDeclares()` in `test/integration/explicit-sq-item-bound.test.ts`, the _same bytes_ assembled
from the opposite intention - the element genuinely **is** inside the item and the identical
`contextPath` is exactly right. So there is no fact of the matter to be wrong about, calling it an
unfixed residual promises a repair that must invent the distinction five graded attempts at a bound
already failed to find, and it is the very distinction the backlog item forbids proposing. It had
been narrowed **once** already, in the troubleshooting row (unconditional to shape-specific), and
left standing in five other artifacts. Two wordings is this repo's delete signal. What replaces it is
the two-row measurement that was already sitting under it, with **neither row labelled the mistake**.
**The relocation half stays exactly as it is: nothing shipped that prefers one length field.**

**▶ 🩺 THE DECIDABLE HALF NOBODY HAD ASKED ABOUT: `contextPath` IS NOT STRUCTURAL AND SIX ARTIFACTS
SAID IT WAS.** A segment is `TAG[index]`; the tag half is whatever tag `descendSequence` walked, read
straight off the wire, bound by nothing. `attributes[].tag` is bound to a tag the Part 6 / Annex E
tables carry a row for - **membership in a closed table, this repo's own standard since
`phi-warning-message-leak`** - and that contrast is the finding. **It is NOT the only report
identifier read off the wire, and TWO graded passes refused that wording** - the second because the
head clause of this very sentence still carried the refuted universal after the first correction:
`removedPrivateTags` and `unauditableSequences[].tag` are as well, and both were already disclosed
as such. The defect here is the missing disclosure, not a unique unboundedness. Measured on a
synthetic `LO` carrier holding `"MRS BRAIN SMITHSON"` under-declaring by four, so the reader
resynchronizes onto the surname's last four bytes as a tag and reads `SQ` as their VR:
`contextPath: ["53484E4F[0]"]`, which is `"HSON"` in wire order. Surname to `"DAVIDSON"` gives
`"53444E4F[0]"` (`"DSON"`), which is the mutation control; a conformant file gives `"00081115[0]"`,
the tag the sender wrote, which is the negative control and the reason the field is still published.
**No warning is raised and every finding array is empty**, so the "structural fields are safe to log"
guidance was all a consumer had.

**▶ 🛑 AND THE FIRST DRAFT'S SUPERLATIVE WAS REFUTED ON THE SLICE'S OWN FIXTURE. DO NOT WRITE IT
AGAIN.** It said, in six artifacts including a public `.d.ts` docstring, that `contextPath` was **the
only trace of that header in the whole output**. Run `deidentify` on that same file and the returned
`Dataset` still holds the fabricated `(5348,4E4F)`, so `serializeDicom` writes the whole header back
out - `"HSON"` at offset 352, and `"DSON"` there for the mutation control - inside an object stamped
`(0012,0062) = YES`. The nested `(0010,0020)` **is** emptied, which is exactly why the report reads
clean. So the re-emission is the already-disclosed under-declared-carrier class and not this field's
doing, and **neither is a bound on the other: redacting `contextPath` from a log leaves the object
carrying the same four bytes.** That was an `INTRODUCED` blocker because the superlative was the
justification for the remedy being a log-side one. Both rows are pinned now.

**▶ THE REMEDY IS THE CLAIM, NOT THE GUARD, AND THE ARGUMENT IS `removedPrivateTags`' OWN.** _Where_
an attribute sat is the entire audit value of the field; withholding the tag would destroy it on
every well-formed file in order to bound a malformed one. So `contextPath` joins the list of report
fields that are not value-free - and **that list's numerals were deleted rather than incremented**,
because having to add a fifth to a list whose count had already been wrong three times is the same
disease one step removed. Corrected in `src/deident/types.ts`, the construction site in
`deidentify.ts`, `docs-content/spec-notes-tolerance.md` (its own row, bound: _none_),
`docs-content/troubleshooting.md`, and the sweep's own docstring.

**▶ THE PHI RUNNER SWEPT THIS FIELD FROM THE START AND COULD NEVER HAVE GONE RED ON IT.**
`deidIdentifiers` pushes every `contextPath` segment into `assertNoDiagnosticPhiLeak`, so the field
looked covered. The runner hunts a **verbatim** marker and a tag is a re-encoding - the identical
blind spot already documented for `DicomParseError.snippet` and for the Tier-3 messages `#80` fixed.
**Sweeping a field is not covering it**, and a green sweep over a re-encoding is the vacuity this
package has now paid for three times.

**▶ WHAT IS DELIBERATELY NOT SETTLED.** The relocation itself (undecidable, and the byte-identity
test is the proof); `position.contextPath`, which no parser warning populates, so the parser-side
type is inert; and whether `attributes[].tag` deserves the same treatment - it is bound to Annex E
table membership, which is a real bound, and widening the disclosure to it without a measurement
would be the claim defect this slice exists to correct.

---

## DICOM-FATAL-MESSAGE-REGISTRY

The Tier-3 half of "a diagnostic about a PHI leak is itself a PHI surface". Two halves, both closed:
the fatal-message registry, and the `{ strict: true }` snippet's frame.

**▶ MEASURE THE PREMISE FIRST, AND IT PAID AGAIN.** Both halves were re-measured open at `0a8c6e3`
before a line was written, because `#79` was dispatched at a route `#78` had already closed and only
an up-front measurement caught it. Here the premise held, and the measurement is also the evidence
the changelog quotes: an `ST` carrier holding `"MR BRAIN SMITHSON "` whose Value Length
under-declares desynchronizes the reader onto a fabricated header **inside the name**, and the old
messages rendered it. Explicit VR LE at delta `-14`:
`Element 41524E49 declared length=1330858068` - `41524E49` is `"RAIN"`, `1330858068` is `"THSO"`,
eight consecutive payload bytes in two fields. Implicit VR LE reaches the identical message at
`-12`. Also `Unexpected tag 524D4220 inside sequence` (`"MR B"`), `Item length=1109414477`
(`"MR B"`), and `Unexpected FFFE marker FFFEE00D (length=1109414477)` (`"MR B"` again).

**▶ THE BOUND IS THE SIGNATURE, AND A SHAPE CHECK WOULD NOT HAVE WORKED.** `src/parser/fatals.ts`
mirrors `warnings.ts`, with one deliberate difference: `FatalTokens` has **no tag field and no
wire-length field at all**, where `WarningTokens` still carries a `tag` and a shape-checking
`renderTag`. That is not extra caution, it is the same conclusion `#55`, `#64` and
`DICOM_ITEM_CROSSES_SEQUENCE_END` each reached separately - `renderTag` validates a tag's _shape_ and
therefore cannot refuse a fabricated one, so the only bound that holds is the absence of the slot.
`renderVr` **can** refuse, because it tests membership in a closed set, so a VR still renders; it was
moved to `tokens.ts` so both registries share one definition.

**▶ THE REGISTRY IS KEYED BY REASON, NOT BY CODE, AND THAT IS FORCED.** D-09 locks the taxonomy at
four Tier-3 codes, and `INVALID_FILE_META` alone is raised for sixteen structurally different
reasons. So `FATAL_MESSAGES` is keyed by a `FatalMessageKey` and each entry carries its own code. The
record is total over that union, which is what makes "every fatal message comes from the registry" a
fact the type system checks rather than one a reader has to verify.

**▶ THE TWO STRINGS THAT LOOK LIKE EXCEPTIONS AND ARE NOT.** `unsupportedTransferSyntax` takes the
`(0002,0010)` UID and renders **PS3.6's own name for it**, so `JPEG Baseline (Process 1)` still reads
usefully and the UID never appears; the closed-set lookup moved from the call site into the factory,
where a future call site cannot skip it. `inflateFailed` takes zlib's `err.code` and renders it only
when it names one of the nine `zlib.codes` entries, which turns a committed comment claiming that set
was closed into a check. `SUPPORTED_TRANSFER_SYNTAXES` and `ZLIB_CODES` are both literals, because
importing either source would close an import cycle or add a runtime dependency; both are pinned
against their real source in `test/parser/fatals.test.ts`.

**▶ 🩺 HALF 2: `ctx.buffer` HAD EXACTLY ONE READER AND WAS THE WRONG BUFFER FOR THREE OF ITS FOUR
FRAMES.** `makeEmitter` cuts the strict-mode `snippet` with `buildSnippet(ctx.buffer, offset)`, and
that offset moves with the frame the element was read in. `parseDeflatedLE` had already worked this
out and swaps in the inflated stream with a committed comment saying why. The three sequence
boundaries that hand a descent a **slice** did not, so a warning raised inside a defined-length Item
cut the **file** at an **item-relative** number. Measured: an item-relative offset of 0 returns
sixteen bytes of the preamble; engineered to collide, it returns the middle of the root
`(0010,0010)` Patient Name. `ParseContext.buffer` is now documented as the **current frame's**
buffer, is mutable, and is swapped with a `finally` restore at `parseSequence`'s defined-length item,
`tryParseDefinedLengthSQ` and `tryParseUnAsSQ` - the same shape `creators` and `currentCharset`
already use.

**🛑 THIS DID NOT MAKE `snippet` SAFE AND NO ARTIFACT MAY SAY IT DID.** It is still 16 unredacted
source bytes (D-10), and an honest frame makes them **more** certainly the named element's own
content. `test/integration/fatal-diagnostic-surface.test.ts` carries a test whose entire job is to
assert that, so the claim cannot quietly drift.

**▶ THREE RESIDUALS THIS REGISTRY DID NOT CLOSE, EACH WITH AN ASSERTED ROW IN
`test/integration/fatal-diagnostic-surface.test.ts`. TWO OF THE THREE WERE CLOSED BY
`DICOM-DIAGNOSTIC-PHI-RESIDUALS`; READ THAT SECTION, WHICH ALSO CORRECTS THE ARGUMENT RECORDED HERE.**

1. The identical desynchronized read that fed the Tier-3 leaks lands on an **odd** group, so
   `resolveImplicitVR` calls the fabricated header a private element and the **Tier-2**
   `DICOM_PRIVATE_TAG_NO_CREATOR` names its tag: `4E495320`, `"IN S"`. Byte-identical on `0a8c6e3`.
   It is the `#78` fabricated-header residual one layer up. **CLOSED.**
2. `report.embeddedAttributes[].hidden` lists **every** tag in the run the embedded scanner found,
   and a run needs only **one** actionable attribute to be reported - so a fabricated header sitting
   beside a real one is listed too. Measured: `4D535449`, `"SMIT"` in wire order, beside the genuine
   `00100020` that made the run reportable. **CLOSED.**
3. Because of (1), **`ds.warnings[].message` is not unconditionally safe to log**, and
   `spec-notes-tolerance.md` and `cookbook.md` said it was. **The CLAIM is corrected, the guard is
   not widened** - this repo's own rule, and the shape `#55` paid a blocker for. **STILL OPEN, on a
   carrier this section never named** - see `DICOM-DIAGNOSTIC-PHI-RESIDUALS`.

**🛑 THIS SECTION'S "ALL THREE ARE THE SAME PRODUCT CALL AS `report.removedPrivateTags`" IS
RETRACTED, AND IT WAS THE WRONG TEST.** It read the three as one because the tags they name are real
on a well-formed file. The distinction that actually decides it is **whether any closed table can
vouch for the tag**, and it splits the three: `removedPrivateTags` is a private-tag field, so nothing
can and narrowing empties it; the two above had a bound available and were not taking it. Do not
restate them as one call.

**🛑 A DISCLOSURE THAT NAMES A TEST MUST NAME ONE THAT EXISTS.** The first draft of this section, the
CHANGELOG and the commit body all said "both pinned as asserted rows" when only (1) had a row. That is
`#78`'s own defect a release later: a residual written up as guarded with no guard. A graded pass
caught it, and the row for (2) was written rather than the sentence softened.

**▶ FIGURES, RE-RUN AFTER THE GRADED PASS ADDED A TEST. BASE IS THE SHA THAT MATTERS AND IT IS
`0a8c6e3`; NO HEAD SHA IS QUOTED, DELIBERATELY.** A draft named one that resolved to nothing, and any
pre-merge head sha is wrong the moment the PR squash-merges anyway - so the head figure is stated as
reproducible on this section's own merge commit rather than pinned to a sha that cannot survive.
Base, which is what a moving figure actually moves against, is pinned. Head: **1,119 passing + 1 todo across 68 files**. Base with the head `test/` tree:
**4 of 1,081 red**, and **2 test files could not collect at all** because they import a module that
does not exist there. That second number is why the behavioural figure was taken separately, by
copying only the two new _non-behavioural_ modules (`fatals.ts`, and `tokens.ts` whose diff is purely
additive) onto base `src/`: **14 of the 39 new tests go red on base** - 11 PHI rows, the
registry-shape test, and 2 of the 4 snippet-frame tests. **Three of the 39 are GREEN on base BY
DESIGN, because they are controls or residual pins**: "the fixture really does collide" grades the
fixture rather than the fix, and the two residual rows assert `PRE-EXISTING` behaviour that must
reproduce on both trees or they are not residual pins at all. It read **1,118 / 14 of 38** before the
graded pass, and was re-run rather than carried forward.

**▶ THE DETECTOR IS THE DELIVERABLE, AND THE SHARED RUNNER COULD NOT HAVE FOUND THIS.**
`assertNoDiagnosticPhiLeak` hunts a **verbatim** marker; this leak is a **re-encoding**, four bytes
rendered as hex or as a decimal. So the sweep enumerates every 4-byte window of the payload rendered
as a tag, every 4-byte window rendered as a `readUInt32LE` decimal, and every 2-byte window rendered
as a VR, then searches every fatal message for all of them. It has a reconstructed non-vacuity
control that rebuilds `0a8c6e3`'s own template and asserts the detector catches it.

**▶ ⚠ MESSAGES ARE REWORDED, SO STRING-MATCHING CONSUMERS BREAK - AND THIS FILE QUOTES NO COUNT.**
The first draft of four artifacts said "six"; a graded pass measured **nine**, naming two nobody had
listed (`Encapsulated pixel data fragment length=...` and `Unexpected FFFE marker (...) at dataset
root`), plus a tenth change where `inflateFailed`'s fallback moved `unknown` to `<withheld>`. The
numeral is **deleted, not incremented** - this item's own rule, and `CLAUDE.md`'s. The set is
derivable in one command and cannot go stale: diff `FATAL_MESSAGES` against the template literals in
`git show 0a8c6e3 -- src/parser/`. `err.code` is unchanged everywhere and which files throw is
unchanged. Four in-repo tests asserted on the old prose and were rewritten to assert the code plus the
withholding; a test pinning a message this item exists to change is pinning the defect.

**▶ THE CITATION IN A MESSAGE IS A CITATION, AND ONE SHIPPED WRONG TWICE IN ONE SLICE.** A draft of
`UNDEFINED_LENGTH_ON_NON_SQ_EXPLICIT` attributed all three of its undefined-length exceptions to
"PS3.5 7.5". **None of the three is there.** Encapsulated Pixel Data is **A.4** (_Transfer Syntaxes
for Encapsulation of Encoded Pixel Data_), the `UN` form CP-246 addresses is **6.2.2** (_Unknown (UN)
Value Representation_), and the Sequence one is **7.5.2** (_Delimitation of The Sequence of Items_),
not §7.5 (_Nesting of Data Sets_, its parent). **The second correction is the interesting one: the
first fix located sections BY LABEL, and a label proves the label exists, not that its body carries
the normative sentence.** Re-derived the way `CLAUDE.md` requires - search for the sentence
("The Value (Sequence) Length Field shall contain a Value FFFFFFFFH"), collect every candidate,
require exactly one. It occurs **once**, inside §7.5.2. This repo already writes 7.5.1-for-7.5.2 as a
trap it has paid for twice; this is the third. **A message is consumer-facing, so a citation in one is
the claim, not a footnote** - the same reasoning that keeps `DICOM_DUPLICATE_FILE_META_ELEMENT`'s
string citation-free.

**▶ `{n}` IS BOUNDED BY BYTES PRESENT, NOT BY "NO SENDER WROTE IT", AND THE STRONGER WORDING WAS
REFUSED.** A draft claimed the residual byte count is "bounded by the buffer the parse holds rather
than being a field a sender wrote". Inside a defined-length Item the buffer **is** that Item's slice,
so `{n}` plus `byteOffset` recovers the Item's own 32-bit declared length. Still not a Value Field,
which is the property that matters; not the absolute the draft asserted.

**Provenance:** PS3.5 read from the SHA-pinned
`vendor/nema/part05/4dfd7b8cbc7c368b7cf03e9c4b8a0773bed91266fcdb0bbf8ed634b7287cacca/part05.xml`,
whose own `<subtitle>` reads _DICOM PS3.5 2026c - Data Structures and Encoding_. **Located by the
normative SENTENCE, then by the innermost enclosing labelled section - not by label**, because
matching a label is what put §7.5 in the string in the first place.

---

## DICOM-LO-LENGTH-AND-SILENT-REPLACE

- **🩺 THE `(0012,0063)` THIS LIBRARY WROTE FOR ITSELF EXCEEDED THE 64-CHARACTER MAXIMUM PS3.5 GIVES
  AN `LO` VALUE, ON EVERY FILE IT EVER DE-IDENTIFIED.** `PRE-EXISTING`, measured through the **built
  package** on `da1f209`: **76** characters with no options, **130** with
  `RetainUIDs + RetainSafePrivate + RetainDeviceIdentity`, **272** with all nine, and **512 of 512
  option subsets** over the maximum. The backlog's earlier note that "130 is NOT REPRODUCIBLE" is
  itself what does not reproduce; 130 reproduces exactly, and the item had already been corrected to
  say so.
- **THE BOUND IS PER VALUE, AND THAT IS THE WHOLE SHAPE OF THE FIX.** PS3.5 2026c Table 6.2-1's `LO`
  row ("64 chars maximum") describes a **Value**, and `(0012,0063)` is `1-n`. A field of 247 bytes
  made of ten values of 61 is conformant; a field of 76 bytes made of one value is not. **Reading a
  per-Value clause as a per-Field one is the same misreading that left `#74`'s hole** (there, §6.4 -
  a clause about where the ENCODER puts its pad - was read as a bound on a COMPARISON). The remedy
  is therefore multi-valued rather than shorter: one Value naming the Profile
  (`@cosyte/dicom Basic Application Level Confidentiality Profile`, **61**) and one per active
  Option (**28** at most, `RetainPatientCharacteristics`). Nine names cannot fit 64 characters
  however they are abbreviated, so shortening only moves the ceiling.
- **PROVED BY SWEEP, NOT BY EXAMPLE, AND THE FIELD FIGURE IS ASSERTED BESIDE THE VALUE FIGURE.** All
  **512** subsets, **2,816** value cells: **0** over the maximum, against **512 of 512** on base. The
  tests assert `field.length > 64` **and** `max(valueLength) <= 64` in the same row, so a remedy that
  had merely shortened the text could not pass them, and a `sweep can actually fail` control feeds an
  over-long caller value through the same measurement and finds it. Options are emitted in
  `DEIDENTIFY_OPTIONS` order rather than the caller's, so the same set always writes the same bytes.
- **THE FIXED POINT WAS RE-MEASURED, NOT ASSUMED**: six real `parse -> deidentify -> serialize ->
parse` round trips, **62** bytes flat by default and **248** flat with all nine, on RAW bytes and
  never through `methodOf()`.
- **THE SECOND REPLACEMENT SHAPE IS DISCLOSED NOW: `DICOM_DEIDENT_METHOD_NOT_LO`.** A `(0012,0063)`
  a file encoded under any other VR is still **replaced** - the join concatenates `LO` values with
  `5CH`, which is not defined over the arbitrary octets an `OB` or `UN` holds, and guessing an
  encoding was refused - but it replaced with `report.warnings` **empty** under `(0012,0062) = YES`.
  It is a **separate code** from `DICOM_DEIDENT_METHOD_NOT_ADDED` because the causes are unrelated:
  the chain outgrew the VR, or the bytes were never in that VR at all. An empty or padding-only prior
  raises neither, because nothing was lost. **No value, no length and NO VR** in the message - two
  bytes read out of a fabricated header are document content, which is how "ITHS" reached
  `DICOM_NONZERO_RESERVED_BYTES`.
- **🛑 A TEST NAMED FOR A PROPERTY IS NOT A TEST OF IT, AND THIS SLICE FOUND ONE OF ITS OWN.**
  `deident-method-add.test.ts`'s "the ceiling guards the ALREADY-RECORDED return too" **quoted the
  default method as a literal**. Changing the default left the row green through the branch next
  door (the ceiling), testing the case it was written to distinguish itself from. It now **derives**
  the default from a run and asserts `prior` really does already record every value. Quote nothing a
  run can produce.
- **🛑 `{ strict: true }` RENDERS SOURCE BYTES THE WARNING WITHHOLDS, AND THE BLOCK CLAIMING
  OTHERWISE READ ONLY `warning.message`.** `PRE-EXISTING`; the claim was corrected and the behaviour
  pinned rather than the guard widened. The escalation raises a `DicomParseError` whose `snippet` is
  16 raw source bytes read **from the file** at the warning's own `byteOffset` (D-10), while
  `err.message` stays the frozen registry string. Measured on
  `DICOM_DUPLICATE_FILE_META_ELEMENT` **only**, because that group is never nested and its offset is
  therefore unambiguously the dropped copy's header: a `(0002,0016)` Source AE Title of `AE-SMITHSON`
  returns `02 00 16 00 41 45 0c 00 41 45 2d 53 4d 49 54 48`, five letters of the surname.
  `file-meta-duplicate.test.ts`'s block titled **"the diagnostic is not itself a PHI surface"**
  asserted the clean half over `warning.message` and nothing else; it is now titled **"the warning
  MESSAGE is not itself a PHI surface"**, with a residual block beside it that pins the snippet
  **byte for byte** (a substring assertion is what `#70`'s third pass refused). Redacting `snippet`
  would be a decision about every Tier-3 fatal in the library and belongs with
  `DICOM-FATAL-MESSAGE-REGISTRY`, not here.
- **🛑 AND THE PER-CODE VERSION OF THAT DISCLOSURE IS DELETED RATHER THAN REWORDED A FOURTH TIME.**
  Draft 1 said both duplicate codes point their snippet at the **dropped** element; pass 1 refuted it
  (`data-set-map.ts` passes the **replacing** element's offset). Draft 2 said
  `DICOM_DUPLICATE_TAG_IN_DATA_SET` therefore renders the **survivor** and the dropped value never
  appears; **pass 2 refuted that too, and the counter-example was already in this repo**: the
  snippet is cut from whichever buffer the parse is holding, at an offset whose frame follows where
  the element was read - **slice-relative** inside a defined-length Sequence or Item, and into the
  inflated stream under Deflated Explicit VR LE - so an in-Item collision returned a complete,
  unrelated root `(0010,0010)` Patient Name. `tag-collision.test.ts`'s own **"the byte offset is NOT a key"** row proves the frame
  disagreement twelve lines from where draft 2's block was added. So the rule this repo already
  carries applied twice over - **re-wording a disclosure twice is the signal to DELETE it**, and
  **measure a byte offset's frame rather than describing it** - and what is left in every artifact is
  the one statement that survives every frame: **which element a snippet's bytes belong to is NOT
  CONTRACTED; treat every snippet as document content.** The behaviour behind it is `PRE-EXISTING`,
  byte-identical on `da1f209`, and is a backlog line beside `DICOM-FATAL-MESSAGE-REGISTRY` and the
  un-populated `position.contextPath`.
- **BASE-RED, RE-RUN AFTER EVERY TEST CHANGE, `src/` REPLACED AND NOT OVERLAID (`rm -rf src`
  first): 18 of 117, in 3 files of 4, on `da1f209`.** `deident-method-lo-length.test.ts` 16 of 24 ·
  `deident-method-add.test.ts` 1 of 29 · `phi-diagnostic-surface.test.ts` 1 of 50 ·
  **`file-meta-duplicate.test.ts` 0 of 14, deliberately** - its strict-snippet block pins
  `PRE-EXISTING` behaviour, so a red there would mean the slice had changed something it says it did
  not. **This figure moved twice inside the slice** (16 of 115 in 3 of 4 as first measured, then 18 of
  133 in 3 of 5 when the pass-1 remedy added two rows and a fifth file, then back to four files when
  pass 2 refuted the claim that fifth file existed to ground). That is the rule this lineage wrote
  three times, earned a fourth time here: **re-run it after every test you add, strengthen OR
  DELETE**, and never carry one forward.
- **TWO COSTS, DISCLOSED AND PINNED RATHER THAN FIXED.** A caller `deidentificationMethod` longer
  than 64 characters, and a prior value the **source file** wrote longer than it, are both written
  through undisclosed: splitting or truncating either would invent a de-identification record nobody
  made. Both have residual tests, so closing either turns a test red.
- **🛑 "A SENDER'S NON-CONFORMANT `LO` IS THE SENDER'S" WAS REFUTED, AND THE SENDER IS US.** Every
  object de-identified **without a caller-supplied method** by **any published release** carries the
  76-character value - measured in the `0.0.1` and `0.0.11` tarballs, and **pass 2 refuted the
  `0.0.3`-onward range a first draft wrote**: `0.0.1` is on the registry and has it, while `0.0.2`
  and `0.0.9` were never published at all. So the over-long prior that rule waves away is, in the
  common case, this
  library's own earlier output. Re-de-identifying one **keeps it**: measured flat at **138** bytes
  over four passes, values of **76** and **61**, `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` raised for the
  retention and **nothing said about the length**. Keeping it is still correct - E.1.1 says "added
  to", and rewriting a prior record destroys provenance whoever wrote it - but never describe the
  residual as somebody else's file. Pinned.
- **A LATER PASS WITH FEWER OPTIONS LEAVES NO TRACE THAT THE EARLIER ONE HAD MORE.** Splitting the
  record per option plus de-duplicating per value means `(0012,0063)` now records the **union** of
  the options ever applied rather than a per-run history; the base's one-value-per-run text did
  distinguish two such runs. The direction is **conservative** (the union over-states retention,
  never understates it), so it is not a leak - it is a reduction in what E.1.1's provenance carrier
  holds, disclosed here and pinned, and a **backlog line** rather than something this slice takes on.

## DICOM-DEIDENT-NOT-A-FIXED-POINT

- **🩺 REPEATED DE-IDENTIFICATION GREW `(0012,0063)` BY THE WHOLE METHOD STRING ON EVERY PASS, FOR
  ANY `deidentificationMethod` ENDING IN A SPACE OR A NUL.** (`DICOM-DEIDENT-NOT-A-FIXED-POINT`,
  **`INTRODUCED` by `#73` (`287efae`)**, found only by a **founder-authorised fourth grading pass**
  after `#73` had merged with three `REFUTED` verdicts answered. **Never published** - the release was
  held, Version PR `#72` left open, and the regression never reached a consumer.)
  **▶ THE MEASUREMENT, WITH ITS SHAS.** In memory, four passes on `287efae`:
  `deidentificationMethod: "ACME Anonymizer v3 "` read **19 -> 38 -> 57 -> 76** bytes and
  `"Pass A\Pass B "` read **14 -> 21 -> 28 -> 35**; on `e75fb38` both are flat (**19, 19, 19, 19**
  and **14, 14, 14, 14**). Over a real `parse -> deidentify -> serializeDicom -> parse` round trip a
  16-byte method read **16 -> 32 -> 48 -> 64 -> 80 -> 96** over six cycles. **Base was a trivial
  fixed point because base REPLACED**, so this is a regression the fix introduced, not an inherited
  flaw.
  **▶ THE TERMINAL OUTCOME IS THE LOSS `#73` EXISTED TO PREVENT.** Growth continues to the
  **65,534**-byte ceiling, at which point the guard **replaces the entire prior provenance chain** -
  now reachable from a benign caller string rather than only from a file already at the ceiling.
  **▶ THE ROOT CAUSE IS ONE ASYMMETRY.** `addDeidentificationMethod` right-trimmed `0x20`/`0x00`
  from `kept` and **not** from `added`, so a freshly supplied value never equalled its own prior
  copy: the library writes the method, `encodeDatasetElement`'s even-length pad folds the trailing
  byte in, the next parse trims it back off, and the next pass appends the whole method again.
  **▶ THE CITATION.** PS3.5 2026c **Table 6.2-1**, `LO` row, from the SHA-pinned `vendor/nema/part05/`:
  "A character string that **may be padded with leading and/or trailing spaces**." Trailing spaces in
  an `LO` Value are **padding, not content**, so a de-duplication comparison must be
  trailing-space-insensitive **on both sides**; `#73` implemented exactly half of that. **§6.4 says
  where the pad goes**: "If padding is required to make the Value Field of even length, a single
  padding character shall be applied to the end of the Value Field (**to the last Value**), in which
  case the length of the last Value may exceed the length of Value by 1."
  **▶ 🛑 THOSE TWO SENTENCES GOVERN DIFFERENT THINGS, AND READING §6.4 AS A BOUND ON THE COMPARISON
  IS WHAT THE FIRST REMEDY GOT WRONG.** Table 6.2-1 says what counts as content **in a Value**, and
  `LO` is `1-n`, so **every** value's trailing pad is padding - the trim at the `equals` is therefore
  **per value**. §6.4 says where the **encoder** puts its even-length pad, which is a fact about the
  write: that is why the value **written** is trimmed once, over the whole field. Per-value trimming
  discards nothing, because it is the comparison that trims and `kept` is still written through
  verbatim. **Trailing only either way**: leading padding survives a round trip untouched (flat at 20
  wire bytes even on `287efae`, so that row is a control, not a pin).
  **▶ THE REMEDY.** `keptValues` and each added value go through `trimTrailingPad` at the
  comparison, and **the value written is trimmed once over the field**, so `deidentify` is a fixed
  point **from the first pass** rather than from the second - the bytes it emits are the bytes it
  reads back. A method that is padding only therefore records nothing, rather than appending an empty
  value whose `\` would itself add a byte per pass.
  **▶ 🩺 THE SILENCE WAS THE OTHER HALF, AND IT WAS THE WORSE HALF.** A name a sender wrote into
  `(0012,0063)` reached output stamped `(0012,0062) Patient Identity Removed = YES` with
  `report.warnings` **empty** and `report.retained` **`[]`** - **a stamp that outran the redaction**,
  the failure `#66` and `#69` were each opened for. The retention is correct (PS3.15 E.1.1 says
  "added to", and Table E.1-1 does not list the attribute, so nothing audited those bytes); the
  silence was not. `deidentify` now raises **`DICOM_DEIDENT_METHOD_PRIOR_RETAINED`** on
  `report.warnings` whenever prior file bytes survive into the output. **🛑 READ IT AS "BYTES FROM
  THE INPUT FILE ARE IN `(0012,0063)`", NEVER AS "THE SENDER WROTE SOMETHING IDENTIFYING"** - a
  second pass over an object this library already de-identified raises it too, because the prior
  value is then this library's own earlier record and nothing on the wire tells the two apart. A
  graded pass asked for that sentence; it is in the JSDoc, the troubleshooting row, the changeset and
  a test.
  **▶ WHY NOT `report.retained`.** That field is typed `readonly DeidentifyOption[]` and means "the
  Annex E option sets active for this run". A retained `(0012,0063)` is not an option set, and
  widening the type to carry it would break every consumer switching over the nine names. The
  disclosure is a warning, like every other thing `deidentify` has to say about a value it could not
  vouch for.
  **▶ THE WARNING IS ITSELF A PHI SURFACE AND CARRIES NO VALUE, NO LENGTH AND NO VR.** The retained
  text is the file's own; the tag in the message is a constant of the code, never composed from
  input, and `position.byteOffset` locates the element. Bound by the factory signature (a position,
  and nothing else), by a name-bearing payload with a four-character-window non-vacuity assertion,
  and by a slot in `test/integration/phi-diagnostic-surface.test.ts` planting the marker into
  `(0012,0063)` itself. Emitted by `deidentify()` only, so it never reaches the parser's
  `{ strict: true }` escalation and cannot refuse a conformant file.
  **▶ 🛑 THE TRAP THAT COST FOUR GRADING PASSES: A TEST NAMED FOR A PROPERTY IS NOT A TEST OF IT.**
  `#73`'s pin was titled "a CALLER method that itself carries a `\` is still a fixed point", picked
  `"ACME Anonymizer\Basic Profile"` - **the one input with no trailing pad byte** - and asserted
  through `methodOf()`, **which strips trailing `[NUL SP]`**. Named for the property, exercising the
  one input where it holds, reading through the helper that hides the defect. **`#73`'s own commit
  body called that pattern out twice and it recurred a third time inside the same slice.** The pins
  assert **raw bytes**, run **six** passes on the wire rows and four in memory, and `methodOf` now
  carries a header saying it must never hold a fixed-point assertion.
  **▶ 🛑 AND IT RECURRED A FOURTH TIME, ONE LEVEL UP, IN THE FIRST REMEDY FOR THIS VERY ITEM.** That
  draft trimmed each operand as a **whole Value Field**, which reaches only its LAST value - so a pad
  byte on an **interior** value of a `1-n` method still regrew the attribute, byte-identically to the
  regression: `"Pass A \Pass B"` beside a prior `"Pass B "` read **14 -> 21 -> 28 -> 35 -> 42** in
  memory (wire **14 -> 22 -> 28 -> 36 -> 42**) and a prose-shaped pair read
  **40 -> 59 -> 78 -> 97 -> 116**, against a flat **14** and **40** on `e75fb38`; the chain was still
  replaced at the ceiling, at pass **9,362**. **The block was named for a universal and pinned the two
  shapes it had just fixed.** Pass 1 of this item's own gate refused it. `LO` is `1-n` and Table 6.2-1
  describes a **Value**, so the trim at the `equals` is **per value**; §6.4 is about where the ENCODER
  puts its pad, which is why the value **written** is trimmed once over the field. **A block named for
  a universal now sweeps a matrix** - 14 method shapes x 6 priors, four in-memory passes and four wire
  round trips each, raw-byte equality per cell - because two graded passes on one item were each spent
  on a caller string nobody had thought to try.
  **▶ THE BASE-RED FIGURE, WITH ITS SHA.** Over the **full suite** at `287efae` with these tests
  added: **11 of 1,045** red, in **3** files (of 65). **Nine** are in
  `test/deident/deident-method-add.test.ts` - the growth rows plus the two disclosure rows - and the
  other two artifacts of this slice are red there for a second reason as well, because the code they
  name does not exist on that tree: the `(0012,0063)` slot in
  `test/integration/phi-diagnostic-surface.test.ts` and the locked `WARNING_CODES` snapshot.
  **🛑 THIS ONE FIGURE WAS WRONG THREE TIMES IN ONE SLICE, AND EACH TIME FOR THE REASON `CLAUDE.md`
  ALREADY NAMES.** A first count read **6** and omitted the last two files; a second read **10** and
  missed that the remedy had **strengthened** an existing row (the `deidentify(deidentify(...))`
  assertion) into a base-red one. Re-derive rather than quoting; re-run after every test added **or
  strengthened**; and remember that `git checkout <base> -- src/` **overlays** - `src/` was removed
  and restored, never overlaid.
  **▶ THREE `PRE-EXISTING` LINES WERE DELIBERATELY NOT CUT IN** (the pass-4 grader advised against
  it and the founder agreed): the default `(0012,0063)` overruns `LO`'s 64-character per-value
  maximum; a `(0012,0063)` a file encoded under a VR other than `LO` is replaced silently;
  and `{ strict: true }` renders dropped-element bytes in the snippet while the block titled "the
  diagnostic is not itself a PHI surface" reads only `warning.message`.
  **▶ 🛑 AND A FIGURE ATTACHED TO THAT FIRST LINE DID NOT SURVIVE RE-DERIVATION, IN THE DIRECTION
  NOBODY EXPECTED.** The `287efae` reading is **76** characters for the default single value and
  **130** with three Retain options appended (`RetainUIDs`, `RetainSafePrivate`,
  `RetainDeviceIdentity`) - measured on this branch, one `LO` value in both cases. A pass-4 note
  saying the 130 was "not reproducible - it stays 76" **is itself what does not reproduce**: the
  option names are appended to the same value, so the count moves with the options. Whoever takes
  that backlog line re-derives both numbers; **neither this page nor the item is the source.**

---

## DICOM-FILE-META-DROPS-DUPLICATE

- **🩺 THE FILE META GROUP DROPPED A SECOND COPY OF A MODELED `(0002,xxxx)` ELEMENT, AND AN ARRAY IS
  NOT SAFETY.** (`DICOM-FILE-META-DROPS-DUPLICATE`, `PRE-EXISTING`, raised by `#70`'s gate,
  **measured live on the published `0.0.10` tarball**.) This is `#70`'s shape one group over, and
  **`(0002,xxxx)` is the group that decides how every following byte is read**, which makes it
  strictly the more dangerous of the two.
  **▶ THE ROUTE IS DIFFERENT FROM `#70`'s, AND THAT DIFFERENCE IS THE WHOLE ENTRY.** `parseFileMeta`
  collects the group into an **array**, so nothing is overwritten and `DICOM_DUPLICATE_TAG_IN_DATA_SET`
  never fired here. `#70`'s own JSDoc said exactly that, in a sentence that read as an all-clear:
  _"it does not reach the File Meta group, which `parseFileMeta` accumulates into an array and not a
  map, so nothing is overwritten there."_ Literally true, and wrong in effect. The eight tags in
  `MODELED_FM_TAGS` are answered by a **first-match** search (`projectUI` / `projectText` /
  `projectRaw`, and `fmElements.find` for `(0002,0010)`) and are **excluded** from `extraElements`,
  the verbatim residue that gives the group its byte-exact round trip. A second copy of one is
  therefore in **neither**: not projected, because the first already answered, and not preserved,
  because its tag is modeled. That sentence is corrected in place rather than deleted, and it now
  names the new code.
  **▶ THE TWO CODES RESOLVE A REPEAT THE OPPOSITE WAY ROUND, DELIBERATELY, BECAUSE THE TWO READINGS
  DO. FIRST copy wins in the File Meta group; LAST read wins in a Data Set.** Neither reading moves
  in this slice, no value is guessed for the copy that lost, and **no residue is invented for it** -
  inventing one would make the conservative serializer re-emit a group it should not write. A
  repeated `(0002,xxxx)` tag this library does **not** model stays silent, because every copy of one
  is already kept verbatim in `extraElements` and nothing is dropped; that control is pinned, with
  both copies asserted present, so "silent" is "nothing was lost" rather than "the check missed it".
  **▶ 🛑 TWO `PRE-EXISTING` BOUNDS PASS 1 NAMED, AND THE CLAIMS BESIDE THEM WERE THE `INTRODUCED`
  PART. NEITHER IS CLOSED HERE.** (1) `encodeFileMeta` **re-emits BOTH copies** of a duplicated
  non-modeled `(0002,xxxx)`, so this package writes a tag twice on such a file and a strict reparse
  of its own output is silent - "the serializer is the conservative half of this package" does not
  cover it, and that sentence is corrected rather than the guard widened. This is where the
  byte-exact round-trip promise and the spec-clean promise disagree, and choosing between them is a
  decision. (2) A repeated MODELED tag sitting **past an honest `(0002,0000)`** - the classic "an
  intermediary appended an element and did not update the group length" - never reaches Step 3.5 at
  all: the group loop stops at the declared length, no mismatch fires, and a second `(0002,0010)`
  with a **different** UID is relocated into the main Data Set and survives a round trip there.
  Silent on both trees. So this code covers the group **AS THE PARSER DELIMITS IT**, never "the
  group", and every artifact says so.
  **▶ THE MEASUREMENT, ON THE PUBLISHED PACKAGE.** `npm pack @cosyte/dicom@0.0.10` (the registry's
  current `latest`; there is no `0.0.9`), a file carrying `(0002,0010)` twice with two **different**
  Transfer Syntax UIDs: `fileMeta.transferSyntaxUID` reads the first, `fileMeta.extraElements` is
  `[]`, `ds.warnings` is `[]`, and `{ strict: true }` does **not** throw. Silent on every channel.
  **▶ THE STAKES ARE NOT HYPOTHETICAL AND ARE PINNED AS A MEASUREMENT.** The same dataset bytes, with
  only the **order** of those two UIDs swapped, parse to two different objects - one reads
  `(0010,0010)` correctly, the other raises `INVALID_FILE_META` out of `parseImplicitLE`, because a
  length field read in the wrong encoding declares **1,199,696** bytes. On base both files were
  silent, so a reader could not tell them apart. The disclosure is collected through `onWarning` in
  that test, not off `ds.warnings`, because one of the two parses never returns an object.
  **▶ NO TAG IN THE MESSAGE, AND THE BOUND IS THE FACTORY SIGNATURE - THE FIFTH CODE TO NEED IT.**
  `duplicateFileMetaElement(position)`, as for `DICOM_DUPLICATE_TAG_IN_DATA_SET`,
  `DICOM_NONZERO_RESERVED_BYTES`, `DICOM_ITEM_CROSSES_SEQUENCE_END` and
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`. Pinned by arity, so a call site cannot put a tag back
  without changing the signature, and by a **name-bearing** payload: the dropped `(0002,0016)` value
  is `"SMITHSON"` and the dataset carries `"MR BRAIN SMITHSON"`, both asserted present before every
  4-character window of the name is refused from the message. **A PHI test whose payload carries no
  name is vacuous BY FIXTURE** (`#55`'s was, and it rendered four letters of a surname).
  **▶ 🛑 BUT THE FABRICATED-HEADER ROUTE IS NARROWER HERE THAN IN A DATA SET, AND IT IS A FACT ABOUT
  THE EIGHT TAGS RATHER THAN AN ARGUMENT.** The group loop only continues while the next two bytes
  read `0x0002`, and every modeled element number is below `0x0100`, so each modeled tag needs at
  least **two NUL bytes** on the wire (three, for `(0002,0000)`). No printable name supplies one, so
  a length lie cannot compose a _modeled_ tag out of document text the way it can at `(0010,0020)`.
  Pinned over all eight. **That does not relax the bound**: the VR, the length and the value after
  such a header still come out of somebody's value, and the offset still points inside one.
  **▶ `position.byteOffset` IS FILE-ABSOLUTE HERE, AND THAT IS STRUCTURAL RATHER THAN LUCKY.**
  `#70`'s frame-of-reference caveat - the one a refuter broke on the first try - does not apply.
  `parseFileMeta` is called **once** per parse, from `parseDicom`, with the whole buffer and the
  post-`DICM` offset, and the File Meta group is never nested, so no item slice can reach it. It also
  locates the copy that was **dropped**, not the survivor: the survivor came first, so its offset is
  lower. Both facts are pinned by reading the header back out of the file at that index.
  **▶ THE CITATION, AND THE ONE THAT IS DELIBERATELY ABSENT.** PS3.5 2026c section 7.1 "Data
  Elements", read from the SHA-pinned `vendor/nema/part05/` and occurring **exactly once** in that
  document: "The Data Elements in a Data Set shall be ordered by increasing Data Element Tag Number
  and shall occur at most once in a Data Set." **PS3.10 - which governs the File Meta Information
  group - is NOT vendored in this repo.** It was fetched and read while writing this slice, and
  neither section 7.1 nor Table 7.1-1 states a uniqueness sentence to quote, so **no PS3.10 citation
  is made and no conformance verdict about a repeated `(0002,xxxx)` is claimed anywhere in the
  artifacts.** The Tier-2 escalation does not need one: the code fires exactly when a value the file
  carried does not reach the parsed object, and a `{ strict: true }` caller has asked to be thrown at
  rather than handed a lenient reading. **Do not "strengthen" this by asserting PS3.10 from memory** -
  a per-part sentence transcribed from memory is not a citation, and vendoring a new part is its own
  slice.
- **🩺 `deidentify()` REPLACED `(0012,0063)` WHERE PS3.15 SAYS "INSERTED IN OR ADDED TO".**
  (`PRE-EXISTING`, same item, measured on `0.0.10`: a file recording
  `"ACME Anonymizer v3 Basic Profile"` came out of `deidentify()` recording only this library's own
  method, with the earlier one gone and nothing saying so.) What that destroyed is the **provenance
  chain** the attribute exists to carry, on a file whose earlier pass may be the one a recipient was
  relying on.
  **▶ THE CITATION.** PS3.15 2026c section **E.1.1 "De-identifier"**, read from the SHA-pinned
  `vendor/nema/part15/` and occurring **exactly once** in that document: "one or more codes from
  [PS3.16 CID 7050] corresponding to the Profile and Options used shall be added to De-identification
  Method Code Sequence (0012,0064), and/or a text string describing the method used shall be
  **inserted in or added to** De-identification Method (0012,0063)." Replacing is neither verb.
  **▶ 🛑 THE ASYMMETRY WITH `(0012,0062)` IS THE STANDARD'S OWN AND MUST NOT BE "TIDIED".** The
  sentence immediately above, in the same list: "The Attribute Patient Identity Removed (0012,0062)
  shall be **replaced or added to** the Data Set with a value of YES." Different verbs, different
  attributes. `deidentify` still replaces `(0012,0062)`, and a test pins that it does.
  **▶ THE SHAPE.** The method is appended as a further value of the `1-n` attribute after a `\`, with
  the prior bytes copied through **verbatim**, so a value encoded under a `(0008,0005)` repertoire
  survives byte for byte - the join is a byte concatenation and only the even-length pad and any
  trailing NUL are trimmed. **Only the values not already recorded are added**, so repeated
  application does not grow the attribute without bound, which is a defect the fix would otherwise
  have introduced. **🛑 IT DID INTRODUCE ONE ANYWAY, AND `287efae` SHIPPED IT TO `main`: the trim
  above ran on the PRIOR value only, so a `deidentificationMethod` ending in a SPACE or NUL regrew
  the attribute every pass.** Read
  [#dicom-deident-not-a-fixed-point](#dicom-deident-not-a-fixed-point) before quoting anything on
  this page as a fixed-point property. The delimiter split used for that test is a **comparison only** - a repertoire where
  5CH is not the delimiter can at worst make it append a value it could have skipped, which loses
  nothing. **The VR must be `LO`**; a `(0012,0063)` a file encoded as something else is not a
  De-identification Method this can concatenate into, so that case still replaces, and it is pinned.
  **▶ 🛑 THE COMPARISON IS PER VALUE ON BOTH SIDES, AND THE DRAFT THAT COMPARED THE WHOLE ADDED
  STRING AGAINST EACH PRIOR VALUE WAS REFUTED ON PASS 1.** `deidentificationMethod` is a `1-n` value
  like any other, and the option's own JSDoc teaches the delimiter, so a caller string carrying a
  `\` never matched any single prior value and every pass appended a whole further copy: measured
  **29 -> 59 -> 89 -> 119** bytes over four passes, against a flat **29** on base, reaching the
  ceiling below and throwing at pass 2185. The claim had shipped in six artifacts and the test named
  for it exercised only the default method - **a test named for the thing it did not check occupies
  the slot**, again. Pinned with a delimiter-carrying caller string and a set-of-lengths assertion -
  **and that pin was named for the property and did not check it either**: it picked the one
  delimiter-carrying input with no trailing pad byte and asserted through a helper that strips
  trailing `[NUL SP]`. Per-value comparison was **necessary and not sufficient**; see
  [#dicom-deident-not-a-fixed-point](#dicom-deident-not-a-fixed-point).
  **▶ 🩺 THE JOIN IS BOUNDED, AND AN UNBOUNDED ONE CRASHES THE SERIALIZER ON A FILE THE PARSER CALLS
  CLEAN. PASS 1 GRADED THIS A BLOCKER AND IT WAS RIGHT.** `LO` is not in `LONG_FORM_VRS`, so
  `encodeDatasetElement` writes its Value Length with a **16-bit** field. A `(0012,0063)` carrying a
  legal **65,534**-byte chain of `1-n` values - exactly the provenance chain this feature exists to
  build - parses with **zero** warnings, and appending to it produced a **65,611**-byte value that
  `serializeDicom` could not encode: a raw `RangeError` out of Node's `Buffer` internals, **outside
  the documented `DicomSerializeError` surface**, taking the whole de-identified object down. Base
  serialized the same file, because base replaced. So when the join would exceed `0xFFFE` the prior
  value is **replaced** instead - which is what every released version did on **every** file, so the
  slice narrows that loss from "always" to "only at the ceiling" rather than introducing one - and
  **that fallback is disclosed**: `report.warnings` carries the new
  `DICOM_DEIDENT_METHOD_NOT_ADDED`.
  **Truncating the chain was refused**: choosing which of the sender's earlier de-identification
  records to drop is a policy the standard does not state, and this package reports rather than
  invents. The bound is applied uniformly rather than per encoding, because one rule that holds for
  every transfer syntax is worth more than a few thousand bytes of chain in a case this extreme.
  **One route is deliberately left as base has it**: a CALLER who passes a `deidentificationMethod`
  longer than the ceiling still fails to serialize. That is `PRE-EXISTING` and caller-supplied rather
  than file-supplied, so it is a backlog line.
  **▶ 🛑 THE GUARD IS OVER THE RETURN, NOT OVER THE JOIN, AND PASS 2 REFUTED THE DRAFT THAT PUT IT ON
  THE JOIN.** That draft returned the prior value unbounded as soon as nothing was missing to
  append, the already-recorded case, which is exactly a file this library de-identified once already
  and exactly what the fixed-point rule exists for. Measured: a `(0012,0063)` declaring an odd
  **65,535**-byte Value Length came straight back out, `report.warnings` was **EMPTY**, and
  `serializeDicom` threw the identical raw `RangeError`; base returned 76 bytes and serialized.
  Narrower than the first route (the parse warns `DICOM_ODD_LENGTH_VALUE_PADDED` and
  `{ strict: true }` refuses the file outright) and still an outcome base did not have. **`kept` is
  file-supplied on every path; only `added` is not** - which is what makes the "one route left, and
  it is caller-supplied" enumeration true now and false in the draft. Pinned.
  **▶ 🛑 AND "THE ONE SHAPE WHERE IT CANNOT ADD" IS FALSE - THERE ARE TWO, AND THE OTHER IS SILENT.**
  A `(0012,0063)` a file encoded under a VR other than `LO` is replaced with `report.warnings` empty.
  `PRE-EXISTING` and deliberately not taken, so the CLAIM is corrected rather than the guard widened:
  `DICOM_DEIDENT_METHOD_NOT_ADDED` means "the length ceiling was reached", never "every fallback is
  disclosed".
  **▶ 🩺 THE COST IS A RESIDUAL, DISCLOSED, WITH A TEST THAT ASSERTS IT RATHER THAN AN ALL-CLEAR.**
  `(0012,0063)` is **not in Table E.1-1**, so the Basic Profile never acted on it and the incoming
  value reached the insertion point untouched - **the replacement was the only thing removing it, and
  removing it was an action no profile asked for**. So a sender who wrote something identifying into
  `(0012,0063)` now sees that text in de-identified output. That is the retained-by-omission posture
  every other unlisted attribute already has, not a channel this insertion opens; **closing it is a
  product call about unlisted attributes, in the family of `DICOM-DEIDENT-OVER-REDACTION`, and it
  would turn that residual test red on purpose.** The `DeidentifyReport` echoes
  nothing from the attribute; a test asserts the name is absent from every value-free field of it.
  **🛑 IT WAS ALSO SILENT, AND THAT HALF WAS WRONG.** The retention now raises
  `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` -
  [#dicom-deident-not-a-fixed-point](#dicom-deident-not-a-fixed-point).
  **▶ THE BASE-RED FIGURES, WITH THEIR SHA.** Re-measured at `e75fb38` after the last test was added:
  **8 of the 12** in `test/integration/file-meta-duplicate.test.ts` and **7 of the 13** in
  `test/deident/deident-method-add.test.ts` run red against that base, 15 of 25 in all. The File Meta
  file **cannot link against base `src/` at all** - neither
  `WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT` nor `duplicateFileMetaElement` exists there - so
  that 8 is measured with those two symbols substituted for their literals; unmodified it is 12 of 12
  by construction, which is a fact about linking rather than about behaviour. The base was taken in a
  **detached worktree at the sha**, not by checking `src/` over the working tree, because
  `git checkout <base> -- src/` **overlays** rather than replaces (`#71`). **Re-run after every remedy
  that added or strengthened a test, which is the rule and not a courtesy - after pass 1's six and
  after pass 2's one: 8 of 12 and 11 of 19, 19 of 31.** The de-identify file cannot link against base `src/` either now, for the same reason
  (`deidentMethodNotAdded`), so its figure is measured the same way and unmodified it is 19 of 19. **A figure taken this way is substitution-sensitive and the third pass read 9 rather than 8**, the delta being the factory-signature row, which is red or green purely by how the absent factory is stood in for. Read it as a floor, and re-derive it rather than quoting it.
  **▶ WHAT PASS 1 FOUND AND THIS SLICE DID NOT TAKE.** Three `PRE-EXISTING` backlog lines, each
  reproduced on `e75fb38`: the two File Meta bounds above; and **the library's own default
  `(0012,0063)` value exceeds `LO`'s 64-character per-value maximum** (76 characters by default,
  **130** with three Retain options, against PS3.5 2026c Table 6.2-1). The last one is newly
  _fixable_ by the delimiter this slice introduces - splitting the default into `1-n` values - but
  that changes the shipped output of every de-identification and is its own measured change.

## DICOM-TAG-COLLISION-DESTROYS-ELEMENT

- **🩺 A DATA SET DESTROYS ITS OWN ELEMENT AT PARSE TIME, AND UNTIL THIS SLICE IT DID SO IN
  SILENCE.** (`DICOM-TAG-COLLISION-DESTROYS-ELEMENT`, `PRE-EXISTING`, **measured live on the
  published `0.0.10` tarball**; recorded by `#51`'s pass-4 refuter as F1, reached again by `#69` on
  the private path, deliberately not fixed by either.) A parsed Data Set is a `Map<Tag, Element>`,
  so `Map.set` on a tag the map already holds **overwrites in place**: the earlier element's value is
  gone from the object and the survivor is indistinguishable from an element the sender wrote once.
  A reader cannot detect it, a round trip cannot reveal it, and no consumer can ask what was lost.
  **In a de-identification tool, silently dropping a real element is the mirror of silently keeping
  a private one.**
  **▶ THE REMEDY IS A DISCLOSURE AT THE SITE THAT DECIDES, AND NOTHING ELSE.** `defineElement`
  (`src/parser/data-set-map.ts`) is now the only writer of that map, and it emits the new Tier-2 code
  `DICOM_DUPLICATE_TAG_IN_DATA_SET` when it is about to replace. **The reading does not move**: the
  last element read still wins, on every file, and **no value is guessed for the one that lost**.
  Same family as `X12-837-SV-SILENT-ZERO` (a fabricated `X12Decimal.ZERO`), `fhir`'s JSON writer
  authoring `{}` for a scalar, and `astm`'s greedy atom: in every one the fix was to REPORT, never to
  invent a better value.
  **▶ WHY NOT A BOUND.** An over-declaring Item and an under-declaring Sequence are byte-identical
  (`Buffer.equals`, pinned in `test/integration/explicit-sq-item-bound.test.ts`), so no reader can
  tell from the bytes which element "should" have survived. Five graded attempts at such a bound were
  refused on `#51`. What a reader CAN do is say that it had to choose.
  **▶ THE CITATIONS, TRACED.** PS3.5 2026c section 7.1 "Data Elements" ("shall occur at most once in
  a Data Set") and section 7.5.1 "Item Encoding Rules" ("appear only once" within an Item), read from
  the SHA-pinned `vendor/nema/part05/`, **each occurring exactly once in that document**. So the code
  cannot fire on a conformant file, which is what makes it safe under the `{ strict: true }`
  escalation every Tier-2 code takes.
  **▶ NO TAG IN THE MESSAGE, AND THIS IS THE FOURTH CODE TO NEED THAT BOUND.** A sender writing one
  tag twice is the rare route; the ordinary one is a length field that lies, so the second header's
  four tag bytes come out of the middle of somebody's value. The bound is the **factory signature**
  (`duplicateTagInDataSet(position)`), as for `DICOM_NONZERO_RESERVED_BYTES`,
  `DICOM_ITEM_CROSSES_SEQUENCE_END` and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`.
  **▶ 🛑 AND THE OFFSET IS NOT A KEY. THE FIRST DRAFT SHIPPED A LOOKUP RECIPE IN TWO CONSUMER DOCS
  AND A REFUTER BROKE IT ON THE FIRST TRY.** `position.byteOffset` is the surviving element's own
  `Element.byteOffset`, and the replaced element's tag IS the survivor's - but `Element.byteOffset`
  is **frame-dependent and always has been** (file-absolute at the root, relative to the item's own
  slice inside a defined-length Item, and no frame-of-reference contract is documented either way).
  So a collision inside an Item reports an offset that a **root** element can also occupy, and
  "look it up on the model" then names the wrong attribute. Measured: a `(0010,0020)` collision
  inside item 0 of `(0040,A730)` reported offset 172, where the root's intact `(0008,0008)` also
  sits. The docs now say root-only, and `position.contextPath` is **not** populated by any parser
  warning - adding it is a package-wide feature and a wider slice, not a rider on this one.
  **▶ WHAT THE EVIDENCE ACTUALLY IS, BECAUSE THE GRID CANNOT STAND IN FOR IT.**
  `scripts/measure-sq-bound-grid.ts` vs `0ead071`: of 83,037 cells, **349 differ and every difference
  is confined to the warning channels and `{ strict: true }`** - 0 differ in the element tree, the
  `DeidentifyReport`, the de-identified bytes, the surviving marker values or the root `(0010,0020)`;
  0 new lenient fatals; `LEAKING` 11 -> 11; conformant tiling controls 7 -> 7. **345 cells report a
  collision that was silent on base** (295 Implicit VR LE, 25 Explicit VR LE, 25 Explicit VR BE),
  **all of them in the two hoist-collision families** - a fact about those fixtures, not a rate for
  real files, and the grid reaches the collision **only** through a length lie. The plain duplicate,
  the duplicate inside an Item, the collision that lands on a sequence's own tag and takes the whole
  `SQ` out of the object, the frame the offset is in, and the strict behaviour are pinned in
  `test/integration/tag-collision.test.ts` or nowhere: **14 of its 15 tests run red against
  `origin/main` at `0ead071`** (re-measured after each gate pass added tests - two after pass 1, one after
  pass 2 - so it is written with its sha; the figure moves with every test you add), the fifteenth being the no-duplicate control,
  green there by design.
  **▶ THE COST, WHICH IS A `{ strict: true }` COST AND NOT A READING ONE.** **9 cells that parsed
  under `{ strict: true }` now throw**, because every Tier-2 code escalates through the one
  chokepoint; their element trees, reports, root identifiers, surviving markers and lenient class are
  identical on both trees. **Do NOT source that from the harness's
  `...on an UNCHANGED lenient reading` line** - `lenientSame` compares the whole record minus
  `strict`, warnings included, so it reads 0 by construction for any slice that adds a code. It comes
  from the per-field counters. A further **4** cells were already fatal there and now carry this code
  instead of `INVALID_FILE_META`, because the escalation happens earlier in the parse. The shipped
  `profiles.strict` preset is unchanged and does **not** escalate it (pinned).
  **▶ AND A FIFTH STRICT SUBSTITUTION THE GRID DOES NOT COUNT, FOUND BY PASS 2.** On the rolled-back
  Implicit VR LE shape above, `{ strict: true }` threw `DICOM_SQ_NOT_DESCENDED` on base and throws
  `DICOM_DUPLICATE_TAG_IN_DATA_SET` here - measured on both trees. Both refuse the file, so no caller
  loses an object, but **the new code asserts a loss on the one file where nothing was lost** and the
  base's code was the more accurate diagnosis. Disclosed rather than fixed: suppressing an emission
  during a trial descent is a change to the chokepoint's contract, which is a wider slice than this
  one. Pinned by a test.
  **▶ 🩺 AND "NAMES NO TAG" IS MESSAGE-SCOPED. THE STRICT CHANNEL HANDS BACK WHAT THE MESSAGE
  WITHHELD.** `makeEmitter`'s escalate path builds `DicomParseError.snippet` from 16 raw source bytes
  at the warning's offset, which is the replacing element's header: measured on a plain duplicate,
  `10 00 20 00 4c 4f 0e 00 53 4d 49 54 48 53 4f 4e` - the withheld tag, and eight bytes of the value,
  in hex. That is D-10, `PRE-EXISTING` and package-wide, and the base reachability is measured
  rather than asserted: this exact fixture does **not** throw on `0ead071` at all (no code, no
  snippet), while the **same fixture with its even-length padding removed** reaches the identical
  16 bytes there through `DICOM_ODD_LENGTH_VALUE_PADDED` -
  `10 00 20 00 4c 4f 0d 00 53 4d 49 54 48 53 4f 4e`, one length byte apart. The PHI-diagnostic
  runner structurally cannot see either, because
  hex is a re-encoding. One more code reaches it; **the guarantee to state is "the message names no
  tag", never "this code cannot surface one".** Pinned by a test so the sentence cannot drift back.
  **▶ TWO SYNTAXES, TWO DIFFERENT LIES, AND THE FIXTURE IS PARAMETERISED BY BOTH RATHER THAN
  DESCRIBED.** Under Explicit VR the item stream is bounded against the buffer, so the `SQ`'s field
  and the Item's both have to give way; an Item-only under-declare there is refused outright as a
  Tier-3 fatal, which is loud. Under Implicit VR LE the defined-length `SQ` path slices the item
  stream, so the `SQ`'s field is the one that ejects and an Item-only lie ejects **nothing**.
  **▶ THE MESSAGE LENGTH IS A MEASUREMENT, NOT AN ADJECTIVE.** The first draft said "kept short"
  about a **400-character** string, which was the **longest of the 30** in `WARNING_MESSAGES` -
  longer than every de-identify message it named as its model - on the one channel whose multiplicity
  the input chooses (`ds.warnings` is uncapped, `PRE-EXISTING` and package-wide). A refuter measured
  131,071 warnings and 50 M characters from a 1 MiB file. It is now **188 characters - seventh of the
  30, not the longest** (against a median of 99.5, so still an above-median string, which is the honest
  way to put it), and the reasoning lives here rather than in the string.
  **▶ WHAT IT DOES NOT REACH, MEASURED NOT ASSUMED.** The **File Meta group** is accumulated into an
  **array** by `parseFileMeta`, not a map, so nothing is overwritten there and this code does not
  fire on it - which is not a claim that duplicate File Meta tags are handled well, only that they
  are not destroyed by this mechanism. And it does **not** cover `deidentify()`, which is
  `out.elements.set()` throughout: **the first draft claimed it "has no collision to report" and
  that is false.** `deidentify.ts:1260` and `:1265` set `(0012,0062)` and `(0012,0063)`
  unconditionally, so a source `(0012,0063)` is **replaced** rather than added to. `PRE-EXISTING`,
  identical on both trees, and **it is a real finding against PS3.15 2026c §E.1.1**, which says the
  method description "shall be inserted in or added to" that attribute. Filed for its own slice,
  untouched here; it destroys provenance metadata rather than a dose, an identifier or a code system.
  **▶ AND ONE SHAPE STREAMS THE CODE FOR A DATA SET THAT WAS THEN DISCARDED.** Under Implicit VR LE,
  a defined-length `SQ` whose item stream holds a duplicate **and then** a non-Item tag makes
  `tryParseDefinedLengthSQ` roll back: `onWarning` sees `DICOM_DUPLICATE_TAG_IN_DATA_SET`,
  `ds.warnings` does not, and **nothing was lost** - both values survive in `Element.rawBytes`. That
  is the `PRE-EXISTING` D-03 pop-after-stream divergence (`makeEmitter` streams before the pop), now
  reachable by one more code, in the **false-alarm** direction rather than the silent one. Pinned by
  a test rather than described.
  **▶ ONE MORE FOR THE BACKLOG, SAME FAMILY, FOUND BY PASS 2 AND NOT THIS SLICE'S TO FIX.** File Meta
  is an array, so nothing is _overwritten_ there - but `parseFileMeta` projects a modeled
  `(0002,xxxx)` with `fmElements.find(...)` (first wins) and `extraElements` filters every
  `MODELED_FM_TAGS` entry out, so a **second** copy of a modeled File Meta element - a duplicated
  `(0002,0010)` Transfer Syntax UID with a different value, say - is dropped from the model with no
  warning and no array residue. `PRE-EXISTING`, and the same shape as the item this section is
  about, one group over.
  **▶ STILL OPEN, UNTOUCHED:** `DICOM-PRIVATE-SQ-CARVE-OUT`, and the structural relocation itself
  under `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`. This slice makes the loss observable; it does not
  make the file readable.

---

## DICOM-ITEM-EJECT-ROUTE

- **🩺 THE EJECT DIRECTION IS CLOSED. THE PRIVATE-`SQ` CARVE-OUT IS NOT, AND THE CLASS IS NOT.**
  (`DICOM-ITEM-EJECT-ROUTE`, `PRE-EXISTING`, **measured live on the published `0.0.10` tarball**, found by `#66`'s pass-2
  refuter and re-measured on `300af87` before anything changed.) An `(FFFE,E000)` Item that declares
  **fewer** bytes than its content occupies ends early, so the elements the sender encoded as Item
  content are read as elements of the **enclosing** Data Set. A Private Creator landing there reserves
  a block for elements the sender never put beside it, and the next private element is kept verbatim
  on it: `removedPrivateTags: []`, the value in the output, `(0012,0062) = YES`.
  **▶ IT IS EVERY STILL-USABLE DATA SET, NOT THE ROOT, AND THAT IS PINNED BY A TEST RATHER THAN A
  SENTENCE.** An inner sequence ejecting a creator into the still-usable Item that encloses it
  reproduces it one level down, with the outer sequence honest and `reservationsUsable` still `true`.
  A root-scoped remedy reads green on that file.
  **▶ TWO PREDICATES, AND THE SECOND IS THE WHOLE REASON THIS WAS ITS OWN SLICE.** Under **Explicit
  VR** the item stream is bounded against the buffer, so it reads past the sequence's declared end and
  `rawBytes.length` exceeds `length` (`itemStreamOverrunsSequence`). Under **Implicit VR LE** that path
  slices the item stream to the declared Value Length, so **nothing over-runs at all**
  (`rawBytes.length === length`); the item does not fit the slice, the descent is refused, and the
  element arrives with `items === undefined` and `DICOM_SQ_NOT_DESCENDED` (`isUnauditableSequence`).
  Both are facts the parser already recorded. **The second predicate is broader than the ejection it
  is here for, deliberately and in the fail-safe direction** - it says the parser could not walk the
  sequence, which another unwalkable item stream also reaches. Do not restate it as "exactly the
  ejection shape".
  **▶ THE CUT IS POSITIONAL, AND THE GRID IS BLIND TO THAT - THE TESTS ARE THE PIN.**
  `settledBound` takes the run up to and including the first disputed sequence; both the creator map
  and the retention decision come from it, so an element read **before** the offending sequence keeps
  its reservation and one read after does not. The whole-Data-Set variant was **built and measured**:
  it produces a **byte-identical grid diff** (0 of 83,037 cells differ from what shipped), because
  every `priv|` fixture writes its private block after the sequence. **It differs on exactly 5 tests,
  counted over the FULL suite rather than one file** (an earlier draft said four, from a one-file
  run), and they are why it is refused: the "root reservation the sender wrote at the root survives an
  over-running sequence" control plus both collision rows, all three genuine root reservations the
  sender wrote ahead of the disputed sequence; and **both** private-`SQ` carve-out residuals, which
  belong to a different item - the second of them lives in
  `test/integration/deident-unauditable-sequence.test.ts` and a per-file enumeration misses it.
  **▶ 🛑 TWO BOUNDS, NOT ONE, AND THE MISSING ONE WAS A PASS-1 REFUTATION. A DATA SET IS A
  `Map<Tag, Element>`, SO ITS ORDER IS NOT ITS FILE ORDER.** When the ejected element carries a tag
  the Data Set **already holds**, `Map.set` overwrites in place and the newcomer inherits the
  **earlier** element's position, ahead of the sequence it came out of; an index cut alone reads it as
  settled and retains it. Measured on a root holding a genuine `(0009,0010)` + `(0009,1001)`
  reservation ahead of a sequence whose item ejects a second `(0009,1001)`: it lands at **index 2 with
  `byteOffset` 274** while the sequence sits at **index 3 with `byteOffset` 238** - measured on the fixture pinned in `test/integration/deident-private-reservation.test.ts`, whose File Meta is the minimum **this parser** requires rather than PS3.10's - a fixture with more File Meta shifts every offset, and a pass-2 grade read 292 off one that did.
  `Element.byteOffset` is the position the parser counted and the overwrite cannot move it, so it is
  checked **beside** the index, conjunctively - offsets are comparable within one Data Set (measured
  0/16/36 for three elements of a defined-length item) but `Element` is publicly constructible, so a
  hand-built object may carry none and there the index bound is what still bites. **The grid cannot
  see this either: the index-only and two-bound remedies differ on 0 of 83,037 cells**, because no
  `priv|` fixture collides tags. **3 tests, full suite, are the whole pin** - the two collision rows
  and the creator-flip.
  **▶ 🩺 AND THE COLLISION DESTROYS THE ROOT'S OWN VALUE ON THE WAY IN - `PRE-EXISTING`, ITS OWN
  ITEM, NOT FIXED HERE.** The overwrite replaces the reservation's genuine root element with the
  Item's, silently, at parse time, with no warning naming it and no report entry: the
  `Map<Tag, Element>` substitution already recorded for `(0010,0020)`, now reached on the
  private-retention path. Asserted in the tests so it cannot be mistaken for something this remedy
  handled.
  **▶ THE PRICE, AND IT IS NOT SMALL.** Grid over **83,037** cells against `300af87`: `priv: kept at
ROOT, file CONTRADICTS` **78 -> 0**, of which the eject leaks are **22 -> 0** and the remaining
  **56 are the cost** - root retentions on self-contradicting files whose honest control does keep the
  value. Retention on files that do not contradict themselves is unchanged (**9 -> 9** root, **6 -> 6**
  in an Item), `no-creator` **0 -> 0**, `LEAKING` **11 -> 11**, conformant tiling controls **7 -> 7**,
  **0 cells differing in any PARSE respect, 0 cells whose READING differs**, 0 new lenient or strict
  fatals, 0 wrong root `(0010,0020)`. **Name the cost's column rather than folding it in:
  `de-identified OUTPUT lost a marker (cost)` reads 78** - that is the de-identify-boundary column,
  and the `LOST`/`GAINED a marker value` counters beside it are **parse**-tree columns reading 0. **118 cells changed, all `priv|`: 74
  Implicit VR LE, 44 Explicit VR.** `structural` also reads 118 by construction (it counts any record
  difference, de-identify columns included) and is not a reading claim.
  **▶ 🛑 THE HARNESS'S SYNTAX SPLIT WAS BLIND TO THREE OF ITS FOUR FAMILIES, AND IT IS FIXED HERE.**
  `--diff` classified a cell by whether its key _starts with_ the transfer syntax, which is only true
  of the sequence sweep; `carrier|`, `legit|` and `priv|` put their own prefix there, so **no row of
  theirs could ever count as Implicit VR LE**. This slice's 74 Implicit VR LE cells printed as
  `Implicit VR LE 0`. `transferSyntaxOf` fixes it, which also takes
  `onWarning != ds.warnings, Explicit VR` from **43 to 0** - those 43 were Implicit VR LE rows in other
  families, the D-03 residual, misattributed. **A syntax split quoted off that line for a slice
  touching those three families predates this fix and is not re-derivable.**
  **▶ THE "SILENT ON EVERY CHANNEL INCLUDING `{ strict: true }`" CLAIM IS TRUE OF THE PUBLISHED
  PACKAGE AND FALSE OF `main`, AND THE DIFFERENCE IS `#51` BEING UNRELEASED. MEASURE THE TARBALL, NOT
  THE VERSION NUMBER.** `npm pack @cosyte/dicom@0.0.10` plus the Explicit VR LE eject fixture:
  `removedPrivateTags` `[]`, the value in the output, the stamp `YES`, **`ds.warnings` empty and no
  throw under `{ strict: true }`** - exactly as the item filed it. On `main` the same file raises
  `DICOM_ITEM_CROSSES_SEQUENCE_END` on both channels and throws. Same tarball run against the
  **absorb** fixture: `0.0.8` leaks, `0.0.10` does not, so `#66` really did ship. **And `0.0.9` is not
  on the registry at all** (`package.json` carried it, the publish never happened, npm `E404`), which
  is why every "live on the published `0.0.9`" in this repo named a version that does not exist.
  **▶ 🛑 THE STALE BASE FIGURE IS RE-MEASURED AND BOTH HALVES ARE RETIRED, NOT REWORDED.** Fresh
  against the **sha** `300af87` (`origin/main` when this was written, not since `#69`):
  **8 of the 37** tests in
  `test/integration/deident-private-reservation.test.ts` run red, and they are exactly the eight eject
  tests; the remaining private-`SQ` residual is **green** on that base, by design. The old
  "**10 of the 31**" was measured against a **pre-`#66`** tree, so it was never a claim about today's
  `main`; and the correction beside it - "both residual tests now assert the new warning code, so both
  are red against base" - is **false against today's `main`**, because
  `DICOM_ITEM_CROSSES_SEQUENCE_END` has been on `main` since `79e9f34`. **A figure whose base moves is
  not a fact; re-run it or do not quote it.**
  **▶ NO NEW PUBLIC SURFACE, DELIBERATELY** - no Tier-2 code, no report field, no snapshot change, the
  same choice `#66` made. `report.removedPrivateTags` already names every removed tag and is the
  channel this defect read `[]` on.
  **▶ WHAT THIS SLICE DID NOT CLOSE, CLOSED SINCE:** the **private-`SQ` carve-out**, by
  `DICOM-PRIVATE-SQ-CARVE-OUT` (its own section below). At the time of this slice `keepsPrivate`
  decided before `descendSequence`, so a private `SQ` inside the settled run that the profile
  vouched for was kept verbatim and nothing inside it was examined.

## DICOM-PRIVATE-SQ-CARVE-OUT

- **🩺 A `Profile` vouching for a private attribute no longer decides the fate of the Data Sets
  nested inside its value.** (`PRE-EXISTING`, live through the published `0.0.10`, found by `#66`'s
  refuter, base `495c9fc`.) `keepsPrivate` still decides retention _before_ the descent, and that is
  not what was wrong. What was wrong is that "yes, retain" routed the element to `keepOrEmpty`,
  **the only path in the module that writes a source value into output unchanged** - so a private
  `SQ` was blitted whole and **nothing inside it was ever examined for PHI**. The remedy is four
  lines: `keepRetainedPrivate` sends a vouched-for private `SQ` into the same two branches every
  other `SQ` in the module already takes (`descendSequence` when its items exist,
  `emptyUnauditableSequence` when the parser never materialized them), and leaves a non-`SQ`
  private element on its existing `keepOrEmpty` route.
  **▶ THE CITATION IS §E.1.1, AND §E.3.10 IS WHAT BOUNDS THE PROFILE'S LICENCE.** PS3.15 2026c
  §E.3.10 retains "Private Attributes that are known by the de-identifier to be safe from identity
  leakage" - **one private attribute**, which is what a profile entry is knowledge about. It says
  nothing about a Data Set the sender encoded inside that attribute's value, and PS3.5 2026c §7.5.1
  makes an Item Value exactly that ("a DICOM Data Set composed of Data Elements"). PS3.15 2026c
  §E.1.1 then settles it directly: the obligation covers Table E.1-1 attributes "whether contained
  in the top level Data Set or embedded in an Item of a Sequence of Items", and a private carrier is
  one of those Sequences. **A vendor cannot vouch for `(0010,0010)`; it is not a Private Attribute.**
  **▶ THE HALF THAT NEEDS NO MALFORMED FILE IS THE SHARPER HALF, AND THE ORIGINAL RESIDUAL DID NOT
  HOLD IT.** The pinned residual was an absorb shape - a length lie pulling an orphan private element
  into the carrier's item. But on a **fully conformant** file, with `ds.warnings` empty and no length
  lie anywhere, a vendor who writes `(0010,0010)` inside a vouched-for private `SQ` had that name
  copied into de-identified output stamped `(0012,0062) = YES`. That case is now pinned with a
  **name-bearing** payload (`BOND^JAMES`) plus non-vacuity assertions that the name is really on the
  wire and really inside the item before the call - this repo has shipped two PHI pins that were
  vacuous by fixture, and a payload of UIDs and IDs cannot fail for the reason it claims to.
  **▶ 🛑 THE GRID CANNOT SEE THIS REMEDY AT ALL, AND THAT IS A CODE FACT, NOT A NULL RESULT.**
  `scripts/measure-sq-bound-grid.ts`'s `priv|` family builds its private data element as `LO` and its
  carrier is the public `(0008,1115)`, so the harness holds **no private-`SQ` cell**. Measured base
  `495c9fc` vs this tree over **83,037 cells**: **0 cells differing in any PARSE respect, 0 whose
  READING differs, 0 changed, 0 PHI regressions, 0 de-identified output lost a marker**, and every
  `priv:` counter identical (6 = 6 kept in an Item on a consistent file, 9 = 9 at the root). Read
  that as blast-radius evidence - the change reaches nothing outside the vouched-for-private-`SQ`
  path - and **never** as "measured safe by the grid". Same posture as the positional cut. The
  regression net is the unit tests.
  **▶ THE BASE-RED FIGURE, PINNED PER-SHA.** Against base `src/` at **`495c9fc`**, replaced
  wholesale rather than overlaid: **5 of the 57** tests in
  `test/integration/deident-private-reservation.test.ts` +
  `test/integration/deident-unauditable-sequence.test.ts` run red - the **4 that assert the
  closure**, plus the **control row** of the
  `DICOM-PRIVATE-SQ-PARSE-VR` residual, which asserts this same closure on the file the parser did
  resolve. Say "the 4 that assert the closure", **never "the 4 carve-out tests"**: five `it()`s live
  under a `DICOM-PRIVATE-SQ-CARVE-OUT` describe block, so a next worker enumerating the block finds
  5 and the phrase contradicts itself. That residual's own leaking row is **green on base by
  design**, and that half is **not** readable off the base-red run - the control assertion throws
  first, so the leaking row never executes. It was established by extracting that row into a
  standalone probe against base `src/`; re-derive it the same way rather than quoting this. That is
  the negative control as well as the figure - the tests fail against the wrong `src/` and pass
  against this one.
  Full suite `1071 -> 1074` passing.
  **🛑 THIS FIGURE READ `4 of the 56` AND `1071 -> 1073` UNTIL PASS 2 REFUSED IT.** The pass-1
  remedy added a test _after_ the figure was taken and the figure was not re-run - the exact trap
  `CLAUDE.md` writes with a 🛑, inside the slice that quotes it. Re-measured in a clean tree
  (`git archive b02e3a5`, then `src/` replaced wholesale from `495c9fc`), not patched in place.
  **▶ THE PRICE, MEASURED AND PINNED, AND IT IS PS3.5 §7.8.1's AND NOT A CHOICE MADE HERE.** Walking
  the carrier means the per-Data-Set reservation scope applies **inside** it, and Items do not
  inherit the enclosing Data Set's reservations. A vendor who nests a private element in a private
  `SQ` and reserves its block only at the **root** loses it - named on `report.removedPrivateTags`,
  never dropped silently. A vendor who writes the Private Creator **inside the Item**, as §7.8.1
  requires, keeps it. Both rows are pinned as a pair; the conformant one is what stops the remedy
  from degenerating into "empty every private sequence".
  **▶ NO NEW PUBLIC SURFACE, DELIBERATELY** - no Tier-2 code, no report field, no snapshot change,
  the same choice `#66` and `DICOM-ITEM-EJECT-ROUTE` made. The existing channels carry it:
  `report.removedPrivateTags` for a refused nested private element, `report.attributes` with a
  nested `contextPath` for a Table E.1-1 row acted on inside the carrier, and
  `report.unauditableSequences` + `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` for an un-walkable one.
  **▶ 🛑 THE BOUND BELOW IS NOW CLOSED BY `DICOM-PRIVATE-SQ-PARSE-VR` (its own section, next).
  READ THE REST OF THIS BULLET AS HISTORY, NOT AS STATUS** - the leak it describes is real, was live
  through `0.0.10` and through this slice, and is what the next one keyed the profile's declared VR
  on. Everything else here still stands.
  **▶ 🛑 THE BOUND, AND PASS 1 REFUSED THE SLICE FOR NOT STATING IT: `el.vr` IS THE PARSED VR, NOT
  THE PROFILE'S DECLARED ONE.** The `SQ` branch keys on the parse tree. Under Implicit VR LE a
  private tag has **no VR on the wire**, so `SQ` there is an inference the **parser** draws from a
  `Profile` it was given. Pass the profile to `parseDicom` and the element arrives `SQ` with items
  and is walked; pass it **only** to `deidentify()` and the identical bytes arrive `UN` with no
  items, take the non-`SQ` branch, and are kept verbatim exactly as before. Same profile, same
  bytes, opposite outcome. That is `DICOM-PRIVATE-SQ-PARSE-VR`, `PRE-EXISTING`, its own item, pinned
  as a residual test with a name-bearing payload. **It is NOT the undefined-length `UN` residual** -
  that one is a CP-246 descent this parser refused, and this carrier's length is **defined**, so
  CP-246 is never reached. The first draft of five artifacts said "one shape is still exempt" and
  named only the `UN`; the enumeration was the defect, not the guard. **Corrected, guard not
  widened** - and the `creatorsInScope` sentence claiming `RetainSafePrivate` "behaves identically
  whether the profile arrived at parse or at de-identification" is **retracted**: it was true only
  while every retained private element was kept verbatim.
  **▶ WHAT IS STILL NOT CLOSED, AND THIS SLICE DOES NOT TOUCH IT:** `DICOM-PRIVATE-SQ-PARSE-VR`
  above; the undefined-length **`UN`**
  whose CP-246 descent was refused (it keeps `vr === "UN"`, so `isUnauditableSequence`'s first
  conjunct is false and relaxing it would empty every unknown-VR element in every file); and the
  11 leaf-carrier cells of `DICOM-BINARY-CARRIER-OVERDECLARE`, **whose leak the founder decided to
  ACCEPT on 2026-08-05** - the grid confirms this slice left it alone at 11 -> 11, with the
  conformant tiling-control counter unmoved at 7 -> 7. A pass-1 finding also names a **binary
  private carrier written `OB`/`UN` with an honest defined length whose value is a well-formed item
  stream**, reached through the `RetainSafePrivate` retention route the grid's `carrier|` family
  never exercises (it runs `deidentify()` with no options). Adjacent to the accepted
  `DICOM-BINARY-CARRIER-OVERDECLARE` but not the same route; **do not grow the guard for it**.

## DICOM-PRIVATE-SQ-PARSE-VR

- **🩺 THE PROFILE'S DECLARED VR IS A SECOND AUTHORITY, AND WITHOUT IT THE CARVE-OUT CLOSED ONLY
  WHAT THE PARSE TREE HAPPENED TO RESOLVE.** (`PRE-EXISTING`, opened by `#77`'s own pass-1 refuter
  while closing `DICOM-PRIVATE-SQ-CARVE-OUT`, base `369abbe`.) `keepRetainedPrivate` branched on
  `el.vr === "SQ"` alone. The remedy adds one more question, asked only of an element
  `RetainSafePrivate` has already decided to retain: **does the `Profile` that vouched for it
  declare it `SQ`?** If yes and the tree has no items, the carrier is emptied through the channel a
  parsed `SQ` with no items already used. `keepsPrivate` is untouched, the retention decision is
  untouched, no parser file is touched, and **no content test is added** - `declaredPrivateVr` reads
  one field off the caller's own profile, which is the same lookup `keepsPrivate` already performs.
  **▶ TWO ENCODINGS MAKE THE TREE AND THE PROFILE DISAGREE, AND ONLY ONE OF THEM IS MALFORMED -
  NEITHER, IN FACT.** (1) **Implicit VR LE writes no VR at all** (PS3.5 2026c §7.1.3), so for a
  private tag `SQ` is an inference the **parser** draws from a profile _it_ was given; pass the
  profile only to `deidentify()` and the identical bytes arrive `UN`. (2) **Under Explicit VR the
  wire VR wins in the parser**, so a sender who writes a profile-declared `SQ` attribute as `OB`
  yields `OB` - **with an honest defined length wrapping a well-formed `(FFFE,E000)` item stream**,
  which is `#77`'s pass-1 `F2` and was filed as the second shape. Both were measured leaking on
  `369abbe` with a name-bearing payload; both are closed here by the same four lines.
  **▶ 🛑 THE EXPLICIT VR SHAPE IS SILENT ON `ds.warnings` - THE IMPLICIT ONE IS NOT, AND THE
  DIFFERENCE IS PINNED ON BOTH ROWS.** The Implicit VR LE file raises
  `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`; the `OB` file is **fully conformant** and raises
  nothing. So `ds.warnings` was never the channel for this class, and
  `report.unauditableSequences` is. Do not summarise either shape as "warned" or as "silent" without
  re-running both.
  **▶ WHAT IS DELIBERATELY NOT CLOSED, AND DO NOT GROW THE GUARD FOR IT.** A carrier the profile
  does **not** declare `SQ` **and** whose value the embedded-attribute scanner cannot read, over a
  value that happens to be a well-formed item stream. **Both conjuncts, or the sentence is wrong in
  the other direction** - a graded pass refuted a draft of this very paragraph that named only the
  first, because five non-`SQ` cells ARE emptied (the scanner reads them). Nothing
  declares a Data Set to be in there; separating one from a legitimate binary blob is a **content
  test on exactly the VRs arbitrary bytes are for**, which is the same reasoning the founder
  accepted `DICOM-BINARY-CARRIER-OVERDECLARE` on. **🛑 IT IS NOT THAT DECISION, AND A GRADED PASS
  REFUSED THE DRAFT THAT LABELLED IT ONE.** That decision priced a measured **over-declare swallow**
  (11 grid cells, `delta=18`, remedy built and costed); this is an **honest** length reached through
  `RetainSafePrivate`, which four prior artifacts each call a **different route**. A leak nobody
  decided must not inherit a decision, because under the umbrella's BACKLOG rules a decided leak
  leaves the list. **Open, disclosed, undecided.**
  **▶ 🔴 THE "BINARY VR" WORDING OF THAT RESIDUAL WAS FALSE AND IS DELETED, NOT REWORDED A THIRD
  TIME** (`DICOM-RETAIN-ROUTE-RESIDUALS`, 2026-08-06, base `92c0373`). Four artifacts - this
  section, `CLAUDE.md`, `README.md`, `docs-content/troubleshooting.md` - plus the `keepRetainedPrivate`
  JSDoc and the `CHANGELOG` all said the surviving shape was "a profile entry declaring a **binary**
  VR (`OB`/`OW`/`UN`)". **It is not a statement about the profile's declaration alone, and the
  measured set is neither narrower nor wider than the deleted one - the two are INCOMPARABLE.** A
  profile entry declaring `LO` over a carrier the sender wrote `OB` leaks; a profile entry declaring
  `OB` over a carrier the sender wrote `LO` does not. **The predicate has TWO conjuncts and the
  deleted wording named neither**: the profile does not declare `SQ`, so this branch does not answer
  it, **and** the embedded-attribute scanner cannot read the value, so `keepOrEmpty` does not empty
  it. That scanner reads **string carriers only** and decodes tiles in the **file's own encoding**,
  which is also why a string carrier holding Explicit-VR-shaped bytes inside an Implicit VR LE file
  leaks. Same disease as
  `#78`'s deleted count and `#77`'s "one shape is still exempt": **the enumeration was the defect and
  the guard was right.** No artifact carries a list now. The `it("the honest-length carrier surface
is a MATRIX...")` case in `deident-private-reservation.test.ts` asserts the **emptied** set
  exactly, so the leaking set is whatever is left and cannot go stale in prose. It also pins the
  leaking cells as **kept VERBATIM** (`rawBytes.equals` the file's own value) and **silent** (nothing
  on `report.unauditableSequences`, nothing on `ds.warnings`, `(0012,0062) = YES`), because a
  substring search alone does not distinguish "kept" from "partly rewritten".
  **▶ 🛑 THE MATRIX HAS ASYMMETRIC AXES AND A GRADED PASS REFUSED THE DRAFT THAT CROSSED THEM.**
  **Implicit VR LE writes no VR** (PS3.5 2026c §7.1.3), so there is no wire-VR axis there. The first
  draft crossed one in anyway and produced **24 Implicit cells that were one file measured 24 times**
  (identical sha256), then billed the closure as proven on "all four wire VRs and both encodings".
  It is proven on **five distinct inputs**: four Explicit wire VRs plus the one VR-less Implicit
  file, each run under six profiles. Never cross a wire-VR axis into Implicit VR LE.
  **▶ 🛑 `#77`'s PASS-1 `F2` IS CLOSED, BUT THE BACKLOG'S WORDING FOR IT IS STILL TRUE AND MUST NOT
  BE MARKED STALE.** `F2` was the shape where the **profile declares `SQ`** and the wire says `OB`,
  and `#78` closed it. "An honest-length `OB`/`UN` carrier wrapping a well-formed item stream" is
  **wider than `F2` was**, and in that wider reading it is still an open, live leak on every non-`SQ`
  declaration. A draft of this paragraph called the phrase a stale premise and was refused for it.
  What closed is the `declares-SQ` sub-case only. Read the matrix before concluding either way.
  **▶ 🩺 THE EVIDENCE THAT BEARS ON THE UNDECIDED CALL, WRITTEN DOWN RATHER THAN ACTED ON.** There
  are exactly two remedies and **both are product calls, neither is a bug fix**. (1) A content test
  on binary carriers: `SCANNABLE_CARRIER_VRS` is string-only by construction, and `embedded.ts`
  already prices dropping that conjunct at **11 grid cells to 0 while emptying all 5 conformant
  binary tiling controls** - `DICOM-DEIDENT-OVER-REDACTION`, still open. (2) The one remedy needing
  **no** content test: refuse retention wherever the profile's **declared** VR and the **parse tree**
  disagree. It is the natural extension of `#78`'s second-authority argument and it closes the
  `decl=LO wire=OB` cells - **but a `UN` carrier whose profile declares `LO` is the single most
  ordinary real-world private element there is** (an intermediary that lacked the private dictionary
  rewrote the VR, PS3.5 §6.2.2), so it would drop the vendor value out of a large share of
  conformant files. That is over-redaction, and `CLAUDE.md` binds it as a PRODUCT call. **Neither
  was built here, deliberately.** Do not read this paragraph as a recommendation of either.
  **▶ 🛑 THE BRANCH HAS THREE CONJUNCTS AND TWO OF THEM WERE PUT THERE BY A GRADED PASS. NEITHER IS
  A REFINEMENT OF THE RULE; EACH KEEPS A PROPERTY THE MODULE ALREADY HAD.** Each is pinned by
  exactly one test, proven by dropping it.
  1. **`!hasUndefinedVr(el)` FIRST.** The new branch sits ahead of `keepOrEmpty`, so without this it
     preempts `emptyUndefinedVrElement` - **the one path in the module that deliberately names no
     tag**, because the condition raising it is that the header was fabricated from bytes inside
     some element's value. An under-declared length upstream can resynchronize the reader onto four
     bytes that spell **the caller's own vendor block**, whose Private Creator is genuine and whose
     position is inside the settled run, so every other conjunct holds. Measured: the fabricated tag
     reached the warning and `report.unauditableSequences`, and `undefinedVrElements` went empty.
     Both routes empty the element, so **no value moves either way** - what moved is the diagnostic,
     which is the class `CLAUDE.md` says cost three warning codes. Do not reorder these two tests.
     **▶ 🩺 IT IS A PARTIAL BOUND, A SECOND GRADED PASS REFUSED THE FIVE ARTIFACTS THAT WROTE IT UP
     AS A CLOSURE, AND THE REMEDY WAS THE CLAIM.** `hasUndefinedVr` only answers a fabricated header
     whose own **VR bytes fall outside the 34**. Change the fixture's two fabricated VR bytes from
     `Zz` to `OB` and every conjunct holds, this branch answers it, and the fabricated tag reaches
     both the warning and `report.unauditableSequences`. Measured on the slice's own F2 fixture.
     **The guard is NOT grown for it, for two measured reasons.** A fabricated `OB` header and a
     genuine one are **byte-identical** - the permanent fact that has stopped five slices, so there
     is nothing to key on. And on that identical input **base kept the carrier verbatim and shipped
     the whole nested `(0010,0010)`**, so the direction is a strict improvement: four bytes of tag
     on a report instead of a name in the output. It is the same shape as
     `report.removedPrivateTags`' fabricated odd-group header, already disclosed and live on both
     trees. **`DeidentifyReport` now has a third way to carry document content, and it is never a
     value-free surface.** Pinned as the second row of the fabricated-header test, which asserts the
     leak rather than lamenting it: if that row ever goes green the bound moved and these paragraphs
     are stale.
     **▶ 🛑 AND DO NOT WRITE A COUNT OF `DeidentifyReport`'S VALUE-BEARING FIELDS. IT HAS READ 1,
     THEN 2, THEN 3, AND WAS WRONG EVERY TIME IT WAS READ**, because each correction bumped the
     numeral without re-deriving the list. A third graded pass caught the "three" this slice wrote,
     by naming a fourth: `embeddedAttributes[].hidden`, whose entries are composed from four bytes
     found **inside** a value, so on any file that populates the field at all they are document
     content by construction. Measured on a `CS` carrier over-declaring across `"SABC"`:
     `hidden: ["41534342"]`, `"SABC"` in wire order, **identical on both trees and on every release
     that has shipped the field**. `PRE-EXISTING`, disclosed on the type and in troubleshooting, and
     **its remedy is its own slice** - `DICOM-EMBEDDED-HIDDEN-NOT-VALUE-FREE`, which pairs naturally
     with the cap that same field is already missing. Every artifact now names the LIST and no
     artifact names a number.
  2. **`el.length > 0`.** The emptied carrier still satisfies every other conjunct, so a second
     `deidentify()` over the first one's output reported a **second drop with `byteLength: 0`**
     where nothing was left to drop. Bytes were already idempotent; the audit was not. The
     parsed-`SQ` producer never had this, because `rebuildSequence` yields `items: []`.
     **▶ THE WARNING MESSAGE NO LONGER SAYS `is VR=SQ`, AND THAT IS NOT A WORDING PREFERENCE.** The
     frozen registry string is shared by both producers, and producer 2's whole premise is that the
     parse tree and the profile disagree about the VR - so it stated a fact the file contradicts, on
     the one channel this class designates, under `(0012,0062) = YES`. Measured saying `is VR=SQ` over
     an `OB` carrier, over an `LO` carrier, over an unrecognized `Zz`, and over a CP-246 `UN`. It now
     reads "is a Sequence carrier with no parsed items", and `{n}` is described as the **recorded span**
     rather than the value length, because `rawBytes` is full-span under Explicit VR. Pinned by an
     assertion that the template contains no `VR=SQ`.
     **▶ THE EMPTIED ELEMENT KEEPS ITS PARSED VR, and that is why `emptyUnauditableSequence` was split
     rather than reused whole.** `rebuildSequence` re-types to `SQ` and under Explicit VR that VR is
     two real bytes in the output, so emptying an `OB` through it would assert a type the sender never
     wrote. The parsed-`SQ` caller still rebuilds; the new caller uses `freshScalar`. One audit
     channel, one warning code, **no new public surface** - the same choice `#66`, `#69` and `#77` made.
     `UnauditableSequenceFinding`'s JSDoc now names both producers, because the field's meaning is
     wider than "a parsed `SQ`" and a consumer reading only the old sentence would mis-read it.
     **▶ THE COST, AND IT IS NOT ZERO.** A caller who passes a profile to `deidentify()` but not to
     `parseDicom` now **loses** the vendor sequence's content instead of shipping it verbatim. That is
     the fail-safe direction and it is the same trade every un-auditable sequence already makes, but it
     is over-removal against `0.0.10` and the remedy on the caller's side is one line: pass the profile
     to `parseDicom` too, and the sequence is walked, de-identified and retained. Stated in the
     changeset, the README and `troubleshooting.md` rather than discovered later.
     **▶ THE BASE-RED FIGURE, PINNED PER-SHA AND MEASURED OVER THE FULL SUITE AFTER THE LAST TEST WAS
     ADDED. Against base `src/` at `369abbe`, replaced wholesale (`rm -rf src` then `git archive`,
     never `git checkout -- src/`, which OVERLAYS): 5 of 1,081 run red.** Suite `1074 -> 1080` passing
     plus the 1 `todo`. **It read `2 of 1,077` before the graded pass added four more tests, and was
     re-run rather than carried forward** - the trap this file already writes with a stop sign. **Two
     of the seven new or rewritten tests are GREEN on base BY DESIGN, because they are controls**: that
     a retained private element the profile declares `LO` is still kept **verbatim** (or the remedy has
     degenerated into "empty every retained private element"), and that a fabricated header keeps the
     tag-free diagnostic, which base already did.
     **▶ EVERY CONJUNCT IS NON-VACUOUS AND EACH WAS PROVEN BY MUTATION, NOT ASSERTED.** Widening the
     predicate from `=== "SQ"` to `!== undefined` reds **14** tests in
     `deident-private-reservation.test.ts`, the `LO` control among them; dropping `!hasUndefinedVr(el)`
     reds exactly the fabricated-header test; dropping `el.length > 0` reds exactly the second-pass
     test. Re-derive them that way rather than quoting the numbers.
     **▶ THE GRID WAS NOT RE-RUN, AND THAT IS A REASONED OMISSION RATHER THAN A SKIPPED STEP.**
     `scripts/measure-sq-bound-grid.ts` holds **no private-`SQ` cell at all** (`#77` measured 0 of
     83,037 differing for the carve-out itself, for the same reason: the `priv|` family builds an `LO`
     behind a **public** carrier and every family runs `deidentify()` with no options, so
     `RetainSafePrivate` is never on, and with it neither of the two routes that write a private
     value into de-identified output: a caller `Profile`, and the file's own `(0008,0300)`
     declaration). This remedy is reachable **only** from inside
     `keepRetainedPrivate`, which only those routes reach. **Never read that as coverage.** The net is
     the unit tests.

## DICOM-PRIVATE-CREATOR-RESERVATION-LEAK

- **🩺 A private value no longer crosses the PS3.5 section 7.8.1 reservation boundary WHEN AN ITEM
  ABSORBS IT. The EJECT direction is closed by `DICOM-ITEM-EJECT-ROUTE` (its own section above);
  the private-`SQ` carve-out is closed by `DICOM-PRIVATE-SQ-CARVE-OUT` (its own section above), and
  was open at the time this slice shipped - read the bullet below as history, not as status.**
  (`DICOM-PRIVATE-CREATOR-RESERVATION-LEAK`, `PRE-EXISTING`, **measured live on the published `0.0.8` tarball and fixed on `0.0.10`; `0.0.9` is not on the registry**, found by
  `#51`'s pass-6 refuter and **measured identical on `origin/main`**). An `(FFFE,E000)` Item
  declaring more bytes than its enclosing `SQ`'s Value Length absorbs the element that followed the
  sequence; with the creator as genuine Item content and the private data element written at the
  **root**, the absorbed element was vouched for by a reservation it never had. Measured on
  `164eb39`: `removedPrivateTags: []`, the value in the output, `(0012,0062) = YES`, **no warning on
  either channel**.
  **▶ THE REMEDY IS AT THE DE-IDENTIFY BOUNDARY AND IT REMOVES - IT DOES NOT DOWNGRADE THE STAMP.**
  `itemStreamOverrunsSequence` compares two fields the parser already recorded (`Element.length`
  against `Element.rawBytes.length`), the same shape as `isUnauditableSequence`; `processElements`
  carries a `reservationsUsable` flag that `descendSequence` narrows and that never recovers at any
  depth below. **NO PARSER FILE IS TOUCHED**: an over-declaring Item and an under-declaring Sequence
  are byte-identical, which `#51` established three times. Grid over **83,037 cells** vs `164eb39`:
  **0 cells differing in any PARSE respect, 0 cells whose READING differs** (a new counter - the
  parse-respect count folds both warning channels in), 0 new lenient or strict fatals, 0 markers
  lost or gained, 0 wrong root `(0010,0020)`, **0 Implicit VR LE changed** (free control - that path
  slices the item stream).
  **▶ THE SPEC DOES THE WORK, AND BOTH CITATIONS ARE NORMATIVE BODY TEXT, NOT NOTES.** PS3.5 2026c
  section 7.8.1: "Items within a sequence are self contained Data Sets ... The scope of the
  reservation is just within the Item. Items do not inherit the Private Data Element reservations
  made by Private Creator Data Elements in the Data Set in which the Item is nested" (one occurrence
  in the document, a bare `<para>` at section level). PS3.15 2026c section E.3.10: "Private
  Attributes that are known by the de-identifier to be safe from identity leakage shall be retained
  ...; all other Private Attributes shall be removed **or processed in the element-specific manner recommended by Deidentification Action (0008,0307), if present within Private Data Element Characteristics Sequence (0008,0300)**." **QUOTE THE WHOLE CLAUSE - IT HAS TWO
  BRANCHES AND A GATE CAUGHT THIS ONE TRUNCATED AT "removed"**, which reads a permissive clause as an
  absolute. This library does not implement `(0008,0307)`, so removal is the branch available to it.
  **Known** is the load-bearing word: the
  reservation's scope IS the Item's boundary, so a file that contradicts itself about where the Item
  ends establishes no knowledge, and E.3.10's default applies.
  **▶ 🛑 THE FAIL-SAFE-DIRECTION ARGUMENT IS RETRACTED, NOT REWORDED - `#51` WAS REFUSED FOR IT IN
  FIVE ARTIFACTS.** The direction is a property of **where the sender put the Private Creator**, not
  of the two readings. Both ABSORB placements are pinned and both are refused; the EJECT direction is
  pinned as a residual and is **not** refused. Do not restate this as "both directions are closed".
  **▶ THE GRID COULD NOT SEE THIS CLASS AND NOW CAN - THAT IS THE REUSABLE PART.** Every family in
  `scripts/measure-sq-bound-grid.ts` ran `deidentify()` with **no options**, and every route that
  writes a private value into de-identified output is gated on `RetainSafePrivate`: a caller
  `Profile`, and the file's own `(0008,0300)` declaration beside it.
  Three refuter passes read "0 PHI regressions" off that harness while this was live. The
  new `priv|` family sweeps creator placement x both length fields x three syntaxes: **58 -> 0**
  cells keep a private value inside an Item on a self-contradicting file, **20 of the 58 were NOT
  leaking anything** (creator and data element both genuine Item content - they pay for the
  guarantee), retention on files whose length fields agree is **unchanged** (6 -> 6 in an Item,
  **9 -> 9** at the root), and 0 rows are kept with no creator in scope on either tree.
  **▶ 🩺 TWO ROUTES ARE NOT CLOSED, AND THE HEADLINE IS NARROWED TO SAY SO.** A pass-1
  `conformance-refuter` grade found both; both are `PRE-EXISTING`, reproduce identically on
  `164eb39`, and both produce the same false attestation (`removedPrivateTags: []`, the value in the
  output, `(0012,0062) = YES`).
  (a) **The EJECT direction. CLOSED by `DICOM-ITEM-EJECT-ROUTE`** - the section above carries the
  remedy, the two predicates, the price and the corrected figures. What is preserved here is what
  `#66` established and a later slice must not re-derive: it was found by the pass-2 grade, it is
  **not root-specific** (reproduced one level down, into the still-usable enclosing Item), and
  **22 grid cells** exhibited it. The widening `#66` measured - narrowing `reservationsUsable`
  whenever a Data Set _contains_ an over-running sequence, **24** root retentions lost to close
  **2** of the 22 - is **superseded, not the remedy that shipped**: the other 20 are Implicit VR LE,
  where the sequence records no over-run at all, and the closing remedy needed a second predicate and
  a positional cut. Do not quote the 24 or the 2 as a cost of what shipped.
  (b) **The private-`SQ` carve-out. CLOSED by `DICOM-PRIVATE-SQ-CARVE-OUT`** - the section above
  carries the remedy, the citations, the base-red figure and the price. What is preserved here is
  what this slice established and a later one must not re-derive: `keepsPrivate` decided **before**
  `descendSequence`, so a private `SQ` the profile vouched for was kept **verbatim**, its items were
  never walked, and this rule was never consulted inside it. **This is `#54`'s exact refusal
  repeated** - the first draft of every artifact here said "every private element in such an Item is
  removed", unconditionally, with the carve-out documented two bullets above it in the README.
  Corrected everywhere, guard not widened. Both routes were **pinned as residual tests that asserted
  the leaking behaviour**, and both went red when fixed, which is what those pins were for.
  **▶ 🛑 THE GRID DOES NOT HOLD THE HEADLINE SHAPE, AND THE NUMBERS ARE STILL PRECISE.** `DELTAS` has
  no 26 (the wire size of the fixture's private value), so the `priv|` family contains **no**
  `creator-in-item`-absorbs-the-root-secret cell: the 58 are 38 `creator-at-root` + 20
  `both-in-item`. The headline shape is held by the unit tests, not by the grid. Adding 26 re-baselines
  every figure in every artifact, so it is a deliberate follow-up, never a silent edit.
  **▶ 🛑 CLASSIFY A `priv|` CELL BY WHAT THE PARSE PRODUCED, NEVER BY THE FIXTURE'S PLACEMENT LABEL.**
  A first draft counted **28 rows as leaks** that are conformant retentions: a delta pair can re-frame
  `creator-in-item` into a file whose honest reading puts **both** elements at the root, or into one
  where both are genuinely in the Item. `itemDelta === sqDelta` is exactly "the file does not
  contradict itself" for this family (one defined-length item, no Item Delimitation Item). The
  fixture-artifact-reported-as-a-finding failure mode, one more time.
  **▶ NO NEW PUBLIC SURFACE, DELIBERATELY**: no Tier-2 code, no report field, no snapshot change.
  `report.removedPrivateTags` already names every removed tag and is the channel this defect read
  `[]` on. What is **not** on any channel is the _reason_ - disclosed, not closed, because a new code
  owes `profiles.strict` an escalation answer and `#48` an amplification bound.
  **Adjacent shapes measured and pinned rather than assumed:** a Private Creator that over-declares
  and swallows its own block is removed **because `decodeCreator` no longer matches the profile**
  (fail-safe by construction, not by this rule); `RetainSafePrivate` with no profile retains nothing;
  and the other five Retain options plus a profile do not reopen it, because `keepsPrivate` is the
  only Data-Set-scoped decision in the module.

> **🛑 THE STALE FIGURE THAT SAT HERE IS RE-MEASURED AND DELETED, NOT REWORDED A THIRD TIME**
> (`DICOM-ITEM-EJECT-ROUTE`, 2026-08-05). It read "**10 of the 31 tests** in
> `test/integration/deident-private-reservation.test.ts` run red against `origin/main`'s `src/`, and
> the two residual tests are green on base by design". Both halves are retired:
>
> - The **10 of 31** was measured against a **pre-`#66`** tree, so it was never a claim about
>   today's `main`. **Fresh, against the sha `300af87`: 8 of the 37** run red, and they are
>   exactly the eight eject tests this slice added or rewrote. (That figure was itself re-measured
>   after a pass-1 remedy added three tests: it read 5 of 34 before them. **Inside the bullet that
>   says a moving-base figure is not a fact.** Re-run it after every test you add.)
> - The correction the umbrella carried - "both residual tests now assert the new warning code, so
>   both are red against base" - is **false against today's `main`**:
>   `DICOM_ITEM_CROSSES_SEQUENCE_END` has been on `main` since `79e9f34`, so asserting it is green
>   there. Measured: the one remaining residual (the private-`SQ` carve-out) is **green** on
>   `300af87`, by design, because it asserts behaviour base exhibits.
> - **RE-RUN AT `2daf0e3` (`DICOM-ITEM-CROSSES-RESIDUALS`, 2026-08-05), because `#70` edited this
>   test file after the measurement above was taken.** Same 37 tests, three bases, measured rather
>   than reasoned about: **8 of 37 red on `300af87`** - unchanged, and still exactly the eight eject
>   tests; **2 of 37 red on `0ead071`**, where six of the eight go green because `#69`'s fix is in
>   that `src/` and the two that stay red are the two `#70` strengthened to assert
>   `DICOM_DUPLICATE_TAG_IN_DATA_SET`, a code absent before it; and **0 of 37 on `2daf0e3`**, which
>   is `origin/main` today. **The `300af87` number survived only because `#70`'s two new assertions
>   landed inside tests that were already red there - it did not survive by being a fact.** So the
>   rule below gains a clause: re-run after every test you add **or strengthen**. `#70` added no
>   test, so the old clause obliged nothing, and that is the gap - not an oversight by `#70`.
> - **A BASE SWAP MUST REPLACE `src/`, NOT OVERLAY IT - AND THIS BIT THE FIRST DRAFT OF THE BULLET
>   ABOVE, which is why the recipe is written here rather than left to the next worker.**
>   `git worktree add --detach <dir> HEAD` then `git -C <dir> checkout <base> -- src/` restores only
>   the paths that exist at `<base>`; it does **not** remove paths added since, so
>   `src/parser/data-set-map.ts` (new in `#70`) survives and the tree measured is the base **plus**
>   one HEAD module. The three figures above are identical under both recipes **only because that
>   module is unreferenced by the base parser** - luck, not method, and the same shape as the
>   `300af87` number surviving. So: `rm -rf src` first, or `git archive <base> src | tar -x`, then
>   run that one test file in `<dir>`. Both recipes were run; the figures quoted are the replacing
>   one's.
>
> **The rule, which this file already carried once under
> [DICOM-PARSE-CREATORS-SCOPE](#dicom-parse-creators-scope) and which two slices have now paid for:
> a "N of M tests run red on base" figure has a moving base, so it is not a fact.** Re-run it or do
> not quote it. It is written here with the sha it was measured against for exactly that reason.

## DICOM-UNRECOGNIZED-VR-SHORT-FORM

- **An unrecognized Explicit VR is read AND written long-form** (`DICOM-UNRECOGNIZED-VR-SHORT-FORM`,
  closed after `0.0.8`). **This is the root cause `#53`/`#54`/`#55` compensated for at the
  de-identify boundary, and it is a behaviour change on the read path.** PS3.5 2026c section 6.2:
  "All new VRs defined in future versions of DICOM **shall** be of the same Data Element Structure
  as defined in [section 7.1.2] with reserved bytes after the VR and a 32-bit unsigned integer VL".
  Read from the `vendor/nema/part05` pin; the section 6.2 **note** about ignoring unrecognized VRs
  is informative and is not what this rests on.
  **▶ 🛑 WHAT A CONFORMANT FUTURE-VR FILE USED TO DO: NO SENTENCE, AND THIS SLICE MADE THE FOURTH
  WRONG ONE BEFORE ITS GATE CAUGHT IT.** The first draft of every artifact here said "it was a
  whole-object `INVALID_FILE_META` in every readable shape". **False.** The short-form read took the
  length from the two reserved bytes (`0x0000`), produced a zero-length value and resumed inside the
  32-bit VL field - so what happened next was decided by **the payload's own bytes**. The refuting
  case is now a row in the harness (`long-payload-tiles`): a payload beginning `"SH"` + a 16-bit `4`
  parses on base into a zero-length carrier PLUS a manufactured `(0000,0008) SH` element, and under
  **Explicit VR BE with no warning on either channel.** `long-overrun` and `long-undefined-length`
  are fatal on both trees; the three short-form shapes go the other way.
  **`scripts/measure-unrecognized-vr.ts` PRINTS THE TABLE - ADD A SHAPE, DO NOT WRITE A SUMMARY.
  Four attempts, four wrong.**
  **▶ ONE MORE VR CLASS ROUTED INTO AN EXISTING BOUND, NOT A NEW BOUND - the distinction four
  refusals in this family were about.** The gate re-derived section 7.1.2's short-form list
  independently (a closed 21-VR set) and confirmed `LONG_FORM_VRS ∪ ¬isRecognizedVr` is exactly its
  complement. `readExplicitElementHeader` and the File Meta reader take
  the 12-byte header when `!isRecognizedVr(vr)`; everything after it is untouched, so the value read,
  the declared-length-exceeds-buffer refusal and the undefined-length refusal are the ones `OB` /
  `UT` / `UN` already take. **No new warning code**: a conformant file is not something to warn
  about, and a new Tier-2 code would throw under `{ strict: true }` on exactly such a file.
  **▶ THE READER AND THE WRITER HAD TO SHIP TOGETHER.** The short form's length field is 16 bits, so
  a reader-only fix would re-emit a 70,000-byte value declaring **4,464**, silently. Pinned by a
  round-trip test at that size. `isRecognizedVr` / `KNOWN_VRS` now live once in `src/parser/endian.ts`
  (they were three private copies of `new Set(Object.keys(BE_VR_STRIDE))`).
  **▶ THE TRADE, ON THE 76,611-CELL GRID AGAINST `66f0c95`: 1,221 RECOVERED vs 932 NEWLY REFUSED.**
  0 PHI regressions, 0 root `(0010,0020)` value changes, **0 Implicit VR LE cells changed** (free
  control), leaking cells unmoved at 11. The grid also reads **0 cells that parse on both trees and
  read differently** - **quote that as a fact about the GRID'S FIXTURES, never as "the change never
  silently re-reads anything"**, which the gate refuted: `long-payload-tiles` is exactly such a cell
  and it is outside anything the grid sweeps. **All 932** of the newly refused had an unrecognized VR in their base
  parse tree - every file this refuses is one the old reader only "read" by manufacturing a header
  out of the middle of a value; the fabricated VRs include **`"CT"`, a Modality value read as a VR**.
  **The mirror shape is the cost and it is pinned by a test**: a sender that ignores section 6.2 and
  writes an unrecognized VR short-form parsed before and is refused now.
  **▶ 🛑 `#55`'s "on a conformant file the cost is zero" WAS NEVER TRUE, AND THE EXPLANATION OF WHY
  IS DELETED RATHER THAN REWORDED - THREE ATTEMPTS, THREE REFUTATIONS, IN THIS SLICE ALONE.** The
  gate refuted "it did not parse at all" (pass 1), the same sentence surviving in three more places
  (pass 2), and then "it parsed but the rule saw nothing in the value" (pass 3, counterexample: a
  conformant BE carrier whose payload is `"QQ" + u16(8) + 8 bytes` reaches the rule at base with
  **eight real value bytes**). That is `main`'s own rule applied to itself: **re-wording a
  disclosure twice is the signal to delete it.** The refuting shape is now a harness row
  (`long-payload-tiles-future-vr`). **ADD A SHAPE, NEVER A SENTENCE.** `deidentify()` still
  empties an unrecognized-VR element (reading a header is not knowing what the value means; Table E.1-1 acts
  per attribute), so a conformant future-VR file now loses a legitimate value. Disclosed, the same
  over-redaction trade as the sequence rule, and re-deciding it is `DICOM-DEIDENT-OVER-REDACTION`.
  **▶ `#55`'s TEST SUITE WAS RE-CUT, AND THE RE-CUT IS THE PROOF THE ROOT CAUSE MOVED.** Its
  under-declare fixtures fabricated `(4156,554C)` VR `"E "` from six leftover bytes; that file no
  longer parses. The fixtures now leave a **complete 12-byte header** in the leftover, giving
  `(4854,4F53)` VR `"ZZ"` - `"THSO"` in wire order, four letters of the surname in the payload - so
  the rule, the leak and the no-tag-in-the-diagnostic pins all still have a name-bearing fixture.
  **A fabricated header is NOT gone; it got more expensive to build.**
  **▶ THE `removedPrivateTags` CHANNEL: MEASURED, DISCLOSED, DELIBERATELY NOT CLOSED.** An `OB`
  carrier holding `"SECRET-NOTE-"` followed by a well-formed odd-group header reports
  `["41534342"]` = `"SABC"` in wire order, **identically on both trees**. The measured _text_-carrier
  instances (16 rows across four name payloads at `delta=-6`) are gone, because those files are now
  refused - but the channel is structural, not closed. Reporting the tag is the field's whole audit
  value on a well-formed file, so the **claim** was corrected (the report is not "value-free apart
  from `uidMap`"; there are two exceptions) rather than the guard widened. Narrowing the field is a
  product call about audit value versus a four-byte echo and has NOT been made.
  **▶ 🩺 THE PHI FIX THIS SLICE OWED, FOUND BY ITS GATE: `DICOM_NONZERO_RESERVED_BYTES` NAMED A TAG.**
  Reading an unrecognized VR long-form lands on the two bytes section 7.1.2 reserves, so that Tier-2
  code is **newly reachable on a fabricated header**. Measured on an `ST` carrier holding
  `"MR BRAIN  SMITHSON"` under-declared by 6: it streamed `Element (54495348) ...` - `"ITHS"` in wire
  order, **four letters of the surname** - on a file `66f0c95` parsed while emitting **nothing that
  named the fabricated element** (its only warning is `DICOM_ODD_LENGTH_VALUE_PADDED`, on a genuine
  `(0010,0010)`; measure it rather than saying "no warning at all", which a gate corrected).
  **Quote the payload WITH its tag**: `"MR BRAIN SMITHSON "` gives `48544F53` instead, and a draft
  of this entry paired the two wrongly. **The factory now takes no
  tag parameter** - the bound is the signature, not a branch - and `position.byteOffset` locates the
  element. Identical remedy and identical reasoning to `#55`'s blocker: where the trigger IS "these
  bytes are not what they claim to be", `renderTag` checks shape and cannot refuse them. It also
  closes a `PRE-EXISTING` instance of the same factory. Pinned with a name-bearing payload **and** a
  non-vacuity assertion that the code fires.
  **▶ WHAT THIS SLICE DID NOT TOUCH, ON PURPOSE:** `src/deident/embedded.ts`'s tiling scanner still
  refuses to tile an unrecognized VR (widening it empties more values - the same product call);
  and **the Tier-3 fatal messages still interpolate a tag and a VR composed from input**
  (`explicit-le.ts`, `implicit-le.ts`, `sequence.ts`). That is pre-existing and is not amplified
  here in kind: measured on the name-bearing fixture, base put the same four bytes on `Element.tag`
  and in `report.removedPrivateTags`, while head puts them in `err.message` beside a `snippet` that
  is already 16 raw source bytes by design (D-10). A registry for fatal messages, mirroring `#48`'s
  work on warnings, is its own slice.

## DICOM-CARRIER-LEAF-LEAKS

- **De-identification refuses to keep an element whose VR is not a VR**
  (`DICOM-CARRIER-LEAF-LEAKS` mechanism 2, closed after `0.0.6`). **The leaf-carrier 19 was two
  defects, and this is the half nobody knew about.** Re-derived on
  `scripts/measure-sq-bound-grid.ts` at `35adc2d` before anything changed - **19 leaking cells, 11
  at `delta=18` and 8 at `delta=-6`** - with the negative control run first (the grid against
  `d1031f5`'s `src/` restored **1,174** and reproduced `#54`'s 2,448-cell cost) and a second control
  confirming the harness fails outright when relocated to another package. Now **11**.
  **▶ IT IS THE _UNDER_-DECLARE, AND IT IS NOT A SWALLOW.** An over-declared length absorbs the
  following element into this one's value (`#53`). An under-declared one **desynchronizes the
  reader**: it finishes the short value early, reads the leftover bytes of the value that was
  actually encoded as the next Data Element header, and the element that genuinely followed becomes
  that fabricated element's value. Tag, VR and length are all fragments of somebody's value.
  Measured: a 14-byte carrier under-declaring by 6 yields `(4156,554C)` VR `"E "` holding the
  Patient ID in full, `warnings: []`, no throw under `{strict: true}`, clean report. **It reaches
  STRING carriers too** - 6 of the 8 cells were Explicit VR LE, two of them the `LO`/`ST` controls -
  so it is not bounded by the binary-VR story that frames the other half.
  **▶ THE TRIGGER IS A RECORDED FIELD, NOT A SCAN, AND THE CLAUSE IS §6.2 NOT §7.1.2.** PS3.5 2026c
  §6.2 "Value Representation (VR)": "All new VRs defined in future versions of DICOM **shall** be of
  the same Data Element Structure as defined in [§7.1.2] with reserved bytes after the VR and a
  32-bit unsigned integer VL". So an unrecognized VR is long-form by the standard's own rule, while
  this parser read it **short-form** (Postel; only `LONG_FORM_VRS` took the long layout) - its
  length came from the wrong two bytes and its value spanned the wrong bytes.
  **CORRECTED 2026-08-03: THE PARSER NO LONGER DOES THIS** (`DICOM-UNRECOGNIZED-VR-SHORT-FORM`, the
  entry above). The de-identify rule survives on a different footing - the header is now read the
  way §6.2 defines it, and what remains undecidable is what the value _means_, which is what Table
  E.1-1 needs. Trigger and code unchanged. `hasUndefinedVr` is `!KNOWN_VRS.has(el.vr)`: O(1), no per-offset loop.
  **The §6.2 sentence about treating an unrecognized VR as `UN` is in a `<note>` and is
  informative** - cite the "shall" above it, not that. Pins re-derived (`part05`
  `4dfd7b8c…`); each sentence occurs exactly once.
  **▶ NO CARVE-OUT, AND STRUCTURALLY SO - THIS IS THE `#54` REPEAT CLASS AVOIDED.** `#54` was
  refuted for claiming its emptying was unconditional when `keepsPrivate` decided first. Here
  `keepOrEmpty` is the **only** path that writes a source value out unchanged, and the test sits at
  its top; every other outcome (`X`/`Z`/`D`/`C`/`U`, private-by-default removal) already replaced the
  value. So `RetainSafePrivate` + a `Profile` does **not** exempt it, and that is pinned by a test
  rather than asserted in prose.
  **▶ `UN` IS UNTOUCHED AND THAT IS THE WHOLE LINE.** `UN` is one of the 34, so this never fires on
  an ordinary unknown-VR element, a private element with no creator, or the CP-246 `UN`. Under
  **Implicit VR LE it cannot fire at all** (the VR comes from the dictionary) - 0 Implicit cells
  moved, a free control. Widening it to "unknown to the dictionary" is the sweep that would empty
  every `UN` in every file.
  **▶ THE RECORD IS CAPPED AT 64 PER RUN, THE EMPTYING NEVER IS, AND THE AMPLIFICATION IS WORSE
  THAN `#54`'s.** An undefined-VR element is short-form, so the cheapest one an input can encode is
  an **8-byte header with a zero-length value**: 1 MiB is 131,072 of them. Budget on
  `DeidentifyContext`, not `ProcessResult` (which is per Data Set). The warning omits the tag and
  the VR - both are input, emitted once per element. Its `byteLength` maxed at **65,534** while the
  VL was read from 16 bits; **since `DICOM-UNRECOGNIZED-VR-SHORT-FORM` the field is 32-bit and that
  ceiling is gone** (the cap test now runs at 70,000).
  **▶ 🩺 THE GATE'S BLOCKER, AND IT IS THE ONE TO REMEMBER: THE DIAGNOSTIC REPUBLISHED THE PHI IT
  WAS RAISED ABOUT.** The first draft put `el.tag` into `report.undefinedVrElements[].tag` **and**
  into the warning message, under its own written claim "Both fields are structural... Safe to log",
  with a `console.warn` example shipped in the JSDoc. But the condition that raises this code is
  precisely that **the header was fabricated out of the middle of a value** - so those four tag
  bytes are document content. Measured by the refuter on an `ST` carrier holding
  `"MR BRAIN SMITHSON"`: the tag renders `48544F53`, i.e. `"THSO"` in wire order, four letters of
  the surname. **`renderTag` validates a tag's SHAPE and therefore cannot refuse one**, unlike
  `renderVr` which checks a closed set - so `WarningTokens`' "structural by construction" property
  holds for every other factory in the package and had to be kept **at the call site** here. Remedy:
  no tag on either channel; `byteOffset` identifies the element and is a count the parser kept.
  **And the test was vacuous by fixture**: the carrier value was the benign `"CARRIER-VALUE"`, whose
  leftover bytes are `"VALU"`, so `expect(message).not.toContain(PATIENT_ID)` could not fail either
  way. The tests now run on a name-bearing payload and a mutation control (re-adding the tag) turns
  three of them red. **The lesson generalizes past this code: when a diagnostic's trigger IS "these
  bytes are not what they claim to be", the fields naming the element are input.**
  New surface: `UndefinedVrFinding`, `DeidentifyReport.undefinedVrElements`,
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` (**28 Tier-2 codes, was 27**),
  `MAX_UNDEFINED_VR_FINDINGS`. `isScannableCarrier` **lost** its "VR not one of the 34" disjunct: the
  new rule empties such an element before the scan is reached, and conditioning the answer on a
  tiling run was the defect - an undefined-VR element whose bytes did not tile was kept.
  **▶ 🩺 THE ROOT CAUSE WAS A PARSE BEHAVIOUR THIS SLICE DID NOT TOUCH. CLOSED 2026-08-03 BY
  `DICOM-UNRECOGNIZED-VR-SHORT-FORM` - see the entry at the top of this list.**
  §6.2's **note** (informative) says an implementation "may choose to ignore VRs not recognized by
  applying the rules stated in [§7.1.2]" and that such an element's value "may be copied unchanged"
  - i.e. the standard treats it as a real Data Element with a real Value, read **long-form**. This
    parser read an unrecognized VR **short-form**, so emptying at the de-identify boundary was
    **compensation, not conformance**. Do not quote the note as support for this rule; the "shall"
    in §6.2's body is what supports it - and is what the parser now implements.
    **DO NOT SUMMARIZE WHAT A §6.2-CONFORMANT FUTURE-VR FILE DOES HERE. THREE PASSES TRIED AND ALL
    THREE SUMMARIES WERE WRONG** - including one written _into the warning against writing one_,
    which pass 3 then refuted by measuring the very shape it named. Passes 2 and 3 disagree on what a
    long-form future-VR element does, which is the finding: the behaviour is shape-specific and no
    one-clause rule covers it. **Re-wording a disclosure twice is the signal to delete it rather
    than try a third time**, so it is gone rather than fixed. Measure the shape in front of you.
    **▶ COST, PUBLISHED: 23 cells lose a marker from de-identified output, 15 of which were NOT
    leaking.** On a file conformant to **PS3.5 2026c** it is **zero** - the
    `DICOM-DEIDENT-OVER-REDACTION` trade does not recur here, because no such Explicit VR file and no
    Implicit VR file can produce one. Say the edition: §6.2 exists to describe a _future_ VR.
    **▶ 🩺 STILL LEAKING, AND NOW PRICED RATHER THAN JUST DISCLOSED: the 11 at `delta=18`.** The
    over-declare swallow into `OB`/`OW`/`US`/`UN`, silent, `LO`/`ST` controls at 0. **The obvious
    remedy was BUILT AND MEASURED, not argued about**: dropping the repertoire conjunct for binary VRs
    takes 11 → 0 **and empties all 5 conformant binary tiling controls** - a de-identifier deleting a
    legal `OB`/`UN` value because 8 of its bytes read as a zero-length `(0010,0020)`. That is a
    product call of the `DICOM-DEIDENT-OVER-REDACTION` shape, not a bug fix, and it needs its own
    item. The grid gained `LEGIT_TILING_CARRIERS` + a `conformant tiling control emptied` counter to
    make it a number. **Stride-0 VRs only**: `buildDicom` byte-swaps `OW`/`US` under Explicit BE, and
    a first draft that included them read **9** emptied rows where the honest number is **6** - a
    fixture artifact reported as a finding is the failure mode, and it was caught by asking why a
    binary row moved.
    **Other disclosed residuals, all `PRE-EXISTING` and none fixed here:** an **odd-group** fabricated
    tag reaches `report.removedPrivateTags` on **both** trees (measured `["4D535449"]` = `"SMIT"`), so
    the "value-free apart from `uidMap`" claim on the report was already imprecise before this slice -
    the even-group half and the log-message channel were this slice's to fix and are fixed, that one
    is not. **The CLAIM was corrected 2026-08-03** (`DeidentifyReport` now names two exceptions, not
    one) and the measured text-carrier instances are gone with the parse behaviour that produced
    them, but **the channel is structural and still open** - re-measured at `["41534342"]` = `"SABC"`
    on an `OB` carrier, identically on both trees. And an emptied undefined-VR element was
    **re-emitted** as a short-form element with an undefined VR, violating the same §6.2 sentence,
    inside output stamped `PatientIdentityRemoved=YES`; **the writer was fixed 2026-08-03** with the
    reader, so it re-emits the long form.

## DICOM-DEIDENT-RAWBYTES-PASSTHROUGH

- **De-identification refuses to keep a sequence it could not walk**
  (`DICOM-DEIDENT-RAWBYTES-PASSTHROUGH`, closed after `0.0.6`). **This was the larger half of the
  2,127 and it was never the same defect as the entry below.** A defined-length Implicit VR LE value
  that PS3.6 resolves to `SQ` but that is not a valid item stream is refused by the parser
  (`items: undefined`, `DICOM_SQ_NOT_DESCENDED`, declared span kept on `rawBytes`) - correct for a
  parser, unsafe for a de-identifier, which recursed only into sequences with items and so re-emitted
  the span verbatim. Measured on `scripts/measure-sq-bound-grid.ts` at `d1031f5`: **1,155 of 6,348
  parsing cells**, all Implicit VR LE, all carrying exactly `["DICOM_SQ_NOT_DESCENDED"]`. Now **0**.
  **▶ THE TRIGGER IS THE PARSER'S RECORDED REFUSAL, NOT A CONTENT TEST, AND THAT IS THE REUSABLE
  PART.** `deidentify()` reads `el.vr === "SQ" && el.items === undefined` and empties. There is **no
  scan**, so there is no per-offset loop and no cost that follows an attacker-chosen value length -
  the exact surface the entry below shipped quadratic for one round. Grounded in PS3.5 2026c §7.5.1
  ("Each Item Value shall contain a DICOM Data Set composed of Data Elements", so an `SQ` value is
  never legitimately opaque) and PS3.15 2026c §**E.1.1** ("whether contained in the top level Data
  Set or embedded in an Item of a Sequence of Items"). **Cite E.1.1, not E.1** - E.1 is the parent
  section; both sentences live in E.1.1 "De-identifier", each unique in the document, read from the
  re-derived pins. §E.1.1's own SOP-Instance-UID escalation ("the enclosing Attribute in the
  top-level Data Set must be encrypted in its entirety") is the standard's precedent for answering at
  the carrier, and is **about the encrypt-and-replace mechanism**, so cite it as precedent and not as
  a rule about Table E.1-1.
  **▶ IT COSTS CONTENT AND THE COST IS A PUBLISHED NUMBER, NOT A PHRASE.** 2,448 grid cells lose a
  value from de-identified output; **1,293 of them were not leaking anything** and pay only for the
  guarantee. The grid could not express this before - `lostValue` compares _parse_ trees, so no
  de-identify-boundary remedy can ever move it. A `deidSeen` column and a printed
  `cells differing in any PARSE respect` were added, the latter because `changed`/`structural` both
  move for a de-identify-only difference and are the wrong numbers to quote for "the reading is
  untouched".
  New surface: `UnauditableSequenceFinding`, `DeidentifyReport.unauditableSequences`,
  `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` (**27 Tier-2 codes, was 26**). A listed `SQ` kept by a Retain
  Option now audits as `emptied`, not `kept` - it produced an empty sequence anyway while claiming
  retention.
  **▶ THE RECORD IS CAPPED AT 64 PER RUN AND THE ACTION NEVER IS, AND THE CAP HAS TO BE RUN-SCOPED.**
  `#48` bound every consumer-controlled diagnostic; `#53` then shipped a new unbounded one, and the
  refuter measured this slice's first draft at **58,255 findings and 36 MB of warnings from a 1 MiB
  input** because element count is attacker-chosen exactly as a value length is. The budget lives on
  `DeidentifyContext` and is **deliberately mutable**: `processElements` builds a fresh result per
  Data Set and merges upward, so a per-result cap bounds each item independently and not the file.
  The registry message was also cut from ~620 to ~150 characters, because a per-element string is
  multiplied by that same count. **`ds.warnings` itself stays uncapped** (pre-existing, shared with
  every parser warning, and no parser file is touched here), which is why `DICOM_SQ_NOT_DESCENDED`'s
  text is kept terse rather than restating the reasoning: pass 2 measured the slice's first draft
  growing it 225 -> 371 characters against an uncapped per-element emission.
  **▶ THREE CLAIMS THIS SLICE SHIPPED WERE FALSE AND THE REFUTER CAUGHT ALL THREE. THE FIX IS ALWAYS
  TO CORRECT THE CLAIM, NEVER TO WIDEN THE GUARD** (`#50`'s rule). (1) `isUnauditableSequence`'s own
  JSDoc named the CP-246 `UN` shape as a covered "route" while three other artifacts in the same
  commit said it still leaks. (2) The `DICOM_SQ_NOT_DESCENDED` message and the README/troubleshooting
  rows said `deidentify()` empties such an element, **unconditionally** - but `keepsPrivate` decides
  first, so a private `SQ` vouched for by `RetainSafePrivate` + a `Profile` was kept verbatim and
  **measurably still leaked** (closed since, by `DICOM-PRIVATE-SQ-CARVE-OUT`; the claim was correct
  when it was written, which is the point of the rule). (3) "the sender's encoding is why" is false for a **conformant** file
  nested past `NESTING_DEPTH_LIMIT` (64), which is this library's bound, not PS3.5's. Both carve-outs
  are now pinned by tests so the claims and the code cannot drift apart again.
  **▶ THE BINARY-VR RESIDUAL IS NO LONGER UNMEASURED, AND THE SWEEP FOUND A SECOND MECHANISM.** The
  grid gained an over-declaring **leaf** carrier (`LEAF_CARRIERS` in the grid script): **19 leaking cells,
  identical on both trees**, `PRE-EXISTING`. **11 at `delta=18`** are the disclosed swallow into
  `OB`/`OW`/`US`/`UN`, silent, with the `LO`/`ST` controls on the identical fixture at **0** - that
  contrast is what proves it is the carrier's VR and not a new defect. **8 at `delta=-6` are a
  different thing entirely**: an _under_-declare, where the leftover value bytes are read as a Data
  Element header and the identifier lands inside a manufactured element with an unknown on-wire VR
  (measured: tag `(4156,554C)`, VR `"E "`). That one hits **string** carriers too and was disclosed
  nowhere before. Neither is fixed here.
  **▶ STILL LEAKING, MEASURED, AND IT CANNOT BE CLOSED BY WIDENING THIS RULE:** an undefined-length
  `UN` whose CP-246 descent was refused keeps `vr === "UN"`, and **every ordinary `UN` element also
  has `items === undefined`**, so the same test there would empty every unknown-VR element in every
  file. It needs a parser-set mark, i.e. its own slice. Measured on a hand-built file: identifier in
  the output, no report entry, only `DICOM_VR_MISMATCH`. Its former companion - a **private** `SQ`
  under `RetainSafePrivate` + a `Profile`, kept verbatim because the profile vouched for it - is
  **closed by `DICOM-PRIVATE-SQ-CARVE-OUT`**, and the parsed-VR half of it by
  `DICOM-PRIVATE-SQ-PARSE-VR` (its own section below), which added the profile's **declared** VR as
  a second authority. **🛑 THAT SECOND ONE DOES REACH THIS SHAPE, AND A GRADED PASS REFUSED THE
  DRAFT THAT SAID OTHERWISE.** Its predicate does not test the length **field**, so an
  undefined-length `UN` whose CP-246 descent was refused **is** emptied whenever a `Profile` declared
  that private attribute `SQ`. **Say it that way and not "no length condition"** - `el.length > 0` is
  one of its three conjuncts, a refused CP-246 descent carries `0xFFFFFFFF` there so it passes, and a
  second graded pass refused the six artifacts that claimed the predicate had no length condition at
  all in the same commit that added one. The conclusion held; the stated reason did not. The residual below is what survives outside that route - it is a statement about
  elements **no profile named**, where the `UN` test genuinely cannot be relaxed. Do not restate it
  as covering every `UN`.

## DICOM-OVERDECLARE-SWALLOWS-INTO-VALUE

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
  UNMEASURED and has no backlog item yet.** (Measured by the entry above: 19 grid cells.)
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
  **▶ DISCLOSED BY THE PASSING GRADE, NOT FIXED, AND IT IS THE SAME DISCIPLINE `#48` ESTABLISHED:**
  `report.embeddedAttributes[].hidden` is **unbounded**. A 1 MiB Implicit VR carrier of chained
  8-byte zero-length elements yields **131,072 tag strings** and ~270 ms in `deidentify()` against
  1-2 ms to parse the same file. Linear, so not the CPU-DoS class above - but `49b6397` bound every
  _other_ consumer-controlled diagnostic and this new one missed the cap. Take it before the next
  `deident` slice.
  **▶ STILL OPEN, MEASURED, AND ITS OWN ITEM:** 1,155 grid cells still leak, and **within the grid**
  they are all Implicit VR LE carrying `DICOM_SQ_NOT_DESCENDED` - the `rawBytes` passthrough of a
  sequence the parser declined to descend (`DICOM-DEIDENT-RAWBYTES-PASSTHROUGH`). Read that as a
  statement about the grid, **not** as an exhaustive account of what still leaks: the binary-carrier
  residual above is outside anything the grid sweeps.
  **▶ `scripts/measure-sq-bound-grid.ts` IS NOW ON `main`.** It was written on the refused `#51`
  branch, which made this repo's own "re-run the grid before changing this code" unactionable. Cherry
  -picked with the `declaredLengthDelta` / `omitItemDelim` knobs in `test/helpers/build-dicom.ts` that
  it needs. 76,293 cells; `--diff` prints every number the artifacts state.

## Shipped phases (4 through 7 of 8)

- **Phase 7 of 8 complete** (580 tests passing, 1 todo). Metadata-level de-identification live:
  `deidentify(ds, options?)` applies the PS3.15 Annex E Basic Application Level Confidentiality Profile
  plus the metadata-affecting Options, driven by the generated Table E.1-1 action map. Pure
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
  transcode) across the four native syntaxes and every PS3.5 2026c section A.4 encapsulation syntax,
  the same generated list the parser dispatches), with even-length padding, short/long-form headers,
  retired group-length omission, byte-for-byte encapsulated-pixel-data passthrough, and every Data Set
  it can walk (root and Sequence Items, up to `NESTING_DEPTH_LIMIT`) emitted in ascending tag order
  from the element's own bytes; plus the `DicomSerializeError` taxonomy. Under a section A.4 syntax
  the Data Set is Explicit VR LE and the top-level Pixel Data is rebuilt as `OB` undefined length
  around the input's Basic Offset Table and fragment Items (byte for byte) and a zero-length
  Sequence Delimitation Item (`src/serialize/encapsulated.ts`). Known limitations: under a section
  A.4 syntax a top-level Data Set the section does not allow is REFUSED with
  `INVALID_ENCAPSULATED_PIXEL_DATA`, never repaired: absent, native, Float or Double Float Pixel Data,
  an undelimited stream (so a `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED` object is read and not
  written), a non-Item or undefined-length Item, an odd Item Length, an empty fragment, no Basic
  Offset Table Item or no fragment, and bytes after the delimiter; its messages are fixed strings and
  nested Pixel Data is not checked. Only the typed `FileMeta` fields round-trip; a tag repeated in an
  Item, an unwalkable or over-bound Sequence, one whose parsed `items` do not match its bytes and a
  `UN`-carried Sequence are written as read, and an element whose bytes do not show where a reader
  ends it is written last in its Data Set (`docs-content/serialization.md`).
- **Phase 4 complete.** Safety-critical domain helpers: `ds.patient` / `ds.study` / `ds.series` /
  `ds.image` typed fail-safe views over the §4 attributes, Enhanced multi-frame functional-group
  resolution (`image.frame(i)`, Per-Frame-else-Shared), coded triplets (`readCode`), and the
  value-layer `DicomValueError`. Builds on Phase 3 VR value decode (all 34 VRs via `Element.value`) +
  the `Dataset`/`Item` navigation API.

## The PS3.6 element registry generator

- **The element registry is sourced from the normative PS3.6 DocBook, not from a mirror alone.**
  `vendor/nema/part06/` pins `part06.xml` (**PS3.6 2026c**) by SHA-256, and
  `scripts/generate-dictionary.ts` overlays it **per field** on the Innolitics base: PS3.6 wins on
  name / keyword / VR / VM / retired for any tag it publishes, PS3.6-only tags are added, mirror-only
  tags are **kept** (PS3.6 retires, it does not delete, so an absence is more likely a parse gap here
  than a withdrawal there). Registry: 5,309 tags, 5,214 keywords. Scoped to Tables 6-1/7-1/8-1/9-1;
  **the UID registry is overlaid too now, from Annex A** (see the next section; the sentence that sat
  here saying UIDs are deliberately NOT overlaid is CORRECTED, not softened), and PS3.15 Annex E is a
  different part and generator.
  The pin is a **precondition**: the generator re-hashes the file and refuses to run on a mismatch,
  reads the edition from the document's own `<subtitle>`, and fails loudly on a row that is not six
  cells, a malformed tag, a non-identifier keyword, an unknown VR token, or under 5,000 rows.
  Two DocBook traps, both covered by tests: the keyword column carries 13,470 **ZERO WIDTH SPACE**
  hints (one left in yields a keyword that looks right and never matches), and the sixth column
  carries `DICOS`/`DICONDE` markers next to `RET (edition)` (reading it as a boolean would retire 391
  live tags). **There is no staleness clock and must not be one** - a date gate fires the day it is
  written, demands an action nobody can take on demand, and reds unrelated PRs. "Has NEMA moved" is
  one content-comparing command in `vendor/nema/README.md`; CI gates byte-identical regen, offline.

## The PS3.6 UID registry overlay

- **The UID registry is overlaid from PS3.6 Annex A, and the two deliberate deviations are PRESERVED
  BY CONSTRUCTION rather than protected by staying off the overlay.** The old arrangement was
  `sops.json` plus a 560-line hand-typed table inside `scripts/generate-dictionary.ts`, kept off the
  overlay on the argument that a normative overlay would undo the short forms and the structured
  `retired` boolean. **That argument is true of a NAIVE overlay, and it is what this one is built to
  avoid.** Both deviations are now derived from the normative text and asserted, and the hand table
  is deleted rather than layered over.
- **Annex A is TWO tables with DIFFERENT SHAPES, and reading the second with the first's column
  contract takes its "Normative Reference" cell as a UID Type.** Table A-1 "UID Values" has five
  columns and column 4 names the type; Table A-2 "Well-known Frames of Reference" has four and the
  TABLE is the type. **Reading A-1 alone reported seven UIDs as dropped by the normative source.
  They had not been dropped: they are in A-2.** That is the mirror-only rule earning its keep in the
  exact direction it was written for, and it is why the rule says an absence is more likely a parse
  gap here than a withdrawal there. Measured against both tables the mirror-only set is **empty**,
  and its size prints every run.
- **Retirement stays a boolean; the `" (Retired)"` suffix is stripped into the field, and a name that
  still spells it after the strip throws.** **🔴 BUT THE SUFFIX IS AN OBSERVATION OF TABLE A-1, NOT
  A RULE STATED FOR UIDs, AND PS3.6 PUBLISHES THREE RETIREMENT SIGNALS, NOT ONE AND NOT TWO.**
  **🛑 THIS PARAGRAPH WAS REFUTED TWICE - FIRST FOR SAYING ONE, THEN FOR SAYING TWO - AND THE
  SECOND REFUSAL IS THE INSTRUCTIVE ONE: the "two" version reached its answer by grepping the
  pinned bytes for ONE phrase chosen in advance (`For retired UIDs`), finding one hit, and
  reporting a completed survey.** That phrase sits in Annex A's own intro, so the grep never
  reached the clause that governs. **That is the first-match reading `CLAUDE.md` forbids, applied
  to a search instead of to a section, and it is why the rule says collect the candidates and read
  them WHOLE.** The governing clause is **PS3.6 2026c section 5, "Conventions"** (`chapter_5`),
  **one paragraph of FOUR sentences**:
  _"'RET' is used to indicate that the corresponding Data Element, SOP Class, or Transfer Syntax
  has been retired. Retired items are shown italicized. For retired items, the edition of the
  Standard in parentheses is the edition in which the item last appeared before it was retired.
  When the name of a retired Data Element has been reused, the retired element has the qualifier
  '(Retired)' added ..."_ **🛑 QUOTE ALL FOUR - a first wording of this very paragraph quoted three
  and dropped the edition sentence, which is the partial read it exists to warn about, and a third
  refuter pass caught it here.** Read whole, **the ITALIC and the PARENTHESISED EDITION are the
  markings, and sentence 1 names Data Elements, SOP Classes and Transfer Syntaxes, so both reach
  UIDs; the `(Retired)` qualifier sentence is scoped to a REUSED DATA ELEMENT NAME and does not
  reach UIDs at all.** Annex A's intro **RESTATES** the third narrowed to UIDs, also one hit: _"For
  retired UIDs, ..."_ - the fifth **Part** cell. **It restates; it does not add. Saying "adds" was
  corrected.** The generator still derives `retired` from
  the suffix alone, so italic and Part are **corroborations in the test**, never the source; the
  Part column especially, because it is the element registry's own trap one table over, where
  reading the sixth column as a boolean retired 391 live tags on `DICOS`/`DICONDE` markers.
  **All three agree on every Table A-1 row of this edition (75 / 75 / 75, symmetric difference
  empty)**, measured; A-2 has no Part column, italicizes nothing and carries no suffix, so the
  check is scoped to A-1. An edition that retires by italic or column alone now reds instead of
  shipping `retired: false`.
- **The four toolkit short forms are DERIVED, never typed.** PS3.6 gives four Transfer Syntaxes a
  trailing `": Default Transfer Syntax for ..."` clause; those four names are cut at their first
  `": "`. A hand-written short form is exactly what rots silently when an edition rewords a name, and
  **this package has already shipped 174 wrong UID names once** behind a hand-written naming rule. If
  a listed UID stops carrying the clause the generator throws rather than keeping a stale string.
  **Measured on 2026c those four are EXACTLY the Annex A names carrying such a clause**, so the
  deviation is the complete set rather than a subset somebody chose.
  `test/dictionary/uids-normative.test.ts` pins that as an equality, and it replaced a weaker first
  draft that assumed other names carry the clause and would stay whole. None do.
- **TWO ROWS ARE EXCLUDED AND IT IS A DIRECTION-OF-FAILURE CALL, NOT AN OVERSIGHT.**
  `1.2.840.10008.5.1.4.1.1.12.77` and `1.2.840.10008.5.1.4.1.1.40` carry the retirement marker as
  their WHOLE UID Name; PS3.6 withdrew the name with the class. An entry whose `name` is `""` is a
  **successful** lookup, so a caller's `uid(x)?.name ?? "<unknown>"` prints nothing instead of
  `<unknown>`. Inventing a name from another toolkit is not available either: this generator makes no
  correction it cannot derive from the pinned bytes. The exclusion is counted and printed every run.
- **The registry went 268 to 494 and ALL 268 PRIOR ENTRIES ARE BYTE IDENTICAL.** Quote that pair
  together or neither: the overlay's whole safety argument is that it moved no shipped name, type or
  retirement flag and only added coverage. Six Transfer Syntaxes the current edition defines
  (`1.2.840.10008.1.2.4.201` through `205`, and `1.2.840.10008.1.2.8.1`) previously resolved to
  `undefined`. **Nothing was ever mis-read**: dispatch is by UID value, never by name.
- **Tables A-3 and A-4 (Context Group / Template UID Values) are deliberately NOT read.** Out of
  scope, stated rather than overlooked.
- **The test does NOT call the generator.** It re-parses the pinned DocBook from scratch and grades
  what the package EXPORTS. A test that re-runs the generator proves the generator agrees with itself
  and would keep passing through the change that broke it. **Red on the parent `3617034` at 8 of 20**
  (8 of 19 before the Part-column corroboration case, which grades the DocBook and not the registry
  and so passes on either tree).
- **A CONTROL OVER AN EMPTY POPULATION IS NOT A CONTROL.** The "leaves every other shipped name
  whole" case claimed it covered names carrying "a colon with no space"; that population has **zero**
  members across A-1 and A-2, and the 73-member one is the dash clause. Corrected to name only the
  population that exists. **And its red on the parent is a COVERAGE failure** (56 of those 73 were
  absent from the parent registry), **not evidence that a name was ever cut wrongly** - it is a
  forward-looking guard against the cut spreading, and must not be quoted as more.
- **RESIDUAL, PRE-EXISTING, DISCLOSED HERE BECAUSE A REFUTER PASS FOUND IT: `Dictionary.uid()`
  RETURNS PROTOTYPE MEMBERS.** `src/dictionary/index.ts` indexes a plain object with no own-property
  guard, so `Dictionary.uid("toString")?.name` is `"toString"` and `uid("constructor")?.name` is
  `"Object"`. Byte-identical on `3617034`, reachable from a file's `(0002,0010)` through
  `renderTransferSyntax`; `uid("__proto__")` resolves too. Not a mis-read of any real UID and not
  PHI: the echoed strings are a fixed set of JS builtin names, and the only path they reach is the
  `UNSUPPORTED_TRANSFER_SYNTAX` **rejection**. **Deliberately NOT taken here:** the fix changes a
  public lookup's answer, so it is its own slice with its own changeset, not a side effect of an
  overlay. `lookup`/`byKeyword` return `undefined` on the same input, but only by accident of double
  indirection, so do not read them as already guarded.
  **AND IT FALSIFIES A SENTENCE IN SHIPPED SOURCE, WHICH IS THE HALF WORTH CARRYING:**
  `src/parser/fatals.ts` says the Tier-3 transfer-syntax token comes from "a closed set the parser
  controls". With `(0002,0010)` set to `toString` the message reads `Transfer Syntax toString` and
  `err.snippet` carries it. `PRE-EXISTING`; correct the claim together with the guard.
- **STILL NO STALENESS CLOCK, and there must not be one.** That rule did not change here.

## The changelog generator, and why the Unreleased heading may not come back

- **`.changeset/config.json` names a generator now, so DO NOT HAND-EDIT `CHANGELOG.md`.** It set
  `"changelog": false` for this package's whole published history, so no release ever wrote a version
  heading and the file was maintained by hand under one `[Unreleased]` heading that nothing rolled
  over: **ten published versions shipped a tarball calling already-released work unreleased.** The
  founder decision on this class is **fix the flag, not the files**. A changeset summary IS the
  changelog entry.
- **NEVER REINTRODUCE AN `[Unreleased]` HEADING.** With generation ON it is worse than before: the
  release prepends its section ABOVE it, so released content sits under "Unreleased" permanently, in
  the tarball.
- **Nothing but the H1 may sit above the first heading.** Changesets prepends by replacing the FIRST
  newline, so exactly one line can sit above generated output. The rule is deliberately NOT "the
  archive heading comes second": a release puts its own version heading there, and that assertion
  would WEDGE the first Version PR this configuration ever opens.
- **`## 0.0.1` IS A SUBSTRING OF `## 0.0.10`.** Compare version headings as WHOLE LINES. A substring
  check passes on the first release and reds on the second, inside a Version PR with the changeset
  already consumed, and `prepublishOnly` runs the suite under `changeset publish`.
- **NEVER OPEN A CHANGESET SUMMARY LINE AT COLUMN 0 WITH AN ATX HEADING.** `getReleaseLine` indents
  continuation lines by two spaces, which is exactly the `- ` bullet's content column, so it becomes
  a permanent nested heading in the published release section. Write the divider as an inline code
  span or as plain prose. **In every sibling this rule is a doc comment and nothing else; here it is
  MECHANICAL**, because the region rule below reads a heading indented up to three spaces as the
  heading it renders as. A summary that does it reds in the Version PR rather than in a tarball.
  The case runs one through the real generator rather than describing it.
- **🔴 THE PRETTIER PASS STAYS ON HERE (no `"prettier"` key), DERIVED FOR THIS REPO AND NEVER
  RESYNCED FROM A SIBLING.** This value has gone four different ways across seven repos and it is
  wrong in BOTH directions. The discriminator is the repo's own markdown-formatting scope: `dicom`
  HAS a `.prettierignore` but it does not cover markdown, and `format:check` globs
  `"*.{json,md,yml,yaml}"`, so `CHANGELOG.md` is inside the formatting gate. **Asked of Prettier
  itself via `getFileInfo`, not by pattern-matching the ignore file.** A sibling whose
  `.prettierignore` lists `*.md` needs it OFF: leaving it ON there rewrote about 1,240 lines of
  already-published text and ate the spaces around a backticked literal inside a bold span, in a
  shipped tarball.
- **AND THE ARGUMENT FOR ON IS STRONGER HERE THAN IN `deid`, `transform` or `synth`.** Their
  `version` chain ends with a `prettier --write` naming `CHANGELOG.md`, a second net that repairs the
  document, so ON is merely free there. **This repo's trailing pass names `package.json` and
  `src/version.ts` and nothing else**, so with the pass off the Version PR really does open red on a
  file no human touched. A test pins the ABSENCE of that second net, so adding `CHANGELOG.md` to the
  list reds and forces the argument to be re-read rather than assumed.
- **The archived history is frozen against a DIGEST, and re-baselining it to get green is the wrong
  move.** Every other case compares an archive a release produced against the archive in the working
  tree, which is exactly the comparison a hand-edit cancels out of. A red digest is either a hand-edit
  that should have been a changeset, or a formatter reflowing already-published text.
- **🔴 THE REGION ABOVE THE DIVIDER IS CHECKED HERE, WHICH `deid` MEASURED AS OPEN AND LEFT OPEN.**
  Its frozen digest covers below the divider only, so a hand-written `## 0.0.99` block inserted
  between the H1 and the divider passed every case there, which would ship a tarball announcing a
  release that never happened. Here the region above the divider may carry only headings a release
  generates (`## <version>` and `### <Major|Minor|Patch> Changes`), the version headings must run
  newest first, and the topmost must equal `package.json`'s version. A fabricated `## 0.0.99` fails
  whichever way it is placed. **NAMED FOR WHAT IT CHECKS, NOT AS A UNIVERSAL: these are shape and
  ordering rules, not provenance.** A fabricated section carrying a version LOWER than every real
  one, in correct descending order immediately above the divider, still passes. Closing that needs a
  source of truth about which versions really released, and git tags are one `push --delete` from
  making a released version look fabricated, which is the wrong direction to fail in.
- **🔴 AND A `/^#{1,6} /` HEADING FILTER IS THE WRONG TOOL FOR THAT RULE - IT IS BYPASSED BY ONE
  LEADING SPACE AND BY A SETEXT UNDERLINE, BOTH REPRODUCED HERE ON THIS DOCUMENT.** The first draft
  of the region rule found headings that way, which is correct for asking what the generator WROTE
  and wrong for asking what could have been SMUGGLED IN: CommonMark allows an ATX heading up to
  three leading spaces, and a setext heading carries no `#` at all. So ` ## 0.0.99` and a `0.0.99`
  over a row of dashes each passed every case in the group while rendering as an `<h2>` announcing
  a release that never happened - the same hole the sibling had, one layer down. `renderedHeadings`
  reads both spellings; `headings` stays naive on purpose and is used only for the other question.
  **Three leading spaces spans the `- ` bullet's two-space content column**, which is why the
  column-0-ATX rule above is mechanical here. **Still named for what it checks:** a setext underline
  INSIDE a list item is not read, because the paragraph above it is the bullet's own text and
  treating that as a heading would refuse ordinary release output.
- **A release that publishes with an UNCHANGED changelog is a swallowed write failure, not a flag
  that reverted.** Changesets wraps the changelog write in a try/catch that only `console.warn`s; a
  tree whose declared Prettier config cannot be resolved bumps the version, consumes the changeset,
  and writes nothing. Do not diagnose it as the flag.
- **The release BODY is rendered by `release-notes.mjs` in `cosyte/.github`, which this repo does not
  carry, so nothing here exercises it.** `DICOM` IS a registered prefix there, which means an item id
  in the prose is stripped MID-CLAUSE and ships a broken sentence with both `prepare` and `assert` at
  exit 0. The shipping changeset was RENDERED through the real `prepare` and read; it carries no
  identifier at all, which dodges the defect rather than surviving it.
- `test/scripts/changelog-generation.test.ts` pins all of the above against the real
- **🔴 A CONTROL SPLICED INTO THE LIVE `CHANGELOG.md` IS TRAP 2 WEARING A FIXTURE, AND IT WEDGED THE
  RELEASE. A refuter pass caught it; it was then REPRODUCED by running the real release.** The first
  draft of the region group built every fabricated-section fixture by splicing at
  `lines.indexOf(ARCHIVE_HEADING)` in the committed document, and asserted the `package.json says`
  violation. That is only the violation you get while the generated region is **empty**. Run the
  real `changeset version` once and a real `## 0.0.13` sits above the fabricated block, so the rule
  reports the **ordering** violation instead: measured, **4 of 24 cases red on the released
  document**, and the same suite runs on the Version PR (`ci.yml` on `pull_request`) and again under
  `changeset publish` (`prepublishOnly`). It would have wedged the release AND the publish - the
  exact failure this file's own header warns about one level up, arriving as a fixture defect rather
  than as an assertion. **A fixture pinned to "what the committed file looks like today" is a
  staleness clock in a different hat**: no date in it, fires on a known future event, reds a PR
  nobody edited. **The case named "still passes ... which is today" was DELETED, not re-baselined.**
  Every control now builds its own document (`documentWith`) at versions this package will never be
  at, and the one case that must read the live file runs the real release **from `package.json`'s
  version rather than a literal**. Proven by replaying two consecutive real releases: **25 of 25
  green at `0.0.13` and again at `0.0.14`**, where the pre-fix file was 4 red.
- **The heading guard SKIPS FENCED CODE, and that is a wedge guard, not a leak guard.** A changeset
  summary may carry a fence, `getReleaseLine` indents it into the region, and a shell comment inside
  one opens with `#`. Reading that as a heading would red a Version PR on legitimate content. **The
  rule a changeset must satisfy here is wider than the siblings': no markdown heading in ANY
  spelling, which includes a bare `---` under a line of prose, because that is a setext heading and
  not a thematic break.** Fenced code is exempt.
- **🔴 AND THE CLOSING RULE IS COMMONMARK'S, BECAUSE A LOOSER ONE WENT WRONG IN BOTH DIRECTIONS - A
  REFUTER PASS REPRODUCED ALL FOUR SHAPES ON THE FIRST FENCE-SKIPPING DRAFT.** Closing on any
  fence-looking prefix let ` ```js ` "close" a block CommonMark leaves open, so the `#` lines after
  it became headings: a Version PR wedge on legitimate content. And a fence that was never validly
  closed swallowed **the rest of the region**, so a column-0 `## 0.0.99` after one passed every case
  - a smuggling hole opened by the fix for the wedge, in the guard written to close smuggling.
    A close must now use the **same character, be at least as long, and carry no info string**, and
    **an unterminated fence is REFUSED rather than skipped**, which answers all four at once.
    **This is a fence heuristic, NOT a CommonMark block model** - it knows nothing about the list item
    containing a fence, so it cannot see that one opened inside a bullet ends at the first
    non-indented line.
- **🛑 AND "REFUSING THE UNTERMINATED FENCE STANDS IN FOR THE LIST-ITEM CASE" IS FALSE. THAT
  SENTENCE WAS WRITTEN, THEN REFUTED AND DELETED - DO NOT WRITE IT AGAIN.** A fence opened inside a
  bullet, a column-0 `## 0.0.99` after it (which ends the list AND the fence in CommonMark), and any
  later valid close leaves `unclosedFence` FALSE, so the fabricated heading is invisible and the
  document passes. Reproduced against a real CommonMark implementation. A **four-space-indented ATX
  inside a bullet** renders as an `<h2>` and is missed the same way. **Both are `PRE-EXISTING`
  residuals of the guard, not of the fence rule, and neither is closed.**
- **🔴 SO THE GUARD IS THE SECOND NET, NOT THE NET. `format:check` IS THE NET.** Every shape above
  is non-Prettier-canonical and `CHANGELOG.md` is inside this repo's formatting gate, so
  `format:check` reds on all of them first. **Never quote the region rule without that sentence** -
  and note it is the same `.prettierignore` fact that decides the `"prettier"` key, so a repo that
  turns markdown formatting off loses this net silently.
- **RESIDUAL, NAMED NOT CLOSED: raw HTML.** A literal `<h2>0.0.99</h2>` above the divider renders as
  that heading and is invisible to `renderedHeadings`. Not reached for, because the guard is
  deliberately a markdown-shape rule rather than an HTML parser.
- `test/scripts/changelog-generation.test.ts` pins all of the above against the real
  `changeset version` in throwaway git trees. **Red on the parent `3617034` at 12 of 26.** None of
  the 14 green there is vacuous, but they are green for two different reasons and the split is
  **8 / 6, measured** - an earlier wording said "most / the rest" and had it backwards. **6** grade
  the RULE against a document the case synthesizes, so they mean the same thing on either tree.
  **8** were already true on the parent: `CHANGELOG.md` is in `files`, the `version` script runs
  `changeset version`, **`has no [Unreleased] link definition left behind`** (the parent never had
  one - this reads the LIVE document and was missing from the first enumeration), the four Prettier
  cases, and the generator-off control. Only the second group would be worth deleting if it grew. (The figure read
  13 of 22, then 15 of 24, then 12 of 25, then this; each is pinned to its own sha AND to its own
  version of the file, and only the last is current.)

## The PS3.15 Annex E action table generator

- **The Annex E action table is sourced from the normative PS3.15 DocBook, not from a mirror alone.**
  `vendor/nema/part15/` pins `part15.xml` (**PS3.15 2026c**) by SHA-256, and
  `scripts/generate-annex-e.ts` overlays Table E.1-1 **per field** on the Innolitics base, the same
  authority rule the dictionary uses: PS3.15 wins on attribute name / Basic Profile code / the
  metadata-affecting option columns for any tag it publishes, PS3.15-only tags are added, mirror-only
  tags are **kept**.
  Table: 652 entries, up from 617. The 35 additions were **not cosmetic**: the mirror snapshot was
  2024b-era, and **32 of the 35 missing tags are marked `X` (remove)** by the current standard (the
  other three are `(0040,B020)` `X/D`, `(0070,0006)` `D`, `(300A,0054)` `U`), among them
  `(0010,0011)`-`(0010,0016)` (the preferred-name and pronoun block, including `(0010,0012)` a
  patient's **preferred name**), `(0010,0041)`-`(0010,0047)` (gender identity, sex parameters for
  clinical use), and `(0010,2161)`/`(0010,2162)`. Because `annexE()` returned `undefined` for a tag it
  did not carry and `deidentify()` read `undefined` as "not listed, keep", **every one of them
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
  deletes" assumption stays observable.
- **An `annexE()` miss is no longer "keep" on its own (S0367-dicom-15), and that NARROWS the lag
  leak above without closing it.** `deidentify()` keeps a Table E.1-1-unlisted non-private element
  only when the pinned PS3.6 2026d registry carries its tag - a literal row, or a masked row with the
  `50xx`/`60xx` groups bounded by PS3.5 §7.6 through `src/dictionary/repeating-groups.ts` (the
  de-identify bound, never the parser's `matchRepeatingGroup`) and every other mask read as printed
  (`src/dictionary/registered.ts`). One with **no registry row** is REMOVED at every depth and
  whatever its VR (`UN`, a VR outside the 34, a whole `SQ` whose items are then never walked), ahead
  of the `SQ`, undefined-VR and keep-or-empty handling, because nothing separates a later edition's
  attribute from an invented one and PS3.15 2026d's notes to Table E.1-1 name "new Standard
  Attributes" as a leak path. It is recorded by **byte offset and never by tag or VR** on
  `report.unregisteredElementRemovals` (capped, own budget) beside the uncapped
  `report.unregisteredElementRemovalCount`, with `DICOM_DEIDENT_UNREGISTERED_ELEMENT_REMOVED` once per
  run from a position-only factory: "no registry row" is exactly what four bytes of a value look
  like, so the tag may be document content. Group lengths `(gggg,0000)`, group `0002` and group `0004`
  keep their handling, and the embedded-attribute scanner is **not** widened (that over-redaction is
  `DICOM-DEIDENT-OVER-REDACTION`'s call). **What it does not close:** a tag PS3.6 registers whose
  Table E.1-1 row the pinned PS3.15 lacks is still kept verbatim, which is why the two pins still
  advance together. **What it costs:** a conformant attribute from an edition newer than the pin is
  removed as well, with no caller switch. **What it moved:** the fabricated `(4854,4F53)` in
  `test/integration/deident-undefined-vr.test.ts` and the fabricated `(5348,4E4F)` Sequence of the
  `contextPath` block in `test/integration/phi-diagnostic-surface.test.ts` are both unregistered, so
  both are removed rather than emptied or descended; the undefined-VR rule keeps its registered-tag
  population, and `contextPath` is unchanged on every Sequence a run does descend. No registered tag's
  four wire bytes are all printable ASCII - measured over every literal row, and every masked row
  fixes a byte outside that range - which is why that fixture cannot simply be re-spelled onto a
  descended shape.
- **The E.3.6 collapse is CLOSED, and the earlier "splitting the option is a public-surface change
  deliberately not made" is RETRACTED rather than reworded.** PS3.15 §E.3.6 is two mutually exclusive
  Options and Table E.1-1 gives them separate columns; the generator read index 11
  (`Rtn. Long. Modif. Dates Opt.`) only to count its divergence from index 10 and then discarded it,
  so the **more protective** branch was unreachable and `(0028,0303)` could never carry its third
  Value. Both columns are emitted per attribute now, under `RetainLongitudinalTemporal` (full dates)
  and `RetainLongitudinalTemporalModifiedDates` (modified dates). The published name **keeps its
  full-dates meaning**, deliberately: repurposing it would silently move every existing caller's
  output and stamp `MODIFIED` on objects whose dates nobody shifted. **A column the row is silent
  about resolves to the BASIC PROFILE, never to the neighbouring temporal column and never to a
  keep** - the same silent-PHI-leak direction as an action table lagging the dictionary, and PS3.15
  2026c publishes no row that discriminates it, so it is proved against a constructed row in
  `test/dictionary/annex-e-precedence.test.ts`.
- **🛑 `MODIFIED` SAYS THE COLUMN WAS RESOLVED. IT DOES NOT SAY A DATE WAS TRANSFORMED, AND THIS
  LIBRARY TRANSFORMS NONE.** §E.3.6 also requires the dates themselves to be modified and the manner
  described in a **Conformance Statement**, and both are permanently the caller's: PS3.2 Annex N
  scopes a Conformance Statement to a named product and version, which a library is not. So an object
  a caller stamped `MODIFIED` without shifting anything is a caller defect nothing here can detect,
  and the answer is a **disclosure, not a guard**: `DICOM_DEIDENT_DATES_NOT_TRANSFORMED`, once per
  run, on `report.warnings` and **never on `Dataset.warnings`** (a Tier-2 code for a conformant file
  throws for a `{ strict: true }` caller on exactly that file). Nothing in the package claims PS3.15
  Annex E conformance for the Modified Dates Option; §E.1.1 makes that claim all-or-nothing.
- **Do not write the divergence COUNT into prose here or anywhere else.** How far the two E.3.6
  columns disagree is a fact about the **vendored edition**, it moves when the pin moves, and the
  generator prints it on every run. The differential test derives the differing set from the
  generated table at run time for the same reason. An earlier version of this paragraph carried the
  number and the JSDoc carried it too; both are gone.

## Repeating-group masks on the de-identify path

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

## The vendored PS3.5 repeating-group bound

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

## DICOM-ANNEX-E-TEST-RACE

- **🛑 A TEST THAT MUST DEFEAT A PRECONDITION RELOCATES THE TREE. IT NEVER SOFTENS THE PRECONDITION,
  AND IT NEVER MUTATES `vendor/` IN PLACE.** Both generator suites prove their pins by mutation:
  they repoint `vendor/nema/<part>/SHA.txt` at a mutant document, and one of them overwrites the
  bytes **at** the pinned path, because corrupting those bytes is the only way to reach the content
  re-hash at all. Vitest runs test files in parallel, so for as long as a mutation was live every
  other worker saw it. `test/docs/spec-citations.test.ts` re-hashes PS3.5, PS3.6 and PS3.15 at
  **module load**, which made it a fresh concurrent reader of **two** of the parts those suites
  mutate (`part05` and `part15`; it does not read `part05-2004`, and nothing mutates `part06`), and a
  reader that throws at module load takes its whole file down with it rather than one case. The
  remedy is
  `test/helpers/generator-sandbox.ts`: `scripts/`, `src/` and `vendor/` are copied into a
  `mkdtemp` directory and the generator is run from **that** tree, so there is nothing for a
  concurrent reader to observe. **Neither generator took a new input**, which is what makes this
  affordable: both resolve their own root from `import.meta.url`, so relocating the script relocates
  the document it reads and the artifact it writes, and the byte-identical regen gate keeps depending
  on a script with no vendor-root and no output-path argument. `runRepoScript` grew a `root` option,
  which is a TEST helper's input, not a script's.
- **THE WINDOW WAS MEASURED, NOT ARGUED.** A probe running the citation gate's `readPinned` in a
  loop over **all four** vendored part directories, against **10 runs** of the two generator suites,
  logged **1,542 read cycles** and **945 anomalous observations** in four distinct classes:
  | What the probe saw | part05 | part05-2004 | part15 |
  | --- | --- | --- | --- |
  | `SHA.txt` holding `RESERVED` rather than a hash | 43 | 35 | 108 |
  | `SHA.txt` naming a directory not on disk | 31 | 31 | 120 |
  | the file at the pinned path not hashing to the pin | 36 | 43 | 91 |
  | **a pin that VERIFIED against a document that is not the committed one** | 106 | 94 | 207 |
  Plus a **fifth** class, **8** observations of `src/dictionary/generated/` transiently diverging
  (`annex-e.ts` 6, `repeating-groups.ts` 2), which is the flake `generate-repeating-groups.test.ts`
  had disclosed and declined to fix, and which reaches the WHOLE suite rather than the two generator
  files, because the shipped library imports both artifacts. **945 + 8 = 953**, and the four-class
  figure and the grand total are not interchangeable: an earlier draft wrote "953 in four classes",
  which is neither.
  **🛑 BE EXACT ABOUT WHICH PART A LIVE READER WAS ACTUALLY EXPOSED TO. THE PROBE'S COLUMNS ARE NOT
  THE GATE'S.** The probe reads four part directories; `VENDORED_PARTS` in
  `test/docs/spec-citations.test.ts` names the **three** that gate reads, `part05`, `part06` and
  `part15`. So the overlap between what that gate reads and what these two suites mutate is
  **`part05` + `part15` only, 742 of the 945**. The other **203** are `part05-2004`, which is mutated
  by the repeating-groups suite and opened by nothing else in the repository except the generator
  that mutates it: real evidence of an inconsistent tree, but no live reader was exposed to it.
  `part06` is the mirror error, re-hashed at module load by the gate and mutated by nobody. **"A
  concurrent reader of exactly those files" was wrong in both directions and is not a phrasing to
  restore.** The remedy does not depend on which of the two figures you take, because it removes the
  writes rather than the readers.
- **🛑 THE FOURTH ROW IS THE ONE TO UNDERSTAND, AND IT IS WHY "RELAX THE PIN" WAS NEVER ON THE
  TABLE.** A mutant is written into a directory **named by its own hash**, so re-hashing it
  **succeeds**. An integrity check cannot see that at all: the reader resolves clauses against a
  mutated standard and reports green. **A SHA pin rewritten mid-run means the thing being corrupted
  is the integrity check itself**, so a reader taught to tolerate a writer would have traded the
  guarantee for a green board. That generalises to anything gated on a vendored normative source.
- **THE FIX IS PROVED BY RE-RUNNING THE REPRODUCTION, NOT BY ONE GREEN PASS.** A flake that
  reproduces once in ten is not answered by a change that passes once. Same probe, same 10 runs
  after the change: **1,437 read cycles, ZERO observations of any class.** End to end at the vitest
  level, looping the reader file against 10 runs of the two mutating suites: **10 of 31 reader runs
  FAILED before, 0 of 30 after**, the failure reading `Error: vendor/nema/part15/SHA.txt does not
hold a sha256` thrown at module load. **Both controls were run, because a clean after-figure is
  also what a dead probe prints**: the probe alone for 20 s logged 419 cycles and zero anomalies
  (negative), and a 1-second hand-injected `RESERVED` in `part15/SHA.txt` was caught **20 times in
  247 cycles** (positive). Full suite 1,195 tests, 0 failed, before and after.
- **THE PER-TEST BUDGETS WERE RE-CHECKED UNDER LOAD AND NOTHING NEEDED MOVING.** `#85` gave the
  changelog Prettier-canonical assertion its own budget rather than raising the global, so the
  question was whether a sibling was sitting just under its own ceiling for the same reason.
  **🛑 STATE IT AS THE FRACTION OF THE CEILING CONSUMED, WITH BOTH NUMBERS, OR IT IS NOT A READING.**
  An earlier draft said "the worst headroom is about a quarter of the ceiling" and then "spends about
  a fifth of it" of the next case, which are opposite senses of one measure: on the first reading
  only a quarter is LEFT, which by `#85`'s own precedent would argue the budget DOES need moving.
  The load, so the figures are re-derivable: **20 busy-loop processes on a 56-core box**, which took
  the suite's wall clock from **35.9 s to 104.4 s**. Under that, worst consumed:
  `attw-gate`'s slowest case **13.8 s of its 60 s `SPAWN_TIMEOUT` (23%)**, the `@example` coverage
  case **6.7 s of 30 s (22%)**, and the slowest assertion still on the **10 s default 2.1 s (21%)**.
  Every heavy `changelog-generation` case already carries its own `{ timeout: 90_000 }` or
  `{ timeout: 150_000 }`, and `docs-content`'s 180 s is a `beforeAll`, not a per-test budget.
  **No budget was changed and no numeral was added to `vitest.config.ts`**, which refuses to
  enumerate these on purpose: the
  measurement is the answer, and re-measuring under the load in front of you is the rule, not reading
  a figure recorded here.
- **NOT FIXED, AND NOT THE SAME SHAPE.** `test/scripts/phi-scan.test.ts` appends to the tracked
  `phi-scan-overrides.md` and restores it in a `finally`. That is the same family, but it has **no
  concurrent reader**: the only thing that reads that file is `scripts/phi-scan.ts`, invoked from
  that suite's own cases, which vitest runs sequentially within a file, and `verify.sh` runs its
  steps one at a time rather than beside the test run. The `.dcm` fixtures the same suite writes into
  `test/fixtures/phi-scan/` are gitignored. `PRE-EXISTING`, unmeasured as a flake, and deliberately
  left where it is.

## PHI-WARNING-MESSAGE-LEAK

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
  corrected; the `DeidentifyReport` was described here as value-free **apart from `uidMap`**, and
  that reading is superseded - the type now carries the list, `contextPath` included
  (`DICOM-ITEM-CROSSES-RESIDUALS`), and **the list is un-numbered so it cannot be incremented**. **The gate does not make the diagnostic surface PHI-free and must not be described
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

## DICOM-PARSE-CREATORS-SCOPE

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

## DICOM-IMPLICIT-SQ-NOT-DESCENDED

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
  **The Explicit VR unbounded-item-read residual this bullet filed is DISCLOSED rather than closed**
  by `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`, the bullet below, and the prediction it was filed with
  was wrong in an instructive way. This note said bounding `parseSequence` would convert files that
  parse today into a whole-object `INVALID_FILE_META`. That was the wrong hazard to fear. The real
  one is that **the two files a bound would have to tell apart are the same file** - proven by a
  `Buffer.equals` test - so honouring PS3.5 7.5.2 on the one it should also moves an element out of
  an item on the one it should not, and moving a **Private Creator** that way leaks PHI. Five graded
  refuter passes went into finding that. The mis-structure is still there and is now pinned as a
  residual instead of being predicted about.
  Also minor, and **corrected 2026-08-03 after a refuted draft got it wrong three ways at once**:
  `Element.byteOffset` inside a sequence item is **not** uniformly slice-relative, this is **not**
  new, and the two item forms do **not** agree. Measured identically on this branch and on
  `origin/main`: a 210-byte file, `SQ` at 172, the element inside a **defined-length** item reads
  **0** (`parseSequence` hands the inner parser an `itemSlice`, which is its own frame) and the same
  element inside an **undefined-length** item reads **192**, file-absolute, because that branch is
  handed the outer buffer. `Element.byteOffset` documents no frame-of-reference contract either way.
  **Measure it rather than describing it.**

## DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ

- **Two length fields describe the same bytes, either one can be the lie, and THE TWO FILES ARE THE
  SAME FILE** (`DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`, the Explicit VR twin `#50` filed,
  pre-existing and live on published `0.0.10`). `parseSequence` computes `endLimit` from the `SQ`'s
  declared length but bounds each **item's** value read against `buffer.length`. The Explicit VR
  strategies are the only callers that read a defined-length sequence **in place** in the caller's
  buffer - `tryParseDefinedLengthSQ` and `tryParseUnAsSQ` are each handed a slice already cut at the
  declared end - so they are the only path where an item's own length field can reach past the
  sequence. PS3.5 2026c section **7.5.2** makes the `SQ`'s Value Length the exact extent of the item
  stream ("This length shall include the total length resulting from the sequence of zero or more
  items conveyed by this Data Element"); section **7.5.1** governs the Item's own length. Both traced
  to the SHA-pinned `vendor/nema/part05/`. **Neither says what a decoder does when they disagree**,
  so no reading is derived from either.
  **The reading relocates an element:** a root `(0010,0020)` Patient ID exactly as long as the item
  over-declares vanishes from the root, appears as a per-item attribute, and `deidentify()` reports it
  with a `contextPath` naming that item. Silent, and silent under `{ strict: true }`.
  **🛑 THIS PARAGRAPH USED TO CALL THAT "a false statement" AND "a `contextPath` naming a sequence
  item it was never in", AND THAT WORDING IS DELETED BY `DICOM-ITEM-CROSSES-RESIDUALS`** - it asserts
  which of two byte-identical files you have, and on the partner file the element genuinely **is** in
  the item. Do not put it back; see that section.
  **▶ 🛑 WHAT SHIPPED IS A WARNING AND NOTHING ELSE, AFTER FIVE REFUSED ATTEMPTS AT A BOUND, AND THE
  REASON IS ONE LINE OF MEASUREMENT: A FILE WHOSE ITEM OVER-DECLARES AND A FILE WHOSE SEQUENCE
  UNDER-DECLARES ARE BYTE-IDENTICAL.** `test/integration/explicit-sq-item-bound.test.ts` builds both
  from two contradictory `build-dicom` descriptions and asserts `Buffer.equals`; it is the
  load-bearing test in the file. **This is the third time this repo has hit the same permanent fact
  about the format** - see `DICOM-OVERDECLARE-SWALLOWS-INTO-VALUE` ("an over-declaring element and a
  well-formed one with an odd value are byte-identical; intent is not on the wire") - and the first
  time it has been pinned rather than described. **A founder re-scope, not a sixth remedy**: cumulative
  refuter passes on this lineage are **6** (ADR 0016's 2026-07-29 amendment, RESET-BUT-RECORD).
  **▶ 🛑 THE FAIL-SAFE-DIRECTION ARGUMENT IS DELETED, NOT REWORDED - THIS IS WHAT PASS 6 REFUSED, IN
  FIVE ARTIFACTS AT ONCE. DO NOT WRITE IT AGAIN.** The retracted claim was that following 7.5.1 is
  the safe half of the ambiguity, because a Private Creator swallowed **into** an item leaves the
  enclosing block unclaimed and an unclaimed block is removed. **False.** Which direction leaks is a
  property of **where the SENDER put the Private Creator**, not of which length field a reader
  follows: with the creator as genuine Item content the absorb direction leaks too
  (`DICOM-PRIVATE-CREATOR-RESERVATION-LEAK`, closed at the de-identify boundary by `#66`, never in
  the parser), and the eject direction is still open. Neither reading is safe by construction, which
  is exactly why this code reports rather than decides. The repo's own rule applied: **a disclosure
  reworded twice is deleted, not given a third wording.**
  **▶ 🩺 AND IT IS NOW THE ONLY SIGNAL ON A FILE WHOSE DE-IDENTIFICATION AUDIT IS FALSE.** `#66`
  recorded its EJECT residual as silent on every channel. On the **Explicit VR** shapes that stopped
  being true here. Re-measured on that residual's own fixture: `DICOM_ITEM_CROSSES_SEQUENCE_END` on
  both channels, a throw under `{ strict: true }`, and the leak entirely unchanged beside it
  (`removedPrivateTags: []`, the private value in the serialized output, `(0012,0062) = YES`).
  **The leak is NOT closed and the warning is NOT an all-clear** - the troubleshooting row says so in
  those words, because its first draft said "nothing is retained that would not be", which is false
  on exactly that file and was the second refusing major. The 20 Implicit VR LE cells stay silent:
  that path slices the item stream, so no over-run is recorded.
  **▶ THE FOUR THINGS THE FIVE REFUSALS ESTABLISHED, EACH STILL PINNED THOUGH THE CODE THEY GUARDED
  IS GONE. DO NOT DROP THEM WHEN SOMEBODY RE-OPENS THE BOUND.** (1) **One pass is a security
  property, not an efficiency one**: a try-then-fallback shape re-parsed nested defined-length
  sequences and cost **2^depth** - 75,475 ms for a **606-byte** file 20 levels deep, against 0.7 ms
  for one pass. That is T-02-04-03 by a new route, and `sequence.ts`'s module header now names it.
  The 20-deep cost pins stay. (2) **`NESTING_DEPTH_LIMIT` must propagate untouched** - the fallback
  shape needed an error subclass to stop a catch-all rollback turning the cap into "descend one level
  less"; there is no `catch` in this path, and the 65-level pin proves it. (3) **A warning emitted
  for a reading that is then discarded** costs a `{ strict: true }` caller the object and makes
  `onWarning` disagree with `ds.warnings`. Nothing is tried here, so there is nothing to discard.
  (4) **The enclosing Data Set is a `Map<Tag, Element>`**, so any future bound that moves an element
  can silently **replace** one - measured as a root Patient ID reading `MRN-99999` where the file says
  `MRN-11111`.
  **▶ WHERE IT FIRES, AND THE CONJUNCT THAT IS NOT DECORATION.** A defined-length `(FFFE,E000)` item,
  inside a defined-length `SQ`, with `endLimit < buffer.length` - the last one is what says the
  sequence sits inside a larger Data Set whose bytes are there to be taken. Slice-bounded callers, an
  undefined-length sequence, an undefined-length item and a sequence that ends its own buffer all stay
  silent, each pinned. New Tier-2 code `DICOM_ITEM_CROSSES_SEQUENCE_END`; `WARNING_CODES` is **29, was
  28**, which is what the locked snapshot pins. **"26 codes, was 25" was wrong and so was the
  README's `25`** - that numeral is now deleted from the README rather than corrected a third time,
  because the snapshot measures it on every run.
  **▶ 🛑 FOUR THINGS ABOUT THIS DIAGNOSTIC THAT A DRAFT GOT WRONG AND EACH IS NOW A PINNED
  MEASUREMENT, NOT A SENTENCE.**
  (1) **🩺 THE ITEM'S DECLARED LENGTH IS WITHHELD, AND THE BOUND IS THE FACTORY SIGNATURE. DO NOT PUT
  IT BACK.** It shipped as a `{n}` slot under the claim "no bytes off the wire"; both were refuted.
  The condition that raises this code is precisely "these length fields are not what they claim to
  be", so those four bytes can be document content: measured, an item header fabricated over
  `"SMITHSON"` rendered it as **1414090067**, `"SMIT"` in wire order, reversible with one
  `readUInt32LE` - and it is emitted **above** the truncation guard, so the message reaches
  `onWarning` on a file the parse then refuses. `itemCrossesSequenceEnd` takes no parameter for it,
  identical remedy and reasoning to `#64`'s `DICOM_NONZERO_RESERVED_BYTES` and `#55`'s
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`: where `renderTag` checks a shape and `renderVr` a
  closed set, a raw length has neither, so the bound has to be the signature.
  **A PHI test whose payload carries no name is vacuous BY FIXTURE** (`#55`'s was).
  (2) **"At most one warning per sequence" is TRUE and is NOT an amplification bound.** A file may
  carry as many sequences as it can encode. `ds.warnings` is uncapped, `#48`'s pre-existing
  package-wide posture; pinned by a test that asserts the growth rather than a cap.
  (3) **`profiles.strict` does NOT escalate it.** The `{ strict: true }` option does, through the
  `makeEmitter` chokepoint. Adding a code to a shipped preset moves every `profiles.strict`
  consumer's parse and is its own measured change. Pinned.
  (4) **The warning's `position.byteOffset` is frame-dependent** - file-absolute for a root-level
  sequence, slice-relative inside an enclosing item, exactly as `Element.byteOffset` is, and neither
  documents a frame-of-reference contract. Pinned by measuring both frames.
  **▶ THE MEASUREMENT, RE-DERIVED AGAINST `2f0abd9` AFTER THE REBASE ONTO `#66`.** 83,037 grid cells:
  **0 cells whose READING differs**, **616** newly emitting the code and **0** losing it, **576** new
  strict fatals (all 576 carry the code, so none is collateral), 0 new lenient fatals, 0 values lost
  or gained, 0 wrong root `(0010,0020)`, 0 PHI regressions, 0 reports losing an attribute, 0 Implicit
  VR LE cells changed, **every `priv|` column from `#66` unchanged**, leaking cells unmoved at 11.
  The other **16,396** of the 17,012 differing cells are **strict-fatal on both trees** and differ
  only in the class of the throw. **Quote the reading count and the strict count together or
  neither** - 576 files that parsed under `{ strict: true }` now do not, and that is the whole price.
  **🛑 THE PRE-REBASE FIGURES (76,611 cells, 442 newly warning, 402 strict fatals, 15,180) ARE DEAD**
  - they were taken against `164eb39`, before `#66` added the `priv|` family. And `cells whose
READING differs` is **not** new here: `#66` added it, and a draft of this entry claimed the credit.
    **▶ WHAT IS LEFT, NAMED:** the **relocation itself** (an over-declaring item still moves the
    element that follows the sequence into it, pinned by a test; **UNDECIDABLE**, and the
    "`contextPath` names an item it was never in" half of this line is DELETED by
    `DICOM-ITEM-CROSSES-RESIDUALS`); the
    **undefined-length item with no `(FFFE,E00D)`**, which has no declared length to disagree with;
    and **11 grid cells still leaking** through the `OB`/`OW`/`US`/`UN` leaf carrier, `PRE-EXISTING`.
    **▶ `Element.byteOffset` INSIDE AN ITEM DISAGREES WITH ITSELF, ALWAYS HAS, AND A REFUTED DRAFT GOT
    THIS WRONG THREE WAYS AT ONCE.** Measured identically on this branch and on `origin/main`: a
    210-byte file, `SQ` at 172, the element inside a **defined-length** item reads **0** (the item slice
    is its own frame) and the same element inside an **undefined-length** item reads **192**,
    file-absolute, because `parseSequence` hands that branch the outer buffer. It is not new, it is not
    uniformly item-relative, and the two forms do not agree. `Element.byteOffset` documents no
    frame-of-reference contract either way. **Re-measure it rather than describing it.**

## The em-dash brand gate

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
  Several tracked text files hold a NUL byte (tests that build binary values in source, and
  `scripts/measure-sq-bound-grid.ts`), so grep classifies them binary. `src/dataset/vr/charset.ts`
  held one too, inside `/[\x00 ]+$/u`, until 2026-11-08: that regex backtracked quadratically on a
  long run of pad bytes, so the trim is now a loop over character codes. None of these files carries
  an em dash, so each scans green. If one ever gains one, grep writes `binary file matches` to
  stderr with empty stdout and the stderr capture reds the run. Adding `-I` would make that same edit
  pass in silence, so do not add it, and do not remove a NUL to quiet the gate. When the gate goes red the fix is never to
  re-encode the character: rewrite with a period, colon, comma, or parentheses. Known limits are in
  the script header and are shared across every copy, so fix them there, not here.

## The attw wrapper gate

**Superseded on 2026-11-07.** `pnpm attw` runs `cosyte-attw`, the shared gate in
`@cosyte/script-utils`, under attw's default `strict` profile with no `scripts/attw.exclude`;
`scripts/attw.mjs`, its tests and `pnpm typecheck:exports` are deleted. Before the switch it was
proved to fail closed here: with `dist/index.d.ts` and `dist/index.d.cts` removed from a real build
it exits 1 naming both. What follows is the history of the local wrapper; the shared gate's own
docblock (`attw.js` in that package) carries its current nets.

- **▶ `attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI.** `getExitCode.js` in `@arethetypeswrong/cli@0.18.4` opens with
  `if (!analysis.types) return 0` - an untyped package is a legitimate npm package, so "no types at
  all" is a description, not a problem, and the problem list is never consulted. No `--profile`,
  `--ignore-rules` or config setting reaches that early return. For a package that ships types it
  means the declarations were **not in the tarball**, which is a broken publish reported as a pass,
  and `pnpm attw` is both a shared-CI step and the last step of `prepublishOnly`. **Diagnosed in
  `@cosyte/terminology` (#28, `bf153cb`); the code was ported here, the measurements were re-taken
  here.** Measured on this package with **zero concurrency**: `rm -f dist/index.d.ts dist/index.d.cts
&& pnpm attw` and `rm -rf dist && pnpm attw` both print the sentence and exit **0**.
  **The race only supplies the condition.** `tsup` emits JS in one pass and declarations in a later
  one, so every build has a window where `dist/` holds `.mjs`/`.cjs` and no `.d.ts` - measured over
  three clean builds on an idle box at **1.06s / 1.23s / 1.43s**, wider under CPU contention. So the
  answer is **not** a lock, a lease or a build queue: the gate must be able to say its own inputs
  were missing, whatever removed them.
  `scripts/attw.mjs` carries **two nets that catch different things** - a preflight that every
  relative path `package.json` promises (`main`, `module`, `types`, `typings`, every string leaf of
  `exports`) exists and is non-empty, which catches the build window and _names the missing file_;
  and a post-check on `attw`'s untyped sentence, which catches what the preflight structurally cannot
  (declarations on disk but excluded from the tarball by `files`/`.npmignore`). **No instance of that
  second case is on record here.** **Neither net covers the rest of `files`** (`README.md`,
  `LICENSE`, `TRADEMARKS.md`, `CHANGELOG.md`) - `attw` analyses types and never looks at them.
  **The post-check reads a string, so what would hide that string is refused**, by option and not by
  value. **Eleven blinding routes were measured here** - `--quiet`, `-q`, `--format json`, `-f json`,
  `--format=json`, `-fjson`, `-qf json`, `-Pfjson`, a `.attw.json` setting `quiet` or `format`, and
  **`--config-path`**, which terminology's copy refused by inference only.
  **▶ THE PREDICATE IS NOT AN EXACT-TOKEN SET, AND THE FIRST DRAFT OF THIS FILE'S OWN SCRIPT WAS.**
  Commander lets a short option's value attach (`-fjson`) and lets shorts combine (`-qf`), so `-f` is
  not visible as a whole token. Measured on that draft: `-fjson` gave **exit 0 with the gate silent**.
  A single-dash argument is refused if any character in its cluster is `q` or `f`, which is sound
  because `-f` is `attw`'s only value-taking short. **Do not "simplify" it back to a token set.**
  Measured in both directions, because the bound is the point: `--format table-flipped` and
  `--format ascii` still print the sentence and are refused anyway (the deliberate trade against
  value-parsing them), while `--form json`, `--quiet=true` and `-f=json` each look like a route and
  are not, since commander rejects them outright. **Nothing else is refused** - `--profile node16`
  and `-P` still reach `attw`, and a forwarded extra positional does not retarget the run.
  `test/scripts/attw-gate.test.ts` pins both nets against the real binary (including the upstream
  exit-0 itself, a negative control on a well-formed package, and that a real `attw` failure still
  fails). Proved non-vacuous by putting the bare invocation back: **15 of its 22 tests red**.
  **`lint` is deliberately NOT widened to `.mjs`, measured rather than assumed:** the shared
  `@cosyte/eslint-config` rule blocks are scoped to `**/*.ts`, so a seeded unused variable and a
  missing semicolon in `scripts/attw.mjs` produce **zero** ESLint findings. Widening the glob would
  add a gate-shaped thing that gates nothing. `format:check` does cover it and is real.

---

<a id="dicom-diagnostic-locator-frame"></a>

## dicom - the locator had no frame, and the universal defending it was false (2026-08-08)

`DICOM-DIAGNOSTIC-PHI-RESIDUALS`, tenth instance, taken from `#93`'s pass-3 ranking. Written here
rather than in `documentation/agent-notes.md` because that file is **over** its 250,000-byte budget
on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.** The precedent is `#97`, `#98`,
`#99` and `#102`, which relocated the same way.

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which is not a
line. Relocation is the remedy, never deleting an existing trap to make room and never raising the
ceiling. So the rules live where a worker touching this code actually reads them: the module banner
and `FatalTokens` JSDoc in `src/parser/fatals.ts`, the `OFFSET_FRAMES` / `ParseFrame` /
`DicomParseError` JSDoc in `src/parser/errors.ts`, `ParseContext.frame` and `DicomPosition` in
`src/parser/types.ts`, the block `"PHI: a byteOffset names the frame it is counted in"` in
`test/integration/fatal-diagnostic-surface.test.ts`, and this file.

**Provenance.** Every figure below is a measurement taken in this repo. The base-tree ones were taken
on `028fe85` (`main` at the time the slice opened); the rest on the slice's own tree and are
reproducible from the tests named beside them. No spec claim is made here that is not already carried
by an existing citation in `src/parser/fatals.ts`.

---

### 1. What was open

`#93` bound the last wire-derived number out of the Tier-3 factory signatures: through `0.0.14`
`ELEMENT_LENGTH_EXCEEDS_BUFFER` and `FILE_META_GROUP_LENGTH_OVERRUNS` each rendered
`buffer.length - cursor.position`, which inside a defined-length Sequence Item is that Item's own
32-bit declared Value (Item) Length less an offset the same message publishes.

That remedy left **`err.byteOffset` as the sole locator on both changed messages**, and it is
slice-relative inside a defined-length Item. Measured on the `overDeclareInsideAnItem` fixture, whose
Item slice begins at absolute offset **202**:

| over-declaring element sits | `err.byteOffset` | absolute offset in the caller's buffer |
| --------------------------- | ---------------- | -------------------------------------- |
| first in the Item           | `0`              | `202`                                  |
| 24 bytes in                 | `24`             | `226`                                  |
| 40 bytes in                 | `40`             | `242`                                  |

Nothing on `DicomParseError` said which of the two coordinate systems the number was in. A number
alone does not say where its zero is, and the wrong reading is not an error a consumer can detect: it
is a valid index into a buffer, returning a real element, just not the one the diagnostic named.
**This is the same defect `#80` closed for `snippet` and did not close for the offset.**

The harm is measured on the `oneFileTwoFrames` fixture, which was built for `#80` and already carries
a name at the colliding root offset: a `{ strict: true }` escalation raised inside the Item reports an
item-relative `byteOffset` that, read against the file, lands inside `"MR BRAIN SMITHSON "`. A
consumer that cuts its own copy of the file at `err.byteOffset` reproduces `#80`'s defect in its own
code, and until this slice nothing on the error warned it not to.

### 2. The remedy, and why it is a slot removal rather than a filter

`DicomParseError` gains **`offsetFrame`**, a required constructor argument (not optional, for the
same reason `byteOffset` is not: an offset whose frame is optional is an offset whose frame is
usually missing). Its value is drawn from `OFFSET_FRAMES`, three literals this parser chooses:
`"input"`, `"inflated-dataset"`, `"value-slice"`. The `Error.message` suffix carries it too, so it
reads `(offset=N frame=F)`. **The message and not only the field**, because the most common thing a
consumer does with one of these is log it, and a field alone would not have reached that path.

**`ParseContext.buffer` became `ParseContext.frame: ParseFrame`, one object with two readonly
members.** Two sibling fields would have been the same defect one step removed: a frame change is one
fact, and two assignments are two chances to move the bytes and leave the label behind. Every Tier-3
factory takes the same object rather than a `Buffer`, so no factory can be handed a snippet source
without the label that belongs beside it.

**🛑 THAT IS THE OMISSION MODE AND IT IS THE ONLY ONE THE TYPE CLOSES. DO NOT WRITE THAT A
DISAGREEMENT IS "NOT EXPRESSIBLE" - A GRADED PASS BUILT ONE.**
`elementLengthExceedsBuffer({ buffer: itemSlice, name: OFFSET_FRAMES.INPUT }, 0)` type-checks, lints,
and renders a mislabelled offset beside a faithful snippet of the Item. The pair did not vanish; it
moved from an argument list into an object literal at the sites that compose a frame. What the type
actually buys is that composing one is a single assignment, so no site can half-update. The honest
limit is pinned in `fatals.test.ts` rather than left to a test title: the mismatched pair is asserted
to RENDER.

**🛑 AND WRITE NO COUNT OF THOSE SITES.** The first remedy to this finding said "exactly four" in
five artifacts, and the next graded pass measured **five**: the omitted one is the ROOT composition
in `parseDicom`, which reads `"input"` - the very label a forged pair would claim. A worker sweeping
frame compositions from that census reviews four of five and reads clean, which is this lineage's
own "a detector zero can be a gap, not a clearance" arriving by way of a numeral. Derive it instead,
in two seconds and never stale:
`grep -rn "OFFSET_FRAMES\." src/parser/`.

**That derivation OVER-reports and is chosen for it.** Naming a frame is not composing one, so read
every hit rather than counting them. A narrower pattern that returned only the object literals would
be a detector with a floor, and this file's whole subject is what a floor hides. Over-reporting is
the safe direction for a census you must not miss a member of.

**The frame's NAME is published; its ORIGIN is not, deliberately.** That asymmetry is asserted, not
just stated: `"publishes the frame's NAME and never its ORIGIN"` searches every digit run of the
message for `202` and pins the clean result beside a reconstructed message that DOES publish it,
which the same search catches.

**The rationale is a trade, not an impossibility, and a graded pass was right to press it.** A frame
origin is a position, and this library publishes positions freely in the `"input"` frame and as
`Element.byteOffset` at the root; recovering a specific 32-bit declared length from one needs a
second published number, not one. So the argument is that an origin buys a consumer nothing the frame
name does not already buy, while sitting one number away from a field these messages withhold. The
item asked for the frame to be NAMED. Do not restate this as "an origin would leak the length".

### 3. 🛑 THE UNIVERSAL DEFENDING THE BOUND WAS FALSE

**No count is written here, deliberately.** A first draft said three in one sentence and four in the
heading above it and three again in the changeset, and a graded pass caught all three plus a carrier
the list had missed. The carriers are enumerated below; the list is the census.

The artifacts justified withholding a declared length with a variant of *"a fatal about a length
field that lies fires precisely when bytes inside somebody's value are being read as a header"*.
`#93` pass 3 ranked it over-stated **even for the two old fields**. It is, and the counterexample is
an ordinary one. Measured on `028fe85`, with no fabrication anywhere:

- A spec-clean object cut short by 2, 4, 6, 8 or 10 bytes raises `ELEMENT_LENGTH_EXCEEDS_BUFFER` at
  offset 182, with every declared length in the file honest. The transport lost bytes; nobody lied.
- The same object cut short inside its File Meta group raises `FILE_META_GROUP_LENGTH_OVERRUNS` at
  offset 132 with `(0002,0000)` untouched, reading back the same 28 it was written with.

**The bound is right in both readings and the universal was never what made it right.** The withheld
number is a raw 32-bit field a sender wrote either way; what makes the desynchronized reading the
sharp one is that those four bytes are then part of somebody's name. That is the corrected claim, and
it is pinned by
`"the 'fires precisely when a length field is lying' universal is FALSE, and is corrected not
repeated"` in `test/integration/fatal-diagnostic-surface.test.ts`.

**🛑 THIS IS CORRECTION NUMBER ONE. A SECOND REWORDING DELETES IT.** Checked with
`git log -S "fires precisely when"`: the phrase entered every carrier in one commit, `b7a77fe`
(`#80`), and had not been reworded since. The sweep was run **newline-folded** over every tracked
file, against eleven phrasings, because a line-based `grep` misses a claim that wraps.

Carriers corrected here, enumerated rather than counted:

- `README.md`, the `DicomParseError` section.
- `docs-content/spec-notes-tolerance.md`, "A Tier-3 fatal's `message` is bounded the same way".
- `docs-content/troubleshooting.md`, the "Keeping PHI out of logs" bullet. **A first draft of this
  list omitted it while the same commit was correcting it**, which is how a relocated census goes
  stale: the next worker re-runs the sweep from the list and misses a carrier.
- `src/parser/fatals.ts`, the `FILE_META_GROUP_LENGTH_OVERRUNS` registry comment.
- `src/parser/fatals.ts`, `fileMetaGroupLengthOverruns`'s JSDoc, which said **"raised exactly when"**
  and would have been missed by a sweep for the README's wording alone.

**Four other `fires precisely when` sentences were checked and LEFT, because they are true.**
`renderTransferSyntax`, `tokens.ts`'s charset token, and two in `warnings.ts` all describe a code
whose trigger genuinely IS a failed membership test. `sequence.ts`'s "a file whose length fields are
by definition lying" was checked too and is sound for a different reason: that emit site fires only
when two declared fields disagree, both fully present, so at least one is not describing the bytes.
**Do not sweep the vocabulary and call the class closed.**

### 4. 🛑 THE ARITY PIN DID NOT PIN WHAT IT CLAIMED

`fatals.test.ts` and `fatal-diagnostic-surface.test.ts` both asserted
`elementLengthExceedsBuffer.length === 2`, under a comment reading "a call site cannot pass what a
signature does not accept". **`Function.prototype.length` stops counting at the first defaulted or
rest parameter.** So `(frame, offset, remaining = 0)` - the exact slot the pin exists to refuse -
reports `2`, and both pins would have stayed green while the slot came back.

Replaced by `declaredParameters` in `test/helpers/declared-parameters.ts`, which reads the parameter
list off the function's own source text and compares it **whole** rather than by count, so a third
parameter is refused whatever it is named and whatever default it carries. It throws rather than
returning an empty list on a source it cannot parse, because an empty list reads as "no parameters" -
a clean result that is a gap.

It lives in a helper rather than being copied into both suites because a copied detector goes stale
on one side and reads clean there.

### 5. Every clean result here is pinned beside a positive

The lesson this lineage has paid three slices for is that **a detector zero can be a gap rather than
a clearance**. Each clean assertion in this slice is stated with the positive that proves the
detector works:

| Clean result                                                          | The positive it is pinned beside                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `declaredParameters` shows no third parameter on the two factories     | `controlWithDefault` (`length` reads 2, declared list has 3) and `controlWithRest` (1 against 2)           |
| No digit run of the message equals the frame origin `202`              | A reconstructed message that appends `"The frame begins at 202."` IS caught by the same search             |
| The factory pair travels: `offsetFrame` matches the snippet's source   | A hand-made mismatched `ParseFrame` DOES render, asserted, so the type is not mistaken for a proof         |
| `leaksIn(err.message, payload)` is empty with the frame in the message | The whole existing detector, whose own non-vacuity control is `0a8c6e3`'s template, unchanged and still red |
| The frame label is `"value-slice"` inside an Item                      | The same number read against the caller's buffer returns 16 different bytes, asserted `false` on equality  |
| A root-level fatal still reports `"input"`                             | Its snippet equals the file cut at that offset, byte for byte                                              |
| A Deflated fatal reports `"inflated-dataset"`                          | Its offset is IN RANGE of the compressed input and its snippet still does not match it                     |
| `UNSUPPORTED_TRANSFER_SYNTAX`'s snippet is NOT a cut of its frame        | A truncated-file fatal's snippet IS byte-identical to the frame cut, in the same test                      |

**The Deflated row is the one worth reading twice**, and it is NAMED rather than pointed at, because
a first draft said "that last row" and a later row was appended under it. Measured: the offset is
`26` and the compressed input is `224` bytes, so a bounds check on the offset would have read clean.
**"It does not index the input" is a statement about meaning, not about range**, which is precisely
why a label was needed and a range check is not a substitute.

### 6. What is NOT closed, stated rather than implied

- **`DicomParseWarning.position` carries no frame** beyond its `deflated` flag. Its JSDoc said byte
  offsets "are relative to the source buffer for non-deflated transfer syntaxes", which is false
  inside a defined-length Item; the claim is corrected on `DicomPosition` and the residual is
  disclosed there. `PRE-EXISTING`, not fixed.
- **`Element.byteOffset` carries none at all** and disagrees with itself: `0` inside a defined-length
  item, file-absolute inside an undefined-length one. Unchanged.
- **`DicomParseError.snippet` is still 16 raw source bytes** (D-10) and is still PHI. Naming the frame
  made it more certainly the named element's content, not less. **Do not read "the offset is framed"
  as "the error is safe to log".**
- **The standing product call is untouched.** `report.removedPrivateTags`,
  `report.unauditableSequences[].tag`, `uidMap`, `contextPath` and the two `byteLength` fields are
  model fields, not messages, and a bound there empties them on every well-formed file. This slice did
  not go near them.
- **`ds.warnings` is still uncapped**, package-wide.
- **`CHANGELOG.md` still carries the falsified universal**, in the released `#80` and `#93` entries.
  It is **generated** from changeset summaries and is never hand-edited in this repo, and a released
  entry is a record of what was claimed at the time. It is named here rather than silently left, so a
  reader who greps the changelog and finds the sentence knows it is history and not current doctrine.
- **`UNSUPPORTED_TRANSFER_SYNTAX`'s `snippet` is not a cut of the frame it names.** The slot carries
  PS3.6's own name for the unsupported UID (`"RLE Lossless"`) when the registry publishes one, and
  16 raw bytes only when it does not. That is `PRE-EXISTING`, deliberate, and unchanged. A first
  draft of this slice wrote a universal on `DicomParseError`'s own JSDoc that was false because of
  it, and a graded pass reproduced the counterexample. A second pass then found the same false
  universal surviving in `at()`'s own JSDoc, which said **two** factories bypass it when three do.
  **Never write a universal about `snippet` without this row.** Pinned in
  `fatal-diagnostic-surface.test.ts`.
- **`ParseFrame` closes the OMISSION mode only.** A deliberately mismatched
  `{ buffer, name }` still type-checks and renders faithfully; a graded pass built one, and the
  claim that a disagreement is "not expressible" is corrected in every artifact that carried it.
  The real guard is that composing a frame is one assignment, so no site can half-update. **The
  count of those sites is deleted rather than corrected** - see the note in section 2.
- **The origin-withholding rationale is weaker than an impossibility, and is stated as weaker.** A
  frame origin is a position, and this library publishes positions freely in the `"input"` frame;
  recovering a specific declared length from one needs a second published number. A graded pass made
  that point and could not turn it into a defect. The item asked for the frame to be NAMED, which is
  what shipped.

### 7. Blast radius a consumer sees

- `Error.message` suffix changes from `(offset=N)` to `(offset=N frame=F)` on **every** Tier-3 fatal
  and on every `{ strict: true }` escalation. A string match on that suffix stops matching. `err.code`
  is unchanged, and which files throw is unchanged.
- New public exports: `OFFSET_FRAMES` and `OffsetFrame`. New public readonly field:
  `DicomParseError.offsetFrame`.
- `DicomParseError`'s constructor gains a required fourth argument. It is `@internal` and no consumer
  is expected to call it, but it is not private, so this is stated rather than assumed harmless.

---

<a id="dicom-lo-length-value-over-length"></a>

## dicom - the over-long `(0012,0063)` Value nothing disclosed, on either route (2026-08-08)

`DICOM-LO-LENGTH-AND-SILENT-REPLACE`, third and last open half. The first two closed in `#74`
(`f8f2c0d`) and `#75` (`6d05366`, 3 passes, NOT REFUTED, 512/512 subsets, 2,816 cells, 0 over).
Written here rather than in `documentation/agent-notes.md` because that file is **over** its
250,000-byte budget on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.** The
precedent is `#97` and `#98`, which relocated the same way.

**Provenance.** The spec claims are read from the SHA-pinned vendored copy under `vendor/nema/`,
**PS3.5 2026c** (Table 6.2-1's `LO` row) and **PS3.15 2026c** (§E.1.1). Every figure below is a
measurement taken in this repo and quoted with the sha it was taken at.

**`CLAUDE.md` CARRIES NO NEW LINE FOR THIS, DELIBERATELY, AND THAT IS A BUDGET GAP RATHER THAN A
JUDGEMENT THAT THE TRAP IS SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`:
six bytes, which is not a line. The remedy is relocation, never deleting a trap to make room and
never raising a ceiling. Its existing `(0012,0063)` bullet already points at
`agent-notes.md#dicom-lo-length-and-silent-replace`, which still holds halves one and two. The rules
this half paid for live in the JSDoc on `hasValueOverLoMaximum` and
`deidentMethodValueOverLength`, in `test/deident/deident-method-lo-length.test.ts` under "an
over-long Value this run did not compose is written through, and SAYS SO", and in this file.

### The defect

`(0012,0063)` De-identification Method is `LO`, and PS3.5 2026c Table 6.2-1's `LO` row is "64 chars
maximum". **That row describes a Value, and `(0012,0063)` is `1-n`**, so the bound falls on each
value between `5CH` delimiters and never on the Value Field. Reading a per-Value clause as a
per-Field one is exactly the misreading that left `#74`'s hole (there it was §6.4, a clause about
where the ENCODER puts its pad, read as a bound on a COMPARISON). A field of 619 bytes made of ten
Values of 61 is conformant; a field of 76 bytes made of one Value is not.

`#75` made the text this library composes for itself multi-valued, and swept all 512 option subsets
to prove no Value it writes can be over. **It left two Values the library does not compose written
through with nothing said about their length:**

1. a caller's `deidentificationMethod`, whose bytes are the caller's; and
2. a value the **source file** already carried, kept because PS3.15 2026c §E.1.1 says a method is
   "inserted in or **added to**" that attribute, so rewriting a prior de-identifier's record would
   destroy the provenance the attribute exists to carry.

Both were `PRE-EXISTING`, both had residual tests pinning the silence, and the item stayed open for
one reason:

> **🔴 THE LIBRARY IS THE LIKELIEST WRITER OF AN OVER-LONG PRIOR.** Every object de-identified
> without a caller method by **any published release** carries the 76-character value, and
> re-de-identifying one **KEEPS** it. **Retention is disclosed; the LENGTH is not.**

Measured, on a `(0012,0063)` seeded with the 76-character text every release up to `0.0.11` wrote:
flat **138** bytes over four passes, Values of **76** and **61**, `DICOM_DEIDENT_METHOD_PRIOR_RETAINED`
raised on every pass for the retention and **nothing at all about the length**. So "a sender's
non-conformant `LO` is the sender's" - the sentence a graded pass refuted in `#75` - does not reach
the common case, because in the common case the sender is us.

### The remedy, and what it deliberately is not

A new Tier-2 code, `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH`, raised when the `(0012,0063)` Value
Field `deidentify()` is about to write carries at least one Value longer than 64 bytes.

**🛑 IT IS A DISCLOSURE AND NOT A BOUND. NOTHING IS SHORTENED, SPLIT OR TRUNCATED BY IT.** Splitting
or truncating either Value would invent a de-identification record nobody made, which is the same
refusal `#75` wrote for the ceiling fallback ("this package reports rather than invents"). The act
is byte-for-byte unchanged; only the silence is closed. A test asserts the caller's over-long value
comes back out at its full length in the same row that asserts the code fires, so a future remedy
that started truncating would turn it red.

**The check is over the value WRITTEN, not over any one route.** One call site therefore covers the
caller route, the retained-prior route and both replacement fallbacks (which write `added`). That is
also why it fires on **every** pass rather than only the first: a code raised once would leave every
re-de-identification of an object carrying the 76-character Value silent again, which is the exact
shape this half exists to close. Pinned as four identical code arrays over four passes, not as one.

**🛑 WIDENED BY UNION, NEVER BY REPLACEMENT, AND THE SUPERSET IS PROVED.** `#97` made a dispatch
exclusive and introduced a worse leak than it closed; `#98`'s `INTRODUCED` major was an exemption
that subtracted a detection on a blocking route. Nothing here is exclusive: no existing branch moved
and the new code is only ever pushed **beside** the others. Proved two ways rather than argued:

- a matrix over five input shapes strips the new code from `report.warnings` and asserts the
  remaining codes equal the base's answers exactly - no prior, a conformant `LO` prior, an over-long
  `LO` prior, a non-`LO` prior, and an over-long caller method beside a conformant prior. Nothing
  goes `1 -> 0`.
- a sweep of all **512** option subsets counts the new code raised **0** times on the text this
  library composes for itself. The `#75` sweep proves no Value it writes is over; this one proves
  the disclosure agrees with that measurement rather than firing beside it.

### The cost, disclosed rather than argued away

**The measurement is over BYTES.** No character repertoire encodes a character in fewer than one
byte, so a Value of 64 bytes or fewer can never hold more than 64 characters: the check **cannot
miss** a Value that is genuinely over the maximum.

**🛑 THE CONVERSE FAILS WHENEVER A VALUE'S BYTES OUTNUMBER ITS COUNTED CHARACTERS, AND THE
ENUMERATION OF WAYS THAT HAPPENS IS DELETED RATHER THAN WRITTEN A THIRD TIME.** Two graded passes
refuted two drafts of it, and this repo's rule for that is deletion, not a third wording:

- **Draft 1** put in the frozen registry message that 64 bytes is "the largest an `LO` Value may be
  **under a single-byte repertoire**". Pass 1 refuted it from the vendored PS3.5 2026c, in the
  paragraph immediately above Table 6.2-1: those lengths are "expressly specified in characters
  rather than bytes ... because the mapping from a character to the number of bytes used for that
  character's encoding may be dependent on the character set used. **Escape Sequences used for Code
  Extension shall not be included in the count of characters.**" Table 6.2-1's `LO` Character
  Repertoire cell admits ESC "when used for ISO/IEC 2022 escape sequences", and a multi-valued
  `(0008,0005)` (Level 4, §6.1.2.5.4) makes that legal.
- **Draft 2** said the converse fails "for two reasons", named the multi-byte repertoire and the
  escape sequence, and added that the encoder's trailing pad could not do it "because both operands
  reach the check trimmed" - true of the **field**, which is where `trimTrailingPad` runs at the
  write, and false of a Value that is not last. Pass 2 refuted it with a prior field of
  `"X"x64 + SPACE + "\" + "ACME"`, whose first Value is 65 bytes and raises the code. **That draft
  used §6.4 - a clause about what an ENCODER writes - to bound what the MEASUREMENT can see**, which
  is the misreading the item names as rule one of the three this lineage paid for.
- **Draft 3** wrote pass 2's own counter-example up as a third over-report direction, calling that
  65-byte Value "conformant". **Pass 3 refuted that too, and refuted pass 2's premise with it**,
  from the paragraph three above the note both earlier drafts quoted: "An individual Value,
  **including padding**, shall not exceed the Length of Value, **except in the case of the last
  Value of a multi-valued field** as specified in §6.4." So padding counts toward the length, the
  sole exception is the last Value, and a 65-character non-last Value is **not conformant**: the
  code firing on it is a **true positive**, not an over-report. Pass 3 measured the boundary and
  found the guard exactly on §6.2's line - `"X"x63 + SPACE` in a non-last Value raises nothing,
  `"X"x64 + SPACE` raises.

**🛑 SO THERE IS NO PADDING SENTENCE ANYWHERE, IN EITHER DIRECTION, AND THERE MUST NOT BE A FOURTH.**
Three graded passes refuted three drafts. This paragraph is the history, which is what this file is
for; every other artifact - the registry message, both JSDoc blocks, `types.ts`, `README.md`,
`docs-content/troubleshooting.md`, the changeset and the test module docblock - carries only the
general rule and says nothing about padding at all. The test row that measures the three padded
cases is named for what it measures and claims nothing.

What survives every counter-example is the general rule: the byte measurement over-reports whenever
a Value's bytes outnumber its **counted** characters, which is §6.2's escape-sequence exclusion and
its characters-not-bytes rule and nothing else. The two measurements that instantiate it stay,
because they are measurements rather than an enumeration: 40 characters of `ISO_IR 192` is 120
bytes, and `\ISO 2022 IR 100` with `ESC 2/13 4/1` plus 64 single-byte characters is 67 bytes carrying
64 counted characters and parses with no warnings.

The repertoire pins are files that **declare** the repertoire. A first draft built the multi-byte
fixture without `(0008,0005)`, under which the default repertoire is ISO-IR 6 and "40 characters"
would have been a claim the fixture could not support - green by fixture, which is this repo's
recurring failure mode.

**`position.byteOffset` locates the prior element, and is `0` when there was none.** This is the
first method code that can be raised on a Data Set carrying no `(0012,0063)` at all - the other three
cannot fire without a prior element - so on the caller route the offset is a sentinel rather than a
location. There is nothing to point at: the over-long bytes are the caller's argument, not the
file's. Stated rather than glossed, because that locator is the compensating control for withholding
the value, the length, the count and the origin, and pinned on both routes so the `0` reads as an
absence and not a constant.

Decoding per `(0008,0005)` to count characters exactly was refused here: the charset of an attribute
whose Values may predate this run is not something the function can establish, and a disclosure that
under-reports is worth less than one that over-reports. **Read the code as "a Value in this
attribute is over 64 bytes", which is what is measured, never as "the attribute is
non-conformant".** That wording is in the registry message, in the JSDoc, in the README and in
`docs-content/troubleshooting.md`.

### The message carries no value, no length, no count and no origin

A diagnostic about a length defect is itself a PHI surface, and **a raw length has no table to be a
member of** - which is why `DICOM-DIAGNOSTIC-PHI-RESIDUALS` bound one out of six other messages. So:

- **64 is in the message**; it is a constant of the VR, like the tag in
  `DICOM_DEIDENT_METHOD_NOT_ADDED`.
- **the offending Value's own length is not**; it is a measurement over document content.
- **the count of how many Values are over is not**; same kind of number.
- **the origin is not**; which Value came from the caller and which from the file is not decidable
  when the two are equal, so naming one would be a claim rather than a report.

The message no longer says "which is the largest an `LO` Value may be under a single-byte
repertoire". It says the Value is longer than 64 bytes, cites §6.2's characters-not-bytes rule, and
states the one direction that holds: 64 bytes or fewer can never carry more than 64 characters, a
longer one is not necessarily over.

Pinned with a **name-bearing payload and a non-vacuity assertion**, because `#55`'s pin here was
vacuous by fixture: the over-long prior carries `SMITHSON^BRAIN`, the test asserts those bytes really
do reach the output before it asserts anything about the message, and every four-character window of
the name is checked against `warning.message` (four letters is a leak). The windows are taken over
the NAME rather than the whole value, for the reason `#75`'s first draft went red: the registry prose
is English and a four-character window of the surrounding words collides by coincidence.

The detector's clean result is pinned **beside a positive it does catch, one byte away** - 64 clean,
65 raised, `SMITHSON` in both - because a detector zero can be a gap rather than a clearance. And the
per-Value reading has its own row: ten Values of 61 in a 619-byte field are clean, one Value of 65
among nine conformant ones is caught. A detector that measured the Value Field would fail both. The
512-subset sweep asserts the size of the domain it walked beside its zero, so a tenth option (1,024)
or a removed one (256) cannot turn the clearance into a smaller sweep silently.

### Base-red, re-run after every test change

**12 of 125, in 2 files of 4, on `4bc6930`**, with `src/` **replaced** (`rm -rf src` then a file copy
from a pristine snapshot, never `git checkout`):

- `test/deident/deident-method-lo-length.test.ts` **11 of 34**
- `test/property/warning-codes.snapshot.test.ts` **1 of 5** (the locked public-surface snapshot)
- `test/deident/deident-method-add.test.ts` **0 of 29**, deliberately
- `test/integration/phi-diagnostic-surface.test.ts` **0 of 57**, deliberately

**This figure moved twice inside the slice, and the rule earned its fifth outing.** The first
measurement read 9 of 122 with the last file quoted at 0 of 50; **a graded pass refuted the 50**,
and the note's own total gave it away: 31 + 5 + 29 + 50 is 115, not 122. The file is byte-identical
on both trees, so no reading of "which base" rescues it. It was then re-run again after the pass-1
remedy added three rows to the first file. **Re-run it after every test you add, STRENGTHEN OR
DELETE, and never carry one forward.**

The two deliberate zeros pin behaviour this slice says it does not change, so a red in either would
mean it changed something it claims it did not.

**Two of the new rows are green on base and that is what they are for**, not an omission: the
512-subset sweep counts the new code at 0 on both trees, and the superset matrix pins the base's
answers so the new tree has something to be compared against. A row that is red on base is a change
detector; these two are non-regression pins, and saying so is the honest reading.

### Still open, and NOT folded in

**`(0012,0063)` records the UNION of the options ever applied, never a per-run history**, so a later
pass with fewer options leaves no trace an earlier one had more. `#75` introduced that when it split
the record per option and de-duplicated per value; the base's one-value-per-run text did distinguish
two such runs. It is **conservative** - the union over-states retention, never understates it - so it
is not a leak, and it stays a backlog line rather than a rider here for three reasons:

1. it changes what **every** run writes into every de-identified object, which is a product decision
   about what E.1.1's provenance carrier holds, not a disclosure;
2. a per-run history re-opens unbounded growth. Each pass would append its own record even when a
   superset is already present, which is precisely the growth the fixed-point rule cost five graded
   passes to close and which the 65,534-byte ceiling guard exists to stop; and
3. entangling it with a length disclosure would make one base-red figure answer for two unrelated
   properties.

Its residual test is unchanged and still pins it.

**Also open, `PRE-EXISTING`, raised by pass 1 and left as a backlog line:**
`test/integration/phi-diagnostic-surface.test.ts` claims in its header to enumerate every
consumer-controlled position on the diagnostic surface, and it has no slot for this code. The
enumeration was already incomplete before this slice; widening it is a sweep across every code in
`WARNING_MESSAGES`, not a rider on one of them. The code's own PHI properties are pinned in
`test/deident/deident-method-lo-length.test.ts` under "the disclosure carries no value, no length,
no count and no origin".

---

<a id="dicom-phi-scan-atx-heading"></a>

## The override log refuses a `###` run an invisible character separates from the path

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,544 - 39,544 = 0 bytes**, so the file cannot take one more byte. **That is
> HEADROOM, not file size, and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> size hook (since retired, with the budget). The **"a few bytes" reading is stale in the only direction that
> matters** - the ratchet was lowered on a shrink, and the answer today is zero.
> `documentation/agent-notes.md` is **over its 250,000 ceiling** on `main`, so this record is here
> instead (budgeted at `REPO_DOC_MAX`). **No trap deleted, no ceiling raised.** What points at it,
> derived with `git grep -an dicom-phi-scan-atx-heading` on the commit that carries it rather than
> asserted: `scripts/phi-scan.ts`, `scripts/measure-phi-scan-atx-heading.ts`,
> `test/scripts/phi-scan-matchers.test.ts`, `test/scripts/commonmark-pin.test.ts`,
> `vendor/commonmark/README.md` and `documentation/agent-notes.md#dicom-phi-scan-html-blocks`.
> **No always-read file does.** A first draft of this line named two of them and was caught by a
> gate: the ones it omitted were added by the same commit, which is exactly why the derivation has
> to be re-run against the commit rather than written from memory.

`DICOM-RESIDUALS`, `conformance-refuter` gate. `#118`, base `94069e8` (`#117`). Last verified
2026-08-11.
No pass count is written here: a draft carried one that had not happened yet when it was typed.

Closes the residual `#117`'s first pass named and left open, **`D-R6`**: `tripleHashValue`
separated the `###` run from the path with the whole of `\s`, where **CommonMark 0.31.2 section 4.2
says the opening run "must be followed by spaces or tabs, or by the end of line"**. So a line whose
separator was an invisible character was a **LIVE allow entry** where the document renders a
**PARAGRAPH**, and `--allow-fixture` exempted that PHI scan target at exit 0.

### The measurement that came first, because the row read UNMEASURED

Three trees, each restored **by file copy**, each run twice over a target holding a synthetic
`FAMILY^GIVEN`: once with `--allow-fixture` and once without.

| separator                                         | `58c9f2e`            | `8139687`            | `94069e8`            |
| ------------------------------------------------- | -------------------- | -------------------- | -------------------- |
| a space, a tab                                    | exit 0               | exit 0               | exit 0               |
| `NBSP`, `IDEOGRAPHIC SPACE`, `ZWNBSP`, `EM SPACE` | **exit 0, EXEMPTED** | **exit 0, EXEMPTED** | **exit 0, EXEMPTED** |
| no entry at all (control)                         | exit 2               | exit 2               | exit 2               |

Every one of those targets exits **1** on the same bytes without the flag, which is what makes exit
0 an exemption rather than an empty run. `PRE-EXISTING` is therefore measured rather than inherited,
and it reaches further back than the two trees the filed line named.

### 🛑 ONE CONJUNCT, WHICH IS WHY A DIRECTION CAN BE STATED HERE AT ALL

Everything else in this parser is parity, and this lineage has had a fail-safe-direction argument
refuted three times. This one is different, and the difference is structural rather than argued:
the change is **a single conjunct on the pattern the function replaced**, so for every line it
returns either `/^###\s+(.+?)\s*$/`'s answer or `null`, never a third answer. No line that was not
already an entry can become one, so every difference is a **REFUSAL at exit 2**.

**🛑 THAT IS A PROPERTY OF THE SOURCE, AND NO TEST HERE PROVES IT.** A draft of this slice shipped a
case that claimed to, and a gate showed the case was true by construction: it compared a test-local
oracle against the pattern the oracle was built from and never loaded `phi-scan.ts` at all, so
replacing the parser's return with a garbage string left it **green**. It is DELETED rather than
reworded, and the sentence it was sold as evidence for is corrected wherever it was written.

What stands behind the property instead, each re-derivable:

- the **comment-stripped diff**, below, which is one added early return before the pattern's scan
  and nothing else. That is what makes the reading structural rather than a hope;
- **behaviourally**, the per-log relation the instrument prints against a base: the one log the two
  trees differ on reads `a-subset-of-b`, and every other reads `equal`;
- the two cases that go **red on base**, which say the conjunct fires at all.

### 🔴 THE STRIP IS CONTESTED, AND TAKING IT WAS REFUSED BY THE GATE

Section 4.2 also says the raw contents are "stripped of leading and trailing space or tabs". **The
reference implementation of the pinned document version does not do that.**
`commonmark@0.31.2`, `lib/inlines.js`, strips with `block._string_content.trim()`, which is
`String.prototype.trim`, which is the whole of `\s` - what this parser does and what the pattern
did. Re-measured directly rather than taken from the gate that raised it:

| input                | `commonmark@0.31.2` renders | this parser names |
| -------------------- | --------------------------- | ----------------- |
| `###<NBSP>path`      | `<p>###<NBSP>path</p>`      | nothing           |
| `### path<NBSP>`     | `<h3>path</h3>`             | `path`            |
| `### <NBSP>path`     | `<h3>path</h3>`             | `path`            |
| `### path` (control) | `<h3>path</h3>`             | `path`            |

The separator row is why this slice exists and the parser now agrees with both the prose and the
implementation. The other rows are a document arguing with itself, and **a gate whose job is to
agree with a rendered page does not get to pick a side of that on prose alone.**

**A DRAFT OF THIS SLICE TOOK THE PROSE, AND IT IS DELETED RATHER THAN REWORDED.** It made
`### path<NBSP>` name `path<NBSP>`, which **exempted at exit 0 a target this parser refuses at exit
2** - a new invisible route, introduced inside the remedy for an invisible route - under a headline
saying an invisible character could no longer exempt a target. The gate measured it in the real `all`
mode and refused the slice. What shipped is the separator alone, which is what `D-R6` names.
`test/scripts/phi-scan-matchers.test.ts` pins the strip as it is, so the draft cannot return by
accident.

**Reproducing the implementation column needs a package this repository does not vendor** (no
network in CI, and `vendor/commonmark/` is the document, not an implementation):
`npm i commonmark@0.31.2` in a scratch directory, then render the four inputs above.

### What else is not modelled, and each one is a CASE

**🛑 THAT HEADING IS A CLAIM AND IT WAS FALSE WHEN IT WAS FIRST WRITTEN.** A gate mutated
`isLineTerminatorCode` down to `LF` and `CR` - deleting the only thing between `### a<LS>b.dcm` and
a live allow entry - and the **whole suite stayed green**, so the `LS`/`PS` line was a sentence
dressed as a pin. It is a case now, and so is the container-block line, which had none either.

- **Section 4.2's optional CLOSING sequence.** `### x ###` is a heading whose contents are `x`;
  this parser names `x ###`. **And `### ###` names `###`**, where the contents are empty and the
  heading names nothing - a second shape, found by the gate after the first was disclosed alone.
- **INLINE parsing.** The contents are "parsed as inline content", so a backslash escape or an
  emphasis run renders as something other than itself: `### a\_b.dcm` renders `a_b.dcm` and this
  parser names `a\_b.dcm`; `### a*b*.dcm` renders `ab.dcm` and it names `a*b*.dcm`.
- **No CONTAINER blocks.** `### <path>` is recognised at column 0 only, so a heading a reviewer sees
  inside a block quote or a list item is a DROPPED entry.
- the `###` run is anchored at **column 0**, where section 4.2 allows up to three spaces of
  indentation. Pinned by ` ### indented` in the shared case list;
- an **`LS` or `PS`** inside the heading text refuses the whole line, which is what is left of the
  pattern's `(.+?)`. `splitCommonMarkLines` ends a line at neither, so they are the only two that
  reach it, and the mutant above is now red on one case.

The first three are the ones with a direction worth naming, and **all three are VISIBLE to whoever
reviews the rendered log** - which is exactly what the separator was not. That is the line this
slice cut along. Each is offered as a `DICOM-RESIDUALS` row rather than a sentence filed here alone.

### The measurement instrument

`scripts/measure-phi-scan-atx-heading.ts` (shipped, `pnpm measure:phi-scan-atx-heading`) reads the
entry sets of one or two `phi-scan.ts` PATHS, so nothing here touches the working tree and a base is
restored **by file copy, never `git checkout`**. Its corpus is **derived from `\s` over all 65,536
code points**, not typed: an earlier draft of this class named six characters and a gate measured
three more, so the list a reader would have checked is not written anywhere.

**THE PER-LOG GRID IS NOT TRANSCRIBED HERE.** A hand-copied grid is the item's
`AN INHERITED FIGURE IS NOT A RE-MEASUREMENT`, and one has already been caught in this lineage
stating a row count the commit carrying it had moved. The instrument ships, so the grid is one
command:

```
pnpm measure:phi-scan-atx-heading scripts/phi-scan.ts <a copy of base>
```

What is quoted is its SUMMARY, re-run against `94069e8` on the tree that carries this sentence:

```
logs where the two scripts differ: 1 of 7
  invisible-separator: a-subset-of-b
controls: scanner identity OK, entry-exempts OK, committed-log anchor OK, positive control OK
```

The `invisible-trailer` and `invisible-leader` rows reading **`equal`** are what says the contested
strip did not move; they are in the corpus for that reason and not as decoration.

**🩺 IT CARRIES ONE CONTROL THE SIBLING INSTRUMENTS DO NOT, AND IT IS THE ONE THIS ITEM KEEPS
ASKING FOR.** The other three are the HTML-blocks instrument's, unchanged in kind: the
scanner-identity negative control, the **committed-log anchor** (every script measured must read
zero live entries in this repository's own log), and the **positive control** (the corpus must
produce both an empty and a non-empty entry set, and a comparison at least one non-`equal`
relation). The fourth is **THE EXEMPTION CONTROL**: an entry is measured everywhere else by whether
`--allow-fixture` was ACCEPTED, which is one inference away from what matters, so one log is run
twice over a target holding a synthetic `PN` and the pair must be **exit 0 with the flag against
exit 1 without it**. A script that exited 0 on both would be finding no PHI at all and every
acceptance it reported would mean nothing. All four **throw**; they do not report. A gate confirmed
each one fires against a script built to trip it.

### Tests: 2 red on base of 1,394, and the rest green on base BY DESIGN

Full suite with base `94069e8`'s `scripts/phi-scan.ts` restored **by file copy** into this tree:
**`2 failed | 1391 passed | 1 todo` across 76 files**, both in
`test/scripts/phi-scan-matchers.test.ts`. **The red fraction is small because the change is small**,
and the number is stated rather than padded: the refused draft read 6 of 1,393, and four of those
six were cases going red for a behaviour that is no longer shipped.

**The green-on-base cases are counted separately rather than folded in**, because a padded red
fraction is this lineage's recurring claim defect:

- the new `commonmark-pin` case reads the **vendored document** and says nothing about `phi-scan`'s
  behaviour. A red one would mean the pin was wrong;
- the **contested strip**, the **all-whitespace** heading, the **closing sequence**, **inline
  parsing**, **container blocks** and the **`LS`/`PS` refusal** cases all pin behaviour this slice
  deliberately did not change. Green on base is what they are for, and each is red under a mutant.

**Mutants, re-measured on what shipped rather than carried from the draft:**

| mutant                                                    | result                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| the section 4.2 conjunct removed                          | 2 cases red                                                         |
| **the refused draft put back** (strip made section 4.2's) | **6 cases red**, including the strip pin and the all-whitespace pin |
| `isLineTerminatorCode` narrowed to `LF` and `CR`          | 1 case red                                                          |
| the all-whitespace narrowing DELETED                      | **whole suite green**                                               |

**🔴 THE LAST ROW IS A GAP AND IS PRINTED AS ONE RATHER THAN LEFT OUT.** Under the shipped strip the
guard is reachable only as the EMPTY string, which names no path either way, so nothing observes it.
It becomes load-bearing only under the refused draft, where the second row shows the pin catching
it. That is a rule no test can break today, stated rather than claimed. **The third row was the same
shape until a gate measured it** - it read whole-suite green too, which is why the `LS`/`PS` case
exists.

### The scan route is untouched, checked with the transpiler rather than by eye

Comment-stripped with `removeComments`, base and head differ by **one added conjunct inside
`tripleHashValue` and nothing else**: **43,351 B on base, 43,497 B on head.** The base figure is the
one `#117` recorded for its own head, which is a cross-check rather than an inherited number.

### 🔴 Not closed, and named rather than claimed away

- **The contested strip**, above. Not a defect to fix - a disagreement between the pinned document
  and its reference implementation, and the slice that resolves it needs an oracle this repository
  does not have.
- **Section 4.2's optional closing sequence** (two shapes), **inline parsing** and **container
  blocks**, above. All three offered to the meta-repo as new `DICOM-RESIDUALS` rows.
- **Start condition 7** and **section 4.5's backtick-info-string opener** are untouched, both
  `PRE-EXISTING`, both already `DICOM-RESIDUALS` lines.
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `position.contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a
  later hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`. **This slice
  measures nothing about the heap and nothing about the corpus.**

---

<a id="dicom-phi-scan-config-parsers"></a>

## The gate constructs no `RegExp` at all, and its override log is no longer fence-blind

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. **That is HEADROOM, not file size,
> and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> size hook (since retired, with the budget). `documentation/agent-notes.md` is **257,209 B, over its 250,000
> ceiling** on `main`, so this record is here instead (**budgeted at `REPO_DOC_MAX`, not unbudgeted**).
> **No trap deleted, no ceiling raised.** What points at it, verified by `git grep` rather than
> asserted: `scripts/phi-scan.ts`, `scripts/measure-phi-scan-regex-statics.ts` and
> `documentation/agent-notes.md#dicom-phi-scan-regex-statics`. **No always-read file does.**
>
> 🩺 **The refuter's pass-1 major was this paragraph.** It named those three pointers when only the
> third existed, called the destination unbudgeted when the hook gives it `REPO_DOC_MAX`, and the
> same commit **deleted** `scripts/phi-scan.ts`'s only citation of this lineage's record without
> replacing it. So the one compensating control for `CLAUDE.md`'s six bytes of headroom was a
> sentence that was false by inspection, in the commit that wrote it. The citations are restored and
> the claim is now checked by the command above.

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `01d0983`. Last verified 2026-08-10.

Closes the two residuals `#112` left open, and they turned out to be **one mechanism**, which the
census showed rather than an argument:

- _"The gate's own CONFIGURATION is still a `RegExp` subject"_, disclosed **by a measured figure
  rather than a description**: every clean column read `input 3772`.
- _"`PRE-EXISTING`: `loadOverrideLog` is FENCE-BLIND, so the committed `phi-scan-overrides.md`
  template line parses as a live allow entry."_

### The disclosed figure, verified before anything was built to it

`scripts/phi-allow-list.txt` is **3,774 bytes** and **3,772 UTF-16 code units**. The two differ by
exactly the one astral emoji in it, four bytes for two units. So `input 3772` is the allow-list
**in code units**, and quoting the byte count would have been wrong by two.

A runtime census over five invocation modes on `01d0983`, taken by wrapping `RegExp.prototype`'s
`exec`/`test` and the four `Symbol` methods and recording every call with its stack:

| route                      | regex operations                             | subject held at exit                       |
| -------------------------- | -------------------------------------------- | ------------------------------------------ |
| no arguments (all-mode)    | **3,773**, every one `loadAllowList`'s split | `input` 3,772, `lastMatch` `"\n"`          |
| `--max-hit-lines 5 <path>` | 3,775                                        | `input` 3,772                              |
| `--staged`                 | 3,774                                        | `input` 32, the git raw record             |
| `--allow-fixture <path>`   | 597                                          | **`input` = `lastMatch` = `"### <path>"`** |
| `--max-hit-lines banana`   | 2                                            | `input` 0                                  |

### 🛑 The census is what made this ONE slice rather than two

The last row is the finding. On the route that reads the override log, **the retained `RegExp`
subject IS the fence-blind template line**, held verbatim in both `input` and `lastMatch`. The two
residuals are not neighbours, they are the same eleven lines of code: `loadOverrideLog` held **two
of the five** live regex sites, and its fence-blindness is a defect of the same line-oriented parse
the regex was doing.

Every one of the five sites was on the configuration route. There were none anywhere else, which is
what `#112` had already achieved for the scan route.

### The fix

**The script now constructs no `RegExp`.** Five sites became forward scanners: `isAllDigits`,
`splitLines`, `tripleHashValue`, `fenceRun` + `overrideLogPaths`, and `rawRecordMode`.

**The carve-out sentence is DELETED rather than worded a fifth time.** `#112` was refused in passes
1, 2 and 3 for a universal its own config parsers falsified, and its final remedy deleted the
sentence. The way to stop wording a carve-out is to remove what it carved out, and the universal is
now simply true. **A scrub was again available and again refused** (`#109`, `#111`, `#112`): a bound
that holds only from where a cleanup is called is not a bound. There is nothing to clean up.

### 🔴 One parser is DELIBERATELY narrower, in the fail-closed direction

`overrideLogPaths` is **not** an equivalence, and this is the only intended behaviour change:

1. **Fence-awareness**, the residual itself.
2. **An all-whitespace heading no longer registers a lone space as a path.** Found while measuring
   the pattern, not inherited: `\s+` is greedy and `(.+?)` needs one character, so `"###  "` makes
   the engine hand one space back out of the run and capture it. `normalizePath(" ")` is then a
   root-level entry for a file named with a single space.

Both narrowings are fail-closed **as narrowings of `overrideLogPaths`**: a dropped entry makes
`--allow-fixture` **refuse the run** (exit 2), so the target is not exempted. Exit 2 does not scan
it either, and saying so was a third wording this record had to correct: the run stops and says
nothing about the corpus, which is a refusal rather than a clearance.

### 🛑 But `fenceRun` has no safe direction, and two passes were spent learning it

**FENCE STATE IS PARITY.** Three drafts of `fenceRun`'s comment claimed a fail-safe direction and
two gates refused it, the second with the measurement that kills the shape entirely. On
`open / A / close-with-a-trailer / B / close / C`:

| how the trailer is read           | dropped  | live    |
| --------------------------------- | -------- | ------- |
| as bare, so it closes             | `A`, `C` | **`B`** |
| as an info string, so it does not | `A`, `B` | **`C`** |

Getting one fence wrong does not merely drop or admit that block's headings, **it swaps every block
boundary after it**, moving entries in both directions at once. So "narrower is safer" is false
here, and the argument is **DELETED rather than worded a third time**. What replaces it is not a
safety heuristic but a specification: CommonMark 0.31.2 §4.5.

Two defects were found this way, each by a different pass, each measured on the head that carried
it and each now a named test plus a mutant:

1. **Pass 1:** `bare` used `isSpaceCode`, the whole of `\s`. §4.5 admits only spaces and tabs after
   a closing run. A closing run trailed by an invisible `NBSP` or `IDEOGRAPHIC SPACE` **closed the
   block**, and a heading written inside what a human sees as a code block became a live allow
   entry, exempting the target at exit 0.
2. **Pass 2:** after narrowing to space and tab, **the tab arm was unpinned** and dropping it passed
   all 18 cases. Dropped, the same parity flip happens with a tab. The control in the other
   direction had only ever used a space; it now uses both.

### 🔴 Two corrections applied AFTER the fourth pass, and therefore UNGRADED

The gate returned `NOT REFUTED` at the cap with two `minor` findings, and named both as backlog
lines safe to ship around. They were applied anyway, because each is a **deletion of a false
sentence** and a comment cannot change behaviour. **They carry no refuter verdict and that is stated
rather than glossed:**

1. `Fence.bare` claimed _"each arm has been wrong once and each is pinned by its own case."_ Both
   halves false: `isSpaceCode` admits `0x20` and `0x09`, so no head ever shipped a wrong arm, and
   dropping **either** arm reds the **same** single case. Replaced with that measurement.
2. The exit-2 misstatement was corrected in the note and the changeset but **left standing in the
   two code carriers**, which are what a maintainer reads first. Corrected to the wording the fourth
   pass measured as true.

**🔴 And one RED GATE that no refuter pass caught, because it is not a conformance question.** CI's
`CodeQL` check refused the first push with **1 new high-severity alert in code changed by this PR**:
`js/file-system-race` on `missingFromOverrideLog`'s `existsSync`-then-`writeFileSync`. A
check-then-act race, in the helper written to prove the override log is parsed correctly. Closed by
**deleting the check** and writing unconditionally, which is also what the helper wanted: every
candidate is a throwaway file whose only job is to make the refusal be about the missing LOG ENTRY
rather than about a missing file. Worth recording because `scripts/verify.sh dicom` was green
throughout and **does not run CodeQL**: a locally green gate is not the whole gate.

### 🔴 One known divergence from §4.5, PRE-EXISTING and disclosed rather than argued harmless

§4.5 also says an info string after a **backtick** fence may not contain backticks. `fenceRun` opens
on ` ```a\`b `anyway. Measured: on`open-with-that-info-string / X / close / Y / close`, this tree
makes `Y`a live allow entry where CommonMark renders it inside a code block. **Base`01d0983`is
fence-blind and makes both live**, so this tree is strictly the smaller surface and the divergence
is`PRE-EXISTING` in outcome. It is a backlog line, not this slice's to close: narrowing the opener
is a third selection change on a function that has already cost two passes.

### 🛑 The inertness was RE-MEASURED, not inherited, and it holds twice over

`#112` recorded the fence-blind entry as inert. Re-measured here, in a throwaway repository with a
PHI-bearing file whose repo-relative path IS the placeholder:

| route                                      | can a target normalize to `<path>`?                                                                  | outcome                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `all` (what CI runs)                       | **no**, the placeholder is a ROOT-LEVEL path and `SCAN_ROOTS` is `test`, `README.md`, `docs-content` | never a target                        |
| `--staged` (what the pre-commit hook runs) | **no**; the file was staged, git listed it in `--raw`, and `SCAN_SCOPE` dropped it                   | never a target                        |
| explicit paths                             | **yes**                                                                                              | **exit 0, target exempted, silently** |

So the inertness is stronger than "no tracked path is named `<path>`": **neither gating route can
produce such a target at all.** It was live only where a caller names the file itself. Pinned beside
its controls: the same bytes with no flag exit **1**, and a path with no entry at all exits **2**.

**This is NOT a stop-the-line finding.** It is closed here regardless, because an allow-list entry
no human wrote is a silent exemption waiting for a path to match it.

### Figures, all re-measured on the shipped artifact

Base `01d0983` restored **by file copy**, never `git checkout`. Instrument extended and shipped as
`scripts/measure-phi-scan-regex-statics.ts`.

|                                                   | base                     | here                                           |
| ------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| scan shapes leaving a `RegExp` subject            | **7 of 7**, `input 3772` | **0 of 7**                                     |
| config routes leaving one                         | **5 of 6**               | **0 of 6**                                     |
| config routes byte-identical to base, as required |                          | **5**                                          |
| config routes DELIBERATELY different              |                          | **1**, and the instrument refuses if it is not |
| routes disagreeing with either expectation        |                          | **0**                                          |

| equivalence, whole output byte for byte             |                                                     |
| --------------------------------------------------- | --------------------------------------------------- |
| cells (real corpus + adversarial + 32 fuzz corpora) | **34**                                              |
| **cells differing from base in any byte**           | **0**                                               |
| cells that refused (exit 1)                         | 33                                                  |
| hit lines compared                                  | **9,283**                                           |
| **MUTATION CONTROL, same cells, one character**     | **17 cells differ**                                 |
| detector positive control                           | fires, and **the instrument throws if it does not** |

**🛑 THE ZERO IS PINNED BESIDE POSITIVE CONTROLS AT BOTH ENDS.** The detector must report a token a
regex has just matched; the equivalence grid must report a one-character mutant; and the config
comparison names the one route that MUST differ, refusing with `NO CHANGE, where one was intended`
if the fence fix ever stops working. A control that cannot fail is not a control.

### Tests: 12 new cases, 8 red on base, and why 4 are green by design

**8 of 12 are red on `01d0983`.** The other **4 are GREEN ON BASE BY DESIGN**: they assert that
removing the regexes moved nothing, so a red one would mean the slice changed behaviour it should
not have. The figure that says they are not vacuous is the mutation grid, over the 18 cases in the
two files:

| mutant                                                             | cases red |
| ------------------------------------------------------------------ | --------- |
| `splitLines` splits on a lone `CR`                                 | 1         |
| `isAllDigits` widened to `Number()`                                | 1         |
| `tripleHashValue` drops the `LineTerminator` check                 | 1         |
| `fenceRun` never sees a fence (base behaviour)                     | **6**     |
| a closing fence need not be bare                                   | 2         |
| fence indent allowance removed                                     | 1         |
| tilde fences not recognized                                        | 1         |
| all-whitespace narrowing reverted (base behaviour)                 | 1         |
| `isSpaceCode` drops `NBSP`                                         | **5**     |
| **`bare` computed over all of `\s` (the refuter's pass-1 defect)** | **1**     |
| **`bare` drops its tab arm (the refuter's pass-2 defect)**         | **1**     |
| **`rawRecordMode` accepts UPPERCASE hex**                          | **0**     |

The override-log parser is driven as a **membership oracle**: `--allow-fixture` is repeatable and
the refusal names every path it could not find an entry for, so one subprocess reports exactly which
of a candidate set the parser produced. Both directions are asked separately.

### 🔴 Not closed, and named rather than claimed away

- **One shape is unreachable from outside the script and NO TEST CLAIMS IT.** `rawRecordMode`
  cannot be shown an uppercase-hex sha or trailing bytes after the status, because git does not emit
  either, and mutants widening both pass. **`splitLines`'s `CRLF` handling was named here as a
  second such shape and that was WRONG** - the section below closes it. **A first draft of this
  slice's JSDoc claimed an exhaustive differential for each. Both sentences were DELETED** rather
  than reworded, on this repo's own rule that a disclosure naming a test must name one that exists.
  What does pin `rawRecordMode` was measured instead: a mutant that never parses a record reds **14**
  of `phi-scan.test.ts`'s 138 cases, and one returning the SOURCE mode reds **12**.
- **The `#112` note's own two carriers of the closed disclosure were found by a `-a` phrase sweep
  with newlines folded** and updated rather than left to read as current. The sweep's positive
  control is `test/integration/fatal-diagnostic-surface.test.ts`, which plain `grep` prints nothing
  for: **5 tracked files in this repo carry a literal NUL.** A first draft said 7, which is what
  `grep -I` rejects; the other two are the empty `.gitkeep` files, and rejecting-for-no-match is not
  the same measurement as carrying a NUL.
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a later
  hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the exit code still
  cannot see an unread tail. **This slice measures nothing about the heap.**

### 🛑 The `CRLF` half WAS observable, and the disclosure saying it was not is DELETED

> **This section is `#115`'s record and describes the call graph AS IT WAS.** `#116` moved
> `overrideLogPaths` onto its own CommonMark splitter, so the caller named below is now
> `splitCommonMarkLines` and `splitLines` is the allow list's alone. The finding stands; the
> function names have moved. See `documentation/agent-notes.md#dicom-phi-scan-line-endings`.

`#113` shipped `splitLines` with a 🔴 disclosure on it: the `CRLF` half was unobservable through
either caller and claimed by no test, because `loadAllowList` trims and `tripleHashValue` trims.
Those two premises are true. **The conclusion is FALSE, and false in exactly the way this file's own
`isSpaceCode` paragraph warns about** - it reasoned from what a caller does to a line AFTERWARDS,
which is the "bound that holds only from the call site" shape the slice was otherwise built to
refuse.

`overrideLogPaths` hands the RAW line to `fenceRun` BEFORE anything trims it, and `bare` there
admits a space or a tab and nothing else (CommonMark 0.31.2 §4.5, the rule `#113`'s own two refuter
passes were spent on). So on an override log written with `CRLF`, a `CR`-blind split leaves a `CR`
after the closing run, the run is read as an info string rather than as a close, the block never
ends, and every entry below it is dropped.

**Measured on one log - a fenced template, two live entries below it - both `--allow-fixture`
directions asked on each arm:**

| arm                           | the two entries below the fence | the fenced template |
| ----------------------------- | ------------------------------- | ------------------- |
| shipped, `CRLF` log           | exit 0, both honoured           | exit 2, refused     |
| `CR`-blind mutant, `CRLF` log | **exit 2, both dropped**        | exit 2, refused     |
| shipped AND mutant, `LF` log  | exit 0, both honoured           | exit 2, refused     |

The `LF` row is what makes this a fact about the line ending rather than about the fence rules
`#113` already pinned, and the template column is the other direction, so a parser that made
everything below an entry fails it too. The test runs both arms before asserting either, so a mutant
reports both in one failure (`{ crlf: Set{2}, lf: Set{} }`) instead of stopping at the first.

### 🛑 NO DIRECTION IS CLAIMED FOR THAT MUTANT, and the draft that claimed one was refuted BY MEASUREMENT

A draft of the section above argued the `CR`-blind mutant was **fail-CLOSED** - a `CR` can only
prevent a close and never cause one, `tripleHashValue` trims one off a heading, therefore the
mutant's entry set is a strict SUBSET and its cost is a refused `--allow-fixture` rather than an
exempted target. **That is the parity fallacy, it is the THIRD attempt at a fail-safe direction on
`fenceRun` in this lineage, and the gate falsified it with an input.** On a log whose lines are all
`CRLF` except one opening fence:

| target                     | shipped              | `CR`-blind mutant    |
| -------------------------- | -------------------- | -------------------- |
| `--allow-fixture decoy`    | **exit 0, exempted** | exit 2, refused      |
| `--allow-fixture smuggled` | exit 2, refused      | **exit 0, EXEMPTED** |

The two entry sets are `{decoy}` and `{smuggled}` - **disjoint, not nested** - and the mutant
exempts a target the shipped script refuses. A prevented close CAN invert later boundaries, which
is what "fence state is PARITY" means and what the `fenceRun` section above already measured. **The
argument is DELETED, not narrowed.** The branch is claimed by a test; nothing needs a direction.

**Mutation figure, re-measured on this slice's own head rather than inherited** (a figure
without its sha is not a fact, and the base moves): the `CR`-blind mutant (dropping the `i - 1`
test) reds **1 of 1,369 cases across all 75 test files**, the 1 being the new case. The run is
`1 failed | 1,367 passed | 1 todo`; the **`todo` is what makes those three numerals add up**, and
the shipped tree reads `1,368 passed | 1 todo`. On base `fd0b92a`, the same mutant over the base
suite reds **0 of 1,368**, so `#113`'s "passes the whole suite" is re-measured as **0 before, 1
after** rather than restated.

**This slice changes no behaviour.** Every changed line in `scripts/phi-scan.ts` is a comment line -
checked with the TypeScript transpiler rather than by eye, `removeComments` output byte-identical on
base and head - so the gate's exit codes, hits and totals are what `fd0b92a` produced.

**🔴 THE CARRIER COUNT IS SCOPED TO THIS SUBMODULE, AND THE SCOPING IS THE POINT.** A draft said the
false disclosure had "exactly four carriers"; the sweep that produced that numeral never left
`/workspace/dicom`, so the numeral asserted an exhaustiveness it had not measured. **Four carriers
inside this repository** are corrected: two in `scripts/phi-scan.ts` (the config-parser header list
and the `splitLines` JSDoc), one in `test/scripts/phi-scan-matchers.test.ts`, and the bullet above.
The sweep was `-a` and newline-folded, positive control
`test/integration/fatal-diagnostic-surface.test.ts` - **read whole, 84,556 bytes carrying 4 NULs** -
so the zero elsewhere is one the sweep could have broken. **TWO MORE CARRIERS ARE LIVE IN THE
META-REPO AND ARE NOT THIS PR'S TO EDIT**, both now false by this slice's measurement:
`operations/BACKLOG.md`'s `DICOM-RESIDUALS` line and
`documentation/repos/dicom/phi-scan-value-excerpt.md`, each still reading _"`splitLines`'s CRLF half
is claimed by no test (both callers `trim()`, so a `CR`-blind mutant passes the suite)"_. They are
handed to the meta-repo, named rather than left to read as current.

**Unchanged by this slice, in either direction:** `hits` unbounded as an array; the relocation,
`contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a later hit;
the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the `rawRecordMode` shapes
git cannot emit. **It measures nothing about the heap and nothing about the corpus.**

**🟢 AND ONE THE GATE RAISED THAT IS NOW CLOSED.** `splitLines` mirrored `/\r?\n/`, so a LONE `CR`
was not a separator; CommonMark counts one as a line ending, which made `overrideLogPaths` diverge
on a log carrying one, in the direction that admits an entry a human reading the rendered log does
not see. It was filed here as a backlog line rather than absorbed (ADR 0016 rule 2), with the figure
left un-retaken because grounding it needed a CommonMark oracle this repository did not vendor.
**`#116` vendored one and closed it**: `documentation/agent-notes.md#dicom-phi-scan-line-endings`.

---

<a id="dicom-phi-scan-exit-flush"></a>

## `phi-scan` ended `process.exit()`, so the tail of its report was dropped on a pipe

_`DICOM-PHI-SCAN-EXIT-FLUSH`, 2026-08-09. Base **`21d42f5`**. Filed because `ci / verify (24,
ubuntu-latest)` - a REQUIRED check - was red on `main` itself._

Written here rather than in `documentation/agent-notes.md` because that file is **over** its
250,000-byte budget on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.**

**`CLAUDE.md` carries no line for this.** Its ratchet is 39,550 bytes and it measures 39,544 on
`main`: six bytes, which is not a line. Relocation is the remedy, never deleting an existing trap to
make room and never raising the ceiling. So the rule lives where a worker touching this code reads
it: the JSDoc on the last statement of `scripts/phi-scan.ts`, the case in
`test/scripts/phi-scan.test.ts` under `"phi-scan: the report's TAIL survives a stderr pipe the reader
is not draining"`, and this file.

**Provenance.** Every figure below is a measurement taken on this repo against base **`21d42f5`**,
quoted with that sha and no other. The base column is reproducible with
`git show 21d42f5:scripts/phi-scan.ts > /tmp/base-phi-scan.ts`.

### What was red, and what it was not

| sha | slice | `verify (22)` | `verify (24)` |
| --- | --- | --- | --- |
| `b784c38` | `#103` | success | success |
| `08ed3ee` | `#104` | success | **failure** |
| `21d42f5` | `#105` | success | **failure** |

Plus `#106`'s own PR head `e32e595`: `verify (22)` success, `verify (24)` **failure**. Against that,
`#104`'s and `#105`'s PR heads were both **green** on `verify (24)`. Six observations, three red:
**this is a roughly 50% flake, not a step change at a commit.** `#104` did not introduce it. It was
the first slice to emit a 200-line report, and that is all it did.

Every failure is one of the two `--max-hit-lines 0` cases and always the same shape:

| run | test | got | expected |
| --- | --- | --- | --- |
| `08ed3ee` main | `caps by DEFAULT, with no flag` | 193 | 200 |
| `21d42f5` main | `caps by DEFAULT, with no flag` | 193 | 200 |
| `e32e595` (`#106` PR) | `` `--max-hit-lines 0` prints every one `` | 191 | 200 |

### What rules out "the scanner found fewer hits on Node 24"

**The scan is deterministic.** The fixture is 200 distinct PN-shaped tokens written by the test, the
allow-list is copied from this repo, and `scanText`'s three passes are plain global regexes over the
whole file. The same bytes produce the same 200 hits on every run and every Node version, so the hit
COUNT cannot vary. What varied is what arrived.

**"With no ordering or timing input" was in that sentence and is DELETED**: `CUTOFF_YEAR` is
`new Date().getFullYear() - 120`, a wall-clock read, so the premise was false as written even though
the conclusion holds - the 200 tokens carry no digits, so neither date pass can fire on them. A
refuter caught it as the same shape as the syllogism it replaced.

**🛑 AN EARLIER DRAFT ARGUED THIS FROM THE EXIT CODE INSTEAD - "exit 1 was correct, therefore all
200 writes were issued" - AND A REFUTER FALSIFIED IT.** Exit 1 means `hits.length >= 1` and nothing
more, so it is equally consistent with 193 hits having been found. The conclusion held; the argument
did not. It is DELETED rather than reworded. Do not write it again.

### The mechanism, established rather than assumed

`scripts/phi-scan.ts` ended:

```js
const exitCode = run();
process.exit(exitCode);
```

`process.exit()` tears the process down without waiting for stdio that libuv has accepted but not
yet written. Under every caller that matters this script's stderr is a **pipe** - `spawnSync` in
this repo's own suite, and the shell pipeline a CI job runs it in - and a pipe write that cannot
complete immediately is queued and flushed on a later loop turn, which `process.exit()` never
allows. `report()` returning is not the same as its bytes having left the process.

**Control 1 - the mechanism in isolation.** 5,000 small stderr writes, reader deliberately stalled:

| script tail | hit lines delivered | exit code |
| --- | --- | --- |
| `process.exit(1)` | **784** of 5,000, 3 of 3 runs | 1 |
| `process.exitCode = 1` | **5,000** of 5,000, 3 of 3 runs | 1 |

784 lines is ~64 KiB, which is a Linux pipe. **Node 22.23.1 and Node 24.19.0 gave the same 784 on
the same box**, so the stdio semantics are NOT the version split - the split is scheduling, and Node
24 is where this suite happens to lose the race.

**Control 2 - the CI failure itself, reproduced.** Real `scripts/phi-scan.ts` at `21d42f5`, real
200-hit fixture, real `spawnSync`, with two knobs turned to make the reader lose: `fs.pipe-user-pages-soft`
exhausted by holding 1,400 open FIFOs, so newly created pipes get a single page instead of 64 KiB,
plus 220 busy loops for CPU contention. Rootless, no `sudo`, no sysctl.

| script tail | runs | truncated | hit-line counts seen |
| --- | --- | --- | --- |
| `process.exit(exitCode)` | 60 | **30** | 200 x30, 190 x17, 191 x6, 170 x2, 192 x1, 171 x1 |
| `process.exitCode = run()` | 60 | **0** | 200 x60 |

**That is the CI signature, on this box: the same ~50% rate, the same short-by-7-to-10 counts (191
and 192 among them), exit 1 every time.** The coordinator's 150+ clean local runs were clean because
an idle box drains the pipe faster than the child fills it; the defect needs a reader that does not.

### What shipped

```js
const discardLateStdioError = (): void => {};
process.stdout.on("error", discardLateStdioError);
process.stderr.on("error", discardLateStdioError);

process.exitCode = run();
```

Node returns from the main script and exits once the loop has drained.

**The two listeners are not decoration, and they are here because pass 1 of the gate REFUTED the
slice without them.** `process.exit()` hid every late stdio error; without it a write to a pipe
whose reader has gone fails with `EPIPE` on a **later tick**, after `run()` has returned, so
`run()`'s try/catch cannot see it and Node's default unhandled-`'error'` path exits **1** - the one
code that means "PHI was found". Measured, reader closed (`| head -n 0`):

| run | `21d42f5` | one statement, no listeners | shipped |
| --- | --- | --- | --- |
| clean corpus | 0 | **1** | 0 |
| invocation error (`--max-hit-lines banana`) | 2 | **1** | 2 |

`2 -> 1` turns "the scan did not complete, so it says nothing about the corpus" into a confident
wrong answer, and it printed an uncaught-exception stack that the `run()` JSDoc forbids. Both codes
hold again under `node` and under `tsx`, which is the invocation `pnpm phi-scan` uses.

**The error is DISCARDED rather than reported, and that is base parity rather than a judgement that
it does not matter.** `process.exit()` made every late stdio error unreachable, so the exit code was
always exactly what `run()` returned; it stays exactly that. There is also nowhere to report it -
the stream that failed is the one a diagnostic would go to.

**🔴 THE COST, MEASURED AND NOT CLOSED HERE: with a reader that never drains at all, the script now
WAITS instead of exiting**, where `process.exit()` ended it by dropping the report. An earlier draft
of the JSDoc claimed this "does not change when the process ends"; that is FALSE and is deleted.
It is INTRODUCED, on `node` and under `tsx` alike, which is the runner `pnpm phi-scan` uses.
Blocking until the reader takes the bytes is what makes the report whole; a timeout here would
re-introduce the defect this slice closed.

**🛑 A SECOND DRAFT TRIED TO SOFTEN THAT RESIDUAL AND A REFUTER FALSIFIED THE SOFTENER TOO.** It
read "every caller in this repo drains, and the shipped `pnpm phi-scan` path runs under `tsx`, which
does not exit on a stalled reader on `21d42f5` either." Both halves were wrong: base exits under
`tsx` in ~430 ms as well as under `node`, so the hang is this slice's; and the suite has had TWO
`spawn` sites since this slice added one, and the one it added destroys its read ends rather than
attaching a listener. **The clause is DELETED, not reworded a third time.** The residual stands
unqualified, which is the honest form of it.

**🛑 AND A NOTE ON HOW THAT ONE GOT IN, BECAUSE IT IS THE REUSABLE PART.** It was inherited from a
refuter's own finding and written into the tree WITHOUT BEING RE-MEASURED. When it finally was, the
first draw agreed with the false version and four repeats refuted it. A single draw against a
process that races a timeout is not a measurement.

### Why this could not be folded into `#106`

`#106` had identified the same one-liner and **declined to apply it**, correctly: it changes the
stdio contract of the very script that slice's 195-cell matrix was graded against. That makes the
contract change its own slice, and it makes "what does it break" the question this slice owes an
answer to.

### The superset, checked rather than argued

**It changes WHAT ARRIVES, never WHAT IS WRITTEN.** Base and fixed, same corpus, same argv,
`spawnSync` with a normally-draining reader so neither side is truncated, comparing exit code +
stdout bytes + stderr bytes:

| case | exit | stderr bytes | identical |
| --- | --- | --- | --- |
| clean corpus, all mode | 0 | 0 | yes |
| flood, DEFAULT cap | 1 | 2,007 | yes |
| flood, `--max-hit-lines 0` | 1 | 16,745 | yes |
| flood, `--max-hit-lines 1` | 1 | 455 | yes |
| flood, `--max-hit-lines 3` | 1 | 617 | yes |
| net-leak control: flood THEN named | 1 | 828 | yes |
| non-monotone case: mixed, capped at 3 | 1 | 630 | yes |
| non-monotone case: mixed, uncapped | 1 | 16,921 | yes |
| hits fit under the cap | 1 | 385 | yes |
| bad `--max-hit-lines` | 2 | 102 | yes |
| missing flag argument | 2 | 53 | yes |
| all mode, leak in `docs-content/` | 1 | 382 | yes |

**12 of 12 byte-identical, over a DRAINING reader, and all three exit codes of the contract
(0 / 1 / 2) are exercised.** The draining qualifier is load-bearing and was added because a refuter
refused the sentence without it: a vanished reader is a different question and is answered by its
own table under "What shipped". So:

- **`#104`'s per-file print cap is untouched.** The default, `0`, `1` and `3` all emit the same bytes
  as base, and the net-leak control still names both paths.
- **`#105`'s finding that `report()` is NOT monotone in `hits` at the cap still holds, unchanged.**
  Both cells of it are byte-identical to base. This slice does not make the printed set monotone and
  does not claim to; it makes the printed set **arrive**.
- **`#106`'s 195-cell matrix, graded against `21d42f5`, is not invalidated.** Every cell of it is an
  exit code and a set of printed values, and both are byte-identical here. Checked concretely as
  well as argued: `#106`'s tree at `e32e595` with this one statement applied runs **1,329 tests, 73
  files, all green**, in a throwaway detached worktree. The branch itself was not touched.

### The regression case, and why it is not the flaky one

The two assertions that were failing are a ~50% flake in CI and never fire on an idle box, so they
pin nothing. The new case stalls the reader instead of hoping the scheduler does: it reads one chunk
from the child's stderr, pauses 500 ms, then resumes.

| script tail | result |
| --- | --- |
| `21d42f5` | short, **3 of 3 runs**, total line absent |
| shipped | 5,000 of 5,000, total line present |

**No numeral is quoted for how short, deliberately.** How much of the report base delivers depends
on the reader, and two honest measurements of it disagree: through this case in the suite it read
171 of 5,000, and a refuter running the same shape standalone read 962-964 of 5,000. Both are the
defect. Neither is a property of the scanner, so neither belongs in prose as one.

The fixture is 25 x `floodText()` = 5,000 hits, ~400 KB of report, deliberately: a stalled reader can
still receive one chunk plus one full pipe, about 128 KiB, and the 962-964 measurement is ~80 KB
against that bound, so a smaller fixture lets a truncating scanner pass. **Do not shrink it.**

The second case pins the cost of the remedy rather than the defect: with both read ends destroyed,
a clean corpus must still exit 0 and an invocation error must still exit 2. It **fails** on the
one-statement version and **passes** on `21d42f5`, which is what makes it a parity guard and not a
new invention.

### Residual, unchanged by this slice and NOT closed here

**`test/helpers/run-script.ts` inherits `spawnSync`'s 1 MiB `maxBuffer`, which truncates at ~15,400
lines - in BOTH exit modes.** It is a real latent hazard for any future case that scans a loud
object, and it is a different defect: it is the PARENT dropping bytes it was handed, not the child
failing to hand them over. It is not this one, and 200 lines is ~16 KB. Filed, not fixed.

**The other `process.exit()` call sites in `scripts/` are untouched and unmeasured.** They are error
paths that write a line or two before exiting, so the same hazard is available to them in principle
and was not observed. This slice measured `phi-scan.ts` and changed `phi-scan.ts`.

---

<a id="dicom-phi-scan-html-blocks"></a>

## The override log models CommonMark's HTML blocks, so a comment can no longer exempt a scan target

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. **That is HEADROOM, not file size,
> and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> size hook (since retired, with the budget). `documentation/agent-notes.md` is **over its 250,000 ceiling** on
> `main`, so this record is here instead (budgeted at `REPO_DOC_MAX`). **No trap deleted, no ceiling
> raised.** What points at it, derived with `git grep -an dicom-phi-scan-html-blocks` rather than
> asserted: `scripts/phi-scan.ts`, `scripts/measure-phi-scan-html-blocks.ts` and
> `vendor/commonmark/README.md`. **No always-read file does.**

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `8139687` (`#116`). Last verified 2026-08-10.

Closes the `PRE-EXISTING` residual `#116` filed against itself and handed to the meta-repo as its
own backlog line: **`overrideLogPaths` modelled fenced code blocks and nothing else, so a
`### <path>` a human sees inside a section 4.6 HTML block was a LIVE allow entry and
`--allow-fixture` exempted that target at exit 0.**

### Why this residual, out of everything on the open list

It is the only one left that **silently exempts a PHI scan target**, which is the direction this
parser exists to refuse, and it is the sharper form of what `#116` closed. A fenced code block
**shows** its contents to a reviewer; an HTML comment shows **nothing at all**. A log reading

```
<!--
### somebody-elses-study.dcm
-->
```

renders as an empty document and exempted that path. The rest of the open list is a dropped entry,
a diagnostic field, a memory bound or a decision already taken.

### What is modelled, and what is not

CommonMark 0.31.2 section 4.6 defines seven kinds of HTML block by a start and an end condition.
`htmlBlockStart` and `htmlBlockCloses` implement **kinds 1 to 6**, and `overrideLogPaths` treats an
open block the way section 4.6 says a parser must: _"any HTML within an HTML block that might
otherwise be recognised as a start condition will be ignored by the parser"_, and so is a fence, and
so is a heading.

**🔴 KIND 7 IS SCOPED OUT, WITH ITS COST MEASURED IN BOTH DIRECTIONS RATHER THAN ASSUMED.** Its
start condition is a complete open or closing tag alone on a line, and section 4.6 adds that
_"blocks of type 7 may not interrupt a paragraph"_. That is **paragraph state**, which this parser
does not have and cannot acquire without modelling every other leaf block, and **approximating it is
the parity trap below**: a guess that a line is not in a paragraph opens blocks CommonMark does not,
which moves entries in both directions at once. So it is scoped, named on the function, and pinned
by a test, arm by arm:

| log                                             | CommonMark         | base `8139687` | here                 |
| ----------------------------------------------- | ------------------ | -------------- | -------------------- |
| `<span>` after a BLANK line                     | kind 7, no heading | live entry     | **live entry**       |
| `<span>` after a PARAGRAPH line                 | no block, heading  | live entry     | live entry           |
| `</pre>`, then a comment holding a fence opener | kind 7, no heading | **exit 2**     | **exit 0, EXEMPTED** |

The second row is why the case asserts more than one arm: a test showing only the first would read
as an accepted behaviour rather than as a measured gap.

**🔴 THE THIRD ROW IS THIS SLICE WIDENING THE HOLE, AND IT WAS FOUND BY THE GATE RATHER THAN BY THE
SLICE.** `</pre>` alone on a line is a complete closing tag, so CommonMark starts a kind-7 block
there that runs to the end of the document; neither tree models that. But the comment opener beneath
it is read here, and it swallows the fence delimiter that used to hide the heading, so **this tree
exempts at exit 0 a target base refused at exit 2.** The CLASS was disclosed, the INSTANCE was not,
and that gap is the same shape `#116` disclosed against itself. It is now a corpus row
(`condition-seven-widened`) and a test arm.

**🛑 AND IT FALSIFIES THE `DICOM-RESIDUALS` LINE THAT EXISTS, WHICH THIS SUBMODULE CANNOT EDIT.** That
line reads that the class is `PRE-EXISTING` on the `LF` form and that `#116` widened its reach BY ONE
INPUT, the lone `CR` form. This input is pure `LF` and moves base exit 2 to head exit 0, so both
halves are now wrong. **The correction is OWED to the meta-repo and is named here rather than
asserted as already made.**

### 🛑 NO DIRECTION IS CLAIMED, AND THE DISJOINTNESS ROW IS WHY

A block boundary is **PARITY**. This lineage has had a fail-safe-direction argument refuted three
times (`#113` on the fence, `#115` on the entry sets, `#116` on the line ending), so the evidence
here is an input rather than an argument. On a log with an **odd** number of fence delimiters inside
a comment:

````
<!--
```
-->
### alpha
```
### bravo
````

| target                  | head                 | base `8139687`       |
| ----------------------- | -------------------- | -------------------- |
| `--allow-fixture alpha` | **exit 0, exempted** | exit 2, refused      |
| `--allow-fixture bravo` | exit 2, refused      | **exit 0, EXEMPTED** |

The two entry sets are `{alpha}` and `{bravo}`: **disjoint, both non-empty**, each exempting at exit
0 a target the other refuses at exit 2. Modelling HTML blocks is therefore not "narrower" and is not
defended as safer. What decides it is the document.

### The measurement

`scripts/measure-phi-scan-html-blocks.ts` (shipped, `pnpm measure:phi-scan-html-blocks`) reads the
entry sets of one or two `phi-scan.ts` PATHS, so nothing here touches the working tree and a base is
restored **by file copy, never `git checkout`**.

**🛑 THE PER-LOG GRID IS NOT TRANSCRIBED HERE, AND THAT IS THE REMEDY FOR A DEFECT A GATE CAUGHT IN
THIS FILE.** A hand-copied grid stated eleven rows while the commit carrying it grew the corpus to
twelve, and the row it omitted was the only one showing the leak direction. That is the item's
`AN INHERITED FIGURE IS NOT A RE-MEASUREMENT`, inside the remedy for a different trap, which is the
shape `#109` paid for. The instrument ships, so the grid is **one command** and cannot go stale:

```
pnpm measure:phi-scan-html-blocks scripts/phi-scan.ts <a copy of base>
```

What is quoted is its SUMMARY, re-run against `8139687` on the tree that carries this sentence:

```
logs where the two scripts differ: 7 of 12
  comment: a-subset-of-b
  comment-lone-cr: a-subset-of-b
  div: a-subset-of-b
  pre: a-subset-of-b
  fence-in-comment: b-subset-of-a
  parity: disjoint
  condition-seven-widened: b-subset-of-a
controls: scanner identity OK, committed-log anchor OK, positive control OK
```

Two rows carry the whole argument and are named rather than left to be read off: **`parity`** is
`{alpha}` against `{bravo}`, and **`condition-seven-widened`** is `{widened}` against `{}`. The
`committed` anchor reads `{}` on both.

**🛑 THE `relate` HELPER DIFFERS FROM THE SIBLING LINE-ENDINGS INSTRUMENT BY ONE ORDERING, AND THE
DIFFERENCE IS THE POINT.** An empty set shares nothing with anything **and** is a subset of
everything, so `disjoint` and a subset label are both true of it. Reported as `disjoint`, the
`fence-in-comment` row would have looked like parity evidence while resting on an empty side. The
subset test runs first here, and the disjointness claim rests on the `parity` row, whose two sides
are both non-empty.

Three checks **throw** rather than report, unchanged in kind from the sibling instrument: the
scanner-identity negative control (a bad `--max-hit-lines` must be refused with phi-scan's own
message, which is what catches a same-named file from another package in a shared scratch area), the
**committed-log anchor** (every script measured must read zero live entries in this repository's own
log), and the **positive control** (the corpus must produce both an empty and a non-empty entry set,
and a comparison must produce at least one non-`equal` relation).

### The tag tables are read out of the pinned document, not typed

Start conditions 1 and 6 close over tag names, and a table nobody checked against the spec is a
table somebody typed. `test/helpers/commonmark-spec.ts` re-hashes `vendor/commonmark/spec/` on load,
walks the headings to **derive** that HTML blocks are section 4.6, and reads both lists out of the
section between anchors that are **required to occur exactly once in the section and once in the
document**. Zero and two are both refusals, which is the meta-repo's rule about locating a spec
section, and this repository has paid for the first-match shape before (`#80` cited PS3.5 section 7.5
twice when the sentence is in 7.5.2).

`test/scripts/phi-scan-matchers.test.ts` then drives **one `--allow-fixture` per derived name, from
BOTH lists**, through the membership oracle in a single subprocess, so each committed table is
checked **behaviourally** rather than by a text regex over the source. **NO COUNT OF EITHER LIST IS
WRITTEN ANYWHERE**, here or in `phi-scan.ts`.

**🛑 CONDITION 1's LIST WAS DRIVEN BY NOTHING IN THE FIRST DRAFT, AND THE GATE PROVED IT WITH A
MUTANT: reducing that table to a single name left the WHOLE SUITE GREEN.** The claim above was
written in the plural while half of it was verified by a second typed literal in a test, which is
the "table somebody typed" this section names, one file over. The loop was extended rather than the
sentence narrowed, because the unguarded direction is the leak direction: a name missing from the
shipped table means that tag starts no block, so the heading under it is a live allow entry.

**No exhaustiveness is claimed in the other direction.** An over-wide table is caught only for
NAMED controls: `divx` and `paramx`, each a LISTED NAME FOLLOWED BY MORE tag-name characters, which
is what pins the maximal-munch read (the listed name is the prefix, not the control), plus `source`,
`canvas` and `video`, which are unrelated names a table grown by one entry would fail on. A method
plus a named list, asserting no completeness.

Both mutants the gate used are now red, re-measured on the remedy rather than argued:

| mutant                                  | before the remedy     | after      |
| --------------------------------------- | --------------------- | ---------- |
| condition 1's table reduced to one name | **whole suite green** | 1 case red |
| `source` added to condition 6's table   | both test files green | 1 case red |

**The control for the other direction is `<divx` and `<paramx`**: a listed name followed by more
tag-name characters. CommonMark starts no block on either, and they are not complete tags so
condition 7 does not reach them, so the heading below each must stay live. That is what makes the
maximal-munch read of the name safe to state: the five things section 4.6 allows after a listed name
(space, tab, end of line, `>`, `/>`) are none of them tag-name characters, so a listed name that is
a strict PREFIX of the run is never followed by one of them.

### Tests: 8 red on base of 1,388, and 3 green on base BY DESIGN

Full suite with base `8139687`'s `scripts/phi-scan.ts` restored **by file copy** into this tree:
**`8 failed | 1379 passed | 1 todo` across 76 files.** All eight are this slice's new behavioural
cases and all eight are in one file. **The figure was re-taken after the remedy rather than carried:
it read 7 of 1,388 before the condition-7 case gained its widening arm**, which is red on base
because base refuses the target this tree exempts.

**The 3 green-on-base cases are counted separately rather than folded in**, because a padded red
fraction is this lineage's recurring claim defect:

- the two `commonmark-pin` cases read a **vendored document** and say nothing about `phi-scan`'s
  behaviour. A red one would mean the pin was wrong;
- the **committed-log anchor** is green on both trees, which is exactly what it is for: this
  repository's own log carries no HTML and adding a block class must not have moved it.

The condition-7 case's first two arms are green on base, and only its third is red. It is counted in
the red fraction as one case, which is what the runner counts.

Every behavioural case asks **both directions** in the same run, so a parser that dropped everything
fails as surely as one that dropped nothing.

### The scan route is untouched, checked with the transpiler rather than by eye

Comment-stripped with `removeComments`, base and head differ by exactly the new block machinery and
the `overrideLogPaths` wiring, and nothing else: **39,046 B on base, 43,351 B on head**. The base
figure is the one `#116` recorded for its own head, which is a cross-check rather than an inherited
number, and the detector produced a real diff rather than the empty-output false "identical" `#115`
caught.

### 🔴 Not closed, and named rather than claimed away

- **Start condition 7**, above. It is a `DICOM-RESIDUALS` line, not a sentence filed here alone.
- **`tripleHashValue` still refuses a heading whose text contains `LS` or `PS`** (`U+2028`,
  `U+2029`), and **section 4.5's backtick-info-string opener** is untouched. Both `PRE-EXISTING`.
- **🟢 `tripleHashValue` ADMITTED IN THE OTHER DIRECTION TOO, WHICH WAS UNNAMED UNTIL A GATE NAMED
  IT, AND IT IS CLOSED NOW** (`D-R6`, `#118`). It separated the `###` run from the text with
  `isSpaceCode`, the whole of `\s`, where section 4.2 allows only a space or a tab. So a heading
  whose separator is whitespace that section 4.2 does not admit and that does not end the line
  renders as a PARAGRAPH and was a **live allow entry on both trees**. **The enumeration that stood
  here is DELETED rather than completed**: it named six such characters and a gate measured three
  more, and this lineage's rule is that a list corrected once is cut, not extended. The predicate is
  the whole of `\s`, which is complete and does not need an illustration. **Only the SEPARATOR is
  closed.** The strip is a second class, it is contested between the pinned document and its
  reference implementation, and a draft that changed it opened a new exit-0 exemption and was
  refused. The record is `documentation/agent-notes.md#dicom-phi-scan-atx-heading`.
- **This parser still models no CONTAINER blocks.** A `### <path>` is only ever recognised at column
  0, so a heading inside a block quote or a list item is a dropped entry rather than an admitted
  one, and nothing here changes that. It is stated because "models section 4.6" must not be read as
  "agrees with a renderer".
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `position.contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a
  later hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the
  `rawRecordMode` shapes git cannot emit. **This slice measures nothing about the heap and nothing
  about the corpus**, and the false-positive count remains a property of the byte histogram rather
  than a rate.

---

<a id="dicom-phi-scan-line-endings"></a>

## The override log is parsed with CommonMark's line ending, and the spec is now a pinned precondition

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. **That is HEADROOM, not file size,
> and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> size hook (since retired, with the budget). `documentation/agent-notes.md` is **257,209 B, over its 250,000
> ceiling** on `main`, so this record is here instead (budgeted at `REPO_DOC_MAX`, 90,000).
> **No trap deleted, no ceiling raised.** What points at it, derived with
> `git grep -an dicom-phi-scan-line-endings` rather than asserted: `scripts/phi-scan.ts`,
> `scripts/measure-phi-scan-line-endings.ts`, `vendor/commonmark/README.md` and
> `documentation/agent-notes.md#dicom-phi-scan-config-parsers`. **No always-read file does.**
>
> 🩺 **The gate's pass-1 major was this paragraph, for the second slice running.** It named three
> pointers when `scripts/phi-scan.ts` did not yet carry one, which is the verbatim `#113` pass-1
> major recurring inside the paragraph that records it. The citation was added rather than the
> sentence reworded, and the list is now derived by the command above.

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `734736f` (`#115`). Last verified 2026-08-10.

Closes the `PRE-EXISTING` residual `#115` filed against itself: **a lone `CR` in
`phi-scan-overrides.md` hides a heading AND a fence opener from the line split, so a `### <path>` a
human sees INSIDE a rendered code block becomes a LIVE allow entry at exit 0.** That is a silently
exempted PHI scan target, which is the one direction this parser exists to refuse.

### The mechanism, and why the fence opener is the dangerous half

`overrideLogPaths` produces the set of paths `--allow-fixture` will exempt. A lone `CR` hides two
different things from a `/\r?\n/` split:

| what the `CR` hides | why                                                        | cost                           |
| ------------------- | ---------------------------------------------------------- | ------------------------------ |
| a `###` heading     | `tripleHashValue` anchors `###` at column 0                | a dropped entry, exit 2        |
| a fence **OPENER**  | `fenceRun` reads the first non-space character of the line | **an exempted target, exit 0** |

A hidden opener means the block never opens, so every `### <path>` a human sees inside that code
block is live.

### 🛑 The two readings are DISJOINT, so no direction is claimed and none is available

Measured with `scripts/measure-phi-scan-line-endings.ts` (shipped), head against `734736f` restored
**by file copy**:

| log                | head (section 2.1) | base `734736f` (`/\r?\n/`) | relation            |
| ------------------ | ------------------ | -------------------------- | ------------------- |
| `committed`        | `{}`               | `{}`                       | equal (the anchor)  |
| `hidden-opener`    | `{visible}`        | **`{smuggled}`**           | **disjoint**        |
| `hidden-opener-lf` | `{visible}`        | `{visible}`                | equal (the control) |
| `crlf-close`       | `{below-one}`      | `{below-one}`              | equal               |
| `heading-shapes`   | 14 of 14           | 8 of 14                    | base is a SUBSET    |

`smuggled` is a path base **exempts at exit 0** and head refuses at exit 2. `visible` is the
reverse. One log reads **disjoint** and another reads **strict subset**, which is why "narrower is
safer" is not available here and is not asserted: fence state is PARITY, so a wrong line ending
moves entries in both directions at once. What decides it is the document, not a direction.

The `hidden-opener-lf` row is what makes this a fact about the LINE ENDING rather than about the
fence rules `#113` already pinned: the same document with every lone `CR` written `LF` reads equal.

### The fix, and the one thing deliberately NOT changed

`splitCommonMarkLines` implements CommonMark 0.31.2 section 2.1's line ending; `overrideLogPaths`
calls it. **`loadAllowList` keeps `splitLines`, which stays `/\r?\n/` exactly.**

That split is deliberate and is the reason this is not one function: **`scripts/phi-allow-list.txt`
is not a markdown document, so CommonMark's line rule does not govern it.** That is the whole
reason. The case that would go red if anyone unified them anyway is already in
`test/scripts/phi-scan-matchers.test.ts`.

**🛑 A SECOND REASON WAS DRAFTED AND IS DELETED, BECAUSE IT WAS THE PARITY FALLACY ONE FUNCTION
OVER.** It argued that unifying would WIDEN the allow list, on the premise that a `CR`-joined line
is a dead entry today. The gate falsified both halves with controls: `trimTrailingPad` strips only
TRAILING pad, so an interior `CR` survives into the compared value, and a `CR`-joined line is a
LIVE entry that exempts a hit at exit 0. The two readings' allow-entry sets are `{"ALFA\rBRAVO"}`
and `{"ALFA", "BRAVO"}`, **disjoint rather than nested**, each exempting at exit 0 something the
other reports at exit 1. So the allow list has no safe direction either, and the sentence claiming
one is deleted rather than worded a second time. Behaviour there is `PRE-EXISTING` and identical on
both trees; only the sentence was new.

**🔴 THE COST, STATED RATHER THAN ARGUED AWAY:** `splitLines`'s `CRLF` half is unobservable through
its only caller again, because `loadAllowList` trims. That is a fact about the caller and not a
reason to drop the half, which would key the function to what today's caller does afterwards. The
observable `CRLF` claim `#115` bought did not disappear, it moved to `splitCommonMarkLines` with the
caller, through the same `--allow-fixture` oracle.

### 🩺 The CommonMark spec is vendored, because the previous slice named the missing oracle

`documentation/agent-notes.md#dicom-phi-scan-config-parsers` recorded this residual's figure as one it could not re-take,
"because grounding it needs a CommonMark oracle this repository does not vendor". So one is
vendored: `vendor/commonmark/spec/<sha256>/spec.txt`, the git-tagged 0.31.2 document, pinned exactly
as `vendor/nema/` pins NEMA's DocBook.

`test/scripts/commonmark-pin.test.ts` makes it a **precondition rather than a citation**:

1. the document **hashes to its pin**, so a byte cannot be edited to make a citation true;
2. the **version is read from its own front matter**, never from the URL it was fetched with. The
   published copy at `spec.commonmark.org` is byte-identical **apart from having that front matter
   stripped**, which is why the tagged one is vendored;
3. every section number is **DERIVED by walking the headings**, not asserted. The walk must exclude
   the spec's own example blocks, which contain markdown headings: counting those reads
   `Fenced code blocks` as **section 14.1** instead of 4.5;
4. each cited sentence occurs **EXACTLY ONCE** in the document and inside the section claimed for
   it. Zero and two are both refusals, and the locator's own control asserts both:
   `"a carriage return is not a line ending"` (absent) and `"interrupt a paragraph"` (in many
   sections) each make it throw.

Three numbers stop being asserted as a result: **2.1** Characters and lines, **4.5** Fenced code
blocks (which `Fence.bare` already cited through two refuter passes) and **4.2** ATX headings.
4.2 and 4.5 are load-bearing for the disjointness log specifically: a fence opener on the line after
a paragraph line really does open a block, and a `###` on the line after one really is a heading, so
the log is a claim about the rendered document rather than about our parser.

**The spec is hard-wrapped, so every search folds whitespace first.** A line-based `grep` for any of
these sentences finds nothing, which reads as absence. That is this lineage's own sweep trap, hit
inside the file written to avoid it.

### 🛑 The em-dash gate needed a second named vendor root, and that is a real widening

`vendor/commonmark/spec/<sha256>/spec.txt` carries **five em dashes**, all in the document's prose
(two of them inside quotations of John Gruber's original syntax description, so no single author is
named for them). `VENDOR_PINNED_DOC` in `scripts/check-no-emdash.sh` becomes
`^vendor/(nema|commonmark)/[^/]+/[0-9a-f]{64}/`.

The case is byte for byte the NEMA one the script already argues: the rule's own remedy ("rewrite
the sentence") cannot be applied to a document vendored VERBATIM, and editing one byte breaks the
SHA-256 pin a test re-hashes as a precondition. **It is a second NAMED root, never a widening to
`vendor/`**: a new vendor root still cannot inherit the exemption without being named, and a full
SHA-256 still cannot be written as prose. Every hand-written file under `vendor/commonmark/` stays
in scope (`README.md` and `spec/SHA.txt`), which is where this tree's only real violation was ever
found. **Measured after the change: 5 pinned documents match, up from 4, and the gate reports
`248 of 254 tracked files; 6 skipped`.**

### Tests: 2 red on base of 1,377, and 6 green on base BY DESIGN

Full suite with base `734736f`'s `scripts/phi-scan.ts` restored **by file copy** into this tree:
**`2 failed | 1374 passed | 1 todo` across 76 files.** Both failures are this slice's new
behavioural cases, and the second names exactly which entries base drops
(`{cm-a2, cm-a3, cm-b2, cm-b3, cm-b4, cm-b6}`), predicted before it was run.

**The 6 `commonmark-pin` cases are GREEN on base and that is not a defect**: they read a vendored
document and say nothing about `phi-scan`'s behaviour. A red one would mean the pin was wrong. They
are counted separately rather than folded into the red fraction, because an inherited or padded
figure is this lineage's recurring claim defect.

The new behavioural cases:

- **the exempted target**, both directions asked and the `LF` control run beside it;
- **the split itself, differentially against an INDEPENDENT reading of section 2.1** (`/\r\n|\n|\r/`,
  the sentence's three alternatives as a pattern), over one fence-free log carrying a heading pair
  per line-ending shape, answered in one subprocess by the membership oracle. **Its non-vacuity
  control is the other split**: the shapes are chosen so `/\r?\n/` and section 2.1 disagree on
  several, and the case asserts that they do, so it cannot pass against a `CR`-blind parser.

### The instrument

`scripts/measure-phi-scan-line-endings.ts`, `pnpm measure:phi-scan-line-endings`, takes one or two
`phi-scan.ts` PATHS so nothing has to touch the working tree. Three checks **throw** rather than
report: the scanner-identity negative control (a bad `--max-hit-lines` must be refused with
phi-scan's own message), the **committed-log anchor** (every script must read zero live entries in
this repository's own log), and the **positive control** (the corpus must produce both an empty and
a non-empty entry set, and a comparison must produce at least one non-`equal` relation). A detector
that cannot fire is not a detector.

### 🛑 What is closed is the FENCED-BLOCK route, and section 4.6 is a hole in the ADMITTING direction

**`overrideLogPaths` is now spec-grounded on section 2.1's line, but its block structure is a
hand-rolled subset of section 4: fenced code blocks and nothing else.** Section 4.6's HTML blocks
also suppress headings in a rendered document, and this parser does not model them, so a `### <path>`
a human sees inside an HTML block is a LIVE allow entry. Re-measured here on both trees rather than
inherited from the gate that raised it, `--allow-fixture commented` against a log carrying
`intro / <!-- / ### commented / -->`:

| log                     | head                 | base `734736f`       |
| ----------------------- | -------------------- | -------------------- |
| HTML comment, `LF`      | **exit 0, EXEMPTED** | **exit 0, EXEMPTED** |
| HTML comment, lone `CR` | **exit 0, EXEMPTED** | exit 2, refused      |
| `<div>` block, `LF`     | **exit 0, EXEMPTED** | **exit 0, EXEMPTED** |

So the class is `PRE-EXISTING` and unchanged in the `LF` shapes, **and this slice moves one more
input into it**: a lone `CR` inside an HTML block used to hide the whole construct from the parse
and now does not. That is the parity property this record states everywhere else, landing on this
slice rather than against it, and it is named here because `fenceRun`'s own rule is that a measured
divergence gets written down rather than argued harmless. **It is a backlog line and not this
slice's to close**: modelling section 4.6 means seven start conditions and their end conditions,
which is a block-structure feature, not a fourth selection change on a function that has already
cost this lineage two passes. **It is HANDED TO THE META-REPO as its own `DICOM-RESIDUALS` open
line, now and not "later"**, beside the section 4.5 backtick-info-string entry that is its sibling.
Filing it as a sentence in this record alone would be the shape this lineage refuses.

**Read every claim in this record as scoped to fenced code blocks.** "No longer a live allow entry"
means the fenced route, measured; it is not a statement that the parser now agrees with a renderer.

### 🔴 Not closed, and named rather than claimed away

- **`tripleHashValue` still refuses a heading whose text contains `LS` or `PS`** (`U+2028`,
  `U+2029`). CommonMark makes neither a line ending, so a human sees the heading and this parser
  does not produce it. That is a dropped entry (exit 2), it is `PRE-EXISTING`, and it is **not
  re-measured here**: closing it is a fourth selection change on the heading recognizer and belongs
  beside the open section 4.5 backtick-info-string line. The `isLineTerminatorCode` check stays
  exactly as it is, because removing it would key the function to what today's caller hands it.
- **Section 4.5's backtick-info-string opener** is untouched, as is `#113`'s record of it.
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a later
  hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the `rawRecordMode`
  shapes git cannot emit. **This slice measures nothing about the heap and nothing about the
  corpus**, and the false-positive count remains a property of the byte histogram rather than a rate.
- **The scan route is untouched, checked with the TypeScript transpiler rather than by eye.**
  Comment-stripped, base and head differ by exactly the new `splitCommonMarkLines` and the one call
  site in `overrideLogPaths`, and nothing else: **38,603 B on base, 39,046 B on head** (the base
  figure is the one `#115` recorded, which is a cross-check rather than an inherited number). The
  detector produced a real diff, so this is not the empty-output false "identical" `#115` caught.

---

<a id="dicom-phi-scan-name-dispatch"></a>

## `scanTarget` dispatched by NAME, so a `.md` whose bytes were a DICOM object was never scanned as one

_`DICOM-PHI-SCAN-RESIDUALS`, 2026-08-09. Base `08ed3ee`. The `PRE-EXISTING` half of that item; the
sibling residual (`scanDicom` reports nothing about bytes it never read) is **not** closed here and is
**not** part of this slice - see "Why this was one slice and not two" below._

**Provenance.** The spec claims are read from the SHA-pinned vendored copy at `vendor/nema/part05/`,
**PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every other figure is a
measurement taken on this repo against base **`08ed3ee`**, quoted with that sha and no other. The
base column is reproducible with `git show 08ed3ee:scripts/phi-scan.ts > /tmp/base-phi-scan.ts &&
node /tmp/base-phi-scan.ts <path>` run with `cwd=<repo root>`, since the script resolves its
allow-list from `process.cwd()`.

### The defect

`scanTarget` branched on the file's **extension** before it read a byte:

```
const TEXT_EXTENSIONS = new Set([".json", ".txt", ".md", ".csv"]);
...
if (TEXT_EXTENSIONS.has(ext)) { scanText(...); scanEmbeddedObjects(...); return; }
```

so `scanDicom` never ran on one of those four whatever its bytes were. The halt (`#102`), the
preamble (`DICOM-SCANTARGET-PREAMBLELESS`) and now the **filename** are the same defect three times:
each is a thing that does not decide what the bytes are, used to decide which sweep reads them.

**The real path is not exotic.** A de-identification report, a bug repro, or a fixture saved under
the wrong extension carries patient identifiers past the gate entirely.

**What the extension cost, concretely:** the tag table is the only route that can see a
**single-component** `(0010,0010)`. That shape has no caret, so the text sweep's PN pass has nothing
to match, and losing `scanDicom` loses the name completely rather than losing a second opinion.

### The measurement

11 objects x 7 extensions = **77 cells**, one `node scripts/phi-scan.ts <path>` run each, recording
the exit code and which planted value the run printed. Base `08ed3ee` against the shipped tree.

Legend: `B` = a single-component name printed, `C` = a caret-bearing name printed, `D` = a recent
`DA` printed, `t` = the hit named `(0010,0010)`.

| object                                                        | `.md` `.txt` `.json` `.csv` base | ... shipped | `.dcm` `.bin` `.dat` (both) |
| ------------------------------------------------------------- | -------------------------------- | ----------- | --------------------------- |
| preamble-FUL, single-component PN                             | `0----`                          | **`1B--t`** | `1B--t`                     |
| preamble-LESS, single-component PN                            | `0----`                          | **`1B--t`** | `1B--t`                     |
| preamble-FUL, recent `DA`                                     | `1--D-`                          | `1--D-`     | `1--D-`                     |
| preamble-FUL, caret PN behind an undefined-length `SQ`        | `1-C--`                          | `1-C--`     | `1-C--`                     |
| preamble-FUL, Explicit VR BE dataset                          | `1-C--`                          | `1-C--`     | `1-C--`                     |
| preamble-FUL, single-component PN then a halt then a caret PN | `1-C--`                          | **`1BC--`** | `1BC--`                     |
| preamble-FUL, allow-listed PN + allow-listed `DA`             | `0----`                          | `0----`     | `0----`                     |
| not a DICOM stream, caret PN in prose                         | `1-C--`                          | `1-C--`     | `1-C--`                     |
| not a DICOM stream, allow-listed PN                           | `0----`                          | `0----`     | `0----`                     |
| a base64 object inside a markdown page                        | `1-C--`                          | `1-C--`     | `1-C--`                     |
| preamble-LESS, caret PN behind an undefined-length `SQ`       | `1-C--`                          | `1-C--`     | `1-C--`                     |

**The superset, checked mechanically over all 77 cells rather than read off the table: 65 identical,
12 strictly more reported, 0 violations.** No cell went exit 1 -> 0, no cell went to exit 2, and no
cell lost a mark it had on base. The 12 are 8 cells that went **0 -> 1** (the leak) and 4 that gained
a **second** name that the text sweep alone could not see.

**🛑 THE `DA` ROW IS NOT A LEAK AND MUST NOT BE QUOTED AS ONE.** A `DA` value is eight digits, which
the text sweep's compact-date pass matches as a standalone token, so it exited 1 under every
extension on base too. Only the PN rows leaked. A first draft of this note said "the tag route's
findings were lost"; the measurement says which ones.

**The corpus is unmoved.** `node scripts/phi-scan.ts` with no arguments produces **byte-identical**
stdout and stderr before and after, and still exits 0. It has to: `fileMetaStart` answers non-null
only for a 132-byte preamble plus `DICM`, or for a first `uint16le` of `0x0002` with two ASCII
uppercase letters at offset 4 - a leading NUL byte, which no file in this corpus has. **This is not a
false-positive rate and there is none to quote here**; the rate is a property of a payload's byte
histogram, and this package commits no `.dcm` files at all. See `documentation/agent-notes.md#dicom-scandicom-silent-halt`.

### Why this cannot be `#97`'s net leak, and why the argument is structural

**`#97` paid a blocker for the rule that an `if/else` dispatch can make a fix a NET LEAK**, because
`scanDicom` gives up quietly at an undefined-length `SQ` (PS3.5 2026c §7.5.2 defines `0xFFFFFFFF` as
one of two Sequence delimitations, both of which decoders shall support; §7.1 orders tags ascending,
so `(0008,1110)` precedes `(0010,0010)` in a conformant file). Routing a file to `scanDicom`
**instead of** the text sweep once took a name behind an `SQ` from exit 1 to exit 0.

**The remedy here is a DELETION.** The removed branch's two calls were `scanText` and
`scanEmbeddedObjects`. The branch that replaces it makes the **same two calls unconditionally** and
adds one conditional `scanDicom`. `hits` is only ever appended to, so the **hit set, the totals and
the exit code** are a strict superset on every input. The by-name branch's own justification - that a
`.md` whose first bytes look like group `0002` must not lose `scanEmbeddedObjects` - was an argument
against an exclusive **swap**, and there is no swap.

Rows 4, 10 and 11 of the table are that claim under measurement rather than under assertion: each is
a file whose only detectable name is behind a halt, and each is still exit 1.

### Why this was one slice and not two

The item names two `PRE-EXISTING` residuals. They were treated as **two slices**, and only the first
is closed:

- **Dispatch** (closed here) is a **deletion** whose superset is structural. It adds no output, no
  new diagnostic field, and no new false-positive surface beyond `scanDicom` running on bytes that
  are a DICOM object.
- **`scanDicom` reporting nothing about bytes it never read** is an **addition**: a new diagnostic
  surface, and `documentation/repos/dicom/diagnostic-phi-traps.md` opens on the rule that a
  diagnostic about a PHI leak is itself a PHI surface. It has to decide what a halt disclosure says,
  whether it moves the exit code, and what it costs on a corpus of conformant files carrying
  undefined-length Sequences. Mixing an addition into a deletion-only remedy would forfeit the one
  property that makes this one safe to reason about.

They also fail differently. This one is about **which sweep reads the bytes**; the sibling is about
**what the sweep says when it stops**. `#102` already mitigated the sibling by putting the text sweep
behind every Part 10 object, so the two do not have to land together to close a leak.

### What is still open

- **`scanDicom` STILL REPORTS NOTHING ABOUT THE BYTES IT NEVER READ.** Unchanged, and the reason it
  is unchanged is above. A value past the halt that is neither `FAMILY^GIVEN` nor an eight-digit date
  run is still invisible - an MRN and an institution name among them.
  **▶ CLOSED SINCE, as its own slice, in `documentation/agent-notes.md#dicom-phi-scan-unread-tail`. The REPORTING is what
  closed: the walk is unchanged, so the sentence above about what is invisible still stands.**
- **The `hits` array is still unbounded IN MEMORY** (`#104`'s residual). Untouched. This slice can
  only add hits, so it moves that surface in the wrong direction on a corpus that has any; it is
  disclosed rather than claimed away, and it is zero on this corpus.
- **The recognizers are unchanged.** Widening the walk and widening the recognizer are two different
  changes. Nothing here teaches the scanner an MRN, an accession number, an institution name, a phone
  number, an email address, an SSN or a vendor UID root.

### For the next worker

- **The probe is 11 objects x 7 extensions and it is worth rebuilding rather than trusting this
  table.** Every object was verified through `@cosyte/dicom`'s **own parser** before any zero it
  produced was believed - `parseDicom` read each planted value back - because a generator is an
  instrument and `#102` caught two of its own wrong.
- **Reverting `scripts/phi-scan.ts` alone turns 11 tests red.**
- **Do not use a text extension to disable the DICOM route in a test.** One pre-existing control did
  (`"the payload is invisible to the text sweep"` wrote the bytes as `.txt` and expected exit 0), and
  that method **is** the defect. It now disables the route by CONTENT - one byte in front of the
  stream, so `fileMetaStart` answers `null` and every other byte, including the name, stays put - and
  it pins the unshifted bytes under the same name as a hit, so the control cannot pass by asserting
  the leak.

---

<a id="dicom-phi-scan-regex-statics"></a>

## The scan route hands no target bytes to a `RegExp`

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited:
> derived headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. Derive it, never restate
> it: `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> size hook (since retired, with the budget). `documentation/agent-notes.md` is **257,209 B, over its 250,000
> ceiling** on `main`, so this record is here instead. **No trap deleted, no ceiling raised.**
> What points at it is `scripts/phi-scan.ts` and `scripts/measure-phi-scan-regex-statics.ts`, which
> are unbudgeted and cite this slug. **No always-read file does.**

`DICOM-RESIDUALS`, `conformance-refuter` gate. Last verified 2026-08-09.

Closes the retention path `#110` disclosed and **left unmeasured**: *"V8's legacy `RegExp` statics
retain one subject string, bounded by the largest single file rather than the corpus."*

### Why this slice, out of the six that were open

The five others were each ruled out on the record rather than on preference:

- the **relocation** and **`position.contextPath`** are the `#81` mis-structure, where an
  over-declaring item and an under-declaring sequence are byte-identical. Both sanctioned cut-backs
  are refused standing;
- **`attributes[].tag`** is table-bound and `contextPath` is inert, so neither carries a payload;
- **`hits` as an array** has no remedy that is not a cap, and a cap makes the totals a claim about
  what was **kept** rather than what was **found**;
- **a flood burying a later hit within one entry** is a selection-policy change, the class that
  refused `#97`, `#104` and `#105`. Its only available remedy, the date-pass split, `#111` weighed
  and declined as growing the code to fit the claim. Re-taking it a slice later would be re-opening
  a decision, not closing a residual.

This one is the opposite shape, and for the same reason `#110` gave for taking its own slice first:
**the printed output is byte-identical to base**, so the net-leak class is structurally absent, and
the thing being closed is measurable. It was also the only open item nobody had put a number on.

### It is a PHI question, not only a memory one

V8 keeps the last successful match on the `RegExp` **constructor**: `RegExp.input` (`$_`) is the
whole subject string, `RegExp.lastMatch` (`$&`) is the matched text **verbatim**, and
`leftContext`, `rightContext`, `lastParen` and `$1` to `$9` sit beside them. These are ordinary
readable properties of a global object.

So the shape is worse than the retention framing `#110` used. `#109` bounded the hit line's excerpt
to 194 characters and `#110` made that excerpt own its bytes, and all the while
**`RegExp.lastMatch` held the same patient name UNEXCERPTED**, readable from anywhere in the
process, with the whole page behind it in `RegExp.input`.

### The fix, and why it is not a scrub

**The scan route hands no target bytes to a `RegExp`.** Seven sites moved to forward scanners and
character predicates: the three `scanText` recognizers, the tag route's pad trim, the
transfer-syntax NUL trim, `checkDate`'s eight-digit test, and the two-letter VR test in
`readElementExplicit` and `fileMetaStart`. The gate's own configuration was a different route and
was untouched **by this slice**; the section below measures what it left, and a later slice removed
it too (`documentation/agent-notes.md#dicom-phi-scan-config-parsers`), so **the script now constructs no `RegExp` at all.**

**Overwriting the statics after the scan was available and is not what was done.** A scrub is a
bound that holds only from where the cleanup is called, which this lineage has refused twice
(`#109`, `#111`): remove the slot, do not filter the value. There is no cleanup here because there
is nothing left to clean up.

`base64Runs` had already replaced a regex with a forward scanner **in this same file**, for an
unrelated reason (an 8 MiB run overflowed V8's backtrack stack). Same shape, same standard of
evidence: each function is a different REPRESENTATION of the pattern it replaces, never a wider or
narrower predicate.

**`isSpaceCode` writes out the whole of `\s`** rather than the subset a latin1 decode can reach.
Keying on what today's callers happen to decode would be a bound that holds only from the call
site, and it would go wrong silently the first time a caller decoded something else.

### Figures, all re-measured on the shipped artifact

Base `7fbc8e9` restored **by file copy**, never `git checkout`. Instrument shipped as
`scripts/measure-phi-scan-regex-statics.ts`.

| shape | base | here |
| --- | --- | --- |
| hit-free control | clean | clean |
| text PN, one small page | `input`, `lastMatch` | clean |
| text PN, 4 MiB page | `input` (4,195,860), `lastMatch` | clean |
| text ISO date, 4 MiB page | `input` (4,195,852), `lastMatch` | clean |
| text compact date, 4 MiB page | `input` (4,195,850), `lastMatch` | clean |
| tag PN + tag DA, Part 10 object | `input`, `lastMatch`, `rightContext` | clean |
| loud 4 MiB page, then a clean one | `input` (4,195,860), `lastMatch` | clean |

**6 of 7 shapes carried a token on base, 0 here.** The `rightContext` column on the Part 10 shape is
a carrier the first draft of the detector did not look for, which is why it looks for all ten.

**🛑 THE ZERO IS PINNED BESIDE A POSITIVE CONTROL.** The same observer over a child that does
nothing but match the same token reports `input, lastMatch`, and the instrument **throws instead of
reporting** if it does not. A detector that cannot fire is not a detector. Three further refusals
run before any number is printed: each scanner must behave like this package's phi-scan (the
wrong-package negative control), the hit-free control must scan clean, and every shape must produce
the hit lines it claims.

#### Equivalence, which is the other half

| | |
| --- | --- |
| cells (real corpus + adversarial + 32 fuzz corpora) | **34** |
| **cells differing from base in any byte** | **0** |
| cells that refused (exit 1) | 33 |
| hit lines compared | **9,283** |
| **MUTATION CONTROL, same cells, one character changed** | **17 cells differ** |

Whole output compared: stdout, stderr and exit code, byte for byte, no labelling and no class
counting, so a single differing byte is a violation.

### 🛑 The grid caught a defect in the remedy, and the defect is now the control

The first draft of `pnRuns` floored the trailing backtrack at `second + 1`, which lets the second
`[A-Za-z\-']+` hold nothing. On `ABC^D-` it matched `ABC^D`, where the pattern matches nothing at
all: **a hit the gate would have printed that the pattern never found**, in a scanner written to
change no hit. The adversarial cell reported it on the first run.

That one character is now the grid's mutation control and a named test case, so the zero above is a
clearance rather than a gap. **A generator is an instrument: it is verified before a zero it prints
is believed, and it ships so the figures can be re-run.**

### What the tests pin, and what they do not

- `test/integration/phi-scan-regex-statics.test.ts`: no carrier after a scan, **beside a positive
  control in the same file.** It is a subprocess because it has to be: the statics are overwritten
  by the next successful match anywhere in the realm, so an in-process assertion reads clean whether
  or not the scanner left anything behind.
- `test/scripts/phi-scan-matchers.test.ts`: the **patterns themselves are the oracle**, held in the
  test and run over the same bytes, across adversarial shapes and an 800-line seeded fuzz. The pad
  trim is pinned over **all 256 values a latin1 decode can end with**, in one object.

**🛑 5 of the 6 new test cases are GREEN ON BASE, BY DESIGN, AND THAT IS THE POINT.** They assert
base's behaviour is preserved, so a red one would mean the slice moved a hit. The figure that says
they are not vacuous is the mutation one: **3 of 6 go red on a one-character mutant** of `pnRuns`,
and the pad case goes red on dropping `0xa0` from `isSpaceCode`. Only the retention pin is red on
base, because only it asserts a property base did not have.

### 🔴 Not closed, and named rather than claimed away

- **✅ CLOSED by a later slice, and the figure below is the SUPERSEDED reading.** It is kept because
  it is what this slice measured, not because it is current: **the clean columns above now read
  `input 0`.** The gate's own CONFIGURATION was still a `RegExp` subject here, and the residual was
  visible in the numbers rather than described: every clean column above reads `input 3772`, which
  is the exact length in code units of `scripts/phi-allow-list.txt`. The remaining subjects were
  `process.argv`, the allow-list, `phi-scan-overrides.md` and `git diff --cached --raw` output.
  **Neither config file is inside `SCAN_ROOTS`** (`test`, `README.md`, `docs-content`), so the walk
  and `--staged` never reach either as a target. Unchanged **by this slice**; closed in
  `documentation/agent-notes.md#dicom-phi-scan-config-parsers`, which also re-measured the 3,772
  and found it is **code units, not the 3,774 BYTES** the file is on disk.
- `hits` is still unbounded as an array; the relocation, `contextPath` and `attributes[].tag` stand;
  a flood within one recognizer entry still buries a later hit; the never-draining-reader wait and
  `run-script.ts`'s 1 MiB `maxBuffer` are untouched by this slice in either direction.
- This slice says nothing about heap retention. `#110` closed the excerpt's copy; **the subject
  string is no longer held by a static, but nothing here measures the heap**, and inheriting
  `#110`'s figures for a different mechanism would be exactly the trap `#109` pass 2 was refused for.

---

<a id="dicom-phi-scan-report-cap"></a>

## dicom - `report()` printed one stderr line per hit, uncapped (2026-08-09)

`DICOM-PHI-SCAN-RESIDUALS`, the slice the `DICOM-SCANDICOM-SILENT-HALT` write-up deferred to an item
of its own. Written here rather than in `documentation/agent-notes.md` because that file is **over**
its 250,000-byte budget on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which is not a
line. Relocation is the remedy, never deleting an existing trap to make room and never raising the
ceiling. So the rule lives where a worker touching this code reads it: the JSDoc on
`DEFAULT_HIT_LINES_PER_RECOGNIZER` (this file's `DEFAULT_HIT_LINES_PER_FILE`, renamed when the budget
became per recognizer) and on `report`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: the hit report is capped PER FILE, and the cap cannot move the verdict"`, and this file.

**Provenance.** Every figure below is a measurement taken against base **`b784c38`**, quoted with
that sha and no other. The base column is reproducible with
`git show b784c38:scripts/phi-scan.ts > /tmp/base-phi-scan.ts && node /tmp/base-phi-scan.ts <path>`
run with `cwd=<repo root>`, since the script resolves its allow-list from `process.cwd()`.

### The defect, re-measured before it was built to

`report()` grouped hits by path and wrote one stderr line per hit with no bound. `#102` widened what
reaches it: the text sweep now runs over **every** Part 10 object's bytes, and its recognizers fire
on image noise at a rate that is a property of the payload's **byte histogram**.

**THE FILED FIGURE IS CONFIRMED IN MAGNITUDE AND IS NOT A CONSTANT.** The item carried
**71,122 hits per 8 MiB**. Re-measured on `b784c38` with a fresh generator and a different seed, the
same histogram produced **71,447**. Both are single draws over a random payload, so they are the same
finding and neither is a rate. **Do not quote either as a fact about the scanner.**

| 8 MiB `(7FE0,0010) OW` payload | base `b784c38` exit | hits | stderr lines | stderr bytes |
|---|---|---|---|---|
| uniform `0x41-0x60` (letters, the caret `0x5E` is inside the band) | 1 | 71,447 | 71,449 | 6,037,715 |
| uniform `0x30-0x3F` (4-bit-quantised region) | 1 | 849 | 851 | 80,872 |
| uniform `0x00-0x2F` (dark frame) | 0 | 0 | 0 | 0 |

**THE DARK FRAME IS THE NEGATIVE CONTROL AND IT IS LOAD-BEARING.** A run that emitted nothing on it
is what says the two loud rows are the payload's doing and not the harness's.

**🩺 THE GENERATOR IS AN INSTRUMENT AND WAS VERIFIED BEFORE ANY ZERO WAS BELIEVED.** `#102` caught two
of its own generators wrong (an LCG whose product exceeds 2^53 loses its low bits to float precision
and degenerates into structured bytes) and nearly shipped their zeros as findings. This one is
`Math.imul`-based xorshift32, and it **prints the realised histogram of every payload it writes**
before writing it: for the letters row, 32 distinct byte values spanning `0x41` to `0x60`, per-value
counts between 260,664 and 263,051, and 262,208 occurrences of the caret. A zero from a generator
that has not printed its own histogram is not evidence here.

### What shipped

A **print cap**, per file, defaulting to the constant, with `--max-hit-lines <n>` to
change it and `--max-hit-lines 0` to print every line. Same three payloads, same shas:

| payload | base lines | capped-default lines | `--max-hit-lines 0` lines |
|---|---|---|---|
| uniform `0x41-0x60` | 71,449 | 23 | 71,449 |
| uniform `0x30-0x3F` | 851 | 23 | 851 |
| dark frame | 0 | 0 | 0 |

**THE SUPERSET IS PROVED IN THE STRONGEST FORM AVAILABLE: `--max-hit-lines 0` REPRODUCES BASE'S
STDERR BYTE FOR BYTE** on all three payloads (`cmp` identical), and so does the **default** run on
the committed corpus and on any file whose hits fit under the cap. Nothing was removed from the
report. One thing was defaulted off, and it is one flag away.

### Why a cap is not a net leak here, which is the only question that matters

**A CAPPED REPORT THAT DROPS THE LINE NAMING REAL PHI IS A NET LEAK EVEN THOUGH NOTHING BROKE.** That
is the shape `#97` paid a blocker for, arriving in the output layer instead of the dispatch layer.
Three properties stop it, each pinned by a test:

1. **It is a PRINT cap and nothing else.** `main` derives the exit code from `hits.length` and the
   summary reports `hits.length`; neither is capped. A withheld line **cannot** turn exit 1 into
   exit 0 or shrink the number a reader sees. Pinned at `--max-hit-lines 1` over a 200-hit file:
   one line printed, exit **1**, and `OK - no hits` absent.
2. **It is PER FILE, never global.** A global cap is the net-leak shape: one flooding file consumes
   the budget and every later file's hits, including one naming an actual patient, go unprinted with
   the flooding file's path the only one on screen. Pinned by scanning a 200-hit flood **first** and
   a name-bearing file second, in paths mode so the order is the test's: both paths are named and
   the name is printed.
3. **The withholding is stated exactly.** The per-file line carries the exact remainder and the flag
   that prints it; the summary repeats the total withheld. Both are derived, never written down.

**AND THE COST IS STATED RATHER THAN CLAIMED AWAY: A WITHHELD LINE IS WITHHELD.** A hit naming a
person, sitting behind more hits than the cap in the same file, is **not printed by default**. The
run still refuses, the count still includes it, the file is still named, and `--max-hit-lines 0`
prints it. A test asserts exactly that, in both directions, rather than asserting nothing is lost.

**🛑 WHICH LINES SURVIVE IS SCAN ORDER, NOT FILE ORDER, AND THE OBVIOUS READING IS WRONG.** Measured:
with the person name at the start of an appended block and the DOB after it, the capped report prints
the **DOB** and not the name. "The first n hits" is not "the first n in the file".

**🛑 AN EARLIER DRAFT ENUMERATED THAT ORDER AND ARGUED FROM IT THAT PER-RECOGNIZER CAP SLOTS "BUY
COMPLEXITY AND NO SAFETY". A REFUTER FALSIFIED BOTH HALVES**: the enumeration omitted
`scanEmbeddedObjects`, which `scanTarget` runs after both of the routes it named, so the doc corpus's
embedded objects rank last and are withheld first; and the `0x30-0x3F` row above is a case where the
noise and the name are not the same class. **Both are DELETED rather than reworded**, per this repo's
standing rule. **Do not write either of them again**: the order is not enumerated here, and no claim
is made about what reserving slots would or would not buy.

### The false-positive spread, which is the reason none of this narrows the detector

**⚖️ THE RATE IS NOT ONE NUMBER: 0 to tens of thousands of hits per 8 MiB on payloads differing only
in which bytes they use.** The spread and its full table belong to
`documentation/agent-notes.md#dicom-scandicom-silent-halt`; it is named here only because a cap is exactly the place somebody
would be tempted to answer it by narrowing a recognizer instead. **Do not.** The trade is not
symmetric: a false positive costs a developer one look at a hit line, and the silent halt it replaced
printed `OK - no hits` over a patient name.

**IT IS ZERO ON THE CORPUS THIS GATE ACTUALLY READS, BECAUSE THE PACKAGE COMMITS NO `.dcm` FILES AT
ALL.** `pnpm phi-scan` exits 0 on base and exits 0 here, with byte-identical output. **So a green
local run says nothing about this fix, and the fix was not narrowed on the strength of one.**
**🛑 If imaging fixtures are ever committed here, that spread is the first thing to look at.**

### Residuals, disclosed and NOT closed

- **THE `hits` ARRAY IS STILL UNBOUNDED IN MEMORY.** This slice caps what is **printed**, not what is
  **accumulated**: one `Hit` object, holding the matched value as a string, is retained per hit for
  the life of the run. That is a deliberate boundary, not an oversight. The exit code and the totals
  are computed from that array, so capping it would make the count a claim about what was kept rather
  than about the corpus, which is the failure this whole script is written against. A bound with
  honest totals is a different change.
- **A TEXT EXTENSION IS STILL DISPATCHED BY NAME**, so a `.md` whose raw bytes are a DICOM object is
  never scanned as one. `PRE-EXISTING`, unchanged, its own slice.
- **`scanDicom` STILL REPORTS NOTHING ABOUT BYTES IT NEVER READ.** `PRE-EXISTING`, unchanged, its own
  slice.
- **THE NUMBER OF FILE HEADERS IS UNCAPPED**, on purpose. Capping the set of paths named is the
  net-leak shape in property 2, so the report grows with the number of hit-bearing FILES and not with
  the number of hits. That is the direction to keep if this is ever revisited.
- **THE BUDGET IS SPENT PER RECOGNIZER PER FILE NOW, NOT PER FILE**, so the figures above are a
  measurement of the per-file budget this slice shipped and are not re-derivable from the current
  tree. The rows headed `capped-default lines` are single-recognizer payloads, where the two policies
  agree; a mixed payload prints more here than the number in that column. Nothing above is retracted.
  `documentation/agent-notes.md#dicom-phi-scan-report-monotonicity` carries the change, the superset grid and its cost.
- **THE DEFAULT'S VALUE IS WRITTEN IN EXACTLY ONE PLACE**, the constant. No test and no prose here
  quotes it: the suite pins that a default run prints strictly fewer lines than an uncapped one over
  the same corpus while reporting the same total, which fails **closed** if the default is ever
  raised past the fixture's hit count.

---

<a id="dicom-phi-scan-report-monotonicity"></a>

## dicom - the PHI gate's print budget is spent PER RECOGNIZER (2026-08-09)

`DICOM-RESIDUALS`, the slice `documentation/agent-notes.md#dicom-phi-scan-report-cap` left open and `#109`, `#110` and
`documentation/agent-notes.md#dicom-phi-scan-unread-tail` each re-disclosed unchanged: **`report()` was not monotone at the
per-file cap.** Written here rather than in `documentation/agent-notes.md` because that file is over
its 250,000-byte budget on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Derive the headroom, never restate it: `git show origin/main:CLAUDE.md | wc -c` against this
repo's entry in the meta-repo's size hook (since retired, with the budget). It is a handful of bytes, which is not
a line. So the rule lives where a worker touching this code reads it: the JSDoc on
`DEFAULT_HIT_LINES_PER_RECOGNIZER`, on `RECOGNIZERS` and on `report`, the block in
`test/scripts/phi-scan.test.ts` under
`"phi-scan: the print budget is spent PER RECOGNIZER, so no class spends another's"`, and this file.

**Provenance.** Every figure below is a measurement on the tree that shipped, against base
**`7754a6c`** restored **by file copy**, never `git checkout`. **The grid and every count in it come
out of the committed instrument**, which prints them in one run:

```
git show 7754a6c:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
pnpm measure:phi-scan-monotonicity /tmp/base-phi-scan.ts
```

**The red-on-base test figure is NOT from that script** and says so where it is written. Nothing else
on this page is a figure.

### The defect

`report()` grouped a file's hits and printed the first `n` in scan order. That is one budget for the
whole file, and the file's routes do not append to it independently: **`scanDicom` appends before
`scanText` within a file, so how many of the text sweep's findings were printed was decided by how
many the tag walk had already made.** So ADDING hits could REMOVE a printed line. The text sweep's PN
recognizer is the only route that can see a caret-joined name in bytes the tag table never typed
(`#102`, `documentation/agent-notes.md#dicom-scandicom-silent-halt`), and it is the one at the end of the queue.

**IT WAS NEVER A FALSE GREEN AND IS NOT DESCRIBED AS ONE.** The exit code, the total, the set of files
named and the withheld count are computed off `hits` and were right throughout. What moved was
**which** lines a reader saw.

**AND THE ITEM'S OWN WORD FOR IT IS WIDER THAN WHAT ANY CAP CAN FIX.** See the section below: this
slice closes the cross-entry half and measures the rest rather than claiming it.

**WHY A 77-CELL CHECK WAS BLIND TO IT:** it never got a file above three hits against a default budget
of twenty. A cap that is never reached selects nothing.

### The fix, and where the bound lives

The budget is spent **per entry of a closed `RECOGNIZERS` table, per file**. A hit prints when its
index among that file's hits **from its own recognizer** is under the budget - a question no other
recognizer's findings are an input to.

**THE TABLE IS A TYPE, NOT AN ANALYSIS OF THE PUSH SITES.** Budgeting on `reason` would have been one
field cheaper and would not have been a bound: `reason` is assembled at the push site, so one future
recognizer interpolating a payload-derived token into it hands the payload a vote on how many classes
exist, and a per-class budget times an attacker-chosen class count is no budget. `Hit.recognizer` is a
union of four literals, so the per-file line bound is `n x |RECOGNIZERS|` and TypeScript refuses a
push site that does not name one. Same shape as `HitValue` in `#109`: **remove the slot, do not filter
the value.**

**THE `hits` ARRAY IS STILL NOT CAPPED, DELIBERATELY.** A cap there makes the totals a claim about
what was kept rather than about what was found. Unchanged, and not revisited.

**THE RECOGNIZER IS NOT PRINTED.** This slice answers a selection question, not a reporting one; the
hit line's fields and the suppression line are byte-for-byte the shapes they were. A diagnostic about
a PHI leak is itself a PHI surface, and a per-recognizer breakdown on the suppression line would be a
new one for no gain.

### 🛑 THIS IS NOT MONOTONICITY, AND CALLING IT THAT WAS THIS SLICE'S OWN REFUSED CLAIM

Pass 1 refused the sentence *"adding hits cannot remove a printed line"*, in the commit subject, the
changeset, a test name and this page. **Pass 2 then found it still in a fifth carrier - the header
comment over the test block - after the other four had been scoped**, which is this repo's own trap
arriving inside its remedy: a first pass that sweeps the VOCABULARY leaves the carriers still
carrying the CLAIM. It is DELETED in all five, never reworded. It is false, and not narrowly:

- **Under ANY budget that cuts it is unavailable** (`--max-hit-lines 0` does not cut). `n+1` hits
  from one entry print `n`. There is no
  print cap for which the general property holds, so no amount of partitioning would have made the
  sentence true.
- **Several sweeps share one entry**, so the shortfall is larger than "the same sweep twice".
  `scanText`'s ISO pass and its compact `YYYYMMDD` pass both push `textDate`, and `scanText` runs
  AGAIN on every object `scanEmbeddedObjects` decodes.

Re-measured on the shipped tree and on base `7754a6c` restored by file copy, **identical on both**:

| | base `7754a6c` | here |
|---|---|---|
| 200 ISO dates then 200 compact ones, default budget: ISO lines / compact lines | **20 / 0** | **20 / 0** |
| 19 ISO dates then one compact DOB: is the DOB printed | yes | yes |
| **20** ISO dates then one compact DOB: is the DOB printed | **no** | **no** |

So the compact pass, the only route that sees a bare eight-digit DOB, can print nothing at all while
the ISO pass spends the entry. **`PRE-EXISTING`, unchanged in both directions by this slice**, and now
pinned by a test rather than left to prose.

**Splitting the two date passes is available and was NOT taken here** - the claim was cut instead,
because growing the table would not have made the refused sentence true and this lineage has converged
only by deleting. **Splitting per embedded object is NOT available at all:** the number of objects on
a page is the payload's choice, and a per-class budget times a payload-chosen class count is no
budget.

**What IS closed, and it is the whole of what is claimed: one entry's budget cannot be spent by
another entry's findings.**

**Pass 3 (NOT REFUTED, and the ADR 0016 ceiling) found a SIXTH carrier - the word "monotonicity" as a
comment LABEL inside the block the pass-2 remedy had just swept.** Cut too. Three refuter passes and
five sweeps to get one sentence out of one slice is the measurement worth keeping: in this lineage a
phrase sweep that finds nothing on its first pass has not finished.

### The superset, which is the only question a selection-policy change gets asked

A selection-policy change is exactly the class that refused `#97`, `#104` and `#105`: routing
differently took a name from exit 1 to exit 0 once. So the claim is the strong one and it is
mechanical: **a hit that was among a file's first `n` overall is among its own recognizer's first
`n`**, so at every cap the printed set is a SUPERSET of base's. Nothing base printed goes unprinted,
which is what makes a net leak structurally unavailable here rather than merely unobserved.

Measured over the grid, both scanners run on byte-identical corpora at the same cap:

| | |
|---|---|
| cells (9 shapes x 8 caps) | **72** |
| **superset violations** | **0** |
| cells that refused (exit 1) | 64 |
| hit lines compared, base / here | **2,936 / 3,268** |
| cells printing strictly more than base | **29** |
| cells that withheld lines (a cut line) | 49 |
| cells with a recognizer at its ceiling | 50 |
| **cells where base STARVED a recognizer entirely** | **23** |
| largest cell, in hits | 803 |

Exit code, total, the set of files named, and `withheld == total - printed` are re-checked in every
cell and never differ.

**🛑 WHAT THE GRID'S LAST THREE COUNTERS CANNOT SEE, and the superset does not depend on it.** The
counters label a line by its printed REASON, and several sweeps share a reason, so `cells where base
STARVED a recognizer` cannot see one date pass starving the other. **The superset comparison is over
the raw hit DETAIL lines and uses no labelling at all**, so the 0 and the 332 stand whatever the
labels do. The starvation the counters miss is measured in the table above instead.

**🩺 THE ZERO IS PINNED BESIDE A POSITIVE THE DETECTOR DOES CATCH.** A grid that cannot fail reports
zero violations on anything. Run with the two scanners SWAPPED - base in the tree, the shipped one
passed as the base argument - the same 72 cells report **332 violations**. The detector fires.

**AND THE INSTRUMENT REFUSES BEFORE IT REPORTS:** each scanner handed to it must answer a bad
`--max-hit-lines` with this script's own message and exit 2 (the negative control against a sibling
package's file of the same name, which this shared-scratch environment has produced before); the
hit-free control must exit 0 with no hit lines; and every shape must produce a hit from each
recognizer it claims, so a shape that silently produced nothing cannot read as a clean cell. The
default budget is **derived from a run**, not written into the instrument as a numeral, so the
`default` rows are checked against a ceiling rather than skipped.

### What it costs, stated rather than claimed away

**A FILE'S REPORT CAN NOW BE LONGER.** The bound went from `n` lines per file to `n` per recognizer
per file. Measured at the default budget on the loudest shape in the grid: **20 lines on base, 61
here**, over a file carrying 803 hits. That is the price of the quiet recognizer's line being printed,
and it is bounded by a closed table rather than by the payload.

**⚖️ AND WITHIN ONE ENTRY A FLOOD STILL BURIES A LATER HIT.** A per-recognizer budget makes an
entry's budget its own; it does not make it infinite, and the section above says which parts of that
are closable and which are not. `--max-hit-lines 0` still prints every line, the total still counts
them, and tests pin both measurements.

### Tests

**Eight cases changed or added. Four are red on base `7754a6c`**, measured by restoring the base
scanner **by file copy** and re-running the suite. **Four are green on base by design** and are named
as such here so nobody quotes "eight tests" as "eight regressions caught": they pin what this change
must NOT move (the verdict, the totals, the files named, the withheld arithmetic), the two costs it
does NOT close, and the line shape it does not touch.

**🛑 AND ONLY TWO OF THE FOUR ARE RED ON THE DEFECT.** The other two are red on a NON-VACUITY guard
whose own half is green on base, which a second refuter pass caught this page under-stating as one:
the doubling case requires more than one printed REASON before it compares the two line counts (a
reason, not a recognizer - the guard can only see what the line carries), and at a budget of one on
base there is only one; the strengthened scan-order case requires
more lines printed than the flag's value, and on base there are exactly as many. **Both arithmetic
halves are green on base.** This is stated because "red on base" reads as "caught a regression", and
for two of these four it does not.

**No case writes the budget as a numeral.**

**🛑 AND THE FIRST DRAFT OF THE BOUND CASE PINNED THE SHORTFALL RATHER THAN THE BOUND.** It asserted
that each printed reason appears EXACTLY the cap times. That passes only because the two date passes
share an entry, so a correct split of them would turn it red: it was a guard against fixing the
residual above. **Deleted rather than reworded.** What is asserted in its place is the property a
reader actually depends on and that the output can carry: **doubling every flood prints the same
lines**, so past the ceiling the report stops growing with the hits and a payload cannot choose the
size of the diagnostic.

The one existing case that had assumed "printed == the flag's value" now reads the printed count off
the run: that assumption is precisely what a per-recognizer budget breaks, and writing the flag's
value there would have pinned an arithmetic the report does not do.

### Still open, and NOT touched by this slice

- **`hits` is still unbounded IN MEMORY.** Each entry is bounded (`#109`) and owns its bytes (`#110`);
  the array is not. Unchanged.
- **Within one entry of `RECOGNIZERS`, `report()` is still not monotone**, as above, and the two date
  passes plus every embedded-object sweep share entries. Measured, `PRE-EXISTING`, unchanged.
- **V8's legacy `RegExp` statics retain one subject string** (`#110`). Untouched: this slice adds no
  recognizer and no match.
- **A never-draining reader still makes the gate WAIT** (`#107`), and `test/helpers/run-script.ts`
  still inherits `spawnSync`'s 1 MiB `maxBuffer`. This slice moves the largest report UP, by the
  factor above, so it makes the second one easier to reach rather than harder. Bounded by a closed
  table, disclosed here, and not closed.
- **A CI job that reads only the exit code still cannot see an unread tail** (`#106`).
- The relocation, `position.contextPath` and `attributes[].tag` are parser-side residuals.

---

<a id="dicom-phi-scan-unread-tail"></a>

## `scanDicom` said nothing about the bytes it never read, so `OK - no hits` covered them

_`DICOM-PHI-SCAN-RESIDUALS`, 2026-08-09. Base `21d42f5`. The ADDITION half of that item; the
by-name dispatch (`#105`) was the deletion half, and the two did not land together on purpose.
See `documentation/agent-notes.md#dicom-phi-scan-name-dispatch` § "Why this was one slice and not two"._

**Provenance.** The spec claims are read from the SHA-pinned vendored copy at `vendor/nema/part05/`,
**PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every other figure is a
measurement taken on this repo against base **`21d42f5`**, quoted with that sha and no other. The
base column is reproducible with `git show 21d42f5:scripts/phi-scan.ts > /tmp/base-phi-scan.ts &&
node /tmp/base-phi-scan.ts <path>` run with `cwd=<repo root>`, since the script resolves its
allow-list from `process.cwd()`.

### The defect

`scanDicom`'s two walks each `break` at the first header they cannot read, and both `readElement`
helpers answered `ElementHeader | null`. Five distinguishable conditions therefore arrived at the
caller as ONE indistinguishable value, the caller had nothing to say about them, and it said
nothing. A file the tag table abandoned partway through produced the same `[phi-scan] OK - no hits`
as one it read end to end.

**The way in is CONFORMANT, which is what makes it worth a disclosure.** PS3.5 2026c §7.5.2 defines
`0xFFFFFFFF` as one of TWO Sequence delimitations, the encoder's choice, both of which "shall be
supported by decoders"; §7.1 orders tags ascending, so `(0008,1110)` precedes `(0010,0010)` in a
conformant file. Encapsulated `(7FE0,0010) OB` pixel data is the same shape.

**🛑 EXPLICIT VR BIG ENDIAN IS NOT A SECOND CONFORMANT ROUTE AND MUST NOT BE QUOTED AS ONE.** A
draft of this note said it was, and a refuter refused it against the pinned edition: PS3.5 2026c
§A.3's whole body is _"This Transfer Syntax was retired in 2006. For the most recent description of
it, see PS3.5 2016b."_, the UID `1.2.840.10008.1.2.2` appears **nowhere** in the document, and this
package's own generated `src/dictionary/generated/uids.ts` marks it `retired: true`. What is true is
the measurement, and it is worth keeping for a different reason: **`@cosyte/dicom`'s own parser
reads such an object with ZERO warnings and hands back both values**, while this scanner's tag walk
treats every transfer syntax other than `1.2.840.10008.1.2` as little endian and stops on it. **A
lenient parser's silence is not a spec verdict**, and reading it as one is how the word got written.
The conformance leg above rests on §7.5.2 alone and does not need this row.

**A guard that has never been pointed at an input has not cleared that input.** That is the
sentence, and it is the same one `#102` and `#105` were filed under.

### What the new output carries, and what it deliberately does not

Per file, one line on stderr:

```
[phi-scan] PARTIAL: <path>: the DICOM sweep stopped before the end of N object(s),
  leaving M byte(s) it never read: <reasons>
```

**CARRIES:** the file's own repo-relative path (the same locus every hit already carries), two
counts, and tokens from the closed `HALT_REASONS` table.

**DOES NOT CARRY:** no tag, no VR, no value, no byte of the object. The bytes at a halt are
precisely the bytes that did not read as a Data Element header, so a tag or a VR named off them
would be unvouched-for input, and the value bytes are the leak itself.

**🩺 "NO OFFSET" IS NOT ON THAT LIST, AND A DRAFT THAT PUT IT THERE WAS REFUSED.** No offset is
printed, but for a file holding one object `bytes` is `objectLength - haltOffset`, and the object's
length is the file's own committed size, so the halt offset is recoverable from the line. That is
the same locus a hit line already prints outright, beside a value. The honest statement is that the
two counts are structural positions rather than content, not that a position is absent.

**🛑 THE SLOT IS REMOVED, NOT FILTERED.** There is no string parameter for anything to travel
through: `recordUnread` takes a path, a number and a `HaltReason`, and `HaltReason` is a union over
six literals fixed at authoring time. That is the same shape as `entryKind` and `gitModeKind`
already in this script, and the same reason `warnings.ts` has no message parameter. A bound that
held only at the call site would not be a bound.

**Bounded in memory, which `hits` is not.** One `Map` entry per file, holding two numbers and a
`Set` that cannot exceed six members. An attacker-chosen object count moves the counts, not the
footprint. `hits` staying unbounded is this item's other open residual and is untouched here.

### The exit code does not move, and that is a decision with a cost

The banner's enumeration is **quoted from the banner rather than restated**, and this paragraph is
the reason: a draft wrote "0 clean" back into a comment four lines above the `return`, in the same
commit that cut the word from the banner, and gave exit 2 a second definition while it was there.
Read the banner for the current set. An unread tail is none of the non-zero codes in it: nothing was
found, and nothing refused the scan.

Two reasons it is not exit 2. It would fire on a file **§7.5.2 makes legal**, which is what "do not
add a code for a conformant file" means on this side of the package. And it would **mask a real
hit** whenever both were present, downgrading a detection to an invocation error.

**🔴 SO A CI JOB THAT READS ONLY THE EXIT CODE STILL CANNOT SEE THIS.** Open, disclosed, not argued
away. Making it visible to one is a change to this script's contract with every caller.

**🛑 THE BANNER LATER GREW A FOURTH CODE, AND IT IS NOT THIS ONE. DO NOT READ THE TWO AS THE SAME
RULE.** Exit 3 says the run was handed a target it ENUMERATED and then never OPENED, which today
means an `--allow-fixture` bypass an operator logged and passed. Everything the two paragraphs above
argue still holds for the unread tail, because the two cases differ in the only respect that decides
it: an unread tail is a file the scan **did** open, on an encoding the standard permits and nobody
asked for, so there is no caller to act on a refusal and no request to withdraw; a withheld target is
a file it opened **not at all**, on an explicit instruction that can be taken back. That is also why
3 rather than 2: the run that returns 3 opened every other target and its hit lines are real, where
an unlogged bypass returns 2 having opened nothing at all. The residual above is unchanged and
remains open.

**And the word `OK` is CUT rather than qualified.** With any partial file the clean line reads
`no hits, over a corpus in which the DICOM sweep stopped early in N file(s), listed on stderr. This
run is not an all-clear.` With none, it is byte-identical to what it always was. It says "on stderr"
and not "above" because the clean line goes to stdout and the `PARTIAL:` lines to stderr, so a
consumer capturing the two separately would read a locative pointing at nothing.

**🛑 THE COVERAGE SENTENCE IS NOT WRITTEN ANYWHERE, INCLUDING AS A SUPPORTING CLAUSE.** `scanTarget`
and `scanEmbeddedObjects` both run `scanText` unconditionally over the whole buffer, so "they were
swept anyway" is tempting; the sweep runs over `buf.toString("utf8")`, a lossy decode of arbitrary
bytes, and the text pass has **no tag table**, so it cannot see a single-component PN or the date at
the head of a `DT`. Neither half supports the sentence. A draft refused it in two places and then
deployed it as a parenthetical propping up "the scan did complete"; a refuter caught that, and the
parenthetical is cut. This paragraph is where the bounds live.

### The measurement

**13 objects x 5 carriers x 3 cap settings = 195 cells**, each one run of
`node <scanner> [cap flags] <path>` on base and on the shipped tree over byte-identical input.
Carriers: `.dcm`, `.md`, `.bin`, base64 inside a `.md` page, base64 inside a `.ts` source. Cap
settings: default, `--max-hit-lines 0`, `--max-hit-lines 1`.

|                                                                                         |               |
| --------------------------------------------------------------------------------------- | ------------- |
| exit code identical                                                                     | **195 / 195** |
| hit detail lines identical as a multiset                                                | **195 / 195** |
| output identical                                                                        | **60**        |
| output strictly larger (a `PARTIAL` line added)                                         | **105**       |
| output differs ONLY by the withdrawn `OK - no hits`, with a `PARTIAL` line in its place | **30**        |
| violations                                                                              | **0**         |
| cells printing a `PARTIAL` line                                                         | **135**       |

**The 30 are the ONE line this change removes, and the checker tests for exactly that** rather than
reading it off the table: a cell counts as a claim-cut only when the missing set is exactly
`{"[phi-scan] OK - no hits"}` with multiplicity 1, a `PARTIAL` line is present, and the replacement
line is present. Anything else in the missing set is a violation.

**The 60 identical cells are the detector-zero pin.** They are the four objects with no unread tail,
across all fifteen carrier/cap combinations, and **they are silent for TWO different reasons that
must not be collapsed**: three are complete walks that reach the last byte (an allow-listed object,
a name-bearing one, a recent-`DA` one), and the fourth is not a DICOM stream at all, so
`fileMetaStart` answers null and the DICOM route is **never entered**. A draft called all four "the
walk reads to the end", which is false for the fourth. The detector is silent exactly there and loud
on the other nine, in the same runs, so a zero is a measurement rather than a wiring failure.

Reasons observed, one object each: `an undefined-length value (0xFFFFFFFF)` (SQ, encapsulated pixel
data), `a value length that runs past the end of the object` (over-declare, and Explicit VR BE),
`a header whose VR field is not two uppercase letters`, `a header the remaining bytes cannot hold`
(eight bytes of a twelve-byte long-form header), `a tail too short to hold an element header`.

**`noAdvance` is unreachable and stays in the table as the defensive arm.** `nextOffset` is
`valueOffset + valueLength` and `valueOffset` is at least eight past the cursor, so the check that
predates this change cannot fire. It is named here so the next reader does not hunt for a fixture.

**The corpus is unmoved.** `node scripts/phi-scan.ts` with no arguments produces byte-identical
stdout and stderr before and after, and still exits 0. Measured with a probe on base: the all-mode
run reaches `scanDicom` **17 times** across seven `docs-content/` pages, and **all 17 read to the
last byte** (`end == objlen` on every one), so there is no `PARTIAL` line to print. **That zero is
pinned by the 135 cells that do print one**, not asserted.

**This is not a false-positive rate and there is none to quote here.** The rate is a property of a
payload's byte histogram, and this package commits no `.dcm` files at all. See
`documentation/agent-notes.md#dicom-scandicom-silent-halt`.

### The generator, verified before any zero it produced was believed

Every object was put through **`@cosyte/dicom`'s own `parseDicom`** and **classified by what the
parse produced, never by its label**: the well-formed ones had to read the planted value back, and
the malformed ones had to FATAL. That caught a real mislabel: `08-big-endian-dataset` was written as
`parses: false`, and the parser accepted it with **zero warnings** and both values readable. It is
**well formed under a RETIRED transfer syntax**, which is what the row above rests on, and the label
was corrected from the measurement rather than from the intent behind the fixture. Separately, every
planted value is asserted present in the RAW BYTES, so nothing is claimed about a value the
assembler never wrote.

**The generator is committed as `scripts/measure-phi-scan-unread.ts`**, so the table is
re-derivable rather than a figure only its author could produce. `pnpm measure:phi-scan-unread
[<base scanner path>]` prints the object verification, the row summary and the cell counts; with no
argument it verifies the generator and prints the reasons without a base comparison.

### Interaction with `#104`'s cap and `#105`'s non-monotone finding: none, and it is structural

`#104` capped **hit** lines per file, and `#105` found `report()` is not monotone in `hits` at that
cap, because `scanDicom`'s hits append before `scanText`'s. Neither can reach this line. It is not a
hit, it is written by a different function, and it is in no budget. Pinned at `--max-hit-lines 1`
over a file whose hits run to the hundreds: one hit line, the suppression line, and the `PARTIAL`
line all present; and with a second file behind it, both files' `PARTIAL` lines survive.

**It cannot flood, so it needs no cap of its own.** The output is bounded by the number of FILES.
A page carrying ten thousand halting objects prints ONE line with the count on it.

### What is still open

- **The exit code, as above.** A CI job reading only exit codes still sees a green.
- **🔴 A FILE-META HALT IS REPORTED ONLY IF THE DATASET LOOP ALSO STOPS AT THAT OFFSET, AND UNDER
  IMPLICIT VR LE IT MAY NOT.** Only the dataset loop records, so the file-meta loop's own halt is
  covered only when the second loop reaches the same verdict at the same offset. Under Explicit VR
  the two agree, because they call the same reader; `readElementImplicit` is a different predicate
  set, so the same bytes can report a DIFFERENT reason, or read as a header and let the walk
  continue past the offset the File Meta group gave up at, reporting nothing. Measured on two
  objects differing only in the transfer-syntax UID. Stated, not closed: the remedy is to record in
  the file-meta loop too, and that is a second disclosure with its own shape.
- **`hits` is still unbounded IN MEMORY.** Untouched. This slice adds no hits at all, so it does not
  move that surface in either direction.
- **A hit line still echoes the violating `value` unbounded.** Untouched.
- **The recognizers are unchanged.** Widening the walk's REPORTING and widening the recognizer are
  different changes. Nothing here teaches the scanner an MRN, an accession number, an institution
  name, a phone number, an email address, an SSN or a vendor UID root. **`PARTIAL` on a file is not
  a finding, and no `PARTIAL` on a file is not a clearance of it either.**
- **The walk itself is unchanged.** This slice says what the walk did not read; it does not read
  more. Teaching `scanDicom` to descend an undefined-length Sequence is a separate change with its
  own false-positive surface, and it is deliberately not made here.

### For the next worker

- **Rebuild the matrix rather than trusting the table**, and it is one command:
  `git show 21d42f5:scripts/phi-scan.ts > /tmp/base.ts && pnpm measure:phi-scan-unread /tmp/base.ts`.
  13 objects x 5 carriers x 3 cap settings, comparing exit code, hit-line multiset and output-line
  multiset per cell.
- **Reverting `scripts/phi-scan.ts` alone turns 9 tests red**, measured on `21d42f5` over the suite
  as it stands after this slice. **No count of the new cases is written beside it** - a draft said
  "eleven" where the block holds ten, and a numeral that has been wrong once in an index is cut
  rather than corrected. The two cases green on base by design are the non-vacuity control and the
  byte-identical clean line.
- **The clean line is the assertion that moves.** One pre-existing case (`#102`'s
  `"a preamble-FUL object whose payload is allow-listed is still clean"`) asserted `OK - no hits`
  over an object carrying an undefined-length `SQ`. That assertion WAS the other half of this
  defect, and it is corrected rather than deleted: same exit code, no `OK`.

---

<a id="dicom-phi-scan-value-excerpt"></a>

## dicom - a hit line echoed the violating value UNBOUNDED (2026-08-09)

`DICOM-RESIDUALS`, one of the six residuals the item still carried. Written here rather than in
`documentation/agent-notes.md` because that file is **over** its 250,000-byte budget on `main` and
the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped, no ceiling raised, no trap deleted.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Measured on this base: the file is 39,544 bytes against a 39,550-byte ratchet, so there
are **six bytes of headroom**, which is not a line. (Read the two numbers together. "`CLAUDE.md` has
6 bytes" is a misreading of this figure and is false; the file is 39 KB.) So the rule lives where a
worker touching this code reads it: the JSDoc on `MAX_HIT_VALUE_LENGTH`, on `excerptValue` and on
`report`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: a hit line echoes an EXCERPT of the value, bounded at construction"`, and this file.

**Provenance.** Every figure below was measured against base **`4984a96`**, quoted with that sha and
no other. Restore the base scanner **by file copy**, never by checkout:
`git show 4984a96:scripts/phi-scan.ts > <scratch>/base/phi-scan.ts`, then
`node <scratch>/base/phi-scan.ts <path>` with `cwd` set to a repo root, since the script resolves
its allow-list and its corpus from `process.cwd()`.

### The defect

`report()` wrote `value=${JSON.stringify(h.value)}` and `h.value` was a `string` off the payload.

**IT WAS THE ONLY UNBOUNDED PAYLOAD-DERIVED SLOT ON THE LINE, AND THE ONLY ONE WHOSE SIZE THE
PAYLOAD CHOSE.** `path` is the path the enumeration chose; `tag` is `tagDisplay`'s rendering of two
16-bit numbers; `offset` is a position; `reason` is one of this file's own literals; `vr` is a
literal at each `hits.push` and never the two bytes off the wire. `value` is the bytes. An element
declares its own length, so a `(0010,0010)` claiming the rest of the object put the rest of the
object - other elements' values, pixel data, whatever follows - on one stderr line, to say that a
name was not on the allow-list. **A diagnostic about a PHI leak is itself a PHI surface.**

Measured on base, one hit line per cell:

| value | base line length | after |
|---|---|---|
| text `PN` token, 1 MiB | **1,048,640 chars** | 281 |
| `(0010,0010) PN`, 65,000 chars | 65,066 | 281 |
| `(0008,002A) DT`, 65,000 chars | 65,083 | 298 |
| `(0010,0010) PN` inside a base64 doc fixture, 65,000 chars | 65,066 | 281 |

**Three of the six push sites can exceed the bound** (the `PN` and `DT` tag routes, and the text
sweep's `PN` token). The other three are held under it by their own recognizers: the two text date
passes match a fixed-width run, and `checkDate` refuses a `DA` value that is not exactly eight
digits. **That analysis is written down and is NOT what the bound rests on** - it is a fact about
what each caller happens to pass today, which is exactly the kind of bound this lineage has watched
relocate to a sibling.

### The remedy: the SLOT, not the printer

`Hit.value` is no longer a `string`. It is `HitValue`, a branded pair of the excerpt and the length
the value had, and `excerptValue()` is the only thing that makes one.

**Truncating inside `report` would have been a bound that holds only from where the printer is
CALLED** (`#93`): the hit would still carry the whole payload, and the next consumer of `Hit.value`
- a second printer, a summary line, a JSON mode - would start from an unbounded string again.

**THE TYPE IS THE ENFORCEMENT, AND IT WAS VERIFIED RATHER THAN ASSERTED.** Reverting one of the six
push sites to the raw string it used to pass fails the build:
`scripts/phi-scan.ts(1307,9): error TS2322: Type 'string' is not assignable to type 'HitValue'`,
and restoring it is green again. A test pins the arithmetic the compiler cannot state: the number of
`hits.push({` sites equals the number of `value: excerptValue(` sites.

### Where 194 comes from, and the UNIT that a refuter caught

**PS3.5 2026c Table 6.2-1, the `PN` row.** The sentences were located by the rule this repo pays
for: every `<tr>` of `table_6.2-1` was collected and **exactly one** contains all three of
`64 chars maximum per component group`, `up to 3 groups of components` and
`no more than two component group delimiters`; its first cell is `PN`. `3 x 64 + 2 = 194`, and `PN`
is the longest of the three VRs this scanner reads.

**🛑 AND THAT NUMBER IS IN CHARACTERS, WHILE THIS BOUND IS IN `String.length`. PASS 1 REFUTED THE
CLAIM BUILT ON MISSING THAT, AND IT WAS FALSE IN FOUR ARTIFACTS AT ONCE.** The draft said *"a single
conformant value prints WHOLE and its line is byte-identical to base"*, and qualified it with an
enumeration of two escape hatches. The `PN` row's length cell cross-references **`note_6.1-2-1`**,
which is where the unit is: the lengths of VRs whose Character Repertoire can be extended or
replaced are `expressly specified in characters rather than bytes`, *because the mapping from a
character to the number of bytes may depend on the character set*. Located the same way: the
sentence occurs **exactly once** in `part05.xml`. This script has no such unit - the tag route
decodes latin1, so it counts **bytes**, and the text route counts **UTF-16 code units**.

**🛑 AND PASS 2 REFUTED THE FIGURES THAT FIRST STOOD HERE, WHICH IS THE SAME DEFECT ONE LEVEL IN.**
The counter-example was re-measured rather than inherited, but on a PROBE fixture, and then the
figures were written beside a TEST that builds a different `PN` (the probe put a `^` inside the
ideographic and phonetic groups, which is 4 bytes cheaper). Three of five numerals were wrong.
**The figures below are measured on the fixture the committed test ships, and nothing else.**
A single-valued, conformant `(0010,0010) PN` of exactly three 64-character component groups under
`(0008,0005) ISO_IR 192`:

| | |
|---|---|
| characters | **194** |
| bytes on the wire | **450** |
| base line | 516 chars, whole value |
| here | 279 chars, **`[+256 not printed]`** |

**A BYTE FIGURE IS A FACT ABOUT THAT FIXTURE AND NOT ABOUT THE CLASS** - a conformant 194-character
`PN` has no one byte length, it depends on the characters - so no byte numeral is written in the
JSDoc at all, and the test asserts `wire.length - bound` with both terms derived.

**So 194 bounds what the report prints and says NOTHING about what the standard admits.** The
sentence is deleted rather than re-worded, in all four carriers, and the counter-example is pinned
as a **test** rather than as a disclosure (`"🛑 CUTS A CONFORMANT 194-CHARACTER PN"`), because a
shape in the harness is what this repo asks for in place of a sentence.

**THE WITHHELD AMOUNT THEREFORE CARRIES NO UNIT** - `value="..." [+64806 not printed]`. It was
`char(s)`, which was wrong on both routes. The unit is named once, exactly, on `excerptValue`.

**THE PRINTED FIELD IS BOUNDED, WHICH IS THE NUMBER THAT MATTERS.** `JSON.stringify`'s longest
expansion of one unit is a six-character escape, measured rather than assumed: 194 NULs and 194
lone surrogates both render as a **1,166-character** field, a doubled quote as 390. So the field is
at most `6 x 194 + 2` however many bytes the element declared.

### The superset proof: 30 cells, 0 violations

**A CAP IS A CANDIDATE NET LEAK** (`#97`, `#104`), so the grid runs **base and fixed side by side**
over both dispatch routes and compares exit code, stdout, the `N hits across M file(s)` summary, the
set of `HIT:` paths, the number of hit detail lines, and every line's tag, VR, offset and reason.

Cells: `{10, 193, 194, 195, 1000, 65000}` characters x `{text .txt, (0010,0010) PN .dcm,
(0008,002A) DT .dcm, base64 object in a .md}`, plus a 1 MiB text value, a 60,000-character `.dcm`,
a six-file corpus, an invocation error, `--max-hit-lines 1` over a 200-hit flood, and this
repository's own committed corpus.

**Result: 30 cells, 0 violations. 19 hit lines byte-identical, 30 excerpted.** In every cell the
exit code, the totals and the set of files named are **equal to base**; every excerpt is a **prefix**
of what base printed; and every withheld count equals `base length - 194` exactly. The committed
corpus is **byte-identical on stdout AND stderr, exit 0 both**.

**The `--max-hit-lines 1` cell is byte-identical**, which is the interaction with `#104` stated
rather than assumed: the excerpt shortens a line, the cap decides how many lines there are, and
neither reads the other.

**The harness was verified before its zeros were believed, and its first version was wrong.** It
parsed a hit line with one greedy regex, so a `DT` line's reason (`(>= 1906)`, parentheses) was read
as part of its value field and **three cells reported false violations**. The committed test helper
carries the fixed parser, which walks the JSON string to its closing quote.

### What is pinned, and what is green on base

Eight cases. **Seven are red on base `4984a96` and green here.** The eighth - *"cannot move the
verdict, the totals or the set of files named"* - is **green on base too, deliberately**: it pins a
property base already had and this change must not lose. It is named here so nobody quotes
"8 tests" as "8 regressions caught".

**No case writes the bound as a numeral.** Each derives it from a run that actually cut a value and
then places the two boundary cases either side of it, for the reason `#104`'s cases do not name
their default: a numeral copied into a test is a second source of truth that drifts from the
constant.

### Still open, and NOT touched by this slice

- **`hits` is still unbounded IN MEMORY.** Each element of it is now bounded; the array is not.
  Capping it would make the totals a claim about what was kept rather than about the corpus, which
  is the net-leak shape one level down (`#104`).
- **`report()` is still NOT MONOTONE at the per-file cap** (`#105`): `scanDicom`'s hits append
  before `scanText`'s, so a flooding file can push a caret name off the default report. Unchanged
  here in both directions; this slice shortens lines and never reorders them.
- **A never-draining reader still makes the gate WAIT** (`#107`), and `test/helpers/run-script.ts`
  still inherits `spawnSync`'s 1 MiB `maxBuffer`. This change makes the second one much harder to
  reach - the largest line the grid produced fell from 1,048,640 to 298 - but it does
  **not** close it: the number of lines is still unbounded.
- **The relocation, `position.contextPath` and `attributes[].tag`** are parser-side residuals and
  are untouched.

---

<a id="dicom-phi-scan-value-retention"></a>

## dicom - the PHI gate's hit excerpt now OWNS its bytes (2026-08-09)

`DICOM-RESIDUALS`, the slice `documentation/agent-notes.md#dicom-phi-scan-value-excerpt` deferred in its own words: _"V8 returns
a sliced string from `raw.slice(0, 194)`, which retains its parent. So `HitValue.text` is bounded
logically while the hit may still retain the whole payload in memory."_ Written here rather than in
`documentation/agent-notes.md` because that file is over its 250,000-byte budget on `main` and the
hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Derive the headroom, never restate it: `git show origin/main:CLAUDE.md | wc -c` against this
repo's entry in the meta-repo's size hook (since retired, with the budget). It is a handful of bytes, which is
not a line. So the rule lives where a worker touching this code reads it: the JSDoc on
`excerptValue`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: a hit does NOT retain the payload its excerpt was cut from"`, and this file.

**Provenance.** Every figure below was measured on the tree that shipped, against base **`88be779`**
restored **by file copy**. **The two tables and the grid, and nothing else, come out of the committed
instrument**, which prints all three in one run:

```
git show 88be779:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
pnpm measure:phi-scan-retention /tmp/base-phi-scan.ts
```

**The other figures on this page are NOT from that script and are not claimed for it** - the
discarded-instrument readings, the `RegExp.input` probe and the red-on-base test figure each say
where they came from where they are written. A first draft of this page said "every figure" was
re-derivable by that one command, which was false of five of them, and **the sentence was cut rather
than the script grown to make it true.**

### The defect

`excerptValue` cut the value with `raw.slice(0, MAX_HIT_VALUE_LENGTH)`, and the value it was handed
was itself either a regexp match against a file's whole decoded text or a trimmed decode of an
element's declared span. **V8 answers both with a string that points into its parent.** So a 19
character name matched inside an 8 MiB page produced an excerpt whose 19 characters kept the 8 MiB
page alive for the rest of the run, and `hits` lives for the whole run.

**BOTH BRANCHES LEAKED, AND THE SHORT ONE IS THE EASY ONE TO MISS.** The truncating branch is the
obvious carrier, but a value already under the bound is returned unchanged, and a regexp match under
the bound is a pointer too. Fixing only the branch that cuts would have left the text sweep's PN
route, which is the route that finds names, retaining exactly as much as before.

### The instrument, and why the obvious one reads zero

`scripts/phi-scan.ts` is synchronous from its first line to its last, so **nothing on its event loop
runs while it is scanning.** A `setInterval` sampler preloaded into it fires once before the scan and
once after it, when `hits` is already unreachable; both readings are about an idle process. That was
measured, not assumed: the first sampler built for this slice reported the same 5.1 MiB for a 16 MiB
corpus and for a 160 MiB one, which is what a sampler that never fires looks like.

**A GENERATOR IS AN INSTRUMENT.** Three further readings, each taken by a throwaway harness during
this slice and none of them re-derivable from the committed script, were discarded for the same
class of reason before the shape below was settled on, and each is worth knowing:

- **`--max-old-space-size` does not bound this at all.** A string produced by `Buffer.toString()` is
  counted in `process.memoryUsage().external`, not in `heapUsed`, and the old-space limit does not
  apply to it. Base finished a 80 MiB corpus under `--max-old-space-size=16`. **The retained payload
  is invisible to the heap limit**, which makes it harder to notice rather than safer.
- **Peak RSS is swamped by garbage.** Polling `/proc/<pid>/status` VmHWM separated base from the fix
  by 16 MiB on a corpus where the real difference is 64, because a hit-free control already read
  159.5 MiB of uncollected transient.
- **An at-exit reading measures garbage too.** Without a forced GC it reported an `external` that
  went DOWN as the corpus grew.

What works: preload an observer that hooks `fs.readFileSync`, so it runs **inside** the scan, once
per file, with `hits` live, and force a full GC before reading `process.memoryUsage()`. The observer
lives in the test and in the measurement script; `scripts/phi-scan.ts` is not touched and runs
exactly as it ships.

**🩺 THE INSTRUMENT IS VERIFIED BEFORE ANY NUMBER IT PRINTS IS BELIEVED, AND EACH TABLE VERIFIES WHAT
ITS OWN CONCLUSION NEEDS.** The **first** table, whose conclusion is about growth with corpus size,
scans every corpus twice: once with one PN-shaped token per file, and once byte-for-byte the same
size with no token in it. That second run is the negative control, and it is what says a retention
difference is the doing of the hits rather than of the corpus; the harness throws rather than reports
if the positive corpus does not produce one hit per file, if the observer did not fire once per file,
or if the control is not clean. **The second table has NO control and needs none**, because its
conclusion is a base-against-shipped delta over byte-identical corpora with equal hit counts; it
asserts only that the loud pages produced many hits and that the observer fired once per file. **That
distinction is written down because the sentence above it was once a universal, and the second table
falsified it the moment it was added.**

### What it measures

Retained peak, forced GC, sampled once per file during the scan:

| corpus               | base `88be779` | shipped  | hit-free control, base / shipped |
| -------------------- | -------------- | -------- | -------------------------------- |
| 2 x 8 MiB = 16 MiB   | 34.0 MiB       | 33.6 MiB | 26.0 / 25.6 MiB                  |
| 5 x 8 MiB = 40 MiB   | 58.0 MiB       | 33.6 MiB | 26.0 / 25.6 MiB                  |
| 10 x 8 MiB = 80 MiB  | 98.0 MiB       | 33.7 MiB | 26.0 / 25.7 MiB                  |
| 20 x 8 MiB = 160 MiB | 178.0 MiB      | 33.7 MiB | 26.0 / 25.7 MiB                  |

**Base grows by one whole file per hit-bearing file. The shipped tree does not grow at all.** Three
repeats of every cell agreed to the tenth of a MiB. **At two files the two trees read the same**, and
that row is kept rather than dropped: the fix buys nothing on a small corpus, and a table that only
showed the loud rows would be arguing rather than reporting.

### 🔴 The direction the copy COSTS on, which the table above cannot show

That table is the favourable axis: few excerpts, large pages. The unfavourable one is many hits
inside each page, where a resident copy of up to the excerpt bound replaces a resident pointer, and
the `hits` array is still unbounded. Five 8 MiB pages of back-to-back PN tokens:

| token length        | hits      | base `88be779` | shipped   |
| ------------------- | --------- | -------------- | --------- |
| 200, over the bound | 208,675   | 82.3 MiB       | 87.2 MiB  |
| 20, under the bound | 1,997,290 | 292.3 MiB      | 280.2 MiB |

**It goes both ways and it is small in both**, which is why it is a row rather than a redesign: over
the bound the copy costs 4.9 MiB on 82.3, and under it the copy is CHEAPER than the pointer it
replaced by 12.1 MiB on 292.3. What is unchanged is the kind of thing retained: excerpts, never
whole payloads.

**🩺 THE FIRST DRAFT OF THIS TABLE READ FLAT AND IT WAS THE INSTRUMENT, NOT THE RESULT.** It used ONE
loud file, and the observer fires as a file is READ, before that file has contributed a hit, so the
only sample it took was of an empty `hits`. It printed 25.9 MiB against 25.6 MiB, a difference
indistinguishable from the baseline, and it would have shipped as "no cost". The largest sample of
an `n` file corpus sees `n - 1` scanned files; every row here uses five.

### The shape, which is the same one `#109` used

The copy is inside **`excerptValue`, the only constructor of `HitValue`**, so it is on the slot and
not on a caller. There is no `hits.push` that can put a pointer-into-a-payload on a hit, for the same
reason there is none that can put an unbounded string on one.

**The round trip is `utf16le`, and `utf8` would have been a silent value corruption.**
`Buffer.from(s, "utf8")` turns an unpaired surrogate into U+FFFD, so the report would print a
character the file does not contain, which is the same class of wrong answer as printing too much.
`utf16le` round-trips all 65,536 code units, paired or not. **That no caller can hand this an
unpaired surrogate today is exactly the reasoning this slot exists to not depend on.**

**🛑 AND NO TEST DISCRIMINATES THE THREE ENCODINGS, WHICH IS SAID HERE RATHER THAN LEFT TO BE
INFERRED FROM A CASE NAMED FOR THEM.** Nothing reachable through the CLI can carry an unpaired
surrogate: the tag route decodes latin1 and the text sweep's recognizers match ASCII, so `latin1`,
`utf8` and `utf16le` all round-trip every value this scanner can produce identically. The suite pins
that the excerpt equals the value's own first characters over the whole latin1 alphabet; the choice
of `utf16le` is an argument about the slot, and this page does not dress it as a measurement.

### The superset, in the strongest form available

**42 of 42 grid cells byte-identical to base on exit code, stdout AND stderr; 0 violations.** The
grid crosses six routes (tag PN, tag DA, tag DT, text PN, text dates, embedded object) with five
value lengths either side of the bound and three cap settings, plus a clean corpus per cap.

**NON-VACUITY IS PRINTED, NOT ASSUMED: 39 of the 42 cells exit 1, 47 hit lines are printed, and 18 of
them carry a cut value.** A grid whose cells printed nothing would read identical on every one.

**PROVED BY MUTATION.** Cutting one character less (`MAX_HIT_VALUE_LENGTH - 1`) takes the grid from
42 identical to **24 identical and 18 violations**. The grid can see a changed value.

**And the loud case, taken by hand rather than by the instrument** (a one-off harness in a scratch
directory, not committed, and named as such). An 8 MiB `(7FE0,0010) OW` payload uniform over
`0x41-0x60` produced **71,734 hits** with `--max-hit-lines 0`: stderr is **byte-identical** between
the two trees (6,063,059 bytes, `cmp` clean), and the wall clocks overlap across three runs each.
**No ratio is quoted, and 71,734 is a fourth draw of a spread that is not a rate** (the item already
carries 71,122 / 71,447 / 71,525, and a dark frame reads 0).

### The tests, and which of them run red on base

Three cases. **One is the property and it goes red on base**: nine hit-bearing files must not cost
more retention than three, and on `88be779` six more files cost **12,626,394 bytes** against a
threshold of one file (read off the failing assertion with the base tree restored by file copy, not
from the instrument). **The other two are green on base by design and are named as such** rather
than counted as evidence: the detector-zero control (the filler alone is hit-free, so the difference
is the hits' doing) and the round-trip fidelity case, which guards the new copy and has nothing to
regress on a tree without it.

**No case writes down how many bytes a run may hold.** The claim is a shape, not a size, so the
assertion is a difference between two corpus sizes; `pnpm measure:phi-scan-retention` prints the
sizes. **The suite's own scanner path is this repository's**, so a test cannot be pointed at a base
tree; a base reading is taken by restoring `scripts/phi-scan.ts` by file copy and re-running.

### 🔴 Residuals, disclosed and NOT closed

- **⚠ V8's legacy `RegExp` statics retain ONE subject string, and that is why the shipped column is
  not the control.** `RegExp.input` holds the last successfully matched subject, so one file's whole
  decoded text stays alive after its scan regardless of anything `Hit` does. Measured by a one-off
  probe rather than by the committed instrument, which has no row for it:
  after a match on an 8 MiB subject, with every local reference dropped and a forced GC,
  `RegExp.input.length` reads 8,388,628. It is what the constant 8 MiB gap between the shipped
  column and the control is, and the gap tracked file size exactly across 2, 4, 8 and 16 MiB files.
  **Bounded by the LARGEST SINGLE FILE, not by the corpus.** Its own slice if ever; the obvious
  remedy is a throwaway match after each file, which is a bound holding only from where it is
  called.
- **The `hits` ARRAY is still unbounded.** Each element is now bounded in what it prints AND in what
  it holds; the array is not. Capping it would make the totals a claim about what was kept rather
  than about the corpus, which is the net-leak shape `#104` refused.
- **`report()` is still NOT MONOTONE at the per-file cap** (`#105`). Untouched here in both
  directions: this slice changes no printed byte.
- **A never-draining reader still makes the gate WAIT** (`#107`), and `test/helpers/run-script.ts`
  still inherits `spawnSync`'s 1 MiB `maxBuffer`.
- **The relocation, `position.contextPath` and `attributes[].tag`** are parser-side residuals and are
  untouched.

---

<a id="dicom-scandicom-silent-halt"></a>

## dicom - `scanDicom` halted SILENTLY behind a preamble, and no text sweep followed (2026-08-08)

`DICOM-SCANDICOM-SILENT-HALT`, filed `PRE-EXISTING` and surfaced by `#97`'s refuter pass. Written
here rather than in `documentation/agent-notes.md` because that file is **over** its 250,000-byte
budget on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which is not a
line. Relocation is the remedy, never deleting an existing trap to make room and never raising the
ceiling. So the rule lives where a worker touching this code actually reads it: the JSDoc on
`scanTarget` and on `base64Runs`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: a preamble-FUL object's silent halt"`, and this file.

**Provenance.** The spec claims are read from the SHA-pinned vendored copy at `vendor/nema/part05/`,
**PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every other figure is a
measurement taken on this repo against base **`21e25a0`**, quoted with that sha and no other. The
base column is reproducible with `git show 21e25a0:scripts/phi-scan.ts` run with
`cwd=<repo root>`, since the script resolves its allow-list from `process.cwd()`.

### The defect

`scanTarget` ran the text sweep under `if (!isDicom(buf))`. That made the sweep an `else` for a
preamble-**ful** Part 10 object, and `scanDicom` **gives up quietly**: its walk `break`s at the first
header it cannot read, and `readElementExplicit` answers `null` for an undefined-length value
(`0xFFFFFFFF`).

**THE HALT IS A PROPERTY OF THE DATASET, AND THE PREAMBLE IS NOT PART OF THE DATASET.** That is the
whole defect in one line. 132 bytes of preamble and `DICM` change nothing about whether the walk can
read the elements behind them, so `isDicom` was deciding who is owed a text sweep on evidence that
has no bearing on the question. The identical dataset was caught **without** a preamble and missed
**with** one, in silence, over a name-bearing `(0010,0010)`.

`#97` closed the preamble-**less** half by running both routes. This is the mirror case, and the
lesson generalises past both: **`scanDicom` returning without a hit is not evidence of anything.**
It has no way to say how far it got, so nothing may be conditioned on it having got anywhere.

Quote **PS3.5 §7.5.2 whole**: it defines TWO Sequence delimitations, the encoder chooses, and "Both
ways of encoding shall be supported by decoders." A file carrying an undefined-length `SQ` is
conformant, not malformed; calling it "the normative encoding" overstates it and is not needed here.
§7.1 then orders Data Elements by ascending tag, so a conformant object puts `(0008,1110) SQ`
**before** `(0010,0010)`. A non-LE transfer syntax stops the walk the same way, at the first dataset
element.

### Measured, base `21e25a0`

One object per row. The name is this suite's own synthetic `RIVERA^JUANITA`; `ANON^PATIENT` and
`DATE:20240115` are on the allow-list and are the clean controls.

| target | base | shipped |
|---|---|---|
| preamble-FUL, `(0008,1110)` undefined-length `SQ` then `(0010,0010) PN` | exit **0**, `OK - no hits` | exit 1 |
| preamble-FUL, the name at `(0008,1030) LO` (no tag table covers it) | exit **0** | exit 1 |
| preamble-FUL, Explicit VR **Big Endian** dataset, `(0010,0010) PN` | exit **0** | exit 1 |
| the first row's object **base64'd into a `.md`** | exit **0** | exit 1 |
| **CONTROL** the first row's object **without** the preamble | exit 1 | exit 1 |
| **CONTROL** preamble-FUL `(0010,0010) PN`, no halt in front of it | exit 1 | exit 1 |
| **CONTROL** the same `.md` shape, no halt | exit 1 | exit 1 |
| **CLEAN** preamble-FUL, allow-listed PN + allow-listed DA | exit 0 | exit 0 |
| **CLEAN** preamble-FUL, allow-listed name at `(0008,1030) LO` | exit 0 | exit 0 |
| **UNCHANGED** preamble-less, plain `(0010,0010) PN` | exit 1 | exit 1 |
| **UNCHANGED** a `.dcm` that is not a DICOM stream at all | exit 1 | exit 1 |

**THE LAST FIVE ROWS ARE WHAT MAKE THE FIRST FOUR EVIDENCE.** Three are positives the detector
already caught on base, so a green anywhere here would be a **gap** rather than a clearance; two are
clean results pinned **beside** them.

**A NEGATIVE CONTROL AGAINST THE WRONG PACKAGE.** The first row's object was handed to
`hl7/scripts/phi-scan.ts` and `x12/scripts/phi-scan.ts`, each with its own repo as `cwd`: both exit
**0**, and neither script is byte-identical to this one. So the exit codes above are `dicom`'s.

**A `N OF M` FIGURE HAS A MOVING BASE.** Quoted with its sha and no other: with the tests as they
stand at the end of this slice, `test/scripts/phi-scan.test.ts` runs **5 failed, 76 passed, of 81**
against base `21e25a0`'s `scripts/phi-scan.ts`. The passing majority is the point: a control that
only passes after the fix is not a control.

### The remedy, and the superset property to preserve

The binary branch asks two independent questions and runs **both** answers, unconditionally:

| input | base `21e25a0` | shipped |
|---|---|---|
| `isDicom` true | `scanDicom` only | `scanDicom` **and** `scanText` **and** `scanEmbeddedObjects`. Pure addition. |
| preamble-less | `scanDicom` and `scanText` and `scanEmbeddedObjects` | unchanged |
| neither | `scanText` and `scanEmbeddedObjects` | unchanged |

**`scanEmbeddedObjects` IS NAMED IN EVERY ROW ON PURPOSE.** A draft of this table stopped at
`scanText`, which reads as though the base64 decode were a markdown feature, and it also made rows 2
and 3 wrong about the base: both ran the decode there already.

`scanEmbeddedObjects` gained a second route on the object it decodes, for the same reason and
one level down. **The enclosing page's own text sweep does not stand in for it**: the object arrives
base64-encoded, so the name is not in the page's bytes in any form the PN regex could match. That is
pinned by a control which strips the base64 run from the same page and requires exit 0.

**WIDEN BY UNION, NEVER BY REPLACEMENT.** `#97` paid a blocker for this and it has not softened: an
`if`/`else` dispatch can make a fix a net leak. Nothing here may become an `else`, and no cheaper
predicate may be reached for to decide who is owed a text sweep, because the halt is invisible to any
test on the first 132 bytes.

### The cost, taken deliberately and MEASURED rather than asserted

The text sweep now runs over binary values, so its recognizers fire on image noise. This is the
`DICOM-DEIDENT-OVER-REDACTION` false-positive shape and it was accepted before coding: **a silent
PHI-scan halt over a name-bearing `(0010,0010)` is a false green, and a false positive is not.** The
trade is not symmetric. A false positive costs a developer one look at a hit line; the halt it
replaces printed `OK - no hits` over a patient name.

**🛑 THERE IS NO SENTENCE HERE RANKING THE RECOGNIZERS, AND ITS ABSENCE IS THE FINDING. TWO WORDINGS
WERE REFUTED IN A ROW, SO THE CLAIM IS DELETED RATHER THAN WRITTEN A THIRD TIME** (`CLAUDE.md`
§ Method). Draft one said the **compact-date** pass was the price, reasoning from the item's phrase
"flags digit runs inside pixel data" instead of counting; pass 1 refuted it. Draft two said it was
the **PN-shape** pass "and not the compact-date one", generalising from high-entropy noise; pass 2
refuted that too, and the counter-measurement reproduced here. **Both recognizers fire, and WHICH ONE
DOMINATES IS A PROPERTY OF THE PAYLOAD'S BYTE HISTOGRAM, not of this scanner.** The table is the
statement. **Do not replace it with a sentence.**

Hits per 8 MiB of `(7FE0,0010) OW` value, shipped scanner. **Base `21e25a0` is 0 on every row,
because base swept none of it.** One draw per row unless the row says otherwise, over a synthetic
payload named by its byte histogram; these are ILLUSTRATIVE OF RANGE and are not rates.

| 8 MiB pixel payload | PN-shape hits | date hits |
|---|---|---|
| uniform over `0x00-0x2F` (dark frame) | 0 | 0 |
| 8-bit ramp | 0 | 0 |
| 16-bit LE ramp | 0 | 0 |
| CSPRNG, 8 independent draws (compressed or encapsulated frame) | 8 to 23 | 0 in all 8 |
| gaussian mu `0x35` sd 10 (narrow histogram) | 0 | 25 |
| uniform over `0x30-0x3F` (4-bit-quantised region) | 0 | 843 |
| ASCII digits and dots (adversarial; the dot fraction is a knob, so this row moves most) | 0 | ~1,000 |
| uniform over `0x41-0x60` (letters, and the caret sits in it) | **71,122** | 0 |

**THE SPREAD IS THE POINT: 0 TO 71,122 HITS OVER THE SAME 8 MiB, ON PAYLOADS THAT DIFFER ONLY IN
WHICH BYTES THEY USE.** A rate quoted off any one row is a fact about that row's histogram. The last
row is what refuted draft two: the PN pass is not rare, it is rare **on high-entropy noise**, and a
payload whose values land in the letter band puts the caret `0x5E` inside its own alphabet. The
`0x30-0x3F` row is the same lesson pointed the other way, on a payload with no letters in it at all.
**NO ROW HERE CLAIMS TO BE WHAT A REAL MODALITY WRITES**, and a draft that called one "not
adversarial at all" was asserting the shape of real imaging data without measuring any, which is the
move that got drafts one and two refused. These are histograms, chosen to span the range.

**THE RATE IS A PROPERTY OF THE CORPUS, NOT OF THIS SCRIPT.** On the corpus this gate actually reads
it is **zero**: `pnpm phi-scan` exits 0 on `main` and exits 0 here, because the package commits **no
`.dcm` files at all** and a `.ts` source was already getting the text sweep. Every figure above is a
statement about a hypothetical corpus of committed imaging objects.

**A ZERO IN THE TABLE ABOVE IS A FIXTURE PROPERTY, NOT A CLEARANCE.** Each zero has its own cause in
that row's histogram, and no zero generalises to the row above or below it. **Do not restate any of
them as "pixel data does not false-positive".**

**🛑 AND A FIRST DRAFT OF THIS TABLE READ 0 ON EVERY ROW, WHICH WAS A FIXTURE ARTIFACT REPORTED AS A
FINDING** - this repo's recurring failure mode. The generator was `x = (x * 1103515245 + 12345) >>> 0`,
and that product exceeds 2^53, so the low bits are lost to float precision and the sequence degenerates
into structured bytes rather than noise. Any pseudo-random fixture here uses `Math.imul`-based
xorshift32 or `crypto.randomFillSync`, and the test that needs a big deterministic run says so in a
comment for exactly this reason.

**COST: LINEAR, ~40 ms per MiB**, best of three at 1/2/4/8/16 MiB on both a CSPRNG and an
adversarial digits-only payload, with the ~130 ms process-start floor subtracted. Base was ~0 on
every size because it did no sweep. There is no superlinear term: the sweep is three linear regex
passes plus one linear run scan.

### What this ALSO closed, `PRE-EXISTING`, because this item put weight on it

**A MULTI-MEGABYTE BASE64 RUN REFUSED THE SCAN (exit 2).** The run matcher was
`new RegExp("[A-Za-z0-9+/]{16,}={0,2}", "g")`, and V8 keeps per-character backtrack state for a
greedy quantifier, so ONE long run threw `RangeError: Maximum call stack size exceeded`. `run()`
turns that into exit 2. Measured on base `21e25a0` over a plain `.md` carrying one run: 0.5, 1, 2 and
4 MiB exit 0; 8 MiB exits **2**. It was reachable on the doc corpus and on any preamble-less object,
which is why it is `PRE-EXISTING` rather than introduced here; **this item made it reachable on
preamble-ful objects too** (base 0, first draft 2), and a Part 10 object is routinely megabytes, so it
is closed rather than disclosed.

`base64Runs()` is a forward scan with no backtracking and no per-character stack. It is a different
**representation** of the same predicate, not a wider or narrower one, and the equivalence is
measured rather than asserted: over every tracked file under `docs-content/`, `README.md`, `test/`,
`src/` and `scripts/` it yields **0 mismatches** against the pattern it replaced, and 0 across a set
of edge and adversarial strings including a 4 MiB single run (below the threshold where the pattern
throws), padding of zero, one, two and three `=`, and a run one character below the floor.

**🛑 THE RUN COUNT IS DELIBERATELY NOT WRITTEN DOWN.** A draft quoted one and it matched neither sha;
a second draft quoted two more, naming "base" and "head", and the "head" figure was already wrong at
the sha it shipped on. **Both are deleted rather than corrected a third time**, because the compared
corpus contains files this slice edits: any identifier of 16 or more base64 characters written into
`scripts/phi-scan.ts` or `test/` is itself a counted run, so the figure moves with the code that
produces it. (**Not with this file.** `documentation/` is in none of the five globs below, and a
draft that said "every line of this very paragraph" moves the number was wrong about that.) It is one
command, so derive it, comparing `[...t.matchAll(/[A-Za-z0-9+\/]{16,}={0,2}/g)].map(m => m[0])` with
`[...base64Runs(t)]` over `git ls-files -z -- docs-content README.md test src scripts`. **What
matters is that the mismatch count is zero, and zero does not move.**

**AND NO TEST PINS THAT EQUIVALENCE.** A draft of the `base64Runs` JSDoc claimed one did; the named
test pins the no-refusal property and says nothing about the run set. **DELETED, not reworded.** It
cannot be a unit test as things stand, because `phi-scan.ts` is a CLI that calls `process.exit` at
module scope, so nothing in it is importable. What the suite does pin is the **floor**, which is the
end a narrowing shows up at first: `"reaches the SHORTEST real fixture in docs-content, not just a
test-built one"` takes the shortest DICOM-shaped run out of the shipped corpus and requires a name
appended to it to be found. That test predates this slice and is why the floor is guarded at all.

**🛑 THE THRESHOLD IS A PROPERTY OF V8'S STACK, NOT OF THIS SCRIPT.** The test pins the PROPERTY (a
6 MiB run is swept, and the object after it is still reported) and not the number. On a build with a
larger stack the old matcher would have passed it too, and that is fine: the assertion carrying the
weight is the HIT, which a refusal loses.

### Residuals, disclosed and NOT closed

- ~~**A TEXT EXTENSION IS STILL DISPATCHED BY NAME, SO A `.md`/`.json`/`.txt`/`.csv` FILE WHOSE RAW
  BYTES ARE A DICOM OBJECT IS NEVER SCANNED AS ONE.**~~ **CLOSED** by `DICOM-PHI-SCAN-RESIDUALS`
  (2026-08-09). The prediction in this bullet - that closing it means running **both** routes on a
  text extension - is what shipped, and the branch was DELETED rather than widened, so nothing was
  swapped. Read `documentation/agent-notes.md#dicom-phi-scan-name-dispatch` for the before/after matrix and the superset proof.
- **`scanDicom` STILL REPORTS NOTHING ABOUT THE BYTES IT NEVER READ.** The text sweep behind it is a
  net, not a fix for the walk: a value that is neither `FAMILY^GIVEN` nor an eight-digit date run is
  still invisible past the halt, an MRN and an institution name among them. Teaching the walk to
  descend a Sequence, or to report where it stopped, is a different change and is not made here.
- **THE EMBEDDED DECODE IS NOT RE-ENTERED ON THE DECODED BYTES.** One level is what a doc fixture is;
  recursing would spend unbounded time on an object whose pixel data happens to be alphanumeric.
- The `--staged` route still drops `D` (a deletion has no staged blob) and `U` (an unmerged path has
  no single one). `PRE-EXISTING`, untouched, and already stated in the script's own banner.
- **A DUPLICATE LINE IS THE PRICE AND IT IS THE RIGHT WAY ROUND.** A DICOM object can now report one
  value twice, once under its tag and once as `(text)`. Two lines naming one value is not a defect in
  a gate whose output a human reads before committing. A missing line is.
- **`report()` PRINTED ONE STDERR LINE PER HIT, UNCAPPED, AND THIS SLICE WIDENED WHAT CAN REACH IT.**
  `PRE-EXISTING`: base already had no cap, on every text file and every non-DICOM binary. An
  adversarial 128 KiB payload yields tens of thousands of PN matches. **CLOSED 2026-08-09 by a
  per-file PRINT cap** (`DICOM-PHI-SCAN-RESIDUALS`), which changes nothing about the exit code, the
  totals or what is detected. The figures, the superset proof and the residuals it does **not** close
  are in [`documentation/agent-notes.md#dicom-phi-scan-report-cap`](documentation/agent-notes.md#dicom-phi-scan-report-cap). The same shape is recorded
  against `deidentify()` in `CLAUDE.md` ("58,255 findings and 36 MB of warnings from a 1 MiB input"),
  and the remedy there was a per-run cap, not a narrower detector.

---

<a id="dicom-scantarget-preambleless"></a>

## dicom - `scanTarget` sent a preamble-less object on disk to the TEXT sweep (2026-08-08)

`DICOM-SCANTARGET-PREAMBLELESS`, filed `PRE-EXISTING` and the last open item from the finished
roadmap. Written here rather than in `documentation/agent-notes.md` because that file is **over** its
250,000-byte budget on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.**

**Provenance:** the spec claims are read from the SHA-pinned vendored copy at
`vendor/nema/part05/`, **PS3.5 2026c** (§7.1 tag ordering, §7.5.2 undefined-length Sequences). Every
other figure is a measurement taken on this repo, quoted with the sha it was taken at, and the two
mutation controls are reproducible with `git show <sha>:scripts/phi-scan.ts` over the current tests.

**`CLAUDE.md` CARRIES NO LINE FOR THIS, DELIBERATELY, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT
THE TRAP IS SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which
is not a line. The remedy in that situation is relocation, never deleting an existing trap to make
room, and never raising the ceiling. So the rule lives in three places that a worker touching this
code actually reads: the JSDoc on `scanTarget` itself, the ten cases in
`test/scripts/phi-scan.test.ts` under "a preamble-less object ON DISK reaches the DICOM route", and
this file.

### The defect

`scripts/phi-scan.ts` has two DICOM shape tests and they are not the same test.

- `isDicom(buf)` is the Part 10 test: 132 bytes minimum, `DICM` at 128. It answers **false** for a
  preamble-less stream.
- `fileMetaStart(buf)` knows **both** shapes: 132 for a Part 10 object, and 0 for a stream that opens
  directly on group `0002` in Explicit VR LE. It is what `scanDicom` calls, and what
  `scanEmbeddedObjects` has called since the doc-corpus route was written.

`scanTarget` dispatched on the wrong one. A `.dcm` or `.bin`, and anything under an unknown
extension, was gated on `isDicom` **before** reaching `scanDicom`; a preamble-less object failed that
gate and fell to the `scanText` fallback instead. So the DICOM-aware sweep - the PN/DA/DT tag table,
the transfer-syntax dispatch off `(0002,0010)`, the per-element value decode - **never ran on a
preamble-less object on disk**, and the gate printed `[phi-scan] OK - no hits` over it.

A missing preamble is not an exotic input here. It is a deviation the parser tolerates on the read
path and warns about with `DICOM_MISSING_PREAMBLE`, and `docs-content/cookbook.md` ships a fixture in
exactly that shape to demonstrate the warning. The doc corpus reached `scanDicom` correctly; only an
object **on disk** did not.

### Why the text fallback is not a narrower scan but a different one

This is the part worth keeping, because "it still got scanned, just by the other route" is the
reading that makes the defect look cosmetic. The two routes detect different things, and the text
route cannot see what the tag table sees:

- The text pass matches PN only as `FAMILY^GIVEN` (`/\b[A-Z][A-Za-z\-']+\^[A-Z][A-Za-z\-']+\b/`). A
  **single-component** `(0010,0010)` carries no caret, so there is nothing to match. The DICOM route
  does not care about the shape of the value at all: any value at a `PN_TAGS` tag that is not on the
  allow-list is a hit.
- The text pass matches a date only as `YYYY-MM-DD` or as a standalone eight-digit token. A `DT`
  value's `YYYYMMDD` head sits inside a longer digit run, so the word-boundary anchors miss it; the
  DICOM route slices the head off and checks it.
- Under Implicit VR LE there is no VR on the wire at all, so only a tag table can classify a value.

### Measured, base `5ae8fe4`

One preamble-less object per row, Explicit VR LE, `(0008,0020) DA` and `(0010,0010) PN`, written to
disk and handed to the scanner in paths mode. The name is `WESTERGAARD` - invented, single-component,
and **not** matchable by the text sweep, which is what makes the exit codes evidence rather than
coincidence.

| target | base | with the fix |
|---|---|---|
| preamble-less `.dcm`, name-bearing PN | exit **0**, no hit | exit 1, `(0010,0010)` |
| preamble-less `.bin`, same | exit **0**, no hit | exit 1, `(0010,0010)` |
| preamble-less `.dat` (unknown ext), same | exit **0**, no hit | exit 1, `(0010,0010)` |
| the same object **with** a preamble | exit 1, `(0010,0010)` | exit 1, `(0010,0010)` |
| preamble-less `.dcm`, allow-listed `ANON^PATIENT` | exit 0 | exit 0 |

The fourth row is what makes the first three a gate defect rather than an undetectable payload: the
identical bytes, plus 132 bytes of preamble and magic, were caught all along. The fifth is the clean
result pinned beside the positives, so a green is a green and not an absent detector.

**A `N OF M` FIGURE HAS A MOVING BASE.** Quoted with its sha and no other: with the tests as they
stand at the end of this slice, `test/scripts/phi-scan.test.ts` runs **6 failed, 46 passed, of 52**
against base `5ae8fe4`'s `scripts/phi-scan.ts`, and **3 failed, 49 passed, of 52** against the
refused first draft `1ff2ab4`'s. The passing majority in both columns is the point: a control that
only passes after the fix is not a control.

### 🛑 THE FIRST DRAFT WAS REFUSED, AND THE FINDING IS THE RULE

The first draft made the binary branch an if/else: recognized by `fileMetaStart` goes to `scanDicom`,
otherwise `scanText`. A `conformance-refuter` pass refused it, and the finding reproduced
independently. **ADDING THE DICOM ROUTE MUST NOT SUBTRACT THE TEXT ONE, BECAUSE `scanDicom` GIVES UP
QUIETLY.** Its walk `break`s at the first header it cannot read, and `readElementExplicit` answers
`null` for an undefined-length value (`0xFFFFFFFF`). That is not a malformed file. **Quote §7.5.2
whole: it defines TWO delimitations, the encoder chooses, and "Both ways of encoding shall be
supported by decoders."** Calling undefined length "the normative encoding" overstates it and was
corrected here; the argument needs only the half the clause states outright, which is that a
conformant file may carry it and a decoder shall support it. §7.1 then orders Data Elements by
ascending tag, so a conformant object puts `(0008,1110) SQ` **before** `(0010,0010)`. A non-LE
transfer syntax stops the walk the same way, at the first dataset element.

Measured, same bytes, three scanners. Preamble-less, `(0008,1110)` undefined-length SQ, then
`(0010,0010) PN` carrying this suite's own synthetic `RIVERA^JUANITA`:

| scanner | result |
|---|---|
| base `5ae8fe4` | exit 1, the text sweep reports the name |
| refused draft `1ff2ab4` | **exit 0, `OK - no hits`** |
| shipped | exit 1 |

A gate that reports clean over a name it used to report is a worse defect than the one being fixed.

### The remedy

`scanTarget` dispatches a text extension by NAME. For everything else it asks **two independent
questions and runs both answers**, which makes it a strict **superset** of the `isDicom` gate on
every input. That superset property is the thing to preserve if this is ever touched again:

> **⚠ THE FIRST SENTENCE IS SUPERSEDED AND THE REST IS NOT.** `DICOM-PHI-SCAN-RESIDUALS` (2026-08-09)
> DELETED the by-name branch, so the two questions are now asked of **every** target and the table
> below describes all of them rather than the non-text-extension ones.
> `documentation/agent-notes.md#dicom-phi-scan-name-dispatch`.

| input | base `5ae8fe4` | shipped |
|---|---|---|
| `isDicom` true | `scanDicom` | `scanDicom`. Byte-for-byte unchanged. |
| preamble-less | `scanText` | `scanDicom` **and** `scanText`. Pure addition. |
| neither | `scanText` | `scanText`. Byte-for-byte unchanged. |

Because the middle row keeps the text sweep it used to get, **nothing that was found before can be
lost**, which is what the refused draft could not say. `.dcm`, `.bin` and unknown extensions were
three copies of one branch and are one branch now. `isDicom` is not deleted - `fileMetaStart` calls
it as the Part 10 half of the answer, and the branch calls it again to decide whether the text sweep
is owed - but nothing may gate the **DICOM** scan on it. **The DICOM route asks `fileMetaStart`,
never `isDicom`; the text route is not an `else`.**

The cost, stated rather than left to be discovered: a preamble-less object can now report one value
twice, once under its tag and once as `(text)`. Two lines naming one value is not a defect in a gate
whose output a human reads before committing. A missing line is.

The superset shape also settles a second question the exclusive draft had opened. `fileMetaStart`'s
preamble-less test is **looser** than the library's own tolerated shape (`src/parser/part10-header.ts`
requires exactly `(0002,0000) UL 0x0004`; the scanner accepts any `(0002,eeee)` with two ASCII
capitals at bytes 4-5). Under an if/else that looseness could **remove** a text sweep from a binary
the library itself would refuse as `NOT_DICOM_PART_10`. Running both routes means a false recognition
costs a wasted walk and never a lost scan, so the two tests do not have to be reconciled here.

### Residuals, disclosed and NOT closed

- **🩺 `scanDicom` HALTS SILENTLY, AND A PREAMBLE-FUL PART 10 OBJECT HAD NO TEXT SWEEP BEHIND IT.
  ✅ CLOSED by `DICOM-SCANDICOM-SILENT-HALT`; the mechanism, the measurements and the accepted
  false-positive cost are in
  [`documentation/agent-notes.md#dicom-scandicom-silent-halt`](documentation/agent-notes.md#dicom-scandicom-silent-halt).** The text sweep is
  unconditional on the binary branch now, and `scanEmbeddedObjects` runs it on the object it decodes
  as well. **What is NOT closed is the first half of that heading**: `scanDicom` still reports
  nothing about the bytes it never read, so a value the text sweep cannot match is still invisible
  past a halt. Read the residuals in that file before calling the class closed.
  **▶ The test that pinned the old boundary has been REPLACED, not deleted.** `"a PREAMBLE-FUL object
  is still scanned by the DICOM route ALONE, byte-for-byte as before"` asserted exit 0 over an object
  carrying `RIVERA^JUANITA` at `(0008,1030) LO`; the successor asserts exit 1 on the same fixture and
  keeps the non-vacuity control that the same value at `(0010,0010)` is reported **under its tag**.
  **▶ This still bounds what the row-4 control above proves.** "The identical bytes plus 132 bytes of
  preamble were caught all along" is true of a fixture with no undefined-length element in it, and is
  **not** a general property of the preamble-ful route. Do not restate it as one.
- ~~**A TEXT EXTENSION IS STILL DISPATCHED BY NAME, SO A `.md`/`.json`/`.txt`/`.csv` FILE WHOSE RAW
  BYTES ARE A DICOM OBJECT IS NEVER SCANNED AS ONE.**~~ **CLOSED** by `DICOM-PHI-SCAN-RESIDUALS`
  (2026-08-09), by running **both** routes on every target - which is exactly what this bullet said
  closing it would take. The doc page keeps `scanEmbeddedObjects`, because the branch was DELETED
  and not swapped. `documentation/agent-notes.md#dicom-phi-scan-name-dispatch`.
- The `--staged` route still drops `D` (a deletion has no staged blob) and `U` (an unmerged path has
  no single one). `PRE-EXISTING`, untouched here, and already stated in the script's own banner.
- Nothing about the **hit** surface moved. A hit still reports the element's tag, VR, offset and
  value, which is what the scanner is for; the PHI-diagnostic bounds that govern the *library's*
  warnings do not apply to a developer-facing gate that exists to print the violating value.

---

<a id="phi-scan-walk-root-scope"></a>

## dicom - the PHI gate's walk root excluded the only place fixtures live (2026-08-08)

`PHI-SCAN-WALK-ROOT-SCOPE`, the org-wide class filed against every `@cosyte/*` repo. Written here
rather than in `documentation/agent-notes.md` because that file is **over** its 250,000-byte budget
on `main` and the hook refuses growth (an umbrella size rule, since retired). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, DELIBERATELY, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT
THE TRAP IS SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which
is not a line. The remedy in that situation is relocation, never deleting an existing trap to make
room, and never raising the ceiling. So the rules live where a worker touching this code actually
reads them: the banner on `scripts/phi-scan.ts`, the cases in `test/scripts/phi-scan.test.ts` under
"the walk root is test/, not test/fixtures/", "an embedded base64 object is decoded outside markdown
too", "a declared root that cannot be walked refuses the scan" and "the walk is reconciled against
git ls-files", and this file. This is the same disposition `DICOM-SCANTARGET-PREAMBLELESS` reached
one day earlier, for the same reason.

**Provenance:** every figure below is a measurement taken on this repo, quoted with the sha it was
taken at. Base is `8982a16`. The base-side measurements are reproducible with
`git show 8982a16:scripts/phi-scan.ts` run from a checkout of that sha, and the throwaway-repo cases
are reproducible from the tests themselves.

**🛑 THE SCOPE WAS RE-DERIVED FROM THIS REPO'S OWN FILES, NOT PORTED.** The class's governing rule is
that a sibling's residual is not evidence about this one, and `hl7` measured two ported residuals as
NOT open there. Two of the sibling numbers do not survive here at all: **this package has no
`test/fixtures/` corpus to widen from** (see below), and its regular-file-root exit code is neither
`hl7`/`fhir`/`cli`'s `2` nor `terminology`'s `1` but **two different wrong answers depending on which
path was replaced**, both measured.

### What the gate was actually reading

The walk rooted at `test/fixtures/` and `README.md` + `docs-content/`. The number that makes the rest
of this file make sense:

| | base `8982a16` | head |
| --- | --- | --- |
| tracked files | 226 | 229 |
| opened by all-mode | **13** | **95** |
| outside the all-mode walk | **213** | 134 (133 outside the roots + 1 corpus exemption) |
| tracked under `test/` outside it | **82** | **1** (the corpus exemption, printed every run) |

**"Outside the all-mode walk" is not "scanned by neither route", and the two are easy to quote as
each other.** One of those 82, `test/fixtures/phi-scan/README.md`, was reachable by `--staged`, which
has never applied the corpus exemption. So the figure for **neither** route is **212 and 81**. Both
are written down.

**The fixture root contributed EXACTLY ZERO files.** Every file this package writes under
`test/fixtures/` is gitignored, because the suite regenerates them on every run
(`test/fixtures/phi-scan/*.dcm|json|txt`); the one tracked file left there is a `README.md` the walk
skipped by name. So the "fixture corpus" the gate was named for was empty, and the 13 files it opened
were the package README and the twelve pages under `docs-content/`.

**That matters more here than the shape of the number suggests, and this is the part that is
dicom-specific.** This package ships **no committed `.dcm` files at all** - `test/integration/parser-security.test.ts`
asserts as much as an invariant. Every fixture it owns is BUILT IN A `.ts` SOURCE FILE by
`test/helpers/build-dicom.ts`. So the entire committed fixture corpus was inside the 81 tracked files
under `test/` that the walk root excluded, and the gate had never opened one of them.

Pointing this scanner at that root finds **81 PN/date hits across 20 files**. Naming all 82 tracked
files under `test/` by path finds **83 across 21**; the two extra are in the corpus-exempt README,
which all-mode does not open. Both numbers are written down so neither can be quoted as the other.

### The four ways a declared root went unopened while the gate printed clean

Each was measured on base, and each is pinned by a case with a positive beside it.

| shape | base `8982a16` | head |
| --- | --- | --- |
| root MISSING entirely | exit **0**, `OK - no hits` | exit 2, names the root |
| root a DANGLING symlink | exit **0**, `OK - no hits` | exit 2, "a symbolic link" |
| root a symlink at a REAL directory | **followed and walked** (see below) | exit 2, "a symbolic link" |
| root a REGULAR FILE | exit **0** at `test`, exit **1** at `test/fixtures` | exit 2 |
| root present but EMPTIED | exit **0** | exit 2, via `git ls-files` |

**One row of that table is a different KIND of fact and saying so cost a refuter pass.** Four of the
five are exit 0 *structurally*: nothing was opened, so nothing could be found. The symlinked-at-a-
real-directory row is not - base FOLLOWED the link and scanned whatever was behind it, so it exits 0
over clean contents and **1** over a name-bearing file. The defect there is not the exit code; it is
that the gate reported on a tree the declared root does not name, and would have reported clean over
the corpus if the link pointed somewhere empty.

**The dangling case is the sharpest, and it is an `existsSync` fact rather than a `walk()` fact.**
`existsSync` FOLLOWS the link, so a dangling one answers `false`; the old code's
`if (existsSync(root))` returned before `readdirSync` was ever called, which means the
not-a-regular-file rule that catches a link INSIDE a root could not fire for the root itself. The fix
is `lstatSync`, which answers about the link rather than the target, so a root is classified by the
same closed set as any entry under it.

**🛑 THE EXIT CODE IS DERIVED FROM THIS SCRIPT'S OWN CONTRACT AND PORTING ONE IS THE BUG.** The
banner says 0 clean / 1 hits / 2 invocation error, and every refusal here is an `InvocationError`, so
it is **2**. Base answered the regular-file shape two different wrong ways and neither was 2: a
regular file at `test` meant the old root `test/fixtures` did not exist, so the run exited **0**; a
regular file at `test/fixtures` itself raised an uncaught `ENOTDIR` out of `readdirSync` and the
process exited **1**, the one code that means "PHI was found".

**EXISTENCE IS NOT OBSERVATION, so both halves ship.** Refusing a MISSING root leaves the other half
open, because an EMPTIED root is perfectly present and hands the walk nothing. The remedy for that
half is reconciling the walked set against `git ls-files` over the declared roots: every tracked path
must land in exactly one of OPENED, GITIGNORED or corpus-EXEMPT, and anything else refuses.

**🛑 AND A DENOMINATOR DOES NOT DETECT IT.** `ncpdp` refuted that remedy and the refutation holds
here: a count of the files that were reached counts only the roots that were there to reach. Nothing
in this change prints a scanned-file count, deliberately.

### 🔴 The escape this does NOT close, and no repo in the org has

**The reconciliation compares path SETS, not the bytes git carries at those paths.** A working tree
whose files are clean reconciles and exits 0 even when the INDEX at the same paths holds PHI, and a
root swapped for a directory that mirrors the tracked names does the same over decoy contents. It is
pinned by a test that asserts the escape rather than a fix, with the control that the identical bytes
ARE caught by `--staged`.

Widening the root makes this **narrower rather than safer**: a decoy now has to mirror every tracked
name under `test/` instead of the handful under `test/fixtures/`. Narrower is not closed.

### 🛑 Enumeration buys the floor, and the other half was open here too

The class's most expensive rule is that widening the walk and widening the recognizer are **two
different changes**, each "in addition to" and never "instead of". Both halves were open here, and
the second is dicom-specific.

`scanEmbeddedObjects` decodes base64 runs and scans the ones that are DICOM objects, and it ran
**only for a name in `TEXT_EXTENSIONS`** (`.json`, `.txt`, `.md`, `.csv`). A `.ts` file got
`scanText` and nothing else. Measured on base with one object and one name-bearing `(0010,0010)`:

- the same bytes as `probe.md` -> exit 1, `(0010,0010) PN` reported
- the same bytes as `probe.dcm` -> exit 1, `(0010,0010) PN` reported
- the same bytes as `probe.ts` -> exit 0, `OK - no hits`

So widening the walk root alone would have opened 81 `.ts` files and read straight past every object
encoded in one, in a package whose fixtures are exactly that. The decode runs **in addition to**
`scanText` and never instead of it, which keeps the strict-superset property the `scanTarget` banner
already documents.

> **⚠ `TEXT_EXTENSIONS` NO LONGER EXISTS**, so the measurement above is a record of base and not a
> description of the scanner. `DICOM-PHI-SCAN-RESIDUALS` (2026-08-09) deleted the by-name branch
> outright; every target now gets `scanText`, `scanEmbeddedObjects` and - if its bytes say so -
> `scanDicom`. `documentation/agent-notes.md#dicom-phi-scan-name-dispatch`.

**🩺 THE CLEAN RESULTS ARE PINNED BESIDE POSITIVES THE DETECTOR DOES CATCH, because a detector zero
can be a gap rather than a clearance.** The `.ts` zero above sits beside the `.md` and `.dcm` ones on
identical bytes; the "allow-listed payload in a `.ts`" case sits beside the violator case; the
narrow-exemption case writes the SAME payload one directory across and requires a hit. `#55`'s pin in
this repo was vacuous BY FIXTURE, so no payload here is anonymous: each carries a person name.

### What the 81 newly opened files turned out to hold

**🩺 A HAND-WRITTEN CENSUS IS A CLAIM; the file list is derived** with
`git ls-files test/ | grep -v '^test/fixtures/'`. Every one of the 81 was read end to end before this
change landed, across five fresh contexts, and the readings agreed: **no patient-identifying content**.

The hits the gate now sees are synthetic fixture values, disposed of as EXACT allow-list entries
(the entries this change ADDS are exact; the pre-existing prefixes are untouched, and it is the
pre-existing `Doe^` that excuses `Doe^Jane` across the newly opened files): `BOND^JAMES`,
`DEEPER^PATIENT`, `DEFLATE^TEST`, `NESTED^PATIENT`, `ROOT^PATIENT`, `SMITH^REF`, `SMITHSON^BRAIN`,
`XOE^JANE`, and `Yamada^Tarou`, which is PS3.5's own worked example for the three PN component
groups. `Yam^Tar` beside it is **not** in the standard: the vendored PS3.5 2026c carries
`Yamada^Tarou=<ideographic>=<phonetic>`, and `Yam^Tar` is the test's ASCII stand-in for the
ideographic group. A draft of the allow-list comment cited both as the standard's. Dates
`19800101` and `20240115`. And four entries that are **not dates at all** but DICOM tag numbers
satisfying the `YYYYMMDD` shape - `40101006`, `70011001`, `70011002`, `70011003` - listed as such in
the allow-list rather than mislabelled.

**🛑 WHAT THE HAND-READ FOUND THAT THIS GATE CANNOT SEE, and would not have seen if it ran forever.**
The recognizers look for caret-joined person names, ISO and compact dates, and PN/DA/DT values under
a hardcoded tag table. They do not look for an MRN, an accession number, an institution name, a phone
number, an email address, an SSN, or a vendor UID root. The newly opened files carry all of those
shapes, and every instance is synthetic or public:

- synthetic MRNs and accession numbers: `MRN-11111`, `MRN-99999`, `SECRET-MRN-123`, `ID-000123`, `ACC0099`, `12345`
- an invented institution: `ACME GENERAL HOSPITAL`, and the institution-shaped carriers
  `MERCY GENERAL HOSPITAL` / `MERCY GENERAL HOSPITALS` used as `(0008,0080)` fillers
- real, published, non-patient organisation identifiers, correct by necessity: DCMTK's
  `1.2.276.0.7230010.3.0.3.6.4` and `OFFIS_DCMTK_364`; the vendor private-creator strings
  `GEMS_IDEN_01`, `GEMS_ACQU_01`, `SIEMENS CSA HEADER`, `SIEMENS MEDCOM HEADER`; the NEMA
  `1.2.840.10008.*` registry; the GE root `1.2.840.113619` and the Medical Connections root
  `1.2.826.0.1.3680043` under invented suffixes

**"Newly scanned" is therefore not "newly cleared", and the reading is what cleared them, not the
gate.** Saying otherwise would be the exact overstatement this class keeps refuting.

### The circularity the widening creates, and why it is not answered with an exemption

The scanner's own test suite has to carry values the scanner must **reject**, and once the walk root
covers `test/` those values are in the corpus. Three ways out, and the reasons the first two were
refused:

1. **Allow-list them.** Not available: the tests assert `exit 1` on exactly those values, so
   allow-listing them makes the assertions fail. It would also have put the most plausible real name
   in the set on a permanent global allow-list.
2. **Exempt `test/scripts/phi-scan.test.ts` by path.** Available, and rejected: it is a 50 KB file,
   and an exemption that large is a hole the gate cannot see into.
3. **Assemble the values from parts that match no recognizer.** Chosen, in
   `test/helpers/phi-scan-violators.ts`. That file's bytes carry no caret-joined name and no date
   run, so **it is scanned like every other file under `test/` and needs no exemption at all**, while
   the values stay plain to a reader. The gate proved it works during this change: a first draft of
   that file's own explanatory comment spelled the PN shape out and the scanner reported it.

**So this change adds ZERO new exemptions.** The one exemption in force is the one that was already
here, `test/fixtures/phi-scan/README.md`, which documents the deliberate violator values in a table.
Two things changed about it and both are narrowings:

- it is now **ONE LITERAL PATH**, `test/fixtures/phi-scan/README.md`, rather than the old
  skip-any-`readme.md`-the-walk-meets rule, so widening the root did not widen the exemption by a
  single file. A `README.md` one level up at `test/fixtures/README.md` is scanned, and so is
  `test/smoke/README.md`; a case writes the same payload into two of those paths and requires one
  hit and one pass.
- it is **printed on stdout every run**. An exemption nobody can see is the same shape as a root
  nobody notices is empty.

**🛑 AND A DRAFT MADE IT WORSE IN THE ONE DIRECTION THIS ITEM FORBIDS, WHICH A REFUTER CAUGHT.** That
draft wrote the exemption as a PREDICATE ("a `readme.md` under `test/fixtures/`") and applied it to
`--staged` as well, on the reasoning that a rule cannot go stale and that the two routes ought to
agree. Both halves were wrong:

- **A predicate fails OPEN, an exact path fails CLOSED.** A stale exact path means the file moved,
  so it gets scanned and the gate reds until somebody looks. A predicate means every future
  `README.md` anywhere under `test/fixtures/`, at any depth, is exempt for as long as nobody
  notices. Staleness that reds is the cheap failure.
- **`--staged` is the pre-commit gate** (`package.json`'s `pre-commit` is `pnpm phi-scan --staged`)
  and it had never applied the exemption, so teaching it to SUBTRACTED a detection the base had, on
  the commit-blocking route. Measured on the refused draft: a staged README under `test/fixtures/`
  carrying a name exited **1** on base and **0** on the draft. The class went from one route to
  zero.

So the exemption is one literal path, on the `all` route only. The two routes disagree about exactly
that one file, they disagreed about it on base too, and the disagreement fails CLOSED: `--staged` is
the stricter of the two. That friction (a commit touching that README reds the hook) is
`PRE-EXISTING` and stays, because the only way to close it here is to scan less.

### Two more things the widening does not fix, disclosed

**The allow-list is GLOBAL and has no path scoping, so adding to it is a real widening.** The scanner
reads `scripts/phi-allow-list.txt` into one Set and applies it to every corpus it opens, so a value
listed because a `.ts` fixture needs it is equally excused in `README.md`, in `docs-content/` and in
a `.dcm`. A refuter measured exactly that on a `docs-content` page carrying the new values: clean at
head, exit 1 at the previous sha. The two worth naming are `DATE:19800101` and `DATE:20240115`, which
are plausible real birth and study dates. Path scoping is a change to the allow-list FORMAT and is
deliberately not made here; the cost is written into the file itself instead.

**🔴 The reconciliation is vacuous on an empty index.** `trackedInScope()` guards a git FAILURE, but
a legitimately empty answer passes in silence: in a repository where nothing under the declared roots
is tracked yet, there is nothing to reconcile against. It is a check against the INDEX and is exactly
as strong as the index is. Most of the throwaway-repo cases in `test/scripts/phi-scan.test.ts` never
commit, so the reconciliation is vacuous in them by construction; the four that exercise it call
`git add` first, and they are the only ones that say anything about it.

**An unexpected error used to exit 1.** `main()` had no top-level catch, so a `readdirSync` `EACCES`
on an unreadable subdirectory exited 1, the code that means "PHI was found". Widening the walk root
from `test/fixtures/` to `test/` enlarged the surface that can happen on, so it is closed here rather
than disclosed: an unexpected throw now prints `This is not a hit` and exits 2. Measured before the
catch existed: exit **1**.

### What is still out of scope, with the reason

Of 229 tracked files, 95 are opened, 1 is corpus-exempt, and **133 are outside the declared roots
entirely**: `src/` (72), `vendor/` (17), `scripts/` (13), `.github/` (8), `.changeset/` (4),
`documentation/` (3), `.claude/` (1) and 15 files at the repository root. Admitting them is a
**product call with its own false-positive surface**, not a side effect of this one.

**No hit count for them is written down, deliberately.** It is a number about prose as much as about
code: a draft of the banner comment moved the `scripts/` figure by one just by naming a tag in
eight-digit form, and a draft of this file moved the `documentation/` figure by one just by
existing. Derive it instead, in one command:
`git ls-files -z <dir> | xargs -0 pnpm phi-scan --`.

The two big ones are structural rather than accidental. `src/dictionary/generated/annex-e.ts` is a
generated table of DICOM tags, and tag numbers like `(4008,0101)` written as eight digits satisfy the `YYYYMMDD` shape, so the
compact-date pass matches hundreds of them; `vendor/nema/` is a SHA-pinned copy of a standards
document full of real publication dates. Neither is PHI, and neither is fixed by a walk root.

### What this change does NOT touch

`DICOM-SCANDICOM-SILENT-HALT` is a separate open item and is untouched: a **preamble-ful** Part 10
object still gets no text sweep behind `scanDicom`, so an early halt on one is still silent. Closing
it means sweeping every Part 10 object as text too, which would flag eight-digit runs inside pixel
data. That is a gate-behaviour change with its own false-positive surface and its own item.

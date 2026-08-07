# Agent notes: the narrative behind `CLAUDE.md`

**This file is the long form. `CLAUDE.md` is the index.**

Every section below was moved here **verbatim** from `CLAUDE.md` on 2026-08-04, when
`<submodule>/CLAUDE.md` was first budgeted at write time (`CLAUDE-MD-AUDIT`; the meta-repo's
`documentation/decisions/0023-doc-budgets.md`, amendment of the same date). **Do not quote a byte
figure for that budget** - a uniform cap was built and reversed the same day in favour of a per-repo
ratchet, and the ratchet is meant to keep falling. **Nothing was deleted.**
`CLAUDE.md` keeps the cursor, the rules, and every trap as a one-line imperative; each of those
imperatives points at the section here that carries its measurements, its citations, and the refuter
passes that produced it.

**Read the section before you re-open the thing its rule guards.** These are clinical-safety
lessons in a parser: every one of them cost a defect, a refused pass, or both. The compressed line in
`CLAUDE.md` is enough to stop you doing the wrong thing; it is _not_ enough to justify doing a new
thing in the same area.

Section order matches the order these entries had in `CLAUDE.md`'s Status list: most recent first,
then the shipped-phase history, then the generator/authority notes, then the older parser incidents,
then the two gates.

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
`sqUnderDeclares()` in `test/integration/explicit-sq-item-bound.test.ts`, the *same bytes* assembled
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

**▶ THE REMEDY IS THE CLAIM, NOT THE GUARD, AND THE ARGUMENT IS `removedPrivateTags`' OWN.** *Where*
an attribute sat is the entire audit value of the field; withholding the tag would destroy it on
every well-formed file in order to bound a malformed one. So `contextPath` joins the list of report
fields that are not value-free - and **that list's numerals were deleted rather than incremented**,
because having to add a fifth to a list whose count had already been wrong three times is the same
disease one step removed. Corrected in `src/deident/types.ts`, the construction site in
`deidentify.ts`, `docs-content/spec-notes-tolerance.md` (its own row, bound: *none*),
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
`DICOM_ITEM_CROSSES_SEQUENCE_END` each reached separately - `renderTag` validates a tag's *shape* and
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

**▶ THREE RESIDUALS THIS REGISTRY DOES NOT CLOSE, EACH WITH AN ASSERTED ROW IN
`test/integration/fatal-diagnostic-surface.test.ts`.** All three are `PRE-EXISTING` and all three are
the same **product call** already filed for `report.removedPrivateTags`: on a well-formed file these
are the real tags of real attributes, so withholding them destroys the field's audit value to close a
shape only a crafted file produces.

1. The identical desynchronized read that fed the Tier-3 leaks lands on an **odd** group, so
   `resolveImplicitVR` calls the fabricated header a private element and the **Tier-2**
   `DICOM_PRIVATE_TAG_NO_CREATOR` names its tag: `4E495320`, `"IN S"`. Byte-identical on `0a8c6e3`.
   It is the `#78` fabricated-header residual one layer up.
2. `report.embeddedAttributes[].hidden` lists **every** tag in the run the embedded scanner found,
   and a run needs only **one** actionable attribute to be reported - so a fabricated header sitting
   beside a real one is listed too. Measured: `4D535449`, `"SMIT"` in wire order, beside the genuine
   `00100020` that made the run reportable.
3. Because of (1), **`ds.warnings[].message` is not unconditionally safe to log**, and
   `spec-notes-tolerance.md` and `cookbook.md` said it was. **The CLAIM is corrected, the guard is
   not widened** - this repo's own rule, and the shape `#55` paid a blocker for.

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
copying only the two new *non-behavioural* modules (`fatals.ts`, and `tokens.ts` whose diff is purely
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
"PS3.5 7.5". **None of the three is there.** Encapsulated Pixel Data is **A.4** (*Transfer Syntaxes
for Encapsulation of Encoded Pixel Data*), the `UN` form CP-246 addresses is **6.2.2** (*Unknown (UN)
Value Representation*), and the Sequence one is **7.5.2** (*Delimitation of The Sequence of Items*),
not §7.5 (*Nesting of Data Sets*, its parent). **The second correction is the interesting one: the
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
which is the property that matters and the reason it stays; not the absolute the draft asserted.

**Provenance:** PS3.5 read from the SHA-pinned
`vendor/nema/part05/4dfd7b8cbc7c368b7cf03e9c4b8a0773bed91266fcdb0bbf8ed634b7287cacca/part05.xml`,
whose own `<subtitle>` reads *DICOM PS3.5 2026c - Data Structures and Encoding*. **Located by the
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
  refuter, base `495c9fc`.) `keepsPrivate` still decides retention *before* the descent, and that is
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
  remedy added a test *after* the figure was taken and the figure was not re-run - the exact trap
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
  private tag `SQ` is an inference the **parser** draws from a profile *it* was given; pass the
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
  `RetainSafePrivate` + a `Profile` - the only route in the package that writes a private value into
  de-identified output - is never on). This remedy is reachable **only** from inside
  `keepRetainedPrivate`, which only that route reaches. **Never read that as coverage.** The net is
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
  `scripts/measure-sq-bound-grid.ts` ran `deidentify()` with **no options**, and `RetainSafePrivate`
  plus a `Profile` is the only route in the package that writes a private value into de-identified
  output. Three refuter passes read "0 PHI regressions" off that harness while this was live. The
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
  *"'RET' is used to indicate that the corresponding Data Element, SOP Class, or Transfer Syntax
  has been retired. Retired items are shown italicized. For retired items, the edition of the
  Standard in parentheses is the edition in which the item last appeared before it was retired.
  When the name of a retired Data Element has been reused, the retired element has the qualifier
  '(Retired)' added ..."* **🛑 QUOTE ALL FOUR - a first wording of this very paragraph quoted three
  and dropped the edition sentence, which is the partial read it exists to warn about, and a third
  refuter pass caught it here.** Read whole, **the ITALIC and the PARENTHESISED EDITION are the
  markings, and sentence 1 names Data Elements, SOP Classes and Transfer Syntaxes, so both reach
  UIDs; the `(Retired)` qualifier sentence is scoped to a REUSED DATA ELEMENT NAME and does not
  reach UIDs at all.** Annex A's intro **RESTATES** the third narrowed to UIDs, also one hit: *"For
  retired UIDs, ..."* - the fifth **Part** cell. **It restates; it does not add. Saying "adds" was
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
  closed set, a raw length has neither, so the bound has to be the signature. **`{n2}` stays and the
  asymmetry is structural, not a judgement call**: it is `endLimit - cursor.position` under the emit
  site's own `endLimit < buffer.length` conjunct, so it is a byte count bounded by the buffer.
  Measured against the identical attack - fabricating the **`SQ`**'s length field over the same name
  puts `endLimit` past the buffer and the code does not fire at all. Both pinned with a name-bearing
  payload and a mutation control. **A PHI test whose payload carries no name is vacuous BY FIXTURE**
  (`#55`'s was); this one goes red the moment the binding is removed.
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
  `src/dataset/vr/charset.ts` holds a **functional NUL** inside `/[\x00 ]+$/u` (DICOM's own padding,
  stripped by that regex), so grep classifies it binary. It carries no em dash, so it scans green.
  If it ever gains one, grep writes `binary file matches` to stderr with empty stdout and the
  stderr capture reds the run. Adding `-I` would make that same edit pass in silence, so do not add
  it, and do not remove the NUL to quiet the gate. When the gate goes red the fix is never to
  re-encode the character: rewrite with a period, colon, comma, or parentheses. Known limits are in
  the script header and are shared across every copy, so fix them there, not here.

## The attw wrapper gate

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

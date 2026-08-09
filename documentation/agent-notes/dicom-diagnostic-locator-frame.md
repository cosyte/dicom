# dicom - the locator had no frame, and the universal defending it was false (2026-08-08)

`DICOM-DIAGNOSTIC-PHI-RESIDUALS`, tenth instance, taken from `#93`'s pass-3 ranking. Written here
rather than in `documentation/agent-notes.md` because that file is **over** its 250,000-byte budget
on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.** The precedent is `#97`, `#98`,
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

## 1. What was open

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

## 2. The remedy, and why it is a slot removal rather than a filter

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

## 3. 🛑 THE UNIVERSAL DEFENDING THE BOUND WAS FALSE

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

## 4. 🛑 THE ARITY PIN DID NOT PIN WHAT IT CLAIMED

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

## 5. Every clean result here is pinned beside a positive

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

## 6. What is NOT closed, stated rather than implied

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

## 7. Blast radius a consumer sees

- `Error.message` suffix changes from `(offset=N)` to `(offset=N frame=F)` on **every** Tier-3 fatal
  and on every `{ strict: true }` escalation. A string match on that suffix stops matching. `err.code`
  is unchanged, and which files throw is unchanged.
- New public exports: `OFFSET_FRAMES` and `OffsetFrame`. New public readonly field:
  `DicomParseError.offsetFrame`.
- `DicomParseError`'s constructor gains a required fourth argument. It is `@internal` and no consumer
  is expected to call it, but it is not private, so this is stated rather than assumed harmless.

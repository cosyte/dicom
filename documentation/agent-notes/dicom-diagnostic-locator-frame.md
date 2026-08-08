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
fact, and two assignments are two chances to move the bytes and leave the label behind. `ParseFrame`
makes that not expressible. Every Tier-3 factory takes the same object rather than a `Buffer`, so a
call site cannot cut the snippet from the Item's slice and label the offset `"input"` - there is no
pair of arguments to disagree.

**The frame's NAME is published; its ORIGIN is not, deliberately.** Where a slice begins is the sum of
the declared lengths that reached it, so an error naming its own frame's origin would hand back by
subtraction the wire field these same messages withhold. That asymmetry is asserted, not just stated:
`"publishes the frame's NAME and never its ORIGIN"` searches every digit run of the message for
`202` and pins the clean result beside a reconstructed message that DOES publish it, which the same
search catches.

## 3. 🛑 THE UNIVERSAL DEFENDING THE BOUND WAS FALSE, IN FOUR ARTIFACTS

Three artifacts justified withholding a declared length with a variant of *"a fatal about a length
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
(`#80`), and had not been reworded since. Carriers corrected here: `README.md`,
`docs-content/spec-notes-tolerance.md`, and two places in `src/parser/fatals.ts` (the
`FILE_META_GROUP_LENGTH_OVERRUNS` registry comment and `fileMetaGroupLengthOverruns`'s JSDoc, the
second of which said "raised exactly when" and would have been missed by a phrase sweep). The sweep
was run **newline-folded** over every tracked file, against eleven phrasings, because a line-based
`grep` misses a claim that wraps.

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
| `leaksIn(err.message, payload)` is empty with the frame in the message | The whole existing detector, whose own non-vacuity control is `0a8c6e3`'s template, unchanged and still red |
| The frame label is `"value-slice"` inside an Item                      | The same number read against the caller's buffer returns 16 different bytes, asserted `false` on equality  |
| A root-level fatal still reports `"input"`                             | Its snippet equals the file cut at that offset, byte for byte                                              |
| A Deflated fatal reports `"inflated-dataset"`                          | Its offset is IN RANGE of the compressed input and its snippet still does not match it                     |

That last row is the one worth reading twice. `26 < 224`, so a bounds check on the offset would have
read clean: **"it does not index the input" is a statement about meaning, not about range**, which is
precisely why a label was needed and a range check is not a substitute.

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

## 7. Blast radius a consumer sees

- `Error.message` suffix changes from `(offset=N)` to `(offset=N frame=F)` on **every** Tier-3 fatal
  and on every `{ strict: true }` escalation. A string match on that suffix stops matching. `err.code`
  is unchanged, and which files throw is unchanged.
- New public exports: `OFFSET_FRAMES` and `OffsetFrame`. New public readonly field:
  `DicomParseError.offsetFrame`.
- `DicomParseError`'s constructor gains a required fourth argument. It is `@internal` and no consumer
  is expected to call it, but it is not private, so this is stated rather than assumed harmless.

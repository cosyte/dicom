---
"@cosyte/dicom": patch
---

Name the frame a `DicomParseError`'s byte offset is counted in, and correct the universal that was
defending the bound around it.

`err.byteOffset` was the sole locator on the two Tier-3 messages that lost their remaining-bytes
count, and it is slice-relative inside a defined-length Sequence Item: on one fixture the same
defect reports `0`, `24` or `40` depending on where inside the Item the offending element sits, while
that Item's slice begins at absolute offset 202. Nothing on the class said which coordinate system
the number was in, and the wrong reading is not detectable by a consumer. It is a valid index into a
buffer that returns a real element, just not the one the diagnostic named. On a fixture engineered
for the earlier snippet fix, reading the item-relative number against the file lands inside a planted
`"MR BRAIN SMITHSON "`.

**`DicomParseError.offsetFrame` is new and required**, drawn from the new `OFFSET_FRAMES` export
(`"input"`, `"inflated-dataset"`, `"value-slice"`). **Only `"input"` means the offset indexes the
buffer you passed in.** The frame is in the `Error.message` suffix as well as on the class, so that
suffix reads `(offset=N frame=F)` on every Tier-3 fatal and every `{ strict: true }` escalation: a
string match on it stops matching. `err.code` is unchanged and which files throw is unchanged.

The frame's **name** is published and its **origin** is not. Where a slice begins is the sum of the
declared lengths that reached it, so an error naming its own frame's origin would hand back by
subtraction the wire field these same messages withhold. Internally the frame's bytes and its name
travel as one object, so a frame change is one assignment and no call site can move the bytes and
leave the label behind. It does not make a deliberately mismatched pair impossible, and is not
described as doing so.

**The universal used to justify withholding a declared length, in the README, two package docs and
two places in the parser, was false and is corrected rather than reworded a second time.** A fatal "about a length field that lies" does not fire
only when a length field is lying: a spec-clean object cut short by two bytes raises
`ELEMENT_LENGTH_EXCEEDS_BUFFER` with every declared length honest, and one cut short inside its File
Meta group raises `FILE_META_GROUP_LENGTH_OVERRUNS` with `(0002,0000)` untouched. Both are measured.
The bound is right in either reading because the withheld number is four bytes a sender wrote either
way; the universal was never what made it right.

Also replaces an arity pin that did not pin what it claimed. It read
`Function.prototype.length`, which stops counting at the first defaulted parameter, so a factory that
had grown exactly the slot the pin refuses would still have read `2` and stayed green.

`UNSUPPORTED_TRANSFER_SYNTAX` keeps the behaviour every released version has: its `snippet` slot
carries PS3.6's own name for the unsupported UID rather than raw bytes, so it is the one fatal whose
snippet is not a cut of the frame it names. `DicomParseWarning.position` and `Element.byteOffset`
still carry no frame, and `err.snippet` is still 16 raw source bytes. All three are pre-existing, disclosed, and not closed here. The measurements,
the residuals, and every clean result with the positive it is pinned beside are in
`documentation/agent-notes/dicom-diagnostic-locator-frame.md`.

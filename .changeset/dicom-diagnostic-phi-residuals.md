---
"@cosyte/dicom": patch
---

A diagnostic about a PHI leak is itself a PHI surface: two of the four measured instances are closed,
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

---
"@cosyte/dicom": patch
---

A tag in a warning message is checked for membership in PS3.6's element registry now, and the
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

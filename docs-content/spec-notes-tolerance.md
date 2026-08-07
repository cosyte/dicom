---
id: spec-notes-tolerance
title: Tolerance & the warning model
sidebar_label: Tolerance & warnings
sidebar_position: 2
---

# Tolerance & the warning model

Real scanners and archives emit objects that deviate from the letter of the standard in documented,
recoverable ways: odd-length values with no padding, a missing preamble, an off-spec VR, a
group-length that disagrees with reality. `@cosyte/dicom` follows **Postel's Law**: the parser is
liberal (it recovers and records a stable-coded warning), and the serializer is conservative (it
always emits spec-clean Part 10). A recoverable quirk is **never** a silent change and never a throw.

## Two tiers plus a small fatal set

- **Recoverable deviations → a warning.** The parser recovers, keeps the data, and appends a
  `DicomParseWarning` to `ds.warnings` carrying a **stable code** and the **byte offset** where it
  occurred (e.g. `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_MISSING_PREAMBLE`, `DICOM_VR_MISMATCH`,
  `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`). **No count is written here.** One was, it read 25 while
  the registry held more, and the README's copy of the same numeral was corrected twice before being
  deleted. `WARNING_CODES` is the list, and the locked snapshot under
  `test/property/__snapshots__/` measures it on every run.
- **Unrecoverable structural corruption → a throw.** Only **four** Tier-3 conditions throw a typed
  `DicomParseError`: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, and
  `EMPTY_INPUT`. Everything short of "these bytes are not a readable Part 10 object" is a warning.

```ts runnable
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

// Synthetic object with the 128-byte preamble omitted: a recoverable quirk.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);

const ds = parseDicom(buf);

// It parsed. The data is intact...
ds.series.modality; // => "CT"
ds.patient.id; // => "MRN-42"

// ...and the deviation is recorded, not hidden.
ds.warnings.map((w) => w.code); // => ["DICOM_MISSING_PREAMBLE"]
ds.warnings[0]?.code === WARNING_CODES.DICOM_MISSING_PREAMBLE; // => true
typeof ds.warnings[0]?.position?.byteOffset; // => "number"
```

## Fatal input throws a typed error

An unreadable object throws `DicomParseError`, whose `.code` is one of the four fatal codes. Narrow
on it with `err instanceof DicomParseError`:

```ts runnable
import { parseDicom, DicomParseError, FATAL_CODES } from "@cosyte/dicom";

let code: string | undefined;
try {
  parseDicom(Buffer.alloc(0)); // no bytes at all
} catch (err) {
  if (err instanceof DicomParseError) code = err.code;
}

code; // => "EMPTY_INPUT"
code === FATAL_CODES.EMPTY_INPUT; // => true
```

## What a diagnostic carries, and what it does not

A Tier-2 warning's `message` is looked up in a frozen registry keyed by the warning code, and the
only substitutions are structural. No factory takes a string read out of the file, so a value cannot
be interpolated even by a future call site that tries. A token that fails its check renders as
`<withheld>` rather than being echoed. `w.code` and `w.position` carry nothing from the document.

**The three substitutions are bounded three different ways, and they are not interchangeable.**

- **`{tag}` is a MEMBERSHIP test.** `renderTag` renders a tag only when PS3.6's element registry
  carries a **literal row** for it. A repeating-group family row is not membership: `(50xx,xxxx)`
  Curve Data leaves the whole 16-bit element number free, so a family test admits 16 x 65,536 tags
  whose free bits are raw document bytes - `"\fPAR"` composes `500C5241` and returns all four
  payload bytes with one typed read.
- **`{vr}` is a membership test** against the 34 VRs PS3.5 2026c §6.2 defines.
- **A raw number a header carries has neither a shape nor a membership to test, so where it is
  bound at all the bound is the absence of the slot.** There is no `renderLength` and there must not
  be one. `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_NONZERO_RESERVED_BYTES` and
  `DICOM_PIXEL_DATA_LENGTH_MISMATCH` cannot be handed one. **And a raw number SHIFTED by a published
  structural constant is that raw number**, because one addition puts it back, so a bound on a
  rendering's magnitude bounds nothing about its content: `DICOM_ITEM_CROSSES_SEQUENCE_END` printed
  the bytes that remained inside the sequence, which is the sequence's own declared Value Length less
  the 8-byte Item header PS3.5 2026c §7.5.1 fixes. It cannot be handed either number now.

**The exceptions are named in ONE place and are deliberately not restated here** - the
`WARNING_MESSAGES` docblock in `src/parser/warnings.ts`. This list used to be carried in six
artifacts at once and every one of them was corrected twice, which is what a copy costs.

**What the membership rule closed.** Through `0.0.14` `renderTag` validated a tag's _shape_, and a
shape test admits all 2^32 tags. Measured: a `(0008,4000)` `ST` carrying `"MR BRAIN SMITHSON "` whose
Value Length under-declares by 12 desynchronizes the **Explicit VR LE** reader onto a fabricated
header whose declared length is odd, and `DICOM_ODD_LENGTH_VALUE_PADDED` rendered four bytes of the
payload as its tag - `4E495320`, `"IN S"` in wire order - **and four more as its decimal length**,
eight consecutive payload bytes in one message. On six other under-declare deltas
`DICOM_NONZERO_RESERVED_BYTES` printed two more bytes of the same name as two decimals.

**What it costs, stated rather than minimised.** A tag PS3.6 does not name one at a time stops
appearing in every message: **private** tags, **Group Length** `(gggg,0000)` tags, and
**repeating-group members** such as `(6000,3000)` Overlay Data. The element is still in the Data Set
under that tag, and `position.byteOffset` locates the header.

**Which channel carries a message is part of the answer.** The fixtures that produce a desynchronized
read mostly die before a `Dataset` exists, so their messages reach a consumer through `onWarning` or
through the `{ strict: true }` `DicomParseError` rather than a surviving `ds.warnings`. That no
measured fixture put one on a surviving `ds.warnings` is a fact about those fixtures and not a
promise about the parser.

**Two carriers this page named until recently are now bound, by a signature and not by a branch.**
`DICOM_PRIVATE_TAG_NO_CREATOR`, `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` and
`DICOM_PRIVATE_CREATOR_UNKNOWN` take no tag parameter at all: all three fire only on an **odd** group,
and an odd group is the one class of tag no closed table this library holds can vouch for - PS3.6's
registry is even-group and a `Profile`'s private dictionary is keyed by a creator string. The element
stays in the object under its tag and `position.byteOffset` locates the header.
`report.embeddedAttributes[].hidden` is bound too, by membership rather than by signature: an entry is
a tag the run's own resolved Annex E action fired on that has a **literal row** in PS3.15 Table
E.1-1 - 652 of them. **A repeating-group mask hit is excluded, and that is the load-bearing half**:
`(50xx,xxxx)` Curve Data leaves the whole 16-bit element number free, so a mask match proves a rule
exists without making the membership finite - a draft that stopped at "an even group" was measured
admitting `500C5241`, four payload bytes recoverable with one typed read. `hidden` can be empty on a
real finding, and it is still uncapped.

**A Tier-3 fatal's `message` is bounded the same way, and it was not always.** Every message
`parseDicom` throws now comes from a second frozen registry, keyed by the structural reason for the
refusal rather than by the fatal code (the four codes are locked, and several of them are raised for
more than one reason). Until this release four of those messages were assembled at the throw site out
of template literals and printed the element's tag, its declared length, or both. That reads as
harmless and is not: a fatal like "this element's Value Length reaches past the end of the buffer"
fires precisely when a length field is lying, which is what makes the reader read bytes inside
somebody's value as a Data Element header. Measured on a synthetic `"MR BRAIN SMITHSON "`, one such
message printed `Element 41524E49 declared length=1330858068`: that is `"RAIN"` followed by
`"THSO"`, eight consecutive bytes of the payload in two fields, each recoverable with a single typed
read.

The bound is the same one the Tier-2 registry uses, and it is structural rather than a discipline:
**the factory signatures take no tag and no wire-length parameter at all**, so there is no slot for
one to travel through. `position.byteOffset` identifies the element instead. What a fatal message can
still carry is named one entry at a time: a VR checked against the closed 34-VR set, a byte count
bounded by the buffer being read, a library constant, PS3.6's registry name for an unsupported
Transfer Syntax UID, and a zlib error code checked against zlib's own nine-name table.

**A `DicomParseError` is still different from a warning, and this is the one to read carefully.** It
carries a `snippet`: up to 16 bytes of the source rendered as hex, attached so a structural failure
is debuggable. Those are raw input bytes. On a real clinical file they can be part of a patient name
or an identifier, and the library does not redact them. Log `err.code`, `err.byteOffset` and
`err.message`; treat `err.snippet` as PHI and redact it at your own boundary if your compliance
posture requires it. (The one exception is deliberate: for `UNSUPPORTED_TRANSFER_SYNTAX` the snippet
slot carries the dictionary's _name_ for the UID when PS3.6 publishes one, which is a constant, not
input.)

**The snippet is now cut in the same frame its `byteOffset` is counted in.** It was not: the offset
moved with the frame (file-absolute at the root, relative to the enclosing slice inside a
defined-length Sequence or Item, into the inflated stream under Deflated Explicit VR LE) while the
cut was always taken from the whole file, so a `{ strict: true }` escalation raised inside a
defined-length Item returned the 16 bytes sitting at that item-relative number measured from byte 0
of the file. That is a diagnostic handing back part of an element the reader was never asked about.
Fixed. **It does not make the snippet safe**: the bytes are still raw source bytes, and the fix makes
them more certainly the element's own content, not less.

### The model fields that are bounded, and the ones that are values

A downstream package that reads this model and builds its own diagnostics from it needs to know which
strings are identifiers this parser composed and which are bytes the sender wrote. These are
identifiers, with the bound each one actually has. Some rows are a length rather than a membership
test, and they say so. **And `contextPath` has no bound at all** - it was listed here as
structural until it was measured, and it now has its own row saying what it really is. It is not the
only entry read off the wire (`removedPrivateTags` and `UnauditableSequenceFinding.tag` are too, and
are disclosed as such in [Troubleshooting](./troubleshooting)); it is the one that was described as
though it were not:

| Field                                                                                 | Bound                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Element.tag`                                                                         | Composed here: eight uppercase hex digits from the header's four bytes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Element.vr`                                                                          | Two bytes, taken from the wire as-is. **Checked against the closed 34-VR set only where a message renders it**, so a non-conformant sender's two bytes do reach this field (Postel's Law: the on-wire VR is trusted). Two bytes is a hard length bound, not a membership one.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Element.privateCreator`                                                              | The active `Profile`'s private dictionary must name it, or it reads `<withheld>`. With no profile, nothing is recognized. It is populated only from a block reservation made in the element's **own** Data Set, so it is `undefined` on a private element in a Sequence Item that claimed no block.                                                                                                                                                                                                                                                                                                                                                                                            |
| `Element.specificCharacterSet`                                                        | PS3.3's closed defined-term table must name it, or it reads `<withheld>`. The exported `parseSpecificCharacterSet` bounds its results the same way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `FileMeta.transferSyntaxUID`                                                          | One of exactly four literals: any other value is a fatal, so no parsed dataset carries one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `FileMetaRawElement.tag` / `.vr`                                                      | As above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DeidentifiedAttribute.tag` / `.keyword` / `.action` / `.applied` / `.repeatingGroup` | Composed from the Part 6 and Annex E tables. `tag` is bound to a tag those tables carry a row for, which is membership in a closed table; an attribute Annex E has no row for is not audited here at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DeidentifyReport.removedPrivateTags` / `.retained`                                   | Tags, and the option names you passed in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `contextPath`, on `DeidentifiedAttribute` and on all three findings that carry one    | **Unbounded, and this row is the correction.** A segment is `TAG[index]`; the tag half is whatever tag the descent walked, read off the wire, with neither a shape test nor a closed table behind it. On a file whose under-declared Value Length desynchronized the reader onto four bytes inside somebody's value, those four bytes are published here. Measured: a `LO` carrier holding `MRS BRAIN SMITHSON` yields `contextPath: ["53484E4F[0]"]`, which is `HSON` in wire order, with no warning and every finding array empty. Treat it as PHI when the source is untrusted.                                                                                                             |
| `EmbeddedAttributeFinding.tag` / `.vr` / `.hidden`                                    | Composed. `hidden` holds tags this parser built from four bytes each, and the bytes were sitting inside a value - so they are re-composed as `Tag` here, never echoed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `UnauditableSequenceFinding.tag` / `.byteLength`, `UndefinedVrFinding.byteLength`     | Composed, plus an input-derived number, and **the number is the part this row exists to correct**. `byteLength` is `Element.rawBytes.length`, which EQUALS the declared Value Length read off the element header, so where that header was fabricated by an under-declared length upstream it is four document bytes wearing a decimal: `"SO\0\0"` publishes `20307`, two letters of a surname, put back with one `readUInt32LE`. The bytes are never echoed; the number they decode to is. `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` rendered the same number through `0.0.14` and do not any more, which leaves these fields its only publisher. |

Everything else on the model is a **value**, and carries whatever the file carried:
`Element.rawBytes`, `Element.value`, `FileMeta.mediaStorageSOPClassUID`,
`.mediaStorageSOPInstanceUID`, `.implementationClassUID`, `.implementationVersionName`,
`.sourceApplicationEntityTitle`, `.fileMetaInformationVersion`, `FileMetaRawElement.value`, and the
**keys** of `DeidentifyReport.uidMap` (the source UIDs, kept so replacement stays consistent across a
study). Treat those as PHI. They are what the parser is for.

See [Troubleshooting](./troubleshooting) for the full symptom table and the logging posture.

## Escalate when you want strictness

The tolerance posture is not fixed. A [source profile](./spec-notes-profiles) can **escalate** chosen
warning codes to a thrown error (a stricter gate for a trusted sender) or **suppress** benign,
high-volume codes for a known-quirky source, without ever loosening a correct decode. The built-in
`profiles.strict` and `profiles.lenient` are the two ends of that dial.

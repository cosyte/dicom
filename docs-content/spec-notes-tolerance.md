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
  occurred. There are 25 such codes today (e.g. `DICOM_ODD_LENGTH_VALUE_PADDED`,
  `DICOM_MISSING_PREAMBLE`, `DICOM_VR_MISMATCH`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`).
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

A Tier-2 warning's `message` is not composed from the document. It is looked up in a frozen registry
keyed by the warning code, and the only substitutions are structural: a tag this parser composed from
the element header's four bytes, a VR checked against the closed 34-VR set, and input-derived
**numbers** (a declared length, a byte count, a value index). No factory takes a string read out of
the file, so a value cannot be interpolated even by a future call site that tries. A token that fails
its check renders as `<withheld>` rather than being echoed.

So `w.code` and `w.position` are safe to log. **`w.message` is safe on every well-formed file and is
not unconditionally safe, and the difference is one shape.** The registry's `{tag}` slot is filled by
`renderTag`, which validates a tag's *shape* and therefore cannot refuse one that a length field's lie
composed out of somebody's value. Measured: a `(0008,4000)` `ST` carrying `"MR BRAIN SMITHSON "` whose
Value Length under-declares by 12 desynchronizes the reader onto a fabricated header at an odd group,
and `DICOM_PRIVATE_TAG_NO_CREATOR` names it `4E495320` - `"IN S"`, four bytes of the payload, in wire
order. `PRE-EXISTING` on every release that has this code. It is disclosed rather than guarded because
withholding the tag there would take it off every private element in every conformant file, which
costs the diagnostic its whole purpose to close a shape only a crafted file produces; that is a
product decision, not a defect fix. The same is true of `report.removedPrivateTags` and of
`report.embeddedAttributes[].hidden`. **If you log warning messages from untrusted files verbatim,
treat a tag in one as document-derived.**

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
identifiers, with the bound each one actually has. One of them is a length rather than a membership
test, and its row says so:

| Field                                                                                                  | Bound                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Element.tag`                                                                                          | Composed here: eight uppercase hex digits from the header's four bytes.                                                                                                                                                                                                                             |
| `Element.vr`                                                                                           | Two bytes, taken from the wire as-is. **Checked against the closed 34-VR set only where a message renders it**, so a non-conformant sender's two bytes do reach this field (Postel's Law: the on-wire VR is trusted). Two bytes is a hard length bound, not a membership one.                       |
| `Element.privateCreator`                                                                               | The active `Profile`'s private dictionary must name it, or it reads `<withheld>`. With no profile, nothing is recognized. It is populated only from a block reservation made in the element's **own** Data Set, so it is `undefined` on a private element in a Sequence Item that claimed no block. |
| `Element.specificCharacterSet`                                                                         | PS3.3's closed defined-term table must name it, or it reads `<withheld>`. The exported `parseSpecificCharacterSet` bounds its results the same way.                                                                                                                                                 |
| `FileMeta.transferSyntaxUID`                                                                           | One of exactly four literals: any other value is a fatal, so no parsed dataset carries one.                                                                                                                                                                                                         |
| `FileMetaRawElement.tag` / `.vr`                                                                       | As above.                                                                                                                                                                                                                                                                                           |
| `DeidentifiedAttribute.tag` / `.keyword` / `.action` / `.applied` / `.contextPath` / `.repeatingGroup` | Composed from the Part 6 and Annex E tables plus a structural `TAG[index]` chain.                                                                                                                                                                                                                   |
| `DeidentifyReport.removedPrivateTags` / `.retained`                                                    | Tags, and the option names you passed in.                                                                                                                                                                                                                                                           |
| `EmbeddedAttributeFinding.tag` / `.vr` / `.hidden` / `.contextPath`                                    | Composed. `hidden` holds tags this parser built from four bytes each, and the bytes were sitting inside a value - so they are re-composed as `Tag` here, never echoed.                                                                                                                              |
| `UnauditableSequenceFinding.tag` / `.byteLength` / `.contextPath`                                      | Composed, plus one input-derived number: `byteLength` is the size of the value that was dropped, never any of its bytes.                                                                                                                                                                            |

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

---
id: limitations
title: Known limitations
sidebar_label: Known limitations
sidebar_position: 3
---

# Known limitations: the "do not over-trust" list

Read this page before you put `@cosyte/dicom` in front of real data.

Mis-reading a patient identifier, an image's signedness, or a rescale slope can cause real clinical
harm, and a de-identifier that reports a clean run it did not perform is worse than one that refuses.
This package is engineered to prevent over-trust, so the boundary is a **deliverable**, not a
footnote: it is a page of its own, held to the same bar as the rest of these docs, and the
introduction and the cookbook link into it from every route that depends on it.

**This page is an index, not a census.** Each entry is one line plus a link to the section that owns
it, and the owning section is where the measurements, the fixtures and the residuals live. Read the
section before concluding a class is closed. Nothing here is a count: counts in this repository have
been corrected twice and then deleted.

---

## 1. Scope: what v1 does not do at all

These are non-goals, not gaps. Each is a companion package or another tool's job.

| Not in v1                                                                                                                                                                                           | Where it goes         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Pixel decode or decompression** of any compressed transfer syntax (JPEG, JPEG-LS, JPEG2000, RLE, HTJ2K), rendering, windowing, or any measurement computed from pixels                            | `@cosyte/dicom-pixel` |
| **Reading a pixel-compressed object at all.** A transfer syntax outside the four supported ones is the fatal `UNSUPPORTED_TRANSFER_SYNTAX`, so such an object does not parse, not even structurally | `@cosyte/dicom-pixel` |
| **Burned-in annotation removal / Clean Pixel Data.** A de-identified output from this package is **metadata-de-identified only**, and it warns rather than claiming otherwise                       | `@cosyte/dicom-pixel` |
| **Networking.** No DIMSE: no C-STORE, C-FIND, C-MOVE, MWL or MPPS                                                                                                                                   | `@cosyte/dicom-net`   |
| **Web services.** No DICOMweb: no QIDO, WADO or STOW                                                                                                                                                | `@cosyte/dicomweb`    |
| **Transcoding.** The serializer re-emits in the dataset's source transfer syntax only                                                                                                               | out of scope          |
| **Terminology resolution.** Coded values are surfaced with their designator and canonical source but are never validated, looked up, or cross-mapped; `SRT` is not normalized to `SCT`              | `@cosyte/terminology` |
| **Typed SR and RT models.** SR content trees and RT objects are navigable as raw structure, with no clinical model over them. Deliberately flagged and deferred rather than half-built              | out of scope for v1   |
| **Patient matching.** Patient ID is surfaced with its issuer; the library never decides that two identifiers are the same person                                                                    | out of scope          |

Supported transfer syntaxes, and exactly these four: Implicit VR LE `1.2.840.10008.1.2`, Explicit VR
LE `...1.2.1`, Deflated Explicit VR LE `...1.2.1.99`, Explicit VR BE `...1.2.2` (retired,
legacy-only). Deflated is the one compressed syntax in the set, and it deflates the whole dataset
stream rather than the pixels.

---

## 2. Open PHI residuals: measured, disclosed, and NOT closed

**None of these is an all-clear, and a `DeidentifyReport` that reads clean does not by itself close
any of them.** Each is either a product decision this package has deliberately not made, or a
structural fact about DICOM that no reader can resolve from the wire.

- **A retained private attribute can leak through routes whose extent is a matrix, not a sentence -
  and every one of them is now DISCLOSED rather than silent.** `RetainSafePrivate` plus a `Profile`
  is the only route in the package that writes a private value into de-identified output, and what
  survives depends on where the sender put the Private Creator, which VR the carrier was written
  under, and whether the profile also reached `parseDicom`. The surface is **pinned as a measured
  matrix** in `test/integration/deident-private-reservation.test.ts` rather than described in prose,
  because the prose has been wrong twice. **A retained private value this package keeps unexamined
  raises `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE` and adds a `report.unauditableSequences` entry
  with `applied: "kept"`, subject to the three bounds named next** - so a Data Set the sender nested
  inside such a value still reaches your output verbatim under `(0012,0062) = YES`, but no longer
  under an empty report. **The three bounds, because "every" would be false:** a retained Private
  Creator `(gggg,00EE)` raises nothing (it is retained only when its whole decoded value is a member
  of your profile's private dictionary, which is an enumeration), a zero-length value raises nothing
  (it encodes no Data Set), and the record stops at 64 entries of this class, so an array with 64 of
  them means "at least 64" and not a total. The action is not capped by any of that, because there is
  no action: the value is kept either way. 🛑 **That is a disclosure, not a fix: the value is still
  there.** Emptying
  it needs a content test on exactly the VRs arbitrary bytes are for, which would also empty
  conformant binary values on legitimate files - an open product question, weighed and deliberately
  answered the other way. Detail:
  [Known limitations in the README](https://github.com/cosyte/dicom#known-limitations--non-goals).

- **An over-declared Value Length into a binary carrier still leaks.** A length that swallows the
  following element into an `OB`, `OW`, `US` or `UN` value is not detected, and a `(0010,0020)`
  Patient ID inside it reaches de-identified output with **no warning and no report entry**. That is
  measured and still exactly true for this route, which is every default `deidentify()` run: the only
  carrier that gets a diagnostic is one that is itself a private attribute being retained under
  `RetainSafePrivate` plus a `Profile` (the bullet above), and what that diagnostic says is
  "unaudited", never "a swallow was detected here". Arbitrary
  bytes are exactly what those VRs are for, so no content test can decide it. String carriers **are**
  covered, because there the same bytes are provably outside the VR's repertoire. If you accept files
  from a sender you do not control, treat a binary attribute's declared length as untrusted.

- **`(0012,0063)` De-identification Method can carry a value longer than the VR permits, and this
  library is the likeliest writer of it.** PS3.5 2026c Table 6.2-1 caps an `LO` at 64 characters **per
  Value**, and `(0012,0063)` is `1-n`. Every object this package de-identified without a
  caller-supplied method string, in every release up to and including this one, carried a single
  Value longer than that, in the one attribute a strict receiver reads to decide whether the object
  was de-identified at all. The method text is multi-valued now, one Value for the Profile and one per
  active Option. **Re-de-identifying an object written by an earlier release keeps the over-long
  Value**, because a prior record is added to rather than rewritten, which is the conformant act
  (PS3.15 2026c §E.1.1: the method text is "inserted in or added to" the attribute). Your own
  `deidentificationMethod` is **not** bounded for you either: split it on `\` yourself if a strict
  receiver is in your path.

- **`contextPath` on a `DeidentifyReport` finding is inert and is not structural.** It is not a key
  you can look anything up with, it is corroborated by nothing else in the report, and each segment's
  tag half is read off the wire with nothing behind it, so a fabricated `SQ` header the reader was
  desynchronized onto is named there. **It is not safe to log.**

- **What a warning message may contain, as a mechanism rather than as a verdict.** The verdict form
  of this bullet ("safe on a well-formed file, not unconditionally safe") was corrected twice, so it
  is deleted rather than given a third wording. The registry's `{tag}` slot renders **only a tag
  PS3.6's element registry carries a literal row for**, and `<withheld>` otherwise; `{vr}` renders
  only one of the 34 VRs PS3.5 2026c §6.2 defines; and **a raw number a header carries is bound out
  of the factory signature where it is bound at all**, because a declared Value Length has neither a
  shape nor a membership a renderer could test. `w.code` and `w.position` carry nothing from the
  document.
  **And a raw number SHIFTED by a constant the reader can compute is that raw number**, which is the
  eighth instance of this class: `DICOM_ITEM_CROSSES_SEQUENCE_END` printed the bytes that remained
  inside the sequence, and that count is the sequence's own declared Value Length less the bytes of
  that sequence already consumed.
  **The exceptions are named in ONE place that is not a record of a past change, and are
  deliberately not restated here** - the `WARNING_MESSAGES` docblock in `src/parser/warnings.ts`. No count of the copies is quoted, here or
  there: this package deletes a count it has corrected twice rather than incrementing it.
  **What that closed, measured on an `ST` carrying `"MR BRAIN SMITHSON "` whose Value Length
  under-declares:** under Explicit VR LE the reader desynchronizes onto a fabricated header whose
  declared length is odd, and through `0.0.14` `DICOM_ODD_LENGTH_VALUE_PADDED` rendered **four bytes
  of the name as the tag and four more as the decimal length** - eight payload bytes in one message.
  `DICOM_NONZERO_RESERVED_BYTES` printed two more as decimals on six other deltas. Both are closed.
  **What it costs, stated rather than minimised:** a message about a **private** element, a **Group
  Length** `(gggg,0000)` or a **repeating-group member** such as `(6000,3000)` Overlay Data no longer
  names its tag on any file, well-formed or not. The element is still in the Data Set under that tag,
  and `position.byteOffset` locates the header.
  **The channel still matters as much as the field.** The fixtures that produce a desynchronized read
  mostly die before a `Dataset` exists, so what carries their messages is `onWarning` and the
  `{ strict: true }` `DicomParseError` rather than a surviving `ds.warnings` - a fact about those
  fixtures and not a promise about the parser. Treat both channels the same way.
  Full treatment: [Keeping PHI out of logs](./troubleshooting#keeping-phi-out-of-logs).

- **Two carriers this list named at `0.0.13` are now bound, and neither bound is an all-clear.**
  `DICOM_PRIVATE_TAG_NO_CREATOR` and its two sibling private-tag codes take no tag at all any more,
  because an odd group is the one class of tag no closed table this library holds can vouch for; the
  element is still in the object and `position.byteOffset` still locates it.
  `report.embeddedAttributes[].hidden` now lists only tags this run acted on that have a **literal
  row** in PS3.15 Table E.1-1 - 652 of them - rather than any four bytes a run tiled over. **A
  repeating-group mask hit is excluded and that exclusion is the whole bound**: `(50xx,xxxx)` Curve
  Data leaves the entire 16-bit element number free, so a mask match proves a rule exists without
  making the membership finite, and a draft that stopped at "an even group" was measured admitting
  `500C5241`. Two consequences: `hidden` can be **empty on a real finding**, which does not mean
  nothing was hidden, and it is still **uncapped**. `report.removedPrivateTags` is deliberately
  unchanged: narrowing it would empty the field on every well-formed file, which is what it exists to
  record.

- **A `DeidentifyReport` is not safe to log whole.** The value-bearing fields are named on the
  `DeidentifyReport` type. **Read the list on the type, never a count quoted anywhere** (including
  here): the count read one, then two, then three, and was wrong each time.

- **A `DicomParseError` is not safe to log whole.** It carries `snippet`, up to 16 raw source bytes as
  hex, and the library does not redact them. Log `err.code`, `err.byteOffset`, `err.offsetFrame` and
  `err.message`. `{ strict: true }` turns **every** Tier-2 warning into one of these, so a PHI review
  of the lenient path does not transfer to the strict one.

---

## 3. Structural facts that no reader can resolve

These are not defects and they will not be fixed, because the information needed to fix them is not
on the wire.

- **An over-declaring element and a well-formed one are byte-identical.** Intent is not encoded. Any
  remedy therefore lives at the de-identify boundary or is a warning, never a parser bound.
- **A Data Set is a `Map<Tag, Element>`, so a repeated tag loses a value.** The last read wins and
  nothing is guessed for the one it replaced; `DICOM_DUPLICATE_TAG_IN_DATA_SET` reports the loss. The
  File Meta group loses a repeat the **opposite** way round, first-match wins, reported by
  `DICOM_DUPLICATE_FILE_META_ELEMENT`. Neither can fire on a conformant file.
- **`Element.byteOffset` inside a sequence item disagrees with itself and always has**: `0` inside a
  defined-length item (its own frame), file-absolute inside an undefined-length one. The same is true
  of a warning's `position.byteOffset`. There is no frame-of-reference contract on either, and
  **neither is covered by `DicomParseError.offsetFrame`** - that names the frame for a thrown fatal
  and for the `{ strict: true }` escalation of a warning, and for nothing on the lenient path.
  Measure it rather than assuming one.
- **A failed CP-246 `UN` descent emits nothing.** The honest test for a consumer is
  `el.items === undefined`, **not** `ds.warnings`.
- **`NESTING_DEPTH_LIMIT` is this library's bound, not the standard's.** A fully conformant file
  nested deeper than it is refused, and a sequence refused that way is emptied by `deidentify()`
  rather than shipped, so expect data loss on such a file.

---

## 4. What is deliberately never defaulted

The dangerous DICOM failure is the confident, wrong image, so the typed views answer "absent" rather
than substituting a plausible value. `undefined` means the object did not carry the attribute.

- `image.rescaleSlope` / `image.rescaleIntercept`: **`undefined` must not be read as 1 and 0.**
- `image.signed`: `undefined` when `(0028,0103)` Pixel Representation was absent, never `false`.
- `image.photometricInterpretation`: never defaulted to `MONOCHROME2`.
- `image.pixelSpacing` and `image.imagerPixelSpacing`: different measurements, never substituted for
  each other.
- `patient.id`: a string the sending system chose. Not globally unique, and never matched for you.
- A malformed `DS` or `IS` token decodes to `null`, never to `NaN` coerced to `0`.

---

## 5. Where the detail lives

| Topic                                                                       | Page                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| The error model, symptom-by-symptom triage, and the full boundary narrative | [Troubleshooting](./troubleshooting)                                 |
| What a diagnostic carries and what it does not                              | [Tolerance](./spec-notes-tolerance)                                  |
| Keeping PHI out of logs                                                     | [Keeping PHI out of logs](./troubleshooting#keeping-phi-out-of-logs) |
| The safety-critical views and their fail-safe rules                         | [Safety](./spec-notes-safety)                                        |
| Working recipes, each citing the PS3 clause it reads                        | [Cookbook](./cookbook)                                               |

Everything on this page is a documented boundary rather than a bug. Where a limitation applies, the
raw bytes are preserved (usually with a warning); they are simply not interpreted further.

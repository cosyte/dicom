---
id: troubleshooting
title: Troubleshooting & known limitations
sidebar_label: Troubleshooting
sidebar_position: 1
---

# Troubleshooting & known limitations

`@cosyte/dicom` is built to be **correct and honest about its edges** rather than to claim more than
it delivers. Mis-reading a patient identifier, an image's signedness, or a rescale slope can cause
real clinical harm, so this page is the deliberate "do not over-trust" list: the error model, common
symptoms, and (critically) the explicit **metadata-first boundary** and the list of what is **not**
in scope. Everything here is a documented boundary, not a bug: the lenient parser never silently drops
or garbles data; where a limitation applies, the raw bytes are preserved (often with a warning), they
are simply not further interpreted.

## When does it throw vs warn?

Only **four** unrecoverable Tier-3 conditions throw a `DicomParseError`; everything else is a warning
on `ds.warnings`.

```ts runnable throws
import { parseDicom } from "@cosyte/dicom";

// Bytes that are not a Part 10 object: a structural fatal, not a tolerated quirk.
parseDicom(Buffer.from("plainly not a DICOM object, just ASCII bytes", "ascii"));
// throws DicomParseError (NOT_DICOM_PART_10)
```

| Fatal code (throws)           | Meaning                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `NOT_DICOM_PART_10`           | No preamble/`DICM` and no recoverable File Meta: not a Part 10 object. |
| `INVALID_FILE_META`           | The File Meta group is present but structurally unreadable.            |
| `UNSUPPORTED_TRANSFER_SYNTAX` | The transfer syntax UID is not one of the four v1 syntaxes.            |
| `EMPTY_INPUT`                 | Zero-length input.                                                     |

Narrow on the caught error via `err instanceof DicomParseError` and `err.code === FATAL_CODES.*` (see
[Tolerance & the warning model](./spec-notes-tolerance)). Everything a real-world archive does short
of that (a missing preamble, an odd-length value, an off-spec VR, a group-length mismatch) is a
warning you triage, not an exception you catch.

## Common symptoms

| Symptom                                                                                                             | Likely cause                                                                                                                                  | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ds.get("PatientName")` is `undefined`                                                                              | `get` takes the **tag** form, not a keyword                                                                                                   | Use the tag (`ds.get("00100010")`), or resolve a keyword with `Dictionary.byKeyword("PatientName")?.tag`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ds.image.rescaleSlope` is `undefined`                                                                              | Rescale Slope was absent                                                                                                                      | This is by design. It is **not** defaulted to `1`. Apply a fallback deliberately in your own code if the modality warrants it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ds.image.signed` is `undefined`                                                                                    | Pixel Representation `(0028,0103)` was absent                                                                                                 | Signedness is unknown, never guessed. Do not assume unsigned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A `DICOM_VR_MISMATCH` warning                                                                                       | The on-wire Explicit VR disagreed with the dictionary                                                                                         | The **on-wire** VR is used (Postel's Law: on the read path the sender's own declaration wins) and the deviation recorded; check the sender's encoding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A `DICOM_PRIVATE_CREATOR_UNKNOWN` warning                                                                           | A private tag's creator is not in the active profile                                                                                          | The element degrades to `UN`; add the creator via a [profile](./spec-notes-profiles) to resolve it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ds.get(tag)?.value` is `{ kind: "binary" }` for Pixel Data                                                         | Pixel data is exposed raw, never decoded                                                                                                      | Expected. Decoding pixels is out of scope (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning after `deidentify`                                               | The object may carry burned-in PHI in the pixels                                                                                              | Metadata de-id cannot clean pixels; route to a pixel-cleaning step before sharing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A `DICOM_SQ_NOT_DESCENDED` warning                                                                                  | A defined-length Implicit VR LE element resolved to `SQ` from the dictionary, but its value is not an `(FFFE,E000)` item stream               | The bytes are kept intact on `Element.rawBytes` and the rest of the object parses, but `Element.items` is absent, so nothing can navigate inside it. `deidentify()` therefore **empties** that element rather than shipping bytes it cannot audit, unless `RetainSafePrivate` plus a profile vouched for it - see the next row.                                                                                                                                                                                                                                                                                                                                                                              |
| A `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` warning after `deidentify`, and an attribute you expected is now empty | An element reached `deidentify()` whose on-wire VR is not one of the 34 PS3.5 §6.2 defines, so no Table E.1-1 row can say what its bytes mean | Fail-safe by design. Two very different files reach it: one **conformant to a future edition of PS3.5**, carrying a VR this release does not know (the header is read correctly per §6.2 and the value is emptied anyway, because nothing can classify it); and one **malformed upstream**, where an under-declared Value Length left the reader mid-value and leftover bytes tiled into a Data Element header. `report.undefinedVrElements` names the **byte offset** and the byte length dropped - deliberately not a tag, because on the second route a fabricated header's tag bytes are part of some element's value. Capped at 64 entries; the emptying is not. An Implicit VR LE file cannot trip it. |
| A `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` warning after `deidentify`, and a sequence you expected is now empty       | That `SQ` element reached `deidentify()` with no items, so its item stream could not be walked                                                | Fail-safe by design: PS3.15 §E.1.1 obliges a de-identifier to reach listed attributes inside a Sequence of Items, and a run that cannot enumerate them must not pass them through. `report.unauditableSequences` names the tag and the byte length dropped (capped at 64; the emptying is not). Usually a sender-side encoding defect, but not always: a conformant file nested past this library's own `NESTING_DEPTH_LIMIT` of 64 is refused identically.                                                                                                                                                                                                                                                  |
| A `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED` warning after `deidentify`, and a value you expected is now empty      | The sender over-declared that element's Value Length, so the element that followed it was absorbed into its value                             | The carrier is emptied rather than kept, because an attribute encoded inside a value is invisible to the PS3.15 action table. `report.embeddedAttributes` names the carrier and the tags that were hiding in it. The file is malformed at source - raise it with the sender.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Keeping PHI out of logs

A Tier-2 **warning** is safe to log whole. Its `message` comes from a frozen registry keyed by the
code, and the only things substituted into it are structural: a tag, a VR checked against the closed
34-VR set, and input-derived numbers. No warning factory accepts a string read out of the document,
so `ds.warnings` holds codes, positions and registry prose, not patient data.

Two things that array does **not** cover:

- **A `DicomParseError` carries a `snippet`**: up to 16 bytes of the source as hex. Those are raw
  input bytes and the library does not redact them. Log `err.code`, `err.byteOffset` and
  `err.message`; treat `err.snippet` as PHI.
- **Value-decode deviations do not appear on `ds.warnings`.** Decode is lazy, so a `DA` in a legacy
  format or a `UI` with the wrong pad surfaces on the decoded value's own `warnings`
  (`el.value.warnings`), never folded into the frozen dataset array. Those messages are built from
  the same registry and are equally safe, but a logger that only reads `ds.warnings` will not see
  them at all.

A `DeidentifyReport` is safe to log **except for `uidMap`**, whose keys are the source UIDs read out
of the file. They are there so UID replacement stays consistent across a study, and a study UID is a
unique identifier: the rest of the report (tags, keywords, action codes, sequence context paths) is
composed from static tables and carries nothing.

The field-by-field split between identifiers and values is in
[Tolerance](./spec-notes-tolerance#the-model-fields-that-are-bounded-and-the-ones-that-are-values).
Keep the same discipline in your own code: log `w.code` and `w.position`, not the element value.

## What's not yet parsed, and what is out of scope

Depth tracks the code and never leads it. These are the deliberate boundaries, authored here so a
reader never relies on something absent.

### The metadata-first boundary (scope, by design)

`@cosyte/dicom` reads and writes DICOM **metadata**. These are permanent non-goals for this package.
Each is tracked as a future companion package, not a gap to be filled here:

- **No pixel decoding.** Pixel Data is exposed as a raw `Buffer` (and, for encapsulated transfer
  syntaxes, its fragments) and is **never** decoded, decompressed, windowed, rescaled, or
  color-transformed. Rescale Slope/Intercept, Window Center/Width, and the LUT sequences are surfaced
  as metadata, but applying them to produce displayable pixels is deferred to `@cosyte/dicom-pixel`.
- **No DIMSE networking.** There is no C-STORE / C-FIND / C-MOVE / C-ECHO, no SCU/SCP, no association
  negotiation. This is a file/buffer library, not a PACS node. That is `@cosyte/dicom-net`.
- **No DICOMweb.** No QIDO-RS / WADO-RS / STOW-RS client or server: deferred to `@cosyte/dicomweb`.
- **No pixel-level de-identification.** `deidentify` cleans metadata per PS3.15 Annex E; burned-in
  annotation is **warned, never removed** (`DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`). Pixel scrubbing
  belongs to `@cosyte/dicom-pixel`.

### Boundaries within the metadata surface

- **Four v1 transfer syntaxes.** Implicit VR LE, Explicit VR LE, Explicit VR BE, and Deflated
  Explicit VR LE are read and written. A compressed pixel stream inside those syntaxes is passed
  through byte-for-byte, never decompressed.
- **Only typed `FileMeta` fields round-trip.** `serializeDicom` recomputes a spec-clean File Meta
  group; File Meta elements outside the typed model are not preserved verbatim through the model.
- **De-identification is metadata-only and fail-safe toward removal.** Conditional Annex E codes
  collapse to their most-protective branch (no IOD Type-1 analysis); private attributes are removed
  by default unless a profile marks a creator's tags safe.
- **An element that over-declares its own Value Length hides the next element inside its value, and
  `deidentify()` empties rather than keeps it.** PS3.5 defines Value Length as the length of _that_
  element's Value Field; a sender that writes a larger number produces a file whose reading is
  self-consistent and in which the following element has been absorbed, header and all. Nothing on
  the wire says which length lied, so `parseDicom` reads it exactly as written and this is **not**
  recoverable at parse time. What `deidentify()` does is narrower and fail-safe: before keeping a
  value, it checks whether the value's tail decodes - in the file's own transfer syntax - as whole
  Data Elements ending exactly at the end of the value, at least one of which this run would have
  acted on, and containing a byte the carrier's VR cannot legally hold (PS3.5 §6.1.3 and Table 6.1-1
  permit five control characters in DICOM text; Table 6.2-1 decides which of them each VR may hold -
  all five in `LT`/`ST`/`UT`, ESC only in `LO`/`SH`/`UC`/`PN`, none elsewhere). If so the value is emptied,
  `report.embeddedAttributes` records the carrier and the tags found inside it, and
  `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED` is raised. **Carriers are string VRs only, and the gap
  is live rather than theoretical**: the identical over-declare into an `OB`, `OW`, `UN` or `US`
  carrier still writes the identifier into de-identified output with no warning and no report entry.
  Arbitrary bytes are what those VRs are for, so no content test can tell a swallow from a legitimate
  value there. Treat a file that raised this warning as a file whose _sender_ is malformed: other
  attributes in it may be carrying the same defect where it cannot be seen.

- **An unrecognized Explicit VR is read long-form, and `deidentify()` still empties the element.**
  Two separate rules, one clause. PS3.5 2026c §6.2 says every VR defined in a future edition "shall
  be of the same Data Element Structure as defined in [§7.1.2] with reserved bytes after the VR and
  a 32-bit unsigned integer VL". So when the two on-wire VR bytes are not one of the 34 this release
  knows, `parseDicom` reads a **12-byte header**, exactly as it does for `OB` or `UT` - and
  `serializeDicom` writes one. Before `0.0.9` it read an 8-byte header, which took the length from
  the two bytes §6.2 reserves. What such a file did then depended on its own payload bytes -
  sometimes a whole-object refusal, sometimes a clean parse into a tree the sender did not write -
  so there is deliberately no one-sentence account of it here; `scripts/measure-unrecognized-vr.ts`
  in the repository prints the per-shape table for both readings. The value is otherwise treated
  like any other: a declared
  length past the end of the buffer, or an undefined length, is refused the same way it is for
  every non-`SQ` VR.
  **The de-identify rule is unchanged and still fires**, because reading the header is not the same
  as knowing what the value means: Table E.1-1 acts per attribute, and nothing can say whether a VR
  from a later edition holds a name, a date or an opaque blob. So `deidentify()` empties the element,
  `report.undefinedVrElements` records it, and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` is raised.
  The record is capped at 64 entries; the emptying is not. **On a conformant future-VR file that is
  a real cost** - a legitimate value is destroyed because this release cannot classify it - and it
  is the same over-redaction trade the sequence rule below makes.
  **The finding names a byte offset and no tag, uniquely among the report's findings, and that is
  deliberate.** The header may still have been fabricated out of the middle of some element's value:
  bytes that happen to form a complete long-form header tile just as readily as short-form ones did,
  and on a carrier whose payload is `"MR BRAIN SMITHSO"` the fabricated tag renders as `48544F53`,
  four letters of the surname. An unrecognized VR written honestly raises the same code with an
  ordinary tag, and **nothing here can tell the two apart**, so the tag is withheld on both routes
  rather than on a guess. The byte offset locates the element instead and is a position the parser
  counted.
  An Implicit VR LE file cannot reach any of this: there the VR comes from the dictionary. `UN` is
  one of the 34 and is unaffected. **There is no exemption**: unlike the sequence rule below,
  `RetainSafePrivate` plus a `Profile` does not keep such an element.
  If the element previously appeared in `report.embeddedAttributes` (an undefined-VR carrier whose
  bytes happened to tile as Data Elements), it now appears in `report.undefinedVrElements` instead.

- **A sequence `deidentify()` could not open is emptied, not kept, so expect data loss on a
  malformed file.** Recursion is driven by `Element.items`. An `SQ` element that has none is
  un-auditable: PS3.5 §7.5.1 says its value is "a DICOM Data Set composed of Data Elements", and
  PS3.15 §E.1.1 obliges an implementation claiming the Basic Profile to protect the listed
  attributes "whether contained in the top level Data Set or embedded in an Item of a Sequence of
  Items". A run that cannot enumerate them cannot discharge that, so it discharges it on the
  carrier: the element is replaced with a zero-item sequence, `report.unauditableSequences` records
  the tag and the byte length dropped, and `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` is raised. That
  record is **capped at 64 entries** so a crafted file cannot amplify a per-element diagnostic; the
  emptying itself is never capped, so an array exactly 64 long means "at least 64". Before this,
  those bytes were written into de-identified output verbatim, identifiers and all, with a clean
  report.
  The accompanying `DICOM_SQ_NOT_DESCENDED` on `ds.warnings` says why the parse refused, and that is
  usually a sender-side encoding defect worth raising with them. **It is not always the sender**: a
  conformant file whose sequences nest deeper than this library's own `NESTING_DEPTH_LIMIT` of 64 is
  refused the same way and loses that sequence too.
  **Two shapes are exempt from the rule and still leak.** A **private** `SQ` kept under
  `RetainSafePrivate` plus a `Profile` is kept verbatim and unaudited: the profile vouched for the
  element, and this rule runs after that decision. And an undefined-length `UN` value the CP-246
  descent could not read as a sequence keeps `vr === "UN"` and raises nothing beyond a possible
  `DICOM_VR_MISMATCH`. The rule cannot be extended to that one, because every ordinary `UN` element
  also has `items === undefined` and applying it there would empty every unknown-VR element in every
  file. So for either, the reliable test is still `el.items === undefined`, and a report is a record
  of what was reached, not a proof that everything was.
- **Repeating-group rows are matched by mask, within the range the standard bounds them to.**
  `(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay Comments are stated
  by the standard as a group mask rather than a single tag. `deidentify()` matches them in the
  sixteen even groups PS3.5 defines (`6000`-`601E` for overlays, `5000`-`501E` for curves), removes
  them, and records them in the report with a `repeatingGroup` field naming the mask that matched.
  Even groups above the bound and odd groups are not overlay or curve groups and are left alone;
  odd groups are private and go through the private-attribute path instead.
- **`RetainLongitudinalTemporal` means the standard's full-dates option, the less protective one.**
  PS3.15 defines two longitudinal-temporal options, full dates and modified dates. This package
  exposes one name for both and it carries the **full-dates** column, so on the 169 attributes where
  the two columns disagree you keep the real value where modified-dates would have cleaned it.
  Activate it only when real dates are genuinely required; date shifting is not done at this layer.

## Scope (non-goals)

- **A parser + serializer + de-identifier for DICOM Part 10, metadata-first.** Not a viewer, not a
  network stack, not a pixel toolkit.
- **Pre-alpha, published on npm.** The package is public on npm (`npm install @cosyte/dicom`) but
  sits on the `0.0.x`-until-first-alpha ladder: pin an exact version, and expect the surface to keep
  moving until first alpha. For the current version, read `npm view @cosyte/dicom version` rather
  than a number written in a doc.

For the full public surface and the exact fields each view decodes, see the package's `README.md` and
the [Core Concepts](./spec-notes-model).

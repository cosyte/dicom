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
symptoms, and — critically — the explicit **metadata-first boundary** and the list of what is **not**
in scope. Everything here is a documented boundary, not a bug: the lenient parser never silently drops
or garbles data; where a limitation applies, the raw bytes are preserved (often with a warning), they
are simply not further interpreted.

## When does it throw vs warn?

Only **four** unrecoverable Tier-3 conditions throw a `DicomParseError`; everything else is a warning
on `ds.warnings`.

```ts runnable throws
import { parseDicom } from "@cosyte/dicom";

// Bytes that are not a Part 10 object — a structural fatal, not a tolerated quirk.
parseDicom(Buffer.from("plainly not a DICOM object, just ASCII bytes", "ascii"));
// throws DicomParseError (NOT_DICOM_PART_10)
```

| Fatal code (throws) | Meaning |
|---|---|
| `NOT_DICOM_PART_10` | No preamble/`DICM` and no recoverable File Meta — not a Part 10 object. |
| `INVALID_FILE_META` | The File Meta group is present but structurally unreadable. |
| `UNSUPPORTED_TRANSFER_SYNTAX` | The transfer syntax UID is not one of the four v1 syntaxes. |
| `EMPTY_INPUT` | Zero-length input. |

Narrow on the caught error via `err instanceof DicomParseError` and `err.code === FATAL_CODES.*` (see
[Tolerance & the warning model](./spec-notes-tolerance)). Everything a real-world archive does short
of that — a missing preamble, an odd-length value, an off-spec VR, a group-length mismatch — is a
warning you triage, not an exception you catch.

## Common symptoms

| Symptom | Likely cause | What to do |
|---|---|---|
| `ds.get("PatientName")` is `undefined` | `get` takes the **tag** form, not a keyword | Use the tag (`ds.get("00100010")`), or resolve a keyword with `Dictionary.byKeyword("PatientName")?.tag`. |
| `ds.image.rescaleSlope` is `undefined` | Rescale Slope was absent | This is by design — it is **not** defaulted to `1`. Apply a fallback deliberately in your own code if the modality warrants it. |
| `ds.image.signed` is `undefined` | Pixel Representation `(0028,0103)` was absent | Signedness is unknown, never guessed. Do not assume unsigned. |
| A `DICOM_VR_MISMATCH` warning | The on-wire Explicit VR disagreed with the dictionary | The dictionary VR is used and the deviation recorded; check the sender's encoding. |
| A `DICOM_PRIVATE_CREATOR_UNKNOWN` warning | A private tag's creator is not in the active profile | The element degrades to `UN`; add the creator via a [profile](./spec-notes-profiles) to resolve it. |
| `ds.get(tag)?.value` is `{ kind: "binary" }` for Pixel Data | Pixel data is exposed raw, never decoded | Expected — decoding pixels is out of scope (see below). |
| A `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning after `deidentify` | The object may carry burned-in PHI in the pixels | Metadata de-id cannot clean pixels; route to a pixel-cleaning step before sharing. |

## Keeping PHI out of logs

Every warning and error is **PHI-free by construction** — it carries the stable code and a structural
position (attribute tag, byte offset, sequence path), never a patient name, an identifier, a date, or
pixel content. You can log the full `ds.warnings` array, and the `DeidentifyReport`, without leaking.
A `DicomParseError` deliberately retains **no raw input snippet**. Keep the same discipline in your
own code: log `w.code` and `w.position`, not the element value.

## What's not yet parsed — and what is out of scope

Depth tracks the code and never leads it. These are the deliberate boundaries, authored here so a
reader never relies on something absent.

### The metadata-first boundary (scope, by design)

`@cosyte/dicom` reads and writes DICOM **metadata**. These are permanent non-goals for this package —
each is tracked as a future companion package, not a gap to be filled here:

- **No pixel decoding.** Pixel Data is exposed as a raw `Buffer` (and, for encapsulated transfer
  syntaxes, its fragments) and is **never** decoded, decompressed, windowed, rescaled, or
  color-transformed. Rescale Slope/Intercept, Window Center/Width, and the LUT sequences are surfaced
  as metadata, but applying them to produce displayable pixels is deferred to `@cosyte/dicom-pixel`.
- **No DIMSE networking.** There is no C-STORE / C-FIND / C-MOVE / C-ECHO, no SCU/SCP, no association
  negotiation. This is a file/buffer library, not a PACS node — that is `@cosyte/dicom-net`.
- **No DICOMweb.** No QIDO-RS / WADO-RS / STOW-RS client or server — deferred to `@cosyte/dicomweb`.
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

## Scope (non-goals)

- **A parser + serializer + de-identifier for DICOM Part 10, metadata-first.** Not a viewer, not a
  network stack, not a pixel toolkit.
- **Not yet published.** The package sits on the `0.0.x`-until-first-alpha ladder and is **not on
  npm**; the first provenance publish is gated on the coordinated public launch.

For the phase-by-phase surface and the exact fields each view decodes, see the package's `README.md`
and `CLAUDE.md` status sections and the [Core Concepts](./spec-notes-model).

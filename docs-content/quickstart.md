---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

This page gives you a first useful result: read a DICOM Part 10 object and pull out **who the
patient is**, **what the study/series is**, and the **image geometry** you need before touching a
pixel — in a few lines, without having read the standard. The safety-critical fields come out through
four typed, fail-safe views (`patient`, `study`, `series`, `image`); everything else is reachable by
its `(group,element)` tag.

`@cosyte/dicom` is **metadata-first**: it reads the header, decodes typed values, and exposes pixel
data as a raw `Buffer` — it never decodes pixels, and it is not a DIMSE/DICOMweb client. See
[Troubleshooting](./troubleshooting) for the explicit non-goals.

> Every object below is **synthetic**: an invented patient ("Jane Doe"), obviously-fake UIDs and an
> invented MRN, encoded as a base64 buffer. A DICOM object is PHI; a fixture must never hold a real
> one.

## Parse an object and read the metadata

`parseDicom(buffer)` returns an immutable `Dataset`. The typed views answer "whose object, what
study, what image" without your having to know which tag holds which field or how to decode its bytes.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// Synthetic CT object (base64): patient + study/series + image geometry. No real PHI.
const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);

// Identity — whose object, matchable across systems.
ds.patient.id; // => "MRN-42"
ds.patient.issuerOfId; // => "SAMPLE-HOSP"
ds.patient.name?.alphabetic?.familyName; // => "Doe"
ds.patient.name?.alphabetic?.givenName; // => "Jane"

// Study / series context.
ds.study.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1"
ds.series.number; // => 2
ds.series.modality; // => "CT"

// Image geometry — the numbers you need before you can interpret a pixel.
ds.image.rows; // => 512
ds.image.columns; // => 512
ds.image.signed; // => true
ds.image.rescaleSlope; // => 1
ds.image.rescaleIntercept; // => -1024
ds.image.pixelSpacing; // => [0.5, 0.5]

// Clean, spec-conformant input: nothing tolerated, nothing flagged.
ds.warnings.length; // => 0
```

Every one of those fields is **typed-absent when the tag is absent** — never a substituted default.
`ds.image.rescaleSlope` is `undefined` (not `1`) when Rescale Slope is missing; `ds.image.signed` is
`undefined` unless Pixel Representation was present; the three pixel-spacing tags are distinct fields,
never aliased. The dangerous DICOM failure is the confident, wrong image, so a missing value stays
missing. See [Safety-critical views](./spec-notes-safety) for the full contract.

## Reach any element by tag

For attributes outside the four views, use `get` with the 8-character `(group,element)` tag. It
returns an `Element`; `.value` lazily decodes the raw bytes into a typed, discriminated `DicomValue`:

```ts runnable
import { parseDicom, Dictionary } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);

// Rows (0028,0010) is a US — a numeric value.
ds.get("00280010")?.value.kind; // => "numbers"

// Study Date (0008,0020) decodes to a structured, validated DicomDate.
ds.get("00080020")?.value.kind; // => "dates"

// Prefer keywords? Resolve one to its tag through the dictionary, then get by tag.
const tag = Dictionary.byKeyword("PatientName")?.tag; // "00100010"
ds.get(tag ?? "")?.value.kind; // => "personName"

// `has` also takes the tag form.
ds.has("00100010"); // => true
```

## Unrecoverable input throws — everything else is a warning

Only **four** unrecoverable structural conditions throw a typed `DicomParseError`
(`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`). A
well-formed object with vendor quirks never throws; the quirks collect on `.warnings` with a stable
code and a byte offset.

```ts runnable throws
import { parseDicom } from "@cosyte/dicom";

// Not a Part 10 object at all — no preamble/DICM, no File Meta. A structural fatal.
parseDicom(Buffer.from("this is not a DICOM file, just some ASCII text here", "ascii"));
// throws DicomParseError (NOT_DICOM_PART_10)
```

## Next

- [Core Concepts](./spec-notes-model) — the Part 10 object model, the tolerance tiers and warning
  codes, the typed value layer, the safety-critical views, and the source-profile system.
- [Cookbook](./cookbook) — recipes: re-serialize spec-clean bytes, de-identify before sharing, read
  raw pixel data, and triage warnings.
- [Troubleshooting & known limitations](./troubleshooting) — the fatal codes, the fail-safe rules,
  and the explicit "what's not parsed" list (no pixel decode, no DIMSE, no DICOMweb).

> **About runnable examples.** The blocks tagged ` ```ts runnable ` above are extracted by the test
> suite, executed against the built package, and their `// =>` results asserted — so a documented
> example can never silently drift from the code (`docSnippetSuite()`, the documentation analog of
> the parser conformance runners). Blocks shown as plain ` ```ts ` are illustrative.

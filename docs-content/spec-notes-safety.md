---
id: spec-notes-safety
title: Safety-critical views
sidebar_label: Safety-critical views
sidebar_position: 4
---

# Safety-critical views — patient, study, series, image

Pulling the right field out of raw tags is error-prone in exactly the places where a mistake is most
dangerous. So the `Dataset` exposes four typed, fail-safe views over the safety-critical attributes —
`patient`, `study`, `series`, and `image` — each a plain object of typed fields with one absolute
rule: **a missing value is typed-absent (`undefined`), never a substituted default.** The dangerous
DICOM failure is the confident, wrong image; these views are built so that absence reads as absence.

## The four views

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);

// Patient — an identifier is not globally unique on its own; pair id with issuer
// to match across systems, and the name stays structured, never flattened.
ds.patient.id; // => "MRN-42"
ds.patient.issuerOfId; // => "SAMPLE-HOSP"
ds.patient.name?.alphabetic?.familyName; // => "Doe"

// Study / series.
ds.study.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1"
ds.series.modality; // => "CT"

// Image — the geometry you need before interpreting a pixel.
ds.image.rows; // => 512
ds.image.signed; // => true
ds.image.rescaleSlope; // => 1
ds.image.pixelSpacing; // => [0.5, 0.5]
```

## Typed-absent is load-bearing

An omitted field is `undefined`, not a guessed default — and the difference is a clinical-safety one:

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);

// This synthetic object carries Pixel Spacing but NOT Imager Pixel Spacing:
// the two are distinct fields and are never aliased.
ds.image.pixelSpacing; // => [0.5, 0.5]
ds.image.imagerPixelSpacing; // => undefined

// It is a single-frame object, so multi-frame fields are absent, not defaulted.
ds.image.numberOfFrames; // => undefined
ds.image.isEnhancedMultiFrame; // => false
```

Concretely: `rescaleSlope` is `undefined` (never `1`) when the tag is absent; `signed` is `undefined`
unless Pixel Representation was present; `photometricInterpretation` is never defaulted to
`MONOCHROME2`; and `pixelSpacing`, `imagerPixelSpacing`, and `nominalScannedPixelSpacing` are three
distinct fields. If you need a fallback, apply it deliberately in your own code — the parser will not
apply one for you.

## Coded triplets

Coded concepts (PS3.16 code sequences — modality-in-study, units, anatomic region) come out as a
`CodedConcept` triplet via `readCode`: `{ codeValue, codingSchemeDesignator, codeMeaning, schemeUid }`,
with `codingSchemeOid` / `CODING_SCHEME_OIDS` mapping the common designators (`SCT`, `LN`, `DCM`, …)
to their OIDs. As with everything else, a missing component is absent, not invented.

## Enhanced multi-frame

For Enhanced multi-frame objects (`ds.image.isEnhancedMultiFrame === true`), `ds.image.frame(i)`
resolves each frame's functional-group macros **Per-Frame-else-Shared** — the per-frame group wins,
falling back to the shared group:

```ts
// Illustrative — an Enhanced multi-frame object.
if (ds.image.isEnhancedMultiFrame) {
  const f = ds.image.frame(0);
  f.planePosition?.imagePositionPatient; // this frame's [x, y, z]
  f.pixelMeasures?.pixelSpacing; // this frame's [row, col] mm
}
```

`frame(i)` throws a `DicomValueError` for an out-of-range index, or when a required geometry macro is
missing from **both** the per-frame and shared groups — and the message carries only structural facts
(the frame index, the macro tag), never PHI. An optional macro that is simply absent stays
`undefined`; only a *required* one missing from both groups is an error.

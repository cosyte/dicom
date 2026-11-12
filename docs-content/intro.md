---
id: intro
title: Getting started
sidebar_label: Getting started
sidebar_position: 1
description: What @cosyte/dicom is, who it is for, what it does not do, and where each part of these docs is.
---

# @cosyte/dicom

`@cosyte/dicom` is our DICOM Part 10 parser and utility library for Node.js and TypeScript. It reads
real-world, vendor-quirky files leniently and hands you an immutable dataset with typed values, four
safety-critical views over the patient, study, series and image, a generated data dictionary, and
stable warning codes for the deviations real scanners produce. It writes spec-clean Part 10 back
out, and de-identifies header metadata under the PS3.15 Annex E Basic Application Level
Confidentiality Profile.

It is for developers who need DICOM metadata in a TypeScript service: indexing an archive, routing
objects, joining imaging to the rest of the record, or stripping identifiers before an object leaves
your control, without first reading the DICOM standard.

## What it does not do

It is **metadata-first by design**. Pixel data is exposed as raw bytes and is **not decoded**, in
any transfer syntax: an encapsulated (compressed) object parses and its fragments come back raw,
and a JPIP Referenced object's Pixel Data Provider URL comes back as written and is never fetched.
DIMSE networking and DICOMweb are out of scope too. [Compatibility](./compatibility.md#supported-transfer-syntaxes)
lists the transfer syntaxes we read and write, and [Scope and non-goals](./non-goals.md) says what is
left to other packages.

:::caution Read this before you point it at real data

**[Known limitations](./limitations.md)** is the "do not over-trust" list: what is out of scope,
which PHI residuals are measured and still open, and which fields are not safe to log. Mis-reading a
patient identifier, an image's signedness, or a rescale slope can cause real clinical harm, so that
page is a deliverable of this package rather than a footnote. A de-identified output from
`@cosyte/dicom` is **metadata-de-identified only**.

:::

## A first look

Every DICOM object in these docs is **synthetic**: an invented patient and obviously fake UIDs,
encoded as a small base64 Part 10 buffer so a sample needs no file on disk. This sample runs against
the built package on every test run, so what it asserts is what the shipped code returns.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// A synthetic Part 10 object: a tiny CT header, an invented MRN, fake UIDs. No real PHI.
const ds = parseDicom(
  Buffer.from(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
    "base64",
  ),
);

ds.series.modality; // => "CT"
ds.patient.id; // => "MRN-42"
ds.warnings.length; // => 0
```

## Where to go next

- [Install and verify](./installation.md), then [Read your first DICOM object](./quickstart.md).
- **How-to guides**: the [recipes](./recipes.md) (index a folder, read only a header, build routing
  keys, read pixel metadata and raw pixel data, de-identify, bridge to FHIR and HL7 v2, write bytes
  back), the [cookbook](./cookbook.md) (triage warnings, read a veterinary patient, check the dates
  on a de-identified object), and [Property-test your code](./property-testing.md).
- **Explanation**: [the object model](./spec-notes-model.md), [access patterns](./access-patterns.md),
  [typed values](./spec-notes-values.md), [the safety-critical views](./spec-notes-safety.md),
  [tolerance and warnings](./spec-notes-tolerance.md), [source profiles](./spec-notes-profiles.md),
  [serialization](./serialization.md) and [de-identification](./deidentification.md).
- **Reference**: [compatibility](./compatibility.md), [error handling](./error-handling.md),
  [known limitations](./limitations.md), and the API reference generated from the source.
- [Troubleshooting](./troubleshooting.md), [Testing and quality](./testing-and-quality.md) and
  [Performance](./performance.md).

---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/dicom

Read a real-world, vendor-quirky DICOM Part 10 file and pull metadata fields out in one line —
without having read the DICOM standard. `@cosyte/dicom` is a metadata-first TypeScript parser for
Node.js: a lenient reader, an immutable dataset with dot-path access, a generated data dictionary,
and stable warning codes for the deviations real scanners produce.

It is **metadata-first by design**. Pixel data is exposed as a raw `Buffer` (and, for encapsulated
transfer syntaxes, its fragments) but is **not decoded** — that, along with DIMSE networking and
DICOMweb, is left to future companion packages.

## Install

```bash
npm install @cosyte/dicom
```

## Read a file

```ts
import { readFile } from "node:fs/promises";
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(await readFile("study.dcm"));

ds.get("PatientName"); // "Doe^Jane"
ds.get("(0010,0010)"); // same element, by tag
ds.get("StudyDate"); // "20240115"
ds.pixelData; // raw Buffer — not decoded
ds.warnings; // stable, byte-offset tolerance warnings
```

Elements are reachable by keyword or by `(group,element)` tag through the same `get` path.

## Typed values

`get` returns an `Element`; its `.value` lazily decodes the raw bytes into a typed, discriminated
`DicomValue` and caches the result. Every one of the 34 VRs has a decode: numbers, 64-bit `bigint`s,
attribute tags, person names (3-group / 5-component), strings, free text, numeric strings
(`DS`/`IS`), temporal values (`DA`/`TM`/`DT`), sequences, and raw `binary` for bulk data.

```ts
const rows = ds.get("Rows")?.value; // US
if (rows?.kind === "numbers") rows.values[0]; // 512

const name = ds.get("PatientName")?.value; // PN
if (name?.kind === "personName") name.values[0]?.alphabetic.givenName; // "Jane"
```

Decode is **fail-safe**: it never throws and never coerces a malformed value to a
plausible-but-wrong one (a bad `DS`/`IS` token becomes `null`, never `NaN`→0). Per-value deviations
surface on the returned value's own `warnings`. String VRs honor the `(0008,0005)` Specific
Character Set (UTF-8, ISO-8859, ISO-2022), threaded through nested sequence items.

## Safety-critical views

Pulling the right field out of raw tags is error-prone in exactly the places that matter most, so the
`Dataset` exposes four typed, fail-safe views over the safety-critical attributes — `patient`,
`study`, `series`, and `image`:

```ts
const p = ds.patient;
p.id; // "MRN-42" — NOT globally unique on its own…
p.issuerOfId; // …pair it with the issuer for cross-system matching
p.name?.alphabetic.familyName; // structured PN, never flattened

const img = ds.image;
img.rescaleSlope; // undefined ⇒ MUST NOT assume 1
img.signed; // undefined ⇒ signedness unknown, never guessed
img.pixelSpacing; // patient-plane mm — distinct from imagerPixelSpacing
```

The omissions are deliberate and load-bearing: a missing value is **typed-absent** (`undefined`),
never a substituted default — because the dangerous DICOM failure is the confident, wrong image.
`rescaleSlope` is absent (not `1`) when the tag is absent; `signed` is absent unless Pixel
Representation was present; `photometricInterpretation` is never defaulted to `MONOCHROME2`; and the
three pixel-spacing tags are distinct fields, never aliased.

For Enhanced multi-frame objects, `image.frame(i)` resolves each frame's functional-group macros
Per-Frame-else-Shared (it throws a `DicomValueError` for an out-of-range frame, or a required
geometry macro missing from both groups — the message carries only structural facts, never PHI):

```ts
if (img.isEnhancedMultiFrame) {
  const f = img.frame(0);
  f.planePosition?.imagePositionPatient; // this frame's [x, y, z]
  f.pixelMeasures?.pixelSpacing; // this frame's [row, col] mm
}
```

## Lenient by default

The parser is **lenient by default** — the quirks real scanners emit (odd-length values, missing
padding, off-spec VRs) become warnings carrying a stable code and the byte offset where they
occurred, not failures. Only four unrecoverable structural conditions throw. When you re-serialize,
the writer always emits spec-clean Part 10 — correct File Meta group length, even-length values,
proper padding (Postel's Law).

## Source profiles

Real files come from real vendors, and vendors deviate in documented, predictable ways. A **profile**
lets you opt into source-specific tolerance without ever risking a wrong decode. Pass one to
`parseDicom`:

```ts
import { parseDicom, profiles } from "@cosyte/dicom";

// Resolve Siemens CSA private headers to their real VRs instead of UN.
const ds = parseDicom(buf, { profile: profiles.siemens });
```

A profile bundles three things that only ever **tighten or annotate** a parse — never loosen it past
the lenient default:

- **Private-dictionary overlay** — resolves the Implicit VR of vendor private data elements by the
  file's _live_ private-creator string (e.g. `"SIEMENS CSA HEADER"`), never a hard-coded block number.
  A creator the profile does not know degrades to `UN` plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning.
- **Escalations** — Tier-2 warning codes promoted to a thrown `DicomParseError` (a stricter posture
  for known-unsafe deviations).
- **Suppressions** — benign, high-volume warning codes silenced for a known-quirky source.

Five built-ins ship under the `profiles` namespace: `ge`, `siemens`, `philips` (vendor overlays) and
`strict` / `lenient` (posture presets). Build your own with `defineProfile()` — it validates input,
composes via `extends`, and returns a frozen profile:

```ts
import { defineProfile, profiles } from "@cosyte/dicom";

const acmeStrict = defineProfile({
  name: "acme-strict",
  extends: profiles.strict,
  privateTags: {
    "ACME PRIV 01": { "0019XX10": { vr: "DS", keyword: "AcmeDose", name: "ACME Dose" } },
  },
});
```

## Next

- Read the **API reference** for every export, generated from source.
- See the data dictionary coverage and the full list of warning codes.

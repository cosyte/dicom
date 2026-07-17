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
import { parseDicom, Dictionary } from "@cosyte/dicom";

const ds = parseDicom(await readFile("study.dcm"));

ds.get("00100010")?.value; // Patient's Name — a typed PersonName value
ds.get("00080020")?.value; // Study Date — a typed DicomDate value
ds.get("7FE00010")?.value; // Pixel Data — { kind: "binary", bytes } — raw, never decoded
ds.warnings; // stable, byte-offset tolerance warnings

// Prefer keywords? Resolve one to its tag through the dictionary:
ds.get(Dictionary.byKeyword("PatientName")?.tag ?? "");
```

Elements are keyed by their 8-character `(group,element)` **tag** (`"00100010"`), and `get` /
`has` take that tag form. A keyword like `"PatientName"` is resolved to its tag through
`Dictionary.byKeyword` — `get` itself does not take keywords. The safety-critical fields have an
even shorter path: the typed `patient` / `study` / `series` / `image` views below.

## Typed values

`get` returns an `Element`; its `.value` lazily decodes the raw bytes into a typed, discriminated
`DicomValue` and caches the result. Every one of the 34 VRs has a decode: numbers, 64-bit `bigint`s,
attribute tags, person names (3-group / 5-component), strings, free text, numeric strings
(`DS`/`IS`), temporal values (`DA`/`TM`/`DT`), sequences, and raw `binary` for bulk data.

```ts
const rows = ds.get("00280010")?.value; // Rows (US)
if (rows?.kind === "numbers") rows.values[0]; // 512

const name = ds.get("00100010")?.value; // Patient's Name (PN)
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

## De-identify

Before sharing a file, strip the identifying metadata. `deidentify()` applies the PS3.15 Annex E
**Basic Application Level Confidentiality Profile** — replacing, emptying, or removing every attribute
the standard lists as identifying — and returns a fresh dataset plus a value-free report of what it did.

```ts
import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";

const { dataset, report } = deidentify(parseDicom(buf));
const safe = serializeDicom(dataset); // safe to share

console.log(report.attributes.length, "attributes acted on");
console.log(report.warnings); // e.g. burned-in pixel annotation that this layer cannot clean
```

It is a pure function — your input dataset is never mutated. UIDs are remapped to deterministic `2.25`
replacements that stay consistent across files, so a de-identified study still hangs together. Opt into
any of the nine metadata-affecting Annex E Options to keep specific classes of attribute:

```ts
// Keep original UIDs and acquisition dates; clean (rather than drop) free-text descriptions.
const { dataset } = deidentify(parseDicom(buf), {
  retain: ["RetainUIDs", "RetainLongitudinalTemporal", "CleanDescriptors"],
});
```

This is **metadata-level** de-identification. Pixel data is out of scope: when a file carries burned-in
annotation that this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning
rather than a false sense of safety — pixel cleaning is deferred to `@cosyte/dicom-pixel`.

## Next

- Read the **API reference** for every export, generated from source.
- See the data dictionary coverage and the full list of warning codes.

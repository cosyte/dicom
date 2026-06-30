# @cosyte/dicom

> Read a real-world, vendor-quirky DICOM Part 10 file and pull the metadata you need in one line — without having read the DICOM standard.

[![npm version](https://img.shields.io/npm/v/@cosyte/dicom.svg)](https://www.npmjs.com/package/@cosyte/dicom)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/dicom/ci.yml?branch=main&label=CI)](https://github.com/cosyte/dicom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

A developer-focused DICOM Part 10 parser and utility library for Node.js and TypeScript. **Metadata-first**: it reads the headers — patient, study, series, image, codes, UIDs — leniently and fast, exposes pixel data as raw bytes, and **never decodes pixels**. Sibling to [`@cosyte/hl7`](https://github.com/cosyte/hl7); same engineering bar.

---

## Quickstart

Useful output after install + parse. No DICOM spec knowledge required.

```bash
# pnpm (recommended) — also works with: npm install @cosyte/dicom  |  yarn add @cosyte/dicom
pnpm add @cosyte/dicom
```

```ts
import { readFile } from "node:fs/promises";
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(await readFile("study.dcm"));

ds.get("PatientName")?.value; // PN value — structured, never flattened
ds.study.instanceUid; // "1.2.840.…" — the global study anchor
ds.image.rescaleSlope; // number | undefined — undefined means "absent", never 1
```

That's the pitch: no config, no schema upload, no spec lookup. The parser accepts vendor-quirky input by default — it tolerates a missing preamble, a wrong File Meta group length, odd-length values, and the dozen-or-so deviations real scanners emit — and records each as a stable warning code rather than failing. You reach for typed value decode, safety-critical views, profiles, or the serializer when you want them.

---

## Features

- **One-line metadata extraction** — `ds.patient`, `ds.study`, `ds.series`, `ds.image`: typed, fail-safe views over the safety-critical attributes. No `(group,element)` tags to memorise.
- **Two access patterns** — named views, or structural `ds.get("PatientName")` / `ds.get("(0010,0010)")` by keyword or tag, plus `ds.elements()` to walk everything.
- **Lazy typed value decode** — `element.value` decodes raw bytes into a discriminated `DicomValue` across all 34 VRs (numbers, `bigint`s, person names, dates/times, sequences, raw `binary`), honoring `(0008,0005)` Specific Character Set through nested items.
- **Real-world tolerance, Postel's Law** — a lenient reader emits 24 stable warning codes for what it tolerated; only 4 truly-structural conditions are fatal. The serializer always writes spec-clean Part 10.
- **Source/vendor profile system** — `defineProfile()` + 5 built-ins (`ge`, `siemens`, `philips`, `strict`, `lenient`) that only ever _tighten or annotate_ a parse, resolving vendor private tags by the file's live Private Creator string — never a wrong decode.
- **Metadata-level de-identification** — `deidentify()` applies the PS3.15 Annex E Basic Profile + the nine metadata Options, returning a fresh dataset and a value-free audit report.
- **Spec-clean serializer** — `serializeDicom(ds)` round-trips a dataset back to Part 10 bytes in its source transfer syntax (no transcode), with correct File Meta group length, even-length padding, and byte-exact sequence passthrough.
- **Strict TypeScript, dual ESM + CJS, Node ≥ 22** — `noUncheckedIndexedAccess`, no `any`, JSDoc + `@example` on every public export feeding your editor's IntelliSense. Zero runtime dependencies today.

---

## DICOM in 90 seconds

A DICOM Part 10 file is a 128-byte preamble + the `DICM` magic, then a **File Meta** group (always Explicit VR Little Endian) naming the **transfer syntax**, then the **dataset**: a flat, tag-ordered stream of **data elements**.

Each element is identified by a `(group,element)` **tag** (e.g. `(0010,0010)` = Patient's Name) and carries a two-letter **VR** (Value Representation — `PN`, `DA`, `US`, `SQ`, …) that says how to decode its bytes. Some elements are **sequences** (`SQ`): ordered lists of **items**, each a nested dataset. The transfer syntax decides endianness, whether VRs are written explicitly, and whether the stream is deflated.

```
DICOM file
 ├── preamble (128 bytes) + "DICM"
 ├── File Meta group (0002,xxxx)   — transfer syntax UID, SOP Class/Instance UID
 └── dataset
      ├── (0008,0060) Modality           "CT"
      ├── (0010,0010) PatientName  PN     "Doe^Jane"
      ├── (0020,000D) StudyInstanceUID UI "1.2.840.…"
      ├── (0028,0100) BitsAllocated  US   16
      └── (7FE0,0010) PixelData     OW    «raw bytes — not decoded»
```

`@cosyte/dicom` reads all of that leniently and hands you typed accessors over it. The one thing it deliberately does **not** do is decode the pixels.

---

## Access patterns

### Safety-critical views

The four views — `patient`, `study`, `series`, `image` — pull the right field out of the right tag for the jobs that matter most, and they are **fail-safe**: a missing value is typed-absent (`undefined`), never a substituted default.

```ts
const p = ds.patient;
p.id; // "MRN-42" — NOT globally unique on its own…
p.issuerOfId; // …pair with the issuer for cross-system matching
p.name?.alphabetic.familyName; // structured PN, never flattened

const s = ds.study;
s.instanceUid; // "1.2.840.…" Study Instance UID (0020,000D)
s.accessionNumber; // ties the study to the HIS order (0008,0050)
```

### By keyword or tag

`get` reaches any element by keyword **or** by `(group,element)` tag through the same path; `has`, `getAll` (for repeating tags), and `elements()` round out structural access.

```ts
ds.get("Modality"); // by keyword
ds.get("(0008,0060)"); // same element, by tag
ds.has("PixelData"); // boolean
ds.elements(); // readonly Element[] — walk everything
```

### Typed values

`get` returns an `Element`; its `.value` lazily decodes the raw bytes into a discriminated `DicomValue` and caches the result.

```ts
const rows = ds.get("Rows")?.value; // US
if (rows?.kind === "numbers") rows.values[0]; // 512

const name = ds.get("PatientName")?.value; // PN
if (name?.kind === "personName") name.values[0]?.alphabetic.givenName; // "Jane"
```

Decode is fail-safe: it never throws and never coerces a malformed value to a plausible-but-wrong one (a bad `DS`/`IS` token becomes `null`, never `NaN`→0). Per-value deviations surface on the returned value's own `warnings`.

---

## Cookbook

Recipes for the jobs a metadata parser is actually asked to do. Every attribute cites the PS3 clause it reads.

### Index a folder of studies

Pull a few fields out of each file to build a searchable index — the bread-and-butter PACS/archive job.

```ts
import { readFile } from "node:fs/promises";
import { parseDicom } from "@cosyte/dicom";

async function indexFile(path: string) {
  const ds = parseDicom(await readFile(path));
  return {
    patientId: ds.patient.id, // (0010,0020)
    studyUid: ds.study.instanceUid, // (0020,000D)
    seriesUid: ds.series.instanceUid, // (0020,000E)
    sopInstanceUid: ds.image.sopInstanceUid, // (0008,0018)
    modality: ds.series.modality, // (0008,0060)
    accession: ds.study.accessionNumber, // (0008,0050)
    rows: ds.image.rows, // (0028,0010)
    columns: ds.image.columns, // (0028,0011)
  };
}
```

Nothing here throws on a quirky file; absent fields come back `undefined`. Check `ds.warnings` if you want to log what was tolerated.

### Build routing keys

Routing and reconciliation hang off a small set of identifiers. Surface them correctly — a Patient ID without its issuer is ambiguous across systems (PS3.3 C.7.1.1).

```ts
// Hierarchy keys for filing into Study → Series → Instance:
const studyKey = ds.study.instanceUid; // (0020,000D) — global anchor
const seriesKey = ds.series.instanceUid; // (0020,000E)
const instanceKey = ds.image.sopInstanceUid; // (0008,0018)

// Cross-system patient key — id ALONE is not unique; pair it with the issuer:
const p = ds.patient;
const patientKey = `${p.issuerOfId ?? "?"}|${p.id ?? "?"}`;
p.otherIds; // (0010,1002) Other Patient IDs Sequence — additional {id, issuer} pairs
```

### Read pixel-interpretation metadata safely

If you (or a downstream renderer) ever touch the pixels, the interpretation tags decide what the numbers _mean_. The dangerous DICOM failure is the confident, wrong image, so these views never default a missing value.

```ts
const img = ds.image;
img.rescaleSlope; // (0028,1053) undefined ⇒ MUST NOT assume 1
img.rescaleIntercept; // (0028,1052) apply as: stored*slope + intercept
img.signed; // true/false only if (0028,0103) Pixel Representation was present; else undefined
img.bitsStored; // (0028,0101)
img.photometricInterpretation; // (0028,0004) never defaulted to MONOCHROME2
img.pixelSpacing; // (0028,0030) patient-plane mm — distinct from imagerPixelSpacing
```

> **Vendor note.** Philips writes private rescale tags `(2005,1409/140A/140B)` that shadow the standard `(0028,1052/1053)`; using the standard tags alone can yield non-quantitative values. This parser **preserves** the private tags so you can prefer them — reach them with `ds.get("(2005,1409)")` (optionally under `profiles.philips`).

For Enhanced multi-frame objects, `image.frame(i)` resolves each frame's functional-group macros Per-Frame-else-Shared (PS3.3 C.7.6.16). It throws a `DicomValueError` — carrying only structural facts, never PHI — for an out-of-range frame or a required geometry macro missing from both groups.

```ts
if (img.isEnhancedMultiFrame) {
  const f = img.frame(0);
  f.planePosition?.imagePositionPatient; // this frame's [x, y, z]
  f.pixelMeasures?.pixelSpacing; // this frame's [row, col] mm
}
```

### De-identify before sharing

`deidentify()` applies the PS3.15 Annex E Basic Application Level Confidentiality Profile — replacing, emptying, or removing every attribute the standard lists as identifying — and returns a fresh dataset plus a value-free report.

```ts
import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";

const { dataset, report } = deidentify(parseDicom(buf));
const safe = serializeDicom(dataset); // safe to share — input dataset never mutated

report.attributes.length; // count of attributes acted on (each carries tag/keyword/action — no values)
report.warnings; // e.g. DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED
```

UIDs are remapped to deterministic `2.25` replacements that stay consistent across files, so a de-identified study still hangs together. Opt into any of the nine metadata-affecting Annex E Options to keep specific classes of attribute:

```ts
// Keep original UIDs and acquisition dates; clean (rather than drop) free-text descriptions.
deidentify(parseDicom(buf), {
  retain: ["RetainUIDs", "RetainLongitudinalTemporal", "CleanDescriptors"],
});
```

This is **metadata-level** de-identification. Pixel cleaning is out of scope: when a file carries burned-in annotation this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning rather than a false sense of safety (pixel cleaning is deferred to `@cosyte/dicom-pixel`).

### Bridge to FHIR / HL7 v2

A common consulting ask is joining imaging to the rest of the record. The authoritative crosswalk is the FHIR [`ImagingStudy` "Mappings for DICOM"](https://build.fhir.org/imagingstudy-mappings.html) tab. The join keys a metadata parser must surface correctly:

```ts
// → FHIR ImagingStudy
const imagingStudy = {
  identifier: ds.study.instanceUid, // (0020,000D) → ImagingStudy.identifier (urn:dicom:uid)
  subjectId: ds.patient.id, // (0010,0020) → Patient identifier (+ issuer (0010,0021))
  started: ds.study.date, // (0008,0020)
  series: {
    uid: ds.series.instanceUid, // (0020,000E) → ImagingStudy.series.uid
    modality: ds.series.modality, // (0008,0060) → ImagingStudy.series.modality
  },
};

// → HL7 v2: Accession Number (0008,0050) is the HIS↔PACS workhorse, typically OBR-18.
const obr18 = ds.study.accessionNumber;
```

> Series and SOP Instance UIDs are **not** represented in HL7 v2 — image-level identity lives only in DICOM.

### Round-trip: read, edit, re-serialize

```ts
import { parseDicom, serializeDicom } from "@cosyte/dicom";

const ds = parseDicom(buf);
const out = serializeDicom(ds); // spec-clean Part 10, same transfer syntax — no transcode
```

The serializer is the conservative half of Postel's Law: it rebuilds the File Meta group with a correct `(0002,0000)` length, pads values to even length, and re-emits sequences and encapsulated pixel data byte-for-byte.

---

## Profiles

Real files come from real vendors, and vendors deviate in documented, predictable ways. A **profile** lets you opt into source-specific tolerance without ever risking a wrong decode. Pass one to `parseDicom`:

```ts
import { parseDicom, profiles } from "@cosyte/dicom";

// Resolve Siemens CSA private headers to their real VRs instead of UN.
const ds = parseDicom(buf, { profile: profiles.siemens });
```

A profile bundles three things that only ever **tighten or annotate** a parse — never loosen it past the lenient default:

- **Private-dictionary overlay** — resolves the Implicit VR of vendor private data elements by the file's _live_ Private Creator string (e.g. `"SIEMENS CSA HEADER"`), keyed canonically as `"GGGGxxLL"` (PS3.5 §7.8.1), never a hard-coded block number. (This is why Agfa IMPAX re-assigning blocks still resolves.) An unknown creator degrades to `UN` plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning.
- **Escalations** — Tier-2 warning codes promoted to a thrown `DicomParseError` (a stricter posture for known-unsafe deviations).
- **Suppressions** — benign, high-volume warning codes silenced for a known-quirky source.

Five built-ins ship under the `profiles` namespace: `ge`, `siemens`, `philips` (vendor overlays, grounded in the public GDCM / dcm4che / dcm2niix dictionaries) and `strict` / `lenient` (posture presets). Build your own with `defineProfile()` — it validates input, composes via `extends`, and returns a frozen profile:

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

---

## Real-World Tolerance

At an RSNA-era interoperability test, ~80% of real-world patient CDs failed strict conformance (Clunie / `dciodvfy`). A parser that rejects those files is useless on real integrations, so this one reads liberally and classifies every deviation:

| Tier | Behavior       | When                           | Example codes            |
| ---- | -------------- | ------------------------------ | ------------------------ |
| 0    | Silent         | Spec-compliant input           | —                        |
| 1    | Auto-handled   | Trivial deviation, no warning  | trailing-space tidy      |
| 2    | Warning        | Recoverable deviation          | `DICOM_MISSING_PREAMBLE` |
| 3    | Fatal (always) | Unrecoverable structural error | `NOT_DICOM_PART_10`      |

Tier-2 warnings are plain data on `ds.warnings`. Each carries a stable string `code`, a PHI-free `message`, and a `position` with the byte offset where it occurred, so you can react programmatically:

```ts
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

const ds = parseDicom(buf);
for (const w of ds.warnings) {
  if (w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ) {
    // a UN element was recovered as an implicit-VR sequence (CP-246)
  }
}
```

The 24 Tier-2 codes (`DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_VR_MISMATCH`, `DICOM_DA_LEGACY_FORMAT`, … ) live in [`src/parser/warnings.ts`](./src/parser/warnings.ts). Narrow on `w.code === WARNING_CODES.…` for typo-free comparisons, or pass `{ onWarning }` to `parseDicom` to stream them.

The 4 Tier-3 fatal codes — `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT` — always throw a `DicomParseError`; they represent input the parser cannot meaningfully recover.

---

## Error Handling

The library throws four typed errors, all exported from the package barrel; warnings are data, never thrown.

### `DicomParseError`

Thrown by `parseDicom` on one of the 4 Tier-3 fatal codes. Carries the byte position and a PHI-free message.

```ts
import { parseDicom, DicomParseError, FATAL_CODES } from "@cosyte/dicom";

try {
  parseDicom(Buffer.alloc(0));
} catch (err) {
  if (err instanceof DicomParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
    // …
  }
}
```

### `DicomValueError`

Thrown only by `image.frame(i)` — `FRAME_INDEX_OUT_OF_RANGE` for an index outside `[0, numberOfFrames)`, or `MISSING_REQUIRED_FUNCTIONAL_GROUP` when an enhanced object lacks a required geometry macro in both the Per-Frame and Shared groups. Value decode (`element.value`) never throws — it warns and returns `null`/typed-absent instead.

### `DicomSerializeError`

Thrown by `serializeDicom` for `MISSING_TRANSFER_SYNTAX` (the dataset names no transfer syntax to write in) or `UNSUPPORTED_TRANSFER_SYNTAX`.

### `ProfileDefinitionError` · `DeidentifyError`

`defineProfile()` throws `ProfileDefinitionError` for a structurally invalid profile; `deidentify()` throws `DeidentifyError` (`INVALID_OPTIONS`) for an unknown Retain option or malformed UID root. Both messages carry only structural facts — option names, the UID root — never a decoded value.

---

## Known limitations & non-goals

`@cosyte/dicom` is metadata-first by design. Even at v1-complete, do **not** rely on it for:

- **Pixel data.** No decode/decompression of _any_ transfer syntax (JPEG / JPEG-LS / JPEG2000 / RLE / HTJ2K); no rendering; no measurements. Encapsulated pixel data is exposed as raw fragments. → `@cosyte/dicom-pixel`.
- **Burned-in PHI.** v1 **warns** it cannot remove burned-in annotation; a "de-identified" output is **metadata-de-identified only**.
- **Networking & web.** No DIMSE (C-STORE/FIND/MOVE, MWL, MPPS); no DICOMweb (QIDO/WADO/STOW). → `@cosyte/dicom-net`, `@cosyte/dicomweb`.
- **Transcoding.** No transfer-syntax conversion. The serializer re-emits in the dataset's source syntax only.
- **Terminology resolution.** Coded values are surfaced (designator + canonical source) but not validated against SNOMED/LOINC/etc.
- **Exotic File Meta round-trip.** Only the typed `FileMeta` fields round-trip; a non-modeled `(0002,xxxx)` element is dropped at parse time, so output is spec-clean but not byte-exact for an unusual File Meta group.

Supported transfer syntaxes (structure for all; **pixels never decoded**): Implicit VR LE `1.2.840.10008.1.2`, Explicit VR LE `…1.2.1`, Deflated Explicit VR LE `…1.2.1.99`, Explicit VR BE `…1.2.2` (retired, legacy-only), and any compressed syntax at the structural level (fragments preserved).

---

## Roadmap

v1 is metadata-feature-complete. Future companion packages (separate repos, demand-sequenced):

- **`@cosyte/dicom-pixel`** — pixel decode/decompression, frame extraction, burned-in-annotation cleaning.
- **`@cosyte/dicom-net`** — DIMSE network services.
- **`@cosyte/dicomweb`** — QIDO / WADO / STOW REST clients.

---

## Contributing

Vendor-quirk fixtures (synthetic or properly de-identified), profile improvements, and dictionary corrections are all welcome — the more real-world edge cases the test suite covers, the more robust the parser gets. See [CONTRIBUTING.md](./CONTRIBUTING.md) if present, or open an issue.

---

## License

[MIT](./LICENSE) © Cosyte

---

_Built by [Cosyte](https://cosyte.com)._

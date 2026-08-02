<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
  <img alt="Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark" src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
</picture>

# @cosyte/dicom

> Read a real-world, vendor-quirky DICOM Part 10 file and pull the metadata you need in one line, without having read the DICOM standard.

[![npm version](https://img.shields.io/npm/v/@cosyte/dicom.svg)](https://www.npmjs.com/package/@cosyte/dicom)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/dicom/ci.yml?branch=main&label=CI)](https://github.com/cosyte/dicom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

A developer-focused DICOM Part 10 parser and utility library for Node.js and TypeScript. **Metadata-first**: it reads the headers (patient, study, series, image, codes, UIDs) leniently and fast, exposes pixel data as raw bytes, and **never decodes pixels**. Sibling to [`@cosyte/hl7`](https://github.com/cosyte/hl7); same engineering bar.

---

## Quickstart

Useful output after install + parse. No DICOM spec knowledge required.

```bash
# pnpm (recommended). Also works with: npm install @cosyte/dicom  |  yarn add @cosyte/dicom
pnpm add @cosyte/dicom
```

```ts
import { readFile } from "node:fs/promises";
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(await readFile("study.dcm"));

ds.get("00100010")?.value; // (0010,0010) Patient's Name: structured PN, never flattened
ds.study.instanceUid; // "1.2.840.…": the global study anchor
ds.image.rescaleSlope; // number | undefined: undefined means "absent", never 1
```

That's the pitch: no config, no schema upload, no spec lookup. The parser accepts vendor-quirky input by default (it tolerates a missing preamble, a wrong File Meta group length, odd-length values, and the dozen-or-so deviations real scanners emit) and records each as a stable warning code rather than failing. You reach for typed value decode, safety-critical views, profiles, or the serializer when you want them.

---

## Features

- **One-line metadata extraction**: `ds.patient`, `ds.study`, `ds.series`, `ds.image`: typed, fail-safe views over the safety-critical attributes. No `(group,element)` tags to memorise.
- **Two access patterns**: named views, or structural `ds.get("00100010")` by 8-character `(group,element)` tag (resolve a keyword to its tag with `Dictionary.byKeyword`), plus `ds.elements()` to walk everything.
- **Lazy typed value decode**: `element.value` decodes raw bytes into a discriminated `DicomValue` across all 34 VRs (numbers, `bigint`s, person names, dates/times, sequences, raw `binary`), honoring `(0008,0005)` Specific Character Set through nested items.
- **Real-world tolerance, Postel's Law**: a lenient reader emits 25 stable warning codes for what it tolerated; only 4 truly-structural conditions are fatal. The serializer always writes spec-clean Part 10.
- **Source/vendor profile system**: `defineProfile()` + 5 built-ins (`ge`, `siemens`, `philips`, `strict`, `lenient`) that only ever _tighten or annotate_ a parse, resolving vendor private tags by the file's live Private Creator string, never a wrong decode.
- **Metadata-level de-identification**: `deidentify()` applies the PS3.15 Annex E Basic Profile + the nine metadata Options, returning a fresh dataset and an audit report that is value-free apart from the source UIDs in `report.uidMap`.
- **Spec-clean serializer**: `serializeDicom(ds)` round-trips a dataset back to Part 10 bytes in its source transfer syntax (no transcode), with correct File Meta group length, even-length padding, byte-exact sequence passthrough, and lossless File Meta: non-modeled `(0002,xxxx)` elements are preserved and re-emitted in tag order.
- **Strict TypeScript, dual ESM + CJS, Node ≥ 22**: `noUncheckedIndexedAccess`, no `any`, JSDoc + `@example` on every public export feeding your editor's IntelliSense. Zero runtime dependencies today.

---

## DICOM in 90 seconds

A DICOM Part 10 file is a 128-byte preamble + the `DICM` magic, then a **File Meta** group (always Explicit VR Little Endian) naming the **transfer syntax**, then the **dataset**: a flat, tag-ordered stream of **data elements**.

Each element is identified by a `(group,element)` **tag** (e.g. `(0010,0010)` = Patient's Name) and carries a two-letter **VR** (Value Representation: `PN`, `DA`, `US`, `SQ`, …) that says how to decode its bytes. Some elements are **sequences** (`SQ`): ordered lists of **items**, each a nested dataset. The transfer syntax decides endianness, whether VRs are written explicitly, and whether the stream is deflated.

```
DICOM file
 ├── preamble (128 bytes) + "DICM"
 ├── File Meta group (0002,xxxx)   : transfer syntax UID, SOP Class/Instance UID
 └── dataset
      ├── (0008,0060) Modality           "CT"
      ├── (0010,0010) PatientName  PN     "Doe^Jane"
      ├── (0020,000D) StudyInstanceUID UI "1.2.840.…"
      ├── (0028,0100) BitsAllocated  US   16
      └── (7FE0,0010) PixelData     OW    «raw bytes, not decoded»
```

`@cosyte/dicom` reads all of that leniently and hands you typed accessors over it. The one thing it deliberately does **not** do is decode the pixels.

---

## Access patterns

### Safety-critical views

The four views (`patient`, `study`, `series`, `image`) pull the right field out of the right tag for the jobs that matter most, and they are **fail-safe**: a missing value is typed-absent (`undefined`), never a substituted default.

```ts
const p = ds.patient;
p.id; // "MRN-42": NOT globally unique on its own…
p.issuerOfId; // …pair with the issuer for cross-system matching
p.name?.alphabetic.familyName; // structured PN, never flattened

const s = ds.study;
s.instanceUid; // "1.2.840.…" Study Instance UID (0020,000D)
s.accessionNumber; // ties the study to the HIS order (0008,0050)
```

### By tag

`get`, `has` and `getAll` take the **8-character `(group,element)` tag** (case-insensitive) and only that: `"00080060"`, not `"Modality"` and not `"(0008,0060)"`. A keyword resolves to its tag through the dictionary first. `getAll` is the always-array complement of `get` (a dataset holds at most one element per tag, so it returns 0 or 1), and `elements()` walks everything.

```ts
import { Dictionary } from "@cosyte/dicom";

ds.get("00080060"); // Modality (0008,0060)
ds.has("7FE00010"); // boolean: is Pixel Data present
ds.elements(); // readonly Element[]: walk everything

// Prefer keywords? Resolve one to its tag, then get by tag.
const tag = Dictionary.byKeyword("Modality")?.tag; // "00080060"
ds.get(tag ?? "");
```

### Typed values

`get` returns an `Element`; its `.value` lazily decodes the raw bytes into a discriminated `DicomValue` and caches the result.

```ts
const rows = ds.get("00280010")?.value; // Rows, a US
if (rows?.kind === "numbers") rows.values[0]; // 512

const name = ds.get("00100010")?.value; // Patient's Name, a PN
if (name?.kind === "personName") name.values[0]?.alphabetic.givenName; // "Jane"
```

Decode is fail-safe: it never throws and never coerces a malformed value to a plausible-but-wrong one (a bad `DS`/`IS` token becomes `null`, never `NaN`→0). Per-value deviations surface on the returned value's own `warnings`.

---

## Cookbook

Recipes for the jobs a metadata parser is actually asked to do. Every attribute cites the PS3 clause it reads.

### Index a folder of studies

Pull a few fields out of each file to build a searchable index: the bread-and-butter PACS/archive job.

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

A quirky object is tolerated rather than rejected, and absent fields come back `undefined`. Check `ds.warnings` to log what was tolerated. A folder walk **does** still need a `try`/`catch`, because all four Tier-3 conditions throw and a real archive meets all four: `UNSUPPORTED_TRANSFER_SYNTAX` for a pixel-compressed object, which this parser does not read; `INVALID_FILE_META` for a truncated or partly-copied file; `NOT_DICOM_PART_10` for whatever non-DICOM file wandered into the folder; and `EMPTY_INPUT` for a zero-byte one. They all throw the one class, so catch `DicomParseError` per file and skip.

### Build routing keys

Routing and reconciliation hang off a small set of identifiers. Surface them correctly: a Patient ID without its issuer is ambiguous across systems (PS3.3 C.7.1.1).

```ts
// Hierarchy keys for filing into Study → Series → Instance:
const studyKey = ds.study.instanceUid; // (0020,000D): global anchor
const seriesKey = ds.series.instanceUid; // (0020,000E)
const instanceKey = ds.image.sopInstanceUid; // (0008,0018)

// Cross-system patient key: id ALONE is not unique; pair it with the issuer:
const p = ds.patient;
const patientKey = `${p.issuerOfId ?? "?"}|${p.id ?? "?"}`;
p.otherIds; // (0010,1002) Other Patient IDs Sequence: additional {id, issuer} pairs
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
img.pixelSpacing; // (0028,0030) patient-plane mm, distinct from imagerPixelSpacing
```

> **Vendor note.** Philips writes private rescale tags `(2005,1409/140A/140B)` that shadow the standard `(0028,1052/1053)`; using the standard tags alone can yield non-quantitative values. This parser **preserves** the private tags so you can prefer them. Reach them with `ds.get("20051409")` (optionally under `profiles.philips`).

For Enhanced multi-frame objects, `image.frame(i)` resolves each frame's functional-group macros Per-Frame-else-Shared (PS3.3 C.7.6.16). It throws a `DicomValueError` (carrying only structural facts, never PHI) for an out-of-range frame or a required geometry macro missing from both groups.

```ts
if (img.isEnhancedMultiFrame) {
  const f = img.frame(0);
  f.planePosition?.imagePositionPatient; // this frame's [x, y, z]
  f.pixelMeasures?.pixelSpacing; // this frame's [row, col] mm
}
```

### De-identify before sharing

`deidentify()` applies the PS3.15 Annex E Basic Application Level Confidentiality Profile (replacing, emptying, or removing every attribute the standard lists as identifying) and returns a fresh dataset plus a report that is value-free apart from the source UIDs in `report.uidMap`.

```ts
import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";

const { dataset, report } = deidentify(parseDicom(buf));
const safe = serializeDicom(dataset); // safe to share: input dataset never mutated

report.attributes.length; // count of attributes acted on (each carries tag/keyword/action, no values)
report.warnings; // e.g. DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED
report.unauditableSequences; // SQ elements emptied because their items could not be walked
report.undefinedVrElements; // elements emptied because their on-wire VR is not a VR
```

UIDs are remapped to deterministic `2.25` replacements that stay consistent across files, so a de-identified study still hangs together. Opt into any of the nine metadata-affecting Annex E Options to keep specific classes of attribute:

```ts
// Keep original UIDs and acquisition dates; clean (rather than drop) free-text descriptions.
deidentify(parseDicom(buf), {
  retain: ["RetainUIDs", "RetainLongitudinalTemporal", "CleanDescriptors"],
});
```

This is **metadata-level** de-identification. Pixel cleaning is out of scope: when a file carries burned-in annotation this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning rather than a false sense of safety (pixel cleaning is deferred to `@cosyte/dicom-pixel`).

The action table comes from NEMA's PS3.15 2026c DocBook, the normative publication of the standard, rather than from a third-party mirror of it, so the current edition's patient attributes are removed rather than quietly kept. That includes the three rows the standard states as a repeating-group mask rather than a single tag: `(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay Comments are matched in every overlay or curve group the standard defines, removed, and named in the report with the mask that matched them. Overlay comments in particular are a common carrier for text typed onto a study, so a clean report on a file that still held them was worse than no report.

The groups a mask covers are the sixteen even ones PS3.5 bounds it to (`6000`-`601E`, `5000`-`501E`), not any four hex digits. Reading `xx` as a wildcard would strip attributes the standard never marked, which is data loss on a call you asked to be conservative. That bound is read out of PS3.5 itself, pinned by SHA-256 the same way the action table is, rather than copied into the source by hand: the current edition states the overlay range, and the curve range comes from the 2004 edition its own note delegates to, with the two required to agree where they overlap.

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

> Series and SOP Instance UIDs are **not** represented in HL7 v2. Image-level identity lives only in DICOM.

### Round-trip: read, edit, re-serialize

```ts
import { parseDicom, serializeDicom } from "@cosyte/dicom";

const ds = parseDicom(buf);
const out = serializeDicom(ds); // spec-clean Part 10, same transfer syntax, no transcode
```

The serializer is the conservative half of Postel's Law: it rebuilds the File Meta group with a correct `(0002,0000)` length, pads values to even length, and re-emits sequences and encapsulated pixel data byte-for-byte. The File Meta group round-trips losslessly: non-modeled `(0002,xxxx)` elements (Sending/Receiving AE Title, Private Information, etc.) are preserved on parse and re-emitted in ascending tag order.

---

## Profiles

Real files come from real vendors, and vendors deviate in documented, predictable ways. A **profile** lets you opt into source-specific tolerance without ever risking a wrong decode. Pass one to `parseDicom`:

```ts
import { parseDicom, profiles } from "@cosyte/dicom";

// Resolve Siemens CSA private headers to their real VRs instead of UN.
const ds = parseDicom(buf, { profile: profiles.siemens });
```

A profile bundles three things that only ever **tighten or annotate** a parse, never loosen it past the lenient default:

- **Private-dictionary overlay**: resolves the Implicit VR of vendor private data elements by the file's _live_ Private Creator string (e.g. `"SIEMENS CSA HEADER"`), keyed canonically as `"GGGGxxLL"` (PS3.5 §7.8.1), never a hard-coded block number. (This is why Agfa IMPAX re-assigning blocks still resolves.) An unknown creator degrades to `UN` plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning. The lookup is scoped to one Data Set, and every Sequence Item is its own (PS3.5 §7.5.1, §7.8.1): a block claimed at the root does not resolve an element inside an item, and an element whose block was never claimed in its own Data Set reads `UN` plus `DICOM_PRIVATE_TAG_NO_CREATOR` rather than borrowing a neighbour's VR. Declare the creator in each item that writes private data.
- **Escalations**: Tier-2 warning codes promoted to a thrown `DicomParseError` (a stricter posture for known-unsafe deviations).
- **Suppressions**: benign, high-volume warning codes silenced for a known-quirky source.

Five built-ins ship under the `profiles` namespace: `ge`, `siemens`, `philips` (vendor overlays, grounded in the public GDCM / dcm4che / dcm2niix dictionaries) and `strict` / `lenient` (posture presets). Build your own with `defineProfile()`. It validates input, composes via `extends`, and returns a frozen profile:

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
| 0    | Silent         | Spec-compliant input           | none                     |
| 1    | Auto-handled   | Trivial deviation, no warning  | trailing-space tidy      |
| 2    | Warning        | Recoverable deviation          | `DICOM_MISSING_PREAMBLE` |
| 3    | Fatal (always) | Unrecoverable structural error | `NOT_DICOM_PART_10`      |

Tier-2 warnings are plain data on `ds.warnings`. Each carries a stable string `code`, a `message` looked up from a frozen registry (never composed from the document), and a `position` with the byte offset where it occurred, so you can react programmatically:

```ts
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

const ds = parseDicom(buf);
for (const w of ds.warnings) {
  if (w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ) {
    // a UN element was recovered as an implicit-VR sequence (CP-246)
  }
}
```

The 26 Tier-2 codes (`DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_VR_MISMATCH`, `DICOM_DA_LEGACY_FORMAT`, … ) live in [`src/parser/warnings.ts`](./src/parser/warnings.ts). Narrow on `w.code === WARNING_CODES.…` for typo-free comparisons, or pass `{ onWarning }` to `parseDicom` to stream them.

The 4 Tier-3 fatal codes (`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`) always throw a `DicomParseError`; they represent input the parser cannot meaningfully recover.

---

## Error Handling

The library throws five typed errors, all exported from the package barrel. Warnings are data rather than throws unless you ask otherwise: a profile's `escalate` list promotes only the codes it names.

### `DicomParseError`

Thrown by `parseDicom` on one of the 4 Tier-3 fatal codes. Carries the byte position, a registry-composed message, and a 16-byte hex `snippet` of the source. The snippet is raw input: treat it as PHI and redact it at your own boundary.

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

Thrown only by `image.frame(i)`: `FRAME_INDEX_OUT_OF_RANGE` for an index outside `[0, numberOfFrames)`, or `MISSING_REQUIRED_FUNCTIONAL_GROUP` when an enhanced object lacks a required geometry macro in both the Per-Frame and Shared groups. Value decode (`element.value`) never throws. It warns and returns `null`/typed-absent instead.

### `DicomSerializeError`

Thrown by `serializeDicom` for `MISSING_TRANSFER_SYNTAX` (the dataset names no transfer syntax to write in) or `UNSUPPORTED_TRANSFER_SYNTAX`.

### `ProfileDefinitionError` · `DeidentifyError`

`defineProfile()` throws `ProfileDefinitionError` for a structurally invalid profile; `deidentify()` throws `DeidentifyError` (`INVALID_OPTIONS`) for an unknown Retain option or malformed UID root. Both messages carry only structural facts (option names, the UID root), never a decoded value.

---

## Known limitations & non-goals

`@cosyte/dicom` is metadata-first by design. Even at v1-complete, do **not** rely on it for:

- **Pixel data.** No decode/decompression, no rendering, no measurements: Pixel Data is exposed as raw bytes. And v1 does not read a **compressed object at all**, not even structurally: a transfer syntax outside the four listed below is the fatal `UNSUPPORTED_TRANSFER_SYNTAX`, so JPEG / JPEG-LS / JPEG2000 / RLE / HTJ2K objects do not parse. → `@cosyte/dicom-pixel`.
- **Burned-in PHI.** v1 **warns** it cannot remove burned-in annotation; a "de-identified" output is **metadata-de-identified only**.
- **A sequence the parser could not open: content is dropped, not passed through.** `deidentify()` recurses only into a sequence whose items the parser materialized. A **standard** `SQ` element with no items is now **emptied**: its bytes are Data Sets by PS3.5 §7.5.1 and PS3.15 §E.1.1 obliges the de-identifier to reach the listed attributes inside them, so a run that cannot enumerate them must not ship them. `report.unauditableSequences` names the carrier and the byte length dropped (capped at 64 entries; the emptying itself is never capped), and `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` is raised. Expect **data loss** on such a file. The parse refusal is usually a sender-side encoding defect, but not always: a **conformant** file nested deeper than this library's own `NESTING_DEPTH_LIMIT` of 64 is refused the same way and loses that sequence too. **Two shapes are exempt and still leak.** A **private** `SQ` kept under `RetainSafePrivate` + a `Profile` is kept verbatim and unaudited, because the profile vouched for it. And an undefined-length **`UN`** the CP-246 descent could not read as a sequence keeps `vr === "UN"`, so the rule does not reach it and cannot be extended there: every ordinary `UN` element also has no items. For either, the reliable test remains `el.items === undefined` on the element itself.
- **An element whose on-wire VR is not a VR: the value is dropped, not passed through.** Under an Explicit VR syntax the VR is two bytes the sender wrote and this parser trusts them. If those two bytes are not one of the 34 PS3.5 §6.2 defines, `deidentify()` **empties** the element: §6.2 requires every undefined VR to be long-form with a 32-bit VL, this parser reads it short-form, so those bytes are not a Value Field the library decoded and PS3.15 §E.1.1's obligation cannot be discharged inside them. `report.undefinedVrElements` names the **byte offset** and the byte length dropped (capped at 64 entries; the emptying itself is never capped) and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` is raised. It names **no tag**, deliberately and uniquely among the report's findings: this header _may_ have been fabricated out of the middle of some element's value, in which case its tag bytes are document content - and nothing distinguishes that case from an honestly-written unrecognized VR, so the tag is withheld either way. The usual cause is an **under**-declared Value Length earlier in the file, which desynchronizes the reader so that leftover value bytes are read as a Data Element header - and the element that genuinely followed becomes the fabricated element's value, which is how a `(0010,0020)` Patient ID used to reach de-identified output. **A file conformant to PS3.5 2026c never trips this**, and an Implicit VR LE file cannot: there the VR comes from the dictionary. (The edition matters: §6.2 exists precisely to say how a _future_ VR will be encoded.) `UN` is one of the 34 and is not affected. **There is no exemption** - unlike the sequence rule above, `RetainSafePrivate` does not keep such an element.
- **An over-declared Value Length into a binary carrier still leaks, and it is a known trade.** The mirror case - an _over_-declared length that swallows the following element into an `OB`/`OW`/`US`/`UN` value - is **not** detected, and a `(0010,0020)` inside it reaches de-identified output with no warning and no report entry. Arbitrary bytes are exactly what those VRs are for, so no content test can decide it; the only candidate remedy was measured and empties conformant binary values (a legal LUT or blob deleted because 8 of its bytes read as a zero-length `(0010,0020)`). String carriers **are** covered, because there the same bytes are provably outside the VR's repertoire. If you accept files from a sender you do not control, treat a binary attribute's length as untrusted.
- **Networking & web.** No DIMSE (C-STORE/FIND/MOVE, MWL, MPPS); no DICOMweb (QIDO/WADO/STOW). → `@cosyte/dicom-net`, `@cosyte/dicomweb`.
- **Transcoding.** No transfer-syntax conversion. The serializer re-emits in the dataset's source syntax only.
- **Terminology resolution.** Coded values are surfaced (designator + canonical source) but not validated against SNOMED/LOINC/etc.

Supported transfer syntaxes, and **exactly** these four (**pixels never decoded** in any of them): Implicit VR LE `1.2.840.10008.1.2`, Explicit VR LE `…1.2.1`, Deflated Explicit VR LE `…1.2.1.99`, Explicit VR BE `…1.2.2` (retired, legacy-only). Any other UID, which includes every pixel-compressed syntax (JPEG, JPEG-LS, JPEG2000, RLE, HTJ2K), is rejected by `parseDicom` with the fatal `UNSUPPORTED_TRANSFER_SYNTAX` rather than read structurally. Deflated is the one compressed syntax in the supported set: it deflates the whole dataset stream rather than the pixels, and it is inflated on parse.

---

## Roadmap

v1 is metadata-feature-complete. Future companion packages (separate repos, demand-sequenced):

- **`@cosyte/dicom-pixel`**: pixel decode/decompression, frame extraction, burned-in-annotation cleaning.
- **`@cosyte/dicom-net`**: DIMSE network services.
- **`@cosyte/dicomweb`**: QIDO / WADO / STOW REST clients.

---

## Contributing

Vendor-quirk fixtures (synthetic or properly de-identified), profile improvements, and dictionary corrections are all welcome. The more real-world edge cases the test suite covers, the more robust the parser gets. See [CONTRIBUTING.md](./CONTRIBUTING.md) if present, or open an issue.

---

## Trademarks

GE, Siemens, and Philips are trademarks of their respective owners. cosyte is not affiliated with, endorsed by, or
sponsored by any of them. The names identify the vendors whose private dictionaries the built-in profiles resolve. See [TRADEMARKS.md](./TRADEMARKS.md).

## License

[MIT](./LICENSE) © Cosyte

---

_Built by [Cosyte](https://cosyte.com)._

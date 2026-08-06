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
- **Real-world tolerance, Postel's Law**: a lenient reader emits stable warning codes for what it tolerated; only 4 truly-structural conditions are fatal. The serializer always writes spec-clean Part 10. (The count used to be quoted here and had drifted: it read `25` against a `WARNING_CODES` of `28`. The locked snapshot in `test/property/__snapshots__/warning-codes.snapshot.test.ts.snap` is the pin, and it is measured on every run rather than narrated here.)
- **Source/vendor profile system**: `defineProfile()` + 5 built-ins (`ge`, `siemens`, `philips`, `strict`, `lenient`) that only ever _tighten or annotate_ a parse, resolving vendor private tags by the file's live Private Creator string, never a wrong decode.
- **Metadata-level de-identification**: `deidentify()` applies the PS3.15 Annex E Basic Profile + the nine metadata Options, returning a fresh dataset and an audit report built from static tables, with two fields that carry source bytes and are named as such on the type: `report.uidMap` (source UIDs) and `report.removedPrivateTags`.
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

`deidentify()` applies the PS3.15 Annex E Basic Application Level Confidentiality Profile (replacing, emptying, or removing every attribute the standard lists as identifying) and returns a fresh dataset plus a report. Two of the report's fields are composed from source bytes rather than from static tables and are documented as such: `report.uidMap`, whose keys are the file's own UIDs, and `report.removedPrivateTags`, whose four-byte entries are the sender's own private tag numbers on a well-formed file and can be value bytes on a malformed one.

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

The Tier-2 codes (`DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_VR_MISMATCH`, `DICOM_DA_LEGACY_FORMAT`, … ) live in [`src/parser/warnings.ts`](./src/parser/warnings.ts), which is the only place their number is worth reading: it said 26 here while the registry held 29, so the numeral is gone rather than corrected. Narrow on `w.code === WARNING_CODES.…` for typo-free comparisons, or pass `{ onWarning }` to `parseDicom` to stream them.

The 4 Tier-3 fatal codes (`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`) always throw a `DicomParseError`; they represent input the parser cannot meaningfully recover.

**Two Tier-2 codes report a LOSS rather than a tolerated deviation, and they are worth reading before you trust a parsed object.** A parsed Data Set is a map keyed by tag, so a file that carries one tag twice in the same Data Set loses the first element's value: the second replaces it, and the survivor looks exactly like an element the sender wrote once. `DICOM_DUPLICATE_TAG_IN_DATA_SET` is raised at the moment of the replacement, with the byte offset of the header that replaced. **That offset is the surviving element's own `Element.byteOffset`, which makes it a lookup only for a collision at the root** - inside a defined-length Sequence Item `Element.byteOffset` is relative to that item's own slice, so the same number can name an untouched root element and the warning does not tell you which Data Set it came from (`position.contextPath` is not populated by any parser warning). PS3.5 2026c §7.1 requires a tag to occur at most once in a Data Set and §7.5.1 requires the same inside an Item, so it cannot fire on a conformant file - the ordinary way to reach it is a length field that lies, which makes bytes inside somebody's value read as a Data Element header. **The reading is unchanged: last one read still wins, and nothing is guessed for the value that was replaced.** If you see this code, the object is missing something the file contained and no round trip will show you what; treat it as you would a fatal, and raise the file with the sender.

**`DICOM_DUPLICATE_FILE_META_ELEMENT` is the same loss in the `(0002,xxxx)` group, and that group is the one that decides how every following byte is read.** The File Meta group is collected into an array rather than a map, so nothing is overwritten there - but the eight tags this library projects into typed `FileMeta` fields are answered by a **first-match** search and are excluded from `FileMeta.extraElements`, the verbatim residue that gives the group its byte-exact round trip. A second copy of one of those tags is in neither, so it left the object. Two copies of `(0002,0010)` Transfer Syntax UID carrying different UIDs are two different readings of the same file, and the order alone decides which you get. **The two codes resolve a repeat the opposite way round, deliberately, because the two readings do: the FIRST copy wins in the File Meta group, the LAST read wins in a Data Set.** Neither reading changed in this release. Unlike the Data Set code, `position.byteOffset` here is unambiguously file-absolute - the File Meta group is never nested - and it locates the copy that was **dropped**, not the survivor. A repeated `(0002,xxxx)` tag this library does not model is silent, because every copy of one is kept in `extraElements` and nothing is dropped - though note that `serializeDicom` then **re-emits both copies**, which is `PRE-EXISTING` and is where this package's round-trip promise and its spec-clean promise disagree. **Two bounds, both `PRE-EXISTING` and neither closed here.** The disclosure covers the group **as the parser delimits it**: a copy an intermediary appended past an honest `(0002,0000)` group length is never a File Meta element to this parser at all, and is relocated into the main Data Set silently. And an over-long or wrong group length is reported by its own codes, not this one.

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
- **A sequence the parser could not open: content is dropped, not passed through.** `deidentify()` recurses only into a sequence whose items the parser materialized. An `SQ` element with no items is now **emptied**: its bytes are Data Sets by PS3.5 §7.5.1 and PS3.15 §E.1.1 obliges the de-identifier to reach the listed attributes inside them, so a run that cannot enumerate them must not ship them. `report.unauditableSequences` names the carrier and the byte length dropped (capped at 64 entries; the emptying itself is never capped), and `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` is raised. Expect **data loss** on such a file. The parse refusal is usually a sender-side encoding defect, but not always: a **conformant** file nested deeper than this library's own `NESTING_DEPTH_LIMIT` of 64 is refused the same way and loses that sequence too. **A private `SQ` kept under `RetainSafePrivate` + a `Profile` was exempt through `0.0.10` and is not any more** (`DICOM-PRIVATE-SQ-CARVE-OUT`): the profile vouches for the private attribute, which is what PS3.15 §E.3.10 licenses, not for an item stream nothing could read. **That closure keys on the parse tree, and the profile is a second authority** (`DICOM-PRIVATE-SQ-PARSE-VR`, closed after `0.0.10`): a private carrier the profile declares `SQ` is emptied and named in `report.unauditableSequences` even when the parse tree calls it something else, keeping the VR the file carried. The two disagree whenever the profile did not reach `parseDicom` (Implicit VR LE writes no VR for a private tag, so the element arrives `UN`) or the sender wrote a binary VR under Explicit VR, where the wire wins - the latter on a fully conformant file, with `ds.warnings` **empty**, so the report is the only channel. **Pass your profile to `parseDicom` as well as to `deidentify()`** and the sequence is walked and its non-PHI content kept rather than dropped. **One shape is still exempt and still leaks:** an undefined-length **`UN`** the CP-246 descent could not read as a sequence, **where no profile named the attribute**. It keeps `vr === "UN"`, and the rule cannot be extended to `UN` in general because every ordinary `UN` element also has no items. Where a profile _does_ declare that private attribute `SQ`, the rule above reaches it and empties it, because that test does not look at the length field. **And the limit on that closure is not what an earlier wording here claimed - the two sets are incomparable, not nested - so that wording is deleted rather than adjusted again:** the rule empties what a `Profile` declares `SQ`, and **every other declaration falls through and is kept verbatim** whenever the embedded-attribute scanner cannot read the value. That scanner reads **string carriers only** and decodes candidate headers in the **file's own encoding**, so a carrier the sender wrote `OB`, `OW` or `UN` is never scanned whatever the profile calls it, and neither is a string carrier holding Explicit-VR-shaped bytes inside an Implicit VR LE file. A well-formed item stream carrying a `(0010,0010)` Patient's Name survives into de-identified output in all of those cases, silently, with an empty `report.unauditableSequences`. The surface is pinned as a measured matrix in `test/integration/deident-private-reservation.test.ts` rather than listed in prose, because the list has been wrong twice. Closing any of it needs a content test on exactly the VRs arbitrary bytes are for, which would also empty conformant binary values, so it is an open product question and not a defect with a known fix. For all of these, the reliable test remains `el.items === undefined` on the element itself.
- **An unrecognized Explicit VR is read (and written) long-form, and `deidentify()` still empties the element.** PS3.5 2026c §6.2: "All new VRs defined in future versions of DICOM **shall** be of the same Data Element Structure as defined in [§7.1.2] with reserved bytes after the VR and a 32-bit unsigned integer VL." So two on-wire VR bytes outside the 34 this release knows get a **12-byte header**, exactly as `OB` and `UT` do, on both the read and the write path. Before `0.0.9` the reader took the 8-byte form, which read the length out of the two bytes §6.2 reserves. What such a file did then was **shape-specific** - sometimes a whole-object refusal, sometimes a clean parse into a tree the sender did not write - which is why this package ships `scripts/measure-unrecognized-vr.ts` and no one-sentence account of it. The value is otherwise handled like any other: a declared length past the end of the buffer, or an undefined length, is refused exactly as it is for every other non-`SQ` VR. **The trade is stated rather than buried**: a sender that ignores §6.2 and writes an unrecognized VR short-form produced a readable object before and is refused now. `deidentify()` **still empties** such an element, because reading a header is not the same as knowing what its value means - Table E.1-1 acts per attribute, and nothing can say whether a VR from a later edition holds a name, a date or an opaque blob. `report.undefinedVrElements` names the **byte offset** and the byte length dropped (capped at 64 entries; the emptying itself is never capped) and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` is raised. It names **no tag**, deliberately and uniquely among the report's findings: the header may still have been fabricated out of the middle of some element's value, in which case its tag bytes are document content - and nothing distinguishes that case from an honestly-written unrecognized VR, so the tag is withheld either way. An Implicit VR LE file cannot reach any of this: there the VR comes from the dictionary. `UN` is one of the 34 and is not affected. **There is no exemption** - unlike the sequence rule above, `RetainSafePrivate` does not keep such an element.
- **`RetainSafePrivate` retains nothing inside ANY Item of a sequence whose item stream over-runs its own declared length.** An Item that declares more bytes than its enclosing Sequence does absorbs whatever follows the sequence, so a private data element the sender wrote at the **root** - with no Private Creator reserving its block there - can land beside a creator that is genuine Item content and be kept verbatim. Measured on the published `0.0.8` tarball it was, with `report.removedPrivateTags` reading `[]`, the object stamped `(0012,0062) Patient Identity Removed = YES` and `ds.warnings` empty: a stamp that outran the redaction. (**There is no `0.0.9` on the registry** - `package.json` carried it and the publish never happened, an npm `E404` - so earlier wording here that said "through `0.0.9`" named a version that does not exist. Measured on the current published `0.0.10`, this direction is fixed.) PS3.5 2026c §7.8.1 scopes a private block reservation to the Item ("The scope of the reservation is just within the Item"), so a file that contradicts itself about where the Item ends does not determine which reservation covers an element; PS3.15 2026c §E.3.10 retains only what is **known** safe and requires that "all other Private Attributes shall be removed **or processed in the element-specific manner recommended by Deidentification Action (0008,0307), if present within Private Data Element Characteristics Sequence (0008,0300)**" (a two-branch clause; this library does not implement `(0008,0307)`, so removal is the branch available to it). So every private element the recursion **reaches** inside such a sequence, at every depth below it, is removed and named in `report.removedPrivateTags`. **The unit is the SEQUENCE, not the individual Item**: `descendSequence` decides once and applies it to every item, so a two-item sequence where only item 1 over-runs also loses a genuine block sitting in the honest item 0 (measured; the grid sweeps single-item fixtures, so that extra cost is NOT inside the priced 20). **The one route this rule did not reach is closed** (`DICOM-PRIVATE-SQ-CARVE-OUT`): a **private `SQ`** the profile vouches for was kept verbatim before the descent ran, so nothing inside it was examined; it is now walked like any other sequence, and a private element the file's own length fields pulled into its items is refused there. **The direction is not fail-safe on its own and the opposite claim is retracted**: it depends on where the sender put the Private Creator. Both **absorb** placements are pinned by tests, and so is the **eject** placement (below). Treat `DICOM_ITEM_CROSSES_SEQUENCE_END` as "this file's structure is in dispute", never as a statement about what was retained. **The price is measured, not asserted**: on `scripts/measure-sq-bound-grid.ts`, 58 cells lose a private value and **20 of them were not leaking anything** (the creator and the data element were both genuine Item content). Retention on a file that does not contradict itself is unchanged, and **no reading changes** - no parser file is touched. This is not a parser bound: an over-declaring Item and an under-declaring Sequence are byte-identical, so nothing on the wire can separate them.
- **`RetainSafePrivate` also retains nothing a Data Set holds AFTER a sequence whose own contents contradict the extent it declared.** The mirror direction: an Item that _under_-declares **ejects** its trailing elements out into the enclosing Data Set, and a Private Creator that lands there reserves a block for elements the sender never put beside it - the same false attestation. **Measured on the published `0.0.10` tarball, which is the current registry version**: `report.removedPrivateTags` `[]`, the value in the serialized output, `(0012,0062) = YES`, `ds.warnings` empty and no throw under `{ strict: true }`. It applies **in every Data Set, not only the root**: an inner sequence ejecting a creator into the still-usable Item that encloses it is measured and pinned. The cut is **positional**, so a reservation the sender wrote **ahead of** the offending sequence is untouched, and the same reservation written **after** it is refused. **Two predicates, because the parser records the same contradiction two ways**: under Explicit VR the item stream over-runs and the span shows up as `rawBytes.length > length`; under Implicit VR LE that path slices the item stream, so nothing over-runs at all and the descent is refused instead (`DICOM_SQ_NOT_DESCENDED`, `Element.items === undefined`). The second predicate is **broader than the ejection it is here for, deliberately**: it says the parser could not walk the sequence, which other unwalkable item streams also reach. **And two BOUNDS, not one, because a Data Set is a `Map<Tag, Element>`**: an ejected element whose tag the Data Set already holds overwrites in place and inherits the earlier element's position, ahead of the sequence it came out of, so `Element.byteOffset` is checked beside the index. **That collision also destroys the root's own value at parse time** - `PRE-EXISTING`, unchanged here, and pinned by a test so it is not mistaken for something this rule handles. It was silent when that was written; `DICOM_DUPLICATE_TAG_IN_DATA_SET` reports it now (below), and the destruction itself is still unchanged. **The price is measured**: on `scripts/measure-sq-bound-grid.ts` all **22** cells that retained a private value at the root on a self-contradicting file whose honest control removes it go to **0**, at the cost of **56** further root retentions on self-contradicting files whose honest control does keep the value (the column is `de-identified OUTPUT lost a marker (cost)`, reading 78; the parse-tree `LOST`/`GAINED a marker value` counters beside it read 0). Retention on a file that does not contradict itself is unchanged (9 at the root, 6 in an Item), and **no reading changes**: 0 cells differ in any parse respect, 0 cells whose reading differs, and no parser file is touched.
- **An over-declared Value Length into a binary carrier still leaks, and it is a known trade.** The mirror case - an _over_-declared length that swallows the following element into an `OB`/`OW`/`US`/`UN` value - is **not** detected, and a `(0010,0020)` inside it reaches de-identified output with no warning and no report entry. Arbitrary bytes are exactly what those VRs are for, so no content test can decide it; the only candidate remedy was measured and empties conformant binary values (a legal LUT or blob deleted because 8 of its bytes read as a zero-length `(0010,0020)`). String carriers **are** covered, because there the same bytes are provably outside the VR's repertoire. If you accept files from a sender you do not control, treat a binary attribute's length as untrusted.
- **`(0012,0063)` De-identification Method is ADDED TO, so a prior de-identifier's text is carried into the output.** PS3.15 2026c §E.1.1 says a text string describing the method "shall be inserted in or added to" that attribute, and this library used to **replace** it - destroying the provenance chain the attribute exists to carry, silently, on a file whose earlier pass may be the one a recipient was relying on. It now appends its own text as a further value of the `1-n` attribute, after a `\`, copying the prior bytes through verbatim. **The method string is itself a `1-n` value**: it is split on `\` and only the values not already recorded are added. **Trailing SPACE and NUL are padding rather than content** (PS3.5 2026c Table 6.2-1's `LO` row, which describes a **Value**, and `LO` is `1-n`), so they are ignored **per value, on both sides** when your string is matched against what is already recorded, and trimmed from the value written. Repeated de-identification is therefore a fixed point **from the first pass**, for every string: with or without a delimiter, and with a pad byte on any value, last or not. Leading spaces are yours and are written through untouched; a method string that is padding only records nothing. **One bound, and it is not cosmetic**: `LO` is a short-form VR whose Value Length field is 16 bits, so when the join would not fit, the prior value is **replaced** rather than added to and `report.warnings` carries `DICOM_DEIDENT_METHOD_NOT_ADDED`. Read that code as "the length ceiling was reached", never as "every fallback is disclosed": a `(0012,0063)` a file encoded under a VR other than `LO` is also replaced, and that one has its own code, `DICOM_DEIDENT_METHOD_NOT_LO`. An element the serializer cannot encode would take the whole de-identified object down, and truncating the sender's earlier records instead would be a policy the standard does not state. A `deidentificationMethod` longer than that ceiling on its own is unchanged from every earlier release and still fails to serialize. **The cost is stated rather than glossed**: `(0012,0063)` is **not in Table E.1-1**, so the Basic Profile keeps it exactly as it keeps every other unlisted attribute, and a sender who wrote something identifying into it now sees that text in de-identified output where the replacement used to remove it as a side effect. That is the retained-by-omission posture of every unlisted attribute, not a rule this insertion states; it is pinned by a residual test that asserts the cost. **It is not silent**: `report.warnings` carries `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` whenever prior bytes from the source file survive into `(0012,0063)`, because an object stamped `(0012,0062) = YES` carrying text nothing in the run inspected is a stamp that outran the redaction. It is **not** on `report.retained` - that field lists the Annex E option sets active for the run, and a kept attribute is not one of them. `(0012,0062)` Patient Identity Removed is still **replaced** with `YES` - the same paragraph of §E.1.1 uses the other verb for it ("shall be replaced or added to"), and the asymmetry is the standard's. A `(0012,0063)` a file encoded under a VR other than `LO` is replaced rather than appended to, and `report.warnings` now carries `DICOM_DEIDENT_METHOD_NOT_LO` when it is: the join concatenates `LO` values with the `5CH` delimiter, which is not defined over arbitrary octets, so replacing is deliberate and only the silence was the defect. **And the method text this library writes for itself is now multi-valued, one Value for the Profile and one per active Option.** PS3.5 2026c Table 6.2-1 caps an `LO` at **64 characters per Value** and `(0012,0063)` is `1-n`; the single-value string it wrote before measured **76** characters with no options, **130** with three and **272** with all nine, so every object de-identified without a caller-supplied method, in every release up to and including this one, carried a value no `LO` may legally hold - in the one attribute a strict receiver reads to decide whether the object was de-identified at all. **Re-de-identifying such an object keeps that 76-character Value**, because a prior record is added to rather than rewritten (measured: a flat 138 bytes over four passes, values of 76 and 61, `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` raised for the retention and nothing said about the length). Your own `deidentificationMethod` is **not** bounded for you either: split it on `\` yourself if a strict receiver is in your path.
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

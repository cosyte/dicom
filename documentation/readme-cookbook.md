`README.md` links here from its own `## Cookbook` heading. Every section below carries the heading it carries there.

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

Routing and reconciliation hang off a small set of identifiers. Surface them correctly: a Patient ID without its issuer is ambiguous across systems. The two attributes are `(0010,0020)` Patient ID and `(0010,0021)` Issuer of Patient ID in the PS3.6 2026c registry, which is vendored and SHA-pinned here; the module that requires them to be read together is in PS3.3, which is **not** vendored here, so no clause number is claimed for it.

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

For Enhanced multi-frame objects, `image.frame(i)` resolves each frame's functional-group macros Per-Frame first and Shared second. The functional-group macros are defined in PS3.3, which is **not** vendored here, so no clause number is claimed for them. It throws a `DicomValueError` (carrying only structural facts, never PHI) for an out-of-range frame or a required geometry macro missing from both groups.

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
report.unauditableSequences; // carriers this run could not look inside and EMPTIED for it.
// `.applied` is "emptied", always: that value is NOT in your output. The retired "kept"
// outcome, which meant "it IS in your output, verbatim and unexamined", is gone with the
// behaviour behind it (see "Known limitations")
report.unenumerablePrivateRemovals; // private attributes REMOVED because this run did not
// enumerate their value: one entry per instance, carrying `applied: "removed"`, `reason:
// "unenumerable"` and the Data Set it lived in. Complete and never capped, unlike the
// findings above, so an audit can rely on it at any input size
report.undefinedVrElements; // elements emptied because their on-wire VR is not a VR
```

What the de-identified object declares about its own dates, `(0028,0303)`, is in `README.md` under this same heading.

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

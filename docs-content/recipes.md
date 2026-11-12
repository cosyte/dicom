---
id: recipes
title: Recipes
sidebar_label: Recipes
sidebar_position: 12
description: Short recipes for the jobs a metadata parser is asked to do, from indexing a folder of studies to de-identifying before sharing.
---

# Recipes

Recipes for the jobs a metadata parser is actually asked to do. Every attribute cites the PS3 clause it reads. The [cookbook](./cookbook) works through the same jobs at more length, with runnable examples, and the [known limitations](./limitations) say what not to rely on.

## Index a folder of studies

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

A quirky object is tolerated rather than rejected and absent fields come back `undefined`; a JPEG, JPEG 2000, RLE, or other PS3.5 2026c section A.4 compressed object indexes like any other, its pixels untouched, and so does a JPIP Referenced object, its Pixel Data Provider URL read and never fetched. Check `ds.warnings` to log what was tolerated. A folder walk **does** still need a `try`/`catch`, because every Tier-3 condition throws and a real archive meets each of them: `UNSUPPORTED_TRANSFER_SYNTAX` for an object under a syntax this parser refuses (SMPTE ST 2110, or a retired UID); `INVALID_FILE_META` for a truncated or partly-copied file; `NOT_DICOM_PART_10` for whatever non-DICOM file wandered into the folder; and `EMPTY_INPUT` for a zero-byte one. They all throw the one class, so catch `DicomParseError` per file and skip.

The same fields from one in-memory object, a synthetic one the test suite parses on every change:

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// A synthetic CT object, saved without its 128-byte preamble: an invented patient and example-root
// UIDs, no real PHI.
const ds = parseDicom(
  Buffer.from(
    "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
    "base64",
  ),
);

const row = {
  patientId: ds.patient.id, // (0010,0020)
  studyUid: ds.study.instanceUid, // (0020,000D)
  modality: ds.series.modality, // (0008,0060)
  rows: ds.image.rows, // (0028,0010)
};

row.patientId; // => "MRN-42"
row.modality; // => "CT"
row.rows; // => 512
```

## Read only the header of a large file

`parseDicom` takes the whole file as one buffer, so indexing a 1 GiB multi-frame study that way holds 1 GiB in memory to read a few hundred bytes of patient and study tags. `readDicomHeader` reads from a path, a file handle or a stream only as far as the Pixel Data, and never reads the rest:

```ts
import { createReadStream } from "node:fs";
import { readDicomHeader } from "@cosyte/dicom";

// From a path: opened, read up to the Pixel Data, closed.
const ds = await readDicomHeader("study.dcm");
ds.patient.id; // (0010,0020)
ds.study.instanceUid; // (0020,000D)
ds.has("7FE00010"); // false: Pixel Data was never read

// From a stream, stopping earlier: before the first tag of group 0020.
const patientOnly = await readDicomHeader(createReadStream("study.dcm"), {
  stopBeforeTag: "00200000",
});
```

It stops before the first top-level element whose tag is at or after `stopBeforeTag`, Float Pixel Data `(7FE0,0008)` when that is not given, which is also before Double Float Pixel Data and Pixel Data. The Dataset is the one `parseDicom` returns on the whole file with the same `stopBeforeTag`: the same elements, byte for byte, the same warnings, and a last warning, `DICOM_PARSE_STOPPED_BEFORE_TAG`, at the element it stopped before. It reads 64 KiB first and twice as much each time the header turns out to be longer. The source is a `DicomByteSource`: a path, a `file:` URL, a `DicomFileHandle` (Node's `FileHandle` from `node:fs/promises` is one) or any async iterable of bytes. A handle is read from byte 0 and left open; a stream is ended early once the stop is found.

Three kinds of file are read to the end, and so held in memory whole: one with no top-level element at or after the stop tag, a Deflated Explicit VR Little Endian one (its Data Set, Pixel Data included, is one deflate stream), and one `parseDicom` would refuse, so the error thrown is the one the whole file gives. A stream's chunks are held as the stream makes them, so a stream that delivers the whole file as one chunk has put it all in memory before the read sees it.

For a file you do not trust, set `maxBytes`, the one field `ReadDicomHeaderOptions` adds to `ParseOptions`. The read then never holds more than that many bytes of the source: when the stop is not within them and the file goes on, it throws a `RangeError` instead of reading on. There is no default, since any number we picked would refuse some legitimate file (a large Deflated study, a long structured report), so without it the three kinds above are read whole:

```ts
import { readDicomHeader } from "@cosyte/dicom";

try {
  const ds = await readDicomHeader("upload.dcm", { maxBytes: 16 * 1024 * 1024 });
  ds.patient.id;
} catch (err) {
  if (err instanceof RangeError) {
    // No stop tag in the first 16 MiB: refuse the upload rather than read on.
  }
}
```

With the bytes already in memory, `parseDicom` takes the same option. Nothing past the stop is read, so a file cut short inside its Pixel Data still parses:

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// The synthetic CT object from the recipe above, stopped before its first (0020,xxxx) tag.
const ds = parseDicom(
  Buffer.from(
    "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
    "base64",
  ),
  { stopBeforeTag: "00200000" },
);

ds.patient.id; // => "MRN-42"
ds.has("0020000D"); // => false
ds.warnings.at(-1)?.code; // => "DICOM_PARSE_STOPPED_BEFORE_TAG"
```

## Build routing keys

Routing and reconciliation hang off a small set of identifiers. Surface them correctly: a Patient ID without its issuer is ambiguous across systems. The two attributes are `(0010,0020)` Patient ID and `(0010,0021)` Issuer of Patient ID in the PS3.6 2026d registry, which is vendored and SHA-pinned here; the module that requires them to be read together is in PS3.3, which is **not** vendored here, so no clause number is claimed for it.

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

## Read pixel-interpretation metadata safely

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

## Read encapsulated Pixel Data fragments

An object under a PS3.5 2026c section A.4 syntax (JPEG, JPEG-LS, JPEG 2000, HTJ2K, RLE, and the rest) carries its Pixel Data as a Basic Offset Table plus fragments. `readPixelDataFragments` hands them back as raw bytes, in file order, with no Item header in any of them, and **decodes nothing**: no pixel is decompressed, no frame is assembled from fragments, and the Basic Offset Table's offsets are not interpreted. Hand the bytes to a codec of your choice.

```ts
import { parseDicom, readPixelDataFragments, WARNING_CODES } from "@cosyte/dicom";

const ds = parseDicom(buf);
const pixels = readPixelDataFragments(ds); // undefined: no Pixel Data, or native Pixel Data
if (pixels !== undefined) {
  pixels.basicOffsetTable; // Buffer, zero bytes when the table is empty
  pixels.fragments; // readonly Buffer[], each as written
  const short = ds.warnings.some(
    (w) => w.code === WARNING_CODES.DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED,
  ); // true: the stream ended before its Sequence Delimitation Item, so the list may be short
}
```

The buffers are views over the parsed element unless you parse with `{ copyValues: true }`. **The limits sit beside it**: the pixels are never decoded, and `serializeDicom` writes a compressed object read here, de-identified or not, back with these fragments byte for byte, but refuses with `INVALID_ENCAPSULATED_PIXEL_DATA` a stream section A.4 does not allow, the short one flagged above included, rather than repairing it.

## De-identify before sharing

`deidentify()` applies the PS3.15 Annex E Basic Application Level Confidentiality Profile (replacing, emptying, or removing every attribute the standard lists as identifying) and returns a fresh dataset plus a report. Two of the report's fields are composed from source bytes rather than from static tables and are documented as such: `report.uidMap`, whose keys are the file's own UIDs, and `report.removedPrivateTags`, whose four-byte entries are the sender's own private tag numbers on a well-formed file and can be value bytes on a malformed one.

```ts
import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";

const { dataset, report } = deidentify(parseDicom(buf));
const safe = serializeDicom(dataset); // safe to share: input dataset never mutated
// (a PS3.5 2026c section A.4 compressed object is written in its own syntax, its fragments
// untouched; it throws INVALID_ENCAPSULATED_PIXEL_DATA for a stream section A.4 does not allow)

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

**The de-identified object says what this run did to its dates, so a recipient does not have to guess.** `deidentify()` writes `(0028,0303) Longitudinal Temporal Information Modified`, and it has three states: **`REMOVED`** when no Retain Longitudinal Temporal Information Option was active, which is the default, **`UNMODIFIED`** when `RetainLongitudinalTemporal` was, and **`MODIFIED`** when `RetainLongitudinalTemporalModifiedDates` was. PS3.15 2026c §E.2 requires the first ("The Attribute Longitudinal Temporal Information Modified (0028,0303) shall be added to the Data Set with a Value of `REMOVED` if none of the Retain Longitudinal Temporal Information Options is applied") and §E.3.6 the other two, for its Full Dates and Modified Dates branches. Without it, a recipient reading dates cannot tell real ones from scrubbed ones, and guessing wrong hurts in both directions: treating real dates as scrubbed under-protects the patient, and treating scrubbed dates as real corrupts a longitudinal analysis.

```ts
const removed = deidentify(parseDicom(buf)).dataset;
removed.get("00280303")?.value; // { kind: "strings", values: ["REMOVED"] }

const kept = deidentify(parseDicom(buf), { retain: ["RetainLongitudinalTemporal"] }).dataset;
kept.get("00280303")?.value; // { kind: "strings", values: ["UNMODIFIED"] }

const modified = deidentify(parseDicom(buf), {
  retain: ["RetainLongitudinalTemporalModifiedDates"],
}).dataset;
modified.get("00280303")?.value; // { kind: "strings", values: ["MODIFIED"] }
```

**The two Retain Longitudinal Temporal Information Options are mutually exclusive, and the second one's limitation ships beside it.** §E.3.6 defines them as alternatives, so a call naming both is rejected with a `DeidentifyError`. `RetainLongitudinalTemporalModifiedDates` resolves Table E.1-1's modified-dates column, which is the more protective of the two on every row where they differ, and it writes `MODIFIED`. **This library performs no date transformation**: §E.3.6 also requires the dates themselves to be modified and the manner of modification to be described in a Conformance Statement, and both are yours. Every such run carries `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on `report.warnings` saying exactly that, so the residual is never silent.

**It is REPLACED, not added to.** The attribute is `VM 1` and both clauses say the value "shall be added to the Data Set with a Value of" one named state, so a `(0028,0303)` the source file already carried is discarded rather than joined: the opposite of what `(0012,0063)` does with the same run's method text, and the asymmetry is the standard's. That is deliberate: two contradictory states in one single-valued attribute would leave a recipient reading a state no run produced. The value is not on `DeidentifyReport`; like `(0012,0062)`, it is a statement the object makes about itself.

**The object also says which Profile and Options produced it, as codes beside the text.** Every run writes a top-level `(0012,0064)` De-identification Method Code Sequence next to the `(0012,0063)` text, with an Item for each code from PS3.16 2026d CID 7050 (context group version `20170914`): `113100` Basic Application Confidentiality Profile first, then an Item for each active Option in `DEIDENTIFY_OPTIONS` order, each carrying exactly Code Value, Coding Scheme Designator `DCM` and Code Meaning. PS3.15 2026c §E.1.1 asks for these codes "and/or" the text, and the text already satisfied it, so this is the machine-readable half rather than a conformance fix: a consumer switches on a code instead of parsing English, and the two §E.3.6 branches are told apart by `113106` and `113107`. `DEIDENTIFICATION_METHOD_CODES` carries, for each Option, the code it writes and its row of CID 7050, and [De-identification](./deidentification) has the table. The codes are **added to** the Items a source already carried, never replacing them, and a code a prior Item already records under the same designator and value is not added again, so de-identifying an output again with the same options is a fixed point. **Its limits, stated beside it:** `113101` Clean Pixel Data Option and `113102` Clean Recognizable Visual Features Option are never written, because this layer does not touch pixels; `113107` says the modified-dates column was resolved, **not** that any date was shifted, the same limit `MODIFIED` carries, so `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` still rides with it; the codes follow the options that ran and never your `deidentificationMethod` text; prior Items reach the output un-inspected (no Table E.1-1 row covers them and no prior code is checked against CID 7050), which `DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED` discloses; a prior `(0012,0064)` that is not a Sequence of Items this run can read is replaced by this run's codes, which `DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED` discloses; and only the top-level attribute is written or read.

UIDs are remapped to deterministic `2.25` replacements that stay consistent across files, so a de-identified study still hangs together. Opt into the metadata-affecting Annex E Options to keep specific classes of attribute (the two PS3.15 §E.3.6 temporal ones are alternatives, so take at most one of them):

```ts
// Keep original UIDs and acquisition dates; clean (rather than drop) free-text descriptions.
deidentify(parseDicom(buf), {
  retain: ["RetainUIDs", "RetainLongitudinalTemporal", "CleanDescriptors"],
});
```

This is **metadata-level** de-identification. Pixel cleaning is out of scope: when a file carries burned-in annotation this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning rather than a false sense of safety (pixel cleaning is deferred to `@cosyte/dicom-pixel`).

The action table comes from NEMA's PS3.15 2026d DocBook, the normative publication of the standard, rather than from a third-party mirror of it, so the current edition's patient attributes are removed rather than quietly kept. That includes the three rows the standard states as a repeating-group mask rather than a single tag: `(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay Comments are matched in every overlay or curve group the standard defines, removed, and named in the report with the mask that matched them. Overlay comments in particular are a common carrier for text typed onto a study, so a clean report on a file that still held them was worse than no report.

The groups a mask covers are the sixteen even ones PS3.5 bounds it to (`6000` to `601E`, `5000` to `501E`), not any four hex digits. Reading `xx` as a wildcard would strip attributes the standard never marked, which is data loss on a call you asked to be conservative. That bound is read out of PS3.5 itself, pinned by SHA-256 the same way the action table is, rather than copied into the source by hand: the current edition states the overlay range, and the curve range comes from the 2004 edition its own note delegates to, with the two required to agree where they overlap.

## Bridge to FHIR / HL7 v2

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

## Round-trip: read, edit, re-serialize

```ts
import { parseDicom, serializeDicom } from "@cosyte/dicom";

const ds = parseDicom(buf);
const out = serializeDicom(ds); // spec-clean Part 10, same transfer syntax, no transcode
```

The serializer is the conservative half of Postel's Law: it rebuilds the File Meta group with a correct `(0002,0000)` length, pads values to even length, re-emits encapsulated pixel data byte-for-byte, and writes every Data Set in ascending tag order (PS3.5 2026c §7.1, §7.5.1), whatever order the source file or your code left it in. That covers the root and the Data Set of every Item of every Sequence it can walk on the wire, at every depth up to `NESTING_DEPTH_LIMIT`: Items stay in their order, and only whole elements move, so no value byte changes and nothing the Sequence's own bytes did not carry is written. A Sequence is re-ordered only where its parsed `items` match its bytes, so the output reads back as the source did. The limits sit with it. A tag repeated inside an Item is kept twice, in source order, so that output still breaks the "at most once" of PS3.5 2026c §7.1. A Sequence whose Item stream cannot be walked to exactly its end, one nested past the bound, one whose parsed `items` do not match its bytes (a Sequence the parser did not descend, for one), and any `UN`-carried Sequence (under Implicit VR LE that includes a private Sequence inside an Item, even one a `Profile` resolved to `SQ`, since a default read resolves its tag to `UN`) are written as read, unordered. An element whose own bytes do not show where a reader ends it (an undefined-length `UN` the parser could not read as a Sequence, or a value missing its Sequence Delimitation Item) is written after the ascending rest of its Data Set, because a reader takes whatever follows it into its value. So is a Sequence nested past the bound, unless it is a defined-length Sequence under Implicit VR LE, since seeing where a reader ends any other would take the walk past the bound. An element the parser relocated because a length field lied is ordered where the parser placed it: ordering cannot recover an order the source destroyed. The File Meta group round-trips losslessly: non-modeled `(0002,xxxx)` elements (Sending/Receiving AE Title, Private Information, etc.) are preserved on parse and re-emitted in ascending tag order.

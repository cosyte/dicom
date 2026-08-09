---
id: cookbook
title: Cookbook
sidebar_position: 2
---

# Cookbook

Task-oriented recipes for the DICOM jobs you actually get handed. Each one is: here's the problem,
here's the code, here's what you get back. Every symbol below is a real `@cosyte/dicom` export, no
pseudo-API. All sample objects are **synthetic** (an invented patient, fake UIDs), encoded as base64
so a recipe needs no file on disk; never paste a real DICOM object into a doc or a test.

Read [Getting started](./intro) first for the parse model; the recipes here assume you can already
get a parsed `Dataset`. Read [Known limitations](./limitations) before you trust any of this on real
data: it is the one page on this site written to tell you what the library does **not** do.

## How the citations here work

Every recipe names the PS3 clause for the attributes it reads, and the rule for which clause it may
name is deliberately narrow.

- **Attribute identity** (tag, name, keyword, VR, VM) is cited to **PS3.6 2026c**, the Registry of
  DICOM Data Elements. That document is **vendored in this repository and pinned by SHA-256**
  (`vendor/nema/part06/`), the same copy the shipped data dictionary is generated from, and a test
  re-reads it to confirm that every `(gggg,eeee) Name` pair written on this site is the registry's
  own.
- **Encoding rules** are cited to **PS3.5 2026c** and **de-identification rules to PS3.15 2026c**,
  both vendored and pinned the same way (`vendor/nema/part05/`, `vendor/nema/part15/`). Two checks of
  different strength run over those, and **what each one covers is worth stating exactly, because a
  citation gate that is described as total is a claim of its own**. A clause written in the form
  `PS3.N §X`, `PS3.N section X` or `PS3.N Annex X`, with the label next to its part, is resolved in
  the pinned document by collecting all candidate sections carrying that label and requiring exactly
  one. **A label the text writes away from its part is not covered**: a second label in a list
  (`§7.5.1, §7.8.1`) and a bare `section X` whose part was named a sentence earlier are both read by
  a human, not by the gate. On top of that, each clause the text leans on for a normative statement
  is required to carry that sentence **in its own body, not in a subsection**, because a label proves
  the label exists and proves nothing about what the body says.
- **No numbered clause of PS3.3, PS3.4, PS3.10 or PS3.16 is cited anywhere on this site.** Those
  parts are not vendored here, so a clause number for one could not be checked against anything, and
  a citation nobody can check is worse than none. Where an IOD-level or file-format rule matters, the
  text names the part and says what it relies on, without a clause number.

The date in every sample object below is `19000101`. That is not a style choice: this repository's
PHI scanner reads doc fixtures as well as test fixtures, and it rejects any `DA` or `DT` value inside
the last 120 years wherever it finds one, because a plausible real study date is exactly the shape it
exists to catch.

---

## 1. Extract metadata and index a folder of studies

**The problem:** you have a directory of objects and you need a searchable index: who, which study,
which series, which instance, what kind of image.

The four views (`patient`, `study`, `series`, `image`) pull the right field out of the right tag, and
they are fail-safe: an absent attribute reads `undefined`, never a substituted default.

**Attributes read** (PS3.6 2026c, Registry of DICOM Data Elements): `(0010,0020)` Patient ID,
`(0010,0021)` Issuer of Patient ID, `(0008,0050)` Accession Number, `(0020,000D)` Study Instance UID,
`(0020,000E)` Series Instance UID, `(0008,0018)` SOP Instance UID, `(0008,0016)` SOP Class UID,
`(0008,0060)` Modality, `(0008,0020)` Study Date, `(0028,0010)` Rows, `(0028,0011)` Columns.

```ts runnable
import { parseDicom, Dictionary } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const ds = parseDicom(buf);

const row = {
  patientId: ds.patient.id, //         (0010,0020)
  issuer: ds.patient.issuerOfId, //    (0010,0021)
  accession: ds.study.accessionNumber, // (0008,0050)
  studyUid: ds.study.instanceUid, //   (0020,000D)
  seriesUid: ds.series.instanceUid, // (0020,000E)
  sopInstanceUid: ds.image.sopInstanceUid, // (0008,0018)
  modality: ds.series.modality, //     (0008,0060)
  rows: ds.image.rows, //              (0028,0010)
  columns: ds.image.columns, //        (0028,0011)
};

row.patientId; // => "MRN-42"
row.accession; // => "ACC-0001"
row.modality; // => "CT"
row.rows; // => 512

// A date is structured rather than a string, and `valid` is answered rather than assumed.
ds.study.date?.year; // => 1900
ds.study.date?.valid; // => true

// SOP Class UID says what KIND of object this is. Resolve the UID to its registered name
// through the dictionary rather than hard-coding a table of your own.
const sopClass = ds.get("00080016")?.value;
const sopClassUid = sopClass?.kind === "strings" ? sopClass.values[0] : undefined;
Dictionary.uid(sopClassUid ?? "")?.name; // => "CT Image Storage"

// The parser recorded no deviation. That is a statement about what THIS reader tolerated,
// not a conformance verdict: PS3.10 governs the file format and is not vendored here.
ds.warnings.length; // => 0
```

Over a real folder, wrap the parse per file. A quirky object is tolerated rather than rejected and
absent fields come back `undefined`, but **a folder walk still needs a `try`/`catch`**, because the
four Tier-3 conditions throw and a real archive meets all four: `UNSUPPORTED_TRANSFER_SYNTAX` for a
pixel-compressed object, which this parser does not read; `INVALID_FILE_META` for a truncated or
partly-copied file; `NOT_DICOM_PART_10` for whatever non-DICOM file wandered into the folder; and
`EMPTY_INPUT` for a zero-byte one. All four throw the one class, so catch `DicomParseError` per file
and skip.

```ts
import { readFile } from "node:fs/promises";
import { parseDicom, DicomParseError } from "@cosyte/dicom";

async function indexFile(path: string) {
  try {
    const ds = parseDicom(await readFile(path));
    return { ok: true as const, studyUid: ds.study.instanceUid, warnings: ds.warnings.length };
  } catch (err) {
    if (err instanceof DicomParseError) return { ok: false as const, code: err.code };
    throw err;
  }
}
```

Log `err.code`, `err.byteOffset` and `err.offsetFrame`. Do **not** log `err.snippet`: it is up to 16
raw source bytes and the library does not redact it. **`err.byteOffset` indexes the buffer you passed
in only when `err.offsetFrame` is `"input"`** - inside a Sequence Item it counts from that Item, so
cutting your own copy of the file at it returns a different element. See
[Keeping PHI out of logs](./troubleshooting#keeping-phi-out-of-logs).

---

## 2. Build routing keys

**The problem:** you are filing objects into an archive, reconciling them against an order, or
matching them to a patient record, and you need the identifiers that make each of those joins sound.

There are three different keys here and they are not interchangeable.

**Attributes read** (PS3.6 2026c): `(0020,000D)` Study Instance UID, `(0020,000E)` Series Instance
UID, `(0008,0018)` SOP Instance UID, `(0008,0050)` Accession Number, `(0010,0020)` Patient ID,
`(0010,0021)` Issuer of Patient ID, `(0010,1002)` Other Patient IDs Sequence.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const ds = parseDicom(buf);

// 1. Hierarchy keys. A UID is globally unique by construction, so these need no issuer.
const studyKey = ds.study.instanceUid;
const seriesKey = ds.series.instanceUid;
const instanceKey = ds.image.sopInstanceUid;

studyKey; // => "1.2.826.0.1.3680043.8.498.1.1"
seriesKey; // => "1.2.826.0.1.3680043.8.498.1.2"
instanceKey; // => "1.2.826.0.1.3680043.8.498.111"

// 2. Order key. The Accession Number is the HIS-to-PACS join and is NOT globally unique:
//    it is unique only within the system that issued it.
ds.study.accessionNumber; // => "ACC-0001"

// 3. Patient key. A Patient ID ALONE is ambiguous across systems. The issuer is a separate
//    attribute and the library surfaces it separately rather than folding it in for you.
const p = ds.patient;
const patientKey = `${p.issuerOfId ?? ""}|${p.id ?? ""}`;
patientKey; // => "SAMPLE-HOSP|MRN-42"

// Additional {id, issuer} pairs, when the sender wrote any, arrive as a list.
p.otherIds.length; // => 0
```

Three things worth being explicit about, because getting any of them wrong is a real-world outage:

- **`ds.patient.id` is a string the sending system chose.** It is not globally unique and this
  library does no patient matching. Pair it with `ds.patient.issuerOfId` and treat the pair as the
  key, and read `ds.patient.otherIds` for any further assigning authorities the object carried. The
  Issuer of Patient ID attribute is `(0010,0021)` in PS3.6 2026c; the module that requires the two to
  be read together is in PS3.3, which is not vendored here, so no clause is claimed for it.
- **`instanceKey` and `seriesKey` have no representation in HL7 v2.** Image-level and series-level
  identity live only in DICOM (see recipe 5).
- **Do not derive a routing key from a de-identified object and expect it to match the original.**
  `deidentify()` replaces UIDs by default. The mapping it used is on `report.uidMap`, whose **keys
  are the source UIDs** and are therefore not safe to log.

---

## 3. Read pixel-interpretation metadata safely

**The problem:** you (or a downstream renderer) will touch the pixels, and the interpretation
attributes decide what the stored numbers _mean_. The dangerous DICOM failure is the confident,
wrong image, so none of these views defaults a missing value.

**Attributes read** (PS3.6 2026c): `(0028,0002)` Samples per Pixel, `(0028,0004)` Photometric
Interpretation, `(0028,0010)` Rows, `(0028,0011)` Columns, `(0028,0030)` Pixel Spacing,
`(0018,1164)` Imager Pixel Spacing, `(0028,0100)` Bits Allocated, `(0028,0101)` Bits Stored,
`(0028,0102)` High Bit, `(0028,0103)` Pixel Representation, `(0028,1052)` Rescale Intercept,
`(0028,1053)` Rescale Slope.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const img = parseDicom(buf).image;

img.samplesPerPixel; // => 1
img.photometricInterpretation; // => "MONOCHROME2"
img.bitsAllocated; // => 16
img.bitsStored; // => 12
img.highBit; // => 11

// (0028,0103) Pixel Representation is 0 for unsigned and 1 for two's complement.
// `signed` is a boolean ONLY when the attribute was present; otherwise it is undefined.
img.pixelRepresentation; // => 1
img.signed; // => true

// Modality LUT: stored value -> real-world value is `stored * slope + intercept`.
// An ABSENT slope reads `undefined`, and you MUST NOT read that as 1.
img.rescaleSlope; // => 1
img.rescaleIntercept; // => -1024

// Pixel Spacing is [row spacing, column spacing] in mm, in the patient plane.
img.pixelSpacing; // => [0.5, 0.5]

// Imager Pixel Spacing is a DIFFERENT attribute at the detector plane and is absent here.
// The view does not fall back from one to the other.
img.imagerPixelSpacing; // => undefined
```

The two failure modes this shape exists to prevent:

- **A defaulted rescale.** `undefined` means the object did not carry the attribute. Substituting
  `1`/`0` turns stored values into confidently wrong Hounsfield units. Decide what to do about an
  absent Modality LUT in your own code, where the decision is visible.
- **A defaulted signedness.** Reading a two's-complement image as unsigned inverts the dark end of
  the range. `img.signed` is `undefined` rather than `false` when `(0028,0103)` was absent.

`(0028,0030)` and `(0018,1164)` are different measurements and this library never substitutes one
for the other. Which one a given IOD requires is a PS3.3 question, and PS3.3 is not vendored here, so
no clause is claimed; what is claimed is that both attributes are surfaced separately and neither is
invented.

For Enhanced multi-frame objects, `image.frame(i)` resolves each frame's functional-group macros
Per-Frame first and Shared second. It throws a `DicomValueError` (carrying only structural facts,
never a value) for an out-of-range frame, or when a required geometry macro is missing from both
groups.

```ts
if (img.isEnhancedMultiFrame) {
  const f = img.frame(0);
  f.planePosition?.imagePositionPatient; // this frame's [x, y, z]
  f.pixelMeasures?.pixelSpacing; // this frame's [row, col] mm
  f.pixelValueTransformation?.rescaleSlope; // this frame's slope, if the macro is present
}
```

> **Vendor note.** Philips writes private rescale attributes `(2005,1409/140A/140B)` that shadow the
> standard `(0028,1052/1053)`; using the standard attributes alone can yield non-quantitative values.
> This parser **preserves** the private attributes so you can prefer them. Reach them with
> `ds.get("20051409")`, optionally under `profiles.philips`.

---

## 4. De-identify before sharing

**The problem:** you need to strip identifying metadata before an object leaves your control, and you
need a record of what was done, without mutating the original.

`deidentify(ds)` applies the PS3.15 2026c Annex E **Basic Application Level Confidentiality Profile**
(§E.2), replacing, emptying or removing every attribute Table E.1-1 lists as identifying, and returns
a fresh `Dataset` plus a `DeidentifyReport`. It is a **pure function**: your input dataset is never
mutated.

Several report fields are **not** value-free and are named on the type: `uidMap`, whose keys are the
source UIDs the file carried, and `removedPrivateTags`, `unauditableSequences[].tag` and
`contextPath`, whose entries are four source bytes each, and
`unauditableSequences[].byteLength` / `undefinedVrElements[].byteLength`, each the declared Value
Length off an element header that may itself have been fabricated. `embeddedAttributes[].hidden` **left that
list**: an entry is now a tag this run acted on that PS3.15 Table E.1-1 gives a literal row, with
repeating-group mask hits excluded - which also means it can be empty on a real finding. **Read the
list on the type rather than a count quoted anywhere**, this one included: the number has been
corrected twice.

```ts runnable
import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const ds = parseDicom(buf);
const { dataset, report } = deidentify(ds);

// The original is untouched; the identifying fields are gone from the copy.
ds.patient.id; // => "MRN-42"
dataset.patient.id; // => undefined

// Patient's Name is emptied (Annex E action "Z"), not left in place.
dataset.get("00100010")?.value.kind; // => "empty"

// The Accession Number is emptied too: it identifies the order, and through it the patient.
dataset.study.accessionNumber; // => undefined

// UIDs are remapped to deterministic 2.25 replacements that stay consistent across files.
dataset.study.instanceUid?.startsWith("2.25."); // => true

// The report lists what was acted on. It is NOT value-free: see the fields
// named on DeidentifyReport before logging one whole.
report.attributes.length > 0; // => true
report.warnings.length; // => 0

// The de-identified copy serializes to bytes you can share.
Buffer.isBuffer(serializeDicom(dataset)); // => true
```

This is **metadata-level** de-identification. Pixel data is out of scope: when an object carries
burned-in annotation this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`
warning on the report rather than a false sense of safety. Pixel cleaning is deferred to
`@cosyte/dicom-pixel`. Opt into any of the nine metadata-affecting Annex E Options (e.g. `RetainUIDs`,
`RetainLongitudinalTemporal`, `CleanDescriptors`) via `deidentify(ds, { retain: [...] })`.

**Before you rely on this on real data, read [Known limitations](./limitations).** Several routes are
measured, disclosed and open, and the report reading clean is not by itself proof that nothing
survived.

The attribute-action table behind all of this is generated from **NEMA's PS3.15 2026c DocBook**, the
normative publication of the standard, rather than from a third-party mirror of it. That matters
because an attribute the table does not list is an attribute `deidentify()` keeps, silently: the
current edition's patient attributes, including the `(0010,00xx)` preferred-name and pronoun block,
the `(0010,004x)` gender-identity and sex-parameters attributes, and `EthnicGroupCodeSequence` /
`EthnicGroups`, are all removed because the table is the edition's, not a snapshot of it. Four rows
of Table E.1-1 name a family rather than a single tag (`(50xx,xxxx)` Curve Data, `(60xx,3000)` and
`(60xx,4000)` Overlay Data and Comments, and the odd-group private-attribute row). All four are
acted on: private attributes are removed through their own path, and the three repeating-group rows
are matched by mask across the sixteen even groups the standard bounds them to, removed, and
reported with the mask that matched. **That bound is stated across two editions, and citing only the
current one would be wrong**: PS3.5 2026c §7.6 gives the overlay range (`6000`-`601E`) and, in the
same clause, retires curve encoding and delegates the curve range to PS3.5-2004 by URL. Both
editions are vendored and SHA-pinned here, and the generator proves the delegation link rather than
assuming it.

```ts
const { report } = deidentify(parseDicom(buf));
report.attributes
  .filter((a) => a.repeatingGroup !== undefined)
  .forEach((a) => console.log(a.tag, a.keyword, a.repeatingGroup));
// 60004000 Overlay Comments 60xx4000
```

---

## 5. Bridge to FHIR `ImagingStudy` and HL7 v2

**The problem:** the imaging study has to join the rest of the record, and someone has asked you for
a FHIR resource or an HL7 v2 field mapping.

The crosswalk to work from is the FHIR
[`ImagingStudy` "Mappings for DICOM"](https://build.fhir.org/imagingstudy-mappings.html) tab, which
maps each `ImagingStudy` element to the DICOM attribute it comes from. **Say which FHIR you mean:**
that URL is `build.fhir.org`, the continuous build, not a balloted release, so pin the mappings page
for the FHIR version your integration targets (R4 / R4B / R5) rather than treating the build as
stable. Nothing in this package is versioned against FHIR; this library's job is to surface the DICOM
attributes correctly, and it does not build FHIR resources for you.

**Attributes read** (PS3.6 2026c): `(0020,000D)` Study Instance UID, `(0020,000E)` Series Instance
UID, `(0008,0018)` SOP Instance UID, `(0008,0016)` SOP Class UID, `(0008,0060)` Modality,
`(0008,0020)` Study Date, `(0008,0030)` Study Time, `(0010,0020)` Patient ID, `(0010,0021)` Issuer of
Patient ID, `(0008,0050)` Accession Number.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const ds = parseDicom(buf);

// --- FHIR ImagingStudy ---------------------------------------------------
// ImagingStudy.identifier carries the Study Instance UID as a `urn:oid:` value.
const identifier = `urn:oid:${ds.study.instanceUid ?? ""}`;
identifier; // => "urn:oid:1.2.826.0.1.3680043.8.498.1.1"

// ImagingStudy.series.uid and .series.modality come straight off the series view.
const series = { uid: ds.series.instanceUid, modality: ds.series.modality };
series.modality; // => "CT"

// ImagingStudy.series.instance.uid and .sopClass, per instance.
const instance = { uid: ds.image.sopInstanceUid };
instance.uid; // => "1.2.826.0.1.3680043.8.498.111"

// ImagingStudy.started is a FHIR dateTime, so Study Date and Study Time compose into one
// value. Both are structured here, so you build the string rather than concatenating raw
// bytes and hoping.
const d = ds.study.date;
const t = ds.study.time;
const started =
  d?.valid === true
    ? `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` +
      (t?.valid === true
        ? `T${String(t.hours).padStart(2, "0")}:${String(t.minutes ?? 0).padStart(2, "0")}:${String(t.seconds ?? 0).padStart(2, "0")}`
        : "")
    : undefined;
started; // => "1900-01-01T09:00:00"

// ImagingStudy.subject resolves to a Patient. The DICOM side of that join is the Patient ID
// AND its issuer, never the id alone.
const subject = { id: ds.patient.id, assigner: ds.patient.issuerOfId };
subject.assigner; // => "SAMPLE-HOSP"

// --- HL7 v2 ---------------------------------------------------------------
// The Accession Number is the HIS-to-PACS workhorse and is conventionally carried in
// OBR-18 (Placer Field 1) or OBR-19 in a radiology ORM/ORU. Which one your interface uses
// is a site agreement, not a DICOM rule.
const accession = ds.study.accessionNumber;
accession; // => "ACC-0001"

// The Study Instance UID has no standard HL7 v2 field. Sites that carry it use a Z-segment
// or an agreed OBR/ZDS slot; there is nothing to read out of the standard here.
```

Three cautions that matter more than the field list:

- **`ImagingStudy.started` needs a time zone and DICOM may not carry one.** `(0008,0201)` Timezone
  Offset From UTC exists but is frequently absent, and this library never invents one. A FHIR
  `dateTime` without an offset is a local time; decide the offset at your boundary, explicitly.
- **Series and SOP Instance UIDs are not represented in HL7 v2.** Image-level identity lives only in
  DICOM. If someone asks you to "send the image ID in the ORU", the honest answer is that there is no
  standard field for it.
- **A `urn:oid:` identifier is only correct for a genuine OID.** The Study Instance UID is a UID by
  construction; do not wrap an Accession Number the same way.

---

## 6. Re-serialize a parsed object to spec-clean bytes

**The problem:** you parsed an object (perhaps a quirky one) and need Part 10 bytes back out for
storage or forwarding, with a guarantee that nothing was silently lost.

`serializeDicom(ds)` writes a `Dataset` back to a Part 10 `Buffer`: preamble and `DICM`, File Meta
always Explicit VR LE with a recomputed group length, and the dataset body **in the source transfer
syntax, no transcode**. It obeys the conservative half of Postel's Law: every Value Field padded to
an even length (PS3.5 2026c §7.1.1 defines the Value Field as "An even number of bytes containing the
Value(s) of the Data Element"), correct headers, byte-for-byte sequence and encapsulated-pixel-data
passthrough. Serializing an already-serialized object is a fixed point.

```ts runnable
import { parseDicom, serializeDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const ds = parseDicom(buf);
const out = serializeDicom(ds);

Buffer.isBuffer(out); // => true

// Re-parsing the bytes yields the same data...
parseDicom(out).patient.name?.alphabetic?.familyName; // => "Doe"

// ...and re-serializing is byte-identical (a fixed point).
serializeDicom(parseDicom(out)).equals(out); // => true
```

Only the typed `FileMeta` fields round-trip through the model; the rest of File Meta is recomputed
spec-clean on emit. Non-modeled `(0002,xxxx)` elements the source carried are preserved verbatim and
re-emitted in ascending tag order.

---

## 7. Read raw pixel data without decoding it

**The problem:** you need the pixel bytes (to hand to an imaging pipeline, to hash, to forward) but
`@cosyte/dicom` deliberately does not decode them.

Pixel Data `(7FE0,0010)` decodes to a `{ kind: "binary", bytes }` value: the raw `Buffer`, exactly
as stored. PS3.5 2026c §8.2 is the clause that governs how those bytes are encoded, native or
encapsulated. You read the geometry from the [`image` view](./spec-notes-safety) and the bytes from
the element; interpreting them is your pipeline's job.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// Synthetic 2x2, 16-bit object with a tiny raw Pixel Data element.
const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xACgAEABVUwIAAgAoABEAVVMCAAIAKAAAAVVTAgAQAOB/EABPQgAACAAAAAEAAgADAAQA",
  "base64",
);

const ds = parseDicom(buf);

ds.image.rows; // => 2
ds.image.columns; // => 2

const pixels = ds.get("7FE00010")?.value; // Pixel Data
pixels?.kind; // => "binary"
const byteLength = pixels?.kind === "binary" ? pixels.bytes.length : undefined;
byteLength; // => 8

ds.warnings.length; // => 0
```

The bytes are never windowed, rescaled, or color-transformed here. That is
[out of scope](./limitations). For encapsulated (compressed) transfer syntaxes the value exposes the
raw fragments, still undecoded, and note that this release refuses a pixel-compressed transfer syntax
outright rather than reading it structurally: see [Known limitations](./limitations).

---

## 8. Triage warnings: the lenient, never-throw contract

**The problem:** you want to log or triage every tolerated deviation without your pipeline throwing on
a vendor quirk.

Every recoverable deviation collects on `ds.warnings` with a stable code and a byte offset; only the
four fatal conditions throw. Each message is looked up in a frozen registry keyed by the code, with
only structural substitutions (a tag, a VR, a number).

**What a message may contain is a mechanism, not a verdict**, and the verdict form of this paragraph
was corrected twice, so it is gone rather than tried a third time. `{tag}` renders only a tag PS3.6's
element registry carries a **literal row** for and `<withheld>` otherwise; `{vr}` renders only one of
the 34 VRs PS3.5 defines; and a raw number a header carries is bound out of the factory signature
where it is bound at all, so `DICOM_ODD_LENGTH_VALUE_PADDED` no longer prints the odd length and
`DICOM_NONZERO_RESERVED_BYTES` no longer prints its two reserved bytes. **Two `deidentify()` codes
still print a length that is the header's own, `PRE-EXISTING` and disclosed rather than closed** -
see the troubleshooting page. The cost is that a message about a private, Group Length or
repeating-group element no longer names its tag. A thrown `DicomParseError`'s `message` comes from
its own frozen registry, whose factories have no tag slot at all, but the error still carries a
16-byte hex `snippet` of the source. All of it is measured and covered in
[Keeping PHI out of logs](./troubleshooting#keeping-phi-out-of-logs).

```ts runnable
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

// Synthetic object with the preamble omitted: a tolerated quirk.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);

const ds = parseDicom(buf);

// The object parsed; the deviation is recorded, not hidden.
ds.series.modality; // => "CT"
ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE); // => true

// Every warning carries a stable code and a byte offset, and a registry message.
ds.warnings.every((w) => typeof w.code === "string"); // => true
```

**Escalate when you want strictness.** A [source profile](./spec-notes-profiles) can promote chosen
warning codes to a thrown `DicomParseError` (a spec-conformance gate for a trusted sender) or
suppress benign, high-volume codes for a known-quirky source. Note that `{ strict: true }` turns
every Tier-2 warning into a `DicomParseError`, which carries the raw `snippet` the warning does not,
so a PHI review of the lenient path does not transfer to the strict one.

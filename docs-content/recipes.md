---
id: recipes
title: Use recipes for indexing, routing and sharing studies
sidebar_label: Recipes
sidebar_position: 4
description: Steps for the jobs a metadata parser is asked to do, from indexing a folder of studies to de-identifying an object before sharing it.
---

# Recipes

Each recipe here is one job: the steps, a sample that runs, and what you get back. Every sample
object is synthetic (an invented patient, fake UIDs), encoded as base64 so a recipe needs no file of
yours on disk; never paste a real DICOM object into a doc or a test. The date in every sample object
is `19000101`, because our PHI scan rejects a plausible real date wherever it finds one.

The recipes name the PS3 clause for the attributes they read; [Compatibility](./compatibility.md#citations-on-these-pages)
says which clauses we may cite and how we check them. The [cookbook](./cookbook.md) has the jobs
that sit beside these: triaging warnings, reading a veterinary patient, and checking the dates on a
de-identified object. Read [Known limitations](./limitations.md) before you trust any of this on
real data.

## Index a folder of studies

You have a directory of objects and need a searchable index: who, which study, which series, which
instance, what kind of image.

**Attributes read** (PS3.6 2026c, Registry of DICOM Data Elements): `(0010,0020)` Patient ID,
`(0010,0021)` Issuer of Patient ID, `(0008,0050)` Accession Number, `(0020,000D)` Study Instance UID,
`(0020,000E)` Series Instance UID, `(0008,0018)` SOP Instance UID, `(0008,0016)` SOP Class UID,
`(0008,0060)` Modality, `(0008,0020)` Study Date, `(0028,0010)` Rows, `(0028,0011)` Columns.

1. Parse each object and read the fields off the four views (`patient`, `study`, `series`,
   `image`). An absent attribute reads `undefined`, never a substituted default.

   ```ts runnable
   import { parseDicom, Dictionary } from "@cosyte/dicom";

   const buf = Buffer.from(
     "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
     "base64",
   );

   const ds = parseDicom(buf);

   const row = {
     patientId: ds.patient.id, // (0010,0020)
     issuer: ds.patient.issuerOfId, // (0010,0021)
     accession: ds.study.accessionNumber, // (0008,0050)
     studyUid: ds.study.instanceUid, // (0020,000D)
     seriesUid: ds.series.instanceUid, // (0020,000E)
     sopInstanceUid: ds.image.sopInstanceUid, // (0008,0018)
     modality: ds.series.modality, // (0008,0060)
     rows: ds.image.rows, // (0028,0010)
     columns: ds.image.columns, // (0028,0011)
   };

   row.patientId; // => "MRN-42" /* synthetic */
   row.accession; // => "ACC-0001" /* synthetic */
   row.modality; // => "CT"
   row.rows; // => 512

   // A date is structured rather than a string, and `valid` is answered rather than assumed.
   ds.study.date?.year; // => 1900
   ds.study.date?.valid; // => true

   // SOP Class UID says what kind of object this is: resolve it through the dictionary.
   const sopClass = ds.get("00080016")?.value;
   const sopClassUid = sopClass?.kind === "strings" ? sopClass.values[0] : undefined;
   Dictionary.uid(sopClassUid ?? "")?.name; // => "CT Image Storage"

   // No deviation was tolerated. That is a statement about this reader, not a conformance verdict:
   // PS3.10 governs the file format and is not vendored here.
   ds.warnings.length; // => 0
   ```

2. Wrap the parse of each file in a `try`/`catch`. A quirky object is tolerated rather than
   rejected, and a compressed or JPIP Referenced object indexes like any other (the syntaxes we
   read are listed in [Compatibility](./compatibility.md#supported-transfer-syntaxes)). But the
   fatal conditions throw, and a real archive meets each of them: `UNSUPPORTED_TRANSFER_SYNTAX`
   for a syntax we refuse, `INVALID_FILE_META` for a truncated or partly copied file,
   `NOT_DICOM_PART_10` for a file that is not DICOM, and `EMPTY_INPUT` for a zero-byte one. All
   throw `DicomParseError`, so catch that per file and skip.

   ```ts runnable
   import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import { join } from "node:path";
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

   // A folder with one synthetic object and one file that is not DICOM.
   const dir = await mkdtemp(join(tmpdir(), "dicom-index-"));
   await writeFile(join(dir, "ct.dcm"), Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"));
   await writeFile(join(dir, "notes.txt"), "this is not a DICOM file, just some ASCII text here");

   const ct = await indexFile(join(dir, "ct.dcm"));
   const notes = await indexFile(join(dir, "notes.txt"));
   await rm(dir, { recursive: true });

   ct.ok; // => true
   notes.ok; // => false
   notes.ok === false && notes.code; // => "NOT_DICOM_PART_10"
   ```

3. Log `err.code`, `err.byteOffset` and `err.offsetFrame`. Do not log `err.snippet`: it is up to 16
   raw source bytes and we do not redact it. `err.byteOffset` indexes the buffer you passed in only
   when `err.offsetFrame` is `"input"`. [Keeping PHI out of logs](./troubleshooting.md#keeping-phi-out-of-logs)
   has the rest.

## Read only the header of a large file

`parseDicom` takes the whole file as one buffer, so indexing a large multi-frame study that way
holds the whole study in memory to read a few hundred bytes of patient and study tags.
`readDicomHeader` reads from a path, a file handle or a stream only as far as the Pixel Data.

1. Pass a `DicomByteSource`: a path, a `file:` URL, a `DicomFileHandle` (Node's `FileHandle` is
   one) or any async iterable of bytes, such as a stream. Give `stopBeforeTag` to stop earlier.

   ```ts runnable
   import { createReadStream } from "node:fs";
   import { mkdtemp, rm, writeFile } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import { join } from "node:path";
   import { readDicomHeader } from "@cosyte/dicom";

   const dir = await mkdtemp(join(tmpdir(), "dicom-header-"));
   const path = join(dir, "study.dcm");
   await writeFile(path, Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"));

   // From a path: opened, read up to the Pixel Data, closed.
   const ds = await readDicomHeader(path);
   ds.patient.id; // => "MRN-42" /* synthetic */
   ds.study.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1" /* synthetic */

   // From a stream, stopping before the first tag of group 0020.
   const patientOnly = await readDicomHeader(createReadStream(path), {
     stopBeforeTag: "00200000",
   });
   patientOnly.patient.id; // => "MRN-42" /* synthetic */
   patientOnly.has("0020000D"); // => false
   patientOnly.warnings.at(-1)?.code; // => "DICOM_PARSE_STOPPED_BEFORE_TAG"

   await rm(dir, { recursive: true });
   ```

   It stops before the first top-level element whose tag is at or after `stopBeforeTag`, or before
   Float Pixel Data `(7FE0,0008)` when that is not given, which is also before Double Float Pixel
   Data and Pixel Data. The Dataset is the one `parseDicom` returns on the whole file with the same
   `stopBeforeTag`: the same elements, byte for byte, the same warnings, and a last warning,
   `DICOM_PARSE_STOPPED_BEFORE_TAG`, at the element it stopped before. To find the stop it reads
   64 KiB of the source first, then twice as much each time the header turns out to be longer, and
   parses that prefix until one parse reaches the stop. A path is opened and closed for you. A handle
   is read from byte 0 and left open; a stream is read from where it is and ended early once the
   stop is found.

2. For a file you do not trust, set `maxBytes`, the one field `ReadDicomHeaderOptions` adds to
   `ParseOptions`. It bounds what the read takes from the source: when the stop is not within that
   many bytes and the source goes on, the read ends with a `RangeError` instead of reading on. There
   is no default, since any number we picked would refuse some legitimate file (a large Deflated
   study, a long structured report). Without it, three kinds of file are read to the end, and so
   held in memory whole: one with no top-level element at or after the stop tag; a Deflated
   Explicit VR Little Endian one, whose Data Set, Pixel Data included, is one deflate stream; and
   one `parseDicom` would refuse, or whose header `{ strict: true }` or a profile escalates a
   warning in, so the error thrown is the one the whole file gives.

   **`maxBytes` bounds what the read takes, not what a stream already holds.** A stream's chunks
   are held as the stream makes them, so a stream that delivers the whole file as one chunk has put
   all of it in memory before the read sees it, whatever `maxBytes` says. A chunk that crosses the
   limit is cut there, but the stream made the whole chunk. To bound memory for an untrusted
   upload, pass a path or a file handle, which the read pulls from in its own sizes, or a stream
   whose chunk size you control (a Node `createReadStream` delivers 64 KiB chunks by default).

   ```ts runnable
   import { mkdtemp, rm, writeFile } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import { join } from "node:path";
   import { readDicomHeader } from "@cosyte/dicom";

   const dir = await mkdtemp(join(tmpdir(), "dicom-upload-"));
   const path = join(dir, "upload.dcm");
   // This synthetic object has no Pixel Data, so the stop tag is never found.
   await writeFile(path, Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"));

   let refused = false;
   try {
     await readDicomHeader(path, { maxBytes: 256 });
   } catch (err) {
     refused = err instanceof RangeError;
   }
   await rm(dir, { recursive: true });

   refused; // => true
   ```

3. With the bytes already in memory, pass the same `stopBeforeTag` to `parseDicom`. Nothing past the
   stop is read, so a file cut short inside its Pixel Data still parses.

   ```ts runnable
   import { parseDicom } from "@cosyte/dicom";

   const ds = parseDicom(Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"), { stopBeforeTag: "00200000" });

   ds.patient.id; // => "MRN-42" /* synthetic */
   ds.has("0020000D"); // => false
   ds.warnings.at(-1)?.code; // => "DICOM_PARSE_STOPPED_BEFORE_TAG"
   ```

## Build routing keys

You are filing objects into an archive, reconciling them against an order, or matching them to a
patient record. There are three different keys, and they are not interchangeable.

**Attributes read** (PS3.6 2026c): `(0020,000D)` Study Instance UID, `(0020,000E)` Series Instance
UID, `(0008,0018)` SOP Instance UID, `(0008,0050)` Accession Number, `(0010,0020)` Patient ID,
`(0010,0021)` Issuer of Patient ID, `(0010,1002)` Other Patient IDs Sequence.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(
  Buffer.from(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
    "base64",
  ),
);

// 1. Hierarchy keys. A UID is globally unique by construction, so these need no issuer.
ds.study.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1" /* synthetic */
ds.series.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.2" /* synthetic */
ds.image.sopInstanceUid; // => "1.2.826.0.1.3680043.8.498.111" /* synthetic */

// 2. Order key. The Accession Number is the HIS-to-PACS join, unique only within the system
//    that issued it.
ds.study.accessionNumber; // => "ACC-0001" /* synthetic */

// 3. Patient key. A Patient ID alone is ambiguous across systems: pair it with its issuer.
const p = ds.patient;
const patientKey = `${p.issuerOfId ?? ""}|${p.id ?? ""}`;
patientKey; // => "SAMPLE-HOSP|MRN-42" /* synthetic */

// Further {id, issuer} pairs, when the sender wrote any, arrive as a list.
p.otherIds.length; // => 0
```

- **`ds.patient.id` is a string the sending system chose.** It is not globally unique and we do no
  patient matching. Treat the pair with `ds.patient.issuerOfId` as the key, and read
  `ds.patient.otherIds` for further assigning authorities. The module that requires the two to be
  read together is in PS3.3, which is not vendored here, so no clause is claimed for it.
- **The series and instance keys have no representation in HL7 v2.** Image-level and series-level
  identity live only in DICOM (see [Bridge to FHIR and HL7 v2](#bridge-to-fhir-imagingstudy-and-hl7-v2)).
- **A key from a de-identified object does not match the original.** `deidentify()` replaces UIDs
  by default. The mapping it used is on `report.uidMap`, whose keys are the source UIDs and are
  therefore not safe to log.

## Read pixel-interpretation metadata safely

You, or a renderer downstream, will touch the pixels, and the interpretation attributes decide what
the stored numbers mean. The dangerous DICOM failure is the confident, wrong image, so none of these
views defaults a missing value.

**Attributes read** (PS3.6 2026c): `(0028,0002)` Samples per Pixel, `(0028,0004)` Photometric
Interpretation, `(0028,0010)` Rows, `(0028,0011)` Columns, `(0028,0030)` Pixel Spacing,
`(0018,1164)` Imager Pixel Spacing, `(0028,0100)` Bits Allocated, `(0028,0101)` Bits Stored,
`(0028,0102)` High Bit, `(0028,0103)` Pixel Representation, `(0028,1052)` Rescale Intercept,
`(0028,1053)` Rescale Slope.

1. Read the `image` view.

   ```ts runnable
   import { parseDicom } from "@cosyte/dicom";

   const img = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
       "base64",
     ),
   ).image;

   img.samplesPerPixel; // => 1
   img.photometricInterpretation; // => "MONOCHROME2"
   img.bitsAllocated; // => 16
   img.bitsStored; // => 12
   img.highBit; // => 11

   // (0028,0103) is 0 for unsigned and 1 for two's complement. `signed` is a boolean only when
   // the attribute was present; otherwise it is undefined.
   img.pixelRepresentation; // => 1
   img.signed; // => true

   // Modality LUT: real-world value is `stored * slope + intercept`. An absent slope reads
   // undefined, and you must not read that as 1.
   img.rescaleSlope; // => 1
   img.rescaleIntercept; // => -1024

   // Pixel Spacing is [row spacing, column spacing] in mm, in the patient plane.
   img.pixelSpacing; // => [0.5, 0.5]

   // Imager Pixel Spacing is a different attribute, at the detector plane, and absent here.
   // The view does not fall back from one to the other.
   img.imagerPixelSpacing; // => undefined
   ```

2. Decide in your own code what to do when a value is `undefined`. Substituting `1` and `0` for an
   absent rescale turns stored values into confidently wrong Hounsfield units, and reading a two's
   complement image as unsigned inverts the dark end of the range. `(0028,0030)` and `(0018,1164)`
   are different measurements, and we never substitute one for the other.

3. For an Enhanced multi-frame object, read each frame's geometry with `image.frame(i)`, which
   resolves the functional-group macros Per-Frame first and Shared second. It throws a
   `DicomValueError`, carrying only structural facts, for an out-of-range frame or a required
   geometry macro missing from both groups.

   ```ts runnable
   import { parseDicom } from "@cosyte/dicom";

   const img = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
       "base64",
     ),
   ).image;

   // This synthetic CT image is not an Enhanced object, so there is no frame to read.
   img.isEnhancedMultiFrame; // => false
   if (img.isEnhancedMultiFrame) {
     const f = img.frame(0);
     f.planePosition?.imagePositionPatient; // this frame's [x, y, z]
     f.pixelMeasures?.pixelSpacing; // this frame's [row, col] in mm
     f.pixelValueTransformation?.rescaleSlope; // this frame's slope, when the macro is present
   }
   ```

> **Vendor note.** Philips writes private rescale attributes `(2005,1409/140A/140B)` that shadow the
> standard `(0028,1052/1053)`; using the standard attributes alone can yield non-quantitative values.
> The parser preserves the private attributes so you can prefer them. Reach them with
> `ds.get("20051409")`, optionally under `profiles.philips`.

## Read raw pixel data without decoding it

You need the pixel bytes, to hand to an imaging pipeline, to hash or to forward, and
`@cosyte/dicom` does not decode them.

1. For native Pixel Data `(7FE0,0010)`, read the element: its value is `{ kind: "binary", bytes }`,
   the raw `Buffer` exactly as stored. PS3.5 2026c §8.2 governs how those bytes are encoded. Read
   the geometry from the [`image` view](./spec-notes-safety.md).

   ```ts runnable
   import { parseDicom } from "@cosyte/dicom";

   // A synthetic 2x2, 16-bit object with a tiny native Pixel Data element.
   const ds = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xACgAEABVUwIAAgAoABEAVVMCAAIAKAAAAVVTAgAQAOB/EABPQgAACAAAAAEAAgADAAQA",
       "base64",
     ),
   );

   ds.image.rows; // => 2
   ds.image.columns; // => 2

   const pixels = ds.get("7FE00010")?.value;
   pixels?.kind; // => "binary"
   pixels?.kind === "binary" ? pixels.bytes.length : undefined; // => 8
   ```

2. For an encapsulated (compressed) object, call `readPixelDataFragments(ds)`. It returns a
   `PixelDataFragments` holding the Basic Offset Table and every fragment as raw bytes, in file order, with no Item header in any of them,
   and `undefined` when Pixel Data is absent or native. Hand the bytes to a codec of your choice.

   ```ts runnable
   import { parseDicom, readPixelDataFragments, WARNING_CODES } from "@cosyte/dicom";

   // A synthetic 2x2, 8-bit object under JPEG Baseline (Process 1), with an empty Basic Offset
   // Table and two fragments of fill bytes. The fragments are not a JPEG codestream, and nothing
   // here needs them to be: they are never decoded.
   const ds = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAeAAAAAgAQAFVJFgAxLjIuODQwLjEwMDA4LjEuMi40LjUwKAAQAFVTAgACACgAEQBVUwIAAgAoAAABVVMCAAgA4H8QAE9CAAD//////v8A4AAAAAD+/wDgCAAAAAECAwQFBgcI/v8A4AQAAAAJCgsM/v/d4AAAAAA=",
       "base64",
     ),
   );
   ds.fileMeta?.transferSyntaxUID; // => "1.2.840.10008.1.2.4.50"

   const pixels = readPixelDataFragments(ds);
   pixels?.basicOffsetTable?.length; // => 0
   pixels?.fragments.length; // => 2
   pixels?.fragments[0]?.toString("hex"); // => "0102030405060708"

   // A stream that ended before its Sequence Delimitation Item would say so here.
   ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED); // => false
   ```

   The buffers are views over the parsed element unless you parse with `{ copyValues: true }`.

What this does not do: no pixel is decompressed, no frame is assembled from fragments, and neither
the Basic Offset Table nor an Extended Offset Table `(7FE0,0001)` is interpreted. `serializeDicom` writes a compressed object back under its own UID,
fragments byte for byte, and refuses with `INVALID_ENCAPSULATED_PIXEL_DATA` a stream PS3.5 2026c
section A.4 does not allow rather than repairing it. A JPIP Referenced object carries a Pixel Data
Provider URL instead of fragments; we return it as written and never fetch it. The full list of
syntaxes and what each supports is in [Compatibility](./compatibility.md#supported-transfer-syntaxes),
and the limits are in [Known limitations](./limitations.md).

## De-identify before sharing

You need to strip identifying metadata before an object leaves your control, with a record of what
was done, and without changing the original.

1. Call `deidentify(ds)`. It applies the PS3.15 2026d Annex E Basic Application Level
   Confidentiality Profile (§E.2), replacing, emptying or removing every attribute Table E.1-1 lists
   as identifying, and returns a fresh `Dataset` and a `DeidentifyReport`. Your input is never
   changed.

   ```ts runnable
   import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";

   const ds = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
       "base64",
     ),
   );
   const { dataset, report } = deidentify(ds);

   // The original is untouched; the identifying fields are gone from the copy.
   ds.patient.id; // => "MRN-42" /* synthetic */
   dataset.patient.id; // => undefined

   // Patient's Name is emptied (Annex E action "Z"), and the Accession Number with it.
   dataset.get("00100010")?.value.kind; // => "empty"
   dataset.study.accessionNumber; // => undefined

   // UIDs are remapped to deterministic 2.25 replacements that stay consistent across files.
   dataset.study.instanceUid?.startsWith("2.25."); // => true

   // The object says what this run did to its dates: REMOVED, since no Retain Longitudinal
   // Temporal Information Option was applied.
   dataset.get("00280303")?.value; // => { kind: "strings", values: ["REMOVED"] }

   // The report lists what was acted on. It is not value-free: read the fields named on
   // DeidentifyReport before logging one whole.
   report.attributes.length > 0; // => true
   report.warnings.length; // => 0

   // The de-identified copy serializes to bytes you can share.
   Buffer.isBuffer(serializeDicom(dataset)); // => true
   ```

2. Opt into the metadata Options of Annex E to keep a class of attribute the Basic Profile would
   strip. `DEIDENTIFY_OPTIONS` lists them. The two PS3.15 §E.3.6 temporal Options are alternatives,
   so take at most one of them.

   ```ts runnable
   import { parseDicom, deidentify } from "@cosyte/dicom";

   const ds = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
       "base64",
     ),
   );

   // Keep the original UIDs and dates; clean, rather than drop, free-text descriptions.
   const { dataset } = deidentify(ds, {
     retain: ["RetainUIDs", "RetainLongitudinalTemporal", "CleanDescriptors"],
   });

   dataset.study.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1" /* synthetic */
   dataset.study.date?.raw; // => "19000101" /* synthetic */
   dataset.get("00280303")?.value; // => { kind: "strings", values: ["UNMODIFIED"] }
   ```

3. Read the report's warnings before you share. `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` says the
   pixels may carry text this layer cannot remove; pixel cleaning is out of scope here.

4. Check what the run removed, beyond the attributes you expected. The header stops naming the
   sending site, the current edition's patient attributes go, and overlay comments go in every
   overlay group.

   ```ts runnable
   import { parseDicom, deidentify } from "@cosyte/dicom";

   // The synthetic CT object above, with a Source AE Title and the Media Storage UIDs in its File
   // Meta group, a Name to Use, a Gender Identity Comment and an Overlay Comments attribute. Every
   // value is invented.
   const ds = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAB0AAAAAgACAFVJGgAxLjIuODQwLjEwMDA4LjUuMS40LjEuMS4yAAIAAwBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xMTEAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAIAFgBBRQgAU1lOVEhfQUUIABYAVUkaADEuMi44NDAuMTAwMDguNS4xLjQuMS4xLjIACAAYAFVJHgAxLjIuODI2LjAuMS4zNjgwMDQzLjguNDk4LjExMQAIACAAREEIADE5MDAwMTAxCAAwAFRNBgAwOTAwMDAIAFAAU0gIAEFDQy0wMDAxCABgAENTAgBDVBAAEABQTggARG9lXkphbmUQABIATFQWAFNZTlRIRVRJQyBOQU1FIFRPIFVTRSAQACAATE8GAE1STi00MhAAIQBMTwwAU0FNUExFLUhPU1AgEABFAFVUAAASAAAAU1lOVEhFVElDIENPTU1FTlQgIAANAFVJHgAxLjIuODI2LjAuMS4zNjgwMDQzLjguNDk4LjEuMQAgAA4AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4yACAAEQBJUwIAMiAoAAIAVVMCAAEAKAAEAENTDABNT05PQ0hST01FMiAoABAAVVMCAAACKAARAFVTAgAAAigAMABEUwgAMC41XDAuNSAoAAABVVMCABAAKAABAVVTAgAMACgAAgFVUwIACwAoAAMBVVMCAAEAKABSEERTBgAtMTAyNCAoAFMQRFMCADEgAGAAQExUFgBTWU5USEVUSUMgT1ZFUkxBWSBOT1RF",
       "base64",
     ),
   );
   ds.fileMeta?.sourceApplicationEntityTitle; // => "SYNTH_AE"

   const { dataset, report } = deidentify(ds);

   // The File Meta group is replaced: the sender's AE Title is gone, the implementation identity
   // is ours, and the Media Storage SOP Instance UID is remapped like the one in the Data Set.
   dataset.fileMeta?.sourceApplicationEntityTitle; // => undefined
   dataset.fileMeta?.implementationVersionName; // => "COSYTE_DICOM"
   dataset.fileMeta?.mediaStorageSOPInstanceUID === dataset.image.sopInstanceUid; // => true
   dataset.fileMeta?.mediaStorageSOPInstanceUID?.startsWith("2.25."); // => true
   report.fileMetaElementsDroppedCount; // => 0
   report.group0004RemovalCount; // => 0

   // Name to Use and Gender Identity Comment are rows of the current edition's table: removed.
   dataset.has("00100012"); // => false
   dataset.has("00100045"); // => false

   // Overlay Comments is matched by the repeating-group mask, and the report names the mask.
   dataset.has("60004000"); // => false
   const masked = report.attributes.filter((a) => a.repeatingGroup !== undefined);
   masked.map((a) => `${a.tag} ${a.repeatingGroup ?? ""}`); // => ["60004000 60xx4000"]
   ```

   - **The File Meta group is replaced, not carried through.** PS3.15 2026c §E.1.1 requires it
     replaced with a description of the de-identifying application. `(0002,0016)` Source
     Application Entity Title is gone; `(0002,0012)` Implementation Class UID and `(0002,0013)`
     Implementation Version Name name `@cosyte/dicom` and hold none of the source's values; and
     every non-modeled `(0002,xxxx)` element is dropped: Sending and Receiving AE Titles, Private
     Information and anything a vendor invented. `report.fileMetaElementsDropped` names what went
     (capped) and `report.fileMetaElementsDroppedCount` counts it, complete at any input size. What
     survives identifies the object, not the sender: File Meta Information Version, Media Storage
     SOP Class UID, Transfer Syntax UID, and Media Storage SOP Instance UID, remapped unless you
     pass `RetainUIDs`. This is why de-identified output does not round-trip its File Meta group
     byte for byte. The 128-byte preamble is written as zeros on every path, de-identified or not.
   - **Group `0004` is removed at every depth**, as §E.1.1 requires for any file other than a
     DICOMDIR. `report.group0004Removals` names them, capped and with a context path for nested
     ones, and `report.group0004RemovalCount` is the complete total. A DICOMDIR keeps its group
     `0004`, and the run raises `DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED` for the File-set
     clauses it does not discharge; [De-identification](./deidentification.md#scope-limits-on-this-pages-subject)
     has the detail.
   - **The current edition's patient attributes are removed.** The action table is generated from
     NEMA's PS3.15 2026d DocBook, the normative publication, and where a third-party mirror of the
     table disagrees, the DocBook wins. So the `(0010,0011)` to `(0010,0014)` preferred-name and
     pronoun block, the `(0010,0041)` to `(0010,0047)` gender-identity and sex-parameters
     attributes, and `(0010,2161)` Ethnic Group Code Sequence and `(0010,2162)` Ethnic Groups are
     all removed by default. `RetainPatientCharacteristics` keeps the sex-parameters and
     ethnic-group ones, and cleans the sex-parameters comment; no Option keeps the name-to-use,
     pronoun or gender-identity ones.
   - **Curve and overlay rows are matched by mask, within the groups the standard allows.**
     `(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay Comments are
     matched across the sixteen even groups PS3.5 bounds each mask to (`6000` to `601E`, `5000` to
     `501E`), removed, and reported with the mask that matched. The overlay range is in
     PS3.5 2026c §7.6, and the same clause retires curve encoding and delegates the curve range to
     PS3.5-2004. Both editions are vendored and pinned by SHA-256, and the generator checks the
     delegation and that the two agree where they overlap, rather than assuming either.

**The de-identified object says what this run did to its dates.** `deidentify()` writes `(0028,0303)`
Longitudinal Temporal Information Modified in one of three states: **`REMOVED`** when no Retain
Longitudinal Temporal Information Option was active, which is the default, **`UNMODIFIED`** when
`RetainLongitudinalTemporal` was, and **`MODIFIED`** when `RetainLongitudinalTemporalModifiedDates`
was. PS3.15 2026c §E.2 requires the first and §E.3.6 the other two. The two Options are mutually
exclusive, and a call naming both is rejected with a `DeidentifyError`. This library performs no
date transformation: a `RetainLongitudinalTemporalModifiedDates` run carries
`DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on `report.warnings`, and shifting the dates is yours. The
[cookbook](./cookbook.md#check-the-dates-on-a-de-identified-object) shows a recipient reading the
three states.

**It is REPLACED, not added to.** The attribute is `VM 1`, so a `(0028,0303)` the source already
carried is discarded rather than joined: the opposite of what `(0012,0063)` does with a prior method
text, and the asymmetry is the standard's.

The run also records its Profile and Options as codes in `(0012,0064)` De-identification Method Code
Sequence, replaces the File Meta group, and removes group `0004`. [De-identification](./deidentification.md)
explains each of these, the options, the report, and what is not safe to log, and
[Known limitations](./limitations.md) lists the residuals that a clean report does not close.

## Bridge to FHIR ImagingStudy and HL7 v2

The imaging study has to join the rest of the record, and someone has asked you for a FHIR resource
or an HL7 v2 field mapping. Work from the FHIR
[`ImagingStudy` "Mappings for DICOM"](https://build.fhir.org/imagingstudy-mappings.html) tab, and
pin the mappings page for the FHIR version you target (R4, R4B or R5): `build.fhir.org` is the
continuous build, not a balloted release. We surface the DICOM attributes; we do not build FHIR
resources.

**Attributes read** (PS3.6 2026c): `(0020,000D)` Study Instance UID, `(0020,000E)` Series Instance
UID, `(0008,0018)` SOP Instance UID, `(0008,0060)` Modality, `(0008,0020)` Study Date,
`(0008,0030)` Study Time, `(0010,0020)` Patient ID, `(0010,0021)` Issuer of Patient ID,
`(0008,0050)` Accession Number.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(
  Buffer.from(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
    "base64",
  ),
);

// FHIR ImagingStudy.identifier carries the Study Instance UID as a `urn:oid:` value.
const identifier = `urn:oid:${ds.study.instanceUid ?? ""}`;
identifier; // => "urn:oid:1.2.826.0.1.3680043.8.498.1.1" /* synthetic */

// ImagingStudy.series.uid and .series.modality come off the series view.
const series = { uid: ds.series.instanceUid, modality: ds.series.modality };
series.modality; // => "CT"

// ImagingStudy.series.instance.uid, per instance.
ds.image.sopInstanceUid; // => "1.2.826.0.1.3680043.8.498.111" /* synthetic */

// ImagingStudy.started is a FHIR dateTime: compose Study Date and Study Time from their parts.
const d = ds.study.date;
const t = ds.study.time;
const pad = (n: number | undefined, width: number) => String(n ?? 0).padStart(width, "0");
const started =
  d?.valid === true
    ? `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}` +
      (t?.valid === true ? `T${pad(t.hours, 2)}:${pad(t.minutes, 2)}:${pad(t.seconds, 2)}` : "")
    : undefined;
started; // => "1900-01-01T09:00:00" /* synthetic */

// ImagingStudy.subject: the DICOM side of that join is the Patient ID and its issuer.
const subject = { id: ds.patient.id, assigner: ds.patient.issuerOfId };
subject.assigner; // => "SAMPLE-HOSP" /* synthetic */

// HL7 v2: the Accession Number is the HIS-to-PACS join, conventionally OBR-18 or OBR-19 in a
// radiology ORM or ORU. Which one is a site agreement, not a DICOM rule.
ds.study.accessionNumber; // => "ACC-0001" /* synthetic */
```

- **`ImagingStudy.started` needs a time zone, and DICOM may not carry one.** `(0008,0201)` Timezone
  Offset From UTC is often absent, and we never invent one. Decide the offset at your boundary.
- **Series and SOP Instance UIDs are not represented in HL7 v2.** The Study Instance UID has no
  standard field either; sites that carry it use a Z-segment or an agreed slot.
- **A `urn:oid:` identifier is only correct for a genuine OID.** Do not wrap an Accession Number the
  same way.

## Re-serialize a parsed object to spec-clean bytes

You parsed an object, perhaps a quirky one, and need Part 10 bytes back out for storage or
forwarding.

```ts runnable
import { parseDicom, serializeDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const out = serializeDicom(parseDicom(buf));
Buffer.isBuffer(out); // => true

// Reading the bytes back gives the same data...
parseDicom(out).patient.name?.alphabetic?.familyName; // => "Doe" /* synthetic */

// ...and writing them again is byte-identical: a fixed point.
serializeDicom(parseDicom(out)).equals(out); // => true
```

`serializeDicom` writes the dataset in its source transfer syntax, with no transcode: File Meta as
Explicit VR Little Endian with a recomputed group length, every value padded to even length, every
Data Set it can walk in ascending tag order, and encapsulated Pixel Data byte for byte. Non-modeled
`(0002,xxxx)` elements are kept and written again. De-identified output is the exception to the
byte-for-byte File Meta round trip, since `deidentify()` replaces that group.
[Serialization](./serialization.md#what-the-writer-guarantees) explains what the writer guarantees,
when it refuses, and the Data Sets it writes as read.

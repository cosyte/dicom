---
id: cookbook
title: Use the cookbook for warnings, animal patients and dates
sidebar_label: Cookbook
sidebar_position: 5
description: Steps for triaging parse warnings, reading a veterinary patient, and checking what a de-identified object says about its dates.
---

# Cookbook

Each entry here is one job: the steps, a sample that runs, and what you get back. Every sample
object is synthetic (an invented patient, fake UIDs) and encoded as base64, so no entry needs a
file of yours on disk. The [recipes](./recipes.md) cover indexing, routing keys, pixel metadata,
de-identification, the FHIR and HL7 v2 bridge, and writing bytes back out. Read
[Known limitations](./limitations.md) before you trust any of this on real data.

## Triage warnings

You want to log or triage every tolerated deviation without your pipeline throwing on a vendor
quirk.

1. Parse leniently, the default, and read `ds.warnings`. Every recoverable deviation is there with a
   stable `code` and a byte offset; only a member of `FATAL_CODES` throws.

   ```ts runnable
   import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

   // A synthetic object with the preamble omitted: a tolerated quirk.
   const ds = parseDicom(
     Buffer.from(
       "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
       "base64",
     ),
   );

   // The object parsed; the deviation is recorded, not hidden.
   ds.series.modality; // => "CT"
   ds.warnings.map((w) => w.code); // => ["DICOM_MISSING_PREAMBLE"]
   ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE); // => true
   ```

2. Compare on `WARNING_CODES` members rather than strings, and give a `switch` over the codes a
   `default` branch: the registry gains codes between releases.

3. Log `w.code` and `w.position`, which carry nothing from the document. A message carries only
   structural substitutions; [Keeping PHI out of logs](./troubleshooting.md#keeping-phi-out-of-logs)
   says exactly what each may contain.

4. To be stricter for a trusted sender, pass `{ strict: true }` or a
   [source profile](./spec-notes-profiles.md) that escalates chosen codes. An escalated warning
   throws a `DicomParseError` whose `code` is the warning's own, and that error carries the raw
   `snippet` the warning does not; [Error handling](./error-handling.md#when-a-warning-becomes-a-throw)
   has the details.

   ```ts runnable
   import { parseDicom, DicomParseError, FATAL_CODES } from "@cosyte/dicom";

   const buf = Buffer.from(
     "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
     "base64",
   );

   let code: string | undefined;
   try {
     parseDicom(buf, { strict: true });
   } catch (err) {
     if (err instanceof DicomParseError) code = err.code;
   }
   code; // => "DICOM_MISSING_PREAMBLE"
   (code ?? "") in FATAL_CODES; // => false
   ```

## Read a veterinary patient

Your objects come from a veterinary practice, and you need the species, the breed, whether the
animal is neutered, and who is responsible for it, from headers that often do not follow the
standard to the letter.

**Attributes read** (PS3.6 2026c): `(0010,2201)` Patient Species Description, `(0010,2202)` Patient
Species Code Sequence, `(0010,2203)` Patient's Sex Neutered, `(0010,2292)` Patient Breed
Description, `(0010,2293)` Patient Breed Code Sequence, `(0010,2297)` Responsible Person,
`(0010,2298)` Responsible Person Role, `(0010,2299)` Responsible Organization.

1. Read them off `ds.patient`. Each is typed-absent when the object does not carry it, so on a human
   patient none appears. The code sequences are read through `readCode`, so a code arrives as the
   same `CodedConcept` triplet the rest of the package uses.

2. Read `ds.patient.issues`. A value the view cannot read as written does not throw: it is kept as
   written or left absent, and reported there with a code from `PATIENT_ISSUE_CODES`.

```ts runnable
import { parseDicom, PATIENT_ISSUE_CODES } from "@cosyte/dicom";

// A synthetic veterinary object: invented codes in a private 99SYNTH scheme, invented names.
const p = parseDicom(
  Buffer.from(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xABAAEABQTg4AU1lOVEhFVElDXlBFVCAQACAATE8MAFNZTlRILVBFVC0xIBAAASJMTxIAU1lOVEhFVElDIFNQRUNJRVMgEAACIlNRAAD//////v8A4DwAAAAIAAABU0gKAFNZTlNQRUNJRVMIAAIBU0gIADk5U1lOVEggCAAEAUxPEgBTeW50aGV0aWMgc3BlY2llcyD+/93gAAAAABAAAyJDUwgATkVVVEVSRUQQAJIiTE8QAFNZTlRIRVRJQyBCUkVFRCAQAJMiU1EAAP/////+/wDgOAAAAAgAAAFTSAgAU1lOQlJFRUQIAAIBU0gIADk5U1lOVEggCAAEAUxPEABTeW50aGV0aWMgYnJlZWQg/v/d4AAAAAAQAJciUE4QAFNZTlRIRVRJQ15PV05FUiAQAJgiQ1MGAE9XTkVSIBAAmSJMTw4AU0FNUExFIENMSU5JQyA=",
    "base64",
  ),
).patient;

p.speciesDescription; // => "SYNTHETIC SPECIES"
p.speciesCode?.codeValue; // => "SYNSPECIES"
p.speciesCode?.codingSchemeDesignator; // => "99SYNTH"
p.breedDescription; // => "SYNTHETIC BREED"
p.breedCode?.codeMeaning; // => "Synthetic breed"
p.responsiblePerson?.role; // => "OWNER"
p.responsiblePerson?.organization; // => "SAMPLE CLINIC" /* synthetic */

// The sender wrote NEUTERED, which is not one of the two values the standard allows.
// The view keeps it as written and reports it; nothing throws.
p.sexNeutered; // => "NEUTERED"
p.issues?.map((i) => i.code); // => ["DICOM_PATIENT_VALUE_NOT_ENUMERATED"]
p.issues?.[0]?.tag; // => "00102203"
p.issues?.[0]?.code === PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_NOT_ENUMERATED; // => true
```

What each issue code means:

| Code                                      | What the view did                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DICOM_PATIENT_VALUE_NOT_ENUMERATED`      | Patient's Sex Neutered holds a value other than `ALTERED` or `UNALTERED`. The value is kept as written.                                            |
| `DICOM_PATIENT_VALUE_WRONG_TYPE`          | The element is written in a VR its value does not decode from, such as `OB`. The field is left absent.                                             |
| `DICOM_PATIENT_CODE_SEQUENCE_EMPTY`       | A code sequence holds no item. The code is left absent.                                                                                            |
| `DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS` | A code sequence holds more than one item. The first is read.                                                                                       |
| `DICOM_PATIENT_CODE_INCOMPLETE`           | The code item has no code value in any of its three forms, no meaning, or no coding scheme designator beside a non-URN value. What it has is kept. |

- **Responsible Person Role is not checked against a list.** The view keeps whatever role the sender
  wrote, and reports nothing about it.
- **`responsiblePerson` is identifying.** It names a person and an organization, so log none of it.
  An issue's `message` is built from its code and tag alone, never from a value, so the issues are
  safe to log.
- **De-identification.** The Annex E table we carry removes `(0010,2297)` Responsible Person and
  `(0010,2299)` Responsible Organization, and `(0010,2203)` Patient's Sex Neutered unless you pass
  the `RetainPatientCharacteristics` option. It has no row for the species, the breed or the role,
  so `deidentify()` keeps them.

## Check the dates on a de-identified object

You received an object that someone de-identified, and before you use its dates you need to know
whether they are real, modified, or gone.

1. Read `(0028,0303)` Longitudinal Temporal Information Modified. A run of `deidentify()` writes it
   in one of three states: `REMOVED` when no Retain Longitudinal Temporal Information Option was
   active, `UNMODIFIED` when `RetainLongitudinalTemporal` was, and `MODIFIED` when
   `RetainLongitudinalTemporalModifiedDates` was.

   ```ts runnable
   import { parseDicom, deidentify } from "@cosyte/dicom";

   const source = parseDicom(
     Buffer.from(
       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
       "base64",
     ),
   );

   // Three de-identified copies, one per state, as a sender would produce them.
   const removed = deidentify(source).dataset;
   const unmodified = deidentify(source, { retain: ["RetainLongitudinalTemporal"] }).dataset;
   const modified = deidentify(source, {
     retain: ["RetainLongitudinalTemporalModifiedDates"],
   }).dataset;

   const datesState = (ds: typeof removed) => {
     const value = ds.get("00280303")?.value;
     return value?.kind === "strings" ? value.values[0] : undefined;
   };

   datesState(removed); // => "REMOVED"
   removed.study.date; // => undefined

   datesState(unmodified); // => "UNMODIFIED"
   unmodified.study.date?.raw; // => "19000101" /* synthetic */

   datesState(modified); // => "MODIFIED"
   ```

2. Treat `UNMODIFIED` dates as real ones. Treat `MODIFIED` as a statement about the table column the
   sender used, not proof that any date was shifted: this library performs no date transformation,
   and a sender that ran `RetainLongitudinalTemporalModifiedDates` with us received
   `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` saying the shift was theirs to do.

3. Treat an object with no `(0028,0303)` as one whose dates you cannot judge: it was not
   de-identified by a run that records the state.

[De-identification](./deidentification.md) explains the attribute and the two Options, and
[Known limitations](./limitations.md) states the residual of the modified-dates branch.

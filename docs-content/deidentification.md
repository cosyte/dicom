---
id: deidentification
title: Metadata de-identification
sidebar_label: De-identification
---

# Metadata de-identification

`deidentify(ds)` applies the PS3.15 2026c Annex E **Basic Application Level Confidentiality Profile**
(§E.2) to a parsed object: it replaces, empties or removes every attribute Table E.1-1 lists as
identifying, and returns a fresh `Dataset` plus a `DeidentifyReport` of what it did. It is a **pure
function**; your input dataset is never mutated.

:::caution This is metadata-level de-identification and nothing more

A de-identified output from `@cosyte/dicom` is **metadata-de-identified only**. Pixel data is out of
scope: where a file carries burned-in annotation this layer cannot remove, you get a
`DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning rather than a false sense of safety, and pixel
cleaning is deferred to `@cosyte/dicom-pixel`. **A report that reads clean does not close a residual.**
[Known limitations](./limitations) is the measured, still-open list, and it is required reading
before you route any of this at real data.

:::

Every DICOM object on this page is **synthetic** (an invented patient, obviously-fake UIDs) and
encoded as a base64 buffer, so an example needs no file on disk. Never paste a real object into a doc
or a test.

## The shape of a call

```ts runnable
import { parseDicom, deidentify, serializeDicom, DEFAULT_UID_ROOT } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);

const ds = parseDicom(buf);
const { dataset, report } = deidentify(ds);

// Pure: the input is untouched, the copy is scrubbed.
ds.patient.id; // => "MRN-42"
dataset.patient.id; // => undefined

// Patient's Name is emptied (Annex E action "Z"), not left in place.
dataset.get("00100010")?.value.kind; // => "empty"

// UIDs are remapped under the default root, deterministically.
DEFAULT_UID_ROOT; // => "2.25"
dataset.study.instanceUid?.startsWith(`${DEFAULT_UID_ROOT}.`); // => true

// The audit trail says what was acted on, and the object says of itself
// that dates were not retained on this call.
report.attributes.length > 0; // => true
dataset.get("00280303")?.value; // => { kind: "strings", values: ["REMOVED"] }

// The de-identified copy serializes to bytes you can share.
Buffer.isBuffer(serializeDicom(dataset)); // => true
```

## The options surface

| Export                | What it is                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DeidentifyOptions`   | The options object: `retain`, `uidRoot`, `uidMap`, `profile`, `deidentificationMethod`. Every field is optional; the default is the Basic Profile with no Option active.             |
| `DeidentifyOption`    | One Annex E option-set name. The two pixel-facing Options (`CleanPixelData`, `CleanRecognizableVisual`) are excluded by type, because this layer does not touch pixels.              |
| `DEIDENTIFY_OPTIONS`  | The frozen registry of the metadata option-set names, validated at runtime. **It is the list**: read it rather than a count written anywhere.                                        |
| `DeidentifyResult<T>` | What the call returns: `{ dataset, report }`, generic in the dataset type so the parsed type flows through.                                                                          |
| `AppliedAction`       | What actually happened to one attribute: `removed` (`X`), `emptied` (`Z`), `dummied` (`D`), `uid-remapped` (`U`), `cleaned` (`C`), or `kept`. The resolved outcome, not the table's code. |

An Option is opt-in and each one keeps a class of attribute the Basic Profile would otherwise strip:

```ts runnable
import { parseDicom, deidentify, DEIDENTIFY_OPTIONS } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=",
  "base64",
);
const ds = parseDicom(buf);

// The registry is the source of truth for what may be retained.
DEIDENTIFY_OPTIONS.includes("RetainLongitudinalTemporal"); // => true
DEIDENTIFY_OPTIONS.includes("CleanPixelData"); // => false

// Default: dates go, and the object declares that.
deidentify(ds).dataset.get("00280303")?.value.kind; // => "strings"
deidentify(ds).dataset.study.date?.raw; // => undefined

// With the full-dates Option: the real dates are in the output, and the
// declaration changes with them.
const dated = deidentify(ds, { retain: ["RetainLongitudinalTemporal"] }).dataset;
dated.get("00280303")?.value; // => { kind: "strings", values: ["UNMODIFIED"] }
dated.study.date?.raw; // => "19000101"

// With the modified-dates Option: the other E.3.6 column, and the third state.
const shifted = deidentify(ds, {
  retain: ["RetainLongitudinalTemporalModifiedDates"],
});
shifted.dataset.get("00280303")?.value; // => { kind: "strings", values: ["MODIFIED"] }
shifted.report.warnings.map((w) => w.code); // => ["DICOM_DEIDENT_DATES_NOT_TRANSFORMED"]
```

**`RetainLongitudinalTemporal` carries the less protective of the two PS3.15 §E.3.6 columns, and
`RetainLongitudinalTemporalModifiedDates` carries the other.** The standard defines a full-dates and
a modified-dates Option and Table E.1-1 gives them separate columns; the first name is the full-dates
branch, so on the attributes where the columns disagree you keep the real value where modified-dates
would have cleaned it. They are **mutually exclusive** and a call naming both is rejected with a
`DeidentifyError`. **Date shifting is not performed at this layer, on either branch**: §E.3.6 also
requires the dates themselves to be modified and the manner described in a Conformance Statement, and
both are yours, so every modified-dates run raises `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on its
report. Activate the full-dates Option only when real dates are genuinely required, and see
[Known limitations](./limitations) for the whole of that residual.

## What the object records about the method

PS3.15 2026c §E.1.1 asks a de-identifier to record how it ran, in codes from CID 7050
"De-identification Method" "corresponding to the Profile and Options used", which "shall be added to
De-identification Method Code Sequence (0012,0064), and/or a text string describing the method used
shall be inserted in or added to De-identification Method (0012,0063)". `deidentify()` writes both,
on every run. The text in `(0012,0063)` was already there; `(0012,0064)` is the machine-readable
half, so you can switch on a code instead of parsing English, and tell the two §E.3.6 branches
apart by `113106` and `113107` rather than only by the `(0028,0303)` value.

`(0012,0064)` is a top-level `SQ` with an Item for each code from PS3.16 2026d CID 7050 (context
group version `20170914`, UID `1.2.840.10008.6.1.925`): `113100` for the Profile first, then an Item
for each active Option in `DEIDENTIFY_OPTIONS` order, whatever order `retain` names them in. Each
Item carries exactly Code Value `(0008,0100)`, Coding Scheme Designator `(0008,0102)` = `DCM` and
Code Meaning `(0008,0104)`, and nothing else.

```ts runnable
import { Dataset, deidentify, DEIDENTIFICATION_METHOD_CODES } from "@cosyte/dicom";

// An empty Data Set keeps this short: the codes follow the options, not the content.
const empty = new Dataset({ warnings: [], elements: new Map() });
const { dataset } = deidentify(empty, { retain: ["RetainUIDs", "CleanDescriptors"] });

// The Profile, then each active Option in DEIDENTIFY_OPTIONS order.
const codeValues = (dataset.get("00120064")?.items ?? []).map((item) => {
  const value = item.get("00080100")?.value;
  return value?.kind === "strings" ? value.values[0] : undefined;
});
codeValues; // => ["113100", "113105", "113110"]

// The same rows, as data you can compare against.
DEIDENTIFICATION_METHOD_CODES.options.RetainUIDs.codeValue; // => "113110"
DEIDENTIFICATION_METHOD_CODES.profile.codeMeaning; // => "Basic Application Confidentiality Profile"

// Running it again adds nothing, and says it kept what was already there.
const again = deidentify(dataset, { retain: ["RetainUIDs", "CleanDescriptors"] });
again.dataset.get("00120064")?.items?.length; // => 3
again.report.warnings.map((w) => w.code); // => ["DICOM_DEIDENT_METHOD_PRIOR_RETAINED", "DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED"]
```

| Code Value | Code Meaning                                                   | Written when                              |
| ---------- | -------------------------------------------------------------- | ----------------------------------------- |
| `113100`   | Basic Application Confidentiality Profile                      | every run                                 |
| `113101`   | Clean Pixel Data Option                                        | never                                     |
| `113102`   | Clean Recognizable Visual Features Option                      | never                                     |
| `113103`   | Clean Graphics Option                                          | `CleanGraphics`                           |
| `113104`   | Clean Structured Content Option                                | `CleanStructuredContent`                  |
| `113105`   | Clean Descriptors Option                                       | `CleanDescriptors`                        |
| `113106`   | Retain Longitudinal Temporal Information Full Dates Option     | `RetainLongitudinalTemporal`              |
| `113107`   | Retain Longitudinal Temporal Information Modified Dates Option | `RetainLongitudinalTemporalModifiedDates` |
| `113108`   | Retain Patient Characteristics Option                          | `RetainPatientCharacteristics`            |
| `113109`   | Retain Device Identity Option                                  | `RetainDeviceIdentity`                    |
| `113110`   | Retain UIDs Option                                             | `RetainUIDs`                              |
| `113111`   | Retain Safe Private Option                                     | `RetainSafePrivate`                       |
| `113112`   | Retain Institution Identity Option                             | `RetainInstitutionIdentity`               |

**Added to, never replaced.** When the source already carries a top-level `(0012,0064)`, every
Item in it is kept, in its original order and byte for byte, and this run's Items follow. A code a
prior Item already records under the same Coding Scheme Designator and Code Value is not added
again (Code Meaning is not part of the match, and trailing padding is ignored), so de-identifying
an output again with the same options is a fixed point, and a run that adds one further Option
appends that Option's Item and nothing else.

The limits of what these codes say, stated here rather than on a later page:

- **`113101` and `113102` are never written.** They name the two pixel-level Options, and this
  layer does not touch pixels.
- **`113107` says the modified-dates column was resolved, not that any date was shifted.** It is
  the same limit `(0028,0303) = MODIFIED` carries: this library transforms no date, and every run
  that writes `113107` still carries `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on `report.warnings`.
- **An Option's code means the Option was active for the run.** It is written whether or not the
  object carried an attribute that Option acts on, and your `deidentificationMethod` text never
  changes the codes: they follow the options that ran.
- **Prior Items are carried, not inspected.** Neither `(0012,0064)` nor the code attributes in its
  Items has a Table E.1-1 row, so what a sender wrote there reaches your output under
  `(0012,0062) = YES`, and no prior code is checked against CID 7050 or any terminology. Every run
  that keeps a prior Item says so with `DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED`.
- **A prior that is not a Sequence of Items is replaced.** A `(0012,0064)` encoded under a VR other
  than `SQ`, or an `SQ` whose items were not parsed, cannot be added to, so this run's Items stand
  alone and `DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED` says so (a padding-only prior raises
  nothing, because nothing was lost).
- **Top level only.** A copy nested inside a Sequence Item is neither written nor read, the same
  reach `(0012,0062)` and `(0012,0063)` have.

| Export                          | What it is                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEIDENTIFICATION_METHOD_CODES` | The CID 7050 rows as frozen data, with the context group UID and version, the Profile's code and the code each `DeidentifyOption` writes.          |
| `DeidentificationMethodCode`    | One row: `codeValue`, `codingSchemeDesignator` (`DCM`) and `codeMeaning`, spelled exactly as CID 7050 spells them.                                 |

## UID remapping

Action `U` replaces a UID with an internally-consistent one. The replacement is a pure function of
the source UID and the root, so the same source UID maps to the same replacement across calls and
across files in a study set, with no shared state: cross-instance referential integrity (Study to
Series to SOP, Frame of Reference, referenced instances) survives the scrub.

| Export             | What it is                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_UID_ROOT` | The DICOM-sanctioned UUID-derived arc (PS3.5 §B.2), which needs no registration. The default `uidRoot`.                                                 |
| `makeUidRemapper`  | Builds a remapper over a root and an optional caller-owned cache, for remapping UIDs outside a `deidentify` call. Throws `DeidentifyError` on a bad root. |
| `UidRemapper`      | What it returns: `map(sourceUid)` plus the `cache` it fills, exposed for reporting and reuse.                                                            |

```ts runnable
import { makeUidRemapper, DEFAULT_UID_ROOT } from "@cosyte/dicom";

const remap = makeUidRemapper(DEFAULT_UID_ROOT);
const replaced = remap.map("1.2.826.0.1.3680043.8.498.1.1");

// Content-derived, so it is stable without any shared state...
replaced.startsWith("2.25."); // => true
remap.map("1.2.826.0.1.3680043.8.498.1.1") === replaced; // => true

// ...and a fresh remapper on the same root agrees with it.
makeUidRemapper().map("1.2.826.0.1.3680043.8.498.1.1") === replaced; // => true

// The cache is the source-to-replacement map, exposed for your own reporting.
remap.cache.get("1.2.826.0.1.3680043.8.498.1.1") === replaced; // => true
```

Pass your own `uidMap` through `DeidentifyOptions` if you would rather share one map explicitly
across a whole archive; the mapping is consistent either way, and a shared map only makes repeats
cheaper.

## The report, and what it is not safe to log

`DeidentifyReport` is an audit trail, not a redacted surface. **Several of its fields carry source
bytes rather than table lookups, and they are named on the type. Read that list before logging a
report whole**, and read [Keeping PHI out of logs](./troubleshooting#keeping-phi-out-of-logs) for the
mechanism. An emptied audit is not a performed one: a report that reads as a complete scrub it did
not perform is the worse half of every residual on the limitations page.

| Export                        | What it records                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DeidentifiedAttribute`       | One audited attribute: its tag, keyword, resolved Annex E action and the `AppliedAction` that action produced.                                                                                   |
| `EmbeddedAttributeFinding`    | A carrier whose over-declared Value Length swallowed the element after it, emptied rather than kept. `hidden` lists only tags this run acted on that Table E.1-1 gives a literal row, so it can be empty on a real finding. |
| `UnauditableSequenceFinding`  | An `SQ` that reached the run with no items, so its item stream could not be walked and it was emptied rather than passed through.                                                                |
| `UndefinedVrFinding`          | An element whose on-wire VR is outside the set PS3.5 §6.2 defines, emptied because no Table E.1-1 row can say what its bytes mean. It names a byte offset and deliberately no tag.               |
| `UnenumerablePrivateRemoval`  | A private attribute a `Profile` vouched for under `RetainSafePrivate` whose value this run did not enumerate, so §E.3.10's "known to be safe" was never established and it was **removed**, not emptied. |
| `FileMetaDroppedElement`      | A non-modeled `(0002,xxxx)` element the source carried that is not in the output, with the VR and byte length that went with it. A deliberate fidelity loss, recorded because what was dropped is the audit value. |
| `Group0004Removal`            | A `(0004,xxxx)` element removed under §E.1.1's unconditional group-0004 rule. No Option brings one back; the DICOMDIR carve-out is the one object it does not apply to.                          |

## Errors

| Export                   | What it is                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DEIDENTIFY_ERROR_CODES` | The frozen registry of codes this layer throws. Author-time misconfiguration only.                                                      |
| `DeidentifyErrorCode`    | The discriminant type over that registry.                                                                                              |
| `DeidentifyError`        | The thrown class, distinct from `DicomParseError`, `DicomValueError` and `DicomSerializeError`. Its message carries only option names and the UID root, never a decoded value. |

```ts runnable throws
import { makeUidRemapper } from "@cosyte/dicom";

// A UID root that is not a dotted-decimal OID prefix is an author error, not a file error.
makeUidRemapper("not-an-oid");
// throws DeidentifyError (INVALID_OPTIONS)
```

## Scope limits on this page's subject

These are boundaries, not defects; the full list is on [Known limitations](./limitations).

- **Metadata only.** Burned-in annotation is warned, never removed. Pixel scrubbing is
  `@cosyte/dicom-pixel`.
- **Conditional Annex E codes collapse to their most protective branch.** There is no IOD Type-1
  analysis here, so where the table's action depends on the object's IOD this run takes the branch
  that removes rather than the one that keeps.
- **`RetainSafePrivate` keeps only what the run could account for.** Two routes write a private
  value into de-identified output: a `Profile` you pass, and the **file's own** Private Data Element
  Characteristics Sequence `(0008,0300)`, which needs no profile at all. Everything else private is
  removed and recorded. The cost is over-redaction on the profile route, and it is nearly all of
  that route; on the declaration route the cost runs the other way, because what is kept rests on
  the **sender's** assertion that the block carries no identifying information rather than on
  anything this run examined. If you do not trust the sender, leave the Option off: PS3.15 §E.3.10
  offers no other mitigation.
- **The byte-for-byte File Meta round trip does not hold for this output.** The group is replaced
  with a description of the de-identifying application (§E.1.1), so the Source AE Title and the
  source's implementation identity go with it. That loss is recorded, and it is not recoverable from
  the output. If you need the source group verbatim, read it off the parsed dataset before the call,
  and see [Serialization](./serialization) for the round trip that does hold.
- **A de-identified DICOMDIR is not File-set conformant.** The run says so rather than implying
  otherwise; build a de-identified File-set from the de-identified files, not from this output.

## Where to go next

- A worked recipe, including what the File Meta group stops naming:
  [Cookbook](./cookbook#4-de-identify-before-sharing).
- What a diagnostic may and may not carry: [Tolerance & warnings](./spec-notes-tolerance).
- Vouching for known-safe private attributes: [Source profiles](./spec-notes-profiles).
- The measured, still-open residuals: [Known limitations](./limitations).

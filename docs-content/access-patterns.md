---
id: access-patterns
title: Access patterns
sidebar_label: Access patterns
sidebar_position: 8
description: How a DICOM Part 10 file is laid out, and the ways to read it with safety-critical views, tags, typed values, and dates and times.
---

# Access patterns

## DICOM in 90 seconds

A DICOM Part 10 file is a 128-byte preamble + the `DICM` magic, then a **File Meta** group (always Explicit VR Little Endian) naming the **transfer syntax**, then the **dataset**: a flat, tag-ordered stream of **data elements**.

Each element is identified by a `(group,element)` **tag** (e.g. `(0010,0010)` = Patient's Name) and carries a two-letter **VR** (Value Representation: `PN`, `DA`, `US`, `SQ`, …) that says how to decode its bytes. Some elements are **sequences** (`SQ`): ordered lists of **items**, each a nested dataset. The transfer syntax decides endianness, whether VRs are written explicitly, and whether the stream is deflated.

```
DICOM file
 ├── preamble (128 bytes) + "DICM"
 ├── File Meta group (0002,xxxx)   : transfer syntax UID, SOP Class/Instance UID
 └── dataset
      ├── (0008,0060) Modality           "CT"
      ├── (0010,0010) PatientName  PN     «a person's name»
      ├── (0020,000D) StudyInstanceUID UI "1.2.840.…"
      ├── (0028,0100) BitsAllocated  US   16
      └── (7FE0,0010) PixelData     OW    «raw bytes, not decoded»
```

`@cosyte/dicom` reads all of that leniently and hands you typed accessors over it. The one thing it deliberately does **not** do is decode the pixels.

## Safety-critical views

The examples on this page read `ds`, a parsed object. This one is synthetic, and the test suite runs
the block on every change:

```ts runnable
import { Dictionary, parseDicom } from "@cosyte/dicom";

// A synthetic CT object, saved without its 128-byte preamble: an invented patient and example-root
// UIDs, no real PHI.
const ds = parseDicom(
  Buffer.from(
    "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
    "base64",
  ),
);

ds.patient.id; // => "MRN-42" /* synthetic */
ds.patient.issuerOfId; // => "SAMPLE-HOSP" /* synthetic */
ds.study.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1" /* synthetic */
ds.series.modality; // => "CT"
Dictionary.byKeyword("Modality")?.tag; // => "00080060"
ds.has("00080060"); // => true
```

The four views (`patient`, `study`, `series`, `image`) pull the right field out of the right tag for the jobs that matter most, and they are **fail-safe**: a missing value is typed-absent (`undefined`), never a substituted default.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"));

const p = ds.patient;
p.id; // => "MRN-42" /* synthetic */
p.issuerOfId; // => "SAMPLE-HOSP" /* synthetic */
p.name?.alphabetic?.familyName; // => "Doe" /* synthetic */

const s = ds.study;
s.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1" /* synthetic */
s.accessionNumber; // => "ACC-0001" /* synthetic */
```

These are the fields that identify a person and a study, so an example here asserts on them and
never prints them; the values are synthetic. A Patient ID is not globally unique on its own: pair it with its issuer for matching across
systems. The name is a structured person name, never flattened. The Accession Number
`(0008,0050)` ties the study to the order in the hospital information system.

## By tag

`get`, `has`, and `getAll` take the **8-character `(group,element)` tag** (case-insensitive) and only that: `"00080060"`, not `"Modality"` and not `"(0008,0060)"`. A keyword resolves to its tag through the dictionary first. `getAll` is the always-array complement of `get` (a dataset holds at most one element per tag, so it returns 0 or 1), and `elements()` walks everything.

```ts runnable
import { Dictionary, parseDicom } from "@cosyte/dicom";

const ds = parseDicom(Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"));

ds.get("00080060")?.vr; // => "CS"
ds.has("7FE00010"); // => false
ds.getAll("00080060").length; // => 1
ds.elements().length > 0; // => true

// Prefer keywords? Resolve one to its tag, then get by tag.
const tag = Dictionary.byKeyword("Modality")?.tag;
tag; // => "00080060"
ds.get(tag ?? "")?.value; // => { kind: "strings", values: ["CT"] }
```

## Typed values

`get` returns an `Element`; its `.value` lazily decodes the raw bytes into a discriminated `DicomValue` and caches the result.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"));

const rows = ds.get("00280010")?.value; // Rows, a US
rows?.kind === "numbers" ? rows.values[0] : undefined; // => 512

const name = ds.get("00100010")?.value; // Patient's Name, a PN
name?.kind === "personName" ? name.values[0]?.alphabetic?.givenName : undefined; // => "Jane" /* synthetic */
```

Decode is fail-safe: it never throws and never coerces a malformed value to a plausible-but-wrong one (a bad `DS`/`IS` token becomes `null`, never `NaN`→0). Per-value deviations surface on the returned value's own `warnings`.

## Dates and times

`DA`, `TM`, and `DT` decode into three different shapes, and the code that consumes them usually wants one. **`toObject`, `toISO`, and `toDate` take any of the three** and project it onto a single surface. The same three names, with the same meanings, are exported by every `@cosyte/*` parser that decodes a date.

```ts runnable
import { parseDate, parseDateTime, parseTime, toISO, toObject } from "@cosyte/dicom";

toObject(parseDate("19000115").value); // => { year: 1900, month: 1, day: 15 }
toObject(parseTime("133015").value); // => { hour: 13, minute: 30, second: 15 }
toISO(parseDateTime("19000115133015-0500").value); // => "1900-01-15T13:30:15-05:00"
```

**The key set is the precision.** A component the value did not state is absent from the returned `DateParts` rather than present and `undefined`, and nothing is zero-filled, so `Object.keys()` recovers exactly what the sender wrote. There is no `precision` key because the key set is one, and no `raw` or `valid` key because parse bookkeeping is not a calendar component.

**The keys are SINGULAR, and the decoded types are plural.** `DicomTime` and `DicomDateTime` spell the time fields `hours`, `minutes`, and `seconds`; `DateParts` spells them **`hour`, `minute`, and `second`**, and `month` is 1 to 12 rather than the JS `Date` 0 to 11. That is the rename to expect when you move from a decoded value to a converted one, and it is deliberate: it is the shape `Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject` accept, so deleting `offsetMinutes` leaves an object either constructor takes with no key rename and no value adjustment.

**`toDate` never guesses a zone.** A `DT` that carried an `&ZZXX` offset converts exactly, and that stated offset beats any `assumeOffsetMinutes` the caller passes. A value with no offset converts only when the caller supplies one, an explicit `0` meaning "read this naive value as UTC". **With no stated offset and no `assumeOffsetMinutes`, the answer is `undefined`**: the host machine's zone is never read and UTC is never assumed. A non-finite `assumeOffsetMinutes` names no zone either, so it answers `undefined` rather than an `Invalid Date`, and so does a finite one so large that applying it leaves the range a `Date` represents. A `TM` states no year, so it is never an instant however determinate the caller's zone is.

```ts runnable
import { parseDate, parseDateTime, parseTime, toDate } from "@cosyte/dicom";

// Neither the value nor the caller named a zone.
toDate(parseDate("19000115").value); // => undefined
toDate(parseDate("19000115").value, { assumeOffsetMinutes: 0 })?.toISOString(); // => "1900-01-15T00:00:00.000Z"

// The stated -0500 wins over the caller's assumption.
toDate(parseDateTime("19000115133015-0500").value, { assumeOffsetMinutes: 600 })?.toISOString(); // => "1900-01-15T18:30:15.000Z"

// A time is not an instant.
toDate(parseTime("133015").value, { assumeOffsetMinutes: 0 }); // => undefined
```

`millisecond` is the first three digits of the stated fraction, taken verbatim and right-padded (`"5"` is 500, `"0500"` is 50, `"123456"` is 123). It is never `fractionalSeconds * 1000`, which is a binary float and cannot be trusted to the last digit. `toISO` renders those digits exactly as written, neither padded to three nor rounded, and it appends `Z` for a stated zero offset, so it is deliberately not a byte round-trip of the wire value: `serializeDicom` remains the route that reproduces the original bytes. All three functions return `undefined` for a value the decoders marked `valid: false`, and none of them throws for any input.

**An impossible date converts to nothing, never to the day after it.** The decoders range-check each component on its own, so a `DA` of `18700230` decodes with `valid: true` and `day: 30`; the conversion surface reads the components together and refuses the whole value, because `"1870-02-30"` is a string every ISO-8601 reader silently moves to 2 March and the instant for it is a date of birth off by a day. The rule covers a month outside 1 to 12, a day outside the one its month really has (full 4/100/400 leap rule, so 29 February 2100 is refused and 29 February 1600 is not), an hour, minute or second out of range, and a component that is not a whole number. **`second: 60` is refused with them**, even though `TM` and `DT` permit it for a leap second: there is no ISO rendering of it a reader does not move, and no instant to build. It is refused in the projection only. `parseTime`, `parseDate`, and `parseDateTime` are unchanged and still report what the sender wrote, so the bytes are never lost, and this rule binds a hand-built value exactly as it binds a decoded one.

```ts runnable
import { parseDate, toDate, toISO, toObject } from "@cosyte/dicom";

toObject(parseDate("18700230").value); // => undefined
toISO(parseDate("18700431").value); // => undefined
toDate(parseDate("18700230").value, { assumeOffsetMinutes: 0 }); // => undefined

// The decoder is untouched: it still reports what the sender wrote.
parseDate("18700230").value.day; // => 30
```

February has no 30th and April has no 31st, so each converts to nothing, never to 2 March or
1 May.

Because the three names are identical across every `@cosyte/*` parser, a file importing two of them has to alias or namespace-import:

```ts
import { parseDateTime, toISO as dicomToISO } from "@cosyte/dicom";
import { parseDtm, toISO as hl7ToISO } from "@cosyte/hl7";

dicomToISO(parseDateTime("20240115133015").value); // "2024-01-15T13:30:15"
hl7ToISO(parseDtm("20240115133015")); // the same string, from an HL7 v2 DTM
```

The asymmetric `.value` is not a slip: what is shared across the packages is the three conversion names and their return shapes, never the decoders' own return shapes. `parseDateTime` here answers `{ value, nonstandardOffset }`, so the value comes out of the `.value` field, while `@cosyte/hl7`'s `parseDtm` answers its parts directly and is passed straight in. Read each package's decoder signature; then the conversion is the same call everywhere.

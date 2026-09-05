---
id: spec-notes-values
title: Typed values & VR decode
sidebar_label: Typed values
---

# Typed values & VR decode

`ds.get(tag)` returns an `Element`: the raw bytes and the VR. Its **`.value`** getter lazily decodes
those bytes into a typed, discriminated `DicomValue` and caches the result. Every one of the 34 VRs
has a decode: integers and floats (`numbers`), 64-bit values (`bigints`), attribute tags, person
names (`personName`), strings (`strings`), free text (`text`), numeric strings (`DS`/`IS`), temporal
values (`dates` / `times` / `dateTimes`), sequences, and raw `binary` for bulk data.

## The DicomValue union

`DicomValue` is a discriminated union. Switch on `.kind` and the payload narrows:

```ts runnable
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);

// US (unsigned short) → numbers. Switch on `.kind` to narrow the payload.
const rows = ds.get("00280010")?.value; // Rows
rows?.kind; // => "numbers"
const rowCount = rows?.kind === "numbers" ? rows.values[0] : undefined;
rowCount; // => 512

// PN (person name) → structured 3-group / 5-component value
const name = ds.get("00100010")?.value; // Patient's Name
name?.kind; // => "personName"
const family = name?.kind === "personName" ? name.values[0]?.alphabetic?.familyName : undefined;
family; // => "Doe"

// DA (date) → validated calendar parts, raw preserved
const date = ds.get("00080020")?.value; // Study Date
const day = date?.kind === "dates" ? date.values[0] : undefined;
day?.valid; // => true
day?.year; // => 1900

// IS (integer string) → parsed integers
const num = ds.get("00200011")?.value; // Series Number
num?.kind; // => "integerString"
```

### The typed payloads

Each temporal and name payload keeps the on-wire string beside the parsed parts, so nothing is lost
when the parse is partial. `valid` is `true` only when the whole value parsed cleanly; when it is
`false`, `raw` is the source of truth and the numeric fields are absent rather than guessed.

| Export            | The value it carries                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DicomValue`      | The discriminated union itself. Switch on `.kind`.                                                                                                               |
| `DicomDate`       | A `DA`: `raw`, `valid`, and `year` / `month` / `day` when it parsed.                                                                                              |
| `DicomTime`       | A `TM`: `raw`, `valid`, `hours` / `minutes` / `seconds`, and `fractionalSeconds` as a number in `[0,1)`.                                                          |
| `DicomDateTime`   | A `DT`: the date and time parts together, plus `offsetMinutes` as a signed UTC offset when the value carried one. Without an offset it is a **local** time; decide the offset at your own boundary. |
| `PersonName`      | A `PN`: up to three component groups, `alphabetic` always present, `ideographic` and `phonetic` only when the value supplied them (PS3.5 §6.2.1.1).               |
| `PersonNameGroup` | One of those groups: `familyName`, `givenName`, `middleName`, `namePrefix`, `nameSuffix`, never flattened into a display string.                                  |

### Decoding a value yourself

The pieces the `.value` getter uses are exported, for the cases where you hold bytes rather than an
`Element`, or a string rather than an element at all. None of them throws.

| Export                       | What it does                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `decodeElementValue`         | The decode itself: takes an `Element` and returns its `DicomValue`. This is what `.value` calls and caches.                              |
| `parsePersonName`            | Parses one `PN` string into a `PersonName`.                                                                                              |
| `parseDate`                  | Parses one `DA` string, and reports whether it used the legacy `YYYY.MM.DD` form.                                                        |
| `parseTime`                  | Parses one `TM` string.                                                                                                                  |
| `parseDateTime`              | Parses one `DT` string, and reports a non-standard UTC offset.                                                                           |
| `parseSpecificCharacterSet`  | Splits a `(0008,0005)` value into its defined terms. A component outside the closed table reads `<withheld>` rather than being returned.  |
| `isKnownCharsetTerm`         | Whether a defined term is one this build can map to a decoder.                                                                           |
| `resolveDecoderLabel`        | The `TextDecoder` label to use for a term list, preferring a multibyte decoder and falling back to the default repertoire.                |
| `decodeText`                 | Decodes bytes under that resolved charset, never throwing: an unsupported label falls back to UTF-8, then to Latin-1.                     |

### Converting a date, a time or a datetime

`DicomDate`, `DicomTime` and `DicomDateTime` are three shapes, and the code that consumes them
usually wants one. `toObject`, `toISO` and `toDate` take any of the three and project it onto a
single surface. Every `@cosyte/*` parser that decodes a date exports the same three names with the
same meanings, so a caller that learns them here can read a timestamp out of any of them.

| Export          | What it does                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `toObject`      | The calendar components the value stated, as a frozen `DateParts`. `undefined` for an invalid value.                                      |
| `toISO`         | An ISO-8601 string truncated to the stated precision. `undefined` for an invalid value.                                                   |
| `toDate`        | An absolute-instant `Date`, but only where the zone is determinate. `undefined` otherwise.                                                |
| `DateParts`     | The shared result shape: `year` / `month` / `day` / `hour` / `minute` / `second` / `millisecond` / `offsetMinutes`, all optional.         |
| `ToDateOptions` | `toDate`'s only option: `{ assumeOffsetMinutes }`, and no other key.                                                                       |

Three rules make this surface worth having, and each one is a decision the naive version gets wrong.

**The key set is the precision.** A component the value did not state is absent from `DateParts`
rather than present and `undefined`, and nothing is zero-filled, so `Object.keys()` of the result
recovers exactly what the sender wrote. There is no `precision` key because the key set is one, and
no `raw` or `valid` key because parse bookkeeping is not a calendar component.

**The names are singular.** `DicomTime` and `DicomDateTime` spell the time fields `hours`,
`minutes` and `seconds`; `DateParts` spells them `hour`, `minute` and `second`, and `month` is 1 to
12 rather than the JS `Date` 0 to 11. That is the shape `Temporal.PlainDateTime.from` and luxon's
`DateTime.fromObject` accept: delete `offsetMinutes` and either constructor takes the rest with no
key rename and no value adjustment.

**`toDate` never guesses a zone.** A `DT` that carried an `&ZZXX` offset converts exactly, and that
stated offset beats any `assumeOffsetMinutes` the caller passes. A value with no offset converts
only when the caller supplies one, an explicit `0` meaning "read this naive value as UTC". With
neither, the answer is `undefined`: the host machine's zone is never read, and a `TM` is never an
instant at all because it states no year.

```ts runnable
import { parseDate, parseDateTime, parseTime, toDate, toISO, toObject } from "@cosyte/dicom";

// One set of names, three decoded shapes.
toObject(parseDate("20240115").value); // => { year: 2024, month: 1, day: 15 }
toObject(parseTime("133015").value); // => { hour: 13, minute: 30, second: 15 }
toISO(parseDateTime("20240115133015-0500").value); // => "2024-01-15T13:30:15-05:00"

// The key set is the precision: nothing is zero-filled.
const stated = toObject(parseDateTime("202401151330").value);
Object.keys(stated ?? {}); // => ["year", "month", "day", "hour", "minute"]

// `millisecond` is the first three digits as written, never the float scaled up.
toObject(parseTime("133015.123456").value)?.millisecond; // => 123
toISO(parseTime("133015.123456").value); // => "13:30:15.123456"

// A time is not an instant, however determinate the caller's zone is.
toDate(parseTime("133015").value, { assumeOffsetMinutes: 0 }); // => undefined

// No stated offset and no assumption: no instant, and no host zone consulted.
toDate(parseDate("20240115").value); // => undefined
toDate(parseDate("20240115").value, { assumeOffsetMinutes: 0 })?.toISOString(); // => "2024-01-15T00:00:00.000Z"

// A stated offset beats whatever the caller assumed.
const shifted = parseDateTime("20240115133015-0500").value;
toDate(shifted, { assumeOffsetMinutes: 600 })?.toISOString(); // => "2024-01-15T18:30:15.000Z"
```

Two properties are worth stating because a reader will otherwise assume the opposite. `toISO`
renders fractional digits exactly as written, neither padded to three nor rounded, and it appends
`Z` for a stated zero offset, so it is deliberately not a byte round-trip of the wire value:
`serializeDicom` remains the route that reproduces the original bytes. And because the three names
are identical across every `@cosyte/*` parser, a file importing two of them has to alias:

```ts
import { toISO as dicomToISO } from "@cosyte/dicom";
import { toISO as hl7ToISO } from "@cosyte/hl7";
```

## Decode is fail-safe: a bad token is `null`, never a plausible wrong number

The decode never throws and never coerces a malformed value into a plausible-but-wrong one. A bad
`DS`/`IS` token becomes `null` (never `NaN`→`0`); an out-of-range date part is flagged rather than
silently wrapped. Per-value deviations surface on the returned value's own `warnings`, so a
mis-encoded token in one element never poisons the rest of the parse. This is the value-layer form of
the "correct, not merely green" rule: the parser would rather tell you a token is unreadable than
hand you a confident wrong one.

## Character sets

String VRs honor the object's `(0008,0005)` Specific Character Set: UTF-8 (`ISO_IR 192`), the
ISO-8859 family, and ISO-2022 escapes. The active charset is threaded through nested sequence
items so a code-string inside a sequence decodes the same way a top-level one does. An unsupported
charset term degrades to a `DICOM_UNSUPPORTED_CHARSET` warning with a safe fallback, never a wrong
decode.

## Bulk data stays raw

Pixel Data and other bulk elements decode to `{ kind: "binary", bytes }`: the raw `Buffer`, never
interpreted. This is the metadata-first boundary in the value layer: the bytes are handed to you
exactly as stored (for encapsulated transfer syntaxes, as their fragments), and pixel decoding is out
of scope. See [Reading raw pixel data](./cookbook) and the non-goals in
[Troubleshooting](./troubleshooting).

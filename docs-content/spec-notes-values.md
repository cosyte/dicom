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

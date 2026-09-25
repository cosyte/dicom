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
| `resolveDecoderLabel`        | The `TextDecoder` label to use for a term list, preferring a multibyte decoder and falling back to the default repertoire. A multi-valued set decodes with code extensions instead (see [Character sets](#character-sets)). |
| `decodeText`                 | Decodes bytes under the terms, never throwing. A multi-valued set decodes with the code extensions of ISO 2022; any other decodes under the resolved label, where an unsupported label falls back to UTF-8, then to Latin-1. |

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

Four rules make this surface worth having, and each one is a decision the naive version gets wrong.

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

**A component outside its range is refused, never rolled over.** The decoders bound each component
on its own, so a `DA` of `18700230` decodes with `valid: true` and `day: 30`. The conversion surface
reads the components together: a month outside 1 to 12, a day the month does not really have (full
4/100/400 leap rule), an hour, minute or second out of range, or a component that is not a whole
number, and the whole value converts to `undefined`. Rendering it would produce `"1870-02-30"`,
which every ISO-8601 reader silently moves to 2 March, and converting it would produce a date of
birth off by a day. `second: 60` is refused with them: `TM` and `DT` permit it for a leap second and
the decoders keep it, but there is no ISO string for it a reader does not move, and no instant to
build. The refusal is in the projection alone, so `parseDate`, `parseTime` and `parseDateTime` still
report exactly what the sender wrote.

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

// A day the calendar does not have converts to nothing, never to the day after it.
toObject(parseDate("18700230").value); // => undefined
toISO(parseDate("18700431").value); // => undefined
toDate(parseDate("18700230").value, { assumeOffsetMinutes: 0 }); // => undefined
toISO(parseTime("133060").value); // => undefined

// The decoders are untouched: the bytes the sender wrote are still readable.
parseDate("18700230").value.day; // => 30
parseTime("133060").value.seconds; // => 60
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

`PN`, `LO`, `SH`, `UC`, `ST`, `LT` and `UT` values honor the object's `(0008,0005)` Specific
Character Set. The active charset is threaded through nested sequence items, so a value inside a
sequence decodes the same way a top-level one does. An unsupported charset term raises
`DICOM_UNSUPPORTED_CHARSET`.

**With one Value there are no code extensions.** A single-valued `(0008,0005)` (`ISO_IR 192`
UTF-8, the ISO-8859 family, `ISO_IR 13`, `ISO_IR 166`, `GB18030`, `GBK`) decodes each value with
one decoder, as PS3.5 section 6.1.2.3 prescribes for a single Value. A multi-byte term sent alone,
such as `ISO 2022 IR 149`, is not conformant (PS3.3 Table C.12-4 makes those terms Value 2 to n),
and it gets the same single-decoder treatment: no Value 1 reset and none of the warnings below.

**With more than one Value, the code extensions of ISO 2022 are decoded** (PS3.5 2026d section
6.1.2.5),
unless Value 1 is `ISO_IR 192`, `GB18030` or `GBK`, which take none (section 6.1.2.4):

- Every escape sequence of PS3.3 Tables C.12-3 and C.12-4 switches the set it names into G0 or G1:
  ISO-IR 6, ISO-IR 14 and the two-byte JIS X 0208 (ISO-IR 87) and JIS X 0212 (ISO-IR 159) into G0;
  the ISO-8859 sets, TIS 620 (ISO-IR 166), JIS X 0201 katakana (ISO-IR 13) and the two-byte
  KS X 1001 (ISO-IR 149) and GB 2312 (ISO-IR 58) into G1. No escape byte reaches the string.
- Value 1 sets the starting designations (an empty Value 1 is ISO-IR 6 with nothing in G1), and they
  come back at every reset point: the start of the value; after a CR, LF or FF; after the `\` value
  delimiter of `PN`, `LO`, `SH` and `UC`; and after the `^` and `=` delimiters of `PN`. In `ST`, `LT`
  and `UT` a `\` is literal.
- A delimiter counts only as a single byte, never as half of a two-byte character, so a JIS X 0208
  character whose second byte is `0x5C`, `0x5E` or `0x3D` stays one character.
- `decodeText(bytes, terms)` applies the same decode with the text reset points (CR, LF and FF) and
  returns the string alone.

PS3.5's own worked Person Names (Examples H.3-1, H.3-2, I.2-1 and K.2-1) decode to the names the
standard prints, with no warning. What the decode had to tolerate is flagged on `Element.value`'s
`warnings`, each code at most once per value, and never in `Dataset.warnings`, so `{ strict: true }`
does not refuse the file. Their messages carry the tag and VR, never a byte of the value.

| Code                                | When                                                                                                                                                                                                                   | What the value holds                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DICOM_CHARSET_ESCAPE_UNDECLARED`   | An escape sequence switches to a set no Value of `(0008,0005)` declares.                                                                                                                                              | The characters, decoded in the set the escape sequence names.                         |
| `DICOM_CHARSET_BYTES_UNDECODABLE`   | An ESC that starts no sequence in either table (with every byte after it up to the next recognized sequence, CR, LF, FF or the end), a GR byte while G1 holds no set, a code the set does not define, or a set this runtime cannot decode. | U+FFFD in place of those bytes, never another set's reading. `Element.rawBytes` keeps them. |
| `DICOM_CHARSET_EXTENSION_NOT_RESET` | A line, value or `PN` component ends while G0 still holds a set other than Value 1's.                                                                                                                                   | The characters decoded up to that point; what follows decodes from Value 1.            |

Limits, stated here because each one is a place the decode is narrower than a reader might assume:

- **A single-valued `(0008,0005)` gets no code-extension handling**, as described above.
- **ISO-IR 14's `0x5C` and `0x7E` read as `\` and `~`**, not YEN SIGN and OVERLINE, because `0x5C`
  is also the value delimiter and a consumer splits on `\`.
- **Every line starts over from Value 1.** An `LT` or `UT` that switches to KS X 1001 once and then
  runs over several lines reads its later lines as U+FFFD, with `DICOM_CHARSET_BYTES_UNDECODABLE`,
  because PS3.5 requires the switch again on each line. The bytes stay on `Element.rawBytes`.
- **A two-byte set holds only its own standard's characters.** Node's decoders are vendor
  supersets (NEC and IBM rows in JIS X 0208, GBK's additions in GB 2312's rows); those codes read as
  U+FFFD here.
- **Only the read path changed.** `serializeDicom` writes the raw bytes back and `deidentify()`
  acts on raw bytes, so neither decodes code extensions.

## Bulk data stays raw

Pixel Data and other bulk elements decode to `{ kind: "binary", bytes }`: the raw `Buffer`, never
interpreted. This is the metadata-first boundary in the value layer: the bytes are handed to you
exactly as stored (for encapsulated transfer syntaxes, as their fragments), and pixel decoding is out
of scope. See [Reading raw pixel data](./cookbook) and the non-goals in
[Troubleshooting](./troubleshooting).

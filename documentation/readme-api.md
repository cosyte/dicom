`README.md` links here from its own `## API` heading. Every section below carries the heading it carries there.

## API

Everything is exported from the single top-level entry point, `@cosyte/dicom`. The full reference lives in [`docs-content/`](../docs-content/) and in your editor: every public export carries JSDoc with an `@example`, gated in CI.

### Features

- **One-line metadata extraction**: `ds.patient`, `ds.study`, `ds.series`, `ds.image`: typed, fail-safe views over the safety-critical attributes. No `(group,element)` tags to memorise.
- **Two access patterns**: named views, or structural `ds.get("00100010")` by 8-character `(group,element)` tag (resolve a keyword to its tag with `Dictionary.byKeyword`), plus `ds.elements()` to walk everything.
- **Lazy typed value decode**: `element.value` decodes raw bytes into a discriminated `DicomValue` across all 34 VRs (numbers, `bigint`s, person names, dates/times, sequences, raw `binary`), honoring `(0008,0005)` Specific Character Set through nested items.
- **Real-world tolerance, Postel's Law**: a lenient reader emits stable warning codes for what it tolerated; only 4 truly-structural conditions are fatal. The serializer always writes spec-clean Part 10. (The count used to be quoted here and had drifted: it read `25` against a `WARNING_CODES` of `28`. The locked snapshot in `test/property/__snapshots__/warning-codes.snapshot.test.ts.snap` is the pin, and it is measured on every run rather than narrated here.)
- **Source/vendor profile system**: `defineProfile()` + 5 built-ins (`ge`, `siemens`, `philips`, `strict`, `lenient`) that only ever _tighten or annotate_ a parse, resolving vendor private tags by the file's live Private Creator string, never a wrong decode.
- **Metadata-level de-identification**: `deidentify()` applies the PS3.15 Annex E Basic Profile + the nine metadata Options, returning a fresh dataset and an audit report built from static tables, with two fields that carry source bytes and are named as such on the type: `report.uidMap` (source UIDs) and `report.removedPrivateTags`.
- **Spec-clean serializer**: `serializeDicom(ds)` round-trips a dataset back to Part 10 bytes in its source transfer syntax (no transcode), with correct File Meta group length, even-length padding, byte-exact sequence passthrough, and lossless File Meta: non-modeled `(0002,xxxx)` elements are preserved and re-emitted in tag order.
- **Strict TypeScript, dual ESM + CJS, Node ≥ 22**: `noUncheckedIndexedAccess`, no `any`, JSDoc + `@example` on every public export feeding your editor's IntelliSense. Zero runtime dependencies today.

### DICOM in 90 seconds

A DICOM Part 10 file is a 128-byte preamble + the `DICM` magic, then a **File Meta** group (always Explicit VR Little Endian) naming the **transfer syntax**, then the **dataset**: a flat, tag-ordered stream of **data elements**.

Each element is identified by a `(group,element)` **tag** (e.g. `(0010,0010)` = Patient's Name) and carries a two-letter **VR** (Value Representation: `PN`, `DA`, `US`, `SQ`, …) that says how to decode its bytes. Some elements are **sequences** (`SQ`): ordered lists of **items**, each a nested dataset. The transfer syntax decides endianness, whether VRs are written explicitly, and whether the stream is deflated.

```
DICOM file
 ├── preamble (128 bytes) + "DICM"
 ├── File Meta group (0002,xxxx)   : transfer syntax UID, SOP Class/Instance UID
 └── dataset
      ├── (0008,0060) Modality           "CT"
      ├── (0010,0010) PatientName  PN     "Doe^Jane"
      ├── (0020,000D) StudyInstanceUID UI "1.2.840.…"
      ├── (0028,0100) BitsAllocated  US   16
      └── (7FE0,0010) PixelData     OW    «raw bytes, not decoded»
```

`@cosyte/dicom` reads all of that leniently and hands you typed accessors over it. The one thing it deliberately does **not** do is decode the pixels.

### Access patterns

#### Safety-critical views

The four views (`patient`, `study`, `series`, `image`) pull the right field out of the right tag for the jobs that matter most, and they are **fail-safe**: a missing value is typed-absent (`undefined`), never a substituted default.

```ts
const p = ds.patient;
p.id; // "MRN-42": NOT globally unique on its own…
p.issuerOfId; // …pair with the issuer for cross-system matching
p.name?.alphabetic.familyName; // structured PN, never flattened

const s = ds.study;
s.instanceUid; // "1.2.840.…" Study Instance UID (0020,000D)
s.accessionNumber; // ties the study to the HIS order (0008,0050)
```

#### By tag

`get`, `has` and `getAll` take the **8-character `(group,element)` tag** (case-insensitive) and only that: `"00080060"`, not `"Modality"` and not `"(0008,0060)"`. A keyword resolves to its tag through the dictionary first. `getAll` is the always-array complement of `get` (a dataset holds at most one element per tag, so it returns 0 or 1), and `elements()` walks everything.

```ts
import { Dictionary } from "@cosyte/dicom";

ds.get("00080060"); // Modality (0008,0060)
ds.has("7FE00010"); // boolean: is Pixel Data present
ds.elements(); // readonly Element[]: walk everything

// Prefer keywords? Resolve one to its tag, then get by tag.
const tag = Dictionary.byKeyword("Modality")?.tag; // "00080060"
ds.get(tag ?? "");
```

#### Typed values

`get` returns an `Element`; its `.value` lazily decodes the raw bytes into a discriminated `DicomValue` and caches the result.

```ts
const rows = ds.get("00280010")?.value; // Rows, a US
if (rows?.kind === "numbers") rows.values[0]; // 512

const name = ds.get("00100010")?.value; // Patient's Name, a PN
if (name?.kind === "personName") name.values[0]?.alphabetic.givenName; // "Jane"
```

Decode is fail-safe: it never throws and never coerces a malformed value to a plausible-but-wrong one (a bad `DS`/`IS` token becomes `null`, never `NaN`→0). Per-value deviations surface on the returned value's own `warnings`.

#### Dates and times

`DA`, `TM` and `DT` decode into three different shapes, and the code that consumes them usually wants one. **`toObject`, `toISO` and `toDate` take any of the three** and project it onto a single surface. The same three names, with the same meanings, are exported by every `@cosyte/*` parser that decodes a date.

```ts
import { parseDate, parseDateTime, parseTime, toDate, toISO, toObject } from "@cosyte/dicom";

toObject(parseDate("20240115").value); // { year: 2024, month: 1, day: 15 }
toObject(parseTime("133015").value); // { hour: 13, minute: 30, second: 15 }
toISO(parseDateTime("20240115133015-0500").value); // "2024-01-15T13:30:15-05:00"
```

**The key set is the precision.** A component the value did not state is absent from the returned `DateParts` rather than present and `undefined`, and nothing is zero-filled, so `Object.keys()` recovers exactly what the sender wrote. There is no `precision` key because the key set is one, and no `raw` or `valid` key because parse bookkeeping is not a calendar component.

**The keys are SINGULAR, and the decoded types are plural.** `DicomTime` and `DicomDateTime` spell the time fields `hours`, `minutes` and `seconds`; `DateParts` spells them **`hour`, `minute` and `second`**, and `month` is 1 to 12 rather than the JS `Date` 0 to 11. That is the rename to expect when you move from a decoded value to a converted one, and it is deliberate: it is the shape `Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject` accept, so deleting `offsetMinutes` leaves an object either constructor takes with no key rename and no value adjustment.

**`toDate` never guesses a zone.** A `DT` that carried an `&ZZXX` offset converts exactly, and that stated offset beats any `assumeOffsetMinutes` the caller passes. A value with no offset converts only when the caller supplies one, an explicit `0` meaning "read this naive value as UTC". **With no stated offset and no `assumeOffsetMinutes`, the answer is `undefined`**: the host machine's zone is never read and UTC is never assumed. A non-finite `assumeOffsetMinutes` names no zone either, so it answers `undefined` rather than an `Invalid Date`, and so does a finite one so large that applying it leaves the range a `Date` represents. A `TM` states no year, so it is never an instant however determinate the caller's zone is.

```ts
toDate(parseDate("20240115").value); // undefined: neither the value nor the caller named a zone
toDate(parseDate("20240115").value, { assumeOffsetMinutes: 0 }); // 2024-01-15T00:00:00.000Z
toDate(parseDateTime("20240115133015-0500").value, { assumeOffsetMinutes: 600 });
// 2024-01-15T18:30:15.000Z: the stated -0500 wins
toDate(parseTime("133015").value, { assumeOffsetMinutes: 0 }); // undefined: a time is not an instant
```

`millisecond` is the first three digits of the stated fraction, taken verbatim and right-padded (`"5"` is 500, `"0500"` is 50, `"123456"` is 123). It is never `fractionalSeconds * 1000`, which is a binary float and cannot be trusted to the last digit. `toISO` renders those digits exactly as written, neither padded to three nor rounded, and it appends `Z` for a stated zero offset, so it is deliberately not a byte round-trip of the wire value: `serializeDicom` remains the route that reproduces the original bytes. All three functions return `undefined` for a value the decoders marked `valid: false`, and none of them throws for any input.

**An impossible date converts to nothing, never to the day after it.** The decoders range-check each component on its own, so a `DA` of `18700230` decodes with `valid: true` and `day: 30`; the conversion surface reads the components together and refuses the whole value, because `"1870-02-30"` is a string every ISO-8601 reader silently moves to 2 March and the instant for it is a date of birth off by a day. The rule covers a month outside 1 to 12, a day outside the one its month really has (full 4/100/400 leap rule, so 29 February 2100 is refused and 29 February 1600 is not), an hour, minute or second out of range, and a component that is not a whole number. **`second: 60` is refused with them**, even though `TM` and `DT` permit it for a leap second: there is no ISO rendering of it a reader does not move, and no instant to build. It is refused in the projection only. `parseTime`, `parseDate` and `parseDateTime` are unchanged and still report what the sender wrote, so the bytes are never lost, and this rule binds a hand-built value exactly as it binds a decoded one.

```ts
toObject(parseDate("18700230").value); // undefined: February has no 30th
toISO(parseDate("18700431").value); // undefined: April has no 31st
toDate(parseDate("18700230").value, { assumeOffsetMinutes: 0 }); // undefined, never 2 March
parseDate("18700230").value.day; // 30: the decoder is untouched
```

The cross-package aliasing example for `toObject`, `toISO` and `toDate` is in `README.md`, under `#### Dates and times`.

### Error Handling

The library throws five typed errors, all exported from the package barrel. Warnings are data rather than throws unless you ask otherwise: a profile's `escalate` list promotes only the codes it names.

#### `DicomParseError`

Thrown by `parseDicom` on one of the 4 Tier-3 fatal codes. Carries the byte position, the **frame** that position is counted in, a registry-composed message, and a 16-byte hex `snippet` of the source. **The message is looked up in a frozen registry and its factories take no tag, no wire-length parameter and no count of the bytes left in the buffer**, so none of them can be interpolated. The reason is not that such a fatal fires only on a lying length field: it fires on an honestly truncated file too, where nothing is fabricated and the transport simply lost bytes. Measured on a spec-clean object cut short by two bytes, `ELEMENT_LENGTH_EXCEEDS_BUFFER` raises with every declared length in the file honest. The bound covers both because the withheld numbers are four bytes a sender wrote either way, and because on the desynchronized reading those four bytes are somebody's name: an under-declaring `ST` carrier holding `"MR BRAIN SMITHSON "` once rendered `declared length=1330858068`, which is `"THSO"`.

`err.byteOffset` locates the element, and **`err.offsetFrame` says which coordinate system that number is counted in** (`OFFSET_FRAMES`: `"input"`, `"inflated-dataset"`, `"value-slice"`). Only in `"input"` is it an index into the buffer you passed in. A defined-length Sequence Item is parsed from a slice, so an offset raised inside one counts from that Item, and the same file reports `0`, `24` or `40` for the same defect depending on where in the Item it sits. **Where a slice begins is deliberately not published**, because the distance between two frames is a declared Value Length off the wire. The frame is in the `Error.message` suffix too, which now reads `(offset=N frame=F)`, so a string match on that suffix stops matching. `err.code` is unchanged. `DicomParseWarning.position` still carries no frame beyond its `deflated` flag, and `Element.byteOffset` carries none at all: both are pre-existing and neither is closed here. On every fatal but one the snippet is raw input, cut in the frame that offset is counted in: treat it as PHI and redact it at your own boundary. The exception is `UNSUPPORTED_TRANSFER_SYNTAX`, where the slot carries PS3.6's own name for the unsupported UID (`"RLE Lossless"`) when the registry publishes one, and 16 raw bytes only when it does not. That is deliberate, it predates the frame, and it is named here rather than left to a universal that would be false on the first code a compressed object reaches.

```ts
import { parseDicom, DicomParseError, FATAL_CODES } from "@cosyte/dicom";

try {
  parseDicom(Buffer.alloc(0));
} catch (err) {
  if (err instanceof DicomParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
    // …
  }
}
```

#### `DicomValueError`

Thrown only by `image.frame(i)`: `FRAME_INDEX_OUT_OF_RANGE` for an index outside `[0, numberOfFrames)`, or `MISSING_REQUIRED_FUNCTIONAL_GROUP` when an enhanced object lacks a required geometry macro in both the Per-Frame and Shared groups. Value decode (`element.value`) never throws. It warns and returns `null`/typed-absent instead.

#### `DicomSerializeError`

Thrown by `serializeDicom` for `MISSING_TRANSFER_SYNTAX` (the dataset names no transfer syntax to write in) or `UNSUPPORTED_TRANSFER_SYNTAX`.

#### `ProfileDefinitionError` · `DeidentifyError`

`defineProfile()` throws `ProfileDefinitionError` for a structurally invalid profile; `deidentify()` throws `DeidentifyError` (`INVALID_OPTIONS`) for an unknown Retain option or malformed UID root. Both messages carry only structural facts (option names, the UID root), never a decoded value.

---
"@cosyte/dicom": minor
---

Add `toObject`, `toISO` and `toDate`, one conversion surface over the decoded `DA`, `TM` and `DT`
values, so reading a timestamp out of an object no longer means writing a per-type projection at
every call site.

`parseDate`, `parseTime` and `parseDateTime` decode three separate wire syntaxes into three separate
shapes. The three new functions take any of them and answer in one shape: the calendar components,
an ISO-8601 string, or an absolute-instant `Date`. `DateParts` and `ToDateOptions` are exported
beside them. Nothing existing moves: the decoders, their `legacy` and `nonstandardOffset` flags and
`DicomDate` / `DicomTime` / `DicomDateTime` are all unchanged, and the package still takes no
dependency of any kind.

The same three names, with the same meanings, are exported by every `@cosyte/*` parser that decodes
a date, so they collide on import by design. A file that reads two of them aliases
(`import { toISO as dicomToISO } from "@cosyte/dicom"`) or namespace-imports; `README.md` and the
typed-values page both show the pattern.

Three decisions in the surface are worth knowing before you depend on it.

- **The key set is the precision.** A component the value did not state is absent from `DateParts`
  rather than present and `undefined`, and nothing is zero-filled, so `Object.keys()` recovers what
  the sender wrote. There is no `precision` key because the key set is one, and no `raw` or `valid`
  key because parse bookkeeping is not a calendar component. `toISO` truncates the same way: a `DT`
  that stated only an hour renders `2024-01-15T13`, never a padded-out `T13:00:00`.
- **The keys are singular where the decoded types are plural.** `DicomTime` and `DicomDateTime`
  spell the time fields `hours` / `minutes` / `seconds`; `DateParts` spells them `hour` / `minute` /
  `second`, and `month` is 1 to 12 rather than the JS `Date` 0 to 11. That is the shape
  `Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject` accept, so deleting
  `offsetMinutes` leaves an object either constructor takes with no key rename.
- **`toDate` never guesses a zone.** A stated `&ZZXX` offset converts exactly and beats any
  `assumeOffsetMinutes` the caller passes. With no stated offset, the caller's assumption is the
  only route to an instant, an explicit `0` meaning "read this naive value as UTC". With neither,
  the answer is `undefined`: the host machine's zone is never read and UTC is never assumed. A `TM`
  states no year, so it is never an instant at all.

`millisecond` is derived from the digits in `raw`, taken verbatim and right-padded (`"5"` is 500,
`"0500"` is 50, `"123456"` is 123), and never from `fractionalSeconds`, which is a binary float.
`toISO` renders those digits exactly as written, neither padded to three nor rounded. A stated zero
offset renders `Z`, so `toISO` is deliberately not a byte round-trip of the wire value;
`serializeDicom` remains the route that reproduces the original bytes.

The retired dotted `YYYY.MM.DD` date converts identically to the canonical form, and the `legacy`
flag the decoder reports beside the value never reaches a result. All three functions answer
`undefined` for a value the decoders marked `valid: false`, for `null` and `undefined`, and for a
value that stated no component at all, and none of them throws for any input.

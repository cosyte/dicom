---
"@cosyte/dicom": patch
---

A caller can name the character set to read text under when a Data Set declares none: the `fallbackCharacterSet` option of `parseDicom`, `readDicomHeader` and `toDicomJson`.

- Files that write Latin-1 names with no `(0008,0005)`, or an empty one, read those letters as
  U+FFFD since the default repertoire became ISO-IR 6 (PS3.5 section 6.1.2.1), and `toDicomJson`
  refused them. With `{ fallbackCharacterSet: "ISO_IR 100" }` they read by the ISO 8859-1 table,
  with no `DICOM_CHARSET_BYTES_UNDECODABLE` for a byte the set defines. The default is unchanged.
- The option takes one term of the new `FALLBACK_CHARACTER_SETS` export (type
  `FallbackCharacterSet`): `ISO_IR 6`, a single-byte `ISO_IR` set, or `ISO_IR 192`. It applies
  where `(0008,0005)` is absent or empty, in a Sequence Item too, and where it names a term we do
  not decode only with `fallbackCharacterSetForUnknown: true`. A declared set is read as declared.
- A parse that reads text under the fallback adds one `DICOM_CHARSET_ASSUMED` warning, a new code,
  at the first such element, naming its tag and no text. Like `DICOM_PARSE_STOPPED_BEFORE_TAG`, it
  is never escalated by `strict` or a profile. A `switch` over `WarningCode` that lists every code
  needs a `default` branch for it.
- Nothing written changes: `Element.rawBytes` keeps the bytes, `serializeDicom` writes them back,
  and no `(0008,0005)` is added. `Element.specificCharacterSet` names the assumed set.
- A value outside the list is refused before anything is read: `parseDicom` and `readDicomHeader`
  throw a `TypeError` whose `code` is `"DICOM_INVALID_OPTION"`, and `toDicomJson` a
  `DicomJsonError` with the new code `INVALID_OPTION`. A `switch` over `DicomJsonErrorCode` that
  lists every code needs a case or a `default` branch for it.
- The docs say what to do with files in the later Greek and Hebrew editions (ISO 8859-7:2003 and
  ISO 8859-8:1999), whose added characters still read as U+FFFD under `ISO_IR 126` and
  `ISO_IR 138`.

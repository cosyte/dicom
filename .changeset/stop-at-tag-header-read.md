---
"@cosyte/dicom": patch
---

New `readDicomHeader` and `ParseOptions.stopBeforeTag` read a file's header without reading its Pixel Data into memory.

- **`readDicomHeader(source, options?)`** (new export) reads from a file path, a `file:` URL, a
  file handle or an async iterable of bytes (a Node stream or a web `ReadableStream`), only as far
  as the first top-level element at or after the stop tag, Float Pixel Data `(7FE0,0008)` by
  default, and returns the Dataset `parseDicom` gives on the whole file with that stop. It reads
  64 KiB first and twice as much each time the header is longer. A Deflated file, a file with
  nothing at or after the stop tag, and a file the parser refuses are still read whole. The types
  `DicomByteSource` and `DicomFileHandle` are exported with it.
- **`ParseOptions.stopBeforeTag`** (new option) stops `parseDicom` before the first top-level
  element whose tag is at or after the one given, as eight hexadecimal digits. Every element
  before it is read exactly as a full parse reads it, and nothing after it is read, so a file cut
  short inside its Pixel Data still parses. Only the top-level Data Set stops; Sequence Items are
  read whole.
- **`DICOM_PARSE_STOPPED_BEFORE_TAG`** (new warning code) ends `ds.warnings` when a parse stops,
  positioned at the element it stopped before. It is never escalated, under `strict` or by a
  profile. A `switch` over `WarningCode` with a `default` branch needs no change.

Nothing changes for a caller who passes neither: a parse without `stopBeforeTag` reads exactly as
before.

---
"@cosyte/dicom": patch
---

New subpath `@cosyte/dicom/arbitraries`: the fast-check generators we test the parser with, for testing code you build on it.

- It exports `wellFormedModel()` and `encodeModel()`, a well-formed Data Set as a plain value and
  its Part 10 bytes; `recoverableInput()`, files with one deviation the reader recovers from;
  `fatalInput()`, input the reader refuses; `truncatedValidFile()`, `arbitraryBytes()`,
  `dicomShapedGarbage()` and `fuzzInput()`; and the types `DicomModel` and `ModelElement`.
  The docs page "Property testing with our generators" shows each one.
- `fast-check` 4 is an optional peer dependency: install it to use the subpath. The main entry
  point, `@cosyte/dicom`, never loads it, and nothing a caller of it does needs to change.
- Every generated value is synthetic; nothing in one comes from a patient.

---
"@cosyte/dicom": patch
---

`deidentify()` now writes `(0012,0064)` De-identification Method Code Sequence on every run, beside
the `(0012,0063)` text, so a consumer can read which Profile and Options produced an object from
codes instead of parsing English, and can tell the two PS3.15 §E.3.6 temporal branches apart by
`113106` and `113107`.

PS3.15 2026c §E.1.1 asks for "one or more codes from CID 7050 "De-identification Method"
corresponding to the Profile and Options used ... and/or a text string". The text already satisfied
the "and/or", so this is the machine-readable half rather than a conformance fix.

- **What is written.** A top-level `SQ` with an Item for each code from PS3.16 2026d CID 7050
  (context group version `20170914`, UID `1.2.840.10008.6.1.925`): `113100` Basic Application
  Confidentiality Profile first, then an Item for each active Option in `DEIDENTIFY_OPTIONS` order,
  whatever order `retain` names them in. Each Item carries exactly Code Value, Coding Scheme
  Designator `DCM` and Code Meaning.
- **Added to, never replaced.** A prior `(0012,0064)` the source carried keeps every Item, in order
  and byte for byte, and this run's Items follow. A code a prior Item already records under the same
  designator and value is not added again, so de-identifying an output again with the same options
  is a fixed point.
- **New public export** `DEIDENTIFICATION_METHOD_CODES` (with the `DeidentificationMethodCode` type)
  carries the CID 7050 rows, the context group UID and version, and the code each Option writes.
- **Two new stable warning codes on `report.warnings`**, never on `Dataset.warnings`:
  `DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED` when prior Items were kept (neither `(0012,0064)` nor
  the code attributes in its Items has a Table E.1-1 row, so what a sender wrote there reaches the
  output un-inspected, and no prior code is checked against CID 7050), and
  `DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED` when a prior `(0012,0064)` was not a Sequence of Items
  this run could read and was replaced by this run's codes. Neither message carries the prior's bytes
  or VR. `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` keeps its published meaning, `(0012,0063)` only.

**Limits, stated with the capability.** `113101` Clean Pixel Data Option and `113102` Clean
Recognizable Visual Features Option are never written, because this layer does not touch pixels.
`113107` says the modified-dates column was resolved, not that any date was shifted: the same limit
`(0028,0303) = MODIFIED` carries, and `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` still rides with it. An
Option's code means the Option was active, whether or not the object carried an attribute it acts
on, and a caller's `deidentificationMethod` text never changes the codes. Only the top-level
attribute is written or read. `(0012,0062)`, `(0012,0063)` and `(0028,0303)` are written exactly as
before.

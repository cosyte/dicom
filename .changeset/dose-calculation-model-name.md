---
"@cosyte/dicom": patch
---

The data dictionary and the de-identification action table are now generated from the **PS3.6 and
PS3.15 2026d** DocBook, re-pinned together under `vendor/nema/` by SHA-256. PS3.5 stays at 2026c.

- **`deidentify()` now removes Dose Calculation Model Name `(3004,007F)` under the Basic Profile
  (`X`), and cleans it under `CleanDescriptors` (`C`)**, at the top level and inside Sequence Items
  alike, and the report audits it. 2026d adds that attribute to Table E.1-1; against the 2026c table
  it had no row, so it was kept verbatim under every Option with a report that said nothing about
  it. No other Option changes its treatment.
- **`Dictionary.lookup("3004007F")`** now returns `DoseCalculationModelName`, VR `LO`, VM `1`, so an
  Implicit VR Little Endian object reads that element as `LO` rather than `UN`.
- **The report name for `(0018,11BB)` changes case**, from "Acquisition Field Of View Label" to
  "Acquisition Field of View Label", as 2026d prints it. Its action codes (`D`, and `C` under
  `CleanDescriptors`) do not change. A caller matching `DeidentifiedAttribute.keyword` for that tag
  on the old spelling needs the new one.

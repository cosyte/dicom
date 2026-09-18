---
"@cosyte/dicom": patch
---

Add `RetainLongitudinalTemporalModifiedDates`, the second PS3.15 §E.3.6 Retain Longitudinal Temporal
Information Option, so a caller running a longitudinal study can keep the temporal relationships
their analysis needs without keeping real dates.

§E.3.6 defines **two** mutually exclusive Options and Table E.1-1 gives them separate columns. This
package published one name, carrying the full-dates column, so the modified-dates column was
unreachable and `(0028,0303) Longitudinal Temporal Information Modified` could never say `MODIFIED`.

- **`RetainLongitudinalTemporalModifiedDates`** resolves Table E.1-1's `Rtn. Long. Modif. Dates Opt.`
  column, which is the more protective of the two on every attribute where they differ: full dates
  keeps the real value, modified dates cleans it. An attribute the modified-dates column publishes no
  action for takes the Basic Profile action, never the full-dates one and never a keep.
- **`(0028,0303)` takes the value `MODIFIED`** on that branch, replacing whatever the source carried
  there, exactly as `REMOVED` and `UNMODIFIED` do.
- **A Value naming the Option is added to `(0012,0063)` De-identification Method**, inside `LO`'s
  64-character per-Value maximum like every other name this library writes there.
- **The two temporal Options are mutually exclusive.** A call naming both is rejected with a
  `DeidentifyError` carrying the existing `INVALID_OPTIONS` code. Either one alone is accepted, and
  `RetainLongitudinalTemporal` is unchanged in both respects: it still resolves the full-dates column
  and still writes `UNMODIFIED`.

**This library performs no date transformation, and says so at run time.** §E.3.6 has two halves: the
Table E.1-1 column, and a requirement that the dates themselves be modified with the manner of
modification described in a Conformance Statement. A library can deliver the first and neither of the
second, because PS3.2 Annex N scopes a Conformance Statement to a named product and version. So
**you** perform the transformation, and a `MODIFIED` on an object whose dates nobody shifted is a
defect this package cannot detect. Every run under the new Option raises the new stable warning code
`DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on `report.warnings`, stating the half of §E.3.6 the run did
not discharge. Nothing here claims PS3.15 Annex E conformance for the Retain Longitudinal Temporal
Information With Modified Dates Option, which §E.1.1 makes all-or-nothing.

`DICOM_DEIDENT_DATES_NOT_TRANSFORMED` is added to `WARNING_CODES` and is raised by `deidentify()`
only: it is a statement about the run's options rather than about the file, so it never reaches
`Dataset.warnings` and a `{ strict: true }` parse of the same input is unaffected. No published code
is renamed or retired, no coded Item is added to `(0012,0064)`, and what the Basic Profile retains
with neither temporal Option active is unchanged.

---
"@cosyte/dicom": minor
---

Write `(0028,0303) Longitudinal Temporal Information Modified` on every `deidentify()` run, so a
de-identified object says what happened to its dates instead of leaving a recipient to guess.

PS3.15 2026c §E.2 requires the attribute with a Value of `REMOVED` "if none of the Retain
Longitudinal Temporal Information Options is applied", and §E.3.6 requires `UNMODIFIED` under the
Full Dates Option. This package wrote it in neither state through `0.0.19`, so a receiver reading
dates could not tell real ones from scrubbed ones - and guessing wrong hurts in both directions:
treating real dates as scrubbed under-protects the patient, and treating scrubbed dates as real
corrupts a longitudinal analysis. Both states are written now.

- **`REMOVED`** on a run with no Retain Longitudinal Temporal Information Option active, which is the
  default.
- **`UNMODIFIED`** on a run with `RetainLongitudinalTemporal` active, which is this package's name
  for §E.3.6's Full Dates Option.

**It is REPLACED rather than added to.** The attribute is `VM 1` and both clauses say the value
"shall be added to the Data Set with a Value of" one named state, so a `(0028,0303)` the source file
already carried is discarded - including one under another VR or holding a value the standard does
not define. That is the opposite of what `(0012,0063)` does with a prior method text, and the
asymmetry is the standard's: joining two temporal states into one single-valued attribute would leave
a recipient reading a state no run produced. Re-de-identifying an object always leaves exactly one
`(0028,0303)`, holding the latest run's state.

**The third state, `MODIFIED`, arrives in the same release**, under §E.3.6's With Modified Dates
Option. See the entry for `RetainLongitudinalTemporalModifiedDates`, which adds that Option's Table
E.1-1 column, the option name that selects it, and the disclosure that this library resolves the
column and performs no date transformation.

Nothing else moves. `(0012,0062)` and `(0012,0063)` are unchanged, the published warning-code set is
unchanged, no warning code is added or retired, and `DeidentifyReport` keeps its shape - like
`(0012,0062)`, this is a statement the object makes about itself and it is not reported there. The
declaration is written into the **top-level** Data Set only, which is where §E.2 and §E.3.6 put it;
`(0028,0303)` has no row in Table E.1-1, so a copy nested in a Sequence Item is retained by omission
like every other unlisted attribute and still says whatever the sender wrote.

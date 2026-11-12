---
"@cosyte/dicom": patch
---

`ds.patient` now reads a non-human patient's species, breed, neutered status and responsible person, tolerantly, reporting what it cannot read by code.

- New optional fields on `PatientView`: `speciesDescription` `(0010,2201)`, `speciesCode`
  `(0010,2202)`, `sexNeutered` `(0010,2203)`, `breedDescription` `(0010,2292)`, `breedCode`
  `(0010,2293)`, and `responsiblePerson` with `name` `(0010,2297)`, `role` `(0010,2298)` and
  `organization` `(0010,2299)`. The species and breed codes are read through `readCode`.
- New optional `PatientView.issues`: present only when one of those attributes could not be read
  as written (a VR the value does not decode from, a neutered status other than `ALTERED` or
  `UNALTERED`, an empty, multi-item or incomplete code sequence). Nothing throws.
- New exports: the types `ResponsiblePerson`, `PatientIssue` and `PatientIssueCode`, and the frozen
  registry `PATIENT_ISSUE_CODES`. New generator `animalPatientInput()` at
  `@cosyte/dicom/arbitraries`.
- A caller changes nothing: on an object without these attributes, `ds.patient` has the same fields
  as before. Code that builds its own `PatientView` value still compiles, since every new field is
  optional. The cookbook's "Read a veterinary patient" recipe shows each field.

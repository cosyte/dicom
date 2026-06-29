---
"@cosyte/dicom": patch
---

Phase 4 — safety-critical domain helpers. Adds the `Dataset` accessors `patient` / `study` /
`series` / `image` returning typed, fail-safe views over the DICOM §4 safety-critical attributes:
the patient/study/series identity tuples (Patient ID never treated as globally unique; Other Patient
IDs and Issuer Qualifiers surfaced; `PN` kept structured), and the pixel-interpretation + geometry
metadata a renderer needs without guessing. Safety-critical omissions are load-bearing: `rescaleSlope`
is absent (not `1`) when absent, `signed` is absent (never guessed) unless Pixel Representation was
present, `photometricInterpretation` is never defaulted to `MONOCHROME2`, and the three pixel-spacing
tags are distinct, never aliased. Resolves Enhanced multi-frame functional groups per frame
(Per-Frame-else-Shared) via `image.frame(i)`, throwing a new `DicomValueError` for an out-of-range
frame or a required geometry macro missing from both groups (its message carries only structural
facts — never a decoded value). Also adds the coded-triplet reader `readCode` + `codingSchemeOid` /
`CODING_SCHEME_OIDS` (the four standard scheme OIDs; legacy SNOMED designators deliberately do not
resolve to SCT, CP-730). New public types: `PatientView`, `StudyView`, `SeriesView`, `ImageView`,
`OtherPatientId`, `CodedConcept`, `RealWorldValueMap`, `FrameFunctionalGroups`, `ValueErrorCode`.

---
"@cosyte/dicom": patch
---

Phase 3 — VR value decode + dataset navigation. `Element.value` lazily decodes (and memoizes) raw
bytes into a typed, fail-safe `DicomValue` across all 34 VRs (numbers, 64-bit bigints, attribute
tags, person names, strings, text, numeric strings, temporal values, sequences, raw binary), honoring
`(0008,0005)` Specific Character Set with term-list corrections. Adds the `Dataset`/`Item`
`get`/`has`/`elements`/`getAll` navigation API and the public decode helpers + value types.

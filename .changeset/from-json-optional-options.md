---
"@cosyte/dicom": patch
---

**`fromDicomJson` takes its options as optional.** `fromDicomJson(json)` now writes the Data Set under Explicit VR Little Endian (`1.2.840.10008.1.2.1`) with no other File Meta element, where the options object and its `fileMeta` were required. A call that passes `fileMeta` is unchanged.

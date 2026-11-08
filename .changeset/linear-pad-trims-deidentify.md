---
"@cosyte/dicom": patch
---

`deidentify()` and `Dataset.directory` now strip a value's padding in linear time, so a long run of NULL or SPACE bytes in a file no longer stalls them for seconds.

Seven trims of file-controlled text used patterns that backtracked quadratically on a run of pad bytes ending in any other byte: the NULL trim of every UID `deidentify()` remaps, its reads of a Private Creator, a Block Identifying Information Status and the Burned In Annotation flag, and the DICOMDIR's reads of its `CS` values. A SOP Instance UID of 50,000 NULL bytes and one letter took `deidentify()` close to four seconds, and the time grew with the square of the run. Each trim now scans the value once from its end, or from each end, and returns the same result as before.

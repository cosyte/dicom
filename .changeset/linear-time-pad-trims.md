---
"@cosyte/dicom": patch
---

Parsing or de-identifying a crafted file can no longer take quadratic time in seven places that trim pad bytes, so a long run of them no longer stalls `parseDicom()` or `deidentify()`.

Each place trimmed a value the file controls with a pattern that backtracked quadratically on a long run of pad bytes followed by any other byte: the trailing pad and the per-value spaces of each DICOMDIR record's Directory Record Type (0004,1430) and Referenced File ID (0004,1500), which `parseDicom()` reads; and, in `deidentify()`, the pad of each Private Creator, of the Block Identifying Information Status (0008,0303) of a declared private block, of Burned In Annotation (0028,0301), and of each UID it remaps and counts. Each now scans the value once from its end and returns the same result as before.

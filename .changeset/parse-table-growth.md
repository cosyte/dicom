---
"@cosyte/dicom": patch
---

When `parseDicom` grows its internal table of elements, the new table is now twice the size the next element needs, where it was the larger of that need and twice the old table's size.

Growth is still geometric, so a parse copies each entry a bounded number of times. What a parse returns is unchanged.

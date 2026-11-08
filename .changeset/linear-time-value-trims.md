---
"@cosyte/dicom": patch
---

Decoding a string value now takes time linear in its length, so a long run of spaces, digits, or pad bytes no longer stalls `Element.value` or `parseSpecificCharacterSet()` for seconds.

Three checks on file-controlled text used patterns that backtracked quadratically on such a run: the trim of each value of a multi-valued string VR, the DS number grammar, and the trim of each Specific Character Set term. Each now scans the value once from each end and returns the same result as before. De-identification also strips every asterisk from the conditional action branch it takes, not only the first; no row of the Annex E table puts one there today, so no output changes.

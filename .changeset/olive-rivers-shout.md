---
"@cosyte/dicom": patch
---

Stop the PHI gate's scan route handing a target's bytes to a regular expression. The tag and text
sweeps now leave nothing in V8's legacy `RegExp` statics, where the whole of a scanned page and an
unexcerpted matched name were readable after a scan. Reported hits are unchanged, byte for byte.

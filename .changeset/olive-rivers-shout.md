---
"@cosyte/dicom": patch
---

Stop the PHI gate handing a scan target's bytes to a regular expression, so a scanned file's
contents and a matched patient name are no longer readable from V8's legacy `RegExp` statics after
the scan. Reported hits are unchanged, byte for byte.

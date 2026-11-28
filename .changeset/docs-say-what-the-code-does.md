---
"@cosyte/dicom": patch
---

**The README and doc comments say what the package does.** The README named one entry point where there are two (`@cosyte/dicom/arbitraries` holds the generators), and said the package reads no file, where `readDicomHeader` given a path opens that file. The `Dataset` docs named edit methods it does not have. The doc comments of `SerializeErrorCode`, `ValueErrorCode`, `PatientIssueCode`, `FatalCode`, and `WARNING_CODES` now say each code set is open, so a `switch` over one needs a `default` branch.

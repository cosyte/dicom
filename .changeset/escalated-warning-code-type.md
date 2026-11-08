---
"@cosyte/dicom": patch
---

`DicomParseError.code` is now typed `FatalCode | WarningCode`, because an escalated warning is thrown with its own warning code.

`{ strict: true }` and a profile's `escalate` list have always thrown a `DicomParseError` whose `code` is the escalated warning's code, such as `DICOM_MISSING_PREAMBLE`, but the type declared a member of `FATAL_CODES`, so a `switch` the compiler called exhaustive fell through on every escalated warning. The runtime behavior is unchanged. Code that compares `err.code` to a fatal code still compiles; code that assigns `err.code` to a `FatalCode` now needs a check first, such as `err.code in FATAL_CODES`. Treat any code outside `FATAL_CODES` as an escalated warning and give a `switch` over `err.code` a `default` branch. The `WarningCode` documentation now recommends a `default` branch too, since the warning registry grows between releases.

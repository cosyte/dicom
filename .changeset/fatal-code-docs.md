---
"@cosyte/dicom": patch
---

The README now says a file cut short mid-element throws `INVALID_FILE_META`, instead of naming a fatal code the package does not have.

The fatal codes are the four in `FATAL_CODES`. The README, the troubleshooting page, the tolerance notes and the `FatalCode` JSDoc example now say that `INVALID_FILE_META` covers a Data Set that is cut short or malformed as well as an unreadable File Meta group, and that the message text, not a separate name, says which reason applies. No behavior changes.

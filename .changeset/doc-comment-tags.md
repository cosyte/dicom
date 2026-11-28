---
"@cosyte/dicom": patch
---

**Doc comments mark what is internal and name each error type one way.** The 174 exports of internal modules that neither entry point exports carry `@internal`, and the examples on 21 of them, which imported names `@cosyte/dicom` does not export, are removed. Each `@throws` names its error type as `@throws {Type}`. Nothing the package exports changes.

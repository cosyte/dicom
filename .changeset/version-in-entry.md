---
"@cosyte/dicom": patch
---

**`VERSION` is declared in the package entry point.** It moved from a module of its own into `src/index.ts`, where the release writes it with the shared version tool, and it still equals the `version` in `package.json`. Nothing changes for a caller: the export, its type and its value are the same.

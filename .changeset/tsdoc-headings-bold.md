---
"@cosyte/dicom": patch
---

**Doc comments carry no Markdown headings.** The doc comments of `FileMeta.extraElements` and of the de-identification findings `FileMetaDroppedElement`, `Group0004Removal`, `UndefinedVrFinding`, `UnenumerablePrivateRemoval`, and `UnregisteredElementRemoval` used Markdown headings, which an editor's hover and a generated API page show as headings of their own. Each is now a bold line, with the same words.

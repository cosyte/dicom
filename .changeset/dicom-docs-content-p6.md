---
"@cosyte/dicom": patch
---

Bring `docs-content/` to the full canonical Diátaxis spine (DOCS-CONTENT-P6): add Installation,
Quickstart, five Core Concepts notes, a Guides cookbook, and Troubleshooting — all gated to the
package's metadata-first surface, with the explicit non-goals (no pixel decode, no DIMSE, no
DICOMweb) named. Every runnable snippet is executed against the built package by a new
doc/code-agreement gate (`docSnippetSuite()` from `@cosyte/vitest-config/snippets`). Also corrects
the element-access examples in `intro.md` to the tag-only `get`/`has` surface and bumps the
`@cosyte/vitest-config` devDependency to `^0.0.2`.

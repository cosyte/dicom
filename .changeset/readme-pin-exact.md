---
"@cosyte/dicom": patch
---

The README's install command now pins the exact version (`pnpm add --save-exact @cosyte/dicom`), and a new sentence says why: every release below 1.0 is a patch, a breaking change included, so a caret range does not protect you from one.

An entry in this changelog for a change you must act on has a paragraph that opens `What a caller must change:`. The installation page's `npm install` command pins the exact version too.

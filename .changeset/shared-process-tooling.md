---
"@cosyte/dicom": patch
---

The package now builds with tsup 9 through `@cosyte/process`. The JavaScript is byte-identical, and the API is unchanged.

The `.d.ts` and `.d.cts` files list type-only exports in their own `export type {}` statements, and the source maps embed two source files Prettier 3.9 reformatted. No code or behavior changes.

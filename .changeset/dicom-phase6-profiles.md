---
"@cosyte/dicom": patch
---

Phase 6 — source/vendor profile system. New `defineProfile()` factory + `parseDicom(buf, { profile })`
wiring let a parse opt into a composable, immutable `Profile` that only tightens or annotates: warning
`escalate` / `suppress` posture plus a private-creator-keyed overlay that resolves the Implicit VR of
vendor private data elements by the file's live creator string (canonical `"GGGGxxLL"` key, PS3.5
§7.8.1 — never a hard-coded block). Five built-ins ship under the frozen `profiles` namespace (`ge`,
`siemens`, `philips`, `strict`, `lenient`). An unrecognized creator degrades to `UN` plus the now-active
`DICOM_PRIVATE_CREATOR_UNKNOWN` warning — never a wrong decode. New exports: `defineProfile`,
`profiles`, `ProfileDefinitionError`, and types `Profile` / `PrivateTagDefinition` /
`DefineProfileOptions` / `ProfilePrivateTags`; `ParseOptions` gains an optional `profile`.

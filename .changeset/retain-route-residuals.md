---
"@cosyte/dicom": patch
---

Correct the disclosed extent of the surviving `RetainSafePrivate` retain-route leak
(`DICOM-RETAIN-ROUTE-RESIDUALS`). Six artifacts described it as "a private carrier whose profile
entry declares a binary VR"; the predicate is actually "anything the profile does not declare `SQ`",
because every other answer falls through to the ordinary keep path, where the embedded-attribute
scanner reads string carriers only and decodes tiles in the file's own encoding. A profile entry
declaring `LO` over a carrier the sender wrote `OB` ships the identical nested `(0010,0010)`. The
prose enumeration is deleted rather than reworded, and a measured declared-VR x wire-VR x transfer-
syntax matrix pins the surface instead. No `src/` predicate changes: the behaviour is
`PRE-EXISTING` and identical before and after. The matrix also strengthens the `DICOM-PRIVATE-SQ-PARSE-VR`
closure beside it, proving it on all four wire VRs and both encodings rather than on one cell.

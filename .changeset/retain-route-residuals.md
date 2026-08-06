---
"@cosyte/dicom": patch
---

Correct the disclosed extent of the surviving `RetainSafePrivate` retain-route leak
(`DICOM-RETAIN-ROUTE-RESIDUALS`). Six artifacts described it as "a private carrier whose profile
entry declares a binary VR". The predicate has two conjuncts and that wording named neither: the
profile does not declare `SQ`, and the embedded-attribute scanner cannot read the value (it reads
string carriers only, and decodes tiles in the file's own encoding). The two sets are incomparable,
not nested - a profile entry declaring `LO` over a carrier the sender wrote `OB` ships the identical
nested `(0010,0010)`, while one declaring `OB` over a carrier written `LO` is emptied. The
prose enumeration is deleted rather than reworded, and a measured matrix pins the surface instead:
declared VR against encoding, and against wire VR under Explicit VR only, because Implicit VR LE
writes no VR at all. No `src/` predicate changes: the behaviour is `PRE-EXISTING` and identical
before and after. The matrix also strengthens the `DICOM-PRIVATE-SQ-PARSE-VR` closure beside it,
proving it on five distinct inputs rather than on the one cell that opened it.

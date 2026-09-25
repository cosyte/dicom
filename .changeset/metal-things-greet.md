---
"@cosyte/dicom": patch
---

Correct the troubleshooting remedy for `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE`: a value the file's own `(0008,0300)` declaration names safe is retained, not removed.

The remedy said that, beyond the three cases the package enumerates, every private value a `Profile` vouched for under `RetainSafePrivate` is removed, an ordinary scalar under an ordinary string VR included. That was false whenever the file's own Private Data Element Characteristics Sequence `(0008,0300)` names the value safe, in a block whose status is `SAFE` or listed individually in a `MIXED` one: `deidentify()` retains that value on the sender's word, and `report.unenumerablePrivateRemovals` does not record it. The guide now names that route and keeps the removal statement for everything outside it. No behaviour changes.

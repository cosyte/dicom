---
"@cosyte/dicom": patch
---

🩺 `DeidentifyReport`'s `contextPath` was documented as structural and it is not: a segment is
`TAG[index]` and the tag half is read off the wire, bound by neither a shape test nor a closed table.
A file whose under-declared Value Length desynchronizes the reader onto four bytes inside somebody's
value, followed by `SQ`, gets that fabricated sequence descended and its fabricated tag published in
every `contextPath` beneath it. Measured on a synthetic `LO` carrier holding `"MRS BRAIN SMITHSON"`:
`contextPath: ["53484E4F[0]"]`, which is `"HSON"` in wire order, with no warning raised and every
finding array empty. **Redacting it is a logging fix and not an object fix**: on that same file the
de-identified object still carries the fabricated `(5348,4E4F)` and the serializer writes `"HSON"`
back out under a `Patient Identity Removed = YES` stamp, which is the already-disclosed
under-declared carrier class and not this field. The claim is corrected in the type, the tolerance table and the
troubleshooting guide, and `contextPath` is added to the report's list of fields that are not
value-free; no guard was widened, because withholding the tag would destroy the audit on every
well-formed file to bound a malformed one. `PRE-EXISTING`; no runtime behaviour changes. **Treat
`contextPath` as PHI when the source is untrusted.**

The `DICOM_ITEM_CROSSES_SEQUENCE_END` disclosure no longer says `contextPath` names "an item it was
never in" - that asserts which of two byte-identical files you have. It is deleted rather than
reworded a third time, and replaced by the two measurements that were already pinned.

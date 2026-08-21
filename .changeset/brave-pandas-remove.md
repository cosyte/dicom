---
"@cosyte/dicom": patch
---

Remove a retained private value this run did not enumerate, instead of shipping it under
`(0012,0062) = YES`.

`RetainSafePrivate` plus a `Profile` used to write private values into de-identified output that the
run never looked inside. `0.0.19` disclosed that (`DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE` plus
a `report.unauditableSequences` entry stamped as kept) and said outright that the disclosure was not
a fix. It is fixed now: PS3.15 2026c §E.3.10 retains Private Attributes "known by the de-identifier
to be safe from identity leakage" and sends "all other Private Attributes" to removal or to the
`(0008,0307)` action this library does not implement, so a value nothing enumerated is removed.

**The over-redaction is the point rather than a corner case, and this is the size of it.** After this
release exactly three classes of private value reach the output: one the run **walked as Data
Elements** and put through the Annex E action table (a private `SQ` whose items the parser
materialized), a **Private Creator `(gggg,00EE)` whose whole decoded value is a member of your
profile's private dictionary**, and a **zero-length** value. Decoding a value under the VR your
profile declares for it is not enumeration, and neither is the embedded-attribute scanner's silence,
so **an ordinary vendor scalar under an ordinary string VR is removed**. If you carried opaque
vendor values through `RetainSafePrivate`, they are gone; getting them back needs the content test
that separates a nested Data Set from a legitimate binary blob, which is an open product question.

**Three things to act on if you consume the audit surfaces.**

1. **New report surface.** `report.unenumerablePrivateRemovals` records each removal per instance:
   the tag, the Data Set it lived in, `applied: "removed"` and `reason: "unenumerable"`. It is
   complete and **never capped** at any input size, which is what lets you separate an unenumerable
   removal from an Annex E one and from an emptied value; the matching warnings stay bounded.
   `report.removedPrivateTags` names these removals too, unchanged in meaning.
2. **`report.unauditableSequences` no longer produces its retired `kept` outcome** for a retained
   private value. Its `applied` field was `"emptied" | "kept"` and is `"emptied"` alone now, so an
   entry there means content is not in your output again. A comparison against the retired outcome
   stops compiling, which is the intended way to find out.
3. **`DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE` changes meaning**, from "this value was shipped
   unexamined" to "this attribute was removed unexamined". **The published warning-code SET is
   unchanged** - no code is added, removed or renamed by this work - so a consumer narrowing on that
   code name keeps compiling and must re-read what it now means rather than re-type it.

The measured matrix in `test/integration/deident-private-reservation.test.ts` flips its twenty
leaking cells from kept-verbatim to removed, on every combination of profile-declared VR and on-wire
VR it enumerates and on the VR-less Implicit VR LE encoding, and gains a mutation control that reds
if the retention decision is reverted.

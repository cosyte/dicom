---
"@cosyte/dicom": patch
---

Build every Tier-3 fatal message from a frozen registry, and cut the `{ strict: true }` snippet in
the frame its offset names (`DICOM-FATAL-MESSAGE-REGISTRY`).

Tier-2 warnings have been registry-bound for several releases; Tier-3 messages were still assembled
at the throw site out of template literals, and four of them printed four bytes of the document each.
The messages that interpolated most were the ones raised **when a length field is lying**, which is
the condition that makes a reader read bytes inside somebody's value as a Data Element header, so the
tag and the length they printed were that value. Measured on a synthetic `"MR BRAIN SMITHSON "`:
`Element 41524E49 declared length=1330858068` is `"RAIN"` then `"THSO"`, eight consecutive payload
bytes, each recoverable with one typed read.

The bound is the factory signature, matching the three Tier-2 codes that paid for this lesson before
it: the token type has **no tag field and no wire-length field**, so there is no slot for one to
travel through, and `err.byteOffset` identifies the element instead. A VR still renders when it names
one of the 34; a byte count still renders when it is bounded by the buffer being read.

Separately, `DicomParseError.snippet` is 16 raw source bytes cut at the diagnostic's own
`byteOffset`. That offset moves with the frame the element was read in, but the cut was always taken
from the whole file, so a strict-mode escalation raised inside a defined-length Sequence Item cut the
file at an item-relative number and returned **an unrelated element's** bytes. The parse context's
buffer now follows the frame at all four places this parser changes one. **The snippet is still
unredacted source bytes and is still PHI.**

**⚠ Some fatal messages are reworded, so a consumer string-matching one stops matching.** No count is
given, deliberately: a first draft said "six", a graded pass measured nine, and the honest remedy for
a count corrected once is to delete it rather than increment it. Diff `FATAL_MESSAGES` against the
previous release's template literals if you need the set. **`err.code` is unchanged on every path and
which files throw is unchanged.** Narrow on the code, never on the prose.

Three residuals are named rather than closed, each with an asserted test row: the same fabricated
header still reaches the Tier-2 `DICOM_PRIVATE_TAG_NO_CREATOR` message;
`report.embeddedAttributes[].hidden` still lists a fabricated tag alongside the real one that made
its run reportable; and because of the first, `ds.warnings[].message` is **not** unconditionally safe
to log, which the docs now say. Narrowing any of the three is a product call, not a fix.

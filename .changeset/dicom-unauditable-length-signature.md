---
"@cosyte/dicom": patch
---

The two `deidentify()` diagnostics stop rendering a raw wire length, and the PHI detector's digit
floor that hid it is gone (`DICOM-DIAGNOSTIC-PHI-RESIDUALS`)

The seventh instance of "a diagnostic about a PHI leak is itself a PHI surface", plus the tripwire gap
that made it invisible. The gap is the more valuable half.

THE DETECTOR WAS WIDENED BEFORE ANY CODE WAS TOUCHED. The `length` arm of the re-encoding detector in
`test/integration/fatal-diagnostic-surface.test.ts` skipped any rendering under seven digits, and the
sentence beside it stated the defect without seeing it: "every 4-byte window of a printable-ASCII
payload exceeds 1,000,000,000, so nothing in this fixture set is skipped by the floor." That is true
and it is the whole problem. A declared Value Length is only reachable through a parse if the buffer
really holds that many bytes, so every fabricated length a fixture can drive through this library has
zero high-order bytes and therefore a SHORT decimal. `"SO\0\0"` renders `20307`: five digits, two of
them letters of a surname, structurally under the floor. The floor was not a conservative filter on an
arm that worked. It excluded the entire class of length leak that can actually happen. A GUARD WITH A
FLOOR HAS NOT CLEARED ANYTHING BELOW THE FLOOR.

The floor is removed and the collision it was for is answered by matching instead of skipping, so the
widening is strictly additive: a rendering of seven digits or more keeps the original substring
search, and a shorter one must equal a whole maximal digit run of the message.

WHAT THE WIDENED DETECTOR FOUND, POINTED AT THE `deidentify()` CHANNEL. That channel is the one the
standing desync sweep states it can never reach, because both codes are emitted by `deidentify()` and
by nothing else while every desync fixture dies at a Tier-3 fatal first. It returned the two `{n}`
slots this release closes and nothing else. It also returned `00080008`, a literal PS3.6 row that
`renderTag`'s membership test renders on every file by design, which is scoped out of the sweep
explicitly rather than left to pass quietly.

THE REMEDY IS THE FACTORY SIGNATURE, AS IT WAS THE LAST FIVE TIMES.
`DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` rendered `{n}`
from `Element.rawBytes.length`, which is not a count this parser invented: it EQUALS the declared
Value Length off the element header. `sequenceNotAuditable` now takes `(position, tag)` and
`undefinedVrNotAuditable` takes `(position)`. A raw length has neither a shape nor a membership for a
renderer to test, so there is no `renderLength` and there must not be one. The second code is the
sharper case: it withheld its tag and its VR on the stated ground that the header may be fabricated,
then printed the length off that same header.

WHAT IT COSTS, STATED RATHER THAN MINIMISED. A consumer reading only the message no longer sees how
many bytes were emptied. The number is still on `report.unauditableSequences[].byteLength` and
`report.undefinedVrElements[].byteLength`, and `{tag}` and the byte offset still locate the element.
Those two model fields JOINED the `DeidentifyReport` not-value-free list rather than always having
been on it: binding the message left them as the number's only publisher, which is a smaller surface
and not a closed one.

STILL A PRODUCT CALL AND UNTOUCHED: `report.removedPrivateTags`, `report.unauditableSequences[].tag`,
`report.uidMap`, `contextPath` and the two `byteLength` fields are model fields, not messages. A bound
on any of them empties the field on every well-formed file, where the content is exactly the audit
information it exists to carry.

A MIS-TITLED ROW IS CORRECTED. `deident-unauditable-sequence.test.ts` carried a row titled "carrying
no value" for the very code disclosed as printing a header-derived length; its body only asserted that
values planted elsewhere were absent, which a message built from a frozen registry cannot carry in any
case. The title now matches what the code does and the row asserts the number's absence, with a
non-vacuity control that rebuilds the shipped template.

AND ONE MORE FIXTURE THAT HAD NEVER RUN. The standing desync sweep built its fixtures inside the `try`
that swallows the parse failures they are designed to end in, so the `-20` delta, which under-declares
an 18-byte payload past zero, threw during construction on both syntaxes and was counted as swept.
Construction moved outside the `try`.

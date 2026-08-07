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

A GRADED PASS REFUTED THE FIRST DRAFT ON A SENTENCE IT ADDED, NOT ON THE GUARD, AND THE FINDING IS AN
EIGHTH INSTANCE. The draft's registry docstring listed the surviving `{n}`/`{n2}` slots and closed the
list with "Every one of those is a number this parser produced; none is read out of a header." One
measurement refuted it. `DICOM_ITEM_CROSSES_SEQUENCE_END`'s remaining-bytes count is
`endLimit - cursor.position`, and `endLimit` is the enclosing Sequence's declared Value Length off its
own header while the cursor sits exactly one Item header past the value start, so that count plus 8
IS the declared length and 8 is a constant PS3.5 7.5.1 fixes. Measured on the reachable class this
release establishes: `"SO\0\0"` renders `20299` for `20307`, `"ON\0\0"` renders `20039` for `20047`,
`"TH\0\0"` renders `18508` for `18516`, and the parse survives, so it reaches `ds.warnings`.

The way it got there is the lesson. That slot had a shipped justification, "bounded by the buffer",
whose only measurement fabricated the Sequence length over `"SMITHSON"` - four printable bytes, the
class this release proves unreachable. The draft established the rule that defeats the argument and
then wrote an all-clear over the slot instead of re-measuring it, and the slot's residual pin was
green by fixture for the same reason.

The remedy is the claim, not the guard. The count is untouched, because binding it is a behaviour
change and its own unit. The blanket sentence is deleted rather than reworded; the slot is named on
the exception list in the registry docstring, on `itemCrossesSequenceEnd`, in `ParseOptions.strict`'s
JSDoc and in the four consumer artifacts; and the green-by-fixture pin is retitled to say what it
really measures, with a new asserted row beside it carrying the reachable class, a name-bearing
payload, a mutation control across three letter pairs and the surviving-parse channel. PRE-EXISTING:
`src/parser/sequence.ts` and the factory are byte-identical on `b8a3fb5`.

The same pass found a minor in the new deident sweep, also a reason rather than a behaviour: the
payload was cut at the end of the fabricated header on the stated ground that the filler is a constant
byte, and the sequence fixture's filler opens with a name. Re-swept over the whole carrier value, no
additional offenders. The narrowing is gone.

FIGURES. Base `b8a3fb5`. Head, whole suite: 73 files, 1,220 passing + 1 todo, 0 red. Head tests
against base `src/` (replaced, not overlaid): 5 of 1,221 red across 3 files. THREE are behavioural;
TWO are the factory-arity rows, which fail on the arity line and whose message assertions would have
passed on base, so they grade the new bound and are not evidence that base leaked. The new `{n2}`
residual row is green on BOTH trees by design, because it pins a `PRE-EXISTING` leak.

Refuter pass 2 returned NOT REFUTED and still named three claim defects, all closed before merge and
all recorded because two are this repo's own failure shapes. One surviving artifact still said "NAMED
exception (0002,0000)" in the singular, which is the previous slice's pass-1 blocker reappearing in
the one carrier the remedy's enumeration omitted; the exception list now lives in seven places and
this lineage has corrected six of them twice, so the next slice in it should collapse the count rather
than add a seventh copy. Two lines of the new residual pin were dressed as measurements and measured
nothing, a literal compared to a literal and a hardcoded survival flag; both now read the built buffer
and the wire. And the `+ 8` identity holds for the FIRST Item, where the offset into the sequence
value is exactly the Item header; a later Item subtracts more, so the unqualified sentence over-stated
the leak and is qualified everywhere it appeared.

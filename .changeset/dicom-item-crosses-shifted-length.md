---
"@cosyte/dicom": patch
---

`DICOM_ITEM_CROSSES_SEQUENCE_END` stops printing how many bytes remained inside the sequence, because
that count was the sequence's own declared length shifted by a published constant
(`DICOM-DIAGNOSTIC-PHI-RESIDUALS`)

The eighth instance of "a diagnostic about a PHI leak is itself a PHI surface". Its defence and its
pinning test were both green, and both were green BY FIXTURE, which is the more valuable half.

WHAT SHIPS. Through `0.0.14` the message read "`{n2}` bytes remained inside the sequence", filled from
`Math.max(0, endLimit - cursor.position)`. `endLimit` is the enclosing SEQUENCE's declared Value
Length read off its own header, and `cursor.position` sits exactly one Item header past the value
start, so the rendered count IS that declared length less 8 - and 8 is the Item header size PS3.5
2026c section 7.5.1 fixes. One addition reverses the render. `itemCrossesSequenceEnd` takes
`(position, tag)` now; the Item's own declared length was already bound out of that signature, and
this is the second number to go the same way. The tag slot still carries the constant `FFFEE000`, and
`position.byteOffset` still locates the item. Which codes fire is unchanged and no parse moves.

A RAW WIRE NUMBER SHIFTED BY A PUBLISHED STRUCTURAL CONSTANT IS THE RAW WIRE NUMBER. The registry's
own rule allowed a number this parser "derived - a count it kept, an offset it counted, a remainder
the buffer bounds". The third clause is deleted rather than reworded: the `endLimit < buffer.length`
conjunct at the emit site bounds the rendered number's MAGNITUDE and says nothing about its CONTENT,
and that reading is what admitted this leak for four releases.

GREEN BY FIXTURE, TWICE, ON THE SAME PAYLOAD CLASS. The comment and the pinning row both rested on
that conjunct, and the fixture behind them only ever fabricated the sequence length out of four
PRINTABLE bytes. Every such window exceeds 538,976,288, so `endLimit` landed past the buffer and the
conjunct refused - but a length that big is unreachable by construction, because the buffer has to
hold that many bytes for the parse to get there. The reachable class has zero high-order bytes and
therefore a SHORT decimal. A TEST THAT PASSES BECAUSE ITS FIXTURE CANNOT REACH THE FAILING CASE IS
NOT EVIDENCE. The row is kept, because what it measures is true; what it was read as concluding is
retracted.

AND THE DETECTOR READ CLEAN ON IT, WHICH IS THE GAP THIS RELEASE ALSO CLOSES. Every arm of the
re-encoding detector in `test/integration/fatal-diagnostic-surface.test.ts` hunted a rendering EQUAL
to a typed read of a payload window, so a rendering SHIFTED by a constant was invisible to all of
them even with the digit floor removed. Measured on the `"SO\0\0"` payload that file already carries:
the shipped template returned no findings under the whole detector, while a DIRECT render of the same
length returned the `length` hit, so the detector was working and the miss was structural. A
`length-less-item-header` arm returns `20299 == "SO\0\0"`. It is scoped to the one constant a registry
template ever subtracted rather than to a range, for the same reason the missing 2-byte-as-`uint16`
arm beside it is still named rather than armed: a hunt with nothing to hunt has no non-vacuity
control. A GUARD WITH A FLOOR HAS NOT CLEARED ANYTHING BELOW THE FLOOR, AND A DETECTOR WITH NO OFFSET
ARM HAS NOT CLEARED A SHIFTED RENDERING.

THIS ONE REACHES `ds.warnings` ON A SURVIVING PARSE, unlike the three instances before it, which
reached `onWarning` on a file the parse then refused or `report.warnings` on the de-identify channel.
So it lands on the channel a consumer is most likely to log. Measured on a synthetic, name-bearing
fixture whose planted letters are read back OFF THE WIRE rather than asserted against a literal:
`"SO"` rendered 20299 of a declared 20307, `"ON"` 20039 of 20047, `"TH"` 18508 of 18516, and the two
low bytes of each declared length are two letters of the planted surname.

WHAT IT COSTS, STATED RATHER THAN MINIMISED. A consumer reading the message no longer learns how much
of the sequence was left when the item over-ran it. Unlike the two `deidentify()` codes closed
alongside it, this number has no model field, so nothing publishes it any more; the parsed sequence
and `position.byteOffset` are what remain. The warning still says the file's two length fields
disagree, which is the disclosure it exists for.

THE EXCEPTION LIST IS COLLAPSED FROM SEVEN COPIES TO ONE. "Which numeric slots are exempt from the
signature bound" was carried in `README.md`, `docs-content/limitations.md`,
`docs-content/troubleshooting.md`, `docs-content/spec-notes-tolerance.md`, `ParseOptions.strict`'s
JSDoc, the `WARNING_MESSAGES` docblock and a pending changeset - and six of them had been corrected
twice, once for a wrong count and once for the previous instance. The sink is the `WARNING_MESSAGES`
docblock in `src/parser/warnings.ts`, beside the strings themselves; the other repo carriers name it
and restate nothing. Name the sink, do not restate its cost.

STILL A PRODUCT CALL AND UNTOUCHED: `report.removedPrivateTags`, `report.unauditableSequences[].tag`,
`report.uidMap`, `contextPath` and the two `byteLength` fields are model fields, not messages. A bound
on any of them empties the field on every well-formed file.

FIGURES. Base `ce33ec4`. Head, whole suite: 73 files, 1,222 passing + 1 todo, 0 red. Head tests
against base `src/` (replaced by file copy, not overlaid): 6 of 1,223 red across 3 files. THREE are
behavioural - base really put the number in a live message, including the closure pin, whose digit
runs on base contain `20299`. TWO assert the registry template has no `{n2}` slot. ONE is the
factory-arity row, which fails on its arity line before reaching any message assertion and is not
evidence that base leaked.

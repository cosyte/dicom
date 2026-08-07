---
"@cosyte/dicom": patch
---

Two Tier-3 fatal messages stop rendering the bytes left in the buffer, because in a Sequence Item
that count is the Item's own declared length (`DICOM-DIAGNOSTIC-PHI-RESIDUALS`)

The ninth instance of "a diagnostic about a PHI leak is itself a PHI surface", and the first whose
shift is not a constant.

WHAT SHIPS. Through `0.0.14` `ELEMENT_LENGTH_EXCEEDS_BUFFER` and `FILE_META_GROUP_LENGTH_OVERRUNS`
each filled an `{n}` slot from `buffer.length - cursor.position`. Both slots are gone, and so are the
parameters: `elementLengthExceedsBuffer(buffer, offset)` and `fileMetaGroupLengthOverruns(buffer,
offset)` take two arguments now, so no call site can put either number back. `{n}` still exists in the
registry and is filled by exactly two entries whose number nobody on the wire chose:
`SQ_NESTING_DEPTH_EXCEEDED` renders this library's own `NESTING_DEPTH_LIMIT`, and
`INFLATED_PAYLOAD_EXCEEDS_CAP` renders the cap the caller passed in. No parse moves, no file that
threw stops throwing, `err.code` is unchanged everywhere and `err.byteOffset` still locates the
element.

BREAKING FOR STRING-MATCHERS: the two message texts change. A consumer matching on either string
stops matching. Neither code changed.

WHY A COUNT BOUNDED BY BYTES PRESENT IS STILL THE SENDER'S NUMBER. The old defence was that
`buffer.length - cursor.position` cannot exceed the input, which bounds the number's MAGNITUDE and
says nothing about its CONTENT. `parseSequence` parses a defined-length Item from a SLICE, so inside
one the buffer IS that Item and `buffer.length` IS the Item's 32-bit Value (Item) Length off its own
header. The message publishes `byteOffset` beside the count and `cursor.position` is that offset plus
the header just read, so an addition returns the declared length. On the files these fatals fire for
the reader has desynchronized onto a header inside somebody's value, which is what makes those four
bytes document content.

MEASURED, NAME-BEARING, WITH THE PLANTED LETTERS READ BACK OFF THE WIRE. A synthetic
`"MR BRAIN SMITHSON "` with a planted Item Length of 21320, whose four bytes are `"HS\0\0"`: two
letters of the surname and the two zero high bytes every reachable fabricated length must carry,
because the buffer has to hold that many bytes for the parse to get there. The message read 21312
with the over-declaring element first in the Item, 21288 behind one 24-byte element, and 21272 behind
one 40-byte element. THE SHIFT IS `cursor.position`, SO IT IS VARIABLE, which is why the remedy is the
factory signature rather than a filter: a filter would have to know the frame, and the factory cannot.

WHAT THE DETECTOR CAN AND CANNOT SEE HERE, AND IT IS THE HALF THAT TRANSFERS. `#92` added a
`length-less-item-header` arm to the re-encoding detector in
`test/integration/fatal-diagnostic-surface.test.ts` that subtracts exactly 8, and said on the constant
that it covers ONE offset. Pointed at this leak it behaves exactly as documented: it returns the 21312
shape and reads CLEAN on 21288 and 21272, which are the same leak on the same fixture. Both results
are pinned as rows, beside a DIRECT render of 21320 that the `length` arm does catch, so the clean
results are the arms' limit rather than a payload carrying nothing. A ZERO FROM THIS DETECTOR IS A
GAP, NOT A CLEARANCE. The arm is still not widened to a range, for the reason `#92` gave: a hunt with
nothing to hunt has no non-vacuity control, and what clears the class is the signature.

AND THE PAYLOAD ITSELF IS A TRAP THIS SLICE WALKED INTO FIRST. A first measurement searched the
surname alone and read clean on everything INCLUDING its own control, because the two zero high bytes
of a reachable fabricated length are not part of any name, so the four bytes are contiguous only in
the region that carries the fabricated header. The payload is the whole Sequence value area, header
included, and the row that would have caught the mistake is the direct-render control.

THE COST IS STATED RATHER THAN GLOSSED. `FILE_META_GROUP_LENGTH_OVERRUNS` is raised at the root and
nowhere else, where `buffer.length` is the caller's own input and the count leaked nothing. It loses
the number anyway. A bound that holds only because of where a function happens to be called from is
not a bound, and the sibling that shares the expression is raised inside a slice, so leaving one slot
open is exactly the shape `#88` measured relocating a leak onto a sibling rendering the identical
fixture. Both diagnostics are correspondingly less informative: neither says how far the read got.

NOT IN SCOPE, AND NAMED SO IT IS NOT READ AS CLOSED. `report.removedPrivateTags`,
`report.unauditableSequences[].tag`, `uidMap`, `contextPath` and the two `byteLength` fields are model
fields on a type whose own docs say it is not a value-free surface, not messages, and a bound empties
them on every well-formed file. `DicomParseError.snippet` is still 16 raw source bytes and is still
documented as PHI. `ds.warnings[].message` is still NOT unconditionally safe to log.

---
"@cosyte/dicom": patch
---

A private block reserved in one Data Set no longer resolves the Implicit VR of a private element in
another, which was a wrong VR and so a wrong decoded value. The parser kept a single private-creator
reservation map for the whole file, so a block number claimed by different vendors at the root and
inside a Sequence Item resolved to whichever creator was read last. In a file where an item claims
block `0x11` and the root then writes `(0029,1101)` without claiming it, the root element took the
item's vendor: with a `Profile` naming that creator's element as `SS`, the bytes `FF FF` read as `-1`
instead of raw bytes, and nothing warned. Reservations are now scoped to the Data Set the Private
Creator Data Element appears in, per PS3.5 section 7.8.1, at every depth: an item does not inherit
the enclosing Data Set's blocks, its own do not reach a sibling item, and none of them survive back
out to the enclosing Data Set.

Three behaviour changes against `0.0.5`, all only on files that mix private data with sequences.

A private data element in a Sequence Item whose block is claimed only in an enclosing Data Set now
resolves to `UN` plus a `DICOM_PRIVATE_TAG_NO_CREATOR` warning, where it previously took the
enclosing claim's VR. The bytes are unchanged and still available as `Element.rawBytes`; what is
withheld is a typed decode the file did not license. Claim the block in the Data Set that uses it,
which PS3.5 section 7.8.1's first Note asks for directly: each item needs to claim the corresponding
private block of Elements.

`Element.privateCreator` is `undefined` on those same elements rather than naming a vendor from
another Data Set. This applies under every transfer syntax, including the Explicit VR ones where the
VR is on the wire and only the creator attribution was wrong.

Under `{ strict: true }` such a file now throws, because strict promotes Tier-2 warnings to a thrown
`DicomParseError` and this warning is now emitted where the standard says the reservation does not
reach. The default lenient parse keeps the file and records the warning.

Separately, an undefined-length `UN` element under Implicit VR LE is now descended as a sequence
instead of failing the whole parse. That path previously treated any resolved VR other than `SQ` at
length `0xFFFFFFFF` as unrecoverable structural corruption, so a single private element the reader
could not attribute cost the entire object. It now takes the same CP-246 route the Explicit VR path
already took for that shape, promoting the element to `SQ` with a `DICOM_UN_PARSED_AS_SQ` warning
when the bytes really are items, and still throwing when they are not.

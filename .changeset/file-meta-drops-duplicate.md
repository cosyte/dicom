---
"@cosyte/dicom": patch
---

Two losses closed, both `PRE-EXISTING` and both measured live on the published `0.0.10` tarball.
A second copy of a modeled `(0002,xxxx)` element left the parsed object with no warning and no
residue, and `deidentify()` replaced `(0012,0063)` De-identification Method where PS3.15 says it is
"inserted in or added to" it. No reading changes, on any file.

Provenance: `DICOM-FILE-META-DROPS-DUPLICATE`, raised by `#70`'s gate.

**`DICOM_DUPLICATE_FILE_META_ELEMENT`, a new Tier-2 code.** This is `#70`'s shape one group over,
and it is the group that decides how every following byte is read. The File Meta group is collected
into an array rather than a `Map`, so nothing is overwritten there - `#70`'s own JSDoc said exactly
that, and reading it as an all-clear was the defect. The eight tags `parseFileMeta` projects into
typed `FileMeta` fields are answered by a **first-match** search and are **excluded** from
`FileMeta.extraElements`, the verbatim residue that gives the group its byte-exact round trip, so a
second copy of one of them is in neither. It simply left the object.

The two codes resolve a repeat the opposite way round, deliberately, because the two readings do:
**the FIRST copy wins in the File Meta group, the LAST read wins in a Data Set.** Neither reading
moves here, no value is guessed for the copy that lost, and no residue is invented for it - inventing
one would make the serializer write a group it should not. A repeated
`(0002,xxxx)` tag this library does not model stays silent, because every copy of one is already kept
verbatim in `extraElements` and nothing is dropped. **Two `PRE-EXISTING` bounds a graded pass named, neither closed here**: `serializeDicom` re-emits BOTH copies of such a non-modeled repeat, which is where this package's round-trip promise and its spec-clean promise disagree; and the disclosure covers the group **as the parser delimits it**, so a copy an intermediary appended past an honest `(0002,0000)` group length is never a File Meta element to this parser at all and is relocated into the main Data Set, silently, on this tree and every earlier one.

Measured on the published tarball rather than inferred: `npm pack @cosyte/dicom@0.0.10` (the
registry's current `latest`; there is no `0.0.9`), a file carrying `(0002,0010)` twice with two
**different** Transfer Syntax UIDs - `fileMeta.transferSyntaxUID` reads the first,
`fileMeta.extraElements` is `[]`, `ds.warnings` is `[]`, and `{ strict: true }` does not throw.
Silent on every channel. And the stakes are not hypothetical: the same dataset bytes with only the
ORDER of those two UIDs swapped parse to two different objects, one of which raises
`INVALID_FILE_META` out of the dataset parser, because a length field read in the wrong encoding
declares 1,199,696 bytes.

The message names **no tag**, as `DICOM_DUPLICATE_TAG_IN_DATA_SET`, `DICOM_NONZERO_RESERVED_BYTES`,
`DICOM_ITEM_CROSSES_SEQUENCE_END` and `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` do not, and the
bound is the factory signature. Unlike the Data Set code, `position.byteOffset` here is unambiguously
**file-absolute** - the File Meta group is never nested - and it locates the copy that was **dropped**
rather than the survivor.

PS3.5 2026c section 7.1, read from the SHA-pinned `vendor/nema/part05/` and occurring exactly once
in that document: "The Data Elements in a Data Set shall be ordered by increasing Data Element Tag
Number and shall occur at most once in a Data Set." **PS3.10, which governs this group, is not
vendored in this repo, so no PS3.10 sentence is cited and no conformance verdict is claimed.** The
code's trigger is narrower and needs neither: it fires exactly when a value the file carried does not
reach the parsed object, and a `{ strict: true }` caller has asked to be thrown at rather than handed
a lenient reading.

**`(0012,0063)` is added to, not replaced.** PS3.15 2026c section E.1.1 "De-identifier", read from
the SHA-pinned `vendor/nema/part15/` and occurring exactly once: "a text string describing the method
used shall be **inserted in or added to** De-identification Method (0012,0063)." Replacing it is
neither verb, and what it destroyed is the provenance chain that attribute exists to carry - measured
on `0.0.10`, a file recording `"ACME Anonymizer v3 Basic Profile"` came out of `deidentify()`
recording only this library's method, with the earlier one gone and nothing saying so. This release
appends its own text as a further value of the `1-n` attribute after a `\`, copying the prior bytes
through verbatim so a value encoded under a `(0008,0005)` repertoire survives byte for byte. A value
that already records this method is left alone, so `deidentify(deidentify(ds))` is a fixed
point rather than a growing string. **The comparison is per VALUE on both sides**: the method string
is itself a `1-n` value, and a graded pass refuted the draft that compared the whole string against
each prior value - a caller method carrying a `\` never matched one, and every pass appended a
further copy (29 -> 59 -> 89 -> 119 bytes over four passes, against a flat 29 on base).

**The join is bounded, and the bound is not cosmetic.** `LO` is a short-form VR, so
`encodeDatasetElement` writes its Value Length with a 16-bit field. A `(0012,0063)` carrying a legal
65,534-byte chain of `1-n` values - exactly the provenance chain this feature exists to build -
parses with no warnings, and an unbounded append produced a 65,611-byte value that `serializeDicom`
could not encode: a raw `RangeError` out of Node's `Buffer` internals, outside the documented
`DicomSerializeError` surface, taking the whole de-identified object down. When the join would
exceed the ceiling the prior value is **replaced** instead, which is what every released version did
on every file, and `report.warnings` carries the new `DICOM_DEIDENT_METHOD_NOT_ADDED` so the
fallback is never silent. Truncating the sender's earlier records instead was refused: choosing
which to drop is a policy the standard does not state.

`(0012,0062)` Patient Identity Removed is still **replaced** with `YES`. The asymmetry is the
standard's own: the sentence immediately above, in the same list, says it "shall be **replaced or
added to** the Data Set with a value of YES".

**The cost is disclosed rather than glossed, and is pinned by a residual test that asserts it.**
`(0012,0063)` is **not in Table E.1-1**, so the Basic Profile never acted on it and the incoming
value reached the insertion point untouched - the replacement was the only thing removing it, and
removing it was an action no profile asked for. A sender who wrote something identifying into
`(0012,0063)` now sees that text in de-identified output, which is the retained-by-omission posture
every other unlisted attribute already has. A `(0012,0063)` a file encoded under a VR other than `LO`
is replaced rather than appended to.

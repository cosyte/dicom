---
"@cosyte/dicom": patch
---

Repeated de-identification is a fixed point again, and a `(0012,0063)` value the source file wrote
is no longer kept in silence.

Provenance: `DICOM-DEIDENT-NOT-A-FIXED-POINT`, **`INTRODUCED` by the `(0012,0063)` half of
`DICOM-FILE-META-DROPS-DUPLICATE` in this same unreleased train and never published** - found by a
fourth graded pass while the release was held, so no consumer ever saw it.

**The measurement.** For any `deidentificationMethod` ending in a SPACE or a NUL, `(0012,0063)` grew
by the whole method string on every pass. In memory over four passes: `"ACME Anonymizer v3 "` read
**19 -> 38 -> 57 -> 76** bytes and `"Pass A\Pass B "` read **14 -> 21 -> 28 -> 35**, against a flat
**19** and **14** on the commit before, which replaced and so was a trivial fixed point. Over a real
`parse -> deidentify -> serializeDicom -> parse` round trip a 16-byte method read
**16 -> 32 -> 48 -> 64 -> 80 -> 96** over six cycles. Growth continued to the 65,534-byte ceiling,
where the guard **replaces the entire prior provenance chain** - the exact loss the sibling entry
exists to prevent, reached from a benign caller string.

**The cause was one asymmetry.** The prior value was right-trimmed of `0x20`/`0x00`; the added one
was not. So a freshly supplied value never equalled its own prior copy: the library wrote the
method, `encodeDatasetElement`'s even-length pad folded the trailing byte in, the next parse trimmed
it back off, and the next pass appended the whole method again.

PS3.5 2026c **Table 6.2-1**, `LO` row, read from the SHA-pinned `vendor/nema/part05/`: "A character
string that **may be padded with leading and/or trailing spaces**." Trailing spaces in an `LO` Value
are padding, not content, so a de-duplication comparison must be trailing-insensitive on **both**
sides. **§6.4** says where that pad goes - "a single padding character shall be applied to the end of
the Value Field (**to the last Value**)" - which is why the trim is over the whole Value Field and
trailing only: per-value trimming would discard sender bytes no writer added, and leading padding
survives a round trip untouched and is written through as the caller gave it. Both operands and
**the value written** go through one trim now, so `deidentify` is a fixed point **from the first
pass** rather than from the second: the bytes it emits are the bytes it reads back. A
`deidentificationMethod` that is padding only records nothing, rather than appending an empty value
whose `\` would itself add a byte per pass.

**`DICOM_DEIDENT_METHOD_PRIOR_RETAINED`, a new Tier-2 code.** Keeping the sender's earlier record is
what PS3.15 E.1.1 requires and nothing about the retention changes - but `(0012,0063)` is not in
Table E.1-1, so no rule in the run inspected, audited or redacted those bytes, and a name a sender
wrote there reached output stamped `(0012,0062) Patient Identity Removed = YES` with
`report.warnings` empty **and** `report.retained` `[]`. An audit that reads as a scrub it did not
perform is the worse half of every leak in this package. The code carries **no value, no length and
no VR**: the retained text is the file's own, the tag in the message is a constant of the code
rather than composed from input, and `position.byteOffset` locates the element. It is deliberately
**not** carried on `report.retained`, which is typed `readonly DeidentifyOption[]` and means "the
Annex E option sets active for this run" - a kept attribute is not an option set, and widening that
type would break every consumer switching over the nine names. Emitted by `deidentify()` only, so it
reaches `report.warnings` and never the parser's `{ strict: true }` escalation, and it cannot refuse
a conformant file.

**No reading changes**: no parser file is touched, and nothing outside `(0012,0063)` moves. What does
move, and is stated rather than glossed: a caller whose `deidentificationMethod` ends in a SPACE or a
NUL now has that pad byte trimmed from the value written, so the element is one byte shorter than
every released version wrote it. Table 6.2-1 says that byte is padding, and the serializer pads to
even length anyway - but it is a byte-level difference in de-identified output, not only in a
comparison.

**The pins assert raw bytes.** The shipped pin for the sibling entry was titled for the fixed point,
picked the one delimiter-carrying input with **no trailing pad byte**, and asserted through a helper
that strips trailing `[NUL SP]` - named for a property it could not observe, which is how this
regression went out. Every row here reads the Value Field as it stands, runs six wire passes and
four in-memory ones, and pins the two measured rows above. Over the full suite at the regressed
commit, **6 of 1,043** tests run red.

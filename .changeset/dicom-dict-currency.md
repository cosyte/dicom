---
"@cosyte/dicom": patch
---

Correct 174 SOP Class UID names and close two holes in the dictionary regen gate.

The dictionary generator appended `" Storage"` to every name taken from the vendor `sops.json`,
but that field is already the full PS3.6 Table A-1 UID Name. Published releases therefore reported
`UIDS["1.2.840.10008.5.1.4.1.1.2"].name` as "CT Image Storage Storage", with an equally wrong tail
on ten of the eleven names that do not end in "Storage". The eleventh,
`1.2.840.10008.5.1.4.1.1.79.1`, is the one UID whose vendor name genuinely lacks the suffix and is
now pinned in the curated table to the name PS3.6 gives it. The retired RFC 2557 transfer syntax
`1.2.840.10008.1.2.6.1` is also recased to match the standard.

Of the 261 UIDs shared with PS3.6 2026c Table A-1, 257 now match its `UID Name` character for
character and the other 4 are documented short forms; there are zero retirement-flag disagreements,
and all 7 well-known frames of reference match Table A-2 character for character. Name only: no UID
value, `type`, or `retired` flag changed. Transfer-syntax dispatch keys off the UID value, never the
name, so no parse or de-identification behavior changes; the one runtime surface is the
human-readable snippet on the fatal `UNSUPPORTED_TRANSFER_SYNTAX` error.

The byte-identical regen gate could also go green while generating nothing, because it never
cleaned its output directory: a stale orphan artifact was never rewritten and never diffed, and
gutting `gen:all` to a no-op left every committed artifact untouched and produced an empty diff.
The gate now deletes the generated artifacts before regenerating, and `package.json` is inside its
`paths` filter.

The vendor pin is exactly current against upstream, but upstream last refreshed its data in April
2024, so the tag tables are grounded in PS3.6 2024b against a current PS3.6 2026c. That drift is
now measured and recorded in `vendor/innolitics/README.md` rather than assumed; of the 5,121 tags
shared with 2026c there are zero VR differences.

---
"@cosyte/dicom": patch
---

Correct 175 SOP Class UID names and close two holes in the dictionary regen gate.

The dictionary generator appended `" Storage"` to every name taken from the vendor `sops.json`,
but that field is already the full PS3.6 Table A-1 UID Name. Published releases therefore reported
`UIDS["1.2.840.10008.5.1.4.1.1.2"].name` as "CT Image Storage Storage", with an equally wrong tail
on the eleven names that do not end in "Storage". All 261 UIDs shared with PS3.6 2026c Table A-1
now match its `UID Name` exactly, with zero retirement-flag disagreements. Name only: no UID value,
`type`, or `retired` flag changed, and no parse or de-identification behavior depends on these
strings.

The byte-identical regen gate could also go green while generating nothing, because it never
cleaned its output directory: a stale orphan artifact was never rewritten and never diffed, and
gutting `gen:all` to a no-op left every committed artifact untouched and produced an empty diff.
The gate now deletes the generated artifacts before regenerating, and `package.json` is inside its
`paths` filter.

The vendor pin is exactly current against upstream, but upstream last refreshed its data in April
2024, so the tag tables are grounded in PS3.6 2024b against a current PS3.6 2026c. That drift is
now measured and recorded in `vendor/innolitics/README.md` rather than assumed; of the 5,121 tags
shared with 2026c there are zero VR differences.

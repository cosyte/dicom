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

Measured against PS3.6 2026c on the head of the branch that introduced this change: of the 261 UIDs
shared with Table A-1, 240 match the `UID Name` column byte for byte; a further 17 differ only in
that Table A-1 writes retirement into the name as a trailing " (Retired)" where this dictionary
carries a structured `retired` boolean, which gives 257 when those are read as matches and zero
retirement-flag disagreements; the remaining 4 are documented short forms; 0 are unexplained. All 7
well-known frames of reference match Table A-2 byte for byte. Name only: no UID value, `type`, or
`retired` flag changed. Transfer-syntax dispatch keys off the UID value, never the name, so no parse
or de-identification behavior changes; the one runtime surface is the human-readable snippet on the
fatal `UNSUPPORTED_TRANSFER_SYNTAX` error.

The byte-identical regen gate could also go green while generating nothing, because it never
cleaned its output directory: a stale orphan artifact was never rewritten and never diffed, and
gutting `gen:all` to a no-op left every committed artifact untouched and produced an empty diff.
The gate now deletes the generated artifacts before regenerating, and `package.json` is inside its
`paths` filter. A new `pnpm gen:clean` exposes the same delete for local use; it is deliberately not
chained into `gen:all`, so a failed regen leaves the working tree intact.

The vendor pin is exactly current against upstream, but upstream last refreshed its data in April
2024, so the tag tables are grounded in PS3.6 2024b against a current PS3.6 2026c. That drift is
now measured and recorded in `vendor/innolitics/README.md` rather than assumed. Measured on
`86ab6c1`, `origin/main` at the time and unaffected by this change: all 5,129 committed tags are
still present in PS3.6 2026c, with zero VR, zero name and zero VM differences across them, and 180
tags the standard has gained. Four differences are not additive and are named in full in that file:
`(0010,2160) EthnicGroup` is still marked current although PS3.6 retired it in 2025a, and its
replacements `(0010,2161)` and `(0010,2162)` are absent; `(3004,0012) DoseValue` is marked retired
although PS3.6 still defines it; and `(003A,0320)` and `(003A,0325)` carry truncated keywords, so
both miss on the `byKeyword` lookup.

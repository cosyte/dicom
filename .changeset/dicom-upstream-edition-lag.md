---
"@cosyte/dicom": patch
---

Source the element registry from NEMA's PS3.6 DocBook, the normative publication, instead of from a
third-party mirror alone.

The data dictionary was generated from the Innolitics `dicom-standard` JSON. That pin is exactly
current against its upstream, but the upstream last refreshed its data in April 2024, so the tag
tables were grounded in PS3.6 2024b against a current PS3.6 2026c. No amount of re-pinning discipline
fixes that; the mirror is the stale link. The generator now also reads NEMA's
`part06.xml` (PS3.6 2026c, pinned by SHA-256 in `vendor/nema/part06/`) and applies it as a per-field
overlay: for a tag both sources carry, PS3.6 wins on name, keyword, VR, VM and retirement; a tag
PS3.6 carries and the mirror does not is added; a tag the mirror carries and PS3.6 does not is kept,
because PS3.6 retires elements rather than deleting them and dropping one would turn a decoded
element into an unknown one. Nothing is hand-corrected: every value below is derived from the fetched
normative bytes and is reproduced by every regen.

What changed in the shipped dictionary:

- **`(0010,2160)` `EthnicGroup` is now `retired: true`.** PS3.6 retired it in 2025a and the mirror
  still reported it as current. Its replacements are now present: `(0010,2161)`
  `EthnicGroupCodeSequence` (`SQ`, VM 1) and `(0010,2162)` `EthnicGroups` (`UC`, VM 1-n). Retired
  does not mean removed; `EthnicGroup` still resolves, so an older study still reads.
- **`(3004,0012)` `DoseValue` is now `retired: false`.** It was marked retired although PS3.6 defines
  it; the `RET (2022d)` marker belongs to the preceding row, `(3004,0010)` `RTDoseROISequence`, which
  remains retired. A dose attribute wrongly flagged retired is the dangerous direction of that error.
- **`(003A,0320)` and `(003A,0325)` carry the keywords PS3.6 prints**,
  `SummarizedFilterLookupTableSequence` and `AnalogFilterTypeCodeSequence`. Both were truncated, so
  `byKeyword` missed on the real spelling. The truncated forms are gone rather than kept as aliases;
  they were never PS3.6 keywords, and keeping them would preserve the defect.
- **180 tags PS3.6 has gained are now known**, so `Dictionary.lookup` names them and Implicit VR
  parsing resolves their VR from the dictionary instead of falling back to `UN`. The registry goes
  from 5,129 to 5,309 tags and `byKeyword` from 5,035 to 5,214 keywords.

Zero VR, name and VM differences existed on the 5,129 shared tags, and zero tags were dropped, so no
previously-decoded element decodes differently. UID names are deliberately untouched: `uids.ts` keeps
the short forms every DICOM toolkit uses and carries retirement as a structured boolean rather than a
" (Retired)" suffix, both of which a normative overlay would undo.

The pin is verified, not just recorded: the generator recomputes the SHA-256 of the DocBook it reads
and refuses to run on a mismatch, reads the edition out of the document's own subtitle, and fails
loudly on a row that is not six cells, a malformed tag, a non-identifier keyword, an unrecognized VR
token, or a registry under 5,000 rows. It prints the overlay it applied on every run, with every VR
override listed individually. There is no clock-based staleness check and none is wanted: a
date-based gate would fire on the day it was written, demand an action nobody can take on demand, and
red unrelated pull requests. Checking whether NEMA has published a new edition is one command against
content, documented in `vendor/nema/README.md`.

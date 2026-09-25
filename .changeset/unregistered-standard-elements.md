---
"@cosyte/dicom": patch
---

**`deidentify()` now removes a non-private attribute that neither this build's PS3.6 2026d data
dictionary nor PS3.15 2026d Table E.1-1 carries**, at the top level and inside every Sequence Item
it walks, whatever its VR. Until now a Table E.1-1 miss meant "keep", so a Standard Attribute from a
later edition, or one a sender invented, went into de-identified output verbatim with a report that
said nothing about it. The notes to Table E.1-1 name "new Standard Attributes" as a place identifying
information may be.

- **"Registered" means a literal PS3.6 row or a masked row the tag matches.** The `(50xx,....)` and
  `(60xx,....)` families count only across the even groups PS3.5 2026c section 7.6 bounds them to,
  so `(6002,0010)` Overlay Rows is kept and `(6020,0010)` is removed; every other masked row, such as
  `(0028,04x0)`, is read as PS3.6 prints it. A registered attribute Table E.1-1 does not list is kept
  exactly as before, `UN` VR included.
- **Private attributes, `(0004,xxxx)`, `(0002,xxxx)`, group lengths `(gggg,0000)` and every listed
  attribute are unchanged.** An unregistered element whose on-wire VR is outside the 34 PS3.5
  section 6.2 defines is now removed rather than emptied, and is no longer listed on
  `report.undefinedVrElements`; a registered one still is. An unregistered Sequence is removed whole
  and nothing inside it is walked or reported.
- **New report fields:** `report.unregisteredElementRemovals`, a list of the new exported
  `UnregisteredElementRemoval` (a byte offset, plus the context path when nested, and deliberately
  no tag or VR, since such a tag may be four bytes of some element's value), capped per run, and
  `report.unregisteredElementRemovalCount`, the complete total.
- **New warning code:** `DICOM_DEIDENT_UNREGISTERED_ELEMENT_REMOVED`, raised once per run that
  removed anything, on `report.warnings` only, with no tag, VR or count in its message.
- **The cost:** a conformant attribute from a PS3.6 edition newer than this build is removed too, and
  there is no option to keep it in this release.

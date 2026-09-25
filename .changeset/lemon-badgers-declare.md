---
"@cosyte/dicom": patch
---

Read the file's own safe-private declaration, so a caller with a DICOM file from a vendor they hold
no profile for can de-identify it and still keep the private attributes that file itself declares
non-identifying.

PS3.15 2026c §E.3.10 lists four ways a Private Attribute may be "known by the de-identifier to be
safe from identity leakage", and names the in-file declaration **first**: "its presence in a block of
Private Data Elements with a Value of \"SAFE\" in Block Identifying Information Status (0008,0303) or
individually listed in Nonidentifying Private Elements (gggg,0004) (within Private Data Element
Characteristics Sequence (0008,0300)". This package resolved safety only through a caller `Profile`,
so `RetainSafePrivate` kept nothing without one and the technique values a quantitative read depends
on - §E.3.10's own examples are CT helical span pitch and PET SUV rescale factors - were removed from
every file whose vendor nobody had written a profile for.

- **Both branches of that bullet are read.** A block whose `(0008,0303)` is `SAFE` is known safe
  whole; a block declared `MIXED` is known safe for exactly the elements its `(0008,0304)` list
  names, identified by the lowest 8 bits of the tag within the block (PS3.3 2026c §C.12.1). The
  Private Creator that reserves such a block is retained with it, which is what §E.3.10's "together
  with the Private Creator IDs that are required to fully define the retained Private Attributes"
  asks for. A block declared `UNSAFE` retains nothing, its creator included.
- **No profile is needed, and passing one only ever adds.** A profile retention survives a block the
  declaration calls `UNSAFE` or says nothing about, and nothing outside the odd-group private block
  an Item describes is retained on account of that Item.
- **A block is keyed by its Private Creator VALUE and never by a block number**, which is what
  §C.12.1's own Note requires ("since instances may be modified and numeric block numbers
  reassigned"). The block number an element sits in is resolved separately, against the reservations
  of the Data Set that element lives in, because PS3.5 2026c §7.8.1 scopes a reservation to one Data
  Set and Items do not inherit an enclosing one.
- **A declared-safe private Sequence is still parsed in its entirety**, with each nested attribute
  handled on its own merits, exactly as §E.3.10's Sequence paragraph requires. The declaration
  decides the carrier and never the Data Sets below it.
- **An Item that does not resolve retains nothing and is disclosed** under a new stable warning code,
  `DICOM_DEIDENT_PRIVATE_DECLARATION_NOT_RESOLVED`, raised once per Item on `report.warnings` and
  capped per run. An Item is unresolvable when a Type 1 Value is absent or empty, when `(0008,0303)`
  carries a Value outside the three §C.12.1 enumerates, when `(0008,0301)` is not an odd group, when
  a `MIXED` Item carries no usable `(0008,0304)` list, or when `(0008,0302)` names a creator no block
  in that Data Set reserves. The message carries no token of the Item: the creator, the group and an
  unenumerated status are all the sender's own values, and there is no string parameter for one to
  travel through.

🩺 **What this retains rests on the SENDER's assertion, and that is the cost rather than a footnote.**
The system that wrote the file said the block carries no identifying information; nothing here
re-derives it, so an opaque vendor value in a block declared `SAFE` reaches de-identified output
unexamined - the class removal closed for the profile route. §E.3.10 offers exactly one mitigation
and it is the caller's: if you do not trust the sender, do not pass `RetainSafePrivate`, and every
Private Attribute is removed ("When this Option is not specified, all Private Attributes shall be
removed"). The Option is off by default and this changes nothing about a run that leaves it off.

Everything that guarded the profile route still acts first and is untouched: a Data Set whose
reservations the file does not settle, an element outside the settled run, an on-wire VR that is not
one of the 34, and a value the embedded-attribute scanner reads as a swallowed Data Element run.
Deidentification Action (0008,0307), Deidentification Action Sequence (0008,0305) and Identifying
Private Elements (0008,0306) are **not** implemented and are not implemented by this: §E.3.10's
second branch is "removed **or** processed in the element-specific manner recommended by
Deidentification Action (0008,0307)", and removal stays the branch this library takes.

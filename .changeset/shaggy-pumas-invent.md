---
"@cosyte/dicom": minor
---

Disclose a retained private value this run kept without enumerating it, instead of stamping
`Patient Identity Removed = YES` in silence over it.

`RetainSafePrivate` plus a `Profile` is the only route in the package that writes a private value
into de-identified output. PS3.15 2026c §E.3.10 licenses that retention for a Private _Attribute_
"known by the de-identifier to be safe"; it says nothing about a Data Set the sender nested inside
that attribute's value, which PS3.5 §7.5.1 makes Data Elements and PS3.15 §E.1.1 still covers
"whether contained in the top level Data Set or embedded in an Item of a Sequence of Items". Where
the run neither walked that value nor emptied it, the obligation went undischarged and nothing said
so: on a **fully conformant** file, on 20 of the 30 cells of the matrix in
`test/integration/deident-private-reservation.test.ts`, a nested `(0010,0010)` reached the output
byte-verbatim with `ds.warnings` empty and `report.unauditableSequences` empty. Every one of those
cells now raises `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE` on `report.warnings` and adds a
`report.unauditableSequences` entry.

**The value is still kept, and that is a product decision rather than an unfinished one.** Emptying
these carriers needs a content test on exactly the VRs arbitrary bytes are for, so it also empties
conformant binary values on legitimate files; the leak stays a documented limit, and what changed is
that it is a disclosed one. Nothing about how any file is read or written changes.

`UnauditableSequenceFinding` gains `applied: "emptied" | "kept"`, and it is the field to read first:
that array had one meaning for its whole life - this content is _not_ in your output - and the new
class means the opposite. The two are budgeted on separate counters against the same cap, so a
crafted file carrying tens of thousands of retained private attributes cannot spend the budget that
reports dropped content and silence it. The new message names no byte count, because
`Element.rawBytes.length` is the Value Length off a header an under-declared length upstream may
have composed out of somebody's value - the bound `#91` took out of the two sibling factories - and
the private tag it does name renders `<withheld>` through `renderTag`'s membership test.

A Private Creator is deliberately not reported: it is retained only when its whole decoded value is
a member of the profile's private dictionary, which is an enumeration, and one carrying anything
else fails that lookup and is removed.

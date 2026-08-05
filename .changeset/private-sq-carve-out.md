---
"@cosyte/dicom": patch
---

🩺 A private `SQ` a `Profile` vouched for under `RetainSafePrivate` is no longer written into de-identified output verbatim (`DICOM-PRIVATE-SQ-CARVE-OUT`, `PRE-EXISTING`, live through the published `0.0.10`).

`keepsPrivate` decided retention before the descent and routed a "yes" to `keepOrEmpty`, the only path in the module that writes a source value into output unchanged. So the whole vendor sequence was kept without anything inside it being examined: Table E.1-1 attributes the vendor encoded in its items, UIDs inside it, and any private element the file's own length fields pulled into it, all with `report.removedPrivateTags` reading `[]` and the object stamped `(0012,0062) Patient Identity Removed = YES`. On a fully conformant file, a `(0010,0010)` Patient's Name inside such a carrier was copied straight through.

PS3.15 2026c §E.3.10 licenses retention for "Private Attributes that are known by the de-identifier to be safe from identity leakage", which is knowledge about one Private Attribute and not about a Data Set nested in its value; PS3.5 2026c §7.5.1 makes an Item Value exactly that, and PS3.15 2026c §E.1.1 obliges protecting Table E.1-1 attributes "whether contained in the top level Data Set or embedded in an Item of a Sequence of Items".

The retention decision is unchanged and no guard is widened. A vouched-for private `SQ` now takes the same two branches every other `SQ` takes: it is walked when its items exist, and emptied with `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` plus a `report.unauditableSequences` entry when the parser never materialized them. A non-`SQ` private element is untouched, and there is no new public surface.

The price is PS3.5 2026c §7.8.1's per-Data-Set reservation scope, which now applies inside the carrier: a nested private element whose block is reserved only at the root is removed and named, while one whose Private Creator is inside the Item, as §7.8.1 requires, is kept. No reading changes: 0 of 83,037 grid cells differ in any parse respect against base `495c9fc`.

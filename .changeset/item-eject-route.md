---
"@cosyte/dicom": patch
---

A Sequence Item that declares fewer bytes than its content occupies ejects its trailing elements out
into the enclosing Data Set. A Private Creator that lands there reserved a block for elements the
sender never put beside it, and under `RetainSafePrivate` plus a vendor profile the next private
element was kept verbatim on that borrowed reservation, in output stamped
`(0012,0062) Patient Identity Removed = YES` with `report.removedPrivateTags` reading `[]`.
`PRE-EXISTING`, and measured live on the published `0.0.10` tarball: `removedPrivateTags` `[]`, the
value in the output, the stamp `YES`, `ds.warnings` empty and no throw under `{ strict: true }`. (There
is no `0.0.9` on the registry; `package.json` carried it and the publish never happened.) Found by
`#66`'s pass-2 `conformance-refuter` and pinned by it as residual tests asserting the leaking
behaviour. Those tests now assert the closure.

Provenance: `DICOM-ITEM-EJECT-ROUTE`. PS3.5 2026c section 7.8.1 and PS3.15 2026c section E.3.10 are
each re-located in the SHA-pinned `vendor/nema/` documents, one occurrence apiece. 7.8.1 scopes a
private block reservation to the Item ("The scope of the reservation is just within the Item. Items
do not inherit the Private Data Element reservations made by Private Creator Data Elements in the
Data Set in which the Item is nested"), so a file that contradicts itself about where the Item ends
establishes no knowledge of which Data Set an element is in. E.3.10 licenses retention only for what
is known safe and requires that "all other Private Attributes shall be removed or processed in the
element-specific manner recommended by Deidentification Action (0008,0307), if present within Private
Data Element Characteristics Sequence (0008,0300)": two branches, and this library does not implement
(0008,0307), so removal is the branch available to it.

THE REMEDY IS POSITIONAL, AT EVERY DEPTH, AND IT IS AT THE DE-IDENTIFY BOUNDARY

`settledBound` finds where a Data Set stops accounting for its own membership: the first sequence
whose own contents contradict the extent it declared. The reservation map and the retention decision
are both taken from the settled run, so a creator ejected into a Data Set reserves nothing there, and
an element read before the offending sequence is untouched. `processElements` derives it at every
depth, which is what covers the shape this was filed with: an inner sequence ejecting a creator into
the still-usable Item that encloses it, one level down. No parser file is touched and no reading
changes.

TWO BOUNDS, NOT ONE, BECAUSE A DATA SET IS A Map<Tag, Element>

When the ejected element carries a tag the Data Set already holds, `Map.set` overwrites in place and
the newcomer inherits the earlier element's position, ahead of the sequence it came out of. An index
cut alone reads it as settled and retains it: measured on a root holding a genuine (0009,0010) plus
(0009,1001) reservation ahead of a sequence whose item ejects a second (0009,1001), which lands at
index 2 with byteOffset 274 while the sequence sits at index 3 with byteOffset 238. `Element.byteOffset`
is the position the parser counted and the overwrite cannot move it, so it is checked beside the
index, conjunctively. The grid is blind to this: the index-only and two-bound remedies differ on 0 of
83,037 cells, because no `priv|` fixture collides tags. 3 tests, counted over the full suite, are the
whole pin: the two collision rows and the creator-flip. Both offsets above are measured on the fixture
pinned in `test/integration/deident-private-reservation.test.ts`, whose File Meta is the minimum this
parser requires rather than PS3.10's; a fixture with more File Meta shifts every offset.

That collision also destroys the root's own value on the way in, silently, at parse time, with no
warning and no report entry: the Map<Tag, Element> substitution already recorded for (0010,0020), now
reached on the private-retention path. PRE-EXISTING, identical on both trees, its own item, and
asserted in the tests so it cannot be mistaken for something this remedy handled.

TWO PREDICATES, BECAUSE THE PARSER RECORDS THE SAME CONTRADICTION TWO WAYS

Under Explicit VR the item stream is bounded against the buffer, so it reads past the sequence's
declared end and `rawBytes.length` exceeds `length`. Under Implicit VR LE that path slices the item
stream, so nothing over-runs at all and the descent is refused instead (`items === undefined`,
`DICOM_SQ_NOT_DESCENDED`). That second mechanism is why this is its own slice rather than a widening
of the absorb rule, and the predicate for it is broader than the ejection it is here for,
deliberately and in the fail-safe direction.

THE PRICE, MEASURED

`scripts/measure-sq-bound-grid.ts` over 83,037 cells against `300af87`: root retentions on
self-contradicting files go 78 to 0, of which the eject leaks are 22 to 0 and the remaining 56 are
the cost. Retention on files that do not contradict themselves is unchanged (9 at the root, 6 in an
Item), `LEAKING a source value` is 11 to 11, conformant tiling controls 7 to 7, and 0 cells differ in
any parse respect, 0 cells whose reading differs, 0 new lenient or strict fatals, 0 wrong root
(0010,0020). That 56 has its own column and it is named rather than folded in: `de-identified OUTPUT
lost a marker (cost)` reads 78, the de-identify-boundary column; the `LOST` and `GAINED a marker
value` counters beside it are parse-tree columns and both read 0. 118 cells changed, all in the
`priv|` family: 74 Implicit VR LE and 44 Explicit VR.

The whole-Data-Set variant was built and measured: it differs from what shipped on 0 of 83,037 grid
cells and on exactly 5 tests counted over the full suite, and those five are why it is refused. Three
are genuine root reservations the sender wrote ahead of the disputed sequence; the other two are both
private-`SQ` carve-out residuals, which belong to a different item, the second of them in
`test/integration/deident-unauditable-sequence.test.ts`.

The `--diff` syntax split could not report that: it classified a cell by whether its key starts with
the transfer syntax, which is true only of the sequence sweep, so the `carrier|`, `legit|` and `priv|`
families were always counted as Explicit VR. `transferSyntaxOf` fixes it, and it also moves
`onWarning != ds.warnings, Explicit VR` from 43 to 0.

WHAT IS NOT CLOSED

The private-`SQ` carve-out: `keepsPrivate` decides before `descendSequence`, so a private `SQ` a
profile vouches for is kept verbatim and nothing inside it is examined. `PRE-EXISTING`, still pinned
by a residual test that asserts the leaking behaviour. No new public surface here: no Tier-2 code, no
report field, no snapshot change.

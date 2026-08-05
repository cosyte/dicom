---
"@cosyte/dicom": patch
---

A Data Set that carries the same tag twice destroyed the first element's value at parse time and
said nothing. It now raises the new Tier-2 code `DICOM_DUPLICATE_TAG_IN_DATA_SET`, at the moment of
the replacement, at every depth. No reading changes, on any file.

Provenance: `DICOM-TAG-COLLISION-DESTROYS-ELEMENT`. A parsed Data Set is a `Map<Tag, Element>`, so
`Map.set` on a tag the map already holds overwrites in place: the earlier element leaves the object,
the survivor is indistinguishable from an element the sender wrote once, and no reader, no round
trip and no report could tell you something was gone. That is the mirror of a leak, and the remedy
is the disclosure only. The last element read still wins, exactly as in every released version, and
nothing is invented for the value that was replaced.

Measured on the published tarball rather than inferred: `npm pack @cosyte/dicom@0.0.10` (the
registry's current `latest`), an Explicit VR LE file carrying `(0010,0020)` twice - the second value
is what you read, `ds.warnings` is empty, and `{ strict: true }` does not throw.

PS3.5 2026c section 7.1 ("The Data Elements in a Data Set shall be ordered by increasing Data
Element Tag Number and shall occur at most once in a Data Set") and section 7.5.1 ("Within the
context of each Item, these Data Elements shall be ordered by increasing Data Element Tag value and
appear only once") are read from the SHA-pinned `vendor/nema/part05/`, each sentence occurring
exactly once in that document. So the code cannot fire on a conformant file.

**The message names no tag**, which is specific to this code rather than caution: the ordinary route
to a collision is a length field that lies, so the four tag bytes of the second header can be
fragments of some element's value. `position.byteOffset` locates the element that survived, and it
is that element's own `Element.byteOffset`, so the tag is read off the model instead of out of a
message.

**Two behaviour changes for callers, both measured on `scripts/measure-sq-bound-grid.ts` against
`0ead071` and neither discoverable from the diff.** Of its 83,037 cells, **349 differ and every
difference is confined to the warning channels and `{ strict: true }`**: 0 cells differ in the
element tree, the `DeidentifyReport`, the de-identified bytes, the surviving marker values or the
root Patient ID, and there are 0 new lenient fatals. (1) **345 cells now report a collision that was
silent before** - 295 Implicit VR LE, 25 Explicit VR LE, 25 Explicit VR BE - all of them in the
grid's two hoist-collision families, which is a fact about those fixtures and not a rate for real
files. (2) **9 cells that parsed under `{ strict: true }` now throw**, with their lenient readings
identical, because every Tier-2 code escalates through the one chokepoint; a further 4 cells were
already fatal under `{ strict: true }` and now carry this code instead of `INVALID_FILE_META`,
because the escalation happens earlier in the parse. The shipped `profiles.strict` preset is
unchanged and does not escalate it.

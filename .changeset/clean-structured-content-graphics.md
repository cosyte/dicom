---
"@cosyte/dicom": patch
---

The Clean Structured Content and Clean Graphics Options now empty each Sequence they clean, at every depth.

- **What changed.** PS3.15 Table E.1-1 gives five Sequences a `C` under these Options: Content
  Sequence `(0040,A730)`, Acquisition Context Sequence `(0040,0555)`, Specimen Preparation Sequence
  `(0040,0610)` and Waveform Annotation Sequence `(0040,B020)` under Clean Structured Content, and
  Graphic Annotation Sequence `(0070,0001)` under Clean Graphics. `deidentify` used to keep each one
  and walk its Items, and since Text Value `(0040,A160)`, Code Value and Code Meaning `(0008,0104)`
  have no row of their own, all three were kept while the report said `cleaned`. Each is now kept
  with no Items, wherever it sits, and the report still says `cleaned`. A `C` on any Sequence now
  means the same thing, whichever Option resolves it.
- **What a caller sees.** Under either Option, these Sequences come back with no Items, so a
  structured report's content tree or a graphic annotation is not in the output. A caller that read
  Items out of one of them gets none now; one that needs that content reads it from the source before
  de-identifying. Nothing changes without these Options: the Basic Profile already removed or emptied
  all five.

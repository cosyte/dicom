---
"@cosyte/dicom": patch
---

Lossless File Meta round-trip. The parser now retains non-modeled `(0002,xxxx)` File Meta elements —
e.g. `(0002,0017)`/`(0002,0018)` Sending/Receiving AE Title, `(0002,0100)` Private Information Creator
UID, `(0002,0102)` Private Information — as raw on-wire bytes on the new `FileMeta.extraElements` view
(each a `FileMetaRawElement` carrying the tag, its Explicit-VR-LE VR, and a defensively copied
even-length value, so the typed view never aliases the input buffer). The serializer merges these with
the typed fields and emits the whole File Meta group in ascending tag order (PS3.5 §7.4) with a
recomputed `(0002,0000)` group length (PS3.10 §7.1), so an exotic File Meta group now round-trips
byte-for-byte — not just the typed fields. New exported type: `FileMetaRawElement`. Resolves the
Phase 5 serializer known-limitation ("only the typed `FileMeta` fields round-trip").

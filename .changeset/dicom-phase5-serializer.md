---
"@cosyte/dicom": patch
---

Phase 5 — spec-clean Part 10 serializer. Adds `serializeDicom(ds)` (+ the `DicomSerializeError`
taxonomy with `MISSING_TRANSFER_SYNTAX` / `UNSUPPORTED_TRANSFER_SYNTAX`), the conservative half of
Postel's Law: a `Dataset` is written back to a spec-clean DICOM Part 10 `Buffer` — 128-byte zero
preamble + `DICM`, a File Meta group (always Explicit VR LE) with a computed `(0002,0000)` group
length and conservative Type-1 defaults (File Meta Version, cosyte Implementation Class UID), then the
dataset body in the dataset's own transfer syntax (no transcode) across all four v1 syntaxes
(Implicit LE, Explicit LE/BE, Deflated). Values are padded to even length (`0x00` for UI/byte VRs,
`0x20` for text), short/long-form headers are chosen by VR (SV/UV long-form), retired `(gggg,0000)`
group lengths are dropped, and sequence / encapsulated-pixel-data spans pass through byte-for-byte.
Pure function — the input `Dataset` is never mutated. Known limitation: only the typed `FileMeta`
fields round-trip; other `(0002,xxxx)` elements are dropped at parse time and not re-emitted.

---
"@cosyte/dicom": patch
---

`serializeDicom` writes a file of many small elements, such as a Modality Worklist entry or a structured report, with far less memory.

- **One buffer, written in place.** The writer measures every element first, then writes each
  header and value straight into the one output buffer. It used to build a header Buffer and a
  list of parts for every element, and a run of Buffers for the File Meta group.
- **Items already in order are not sorted.** An Item whose elements were read in ascending tag
  order, the usual case, is checked and written as read with no sort, no second list and no map.
  An Item that is out of order is ordered as before.
- **Fewer objects per element.** The walk reads each element header into one reused record, and
  reads tags and lengths from the bytes directly rather than through Node's `readUInt16LE` and its
  kin, whose offset check allocated on every call in our heap profile. A read past the end of the
  bytes still goes through them and throws as it did.

Nothing a caller sees changes: the bytes written are the same, byte for byte, and so is every
error, in the same order. No export changes.

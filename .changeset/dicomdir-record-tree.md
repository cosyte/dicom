---
"@cosyte/dicom": patch
---

A DICOMDIR's Directory Record tree is now read, and `serializeDicom()` writes every record offset as
the byte offset of the record it named, so a DICOMDIR this library rewrites or de-identifies still
points each record at the right bytes. Until now a DICOMDIR parsed as an ordinary Data Set and every
write carried the source's offsets into a file whose layout had moved (a rebuilt File Meta group,
Data Sets put in ascending order, Items `deidentify()` re-encoded), so a viewer could step from one
patient's record into another's images.

- **New `Dataset.directory`** (types `DicomDirectory`, `DirectoryRecord`): for an object whose
  `(0002,0002)` is `1.2.840.10008.1.3.10`, every Item of the Directory Record Sequence `(0004,1220)`
  as a record with its `(0004,1430)` type, its `(0004,1500)` Referenced File ID components (verbatim)
  and its lower-level records, plus the root entity `(0004,1200)` names. `undefined` for anything
  else. Read under Implicit VR LE, Explicit VR LE and Explicit VR BE.
- **New `Item.fileOffset`**: where the parser found an Item's `(FFFE,E000)` tag, counted from the
  first byte of the File Preamble, as PS3.3's Basic Directory IOD counts DICOMDIR offsets (a file read
  without a preamble still counts the 132 bytes it lacks). `deidentify()` carries it to the Item it
  rebuilds; it is the identity the writer ties each offset to. An offset names a record only when it
  equals a Directory Record Sequence Item's `fileOffset`, never an Item tag found by scanning.
- **New Tier-2 codes, each raised only by a non-conformant DICOMDIR, with registry-only messages:**
  `DICOM_DIRECTORY_OFFSET_UNRESOLVED` (an offset that is not a record's Item tag: inside a record, on
  an Item of a Sequence nested in a record, on the Sequence header, past the end),
  `DICOM_DIRECTORY_OFFSET_MALFORMED` (a Value Length other than 4),
  `DICOM_DIRECTORY_RECORD_REVISITED` (an offset that would reach a record already reached; it is in
  the tree once and the parse finishes) and `DICOM_DIRECTORY_OFFSET_DEFLATED` (a Deflated DICOMDIR
  with a non-zero offset, which PS3.10 does not allow, since it requires a DICOMDIR File to use
  Explicit VR Little Endian; no offset resolves). No
  offset value, record index or record key reaches a message. `{ strict: true }` escalates them.
- **New `SERIALIZE_ERROR_CODES` members `DIRECTORY_OFFSET_UNRESOLVED` and
  `DIRECTORY_OFFSET_DEFLATED`.** The writer refuses, and returns no bytes for, a DICOMDIR carrying an
  offset it cannot tie to a record the Dataset holds (one that did not resolve on read, one left after
  the Directory Record Sequence was removed or emptied, one on a hand-built Dataset with no records,
  a value that is not one 32-bit unsigned integer) and a Deflated DICOMDIR with a non-zero offset. It
  never writes the stale value or zero. Both messages are fixed strings with no digit in them.
- **`DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED` keeps its code and its trigger** (every run on a
  DICOMDIR); its message now names only the two File-set clauses of PS3.15 §E.1.1 this run does not
  discharge, a DICOMDIR created from the de-identified files and the removal of the non-de-identified
  DICOMDIR from the File-set, and no longer says the directory records were not de-identified or that
  DICOMDIR is not modelled.
- **Limits, stated beside the capability in `docs-content/limitations.md`:** Referenced File IDs are
  kept verbatim; no File-set view; record keys, `(0004,1202)` against the end of the root chain, the
  File-set Consistency Flag and Private Record UIDs are not checked; the retired MRDR offset
  `(0004,1504)` is written as read.

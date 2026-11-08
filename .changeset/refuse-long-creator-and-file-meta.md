---
"@cosyte/dicom": patch
---

`serializeDicom()` now refuses a Private Creator or File Meta element whose value is over 65,534 bytes with `DicomSerializeError` code `VALUE_TOO_LONG_FOR_VR`, instead of throwing a `RangeError`.

PS3.5 section 6.2.2 has a value that long, in a VR with a 16-bit Value Length Field, written as `UN`, which the writer has done since 0.1.5, but forbids `UN` for a Private Creator Data Element (gggg,0010-00FF) and for any File Meta Information element (0002,xxxx). Such a value has no encoding, and the writer still put its length through the 16-bit write. Callers now see a `DicomSerializeError` they can narrow on `err.code === "VALUE_TOO_LONG_FOR_VR"`, with a fixed message that carries no tag, length or byte of the value, and nothing is written. It applies to a Private Creator under the Explicit VR syntaxes (Implicit VR Little Endian has a 32-bit length and writes it) and to a File Meta element under every syntax, since the File Meta group is always Explicit VR Little Endian. `deidentify()` throws the same error when it re-encodes a Sequence Item that keeps such a creator, which only a `RetainSafePrivate` run whose `Profile` names a creator that long does. `SERIALIZE_ERROR_CODES` gains the new code, so an exhaustive `switch` over `SerializeErrorCode` needs one more case.

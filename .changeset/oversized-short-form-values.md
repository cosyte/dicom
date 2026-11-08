---
"@cosyte/dicom": patch
---

`serializeDicom()` and `deidentify()` now write a value over 65,534 bytes in a VR with a 16-bit length field as `UN`, as PS3.5 section 6.2.2 requires, instead of throwing a `RangeError`.

Under the Explicit VR transfer syntaxes, VRs such as `CS`, `DS`, `LO`, `PN`, `UI` and `US` carry a 16-bit length field, and the element encoder put every length through it unchecked. A value the reader tolerated at the odd length FFFFH, padded to 65,536 bytes on write, made `serializeDicom()` throw a `RangeError` it does not document, and so did a multi-valued UID that `deidentify()` remapped past 65,534 bytes; inside a Sequence, `deidentify()` threw it itself while rebuilding the Item. Such a value is now written in the long form with VR `UN`, Little Endian under Explicit VR Big Endian too, and reads back byte for byte. A Private Creator, for which the same section forbids `UN`, is not rewritten.

---
"@cosyte/dicom": patch
---

Read, write and load faster with far less memory, and stop warning on a conformant undefined-length sequence.

- `serializeDicom` copies each value once, into its output: a 100 MiB CT write peaks at about its own size above the input, where it took three to four times it.
- Loading the package no longer builds and freezes the whole data dictionary or loads `node:zlib` and `node:crypto`; a dictionary entry is built the first time its tag is asked for. The cold import is about a quarter of what it was.
- The reader builds far fewer objects per element: tag and VR strings are shared, `Element.rawBytes` is made the first time it is read (it is now an accessor, and reads the same bytes), and values are decoded where they sit.
- The writer's ordering pass reads each Sequence without copying it, about three times faster on the SR shape.
- `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` is no longer raised: PS3.5 section 7.1.2 allows undefined length on a Sequence, so every one was a false report, and `profiles.strict` no longer refuses such files. An undefined length the standard does not allow is still refused.

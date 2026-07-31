---
"@cosyte/dicom": patch
---

Warning and error messages no longer reproduce anything the file said. Every message now comes from a
frozen registry keyed by the diagnostic code, and the factories take a position and structural
constants only, so there is no string parameter for a value to travel through. Three diagnostics did
interpolate one: `DICOM_UNSUPPORTED_CHARSET` echoed the `(0008,0005)` term (a value that is
multi-valued on the backslash, and which `deidentify` carried onto the dataset it labels safe to
share), `DICOM_PRIVATE_CREATOR_UNKNOWN` echoed the Private Creator, and the
`UNSUPPORTED_TRANSFER_SYNTAX` fatal echoed the `(0002,0010)` UID into `err.message` and `err.stack`.

Where a token has to be named it now comes from a closed set the package controls: the dictionary's
own label for an unsupported transfer syntax, the 1-based value index of an unsupported character-set
component, and zlib's error code rather than its message.

Two model fields are bounded on membership for the same reason, because a downstream package builds
its own diagnostics from the model: `Element.specificCharacterSet` keeps only terms PS3.3's closed
table names, and `Element.privateCreator` keeps only creators the active `Profile` names. With no
profile active, `Element.privateCreator` now reads `<withheld>`; the raw creator remains available as
the `(gggg,00EE)` element's own bytes. `RetainSafePrivate` behaves exactly as before.

Four documentation claims that stated the reverse of the source are corrected: warning messages were
described as PHI-free while three factories interpolated values, `DicomParseError` was described as
retaining no raw input snippet while `snippet` carries up to 16 source bytes, and the
`DeidentifyReport` was described as value-free while `uidMap`'s keys are the file's own source UIDs.

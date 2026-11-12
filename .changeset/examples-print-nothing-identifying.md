---
"@cosyte/dicom": patch
---

No example in the README, the docs or the example scripts prints a value that identifies a person or a whole data set, and the error-handling page says what is safe to log.

- **Examples print what is safe to log.** The README's first example printed the patient ID, its issuer and the Study Instance UID, and `examples/read-metadata.ts`, `examples/walk-elements.ts`, `examples/deidentify.ts` and `examples/dicom-json.ts` printed the patient's name and ID, every element's value, a UID and a name from the JSON model. Each now prints a modality, the image geometry, counts, codes, the transfer syntax and the shape of each element (its tag, VR, kind and length), and reads an identifying value into a variable or asserts on it instead. An annotation that shows a synthetic name, ID, date or UID carries the mark `/* synthetic */`.
- **What is safe to log, field by field.** A new section on the error-handling page names every public field and method of a parsed `Dataset` and each view and type it reaches (the patient, study, series and image views, `Element`, `FileMeta`, the DICOMDIR records), of a `DicomParseWarning` and its position, and of each error class, and says whether it can hold content read from the file. `DicomParseError.snippet`, `Element.value`, `Element.rawBytes`, the patient and study views, the instance UIDs, the image view's Rescale Type, LUT sequences and coded concepts, a Directory Record's own data set and `DeidentifyReport.uidMap` can; the codes, the registry messages, the image geometry, the offsets and `contextPath` on a warning cannot. It also says that an escalated File Meta group length warning keeps the declared length in its message.
- **The doc comments in the de-identifier's types** no longer log a tag, a length or a `contextPath` the type's own notes call PHI; they log the outcome, an offset or a depth.

Nothing in the package's behavior changed, and a caller changes nothing.

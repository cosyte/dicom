---
"@cosyte/dicom": minor
---

Stop the de-identified header naming the sending site: replace the File Meta group and remove group
0004.

Two of PS3.15 2026c §E.1.1's unconditional bullets are about the parts of a DICOM File that are not
the Data Set, and neither was discharged. A file this library de-identified still carried the sending
site's `(0002,0016)` Source Application Entity Title, the source vendor's implementation identity,
every non-modeled `(0002,xxxx)` element the source stuffed into the group - Sending and Receiving AE
Title, Private Information Creator UID, Private Information - and every `(0004,xxxx)` Data Element,
all under a report that said the run succeeded. `rebuildFileMeta` changed exactly one field, the
Media Storage SOP Instance UID, and nothing anywhere filtered on group 0004.

**The File Meta group of de-identified output now describes this de-identifying application.**
§E.1.1: the File Meta Information "shall be replaced with a description of the de-identifying
application", because otherwise "identity information may leak through unmodified File Meta
Information or preamble ... includ[ing] information regarding Application Entity Titles, Presentation
Addresses, implementation information, and private information". So `(0002,0016)` is gone,
`(0002,0012)`/`(0002,0013)` name `@cosyte/dicom`, and every non-modeled `(0002,xxxx)` element is
dropped rather than re-emitted. What survives identifies the **object**: File Meta Information
Version, Media Storage SOP Class UID, Transfer Syntax UID, and the Media Storage SOP Instance UID
with its existing `RetainUIDs` behaviour unchanged. The replacement is a construction rather than an
edit, so it is unconditional on how well the source group parsed and on which Options are active.

**Group 0004 is removed at every depth**, as §E.1.1 requires "from any SOP Instance or DICOM File
other than a DICOMDIR File" - including inside Sequence Items, and including a `(0004,xxxx)` Sequence
with everything in it. No Annex E Option qualifies either rule.

**Two things to act on.**

1. **The byte-for-byte File Meta round trip no longer holds for `deidentify()` output**, and that is
   the point rather than a side effect. It still holds for parse-then-serialize, which is guarded by
   its own test. If you relied on a non-modeled `(0002,xxxx)` element surviving a de-identify call,
   read it off the parsed dataset before the call; it is not recoverable from the output.
2. **New report surface and three new warning codes.** `report.fileMetaElementsDropped` and
   `report.group0004Removals` record what went, each capped per run in the style of
   `MAX_UNAUDITABLE_SEQUENCE_FINDINGS`, each beside an uncapped
   `...Count` so a caller can count the loss at any input size and tell the two rules apart.
   `DICOM_DEIDENT_FILE_META_REPLACED` and `DICOM_DEIDENT_GROUP_0004_REMOVED` are raised once per run,
   not once per element, so neither string is multiplied by an element count the input chooses.

**A DICOMDIR keeps its `(0004,xxxx)` elements and is told what was not discharged.** An object whose
`(0002,0002)` is `1.2.840.10008.1.3.10` takes §E.1.1's carve-out. The rest of that bullet needs a
DICOMDIR model this library does not have, so every such run raises
`DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED` - including one where the object carried no
`(0004,xxxx)` element at all, because what was not discharged has nothing to do with what the object
happened to carry. Do not treat that output as a conformant de-identified DICOMDIR.

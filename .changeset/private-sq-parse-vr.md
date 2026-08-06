---
"@cosyte/dicom": patch
---

🩺 A private carrier a `Profile` declared `SQ` is no longer written into de-identified output verbatim when the parse tree resolved it to something else (`DICOM-PRIVATE-SQ-PARSE-VR`, `PRE-EXISTING`, live through the published `0.0.10`).

`keepRetainedPrivate` branched on `el.vr === "SQ"`, and the parse tree and the profile disagree about the same bytes in two ordinary, conformant situations. Under Implicit VR LE a private tag carries no VR on the wire (PS3.5 2026c §7.1.3), so `SQ` there is an inference the parser draws from a `Profile` it was given, and a profile passed only to `deidentify()` leaves the element `UN`. Under Explicit VR the wire's VR wins in the parser, so a sender who writes a profile-declared `SQ` attribute as `OB` or `UN` yields that instead, with an honest defined length wrapping a well-formed `(FFFE,E000)` item stream. Both shapes were measured shipping a `(0010,0010)` Patient's Name into output stamped `(0012,0062) Patient Identity Removed = YES`, and the Explicit VR one raises nothing at all on `ds.warnings`.

The remedy is a second authority rather than a content test: the same `Profile` that vouched for the element declares its VR. A retained private element the profile declares `SQ` whose parse tree carries no items is emptied through the channel a parsed `SQ` with no items already used, `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` plus a `report.unauditableSequences` entry, keeping the VR the file actually carried instead of re-typing the element to `SQ`. `keepsPrivate` and the retention decision are unchanged, no parser file is touched, and there is no new public surface.

The cost: a caller who passes a profile to `deidentify()` but not to `parseDicom` now loses that vendor sequence's content instead of shipping it unexamined. Pass the same profile to `parseDicom` and the sequence is walked and its non-PHI content retained. Deliberately not closed: a carrier whose profile entry declares a binary VR (`OB`/`OW`/`UN`) over a well-formed item stream, which would need a content test on exactly the VRs arbitrary bytes are for.

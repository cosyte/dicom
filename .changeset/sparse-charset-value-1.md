---
"@cosyte/dicom": patch
---

We read a hole in Value 1 of a sparse Specific Character Set list as an empty Value 1, so a hand-built Element no longer raises a false DICOM_CHARSET_ESCAPE_UNDECLARED.

Under code extensions an empty Value 1 puts ISO-IR 6 in G0 and declares it. A hole already put ISO-IR 6 in G0 but left it undeclared, so the ESC ( B that switches back to it was flagged. Parsed files are not affected: their term lists have no holes.

---
"@cosyte/dicom": patch
---

Docs: the README's first usage example and the quickstart's first example are now executed by the test suite, read straight out of the page they are printed on.

The README example claims its values as checked results now, against a synthetic CT object saved without its preamble, and one claim moved in the process: the study instance UID it shows is the one that object actually carries, not a placeholder. The quickstart's object is byte-identical to a fixture the test corpus builds, so the PHI scan reads it with the rest of the fixtures. A changed value in either example fails the suite, and every install command the README and the installation page print is checked against the package's own name.

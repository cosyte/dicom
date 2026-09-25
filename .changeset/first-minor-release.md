---
"@cosyte/dicom": minor
---

**This is 0.1.0, the first release whose public API we treat as settled.**

What is covered, and what you can build against:

- Reading DICOM Part 10 metadata: the four typed views (`patient`, `study`, `series`, `image`),
  access to any element by tag with the Part 6 data dictionary compiled in, and lazy typed decode of
  all 34 value representations, honoring Specific Character Set.
- The four native transfer syntaxes and every PS3.5 2026c section A.4 encapsulation syntax are read;
  encapsulated pixel data comes back as raw fragments, and a DICOMDIR reads as a record tree.
- Lenient parsing: only four structural conditions are fatal, and every tolerated deviation is a
  stable warning code with a byte offset. Vendor profiles (`ge`, `siemens`, `philips`, `strict`,
  `lenient`, or your own through `defineProfile`) only ever tighten or annotate a parse.
- A spec-clean serializer that writes the source transfer syntax back, and metadata
  de-identification with the PS3.15 Annex E Basic Profile and the metadata-affecting options,
  returning a fresh dataset and an audit report.

What the version promises. The exported names, options, return shapes and warning codes are the
surface we keep stable. While the package is below 1.0, a breaking change bumps the minor version
(0.1 to 0.2) and is called out in this changelog with its migration; a fix that changes no public
value ships as a patch.

What is not covered yet. Pixel data is never decoded, in any transfer syntax. A de-identified output
is metadata-de-identified only: burned-in annotation is warned about, not removed, and the
residuals the README lists under known limitations are disclosed rather than closed. There is no
transcoding between transfer syntaxes, no DIMSE networking and no DICOMweb, and coded values are
surfaced but not validated against a terminology.

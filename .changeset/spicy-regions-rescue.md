---
"@cosyte/dicom": patch
---

`parseDicom()` now reads objects under the four JPIP Referenced Transfer Syntaxes of PS3.5 2026c:
JPIP Referenced `1.2.840.10008.1.2.4.94` (section A.6), JPIP Referenced Deflate `…1.2.4.95`
(section A.7), JPIP HTJ2K Referenced `…1.2.4.204` (section A.11) and JPIP HTJ2K Referenced Deflate
`…1.2.4.205` (section A.12). Such an object used to throw `UNSUPPORTED_TRANSFER_SYNTAX` and lose its
metadata with it. Sections A.6 and A.11 make the whole Data Set Explicit VR Little Endian, so it is
read by the Explicit VR LE reader; sections A.7 and A.12 are that Data Set compressed per RFC 1951,
so it is inflated by the Deflated reader first, under the same decompression cap and inflate fatals
as Deflated Explicit VR LE. Its patient, study, series and image views read exactly as the same Data
Set does under Explicit VR LE.

- **The Pixel Data Provider URL is surfaced and never fetched.** A JPIP object carries no Pixel
  Data; `ds.get("00287FE0")` returns its Pixel Data Provider URL as the `UR` element the file
  carries, its `value` the URL text with only its trailing padding removed. Nothing in this package
  fetches, resolves or validates it.
- **`serializeDicom()` refuses all four** with `UNSUPPORTED_TRANSFER_SYNTAX`: a JPIP object is read,
  not written.
- **New `DEIDENTIFY_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX`.** `deidentify()` throws a
  `DeidentifyError` with this code, and a fixed message, for a `Dataset` whose File Meta Transfer
  Syntax UID is any of the four, whatever the options, and returns no dataset or report. The URL
  has no PS3.15 Table E.1-1 row, so a de-identified copy would otherwise keep it by omission.
  `DeidentifyError` is no longer thrown only for author-time misconfiguration: switch on `code`.
  The refusal keys on the File Meta alone, so a non-JPIP object that carries `(0028,7FE0)` is
  de-identified as before and keeps it.
- **Not diagnosed:** a JPIP object with no `(0028,7FE0)`, with a top-level Pixel Data, or with a
  Photometric Interpretation outside the four Values section A.6 allows parses without a code.
- **Still refused:** the SMPTE ST 2110 syntaxes and every retired UID. The
  `UNSUPPORTED_TRANSFER_SYNTAX` fatal's message now names the JPIP sections among the supported set.

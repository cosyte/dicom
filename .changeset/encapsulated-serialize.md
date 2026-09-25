---
"@cosyte/dicom": patch
---

`serializeDicom()` now writes objects under every Transfer Syntax PS3.5 2026c section A.4 names
for encapsulated Pixel Data (JPEG, JPEG-LS, JPEG 2000, HTJ2K, RLE, MPEG, HEVC, JPEG XL, Deflated
Image Frame and Encapsulated Uncompressed), the same generated list `parseDicom()` reads. It used to
refuse each one with `UNSUPPORTED_TRANSFER_SYNTAX`, so a JPEG or JPEG 2000 object run through
`deidentify()` could not be saved. The File Meta Transfer Syntax UID is kept, nothing is
transcoded, and no pixel is decoded.

- **The Data Set is written as Explicit VR Little Endian**, as section A.4 requires: the bytes after
  the File Meta group are the bytes the same Data Set writes under Explicit VR LE.
- **Top-level Pixel Data `(7FE0,0010)` is written as `OB` of undefined length**: the input's Basic
  Offset Table Item and every fragment Item byte for byte and in order (Item tag, Item Length and
  value), then a Sequence Delimitation Item of length zero. The header is written this way whatever
  VR and reserved bytes the input span carried. No offset table is interpreted or rebuilt and no
  frame is assembled.
- **New `SERIALIZE_ERROR_CODES` member `INVALID_ENCAPSULATED_PIXEL_DATA`.** Under a section A.4
  syntax the writer refuses, rather than repairs, a top-level Data Set the section does not allow:
  no top-level Pixel Data; Float or Double Float Pixel Data `(7FE0,0008)` / `(7FE0,0009)`; Pixel Data
  with a defined Value Length; a fragment stream not ended by its Sequence Delimitation Item
  (including one `parseDicom()` read with `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED`, since a
  delimiter appended to a stream that may be short would be a well-formed file missing frames);
  anything other than an Item of defined length before the delimiter; an Item of odd length; a
  fragment Item of length zero after the Basic Offset Table; no Basic Offset Table Item or no
  fragment Item; and bytes after the delimiter. Nothing is returned on a refusal, and the message is a
  fixed string that carries no length, byte or UID from the Dataset.
- **Unchanged:** the four native syntaxes serialize exactly as before; every other UID (JPIP
  Referenced, SMPTE ST 2110, every retired UID) still throws `UNSUPPORTED_TRANSFER_SYNTAX`, and a
  missing one `MISSING_TRANSFER_SYNTAX`. Pixel Data nested in a Sequence Item, such as an Icon Image
  Sequence, is written as read and not checked. `parseDicom()` and `deidentify()` are untouched, and
  burned-in annotation is still reported by `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`, never removed.
- The `UNSUPPORTED_TRANSFER_SYNTAX` message now says the writer also supports every section A.4
  syntax. The code is unchanged.

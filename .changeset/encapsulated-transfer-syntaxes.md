---
"@cosyte/dicom": patch
---

`parseDicom()` now reads objects under every Transfer Syntax PS3.5 2026c section A.4 names for
encapsulated Pixel Data: JPEG Baseline, Extended, Lossless and Lossless First-Order Prediction; RLE
Lossless; JPEG-LS Lossless and Near-Lossless; JPEG 2000 and HTJ2K; MPEG2; MPEG-4 AVC/H.264;
HEVC/H.265 Main and Main 10; JPEG XL; Deflated Image Frame Compression; and Encapsulated
Uncompressed Explicit VR LE. Such an object used to throw `UNSUPPORTED_TRANSFER_SYNTAX` and lose its
metadata with it. Section A.4 makes the whole Data Set Explicit VR Little Endian with only Pixel Data
`(7FE0,0010)` encapsulated, so it is read by the Explicit VR LE reader and its patient, study, series
and image views read exactly as the same Data Set does under Explicit VR LE. The list is read out of
the vendored, SHA-pinned PS3.5 by a new generator that joins `gen:all` and the byte-identical regen
gate, and each UID is checked against the PS3.6 registry as a non-retired Transfer Syntax.

- **New: `readPixelDataFragments(ds)`** returns a `PixelDataFragments`: the Basic Offset Table's
  Item Value and every fragment's Item Value as raw bytes, in file order, with no Item header in any
  of them. An empty Basic Offset Table reads as zero bytes. It returns `undefined` when Pixel Data is
  absent or native. The buffers follow `copyValues` like `Element.rawBytes`.
- **No pixel is ever decoded.** Nothing is decompressed, no frame is assembled from fragments, and
  neither the Basic Offset Table nor an Extended Offset Table is interpreted.
- **`serializeDicom()` refuses every one of these syntaxes** with `UNSUPPORTED_TRANSFER_SYNTAX`, a
  de-identified object included, so a compressed object is read and not written.
- **An empty Basic Offset Table no longer raises `DICOM_EMPTY_ITEM_IN_SEQUENCE`.** Section A.4 makes
  it the conformant form decoders must accept. A later empty fragment still raises it. A caller that
  switched on that code for a conformant encapsulated file under Explicit VR LE no longer sees it.
- **New Tier-2 code `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED`** for a fragment stream that ends
  with the input before its Sequence Delimitation Item. The metadata still parses and the fragment
  list may be short; `{ strict: true }` refuses it. Its message carries no fragment byte, length or
  count.
- **Still refused:** the JPIP Referenced syntaxes (their Pixel Data is a reference, not fragments),
  the SMPTE ST 2110 syntaxes, and every retired UID, the retired JPEG processes included. The fatal
  names the syntax by its PS3.6 registry name, never by the UID, and its message now summarises the
  supported set instead of listing four UIDs.
- **Not diagnosed:** an encapsulation-syntax object with no top-level Pixel Data, or with native
  top-level Pixel Data, parses without a code, as the same bytes do under Explicit VR LE.

---
"@cosyte/dicom": patch
---

New `toDicomJson` and `fromDicomJson` convert a Data Set to the DICOM JSON Model and back, metadata only, refusing by code what the model cannot carry.

- `toDicomJson(ds, options?)` returns one JSON object keyed by tag, each attribute with its `vr`
  and its `Value`, `InlineBinary` (base64) or `BulkDataURI` (the `bulkDataUri` option chooses
  which binary values go out by URI). File Meta and retired Group Length are left out.
- `fromDicomJson(json, { fileMeta, sequenceLength?, resolveBulkData? })` writes the JSON under the
  File Meta it is given and returns the `Dataset` `parseDicom` reads from it, so `serializeDicom`
  writes it as Part 10. Explicit VR LE, Implicit VR LE, Explicit VR BE and Deflated Explicit VR
  LE are written.
- Part 10 to JSON to Part 10 is byte-identical where the source wrote what `fromDicomJson` writes:
  the JSON Model records no Sequence length form, no `DS` or `IS` text beyond its number and no pad
  byte, so a source that differs there comes back with the same JSON and different bytes.
- Refused with the new `DicomJsonError` (codes in `DICOM_JSON_ERROR_CODES`): `SV` and `UV` values,
  encapsulated Pixel Data, `OW`, `OF`, `OD`, `OL` and `OV` under Explicit VR Big Endian, numbers
  JSON or the VR cannot hold, text the Specific Character Set is not encoded under here, and JSON
  of another shape. PS3.18 is not vendored here, so the cases we could not confirm against it are
  among the refusals.
- New exports: `toDicomJson`, `fromDicomJson`, `DicomJsonError`, `DICOM_JSON_ERROR_CODES`, and the
  types `DicomJsonErrorCode`, `DicomJsonDataset`, `DicomJsonAttribute`, `DicomJsonValue`,
  `DicomJsonPersonName`, `ToDicomJsonOptions` and `FromDicomJsonOptions`. Nothing existing changes,
  so no caller has to change.

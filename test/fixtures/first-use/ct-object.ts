import { Buffer } from "node:buffer";

import { buildDicom, type BuildDicomElement } from "../../helpers/build-dicom.js";

/**
 * The synthetic CT object the two first-use examples read, built the way every fixture in this
 * repository is built: from a `.ts` spec, which `pnpm phi-scan` reads as part of the `test/` corpus.
 * Every value is fabricated: the patient is the declared-synthetic "Doe^Jane", the identifier and
 * issuer are invented, the study date is the placeholder 1900-01-01, and every UID sits under the
 * `1.2.826.0.1.3680043.8.498` example root.
 *
 * The quickstart prints this object as base64 and the suite asserts the bytes are identical; the
 * README reads it from a file named `study.dcm`, and the suite hands it the preamble-less variant
 * so that the tolerated deviation the README shows is one this object really carries.
 */
const ascii = (text: string): Buffer => Buffer.from(text, "ascii");

const ELEMENTS: readonly BuildDicomElement[] = [
  { tag: "00080016", vr: "UI", value: ascii("1.2.840.10008.5.1.4.1.1.2\0") },
  { tag: "00080018", vr: "UI", value: ascii("1.2.826.0.1.3680043.8.498.111\0") },
  { tag: "00080020", vr: "DA", value: ascii("19000101") },
  { tag: "00080060", vr: "CS", value: ascii("CT") },
  { tag: "00100010", vr: "PN", value: ascii("Doe^Jane") },
  { tag: "00100020", vr: "LO", value: ascii("MRN-42") },
  { tag: "00100021", vr: "LO", value: ascii("SAMPLE-HOSP ") },
  { tag: "0020000D", vr: "UI", value: ascii("1.2.826.0.1.3680043.8.498.1.1\0") },
  { tag: "0020000E", vr: "UI", value: ascii("1.2.826.0.1.3680043.8.498.1.2\0") },
  { tag: "00200011", vr: "IS", value: ascii("2 ") },
  { tag: "00280010", vr: "US", value: Buffer.from([0x00, 0x02]) },
  { tag: "00280011", vr: "US", value: Buffer.from([0x00, 0x02]) },
  { tag: "00280100", vr: "US", value: Buffer.from([0x10, 0x00]) },
  { tag: "00280103", vr: "US", value: Buffer.from([0x01, 0x00]) },
  { tag: "00281052", vr: "DS", value: ascii("-1024 ") },
  { tag: "00281053", vr: "DS", value: ascii("1 ") },
  { tag: "00280030", vr: "DS", value: ascii("0.5\\0.5 ") },
];

/** The object with its 128-byte preamble and `DICM` magic: what the quickstart prints. */
export const FIRST_USE_CT_OBJECT: Buffer = buildDicom({
  transferSyntax: "1.2.840.10008.1.2.1",
  elements: ELEMENTS,
});

/** The same object without the preamble and magic: the `study.dcm` the README example reads. */
export const FIRST_USE_CT_NO_PREAMBLE: Buffer = buildDicom({
  transferSyntax: "1.2.840.10008.1.2.1",
  elements: ELEMENTS,
  skipPreamble: true,
});

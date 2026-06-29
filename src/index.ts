/**
 * `@cosyte/dicom` — developer-focused DICOM Part 10 parser + utility library.
 *
 * Phase 1 surface (already shipped):
 *  - `VERSION` — package version constant.
 *  - `Dictionary` namespace — Part 6 + UID + Annex E lookups.
 *
 * Phase 2 surface: parser entry, structural `Dataset` shell, warning / error
 * registries (D-04).
 *
 * Subsequent phases extend this surface.
 */

export { VERSION } from "./version.js";

// PLAN-02-INSERTION-POINT: Dictionary namespace re-export.
export * as Dictionary from "./dictionary/index.js";

// === Phase 2 — D-04 public surface delta ===

export { parseDicom } from "./parser/index.js";

export { Dataset } from "./dataset/dataset.js";
export { Element } from "./dataset/element.js";
export { Sequence } from "./dataset/sequence.js";
export { Item } from "./dataset/item.js";
export type { FileMeta } from "./dataset/file-meta.js";

export { WARNING_CODES, type WarningCode, type DicomParseWarning } from "./parser/warnings.js";

export { FATAL_CODES, type FatalCode, DicomParseError } from "./parser/errors.js";

export type { DicomPosition, ParseOptions, OnWarningCallback } from "./parser/types.js";

// === Phase 3 — VR value decode surface (D-42) ===

export type {
  DicomValue,
  PersonName,
  PersonNameGroup,
  DicomDate,
  DicomTime,
  DicomDateTime,
} from "./dataset/vr/types.js";
export { decodeElementValue } from "./dataset/vr/decode.js";
export {
  parseSpecificCharacterSet,
  isKnownCharsetTerm,
  resolveDecoderLabel,
  decodeText,
} from "./dataset/vr/charset.js";
export { parsePersonName } from "./dataset/vr/person-name.js";
export { parseDate, parseTime, parseDateTime } from "./dataset/vr/datetime.js";

// === Phase 4 — safety-critical domain helper surface (§4) ===

export type {
  PatientView,
  OtherPatientId,
  StudyView,
  SeriesView,
  ImageView,
  CodedConcept,
  RealWorldValueMap,
  FrameFunctionalGroups,
} from "./dataset/helpers/types.js";
export { readCode, codingSchemeOid, CODING_SCHEME_OIDS } from "./dataset/helpers/coded.js";
export {
  VALUE_ERROR_CODES,
  type ValueErrorCode,
  DicomValueError,
} from "./dataset/helpers/errors.js";

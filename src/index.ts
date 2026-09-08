/**
 * `@cosyte/dicom` - developer-focused DICOM Part 10 parser + utility library.
 *
 * The public surface, grouped by what it does:
 *  - `VERSION` - package version constant.
 *  - `Dictionary` namespace - Part 6 + UID + Annex E lookups.
 *  - the parser entry, the `Dataset` model, and the warning / error registries.
 *  - VR value decoding, the safety-critical domain helpers, the spec-clean
 *    serializer, the source/vendor profile system, and de-identification.
 */

export { VERSION } from "./version.js";

export * as Dictionary from "./dictionary/index.js";

// === Parser, dataset model, and the warning / error registries ===

export { parseDicom } from "./parser/index.js";

export { Dataset } from "./dataset/dataset.js";
export { Element } from "./dataset/element.js";
export { Sequence } from "./dataset/sequence.js";
export { Item } from "./dataset/item.js";
export type { FileMeta, FileMetaRawElement } from "./dataset/file-meta.js";

export { WARNING_CODES, type WarningCode, type DicomParseWarning } from "./parser/warnings.js";

export {
  FATAL_CODES,
  type FatalCode,
  OFFSET_FRAMES,
  type OffsetFrame,
  DicomParseError,
} from "./parser/errors.js";

export type { DicomPosition, ParseOptions, OnWarningCallback } from "./parser/types.js";

// === VR value decode surface ===

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
export { toObject, toISO, toDate } from "./dataset/vr/date-conversion.js";
export type { DateParts, ToDateOptions } from "./dataset/vr/date-conversion.js";

// === Safety-critical domain helper surface ===

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

// === Spec-clean serializer surface ===

export { serializeDicom } from "./serialize/serialize.js";
export {
  SERIALIZE_ERROR_CODES,
  type SerializeErrorCode,
  DicomSerializeError,
} from "./serialize/errors.js";

// === Source/vendor profile surface ===

export { defineProfile, profiles, ProfileDefinitionError } from "./profiles/index.js";
export type {
  Profile,
  PrivateTagDefinition,
  DefineProfileOptions,
  ProfilePrivateTags,
} from "./profiles/index.js";

// === Metadata de-identification surface (PS3.15 Annex E) ===

export { deidentify, makeUidRemapper, DEFAULT_UID_ROOT } from "./deident/index.js";
export { DEIDENTIFY_OPTIONS, DEIDENTIFY_ERROR_CODES, DeidentifyError } from "./deident/index.js";
export type {
  UidRemapper,
  AppliedAction,
  DeidentifiedAttribute,
  DeidentifyErrorCode,
  DeidentifyOption,
  DeidentifyOptions,
  DeidentifyReport,
  DeidentifyResult,
  EmbeddedAttributeFinding,
  FileMetaDroppedElement,
  Group0004Removal,
  UnauditableSequenceFinding,
  UndefinedVrFinding,
  UnenumerablePrivateRemoval,
} from "./deident/index.js";

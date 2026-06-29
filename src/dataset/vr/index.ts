/**
 * Public barrel for the Phase 3 VR value decoders.
 *
 * Excluded from the coverage gate (barrels are not measured) — the dispatch
 * logic lives in `./decode.ts` so it is covered.
 *
 * @module
 */

export type {
  DicomValue,
  PersonName,
  PersonNameGroup,
  DicomDate,
  DicomTime,
  DicomDateTime,
} from "./types.js";
export { decodeElementValue } from "./decode.js";
export {
  parseSpecificCharacterSet,
  isKnownCharsetTerm,
  resolveDecoderLabel,
  decodeText,
} from "./charset.js";
export { parsePersonName } from "./person-name.js";
export { parseDate, parseTime, parseDateTime } from "./datetime.js";

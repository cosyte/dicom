/**
 * Phase 7 metadata de-identification surface (PS3.15 Annex E).
 *
 * `deidentify(ds, options?)` applies the Basic Application Level Confidentiality
 * Profile plus the metadata-affecting Annex E Options, returning a fresh
 * de-identified {@link Dataset} and a value-free {@link DeidentifyReport}.
 *
 * @module
 */

export { deidentify } from "./deidentify.js";
export { DEFAULT_UID_ROOT, makeUidRemapper, type UidRemapper } from "./uid.js";
export {
  DEIDENTIFY_OPTIONS,
  DEIDENTIFY_ERROR_CODES,
  DeidentifyError,
  type AppliedAction,
  type DeidentifiedAttribute,
  type DeidentifyErrorCode,
  type DeidentifyOption,
  type DeidentifyOptions,
  type DeidentifyReport,
  type DeidentifyResult,
} from "./types.js";

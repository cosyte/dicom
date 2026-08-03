/**
 * Phase 7 metadata de-identification surface (PS3.15 Annex E).
 *
 * `deidentify(ds, options?)` applies the Basic Application Level Confidentiality
 * Profile plus the metadata-affecting Annex E Options, returning a fresh
 * de-identified {@link Dataset} and a {@link DeidentifyReport} whose two
 * non-value-free fields are named on {@link DeidentifyReport} itself: `uidMap`,
 * whose keys are the file's own source UIDs, and `removedPrivateTags`, whose
 * entries are four source bytes each.
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
  type EmbeddedAttributeFinding,
  type UnauditableSequenceFinding,
  type UndefinedVrFinding,
} from "./types.js";

/**
 * Public barrel for the Phase 6 profile system.
 *
 * A {@link Profile} is a source/vendor tolerance preset that only ever
 * *tightens or annotates* a parse — it bundles warning `escalations` /
 * `suppressions` and a private-dictionary overlay, and never makes the lenient
 * default throw outside the four Tier-3 fatals. Build your own with
 * {@link defineProfile}, or reach for one of the frozen built-ins under the
 * {@link profiles} namespace.
 *
 * @module
 */

import { ge } from "./ge.js";
import { siemens } from "./siemens.js";
import { philips } from "./philips.js";
import { strict } from "./strict.js";
import { lenient } from "./lenient.js";

export { defineProfile } from "./define.js";
export type { DefineProfileOptions, ProfilePrivateTags } from "./define.js";
export { ProfileDefinitionError } from "./errors.js";
export type { Profile, PrivateTagDefinition } from "../parser/types.js";

export { ge } from "./ge.js";
export { siemens } from "./siemens.js";
export { philips } from "./philips.js";
export { strict } from "./strict.js";
export { lenient } from "./lenient.js";

/**
 * Frozen namespace of every built-in profile: three vendor private-dictionary
 * overlays (`ge`, `siemens`, `philips`) and two posture presets (`strict`,
 * `lenient`). Pass one straight to `parseDicom`.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles } from "@cosyte/dicom";
 * const ds = parseDicom(buf, { profile: profiles.siemens });
 * console.log(profiles.siemens.describe?.());
 * ```
 */
export const profiles = Object.freeze({ ge, siemens, philips, strict, lenient });

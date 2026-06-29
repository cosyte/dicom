/**
 * Built-in **GE** source profile — private-dictionary overlay for the GE
 * Medical Systems (`GEMS_*`) private blocks most commonly mined out of MR
 * files: pulse-sequence identity and the diffusion gradient direction / b-value
 * triple that the neuroimaging community relies on. Under Implicit VR LE these
 * private elements carry no on-wire VR, so without this overlay they degrade to
 * `UN`; with it they resolve to their vendor-documented VRs.
 *
 * Resolution is keyed on the **live private-creator string**, never a fixed
 * block number (PS3.5 §7.8.1) — the canonical `"GGGGxxLL"` key collapses the
 * file-assigned block byte to the `xx` placeholder.
 *
 * Sources (public vendor schema identifiers — NOT PHI):
 *   - GDCM private dictionary (`gdcmPrivateDefaultDicts.cxx`, `GEMS_*` creators).
 *   - dcm4che `private.xml`.
 *   - dcm2niix GE diffusion-tag notes (`GEMS_ACQU_01` / `GEMS_PARM_01`).
 *
 * @module
 */

import { defineProfile } from "./define.js";
import type { Profile } from "../parser/types.js";

/**
 * The GE source profile. Annotation-only: it adds private-VR resolution for
 * known `GEMS_*` creators and changes no warning posture.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles } from "@cosyte/dicom";
 * const ds = parseDicom(buf, { profile: profiles.ge });
 * ```
 */
export const ge: Profile = defineProfile({
  name: "ge",
  description: "GE Medical Systems (GEMS_*) MR private blocks.",
  privateTags: {
    GEMS_IDEN_01: {
      "0009XX01": { vr: "LO", keyword: "FullFidelity", name: "Full Fidelity" },
      "0009XX02": { vr: "SH", keyword: "SuiteId", name: "Suite Id" },
      "0009XX04": { vr: "SH", keyword: "ProductId", name: "Product Id" },
    },
    GEMS_ACQU_01: {
      "0019XX9C": { vr: "LO", keyword: "PulseSequenceName", name: "Pulse Sequence Name" },
      "0019XX9E": {
        vr: "LO",
        keyword: "InternalPulseSequenceName",
        name: "Internal Pulse Sequence Name",
      },
      "0019XXBB": { vr: "DS", keyword: "DiffusionDirectionX", name: "Diffusion Direction X" },
      "0019XXBC": { vr: "DS", keyword: "DiffusionDirectionY", name: "Diffusion Direction Y" },
      "0019XXBD": { vr: "DS", keyword: "DiffusionDirectionZ", name: "Diffusion Direction Z" },
    },
    GEMS_PARM_01: {
      "0043XX39": { vr: "IS", keyword: "DiffusionBValue", name: "Diffusion B-Value" },
    },
  },
});

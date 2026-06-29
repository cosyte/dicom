/**
 * Built-in **Philips** source profile — private-dictionary overlay for the
 * Philips MR private blocks most commonly mined out of real-world files:
 * diffusion b-factor / gradient orientation and stack geometry, addressed via
 * the "Philips Imaging DD 001" (group 2001) and "Philips MR Imaging DD 001"
 * (group 2005) creators. Under Implicit VR LE these private elements carry no
 * on-wire VR, so without this overlay they degrade to `UN`; with it they
 * resolve to their vendor-documented VRs.
 *
 * Resolution is keyed on the **live private-creator string**, never a fixed
 * block number (PS3.5 §7.8.1) — the canonical `"GGGGxxLL"` key collapses the
 * file-assigned block byte to the `xx` placeholder.
 *
 * Sources (public vendor schema identifiers — NOT PHI):
 *   - GDCM private dictionary (`gdcmPrivateDefaultDicts.cxx`, Philips creators).
 *   - dcm4che `private.xml`.
 *   - dcm2niix Philips diffusion-tag notes.
 *
 * @module
 */

import { defineProfile } from "./define.js";
import type { Profile } from "../parser/types.js";

/**
 * The Philips source profile. Annotation-only: it adds private-VR resolution
 * for known Philips creators and changes no warning posture.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles } from "@cosyte/dicom";
 * const ds = parseDicom(buf, { profile: profiles.philips });
 * ```
 */
export const philips: Profile = defineProfile({
  name: "philips",
  description: "Philips MR private blocks (Imaging DD 001 / MR Imaging DD 001).",
  privateTags: {
    "Philips Imaging DD 001": {
      "2001XX03": { vr: "FL", keyword: "DiffusionBFactor", name: "Diffusion B-Factor" },
      "2001XX04": { vr: "CS", keyword: "DiffusionDirection", name: "Diffusion Direction" },
      "2001XX81": { vr: "IS", keyword: "NumberOfDynamicScans", name: "Number Of Dynamic Scans" },
    },
    "Philips MR Imaging DD 001": {
      "2005XXB0": { vr: "FL", keyword: "DiffusionDirectionRL", name: "Diffusion Direction RL" },
      "2005XXB1": { vr: "FL", keyword: "DiffusionDirectionAP", name: "Diffusion Direction AP" },
      "2005XXB2": { vr: "FL", keyword: "DiffusionDirectionFH", name: "Diffusion Direction FH" },
    },
  },
});

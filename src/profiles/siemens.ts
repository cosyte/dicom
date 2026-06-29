/**
 * Built-in **Siemens** source profile — private-dictionary overlay for the
 * Siemens MR/CT private blocks most commonly encountered in real-world Part 10
 * files. The marquee entries are the two CSA headers (`(0029,xx10)`
 * CSAImageHeaderInfo / `(0029,xx20)` CSASeriesHeaderInfo): opaque `OB` blobs
 * that downstream tools (nibabel, dcm2niix) mine for slice timing, diffusion
 * gradients, and B-matrices. Under Implicit VR LE these private elements carry
 * no on-wire VR, so without this overlay the parser degrades them to `UN`;
 * with it they resolve to their vendor-documented `OB`.
 *
 * Resolution is keyed on the **live private-creator string**, never a fixed
 * block number — the same schema can land in block `0x10` in one file and
 * `0x11` in another (PS3.5 §7.8.1). The canonical `"GGGGxxLL"` key collapses
 * the file-assigned block byte to the `xx` placeholder.
 *
 * Sources (public vendor schema identifiers — NOT PHI):
 *   - GDCM private dictionary (`gdcmPrivateDefaultDicts.cxx`).
 *   - dcm4che `private.xml` (Siemens creators).
 *   - dcm2niix / nibabel CSA-header reverse-engineering notes.
 *
 * @module
 */

import { defineProfile } from "./define.js";
import type { Profile } from "../parser/types.js";

/**
 * The Siemens source profile. Annotation-only: it adds private-VR resolution
 * for known Siemens creators and changes no warning posture.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles } from "@cosyte/dicom";
 * const ds = parseDicom(buf, { profile: profiles.siemens });
 * ```
 */
export const siemens: Profile = defineProfile({
  name: "siemens",
  description: "Siemens MR/CT private blocks (CSA + MEDCOM headers).",
  privateTags: {
    "SIEMENS CSA HEADER": {
      "0029XX10": { vr: "OB", keyword: "CSAImageHeaderInfo", name: "CSA Image Header Info" },
      "0029XX20": { vr: "OB", keyword: "CSASeriesHeaderInfo", name: "CSA Series Header Info" },
    },
    "SIEMENS CSA NON-IMAGE": {
      "0029XX10": { vr: "OB", keyword: "CSADataInfo", name: "CSA Data Info" },
    },
    "SIEMENS MEDCOM HEADER": {
      "0029XX08": { vr: "CS", keyword: "MedComHeaderType", name: "MedCom Header Type" },
      "0029XX09": { vr: "LO", keyword: "MedComHeaderVersion", name: "MedCom Header Version" },
      "0029XX10": { vr: "OB", keyword: "MedComHeaderInfo", name: "MedCom Header Info" },
      "0029XX20": {
        vr: "OB",
        keyword: "MedComHistoryInformation",
        name: "MedCom History Information",
      },
    },
  },
});

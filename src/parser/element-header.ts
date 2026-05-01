/**
 * Shared element-header primitives for Phase 2's transfer-syntax parsers.
 *
 * Per `.planning/phases/02-core-parser/02-CONTEXT.md`:
 *   - D-22 — `LONG_FORM_VRS` is the set of VRs that use the long-form
 *     header layout (2-byte VR + 2 reserved bytes + 4-byte length).
 *     Internally exported for the Phase 5 serializer per D-44.
 *
 * Plan 02-01 ships only the constants here; the actual `readElementHeader`
 * primitive lands in plans 02-03 / 02-04 as the transfer-syntax parsers
 * are written.
 *
 * @module
 */

import type { VR } from "../dictionary/types.js";

/**
 * VRs whose Explicit VR header uses the long form: 2-byte VR + 2 reserved
 * bytes (must be `0x00 0x00`; non-zero emits
 * `DICOM_NONZERO_RESERVED_BYTES`) + 4-byte length.
 *
 * Per D-22. The 10-VR set is the union of OB/OW/OF/OD/OL (octet-stream
 * variants), SQ (sequences), UT/UN/UC/UR (unlimited-length text /
 * unknown / unlimited-character / URI). Phase 5 serializer reuses this
 * set for symmetric long-form encoding (D-44).
 *
 * @example
 * ```ts
 * import { LONG_FORM_VRS } from "@cosyte/dicom";
 * LONG_FORM_VRS.has("SQ"); // true
 * LONG_FORM_VRS.has("PN"); // false
 * ```
 */
export const LONG_FORM_VRS: ReadonlySet<VR> = new Set<VR>([
  "OB",
  "OW",
  "OF",
  "OD",
  "OL",
  "SQ",
  "UT",
  "UN",
  "UC",
  "UR",
]);

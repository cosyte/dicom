/**
 * Per-VR byte-stride table for Explicit VR Big Endian byte-swap.
 *
 * Per `.planning/phases/02-core-parser/02-CONTEXT.md`:
 *   - D-23 — `BE_VR_STRIDE` mapping verbatim. `0` means "no swap" (byte
 *     stream / ASCII / spec-defined). The `AT` special case has stride=2
 *     and count=2 (group, then element — NEVER one 4-byte swap).
 *   - D-24 — `OB` and `UN` are byte streams and are NEVER swapped, even
 *     under Explicit VR Big Endian. Both are pinned at 0 here.
 *   - D-44 — Internally exported (and re-exported by Phase 5 serializer)
 *     so swap logic stays symmetric between parser and emitter.
 *
 * @module
 */

import type { VR } from "../dictionary/types.js";

/**
 * Byte-stride lookup for the Explicit VR Big Endian transfer syntax
 * (1.2.840.10008.1.2.2). The parser swaps every value-buffer slice in
 * groups of `BE_VR_STRIDE[vr]` bytes; `0` means leave-as-is.
 *
 * **`AT` special case** (D-23): stride is 2 and count is 2 — group first,
 * then element. Two independent 2-byte swaps, NEVER one 4-byte swap.
 * Multi-valued AT therefore has stride=2 and count=N×2.
 *
 * **`OB` / `UN`** (D-24): byte streams; never swapped under any TS
 * including Explicit VR BE.
 *
 * @example
 * ```ts
 * import { BE_VR_STRIDE } from "@cosyte/dicom";
 * BE_VR_STRIDE.OB; // 0 — never swap
 * BE_VR_STRIDE.AT; // 2 — group then element
 * BE_VR_STRIDE.FD; // 8 — 64-bit float
 * ```
 */
export const BE_VR_STRIDE: Readonly<Record<VR, 0 | 2 | 4 | 8>> = Object.freeze({
  // 2-byte swaps
  AT: 2,
  US: 2,
  SS: 2,
  OW: 2,
  // 4-byte swaps
  UL: 4,
  SL: 4,
  FL: 4,
  OF: 4,
  OL: 4,
  // 8-byte swaps (64-bit floats + 2018 64-bit integer additions)
  FD: 8,
  OD: 8,
  OV: 8,
  SV: 8,
  UV: 8,
  // No swap — byte streams (D-24) and ASCII / spec-defined VRs.
  OB: 0,
  UN: 0,
  AE: 0,
  AS: 0,
  CS: 0,
  DA: 0,
  DS: 0,
  DT: 0,
  IS: 0,
  LO: 0,
  LT: 0,
  PN: 0,
  SH: 0,
  ST: 0,
  TM: 0,
  UC: 0,
  UI: 0,
  UR: 0,
  UT: 0,
  SQ: 0,
});

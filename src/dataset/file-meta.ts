/**
 * Phase 2 structural `FileMeta` view-object shape.
 *
 * Per `02-CONTEXT.md` D-04 + D-17 + FM-02: a plain interface (not a class)
 * since Phase 2 has no methods. Only `transferSyntaxUID` is required —
 * the rest are populated by `parseFileMeta` (plan 02-02) when present
 * but never enforced (Phase 7's `validate()` enforces FM Type-1 fields
 * per D-19). Phase 3 may promote to a class if helpers are added.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

/**
 * The Part-10 File Meta Information group, projected as a typed view
 * over `(0002,xxxx)` elements parsed during the File Meta pre-pass.
 *
 * Only `transferSyntaxUID` is required because it is the dispatch input
 * for the four v1 transfer-syntax parsers; everything else is optional
 * because real-world clinical files routinely omit one or more
 * Type-1 elements. Phase 7's `validate()` adds opinion-bearing checks
 * for those missing elements.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * if (ds.fileMeta !== undefined) {
 *   const ts = ds.fileMeta.transferSyntaxUID; // always present when fileMeta is defined
 * }
 * ```
 */
export interface FileMeta {
  readonly transferSyntaxUID: string;
  readonly mediaStorageSOPClassUID?: string;
  readonly mediaStorageSOPInstanceUID?: string;
  readonly fileMetaInformationVersion?: Buffer;
  readonly implementationClassUID?: string;
  readonly implementationVersionName?: string;
  readonly sourceApplicationEntityTitle?: string;
}

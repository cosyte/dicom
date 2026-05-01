/**
 * Public parser entry — `parseDicom`.
 *
 * Phase 2 plan 02-01 ships only the type-stable export so the public
 * barrel resolves; the real Part-10 header detection, File Meta parser,
 * and Transfer Syntax dispatch implementation arrives in plan 02-02 per
 * `02-CONTEXT.md` D-40.
 *
 * The Phase 2 overload (no `profile` parameter) is locked here per D-01;
 * the third overload accepting a `Profile` is reserved for Phase 6.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Dataset } from "../dataset/dataset.js";
import type { ParseOptions } from "./types.js";

/**
 * Parse a DICOM Part-10 buffer into a structural {@link Dataset}.
 *
 * Phase 2 plan 02-01 publishes the type-stable signature so downstream
 * tooling and tests can import the symbol; the runtime body is added in
 * plan 02-02 (Part-10 header + File Meta + Transfer Syntax dispatch).
 * Calling `parseDicom` before plan 02-02 lands throws an `Error`.
 *
 * @example
 * ```ts
 * // Once plan 02-02 lands:
 * import { parseDicom } from "@cosyte/dicom";
 * import { readFileSync } from "node:fs";
 * const ds = parseDicom(readFileSync("scan.dcm"));
 * console.log(ds.fileMeta?.transferSyntaxUID);
 * ```
 */
export function parseDicom(input: Buffer | Uint8Array | ArrayBuffer): Dataset;
export function parseDicom(
  input: Buffer | Uint8Array | ArrayBuffer,
  options: ParseOptions,
): Dataset;
/**
 * Plan 02-01 stub implementation. Throws until plan 02-02 wires the
 * Part-10 header reader, File Meta parser, and Transfer Syntax dispatcher.
 *
 * @internal
 */
export function parseDicom(
  _input: Buffer | Uint8Array | ArrayBuffer,
  _options: ParseOptions = {},
): Dataset {
  throw new Error(
    "parseDicom: implementation arrives in plan 02-02 (Part-10 header + File Meta + Transfer Syntax dispatch).",
  );
}

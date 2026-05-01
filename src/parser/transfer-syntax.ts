/**
 * Transfer Syntax dispatch table — maps TS UIDs to per-strategy parsers.
 *
 * Per `.planning/phases/02-core-parser/02-CONTEXT.md` D-20: a frozen
 * `Readonly<Record<string, ParserStrategy>>` with EXACTLY four entries —
 * the only Transfer Syntax UIDs supported by `@cosyte/dicom` v1.
 *
 * Plan 02-02 shipped stubs returning empty element maps. Plan 02-03
 * (this commit) replaces the Implicit VR LE stub with the real parser
 * implementation imported from `./implicit-le.js`. Plans 02-04 (Explicit
 * VR LE / BE) and 02-05 (Deflated LE) replace the remaining stubs in
 * place. The dispatch table itself does not change.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { parseExplicitBE } from "./explicit-be.js";
import { parseExplicitLE } from "./explicit-le.js";
import { parseImplicitLE } from "./implicit-le.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";

export { parseImplicitLE, parseExplicitLE, parseExplicitBE };

/**
 * A single transfer-syntax parser strategy.
 *
 * `endOffset` is OPTIONAL — the top-level `parseDicom` dispatch ignores
 * it (the dataset is parsed to end-of-buffer), but SQ-inner descents
 * (via the {@link InnerParser} contract in `parser/sequence.ts`) require
 * it. Plans 02-04 / 02-05 implementations always populate it.
 */
export type ParserStrategy = (
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
) => { elements: ReadonlyMap<Tag, Element>; endOffset?: number };

/**
 * Deflated Explicit VR LE strategy — Plan 02-02 stub. Plan 02-05 replaces
 * with the real `zlib.inflateRawSync` + delegate-to-Explicit-LE pipeline
 * per CONTEXT D-26 / D-27.
 *
 * @internal
 */
export function parseDeflatedLE(
  _buffer: Buffer,
  _datasetStart: number,
  _ctx: ParseContext,
  _emit: (w: DicomParseWarning) => void,
): { elements: ReadonlyMap<Tag, Element> } {
  return { elements: new Map() };
}

/**
 * Frozen dispatch table per CONTEXT.md D-20. Exactly the four v1 Transfer
 * Syntax UIDs are registered. Any other UID → fatal
 * `UNSUPPORTED_TRANSFER_SYNTAX` from `parseDicom`.
 *
 * @example
 * ```ts
 * import { TRANSFER_SYNTAX_PARSERS } from "@cosyte/dicom";
 * const strategy = TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1"];
 * ```
 *
 * @internal
 */
export const TRANSFER_SYNTAX_PARSERS: Readonly<Record<string, ParserStrategy>> = Object.freeze({
  "1.2.840.10008.1.2": parseImplicitLE,
  "1.2.840.10008.1.2.1": parseExplicitLE,
  "1.2.840.10008.1.2.2": parseExplicitBE,
  "1.2.840.10008.1.2.1.99": parseDeflatedLE,
});

/**
 * Transfer Syntax dispatch table — maps TS UIDs to per-strategy parsers.
 *
 * D-20: a frozen `Readonly<Record<string, ParserStrategy>>` with EXACTLY four
 * entries —
 * the only Transfer Syntax UIDs supported by `@cosyte/dicom` v1.
 *
 * Plan 02-02 shipped stubs returning empty element maps. Plan 02-03
 * replaced the Implicit VR LE stub. Plan 02-04 replaced the Explicit
 * VR LE + BE stubs. Plan 02-05 (this commit) replaces the LAST stub —
 * Deflated LE — with the real `zlib.inflateRawSync` + delegate-to-
 * Explicit-LE pipeline imported from `./deflated-le.js`. All four v1
 * transfer syntaxes are now backed by real implementations.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { parseDeflatedLE } from "./deflated-le.js";
import { parseExplicitBE } from "./explicit-be.js";
import { parseExplicitLE } from "./explicit-le.js";
import { parseImplicitLE } from "./implicit-le.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";

export { parseImplicitLE, parseExplicitLE, parseExplicitBE, parseDeflatedLE };

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

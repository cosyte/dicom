/**
 * Transfer Syntax dispatch table - maps TS UIDs to per-strategy parsers.
 *
 * A frozen `Readonly<Record<string, ParserStrategy>>`. Two groups of UIDs are
 * registered, and every other UID is refused with `UNSUPPORTED_TRANSFER_SYNTAX`:
 *
 *   - The four native syntaxes, each with its own reader: Implicit VR LE,
 *     Explicit VR LE, Explicit VR BE and Deflated Explicit VR LE (the
 *     `zlib.inflateRawSync` + delegate-to-Explicit-LE pipeline in
 *     `./deflated-le.js`).
 *   - Every Transfer Syntax PS3.5 2026c section A.4 names for encapsulated Pixel
 *     Data. A.4 makes the whole Data Set Explicit VR Little Endian with only
 *     Pixel Data (7FE0,0010) encapsulated, so each one dispatches to the Explicit
 *     VR LE reader; the fragments are read as opaque Items and no pixel is ever
 *     decoded. The list is read out of the vendored PS3.5 by
 *     `scripts/generate-encapsulated-transfer-syntaxes.ts`, not typed here.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import { ENCAPSULATED_TRANSFER_SYNTAX_UIDS } from "../dictionary/generated/encapsulated-transfer-syntaxes.js";
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
 * `endOffset` is OPTIONAL - the top-level `parseDicom` dispatch ignores
 * it (the dataset is parsed to end-of-buffer), but SQ-inner descents
 * (via the {@link InnerParser} contract in `parser/sequence.ts`) require
 * it. Every shipped implementation populates it.
 */
export type ParserStrategy = (
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
) => { elements: ReadonlyMap<Tag, Element>; endOffset?: number };

/**
 * Frozen dispatch table: the four native Transfer Syntax UIDs, plus every UID
 * PS3.5 2026c section A.4 names, each of those on the Explicit VR LE reader.
 * Any other UID, including the section A.6/A.7/A.11/A.12 JPIP Referenced
 * syntaxes, the SMPTE ST 2110 syntaxes and every retired UID, is a fatal
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
  ...Object.fromEntries(
    ENCAPSULATED_TRANSFER_SYNTAX_UIDS.map((uid): [string, ParserStrategy] => [
      uid,
      parseExplicitLE,
    ]),
  ),
  "1.2.840.10008.1.2": parseImplicitLE,
  "1.2.840.10008.1.2.1": parseExplicitLE,
  "1.2.840.10008.1.2.2": parseExplicitBE,
  "1.2.840.10008.1.2.1.99": parseDeflatedLE,
});

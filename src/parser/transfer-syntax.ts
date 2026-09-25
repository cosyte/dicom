/**
 * Transfer Syntax dispatch table - maps TS UIDs to per-strategy parsers.
 *
 * A frozen `Readonly<Record<string, ParserStrategy>>`. Three groups of UIDs are
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
 *   - The four JPIP Referenced syntaxes (`./jpip-referenced.js`). Sections A.6
 *     and A.11 make the whole Data Set Explicit VR Little Endian, so they go to
 *     the Explicit VR LE reader. Sections A.7 and A.12 are that Data Set
 *     raw-deflated per RFC 1951, so they go to the Deflated reader, whose inflate
 *     fatals and decompression cap bind them unchanged. The object carries no
 *     Pixel Data: its Pixel Data Provider URL (0028,7FE0) is read as the `UR`
 *     element it is and is never fetched.
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
import {
  JPIP_REFERENCED_DEFLATE_UIDS,
  JPIP_REFERENCED_EXPLICIT_LE_UIDS,
} from "./jpip-referenced.js";
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

/** One `[uid, strategy]` entry per UID in `uids`. */
function entriesFor(
  uids: readonly string[],
  strategy: ParserStrategy,
): [string, ParserStrategy][] {
  return uids.map((uid): [string, ParserStrategy] => [uid, strategy]);
}

/**
 * Frozen dispatch table: the four native Transfer Syntax UIDs; every UID PS3.5
 * 2026c section A.4 names, each on the Explicit VR LE reader; and the four JPIP
 * Referenced UIDs of sections A.6, A.7, A.11 and A.12, the two Explicit VR LE
 * ones on that reader and the two Deflate ones on the Deflated reader. Any other
 * UID, including the SMPTE ST 2110 syntaxes and every retired UID, is a fatal
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
  ...Object.fromEntries(entriesFor(ENCAPSULATED_TRANSFER_SYNTAX_UIDS, parseExplicitLE)),
  ...Object.fromEntries(entriesFor(JPIP_REFERENCED_EXPLICIT_LE_UIDS, parseExplicitLE)),
  ...Object.fromEntries(entriesFor(JPIP_REFERENCED_DEFLATE_UIDS, parseDeflatedLE)),
  "1.2.840.10008.1.2": parseImplicitLE,
  "1.2.840.10008.1.2.1": parseExplicitLE,
  "1.2.840.10008.1.2.2": parseExplicitBE,
  "1.2.840.10008.1.2.1.99": parseDeflatedLE,
});

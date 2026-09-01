/**
 * Explicit VR Big Endian dataset parser (`1.2.840.10008.1.2.2`).
 *
 * Four rules govern it:
 *   - Header / value bytes are big-endian. Per-VR byte-stride for value swap
 *     is captured by `BE_VR_STRIDE` in `./endian.ts`. **The parser stores
 *     rawBytes verbatim from on-wire bytes (no swap)**; the lazy decoders use
 *     `BE_VR_STRIDE` to swap on access.
 *   - `OB` and `UN` are byte streams; never swapped under any TS.
 *   - FFFE markers route through the same endian-aware ByteCursor as
 *     everything else, which is what closes the canonical BE-FFFE bug.
 *   - The CP-246 inner encoding is **Implicit VR LE** even under Explicit-BE.
 *
 * Implementation: 1-line wrapper over the shared `_parseExplicit` helper
 * in `./explicit-le.ts`. The only TS-specific knobs are `littleEndian:
 * false` and the inner-strategy = parseExplicitBE itself (so SQ-inner
 * elements are also parsed BE).
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { _parseExplicit } from "./explicit-le.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";

/**
 * Public Explicit VR Big Endian strategy - wraps `_parseExplicit` from
 * `./explicit-le.js` with `littleEndian: false`. Inner SQ elements are
 * parsed BE (innerStrategy: parseExplicitBE itself); CP-246 fallback is
 * routed through `parseImplicitLE` from inside `_parseExplicit`
 * (orthogonal to the outer TS endian).
 *
 * @internal
 */
export function parseExplicitBE(
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  opts: { stopOnItemDelim?: boolean } = {},
): { elements: ReadonlyMap<Tag, Element>; endOffset: number } {
  return _parseExplicit(
    buffer,
    datasetStart,
    ctx,
    emit,
    { littleEndian: false, innerStrategy: parseExplicitBE },
    opts,
  );
}

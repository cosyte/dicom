/**
 * Implicit VR Little Endian dataset parser — TS-01 (`1.2.840.10008.1.2`).
 *
 * Phase 2 core-parser context:
 *   - D-21 — VR resolution via the 5-case fallback in `resolveImplicitVR`
 *     (single VR / multi-VR / repeating-group family / private → UN /
 *     unknown standard → UN silently).
 *   - D-33 / D-34 + PITFALLS §7.1 — private-creator stack tracking and
 *     `Element.privateCreator` population via the block-reservation rule.
 *   - TOL-10 — `(gggg,0000)` group-length elements in non-File-Meta
 *     groups emit `DICOM_GROUP_LENGTH_IN_DATASET`; the value is preserved
 *     but not used for parsing (the cursor advances element-by-element).
 *
 * Element layout: `group(2 LE) + element(2 LE) + length(4 LE) + value`.
 * No on-wire VR; VR is inferred. Length `0xFFFFFFFF` is only valid on
 * tags whose resolved VR is `SQ` — the parser delegates SQ descent to
 * `parseSequence` (`./sequence.js`).
 *
 * As of plan 02-04, `parseImplicitLE` accepts an optional `stopOnItemDelim`
 * flag and returns `endOffset` — both required by the InnerParser contract
 * the SQ parser invokes for undefined-length item bodies (D-28).
 *
 * Threat model (T-02-03-01 / T-02-03-02): all `RangeError`s from the
 * `ByteCursor` are caught and re-thrown as
 * `DicomParseError(INVALID_FILE_META, ..., headerStart, snippet)`; every
 * `length` is bounds-checked against `buffer.length - cursor.position`
 * before the slice.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { Element } from "../dataset/element.js";
import { joinTag } from "../dataset/tag.js";
import type { Tag } from "../dictionary/types.js";
import { ByteCursor } from "./byte-cursor.js";
import {
  registerPrivateCreator,
  resolveImplicitVR,
  resolvePrivateCreator,
} from "./element-header.js";
import { buildSnippet, DicomParseError, FATAL_CODES } from "./errors.js";
import { parseSequence } from "./sequence.js";
import type { ParseContext } from "./types.js";
import { groupLengthInDataset, type DicomParseWarning } from "./warnings.js";

/**
 * Parse the dataset portion of an Implicit VR LE buffer starting at
 * `datasetStart`. Reads element-by-element until the cursor reaches the
 * end of the buffer; returns the assembled element map for the parent
 * `Dataset`.
 *
 * When `opts.stopOnItemDelim === true`, the loop terminates immediately
 * upon reading `(FFFE,E00D)` ItemDelim — the cursor is advanced past the
 * 4-byte length field (which is always 0) and the post-delim offset is
 * returned. This contract is consumed by `parseSequence` for
 * undefined-length item bodies (D-28).
 *
 * @internal
 */
export function parseImplicitLE(
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  opts: { stopOnItemDelim?: boolean } = {},
): { elements: ReadonlyMap<Tag, Element>; endOffset: number } {
  const cursor = new ByteCursor(buffer, true, datasetStart);
  const elements = new Map<Tag, Element>();

  while (cursor.remaining() > 0) {
    const headerStart = cursor.position;
    let group: number;
    let element: number;
    let length: number;
    try {
      group = cursor.readUInt16();
      element = cursor.readUInt16();
      length = cursor.readUInt32();
    } catch (err) {
      if (err instanceof RangeError) {
        // T-02-03-01 mitigation — truncated header.
        throw new DicomParseError(
          FATAL_CODES.INVALID_FILE_META,
          "Truncated dataset (header read past buffer end).",
          headerStart,
          buildSnippet(buffer, headerStart),
        );
      }
      throw err;
    }
    const tag = joinTag(group, element);

    // FFFE markers under Implicit VR LE are item / item-delim / seq-delim
    // markers. ItemDelim (FFFE,E00D) terminates an undefined-length SQ
    // item body — when invoked as inner parser (opts.stopOnItemDelim ===
    // true) we exit cleanly with the post-delim offset. Other FFFE
    // markers at the dataset root are structurally malformed.
    if (group === 0xfffe) {
      if (opts.stopOnItemDelim === true && tag === "FFFEE00D") {
        // Length field was already consumed (always 0 for ItemDelim);
        // cursor is now past the 8-byte ItemDelim marker.
        return { elements, endOffset: cursor.position };
      }
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        `Unexpected FFFE marker (${tag}) at dataset root.`,
        headerStart,
        buildSnippet(buffer, headerStart),
      );
    }

    const position = { byteOffset: headerStart };
    const vr = resolveImplicitVR(tag, ctx, emit, position);

    // length === 0xFFFFFFFF — under Implicit VR LE, only valid for SQ
    // (delegate to parseSequence, owned by plan 02-04). For non-SQ
    // resolved VRs, this is a malformed file (Implicit-LE has no on-wire
    // VR, so UN cannot be encoded explicitly with undefined length).
    if (length === 0xffffffff) {
      if (vr === "SQ") {
        const seq = parseSequence(buffer, cursor.position, ctx, emit, {
          explicitLength: undefined,
          littleEndian: true,
          innerStrategy: parseImplicitLE,
        });
        const valueRawStart = headerStart;
        cursor.position = seq.endOffset;
        const rawBytes = ctx.copyValues
          ? Buffer.from(buffer.subarray(valueRawStart, cursor.position))
          : buffer.subarray(valueRawStart, cursor.position);
        const privateCreator = resolvePrivateCreator(tag, ctx);
        elements.set(
          tag,
          new Element({
            tag,
            vr,
            vm: seq.items.length,
            length: 0xffffffff,
            rawBytes,
            byteOffset: headerStart,
            ...(privateCreator !== undefined ? { privateCreator } : {}),
          }),
        );
        continue;
      }
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        `Undefined length on non-SQ element ${tag} (vr=${vr}) under Implicit VR LE.`,
        headerStart,
        buildSnippet(buffer, headerStart),
      );
    }

    // T-02-03-02 mitigation — bounds-check declared length before slice.
    if (cursor.position + length > buffer.length) {
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        `Element ${tag} declared length=${String(length)} exceeds remaining buffer (${String(buffer.length - cursor.position)} bytes).`,
        headerStart,
        buildSnippet(buffer, headerStart),
      );
    }

    const valueStart = cursor.position;
    const valueEnd = valueStart + length;
    const valueSlice = ctx.copyValues
      ? Buffer.from(buffer.subarray(valueStart, valueEnd))
      : buffer.subarray(valueStart, valueEnd);
    cursor.position = valueEnd;

    // TOL-10: group-length elements in non-File-Meta groups.
    if (element === 0x0000 && group !== 0x0002) {
      emit(groupLengthInDataset(position, tag));
    }

    // Private Creator slot (gggg,0010..00FF) — register into the stack.
    if (group % 2 === 1 && element >= 0x0010 && element <= 0x00ff) {
      registerPrivateCreator(tag, valueSlice, ctx);
    }

    const privateCreator = resolvePrivateCreator(tag, ctx);
    elements.set(
      tag,
      new Element({
        tag,
        vr,
        // Phase 2 placeholder — Phase 3 derives VM from VR + value layout.
        vm: 1,
        length,
        rawBytes: valueSlice,
        byteOffset: headerStart,
        ...(privateCreator !== undefined ? { privateCreator } : {}),
      }),
    );
  }

  return { elements, endOffset: cursor.position };
}

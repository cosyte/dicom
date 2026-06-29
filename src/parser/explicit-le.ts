/**
 * Explicit VR Little Endian dataset parser — TS-02 (`1.2.840.10008.1.2.1`)
 * AND the shared body that Explicit VR Big Endian (TS-03) wraps.
 *
 * Phase 2 core-parser context:
 *   - D-22 — short-form / long-form element header layout (8 vs 12 bytes).
 *     `LONG_FORM_VRS` from `element-header.ts` lists the 10 VRs that use
 *     the long-form. Reserved bytes ≠ 0x00 0x00 emit
 *     `DICOM_NONZERO_RESERVED_BYTES`.
 *   - D-25 — FFFE markers route through the same endian-aware ByteCursor
 *     as every other read; ItemDelim termination of undefined-length items
 *     supported via `opts.stopOnItemDelim`.
 *   - D-29 — undefined-length SQ legal in Explicit VR but emits
 *     `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`.
 *   - D-30 — CP-246 fallback: when `VR=UN` AND `length=0xFFFFFFFF`, attempt
 *     SQ descent using **Implicit VR LE inner encoding**. On success →
 *     promote element to `VR=SQ` + emit `DICOM_UN_PARSED_AS_SQ` + set
 *     `cp246Promoted: true`. On failure → keep `VR=UN` + raw bytes
 *     (best-effort empty when undefined-length, per CONTEXT D-30).
 *   - D-31 — `(7FE0,0010) VR=OB length=0xFFFFFFFF` is encapsulated pixel
 *     data; SQ-style fragment iteration; element keeps `vr=OB`.
 *
 * Threat model:
 *   - T-02-04-01 — every cursor read wrapped; RangeError → typed throw.
 *   - T-02-04-02 — depth cap enforced inside parseSequence.
 *   - T-02-04-05 — non-zero reserved bytes are NOT trusted to drive parsing;
 *     length is read from the explicit 4-byte field.
 *   - T-02-04-06 — `ctx.copyValues === true` → `Buffer.from(slice)`.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import { Element } from "../dataset/element.js";
import { joinTag } from "../dataset/tag.js";
import { lookup as dictionaryLookup } from "../dictionary/index.js";
import type { Tag, VR } from "../dictionary/types.js";
import { ByteCursor, copyValueBytes } from "./byte-cursor.js";
import {
  applySpecificCharacterSet,
  readExplicitElementHeader,
  registerPrivateCreator,
  resolvePrivateCreator,
} from "./element-header.js";
import { buildSnippet, DicomParseError, FATAL_CODES } from "./errors.js";
import { parseImplicitLE } from "./implicit-le.js";
import {
  parseSequence,
  tryParseUnAsSQ,
  type InnerParser,
  type ParseSequenceOptions,
} from "./sequence.js";
import type { ParseContext } from "./types.js";
import {
  groupLengthInDataset,
  oddLengthValuePadded,
  undefinedLengthInExplicitVR,
  vrMismatch,
  type DicomParseWarning,
} from "./warnings.js";

const UNDEFINED_LENGTH = 0xffffffff;

/**
 * Shared Explicit-VR element loop used by both LE (TS-02) and BE (TS-03)
 * strategies. The only TS-specific knobs are:
 *   - `mode.littleEndian` — drives ByteCursor + FFFE marker reads.
 *   - `mode.innerStrategy` — passed as `innerStrategy` when descending SQ
 *     and as the per-item parser for SQ-inner element bodies. (Each TS
 *     strategy passes itself in to break the circular import.)
 *
 * @internal
 */
export function _parseExplicit(
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  mode: { littleEndian: boolean; innerStrategy: InnerParser },
  opts: { stopOnItemDelim?: boolean } = {},
): { elements: ReadonlyMap<Tag, Element>; endOffset: number } {
  const cursor = new ByteCursor(buffer, mode.littleEndian, datasetStart);
  const elements = new Map<Tag, Element>();

  while (cursor.remaining() > 0) {
    const headerStart = cursor.position;

    // Detect FFFE markers BEFORE the explicit-VR header read — FFFE
    // markers have no on-wire VR field and would mis-decode through
    // readExplicitElementHeader. The peek-then-decide pattern matches
    // PITFALLS.md §2.3 (D-25).
    let peekGroup: number;
    try {
      peekGroup = cursor.readUInt16At(cursor.position);
    } catch (err) {
      if (err instanceof RangeError) {
        throw new DicomParseError(
          FATAL_CODES.INVALID_FILE_META,
          "Truncated dataset (header read past buffer end).",
          headerStart,
          buildSnippet(buffer, headerStart),
        );
      }
      throw err;
    }

    if (peekGroup === 0xfffe) {
      // FFFE marker: 4-byte tag + 4-byte length, no VR.
      let grp: number;
      let ele: number;
      let len: number;
      try {
        grp = cursor.readUInt16();
        ele = cursor.readUInt16();
        len = cursor.readUInt32();
      } catch (err) {
        if (err instanceof RangeError) {
          throw new DicomParseError(
            FATAL_CODES.INVALID_FILE_META,
            "Truncated dataset (FFFE header read past buffer end).",
            headerStart,
            buildSnippet(buffer, headerStart),
          );
        }
        throw err;
      }
      const fffeTag = joinTag(grp, ele);
      if (opts.stopOnItemDelim === true && fffeTag === "FFFEE00D") {
        // ItemDelim — cursor consumed past the 8-byte marker.
        return { elements, endOffset: cursor.position };
      }
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        `Unexpected FFFE marker ${fffeTag} (length=${String(len)}) at dataset level.`,
        headerStart,
        buildSnippet(buffer, headerStart),
      );
    }

    // Standard Explicit-VR element header.
    let header;
    try {
      header = readExplicitElementHeader(cursor, ctx, emit);
    } catch (err) {
      if (err instanceof RangeError) {
        throw new DicomParseError(
          FATAL_CODES.INVALID_FILE_META,
          "Truncated dataset (Explicit VR header read past buffer end).",
          headerStart,
          buildSnippet(buffer, headerStart),
        );
      }
      throw err;
    }
    const { tag, vr, length } = header;

    const position = { byteOffset: headerStart };

    // VR-mismatch check (TOL-08): only meaningful for STANDARD tags
    // (private tags have no dictionary entry to compare against).
    const groupNum = parseInt(tag.slice(0, 4), 16);
    const isPrivate = groupNum % 2 === 1;
    if (!isPrivate) {
      const dictEntry = dictionaryLookup(tag);
      const dictVr = dictEntry?.vr[0];
      if (dictVr !== undefined && dictVr !== vr) {
        emit(vrMismatch(position, tag, dictVr, vr));
      }
    }

    // Odd-length warning (TOL-07): emitted for explicit-length values
    // whose declared length is odd. Don't pad — that's the serializer's
    // job (Phase 5).
    if (length !== UNDEFINED_LENGTH && length % 2 === 1) {
      emit(oddLengthValuePadded(position, tag, length));
    }

    // SQ branch.
    if (vr === "SQ") {
      const valueStart = cursor.position;
      let seqResult;
      if (length === UNDEFINED_LENGTH) {
        emit(undefinedLengthInExplicitVR(position, tag));
        const seqOpts: ParseSequenceOptions = {
          explicitLength: undefined,
          littleEndian: mode.littleEndian,
          innerStrategy: mode.innerStrategy,
        };
        seqResult = parseSequence(buffer, valueStart, ctx, emit, seqOpts);
      } else {
        const seqOpts: ParseSequenceOptions = {
          explicitLength: length,
          littleEndian: mode.littleEndian,
          innerStrategy: mode.innerStrategy,
        };
        seqResult = parseSequence(buffer, valueStart, ctx, emit, seqOpts);
      }
      cursor.position = seqResult.endOffset;
      const rawBytes = ctx.copyValues
        ? copyValueBytes(buffer.subarray(headerStart, cursor.position))
        : buffer.subarray(headerStart, cursor.position);
      const privateCreator = resolvePrivateCreator(tag, ctx);
      elements.set(
        tag,
        new Element({
          tag,
          vr: "SQ",
          vm: seqResult.items.length,
          length,
          rawBytes,
          byteOffset: headerStart,
          littleEndian: mode.littleEndian,
          items: seqResult.items,
          ...(privateCreator !== undefined ? { privateCreator } : {}),
        }),
      );
      continue;
    }

    // Encapsulated pixel data branch (D-31): (7FE0,0010) OB undefined-length.
    if (tag === "7FE00010" && vr === "OB" && length === UNDEFINED_LENGTH) {
      const valueStart = cursor.position;
      const seqOpts: ParseSequenceOptions = {
        explicitLength: undefined,
        littleEndian: mode.littleEndian,
        innerStrategy: mode.innerStrategy,
        encapsulatedPixelData: true,
      };
      const result = parseSequence(buffer, valueStart, ctx, emit, seqOpts);
      cursor.position = result.endOffset;
      const rawBytes = ctx.copyValues
        ? copyValueBytes(buffer.subarray(headerStart, cursor.position))
        : buffer.subarray(headerStart, cursor.position);
      elements.set(
        tag,
        new Element({
          tag,
          vr: "OB", // NOT promoted; Phase 4 surfaces fragments.
          vm: result.items.length,
          length: UNDEFINED_LENGTH,
          rawBytes,
          byteOffset: headerStart,
          littleEndian: mode.littleEndian,
          items: result.items,
        }),
      );
      continue;
    }

    // CP-246 fallback (D-30): VR=UN AND length=0xFFFFFFFF.
    if (vr === "UN" && length === UNDEFINED_LENGTH) {
      const valueStart = cursor.position;
      const cp246 = tryParseUnAsSQ(
        buffer,
        valueStart,
        UNDEFINED_LENGTH,
        ctx,
        emit,
        parseImplicitLE,
      );
      if (cp246.success) {
        cursor.position = cp246.endOffset;
        const rawBytes = ctx.copyValues
          ? copyValueBytes(buffer.subarray(headerStart, cursor.position))
          : buffer.subarray(headerStart, cursor.position);
        const privateCreator = resolvePrivateCreator(tag, ctx);
        elements.set(
          tag,
          new Element({
            tag,
            vr: "SQ", // Promoted.
            vm: cp246.items.length,
            length: UNDEFINED_LENGTH,
            rawBytes,
            byteOffset: headerStart,
            cp246Promoted: true,
            littleEndian: mode.littleEndian,
            items: cp246.items,
            ...(privateCreator !== undefined ? { privateCreator } : {}),
          }),
        );
        continue;
      }
      // Failure path: per CONTEXT D-30 "restore VR=UN with raw bytes
      // preserved". UN with undefined length is malformed if it isn't a
      // CP-246 SQ — we cannot reliably know where the value ends, so the
      // conservative interpretation is to consume the remainder of the
      // input as the UN value (best-effort, documented in D-30 + plan
      // 02-04 task 2 behavior section). The cursor advances to
      // end-of-buffer so the dataset loop terminates cleanly.
      const privateCreator = resolvePrivateCreator(tag, ctx);
      const fallbackEnd = buffer.length;
      const fallbackBytes = ctx.copyValues
        ? copyValueBytes(buffer.subarray(headerStart, fallbackEnd))
        : buffer.subarray(headerStart, fallbackEnd);
      elements.set(
        tag,
        new Element({
          tag,
          vr: "UN",
          vm: 0,
          length: UNDEFINED_LENGTH,
          rawBytes: fallbackBytes,
          byteOffset: headerStart,
          littleEndian: mode.littleEndian,
          ...(privateCreator !== undefined ? { privateCreator } : {}),
        }),
      );
      cursor.position = fallbackEnd;
      continue;
    }

    // Plain explicit-length value (any non-SQ, non-CP-246, non-encap-PD VR).
    if (length === UNDEFINED_LENGTH) {
      // Undefined length on a non-SQ / non-OB-encap / non-UN VR is
      // structurally invalid under Explicit VR.
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        `Undefined length on non-SQ element ${tag} (vr=${vr}) under Explicit VR.`,
        headerStart,
        buildSnippet(buffer, headerStart),
      );
    }
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
      ? copyValueBytes(buffer.subarray(valueStart, valueEnd))
      : buffer.subarray(valueStart, valueEnd);
    cursor.position = valueEnd;

    // TOL-10: group-length elements in non-File-Meta groups.
    const elementHexNum = parseInt(tag.slice(4, 8), 16);
    if (elementHexNum === 0x0000 && groupNum !== 0x0002) {
      emit(groupLengthInDataset(position, tag));
    }

    // Private Creator slot (gggg,0010..00FF) — register into the stack.
    if (groupNum % 2 === 1 && elementHexNum >= 0x0010 && elementHexNum <= 0x00ff) {
      registerPrivateCreator(tag, valueSlice, ctx);
    }

    // (0008,0005) Specific Character Set governs subsequent text decode.
    applySpecificCharacterSet(tag, valueSlice, ctx, emit, position);

    const privateCreator = resolvePrivateCreator(tag, ctx);
    const finalVr: VR = vr; // Postel: trust on-wire VR (warning already emitted on mismatch).
    elements.set(
      tag,
      new Element({
        tag,
        vr: finalVr,
        // Phase 2 placeholder — Phase 3 derives VM from VR + value layout.
        vm: 1,
        length,
        rawBytes: valueSlice,
        byteOffset: headerStart,
        littleEndian: mode.littleEndian,
        ...(ctx.currentCharset !== undefined ? { specificCharacterSet: ctx.currentCharset } : {}),
        ...(privateCreator !== undefined ? { privateCreator } : {}),
      }),
    );
  }

  return { elements, endOffset: cursor.position };
}

/**
 * Public Explicit VR Little Endian strategy. 1-line wrapper over
 * {@link _parseExplicit}; the BE strategy in `./explicit-be.ts` calls the
 * same shared helper with `littleEndian: false`.
 *
 * @internal
 */
export function parseExplicitLE(
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
    { littleEndian: true, innerStrategy: parseExplicitLE },
    opts,
  );
}

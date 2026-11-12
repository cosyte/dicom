/**
 * Explicit VR Little Endian dataset parser (`1.2.840.10008.1.2.1`)
 * AND the shared body that Explicit VR Big Endian wraps.
 *
 * Five rules govern it:
 *   - Short-form / long-form element header layout (8 vs 12 bytes).
 *     `LONG_FORM_VRS` from `element-header.ts` lists the 10 VRs that use
 *     the long-form. Reserved bytes ≠ 0x00 0x00 emit
 *     `DICOM_NONZERO_RESERVED_BYTES`.
 *   - FFFE markers route through the same endian-aware ByteCursor
 *     as every other read; ItemDelim termination of undefined-length items
 *     is supported via `opts.stopOnItemDelim`.
 *   - An undefined-length SQ is conformant under Explicit VR, so it is read
 *     with no warning. PS3.5 2026c section 7.1.2: "Undefined Lengths may be
 *     used for Data Elements having the Value Representation (VR) Sequence of
 *     Items (SQ) and Unknown (UN)", and Table 7.5-2 is an Explicit VR example of
 *     one. Undefined length on any other VR, outside the two cases below, is
 *     still refused with a thrown `INVALID_FILE_META`.
 *   - CP-246 fallback: when `VR=UN` AND `length=0xFFFFFFFF`, attempt
 *     SQ descent using **Implicit VR LE inner encoding**. On success →
 *     promote element to `VR=SQ` + emit `DICOM_UN_PARSED_AS_SQ` + set
 *     `cp246Promoted: true`. On failure → keep `VR=UN` + raw bytes
 *     (best-effort empty when undefined-length).
 *   - `(7FE0,0010) VR=OB length=0xFFFFFFFF` is encapsulated pixel
 *     data; SQ-style fragment iteration; element keeps `vr=OB`, and a stream
 *     with no Sequence Delimitation Item emits
 *     `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED`. This is also the reader for
 *     every PS3.5 2026c section A.4 encapsulation Transfer Syntax, whose Data
 *     Set A.4 makes Explicit VR Little Endian.
 *
 * Threat model:
 *   - Every cursor read is wrapped; a RangeError becomes a typed throw.
 *   - The depth cap is enforced inside parseSequence.
 *   - Non-zero reserved bytes are NOT trusted to drive parsing;
 *     length is read from the explicit 4-byte field.
 *   - `ctx.copyValues === true` → `Buffer.from(slice)`.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import { tableOf, type ParsedDataSet } from "../dataset/compact.js";
import { tagEntry } from "../dictionary/registry.js";
import type { Tag } from "../dictionary/types.js";
import { ByteCursor } from "./byte-cursor.js";
import { defineRow } from "./data-set-map.js";
import {
  applySpecificCharacterSet,
  emptyExplicitElementHeader,
  readExplicitElementHeader,
  registerPrivateCreator,
  resolvePrivateCreator,
  safeModelCreator,
} from "./element-header.js";
import {
  elementLengthExceedsBuffer,
  truncatedDatasetHeader,
  truncatedExplicitVrHeader,
  truncatedFffeHeader,
  undefinedLengthOnNonSqExplicit,
  unexpectedFffeAtDatasetLevel,
} from "./fatals.js";
import { noteAssumedCharset } from "./fallback.js";
import { parseImplicitLE } from "./implicit-le.js";
import {
  parseSequence,
  tryParseUnAsSQ,
  type InnerParser,
  type ParseSequenceOptions,
} from "./sequence.js";
import { stopsHere } from "./stop.js";
import type { DicomPosition, ParseContext } from "./types.js";
import {
  groupLengthInDataset,
  oddLengthValuePadded,
  pixelDataFragmentsNotDelimited,
  vrMismatch,
  type DicomParseWarning,
} from "./warnings.js";

const UNDEFINED_LENGTH = 0xffffffff;

/** The `(0008,0005)` Specific Character Set tag. */
const SPECIFIC_CHARACTER_SET_TAG: Tag = "00080005";

/**
 * The record every Explicit VR header is read into, at every depth. The element
 * loop takes each field out of it as soon as it is read, so a nested Data Set's
 * reads cannot reach a header still in use.
 */
const HEADER = emptyExplicitElementHeader();

/**
 * Shared Explicit-VR element loop used by both the LE and BE
 * strategies. The only TS-specific knobs are:
 *   - `mode.littleEndian` - drives ByteCursor + FFFE marker reads.
 *   - `mode.innerStrategy` - passed as `innerStrategy` when descending SQ
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
  mode: ExplicitMode,
  opts: { stopOnItemDelim?: boolean } = {},
): ParsedDataSet {
  const cursor = new ByteCursor(buffer, mode.littleEndian, datasetStart);
  const table = tableOf(ctx);
  table.begin(buffer);
  const delta = table.deltaOf(buffer);
  const set = table.openSet();

  while (cursor.position < buffer.length) {
    const headerStart = cursor.position;

    // `ParseOptions.stopBeforeTag`: the top-level Data Set ends here when this element is at or
    // after the stop tag. See `./stop.ts`.
    if (ctx.stop !== undefined && stopsHere(buffer, headerStart, mode.littleEndian, ctx, emit)) {
      break;
    }

    // Detect FFFE markers BEFORE the explicit-VR header read - FFFE
    // markers have no on-wire VR field and would mis-decode through
    // readExplicitElementHeader. Peek, then decide.
    let peekGroup: number;
    try {
      peekGroup = cursor.readUInt16At(cursor.position);
    } catch (err) {
      /* v8 ignore else -- unreachable: the cursor reads throw only RangeError. */
      if (err instanceof RangeError) {
        throw truncatedDatasetHeader(ctx.frame, headerStart);
      }
      /* v8 ignore next -- unreachable: the cursor reads throw only RangeError. */
      throw err;
    }

    if (peekGroup === 0xfffe) {
      // FFFE marker: 4-byte tag + 4-byte length, no VR.
      let grp: number;
      let ele: number;
      try {
        grp = cursor.readUInt16();
        ele = cursor.readUInt16();
        // Read to advance the cursor past the marker, and deliberately not bound
        // to a name: the only thing that ever consumed it was the fatal message
        // below, where it rendered four bytes of the document. See `./fatals.ts`.
        cursor.readUInt32();
      } catch (err) {
        /* v8 ignore else -- unreachable: the cursor reads throw only RangeError. */
        if (err instanceof RangeError) {
          throw truncatedFffeHeader(ctx.frame, headerStart);
        }
        /* v8 ignore next -- unreachable: the cursor reads throw only RangeError. */
        throw err;
      }
      // `(FFFE,E00D)` Item Delimitation Item, compared as numbers.
      if (opts.stopOnItemDelim === true && grp === 0xfffe && ele === 0xe00d) {
        // ItemDelim - cursor consumed past the 8-byte marker.
        return table.closeSet(set, delta, cursor.position);
      }
      throw unexpectedFffeAtDatasetLevel(ctx.frame, headerStart);
    }

    // Standard Explicit-VR element header.
    let header;
    try {
      header = readExplicitElementHeader(cursor, ctx, emit, HEADER);
    } catch (err) {
      if (err instanceof RangeError) {
        throw truncatedExplicitVrHeader(ctx.frame, headerStart);
      }
      throw err;
    }
    // Every field is taken out of the shared record here, before anything below
    // can read another header into it.
    const { tag, vr, length, group: groupNum, element: elementNum, headerLength } = header;

    // One position per element, made the first time a warning needs it, and
    // shared by every warning raised for the element.
    let position: DicomPosition | undefined;

    // VR-mismatch check: only meaningful for STANDARD tags
    // (private tags have no dictionary entry to compare against). A row that
    // lists several VRs ("US or SS", "OB or OW") accepts any of them, so the
    // on-wire VR mismatches only when the row lists none like it. The warning
    // names the row's first VR.
    const isPrivate = groupNum % 2 === 1;
    if (!isPrivate) {
      // The tag is eight upper-case hex digits, so this is `Dictionary.lookup`'s answer.
      const dictVrs = tagEntry(tag)?.vr;
      const dictVr = dictVrs?.[0];
      if (dictVr !== undefined && dictVrs?.includes(vr) === false) {
        emit(vrMismatch((position ??= { byteOffset: headerStart }), tag, dictVr, vr));
      }
    }

    // Odd-length warning: emitted for explicit-length values whose declared
    // length is odd. Don't pad - that is the serializer's job.
    if (length !== UNDEFINED_LENGTH && length % 2 === 1) {
      emit(oddLengthValuePadded((position ??= { byteOffset: headerStart }), tag));
    }

    // SQ branch.
    if (vr === "SQ") {
      const valueStart = cursor.position;
      let seqResult;
      if (length === UNDEFINED_LENGTH) {
        seqResult = parseSequence(buffer, valueStart, ctx, emit, mode.undefinedLengthSequence);
      } else {
        const seqOpts: ParseSequenceOptions = {
          explicitLength: length,
          littleEndian: mode.littleEndian,
          innerStrategy: mode.innerStrategy,
        };
        seqResult = parseSequence(buffer, valueStart, ctx, emit, seqOpts);
      }
      cursor.position = seqResult.endOffset;
      const privateCreator = isPrivate
        ? safeModelCreator(resolvePrivateCreator(tag, ctx), ctx)
        : undefined;
      // `rawBytes` is the whole on-wire span, header included.
      defineRow(
        table,
        set,
        emit,
        groupNum,
        elementNum,
        "SQ",
        length,
        headerStart,
        mode.littleEndian,
        0,
        undefined,
        privateCreator,
        delta + cursor.position,
        seqResult.itemFirst,
        seqResult.itemCount,
        false,
      );
      continue;
    }

    // Encapsulated pixel data branch: (7FE0,0010) OB undefined-length.
    if (tag === "7FE00010" && vr === "OB" && length === UNDEFINED_LENGTH) {
      const valueStart = cursor.position;
      const result = parseSequence(buffer, valueStart, ctx, emit, mode.pixelDataSequence);
      if (!result.delimited) {
        // The stream ran out after its last whole Item with no (FFFE,E0DD), so
        // the fragment list may be short. Declared, never fatal: the metadata
        // is intact (PS3.5 2026c section A.4 requires the delimiter).
        emit(pixelDataFragmentsNotDelimited((position ??= { byteOffset: headerStart })));
      }
      cursor.position = result.endOffset;
      defineRow(
        table,
        set,
        emit,
        groupNum,
        elementNum,
        // NOT promoted: the value stays `binary` over the whole on-wire span.
        // `readPixelDataFragments` walks that span for the Basic Offset Table
        // and the fragments.
        "OB",
        UNDEFINED_LENGTH,
        headerStart,
        mode.littleEndian,
        0,
        undefined,
        undefined,
        delta + cursor.position,
        result.itemFirst,
        result.itemCount,
        false,
      );
      continue;
    }

    // CP-246 fallback: VR=UN AND length=0xFFFFFFFF.
    if (vr === "UN" && length === UNDEFINED_LENGTH) {
      const valueStart = cursor.position;
      const cp246 = tryParseUnAsSQ(
        buffer,
        valueStart,
        UNDEFINED_LENGTH,
        ctx,
        emit,
        parseImplicitLE,
        tag,
      );
      if (cp246.success) {
        cursor.position = cp246.endOffset;
        const privateCreator = safeModelCreator(resolvePrivateCreator(tag, ctx), ctx);
        defineRow(
          table,
          set,
          emit,
          groupNum,
          elementNum,
          "SQ", // Promoted.
          UNDEFINED_LENGTH,
          headerStart,
          mode.littleEndian,
          0,
          undefined,
          privateCreator,
          delta + cursor.position,
          cp246.itemFirst,
          cp246.itemCount,
          true,
        );
        continue;
      }
      // Failure path: restore VR=UN with raw bytes preserved. UN with
      // undefined length is malformed if it isn't a CP-246 SQ - we cannot
      // reliably know where the value ends, so the conservative
      // interpretation is to consume the remainder of the input as the UN
      // value (best-effort). The cursor advances to end-of-buffer so the
      // dataset loop terminates cleanly.
      const privateCreator = safeModelCreator(resolvePrivateCreator(tag, ctx), ctx);
      const fallbackEnd = buffer.length;
      defineRow(
        table,
        set,
        emit,
        groupNum,
        elementNum,
        "UN",
        UNDEFINED_LENGTH,
        headerStart,
        mode.littleEndian,
        0,
        undefined,
        privateCreator,
        delta + fallbackEnd,
        0,
        -1,
        false,
      );
      cursor.position = fallbackEnd;
      continue;
    }

    // Plain explicit-length value (any non-SQ, non-CP-246, non-encap-PD VR).
    if (length === UNDEFINED_LENGTH) {
      // Undefined length on a non-SQ / non-OB-encap / non-UN VR is
      // structurally invalid under Explicit VR.
      throw undefinedLengthOnNonSqExplicit(ctx.frame, headerStart, vr);
    }
    if (cursor.position + length > buffer.length) {
      // NEITHER length is passed, and the second one is the ninth instance of
      // the diagnostic PHI-residuals defect. `buffer.length - cursor.position` is
      // the enclosing frame's size less the bytes consumed, and this loop runs
      // over a defined-length Item's SLICE as readily as over the input, so in
      // that frame the subtraction publishes the Item's own 32-bit declared
      // length beside the offset that reverses it. The factory takes a parameter
      // for neither. See `elementLengthExceedsBuffer`.
      throw elementLengthExceedsBuffer(ctx.frame, headerStart);
    }
    const valueStart = cursor.position;
    const valueEnd = valueStart + length;
    cursor.position = valueEnd;

    // Group-length elements in non-File-Meta groups.
    const elementHexNum = elementNum;
    if (elementHexNum === 0x0000 && groupNum !== 0x0002) {
      emit(groupLengthInDataset((position ??= { byteOffset: headerStart })));
    }

    // Private Creator slot (gggg,0010..00FF) - register into the stack.
    if (groupNum % 2 === 1 && elementHexNum >= 0x0010 && elementHexNum <= 0x00ff) {
      registerPrivateCreator(tag, buffer.subarray(valueStart, valueEnd), ctx);
    }

    // (0008,0005) Specific Character Set governs subsequent text decode.
    if (tag === SPECIFIC_CHARACTER_SET_TAG) {
      applySpecificCharacterSet(
        tag,
        buffer.subarray(valueStart, valueEnd),
        ctx,
        emit,
        (position ??= { byteOffset: headerStart }),
      );
    }

    // The first text element read under `ParseOptions.fallbackCharacterSet` says so, once.
    if (ctx.fallback !== undefined) {
      noteAssumedCharset(
        ctx.fallback,
        ctx,
        emit,
        (position ??= { byteOffset: headerStart }),
        tag,
        vr,
      );
    }

    // An even group has no Private Creator, so it skips the reservation lookup.
    const privateCreator = isPrivate
      ? safeModelCreator(resolvePrivateCreator(tag, ctx), ctx)
      : undefined;
    // Postel: trust on-wire VR (warning already emitted on mismatch). VM is 1, a placeholder:
    // the value decoders derive it from VR + value layout.
    defineRow(
      table,
      set,
      emit,
      groupNum,
      elementNum,
      vr,
      length,
      headerStart,
      mode.littleEndian,
      headerLength,
      ctx.currentCharset,
      privateCreator,
      -1,
      0,
      -1,
      false,
    );
  }

  return table.closeSet(set, delta, cursor.position);
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
): ParsedDataSet {
  return _parseExplicit(buffer, datasetStart, ctx, emit, LE_MODE, opts);
}

/**
 * What one Explicit VR transfer syntax reads with: its byte order, the reader its Items are read
 * with, and the options of its undefined-length Sequences and its encapsulated Pixel Data, made once
 * rather than for every Sequence.
 *
 * @internal
 */
export interface ExplicitMode {
  readonly littleEndian: boolean;
  readonly innerStrategy: InnerParser;
  readonly undefinedLengthSequence: ParseSequenceOptions;
  readonly pixelDataSequence: ParseSequenceOptions;
}

/**
 * The {@link ExplicitMode} of a byte order and its Item reader.
 *
 * @internal
 */
export function explicitMode(littleEndian: boolean, innerStrategy: InnerParser): ExplicitMode {
  return {
    littleEndian,
    innerStrategy,
    undefinedLengthSequence: { explicitLength: undefined, littleEndian, innerStrategy },
    pixelDataSequence: {
      explicitLength: undefined,
      littleEndian,
      innerStrategy,
      encapsulatedPixelData: true,
    },
  };
}

const LE_MODE = explicitMode(true, parseExplicitLE);

/**
 * Shared SQ (Sequence) + FFFE marker parser used by all three structural
 * transfer-syntax strategies (Implicit-LE, Explicit-LE, Explicit-BE).
 *
 * Phase 2 core-parser context:
 *   - D-25 — FFFE item-marker reads route through the same endian-aware
 *     ByteCursor as every other read (closes the BE-FFFE bug per
 *     PITFALLS.md §2.3).
 *   - D-28 — Encoding-context stack (`Root | SqItem | EncapsulatedPixelData`).
 *     Empty item (`(FFFE,E000) length=0`) is tolerated — emit
 *     `DICOM_EMPTY_ITEM_IN_SEQUENCE` and continue.
 *   - D-29 — Undefined-length SQ in Explicit VR is legal but emits
 *     `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` (caller responsibility — the
 *     warning fires from the per-TS strategy, NOT from inside parseSequence
 *     because Implicit-LE-undefined-length-SQ is the spec-default form for
 *     that TS).
 *   - D-30 — CP-246 fallback: when `VR=UN` AND `length=0xFFFFFFFF` under
 *     Explicit VR, attempt SQ descent using **Implicit VR LE inner
 *     encoding**. On success → promote element to `VR=SQ` + emit
 *     `DICOM_UN_PARSED_AS_SQ`. On failure → restore state + NO warning.
 *     Implemented as `tryParseUnAsSQ`.
 *   - D-31 — Encapsulated pixel data (`(7FE0,0010) VR=OB length=0xFFFFFFFF`):
 *     each FFFE,E000 item is a fragment (Phase 2 records the structure as
 *     empty Items; Phase 4 surfaces fragments + Basic Offset Table via
 *     `ds.pixelData`).
 *
 * Threat model:
 *   - T-02-04-01: Buffer over-read on truncated input. All `cursor.slice(N)`
 *     and `cursor.position + N > buffer.length` paths throw
 *     `DicomParseError(INVALID_FILE_META)` with header offset + 16-byte
 *     hex snippet. RangeError-from-cursor is caught and re-thrown.
 *   - T-02-04-02: Stack overflow via deeply-nested SQ. `ctx.nestingDepth`
 *     increments on entry and decrements on exit; on exceed 64, throws
 *     `DicomParseError(INVALID_FILE_META, 'SQ nesting depth exceeds 64',
 *     ...)`.
 *   - T-02-04-03: CPU DoS via pathological CP-246. tryParseUnAsSQ caps
 *     attempts at the same nesting-depth limit; on parse failure, state
 *     is restored — no infinite retry loop.
 *
 * Circular-import note: `parseSequence` calls into the per-TS parsers
 * (Implicit-LE / Explicit-LE / Explicit-BE), and those parsers ALSO call
 * `parseSequence`. The cycle is broken by passing the inner strategy in
 * via `ParseSequenceOptions.innerStrategy` rather than importing it
 * statically — each per-TS parser passes itself into parseSequence via
 * the `innerStrategy` field.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import { Item } from "../dataset/item.js";
import { joinTag } from "../dataset/tag.js";
import type { Tag } from "../dictionary/types.js";
import { ByteCursor } from "./byte-cursor.js";
import { buildSnippet, DicomParseError, FATAL_CODES } from "./errors.js";
import { WARNING_CODES } from "./warnings.js";
import type { ParseContext } from "./types.js";
import { emptyItemInSequence, unParsedAsSQ, type DicomParseWarning } from "./warnings.js";

const ITEM_TAG: Tag = "FFFEE000";
// `(FFFE,E00D)` ItemDelim is consumed by the inner-strategy via the
// `stopOnItemDelim` contract — never directly inside parseSequence.
const SEQ_DELIM_TAG: Tag = "FFFEE0DD";
const UNDEFINED_LENGTH = 0xffffffff;

/**
 * Hard cap on SQ nesting depth (T-02-04-02). Exceeding this throws
 * `DicomParseError(INVALID_FILE_META, 'SQ nesting depth exceeds 64', ...)`.
 */
export const NESTING_DEPTH_LIMIT = 64;

/**
 * Inner-parser strategy signature consumed by `parseSequence`. Each per-TS
 * parser accepts a `stopOnItemDelim?: boolean` option — when set, the
 * inner element loop terminates upon reading `(FFFE,E00D)` ItemDelim
 * (cursor advanced past the delim's 4-byte length field) and the parser
 * returns the post-delim offset.
 *
 * @internal
 */
export type InnerParser = (
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  opts?: { stopOnItemDelim?: boolean },
) => { elements: ReadonlyMap<Tag, Element>; endOffset: number };

/**
 * Options accepted by {@link parseSequence}. Caller-supplied `innerStrategy`
 * breaks the circular import between `sequence.ts` and the per-TS parsers
 * that depend on it.
 *
 * @internal
 */
export interface ParseSequenceOptions {
  /**
   * `undefined` → parse items until `(FFFE,E0DD)` SeqDelim. Otherwise
   * → parse items for exactly `explicitLength` bytes from `valueStart`.
   */
  readonly explicitLength: number | undefined;
  /** `true` for LE TS (Implicit-LE / Explicit-LE), `false` for Explicit-BE. */
  readonly littleEndian: boolean;
  /** Per-TS element parser; passed in by the calling strategy. */
  readonly innerStrategy: InnerParser;
  /**
   * `true` when the SQ wraps encapsulated pixel data (D-31). Each FFFE,E000
   * item is a raw fragment (no inner element parsing); the first item is
   * the Basic Offset Table per PS3.5 §A.4.
   */
  readonly encapsulatedPixelData?: boolean;
}

/** Result shape returned by {@link parseSequence}. */
export interface ParseSequenceResult {
  readonly items: readonly Item[];
  /** Offset just past the last byte consumed (after SeqDelim, or at +explicitLength). */
  readonly endOffset: number;
}

/**
 * Parse the value bytes of an SQ element (or encapsulated-pixel-data
 * element) starting at `valueStart`. The caller has already consumed the
 * SQ Element header (group/element/VR/length); this function consumes
 * the item bodies + delimiters and returns the items array + the offset
 * where parsing finished.
 *
 * Phase 2 surfaces only the structural shape — the per-TS strategy DOES
 * NOT thread the resulting items onto the SQ Element. Per D-04, Phase 2
 * SQ Elements expose only `rawBytes` covering the on-wire span; Phase 3
 * lazily re-parses for navigation.
 *
 * @internal
 */
export function parseSequence(
  buffer: Buffer,
  valueStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  opts: ParseSequenceOptions,
): ParseSequenceResult {
  ctx.nestingDepth += 1;
  if (ctx.nestingDepth > NESTING_DEPTH_LIMIT) {
    // Decrement before throwing so caller `finally` rebalancing isn't
    // double-decremented (parseSequence's own try/finally below would
    // decrement again — but we throw BEFORE the try block, so do it here).
    ctx.nestingDepth -= 1;
    throw new DicomParseError(
      FATAL_CODES.INVALID_FILE_META,
      `SQ nesting depth exceeds ${String(NESTING_DEPTH_LIMIT)}.`,
      valueStart,
      buildSnippet(buffer, valueStart),
    );
  }
  ctx.encodingContextStack.push(
    opts.encapsulatedPixelData === true ? "EncapsulatedPixelData" : "SqItem",
  );
  // Items inherit the parent dataset's charset; an item's own (0008,0005)
  // override must NOT leak to sibling items or back to the parent.
  const parentCharset = ctx.currentCharset;
  const restoreParentCharset = (): void => {
    if (parentCharset === undefined) {
      delete ctx.currentCharset;
    } else {
      ctx.currentCharset = parentCharset;
    }
  };

  try {
    const cursor = new ByteCursor(buffer, opts.littleEndian, valueStart);
    const items: Item[] = [];
    const endLimit =
      opts.explicitLength !== undefined ? valueStart + opts.explicitLength : buffer.length;

    let itemIndex = 0;
    while (cursor.position < endLimit) {
      const itemHeaderStart = cursor.position;
      let group: number;
      let element: number;
      let itemLength: number;
      try {
        group = cursor.readUInt16();
        element = cursor.readUInt16();
        itemLength = cursor.readUInt32();
      } catch (err) {
        if (err instanceof RangeError) {
          throw new DicomParseError(
            FATAL_CODES.INVALID_FILE_META,
            "Truncated dataset (SQ item header read past buffer end).",
            itemHeaderStart,
            buildSnippet(buffer, itemHeaderStart),
          );
        }
        throw err;
      }
      const itemTag = joinTag(group, element);

      if (itemTag === SEQ_DELIM_TAG) {
        // SeqDelim — skip the 4-byte length field (already consumed) and exit.
        return { items, endOffset: cursor.position };
      }
      if (itemTag !== ITEM_TAG) {
        throw new DicomParseError(
          FATAL_CODES.INVALID_FILE_META,
          `Unexpected tag ${itemTag} inside sequence (expected FFFE,E000 or FFFE,E0DD).`,
          itemHeaderStart,
          buildSnippet(buffer, itemHeaderStart),
        );
      }

      // (FFFE,E000) Item header consumed. itemLength holds the value-area length.
      if (itemLength === 0) {
        emit(emptyItemInSequence({ byteOffset: itemHeaderStart }, itemTag));
        items.push(
          new Item({
            warnings: [],
            elements: new Map(),
            index: itemIndex,
          }),
        );
        itemIndex += 1;
        continue;
      }

      if (opts.encapsulatedPixelData === true) {
        // Pixel-data fragment: consume `itemLength` bytes verbatim. Phase 4
        // surfaces the bytes; Phase 2 records each fragment as a structural
        // (empty) Item and advances the cursor past its raw bytes.
        if (cursor.position + itemLength > buffer.length) {
          throw new DicomParseError(
            FATAL_CODES.INVALID_FILE_META,
            `Encapsulated pixel data fragment length=${String(itemLength)} exceeds remaining buffer.`,
            itemHeaderStart,
            buildSnippet(buffer, itemHeaderStart),
          );
        }
        cursor.position += itemLength;
        items.push(new Item({ warnings: [], elements: new Map(), index: itemIndex }));
        itemIndex += 1;
        continue;
      }

      // Reset to the parent charset before each item so an item's own
      // (0008,0005) cannot leak to its siblings.
      restoreParentCharset();
      if (itemLength === UNDEFINED_LENGTH) {
        // Undefined-length item — call innerStrategy with stopOnItemDelim;
        // it returns the post-ItemDelim offset.
        const inner = opts.innerStrategy(buffer, cursor.position, ctx, emit, {
          stopOnItemDelim: true,
        });
        items.push(new Item({ warnings: [], elements: inner.elements, index: itemIndex }));
        cursor.position = inner.endOffset;
      } else {
        // Defined-length item — slice and parse exactly `itemLength` bytes.
        if (cursor.position + itemLength > buffer.length) {
          throw new DicomParseError(
            FATAL_CODES.INVALID_FILE_META,
            `Item length=${String(itemLength)} exceeds remaining buffer.`,
            itemHeaderStart,
            buildSnippet(buffer, itemHeaderStart),
          );
        }
        const itemSlice = buffer.subarray(cursor.position, cursor.position + itemLength);
        const inner = opts.innerStrategy(itemSlice, 0, ctx, emit);
        items.push(new Item({ warnings: [], elements: inner.elements, index: itemIndex }));
        cursor.position += itemLength;
      }
      itemIndex += 1;
    }

    return { items, endOffset: cursor.position };
  } finally {
    ctx.nestingDepth -= 1;
    ctx.encodingContextStack.pop();
    restoreParentCharset();
  }
}

/**
 * CP-246 fallback per D-30. When an Explicit-VR element has `VR=UN` AND
 * `length=0xFFFFFFFF`, attempt to descend the bytes as Implicit VR LE SQ
 * items. On any failure, restore parser state (warnings, nestingDepth,
 * encodingContextStack) and signal failure to the caller.
 *
 * On success, emits `DICOM_UN_PARSED_AS_SQ` and returns the items array
 * + the post-descent endOffset (relative to the OUTER buffer's
 * `valueStart`).
 *
 * @param buffer The outer buffer.
 * @param valueStart Offset of the UN value's first byte in the outer buffer.
 * @param valueLength The UN element's declared length (typically `0xFFFFFFFF`).
 *                    When undefined-length, the descent uses the slice from
 *                    `valueStart` to end-of-buffer.
 * @param implicitLeInner The Implicit-VR-LE parser, passed in by caller.
 *
 * @internal
 */
export function tryParseUnAsSQ(
  buffer: Buffer,
  valueStart: number,
  valueLength: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  implicitLeInner: InnerParser,
): { success: boolean; items: readonly Item[]; endOffset: number } {
  // Save state for rollback (T-02-04-03 mitigation).
  const savedDepth = ctx.nestingDepth;
  const savedStackLen = ctx.encodingContextStack.length;
  const savedWarningsLen = ctx.warnings.length;

  try {
    const slice =
      valueLength === UNDEFINED_LENGTH
        ? buffer.subarray(valueStart)
        : buffer.subarray(valueStart, valueStart + valueLength);
    const opts: ParseSequenceOptions = {
      explicitLength: valueLength === UNDEFINED_LENGTH ? undefined : valueLength,
      littleEndian: true, // CP-246: Implicit VR LE inner per D-30.
      innerStrategy: implicitLeInner,
    };
    const result = parseSequence(slice, 0, ctx, emit, opts);
    emit(unParsedAsSQ({ byteOffset: valueStart }, "UN"));
    return {
      success: true,
      items: result.items,
      endOffset: valueStart + result.endOffset,
    };
  } catch (err) {
    // Strict-mode escalation (D-36): the emit chokepoint throws
    // `DicomParseError` carrying a Tier-2 `WarningCode` when ctx.strict is
    // true. Those throws must propagate. Tier-3 structural fatals
    // (`FatalCode`) thrown mid-descent indicate the bytes don't actually
    // form a valid SQ — fall back to UN-as-bytes as designed.
    if (err instanceof DicomParseError) {
      const warningCodeValues = Object.values(WARNING_CODES) as readonly string[];
      if (warningCodeValues.includes(err.code)) {
        throw err;
      }
    }
    // Restore state — drop any warnings emitted during the failed descent.
    ctx.nestingDepth = savedDepth;
    while (ctx.encodingContextStack.length > savedStackLen) {
      ctx.encodingContextStack.pop();
    }
    while (ctx.warnings.length > savedWarningsLen) {
      ctx.warnings.pop();
    }
    return { success: false, items: [], endOffset: valueStart };
  }
}

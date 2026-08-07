/**
 * Shared SQ (Sequence) + FFFE marker parser used by all three structural
 * transfer-syntax strategies (Implicit-LE, Explicit-LE, Explicit-BE).
 *
 * Phase 2 core-parser context:
 *   - D-25 - FFFE item-marker reads route through the same endian-aware
 *     ByteCursor as every other read (closes the BE-FFFE bug per
 *     PITFALLS.md §2.3).
 *   - D-28 - Encoding-context stack (`Root | SqItem | EncapsulatedPixelData`).
 *     Empty item (`(FFFE,E000) length=0`) is tolerated - emit
 *     `DICOM_EMPTY_ITEM_IN_SEQUENCE` and continue.
 *   - D-29 - Undefined-length SQ in Explicit VR is legal but emits
 *     `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR` (caller responsibility - the
 *     warning fires from the per-TS strategy, NOT from inside parseSequence
 *     because Implicit-LE-undefined-length-SQ is the spec-default form for
 *     that TS).
 *   - D-30 - CP-246 fallback: when `VR=UN` AND `length=0xFFFFFFFF`, attempt
 *     SQ descent using **Implicit VR LE inner encoding**. On success →
 *     promote element to `VR=SQ` + emit `DICOM_UN_PARSED_AS_SQ`. On failure →
 *     restore state + NO warning. Implemented as `tryParseUnAsSQ`, and called
 *     from **both** the Explicit VR strategies (where `UN` is declared on the
 *     wire) and `parseImplicitLE` (where `UN` is what VR resolution returned,
 *     typically for a private element whose Data Set claimed no block). Under
 *     Implicit VR LE the alternative is a Tier-3 fatal on the whole object,
 *     which PS3.5 section 7.5.1 does not license for a readable Data Set.
 *   - D-31 - Encapsulated pixel data (`(7FE0,0010) VR=OB length=0xFFFFFFFF`):
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
 *     is restored - no infinite retry loop.
 *     **No primitive here parses the same bytes twice, and that is the
 *     invariant this threat reduces to once nesting is in play.** A descent
 *     that runs, fails and is retried costs 2x at one level and 2^depth across
 *     nested sequences - the same unbounded-CPU threat by a different route. An
 *     earlier draft of `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` tried a bounded
 *     reading of a defined-length `SQ` and re-parsed item-driven when it was not
 *     adopted, and was measured at 75,475 ms for a 606-byte file with 20 nested
 *     sequences against 0.7 ms for one pass. `tryParseDefinedLengthSQ` and
 *     `tryParseUnAsSQ` roll back and return rather than re-running; the
 *     `DICOM_ITEM_CROSSES_SEQUENCE_END` disclosure below is one integer
 *     comparison and walks nothing. Adding a retry here reopens T-02-04-03.
 *
 * Circular-import note: `parseSequence` calls into the per-TS parsers
 * (Implicit-LE / Explicit-LE / Explicit-BE), and those parsers ALSO call
 * `parseSequence`. The cycle is broken by passing the inner strategy in
 * via `ParseSequenceOptions.innerStrategy` rather than importing it
 * statically - each per-TS parser passes itself into parseSequence via
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
import { DicomParseError } from "./errors.js";
import {
  encapsulatedFragmentExceedsBuffer,
  itemLengthExceedsBuffer,
  sqItemHeaderTruncated,
  sqNestingDepthExceeded,
  unexpectedTagInsideSequence,
} from "./fatals.js";
import type { ParseContext } from "./types.js";
import {
  WARNING_CODES,
  emptyItemInSequence,
  itemCrossesSequenceEnd,
  sqNotDescended,
  unParsedAsSQ,
  type DicomParseWarning,
} from "./warnings.js";

const ITEM_TAG: Tag = "FFFEE000";
// `(FFFE,E00D)` ItemDelim is consumed by the inner-strategy via the
// `stopOnItemDelim` contract - never directly inside parseSequence.
const SEQ_DELIM_TAG: Tag = "FFFEE0DD";
const UNDEFINED_LENGTH = 0xffffffff;

/**
 * Hard cap on SQ nesting depth (T-02-04-02). Exceeding this throws
 * `DicomParseError(INVALID_FILE_META, 'SQ nesting depth exceeds 64', ...)`.
 */
export const NESTING_DEPTH_LIMIT = 64;

/**
 * Inner-parser strategy signature consumed by `parseSequence`. Each per-TS
 * parser accepts a `stopOnItemDelim?: boolean` option - when set, the
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
 * Phase 2 surfaces only the structural shape - the per-TS strategy DOES
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
    // decrement again - but we throw BEFORE the try block, so do it here).
    ctx.nestingDepth -= 1;
    throw sqNestingDepthExceeded(buffer, valueStart, NESTING_DEPTH_LIMIT);
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

  // Private block reservations are scoped to one Data Set, and an Item is one.
  // PS3.5 section 7.5.1: "Each Item Value shall contain a DICOM Data Set
  // composed of Data Elements", and it closes by delegating to section 7.8 for
  // "rules for incorporating Private Data Elements into Sequence Items". There,
  // a Private Creator Data Element `(gggg,0010-00FF)` "shall be used to reserve
  // a block of Elements with Group Number gggg", and Note 1 spells the nesting
  // case out: a private Sequence Data Element may carry repeated Private Data
  // Elements in separate items, and "Each item needs to claim the corresponding
  // private block of Elements".
  //
  // So an Item starts with NO reservations, not with the enclosing Data Set's:
  // it does not inherit them, its own must not leak to a sibling item, and they
  // must not leak back to the parent once the sequence closes. Unlike charset,
  // which items DO inherit, this is a fresh empty map per item.
  //
  // The direction of the failure is what makes this a parser defect and not a
  // tidiness one: the map feeds `resolveImplicitVR`, so a creator resolved from
  // the wrong Data Set yields the wrong VR for the same bytes - a value decoded
  // as something the file does not say. Degrading to UN plus
  // `DICOM_PRIVATE_TAG_NO_CREATOR` is the fail-safe direction and the one an
  // unclaimed block gets, matching how `deidentify()` scopes the same rule.
  const parentCreators = ctx.creators;
  const restoreParentCreators = (): void => {
    ctx.creators = parentCreators;
  };
  const beginItemCreatorScope = (): void => {
    ctx.creators = new Map<number, Map<number, string>>();
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
          throw sqItemHeaderTruncated(buffer, itemHeaderStart);
        }
        throw err;
      }
      const itemTag = joinTag(group, element);

      if (itemTag === SEQ_DELIM_TAG) {
        // SeqDelim - skip the 4-byte length field (already consumed) and exit.
        return { items, endOffset: cursor.position };
      }
      if (itemTag !== ITEM_TAG) {
        throw unexpectedTagInsideSequence(buffer, itemHeaderStart);
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
          throw encapsulatedFragmentExceedsBuffer(buffer, itemHeaderStart);
        }
        cursor.position += itemLength;
        items.push(new Item({ warnings: [], elements: new Map(), index: itemIndex }));
        itemIndex += 1;
        continue;
      }

      // Reset to the parent charset before each item so an item's own
      // (0008,0005) cannot leak to its siblings, and give the item an empty
      // reservation map of its own for the same reason (PS3.5 section 7.8.1).
      restoreParentCharset();
      beginItemCreatorScope();
      if (itemLength === UNDEFINED_LENGTH) {
        // Undefined-length item - call innerStrategy with stopOnItemDelim;
        // it returns the post-ItemDelim offset.
        const inner = opts.innerStrategy(buffer, cursor.position, ctx, emit, {
          stopOnItemDelim: true,
        });
        items.push(new Item({ warnings: [], elements: inner.elements, index: itemIndex }));
        cursor.position = inner.endOffset;
      } else {
        // Defined-length item - slice and parse exactly `itemLength` bytes.
        //
        // PS3.5 2026c section 7.5.2 makes the `SQ` element's Value Length "the
        // total length resulting from the sequence of zero or more items
        // conveyed by this Data Element", and section 7.5.1 governs the Item's
        // own length field. A malformed file makes the two disagree, and this
        // reader resolves the disagreement in favour of the ITEM's field - the
        // reading every released version gives. `endLimit < buffer.length` is
        // what makes the disagreement consequential rather than academic: it
        // says this sequence is being read IN PLACE inside a larger Data Set,
        // so the bytes the item is about to take are that Data Set's own. Every
        // other descent primitive here is handed a slice already cut at the
        // declared end, where the two fields cannot reach past anything, and a
        // sequence that is the last thing in its buffer has nothing to reach
        // into - so neither says anything and neither warns.
        //
        // **Disclosure only. Nothing is re-framed, and that is the slice.** The
        // two readings this file admits are byte-identical inputs - a file where
        // the ITEM over-declares and a file where the SEQUENCE under-declares are
        // the same bytes, proven in `test/integration/explicit-sq-item-bound.test.ts`
        // - so no bound can prefer one without also imposing it on the other.
        // That indistinguishability is the whole reason no bound ships here, and
        // it is sufficient on its own.
        //
        // **🛑 DO NOT ADD A FAIL-SAFE-DIRECTION ARGUMENT BACK. `#51` WAS REFUSED
        // FOR ONE, IN FIVE ARTIFACTS AT ONCE.** The retracted claim was that
        // following the item's field is the safe half, because a Private Creator
        // swallowed INTO an item leaves the enclosing block unclaimed and an
        // unclaimed block is removed. It is false: which direction leaks depends
        // on where the SENDER put the Private Creator, not on which length field
        // a reader follows. Put the creator in the item's genuine content and
        // the absorb direction leaks too - `DICOM-PRIVATE-CREATOR-RESERVATION-
        // LEAK`, measured on `164eb39` and closed at the de-identify boundary by
        // `#66`, never here. The eject direction is still open and pinned as a
        // residual. Neither reading is safe by construction, which is exactly
        // why this reports rather than decides.
        if (
          opts.explicitLength !== undefined &&
          endLimit < buffer.length &&
          cursor.position + itemLength > endLimit
        ) {
          // NEITHER length is passed, and the second one is the eighth instance
          // of `DICOM-DIAGNOSTIC-PHI-RESIDUALS`. `itemLength` is a raw 32-bit
          // wire read on a file whose length fields are by definition lying. So
          // is the remainder this call site used to compute:
          // `endLimit - cursor.position` is the enclosing SEQUENCE's declared
          // Value Length less the bytes of that sequence already consumed - just
          // the 8-byte Item header when this is the first item, more when items
          // precede it - so an addition returns it. The `endLimit <
          // buffer.length` conjunct above bounds that remainder's MAGNITUDE and
          // nothing about its CONTENT.
          // The factory takes a parameter for neither. See
          // `itemCrossesSequenceEnd`.
          emit(itemCrossesSequenceEnd({ byteOffset: itemHeaderStart }, itemTag));
        }
        if (cursor.position + itemLength > buffer.length) {
          throw itemLengthExceedsBuffer(buffer, itemHeaderStart);
        }
        const itemSlice = buffer.subarray(cursor.position, cursor.position + itemLength);
        // The item is parsed from a SLICE, so every offset raised inside it is
        // relative to that slice - including a warning's `position.byteOffset`.
        // `ctx.buffer` is what `makeEmitter` cuts the `{ strict: true }` snippet
        // from, so it has to name the same frame or the snippet is an unrelated
        // element's bytes. Restored on the way out, and in a `finally` so a
        // Tier-3 fatal thrown inside the item does not leave the frame dangling
        // for the enclosing Data Set's own diagnostics.
        const enclosingFrame = ctx.buffer;
        let inner;
        try {
          ctx.buffer = itemSlice;
          inner = opts.innerStrategy(itemSlice, 0, ctx, emit);
        } finally {
          ctx.buffer = enclosingFrame;
        }
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
    restoreParentCreators();
  }
}

/**
 * `true` when a caught `DicomParseError` is a strict-mode escalation of a Tier-2
 * warning rather than a Tier-3 structural fatal.
 *
 * The distinction is what makes a rollback safe: a Tier-3 fatal thrown mid-descent
 * means the bytes are not what we guessed and the caller may fall back, while a
 * strict-mode escalation is the caller's own `{ strict: true }` contract being
 * honoured at the `emit` chokepoint (D-36) and must propagate untouched. Swallowing
 * one would make `strict` silently weaker inside a sequence than outside it.
 */
function isStrictEscalation(err: unknown): boolean {
  if (!(err instanceof DicomParseError)) return false;
  return (Object.values(WARNING_CODES) as readonly string[]).includes(err.code);
}

/**
 * Attempt an SQ descent over a **defined-length** value under Implicit VR LE,
 * rolling back cleanly if the bytes are not an item stream.
 *
 * Implicit VR LE carries no VR on the wire, so `SQ` here is resolved from PS3.6
 * (see `resolveImplicitVR`) rather than declared by the sender. That is the whole
 * reason this primitive exists instead of a bare `parseSequence` call: an
 * inference that turns out wrong must not cost the caller the object. On failure
 * the parser state is restored, every warning the failed descent emitted is
 * dropped (they describe bytes we are no longer interpreting as elements), and
 * `success: false` tells the caller to keep the declared byte range as an opaque
 * value - exactly what the pre-descent parser did for every defined-length SQ.
 *
 * The undefined-length form gets no such fallback and must not: without a
 * declared length there is no other way to find the end of the value, which is
 * why `parseImplicitLE` still throws there.
 *
 * `parseSequence`'s own `finally` restores the enclosing Data Set's charset and
 * private-block reservations, so a failed descent cannot leak an item's
 * `(0008,0005)` or an item's Private Creator into the parent.
 *
 * **The descent is handed a SLICE, not the whole buffer, and that bound is the
 * load-bearing part rather than a tidiness.** PS3.5 section 7.5.2 makes the SQ's
 * Value Length the exact extent of the item stream ("This length shall include
 * the total length resulting from the sequence of zero or more items conveyed by
 * this Data Element"), so a byte past it belongs to the enclosing Data Set and
 * nothing inside may read it. `parseSequence` computes `endLimit` from the
 * declared length but bounds each item's value read against `buffer.length`, so
 * an item that **over-declares** its own length would otherwise reach past the
 * sequence and swallow the next root element - which the caller then reads a
 * second time, because it resumes at the declared end. The result is a root
 * attribute silently reported as a per-item one AND emitted twice: a confident,
 * wrong structural read with no warning, not even under `{ strict: true }`.
 * Slicing makes that over-read fail the bounds check inside the slice instead, so
 * it lands on the announced refusal path below. `tryParseUnAsSQ` already had this
 * shape; this is the same bound, for the same reason.
 *
 * One consequence, shared with `tryParseUnAsSQ` and worth knowing before reading
 * any offset that came out of a descent: positions raised *inside* one are
 * relative to the slice, and that covers `Element.byteOffset` on a nested element
 * as well as a nested warning's `position`. Defined-length items were always
 * slice-relative (`parseSequence` hands the inner parser an `itemSlice`), so this
 * makes the two item forms agree with each other; it does leave them disagreeing
 * with the undefined-length *sequence* branch in `parseImplicitLE`, which still
 * passes the whole buffer. `Element.byteOffset` carries no documented
 * frame-of-reference contract either way. The refusal warning this function emits
 * is the exception and is absolute: it is built from the caller's `valueStart`.
 *
 * @param buffer The buffer holding the SQ value.
 * @param valueStart Offset of the SQ value's first byte.
 * @param valueLength The SQ element's declared (defined) length.
 * @param implicitLeInner The Implicit VR LE parser, passed in by the caller to
 *                        break the circular import.
 *
 * @internal
 */
export function tryParseDefinedLengthSQ(
  buffer: Buffer,
  valueStart: number,
  valueLength: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
  implicitLeInner: InnerParser,
  tag: Tag,
): { success: boolean; items: readonly Item[] } {
  const savedDepth = ctx.nestingDepth;
  const savedStackLen = ctx.encodingContextStack.length;
  const savedWarningsLen = ctx.warnings.length;

  try {
    // The slice is the bound: nothing in the descent may read past the declared
    // Value Length (PS3.5 section 7.5.2). See the note above.
    const slice = buffer.subarray(valueStart, valueStart + valueLength);
    // The descent's offsets are slice-relative, so the frame `makeEmitter` cuts
    // the strict snippet from moves with it. See `ParseContext.buffer`.
    const enclosingFrame = ctx.buffer;
    let result;
    try {
      ctx.buffer = slice;
      result = parseSequence(slice, 0, ctx, emit, {
        explicitLength: valueLength,
        littleEndian: true,
        innerStrategy: implicitLeInner,
      });
    } finally {
      ctx.buffer = enclosingFrame;
    }
    return { success: true, items: result.items };
  } catch (err) {
    if (isStrictEscalation(err)) throw err;
    ctx.nestingDepth = savedDepth;
    while (ctx.encodingContextStack.length > savedStackLen) {
      ctx.encodingContextStack.pop();
    }
    while (ctx.warnings.length > savedWarningsLen) {
      ctx.warnings.pop();
    }
    // Emitted AFTER the rollback so it is the one warning that survives, and
    // emitted at all because a silently undescended sequence is invisible to
    // `deidentify()` - which is the defect this whole path exists to close.
    emit(sqNotDescended({ byteOffset: valueStart }, tag));
    return { success: false, items: [] };
  }
}

/**
 * CP-246 fallback per D-30. When an element has `VR=UN` AND
 * `length=0xFFFFFFFF`, attempt to descend the bytes as Implicit VR LE SQ
 * items. On any failure, restore parser state (warnings, nestingDepth,
 * encodingContextStack) and signal failure to the caller.
 *
 * Called from every structural strategy, not only the Explicit VR ones: under
 * Implicit VR LE the `UN` is *resolved* rather than declared, which is what a
 * private element gets when its own Data Set never claimed the block.
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
  tag: Tag,
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
    // Same frame swap as `tryParseDefinedLengthSQ`, and restored before the
    // success warning below: that one is built from the caller's `valueStart`,
    // so it belongs to the ENCLOSING frame, not the slice.
    const enclosingFrame = ctx.buffer;
    let result;
    try {
      ctx.buffer = slice;
      result = parseSequence(slice, 0, ctx, emit, opts);
    } finally {
      ctx.buffer = enclosingFrame;
    }
    emit(unParsedAsSQ({ byteOffset: valueStart }, tag));
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
    // form a valid SQ - fall back to UN-as-bytes as designed.
    if (isStrictEscalation(err)) {
      throw err;
    }
    // Restore state - drop any warnings emitted during the failed descent.
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

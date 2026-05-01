/**
 * Phase 2 structural `Sequence` — wrapper around an SQ element's items.
 *
 * Per `02-CONTEXT.md` D-04: structural surface only — `items` and
 * `length`. No navigation methods. Phase 3 adds `Sequence.items[N].get(...)`
 * via `Item`'s `Dataset`-superclass extension per D-42.
 *
 * @module
 */

import type { Item } from "./item.js";

/**
 * One SQ (Sequence) element's structural body.
 *
 * `length` is the on-wire length: a real byte count for defined-length
 * SQ, or `0xFFFFFFFF` (4_294_967_295) when undefined-length per D-29.
 *
 * @example
 * ```ts
 * import { Sequence } from "@cosyte/dicom";
 * // Producers (parser plan 02-04) construct sequences as follows:
 * // const sq = new Sequence([item0, item1], 0xFFFFFFFF);
 * ```
 */
export class Sequence {
  public readonly items: readonly Item[];
  public readonly length: number;

  /**
   * Construct a new structural `Sequence`. The `items` array is frozen
   * at the constructor boundary so downstream mutation cannot escape.
   *
   * @internal
   */
  public constructor(items: readonly Item[], length: number) {
    this.items = Object.freeze([...items]);
    this.length = length;
  }
}

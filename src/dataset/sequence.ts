/**
 * The structural `Sequence` - wrapper around an SQ element's items.
 *
 * Structural surface only: `items` and `length`. No navigation methods of
 * its own; `Sequence.items[N].get(...)` comes from `Item`'s `Dataset`
 * superclass.
 *
 * @module
 */

import type { Item } from "./item.js";

/**
 * One SQ (Sequence) element's structural body.
 *
 * `length` is the on-wire length: a real byte count for defined-length
 * SQ, or `0xFFFFFFFF` (4_294_967_295) when undefined-length.
 *
 * @example
 * ```ts
 * import { Sequence } from "@cosyte/dicom";
 * // The parser constructs sequences as follows:
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

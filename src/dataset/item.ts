/**
 * The structural `Item` - a single `(FFFE,E000)`-delimited Item
 * inside a Sequence, carrying a nested `Dataset`.
 *
 * Structural surface only; navigation comes from the `Dataset` superclass.
 *
 * @module
 */

import { Dataset, type DatasetInit } from "./dataset.js";

/**
 * Initialiser shape for an `Item` - extends `DatasetInit` with `index`,
 * the 0-based position of the item inside its parent `Sequence`.
 *
 * @internal
 */
export interface ItemInit extends DatasetInit {
  readonly index: number;
}

/**
 * One sequence item. Inherits `fileMeta` (always `undefined` for nested
 * items), `warnings`, and the protected element map from `Dataset`.
 *
 * `Item.get(...)` / `Item.has(...)` and the rest come from the `Dataset`
 * superclass.
 *
 * @example
 * ```ts
 * import { Item } from "@cosyte/dicom";
 * // The parser constructs items as follows:
 * // const item = new Item({ index: 0, warnings: [], elements: new Map() });
 * ```
 */
export class Item extends Dataset {
  public readonly index: number;

  /**
   * Construct a new structural `Item`. Producers are the SQ / FFFE
   * marker parsers.
   *
   * @internal
   */
  public constructor(init: ItemInit) {
    super(init);
    this.index = init.index;
  }
}

/**
 * Phase 2 structural `Item` — a single `(FFFE,E000)`-delimited Item
 * inside a Sequence, carrying a nested `Dataset`.
 *
 * Per `02-CONTEXT.md` D-04: structural surface only; navigation methods
 * land in Phase 3 (via `Dataset` extension per D-42).
 *
 * @module
 */

import { Dataset, type DatasetInit } from "./dataset.js";

/**
 * Initialiser shape for an `Item` — extends `DatasetInit` with `index`,
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
 * Phase 3 surfaces `Item.get(...)` / `Item.has(...)` / etc. via the
 * `Dataset` superclass extension per D-42.
 *
 * @example
 * ```ts
 * import { Item } from "@cosyte/dicom";
 * // Producers (parser plan 02-04) construct items as follows:
 * // const item = new Item({ index: 0, warnings: [], elements: new Map() });
 * ```
 */
export class Item extends Dataset {
  public readonly index: number;

  /**
   * Construct a new structural `Item`. Producers are the SQ / FFFE
   * marker parsers in plan 02-04.
   *
   * @internal
   */
  public constructor(init: ItemInit) {
    super(init);
    this.index = init.index;
  }
}

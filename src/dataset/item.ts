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
 * the 0-based position of the item inside its parent `Sequence`, and the
 * optional `fileOffset` the parser records (see {@link Item.fileOffset}).
 *
 * @internal
 */
export interface ItemInit extends DatasetInit {
  readonly index: number;
  readonly fileOffset?: number;
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
   * Byte offset of this Item's `(FFFE,E000)` Item tag in the Part 10 file it
   * was read from, counted from the first byte of the File Preamble, which is
   * how PS3.3 2026d Table F.3-3 counts a DICOMDIR's offsets. For a file read
   * without a preamble, the 132 bytes of File Preamble and `DICM` prefix it
   * lacks are still counted, so the File Meta group's first byte is offset 132.
   *
   * `undefined` for an Item with no position in a file: one inside a Deflated
   * Data Set (a byte of a deflated stream is not a byte of the file), and one
   * built by hand. `deidentify()` carries it from each source Item to the Item
   * it rebuilds, as that Item's identity: it is how `serializeDicom` ties a
   * DICOMDIR offset to the Directory Record it named.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const ds = parseDicom(buf);
   * const first = ds.get("00041220")?.items?.[0];
   * first?.fileOffset; // where that Directory Record Item starts in the file
   * ```
   */
  public readonly fileOffset: number | undefined;

  /**
   * Construct a new structural `Item`. Producers are the SQ / FFFE
   * marker parsers.
   *
   * @internal
   */
  public constructor(init: ItemInit) {
    super(init);
    this.index = init.index;
    this.fileOffset = init.fileOffset;
  }
}

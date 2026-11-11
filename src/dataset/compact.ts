/**
 * The compact form a parsed Data Set is kept in: one table of integers per parse, with an
 * `Element` or an `Item` built only when a caller asks for it.
 *
 * A parse used to build an `Element` for every element it read and an `Item`, with a `Map` of its
 * own, for every Sequence Item, before a caller had asked for any of them. Each was a public object
 * of about 250 bytes before a value was decoded, so a header-only SR of 230,031 elements and 70,001
 * Items held about 15 times its own size after a collection, and a 1 KiB worklist entry made 35
 * times its size in objects for one read.
 *
 * The parser now writes one row of integers per element into a typed array instead: the tag, the
 * declared length, the byte offset, the VR, the flags, the Specific Character Set and Private
 * Creator in effect, and, for a Sequence, where its Items are. Each Data Set (the root and every
 * Item) is a contiguous run of rows, and each Sequence's Items are a contiguous run of Data Set
 * records. The rows sit in typed arrays, outside the V8 heap, at 24 bytes an element.
 *
 * `Dataset.get`, `has`, `elements` and `getAll` read the table and build the `Element` the first
 * time each is asked for, then hand back that same object every time. The Element holds the table,
 * its row number, its tag and its VR, and reads each other field from the row when it is asked for; an `SQ` Element
 * builds its `Item`s the first time they are read, and each `Item` builds its own Elements the
 * same way. What a caller reads is what the eager parse gave: the same tag, VR, VM, length, bytes, byte offset, Private
 * Creator, character set and Items, in the same order, with the same duplicate-tag rule (the
 * first position, the last value).
 *
 * @internal
 * @module
 */

import { Buffer } from "node:buffer";

import type { Tag, VR } from "../dictionary/types.js";
import { copyValueBytes } from "../parser/byte-cursor.js";
import { KNOWN_VRS } from "../parser/endian.js";
import type { ParseContext } from "../parser/types.js";
import { tagOf } from "../parser/wire-tokens.js";
import { DATASET_SHAPES, datasetOverTable } from "./dataset.js";
import { type Element, elementOverTable, type ElementRows } from "./element.js";
import { ITEM_SHAPES, Item } from "./item.js";

/** Words in one element row. */
const W = 6;
/** Word of a row: the tag, as `group * 0x10000 + element`. */
const R_TAG = 0;
/** Word of a row: the declared Value Length. */
const R_LENGTH = 1;
/** Word of a row: `Element.byteOffset`, in the frame the Data Set was read in. */
const R_OFFSET = 2;
/** Word of a row: the VR index and the flags below. */
const R_META = 3;
/** Word of a row: a plain element's character set index plus one, or a complex row's `seqs` index. */
const R_AUX = 4;
/** Word of a row: the Private Creator index plus one, or 0 for none. */
const R_CREATOR = 5;

/** Words in one complex-row record: where its value ends, its first Item's Data Set, its Item count. */
const S = 3;
/** Words in one Data Set record: first row, row count, frame delta, file offset, flags. */
const D = 5;

/** The VR index in a row's META word. */
const VR_MASK = 0xff;
/** The value bytes are little endian. */
const F_LITTLE_ENDIAN = 1 << 8;
/** The row has a `seqs` record: its value ends where that says, not at start plus length. */
const F_COMPLEX = 1 << 9;
/** The element was promoted from `UN` to `SQ` (CP-246). */
const F_CP246 = 1 << 10;
/** The element carries `items`. */
const F_ITEMS = 1 << 11;
/** Where the value starts, after the header's first byte: 0, 8 or 12 bytes, as 0, 1 or 2. */
const START_SHIFT = 12;
const START_MASK = 3 << START_SHIFT;

/** A Data Set record's flag: its tags strictly ascend, so a lookup can halve. */
const SET_SORTED = 1;
/** A Data Set record's flag: it has a file offset (`Item.fileOffset`). */
const SET_HAS_FILE_OFFSET = 2;

/** Where a value starts after its header's first byte, by the code in a row. */
const START_BYTES = [0, 8, 12] as const;

/** The 34 VRs PS3.5 defines, each by a fixed index; a VR outside them is kept per table. */
const KNOWN_VR_LIST: readonly VR[] = [...KNOWN_VRS] as VR[];
const KNOWN_VR_INDEX: ReadonlyMap<string, number> = new Map(
  KNOWN_VR_LIST.map((vr, i) => [vr, i] as const),
);
/** The first index of a VR this edition of PS3.5 does not define. */
const EXTRA_VR_BASE = 64;

/** A Data Set with fewer elements than this is searched in order rather than through a map. */
const LINEAR_SEARCH_LIMIT = 16;

/** The warnings an Item is built with: none. The Dataset copies it, so sharing it is safe. */
const NO_WARNINGS: readonly never[] = [];
/** The elements an Item over a table is built with; the table stands in for them. */
const NO_ELEMENTS: ReadonlyMap<Tag, Element> = new Map();

type Words = Uint32Array | Float64Array;

/**
 * One Data Set being read: where its rows start in the scratch rows, and what a duplicate check
 * needs. One a Data Set.
 *
 * @internal
 */
export interface SetWriter {
  /** The scratch row this Data Set's first row is at. */
  readonly mark: number;
  /** Set when the Data Set closes: see {@link ParsedDataSet}. */
  first: number;
  count: number;
  delta: number;
  endOffset: number;
  /** The largest tag so far, while the tags ascend. */
  last: number;
  /** `true` while every tag has been larger than the one before it. */
  sorted: boolean;
  /** Tag to scratch row, made once a Data Set is out of order and long enough to need it. */
  index: Map<number, number> | undefined;
}

/**
 * A Data Set the parser has finished: its rows, whether its tags ascend, where the buffer it was
 * read from starts in the source, and the offset the read stopped at in that buffer.
 *
 * @internal
 */
export interface ParsedDataSet {
  readonly first: number;
  readonly count: number;
  readonly sorted: boolean;
  readonly delta: number;
  readonly endOffset: number;
}

/** A typed array of `n` words, of the kind `like` is. */
function wordsLike(like: Words, n: number): Words {
  return like instanceof Float64Array ? new Float64Array(n) : new Uint32Array(n);
}

/** `words`, or a copy of it at least `need` words long. */
function ensure(words: Words, need: number): Words {
  if (need <= words.length) return words;
  const grown = wordsLike(words, Math.max(need, words.length * 2));
  grown.set(words);
  return grown;
}

/** A table this small is kept as it is: cutting it would cost more than it saves. */
const TRIM_MIN_WORDS = 4096;

/** `words`, cut to `n` words when it is large and that saves more than a quarter of it. */
function trim(words: Words, n: number): Words {
  if (words.length < TRIM_MIN_WORDS || words.length - n <= words.length / 4) return words;
  return words.slice(0, n);
}

/** Copy words `from` to `to` of `src` into `dst` at `at`, with no view made. */
function copyWords(src: Words, from: number, to: number, dst: Words, at: number): void {
  for (let i = from; i < to; i++) dst[at + i - from] = src[i] as number;
}

/**
 * The parse's table: written by the parser, then read by every `Dataset` and `Item` of the parse.
 *
 * @internal
 */
export class CompactTable implements ElementRows {
  /** The buffer every value is a range of: the input, the inflated Data Set, or a private copy. */
  public source: Buffer | undefined;
  /** `true` when every `rawBytes` is a copy (`{ copyValues: true }`). */
  public copyValues: boolean;
  /** Element rows, Data Set after Data Set. */
  public rows: Words;
  public rowCount = 0;
  /** Complex rows' records. */
  public seqs: Words;
  public seqCount = 0;
  /** Data Set records: the root, and every Item. */
  public sets: Words;
  public setCount = 0;
  /** Rows of the Data Sets still being read, innermost last. */
  public scratch: Words;
  public top = 0;
  /** Item records of the Sequences still being read, innermost last. */
  public setScratch: Words;
  public setTop = 0;
  /** VRs outside the 34, by index less {@link EXTRA_VR_BASE}. */
  public readonly extraVrs: VR[] = [];
  /** Private Creators, by index less one. */
  public readonly creators: string[] = [];
  /** Specific Character Set term lists, each the very array the parse held, by index less one. */
  public readonly charsets: (readonly string[])[] = [];

  /** An empty table; `{ copyValues: true }` makes every `rawBytes` built from it a copy. */
  public constructor(copyValues: boolean) {
    this.source = undefined;
    this.copyValues = copyValues;
    const empty = new Uint32Array(0);
    this.rows = empty;
    this.seqs = empty;
    this.sets = empty;
    this.scratch = empty;
    this.setScratch = empty;
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  /**
   * Make `buffer` the source when there is none yet. The first buffer a parse reads is the one
   * every later buffer is a view of, so positions are counted from it.
   */
  public begin(buffer: Buffer): void {
    if (this.source !== undefined) return;
    this.source = buffer;
    // Positions fit in 32 bits unless the source is 4 GiB or more.
    const like: Words =
      buffer.length + 0x10000 > 0xffffffff ? new Float64Array(0) : new Uint32Array(0);
    const rows = Math.min(Math.max(16, Math.ceil(buffer.length / 24)), 1024);
    this.rows = wordsLike(like, rows * W);
    this.scratch = wordsLike(like, rows * W);
    this.seqs = wordsLike(like, 16 * S);
    this.sets = wordsLike(like, 16 * D);
    this.setScratch = wordsLike(like, 16 * D);
  }

  /** Where `buffer`'s byte 0 is in the source. */
  public deltaOf(buffer: Buffer): number {
    return buffer.byteOffset - (this.source as Buffer).byteOffset;
  }

  /** Start a Data Set. */
  public openSet(): SetWriter {
    return {
      mark: this.top,
      first: 0,
      count: 0,
      delta: 0,
      endOffset: 0,
      last: -1,
      sorted: true,
      index: undefined,
    };
  }

  /** The VR's index, interned in this table when it is not one of the 34. */
  public vrIndex(vr: VR): number {
    const known = KNOWN_VR_INDEX.get(vr);
    if (known !== undefined) return known;
    let at = this.extraVrs.indexOf(vr);
    if (at === -1) at = this.extraVrs.push(vr) - 1;
    return EXTRA_VR_BASE + at;
  }

  /** A Private Creator's index plus one, or 0. */
  public creatorIndex(creator: string | undefined): number {
    if (creator === undefined) return 0;
    let at = this.creators.indexOf(creator);
    if (at === -1) at = this.creators.push(creator) - 1;
    return at + 1;
  }

  /** A character set list's index plus one, or 0; the list is kept by identity. */
  public charsetIndex(charset: readonly string[] | undefined): number {
    if (charset === undefined) return 0;
    const list = this.charsets;
    const last = list.length - 1;
    if (last >= 0 && list[last] === charset) return last + 1;
    let at = list.lastIndexOf(charset);
    if (at === -1) at = list.push(charset) - 1;
    return at + 1;
  }

  /** Record a complex row's end and Items; returns its `seqs` index. */
  public addSeq(end: number, itemFirst: number, itemCount: number): number {
    const at = this.seqCount;
    const seqs = (this.seqs = ensure(this.seqs, (at + 1) * S));
    seqs[at * S] = end;
    seqs[at * S + 1] = itemFirst;
    seqs[at * S + 2] = itemCount;
    this.seqCount = at + 1;
    return at;
  }

  /**
   * Write an element's row into the Data Set `set`, and `true` when it took the place of an
   * earlier element with the same tag. As a `Map` keyed by tag does, the element keeps the earlier
   * one's position and the earlier one is gone.
   */
  public addRow(
    set: SetWriter,
    tag: number,
    length: number,
    byteOffset: number,
    meta: number,
    aux: number,
    creator: number,
  ): boolean {
    const at = this.duplicateOf(set, tag);
    const row = at === -1 ? this.top : at;
    const scratch = (this.scratch = ensure(this.scratch, (this.top + 1) * W));
    const o = row * W;
    scratch[o + R_TAG] = tag;
    scratch[o + R_LENGTH] = length;
    scratch[o + R_OFFSET] = byteOffset;
    scratch[o + R_META] = meta;
    scratch[o + R_AUX] = aux;
    scratch[o + R_CREATOR] = creator;
    if (at !== -1) return true;
    this.top = row + 1;
    if (set.sorted) set.last = tag;
    else set.index?.set(tag, row);
    return false;
  }

  /** The scratch row of an earlier element of `set` with this tag, or -1. */
  private duplicateOf(set: SetWriter, tag: number): number {
    if (set.sorted) {
      if (this.top === set.mark || tag > set.last) return -1;
      set.sorted = false;
    }
    const scratch = this.scratch;
    if (set.index === undefined) {
      if (this.top - set.mark < LINEAR_SEARCH_LIMIT) {
        for (let r = set.mark; r < this.top; r++) if (scratch[r * W] === tag) return r;
        return -1;
      }
      const index = new Map<number, number>();
      for (let r = set.mark; r < this.top; r++) index.set(scratch[r * W] as number, r);
      set.index = index;
    }
    return set.index.get(tag) ?? -1;
  }

  /**
   * Close `set`, read from a buffer whose byte 0 is `delta` into the source and stopped at
   * `endOffset` of it: move its rows from the scratch rows to the table.
   */
  public closeSet(set: SetWriter, delta: number, endOffset: number): ParsedDataSet {
    const count = this.top - set.mark;
    const first = this.rowCount;
    this.rows = ensure(this.rows, (first + count) * W);
    copyWords(this.scratch, set.mark * W, this.top * W, this.rows, first * W);
    this.rowCount = first + count;
    this.top = set.mark;
    // The writer becomes the result, so a Data Set costs one object.
    set.first = first;
    set.count = count;
    set.delta = delta;
    set.endOffset = endOffset;
    set.index = undefined;
    return set;
  }

  /** Where the Item records of a Sequence about to be read start. */
  public openItems(): number {
    return this.setTop;
  }

  /** Record one Item of the Sequence being read. */
  public addItem(dataSet: ParsedDataSet | undefined, fileOffset: number | undefined): void {
    const at = this.setTop;
    const scratch = (this.setScratch = ensure(this.setScratch, (at + 1) * D));
    const o = at * D;
    scratch[o] = dataSet === undefined ? 0 : dataSet.first;
    scratch[o + 1] = dataSet === undefined ? 0 : dataSet.count;
    scratch[o + 2] = dataSet === undefined ? 0 : dataSet.delta;
    scratch[o + 3] = fileOffset ?? 0;
    scratch[o + 4] =
      (dataSet === undefined || dataSet.sorted ? SET_SORTED : 0) |
      (fileOffset === undefined ? 0 : SET_HAS_FILE_OFFSET);
    this.setTop = at + 1;
  }

  /** Move the Item records of the Sequence that opened at `mark` to the table; returns the first. */
  public closeItems(mark: number): number {
    const count = this.setTop - mark;
    const first = this.setCount;
    this.sets = ensure(this.sets, (first + count) * D);
    copyWords(this.setScratch, mark * D, this.setTop * D, this.sets, first * D);
    this.setCount = first + count;
    this.setTop = mark;
    return first;
  }

  /** Record the root Data Set; returns its index. */
  public addRoot(dataSet: ParsedDataSet): number {
    const at = this.setCount;
    const sets = (this.sets = ensure(this.sets, (at + 1) * D));
    const o = at * D;
    sets[o] = dataSet.first;
    sets[o + 1] = dataSet.count;
    sets[o + 2] = dataSet.delta;
    sets[o + 3] = 0;
    sets[o + 4] = dataSet.sorted ? SET_SORTED : 0;
    this.setCount = at + 1;
    return at;
  }

  /** How far the table had been written, to roll a failed descent back to. */
  public mark(): readonly [number, number, number, number, number] {
    return [this.rowCount, this.top, this.seqCount, this.setCount, this.setTop];
  }

  /** Roll back to a {@link mark}: everything written since is gone. */
  public rollBack(at: readonly [number, number, number, number, number]): void {
    [this.rowCount, this.top, this.seqCount, this.setCount, this.setTop] = at;
  }

  /** The parse is done: drop the scratch arrays, and cut the table to what it holds. */
  public finish(): void {
    const empty = wordsLike(this.rows, 0);
    this.scratch = empty;
    this.setScratch = empty;
    this.rows = trim(this.rows, this.rowCount * W);
    this.seqs = trim(this.seqs, this.seqCount * S);
    this.sets = trim(this.sets, this.setCount * D);
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  /** How many elements Data Set `set` holds. */
  public size(set: number): number {
    return this.sets[set * D + 1] as number;
  }

  /** The tag of element `i` of Data Set `set`, as `group * 0x10000 + element`. */
  public tagAt(set: number, i: number): number {
    return this.rows[((this.sets[set * D] as number) + i) * W + R_TAG] as number;
  }

  /** The position in Data Set `set` of the element with this tag, or -1. */
  public indexOf(set: number, tag: number, index: Map<number, number> | undefined): number {
    const o = set * D;
    const first = this.sets[o] as number;
    const count = this.sets[o + 1] as number;
    const rows = this.rows;
    if (((this.sets[o + 4] as number) & SET_SORTED) !== 0) {
      let lo = 0;
      let hi = count - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const at = rows[(first + mid) * W + R_TAG] as number;
        if (at === tag) return mid;
        if (at < tag) lo = mid + 1;
        else hi = mid - 1;
      }
      return -1;
    }
    if (index !== undefined) return index.get(tag) ?? -1;
    for (let i = 0; i < count; i++) if (rows[(first + i) * W + R_TAG] === tag) return i;
    return -1;
  }

  /** `true` when a lookup in Data Set `set` should go through a map of its tags. */
  public wantsIndex(set: number): boolean {
    const o = set * D;
    return (
      ((this.sets[o + 4] as number) & SET_SORTED) === 0 &&
      (this.sets[o + 1] as number) >= LINEAR_SEARCH_LIMIT
    );
  }

  /**
   * Build element `i` of Data Set `set`: an Element that reads its fields from the row. Under
   * `{ copyValues: true }` its `rawBytes` is a copy made now.
   */
  public element(set: number, i: number): Element {
    const d = set * D;
    const row = (this.sets[d] as number) + i;
    const delta = this.sets[d + 2] as number;
    const bytes = this.copyValues
      ? copyValueBytes(
          (this.source as Buffer).subarray(
            this.rowValueStart(row, delta),
            this.rowValueEnd(row, delta),
          ),
        )
      : undefined;
    return elementOverTable(this, row, delta, bytes);
  }

  /** The tag of row `row`. */
  public rowTag(row: number): Tag {
    const tag = this.rows[row * W + R_TAG] as number;
    return tagOf(tag >>> 16, tag & 0xffff);
  }

  /** The VR of row `row`. */
  public rowVr(row: number): VR {
    const at = (this.rows[row * W + R_META] as number) & VR_MASK;
    return at < EXTRA_VR_BASE
      ? (KNOWN_VR_LIST[at] as VR)
      : (this.extraVrs[at - EXTRA_VR_BASE] as VR);
  }

  /** The VM of row `row`: 1 for a plain element, its Item count for one with Items, else 0. */
  public rowVm(row: number): number {
    const meta = this.rows[row * W + R_META] as number;
    if ((meta & F_COMPLEX) === 0) return 1;
    if ((meta & F_ITEMS) === 0) return 0;
    return this.seqs[(this.rows[row * W + R_AUX] as number) * S + 2] as number;
  }

  /** The declared Value Length of row `row`. */
  public rowLength(row: number): number {
    return this.rows[row * W + R_LENGTH] as number;
  }

  /** The byte offset of row `row`, in the frame its Data Set was read in. */
  public rowByteOffset(row: number): number {
    return this.rows[row * W + R_OFFSET] as number;
  }

  /** The Private Creator of row `row`, or `undefined`. */
  public rowPrivateCreator(row: number): string | undefined {
    const creator = this.rows[row * W + R_CREATOR] as number;
    return creator === 0 ? undefined : this.creators[creator - 1];
  }

  /** `true` when row `row` was promoted from `UN` to `SQ` (CP-246), else `undefined`. */
  public rowCp246Promoted(row: number): true | undefined {
    return ((this.rows[row * W + R_META] as number) & F_CP246) !== 0 ? true : undefined;
  }

  /** `true` when row `row`'s value bytes are little endian. */
  public rowLittleEndian(row: number): boolean {
    return ((this.rows[row * W + R_META] as number) & F_LITTLE_ENDIAN) !== 0;
  }

  /** The Specific Character Set terms in effect for row `row`, the very list the parse held. */
  public rowSpecificCharacterSet(row: number): readonly string[] | undefined {
    const o = row * W;
    if (((this.rows[o + R_META] as number) & F_COMPLEX) !== 0) return undefined;
    const aux = this.rows[o + R_AUX] as number;
    return aux === 0 ? undefined : this.charsets[aux - 1];
  }

  /** The Items of row `row`, built anew, or `undefined` when it carries none. */
  public rowItems(row: number): Item[] | undefined {
    const o = row * W;
    if (((this.rows[o + R_META] as number) & F_ITEMS) === 0) return undefined;
    const s = (this.rows[o + R_AUX] as number) * S;
    return this.items(this.seqs[s + 1] as number, this.seqs[s + 2] as number);
  }

  /** Where row `row`'s value starts in the source, for a Data Set `delta` bytes into it. */
  public rowValueStart(row: number, delta: number): number {
    const o = row * W;
    const meta = this.rows[o + R_META] as number;
    return (
      (this.rows[o + R_OFFSET] as number) +
      delta +
      (START_BYTES[(meta & START_MASK) >> START_SHIFT] as number)
    );
  }

  /** Where row `row`'s value ends in the source, for a Data Set `delta` bytes into it. */
  public rowValueEnd(row: number, delta: number): number {
    const o = row * W;
    if (((this.rows[o + R_META] as number) & F_COMPLEX) !== 0) {
      return this.seqs[(this.rows[o + R_AUX] as number) * S] as number;
    }
    return this.rowValueStart(row, delta) + (this.rows[o + R_LENGTH] as number);
  }

  /** The `count` Items whose Data Set records start at `first`. */
  private items(first: number, count: number): Item[] {
    const out = new Array<Item>(count);
    const sets = this.sets;
    for (let k = 0; k < count; k++) {
      const set = first + k;
      const flags = sets[set * D + 4] as number;
      const item =
        (flags & SET_HAS_FILE_OFFSET) === 0
          ? new Item({ warnings: NO_WARNINGS, elements: NO_ELEMENTS, index: k })
          : new Item({
              warnings: NO_WARNINGS,
              elements: NO_ELEMENTS,
              index: k,
              fileOffset: sets[set * D + 3] as number,
            });
      datasetOverTable(item, this, set);
      out[k] = item;
    }
    return out;
  }
}

/**
 * A row's META word.
 *
 * @internal
 */
export function rowMeta(
  vrIndex: number,
  littleEndian: boolean,
  startBytes: 0 | 8 | 12,
  complex: boolean,
  hasItems: boolean,
  cp246: boolean,
): number {
  return (
    vrIndex |
    (littleEndian ? F_LITTLE_ENDIAN : 0) |
    (complex ? F_COMPLEX : 0) |
    (hasItems ? F_ITEMS : 0) |
    (cp246 ? F_CP246 : 0) |
    ((startBytes === 0 ? 0 : startBytes === 8 ? 1 : 2) << START_SHIFT)
  );
}

/**
 * The parse's compact table, made the first time it is asked for.
 *
 * @internal
 */
export function tableOf(ctx: ParseContext): CompactTable {
  return (ctx.table ??= new CompactTable(ctx.copyValues));
}

/**
 * A table kept for the life of the process so V8 keeps this class's hidden classes, and the Dataset
 * and Item shapes kept over it so theirs hold a table too: see `ELEMENT_SHAPES` in `./element.ts`.
 */
export const TABLE_SHAPES: readonly CompactTable[] = (() => {
  const narrow = new CompactTable(false);
  narrow.begin(Buffer.alloc(0));
  narrow.addRoot(narrow.closeSet(narrow.openSet(), 0, 0));
  narrow.finish();
  const copying = new CompactTable(true);
  for (const ds of DATASET_SHAPES) datasetOverTable(ds, narrow, 0);
  for (const item of ITEM_SHAPES) datasetOverTable(item, narrow, 0);
  return [narrow, copying];
})();

/**
 * Elements over a table, kept for their hidden classes as `ELEMENT_SHAPES` in `./element.ts` is:
 * one whose bytes are made when read, and one given its bytes, as `{ copyValues: true }` does.
 *
 * @internal
 */
export const OVER_TABLE_SHAPES: readonly Element[] = [
  elementOverTable(TABLE_SHAPES[0] as CompactTable, 0, 0, undefined),
  elementOverTable(TABLE_SHAPES[0] as CompactTable, 0, 0, Buffer.alloc(0)),
];

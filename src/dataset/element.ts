/**
 * The structural `Element` - leaf wrapper over an on-wire DICOM
 * Data Element.
 *
 * An Element `parseDicom` built reads its fields from its row of the parse's compact table
 * (`./compact.ts`), so it holds that table, its row, its tag, its VR and its value's range and little else: each field
 * is an accessor on the class, and an Element has no own enumerable property. An Element built by
 * hand reads the fields it was built with.
 *
 * `rawBytes` is a `Buffer.subarray()` view over the source buffer by default
 * (zero-copy), pinning the source ArrayBuffer until every Element is GC'd.
 * The `parseDicom` `{ copyValues: true }` option makes each `rawBytes` a
 * standalone copy, so the caller's input can be released.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { Tag, VR } from "../dictionary/types.js";
import type { Item } from "./item.js";
import { decodeElementValue } from "./vr/decode.js";
import type { DicomValue } from "./vr/types.js";

/**
 * Initialiser shape accepted by the `Element` constructor.
 *
 * `privateCreator` is omitted (not `undefined`) for standard tags;
 * present only when the parser resolved a `(gggg,EEFF)` private element
 * to its registered Private Creator string.
 *
 * @internal
 */
export interface ElementInit {
  readonly tag: Tag;
  readonly vr: VR;
  readonly vm: number;
  readonly length: number;
  readonly rawBytes: Buffer;
  readonly byteOffset: number;
  readonly privateCreator?: string;
  /**
   * Hint set by the parser when an `Element` was promoted from
   * `VR=UN` with undefined length to `VR=SQ` via the CP-246 fallback.
   * The lazy value decoder reads this to choose the inner SQ decoder
   * (Implicit VR LE) on first access. Never set on standard SQ elements.
   *
   * @internal
   */
  readonly cp246Promoted?: boolean;
  /**
   * Byte order of the value bytes, set by the parser per transfer syntax
   * (`true` for Implicit/Explicit VR LE + Deflated; `false` for Explicit VR
   * BE). The numeric decoders read this - signedness comes from the VR,
   * endianness from here.
   */
  readonly littleEndian: boolean;
  /**
   * The dataset's resolved `(0008,0005)` Specific Character Set terms in
   * effect for this element (parent dataset's, or the item's own override).
   * Omitted when the Default Repertoire (ISO_IR 6) applies. The
   * charset-dependent text decoders (`LO SH UC LT ST UT PN`) read this.
   */
  readonly specificCharacterSet?: readonly string[];
  /**
   * For `SQ` elements: the parsed sequence items, threaded on by the parser
   * so `Element.value` can expose them without re-parsing. Omitted for
   * non-SQ elements.
   */
  readonly items?: readonly Item[];
}

/**
 * What an Element over a table reads its fields from: one row of the parse's compact table, by
 * row number. `CompactTable` is the one implementation; it is named here so this module needs no
 * value from `./compact.ts`.
 *
 * @internal
 */
export interface ElementRows {
  /** The buffer every value of the table is a range of. */
  readonly source: Buffer | undefined;
  rowTag(row: number): Tag;
  rowVr(row: number): VR;
  rowVm(row: number): number;
  rowLength(row: number): number;
  rowByteOffset(row: number): number;
  rowPrivateCreator(row: number): string | undefined;
  rowCp246Promoted(row: number): true | undefined;
  rowLittleEndian(row: number): boolean;
  rowSpecificCharacterSet(row: number): readonly string[] | undefined;
  /** The row's Items, built anew on every call. Asked only of a row that carries Items. */
  rowItems(row: number): Item[];
}

/** The fields of an Element built by hand, copied out of its init, less the tag and VR. */
interface Fields {
  readonly vm: number;
  readonly length: number;
  readonly byteOffset: number;
  readonly privateCreator: string | undefined;
  readonly cp246Promoted: boolean | undefined;
  readonly littleEndian: boolean;
  readonly specificCharacterSet: readonly string[] | undefined;
}

/** The init the table's factory passes the constructor: it tells it to copy nothing. */
const OVER_TABLE_MARK: object = {};
const OVER_TABLE = OVER_TABLE_MARK as ElementInit;

/**
 * Hands the parser and the value decoders a way into an Element's private state, set once by the
 * class's static block. Not exported from the package.
 */
let overTable: (
  rows: ElementRows,
  row: number,
  start: number,
  end: number,
  hasItems: boolean,
  bytes: Buffer | undefined,
) => Element;

/** What `#items` holds once an Element over a table is known to carry no Items. */
const NO_ITEMS: readonly Item[] = Object.freeze([]);
let rangeSource: (el: Element) => Buffer;
let rangeStart: (el: Element) => number;
let rangeEnd: (el: Element) => number;

/**
 * One DICOM Data Element as parsed.
 *
 * Structural surface: `tag`, `vr`, `vm`, `length`, `rawBytes`,
 * `byteOffset`, `privateCreator`, `littleEndian`, `specificCharacterSet`
 * and `items`. On top of it sits a lazy, memoized `.value` getter backed by
 * the VR-aware decoders under `src/dataset/vr/`.
 *
 * Every field is an accessor: an Element `parseDicom` built reads it from
 * the parse's compact table, and one built by hand reads what it was built
 * with. So an Element has no own enumerable property: `Object.keys`, a
 * spread, `JSON.stringify` and `structuredClone` of one see no field. Read
 * the fields by name, such as `{ tag: el.tag, vr: el.vr }`, to copy them.
 *
 * `rawBytes` retention behaviour: zero-copy `Buffer.subarray` view by
 * default (pins source ArrayBuffer); pass `{ copyValues: true }` to
 * `parseDicom` for a standalone copy per element when the source
 * needs to be released.
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * import { Element } from "@cosyte/dicom";
 * const el = new Element({
 *   tag: "00100010",
 *   vr: "PN",
 *   vm: 1,
 *   length: 8,
 *   rawBytes: Buffer.from("DOE^JANE"),
 *   byteOffset: 200,
 *   littleEndian: true,
 * });
 * // el.tag === "00100010"; el.rawBytes is a Buffer of 8 bytes.
 * // el.value.kind === "personName".
 * ```
 */
export class Element {
  /**
   * The tag and the VR, kept in the Element rather than read from the row: the decoders and the
   * writer read them on nearly every step, and keeping them costs 16 bytes an Element.
   */
  #tag: Tag;
  #vr: VR;
  /** The table this Element reads from, or the fields it was built with when `#row` is -1. */
  #of: ElementRows | Fields;
  /** The table row, or -1 for an Element built by hand. */
  #row: number;
  /**
   * Where the value starts and ends in the table's source. Kept in the Element, at 8 bytes, because
   * the decoders and the writer read the value's range of every element they touch.
   */
  #start: number;
  #end: number;
  /** The decoded value, once read. */
  #value: DicomValue | undefined;
  /** The value's bytes once made: given at construction, or made the first time they are read. */
  #rawBytes: Buffer | undefined;
  /**
   * The Items: given at construction, or built the first time they are read. `NO_ITEMS` for an
   * Element over a table whose row carries none, so reading `items` needs no table read.
   */
  #items: readonly Item[] | undefined;

  static {
    overTable = (rows, row, start, end, hasItems, bytes): Element => {
      const el = new Element(OVER_TABLE);
      el.#tag = rows.rowTag(row);
      el.#vr = rows.rowVr(row);
      el.#of = rows;
      el.#row = row;
      el.#start = start;
      el.#end = end;
      el.#rawBytes = bytes;
      if (!hasItems) el.#items = NO_ITEMS;
      return el;
    };
    rangeSource = (el) => el.#rawBytes ?? ((el.#of as ElementRows).source as Buffer);
    rangeStart = (el) => (el.#rawBytes === undefined ? el.#start : 0);
    rangeEnd = (el) => (el.#rawBytes === undefined ? el.#end : el.#rawBytes.length);
  }

  /**
   * Construct a new structural `Element`. The parser builds these directly
   * from on-wire bytes; consumers receive them via `Dataset` after
   * `parseDicom`. The fields are copied out of `init`, so a later change to
   * it is not seen.
   *
   * @internal
   */
  public constructor(init: ElementInit) {
    this.#tag = init.tag;
    this.#vr = init.vr;
    this.#row = -1;
    this.#start = 0;
    this.#end = 0;
    this.#value = undefined;
    if (init === OVER_TABLE) {
      this.#of = init as unknown as Fields;
      this.#rawBytes = undefined;
      this.#items = undefined;
      return;
    }
    this.#of = {
      vm: init.vm,
      length: init.length,
      byteOffset: init.byteOffset,
      privateCreator: init.privateCreator,
      cp246Promoted: init.cp246Promoted,
      littleEndian: init.littleEndian,
      specificCharacterSet: init.specificCharacterSet,
    };
    this.#rawBytes = init.rawBytes;
    this.#items = init.items;
  }

  /** The tag, as 8 uppercase hex digits. */
  public get tag(): Tag {
    return this.#tag;
  }

  /** The VR: as written under Explicit VR, from the dictionary under Implicit VR. */
  public get vr(): VR {
    return this.#vr;
  }

  /** The Value Multiplicity as parsed: 1, the Item count of an `SQ`, or 0. */
  public get vm(): number {
    const row = this.#row;
    return row === -1 ? (this.#of as Fields).vm : (this.#of as ElementRows).rowVm(row);
  }

  /** The declared Value Length, `0xFFFFFFFF` for undefined length. */
  public get length(): number {
    const row = this.#row;
    return row === -1 ? (this.#of as Fields).length : (this.#of as ElementRows).rowLength(row);
  }

  /** Where the element's header starts, in the Data Set it was read in. */
  public get byteOffset(): number {
    const row = this.#row;
    return row === -1
      ? (this.#of as Fields).byteOffset
      : (this.#of as ElementRows).rowByteOffset(row);
  }

  /** The Private Creator that reserved this private element's block, or `undefined`. */
  public get privateCreator(): string | undefined {
    const row = this.#row;
    return row === -1
      ? (this.#of as Fields).privateCreator
      : (this.#of as ElementRows).rowPrivateCreator(row);
  }

  /**
   * Hint for the lazy SQ decoder. `true` when this Element was promoted
   * from `VR=UN` with undefined length to `VR=SQ` via the CP-246 fallback,
   * which is what selects the Implicit VR LE inner decoder. Always
   * `undefined` on standard SQ elements.
   *
   * @internal
   */
  public get cp246Promoted(): boolean | undefined {
    const row = this.#row;
    return row === -1
      ? (this.#of as Fields).cp246Promoted
      : (this.#of as ElementRows).rowCp246Promoted(row);
  }

  /** Value byte order (per transfer syntax). See {@link ElementInit.littleEndian}. */
  public get littleEndian(): boolean {
    const row = this.#row;
    return row === -1
      ? (this.#of as Fields).littleEndian
      : (this.#of as ElementRows).rowLittleEndian(row);
  }

  /** In-effect `(0008,0005)` terms, or `undefined` for the Default Repertoire. */
  public get specificCharacterSet(): readonly string[] | undefined {
    const row = this.#row;
    return row === -1
      ? (this.#of as Fields).specificCharacterSet
      : (this.#of as ElementRows).rowSpecificCharacterSet(row);
  }

  /**
   * Parsed items for an `SQ` element; `undefined` otherwise. Built the first
   * time they are read, and the same array of the same Items every time after.
   */
  public get items(): readonly Item[] | undefined {
    const items = this.#items;
    if (items !== undefined) return items === NO_ITEMS ? undefined : items;
    if (this.#row === -1) return undefined;
    const built = (this.#of as ElementRows).rowItems(this.#row);
    this.#items = built;
    return built;
  }

  /**
   * The element's bytes, as the parser read them: a zero-copy `Buffer.subarray`
   * view of the source buffer by default, made the first time it is read and
   * the same Buffer every time after; a standalone copy under
   * `{ copyValues: true }`. See the class doc.
   */
  public get rawBytes(): Buffer {
    let bytes = this.#rawBytes;
    if (bytes === undefined) {
      bytes = ((this.#of as ElementRows).source as Buffer).subarray(this.#start, this.#end);
      this.#rawBytes = bytes;
    }
    return bytes;
  }

  /**
   * The decoded value of this element, by VR. Decode is lazy (the structural
   * parse stays eager; field decode runs on first access) and memoized - the
   * documented ~30× win on large studies where most fields are never read.
   * Fail-safe: never throws; a malformed value surfaces as typed-absent with
   * the deviation on the returned value's `warnings`.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const ds = parseDicom(buf);
   * const v = ds.get("00100010")?.value; // Patient's Name (PN)
   * if (v?.kind === "personName") console.log(v.values[0]?.alphabetic.familyName);
   * ```
   */
  public get value(): DicomValue {
    return (this.#value ??= decodeElementValue(this));
  }
}

/**
 * Build an Element that reads its fields from row `row` of `rows`, its value the range `start` to
 * `end` of the table's source, with Items when `hasItems`. `bytes`, when given, is its `rawBytes`; otherwise `rawBytes` is the
 * row's range of the source, made into a view the first time it is read.
 *
 * @internal
 */
export function elementOverTable(
  rows: ElementRows,
  row: number,
  start: number,
  end: number,
  hasItems: boolean,
  bytes: Buffer | undefined,
): Element {
  return overTable(rows, row, start, end, hasItems, bytes);
}

/**
 * The buffer an Element's value bytes sit in: the table's source until `rawBytes` is
 * read, then `rawBytes` itself. Read the value from
 * {@link elementValueStart} to {@link elementValueEnd} of it.
 *
 * @internal
 */
export function elementValueSource(el: Element): Buffer {
  return rangeSource(el);
}

/** @internal */
export function elementValueStart(el: Element): number {
  return rangeStart(el);
}

/** @internal */
export function elementValueEnd(el: Element): number {
  return rangeEnd(el);
}

/**
 * Instances kept for the life of the process so V8 keeps this class's hidden classes.
 *
 * A hidden class past an object's first field is reachable only from the objects that use it, so
 * once a collection finds no live instance it drops the chain, and the next instance built pays to
 * make every one of them again: 1 to 2 KiB a field, measured, which after a collection
 * outweighs the parse of a small file. These instances hold the chain, and that of the fields
 * object an Element built by hand keeps. They are built with the field kinds a build stores (a
 * number or nothing, a string or nothing, an object or nothing), so later instances share their
 * hidden classes rather than branching from them. An Element over a table is kept beside the
 * table's own, in `TABLE_SHAPES` in `./compact.ts`.
 */
export const ELEMENT_SHAPES: readonly Element[] = (() => {
  const empty = Buffer.alloc(0);
  const blank: ElementInit = {
    tag: "",
    vr: "UN",
    vm: 0,
    length: 0,
    rawBytes: empty,
    byteOffset: 0,
    littleEndian: true,
  };
  const full: ElementInit = {
    ...blank,
    privateCreator: "",
    cp246Promoted: true,
    specificCharacterSet: [],
    items: [],
  };
  return [new Element(blank), new Element(full)];
})();

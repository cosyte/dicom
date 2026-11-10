/**
 * The structural `Element` - leaf wrapper over an on-wire DICOM
 * Data Element.
 *
 * `rawBytes` is a `Buffer.subarray()` view over the source buffer by default
 * (zero-copy), pinning the source ArrayBuffer until every Element is GC'd.
 * The `parseDicom` `{ copyValues: true }` option flips production to
 * `Buffer.from(slice)` so the source can be released; every producer in the
 * parser honours it.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

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
 * Hands the parser and the value decoders a way into an Element's private value
 * range, set once by the class's static block. Not exported from the package.
 */
let setRange: (el: Element, source: Buffer, start: number, end: number) => void;
let rangeSource: (el: Element) => Buffer;
let rangeStart: (el: Element) => number;
let rangeEnd: (el: Element) => number;

/**
 * One DICOM Data Element as parsed.
 *
 * Structural surface: `tag`, `vr`, `vm`, `length`, `rawBytes`,
 * `byteOffset`, `privateCreator`. On top of it sits a lazy, memoized
 * `.value` getter backed by the VR-aware decoders under `src/dataset/vr/`.
 *
 * `rawBytes` retention behaviour: zero-copy `Buffer.subarray` view by
 * default (pins source ArrayBuffer); pass `{ copyValues: true }` to
 * `parseDicom` for `Buffer.from(slice)` per element when the source
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
  public readonly tag: Tag;
  public readonly vr: VR;
  public readonly vm: number;
  public readonly length: number;
  public readonly byteOffset: number;
  public readonly privateCreator: string | undefined;
  /**
   * Hint for the lazy SQ decoder. `true` when this Element was promoted
   * from `VR=UN` with undefined length to `VR=SQ` via the CP-246 fallback,
   * which is what selects the Implicit VR LE inner decoder. Always
   * `undefined` on standard SQ elements.
   *
   * @internal
   */
  public readonly cp246Promoted: boolean | undefined;
  /** Value byte order (per transfer syntax). See {@link ElementInit.littleEndian}. */
  public readonly littleEndian: boolean;
  /** In-effect `(0008,0005)` terms, or `undefined` for the Default Repertoire. */
  public readonly specificCharacterSet: readonly string[] | undefined;
  /** Parsed items for an `SQ` element; `undefined` otherwise. */
  public readonly items: readonly Item[] | undefined;

  /** Lazily-decoded, memoized {@link DicomValue}. */
  private _valueCache: DicomValue | undefined;

  /**
   * The value's bytes once made: given at construction, or the view of
   * `#source` made the first time `rawBytes` is read. ECMAScript private, so
   * the source buffer never shows in `Object.keys`, a spread or a JSON dump.
   */
  #rawBytes: Buffer | undefined;
  /** The buffer the value is a range of, until `rawBytes` makes its view. */
  #source: Buffer | undefined;
  #start = 0;
  #end = 0;

  static {
    setRange = (el, source, start, end): void => {
      el.#rawBytes = undefined;
      el.#source = source;
      el.#start = start;
      el.#end = end;
    };
    rangeSource = (el) => el.#rawBytes ?? (el.#source as Buffer);
    rangeStart = (el) => (el.#rawBytes === undefined ? el.#start : 0);
    rangeEnd = (el) => (el.#rawBytes === undefined ? el.#end : el.#rawBytes.length);
  }

  /**
   * Construct a new structural `Element`. The parser builds these directly
   * from on-wire bytes; consumers receive them via `Dataset` after
   * `parseDicom`.
   *
   * @internal
   */
  public constructor(init: ElementInit) {
    this.tag = init.tag;
    this.vr = init.vr;
    this.vm = init.vm;
    this.length = init.length;
    this.#rawBytes = init.rawBytes;
    this.byteOffset = init.byteOffset;
    this.privateCreator = init.privateCreator;
    this.cp246Promoted = init.cp246Promoted;
    this.littleEndian = init.littleEndian;
    this.specificCharacterSet = init.specificCharacterSet;
    this.items = init.items;
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
      bytes = (this.#source as Buffer).subarray(this.#start, this.#end);
      this.#rawBytes = bytes;
      this.#source = undefined;
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
    return (this._valueCache ??= decodeElementValue(this));
  }
}

/**
 * Build an Element whose `rawBytes` is the range `start` to `end` of `source`,
 * made into a view only when it is first read. `init.rawBytes` is ignored, and
 * may be absent.
 * What a caller reads is exactly what an Element built with
 * `rawBytes: source.subarray(start, end)` gives.
 *
 * @internal
 */
export function elementOverRange(
  init: ElementInit,
  source: Buffer,
  start: number,
  end: number,
): Element {
  const el = new Element(init);
  setRange(el, source, start, end);
  return el;
}

/**
 * The buffer an Element's value bytes sit in: the source until `rawBytes` is
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

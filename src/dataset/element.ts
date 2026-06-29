/**
 * Phase 2 structural `Element` — leaf wrapper over an on-wire DICOM
 * Data Element.
 *
 * Per `02-CONTEXT.md` D-04 + D-42: structural fields ONLY. No `.value`
 * getter, no decoders, no `.items` navigation — those land in Phase 3,
 * which extends this class.
 *
 * Per D-16: `rawBytes` is a `Buffer.subarray()` view over the source
 * buffer by default (zero-copy), pinning the source ArrayBuffer until
 * every Element is GC'd. The `parseDicom` `{ copyValues: true }` option
 * flips production to `Buffer.from(slice)` so the source can be
 * released; producers (parser plans 02-04 onward) honour it.
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
 * to its registered Private Creator string per D-33 / D-34.
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
   * Phase 2 hint set by the parser when an `Element` was promoted from
   * `VR=UN` with undefined length to `VR=SQ` via the CP-246 fallback (D-30).
   * Phase 3 reads this to choose the inner SQ decoder (Implicit VR LE) on
   * first lazy access. Never set on standard SQ elements.
   *
   * @internal
   */
  readonly cp246Promoted?: boolean;
  /**
   * Byte order of the value bytes, set by the parser per transfer syntax
   * (`true` for Implicit/Explicit VR LE + Deflated; `false` for Explicit VR
   * BE). Phase 3 numeric decoders read this — signedness comes from the VR,
   * endianness from here.
   */
  readonly littleEndian: boolean;
  /**
   * The dataset's resolved `(0008,0005)` Specific Character Set terms in
   * effect for this element (parent dataset's, or the item's own override).
   * Omitted when the Default Repertoire (ISO_IR 6) applies. Phase 3
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
 * One DICOM Data Element as parsed by Phase 2.
 *
 * Phase 2 surface (this plan): `tag`, `vr`, `vm`, `length`, `rawBytes`,
 * `byteOffset`, `privateCreator`. NO `.value` getter, NO decoders, NO
 * navigation methods. Phase 3 (per D-42) extends this class with a lazy,
 * memoized `.value` getter and the VR-aware decoders under
 * `src/dataset/vr/`.
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
  public readonly rawBytes: Buffer;
  public readonly byteOffset: number;
  public readonly privateCreator: string | undefined;
  /**
   * Phase 2 hint for Phase 3's lazy SQ decoder per D-30. `true` when this
   * Element was promoted from `VR=UN` with undefined length to `VR=SQ` via
   * the CP-246 fallback. Phase 3 uses this to choose the Implicit VR LE
   * inner decoder. Always `undefined` on standard SQ elements.
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
   * Construct a new structural `Element`. Producers (parser plans 02-03
   * onward) build these directly from on-wire bytes; consumers receive
   * them via `Dataset` after `parseDicom`.
   *
   * @internal
   */
  public constructor(init: ElementInit) {
    this.tag = init.tag;
    this.vr = init.vr;
    this.vm = init.vm;
    this.length = init.length;
    this.rawBytes = init.rawBytes;
    this.byteOffset = init.byteOffset;
    this.privateCreator = init.privateCreator;
    this.cp246Promoted = init.cp246Promoted;
    this.littleEndian = init.littleEndian;
    this.specificCharacterSet = init.specificCharacterSet;
    this.items = init.items;
  }

  /**
   * The decoded value of this element, by VR. Decode is lazy (the structural
   * parse stays eager; field decode runs on first access) and memoized — the
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

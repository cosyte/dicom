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
 * });
 * // el.tag === "00100010"; el.rawBytes is a Buffer of 8 bytes.
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
  }
}

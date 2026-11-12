/**
 * The `fast-check` arbitraries of the `@cosyte/dicom` property-test layer.
 *
 * The generators are the published ones, `@cosyte/dicom/arbitraries` (`src/arbitraries/`), so the
 * properties here test the generators a consumer installs. What stays in this file is test-only:
 * the transfer syntax UIDs by name, and the projection of a parsed `Dataset` back into a
 * `DicomModel`, which reads the protected element map.
 *
 * Three families of generators:
 *
 * 1. **Well-formed models** (`wellFormedModel`, encoded by `encodeModel`) drive the round-trip
 *    property. They leave out Explicit VR Big Endian, whose numeric values read back byte-reversed.
 * 2. **Malformed but recoverable files** (`recoverableInput`), with the refused input
 *    (`fatalInput`), truncations and random bytes folded in, drive the lenient property.
 * 3. **Hostile bytes** (`arbitraryBytes`, `dicomShapedGarbage`, `truncatedValidFile`,
 *    `fuzzInput`) drive the fuzz targets.
 *
 * Everything is synthetic; nothing comes from a patient.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { Tag, VR } from "../../src/dictionary/types.js";
import type { DicomModel, ModelElement } from "../../src/arbitraries/index.js";

export {
  arbitraryBytes,
  dicomShapedGarbage,
  encodeModel,
  fatalInput,
  fuzzInput,
  recoverableInput,
  truncatedValidFile,
  wellFormedModel,
} from "../../src/arbitraries/index.js";
export type { DicomModel, ModelElement } from "../../src/arbitraries/index.js";

/** Implicit VR Little Endian. */
export const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
/** Explicit VR Little Endian. */
export const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
/** Explicit VR Big Endian (retired, still read). */
export const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
/** Deflated Explicit VR Little Endian. */
export const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

/** The byte form of a round-trip wire string (latin1 maps each byte to one code unit). */
export function wireToBuffer(wire: string): Buffer {
  return Buffer.from(wire, "latin1");
}

/**
 * Test-only structural view of `Dataset._elements`, the protected element map. Typed through a
 * structural interface so no `any` is needed.
 */
interface DatasetElementsView {
  readonly _elements: ReadonlyMap<
    string,
    { readonly tag: Tag; readonly vr: VR; readonly rawBytes: Buffer }
  >;
}

/**
 * Project a parsed `Dataset` (passed as `unknown` to avoid importing the class) back into the
 * comparable `DicomModel` shape, reading the protected `_elements` map. `transferSyntax` comes from
 * `fileMeta.transferSyntaxUID`. This is the `parse` side the round-trip property compares against
 * the generated model.
 */
export function projectDataset(ds: unknown): DicomModel {
  const view = ds as DatasetElementsView & { readonly fileMeta?: { transferSyntaxUID: string } };
  const elements: Record<string, ModelElement> = {};
  for (const [tag, el] of view._elements) {
    elements[tag] = { tag: el.tag, vr: el.vr, valueHex: el.rawBytes.toString("hex") };
  }
  return {
    transferSyntax: view.fileMeta?.transferSyntaxUID ?? "",
    elements,
  };
}

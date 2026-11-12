/**
 * Well-formed Data Sets: a model a test can compare, and the Part 10 bytes it encodes to.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import type { Arbitrary } from "fast-check";

import { DEFLATED_LE, EXPLICIT_LE, IMPLICIT_LE, writePart10 } from "./encode.js";

/** One element of a {@link DicomModel}: its tag, its VR, and its value bytes as lowercase hex. */
export interface ModelElement {
  /** The tag, eight uppercase hex digits, `"00100010"` for Patient's Name. */
  readonly tag: string;
  /** The VR the data dictionary gives the tag, `"PN"` for Patient's Name. */
  readonly vr: string;
  /** The value bytes as lowercase hex, even in length, as `Element.rawBytes` holds them. */
  readonly valueHex: string;
}

/**
 * A well-formed Data Set as a plain value two tests can compare: the transfer syntax it is
 * written in and its elements, keyed by tag, so the order they were generated in does not matter.
 */
export interface DicomModel {
  /** The Transfer Syntax UID the Data Set is written in. */
  readonly transferSyntax: string;
  /** The elements, keyed by tag. */
  readonly elements: Readonly<Record<string, ModelElement>>;
}

/**
 * The tags a model draws from, each with the VR the data dictionary (PS3.6) gives it, so the file
 * reads back with no warning under every syntax: Implicit VR takes the VR from the dictionary, and
 * Explicit VR writes the same one.
 */
const TAG_VR: Readonly<Record<string, string>> = {
  "00080018": "UI", // SOP Instance UID
  "00080020": "DA", // Study Date
  "00080030": "TM", // Study Time
  "00080060": "CS", // Modality
  "00100010": "PN", // Patient's Name
  "00100020": "LO", // Patient ID
  "00100040": "CS", // Patient's Sex
  "00181030": "LO", // Protocol Name
  "0020000D": "UI", // Study Instance UID
  "0020000E": "UI", // Series Instance UID
  "00280010": "US", // Rows
  "00280011": "US", // Columns
};

/**
 * The characters a text value draws from: no backslash, which separates values, and no control
 * byte, so each value stays one value.
 */
const TEXT_CHARACTERS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-^",
] as const;

/**
 * The syntaxes a model is written in. Explicit VR Big Endian is left out: its numeric values are
 * stored as the bytes on the wire, so a model written there reads back byte-reversed, which is
 * correct and not a round trip.
 */
const MODEL_SYNTAXES = [IMPLICIT_LE, EXPLICIT_LE, DEFLATED_LE] as const;

/**
 * A text value of 1 to 14 characters, padded with one space to an even length. `size: "max"` lets
 * fast-check reach the bound; at its default size it stops near ten.
 */
function textValue(): Arbitrary<Buffer> {
  return fc
    .string({ unit: fc.constantFrom(...TEXT_CHARACTERS), minLength: 1, maxLength: 14, size: "max" })
    .map((text) => Buffer.from(text.length % 2 === 0 ? text : `${text} `));
}

/** One unsigned 16-bit value, little-endian. */
function unsignedShort(): Arbitrary<Buffer> {
  return fc.integer({ min: 0, max: 0xffff }).map((n) => {
    const out = Buffer.alloc(2);
    out.writeUInt16LE(n);
    return out;
  });
}

function modelElement(): Arbitrary<ModelElement> {
  return fc.constantFrom(...Object.entries(TAG_VR)).chain(([tag, vr]) =>
    (vr === "US" ? unsignedShort() : textValue()).map((value) => ({
      tag,
      vr,
      valueHex: value.toString("hex"),
    })),
  );
}

/**
 * Well-formed Data Sets of up to six elements: real tags with their dictionary VRs, text and
 * unsigned short values, in Implicit VR Little Endian, Explicit VR Little Endian or Deflated
 * Explicit VR Little Endian. Each one encodes ({@link encodeModel}) to a file that reads back with
 * no warning and the same tags, VRs and value bytes.
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseDicom } from "@cosyte/dicom";
 * import { encodeModel, wellFormedModel } from "@cosyte/dicom/arbitraries";
 *
 * fc.assert(
 *   fc.property(wellFormedModel(), (model) => parseDicom(encodeModel(model)).warnings.length === 0),
 * );
 * ```
 */
export function wellFormedModel(): Arbitrary<DicomModel> {
  return fc
    .record({
      transferSyntax: fc.constantFrom(...MODEL_SYNTAXES),
      elements: fc.array(modelElement(), { maxLength: 6 }),
    })
    .map(({ transferSyntax, elements }) => ({
      transferSyntax,
      elements: Object.fromEntries(elements.map((element) => [element.tag, element])),
    }));
}

/**
 * The Part 10 bytes of a model: a preamble, a File Meta group naming the model's transfer syntax,
 * and the elements in ascending tag order. The same model always encodes to the same bytes.
 *
 * @param model - The model, usually from {@link wellFormedModel}.
 * @returns The file's bytes.
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * import { encodeModel } from "@cosyte/dicom/arbitraries";
 *
 * const bytes = encodeModel({ transferSyntax: "1.2.840.10008.1.2.1", elements: {} });
 * parseDicom(bytes).warnings.length; // 0
 * ```
 */
export function encodeModel(model: DicomModel): Buffer {
  const elements = Object.values(model.elements)
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map(({ tag, vr, valueHex }) => ({ tag, vr, value: Buffer.from(valueHex, "hex") }));
  return writePart10({ transferSyntax: model.transferSyntax, elements });
}

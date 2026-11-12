/**
 * The shapes of the DICOM JSON Model (PS3.18 Annex F) as `toDicomJson` writes them and
 * `fromDicomJson` reads them, and the options of both.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import type { FileMeta } from "../dataset/file-meta.js";
import type { FallbackCharacterSet } from "../dataset/vr/charset.js";

/**
 * One Person Name value: its alphabetic, ideographic and phonetic component groups, each the
 * group's text with its `^` component separators kept. A group the value does not carry is left
 * out.
 *
 * @example
 * ```ts
 * import type { DicomJsonPersonName } from "@cosyte/dicom";
 * const name: DicomJsonPersonName = { Alphabetic: "DOE^JANE" };
 * ```
 */
export interface DicomJsonPersonName {
  readonly Alphabetic?: string;
  readonly Ideographic?: string;
  readonly Phonetic?: string;
}

/**
 * One value in an attribute's `Value` array: a string, a number, a Person Name object, a nested
 * Data Set (a Sequence item), or `null` for an empty value among several.
 *
 * @example
 * ```ts
 * import type { DicomJsonValue } from "@cosyte/dicom";
 * const values: DicomJsonValue[] = ["ORIGINAL", "PRIMARY", null];
 * ```
 */
export type DicomJsonValue = string | number | DicomJsonPersonName | DicomJsonDataset | null;

/**
 * One attribute of a DICOM JSON Data Set: its VR, and at most one of `Value`, `InlineBinary` and
 * `BulkDataURI`. An attribute with none of the three is present with an empty value.
 *
 * @example
 * ```ts
 * import type { DicomJsonAttribute } from "@cosyte/dicom";
 * const rows: DicomJsonAttribute = { vr: "US", Value: [512] };
 * ```
 */
export interface DicomJsonAttribute {
  readonly vr: string;
  readonly Value?: readonly DicomJsonValue[];
  readonly InlineBinary?: string;
  readonly BulkDataURI?: string;
}

/**
 * A DICOM JSON Data Set: attributes keyed by their tag as eight uppercase hex digits, Group
 * Number then Element Number, `"00100010"` for Patient's Name.
 *
 * @example
 * ```ts
 * import type { DicomJsonDataset } from "@cosyte/dicom";
 * const ds: DicomJsonDataset = { "00080060": { vr: "CS", Value: ["CT"] } };
 * ```
 */
export interface DicomJsonDataset {
  readonly [tag: string]: DicomJsonAttribute;
}

/**
 * Options for `toDicomJson`.
 *
 * @example
 * ```ts
 * import { parseDicom, toDicomJson, type ToDicomJsonOptions } from "@cosyte/dicom";
 * const options: ToDicomJsonOptions = {
 *   bulkDataUri: (el) => (el.tag === "7FE00010" ? "https://example.com/frames/1" : undefined),
 * };
 * toDicomJson(parseDicom(buf), options);
 * ```
 */
export interface ToDicomJsonOptions {
  /**
   * Asked for each element of a binary VR (`OB`, `OD`, `OF`, `OL`, `OV`, `OW`, `UN`) that has a
   * value. Return a URI to write the attribute as a `BulkDataURI`, or `undefined` to write its
   * bytes inline as base64 in `InlineBinary`. A bulk value (Pixel Data `(7FE0,0010)`, Float and
   * Double Float Pixel Data `(7FE0,0008)` and `(7FE0,0009)`, Overlay Data `(60xx,3000)`,
   * Waveform Data `(5400,1010)`, Spectroscopy Data `(5600,0020)` and Encapsulated Document
   * `(0042,0011)`) is written inline only when `inlineBulkData` is `true`; with no URI and no
   * opt-in it is refused with `BULK_DATA_URI_REQUIRED`.
   */
  readonly bulkDataUri?: (element: Element) => string | undefined;
  /**
   * `true` to write a bulk value the `bulkDataUri` option gave no URI for inline, as base64 in
   * `InlineBinary`. Off by default: the model is for metadata, and Pixel Data inline is rarely
   * what a caller means.
   */
  readonly inlineBulkData?: boolean;
  /**
   * The Specific Character Set to read text under where its Data Set declares none (no
   * `(0008,0005)`, or an empty one): one term of `FALLBACK_CHARACTER_SETS`, such as
   * `"ISO_IR 100"`. Without it that text is the default repertoire ISO-IR 6, and a byte past
   * `0x7F` is refused with `MALFORMED_VALUE`. A Data Set `parseDicom` read with its own
   * `fallbackCharacterSet` already carries the set on each element, and needs no option here. No
   * `(0008,0005)` is added to the result. A value outside the list is refused with
   * `INVALID_OPTION`.
   */
  readonly fallbackCharacterSet?: FallbackCharacterSet;
  /**
   * `true` to read under `fallbackCharacterSet` also where `(0008,0005)` names a term this build
   * does not decode, which is otherwise refused with `UNSUPPORTED_CHARACTER_SET`; the
   * `(0008,0005)` value is then written as it is. Given without a `fallbackCharacterSet`, or as
   * anything but a boolean, it is refused with `INVALID_OPTION`.
   */
  readonly fallbackCharacterSetForUnknown?: boolean;
}

/**
 * Options for `fromDicomJson`.
 *
 * @example
 * ```ts
 * import { fromDicomJson, type FromDicomJsonOptions } from "@cosyte/dicom";
 * const options: FromDicomJsonOptions = {
 *   fileMeta: { transferSyntaxUID: "1.2.840.10008.1.2.1" },
 *   sequenceLength: "undefined",
 * };
 * fromDicomJson({ "00080060": { vr: "CS", Value: ["CT"] } }, options);
 * ```
 */
export interface FromDicomJsonOptions {
  /**
   * The File Meta Information the Data Set is written under; its `transferSyntaxUID` picks the
   * encoding. The JSON Model holds no File Meta, so a round trip passes the source's
   * `Dataset.fileMeta` back here.
   */
  readonly fileMeta: FileMeta;
  /**
   * How each Sequence and each Item is delimited: `"defined"` (the default) writes explicit
   * lengths, `"undefined"` writes undefined lengths closed by delimitation items. The JSON Model
   * does not record which a source used.
   */
  readonly sequenceLength?: "defined" | "undefined";
  /**
   * Resolves a `BulkDataURI` to the value's bytes, given the URI and the attribute's VR. Return
   * `undefined` for a URI it cannot resolve, which is refused with `BULK_DATA_UNRESOLVED`.
   */
  readonly resolveBulkData?: (uri: string, vr: string) => Buffer | Uint8Array | undefined;
}

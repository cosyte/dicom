/**
 * Input a lenient reader has to survive: files with one recoverable deviation, files the reader
 * refuses, truncated files, and bytes with no structure at all.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import type { Arbitrary } from "fast-check";

import {
  DEFLATED_LE,
  EXPLICIT_BE,
  EXPLICIT_LE,
  IMPLICIT_LE,
  type LeafElement,
  type Part10Spec,
  writePart10,
} from "./encode.js";

/** A plainly invented Patient's Name, the one element most deviations are carried beside. */
const FILLER: LeafElement = { tag: "00100010", vr: "PN", value: Buffer.from("SYNTHETIC^TEST") };

/** The little-endian syntaxes a deviation is written under. */
const LITTLE_ENDIAN = [IMPLICIT_LE, EXPLICIT_LE] as const;

/** A file of {@link FILLER} under each little-endian syntax, with `deviation` applied. */
function filler(deviation: Omit<Part10Spec, "transferSyntax" | "elements">): Arbitrary<Buffer> {
  return fc
    .constantFrom(...LITTLE_ENDIAN)
    .map((transferSyntax) => writePart10({ transferSyntax, elements: [FILLER], ...deviation }));
}

/** An Explicit VR Little Endian file holding a sequence of one item. */
function sequenceOfOne(item: readonly LeafElement[]): Buffer {
  return writePart10({
    transferSyntax: EXPLICIT_LE,
    elements: [{ tag: "0040A730", items: [item] }],
  });
}

/**
 * An Explicit VR Little Endian file whose one Data Set element, an `OB`, has a non-zero second
 * reserved byte. That byte sits seven bytes from the end: before the 32-bit length and the two
 * value bytes.
 */
function nonzeroReserved(): Buffer {
  const file = writePart10({
    transferSyntax: EXPLICIT_LE,
    elements: [{ tag: "00181020", vr: "OB", value: Buffer.from([1, 2]) }],
  });
  file[file.length - 7] = 0xff;
  return file;
}

/** Files with one deviation the reader recovers from with a warning, or reads as it is. */
function recoverable(): Arbitrary<Buffer> {
  return fc.oneof(
    // DICOM_MISSING_PREAMBLE
    filler({ noPreamble: true }),
    // DICOM_FILE_META_GROUP_LENGTH_MISMATCH
    filler({ groupLength: "short" }),
    // DICOM_FILE_META_GROUP_LENGTH_MISSING
    filler({ groupLength: "omit" }),
    // DICOM_ODD_LENGTH_VALUE_PADDED
    fc.constant(
      writePart10({
        transferSyntax: EXPLICIT_LE,
        elements: [{ tag: "00100020", vr: "LO", value: Buffer.from("ODD") }],
      }),
    ),
    // DICOM_GROUP_LENGTH_IN_DATASET
    fc.constantFrom(...LITTLE_ENDIAN).map((transferSyntax) =>
      writePart10({
        transferSyntax,
        elements: [{ tag: "00080000", vr: "UL", value: Buffer.from([4, 0, 0, 0]) }, FILLER],
      }),
    ),
    // A sequence of undefined length: conformant, read with no warning.
    fc.constant(sequenceOfOne([{ tag: "00080100", vr: "SH", value: Buffer.from("CODE") }])),
    // DICOM_EMPTY_ITEM_IN_SEQUENCE
    fc.constant(sequenceOfOne([])),
    // DICOM_NONZERO_RESERVED_BYTES
    fc.constant(nonzeroReserved()),
    // Bytes after the Data Set.
    fc
      .tuple(
        fc.constantFrom(...LITTLE_ENDIAN),
        fc.uint8Array({ minLength: 1, maxLength: 16, size: "max" }),
      )
      .map(([transferSyntax, bytes]) =>
        writePart10({ transferSyntax, elements: [FILLER], trailing: Buffer.from(bytes) }),
      ),
  );
}

/**
 * Input the reader refuses with a fatal `DicomParseError`, each with its code: no bytes
 * (`EMPTY_INPUT`), text that is not Part 10 (`NOT_DICOM_PART_10`), a File Meta group with no
 * Transfer Syntax UID (`INVALID_FILE_META`), and a transfer syntax the reader does not support
 * (`UNSUPPORTED_TRANSFER_SYNTAX`).
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { DicomParseError, parseDicom } from "@cosyte/dicom";
 * import { fatalInput } from "@cosyte/dicom/arbitraries";
 *
 * fc.assert(
 *   fc.property(fatalInput(), (bytes) => {
 *     try {
 *       parseDicom(bytes);
 *       return false;
 *     } catch (error) {
 *       return error instanceof DicomParseError;
 *     }
 *   }),
 * );
 * ```
 */
export function fatalInput(): Arbitrary<Buffer> {
  return fc.oneof(
    fc.constant(Buffer.alloc(0)),
    fc
      .string({ minLength: 16, maxLength: 64, size: "max" })
      .map((text) => Buffer.from(`NOTDICOM-${text}`)),
    fc.constant(
      writePart10({ transferSyntax: EXPLICIT_LE, elements: [], noTransferSyntaxUid: true }),
    ),
    // SMPTE ST 2110-20 Uncompressed Progressive Active Video, which the reader refuses.
    fc.constant(writePart10({ transferSyntax: "1.2.840.10008.1.2.7.1", elements: [] })),
  );
}

/**
 * Random bytes, 0 to 512 of them, with no structure at all. Each length bound in this module is
 * drawn at fast-check's `"max"` size, so the whole range is reached, not only the short end.
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { arbitraryBytes } from "@cosyte/dicom/arbitraries";
 *
 * fc.sample(arbitraryBytes(), 3).every((bytes) => bytes.length <= 512); // true
 * ```
 */
export function arbitraryBytes(): Arbitrary<Buffer> {
  return fc.uint8Array({ maxLength: 512, size: "max" }).map((bytes) => Buffer.from(bytes));
}

/**
 * A preamble and the `DICM` prefix followed by up to 400 random bytes, so the reader gets past the
 * Part 10 check and reads garbage as File Meta and Data Set.
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { dicomShapedGarbage } from "@cosyte/dicom/arbitraries";
 *
 * fc.sample(dicomShapedGarbage(), 1)[0]?.subarray(128, 132).toString(); // "DICM"
 * ```
 */
export function dicomShapedGarbage(): Arbitrary<Buffer> {
  return fc
    .uint8Array({ maxLength: 400, size: "max" })
    .map((bytes) => Buffer.concat([Buffer.alloc(128), Buffer.from("DICM"), bytes]));
}

/**
 * A well-formed file cut at a random point: a Patient's Name, Rows, Modality and a sequence of
 * undefined length, under each of the four uncompressed transfer syntaxes, cut anywhere from no
 * bytes to the whole file. The shape a partial file on disk or a short read takes.
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { DicomParseError, parseDicom } from "@cosyte/dicom";
 * import { truncatedValidFile } from "@cosyte/dicom/arbitraries";
 *
 * fc.assert(
 *   fc.property(truncatedValidFile(), (bytes) => {
 *     try {
 *       parseDicom(bytes);
 *     } catch (error) {
 *       if (!(error instanceof DicomParseError)) throw error;
 *     }
 *   }),
 * );
 * ```
 */
export function truncatedValidFile(): Arbitrary<Buffer> {
  return fc
    .constantFrom(IMPLICIT_LE, EXPLICIT_LE, EXPLICIT_BE, DEFLATED_LE)
    .map((transferSyntax) =>
      writePart10({
        transferSyntax,
        elements: [
          FILLER,
          { tag: "00280010", vr: "US", value: Buffer.from([0, 2]) },
          { tag: "00080060", vr: "CS", value: Buffer.from("CT") },
          {
            tag: "0040A730",
            items: [[{ tag: "00080100", vr: "SH", value: Buffer.from("CODE") }]],
          },
        ],
      }),
    )
    .chain((file) => fc.nat({ max: file.length }).map((cut) => file.subarray(0, cut)));
}

/**
 * Everything a lenient reader is fed: mostly files with one recoverable deviation, then refused
 * input, truncated files and random bytes. Reading any of them either returns a `Dataset` whose
 * warnings carry registered codes, or throws a fatal `DicomParseError`, and nothing else.
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { DicomParseError, parseDicom } from "@cosyte/dicom";
 * import { recoverableInput } from "@cosyte/dicom/arbitraries";
 *
 * fc.assert(
 *   fc.property(recoverableInput(), (bytes) => {
 *     try {
 *       parseDicom(bytes);
 *     } catch (error) {
 *       if (!(error instanceof DicomParseError)) throw error;
 *     }
 *   }),
 * );
 * ```
 */
export function recoverableInput(): Arbitrary<Buffer> {
  return fc.oneof(
    { weight: 5, arbitrary: recoverable() },
    { weight: 2, arbitrary: fatalInput() },
    { weight: 2, arbitrary: truncatedValidFile() },
    { weight: 1, arbitrary: arbitraryBytes() },
  );
}

/**
 * What a fuzz run feeds the reader: random bytes, `DICM`-prefixed garbage and truncated files.
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { DicomParseError, parseDicom } from "@cosyte/dicom";
 * import { fuzzInput } from "@cosyte/dicom/arbitraries";
 *
 * fc.assert(
 *   fc.property(fuzzInput(), (bytes) => {
 *     try {
 *       parseDicom(bytes);
 *     } catch (error) {
 *       if (!(error instanceof DicomParseError)) throw error;
 *     }
 *   }),
 * );
 * ```
 */
export function fuzzInput(): Arbitrary<Buffer> {
  return fc.oneof(
    { weight: 2, arbitrary: arbitraryBytes() },
    { weight: 2, arbitrary: dicomShapedGarbage() },
    { weight: 3, arbitrary: truncatedValidFile() },
  );
}

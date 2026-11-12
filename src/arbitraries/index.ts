/**
 * fast-check generators for DICOM Part 10, at `@cosyte/dicom/arbitraries`: well-formed Data Sets
 * and the bytes they encode to, files with one recoverable deviation, files the reader refuses,
 * truncated files and random bytes. We use them to test this library, and you can use them to test
 * code you build on it.
 *
 * `fast-check` is an optional peer dependency: install it to use this entry point. The main entry
 * point, `@cosyte/dicom`, never loads it.
 *
 * Every generated value is synthetic: random bytes, random text from a small alphabet, and one
 * plainly invented name, `SYNTHETIC^TEST`. Nothing in one comes from a patient.
 *
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
 *
 * @packageDocumentation
 */

export { encodeModel, wellFormedModel } from "./model.js";
export type { DicomModel, ModelElement } from "./model.js";
export {
  arbitraryBytes,
  dicomShapedGarbage,
  fatalInput,
  fuzzInput,
  recoverableInput,
  truncatedValidFile,
} from "./inputs.js";

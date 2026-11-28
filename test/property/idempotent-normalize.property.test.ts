/**
 * Idempotent normalize, through the shared `@cosyte/test-utils` `idempotentNormalizeProperty`
 * runner: writing back what the parser read, then reading and writing that again, changes no byte.
 *
 * The normalizer is `serializeDicom(parseDicom(bytes))`, the lenient read followed by the writer,
 * which pads odd values, rebuilds File Meta, zeroes the preamble and drops retired group lengths.
 * Its output must be a fixed point: a second pass that moved a byte would break every digest,
 * cache and comparison built on written files.
 *
 * Two generators feed it:
 *
 * - `wellFormedModel()`, encoded by `encodeModel`: files the writer can write.
 * - `recoverableInput()`: malformed files the lenient parser recovers with warnings. A case the
 *   parser refuses with a fatal, or the writer refuses with a coded error, is not input the
 *   normalizer accepts, so the generator filters it out before the property sees it; the lenient
 *   property in `lenient.property.test.ts` holds what those refusals may be.
 *
 * The wire form is a latin1 string, one code unit per byte, so the runner's default equality
 * compares bytes. Depth and seed come from `COSYTE_PROPERTY_RUNS` and `COSYTE_PROPERTY_SEED`
 * (`test/helpers/property.ts`).
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { idempotentNormalizeProperty } from "@cosyte/test-utils";
import { describe, it } from "vitest";

import { parseDicom, serializeDicom } from "../../src/index.js";
import { propertyRun } from "../helpers/property.js";

import { encodeModel, recoverableInput, wellFormedModel } from "./_arbitraries.js";

/** Read the bytes leniently and write them back, in the latin1 wire form. */
function normalize(wire: string): string {
  return serializeDicom(parseDicom(Buffer.from(wire, "latin1"))).toString("latin1");
}

/** Whether the normalizer accepts the bytes: neither the parser nor the writer refuses them. */
function normalizes(bytes: Buffer): boolean {
  try {
    serializeDicom(parseDicom(bytes));
    return true;
  } catch {
    return false;
  }
}

describe("dicom conformance: idempotent normalize (write(read(x)) is a fixed point)", () => {
  it("re-normalizing a written well-formed file changes no byte", () => {
    const { seed } = propertyRun("idempotent normalize: well-formed files");
    idempotentNormalizeProperty<string>({
      arbitrary: wellFormedModel().map((model) => encodeModel(model).toString("latin1")),
      normalize,
      seed,
    });
  });

  it("re-normalizing a written recovered file changes no byte", () => {
    const { seed } = propertyRun("idempotent normalize: recovered files");
    idempotentNormalizeProperty<string>({
      arbitrary: recoverableInput()
        .filter(normalizes)
        .map((bytes) => bytes.toString("latin1")),
      normalize,
      seed,
    });
  });
});

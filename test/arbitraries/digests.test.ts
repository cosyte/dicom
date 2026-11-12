/**
 * What each published generator, `@cosyte/dicom/arbitraries`, draws from a fixed seed, pinned as a
 * SHA-256 digest of the samples. A change to a generator that changes what it draws changes its
 * digest, and the snapshot has to be updated in the same change, where a reviewer reads it.
 *
 * `deflateRawSync` is replaced in this file by a copy of its input. zlib builds differ in the bytes
 * they compress the same input to (a system zlib and the one Node bundles do), so a deflated Data
 * Set, and every draw a truncation of one changes, would make the digest a fact about the machine.
 * The real compression is held to `buildDicom` byte for byte in `arbitraries.test.ts`.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type * as Zlib from "node:zlib";

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  arbitraryBytes,
  dicomShapedGarbage,
  encodeModel,
  fatalInput,
  fuzzInput,
  recoverableInput,
  truncatedValidFile,
  wellFormedModel,
} from "../../src/arbitraries/index.js";

vi.mock("node:zlib", async (importOriginal) => ({
  ...(await importOriginal<typeof Zlib>()),
  deflateRawSync: (bytes: Uint8Array) => Buffer.from(bytes),
}));

const SEED = 20_261_111;

function sample<T>(arbitrary: fc.Arbitrary<T>, numRuns: number): T[] {
  return fc.sample(arbitrary, { seed: SEED, numRuns });
}

function digest(samples: readonly Buffer[]): string {
  const hash = createHash("sha256");
  for (const bytes of samples) {
    hash.update(`${String(bytes.length)}:`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

describe("what each generator draws from a fixed seed", () => {
  it("is pinned", () => {
    const models = sample(wellFormedModel(), 300);
    expect({
      wellFormedModel: digest(models.map((m) => Buffer.from(JSON.stringify(m)))),
      encodeModel: digest(models.map(encodeModel)),
      recoverableInput: digest(sample(recoverableInput(), 300)),
      fatalInput: digest(sample(fatalInput(), 100)),
      arbitraryBytes: digest(sample(arbitraryBytes(), 100)),
      dicomShapedGarbage: digest(sample(dicomShapedGarbage(), 100)),
      truncatedValidFile: digest(sample(truncatedValidFile(), 300)),
      fuzzInput: digest(sample(fuzzInput(), 300)),
    }).toMatchSnapshot();
  });

  it("writes a deflated Data Set through the stand-in, uncompressed", () => {
    const file = encodeModel({
      transferSyntax: "1.2.840.10008.1.2.1.99",
      elements: { "00280010": { tag: "00280010", vr: "US", valueHex: "0002" } },
    });
    expect(file.subarray(-10).toString("hex")).toBe("28001000555302000002");
  });
});

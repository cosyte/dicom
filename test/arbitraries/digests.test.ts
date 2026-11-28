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
  animalPatientInput,
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
      animalPatientInput: digest(sample(animalPatientInput(), 300)),
    }).toMatchInlineSnapshot(`
      {
        "animalPatientInput": "43d9448d1afa7c87ac8001c959e02afbcfc0797e88198fbcb4c28cee3e7c9217",
        "arbitraryBytes": "6dae56a98b4acd7754a14b0993b32f9ca57089f11db5a06f268966099e745594",
        "dicomShapedGarbage": "6ed9ff84c759eba1a76ab127e9a2db602b64dfa4029a7cc1bb2ac358c38ba8aa",
        "encodeModel": "e041d0bed29ad74a910c1656a7ce4a2675cd1cd72f6a4ebd1315200f776e2b84",
        "fatalInput": "fed426327fa554b6ed1d80051717f96ad5194f527bcbe17ce7e9346f19039cff",
        "fuzzInput": "03d0acd84d65bec95b17297a4a609355d89ec564710f4e42dac7d90db248ba81",
        "recoverableInput": "bc1478643310608d0ec03c942f7ba2acd9ee0ea6e9aa6fd173576986b8dc4bde",
        "truncatedValidFile": "6eb4e510d0c1fc529d0f19aaa1a04736132b9af62ca47a1c85912d68203a386b",
        "wellFormedModel": "645e842013315bbfdda5fdb07fe22242481de008d66389d0b3dae7abb6f1881b",
      }
    `);
  });

  it("writes a deflated Data Set through the stand-in, uncompressed", () => {
    const file = encodeModel({
      transferSyntax: "1.2.840.10008.1.2.1.99",
      elements: { "00280010": { tag: "00280010", vr: "US", valueHex: "0002" } },
    });
    expect(file.subarray(-10).toString("hex")).toBe("28001000555302000002");
  });
});

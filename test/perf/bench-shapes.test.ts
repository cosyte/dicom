/**
 * The bench's inputs are what they say they are. A benchmark of a file the reader refuses, or one
 * it reads down a recovery path, measures the wrong thing, so each shape `bench/shapes.mjs` builds
 * is held here to read cleanly and to write back to its own bytes: the shapes are spec-clean Part 10,
 * in ascending tag order with even lengths, so the writer has nothing to change.
 *
 * Every shape reads with no warning, the SR's undefined-length sequences included: the SR shape
 * writes them on purpose, as many SR producers do, and PS3.5 2026c section 7.1.2 allows them. Small
 * sizes only; the builders are the same at every size.
 */

import { describe, expect, it } from "vitest";

import { readTags } from "../../bench/dicom.bench.mjs";
import { ctImage, enhancedCt, srDocument, worklistItem } from "../../bench/shapes.mjs";
import { parseDicom, serializeDicom } from "../../src/index.js";

describe("the bench's synthetic shapes", () => {
  it("a worklist item reads with no warning, about 1 KiB, the same length at every index", () => {
    const lengths = new Set([0, 1, 7, 499, 1_999].map((i) => worklistItem(i).length));
    expect(lengths.size).toBe(1);
    const bytes = worklistItem(3);
    expect(bytes.length).toBeGreaterThan(900);
    expect(bytes.length).toBeLessThan(1_200);
    const ds = parseDicom(bytes);
    expect(ds.warnings).toEqual([]);
    expect(ds.patient.name?.alphabetic.familyName).toBe("SYNTHETIC");
    expect(ds.get("00400100")?.items).toHaveLength(1);
    expect(serializeDicom(ds).equals(bytes)).toBe(true);
  });

  it("a CT slice carries 512 by 512 by 16-bit Pixel Data and reads with no warning", () => {
    const bytes = ctImage(5);
    const ds = parseDicom(bytes);
    expect(ds.warnings).toEqual([]);
    expect(ds.image.rows).toBe(512);
    expect(ds.image.columns).toBe(512);
    expect(ds.get("7FE00010")?.length).toBe(512 * 512 * 2);
    expect(serializeDicom(ds).equals(bytes)).toBe(true);
    expect(readTags(ds)).toBeGreaterThan(80);
  });

  it("an Enhanced CT carries one frame of Pixel Data and one functional group Item a frame", () => {
    const bytes = enhancedCt(2, 3);
    const ds = parseDicom(bytes);
    expect(ds.warnings).toEqual([]);
    expect(ds.get("7FE00010")?.length).toBe(3 * 512 * 512 * 2);
    expect(ds.get("52009230")?.items).toHaveLength(3);
    expect(serializeDicom(ds).equals(bytes)).toBe(true);
  });

  it("frames of one Enhanced CT differ", () => {
    const pixels = parseDicom(enhancedCt(0, 2)).get("7FE00010")?.rawBytes;
    const frame = 512 * 512 * 2;
    expect(pixels?.subarray(0, frame).equals(pixels.subarray(frame))).toBe(false);
  });

  it("an SR of undefined-length sequences reads with no warning", () => {
    const bytes = srDocument(4, 6);
    const ds = parseDicom(bytes);
    expect(ds.warnings).toEqual([]);
    expect(ds.get("0040A730")?.items).toHaveLength(6);
    expect(ds.get("7FE00010")).toBeUndefined();
    expect(serializeDicom(ds).equals(bytes)).toBe(true);
  });

  it("an SR grows with its measurements", () => {
    const small = srDocument(0, 250).length;
    const large = srDocument(0, 1_000).length;
    expect(large / small).toBeGreaterThan(3.8);
    expect(large / small).toBeLessThan(4.1);
  });
});

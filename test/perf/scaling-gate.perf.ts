/**
 * The scaling gates for the Part 10 read, the read of every tag, and the Part 10 write, from
 * `@cosyte/test-utils/perf`, run by `pnpm test:perf` and never under coverage (see
 * `vitest.perf.config.ts`).
 *
 * Each asks one question: does the cost grow faster than the input? On the count axis, 4 times the
 * Modality Worklist entries; on the size axis, header-only SR documents with 4 times the
 * measurements, every sequence nested four deep and of undefined length. Each ratio must stay
 * inside the band the shared contract fixes. A gate does not see a constant-factor slowdown: a
 * reader 10% slower everywhere passes, and always will. The base against head comparison on a pull
 * request (`bench/dicom.bench.mjs`) is the instrument for that.
 *
 * Each self-check proves its fixtures are large enough for its gate to fail: the same work with its
 * bytes assembled the wrong way, everything received so far copied again each time a 16-byte chunk
 * arrives, must clear the ceiling at exactly these sizes. Every input is
 * synthetic and built in code by `bench/shapes.mjs`, the same code the benchmarks use.
 *
 * Not gated here: Pixel Data. The read keeps it as a view of the input and never copies it, so a
 * frame count axis measures the header; the write's copies of it are a constant factor, which a
 * reading of the bench records.
 */

import { Buffer } from "node:buffer";

import {
  assertScalingGateFires,
  PERF_CONTRACT,
  scalingGate,
  type ScalingGateOptions,
} from "@cosyte/test-utils/perf";
import { describe, expect, it } from "vitest";

import { readTags } from "../../bench/dicom.bench.mjs";
import { srDocument, worklistItem } from "../../bench/shapes.mjs";
import { parseDicom, serializeDicom, type Dataset } from "../../src/index.js";

/**
 * Worklist entries in the count axis's base phase. Five hundred read in 8.3 ms on a developer
 * machine, near the twice-the-minimum margin below and under it on a faster runner, so three times
 * as many.
 */
const COUNT = 1_500;
/** Measurements in the size axis's base SR, about 128 KiB; the scaled phase has 4 times as many. */
const MEASUREMENTS = 250;
/**
 * SR documents in each size-axis phase. Twelve, so every base phase stays well clear of the
 * contract's 4 ms minimum on the fastest hosted runner: there four documents came to 3.86 ms for the
 * read and 3.94 ms for the write, so twelve come to about 11.6 ms, near three times the minimum. The
 * documents are the same size either way, so the self-check's per-document regression is unchanged.
 */
const DOCUMENTS = 12;
/** The chunk the regressed copy appends at a time. */
const CHUNK = 16;

/**
 * The bytes assembled the wrong way: each time a chunk arrives, everything received so far is
 * copied again from the start, as a buffer that re-flushes its whole contents on every append
 * does. The result is the same bytes; the cost grows with the square of their length. One output
 * is allocated, so the extra cost is copying alone and not the collector.
 */
function assembleQuadratically(bytes: Buffer): Buffer {
  const out = Buffer.alloc(bytes.length);
  for (let end = CHUNK; end < bytes.length + CHUNK; end += CHUNK) {
    out.set(bytes.subarray(0, Math.min(end, bytes.length)));
  }
  return out;
}

/** The parts of a Dataset a reader compares: its write, and its warnings in order. */
function sameDataset(a: Dataset, b: Dataset): boolean {
  return (
    serializeDicom(a).equals(serializeDicom(b)) &&
    a.warnings.map((w) => w.code).join() === b.warnings.map((w) => w.code).join()
  );
}

/** Every phase, and each self-check, use exactly these fixtures. */
function readOptions(): ScalingGateOptions<Buffer, Dataset> {
  return {
    name: "@cosyte/dicom parseDicom",
    parse: (bytes) => parseDicom(bytes),
    weigh: (ds) => ds.warnings.length + 1,
    count: { n: COUNT, generate: (i) => worklistItem(i) },
    size: { inputs: DOCUMENTS, size: MEASUREMENTS, generate: (i, size) => srDocument(i, size) },
  };
}

function readTagsOptions(): ScalingGateOptions<Buffer, number> {
  return {
    name: "@cosyte/dicom parseDicom, then read tags",
    parse: (bytes) => readTags(parseDicom(bytes)),
    weigh: (read) => read,
    count: { n: COUNT, generate: (i) => worklistItem(i) },
    size: { inputs: DOCUMENTS, size: MEASUREMENTS, generate: (i, size) => srDocument(i, size) },
  };
}

/** The Datasets the writer is timed on, parsed once outside every timed phase. */
function writeOptions(): ScalingGateOptions<Dataset, Buffer> {
  return {
    name: "@cosyte/dicom serializeDicom",
    parse: (ds) => serializeDicom(ds),
    weigh: (bytes) => bytes.length,
    count: { n: COUNT, generate: (i) => parseDicom(worklistItem(i)) },
    size: {
      inputs: DOCUMENTS,
      size: MEASUREMENTS,
      generate: (i, size) => parseDicom(srDocument(i, size)),
    },
  };
}

/**
 * How far over the contract's 4 ms minimum each clean base phase must read. A fixture just over the
 * minimum on one runner skips on a faster one (four documents read in 3.86 ms on a hosted runner),
 * so each must hold twice the minimum on the machine it runs on.
 */
const PHASE_MARGIN = 2;

/** Both clean base phases, held clear of the minimum with room for a faster runner. */
function expectRoom(report: ReturnType<typeof assertScalingGateFires>): void {
  const least = PHASE_MARGIN * PERF_CONTRACT.MIN_PHASE_MS;
  expect(report.cleanBaseMinMs.count, report.diagnostic).toBeGreaterThanOrEqual(least);
  expect(report.cleanBaseMinMs.size, report.diagnostic).toBeGreaterThanOrEqual(least);
}

/** A skip is not a pass: a gate that could not measure says so here, rather than reading green. */
function expectMeasured(report: ReturnType<typeof scalingGate>): void {
  expect(report.count.status, report.count.diagnostic).toBe("measured");
  expect(report.size.status, report.size.diagnostic).toBe("measured");
}

describe("the scaling gate: parseDicom", () => {
  it("has not acquired a complexity regression on either axis", () => {
    expectMeasured(scalingGate(readOptions()));
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(readOptions(), {
      regressedParse: (bytes) => parseDicom(assembleQuadratically(bytes)),
      equals: sameDataset,
    });
    expect(report.margin).toBeGreaterThan(1);
    expectRoom(report);
  });
});

describe("the scaling gate: parseDicom, then read tags", () => {
  it("has not acquired a complexity regression on either axis", () => {
    expectMeasured(scalingGate(readTagsOptions()));
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(readTagsOptions(), {
      regressedParse: (bytes) => readTags(parseDicom(assembleQuadratically(bytes))),
    });
    expect(report.margin).toBeGreaterThan(1);
    expectRoom(report);
  });
});

describe("the scaling gate: serializeDicom", () => {
  it("has not acquired a complexity regression on either axis", () => {
    expectMeasured(scalingGate(writeOptions()));
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(writeOptions(), {
      regressedParse: (ds) => assembleQuadratically(serializeDicom(ds)),
      equals: (a, b) => a.equals(b),
    });
    expect(report.margin).toBeGreaterThan(1);
    expectRoom(report);
  });
});

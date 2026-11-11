// Benchmarks for @cosyte/dicom, on @cosyte/bench, against the built entry a consumer imports.
//
// A reading of this build (throughput, latency p50/p95/p99, allocations, peak heap, a long run for
// leaks, and the cold import with every file it loads and its gzip size):
//   pnpm build && pnpm bench:reading --out bench-results/reading.json
// One benchmark or one case only (as `<benchmark> / <size>` in the results):
//   pnpm bench:reading --only "parseDicom: CT"
// A base against head comparison, the base built in another checkout:
//   pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
// The budgets, and the peak memory and single-call time of every size with Pixel Data counted (the
// reading's peak heap is the V8 heap only, and a Buffer's bytes live outside it):
//   node bench/budgets.mjs bench-results/reading.json
//   pnpm bench:profile --out bench-results/profile
// On a pull request CI runs the comparison in its bench-compare job, and the Bench workflow takes a
// reading and a profile on a GitHub-hosted runner. Both are advisory: they post their numbers and
// fail nothing.
//
// The suite is handed the module under test rather than importing it, so one file measures both
// builds. Every input is synthetic and built in code by bench/shapes.mjs: no file is read.

import { defineBenchmark, defineSuite } from "@cosyte/bench";

import { ctImage, enhancedCt, srDocument, worklistItem } from "./shapes.mjs";

// Four shapes, each at the size real traffic has and, where the shape grows, at sizes well past it.
// The pull request comparison runs only the first size of each shape: a comparison runs every case
// 24 times in fresh processes inside a 600 second budget, and building 100 MiB of Pixel Data in each
// of them would spend it. A reading measures every size.
export const SHAPES = [
  {
    name: "worklist item",
    sizes: [
      // The entry a scheduler hands a modality all day. 64 of them, so a pass is not one file
      // repeated.
      { label: "1 KiB", inputs: 64, build: (i) => worklistItem(i), compare: true },
    ],
  },
  {
    name: "CT",
    sizes: [
      // One 512 by 512 by 16-bit slice, the most common image object there is.
      { label: "single frame, 514 KiB", inputs: 4, build: (i) => ctImage(i), compare: true },
      // An Enhanced CT series in one object: 20 and 200 frames of the same slice size.
      { label: "20 frames, 10 MiB", inputs: 1, build: (i) => enhancedCt(i, 20) },
      { label: "200 frames, 100 MiB", inputs: 1, build: (i) => enhancedCt(i, 200) },
    ],
  },
  {
    name: "SR, header only",
    sizes: [
      // A measurement report: no Pixel Data, many small tags in sequences nested four deep.
      {
        label: "50 measurements, 26 KiB",
        inputs: 4,
        build: (i) => srDocument(i, 50),
        compare: true,
      },
      { label: "1,000 measurements, 503 KiB", inputs: 1, build: (i) => srDocument(i, 1_000) },
      { label: "10,000 measurements, 4.9 MiB", inputs: 1, build: (i) => srDocument(i, 10_000) },
    ],
  },
];

/**
 * One input: its bytes, and a slot the write benchmark keeps its parsed Dataset in. Each is an
 * object, so a Dataset is cached against the input, never against a Buffer.
 */
function input(bytes) {
  return { bytes };
}

/** The sizes of a shape as @cosyte/bench takes them: each corpus built in code, with its bytes. */
function sizes(shape) {
  return shape.sizes.map((size) => ({
    label: size.label,
    compare: size.compare ?? false,
    build: () => {
      const inputs = Array.from({ length: size.inputs }, (_v, i) => input(size.build(i)));
      return { inputs, bytes: inputs.reduce((n, x) => n + x.bytes.length, 0) };
    },
  }));
}

/**
 * Read every tag of a Dataset the way an application does: the four domain views, then the decoded
 * value of every element at every depth. Returns how many values it read.
 */
export function readTags(ds) {
  let read = 0;
  read += ds.patient.name === undefined ? 0 : 1;
  read += ds.study.instanceUid === undefined ? 0 : 1;
  read += ds.series.modality === undefined ? 0 : 1;
  read += ds.image.rows === undefined ? 0 : 1;
  const walk = (set) => {
    for (const el of set.elements()) {
      const value = el.value;
      read++;
      if (value.kind === "sequence") for (const item of value.items) walk(item);
    }
  };
  walk(ds);
  return read;
}

/**
 * The parsed Dataset of an input, read once and kept, so the write times only itself. The first
 * call on each input also parses it; the warmup runs every input many times before any sample is
 * taken, so no sample includes that parse.
 */
function datasetOf(dicom, datasets) {
  return (x) => {
    let ds = datasets.get(x);
    if (ds === undefined) {
      ds = dicom.parseDicom(x.bytes);
      datasets.set(x, ds);
    }
    return ds;
  };
}

const benchmarks = [];
for (const shape of SHAPES) {
  benchmarks.push(
    defineBenchmark({
      // The lenient read every caller starts with: bytes to the Dataset, each Data Set kept as rows
      // of the parse's compact table, with no Element or Item built and no value decoded until a
      // caller asks for one. The next benchmark asks for all of them.
      name: `parseDicom: ${shape.name}`,
      sizes: sizes(shape),
      bind: (dicom) => (x) => dicom.parseDicom(x.bytes),
      // Every shape reads with no warning, its undefined-length sequences included (PS3.5 2026c
      // section 7.1.2 allows them), so a call weighs 1: the count only keeps the result in use.
      weigh: (ds) => ds.warnings.length + 1,
    }),
    defineBenchmark({
      // Parse, then read every tag: what an application that looks at the file pays.
      name: `parseDicom, then read tags: ${shape.name}`,
      sizes: sizes(shape),
      bind: (dicom) => (x) => readTags(dicom.parseDicom(x.bytes)),
      weigh: (read) => read,
    }),
    defineBenchmark({
      // The Part 10 write of a parsed Dataset, in its own transfer syntax.
      name: `serializeDicom: ${shape.name}`,
      sizes: sizes(shape),
      bind: (dicom) => {
        const dataset = datasetOf(dicom, new WeakMap());
        return (x) => dicom.serializeDicom(dataset(x));
      },
      weigh: (bytes) => bytes.length,
    }),
  );
}

export default defineSuite({ name: "@cosyte/dicom", benchmarks });

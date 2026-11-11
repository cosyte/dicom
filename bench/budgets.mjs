// What the performance budgets read, from a reading that `pnpm bench:reading --out <file>` wrote:
//   node bench/budgets.mjs bench-results/reading.json [--summary <file.md>]
//
// It judges nothing. The budgets are bench/budgets.json and the floor is bench/floor.json, and
// `cosyte-bench gate` judges a reading against both (the Budgets workflow, on every pull request).
// This prints, for a person, the figures behind them:
// - every case's peak as a multiple of one input: the raw V8 heap peak, and the figure a peak budget
//   reads, @cosyte/bench's `budgetPeakBytes` (the highest call's heap and external memory together,
//   or, for an input under `BENCH_CONTRACT.FLOOR_INPUT_BYTES` (64 KiB), the median call's above the
//   empty-call floor, since the probe's own highest call can cost more than 20 times a 1 KiB input);
// - throughput, in bytes a second, from a shape's smallest size to its largest, and how much of it
//   the largest keeps;
// - the cold import and the gzipped bytes it loads.
//
// It exits 0 when it could read the reading and 2 when it cannot.

import { readFileSync, writeFileSync } from "node:fs";

import { BENCH_CONTRACT, budgetPeakBytes, readResults } from "@cosyte/bench";

/** A case's bytes a second, or why there is none. */
function bytesPerSecond(c) {
  if (c.throughput.status !== "measured") return `skipped (${c.throughput.reason})`;
  return c.throughput.bytesPerSecond ?? "no byte count";
}

function mib(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/** The empty-call floor's median, or why there is none. */
function floorMedian(reading) {
  const floor = reading.memoryFloor;
  if (floor === undefined || floor === null) return "not measured";
  if (floor.status !== undefined && floor.status !== "measured") return `skipped (${floor.reason})`;
  const median = floor.medianPeakTotalBytes ?? floor.medianPeakHeapBytes;
  return median === undefined ? "not measured" : mib(median);
}

function main(argv) {
  const file = argv[0];
  if (file === undefined) {
    process.stderr.write("usage: node bench/budgets.mjs <reading.json> [--summary <file.md>]\n");
    return 2;
  }
  const summaryAt = argv.indexOf("--summary");
  const summary = summaryAt === -1 ? undefined : argv[summaryAt + 1];
  let doc;
  try {
    doc = readResults(readFileSync(file, "utf8"));
  } catch (error) {
    process.stderr.write(
      `could not read ${file}: ${error instanceof Error ? error.name : "error"}\n`,
    );
    return 2;
  }
  if (doc.kind !== "reading") {
    process.stderr.write(`${file} is a ${doc.kind}, not a reading\n`);
    return 2;
  }
  const { cases, importCost } = doc.reading;
  const lines = [
    "### What the budgets read",
    "",
    `Peak heap is the highest call's peak above the settled heap, V8 heap only, over one input's bytes. A peak budget reads \`budgetPeakBytes\`: the highest call's heap and external memory together, or, for an input under ${mib(BENCH_CONTRACT.FLOOR_INPUT_BYTES)}, the median call's above the empty-call floor (median ${floorMedian(doc.reading)}). The limits are in bench/budgets.json, and \`cosyte-bench gate\` judges them.`,
    "",
    "| Benchmark | Size | Input | Peak heap | Heap multiple | Budget figure | Multiple |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of cases) {
    if (c.peak === null || c.bytesPerPass === null) continue;
    const perInput = c.bytesPerPass / c.inputsPerPass;
    if (c.peak.status !== "measured") {
      lines.push(
        `| ${c.benchmark} | ${c.size} | ${mib(perInput)} | skipped (${c.peak.reason}) | n/a | n/a | n/a |`,
      );
      continue;
    }
    const heapMultiple = c.peak.peakHeapBytes / perInput;
    const figure = budgetPeakBytes(c) ?? c.peak.peakHeapBytes;
    const multiple = figure / perInput;
    lines.push(
      `| ${c.benchmark} | ${c.size} | ${mib(perInput)} | ${mib(c.peak.peakHeapBytes)} | ${heapMultiple.toFixed(2)}x | ${mib(figure)} | ${multiple.toFixed(2)}x |`,
    );
  }

  lines.push(
    "",
    "Throughput from a shape's smallest size to its largest, and how much of it the largest keeps.",
    "",
    "| Benchmark | Smallest | Largest | Bytes/s, smallest | Bytes/s, largest | Kept |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  const byBenchmark = new Map();
  for (const c of cases) {
    const list = byBenchmark.get(c.benchmark) ?? [];
    list.push(c);
    byBenchmark.set(c.benchmark, list);
  }
  for (const [benchmark, list] of byBenchmark) {
    if (list.length < 2) continue;
    const first = list[0];
    const last = list[list.length - 1];
    const small = bytesPerSecond(first);
    const large = bytesPerSecond(last);
    if (typeof small === "string" || typeof large === "string") {
      // A skip is not a pass: the row says what could not be measured.
      const cell = (v) => (typeof v === "string" ? v : `${mib(v)}/s`);
      lines.push(
        `| ${benchmark} | ${first.size} | ${last.size} | ${cell(small)} | ${cell(large)} | not measured |`,
      );
      continue;
    }
    const kept = large / small;
    lines.push(
      `| ${benchmark} | ${first.size} | ${last.size} | ${mib(small)}/s | ${mib(large)}/s | ${(kept * 100).toFixed(0)}% |`,
    );
  }

  if (importCost !== null) {
    const own = importCost.medianMs - importCost.emptyMedianMs;
    lines.push(
      "",
      `Cold import: median ${importCost.medianMs.toFixed(2)} ms, ${own.toFixed(2)} ms above an empty module's ${importCost.emptyMedianMs.toFixed(2)} ms. Loaded ${String(importCost.files.length)} file(s), ${mib(importCost.totalBytes)}, ${mib(importCost.totalGzipBytes)} gzipped.`,
    );
  }
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (summary !== undefined) writeFileSync(summary, text);
  return 0;
}

process.exitCode = main(process.argv.slice(2));

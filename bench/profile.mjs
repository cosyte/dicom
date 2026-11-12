// The parts of the audit a reading cannot give, against the built entry:
//   pnpm build && pnpm bench:profile [--out <dir>]
//
// 1. Memory with the Pixel Data counted. The reading's peak heap is the V8 heap only, and a Buffer's
//    bytes live outside it, so a copy of 100 MiB of Pixel Data never shows there. Here each case
//    runs in a fresh process: it builds its input, settles the heap, resets the process's resident
//    high water mark (Linux, /proc/self/clear_refs), makes one call while holding the result, and
//    reads the high water mark back. That peak is every byte the call made resident, transient
//    copies included, over one input's bytes. The same process times that first call and then the
//    median of 5 warm calls, which is the single-call time of the sizes whose warmup a reading
//    cannot settle.
// 1b. The header read: an Enhanced CT object of 1, 20 and 200 frames written to a file, then read
//    back in a fresh process two ways, the whole file into `parseDicom` and `readDicomHeader` on
//    its path, which stops before Pixel Data. Same resident high water mark as section 1, so the
//    two peaks compare, and the second one should not grow with the Pixel Data.
// 2. Throughput from each shape's smallest size to its largest, timed the same simple way for every
//    size: warmed, then the median of 9 samples of whole passes.
// 3. A CPU profile and a sampled heap profile of the hottest paths, with the top functions of each.
//    Each workload is warmed, then profiled alone for two seconds through the inspector. With
//    --enable-source-maps a function is named by its src/ file and line.
//
// `--out <dir>` writes profile.md there with every .cpuprofile and .heapprofile, for a profiler's
// own view (Chrome DevTools, speedscope). The inputs are the bench's own, from bench/shapes.mjs:
// synthetic, built in code.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { findSourceMap } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readTags, SHAPES } from "./dicom.bench.mjs";
import { ctImage, enhancedCt, srDocument, worklistItem } from "./shapes.mjs";

const PROFILE_MS = 2_000;
const WARMUP_MS = 500;
const TOP = 10;
/** Sizes below this are left to the reading's peak heap: the resident set moves in pages and arenas. */
const RESIDENT_MIN_BYTES = 256 * 1024;

const OPERATIONS = ["parse", "parse, then read tags", "serialize"];

function args(argv) {
  const out = { target: argv[0], dir: undefined, memoryCase: undefined, headerCase: undefined };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--out") out.dir = argv[++i];
    else if (argv[i] === "--memory-case") out.memoryCase = argv[++i];
    else if (argv[i] === "--header-case") out.headerCase = argv[++i];
  }
  return out;
}

/** The function one operation measures, on a Dataset parsed beforehand for the write. */
function operation(dicom, name, bytes) {
  if (name === "parse") return () => dicom.parseDicom(bytes);
  if (name === "parse, then read tags") return () => readTags(dicom.parseDicom(bytes));
  const ds = dicom.parseDicom(bytes);
  return () => dicom.serializeDicom(ds);
}

function status(field) {
  const line = readFileSync("/proc/self/status", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${field}:`));
  if (line === undefined) throw new Error(`no ${field} in /proc/self/status`);
  return Number.parseInt(line.slice(field.length + 1), 10) * 1024;
}

function settle() {
  for (let i = 0; i < 6; i++) globalThis.gc();
}

/** The child half of section 1: one case, one fresh process, printed as JSON. */
function memoryCase(dicom, spec) {
  const [shapeIndex, sizeIndex, opIndex] = spec.split(":").map(Number);
  const size = SHAPES[shapeIndex].sizes[sizeIndex];
  const bytes = size.build(0);
  const call = operation(dicom, OPERATIONS[opIndex], bytes);
  settle();
  const before = process.memoryUsage();
  writeFileSync("/proc/self/clear_refs", "5");
  const rssBefore = status("VmRSS");
  const start = performance.now();
  const result = call();
  const firstMs = performance.now() - start;
  const peak = status("VmHWM") - rssBefore;
  // What the result holds once the call's garbage is collected; `result` is read after, so it is
  // still reachable here.
  settle();
  const after = process.memoryUsage();
  const held = result === undefined ? 0 : 1;
  const warm = [];
  for (let i = 0; i < 3; i++) call();
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    call();
    warm.push(performance.now() - t);
  }
  warm.sort((a, b) => a - b);
  return {
    bytes: bytes.length,
    peakResidentBytes: peak,
    retainedHeapBytes: after.heapUsed - before.heapUsed,
    retainedExternalBytes: after.arrayBuffers - before.arrayBuffers,
    firstCallMs: firstMs,
    warmCallMs: warm[2],
    held,
  };
}

/** The frame counts of the Enhanced CT objects the header read is measured on. */
const HEADER_FRAMES = [1, 20, 200];
/** The two ways a header is read: the whole file into `parseDicom`, or `readDicomHeader`. */
const HEADER_READS = ["parseDicom(readFileSync(path))", "readDicomHeader(path)"];

/**
 * The child half of section 1b: one file, one way of reading it, one fresh process. The file is
 * written and its bytes dropped before the high water mark is reset, so the peak is what the read
 * itself made resident: the file's bytes and the parse for the first way, the prefixes read and
 * their parse for the second.
 */
async function headerCase(dicom, spec) {
  const [framesIndex, readIndex] = spec.split(":").map(Number);
  const dir = mkdtempSync(join(tmpdir(), "dicom-header-read-"));
  try {
    const path = join(dir, "enhanced-ct.dcm");
    let bytes = enhancedCt(0, HEADER_FRAMES[framesIndex]);
    const fileBytes = bytes.length;
    writeFileSync(path, bytes);
    bytes = undefined;
    settle();
    writeFileSync("/proc/self/clear_refs", "5");
    const rssBefore = status("VmRSS");
    const start = performance.now();
    const ds =
      readIndex === 0
        ? dicom.parseDicom(readFileSync(path))
        : await dicom.readDicomHeader(path);
    const elapsed = performance.now() - start;
    const peak = status("VmHWM") - rssBefore;
    return {
      bytes: fileBytes,
      peakResidentBytes: peak,
      callMs: elapsed,
      elements: ds.elements().length,
      pixelData: ds.has("7FE00010"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Section 1b: the header read against the whole-file read, each in its own process. */
function headerSection(target) {
  const lines = [
    "### Reading only the header of a large file",
    "",
    "An Enhanced CT object written to a file, then read in a fresh process: the whole file into `parseDicom`, against `readDicomHeader` on its path, which stops before Pixel Data. Peak resident memory above the resident set before the read, as in the section above, and the time of that one read.",
    "",
    "| Read | Frames | File | Peak resident | Top-level elements | Pixel Data read | Time |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const self = fileURLToPath(import.meta.url);
  for (const [r, read] of HEADER_READS.entries()) {
    for (const [f, frames] of HEADER_FRAMES.entries()) {
      const out = execFileSync(
        process.execPath,
        ["--expose-gc", self, target, "--header-case", `${String(f)}:${String(r)}`],
        { encoding: "utf8", maxBuffer: 1024 * 1024 },
      );
      const h = JSON.parse(out);
      lines.push(
        `| \`${read}\` | ${String(frames)} | ${mib(h.bytes)} | ${mib(h.peakResidentBytes)} | ${String(h.elements)} | ${h.pixelData ? "yes" : "no"} | ${ms(h.callMs)} |`,
      );
    }
  }
  return lines;
}

function mib(bytes) {
  if (Math.abs(bytes) >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function ms(value) {
  return value >= 100 ? `${value.toFixed(0)} ms` : `${value.toFixed(2)} ms`;
}

/** Section 1: every case of at least `RESIDENT_MIN_BYTES`, each in its own process. */
function memorySection(target) {
  const lines = [
    "### Peak memory with Pixel Data counted, and single-call time",
    "",
    "One call in a fresh process: its peak resident memory above the resident set before it (every byte, V8 heap and Buffers alike, transient copies included), over the input's bytes; what the result still holds after it, on the V8 heap and outside it; the first call's time, and the median of 5 warm calls. Sizes under 256 KiB are left to the reading's peak heap.",
    "",
    "| Benchmark | Size | Input | Peak resident | Multiple | Held, heap | Held, Buffers | First call | Warm call |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const self = fileURLToPath(import.meta.url);
  for (const [s, shape] of SHAPES.entries()) {
    for (const [z, size] of shape.sizes.entries()) {
      for (const [o, op] of OPERATIONS.entries()) {
        const out = execFileSync(
          process.execPath,
          ["--expose-gc", self, target, "--memory-case", `${String(s)}:${String(z)}:${String(o)}`],
          { encoding: "utf8", maxBuffer: 1024 * 1024 },
        );
        const r = JSON.parse(out);
        if (r.bytes < RESIDENT_MIN_BYTES) break;
        const name =
          op === "parse"
            ? "parseDicom"
            : op === "serialize"
              ? "serializeDicom"
              : "parseDicom, then read tags";
        lines.push(
          `| ${name}: ${shape.name} | ${size.label} | ${mib(r.bytes)} | ${mib(r.peakResidentBytes)} | ${(r.peakResidentBytes / r.bytes).toFixed(2)}x | ${mib(r.retainedHeapBytes)} | ${mib(r.retainedExternalBytes)} | ${ms(r.firstCallMs)} | ${ms(r.warmCallMs)} |`,
        );
      }
    }
  }
  return lines;
}

/** Run `pass` until `duration` milliseconds have gone by; returns how many passes ran. */
function runFor(pass, duration) {
  const end = performance.now() + duration;
  let passes = 0;
  while (performance.now() < end) {
    pass();
    passes++;
  }
  return passes;
}

const SAMPLES = 9;
const SAMPLE_MS = 100;

/** Milliseconds a pass, one sample: whole passes until at least `SAMPLE_MS` have gone by. */
function sample(pass) {
  const start = performance.now();
  let passes = 0;
  while (performance.now() - start < SAMPLE_MS) {
    pass();
    passes++;
  }
  return (performance.now() - start) / passes;
}

/** The median milliseconds a pass of `pass`, warmed, one workload at a time. */
function msPerPass(pass) {
  runFor(pass, WARMUP_MS);
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) samples.push(sample(pass));
  samples.sort((a, b) => a - b);
  return samples[Math.floor(SAMPLES / 2)];
}

/** Section 2: bytes a second at each shape's smallest and largest size, for each operation. */
function throughputSection(dicom) {
  const lines = [
    "### Throughput, smallest size against largest",
    "",
    `A reading cannot time a size whose warmup does not settle within 5 s, and skips it. This times every size the same simpler way: warmed for ${String(WARMUP_MS)} ms, then the median of ${String(SAMPLES)} samples of at least ${String(SAMPLE_MS)} ms of whole calls on one input, one size at a time, in one process.`,
    "",
    "| Operation | Shape | Smallest | Largest | Bytes/s, smallest | Bytes/s, largest | Kept |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const shape of SHAPES) {
    if (shape.sizes.length < 2) continue;
    const first = shape.sizes[0];
    const last = shape.sizes[shape.sizes.length - 1];
    for (const op of OPERATIONS) {
      const rate = (size) => {
        const bytes = size.build(0);
        const call = operation(dicom, op, bytes);
        return bytes.length / (msPerPass(call) / 1000);
      };
      const small = rate(first);
      const large = rate(last);
      lines.push(
        `| ${op} | ${shape.name} | ${first.label} | ${last.label} | ${mib(small)}/s | ${mib(large)}/s | ${((large / small) * 100).toFixed(0)}% |`,
      );
    }
  }
  return lines;
}

/** Where a call frame is: its src/ file and line through the source map when there is one. */
function locate(frame) {
  const line = frame.lineNumber;
  if (frame.url === "") return "(native)";
  let where = frame.url;
  try {
    const path = frame.url.startsWith("file:") ? fileURLToPath(frame.url) : frame.url;
    const map = findSourceMap(path);
    const entry = map?.findEntry(line, frame.columnNumber);
    if (entry !== undefined && entry.originalSource !== undefined) {
      const source = entry.originalSource.replace(/^.*?(src\/)/, "$1");
      return `${source}:${String(entry.originalLine + 1)}`;
    }
    where = path.replace(/^.*?(dist\/|bench\/|node_modules\/)/, "$1");
  } catch {
    // An unparseable URL keeps its own text.
  }
  return `${where}:${String(line + 1)}`;
}

function key(frame) {
  return `${frame.functionName === "" ? "(anonymous)" : frame.functionName} ${locate(frame)}`;
}

function isProfilerFrame(frame) {
  return (
    frame.url.startsWith("node:inspector") ||
    frame.functionName === "(program)" ||
    frame.functionName === "(idle)"
  );
}

/** Self time by function, from a CPU profile: the share of samples each one was on top. */
function topSelfTime(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    if (isProfilerFrame(node.callFrame)) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const k = key(node.callFrame);
    self.set(k, (self.get(k) ?? 0) + dt);
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, us]) => ({ name, share: us / total }));
}

/** Bytes allocated by function, from a sampled heap profile (sampled, so an estimate). */
function topAllocations(profile) {
  const self = new Map();
  let total = 0;
  const walk = (node) => {
    if (!isProfilerFrame(node.callFrame) && node.selfSize > 0) {
      const k = key(node.callFrame);
      self.set(k, (self.get(k) ?? 0) + node.selfSize);
      total += node.selfSize;
    }
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, bytes]) => ({ name, share: total === 0 ? 0 : bytes / total }));
}

/** Section 3: the hottest paths, profiled one at a time. */
async function profileSection(dicom, dir) {
  const feed = Array.from({ length: 64 }, (_v, i) => worklistItem(i));
  const slices = Array.from({ length: 4 }, (_v, i) => ctImage(i));
  const sr = srDocument(0, 10_000);
  const srModel = dicom.parseDicom(srDocument(0, 1_000));
  const series = enhancedCt(0, 200);
  const seriesModel = dicom.parseDicom(series);
  const workloads = [
    {
      name: "parseDicom: 64 worklist items",
      pass: () => feed.reduce((n, b) => n + dicom.parseDicom(b).warnings.length + 1, 0),
    },
    {
      name: "parseDicom, then read tags: 4 CT slices",
      pass: () => slices.reduce((n, b) => n + readTags(dicom.parseDicom(b)), 0),
    },
    {
      name: "parseDicom: SR, 10,000 measurements",
      pass: () => dicom.parseDicom(sr).warnings.length,
    },
    {
      name: "serializeDicom: SR, 1,000 measurements",
      pass: () => dicom.serializeDicom(srModel).length,
    },
    {
      name: "serializeDicom: CT, 200 frames",
      pass: () => dicom.serializeDicom(seriesModel).length,
    },
  ];

  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("HeapProfiler.enable");
  const lines = [
    "### CPU and heap profile of the hottest paths",
    "",
    `Each workload warmed for ${String(WARMUP_MS)} ms, then profiled alone for ${String(PROFILE_MS)} ms: self time from a CPU profile sampled every 100 us, and allocation from a sampled heap profile (an estimate, V8 heap only).`,
  ];
  for (const [index, w] of workloads.entries()) {
    runFor(w.pass, WARMUP_MS);
    // The heap sampler starts first and stops last, so the CPU profile holds the workload and not
    // the sampler's own start and stop. It keeps what a collection freed, so a function is charged
    // for everything it allocated, not only for what was still alive at the end.
    await session.post("HeapProfiler.startSampling", {
      samplingInterval: 16_384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    await session.post("Profiler.start");
    const passes = runFor(w.pass, PROFILE_MS);
    const { profile: cpu } = await session.post("Profiler.stop");
    const { profile: heap } = await session.post("HeapProfiler.stopSampling");
    if (dir !== undefined) {
      writeFileSync(resolve(dir, `${String(index + 1)}.cpuprofile`), JSON.stringify(cpu));
      writeFileSync(resolve(dir, `${String(index + 1)}.heapprofile`), JSON.stringify(heap));
    }
    lines.push(
      "",
      `#### ${String(index + 1)}. ${w.name}`,
      "",
      `${String(passes)} passes in ${String(PROFILE_MS)} ms, ${(PROFILE_MS / passes).toFixed(2)} ms a pass.`,
      "",
      "| Self time | Function | Allocated | Function |",
      "| --- | --- | --- | --- |",
    );
    const cpuTop = topSelfTime(cpu);
    const heapTop = topAllocations(heap);
    for (let i = 0; i < TOP; i++) {
      const c = cpuTop[i];
      const h = heapTop[i];
      lines.push(
        `| ${c === undefined ? "" : `${(c.share * 100).toFixed(1)}%`} | ${c === undefined ? "" : `\`${c.name}\``} | ${h === undefined ? "" : `${(h.share * 100).toFixed(1)}%`} | ${h === undefined ? "" : `\`${h.name}\``} |`,
      );
    }
  }
  session.disconnect();
  return lines;
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.target === undefined) {
    process.stderr.write("usage: node bench/profile.mjs <dist/index.mjs> [--out <dir>]\n");
    return 2;
  }
  const dicom = await import(pathToFileURL(resolve(options.target)).href);
  if (options.memoryCase !== undefined) {
    process.stdout.write(JSON.stringify(memoryCase(dicom, options.memoryCase)));
    return 0;
  }
  if (options.headerCase !== undefined) {
    process.stdout.write(JSON.stringify(await headerCase(dicom, options.headerCase)));
    return 0;
  }
  if (options.dir !== undefined) mkdirSync(options.dir, { recursive: true });
  const lines = [
    `## @cosyte/dicom: memory, throughput and profile`,
    "",
    `Node ${process.version}, ${process.platform}-${process.arch}.`,
    "",
    ...memorySection(options.target),
    "",
    ...headerSection(options.target),
    "",
    ...throughputSection(dicom),
    "",
    ...(await profileSection(dicom, options.dir)),
  ];
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (options.dir !== undefined) writeFileSync(resolve(options.dir, "profile.md"), text);
  return 0;
}

process.exitCode = await main();

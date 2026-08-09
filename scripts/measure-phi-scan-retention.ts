#!/usr/bin/env node
/**
 * The retention table and the byte-identity grid behind `DICOM-RESIDUALS`'s `Hit.value` memory
 * disclosure.
 *
 * ## Why this file exists rather than a table in a note
 *
 * The same reason `scripts/measure-phi-scan-unread.ts` exists: a figure only its author can produce
 * is not evidence. Every number in
 * `documentation/agent-notes/dicom-phi-scan-value-retention.md` comes out of this file.
 *
 * ## What it measures, and why an ordinary sampler cannot
 *
 * `scripts/phi-scan.ts` is SYNCHRONOUS from the first line to the last, so nothing on its event
 * loop ever runs while it is scanning: a `setInterval` sampler preloaded into it fires exactly
 * once, before the scan, and once after it, when the `hits` array is already unreachable. Both
 * readings say nothing about what the run was holding at its peak. That was measured before this
 * shape was settled on, and it is the reason the observer here hooks `fs.readFileSync` instead: the
 * hook runs INSIDE the scan, once per file, with `hits` live, and it forces a full GC before
 * reading `process.memoryUsage()` so that transient garbage is never counted as retention.
 *
 * The observer is written into a temporary directory and preloaded with `--require`. It never
 * touches `scripts/phi-scan.ts`, which runs exactly as it ships.
 *
 * 🩺 THE INSTRUMENT IS VERIFIED BEFORE ANY NUMBER IT PRINTS IS BELIEVED. Every corpus is scanned
 * twice: once carrying one PN-shaped token per file, and once byte-for-byte the same size with no
 * token in it at all. The second is the NEGATIVE CONTROL, and it is what says a difference in
 * retention is the doing of the hits rather than of the corpus. A run whose control is not clean,
 * or whose positive corpus does not produce exactly one hit per file, throws instead of reporting.
 *
 * ## Running it
 *
 * ```
 * git show <base>:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
 * pnpm measure:phi-scan-retention /tmp/base-phi-scan.ts
 * ```
 *
 * With no argument it verifies the instrument and prints the shipped tree's table alone, with no
 * base comparison and no grid.
 *
 * **`node`, not `tsx`.** This script imports nothing from `src/`.
 *
 * **Every value planted here is synthetic and invented**, and the caret is written as
 * `String.fromCharCode(0x5e)` so this file's own bytes carry no PN-shaped token.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const SHIPPED = join(REPO_ROOT, "scripts", "phi-scan.ts");

const CARET = String.fromCharCode(0x5e);
/** Synthetic, caret-bearing, and long enough that V8 answers a match with a pointer. */
const PN = `SURNAMEXYZ${CARET}GIVENQRS`;

/** Bytes that carry no PN token, no ISO date and no 8-digit run, so they contribute no hit. */
function filler(bytes: number): string {
  const unit = "the quick brown fox jumps over the lazy dog ".repeat(64);
  const out: string[] = [];
  let n = 0;
  while (n < bytes) {
    out.push(unit);
    n += unit.length;
  }
  return out.join("").slice(0, bytes);
}

interface Corpus {
  root: string;
  files: number;
  mib: number;
}

const roots: string[] = [];

/** A throwaway repo with every declared root present, holding `files` copies of one big page. */
function makeCorpus(files: number, mib: number, withHit: boolean): Corpus {
  const root = mkdtempSync(join(tmpdir(), "dicom-phi-scan-retention-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "test", "fixtures"), { recursive: true });
  mkdirSync(join(root, "docs-content"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "README.md"), "# throwaway\n");
  writeFileSync(join(root, "docs-content", "intro.md"), "# throwaway doc\n");
  spawnSync("git", ["init", "-q", "."], { cwd: root, shell: false });
  const body = filler(mib * 1024 * 1024);
  for (let i = 0; i < files; i += 1) {
    writeFileSync(
      join(root, "test", "fixtures", `big-${String(i)}.txt`),
      withHit ? `${PN}\n${body}` : body,
    );
  }
  return { root, files, mib };
}

/** The observer. Preloaded with `--require`; reports to a file so it cannot disturb stderr. */
function writeObserver(dir: string, out: string): string {
  const path = join(dir, "retained-observer.cjs");
  writeFileSync(
    path,
    [
      'const fs = require("node:fs");',
      "const real = fs.readFileSync;",
      "let peak = 0;",
      "let samples = 0;",
      "fs.readFileSync = function (...args) {",
      "  const r = real.apply(this, args);",
      "  if (Buffer.isBuffer(r) && r.length > 1048576) {",
      "    global.gc();",
      "    global.gc();",
      "    const m = process.memoryUsage();",
      "    samples += 1;",
      "    if (m.heapUsed + m.external > peak) peak = m.heapUsed + m.external;",
      "  }",
      "  return r;",
      "};",
      `process.on("exit", () => { require("node:fs").writeFileSync(${JSON.stringify(out)}, peak + " " + samples); });`,
      "",
    ].join("\n"),
    "utf8",
  );
  return path;
}

interface Run {
  code: number;
  hits: number;
  peak: number;
  samples: number;
  ms: number;
}

async function measure(scanner: string, corpus: Corpus): Promise<Run> {
  const dir = mkdtempSync(join(tmpdir(), "dicom-phi-scan-observer-"));
  roots.push(dir);
  const report = join(dir, "peak.txt");
  const observer = writeObserver(dir, report);
  const started = Date.now();
  const out = await new Promise<string>((res) => {
    const child = spawn(process.execPath, ["--expose-gc", "--require", observer, scanner], {
      cwd: corpus.root,
      shell: false,
    });
    let text = "";
    child.stdout.on("data", (d: Buffer) => (text += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (text += d.toString("utf8")));
    child.on("close", (code) => res(`${text}\nEXIT=${String(code ?? -1)}`));
  });
  const ms = Date.now() - started;
  const exit = /EXIT=(-?\d+)/.exec(out);
  const hit = /\[phi-scan\] (\d+) hits across/.exec(out);
  const [peak, samples] = readFileSync(report, "utf8").split(" ").map(Number);
  return {
    code: Number(exit?.[1] ?? -1),
    hits: Number(hit?.[1] ?? 0),
    peak: peak ?? 0,
    samples: samples ?? 0,
    ms,
  };
}

const mib = (n: number) => (n / 1048576).toFixed(1);

/** Scan a corpus with both a hit-bearing and a hit-free copy, and refuse to report a bad run. */
async function row(scanner: string, files: number, size: number): Promise<[Run, Run]> {
  const withHit = await measure(scanner, makeCorpus(files, size, true));
  const control = await measure(scanner, makeCorpus(files, size, false));
  if (withHit.code !== 1 || withHit.hits !== files || withHit.samples !== files) {
    throw new Error(
      `instrument: positive control wrong (exit ${String(withHit.code)}, ` +
        `${String(withHit.hits)} hits, ${String(withHit.samples)} samples for ${String(files)} files)`,
    );
  }
  if (control.code !== 0 || control.hits !== 0) {
    throw new Error("instrument: the filler is not hit-free; a difference would prove nothing");
  }
  return [withHit, control];
}

// ---------------------------------------------------------------------------
// The byte-identity grid
// ---------------------------------------------------------------------------

function part10(dataset: Buffer): Buffer {
  const meta = Buffer.concat([
    shortElement(0x0002, 0x0002, "UI", "1.2.840.10008.5.1.4.1.1.7"),
    shortElement(0x0002, 0x0003, "UI", "1.2.3.4"),
    shortElement(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1"),
  ]);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(meta.length, 0);
  return Buffer.concat([
    Buffer.alloc(128),
    Buffer.from("DICM", "latin1"),
    shortElementRaw(0x0002, 0x0000, "UL", len),
    meta,
    dataset,
  ]);
}

function shortElementRaw(group: number, element: number, vr: string, value: Buffer): Buffer {
  const padded = value.length % 2 === 0 ? value : Buffer.concat([value, Buffer.from([0x20])]);
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, "latin1");
  head.writeUInt16LE(padded.length, 6);
  return Buffer.concat([head, padded]);
}

function shortElement(group: number, element: number, vr: string, value: string): Buffer {
  return shortElementRaw(group, element, vr, Buffer.from(value, "latin1"));
}

/** Every byte a latin1 decode can produce, minus the ones the value trim would eat. */
function latin1Alphabet(chars: number): string {
  let s = "";
  for (let i = 0; s.length < chars; i += 1) {
    const c = 0x21 + (i % (0xff - 0x21 + 1));
    if (c === 0x5c) continue; // keep the JSON quoting of the report unambiguous to read
    s += String.fromCharCode(c);
  }
  return s;
}

interface Cell {
  name: string;
  args: readonly string[];
  files: readonly (readonly [string, Buffer])[];
}

function cells(): Cell[] {
  const out: Cell[] = [];
  const caps: readonly (readonly string[])[] = [
    [],
    ["--max-hit-lines", "0"],
    ["--max-hit-lines", "1"],
  ];
  const lengths = [8, 193, 194, 195, 400];
  for (const cap of caps) {
    for (const n of lengths) {
      const pn = `${latin1Alphabet(Math.max(1, n - 1))}${CARET}`;
      out.push({
        name: `tag PN latin1 x${String(n)} cap=${cap.join("") || "default"}`,
        args: cap,
        files: [["a.dcm", part10(shortElement(0x0010, 0x0010, "PN", pn))]],
      });
      out.push({
        name: `text PN x${String(n)} cap=${cap.join("") || "default"}`,
        args: cap,
        files: [["a.txt", Buffer.from(`${"A".repeat(n)}${CARET}${"B".repeat(n)}\n`, "utf8")]],
      });
    }
    out.push({
      name: `text dates cap=${cap.join("") || "default"}`,
      args: cap,
      files: [["d.txt", Buffer.from("2025-06-01 and 20250601 and 1850-01-01\n", "utf8")]],
    });
    out.push({
      name: `tag DA + DT cap=${cap.join("") || "default"}`,
      args: cap,
      files: [
        [
          "b.dcm",
          part10(
            Buffer.concat([
              shortElement(0x0008, 0x0020, "DA", "20250601"),
              shortElement(0x0008, 0x002a, "DT", "20250601120000.000000"),
            ]),
          ),
        ],
      ],
    });
    out.push({
      name: `embedded object cap=${cap.join("") || "default"}`,
      args: cap,
      files: [
        [
          "e.md",
          Buffer.from(
            "# page\n\n```\n" +
              part10(shortElement(0x0010, 0x0010, "PN", `WESTERGAARD${CARET}INGRID`)).toString(
                "base64",
              ) +
              "\n```\n",
            "utf8",
          ),
        ],
      ],
    });
    out.push({ name: `clean corpus cap=${cap.join("") || "default"}`, args: cap, files: [] });
  }
  return out;
}

function runCell(scanner: string, cell: Cell): { code: number; stdout: string; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "dicom-phi-scan-cell-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "test", "fixtures"), { recursive: true });
  mkdirSync(join(root, "docs-content"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "README.md"), "# throwaway\n");
  writeFileSync(join(root, "docs-content", "intro.md"), "# throwaway doc\n");
  writeFileSync(join(root, "test", "fixtures", "ordinary.txt"), "synthetic corpus placeholder\n");
  spawnSync("git", ["init", "-q", "."], { cwd: root, shell: false });
  for (const [name, bytes] of cell.files)
    writeFileSync(join(root, "test", "fixtures", name), bytes);
  const r = spawnSync(process.execPath, [scanner, ...cell.args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const base = process.argv[2];

const sizes: readonly (readonly [number, number])[] = [
  [2, 8],
  [5, 8],
  [10, 8],
  [20, 8],
];

process.stdout.write("RETAINED PEAK, forced GC, sampled once per file DURING the scan\n");
process.stdout.write("corpus                | tree     | with hits | hit-free control\n");
for (const [files, size] of sizes) {
  const trees: [string, string][] =
    base === undefined
      ? [["shipped", SHIPPED]]
      : [
          ["base", base],
          ["shipped", SHIPPED],
        ];
  for (const [label, scanner] of trees) {
    const [withHit, control] = await row(scanner, files, size);
    process.stdout.write(
      `${String(files).padStart(2)} x ${String(size)} MiB = ${String(files * size).padStart(3)} MiB | ` +
        `${label.padEnd(8)} | ${mib(withHit.peak).padStart(6)} MiB | ${mib(control.peak).padStart(6)} MiB\n`,
    );
  }
}

if (base !== undefined) {
  let identical = 0;
  let refusing = 0;
  let hitLines = 0;
  let cut = 0;
  const violations: string[] = [];
  const all = cells();
  for (const cell of all) {
    const b = runCell(base, cell);
    const s = runCell(SHIPPED, cell);
    if (b.code === s.code && b.stdout === s.stdout && b.stderr === s.stderr) identical += 1;
    else violations.push(cell.name);
    // 🛑 NON-VACUITY, PRINTED RATHER THAN ASSUMED. A grid of cells that print nothing would read
    // "identical" on every one of them and prove nothing at all, which is this repo's oldest
    // recurring failure. These three counts are what say the cells carry values.
    if (b.code === 1) refusing += 1;
    hitLines += (b.stderr.match(/^ {2}tag=/gm) ?? []).length;
    cut += (b.stderr.match(/not printed\]/g) ?? []).length;
  }
  process.stdout.write(
    `\nBYTE-IDENTITY GRID vs base: ${String(identical)} of ${String(all.length)} cells identical ` +
      `on exit code, stdout and stderr; ${String(violations.length)} violations\n` +
      `  non-vacuity: ${String(refusing)} of ${String(all.length)} cells exit 1, ` +
      `${String(hitLines)} hit lines printed, ${String(cut)} of them carrying a cut value\n`,
  );
  for (const v of violations) process.stdout.write(`  VIOLATION: ${v}\n`);
}

for (const r of roots) rmSync(r, { recursive: true, force: true });

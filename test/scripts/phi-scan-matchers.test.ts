/**
 * The forward scanners in `scripts/phi-scan.ts` against the patterns they replaced.
 *
 * `DICOM-RESIDUALS` removed the last route by which a scan target's bytes became a `RegExp`
 * subject, because a matched subject stays readable from `RegExp.input` and `RegExp.lastMatch`,
 * which are process globals. `test/integration/phi-scan-regex-statics.test.ts` pins that property.
 * THIS file pins the other half of it: that removing the regexes did not move a single hit.
 *
 * 🛑 THE ORACLE IS THE PATTERNS THEMSELVES, HELD HERE. A test that asserted a list of expected
 * offsets would pin whatever the scanner did on the day it was written. These cases run the
 * original patterns over the same bytes and require the scanner to agree with them, so the pin
 * survives a corpus change and says what it is actually about.
 *
 * The base-against-shipped grid over fuzzed and real corpora is
 * `scripts/measure-phi-scan-regex-statics.ts`, which needs a base tree and therefore cannot run in
 * CI. What is here needs none.
 *
 * 🛑 EVERY VALUE IS ASSEMBLED AT RUNTIME, for the reason `test/helpers/phi-scan-violators.ts`
 * gives at length: this file is under `test/`, so the gate scans it, and a spelled-out name or
 * date run in it reds the suite that proves the gate works.
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runRepoScript } from "../helpers/run-script.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const CARET = String.fromCharCode(0x5e);
const DASH = String.fromCharCode(0x2d);
const CUTOFF_YEAR = new Date().getFullYear() - 120;

/**
 * The three patterns `scanText` used to run, verbatim.
 *
 * They are constructed fresh on every use rather than shared: a global regex carries `lastIndex`
 * between calls, and a shared one would make an oracle whose answer depends on what was asked
 * before it.
 */
const iso = (): RegExp => /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const compact = (): RegExp => /\b(\d{4})(\d{2})(\d{2})\b/g;
const pn = (): RegExp => /\b[A-Z][A-Za-z\-']+\^[A-Z][A-Za-z\-']+\b/g;

/** `raw.replace(/[\0\s]+$/, "")`, the trim the tag route used to run. */
const trimPad = (raw: string): string => raw.replace(/[\0\s]+$/, "");

interface Expected {
  vr: string;
  offset: number;
  value: string;
}

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const ALLOW_LIST = readFileSync(join(REPO_ROOT, "scripts", "phi-allow-list.txt"), "utf8");

/**
 * Refuse a corpus whose tokens the allow-list would excuse.
 *
 * The oracle below does not model the allow-list, so a token that happens to be on it would be
 * expected here and withheld by the scanner, and the case would fail for a reason that has nothing
 * to do with the matchers. Refusing is better than quietly modelling a second thing.
 */
function assertNotExcused(values: readonly string[]): void {
  const lines = ALLOW_LIST.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  for (const value of values) {
    for (const line of lines) {
      const excused = line.startsWith("DATE:")
        ? line.slice("DATE:".length).trim() === value
        : line.endsWith(CARET)
          ? value.startsWith(line)
          : line === value;
      if (excused) {
        throw new Error(
          `this corpus uses ${JSON.stringify(value)}, which the allow-list excuses. The oracle ` +
            `does not model the allow-list, so the case would fail for the wrong reason.`,
        );
      }
    }
  }
}

/**
 * What the three patterns say about `content`, in the order `scanText` pushes them: the ISO pass,
 * then the compact pass, then the PN pass. The filters applied after each match are the scanner's
 * own and are untouched by this slice.
 */
function oracle(content: string): Expected[] {
  const out: Expected[] = [];
  const values: string[] = [];
  for (const m of content.matchAll(iso())) {
    const [full, yyyy, mm, dd] = m;
    if (yyyy === undefined || mm === undefined || dd === undefined) continue;
    values.push(`${yyyy}${mm}${dd}`);
    if (Number(yyyy) >= CUTOFF_YEAR) out.push({ vr: "DA", offset: m.index, value: full });
  }
  for (const m of content.matchAll(compact())) {
    const [full, yyyy, mm, dd] = m;
    if (yyyy === undefined || mm === undefined || dd === undefined) continue;
    const month = Number(mm);
    const day = Number(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    values.push(full);
    if (Number(yyyy) >= CUTOFF_YEAR) out.push({ vr: "DA", offset: m.index, value: full });
  }
  for (const m of content.matchAll(pn())) {
    values.push(m[0]);
    out.push({ vr: "PN", offset: m.index, value: m[0] });
  }
  assertNotExcused(values);
  return out;
}

/** A throwaway repository holding one text fixture, scanned with every hit line printed. */
function scanText(content: string): Expected[] {
  const root = mkdtempSync(join(tmpdir(), "dicom-phi-matchers-"));
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
  const target = join(root, "test", "fixtures", "corpus.txt");
  writeFileSync(target, content, "utf8");
  const r = runRepoScript("phi-scan.ts", ["--max-hit-lines", "0", target], { cwd: root });
  return parseHits(r.stderr, "(text)");
}

function parseHits(stderr: string, tag: string): Expected[] {
  const out: Expected[] = [];
  for (const line of stderr.split("\n")) {
    if (!line.startsWith("  tag=")) continue;
    const m = /^ {2}tag=(\S+) vr=(\S+) offset=(\d+) value=("(?:[^"\\]|\\.)*")/.exec(line);
    if (m === null) throw new Error(`unparseable hit line: ${line}`);
    if (m[1] !== tag) continue;
    out.push({
      vr: m[2] as string,
      offset: Number(m[3]),
      value: JSON.parse(m[4] as string) as string,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

describe("phi-scan text recognizers match what the patterns they replaced matched", () => {
  /**
   * Shapes picked because they are where a hand-written scanner and a backtracking engine part
   * company. The first block is the one that actually caught a defect: the second `+` of the PN
   * pattern can give back its trailing `-` and `'`, which are body characters but not word
   * characters, and it must still keep one.
   */
  const adversarial = [
    `ABC${CARET}DEF${DASH}`,
    `ABC${CARET}DEF'`,
    `ABC${CARET}DEF${DASH}${DASH}${DASH}`,
    `ABC${CARET}D${DASH}`,
    `ABC${CARET}D'`,
    `A${DASH}BC${CARET}DE${DASH}FG`,
    `ABC${CARET}DEF9`,
    `ABC${CARET}DEF_`,
    `_ABC${CARET}DEF`,
    `9ABC${CARET}DEF`,
    `ABC9${CARET}DEF`,
    `ABC${CARET}${CARET}DEF`,
    `ABC${CARET}def`,
    `abc${CARET}DEF`,
    `ABC${CARET}DEFGH${CARET}IJK`,
    `ABC${CARET}DEF ABC${CARET}DEF`,
    "123456789",
    "12345678",
    "_12345678",
    "12345678_",
    ["2024", "13", "45"].join(""),
    ["2024", "06", "15"].join(""),
    ["2024", "06", "15"].join(DASH),
    `${["2024", "06", "15"].join(DASH)}x`,
    `x${["2024", "06", "15"].join(DASH)}`,
    `${["2024", "06", "15"].join(DASH)} ${["2024", "06", "15"].join("")}`,
    `ABC${CARET}DEF${String.fromCharCode(0xa0)}`,
    `ABC${CARET}DEF${String.fromCharCode(0xfeff)}`,
    "",
  ];

  it("agrees with the patterns on the shapes where backtracking decides the answer", () => {
    const content = `${adversarial.join("\n")}\n`;
    const expected = oracle(content);
    // Non-vacuity: a corpus the patterns find nothing in would pass this against any scanner.
    expect(expected.length).toBeGreaterThan(10);
    expect(scanText(content)).toEqual(expected);
  });

  it("does not match a name whose second component would be left empty", () => {
    // The defect the grid caught, pinned on its own so a regression names itself. The pattern
    // requires one body character after the second `[A-Z]`, and a lone `-` is given back.
    const content = `ABC${CARET}D${DASH}\n`;
    expect(oracle(content)).toEqual([]);
    expect(scanText(content)).toEqual([]);
  });

  it("agrees with the patterns over a seeded fuzz dense in near misses", () => {
    // Assembled, not written. A literal eight-digit seed IS a standalone date run, and the gate
    // reported this file when the first draft spelled it out. Which is the behaviour working.
    let s = Number(["2026", "08", "09"].join("")) >>> 0;
    const rand = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const LOWER = "abcdefghijklmnopqrstuvwxyz";
    const DIGIT = "0123456789";
    const pick = (xs: string): string => xs[Math.floor(rand() * xs.length)] as string;
    const run = (xs: string, max: number): string => {
      let acc = "";
      const n = 1 + Math.floor(rand() * max);
      for (let i = 0; i < n; i += 1) acc += pick(xs);
      return acc;
    };
    const token = (): string => {
      switch (Math.floor(rand() * 8)) {
        case 0:
          return `${pick(UPPER)}${run(UPPER + LOWER, 5)}${CARET}${pick(UPPER)}${run(UPPER + LOWER, 5)}${pick(`${DASH}' `)}`;
        case 1:
          return `${pick(UPPER)}${run(UPPER + LOWER, 4)}${CARET}${pick(UPPER)}${pick(`${DASH}'`)}`;
        case 2:
          return [run(DIGIT, 4), run(DIGIT, 2), run(DIGIT, 2)].join(DASH);
        case 3:
          return run(DIGIT, 4) + run(DIGIT, 2) + run(DIGIT, 2);
        case 4:
          return `${pick("12")}${pick(DIGIT)}${pick(DIGIT)}${pick(DIGIT)}${pick("01")}${pick(DIGIT)}${pick("0123")}${pick(DIGIT)}`;
        case 5:
          return run(`${UPPER}${LOWER}${DIGIT}_${DASH}'${CARET}`, 8);
        case 6:
          return pick(` \t${String.fromCharCode(0xa0)}山.:`);
        default:
          return run(DIGIT, 11);
      }
    };
    const lines: string[] = [];
    for (let i = 0; i < 800; i += 1) {
      let line = "";
      const n = 1 + Math.floor(rand() * 6);
      for (let k = 0; k < n; k += 1) line += token();
      lines.push(line);
    }
    const content = `${lines.join("\n")}\n`;
    const expected = oracle(content);
    // A fuzz that produced nothing to compare would pass against any scanner at all.
    expect(expected.length).toBeGreaterThan(200);
    expect(scanText(content)).toEqual(expected);
  });
});

describe("phi-scan trims a value's trailing pad the way the pattern did", () => {
  /**
   * Every byte a latin1 decode can produce, in ONE object, so the trim is pinned over the whole
   * reachable set rather than over the handful of pad bytes somebody thought of.
   *
   * The base name is odd in length so that name + pad byte is even and the writer adds no space of
   * its own. A space added by the writer would be trimmed too, and the case would then be green for
   * a reason it did not set up.
   */
  it("agrees with the pattern on all 256 values a latin1 decode can end with", () => {
    const name = `QVORNBY${CARET}HALVARD`; // 15 characters, odd
    expect(name.length % 2).toBe(1);
    const elements: Buffer[] = [];
    const expected: string[] = [];
    for (let byte = 0; byte < 256; byte += 1) {
      const value = name + String.fromCharCode(byte);
      const head = Buffer.alloc(8);
      head.writeUInt16LE(0x0010, 0);
      head.writeUInt16LE(0x0010, 2);
      head.write("PN", 4, "latin1");
      head.writeUInt16LE(value.length, 6);
      elements.push(Buffer.concat([head, Buffer.from(value, "latin1")]));
      expected.push(trimPad(value));
    }
    assertNotExcused([name]);

    const ts = "1.2.840.10008.1.2.1";
    const tsHead = Buffer.alloc(8);
    tsHead.writeUInt16LE(0x0002, 0);
    tsHead.writeUInt16LE(0x0010, 2);
    tsHead.write("UI", 4, "latin1");
    tsHead.writeUInt16LE(ts.length + 1, 6);
    const tsEl = Buffer.concat([tsHead, Buffer.from(`${ts} `, "latin1")]);
    const groupLen = Buffer.alloc(12);
    groupLen.writeUInt16LE(0x0002, 0);
    groupLen.writeUInt16LE(0x0000, 2);
    groupLen.write("UL", 4, "latin1");
    groupLen.writeUInt16LE(4, 6);
    groupLen.writeUInt32LE(tsEl.length, 8);
    const preamble = Buffer.alloc(132);
    preamble.write("DICM", 128, "latin1");
    const object = Buffer.concat([preamble, groupLen, tsEl, ...elements]);

    const root = mkdtempSync(join(tmpdir(), "dicom-phi-matchers-pad-"));
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
    const target = join(root, "test", "fixtures", "pads.dcm");
    writeFileSync(target, object);
    const r = runRepoScript("phi-scan.ts", ["--max-hit-lines", "0", target], { cwd: root });

    const printed = parseHits(r.stderr, "(0010,0010)").map((h) => h.value);
    // A value that trims to nothing is skipped by the scanner (`value.length === 0`), so the
    // comparison is against the non-empty ones. Both lists are built the same way.
    expect(printed).toEqual(expected.filter((v) => v.length > 0));
    // Non-vacuity in both directions: some bytes are trimmed and most are not.
    expect(expected.filter((v) => v === name).length).toBeGreaterThan(5);
    expect(expected.filter((v) => v !== name).length).toBeGreaterThan(200);
  });
});

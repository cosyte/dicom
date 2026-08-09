#!/usr/bin/env node
/**
 * Whether a scan target's own bytes stay reachable from a PROCESS GLOBAL after the PHI gate has
 * finished with them, via V8's legacy `RegExp` statics.
 *
 * ## What this measures, and why it is a PHI question rather than a memory one
 *
 * V8 keeps the last successful match's subject string, and the match itself, on the `RegExp`
 * constructor: `RegExp.input` (`$_`), `RegExp.lastMatch` (`$&`), `RegExp.leftContext`,
 * `RegExp.rightContext`, `RegExp.lastParen` and `RegExp.$1` to `RegExp.$9`. They are ordinary
 * readable properties of a global object, not an implementation detail behind a flag. So when the
 * gate hands a scan target's text to a regex and the regex matches, the target's bytes are readable
 * from anywhere in the process until something else matches, and `RegExp.lastMatch` holds the
 * matched value (a patient name, a date) VERBATIM rather than excerpted.
 *
 * `DICOM-RESIDUALS` bounded what a hit line PRINTS (`#109`) and what a hit HOLDS (`#110`). This is
 * the third carrier of the same payload, disclosed by `#110` and not measured since.
 *
 * ## Why an in-process assertion cannot answer it
 *
 * The statics are overwritten by the NEXT successful match anywhere in the realm. A test that
 * imports the scanner, runs it, and then reads `RegExp.input` measures whatever the test runner
 * matched on the way back, so it reads CLEAN whether or not the scanner left anything behind. That
 * is a detector zero which is a gap rather than a clearance, and it is the reason this instrument
 * spawns a child and reads the statics inside it, before anything else in that child can match.
 *
 * The observer is preloaded with `--require`, so its `exit` listener is registered before the
 * scanner's module scope runs and therefore fires FIRST. It reads the statics as its opening
 * statements and uses `String.prototype.includes`, never a regex, so the detector cannot clear the
 * evidence it is looking for. It never touches `scripts/phi-scan.ts`, which runs exactly as it
 * ships.
 *
 * Two reading points, because they answer different questions:
 *
 * * at every `fs.readFileSync`, which is INSIDE the scan and says whether the previous target's
 *   bytes are still reachable while the next one is being scanned;
 * * at `exit`, which says what the process is still holding when the gate is done.
 *
 * ## The instrument is verified before any zero it prints is believed
 *
 * Four checks throw rather than report:
 *
 * 1. each scanner handed to it must BE this package's phi-scan (a bad `--max-hit-lines` refuses
 *    with this script's own message and exit 2). This is the negative control against a sibling
 *    package's file of the same name, which a shared scratch area has produced here before;
 * 2. THE DETECTOR'S OWN POSITIVE CONTROL: a child that does nothing but match a planted token with
 *    a regex must be reported as carrying it. A detector that cannot fire is not a detector, and
 *    this control needs no base tree to run;
 * 3. every shape must produce the hits it claims, so a shape that silently scanned nothing cannot
 *    read as a shape that left nothing behind;
 * 4. the hit-free control must scan clean, so a difference elsewhere is attributable to the hits.
 *
 * ## Running it
 *
 * ```
 * git show <base>:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
 * pnpm measure:phi-scan-regex-statics /tmp/base-phi-scan.ts
 * ```
 *
 * With no argument it verifies itself and prints the shipped tree's column alone.
 *
 * **`node`, not `tsx`.** This script imports nothing from `src/`.
 *
 * **Every value planted here is synthetic and invented.** The caret is written as
 * `String.fromCharCode(0x5e)` and the dates are assembled from parts, so this file's own bytes
 * carry no PN-shaped token, no ISO date and no eight-digit run.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const SHIPPED = join(REPO_ROOT, "scripts", "phi-scan.ts");

// ---------------------------------------------------------------------------
// Synthetic payloads. Assembled, never written as literals.
// ---------------------------------------------------------------------------

const CARET = String.fromCharCode(0x5e);
const DASH = String.fromCharCode(0x2d);

/** The name the text sweep's PN recognizer refuses. Invented. */
const TEXT_NAME = `OKONKWOQZ${CARET}ADAEZEQZ`;

/** A PN the TAG route refuses, distinct from the text one so the two routes are told apart. */
const TAG_NAME = `VALDIVIESOQZ${CARET}ROSALBAQZ`;

/** An ISO date inside the 120-year window, assembled so this file carries no date run. */
const ISO_DATE = ["1991", "07", "23"].join(DASH);

/** The same date compacted, which is the other pass of the same recognizer. */
const COMPACT_DATE = ["1991", "07", "23"].join("");

/** A `DA` value inside the window, for the tag route. */
const TAG_DATE = ["2025", "06", "12"].join("");

/** Bytes carrying no PN token, no ISO date and no eight-digit run. */
const FILLER = "the quick brown fox jumps over the lazy dog\n".repeat(64);

/**
 * Every token planted anywhere in the corpus.
 *
 * The detector looks for ALL of them in every shape, not just the ones a shape plants. A static
 * carrying a token from a file the scanner finished with three files ago is the finding, and a
 * per-shape token list would be blind to exactly that.
 */
const TOKENS = [TEXT_NAME, TAG_NAME, ISO_DATE, COMPACT_DATE, TAG_DATE];

// ---------------------------------------------------------------------------
// A minimal Part 10 object, so the TAG route can be reached
// ---------------------------------------------------------------------------

function shortElement(group: number, element: number, vr: string, value: string): Buffer {
  const padded = value.length % 2 === 0 ? value : `${value} `;
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, "latin1");
  head.writeUInt16LE(padded.length, 6);
  return Buffer.concat([head, Buffer.from(padded, "latin1")]);
}

/**
 * File Meta group carrying only what the scanner reads: the group length and the syntax UID.
 *
 * The UID is written UNPADDED and `shortElement` pads it with a space. Padding it here with the NUL
 * that PS3.5 asks for would put a literal NUL in THIS FILE, which makes git record the whole script
 * as binary and makes every `grep` over it print nothing without `-a`. This lineage has paid
 * refuter passes for that twice, once inside the tool built to measure it.
 */
function fileMeta(): Buffer {
  const ts = "1.2.840.10008.1.2.1";
  const tsEl = shortElement(0x0002, 0x0010, "UI", ts);
  const len = Buffer.alloc(12);
  len.writeUInt16LE(0x0002, 0);
  len.writeUInt16LE(0x0000, 2);
  len.write("UL", 4, "latin1");
  len.writeUInt16LE(4, 6);
  len.writeUInt32LE(tsEl.length, 8);
  return Buffer.concat([len, tsEl]);
}

function part10(dataset: Buffer): Buffer {
  const preamble = Buffer.alloc(132);
  preamble.write("DICM", 128, "latin1");
  return Buffer.concat([preamble, fileMeta(), dataset]);
}

// ---------------------------------------------------------------------------
// The corpus shapes
// ---------------------------------------------------------------------------

interface Shape {
  name: string;
  files: { name: string; body: Buffer }[];
  /** Hit lines this shape MUST produce, or the instrument refuses. `0` is the clean control. */
  expects: number;
}

const utf8 = (s: string): Buffer => Buffer.from(s, "utf8");

/** A page of filler with one token in it, big enough that a retained subject is unmistakable. */
function bigPage(token: string, mib: number): Buffer {
  const unit = FILLER;
  const out: string[] = [];
  let n = 0;
  while (n < mib * 1024 * 1024) {
    out.push(unit);
    n += unit.length;
  }
  return utf8(`${out.join("")}\n${token}\n`);
}

const SHAPES: Shape[] = [
  {
    name: "hit-free control",
    files: [{ name: "clean.txt", body: utf8(FILLER) }],
    expects: 0,
  },
  {
    name: "text PN, one small page",
    files: [{ name: "named.txt", body: utf8(`Patient: ${TEXT_NAME}\n`) }],
    expects: 1,
  },
  {
    name: "text PN, 4 MiB page",
    files: [{ name: "big-name.txt", body: bigPage(TEXT_NAME, 4) }],
    expects: 1,
  },
  {
    name: "text ISO date, 4 MiB page",
    files: [{ name: "big-iso.txt", body: bigPage(ISO_DATE, 4) }],
    expects: 1,
  },
  {
    name: "text compact date, 4 MiB page",
    files: [{ name: "big-compact.txt", body: bigPage(COMPACT_DATE, 4) }],
    expects: 1,
  },
  {
    name: "tag PN and tag DA in a Part 10 object",
    files: [
      {
        name: "object.dcm",
        body: part10(
          Buffer.concat([
            shortElement(0x0010, 0x0010, "PN", TAG_NAME),
            shortElement(0x0008, 0x0020, "DA", TAG_DATE),
          ]),
        ),
      },
    ],
    // FOUR, not two. The tag walk finds both elements, and `scanTarget` runs the TEXT sweep over
    // the same object's bytes as well, where the PN token and the eight-digit date match again.
    // The first draft of this shape said two, and the instrument refused rather than reporting.
    expects: 4,
  },
  {
    name: "loud 4 MiB page first, clean page second",
    files: [
      { name: "a-loud.txt", body: bigPage(TEXT_NAME, 4) },
      { name: "b-clean.txt", body: utf8(FILLER) },
    ],
    expects: 1,
  },
];

// ---------------------------------------------------------------------------
// The observer, and the reading it takes
// ---------------------------------------------------------------------------

const roots: string[] = [];

/**
 * The preloaded observer.
 *
 * It reports to a FILE rather than to stdio, so it cannot disturb the output the scan is graded on,
 * and it reads the statics with `includes` so the detector never overwrites its own evidence.
 */
function writeObserver(dir: string, out: string): string {
  const path = join(dir, "regex-statics-observer.cjs");
  writeFileSync(
    path,
    [
      `const TOKENS = ${JSON.stringify(TOKENS)};`,
      `const OUT = ${JSON.stringify(out)};`,
      'const fs = require("node:fs");',
      "const real = fs.readFileSync;",
      "const samples = [];",
      // No regex anywhere in here. `includes` and property reads only.
      "function take(where) {",
      "  const input = RegExp.input;",
      "  const lastMatch = RegExp.lastMatch;",
      "  const left = RegExp.leftContext;",
      "  const right = RegExp.rightContext;",
      "  const groups = [RegExp.$1, RegExp.$2, RegExp.$3, RegExp.$4, RegExp.$5, RegExp.$6, RegExp.$7, RegExp.$8, RegExp.$9, RegExp.lastParen];",
      "  const carriers = [];",
      "  for (const t of TOKENS) {",
      '    if (input.includes(t)) carriers.push("input");',
      '    if (lastMatch.includes(t)) carriers.push("lastMatch");',
      '    if (left.includes(t)) carriers.push("leftContext");',
      '    if (right.includes(t)) carriers.push("rightContext");',
      '    for (const g of groups) if (g.includes(t)) carriers.push("group");',
      "  }",
      "  samples.push({ where, inputLength: input.length, carriers: Array.from(new Set(carriers)) });",
      "}",
      "fs.readFileSync = function (...args) {",
      '  take("read");',
      "  return real.apply(this, args);",
      "};",
      'process.on("exit", () => { take("exit"); fs.writeFileSync(OUT, JSON.stringify(samples)); });',
      "",
    ].join("\n"),
    "utf8",
  );
  return path;
}

interface Sample {
  where: string;
  inputLength: number;
  carriers: string[];
}

interface Reading {
  code: number;
  hitLines: number;
  samples: Sample[];
  /** The statics as the process exits: the reading the headline is about. */
  atExit: Sample;
  /** The largest subject string seen on any reading. */
  maxInput: number;
  /** Every static that carried a planted token, at any reading point. */
  carriers: string[];
}

function readingOf(scanner: string, root: string, paths: string[], extra: string[] = []): Reading {
  const dir = mkdtempSync(join(tmpdir(), "dicom-regex-statics-obs-"));
  roots.push(dir);
  const report = join(dir, "samples.json");
  writeFileSync(report, "[]", "utf8");
  const observer = writeObserver(dir, report);
  const r = spawnSync(
    process.execPath,
    ["--require", observer, scanner, "--max-hit-lines", "0", ...extra, ...paths],
    { cwd: root, shell: false, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const said = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const samples = JSON.parse(readFileSync(report, "utf8")) as Sample[];
  const atExit = samples[samples.length - 1];
  if (atExit === undefined || atExit.where !== "exit") {
    throw new Error(
      `instrument: the observer took no reading at exit (${String(samples.length)} samples). ` +
        `A run whose observer never fired reports no carrier, which is the strongest possible ` +
        `result and is not evidence.`,
    );
  }
  let hitLines = 0;
  for (const line of said.split("\n")) if (line.startsWith("  tag=")) hitLines += 1;
  const carriers = new Set<string>();
  let maxInput = 0;
  for (const s of samples) {
    for (const c of s.carriers) carriers.add(c);
    if (s.inputLength > maxInput) maxInput = s.inputLength;
  }
  return {
    code: r.status ?? -1,
    hitLines,
    samples,
    atExit,
    maxInput,
    carriers: Array.from(carriers).sort(),
  };
}

// ---------------------------------------------------------------------------
// Verifying the instrument, before any zero it prints is believed
// ---------------------------------------------------------------------------

function makeRepo(shape: Shape): { root: string; paths: string[] } {
  const root = mkdtempSync(join(tmpdir(), "dicom-regex-statics-"));
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
  const paths: string[] = [];
  for (const f of shape.files) {
    const p = join(root, "test", "fixtures", f.name);
    writeFileSync(p, f.body);
    paths.push(p);
  }
  return { root, paths };
}

function verifyIsPhiScan(scanner: string, label: string): void {
  const { root } = makeRepo(SHAPES[0] as Shape);
  const bad = spawnSync(process.execPath, [scanner, "--max-hit-lines", "banana"], {
    cwd: root,
    shell: false,
    encoding: "utf8",
  });
  const said = `${bad.stdout ?? ""}${bad.stderr ?? ""}`;
  if (bad.status !== 2 || !said.includes("--max-hit-lines expects a non-negative integer")) {
    throw new Error(
      `instrument: ${label} (${scanner}) does not behave like this package's phi-scan ` +
        `(exit ${String(bad.status)}). A scanner belonging to a sibling package, or an unrelated ` +
        `file of the same name out of a shared scratch area, would be measured as clean and read ` +
        `as the strongest possible result.`,
    );
  }
}

/**
 * THE DETECTOR'S POSITIVE CONTROL, and it needs no base tree.
 *
 * A child that does nothing but match a planted token with a regex must be reported as carrying it
 * in `input` and in `lastMatch`. If this does not fire, every clean column below is a gap rather
 * than a clearance, which is this lineage's most expensive recurring mistake.
 */
function verifyDetectorFires(): Reading {
  const dir = mkdtempSync(join(tmpdir(), "dicom-regex-statics-pos-"));
  roots.push(dir);
  const script = join(dir, "match.cjs");
  writeFileSync(
    script,
    [
      `const token = ${JSON.stringify(TEXT_NAME)};`,
      'const body = "filler ".repeat(200000) + token;',
      // The caret is a regex metacharacter, so it is escaped here. An unescaped one is an ANCHOR,
      // the control never matches, and the whole instrument refuses rather than reporting.
      'const re = new RegExp("[A-Z][A-Za-z]+\\\\" + String.fromCharCode(0x5e) + "[A-Z][A-Za-z]+", "g");',
      'if (re.exec(body) === null) throw new Error("positive control did not match");',
      "",
    ].join("\n"),
    "utf8",
  );
  const report = join(dir, "samples.json");
  writeFileSync(report, "[]", "utf8");
  const observer = writeObserver(dir, report);
  const r = spawnSync(process.execPath, ["--require", observer, script], {
    shell: false,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`instrument: the positive control did not run (exit ${String(r.status)})`);
  }
  const samples = JSON.parse(readFileSync(report, "utf8")) as Sample[];
  const atExit = samples[samples.length - 1];
  if (atExit === undefined || !atExit.carriers.includes("input")) {
    throw new Error(
      "instrument: the detector did not see a token that a regex had just matched. A detector " +
        "that cannot fire proves nothing, so every clean reading below would be a gap and not a " +
        "clearance.",
    );
  }
  if (!atExit.carriers.includes("lastMatch")) {
    throw new Error("instrument: the detector missed `lastMatch` on the positive control");
  }
  return {
    code: r.status,
    hitLines: 0,
    samples,
    atExit,
    maxInput: atExit.inputLength,
    carriers: atExit.carriers,
  };
}

// ---------------------------------------------------------------------------
// The equivalence grid: did removing the regexes change what the gate REPORTS?
// ---------------------------------------------------------------------------

/**
 * Closing a carrier is only half of it. The three text recognizers were re-expressed as forward
 * scanners, and a scanner that is a slightly different PREDICATE would move which hits are
 * reported: fewer is a net leak, more is a false positive, and an `if/else` route that does both
 * at once is the shape that has refused three earlier slices in this lineage.
 *
 * So both scanners are run over byte-identical corpora and their WHOLE output is compared, stdout
 * and stderr and exit code, byte for byte. No labelling, no counting of classes, no interpretation:
 * a single differing byte is a violation.
 *
 * 🛑 THE FUZZ ALPHABET IS THE EVIDENCE, NOT THE VOLUME. It is drawn from exactly the characters the
 * three patterns can turn on: digits, upper and lower case, the hyphen and the apostrophe (in the
 * PN body class but NOT word characters, which is what makes the trailing `\b` backtrack), the
 * caret, the underscore (a word character that is NOT in the PN body class), the space, and a
 * handful of non-ASCII whitespace the pad trim has to agree about. A megabyte of English prose
 * would exercise none of it.
 */
const FUZZ_ALPHABET = [
  ..."0123456789",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  String.fromCharCode(0x2d), // -
  String.fromCharCode(0x27), // '
  String.fromCharCode(0x5e), // ^
  "_",
  " ",
  "\t",
  String.fromCharCode(0xa0), // NBSP
  String.fromCharCode(0x2003), // EM SPACE
  String.fromCharCode(0xfeff), // ZWNBSP
  "山", // a CJK character, outside every class involved
  ".",
  ":",
];

/** A seeded generator, so a violation can be reproduced from the seed alone. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fuzzCorpus(seed: number, lines: number, width: number): string {
  const rand = makeRandom(seed);
  const out: string[] = [];
  for (let i = 0; i < lines; i += 1) {
    const n = 1 + Math.floor(rand() * width);
    let line = "";
    for (let k = 0; k < n; k += 1) {
      line += FUZZ_ALPHABET[Math.floor(rand() * FUZZ_ALPHABET.length)] ?? "x";
    }
    out.push(line);
  }
  return `${out.join("\n")}\n`;
}

/**
 * Cases picked because they are where a hand-written scanner and a backtracking engine part
 * company, rather than because they are likely. Each one is a shape the fuzz can produce but might
 * not, and the fuzz is what says the list is not the whole story.
 */
function adversarialCorpus(): string {
  const C = CARET;
  const D = DASH;
  const lines = [
    // The trailing `\b` backtrack: the PN body class admits `-` and `'`, neither a word character.
    `ABC${C}DEF${D}`,
    `ABC${C}DEF'`,
    `ABC${C}DEF${D}${D}${D}`,
    `ABC${C}D${D}`,
    `A${D}BC${C}DE${D}FG`,
    // A word character that is NOT in the body class, so the trailing boundary can never hold.
    `ABC${C}DEF9`,
    `ABC${C}DEF_`,
    `_ABC${C}DEF`,
    `9ABC${C}DEF`,
    // The caret has to sit exactly where the greedy first run stopped.
    `ABC9${C}DEF`,
    `ABC${C}${C}DEF`,
    `ABC${C}def`,
    `abc${C}DEF`,
    // Adjacent and overlapping candidates, where the cursor's landing point matters.
    `ABC${C}DEFGH${C}IJK`,
    `ABC${C}DEF ABC${C}DEF`,
    // Date boundaries: a nine-digit run has no eight-digit match anywhere inside it.
    "123456789",
    "12345678",
    "_12345678",
    "12345678_",
    ["2024", "13", "45"].join(""),
    ["2024", "06", "15"].join(""),
    [["2024", "06", "15"].join(D), "x"].join(""),
    ["x", ["2024", "06", "15"].join(D)].join(""),
    ["2024", "06", "15"].join(D),
    // An ISO date immediately followed by an eight-digit run, so the two passes interleave.
    `${["2024", "06", "15"].join(D)} ${["2024", "06", "15"].join("")}`,
    // Pad characters the trim has to agree about, on a text page.
    `ABC${C}DEF${String.fromCharCode(0xa0)}`,
    `ABC${C}DEF${String.fromCharCode(0xfeff)}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * A second fuzz, drawn from FRAGMENTS rather than characters.
 *
 * A uniform character fuzz produces plenty of near misses and very few hits: a PN token needs an
 * upper-case letter, a body run, a caret, another upper-case letter and another body run, in that
 * order, and random characters assemble that rarely. This one emits the pieces the patterns are
 * built out of, so the corpus is dense in things that ALMOST match and in things that do, which is
 * where a hand-written scanner and a backtracking engine disagree if they are going to.
 */
function structuredFuzz(seed: number, lines: number): string {
  const rand = makeRandom(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const run = (chars: string, max: number): string => {
    let s = "";
    const n = 1 + Math.floor(rand() * max);
    for (let i = 0; i < n; i += 1) s += pick([...chars]);
    return s;
  };
  const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const LOWER = "abcdefghijklmnopqrstuvwxyz";
  const DIGIT = "0123456789";
  /** A name-shaped token, sometimes with the trailing body characters that force a backtrack. */
  const pnToken = (): string => {
    const tail = pick(["", "", DASH, "'", `${DASH}${DASH}`, `${DASH}'`]);
    return `${pick([...UPPER])}${run(UPPER + LOWER, 6)}${CARET}${pick([...UPPER])}${run(UPPER + LOWER, 6)}${tail}`;
  };
  /** A date inside the 120-year window, in one of the two shapes the recognizer takes. */
  const dateToken = (): string => {
    const y = `${pick(["19", "20"])}${pick([...DIGIT])}${pick([...DIGIT])}`;
    const m = `${pick(["0", "1"])}${pick([...DIGIT])}`;
    const d = `${pick(["0", "1", "2", "3"])}${pick([...DIGIT])}`;
    return rand() < 0.5 ? [y, m, d].join(DASH) : `${y}${m}${d}`;
  };
  /**
   * The shape where the trailing backtrack runs all the way down: the second body run holds
   * exactly ONE character, and that character is not a word character. The pattern matches nothing
   * here, and a scanner that lets the `+` give back its last character matches a truncated name.
   */
  const minimalBodyToken = (): string =>
    `${pick([...UPPER])}${run(UPPER + LOWER, 4)}${CARET}${pick([...UPPER])}${pick([DASH, "'"])}`;
  const fragment = (): string => {
    switch (Math.floor(rand() * 17)) {
      case 0:
        return run(UPPER, 8);
      case 1:
        return run(LOWER, 8);
      case 2:
        return run(DIGIT, 11);
      case 3:
        return CARET;
      case 4:
        return run(`${DASH}'`, 3);
      case 5:
        return pick(["_", " ", "\t", String.fromCharCode(0xa0), "山", ".", ":"]);
      case 6:
        return [run(DIGIT, 4), run(DIGIT, 2), run(DIGIT, 2)].join(DASH);
      case 7:
        return run(DIGIT, 4) + run(DIGIT, 2) + run(DIGIT, 2);
      case 8:
        return run(UPPER + LOWER, 6);
      // The dense cases. Without these the corpus is almost all near misses, and a grid that
      // compares few hit lines says little about the ones the gate actually prints.
      case 9:
      case 10:
      case 11:
        return pnToken();
      case 12:
      case 13:
        return dateToken();
      case 14:
        return `${pnToken()}${pick([" ", CARET, "_", DASH, ""])}${pnToken()}`;
      case 15:
        return minimalBodyToken();
      default:
        return run(`ABCXYZabcxyz0123456789${DASH}'${CARET}_ `, 6);
    }
  };
  const out: string[] = [];
  for (let i = 0; i < lines; i += 1) {
    let line = "";
    const n = 1 + Math.floor(rand() * 8);
    for (let k = 0; k < n; k += 1) line += fragment();
    out.push(line);
  }
  return `${out.join("\n")}\n`;
}

interface Cell {
  name: string;
  /** The corpus, or `null` for "the real repository, scanned with no path arguments". */
  body: string | null;
}

const CELLS: Cell[] = [
  { name: "the repository's own corpus", body: null },
  { name: "adversarial", body: adversarialCorpus() },
  ...Array.from({ length: 12 }, (_v, i) => ({
    name: `fuzz seed ${String(i + 1)}`,
    body: fuzzCorpus(i + 1, 600, 40),
  })),
  ...Array.from({ length: 4 }, (_v, i) => ({
    name: `wide fuzz seed ${String(i + 101)}`,
    body: fuzzCorpus(i + 101, 60, 4000),
  })),
  ...Array.from({ length: 16 }, (_v, i) => ({
    name: `structured fuzz seed ${String(i + 201)}`,
    body: structuredFuzz(i + 201, 700),
  })),
];

interface Output {
  code: number;
  text: string;
}

function outputOf(scanner: string, cwd: string, paths: string[]): Output {
  const r = spawnSync(process.execPath, [scanner, "--max-hit-lines", "0", ...paths], {
    cwd,
    shell: false,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return { code: r.status ?? -1, text: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

interface GridResult {
  cells: number;
  violations: number;
  hitLines: number;
  refused: number;
}

/**
 * THE GRID'S POSITIVE CONTROL, and it is the real defect the grid found rather than an invented one.
 *
 * The first draft of `pnRuns` floored the trailing backtrack at `second + 1`, which lets the second
 * `+` hold nothing and matches `ABC` caret `D-` where the pattern matches nothing. The grid caught
 * it. So the control mutates exactly that character back and requires the grid to report the
 * difference: a grid that cannot report one is not evidence that there is none.
 *
 * A mutation that fails to APPLY would run the shipped scanner against itself and report a perfect
 * zero, so a mutation that does not change the source throws instead.
 */
function writeMutant(): string {
  const source = readFileSync(SHIPPED, "utf8");
  const from = "while (end > second + 2 && !isWordBoundary(text, end)) end -= 1;";
  const to = "while (end > second + 1 && !isWordBoundary(text, end)) end -= 1;";
  if (!source.includes(from)) {
    throw new Error(
      `instrument: the mutation control no longer applies (looked for ${JSON.stringify(from)}). ` +
        `A mutation that does not change the source compares the shipped scanner with itself and ` +
        `reports a perfect grid.`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "dicom-regex-statics-mutant-"));
  roots.push(dir);
  const path = join(dir, "mutant-phi-scan.ts");
  writeFileSync(path, source.replace(from, to), "utf8");
  return path;
}

function equivalenceGrid(base: string, announce: boolean): GridResult {
  let violations = 0;
  let hitLines = 0;
  let refused = 0;
  for (const cell of CELLS) {
    let cwd: string;
    let paths: string[];
    if (cell.body === null) {
      cwd = REPO_ROOT;
      paths = [];
    } else {
      const made = makeRepo({ name: cell.name, files: [], expects: 0 });
      cwd = made.root;
      const p = join(cwd, "test", "fixtures", "fuzz.txt");
      writeFileSync(p, cell.body, "utf8");
      paths = [p];
    }
    const a = outputOf(base, cwd, paths);
    const b = outputOf(SHIPPED, cwd, paths);
    if (a.code !== b.code || a.text !== b.text) {
      violations += 1;
      if (announce) {
        process.stdout.write(`  🛑 VIOLATION in cell "${cell.name}"\n`);
        const an = a.text.split("\n");
        const bn = b.text.split("\n");
        for (let i = 0; i < Math.max(an.length, bn.length); i += 1) {
          if (an[i] !== bn[i]) {
            process.stdout.write(`     base    ${JSON.stringify(an[i] ?? null)}\n`);
            process.stdout.write(`     shipped ${JSON.stringify(bn[i] ?? null)}\n`);
            break;
          }
        }
      }
    }
    if (b.code === 1) refused += 1;
    for (const line of b.text.split("\n")) if (line.startsWith("  tag=")) hitLines += 1;
  }
  if (hitLines === 0) {
    throw new Error(
      "instrument: the equivalence grid compared no hit lines at all. Two scanners that both " +
        "report nothing are byte-identical for a reason that has nothing to do with this change.",
    );
  }
  return { cells: CELLS.length, violations, hitLines, refused };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function column(reading: Reading): string {
  const carriers = reading.atExit.carriers;
  const verdict = carriers.length === 0 ? "clean" : `LEAKS via ${carriers.join(", ")}`;
  return `${verdict.padEnd(34)} input ${String(reading.atExit.inputLength).padStart(9)}`;
}

function main(): number {
  const base = process.argv[2];
  verifyIsPhiScan(SHIPPED, "the shipped scanner");
  if (base !== undefined) verifyIsPhiScan(base, "the base scanner");
  const control = verifyDetectorFires();

  const out: string[] = [];
  out.push("");
  out.push("V8 legacy `RegExp` statics after `scripts/phi-scan.ts` has finished with a target.");
  out.push("A carrier named below is a process global from which the target's bytes are readable.");
  out.push("");
  out.push(
    `  detector positive control          ${column(control)}  <- must LEAK or nothing else counts`,
  );
  out.push("");

  let shippedLeaks = 0;
  let baseLeaks = 0;
  let compared = 0;
  for (const shape of SHAPES) {
    const { root, paths } = makeRepo(shape);
    const shipped = readingOf(SHIPPED, root, paths);
    if (shipped.hitLines !== shape.expects) {
      throw new Error(
        `instrument: shape "${shape.name}" produced ${String(shipped.hitLines)} hit lines, ` +
          `expected ${String(shape.expects)}. A shape that scanned nothing leaves nothing behind ` +
          `and would read as the strongest possible result.`,
      );
    }
    if (shape.expects === 0 && shipped.code !== 0) {
      throw new Error(
        `instrument: the hit-free control did not scan clean (exit ${String(shipped.code)})`,
      );
    }
    out.push(`  ${shape.name}`);
    out.push(`    shipped   ${column(shipped)}`);
    if (shipped.atExit.carriers.length > 0) shippedLeaks += 1;
    if (base !== undefined) {
      const b = readingOf(base, root, paths);
      compared += 1;
      if (b.atExit.carriers.length > 0) baseLeaks += 1;
      out.push(`    base      ${column(b)}`);
      if (b.hitLines !== shipped.hitLines) {
        out.push(
          `    🛑 HIT LINE COUNT DIFFERS: base ${String(b.hitLines)}, shipped ${String(shipped.hitLines)}`,
        );
      }
    }
    out.push("");
  }

  out.push(`  shapes measured                                ${String(SHAPES.length)}`);
  out.push(`  shapes where the SHIPPED tree left a carrier   ${String(shippedLeaks)}`);
  if (base !== undefined) {
    out.push(`  shapes where the BASE tree left a carrier      ${String(baseLeaks)}`);
    out.push(`  shapes compared against base                  ${String(compared)}`);
  }
  out.push("");
  process.stdout.write(`${out.join("\n")}\n`);

  if (base === undefined) return 0;

  process.stdout.write(
    "Equivalence: whole output, stdout and stderr and exit code, byte for byte.\n\n",
  );
  const grid = equivalenceGrid(base, true);
  const mutant = equivalenceGrid(writeMutant(), false);
  if (mutant.violations === 0) {
    throw new Error(
      "instrument: the mutation control reported no difference. The grid cannot tell two " +
        "different scanners apart, so its zero above is a gap and not a clearance.",
    );
  }
  process.stdout.write(
    [
      `  cells                                         ${String(grid.cells)}`,
      `  cells differing from base in any byte         ${String(grid.violations)}`,
      `  cells that refused (exit 1)                   ${String(grid.refused)}`,
      `  hit lines compared                            ${String(grid.hitLines)}`,
      `  MUTATION CONTROL, same cells, one character   ${String(mutant.violations)} differ  <- must not be 0`,
      "",
      "",
    ].join("\n"),
  );
  return grid.violations === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} finally {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

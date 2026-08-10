/**
 * The forward scanners in `scripts/phi-scan.ts` against the patterns they replaced.
 *
 * `DICOM-RESIDUALS` removed the last route by which a scan target's bytes became a `RegExp`
 * subject, because a matched subject stays readable from `RegExp.input` and `RegExp.lastMatch`,
 * which are process globals; a later pass removed the last route by which the gate's own
 * CONFIGURATION became one, so the script now constructs no `RegExp` at all.
 * `test/integration/phi-scan-regex-statics.test.ts` pins that property.
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
import { htmlBlockConditions } from "../helpers/commonmark-spec.js";

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

// ---------------------------------------------------------------------------
// The gate's own CONFIGURATION parsers
// ---------------------------------------------------------------------------
//
// These were the last `RegExp` subjects in the script, and they are reached from a different route
// than a scan target: `process.argv`, `scripts/phi-allow-list.txt`, `phi-scan-overrides.md` and
// `git diff --cached --raw` output. The script runs its scan at module scope, so none of them is
// importable and every case here drives the CLI.
//
// 🛑 THE OVERRIDE-LOG PARSER IS TESTED AS A MEMBERSHIP ORACLE, WHICH IS WHAT MAKES A HUNDRED CASES
// FIT IN TWO SUBPROCESSES. `--allow-fixture` is repeatable and `validateAllowFixtures` names EVERY
// path it could not find an entry for, so one run over a candidate set reports exactly which of
// them the parser did not produce. Both directions are asked separately, because they are different
// claims: the paths the pattern finds outside a fence must all be present, and the paths it finds
// INSIDE one - plus the lone space an all-whitespace heading yields - must all be absent.

/** `/^###\s+(.+?)\s*$/`, the pattern `tripleHashValue` replaced, constructed fresh per use. */
const heading = (line: string): string | null => /^###\s+(.+?)\s*$/.exec(line)?.[1] ?? null;

/** A throwaway repository with a caller-supplied allow-list and override log. */
function makeConfigRepo(opts: { allowList?: string; overrides?: string }): string {
  const root = mkdtempSync(join(tmpdir(), "dicom-phi-config-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "test", "fixtures"), { recursive: true });
  mkdirSync(join(root, "docs-content"));
  if (opts.allowList === undefined) {
    copyFileSync(
      join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
      join(root, "scripts", "phi-allow-list.txt"),
    );
  } else {
    writeFileSync(join(root, "scripts", "phi-allow-list.txt"), opts.allowList, "utf8");
  }
  if (opts.overrides !== undefined) {
    writeFileSync(join(root, "phi-scan-overrides.md"), opts.overrides, "utf8");
  }
  writeFileSync(join(root, "README.md"), "# throwaway\n");
  writeFileSync(join(root, "docs-content", "intro.md"), "# throwaway doc\n");
  return root;
}

/**
 * Which of `candidates` the override-log parser did NOT produce.
 *
 * A path with no entry is named in the refusal, one line each; a path WITH an entry is not. Every
 * candidate is also a file on disk, so the only reason one can be rejected is the missing entry.
 */
function missingFromOverrideLog(root: string, candidates: readonly string[]): Set<string> {
  const args: string[] = [];
  for (const c of candidates) {
    // Written unconditionally. An `existsSync` guard here was a check-then-act race that CodeQL
    // reported as `js/file-system-race` (high), and there is nothing to preserve: every candidate
    // is a throwaway file in a throwaway repository, created only so the refusal can be about the
    // missing LOG ENTRY rather than about a missing file.
    writeFileSync(join(root, c), "no tokens here\n", "utf8");
    args.push("--allow-fixture", c);
  }
  const r = runRepoScript("phi-scan.ts", args, { cwd: root });
  if (r.code === 0) return new Set();
  if (r.code !== 2) throw new Error(`expected exit 0 or 2, got ${String(r.code)}: ${r.stderr}`);
  const out = new Set<string>();
  for (const line of r.stderr.split("\n")) {
    if (line.startsWith("  - ")) out.add(line.slice(4));
  }
  return out;
}

describe("phi-scan parses its own override log the way the pattern did, minus two deliberate cuts", () => {
  /**
   * Lines chosen because they are where the pattern and a hand-written scan can part company: the
   * greedy `\s+` handing a character back to a lazy `(.+?)`, `.` refusing a `LineTerminator` that
   * `\s` admits, and `####` never being a `###` followed by whitespace.
   *
   * Every one is a legal file name on this platform, because each accepted capture is written to
   * disk and offered back to the scanner.
   */
  const LINES = [
    "### plain",
    "###  two-spaces",
    "###   three spaces and words",
    "### trailing-space ",
    "### trailing-tab\t",
    "###\ttab-separated",
    `###${String.fromCharCode(0xa0)}nbsp-separated`,
    "### with spaces inside",
    "### ends-with-cr\r",
    "### has-a-cr\rinside",
    "### ",
    "###  ",
    "###   ",
    `###  ${String.fromCharCode(0xa0)}`,
    "###",
    "####x",
    "#### four-hashes",
    "## two-hashes",
    " ### indented",
    "not a heading",
    "",
  ];

  /** The captures the pattern produces, split by whether this parser is meant to keep them. */
  function classify(lines: readonly string[]): { kept: string[]; cut: string[] } {
    const kept: string[] = [];
    const cut: string[] = [];
    for (const line of lines) {
      const value = heading(line);
      if (value === null) continue;
      // NARROWING 2: an all-whitespace heading. The pattern hands one whitespace character back
      // out of the `\s+` run and captures it; this parser produces nothing.
      if (value.trim().length === 0) cut.push(value);
      else kept.push(value);
    }
    return { kept, cut };
  }

  it("produces every path the pattern finds outside a fence", () => {
    const { kept } = classify(LINES);
    // Non-vacuity: a case list the pattern matched nothing in would pass against any parser.
    expect(kept.length).toBeGreaterThan(6);
    const root = makeConfigRepo({ overrides: `# log\n\n${LINES.join("\n")}\n` });
    expect(missingFromOverrideLog(root, kept)).toEqual(new Set());
  });

  it("produces nothing for a line the pattern refuses", () => {
    // The `⊆` direction on the axes where a hand-written scan is likely to be WIDER than the
    // pattern. `.` excludes `LineTerminator` while `\s` admits it, so a bare `CR` inside the
    // captured span makes the whole pattern fail; and `^###` must be followed by whitespace, so a
    // fourth `#` is not a deeper heading with a `#`-prefixed path.
    // Each pair is a line in the case list above, beside what a parser that merely trimmed after
    // the hashes would have produced from it.
    const pairs: [line: string, naive: string][] = [
      ["### has-a-cr\rinside", "has-a-cr\rinside"],
      ["####x", "#x"],
      ["#### four-hashes", "four-hashes"],
      [" ### indented", "indented"],
    ];
    for (const [line] of pairs) {
      expect(LINES, "the case list must carry the line").toContain(line);
      expect(heading(line), `the pattern must refuse ${JSON.stringify(line)}`).toBeNull();
    }
    const root = makeConfigRepo({ overrides: `# log\n\n${LINES.join("\n")}\n` });
    const naive = pairs.map(([, n]) => n);
    expect(missingFromOverrideLog(root, naive)).toEqual(new Set(naive));
  });

  it("produces NONE of the paths the pattern finds inside a fenced block", () => {
    const { kept } = classify(LINES);
    const fenced = ["# log", "", "```", ...LINES, "```", ""].join("\n");
    const root = makeConfigRepo({ overrides: fenced });
    // Every one of them, refused. This is the residual: the committed file's `### <path>` template
    // sits inside exactly such a block and used to parse as a live allow entry.
    expect(missingFromOverrideLog(root, kept)).toEqual(new Set(kept));
  });

  it("produces none of them inside an indented fence, a tilde fence, or a longer one", () => {
    const { kept } = classify(LINES);
    for (const [open, close] of [
      ["   ```", "   ```"],
      ["~~~", "~~~"],
      ["````", "````"],
      ["```ts", "```"],
      // A fence closed by a LONGER run of the same character is still closed; one closed by a
      // shorter run, or by the other character, is not - so these two stay open to the end.
      ["````", "```"],
      ["```", "~~~"],
    ]) {
      const body = ["# log", "", open as string, ...LINES, close as string, ""].join("\n");
      const root = makeConfigRepo({ overrides: body });
      expect(missingFromOverrideLog(root, kept), `fence ${String(open)}/${String(close)}`).toEqual(
        new Set(kept),
      );
    }
  });

  it("is not closed by a fence run that has an info string after it", () => {
    // A CLOSING fence must be bare, per CommonMark 0.31.2 section 4.5. A block whose body contains
    // a nested-looking ```` ```js ```` line must stay open across it.
    // The inner run is the SAME LENGTH as the opening one, so only the info string can decide it.
    // A shorter inner run would be refused on length alone and would prove nothing about `bare`.
    const { kept } = classify(LINES);
    const body = ["# log", "", "```", "```js", ...LINES, "```", ""].join("\n");
    const root = makeConfigRepo({ overrides: body });
    expect(missingFromOverrideLog(root, kept)).toEqual(new Set(kept));
  });

  it("is not closed by a fence run trailed by whitespace that is not a space or a tab", () => {
    // 🛑 THE REFUTER MEASURED THIS ONE. `bare` was computed over the whole of `\s`, so a closing
    // run followed by an INVISIBLE character closed the block and everything below it became a
    // live allow entry. CommonMark ignores only spaces and tabs after a closing run; anything else
    // is an info string, and an info string does not close. Each case here is a character that
    // renders as blank, which is what makes it a way to smuggle an entry past a human reviewer.
    const { kept } = classify(LINES);
    for (const [name, trailer] of [
      ["NBSP", String.fromCharCode(0xa0)],
      ["IDEOGRAPHIC SPACE", String.fromCharCode(0x3000)],
      ["ZWNBSP", String.fromCharCode(0xfeff)],
      ["EM SPACE", String.fromCharCode(0x2003)],
    ] as [string, string][]) {
      const body = ["# log", "", "```", `\`\`\`${trailer}`, ...LINES, "```", ""].join("\n");
      const root = makeConfigRepo({ overrides: body });
      expect(missingFromOverrideLog(root, kept), name).toEqual(new Set(kept));
    }
    // The control in the other direction, so this is not just "nothing ever closes". BOTH arms are
    // here: a run trailed by a space and a run trailed by a TAB are each bare, each close, and the
    // entries after them are live again. The tab arm was unpinned when this case was first written
    // and dropping it passed the whole suite, which is how a load-bearing branch gets removed by a
    // later maintainer who ran the tests.
    for (const [name, trailer] of [
      ["space", " "],
      ["tab", "\t"],
    ] as [string, string][]) {
      const closed = ["# log", "", "```", "### fenced", `\`\`\`${trailer}`, ...LINES, ""].join(
        "\n",
      );
      expect(
        missingFromOverrideLog(makeConfigRepo({ overrides: closed }), kept),
        `closed by a run trailed by a ${name}`,
      ).toEqual(new Set());
    }
  });

  it("reopens after the fence closes, so a real entry below the template still counts", () => {
    const { kept } = classify(LINES);
    const body = ["# log", "", "```", "### fenced-template", "```", "", ...LINES, ""].join("\n");
    const root = makeConfigRepo({ overrides: body });
    expect(missingFromOverrideLog(root, kept)).toEqual(new Set());
    // ...and the fenced one still is not an entry.
    expect(missingFromOverrideLog(root, ["fenced-template"])).toEqual(new Set(["fenced-template"]));
  });

  /**
   * 🛑 THE `CRLF` HALF OF THE LINE SPLIT IS LOAD-BEARING HERE, AND THE DISCLOSURE SAYING IT WAS
   * UNOBSERVABLE WAS WRONG. That disclosure reasoned from the two trims - `loadAllowList`'s and
   * `tripleHashValue`'s - and missed that THIS parser hands the RAW line to `fenceRun`, whose
   * `bare` admits a space or a tab and nothing else. On a `CRLF` log a `CR`-blind split leaves a
   * `CR` after the closing run, which makes it an info string rather than a close, so the block
   * never ends and every entry below the template is dropped.
   *
   * The splitter this claims is `splitCommonMarkLines`, which is what `overrideLogPaths` calls;
   * `splitLines` is the allow list's and is claimed in the other describe below.
   *
   * The line ending is the only thing that moves between the two arms, so the `LF` arm is what
   * says this case is about `CRLF` and not about the fence rules the cases above already pin.
   * Both directions are asked on each log: "everything below is an entry" and "nothing is" are
   * each refused, so neither a fence-blind parser nor a never-closing one passes.
   */
  it("closes a fence whose line ended CRLF, so an entry below the template is still live", () => {
    const entries = ["crlf-entry-one", "crlf-entry-two"];
    const lines = [
      "# log",
      "",
      "```",
      "### fenced-template",
      "```",
      "",
      ...entries.map((e) => `### ${e}`),
      "",
    ];
    // Both arms are RUN before either is asserted, so a mutant that breaks one reports what the
    // other did in the same failure. Asserting inside the loop would stop at the `CRLF` arm and
    // leave the control that makes it interpretable unexercised.
    const measured = (["\r\n", "\n"] as const).map((eol) => {
      const root = makeConfigRepo({ overrides: lines.join(eol) });
      return {
        below: missingFromOverrideLog(root, entries),
        template: missingFromOverrideLog(root, ["fenced-template"]),
      };
    });
    const [crlf, lf] = measured as [(typeof measured)[0], (typeof measured)[0]];
    expect({ crlf: crlf.below, lf: lf.below }).toEqual({ crlf: new Set(), lf: new Set() });
    expect({ crlf: crlf.template, lf: lf.template }).toEqual({
      crlf: new Set(["fenced-template"]),
      lf: new Set(["fenced-template"]),
    });
  });

  it("does not register the lone space an all-whitespace heading used to capture", () => {
    const { cut } = classify(LINES);
    // Non-vacuity: the pattern really does capture something on these lines. If it stopped doing
    // so, this case would be asserting nothing.
    expect(cut).toContain(" ");
    const root = makeConfigRepo({ overrides: `# log\n\n${LINES.join("\n")}\n` });
    expect(missingFromOverrideLog(root, cut)).toEqual(new Set(cut));
  });

  /**
   * 🩺 THE SILENTLY EXEMPTED PHI TARGET. This is the residual `#115` filed and the reason this
   * parser splits CommonMark's way rather than the allow list's.
   *
   * A LONE `CR` hides two different things from a `/\r?\n/` split, and the second one is the
   * dangerous one:
   *
   * * a `###` heading, because `tripleHashValue` anchors at column 0 and a hidden heading is
   *   merely a dropped entry (exit 2, the bypass refused);
   * * a fence OPENER, because `fenceRun` reads the first non-space character of the line. A hidden
   *   opener means the block never opens, so a `### <path>` a human sees INSIDE a rendered code
   *   block is a LIVE allow entry and `--allow-fixture` exempts that path at exit 0.
   *
   * The log below carries one of each, which is what makes the two answers DISJOINT rather than
   * nested: a `/\r?\n/` split produces `{smuggled}` and refuses `visible`; CommonMark's produces
   * `{visible}` and refuses `smuggled`. Each split exempts at exit 0 a target the other refuses at
   * exit 2, so there is no safer one to fall back on and "narrower is safer" is not available here.
   * What decides it is the document, not a direction: section 2.1 says the lone `CR` ends a line,
   * section 4.5 says a fenced block may interrupt a paragraph, and section 4.2 says a heading may.
   * All three are derived from the pinned spec in `test/scripts/commonmark-pin.test.ts` rather than
   * asserted, so this case is about what a human reviewing the rendered log sees.
   *
   * `scripts/measure-phi-scan-line-endings.ts` prints the same relation against any other tree.
   */
  it("refuses a path a lone CR hides inside a rendered code block, and admits the one it hides outside", () => {
    const CR = String.fromCharCode(0x0d);
    const fence = "`".repeat(3);
    const log = [
      "# log",
      "",
      `intro${CR}${fence}`,
      "### smuggled",
      fence,
      `outro${CR}### visible`,
      "",
    ].join("\n");
    const root = makeConfigRepo({ overrides: log });
    // Both directions are asked, and they are asked in ONE run each so a parser that answered
    // "everything" or "nothing" fails one of them.
    expect(missingFromOverrideLog(root, ["smuggled"])).toEqual(new Set(["smuggled"]));
    expect(missingFromOverrideLog(root, ["visible"])).toEqual(new Set());
    // The control that says this is about the LINE ENDING and not about the fence rules: with the
    // two lone `CR`s replaced by `LF`, the same document parses to the same two answers. If the
    // fence rules alone decided it, this would be the only arm needed.
    const lf = makeConfigRepo({ overrides: log.split(CR).join("\n") });
    expect(missingFromOverrideLog(lf, ["smuggled"])).toEqual(new Set(["smuggled"]));
    expect(missingFromOverrideLog(lf, ["visible"])).toEqual(new Set());
  });

  /**
   * The line split itself, differentially, against an INDEPENDENT reading of section 2.1.
   *
   * The oracle is `/\r\n|\n|\r/`, which is the sentence's three alternatives written as a pattern,
   * and `test/scripts/commonmark-pin.test.ts` is what says that sentence is section 2.1's. The log
   * holds no fence, so every heading the oracle finds is an entry and the membership run answers
   * for all of them at once.
   *
   * 🛑 THE NON-VACUITY CONTROL IS THE OTHER SPLIT. The shapes are chosen so that `/\r?\n/` and
   * section 2.1 disagree on several of them; if they ever agreed on all, this case would pass
   * against a `CR`-blind parser and prove nothing.
   */
  it("splits lines the way section 2.1 does, not the way the allow list does", () => {
    const CR = String.fromCharCode(0x0d);
    const SHAPES = [
      "\n",
      `${CR}\n`,
      CR,
      `${CR}${CR}`,
      `\n${CR}`,
      `${CR}${CR}\n`,
      `${CR}\n${CR}`,
      "\n\n",
    ];
    const names: string[] = [];
    let body = "# log\n\n";
    SHAPES.forEach((shape, i) => {
      const a = `cm-a${String(i)}`;
      const b = `cm-b${String(i)}`;
      names.push(a, b);
      body += `### ${a}${shape}### ${b}\n`;
    });

    const entriesUnder = (pattern: RegExp): Set<string> => {
      const out = new Set<string>();
      for (const line of body.split(pattern)) {
        const value = heading(line);
        if (value !== null) out.add(value);
      }
      return out;
    };
    const bySpec = entriesUnder(/\r\n|\n|\r/);
    const byAllowList = entriesUnder(/\r?\n/);

    // Non-vacuity in both directions: the oracle must find most of the names, and the two readings
    // must actually disagree, or a `CR`-blind parser would pass this case.
    expect(bySpec.size).toBe(names.length);
    expect(names.filter((n) => !byAllowList.has(n)).length).toBeGreaterThan(3);

    const root = makeConfigRepo({ overrides: body });
    const expectedMissing = new Set(names.filter((n) => !bySpec.has(n)));
    expect(missingFromOverrideLog(root, names)).toEqual(expectedMissing);
  });

  it("treats the committed override log as holding no entries at all", () => {
    // The repository's own file, read as it ships. Its only `###` line is the template inside the
    // fence, so a `--allow-fixture` for it must be refused.
    const committed = readFileSync(join(REPO_ROOT, "phi-scan-overrides.md"), "utf8");
    const parsed = splitCommittedHeadings(committed);
    expect(parsed).toEqual(["<path>"]);
    const root = makeConfigRepo({ overrides: committed });
    expect(missingFromOverrideLog(root, parsed)).toEqual(new Set(parsed));
  });
});

/**
 * 🩺 SECTION 4.6 HTML BLOCKS, THE OTHER WAY A RENDERED DOCUMENT HIDES A HEADING.
 *
 * A fenced code block SHOWS its contents; an HTML comment shows nothing at all. So a
 * `### <path>` written inside `<!-- -->` was a live allow entry that `--allow-fixture` honoured at
 * exit 0 while no human reviewing the rendered log could see it, which is the one direction this
 * parser exists to refuse. `overrideLogPaths` models kinds 1 to 6 now.
 *
 * 🛑 EVERY CASE HERE ASKS BOTH DIRECTIONS, because a block boundary is PARITY. A case that only
 * showed a heading being dropped would pass against a parser that dropped everything, and this
 * lineage has been refused three times for arguing that dropping more is the safer error.
 *
 * The tag tables are checked against the PINNED SPEC rather than against whoever typed them:
 * `test/helpers/commonmark-spec.ts` reads condition 6's list out of the document and every name in
 * it is driven through the membership oracle. `scripts/measure-phi-scan-html-blocks.ts` prints the
 * same relation against any other tree.
 */
describe("phi-scan suppresses a heading inside a CommonMark section 4.6 HTML block", () => {
  const CR = String.fromCharCode(0x0d);
  const FENCE = "`".repeat(3);
  const OPEN_COMMENT = "<!--";
  const CLOSE_COMMENT = "-->";

  it("suppresses a heading under every tag BOTH tag conditions list, and under none of its named controls", () => {
    // 🛑 BOTH TABLES, NOT ONE. Condition 1's four names are as unguarded as condition 6's sixty if
    // only condition 6 is driven here, and the unguarded direction is the leak direction: a name
    // missing from the shipped table means that tag starts no block, so the heading under it is a
    // LIVE allow entry exempting a PHI scan target at exit 0. A gate found exactly that gap, with a
    // one-name mutant of condition 1's table passing the whole suite.
    const { literalTags, blockTags } = htmlBlockConditions();
    // Non-vacuity: both lists are read from the spec, so an extraction that silently produced
    // nothing would make this case assert nothing at all.
    expect(literalTags.length).toBeGreaterThan(3);
    expect(blockTags.length).toBeGreaterThan(50);

    const smuggled = [...literalTags.map((t) => `s1-${t}`), ...blockTags.map((t) => `s6-${t}`)];
    // 🛑 THE OTHER DIRECTION, IN THE SAME RUN, AND NO EXHAUSTIVENESS IS CLAIMED OVER IT. These are
    // NAMED controls, not a proof that the tables hold nothing else. Each is a name that section
    // 4.6 lists in neither condition, written without a `>` so it is not a complete tag either and
    // condition 7 cannot reach it: CommonMark starts no block, and the heading below it is real.
    // The first two are each a LISTED NAME FOLLOWED BY MORE tag-name characters, which is what pins
    // the maximal-munch read: the listed name is the prefix, not the control. The rest are unrelated
    // names, which is what a table grown by one entry would fail on.
    const unlisted = ["divx", "paramx", "source", "canvas", "video"];
    const lines = ["# log", ""];
    // Kind 1 ends on the line carrying its end tag and NOT at a blank line, so each block is closed
    // explicitly. A parser that failed to close one would swallow every entry after it, including
    // `live-at-the-end`.
    for (const t of literalTags) lines.push(`<${t}>`, `### s1-${t}`, `</${t}>`, "");
    for (const t of blockTags) lines.push(`<${t}>`, `### s6-${t}`, "");
    for (const t of unlisted) lines.push(`<${t}`, `### live-${t}`, "");
    lines.push("### live-at-the-end", "");

    const candidates = [...smuggled, ...unlisted.map((t) => `live-${t}`), "live-at-the-end"];
    const root = makeConfigRepo({ overrides: lines.join("\n") });
    expect(missingFromOverrideLog(root, candidates)).toEqual(new Set(smuggled));
  });

  it("refuses the path an HTML comment hides, and admits the one below it, LF and lone CR alike", () => {
    // 🩺 THE FILED RESIDUAL. `#116` measured this exempting its target at exit 0 on head AND on
    // base in the `LF` form, and moving base exit 2 to head exit 0 in the lone-`CR` form, which is
    // the widening it disclosed against itself. Both forms are asserted here, in both directions.
    const body = (ending: string): string =>
      [
        "# log",
        "",
        `intro${ending}${OPEN_COMMENT}`,
        "### commented",
        CLOSE_COMMENT,
        "### visible",
        "",
      ].join("\n");
    for (const [name, ending] of [
      ["lf", "\n"],
      ["lone-cr", CR],
    ] as [string, string][]) {
      const root = makeConfigRepo({ overrides: body(ending) });
      expect(missingFromOverrideLog(root, ["commented"]), name).toEqual(new Set(["commented"]));
      expect(missingFromOverrideLog(root, ["visible"]), name).toEqual(new Set());
    }
  });

  it("ends a kind 1 to 5 block on the line meeting its end condition, including the start line", () => {
    // One log per kind, each with a heading INSIDE and a heading AFTER, so neither a parser that
    // never closes the block nor one that never opens it can pass. The `one-line` arms are section
    // 4.6's "if the first line meets both the start condition and the end condition, the block will
    // contain just that line", which is the rule that stops a whole log going dark.
    const cases: { name: string; open: string; close: string }[] = [
      { name: "comment", open: OPEN_COMMENT, close: CLOSE_COMMENT },
      { name: "instruction", open: `<${"?"}`, close: `?${">"}` },
      { name: "declaration", open: `<${"!"}DOCTYPE`, close: ">" },
      { name: "cdata", open: `<${"!"}[CDATA[`, close: "]]>" },
      { name: "literal-tag", open: "<pre>", close: "</pre>" },
    ];
    for (const { name, open, close } of cases) {
      const spread = makeConfigRepo({
        overrides: ["# log", "", open, `### in-${name}`, close, `### after-${name}`, ""].join("\n"),
      });
      expect(missingFromOverrideLog(spread, [`in-${name}`, `after-${name}`]), name).toEqual(
        new Set([`in-${name}`]),
      );
      const oneLine = makeConfigRepo({
        overrides: ["# log", "", `${open} x ${close}`, `### after-${name}`, ""].join("\n"),
      });
      expect(missingFromOverrideLog(oneLine, [`after-${name}`]), `${name} one-line`).toEqual(
        new Set(),
      );
    }
  });

  it("keeps a kind 1 block open across a blank line and a kind 6 block open past its closing tag", () => {
    // The two end conditions are different in a way a single model cannot hold, and each arm is the
    // other's control. A blank line ends a `<div>` block and does NOT end a `<pre>` one; a closing
    // tag ends a `<pre>` block and does NOT end a `<div>` one.
    const pre = makeConfigRepo({
      overrides: [
        "# log",
        "",
        "<pre>",
        "### in-pre",
        "",
        "### still-in-pre",
        "</pre>",
        "### after-pre",
        "",
      ].join("\n"),
    });
    expect(missingFromOverrideLog(pre, ["in-pre", "still-in-pre", "after-pre"])).toEqual(
      new Set(["in-pre", "still-in-pre"]),
    );

    const div = makeConfigRepo({
      overrides: [
        "# log",
        "",
        "<div>",
        "### in-div",
        "</div>",
        "### still-in-div",
        "",
        "### after-div",
        "",
      ].join("\n"),
    });
    expect(missingFromOverrideLog(div, ["in-div", "still-in-div", "after-div"])).toEqual(
      new Set(["in-div", "still-in-div"]),
    );
  });

  it("allows up to three spaces of indentation before a start condition, and not four", () => {
    // Four spaces is an indented code block, where section 4.6 admits no start condition at all, so
    // the heading below it is live. Same allowance `fenceRun` makes, and the same reason.
    const root = makeConfigRepo({
      overrides: [
        "# log",
        "",
        `   ${OPEN_COMMENT}`,
        "### indented-three",
        CLOSE_COMMENT,
        "",
        `    ${OPEN_COMMENT}`,
        "### indented-four",
        `    ${CLOSE_COMMENT}`,
        "",
      ].join("\n"),
    });
    expect(missingFromOverrideLog(root, ["indented-three", "indented-four"])).toEqual(
      new Set(["indented-three"]),
    );
  });

  it("starts no HTML block inside a fenced block, and reads no fence inside an HTML block", () => {
    // The two block classes nest rather than interleave, and each arm moves an entry the OTHER way,
    // which is the parity property stated as a test instead of as a direction.
    const inFence = makeConfigRepo({
      overrides: ["# log", "", FENCE, OPEN_COMMENT, FENCE, "### after-fence", ""].join("\n"),
    });
    expect(missingFromOverrideLog(inFence, ["after-fence"])).toEqual(new Set());

    const inComment = makeConfigRepo({
      overrides: [
        "# log",
        "",
        OPEN_COMMENT,
        FENCE,
        "### in-comment-fence",
        CLOSE_COMMENT,
        "### after-comment",
        "",
      ].join("\n"),
    });
    expect(missingFromOverrideLog(inComment, ["in-comment-fence", "after-comment"])).toEqual(
      new Set(["in-comment-fence"]),
    );
  });

  it("moves entries BOTH ways against a fence-only reading, which is why no direction is claimed", () => {
    // 🛑 THE DISJOINTNESS CASE, and the reason this slice claims a specification rather than a
    // safer error. An ODD number of fence delimiters inside the comment: a reading that models the
    // comment sees `alpha` outside every block and `bravo` inside a fence, and a fence-only reading
    // sees exactly the reverse. Each exempts at exit 0 a target the other refuses at exit 2, so
    // "narrower is safer" is not available and is not asserted.
    const root = makeConfigRepo({
      overrides: [
        "# log",
        "",
        OPEN_COMMENT,
        FENCE,
        CLOSE_COMMENT,
        "### alpha",
        FENCE,
        "### bravo",
        "",
      ].join("\n"),
    });
    expect(missingFromOverrideLog(root, ["alpha", "bravo"])).toEqual(new Set(["bravo"]));
  });

  /**
   * 🔴 THE DIVERGENCE THIS SLICE SCOPES OUT, PINNED RATHER THAN DESCRIBED.
   *
   * Start condition 7 is a complete open or closing tag alone on a line, and section 4.6 says
   * blocks of type 7 may not interrupt a paragraph. Modelling it needs paragraph state, which this
   * parser does not have; guessing at it is the parity trap. So a heading under `<span>` on its own
   * line is still a LIVE allow entry here where CommonMark hides it.
   *
   * The agreeing arm is asserted beside it, because only one of the two is a divergence: after a
   * PARAGRAPH line, condition 7 cannot fire, so the heading is live in CommonMark too and the
   * parsers agree. A case asserting the divergence alone would read as an accepted behaviour rather
   * than as a measured gap.
   *
   * 🔴 AND THE THIRD ARM IS THIS SLICE WIDENING THE HOLE, DISCLOSED AGAINST ITSELF. A gate found it;
   * the class was disclosed and this INSTANCE of it was not. `</pre>` alone on a line is a complete
   * closing tag, so CommonMark starts a kind-7 block there that runs to the end of the document and
   * no heading below it exists at all. Neither tree models that. But the comment opener beneath it
   * is now read, and it swallows the fence delimiter that used to hide the heading, so **this tree
   * exempts at exit 0 a target base refused at exit 2.** Named here rather than left to the record.
   */
  it("does not model start condition 7, the case where that agrees, and the input it widens", () => {
    const diverges = makeConfigRepo({
      overrides: ["# log", "", "<span>", "### under-span", ""].join("\n"),
    });
    expect(missingFromOverrideLog(diverges, ["under-span"])).toEqual(new Set());

    const agrees = makeConfigRepo({
      overrides: ["# log", "", "intro", "<span>", "### under-span-para", ""].join("\n"),
    });
    expect(missingFromOverrideLog(agrees, ["under-span-para"])).toEqual(new Set());

    const widened = makeConfigRepo({
      overrides: [
        "# log",
        "",
        "</pre>",
        OPEN_COMMENT,
        FENCE,
        CLOSE_COMMENT,
        "### widened",
        "",
      ].join("\n"),
    });
    expect(missingFromOverrideLog(widened, ["widened"])).toEqual(new Set());
  });

  it("leaves the committed override log holding no entries at all", () => {
    // The anchor, re-asked under the new block class: this repository's own log carries no HTML, so
    // adding section 4.6 must not have moved it. Its only heading is still the fenced template.
    const committed = readFileSync(join(REPO_ROOT, "phi-scan-overrides.md"), "utf8");
    const root = makeConfigRepo({ overrides: committed });
    expect(missingFromOverrideLog(root, ["<path>"])).toEqual(new Set(["<path>"]));
  });
});

/** Every `###` capture the PATTERN finds in `raw`, fence or no fence. */
function splitCommittedHeadings(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = heading(line);
    if (value !== null) out.push(value);
  }
  return out;
}

describe("phi-scan splits its allow-list into lines the way the pattern did", () => {
  /**
   * `raw.split(/\r?\n/)`: an `LF` ends a line and takes an immediately preceding `CR` with it. A
   * LONE `CR` is not a separator and stays in the line, which is the half a hand-written scan is
   * likely to get wrong, and it is observable here because a name with a stray `CR` in it does not
   * equal the name in the corpus and therefore does not excuse it.
   *
   * 🛑 THIS CASE STILL DOES NOT CLAIM THE `CRLF` HALF. `loadAllowList` trims, so the `CRLF` lines
   * below are here to have the shapes present, not as evidence about them. The assertion that
   * bites is the lone `CR`, and a mutant that splits on one turns this case red.
   *
   * 🔴 AND THAT IS WHY THE ALLOW LIST DOES NOT GET COMMONMARK'S SPLIT. The override log does, and
   * the cases above claim it there; `scripts/phi-allow-list.txt` is not a markdown document, so
   * CommonMark's line rule does not govern it. This case is what would go red if anyone unified
   * them anyway, which is the point of it being here rather than a comment. NO DIRECTION IS CLAIMED
   * for that change either: a gate measured the two readings' allow-entry sets as DISJOINT.
   */
  it("agrees with the pattern on every line-ending shape, measured by which names are excused", () => {
    const names = ["ALFA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT"].map(
      (n) => `${n}${CARET}QZ`,
    );
    // ALFA/BRAVO by LF, CHARLIE/DELTA by CRLF, then a LONE CR between ECHO and FOXTROT: the
    // pattern makes those two ONE line, so neither is a usable entry.
    const [a, b, c, d, e, f] = names as [string, string, string, string, string, string];
    const allowList = `# header\r\n${a}\n${b}\n${c}\r\n${d}\r\n${e}\r${f}\n`;
    const expected = allowList.split(/\r?\n/).map((l) => l.trim());

    const corpus = `${names.join("\n")}\n`;
    assertNotExcused(names);
    const root = makeConfigRepo({ allowList });
    const target = join(root, "test", "fixtures", "corpus.txt");
    writeFileSync(target, corpus, "utf8");
    const r = runRepoScript("phi-scan.ts", ["--max-hit-lines", "0", target], { cwd: root });
    const reported = new Set(parseHits(r.stderr, "(text)").map((h) => h.value));

    // The oracle: a name is excused exactly when it is one of the pattern's lines.
    const excused = new Set(expected);
    for (const name of names) {
      expect(reported.has(name), `${name} reported?`).toBe(!excused.has(name));
    }
    // Non-vacuity in both directions, so neither "everything excused" nor "nothing excused" passes.
    expect(reported.size).toBeGreaterThan(0);
    expect(names.filter((n) => excused.has(n)).length).toBeGreaterThan(3);
  });
});

describe("phi-scan validates --max-hit-lines the way the pattern did", () => {
  /**
   * `/^\d+$/`: ASCII digits only, at least one, anchored at both ends with no `m` flag - so `$`
   * does not admit a trailing newline. Each shape is a class the pattern distinguishes rather than
   * an arbitrary string, and the oracle is the pattern itself.
   */
  const CANDIDATES = [
    "0",
    "7",
    "007",
    "1234567890",
    "",
    " 3",
    "3 ",
    "3\n",
    "\n3",
    "+1",
    "-1",
    "1e9",
    "0x10",
    "1.0",
    "Infinity",
    "NaN",
    "banana",
    "１２", // FULLWIDTH DIGIT ONE, TWO
    "١٢", // ARABIC-INDIC DIGIT ONE, TWO
    "3​",
  ];

  it("accepts exactly the strings the pattern accepts", () => {
    const root = makeConfigRepo({});
    let accepted = 0;
    let refused = 0;
    for (const value of CANDIDATES) {
      const wanted = /^\d+$/.test(value);
      const r = runRepoScript("phi-scan.ts", ["--max-hit-lines", value, "README.md"], {
        cwd: root,
      });
      const gotRefusal =
        r.code === 2 && r.stderr.includes("--max-hit-lines expects a non-negative integer");
      expect(gotRefusal, `${JSON.stringify(value)} -> ${r.stderr}`).toBe(!wanted);
      if (wanted) accepted += 1;
      else refused += 1;
    }
    // Non-vacuity: a candidate list that was all one way would pass against a constant answer.
    expect(accepted).toBeGreaterThan(3);
    expect(refused).toBeGreaterThan(10);
  });
});

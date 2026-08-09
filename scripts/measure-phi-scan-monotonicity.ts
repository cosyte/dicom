#!/usr/bin/env node
/**
 * The superset grid behind `DICOM-RESIDUALS`'s `report()` monotonicity slice.
 *
 * ## Why this file exists rather than a table in a note
 *
 * The same reason `scripts/measure-phi-scan-unread.ts` and
 * `scripts/measure-phi-scan-retention.ts` exist: a figure only its author can produce is not
 * evidence. The grid and every count in
 * `documentation/agent-notes/dicom-phi-scan-report-monotonicity.md` comes out of this file, and
 * anyone can re-run it against any base.
 *
 * ## What it measures
 *
 * `report()` spends its per-file print budget PER RECOGNIZER. That is a SELECTION-POLICY change:
 * it moves which hits are reported, which is the class of change that has refused three earlier
 * slices in this lineage as a NET LEAK. So the question this grid exists to answer is not "does
 * the new policy look better" but the only one that matters:
 *
 *   IS THE SET OF PRINTED HIT LINES A SUPERSET OF THE BASE SCANNER'S, CELL BY CELL?
 *
 * Every cell runs BOTH scanners over a byte-identical corpus at the same cap and compares:
 * the exit code, the total, the set of files named, the withheld count's arithmetic, and the
 * multiset of hit DETAIL lines. A base line missing from the shipped run is a VIOLATION, and one
 * violation makes the whole run refuse.
 *
 * 🛑 AND IT PRINTS ITS OWN NON-VACUITY, because a grid that exercises nothing passes trivially.
 * The check that missed this defect for three slices was blind because it never got a file above
 * three hits against a cap of twenty. The counters at the bottom say how many cells refused, how
 * many hit lines were compared, how many cells actually reached a cap, and - the figure the whole
 * grid is for - in how many cells the BASE scanner printed nothing at all from a recognizer that
 * had hits, while the shipped one printed some.
 *
 * 🩺 THE INSTRUMENT IS VERIFIED BEFORE ANY ZERO IT PRINTS IS BELIEVED. Three checks run first and
 * throw rather than report: each scanner handed to it must BE a phi-scan (a bad `--max-hit-lines`
 * refuses with this script's own message and exit 2 - the negative control against a sibling
 * package's file of the same name, which this environment has produced before); a hit-free corpus
 * must exit 0 with no hit lines on both; and every corpus shape must produce hits from each
 * recognizer it claims, so a shape that silently produced nothing cannot read as "no violations".
 *
 * ## Running it
 *
 * ```
 * git show <base>:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
 * pnpm measure:phi-scan-monotonicity /tmp/base-phi-scan.ts
 * ```
 *
 * With no argument it verifies the instrument and prints the shipped tree's own columns, with no
 * base comparison and no superset grid.
 *
 * **`node`, not `tsx`.** This script imports nothing from `src/`.
 *
 * **Every value planted here is synthetic and invented**, and the caret and the date separator are
 * assembled at runtime so this file's own bytes carry no PN-shaped token and no date run.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
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
const NAME = `RIVERAQX${CARET}JUANITAQX`;

/** An ISO date inside the 120-year window. Assembled so this file carries no date run. */
const ISO_DATE = ["1990", "04", "15"].join(DASH);

/** A `DA` value inside the window, for the tag route. */
const TAG_DATE = "20250612";

/** A PN the tag route refuses, distinct from `NAME` so the two routes are told apart. */
const TAG_NAME = `WESTERGAARDQX${CARET}INGRIDQX`;

/** Bytes carrying no PN token, no ISO date and no eight-digit run. */
const FILLER = "the quick brown fox jumps over the lazy dog\n".repeat(40);

/** How many hits a flood carries. Well past the default cap, which is the point. */
const FLOOD = 200;

function textDateFlood(n: number): string {
  return Array.from({ length: n }, () => `seen ${ISO_DATE}`).join("\n") + "\n";
}

function textPnToken(i: number): string {
  const hi = String.fromCharCode(0x41 + Math.floor(i / 26));
  const lo = String.fromCharCode(0x41 + (i % 26));
  return `Noise${hi}${lo}${CARET}Given${hi}${lo}`;
}

function textPnFlood(n: number): string {
  return Array.from({ length: n }, (_v, i) => textPnToken(i)).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// A minimal Part 10 object, so the TAG route can be flooded independently
// ---------------------------------------------------------------------------

function shortElement(group: number, element: number, vr: string, value: string): Buffer {
  const padded = value.length % 2 === 0 ? value : value + " ";
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
 * The UID is written UNPADDED and `shortElement` pads it. A first draft padded it here with the
 * NUL that PS3.5 asks for, which put a literal NUL in THIS FILE: git then records the whole script
 * as BINARY, so its diff reads `Bin 0 -> 23116 bytes` and every `grep` over it prints nothing
 * without `-a`. This lineage has paid two refuter passes for exactly that (see
 * `documentation/repos/dicom/diagnostic-phi-traps.md` in the meta-repo). The scanner reads the UID
 * for its transfer syntax and does not care which pad byte follows it.
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

/**
 * The recognizer labels, derived from the reason a hit line prints.
 *
 * 🛑 A REASON IS NOT A SWEEP, AND THE LAST THREE COUNTERS INHERIT THAT. `scanText`'s ISO pass and
 * its compact pass print the same reason, and `scanText` runs again on every embedded object, so
 * `rescued` and `at cap` cannot see one of those starving another. THE SUPERSET COMPARISON USES NO
 * LABELLING AT ALL - it is a multiset over the raw hit lines - so the violation count does not
 * inherit this. What the counters miss is measured in
 * `documentation/agent-notes/dicom-phi-scan-report-monotonicity.md` instead.
 */
type Klass = "tag-pn" | "tag-date" | "text-pn" | "text-date";

function classify(reason: string): Klass {
  if (reason.startsWith("text PN")) return "text-pn";
  if (reason.startsWith("text date")) return "text-date";
  if (reason.startsWith("PN ")) return "tag-pn";
  return "tag-date";
}

interface Shape {
  name: string;
  /** Files written under `test/fixtures/`, in the order they are handed to the scanner. */
  files: { name: string; body: Buffer }[];
  /** Recognizers this shape MUST produce at least one hit from, or the instrument refuses. */
  expects: Klass[];
}

const utf8 = (s: string): Buffer => Buffer.from(s, "utf8");

const tagDateObject = (n: number): Buffer =>
  part10(
    Buffer.concat(Array.from({ length: n }, () => shortElement(0x0008, 0x0020, "DA", TAG_DATE))),
  );

const SHAPES: Shape[] = [
  {
    name: "hit-free control",
    files: [{ name: "clean.txt", body: utf8(FILLER) }],
    expects: [],
  },
  {
    name: "one name, no flood",
    files: [{ name: "quiet.txt", body: utf8(`Patient: ${NAME}\n`) }],
    expects: ["text-pn"],
  },
  {
    name: "text-date flood",
    files: [{ name: "dates.txt", body: utf8(textDateFlood(FLOOD)) }],
    expects: ["text-date"],
  },
  {
    name: "text-pn flood",
    files: [{ name: "names.txt", body: utf8(textPnFlood(FLOOD)) }],
    expects: ["text-pn"],
  },
  {
    name: "text-date flood, then the name",
    files: [{ name: "starve.txt", body: utf8(textDateFlood(FLOOD) + `Patient: ${NAME}\n`) }],
    expects: ["text-date", "text-pn"],
  },
  {
    name: "text-pn flood, then a date",
    files: [{ name: "starve2.txt", body: utf8(textPnFlood(FLOOD) + `DOB: ${ISO_DATE}\n`) }],
    expects: ["text-pn", "text-date"],
  },
  {
    name: "tag-date flood, then the name in text",
    files: [
      {
        name: "object.dcm",
        body: Buffer.concat([tagDateObject(FLOOD), utf8(`\nPatient: ${NAME}\n`)]),
      },
    ],
    expects: ["tag-date", "text-date", "text-pn"],
  },
  {
    name: "tag-pn and tag-date, then both text floods",
    files: [
      {
        name: "everything.dcm",
        body: Buffer.concat([
          part10(
            Buffer.concat([
              shortElement(0x0010, 0x0010, "PN", TAG_NAME),
              ...Array.from({ length: FLOOD }, () => shortElement(0x0008, 0x0020, "DA", TAG_DATE)),
            ]),
          ),
          utf8(`\nPatient: ${NAME}\n` + textDateFlood(FLOOD) + textPnFlood(FLOOD)),
        ]),
      },
    ],
    expects: ["tag-pn", "tag-date", "text-pn", "text-date"],
  },
  {
    name: "loud file first, quiet file second",
    files: [
      { name: "loud.txt", body: utf8(textDateFlood(FLOOD)) },
      { name: "named.txt", body: utf8(`Patient: ${NAME}\nDOB: ${ISO_DATE}\n`) },
    ],
    expects: ["text-date", "text-pn"],
  },
];

/** The caps swept. `null` is "no flag", the run CI and the pre-commit hook make. */
const CAPS: (number | null)[] = [null, 0, 1, 2, 3, 5, 20, 50];

// ---------------------------------------------------------------------------
// Running a scanner
// ---------------------------------------------------------------------------

const roots: string[] = [];

function makeRepo(shape: Shape): { root: string; paths: string[] } {
  const root = mkdtempSync(join(tmpdir(), "dicom-phi-scan-mono-"));
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

interface Run {
  code: number;
  /** The hit DETAIL lines, verbatim and in order. */
  lines: string[];
  /**
   * The hit DETAIL lines grouped under the `HIT:` header they followed, keyed by the fixture's own
   * name. The cap is PER FILE as well as per recognizer, so a check that pooled every file's lines
   * would read a two-file corpus as being over the cap. That is not a hypothetical: it is what the
   * first draft of this instrument did.
   */
  perFile: Map<string, string[]>;
  /** The paths named by a `HIT:` header. */
  named: string[];
  /** The total from the summary line, off `hits` and never off what was printed. */
  total: number;
  /** The withheld count from the summary line, `0` when the line does not carry one. */
  withheld: number;
  /** How many per-file suppression lines were printed. */
  cuts: number;
}

function run(scanner: string, cwd: string, args: string[]): Run {
  const r = spawnSync(process.execPath, [scanner, ...args], {
    cwd,
    shell: false,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const stderr = r.stderr ?? "";
  const lines: string[] = [];
  const named: string[] = [];
  const perFile = new Map<string, string[]>();
  let current = "";
  let cuts = 0;
  for (const line of stderr.split("\n")) {
    if (/^ {2}tag=/.test(line)) {
      lines.push(line);
      const group = perFile.get(current);
      if (group === undefined) throw new Error("instrument: a hit line before any HIT: header");
      group.push(line);
    } else if (line.startsWith("[phi-scan] HIT: ")) {
      const path = line.slice("[phi-scan] HIT: ".length);
      named.push(path);
      current = path.slice(path.lastIndexOf("/") + 1);
      perFile.set(current, []);
    } else if (line.includes("more hit(s) in this file")) cuts += 1;
  }
  const total = /\[phi-scan\] (\d+) hits across/.exec(stderr);
  const withheld = /(\d+) hit line\(s\) were not printed/.exec(stderr);
  return {
    code: r.status ?? -1,
    lines,
    perFile,
    named,
    total: Number(total?.[1] ?? 0),
    withheld: Number(withheld?.[1] ?? 0),
    cuts,
  };
}

/** The reason on a hit DETAIL line, read by BALANCING back from the closing parenthesis. */
function reasonOf(line: string): string {
  if (!line.endsWith(")"))
    throw new Error(`instrument: hit line has no reason: ${line.slice(0, 80)}`);
  let depth = 0;
  for (let i = line.length - 1; i >= 0; i -= 1) {
    if (line[i] === ")") depth += 1;
    else if (line[i] === "(") {
      depth -= 1;
      if (depth === 0) return line.slice(i + 1, line.length - 1);
    }
  }
  throw new Error(`instrument: unbalanced reason: ${line.slice(0, 80)}`);
}

function byClass(lines: string[]): Map<Klass, number> {
  const out = new Map<Klass, number>();
  for (const l of lines) {
    const k = classify(reasonOf(l));
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

function capArgs(cap: number | null): string[] {
  return cap === null ? [] : ["--max-hit-lines", String(cap)];
}

// ---------------------------------------------------------------------------
// Verifying the instrument, before any zero it prints is believed
// ---------------------------------------------------------------------------

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
        `file of the same name from a shared scratch area, would compare byte-identical to ` +
        `itself and report a perfect grid.`,
    );
  }
}

function verifyShapes(scanner: string): Map<string, Map<Klass, number>> {
  const truth = new Map<string, Map<Klass, number>>();
  for (const shape of SHAPES) {
    const { root, paths } = makeRepo(shape);
    // Uncapped, so this is the ground truth of what the corpus CONTAINS.
    const all = run(scanner, root, ["--max-hit-lines", "0", ...paths]);
    const counts = byClass(all.lines);
    if (shape.expects.length === 0) {
      if (all.code !== 0 || all.lines.length !== 0) {
        throw new Error(
          `instrument: the hit-free control is not clean (exit ${String(all.code)}, ` +
            `${String(all.lines.length)} hit lines). A control that is not clean means a ` +
            `difference elsewhere cannot be attributed to the hits.`,
        );
      }
      truth.set(shape.name, counts);
      continue;
    }
    if (all.code !== 1) {
      throw new Error(
        `instrument: shape "${shape.name}" did not refuse (exit ${String(all.code)})`,
      );
    }
    for (const k of shape.expects) {
      if ((counts.get(k) ?? 0) === 0) {
        throw new Error(
          `instrument: shape "${shape.name}" produced no ${k} hit. A shape that produces nothing ` +
            `reads as a cell with no violation, which is the strongest possible result and is ` +
            `not evidence.`,
        );
      }
    }
    truth.set(shape.name, counts);
  }
  return truth;
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

interface Cell {
  shape: string;
  cap: number | null;
  shippedLines: number;
  baseLines: number | null;
  /** Base lines the shipped run did not print. Every one is a violation. */
  missing: number;
  /** Recognizers with hits that base printed NOTHING from and shipped printed some from. */
  rescued: Klass[];
  /** Recognizers the shipped run spent its whole budget on. */
  atCap: number;
  exit: number;
  total: number;
  cuts: number;
}

const capName = (c: number | null): string => (c === null ? "default" : String(c));

function main(): number {
  const baseScanner = process.argv[2];

  verifyIsPhiScan(SHIPPED, "the shipped scanner");
  if (baseScanner !== undefined) verifyIsPhiScan(baseScanner, "the base scanner");
  const truth = verifyShapes(SHIPPED);

  // The DEFAULT budget, DERIVED FROM A RUN rather than written here as a numeral. A numeral copied
  // into an instrument is a second source of truth that drifts from the constant, and it would
  // silently stop the `default` rows from being checked against a ceiling at all. The shape is a
  // single-recognizer flood far past any plausible default, so the lines it prints ARE the budget.
  const probe = makeRepo(SHAPES[3] as Shape);
  const defaultCap = run(SHIPPED, probe.root, probe.paths).lines.length;
  if (defaultCap <= 0 || defaultCap >= FLOOD) {
    throw new Error(
      `instrument: could not derive the default budget (read ${String(defaultCap)} of ` +
        `${String(FLOOD)} hits). A default at or above the flood size makes every ceiling ` +
        `check below vacuous.`,
    );
  }

  const cells: Cell[] = [];
  for (const shape of SHAPES) {
    const contains = truth.get(shape.name) ?? new Map<Klass, number>();
    for (const cap of CAPS) {
      const shipped = makeRepo(shape);
      const s = run(SHIPPED, shipped.root, [...capArgs(cap), ...shipped.paths]);
      let baseLines: number | null = null;
      let missing = 0;
      const rescued: Klass[] = [];
      if (baseScanner !== undefined) {
        const b = makeRepo(shape);
        const r = run(baseScanner, b.root, [...capArgs(cap), ...b.paths]);
        baseLines = r.lines.length;
        // The four invariants the cap has always had, re-checked here rather than assumed.
        if (r.code !== s.code) {
          throw new Error(`VIOLATION exit: ${shape.name} cap ${String(cap)}`);
        }
        if (r.total !== s.total) {
          throw new Error(`VIOLATION total: ${shape.name} cap ${String(cap)}`);
        }
        if (
          r.named.map((p) => p.split("fixtures")[1]).join("|") !==
          s.named.map((p) => p.split("fixtures")[1]).join("|")
        ) {
          throw new Error(`VIOLATION named files: ${shape.name} cap ${String(cap)}`);
        }
        if (s.withheld !== s.total - s.lines.length || r.withheld !== r.total - r.lines.length) {
          throw new Error(`VIOLATION withheld arithmetic: ${shape.name} cap ${String(cap)}`);
        }
        // THE SUPERSET, as a MULTISET over the hit DETAIL lines. A set would let one shipped line
        // stand for two identical base ones, and a flood is made of identical lines, so a set
        // comparison over this very grid would read clean while lines went missing.
        // A hit DETAIL line carries no path, so the two throwaway repos are directly comparable.
        const pool = new Map<string, number>();
        for (const l of s.lines) pool.set(l, (pool.get(l) ?? 0) + 1);
        for (const l of r.lines) {
          const n = pool.get(l) ?? 0;
          if (n === 0) missing += 1;
          else pool.set(l, n - 1);
        }
        const baseByClass = byClass(r.lines);
        const shippedByClass = byClass(s.lines);
        for (const [k, n] of contains) {
          if (n > 0 && (baseByClass.get(k) ?? 0) === 0 && (shippedByClass.get(k) ?? 0) > 0) {
            rescued.push(k);
          }
        }
      }
      let atCap = 0;
      const ceiling = cap === null ? defaultCap : cap;
      if (ceiling > 0) {
        for (const [file, group] of s.perFile) {
          for (const [, n] of byClass(group)) {
            if (n > ceiling) {
              throw new Error(`VIOLATION over cap: ${shape.name} cap ${capName(cap)} in ${file}`);
            }
            if (n === ceiling) atCap += 1;
          }
        }
      }
      cells.push({
        shape: shape.name,
        cap,
        shippedLines: s.lines.length,
        baseLines,
        missing,
        rescued,
        atCap,
        exit: s.code,
        total: s.total,
        cuts: s.cuts,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  const rows: string[][] = [
    ["shape", "cap", "exit", "hits", "base lines", "here", "missing", "rescued", "at cap"],
  ];
  for (const c of cells) {
    rows.push([
      c.shape,
      capName(c.cap),
      String(c.exit),
      String(c.total),
      c.baseLines === null ? "-" : String(c.baseLines),
      String(c.shippedLines),
      String(c.missing),
      c.rescued.join(",") || "-",
      String(c.atCap),
    ]);
  }
  const widths = rows[0]?.map((_v, i) => Math.max(...rows.map((r) => (r[i] ?? "").length))) ?? [];
  for (const r of rows) {
    process.stdout.write(
      r
        .map((v, i) => v.padEnd(widths[i] ?? 0))
        .join("  ")
        .trimEnd() + "\n",
    );
  }

  const violations = cells.reduce((n, c) => n + c.missing, 0);
  const exitOne = cells.filter((c) => c.exit === 1).length;
  const shippedLines = cells.reduce((n, c) => n + c.shippedLines, 0);
  const baseLines = cells.reduce((n, c) => n + (c.baseLines ?? 0), 0);
  const strictlyMore = cells.filter(
    (c) => c.baseLines !== null && c.shippedLines > c.baseLines,
  ).length;
  const cutCells = cells.filter((c) => c.cuts > 0).length;
  const atCapCells = cells.filter((c) => c.atCap > 0).length;
  const rescuedCells = cells.filter((c) => c.rescued.length > 0).length;
  const biggest = Math.max(...cells.map((c) => c.total));

  process.stdout.write(
    [
      "",
      "NON-VACUITY. A grid that exercises nothing passes trivially.",
      `  cells                                    ${String(cells.length)}`,
      `  cells that refused (exit 1)              ${String(exitOne)}`,
      `  hit lines compared, base                 ${String(baseLines)}`,
      `  hit lines compared, here                 ${String(shippedLines)}`,
      `  cells printing strictly more than base   ${String(strictlyMore)}`,
      `  cells that withheld lines (a cut line)   ${String(cutCells)}`,
      `  cells with a recognizer at its ceiling   ${String(atCapCells)}`,
      `  cells where base STARVED a recognizer    ${String(rescuedCells)}`,
      `  largest cell, in hits                    ${String(biggest)}`,
      "",
      `SUPERSET VIOLATIONS (base lines not printed here): ${String(violations)}`,
      baseScanner === undefined
        ? "  (no base scanner given: the grid is the shipped tree's columns only)"
        : `  base: ${baseScanner}`,
      "",
    ].join("\n"),
  );

  return violations === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} finally {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

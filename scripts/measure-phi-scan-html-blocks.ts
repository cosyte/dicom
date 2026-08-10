#!/usr/bin/env node
/**
 * Which paths the PHI gate's override-log parser treats as LIVE ALLOW ENTRIES, as a function of
 * what it thinks a BLOCK is.
 *
 * ## What this measures, and why it is a PHI question
 *
 * `scripts/phi-scan.ts` refuses a `--allow-fixture <path>` bypass unless `phi-scan-overrides.md`
 * carries a `### <path>` heading OUTSIDE any block that suppresses headings. So the set of headings
 * that parser produces is the set of PHI scan targets a caller can exempt at exit 0, and a heading
 * it produces that a human reviewing the rendered document does not see is an exemption nobody
 * approved.
 *
 * A fenced code block SHOWS its contents. An HTML COMMENT shows nothing at all, so a heading inside
 * one is the sharper version of the same defect: `<!-- ### secret.dcm -->` renders as an empty
 * document. CommonMark 0.31.2 section 4.6 defines seven kinds of HTML block; this parser models
 * kinds 1 to 6, and the cost of leaving kind 7 out is a row here rather than a sentence.
 *
 * ## 🛑 IT PRINTS A RELATION, NEVER A DIRECTION
 *
 * A block boundary is PARITY. Reading one wrongly does not only drop or admit that block's
 * headings, it moves every boundary after it, so two readings' entry sets can be DISJOINT rather
 * than nested and neither is the conservative one. This lineage has had a fail-safe-direction
 * argument refuted three times, so this instrument reports `equal`, `a-subset-of-b`,
 * `b-subset-of-a`, `disjoint` or `overlapping` and refuses to summarise them as safer or less safe.
 *
 * ## The instrument is verified before any figure it prints is believed
 *
 * Three checks THROW rather than report:
 *
 * 1. every script handed to it must BE this package's phi-scan. A bad `--max-hit-lines` refuses
 *    with this script's own message and exit 2, which is the negative control against a sibling
 *    package's file of the same name (a shared scratch area has produced one here before);
 * 2. THE ANCHOR: on the repository's own committed `phi-scan-overrides.md`, every script must
 *    produce ZERO entries. Its only `###` line is the template inside the fence. A script that
 *    produced one has a live allow entry no human wrote, and no other figure here is readable;
 * 3. THE POSITIVE CONTROL: the corpus must exercise both answers. A single-script run must produce
 *    at least one non-empty and one empty entry set, and a comparison must produce at least one
 *    relation that is not `equal`. A detector that cannot fire is not a detector.
 *
 * ## Running it
 *
 * ```
 * pnpm measure:phi-scan-html-blocks                               # this tree
 * git show <base>:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
 * pnpm measure:phi-scan-html-blocks scripts/phi-scan.ts /tmp/base-phi-scan.ts
 * ```
 *
 * 🩺 RESTORE A BASE TREE BY FILE COPY, NEVER `git checkout`. That is a rule this lineage paid for
 * twice, and it is why this takes a script PATH rather than a revision: nothing here touches the
 * working tree.
 *
 * The record is `documentation/agent-notes/dicom-phi-scan-html-blocks.md`.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CR = String.fromCharCode(0x0d);
const FENCE = "`".repeat(3);

interface Log {
  name: string;
  /** What the file holds. */
  body: string;
  /** The paths to ask about. Every one is created on disk, so only a missing ENTRY can refuse it. */
  candidates: string[];
  /** What the log is for, printed beside it. */
  about: string;
}

/**
 * The corpus.
 *
 * Every log is written to a throwaway repository, so none of these bytes ever reaches this one.
 * The candidate names are ordinary file names, because each is created and offered back to the
 * scanner: the only reason a bypass can be refused is that the parser did not produce the entry.
 */
const CORPUS: Log[] = [
  {
    name: "committed",
    body: readFileSync(join(REPO_ROOT, "phi-scan-overrides.md"), "utf8"),
    candidates: ["<path>"],
    about: "this repository's own log. The anchor: its only heading is a fenced template.",
  },
  {
    name: "comment",
    body: ["# log", "", "intro", "<!--", "### commented", "-->", "### visible", ""].join("\n"),
    candidates: ["commented", "visible"],
    about:
      "kind 2. A comment renders as NOTHING, so the heading in it is invisible, not merely quoted.",
  },
  {
    name: "comment-lone-cr",
    body: ["# log", "", `intro${CR}<!--`, "### commented", "-->", "### visible", ""].join("\n"),
    candidates: ["commented", "visible"],
    about: "the same log with a lone CR before the opener. The input `#116` moved into the class.",
  },
  {
    name: "div",
    body: [
      "# log",
      "",
      "<div>",
      "### in-div",
      "</div>",
      "### still-in-div",
      "",
      "### after",
      "",
    ].join("\n"),
    candidates: ["in-div", "still-in-div", "after"],
    about: "kind 6, which ends at a BLANK LINE and not at the closing tag.",
  },
  {
    name: "pre",
    body: [
      "# log",
      "",
      "<pre>",
      "### in-pre",
      "",
      "### still-in-pre",
      "</pre>",
      "### after",
      "",
    ].join("\n"),
    candidates: ["in-pre", "still-in-pre", "after"],
    about: "kind 1, which does NOT end at a blank line. The other half of the `div` row.",
  },
  {
    name: "one-line-comment",
    body: ["# log", "", "<!-- x -->", "### after", ""].join("\n"),
    candidates: ["after"],
    about: "a start line that also meets the end condition. The block is that one line.",
  },
  {
    name: "fence-in-comment",
    body: ["# log", "", "<!--", FENCE, "### in-both", "-->", "### after", ""].join("\n"),
    candidates: ["in-both", "after"],
    about: "a fence OPENER inside a comment. Nesting, and the row where entries move both ways.",
  },
  {
    name: "parity",
    body: ["# log", "", "<!--", FENCE, "-->", "### alpha", FENCE, "### bravo", ""].join("\n"),
    candidates: ["alpha", "bravo"],
    about:
      "🛑 THE DISJOINTNESS ROW, both sides non-empty. An ODD number of fence delimiters inside " +
      "the comment, so each reading exempts at exit 0 a target the other refuses at exit 2.",
  },
  {
    name: "comment-in-fence",
    body: ["# log", "", FENCE, "<!--", FENCE, "### after", ""].join("\n"),
    candidates: ["after"],
    about: "a comment opener inside a fence, which starts no block at all.",
  },
  {
    name: "indent-four",
    body: ["# log", "", "    <!--", "### after", "    -->", ""].join("\n"),
    candidates: ["after"],
    about: "four spaces is indented code, where section 4.6 admits no start condition.",
  },
  {
    name: "condition-seven",
    body: ["# log", "", "<span>", "### under-span", ""].join("\n"),
    candidates: ["under-span"],
    about: "🔴 THE SCOPED-OUT KIND. CommonMark hides this heading; every script here shows it.",
  },
  {
    name: "condition-seven-widened",
    body: ["# log", "", "</pre>", "<!--", FENCE, "-->", "### widened", ""].join("\n"),
    candidates: ["widened"],
    about:
      "🔴 THE INSTANCE OF THE SCOPED-OUT KIND THAT THIS CHANGE WIDENS. `</pre>` alone is a kind 7 " +
      "start neither script models; reading the comment under it swallows the fence that used to " +
      "hide the heading, so head EXEMPTS at exit 0 what base refused at exit 2.",
  },
];

const roots: string[] = [];

/** A throwaway repository holding `body` as its override log, plus every candidate as a file. */
function makeRepo(log: Log): string {
  const root = mkdtempSync(join(tmpdir(), "dicom-phi-html-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "test", "fixtures"), { recursive: true });
  mkdirSync(join(root, "docs-content"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "README.md"), "# throwaway\n", "utf8");
  writeFileSync(join(root, "docs-content", "intro.md"), "# throwaway doc\n", "utf8");
  writeFileSync(join(root, "phi-scan-overrides.md"), log.body, "utf8");
  for (const c of log.candidates) writeFileSync(join(root, c), "no tokens here\n", "utf8");
  return root;
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function run(script: string, args: string[], cwd: string): Run {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

/**
 * CHECK 1: this file is a phi-scan.
 *
 * A bad `--max-hit-lines` is refused by argument parsing, before anything reads a file, with a
 * message only this script emits. Anything else is a different program and its zeros mean nothing.
 */
function assertIsPhiScan(script: string): void {
  const root = makeRepo(CORPUS[0] as Log);
  const r = run(script, ["--max-hit-lines", "banana", "README.md"], root);
  if (r.code !== 2 || !r.stderr.includes("--max-hit-lines expects a non-negative integer")) {
    throw new Error(
      `${script} is not this package's phi-scan: expected exit 2 and its own refusal, got ` +
        `exit ${String(r.code)}: ${r.stderr.slice(0, 200)}`,
    );
  }
}

/** The entries `script` produced for `log`, read off which candidates it refused. */
function entriesOf(script: string, log: Log): Set<string> {
  const root = makeRepo(log);
  const args: string[] = [];
  for (const c of log.candidates) args.push("--allow-fixture", c);
  const r = run(script, args, root);
  if (r.code === 0) return new Set(log.candidates);
  if (r.code !== 2) {
    throw new Error(`expected exit 0 or 2 on ${log.name}, got ${String(r.code)}: ${r.stderr}`);
  }
  const missing = new Set<string>();
  for (const line of r.stderr.split("\n")) if (line.startsWith("  - ")) missing.add(line.slice(4));
  return new Set(log.candidates.filter((c) => !missing.has(c)));
}

type Relation = "equal" | "a-subset-of-b" | "b-subset-of-a" | "disjoint" | "overlapping";

/**
 * 🛑 THE EMPTY SET IS TESTED FOR SUBSET BEFORE DISJOINTNESS, WHICH IS WHERE THIS DIFFERS FROM THE
 * SIBLING LINE-ENDINGS INSTRUMENT. An empty set shares nothing with anything AND is a subset of
 * everything, so both labels are true of it, and `disjoint` is the one that would OVERSTATE the
 * parity evidence this instrument exists to print. The corpus carries a `parity` log whose two
 * sides are both non-empty precisely so the disjointness claim rests on that row and not on an
 * empty one.
 */
function relate(a: Set<string>, b: Set<string>): Relation {
  const shared = [...a].filter((v) => b.has(v));
  if (a.size === b.size && shared.length === a.size) return "equal";
  if (shared.length === a.size && a.size < b.size) return "a-subset-of-b";
  if (shared.length === b.size && b.size < a.size) return "b-subset-of-a";
  if (shared.length === 0) return "disjoint";
  return "overlapping";
}

const show = (s: Set<string>): string => (s.size === 0 ? "{}" : `{${[...s].sort().join(", ")}}`);

function main(): number {
  const argv = process.argv.slice(2);
  const scriptA = resolve(argv[0] ?? join(REPO_ROOT, "scripts", "phi-scan.ts"));
  const scriptB = argv[1] === undefined ? null : resolve(argv[1]);

  assertIsPhiScan(scriptA);
  if (scriptB !== null) assertIsPhiScan(scriptB);

  console.log(`A: ${scriptA}`);
  if (scriptB !== null) console.log(`B: ${scriptB}`);
  console.log("");

  const rows: { log: Log; a: Set<string>; b: Set<string> | null }[] = [];
  for (const log of CORPUS) {
    rows.push({
      log,
      a: entriesOf(scriptA, log),
      b: scriptB === null ? null : entriesOf(scriptB, log),
    });
  }

  for (const { log, a, b } of rows) {
    console.log(`## ${log.name}`);
    console.log(`   ${log.about}`);
    console.log(`   candidates : ${log.candidates.join(", ")}`);
    console.log(`   A entries  : ${show(a)}`);
    if (b !== null) {
      console.log(`   B entries  : ${show(b)}`);
      console.log(`   relation   : ${relate(a, b)}`);
    }
    console.log("");
  }

  // CHECK 2: the anchor. The committed log must hold no live entry under any script measured.
  for (const { log, a, b } of rows) {
    if (log.name !== "committed") continue;
    for (const [which, set] of [
      ["A", a],
      ["B", b],
    ] as [string, Set<string> | null][]) {
      if (set !== null && set.size !== 0) {
        throw new Error(
          `ANCHOR FAILED: script ${which} reads ${show(set)} as live in this repository's own ` +
            `override log. Its only heading is the fenced template, so nothing else here is readable.`,
        );
      }
    }
  }

  // CHECK 3: the positive control. A corpus every reading agrees on proves nothing.
  const nonEmpty = rows.filter((r) => r.a.size > 0).length;
  const empty = rows.filter((r) => r.a.size === 0).length;
  if (nonEmpty === 0 || empty === 0) {
    throw new Error(
      `POSITIVE CONTROL FAILED: ${String(nonEmpty)} non-empty and ${String(empty)} empty entry ` +
        `sets. A run that answered the same way everywhere cannot distinguish a parser from a stub.`,
    );
  }
  if (scriptB !== null) {
    const moved = rows.filter((r) => r.b !== null && relate(r.a, r.b) !== "equal");
    if (moved.length === 0) {
      throw new Error(
        "POSITIVE CONTROL FAILED: the two scripts agreed on every log. Either they read blocks the " +
          "same way, or the corpus does not exercise the difference. Refusing to report a clean grid.",
      );
    }
    console.log(
      `logs where the two scripts differ: ${String(moved.length)} of ${String(rows.length)}`,
    );
    for (const r of moved) console.log(`  ${r.log.name}: ${relate(r.a, r.b as Set<string>)}`);
  }
  console.log("controls: scanner identity OK, committed-log anchor OK, positive control OK");
  return 0;
}

try {
  process.exitCode = main();
} finally {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

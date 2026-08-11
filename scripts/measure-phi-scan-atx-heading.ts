#!/usr/bin/env node
/**
 * Which paths the PHI gate's override-log parser treats as LIVE ALLOW ENTRIES, as a function of
 * what it thinks the WHITESPACE in a `### <path>` heading is.
 *
 * ## What this measures, and why it is a PHI question
 *
 * `scripts/phi-scan.ts` refuses a `--allow-fixture <path>` bypass unless `phi-scan-overrides.md`
 * carries a `### <path>` heading outside any block that suppresses headings. So the set of headings
 * that parser produces is the set of PHI scan targets a caller can exempt at exit 0, and a heading
 * it produces that a human reviewing the RENDERED document does not see is an exemption nobody
 * approved.
 *
 * CommonMark 0.31.2 section 4.2 says the `###` run "must be followed by spaces or tabs, or by the
 * end of line". The parser separated with the whole of `\s`, and every character in the gap -
 * `NBSP`, the `EN`/`EM` spaces, `ZWNBSP`, `IDEOGRAPHIC SPACE` - renders as blank or as nothing at
 * all, so each was a way to make a document that renders as a PARAGRAPH exempt a target.
 *
 * ## 🛑 IT PRINTS A RELATION, NEVER A DIRECTION
 *
 * A rule that decided a heading's TEXT rather than only whether there is one would be parity, and
 * two readings' entry sets could be DISJOINT rather than nested with neither the conservative one.
 * A draft of this slice was exactly that and was refused. So this reports `equal`,
 * `a-subset-of-b`, `b-subset-of-a`, `disjoint` or `overlapping` and refuses to summarise them as
 * safer or less safe: what says the shipped change only ever REFUSES is that every differing row
 * prints as a subset, measured here rather than argued on the function.
 *
 * ## The instrument is verified before any figure it prints is believed
 *
 * Four checks THROW rather than report:
 *
 * 1. every script handed to it must BE this package's phi-scan. A bad `--max-hit-lines` refuses
 *    with this script's own message and exit 2, which is the negative control against a sibling
 *    package's file of the same name (a shared scratch area has produced one here before);
 * 2. THE ANCHOR: on the repository's own committed `phi-scan-overrides.md`, every script must
 *    produce ZERO entries. Its only `###` line is the template inside the fence. A script that
 *    produced one has a live allow entry no human wrote, and no other figure here is readable;
 * 3. THE POSITIVE CONTROL: the corpus must exercise both answers. A single-script run must produce
 *    at least one non-empty and one empty entry set, and a comparison must produce at least one
 *    relation that is not `equal`. A detector that cannot fire is not a detector;
 * 4. 🩺 THE EXEMPTION CONTROL, which is what makes an "entry" mean something. An entry is measured
 *    here by whether `--allow-fixture` is ACCEPTED, and acceptance would be cheap to fake. So one
 *    log is run twice over a target holding a synthetic `PN` the gate hits on: with the flag it
 *    must exit 0 and with the same bytes and no flag it must exit 1. A run that could not produce
 *    that pair is measuring flag validation and not exemption, and reports nothing.
 *
 * ## Running it
 *
 * ```
 * pnpm measure:phi-scan-atx-heading                                # this tree
 * git show <base>:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
 * pnpm measure:phi-scan-atx-heading scripts/phi-scan.ts /tmp/base-phi-scan.ts
 * ```
 *
 * 🩺 RESTORE A BASE TREE BY FILE COPY, NEVER `git checkout`. That is a rule this lineage paid for
 * twice, and it is why this takes a script PATH rather than a revision: nothing here touches the
 * working tree.
 *
 * The record is `documentation/agent-notes/dicom-phi-scan-atx-heading.md`.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/**
 * A synthetic `FAMILY^GIVEN` the gate's own PN recognizer hits on, assembled rather than spelled.
 *
 * This file lives under `scripts/`, which the gate does not walk, but the rule the whole lineage
 * follows is that a literal name run in this repository is a fixture and fixtures are assembled.
 */
const CARET = String.fromCharCode(0x5e);
const PHI_BEARING = `PATIENT${CARET}ALPHA\n`;

/**
 * Every code point `\s` admits that section 4.2 does not, minus the two that end a LINE.
 *
 * 🛑 DERIVED FROM THE LANGUAGE, NOT TYPED. `isSpaceCode` in `phi-scan.ts` is the whole of ES2023
 * `\s` and is pinned against that pattern over all 65,536 code points; this walks the same range
 * and keeps what `\s` admits, so a table nobody checked cannot creep in here either. `LF` and `CR`
 * are excluded because `splitCommonMarkLines` ends the line at them, so a log built from them would
 * measure section 2.1 rather than section 4.2 - a different slice with its own instrument. `VT` and
 * `FF` stay in: they are `\s`, they are not CommonMark line endings, and they show a reviewer
 * nothing.
 */
const INVISIBLE: readonly number[] = (() => {
  const out: number[] = [];
  for (let code = 0; code <= 0xffff; code += 1) {
    if (!/\s/.test(String.fromCharCode(code))) continue;
    if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) continue;
    out.push(code);
  }
  if (out.length < 15) {
    throw new Error(`derived ${String(out.length)} invisible separators; the walk found too few`);
  }
  return out;
})();

const hex = (code: number): string => code.toString(16).padStart(4, "0");

interface Log {
  name: string;
  /** What the file holds. */
  body: string;
  /** The paths to ask about. Every one is created on disk, so only a missing ENTRY can refuse it. */
  candidates: string[];
  /** What the log is for, printed beside it. */
  about: string;
}

const entriesHeader = ["# log", "", "## Entries", ""];
const logBody = (lines: readonly string[]): string => [...entriesHeader, ...lines, ""].join("\n");

/**
 * The corpus.
 *
 * Every log is written to a throwaway repository, so none of these bytes ever reaches this one.
 * The candidate names are ordinary file names apart from the invisible characters under test, and
 * each is created and offered back to the scanner: the only reason a bypass can be refused is that
 * the parser did not produce the entry.
 */
const CORPUS: Log[] = [
  {
    name: "committed",
    body: readFileSync(join(REPO_ROOT, "phi-scan-overrides.md"), "utf8"),
    candidates: ["<path>"],
    about: "this repository's own log. The anchor: its only heading is a fenced template.",
  },
  {
    name: "space-and-tab",
    body: logBody(["### by-space", `###\tby-tab`]),
    candidates: ["by-space", "by-tab"],
    about:
      "the two separators section 4.2 admits. BOTH arms: a parser that read only the space would " +
      "pass a case carrying one, and the tab arm is the one a later maintainer drops.",
  },
  {
    name: "invisible-separator",
    body: logBody([
      ...INVISIBLE.map((c) => `###${String.fromCharCode(c)}sep-${hex(c)}`),
      "### visible",
    ]),
    candidates: [...INVISIBLE.map((c) => `sep-${hex(c)}`), "visible"],
    about:
      "🔴 THE FILED DEFECT, one arm per character. Section 4.2 makes each of these a PARAGRAPH. " +
      "`visible` is the other direction in the same run: a parser that dropped everything fails.",
  },
  {
    name: "invisible-trailer",
    body: logBody(INVISIBLE.map((c) => `### tail-${hex(c)}${String.fromCharCode(c)}`)),
    candidates: [
      ...INVISIBLE.map((c) => `tail-${hex(c)}`),
      ...INVISIBLE.map((c) => `tail-${hex(c)}${String.fromCharCode(c)}`),
    ],
    about:
      "🔴 THE STRIP, WHICH IS CONTESTED AND DELIBERATELY NOT TAKEN. `equal` here is the evidence " +
      "that this half did not move: a draft that made it section 4.2's named the path WITH the " +
      "invisible character, exempting at exit 0 a target the other tree refuses at exit 2.",
  },
  {
    name: "invisible-leader",
    body: logBody(INVISIBLE.map((c) => `### ${String.fromCharCode(c)}lead-${hex(c)}`)),
    candidates: [
      ...INVISIBLE.map((c) => `lead-${hex(c)}`),
      ...INVISIBLE.map((c) => `${String.fromCharCode(c)}lead-${hex(c)}`),
    ],
    about:
      "a legal separator, then an invisible character, then the path. The other end of the same " +
      "contested strip, and `equal` says the same thing about it.",
  },
  {
    name: "all-invisible",
    body: logBody(INVISIBLE.map((c) => `###  ${String.fromCharCode(c)}`)),
    candidates: INVISIBLE.map((c) => String.fromCharCode(c)),
    about:
      "a heading whose whole text is invisible. Both readings must produce NOTHING: that is the " +
      "parser's own disclosed narrowing, and this row is what says section 4.2 did not undo it.",
  },
  {
    name: "closing-sequence",
    body: logBody(["### closing ###"]),
    candidates: ["closing", "closing ###"],
    about:
      "🔴 THE SCOPED-OUT DIVERGENCE. Section 4.2's optional closing sequence is not modelled, so " +
      "both readings name `closing ###` where the document names `closing`. Visible to a reviewer, " +
      "which is what the rows above are not.",
  },
];

const roots: string[] = [];

/** A throwaway repository holding `body` as its override log, plus every candidate as a file. */
function makeRepo(log: Log): string {
  const root = mkdtempSync(join(tmpdir(), "dicom-phi-atx-"));
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
  for (const c of log.candidates) writeFileSync(join(root, c), PHI_BEARING, "utf8");
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

/**
 * CHECK 4: an entry is an EXEMPTION.
 *
 * Every other figure here reads acceptance of `--allow-fixture` as "the parser produced the entry".
 * That is one inference away from what matters, so this closes it on a real target: the same bytes
 * are scanned twice, and the pair must be exit 0 with the flag against exit 1 without it. A script
 * that exited 0 on both would be finding no PHI at all, and its acceptances would mean nothing.
 */
function assertEntryExempts(script: string): void {
  const target = "exemption-control";
  const log: Log = {
    name: "exemption-control",
    body: logBody([`### ${target}`]),
    candidates: [target],
    about: "",
  };
  const root = makeRepo(log);
  const exempted = run(script, ["--allow-fixture", target, target], root);
  const bare = run(script, [target], root);
  if (exempted.code !== 0 || bare.code !== 1) {
    throw new Error(
      `EXEMPTION CONTROL FAILED for ${script}: with the flag exit ${String(exempted.code)} ` +
        `(expected 0), without it exit ${String(bare.code)} (expected 1). An accepted flag is ` +
        `only evidence of an exemption if the same bytes are a hit without it.`,
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
 * 🛑 THE EMPTY SET IS TESTED FOR SUBSET BEFORE DISJOINTNESS, as in the sibling HTML-blocks
 * instrument and for the same reason. An empty set shares nothing with anything AND is a subset of
 * everything, so both labels are true of it, and `disjoint` is the one that would OVERSTATE the
 * parity evidence. The corpus carries rows whose two sides are both non-empty precisely so the
 * disjointness claim rests on those and not on an empty one.
 */
function relate(a: Set<string>, b: Set<string>): Relation {
  const shared = [...a].filter((v) => b.has(v));
  if (a.size === b.size && shared.length === a.size) return "equal";
  if (shared.length === a.size && a.size < b.size) return "a-subset-of-b";
  if (shared.length === b.size && b.size < a.size) return "b-subset-of-a";
  if (shared.length === 0) return "disjoint";
  return "overlapping";
}

/** Printable: an invisible character in an entry would otherwise print as nothing at all. */
function visible(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code > 0x7e ? `<U+${hex(code).toUpperCase()}>` : ch;
  }
  return out;
}

const show = (s: Set<string>): string =>
  s.size === 0 ? "{}" : `{${[...s].sort().map(visible).join(", ")}}`;

function main(): number {
  const argv = process.argv.slice(2);
  const scriptA = resolve(argv[0] ?? join(REPO_ROOT, "scripts", "phi-scan.ts"));
  const scriptB = argv[1] === undefined ? null : resolve(argv[1]);

  for (const script of [scriptA, scriptB]) {
    if (script === null) continue;
    assertIsPhiScan(script);
    assertEntryExempts(script);
  }

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
    console.log(`   candidates : ${String(log.candidates.length)}`);
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
        "POSITIVE CONTROL FAILED: the two scripts agreed on every log. Either they read a heading " +
          "the same way, or the corpus does not exercise the difference. Refusing to report a " +
          "clean grid.",
      );
    }
    console.log(
      `logs where the two scripts differ: ${String(moved.length)} of ${String(rows.length)}`,
    );
    for (const r of moved) console.log(`  ${r.log.name}: ${relate(r.a, r.b as Set<string>)}`);
  }
  console.log(
    "controls: scanner identity OK, entry-exempts OK, committed-log anchor OK, positive control OK",
  );
  return 0;
}

try {
  process.exitCode = main();
} finally {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

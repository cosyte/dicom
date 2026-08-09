/**
 * A scan target's bytes are not readable from a process global once the PHI gate has finished.
 *
 * V8 keeps the last successful match on the `RegExp` constructor: `RegExp.input` (`$_`) is the
 * whole subject string and `RegExp.lastMatch` (`$&`) is the matched text verbatim, with
 * `leftContext`, `rightContext`, `lastParen` and `$1` to `$9` beside them. They are ordinary
 * readable properties of a global object. `DICOM-RESIDUALS` bounded what a hit line PRINTS and
 * what a hit HOLDS; this is the third carrier of the same payload, and `scripts/phi-scan.ts` now
 * hands a target's bytes to no regex at all.
 *
 * 🛑 WHY THIS IS A SUBPROCESS AND NOT AN ASSERTION IN THIS FILE. The statics are overwritten by
 * the next successful match anywhere in the realm, so a test that ran the scanner in-process and
 * then read `RegExp.input` would be reading whatever the test runner matched on the way back. It
 * would pass whether or not the scanner left anything behind: a detector zero that is a gap rather
 * than a clearance, which is this lineage's most expensive recurring mistake. The observer is
 * preloaded with `--require`, so its `exit` listener is registered before the scanner's module
 * scope runs and fires first, and it reads the statics with `includes` rather than with a pattern
 * so it cannot clear its own evidence.
 *
 * 🛑 THE ZERO IS PINNED BESIDE A POSITIVE CONTROL in the same file: the same observer over a child
 * that does nothing but match the same token reports it. A control that cannot fire is not a
 * control.
 *
 * The corpus-scale figures, and the base-against-shipped comparison, are
 * `scripts/measure-phi-scan-regex-statics.ts`.
 *
 * Every value here is assembled at runtime, for the reason `test/helpers/phi-scan-violators.ts`
 * gives: this file is under `test/`, so the gate scans it.
 */

import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runRepoScript } from "../helpers/run-script.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const CARET = String.fromCharCode(0x5e);
const DASH = String.fromCharCode(0x2d);

/** Invented, name-bearing, and not on the allow-list. A payload carrying nothing proves nothing. */
const NAME = `OKONKWOQZ${CARET}ADAEZEQZ`;
const ISO = ["1991", "07", "23"].join(DASH);
const COMPACT = ["1991", "07", "23"].join("");
const TOKENS = [NAME, ISO, COMPACT];

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

interface Sample {
  where: string;
  inputLength: number;
  carriers: string[];
}

/**
 * The preloaded observer, written as source so nothing in this test's own realm is involved.
 *
 * No pattern is used anywhere inside it. `String.prototype.includes` and property reads only, and
 * the statics are read as the opening statements of every reading.
 */
function writeObserver(dir: string, out: string): string {
  const path = join(dir, "observer.cjs");
  writeFileSync(
    path,
    [
      `const TOKENS = ${JSON.stringify(TOKENS)};`,
      `const OUT = ${JSON.stringify(out)};`,
      'const fs = require("node:fs");',
      "const samples = [];",
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
      "const real = fs.readFileSync;",
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

function samplesFrom(report: string): Sample[] {
  const samples = JSON.parse(readFileSync(report, "utf8")) as Sample[];
  const last = samples[samples.length - 1];
  if (last === undefined || last.where !== "exit") {
    throw new Error(
      `the observer took no reading at exit (${String(samples.length)} samples). A run whose ` +
        `observer never fired reports no carrier, which is the strongest possible result.`,
    );
  }
  return samples;
}

/** A throwaway repository with one target planting every token. */
function makeCorpus(): { root: string; target: string } {
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
  const target = join(root, "test", "fixtures", "page.txt");
  writeFileSync(target, `Patient: ${NAME}\nDOB: ${ISO}\nAlso: ${COMPACT}\n`, "utf8");
  return { root, target };
}

describe("the PHI gate leaves no scan target in V8's legacy RegExp statics", () => {
  it("reports the token when a regex has matched it, or nothing below is evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "dicom-regex-statics-pos-"));
    roots.push(dir);
    const report = join(dir, "samples.json");
    writeFileSync(report, "[]", "utf8");
    const observer = writeObserver(dir, report);
    const script = join(dir, "match.cjs");
    writeFileSync(
      script,
      [
        `const token = ${JSON.stringify(NAME)};`,
        'const body = "filler ".repeat(1000) + token;',
        // The caret is escaped: unescaped it is an anchor, the control never matches, and a
        // control that cannot fire would make every clean reading below meaningless.
        'const re = new RegExp("[A-Z][A-Za-z]+\\\\" + String.fromCharCode(0x5e) + "[A-Z][A-Za-z]+", "g");',
        'if (re.exec(body) === null) throw new Error("the positive control did not match");',
        "",
      ].join("\n"),
      "utf8",
    );
    const r = spawnSync(process.execPath, ["--require", observer, script], {
      shell: false,
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    const atExit = samplesFrom(report).at(-1) as Sample;
    expect(atExit.carriers).toContain("input");
    expect(atExit.carriers).toContain("lastMatch");
  });

  it("leaves no carrier after scanning a target that carries a name and two dates", () => {
    const { root, target } = makeCorpus();
    const dir = mkdtempSync(join(tmpdir(), "dicom-regex-statics-run-"));
    roots.push(dir);
    const report = join(dir, "samples.json");
    writeFileSync(report, "[]", "utf8");
    const observer = writeObserver(dir, report);
    const r = runRepoScript("phi-scan.ts", ["--max-hit-lines", "0", target], {
      cwd: root,
      nodeArgs: ["--require", observer],
    });

    // Non-vacuity: the scan has to have FOUND the tokens, or it left nothing behind because it
    // did nothing. Three hits, one per token.
    expect(r.code).toBe(1);
    const hitLines = r.stderr.split("\n").filter((l) => l.startsWith("  tag="));
    expect(hitLines).toHaveLength(3);

    const samples = samplesFrom(report);
    expect(samples.length).toBeGreaterThan(1);
    for (const sample of samples) {
      expect(sample.carriers).toEqual([]);
    }
  });
});

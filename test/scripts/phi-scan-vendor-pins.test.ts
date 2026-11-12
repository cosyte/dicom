/**
 * The paths route against a hash-pinned vendored standard, and the allow-list it lets us keep small.
 *
 * The pre-push hook hands every outgoing path to this scanner. A vendored standard prints its own
 * worked examples (a sample person name, a sample date), so a re-pin used to need those values in
 * `scripts/phi-allow-list.txt`, which has no path scope and so excused them in `test/` and
 * `docs-content/` too. The scanner now skips a file under `vendor/.../<sha256>/` whose bytes hash
 * to that directory's name and to the `SHA.txt` beside it, and the values are out of the list.
 *
 * Every value here is assembled at runtime, for the reason `test/helpers/phi-scan-violators.ts`
 * gives: this file is under `test/`, so the gate scans it. The planted names and dates are the
 * standard's published examples or plainly synthetic ones.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  realpathSync,
  readFileSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { runRepoScript } from "../helpers/run-script.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** A person name from its components, so no `family^given` run is spelled out in this file. */
function pn(family: string, given: string): string {
  return [family, given].join("^");
}

/** A compact date from its parts, so no eight-digit run is spelled out in this file. */
function da(year: number, month: number, day: number): string {
  return [String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("");
}

/** An ISO date from its parts. */
function iso(year: number, month: number, day: number): string {
  return [String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

/**
 * PS3.5's own worked examples, as the text sweep matches them in the vendored DocBook: the PN
 * examples of section 6.2, the Chinese name example of Annex J, the DA example of section 6.2, and
 * the date in a WG-04 minutes URL. These were global allow-list entries and are not any more.
 */
const STANDARD_EXAMPLES = [
  pn("Adams", "John"),
  pn("Morrison-Jones", "Susan"),
  pn("Smith", "Fluffy"),
  pn("Farms", "Running"),
  pn("Wang", "XiaoDong"),
  da(1993, 8, 22),
  iso(2004, 2, 18),
];

const roots: string[] = [];

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** A fresh root with this repository's allow-list, so the list under test is the real one. */
function freshRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-vendor-")));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  return root;
}

function put(root: string, rel: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function scan(root: string, paths: string[]): { code: number; stdout: string; stderr: string } {
  return runRepoScript("phi-scan.ts", ["--max-hit-lines", "0", ...paths], { cwd: root });
}

/** A page carrying every example once, one per line. */
const PAGE = STANDARD_EXAMPLES.map((v) => `Example value: ${v}`).join("\n") + "\n";

/** A synthetic standards text with a name and a date of the shape a patient's would have. */
const PINNED_TEXT = `Worked example: ${pn("Example", "Sample")} born ${da(1981, 3, 4)}.\n`;

/** Lay out a pin of `content` as the vendored standards are laid out, and return its path. */
function pin(root: string, dir: string, content: string, record?: string): string {
  const hash = sha256(content);
  const rel = `${dir}/${hash}/doc.txt`;
  put(root, rel, content);
  put(root, `${dir}/SHA.txt`, `${record ?? hash}\n`);
  return rel;
}

describe("phi-scan: the standard's worked examples are not excused outside vendor/", () => {
  for (const rel of ["docs-content/planted.md", "test/fixtures/planted.ts"]) {
    it(`reports every one of them planted in ${rel}`, () => {
      const root = freshRoot();
      put(root, rel, PAGE);
      const r = scan(root, [rel]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      for (const value of STANDARD_EXAMPLES) expect(r.stderr, value).toContain(value);
    });
  }

  it("the allow-list names none of them", () => {
    const list = readFileSync(join(REPO_ROOT, "scripts", "phi-allow-list.txt"), "utf8");
    const entries = list
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => (l.startsWith("DATE:") ? l.slice("DATE:".length) : l));
    for (const value of STANDARD_EXAMPLES) {
      expect(entries, value).not.toContain(value.replaceAll("-", ""));
      expect(entries, value).not.toContain(value);
    }
  });
});

describe("phi-scan: a hash-pinned vendored file on the paths route", () => {
  it("skips every content pin this repository vendors, and names each on stdout", () => {
    const pinned: string[] = [];
    const walk = (rel: string): void => {
      for (const e of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
        const child = `${rel}/${e.name}`;
        if (e.isDirectory()) walk(child);
        else if (/\/[0-9a-f]{64}\/[^/]+$/.test(child)) pinned.push(child);
      }
    };
    walk("vendor");
    expect(pinned.length).toBeGreaterThan(0);
    const r = scan(REPO_ROOT, pinned);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    for (const p of pinned) expect(r.stdout, p).toContain(p);
    expect(r.stdout).toContain(`skipped ${String(pinned.length)} vendored file(s)`);
  });

  it("skips a synthetic pin whose bytes match, and scans the same bytes elsewhere", () => {
    const root = freshRoot();
    const rel = pin(root, "vendor/example/part", PINNED_TEXT);
    put(root, "docs-content/copy.md", PINNED_TEXT);
    const r = scan(root, [rel, "docs-content/copy.md"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stdout).toContain(`skipped 1 vendored file(s) whose SHA-256 matches its pin: ${rel}`);
    expect(r.stderr).toContain("docs-content/copy.md");
    expect(r.stderr).not.toContain(rel);
  });

  it("a pin alone scans with no hits and no withheld verdict", () => {
    const root = freshRoot();
    const rel = pin(root, "vendor/example/part", PINNED_TEXT);
    const r = scan(root, [rel]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stderr).not.toContain("WITHHELD");
  });

  it("scans a pinned file whose bytes changed under the pin", () => {
    const root = freshRoot();
    const rel = pin(root, "vendor/example/part", PINNED_TEXT);
    writeFileSync(join(root, rel), PINNED_TEXT + "edited\n");
    const r = scan(root, [rel]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(rel);
    expect(r.stdout).not.toContain("vendored file(s)");
  });

  it("scans a hash directory whose SHA.txt names another hash, or is missing", () => {
    const root = freshRoot();
    const wrong = pin(root, "vendor/wrong/part", PINNED_TEXT, "0".repeat(64));
    const bare = `vendor/bare/part/${sha256(PINNED_TEXT)}/doc.txt`;
    put(root, bare, PINNED_TEXT);
    const r = scan(root, [wrong, bare]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(wrong);
    expect(r.stderr).toContain(bare);
  });

  it("scans a matching pin laid out outside vendor/, or one level too deep", () => {
    const root = freshRoot();
    const outside = pin(root, "docs-content/part", PINNED_TEXT);
    const hash = sha256(PINNED_TEXT);
    const deep = `vendor/deep/part/${hash}/sub/doc.txt`;
    put(root, deep, PINNED_TEXT);
    put(root, "vendor/deep/part/SHA.txt", `${hash}\n`);
    const r = scan(root, [outside, deep]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(outside);
    expect(r.stderr).toContain(deep);
  });

  it("scans a pinned path that is a link, even to matching bytes", () => {
    const root = freshRoot();
    const hash = sha256(PINNED_TEXT);
    put(root, "elsewhere/doc.txt", PINNED_TEXT);
    const rel = `vendor/link/part/${hash}/doc.txt`;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    symlinkSync(join(root, "elsewhere", "doc.txt"), join(root, rel));
    put(root, "vendor/link/part/SHA.txt", `${hash}\n`);
    const r = scan(root, [rel]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(rel);
  });
});

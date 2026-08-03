/**
 * Tests for scripts/attw.mjs, the wrapper that makes the `attw` publish gate report
 * its own failure.
 *
 * WHAT THESE PIN, AND WHY EACH ONE IS HERE:
 *
 *  1. THE UPSTREAM BEHAVIOUR THE WRAPPER EXISTS FOR. `attw` prints "This package
 *     does not contain types." and exits 0. If a future `attw` upgrade fixes that
 *     exit code or rewords the sentence, this test reds, which is the point. A guard
 *     that silently stops matching is worse than no guard, and this is the one net in
 *     `attw.mjs` that depends on a string.
 *  2. THE SHAPE THIS PACKAGE ACTUALLY PRODUCES. `tsup` writes the `.mjs`/`.cjs`
 *     bundles before the declaration files, so every build of `@cosyte/dicom` has a
 *     window where `dist/` holds JS and no `.d.ts` (measured at 1.06s to 1.43s over
 *     three clean builds on an idle box). The `tsup-window` fixture is that exact
 *     state against a dual ESM/CJS `exports` map shaped like this package's own, and
 *     it asserts BOTH halves in one test: bare `attw` exits 0 over it (the false
 *     green), and the wrapper reds naming `./dist/index.d.ts`.
 *  3. That the wrapper turns an untyped TARBALL into a failure, which is the case the
 *     preflight structurally cannot see.
 *  4. A NEGATIVE CONTROL. On a package whose tarball really does carry types, the
 *     wrapper is transparent: same exit status as `attw` itself, and green. A gate
 *     that only ever fails is not a gate, and a false red here would cost every later
 *     run an hour.
 *  5. THE GATE'S MOST BASIC OBLIGATION, that a real `attw` failure still fails.
 *     Without this, every other test here would pass on a wrapper that swallowed
 *     attw's own exit status, because net 2 reds the untyped fixture regardless.
 *  6. The refusals that keep net 2 readable, each paired with a measurement that the
 *     route being refused really does blind the post-check. A refusal with no
 *     measured route behind it is ceremony; a measured route with no refusal is a way
 *     back to the false green.
 *
 * The fixtures are minimal throwaway packages in a temp dir. Nothing here touches
 * this repo's own `dist/`, so the suite needs no build and cannot race one. `attw` is
 * invoked with `--no-definitely-typed` so the runs stay offline; the wrapper forwards
 * arguments, which is what makes that possible.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no
 * shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const WRAPPER = join(REPO_ROOT, "scripts", "attw.mjs");
const ATTW_BIN = join(REPO_ROOT, "node_modules", ".bin", "attw");
const UNTYPED = "This package does not contain types.";
const OFFLINE = ["--no-definitely-typed"];
// Each case shells out to `attw --pack`, which runs a real `npm pack`; two of those
// in one test comfortably exceeds this suite's 10s default (vitest.config.ts).
const SPAWN_TIMEOUT = 60_000;

interface RunResult {
  code: number;
  out: string;
}

function run(bin: string, args: string[], cwd: string): RunResult {
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", timeout: 120_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const runAttw = (cwd: string, extra: string[] = []): RunResult =>
  run(ATTW_BIN, ["--pack", ".", ...OFFLINE, ...extra], cwd);
const runWrapper = (cwd: string, args: string[] = OFFLINE): RunResult =>
  run(process.execPath, [WRAPPER, ...args], cwd);

let root: string;

/** A package whose declaration file exists on disk but is left out of `files`. */
let typesNotPacked: string;
/** JS bundles written, declarations not yet written: the tsup build window. */
let tsupWindow: string;
/** A package whose `package.json` points at a `dist/` that was never built. */
let noBuild: string;
/** A well-formed dual ESM/CJS package: the negative control. */
let wellFormed: string;
/** A package with a real attw problem: `require` resolves to ESM. */
let attwFails: string;
/** Declarations present, JS entry point missing. attw itself is green on this. */
let jsMissing: string;

function writePkg(dir: string, pkg: Record<string, unknown>, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [name, body] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, body);
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "attw-gate-"));

  typesNotPacked = join(root, "types-not-packed");
  writePkg(
    typesNotPacked,
    {
      name: "attw-gate-fixture-unpacked",
      version: "1.0.0",
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js"],
    },
    { "index.js": "module.exports = {};\n", "index.d.ts": "export declare const a: number;\n" },
  );

  // The dual ESM/CJS `exports` shape @cosyte/dicom itself declares, caught mid-build:
  // both bundles written, neither declaration file written yet.
  tsupWindow = join(root, "tsup-window");
  writePkg(
    tsupWindow,
    {
      name: "attw-gate-fixture-tsupwindow",
      version: "1.0.0",
      type: "module",
      main: "./dist/index.cjs",
      module: "./dist/index.mjs",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          import: { types: "./dist/index.d.ts", default: "./dist/index.mjs" },
          require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
        },
        "./package.json": "./package.json",
      },
      files: ["dist"],
    },
    { "dist/index.mjs": "export const a = 1;\n", "dist/index.cjs": "module.exports.a = 1;\n" },
  );

  noBuild = join(root, "no-build");
  writePkg(
    noBuild,
    {
      name: "attw-gate-fixture-nobuild",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
      files: ["dist"],
    },
    {},
  );

  wellFormed = join(root, "well-formed");
  writePkg(
    wellFormed,
    {
      name: "attw-gate-fixture-wellformed",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": {
          import: { types: "./index.d.ts", default: "./index.js" },
          require: { types: "./index.d.cts", default: "./index.cjs" },
        },
      },
      files: ["index.js", "index.d.ts", "index.cjs", "index.d.cts"],
    },
    {
      "index.js": "export const a = 1;\n",
      "index.d.ts": "export declare const a: number;\n",
      "index.cjs": "module.exports.a = 1;\n",
      "index.d.cts": "export declare const a: number;\n",
    },
  );

  // ESM-only, with no `require` condition: attw's default strict profile reports
  // CJSResolvesToESM and exits non-zero of its own accord.
  attwFails = join(root, "attw-fails");
  writePkg(
    attwFails,
    {
      name: "attw-gate-fixture-problem",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
      files: ["index.js", "index.d.ts"],
    },
    { "index.js": "export const a = 1;\n", "index.d.ts": "export declare const a: number;\n" },
  );

  jsMissing = join(root, "js-missing");
  writePkg(
    jsMissing,
    {
      name: "attw-gate-fixture-jsmissing",
      version: "1.0.0",
      main: "./dist/index.js",
      types: "./index.d.ts",
      files: ["index.d.ts"],
    },
    { "index.d.ts": "export declare const a: number;\n" },
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("attw's own exit code (the reason this wrapper exists)", () => {
  it(
    "reports an untyped pack and still exits 0",
    () => {
      const r = runAttw(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      // If this ever fails because the status is now non-zero, attw has fixed the
      // early return in getExitCode() and net 2 of scripts/attw.mjs is redundant.
      // Read that file's header before deleting anything.
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("scripts/attw.mjs", () => {
  it(
    "reds the tsup build window, which bare attw passes with exit 0",
    () => {
      // The false green, in the shape this package's own build produces it: JS
      // bundles on disk, declarations not written yet.
      const bare = runAttw(tsupWindow);
      expect(bare.out).toContain(UNTYPED);
      expect(bare.code).toBe(0);

      const wrapped = runWrapper(tsupWindow);
      expect(wrapped.code).not.toBe(0);
      expect(wrapped.out).toContain("./dist/index.d.ts");
      expect(wrapped.out).toContain("./dist/index.d.cts");
      expect(wrapped.out).toContain("missing");
      // The preflight names the missing file rather than leaving the reader to infer
      // it, and says what attw would have done instead.
      expect(wrapped.out).toContain("EXITED 0");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails when the tarball carries no types, where attw exits 0",
    () => {
      const r = runWrapper(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).not.toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails, naming the file, when a declared artifact was never built",
    () => {
      const r = runWrapper(noBuild);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.d.ts");
      expect(r.out).toContain("missing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "does not claim attw would have said 'untyped' when only JS is missing",
    () => {
      // Measured: with the declarations intact, bare attw reports no problems and
      // exits 0 on this fixture. The preflight still reds it, but must not tell the
      // reader something about attw's behaviour that is false for this case.
      const bare = runAttw(jsMissing);
      expect(bare.out).toContain("No problems found");
      expect(bare.code).toBe(0);
      const r = runWrapper(jsMissing);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.js");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "still fails when attw itself fails, with attw's own status",
    () => {
      const bare = runAttw(attwFails);
      expect(bare.code).not.toBe(0);
      expect(bare.out).not.toContain(UNTYPED);
      const wrapped = runWrapper(attwFails);
      expect(wrapped.code).toBe(bare.code);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "is transparent on a package that really does ship types",
    () => {
      const bare = runAttw(wellFormed);
      const wrapped = runWrapper(wellFormed);
      expect(bare.out).not.toContain(UNTYPED);
      expect(wrapped.code).toBe(bare.code);
      expect(wrapped.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "forwards other arguments, so --profile still reaches attw",
    () => {
      // typecheck:exports runs through this wrapper with --profile node16, and the
      // suite itself relies on --no-definitely-typed being forwarded.
      const r = runWrapper(wellFormed, [...OFFLINE, "--profile", "node16"]);
      expect(r.code).toBe(0);
      expect(r.out).toContain("node16");
    },
    SPAWN_TIMEOUT,
  );
});

describe("the refusals that keep the post-check readable", () => {
  it.each([
    ["--quiet", ["--quiet"]],
    ["-q", ["-q"]],
    ["--format json", ["--format", "json"]],
    ["-f json", ["-f", "json"]],
    ["--format=json", ["--format=json"]],
    // The three cluster forms. An exact-token predicate misses all of them, because
    // commander lets a short option's value attach and lets shorts combine, so `-f`
    // is not visible as a whole token. `-fjson` reached exit 0 with the gate silent
    // on the first draft of scripts/attw.mjs.
    ["-fjson", ["-fjson"]],
    ["-qf json", ["-qf", "json"]],
    ["-Pfjson", ["-Pfjson"]],
  ])(
    "refuses %s, and bare attw with it hands back a blind exit 0",
    (_name, extra) => {
      // The measurement that justifies the refusal: on the very fixture whose
      // tarball carries no types, this argument makes attw exit 0 with the untyped
      // sentence unreadable. That is the false green, restored.
      const bare = runAttw(typesNotPacked, extra);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(typesNotPacked, [...OFFLINE, ...extra]);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("attw gate");
    },
    SPAWN_TIMEOUT,
  );

  it.each([
    ["--form json (no option-name abbreviation)", ["--form", "json"]],
    ["--quiet=true (no = on a boolean)", ["--quiet=true"]],
    ["-f=json (no = on an attached short value)", ["-f=json"]],
  ])(
    "does not need to refuse %s, because attw itself rejects it",
    (_name, extra) => {
      // Measured, not assumed. Each of these looks like a blinding route and is not
      // one: commander rejects the argument outright, so nothing is analysed and
      // nothing is hidden. The refusal set is bounded by what is actually reachable.
      const bare = runAttw(typesNotPacked, extra);
      expect(bare.code).not.toBe(0);
      expect(bare.out).toContain("error: ");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses nothing else: -P and --profile still reach attw",
    () => {
      // The over-strictness is bounded. A single-dash cluster with no `q` or `f`, and
      // a long option that is not one of the three, are forwarded and the post-check
      // still does its job on the untyped fixture.
      for (const extra of [["-P"], ["--profile", "node16"]]) {
        const r = runWrapper(typesNotPacked, [...OFFLINE, ...extra]);
        expect(r.code).not.toBe(0);
        expect(r.out).toContain(UNTYPED);
      }
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses --config-path, which was measured to blind the post-check",
    () => {
      // terminology's copy refuses this one by inference and says so. Measured here:
      // a config file named by --config-path blinds exactly like an in-tree
      // .attw.json, because readConfig() applies it after argv either way.
      writeFileSync(join(typesNotPacked, "elsewhere.json"), JSON.stringify({ quiet: true }));
      const bare = runAttw(typesNotPacked, ["--config-path", "elsewhere.json"]);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(typesNotPacked, [...OFFLINE, "--config-path", "elsewhere.json"]);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("attw gate");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses a .attw.json that sets quiet or format",
    () => {
      const dir = join(root, "config-blinded");
      writePkg(
        dir,
        {
          name: "attw-gate-fixture-configblind",
          version: "1.0.0",
          main: "./index.js",
          types: "./index.d.ts",
          files: ["index.js"],
        },
        {
          "index.js": "module.exports = {};\n",
          "index.d.ts": "export declare const a: number;\n",
          ".attw.json": JSON.stringify({ quiet: true }),
        },
      );
      // Bare attw takes the config and goes silent: exit 0 over an untyped pack.
      const bare = runAttw(dir);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(".attw.json");
    },
    SPAWN_TIMEOUT,
  );
});

import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  docSnippetSuite,
  extractRunnableSnippets,
  runSnippet,
} from "@cosyte/vitest-config/snippets";

import { base64Object, compileErrors, fences, section } from "./_helpers/first-use.js";
import { FIRST_USE_CT_NO_PREAMBLE, FIRST_USE_CT_OBJECT } from "./fixtures/first-use/ct-object.js";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` is extracted,
 * compiled, and executed, and its inline `// =>` assertions are checked - so a documented example
 * can never silently drift from the shipped code (the documentation analog of the parser conformance
 * runners). Blocks tagged ` ```ts runnable throws ` must throw; plain ` ```ts ` blocks are
 * illustrative and are not executed.
 *
 * `@cosyte/dicom` ships a single top-level entry, so every snippet imports `@cosyte/dicom` and
 * resolves against the **built** ESM artifact - exactly what an installer loads, not the source tree.
 * Every DICOM object in the docs is synthetic: a small base64-encoded Part 10 buffer built from an
 * invented patient and fake UIDs, so a snippet needs no `.dcm` file on disk and no real PHI ever
 * touches this suite. The runnable blocks stay on the deterministic, in-process parser / serializer /
 * de-identifier (`parseDicom`, `serializeDicom`, `deidentify`); nothing here opens a socket.
 *
 * The shared CI gate runs `test` before `build`, so we provision `dist/` on demand here rather than
 * assuming order.
 */
const root = join(import.meta.dirname, "..");

/** Map the published entry point to its built ESM artifact. */
const ENTRY = join(root, "dist", "index.mjs");
const resolveEntry = (specifier: string): string | undefined =>
  specifier === "@cosyte/dicom" ? ENTRY : undefined;

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 180_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve: resolveEntry,
});

/**
 * The two FIRST-USE examples are the ones a reader runs first, so they are held to more than the
 * sweep above. The quickstart's first block must be the one the sweep executes, and the Part 10
 * object it prints as base64 must be byte-identical to the fixture `test/fixtures/first-use` builds,
 * which `pnpm phi-scan` reads with the rest of `test/`. The README's first `## Usage` block is read
 * out of README.md and run here against the built package; the one edit made to it is pointing its
 * `readFile("study.dcm")` at a temporary copy of that fixture's preamble-less variant, and that
 * rewrite is counted. A changed value in either example turns this file red. Temp modules live in
 * their own directory inside the root, as the harness requires, and every temp path is removed.
 */
const FIRST_USE_TMP = join(root, ".cosyte-first-use-snippets");
const QUICKSTART = readFileSync(join(root, "docs-content", "quickstart.md"), "utf8");
const QUICKSTART_FIRST = fences(QUICKSTART)[0];
const QUICKSTART_FIRST_RUNNABLE = extractRunnableSnippets(QUICKSTART)[0];
const README_FIRST = fences(section(readFileSync(join(root, "README.md"), "utf8"), "## Usage"))[0];
const STUDY_FILE = '"study.dcm"';
/**
 * The snippet harness strips types without checking them, so compiling is checked separately, the
 * way a reader's new TypeScript project compiles the block, against the source entry point the
 * bundler compiles into the published types. A program over the source takes seconds to check, so
 * these cases state their own budget.
 */
const SOURCE_PATHS = { "@cosyte/dicom": join(root, "src", "index.ts") };
const COMPILE_TIMEOUT = 60_000;

let studyDir = "";

beforeAll(() => {
  studyDir = mkdtempSync(join(tmpdir(), "dicom-first-use-"));
  writeFileSync(join(studyDir, "study.dcm"), FIRST_USE_CT_NO_PREAMBLE);
});

afterAll(() => {
  rmSync(FIRST_USE_TMP, { recursive: true, force: true });
  rmSync(studyDir, { recursive: true, force: true });
});

/** The README block with its one input file pointed at the fixture copy; the rewrite is counted. */
function readmeRunnable(code: string): string {
  expect(code.split(STUDY_FILE).length - 1, "the example reads study.dcm exactly once").toBe(1);
  return code.replace(STUDY_FILE, JSON.stringify(join(studyDir, "study.dcm")));
}

describe("the quickstart's first example", () => {
  it("AC-DI1: is a runnable TypeScript block, so the sweep above executes it", () => {
    expect(QUICKSTART_FIRST?.lang).toBe("ts");
    expect(QUICKSTART_FIRST?.tags).toContain("runnable");
    expect(QUICKSTART_FIRST?.tags).not.toContain("throws");
    expect(QUICKSTART_FIRST_RUNNABLE?.code).toBe(QUICKSTART_FIRST?.body);
  });

  it(
    "AC-DI1: compiles in a new TypeScript project against the package's types",
    () => {
      expect(compileErrors(root, SOURCE_PATHS, QUICKSTART_FIRST?.body ?? "")).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );

  it(
    "AC-DI1: a block that does not compile is reported, so it turns this suite red",
    () => {
      const code = QUICKSTART_FIRST?.body ?? "";
      const guarded = "ds.patient.name?.alphabetic?.familyName";
      expect(code.split(guarded).length - 1).toBe(1);
      const mutated = code.replace(guarded, "ds.patient.name.alphabetic?.familyName");
      expect(compileErrors(root, SOURCE_PATHS, mutated)).toEqual([
        expect.stringContaining("TS18048"),
      ]);
    },
    COMPILE_TIMEOUT,
  );

  it("AC-DI1: runs against the built package and every claimed value holds", async () => {
    expect(QUICKSTART_FIRST_RUNNABLE).toBeDefined();
    if (QUICKSTART_FIRST_RUNNABLE === undefined) return;
    await runSnippet(QUICKSTART_FIRST_RUNNABLE, { resolve: resolveEntry, tmpDir: FIRST_USE_TMP });
  });

  it("AC-DI4: the Part 10 object it prints is byte-identical to the first-use fixture", () => {
    const printed = base64Object(QUICKSTART_FIRST_RUNNABLE?.code ?? "");
    expect(printed?.equals(FIRST_USE_CT_OBJECT)).toBe(true);
  });

  it("AC-DI3: a changed claimed value turns the run red", async () => {
    const code = QUICKSTART_FIRST_RUNNABLE?.code ?? "";
    expect(code.split('ds.patient.id; // => "MRN-42"').length - 1).toBe(1);
    const mutated = code.replace('ds.patient.id; // => "MRN-42"', 'ds.patient.id; // => "MRN-43"');
    await expect(
      runSnippet(mutated, { resolve: resolveEntry, tmpDir: FIRST_USE_TMP }),
    ).rejects.toThrow();
  });

  it("AC-DI3: a changed input value turns the run red and is no longer the fixture", async () => {
    const code = QUICKSTART_FIRST_RUNNABLE?.code ?? "";
    const bytes = base64Object(code) ?? Buffer.alloc(0);
    const at = bytes.indexOf("MRN-42");
    expect(at).toBeGreaterThan(-1);
    const changed = Buffer.from(bytes);
    changed.write("MRN-43", at, "ascii");
    const mutated = code.replace(bytes.toString("base64"), changed.toString("base64"));
    expect(mutated).not.toBe(code);
    expect(base64Object(mutated)?.equals(FIRST_USE_CT_OBJECT)).toBe(false);
    await expect(
      runSnippet(mutated, { resolve: resolveEntry, tmpDir: FIRST_USE_TMP }),
    ).rejects.toThrow();
  });
});

describe("the README ## Usage example", () => {
  it("AC-DI2: the first block under ## Usage is TypeScript that claims its output inline", () => {
    expect(README_FIRST?.lang).toBe("ts");
    expect(README_FIRST?.body).toMatch(/;\s*\/\/ => /);
  });

  it(
    "AC-DI2: compiles in a new TypeScript project against the package's types",
    () => {
      expect(compileErrors(root, SOURCE_PATHS, README_FIRST?.body ?? "")).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );

  it(
    "AC-DI2: a block that does not compile is reported, so it turns this suite red",
    () => {
      const code = README_FIRST?.body ?? "";
      const claim = "ds.warnings.map((w) => w.code)";
      expect(code.split(claim).length - 1).toBe(1);
      const mutated = code.replace(claim, "ds.warnings.map((w) => w.codes)");
      expect(compileErrors(root, SOURCE_PATHS, mutated)).toEqual([
        expect.stringMatching(/TS2551|TS2339/),
      ]);
    },
    COMPILE_TIMEOUT,
  );

  it("AC-DI2: runs against the built package reading the fixture, and every claimed value holds", async () => {
    await runSnippet(readmeRunnable(README_FIRST?.body ?? ""), {
      resolve: resolveEntry,
      tmpDir: FIRST_USE_TMP,
    });
  });

  it("AC-DI3: a changed claimed value turns the run red", async () => {
    const code = README_FIRST?.body ?? "";
    expect(code.split('ds.series.modality; // => "CT"').length - 1).toBe(1);
    const mutated = code.replace(
      'ds.series.modality; // => "CT"',
      'ds.series.modality; // => "MR"',
    );
    await expect(
      runSnippet(readmeRunnable(mutated), { resolve: resolveEntry, tmpDir: FIRST_USE_TMP }),
    ).rejects.toThrow();
  });
});

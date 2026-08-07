/**
 * Tests for scripts/generate-annex-e.ts.
 *
 * Two properties, both of which the Annex E table's safety rests on:
 *
 *   1. **The pin is a precondition, not a comment.** The generator re-hashes the
 *      vendored PS3.15 DocBook and refuses to emit if the bytes are not the
 *      pinned bytes. A de-identification action table generated from an input
 *      nobody verified is exactly the artifact where "it was swapped and nobody
 *      noticed" is unacceptable.
 *   2. **The overlay's assumptions print on every run.** The size of the
 *      mirror-only set (rows PS3.15 does not publish, which are KEPT), the
 *      family rows an exact-tag map cannot represent, and the E.3.6 date-column
 *      divergence are all assumptions this generator makes on purpose. They are
 *      printed rather than asserted in a comment, so a re-pin that moves one is
 *      visible in the run that moves it.
 *
 * The generator is invoked through `test/helpers/run-script.ts`, like the other
 * script suites. It writes `annex-e.ts`; the run is deterministic, so the output is
 * asserted byte-identical to the COMMITTED `src/dictionary/generated/annex-e.ts`,
 * which is the local mirror of the CI regen gate.
 *
 * 🛑 EVERY BYTE THIS FILE WRITES GOES INTO A SANDBOX, AND THE WORKING TREE IS READ
 * ONLY. Proving the pin means mutating the document the pin covers, and vitest runs
 * test files in parallel, so an earlier shape of this file mutated
 * `vendor/nema/part15/` in place while other workers were reading it -
 * `DICOM-ANNEX-E-TEST-RACE`. `test/helpers/generator-sandbox.ts` carries the
 * measurement and the reason the remedy is relocation rather than a softer pin on
 * either side. Do not reach back into `REPO_ROOT` for anything this suite writes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createGeneratorSandbox, REPO_ROOT, type Sandbox } from "../helpers/generator-sandbox.js";
import { runRepoScript, type ScriptResult } from "../helpers/run-script.js";

/** The committed artifact, in the real tree. READ ONLY: this is the regen gate's answer. */
const COMMITTED_ARTIFACT = join(REPO_ROOT, "src", "dictionary", "generated", "annex-e.ts");

/**
 * The sandbox, and the paths inside it. They are `let` rather than `const` because
 * the sandbox root is only known once `beforeAll` has made it, and every write in
 * this file goes through one of them.
 */
let sandbox: Sandbox;
let ARTIFACT: string;
let NEMA_ROOT: string;
let NEMA_SHA_FILE: string;

/** Per-test budget for the generator run. See the sibling generator suite for why no
 * justification is stated here. */
const GENERATOR_TIMEOUT_MS = 120_000;

/**
 * This generator is the one script in the repo that still needs `tsx`, because it
 * imports `"../src/dictionary/repeating-groups.js"` and Node's ESM resolver will not
 * rewrite that onto the `.ts` file. See `test/helpers/run-script.ts`; the test at the
 * bottom of this file pins the failure so the exception cannot outlive its reason.
 */
function runGenerator(): ScriptResult {
  return runRepoScript("generate-annex-e.ts", [], { root: sandbox.root, runner: "tsx" });
}

/**
 * Run the generator against a **mutated** DocBook, then put everything back.
 *
 * A rule that has only ever been shown to work on the input it was written for
 * has not been shown to be a rule. These tests construct the input that would
 * defeat it and assert the run goes red, which is the same proof the header-label
 * check uses: the pin is re-hashed, so the mutant is committed to its own
 * SHA-named directory with `SHA.txt` pointed at it, and both are removed after.
 * The sandbox's copy of the artifact is restored verbatim regardless of outcome.
 *
 * All four paths here are SANDBOX paths. The restore in the `finally` is kept
 * because the tests after this one read the sandbox and are entitled to find it as
 * the committed tree left it, but it is no longer the only thing standing between a
 * crashed run and a corrupted normative document on disk: nothing outside the
 * sandbox is ever opened for writing.
 */
function withMutatedDocBook<T>(
  mutate: (xml: string) => string,
  fn: (r: { code: number; stdout: string; stderr: string }) => T,
): T {
  const originalSha = readFileSync(NEMA_SHA_FILE, "utf8");
  const originalArtifact = readFileSync(ARTIFACT, "utf8");
  const pinned = originalSha.trim().split(/\s+/)[0] ?? "";
  const xml = readFileSync(join(NEMA_ROOT, pinned, "part15.xml"), "utf8");

  const mutated = mutate(xml);
  expect(mutated, "the mutation must actually change the document").not.toBe(xml);
  const mutantSha = createHash("sha256").update(Buffer.from(mutated, "utf8")).digest("hex");
  const mutantDir = join(NEMA_ROOT, mutantSha);
  try {
    mkdirSync(mutantDir, { recursive: true });
    writeFileSync(join(mutantDir, "part15.xml"), mutated, "utf8");
    writeFileSync(NEMA_SHA_FILE, `${mutantSha}\n`, "utf8");
    return fn(runGenerator());
  } finally {
    writeFileSync(NEMA_SHA_FILE, originalSha, "utf8");
    rmSync(mutantDir, { recursive: true, force: true });
    writeFileSync(ARTIFACT, originalArtifact, "utf8");
  }
}

/** The `(60xx,4000)` Overlay Comments row, verbatim, from a Table E.1-1 DocBook. */
function overlayCommentsRow(xml: string): string {
  const at = xml.indexOf("Overlay Comments");
  expect(at, "part15.xml must carry an Overlay Comments row").toBeGreaterThan(-1);
  const open = xml.lastIndexOf("<tr", at);
  const close = xml.indexOf("</tr>", at) + "</tr>".length;
  return xml.slice(open, close);
}

describe("generate-annex-e", () => {
  // One happy-path invocation, asserted from many angles. The generator reads a
  // 3.5 MB DocBook, so re-spawning it per assertion is real wall-clock spent on
  // nothing: the run is deterministic, so one capture answers every question
  // below.
  let happy: { code: number; stdout: string; stderr: string };
  let artifactBefore: string;
  let artifactAfter: string;

  // Well above the suite's 10s default: this hook parses a 3.5 MB DocBook in a
  // child process, and the whole point of doing it once is that the cost is paid
  // here. A shared default tuned for in-memory fixtures would make it flaky. It
  // also takes the sandbox copy, which is paid once for the file; no size is quoted
  // here, because the one that was got it wrong by more than three times. Derive it:
  // `du -sb scripts src vendor`, and read `generator-sandbox.ts` for the trap.
  beforeAll(() => {
    sandbox = createGeneratorSandbox("annex-e");
    ARTIFACT = join(sandbox.root, "src", "dictionary", "generated", "annex-e.ts");
    NEMA_ROOT = join(sandbox.root, "vendor", "nema", "part15");
    NEMA_SHA_FILE = join(NEMA_ROOT, "SHA.txt");

    // 🛑 THE BASELINE IS THE COMMITTED FILE, NOT THE SANDBOX'S COPY OF IT. Reading
    // the sandbox here would compare the generator's output against whatever this
    // suite had already put there, which is a tautology the moment a mutation test
    // leaves something behind. Read from the working tree, write into the sandbox,
    // and the assertion still means "regenerates what is committed".
    artifactBefore = readFileSync(COMMITTED_ARTIFACT, "utf8");
    happy = runGenerator();
    artifactAfter = readFileSync(ARTIFACT, "utf8");
  }, GENERATOR_TIMEOUT_MS);

  afterAll(() => {
    // OPTIONAL-CHAINED ON PURPOSE. If `beforeAll` dies before the assignment - a
    // `cpSync` that runs `os.tmpdir()` out of space is the plausible one, and this
    // suite is not the only thing copying into it - then a bare `sandbox.dispose()`
    // throws its own TypeError from the hook and buries the error that actually
    // stopped the run.
    sandbox?.dispose();
  });

  it("regenerates the committed artifact byte for byte", () => {
    expect(happy.stderr, happy.stderr).toBe("");
    expect(happy.code).toBe(0);
    expect(artifactAfter).toBe(artifactBefore);
  });

  it("names the PS3.15 edition it read rather than asserting one", () => {
    expect(happy.stdout).toMatch(/PS3\.15 edition: \d{4}[a-z]? \(sha256 [0-9a-f]{12}\)/);
  });

  it("prints the overlay, including the size of the mirror-only set", () => {
    expect(happy.stdout).toMatch(
      /overlay vs PS3\.15 \d{4}[a-z]?: \d+ shared, \d+ added, \d+ mirror-only kept/,
    );
  });

  it("emits every repeating-group family row as a rule, and prints what it covers", () => {
    expect(happy.stdout).toContain(
      "repeating-group family rules: 3, covering 48 concrete group numbers (PS3.5 section 7.6)",
    );
    for (const row of ["(50xx,xxxx)", "(60xx,3000)", "(60xx,4000)"]) {
      expect(happy.stdout, row).toContain(`repeating rule ${row}`);
    }
    // The PS3.5 bound, printed rather than assumed: sixteen even groups per mask.
    expect(happy.stdout).toContain("over groups 5000-501E even (16)");
    expect(happy.stdout).toContain("over groups 6000-601E even (16)");
  });

  it("prints the private-attribute family row it deliberately does not emit", () => {
    expect(happy.stdout).toContain(
      "private-attribute family rows (removed by their own path, not emitted): 1",
    );
    expect(happy.stdout).toContain("(gggg,eeee) where gggg is odd");
  });

  it("prints whether any exact row shadows a repeating-group rule", () => {
    expect(happy.stdout).toContain("exact rows shadowing a repeating-group rule (exact wins): 0");
  });

  it(
    "refuses a masked row on a group prefix PS3.5 does not define as a repeating group",
    () => {
      // The defect this rule closes, one edition ahead: a family row the matcher
      // cannot expand. Before this check the generator printed it and carried on
      // (exit 0), leaving attributes the standard marks X in the file with the
      // report saying nothing. `(7Fxx,0010)` is a real PS3.6 registry mask with
      // no PS3.5 section 7.6 repeating-group semantics behind it, so there is no
      // bound on which concrete groups it covers and guessing one is not safe.
      withMutatedDocBook(
        (xml) => {
          const row = overlayCommentsRow(xml);
          const injected = row
            .replace("(60xx,4000)", "(7Fxx,0010)")
            .replace("Overlay Comments", "Variable Pixel Data");
          return xml.replace(row, row + injected);
        },
        (r) => {
          expect(r.code).not.toBe(0);
          expect(r.stderr).toContain("7Fxx");
          expect(r.stderr).toContain("PS3.5 section 7.6 does not define as a repeating group");
        },
      );
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "reads each repeating rule's action code from the document rather than assuming X",
    () => {
      // The counterpart failure: a rule that matches the right tags but carries a
      // hard-coded action would look identical today, when all three family rows
      // happen to be X. Move one and the emitted rule must move with it.
      withMutatedDocBook(
        (xml) => {
          const row = overlayCommentsRow(xml);
          const at = row.indexOf(">X</para>");
          expect(at, "the Overlay Comments Basic Prof. cell must read X").toBeGreaterThan(-1);
          return xml.replace(
            row,
            row.slice(0, at) + ">K</para>" + row.slice(at + ">X</para>".length),
          );
        },
        (r) => {
          expect(r.stderr, r.stderr).toBe("");
          expect(r.code).toBe(0);
          const emitted = readFileSync(ARTIFACT, "utf8");
          expect(emitted).toContain(
            '{ pattern: "60xx4000", keyword: "Overlay Comments", basicProfile: "K"',
          );
        },
      );
      // ...and the committed artifact is back to the pinned document's answer.
      expect(readFileSync(ARTIFACT, "utf8")).toContain(
        '{ pattern: "60xx4000", keyword: "Overlay Comments", basicProfile: "X"',
      );
    },
    GENERATOR_TIMEOUT_MS,
  );

  it("prints how far the two E.3.6 date columns diverge under the collapse", () => {
    expect(happy.stdout).toMatch(
      /E\.3\.6 rows where full-dates and modified-dates columns differ: \d+/,
    );
  });

  it(
    "refuses to generate when the vendored DocBook is not the pinned bytes",
    () => {
      const original = readFileSync(NEMA_SHA_FILE, "utf8");
      const before = readFileSync(ARTIFACT, "utf8");
      try {
        // A well-formed SHA-256 that no file on disk hashes to: the shape check
        // passes and the content check is the one that has to catch it.
        writeFileSync(NEMA_SHA_FILE, `${"0".repeat(64)}\n`, "utf8");
        const r = runGenerator();
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/cannot read|pin mismatch/);
      } finally {
        writeFileSync(NEMA_SHA_FILE, original, "utf8");
      }
      // Nothing was emitted from an unverified input.
      expect(readFileSync(ARTIFACT, "utf8")).toBe(before);
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses when the file AT the pinned path is not the pinned bytes",
    () => {
      // The test above points SHA.txt at a hash nothing on disk hashes to, so the
      // run dies at readFileSync ("cannot read") and the CONTENT re-hash never
      // runs: delete the `actual !== pinnedSha` block and that test still passes.
      // Here SHA.txt is untouched and the file opens normally, so only the re-hash
      // can catch the swap. This table decides whether a patient identifier
      // survives `deidentify()`, and "the input was swapped and nobody noticed" is
      // the outcome the pin exists to make impossible, so the pin needs a test that
      // fails when it is removed.
      const pinned = readFileSync(NEMA_SHA_FILE, "utf8").trim().split(/\s+/)[0] ?? "";
      const path = join(NEMA_ROOT, pinned, "part15.xml");
      const original = readFileSync(path);
      const before = readFileSync(ARTIFACT, "utf8");
      try {
        // Same length, one byte different: only the content changes.
        const swapped = Buffer.from(original);
        const last = swapped.length - 1;
        swapped[last] = (swapped[last] ?? 0) ^ 0xff;
        // Assert the mutation landed: on an empty buffer this would be a silent
        // no-op and the test would pass having proved nothing.
        expect(swapped.equals(original), "the mutation must change the document").toBe(false);
        writeFileSync(path, swapped);
        const r = runGenerator();
        expect(r.code).not.toBe(0);
        expect(r.stderr).toContain("pin mismatch");
      } finally {
        writeFileSync(path, original);
      }
      // This writes over the document AT the pinned path rather than a pointer, so
      // it is the one shape whose restore has to be proved rather than assumed. In
      // the sandbox a failed restore costs the rest of this file and nothing else,
      // which is the whole point of the sandbox; keep the re-hash anyway, because a
      // silently half-restored document would make every later test in this file
      // read a standard nobody verified. Prove the restore by re-hashing.
      expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(pinned);
      expect(readFileSync(ARTIFACT, "utf8")).toBe(before);
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses a SHA.txt that is not a 64-char hex SHA-256",
    () => {
      const original = readFileSync(NEMA_SHA_FILE, "utf8");
      try {
        writeFileSync(NEMA_SHA_FILE, "RESERVED\n", "utf8");
        const r = runGenerator();
        expect(r.code).not.toBe(0);
        expect(r.stderr).toContain("64-char hex SHA-256");
      } finally {
        writeFileSync(NEMA_SHA_FILE, original, "utf8");
      }
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "still needs tsx, because Node will not resolve its .js specifier onto the .ts file",
    () => {
      // The reason `run-script.ts` carves this one script out, pinned rather than
      // asserted in a comment. It fails at module resolution, before it opens the
      // DocBook, so nothing is generated and nothing is restored. The day Node
      // resolves the specifier this reds, and the carve-out goes with it.
      const r = runRepoScript("generate-annex-e.ts", [], { root: sandbox.root, runner: "node" });
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("ERR_MODULE_NOT_FOUND");
      // Naming the specifier is what makes this a pin on the carve-out's REASON
      // rather than on "node happens to fail". The sibling generator imports
      // nothing from `src/`, which is why the carve-out is one script and not
      // "the generators"; it is not re-run here because this file has no claim to
      // make about it, and no longer because the two would collide - each suite
      // now writes into its own sandbox.
      expect(r.stderr).toContain("repeating-groups.js");
    },
    GENERATOR_TIMEOUT_MS,
  );
});

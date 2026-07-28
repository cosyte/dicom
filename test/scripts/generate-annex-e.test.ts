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
 * The generator is invoked via spawnSync (array args, no shell), like
 * `phi-scan.test.ts`. It writes `src/dictionary/generated/annex-e.ts`; the run
 * is deterministic, so the file is asserted byte-identical afterwards, which is
 * the local mirror of the CI regen gate.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const GENERATOR = join(REPO_ROOT, "scripts", "generate-annex-e.ts");
const ARTIFACT = join(REPO_ROOT, "src", "dictionary", "generated", "annex-e.ts");
const NEMA_SHA_FILE = join(REPO_ROOT, "vendor", "nema", "part15", "SHA.txt");

/** Spawning tsx and parsing 3.5 MB of DocBook does not fit the suite default. */
const GENERATOR_TIMEOUT_MS = 120_000;

function runGenerator(): { code: number; stdout: string; stderr: string } {
  const tsxBin = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsxBin, [GENERATOR], { cwd: REPO_ROOT, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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
  // here. A shared default tuned for in-memory fixtures would make it flaky.
  beforeAll(() => {
    artifactBefore = readFileSync(ARTIFACT, "utf8");
    happy = runGenerator();
    artifactAfter = readFileSync(ARTIFACT, "utf8");
  }, GENERATOR_TIMEOUT_MS);

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

  it("prints every family row it cannot key, rather than dropping them silently", () => {
    expect(happy.stdout).toContain("family tag rows not representable as exact tags: 4");
    for (const row of [
      "(50xx,xxxx)",
      "(60xx,3000)",
      "(60xx,4000)",
      "(gggg,eeee) where gggg is odd",
    ]) {
      expect(happy.stdout, row).toContain(row);
    }
  });

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
});

/**
 * AC-9: IF the vendored PS3.6 document does not hash to the value in
 * `vendor/nema/part06/SHA.txt` THEN `scripts/generate-dictionary.ts` exits non-zero
 * and leaves every committed generated artifact byte-identical.
 *
 * The dictionary decides which VR an Implicit VR element is read with and which
 * name a report prints, so "the input was swapped and nobody noticed" is the outcome
 * the pin exists to prevent. The pin can be broken from either side, and each test
 * below breaks it from one:
 *
 *   - the document AT the pinned path changes while `SHA.txt` stays put, and
 *   - `SHA.txt` moves while the document under the name it now gives is the committed
 *     one, so the file opens normally and only the content re-hash can refuse it.
 *
 * Each mutation is one the generator would turn into DIFFERENT output if it read it,
 * so the byte-identical assertion is live rather than true by construction: the first
 * moves a VR, the second moves the SHA-256 every generated header prints.
 *
 * 🛑 EVERY BYTE THIS FILE WRITES GOES INTO A SANDBOX, AND THE WORKING TREE IS READ ONLY.
 * `test/helpers/generator-sandbox.ts` carries the measurement and the reason; the
 * committed artifacts are read from the real tree as the baseline and never opened for
 * writing.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createGeneratorSandbox, REPO_ROOT, type Sandbox } from "../helpers/generator-sandbox.js";
import { runRepoScript, type ScriptResult } from "../helpers/run-script.js";

/** The committed artifacts, in the real tree. READ ONLY. */
const COMMITTED_GENERATED = join(REPO_ROOT, "src", "dictionary", "generated");

let sandbox: Sandbox;
let GENERATED: string;
let NEMA_ROOT: string;
let NEMA_SHA_FILE: string;

/** Per-test budget for the generator run and the sandbox copy, as in the sibling suites. */
const GENERATOR_TIMEOUT_MS = 120_000;

/** Imports nothing but node builtins, so it runs under `node` (see `run-script.ts`). */
function runGenerator(): ScriptResult {
  return runRepoScript("generate-dictionary.ts", [], { root: sandbox.root });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pinnedSha(): string {
  return readFileSync(NEMA_SHA_FILE, "utf8").trim().split(/\s+/)[0] ?? "";
}

/** Every file in a generated directory, by name. */
function snapshot(dir: string): Map<string, string> {
  return new Map(
    readdirSync(dir)
      .sort()
      .map((name) => [name, readFileSync(join(dir, name), "utf8")]),
  );
}

/** The sandbox's generated directory is still exactly the committed one. */
function expectCommittedArtifactsUnchanged(): void {
  const committed = snapshot(COMMITTED_GENERATED);
  const after = snapshot(GENERATED);
  expect([...after.keys()]).toEqual([...committed.keys()]);
  for (const [name, text] of committed) {
    expect(after.get(name) === text, `${name} must be byte-identical`).toBe(true);
  }
}

describe("generate-dictionary refuses an unverified PS3.6 document (AC-9)", () => {
  beforeAll(() => {
    sandbox = createGeneratorSandbox("dictionary");
    GENERATED = join(sandbox.root, "src", "dictionary", "generated");
    NEMA_ROOT = join(sandbox.root, "vendor", "nema", "part06");
    NEMA_SHA_FILE = join(NEMA_ROOT, "SHA.txt");
  }, GENERATOR_TIMEOUT_MS);

  afterAll(() => {
    // Optional-chained: a `beforeAll` that died before the assignment must not
    // bury its own error under a TypeError from here.
    sandbox?.dispose();
  });

  it(
    "AC-9: exits non-zero when the document at the pinned path is not the pinned bytes",
    () => {
      const pinned = pinnedSha();
      const path = join(NEMA_ROOT, pinned, "part06.xml");
      const original = readFileSync(path);
      const xml = original.toString("utf8");

      // Move (3004,007F)'s VR from LO to SH: a document the generator would turn
      // into a different tags.ts, if it read it.
      const at = xml.indexOf("(3004,007F)</para>");
      expect(at, "part06.xml must carry the (3004,007F) row").toBeGreaterThan(-1);
      const open = xml.lastIndexOf("<tr", at);
      const close = xml.indexOf("</tr>", at) + "</tr>".length;
      const row = xml.slice(open, close);
      expect(row.split(">LO</para>")).toHaveLength(2);
      const mutated = Buffer.from(
        xml.slice(0, open) + row.replace(">LO</para>", ">SH</para>") + xml.slice(close),
        "utf8",
      );
      expect(sha256(mutated)).not.toBe(pinned);

      let r: ScriptResult;
      try {
        writeFileSync(path, mutated);
        r = runGenerator();
      } finally {
        writeFileSync(path, original);
      }
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("pin mismatch");
      // This writes over the document at the pinned path, so the restore is proved
      // rather than assumed before anything below reads the sandbox.
      expect(sha256(readFileSync(path))).toBe(pinned);
      expectCommittedArtifactsUnchanged();
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "AC-9: exits non-zero when SHA.txt names a hash the document under that name does not have",
    () => {
      const originalSha = readFileSync(NEMA_SHA_FILE, "utf8");
      const pinned = pinnedSha();
      // A well-formed SHA-256 no document hashes to, with the committed document
      // placed under it: the shape check passes, the file opens, and only the
      // content re-hash stands between it and a header naming this hash.
      const named = "0".repeat(64);
      const namedDir = join(NEMA_ROOT, named);
      let r: ScriptResult;
      try {
        mkdirSync(namedDir, { recursive: true });
        cpSync(join(NEMA_ROOT, pinned, "part06.xml"), join(namedDir, "part06.xml"));
        writeFileSync(NEMA_SHA_FILE, `${named}\n`, "utf8");
        r = runGenerator();
      } finally {
        writeFileSync(NEMA_SHA_FILE, originalSha, "utf8");
        rmSync(namedDir, { recursive: true, force: true });
      }
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("pin mismatch");
      expectCommittedArtifactsUnchanged();
    },
    GENERATOR_TIMEOUT_MS,
  );
});

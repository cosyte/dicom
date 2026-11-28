/**
 * `runRepoScript` hands back a script's whole output. Under `spawnSync`'s default 1 MiB
 * `maxBuffer`, a script that printed more was killed, and the helper returned code -1 with its
 * output cut, which a caller read as the script failing.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runRepoScript } from "./run-script.js";

const BYTES = 2 * 1024 * 1024;
const root = mkdtempSync(join(tmpdir(), "dicom-run-script-"));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("runRepoScript", () => {
  it("returns more than 1 MiB of a script's output whole, with its exit code", () => {
    mkdirSync(join(root, "scripts"));
    writeFileSync(
      join(root, "scripts", "print.mjs"),
      `process.stdout.write("x".repeat(${String(BYTES)}));\n`,
    );
    const r = runRepoScript("print.mjs", [], { root });
    expect(r.code).toBe(0);
    expect(r.stdout.length).toBe(BYTES);
  });
});

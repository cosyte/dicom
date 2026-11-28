/**
 * `VERSION` is a public export, and `package.json#version` is the version npm publishes. The
 * `version` script rewrites it in `src/index.ts` from `package.json` after `changeset version`
 * (`cosyte-process sync-version`); this test is the guard that the two never drift apart.
 *
 * The module is imported inside the test body, after `vi.resetModules()`, and nothing in this file
 * imports `src/` at the top. `VERSION` is set once, when its module is first evaluated; a mutation
 * run links a mutant only to the tests running when its code runs, so a top-level import would
 * evaluate the constant before any test started and leave the mutant judged by none.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

function packageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  if (typeof manifest.version !== "string") {
    throw new TypeError("package.json has no string version");
  }
  return manifest.version;
}

describe("VERSION", () => {
  it("is the version in package.json, exported from the package entry point", async () => {
    vi.resetModules();
    const entry = await import("../src/index.js");
    expect(entry.VERSION).toBe(packageVersion());
  });
});

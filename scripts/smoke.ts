#!/usr/bin/env tsx
/**
 * Phase 1 Plan 05 smoke driver — D-22.
 *
 * Validates the built `dist/` artifacts by spawning two separate `node`
 * processes:
 *   - one running test/smoke/esm/index.mjs (ESM consumer)
 *   - one running test/smoke/cjs/index.cjs (CJS consumer)
 *
 * Each harness imports VERSION + Dictionary from dist/, asserts known lookups,
 * and exits 0 on success. This driver returns 0 only if both succeed.
 *
 * Pre-requisites: `pnpm build` must have run; dist/index.mjs, dist/index.cjs,
 * dist/index.d.ts must exist. The driver verifies these and exits with a useful
 * message if not.
 *
 * Subprocess model: `spawnSync` with array args + `shell: false` — no shell
 * interpolation, no PATH lookups beyond `node` (which is the host process's
 * own binary). Hardcoded relative paths only. (Threat T-01-05-08.)
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_ARTIFACTS = ["dist/index.mjs", "dist/index.cjs", "dist/index.d.ts"] as const;

for (const rel of REQUIRED_ARTIFACTS) {
  if (!existsSync(join(REPO_ROOT, rel))) {
    process.stderr.write(`[smoke] missing build artifact: ${rel}. Run 'pnpm build' first.\n`);
    process.exit(2);
  }
}

interface Harness {
  readonly label: "esm" | "cjs";
  readonly path: string;
}

const HARNESSES: readonly Harness[] = [
  { label: "esm", path: "test/smoke/esm/index.mjs" },
  { label: "cjs", path: "test/smoke/cjs/index.cjs" },
];

let failed = 0;
for (const h of HARNESSES) {
  const result = spawnSync("node", [h.path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    process.stderr.write(`[smoke:${h.label}] FAIL exit=${String(result.status ?? "null")}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    failed++;
    continue;
  }
  if (result.stdout) {
    process.stdout.write(result.stdout.trim() + "\n");
  }
}

if (failed > 0) {
  process.stderr.write(
    `[smoke] ${String(failed)}/${String(HARNESSES.length)} harness(es) failed.\n`,
  );
  process.exit(1);
}

process.stdout.write("[smoke] OK — both ESM and CJS harnesses passed.\n");

/**
 * Spawn one of this repo's own TypeScript scripts in a subprocess - internal test
 * utility, not exported from `src/index.ts`.
 *
 * THE RULE, STATED ONCE HERE SO IT IS NOT RESTATED AT EVERY CALL SITE: run them
 * under `node`, not `tsx`. Node strips types natively, so a `tsx` process start
 * buys nothing and is paid on every invocation. Measured on `scripts/phi-scan.ts`
 * invoked with NO arguments, the two runners interleaved, with byte-identical
 * stdout and the same exit code from both: `node` is the faster of the two, by a
 * wide enough margin to be visible in the suite's wall clock. NO RATIO IS QUOTED
 * HERE, deliberately - independent re-takes on one box do not agree with each
 * other, and the gap moves with the workload as well as with the box, `tsx`'s cost
 * being a fixed process start that amortises over whatever the script then does.
 * Re-measure on the script you care about rather than carrying a number to one
 * that runs longer.
 *
 * THE PRECONDITION, WHICH IS NARROWER THAN `package.json`'s: this needs a Node
 * that strips types with no flag. CI's matrix is `22` (latest) and `24`, and both
 * do; `engines` says `>=22.0.0`, which is broader, because it describes what the
 * PUBLISHED package runs on and no consumer runs this file. If these suites ever
 * fail with `Unknown file extension ".ts"`, the local Node is older than native
 * stripping, not broken - upgrade it rather than reaching for `tsx` here.
 *
 * THE ONE EXCEPTION, MEASURED RATHER THAN ASSUMED: `scripts/generate-annex-e.ts`
 * imports `"../src/dictionary/repeating-groups.js"`, and Node's ESM resolver does
 * not rewrite a `.js` specifier onto the `.ts` file TypeScript resolves it to.
 * Under `node` it exits 1 with `ERR_MODULE_NOT_FOUND` before reading a byte of
 * DocBook, so it stays on `tsx`. `generate-annex-e.test.ts` pins that failure, so
 * the exception goes red the day Node can resolve the specifier rather than
 * outliving its reason. Do not widen it to the other generators by analogy:
 * `scripts/generate-repeating-groups.ts` imports nothing from `src/` and was
 * measured green under `node` with byte-identical output.
 *
 * SECURITY: array args, `shell: false`. No exec, no shell-form.
 *
 * THE `root` OPTION, AND WHY IT IS NOT A `cwd`. Both generators resolve their own
 * repository root from `import.meta.url`, so pointing a run at a relocated copy of
 * the tree means running the COPY's script file, not this one with a different
 * working directory. `root` moves the script path; `cwd` moves only the child's
 * working directory, which neither generator reads. See
 * `test/helpers/generator-sandbox.ts` for what that relocation is for.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** `node` strips types natively; `tsx` is for the one script Node cannot resolve. */
export type ScriptRunner = "node" | "tsx";

export interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

const REPO_ROOT = join(import.meta.dirname, "..", "..");

export interface RunScriptOptions {
  /** Working directory for the child. Defaults to `root`. */
  cwd?: string;
  /** Defaults to `node`. See the header before setting this to `tsx`. */
  runner?: ScriptRunner;
  /**
   * Tree to run the script FROM. Defaults to this repository. Set it to a
   * `createGeneratorSandbox()` root to run a copy that no other worker can see.
   * The `tsx` binary is still taken from this repository's `node_modules`, which a
   * sandbox deliberately does not carry.
   */
  root?: string;
}

/**
 * Run `scripts/<name>` in a subprocess and hand back its exit code and streams.
 *
 * @param name - File name under `scripts/`, e.g. `"phi-scan.ts"`.
 * @param args - Arguments passed after the script path.
 */
export function runRepoScript(
  name: string,
  args: readonly string[] = [],
  options: RunScriptOptions = {},
): ScriptResult {
  const { root = REPO_ROOT, cwd = root, runner = "node" } = options;
  const bin = runner === "tsx" ? join(REPO_ROOT, "node_modules", ".bin", "tsx") : process.execPath;
  const r = spawnSync(bin, [join(root, "scripts", name), ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

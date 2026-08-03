#!/usr/bin/env node
/**
 * scripts/attw.mjs - the `attw` publish gate, made to report its own failure.
 *
 * Ported from `@cosyte/terminology`'s `scripts/attw.mjs` (terminology#28, `bf153cb`),
 * which is where this defect was diagnosed. THE CODE PORTS; THE MEASUREMENTS DO NOT.
 * Every figure and every claim below was re-taken on this repo, against this repo's
 * own `@arethetypeswrong/cli@0.18.4` and its own `tsup` build, in the slice that
 * added this file. Where a number differs from terminology's, it is because it was
 * measured here and not copied.
 *
 * WHY THIS WRAPPER EXISTS: `attw` PRINTS "This package does not contain types."
 * AND EXITS 0. That is not a bug in `attw`. An untyped package is a legitimate npm
 * package, so the CLI treats "no types at all" as a description rather than a
 * problem. From `node_modules/@arethetypeswrong/cli/dist/getExitCode.js`, first
 * statement of the function:
 *
 *     export function getExitCode(analysis, opts) {
 *         var _a, _b;
 *         if (!analysis.types) {
 *             return 0;
 *         }
 *
 * The problem list is consulted only after that early return, so no `--profile`,
 * `--ignore-rules` or config setting can reach it. For a package that ships types,
 * "does not contain types" does not mean "fine, untyped". It means THE TYPES WERE
 * NOT IN THE TARBALL, which is a broken publish. The gate said nothing, and its
 * caller read the 0.
 *
 * `pnpm attw` is a step in the shared `cosyte/.github` CI workflow and the last step
 * of this package's `prepublishOnly`, so an exit 0 here is what stands between an
 * untyped tarball and the registry. A false red costs an hour. A FALSE GREEN SHIPS.
 *
 * WHAT WAS MEASURED HERE, ON THIS PACKAGE, WITH NO CONCURRENCY OF ANY KIND. Both
 * states, on a quiet box, with the tree otherwise untouched:
 *
 *     rm -f dist/index.d.ts dist/index.d.cts && pnpm attw   -> untyped sentence, exit 0
 *     rm -rf dist && pnpm attw                              -> untyped sentence, exit 0
 *
 * THE RACE ONLY SUPPLIES THE CONDITION; IT IS NOT THE DEFECT. The first of those
 * two is the realistic one, because `tsup` emits the JS bundles in one pass and the
 * declaration files in a later pass. There is therefore a window in every build of
 * this package where `dist/` holds `index.mjs`/`index.cjs` and no `index.d.ts`.
 * Measured over three clean `pnpm build` runs on an idle box, polling `dist/` every
 * 25ms: `index.mjs` appears at +4.83s to +5.36s, `index.d.ts` at +6.06s to +6.49s,
 * leaving a window of 1.06s, 1.23s and 1.43s. Under CPU contention it is wider (3.10s
 * on one run taken while a busy-wait loop competed for the same 2-CPU quota). A
 * concurrent build or `pnpm clean` in the same working tree lands `attw` in that
 * window. Which is why this is NOT answered with a lock or a build queue: the gate
 * is supposed to be able to tell you its own inputs were missing, whatever removed
 * them, and a lock would leave the defect intact on an idle box.
 *
 * TWO NETS, and they catch different things. Keep both:
 *
 *   1. PREFLIGHT (structural, no string matching). Every relative artifact path
 *      `package.json` promises - `main`, `module`, `types`, `typings`, and every
 *      string leaf of `exports` - must exist and be non-empty before `attw` runs.
 *      On this package that is `./dist/index.cjs`, `./dist/index.mjs`,
 *      `./dist/index.d.ts` and `./dist/index.d.cts`. This is the net that catches
 *      the build window above, and it names the missing file instead of leaving the
 *      reader to infer it from a sentence about types.
 *
 *   2. POST-CHECK. If `attw` still reports an untyped package, fail. The preflight
 *      structurally cannot see this case: the declaration files can be present on
 *      disk and still be absent from the tarball, because `files` (or `.npmignore`)
 *      left them out. No instance of that is on record in this repo. It is the case
 *      `attw --pack` exists to catch, and the whole point here is that it catches it
 *      silently.
 *
 *   Neither net covers everything `files` promises. `package.json#files` also lists
 *   `README.md`, `LICENSE`, `TRADEMARKS.md` and `CHANGELOG.md`; `attw` analyses
 *   types and never looks at them, and the preflight only walks the entry points, so
 *   a missing one of those is not caught here by either net. Said plainly rather than
 *   left to be discovered.
 *
 *   The post-check matches `attw`'s untyped sentence, which is a plain, un-chalked
 *   string built in `dist/render/untyped.js`. That makes it blindable, so the
 *   arguments and config that would blind it are REFUSED rather than tolerated. See
 *   BLINDING below. `test/scripts/attw-gate.test.ts` pins both nets against the real
 *   binary, so if an `attw` upgrade reworks the wording or fixes the exit code, the
 *   suite reds and tells you to revisit this file rather than letting the net go
 *   quietly slack.
 *
 * BLINDING. Every route below was measured HERE, on a fixture package whose tarball
 * genuinely carries no types, and each one restores the exact false green by making
 * the untyped sentence absent from what this script can read:
 *
 *     --quiet                 exit 0, sentence absent
 *     -q                      exit 0, sentence absent
 *     --format json           exit 0, sentence absent
 *     -f json                 exit 0, sentence absent
 *     --format=json           exit 0, sentence absent
 *     -fjson                  exit 0, sentence absent   (attached short value)
 *     -qf json                exit 0, sentence absent   (combined short cluster)
 *     -Pfjson                 exit 0, sentence absent   (cluster + attached value)
 *     .attw.json {"quiet"}    exit 0, sentence absent
 *     .attw.json {"format"}   exit 0, sentence absent
 *     --config-path <file>    exit 0, sentence absent
 *
 * `--config-path` is the difference from terminology's copy, which refused it by
 * inference and said so. Measured here: pointing it at a file that sets `quiet`
 * blinds the post-check exactly like an in-tree `.attw.json` does. `readConfig()`
 * applies config after argv, and reads `.attw.json` from the working directory unless
 * `--config-path` names another file, so those are the only two config routes.
 *
 * THE LAST THREE ARE WHY THE PREDICATE IS NOT AN EXACT-TOKEN SET, and a first draft
 * of this file got that wrong. It matched `a.split("=")[0]` against a set of exact
 * spellings, which `-fjson` walks straight past: commander lets a short option's value
 * attach to it and lets shorts combine, so `-f`'s presence is not visible in the whole
 * token. Measured on that draft, on the untyped fixture: `-fjson` gave exit 0 with the
 * gate silent. So a single-dash argument is now refused if ANY character in its cluster
 * is `q` or `f`. `-f` is attw's only value-taking short option, so a `q` or `f`
 * anywhere in a cluster means the flag itself is there.
 *
 * The refusal is BY OPTION, NOT BY VALUE, and it is deliberately over-strict.
 * Measured here: `--format table-flipped` and `--format ascii` both still print the
 * sentence and blind nothing, and both are refused anyway. Value-parsing these would
 * be a third moving part in the guard, and being over-strict about an argument nobody
 * passes to a repo's own publish gate costs less than a route back to a false green.
 * The over-strictness is bounded and stated rather than open-ended: it costs `-q`,
 * `-f`, `--quiet`, `--format`, `--config-path` and any single-dash cluster containing
 * `q` or `f`. Nothing else is refused.
 *
 * NOT ROUTES, measured rather than assumed, because each looks like one:
 * `--form json` and `--quiet=true` and `-f=json` are all rejected by commander itself
 * with exit 1 (no option-name abbreviation, no `=` on a boolean, no `=` on an attached
 * short value), so none reaches the analysis. And a forwarded extra positional
 * (`node scripts/attw.mjs ../other`) does NOT retarget the run: `--pack .` supplies
 * the first positional and attw ignores the second, so the analysis stays on this
 * package and the preflight it was paired with is still the right one.
 *
 * Other arguments are forwarded, so `--profile node16` and friends still work. That
 * is what lets `typecheck:exports` run through this wrapper too, and what lets the
 * test suite stay offline with `--no-definitely-typed`.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ATTW_BIN = fileURLToPath(new URL("../node_modules/.bin/attw", import.meta.url));
const UNTYPED = "This package does not contain types.";
const DECLARATION = /\.d\.[cm]?ts$/;
const args = process.argv.slice(2);

const die = (msg) => {
  process.stderr.write(`\n✗ attw gate: ${msg}\n`);
  process.exit(1);
};

// ---- Refuse what would blind the post-check --------------------------------
// See BLINDING in the header. A long option is matched on its name, before any `=`.
// A single-dash argument is a CLUSTER, because commander lets shorts combine and lets
// a value attach (`-qf json`, `-fjson`, `-Pfjson`), so matching the whole token would
// miss it. `-f` is attw's only value-taking short, so a `q` or `f` anywhere in the
// cluster means the flag itself is present.
const BLINDING_LONG = new Set(["--quiet", "--format", "--config-path"]);
const BLINDING_SHORT = new Set(["q", "f"]);
const blinds = (a) =>
  a.startsWith("--")
    ? BLINDING_LONG.has(a.split("=")[0])
    : a.startsWith("-") && a.length > 1 && [...a.slice(1)].some((c) => BLINDING_SHORT.has(c));
const blinding = args.filter(blinds);
if (blinding.length > 0) {
  die(
    `${blinding.join(", ")} is refused by option and not by value.\n` +
      `  This gate reads attw's printed output, attw exits 0 on an untyped package,\n` +
      `  and some values of these options hide that output. Run it without them.`,
  );
}
try {
  const config = JSON.parse(readFileSync(".attw.json", "utf8"));
  const set = ["quiet", "format"].filter((k) => k in config);
  if (set.length > 0) {
    die(
      `.attw.json sets ${set.join(", ")}. These keys are refused wholesale, by name and\n` +
        `  not by value: readConfig() applies them after argv, this gate reads attw's\n` +
        `  printed output, and attw exits 0 on an untyped package.`,
    );
  }
} catch {
  // No .attw.json, or unreadable/invalid. attw itself reports the latter.
}

/** Every relative path `package.json` promises to ship, deduped. */
function declaredArtifacts(pkg) {
  const found = new Set();
  const add = (v) => {
    if (typeof v !== "string") return;
    // Skip wildcard subpath patterns (they name a set, not a file) and the
    // manifest itself, which is always in the tarball by definition.
    if (!v.startsWith(".") || v.includes("*") || v === "./package.json") return;
    found.add(v);
  };
  for (const key of ["main", "module", "types", "typings"]) add(pkg[key]);
  const walk = (node) => {
    if (typeof node === "string") add(node);
    else if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  };
  walk(pkg.exports);
  return [...found];
}

let pkg;
try {
  pkg = JSON.parse(readFileSync("package.json", "utf8"));
} catch (err) {
  die(`cannot read ./package.json from ${process.cwd()} - ${err.message}`);
}

// ---- Net 1: preflight -------------------------------------------------------
const broken = [];
for (const rel of declaredArtifacts(pkg)) {
  let size;
  try {
    size = statSync(rel).size;
  } catch {
    broken.push({ rel, why: "missing" });
    continue;
  }
  if (size === 0) broken.push({ rel, why: "empty" });
}
if (broken.length > 0) {
  // Only claim the exit-0 counterfactual when a DECLARATION file is among the
  // casualties. With the declarations intact and only JS missing, attw reports
  // no problems at all and still exits 0: a different silence, not this one.
  const declarationsHit = broken.some(({ rel }) => DECLARATION.test(rel));
  die(
    `package.json promises files the build has not produced:\n` +
      broken.map(({ rel, why }) => `    ${rel} (${why})\n`).join("") +
      `\n  Run the build first. If you DID build, something removed or truncated the\n` +
      `  output underneath this run. A concurrent build or \`clean\` in the same working\n` +
      `  tree will do it, and \`tsup\` writes JS before declarations, so there is a\n` +
      `  window (measured here at 1.06s to 1.43s on an idle box) where the .d.ts files\n` +
      `  do not exist yet.\n` +
      (declarationsHit
        ? `  attw would have reported "${UNTYPED}" and EXITED 0 on this tree.\n`
        : `  attw does not gate these: it analyses types, and exits 0 here.\n`),
  );
}

// ---- Run attw ---------------------------------------------------------------
const res = spawnSync(ATTW_BIN, ["--pack", ".", ...args], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
if (res.error) die(`could not run ${ATTW_BIN} - ${res.error.message}`);
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
process.stdout.write(res.stdout ?? "");
process.stderr.write(res.stderr ?? "");
if (res.status !== 0) process.exit(res.status ?? 1);

// ---- Net 2: post-check ------------------------------------------------------
// An empty transcript means the post-check read nothing, by some route not listed
// under BLINDING above. Treat that as a failure rather than as a pass: this gate
// is only as good as the output it got to see.
if (output.trim() === "") {
  die(`attw exited 0 but printed nothing, so nothing was checked.`);
}
if (output.includes(UNTYPED)) {
  die(
    `attw reported "${UNTYPED}" and exited 0.\n` +
      `  This package ships types, so that means the tarball did not carry them.\n` +
      `  Check the "files" field and .npmignore. Reported as a failure here because\n` +
      `  attw's own exit code cannot: getExitCode() returns 0 whenever the analysis\n` +
      `  found no types at all, before it ever looks at the problem list.`,
  );
}

import { readFileSync } from "node:fs";

import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/dicom from the shared @cosyte/vitest-config standard.
 *
 * The shared default gates every measured `src/**` file at >= 90 (lines/branches/functions/
 * statements); `coverageDirs` adds an explicit per-directory gate on each source directory.
 * Generated code (`src/dictionary/generated/**`) and barrels are excluded by the shared config,
 * which tells a barrel (nothing but re-exports) from code by reading each file, so an `index.ts`
 * that holds code of its own, such as `src/parser/index.ts`, is measured.
 *
 * THE COVERAGE FLOOR IS `quality-floor.json`, read below, and nowhere else: 100 on lines, branches,
 * functions and statements, for the whole of `src/` and for each directory in `COVERAGE_DIRS`. The
 * same file holds the mutation score, and `pnpm quality:check` (`cosyte-ratchet`, CI's
 * `coverage-ratchet` job) holds the measured coverage to it. A floor only rises, so a change that
 * adds a line or a branch must add the test that reaches it. A line no input can reach carries an
 * inline `v8 ignore` comment that names its reason (a re-throw of an error the call cannot raise, a
 * fallback the noUncheckedIndexedAccess types require, a guard its caller already enforces); add
 * one only with that reason, and never to make a reachable line pass, nor a lower number in the
 * file.
 *
 * `hookTimeout` IS ABSENT DELIBERATELY (2026-08-03, `PARSER-TESTTIMEOUT-ASSERTS-AN-IDLE-BOX`). The
 * line that used to sit under `testTimeout` set it to exactly Vitest's own default, measured rather
 * than read: on this repository's Vitest, a `beforeAll` that sleeps past it reds at "Hook timed out
 * in 10000ms" with no configuration at all. It was verbatim the default and said nothing, so it is
 * gone rather than restated. Do not re-add it to document the default; the one hook that genuinely
 * needs more (`docs-content.test.ts`, which shells out to `pnpm build`) already passes its own
 * budget at the call site, which is where a real exception belongs.
 *
 * `testTimeout` below is UNCHANGED and is the global backstop. Do not raise it to accommodate one
 * slow test: it also governs several hundred fast ones, so raising it buys the slow test headroom
 * by handing the same headroom to all of them, trading a false red for a false green. Give the slow
 * test its own budget instead, as a third argument to `it` or to its `describe`, the way the two
 * generator suites already do.
 *
 * A hand-rolled `expect(performance.now() - started).toBeLessThan(N)` is an assertion about the
 * machine rather than about the code, and this suite still carries several. They are NOT enumerated
 * here and no command for finding them is given: both were tried and both were wrong, because the
 * shapes vary (one is a bare `>` against a budget constant, not a matcher). The rule is what
 * generalises, so measure the one in front of you under the load you actually run rather than
 * trusting its headroom.
 */
const COVERAGE_DIRS = [
  "parser",
  "dataset",
  "dictionary",
  "serialize",
  "profiles",
  "deident",
  "arbitraries",
];

/** The four coverage metrics the floor file holds. */
interface CoverageFloor {
  readonly lines: number;
  readonly branches: number;
  readonly functions: number;
  readonly statements: number;
}

/**
 * The coverage floor for every metric, read from `quality-floor.json`. A file without all four
 * metrics is refused, so a typo there cannot fall back to the shared 90.
 */
function readCoverageFloor(): CoverageFloor {
  const file = JSON.parse(
    readFileSync(new URL("./quality-floor.json", import.meta.url), "utf8"),
  ) as { packages?: Record<string, { coverage?: Partial<CoverageFloor> }> };
  const { lines, branches, functions, statements } = file.packages?.["."]?.coverage ?? {};
  const floor = { lines, branches, functions, statements };
  for (const [metric, value] of Object.entries(floor)) {
    if (typeof value !== "number" || value < 0 || value > 100) {
      throw new Error(`quality-floor.json: the coverage floor for ${metric} is not a score`);
    }
  }
  return floor as CoverageFloor;
}

/** The floor for every metric, globally and per directory. */
const FLOOR = readCoverageFloor();

export default cosyteVitest({
  coverageDirs: COVERAGE_DIRS,
  coverageThresholds: {
    ...FLOOR,
    ...Object.fromEntries(COVERAGE_DIRS.map((dir) => [`src/${dir}/**`, { ...FLOOR }])),
  },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**", "vendor/**", "test/smoke/**"],
    // `hookTimeout` is absent deliberately; read the block above `export default`
    // before adding it back or before raising this line.
    testTimeout: 10_000,
    passWithNoTests: true,
  },
});

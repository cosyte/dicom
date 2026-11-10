import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/dicom from the shared @cosyte/vitest-config standard.
 *
 * The shared default gates every measured `src/**` file at >= 90 (lines/branches/functions/
 * statements); `coverageDirs` adds an explicit per-directory gate on each source directory.
 * Generated code (`src/dictionary/generated/**`) and barrels (`**\/index.ts`) are excluded by the
 * shared config, so the dictionary gate covers only the hand-written modules beside them.
 *
 * Every gate here is 100, globally and per directory, which is what the suite measures: lines 100
 * / branches 100 / functions 100 / statements 100. A floor only rises, so a change that adds a line
 * or a branch must add the test that reaches it. A line no input can reach carries an inline
 * `v8 ignore` comment that names its reason (a re-throw of an error the call cannot raise, a
 * fallback the noUncheckedIndexedAccess types require, a guard its caller already enforces); add
 * one only with that reason, and never to make a reachable line pass. These numbers sit above the
 * shared default and are the floor for this repository whatever the shared ratchet starts at.
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
export default cosyteVitest({
  coverageDirs: ["parser", "dataset", "dictionary", "serialize", "profiles", "deident"],
  coverageThresholds: {
    lines: 100,
    branches: 100,
    functions: 100,
    statements: 100,
    "src/parser/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
    "src/dataset/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
    "src/dictionary/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
    "src/serialize/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
    "src/profiles/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
    "src/deident/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
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

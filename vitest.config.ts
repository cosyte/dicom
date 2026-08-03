import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/dicom from the shared @cosyte/vitest-config standard.
 *
 * The shared default gates every measured `src/**` file at >= 90 (lines/branches/functions/
 * statements); `coverageDirs` adds an explicit per-directory gate on parser/dataset/dictionary.
 * Generated code (`src/dictionary/generated/**`) and barrels (`**\/index.ts`) are excluded by the
 * shared config, so the dictionary gate covers only the hand-written `annex-e.ts` lookup.
 *
 * The early-phase TRANSIENT relaxations (a few points under 90 while the test layer filled in) have
 * been retired: a targeted branch/edge-case pass over the core parse paths (implicit-LE / explicit-LE
 * SQ descent + CP-246 + copy semantics, File Meta group-length recovery + long-form OB + truncation,
 * encapsulated-PD bounds, private-creator block reuse) brought every gated dir to the canonical 90,
 * and a DICOM-COV pass over the Phase 4 Enhanced multi-frame resolver (`functional-groups.ts`) closed
 * its Per-Frame-else-Shared branches: both optional macros (Pixel Value Transformation / Frame VOI
 * LUT), shared-only resolution, the inner-attribute lenient-absence paths, and all three
 * MISSING_REQUIRED_FUNCTIONAL_GROUP throws - taking that file from ~53% to 100% branch. Measured at
 * this pass:
 *   - global:         lines 98.2 / branches 93.2 / funcs 100 / statements 97.9
 *   - src/parser:     lines 97.1 / branches 90.2 / funcs 100 / statements 96.3
 *   - src/dataset/helpers: lines 100 / branches 97.1 / funcs 100 / statements 100
 *   - src/dataset/vr:      lines 97.6 / branches 93.7 / funcs 100 / statements 97.5
 *   - src/dictionary: 100 across the board (only annex-e.ts is measured)
 *
 * NOTE: parser branch coverage sits right at the 90 boundary (287/318). The remaining uncovered
 * branches are defensive `throw err` re-throws (the non-RangeError arm of cursor try/catch blocks)
 * plus two Node-version-fallback arms in deflated-le.ts - not cheaply reachable. A change that adds
 * a new parser branch must add a covering test or the gate goes red; that is the intended behavior.
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
 * test its own budget instead, as a third argument to `it` or to its `describe`, the way
 * `attw-gate` and the two generator suites already do.
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
    lines: 90,
    branches: 90,
    functions: 90,
    statements: 90,
    "src/parser/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/dataset/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/dictionary/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/serialize/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/profiles/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/deident/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
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

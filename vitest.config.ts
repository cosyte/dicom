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
 * encapsulated-PD bounds, private-creator block reuse) brought every gated dir to the canonical 90.
 * Measured at this pass:
 *   - global:         lines 97.1 / branches 90.4 / funcs 100 / statements 96.3
 *   - src/parser:     lines 96.9 / branches 90.2 / funcs 100 / statements 96.1
 *   - src/dataset:    100 across the board
 *   - src/dictionary: 100 across the board (only annex-e.ts is measured)
 *
 * NOTE: parser branch coverage sits right at the 90 boundary (287/318). The remaining uncovered
 * branches are defensive `throw err` re-throws (the non-RangeError arm of cursor try/catch blocks)
 * plus two Node-version-fallback arms in deflated-le.ts — not cheaply reachable. A change that adds
 * a new parser branch must add a covering test or the gate goes red; that is the intended behavior.
 */
export default cosyteVitest({
  coverageDirs: ["parser", "dataset", "dictionary"],
  coverageThresholds: {
    lines: 90,
    branches: 90,
    functions: 90,
    statements: 90,
    "src/parser/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/dataset/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/dictionary/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**", "vendor/**", "test/smoke/**"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    passWithNoTests: true,
  },
});

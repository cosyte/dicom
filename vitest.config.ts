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
 * MISSING_REQUIRED_FUNCTIONAL_GROUP throws — taking that file from ~53% to 100% branch. Measured at
 * this pass:
 *   - global:         lines 98.2 / branches 93.2 / funcs 100 / statements 97.9
 *   - src/parser:     lines 97.1 / branches 90.2 / funcs 100 / statements 96.3
 *   - src/dataset/helpers: lines 100 / branches 97.1 / funcs 100 / statements 100
 *   - src/dataset/vr:      lines 97.6 / branches 93.7 / funcs 100 / statements 97.5
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

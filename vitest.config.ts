import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @cosyte/dicom.
 *
 * Phase 1 ships a minimal test surface (Dictionary lookup unit tests in plan 02
 * + the smoke harness in plan 05). Coverage runs in CI for visibility but does
 * not gate builds in Phase 1 — the >= 90% per-directory gate is a Phase 8
 * deliverable per CLAUDE.md and ROADMAP.md (TEST-01).
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**", "vendor/**", "test/smoke/**"],
    reporters: ["default"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/index.ts",
        "src/**/*.d.ts",
        "src/dictionary/generated/**",
      ],
    },
  },
});

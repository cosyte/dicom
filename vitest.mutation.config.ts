import type { ViteUserConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

import shared from "./vitest.config.js";

const config = shared as ViteUserConfig;

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts`, without the files that cannot judge a mutant, or cannot judge one quickly.
 *
 * StrykerJS mutates `src/` inside a sandbox and switches each mutant on in the test process, so a
 * test only kills a mutant when it runs the source in that process. The files left out below do
 * not, or they judge something a mutant cannot change:
 *
 * - `test/perf/`: the scaling gates (`pnpm test:perf`, their own CI job) and the bench shapes read
 *   a clock or build large files; under instrumentation they would measure the mutant switches.
 * - The fuzz targets (`test/property/*-fuzz.property.test.ts`): each case is held to a CPU-time
 *   budget, so a mutant that slows a path fails them on time rather than on what the code returns.
 *   The lenient, round-trip and immutability properties beside them stay in.
 * - `test/scripts/`, `test/ci/`, `test/helpers/run-script.test.ts` and
 *   `test/integration/phi-scan-regex-statics.test.ts`: this repository's own tooling (the PHI
 *   scan, the generators, the changelog, the workflows), most of it in a child process.
 * - `test/docs-content.test.ts` builds `dist/` and runs the docs samples against it, which is
 *   built from the plain sources; `test/docs/`, `test/docs-content-structure.test.ts` and
 *   `test/install-specifier.test.ts` hold the documentation's prose, citations and structure.
 *
 * `pnpm test` runs every one of them on each pull request. One test inside the suite reads a source
 * file as text, the host-timezone scan in `test/conversion-surface.test.ts`; it is skipped here
 * through `DICOM_MUTATION_RUN`, since the text it would read is StrykerJS's instrumented copy.
 *
 * Every property runs from one fixed seed at the pull request depth of 100 cases
 * (`COSYTE_PROPERTY_SEED` and `COSYTE_PROPERTY_RUNS`, read by `test/helpers/property.ts`), and
 * every other `fast-check` run from a fixed global seed (`test/helpers/mutation-seed.ts`): a fresh
 * seed would let a mutant that only some cases reach be killed on one run and survive the next,
 * which moves a full score the ratchet compares exactly.
 *
 * The instrumented code runs several times slower than the plain build, so a test's budget here is
 * 60 s rather than 10 s. StrykerJS sets each mutant's own timeout from the time the test took in its
 * first run (`stryker.config.mjs`), so this budget does not slow the mutant runs.
 */
const mutation: ViteUserConfig = {
  ...config,
  test: {
    ...config.test,
    exclude: [
      ...(config.test?.exclude ?? configDefaults.exclude),
      "test/perf/**",
      "test/property/*-fuzz.property.test.ts",
      "test/scripts/**",
      "test/ci/**",
      "test/helpers/run-script.test.ts",
      "test/integration/phi-scan-regex-statics.test.ts",
      "test/docs-content.test.ts",
      "test/docs/**",
      "test/docs-content-structure.test.ts",
      "test/install-specifier.test.ts",
    ],
    setupFiles: ["test/helpers/mutation-seed.ts"],
    env: {
      ...config.test?.env,
      DICOM_MUTATION_RUN: "1",
      COSYTE_PROPERTY_SEED: "424242",
      COSYTE_PROPERTY_RUNS: "100",
    },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
};

export default mutation;

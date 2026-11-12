import { cosyteStryker } from "@cosyte/vitest-config/stryker";

// Mutation testing for @cosyte/dicom, on the shared StrykerJS config: per-test coverage, static
// mutants ignored, the JSON report at reports/mutation/mutation.json, and no score threshold of its
// own (quality-floor.json decides).
//
//   pnpm mutate:full                           every source file; its score is the floor's
//   pnpm mutate changed --base origin/main     only the source files a change touched
//   pnpm quality:mutation [--base origin/main] the score against quality-floor.json
//
// The files mutated are the shared default: every `.ts` file under `src/` but declarations,
// fixtures, the generated dictionary under `src/dictionary/generated/`, and the barrels the shared
// config finds by reading `src/` (an `index.ts` that holds code of its own, such as
// `src/parser/index.ts`, is mutated).
export default cosyteStryker({
  // The suite without the tests that cannot judge a mutant (see that file).
  vitestConfig: "vitest.mutation.config.ts",
  stryker: {
    // A mutant times out when a test takes longer than timeoutFactor times its first, unmutated
    // run plus timeoutMS. At StrykerJS's defaults (1.5 and 5,000 ms) a mutant near that line can be
    // a timeout on one run and a survivor on the next, which moves a full score the ratchet
    // compares exactly. A wider margin lets a slow mutant that still finishes finish every time, so
    // only a mutant that never ends times out.
    timeoutFactor: 3,
    timeoutMS: 10_000,
  },
});

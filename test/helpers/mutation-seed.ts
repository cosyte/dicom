/**
 * The global `fast-check` seed of a mutation run, loaded by `vitest.mutation.config.ts` only. A
 * `fc.assert` that names no seed of its own then draws the same cases on every run, so a mutant
 * that only some cases reach is judged the same way each time. `pnpm test` does not load it.
 */
import fc from "fast-check";

fc.configureGlobal({ seed: 424_242 });

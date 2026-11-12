/**
 * How the standard properties run (round trip, lenient, immutability): at the shared depth, from
 * a seed printed first.
 *
 * - **Depth.** The shared runner in `@cosyte/test-utils` reads `COSYTE_PROPERTY_RUNS`: unset, a
 *   property runs 100 cases (a pull request); `.github/workflows/nightly-properties.yml` sets
 *   10,000.
 * - **Seed.** `COSYTE_PROPERTY_SEED` replays one seed, and `COSYTE_PROPERTY_PATH` one failing case
 *   of it, already shrunk. Unset, a fresh seed is drawn. Either way the seed and the depth are
 *   printed before the property runs, so a run that hangs or dies still names its seed, and a
 *   failure prints the seed and the path again beside fast-check's report.
 *
 * A property passes no case count of its own, so the environment decides the depth of each one.
 * The fuzz targets (`*-fuzz.property.test.ts`) keep their own budget in `_fuzz-config.ts`.
 */

import { assertProperty, PROPERTY_ENV, resolvePropertyRun } from "@cosyte/test-utils";
import type fc from "fast-check";

/** A fresh 32-bit seed, for a run that names none. */
function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

/**
 * The seed and depth a property runs at: `COSYTE_PROPERTY_SEED` when set, a fresh seed otherwise,
 * printed with the depth before the run.
 *
 * @param name - The property's name, which leads the printed line.
 * @returns The seed and the resolved depth.
 */
export function propertyRun(name: string): { readonly seed: number; readonly numRuns: number } {
  const run = resolvePropertyRun({});
  const seed = run.seed ?? freshSeed();
  process.stdout.write(
    `[property] ${name}: ${PROPERTY_ENV.seed}=${String(seed)} ${PROPERTY_ENV.runs}=${String(run.numRuns)}\n`,
  );
  return { seed, numRuns: run.numRuns };
}

/**
 * Run a fast-check property at the shared depth from a printed seed, and throw a replayable error
 * naming the seed and the path when it fails.
 *
 * @param name - The property's name.
 * @param property - The property.
 */
export function checkProperty<Ts>(name: string, property: fc.IProperty<Ts>): void {
  const { seed } = propertyRun(name);
  assertProperty(name, property, { seed });
}

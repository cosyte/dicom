// Types for bench/dicom.bench.mjs, so the scaling gate under test/perf reads tags the way the
// benchmarks do.

import type { Dataset } from "../src/index.js";

/**
 * Read every tag of a Dataset: the four domain views, then the decoded value of every element at
 * every depth. Returns how many values it read.
 */
export declare function readTags(ds: Dataset): number;

/** The suite: every benchmark by its exact name, and every size by its exact label. */
declare const suite: {
  readonly name: string;
  readonly benchmarks: readonly {
    readonly name: string;
    readonly sizes: readonly { readonly label: string }[];
  }[];
};
export default suite;

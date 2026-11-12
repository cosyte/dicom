import { cosyteTsup } from "@cosyte/tsup-config";

/**
 * tsup build for @cosyte/dicom - dual ESM + CJS + `.d.ts`/`.d.cts` from the shared
 * @cosyte/tsup-config standard (ES2023, Node platform, `.mjs`/`.cjs` out-extensions).
 * Matches the per-condition `exports` map in package.json.
 *
 * Two entry points. `arbitraries` (the `@cosyte/dicom/arbitraries` subpath) holds the fast-check
 * generators and their own small Part 10 writer; it imports only types from the library, so the
 * two entries share no code at run time. `fast-check` is the subpath's optional peer dependency and
 * stays external; nothing `src/index.ts` reaches imports it.
 */
export default cosyteTsup({
  entry: { index: "src/index.ts", arbitraries: "src/arbitraries/index.ts" },
  external: ["fast-check"],
});

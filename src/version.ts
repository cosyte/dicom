/**
 * Package version string for `@cosyte/dicom`. Synchronized with `package.json#version`
 * via the build process (tsup) at publish time.
 *
 * Stays on the uniform `0.0.x`-until-first-alpha ladder (locked across the `@cosyte/*` suite):
 * patch bumps via Changesets through pre-alpha, with no `0.1.0` milestone bump. dicom is also
 * `private: true` and not yet published to npm.
 *
 * @example
 *   import { VERSION } from "@cosyte/dicom";
 *   console.log(`@cosyte/dicom v${VERSION}`);
 */
export const VERSION = "0.0.0" as const;

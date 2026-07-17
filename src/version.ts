/**
 * Package version string for `@cosyte/dicom`. Synchronized with `package.json#version` by
 * `scripts/sync-version.mjs`, which the `version` script runs after `changeset version`
 * so the bump and this constant land in the same "Version Packages" commit.
 *
 * Stays on the uniform `0.0.x`-until-first-alpha ladder (locked across the `@cosyte/*` suite):
 * patch bumps via Changesets through pre-alpha, with no `0.1.0` milestone bump.
 *
 * @example
 *   import { VERSION } from "@cosyte/dicom";
 *   console.log(`@cosyte/dicom v${VERSION}`);
 */
export const VERSION: string = "0.0.1";

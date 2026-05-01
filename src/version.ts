/**
 * Package version string for `@cosyte/dicom`. Synchronized with `package.json#version`
 * via the build process (tsup) at publish time.
 *
 * Plan 01-01 ships `0.0.0` as the placeholder; the version bumps to `0.1.0` only at the
 * Phase 8 release candidate boundary.
 *
 * @example
 *   import { VERSION } from "@cosyte/dicom";
 *   console.log(`@cosyte/dicom v${VERSION}`);
 */
export const VERSION = "0.0.0" as const;

/**
 * `@cosyte/dicom` — developer-focused DICOM Part 10 parser + utility library.
 *
 * Phase 1 public surface (per `.planning/phases/01-project-foundation/01-CONTEXT.md` D-10 & D-27):
 *  - `VERSION` — package version constant.
 *  - `Dictionary` namespace — Part 6 + UID + Annex E lookups (added by plan 01-02 + 01-03).
 *
 * Subsequent phases extend this surface. See `.planning/ROADMAP.md`.
 */

export { VERSION } from "./version.js";

// PLAN-02-INSERTION-POINT: Dictionary namespace re-export.
export * as Dictionary from "./dictionary/index.js";

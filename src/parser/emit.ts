/**
 * Single chokepoint for Tier-2 warning emission.
 *
 * Phase 2 core-parser context:
 *   - D-03 — Push order: warning is appended to `ctx.warnings` BEFORE the
 *     `onWarning` callback fires. The callback observes the warning
 *     already present in `ctx.warnings.length`.
 *   - D-11 — Every Tier-2 emission flows through this one function. No
 *     per-call-site `if (ctx.strict) throw` checks anywhere else in the
 *     parser tree.
 *   - D-35 — Strict-mode escalation: when `ctx.strict === true` the
 *     closure throws `DicomParseError` carrying the warning code (cast
 *     through `as unknown as FatalCode` per the HL7 sibling Plan 06
 *     decision (b)). Strict mode bypasses `ctx.warnings` entirely — no
 *     residue.
 *
 * Threat model T-02-01-02: a consumer-supplied `onWarning` that throws
 * MUST NOT corrupt parser state — wrapped in try/catch with silent swallow.
 *
 * @module
 */

import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";
import { DicomParseError, buildSnippet, type FatalCode } from "./errors.js";

/**
 * Build the per-context Tier-2 emission chokepoint.
 *
 * Lenient (`ctx.strict === false`): push warning into `ctx.warnings`
 * FIRST (D-03 ordering), then invoke `ctx.onWarning` (if defined) inside
 * its own try/catch. Throwing handlers are silently swallowed.
 *
 * Strict (`ctx.strict === true`): throw `DicomParseError` carrying the
 * warning code. The `code` field is typed `FatalCode` at compile time
 * but at runtime carries the `WarningCode` literal — consumers narrow
 * on `err.code` after catch (HL7 sibling Plan 06 decision (b); D-35
 * cast).
 *
 * @internal
 */
export function makeEmitter(ctx: ParseContext): (w: DicomParseWarning) => void {
  return (w) => {
    if (ctx.strict) {
      throw new DicomParseError(
        // D-35 cast: the WarningCode union does not overlap FatalCode at the
        // type level, but at runtime the strict-thrown error carries the
        // warning code so consumers can narrow on err.code uniformly.
        w.code as unknown as FatalCode,
        w.message,
        w.position.byteOffset,
        buildSnippet(ctx.buffer, w.position.byteOffset),
        w.position.contextPath,
      );
    }
    ctx.warnings.push(w);
    if (ctx.onWarning !== undefined) {
      try {
        ctx.onWarning(w);
      } catch {
        // D-03 silent swallow — a noisy handler must not corrupt parser
        // state (T-02-01-02). Mirrors @cosyte/hl7 sibling.
      }
    }
  };
}

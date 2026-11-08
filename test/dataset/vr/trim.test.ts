import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  trimSpaces,
  trimTrailingNulls,
  trimTrailingNullsAndSpaces,
} from "../../../src/dataset/vr/trim.js";

// Each helper replaces a regular expression that backtracked quadratically: `/^ +| +$/g`,
// `/[\0 ]+$/` and `/\0+$/` each retried from every position in a run of pad characters that any
// other character ended, so one long run held the event loop for seconds. The timed cases are that
// shape; the property cases hold each helper to the expression it replaced. The call sites have
// their own timed cases, in the test files of the modules that call them.

/** The expressions as they shipped, kept here only as the oracles the helpers must agree with. */
const SHIPPED_TRIM_SPACES = (v: string): string => v.replace(/^ +| +$/gu, "");
const SHIPPED_TRIM_NULLS_AND_SPACES = (v: string): string => v.replace(/[\0 ]+$/u, "");
const SHIPPED_TRIM_NULLS = (v: string): string => v.replace(/\0+$/u, "");

/** Apply `trim` to `value`, timing the call. */
function timed(trim: (v: string) => string, value: string): { out: string; ms: number } {
  const started = performance.now();
  const out = trim(value);
  return { out, ms: performance.now() - started };
}

describe("pad trims - linear time on a long run (polynomial backtracking)", () => {
  const RUN = 100_000;

  it("trimSpaces keeps a long interior run of spaces and trims only the ends", () => {
    const inner = `a${" ".repeat(RUN)}b`;
    const { out, ms } = timed(trimSpaces, `  ${inner}  `);
    expect(out).toBe(inner);
    expect(ms).toBeLessThan(1_000);
  });

  it("trimTrailingNullsAndSpaces keeps a long run of NULL and SPACE that a letter ends", () => {
    const kept = `${"\0 ".repeat(RUN / 2)}X`;
    const { out, ms } = timed(trimTrailingNullsAndSpaces, `${kept} \0 `);
    expect(out).toBe(kept);
    expect(ms).toBeLessThan(1_000);
  });

  it("trimTrailingNulls keeps a long run of NULL that a digit ends", () => {
    const kept = `${"\0".repeat(RUN)}1`;
    const { out, ms } = timed(trimTrailingNulls, `${kept}\0\0`);
    expect(out).toBe(kept);
    expect(ms).toBeLessThan(1_000);
  });
});

describe("pad trims - each returns what the expression it replaced returned", () => {
  // TAB and NO-BREAK SPACE (what Latin-1 `0xA0` decodes to) are in the alphabet so that a helper
  // which trimmed any other whitespace would disagree with its oracle.
  const values = fc
    .array(fc.constantFrom("\0", " ", "a", "\\", "\t", "\u00a0", "\0 ", "  "), { maxLength: 24 })
    .map((parts) => parts.join(""));

  it.each([
    ["trimSpaces", trimSpaces, SHIPPED_TRIM_SPACES],
    ["trimTrailingNullsAndSpaces", trimTrailingNullsAndSpaces, SHIPPED_TRIM_NULLS_AND_SPACES],
    ["trimTrailingNulls", trimTrailingNulls, SHIPPED_TRIM_NULLS],
  ] as const)("%s", (_name, trim, shipped) => {
    fc.assert(
      fc.property(values, (value) => {
        expect(trim(value)).toBe(shipped(value));
      }),
      { numRuns: 4_000 },
    );
  });
});

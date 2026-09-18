/**
 * Two properties of Annex E resolution that the live table cannot discriminate,
 * so both are proved against a constructed one.
 *
 * `annexE()` looks a tag up in the exact Table E.1-1 map first and falls back to
 * the repeating-group family rules only on a miss, because a single-tag row is
 * the more specific statement the standard makes about that tag. PS3.15 2026c
 * publishes no tag where both could answer, which is exactly why the property
 * cannot be tested against the live table: invert the order and every published
 * row still resolves identically, because no exact row's group prefix is
 * `50` or `60`.
 *
 * The second is the one `AC-7` names. PS3.15 2026c publishes its two §E.3.6
 * temporal columns on exactly the same rows, so no live row has a full-dates
 * code with the modified-dates column silent beside it - and that is the row
 * that tells "fall back to the Basic Profile" apart from "fall back to the
 * neighbouring temporal column". An action table lagging the dictionary is this
 * repo's recorded silent-PHI-leak shape, so the safe direction is proved rather
 * than argued.
 *
 * So both overlaps are constructed. This file mocks the generated module and
 * lives on its own because `vi.mock` is module-scoped and the rest of the Annex
 * E tests must see the real table.
 *
 * @module
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/dictionary/generated/annex-e.js", () => ({
  ANNEX_E: Object.freeze({
    // (6000,4000) is inside the (60xx,4000) mask below. The real table has no such
    // row; if PS3.15 ever adds one, this is the behaviour it will get.
    "60004000": Object.freeze({
      tag: "60004000",
      keyword: "Constructed Exact Row",
      basicProfile: "K",
      optionSet: Object.freeze({}),
    }),
    // (0008,0020) Study Date, rebuilt as the row PS3.15 2026c does not publish:
    // the full-dates column says keep, and the modified-dates column beside it
    // is EMPTY. Only this shape separates the Basic Profile fallback from the
    // neighbouring-column one.
    "00080020": Object.freeze({
      tag: "00080020",
      keyword: "Study Date",
      basicProfile: "Z",
      optionSet: Object.freeze({ RetainLongitudinalTemporal: "K" }),
    }),
  }),
  ANNEX_E_REPEATING: Object.freeze([
    Object.freeze({
      pattern: "60xx4000",
      keyword: "Overlay Comments",
      basicProfile: "X",
      optionSet: Object.freeze({ CleanGraphics: "C" }),
    }),
  ]),
}));

const { annexE } = await import("../../src/dictionary/annex-e.js");
const { effectiveCode } = await import("../../src/deident/actions.js");

describe("annexE resolution order (constructed overlap)", () => {
  it("answers from the exact row, not the mask that also covers the tag", () => {
    // Mask-first resolution returns X / "Overlay Comments" / repeatingGroup set.
    // Exact-first returns the row below. Nothing else distinguishes the two.
    const resolved = annexE("60004000");
    expect(resolved?.keyword).toBe("Constructed Exact Row");
    expect(resolved?.basicProfile).toBe("K");
    expect(resolved?.repeatingGroup).toBeUndefined();
  });

  it("still answers from the mask for a covered tag the exact table lacks", () => {
    // The other half: precedence must not become "the mask never applies".
    const resolved = annexE("601E4000");
    expect(resolved?.keyword).toBe("Overlay Comments");
    expect(resolved?.basicProfile).toBe("X");
    expect(resolved?.repeatingGroup).toBe("60xx4000");
    expect(resolved?.tag).toBe("601E4000");
  });
});

/**
 * The constructed row, resolved out of the mocked table rather than rebuilt
 * here: a fixture the unit under test never read would prove nothing about it.
 */
const silentModifiedRow = annexE("00080020");
if (silentModifiedRow === undefined) {
  throw new Error("the constructed (0008,0020) row is missing from the mocked table");
}

describe("AC-7: a silent modified-dates column falls to the Basic Profile (constructed row)", () => {
  it("AC-7: applies the Basic Profile action, never the full-dates one and never a keep", () => {
    // Non-vacuity: the row really is the shape the criterion is about - a
    // published full-dates code, nothing in the modified-dates column.
    expect(silentModifiedRow.optionSet.RetainLongitudinalTemporal).toBe("K");
    expect(silentModifiedRow.optionSet.RetainLongitudinalTemporalModifiedDates).toBeUndefined();

    const resolved = effectiveCode(
      silentModifiedRow,
      new Set(["RetainLongitudinalTemporalModifiedDates"]),
    );
    expect(resolved).toBe("Z");
    expect(resolved).not.toBe("K");
  });

  it("AC-7: the full-dates Option still gets the full-dates code (the test can discriminate)", () => {
    // The mutation control. A resolver that ignored `active` entirely and always
    // returned `basicProfile` would pass the row above and fail this one.
    expect(effectiveCode(silentModifiedRow, new Set(["RetainLongitudinalTemporal"]))).toBe("K");
    expect(effectiveCode(silentModifiedRow, new Set())).toBe("Z");
  });
});

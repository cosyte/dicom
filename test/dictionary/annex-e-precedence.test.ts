/**
 * The one property `annexE`'s resolution order promises, guarded.
 *
 * `annexE()` looks a tag up in the exact Table E.1-1 map first and falls back to
 * the repeating-group family rules only on a miss, because a single-tag row is
 * the more specific statement the standard makes about that tag. PS3.15 2026c
 * publishes no tag where both could answer, which is exactly why the property
 * cannot be tested against the live table: invert the order and every one of the
 * 652 rows still resolves identically, because no exact row's group prefix is
 * `50` or `60`.
 *
 * So the overlap is constructed. This file mocks the generated module with an
 * exact row that a family mask also covers, which is the only input that can tell
 * the two orders apart. It lives in its own file because `vi.mock` is
 * module-scoped and the rest of the Annex E tests must see the real table.
 *
 * @module
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/dictionary/generated/annex-e.js", () => ({
  // (6000,4000) is inside the (60xx,4000) mask below. The real table has no such
  // row; if PS3.15 ever adds one, this is the behaviour it will get.
  ANNEX_E: Object.freeze({
    "60004000": Object.freeze({
      tag: "60004000",
      keyword: "Constructed Exact Row",
      basicProfile: "K",
      optionSet: Object.freeze({}),
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

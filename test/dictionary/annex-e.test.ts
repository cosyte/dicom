/**
 * Unit tests for the PS3.15 Annex E lookup helper (`annexE`).
 *
 * D-08 / D-09 / D-14 shipped the generated Annex E action table; this exercises the
 * thin lookup wrapper over it so the `src/dictionary/` coverage gate stays honest
 * (Phase 7's `anonymize()` is the production consumer, not yet landed).
 *
 * Tags asserted here are stable PS3.15 Table E.1-1 entries.
 */

import { describe, expect, it } from "vitest";
import { annexE } from "../../src/dictionary/annex-e.js";

describe("annexE (PS3.15 Annex E lookup)", () => {
  it("resolves Patient's Name (00100010) to a Basic-Profile Z action", () => {
    const a = annexE("00100010");
    expect(a).toBeDefined();
    expect(a?.tag).toBe("00100010");
    expect(a?.keyword).toBe("Patient's Name");
    expect(a?.basicProfile).toBe("Z");
  });

  it("carries per-option-set overrides (Study Instance UID retains under RetainUIDs)", () => {
    const a = annexE("0020000D");
    expect(a?.basicProfile).toBe("U");
    expect(a?.optionSet.RetainUIDs).toBe("K");
  });

  it("normalizes lowercase hex tags to upper before lookup", () => {
    const lower = annexE("0020000d");
    const upper = annexE("0020000D");
    expect(lower).toBeDefined();
    expect(lower).toBe(upper);
  });

  it("returns undefined for a tag with no Annex E entry", () => {
    // (7FE0,0010) PixelData is not in Table E.1-1.
    expect(annexE("7FE00010")).toBeUndefined();
  });

  it("returns undefined for the empty string (no-throw)", () => {
    expect(annexE("")).toBeUndefined();
  });

  it("returns undefined for a non-string input (no-throw)", () => {
    expect(annexE(undefined as unknown as string)).toBeUndefined();
  });
});

/**
 * PS3.5 §7.6 repeating-group bounds.
 *
 * The whole point of this module is that `xx` in `(60xx,4000)` is a **repeating
 * group number**, not a wildcard over arbitrary hex, so the tests that matter are
 * the negative ones: the groups a naive wildcard would match and the standard
 * never defined. Getting those wrong is not a missed match, it is removing
 * attributes PS3.15 never marked from a call the caller believes is conservative.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import {
  REPEATING_GROUP_PREFIXES,
  REPEATING_GROUP_RANGES,
  expandRepeatingGroups,
  matchesRepeatingPattern,
} from "../../src/dictionary/repeating-groups.js";

describe("REPEATING_GROUP_RANGES", () => {
  it("covers exactly the two masks PS3.5 section 7.6 defines", () => {
    expect(REPEATING_GROUP_PREFIXES).toEqual(["50", "60"]);
  });

  it("bounds both at the even low bytes 00 through 1E", () => {
    for (const prefix of REPEATING_GROUP_PREFIXES) {
      const range = REPEATING_GROUP_RANGES[prefix];
      expect(range?.lowMin).toBe(0x00);
      expect(range?.lowMax).toBe(0x1e);
    }
  });
});

describe("expandRepeatingGroups", () => {
  it("yields the sixteen even overlay groups 6000 through 601E", () => {
    const groups = expandRepeatingGroups("60");
    expect(groups).toHaveLength(16);
    expect(groups[0]).toBe(0x6000);
    expect(groups[15]).toBe(0x601e);
    expect(groups.every((g) => g % 2 === 0)).toBe(true);
  });

  it("yields the sixteen even curve groups 5000 through 501E", () => {
    const groups = expandRepeatingGroups("50");
    expect(groups).toHaveLength(16);
    expect(groups[0]).toBe(0x5000);
    expect(groups[15]).toBe(0x501e);
  });

  it("yields nothing for a registry mask that is not a repeating group", () => {
    // (7Fxx,0010) Variable Pixel Data is printed as a mask in the PS3.6 registry
    // but PS3.5 section 7.6 gives it no repeating-group semantics and no bound.
    expect(expandRepeatingGroups("7F")).toEqual([]);
    expect(expandRepeatingGroups("00")).toEqual([]);
  });
});

describe("matchesRepeatingPattern", () => {
  it("matches every overlay plane the standard allows", () => {
    for (const group of expandRepeatingGroups("60")) {
      const tag = group.toString(16).toUpperCase().padStart(4, "0") + "4000";
      expect(matchesRepeatingPattern("60xx4000", tag), tag).toBe(true);
    }
  });

  it("rejects even groups above 601E, which PS3.5 does not admit as overlays", () => {
    // The single most important negative case: a hex wildcard would take these.
    for (const tag of ["60204000", "60FE4000", "60804000"]) {
      expect(matchesRepeatingPattern("60xx4000", tag), tag).toBe(false);
    }
  });

  it("rejects odd groups, which PS3.5 states carry no repeating semantics", () => {
    for (const tag of ["60014000", "601F4000", "50014000"]) {
      expect(matchesRepeatingPattern("60xx4000", tag), tag).toBe(false);
      expect(matchesRepeatingPattern("50xxxxxx", tag), tag).toBe(false);
    }
  });

  it("keeps the element half exact when the row names one element", () => {
    expect(matchesRepeatingPattern("60xx4000", "60004000")).toBe(true);
    expect(matchesRepeatingPattern("60xx4000", "60003000")).toBe(false);
    expect(matchesRepeatingPattern("60xx4000", "60000010")).toBe(false);
  });

  it("treats a masked element half as a true wildcard", () => {
    for (const element of ["0000", "0005", "3000", "FFFF"]) {
      expect(matchesRepeatingPattern("50xxxxxx", `5000${element}`), element).toBe(true);
    }
  });

  it("does not confuse a different group prefix for a repeating group", () => {
    expect(matchesRepeatingPattern("60xx4000", "70004000")).toBe(false);
    expect(matchesRepeatingPattern("60xx4000", "00104000")).toBe(false);
  });

  it("rejects malformed inputs rather than guessing", () => {
    expect(matchesRepeatingPattern("60xx4000", "6000400")).toBe(false);
    expect(matchesRepeatingPattern("60xx4000", "6000400Z")).toBe(false);
    expect(matchesRepeatingPattern("6000400", "60004000")).toBe(false);
    // A pattern whose group half is not masked is not a repeating-group pattern.
    expect(matchesRepeatingPattern("60004000", "60004000")).toBe(false);
  });

  it("accepts a concrete tag in either case", () => {
    expect(matchesRepeatingPattern("60xx4000", "601e4000")).toBe(true);
    expect(matchesRepeatingPattern("60xx4000", "601E4000")).toBe(true);
  });
});

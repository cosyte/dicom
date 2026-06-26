/**
 * Public-API stability snapshot for `WARNING_CODES` and `FATAL_CODES`, via the
 * shared `@cosyte/test-utils` `sortedCodeSet` helper.
 *
 * The set of codes the parser can emit (warnings) or throw (fatals) is part of
 * the package's PUBLIC contract: consumers narrow on `warning.code` / `err.code`,
 * so renaming or removing a code is a BREAKING change. Snapshotting the full
 * sorted code set turns any such change into a failing test with a readable diff
 * — a deliberate tripwire. Updating the snapshot (`vitest -u`) is the explicit
 * acknowledgement that the public surface changed and a changeset / version bump
 * is owed (the v0.0.x ladder treats a code rename as breaking).
 *
 * `sortedCodeSet` returns the registry's values in a localeless, deterministic
 * order, so the snapshot is identical across machines and only changes when a
 * code is genuinely added, removed, or renamed.
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import { sortedCodeSet } from "@cosyte/test-utils";

import { FATAL_CODES, WARNING_CODES } from "../../src/index.js";

describe("dicom public API: WARNING_CODES surface is stable", () => {
  it("the sorted set of Tier-2 warning codes matches the locked snapshot", () => {
    expect(sortedCodeSet(WARNING_CODES)).toMatchSnapshot();
  });

  it("WARNING_CODES keys equal their values (registry self-consistency)", () => {
    for (const [k, v] of Object.entries(WARNING_CODES)) expect(k).toBe(v);
  });
});

describe("dicom public API: FATAL_CODES surface is stable", () => {
  it("the sorted set of Tier-3 fatal codes matches the locked snapshot", () => {
    expect(sortedCodeSet(FATAL_CODES)).toMatchSnapshot();
  });

  it("there are exactly 4 Tier-3 fatal codes (locked per PROJECT.md)", () => {
    expect(Object.keys(FATAL_CODES)).toHaveLength(4);
  });

  it("FATAL_CODES keys equal their values (registry self-consistency)", () => {
    for (const [k, v] of Object.entries(FATAL_CODES)) expect(k).toBe(v);
  });
});

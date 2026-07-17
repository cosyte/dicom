/**
 * Tests for the Phase 2 structural `Sequence` wrapper (02-CONTEXT D-04).
 *
 * The class is a thin, immutable container: `items` (frozen at the
 * constructor boundary) + the on-wire `length`. These tests pin that
 * structural contract — the frozen-copy guarantee in particular — since the
 * parser plan that constructs `Sequence` values relies on it.
 */

import { describe, expect, it } from "vitest";

import type { Item } from "../../src/dataset/item.js";
import { Sequence } from "../../src/dataset/sequence.js";

describe("Sequence — structural wrapper", () => {
  it("stores items and the on-wire length", () => {
    const items: readonly Item[] = [];
    const seq = new Sequence(items, 0xffffffff);
    expect(seq.items).toEqual([]);
    expect(seq.length).toBe(0xffffffff);
  });

  it("records a defined-length byte count verbatim", () => {
    const seq = new Sequence([], 128);
    expect(seq.length).toBe(128);
  });

  it("freezes a copy of items so caller mutation cannot leak in", () => {
    const source: Item[] = [];
    const seq = new Sequence(source, 0);
    // The stored array is frozen against mutation...
    expect(Object.isFrozen(seq.items)).toBe(true);
    // ...and it is a distinct copy, not the caller's array reference, so later
    // mutation of `source` cannot leak into the constructed Sequence.
    expect(seq.items).not.toBe(source);
  });
});

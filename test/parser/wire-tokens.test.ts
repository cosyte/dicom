/**
 * The strings the readers build from header bytes once and share: a tag, a VR, a Tag Number. Each
 * is the string or number the per-element construction gave, past the cache's bound as well as
 * inside it, and a VR outside the 34 PS3.5 defines still decodes as its two ASCII bytes.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { joinTag, splitTag } from "../../src/dataset/tag.js";
import { applySpecificCharacterSet } from "../../src/parser/element-header.js";
import { OFFSET_FRAMES } from "../../src/parser/errors.js";
import type { ParseContext } from "../../src/parser/types.js";
import { tagOf, vrAt } from "../../src/parser/wire-tokens.js";
import { tagNumber } from "../../src/serialize/order.js";

describe("tagOf", () => {
  it("is joinTag's string for every tag, past the cache's bound too", () => {
    // 20,000 distinct tags is past the 16,384 the cache keeps.
    for (let group = 0x0008; group < 0x0008 + 5; group++) {
      for (let element = 0; element < 4_000; element++) {
        expect(tagOf(group, element)).toBe(joinTag(group, element));
      }
    }
    expect(tagOf(0xfffe, 0xe000)).toBe("FFFEE000");
    expect(tagOf(0x0010, 0x0010)).toBe(tagOf(0x0010, 0x0010));
  });
});

describe("tagNumber", () => {
  it("is the Group Number then the Element Number, past the cache's bound too", () => {
    for (let i = 0; i < 20_000; i++) {
      const tag = joinTag(0x0019 + (i >> 12), i & 0xfff);
      const { group, element } = splitTag(tag);
      expect(tagNumber(tag)).toBe(group * 0x10000 + element);
    }
  });
});

describe("vrAt", () => {
  it("reads a defined VR, and any other two bytes as their ASCII decoding", () => {
    expect(vrAt(Buffer.from("xxPN", "latin1"), 2)).toBe("PN");
    const odd = Buffer.from([0x7a, 0x7a, 0xc1, 0xc5]);
    expect(vrAt(odd, 0)).toBe(odd.toString("ascii", 0, 2));
    expect(vrAt(odd, 2)).toBe(odd.toString("ascii", 2, 4));
  });

  it("throws a RangeError when the two bytes run past the buffer, as the cursor did", () => {
    expect(() => vrAt(Buffer.from([0x50]), 0)).toThrow(RangeError);
  });
});

describe("applySpecificCharacterSet", () => {
  it("leaves the context alone for any tag but (0008,0005)", () => {
    const ctx: ParseContext = {
      frame: { buffer: Buffer.alloc(0), name: OFFSET_FRAMES.INPUT },
      strict: false,
      stripPreamble: "tolerate",
      warnings: [],
      creators: new Map(),
      encodingContextStack: ["Root"],
      nestingDepth: 0,
      copyValues: false,
    };
    applySpecificCharacterSet("00100010", Buffer.from("ISO_IR 192"), ctx, () => undefined, {
      byteOffset: 0,
    });
    expect(ctx.currentCharset).toBeUndefined();
  });
});

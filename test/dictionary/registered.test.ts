/**
 * `isRegisteredTag`'s refusals: what is not eight hex digits is not a concrete tag, and so is not
 * registered, whatever it resembles. The de-identifier's unregistered-element rule asks this
 * question of every standard element, so an answer of `true` here would keep an element PS3.6
 * never defined.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { isRegisteredTag } from "../../src/dictionary/registered.js";

describe("isRegisteredTag", () => {
  it("answers in either case for a concrete registered tag", () => {
    expect(isRegisteredTag("00100010")).toBe(true);
    expect(isRegisteredTag("7fe00010")).toBe(true);
  });

  it("refuses a value that is not a string, which a JavaScript caller can pass", () => {
    for (const value of [0x00100010, undefined, null, ["00100010"]]) {
      expect(isRegisteredTag(value as unknown as string), String(value)).toBe(false);
    }
  });

  it("refuses a string that is not eight hex digits, even one naming a registered tag", () => {
    for (const value of ["0010,0010", "(0010,0010)", "0010001", "001000100", "", "60xx3000"]) {
      expect(isRegisteredTag(value), value).toBe(false);
    }
  });
});

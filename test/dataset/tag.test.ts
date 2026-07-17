import { describe, expect, it } from "vitest";

import {
  isFileMetaTag,
  isPrivateTag,
  isValidTag,
  joinTag,
  splitTag,
} from "../../src/dataset/tag.js";

describe("isValidTag", () => {
  it("accepts well-formed 8-char uppercase hex", () => {
    expect(isValidTag("00100010")).toBe(true);
    expect(isValidTag("FFFEE00D")).toBe(true);
    expect(isValidTag("7FE00010")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidTag("0010001")).toBe(false);
    expect(isValidTag("001000100")).toBe(false);
    expect(isValidTag("")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidTag("0010001x")).toBe(false);
    expect(isValidTag("0010001G")).toBe(false);
  });

  it("rejects lowercase hex (caller must uppercase first)", () => {
    expect(isValidTag("fffee00d")).toBe(false);
  });
});

describe("splitTag", () => {
  it("returns numeric group + element halves", () => {
    expect(splitTag("00100010")).toEqual({ group: 0x0010, element: 0x0010 });
    expect(splitTag("FFFEE00D")).toEqual({ group: 0xfffe, element: 0xe00d });
    expect(splitTag("7FE00010")).toEqual({ group: 0x7fe0, element: 0x0010 });
  });
});

describe("joinTag", () => {
  it("formats numeric group + element as 8-char uppercase hex", () => {
    expect(joinTag(0x0010, 0x0010)).toBe("00100010");
    expect(joinTag(0xfffe, 0xe00d)).toBe("FFFEE00D");
    expect(joinTag(0x7fe0, 0x0010)).toBe("7FE00010");
  });

  it("zero-pads small values", () => {
    expect(joinTag(2, 16)).toBe("00020010");
  });
});

describe("isPrivateTag", () => {
  it("returns true for odd groups (PS3.5 §7.8 private groups)", () => {
    expect(isPrivateTag("00190010")).toBe(true);
    expect(isPrivateTag("00091020")).toBe(true);
  });

  it("returns false for even groups (standard)", () => {
    expect(isPrivateTag("00100010")).toBe(false);
    expect(isPrivateTag("00080000")).toBe(false);
  });
});

describe("isFileMetaTag", () => {
  it("returns true for group 0x0002", () => {
    expect(isFileMetaTag("00020010")).toBe(true);
    expect(isFileMetaTag("00020001")).toBe(true);
  });

  it("returns false for non-File-Meta groups", () => {
    expect(isFileMetaTag("00100010")).toBe(false);
    expect(isFileMetaTag("7FE00010")).toBe(false);
  });
});

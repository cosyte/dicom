/**
 * `Element.rawBytes` is made the first time it is read: a zero-copy view of the input by default,
 * the same Buffer on every read after, and a standalone copy under `{ copyValues: true }`. The
 * input range it views never shows on the Element itself.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { worklistItem } from "../../bench/shapes.mjs";
import { parseDicom } from "../../src/index.js";

describe("Element.rawBytes", () => {
  const input = worklistItem(3);

  it("is a view of the input, the same Buffer every time it is read", () => {
    const el = parseDicom(input).get("00100010");
    const bytes = el?.rawBytes;
    expect(bytes?.toString("latin1")).toBe("SYNTHETIC^PATIENT^0003");
    expect(el?.rawBytes).toBe(bytes);
    expect(bytes?.buffer).toBe(input.buffer);
    expect((bytes?.byteOffset ?? 0) - input.byteOffset).toBe(
      input.indexOf("SYNTHETIC^PATIENT^0003", 0, "latin1"),
    );
  });

  it("is a standalone copy under copyValues, made at parse time", () => {
    const copy = Buffer.from(input);
    const el = parseDicom(copy, { copyValues: true }).get("00100010");
    copy.fill(0);
    expect(el?.rawBytes.toString("latin1")).toBe("SYNTHETIC^PATIENT^0003");
    expect(el?.rawBytes.buffer).not.toBe(copy.buffer);
  });

  it("keeps the input range off the Element's own keys", () => {
    const el = parseDicom(input).get("00100010");
    expect(el).toBeDefined();
    const json = JSON.stringify(el);
    expect(json.length).toBeLessThan(input.length);
    expect(Object.keys(el ?? {})).not.toContain("source");
  });
});

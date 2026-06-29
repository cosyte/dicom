import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  decodeText,
  isKnownCharsetTerm,
  parseSpecificCharacterSet,
  resolveDecoderLabel,
} from "./charset.js";

describe("parseSpecificCharacterSet (0008,0005)", () => {
  it("splits a multi-valued CS on backslash and trims pad", () => {
    const bytes = Buffer.from("ISO 2022 IR 6\\ISO 2022 IR 87 ", "latin1");
    expect(parseSpecificCharacterSet(bytes)).toEqual(["ISO 2022 IR 6", "ISO 2022 IR 87"]);
  });

  it("preserves a leading empty term (ISO-2022 G0 default) rather than dropping it", () => {
    const bytes = Buffer.from("\\ISO 2022 IR 87", "latin1");
    expect(parseSpecificCharacterSet(bytes)).toEqual(["", "ISO 2022 IR 87"]);
  });

  it("a single empty value parses to ['']", () => {
    expect(parseSpecificCharacterSet(Buffer.from("", "latin1"))).toEqual([""]);
  });
});

describe("isKnownCharsetTerm (term-list corrections vs PS3.3 §C.12.1.1.2)", () => {
  it("accepts the empty default-repertoire term and common terms", () => {
    expect(isKnownCharsetTerm("")).toBe(true);
    expect(isKnownCharsetTerm("ISO_IR 100")).toBe(true);
    expect(isKnownCharsetTerm("ISO_IR 192")).toBe(true);
  });

  it("CORRECTION: ISO_IR 14 does not exist (only ISO_IR 13)", () => {
    expect(isKnownCharsetTerm("ISO_IR 14")).toBe(false);
    expect(isKnownCharsetTerm("ISO_IR 13")).toBe(true);
  });

  it("CORRECTION: IR 87 / IR 159 are code-extension-only (no bare ISO_IR form)", () => {
    expect(isKnownCharsetTerm("ISO_IR 87")).toBe(false);
    expect(isKnownCharsetTerm("ISO_IR 159")).toBe(false);
    expect(isKnownCharsetTerm("ISO 2022 IR 87")).toBe(true);
    expect(isKnownCharsetTerm("ISO 2022 IR 159")).toBe(true);
  });

  it("CORRECTION: ISO_IR 203 (Latin-9) IS included", () => {
    expect(isKnownCharsetTerm("ISO_IR 203")).toBe(true);
  });

  it("rejects an invented term", () => {
    expect(isKnownCharsetTerm("ISO_IR 9999")).toBe(false);
  });
});

describe("resolveDecoderLabel", () => {
  it("defaults to latin1 for undefined / empty", () => {
    expect(resolveDecoderLabel(undefined)).toBe("latin1");
    expect(resolveDecoderLabel([])).toBe("latin1");
    expect(resolveDecoderLabel([""])).toBe("latin1");
  });

  it("prefers a multibyte decoder when the term list mixes single-byte + extension", () => {
    expect(resolveDecoderLabel(["ISO 2022 IR 6", "ISO 2022 IR 87"])).toBe("iso-2022-jp");
  });

  it("returns the first known single-byte label when no multibyte present", () => {
    expect(resolveDecoderLabel(["ISO_IR 100"])).toBe("latin1");
    expect(resolveDecoderLabel(["ISO_IR 101"])).toBe("iso-8859-2");
  });

  it("skips unknown terms and falls back to latin1", () => {
    expect(resolveDecoderLabel(["ISO_IR 9999"])).toBe("latin1");
  });
});

describe("decodeText (never throws)", () => {
  it("decodes UTF-8 under ISO_IR 192", () => {
    const bytes = Buffer.from("Müller", "utf-8");
    expect(decodeText(bytes, ["ISO_IR 192"])).toBe("Müller");
  });

  it("decodes Latin-1 by default", () => {
    expect(decodeText(Buffer.from([0x41, 0x42]), undefined)).toBe("AB");
  });

  it("decodes ISO-8859-15 (Latin-9, ISO_IR 203) — euro sign at 0xA4", () => {
    expect(decodeText(Buffer.from([0xa4]), ["ISO_IR 203"])).toBe("€");
  });
});

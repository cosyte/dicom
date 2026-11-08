import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  decodeText,
  isKnownCharsetTerm,
  parseSpecificCharacterSet,
  resolveDecoderLabel,
} from "../../../src/dataset/vr/charset.js";
import { WITHHELD } from "../../../src/parser/tokens.js";

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

  it("decodes ISO-8859-15 (Latin-9, ISO_IR 203) - euro sign at 0xA4", () => {
    expect(decodeText(Buffer.from([0xa4]), ["ISO_IR 203"])).toBe("€");
  });
});

// The trim of each term used to be `/[\x00 ]+$/` and then `/^[ ]+/`. The first re-scanned a run of
// pad bytes from every position in it when the run ended in any other byte, which is quadratic in a
// length the file chooses. Run against the shipped source (`a5f8f4b`, `src/` replaced), both timed
// cases below went red, at 13 and 8 s; the rewrite takes about a millisecond.
describe("parseSpecificCharacterSet - linear time on a long pad run (polynomial backtracking)", () => {
  const RUN = 100_000;

  it("withholds a term that is a long NULL run followed by a byte, without backtracking", () => {
    const started = performance.now();
    const terms = parseSpecificCharacterSet(Buffer.from(`${"\x00".repeat(RUN)}X`, "latin1"));
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(terms).toEqual([WITHHELD]);
  });

  it("finds a defined term between long runs of leading SPACE and trailing NULL and SPACE", () => {
    const value = `${" ".repeat(RUN)}ISO_IR 192${"\x00 ".repeat(RUN / 2)}`;
    const started = performance.now();
    const terms = parseSpecificCharacterSet(Buffer.from(value, "latin1"));
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(terms).toEqual(["ISO_IR 192"]);
  });

  it("trims every term exactly as the shipped patterns did", () => {
    /** The patterns as they shipped, kept here only as the oracle the rewrite must agree with. */
    const shipped = (raw: string): string[] =>
      raw
        .split("\\")
        .map((t) => t.replace(/[\x00 ]+$/u, "").replace(/^[ ]+/u, ""))
        .map((t) => (t === "" || isKnownCharsetTerm(t) ? t : WITHHELD));
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("\x00", " ", "\\", "X", "ISO_IR 192", "ISO 2022 IR 87"), {
          maxLength: 12,
        }),
        (parts) => {
          const raw = parts.join("");
          expect(parseSpecificCharacterSet(Buffer.from(raw, "latin1"))).toEqual(shipped(raw));
        },
      ),
      { numRuns: 4_000 },
    );
  });
});

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Tag, VR } from "../../../src/dictionary/types.js";
import { Element } from "../../../src/dataset/element.js";
import { Item } from "../../../src/dataset/item.js";
import { decodeElementValue } from "../../../src/dataset/vr/decode.js";

function el(
  vr: VR,
  rawBytes: Buffer,
  opts: { tag?: Tag; littleEndian?: boolean; charset?: readonly string[]; items?: Item[] } = {},
): Element {
  return new Element({
    tag: opts.tag ?? "00100010",
    vr,
    vm: 1,
    length: rawBytes.length,
    rawBytes,
    byteOffset: 0,
    littleEndian: opts.littleEndian ?? true,
    ...(opts.charset !== undefined ? { specificCharacterSet: opts.charset } : {}),
    ...(opts.items !== undefined ? { items: opts.items } : {}),
  });
}

const ascii = (s: string): Buffer => Buffer.from(s, "latin1");

describe("decodeElementValue - structural kinds", () => {
  it("SQ → sequence, exposing the threaded items", () => {
    const item = new Item({ index: 0, warnings: [], elements: new Map() });
    const v = decodeElementValue(el("SQ", Buffer.alloc(0), { items: [item] }));
    expect(v.kind).toBe("sequence");
    if (v.kind === "sequence") expect(v.items).toHaveLength(1);
  });

  it("SQ with no threaded items → empty sequence (never undefined)", () => {
    const v = decodeElementValue(el("SQ", Buffer.alloc(0)));
    expect(v).toEqual({ kind: "sequence", items: [] });
  });

  it.each(["OB", "OD", "OF", "OL", "OV", "OW", "UN"] as const)(
    "%s → binary (raw preserved, not interpreted)",
    (vr) => {
      const bytes = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const v = decodeElementValue(el(vr, bytes));
      expect(v.kind).toBe("binary");
      if (v.kind === "binary") expect(v.bytes).toBe(bytes);
    },
  );

  it("zero-length non-binary value → empty", () => {
    expect(decodeElementValue(el("PN", Buffer.alloc(0)))).toEqual({ kind: "empty" });
  });
});

describe("decodeElementValue - numeric kinds", () => {
  it.each(["US", "UL", "SS", "SL", "FL", "FD"] as const)("%s → numbers", (vr) => {
    const bytes = Buffer.alloc(8); // enough for any stride
    const v = decodeElementValue(el(vr, bytes));
    expect(v.kind).toBe("numbers");
  });

  it.each(["SV", "UV"] as const)("%s → bigints", (vr) => {
    const v = decodeElementValue(el(vr, Buffer.alloc(8)));
    expect(v.kind).toBe("bigints");
  });

  it("AT → attributeTags", () => {
    const v = decodeElementValue(el("AT", Buffer.from([0x10, 0x00, 0x10, 0x00])));
    expect(v).toEqual({ kind: "attributeTags", values: ["00100010"] });
  });
});

describe("decodeElementValue - string / text kinds", () => {
  it("PN → personName, charset-decoded", () => {
    const v = decodeElementValue(el("PN", ascii("Doe^Jane")));
    expect(v.kind).toBe("personName");
    if (v.kind === "personName") expect(v.values[0]?.alphabetic.familyName).toBe("Doe");
  });

  it.each(["LO", "SH", "UC"] as const)("%s → strings, split on backslash", (vr) => {
    const v = decodeElementValue(el(vr, ascii("a\\b")));
    expect(v).toMatchObject({ kind: "strings", values: ["a", "b"] });
  });

  it.each(["LT", "ST", "UT"] as const)("%s → single text (backslash literal)", (vr) => {
    const v = decodeElementValue(el(vr, ascii("a\\b")));
    expect(v).toMatchObject({ kind: "text", value: "a\\b" });
  });

  it("UR → text (ASCII, no multiplicity)", () => {
    const v = decodeElementValue(el("UR", ascii("http://x/y")));
    expect(v).toMatchObject({ kind: "text", value: "http://x/y" });
  });

  it.each(["AE", "CS", "AS", "UI"] as const)("%s → strings (ASCII)", (vr) => {
    const v = decodeElementValue(el(vr, ascii("CT")));
    expect(v).toMatchObject({ kind: "strings", values: ["CT"] });
  });
});

describe("decodeElementValue - numeric strings (fail-safe, never NaN→0)", () => {
  it("DS → decimalString, non-numeric → null (raw still preserved on element)", () => {
    const e = el("DS", ascii("1.5\\bad\\"));
    const v = decodeElementValue(e);
    expect(v).toMatchObject({ kind: "decimalString", values: [1.5, null, null] });
    expect(e.rawBytes.toString("latin1")).toBe("1.5\\bad\\");
  });

  it("DS rejects non-conformant numeric literals (hex/octal/binary) → null, not coerced", () => {
    const v = decodeElementValue(el("DS", ascii("0x1A\\0o17\\0b101\\1.5e2")));
    expect(v).toMatchObject({ kind: "decimalString", values: [null, null, null, 150] });
  });

  it("IS → integerString, non-integer → null + DICOM_IS_NONINTEGER_VALUE warning", () => {
    const v = decodeElementValue(el("IS", ascii("42\\3.5")));
    expect(v.kind).toBe("integerString");
    if (v.kind === "integerString") {
      expect(v.values).toEqual([42, null]);
      expect(v.warnings?.[0]?.code).toBe("DICOM_IS_NONINTEGER_VALUE");
    }
  });
});

describe("decodeElementValue - temporal kinds", () => {
  it("DA → dates; dotted legacy form emits DICOM_DA_LEGACY_FORMAT", () => {
    const v = decodeElementValue(el("DA", ascii("2024.01.15"), { tag: "00080020" }));
    expect(v.kind).toBe("dates");
    if (v.kind === "dates") {
      expect(v.values[0]?.valid).toBe(true);
      expect(v.warnings?.[0]?.code).toBe("DICOM_DA_LEGACY_FORMAT");
    }
  });

  it("TM → times", () => {
    const v = decodeElementValue(el("TM", ascii("133015")));
    expect(v.kind).toBe("times");
    if (v.kind === "times") expect(v.values[0]?.hours).toBe(13);
  });

  it("DT → dateTimes; malformed offset emits DICOM_DT_NONSTANDARD_OFFSET", () => {
    const v = decodeElementValue(el("DT", ascii("20240115+99"), { tag: "0040A120" }));
    expect(v.kind).toBe("dateTimes");
    if (v.kind === "dateTimes") expect(v.warnings?.[0]?.code).toBe("DICOM_DT_NONSTANDARD_OFFSET");
  });
});

describe("decodeElementValue - padding & tolerance", () => {
  it("string VR strips trailing SPACE pad", () => {
    const v = decodeElementValue(el("LO", ascii("VALUE ")));
    expect(v).toMatchObject({ kind: "strings", values: ["VALUE"] });
  });

  it("UI strips trailing NULL pad", () => {
    const v = decodeElementValue(el("UI", Buffer.concat([ascii("1.2.840"), Buffer.from([0x00])])));
    expect(v).toMatchObject({ kind: "strings", values: ["1.2.840"] });
  });

  it("UI with a SPACE pad is tolerated + DICOM_UI_TRAILING_SPACE", () => {
    const v = decodeElementValue(el("UI", ascii("1.2.840 ")));
    if (v.kind === "strings") {
      expect(v.values).toEqual(["1.2.840"]);
      expect(v.warnings?.[0]?.code).toBe("DICOM_UI_TRAILING_SPACE");
    }
  });

  it("text VR with a NULL pad is tolerated + DICOM_TRAILING_NULL_IN_TEXT_VR", () => {
    const v = decodeElementValue(el("CS", Buffer.concat([ascii("CT"), Buffer.from([0x00])])));
    if (v.kind === "strings") {
      expect(v.values).toEqual(["CT"]);
      expect(v.warnings?.[0]?.code).toBe("DICOM_TRAILING_NULL_IN_TEXT_VR");
    }
  });

  it("non-ASCII byte in an ASCII-only VR emits DICOM_NON_ASCII_IN_ASCII_VR", () => {
    const v = decodeElementValue(el("CS", Buffer.from([0x43, 0xe9])));
    if (v.kind === "strings") expect(v.warnings?.[0]?.code).toBe("DICOM_NON_ASCII_IN_ASCII_VR");
  });

  it("a leading UTF-8 BOM in a charset text VR is stripped + DICOM_BOM_IN_TEXT_VR", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), ascii("Doe^Jane")]);
    const v = decodeElementValue(el("PN", bytes, { charset: ["ISO_IR 192"] }));
    if (v.kind === "personName") {
      expect(v.values[0]?.alphabetic.familyName).toBe("Doe");
      expect(v.warnings?.[0]?.code).toBe("DICOM_BOM_IN_TEXT_VR");
    }
  });

  it("clean values carry no warnings array", () => {
    const v = decodeElementValue(el("LO", ascii("clean")));
    if (v.kind === "strings") expect(v.warnings).toBeUndefined();
  });
});

describe("decodeElementValue - charset threading", () => {
  it("LO honors UTF-8 via the element's specificCharacterSet", () => {
    const v = decodeElementValue(
      el("LO", Buffer.from("Müller", "utf-8"), { charset: ["ISO_IR 192"] }),
    );
    expect(v).toMatchObject({ kind: "strings", values: ["Müller"] });
  });
});

// ---------------------------------------------------------------------------
// Linear time on a value a file controls
// ---------------------------------------------------------------------------
//
// Three patterns here used to backtrack quadratically: the per-value trim of the multi-valued
// string VRs (`/^ +| +$/g`, re-scanning a run of interior spaces from every position in it) and
// the DS grammar (`(\d+\.?\d*|\.\d+)`, splitting a run of digits two ways at every position).
// A value's length is the file's to choose, so one long run held the event loop for seconds.
// Run against the shipped source (`a5f8f4b`, `src/` replaced), eight of the nine timed cases below
// went red at 10 to 17 s each; the rewrite takes about a millisecond, so the one-second bound has
// wide headroom on both sides.

/** The patterns as they shipped, kept here only as the oracle the rewrite must agree with. */
const SHIPPED_TRIM = (v: string): string => v.replace(/^ +| +$/gu, "");
const SHIPPED_DS = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/u;

/** What `stripPad` leaves of a non-UI value: the trailing SPACE and NULL bytes come off first. */
function unpadded(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === " " || s[end - 1] === "\x00")) end--;
  return s.slice(0, end);
}

function shippedDecimal(v: string): number | null {
  const t = v.trim();
  if (t.length === 0 || !SHIPPED_DS.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Decode `text` under `vr` and hand back its values, timing the call. */
function timed(vr: VR, text: string): { values: unknown; ms: number } {
  const started = performance.now();
  const v = decodeElementValue(el(vr, ascii(text)));
  const ms = performance.now() - started;
  return { values: "values" in v ? v.values : v, ms };
}

describe("decodeElementValue - linear time on a long run (polynomial backtracking)", () => {
  const RUN = 100_000;

  it.each(["LO", "SH", "UC", "AE", "CS", "AS", "UI"] as const)(
    "%s keeps a long interior run of spaces and trims only the ends",
    (vr) => {
      const inner = `a${" ".repeat(RUN)}b`;
      const { values, ms } = timed(vr, `  ${inner}  `);
      expect(values).toEqual([inner]);
      expect(ms).toBeLessThan(1_000);
    },
  );

  it("DS refuses a long run of digits that ends in a non-digit, without backtracking", () => {
    const { values, ms } = timed("DS", `${"0".repeat(RUN)}x`);
    expect(values).toEqual([null]);
    expect(ms).toBeLessThan(1_000);
  });

  it("DS still reads a long valid literal", () => {
    const { values, ms } = timed("DS", `1.${"0".repeat(RUN)}`);
    expect(values).toEqual([1]);
    expect(ms).toBeLessThan(1_000);
  });
});

describe("decodeElementValue - the rewrite agrees with the shipped patterns", () => {
  it("trims every value of a multi-valued string VR exactly as the shipped regex did", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<VR>("LO", "CS"),
        fc.array(fc.constantFrom(" ", "a", "b", "\\"), { minLength: 1, maxLength: 24 }),
        (vr, parts) => {
          const text = parts.join("");
          const expected = unpadded(text).split("\\").map(SHIPPED_TRIM);
          expect(decodeElementValue(el(vr, ascii(text)))).toMatchObject({ values: expected });
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it("accepts and refuses exactly the DS literals the shipped grammar did", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("0", "7", ".", "e", "E", "+", "-", " ", "x", "\\"), {
          minLength: 1,
          maxLength: 16,
        }),
        (parts) => {
          const text = parts.join("");
          const expected = unpadded(text).split("\\").map(shippedDecimal);
          expect(decodeElementValue(el("DS", ascii(text)))).toMatchObject({ values: expected });
        },
      ),
      { numRuns: 4_000 },
    );
  });
});

/**
 * Unit tests for the Phase 1 public Dictionary namespace.
 *
 * D-21: Phase 1 unit tests cover only `src/dictionary/`. These tests use a
 * hand-curated set of
 * well-known tags / keywords / UIDs that are stable across DICOM editions.
 *
 * Each describe block references the DICT-* requirement it covers.
 */

import { describe, expect, it } from "vitest";
import * as Dictionary from "../../src/dictionary/index.js";

describe("Dictionary.lookup (DICT-03 + DICT-04)", () => {
  it("resolves PatientName by tag '00100010'", () => {
    const e = Dictionary.lookup("00100010");
    expect(e).toBeDefined();
    expect(e?.keyword).toBe("PatientName");
    expect(e?.vr).toContain("PN");
    expect(e?.tag).toBe("00100010");
    expect(e?.retired).toBe(false);
  });

  it("resolves PatientName by keyword 'PatientName' (DICT-04 bidirectional)", () => {
    const e = Dictionary.lookup("PatientName");
    expect(e).toBeDefined();
    expect(e?.tag).toBe("00100010");
  });

  it("returns identical entries for tag and keyword forms (DICT-04)", () => {
    const byTag = Dictionary.lookup("00100010");
    const byKw = Dictionary.lookup("PatientName");
    expect(byTag).toBeDefined();
    expect(byKw).toBeDefined();
    expect(byTag?.tag).toBe(byKw?.tag);
    expect(byTag?.keyword).toBe(byKw?.keyword);
    // Same object reference - TAGS map is the single source of truth.
    expect(byTag).toBe(byKw);
  });

  it("normalizes lowercase hex tags to upper", () => {
    const lower = Dictionary.lookup("00100010".toLowerCase());
    const upper = Dictionary.lookup("00100010");
    expect(lower).toBeDefined();
    expect(lower?.tag).toBe(upper?.tag);
  });

  it("rejects '0010,0010' tag with embedded comma (strict shape)", () => {
    expect(Dictionary.lookup("0010,0010")).toBeUndefined();
  });

  it("returns undefined for unknown keyword (D-10 no-throw)", () => {
    expect(Dictionary.lookup("ZZZ_NOT_REAL")).toBeUndefined();
  });

  it("returns undefined for empty string (D-10 no-throw)", () => {
    expect(Dictionary.lookup("")).toBeUndefined();
  });

  it("does NOT resolve repeating-group placeholder tags via lookup() (concrete-tags only)", () => {
    // (50xx,xxxx) family entries are stored under lowercase-x ids and are
    // intentionally not retrievable by concrete tag - Phase 2 will own
    // family-resolution logic.
    expect(Dictionary.lookup("50000000")).toBeUndefined();
  });
});

describe("Dictionary.byKeyword (DICT-04)", () => {
  it("resolves StudyInstanceUID", () => {
    const e = Dictionary.byKeyword("StudyInstanceUID");
    expect(e).toBeDefined();
    expect(e?.tag).toBe("0020000D");
    expect(e?.vr).toContain("UI");
  });

  it("resolves SeriesInstanceUID", () => {
    const e = Dictionary.byKeyword("SeriesInstanceUID");
    expect(e?.tag).toBe("0020000E");
    expect(e?.vr).toContain("UI");
  });

  it("resolves SOPInstanceUID", () => {
    const e = Dictionary.byKeyword("SOPInstanceUID");
    expect(e?.tag).toBe("00080018");
    expect(e?.vr).toContain("UI");
  });

  it("returns undefined for unknown keyword", () => {
    expect(Dictionary.byKeyword("DefinitelyNotAKeyword")).toBeUndefined();
  });

  it("returns undefined for empty keyword", () => {
    expect(Dictionary.byKeyword("")).toBeUndefined();
  });
});

describe("Dictionary.uid (DICT-06)", () => {
  it("resolves Explicit VR Little Endian transfer syntax", () => {
    const u = Dictionary.uid("1.2.840.10008.1.2.1");
    expect(u).toBeDefined();
    expect(u?.name).toBe("Explicit VR Little Endian");
    expect(u?.type).toBe("TransferSyntax");
    expect(u?.retired).toBe(false);
  });

  it("resolves Implicit VR Little Endian transfer syntax", () => {
    const u = Dictionary.uid("1.2.840.10008.1.2");
    expect(u).toBeDefined();
    expect(u?.name).toBe("Implicit VR Little Endian");
    expect(u?.type).toBe("TransferSyntax");
  });

  it("resolves Explicit VR Big Endian transfer syntax (retired in current edition)", () => {
    const u = Dictionary.uid("1.2.840.10008.1.2.2");
    expect(u).toBeDefined();
    expect(u?.type).toBe("TransferSyntax");
    expect(u?.retired).toBe(true);
  });

  it("resolves Deflated Explicit VR Little Endian transfer syntax", () => {
    const u = Dictionary.uid("1.2.840.10008.1.2.1.99");
    expect(u?.type).toBe("TransferSyntax");
    expect(u?.name).toBe("Deflated Explicit VR Little Endian");
  });

  it("resolves RLE Lossless transfer syntax", () => {
    const u = Dictionary.uid("1.2.840.10008.1.2.5");
    expect(u?.type).toBe("TransferSyntax");
    expect(u?.name).toBe("RLE Lossless");
  });

  it("resolves Verification SOP Class", () => {
    const u = Dictionary.uid("1.2.840.10008.1.1");
    expect(u?.type).toBe("SOPClass");
    expect(u?.name).toBe("Verification SOP Class");
  });

  it("resolves DICOM Application Context Name", () => {
    const u = Dictionary.uid("1.2.840.10008.3.1.1.1");
    expect(u?.type).toBe("ApplicationContext");
  });

  it("returns undefined for unknown UID", () => {
    expect(Dictionary.uid("not-a-uid")).toBeUndefined();
  });

  it("returns undefined for empty UID", () => {
    expect(Dictionary.uid("")).toBeUndefined();
  });
});

/**
 * The element registry is overlaid from the pinned NEMA PS3.6 DocBook, which is
 * normative, on top of the Innolitics mirror, which is convenient. These are the
 * differences that overlay resolves. They are asserted here rather than trusted,
 * because every one of them is a value a caller reads to make a clinical or
 * routing decision, and each was wrong in a different direction:
 *
 *   - a demographic attribute retired two editions ago and still marked current,
 *     with its two replacements missing entirely;
 *   - an RT dose attribute marked retired that the standard still defines
 *     (the direction that talks a caller out of reading a real dose);
 *   - two keywords truncated by the mirror, so the public `byKeyword` lookup
 *     missed on the spelling PS3.6 actually publishes.
 */
describe("PS3.6 normative overlay (DICOM-UPSTREAM-EDITION-LAG)", () => {
  it("marks (0010,2160) EthnicGroup retired, as PS3.6 2025a did", () => {
    const e = Dictionary.lookup("00102160");
    expect(e).toBeDefined();
    expect(e?.keyword).toBe("EthnicGroup");
    expect(e?.retired).toBe(true);
    // Retired is not removed: the keyword still resolves, so a caller reading an
    // older study is told what the tag is AND that it is no longer current.
    expect(Dictionary.byKeyword("EthnicGroup")?.tag).toBe("00102160");
  });

  it("carries EthnicGroup's replacements (0010,2161) and (0010,2162)", () => {
    const seq = Dictionary.lookup("00102161");
    expect(seq?.keyword).toBe("EthnicGroupCodeSequence");
    expect(seq?.vr).toEqual(["SQ"]);
    expect(seq?.vm).toBe("1");
    expect(seq?.retired).toBe(false);

    const groups = Dictionary.lookup("00102162");
    expect(groups?.keyword).toBe("EthnicGroups");
    expect(groups?.vr).toEqual(["UC"]);
    expect(groups?.vm).toBe("1-n");
    expect(groups?.retired).toBe(false);
  });

  it("does NOT mark (3004,0012) DoseValue retired, because PS3.6 still defines it", () => {
    const e = Dictionary.lookup("30040012");
    expect(e).toBeDefined();
    expect(e?.keyword).toBe("DoseValue");
    expect(e?.vr).toEqual(["DS"]);
    expect(e?.retired).toBe(false);
  });

  it("keeps (3004,0010) RTDoseROISequence retired, which is whose RET marker it was", () => {
    const e = Dictionary.lookup("30040010");
    expect(e?.keyword).toBe("RTDoseROISequence");
    expect(e?.retired).toBe(true);
  });

  it("spells (003A,0320) and (003A,0325) the way PS3.6 does", () => {
    expect(Dictionary.byKeyword("SummarizedFilterLookupTableSequence")?.tag).toBe("003A0320");
    expect(Dictionary.byKeyword("AnalogFilterTypeCodeSequence")?.tag).toBe("003A0325");
    // The truncated mirror spellings are gone rather than kept as aliases: they
    // were never PS3.6 keywords, and carrying them would preserve the defect.
    expect(Dictionary.byKeyword("SummarizedFilterLookupTable")).toBeUndefined();
    expect(Dictionary.byKeyword("AnalogFilterType")).toBeUndefined();
  });

  it("does not treat the DICONDE / DICOS column markers as retirement", () => {
    // Table 6-1's sixth column carries "RET (edition)" for retirement but also
    // "DICOS" and "DICONDE", which name the dictionary a row belongs to and say
    // nothing about retirement. Reading the cell as a boolean would retire 391
    // live tags. Only a leading RET retires.
    expect(Dictionary.lookup("00140028")?.keyword).toBe("ComponentManufacturer"); // DICONDE
    expect(Dictionary.lookup("00140028")?.retired).toBe(false);
    expect(Dictionary.lookup("40100001")?.keyword).toBe("LowEnergyDetectors"); // DICOS
    expect(Dictionary.lookup("40100001")?.retired).toBe(false);
  });

  it("strips the ZERO WIDTH SPACE PS3.6 prints inside keywords", () => {
    // PS3.6 2026c carries 13,470 U+200B line-break hints in the keyword column.
    // One left in produces a keyword that looks right and never matches.
    for (const kw of [
      "PatientName",
      "EthnicGroupCodeSequence",
      "SummarizedFilterLookupTableSequence",
    ]) {
      const e = Dictionary.byKeyword(kw);
      expect(e, kw).toBeDefined();
      expect(e?.keyword).toBe(kw);
      expect(/[\u200B\u00AD]/u.test(e?.keyword ?? "")).toBe(false);
    }
  });

  it("still resolves the safety-critical attributes the parser depends on", () => {
    // The overlay adds and corrects; it must not drop. Spot-check the tags the
    // typed patient/study/series/image views read.
    for (const [tag, keyword] of [
      ["00100010", "PatientName"],
      ["00100020", "PatientID"],
      ["00080060", "Modality"],
      ["0020000D", "StudyInstanceUID"],
      ["0020000E", "SeriesInstanceUID"],
      ["00080016", "SOPClassUID"],
      ["7FE00010", "PixelData"],
    ] as const) {
      expect(Dictionary.lookup(tag)?.keyword, tag).toBe(keyword);
    }
  });
});

describe("Dictionary entries are immutable (CLAUDE.md immutability guardrail)", () => {
  it("returned DictionaryEntry is frozen", () => {
    const e = Dictionary.lookup("00100010");
    expect(e).toBeDefined();
    expect(Object.isFrozen(e)).toBe(true);
    expect(() => {
      // Intentional mutation attempt at runtime - the deep-freeze in
      // src/dictionary/index.ts must reject this in strict mode.
      (e as unknown as { keyword: string }).keyword = "Hacked";
    }).toThrow();
  });

  it("returned UidEntry is frozen", () => {
    const u = Dictionary.uid("1.2.840.10008.1.2.1");
    expect(u).toBeDefined();
    expect(Object.isFrozen(u)).toBe(true);
    expect(() => {
      // Intentional mutation attempt at runtime.
      (u as unknown as { name: string }).name = "Tampered";
    }).toThrow();
  });
});

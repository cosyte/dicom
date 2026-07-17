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
    // Same object reference — TAGS map is the single source of truth.
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
    // intentionally not retrievable by concrete tag — Phase 2 will own
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

describe("Dictionary entries are immutable (CLAUDE.md immutability guardrail)", () => {
  it("returned DictionaryEntry is frozen", () => {
    const e = Dictionary.lookup("00100010");
    expect(e).toBeDefined();
    expect(Object.isFrozen(e)).toBe(true);
    expect(() => {
      // Intentional mutation attempt at runtime — the deep-freeze in
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

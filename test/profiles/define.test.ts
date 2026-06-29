/**
 * Unit tests for the Phase 6 profile factory (`defineProfile`), the canonical
 * private-key helpers (`canonicalPrivateKey` / `resolvePrivateTag`), and the
 * `ProfileDefinitionError` failure surface.
 *
 * These exercise the author-time layer in isolation — validation, `extends`
 * composition, immutability, and `describe()` — without touching the byte
 * parser. Private-creator strings used here are synthetic vendor schema
 * identifiers, never PHI.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { defineProfile, ProfileDefinitionError, WARNING_CODES } from "../../src/index.js";
import { canonicalPrivateKey, resolvePrivateTag } from "../../src/profiles/lookup.js";

describe("defineProfile: name + option-key validation", () => {
  it("throws on an empty / whitespace name", () => {
    expect(() => defineProfile({ name: "" })).toThrow(ProfileDefinitionError);
    expect(() => defineProfile({ name: "   " })).toThrow(/non-empty string/);
  });

  it("throws on an unknown top-level option key", () => {
    // @ts-expect-error — deliberately passing an unknown key to hit the guard.
    expect(() => defineProfile({ name: "x", privateTag: {} })).toThrow(
      /Unknown defineProfile option "privateTag"/,
    );
  });

  it("attaches the offending profile name to the error (when known)", () => {
    try {
      // @ts-expect-error — unknown key on a named profile.
      defineProfile({ name: "acme", bogus: 1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      expect((err as ProfileDefinitionError).profileName).toBe("acme");
    }
  });

  it("leaves profileName undefined when the name itself is invalid", () => {
    try {
      defineProfile({ name: "" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as ProfileDefinitionError).profileName).toBeUndefined();
    }
  });
});

describe("defineProfile: warning-code validation", () => {
  it("throws on an unknown escalate code", () => {
    expect(() =>
      // @ts-expect-error — not a member of the WarningCode union.
      defineProfile({ name: "x", escalate: ["NOPE"] }),
    ).toThrow(/escalate lists unknown warning code "NOPE"/);
  });

  it("throws on an unknown suppress code", () => {
    expect(() =>
      // @ts-expect-error — not a member of the WarningCode union.
      defineProfile({ name: "x", suppress: ["ALSO_NOPE"] }),
    ).toThrow(/suppress lists unknown warning code "ALSO_NOPE"/);
  });

  it("throws when a code is both escalated and suppressed", () => {
    expect(() =>
      defineProfile({
        name: "x",
        escalate: [WARNING_CODES.DICOM_VR_MISMATCH],
        suppress: [WARNING_CODES.DICOM_VR_MISMATCH],
      }),
    ).toThrow(/both escalates and suppresses/);
  });

  it("accepts disjoint escalate / suppress sets", () => {
    const p = defineProfile({
      name: "x",
      escalate: [WARNING_CODES.DICOM_VR_MISMATCH],
      suppress: [WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED],
    });
    expect(p.escalations.has(WARNING_CODES.DICOM_VR_MISMATCH)).toBe(true);
    expect(p.suppressions.has(WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED)).toBe(true);
  });
});

describe("defineProfile: private-dictionary validation + normalization", () => {
  it("throws on an empty private-creator key", () => {
    expect(() =>
      defineProfile({
        name: "x",
        privateTags: { "": { "0019XX10": { vr: "DS", keyword: "k", name: "n" } } },
      }),
    ).toThrow(/empty private-creator key/);
  });

  it("throws on a malformed private-tag key", () => {
    expect(() =>
      defineProfile({
        name: "x",
        privateTags: { ACME: { "00191010": { vr: "DS", keyword: "k", name: "n" } } },
      }),
    ).toThrow(/invalid private-tag key/);
  });

  it("throws on an invalid VR", () => {
    expect(() =>
      defineProfile({
        name: "x",
        // @ts-expect-error — "ZZ" is not a VR.
        privateTags: { ACME: { "0019XX10": { vr: "ZZ", keyword: "k", name: "n" } } },
      }),
    ).toThrow(/invalid VR "ZZ"/);
  });

  it("throws when keyword/name are not strings", () => {
    expect(() =>
      defineProfile({
        name: "x",
        // @ts-expect-error — keyword/name omitted; runtime guard must catch it.
        privateTags: { ACME: { "0019XX10": { vr: "DS" } } },
      }),
    ).toThrow(/must supply string "keyword" and "name"/);
  });

  it("normalizes a lowercase private-tag key to uppercase on store", () => {
    const p = defineProfile({
      name: "x",
      privateTags: { ACME: { "0019xx10": { vr: "DS", keyword: "k", name: "n" } } },
    });
    const inner = p.privateDictionary.get("ACME");
    expect(inner?.has("0019XX10")).toBe(true);
  });
});

describe("defineProfile: extends composition", () => {
  const base = defineProfile({
    name: "base",
    description: "base desc",
    escalate: [WARNING_CODES.DICOM_VR_MISMATCH],
    suppress: [WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED],
    privateTags: { ACME: { "0019XX10": { vr: "DS", keyword: "base", name: "base" } } },
  });

  it("merges a single parent's lineage, codes, and dictionary", () => {
    const child = defineProfile({ name: "child", extends: base });
    expect(child.lineage).toEqual(["base", "child"]);
    expect(child.escalations.has(WARNING_CODES.DICOM_VR_MISMATCH)).toBe(true);
    expect(child.suppressions.has(WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED)).toBe(true);
    expect(child.privateDictionary.get("ACME")?.get("0019XX10")?.keyword).toBe("base");
  });

  it("inherits the parent description when the child declares none", () => {
    const child = defineProfile({ name: "child", extends: base });
    expect(child.description).toBe("base desc");
  });

  it("child description wins over the parent's", () => {
    const child = defineProfile({ name: "child", description: "own", extends: base });
    expect(child.description).toBe("own");
  });

  it("child dictionary entry wins on a (creator, key) collision", () => {
    const child = defineProfile({
      name: "child",
      extends: base,
      privateTags: { ACME: { "0019XX10": { vr: "LO", keyword: "child", name: "child" } } },
    });
    expect(child.privateDictionary.get("ACME")?.get("0019XX10")?.keyword).toBe("child");
    expect(child.privateDictionary.get("ACME")?.get("0019XX10")?.vr).toBe("LO");
  });

  it("de-duplicates lineage across multiple parents sharing an ancestor", () => {
    const left = defineProfile({ name: "left", extends: base });
    const right = defineProfile({ name: "right", extends: base });
    const grand = defineProfile({ name: "grand", extends: [left, right] });
    expect(grand.lineage).toEqual(["base", "left", "right", "grand"]);
  });

  it("detects a contradiction introduced by composition (parent escalates, child suppresses)", () => {
    expect(() =>
      defineProfile({
        name: "child",
        extends: base,
        suppress: [WARNING_CODES.DICOM_VR_MISMATCH],
      }),
    ).toThrow(/both escalates and suppresses/);
  });
});

describe("defineProfile: immutability + describe()", () => {
  it("freezes the returned profile and its inner collections", () => {
    const p = defineProfile({
      name: "x",
      privateTags: { ACME: { "0019XX10": { vr: "DS", keyword: "k", name: "n" } } },
    });
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.escalations)).toBe(true);
    expect(Object.isFrozen(p.suppressions)).toBe(true);
    expect(Object.isFrozen(p.privateDictionary)).toBe(true);
    expect(Object.isFrozen(p.privateDictionary.get("ACME"))).toBe(true);
  });

  it("describe() renders a deterministic one-line summary", () => {
    const p = defineProfile({
      name: "demo",
      escalate: [WARNING_CODES.DICOM_VR_MISMATCH],
      suppress: [WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED],
      privateTags: {
        ACME: {
          "0019XX10": { vr: "DS", keyword: "a", name: "a" },
          "0019XX11": { vr: "DS", keyword: "b", name: "b" },
        },
      },
    });
    expect(p.describe?.()).toBe(
      'profile "demo"; lineage [demo]; escalations 1; suppressions 1; private 2 tag(s) across 1 creator(s)',
    );
  });
});

describe("canonicalPrivateKey + resolvePrivateTag", () => {
  it("collapses the file-assigned block byte to the XX placeholder", () => {
    expect(canonicalPrivateKey("00291010")).toBe("0029XX10");
    expect(canonicalPrivateKey("0029ff20")).toBe("0029XX20");
  });

  it("resolves a known (creator, block, element) triple regardless of block byte", () => {
    const p = defineProfile({
      name: "x",
      privateTags: { "ACME HDR": { "0029XX10": { vr: "OB", keyword: "blob", name: "Blob" } } },
    });
    // Block 0x10 and block 0xFF both map to the same canonical key.
    expect(resolvePrivateTag(p, "00291010", "ACME HDR")?.vr).toBe("OB");
    expect(resolvePrivateTag(p, "0029ff10", "ACME HDR")?.vr).toBe("OB");
  });

  it("returns undefined for an unknown creator or unmapped element", () => {
    const p = defineProfile({
      name: "x",
      privateTags: { "ACME HDR": { "0029XX10": { vr: "OB", keyword: "blob", name: "Blob" } } },
    });
    expect(resolvePrivateTag(p, "00291010", "OTHER")).toBeUndefined();
    expect(resolvePrivateTag(p, "00291099", "ACME HDR")).toBeUndefined();
  });
});

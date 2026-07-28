/**
 * Unit tests for the PS3.15 Annex E lookup helper (`annexE`).
 *
 * D-08 / D-09 / D-14 shipped the generated Annex E action table; this exercises the
 * thin lookup wrapper over it so the `src/dictionary/` coverage gate stays honest
 * (Phase 7's `anonymize()` is the production consumer, not yet landed).
 *
 * Tags asserted here are stable PS3.15 Table E.1-1 entries.
 */

import { describe, expect, it } from "vitest";
import { annexE } from "../../src/dictionary/annex-e.js";
import { ANNEX_E } from "../../src/dictionary/generated/annex-e.js";

describe("annexE (PS3.15 Annex E lookup)", () => {
  it("resolves Patient's Name (00100010) to a Basic-Profile Z action", () => {
    const a = annexE("00100010");
    expect(a).toBeDefined();
    expect(a?.tag).toBe("00100010");
    expect(a?.keyword).toBe("Patient's Name");
    expect(a?.basicProfile).toBe("Z");
  });

  it("carries per-option-set overrides (Study Instance UID retains under RetainUIDs)", () => {
    const a = annexE("0020000D");
    expect(a?.basicProfile).toBe("U");
    expect(a?.optionSet.RetainUIDs).toBe("K");
  });

  it("normalizes lowercase hex tags to upper before lookup", () => {
    const lower = annexE("0020000d");
    const upper = annexE("0020000D");
    expect(lower).toBeDefined();
    expect(lower).toBe(upper);
  });

  it("returns undefined for a tag with no Annex E entry", () => {
    // (7FE0,0010) PixelData is not in Table E.1-1.
    expect(annexE("7FE00010")).toBeUndefined();
  });

  it("returns undefined for the empty string (no-throw)", () => {
    expect(annexE("")).toBeUndefined();
  });

  it("returns undefined for a non-string input (no-throw)", () => {
    expect(annexE(undefined as unknown as string)).toBeUndefined();
  });
});

/**
 * The PS3.15 normative overlay.
 *
 * The action table used to come from a third-party mirror alone, pinned at a
 * 2024b-era snapshot. PS3.15 2026c publishes 652 concrete attributes; that
 * snapshot carried 617. The 35 it was missing were not obscure: they are the
 * `(0010,00xx)` person-name / pronoun attributes, the `(0010,004x)` gender
 * identity and sex-parameters-for-clinical-use attributes, and the two
 * attributes that replaced the retired `(0010,2160)` Ethnic Group. 32 of the 35
 * are marked X (remove) by the standard; the other three are `(0040,B020)`
 * (`X/D`), `(0070,0006)` (`D`) and `(300A,0054)` (`U`).
 *
 * Because `annexE()` returns `undefined` for a tag it does not carry, and
 * `deidentify()` reads `undefined` as "not listed, keep", each of those patient
 * attributes survived a call whose entire contract is that it does not, and the
 * report said nothing. These assertions are the ones that fail on the old table.
 */
describe("PS3.15 normative overlay (DICOM-ANNEX-E-DEID-LAG)", () => {
  it("removes (0010,0012) Name to Use, a patient's preferred name", () => {
    const a = annexE("00100012");
    expect(a).toBeDefined();
    expect(a?.keyword).toBe("Name to Use");
    expect(a?.basicProfile).toBe("X");
  });

  it("removes the whole person-names-to-use and pronoun block", () => {
    for (const [tag, keyword] of [
      ["00100011", "Person Names to Use Sequence"],
      ["00100012", "Name to Use"],
      ["00100013", "Name to Use Comment"],
      ["00100014", "Third Person Pronouns Sequence"],
      ["00100015", "Pronoun Code Sequence"],
      ["00100016", "Pronoun Comment"],
    ] as const) {
      const a = annexE(tag);
      expect(a, tag).toBeDefined();
      expect(a?.keyword).toBe(keyword);
      expect(a?.basicProfile, tag).toBe("X");
    }
  });

  it("removes the gender-identity and sex-parameters block", () => {
    for (const tag of [
      "00100041",
      "00100042",
      "00100043",
      "00100044",
      "00100045",
      "00100046",
      "00100047",
    ]) {
      expect(annexE(tag)?.basicProfile, tag).toBe("X");
    }
  });

  it("removes (0010,2161) and (0010,2162), the replacements for Ethnic Group", () => {
    // (0010,2160) EthnicGroup was retired by PS3.6 and its two replacements were
    // added to the data dictionary first. Until this overlay landed, the
    // de-identifier recognized them as elements and had no action for them, so
    // it kept them while removing the attribute they replaced.
    expect(annexE("00102160")?.basicProfile).toBe("X");
    expect(annexE("00102161")?.basicProfile).toBe("X");
    expect(annexE("00102162")?.basicProfile).toBe("X");
    // The option column comes through with them, so RetainPatientCharacteristics
    // still behaves as it does for the attribute they replaced.
    expect(annexE("00102160")?.optionSet.RetainPatientCharacteristics).toBe("K");
    expect(annexE("00102161")?.optionSet.RetainPatientCharacteristics).toBe("K");
    expect(annexE("00102162")?.optionSet.RetainPatientCharacteristics).toBe("K");
  });

  it("carries the diagnosis code sequences the mirror was missing", () => {
    for (const tag of ["00081301", "00081302", "00081303", "00081304"]) {
      const a = annexE(tag);
      expect(a?.basicProfile, tag).toBe("X");
      expect(a?.optionSet.CleanDescriptors, tag).toBe("C");
    }
  });

  it("carries the three additions that are not X, with the code the standard prints", () => {
    // Not every late addition is a removal, and saying so keeps the record
    // honest: PS3.15 marks these three X/D, D and U respectively. Each is still
    // acted on, which is the point; none is kept.
    expect(annexE("0040B020")?.basicProfile).toBe("X/D"); // Waveform Annotation Sequence
    expect(annexE("00700006")?.basicProfile).toBe("D"); // Unformatted Text Value
    expect(annexE("300A0054")?.basicProfile).toBe("U"); // Table Top Position Alignment UID
    expect(annexE("300A0054")?.optionSet.RetainUIDs).toBe("K");
  });

  it("corrects (0032,1033) Requesting Service, whose option column the mirror dropped", () => {
    expect(annexE("00321033")?.basicProfile).toBe("X");
    expect(annexE("00321033")?.optionSet.CleanDescriptors).toBe("C");
  });

  it("carries every concrete row of PS3.15 2026c Table E.1-1", () => {
    // 652 concrete tags. The four family rows Table E.1-1 states as a mask
    // ((50xx,xxxx), (60xx,3000), (60xx,4000), and the odd-group private row)
    // cannot be keys in an exact-tag map; the generator counts and prints them
    // on every run rather than dropping them in silence.
    expect(Object.keys(ANNEX_E).length).toBe(652);
  });

  it("did not drop anything the previous table carried", () => {
    // The overlay adds and corrects; it must not remove. A mirror-only row is
    // KEPT, because PS3.15 retires rows rather than deleting them. Spot-check
    // the attributes every de-identification depends on.
    for (const [tag, code] of [
      ["00100010", "Z"], // Patient's Name
      ["00100020", "Z/D"], // Patient ID
      ["00100030", "Z"], // Patient's Birth Date
      ["00080050", "Z"], // Accession Number
      ["00080090", "Z"], // Referring Physician's Name
      ["00080080", "X/Z/D"], // Institution Name
      ["0020000D", "U"], // Study Instance UID
      ["0020000E", "U"], // Series Instance UID
    ] as const) {
      expect(annexE(tag)?.basicProfile, tag).toBe(code);
    }
  });

  it("emits only action codes from Table E.1-1a", () => {
    const codes = new Set([
      "D",
      "Z",
      "X",
      "K",
      "C",
      "U",
      "Z/D",
      "X/Z",
      "X/D",
      "X/Z/D",
      "X/Z/U*",
      "C/X",
    ]);
    for (const entry of Object.values(ANNEX_E)) {
      expect(codes.has(entry.basicProfile), `${entry.tag} ${entry.basicProfile}`).toBe(true);
      for (const [option, code] of Object.entries(entry.optionSet)) {
        expect(codes.has(code as string), `${entry.tag} ${option} ${String(code)}`).toBe(true);
      }
    }
  });
});

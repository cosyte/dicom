/**
 * Phase 6 capstone — source/vendor profile behaviour end-to-end (D-45).
 *
 * Verifies the four acceptance pillars of DICOM-6 against programmatic
 * fixtures (D-38 — no curated `.dcm` files):
 *   1. A vendor profile's private-dictionary overlay resolves the Implicit VR
 *      of a private data element from the LIVE creator string (not a block).
 *   2. Selecting a profile NEVER changes a correct decode — unprofiled and
 *      profiled parses of the same valid file agree on every standard element.
 *   3. A posture preset reshapes warning emission: `strict` escalates an
 *      integrity-relevant warning to a thrown error; `lenient` suppresses a
 *      cosmetic one.
 *   4. A creator the active profile does not recognize degrades to generic UN
 *      plus `DICOM_PRIVATE_CREATOR_UNKNOWN` — never a wrong decode.
 *
 * Private-creator strings are public vendor schema identifiers, not PHI.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomParseError,
  defineProfile,
  parseDicom,
  profiles,
  WARNING_CODES,
  type Element,
} from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}
function elementsOf(ds: object): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

/**
 * Implicit VR LE fixture carrying a private creator at `(group,0010)` plus a
 * private data element in that creator's block. The creator owns block `0x10`,
 * so the data element is `(group,10LL)` → canonical key `"<group>XX<LL>"`.
 */
function buildPrivateFixture(creator: string, group = "0029", elementByte = "10"): Buffer {
  return buildDicom({
    transferSyntax: TS_IMPLICIT_LE,
    elements: [
      { tag: `${group}0010`, vr: "LO", value: padEven(Buffer.from(creator, "ascii")) },
      {
        tag: `${group}10${elementByte}`,
        vr: "UN",
        value: Buffer.from([0x01, 0x02, 0x03, 0x04]),
      },
    ],
  });
}

function padEven(buf: Buffer): Buffer {
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x00])]);
}

describe("profile pillar 1: private-dictionary overlay resolves Implicit VR from the live creator", () => {
  it("resolves Siemens CSA (0029,xx10) to OB with no creator-unknown warning", () => {
    const buf = buildPrivateFixture("SIEMENS CSA HEADER");
    const ds = parseDicom(buf, { profile: profiles.siemens });
    const el = elementsOf(ds).get("00291010");
    expect(el?.vr).toBe("OB");
    expect(el?.privateCreator).toBe("SIEMENS CSA HEADER");
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_PRIVATE_CREATOR_UNKNOWN)).toBe(
      false,
    );
  });

  it("degrades to UN with no profile (Phase 2 baseline unchanged)", () => {
    const buf = buildPrivateFixture("SIEMENS CSA HEADER");
    const ds = parseDicom(buf);
    const el = elementsOf(ds).get("00291010");
    expect(el?.vr).toBe("UN");
    expect(
      ds.warnings.some(
        (w) => w.code === WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR,
      ),
    ).toBe(true);
  });

  it("resolves a GE GEMS block element from its creator", () => {
    const buf = buildPrivateFixture("GEMS_ACQU_01", "0019", "9C");
    const ds = parseDicom(buf, { profile: profiles.ge });
    expect(elementsOf(ds).get("0019109C")?.vr).toBe("LO");
  });

  it("works with a user-defined profile via defineProfile", () => {
    const acme = defineProfile({
      name: "acme",
      privateTags: { "ACME PRIV 01": { "0019XX10": { vr: "DS", keyword: "dose", name: "Dose" } } },
    });
    const buf = buildPrivateFixture("ACME PRIV 01", "0019", "10");
    expect(elementsOf(parseDicom(buf, { profile: acme })).get("00191010")?.vr).toBe("DS");
  });
});

describe("profile pillar 2: a profile never changes a correct decode", () => {
  const buf = buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [
      { tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") },
      { tag: "00080060", vr: "CS", value: Buffer.from("MR", "ascii") },
    ],
  });

  it("standard elements decode identically with and without a vendor profile", () => {
    const plain = elementsOf(parseDicom(buf));
    const profiled = elementsOf(parseDicom(buf, { profile: profiles.siemens }));
    for (const tag of ["00100010", "00080060"] as const) {
      expect(profiled.get(tag)?.vr).toBe(plain.get(tag)?.vr);
      expect(profiled.get(tag)?.rawBytes.equals(plain.get(tag)?.rawBytes ?? Buffer.alloc(0))).toBe(
        true,
      );
    }
  });
});

describe("profile pillar 3: posture presets reshape warning emission", () => {
  it("strict escalates an integrity-relevant warning (VR mismatch) to a thrown error", () => {
    // (0010,0010) is PN in the dictionary; on-wire VR LO triggers VR_MISMATCH.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100010", vr: "LO", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    // Baseline: a tolerated warning, no throw.
    expect(parseDicom(buf).warnings.some((w) => w.code === WARNING_CODES.DICOM_VR_MISMATCH)).toBe(
      true,
    );
    // strict preset: the same deviation now throws.
    try {
      parseDicom(buf, { profile: profiles.strict });
      expect.unreachable("strict should have escalated VR_MISMATCH");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      expect((err as DicomParseError).code).toBe(WARNING_CODES.DICOM_VR_MISMATCH);
    }
  });

  it("lenient suppresses a cosmetic warning (missing preamble)", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      skipPreamble: true,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    expect(
      parseDicom(buf).warnings.some((w) => w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE),
    ).toBe(true);
    expect(
      parseDicom(buf, { profile: profiles.lenient }).warnings.some(
        (w) => w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE,
      ),
    ).toBe(false);
  });
});

describe("profile pillar 4: unknown creator degrades to UN, never a wrong decode", () => {
  it("flags DICOM_PRIVATE_CREATOR_UNKNOWN and keeps VR=UN when the profile lacks the creator", () => {
    // A Siemens-block fixture parsed under the GE profile: GE does not know
    // the Siemens creator, so the element must degrade — not mis-resolve.
    const buf = buildPrivateFixture("SIEMENS CSA HEADER");
    const ds = parseDicom(buf, { profile: profiles.ge });
    expect(elementsOf(ds).get("00291010")?.vr).toBe("UN");
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_PRIVATE_CREATOR_UNKNOWN)).toBe(
      true,
    );
  });

  it("does not emit creator-unknown when the creator is known but the element is unmapped", () => {
    // Creator known to Siemens, but element byte 0x99 is not in its table.
    const buf = buildPrivateFixture("SIEMENS CSA HEADER", "0029", "99");
    const ds = parseDicom(buf, { profile: profiles.siemens });
    expect(elementsOf(ds).get("00291099")?.vr).toBe("UN");
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_PRIVATE_CREATOR_UNKNOWN)).toBe(
      false,
    );
  });
});

describe("profiles namespace", () => {
  it("exposes the five built-ins, each with a describe() summary", () => {
    for (const name of ["ge", "siemens", "philips", "strict", "lenient"] as const) {
      const p = profiles[name];
      expect(p.name).toBe(name);
      expect(p.describe?.()).toContain(`profile "${name}"`);
    }
  });
});

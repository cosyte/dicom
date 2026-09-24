/**
 * Dose Calculation Model Name (3004,007F), the attribute PS3.6 and PS3.15 2026d add:
 * AC-2, AC-3 and AC-5 to AC-8.
 *
 * Until the 2026d re-pin neither the dictionary nor Table E.1-1 carried this tag, so
 * `annexE()` returned `undefined` and `deidentify()` kept the value verbatim under
 * every Option, with a clean report. These tests are the ones that fail on the
 * 2026c tables.
 *
 * Every fixture here is SYNTHETIC, built in memory by `test/helpers/build-dicom.ts`;
 * nothing is real and nothing is anonymised. The payload is an invented model name
 * carrying an invented person's name, because a PHI test whose payload names nobody
 * proves nothing, and it is spelled without a `^` so it is not a PN-shaped value.
 *
 * Tiers (`standards-conformance` S4): AC-2, AC-3 and AC-5 to AC-8 are Tier 1, a
 * spec-clean object read and de-identified; the serialized half of AC-5 is Tier 3.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DEIDENTIFY_OPTIONS,
  deidentify,
  parseDicom,
  serializeDicom,
  type Dataset,
  type DeidentifiedAttribute,
  type DeidentifyOption,
} from "../../src/index.js";
import { annexE } from "../../src/dictionary/annex-e.js";
import type { Tag } from "../../src/dictionary/types.js";
import { buildDicom, type BuildDicomOptions } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_IMPLICIT_LE = "1.2.840.10008.1.2";

const DOSE_MODEL: Tag = "3004007F";
/** Study Description, the reference Table E.1-1 row for AC-7: Basic X, Clean Descriptors C. */
const STUDY_DESCRIPTION: Tag = "00081030";
/** Manufacturer, which Table E.1-1 does not list: the AC-5 mutation control. */
const UNLISTED: Tag = "00080070";
/** Referenced RT Plan Sequence and Referenced Structure Set Sequence, both unlisted. */
const OUTER_SQ: Tag = "300C0002";
const INNER_SQ: Tag = "300C0060";

/** Synthetic, name-bearing, even length. */
const MODEL_NAME = "CCC MODEL DR XANTHIPPE QUORNSBY ";
/** The parts of the payload that name the person, each searched for on its own. */
const NAME_PARTS = [MODEL_NAME.trimEnd(), "XANTHIPPE", "QUORNSBY"] as const;

const SOP_INSTANCE = "2.25.100200300400500600700800900";

function text(value: string): Buffer {
  const b = Buffer.from(value, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

interface FixtureOptions {
  /** The tag the payload is written under. */
  readonly tag?: Tag;
  readonly transferSyntax?: string;
  /** Also carry the payload one and two Sequence Items down. */
  readonly nested?: boolean;
}

function buildFixture(options: FixtureOptions = {}): Dataset {
  const { tag = DOSE_MODEL, transferSyntax = TS_EXPLICIT_LE, nested = false } = options;
  const payload = { tag, vr: "LO" as const, value: text(MODEL_NAME) };
  const elements: BuildDicomOptions["elements"] = [
    { tag: "00080018", vr: "UI", value: text(SOP_INSTANCE) },
    { tag: STUDY_DESCRIPTION, vr: "LO", value: text("RT DOSE REVIEW") },
    payload,
    ...(nested
      ? [
          {
            tag: OUTER_SQ,
            items: [
              {
                elements: [payload, { tag: INNER_SQ, items: [{ elements: [payload] }] }],
              },
            ],
          },
        ]
      : []),
  ];
  // Ascending tag order, as a conformant writer emits it.
  const sorted = [...elements].sort((a, b) => a.tag.localeCompare(b.tag));
  return parseDicom(
    buildDicom({ transferSyntax, mediaStorageSOPInstanceUID: SOP_INSTANCE, elements: sorted }),
  );
}

function auditsFor(
  attributes: readonly DeidentifiedAttribute[],
  tag: Tag,
): DeidentifiedAttribute[] {
  return attributes.filter((a) => a.tag === tag);
}

/** Every subset of the published Option set that `validateRetain` accepts. */
function legalCombinations(): DeidentifyOption[][] {
  const all: DeidentifyOption[][] = [];
  for (let mask = 0; mask < 1 << DEIDENTIFY_OPTIONS.length; mask++) {
    const combo = DEIDENTIFY_OPTIONS.filter((_, i) => (mask & (1 << i)) !== 0);
    const bothTemporal =
      combo.includes("RetainLongitudinalTemporal") &&
      combo.includes("RetainLongitudinalTemporalModifiedDates");
    if (!bothTemporal) all.push(combo);
  }
  return all;
}

describe("Dose Calculation Model Name (3004,007F) under the Basic Profile", () => {
  it("AC-2: removes it", () => {
    expect(annexE(DOSE_MODEL)?.basicProfile).toBe("X");
    const { dataset } = deidentify(buildFixture());
    expect(dataset.has(DOSE_MODEL)).toBe(false);
  });
});

describe("Dose Calculation Model Name (3004,007F) under Clean Descriptors", () => {
  it("AC-3: applies the C action Table E.1-1 assigns it under that Option", () => {
    expect(annexE(DOSE_MODEL)?.optionSet.CleanDescriptors).toBe("C");
    const { dataset } = deidentify(buildFixture(), { retain: ["CleanDescriptors"] });
    expect(dataset.has(DOSE_MODEL)).toBe(true);
    expect(dataset.get(DOSE_MODEL)?.rawBytes.length).toBe(0);
  });
});

describe("the audit and the serialized output (AC-5)", () => {
  const cases = [
    { label: "Basic Profile", retain: [] as DeidentifyOption[], action: "X", applied: "removed" },
    {
      label: "CleanDescriptors",
      retain: ["CleanDescriptors"] as DeidentifyOption[],
      action: "C",
      applied: "cleaned",
    },
  ] as const;

  for (const c of cases) {
    it(`AC-5: under ${c.label}, audits ${c.action} ${c.applied} and serializes none of the name`, () => {
      const { dataset, report } = deidentify(buildFixture(), { retain: [...c.retain] });
      expect(auditsFor(report.attributes, DOSE_MODEL)).toEqual([
        {
          tag: DOSE_MODEL,
          keyword: "Dose Calculation Model Name",
          action: c.action,
          applied: c.applied,
        },
      ]);
      const out = serializeDicom(dataset);
      for (const part of NAME_PARTS) {
        expect(out.includes(Buffer.from(part, "latin1")), part).toBe(false);
      }
    });
  }

  it("AC-5: the mutation control, the same value under an unlisted tag, is found in the output", () => {
    // Proves the absence assertion above can go red: the serializer and the byte
    // search are the same, only the tag differs, and a tag Table E.1-1 does not
    // list is kept.
    expect(annexE(UNLISTED)).toBeUndefined();
    for (const c of cases) {
      const { dataset } = deidentify(buildFixture({ tag: UNLISTED }), { retain: [...c.retain] });
      const out = serializeDicom(dataset);
      for (const part of NAME_PARTS) {
        expect(out.includes(Buffer.from(part, "latin1")), `${c.label}: ${part}`).toBe(true);
      }
    }
  });
});

describe("inside Sequence Items (AC-6)", () => {
  const cases = [
    { label: "Basic Profile", retain: [] as DeidentifyOption[], action: "X", applied: "removed" },
    {
      label: "CleanDescriptors",
      retain: ["CleanDescriptors"] as DeidentifyOption[],
      action: "C",
      applied: "cleaned",
    },
  ] as const;

  for (const c of cases) {
    it(`AC-6: under ${c.label}, acts on it one and two Items down as at the top level`, () => {
      expect(annexE(OUTER_SQ)).toBeUndefined();
      expect(annexE(INNER_SQ)).toBeUndefined();
      const { dataset, report } = deidentify(buildFixture({ nested: true }), {
        retain: [...c.retain],
      });

      const audits = auditsFor(report.attributes, DOSE_MODEL);
      expect(audits.map((a) => a.contextPath)).toEqual([
        undefined,
        [`${OUTER_SQ}[0]`],
        [`${OUTER_SQ}[0]`, `${INNER_SQ}[0]`],
      ]);
      for (const a of audits) {
        expect(a.keyword).toBe("Dose Calculation Model Name");
        expect(a.action).toBe(c.action);
        expect(a.applied).toBe(c.applied);
      }

      const outer = dataset.get(OUTER_SQ)?.items?.[0];
      const inner = outer?.get(INNER_SQ)?.items?.[0];
      expect(outer, "the outer Item survives").toBeDefined();
      expect(inner, "the nested Item survives").toBeDefined();
      for (const ds of [dataset, outer, inner]) {
        if (c.action === "X") expect(ds?.has(DOSE_MODEL)).toBe(false);
        else expect(ds?.get(DOSE_MODEL)?.rawBytes.length).toBe(0);
      }

      const out = serializeDicom(dataset);
      for (const part of NAME_PARTS) {
        expect(out.includes(Buffer.from(part, "latin1")), part).toBe(false);
      }
    });
  }
});

describe("every legal combination of Options (AC-7)", () => {
  it("AC-7: removes it without CleanDescriptors, and treats it as Study Description with it", () => {
    const combos = legalCombinations();
    // 2^10 subsets, less the 2^8 that carry both E.3.6 temporal Options.
    expect(combos).toHaveLength(768);
    for (const retain of combos) {
      const label = retain.join("+") || "(none)";
      const { dataset, report } = deidentify(buildFixture(), { retain });
      const model = auditsFor(report.attributes, DOSE_MODEL);
      if (!retain.includes("CleanDescriptors")) {
        expect(dataset.has(DOSE_MODEL), label).toBe(false);
        expect(
          model.map((a) => [a.action, a.applied]),
          label,
        ).toEqual([["X", "removed"]]);
        continue;
      }
      const study = auditsFor(report.attributes, STUDY_DESCRIPTION);
      expect(
        model.map((a) => [a.action, a.applied]),
        label,
      ).toEqual(study.map((a) => [a.action, a.applied]));
      expect(
        model.map((a) => a.action),
        label,
      ).toEqual(["C"]);
      expect(dataset.get(DOSE_MODEL)?.rawBytes, label).toEqual(
        dataset.get(STUDY_DESCRIPTION)?.rawBytes,
      );
      expect(dataset.get(DOSE_MODEL)?.rawBytes.length, label).toBe(0);
    }
  });
});

describe("parsing under Implicit VR Little Endian (AC-8)", () => {
  it("AC-8: gives (3004,007F) VR LO from the dictionary", () => {
    const ds = buildFixture({ transferSyntax: TS_IMPLICIT_LE });
    const el = ds.get(DOSE_MODEL);
    expect(el).toBeDefined();
    expect(el?.vr).toBe("LO");
    expect(el?.rawBytes.toString("latin1")).toBe(MODEL_NAME);
  });
});

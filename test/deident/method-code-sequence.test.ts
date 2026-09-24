/**
 * `(0012,0064)` De-identification Method Code Sequence, written by `deidentify()`
 * (S0356-dicom-13).
 *
 * PS3.15 2026c §E.1.1, read from the SHA-pinned `vendor/nema/part15/`: "one or
 * more codes from CID 7050 "De-identification Method" corresponding to the Profile
 * and Options used shall be added to De-identification Method Code Sequence
 * (0012,0064), and/or a text string describing the method used shall be inserted
 * in or added to De-identification Method (0012,0063)." The text half was already
 * written; this file grades the coded half beside it.
 *
 * The CID 7050 rows below are the spec's Definitions table, quoted from PS3.16
 * 2026d CID 7050 (context group version `20170914`, UID `1.2.840.10008.6.1.925`),
 * and are the external source of truth the package constant is held against.
 *
 * Every test names the acceptance criterion it grades. Each describe block names
 * its `standards-conformance` S4 tier: **Tier 1** is spec-clean emission (and a
 * spec-clean prior sequence the run adds to), **Tier 2** is the unreadable prior a
 * real sender can produce, **Tier 3** is the round trip and the fixed point.
 *
 * FIXTURES ARE SYNTHETIC. Every Data Set here is built in memory by
 * `test/helpers/build-dicom.ts` or constructed directly. `DOE^JANE` and
 * `SMITHSON^BRAIN` are allow-listed synthetic names, `99SYN` is an invented coding
 * scheme, the dates are `19000101`, and no real object or patient data is used.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEIDENTIFICATION_METHOD_CODES,
  DEIDENTIFY_OPTIONS,
  Dataset,
  Element,
  WARNING_CODES,
  deidentify,
  parseDicom,
  serializeDicom,
  type DeidentifyOption,
  type DicomParseWarning,
} from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import {
  WARNING_MESSAGES,
  deidentMethodCodesPriorReplaced,
  deidentMethodCodesPriorRetained,
} from "../../src/parser/warnings.js";
import { buildDicom, type BuildDicomOptions } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const ENCODINGS = [TS_IMPLICIT_LE, TS_EXPLICIT_LE, TS_EXPLICIT_BE] as const;

const CODE_SEQUENCE: Tag = "00120064";
const METHOD_TEXT: Tag = "00120063";
const IDENTITY_REMOVED: Tag = "00120062";
const CODE_VALUE: Tag = "00080100";
const CODING_SCHEME_DESIGNATOR: Tag = "00080102";
const CODE_MEANING: Tag = "00080104";

/** A synthetic, allow-listed name, placed where a sender could put one. */
const NAME = "SMITHSON^BRAIN";

/** The spec's Definitions table: PS3.16 2026d CID 7050, every row `DCM`. */
const CID_7050: readonly (readonly [string, string])[] = [
  ["113100", "Basic Application Confidentiality Profile"],
  ["113101", "Clean Pixel Data Option"],
  ["113102", "Clean Recognizable Visual Features Option"],
  ["113103", "Clean Graphics Option"],
  ["113104", "Clean Structured Content Option"],
  ["113105", "Clean Descriptors Option"],
  ["113106", "Retain Longitudinal Temporal Information Full Dates Option"],
  ["113107", "Retain Longitudinal Temporal Information Modified Dates Option"],
  ["113108", "Retain Patient Characteristics Option"],
  ["113109", "Retain Device Identity Option"],
  ["113110", "Retain UIDs Option"],
  ["113111", "Retain Safe Private Option"],
  ["113112", "Retain Institution Identity Option"],
];

/** The Definitions table's "written when" column, one row per Option. */
const WRITTEN_FOR: Readonly<Record<DeidentifyOption, string>> = {
  CleanGraphics: "113103",
  CleanStructuredContent: "113104",
  CleanDescriptors: "113105",
  RetainLongitudinalTemporal: "113106",
  RetainLongitudinalTemporalModifiedDates: "113107",
  RetainPatientCharacteristics: "113108",
  RetainDeviceIdentity: "113109",
  RetainUIDs: "113110",
  RetainSafePrivate: "113111",
  RetainInstitutionIdentity: "113112",
};

const FULL_DATES: DeidentifyOption = "RetainLongitudinalTemporal";
const MODIFIED_DATES: DeidentifyOption = "RetainLongitudinalTemporalModifiedDates";

/** The default `(0012,0063)` Profile value at the pin. */
const DEFAULT_METHOD_PROFILE = "@cosyte/dicom Basic Application Level Confidentiality Profile";

/** One coded entry as a recipient reads it: trailing pad trimmed. */
interface Code {
  readonly value: string;
  readonly designator: string;
  readonly meaning: string;
}

function pad(text: string): Buffer {
  const raw = Buffer.from(text, "latin1");
  return raw.length % 2 === 0 ? raw : Buffer.concat([raw, Buffer.from([0x20])]);
}

function unpad(raw: Buffer | undefined): string {
  return (raw ?? Buffer.alloc(0)).toString("latin1").replace(/[\0 ]+$/u, "");
}

function codeOf(value: string): Code {
  const found = CID_7050.find(([v]) => v === value);
  if (found === undefined) throw new Error(`no CID 7050 row ${value}`);
  return { value, designator: "DCM", meaning: found[1] };
}

/** The top-level `(0012,0064)` Items, in order, as codes. */
function codesOf(ds: Dataset): Code[] {
  return (ds.get(CODE_SEQUENCE)?.items ?? []).map((item) => ({
    value: unpad(item.get(CODE_VALUE)?.rawBytes),
    designator: unpad(item.get(CODING_SCHEME_DESIGNATOR)?.rawBytes),
    meaning: unpad(item.get(CODE_MEANING)?.rawBytes),
  }));
}

/** What this run should record on a source without `(0012,0064)`. */
function expectedCodes(retain: readonly DeidentifyOption[]): Code[] {
  return [
    codeOf("113100"),
    ...DEIDENTIFY_OPTIONS.filter((o) => retain.includes(o)).map((o) => codeOf(WRITTEN_FOR[o])),
  ];
}

function isLegal(retain: readonly DeidentifyOption[]): boolean {
  return !(retain.includes(FULL_DATES) && retain.includes(MODIFIED_DATES));
}

/**
 * The legal option domain: every subset of `DEIDENTIFY_OPTIONS` that
 * `deidentify()` accepts. Derived, never a literal, so it cannot go stale.
 */
function legalDomain(): readonly (readonly DeidentifyOption[])[] {
  const out: (readonly DeidentifyOption[])[] = [];
  for (let mask = 0; mask < 1 << DEIDENTIFY_OPTIONS.length; mask++) {
    const subset = DEIDENTIFY_OPTIONS.filter((_, i) => ((mask >> i) & 1) === 1);
    if (isLegal(subset)) out.push(subset);
  }
  return out;
}

const DOMAIN = legalDomain();

type PriorItem = readonly [value: string, designator: string, meaning: string];

function priorSequence(items: readonly PriorItem[]): BuildDicomOptions["elements"][number] {
  return {
    tag: CODE_SEQUENCE,
    items: items.map(([value, designator, meaning]) => ({
      elements: [
        { tag: CODE_VALUE, vr: "SH", value: pad(value) },
        { tag: CODING_SCHEME_DESIGNATOR, vr: "SH", value: pad(designator) },
        { tag: CODE_MEANING, vr: "LO", value: pad(meaning) },
      ],
    })),
  };
}

/** A parsed PHI-bearing Data Set, plus whatever `(0012,0064)` the caller adds. */
function source(
  opts: {
    readonly ts?: string;
    readonly dated?: boolean;
    readonly extra?: BuildDicomOptions["elements"];
  } = {},
): Dataset {
  return parseDicom(
    buildDicom({
      transferSyntax: opts.ts ?? TS_EXPLICIT_LE,
      elements: [
        ...(opts.dated === false
          ? []
          : [{ tag: "00080020" as Tag, vr: "DA" as VR, value: pad("19000101") }]),
        { tag: "00080060", vr: "CS", value: pad("CT") },
        { tag: "00100010", vr: "PN", value: pad("DOE^JANE") },
        ...(opts.extra ?? []),
      ],
    }),
  );
}

const DATED = source();
const UNDATED = source({ dated: false });

function codesIn(warnings: readonly DicomParseWarning[]): readonly string[] {
  return warnings.map((w) => w.code);
}

/** Every 4-character window of the name, the size of a leak this repo refuses. */
function nameWindows(): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i + 4 <= NAME.length; i++) out.push(NAME.slice(i, i + 4));
  return out;
}

/** True when any field of any warning carries a window of the name. */
function warningsLeakName(warnings: readonly unknown[]): boolean {
  const text = JSON.stringify(warnings);
  return nameWindows().some((w) => text.includes(w));
}

describe("Tier 1: spec-clean (0012,0064) emission on a source without one", () => {
  it("AC-1: every subset of the legal domain, the empty one included, writes a top-level SQ led by 113100", () => {
    expect(DOMAIN.length).toBe(
      2 ** DEIDENTIFY_OPTIONS.length - 2 ** (DEIDENTIFY_OPTIONS.length - 2),
    );
    expect(DOMAIN).toContainEqual([]);
    expect(DATED.has(CODE_SEQUENCE)).toBe(false);
    for (const retain of DOMAIN) {
      const { dataset } = deidentify(DATED, { retain });
      const el = dataset.get(CODE_SEQUENCE);
      expect(el?.vr, retain.join(",")).toBe("SQ");
      expect(codesOf(dataset)[0], retain.join(",")).toStrictEqual({
        value: "113100",
        designator: "DCM",
        meaning: "Basic Application Confidentiality Profile",
      });
    }
  });

  it("AC-2: one further Item per active Option, in DEIDENTIFY_OPTIONS order, whatever order retain names them in", () => {
    for (const retain of DOMAIN) {
      const forward = deidentify(DATED, { retain }).dataset;
      const reversed = deidentify(DATED, { retain: [...retain].reverse() }).dataset;
      expect(codesOf(forward).slice(1), retain.join(",")).toStrictEqual(
        expectedCodes(retain).slice(1),
      );
      const a = forward.get(CODE_SEQUENCE)?.rawBytes ?? Buffer.alloc(0);
      const b = reversed.get(CODE_SEQUENCE)?.rawBytes ?? Buffer.from("x");
      expect(a.equals(b), retain.join(",")).toBe(true);
    }
  });

  it("AC-3: over the whole legal domain the codes are exactly 113100 plus the active Options', each Item exactly three attributes", () => {
    const allowedTags = [CODE_VALUE, CODING_SCHEME_DESIGNATOR, CODE_MEANING];
    for (const retain of DOMAIN) {
      const { dataset } = deidentify(DATED, { retain });
      const codes = codesOf(dataset);
      const values = codes.map((c) => c.value);
      const want = ["113100", ...retain.map((o) => WRITTEN_FOR[o])];
      expect([...values].sort(), retain.join(",")).toStrictEqual([...want].sort());
      expect(values).not.toContain("113101");
      expect(values).not.toContain("113102");
      for (const option of DEIDENTIFY_OPTIONS.filter((o) => !retain.includes(o))) {
        expect(values).not.toContain(WRITTEN_FOR[option]);
      }
      expect(codes).toStrictEqual(expectedCodes(retain));
      for (const item of dataset.get(CODE_SEQUENCE)?.items ?? []) {
        expect(item.elements().map((e) => e.tag)).toStrictEqual(allowedTags);
        expect(item.elements().map((e) => e.vr)).toStrictEqual(["SH", "SH", "LO"]);
      }
    }
  });

  it("AC-4: 113106 under full dates, 113107 under modified dates, neither under neither, dated or not", () => {
    for (const input of [DATED, UNDATED]) {
      for (const retain of DOMAIN) {
        const { dataset, report } = deidentify(input, { retain });
        const values = codesOf(dataset).map((c) => c.value);
        expect(values.includes("113106"), retain.join(",")).toBe(retain.includes(FULL_DATES));
        expect(values.includes("113107"), retain.join(",")).toBe(retain.includes(MODIFIED_DATES));
        if (values.includes("113107")) {
          // The code claims the Option; the library transforms no date, and says so.
          expect(codesIn(report.warnings)).toContain(
            WARNING_CODES.DICOM_DEIDENT_DATES_NOT_TRANSFORMED,
          );
        }
      }
    }
    expect(UNDATED.elements().some((e) => e.vr === "DA")).toBe(false);
    const neither = codesOf(deidentify(UNDATED).dataset).map((c) => c.value);
    expect(neither).toStrictEqual(["113100"]);
  });

  it("AC-10: a caller deidentificationMethod does not change the codes, even one naming an Option", () => {
    for (const retain of DOMAIN) {
      const plain = deidentify(DATED, { retain }).dataset.get(CODE_SEQUENCE)?.rawBytes;
      const named = deidentify(DATED, {
        retain,
        deidentificationMethod: "ACME Anonymizer v3\\Retain UIDs Option\\113110",
      }).dataset.get(CODE_SEQUENCE)?.rawBytes;
      expect(plain?.equals(named ?? Buffer.alloc(0)), retain.join(",")).toBe(true);
    }
  });

  it("AC-9: (0012,0062) is still YES and (0012,0063) is still the pin's text, over the whole legal domain", () => {
    for (const retain of DOMAIN) {
      const { dataset } = deidentify(DATED, { retain });
      expect(dataset.has(CODE_SEQUENCE)).toBe(true);
      expect(unpad(dataset.get(IDENTITY_REMOVED)?.rawBytes)).toBe("YES");
      expect(unpad(dataset.get(METHOD_TEXT)?.rawBytes).split("\\"), retain.join(",")).toStrictEqual(
        [DEFAULT_METHOD_PROFILE, ...DEIDENTIFY_OPTIONS.filter((o) => retain.includes(o))],
      );
    }
  });

  it("AC-12: the package carries the thirteen CID 7050 rows, UID and version exactly as quoted", () => {
    expect(DEIDENTIFICATION_METHOD_CODES.contextGroupUid).toBe("1.2.840.10008.6.1.925");
    expect(DEIDENTIFICATION_METHOD_CODES.contextGroupVersion).toBe("20170914");
    expect(
      DEIDENTIFICATION_METHOD_CODES.rows.map((r) => [
        r.codeValue,
        r.codingSchemeDesignator,
        r.codeMeaning,
      ]),
    ).toStrictEqual(CID_7050.map(([v, m]) => [v, "DCM", m]));
    expect(DEIDENTIFICATION_METHOD_CODES.profile.codeValue).toBe("113100");
    for (const option of DEIDENTIFY_OPTIONS) {
      expect(DEIDENTIFICATION_METHOD_CODES.options[option].codeValue).toBe(WRITTEN_FOR[option]);
    }
    // Inside the VRs the Items are written under: SH 16, LO 64 characters.
    for (const r of DEIDENTIFICATION_METHOD_CODES.rows) {
      expect(r.codeValue.length).toBeLessThanOrEqual(16);
      expect(r.codeMeaning.length).toBeLessThanOrEqual(64);
    }
  });

  it("AC-12: the two new warning codes are in the frozen registry with messages and in the locked snapshot", () => {
    const snapshot = readFileSync(
      join(
        import.meta.dirname,
        "..",
        "property",
        "__snapshots__",
        "warning-codes.snapshot.test.ts.snap",
      ),
      "utf8",
    );
    for (const code of [
      WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED,
      WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED,
    ]) {
      expect(WARNING_MESSAGES[code].length).toBeGreaterThan(0);
      expect(snapshot).toContain(`"${code}"`);
    }
    expect(WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED).not.toBe(
      WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED,
    );
  });
});

/** A prior `(0012,0064)` a conformant sender could write, with a code this run never emits. */
const PRIOR_ITEMS: readonly PriorItem[] = [
  ["99001", "99SYN", "Synthetic Prior Anonymizer"],
  ["113100", "DCM", "Basic Application Confidentiality Profile"],
];

describe("Tier 1: a spec-clean prior (0012,0064) is added to, never replaced", () => {
  it("AC-5: every prior Item is kept, in order and byte-identical, ahead of this run's codes", () => {
    for (const ts of ENCODINGS) {
      const input = source({ ts, extra: [priorSequence(PRIOR_ITEMS)] });
      const sourceItems = input.get(CODE_SEQUENCE)?.items ?? [];
      expect(sourceItems).toHaveLength(2);

      const { dataset } = deidentify(input, { retain: ["RetainUIDs"] });
      // The prior 113100 is already carried, so this run adds only 113110.
      expect(codesOf(dataset), ts).toStrictEqual([
        { value: "99001", designator: "99SYN", meaning: "Synthetic Prior Anonymizer" },
        codeOf("113100"),
        codeOf("113110"),
      ]);
      for (const out of [dataset, parseDicom(serializeDicom(dataset))]) {
        const items = out.get(CODE_SEQUENCE)?.items ?? [];
        sourceItems.forEach((prior, i) => {
          for (const el of prior.elements()) {
            const kept = items[i]?.get(el.tag)?.rawBytes;
            expect(kept?.equals(el.rawBytes), `${ts} item ${String(i)} ${el.tag}`).toBe(true);
          }
        });
      }
    }
  });

  it("AC-6: a code already carried under the same designator and value is not added again, whatever its meaning or pad", () => {
    const { dataset } = deidentify(
      source({
        extra: [
          priorSequence([
            ["113100  ", "DCM", "An older wording of the same Profile"],
            ["113110", "99SYN", "Same value, another scheme"],
          ]),
        ],
      }),
      { retain: ["RetainUIDs"] },
    );
    // 113100 DCM is carried (pad and meaning differ); 113110 under 99SYN is not
    // 113110 under DCM, so that one IS added.
    expect(codesOf(dataset).map((c) => `${c.designator}:${c.value}`)).toStrictEqual([
      "DCM:113100",
      "99SYN:113110",
      "DCM:113110",
    ]);
  });

  it("AC-7: a kept prior is disclosed under its own code, which never quotes it and never reaches the parse warnings", () => {
    const named = `Anonymized by hand, removed ${NAME}`;
    const input = source({ extra: [priorSequence([["99001", "99SYN", named]])] });
    const { dataset, report } = deidentify(input);

    // Kept: the name-bearing prior really is in the output...
    expect(serializeDicom(dataset).toString("latin1")).toContain(NAME);
    // ...and said, by the new code, with exactly its registry message.
    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED,
    );
    expect(warning?.message).toBe(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED);
    expect(warningsLeakName(report.warnings)).toBe(false);
    // The mutation control: the same predicate goes red on a warning that does quote it...
    expect(warningsLeakName([{ ...warning, message: `kept ${named}` }])).toBe(true);
    // ...and the factory has no parameter a value could travel through.
    expect(deidentMethodCodesPriorRetained).toHaveLength(1);

    // Never on the parse warnings, before or after a round trip.
    const code = WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED;
    expect(codesIn(dataset.warnings)).not.toContain(code);
    expect(codesIn(parseDicom(serializeDicom(dataset)).warnings)).not.toContain(code);
    // (0012,0063)'s code keeps its published meaning and is not raised for (0012,0064).
    expect(codesIn(report.warnings)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
    );
    expect(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED).toContain("(0012,0063)");
    expect(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED).not.toContain("(0012,0064)");
  });

  it("AC-7: a prior (0012,0064) with zero Items raises no such warning", () => {
    const input = source({ extra: [priorSequence([])] });
    expect(input.get(CODE_SEQUENCE)?.items).toStrictEqual([]);
    const { dataset, report } = deidentify(input);
    expect(codesIn(report.warnings)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED,
    );
    expect(codesOf(dataset)).toStrictEqual(expectedCodes([]));
  });
});

/**
 * The Explicit VR LE Data Set {@link DATED} plus a top-level `(0012,0064)` of VR
 * `SQ` whose items are undefined, built directly: the parser reaches that state
 * only under Implicit VR LE, and `Element` is publicly constructible. `headed`
 * puts the 12-byte long-form header in `rawBytes` ahead of `value`, which is the
 * full-span shape the writer blits for an Explicit VR `SQ`.
 */
function withUnparsedSequence(value: Buffer, headed: boolean): Dataset {
  const header = Buffer.from([0x12, 0x00, 0x64, 0x00, 0x53, 0x51, 0x00, 0x00, 0, 0, 0, 0]);
  header.writeUInt32LE(value.length, 8);
  const el = new Element({
    tag: CODE_SEQUENCE,
    vr: "SQ",
    vm: 1,
    length: value.length,
    rawBytes: headed ? Buffer.concat([header, value]) : value,
    byteOffset: 0,
    littleEndian: true,
  });
  return new Dataset({
    ...(DATED.fileMeta !== undefined ? { fileMeta: DATED.fileMeta } : {}),
    warnings: [],
    elements: new Map<Tag, Element>([
      ...DATED.elements().map((e) => [e.tag, e] as const),
      [el.tag, el],
    ]),
  });
}

describe("Tier 2: an unreadable prior (0012,0064) is replaced, and said", () => {
  const replacedCode = WARNING_CODES.DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED;

  /**
   * The message is the fixed registry entry, so nothing about the prior can vary
   * it; `priorVr`, where the prior was not `SQ`, is also checked for directly.
   */
  function expectReplacedAndSaid(input: Dataset, priorVr?: string): void {
    const retain: readonly DeidentifyOption[] = ["CleanDescriptors", "RetainUIDs"];
    const { dataset, report } = deidentify(input, { retain });
    expect(dataset.get(CODE_SEQUENCE)?.vr).toBe("SQ");
    expect(codesOf(dataset)).toStrictEqual(expectedCodes(retain));
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NAME);
    const warning = report.warnings.find((w) => w.code === replacedCode);
    expect(warning?.message).toBe(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED);
    expect(warningsLeakName(report.warnings)).toBe(false);
    if (priorVr !== undefined) {
      expect(new RegExp(`\\b${priorVr}\\b`, "u").test(warning?.message ?? priorVr)).toBe(false);
    }
    expect(codesIn(dataset.warnings)).not.toContain(replacedCode);
  }

  it("AC-8: a (0012,0064) encoded under a VR other than SQ is replaced by this run's Items only", () => {
    for (const vr of ["LO", "UT", "OB", "UN"] as const) {
      const input = source({
        extra: [{ tag: CODE_SEQUENCE, vr: vr as VR, value: pad(`removed ${NAME}`) }],
      });
      expect(input.get(CODE_SEQUENCE)?.vr).toBe(vr);
      expectReplacedAndSaid(input, vr);
    }
    expect(deidentMethodCodesPriorReplaced).toHaveLength(1);
  });

  it("AC-8: an SQ whose items the parse did not produce is replaced by this run's Items only", () => {
    // Implicit VR LE: the dictionary says SQ, and a defined-length value that is
    // not an item stream is kept as opaque bytes with items undefined.
    const input = source({
      ts: TS_IMPLICIT_LE,
      extra: [{ tag: CODE_SEQUENCE, vr: "UN" as VR, value: pad(`removed ${NAME}`) }],
    });
    const prior = input.get(CODE_SEQUENCE);
    expect(prior?.vr).toBe("SQ");
    expect(prior?.items).toBeUndefined();
    expect(codesIn(input.warnings)).toContain(WARNING_CODES.DICOM_SQ_NOT_DESCENDED);
    expectReplacedAndSaid(input);
  });

  it("AC-8: a padding-only or empty prior raises nothing, and is still replaced", () => {
    const shapes: readonly Dataset[] = [
      source({ extra: [{ tag: CODE_SEQUENCE, vr: "LO" as VR, value: Buffer.alloc(0) }] }),
      source({
        extra: [{ tag: CODE_SEQUENCE, vr: "LO" as VR, value: Buffer.from("    ", "latin1") }],
      }),
      source({ extra: [{ tag: CODE_SEQUENCE, vr: "OB" as VR, value: Buffer.alloc(4) }] }),
      withUnparsedSequence(Buffer.from("  ", "latin1"), false),
      // The header is not the value: a full-span SQ whose value is padding is padding.
      withUnparsedSequence(Buffer.from("  ", "latin1"), true),
    ];
    for (const input of shapes) {
      const prior = input.get(CODE_SEQUENCE);
      expect(prior === undefined || (prior.vr === "SQ" && prior.items !== undefined)).toBe(false);
      const { dataset, report } = deidentify(input);
      expect(codesOf(dataset)).toStrictEqual(expectedCodes([]));
      expect(codesIn(report.warnings)).not.toContain(replacedCode);
    }
    // The control: the same constructed SQ shapes with a name in the value ARE said.
    for (const headed of [false, true]) {
      const named = withUnparsedSequence(Buffer.from(NAME, "latin1"), headed);
      expect(codesIn(deidentify(named).report.warnings)).toContain(replacedCode);
    }
  });
});

describe("Tier 3: the round trip and the fixed point", () => {
  it("AC-11: Implicit LE, Explicit LE and Explicit BE each re-parse the same Items and add no warning of their own", () => {
    const retain: readonly DeidentifyOption[] = [
      "CleanDescriptors",
      "RetainLongitudinalTemporalModifiedDates",
      "RetainUIDs",
    ];
    for (const ts of ENCODINGS) {
      for (const input of [source({ ts }), source({ ts, extra: [priorSequence(PRIOR_ITEMS)] })]) {
        const { dataset } = deidentify(input, { retain });
        const bytes = serializeDicom(dataset);
        const reparsed = parseDicom(bytes);
        expect(reparsed.get(CODE_SEQUENCE)?.vr, ts).toBe("SQ");
        expect(codesOf(reparsed), ts).toStrictEqual(codesOf(dataset));
        expect(codesOf(reparsed).slice(-retain.length - 1)).toStrictEqual(expectedCodes(retain));

        const without = new Dataset({
          ...(dataset.fileMeta !== undefined ? { fileMeta: dataset.fileMeta } : {}),
          warnings: dataset.warnings,
          elements: new Map(
            dataset
              .elements()
              .filter((e) => e.tag !== CODE_SEQUENCE)
              .map((e) => [e.tag, e] as const),
          ),
        });
        const reparsedWithout = parseDicom(serializeDicom(without));
        expect(codesIn(reparsed.warnings), ts).toStrictEqual(codesIn(reparsedWithout.warnings));
        // Nor on the lazy decode of the Items' own values.
        for (const item of reparsed.get(CODE_SEQUENCE)?.items ?? []) {
          for (const el of item.elements()) {
            const decoded = el.value as { readonly warnings?: readonly unknown[] };
            expect(decoded.warnings ?? [], `${ts} ${el.tag}`).toStrictEqual([]);
          }
        }
        expect(() => parseDicom(bytes, { strict: true }), ts).not.toThrow();
      }
    }
  });

  it("AC-6: re-running on the parsed, serialized output is a fixed point, over the whole legal domain", () => {
    for (const retain of DOMAIN) {
      const once = deidentify(DATED, { retain }).dataset;
      let current = once;
      for (let pass = 0; pass < 2; pass++) {
        current = deidentify(parseDicom(serializeDicom(current)), { retain }).dataset;
        expect(codesOf(current), retain.join(",")).toStrictEqual(codesOf(once));
        const a = once.get(CODE_SEQUENCE)?.rawBytes ?? Buffer.alloc(0);
        const b = current.get(CODE_SEQUENCE)?.rawBytes ?? Buffer.from("x");
        expect(a.equals(b), retain.join(",")).toBe(true);
      }
    }
  });

  it("AC-6: a second run that adds one further Option appends exactly that Option's Item", () => {
    let pairs = 0;
    for (const base of DOMAIN) {
      const once = parseDicom(serializeDicom(deidentify(DATED, { retain: base }).dataset));
      for (const option of DEIDENTIFY_OPTIONS) {
        const retain = [...base, option];
        if (base.includes(option) || !isLegal(retain)) continue;
        const twice = deidentify(once, { retain }).dataset;
        expect(codesOf(twice), retain.join(",")).toStrictEqual([
          ...codesOf(once),
          codeOf(WRITTEN_FOR[option]),
        ]);
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(DOMAIN.length);
  });
});

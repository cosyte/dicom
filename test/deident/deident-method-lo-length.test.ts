/**
 * `DICOM-LO-LENGTH-AND-SILENT-REPLACE` - the two remaining `(0012,0063)`
 * defects, measured rather than argued.
 *
 * ## Half one: the library's own method text was too long for the VR it writes
 *
 * PS3.5 2026c Table 6.2-1, the `LO` row: "A character string that may be padded
 * with leading and/or trailing spaces. The character code 5CH (the BACKSLASH "\"
 * in ISO-IR 6) shall not be present, as it is used as the delimiter between
 * values in multi-valued data elements ... **64 chars maximum**".
 *
 * 🛑 **THAT ROW DESCRIBES A VALUE, AND `(0012,0063)` IS `1-n`, SO THE BOUND IS
 * PER VALUE AND EVERY MEASUREMENT HERE IS TOO.** Reading it as a bound on the
 * Value Field is the same misreading that left the fixed-point hole in `#74`
 * (where §6.4, a clause about where the ENCODER puts its pad, was read as a
 * bound on a COMPARISON). A field of 247 bytes made of ten values of 61 or fewer
 * is conformant; a field of 76 bytes made of one value is not. The tests below
 * assert the value-wise figure and the field-wise one **at the same time**, so a
 * remedy that merely shortened the field could not pass them.
 *
 * Measured on `da1f209` (the base for this slice), through the built package:
 * the default was one value of **76** characters, **130** with `RetainUIDs +
 * RetainSafePrivate + RetainDeviceIdentity`, **272** with all nine, and **all
 * 512 option subsets** were over the maximum. Not an edge case and not
 * file-dependent: it is what this library wrote into every object it
 * de-identified, in the one attribute a receiver reads to decide whether an
 * object was de-identified at all.
 *
 * ## Half two: the other replacement was the silent one
 *
 * `deidentify()` builds the provenance chain by concatenating `LO` values with
 * the `5CH` delimiter. Bytes under any other VR are not values it can join into,
 * so it replaces. That much is deliberate and unchanged. Until this slice it
 * replaced with `report.warnings` **empty** - the sender's earlier
 * de-identification record destroyed, under `(0012,0062) = YES`, with nothing
 * saying so.
 *
 * Everything here is synthetic; the recognizable-but-fake strings exist only so
 * a substitution or a leak is observable.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { WARNING_CODES, deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import { DEIDENTIFY_OPTIONS, type DeidentifyOption } from "../../src/deident/types.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { WARNING_MESSAGES, deidentMethodNotLo } from "../../src/parser/warnings.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const PATIENT_NAME = "00100010" as Tag;
const DEIDENT_METHOD = "00120063" as Tag;

/** Synthetic and deliberately fake. */
const PATIENT = "SMITHSON^BRAIN";

/**
 * PS3.5 2026c Table 6.2-1, `LO` row. Mirrored as a local literal rather than
 * imported, so a regression in either copy shows up here instead of agreeing
 * with itself - the discipline `MAX_SHORT_FORM_VALUE_BYTES` already uses in
 * `deident-method-add.test.ts`.
 */
const LO_VALUE_MAX_CHARS = 64;

/**
 * The exact value the base wrote with no options: **76 characters**. Pinned as a
 * literal so "the default got shorter" cannot be satisfied by a coincidence, and
 * so its length is asserted rather than described.
 */
const BASE_DEFAULT_76 =
  "Cosyte @cosyte/dicom: PS3.15 Basic Application Level Confidentiality Profile";

const BACKSLASH = "\\";

function even(text: string): Buffer {
  const raw = Buffer.from(text, "latin1");
  return raw.length % 2 === 0 ? raw : Buffer.concat([raw, Buffer.from([0x20])]);
}

/** A parsed dataset carrying PHI, plus whatever `(0012,0063)` the caller wants. */
function buildWithPriorMethod(prior?: { readonly vr: VR; readonly value: Buffer }): Dataset {
  return parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: PATIENT_NAME, vr: "PN" as VR, value: even(PATIENT) },
        ...(prior === undefined ? [] : [{ tag: DEIDENT_METHOD, vr: prior.vr, value: prior.value }]),
      ],
    }),
  );
}

/**
 * `(0012,0063)`'s Value Field exactly as it stands - pad bytes and all.
 *
 * 🛑 **NEVER THROUGH A TRIMMING HELPER.** `methodOf()` in the sibling file
 * strips trailing `[NUL SP]` and is what made `#73`'s fixed-point pin vacuous.
 */
function rawMethod(ds: Dataset): Buffer {
  return Buffer.from(ds.get(DEIDENT_METHOD)?.rawBytes ?? Buffer.alloc(0));
}

/** The `(0012,0063)` a run with `retain` writes, as raw bytes. */
function methodFor(retain: readonly DeidentifyOption[]): Buffer {
  return rawMethod(deidentify(buildWithPriorMethod(), { retain }).dataset);
}

/**
 * The per-Value character counts of a Value Field. The encoder's even-length pad
 * lands on the **last** value (PS3.5 §6.4) and is not content, so it comes off
 * the field before the split; nothing else is trimmed, because a leading space a
 * sender wrote IS content and a value that is genuinely 65 characters must count
 * as 65.
 */
function valueLengths(field: Buffer): readonly number[] {
  return field
    .toString("latin1")
    .replace(/[\0 ]+$/u, "")
    .split(BACKSLASH)
    .map((value) => value.length);
}

/** Every `size`-character window of `text`. */
function windows(text: string, size: number): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i + size <= text.length; i++) out.push(text.slice(i, i + size));
  return out;
}

describe("(0012,0063) fits LO's 64-character maximum, and the bound is per Value", () => {
  it("the default is one value inside the maximum, and it is not the 76-character one", () => {
    const field = methodFor([]);
    const lengths = valueLengths(field);

    expect(lengths).toStrictEqual([61]);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(LO_VALUE_MAX_CHARS);

    // NON-VACUITY: the string that was there is 76 characters, is over the
    // maximum, and is gone. Without this the row above passes on a build that
    // never wrote a method at all.
    expect(BASE_DEFAULT_76.length).toBe(76);
    expect(BASE_DEFAULT_76.length).toBeGreaterThan(LO_VALUE_MAX_CHARS);
    expect(field.toString("latin1")).not.toContain(BASE_DEFAULT_76);
    expect(field.length).toBeGreaterThan(0);
  });

  it("the three figures the item names are all conformant now, per Value and not per field", () => {
    const three = methodFor(["RetainUIDs", "RetainSafePrivate", "RetainDeviceIdentity"]);
    const nine = methodFor(DEIDENTIFY_OPTIONS);

    // The field-wise figure is UNCHANGED in kind: 111 and 247 bytes, both far
    // over 64. A remedy that had merely shortened the text would fail here,
    // which is what makes the value-wise assertion below mean something.
    expect(three.length).toBeGreaterThan(LO_VALUE_MAX_CHARS);
    expect(nine.length).toBeGreaterThan(LO_VALUE_MAX_CHARS);

    expect(Math.max(...valueLengths(three))).toBeLessThanOrEqual(LO_VALUE_MAX_CHARS);
    expect(Math.max(...valueLengths(nine))).toBeLessThanOrEqual(LO_VALUE_MAX_CHARS);

    // One Value per name, which is what makes the field legal: 1 + 3 and 1 + 9.
    expect(valueLengths(three)).toHaveLength(4);
    expect(valueLengths(nine)).toHaveLength(1 + DEIDENTIFY_OPTIONS.length);

    // Base measured 130 and 272 as SINGLE values. Pinned as the thing that must
    // not come back.
    expect(valueLengths(three)).not.toContain(130);
    expect(valueLengths(nine)).not.toContain(272);
  });

  it("all 512 option subsets, exhaustively: no Value over the maximum", () => {
    // The whole input space, not a sample. `#74` established that this lineage
    // proves fixed points by sweep rather than by example, and the same argument
    // applies to a bound: 512 subsets is the entire domain of `retain`.
    let cells = 0;
    let over = 0;
    let longest = 0;

    for (let mask = 0; mask < 1 << DEIDENTIFY_OPTIONS.length; mask++) {
      const retain = DEIDENTIFY_OPTIONS.filter((_, i) => ((mask >> i) & 1) === 1);
      for (const length of valueLengths(methodFor(retain))) {
        cells++;
        if (length > LO_VALUE_MAX_CHARS) over++;
        longest = Math.max(longest, length);
      }
    }

    expect(cells).toBe(2816);
    expect(over).toBe(0);
    expect(longest).toBe(61);
  });

  it("the sweep can actually fail: the same measurement catches an over-long value", () => {
    // Constructed control. A sweep that reports zero because its measurement
    // cannot see a violation proves nothing, and this package has shipped one of
    // those before.
    const overlong = "X".repeat(65);
    const field = rawMethod(
      deidentify(buildWithPriorMethod(), { deidentificationMethod: overlong }).dataset,
    );
    expect(valueLengths(field).filter((n) => n > LO_VALUE_MAX_CHARS)).toStrictEqual([65]);
  });

  it("every option name is inside the maximum on its own, so no future subset can breach it", () => {
    // The mutation control for the sweep: a tenth option with a 70-character
    // name would make the sweep red, and this row says why in one line.
    for (const option of DEIDENTIFY_OPTIONS) {
      expect(option.length).toBeLessThanOrEqual(LO_VALUE_MAX_CHARS);
    }
    expect(Math.max(...DEIDENTIFY_OPTIONS.map((o) => o.length))).toBe(28);
  });

  it("the bytes do not depend on the order the caller listed the options in", () => {
    const forward = methodFor(["RetainUIDs", "CleanGraphics", "RetainSafePrivate"]);
    const reverse = methodFor(["RetainSafePrivate", "CleanGraphics", "RetainUIDs"]);
    expect(forward.equals(reverse)).toBe(true);
    // Non-vacuity: the two arrays really are in different orders and really do
    // put three options in the value.
    expect(valueLengths(forward)).toHaveLength(4);
  });
});

describe("the multi-valued default is still a fixed point", () => {
  it("six wire round trips, default options: the raw byte count never moves", () => {
    // RAW BYTES over a real parse -> deidentify -> serialize -> parse loop. The
    // regression `#73` shipped read 16 -> 32 -> 48 -> 64 -> 80 -> 96 on exactly
    // this measurement, and a helper that trimmed the pad could not see it.
    let ds = buildWithPriorMethod();
    const lengths: number[] = [];
    for (let pass = 0; pass < 6; pass++) {
      ds = parseDicom(serializeDicom(deidentify(ds).dataset));
      lengths.push(rawMethod(ds).length);
    }
    expect(lengths).toStrictEqual([62, 62, 62, 62, 62, 62]);
  });

  it("six wire round trips, all nine options: flat too, and the value count with it", () => {
    let ds = buildWithPriorMethod();
    const lengths: number[] = [];
    for (let pass = 0; pass < 6; pass++) {
      ds = parseDicom(serializeDicom(deidentify(ds, { retain: DEIDENTIFY_OPTIONS }).dataset));
      lengths.push(rawMethod(ds).length);
    }
    expect(lengths).toStrictEqual([248, 248, 248, 248, 248, 248]);
    // Growth by whole values rather than by bytes would keep a byte count
    // suspicious-looking but a value count is the direct measurement.
    expect(valueLengths(rawMethod(ds))).toHaveLength(1 + DEIDENTIFY_OPTIONS.length);
  });

  it("a second run with MORE options adds only the option values that are missing", () => {
    const first = deidentify(buildWithPriorMethod(), { retain: ["RetainUIDs"] }).dataset;
    const second = deidentify(parseDicom(serializeDicom(first)), {
      retain: ["RetainUIDs", "CleanGraphics"],
    }).dataset;

    const values = rawMethod(second)
      .toString("latin1")
      .replace(/[\0 ]+$/u, "")
      .split(BACKSLASH);
    expect(values).toStrictEqual([
      "@cosyte/dicom Basic Application Level Confidentiality Profile",
      "RetainUIDs",
      "CleanGraphics",
    ]);
    // The Profile value is recorded once, not once per pass.
    expect(values.filter((v) => v.startsWith("@cosyte/dicom"))).toHaveLength(1);
  });
});

describe("a (0012,0063) the file encoded under another VR is replaced, and says so", () => {
  const NAMED_PRIOR = `ACME Anonymizer v3, operator ${PATIENT}`;

  it.each(["SH", "LT", "UN", "ST", "UT"])(
    "VR %s: the replacement raises DICOM_DEIDENT_METHOD_NOT_LO",
    (vr) => {
      const parsed = buildWithPriorMethod({
        vr: vr as VR,
        value: even(NAMED_PRIOR),
      });
      // Non-vacuity: the prior value really is on the parsed element, under the
      // VR under test, before anything is asserted about the output.
      expect(parsed.get(DEIDENT_METHOD)?.vr).toBe(vr);
      expect(parsed.get(DEIDENT_METHOD)?.rawBytes.toString("latin1")).toContain("SMITHSON");

      const { dataset, report } = deidentify(parsed);
      const codes = report.warnings.map((w) => w.code);
      expect(codes).toContain(WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_LO);
      // It is the ceiling code's sibling, not the ceiling code.
      expect(codes).not.toContain(WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED);
      expect(codes).not.toContain(WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED);

      // The loss it discloses is real: the prior text is not in the output, and
      // the output is this run's own method.
      expect(rawMethod(dataset).toString("latin1")).not.toContain("ACME");
      expect(rawMethod(dataset).toString("latin1")).toContain("@cosyte/dicom");
      expect(dataset.get(DEIDENT_METHOD)?.vr).toBe("LO");
    },
  );

  it("🛑 the disclosure carries no value, no length and no VR", () => {
    // A DIAGNOSTIC ABOUT A DROPPED VALUE IS ITSELF A PHI SURFACE. `#55` put four
    // letters of a surname into one, over a fixture that could not show it.
    // Name-bearing payload, non-vacuity first.
    const parsed = buildWithPriorMethod({ vr: "SH" as VR, value: even(NAMED_PRIOR) });
    expect(NAMED_PRIOR).toContain("SMITHSON");
    expect(parsed.get(DEIDENT_METHOD)?.rawBytes.toString("latin1")).toContain(NAMED_PRIOR);

    const warning = deidentify(parsed).report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_LO,
    );
    expect(warning).toBeDefined();

    // Not "does not contain the whole name" - four letters is a leak. The
    // windows are taken over the NAME rather than the whole prior string, for
    // the reason the first draft of this row went red: the registry prose is
    // English, so a four-character window of the surrounding words ("er v", out
    // of "operator", which is also in "the earlier value") collides with it by
    // coincidence and says nothing about a leak. The name is the payload.
    for (const window of windows(PATIENT, 4)) {
      expect(warning?.message).not.toContain(window);
    }
    expect(warning?.message).not.toContain(NAMED_PRIOR);
    expect(warning?.message).not.toContain("ACME");
    // No VR either: two bytes read out of a fabricated header are document
    // content, which is how "ITHS" reached DICOM_NONZERO_RESERVED_BYTES.
    expect(warning?.message).not.toContain("SH");
    // And the message is the frozen registry string, with nothing substituted.
    expect(warning?.message).toBe(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_NOT_LO);
    // `position` locates the element and carries nothing else.
    expect(warning?.position.byteOffset).toBe(parsed.get(DEIDENT_METHOD)?.byteOffset);
  });

  it("the bound is the factory SIGNATURE, so no call site can put a value back", () => {
    expect(deidentMethodNotLo).toHaveLength(1);
    expect(deidentMethodNotLo({ byteOffset: 152, fileMeta: false }).message).toBe(
      WARNING_MESSAGES.DICOM_DEIDENT_METHOD_NOT_LO,
    );
  });

  it.each([
    ["empty", Buffer.alloc(0)],
    ["padding only", Buffer.from("  ", "latin1")],
    ["NUL only", Buffer.from([0x00, 0x00])],
  ])("a non-LO prior that is %s loses nothing, so it is not disclosed", (_name, value) => {
    const report = deidentify(buildWithPriorMethod({ vr: "SH" as VR, value })).report;
    expect(report.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_LO,
    );
  });

  it("controls: an LO prior still retains, and no prior warns about neither", () => {
    const lo = deidentify(
      buildWithPriorMethod({ vr: "LO" as VR, value: even("ACME Anonymizer v3") }),
    ).report;
    expect(lo.warnings.map((w) => w.code)).toStrictEqual([
      WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
    ]);

    const none = deidentify(buildWithPriorMethod()).report;
    expect(none.warnings.map((w) => w.code)).toStrictEqual([]);
  });
});

describe("what this slice does NOT bound, pinned rather than left to be rediscovered", () => {
  it("a caller value over the maximum is written through, undisclosed", () => {
    // Residual, deliberate: the string is the caller's, and splitting or
    // truncating it would invent a de-identification record they did not write.
    // Closing this would turn this test red, which is the point of pinning it.
    const overlong = `ACME Anonymizer v3 ${"Y".repeat(80)}`;
    const { dataset, report } = deidentify(buildWithPriorMethod(), {
      deidentificationMethod: overlong,
    });

    expect(valueLengths(rawMethod(dataset))).toStrictEqual([overlong.length]);
    expect(overlong.length).toBeGreaterThan(LO_VALUE_MAX_CHARS);
    expect(report.warnings).toStrictEqual([]);
  });

  it("a prior value the SOURCE FILE wrote over the maximum is copied through, undisclosed", () => {
    // Same posture for the other direction: those bytes are the sender's, they
    // are copied verbatim by design, and a sender's non-conformant LO is the
    // sender's. Only its retention is disclosed.
    const overlong = `ACME ${"Z".repeat(70)}`;
    const { dataset, report } = deidentify(
      buildWithPriorMethod({ vr: "LO" as VR, value: even(overlong) }),
    );

    expect(valueLengths(rawMethod(dataset))).toContain(overlong.length);
    expect(report.warnings.map((w) => w.code)).toStrictEqual([
      WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
    ]);
  });
});

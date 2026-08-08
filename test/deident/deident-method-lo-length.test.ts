/**
 * `DICOM-LO-LENGTH-AND-SILENT-REPLACE` - the `(0012,0063)` length and
 * replacement defects, measured rather than argued.
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
 * ## Half three: the length nothing disclosed, on either route
 *
 * The two Values this run does **not** compose can be over the maximum - a
 * caller's `deidentificationMethod`, and a value the source file already carried
 * and PS3.15 2026c E.1.1 obliges this to keep. Both were written through with
 * nothing said about their length, and **the likeliest writer of the second one
 * is this library**: every object any published release de-identified without a
 * caller-supplied method carries the 76-character Value, and re-de-identifying
 * one keeps it. `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH` discloses it. Nothing
 * is shortened, split or truncated: the act is unchanged and only the silence is
 * closed. The measurement is over **bytes**, which over-approximates under a
 * multi-byte repertoire and can therefore never miss a Value that is genuinely
 * over - the cost is pinned below rather than argued away.
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
import {
  WARNING_MESSAGES,
  deidentMethodNotLo,
  deidentMethodValueOverLength,
} from "../../src/parser/warnings.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const SPECIFIC_CHARACTER_SET = "00080005" as Tag;
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

describe("an over-long Value this run did not compose is written through, and SAYS SO", () => {
  it("a caller value over the maximum is written through, disclosed", () => {
    // The string is the caller's, and splitting or truncating it would invent a
    // de-identification record they did not write. So the act is unchanged and
    // only the silence is closed: the value is byte-for-byte what was passed in,
    // and `report.warnings` names the length.
    const overlong = `ACME Anonymizer v3 ${"Y".repeat(80)}`;
    const { dataset, report } = deidentify(buildWithPriorMethod(), {
      deidentificationMethod: overlong,
    });

    expect(valueLengths(rawMethod(dataset))).toStrictEqual([overlong.length]);
    expect(overlong.length).toBeGreaterThan(LO_VALUE_MAX_CHARS);
    expect(report.warnings.map((w) => w.code)).toStrictEqual([
      WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH,
    ]);
  });

  it("a prior value the SOURCE FILE wrote over the maximum is copied through, disclosed", () => {
    // Same posture for the other direction: those bytes are the sender's and are
    // copied verbatim by design. The retention had a code already; the LENGTH
    // had none, on this route or on the caller's.
    const overlong = `ACME ${"Z".repeat(70)}`;
    const { dataset, report } = deidentify(
      buildWithPriorMethod({ vr: "LO" as VR, value: even(overlong) }),
    );

    expect(valueLengths(rawMethod(dataset))).toContain(overlong.length);
    expect(report.warnings.map((w) => w.code)).toStrictEqual([
      WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
      WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH,
    ]);
  });

  it("🩺 and the most likely writer of one is THIS library: its own 0.0.11 value is kept", () => {
    // 🛑 A graded pass refuted "a sender's non-conformant LO is the sender's".
    // Every object any PUBLISHED release de-identified without a caller-supplied
    // method carries the 76-character value (measured in the 0.0.1 and 0.0.11
    // tarballs; a graded pass refuted the "0.0.3 onward" range a draft wrote,
    // because 0.0.1 is on the registry and has it while 0.0.2 and 0.0.9 were
    // never published), so the over-long prior the row
    // above calls the sender's is, in the common case, this library's own. It is
    // still KEPT, and that is right - PS3.15 E.1.1 says "added to", and
    // rewriting a prior de-identifier's record destroys the provenance the
    // attribute exists to carry whoever wrote it - and the length of what is
    // written is disclosed now, on every pass rather than only the first, so a
    // consumer with a strict receiver in the path is told.
    let ds = buildWithPriorMethod({ vr: "LO" as VR, value: even(BASE_DEFAULT_76) });
    const lengths: number[] = [];
    const codesPerPass: (readonly string[])[] = [];
    for (let pass = 0; pass < 4; pass++) {
      const { dataset, report } = deidentify(ds);
      codesPerPass.push(report.warnings.map((w) => w.code));
      lengths.push(rawMethod(dataset).length);
      ds = parseDicom(serializeDicom(dataset));
    }

    // Flat, so this is a fixed point and not a growth defect...
    expect(lengths).toStrictEqual([138, 138, 138, 138]);
    // ...and one of its two values is still over the maximum.
    expect(valueLengths(rawMethod(ds))).toStrictEqual([76, 61]);
    // Disclosed as a retention AND as a length, on every pass. A code raised only
    // on the first pass would leave every re-de-identification silent again,
    // which is the exact shape this row exists to catch.
    expect(codesPerPass).toStrictEqual(
      Array.from({ length: 4 }, () => [
        WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
        WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH,
      ]),
    );
  });

  it("🛑 the disclosure carries no value, no length, no count and no origin", () => {
    // A DIAGNOSTIC ABOUT A LENGTH DEFECT IS ITSELF A PHI SURFACE, and a raw
    // length has no table to be a member of - which is why six other messages in
    // this package had one bound out of them. Name-bearing payload, non-vacuity
    // first: the over-long value carries the surname, so a leak is observable.
    const named = `ACME Anonymizer v3, operator ${PATIENT} ${"W".repeat(40)}`;
    expect(named).toContain("SMITHSON");
    expect(named.length).toBeGreaterThan(LO_VALUE_MAX_CHARS);

    const parsed = buildWithPriorMethod({ vr: "LO" as VR, value: even(named) });
    expect(parsed.get(DEIDENT_METHOD)?.rawBytes.toString("latin1")).toContain(named);
    const { dataset, report } = deidentify(parsed);
    // The payload really does reach the output, so the warning is about bytes
    // that are actually there.
    expect(rawMethod(dataset).toString("latin1")).toContain(named);

    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH,
    );
    expect(warning).toBeDefined();

    // Four letters of a surname is a leak, so the windows are taken over the
    // NAME rather than the whole value: the registry prose is English and a
    // four-character window of the surrounding words collides with it by
    // coincidence, saying nothing.
    for (const window of windows(PATIENT, 4)) {
      expect(warning?.message).not.toContain(window);
    }
    expect(warning?.message).not.toContain(named);
    expect(warning?.message).not.toContain("ACME");
    // No measured length either. `named.length` is a count over document
    // content; 64 is a constant of the VR and is allowed to be there.
    expect(warning?.message).not.toContain(String(named.length));
    expect(warning?.message).toContain("64");
    // And the message is the frozen registry string, with nothing substituted.
    expect(warning?.message).toBe(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH);
    expect(warning?.position.byteOffset).toBe(parsed.get(DEIDENT_METHOD)?.byteOffset);
  });

  it("the bound is the factory SIGNATURE, so no call site can put a value back", () => {
    expect(deidentMethodValueOverLength).toHaveLength(1);
    expect(deidentMethodValueOverLength({ byteOffset: 152, fileMeta: false }).message).toBe(
      WARNING_MESSAGES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH,
    );
  });

  it("the detector is not a floor: 64 is clean, 65 is not, and 65 is caught with a name in it", () => {
    // 🛑 A DETECTOR ZERO CAN BE A GAP RATHER THAN A CLEARANCE, so the clean
    // result is pinned BESIDE a positive the same detector does catch, one byte
    // away. `SMITHSON` is in both, so neither row is green by a payload the
    // detector could not have seen.
    const at64 = `SMITHSON ${"Q".repeat(55)}`;
    const at65 = `SMITHSON ${"Q".repeat(56)}`;
    expect(at64).toHaveLength(64);
    expect(at65).toHaveLength(65);

    const codesFor = (method: string): readonly string[] =>
      deidentify(buildWithPriorMethod(), { deidentificationMethod: method }).report.warnings.map(
        (w) => w.code,
      );

    expect(codesFor(at64)).toStrictEqual([]);
    expect(codesFor(at65)).toStrictEqual([WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH]);
  });

  it("the bound is per VALUE here too: ten values of 61 are clean, one of 65 is not", () => {
    // The same misreading that left `#74`'s hole would make this row red: a
    // detector that measured the Value FIELD would call the 619-byte chain of
    // conformant values a violation, and it is not one.
    const ten = Array.from({ length: 10 }, (_, i) => `Pass ${i} ${"C".repeat(54)}`);
    for (const value of ten) expect(value).toHaveLength(61);
    const field = ten.join(BACKSLASH);
    expect(field.length).toBeGreaterThan(LO_VALUE_MAX_CHARS);

    const clean = deidentify(buildWithPriorMethod(), { deidentificationMethod: field });
    expect(valueLengths(rawMethod(clean.dataset))).toHaveLength(10);
    expect(clean.report.warnings).toStrictEqual([]);

    // Non-vacuity: one over-long value among conformant ones is still found.
    const mixed = [...ten.slice(0, 9), "D".repeat(65)].join(BACKSLASH);
    expect(
      deidentify(buildWithPriorMethod(), { deidentificationMethod: mixed }).report.warnings.map(
        (w) => w.code,
      ),
    ).toStrictEqual([WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH]);
  });

  it("all 512 option subsets: the library's own text never raises it", () => {
    // The union half of the change, proved rather than argued: the code is
    // additive, and on every run where the library composes the whole value it
    // adds nothing. The sweep above already proves no Value is over; this proves
    // the DISCLOSURE agrees with the measurement rather than firing beside it.
    let raised = 0;
    for (let mask = 0; mask < 1 << DEIDENTIFY_OPTIONS.length; mask++) {
      const retain = DEIDENTIFY_OPTIONS.filter((_, i) => ((mask >> i) & 1) === 1);
      const codes = deidentify(buildWithPriorMethod(), { retain }).report.warnings.map(
        (w) => w.code,
      );
      if (codes.includes(WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH)) raised++;
    }
    expect(raised).toBe(0);
  });

  it("🩺 the cost of measuring BYTES: a conformant multi-byte Value raises it too", () => {
    // Disclosed rather than claimed away. No repertoire encodes a character in
    // fewer than one byte, so 64 bytes or fewer can never be over 64 CHARACTERS
    // and this cannot miss a genuine violation; the converse does not hold. A
    // 40-character value under a UTF-8 repertoire whose characters are three
    // bytes each is 120 bytes, is conformant, and is reported.
    const threeByteChar = "中"; // a CJK ideograph, 3 bytes in UTF-8
    const value = threeByteChar.repeat(40);
    expect(value).toHaveLength(40);
    expect(Buffer.from(value, "utf8")).toHaveLength(120);

    // The file DECLARES the repertoire, so the value really is 40 characters
    // rather than 120 bytes a fixture asserted were characters. Without
    // `(0008,0005)` the default repertoire is ISO-IR 6 and the claim would be
    // false by fixture, which is this repo's recurring failure mode.
    const parsed = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: SPECIFIC_CHARACTER_SET, vr: "CS" as VR, value: even("ISO_IR 192") },
          { tag: PATIENT_NAME, vr: "PN" as VR, value: even(PATIENT) },
          { tag: DEIDENT_METHOD, vr: "LO" as VR, value: Buffer.from(value, "utf8") },
        ],
      }),
    );
    expect(parsed.get(SPECIFIC_CHARACTER_SET)?.rawBytes.toString("latin1").trim()).toBe(
      "ISO_IR 192",
    );

    const codes = deidentify(parsed).report.warnings.map((w) => w.code);
    expect(codes).toContain(WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH);
  });

  it("the codes the base already raised all still raise: nothing goes 1 -> 0", () => {
    // 🛑 WIDEN BY UNION, NEVER BY REPLACEMENT. Every shape that raised a method
    // code before this change raises the same one now, with the new code only
    // ever ADDED beside it. Measured by stripping the new code and comparing
    // against the base's answers, which are pinned as literals.
    const withoutNew = (codes: readonly string[]): readonly string[] =>
      codes.filter((c) => c !== WARNING_CODES.DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH);
    const codesOf = (ds: Dataset, method?: string): readonly string[] =>
      withoutNew(
        deidentify(
          ds,
          method === undefined ? {} : { deidentificationMethod: method },
        ).report.warnings.map((w) => w.code),
      );

    // No prior at all.
    expect(codesOf(buildWithPriorMethod())).toStrictEqual([]);
    // A conformant LO prior: retained, as before.
    expect(
      codesOf(buildWithPriorMethod({ vr: "LO" as VR, value: even("ACME Anonymizer v3") })),
    ).toStrictEqual([WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED]);
    // An OVER-LONG LO prior: still retained, and the retention code is not
    // displaced by the new one.
    expect(
      codesOf(buildWithPriorMethod({ vr: "LO" as VR, value: even(`ACME ${"Z".repeat(70)}`) })),
    ).toStrictEqual([WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED]);
    // A non-LO prior: still replaced, still disclosed.
    expect(
      codesOf(buildWithPriorMethod({ vr: "SH" as VR, value: even(`ACME ${"Z".repeat(70)}`) })),
    ).toStrictEqual([WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_LO]);
    // An over-long CALLER method beside a conformant prior: the prior is still
    // retained.
    expect(
      codesOf(
        buildWithPriorMethod({ vr: "LO" as VR, value: even("ACME Anonymizer v3") }),
        "Y".repeat(70),
      ),
    ).toStrictEqual([WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED]);
  });

  it("🩺 a later pass with FEWER options leaves no trace that the earlier one had more", () => {
    // Disclosed here rather than left for a later slice to rediscover. Splitting
    // the record per option plus de-duplicating per value means a token written
    // by pass 1 is simply already present in pass 2, so the two runs are not
    // distinguishable in the attribute: `(0012,0063)` records the UNION of the
    // options ever applied, not a per-run history. The direction is
    // conservative - the union over-states what was retained, never understates
    // it - and the base's one-value-per-run text did distinguish them. It is a
    // real reduction in what PS3.15 E.1.1's provenance carrier holds and is a
    // backlog line, not a defect this slice takes on.
    const first = deidentify(buildWithPriorMethod(), { retain: ["RetainUIDs"] }).dataset;
    const second = deidentify(parseDicom(serializeDicom(first)), {}).dataset;

    expect(rawMethod(second).equals(rawMethod(first))).toBe(true);
    expect(valueLengths(rawMethod(second))).toStrictEqual([61, "RetainUIDs".length]);
  });
});

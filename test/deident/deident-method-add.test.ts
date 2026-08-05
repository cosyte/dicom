/**
 * `DICOM-FILE-META-DROPS-DUPLICATE`, second half - `deidentify()` **replaced**
 * `(0012,0063)` De-identification Method where PS3.15 says it is "inserted in or
 * added to" it.
 *
 * PS3.15 2026c section **E.1.1 "De-identifier"**, read from the SHA-pinned
 * `vendor/nema/part15/` and occurring **exactly once** in that document: "one or
 * more codes from [PS3.16 CID 7050] corresponding to the Profile and Options
 * used shall be added to De-identification Method Code Sequence (0012,0064),
 * and/or a text string describing the method used shall be **inserted in or
 * added to** De-identification Method (0012,0063)."
 *
 * Replacing is neither verb. What it destroyed is the provenance chain that
 * attribute exists to carry: a file already de-identified by another tool came
 * out claiming only this library's method, with the earlier one gone and nothing
 * saying so.
 *
 * **The asymmetry with `(0012,0062)` is the standard's own, and is pinned here
 * rather than described.** The sentence immediately above the one quoted, in the
 * same list: "The Attribute Patient Identity Removed (0012,0062) shall be
 * **replaced or added to** the Data Set with a value of YES." Different verbs,
 * different attributes, and `deidentify` still replaces `(0012,0062)`.
 *
 * **`(0012,0063)` is not in Table E.1-1**, so the Basic Profile never acted on
 * it and the incoming value reached the insertion point untouched - the
 * replacement was the only thing removing it, and removing it was an action no
 * profile asked for. The consequence is disclosed rather than glossed and has
 * its own test below: de-identified output now carries the source file's own
 * method text.
 *
 * Everything here is synthetic; the recognizable-but-fake strings exist only so
 * a substitution is observable.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  Dataset,
  Element,
  WARNING_CODES,
  deidentify,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import {
  WARNING_MESSAGES,
  deidentMethodNotAdded,
  deidentMethodPriorRetained,
} from "../../src/parser/warnings.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const PATIENT_NAME = "00100010" as Tag;
const PATIENT_IDENTITY_REMOVED = "00120062" as Tag;
const DEIDENT_METHOD = "00120063" as Tag;

/** The prior de-identifier's own record, synthetic. */
const PRIOR = "ACME Anonymizer v3 Basic Profile";
/** Synthetic and deliberately fake. */
const PATIENT = "SMITHSON^BRAIN";

const BACKSLASH = "\\";

/** Mirror of `MAX_SHORT_FORM_VALUE_BYTES` in `src/deident/deidentify.ts`, kept local so a
 * regression in either copy shows up here rather than agreeing with itself. */
const MAX_SHORT_FORM_VALUE_BYTES = 0xfffe;

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
 * `(0012,0063)` from a de-identified dataset, unpadded, as latin-1.
 *
 * 🛑 **THIS HELPER STRIPS TRAILING `[NUL SP]`, SO IT CANNOT SEE A PAD-BYTE
 * DEFECT AND MUST NEVER CARRY A FIXED-POINT ASSERTION.** A row titled for the
 * fixed point asserted through it and shipped `#73`'s growth regression. Use
 * {@link rawMethod} for anything about length, growth or idempotence.
 */
function methodOf(ds: Dataset): string {
  return (ds.get(DEIDENT_METHOD)?.rawBytes.toString("latin1") ?? "").replace(/[\0 ]+$/u, "");
}

/** `(0012,0063)`'s Value Field exactly as it stands - pad bytes and all. */
function rawMethod(ds: Dataset): Buffer {
  return Buffer.from(ds.get(DEIDENT_METHOD)?.rawBytes ?? Buffer.alloc(0));
}

describe("(0012,0063) is added to, never replaced", () => {
  it("with no prior value the method is the whole value, exactly as before", () => {
    const method = methodOf(deidentify(buildWithPriorMethod()).dataset);
    expect(method).toContain("@cosyte/dicom");
    expect(method).not.toContain(BACKSLASH);
  });

  it("a prior value survives verbatim and this pass is appended after a backslash", () => {
    const { dataset } = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(PRIOR) }));
    const values = methodOf(dataset).split(BACKSLASH);

    expect(values).toHaveLength(2);
    expect(values[0]).toBe(PRIOR);
    expect(values[1]).toContain("@cosyte/dicom");
  });

  it("the loss this closes is measurable: the prior record used to leave the object", () => {
    // Non-vacuity for the row above, stated as the defect rather than as a
    // property of the fix. Without the prior element the output is a single
    // value; with it the output still contains the prior text. If the insertion
    // ever goes back to `set`, this is red.
    const withPrior = methodOf(
      deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(PRIOR) })).dataset,
    );
    const without = methodOf(deidentify(buildWithPriorMethod()).dataset);
    expect(withPrior).toContain(PRIOR);
    expect(without).not.toContain(PRIOR);
    expect(withPrior.endsWith(without)).toBe(true);
  });

  it("a caller-supplied method string is added, not substituted for the prior one", () => {
    const { dataset } = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(PRIOR) }), {
      deidentificationMethod: "MyTool v1",
    });
    expect(methodOf(dataset)).toBe(`${PRIOR}${BACKSLASH}MyTool v1`);
  });

  it("a prior value that is padding only is not a value to add to", () => {
    const { dataset } = deidentify(
      buildWithPriorMethod({ vr: "LO" as VR, value: Buffer.from("  ", "latin1") }),
    );
    expect(methodOf(dataset)).not.toContain(BACKSLASH);
    expect(methodOf(dataset)).toContain("@cosyte/dicom");
  });

  it("prior bytes are copied through unchanged, so a non-ASCII repertoire survives", () => {
    // 0xC4 is a printable letter under several of the repertoires (0008,0005)
    // can select and is not ASCII. Nothing here decodes it; the point is that
    // the join is a byte concatenation.
    const raw = Buffer.from([0x41, 0xc4, 0x42, 0x43]);
    const { dataset } = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: raw }));
    const out = dataset.get(DEIDENT_METHOD)?.rawBytes ?? Buffer.alloc(0);
    expect(out.subarray(0, raw.length).equals(raw)).toBe(true);
    expect(out[raw.length]).toBe(0x5c);
  });

  it("de-identifying twice does not grow the attribute", () => {
    const once = deidentify(buildWithPriorMethod()).dataset;
    const twice = deidentify(once).dataset;
    expect(rawMethod(twice).equals(rawMethod(once))).toBe(true);

    // And a third pass is still the same, so this is a fixed point rather than
    // an off-by-one.
    expect(rawMethod(deidentify(twice).dataset).equals(rawMethod(once))).toBe(true);
  });

  it("🛑 a CALLER method that itself carries a `\\` is still a fixed point", () => {
    // The refuted draft compared the whole added string against each prior
    // value, so a `1-n` caller string never matched one and every pass appended
    // a further copy: 29 -> 59 -> 89 -> 119 bytes over four passes, against a
    // flat 29 on base. `deidentificationMethod` is a `1-n` value like any other.
    //
    // 🛑 THIS ROW ONCE ASSERTED THROUGH `methodOf`, WHICH STRIPS TRAILING
    // `[NUL SP]`, ON THE ONE DELIMITER-CARRYING INPUT THAT HAS NO TRAILING PAD
    // BYTE - so it was named for a property it could not observe, and the pad
    // regression below went out under it. Raw bytes now, and the delimiter row
    // that DOES carry a pad byte is in the fixed-point block at the end.
    const method = `ACME Anonymizer${BACKSLASH}Basic Profile`;
    let ds = buildWithPriorMethod();
    const seen: Buffer[] = [];
    for (let i = 0; i < 4; i++) {
      ds = deidentify(ds, { deidentificationMethod: method }).dataset;
      seen.push(rawMethod(ds));
    }
    expect(seen[0]?.toString("latin1")).toBe(method);
    for (const raw of seen) expect(raw.equals(seen[0] ?? Buffer.alloc(0))).toBe(true);
  });

  it("a method half of whose values are already recorded adds only the missing ones", () => {
    const first = deidentify(buildWithPriorMethod(), { deidentificationMethod: "Pass A" }).dataset;
    const second = deidentify(first, {
      deidentificationMethod: `Pass A${BACKSLASH}Pass B`,
    }).dataset;
    expect(methodOf(second).split(BACKSLASH)).toEqual(["Pass A", "Pass B"]);
  });

  it("a distinct prior method is kept when this one is added, so the chain is a chain", () => {
    const first = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(PRIOR) }), {
      deidentificationMethod: "Pass A",
    }).dataset;
    const second = deidentify(first, { deidentificationMethod: "Pass B" }).dataset;
    expect(methodOf(second).split(BACKSLASH)).toEqual([PRIOR, "Pass A", "Pass B"]);
  });

  it("a (0012,0063) the file encoded as something other than LO still replaces", () => {
    // The documented bound: bytes under a VR that is not a De-identification
    // Method cannot be concatenated into one. Built directly, because the wire
    // VR is the point.
    const ds = new Dataset({
      warnings: [],
      elements: new Map<Tag, Element>([
        [
          DEIDENT_METHOD,
          new Element({
            tag: DEIDENT_METHOD,
            vr: "UN",
            vm: 1,
            length: 4,
            rawBytes: Buffer.from([0x00, 0x01, 0x02, 0x03]),
            byteOffset: 0,
            littleEndian: true,
          }),
        ],
      ]),
    });
    const method = methodOf(deidentify(ds).dataset);
    expect(method).toContain("@cosyte/dicom");
    expect(method).not.toContain(BACKSLASH);
  });

  it("(0012,0062) is still REPLACED with YES, because the standard uses the other verb there", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: PATIENT_NAME, vr: "PN" as VR, value: even(PATIENT) },
          { tag: PATIENT_IDENTITY_REMOVED, vr: "CS" as VR, value: Buffer.from("NO", "latin1") },
        ],
      }),
    );
    const out = deidentify(ds).dataset.get(PATIENT_IDENTITY_REMOVED);
    expect(out?.rawBytes.toString("latin1").trim()).toBe("YES");
    expect(out?.rawBytes.toString("latin1")).not.toContain(BACKSLASH);
  });

  it("the multi-valued result round-trips through the serializer", () => {
    const { dataset } = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(PRIOR) }));
    const reparsed = parseDicom(serializeDicom(dataset));
    expect(methodOf(reparsed).split(BACKSLASH)[0]).toBe(PRIOR);
    expect(methodOf(reparsed)).toBe(methodOf(dataset));
  });
});

describe("🩺 the join is bounded, because an unencodable value takes the whole object down", () => {
  /** `n` legal 64-character `LO` values joined by `\`: 65n - 1 bytes. */
  function chain(n: number): string {
    return Array.from({ length: n }, (_, i) => `V${String(i).padStart(63, "0")}`).join(BACKSLASH);
  }

  it("a chain the method still fits beside is appended to, and serializes", () => {
    // The control that makes the row below non-vacuous: 65,389 bytes of prior
    // chain, which the 76-byte default method and one delimiter still fit under
    // the ceiling.
    const prior = chain(1006);
    expect(prior.length).toBe(65_389);
    const { dataset, report } = deidentify(
      buildWithPriorMethod({ vr: "LO" as VR, value: even(prior) }),
    );
    expect(methodOf(dataset).startsWith(prior)).toBe(true);
    expect(report.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED,
    );
    expect(() => serializeDicom(dataset)).not.toThrow();
  });

  it("a chain it does not fit beside falls back to the pre-existing replace, and SAYS SO", () => {
    // 65,519 bytes: a legal `1-n` chain, parsed with no warnings, and exactly
    // the provenance chain this feature exists to build. Appending produced a
    // 65,596-byte value, and `LO` is a short-form VR whose Value Length field is
    // 16 bits, so `serializeDicom` threw a raw `RangeError` out of Node's
    // `Buffer` internals - outside the documented `DicomSerializeError` surface,
    // taking the whole de-identified object down.
    const prior = chain(1008);
    expect(prior.length).toBe(65_519);
    const parsed = buildWithPriorMethod({ vr: "LO" as VR, value: even(prior) });
    expect(parsed.warnings).toHaveLength(0);

    const { dataset, report } = deidentify(parsed);
    expect(methodOf(dataset)).toContain("@cosyte/dicom");
    expect(methodOf(dataset)).not.toContain(prior);

    // Not silent. That is the whole difference between this fallback and the
    // defect it falls back to.
    expect(report.warnings.map((w) => w.code)).toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED,
    );

    // And the object survives, which is what the bound is for.
    expect(() => serializeDicom(dataset)).not.toThrow();
    expect(methodOf(parseDicom(serializeDicom(dataset)))).toBe(methodOf(dataset));
  });

  it("🛑 the ceiling guards the ALREADY-RECORDED return too, which a draft left open", () => {
    // The second graded pass found this: the guard sat on the join, so the
    // already-recorded case - a file this library de-identified once already,
    // which is exactly what the fixed-point rule is for - returned the prior
    // value untouched and unbounded. Declared Value Length 65,535, an odd length
    // the parser tolerates with DICOM_ODD_LENGTH_VALUE_PADDED, with this run's
    // own method among the values so nothing is missing to append. `report`
    // carried no warning and `serializeDicom` threw a raw RangeError.
    const method = "Cosyte @cosyte/dicom: PS3.15 Basic Application Level Confidentiality Profile";
    const filler = "F".repeat(65_535 - method.length - 1);
    const prior = `${method}${BACKSLASH}${filler}`;
    expect(prior.length).toBe(65_535);

    const parsed = buildWithPriorMethod({ vr: "LO" as VR, value: Buffer.from(prior, "latin1") });
    expect(parsed.get(DEIDENT_METHOD)?.rawBytes.length).toBeGreaterThan(MAX_SHORT_FORM_VALUE_BYTES);

    const { dataset, report } = deidentify(parsed);
    expect(report.warnings.map((w) => w.code)).toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED,
    );
    expect(dataset.get(DEIDENT_METHOD)?.rawBytes.length).toBeLessThanOrEqual(
      MAX_SHORT_FORM_VALUE_BYTES,
    );
    expect(() => serializeDicom(dataset)).not.toThrow();
  });

  it("the disclosure carries no value, no length and no VR", () => {
    // 🛑 A DIAGNOSTIC ABOUT A DROPPED VALUE IS ITSELF A PHI SURFACE. The prior
    // text is the file's own, so the message must not quote it - name-bearing
    // payload, with a non-vacuity assertion first.
    const named = `${chain(1008).slice(0, 65_500)}${BACKSLASH}removed ${PATIENT}`;
    expect(named).toContain("SMITHSON");
    const { report } = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(named) }));
    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED,
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toBe(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_NOT_ADDED);
    for (let i = 0; i + 4 <= PATIENT.length; i++) {
      expect(warning?.message).not.toContain(PATIENT.slice(i, i + 4));
    }
    // The mutation control: the bound is the factory signature.
    expect(deidentMethodNotAdded).toHaveLength(1);
  });
});

/**
 * 🩺 `DICOM-DEIDENT-NOT-A-FIXED-POINT` - the regression `#73` (`287efae`)
 * introduced, found by a fourth graded pass after three `REFUTED` verdicts had
 * already been answered.
 *
 * `kept` was right-trimmed of `0x20`/`0x00` and `added` was not, so any
 * `deidentificationMethod` ending in a SPACE or a NUL never equalled its own
 * prior copy: the library wrote the method, `encodeDatasetElement`'s even-length
 * pad absorbed the trailing byte, the next parse trimmed it off and the next
 * pass appended the whole method again. Growth ends at the 65,534-byte ceiling,
 * where the guard **replaces the entire prior provenance chain** - the exact
 * loss `#73` existed to prevent, reached from a benign caller string.
 *
 * **Every row here asserts RAW BYTES, never through `methodOf`,** and runs at
 * least three passes. Measured on `287efae` in memory: `"ACME Anonymizer v3 "`
 * read **19 -> 38 -> 57 -> 76** bytes over four passes and `"Pass A\Pass B "`
 * read **14 -> 21 -> 28 -> 35**, against a flat **19** and **14** on `e75fb38`,
 * which replaced and so was a trivial fixed point. Over a real
 * `parse -> deidentify -> serializeDicom -> parse` round trip a 16-byte method
 * read **16 -> 32 -> 48 -> 64 -> 80 -> 96**.
 *
 * **🛑 AND THE FIRST FIX FOR IT WAS REFUTED IN TURN, WHICH IS WHY THE SWEEP AT
 * THE END OF THIS BLOCK EXISTS.** Trimming each operand as a whole Value Field
 * reaches only its LAST value, so a pad byte on an interior value of a `1-n`
 * method still regrew the attribute: `"Pass A \Pass B"` beside a prior
 * `"Pass B "` read **14 -> 21 -> 28 -> 35 -> 42** on that draft, byte-identical
 * to `287efae`, against a flat **14** on `e75fb38` - and it still replaced the
 * whole chain at the ceiling. A block named for a universal must sweep the
 * shapes, not pin the two it fixed.
 *
 * PS3.5 2026c Table 6.2-1, `LO` row: "A character string that may be padded with
 * leading and/or trailing spaces." `LO` is `1-n` and that row describes a
 * **Value**, so the trim at the comparison is **per value**; §6.4's "single
 * padding character … to the end of the Value Field (to the last Value)" is
 * about where the encoder writes its pad, which is why the value WRITTEN is
 * trimmed once, over the field.
 */
describe("🩺 repeated de-identification is a fixed point, on raw bytes", () => {
  /** `(0012,0063)` after each of `passes` full wire round trips. */
  function wirePasses(method: string, passes: number, prior?: Buffer): Buffer[] {
    let bytes = serializeDicom(
      prior === undefined
        ? buildWithPriorMethod()
        : buildWithPriorMethod({ vr: "LO" as VR, value: prior }),
    );
    const seen: Buffer[] = [];
    for (let i = 0; i < passes; i++) {
      const { dataset } = deidentify(parseDicom(bytes), { deidentificationMethod: method });
      bytes = serializeDicom(dataset);
      seen.push(rawMethod(parseDicom(bytes)));
    }
    return seen;
  }

  /** `(0012,0063)` after each of `passes` in-memory passes - no serializer. */
  function memoryPasses(method: string, passes: number, prior?: Buffer): Buffer[] {
    let ds =
      prior === undefined
        ? buildWithPriorMethod()
        : buildWithPriorMethod({ vr: "LO" as VR, value: prior });
    const seen: Buffer[] = [];
    for (let i = 0; i < passes; i++) {
      ds = deidentify(ds, { deidentificationMethod: method }).dataset;
      seen.push(rawMethod(ds));
    }
    return seen;
  }

  function expectFlat(seen: readonly Buffer[], expected: string): void {
    const first = seen[0] ?? Buffer.alloc(0);
    expect(first.toString("latin1")).toBe(expected);
    for (const raw of seen) expect(raw.equals(first)).toBe(true);
    expect(seen.map((r) => r.length)).toEqual(seen.map(() => expected.length));
  }

  it("a method ending in a SPACE: 19 -> 38 -> 57 -> 76 on 287efae, flat now", () => {
    expectFlat(memoryPasses("ACME Anonymizer v3 ", 4), "ACME Anonymizer v3");
    // Six wire round trips, because the growth is per pass and two passes is
    // where a fixed-point claim goes to hide.
    expectFlat(wirePasses("ACME Anonymizer v3 ", 6), "ACME Anonymizer v3");
  });

  it("a method ending in a NUL: 16 -> 32 -> 48 -> 64 -> 80 -> 96 on 287efae, flat now", () => {
    // 16 bytes with a trailing NUL. The wire row keeps the serializer's own pad
    // byte, so the fixed point is 16 bytes there and 15 in memory - both flat.
    expectFlat(memoryPasses("ACME Anonymizer\0", 6), "ACME Anonymizer");
    expectFlat(wirePasses("ACME Anonymizer\0", 6), "ACME Anonymizer ");
  });

  it("a method that carries a `\\` AND a trailing pad: 14 -> 21 -> 28 -> 35 on 287efae", () => {
    // The row the shipped pin could not see: it picked the one delimiter-carrying
    // input with no trailing pad byte, and asserted through a trimming helper.
    expectFlat(memoryPasses(`Pass A${BACKSLASH}Pass B `, 4), "Pass A\\Pass B");
    expectFlat(wirePasses(`Pass A${BACKSLASH}Pass B `, 4), "Pass A\\Pass B ");
  });

  it("a prior FILE value the chain is built on does not grow either", () => {
    // The same defect with the sender's bytes in front of it: what grows is the
    // chain a recipient reads as provenance.
    const seen = memoryPasses("MyTool v1 ", 4, even(PRIOR));
    expectFlat(seen, `${PRIOR}${BACKSLASH}MyTool v1`);
  });

  it("LEADING padding is NOT trimmed - it survives every pass verbatim", () => {
    // Table 6.2-1 calls leading spaces padding too, but no writer adds one: the
    // even-length pad goes on the end (section 6.4), so a leading space cannot
    // break the fixed point and dropping it would discard a byte the caller
    // wrote. Flat at 20 wire bytes on `287efae` as well - this row is a control,
    // not a regression pin.
    expectFlat(wirePasses(" ACME Anonymizer v3", 4), " ACME Anonymizer v3 ");
  });

  it("a method that is padding ONLY records nothing, rather than growing a `\\` per pass", () => {
    // Degenerate, and it has to be answered somewhere: `"   "` trims to empty,
    // which is not "a text string describing the method used", so nothing is
    // added. Appending it as a value would put a bare `\` on the end and grow
    // the attribute by one byte per pass.
    expectFlat(memoryPasses("   ", 3, even(PRIOR)), PRIOR);
    expectFlat(memoryPasses("   ", 3), "");
  });

  it("🛑 an INTERIOR value's pad byte: 14 -> 21 -> 28 -> 35 -> 42 on 287efae AND on the first fix", () => {
    // The shape a graded pass found in the first remedy. Trimming each operand
    // as a whole Value Field reaches only its last value, so `"Pass A "` sitting
    // ahead of the delimiter never matched its own prior copy and the attribute
    // regrew byte-identically to the regression: 14 -> 21 -> 28 -> 35 -> 42 in
    // memory (wire 14 -> 22 -> 28 -> 36 -> 42), against a flat 14 on `e75fb38`,
    // and it still replaced the whole chain at the ceiling. Five passes.
    expectFlat(
      memoryPasses(`Pass A ${BACKSLASH}Pass B`, 5, Buffer.from("Pass B  ", "latin1")),
      "Pass B\\Pass A",
    );
    expectFlat(
      wirePasses(`Pass A ${BACKSLASH}Pass B`, 5, Buffer.from("Pass B  ", "latin1")),
      "Pass B\\Pass A ",
    );

    // A NUL in the interior position, the same way round.
    expectFlat(
      memoryPasses(`Pass A\0${BACKSLASH}Pass B`, 5, Buffer.from("Pass B  ", "latin1")),
      "Pass B\\Pass A",
    );

    // And with a longer, prose-shaped pair, which is what a real caller writes:
    // 40 -> 59 -> 78 -> 97 -> 116 on `287efae` and on the first fix.
    expectFlat(
      memoryPasses(
        `ACME Anonymizer v3 ${BACKSLASH}PS3.15 Basic Profile`,
        5,
        Buffer.from("PS3.15 Basic Profile", "latin1"),
      ),
      "PS3.15 Basic Profile\\ACME Anonymizer v3",
    );
  });

  /**
   * 🛑 **A BLOCK NAMED FOR A UNIVERSAL SWEEPS THE SHAPES.** Two graded passes on
   * this one item were each spent on a caller string nobody had thought to try -
   * a terminal pad byte, then an interior one - so the property is asserted over
   * a matrix rather than over the inputs that motivated each fix. Every cell runs
   * four in-memory passes and four wire round trips and demands raw-byte
   * equality; a cell that grows by even one byte per pass is red.
   */
  it("🛑 the SWEEP: every pad position, delimiter count and prior, flat over four passes", () => {
    const methods = [
      "ACME v3",
      "ACME v3 ",
      "ACME v3\0",
      " ACME v3",
      ` ACME v3 ${BACKSLASH} Pass B `,
      `A${BACKSLASH}B`,
      `A ${BACKSLASH}B`,
      `A${BACKSLASH}B `,
      `A ${BACKSLASH}B `,
      `A\0${BACKSLASH}B\0`,
      `A${BACKSLASH}${BACKSLASH}B`,
      `A${BACKSLASH}A `,
      `${BACKSLASH}A`,
      `A${BACKSLASH}`,
    ];
    const priors = [
      undefined,
      Buffer.from("B ", "latin1"),
      Buffer.from("A  ", "latin1"),
      Buffer.from(`A ${BACKSLASH}B `, "latin1"),
      Buffer.from(`B${BACKSLASH}A`, "latin1"),
      even(PRIOR),
    ];
    for (const method of methods) {
      for (const prior of priors) {
        const mem = memoryPasses(method, 4, prior);
        const first = mem[0] ?? Buffer.alloc(0);
        for (const raw of mem) {
          expect(
            { method, prior: prior?.toString("latin1"), lengths: mem.map((r) => r.length) },
            "in-memory passes must be byte-identical",
          ).toEqual({
            method,
            prior: prior?.toString("latin1"),
            lengths: mem.map(() => first.length),
          });
          expect(raw.equals(first)).toBe(true);
        }

        const onWire = wirePasses(method, 4, prior);
        const firstWire = onWire[0] ?? Buffer.alloc(0);
        for (const raw of onWire) {
          expect(
            { method, prior: prior?.toString("latin1"), lengths: onWire.map((r) => r.length) },
            "wire round trips must be byte-identical",
          ).toEqual({
            method,
            prior: prior?.toString("latin1"),
            lengths: onWire.map(() => firstWire.length),
          });
          expect(raw.equals(firstWire)).toBe(true);
        }
      }
    }
  });
});

describe("what adding rather than replacing costs, disclosed", () => {
  it("🩺 a name a sender put in (0012,0063) now reaches de-identified output", () => {
    // A RESIDUAL TEST THAT ASSERTS THE COST, not an all-clear. Table E.1-1 does
    // not list (0012,0063), so the Basic Profile keeps it exactly as it keeps
    // every other unlisted attribute; the replacement removed it as a side
    // effect of an insertion, which is not a rule any profile states. Closing
    // this direction is a product call about unlisted attributes, not a fix to
    // this insertion - and it would turn this test red, deliberately.
    const abused = `Anonymized by hand: removed ${PATIENT}`;
    const { dataset } = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(abused) }));

    // Non-vacuity: the payload really carries the name.
    expect(abused).toContain("SMITHSON");
    expect(methodOf(dataset)).toContain("SMITHSON");

    // And the attribute the profile DOES list is still gone, so this is a
    // statement about (0012,0063) alone.
    expect(dataset.get(PATIENT_NAME)?.rawBytes.toString("latin1") ?? "").not.toContain("SMITHSON");
  });

  it("🩺 and the retention is REPORTED, so the stamp does not outrun the redaction", () => {
    // The second half of `DICOM-DEIDENT-NOT-A-FIXED-POINT`. On `287efae` the
    // name above reached output stamped `(0012,0062) = YES` with
    // `report.warnings` EMPTY and `report.retained` `[]` - an audit reading as a
    // scrub it did not perform, which is the failure `#66` and `#69` were each
    // opened for. Nothing about the retention changes; the silence does.
    const abused = `Anonymized by hand: removed ${PATIENT}`;
    expect(abused).toContain("SMITHSON");
    const { dataset, report } = deidentify(
      buildWithPriorMethod({ vr: "LO" as VR, value: even(abused) }),
    );

    expect(methodOf(dataset)).toContain("SMITHSON");
    expect(dataset.get(PATIENT_IDENTITY_REMOVED)?.rawBytes.toString("latin1").trim()).toBe("YES");
    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toBe(WARNING_MESSAGES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED);

    // 🛑 The diagnostic is itself a PHI surface, and the payload is name-bearing
    // so this is not vacuous by fixture.
    for (let i = 0; i + 4 <= PATIENT.length; i++) {
      expect(warning?.message).not.toContain(PATIENT.slice(i, i + 4));
    }
    // The bound is the factory signature: a position, and nothing else.
    expect(deidentMethodPriorRetained).toHaveLength(1);
  });

  it("the disclosure is not universal noise: no prior value, no warning", () => {
    // Non-vacuity for the row above. A file with nothing in (0012,0063) retains
    // nothing there, so the code must be absent - otherwise it says nothing.
    const { report } = deidentify(buildWithPriorMethod());
    expect(report.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
    );

    // Nor when the prior value is padding only, which is not a value to keep.
    const padded = deidentify(
      buildWithPriorMethod({ vr: "LO" as VR, value: Buffer.from("  ", "latin1") }),
    );
    expect(padded.report.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
    );

    // But it DOES fire on this library's own earlier record, and that is the
    // honest reading: on a second pass the prior value is a value the input file
    // carried, and nothing on the wire says who wrote it. The code means "bytes
    // from the input file are in (0012,0063)", never "the sender wrote something
    // identifying" - stated in the code's JSDoc, the troubleshooting row and the
    // changeset, so it is pinned here rather than left to the reader.
    const twice = deidentify(deidentify(buildWithPriorMethod()).dataset);
    expect(twice.report.warnings.map((w) => w.code)).toContain(
      WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED,
    );

    // And not when the ceiling forced the replacement: nothing of the sender's
    // is in the output then, and `DICOM_DEIDENT_METHOD_NOT_ADDED` is the code
    // for that shape. The two are mutually exclusive by construction.
    const huge = Array.from({ length: 1008 }, (_, i) => `V${String(i).padStart(63, "0")}`).join(
      BACKSLASH,
    );
    const ceiling = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(huge) }));
    const codes = ceiling.report.warnings.map((w) => w.code);
    expect(codes).toContain(WARNING_CODES.DICOM_DEIDENT_METHOD_NOT_ADDED);
    expect(codes).not.toContain(WARNING_CODES.DICOM_DEIDENT_METHOD_PRIOR_RETAINED);
  });

  it("the report stays value-free about it - nothing from (0012,0063) is echoed", () => {
    const abused = `removed ${PATIENT}`;
    const { report } = deidentify(buildWithPriorMethod({ vr: "LO" as VR, value: even(abused) }));
    const serialized = JSON.stringify({
      attributes: report.attributes,
      removedPrivateTags: report.removedPrivateTags,
      embeddedAttributes: report.embeddedAttributes,
      unauditableSequences: report.unauditableSequences,
      undefinedVrElements: report.undefinedVrElements,
      warnings: report.warnings,
    });
    expect(abused).toContain("SMITHSON");
    expect(serialized).not.toContain("SMITHSON");
    expect(serialized).not.toContain("SMIT");
  });
});

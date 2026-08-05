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

import { Dataset, Element, deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
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

/** `(0012,0063)` from a de-identified dataset, unpadded, as latin-1. */
function methodOf(ds: Dataset): string {
  return (ds.get(DEIDENT_METHOD)?.rawBytes.toString("latin1") ?? "").replace(/[\0 ]+$/u, "");
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
    expect(methodOf(twice)).toBe(methodOf(once));

    // And a third pass is still the same, so this is a fixed point rather than
    // an off-by-one.
    expect(methodOf(deidentify(twice).dataset)).toBe(methodOf(once));
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

/**
 * `DICOM-CARRIER-LEAF-LEAKS`, mechanism (2) - an element whose **on-wire VR is
 * not one of the 34 PS3.5 §6.2 defines** carried a source Patient ID into
 * de-identified output.
 *
 * ## The shape, and why it is not the over-declare defect
 *
 * `#53` closed the **over**-declare: a Value Length longer than the value that
 * was encoded, which swallows the following element into this one's value. This
 * is the **under**-declare, and it is not a swallow at all. The reader finishes
 * the short value early, and the leftover bytes of the value that was actually
 * written are read as the next Data Element header - so its tag, its VR and its
 * length are all fragments of somebody's value, and the element that genuinely
 * followed is consumed as this fabricated element's "value".
 *
 * The fixtures below under-declare a 14-byte `"CARRIER-VALUE "` by 6. The
 * leftover bytes are `"VALUE "`, which under Explicit VR LE read as tag
 * `(4156,554C)` with the VR bytes `"E "` and a length of 16 - exactly the
 * `(0010,0020)` header and value that follow. The tag and the VR in these
 * expectations are therefore **derived from the fixture**, not chosen: change
 * the carrier's value and they change with it.
 *
 * ## Why the string controls are here and not in a binary-only file
 *
 * Mechanism (1), the residual `#53` disclosed, is bounded to **binary** carriers
 * because its detection turns on the carrier VR's repertoire. This one is not:
 * the carrier's own VR never enters the decision, so `LO` and `ST` carriers
 * reach it exactly as `OB` does. That is measured, not assumed - on the grid at
 * `35adc2d`, 6 of the 8 leaking `delta=-6` cells were Explicit VR LE and two of
 * those were the `LO` and `ST` controls.
 *
 * ## What must NOT move
 *
 * `UN` is one of the 34. Every control below that asserts an ordinary `UN` or an
 * Implicit VR LE fallback survives is pinning the line the sibling
 * `SQ`-with-no-items rule could not draw: "unknown to the dictionary" is a much
 * larger set than "not a VR", and a rule keyed on the former would empty every
 * `UN` element in every file.
 *
 * Every behavioural expectation was run red against `35adc2d`.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { MAX_UNDEFINED_VR_FINDINGS, deidentify } from "../../src/deident/deidentify.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { defineProfile } from "../../src/index.js";
import { parseDicom } from "../../src/parser/index.js";
import { WARNING_CODES } from "../../src/parser/warnings.js";
import { serializeDicom } from "../../src/serialize/serialize.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_IMPLICIT_LE = "1.2.840.10008.1.2";

/** Synthetic throughout. No real identifier appears in this file. */
const PATIENT_ID = "MRN-11111";
const ROOT_NAME = "ROOT^PATIENT";

/** `(0010,0020)` Patient ID: `Z` in Table E.1-1. */
const PATIENT_ID_TAG: Tag = "00100020";
/** `(2000,0050)` Film Session Label: `LO`, absent from Table E.1-1, so it is kept. */
const LO_CARRIER: Tag = "20000050";
/** `(2010,0010)` Image Display Format: `ST`, absent from Table E.1-1. */
const ST_CARRIER: Tag = "20100010";
/** `(4010,1006)` Threat Sequence: `OB`, absent from Table E.1-1. */
const OB_CARRIER: Tag = "40101006";
/** `(3002,0003)` RT Image Label: an `LO` tag the fixtures write a real `UN` over. */
const UN_TAG: Tag = "30020003";

/**
 * The element the under-declare fabricates: tag `(4156,554C)`, VR bytes `"E "`.
 * Both fall out of `"VALUE "` read as an Explicit VR LE header - see the module
 * note. Asserting the exact tag is deliberate: it proves the fixture produced
 * the shape under test rather than merely producing *a* failure.
 */
const FABRICATED_TAG: Tag = "4156554C";

/** The carrier payload whose 6-byte tail becomes {@link FABRICATED_TAG}'s header. */
const CARRIER_VALUE = "CARRIER-VALUE";

function ascii(text: string): Buffer {
  const buf = Buffer.from(text, "latin1");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x20])]);
}

/**
 * A file whose carrier under-declares its own Value Length by 6, desynchronizing
 * the reader so that the `(0010,0020)` that follows is read as the value of a
 * fabricated element instead of as itself.
 */
function underDeclare(carrier: Tag, vr: VR, transferSyntax = TS_EXPLICIT_LE): Buffer {
  return buildDicom({
    transferSyntax,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN" as VR, value: ascii(ROOT_NAME) },
      { tag: carrier, vr, value: ascii(CARRIER_VALUE), declaredLengthDelta: -6 },
      { tag: PATIENT_ID_TAG, vr: "LO" as VR, value: ascii(PATIENT_ID) },
    ],
  });
}

function deidBytes(raw: Buffer): string {
  return serializeDicom(deidentify(parseDicom(raw)).dataset).toString("latin1");
}

describe("DICOM-CARRIER-LEAF-LEAKS: an on-wire VR that is not a VR", () => {
  // -------------------------------------------------------------------------
  // The defect, and the fixture's own preconditions.
  // -------------------------------------------------------------------------

  it("the parser really does fabricate (4156,554C) with the VR bytes 'E '", () => {
    // The precondition every expectation below rests on. Without it a green
    // result could mean the remedy works OR that the fixture never produced the
    // shape - the vacuity class `#50` shipped once and this repo now checks for.
    const ds = parseDicom(underDeclare(LO_CARRIER, "LO"));
    const fabricated = ds.get(FABRICATED_TAG);
    expect(fabricated).toBeDefined();
    expect(fabricated?.vr).toBe("E ");
    expect(fabricated?.rawBytes.toString("latin1")).toContain(PATIENT_ID);
    // And the real Patient ID element does NOT exist, which is why Table E.1-1
    // has nothing to act on and the identifier used to survive.
    expect(ds.has(PATIENT_ID_TAG)).toBe(false);
    expect(ds.warnings).toEqual([]);
  });

  it("does not write the source Patient ID into de-identified output", () => {
    expect(deidBytes(underDeclare(LO_CARRIER, "LO"))).not.toContain(PATIENT_ID);
  });

  it("empties the fabricated element rather than removing it", () => {
    const { dataset } = deidentify(parseDicom(underDeclare(LO_CARRIER, "LO")));
    expect(dataset.has(FABRICATED_TAG)).toBe(true);
    expect(dataset.get(FABRICATED_TAG)?.rawBytes).toHaveLength(0);
  });

  it("reports the carrier and the bytes dropped, and no value", () => {
    const { report } = deidentify(parseDicom(underDeclare(LO_CARRIER, "LO")));
    expect(report.undefinedVrElements).toEqual([{ tag: FABRICATED_TAG, byteLength: 16 }]);
  });

  it("warns with a message that names neither the value nor the VR bytes", () => {
    const { report } = deidentify(parseDicom(underDeclare(LO_CARRIER, "LO")));
    const w = report.warnings.find(
      (x) => x.code === WARNING_CODES.DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE,
    );
    expect(w).toBeDefined();
    expect(w?.message).toContain(FABRICATED_TAG);
    expect(w?.message).not.toContain(PATIENT_ID);
    // The VR field is two bytes the sender chose. Echoing them back into a log
    // line that is emitted once per element is the thing `#48` bound.
    expect(w?.message).not.toContain("E ");
  });

  // -------------------------------------------------------------------------
  // It is NOT bounded to binary carriers - the point that separates it from
  // mechanism (1).
  // -------------------------------------------------------------------------

  it.each([
    ["LO", LO_CARRIER, "LO"],
    ["ST", ST_CARRIER, "ST"],
    ["OB", OB_CARRIER, "OB"],
  ])("reaches a %s carrier: the carrier's own VR never decides it", (_label, tag, vr) => {
    expect(deidBytes(underDeclare(tag, vr as VR))).not.toContain(PATIENT_ID);
  });

  // -------------------------------------------------------------------------
  // The line: "not a VR" is not "unknown to the dictionary".
  // -------------------------------------------------------------------------

  it("keeps an ordinary UN element - UN is one of the 34", () => {
    // The CP-246 line. `UN` is a defined VR, so nothing here fires on it, and a
    // rule that DID fire on it would empty every unknown-VR element in every
    // file. That residual needs a parser-set mark and its own slice; this test
    // is what stops this rule from quietly growing into it.
    const keep = "KEEP-THIS-UN";
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN" as VR, value: ascii(ROOT_NAME) },
        { tag: UN_TAG, vr: "UN" as VR, value: ascii(keep) },
      ],
    });
    const { report } = deidentify(parseDicom(raw));
    expect(report.undefinedVrElements).toEqual([]);
    expect(deidBytes(raw)).toContain(keep);
  });

  it("cannot fire under Implicit VR LE, because the VR comes from the dictionary", () => {
    // `(0009,1001)` has no dictionary entry, so Implicit VR LE resolves it to
    // `UN` - one of the 34. Implicit VR LE is this rule's control population:
    // there is no on-wire VR field for a sender to get wrong.
    const keep = "KEEP-THIS-IMPLICIT";
    const raw = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN" as VR, value: ascii(ROOT_NAME) },
        { tag: "00090010", vr: "LO" as VR, value: ascii("ACME PRIVATE 01") },
        { tag: "00091001", vr: "LO" as VR, value: ascii(keep) },
      ],
    });
    const profile = defineProfile({
      name: "acme",
      privateTags: {
        "ACME PRIVATE 01": { "0009XX01": { vr: "LO", keyword: "AcmeThing", name: "Acme Thing" } },
      },
    });
    const { dataset, report } = deidentify(parseDicom(raw, { profile }), {
      retain: ["RetainSafePrivate"],
      profile,
    });
    expect(report.undefinedVrElements).toEqual([]);
    expect(serializeDicom(dataset).toString("latin1")).toContain(keep);
  });

  // -------------------------------------------------------------------------
  // No carve-out. `keepOrEmpty` is the only path that keeps a value verbatim.
  // -------------------------------------------------------------------------

  it("empties it even under RetainSafePrivate with a profile that vouches for the tag", () => {
    // The sibling `SQ` rule has a real carve-out here: `keepsPrivate` decides
    // first and a vouched-for private `SQ` is kept verbatim, still leaking. This
    // rule does not, and the reason is structural rather than a promise - a
    // vouched-for private element still routes through `keepOrEmpty`, which is
    // where the test sits. The claim in `DeidentifyReport.undefinedVrElements`
    // says exactly this, so it is pinned rather than asserted in prose.
    //
    // `(0009,1001)` is private (odd group) and its on-wire VR is `"ZZ"`, which
    // is not one of the 34.
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN" as VR, value: ascii(ROOT_NAME) },
        { tag: "00090010", vr: "LO" as VR, value: ascii("ACME PRIVATE 01") },
        { tag: "00091001", vr: "ZZ" as VR, value: ascii(PATIENT_ID) },
      ],
    });
    const profile = defineProfile({
      name: "acme",
      privateTags: {
        "ACME PRIVATE 01": { "0009XX01": { vr: "LO", keyword: "AcmeThing", name: "Acme Thing" } },
      },
    });
    const parsed = parseDicom(raw, { profile });
    // Precondition: the element exists, is private, and carries the odd VR.
    expect(parsed.get("00091001")?.vr).toBe("ZZ");

    const { dataset, report } = deidentify(parsed, {
      retain: ["RetainSafePrivate"],
      profile,
    });
    expect(report.undefinedVrElements).toEqual([{ tag: "00091001", byteLength: 10 }]);
    expect(dataset.get("00091001")?.rawBytes).toHaveLength(0);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(PATIENT_ID);
  });

  it("still audits an Annex E attribute that happens to carry an odd VR", () => {
    // A report that loses an attribute is its own defect class, independent of
    // the leak: the action table still resolves `(0010,0020)` to `Z` and still
    // says so. The undefined-VR test sits inside the KEEP path, so it cannot
    // displace an action the table resolved.
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN" as VR, value: ascii(ROOT_NAME) },
        { tag: PATIENT_ID_TAG, vr: "ZZ" as VR, value: ascii(PATIENT_ID) },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(raw));
    expect(report.attributes.map((a) => `${a.tag}:${a.action}`)).toContain("00100020:Z");
    expect(dataset.get(PATIENT_ID_TAG)?.rawBytes).toHaveLength(0);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(PATIENT_ID);
  });

  it("leaves a well-formed file completely alone", () => {
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN" as VR, value: ascii(ROOT_NAME) },
        { tag: LO_CARRIER, vr: "LO" as VR, value: ascii(CARRIER_VALUE) },
        { tag: PATIENT_ID_TAG, vr: "LO" as VR, value: ascii(PATIENT_ID) },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(raw));
    expect(report.undefinedVrElements).toEqual([]);
    expect(dataset.get(LO_CARRIER)?.rawBytes.toString("latin1")).toBe(CARRIER_VALUE + " ");
  });

  // -------------------------------------------------------------------------
  // The bound: the record is capped on a run-scoped budget, the removal is not.
  // -------------------------------------------------------------------------

  /**
   * `n` elements whose on-wire VR is `"ZZ"`, each an 8-byte short-form header
   * with a zero-length value, plus one that carries the identifier.
   *
   * This is the cheapest amplification the format allows and it is worse than
   * the sibling rule's: an un-auditable `SQ` needs a value, but an undefined-VR
   * element needs nothing at all past its header. `#54`'s first draft was
   * measured at 58,255 findings from a 1 MiB input for exactly this reason.
   */
  function manyUndefinedVr(n: number): Buffer {
    const elements: { tag: Tag; vr: VR; value: Buffer }[] = [
      { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
    ];
    for (let i = 0; i < n; i++) {
      // Even group, ascending, never `(0000,0000)` and never private.
      const group = 0x4000 + ((i >> 8) & 0xff) * 2;
      const element = i & 0xff;
      const tag = `${group.toString(16).padStart(4, "0")}${element
        .toString(16)
        .padStart(4, "0")}`.toUpperCase();
      elements.push({ tag, vr: "ZZ" as VR, value: Buffer.alloc(0) });
    }
    elements.push({ tag: PATIENT_ID_TAG, vr: "ZZ" as VR, value: ascii(PATIENT_ID) });
    return buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements,
    });
  }

  it("caps the RECORD across the run, and never the removal", () => {
    const many = MAX_UNDEFINED_VR_FINDINGS * 8;
    const ds = parseDicom(manyUndefinedVr(many));
    // Precondition: the fixture really did produce that many undefined-VR
    // elements. A cost test whose fixture cannot express the blow-up measures
    // nothing - the lesson `#53`'s quadratic scan shipped on.
    expect(ds.elements().filter((el) => (el.vr as string) === "ZZ")).toHaveLength(many + 1);

    const { dataset, report } = deidentify(ds);
    expect(report.undefinedVrElements).toHaveLength(MAX_UNDEFINED_VR_FINDINGS);
    expect(
      report.warnings.filter(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE,
      ),
    ).toHaveLength(MAX_UNDEFINED_VR_FINDINGS);

    // The ACTION is not capped: the identifier-bearing element is the LAST one,
    // thousands past the reporting cap, and it is still emptied.
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(PATIENT_ID);
    for (const el of dataset.elements()) {
      if ((el.vr as string) === "ZZ") expect(el.rawBytes).toHaveLength(0);
    }
  });

  it("the report does not grow with the value's length either", () => {
    // One undefined-VR element yields exactly one finding whether its value is
    // 10 bytes or the largest one this parser can read, and the finding is three
    // structural fields.
    //
    // 65,534 is that largest, and the number is itself the §6.2 contradiction
    // this rule rests on: an unrecognized VR is read SHORT-form here, so its
    // length field is 16 bits - while PS3.5 §6.2 requires every VR it does not
    // yet define to be long-form with a 32-bit VL. The value length that reaches
    // the de-identifier is therefore already not the one the standard's own
    // structure rule would produce.
    const max = 65_534;
    const big = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN" as VR, value: ascii(ROOT_NAME) },
        { tag: LO_CARRIER, vr: "ZZ" as VR, value: Buffer.alloc(max, 0x41) },
      ],
    });
    const { report } = deidentify(parseDicom(big));
    expect(report.undefinedVrElements).toHaveLength(1);
    expect(report.undefinedVrElements[0]?.byteLength).toBe(max);
  });
});

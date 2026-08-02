/**
 * `DICOM-OVERDECLARE-SWALLOWS-INTO-VALUE` - an element that over-declares its
 * **own** Value Length swallows the element that follows it into its value,
 * where PS3.15 Table E.1-1 cannot see it.
 *
 * Every behavioural expectation below was run red against `0.0.6` (`244a372`)
 * before the remedy existed. The shape that makes them red is precise and is the
 * trap this family has been caught by twice: the carrier must over-declare by
 * **exactly** the on-wire size of the element that follows it. Over-declaring
 * *past the end of the buffer* trips the truncation guard the parser already
 * has, so a fixture written that way is green against the defect.
 *
 * The root-level cases matter most: **no sequence is involved.** Every prior
 * slice in this family was about a sequence's or an item's extent; this one is a
 * layer beneath them, which is why five passes over `parseSequence` never
 * reached it.
 *
 * The controls are not decoration. Three conjuncts have to hold before a value
 * is emptied - the tail must tile exactly, it must contain an attribute this run
 * would act on, and it must contain a byte the carrier's VR cannot hold - and
 * there is one test per conjunct proving that dropping it alone keeps the value.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { deidentify } from "../../src/deident/deidentify.js";
import { findEmbeddedAttributes } from "../../src/deident/embedded.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { parseDicom } from "../../src/parser/index.js";
import { WARNING_CODES } from "../../src/parser/warnings.js";
import { serializeDicom } from "../../src/serialize/serialize.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** Synthetic throughout. No real identifier appears in this file. */
const PATIENT_ID = "MRN-11111";
const NESTED_ID = "MRN-99999";
const STUDY_UID = "1.2.826.0.1.3680043.10.1338.7";

/** `(0008,0008)` Image Type: `CS`, and **not** in Table E.1-1, so it is kept. */
const CARRIER: Tag = "00080008";
/** `(0010,0020)` Patient ID: `Z/D` in Table E.1-1. */
const PATIENT_ID_TAG: Tag = "00100020";
/** `(0020,000D)` Study Instance UID: `U` by default, `K` under `RetainUIDs`. */
const STUDY_UID_TAG: Tag = "0020000D";
/** `(0028,0010)` Rows: `US`, and not in Table E.1-1 - nothing acts on it. */
const ROWS_TAG: Tag = "00280010";
/** `(0008,1115)` Referenced Series Sequence: `SQ`, not in Table E.1-1. */
const SQ_TAG: Tag = "00081115";

function ascii(text: string): Buffer {
  const buf = Buffer.from(text, "latin1");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x20])]);
}

/** On-wire size of a short-form element: 8-byte header (explicit or implicit) + value. */
function onWire(value: Buffer): number {
  return 8 + value.length;
}

/**
 * A file whose `(0008,0008)` over-declares by exactly the on-wire size of the
 * `(0010,0020)` that follows it, at the **root**, with no sequence anywhere.
 */
function rootSwallow(transferSyntax: string, id = PATIENT_ID): Buffer {
  const idValue = ascii(id);
  return buildDicom({
    transferSyntax,
    elements: [
      {
        tag: CARRIER,
        vr: "CS" as VR,
        value: ascii("ORIGINAL"),
        declaredLengthDelta: onWire(idValue),
      },
      { tag: PATIENT_ID_TAG, vr: "LO" as VR, value: idValue },
    ],
  });
}

/** The same lie, one Data Set down: inside a defined-length Sequence Item. */
function itemSwallow(transferSyntax: string): Buffer {
  const idValue = ascii(NESTED_ID);
  return buildDicom({
    transferSyntax,
    elements: [
      {
        tag: SQ_TAG,
        items: [
          {
            elements: [
              {
                tag: CARRIER,
                vr: "CS" as VR,
                value: ascii("ORIGINAL"),
                declaredLengthDelta: onWire(idValue),
              },
              { tag: PATIENT_ID_TAG, vr: "LO" as VR, value: idValue },
            ],
          },
        ],
      },
    ],
  });
}

function deidBytes(raw: Buffer): string {
  const { dataset } = deidentify(parseDicom(raw));
  return serializeDicom(dataset).toString("latin1");
}

describe("deidentify: an over-declared Value Length that swallowed the next element", () => {
  // -------------------------------------------------------------------------
  // The harm, at the root, with no sequence involved.
  // -------------------------------------------------------------------------

  it.each([
    ["Explicit VR LE", TS_EXPLICIT_LE],
    ["Explicit VR BE", TS_EXPLICIT_BE],
    ["Implicit VR LE", TS_IMPLICIT_LE],
  ])("%s: the swallowed Patient ID does not reach de-identified bytes", (_name, ts) => {
    // Red on 0.0.6: the identifier is written out verbatim inside the kept
    // (0008,0008) value, with an empty report and no warning.
    expect(deidBytes(rootSwallow(ts))).not.toContain(PATIENT_ID);
  });

  it("the parser still reads the file exactly as it did before - this is a de-identify fix", () => {
    // The two readings ("the length is right" / "the length lied") are
    // byte-identical, so nothing here claims to recover the true one. The
    // carrier's parsed value still holds the swallowed bytes.
    const ds = parseDicom(rootSwallow(TS_EXPLICIT_LE));
    expect(ds.warnings).toHaveLength(0);
    expect(ds.get(PATIENT_ID_TAG)).toBeUndefined();
    expect(ds.get(CARRIER)?.rawBytes.toString("latin1")).toContain(PATIENT_ID);
  });

  it("reports the carrier, its VR and the tag that was hidden inside it", () => {
    const { report } = deidentify(parseDicom(rootSwallow(TS_EXPLICIT_LE)));
    expect(report.embeddedAttributes).toEqual([
      { tag: CARRIER, vr: "CS", hidden: [PATIENT_ID_TAG] },
    ]);
  });

  it("warns with a message that names the carrier and no value", () => {
    const { report } = deidentify(parseDicom(rootSwallow(TS_EXPLICIT_LE)));
    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED,
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toContain(CARRIER);
    expect(warning?.message).not.toContain(PATIENT_ID);
  });

  it("empties the carrier rather than removing it, so the attribute still exists", () => {
    const { dataset } = deidentify(parseDicom(rootSwallow(TS_EXPLICIT_LE)));
    const carrier = dataset.get(CARRIER);
    expect(carrier).toBeDefined();
    expect(carrier?.rawBytes).toHaveLength(0);
  });

  it("does not mutate the input dataset", () => {
    const ds = parseDicom(rootSwallow(TS_EXPLICIT_LE));
    const before = ds.get(CARRIER)?.rawBytes.toString("hex");
    deidentify(ds);
    expect(ds.get(CARRIER)?.rawBytes.toString("hex")).toBe(before);
  });

  // -------------------------------------------------------------------------
  // One Data Set down. The `contextPath` is what makes an audit usable.
  // -------------------------------------------------------------------------

  it.each([
    ["Explicit VR LE", TS_EXPLICIT_LE],
    ["Explicit VR BE", TS_EXPLICIT_BE],
  ])("%s: a swallow inside a Sequence Item is caught and located", (_name, ts) => {
    const { report } = deidentify(parseDicom(itemSwallow(ts)));
    expect(deidBytes(itemSwallow(ts))).not.toContain(NESTED_ID);
    expect(report.embeddedAttributes).toEqual([
      { tag: CARRIER, vr: "CS", hidden: [PATIENT_ID_TAG], contextPath: [`${SQ_TAG}[0]`] },
    ]);
  });

  // -------------------------------------------------------------------------
  // The action table is the single authority. An Option that keeps an attribute
  // keeps it here too - two copies of "what counts as PHI" would drift.
  // -------------------------------------------------------------------------

  it("a swallowed Study Instance UID is removed by default (action U)", () => {
    const uid = ascii(STUDY_UID);
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: CARRIER,
          vr: "CS" as VR,
          value: ascii("ORIGINAL"),
          declaredLengthDelta: onWire(uid),
        },
        { tag: STUDY_UID_TAG, vr: "UI" as VR, value: uid },
      ],
    });
    const { report } = deidentify(parseDicom(raw));
    expect(report.embeddedAttributes).toHaveLength(1);
    expect(serializeDicom(deidentify(parseDicom(raw)).dataset).toString("latin1")).not.toContain(
      STUDY_UID,
    );
  });

  it("...and is kept under RetainUIDs, because that Option resolves it to K", () => {
    const uid = ascii(STUDY_UID);
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: CARRIER,
          vr: "CS" as VR,
          value: ascii("ORIGINAL"),
          declaredLengthDelta: onWire(uid),
        },
        { tag: STUDY_UID_TAG, vr: "UI" as VR, value: uid },
      ],
    });
    const { report, dataset } = deidentify(parseDicom(raw), { retain: ["RetainUIDs"] });
    expect(report.embeddedAttributes).toEqual([]);
    expect(dataset.get(CARRIER)?.rawBytes.toString("latin1")).toContain(STUDY_UID);
  });

  // -------------------------------------------------------------------------
  // Controls. Each drops exactly one conjunct and must leave the value alone.
  // -------------------------------------------------------------------------

  it("a well-formed file loses nothing and reports nothing", () => {
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: CARRIER, vr: "CS" as VR, value: ascii("ORIGINAL") },
        { tag: PATIENT_ID_TAG, vr: "LO" as VR, value: ascii(PATIENT_ID) },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(raw));
    expect(report.embeddedAttributes).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(dataset.get(CARRIER)?.rawBytes.toString("latin1")).toBe("ORIGINAL");
  });

  it("a swallowed element nothing acts on leaves the carrier alone", () => {
    // (0028,0010) Rows is not in Table E.1-1. The value still tiles exactly and
    // still holds NUL bytes a `CS` cannot carry - only the middle conjunct is
    // dropped, and that is enough.
    const rows = Buffer.from([0x00, 0x02]);
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: CARRIER,
          vr: "CS" as VR,
          value: ascii("ORIGINAL"),
          declaredLengthDelta: onWire(rows),
        },
        { tag: ROWS_TAG, vr: "US" as VR, value: rows },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(raw));
    expect(report.embeddedAttributes).toEqual([]);
    expect(dataset.get(CARRIER)?.rawBytes).toHaveLength(8 + onWire(rows));
  });

  it("a binary carrier is never scanned, and that residual is deliberate", () => {
    // `OB` admits arbitrary bytes, so no content test can distinguish a swallow
    // from a legitimate value. Scanning it would trade a measured guarantee for
    // a coin-flip that deletes pixel and lookup-table data. Stated in
    // `src/deident/embedded.ts`, pinned here so it cannot drift silently.
    const idValue = ascii(PATIENT_ID);
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x0010, 0);
    header.writeUInt16LE(0x0020, 2);
    header.write("LO", 4, "latin1");
    header.writeUInt16LE(idValue.length, 6);
    const value = Buffer.concat([Buffer.from([0x01, 0x02]), header, idValue]);
    expect(findEmbeddedAttributes(value, "OB", "explicitLE", () => true)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Unit-level: the exact-tiling and repertoire conjuncts.
  // -------------------------------------------------------------------------

  /** `(2020,2020) SH` length `0x2020`, every byte >= 0x20 - a legal `SH` payload. */
  function controlByteFreeEmbedding(): Buffer {
    const header = Buffer.from([0x20, 0x20, 0x20, 0x20, 0x53, 0x48, 0x20, 0x20]);
    return Buffer.concat([Buffer.from("PREFIX", "latin1"), header, Buffer.alloc(0x2020, 0x41)]);
  }

  it("a tail with no byte outside the carrier VR's repertoire is not a swallow", () => {
    // Every conjunct but the repertoire one holds: it tiles exactly and the
    // caller says the tag is actionable. Without this guard a long, entirely
    // legal uppercase value could be deleted on a coincidence.
    expect(findEmbeddedAttributes(controlByteFreeEmbedding(), "SH", "explicitLE", () => true)).toBe(
      undefined,
    );
  });

  it("...and the same bytes with a single NUL in them are", () => {
    const value = controlByteFreeEmbedding();
    value[value.length - 1] = 0x00;
    expect(findEmbeddedAttributes(value, "SH", "explicitLE", () => true)).toEqual(["20202020"]);
  });

  it("a tail that does not reach the end of the value is not a swallow", () => {
    const idValue = ascii(PATIENT_ID);
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x0010, 0);
    header.writeUInt16LE(0x0020, 2);
    header.write("LO", 4, "latin1");
    header.writeUInt16LE(idValue.length, 6);
    // Two trailing bytes nothing accounts for: the run under-shoots the value's
    // end, so it is not the shape an over-declare produces.
    const value = Buffer.concat([header, idValue, Buffer.from([0x20, 0x20])]);
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", () => true)).toBeUndefined();
  });

  it("decodes each even offset of a large value once", () => {
    // Exercises the backward memo pass only: a value of 0x41 produces **zero**
    // tiling candidates, so it says nothing about the forward loop. The
    // adversarial fixture that does - every even offset a candidate, which is
    // where a quadratic hid for one round - is in `embedded-detector.test.ts`.
    const value = Buffer.alloc(1 << 19, 0x41);
    const started = performance.now();
    expect(findEmbeddedAttributes(value, "UT", "explicitLE", () => true)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

/**
 * `DICOM-IMPLICIT-SQ-NOT-DESCENDED` - a defined-length `SQ` under Implicit VR LE
 * must be descended, because nothing that walks `Element.items` can see inside a
 * sequence the parser never opened.
 *
 * The harm is not a navigation gap. `deidentify()` recurses into a kept sequence
 * only when `el.items !== undefined`, so an undescended sequence carries whatever
 * it holds straight through into `serializeDicom()` output while the
 * `DeidentifyReport` names only the attributes it did reach. The report therefore
 * asserts a scrub it did not perform.
 *
 * PS3.5 2026c states the obligation **twice, in two sections, about two different
 * length fields**, and only the second one is what this defect broke. Both were
 * read from the vendored, SHA-pinned `vendor/nema/part05/`, and each sentence
 * occurs exactly once in the document.
 *
 * Section **7.5.2** "Delimitation of The Sequence of Items" governs the `SQ`
 * element's OWN length field, which is the one defaulted to defined length here:
 * "The encoder of a Sequence of Items may choose either one of the two ways of
 * encoding. Both ways of encoding shall be supported by decoders of the Sequence
 * of Items."
 *
 * Section **7.5.1** "Item Encoding Rules" says the same of each `(FFFE,E000)`
 * Item's length field: "The encoder of a Data Set may choose either one of the
 * two ways of encoding. Both ways of encoding shall be supported by decoders of
 * Data Sets." That is why the two forms are covered in every combination below -
 * a sequence picks one, and each item picks its own, independently.
 *
 * A decoder that opens only the undefined-length form supports one of the two.
 *
 * Every fixture is **synthetic** and built in memory by `build-dicom`; the
 * deliberately fake names below exist only so their absence from the output is
 * observable.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomParseError,
  WARNING_CODES,
  deidentify,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Synthetic, deliberately fake. Present only so its absence is testable. */
const ROOT_NAME = "ROOT^PATIENT";
const NESTED_NAME = "NESTED^PATIENT";
const DEEP_NAME = "DEEPER^PATIENT";

/**
 * `(0008,1115)` Referenced Series Sequence is `SQ` in PS3.6 and carries **no**
 * Table E.1-1 row, so `deidentify()` keeps it and recurses - which makes it the
 * sharpest carrier for the leak: nothing about the sequence itself is redacted,
 * only what descent finds inside it.
 */
const CARRIER = "00081115" as const;

/** Root PN + a defined-length `SQ` holding a defined-length item with a nested PN. */
function nestedNameFixture(transferSyntax: string): Buffer {
  return buildDicom({
    transferSyntax,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN", value: Buffer.from(ROOT_NAME, "ascii") },
      {
        tag: CARRIER,
        items: [
          {
            elements: [{ tag: "00100010", vr: "PN", value: Buffer.from(NESTED_NAME, "ascii") }],
          },
        ],
      },
    ],
  });
}

describe("DICOM-IMPLICIT-SQ-NOT-DESCENDED - the leak, constructed", () => {
  it("descends a defined-length SQ under Implicit VR LE into its items", () => {
    const ds = parseDicom(nestedNameFixture(IMPLICIT_LE));
    const sq = ds.get(CARRIER);

    expect(sq?.vr).toBe("SQ");
    // The defect: `items` was `undefined`, so `vm` sat at the Phase 2 scalar
    // placeholder of 1 and looked right while the sequence was never opened.
    expect(sq?.items).toBeDefined();
    expect(sq?.items).toHaveLength(1);
    expect(sq?.vm).toBe(1);
    expect(sq?.items?.[0]?.get("00100010")?.rawBytes.toString("latin1")).toBe(NESTED_NAME);
  });

  it("scrubs a PN nested in a defined-length item out of serialized output", () => {
    const ds = parseDicom(nestedNameFixture(IMPLICIT_LE));
    const { dataset, report } = deidentify(ds);
    const out = serializeDicom(dataset);

    expect(out.includes(Buffer.from(ROOT_NAME, "ascii"))).toBe(false);
    // The leak: these bytes reached the caller's output verbatim.
    expect(out.includes(Buffer.from(NESTED_NAME, "ascii"))).toBe(false);
    expect(report.attributes.some((a) => a.tag === "00100010" && a.contextPath === undefined)).toBe(
      true,
    );
    // ...and the report named only the root attribute, asserting a scrub it had
    // not performed. A value-free audit is only trustworthy if it is complete.
    expect(
      report.attributes.some((a) => a.tag === "00100010" && a.contextPath?.[0] === `${CARRIER}[0]`),
    ).toBe(true);
  });

  it("matches the Explicit VR LE control byte-for-byte in what it removes", () => {
    // The control: the identical fixture under a syntax whose parser already
    // descended defined-length sequences. Its result is the bar, not a guess.
    const implicitReport = deidentify(parseDicom(nestedNameFixture(IMPLICIT_LE))).report;
    const explicitReport = deidentify(parseDicom(nestedNameFixture(EXPLICIT_LE))).report;

    const shape = (r: typeof implicitReport): string =>
      JSON.stringify(
        r.attributes
          .map((a) => `${a.tag}|${a.action}|${a.applied}|${(a.contextPath ?? []).join(">")}`)
          .sort(),
      );
    expect(shape(implicitReport)).toBe(shape(explicitReport));

    const explicitOut = serializeDicom(
      deidentify(parseDicom(nestedNameFixture(EXPLICIT_LE))).dataset,
    );
    expect(explicitOut.includes(Buffer.from(NESTED_NAME, "ascii"))).toBe(false);
  });
});

describe("DICOM-IMPLICIT-SQ-NOT-DESCENDED - descent shapes", () => {
  it("descends an undefined-length item inside a defined-length SQ", () => {
    // The two length forms are independent choices: section 7.5.2 lets the
    // sequence pick one, section 7.5.1 lets each item pick its own.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: IMPLICIT_LE,
        elements: [
          {
            tag: CARRIER,
            items: [
              {
                undefinedLength: true,
                elements: [{ tag: "00100010", vr: "PN", value: Buffer.from(NESTED_NAME, "ascii") }],
              },
            ],
          },
        ],
      }),
    );
    expect(ds.get(CARRIER)?.items?.[0]?.get("00100010")?.rawBytes.toString("latin1")).toBe(
      NESTED_NAME,
    );
  });

  it("descends a defined-length SQ nested inside a defined-length item", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: IMPLICIT_LE,
        elements: [
          {
            tag: CARRIER,
            items: [
              {
                elements: [
                  {
                    tag: "00082112",
                    items: [
                      {
                        elements: [
                          { tag: "00100010", vr: "PN", value: Buffer.from(DEEP_NAME, "ascii") },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const inner = ds.get(CARRIER)?.items?.[0]?.get("00082112");
    expect(inner?.items).toHaveLength(1);
    expect(inner?.items?.[0]?.get("00100010")?.rawBytes.toString("latin1")).toBe(DEEP_NAME);
  });

  it("descends a defined-length SQ nested inside an undefined-length item", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: IMPLICIT_LE,
        elements: [
          {
            tag: CARRIER,
            undefinedLength: true,
            items: [
              {
                undefinedLength: true,
                elements: [
                  {
                    tag: "00082112",
                    items: [
                      {
                        elements: [
                          { tag: "00100010", vr: "PN", value: Buffer.from(DEEP_NAME, "ascii") },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const inner = ds.get(CARRIER)?.items?.[0]?.get("00082112");
    expect(inner?.items?.[0]?.get("00100010")?.rawBytes.toString("latin1")).toBe(DEEP_NAME);
  });

  it("gives a zero-length SQ an empty items array rather than no items at all", () => {
    // `items: []` says "opened, nothing inside"; `undefined` says "never opened".
    // Only the first is true here, and `deidentify()` branches on the difference.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: IMPLICIT_LE,
        elements: [{ tag: CARRIER, items: [] }],
      }),
    );
    const sq = ds.get(CARRIER);
    expect(sq?.length).toBe(0);
    expect(sq?.items).toEqual([]);
    expect(sq?.vm).toBe(0);
  });
});

/**
 * The on-wire span of the carrier element, from its Implicit VR LE tag bytes to
 * the end of the fixture (it is always the last element built).
 *
 * A whole-file comparison would be the wrong control: `serializeDicom` normalizes
 * File Meta (it writes `(0002,0001)` and `(0002,0012)` and orders the group), so
 * the header legitimately differs. What must not differ is the dataset span.
 */
function carrierSpan(buf: Buffer): Buffer {
  const tagBytes = Buffer.from([0x08, 0x00, 0x15, 0x11]); // (0008,1115) Implicit VR LE
  const at = buf.indexOf(tagBytes);
  expect(at).toBeGreaterThan(0);
  return buf.subarray(at);
}

describe("DICOM-IMPLICIT-SQ-NOT-DESCENDED - serialization is unchanged", () => {
  it("re-emits a descended defined-length SQ byte-for-byte", () => {
    // `rawBytes` for this shape stays VALUE-ONLY, which is what
    // `isFullSpanElement` assumes for Implicit VR: a full-span slice here would
    // make the writer emit the element header twice. Green on base as well as
    // after - it is a control on the descent not disturbing the writer, not a
    // proof of the descent.
    const buf = nestedNameFixture(IMPLICIT_LE);
    expect(serializeDicom(parseDicom(buf)).includes(carrierSpan(buf))).toBe(true);
  });
});

describe("DICOM-IMPLICIT-SQ-NOT-DESCENDED - a failed descent loses nothing", () => {
  /**
   * A tag whose PS3.6 VR is `SQ` but whose defined-length value is not items.
   * Under Implicit VR the `SQ` is a **dictionary inference**, not something the
   * file said - unlike Explicit VR, where `SQ` is on the wire. Defined length
   * also leaves a well-formed alternative reading (the value is exactly `length`
   * bytes), which undefined length does not. So a descent that fails here must
   * fall back, not take the whole object down with it.
   */
  function malformedSqFixture(): Buffer {
    return buildDicom({
      transferSyntax: IMPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN", value: Buffer.from(ROOT_NAME, "ascii") },
        { tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") },
        // Eight bytes that are not an (FFFE,E000) Item header.
        { tag: CARRIER, vr: "SQ", value: Buffer.from("NOTITEMS", "ascii") },
      ],
    });
  }

  it("keeps the rest of the object readable and the bytes intact", () => {
    let ds;
    try {
      ds = parseDicom(malformedSqFixture());
    } catch (err) {
      throw new Error(
        `parse threw instead of degrading: ${err instanceof DicomParseError ? err.code : String(err)}`,
        { cause: err },
      );
    }
    expect(ds.get("00100010")?.rawBytes.toString("latin1")).toBe(ROOT_NAME);
    expect(ds.get("00080060")?.rawBytes.toString("latin1")).toBe("CT");
    const sq = ds.get(CARRIER);
    expect(sq?.items).toBeUndefined();
    expect(sq?.rawBytes.toString("latin1")).toBe("NOTITEMS");
  });

  it("says so with a warning rather than degrading in silence", () => {
    const ds = parseDicom(malformedSqFixture());
    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_SQ_NOT_DESCENDED);
  });

  it("re-emits the undescended span byte-for-byte", () => {
    const buf = malformedSqFixture();
    expect(serializeDicom(parseDicom(buf)).includes(carrierSpan(buf))).toBe(true);
  });
});

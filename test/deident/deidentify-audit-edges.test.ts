/**
 * Three `deidentify()` outcomes whose audit has to say what was really done:
 *
 * - a value a Retain option keeps (`K`) that turns out to carry a whole Data Element is emptied,
 *   and the report says `emptied` rather than `kept`;
 * - an element with an on-wire VR outside the 34 inside a Sequence Item is recorded with the
 *   path to that Item, and emptied;
 * - a hand-assembled Sequence that names its Specific Character Set keeps it through the rebuild;
 * - a `U` attribute the file sends as a Sequence is kept with every Item de-identified, and the
 *   audit says `kept` under the `U` its Table E.1-1 row resolves to.
 *
 * Every byte is synthetic. The identifiers are invented so their absence from output is visible.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import type { Tag, VR } from "../../src/dictionary/types.js";
import { Dataset, Element, Item, deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const EXPLICIT_LE = "1.2.840.10008.1.2.1";

const PATIENT_ID = "MRN-11111";
const PATIENT_ID_TAG: Tag = "00100020";
/** `(0020,000D)` Study Instance UID: `U` in the Basic Profile, `K` under `RetainUIDs`. */
const STUDY_UID_TAG: Tag = "0020000D";
const STUDY_UID = "1.2.826.0.1.3680043.10.1338.7";
/** `(0008,0110)` Coding Scheme Identification Sequence: registered, no Table E.1-1 row. */
const KEPT_SEQUENCE: Tag = "00080110";
/** `(2000,0050)` Film Session Label: registered, no Table E.1-1 row. */
const LEAF: Tag = "20000050";

function ascii(text: string): Buffer {
  const buf = Buffer.from(text, "latin1");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x20])]);
}

describe("a value kept by a Retain option that carries a whole Data Element", () => {
  it("is emptied, and the audit says emptied under the K it resolved to", () => {
    const id = ascii(PATIENT_ID);
    const raw = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        // Over-declared by the on-wire size of the Patient ID that follows, which it swallows.
        {
          tag: STUDY_UID_TAG,
          vr: "UI" as VR,
          value: ascii(STUDY_UID),
          declaredLengthDelta: 8 + id.length,
        },
        { tag: PATIENT_ID_TAG, vr: "LO" as VR, value: id },
      ],
    });
    const parsed = parseDicom(raw);
    // Precondition: the identifier is inside the kept value and nowhere else.
    expect(parsed.get(STUDY_UID_TAG)?.rawBytes.toString("latin1")).toContain(PATIENT_ID);
    expect(parsed.has(PATIENT_ID_TAG)).toBe(false);

    const { dataset, report } = deidentify(parsed, { retain: ["RetainUIDs"] });

    const audited = report.attributes.find((a) => a.tag === STUDY_UID_TAG);
    expect(audited?.action).toBe("K");
    expect(audited?.applied).toBe("emptied");
    expect(report.embeddedAttributes.map((e) => e.tag)).toEqual([STUDY_UID_TAG]);
    expect(dataset.get(STUDY_UID_TAG)?.rawBytes).toHaveLength(0);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(PATIENT_ID);
  });
});

describe("an element whose on-wire VR is not a VR, inside a Sequence Item", () => {
  it("is emptied and recorded with the path to its Item", () => {
    const raw = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        {
          tag: KEPT_SEQUENCE,
          items: [{ elements: [{ tag: LEAF, vr: "ZZ" as VR, value: ascii(PATIENT_ID) }] }],
        },
      ],
    });
    const parsed = parseDicom(raw);
    const nested = parsed.get(KEPT_SEQUENCE)?.items?.[0]?.get(LEAF);
    expect(nested?.vr).toBe("ZZ");

    const { dataset, report } = deidentify(parsed);

    expect(report.undefinedVrElements).toHaveLength(1);
    expect(report.undefinedVrElements[0]?.byteOffset).toBe(nested?.byteOffset);
    expect(report.undefinedVrElements[0]?.contextPath).toEqual([`${KEPT_SEQUENCE}[0]`]);
    expect(dataset.get(KEPT_SEQUENCE)?.items?.[0]?.get(LEAF)?.rawBytes).toHaveLength(0);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(PATIENT_ID);
  });
});

describe("a hand-assembled Sequence that names its Specific Character Set", () => {
  it("keeps the character set on the rebuilt Sequence", () => {
    const inner = new Element({
      tag: "00080100",
      vr: "SH",
      vm: 1,
      length: 6,
      rawBytes: ascii("113100"),
      byteOffset: 0,
      littleEndian: true,
      specificCharacterSet: ["ISO_IR 192"],
    });
    const item = new Item({ index: 0, warnings: [], elements: new Map([[inner.tag, inner]]) });
    const sequence = new Element({
      tag: KEPT_SEQUENCE,
      vr: "SQ",
      vm: 1,
      length: 0xffffffff,
      rawBytes: Buffer.alloc(0),
      byteOffset: 0,
      littleEndian: true,
      specificCharacterSet: ["ISO_IR 192"],
      items: [item],
    });
    const parsed = parseDicom(buildDicom({ transferSyntax: EXPLICIT_LE, elements: [] }));
    const ds = new Dataset({
      ...(parsed.fileMeta !== undefined ? { fileMeta: parsed.fileMeta } : {}),
      warnings: [],
      elements: new Map([[sequence.tag, sequence]]),
    });

    const out = deidentify(ds).dataset.get(KEPT_SEQUENCE);

    expect(out?.specificCharacterSet).toEqual(["ISO_IR 192"]);
    expect(out?.items).toHaveLength(1);
  });
});

describe("a U attribute the file sends as a Sequence", () => {
  /** `(0010,0010)` Patient Name: `Z` in the Basic Profile. */
  const PATIENT_NAME_TAG: Tag = "00100010";
  const PATIENT_NAME = "SYNTHETIC^WIREVR";

  function studyUidAsSequence(): Buffer {
    return buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        {
          tag: STUDY_UID_TAG,
          items: [
            {
              elements: [
                { tag: PATIENT_NAME_TAG, vr: "PN" as VR, value: ascii(PATIENT_NAME) },
                { tag: PATIENT_ID_TAG, vr: "LO" as VR, value: ascii(PATIENT_ID) },
                { tag: LEAF, vr: "LO" as VR, value: ascii("FILM-A") },
              ],
            },
          ],
        },
      ],
    });
  }

  it("is kept with its Item walked, so no identifier inside it reaches the output", () => {
    const parsed = parseDicom(studyUidAsSequence());
    // Precondition: the wire VR wins over the dictionary's UI, and the name sits inside the Item.
    expect(parsed.get(STUDY_UID_TAG)?.vr).toBe("SQ");
    expect(parsed.warnings.map((w) => w.code)).toContain("DICOM_VR_MISMATCH");
    const sourceItem = parsed.get(STUDY_UID_TAG)?.items?.[0];
    expect(sourceItem?.get(PATIENT_NAME_TAG)?.rawBytes.toString("latin1")).toContain(PATIENT_NAME);

    const { dataset, report } = deidentify(parsed);

    const audited = report.attributes.find(
      (a) => a.tag === STUDY_UID_TAG && a.contextPath === undefined,
    );
    expect(audited?.action).toBe("U");
    expect(audited?.applied).toBe("kept");
    const kept = dataset.get(STUDY_UID_TAG);
    expect(kept?.vr).toBe("SQ");
    expect(kept?.items).toHaveLength(1);
    // The Item's own attributes were judged, each audited under the path to the Item.
    const nested = report.attributes.filter((a) => a.contextPath?.[0] === `${STUDY_UID_TAG}[0]`);
    expect(nested.map((a) => [a.tag, a.action])).toEqual(
      expect.arrayContaining([
        [PATIENT_NAME_TAG, "Z"],
        [PATIENT_ID_TAG, "Z"],
      ]),
    );
    expect(kept?.items?.[0]?.get(LEAF)?.rawBytes.toString("latin1")).toContain("FILM-A");
    const written = serializeDicom(dataset).toString("latin1");
    expect(written).not.toContain(PATIENT_NAME);
    expect(written).not.toContain(PATIENT_ID);
  });
});

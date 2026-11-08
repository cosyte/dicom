/**
 * A value too long for its 16-bit Value Length Field, where PS3.5 forbids `UN`, is refused with a
 * typed error, never a raw `RangeError`.
 *
 * PS3.5 2026c section 6.2.2 has a Data Element "whose Value Length exceeds 65534" in a VR with a
 * 16-bit Explicit VR Value Length Field written with VR `UN`, and the writer does that since 0.1.5
 * (`./oversized-short-form.test.ts`). The same section says "The UN VR shall not be used for
 * Private Creator Data Elements" and "shall not be used for File Meta Information Data Elements
 * (any Tag (0002,xxxx))". For those two the value has no encoding at all, and the writer still put
 * its length through the 16-bit write and threw a `RangeError`, which `serializeDicom` documents
 * nowhere. It now throws `DicomSerializeError` with `VALUE_TOO_LONG_FOR_VR`.
 *
 * The nightly fuzz harness's long-value family, extended to place its value in a Private Creator or
 * the File Meta group, found it on base after 18 cases and shrank it to the first fixture here: a
 * 65,713-byte Implicit VR Little Endian file whose File Meta group carries `(0002,0100)` Private
 * Information Creator UID as 65,535 spaces at the odd length FFFFH the reader tolerates. The writer
 * pads that to 65,536 bytes, one past the field. The File Meta group is Explicit VR Little Endian
 * under every Transfer Syntax, so the Implicit body does not help it.
 *
 * Every object here is synthetic: built by `test/helpers/build-dicom.ts` from spaces and a fixed
 * marker string, with no name, date or identifier in it.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  Dataset,
  DicomSerializeError,
  SERIALIZE_ERROR_CODES,
  WARNING_CODES,
  defineProfile,
  deidentify,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import { Element } from "../../src/dataset/element.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

const EXPLICIT = [
  ["Explicit VR Little Endian", TS_EXPLICIT_LE],
  ["Explicit VR Big Endian", TS_EXPLICIT_BE],
  ["Deflated Explicit VR Little Endian", TS_DEFLATED_LE],
] as const;

const ALL = [["Implicit VR Little Endian", TS_IMPLICIT_LE], ...EXPLICIT] as const;

const PRIVATE_INFORMATION_CREATOR_UID = "00020100";
const PRIVATE_CREATOR = "00090010";
const PRIVATE_ELEMENT = "00091001";
const STUDY_DESCRIPTION = "00081030";
const SOP_INSTANCE_UID = "00080018";
const REFERENCED_SERIES_SEQUENCE = "00081115";

/** A marker that must never reach an error message. */
const MARKER = "SYNTHETIC-CREATOR-MARKER ";

/** `length` bytes of {@link MARKER} repeated. */
function markerValue(length: number): Buffer {
  return Buffer.from(MARKER.repeat(Math.ceil(length / MARKER.length)), "ascii").subarray(0, length);
}

/** The fuzz case, as shrunk: `(0002,0100)` of 65,535 spaces at FFFFH, and no Data Set elements. */
function fuzzCase(transferSyntax: string): Buffer {
  return buildDicom({
    transferSyntax,
    elements: [],
    fileMetaExtraElements: [
      { tag: PRIVATE_INFORMATION_CREATOR_UID, vr: "UI", value: Buffer.alloc(65_535, 0x20) },
    ],
  });
}

/** A Private Creator `(0009,0010)` of `length` marker bytes, and one element of its block. */
function longCreator(transferSyntax: string, length: number): Buffer {
  return buildDicom({
    transferSyntax,
    elements: [
      { tag: PRIVATE_CREATOR, vr: "LO", value: markerValue(length) },
      { tag: PRIVATE_ELEMENT, vr: "LO", value: Buffer.from("XY", "ascii") },
    ],
  });
}

/** The refusal `run` throws: typed, the new code, and no byte of the value in the message. */
function refusal(run: () => unknown): DicomSerializeError {
  let caught: unknown;
  try {
    run();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(DicomSerializeError);
  const err = caught as DicomSerializeError;
  expect(err.code).toBe(SERIALIZE_ERROR_CODES.VALUE_TOO_LONG_FOR_VR);
  expect(err.message.startsWith("[VALUE_TOO_LONG_FOR_VR] ")).toBe(true);
  expect(err.message).not.toContain("SYNTHETIC");
  expect(err.message).not.toContain("MARKER");
  expect(err.message).not.toContain("65,535");
  expect(err.message).not.toContain("65535");
  return err;
}

describe("VALUE_TOO_LONG_FOR_VR: a value past 65,534 bytes where PS3.5 2026c §6.2.2 forbids UN", () => {
  it("is a registered code", () => {
    expect(SERIALIZE_ERROR_CODES.VALUE_TOO_LONG_FOR_VR).toBe("VALUE_TOO_LONG_FOR_VR");
  });

  for (const [name, ts] of ALL) {
    it(`${name}: the fuzz case, a File Meta value at the odd length FFFFH, is refused`, () => {
      const ds = parseDicom(fuzzCase(ts));
      expect(ds.fileMeta?.extraElements?.[0]?.value.length).toBe(65_535);
      const err = refusal(() => serializeDicom(ds));
      expect(err.message).toContain("File Meta Information");
    });
  }

  it("a File Meta value of exactly 65,534 bytes is written in its own VR and reads back", () => {
    const file = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
      fileMetaExtraElements: [
        { tag: PRIVATE_INFORMATION_CREATOR_UID, vr: "UI", value: Buffer.alloc(65_534, 0x31) },
      ],
    });
    const back = parseDicom(serializeDicom(parseDicom(file)));
    const extra = back.fileMeta?.extraElements?.[0];
    expect(extra?.vr).toBe("UI");
    expect(extra?.value.length).toBe(65_534);
  });

  for (const [name, ts] of EXPLICIT) {
    it(`${name}: a Private Creator read at the odd length FFFFH is refused, not written as UN`, () => {
      const ds = parseDicom(longCreator(ts, 65_535));
      expect(ds.get(PRIVATE_CREATOR)?.rawBytes.length).toBe(65_535);
      expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED);
      const err = refusal(() => serializeDicom(ds));
      expect(err.message).toContain("Private Creator");
    });

    it(`${name}: a Private Creator of exactly 65,534 bytes keeps LO and the short form`, () => {
      const back = parseDicom(serializeDicom(parseDicom(longCreator(ts, 65_534))));
      expect(back.get(PRIVATE_CREATOR)?.vr).toBe("LO");
      expect(back.get(PRIVATE_CREATOR)?.rawBytes.equals(markerValue(65_534))).toBe(true);
    });

    it(`${name}: an over-long private element that is not a creator is still written as UN`, () => {
      const file = buildDicom({
        transferSyntax: ts,
        elements: [
          { tag: PRIVATE_CREATOR, vr: "LO", value: Buffer.from("SYNTH CREATOR ", "ascii") },
          { tag: PRIVATE_ELEMENT, vr: "LO", value: Buffer.alloc(65_535, 0x41) },
        ],
      });
      const back = parseDicom(serializeDicom(parseDicom(file)));
      expect(back.get(PRIVATE_CREATOR)?.vr).toBe("LO");
      expect(back.get(PRIVATE_ELEMENT)?.vr).toBe("UN");
      expect(back.get(PRIVATE_ELEMENT)?.rawBytes.length).toBe(65_536);
    });

    it(`${name}: the general over-long case is still written as UN (0.1.5)`, () => {
      const file = buildDicom({
        transferSyntax: ts,
        elements: [{ tag: STUDY_DESCRIPTION, vr: "LO", value: Buffer.alloc(65_535, 0x41) }],
      });
      const out = serializeDicom(parseDicom(file));
      const back = parseDicom(out).get(STUDY_DESCRIPTION);
      expect(back?.vr).toBe("UN");
      expect(back?.rawBytes.length).toBe(65_536);
      expect(back?.rawBytes.subarray(0, 65_535).equals(Buffer.alloc(65_535, 0x41))).toBe(true);
    });
  }

  it("Implicit VR Little Endian: a Private Creator past 65,534 bytes has a 32-bit length and is written", () => {
    const back = parseDicom(serializeDicom(parseDicom(longCreator(TS_IMPLICIT_LE, 65_535))));
    expect(back.get(PRIVATE_CREATOR)?.vr).toBe("LO");
    expect(back.get(PRIVATE_CREATOR)?.rawBytes.length).toBe(65_536);
  });

  it("a hand-built Dataset with a group 0002 element in its body is refused the same way", () => {
    const value = markerValue(65_536);
    const ds = new Dataset({
      fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE },
      warnings: [],
      elements: new Map([
        [
          PRIVATE_INFORMATION_CREATOR_UID,
          new Element({
            tag: PRIVATE_INFORMATION_CREATOR_UID,
            vr: "UI",
            vm: 1,
            length: value.length,
            rawBytes: value,
            byteOffset: 0,
            littleEndian: true,
          }),
        ],
      ]),
    });
    const err = refusal(() => serializeDicom(ds));
    expect(err.message).toContain("File Meta Information");
  });

  describe("after deidentify, with a Profile that names the creator and RetainSafePrivate", () => {
    const creator = markerValue(65_535).toString("ascii");
    const profile = defineProfile({
      name: "synthetic-long-creator",
      privateTags: { [creator]: { "0009XX01": { vr: "LO", keyword: "SynthX", name: "Synth X" } } },
    });

    it("at the root: deidentify returns the creator, and serializeDicom refuses it", () => {
      const ds = parseDicom(longCreator(TS_EXPLICIT_LE, 65_535), { profile });
      const { dataset } = deidentify(ds, { retain: ["RetainSafePrivate"], profile });
      expect(dataset.get(PRIVATE_CREATOR)?.rawBytes.length).toBe(65_535);
      refusal(() => serializeDicom(dataset));
    });

    it("inside an Item it re-encodes: deidentify refuses with the same typed error", () => {
      const file = buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: REFERENCED_SERIES_SEQUENCE,
            items: [
              {
                elements: [
                  { tag: SOP_INSTANCE_UID, vr: "UI", value: Buffer.from("1.2.3\0", "ascii") },
                  { tag: PRIVATE_CREATOR, vr: "LO", value: Buffer.from(creator, "ascii") },
                  { tag: PRIVATE_ELEMENT, vr: "LO", value: Buffer.from("XY", "ascii") },
                ],
              },
            ],
          },
        ],
      });
      const ds = parseDicom(file, { profile });
      refusal(() => deidentify(ds, { retain: ["RetainSafePrivate"], profile }));
    });
  });
});

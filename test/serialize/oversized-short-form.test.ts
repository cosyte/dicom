/**
 * A value too long for its 16-bit Value Length Field is written as `UN`, never thrown at.
 *
 * Under Explicit VR, twenty-odd VRs (`AE`, `CS`, `DS`, `LO`, `PN`, `UI`, `US`, ...) carry a 16-bit
 * Value Length Field, so their longest even value is 65,534 bytes. PS3.5 2026c section 6.2.2 says
 * a Data Element "whose Value Length exceeds 65534" in one of them is encoded with a VR of `UN`,
 * and that a `UN` value is Little Endian "irrespective of the current Transfer Syntax". The writer
 * used to put such a length through the 16-bit write and throw a raw `RangeError`, which
 * `serializeDicom` documents nowhere. Two routes reach it from a file:
 *
 *   - `deidentify` remaps every value of a multi-valued `UI`, and each remapped UID is longer than
 *     what it replaced. The nightly fuzz run found it: a SOP Instance UID of 1,008 backslashes
 *     (1,009 empty values) comes out of `deidentify` 65,584 bytes long.
 *   - The reader takes a value at the odd length `FFFFH` (tolerated, `DICOM_ODD_LENGTH_VALUE_PADDED`)
 *     and the writer pads it to 65,536 bytes.
 *
 * Every object here is synthetic: built by `test/helpers/build-dicom.ts` from fill bytes and
 * backslashes, with no name, date or identifier in it.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { deidentify, parseDicom, serializeDicom } from "../../src/index.js";
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

const SOP_INSTANCE_UID = "00080018";
const STUDY_DESCRIPTION = "00081030";
const REFERENCED_SERIES_SEQUENCE = "00081115";
const REFERENCED_SOP_INSTANCE_UID = "00081155";
const ROWS = "00280010";

/** The fuzz case, minimized: a SOP Instance UID of 1,008 backslashes, 1,009 empty values. */
function manyEmptyUids(transferSyntax: string): Buffer {
  return buildDicom({
    transferSyntax,
    elements: [{ tag: SOP_INSTANCE_UID, vr: "UI", value: Buffer.from("\\".repeat(1008), "ascii") }],
  });
}

/** One `LO` value of `length` bytes of `A`. */
function longStudyDescription(transferSyntax: string, length: number): Buffer {
  return buildDicom({
    transferSyntax,
    elements: [{ tag: STUDY_DESCRIPTION, vr: "LO", value: Buffer.alloc(length, 0x41) }],
  });
}

describe("a value past 65,534 bytes in a 16-bit-length VR is written as UN (PS3.5 2026c §6.2.2)", () => {
  for (const [name, ts] of EXPLICIT) {
    it(`${name}: deidentify's remapped UI, the fuzz case, serializes and reads back as UN`, () => {
      const { dataset } = deidentify(parseDicom(manyEmptyUids(ts)));
      const remapped = dataset.get(SOP_INSTANCE_UID)?.rawBytes;
      expect(remapped?.length).toBeGreaterThan(65_534);

      const out = serializeDicom(dataset);
      const back = parseDicom(out).get(SOP_INSTANCE_UID);
      expect(back?.vr).toBe("UN");
      expect(back?.rawBytes.equals(remapped ?? Buffer.alloc(0))).toBe(true);
    });

    it(`${name}: a value read at the odd length FFFFH pads to 65,536 and goes out as UN`, () => {
      const ds = parseDicom(longStudyDescription(ts, 65_535));
      expect(ds.get(STUDY_DESCRIPTION)?.rawBytes.length).toBe(65_535);

      const out = serializeDicom(ds);
      const back = parseDicom(out).get(STUDY_DESCRIPTION);
      expect(back?.vr).toBe("UN");
      expect(back?.rawBytes.length).toBe(65_536);
      expect(back?.rawBytes.subarray(0, 65_535).equals(Buffer.alloc(65_535, 0x41))).toBe(true);
      expect(back?.rawBytes[65_535]).toBe(0x20);

      // Still a fixed point: writing what was written changes nothing.
      expect(serializeDicom(parseDicom(out)).equals(out)).toBe(true);
    });

    it(`${name}: a value of exactly 65,534 bytes keeps its own VR and the short form`, () => {
      const out = serializeDicom(parseDicom(longStudyDescription(ts, 65_534)));
      const back = parseDicom(out).get(STUDY_DESCRIPTION);
      expect(back?.vr).toBe("LO");
      expect(back?.rawBytes.length).toBe(65_534);
    });
  }

  for (const [name, ts] of EXPLICIT) {
    it(`${name}: deidentify re-encodes an Item whose UI it grows past 65,534 bytes, as UN`, () => {
      // `deidentify` rebuilds a Sequence it acts inside through the same element encoder, so on
      // base the RangeError came out of `deidentify` itself, before anything was serialized.
      const file = buildDicom({
        transferSyntax: ts,
        elements: [
          {
            tag: REFERENCED_SERIES_SEQUENCE,
            items: [
              {
                elements: [
                  {
                    tag: REFERENCED_SOP_INSTANCE_UID,
                    vr: "UI",
                    value: Buffer.from("\\".repeat(1008), "ascii"),
                  },
                ],
              },
            ],
          },
        ],
      });
      const { dataset } = deidentify(parseDicom(file));
      const remapped = dataset
        .get(REFERENCED_SERIES_SEQUENCE)
        ?.items?.[0]?.get(REFERENCED_SOP_INSTANCE_UID);
      // In the model the element keeps its own VR; the Item's encoded bytes carry it as UN.
      expect(remapped?.vr).toBe("UI");
      expect(remapped?.rawBytes.length).toBeGreaterThan(65_534);

      const back = parseDicom(serializeDicom(dataset));
      const nested = back
        .get(REFERENCED_SERIES_SEQUENCE)
        ?.items?.[0]?.get(REFERENCED_SOP_INSTANCE_UID);
      expect(nested?.vr).toBe("UN");
      expect(nested?.rawBytes.equals(remapped?.rawBytes ?? Buffer.alloc(0))).toBe(true);
    });
  }

  it("Explicit VR Big Endian: a numeric value written as UN is swapped to Little Endian", () => {
    // US values 0..32766 in Big Endian, then one stray byte: 65,535 bytes at the odd length FFFFH.
    const be = Buffer.alloc(65_535, 0x7f);
    for (let k = 0; k < 32_767; k++) be.writeUInt16BE(k, k * 2);
    const header = Buffer.from([0x00, 0x28, 0x00, 0x10, 0x55, 0x53, 0xff, 0xff]); // (0028,0010) US FFFFH
    const file = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [],
      dataSetBytes: Buffer.concat([header, be]),
    });

    const out = serializeDicom(parseDicom(file));
    const back = parseDicom(out).get(ROWS);
    expect(back?.vr).toBe("UN");
    const value = back?.rawBytes ?? Buffer.alloc(0);
    expect(value.length).toBe(65_536);
    for (const k of [0, 1, 2, 255, 256, 32_766]) expect(value.readUInt16LE(k * 2)).toBe(k);
  });

  it("Implicit VR Little Endian is untouched: its 32-bit lengths carry the value in its own VR", () => {
    const { dataset } = deidentify(parseDicom(manyEmptyUids(TS_IMPLICIT_LE)));
    const out = serializeDicom(dataset);
    const back = parseDicom(out).get(SOP_INSTANCE_UID);
    expect(back?.vr).toBe("UI");
    expect(back?.rawBytes.equals(dataset.get(SOP_INSTANCE_UID)?.rawBytes ?? Buffer.alloc(0))).toBe(
      true,
    );
  });
});

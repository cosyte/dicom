/**
 * The compact table's own edges: a source of 4 GiB or more, the character set lists it keeps by
 * identity, and the File Meta reader's bound on a long-form header's reserved bytes.
 *
 * Synthetic data only.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { CompactTable } from "../../src/dataset/compact.js";
import { DicomParseError, parseDicom } from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

const text = (s: string): Buffer => {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
};

describe("CompactTable", () => {
  it("counts positions in 64-bit floats when the source is 4 GiB or more", () => {
    const table = new CompactTable(false);
    // Only the length and offset of the source are read until a value is.
    table.begin({ length: 0x100000000, byteOffset: 0 } as unknown as Buffer);
    expect(table.rows).toBeInstanceOf(Float64Array);
    const set = table.openSet();
    table.addRow(set, 0x00100010, 4, 0x100000000 + 8, 0, 0, 0);
    const done = table.closeSet(set, 0, 0x100000010);
    table.addRoot(done);
    table.finish();
    expect(table.rows).toBeInstanceOf(Float64Array);
    expect(table.size(0)).toBe(1);
    expect(table.tagAt(0, 0)).toBe(0x00100010);
  });

  it("counts positions in 32 bits otherwise, and keeps the first source it is given", () => {
    const table = new CompactTable(false);
    const source = Buffer.alloc(64);
    table.begin(source);
    table.begin(Buffer.alloc(8));
    expect(table.rows).toBeInstanceOf(Uint32Array);
    expect(table.source).toBe(source);
    expect(table.deltaOf(source.subarray(16))).toBe(16);
  });
});

describe("character sets kept by identity", () => {
  it("gives a root element after an Item the root's own term list back", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: text("ISO_IR 100") },
          {
            tag: "00081032",
            items: [
              {
                elements: [
                  { tag: "00080005", vr: "CS", value: text("ISO_IR 192") },
                  { tag: "00080104", vr: "LO", value: text("SYNTHETIC") },
                ],
              },
            ],
          },
          { tag: "00100010", vr: "PN", value: text("SYNTHETIC^PATIENT") },
        ],
      }),
    );
    const root = ds.get("00100010")?.specificCharacterSet;
    const inner = ds.get("00081032")?.items?.[0]?.get("00080104")?.specificCharacterSet;
    expect(root).toEqual(["ISO_IR 100"]);
    expect(inner).toEqual(["ISO_IR 192"]);
  });
});

describe("the File Meta reader", () => {
  it("refuses a long-form header cut off in its reserved bytes", () => {
    // Preamble and DICM, then a File Meta group with no group length whose first element,
    // (0002,0001) OB, stops after its tag, its VR and one of its two reserved bytes.
    const cut = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "latin1"),
      Buffer.from([0x02, 0x00, 0x01, 0x00]),
      Buffer.from("OB", "latin1"),
      Buffer.from([0x00]),
    ]);
    expect(() => parseDicom(cut)).toThrow(DicomParseError);
    try {
      parseDicom(cut);
    } catch (err) {
      expect((err as DicomParseError).code).toBe("INVALID_FILE_META");
    }
  });
});

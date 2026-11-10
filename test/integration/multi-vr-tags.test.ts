/**
 * Tags whose PS3.6 registry row lists more than one VR ("US or SS", "OB or OW", "US or SS or OW").
 * An element may carry any VR its row lists: PS3.5 says native Pixel Data in Explicit VR Little
 * Endian "shall have the Value Representation OB or OW". So in Explicit VR an element written with
 * the second or third listed VR agrees with the dictionary: it raises no `DICOM_VR_MISMATCH`, and
 * the strict preset, which escalates that code, parses it. A VR the row does not list still
 * mismatches, on both Explicit VR transfer syntaxes. All values are synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { DicomParseError, parseDicom, profiles, WARNING_CODES } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

const SYNTAXES = [
  ["Explicit VR Little Endian", TS_EXPLICIT_LE],
  ["Explicit VR Big Endian", TS_EXPLICIT_BE],
] as const;

interface Case {
  readonly name: string;
  readonly tag: Tag;
  readonly vr: VR;
  readonly value: Buffer;
}

/** Every listed VR of a few multi-VR rows, first VR and the others alike. */
const LISTED: readonly Case[] = [
  { name: "Pixel Data (7FE0,0010)", tag: "7FE00010", vr: "OB", value: Buffer.alloc(8, 0x11) },
  { name: "Pixel Data (7FE0,0010)", tag: "7FE00010", vr: "OW", value: Buffer.alloc(8, 0x11) },
  { name: "Smallest Image Pixel Value (0028,0106)", tag: "00280106", vr: "US", value: u16(7) },
  { name: "Smallest Image Pixel Value (0028,0106)", tag: "00280106", vr: "SS", value: u16(7) },
  {
    name: "Red Palette Color Lookup Table Descriptor (0028,1101)",
    tag: "00281101",
    vr: "US",
    value: u16(256, 0, 16),
  },
  {
    name: "Red Palette Color Lookup Table Descriptor (0028,1101)",
    tag: "00281101",
    vr: "SS",
    value: u16(256, 0, 16),
  },
  { name: "LUT Data (0028,3006)", tag: "00283006", vr: "US", value: u16(1, 2) },
  { name: "LUT Data (0028,3006)", tag: "00283006", vr: "OW", value: u16(1, 2) },
  { name: "Gray Lookup Table Data (0028,1200)", tag: "00281200", vr: "US", value: u16(3) },
  { name: "Gray Lookup Table Data (0028,1200)", tag: "00281200", vr: "SS", value: u16(3) },
  { name: "Gray Lookup Table Data (0028,1200)", tag: "00281200", vr: "OW", value: u16(3) },
  { name: "Air Counts (0014,3070)", tag: "00143070", vr: "OW", value: u16(4, 5) },
];

/** A VR the same rows do not list. */
const UNLISTED: readonly Case[] = [
  { name: "Pixel Data (7FE0,0010)", tag: "7FE00010", vr: "OF", value: Buffer.alloc(8, 0x11) },
  { name: "Smallest Image Pixel Value (0028,0106)", tag: "00280106", vr: "UL", value: u32(7) },
  { name: "LUT Data (0028,3006)", tag: "00283006", vr: "SS", value: u16(1, 2) },
];

function u16(...values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => buf.writeUInt16LE(v, i * 2));
  return buf;
}

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

function build(transferSyntax: string, c: Case): Buffer {
  return buildDicom({ transferSyntax, elements: [{ tag: c.tag, vr: c.vr, value: c.value }] });
}

function mismatches(buf: Buffer): number {
  return parseDicom(buf).warnings.filter((w) => w.code === WARNING_CODES.DICOM_VR_MISMATCH).length;
}

describe.each(SYNTAXES)("multi-VR dictionary rows under %s", (_label, ts) => {
  it.each(LISTED)("$name written as $vr raises no VR mismatch", (c) => {
    expect(mismatches(build(ts, c))).toBe(0);
  });

  it.each(LISTED)("$name written as $vr parses under the strict preset", (c) => {
    const ds = parseDicom(build(ts, c), { profile: profiles.strict });
    expect(ds.get(c.tag)?.vr).toBe(c.vr);
  });

  it.each(UNLISTED)("$name written as $vr still raises a VR mismatch", (c) => {
    expect(mismatches(build(ts, c))).toBe(1);
  });

  it.each(UNLISTED)("$name written as $vr still throws under the strict preset", (c) => {
    try {
      parseDicom(build(ts, c), { profile: profiles.strict });
      expect.unreachable("strict should have escalated DICOM_VR_MISMATCH");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      expect((err as DicomParseError).code).toBe(WARNING_CODES.DICOM_VR_MISMATCH);
    }
  });
});

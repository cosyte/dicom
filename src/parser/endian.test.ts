import { describe, it, expect } from "vitest";

import { LONG_FORM_VRS } from "./element-header.js";
import { BE_VR_STRIDE } from "./endian.js";

describe("BE_VR_STRIDE (D-23, D-24)", () => {
  it("OB and UN are byte streams — never swapped (D-24)", () => {
    expect(BE_VR_STRIDE.OB).toBe(0);
    expect(BE_VR_STRIDE.UN).toBe(0);
  });

  it("AT uses stride=2 (group then element — NEVER one 4-byte swap)", () => {
    expect(BE_VR_STRIDE.AT).toBe(2);
  });

  it("OW uses stride=2 (16-bit pixel words)", () => {
    expect(BE_VR_STRIDE.OW).toBe(2);
  });

  it("US/SS use stride=2 (16-bit integers)", () => {
    expect(BE_VR_STRIDE.US).toBe(2);
    expect(BE_VR_STRIDE.SS).toBe(2);
  });

  it("UL/SL/FL/OF/OL use stride=4 (32-bit numerics)", () => {
    expect(BE_VR_STRIDE.UL).toBe(4);
    expect(BE_VR_STRIDE.SL).toBe(4);
    expect(BE_VR_STRIDE.FL).toBe(4);
    expect(BE_VR_STRIDE.OF).toBe(4);
    expect(BE_VR_STRIDE.OL).toBe(4);
  });

  it("FD/OD use stride=8 (64-bit floats)", () => {
    expect(BE_VR_STRIDE.FD).toBe(8);
    expect(BE_VR_STRIDE.OD).toBe(8);
  });

  it("OV/SV/UV use stride=8 (DICOM 2018 64-bit additions)", () => {
    expect(BE_VR_STRIDE.OV).toBe(8);
    expect(BE_VR_STRIDE.SV).toBe(8);
    expect(BE_VR_STRIDE.UV).toBe(8);
  });

  it("ASCII/text VRs use stride=0 (no swap)", () => {
    for (const vr of [
      "AE",
      "AS",
      "CS",
      "DA",
      "DS",
      "DT",
      "IS",
      "LO",
      "LT",
      "PN",
      "SH",
      "ST",
      "TM",
      "UC",
      "UI",
      "UR",
      "UT",
    ] as const) {
      expect(BE_VR_STRIDE[vr]).toBe(0);
    }
  });

  it("SQ uses stride=0 (sequences are recursively descended, not byte-swapped)", () => {
    expect(BE_VR_STRIDE.SQ).toBe(0);
  });

  it("table is frozen (Object.freeze applied per D-23)", () => {
    expect(Object.isFrozen(BE_VR_STRIDE)).toBe(true);
  });

  it("covers all 34 VRs from VR union (31 standard non-numeric + OV/SV/UV 64-bit additions)", () => {
    // The VR union in src/dictionary/types.ts has 34 entries:
    // AE AS AT CS DA DS DT FL FD IS LO LT OB OD OF OL OV OW PN SH SL SQ SS ST
    // SV TM UC UI UL UN UR US UT UV.
    expect(Object.keys(BE_VR_STRIDE)).toHaveLength(34);
  });
});

describe("LONG_FORM_VRS (D-22)", () => {
  it("contains exactly the 13 long-form VRs (incl. OV/SV/UV per CP-2199)", () => {
    expect(LONG_FORM_VRS.size).toBe(13);
    for (const vr of [
      "OB",
      "OW",
      "OF",
      "OD",
      "OL",
      "OV",
      "SQ",
      "UT",
      "UN",
      "UC",
      "UR",
      "SV",
      "UV",
    ] as const) {
      expect(LONG_FORM_VRS.has(vr)).toBe(true);
    }
  });

  it("does NOT contain short-form VRs", () => {
    for (const vr of ["PN", "LO", "AE", "US", "FL", "FD", "AT"] as const) {
      expect(LONG_FORM_VRS.has(vr)).toBe(false);
    }
  });
});

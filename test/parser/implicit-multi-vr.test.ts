/**
 * The VR Implicit VR Little Endian gives an attribute whose PS3.6 registry row lists more than one.
 *
 * Implicit VR carries no VR on the wire, and the reader used to take the first VR the row lists.
 * For "OB or OW" that is OB, which PS3.5 section A.1 rules out for Pixel Data, Overlay Data and
 * Waveform Data, and section 8.1.2 says plainly: "the VR of OB may not be used for Overlay Data
 * when using the Default Transfer Syntax". The bytes read are the same either way, but a writer
 * that takes the VR to an Explicit VR or Big Endian file swaps OW and leaves OB alone, so 16-bit
 * data read as OB comes out byte-reversed. Every file here is synthetic and carries no identity.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import type { Dataset } from "../../src/dataset/dataset.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { parseDicom } from "../../src/parser/index.js";
import {
  type BuildDicomElement,
  type BuildDicomSqElement,
  buildDicom,
} from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";

function u16(...values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => buf.writeUInt16LE(v & 0xffff, i * 2));
  return buf;
}

function el(tag: Tag, value: Buffer): BuildDicomElement {
  // The VR is not written under Implicit VR; the builder only needs one.
  return { tag, vr: "UN", value };
}

function seq(tag: Tag, ...items: (BuildDicomElement | BuildDicomSqElement)[][]): BuildDicomSqElement {
  return { tag, items: items.map((elements) => ({ elements })) };
}

function implicit(...elements: (BuildDicomElement | BuildDicomSqElement)[]): Dataset {
  return parseDicom(buildDicom({ transferSyntax: TS_IMPLICIT_LE, elements }));
}

function vrOf(ds: Dataset, tag: Tag): VR | undefined {
  return ds.get(tag)?.vr;
}

describe("Implicit VR LE: OB or OW attributes PS3.5 makes OW", () => {
  it.each([8, 16])("reads Pixel Data (7FE0,0010) as OW at %i bits allocated", (bits) => {
    const ds = implicit(
      el("00280100", u16(bits)),
      el("7FE00010", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])),
    );
    expect(vrOf(ds, "7FE00010")).toBe("OW");
  });

  it("reads Pixel Data inside an Icon Image Sequence (0088,0200) Item as OW", () => {
    const ds = implicit(
      seq("00880200", [el("00280100", u16(8)), el("7FE00010", Buffer.from([9, 8, 7, 6]))]),
    );
    const item = ds.get("00880200")?.items?.[0];
    expect(item?.get("7FE00010")?.vr).toBe("OW");
  });

  it.each(["60003000", "60023000", "601E3000"] as const)(
    "reads Overlay Data (%s) as OW",
    (tag) => {
      const group = tag.slice(0, 4);
      const ds = implicit(
        el(`${group}0100`, u16(1)),
        el(tag, Buffer.from([0xff, 0x00, 0x0f, 0xf0])),
      );
      expect(vrOf(ds, tag)).toBe("OW");
    },
  );

  it.each([8, 16])(
    "reads Waveform Data and the attributes PS3.5 section 8.3 ties to it as OW at %i bits",
    (bits) => {
      const ds = implicit(
        seq("54000100", [
          seq("003A0200", [el("54000110", u16(1)), el("54000112", u16(2))]),
          el("54001004", u16(bits)),
          el("5400100A", u16(3)),
          el("54001010", u16(4, 5, 6, 7)),
        ]),
      );
      const waveform = ds.get("54000100")?.items?.[0];
      const channel = waveform?.get("003A0200")?.items?.[0];
      expect(waveform?.get("54001010")?.vr).toBe("OW");
      expect(waveform?.get("5400100A")?.vr).toBe("OW");
      expect(channel?.get("54000110")?.vr).toBe("OW");
      expect(channel?.get("54000112")?.vr).toBe("OW");
    },
  );

  it.each(["00143050", "00143070"] as const)(
    "reads %s, OB or OW with no rule in PS3.5, as OW, the VR a byte swap cannot corrupt",
    (tag) => {
      expect(vrOf(implicit(el(tag, u16(1, 2))), tag)).toBe("OW");
    },
  );

  it("keeps the Palette Color Lookup Table Data OW, as PS3.6 lists it", () => {
    expect(vrOf(implicit(el("00281201", u16(1, 2))), "00281201")).toBe("OW");
  });

  it("leaves the retired Curve Data (50xx,3000) at the first VR its row lists", () => {
    expect(vrOf(implicit(el("50003000", u16(1, 2))), "50003000")).toBe("OB");
  });
});

describe("Implicit VR LE: US or OW lookup table data", () => {
  it.each(["00283006", "00281200"] as const)(
    "reads %s as US while its value fits the 16-bit length of an Explicit VR US",
    (tag) => {
      const ds = implicit(seq("00283000", [el(tag, Buffer.alloc(65534, 1))]));
      expect(ds.get("00283000")?.items?.[0]?.get(tag)?.vr).toBe("US");
    },
  );

  it.each(["00283006", "00281200"] as const)(
    "reads %s as OW when its value is longer than an Explicit VR US can carry",
    (tag) => {
      const ds = implicit(seq("00283000", [el(tag, Buffer.alloc(65536, 1))]));
      expect(ds.get("00283000")?.items?.[0]?.get(tag)?.vr).toBe("OW");
    },
  );
});

describe("Implicit VR LE: US or SS attributes follow Pixel Representation (0028,0103)", () => {
  it("reads Smallest Image Pixel Value as SS when Pixel Representation is 1", () => {
    const ds = implicit(el("00280103", u16(1)), el("00280106", u16(-5)), el("00280107", u16(900)));
    expect(vrOf(ds, "00280106")).toBe("SS");
    expect(ds.get("00280106")?.value).toMatchObject({ kind: "numbers", values: [-5] });
    expect(vrOf(ds, "00280107")).toBe("SS");
  });

  it("reads Pixel Padding Value as US when Pixel Representation is 0", () => {
    const ds = implicit(el("00280103", u16(0)), el("00280120", u16(65535)));
    expect(vrOf(ds, "00280120")).toBe("US");
  });

  it("reads it as US when no Pixel Representation precedes it", () => {
    expect(vrOf(implicit(el("00280106", u16(7))), "00280106")).toBe("US");
  });

  it("gives an Item the Pixel Representation of the Data Set that encloses it", () => {
    const ds = implicit(
      el("00280103", u16(1)),
      seq("00409096", [el("00409211", u16(-1)), el("00409216", u16(-100))]),
    );
    const item = ds.get("00409096")?.items?.[0];
    expect(item?.get("00409211")?.vr).toBe("SS");
    expect(item?.get("00409216")?.vr).toBe("SS");
  });

  it("keeps an Item's own Pixel Representation inside that Item", () => {
    const ds = implicit(
      el("00280103", u16(0)),
      seq(
        "00283000",
        [el("00280103", u16(1)), el("00280106", u16(-2))],
        [el("00280106", u16(65534))],
      ),
      seq("00409096", [el("00409216", u16(65000))]),
    );
    const items = ds.get("00283000")?.items;
    expect(items?.[0]?.get("00280106")?.vr).toBe("SS");
    expect(items?.[1]?.get("00280106")?.vr).toBe("US");
    expect(ds.get("00409096")?.items?.[0]?.get("00409216")?.vr).toBe("US");
  });

  it.each(["00281101", "00283002"] as const)(
    "keeps the descriptor %s US, since its first and third values are always unsigned",
    (tag) => {
      const ds = implicit(el("00280103", u16(1)), el(tag, u16(0, 0, 16)));
      expect(vrOf(ds, tag)).toBe("US");
    },
  );
});

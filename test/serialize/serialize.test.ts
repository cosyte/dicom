/**
 * Phase 5 serializer unit + round-trip tests.
 *
 * Everything is **synthetic** — fixtures are built in memory by the
 * `build-dicom` helper (D-38: the repo ships zero curated `.dcm` files). No
 * real PHI ever touches this suite.
 *
 * The central invariant is `parse → serialize → parse` structural fidelity
 * plus serializer idempotency (a second serialize is byte-identical), proved
 * across all four v1 transfer syntaxes including the Explicit-BE byte-swap and
 * SQ / encapsulated-pixel-data passthrough that the round-trip *property*
 * generator deliberately excludes.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { Dataset, DicomSerializeError, parseDicom, serializeDicom } from "../../src/index.js";
import type { Element } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { buildDicom, type BuildDicomOptions } from "../helpers/build-dicom.js";
import { COSYTE_IMPLEMENTATION_CLASS_UID } from "../../src/serialize/file-meta.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

// -- Test-only structural accessor for Dataset._elements --------------------
interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}
function elementsOf(ds: object): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

/** A comparable projection of a parsed dataset: tag → {vr, value hex}. */
function project(ds: Dataset): Map<string, { vr: VR; hex: string }> {
  const out = new Map<string, { vr: VR; hex: string }>();
  for (const [tag, el] of elementsOf(ds)) {
    out.set(tag, { vr: el.vr, hex: el.rawBytes.toString("hex") });
  }
  return out;
}

function expectSameElements(a: Dataset, b: Dataset): void {
  const pa = project(a);
  const pb = project(b);
  expect([...pb.keys()].sort()).toEqual([...pa.keys()].sort());
  for (const [tag, va] of pa) {
    const vb = pb.get(tag);
    expect(vb, `element ${tag} present after round-trip`).toBeDefined();
    expect(vb?.vr, `element ${tag} VR`).toBe(va.vr);
    expect(vb?.hex, `element ${tag} value bytes`).toBe(va.hex);
  }
}

/**
 * Parse a built fixture, serialize, re-parse, and assert structural fidelity
 * plus byte-stable idempotency. Returns the re-parsed dataset + serialized
 * bytes for further per-test assertions.
 */
function roundTrip(buf: Buffer): { out: Buffer; ds1: Dataset; ds2: Dataset } {
  const ds1 = parseDicom(buf);
  const out = serializeDicom(ds1);
  const ds2 = parseDicom(out);
  expectSameElements(ds1, ds2);
  // Idempotency: serializing the re-parsed dataset reproduces the bytes.
  expect(serializeDicom(ds2).equals(out)).toBe(true);
  return { out, ds1, ds2 };
}

describe("serializeDicom — framing", () => {
  it("emits a 128-byte zero preamble + DICM magic", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100020", vr: "LO", value: Buffer.from("ID01", "ascii") }],
    });
    const out = serializeDicom(parseDicom(buf));
    expect(out.subarray(0, 128).equals(Buffer.alloc(128, 0x00))).toBe(true);
    expect(out.subarray(128, 132).toString("ascii")).toBe("DICM");
  });

  it("computes a correct (0002,0000) File Meta group length", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.7",
      mediaStorageSOPInstanceUID: "1.2.3.4.5",
      elements: [{ tag: "00100020", vr: "LO", value: Buffer.from("ID01", "ascii") }],
    });
    const out = serializeDicom(parseDicom(buf));
    // (0002,0000) is the first element after DICM: 8-byte header (UL short form)
    // then a 4-byte value = the declared group length.
    const declared = out.readUInt32LE(132 + 8);
    // The File Meta body is everything from just after (0002,0000) up to the
    // dataset; re-parse confirms no group-length mismatch warning fires.
    const ds = parseDicom(out);
    const mismatch = ds.warnings.find((w) => w.code === "DICOM_FILE_META_GROUP_LENGTH_MISMATCH");
    expect(mismatch).toBeUndefined();
    expect(declared).toBeGreaterThan(0);
  });
});

describe("serializeDicom — even-length padding (PS3.5 §6.2)", () => {
  it("pads an odd-length text value with SPACE (0x20)", () => {
    // Explicit-LE carries the declared odd length on-wire (parser keeps it).
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100020", vr: "LO", value: Buffer.from("ODD", "ascii") }],
    });
    const ds1 = parseDicom(buf);
    expect(elementsOf(ds1).get("00100020")?.rawBytes.length).toBe(3);
    const ds2 = parseDicom(serializeDicom(ds1));
    const el = ds2.get("00100020");
    expect(el?.rawBytes.length).toBe(4);
    expect(el?.rawBytes[3]).toBe(0x20);
  });

  it("pads an odd-length UI value with NULL (0x00)", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00080018", vr: "UI", value: Buffer.from("1.2.3", "ascii") }],
    });
    const ds2 = parseDicom(serializeDicom(parseDicom(buf)));
    const el = ds2.get("00080018");
    expect(el?.rawBytes.length).toBe(6);
    expect(el?.rawBytes[5]).toBe(0x00);
  });
});

describe("serializeDicom — short/long-form headers (PS3.5 §7.1.2)", () => {
  it.each<[string, VR]>([
    ["SV", "SV"],
    ["UV", "UV"],
  ])("encodes %s as a long-form header (reserved + 4-byte length)", (_name, vr) => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      // Private data tag → no VR-mismatch check against the standard dictionary.
      elements: [{ tag: "70011001", vr, value: Buffer.alloc(8, 0x01) }],
    });
    const out = serializeDicom(parseDicom(buf));
    const vrIdx = out.lastIndexOf(Buffer.from(vr, "ascii"));
    expect(vrIdx).toBeGreaterThan(132);
    // 2 reserved bytes must be zero, then a 4-byte little-endian length = 8.
    expect(out[vrIdx + 2]).toBe(0x00);
    expect(out[vrIdx + 3]).toBe(0x00);
    expect(out.readUInt32LE(vrIdx + 4)).toBe(8);
    // And it round-trips cleanly.
    roundTrip(buf);
  });

  it("encodes a short-form VR (US) with a 2-byte length", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00280010", vr: "US", value: Buffer.from([0x00, 0x02]) }],
    });
    const out = serializeDicom(parseDicom(buf));
    const vrIdx = out.lastIndexOf(Buffer.from("US", "ascii"));
    expect(out.readUInt16LE(vrIdx + 2)).toBe(2);
    roundTrip(buf);
  });
});

describe("serializeDicom — retired group-length omission (PS3.5 §7.2)", () => {
  it("drops a (gggg,0000) dataset group-length element on write", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00080000", vr: "UL", value: Buffer.from([0x04, 0x00, 0x00, 0x00]) },
        { tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") },
      ],
    });
    const ds1 = parseDicom(buf);
    expect(elementsOf(ds1).has("00080000")).toBe(true);
    const ds2 = parseDicom(serializeDicom(ds1));
    expect(ds2.has("00080000")).toBe(false);
    expect(ds2.has("00080060")).toBe(true);
  });
});

describe("serializeDicom — full-span passthrough (SQ / encapsulated PD)", () => {
  it("blits an SQ element byte-for-byte", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "0040A730",
          items: [
            { elements: [{ tag: "00080100", vr: "SH", value: Buffer.from("CODE", "ascii") }] },
          ],
        },
      ],
    });
    const { ds1, ds2 } = roundTrip(buf);
    const before = elementsOf(ds1).get("0040A730")?.rawBytes;
    const after = ds2.get("0040A730")?.rawBytes;
    expect(before).toBeDefined();
    expect(after?.equals(before as Buffer)).toBe(true);
  });

  it("passes encapsulated pixel-data fragments through byte-for-byte", () => {
    const bot = Buffer.alloc(0); // empty Basic Offset Table
    const frag = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag: "7FE00010",
          encapsulatedPixelData: true,
          items: [],
          encapsulatedFragments: [bot, frag],
        },
      ],
    });
    const { ds1, ds2 } = roundTrip(buf);
    const before = elementsOf(ds1).get("7FE00010")?.rawBytes;
    const after = ds2.get("7FE00010")?.rawBytes;
    expect(after?.equals(before as Buffer)).toBe(true);
    // The deadbeef fragment survives intact in the serialized output.
    expect((after as Buffer).includes(frag)).toBe(true);
  });
});

describe("serializeDicom — all four v1 transfer syntaxes round-trip", () => {
  const richElements: BuildDicomOptions["elements"] = [
    { tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") },
    { tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") },
    { tag: "00280010", vr: "US", value: Buffer.from([0x00, 0x02]) },
    {
      tag: "0040A730",
      items: [{ elements: [{ tag: "00080100", vr: "SH", value: Buffer.from("CODE", "ascii") }] }],
    },
  ];

  it.each([TS_IMPLICIT_LE, TS_EXPLICIT_LE, TS_EXPLICIT_BE, TS_DEFLATED_LE])(
    "round-trips under %s",
    (ts) => {
      const buf = buildDicom({ transferSyntax: ts, elements: richElements });
      const { out } = roundTrip(buf);
      // The serialized output declares the same transfer syntax.
      expect(parseDicom(out).fileMeta?.transferSyntaxUID).toBe(ts);
    },
  );

  it("produces a deflated body that re-inflates to the same dataset", () => {
    const buf = buildDicom({ transferSyntax: TS_DEFLATED_LE, elements: richElements });
    const out = serializeDicom(parseDicom(buf));
    // The deflated dataset body is not the raw element bytes — re-parse proves
    // it inflated correctly rather than being passed through uncompressed.
    const ds = parseDicom(out);
    expect(ds.get("00100010")?.rawBytes.toString("ascii")).toBe("DOE^JANE");
  });
});

describe("serializeDicom — Implicit-LE defined-length SQ reconstruction", () => {
  it("rebuilds the header for a value-only defined-length SQ (no full-span blit)", () => {
    // Under Implicit VR LE the parser stores a *defined-length* SQ as a
    // value-only slice (only undefined-length SQ keeps a full span), so the
    // writer must reconstruct the group+element+length header — a verbatim
    // blit would drop it and the re-parse would hit the SQ item bytes as the
    // dataset root, throwing INVALID_FILE_META. See element.ts isFullSpanElement.
    const buf = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        {
          tag: "0040A730",
          items: [
            { elements: [{ tag: "00080100", vr: "SH", value: Buffer.from("CODE", "ascii") }] },
          ],
        },
      ],
    });
    // roundTrip would throw on re-parse if the header had been dropped.
    const { ds1, ds2 } = roundTrip(buf);
    const before = elementsOf(ds1).get("0040A730")?.rawBytes;
    const sq = ds2.get("0040A730");
    expect(sq?.vr).toBe("SQ");
    expect(before).toBeDefined();
    expect(sq?.rawBytes.equals(before as Buffer)).toBe(true);
    // The nested item's coded value survives inside the preserved SQ value.
    expect(sq?.rawBytes.includes(Buffer.from("CODE", "ascii"))).toBe(true);
  });
});

describe("serializeDicom — NULL-padded byte VRs (PS3.5 §6.2)", () => {
  it("pads an odd-length UN scalar with NULL (0x00)", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "70011002", vr: "UN", value: Buffer.from([0x01, 0x02, 0x03]) }],
    });
    const el = parseDicom(serializeDicom(parseDicom(buf))).get("70011002");
    expect(el?.rawBytes.length).toBe(4);
    expect(el?.rawBytes[3]).toBe(0x00);
  });

  it("pads an odd-length OB scalar with NULL (0x00)", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "70011003", vr: "OB", value: Buffer.from([0x0a, 0x0b, 0x0c]) }],
    });
    const el = parseDicom(serializeDicom(parseDicom(buf))).get("70011003");
    expect(el?.rawBytes.length).toBe(4);
    expect(el?.rawBytes[3]).toBe(0x00);
  });
});

describe("serializeDicom — Explicit BE long-form length byte order", () => {
  it("writes the 4-byte length big-endian for a long-form VR under Explicit VR BE", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "70011001", vr: "OB", value: Buffer.alloc(8, 0x01) }],
    });
    const out = serializeDicom(parseDicom(buf));
    const vrIdx = out.lastIndexOf(Buffer.from("OB", "ascii"));
    expect(vrIdx).toBeGreaterThan(132);
    expect(out[vrIdx + 2]).toBe(0x00); // reserved
    expect(out[vrIdx + 3]).toBe(0x00);
    expect(out.readUInt32BE(vrIdx + 4)).toBe(8); // big-endian length
    roundTrip(buf);
  });
});

describe("serializeDicom — File Meta default injection (PS3.10 §7.1)", () => {
  it("injects the cosyte Implementation Class UID and default version when absent", () => {
    // The fixture carries only (0002,0010) TS UID — no version, no impl class.
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") }],
    });
    const ds1 = parseDicom(buf);
    expect(ds1.fileMeta?.implementationClassUID).toBeUndefined();
    const fm = parseDicom(serializeDicom(ds1)).fileMeta;
    expect(fm?.implementationClassUID).toBe(COSYTE_IMPLEMENTATION_CLASS_UID);
    expect(fm?.fileMetaInformationVersion?.equals(Buffer.from([0x00, 0x01]))).toBe(true);
  });
});

describe("serializeDicom — immutability", () => {
  it("does not mutate the source dataset's element bytes", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100020", vr: "LO", value: Buffer.from("ODD", "ascii") }],
    });
    const ds = parseDicom(buf);
    const snapshot = Buffer.from(elementsOf(ds).get("00100020")?.rawBytes as Buffer);
    serializeDicom(ds);
    expect(elementsOf(ds).get("00100020")?.rawBytes.equals(snapshot)).toBe(true);
  });
});

describe("serializeDicom — error taxonomy", () => {
  it("throws MISSING_TRANSFER_SYNTAX when the dataset has no File Meta", () => {
    const ds = new Dataset({ warnings: [], elements: new Map() });
    expect(() => serializeDicom(ds)).toThrow(DicomSerializeError);
    try {
      serializeDicom(ds);
    } catch (err) {
      expect((err as DicomSerializeError).code).toBe("MISSING_TRANSFER_SYNTAX");
    }
  });

  it("throws UNSUPPORTED_TRANSFER_SYNTAX for a non-v1 transfer syntax", () => {
    const ds = new Dataset({
      fileMeta: { transferSyntaxUID: "1.2.840.10008.1.2.4.50" },
      warnings: [],
      elements: new Map(),
    });
    expect(() => serializeDicom(ds)).toThrow(/UNSUPPORTED_TRANSFER_SYNTAX/);
  });
});

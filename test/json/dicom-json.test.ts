/**
 * `toDicomJson` and `fromDicomJson`: the DICOM JSON Model of PS3.18 Annex F.
 *
 * Three things are held here. Each VR's JSON form, read off a synthetic object. The round trip
 * Part 10 to JSON to Part 10, byte for byte, on synthetic objects under every uncompressed
 * Transfer Syntax and both ways of delimiting a Sequence, and on every seed of the fuzz corpus:
 * each seed either comes back byte-identical, comes back with only what the JSON Model does not
 * record changed (named per seed below), or is refused with a coded error. And the refusals: what
 * the model cannot carry, or what we have not confirmed it carries, throws a `DicomJsonError`
 * whose message holds no value.
 *
 * Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DICOM_JSON_ERROR_CODES,
  DicomJsonError,
  DicomSerializeError,
  fromDicomJson,
  parseDicom,
  serializeDicom,
  toDicomJson,
  type DicomJsonDataset,
  type FileMeta,
} from "../../src/index.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";
import { SEED_CORPUS } from "../property/_seed-corpus.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";
const TS_JPEG_2000 = "1.2.840.10008.1.2.4.90";
const SYNTAXES = [TS_IMPLICIT_LE, TS_EXPLICIT_LE, TS_EXPLICIT_BE, TS_DEFLATED_LE] as const;

const ROOT = "1.2.826.0.1.3680043.8.498";

type AnyElement = BuildDicomElement | BuildDicomSqElement;

function text(s: string, encoding: BufferEncoding = "latin1"): Buffer {
  const b = Buffer.from(s, encoding);
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

function uid(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x00])]);
}

function u16(...values: number[]): Buffer {
  const b = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => b.writeUInt16LE(v, i * 2));
  return b;
}

function s16(...values: number[]): Buffer {
  const b = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => b.writeInt16LE(v, i * 2));
  return b;
}

function u32(...values: number[]): Buffer {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeUInt32LE(v, i * 4));
  return b;
}

function s32(...values: number[]): Buffer {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeInt32LE(v, i * 4));
  return b;
}

function f32(...values: number[]): Buffer {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeFloatLE(v, i * 4));
  return b;
}

function f64(...values: number[]): Buffer {
  const b = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => b.writeDoubleLE(v, i * 8));
  return b;
}

function tags(...ts: string[]): Buffer {
  return Buffer.concat(ts.map((t) => u16(parseInt(t.slice(0, 4), 16), parseInt(t.slice(4), 16))));
}

function codeItem(value: string, undefinedLength: boolean): BuildDicomSqElement["items"][number] {
  return {
    undefinedLength,
    elements: [
      { tag: "00080100", vr: "SH", value: text(value) },
      { tag: "00080102", vr: "SH", value: text("99SYNTH") },
      { tag: "00080104", vr: "LO", value: text("Synthetic concept") },
    ],
  };
}

/**
 * A synthetic object with a value of every VR the JSON Model carries as metadata, a private block,
 * and Sequences nested three deep, each Sequence and Item delimited as `undefinedLength` says.
 * `swapped` adds the binary VRs Explicit VR Big Endian swaps (`OW`, `OF`, `OD`, `OL`), which
 * we refuse under Big Endian.
 */
function syntheticObject(undefinedLength: boolean, swapped: boolean): AnyElement[] {
  const elements: AnyElement[] = [
    { tag: "00080005", vr: "CS", value: text("ISO_IR 100") },
    { tag: "00080008", vr: "CS", value: text("ORIGINAL\\PRIMARY\\AXIAL") },
    { tag: "00080016", vr: "UI", value: uid("1.2.840.10008.5.1.4.1.1.2") },
    { tag: "00080018", vr: "UI", value: uid(`${ROOT}.901`) },
    { tag: "00080020", vr: "DA", value: text("19000101") },
    { tag: "00080030", vr: "TM", value: text("120000.123456") },
    { tag: "0008002A", vr: "DT", value: text("19000101120000.000000+0000") },
    { tag: "00080050", vr: "SH", value: text("ACC-0001") },
    { tag: "00080054", vr: "AE", value: text("SYNTH_AE") },
    { tag: "00080060", vr: "CS", value: text("CT") },
    { tag: "00080081", vr: "ST", value: text("1 Synthetic Way") },
    { tag: "00080090", vr: "PN", value: text("TEST^PATIENT=TEST^PHONETIC") },
    { tag: "00080119", vr: "UC", value: text("SYNTH-LONG-CODE") },
    { tag: "00080120", vr: "UR", value: text("urn:synth:1") },
    { tag: "00081030", vr: "LO", value: text("SYNTH STUDY") },
    {
      tag: "00081032",
      undefinedLength,
      items: [codeItem("P-0001", undefinedLength), codeItem("P-0002", undefinedLength)],
    },
    { tag: "00089459", vr: "FL", value: f32(29.97) },
    { tag: "00090010", vr: "LO", value: text("SYNTH PRIVATE CREATOR") },
    { tag: "00091001", vr: "LO", value: text("SYNTH PRIVATE VALUE") },
    { tag: "00100010", vr: "PN", value: text("DOE^JÉRÔME") },
    { tag: "00100020", vr: "LO", value: text("MRN-42") },
    { tag: "00100030", vr: "DA", value: text("19000101") },
    { tag: "00100040", vr: "CS", value: text("O") },
    { tag: "00101010", vr: "AS", value: text("042Y") },
    { tag: "00101020", vr: "DS", value: text("1.75") },
    { tag: "00101030", vr: "DS", value: text("70.5") },
    { tag: "00104000", vr: "LT", value: text("Synthetic comment\\with a backslash") },
    { tag: "00180050", vr: "DS", value: text("1.25") },
    { tag: "00181020", vr: "LO", value: text("SYNTH 1.0\\\\SYNTH 2.0") },
    { tag: "00186020", vr: "SL", value: s32(-5, 70000) },
    { tag: "00189219", vr: "SS", value: s16(-3) },
    { tag: "0020000D", vr: "UI", value: uid(`${ROOT}.902`) },
    { tag: "0020000E", vr: "UI", value: uid(`${ROOT}.903`) },
    { tag: "00200011", vr: "IS", value: text("7") },
    { tag: "00200013", vr: "IS", value: text("-12") },
    { tag: "00200032", vr: "DS", value: text("-100.5\\-100.5\\0") },
    { tag: "00200037", vr: "DS", value: text("1\\0\\0\\0\\1\\0") },
    { tag: "00209165", vr: "AT", value: tags("00200032", "FFFE0000") },
    { tag: "00280002", vr: "US", value: u16(1) },
    { tag: "00280010", vr: "US", value: u16(4) },
    { tag: "00280011", vr: "US", value: u16(4) },
    { tag: "00280030", vr: "DS", value: text("0.5\\0.5") },
    { tag: "00280100", vr: "US", value: u16(16) },
    { tag: "00281054", vr: "LO", value: text("") },
    { tag: "00282000", vr: "OB", value: Buffer.from([0x01, 0x02, 0x03, 0x04]) },
    {
      tag: "0040A730",
      undefinedLength,
      items: [
        {
          undefinedLength,
          elements: [
            { tag: "0040A010", vr: "CS", value: text("CONTAINS") },
            {
              tag: "0040A043",
              undefinedLength,
              items: [codeItem("C-0001", undefinedLength)],
            },
            { tag: "0040A160", vr: "UT", value: text("Synthetic text value") },
            {
              tag: "0040A730",
              undefinedLength,
              items: [
                {
                  undefinedLength,
                  elements: [{ tag: "0040A010", vr: "CS", value: text("HAS PROPERTIES") }],
                },
                { undefinedLength, elements: [] },
              ],
            },
          ],
        },
      ],
    },
    { tag: "0040A168", undefinedLength, items: [] },
    { tag: "00081161", vr: "UL", value: u32(0, 4294967295) },
    { tag: "00189089", vr: "FD", value: f64(-1024, 1.5) },
  ];
  if (swapped) {
    elements.push(
      { tag: "00660040", vr: "OL", value: u32(0, 1, 2) },
      { tag: "00720081", vr: "OV", value: u32(7, 0) },
      { tag: "7FE00008", vr: "OF", value: f32(1.5, 2.5) },
      { tag: "7FE00009", vr: "OD", value: f64(3.25) },
      { tag: "7FE00010", vr: "OW", value: u16(...Array.from({ length: 16 }, (_, i) => i * 64)) },
    );
  }
  return elements.sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Part 10 to JSON text to Part 10. */
/** Every value inline, Pixel Data included, so the round trip carries every byte. */
const INLINE = { inlineBulkData: true } as const;

function roundTrip(
  bytes: Buffer,
  sequenceLength: "defined" | "undefined",
): { readonly json: DicomJsonDataset; readonly out: Buffer } {
  const ds = parseDicom(bytes);
  const json = JSON.parse(JSON.stringify(toDicomJson(ds, INLINE))) as DicomJsonDataset;
  const fileMeta = ds.fileMeta as FileMeta;
  const out = serializeDicom(fromDicomJson(json, { fileMeta, sequenceLength }));
  return { json, out };
}

function refusalOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    if (err instanceof DicomJsonError) return err.code;
    throw err;
  }
}

describe("toDicomJson: each VR's JSON form (PS3.18 Annex F)", () => {
  const json = toDicomJson(
    parseDicom(
      buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: syntheticObject(false, true) }),
    ),
    INLINE,
  );

  it("keys each attribute by its tag as eight uppercase hex digits, with its vr", () => {
    for (const [tag, attr] of Object.entries(json)) {
      expect(tag).toMatch(/^[0-9A-F]{8}$/u);
      expect(typeof attr.vr).toBe("string");
    }
  });

  it("writes text as strings with padding removed, split on backslashes, and null for an empty value", () => {
    expect(json["00080008"]).toEqual({ vr: "CS", Value: ["ORIGINAL", "PRIMARY", "AXIAL"] });
    expect(json["00080018"]).toEqual({ vr: "UI", Value: [`${ROOT}.901`] });
    expect(json["00181020"]).toEqual({ vr: "LO", Value: ["SYNTH 1.0", null, "SYNTH 2.0"] });
    expect(json["00104000"]).toEqual({ vr: "LT", Value: ["Synthetic comment\\with a backslash"] });
    expect(json["00080120"]).toEqual({ vr: "UR", Value: ["urn:synth:1"] });
  });

  it("decodes text through (0008,0005) Specific Character Set", () => {
    expect(json["00100010"]).toEqual({ vr: "PN", Value: [{ Alphabetic: "DOE^JÉRÔME" }] });
  });

  it("writes a Person Name as its component groups", () => {
    expect(json["00080090"]).toEqual({
      vr: "PN",
      Value: [{ Alphabetic: "TEST^PATIENT", Ideographic: "TEST^PHONETIC" }],
    });
  });

  it("writes DS, IS and the binary numbers as JSON numbers", () => {
    expect(json["00200032"]).toEqual({ vr: "DS", Value: [-100.5, -100.5, 0] });
    expect(json["00200013"]).toEqual({ vr: "IS", Value: [-12] });
    expect(json["00186020"]).toEqual({ vr: "SL", Value: [-5, 70000] });
    expect(json["00189219"]).toEqual({ vr: "SS", Value: [-3] });
    expect(json["00081161"]).toEqual({ vr: "UL", Value: [0, 4294967295] });
    expect(json["00189089"]).toEqual({ vr: "FD", Value: [-1024, 1.5] });
    expect(json["00089459"]).toEqual({ vr: "FL", Value: [Math.fround(29.97)] });
  });

  it("writes AT as eight hex digits, a group past 7FFF included", () => {
    expect(json["00209165"]).toEqual({ vr: "AT", Value: ["00200032", "FFFE0000"] });
  });

  it("writes binary VRs as base64 InlineBinary", () => {
    expect(json["00282000"]).toEqual({ vr: "OB", InlineBinary: "AQIDBA==" });
    expect(json["00660040"]).toEqual({ vr: "OL", InlineBinary: u32(0, 1, 2).toString("base64") });
  });

  it("writes a Sequence as an array of nested Data Sets, and an empty value with no Value", () => {
    const content = json["0040A730"];
    expect(content?.vr).toBe("SQ");
    const item = content?.Value?.[0] as DicomJsonDataset;
    expect(item["0040A010"]).toEqual({ vr: "CS", Value: ["CONTAINS"] });
    const nested = item["0040A730"]?.Value as DicomJsonDataset[];
    expect(nested).toHaveLength(2);
    expect(nested[1]).toEqual({});
    expect(json["0040A168"]).toEqual({ vr: "SQ" });
    expect(json["00281054"]).toEqual({ vr: "LO" });
  });

  it("writes a BulkDataURI where the option gives one", () => {
    const ds = parseDicom(
      buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: syntheticObject(false, true) }),
    );
    const withUri = toDicomJson(ds, {
      ...INLINE,
      bulkDataUri: (el) => (el.tag === "7FE00010" ? "https://example.com/bulk/1" : undefined),
    });
    expect(withUri["7FE00010"]).toEqual({ vr: "OW", BulkDataURI: "https://example.com/bulk/1" });
    expect(withUri["00282000"]).toEqual({ vr: "OB", InlineBinary: "AQIDBA==" });
  });
});

describe("Part 10 to JSON to Part 10 is byte-identical", () => {
  for (const ts of SYNTAXES) {
    for (const sequenceLength of ["defined", "undefined"] as const) {
      it(`under ${ts}, Sequences ${sequenceLength} length`, () => {
        const swapped = ts !== TS_EXPLICIT_BE;
        const source = buildDicom({
          transferSyntax: ts,
          elements: syntheticObject(sequenceLength === "undefined", swapped),
        });
        const written = serializeDicom(parseDicom(source));
        const { json, out } = roundTrip(source, sequenceLength);
        expect(Object.keys(json).length).toBeGreaterThan(40);
        expect(out.equals(written)).toBe(true);
      });
    }
  }

  it("takes a BulkDataURI back through resolveBulkData", () => {
    const source = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: syntheticObject(false, true),
    });
    const ds = parseDicom(source);
    const store = new Map<string, Buffer>();
    const json = toDicomJson(ds, {
      bulkDataUri: (el) => {
        const uri = `https://example.com/bulk/${el.tag}`;
        store.set(uri, Buffer.from(el.rawBytes));
        return uri;
      },
    });
    const back = fromDicomJson(json, {
      fileMeta: ds.fileMeta as FileMeta,
      resolveBulkData: (uri) => store.get(uri),
    });
    expect(serializeDicom(back).equals(serializeDicom(ds))).toBe(true);
    expect(refusalOf(() => fromDicomJson(json, { fileMeta: ds.fileMeta as FileMeta }))).toBe(
      DICOM_JSON_ERROR_CODES.BULK_DATA_UNRESOLVED,
    );
  });
});

/**
 * What each seed of the fuzz corpus does on the round trip. `identical`: the bytes `serializeDicom`
 * writes for the seed come back exactly, under one of the two `sequenceLength` choices.
 * `same-json`: the bytes differ, but only in what the JSON Model does not record, and reading them
 * back gives the same JSON. A refusal names its code.
 */
const SEED_OUTCOMES: Readonly<Record<string, string>> = {
  // A UV and an SV with values: refused until their JSON form is confirmed. The same content
  // without them is held byte-identical above.
  "rich-implicit-le": "refused:UNSUPPORTED_VR",
  "rich-explicit-le": "refused:UNSUPPORTED_VR",
  "rich-explicit-be": "refused:UNSUPPORTED_VR",
  "rich-deflated-le": "refused:UNSUPPORTED_VR",
  "first-use-ct": "identical",
  "first-use-ct-no-preamble": "identical",
  "charset-utf8": "identical",
  "charset-latin1": "identical",
  // ISO 2022 and GB18030 text is decoded, but fromDicomJson does not encode it.
  "charset-iso2022-jp": "refused:UNSUPPORTED_CHARACTER_SET",
  "charset-iso2022-kr": "refused:UNSUPPORTED_CHARACTER_SET",
  "charset-gb18030": "refused:UNSUPPORTED_CHARACTER_SET",
  // DS "1.0" comes back as "1", and Sequences mix defined and undefined lengths.
  "enhanced-multiframe": "same-json",
  // The Directory Record offsets name bytes of the source file the JSON Model does not carry.
  "dicomdir-explicit-le": "refused:serialize:DIRECTORY_OFFSET_UNRESOLVED",
  "dicomdir-implicit-le": "refused:serialize:DIRECTORY_OFFSET_UNRESOLVED",
  "encapsulated-jpeg-2000": "refused:UNSUPPORTED_ELEMENT",
  "encapsulated-rle": "refused:UNSUPPORTED_ELEMENT",
  // serializeDicom does not write the JPIP Referenced syntaxes, so there is nothing to compare.
  "jpip-referenced": "not-written",
  "jpip-referenced-deflate": "not-written",
  // The UN read as a Sequence comes back as an SQ.
  "cp246-un-sequence": "same-json",
  "private-ge-implicit-le": "identical",
  "private-siemens-explicit-le": "identical",
  // A private Sequence under Implicit VR, written with defined lengths, reads back as UN: nothing
  // on the wire names it a Sequence, so the changed VR is refused.
  "private-sequence-implicit-le": "refused:VR_MISMATCH",
  // Each mixes an undefined-length Sequence with defined-length Items, or the reverse.
  "nested-explicit-le": "same-json",
  "nested-implicit-le": "same-json",
  "file-meta-extras": "identical",
  "group-length-wrong": "identical",
  "group-length-omitted": "identical",
  "odd-length-and-retired-group-length": "identical",
  "nonzero-reserved-bytes": "identical",
  // A UID padded with a space and an LO padded with a NUL come back padded as PS3.5 pads them.
  "trailing-pad-quirks": "same-json",
  "icon-image-sequence": "identical",
  "empty-values-explicit-le": "identical",
  "referenced-uids-explicit-be": "identical",
};

describe("the fuzz seed corpus round trip", () => {
  const outcomes: Record<string, string> = {};
  for (const seed of SEED_CORPUS) {
    let ds;
    let written: Buffer;
    try {
      ds = parseDicom(seed.bytes);
      written = serializeDicom(ds);
    } catch {
      outcomes[seed.name] = "not-written";
      continue;
    }
    let outcome = "";
    for (const sequenceLength of ["defined", "undefined"] as const) {
      let refusal: string | undefined;
      let result: { readonly json: DicomJsonDataset; readonly out: Buffer } | undefined;
      try {
        result = roundTrip(seed.bytes, sequenceLength);
      } catch (err) {
        // A DICOMDIR's offsets name the bytes of the file it was read from, which the JSON Model
        // does not carry, so the writer refuses the Data Set fromDicomJson rebuilt.
        if (err instanceof DicomSerializeError) refusal = `serialize:${err.code}`;
        else if (err instanceof DicomJsonError) refusal = err.code;
        else throw err;
      }
      if (refusal !== undefined) {
        outcome = `refused:${refusal}`;
        break;
      }
      const { json, out } = result as { readonly json: DicomJsonDataset; readonly out: Buffer };
      if (out.equals(written)) {
        outcome = "identical";
        break;
      }
      const again = JSON.parse(
        JSON.stringify(toDicomJson(parseDicom(out), INLINE)),
      ) as DicomJsonDataset;
      outcome = JSON.stringify(again) === JSON.stringify(json) ? "same-json" : "changed";
    }
    outcomes[seed.name] = outcome;
  }

  it("each seed comes back as recorded", () => {
    expect(outcomes).toEqual(SEED_OUTCOMES);
  });

  it("no seed comes back changed", () => {
    expect(Object.values(outcomes)).not.toContain("changed");
  });
});

describe("refusals", () => {
  const meta: FileMeta = { transferSyntaxUID: TS_EXPLICIT_LE };

  it("refuses SV and UV, whose JSON form we have not confirmed", () => {
    for (const vr of ["SV", "UV"] as const) {
      const bytes = buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: vr === "SV" ? "00720082" : "0008040C", vr, value: Buffer.alloc(8) }],
      });
      expect(refusalOf(() => toDicomJson(parseDicom(bytes)))).toBe("UNSUPPORTED_VR");
      expect(
        refusalOf(() => fromDicomJson({ "00720082": { vr, Value: [1] } }, { fileMeta: meta })),
      ).toBe("UNSUPPORTED_VR");
    }
  });

  it("refuses an encapsulated Pixel Data fragment stream", () => {
    const bytes = buildDicom({
      transferSyntax: TS_JPEG_2000,
      elements: [
        {
          tag: "7FE00010",
          items: [],
          explicitVr: "OB",
          encapsulatedPixelData: true,
          encapsulatedFragments: [Buffer.alloc(0), Buffer.from([1, 2, 3, 4])],
        },
      ],
    });
    expect(refusalOf(() => toDicomJson(parseDicom(bytes)))).toBe("UNSUPPORTED_ELEMENT");
  });

  it("refuses OW, OF, OD, OL and OV under Explicit VR Big Endian", () => {
    const bytes = buildDicom({
      transferSyntax: TS_EXPLICIT_BE,
      elements: [{ tag: "7FE00010", vr: "OW", value: u16(1, 2) }],
    });
    expect(refusalOf(() => toDicomJson(parseDicom(bytes)))).toBe("UNSUPPORTED_BYTE_ORDER");
    expect(
      refusalOf(() =>
        fromDicomJson(
          { "7FE00010": { vr: "OW", InlineBinary: "AAEAAg==" } },
          { fileMeta: { transferSyntaxUID: TS_EXPLICIT_BE } },
        ),
      ),
    ).toBe("UNSUPPORTED_BYTE_ORDER");
  });

  it("refuses a DS value that is not a number, NaN and an out-of-range number", () => {
    const bytes = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00101020", vr: "DS", value: text("TALL") }],
    });
    expect(refusalOf(() => toDicomJson(parseDicom(bytes)))).toBe("UNREPRESENTABLE_NUMBER");
    const nan = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00189089", vr: "FD", value: f64(Number.NaN) }],
    });
    expect(refusalOf(() => toDicomJson(parseDicom(nan)))).toBe("UNREPRESENTABLE_NUMBER");
    expect(
      refusalOf(() =>
        fromDicomJson({ "00280010": { vr: "US", Value: [70000] } }, { fileMeta: meta }),
      ),
    ).toBe("UNREPRESENTABLE_NUMBER");
    expect(
      refusalOf(() =>
        fromDicomJson({ "00200013": { vr: "IS", Value: [1.5] } }, { fileMeta: meta }),
      ),
    ).toBe("UNREPRESENTABLE_NUMBER");
    expect(
      refusalOf(() =>
        fromDicomJson({ "00101020": { vr: "DS", Value: [0.1 + 0.2] } }, { fileMeta: meta }),
      ),
    ).toBe("UNREPRESENTABLE_NUMBER");
  });

  it("refuses a binary value whose length is not a whole number of values", () => {
    const bytes = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00081161", vr: "UL", value: Buffer.alloc(6) }],
    });
    expect(refusalOf(() => toDicomJson(parseDicom(bytes)))).toBe("MALFORMED_VALUE");
  });

  it("refuses JSON of another shape", () => {
    const shapes: unknown[] = [
      [],
      { "0010001": { vr: "PN" } },
      { "00100010": { Value: ["X"] } },
      { "00100010": "DOE^JANE" },
      { "00020010": { vr: "UI", Value: [TS_EXPLICIT_LE] } },
      { FFFEE000: { vr: "UN" } },
      { "00100020": { vr: "LO", Value: "MRN-42" } },
      { "00100020": { vr: "LO", Value: [42] } },
      { "00100010": { vr: "PN", Value: ["DOE^JANE"] } },
      { "00100010": { vr: "PN", Value: [{ Alphabetic: "A", Nickname: "B" }] } },
      { "00101020": { vr: "DS", Value: [[1.5]] } },
      { "00209165": { vr: "AT", Value: ["0020003"] } },
      { "00282000": { vr: "OB", Value: [1] } },
      { "00282000": { vr: "OB", InlineBinary: "not base64!" } },
      { "00282000": { vr: "OB", InlineBinary: "AQ==", BulkDataURI: "https://example.com/x" } },
      { "00100020": { vr: "LO", InlineBinary: "AQ==" } },
      { "00104000": { vr: "LT", Value: ["A", "B"] } },
      { "0040A730": { vr: "SQ", Value: ["item"] } },
      { "0040A730": { vr: "SQ", InlineBinary: "AQ==" } },
      { "00100020": { vr: "LO", Value: ["A"] }, "00100020 ": { vr: "LO" } },
      { "0010ABCD": { vr: "LO", Value: ["A"] }, "0010abcd": { vr: "LO", Value: ["B"] } },
    ];
    for (const shape of shapes) {
      expect(refusalOf(() => fromDicomJson(shape as DicomJsonDataset, { fileMeta: meta }))).toBe(
        "INVALID_JSON",
      );
    }
  });

  it("refuses a Transfer Syntax it does not write", () => {
    expect(
      refusalOf(() => fromDicomJson({}, { fileMeta: { transferSyntaxUID: TS_JPEG_2000 } })),
    ).toBe("UNSUPPORTED_TRANSFER_SYNTAX");
  });

  it("refuses text its Specific Character Set is not encoded under here", () => {
    const json: DicomJsonDataset = {
      "00080005": { vr: "CS", Value: ["ISO_IR 101"] },
      "00100010": { vr: "PN", Value: [{ Alphabetic: "DOE^ŁUKASZ" }] },
    };
    expect(refusalOf(() => fromDicomJson(json, { fileMeta: meta }))).toBe(
      "UNSUPPORTED_CHARACTER_SET",
    );
    const latin1 = { ...json, "00080005": { vr: "CS", Value: ["ISO_IR 100"] } };
    expect(refusalOf(() => fromDicomJson(latin1, { fileMeta: meta }))).toBe(
      "UNSUPPORTED_CHARACTER_SET",
    );
    const utf8 = { ...json, "00080005": { vr: "CS", Value: ["ISO_IR 192"] } };
    const back = fromDicomJson(utf8, { fileMeta: meta });
    expect(toDicomJson(back)["00100010"]).toEqual(json["00100010"]);
  });

  it("refuses a value too long for a short-form Value Length Field", () => {
    const long = "A".repeat(70000);
    expect(
      refusalOf(() =>
        fromDicomJson({ "00100020": { vr: "LO", Value: [long] } }, { fileMeta: meta }),
      ),
    ).toBe("VALUE_TOO_LONG");
  });

  it("puts no value and no unregistered tag in the message", () => {
    const err = (() => {
      try {
        fromDicomJson(
          { "00091001": { vr: "LO", Value: [{ Alphabetic: "SMITHSON" }] } },
          { fileMeta: meta },
        );
      } catch (e) {
        return e as DicomJsonError;
      }
      return undefined;
    })();
    expect(err?.code).toBe("INVALID_JSON");
    expect(err?.tag).toBe("<withheld>");
    expect(err?.message).not.toContain("SMITHSON");
    expect(err?.message).not.toContain("00091001");
  });
});

/**
 * The seed corpus for the mutation fuzz targets, and the dictionary of tokens they splice in.
 *
 * Built in memory from `.ts` specs like every other fixture here (D-38: the repository ships no
 * curated `.dcm` file), so `pnpm phi-scan` reads every value. Everything is synthetic: the
 * patients are the allow-listed `DOE^JANE`, `Doe^...` and PS3.5's own `Yamada^Tarou`, every
 * date is the 1900-01-01 placeholder, and every UID sits under the
 * `1.2.826.0.1.3680043.8.498` example root.
 *
 * Each seed is well-formed and small, and between them they reach every part of the reader:
 * the four native transfer syntaxes, every value representation's decoder, defined- and
 * undefined-length sequences nested several deep, private blocks under each vendor profile,
 * the Specific Character Sets including ISO 2022 code extensions, an Enhanced multi-frame
 * object, a DICOMDIR, encapsulated Pixel Data, the JPIP Referenced syntaxes, CP-246, and the
 * recoverable deviations the lenient reader warns on. A mutation that breaks one of them breaks
 * it somewhere deep, which is where the fuzz targets want to be.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import {
  buildDicom,
  encodeBuiltElement,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";
import { buildDicomdir, twoPatientRecords } from "../helpers/build-dicomdir.js";
import { encapsulatedObject, jpipObject } from "../fixtures/encapsulated/objects.js";
import { FIRST_USE_CT_NO_PREAMBLE, FIRST_USE_CT_OBJECT } from "../fixtures/first-use/ct-object.js";

type AnyElement = BuildDicomElement | BuildDicomSqElement;

/** One named seed. */
export interface Seed {
  readonly name: string;
  readonly bytes: Buffer;
}

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";
const TS_JPEG_2000 = "1.2.840.10008.1.2.4.90";
const TS_RLE = "1.2.840.10008.1.2.5";
const TS_JPIP = "1.2.840.10008.1.2.4.94";
const TS_JPIP_DEFLATE = "1.2.840.10008.1.2.4.95";

const ROOT = "1.2.826.0.1.3680043.8.498";

/** Text padded to even length with a space, as the text VRs require. */
function text(s: string, encoding: BufferEncoding = "latin1"): Buffer {
  const b = Buffer.from(s, encoding);
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

/** A UID padded to even length with a NUL. */
function uid(s: string): Buffer {
  const b = Buffer.from(s, "ascii");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x00])]);
}

/** Raw bytes padded to even length with a space, for hand-assembled charset values. */
function raw(...parts: (string | readonly number[] | Buffer)[]): Buffer {
  const b = Buffer.concat(
    parts.map((p) =>
      typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.isBuffer(p) ? p : Buffer.from(p),
    ),
  );
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
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

function s64(...values: bigint[]): Buffer {
  const b = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => b.writeBigInt64LE(v, i * 8));
  return b;
}

function u64(...values: bigint[]): Buffer {
  const b = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => b.writeBigUInt64LE(v, i * 8));
  return b;
}

/** `AT` values: each tag as its group then its element, both 16-bit. */
function tags(...ts: string[]): Buffer {
  return Buffer.concat(ts.map((t) => u16(parseInt(t.slice(0, 4), 16), parseInt(t.slice(4), 16))));
}

/** A code item: the coded triplet a Code Sequence carries. */
function codeItem(value: string, scheme: string, meaning: string): { elements: AnyElement[] } {
  return {
    elements: [
      { tag: "00080100", vr: "SH", value: text(value) },
      { tag: "00080102", vr: "SH", value: text(scheme) },
      { tag: "00080104", vr: "LO", value: text(meaning) },
    ],
  };
}

/**
 * The broad element set behind the four `rich-*` seeds, in ascending tag order: every value
 * representation, multi-valued strings, a private block, a defined-length code sequence, a
 * look-up table, a real world value mapping with a nested units code, an undefined-length
 * content sequence, and native Pixel Data.
 */
function richElements(): AnyElement[] {
  return [
    { tag: "00080008", vr: "CS", value: text("ORIGINAL\\PRIMARY\\AXIAL") },
    { tag: "00080016", vr: "UI", value: uid("1.2.840.10008.5.1.4.1.1.2") },
    { tag: "00080018", vr: "UI", value: uid(`${ROOT}.301`) },
    { tag: "00080020", vr: "DA", value: text("19000101") },
    { tag: "00080030", vr: "TM", value: text("120000.123456") },
    { tag: "0008002A", vr: "DT", value: text("19000101120000.000000+0000") },
    { tag: "00080050", vr: "SH", value: text("ACC-0001") },
    { tag: "00080054", vr: "AE", value: text("SYNTH_AE") },
    { tag: "00080060", vr: "CS", value: text("CT") },
    { tag: "00080081", vr: "ST", value: text("1 Synthetic Way") },
    { tag: "00080090", vr: "PN", value: text("TEST^PATIENT") },
    { tag: "00080119", vr: "UC", value: text("SYNTH-LONG-CODE") },
    { tag: "00080120", vr: "UR", value: text("urn:synth:1") },
    { tag: "0008040C", vr: "UV", value: u64(1024n) },
    { tag: "00081030", vr: "LO", value: text("SYNTH STUDY") },
    { tag: "00081032", items: [codeItem("P-0001", "99SYNTH", "Synthetic procedure")] },
    { tag: "00089459", vr: "FL", value: f32(29.97) },
    { tag: "00090010", vr: "LO", value: text("SYNTH PRIVATE CREATOR") },
    { tag: "00091001", vr: "LO", value: text("SYNTH PRIVATE VALUE") },
    { tag: "00091002", vr: "US", value: u16(7) },
    { tag: "00100010", vr: "PN", value: text("DOE^JANE") },
    { tag: "00100020", vr: "LO", value: text("MRN-42") },
    { tag: "00100030", vr: "DA", value: text("19000101") },
    { tag: "00100040", vr: "CS", value: text("O") },
    { tag: "00101010", vr: "AS", value: text("042Y") },
    { tag: "00101020", vr: "DS", value: text("1.75") },
    { tag: "00101030", vr: "DS", value: text("70.5") },
    { tag: "00104000", vr: "LT", value: text("Synthetic comment\\with a backslash") },
    { tag: "0014410B", vr: "OF", value: f32(1.5, 2.5) },
    { tag: "0014410C", vr: "OD", value: f64(3.25) },
    { tag: "00180050", vr: "DS", value: text("1.25") },
    { tag: "00181020", vr: "LO", value: text("SYNTH 1.0\\SYNTH 2.0") },
    { tag: "00181030", vr: "LO", value: text("SYNTH PROTOCOL") },
    { tag: "00186020", vr: "SL", value: s32(-5) },
    { tag: "00189219", vr: "SS", value: s16(-3) },
    { tag: "0020000D", vr: "UI", value: uid(`${ROOT}.302`) },
    { tag: "0020000E", vr: "UI", value: uid(`${ROOT}.303`) },
    { tag: "00200011", vr: "IS", value: text("7") },
    { tag: "00200013", vr: "IS", value: text("1") },
    { tag: "00200032", vr: "DS", value: text("-100.5\\-100.5\\0") },
    { tag: "00200037", vr: "DS", value: text("1\\0\\0\\0\\1\\0") },
    { tag: "00200052", vr: "UI", value: uid(`${ROOT}.304`) },
    { tag: "00209165", vr: "AT", value: tags("00200032", "00209157") },
    { tag: "00280002", vr: "US", value: u16(1) },
    { tag: "00280004", vr: "CS", value: text("MONOCHROME2") },
    { tag: "00280010", vr: "US", value: u16(4) },
    { tag: "00280011", vr: "US", value: u16(4) },
    { tag: "00280030", vr: "DS", value: text("0.5\\0.5") },
    { tag: "00280100", vr: "US", value: u16(16) },
    { tag: "00280101", vr: "US", value: u16(12) },
    { tag: "00280102", vr: "US", value: u16(11) },
    { tag: "00280103", vr: "US", value: u16(1) },
    { tag: "00281050", vr: "DS", value: text("40\\80") },
    { tag: "00281051", vr: "DS", value: text("400\\800") },
    { tag: "00281052", vr: "DS", value: text("-1024") },
    { tag: "00281053", vr: "DS", value: text("1") },
    { tag: "00281054", vr: "LO", value: text("HU") },
    {
      tag: "00283000",
      items: [
        {
          elements: [
            { tag: "00283002", vr: "US", value: u16(4, 0, 16) },
            { tag: "00283003", vr: "LO", value: text("SYNTH LUT") },
            { tag: "00283006", vr: "US", value: u16(0, 100, 200, 300) },
          ],
        },
      ],
    },
    {
      tag: "00409096",
      undefinedLength: true,
      items: [
        {
          undefinedLength: true,
          elements: [
            { tag: "004008EA", items: [codeItem("Hz", "UCUM", "Hertz")] },
            { tag: "00409210", vr: "SH", value: text("SYNTH") },
            { tag: "00409211", vr: "US", value: u16(4095) },
            { tag: "00409216", vr: "US", value: u16(0) },
            { tag: "00409224", vr: "FD", value: f64(-1024) },
            { tag: "00409225", vr: "FD", value: f64(1.5) },
          ],
        },
      ],
    },
    {
      tag: "0040A730",
      undefinedLength: true,
      items: [
        {
          undefinedLength: true,
          elements: [
            { tag: "0040A010", vr: "CS", value: text("CONTAINS") },
            { tag: "0040A040", vr: "CS", value: text("TEXT") },
            { tag: "0040A043", items: [codeItem("C-0001", "99SYNTH", "Synthetic concept")] },
            { tag: "0040A160", vr: "UT", value: text("Synthetic text value") },
          ],
        },
        { elements: [{ tag: "0040A010", vr: "CS", value: text("HAS PROPERTIES") }] },
      ],
    },
    { tag: "00660040", vr: "OL", value: u32(0, 1, 2) },
    { tag: "00720081", vr: "OV", value: u64(9n) },
    { tag: "00720082", vr: "SV", value: s64(-7n) },
    { tag: "7FE00010", vr: "OW", value: u16(...Array.from({ length: 16 }, (_, i) => i * 64)) },
  ];
}

/** An Enhanced multi-frame object: shared and per-frame functional groups for two frames. */
function enhancedElements(): AnyElement[] {
  const pixelMeasures: BuildDicomSqElement = {
    tag: "00289110",
    items: [
      {
        elements: [
          { tag: "00180050", vr: "DS", value: text("1.0") },
          { tag: "00280030", vr: "DS", value: text("0.5\\0.5") },
        ],
      },
    ],
  };
  const orientation: BuildDicomSqElement = {
    tag: "00209116",
    items: [{ elements: [{ tag: "00200037", vr: "DS", value: text("1\\0\\0\\0\\1\\0") }] }],
  };
  const position = (z: string): BuildDicomSqElement => ({
    tag: "00209113",
    items: [{ elements: [{ tag: "00200032", vr: "DS", value: text(`0\\0\\${z}`) }] }],
  });
  const voiLut: BuildDicomSqElement = {
    tag: "00289132",
    items: [
      {
        elements: [
          { tag: "00281050", vr: "DS", value: text("40") },
          { tag: "00281051", vr: "DS", value: text("400") },
        ],
      },
    ],
  };
  const transformation: BuildDicomSqElement = {
    tag: "00289145",
    items: [
      {
        elements: [
          { tag: "00281052", vr: "DS", value: text("-1024") },
          { tag: "00281053", vr: "DS", value: text("2.5") },
          { tag: "00281054", vr: "LO", value: text("HU") },
        ],
      },
    ],
  };
  return [
    { tag: "00080016", vr: "UI", value: uid("1.2.840.10008.5.1.4.1.1.2.1") },
    { tag: "00080018", vr: "UI", value: uid(`${ROOT}.311`) },
    { tag: "00100010", vr: "PN", value: text("DOE^JANE") },
    { tag: "00280008", vr: "IS", value: text("2") },
    { tag: "52009229", items: [{ elements: [orientation, pixelMeasures] }] },
    {
      tag: "52009230",
      undefinedLength: true,
      items: [
        { elements: [position("0"), voiLut] },
        { undefinedLength: true, elements: [position("1"), transformation] },
      ],
    },
  ];
}

/** Sequences nested `depth` deep, alternating defined- and undefined-length items. */
function nested(depth: number): AnyElement {
  let inner: AnyElement = { tag: "00100010", vr: "PN", value: text("DOE^JANE") };
  for (let level = 0; level < depth; level++) {
    inner = {
      tag: level % 2 === 0 ? "0040A730" : "00081115",
      undefinedLength: level % 3 === 0,
      items: [{ undefinedLength: level % 2 === 1, elements: [inner] }],
    };
  }
  return inner;
}

/** Explicit VR LE bytes of a `UN` element of undefined length that holds an Implicit VR SQ. */
function cp246Element(): Buffer {
  const inner = encodeBuiltElement(
    { tag: "00100020", vr: "LO", value: text("MRN-42") },
    TS_IMPLICIT_LE,
  );
  const itemHeader = Buffer.concat([u16(0xfffe, 0xe000), u32(inner.length)]);
  const seqDelim = Buffer.concat([u16(0xfffe, 0xe0dd), u32(0)]);
  return Buffer.concat([
    u16(0x0009, 0x1000),
    Buffer.from("UN", "ascii"),
    u16(0),
    u32(0xffffffff),
    itemHeader,
    inner,
    seqDelim,
  ]);
}

/** An Explicit VR LE file whose OB element carries non-zero reserved bytes. */
function nonzeroReserved(): Buffer {
  const buf = buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [{ tag: "00181020", vr: "OB", value: Buffer.from([0x01, 0x02]) }],
  });
  const at = buf.lastIndexOf(Buffer.from("OB", "ascii"));
  if (at > 0) buf[at + 3] = 0xff;
  return buf;
}

/** The ISO 2022 escape sequences the charset seeds switch with. */
const ESC_JIS_X_0208 = [0x1b, 0x24, 0x42];
const ESC_ASCII = [0x1b, 0x28, 0x42];
const ESC_KS_X_1001 = [0x1b, 0x24, 0x29, 0x43];

function build(transferSyntax: string, elements: AnyElement[]): Buffer {
  return buildDicom({ transferSyntax, elements });
}

/** Every seed, by name. */
export const SEED_CORPUS: readonly Seed[] = Object.freeze([
  { name: "rich-implicit-le", bytes: build(TS_IMPLICIT_LE, richElements()) },
  { name: "rich-explicit-le", bytes: build(TS_EXPLICIT_LE, richElements()) },
  { name: "rich-explicit-be", bytes: build(TS_EXPLICIT_BE, richElements()) },
  { name: "rich-deflated-le", bytes: build(TS_DEFLATED_LE, richElements()) },
  { name: "first-use-ct", bytes: FIRST_USE_CT_OBJECT },
  { name: "first-use-ct-no-preamble", bytes: FIRST_USE_CT_NO_PREAMBLE },
  {
    name: "charset-utf8",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00080005", vr: "CS", value: text("ISO_IR 192") },
      { tag: "00100010", vr: "PN", value: text("Doe^José=山田^太郎", "utf8") },
      { tag: "00104000", vr: "LT", value: text("café üß €", "utf8") },
    ]),
  },
  {
    name: "charset-latin1",
    bytes: build(TS_IMPLICIT_LE, [
      { tag: "00080005", vr: "CS", value: text("ISO_IR 100") },
      { tag: "00100010", vr: "PN", value: text("Doe^Renée") },
      { tag: "00081030", vr: "LO", value: text("Étude synthétique") },
    ]),
  },
  {
    name: "charset-iso2022-jp",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00080005", vr: "CS", value: text("\\ISO 2022 IR 87") },
      {
        tag: "00100010",
        vr: "PN",
        value: raw(
          "Yamada^Tarou=",
          ESC_JIS_X_0208,
          [0x3b, 0x33],
          ESC_ASCII,
          "^",
          ESC_JIS_X_0208,
          [0x42, 0x40],
          ESC_ASCII,
        ),
      },
      { tag: "00104000", vr: "LT", value: raw("A", ESC_JIS_X_0208, [0x3b, 0x33], "\r\n", "B") },
    ]),
  },
  {
    name: "charset-iso2022-kr",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00080005", vr: "CS", value: text("\\ISO 2022 IR 149") },
      {
        tag: "00100010",
        vr: "PN",
        value: raw("Hong^Gildong=", ESC_KS_X_1001, [0xfb, 0xf3], "^", [0xd1, 0xce]),
      },
    ]),
  },
  {
    name: "charset-gb18030",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00080005", vr: "CS", value: text("GB18030") },
      {
        tag: "00100010",
        vr: "PN",
        value: raw("Zhang^XiaoDong=", [0xd5, 0xc5], "^", [0xd0, 0xa1, 0xb6, 0xab]),
      },
    ]),
  },
  { name: "enhanced-multiframe", bytes: build(TS_EXPLICIT_LE, enhancedElements()) },
  {
    name: "dicomdir-explicit-le",
    bytes: buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...twoPatientRecords() }).bytes,
  },
  {
    name: "dicomdir-implicit-le",
    bytes: buildDicomdir({ transferSyntax: TS_IMPLICIT_LE, ...twoPatientRecords() }).bytes,
  },
  {
    name: "encapsulated-jpeg-2000",
    bytes: encapsulatedObject({
      transferSyntax: TS_JPEG_2000,
      items: [u32(0, 24), Buffer.alloc(16, 0xa5), Buffer.alloc(8, 0x5a)],
    }),
  },
  {
    name: "encapsulated-rle",
    bytes: encapsulatedObject({ transferSyntax: TS_RLE, burnedInAnnotation: "NO" }),
  },
  { name: "jpip-referenced", bytes: jpipObject({ transferSyntax: TS_JPIP }) },
  { name: "jpip-referenced-deflate", bytes: jpipObject({ transferSyntax: TS_JPIP_DEFLATE }) },
  {
    name: "cp246-un-sequence",
    bytes: buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [],
      dataSetBytes: Buffer.concat([
        encodeBuiltElement({ tag: "00080060", vr: "CS", value: text("CT") }, TS_EXPLICIT_LE),
        cp246Element(),
      ]),
    }),
  },
  {
    name: "private-ge-implicit-le",
    bytes: build(TS_IMPLICIT_LE, [
      { tag: "00090010", vr: "LO", value: text("GEMS_IDEN_01") },
      { tag: "00091001", vr: "LO", value: text("SYNTH") },
      { tag: "00091002", vr: "SH", value: text("S1") },
      { tag: "00100010", vr: "PN", value: text("DOE^JANE") },
      { tag: "00190010", vr: "LO", value: text("GEMS_ACQU_01") },
      { tag: "0019109C", vr: "LO", value: text("SYNTHSEQ") },
      { tag: "001910BB", vr: "DS", value: text("0.5") },
      { tag: "00430010", vr: "LO", value: text("GEMS_PARM_01") },
      { tag: "00431039", vr: "IS", value: text("1000\\0\\0\\0") },
    ]),
  },
  {
    name: "private-siemens-explicit-le",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00100010", vr: "PN", value: text("DOE^JANE") },
      { tag: "00290010", vr: "LO", value: text("SIEMENS CSA HEADER") },
      { tag: "00290011", vr: "LO", value: text("SIEMENS MEDCOM HEADER") },
      { tag: "00291010", vr: "OB", value: raw("SV10", [4, 3, 2, 1], u32(1, 77), "ImaSynth") },
      { tag: "00291108", vr: "CS", value: text("SYNTH") },
      { tag: "00291110", vr: "OB", value: Buffer.alloc(8, 0x33) },
    ]),
  },
  {
    name: "private-sequence-implicit-le",
    bytes: build(TS_IMPLICIT_LE, [
      { tag: "00110010", vr: "LO", value: text("SYNTH SEQUENCE CREATOR") },
      {
        tag: "00111001",
        undefinedLength: true,
        items: [{ elements: [{ tag: "00100010", vr: "PN", value: text("DOE^JOHN") }] }],
      },
    ]),
  },
  { name: "nested-explicit-le", bytes: build(TS_EXPLICIT_LE, [nested(6)]) },
  { name: "nested-implicit-le", bytes: build(TS_IMPLICIT_LE, [nested(6)]) },
  {
    name: "file-meta-extras",
    bytes: buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      sourceApplicationEntityTitle: "SYNTH_SRC_AE",
      implementationClassUID: `${ROOT}.1`,
      implementationVersionName: "SYNTH_1_0",
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.7",
      mediaStorageSOPInstanceUID: `${ROOT}.321`,
      fileMetaExtraElements: [
        { tag: "00020017", vr: "AE", value: text("SYNTH_SEND") },
        { tag: "00020100", vr: "UI", value: uid(`${ROOT}.9`) },
        { tag: "00020102", vr: "OB", value: Buffer.alloc(4, 0x11) },
      ],
      elements: [{ tag: "00100010", vr: "PN", value: text("DOE^JANE") }],
    }),
  },
  {
    name: "group-length-wrong",
    bytes: buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      fileMetaGroupLength: "wrong",
      elements: [{ tag: "00100010", vr: "PN", value: text("DOE^JANE") }],
    }),
  },
  {
    name: "group-length-omitted",
    bytes: buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      fileMetaGroupLength: "omit",
      elements: [{ tag: "00100010", vr: "PN", value: text("DOE^JANE") }],
    }),
  },
  {
    name: "odd-length-and-retired-group-length",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00080000", vr: "UL", value: u32(4) },
      { tag: "00100020", vr: "LO", value: Buffer.from("ODD", "ascii") },
    ]),
  },
  { name: "nonzero-reserved-bytes", bytes: nonzeroReserved() },
  {
    name: "trailing-pad-quirks",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00080018", vr: "UI", value: Buffer.from(`${ROOT}.341 `, "ascii") },
      { tag: "00081030", vr: "LO", value: Buffer.from("SYNTH\0", "latin1") },
      { tag: "00100010", vr: "PN", value: text("DOE^JANE") },
    ]),
  },
  {
    name: "icon-image-sequence",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00100010", vr: "PN", value: text("DOE^JANE") },
      {
        tag: "00880200",
        items: [
          {
            elements: [
              { tag: "00280002", vr: "US", value: u16(1) },
              { tag: "00280004", vr: "CS", value: text("MONOCHROME2") },
              { tag: "00280010", vr: "US", value: u16(2) },
              { tag: "00280011", vr: "US", value: u16(2) },
              { tag: "00280100", vr: "US", value: u16(8) },
              { tag: "00280101", vr: "US", value: u16(8) },
              { tag: "00280102", vr: "US", value: u16(7) },
              { tag: "00280103", vr: "US", value: u16(0) },
              { tag: "7FE00010", vr: "OB", value: Buffer.from([1, 2, 3, 4]) },
            ],
          },
        ],
      },
    ]),
  },
  {
    name: "empty-values-explicit-le",
    bytes: build(TS_EXPLICIT_LE, [
      { tag: "00080020", vr: "DA", value: Buffer.alloc(0) },
      { tag: "00081032", items: [] },
      { tag: "00100010", vr: "PN", value: Buffer.alloc(0) },
      { tag: "00101010", vr: "AS", value: Buffer.alloc(0) },
      { tag: "00200013", vr: "IS", value: Buffer.alloc(0) },
      { tag: "00209165", vr: "AT", value: Buffer.alloc(0) },
      { tag: "00280010", vr: "US", value: Buffer.alloc(0) },
      { tag: "00720082", vr: "SV", value: Buffer.alloc(0) },
      { tag: "7FE00010", vr: "OW", value: Buffer.alloc(0) },
    ]),
  },
  {
    name: "referenced-uids-explicit-be",
    bytes: build(TS_EXPLICIT_BE, [
      { tag: "00080018", vr: "UI", value: uid(`${ROOT}.331`) },
      {
        tag: "00081115",
        items: [
          {
            elements: [
              {
                tag: "0008114A",
                items: [
                  {
                    elements: [
                      { tag: "00081150", vr: "UI", value: uid("1.2.840.10008.5.1.4.1.1.2") },
                      { tag: "00081155", vr: "UI", value: uid(`${ROOT}.332`) },
                    ],
                  },
                ],
              },
              { tag: "0020000E", vr: "UI", value: uid(`${ROOT}.333`) },
            ],
          },
        ],
      },
      { tag: "00100010", vr: "PN", value: text("DOE^JOHN") },
      { tag: "0020000D", vr: "UI", value: uid(`${ROOT}.334`) },
    ]),
  },
]);

/**
 * Tokens the `token` mutation splices in: structural tags (Item, delimiters, Pixel Data, the
 * File Meta group, the Directory Record Sequence, a private creator slot), item headers, value
 * representations, transfer syntax UIDs, character set terms, ISO 2022 escapes, and the text
 * delimiters.
 */
export const DICOM_TOKENS: readonly Buffer[] = Object.freeze([
  Buffer.from([0xfe, 0xff, 0x00, 0xe0]),
  Buffer.from([0xfe, 0xff, 0x0d, 0xe0]),
  Buffer.from([0xfe, 0xff, 0xdd, 0xe0]),
  Buffer.from([0xff, 0xfe, 0xe0, 0x00]),
  Buffer.from([0xff, 0xfe, 0xe0, 0x0d]),
  Buffer.from([0xff, 0xfe, 0xe0, 0xdd]),
  Buffer.from([0xfe, 0xff, 0x00, 0xe0, 0xff, 0xff, 0xff, 0xff]),
  Buffer.from([0xfe, 0xff, 0xdd, 0xe0, 0x00, 0x00, 0x00, 0x00]),
  Buffer.from([0xe0, 0x7f, 0x10, 0x00]),
  Buffer.from([0x02, 0x00, 0x10, 0x00]),
  Buffer.from([0x02, 0x00, 0x00, 0x00]),
  Buffer.from([0x08, 0x00, 0x05, 0x00]),
  Buffer.from([0x04, 0x00, 0x20, 0x12]),
  Buffer.from([0x28, 0x00, 0x08, 0x00]),
  Buffer.from([0x00, 0x52, 0x30, 0x92]),
  Buffer.from([0x09, 0x00, 0x10, 0x00]),
  ...[
    "SQ",
    "OB",
    "OW",
    "UN",
    "UT",
    "UC",
    "UR",
    "SV",
    "UV",
    "OV",
    "OL",
    "OF",
    "OD",
    "AT",
    "US",
    "SS",
    "UL",
    "SL",
    "FL",
    "FD",
    "PN",
    "DS",
    "IS",
    "DA",
    "TM",
    "DT",
    "CS",
    "UI",
    "LO",
    "SH",
    "ST",
    "LT",
    "AE",
    "AS",
    "XX",
  ].map((vr) => Buffer.from(vr, "ascii")),
  Buffer.from("DICM", "ascii"),
  uid(TS_IMPLICIT_LE),
  uid(TS_EXPLICIT_LE),
  uid(TS_EXPLICIT_BE),
  uid(TS_DEFLATED_LE),
  uid(TS_JPIP),
  uid(TS_JPEG_2000),
  Buffer.from("ISO_IR 192", "ascii"),
  Buffer.from("\\ISO 2022 IR 87", "ascii"),
  Buffer.from("ISO 2022 IR 149", "ascii"),
  Buffer.from("GB18030", "ascii"),
  Buffer.from(ESC_JIS_X_0208),
  Buffer.from(ESC_ASCII),
  Buffer.from(ESC_KS_X_1001),
  Buffer.from([0x1b, 0x2d, 0x41]),
  Buffer.from([0x1b, 0x28, 0x4a]),
  Buffer.from("\\", "ascii"),
  Buffer.from("^", "ascii"),
  Buffer.from("=", "ascii"),
]);

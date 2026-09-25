/**
 * `serializeDicom` under every PS3.5 2026c section A.4 encapsulation Transfer Syntax: what it
 * writes, and every top-level Data Set it refuses with `INVALID_ENCAPSULATED_PIXEL_DATA`.
 *
 * Every object here is synthetic: the `encapsulatedObject` fixture (declared synthetic in its own
 * header) and, where the parser would never produce the shape under test, a Dataset built from
 * that fixture with its top-level Pixel Data span replaced by bytes assembled here. Every fragment
 * is a fixed fill, never a codestream.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  Dataset,
  DicomSerializeError,
  Element,
  parseDicom,
  readPixelDataFragments,
  SERIALIZE_ERROR_CODES,
  serializeDicom,
  WARNING_CODES,
} from "../../src/index.js";
import type { BuildDicomSqElement } from "../helpers/build-dicom.js";
import {
  PATIENT_NAME,
  encapsulatedObject,
  explicitLeTwin,
  pixelData,
  type EncapsulatedObjectOptions,
} from "../fixtures/encapsulated/objects.js";
import { ENCAPSULATION_SET } from "../helpers/ps35-section-a4.js";

const PIXEL_DATA = "7FE00010";
const UNDEFINED_LENGTH = 0xffffffff;

/** The writer's outcome: the bytes it returned, or the error it threw. */
function attempt(ds: Dataset): { out: Buffer | undefined; err: unknown } {
  try {
    return { out: serializeDicom(ds), err: undefined };
  } catch (err) {
    return { out: undefined, err };
  }
}

/** Assert the writer refused `ds` with `INVALID_ENCAPSULATED_PIXEL_DATA` and returned nothing. */
function expectRefused(ds: Dataset): DicomSerializeError {
  const { out, err } = attempt(ds);
  expect(out).toBeUndefined();
  expect(err).toBeInstanceOf(DicomSerializeError);
  const error = err as DicomSerializeError;
  expect(error.code).toBe(SERIALIZE_ERROR_CODES.INVALID_ENCAPSULATED_PIXEL_DATA);
  return error;
}

/** The bytes after the File Meta group: preamble (128), `DICM` (4), `(0002,0000)` (12), group. */
function afterFileMeta(out: Buffer): Buffer {
  return out.subarray(144 + out.readUInt32LE(140));
}

function uint32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n, 0);
  return buf;
}

/** An `(FFFE,E000)` Item carrying `value`, its Item Length `declared` when given. */
function item(value: Buffer, declared: number = value.length): Buffer {
  return Buffer.concat([Buffer.from([0xfe, 0xff, 0x00, 0xe0]), uint32(declared), value]);
}

/** A marker `(FFFE,element)` with Item Length `length`. */
function marker(element: number, length = 0): Buffer {
  return Buffer.concat([Buffer.from([0xfe, 0xff, element & 0xff, element >> 8]), uint32(length)]);
}

const SEQUENCE_DELIMITATION = marker(0xe0dd);

/** A top-level Pixel Data header: `(7FE0,0010)`, `vr`, `reserved`, Value Length. */
function pixelHeader(vr = "OB", reserved = [0x00, 0x00], length = UNDEFINED_LENGTH): Buffer {
  return Buffer.concat([
    Buffer.from([0xe0, 0x7f, 0x10, 0x00]),
    Buffer.from(vr, "ascii"),
    Buffer.from(reserved),
    uint32(length),
  ]);
}

/**
 * `ds` with its top-level Pixel Data replaced by an undefined-length element whose `rawBytes`
 * (the whole on-wire span, per the writer's input contract) are `span`. The rest of the Data Set
 * and the File Meta are `ds`'s own.
 */
function withPixelSpan(ds: Dataset, span: Buffer): Dataset {
  const elements = new Map(ds.elements().map((el) => [el.tag, el]));
  elements.set(
    PIXEL_DATA,
    new Element({
      tag: PIXEL_DATA,
      vr: "OB",
      vm: 0,
      length: UNDEFINED_LENGTH,
      rawBytes: span,
      byteOffset: 0,
      littleEndian: true,
    }),
  );
  return new Dataset({
    ...(ds.fileMeta !== undefined ? { fileMeta: ds.fileMeta } : {}),
    warnings: [],
    elements,
  });
}

/** Three fragments, one per Frame, and the Basic Offset Table of their three 32-bit offsets. */
const FRAGMENTS: readonly Buffer[] = [
  Buffer.alloc(10, 0x11),
  Buffer.alloc(4, 0x22),
  Buffer.alloc(6, 0x33),
];
const BASIC_OFFSET_TABLE: Buffer = Buffer.concat([
  uint32(0),
  uint32(8 + 10),
  uint32(8 + 10 + 8 + 4),
]);

/** The two fragment streams AC-3 names, as `encapsulatedObject`'s `items`. */
const STREAMS: readonly { readonly name: string; readonly items: readonly Buffer[] }[] = [
  {
    name: "empty Basic Offset Table, one fragment",
    items: [Buffer.alloc(0), Buffer.alloc(16, 0xa5)],
  },
  {
    name: "non-empty Basic Offset Table, three fragments",
    items: [BASIC_OFFSET_TABLE, ...FRAGMENTS],
  },
];

const CASES = ENCAPSULATION_SET.flatMap((uid) =>
  STREAMS.map((stream) => ({ uid, name: stream.name, items: stream.items })),
);

describe("AC-1: serializeDicom accepts every section A.4 Transfer Syntax", () => {
  it("AC-1: the set under test is the whole of section A.4", () => {
    expect(ENCAPSULATION_SET).toHaveLength(35);
  });

  it.each(ENCAPSULATION_SET)("AC-1: %s returns a Part 10 buffer declaring the same UID", (uid) => {
    const { out, err } = attempt(parseDicom(encapsulatedObject({ transferSyntax: uid })));
    expect(err).toBeUndefined();
    expect(out).toBeInstanceOf(Buffer);
    const written = out as Buffer;
    expect(written.subarray(128, 132).toString("ascii")).toBe("DICM");
    expect(parseDicom(written).fileMeta?.transferSyntaxUID).toBe(uid);
  });
});

describe("AC-2: the Data Set is written as Explicit VR Little Endian", () => {
  it.each(ENCAPSULATION_SET)(
    "AC-2: %s writes the bytes the Explicit-LE twin writes after the File Meta group",
    (uid) => {
      const out = serializeDicom(parseDicom(encapsulatedObject({ transferSyntax: uid })));
      const twin = serializeDicom(parseDicom(explicitLeTwin({ transferSyntax: uid })));
      expect(afterFileMeta(out).equals(afterFileMeta(twin))).toBe(true);
      // Control: the two File Meta groups do differ, so the cut above is at the right place.
      expect(out.equals(twin)).toBe(false);
    },
  );
});

describe("AC-3: top-level encapsulated Pixel Data is written as an A.4 fragment stream", () => {
  it.each(CASES)("AC-3: $uid, $name", ({ uid, items }) => {
    const source = parseDicom(encapsulatedObject({ transferSyntax: uid, items }));
    const out = serializeDicom(source);
    const start = parseDicom(out).get(PIXEL_DATA)?.byteOffset ?? -1;
    const expected = Buffer.concat([
      pixelHeader(),
      ...items.map((value) => item(value)),
      SEQUENCE_DELIMITATION,
    ]);
    // Header, every Item in order, the delimiter, and nothing else: the element ends the file.
    expect(out.subarray(start).equals(expected)).toBe(true);
    // The Items are the input's, byte for byte (Item tag, Item Length and value).
    const input = source.get(PIXEL_DATA)?.rawBytes ?? Buffer.alloc(0);
    expect(
      out.subarray(start + 12, out.length - 8).equals(input.subarray(12, input.length - 8)),
    ).toBe(true);
  });

  it("AC-3: the header and delimiter are written spec-clean whatever VR the input span carried", () => {
    const uid = "1.2.840.10008.1.2.4.50";
    const stream = [item(Buffer.alloc(0)), item(Buffer.alloc(16, 0xa5))];
    // An `OW` span with non-zero reserved bytes and a delimiter with a non-zero Item Length.
    const span = Buffer.concat([pixelHeader("OW", [0x12, 0x34]), ...stream, marker(0xe0dd, 4)]);
    const ds = withPixelSpan(parseDicom(encapsulatedObject({ transferSyntax: uid })), span);
    const out = serializeDicom(ds);
    const expected = Buffer.concat([pixelHeader(), ...stream, SEQUENCE_DELIMITATION]);
    expect(out.subarray(out.length - expected.length).equals(expected)).toBe(true);
  });
});

describe("AC-4: the output re-reads strictly and re-serializes byte-identically", () => {
  it.each(CASES)("AC-4: $uid, $name", ({ uid, items }) => {
    const written = parseDicom(encapsulatedObject({ transferSyntax: uid, items }));
    const out = serializeDicom(written);
    const reread = parseDicom(out, { strict: true });
    expect(reread.fileMeta?.transferSyntaxUID).toBe(uid);

    const before = readPixelDataFragments(written);
    const after = readPixelDataFragments(reread);
    expect(before?.basicOffsetTable).toBeDefined();
    expect(after?.basicOffsetTable?.equals(before?.basicOffsetTable ?? Buffer.alloc(1))).toBe(true);
    expect(after?.fragments.map((f) => f.toString("hex"))).toStrictEqual(
      before?.fragments.map((f) => f.toString("hex")),
    );
    expect(after?.fragments).toHaveLength(items.length - 1);

    expect(serializeDicom(reread).equals(out)).toBe(true);
  });
});

/** A refusal case: the Dataset to hand the writer under `uid`. */
interface Refusal {
  readonly name: string;
  readonly dataset: (uid: string) => Dataset;
}

const parsed =
  (opts: Omit<EncapsulatedObjectOptions, "transferSyntax">) =>
  (uid: string): Dataset =>
    parseDicom(encapsulatedObject({ ...opts, transferSyntax: uid }));

const spanned =
  (...parts: Buffer[]) =>
  (uid: string): Dataset =>
    withPixelSpan(parseDicom(encapsulatedObject({ transferSyntax: uid })), Buffer.concat(parts));

const BOT = item(Buffer.alloc(0));
const FRAGMENT = item(Buffer.alloc(16, 0xa5));

/** Run every case under every section A.4 UID. */
function refusesUnderEveryUid(refusal: Refusal): void {
  for (const uid of ENCAPSULATION_SET) expectRefused(refusal.dataset(uid));
}

describe("AC-7: native top-level Pixel Data is refused", () => {
  it("AC-7: a defined Value Length (Native Format) throws INVALID_ENCAPSULATED_PIXEL_DATA", () => {
    const native = parsed({
      pixelDataElements: [{ tag: PIXEL_DATA, vr: "OB", value: Buffer.alloc(16, 0x5a) }],
    });
    // Control: the parser read it as native, not as a fragment stream.
    const control = native(ENCAPSULATION_SET[0] ?? "");
    expect(control.get(PIXEL_DATA)?.length).toBe(16);
    refusesUnderEveryUid({ name: "native", dataset: native });
  });
});

describe("AC-8: a stream not ended by its delimiter, or holding a non-Item, is refused", () => {
  it("AC-8: a stream parseDicom read with DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED", () => {
    const undelimited = parsed({ omitSequenceDelim: true });
    // Control: the parse did flag it, so this is the stream the criterion names.
    expect(undelimited(ENCAPSULATION_SET[0] ?? "").warnings.map((w) => w.code)).toContain(
      WARNING_CODES.DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED,
    );
    refusesUnderEveryUid({ name: "undelimited", dataset: undelimited });
  });

  const cases: readonly Refusal[] = [
    {
      name: "an Item that runs past the end of the span",
      dataset: spanned(pixelHeader(), BOT, item(Buffer.alloc(4), 16)),
    },
    {
      name: "a stream cut inside an Item header",
      dataset: spanned(pixelHeader(), BOT, FRAGMENT, Buffer.from([0xfe, 0xff])),
    },
    {
      name: "an Item Delimitation Item before the delimiter",
      dataset: spanned(pixelHeader(), BOT, FRAGMENT, marker(0xe00d), SEQUENCE_DELIMITATION),
    },
    {
      // Framed like a 4-byte Item, so only the tag says it is not one.
      name: "a Data Element tag before the delimiter",
      dataset: spanned(
        pixelHeader(),
        BOT,
        FRAGMENT,
        Buffer.from([0x08, 0x00, 0x10, 0x00, 0x04, 0x00, 0x00, 0x00, 0x5a, 0x5a, 0x5a, 0x5a]),
        SEQUENCE_DELIMITATION,
      ),
    },
    {
      name: "an Item of undefined Item Length",
      dataset: spanned(
        pixelHeader(),
        BOT,
        marker(0xe000, UNDEFINED_LENGTH),
        FRAGMENT,
        SEQUENCE_DELIMITATION,
      ),
    },
    // Readings of AC-8 recorded in the implementation notes: each is a span that is not the
    // Item stream section A.4 describes, and emitting it would drop or invent bytes.
    {
      name: "bytes after the delimiter inside the span",
      dataset: spanned(pixelHeader(), BOT, FRAGMENT, SEQUENCE_DELIMITATION, Buffer.alloc(8)),
    },
    {
      name: "no Item at all, so no Basic Offset Table Item",
      dataset: spanned(pixelHeader(), SEQUENCE_DELIMITATION),
    },
    {
      name: "a Basic Offset Table Item and no fragment",
      dataset: spanned(pixelHeader(), BOT, SEQUENCE_DELIMITATION),
    },
    {
      name: "a span whose header declares a defined Value Length",
      dataset: spanned(pixelHeader("OB", [0, 0], 40), BOT, FRAGMENT, SEQUENCE_DELIMITATION),
    },
    {
      name: "a span whose header is not tagged (7FE0,0010)",
      dataset: spanned(
        Buffer.from([0xe0, 0x7f, 0x08, 0x00]),
        pixelHeader().subarray(4),
        BOT,
        FRAGMENT,
        SEQUENCE_DELIMITATION,
      ),
    },
    { name: "a span shorter than an element header", dataset: spanned(Buffer.from([0xe0, 0x7f])) },
  ];

  it.each(cases)("AC-8: $name", (refusal) => {
    refusesUnderEveryUid(refusal);
  });
});

describe("AC-9: an odd Item Length, or an empty fragment, is refused", () => {
  const cases: readonly Refusal[] = [
    {
      name: "an odd Basic Offset Table Item",
      dataset: parsed({ items: [Buffer.alloc(3), Buffer.alloc(16, 0xa5)] }),
    },
    {
      name: "an odd fragment Item",
      dataset: parsed({ items: [Buffer.alloc(0), Buffer.alloc(15, 0xa5)] }),
    },
    {
      name: "a zero-length last fragment",
      dataset: parsed({ items: [Buffer.alloc(0), Buffer.alloc(16, 0xa5), Buffer.alloc(0)] }),
    },
    {
      name: "a zero-length first fragment",
      dataset: parsed({ items: [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(16, 0xa5)] }),
    },
  ];

  it.each(cases)("AC-9: $name", (refusal) => {
    refusesUnderEveryUid(refusal);
  });
});

describe("AC-10: absent top-level Pixel Data, or Float / Double Float Pixel Data, is refused", () => {
  const cases: readonly Refusal[] = [
    { name: "no top-level (7FE0,0010)", dataset: parsed({ pixelDataElements: [] }) },
    {
      name: "Float Pixel Data (7FE0,0008) beside a valid fragment stream",
      dataset: (uid) =>
        parsed({
          pixelDataElements: [
            { tag: "7FE00008", vr: "OF", value: Buffer.alloc(16) },
            pixelData({ transferSyntax: uid }),
          ],
        })(uid),
    },
    {
      name: "Double Float Pixel Data (7FE0,0009) beside a valid fragment stream",
      dataset: (uid) =>
        parsed({
          pixelDataElements: [
            { tag: "7FE00009", vr: "OD", value: Buffer.alloc(16) },
            pixelData({ transferSyntax: uid }),
          ],
        })(uid),
    },
  ];

  it.each(cases)("AC-10: $name", (refusal) => {
    refusesUnderEveryUid(refusal);
  });
});

describe("AC-11: a refusal's message is built from structural constants only", () => {
  const uid = "1.2.840.10008.1.2.4.90";

  it("AC-11: INVALID_ENCAPSULATED_PIXEL_DATA is a member of SERIALIZE_ERROR_CODES", () => {
    expect(SERIALIZE_ERROR_CODES.INVALID_ENCAPSULATED_PIXEL_DATA).toBe(
      "INVALID_ENCAPSULATED_PIXEL_DATA",
    );
  });

  it("AC-11: two inputs differing only in the offending length yield identical messages", () => {
    const [a, b] = [15, 17].map((n) =>
      expectRefused(parsed({ items: [Buffer.alloc(0), Buffer.alloc(n, 0xa5)] })(uid)),
    );
    expect(a?.message).toBe(b?.message);
    expect(a?.message).not.toMatch(/\b1[57]\b/u);
  });

  it("AC-11: a fragment carrying the planted patient name does not reach the message", () => {
    const name = Buffer.from(PATIENT_NAME, "latin1");
    // Odd on purpose (the name plus one byte), so the writer refuses this very fragment.
    const ds = parsed({ items: [Buffer.alloc(0), Buffer.concat([name, Buffer.from("X")])] })(uid);
    // Control: the fragment the writer reads does carry the name.
    expect(readPixelDataFragments(ds)?.fragments[0]?.includes(name)).toBe(true);
    const err = expectRefused(ds);
    expect(err.message).not.toContain(PATIENT_NAME);
    expect(Buffer.from(err.message, "latin1").includes(name)).toBe(false);
  });
});

describe("AC-12: UIDs outside the native and A.4 sets keep their published codes", () => {
  /** The fixture's Data Set, valid fragment stream included, under `transferSyntaxUID`. */
  function under(transferSyntaxUID: string | undefined): Dataset {
    const ds = parseDicom(encapsulatedObject({ transferSyntax: "1.2.840.10008.1.2.4.50" }));
    return new Dataset({
      ...(transferSyntaxUID !== undefined ? { fileMeta: { transferSyntaxUID } } : {}),
      warnings: [],
      elements: new Map(ds.elements().map((el) => [el.tag, el])),
    });
  }

  it.each(["1.2.840.10008.1.2.4.94", "1.2.840.10008.1.2.4.52"])(
    "AC-12: %s throws UNSUPPORTED_TRANSFER_SYNTAX",
    (outside) => {
      expect(ENCAPSULATION_SET).not.toContain(outside);
      const { out, err } = attempt(under(outside));
      expect(out).toBeUndefined();
      expect(err).toBeInstanceOf(DicomSerializeError);
      expect((err as DicomSerializeError).code).toBe(
        SERIALIZE_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX,
      );
    },
  );

  it.each([undefined, ""])(
    "AC-12: a missing Transfer Syntax UID (%j) throws MISSING_TRANSFER_SYNTAX",
    (missing) => {
      const { out, err } = attempt(under(missing));
      expect(out).toBeUndefined();
      expect(err).toBeInstanceOf(DicomSerializeError);
      expect((err as DicomSerializeError).code).toBe(SERIALIZE_ERROR_CODES.MISSING_TRANSFER_SYNTAX);
    },
  );
});

describe("AC-13: Pixel Data nested in a Sequence Item is written as read", () => {
  const us = (n: number): Buffer => Buffer.from([n & 0xff, (n >> 8) & 0xff]);
  const NESTED = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  /** An Icon Image Sequence Item carrying a native 2x2, 8-bit Pixel Data. */
  const iconImageSequence: BuildDicomSqElement = {
    tag: "00880200",
    items: [
      {
        elements: [
          { tag: "00280002", vr: "US", value: us(1) },
          { tag: "00280004", vr: "CS", value: Buffer.from("MONOCHROME2 ", "ascii") },
          { tag: "00280010", vr: "US", value: us(2) },
          { tag: "00280011", vr: "US", value: us(2) },
          { tag: "00280100", vr: "US", value: us(8) },
          { tag: "00280101", vr: "US", value: us(8) },
          { tag: "00280102", vr: "US", value: us(7) },
          { tag: "00280103", vr: "US", value: us(0) },
          { tag: PIXEL_DATA, vr: "OB", value: NESTED },
        ],
      },
    ],
  };

  it.each(ENCAPSULATION_SET)("AC-13: %s", (uid) => {
    const source = parseDicom(
      encapsulatedObject({
        transferSyntax: uid,
        pixelDataElements: [iconImageSequence, pixelData({ transferSyntax: uid })],
      }),
    );
    const nestedIn = (ds: Dataset): Buffer | undefined =>
      ds.get("00880200")?.items?.[0]?.get(PIXEL_DATA)?.rawBytes;
    // Control: the source does hold a native Pixel Data inside the Item.
    expect(nestedIn(source)?.equals(NESTED)).toBe(true);

    const { out, err } = attempt(source);
    expect(err).toBeUndefined();
    const reread = parseDicom(out as Buffer);
    expect(nestedIn(reread)?.equals(NESTED)).toBe(true);
    expect(readPixelDataFragments(reread)?.fragments).toHaveLength(1);
  });
});

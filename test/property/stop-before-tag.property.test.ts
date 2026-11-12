/**
 * The stop of `ParseOptions.stopBeforeTag` loses nothing before it: on generated files under each
 * native transfer syntax, a parse that stops holds exactly the top-level elements of a full parse
 * whose tag is before the stop, byte for byte and at the same offsets, and its warnings are the full
 * parse's up to that point followed by the one stop warning. `readDicomHeader` over a stream cut
 * into chunks of any size gives the same Dataset.
 *
 * Every file is generated in code from made-up values.
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  parseDicom,
  WARNING_CODES,
  type Dataset,
  type DicomParseWarning,
} from "../../src/index.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";
import { buildDicomdir, twoPatientRecords, type OffsetSpec } from "../helpers/build-dicomdir.js";
import { readHeaderFrom } from "../../src/parser/read-header.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";
const DEFLATED_LE = "1.2.840.10008.1.2.1.99";

type Built = BuildDicomElement | BuildDicomSqElement;

function text(value: string): Buffer {
  return Buffer.from(value.length % 2 === 0 ? value : `${value} `, "latin1");
}

/** Header elements, each with a value of the shape its VR takes. */
const HEADER: readonly (readonly [string, BuildDicomElement["vr"], string])[] = [
  ["00080016", "UI", "1.2.840.10008.5.1.4.1.1.2"],
  ["00080018", "UI", "2.25.4444"],
  ["00080060", "CS", "CT"],
  ["00100010", "PN", "TEST^PATIENT"],
  ["00100020", "LO", "FAKE-0003"],
  ["00100030", "DA", "19000101"],
  ["0020000D", "UI", "2.25.5555"],
  ["0020000E", "UI", "2.25.6666"],
  ["00280010", "US", "\u0004\u0000"],
  ["00280011", "US", "\u0004\u0000"],
  ["7FE00001", "OV", "\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"],
];

/** Tags worth stopping at: each header tag, the gaps around them, Pixel Data, padding, and none. */
const STOPS: readonly string[] = [
  "00000000",
  "00080000",
  "00080017",
  "00081115",
  "00081116",
  "00090000",
  "00100020",
  "0020000D",
  "00280000",
  "7FE00000",
  "7FE00008",
  "7FE00010",
  "7FE00011",
  "FFFCFFFC",
  "FFFFFFFF",
];

interface Shape {
  readonly ts: string;
  readonly header: readonly boolean[];
  readonly sequence: boolean;
  readonly privateBlock: boolean;
  readonly pixel: "none" | "native" | "encapsulated";
  readonly pixelBytes: number;
  readonly padding: boolean;
}

const shapeArb: fc.Arbitrary<Shape> = fc
  .record({
    ts: fc.constantFrom(IMPLICIT_LE, EXPLICIT_LE, EXPLICIT_BE, DEFLATED_LE),
    header: fc.array(fc.boolean(), { minLength: HEADER.length, maxLength: HEADER.length }),
    sequence: fc.boolean(),
    privateBlock: fc.boolean(),
    pixel: fc.constantFrom("none" as const, "native" as const, "encapsulated" as const),
    pixelBytes: fc.integer({ min: 0, max: 4096 }).map((n) => n * 2),
    padding: fc.boolean(),
  })
  // Encapsulated Pixel Data is an Explicit VR Little Endian form (PS3.5 2026c section A.4).
  .map((s) => (s.pixel === "encapsulated" && s.ts !== EXPLICIT_LE ? { ...s, pixel: "native" } : s));

function elementsOf(shape: Shape): Built[] {
  const out: Built[] = HEADER.filter((_h, i) => shape.header[i] === true).map(
    ([tag, vr, value]): BuildDicomElement => ({ tag, vr, value: text(value) }),
  );
  if (shape.sequence) out.push(sequence());
  if (shape.privateBlock) out.push(...privateBlock());
  out.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  if (shape.pixel === "native") {
    out.push({ tag: "7FE00010", vr: "OW", value: Buffer.alloc(shape.pixelBytes, 0x33) });
  } else if (shape.pixel === "encapsulated") {
    out.push({
      tag: "7FE00010",
      undefinedLength: true,
      items: [],
      encapsulatedPixelData: true,
      encapsulatedFragments: [Buffer.alloc(0), Buffer.alloc(shape.pixelBytes, 0x44)],
    });
  }
  if (shape.padding) out.push({ tag: "FFFCFFFC", vr: "OB", value: Buffer.alloc(6) });
  return out;
}

/** A sequence whose Item holds tags past many stops: only the top level stops. */
function sequence(): BuildDicomSqElement {
  return {
    tag: "00081115",
    items: [
      {
        elements: [
          { tag: "0020000E", vr: "UI", value: text("2.25.7777") },
          { tag: "7FE00010", vr: "OW", value: Buffer.alloc(4, 0x11) },
        ],
      },
    ],
  };
}

function privateBlock(): BuildDicomElement[] {
  return [
    { tag: "00090010", vr: "LO", value: text("FAKE VENDOR") },
    { tag: "00091001", vr: "OB", value: Buffer.alloc(4, 0x22) },
  ];
}

function tagNumber(tag: string): number {
  return Number.parseInt(tag, 16);
}

function rows(ds: Dataset): unknown[] {
  return ds
    .elements()
    .map((e) => [e.tag, e.vr, e.length, e.byteOffset, e.rawBytes.toString("hex")]);
}

function summary(ds: Dataset): unknown {
  return { meta: ds.fileMeta, rows: rows(ds), warnings: ds.warnings };
}

function stream(bytes: Buffer, size: number): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let at = 0; at < bytes.length; at += size) {
        await Promise.resolve();
        yield bytes.subarray(at, at + size);
      }
    },
  };
}

function codes(ws: readonly DicomParseWarning[]): string[] {
  return ws.map((w) => w.code);
}

/**
 * The stopped parse of `bytes` holds the full parse's top-level elements before the stop, byte for
 * byte, and the full parse's warnings up to that point followed by the one stop warning.
 */
function expectStoppedMatchesFull(bytes: Buffer, stopTag: string): void {
  const full = parseDicom(bytes);
  const stopped = parseDicom(bytes, { stopBeforeTag: stopTag });
  const stop = tagNumber(stopTag);

  const before = full.elements().filter((e) => tagNumber(e.tag) < stop);
  expect(rows(stopped)).toEqual(
    before.map((e) => [e.tag, e.vr, e.length, e.byteOffset, e.rawBytes.toString("hex")]),
  );
  expect(stopped.fileMeta).toEqual(full.fileMeta);

  const reached = full.elements().find((e) => tagNumber(e.tag) >= stop);
  if (reached === undefined) {
    expect(codes(stopped.warnings)).toEqual(codes(full.warnings));
    return;
  }
  const last = stopped.warnings.at(-1);
  expect(last?.code).toBe(WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG);
  expect(last?.position.byteOffset).toBe(reached.byteOffset);
  const earlier = stopped.warnings.slice(0, -1);
  expect(full.warnings.slice(0, earlier.length)).toEqual(earlier);
}

/** Tags worth stopping at in a DICOMDIR: each root attribute, the gaps around them, and none. */
const DICOMDIR_STOPS: readonly string[] = [
  "00040000",
  "00041130",
  "00041200",
  "00041201",
  "00041202",
  "00041212",
  "00041213",
  "00041220",
  "00041221",
  "7FE00010",
  "FFFFFFFF",
];

/** Where a root offset points: a record, none, inside a record, or past the end of the file. */
const rootOffsetArb: fc.Arbitrary<OffsetSpec> = fc.oneof(
  fc.integer({ min: 0, max: 9 }),
  fc.constantFrom<OffsetSpec>("zero", "pastEnd", "sequenceHeader", { midRecord: 0 }),
);

const dicomdirArb = fc.record({
  ts: fc.constantFrom(IMPLICIT_LE, EXPLICIT_LE, EXPLICIT_BE, DEFLATED_LE),
  firstRoot: rootOffsetArb,
  lastRoot: rootOffsetArb,
  sequenceUndefinedLength: fc.boolean(),
});

describe("stopBeforeTag keeps everything before the stop byte for byte", () => {
  it("matches a full parse's elements before the stop, and its warnings up to it", () => {
    fc.assert(
      fc.property(shapeArb, fc.constantFrom(...STOPS), (shape, stopTag) => {
        const bytes = buildDicom({ transferSyntax: shape.ts, elements: elementsOf(shape) });
        expectStoppedMatchesFull(bytes, stopTag);
      }),
      { numRuns: 300 },
    );
  });

  it("matches a full parse on a DICOMDIR, whose record offsets are checked after the walk", () => {
    // A stop inside group 0004 can fall before the Directory Record Sequence the root offsets
    // name; the stopped parse must not report those offsets against records it never read.
    fc.assert(
      fc.property(dicomdirArb, fc.constantFrom(...DICOMDIR_STOPS), (dir, stopTag) => {
        const { bytes } = buildDicomdir({
          transferSyntax: dir.ts,
          ...twoPatientRecords(),
          firstRoot: dir.firstRoot,
          lastRoot: dir.lastRoot,
          sequenceUndefinedLength: dir.sequenceUndefinedLength,
        });
        expectStoppedMatchesFull(bytes, stopTag);
      }),
      { numRuns: 200 },
    );
  });

  it("readDicomHeader over a stream in chunks of any size gives the Dataset parseDicom gives", async () => {
    // The first read is made small here, so the prefixes tried cut the file at every kind of place:
    // inside File Meta, inside a header, inside a value, inside a Sequence Item.
    await fc.assert(
      fc.asyncProperty(
        shapeArb,
        fc.constantFrom(...STOPS),
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1, max: 400 }),
        async (shape, stopTag, size, firstRead) => {
          const bytes = buildDicom({ transferSyntax: shape.ts, elements: elementsOf(shape) });
          const expected = summary(parseDicom(bytes, { stopBeforeTag: stopTag }));
          const ds = await readHeaderFrom(
            stream(bytes, size),
            { stopBeforeTag: stopTag },
            firstRead,
          );
          expect(summary(ds)).toEqual(expected);
        },
      ),
      { numRuns: 150 },
    );
  });
});

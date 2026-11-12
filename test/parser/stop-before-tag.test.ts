/**
 * `ParseOptions.stopBeforeTag`: the parse ends before the first top-level Data Element whose tag is
 * at or after the one asked for, says so with `DICOM_PARSE_STOPPED_BEFORE_TAG`, and everything it
 * read before that point is what a full parse reads.
 *
 * Every file here is built in code from made-up values.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  defineProfile,
  DicomParseError,
  parseDicom,
  WARNING_CODES,
  type Dataset,
  type DicomParseWarning,
} from "../../src/index.js";
import { WARNING_MESSAGES } from "../../src/parser/warnings.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";
import {
  buildDicomdir,
  twoPatientRecords,
  TS_DEFLATED_LE,
  TS_EXPLICIT_BE,
  TS_EXPLICIT_LE,
  TS_IMPLICIT_LE,
} from "../helpers/build-dicomdir.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";
const DEFLATED_LE = "1.2.840.10008.1.2.1.99";
const SYNTAXES = [IMPLICIT_LE, EXPLICIT_LE, EXPLICIT_BE, DEFLATED_LE] as const;

const PIXEL_DATA = "7FE00010";

function text(value: string): Buffer {
  return Buffer.from(value.length % 2 === 0 ? value : `${value} `, "latin1");
}

function us(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

/** A header of made-up values, a nested sequence whose Item holds a tag past the stop, Pixel Data, and trailing padding. */
function elements(pixelBytes: number): (BuildDicomElement | BuildDicomSqElement)[] {
  return [
    { tag: "00080060", vr: "CS", value: text("CT") },
    {
      tag: "00081115",
      items: [
        {
          elements: [
            { tag: "0020000E", vr: "UI", value: text("2.25.111") },
            // Inside an Item, a tag past the stop is read: only the top level stops.
            { tag: "7FE00010", vr: "OW", value: Buffer.alloc(4, 0x11) },
          ],
        },
      ],
    },
    { tag: "00100010", vr: "PN", value: text("TEST^PATIENT") },
    { tag: "00100020", vr: "LO", value: text("FAKE-0001") },
    { tag: "0020000D", vr: "UI", value: text("2.25.222") },
    { tag: "00280010", vr: "US", value: us(4) },
    { tag: "00280011", vr: "US", value: us(4) },
    { tag: PIXEL_DATA, vr: "OW", value: Buffer.alloc(pixelBytes, 0x5a) },
    { tag: "FFFCFFFC", vr: "OB", value: Buffer.alloc(8) },
  ];
}

function file(transferSyntax: string, pixelBytes = 32): Buffer {
  return buildDicom({ transferSyntax, elements: elements(pixelBytes) });
}

interface Row {
  readonly tag: string;
  readonly vr: string;
  readonly byteOffset: number;
  readonly length: number;
  readonly raw: string;
}

function rows(ds: Dataset): Row[] {
  return ds.elements().map((e) => ({
    tag: e.tag,
    vr: e.vr,
    byteOffset: e.byteOffset,
    length: e.length,
    raw: e.rawBytes.toString("hex"),
  }));
}

function codes(ws: readonly DicomParseWarning[]): string[] {
  return ws.map((w) => w.code);
}

describe("parseDicom with stopBeforeTag", () => {
  for (const ts of SYNTAXES) {
    describe(`under ${ts}`, () => {
      it("stops before Pixel Data and keeps every element before it byte for byte", () => {
        const bytes = file(ts);
        const full = parseDicom(bytes);
        const stopped = parseDicom(bytes, { stopBeforeTag: PIXEL_DATA });

        const pixel = full.get(PIXEL_DATA);
        expect(pixel).toBeDefined();
        expect(stopped.get(PIXEL_DATA)).toBeUndefined();
        expect(stopped.get("FFFCFFFC")).toBeUndefined();
        expect(rows(stopped)).toEqual(rows(full).filter((r) => r.tag < PIXEL_DATA));
        expect(rows(stopped).map((r) => r.tag)).toContain("00100010");

        // The nested Item still holds the tag past the stop.
        const item = stopped.get("00081115")?.items?.[0];
        expect(item?.get(PIXEL_DATA)).toBeDefined();

        expect(codes(stopped.warnings)).toEqual([
          ...codes(full.warnings),
          WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG,
        ]);
        const last = stopped.warnings.at(-1);
        expect(last?.position.byteOffset).toBe(pixel?.byteOffset);
        expect(last?.message).toBe(
          WARNING_MESSAGES.DICOM_PARSE_STOPPED_BEFORE_TAG.replace("{tag}", "7FE00010"),
        );
        if (ts === DEFLATED_LE) expect(last?.position.deflated).toBe(true);
      });
    });
  }

  it("stops at the first top-level tag at or after the one asked for, not only an exact match", () => {
    const bytes = file(EXPLICIT_LE);
    const stopped = parseDicom(bytes, { stopBeforeTag: "00100015" });
    expect(rows(stopped).map((r) => r.tag)).toEqual(["00080060", "00081115", "00100010"]);
    expect(stopped.warnings.at(-1)?.message).toContain("(00100020)");
  });

  it("accepts lower-case hexadecimal", () => {
    const bytes = file(EXPLICIT_LE);
    const upper = parseDicom(bytes, { stopBeforeTag: "7FE00010" });
    const lower = parseDicom(bytes, { stopBeforeTag: "7fe00010" });
    expect(rows(lower)).toEqual(rows(upper));
  });

  it("can stop before the first element of the Data Set, keeping the File Meta", () => {
    const stopped = parseDicom(file(IMPLICIT_LE), { stopBeforeTag: "00000000" });
    expect(stopped.elements()).toHaveLength(0);
    expect(stopped.fileMeta?.transferSyntaxUID).toBe(IMPLICIT_LE);
    expect(codes(stopped.warnings)).toEqual([WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG]);
  });

  it("reads the whole file, with no warning, when no top-level tag reaches the stop", () => {
    const bytes = file(EXPLICIT_LE);
    const full = parseDicom(bytes);
    const stopped = parseDicom(bytes, { stopBeforeTag: "FFFFFFFF" });
    expect(rows(stopped)).toEqual(rows(full));
    expect(codes(stopped.warnings)).toEqual(codes(full.warnings));
  });

  it("is never escalated, under strict mode or by a profile", () => {
    const bytes = file(EXPLICIT_LE);
    const strict = parseDicom(bytes, { strict: true, stopBeforeTag: PIXEL_DATA });
    expect(codes(strict.warnings)).toEqual([WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG]);
    const escalating = defineProfile({
      name: "escalates-the-stop",
      escalate: [WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG],
    });
    const withProfile = parseDicom(bytes, { profile: escalating, stopBeforeTag: PIXEL_DATA });
    expect(codes(withProfile.warnings)).toContain(WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG);
  });

  it("hands the warning to onWarning", () => {
    const seen: string[] = [];
    parseDicom(file(EXPLICIT_LE), {
      stopBeforeTag: PIXEL_DATA,
      onWarning: (w) => seen.push(w.code),
    });
    expect(seen).toEqual([WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG]);
  });

  it("does not read the bytes past the stop: a value that runs off the end is never reached", () => {
    const bytes = file(EXPLICIT_LE, 64);
    // Cut the file inside Pixel Data: a full parse refuses it, the stopped parse never looks.
    const cut = bytes.subarray(0, bytes.length - 40);
    expect(() => parseDicom(cut)).toThrow(DicomParseError);
    const stopped = parseDicom(cut, { stopBeforeTag: PIXEL_DATA });
    expect(rows(stopped)).toEqual(rows(parseDicom(bytes)).filter((r) => r.tag < PIXEL_DATA));
  });

  it("leaves a header cut inside its first four bytes, and a delimiter at the top level, to the reader's own fatals", () => {
    const bytes = file(EXPLICIT_LE);
    const pixelAt = parseDicom(bytes).get(PIXEL_DATA)?.byteOffset ?? 0;
    const cut = bytes.subarray(0, pixelAt + 2);
    expect(() => parseDicom(cut, { stopBeforeTag: "FFFFFFFF" })).toThrow(DicomParseError);
    const delimiter = Buffer.from([0xfe, 0xff, 0x0d, 0xe0, 0, 0, 0, 0]);
    const withDelimiter = buildDicom({
      transferSyntax: IMPLICIT_LE,
      elements: [{ tag: "00080060", vr: "CS", value: text("CT") }],
      trailingBytes: delimiter,
    });
    expect(() => parseDicom(withDelimiter, { stopBeforeTag: "00100000" })).toThrow(DicomParseError);
  });

  it("refuses a stop tag that is not eight hexadecimal digits, without echoing it", () => {
    expect(() =>
      parseDicom(file(EXPLICIT_LE), { stopBeforeTag: 0x7fe00010 as unknown as string }),
    ).toThrow(TypeError);
    for (const bad of ["7FE0001", "7FE0,0010", "(7FE0,0010)", "", "7FE00010 ", "GGGGGGGG"]) {
      expect(() => parseDicom(file(EXPLICIT_LE), { stopBeforeTag: bad })).toThrow(TypeError);
    }
    try {
      parseDicom(file(EXPLICIT_LE), { stopBeforeTag: "NOT-A-TAG-TOKEN" });
    } catch (err) {
      expect((err as Error).message).not.toContain("NOT-A-TAG");
    }
  });
});

describe("parseDicom with stopBeforeTag on a DICOMDIR", () => {
  // The Directory Record Sequence (0004,1220) holds the records the root offsets (0004,1200) and
  // (0004,1202) name. A parse that stops before it never reads those records, so it has nothing to
  // resolve the offsets against, and must not report them as unresolved.
  const RECORD_SEQUENCE = "00041220";
  const DIRECTORY_CODES: readonly string[] = [
    WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED,
    WARNING_CODES.DICOM_DIRECTORY_OFFSET_MALFORMED,
    WARNING_CODES.DICOM_DIRECTORY_RECORD_REVISITED,
    WARNING_CODES.DICOM_DIRECTORY_OFFSET_DEFLATED,
  ];

  for (const ts of [TS_IMPLICIT_LE, TS_EXPLICIT_LE, TS_EXPLICIT_BE, TS_DEFLATED_LE]) {
    it(`stopped before the Directory Record Sequence under ${ts}, ends with the stop alone`, () => {
      const { bytes } = buildDicomdir({ transferSyntax: ts, ...twoPatientRecords() });
      const full = parseDicom(bytes);
      const stopped = parseDicom(bytes, { stopBeforeTag: RECORD_SEQUENCE });

      expect(rows(stopped)).toEqual(rows(full).filter((r) => r.tag < RECORD_SEQUENCE));
      expect(rows(stopped).map((r) => r.tag)).toContain("00041200");
      const fullBefore = codes(full.warnings).filter((c) => !DIRECTORY_CODES.includes(c));
      expect(codes(stopped.warnings)).toEqual([
        ...fullBefore,
        WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG,
      ]);
    });
  }

  it("parses under strict mode when the full parse does", () => {
    const { bytes } = buildDicomdir({ transferSyntax: TS_EXPLICIT_LE, ...twoPatientRecords() });
    expect(codes(parseDicom(bytes, { strict: true }).warnings)).toEqual([]);
    const stopped = parseDicom(bytes, { strict: true, stopBeforeTag: RECORD_SEQUENCE });
    expect(codes(stopped.warnings)).toEqual([WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG]);
  });

  it("still reports the offsets of a DICOMDIR the stop does not reach", () => {
    // No top-level element reaches the stop, so the parse is a full one and checks the offsets.
    const { bytes } = buildDicomdir({
      transferSyntax: TS_EXPLICIT_LE,
      ...twoPatientRecords(),
      firstRoot: "pastEnd",
    });
    const full = parseDicom(bytes);
    expect(codes(full.warnings)).toContain(WARNING_CODES.DICOM_DIRECTORY_OFFSET_UNRESOLVED);
    const unstopped = parseDicom(bytes, { stopBeforeTag: "7FE00010" });
    expect(codes(unstopped.warnings)).toEqual(codes(full.warnings));
  });
});

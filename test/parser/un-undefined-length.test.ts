/**
 * A `UN` element with undefined length (the CP-246 shape) under `{ copyValues: true }` and inside
 * a reserved private block: whether the parser reads it as a Sequence or falls back to raw bytes,
 * the element's `rawBytes` must survive the input being overwritten, and a private element must
 * keep the Private Creator its block resolves to.
 *
 * Every byte is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { WARNING_CODES, defineProfile, parseDicom } from "../../src/index.js";
import { WITHHELD } from "../../src/parser/tokens.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const UNDEFINED_LENGTH = 0xffffffff;

function tagBytes(group: number, element: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt16LE(group, 0);
  out.writeUInt16LE(element, 2);
  return out;
}

function u32(n: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(n, 0);
  return out;
}

/** An Explicit VR LE `UN` header with undefined length. */
function explicitUnHeader(group: number, element: number): Buffer {
  return Buffer.concat([
    tagBytes(group, element),
    Buffer.from("UN", "ascii"),
    Buffer.alloc(2),
    u32(UNDEFINED_LENGTH),
  ]);
}

/** An Implicit VR LE header with undefined length. */
function implicitHeader(group: number, element: number): Buffer {
  return Buffer.concat([tagBytes(group, element), u32(UNDEFINED_LENGTH)]);
}

/** An Implicit VR LE item stream: one Item holding `(0008,0100) "CODE"`, then the delimiter. */
function implicitItemStream(): Buffer {
  const inner = Buffer.concat([tagBytes(0x0008, 0x0100), u32(4), Buffer.from("CODE", "ascii")]);
  return Buffer.concat([
    tagBytes(0xfffe, 0xe000),
    u32(inner.length),
    inner,
    tagBytes(0xfffe, 0xe0dd),
    u32(0),
  ]);
}

/** Bytes no reader can take for an item stream. */
const GARBAGE = Buffer.from([
  0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55,
]);

/** An Explicit VR LE Private Creator `(0009,0010) LO "ACME"`. */
function explicitCreator(): Buffer {
  const value = Buffer.from("ACME", "ascii");
  const head = Buffer.alloc(8);
  head.writeUInt16LE(0x0009, 0);
  head.writeUInt16LE(0x0010, 2);
  head.write("LO", 4, "ascii");
  head.writeUInt16LE(value.length, 6);
  return Buffer.concat([head, value]);
}

function file(transferSyntax: string, dataSetBytes: Buffer): Buffer {
  return buildDicom({ transferSyntax, elements: [], dataSetBytes });
}

/** `rawBytes` is unchanged after every byte of the input is overwritten. */
function survivesOverwrite(input: Buffer, read: () => Buffer | undefined): boolean {
  const before = Buffer.from(read() ?? Buffer.alloc(0));
  input.fill(0xff);
  return before.length > 0 && read()?.equals(before) === true;
}

describe("Explicit VR LE: a UN with undefined length", () => {
  it("read as a Sequence, keeps its bytes under copyValues", () => {
    const input = file(
      TS_EXPLICIT_LE,
      Buffer.concat([explicitUnHeader(0x0040, 0xa730), implicitItemStream()]),
    );
    const ds = parseDicom(input, { copyValues: true });
    const el = ds.get("0040A730");
    expect(el?.vr).toBe("SQ");
    expect(el?.cp246Promoted).toBe(true);
    expect(survivesOverwrite(input, () => el?.rawBytes)).toBe(true);
  });

  it("read as raw bytes, keeps its bytes under copyValues", () => {
    const input = file(TS_EXPLICIT_LE, Buffer.concat([explicitUnHeader(0x0040, 0xa730), GARBAGE]));
    const ds = parseDicom(input, { copyValues: true });
    const el = ds.get("0040A730");
    expect(el?.vr).toBe("UN");
    expect(survivesOverwrite(input, () => el?.rawBytes)).toBe(true);
  });

  it("in a reserved private block, read as a Sequence, carries its Private Creator", () => {
    const input = file(
      TS_EXPLICIT_LE,
      Buffer.concat([explicitCreator(), explicitUnHeader(0x0009, 0x1000), implicitItemStream()]),
    );
    const profile = defineProfile({
      name: "acme",
      privateTags: { ACME: { "0009XX00": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } } },
    });

    const named = parseDicom(input, { profile }).get("00091000");
    const unnamed = parseDicom(input).get("00091000");

    expect(named?.vr).toBe("SQ");
    expect(named?.items?.[0]?.get("00080100")?.rawBytes.toString("ascii")).toBe("CODE");
    // A creator a profile names is shown; one no profile names is withheld, never echoed.
    expect(named?.privateCreator).toBe("ACME");
    expect(unnamed?.vr).toBe("SQ");
    expect(unnamed?.privateCreator).toBe(WITHHELD);
  });
});

describe("Implicit VR LE: a private element with undefined length, resolved to UN", () => {
  it("read as a Sequence, keeps its bytes under copyValues", () => {
    const input = file(
      TS_IMPLICIT_LE,
      Buffer.concat([implicitHeader(0x0009, 0x1000), implicitItemStream()]),
    );
    const ds = parseDicom(input, { copyValues: true });
    const el = ds.get("00091000");
    expect(el?.vr).toBe("SQ");
    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_UN_PARSED_AS_SQ);
    expect(survivesOverwrite(input, () => el?.rawBytes)).toBe(true);
  });
});

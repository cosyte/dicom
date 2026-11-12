/**
 * `readDicomHeader`: the header of a file from a path, a file handle or a stream, read only as far
 * as the stop tag, and the same Dataset `parseDicom` gives on the whole file with that stop.
 *
 * Every file here is built in code from made-up values.
 */

import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  DicomParseError,
  parseDicom,
  readDicomHeader,
  WARNING_CODES,
  type Dataset,
  type DicomFileHandle,
  type ParseOptions,
} from "../../src/index.js";
import { buildDicom, type BuildDicomElement } from "../helpers/build-dicom.js";

const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const IMPLICIT_LE = "1.2.840.10008.1.2";
const DEFLATED_LE = "1.2.840.10008.1.2.1.99";

function text(value: string): Buffer {
  return Buffer.from(value.length % 2 === 0 ? value : `${value} `, "latin1");
}

/** A header of made-up values, `pixelBytes` of Pixel Data, and trailing padding. */
function file(transferSyntax: string, pixelBytes: number, headerPadBytes = 0): Buffer {
  const elements: BuildDicomElement[] = [
    { tag: "00080060", vr: "CS", value: text("MR") },
    { tag: "00100010", vr: "PN", value: text("TEST^PATIENT") },
    { tag: "00100020", vr: "LO", value: text("FAKE-0002") },
    { tag: "0020000D", vr: "UI", value: text("2.25.333") },
    // A long header, to cross the first read when asked to.
    { tag: "0040A160", vr: "UT", value: Buffer.alloc(headerPadBytes, 0x41) },
    { tag: "7FE00010", vr: "OW", value: Buffer.alloc(pixelBytes, 0x5a) },
    { tag: "FFFCFFFC", vr: "OB", value: Buffer.alloc(16) },
  ];
  return buildDicom({ transferSyntax, elements });
}

function summary(ds: Dataset): unknown {
  return {
    fileMeta: ds.fileMeta?.transferSyntaxUID,
    elements: ds.elements().map((e) => [e.tag, e.vr, e.byteOffset, e.rawBytes.toString("hex")]),
    warnings: ds.warnings,
  };
}

/** A handle over a buffer that records the furthest byte any read reached. */
function countingHandle(bytes: Buffer): DicomFileHandle & { furthest: number } {
  const handle = {
    furthest: 0,
    read(buffer: Uint8Array, offset: number, length: number, position: number) {
      const end = Math.min(bytes.length, position + length);
      const n = Math.max(0, end - position);
      if (n > 0) buffer.set(bytes.subarray(position, end), offset);
      handle.furthest = Math.max(handle.furthest, position + n);
      return Promise.resolve({ bytesRead: n });
    },
  };
  return handle;
}

/** An async iterable over `bytes` in chunks of `size`, counting the chunks pulled and whether it was ended early. */
function chunked(bytes: Buffer, size: number) {
  const state = { pulled: 0, returned: false };
  const iterable: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      let at = 0;
      return {
        next() {
          if (at >= bytes.length) return Promise.resolve({ done: true, value: undefined });
          const chunk = bytes.subarray(at, at + size);
          at += size;
          state.pulled++;
          return Promise.resolve({ done: false, value: chunk });
        },
        return() {
          state.returned = true;
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
  return { iterable, state };
}

const dir = mkdtempSync(join(tmpdir(), "dicom-read-header-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readDicomHeader", () => {
  const big = file(EXPLICIT_LE, 8 * 1024 * 1024);
  const bigPath = join(dir, "big.dcm");
  writeFileSync(bigPath, big);

  it("reads a path, a file URL, a file handle and a stream to the same Dataset parseDicom gives", async () => {
    const expected = summary(parseDicom(big, { stopBeforeTag: "7FE00008" }));
    expect(summary(await readDicomHeader(bigPath))).toEqual(expected);
    expect(summary(await readDicomHeader(pathToFileURL(bigPath)))).toEqual(expected);
    const handle = await open(bigPath);
    try {
      expect(summary(await readDicomHeader(handle))).toEqual(expected);
    } finally {
      await handle.close();
    }
    expect(summary(await readDicomHeader(Readable.from([big])))).toEqual(expected);
    const last = (await readDicomHeader(bigPath)).warnings.at(-1);
    expect(last?.code).toBe(WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG);
  });

  it("does not read the Pixel Data: 8 MiB of it, and only the first 64 KiB of the file is read", async () => {
    const handle = countingHandle(big);
    const ds = await readDicomHeader(handle);
    expect(ds.has("7FE00010")).toBe(false);
    expect(ds.has("00100010")).toBe(true);
    expect(handle.furthest).toBe(64 * 1024);
  });

  it("reads more, twice as much each time, when the header is longer than the first read", async () => {
    const long = file(EXPLICIT_LE, 4 * 1024 * 1024, 150 * 1024);
    const handle = countingHandle(long);
    const ds = await readDicomHeader(handle);
    expect(summary(ds)).toEqual(summary(parseDicom(long, { stopBeforeTag: "7FE00008" })));
    expect(handle.furthest).toBe(256 * 1024);
  });

  it("ends a stream early once the stop is found", async () => {
    const { iterable, state } = chunked(big, 4096);
    await readDicomHeader(iterable);
    expect(state.returned).toBe(true);
    expect(state.pulled).toBe(16);
  });

  it("gives the same Dataset whatever the chunk sizes of the stream", async () => {
    const long = file(IMPLICIT_LE, 300 * 1024, 70 * 1024);
    const expected = summary(parseDicom(long, { stopBeforeTag: "7FE00008" }));
    for (const size of [1, 7, 1000, 65_536, 65_537, 1_000_000]) {
      const { iterable } = chunked(long, size);
      expect(summary(await readDicomHeader(iterable))).toEqual(expected);
    }
  });

  it("takes another stop tag and the other parse options", async () => {
    const seen: string[] = [];
    const options: ParseOptions = {
      stopBeforeTag: "00100020",
      onWarning: (w) => seen.push(w.code),
    };
    const ds = await readDicomHeader(countingHandle(big), options);
    expect(summary(ds)).toEqual(summary(parseDicom(big, { stopBeforeTag: "00100020" })));
    // Called once for each warning of the parse it kept, not once for each prefix tried.
    expect(seen).toEqual([WARNING_CODES.DICOM_PARSE_STOPPED_BEFORE_TAG]);
  });

  it("reads the whole file when nothing reaches the stop tag", async () => {
    const small = file(EXPLICIT_LE, 1024);
    const ds = await readDicomHeader(countingHandle(small), { stopBeforeTag: "FFFFFFFF" });
    expect(summary(ds)).toEqual(summary(parseDicom(small)));
  });

  it("reads a Deflated file whole, to the same Dataset", async () => {
    const deflated = file(DEFLATED_LE, 200 * 1024);
    const handle = countingHandle(deflated);
    const ds = await readDicomHeader(handle);
    expect(summary(ds)).toEqual(summary(parseDicom(deflated, { stopBeforeTag: "7FE00008" })));
    expect(handle.furthest).toBe(deflated.length);
  });

  it("throws the error parseDicom throws on the whole file", async () => {
    await expect(readDicomHeader(countingHandle(Buffer.alloc(0)))).rejects.toMatchObject({
      code: "EMPTY_INPUT",
    });
    const notDicom = Buffer.alloc(200_000, 0x41);
    await expect(readDicomHeader(countingHandle(notDicom))).rejects.toBeInstanceOf(DicomParseError);
  });

  it("skips empty chunks, and ends a stream whose iterator has no return", async () => {
    const pieces = [
      Buffer.alloc(0),
      big.subarray(0, 100_000),
      Buffer.alloc(0),
      big.subarray(100_000),
    ];
    let at = 0;
    const noReturn: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            const value = pieces[at++];
            return Promise.resolve(
              value === undefined ? { done: true, value: undefined } : { done: false, value },
            );
          },
        };
      },
    };
    const ds = await readDicomHeader(noReturn);
    expect(summary(ds)).toEqual(summary(parseDicom(big, { stopBeforeTag: "7FE00008" })));
  });

  it("refuses a malformed stop tag and an unknown source before reading", async () => {
    await expect(readDicomHeader(null as unknown as string)).rejects.toBeInstanceOf(TypeError);
    const handle = countingHandle(big);
    await expect(readDicomHeader(handle, { stopBeforeTag: "PIXEL" })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(handle.furthest).toBe(0);
    await expect(readDicomHeader(42 as unknown as string)).rejects.toBeInstanceOf(TypeError);
    await expect(readDicomHeader(Readable.from(["text"]))).rejects.toBeInstanceOf(TypeError);
  });
});

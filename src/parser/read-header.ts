/**
 * `readDicomHeader`: read a DICOM Part 10 file's header from a path, a file handle or a stream,
 * only as far as the tag the parse stops before, so the Pixel Data of a large file is never read
 * into memory.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { fsPromisesModule } from "../builtins.js";
import type { Dataset } from "../dataset/dataset.js";
import { parseDicom, parseDicomStopping } from "./index.js";
import { stopTagNumber } from "./stop.js";
import type { ParseOptions } from "./types.js";

/**
 * The tag `readDicomHeader` stops before when `stopBeforeTag` is not given: Float Pixel Data
 * `(7FE0,0008)`, the first of the three Pixel Data elements (PS3.3 2026d section C.7.6.3), so the
 * read also stops before Double Float Pixel Data `(7FE0,0009)` and Pixel Data `(7FE0,0010)`.
 */
const DEFAULT_STOP_TAG = "7FE00008";

/** The first prefix tried, in bytes. Each later one is twice the one before. */
const FIRST_READ_BYTES = 64 * 1024;

/**
 * A file handle `readDicomHeader` can read from: Node's `FileHandle` from `node:fs/promises`, or
 * anything with the same positional `read`. It is read from byte 0 with explicit positions, and
 * never closed: the caller who opened it closes it.
 *
 * @example
 * ```ts
 * import { open } from "node:fs/promises";
 * import { readDicomHeader, type DicomFileHandle } from "@cosyte/dicom";
 * const handle: DicomFileHandle = await open("study.dcm");
 * try {
 *   const ds = await readDicomHeader(handle);
 *   console.log(ds.has("00100010"));
 * } finally {
 *   await (handle as Awaited<ReturnType<typeof open>>).close();
 * }
 * ```
 */
export interface DicomFileHandle {
  read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ readonly bytesRead: number }>;
}

/**
 * Where `readDicomHeader` reads from: a file path (a string or a `file:` URL), a
 * {@link DicomFileHandle}, or any async iterable of byte chunks (a Node `Readable` such as
 * `fs.createReadStream`, or a web `ReadableStream<Uint8Array>`).
 *
 * @example
 * ```ts
 * import { createReadStream } from "node:fs";
 * import type { DicomByteSource } from "@cosyte/dicom";
 * const fromPath: DicomByteSource = "study.dcm";
 * const fromStream: DicomByteSource = createReadStream("study.dcm");
 * ```
 */
export type DicomByteSource = string | URL | DicomFileHandle | AsyncIterable<Uint8Array>;

/** Pulls the next bytes of a source; `undefined` once the source is exhausted. */
interface ByteReader {
  /** Up to `want` more bytes, or fewer at the end; `undefined` when nothing is left. */
  next(want: number): Promise<Uint8Array | undefined>;
  /** Releases the source: closes a file this module opened, ends a stream early. */
  close(): Promise<void>;
}

/**
 * Read a DICOM Part 10 file's header from a path, a file handle or a stream, without reading the
 * Pixel Data: the read stops before the first top-level element at or after `stopBeforeTag`
 * (Float Pixel Data `(7FE0,0008)` when it is not given, which also stops before Double Float Pixel
 * Data and Pixel Data), and the bytes after that are never read into memory.
 *
 * The Dataset is the one `parseDicom(wholeFile, { ...options, stopBeforeTag })` returns: the same
 * elements, the same bytes, the same warnings, ending with `DICOM_PARSE_STOPPED_BEFORE_TAG`. It is
 * found by reading a prefix of the file (64 KiB, then twice as much each time) and parsing it until
 * one parse reaches the stop; `onWarning` is called once, for the warnings of that parse.
 *
 * What it reads in full, and so holds in memory, is stated here rather than discovered:
 *
 * - a file with no top-level element at or after the stop tag;
 * - a Deflated Explicit VR Little Endian file, whose Data Set, Pixel Data included, is one deflate
 *   stream that is inflated whole;
 * - a file `parseDicom` refuses, or one whose header `{ strict: true }` or a profile escalates a
 *   warning in: the error thrown is the one `parseDicom` throws on the whole file, read to its end.
 *
 * A path is opened and closed here. A file handle is read from byte 0 and left open. A stream is
 * read from where it is and, once the stop is found, ended early through its iterator's `return`,
 * which destroys a Node `Readable` and cancels a web `ReadableStream`.
 *
 * @example
 * ```ts
 * import { readDicomHeader } from "@cosyte/dicom";
 *
 * // A 1 GiB study: only its header is read.
 * const ds = await readDicomHeader("study.dcm");
 * console.log(ds.study.instanceUid, ds.has("7FE00010")); // "2.25...." false
 *
 * // Stop earlier, from a stream.
 * import { createReadStream } from "node:fs";
 * const patientOnly = await readDicomHeader(createReadStream("study.dcm"), {
 *   stopBeforeTag: "00200000",
 * });
 * ```
 */
export async function readDicomHeader(
  source: DicomByteSource,
  options: ParseOptions = {},
): Promise<Dataset> {
  return readHeaderFrom(source, options, FIRST_READ_BYTES);
}

/**
 * {@link readDicomHeader} with the size of the first prefix tried as a parameter, so a test can
 * make the prefixes cut a small file at every kind of place.
 *
 * @internal
 */
export async function readHeaderFrom(
  source: DicomByteSource,
  options: ParseOptions,
  firstReadBytes: number,
): Promise<Dataset> {
  const parseOptions: ParseOptions = {
    ...options,
    stopBeforeTag: options.stopBeforeTag ?? DEFAULT_STOP_TAG,
  };
  // The trial parses run without the caller's callback, so it hears each warning once.
  const { onWarning, ...trialOptions } = parseOptions;
  // Refuse a malformed stop tag before anything is opened.
  stopTagNumber(trialOptions.stopBeforeTag);

  const reader = await open(source);
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let want = firstReadBytes;
    for (;;) {
      let ended = false;
      while (total < want) {
        const chunk = await reader.next(want - total);
        if (chunk === undefined) {
          ended = true;
          break;
        }
        chunks.push(chunk);
        total += chunk.length;
      }
      const bytes = join(chunks, total);
      if (ended) return parseDicom(bytes, parseOptions);
      chunks.length = 0;
      chunks.push(bytes);
      const found = tryStop(bytes, trialOptions);
      if (found !== undefined) {
        if (onWarning !== undefined) replay(found, onWarning);
        return found;
      }
      want = total * 2;
    }
  } finally {
    await reader.close();
  }
}

/** The Dataset of a prefix that holds everything before the stop, or `undefined` if it does not. */
function tryStop(bytes: Buffer, options: ParseOptions): Dataset | undefined {
  try {
    const result = parseDicomStopping(bytes, options);
    return result.stopped ? result.ds : undefined;
  } catch {
    // A prefix cut inside an element, or one the parse refuses: read more and try again. At the end
    // of the source the whole file is parsed and its own error, if any, is the one thrown.
    return undefined;
  }
}

/** Hand the accepted parse's warnings to the caller's callback, swallowing a throw as the parser does. */
function replay(ds: Dataset, onWarning: NonNullable<ParseOptions["onWarning"]>): void {
  for (const w of ds.warnings) {
    try {
      onWarning(w);
    } catch {
      // A throwing handler is swallowed, as `ParseOptions.onWarning` says.
    }
  }
}

/** One Buffer of the chunks read so far, copied once; a single chunk is used as it is. */
function join(chunks: readonly Uint8Array[], total: number): Buffer {
  if (chunks.length === 1) {
    const only = chunks[0] as Uint8Array;
    return Buffer.from(only.buffer, only.byteOffset, only.byteLength);
  }
  return Buffer.concat(chunks, total);
}

function isAsyncIterable(source: unknown): source is AsyncIterable<Uint8Array> {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof (source as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
}

function isFileHandle(source: unknown): source is DicomFileHandle {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof (source as { read?: unknown }).read === "function"
  );
}

async function open(source: DicomByteSource): Promise<ByteReader> {
  if (typeof source === "string" || source instanceof URL) {
    const handle = await fsPromisesModule().open(source, "r");
    return handleReader(handle, () => handle.close());
  }
  if (isAsyncIterable(source)) return streamReader(source);
  if (isFileHandle(source)) return handleReader(source, () => Promise.resolve());
  throw new TypeError(
    "readDicomHeader reads from a file path, a file URL, a file handle or an async iterable of bytes.",
  );
}

function handleReader(handle: DicomFileHandle, close: () => Promise<void>): ByteReader {
  let position = 0;
  return {
    async next(want) {
      const buffer = Buffer.allocUnsafe(want);
      const { bytesRead } = await handle.read(buffer, 0, want, position);
      if (bytesRead <= 0) return undefined;
      position += bytesRead;
      return buffer.subarray(0, bytesRead);
    },
    close,
  };
}

function streamReader(source: AsyncIterable<Uint8Array>): ByteReader {
  const iterator = source[Symbol.asyncIterator]();
  let done = false;
  return {
    async next() {
      for (;;) {
        const step = await iterator.next();
        if (step.done === true) {
          done = true;
          return undefined;
        }
        // An empty chunk says nothing about the end; a chunk that is not bytes is refused.
        const chunk: unknown = step.value;
        if (!(chunk instanceof Uint8Array)) {
          throw new TypeError("readDicomHeader reads a stream of Uint8Array or Buffer chunks.");
        }
        if (chunk.length > 0) return chunk;
      }
    },
    async close() {
      if (!done) await iterator.return?.();
    },
  };
}

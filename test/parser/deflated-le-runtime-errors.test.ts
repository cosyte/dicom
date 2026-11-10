/**
 * How the Deflated reader classifies a failure from `zlib.inflateRawSync` that does not have the
 * shape this runtime's Node gives it.
 *
 * Current Node signals the decompression-bomb cap with `code: "ERR_BUFFER_TOO_LARGE"`. Older Node
 * raised a `RangeError` naming `maxOutputLength` and carrying no such code, and zlib can surface
 * an error with no `message` at all. Neither is reachable with the Node this suite runs on, so
 * `inflateRawSync` is replaced here by one that throws each shape. The rows assert that each is
 * still a typed fatal, that the cap is still told apart from corruption, and that no text from
 * the thrown error reaches the message.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import type * as Zlib from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ParseContext } from "../../src/parser/types.js";

const inflate = vi.hoisted(() => ({ impl: undefined as (() => never) | undefined }));

vi.mock("node:zlib", async (importOriginal) => {
  const actual = await importOriginal<typeof Zlib>();
  return {
    ...actual,
    inflateRawSync: (...args: Parameters<typeof actual.inflateRawSync>) =>
      inflate.impl !== undefined ? inflate.impl() : actual.inflateRawSync(...args),
  };
});

const { parseDeflatedLEWithCap } = await import("../../src/parser/deflated-le.js");
const { DicomParseError, FATAL_CODES, OFFSET_FRAMES } = await import("../../src/parser/errors.js");
const { makeEmitter } = await import("../../src/parser/emit.js");
const { WITHHELD } = await import("../../src/parser/tokens.js");

function buildCtx(buffer: Buffer): ParseContext {
  return {
    frame: { buffer, name: OFFSET_FRAMES.INPUT },
    strict: false,
    stripPreamble: "tolerate",
    warnings: [],
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
}

/** Run the reader over 16 bytes after a 64-byte prefix, with `inflateRawSync` throwing `thrown`. */
function fatalWhenInflateThrows(thrown: unknown): InstanceType<typeof DicomParseError> {
  inflate.impl = () => {
    throw thrown;
  };
  const onDisk = Buffer.concat([Buffer.alloc(64), Buffer.alloc(16, 0x5a)]);
  const ctx = buildCtx(onDisk);
  try {
    parseDeflatedLEWithCap(onDisk, 64, ctx, makeEmitter(ctx), 1024);
  } catch (err) {
    if (err instanceof DicomParseError) return err;
    throw err;
  }
  throw new Error("expected a DicomParseError");
}

afterEach(() => {
  inflate.impl = undefined;
});

describe("parseDeflatedLE - inflate failures from other runtimes", () => {
  it("a RangeError naming maxOutputLength, with no code, is the cap fatal", () => {
    const err = fatalWhenInflateThrows(
      new RangeError('The value of "maxOutputLength" is out of range: SECRET-NAME'),
    );
    expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(err.message).toContain("Inflated Deflated TS payload exceeds 1024-byte cap.");
    expect(err.message).not.toContain("SECRET-NAME");
    expect(err.byteOffset).toBe(64);
  });

  it("a RangeError saying the output is too large, with no code, is the cap fatal", () => {
    const err = fatalWhenInflateThrows(new RangeError("Output too large"));
    expect(err.message).toContain("exceeds 1024-byte cap");
  });

  it("a RangeError about anything else is an inflate failure, not the cap", () => {
    const err = fatalWhenInflateThrows(new RangeError("offset is out of bounds"));
    expect(err.message).toContain("Failed to inflate Deflated TS payload");
    expect(err.message).not.toContain("cap");
  });

  it("a thrown value with no message is an inflate failure naming only a known zlib code", () => {
    const err = fatalWhenInflateThrows({ code: "Z_DATA_ERROR" });
    expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(err.message).toContain("(zlib error code: Z_DATA_ERROR)");
  });

  it("a thrown value with no message and an unknown code withholds the code", () => {
    const err = fatalWhenInflateThrows({ code: "DOE^JANE" });
    expect(err.message).toContain(`(zlib error code: ${WITHHELD})`);
    expect(err.message).not.toContain("DOE^JANE");
  });
});

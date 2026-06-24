import { Buffer } from "node:buffer";
import { describe, it, expect } from "vitest";

import { DicomParseError, FATAL_CODES, buildSnippet } from "./errors.js";

describe("FATAL_CODES (D-09)", () => {
  it("has exactly 4 codes (D-09 — locked at 4, no expansion)", () => {
    expect(Object.keys(FATAL_CODES)).toHaveLength(4);
  });

  it("contains the four canonical fatal codes verbatim", () => {
    expect(FATAL_CODES.NOT_DICOM_PART_10).toBe("NOT_DICOM_PART_10");
    expect(FATAL_CODES.INVALID_FILE_META).toBe("INVALID_FILE_META");
    expect(FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX).toBe("UNSUPPORTED_TRANSFER_SYNTAX");
    expect(FATAL_CODES.EMPTY_INPUT).toBe("EMPTY_INPUT");
  });
});

describe("DicomParseError (D-10)", () => {
  it("carries code, byteOffset, snippet, contextPath after construction", () => {
    const err = new DicomParseError(
      FATAL_CODES.NOT_DICOM_PART_10,
      "no DICM magic",
      0,
      "44 49 43 4d",
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DicomParseError);
    expect(err.name).toBe("DicomParseError");
    expect(err.code).toBe(FATAL_CODES.NOT_DICOM_PART_10);
    expect(err.byteOffset).toBe(0);
    expect(err.snippet).toBe("44 49 43 4d");
    expect(err.contextPath).toBeUndefined();
  });

  it("formats Error.message as `[CODE] msg (offset=N)` (CONTEXT specifics §)", () => {
    const err = new DicomParseError(FATAL_CODES.NOT_DICOM_PART_10, "no DICM magic", 0, "");
    expect(err.message.startsWith("[NOT_DICOM_PART_10] no DICM magic (offset=0)")).toBe(true);
  });

  it("appends `… in path/segments` when contextPath is provided", () => {
    const err = new DicomParseError(FATAL_CODES.INVALID_FILE_META, "missing TS UID", 132, "", [
      "0040A730",
      "0",
      "00080100",
    ]);
    expect(err.message).toContain("… in 0040A730/0/00080100");
    expect(err.contextPath).toEqual(["0040A730", "0", "00080100"]);
  });

  it("does not append `… in …` when contextPath is empty array", () => {
    const err = new DicomParseError(FATAL_CODES.EMPTY_INPUT, "input is empty", 0, "", []);
    expect(err.message).not.toContain("… in");
  });
});

describe("buildSnippet (D-10 — up to 16 bytes, lowercase hex, space-separated)", () => {
  it("renders bytes as space-separated lowercase 2-char hex", () => {
    const buf = Buffer.from([0x44, 0x49, 0x43, 0x4d]);
    expect(buildSnippet(buf, 0)).toBe("44 49 43 4d");
  });

  it("caps at 16 bytes max", () => {
    const buf = Buffer.alloc(32, 0xab);
    const snippet = buildSnippet(buf, 0);
    const tokens = snippet.split(" ");
    expect(tokens).toHaveLength(16);
    for (const t of tokens) expect(t).toBe("ab");
  });

  it("returns empty string when offset is out of range", () => {
    expect(buildSnippet(Buffer.from([0x01]), 5)).toBe("");
    expect(buildSnippet(Buffer.from([0x01]), -1)).toBe("");
  });

  it("matches space-separated-lowercase-hex pattern for arbitrary inputs", () => {
    const buf = Buffer.from([0x00, 0x10, 0xff, 0xa3]);
    const snippet = buildSnippet(buf, 0);
    expect(snippet).toMatch(/^[0-9a-f]{2}( [0-9a-f]{2}){0,15}$/);
  });
});

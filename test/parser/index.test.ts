/**
 * Tests for the `parseDicom` entry: input forms, the fatal codes, the
 * preamble and File Meta warnings, and warning delivery.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { buildDicom } from "../helpers/build-dicom.js";
import { DicomParseError } from "../../src/parser/errors.js";
import { parseDicom } from "../../src/parser/index.js";
import { WARNING_CODES, type DicomParseWarning } from "../../src/parser/warnings.js";

describe("parseDicom - happy path", () => {
  it("returns a Dataset with fileMeta.transferSyntaxUID for valid Part 10 input", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const ds = parseDicom(buf);
    expect(ds.fileMeta?.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
  });
});

describe("parseDicom - input variants", () => {
  it("Buffer / Uint8Array / ArrayBuffer all yield equivalent Datasets", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const ds1 = parseDicom(buf);
    const ds2 = parseDicom(new Uint8Array(buf));
    // ArrayBuffer copy: ensure exact bytes via .subarray on a fresh ArrayBuffer
    const ab = new ArrayBuffer(buf.length);
    new Uint8Array(ab).set(buf);
    const ds3 = parseDicom(ab);
    expect(ds1.fileMeta?.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
    expect(ds2.fileMeta?.transferSyntaxUID).toBe(ds1.fileMeta?.transferSyntaxUID);
    expect(ds3.fileMeta?.transferSyntaxUID).toBe(ds1.fileMeta?.transferSyntaxUID);
  });
});

describe("parseDicom - EMPTY_INPUT dual check", () => {
  it("empty Buffer throws EMPTY_INPUT", () => {
    expect(() => parseDicom(Buffer.alloc(0))).toThrow(DicomParseError);
    try {
      parseDicom(Buffer.alloc(0));
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("EMPTY_INPUT");
      expect(err.byteOffset).toBe(0);
      expect(err.snippet).toBe("");
    }
  });

  it("empty Uint8Array throws EMPTY_INPUT", () => {
    expect(() => parseDicom(new Uint8Array(0))).toThrow(DicomParseError);
  });

  it("empty ArrayBuffer throws EMPTY_INPUT (corner case)", () => {
    expect(() => parseDicom(new ArrayBuffer(0))).toThrow(DicomParseError);
    try {
      parseDicom(new ArrayBuffer(0));
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("EMPTY_INPUT");
    }
  });

  it("a non-empty view the types exclude, which normalizes to no bytes, throws EMPTY_INPUT", () => {
    // A JavaScript caller can pass a DataView. It has a byteLength, so the raw check passes, but
    // `Buffer.from` reads no bytes out of it: the second half of the dual check refuses it rather
    // than letting an empty buffer be parsed.
    const view = new DataView(new ArrayBuffer(16));
    try {
      parseDicom(view as unknown as Uint8Array);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("EMPTY_INPUT");
      expect(err.message).toContain("Input is empty after normalization.");
      expect(err.byteOffset).toBe(0);
      expect(err.snippet).toBe("");
    }
  });
});

describe("parseDicom - NOT_DICOM_PART_10", () => {
  it("random binary blob throws NOT_DICOM_PART_10 with non-empty hex snippet", () => {
    const buf = Buffer.alloc(200);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 13 + 7) & 0xff;
    buf[0] = 0xff;
    buf[1] = 0xfe;
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("NOT_DICOM_PART_10");
      expect(err.byteOffset).toBe(0);
      expect(err.snippet.length).toBeGreaterThan(0);
    }
  });
});

describe("parseDicom - UNSUPPORTED_TRANSFER_SYNTAX", () => {
  it("dispatch table miss for SMPTE ST 2110-20 → throws UNSUPPORTED_TRANSFER_SYNTAX with the registry name, never the UID, in message and snippet", () => {
    const name = "SMPTE ST 2110-20 Uncompressed Progressive Active Video";
    const buf = buildDicom({
      // SMPTE ST 2110-20: PS3.5 section A.8, a DICOM Real-Time Video Metadata Flow syntax
      // that stays outside the supported set.
      transferSyntax: "1.2.840.10008.1.2.7.1",
      elements: [],
    });
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("UNSUPPORTED_TRANSFER_SYNTAX");
      // The UID is NOT echoed. It is a `UI` a sender authored and this branch is
      // reached precisely when it is not one this build knows, so the message
      // names it only from the closed set the parser controls: the dictionary's
      // own label for the UID. This test previously asserted the opposite and
      // pinned the echo in place.
      expect(err.message).not.toContain("1.2.840.10008.1.2.7.1");
      expect(err.message).toContain(name);
      expect(err.message).toContain("(0002,0010)");
      // Human-readable name comes from Dictionary.uid: PS3.6's own label.
      expect(err.snippet).toBe(name);
    }
  });

  it("each of the 4 v1 TS UIDs dispatches without throwing UNSUPPORTED_TRANSFER_SYNTAX", () => {
    for (const ts of [
      "1.2.840.10008.1.2",
      "1.2.840.10008.1.2.1",
      "1.2.840.10008.1.2.2",
      "1.2.840.10008.1.2.1.99",
    ]) {
      const buf = buildDicom({ transferSyntax: ts, elements: [] });
      const ds = parseDicom(buf);
      expect(ds.fileMeta?.transferSyntaxUID).toBe(ts);
    }
  });
});

describe("parseDicom - warnings", () => {
  it("ds.warnings is always a (frozen) array, even when empty", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const ds = parseDicom(buf);
    expect(Array.isArray(ds.warnings)).toBe(true);
    expect(ds.warnings).toHaveLength(0);
  });

  it("onWarning fires per warning AND ds.warnings collects it (in that order)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaGroupLength: "omit",
    });
    const observed: string[] = [];
    const ds = parseDicom(buf, {
      onWarning: (w: DicomParseWarning) => observed.push(w.code),
    });
    expect(observed).toContain(WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING);
    expect(ds.warnings.map((w) => w.code)).toContain(
      WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
    );
  });

  it("missing preamble emits DICOM_MISSING_PREAMBLE with byteOffset=0 in lenient mode", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      skipPreamble: true,
    });
    const ds = parseDicom(buf);
    expect(ds.warnings[0]?.code).toBe(WARNING_CODES.DICOM_MISSING_PREAMBLE);
    expect(ds.warnings[0]?.position.byteOffset).toBe(0);
    expect(ds.warnings[0]?.position.fileMeta).toBeUndefined();
    expect(ds.fileMeta?.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
  });

  it("stripPreamble='require' on missing preamble throws NOT_DICOM_PART_10 (NOT INVALID_FILE_META)", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      skipPreamble: true,
    });
    try {
      parseDicom(buf, { stripPreamble: "require" });
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("NOT_DICOM_PART_10");
    }
  });
});

describe("parseDicom - strict mode escalation", () => {
  it("strict: true escalates DICOM_FILE_META_GROUP_LENGTH_MISMATCH into a thrown DicomParseError", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaGroupLength: "wrong",
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    });
    try {
      parseDicom(buf, { strict: true });
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe(WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH);
    }
  });
});

describe("parseDicom - INVALID_FILE_META", () => {
  it("missing (0002,0010) Transfer Syntax UID throws INVALID_FILE_META even in lenient mode", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      skipTransferSyntaxUID: true,
    });
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });
});

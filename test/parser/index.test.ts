/**
 * Tests for `parseDicom` entry — Phase 2 plan 02-02 task 3.
 *
 * Covers PARSE-01..06, FM-04, TOL-02, TOL-04, TOL-05, TOL-06 + CONTEXT.md
 * D-01 / D-13 / D-14 / D-15 / D-19 / D-20 + threat model T-02-02-01..05.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { buildDicom } from "../helpers/build-dicom.js";
import { DicomParseError } from "../../src/parser/errors.js";
import { parseDicom } from "../../src/parser/index.js";
import type { DicomParseWarning } from "../../src/parser/warnings.js";
import { WARNING_CODES } from "../../src/parser/warnings.js";

describe("parseDicom — PARSE-01 happy path", () => {
  it("returns a Dataset with fileMeta.transferSyntaxUID for valid Part 10 input", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const ds = parseDicom(buf);
    expect(ds.fileMeta?.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
  });
});

describe("parseDicom — PARSE-04 input variants", () => {
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

describe("parseDicom — PARSE-06 + D-13 EMPTY_INPUT dual check", () => {
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

  it("empty ArrayBuffer throws EMPTY_INPUT (D-13 corner case)", () => {
    expect(() => parseDicom(new ArrayBuffer(0))).toThrow(DicomParseError);
    try {
      parseDicom(new ArrayBuffer(0));
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("EMPTY_INPUT");
    }
  });
});

describe("parseDicom — PARSE-05 + D-15 NOT_DICOM_PART_10", () => {
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

describe("parseDicom — FM-04 + D-20 UNSUPPORTED_TRANSFER_SYNTAX", () => {
  it("dispatch table miss for JPEG Baseline → throws UNSUPPORTED_TRANSFER_SYNTAX with the UID in message and human-readable name in snippet", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.4.50", // JPEG Baseline (Process 1) — out of v1 scope
      elements: [],
      // The dataset encoder for JPEG would throw, so omit dataset elements.
    });
    try {
      parseDicom(buf);
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("UNSUPPORTED_TRANSFER_SYNTAX");
      expect(err.message).toContain("1.2.840.10008.1.2.4.50");
      // Human-readable name comes from Dictionary.uid (D-20). The known v1 dictionary
      // labels this UID "JPEG Baseline (Process 1)" or similar — non-empty when known.
      expect(err.snippet.length).toBeGreaterThan(0);
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

describe("parseDicom — TOL-04 / TOL-05 / TOL-06", () => {
  it("ds.warnings is always a (frozen) array, even when empty", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const ds = parseDicom(buf);
    expect(Array.isArray(ds.warnings)).toBe(true);
    expect(ds.warnings).toHaveLength(0);
  });

  it("onWarning fires per warning AND ds.warnings collects it (D-03 ordering)", () => {
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

  it("PARSE-02 + TOL-06: missing preamble emits DICOM_MISSING_PREAMBLE with byteOffset=0 in lenient mode", () => {
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

  it("PARSE-02 + D-14: stripPreamble='require' on missing preamble throws NOT_DICOM_PART_10 (NOT INVALID_FILE_META)", () => {
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

describe("parseDicom — strict mode escalation", () => {
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

describe("parseDicom — D-19 INVALID_FILE_META", () => {
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

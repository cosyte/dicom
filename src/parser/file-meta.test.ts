/**
 * Tests for `parseFileMeta` — Phase 2 plan 02-02 task 2.
 * Covers CONTEXT.md D-17 / D-18 / D-19 + threat T-02-02-01.
 */

import type { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { buildDicom } from "../../test/helpers/build-dicom.js";
import { DicomParseError } from "./errors.js";
import { parseFileMeta } from "./file-meta.js";
import { parsePart10Header } from "./part10-header.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";
import { WARNING_CODES } from "./warnings.js";

function ctxFor(buffer: Buffer): { ctx: ParseContext; emitted: DicomParseWarning[] } {
  const emitted: DicomParseWarning[] = [];
  const ctx: ParseContext = {
    buffer,
    strict: false,
    stripPreamble: "tolerate",
    warnings: emitted,
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
  return { ctx, emitted };
}

function emitFor(ctx: ParseContext): (w: DicomParseWarning) => void {
  return (w) => {
    ctx.warnings.push(w);
  };
}

describe("parseFileMeta — happy path", () => {
  it("populates transferSyntaxUID with no warnings when (0002,0000) is accurate", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    expect(fileMeta.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
    expect(ctx.warnings).toHaveLength(0);
  });

  it("populates the full FM-02 projection when all fields are present", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.3.4",
      implementationClassUID: "1.2.276.0.7230010.3.0.3.6.4",
      implementationVersionName: "OFFIS_DCMTK_364",
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    expect(fileMeta.mediaStorageSOPClassUID).toBe("1.2.840.10008.5.1.4.1.1.2");
    expect(fileMeta.mediaStorageSOPInstanceUID).toBe("1.2.3.4");
    expect(fileMeta.implementationClassUID).toBe("1.2.276.0.7230010.3.0.3.6.4");
    expect(fileMeta.implementationVersionName).toBe("OFFIS_DCMTK_364");
  });
});

describe("parseFileMeta — D-18 group-length handling", () => {
  it("emits DICOM_FILE_META_GROUP_LENGTH_MISSING when (0002,0000) is absent", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaGroupLength: "omit",
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    const w = ctx.warnings.find(
      (x) => x.code === WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
    );
    expect(w).toBeDefined();
    expect(w?.position.fileMeta).toBe(true);
  });

  it("emits DICOM_FILE_META_GROUP_LENGTH_MISMATCH when (0002,0000) is wrong; resolves TS UID anyway", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaGroupLength: "wrong",
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    const w = ctx.warnings.find(
      (x) => x.code === WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH,
    );
    expect(w).toBeDefined();
    expect(w?.position.fileMeta).toBe(true);
    expect(fileMeta.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
    expect(fileMeta.mediaStorageSOPClassUID).toBe("1.2.840.10008.5.1.4.1.1.2");
  });
});

describe("parseFileMeta — D-19 required TS UID", () => {
  it("throws INVALID_FILE_META in lenient mode when (0002,0010) Transfer Syntax UID is missing", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      skipTransferSyntaxUID: true,
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    expect(() => parseFileMeta(buf, datasetStart, ctx, emitFor(ctx))).toThrow(DicomParseError);
    try {
      parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });

  it("does NOT throw when only optional FM Type-1 elements are missing (STRICT-03 deferred)", () => {
    // TS UID present; everything else (MediaStorageSOPClassUID, ImplementationClassUID, etc.) absent.
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    expect(() => parseFileMeta(buf, datasetStart, ctx, emitFor(ctx))).not.toThrow();
  });
});

describe("parseFileMeta — UI trimming", () => {
  it("silently trims trailing NUL on TS UID", () => {
    // "1.2.840.10008.1.2.1" is 19 chars (odd) — buildDicom auto-pads with NUL to 20.
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    expect(fileMeta.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
    expect(fileMeta.transferSyntaxUID.endsWith("\0")).toBe(false);
  });
});

describe("parseFileMeta — T-02-02-01 truncated input mitigation", () => {
  it("throws INVALID_FILE_META when declared (0002,0000) exceeds remaining buffer", () => {
    // Build a Part 10 with a (0002,0000) that lies — claims 10000 bytes follow but only ~30 do.
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaGroupLength: 10_000,
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    expect(() => parseFileMeta(buf, datasetStart, ctx, emitFor(ctx))).toThrow(DicomParseError);
  });
});

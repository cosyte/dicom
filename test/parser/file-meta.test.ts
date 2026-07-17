/**
 * Tests for `parseFileMeta` — Phase 2 plan 02-02 task 2.
 * Covers CONTEXT.md D-17 / D-18 / D-19 + threat T-02-02-01.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { buildDicom } from "../helpers/build-dicom.js";
import { DicomParseError } from "../../src/parser/errors.js";
import { parseFileMeta } from "../../src/parser/file-meta.js";
import { parsePart10Header } from "../../src/parser/part10-header.js";
import type { ParseContext } from "../../src/parser/types.js";
import type { DicomParseWarning } from "../../src/parser/warnings.js";
import { WARNING_CODES } from "../../src/parser/warnings.js";

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

describe("parseFileMeta — non-modeled element preservation (lossless round-trip)", () => {
  it("preserves non-modeled (0002,xxxx) elements verbatim on extraElements", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaExtraElements: [
        // (0002,0017) Sending AE Title (AE, short form) — even-length value.
        { tag: "00020017", vr: "AE", value: Buffer.from("SEND_AE ", "ascii") },
        // (0002,0102) Private Information (OB, long form) — even-length value.
        { tag: "00020102", vr: "OB", value: Buffer.from([0xde, 0xad, 0xbe, 0xef]) },
      ],
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));

    const extras = fileMeta.extraElements ?? [];
    expect(extras.map((e) => e.tag)).toEqual(["00020017", "00020102"]);
    const ae = extras.find((e) => e.tag === "00020017");
    expect(ae?.vr).toBe("AE");
    expect(ae?.value.toString("ascii")).toBe("SEND_AE ");
    const priv = extras.find((e) => e.tag === "00020102");
    expect(priv?.vr).toBe("OB");
    expect(priv?.value.equals(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBe(true);
    expect(ctx.warnings).toHaveLength(0);
  });

  it("omits extraElements when the group holds only modeled elements", () => {
    const buf = buildDicom({ transferSyntax: "1.2.840.10008.1.2.1", elements: [] });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    expect(fileMeta.extraElements).toBeUndefined();
  });

  it("copies extra values so the view never aliases the input buffer", () => {
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaExtraElements: [
        { tag: "00020100", vr: "UI", value: Buffer.from("1.2.3.4\0", "ascii") },
      ],
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    const stored = fileMeta.extraElements?.[0]?.value;
    expect(stored).toBeDefined();
    // Mutating the source buffer must not change the preserved value.
    buf.fill(0xff);
    expect((stored as Buffer).toString("ascii")).toBe("1.2.3.4\0");
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

  it("throws INVALID_FILE_META when the buffer ends inside the very first FM element", () => {
    // The first read after (0002,0000) is the group-length element itself.
    // Cut the buffer mid-first-element so readExplicitLeElement's cursor read
    // overruns -> RangeError -> typed INVALID_FILE_META, not a raw RangeError.
    const full = buildDicom({ transferSyntax: "1.2.840.10008.1.2.1", elements: [] });
    const dicm = full.indexOf("DICM");
    // Keep preamble + DICM + 4 bytes into the first element header (a partial
    // (0002,0000) header). parsePart10Header consumes through DICM; parseFileMeta
    // then tries to read the first element from a 4-byte remainder.
    const truncated = full.subarray(0, dicm + 4 + 4);
    const { ctx } = ctxFor(truncated);
    const { datasetStart } = parsePart10Header(truncated, ctx, emitFor(ctx));
    try {
      parseFileMeta(truncated, datasetStart, ctx, emitFor(ctx));
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
    }
  });
});

describe("parseFileMeta — D-18 mismatch recovery loop", () => {
  it("severely under-declared (0002,0000) still projects all FM fields via the recovery loop", () => {
    // FM element sizes are deterministic: (0002,0010)=28, (0002,0002)=34,
    // (0002,0003)=26, (0002,0012)=16 bytes. Declaring 30 makes the main loop
    // overshoot after the second element while two FM elements remain, so the
    // post-mismatch recovery loop (which reads forward until the first non-0002
    // group) is exercised — and every FM field must still project correctly.
    const buf = buildDicom({
      transferSyntax: "1.2.840.10008.1.2.1",
      elements: [],
      fileMetaGroupLength: 30,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.3.4.5.6.7.8.9",
      implementationClassUID: "1.2.3.4",
    });
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    expect(
      ctx.warnings.some((w) => w.code === WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH),
    ).toBe(true);
    // All FM fields recovered despite the wrong group length.
    expect(fileMeta.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
    expect(fileMeta.mediaStorageSOPClassUID).toBe("1.2.840.10008.5.1.4.1.1.2");
    expect(fileMeta.mediaStorageSOPInstanceUID).toBe("1.2.3.4.5.6.7.8.9");
    expect(fileMeta.implementationClassUID).toBe("1.2.3.4");
  });
});

describe("parseFileMeta — (0002,0001) FileMetaInformationVersion (long-form OB)", () => {
  it("reads the long-form OB header and projects fileMetaInformationVersion raw", () => {
    // (0002,0001) is an OB element — a long-form VR (12-byte header with 2
    // reserved bytes + 4-byte length). It exercises the LONG_FORM_VRS branch
    // in the File Meta reader and the raw-value projection. Hand-build the FM
    // since the buildDicom helper does not emit (0002,0001).
    const version = Buffer.from([0x00, 0x01]); // the canonical 2-byte FM version
    const verEl = Buffer.alloc(12 + version.length);
    verEl.writeUInt16LE(0x0002, 0);
    verEl.writeUInt16LE(0x0001, 2);
    verEl.write("OB", 4, "ascii");
    // bytes 6-7 reserved (0x0000)
    verEl.writeUInt32LE(version.length, 8);
    version.copy(verEl, 12);

    const tsValue = Buffer.from("1.2.840.10008.1.2.1\0", "ascii");
    const tsEl = Buffer.alloc(8 + tsValue.length);
    tsEl.writeUInt16LE(0x0002, 0);
    tsEl.writeUInt16LE(0x0010, 2);
    tsEl.write("UI", 4, "ascii");
    tsEl.writeUInt16LE(tsValue.length, 6);
    tsValue.copy(tsEl, 8);

    const fmBody = Buffer.concat([verEl, tsEl]);
    const gl = Buffer.alloc(12);
    gl.writeUInt16LE(0x0002, 0);
    gl.writeUInt16LE(0x0000, 2);
    gl.write("UL", 4, "ascii");
    gl.writeUInt16LE(4, 6);
    gl.writeUInt32LE(fmBody.length, 8);

    const buf = Buffer.concat([Buffer.alloc(128, 0x00), Buffer.from("DICM", "ascii"), gl, fmBody]);
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    const { fileMeta } = parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
    expect(fileMeta.transferSyntaxUID).toBe("1.2.840.10008.1.2.1");
    expect(fileMeta.fileMetaInformationVersion).toBeDefined();
    expect(
      Buffer.from(fileMeta.fileMetaInformationVersion ?? Buffer.alloc(0)).equals(version),
    ).toBe(true);
  });
});

describe("parseFileMeta — D-19 Transfer Syntax UID with wrong VR", () => {
  it("throws INVALID_FILE_META when (0002,0010) is present but its VR is not UI", () => {
    // Hand-build a File Meta where (0002,0010) carries VR=SH instead of UI.
    // D-19 requires the TS UID element to be UI; otherwise the file is fatal.
    const fmStart = (): Buffer => {
      // (0002,0010) SH short-form: tag(4) + "SH"(2) + len(2) + value
      const value = Buffer.from("1.2.840.10008.1.2.1\0", "ascii"); // even length
      const el = Buffer.alloc(8 + value.length);
      el.writeUInt16LE(0x0002, 0);
      el.writeUInt16LE(0x0010, 2);
      el.write("SH", 4, "ascii");
      el.writeUInt16LE(value.length, 6);
      value.copy(el, 8);
      // (0002,0000) UL group length declaring exactly el.length.
      const gl = Buffer.alloc(12);
      gl.writeUInt16LE(0x0002, 0);
      gl.writeUInt16LE(0x0000, 2);
      gl.write("UL", 4, "ascii");
      gl.writeUInt16LE(4, 6);
      gl.writeUInt32LE(el.length, 8);
      return Buffer.concat([gl, el]);
    };
    const preamble = Buffer.alloc(128, 0x00);
    const dicm = Buffer.from("DICM", "ascii");
    const buf = Buffer.concat([preamble, dicm, fmStart()]);
    const { ctx } = ctxFor(buf);
    const { datasetStart } = parsePart10Header(buf, ctx, emitFor(ctx));
    try {
      parseFileMeta(buf, datasetStart, ctx, emitFor(ctx));
      throw new Error("expected throw");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe("INVALID_FILE_META");
      expect(err.message).toMatch(/Transfer Syntax UID/);
    }
  });
});

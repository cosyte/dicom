/**
 * Tests for `parseDeflatedLE` — Phase 2 plan 02-05 (TS-04).
 *
 * Covers:
 *   - Happy-path Deflated-LE round-trip through `parseDicom + buildDicom`
 *     (CONTEXT D-26 — `inflateRawSync` + delegate to parseExplicitLE).
 *   - Position annotation (D-27 — warnings emitted from inflated content
 *     carry `position.deflated === true`).
 *   - ParseContext propagation — strict-mode escalation works through the
 *     inner emit wrapper (proves it does NOT bypass the outer chokepoint).
 *   - Decompression-bomb mitigation (T-02-05-01 — 256 MiB cap; tested
 *     against a 1 KiB cap via `parseDeflatedLEWithCap` for tractability).
 *   - Stream-corruption mitigation (T-02-05-02 — random non-deflate bytes
 *     throw `INVALID_FILE_META`, NOT a raw zlib `RangeError`).
 *   - `inflateRawSync` invariant (NOT `inflateSync`) — verified by the
 *     symmetry of the round-trip test (encoder uses `deflateRawSync`,
 *     parser must use `inflateRawSync` for the round-trip to succeed) +
 *     the source-grep verification in `<must_haves>`.
 */

import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { buildDicom } from "../../test/helpers/build-dicom.js";
import type { Dataset } from "../dataset/dataset.js";
import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { parseDeflatedLEWithCap } from "./deflated-le.js";
import { DicomParseError, FATAL_CODES } from "./errors.js";
import { makeEmitter } from "./emit.js";
import { parseDicom } from "./index.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";
import { WARNING_CODES } from "./warnings.js";

interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}
function elementsOf(ds: Dataset): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

/** Build a minimal ParseContext suitable for direct strategy calls. */
function buildCtx(buffer: Buffer, opts: { strict?: boolean } = {}): ParseContext {
  return {
    buffer,
    strict: opts.strict ?? false,
    stripPreamble: "tolerate",
    warnings: [],
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
}

describe("parseDeflatedLE — TS-04 happy path (D-26)", () => {
  it("round-trips a single PN element through buildDicom + parseDicom", () => {
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });

    const ds = parseDicom(buf);

    expect(ds.fileMeta?.transferSyntaxUID).toBe(TS_DEFLATED_LE);
    const el = elementsOf(ds).get("00100010");
    expect(el).toBeDefined();
    expect(el?.vr).toBe("PN");
    expect(el?.length).toBe(8);
    expect(el?.rawBytes.toString("ascii")).toBe("DOE^JANE");
  });

  it("round-trips multiple elements (PN + UI)", () => {
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [
        { tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") },
        { tag: "00080018", vr: "UI", value: Buffer.from("1.2.3.4\0", "ascii") },
      ],
    });

    const ds = parseDicom(buf);

    const pn = elementsOf(ds).get("00100010");
    const ui = elementsOf(ds).get("00080018");
    expect(pn?.rawBytes.toString("ascii")).toBe("DOE^JANE");
    expect(ui?.vr).toBe("UI");
  });
});

describe("parseDeflatedLE — D-27 position.deflated annotation", () => {
  it("warnings emitted from inflated content carry position.deflated === true", () => {
    // VR mismatch: dictionary expects PN for (0010,0010); we encode as LO.
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "LO", value: Buffer.from("X ", "ascii") }],
    });

    const ds = parseDicom(buf);

    const vrMismatch = ds.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_VR_MISMATCH,
    );
    expect(vrMismatch).toBeDefined();
    expect(vrMismatch?.position.deflated).toBe(true);
  });

  it("File Meta warnings carry position.fileMeta=true and NOT deflated (on-disk offsets)", () => {
    // File Meta group-length missing → DICOM_FILE_META_GROUP_LENGTH_MISSING
    // emitted before inflation.
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      fileMetaGroupLength: "omit",
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });

    const ds = parseDicom(buf);

    const fmWarn = ds.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
    );
    expect(fmWarn).toBeDefined();
    expect(fmWarn?.position.fileMeta).toBe(true);
    expect(fmWarn?.position.deflated).toBeUndefined();
  });
});

describe("parseDeflatedLE — strict-mode escalation through inner emit", () => {
  it("strict mode escalates a Tier-2 warning emitted from inflated content", () => {
    // Odd-length SH triggers DICOM_ODD_LENGTH_VALUE_PADDED inside the
    // inflated dataset. The inner emit wrapper MUST flow through the
    // outer chokepoint so strict mode escalates to a throw.
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00080050", vr: "SH", value: Buffer.from("12345", "ascii") }],
    });

    expect(() => parseDicom(buf, { strict: true })).toThrow(DicomParseError);
  });

  it("onWarning callback fires for warnings emitted from inflated content", () => {
    const onWarning = vi.fn();
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "LO", value: Buffer.from("X ", "ascii") }],
    });

    parseDicom(buf, { onWarning });

    const calls = onWarning.mock.calls.map((c) => c[0] as DicomParseWarning);
    const vrMismatch = calls.find((w) => w.code === WARNING_CODES.DICOM_VR_MISMATCH);
    expect(vrMismatch).toBeDefined();
    expect(vrMismatch?.position.deflated).toBe(true);
  });
});

describe("parseDeflatedLE — T-02-05-01 decompression-bomb cap", () => {
  it("throws INVALID_FILE_META when inflated output exceeds the cap", () => {
    // Build a payload whose inflation exceeds a 1 KiB cap. ~2 KiB of
    // identical bytes deflates to a tiny buffer (the classic deflate-bomb
    // shape).
    const bigDataset = Buffer.alloc(2048, 0x41);
    const compressed = deflateRawSync(bigDataset);
    const fakeOnDisk = Buffer.concat([Buffer.alloc(64), compressed]); // datasetStart=64

    const ctx = buildCtx(fakeOnDisk);
    const emit = makeEmitter(ctx);

    expect(() =>
      parseDeflatedLEWithCap(fakeOnDisk, 64, ctx, emit, 1024),
    ).toThrow(DicomParseError);

    try {
      parseDeflatedLEWithCap(fakeOnDisk, 64, ctx, emit, 1024);
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      const e = err as DicomParseError;
      expect(e.code).toBe(FATAL_CODES.INVALID_FILE_META);
      expect(e.message).toMatch(/exceeds/i);
      expect(e.message).toMatch(/1024/);
      expect(e.byteOffset).toBe(64);
    }
  });
});

describe("parseDeflatedLE — T-02-05-02 stream corruption", () => {
  it("throws INVALID_FILE_META on random non-deflate bytes (NOT a raw zlib error)", () => {
    const garbage = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    ]);
    const fakeOnDisk = Buffer.concat([Buffer.alloc(32), garbage]);
    const ctx = buildCtx(fakeOnDisk);
    const emit = makeEmitter(ctx);

    let caught: unknown;
    try {
      parseDeflatedLEWithCap(fakeOnDisk, 32, ctx, emit, 256 * 1024 * 1024);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DicomParseError);
    const e = caught as DicomParseError;
    expect(e.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(e.message).toMatch(/inflate/i);
    expect(e.byteOffset).toBe(32);
  });

  it("throws INVALID_FILE_META end-to-end through parseDicom for corrupted deflated payload", () => {
    // Build a valid Part 10 + File Meta header pointing at TS-04, but
    // append non-deflate gibberish as the dataset payload.
    const valid = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });
    // Find where File Meta ends — the original deflate stream begins at
    // some offset. Since buildDicom currently throws for TS-04 (RED phase
    // baseline), this test will start passing once Step 3 wires the
    // encoder. Once it does, we splice gibberish over the deflate body.
    // We approximate by building a separate buffer: keep everything up to
    // the deflate stream start, then append junk.
    // Simpler approach: build a fixture with a known TS UID + valid FM
    // but raw garbage as the deflated body using buildDicom, then mutate.
    // The exact deflate-stream offset is hard to compute without parsing,
    // so we hand-construct using the same File Meta the helper makes,
    // overwriting only the trailing dataset bytes with junk.
    expect(valid.length).toBeGreaterThan(0);

    // Build a second buffer that is identical up to the File Meta end +
    // appends non-deflate bytes. We re-use buildDicom to get a known
    // header layout, then truncate to where the deflate body begins.
    // The deflate body begins immediately after the File Meta group.
    // For simplicity in this test we mutate the last 16 bytes of `valid`
    // to non-deflate junk — corrupting the tail of the deflate stream is
    // sufficient to trigger an inflate failure.
    const corrupted = Buffer.from(valid);
    for (let i = corrupted.length - 16; i < corrupted.length; i++) {
      corrupted[i] = 0xff;
    }
    // Also replace the entire deflate body with garbage after preamble +
    // File Meta — to be thorough, fill the last 50% of the buffer with
    // junk (preserving preamble + DICM + File Meta + (0002,0010) UID).
    // 132 (preamble+DICM) + ~70 bytes File Meta is a safe lower bound;
    // assume File Meta < 200 bytes.
    const safeStart = Math.min(200, Math.floor(corrupted.length * 0.7));
    for (let i = safeStart; i < corrupted.length; i++) {
      corrupted[i] = 0xff;
    }

    expect(() => parseDicom(corrupted)).toThrow(DicomParseError);
  });
});

describe("parseDeflatedLE — copyValues honored through inflated parse", () => {
  it("copyValues=true allocates new rawBytes buffers for inflated elements", () => {
    const buf = buildDicom({
      transferSyntax: TS_DEFLATED_LE,
      elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("DOE^JANE", "ascii") }],
    });

    const dsView = parseDicom(buf, { copyValues: false });
    const dsCopy = parseDicom(buf, { copyValues: true });

    const elView = elementsOf(dsView).get("00100010");
    const elCopy = elementsOf(dsCopy).get("00100010");

    expect(elView?.rawBytes.toString("ascii")).toBe("DOE^JANE");
    expect(elCopy?.rawBytes.toString("ascii")).toBe("DOE^JANE");
    // copyValues=true should detach from any pinned source — the rawBytes
    // buffer's underlying ArrayBuffer is a fresh allocation (length matches
    // exactly). For a Buffer.subarray view, byteLength of underlying buffer
    // typically exceeds the slice length.
    expect(elCopy?.rawBytes.buffer.byteLength).toBe(elCopy?.rawBytes.byteLength);
  });
});

/**
 * `parseDicom` under the four JPIP Referenced Transfer Syntaxes of PS3.5 2026c (sections A.6, A.7,
 * A.11 and A.12), and the read-only boundary around them: the Pixel Data Provider URL is surfaced
 * and never fetched, `deidentify` refuses the object, and the Deflate pair keeps every inflate
 * fatal and the decompression cap.
 *
 * The UID set is read out of the vendored PS3.5 by `test/helpers/ps35-section-a4.ts`, never typed
 * here. The oracle for the metadata is the Explicit-LE twin: the byte-identical Data Set under
 * `1.2.840.10008.1.2.1`, which the parser read before any JPIP syntax was supported. Every fixture
 * is synthetic (`test/fixtures/encapsulated/objects.ts`).
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { constants, deflateRawSync, deflateSync, inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  DEIDENTIFY_ERROR_CODES,
  DEIDENTIFY_OPTIONS,
  Dataset,
  DeidentifyError,
  deidentify,
  profiles,
  serializeDicom,
} from "../../src/index.js";
import { DEFAULT_MAX_INFLATED_BYTES } from "../../src/parser/deflated-le.js";
import { DicomParseError, FATAL_CODES } from "../../src/parser/errors.js";
import { FATAL_MESSAGES } from "../../src/parser/fatals.js";
import { parseDicom } from "../../src/parser/index.js";
import {
  BITS_ALLOCATED,
  COLUMNS,
  DEFAULT_PROVIDER_URL,
  MODALITY,
  PATIENT_ID,
  PATIENT_NAME,
  PHOTOMETRIC_INTERPRETATION,
  PIXEL_DATA_PROVIDER_URL_TAG,
  ROWS,
  SERIES_INSTANCE_UID,
  STUDY_INSTANCE_UID,
  jpipDataSet,
  jpipExplicitLeTwin,
  jpipObject,
  jpipObjectWithDataSetBytes,
  providerUrl,
  urValueField,
} from "../fixtures/encapsulated/objects.js";
import { JPIP_SET } from "../helpers/ps35-section-a4.js";

/** Section A.6 and section A.11: the Data Set is Explicit VR LE. */
const EXPLICIT_PAIR: readonly string[] = ["1.2.840.10008.1.2.4.94", "1.2.840.10008.1.2.4.204"];
/** Section A.7 and section A.12, each mapped to its non-deflated sibling. */
const DEFLATE_SIBLING: Readonly<Record<string, string>> = {
  "1.2.840.10008.1.2.4.95": "1.2.840.10008.1.2.4.94",
  "1.2.840.10008.1.2.4.205": "1.2.840.10008.1.2.4.204",
};
const DEFLATE_PAIR: readonly string[] = Object.keys(DEFLATE_SIBLING);

/** The criteria's metadata, read through the domain views. */
function metadata(ds: Dataset): Record<string, unknown> {
  return {
    patientFamilyName: ds.patient.name?.alphabetic.familyName,
    patientGivenName: ds.patient.name?.alphabetic.givenName,
    patientId: ds.patient.id,
    studyInstanceUid: ds.study.instanceUid,
    seriesInstanceUid: ds.series.instanceUid,
    modality: ds.series.modality,
    rows: ds.image.rows,
    columns: ds.image.columns,
    bitsAllocated: ds.image.bitsAllocated,
    photometricInterpretation: ds.image.photometricInterpretation,
  };
}

/** The same metadata as the fixture wrote it, so a twin that also read wrong cannot pass. */
const FIXTURE_METADATA: Record<string, unknown> = {
  patientFamilyName: PATIENT_NAME.split("^")[0],
  patientGivenName: PATIENT_NAME.split("^")[1],
  patientId: PATIENT_ID,
  studyInstanceUid: STUDY_INSTANCE_UID,
  seriesInstanceUid: SERIES_INSTANCE_UID,
  modality: MODALITY,
  rows: ROWS,
  columns: COLUMNS,
  bitsAllocated: BITS_ALLOCATED,
  photometricInterpretation: PHOTOMETRIC_INTERPRETATION,
};

/** Every string an error carries: every own field (non-enumerable included), `message`, `stack`, `name`. */
function errorStrings(err: Error): string[] {
  const record = err as unknown as Record<string, unknown>;
  const own = Object.getOwnPropertyNames(err).map((key) => {
    const value = record[key];
    return typeof value === "string" ? value : String(JSON.stringify(value));
  });
  return [...own, err.message, err.stack ?? "", err.name];
}

/** True when any string `err` carries contains `needle`. */
function carries(err: Error, needle: string): boolean {
  return errorStrings(err).some((text) => text.includes(needle));
}

/** What `fn` returned, or what it threw. */
function attempt<T>(fn: () => T): { result: T | undefined; thrown: unknown } {
  try {
    return { result: fn(), thrown: undefined };
  } catch (thrown) {
    return { result: undefined, thrown };
  }
}

describe("AC-11 precondition: the JPIP set under test is read from PS3.5, not typed", () => {
  it("AC-1, AC-2: the vendored sections name exactly the four UIDs these rows split into pairs", () => {
    expect([...JPIP_SET].sort()).toStrictEqual([...EXPLICIT_PAIR, ...DEFLATE_PAIR].sort());
  });
});

describe("AC-1: sections A.6 and A.11 parse under Explicit VR LE rules and read as the twin", () => {
  it.each(EXPLICIT_PAIR)("AC-1: %s", (uid) => {
    const bytes = jpipObject({ transferSyntax: uid });
    // The fixture is what the criterion says: the Explicit VR LE Data Set, uncompressed.
    expect(bytes.subarray(bytes.length - jpipDataSet({}).length).equals(jpipDataSet({}))).toBe(
      true,
    );
    const ds = parseDicom(bytes);
    const twin = parseDicom(jpipExplicitLeTwin({ transferSyntax: uid }));

    expect(ds.fileMeta?.transferSyntaxUID).toBe(uid);
    expect(metadata(ds)).toStrictEqual(FIXTURE_METADATA);
    expect(metadata(ds)).toStrictEqual(metadata(twin));
  });
});

describe("AC-2: sections A.7 and A.12 inflate per RFC 1951 and read as the sibling and the twin", () => {
  it.each(DEFLATE_PAIR)("AC-2: %s", (uid) => {
    const bytes = jpipObject({ transferSyntax: uid });
    // The Data Set after the uncompressed File Meta is a raw-deflate stream of the A.6 encoding.
    const deflated = deflateRawSync(jpipDataSet({}));
    expect(bytes.subarray(bytes.length - deflated.length).equals(deflated)).toBe(true);
    expect(inflateRawSync(deflated).equals(jpipDataSet({}))).toBe(true);

    const ds = parseDicom(bytes);
    const sibling = parseDicom(jpipObject({ transferSyntax: DEFLATE_SIBLING[uid] ?? "" }));
    const twin = parseDicom(jpipExplicitLeTwin({ transferSyntax: uid }));

    expect(ds.fileMeta?.transferSyntaxUID).toBe(uid);
    expect(metadata(ds)).toStrictEqual(FIXTURE_METADATA);
    expect(metadata(ds)).toStrictEqual(metadata(sibling));
    expect(metadata(ds)).toStrictEqual(metadata(twin));
  });
});

describe("AC-3: Pixel Data Provider URL (0028,7FE0) is surfaced exactly as the file carries it", () => {
  it("AC-3: the fixture URL carries a path, a query with ?, & and =, a %-escape, and odd length", () => {
    const url = new URL(DEFAULT_PROVIDER_URL);
    expect(url.pathname.split("/").length).toBeGreaterThan(2);
    expect(DEFAULT_PROVIDER_URL).toContain("?");
    expect(DEFAULT_PROVIDER_URL).toContain("&");
    expect(DEFAULT_PROVIDER_URL).toContain("=");
    expect(DEFAULT_PROVIDER_URL).toMatch(/%[0-9A-F]{2}/u);
    // Odd, so the Value Field carries one byte of padding for the decode to remove.
    expect(DEFAULT_PROVIDER_URL.length % 2).toBe(1);
    expect(urValueField(DEFAULT_PROVIDER_URL).length).toBe(DEFAULT_PROVIDER_URL.length + 1);
  });

  it.each(JPIP_SET)("AC-3: %s", (uid) => {
    const el = parseDicom(jpipObject({ transferSyntax: uid })).get(PIXEL_DATA_PROVIDER_URL_TAG);
    expect(el?.vr).toBe("UR");
    // Byte-identical to the Value Field the fixture wrote, as inflated for the Deflate pair.
    expect(el?.rawBytes.equals(urValueField(DEFAULT_PROVIDER_URL))).toBe(true);
    expect(el?.value).toStrictEqual({ kind: "text", value: DEFAULT_PROVIDER_URL });
  });
});

describe("AC-4: nothing opens a connection to the host the URL names", () => {
  it("AC-4: parse, decode, deidentify and serializeDicom under all four UIDs reach no listener", async () => {
    let connections = 0;
    const server = createServer((_req, res) => {
      res.end();
    });
    server.on("connection", () => {
      connections += 1;
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const { port } = server.address() as AddressInfo;
      const url = providerUrl(`http://127.0.0.1:${String(port)}`);
      for (const uid of JPIP_SET) {
        const ds = parseDicom(jpipObject({ transferSyntax: uid, url }));
        const value = ds.get(PIXEL_DATA_PROVIDER_URL_TAG)?.value;
        expect(value).toStrictEqual({ kind: "text", value: url });
        expect(attempt(() => deidentify(ds)).thrown).toBeInstanceOf(DeidentifyError);
        expect(attempt(() => serializeDicom(ds)).thrown).toBeInstanceOf(Error);
      }
      // Let the event loop turn, twice over, so a connection anything scheduled would have landed.
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(connections).toBe(0);

      // Control: the counter does see a real request to that URL, so zero above is a measurement.
      const response = await fetch(url);
      await response.arrayBuffer();
      expect(connections).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });
});

describe("AC-5: a conformant JPIP fixture raises nothing, strict or profiled", () => {
  it.each(JPIP_SET)("AC-5: %s", (uid) => {
    const bytes = jpipObject({ transferSyntax: uid });
    const strict = parseDicom(bytes, { strict: true });
    expect(strict.fileMeta?.transferSyntaxUID).toBe(uid);
    expect(strict.warnings).toStrictEqual([]);
    const profiled = parseDicom(bytes, { profile: profiles.strict });
    expect(profiled.fileMeta?.transferSyntaxUID).toBe(uid);
    expect(profiled.warnings).toStrictEqual([]);
  });
});

describe("AC-6: a missing URL or a forbidden Pixel Data still parses, and nothing is invented", () => {
  it.each(JPIP_SET)("AC-6: %s with no (0028,7FE0)", (uid) => {
    const conformant = parseDicom(jpipObject({ transferSyntax: uid }));
    const ds = parseDicom(jpipObject({ transferSyntax: uid, omitUrl: true }));
    expect(metadata(ds)).toStrictEqual(metadata(conformant));
    expect(ds.has(PIXEL_DATA_PROVIDER_URL_TAG)).toBe(false);
    expect(ds.get(PIXEL_DATA_PROVIDER_URL_TAG)).toBeUndefined();
    // Exactly the elements the fixture wrote: the conformant set less the URL, nothing added.
    const tags = ds.elements().map((el) => el.tag);
    expect(tags).toStrictEqual(
      conformant
        .elements()
        .map((el) => el.tag)
        .filter((tag) => tag !== PIXEL_DATA_PROVIDER_URL_TAG),
    );
  });

  it.each(JPIP_SET)("AC-6: %s with a top-level Pixel Data section A.6 forbids", (uid) => {
    const conformant = parseDicom(jpipObject({ transferSyntax: uid }));
    const ds = parseDicom(jpipObject({ transferSyntax: uid, withPixelData: true }));
    expect(metadata(ds)).toStrictEqual(metadata(conformant));
    expect(ds.has("7FE00010")).toBe(true);
    expect(
      ds.get(PIXEL_DATA_PROVIDER_URL_TAG)?.rawBytes.equals(urValueField(DEFAULT_PROVIDER_URL)),
    ).toBe(true);
  });
});

describe("AC-7: a Deflate-pair Data Set that is not a raw-deflate stream is a fatal that quotes no zlib text", () => {
  const valid = deflateRawSync(jpipDataSet({}));
  const corrupted = Buffer.from(valid);
  // BFINAL=1 with BTYPE=11, the block type RFC 1951 section 3.2.3 reserves as an error.
  corrupted[0] = 0xff;
  const streams: readonly (readonly [string, Buffer])[] = [
    ["truncated mid-stream", valid.subarray(0, Math.floor(valid.length / 2))],
    ["corrupted bytes", corrupted],
    ["an RFC 1950 zlib-wrapped stream", deflateSync(jpipDataSet({}))],
  ];
  const cases = DEFLATE_PAIR.flatMap((uid) =>
    streams.map(([label, tail]) => [uid, label, tail] as const),
  );

  it.each(cases)("AC-7: %s, %s", (uid, _label, tail) => {
    // zlib's own message for exactly these bytes: what must not surface.
    const zlib = attempt(() => inflateRawSync(tail)).thrown;
    expect(zlib).toBeInstanceOf(Error);
    const zlibMessage = (zlib as Error).message;
    expect(zlibMessage.length).toBeGreaterThan(0);

    const { result, thrown } = attempt(() => parseDicom(jpipObjectWithDataSetBytes(uid, tail)));
    expect(result).toBeUndefined();
    expect(thrown).toBeInstanceOf(DicomParseError);
    const err = thrown as DicomParseError;
    expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
    expect(carries(err, zlibMessage)).toBe(false);

    // Control: the search finds zlib's text when an error does carry it, in a field or the message.
    expect(carries(Object.assign(new Error("fixed"), { detail: zlibMessage }), zlibMessage)).toBe(
      true,
    );
    expect(carries(new Error(`wrapped: ${zlibMessage}`), zlibMessage)).toBe(true);
  });
});

/**
 * A Deflate-pair Data Set that inflates to `DEFAULT_MAX_INFLATED_BYTES` and more: the conformant
 * JPIP Data Set, then an Encapsulated Document `(0042,0011)` `OB` whose Value Field is that many
 * zero bytes. Built from independently compressed, full-flushed 1 MiB pieces, so the stream is a
 * few hundred KiB and building it never holds the inflated bytes.
 */
function deflateBomb(): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16LE(0x0042, 0);
  header.writeUInt16LE(0x0011, 2);
  header.write("OB", 4, "ascii");
  header.writeUInt32LE(DEFAULT_MAX_INFLATED_BYTES, 8);
  const flush = { finishFlush: constants.Z_FULL_FLUSH };
  const mebibyte = 1024 * 1024;
  const zeros = deflateRawSync(Buffer.alloc(mebibyte), flush);
  const pieces = DEFAULT_MAX_INFLATED_BYTES / mebibyte;
  return Buffer.concat([
    deflateRawSync(Buffer.concat([jpipDataSet({}), header]), flush),
    ...Array.from({ length: pieces }, () => zeros),
    deflateRawSync(Buffer.alloc(0)),
  ]);
}

describe("AC-8: the decompression cap binds the path parseDicom dispatches the Deflate pair to", () => {
  const bomb = deflateBomb();

  it.each(DEFLATE_PAIR)(
    "AC-8: %s past DEFAULT_MAX_INFLATED_BYTES is INVALID_FILE_META at that cap",
    (uid) => {
      const { result, thrown } = attempt(() => parseDicom(jpipObjectWithDataSetBytes(uid, bomb)));
      // A boolean, not the Dataset: a returned one holds the whole inflated stream, and handing it
      // to the matcher's diff would exhaust the heap before the failure could be reported.
      expect(result === undefined, "parseDicom returned a Dataset past the cap").toBe(true);
      expect(thrown).toBeInstanceOf(DicomParseError);
      const err = thrown as DicomParseError;
      expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
      // The cap's own registry message at the DEFAULT cap: not an inflate failure, not a smaller
      // test-only cap, so this is the reader parseDicom dispatched to.
      expect(err.message).toContain(
        FATAL_MESSAGES.INFLATED_PAYLOAD_EXCEEDS_CAP.message.replace(
          "{n}",
          String(DEFAULT_MAX_INFLATED_BYTES),
        ),
      );
    },
    60_000,
  );
});

describe("AC-9: deidentify refuses every JPIP object with one typed code", () => {
  const TS_TWIN = "1.2.840.10008.1.2.1";
  const OPTION_SETS = [undefined, { retain: [...DEIDENTIFY_OPTIONS] }] as const;

  /** A caller-built Dataset: the twin's elements under a File Meta naming `transferSyntaxUID`. */
  function constructed(transferSyntaxUID: string): Dataset {
    const twin = parseDicom(jpipExplicitLeTwin({ transferSyntax: TS_TWIN }));
    return new Dataset({
      fileMeta: { transferSyntaxUID },
      warnings: [],
      elements: new Map(twin.elements().map((el) => [el.tag, el])),
    });
  }

  const shapes: readonly (readonly [string, (uid: string) => Dataset])[] = [
    ["parsed", (uid) => parseDicom(jpipObject({ transferSyntax: uid }))],
    [
      "parsed, no (0028,7FE0)",
      (uid) => parseDicom(jpipObject({ transferSyntax: uid, omitUrl: true })),
    ],
    ["constructed", (uid) => constructed(uid)],
    // The padded forms the parser would have trimmed from a `UI`, on a hand-built Dataset.
    ["constructed, NUL-padded", (uid) => constructed(`${uid}\0`)],
    ["constructed, space-padded", (uid) => constructed(`${uid} `)],
  ];
  const cases = JPIP_SET.flatMap((uid) =>
    shapes.map(([label, make]) => [uid, label, make] as const),
  );

  it.each(cases)("AC-9: %s, %s", (uid, _label, make) => {
    const ds = make(uid);
    for (const options of OPTION_SETS) {
      const { result, thrown } = attempt(() => deidentify(ds, options));
      expect(result).toBeUndefined();
      expect(thrown).toBeInstanceOf(DeidentifyError);
      const err = thrown as DeidentifyError;
      expect(Object.values(DEIDENTIFY_ERROR_CODES)).toContain(err.code);
      expect(err.code).not.toBe(DEIDENTIFY_ERROR_CODES.INVALID_OPTIONS);
      // One code for every UID, shape and option set: each row pins the same member.
      expect(err.code).toBe(DEIDENTIFY_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX);
    }
  });

  it("AC-9: every member of DEIDENTIFY_OPTIONS at once is a set deidentify would otherwise refuse as INVALID_OPTIONS", () => {
    // So the refusal above is not INVALID_OPTIONS only because it is checked first: on a non-JPIP
    // object the same options are rejected as a misconfiguration.
    const { thrown } = attempt(() =>
      deidentify(parseDicom(jpipExplicitLeTwin({ transferSyntax: TS_TWIN })), {
        retain: [...DEIDENTIFY_OPTIONS],
      }),
    );
    expect(thrown).toBeInstanceOf(DeidentifyError);
    expect((thrown as DeidentifyError).code).toBe(DEIDENTIFY_ERROR_CODES.INVALID_OPTIONS);
  });
});

describe("AC-10: the refusal carries no value from the object it refused", () => {
  const url = DEFAULT_PROVIDER_URL;
  const needles: readonly string[] = [
    url,
    new URL(url).pathname,
    new URL(url).search,
    PATIENT_NAME,
    PATIENT_ID,
    STUDY_INSTANCE_UID,
    SERIES_INSTANCE_UID,
  ];

  it.each(JPIP_SET)("AC-10: %s", (uid) => {
    const { thrown } = attempt(() =>
      deidentify(parseDicom(jpipObject({ transferSyntax: uid, url }))),
    );
    expect(thrown).toBeInstanceOf(DeidentifyError);
    const err = thrown as DeidentifyError;
    for (const needle of needles) {
      expect(carries(err, needle), needle).toBe(false);
    }
  });

  it("AC-10: control: the same search finds each value when an error does carry it", () => {
    const code = DEIDENTIFY_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX;
    for (const needle of needles) {
      expect(carries(new DeidentifyError(`refused ${needle}`, code), needle), needle).toBe(true);
      const withField = Object.assign(new DeidentifyError("refused", code), { detail: needle });
      expect(carries(withField, needle), needle).toBe(true);
    }
  });
});

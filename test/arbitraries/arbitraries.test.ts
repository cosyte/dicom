/**
 * The published generators, `@cosyte/dicom/arbitraries`, held to what their documentation says
 * they produce, and their writer held byte for byte to the test encoder `buildDicom`.
 *
 * Every sample here is drawn from a fixed seed, so each test sees the same values on every run.
 * The digests at the end pin what each generator draws from that seed: a change to a generator
 * that changes its output changes its digest, and the snapshot has to be updated in the same
 * change, where a reviewer reads it. Deflated Data Sets are left out of the digests (only the bytes
 * before the transfer syntax UID are kept), since another zlib can compress the same bytes
 * differently; the writer test compares them with `buildDicom` in one process instead.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  arbitraryBytes,
  dicomShapedGarbage,
  encodeModel,
  fatalInput,
  fuzzInput,
  recoverableInput,
  truncatedValidFile,
  wellFormedModel,
  type DicomModel,
} from "../../src/arbitraries/index.js";
import {
  DEFLATED_LE,
  EXPLICIT_BE,
  EXPLICIT_LE,
  IMPLICIT_LE,
  writePart10,
  type LeafElement,
  type Part10Spec,
  type SequenceElement,
} from "../../src/arbitraries/encode.js";
import { DicomParseError, FATAL_CODES, WARNING_CODES, parseDicom } from "../../src/index.js";
import type { Dataset } from "../../src/index.js";
import type { VR } from "../../src/dictionary/types.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";

const SEED = 20_261_111;

function sample<T>(arbitrary: fc.Arbitrary<T>, numRuns: number): T[] {
  return fc.sample(arbitrary, { seed: SEED, numRuns });
}

/** What reading `bytes` gives: the Dataset, or the code of the fatal error it threw. */
function read(bytes: Buffer): { readonly ds?: Dataset; readonly fatal?: string } {
  try {
    return { ds: parseDicom(bytes) };
  } catch (error) {
    if (error instanceof DicomParseError) return { fatal: error.code };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The writer, against buildDicom.
// ---------------------------------------------------------------------------

/** VRs the writer is asked for, with the width of one value: short and long form, swapped or not. */
const LEAF_VRS: readonly (readonly [VR, number])[] = [
  ["PN", 1],
  ["UI", 1],
  ["US", 2],
  ["UL", 4],
  ["FD", 8],
  ["OB", 1],
  ["OW", 2],
  ["UT", 1],
];

const tagArb = fc
  .tuple(fc.integer({ min: 0, max: 0xfffd }), fc.integer({ min: 0, max: 0xffff }))
  .map(([group, element]) =>
    `${group.toString(16).padStart(4, "0")}${element.toString(16).padStart(4, "0")}`.toUpperCase(),
  );

const leafArb: fc.Arbitrary<LeafElement> = fc
  .tuple(tagArb, fc.constantFrom(...LEAF_VRS), fc.integer({ min: 0, max: 3 }))
  .chain(([tag, [vr, width], count]) =>
    fc
      .uint8Array({ minLength: width * count * 2, maxLength: width * count * 2 })
      .map((bytes) => ({ tag, vr, value: Buffer.from(bytes) })),
  );

const sequenceArb: fc.Arbitrary<SequenceElement> = fc.record({
  tag: tagArb,
  items: fc.array(fc.array(leafArb, { maxLength: 3 }), { maxLength: 3 }),
});

const specArb: fc.Arbitrary<Part10Spec> = fc.record(
  {
    transferSyntax: fc.constantFrom(
      IMPLICIT_LE,
      EXPLICIT_LE,
      EXPLICIT_BE,
      DEFLATED_LE,
      "1.2.840.10008.1.2.7.1",
      "1.2.840.10008.1.2.4.50",
    ),
    elements: fc.array(fc.oneof(leafArb, sequenceArb), { maxLength: 4 }),
    noPreamble: fc.boolean(),
    groupLength: fc.constantFrom("short" as const, "omit" as const),
    noTransferSyntaxUid: fc.boolean(),
    trailing: fc.uint8Array({ maxLength: 8 }).map((bytes) => Buffer.from(bytes)),
  },
  { requiredKeys: ["transferSyntax", "elements"] },
);

/** A leaf element as `buildDicom` types it: the subpath types a VR as a plain string. */
function asBuilt(element: LeafElement): BuildDicomElement {
  return { tag: element.tag, vr: element.vr as VR, value: element.value };
}

/** The same file through `buildDicom`, the encoder the rest of the suite writes fixtures with. */
function throughBuildDicom(spec: Part10Spec): Buffer {
  const elements = spec.elements.map((element): BuildDicomElement | BuildDicomSqElement =>
    "items" in element
      ? {
          tag: element.tag,
          undefinedLength: true,
          items: element.items.map((item) => ({ elements: item.map(asBuilt) })),
        }
      : asBuilt(element),
  );
  return buildDicom({
    transferSyntax: spec.transferSyntax,
    elements,
    ...(spec.noPreamble === undefined ? {} : { skipPreamble: spec.noPreamble }),
    ...(spec.groupLength === undefined
      ? {}
      : { fileMetaGroupLength: spec.groupLength === "short" ? "wrong" : "omit" }),
    ...(spec.noTransferSyntaxUid === undefined
      ? {}
      : { skipTransferSyntaxUID: spec.noTransferSyntaxUid }),
    ...(spec.trailing === undefined ? {} : { trailingBytes: spec.trailing }),
  });
}

describe("the arbitraries' Part 10 writer", () => {
  it("writes every file byte for byte as buildDicom does", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        expect(writePart10(spec).toString("hex")).toBe(throughBuildDicom(spec).toString("hex"));
      }),
      { seed: SEED, numRuns: 400 },
    );
  });

  it("writes an eight-byte short group length as zero when File Meta is empty", () => {
    const file = writePart10({
      transferSyntax: EXPLICIT_LE,
      elements: [],
      groupLength: "short",
      noTransferSyntaxUid: true,
    });
    expect(file.toString("hex")).toBe(
      throughBuildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [],
        groupLength: "short",
        noTransferSyntaxUid: true,
      }).toString("hex"),
    );
    expect(file.readUInt32LE(132 + 8)).toBe(0);
  });

  it("swaps a big-endian value and leaves the caller's bytes as they were", () => {
    const value = Buffer.from([1, 2, 3, 4]);
    const file = writePart10({
      transferSyntax: EXPLICIT_BE,
      elements: [{ tag: "00280010", vr: "US", value }],
    });
    expect(file.subarray(-4).toString("hex")).toBe("02010403");
    expect(value.toString("hex")).toBe("01020304");
  });
});

// ---------------------------------------------------------------------------
// Well-formed models.
// ---------------------------------------------------------------------------

const MODEL_TAGS: Readonly<Record<string, VR>> = {
  "00080018": "UI",
  "00080020": "DA",
  "00080030": "TM",
  "00080060": "CS",
  "00100010": "PN",
  "00100020": "LO",
  "00100040": "CS",
  "00181030": "LO",
  "0020000D": "UI",
  "0020000E": "UI",
  "00280010": "US",
  "00280011": "US",
};

const TEXT = /^[A-Za-z0-9 .\-^]+$/u;

describe("wellFormedModel", () => {
  const models = sample(wellFormedModel(), 2_000);

  it("draws each of its three syntaxes, never Explicit VR Big Endian", () => {
    expect(new Set(models.map((m) => m.transferSyntax))).toStrictEqual(
      new Set([IMPLICIT_LE, EXPLICIT_LE, DEFLATED_LE]),
    );
  });

  it("holds 0 to 6 elements, keyed by tag, with the dictionary VR", () => {
    const sizes = models.map((m) => Object.keys(m.elements).length);
    expect(Math.min(...sizes)).toBe(0);
    expect(Math.max(...sizes)).toBe(6);
    for (const model of models) {
      for (const [key, element] of Object.entries(model.elements)) {
        expect(element.tag).toBe(key);
        expect(element.vr).toBe(MODEL_TAGS[key]);
      }
    }
    const seen = new Set(models.flatMap((m) => Object.keys(m.elements)));
    expect(seen).toStrictEqual(new Set(Object.keys(MODEL_TAGS)));
  });

  it("gives US two bytes and text 1 to 14 characters, space-padded to an even length", () => {
    const lengths = new Set<number>();
    let padded = 0;
    for (const model of models) {
      for (const element of Object.values(model.elements)) {
        expect(element.valueHex).toMatch(/^(?:[0-9a-f]{2})+$/u);
        const value = Buffer.from(element.valueHex, "hex");
        if (element.vr === "US") {
          expect(value.length).toBe(2);
          continue;
        }
        const text = value.toString("latin1");
        expect(text).toMatch(TEXT);
        expect(value.length % 2).toBe(0);
        lengths.add(value.length);
        if (text.endsWith(" ")) padded += 1;
      }
    }
    expect(Math.min(...lengths)).toBe(2);
    expect(Math.max(...lengths)).toBe(14);
    expect(padded).toBeGreaterThan(0);
  });

  it("draws the whole range of an unsigned short", () => {
    const values = models.flatMap((m) =>
      Object.values(m.elements)
        .filter((e) => e.vr === "US")
        .map((e) => Buffer.from(e.valueHex, "hex").readUInt16LE()),
    );
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(0xffff);
  });
});

describe("encodeModel", () => {
  it("writes the elements in ascending tag order, as buildDicom writes them", () => {
    for (const model of sample(wellFormedModel(), 300)) {
      const sorted = Object.keys(model.elements).sort();
      const expected = buildDicom({
        transferSyntax: model.transferSyntax,
        elements: sorted.map((tag) => {
          const element = model.elements[tag];
          if (element === undefined) throw new Error(tag);
          return { tag, vr: element.vr as VR, value: Buffer.from(element.valueHex, "hex") };
        }),
      });
      expect(encodeModel(model).toString("hex")).toBe(expected.toString("hex"));
    }
  });

  it("encodes a file that reads back with no warning", () => {
    const model: DicomModel = {
      transferSyntax: EXPLICIT_LE,
      elements: {
        "00280010": { tag: "00280010", vr: "US", valueHex: "0002" },
        "00100010": {
          tag: "00100010",
          vr: "PN",
          valueHex: Buffer.from("TEST^ONE").toString("hex"),
        },
      },
    };
    const ds = parseDicom(encodeModel(model));
    expect(ds.warnings).toStrictEqual([]);
    expect(ds.elements().map((e) => e.tag)).toStrictEqual(["00100010", "00280010"]);
  });
});

// ---------------------------------------------------------------------------
// Recoverable, refused and hostile input.
// ---------------------------------------------------------------------------

describe("recoverableInput", () => {
  const reads = sample(recoverableInput(), 3_000).map(read);
  const warnings = new Set(reads.flatMap((r) => r.ds?.warnings.map((w) => w.code) ?? []));
  const fatals = new Set(reads.flatMap((r) => (r.fatal === undefined ? [] : [r.fatal])));

  it("carries each deviation it documents, each recovered with its warning", () => {
    for (const code of [
      WARNING_CODES.DICOM_MISSING_PREAMBLE,
      WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH,
      WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING,
      WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED,
      WARNING_CODES.DICOM_GROUP_LENGTH_IN_DATASET,
      WARNING_CODES.DICOM_EMPTY_ITEM_IN_SEQUENCE,
      WARNING_CODES.DICOM_NONZERO_RESERVED_BYTES,
    ]) {
      expect(warnings, code).toContain(code);
    }
  });

  it("folds in every fatal the reader has", () => {
    expect(fatals).toStrictEqual(new Set(Object.values(FATAL_CODES)));
  });

  it("holds a conformant sequence of one item that reads with no warning", () => {
    const clean = reads.filter(
      (r) =>
        r.ds?.warnings.length === 0 &&
        r.ds.get("0040A730")?.items?.[0]?.get("00080100") !== undefined,
    );
    expect(clean.length).toBeGreaterThan(0);
  });

  it("writes its deviations beside the invented name, under both little-endian syntaxes", () => {
    const named = reads.filter((r) => r.ds?.get("00100010") !== undefined);
    const syntaxes = new Set(named.map((r) => r.ds?.fileMeta?.transferSyntaxUID));
    expect(syntaxes).toContain(IMPLICIT_LE);
    expect(syntaxes).toContain(EXPLICIT_LE);
    expect(
      named.some((r) => r.ds?.get("00100010")?.rawBytes.toString("latin1") === "SYNTHETIC^TEST"),
    ).toBe(true);
  });
});

describe("fatalInput", () => {
  it("is always refused, with each of the four fatal codes", () => {
    const reads = sample(fatalInput(), 400).map(read);
    expect(reads.every((r) => r.fatal !== undefined)).toBe(true);
    expect(new Set(reads.map((r) => r.fatal))).toStrictEqual(new Set(Object.values(FATAL_CODES)));
  });

  it("writes text that is not Part 10 behind a NOTDICOM- prefix, 25 to 73 characters long", () => {
    const text = sample(fatalInput(), 400).filter(
      (b) => b.subarray(0, 9).toString() === "NOTDICOM-",
    );
    expect(text.length).toBeGreaterThan(0);
    const lengths = text.map((b) => b.toString().length);
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(73);
  });
});

describe("the hostile generators", () => {
  it("arbitraryBytes draws 0 to 512 bytes", () => {
    const lengths = sample(arbitraryBytes(), 2_000).map((b) => b.length);
    expect(Math.min(...lengths)).toBe(0);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(512);
    expect(Math.max(...lengths)).toBeGreaterThan(400);
  });

  it("dicomShapedGarbage is a zero preamble, DICM, then up to 400 random bytes", () => {
    const files = sample(dicomShapedGarbage(), 2_000);
    for (const file of files) {
      expect(file.subarray(0, 128).equals(Buffer.alloc(128))).toBe(true);
      expect(file.subarray(128, 132).toString()).toBe("DICM");
    }
    const lengths = files.map((f) => f.length - 132);
    expect(Math.min(...lengths)).toBe(0);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(400);
    expect(Math.max(...lengths)).toBeGreaterThan(300);
  });

  it("truncatedValidFile cuts a file under each of the four syntaxes, from nothing to whole", () => {
    const files = sample(truncatedValidFile(), 2_000);
    for (const syntax of [IMPLICIT_LE, EXPLICIT_LE, EXPLICIT_BE, DEFLATED_LE]) {
      const uid = Buffer.from(syntax.length % 2 === 0 ? syntax : `${syntax}\0`);
      expect(
        files.some((f) => f.includes(uid)),
        syntax,
      ).toBe(true);
    }
    const whole = files
      .map(read)
      .filter(
        (r) =>
          r.ds?.warnings.length === 0 &&
          r.ds.get("0040A730")?.items?.[0]?.get("00080100") !== undefined,
      );
    expect(whole.length).toBeGreaterThan(0);
    for (const r of whole) {
      expect(r.ds?.get("00100010")?.rawBytes.toString()).toBe("SYNTHETIC^TEST");
      expect(r.ds?.get("00280010")?.rawBytes.length).toBe(2);
      expect(r.ds?.get("00080060")?.rawBytes.toString()).toBe("CT");
      expect(r.ds?.get("0040A730")?.items?.[0]?.get("00080100")?.rawBytes.toString()).toBe("CODE");
    }
    expect(new Set(whole.map((r) => r.ds?.fileMeta?.transferSyntaxUID)).size).toBeGreaterThan(1);
    const lengths = files.map((f) => f.length);
    expect(Math.min(...lengths)).toBe(0);
    expect(new Set(lengths).size).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// Digests: what each generator draws from the fixed seed.
// ---------------------------------------------------------------------------

const DEFLATED_UID = Buffer.from(DEFLATED_LE);

/** The bytes of one sample a digest reads: a deflated file only up to its transfer syntax UID. */
function stableBytes(bytes: Buffer): Buffer {
  const at = bytes.indexOf(DEFLATED_UID);
  return at < 0 ? bytes : bytes.subarray(0, at);
}

function digest(samples: readonly Buffer[], keep = stableBytes): string {
  const hash = createHash("sha256");
  for (const bytes of samples) {
    const kept = keep(bytes);
    hash.update(`${String(kept.length)}:`);
    hash.update(kept);
  }
  return hash.digest("hex");
}

describe("what each generator draws from a fixed seed", () => {
  it("is pinned", () => {
    const models = sample(wellFormedModel(), 300);
    expect({
      wellFormedModel: digest(
        models.map((m) => Buffer.from(JSON.stringify(m))),
        (bytes) => bytes,
      ),
      encodeModel: digest(models.map(encodeModel)),
      recoverableInput: digest(sample(recoverableInput(), 300)),
      fatalInput: digest(sample(fatalInput(), 100)),
      arbitraryBytes: digest(sample(arbitraryBytes(), 100)),
      dicomShapedGarbage: digest(sample(dicomShapedGarbage(), 100)),
      truncatedValidFile: digest(sample(truncatedValidFile(), 300)),
      fuzzInput: digest(sample(fuzzInput(), 300)),
    }).toMatchSnapshot();
  });
});

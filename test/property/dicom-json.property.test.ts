/**
 * Round-trip property for the DICOM JSON Model converters (PS3.18 Annex F).
 *
 * For a generated DICOM JSON Data Set in the form `toDicomJson` writes (every key ascending,
 * values of the VR's JSON type, nested Sequences two deep), under each uncompressed Transfer
 * Syntax and each way of delimiting a Sequence:
 *
 *   1. `fromDicomJson`, `serializeDicom`, `parseDicom` then `toDicomJson` gives the same JSON text;
 *   2. that JSON, through `fromDicomJson` and `serializeDicom` again, gives the same Part 10 bytes.
 *
 * So Part 10 to JSON to Part 10 is byte-identical on every Data Set this draws, and JSON to Part
 * 10 to JSON loses nothing.
 *
 * A second pair of properties draws the shapes a converter could change silently: a VR Implicit
 * VR reads back as another, a delimiter inside one value, a `DS` past what a double holds, an `FL`
 * below float32's normal range, a Person Name of four or five groups, bytes that are not UTF-8
 * under `ISO_IR 192`, and Pixel Data with and without the inline opt-in. Each comes back exactly,
 * or is refused with the code for its shape; never anything else.
 *
 * Depth and seed come from `COSYTE_PROPERTY_RUNS` and `COSYTE_PROPERTY_SEED`
 * (`test/helpers/property.ts`). Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, it } from "vitest";

import {
  DicomJsonError,
  fromDicomJson,
  parseDicom,
  serializeDicom,
  toDicomJson,
  type DicomJsonAttribute,
  type DicomJsonDataset,
  type DicomJsonPersonName,
  type DicomJsonValue,
} from "../../src/index.js";
import { buildDicom, type BuildDicomElement } from "../helpers/build-dicom.js";
import { checkProperty } from "../helpers/property.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

const UPPER = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"];
const NAME = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz^Éè"];
const FREE = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,\\-é"];

function chars(alphabet: readonly string[], maxLength: number): fc.Arbitrary<string> {
  return fc
    .string({ unit: fc.constantFrom(...alphabet), minLength: 1, maxLength })
    .filter((s) => !s.endsWith(" "));
}

/** One to three values, any but the only one possibly empty. */
function strings(value: fc.Arbitrary<string>): fc.Arbitrary<(string | null)[]> {
  return fc.oneof(
    value.map((v) => [v]),
    fc.array(fc.option(value, { nil: null }), { minLength: 2, maxLength: 3 }),
  );
}

const personName = fc
  .record(
    {
      Alphabetic: chars(NAME, 20),
      Ideographic: chars(NAME, 10),
      Phonetic: chars(NAME, 10),
    },
    { requiredKeys: ["Alphabetic"] },
  )
  .map((pn): DicomJsonPersonName => {
    const out: { Alphabetic: string; Ideographic?: string; Phonetic?: string } = {
      Alphabetic: pn.Alphabetic,
    };
    if (pn.Ideographic !== undefined) out.Ideographic = pn.Ideographic;
    if (pn.Phonetic !== undefined) out.Phonetic = pn.Phonetic;
    return out;
  });

const decimal = fc
  .double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 })
  .filter((n) => String(n).length <= 16 && !Object.is(n, -0));

const uid = fc
  .array(fc.integer({ min: 1, max: 99999 }), { minLength: 2, maxLength: 6 })
  .map((parts) => `1.2.826.0.1.3680043.8.498.${parts.join(".")}`);

const tag = fc
  .integer({ min: 0, max: 0xffffffff })
  .map((n) => n.toString(16).toUpperCase().padStart(8, "0"));

function numbers(arb: fc.Arbitrary<number>): fc.Arbitrary<number[]> {
  return fc.array(arb, { minLength: 1, maxLength: 4 });
}

/** Base64 of an even number of bytes: an odd value is padded on write, so it would not come back. */
function evenBase64(): fc.Arbitrary<string> {
  return fc
    .uint8Array({ minLength: 1, maxLength: 12 })
    .map((bytes) => Buffer.concat([Buffer.from(bytes), Buffer.from(bytes)]).toString("base64"));
}

function value(
  vr: string,
  values: fc.Arbitrary<DicomJsonValue[]>,
): fc.Arbitrary<DicomJsonAttribute> {
  return fc.oneof(
    { weight: 6, arbitrary: values.map((v): DicomJsonAttribute => ({ vr, Value: v })) },
    { weight: 1, arbitrary: fc.constant({ vr }) },
  );
}

/** The attributes a Data Set draws from: registered tags with the one VR PS3.6 gives each. */
function attributes(bigEndian: boolean): Record<string, fc.Arbitrary<DicomJsonAttribute>> {
  const out: Record<string, fc.Arbitrary<DicomJsonAttribute>> = {
    "00080008": value("CS", strings(chars(UPPER, 16))),
    "00080020": value("DA", strings(fc.constantFrom("19000101", "19001231"))),
    "00089459": value(
      "FL",
      numbers(fc.float({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Object.is(n, -0))),
    ),
    "00081161": value("UL", numbers(fc.integer({ min: 0, max: 0xffffffff }))),
    "00100010": value("PN", fc.array(personName, { minLength: 1, maxLength: 2 })),
    "00100020": value(
      "LO",
      strings(
        chars(
          FREE.filter((c) => c !== "\\"),
          64,
        ),
      ),
    ),
    "00101020": value("DS", fc.array(decimal, { minLength: 1, maxLength: 3 })),
    "00104000": value(
      "LT",
      chars(FREE, 200).map((s) => [s]),
    ),
    "00186020": value("SL", numbers(fc.integer({ min: -0x80000000, max: 0x7fffffff }))),
    "00189089": value(
      "FD",
      numbers(fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Object.is(n, -0))),
    ),
    "00189219": value("SS", numbers(fc.integer({ min: -0x8000, max: 0x7fff }))),
    "0020000D": value(
      "UI",
      uid.map((u) => [u]),
    ),
    "00200013": value(
      "IS",
      fc.array(fc.integer({ min: -0x80000000, max: 0x7fffffff }), { minLength: 1, maxLength: 3 }),
    ),
    "00209165": value("AT", fc.array(tag, { minLength: 1, maxLength: 3 })),
    "00280010": value("US", numbers(fc.integer({ min: 0, max: 0xffff }))),
    "00282000": fc.oneof(
      evenBase64().map((b) => ({ vr: "OB", InlineBinary: b })),
      fc.constant({ vr: "OB" }),
    ),
  };
  if (!bigEndian) {
    out["00281201"] = evenBase64().map((b) => ({ vr: "OW", InlineBinary: b }));
  }
  return out;
}

/** A Data Set with its keys ascending, as `toDicomJson` writes one; Sequences `depth` deep. */
function dataset(bigEndian: boolean, depth: number): fc.Arbitrary<DicomJsonDataset> {
  const fields: Record<string, fc.Arbitrary<DicomJsonAttribute>> = attributes(bigEndian);
  if (depth > 0) {
    fields["0040A730"] = fc.oneof(
      fc
        .array(dataset(bigEndian, depth - 1), { minLength: 1, maxLength: 2 })
        .map((items): DicomJsonAttribute => ({ vr: "SQ", Value: items })),
      fc.constant({ vr: "SQ" }),
    );
  }
  return fc.record(fields, { requiredKeys: [] }).map((record) => {
    const out: Record<string, DicomJsonAttribute> = {};
    for (const key of Object.keys(record).sort()) {
      const attr = record[key];
      if (attr !== undefined) out[key] = attr;
    }
    return out;
  });
}

const cases = fc
  .record({
    transferSyntaxUID: fc.constantFrom(
      TS_IMPLICIT_LE,
      TS_EXPLICIT_LE,
      TS_EXPLICIT_BE,
      TS_DEFLATED_LE,
    ),
    sequenceLength: fc.constantFrom("defined" as const, "undefined" as const),
  })
  .chain(({ transferSyntaxUID, sequenceLength }) =>
    dataset(transferSyntaxUID === TS_EXPLICIT_BE, 2).map((json) => ({
      transferSyntaxUID,
      sequenceLength,
      json,
    })),
  );

describe("dicom conformance: DICOM JSON Model round trip", () => {
  it("JSON to Part 10 to JSON is the same JSON, and Part 10 to JSON to Part 10 the same bytes", () => {
    checkProperty(
      "DICOM JSON round trip",
      fc.property(cases, ({ transferSyntaxUID, sequenceLength, json }) => {
        const options = { fileMeta: { transferSyntaxUID }, sequenceLength };
        const bytes = serializeDicom(fromDicomJson(json, options));
        const back = JSON.parse(JSON.stringify(toDicomJson(parseDicom(bytes)))) as DicomJsonDataset;
        if (JSON.stringify(back) !== JSON.stringify(json)) return false;
        const again = serializeDicom(fromDicomJson(back, options));
        return again.equals(bytes);
      }),
    );
  });
});

/** The code `fn` is refused with, or `undefined` when it returns. Any other error fails the case. */
function refusalOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof DicomJsonError) return err.code;
    throw err;
  }
  return undefined;
}

/** A JSON text with its keys sorted, so two Data Sets compare by content alone. */
function canonical(json: DicomJsonDataset): string {
  return JSON.stringify(json, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** One JSON shape, the Transfer Syntax it is written under, and the code that may refuse it. */
interface JsonCase {
  readonly json: DicomJsonDataset;
  readonly transferSyntaxUID: string;
  readonly code: string;
}

const anySyntax = fc.constantFrom(TS_IMPLICIT_LE, TS_EXPLICIT_LE, TS_EXPLICIT_BE, TS_DEFLATED_LE);

/** A VR the Implicit VR reader may give the tag back as another one, with Pixel Representation or not. */
const implicitVrCase: fc.Arbitrary<JsonCase> = fc
  .record({
    pixelRepresentation: fc.option(fc.constantFrom(0, 1), { nil: undefined }),
    pick: fc.constantFrom(
      ["00280106", "SS"],
      ["00280106", "US"],
      ["00280010", "US"],
      ["00280010", "UL"],
      ["00280010", "SS"],
      ["00091001", "DS"],
      ["00091001", "UN"],
    ),
    n: fc.integer({ min: 0, max: 0x7fff }),
    transferSyntaxUID: anySyntax,
  })
  .map(({ pixelRepresentation, pick, n, transferSyntaxUID }) => {
    const [tag, vr] = pick as [string, string];
    const json: Record<string, DicomJsonAttribute> = {};
    if (pixelRepresentation !== undefined) {
      json["00280103"] = { vr: "US", Value: [pixelRepresentation] };
    }
    if (tag.startsWith("0009")) json["00090010"] = { vr: "LO", Value: ["SYNTHETIC CREATOR"] };
    json[tag] =
      vr === "UN"
        ? { vr, InlineBinary: Buffer.from([n & 0xff, n >> 8]).toString("base64") }
        : { vr, Value: [n] };
    return { json, transferSyntaxUID, code: "VR_MISMATCH" };
  });

/** A string or Person Name value that may hold the delimiters its VR splits on. */
const delimiterCase: fc.Arbitrary<JsonCase> = fc
  .record({
    vr: fc.constantFrom("CS", "LO", "SH", "PN", "LT"),
    texts: fc.array(chars([..."AB^=\\"], 6), { minLength: 1, maxLength: 3 }),
    transferSyntaxUID: anySyntax,
  })
  .map(({ vr, texts, transferSyntaxUID }) => {
    const values: DicomJsonValue[] =
      vr === "PN" ? texts.map((t) => ({ Alphabetic: t })) : vr === "LT" ? texts.slice(0, 1) : texts;
    const tags: Record<string, string> = {
      CS: "00080060",
      LO: "00100020",
      SH: "00080050",
      PN: "00100010",
      LT: "00104000",
    };
    const tag = tags[vr] as string;
    return { json: { [tag]: { vr, Value: values } }, transferSyntaxUID, code: "INVALID_JSON" };
  });

/** An FL or DS number: float32 values, and doubles past float32's range or below its normal one. */
const numberCase: fc.Arbitrary<JsonCase> = fc
  .record({
    vr: fc.constantFrom("FL", "DS"),
    n: fc.oneof(
      fc.float({ noNaN: true, noDefaultInfinity: true }),
      fc.double({ noNaN: true, min: -1e-38, max: 1e-38 }),
      fc.double({ noNaN: true, noDefaultInfinity: true, min: 3.5e38 }),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
    ),
    transferSyntaxUID: anySyntax,
  })
  .filter(
    ({ vr, n }) =>
      vr === "DS" ||
      !Number.isFinite(Math.fround(n)) ||
      Math.abs(n) < 2 ** -126 ||
      Math.fround(n) === n,
  )
  .map(({ vr, n, transferSyntaxUID }) => ({
    json: { [vr === "FL" ? "00089459" : "00101020"]: { vr, Value: [n] } },
    transferSyntaxUID,
    code: "UNREPRESENTABLE_NUMBER",
  }));

/** A decimal text as an exact rational: an integer and a power of ten, by BigInt arithmetic. */
function exactDecimal(text: string): readonly [bigint, number] {
  const [mantissa = "", exponent = "0"] = text.trim().toLowerCase().split("e");
  const [whole = "", fraction = ""] = mantissa.split(".");
  const sign = whole.startsWith("-") ? -1n : 1n;
  const digits = `${whole.replace(/^[+-]/u, "")}${fraction}`;
  return [sign * BigInt(digits === "" ? "0" : digits), Number(exponent) - fraction.length];
}

/** `true` when two decimal texts name one value, compared by BigInt cross-scaling. */
function sameDecimal(a: string, b: string): boolean {
  const [ma, ea] = exactDecimal(a);
  const [mb, eb] = exactDecimal(b);
  const low = Math.min(ea, eb);
  return ma * 10n ** BigInt(ea - low) === mb * 10n ** BigInt(eb - low);
}

/** DS text of up to 16 characters: integers past 2^53, long fractions, and exponents. */
const dsText: fc.Arbitrary<string> = fc
  .oneof(
    fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 1, maxLength: 16 }),
    fc
      .tuple(
        fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 1, maxLength: 8 }),
        fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 1, maxLength: 8 }),
      )
      .map(([w, f]) => `-${w}.${f}`),
    fc
      .tuple(fc.integer({ min: 1, max: 99999 }), fc.integer({ min: -400, max: 400 }))
      .map(([m, e]) => `${m}E${e}`),
  )
  .filter((t) => t.length <= 16);

/** One Part 10 element of a shape a converter could change, and the code that may refuse it. */
interface Part10Case {
  readonly elements: BuildDicomElement[];
  readonly code: string;
  readonly inline: boolean;
  /** `false` when the shape must be refused. */
  readonly exact: boolean;
}

const part10Case: fc.Arbitrary<Part10Case> = fc.oneof(
  // A Person Name of one to five groups: past three is refused, never truncated.
  fc.array(chars([..."ABCDEZ^"], 6), { minLength: 1, maxLength: 5 }).map((groups): Part10Case => {
    const text = groups.join("=");
    return {
      elements: [
        {
          tag: "00100010",
          vr: "PN",
          value: Buffer.from(text.length % 2 === 1 ? `${text} ` : text),
        },
      ],
      code: "MALFORMED_VALUE",
      inline: false,
      exact: groups.length <= 3,
    };
  }),
  // Bytes under ISO_IR 192, valid UTF-8 or not: never read as U+FFFD.
  fc
    .uint8Array({ minLength: 1, maxLength: 12 })
    .map((raw) => Buffer.from(raw.filter((b) => b !== 0x00 && b !== 0x20 && b !== 0x5c)))
    .filter((bytes) => bytes.length > 0)
    .map((bytes): Part10Case => {
      const valid = Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes);
      const value = bytes.length % 2 === 1 ? Buffer.concat([bytes, Buffer.from(" ")]) : bytes;
      return {
        elements: [
          { tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 192") },
          { tag: "00100020", vr: "LO", value },
        ],
        code: "MALFORMED_VALUE",
        inline: false,
        exact: valid,
      };
    }),
  // Pixel Data, inline only on request.
  fc
    .record({ bytes: fc.uint8Array({ minLength: 1, maxLength: 8 }), inline: fc.boolean() })
    .map(({ bytes, inline }): Part10Case => {
      const value = Buffer.concat([Buffer.from(bytes), Buffer.from(bytes)]);
      return {
        elements: [{ tag: "7FE00010", vr: "OW", value }],
        code: "BULK_DATA_URI_REQUIRED",
        inline,
        exact: inline,
      };
    }),
);

describe("dicom conformance: DICOM JSON Model, exact or refused", () => {
  it("JSON of any of these shapes comes back exactly or is refused with its code", () => {
    checkProperty(
      "DICOM JSON exact or refused, from JSON",
      fc.property(
        fc.oneof(implicitVrCase, delimiterCase, numberCase),
        ({ json, transferSyntaxUID, code }) => {
          let back: DicomJsonDataset | undefined;
          const refused = refusalOf(() => {
            back = toDicomJson(fromDicomJson(json, { fileMeta: { transferSyntaxUID } }));
          });
          if (refused !== undefined) return refused === code;
          return canonical(back as DicomJsonDataset) === canonical(json);
        },
      ),
    );
  });

  it("Part 10 of any of these shapes comes back exactly or is refused with its code", () => {
    checkProperty(
      "DICOM JSON exact or refused, from Part 10",
      fc.property(part10Case, ({ elements, code, inline, exact }) => {
        const source = parseDicom(buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements }));
        let json: DicomJsonDataset | undefined;
        const refused = refusalOf(() => {
          json = JSON.parse(
            JSON.stringify(toDicomJson(source, { inlineBulkData: inline })),
          ) as DicomJsonDataset;
        });
        if (refused !== undefined) return refused === code && !exact;
        if (!exact) return false;
        const back = fromDicomJson(json as DicomJsonDataset, {
          fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE },
        });
        return serializeDicom(back).equals(serializeDicom(source));
      }),
    );
  });

  it("a DS comes back with the decimal value of its text, or is refused", () => {
    checkProperty(
      "DICOM JSON DS exact or refused",
      fc.property(dsText, (text) => {
        const padded = text.length % 2 === 1 ? `${text} ` : text;
        const elements: BuildDicomElement[] = [
          { tag: "00101020", vr: "DS", value: Buffer.from(padded, "latin1") },
        ];
        const source = parseDicom(buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements }));
        let json: DicomJsonDataset | undefined;
        const refused = refusalOf(() => {
          json = JSON.parse(JSON.stringify(toDicomJson(source))) as DicomJsonDataset;
        });
        if (refused !== undefined) return refused === "UNREPRESENTABLE_NUMBER";
        const n = (json as DicomJsonDataset)["00101020"]?.Value?.[0] as number;
        if (!sameDecimal(text, JSON.stringify(n))) return false;
        const back = fromDicomJson(json as DicomJsonDataset, {
          fileMeta: { transferSyntaxUID: TS_EXPLICIT_LE },
        });
        const written = Buffer.from(back.get("00101020")?.rawBytes ?? [])
          .toString("latin1")
          .trim();
        return sameDecimal(text, written);
      }),
    );
  });
});

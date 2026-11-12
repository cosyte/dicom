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
 * 10 to JSON loses nothing. Depth and seed come from `COSYTE_PROPERTY_RUNS` and
 * `COSYTE_PROPERTY_SEED` (`test/helpers/property.ts`). Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, it } from "vitest";

import {
  fromDicomJson,
  parseDicom,
  serializeDicom,
  toDicomJson,
  type DicomJsonAttribute,
  type DicomJsonDataset,
  type DicomJsonPersonName,
  type DicomJsonValue,
} from "../../src/index.js";
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

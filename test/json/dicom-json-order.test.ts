/**
 * The order of a DICOM JSON Data Set's attributes. PS3.18 F.2.2 orders them by property name, the
 * tag, ascending. A plain JavaScript object cannot hold that order for every tag: an all-digit tag
 * with no leading zero, such as `60000010` Overlay Rows, is an integer index, which every object
 * lists before its other keys, so `JSON.stringify` writes it first. `stringifyDicomJson` writes the
 * text in the annex's order at every depth. Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomJsonError,
  parseDicom,
  stringifyDicomJson,
  toDicomJson,
  type DicomJsonDataset,
} from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

function latin1(s: string): Buffer {
  return Buffer.from(s, "latin1");
}

/** The tags of every Data Set in `text`, in the order the text writes them, depth first. */
function tagOrder(text: string): string[] {
  return [...text.matchAll(/"([0-9A-Fa-f]{8})":/gu)].map((m) => m[1] as string);
}

/** A synthetic object whose tags include integer-index keys, at the top and inside an Item. */
const source = buildDicom({
  transferSyntax: TS_EXPLICIT_LE,
  elements: [
    { tag: "00080005", vr: "CS", value: latin1("ISO_IR 100") },
    { tag: "00080060", vr: "CS", value: latin1("OT") },
    {
      tag: "00081032",
      items: [
        {
          elements: [
            { tag: "00080100", vr: "SH", value: latin1("P-0001") },
            { tag: "20000010", vr: "IS", value: latin1("1 ") },
            { tag: "60000010", vr: "US", value: Buffer.from([4, 0]) },
          ],
        },
      ],
    },
    { tag: "00100020", vr: "LO", value: latin1("MRN-42") },
    { tag: "20000010", vr: "IS", value: latin1("2 ") },
    { tag: "60000010", vr: "US", value: Buffer.from([8, 0]) },
    { tag: "60000011", vr: "US", value: Buffer.from([8, 0]) },
  ],
});

describe("attribute order (PS3.18 F.2.2)", () => {
  it("is what JSON.stringify breaks for an all-digit tag", () => {
    const json = toDicomJson(parseDicom(source));
    expect(tagOrder(JSON.stringify(json))[0]).toBe("20000010");
  });

  it("is ascending in the text stringifyDicomJson writes, at every depth", () => {
    const text = stringifyDicomJson(toDicomJson(parseDicom(source)));
    expect(tagOrder(text)).toEqual([
      "00080005",
      "00080060",
      "00081032",
      "00080100",
      "20000010",
      "60000010",
      "00100020",
      "20000010",
      "60000010",
      "60000011",
    ]);
    expect(JSON.parse(text)).toEqual(toDicomJson(parseDicom(source)));
  });

  it("orders a Data Set given in any order, and leaves each attribute's own fields as given", () => {
    const json: DicomJsonDataset = {
      "60000010": { vr: "US", Value: [8] },
      "0020000D": { vr: "UI", Value: ["1.2.3"] },
      "00100010": { Value: [{ Phonetic: "P", Alphabetic: "DOE^JANE" }], vr: "PN" },
      "00080005": { vr: "CS" },
    };
    expect(stringifyDicomJson(json)).toBe(
      '{"00080005":{"vr":"CS"},"00100010":{"Value":[{"Phonetic":"P","Alphabetic":"DOE^JANE"}],"vr":"PN"},' +
        '"0020000D":{"vr":"UI","Value":["1.2.3"]},"60000010":{"vr":"US","Value":[8]}}',
    );
  });

  it("writes the same text as JSON.stringify where the object already holds the order", () => {
    const json: DicomJsonDataset = {
      "00080005": { vr: "CS", Value: ["ISO_IR 192"] },
      "00080008": { vr: "CS", Value: ["ORIGINAL", null, "AXIAL"] },
      "00081032": {
        vr: "SQ",
        Value: [{}, { "00080100": { vr: "SH", Value: ["P-0001"] } }],
      },
      "00081140": { vr: "SQ", Value: [] },
      "00100010": { vr: "PN", Value: [{ Alphabetic: "DOE^JANE" }, null] },
      "00280030": { vr: "DS", Value: [0.5, -1e-7] },
      "00282000": { vr: "OB", InlineBinary: "AQIDBA==" },
    };
    for (const space of [undefined, -1, 0, 2, 2.5, 4, 20, "\t", "", "-----------x"] as const) {
      expect(stringifyDicomJson(json, space)).toBe(JSON.stringify(json, null, space));
    }
    expect(stringifyDicomJson({})).toBe("{}");
    expect(stringifyDicomJson({}, 2)).toBe("{}");
  });

  it("indents nested Items by depth when given a space", () => {
    const json: DicomJsonDataset = {
      "60000010": { vr: "US", Value: [8] },
      "00081032": { vr: "SQ", Value: [{ "60000010": { vr: "US" }, "00080100": { vr: "SH" } }] },
    };
    expect(stringifyDicomJson(json, 1)).toBe(
      [
        "{",
        ' "00081032": {',
        '  "vr": "SQ",',
        '  "Value": [',
        "   {",
        '    "00080100": {',
        '     "vr": "SH"',
        "    },",
        '    "60000010": {',
        '     "vr": "US"',
        "    }",
        "   }",
        "  ]",
        " },",
        ' "60000010": {',
        '  "vr": "US",',
        '  "Value": [',
        "   8",
        "  ]",
        " }",
        "}",
      ].join("\n"),
    );
  });

  it("leaves out a field JSON.stringify leaves out, and writes what else it writes the same", () => {
    const json = {
      "00100020": { vr: "LO", Value: ["MRN-42"], BulkDataURI: undefined },
      "00100021": undefined,
      "00081032": { vr: "SQ", Value: [undefined, { "00080100": { vr: "SH" } }] },
      "00101020": { vr: "DS", Value: "not an array" },
      "00081140": { vr: "SQ", Value: "not an array" },
      "00081150": { vr: "SQ", Value: [5, "x"], Extra: [{ b: 1, a: 2 }] },
      "00081155": 5,
      "00081156": "SYNTHETIC",
      "00081157": null,
      "00081158": [{ b: 1, a: 2 }],
      "00081159": { vr: "LO", Extra: { vr: "SQ", Value: [{ b: 1, a: 2 }] } },
      "00081160": { vr: "SQ", Value: { vr: "SQ", Value: [{ b: 1, a: 2 }] } },
      "00081161": { vr: "LO", Value: [new Number(5), new String("SYNTHETIC"), Number.NaN] },
    } as unknown as DicomJsonDataset;
    expect(stringifyDicomJson(json)).toBe(
      JSON.stringify({
        "00081032": json["00081032"],
        "00081140": json["00081140"],
        "00081150": json["00081150"],
        "00081155": 5,
        "00081156": "SYNTHETIC",
        "00081157": null,
        "00081158": [{ b: 1, a: 2 }],
        "00081159": json["00081159"],
        "00081160": json["00081160"],
        "00081161": json["00081161"],
        "00100020": json["00100020"],
        "00101020": json["00101020"],
      }),
    );
  });

  it("orders hex tags by their value, whatever the case of their letters", () => {
    const json = {
      "0010000b": { vr: "LO" },
      "0010000A": { vr: "LO" },
      "0010000c": { vr: "LO" },
      "00100009": { vr: "LO" },
      "0010000D": { vr: "LO" },
      "00081032": { vr: "SQ", Value: [{ "0008010f": { vr: "SH" }, "0008010E": { vr: "SH" } }] },
    } as unknown as DicomJsonDataset;
    expect(tagOrder(stringifyDicomJson(json))).toEqual([
      "00081032",
      "0008010E",
      "0008010f",
      "00100009",
      "0010000A",
      "0010000b",
      "0010000c",
      "0010000D",
    ]);
    // Two keys of one tag, which fromDicomJson refuses, still come out in one fixed order.
    const twice = {
      "0010000a": { vr: "LO" },
      "0010000A": { vr: "SH" },
    } as unknown as DicomJsonDataset;
    expect(tagOrder(stringifyDicomJson(twice))).toEqual(["0010000A", "0010000a"]);
    const reversed = {
      "0010000A": { vr: "SH" },
      "0010000a": { vr: "LO" },
    } as unknown as DicomJsonDataset;
    expect(tagOrder(stringifyDicomJson(reversed))).toEqual(["0010000A", "0010000a"]);
  });

  it("calls a toJSON method as JSON.stringify calls it, with its key, once", () => {
    const keys: string[] = [];
    function stamped(key: string, out: unknown): { toJSON: (k: string) => unknown } {
      return {
        toJSON(k: string) {
          keys.push(`${key}<-${k}`);
          return out;
        },
      };
    }
    const json = stamped("root", {
      "00100020": stamped("attr", { vr: "LO", Value: [stamped("value", "MRN-42")] }),
      "00081032": {
        vr: "SQ",
        Value: stamped("items", [stamped("item", { "00080100": { vr: "SH" } })]),
      },
      "00080020": { vr: "DA", Value: [new Date(Date.UTC(2026, 0, 2))] },
      "00080021": stamped("gone", undefined),
    }) as unknown as DicomJsonDataset;
    const text = stringifyDicomJson(json);
    expect(text).toBe(
      '{"00080020":{"vr":"DA","Value":["2026-01-02T00:00:00.000Z"]},' +
        '"00081032":{"vr":"SQ","Value":[{"00080100":{"vr":"SH"}}]},' +
        '"00100020":{"vr":"LO","Value":["MRN-42"]}}',
    );
    expect([...keys].sort()).toEqual(
      ["root<-", "attr<-00100020", "value<-0", "items<-Value", "item<-0", "gone<-00080021"].sort(),
    );
    keys.length = 0;
    // An object in a Data Set's place whose toJSON gives no Data Set is written as it gives.
    const odd = { "00100020": { vr: "LO", Value: ["x"] }, toJSON: () => "SYNTHETIC" };
    expect(stringifyDicomJson(odd as unknown as DicomJsonDataset)).toBe('"SYNTHETIC"');
    expect(stringifyDicomJson(stamped("root", 5) as unknown as DicomJsonDataset)).toBe("5");
    expect(keys).toEqual(["root<-"]);
    // A toJSON whose result has its own toJSON: JSON.stringify calls only the first.
    const inner = stamped("inner", "INNER");
    const nested = {
      "00100020": { vr: "LO", Value: [stamped("outer", inner)] },
    } as unknown as DicomJsonDataset;
    expect(stringifyDicomJson(nested)).toBe(JSON.stringify(nested));
  });

  it("asks a bigint's toJSON too, as JSON.stringify does", () => {
    const proto = BigInt.prototype as unknown as { toJSON?: (this: bigint) => string };
    proto.toJSON = function toJSON(this: bigint) {
      return {
        "00100020": { vr: "LO", Value: [String(this)] },
        "00080020": { vr: "DA" },
      } as unknown as string;
    };
    try {
      const json = { "00081032": { vr: "SQ", Value: [7n] } } as unknown as DicomJsonDataset;
      expect(stringifyDicomJson(json)).toBe(
        '{"00081032":{"vr":"SQ","Value":[{"00080020":{"vr":"DA"},"00100020":{"vr":"LO","Value":["7"]}}]}}',
      );
    } finally {
      delete proto.toJSON;
    }
  });

  it("writes what a toJSON gives at each depth as JSON.stringify writes it, space included", () => {
    const json = {
      "00100020": { vr: "LO", Value: [{ toJSON: () => ({ b: [1, { c: 2 }] }) }] },
      "00081032": { vr: "SQ", Value: { toJSON: () => [{}, { "00080100": { vr: "SH" } }] } },
    } as unknown as DicomJsonDataset;
    const ordered = {
      "00081032": json["00081032"],
      "00100020": json["00100020"],
    };
    for (const space of [undefined, 2, "\t"] as const) {
      expect(stringifyDicomJson(json, space)).toBe(JSON.stringify(ordered, null, space));
    }
  });

  it("refuses with a DicomJsonError, not the error it met", () => {
    const cyclic: Record<string, unknown> = { vr: "SQ" };
    cyclic["Value"] = [{ "00080100": cyclic }];
    const throwing = {
      toJSON(): never {
        throw new Error("SYNTHETIC failure holding MRN-42");
      },
    };
    for (const json of [
      { "00100020": { vr: "LO", Value: [10n] } },
      { "00081032": cyclic },
      { toJSON: () => undefined },
      { "00100020": throwing },
      { "00100020": { vr: "LO", Value: [throwing] } },
    ] as unknown as DicomJsonDataset[]) {
      let code: string | undefined;
      try {
        stringifyDicomJson(json);
      } catch (err) {
        code = err instanceof DicomJsonError ? err.code : "other";
      }
      expect(code).toBe("CONVERSION_FAILED");
    }
  });
});

describe("toDicomJson", () => {
  it("adds the attributes of each Data Set in ascending tag order, whatever the file's order", () => {
    const unordered = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100020", vr: "LO", value: latin1("MRN-42") },
        { tag: "00080060", vr: "CS", value: latin1("OT") },
        {
          tag: "00081032",
          items: [
            {
              elements: [
                { tag: "00080104", vr: "LO", value: latin1("Synthetic") },
                { tag: "00080100", vr: "SH", value: latin1("P-0001") },
              ],
            },
          ],
        },
      ],
    });
    const ds = parseDicom(unordered);
    expect([...ds.elements()].map((el) => el.tag)).toEqual(["00100020", "00080060", "00081032"]);
    const json = toDicomJson(ds);
    expect(Object.keys(json)).toEqual(["00080060", "00081032", "00100020"]);
    const item = json["00081032"]?.Value?.[0] as DicomJsonDataset;
    expect(Object.keys(item)).toEqual(["00080100", "00080104"]);
  });
});

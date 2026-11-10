/**
 * The edges of the file's own safe-private declaration, Private Data Element Characteristics
 * Sequence (0008,0300), read under PS3.15 2026c E.3.10: two Items for one block, Items that name
 * no element or no group, a run of malformed Items, a Big Endian file, a private element no
 * creator reserves, and a declaration the Data Set does not settle.
 *
 * Every fixture is synthetic and built in memory. Every removed-side payload is name-bearing, so a
 * retention defect turns a row red rather than passing on an absent value, and each row checks
 * that payload is in the input first.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { MAX_PRIVATE_DECLARATION_WARNINGS } from "../../src/deident/deidentify.js";
import type { DeidentifyOptions } from "../../src/deident/types.js";
import {
  Dataset,
  Element,
  WARNING_CODES,
  deidentify,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import type { BuildDicomElement, BuildDicomSqItem } from "../helpers/build-dicom.js";
import { buildDicom } from "../helpers/build-dicom.js";

const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";

const CREATOR = "ACME DUP BLOCK";
const CREATOR_TAG = "00090010";
const FIRST_TAG = "00091003";
const SECOND_TAG = "00091004";
const THIRD_TAG = "00091005";
/** A data element in block `0x15`, which no Private Creator in the fixture reserves. */
const ORPHAN_TAG = "00091501";

const FIRST_NAME = "SMITH^JANE^A";
const SECOND_NAME = "BROWN^ALICE^B";
const THIRD_NAME = "DOE^JOHN^Q";
const ORPHAN_NAME = "SYNTHETIC^ORPHAN";

const NOT_RESOLVED = WARNING_CODES.DICOM_DEIDENT_PRIVATE_DECLARATION_NOT_RESOLVED;
const RETAIN: DeidentifyOptions = { retain: ["RetainSafePrivate"] };

function ascii(value: string): Buffer {
  return Buffer.from(value.length % 2 === 0 ? value : `${value} `, "ascii");
}

/** `US` values, Little Endian; the builder swaps them for a Big Endian file. */
function unsignedShorts(...values: readonly number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => {
    buf.writeUInt16LE(value, index * 2);
  });
  return buf;
}

function declarationItem(
  status: string,
  options: {
    readonly listed?: readonly number[];
    readonly group?: Buffer;
    readonly creator?: Buffer;
  } = {},
): BuildDicomSqItem {
  const elements: BuildDicomElement[] = [
    { tag: "00080301", vr: "US", value: options.group ?? unsignedShorts(0x0009) },
    { tag: "00080302", vr: "LO", value: options.creator ?? ascii(CREATOR) },
    { tag: "00080303", vr: "CS", value: ascii(status) },
  ];
  if (options.listed !== undefined) {
    elements.push({ tag: "00080304", vr: "US", value: unsignedShorts(...options.listed) });
  }
  return { elements };
}

const PRIVATE_ELEMENTS: readonly BuildDicomElement[] = [
  { tag: CREATOR_TAG, vr: "LO", value: ascii(CREATOR) },
  { tag: FIRST_TAG, vr: "LO", value: ascii(FIRST_NAME) },
  { tag: SECOND_TAG, vr: "LO", value: ascii(SECOND_NAME) },
  { tag: THIRD_TAG, vr: "LO", value: ascii(THIRD_NAME) },
  { tag: ORPHAN_TAG, vr: "LO", value: ascii(ORPHAN_NAME) },
];

function fixture(items: readonly BuildDicomSqItem[], transferSyntax = EXPLICIT_LE): Buffer {
  return buildDicom({
    transferSyntax,
    elements: [{ tag: "00080300", items }, ...PRIVATE_ELEMENTS],
  });
}

interface Outcome {
  readonly privateTags: ReadonlySet<string>;
  readonly warningCodes: readonly string[];
  readonly bytes: Buffer;
}

function run(ds: Dataset, options: DeidentifyOptions = RETAIN): Outcome {
  const { dataset, report } = deidentify(ds, options);
  return {
    privateTags: new Set(
      dataset
        .elements()
        .filter((el) => el.tag.startsWith("0009"))
        .map((el) => el.tag),
    ),
    warningCodes: report.warnings.map((warning) => warning.code),
    bytes: serializeDicom(dataset),
  };
}

function runBytes(bytes: Buffer, options: DeidentifyOptions = RETAIN): Outcome {
  return run(parseDicom(bytes), options);
}

describe("two Items declaring the same block: the intersection, whichever order", () => {
  it("SAFE then UNSAFE retains nothing of the block", () => {
    const out = runBytes(fixture([declarationItem("SAFE"), declarationItem("UNSAFE")]));
    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes).not.toContain(NOT_RESOLVED);
    expect(out.bytes.includes(ascii(FIRST_NAME))).toBe(false);
  });

  it("UNSAFE then SAFE retains nothing of the block either", () => {
    const out = runBytes(fixture([declarationItem("UNSAFE"), declarationItem("SAFE")]));
    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.bytes.includes(ascii(FIRST_NAME))).toBe(false);
  });

  it("SAFE then MIXED retains only what MIXED lists", () => {
    const out = runBytes(
      fixture([declarationItem("SAFE"), declarationItem("MIXED", { listed: [3] })]),
    );
    expect(out.privateTags).toEqual(new Set([CREATOR_TAG, FIRST_TAG]));
    expect(out.bytes.includes(ascii(SECOND_NAME))).toBe(false);
  });

  it("two MIXED lists retain only the elements both list", () => {
    const bytes = fixture([
      declarationItem("MIXED", { listed: [3, 4] }),
      declarationItem("MIXED", { listed: [4, 5] }),
    ]);
    // Mutation control: every payload the assertions turn on is in the input.
    for (const name of [FIRST_NAME, SECOND_NAME, THIRD_NAME]) {
      expect(bytes.includes(ascii(name))).toBe(true);
    }

    const out = runBytes(bytes);

    expect(out.privateTags).toEqual(new Set([CREATOR_TAG, SECOND_TAG]));
    expect(out.bytes.includes(ascii(SECOND_NAME))).toBe(true);
    expect(out.bytes.includes(ascii(FIRST_NAME))).toBe(false);
    expect(out.bytes.includes(ascii(THIRD_NAME))).toBe(false);
  });

  it("two disjoint MIXED lists leave the block, and its creator, with nothing retained", () => {
    const out = runBytes(
      fixture([
        declarationItem("MIXED", { listed: [3] }),
        declarationItem("MIXED", { listed: [5] }),
      ]),
    );
    expect(out.privateTags).toEqual(new Set<string>());
  });
});

describe("Items that resolve to nothing", () => {
  it("an Item whose Private Group Reference has no value retains nothing and is disclosed", () => {
    const out = runBytes(fixture([declarationItem("SAFE", { group: Buffer.alloc(0) })]));
    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes).toContain(NOT_RESOLVED);
  });

  it("an Item whose Private Creator Reference is empty names no block and is disclosed", () => {
    const out = runBytes(fixture([declarationItem("SAFE", { creator: Buffer.alloc(0) })]));
    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes).toContain(NOT_RESOLVED);
  });

  it("a MIXED Item listing only values above 00FFH names no element and is disclosed", () => {
    // PS3.3 C.12.1 identifies an element by the lowest 8 bits of its tag, so 0103H names none.
    const out = runBytes(fixture([declarationItem("MIXED", { listed: [0x0103, 0x0104] })]));
    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes).toContain(NOT_RESOLVED);
    expect(out.bytes.includes(ascii(FIRST_NAME))).toBe(false);
  });

  it("discloses at most the cap of unresolved Items, and still refuses every one of them", () => {
    const unresolved = Array.from({ length: MAX_PRIVATE_DECLARATION_WARNINGS + 3 }, () =>
      declarationItem("PROBABLY"),
    );

    const out = runBytes(fixture(unresolved));

    expect(out.warningCodes.filter((code) => code === NOT_RESOLVED)).toHaveLength(
      MAX_PRIVATE_DECLARATION_WARNINGS,
    );
    expect(out.privateTags).toEqual(new Set<string>());
  });
});

describe("the declaration in a Big Endian file", () => {
  it("reads the Private Group Reference in the file's byte order", () => {
    const bytes = fixture([declarationItem("SAFE")], EXPLICIT_BE);

    const out = runBytes(bytes);

    expect(out.privateTags).toEqual(new Set([CREATOR_TAG, FIRST_TAG, SECOND_TAG, THIRD_TAG]));
    expect(out.warningCodes).not.toContain(NOT_RESOLVED);
  });
});

describe("a private data element no Private Creator reserves", () => {
  it("is removed even inside a group the declaration calls SAFE", () => {
    const bytes = fixture([declarationItem("SAFE")]);
    expect(bytes.includes(ascii(ORPHAN_NAME))).toBe(true);

    const out = runBytes(bytes);

    expect(out.privateTags.has(ORPHAN_TAG)).toBe(false);
    expect(out.bytes.includes(ascii(ORPHAN_NAME))).toBe(false);
    // The reserved block is retained beside it, so the removal is about the reservation.
    expect(out.privateTags.has(FIRST_TAG)).toBe(true);
  });
});

describe("a declaration the Data Set does not settle", () => {
  /** An `SQ` the parser could not walk: no `items`, which is the parser's recorded refusal. */
  function unwalkable(tag: string, byteOffset: number): Element {
    return new Element({
      tag,
      vr: "SQ",
      vm: 0,
      length: 8,
      rawBytes: Buffer.alloc(8),
      byteOffset,
      littleEndian: true,
    });
  }

  function relocated(el: Element, byteOffset: number): Element {
    return new Element({
      tag: el.tag,
      vr: el.vr,
      vm: el.vm,
      length: el.length,
      rawBytes: el.rawBytes,
      byteOffset,
      littleEndian: el.littleEndian,
      ...(el.privateCreator !== undefined ? { privateCreator: el.privateCreator } : {}),
      ...(el.items !== undefined ? { items: el.items } : {}),
    });
  }

  function assembled(order: readonly Element[], parsed: Dataset): Dataset {
    return new Dataset({
      ...(parsed.fileMeta !== undefined ? { fileMeta: parsed.fileMeta } : {}),
      warnings: [],
      elements: new Map(order.map((el) => [el.tag, el] as const)),
    });
  }

  const parsed = parseDicom(fixture([declarationItem("SAFE")]));
  const declaration = parsed.get("00080300");
  const privates = parsed.elements().filter((el) => el.tag.startsWith("0009"));

  it("the control: the same elements in a settled order retain the SAFE block", () => {
    if (declaration === undefined) throw new Error("fixture has no declaration");
    const out = run(assembled([declaration, ...privates], parsed));
    expect(out.privateTags.has(FIRST_TAG)).toBe(true);
  });

  it("is not read when it follows a sequence whose item stream could not be walked", () => {
    if (declaration === undefined) throw new Error("fixture has no declaration");
    const out = run(assembled([unwalkable("00080110", 1), declaration, ...privates], parsed));

    expect(out.privateTags).toEqual(new Set<string>());
    // Not read is not malformed: there is nothing to disclose about its Items.
    expect(out.warningCodes).not.toContain(NOT_RESOLVED);
    expect(out.bytes.includes(ascii(FIRST_NAME))).toBe(false);
  });

  it("bounds by the first disputed byte offset when the Data Set lists them in file order", () => {
    if (declaration === undefined) throw new Error("fixture has no declaration");
    const order = [
      relocated(declaration, 500),
      unwalkable("00080110", 100),
      unwalkable("00080114", 900),
      ...privates.map((el, index) => relocated(el, 1000 + index * 64)),
    ];

    const out = run(assembled(order, parsed));

    expect(out.privateTags).toEqual(new Set<string>());
  });

  it("bounds by the lowest disputed byte offset, whichever order the Data Set lists them in", () => {
    if (declaration === undefined) throw new Error("fixture has no declaration");
    // The declaration is first in order, so only the byte bound can dispute it: it was read at
    // 500, past the second sequence's 100, though that sequence is listed after the first's 900.
    const order = [
      relocated(declaration, 500),
      unwalkable("00080110", 900),
      unwalkable("00080114", 100),
      ...privates.map((el, index) => relocated(el, 1000 + index * 64)),
    ];

    const out = run(assembled(order, parsed));

    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.bytes.includes(ascii(FIRST_NAME))).toBe(false);
  });
});

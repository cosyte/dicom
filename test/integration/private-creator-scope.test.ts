/**
 * Private block reservations are scoped to one Data Set, on the READ path
 * (`DICOM-PARSE-CREATORS-SCOPE`).
 *
 * The sibling defect on the de-identify path shipped in #48; this is the same
 * rule where the parser resolves an Implicit VR, and the difference in harm is
 * the reason this is its own slice. There, an out-of-scope reservation retained
 * a private element it should have removed - an over-retention. Here, it feeds
 * `resolveImplicitVR`, so the same mistake hands the same bytes a **different
 * VR**: `(0029,1101)` at the root decodes as a signed `SS` `-1` under a vendor
 * that reserved that block only inside a Sequence Item. A file that says one
 * thing is read as another, silently, with no warning at all - which is the
 * class the "correct, not merely green" rule exists for.
 *
 * What the standard says, read from the vendored, SHA-pinned PS3.5 2026c under
 * `vendor/nema/part05/`:
 *
 *  - Section 7.5.1: "Each Item Value shall contain a DICOM Data Set composed of
 *    Data Elements", and the section closes by delegating: section 7.8
 *    "specifies rules for incorporating Private Data Elements into Sequence
 *    Items."
 *  - Section 7.8.1: "Private Creator Data Elements numbered (gggg,0010-00FF)
 *    (gggg is odd) shall be used to reserve a block of Elements with Group
 *    Number gggg for use by an individual implementer." The reservation is
 *    therefore a property of the Data Set the Private Creator Data Element sits
 *    in.
 *  - Section 7.8.1 Note 1 says the nesting case outright: a private Sequence
 *    Data Element may carry repeated Private Data Elements in separate items,
 *    and "Each item needs to claim the corresponding private block of
 *    Elements." It is a Note, so informative rather than normative, and it is
 *    cited here as confirmation of the reading above rather than as its basis.
 *
 * So an Item starts with no reservations, its own do not reach a sibling item,
 * and none of them survive back out to the enclosing Data Set. A Data Set that
 * never claimed a block gets `UN` plus `DICOM_PRIVATE_TAG_NO_CREATOR`, which is
 * the fail-safe direction on a read path: raw bytes and a warning, never a
 * borrowed VR.
 *
 * Fixtures are built in memory (D-38). The private-creator strings are invented
 * for this test and name no real vendor: nothing here encodes a vendor quirk,
 * which would need a real de-identified document to ground it.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  defineProfile,
  DicomParseError,
  parseDicom,
  WARNING_CODES,
  type Dataset,
  type Item,
  type Profile,
} from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";
import { buildDicom, type BuildDicomSqItem } from "../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Creator slot reserving block `0x10` → data elements `(0029,10LL)`. */
const CREATOR_BLOCK_10: Tag = "00290010";
/** Creator slot reserving block `0x11` → data elements `(0029,11LL)`. */
const CREATOR_BLOCK_11: Tag = "00290011";
/** Data element in block `0x10`, element byte `0x01` → key `"0029XX01"`. */
const DATA_BLOCK_10: Tag = "00291001";
/** Data element in block `0x11`, element byte `0x01` → key `"0029XX01"`. */
const DATA_BLOCK_11: Tag = "00291101";

const ALPHA = "COSYTE TEST ALPHA";
const BETA = "COSYTE TEST BETA";

/**
 * `0xFFFF` is the whole point of the fixture: the identical two bytes decode
 * to `65535` under ALPHA's `US` and to `-1` under BETA's `SS`. A reservation
 * resolved from the wrong Data Set is therefore observable as a wrong VALUE,
 * not merely as a wrong label.
 */
const AMBIGUOUS_BYTES = Buffer.from([0xff, 0xff]);

/**
 * Two vendors that both define element byte `0x01` of whatever block they
 * reserve, with incompatible VRs. Neither names a block number: the overlay is
 * keyed on the creator string, per PS3.5 section 7.8.1.
 */
const twoVendors: Profile = defineProfile({
  name: "cosyte-test-two-vendors",
  description: "Two synthetic creators whose element byte 0x01 disagrees on VR",
  privateTags: {
    [ALPHA]: {
      "0029XX01": { vr: "US", keyword: "AlphaUnsignedCount", name: "Alpha Unsigned Count" },
    },
    [BETA]: {
      "0029XX01": { vr: "SS", keyword: "BetaSignedOffset", name: "Beta Signed Offset" },
    },
  },
});

function padEven(buf: Buffer): Buffer {
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x00])]);
}

function creatorElement(tag: Tag, creator: string): { tag: Tag; vr: "LO"; value: Buffer } {
  return { tag, vr: "LO", value: padEven(Buffer.from(creator, "ascii")) };
}

function privateData(tag: Tag): { tag: Tag; vr: "UN"; value: Buffer } {
  return { tag, vr: "UN", value: Buffer.from(AMBIGUOUS_BYTES) };
}

function item(elements: BuildDicomSqItem["elements"]): BuildDicomSqItem {
  return { elements };
}

/**
 * The Data Set inside item `index` of the SQ element at `sqTag`, reached
 * through the public navigation surface (`Dataset.get` / `Element.items` /
 * `Item`, which is itself a `Dataset`). Reading the private element map
 * directly would prove the parser scoped its own state without proving that
 * what a consumer navigates to says the same thing.
 */
function itemAt(ds: Dataset, sqTag: Tag, index = 0): Item {
  const it = ds.get(sqTag)?.items?.[index];
  if (it === undefined) throw new Error(`fixture error: no item ${String(index)} at ${sqTag}`);
  return it;
}

function noCreatorWarnings(warnings: readonly { code: string }[]): number {
  return warnings.filter((w) => w.code === WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR).length;
}

describe("DICOM-PARSE-CREATORS-SCOPE: a root reservation does not reach into an Item", () => {
  // Root claims block 0x10 for ALPHA and uses it. The Item uses the same block
  // and claims nothing. PS3.5 section 7.8.1 Note 1: "Each item needs to claim
  // the corresponding private block of Elements."
  const buf = buildDicom({
    transferSyntax: TS_IMPLICIT_LE,
    elements: [
      creatorElement(CREATOR_BLOCK_10, ALPHA),
      privateData(DATA_BLOCK_10),
      { tag: "0040A730", undefinedLength: true, items: [item([privateData(DATA_BLOCK_10)])] },
    ],
  });

  it("resolves the ROOT element from the root's own reservation", () => {
    const ds = parseDicom(buf, { profile: twoVendors });
    const el = ds.get(DATA_BLOCK_10);
    expect(el?.vr).toBe("US");
    expect(el?.privateCreator).toBe(ALPHA);
    expect(el?.value).toEqual({ kind: "numbers", values: [65535] });
  });

  it("degrades the ITEM element to UN, because the Item claimed no block", () => {
    const ds = parseDicom(buf, { profile: twoVendors });
    const el = itemAt(ds, "0040A730").get(DATA_BLOCK_10);
    expect(el?.vr).toBe("UN");
    expect(el?.privateCreator).toBeUndefined();
    expect(el?.value).toEqual({ kind: "binary", bytes: AMBIGUOUS_BYTES });
    expect(noCreatorWarnings(ds.warnings)).toBe(1);
  });
});

describe("DICOM-PARSE-CREATORS-SCOPE: an Item's reservation does not escape to the root", () => {
  // The sharpest direction, and the one that produces a genuinely wrong value.
  // The Item claims block 0x11 for BETA. The root claims only block 0x10, then
  // writes (0029,1101) - a block it never reserved. With one reservation map
  // for the whole parse, the Item's claim is still standing when the root
  // element is read, so the root element takes BETA's SS and decodes -1.
  const buf = buildDicom({
    transferSyntax: TS_IMPLICIT_LE,
    elements: [
      {
        tag: "00081115",
        undefinedLength: true,
        items: [item([creatorElement(CREATOR_BLOCK_11, BETA), privateData(DATA_BLOCK_11)])],
      },
      creatorElement(CREATOR_BLOCK_10, ALPHA),
      privateData(DATA_BLOCK_11),
    ],
  });

  it("resolves the ITEM element from the Item's own reservation", () => {
    const ds = parseDicom(buf, { profile: twoVendors });
    const el = itemAt(ds, "00081115").get(DATA_BLOCK_11);
    expect(el?.vr).toBe("SS");
    expect(el?.privateCreator).toBe(BETA);
    expect(el?.value).toEqual({ kind: "numbers", values: [-1] });
  });

  it("does NOT decode the ROOT element as the Item's vendor: no SS, no -1", () => {
    const ds = parseDicom(buf, { profile: twoVendors });
    const el = ds.get(DATA_BLOCK_11);
    expect(el?.vr).not.toBe("SS");
    expect(el?.value).not.toEqual({ kind: "numbers", values: [-1] });
    expect(el?.vr).toBe("UN");
    expect(el?.privateCreator).toBeUndefined();
    expect(el?.value).toEqual({ kind: "binary", bytes: AMBIGUOUS_BYTES });
    expect(noCreatorWarnings(ds.warnings)).toBe(1);
  });

  it("leaves the root's OWN block 0x10 reservation intact across the sequence", () => {
    // Guards the other unsafe direction: scoping per Item must not clear or
    // shadow the enclosing Data Set's reservations.
    const withRootUse = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        {
          tag: "00081115",
          undefinedLength: true,
          items: [item([creatorElement(CREATOR_BLOCK_11, BETA), privateData(DATA_BLOCK_11)])],
        },
        creatorElement(CREATOR_BLOCK_10, ALPHA),
        privateData(DATA_BLOCK_10),
      ],
    });
    const ds = parseDicom(withRootUse, { profile: twoVendors });
    const el = ds.get(DATA_BLOCK_10);
    expect(el?.vr).toBe("US");
    expect(el?.privateCreator).toBe(ALPHA);
    expect(el?.value).toEqual({ kind: "numbers", values: [65535] });
  });
});

describe("DICOM-PARSE-CREATORS-SCOPE: an Item's reservation does not reach a sibling Item", () => {
  // Item 0 claims block 0x10 for BETA. Item 1 is a separate Data Set that
  // claims nothing and writes into the same block.
  const buf = buildDicom({
    transferSyntax: TS_IMPLICIT_LE,
    elements: [
      {
        tag: "0040A730",
        undefinedLength: true,
        items: [
          item([creatorElement(CREATOR_BLOCK_10, BETA), privateData(DATA_BLOCK_10)]),
          item([privateData(DATA_BLOCK_10)]),
        ],
      },
    ],
  });

  it("resolves item 0 from its own reservation and item 1 to UN", () => {
    const ds = parseDicom(buf, { profile: twoVendors });
    const first = itemAt(ds, "0040A730", 0).get(DATA_BLOCK_10);
    expect(first?.vr).toBe("SS");
    expect(first?.value).toEqual({ kind: "numbers", values: [-1] });

    const second = itemAt(ds, "0040A730", 1).get(DATA_BLOCK_10);
    expect(second?.vr).toBe("UN");
    expect(second?.privateCreator).toBeUndefined();
    expect(second?.value).toEqual({ kind: "binary", bytes: AMBIGUOUS_BYTES });
    expect(noCreatorWarnings(ds.warnings)).toBe(1);
  });
});

describe("DICOM-PARSE-CREATORS-SCOPE: scoping holds at every depth, not just the first", () => {
  // Root claims 0x10 for ALPHA. The outer Item re-claims 0x10 for BETA. The
  // inner Item claims nothing. Three Data Sets, three answers.
  const buf = buildDicom({
    transferSyntax: TS_IMPLICIT_LE,
    elements: [
      creatorElement(CREATOR_BLOCK_10, ALPHA),
      privateData(DATA_BLOCK_10),
      {
        tag: "0040A730",
        undefinedLength: true,
        items: [
          item([
            creatorElement(CREATOR_BLOCK_10, BETA),
            privateData(DATA_BLOCK_10),
            {
              tag: "0040A730",
              undefinedLength: true,
              items: [item([privateData(DATA_BLOCK_10)])],
            },
          ]),
        ],
      },
    ],
  });

  it("root reads ALPHA, the outer item reads BETA, the inner item reads neither", () => {
    const ds = parseDicom(buf, { profile: twoVendors });

    const root = ds.get(DATA_BLOCK_10);
    expect(root?.vr).toBe("US");
    expect(root?.value).toEqual({ kind: "numbers", values: [65535] });

    const outer = itemAt(ds, "0040A730");
    const outerEl = outer.get(DATA_BLOCK_10);
    expect(outerEl?.vr).toBe("SS");
    expect(outerEl?.privateCreator).toBe(BETA);
    expect(outerEl?.value).toEqual({ kind: "numbers", values: [-1] });

    const nestedSq = outer.get("0040A730");
    const innerItem = nestedSq?.items?.[0];
    if (innerItem === undefined) throw new Error("fixture error: no nested item");
    const innerEl = innerItem.get(DATA_BLOCK_10);
    expect(innerEl?.vr).toBe("UN");
    expect(innerEl?.privateCreator).toBeUndefined();
    expect(innerEl?.value).toEqual({ kind: "binary", bytes: AMBIGUOUS_BYTES });
  });
});

describe("DICOM-PARSE-CREATORS-SCOPE: degrading to UN must not cost the whole file", () => {
  // The blast radius the scoping change opens, and the reason the CP-246
  // descent is now applied on the Implicit-VR-LE path too. Under this transfer
  // syntax an undefined length is only encodable for a sequence, and
  // `parseImplicitLE` treated any other resolved VR at 0xFFFFFFFF as a Tier-3
  // fatal. Scoping the reservation turns a private element that a profile
  // resolved to `SQ` off an enclosing block into a `UN`, so the same bytes that
  // parsed before would have thrown `INVALID_FILE_META` and taken the patient,
  // the study and every other element with them. PS3.5 section 7.5.1 requires
  // decoders to support both item encodings; losing vendor context is not
  // structural corruption.
  const sqVendor: Profile = defineProfile({
    name: "cosyte-test-sq-vendor",
    privateTags: {
      [ALPHA]: {
        "0029XX01": { vr: "SQ", keyword: "AlphaPrivateSequence", name: "Alpha Private Sequence" },
      },
    },
  });

  // Root claims block 0x10 for ALPHA, whose element byte 0x01 is a private
  // SEQUENCE. The item writes (0029,1001) as an undefined-length sequence but
  // claims no block of its own.
  const buf = buildDicom({
    transferSyntax: TS_IMPLICIT_LE,
    elements: [
      creatorElement(CREATOR_BLOCK_10, ALPHA),
      {
        tag: "0040A730",
        undefinedLength: true,
        items: [
          item([
            {
              tag: DATA_BLOCK_10,
              undefinedLength: true,
              items: [item([{ tag: "00080100", vr: "SH", value: Buffer.from("CODE", "ascii") }])],
            },
          ]),
        ],
      },
    ],
  });

  it("descends the unclaimed private sequence instead of failing the parse", () => {
    const ds = parseDicom(buf, { profile: sqVendor });
    const el = itemAt(ds, "0040A730").get(DATA_BLOCK_10);
    expect(el?.vr).toBe("SQ");
    expect(el?.items?.length).toBe(1);
    expect(el?.items?.[0]?.get("00080100")?.value).toEqual({
      kind: "strings",
      values: ["CODE"],
    });
    // The descent is the documented CP-246 route, so it says so rather than
    // arriving silently.
    expect(ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ)).toBe(true);
  });

  it("still throws when the undefined-length value is not a sequence at all", () => {
    // The other half of the same guard, and the reason the descent is safe to
    // add: it restores parser state and drops its warnings on failure, so bytes
    // that are genuinely malformed reach the Tier-3 fatal exactly as they did
    // before. Built by hand because the fixture helper always writes a real
    // length for a primitive element: `(0029,1001)` with length 0xFFFFFFFF,
    // followed by bytes that cannot open an `(FFFE,E000)` Item.
    const undefinedLengthHeader = Buffer.from([
      0x29, 0x00, 0x01, 0x10, 0xff, 0xff, 0xff, 0xff, 0xde, 0xad, 0xbe, 0xef,
    ]);
    const malformed = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [creatorElement(CREATOR_BLOCK_10, ALPHA)],
      trailingBytes: undefinedLengthHeader,
    });
    // No profile, so the private element degrades to UN and takes the descent
    // path rather than the `vr === "SQ"` one.
    expect(() => parseDicom(malformed)).toThrow(DicomParseError);
  });

  it("escalates the new warning under strict, which is what strict is for", () => {
    // Stated rather than glossed: `strict: true` promotes Tier-2 warnings to a
    // throw, so a file whose item borrowed an enclosing block now throws where
    // it previously parsed clean. That is strict mode behaving as documented on
    // a warning that is now correctly emitted, and it is why the release note
    // names strict mode explicitly.
    const borrowed = buildDicom({
      transferSyntax: TS_IMPLICIT_LE,
      elements: [
        creatorElement(CREATOR_BLOCK_10, ALPHA),
        privateData(DATA_BLOCK_10),
        { tag: "0040A730", undefinedLength: true, items: [item([privateData(DATA_BLOCK_10)])] },
      ],
    });
    expect(() => parseDicom(borrowed, { profile: twoVendors, strict: true })).toThrow(
      DicomParseError,
    );
    // Lenient (the default) keeps the file and records the warning.
    const ds = parseDicom(borrowed, { profile: twoVendors });
    expect(noCreatorWarnings(ds.warnings)).toBe(1);
  });
});

describe("DICOM-PARSE-CREATORS-SCOPE: the model field is scoped too, under Explicit VR", () => {
  // Under an Explicit VR transfer syntax the VR is on the wire, so there is no
  // wrong VR to be had. `Element.privateCreator` is still resolved from the
  // reservation map, and it is a public model field a consumer will treat as
  // naming the vendor whose schema documents these bytes.
  const buf = buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [
      {
        tag: "00081115",
        items: [item([creatorElement(CREATOR_BLOCK_11, BETA), { ...privateData(DATA_BLOCK_11) }])],
      },
      creatorElement(CREATOR_BLOCK_10, ALPHA),
      privateData(DATA_BLOCK_11),
    ],
  });

  it("does not attribute the root's unreserved block to the Item's vendor", () => {
    const ds = parseDicom(buf, { profile: twoVendors });
    expect(itemAt(ds, "00081115").get(DATA_BLOCK_11)?.privateCreator).toBe(BETA);
    expect(ds.get(DATA_BLOCK_11)?.privateCreator).toBeUndefined();
  });
});

describe("DICOM-PARSE-CREATORS-SCOPE: unprofiled parses are unchanged in VR, not in creator", () => {
  const buf = buildDicom({
    transferSyntax: TS_IMPLICIT_LE,
    elements: [
      creatorElement(CREATOR_BLOCK_10, ALPHA),
      privateData(DATA_BLOCK_10),
      { tag: "0040A730", undefinedLength: true, items: [item([privateData(DATA_BLOCK_10)])] },
    ],
  });

  it("keeps every private element at UN and withholds the creator with no profile", () => {
    // Without a profile there is no overlay to resolve a VR from, so the VR is
    // UN either way and the only observable difference is the creator field and
    // the warning. Recorded so the blast radius of this change is not
    // overstated: a parse with no profile decodes no differently.
    const ds = parseDicom(buf);
    expect(ds.get(DATA_BLOCK_10)?.vr).toBe("UN");
    expect(ds.get(DATA_BLOCK_10)?.privateCreator).toBe("<withheld>");
    const itemEl = itemAt(ds, "0040A730").get(DATA_BLOCK_10);
    expect(itemEl?.vr).toBe("UN");
    expect(itemEl?.privateCreator).toBeUndefined();
  });
});

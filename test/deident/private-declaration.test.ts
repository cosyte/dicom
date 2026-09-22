/**
 * The file's own safe-private declaration as a route to PS3.15 2026c E.3.10's
 * "known by the de-identifier to be safe from identity leakage".
 *
 * Every fixture here is **synthetic**, built in memory by `buildDicom` from the
 * shape PS3.3 2026c C.12.1 Table C.12-1 defines for Private Data Element
 * Characteristics Sequence (0008,0300). No real identifier is in this file:
 * the payloads that stand in for identifying content are invented names, and
 * the vendor values are invented technique strings of the kind E.3.10's own
 * examples name (CT helical span pitch, PET SUV rescale factors).
 *
 * Every removed-side payload is **name-bearing** on purpose: a retention defect
 * has to turn a test red rather than pass vacuously, and the mutation control at
 * the bottom pins that those bytes are in the input to begin with.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import type { DeidentifyOptions } from "../../src/deident/types.js";
import {
  WARNING_CODES,
  defineProfile,
  deidentify,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import type { BuildDicomElement, BuildDicomSqItem } from "../helpers/build-dicom.js";
import { buildDicom } from "../helpers/build-dicom.js";

const EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Synthetic vendor block names. A Private Creator is a schema id, not a person. */
const SAFE_CREATOR = "ACME SAFE BLOCK";
const MIXED_CREATOR = "ACME MIXED BLOCK";
const UNDECLARED_CREATOR = "ACME UNDECLARED";
const UNSAFE_CREATOR = "ACME UNSAFE BLOCK";
/** Named by no reservation in the fixture, which is AC-5's fourth malformed Item. */
const GHOST_CREATOR = "ACME GHOST BLOCK";

/** Retained-side values: ordinary non-zero-length string scalars, no Private Creator among them. */
const PITCH = "acme-pitch-1.5";
const KVP = "acme-kvp-120";
const SUV = "acme-suv-2.4";

/** Removed-side payloads. Every one carries a name, so a retention defect is visible. */
const MIXED_UNLISTED_NAME = "SMITH^JANE^A";
const UNDECLARED_NAME = "BROWN^ALICE^B";
const UNSAFE_NAME = "DOE^JOHN^Q";
const PATIENT_NAME = "DOE^JANE";

const SAFE_CREATOR_TAG = "00090010";
const SAFE_PITCH_TAG = "00091001";
const SAFE_KVP_TAG = "00091002";
const MIXED_CREATOR_TAG = "00090011";
const MIXED_LISTED_TAG = "00091103";
const MIXED_UNLISTED_TAG = "00091104";
const UNDECLARED_CREATOR_TAG = "00090012";
const UNDECLARED_TAG = "00091201";
const UNSAFE_CREATOR_TAG = "00090013";
const UNSAFE_TAG = "00091301";

const PATIENT_NAME_TAG = "00100010";
const PRIVATE_GROUP = 0x0009;

const DECLARATION_NOT_RESOLVED = WARNING_CODES.DICOM_DEIDENT_PRIVATE_DECLARATION_NOT_RESOLVED;

const RETAIN: DeidentifyOptions = { retain: ["RetainSafePrivate"] };

/**
 * A profile vouching for the block the declaration calls `UNSAFE`, so AC-4 can
 * show the two routes are independent.
 */
const VOUCHING_PROFILE = defineProfile({
  name: "acme-unsafe-vouch",
  privateTags: {
    [UNSAFE_CREATOR]: {
      "0009XX01": { vr: "LO", keyword: "AcmeUnsafeValue", name: "ACME Unsafe Value" },
    },
  },
});

function ascii(value: string): Buffer {
  return Buffer.from(value.length % 2 === 0 ? value : `${value} `, "ascii");
}

function unsignedShorts(...values: readonly number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => {
    buf.writeUInt16LE(value, index * 2);
  });
  return buf;
}

function groupReference(group: number): BuildDicomElement {
  return { tag: "00080301", vr: "US", value: unsignedShorts(group) };
}

function creatorReference(creator: string): BuildDicomElement {
  return { tag: "00080302", vr: "LO", value: ascii(creator) };
}

function blockStatus(status: string): BuildDicomElement {
  return { tag: "00080303", vr: "CS", value: ascii(status) };
}

function nonidentifyingElements(...values: readonly number[]): BuildDicomElement {
  return { tag: "00080304", vr: "US", value: unsignedShorts(...values) };
}

function declarationItem(elements: readonly BuildDicomElement[]): BuildDicomSqItem {
  return { elements };
}

/** Items A, B and C of the fixture family in the spec's `## Verification` table. */
const WELL_FORMED_ITEMS: readonly BuildDicomSqItem[] = [
  declarationItem([
    groupReference(PRIVATE_GROUP),
    creatorReference(SAFE_CREATOR),
    blockStatus("SAFE"),
  ]),
  declarationItem([
    groupReference(PRIVATE_GROUP),
    creatorReference(MIXED_CREATOR),
    blockStatus("MIXED"),
    nonidentifyingElements(3),
  ]),
  declarationItem([
    groupReference(PRIVATE_GROUP),
    creatorReference(UNSAFE_CREATOR),
    blockStatus("UNSAFE"),
  ]),
];

/** AC-5's four shapes, each of which resolves to no block of private Data Elements. */
const MALFORMED_ITEMS: readonly BuildDicomSqItem[] = [
  declarationItem([groupReference(PRIVATE_GROUP), creatorReference(SAFE_CREATOR)]),
  declarationItem([
    groupReference(PRIVATE_GROUP),
    creatorReference(MIXED_CREATOR),
    blockStatus("MIXED"),
  ]),
  declarationItem([
    groupReference(PRIVATE_GROUP),
    creatorReference(UNDECLARED_CREATOR),
    blockStatus("PROBABLY"),
  ]),
  declarationItem([
    groupReference(PRIVATE_GROUP),
    creatorReference(GHOST_CREATOR),
    blockStatus("SAFE"),
  ]),
];

/** AC-4's second case: an Item whose Private Group Reference names an EVEN group. */
const EVEN_GROUP_ITEMS: readonly BuildDicomSqItem[] = [
  declarationItem([groupReference(0x0010), creatorReference(SAFE_CREATOR), blockStatus("SAFE")]),
];

const PRIVATE_ELEMENTS: readonly BuildDicomElement[] = [
  { tag: SAFE_CREATOR_TAG, vr: "LO", value: ascii(SAFE_CREATOR) },
  { tag: SAFE_PITCH_TAG, vr: "LO", value: ascii(PITCH) },
  { tag: SAFE_KVP_TAG, vr: "LO", value: ascii(KVP) },
  { tag: MIXED_CREATOR_TAG, vr: "LO", value: ascii(MIXED_CREATOR) },
  { tag: MIXED_LISTED_TAG, vr: "SH", value: ascii(SUV) },
  { tag: MIXED_UNLISTED_TAG, vr: "SH", value: ascii(MIXED_UNLISTED_NAME) },
  { tag: UNDECLARED_CREATOR_TAG, vr: "LO", value: ascii(UNDECLARED_CREATOR) },
  { tag: UNDECLARED_TAG, vr: "LO", value: ascii(UNDECLARED_NAME) },
  { tag: UNSAFE_CREATOR_TAG, vr: "LO", value: ascii(UNSAFE_CREATOR) },
  { tag: UNSAFE_TAG, vr: "LO", value: ascii(UNSAFE_NAME) },
];

/**
 * One fixture family: the same ten private elements under whichever declaration
 * a criterion is about, or under none at all.
 */
function fixture(items?: readonly BuildDicomSqItem[]): Buffer {
  return buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [
      { tag: PATIENT_NAME_TAG, vr: "PN", value: ascii(PATIENT_NAME) },
      ...(items === undefined ? [] : [{ tag: "00080300" as const, items }]),
      ...PRIVATE_ELEMENTS,
    ],
  });
}

const DECLARED = fixture(WELL_FORMED_ITEMS);
const NO_DECLARATION = fixture();
const MALFORMED = fixture(MALFORMED_ITEMS);
const EVEN_GROUP = fixture(EVEN_GROUP_ITEMS);

interface Outcome {
  /** The SET of private tags the de-identified Data Set holds. Never a count. */
  readonly privateTags: ReadonlySet<string>;
  readonly removedPrivateTags: readonly string[];
  readonly unenumerable: readonly string[];
  readonly warningCodes: readonly string[];
  readonly warningMessages: readonly string[];
  readonly bytes: Buffer;
  value(tag: string): Buffer | undefined;
}

function run(buf: Buffer, options: DeidentifyOptions): Outcome {
  const { dataset, report } = deidentify(parseDicom(buf), options);
  const elements = dataset.elements();
  return {
    privateTags: new Set(elements.filter((el) => el.tag.startsWith("0009")).map((el) => el.tag)),
    removedPrivateTags: report.removedPrivateTags,
    unenumerable: report.unenumerablePrivateRemovals.map((removal) => removal.tag),
    warningCodes: report.warnings.map((warning) => warning.code),
    warningMessages: report.warnings.map((warning) => warning.message),
    bytes: serializeDicom(dataset),
    value: (tag: string): Buffer | undefined => dataset.get(tag)?.rawBytes,
  };
}

describe("deidentify: the file's own Private Data Element Characteristics Sequence (0008,0300)", () => {
  it("[AC-1] retains every element of a block declared SAFE, plus its Private Creator, with no caller profile", () => {
    const out = run(DECLARED, RETAIN);

    expect(out.privateTags.has(SAFE_CREATOR_TAG)).toBe(true);
    expect(out.privateTags.has(SAFE_PITCH_TAG)).toBe(true);
    expect(out.privateTags.has(SAFE_KVP_TAG)).toBe(true);
    // Byte for byte as the source wrote it, pad included.
    expect(out.value(SAFE_CREATOR_TAG)?.equals(ascii(SAFE_CREATOR))).toBe(true);
    expect(out.value(SAFE_PITCH_TAG)?.equals(ascii(PITCH))).toBe(true);
    expect(out.value(SAFE_KVP_TAG)?.equals(ascii(KVP))).toBe(true);
    // No profile was passed, and none is needed.
    expect(out.warningCodes).not.toContain(DECLARATION_NOT_RESOLVED);
  });

  it("[AC-2] treats exactly the elements a MIXED block lists in (0008,0304) as known safe", () => {
    const out = run(DECLARED, RETAIN);

    expect(out.privateTags.has(MIXED_CREATOR_TAG)).toBe(true);
    expect(out.privateTags.has(MIXED_LISTED_TAG)).toBe(true);
    expect(out.privateTags.has(MIXED_UNLISTED_TAG)).toBe(false);
    expect(out.value(MIXED_CREATOR_TAG)?.equals(ascii(MIXED_CREATOR))).toBe(true);
    expect(out.value(MIXED_LISTED_TAG)?.equals(ascii(SUV))).toBe(true);
    expect(out.bytes.includes(ascii(MIXED_UNLISTED_NAME))).toBe(false);
  });

  it("[AC-3] removes a private attribute neither the declaration nor a profile covers, and records it", () => {
    const out = run(DECLARED, RETAIN);

    // The SET of private tags in the output, asserted whole so nothing rides along.
    expect(out.privateTags).toEqual(
      new Set([SAFE_CREATOR_TAG, SAFE_PITCH_TAG, SAFE_KVP_TAG, MIXED_CREATOR_TAG, MIXED_LISTED_TAG]),
    );
    for (const tag of [
      MIXED_UNLISTED_TAG,
      UNDECLARED_CREATOR_TAG,
      UNDECLARED_TAG,
      UNSAFE_CREATOR_TAG,
      UNSAFE_TAG,
    ]) {
      expect(out.removedPrivateTags).toContain(tag);
    }
    expect(out.bytes.includes(ascii(UNDECLARED_NAME))).toBe(false);
    expect(out.bytes.includes(ascii(UNSAFE_NAME))).toBe(false);
  });

  it("[AC-4] only ADDS: a profile still vouches for a block the declaration calls UNSAFE", () => {
    const vouched = run(DECLARED, { retain: ["RetainSafePrivate"], profile: VOUCHING_PROFILE });
    const unvouched = run(DECLARED, RETAIN);

    // The profile route is untouched by the declaration. Its Private Creator is
    // retained, and its data element is accepted by the retention decision and
    // then removed by the unenumerable rule that already governed that route -
    // which is the discrimination, since a block the declaration refuses outright
    // never reaches that rule at all.
    expect(vouched.privateTags.has(UNSAFE_CREATOR_TAG)).toBe(true);
    expect(vouched.value(UNSAFE_CREATOR_TAG)?.equals(ascii(UNSAFE_CREATOR))).toBe(true);
    expect(vouched.unenumerable).toContain(UNSAFE_TAG);
    expect(unvouched.privateTags.has(UNSAFE_CREATOR_TAG)).toBe(false);
    expect(unvouched.unenumerable).not.toContain(UNSAFE_TAG);
    // And the declaration's own retentions are unchanged by the profile's presence.
    expect(vouched.value(SAFE_PITCH_TAG)?.equals(ascii(PITCH))).toBe(true);
    expect(vouched.value(MIXED_LISTED_TAG)?.equals(ascii(SUV))).toBe(true);
    expect(vouched.bytes.includes(ascii(UNSAFE_NAME))).toBe(false);
  });

  it("[AC-4] retains nothing on account of an Item whose (0008,0301) names an even group", () => {
    const out = run(EVEN_GROUP, RETAIN);

    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes).toContain(DECLARATION_NOT_RESOLVED);
    // The even group the Item named is the one the Basic Profile acts on: its
    // (0010,0010) is emptied exactly as it would be with no declaration at all.
    expect(out.value(PATIENT_NAME_TAG)?.length).toBe(0);
    expect(out.bytes.includes(ascii(PATIENT_NAME))).toBe(false);
  });

  it("[AC-5] retains nothing on account of an Item that does not resolve, and discloses each one", () => {
    const out = run(MALFORMED, RETAIN);

    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes.filter((code) => code === DECLARATION_NOT_RESOLVED)).toHaveLength(
      MALFORMED_ITEMS.length,
    );
    // The code is a member of the frozen registry, which the locked snapshot in
    // `test/property/warning-codes.snapshot.test.ts` measures every run.
    expect(DECLARATION_NOT_RESOLVED).toBe("DICOM_DEIDENT_PRIVATE_DECLARATION_NOT_RESOLVED");
    // No token of the Item travels in the message: not a creator, not a status.
    const message = out.warningMessages.find((text) =>
      text.includes("Private Data Element Characteristics Sequence"),
    );
    expect(message).toBeDefined();
    for (const token of [SAFE_CREATOR, MIXED_CREATOR, UNDECLARED_CREATOR, GHOST_CREATOR, "PROBABLY"]) {
      expect(message).not.toContain(token);
    }
  });

  it("[AC-6] retains no private attribute when the Data Set carries no (0008,0300)", () => {
    const out = run(NO_DECLARATION, RETAIN);

    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes).not.toContain(DECLARATION_NOT_RESOLVED);
  });

  it("[AC-6] retains no private attribute when the Retain Safe Private Option is not active", () => {
    const out = run(DECLARED, {});

    expect(out.privateTags).toEqual(new Set<string>());
    expect(out.warningCodes).not.toContain(DECLARATION_NOT_RESOLVED);
    expect(out.bytes.includes(ascii(PITCH))).toBe(false);
  });

  it("[AC-1, AC-3] mutation control: every payload these assertions turn on is in the input", () => {
    const out = run(DECLARED, RETAIN);

    // A retention that ignored the declaration would put each of these in the
    // output, so the removed-side assertions above cannot pass vacuously.
    for (const payload of [MIXED_UNLISTED_NAME, UNDECLARED_NAME, UNSAFE_NAME, PATIENT_NAME]) {
      expect(DECLARED.includes(ascii(payload))).toBe(true);
      expect(out.bytes.includes(ascii(payload))).toBe(false);
    }
    // And a removal that ignored it would take each of these out.
    for (const payload of [PITCH, KVP, SUV]) {
      expect(DECLARED.includes(ascii(payload))).toBe(true);
      expect(out.bytes.includes(ascii(payload))).toBe(true);
    }
  });
});

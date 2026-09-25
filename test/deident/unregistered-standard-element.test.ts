/**
 * S0367-dicom-15: a non-private Data Element whose tag this build's PS3.6 2026d
 * registry does not carry, and which Table E.1-1 does not list, is REMOVED by
 * `deidentify()` at every depth, recorded without its tag, and announced once per
 * run. AC-1 to AC-3 and AC-5 to AC-13; AC-4 and AC-14 are in
 * `test/integration/deident-undefined-vr.test.ts`.
 *
 * Until this rule a Table E.1-1 miss read as "keep", so such an element went into
 * de-identified output verbatim under a report that said nothing about it.
 *
 * Every fixture here is SYNTHETIC, built in memory by `test/helpers/build-dicom.ts`
 * or through the public `Element` constructor; nothing is real and nothing is
 * anonymised. The payload names an invented person, because a PHI test whose
 * payload names nobody proves nothing, and every absence assertion on it has a
 * mutation control that turns it red.
 *
 * Tiers (`standards-conformance` S4): AC-1 and AC-9 to AC-11 are Tier 1, a
 * spec-clean object read and de-identified (a tag no edition registers is
 * encoded conformantly all the same); AC-2 to AC-4, AC-6 and AC-12 are Tier 2,
 * fabricated or vendor-shaped. The serialize-and-re-parse halves of AC-1 and AC-2
 * are Tier 3.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { Dataset } from "../../src/dataset/dataset.js";
import { Element } from "../../src/dataset/element.js";
import { MAX_UNREGISTERED_ELEMENT_FINDINGS, deidentify } from "../../src/deident/deidentify.js";
import type { DeidentifyOption, DeidentifyReport } from "../../src/deident/types.js";
import { annexE } from "../../src/dictionary/annex-e.js";
import { isRegisteredTag } from "../../src/dictionary/registered.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { parseDicom } from "../../src/parser/index.js";
import type { Profile } from "../../src/parser/types.js";
import {
  WARNING_CODES,
  WARNING_MESSAGES,
  type DicomParseWarning,
} from "../../src/parser/warnings.js";
import { defineProfile } from "../../src/profiles/index.js";
import { serializeDicom } from "../../src/serialize/serialize.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_IMPLICIT_LE = "1.2.840.10008.1.2";

const CODE = WARNING_CODES.DICOM_DEIDENT_UNREGISTERED_ELEMENT_REMOVED;

/** Patient's Name, synthetic and on the scanner's allow-list. Its surname is `SMITHSON`. */
const PATIENT_NAME = "SMITHSON^BRAIN";
const SURNAME = "SMITHSON";

/**
 * `(4854,4F53)`: no PS3.6 2026d row, literal or masked, and no Table E.1-1 row.
 * Its four wire bytes, both halves little-endian, are `"THSO"`: four letters of
 * {@link SURNAME}. That is what makes the AC-6 renderings a PHI question rather
 * than a formality.
 */
const UNREGISTERED: Tag = "48544F53";
const UNREGISTERED_WIRE_TEXT = "THSO";

/** A second unregistered tag in the same group, for the Sequence cases. */
const UNREGISTERED_SQ: Tag = "48545153";

/** `(2000,0050)` Film Session Label: registered, `LO`, and absent from Table E.1-1. */
const REGISTERED_UNLISTED: Tag = "20000050";

/** `(300C,0002)` Referenced RT Plan Sequence: a registered `SQ` Table E.1-1 does not list. */
const UNLISTED_SQ: Tag = "300C0002";
/** `(0008,1110)` Referenced Study Sequence: listed, `K` under `RetainUIDs`. */
const LISTED_KEEP_SQ: Tag = "00081110";
/** `(0040,A730)` Content Sequence: listed, `C` under `CleanStructuredContent`. */
const LISTED_CLEAN_SQ: Tag = "0040A730";
/** A private `SQ` the profile below vouches for, and the creator that reserves its block. */
const PRIVATE_SQ: Tag = "00091001";
const PRIVATE_CREATOR: Tag = "00090010";
const CREATOR_NAME = "ACME PRIVATE 01";

/** Synthetic and name-bearing, even length. Each part is searched for on its own. */
const PAYLOAD = "REFERRED BY DR XANTHIPPE QUORNSBY ";
const NAME_PARTS = ["XANTHIPPE", "QUORNSBY"] as const;

const SOP_CLASS = "1.2.840.10008.5.1.4.1.1.2";
const SOP_INSTANCE = "2.25.100200300400500600700800901";

type AnyElement = BuildDicomElement | BuildDicomSqElement;

function text(value: string): Buffer {
  const b = Buffer.from(value, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

function leaf(tag: Tag, vr: VR, value: string = PAYLOAD): BuildDicomElement {
  return { tag, vr, value: text(value) };
}

/** Ascending tag order within one Data Set, as a conformant writer emits it. */
function sorted(elements: readonly AnyElement[]): AnyElement[] {
  return [...elements].sort((a, b) => a.tag.localeCompare(b.tag));
}

function build(elements: readonly AnyElement[], transferSyntax = TS_EXPLICIT_LE): Buffer {
  return buildDicom({
    transferSyntax,
    mediaStorageSOPClassUID: SOP_CLASS,
    mediaStorageSOPInstanceUID: SOP_INSTANCE,
    elements: sorted([leaf("00100010", "PN", PATIENT_NAME), ...elements]),
  });
}

/** The Data Set and every Sequence Item beneath it, root first. */
function dataSets(ds: Dataset): Dataset[] {
  const out: Dataset[] = [ds];
  for (const el of ds.elements()) for (const item of el.items ?? []) out.push(...dataSets(item));
  return out;
}

/** Every Data Set, at any depth, that still holds `tag`. */
function holders(ds: Dataset, tag: Tag): Dataset[] {
  return dataSets(ds).filter((d) => d.has(tag));
}

function carries(bytes: Buffer, part: string): boolean {
  return bytes.includes(Buffer.from(part, "latin1"));
}

function codes(report: DeidentifyReport): string[] {
  return report.warnings.map((w) => w.code);
}

/** The four wire bytes a tag was composed from, both halves little-endian. */
function wireText(tag: Tag): string {
  const b = Buffer.alloc(4);
  b.writeUInt16LE(parseInt(tag.slice(0, 4), 16), 0);
  b.writeUInt16LE(parseInt(tag.slice(4, 8), 16), 2);
  return b.toString("latin1");
}

/**
 * Every rendering AC-6 names: eight hex digits in upper and lower case,
 * `(gggg,eeee)` in both cases, and the four raw tag bytes read as Latin-1.
 */
function renderings(tag: Tag): string[] {
  const group = tag.slice(0, 4);
  const element = tag.slice(4, 8);
  return [
    tag.toUpperCase(),
    tag.toLowerCase(),
    `(${group.toUpperCase()},${element.toUpperCase()})`,
    `(${group.toLowerCase()},${element.toLowerCase()})`,
    wireText(tag),
  ];
}

/** The whole report as text, `uidMap` included, plus every warning message the call returned. */
function surface(report: DeidentifyReport, datasetWarnings: readonly DicomParseWarning[]): string {
  const reportText = JSON.stringify(report, (_key, value: unknown) =>
    value instanceof Map ? [...(value as Map<unknown, unknown>).entries()] : value,
  );
  return [reportText, ...datasetWarnings.map((w) => w.message)].join("\n");
}

function renderingsIn(haystack: string, tag: Tag): string[] {
  return renderings(tag).filter((r) => haystack.includes(r));
}

/** A profile vouching for {@link PRIVATE_SQ} as a Sequence under {@link CREATOR_NAME}. */
const PROFILE: Profile = defineProfile({
  name: "acme-unregistered",
  privateTags: {
    [CREATOR_NAME]: {
      "0009XX01": { vr: "SQ", keyword: "AcmeCarrier", name: "Acme Carrier Sequence" },
    },
  },
});

describe("AC-1: the root Data Set", () => {
  it.each([
    ["Explicit VR Little Endian", TS_EXPLICIT_LE],
    ["Implicit VR Little Endian", TS_IMPLICIT_LE],
  ])(
    "AC-1: under %s, omits it, and the serialized re-parse carries neither tag nor name",
    (_label, ts) => {
      expect(annexE(UNREGISTERED)).toBeUndefined();
      expect(isRegisteredTag(UNREGISTERED)).toBe(false);
      const parsed = parseDicom(build([leaf(UNREGISTERED, "LO")], ts));
      // Precondition: the element really reached the de-identifier carrying the name.
      expect(carries(parsed.get(UNREGISTERED)?.rawBytes ?? Buffer.alloc(0), NAME_PARTS[0])).toBe(
        true,
      );

      const { dataset } = deidentify(parsed);
      expect(dataset.has(UNREGISTERED)).toBe(false);

      const out = serializeDicom(dataset);
      expect(parseDicom(out).has(UNREGISTERED)).toBe(false);
      for (const part of NAME_PARTS) expect(carries(out, part), part).toBe(false);
    },
  );

  it("AC-1: the mutation control, the same value under a registered unlisted tag, is found in the output", () => {
    // Proves the byte search above can go red: the serializer and the search are
    // the same, only the tag differs, and a registered tag Table E.1-1 does not
    // list is kept.
    expect(annexE(REGISTERED_UNLISTED)).toBeUndefined();
    expect(isRegisteredTag(REGISTERED_UNLISTED)).toBe(true);
    for (const ts of [TS_EXPLICIT_LE, TS_IMPLICIT_LE]) {
      const { dataset } = deidentify(parseDicom(build([leaf(REGISTERED_UNLISTED, "LO")], ts)));
      const out = serializeDicom(dataset);
      expect(parseDicom(out).has(REGISTERED_UNLISTED), ts).toBe(true);
      for (const part of NAME_PARTS) expect(carries(out, part), `${ts}: ${part}`).toBe(true);
    }
  });
});

/**
 * One container, holding the unregistered element one Item down and, in a
 * nested container of the same kind, two Items down. A private container carries
 * its own creator in every Data Set, because PS3.5 7.8.1 scopes a reservation to
 * one Data Set and Items do not inherit it.
 */
function nestedIn(container: Tag, privateCarrier: boolean): AnyElement[] {
  return containing(container, privateCarrier, [leaf(UNREGISTERED, "LO")], true);
}

/**
 * The root-level elements for one `container` whose Item holds `contents` and,
 * when `nest` is set, a second container of the same kind holding them again.
 */
function containing(
  container: Tag,
  privateCarrier: boolean,
  contents: readonly AnyElement[],
  nest: boolean,
): AnyElement[] {
  const creator = privateCarrier ? [leaf(PRIVATE_CREATOR, "LO", CREATOR_NAME)] : [];
  const inner: BuildDicomSqElement[] = nest
    ? [{ tag: container, items: [{ elements: sorted([...creator, ...contents]) }] }]
    : [];
  return [
    ...creator,
    { tag: container, items: [{ elements: sorted([...creator, ...contents, ...inner]) }] },
  ];
}

interface Container {
  readonly label: string;
  readonly tag: Tag;
  readonly retain: readonly DeidentifyOption[];
  /** The Table E.1-1 action the active Option resolves the container to, when it is listed. */
  readonly listedAs?: "K" | "C";
  readonly privateCarrier: boolean;
}

const CONTAINERS: readonly Container[] = [
  {
    label: "a registered SQ Table E.1-1 does not list",
    tag: UNLISTED_SQ,
    retain: [],
    privateCarrier: false,
  },
  {
    label: "a listed SQ kept under RetainUIDs",
    tag: LISTED_KEEP_SQ,
    retain: ["RetainUIDs"],
    listedAs: "K",
    privateCarrier: false,
  },
  {
    label: "a listed SQ cleaned under CleanStructuredContent",
    tag: LISTED_CLEAN_SQ,
    retain: ["CleanStructuredContent"],
    listedAs: "C",
    privateCarrier: false,
  },
  {
    label: "a private SQ a caller Profile vouches for under RetainSafePrivate",
    tag: PRIVATE_SQ,
    retain: ["RetainSafePrivate"],
    privateCarrier: true,
  },
];

/** The container is one the run descends: its listing, or its registration, is what the label says. */
function expectDescended(c: Container): void {
  if (c.privateCarrier) return;
  const option = c.retain[0];
  if (c.listedAs === undefined || option === undefined) {
    expect(annexE(c.tag)).toBeUndefined();
    expect(isRegisteredTag(c.tag)).toBe(true);
    return;
  }
  expect(annexE(c.tag)?.optionSet[option]).toBe(c.listedAs);
}

describe("AC-2: one and two Sequence Items down", () => {
  it.each(CONTAINERS.map((c) => [c.label, c] as const))(
    "AC-2: inside %s, omits it at both depths, in the object and in the serialized re-parse",
    (_label, c) => {
      const raw = build(nestedIn(c.tag, c.privateCarrier));
      const parsed = parseDicom(raw, { profile: PROFILE });
      // Preconditions: both copies reached the de-identifier, and the container is
      // one this run descends rather than removes.
      expect(holders(parsed, UNREGISTERED)).toHaveLength(2);
      expectDescended(c);

      const { dataset, report } = deidentify(parsed, { retain: [...c.retain], profile: PROFILE });
      // The container survived with both Items, so the absence below is this rule's.
      const outer = dataset.get(c.tag)?.items?.[0];
      expect(outer, "the outer Item survives").toBeDefined();
      expect(outer?.get(c.tag)?.items?.[0], "the nested Item survives").toBeDefined();
      expect(holders(dataset, UNREGISTERED)).toEqual([]);
      expect(report.unregisteredElementRemovalCount).toBe(2);

      const out = serializeDicom(dataset);
      expect(holders(parseDicom(out, { profile: PROFILE }), UNREGISTERED)).toEqual([]);
      for (const part of NAME_PARTS) expect(carries(out, part), part).toBe(false);
    },
  );

  it("AC-2: the mutation control, the same nesting under a registered unlisted tag, reaches the output", () => {
    for (const c of CONTAINERS) {
      const raw = build(
        containing(c.tag, c.privateCarrier, [leaf(REGISTERED_UNLISTED, "LO")], true),
      );
      const { dataset } = deidentify(parseDicom(raw, { profile: PROFILE }), {
        retain: [...c.retain],
        profile: PROFILE,
      });
      const out = serializeDicom(dataset);
      for (const part of NAME_PARTS) expect(carries(out, part), `${c.label}: ${part}`).toBe(true);
    }
  });
});

describe("AC-3: keyed on the tag, never on the VR", () => {
  it("AC-3: removes one carried with explicit VR UN", () => {
    const parsed = parseDicom(build([leaf(UNREGISTERED, "UN")]));
    expect(parsed.get(UNREGISTERED)?.vr).toBe("UN");
    const { dataset, report } = deidentify(parsed);
    expect(dataset.has(UNREGISTERED)).toBe(false);
    expect(report.unregisteredElementRemovalCount).toBe(1);
    for (const part of NAME_PARTS) expect(carries(serializeDicom(dataset), part), part).toBe(false);
  });

  it("AC-3: removes one read as UN under Implicit VR Little Endian", () => {
    const parsed = parseDicom(build([leaf(UNREGISTERED, "LO")], TS_IMPLICIT_LE));
    // No VR on the wire and no registry row, so the parser can only say UN.
    expect(parsed.get(UNREGISTERED)?.vr).toBe("UN");
    const { dataset, report } = deidentify(parsed);
    expect(dataset.has(UNREGISTERED)).toBe(false);
    expect(report.unregisteredElementRemovalCount).toBe(1);
  });
});

describe("AC-5: the removal record", () => {
  it("AC-5: counts every removal and lists each by byte offset, with a context path only when nested", () => {
    const raw = build([leaf(UNREGISTERED, "LO"), ...nestedIn(UNLISTED_SQ, false)]);
    const parsed = parseDicom(raw);
    const rootOffset = parsed.get(UNREGISTERED)?.byteOffset;
    const oneDown = parsed.get(UNLISTED_SQ)?.items?.[0];
    const twoDown = oneDown?.get(UNLISTED_SQ)?.items?.[0];
    const { report } = deidentify(parsed);

    expect(report.unregisteredElementRemovalCount).toBe(3);
    // Traversal order: each Data Set in file order, descending as it goes, and
    // `(300C,0002)` sorts ahead of `(4854,4F53)` at both levels.
    expect(report.unregisteredElementRemovals).toEqual([
      {
        byteOffset: twoDown?.get(UNREGISTERED)?.byteOffset,
        contextPath: [`${UNLISTED_SQ}[0]`, `${UNLISTED_SQ}[0]`],
      },
      { byteOffset: oneDown?.get(UNREGISTERED)?.byteOffset, contextPath: [`${UNLISTED_SQ}[0]`] },
      { byteOffset: rootOffset },
    ]);
    // "and no other field", read off every entry rather than off the literal above.
    for (const finding of report.unregisteredElementRemovals) {
      expect(Object.keys(finding).filter((k) => k !== "byteOffset" && k !== "contextPath")).toEqual(
        [],
      );
    }
  });

  it("AC-5: is a record apart from the Table E.1-1 audit, the private, group-0004 and undefined-VR records", () => {
    const { report } = deidentify(parseDicom(build([leaf(UNREGISTERED, "LO")])));
    expect(report.unregisteredElementRemovalCount).toBe(1);
    expect(report.attributes.map((a) => a.tag)).not.toContain(UNREGISTERED);
    expect(report.removedPrivateTags).not.toContain(UNREGISTERED);
    expect(report.group0004Removals).toEqual([]);
    expect(report.undefinedVrElements).toEqual([]);
  });

  it("AC-5: a run that removes none reports a count of zero and an empty list", () => {
    const { report } = deidentify(parseDicom(build([leaf(REGISTERED_UNLISTED, "LO")])));
    expect(report.unregisteredElementRemovalCount).toBe(0);
    expect(report.unregisteredElementRemovals).toEqual([]);
  });
});

describe("AC-6: the tag is on no warning and in no field of the report", () => {
  function run(): { readonly haystack: string; readonly report: DeidentifyReport } {
    const raw = build([leaf(UNREGISTERED, "LO"), ...nestedIn(UNLISTED_SQ, false)]);
    const { dataset, report } = deidentify(parseDicom(raw));
    return { haystack: surface(report, dataset.warnings), report };
  }

  it("AC-6: the tag's four wire bytes really are letters of the patient's surname", () => {
    // The precondition. Without it the absence below is decoration.
    expect(wireText(UNREGISTERED)).toBe(UNREGISTERED_WIRE_TEXT);
    expect(SURNAME).toContain(UNREGISTERED_WIRE_TEXT);
    expect(PATIENT_NAME.startsWith(SURNAME)).toBe(true);
  });

  it("AC-6: renders it in none of the five forms, anywhere on the report or its warnings", () => {
    const { haystack, report } = run();
    expect(report.unregisteredElementRemovalCount).toBe(3);
    expect(codes(report)).toContain(CODE);
    expect(renderingsIn(haystack, UNREGISTERED)).toEqual([]);
  });

  it("AC-6: the mutation control, each rendering planted on the report, is found", () => {
    // Proves every arm of the search can go red: the same report and the same
    // search, with a warning that renders the tag the way an implementation that
    // passed it to a message would.
    const { report } = run();
    for (const rendered of renderings(UNREGISTERED)) {
      const mutated: DeidentifyReport = {
        ...report,
        warnings: [
          ...report.warnings,
          { code: CODE, message: `Element ${rendered} removed.`, position: { byteOffset: 0 } },
        ],
      };
      expect(renderingsIn(surface(mutated, []), UNREGISTERED), rendered).toContain(rendered);
    }
  });
});

describe("AC-7: one warning per run, from the registry", () => {
  it("AC-7: adds exactly one, however many were removed, whose message is its registry template", () => {
    const raw = build([leaf(UNREGISTERED, "LO"), ...nestedIn(UNLISTED_SQ, false)]);
    const { report } = deidentify(parseDicom(raw));
    expect(report.unregisteredElementRemovalCount).toBe(3);
    const raised = report.warnings.filter((w) => w.code === CODE);
    expect(raised).toHaveLength(1);
    expect(raised[0]?.message).toBe(WARNING_MESSAGES[CODE]);
  });

  it("AC-7: the template carries no {tag}, {vr} or {vr2} token", () => {
    expect(WARNING_MESSAGES[CODE]).not.toMatch(/\{tag\}|\{vr\}|\{vr2\}/u);
  });

  it("AC-7: a run that removes none adds none", () => {
    const { report } = deidentify(parseDicom(build([leaf(REGISTERED_UNLISTED, "LO")])));
    expect(codes(report)).not.toContain(CODE);
  });
});

describe("AC-8: past the findings cap", () => {
  /** `n` distinct unregistered tags in group 4854, none of them a group length. */
  function unregisteredRun(n: number, start: number): BuildDicomElement[] {
    return Array.from({ length: n }, (_, i) => {
      const tag = `4854${(start + i).toString(16).padStart(4, "0")}`.toUpperCase();
      return leaf(tag, "LO");
    });
  }

  it("AC-8: removes every one across the root and several Items, counts them all, and lists exactly the cap", () => {
    const perDataSet = 40;
    const items = 3;
    const raw = build([
      ...unregisteredRun(perDataSet, 0x1000),
      {
        tag: UNLISTED_SQ,
        items: Array.from({ length: items }, () => ({
          elements: unregisteredRun(perDataSet, 0x1000),
        })),
      },
    ]);
    const parsed = parseDicom(raw);
    const total = perDataSet * (items + 1);
    // Precondition: the fixture carries more than the cap, spread over four Data Sets.
    expect(total).toBeGreaterThan(MAX_UNREGISTERED_ELEMENT_FINDINGS);
    expect(
      dataSets(parsed)
        .flatMap((d) => d.elements())
        .filter((el) => el.tag.startsWith("4854")),
    ).toHaveLength(total);

    const { dataset, report } = deidentify(parsed);
    expect(report.unregisteredElementRemovalCount).toBe(total);
    expect(report.unregisteredElementRemovals).toHaveLength(MAX_UNREGISTERED_ELEMENT_FINDINGS);
    expect(
      dataSets(dataset)
        .flatMap((d) => d.elements())
        .filter((el) => el.tag.startsWith("4854")),
    ).toEqual([]);
    // The last Item is far past the cap and its elements are gone from the bytes too.
    for (const part of NAME_PARTS) expect(carries(serializeDicom(dataset), part), part).toBe(false);
    expect(report.warnings.filter((w) => w.code === CODE)).toHaveLength(1);
  });
});

describe("AC-9: a registered attribute Table E.1-1 does not list", () => {
  it("AC-9: is kept byte for byte, with no finding, no count and no new warning", () => {
    const parsed = parseDicom(build([leaf(REGISTERED_UNLISTED, "LO")]));
    const before = parsed.get(REGISTERED_UNLISTED)?.rawBytes;
    const { dataset, report } = deidentify(parsed);
    expect(dataset.get(REGISTERED_UNLISTED)?.rawBytes.equals(before ?? Buffer.alloc(1))).toBe(true);
    expect(report.unregisteredElementRemovals).toEqual([]);
    expect(report.unregisteredElementRemovalCount).toBe(0);
    expect(report.warnings).toEqual([]);
  });
});

describe("AC-10: masked registry families", () => {
  const OVERLAY_ROWS_IN_BOUND: Tag = "60020010";
  const OVERLAY_ROWS_TOP_OF_BOUND: Tag = "601E0010";
  const OVERLAY_ROWS_PAST_BOUND: Tag = "60200010";
  const NTH_ORDER_ROWS: Tag = "00280410";
  const US_VALUE = Buffer.from([0x00, 0x02]);

  function run(tag: Tag): {
    readonly kept: boolean;
    readonly same: boolean;
    readonly count: number;
  } {
    const parsed = parseDicom(build([{ tag, vr: "US", value: US_VALUE }]));
    const before = parsed.get(tag)?.rawBytes;
    expect(annexE(tag), tag).toBeUndefined();
    const { dataset, report } = deidentify(parsed);
    const after = dataset.get(tag)?.rawBytes;
    return {
      kept: after !== undefined,
      same: after !== undefined && before !== undefined && after.equals(before),
      count: report.unregisteredElementRemovalCount,
    };
  }

  it("AC-10: keeps (60xx,0010) inside PS3.5 7.6's bound, at both ends of it", () => {
    for (const tag of [OVERLAY_ROWS_IN_BOUND, OVERLAY_ROWS_TOP_OF_BOUND]) {
      expect(run(tag), tag).toEqual({ kept: true, same: true, count: 0 });
    }
  });

  it("AC-10: removes the same element one group past the bound", () => {
    expect(run(OVERLAY_ROWS_PAST_BOUND)).toEqual({ kept: false, same: false, count: 1 });
  });

  it("AC-10: keeps a member of a masked row outside 7.6, (0028,0410) under (0028,04x0)", () => {
    expect(run(NTH_ORDER_ROWS)).toEqual({ kept: true, same: true, count: 0 });
  });
});

describe("AC-11: a registered element carried as UN", () => {
  it("AC-11: is not removed under this rule, and its value is kept byte for byte", () => {
    const parsed = parseDicom(build([leaf(REGISTERED_UNLISTED, "UN")]));
    expect(parsed.get(REGISTERED_UNLISTED)?.vr).toBe("UN");
    const before = parsed.get(REGISTERED_UNLISTED)?.rawBytes;
    const { dataset, report } = deidentify(parsed);
    expect(dataset.get(REGISTERED_UNLISTED)?.rawBytes.equals(before ?? Buffer.alloc(1))).toBe(true);
    expect(report.unregisteredElementRemovals).toEqual([]);
    expect(report.unregisteredElementRemovalCount).toBe(0);
  });
});

describe("AC-12: an unregistered Sequence", () => {
  it("AC-12: with materialized Items, is removed whole with exactly one finding and nothing for its contents", () => {
    const raw = build([
      {
        tag: UNREGISTERED_SQ,
        items: [{ elements: [leaf(UNREGISTERED, "LO"), leaf(REGISTERED_UNLISTED, "LO")] }],
      },
    ]);
    const parsed = parseDicom(raw);
    // Precondition: the parse did materialize the Items, with an unregistered element inside.
    expect(parsed.get(UNREGISTERED_SQ)?.items?.[0]?.has(UNREGISTERED)).toBe(true);

    const { dataset, report } = deidentify(parsed);
    expect(dataset.has(UNREGISTERED_SQ)).toBe(false);
    expect(report.unregisteredElementRemovals).toEqual([
      { byteOffset: parsed.get(UNREGISTERED_SQ)?.byteOffset },
    ]);
    expect(report.unregisteredElementRemovalCount).toBe(1);
    expect(report.unauditableSequences).toEqual([]);
    expect(codes(report)).not.toContain(WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE);
    for (const part of NAME_PARTS) expect(carries(serializeDicom(dataset), part), part).toBe(false);
  });

  it("AC-12: with no Items materialized, built through the public Element constructor, is removed the same way", () => {
    const value = text(PAYLOAD);
    const unwalked = new Element({
      tag: UNREGISTERED_SQ,
      vr: "SQ",
      vm: 1,
      length: value.length,
      rawBytes: value,
      byteOffset: 1234,
      littleEndian: true,
    });
    // Precondition: the shape is the one no parse of this tag produces - an SQ with no items.
    expect(unwalked.items).toBeUndefined();
    const ds = new Dataset({ warnings: [], elements: new Map([[UNREGISTERED_SQ, unwalked]]) });

    const { dataset, report } = deidentify(ds);
    expect(dataset.has(UNREGISTERED_SQ)).toBe(false);
    expect(report.unregisteredElementRemovals).toEqual([{ byteOffset: 1234 }]);
    expect(report.unregisteredElementRemovalCount).toBe(1);
    expect(report.unauditableSequences).toEqual([]);
    expect(codes(report)).not.toContain(WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE);
  });
});

describe("AC-13: group lengths and group 0004 are not this rule's", () => {
  it("AC-13: keeps a (gggg,0000) group length for an even group other than 0002, value unchanged", () => {
    const GROUP_LENGTH: Tag = "00080000";
    // Unregistered, so the exemption is what keeps it rather than the registry.
    expect(isRegisteredTag(GROUP_LENGTH)).toBe(false);
    const value = Buffer.alloc(4);
    value.writeUInt32LE(10, 0);
    const parsed = parseDicom(build([{ tag: GROUP_LENGTH, vr: "UL", value }]));
    const before = parsed.get(GROUP_LENGTH)?.rawBytes;
    expect(before).toBeDefined();
    const { dataset, report } = deidentify(parsed);
    expect(dataset.get(GROUP_LENGTH)?.rawBytes.equals(before ?? Buffer.alloc(1))).toBe(true);
    expect(report.unregisteredElementRemovals).toEqual([]);
    expect(report.unregisteredElementRemovalCount).toBe(0);
  });

  it("AC-13: leaves a (0004,xxxx) element in a non-DICOMDIR object on the group-0004 record", () => {
    const GROUP_0004: Tag = "00049990";
    // Unregistered as well, so were this rule consulted first it would claim it.
    expect(isRegisteredTag(GROUP_0004)).toBe(false);
    const { dataset, report } = deidentify(parseDicom(build([leaf(GROUP_0004, "LO")])));
    expect(dataset.has(GROUP_0004)).toBe(false);
    expect(report.group0004Removals.map((r) => r.tag)).toEqual([GROUP_0004]);
    expect(report.unregisteredElementRemovals).toEqual([]);
    expect(report.unregisteredElementRemovalCount).toBe(0);
    expect(codes(report)).not.toContain(CODE);
  });
});

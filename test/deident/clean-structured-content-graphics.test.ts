/**
 * The Clean Structured Content and Clean Graphics Options empty each list they clean.
 *
 * PS3.15 2026d section E.3.4 (Clean Structured Content): "Instances of Structured Report SOP Classes
 * may contain identifiable information in a Content Sequence (0040,A730) encoded in Content Items.
 * Instances of other SOP Classes may contain structured content encoded in a similar manner in the
 * Acquisition Context Sequence (0040,0555) or Specimen Preparation Sequence (0040,0610)." and "any
 * information encoded in SR Content Items or Acquisition Context or Specimen Preparation Sequence
 * Items corresponding to the Attribute information specified to be removed by the Profile and any
 * other Options specified shall also be removed."
 *
 * PS3.15 2026d section E.3.3 (Clean Graphics): "any information encoded in graphics, text
 * annotations or overlays corresponding to the Attribute information specified to be removed by the
 * Profile and any other Options specified shall also be removed".
 *
 * Table E.1-1 gives five Sequences a `C` in those two columns: Acquisition Context Sequence
 * `(0040,0555)`, Specimen Preparation Sequence `(0040,0610)`, Content Sequence `(0040,A730)` and
 * Waveform Annotation Sequence `(0040,B020)` under Clean Structured Content, and Graphic Annotation
 * Sequence `(0070,0001)` under Clean Graphics. Walking their Items kept every attribute in them with
 * no row of its own, Text Value `(0040,A160)` and Code Meaning `(0008,0104)` among them, while the
 * report said `cleaned`. Each is now kept with no Items, at every depth, and the report says
 * `cleaned`.
 *
 * Everything here is **synthetic**: fixtures are built in memory by `build-dicom`, and every code,
 * scheme, meaning and name is an invented placeholder. No real patient data is used.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  type Dataset,
  deidentify,
  type DeidentifyOption,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import { annexE, annexETags } from "../../src/dictionary/annex-e.js";
import { tagEntry } from "../../src/dictionary/registry.js";
import type { Tag } from "../../src/dictionary/types.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Even-pad a text value (space) so the fixture builder gets a legal length. */
function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

const TEXT_VALUE = "SEEN BY DR ZEBEDEE FAKENAME";
const CODE_VALUE = "SYNTH-77";
const CODE_SCHEME = "99SYNTH";
const CODE_MEANING = "FAKE NOTE ABOUT DOE^JANE";
const ANNOTATION_TEXT = "PATIENT QUIMBY FAKEPERSON";

/** Every payload above, each searched for in the written bytes on its own. */
const PAYLOADS = [TEXT_VALUE, CODE_VALUE, CODE_SCHEME, CODE_MEANING, ANNOTATION_TEXT, "DOE^JANE"];

type AnyElement = BuildDicomElement | BuildDicomSqElement;

/** Ascending tag order within one Data Set, as a conformant writer emits it. */
function sorted(elements: readonly AnyElement[]): AnyElement[] {
  return [...elements].sort((a, b) => a.tag.localeCompare(b.tag));
}

/** A Concept Name Code Sequence `(0040,A043)` Item with a Code Value, scheme and Code Meaning. */
function conceptName(): BuildDicomSqElement {
  return {
    tag: "0040A043",
    items: [
      {
        elements: [
          { tag: "00080100", vr: "SH", value: pad(CODE_VALUE) },
          { tag: "00080102", vr: "SH", value: pad(CODE_SCHEME) },
          { tag: "00080104", vr: "LO", value: pad(CODE_MEANING) },
        ],
      },
    ],
  };
}

/** A Content Item: Value Type, Concept Name and a free-text Text Value, plus `extra`. */
function contentItem(extra: readonly AnyElement[] = []): { elements: AnyElement[] } {
  return {
    elements: sorted([
      { tag: "0040A040", vr: "CS", value: pad("TEXT") },
      conceptName(),
      { tag: "0040A160", vr: "UT", value: pad(TEXT_VALUE) },
      ...extra,
    ]),
  };
}

/** A Graphic Annotation Item: a Text Object Sequence whose Item carries Unformatted Text Value. */
function graphicItem(): { elements: AnyElement[] } {
  return {
    elements: [
      { tag: "00700002", vr: "CS", value: pad("LAYER1") },
      {
        tag: "00700008",
        items: [
          {
            elements: sorted([
              { tag: "00700006", vr: "ST", value: pad(ANNOTATION_TEXT) },
              conceptName(),
            ]),
          },
        ],
      },
    ],
  };
}

interface List {
  readonly tag: Tag;
  readonly name: string;
  readonly option: DeidentifyOption;
  readonly item: () => { elements: AnyElement[] };
}

const LISTS: readonly List[] = [
  {
    tag: "00400555",
    name: "Acquisition Context Sequence",
    option: "CleanStructuredContent",
    item: () => contentItem(),
  },
  {
    tag: "00400610",
    name: "Specimen Preparation Sequence",
    option: "CleanStructuredContent",
    // Each Item of this list holds a Specimen Preparation Step Content Item Sequence.
    item: () => ({ elements: [{ tag: "00400612", items: [contentItem()] }] }),
  },
  {
    tag: "0040A730",
    name: "Content Sequence",
    option: "CleanStructuredContent",
    item: () => contentItem(),
  },
  {
    tag: "0040B020",
    name: "Waveform Annotation Sequence",
    option: "CleanStructuredContent",
    item: () => ({
      elements: sorted([{ tag: "00700006", vr: "ST", value: pad(ANNOTATION_TEXT) }, conceptName()]),
    }),
  },
  {
    tag: "00700001",
    name: "Graphic Annotation Sequence",
    option: "CleanGraphics",
    item: () => graphicItem(),
  },
];

function build(elements: readonly AnyElement[]): Dataset {
  return parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: sorted(elements),
    }),
  );
}

function holding(list: List): Dataset {
  return build([{ tag: list.tag, items: [list.item(), list.item()] }]);
}

/** Every payload the written bytes still carry. */
function leaked(ds: Dataset): string[] {
  const out = serializeDicom(ds).toString("latin1");
  return PAYLOADS.filter((p) => out.includes(p));
}

describe("each list the two Options clean is emptied", () => {
  for (const list of LISTS) {
    it(`${list.option} empties ${list.name} and reports it cleaned`, () => {
      // The row is what this file says it is.
      expect(annexE(list.tag)?.optionSet[list.option]).toBe("C");
      const input = holding(list);
      // The control: the payload is in the input, and in its written bytes.
      expect(leaked(input).length).toBeGreaterThan(0);

      const { dataset, report } = deidentify(input, { retain: [list.option] });

      expect(dataset.has(list.tag)).toBe(true);
      expect(dataset.get(list.tag)?.items).toEqual([]);
      const audit = report.attributes.filter((a) => a.tag === list.tag);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: "C", applied: "cleaned" });
      expect(audit[0]?.contextPath).toBeUndefined();
      // Nothing inside the list is audited, because nothing inside it is kept.
      expect(report.attributes.some((a) => a.contextPath !== undefined)).toBe(false);

      expect(leaked(dataset)).toEqual([]);
      expect(parseDicom(serializeDicom(dataset)).get(list.tag)?.items).toEqual([]);
    });
  }

  it("leaves no Item of any list under the Basic Profile alone", () => {
    for (const list of LISTS) {
      const { dataset } = deidentify(holding(list));
      expect(dataset.get(list.tag)?.items ?? [], list.name).toEqual([]);
      expect(leaked(dataset), list.name).toEqual([]);
    }
  });

  it("covers every Sequence Table E.1-1 gives a C under either Option", () => {
    const options: readonly DeidentifyOption[] = ["CleanStructuredContent", "CleanGraphics"];
    const listed = annexETags()
      .filter((tag) => tagEntry(tag)?.vr.includes("SQ") === true)
      .filter((tag) => options.some((o) => annexE(tag)?.optionSet[o] === "C"))
      .sort();
    expect(listed).toEqual(LISTS.map((l) => l.tag).sort());
  });
});

describe("at every depth", () => {
  it("empties a list nested in a list, and a list nested in an Item the run walks", () => {
    // (300C,0002) Referenced RT Plan Sequence: registered, unlisted, so its Items are walked. Its
    // Item holds a Content Sequence whose Content Item holds another Content Sequence.
    const nestedContent: BuildDicomSqElement = {
      tag: "0040A730",
      items: [contentItem([{ tag: "0040A730", items: [contentItem()] }])],
    };
    const input = build([
      nestedContent,
      { tag: "300C0002", items: [{ elements: [{ ...nestedContent }] }] },
    ]);
    // The control: the Text Value two Content Sequences down is there to remove.
    expect(
      input.get("0040A730")?.items?.[0]?.get("0040A730")?.items?.[0]?.get("0040A160"),
    ).toBeDefined();
    expect(leaked(input).length).toBeGreaterThan(0);

    const { dataset, report } = deidentify(input, { retain: ["CleanStructuredContent"] });

    expect(dataset.get("0040A730")?.items).toEqual([]);
    const walked = dataset.get("300C0002")?.items?.[0];
    expect(walked).toBeDefined();
    expect(walked?.has("0040A730")).toBe(true);
    expect(walked?.get("0040A730")?.items).toEqual([]);

    const audits = report.attributes.filter((a) => a.tag === "0040A730");
    expect(audits).toHaveLength(2);
    for (const a of audits) expect(a).toMatchObject({ action: "C", applied: "cleaned" });
    expect(audits.map((a) => a.contextPath)).toEqual([undefined, ["300C0002[0]"]]);
    expect(leaked(dataset)).toEqual([]);
  });

  it("the control: the same nesting under the Basic Profile leaves nothing either", () => {
    const nestedContent: BuildDicomSqElement = {
      tag: "0040A730",
      items: [contentItem([{ tag: "0040A730", items: [contentItem()] }])],
    };
    const { dataset } = deidentify(
      build([{ tag: "300C0002", items: [{ elements: [nestedContent] }] }]),
    );
    expect(leaked(dataset)).toEqual([]);
  });
});

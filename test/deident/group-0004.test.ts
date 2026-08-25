/**
 * Group 0004 is removed from everything that is not a DICOMDIR (PS3.15 2026c
 * §E.1.1).
 *
 * > All Data Elements with a Group Number of 0004 shall be removed from any SOP
 * > Instance or DICOM File other than a DICOMDIR File. If a DICOMDIR File is
 * > required, it shall either be created from the de-identified DICOM Files it
 * > references, or an existing DICOMDIR File shall be de-identifed according to
 * > this Profile. Any existing non-de-identified DICOMDIR File shall be removed
 * > from the File-set.
 *
 * The bullet has three clauses and this library discharges the first. The other
 * two need a DICOMDIR model and a File-set view it does not have, which is why
 * the carve-out is not silent: see the AC7 block.
 *
 * All fixtures are **synthetic**, built in memory by `build-dicom`.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DEIDENTIFY_OPTIONS,
  WARNING_CODES,
  deidentify,
  parseDicom,
  serializeDicom,
  type DeidentifyOption,
} from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";
import { MAX_GROUP_0004_FINDINGS } from "../../src/deident/deidentify.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomOptions,
} from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Media Storage Directory Storage - the one SOP Class the carve-out is keyed to. */
const SOP_CLASS_DICOMDIR = "1.2.840.10008.1.3.10";
/** Anything else. */
const SOP_CLASS_CT = "1.2.840.10008.5.1.4.1.1.2";

/** Fake but recognizable, so a leak is a leak and not an inert placeholder. */
const FILE_SET = {
  id: "ACMEGEN_FILESET",
  descriptor: "README",
  recordType: "PATIENT",
  referencedFile: "DICOM/PAT001",
  patientName: "DOE^JANE",
} as const;

function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

/** The plain group-0004 leaves a directory-bearing object carries at the root. */
const ROOT_0004: BuildDicomOptions["elements"] = [
  { tag: "00041130", vr: "CS", value: pad(FILE_SET.id) },
  { tag: "00041141", vr: "CS", value: pad(FILE_SET.descriptor) },
  { tag: "00041212", vr: "US", value: Buffer.from([0xff, 0xff]) },
];

/**
 * A file carrying group-0004 elements at the root AND inside a Sequence Item,
 * plus ordinary PHI so the run has real work beside this rule.
 *
 * The nested ones sit inside `(0008,1115)` Referenced Series Sequence rather
 * than inside a `(0004,xxxx)` sequence, deliberately: a nested `(0004,xxxx)`
 * that is only reached by descending a `(0004,xxxx)` carrier would be removed
 * by its parent's removal, and would prove nothing about the descent.
 */
function buildDirectoryBearingFile(overrides: Partial<BuildDicomOptions> = {}): Buffer {
  return buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    mediaStorageSOPClassUID: SOP_CLASS_CT,
    mediaStorageSOPInstanceUID: "1.2.840.113619.2.55.3.1",
    elements: [
      { tag: "00080018", vr: "UI", value: pad("1.2.840.113619.2.55.3.1") },
      ...ROOT_0004,
      {
        tag: "00081115",
        items: [
          {
            elements: [
              { tag: "0020000E", vr: "UI", value: pad("1.2.840.113619.2.55.3.3") },
              { tag: "00041500", vr: "CS", value: pad(FILE_SET.referencedFile) },
              {
                tag: "00081199",
                items: [
                  {
                    elements: [
                      { tag: "00041430", vr: "CS", value: pad(FILE_SET.recordType) },
                      { tag: "00100010", vr: "PN", value: pad(FILE_SET.patientName) },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  });
}

/** Every tag present anywhere in a dataset, root and nested, in traversal order. */
function allTags(ds: ReturnType<typeof parseDicom>): Tag[] {
  const out: Tag[] = [];
  const walk = (
    elements: readonly { tag: Tag; items?: readonly { elements: () => readonly never[] }[] }[],
  ): void => {
    for (const el of elements) {
      out.push(el.tag);
      for (const item of el.items ?? []) walk(item.elements());
    }
  };
  walk(ds.elements() as never);
  return out;
}

describe("AC5: group 0004 is removed from a dataset that is not a DICOMDIR", () => {
  it("removes every root-level (0004,xxxx) element", () => {
    const source = buildDirectoryBearingFile();
    const before = parseDicom(source);
    // Control: the fixture really carries them.
    expect(before.has("00041130")).toBe(true);
    expect(before.has("00041141")).toBe(true);
    expect(before.has("00041212")).toBe(true);

    const { dataset, report } = deidentify(before);

    expect(dataset.has("00041130")).toBe(false);
    expect(dataset.has("00041141")).toBe(false);
    expect(dataset.has("00041212")).toBe(false);
    expect(allTags(dataset).filter((t) => t.startsWith("0004"))).toEqual([]);
    expect(report.group0004RemovalCount).toBe(5);
  });

  it("removes them from the serialized bytes and from a re-parse", () => {
    const { dataset } = deidentify(parseDicom(buildDirectoryBearingFile()));
    const bytes = serializeDicom(dataset);
    expect(bytes.includes(Buffer.from(FILE_SET.id, "latin1"))).toBe(false);
    expect(bytes.includes(Buffer.from(FILE_SET.descriptor, "latin1"))).toBe(false);
    expect(bytes.includes(Buffer.from(FILE_SET.referencedFile, "latin1"))).toBe(false);
    expect(allTags(parseDicom(bytes)).filter((t) => t.startsWith("0004"))).toEqual([]);
  });

  it("removes a (0004,xxxx) Sequence with everything inside it", () => {
    const source = buildDirectoryBearingFile({
      elements: [
        {
          tag: "00041220",
          items: [{ elements: [{ tag: "00100010", vr: "PN", value: pad(FILE_SET.patientName) }] }],
        },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(source));
    expect(dataset.has("00041220")).toBe(false);
    expect(report.group0004RemovalCount).toBe(1);
    expect(serializeDicom(dataset).includes(Buffer.from(FILE_SET.patientName, "latin1"))).toBe(
      false,
    );
  });

  it("holds under every Annex E Option, singly and all at once", () => {
    const cases: readonly (readonly DeidentifyOption[])[] = [
      [],
      ["RetainUIDs", "RetainSafePrivate", "RetainDeviceIdentity"],
      DEIDENTIFY_OPTIONS,
      ...DEIDENTIFY_OPTIONS.map((o) => [o] as const),
    ];
    for (const retain of cases) {
      const { dataset, report } = deidentify(parseDicom(buildDirectoryBearingFile()), {
        retain: [...retain],
      });
      const label = retain.length === 0 ? "(none)" : retain.join("+");
      expect(
        allTags(dataset).filter((t) => t.startsWith("0004")),
        label,
      ).toEqual([]);
      expect(report.group0004RemovalCount, label).toBe(5);
    }
  });
});

describe("AC6: group 0004 is removed inside Sequence Items, at every depth reached", () => {
  it("removes one nested one level down and one nested two levels down", () => {
    const source = buildDirectoryBearingFile();
    // Control: both nested elements really are in the parse tree.
    const beforeTags = allTags(parseDicom(source));
    expect(beforeTags).toContain("00041500");
    expect(beforeTags).toContain("00041430");

    const { dataset, report } = deidentify(parseDicom(source));

    const afterTags = allTags(dataset);
    expect(afterTags).not.toContain("00041500");
    expect(afterTags).not.toContain("00041430");
    // The enclosing sequences are still there and were still descended: the
    // removal decided the fate of two elements, not of the Data Sets holding
    // them.
    expect(afterTags).toContain("00081115");
    expect(afterTags).toContain("00081199");
    expect(afterTags).toContain("0020000E");

    const paths = report.group0004Removals
      .filter((r) => r.contextPath !== undefined)
      .map((r) => `${r.tag}@${(r.contextPath ?? []).join("/")}`);
    expect(paths).toEqual(["00041500@00081115[0]", "00041430@00081115[0]/00081199[0]"]);
  });

  it("removes a nested one even when its enclosing sequence has an undefined length", () => {
    const source = buildDirectoryBearingFile({
      elements: [
        {
          tag: "00081115",
          undefinedLength: true,
          items: [
            {
              undefinedLength: true,
              elements: [{ tag: "00041500", vr: "CS", value: pad(FILE_SET.referencedFile) }],
            },
          ],
        },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(source));
    expect(allTags(dataset)).not.toContain("00041500");
    expect(report.group0004RemovalCount).toBe(1);
    expect(serializeDicom(dataset).includes(Buffer.from(FILE_SET.referencedFile, "latin1"))).toBe(
      false,
    );
  });

  it("records the root removals without a context path and the nested ones with one", () => {
    const { report } = deidentify(parseDicom(buildDirectoryBearingFile()));
    const rootOnly = report.group0004Removals.filter((r) => r.contextPath === undefined);
    expect(rootOnly.map((r) => r.tag)).toEqual(["00041130", "00041141", "00041212"]);
    for (const r of report.group0004Removals) expect(r.applied).toBe("removed");
  });
});

describe("AC7: a DICOMDIR keeps its group 0004 and is told what was not discharged", () => {
  function buildDicomdir(overrides: Partial<BuildDicomOptions> = {}): Buffer {
    return buildDirectoryBearingFile({
      mediaStorageSOPClassUID: SOP_CLASS_DICOMDIR,
      ...overrides,
    });
  }

  it("leaves every (0004,xxxx) element in the output", () => {
    const { dataset, report } = deidentify(parseDicom(buildDicomdir()));

    expect(dataset.has("00041130")).toBe(true);
    expect(dataset.has("00041141")).toBe(true);
    expect(dataset.has("00041212")).toBe(true);
    const tags = allTags(dataset);
    expect(tags).toContain("00041500");
    expect(tags).toContain("00041430");
    expect(report.group0004Removals).toEqual([]);
    expect(report.group0004RemovalCount).toBe(0);
    // And they survive the write.
    expect(serializeDicom(dataset).includes(Buffer.from(FILE_SET.id, "latin1"))).toBe(true);
  });

  it("records the diagnostic saying the File-set obligations were not discharged", () => {
    const { report } = deidentify(parseDicom(buildDicomdir()));
    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED,
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toContain("File-set");
    expect(warning?.message).toContain("NOT");
  });

  it("raises the diagnostic even when the DICOMDIR carried no (0004,xxxx) element at all", () => {
    // Silence here would let a caller read "nothing to do, so this is a
    // conformant de-identified DICOMDIR" out of an empty findings array. The
    // clauses this run did not discharge are unrelated to what the object
    // happened to carry.
    const { report } = deidentify(
      parseDicom(
        buildDicomdir({
          elements: [{ tag: "00100010", vr: "PN", value: pad(FILE_SET.patientName) }],
        }),
      ),
    );
    expect(
      report.warnings.some(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED,
      ),
    ).toBe(true);
    expect(report.group0004RemovalCount).toBe(0);
  });

  it("is not raised for an ordinary object, which is the removal branch", () => {
    const { report } = deidentify(parseDicom(buildDirectoryBearingFile()));
    expect(
      report.warnings.some(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED,
      ),
    ).toBe(false);
  });

  it("keys the carve-out to the one UID and to nothing broader", () => {
    // A neighbouring Media Storage UID must NOT buy the carve-out.
    for (const uid of [SOP_CLASS_CT, "1.2.840.10008.1.3", "1.2.840.10008.1.3.100"]) {
      const { report } = deidentify(
        parseDicom(buildDirectoryBearingFile({ mediaStorageSOPClassUID: uid })),
      );
      expect(report.group0004RemovalCount, uid).toBe(5);
    }
  });

  it("still de-identifies the Data Sets the retained (0004,xxxx) structure sits beside", () => {
    // The carve-out is about group 0004, not about the rest of the object: a
    // retention decision must not decide the fate of the Data Sets around or
    // below it.
    const { dataset } = deidentify(parseDicom(buildDicomdir()));
    const bytes = serializeDicom(dataset);
    expect(bytes.includes(Buffer.from(FILE_SET.patientName, "latin1"))).toBe(false);
    expect(dataset.fileMeta?.mediaStorageSOPClassUID).toBe(SOP_CLASS_DICOMDIR);
  });
});

describe("AC12: the report tells the two §E.1.1 rules apart", () => {
  it("counts File Meta drops and group-0004 removals on separate fields", () => {
    const source = buildDirectoryBearingFile({
      fileMetaExtraElements: [
        { tag: "00020017", vr: "AE", value: pad("ACMEGEN_SEND") },
        { tag: "00020102", vr: "OB", value: pad("SITE=ACMEGEN") },
      ],
    });
    const { report } = deidentify(parseDicom(source));

    expect(report.fileMetaElementsDroppedCount).toBe(2);
    expect(report.group0004RemovalCount).toBe(5);
    expect(report.fileMetaElementsDropped.map((d) => d.tag)).toEqual(["00020017", "00020102"]);
    expect(report.group0004Removals.map((r) => r.tag)).toEqual([
      "00041130",
      "00041141",
      "00041212",
      "00041500",
      "00041430",
    ]);
    // Neither number is readable off the other, and both warnings are present.
    const codes = report.warnings.map((w) => w.code);
    expect(codes).toContain(WARNING_CODES.DICOM_DEIDENT_FILE_META_REPLACED);
    expect(codes).toContain(WARNING_CODES.DICOM_DEIDENT_GROUP_0004_REMOVED);
  });

  it("lets a caller count without re-parsing the output", () => {
    const { dataset, report } = deidentify(parseDicom(buildDirectoryBearingFile()));
    // The output cannot answer the question: the elements are gone from it by
    // design, so the count has to come off the report.
    expect(allTags(dataset).filter((t) => t.startsWith("0004"))).toHaveLength(0);
    expect(report.group0004RemovalCount).toBe(5);
  });

  it("stays silent when neither rule fired", () => {
    const clean = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: SOP_CLASS_CT,
      elements: [{ tag: "00100010", vr: "PN", value: pad(FILE_SET.patientName) }],
    });
    const { report } = deidentify(parseDicom(clean));
    expect(report.fileMetaElementsDroppedCount).toBe(0);
    expect(report.group0004RemovalCount).toBe(0);
    const codes = report.warnings.map((w) => w.code);
    expect(codes).not.toContain(WARNING_CODES.DICOM_DEIDENT_FILE_META_REPLACED);
    expect(codes).not.toContain(WARNING_CODES.DICOM_DEIDENT_GROUP_0004_REMOVED);
  });
});

describe("AC14: the record is capped per run and the action is not", () => {
  /** A file whose root carries `count` distinct group-0004 elements. */
  function buildManyGroup0004(count: number): Buffer {
    const elements: BuildDicomElement[] = [];
    for (let i = 0; i < count; i++) {
      // (0004,2000) upward: distinct tags, none of them a Sequence, so each is
      // one element in one Data Set rather than a nested tree.
      const element = 0x2000 + i;
      elements.push({
        tag: `0004${element.toString(16).padStart(4, "0").toUpperCase()}`,
        vr: "CS",
        value: pad(FILE_SET.id),
      });
    }
    return buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: SOP_CLASS_CT,
      elements,
    });
  }

  it("removes every element past the cap while the finding array stops at it", () => {
    const many = MAX_GROUP_0004_FINDINGS * 4;
    const source = buildManyGroup0004(many);
    expect(allTags(parseDicom(source)).filter((t) => t.startsWith("0004"))).toHaveLength(many);

    const { dataset, report } = deidentify(parseDicom(source));

    expect(report.group0004Removals).toHaveLength(MAX_GROUP_0004_FINDINGS);
    expect(report.group0004RemovalCount).toBe(many);
    expect(allTags(dataset).filter((t) => t.startsWith("0004"))).toEqual([]);
    expect(serializeDicom(dataset).includes(Buffer.from(FILE_SET.id, "latin1"))).toBe(false);
  });

  it("caps per RUN and not per Data Set", () => {
    // Half the elements at the root and half inside a Sequence Item. A per-Data
    // Set cap would let each Data Set spend its own budget and produce two caps'
    // worth of findings.
    const half = MAX_GROUP_0004_FINDINGS;
    const rootElements: BuildDicomElement[] = [];
    const itemElements: BuildDicomElement[] = [];
    for (let i = 0; i < half; i++) {
      const tag: Tag = `0004${(0x2000 + i).toString(16).padStart(4, "0").toUpperCase()}`;
      rootElements.push({ tag, vr: "CS", value: pad(FILE_SET.id) });
      itemElements.push({ tag, vr: "CS", value: pad(FILE_SET.id) });
    }
    const source = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: SOP_CLASS_CT,
      elements: [...rootElements, { tag: "00081115", items: [{ elements: itemElements }] }],
    });

    const { dataset, report } = deidentify(parseDicom(source));

    expect(report.group0004Removals).toHaveLength(MAX_GROUP_0004_FINDINGS);
    expect(report.group0004RemovalCount).toBe(half * 2);
    expect(allTags(dataset).filter((t) => t.startsWith("0004"))).toEqual([]);
  });

  it("raises one warning however many elements were removed", () => {
    for (const count of [1, MAX_GROUP_0004_FINDINGS * 4]) {
      const { report } = deidentify(parseDicom(buildManyGroup0004(count)));
      expect(
        report.warnings.filter((w) => w.code === WARNING_CODES.DICOM_DEIDENT_GROUP_0004_REMOVED),
        String(count),
      ).toHaveLength(1);
    }
  });
});

describe("AC13 (group-0004 half): the message text is registry-resolved and value-free", () => {
  it("carries no tag, no value, no count and no context path", () => {
    const { report } = deidentify(parseDicom(buildDirectoryBearingFile()));
    const message =
      report.warnings.find((w) => w.code === WARNING_CODES.DICOM_DEIDENT_GROUP_0004_REMOVED)
        ?.message ?? "";
    expect(message.length).toBeGreaterThan(0);
    for (const leak of [
      FILE_SET.id,
      FILE_SET.descriptor,
      FILE_SET.recordType,
      FILE_SET.referencedFile,
      FILE_SET.patientName,
      "00041130",
      "0004,1130",
      "00081115[0]",
    ]) {
      expect(message).not.toContain(leak);
    }
    expect(message).not.toMatch(/\{(tag|vr|vr2|n|n2)\}/);
  });

  it("is the same text whatever the file carried", () => {
    const a =
      deidentify(parseDicom(buildDirectoryBearingFile())).report.warnings.find(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_GROUP_0004_REMOVED,
      )?.message ?? "";
    const b =
      deidentify(
        parseDicom(
          buildDirectoryBearingFile({
            elements: [{ tag: "00041130", vr: "CS", value: pad("OTHER_SITE_9") }],
          }),
        ),
      ).report.warnings.find((w) => w.code === WARNING_CODES.DICOM_DEIDENT_GROUP_0004_REMOVED)
        ?.message ?? "";
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("the DICOMDIR diagnostic is value-free too", () => {
    const message =
      deidentify(
        parseDicom(buildDirectoryBearingFile({ mediaStorageSOPClassUID: SOP_CLASS_DICOMDIR })),
      ).report.warnings.find(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED,
      )?.message ?? "";
    for (const leak of [FILE_SET.id, FILE_SET.descriptor, FILE_SET.patientName, "00041130"]) {
      expect(message).not.toContain(leak);
    }
    // The one UID it does name is a constant of the code: it is the only value
    // that reaches this branch.
    expect(message).toContain(SOP_CLASS_DICOMDIR);
    expect(message).not.toMatch(/\{(tag|vr|vr2|n|n2)\}/);
  });
});

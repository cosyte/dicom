/**
 * The de-identified File Meta group describes THIS application, not the source
 * (PS3.15 2026c §E.1.1).
 *
 * > If the Data Set being de-identified is being stored within a DICOM File,
 * > then the File Meta Information including the 128 byte preamble, if present,
 * > shall be replaced with a description of the de-identifying application.
 * > Otherwise, there is a risk that identity information may leak through
 * > unmodified File Meta Information or preamble. [...] This includes
 * > information regarding Application Entity Titles, Presentation Addresses,
 * > implementation information, and private information.
 *
 * Everything here is **synthetic**: fixtures are built in memory by
 * `build-dicom` and the repo ships zero curated `.dcm` files. The
 * recognizable-but-fake site names below exist only to prove they are gone from
 * de-identified output; no real data is used.
 *
 * **Every assertion that matters is made on the SERIALIZED BYTES as well as on
 * the returned view.** A `FileMeta` field this run cleared is worth nothing if
 * the writer puts the source's value back from somewhere else, and the object a
 * caller actually shares is the buffer.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DEIDENTIFY_OPTIONS,
  Dataset,
  Element,
  WARNING_CODES,
  deidentify,
  parseDicom,
  serializeDicom,
  type DeidentifyOption,
} from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { MAX_FILE_META_DROP_FINDINGS } from "../../src/deident/deidentify.js";
import {
  COSYTE_IMPLEMENTATION_CLASS_UID,
  COSYTE_IMPLEMENTATION_VERSION_NAME,
  SH_VALUE_MAX_CHARS,
} from "../../src/serialize/file-meta.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomOptions,
} from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** A CT Image Storage SOP Class - anything that is not the DICOMDIR carve-out. */
const SOP_CLASS_CT = "1.2.840.10008.5.1.4.1.1.2";

/** Fake, recognizable identity the source File Meta group carries. */
const SOURCE = {
  aeTitle: "ACMEGEN_CT01",
  sendingAe: "ACMEGEN_SEND",
  receivingAe: "ACMEGEN_RECV",
  implClassUid: "1.2.840.113619.6.999",
  implVersion: "ACME_CT_4.1",
  privateCreator: "ACME PRIVATE FM",
  privateInfo: "SITE=ACMEGEN;WARD=7B",
  sopInstance: "1.2.840.113619.2.55.3.1",
} as const;

/** Even-pad a text value so the fixture builder gets a legal length. */
function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

/**
 * The non-modeled `(0002,xxxx)` elements the source carried: exactly the classes
 * §E.1.1 names, so a fixture that leaked would leak an AE Title or a private
 * information pair rather than an inert placeholder.
 */
const SOURCE_EXTRAS: NonNullable<BuildDicomOptions["fileMetaExtraElements"]> = [
  { tag: "00020017", vr: "AE", value: pad(SOURCE.sendingAe) },
  { tag: "00020018", vr: "AE", value: pad(SOURCE.receivingAe) },
  { tag: "00020100", vr: "UI", value: pad(SOURCE.privateCreator) },
  { tag: "00020102", vr: "OB", value: pad(SOURCE.privateInfo) },
];

/**
 * A source file whose File Meta group carries every identity element §E.1.1
 * names, plus a File Meta Information Version and a Media Storage SOP Class UID
 * so the object elements have something to be preserved from.
 */
function buildIdentityBearingFile(overrides: Partial<BuildDicomOptions> = {}): Buffer {
  return buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    mediaStorageSOPClassUID: SOP_CLASS_CT,
    mediaStorageSOPInstanceUID: SOURCE.sopInstance,
    implementationClassUID: SOURCE.implClassUid,
    implementationVersionName: SOURCE.implVersion,
    sourceApplicationEntityTitle: SOURCE.aeTitle,
    fileMetaExtraElements: [
      { tag: "00020001", vr: "OB", value: Buffer.from([0x00, 0x01]) },
      ...SOURCE_EXTRAS,
    ],
    elements: [
      { tag: "00080018", vr: "UI", value: pad(SOURCE.sopInstance) },
      { tag: "00100010", vr: "PN", value: pad("DOE^JANE") },
      { tag: "00100020", vr: "LO", value: pad("SECRET-MRN-123") },
    ],
    ...overrides,
  });
}

/**
 * Every `(0002,xxxx)` tag present in a serialized Part 10 buffer, read straight
 * off the wire rather than through the parser's projection - so an element the
 * typed view drops is still seen here.
 *
 * The File Meta group is always Explicit VR LE (PS3.10 §7.1) and always starts
 * right after the 128-byte preamble plus `DICM`.
 */
function fileMetaTagsOnTheWire(buf: Buffer): Tag[] {
  expect(buf.subarray(128, 132).toString("ascii")).toBe("DICM");
  const tags: Tag[] = [];
  let at = 132;
  while (at + 8 <= buf.length) {
    const group = buf.readUInt16LE(at);
    if (group !== 0x0002) break;
    const element = buf.readUInt16LE(at + 2);
    const vr = buf.subarray(at + 4, at + 6).toString("ascii");
    const longForm = ["OB", "OW", "OF", "OD", "OL", "OV", "SQ", "UC", "UR", "UT", "UN"].includes(
      vr,
    );
    const valueLength = longForm ? buf.readUInt32LE(at + 8) : buf.readUInt16LE(at + 6);
    const headerLength = longForm ? 12 : 8;
    tags.push(
      (group.toString(16).padStart(4, "0") + element.toString(16).padStart(4, "0")).toUpperCase(),
    );
    at += headerLength + valueLength;
  }
  return tags;
}

/** Round-trip a fixture through `deidentify()` and back out to bytes. */
function deidentifyToBytes(
  buf: Buffer,
  retain?: readonly DeidentifyOption[],
): {
  readonly report: ReturnType<typeof deidentify>["report"];
  readonly dataset: ReturnType<typeof deidentify>["dataset"];
  readonly bytes: Buffer;
} {
  const { dataset, report } = deidentify(
    parseDicom(buf),
    retain === undefined ? {} : { retain: [...retain] },
  );
  return { dataset, report, bytes: serializeDicom(dataset) };
}

describe("AC1: the Source Application Entity Title does not survive de-identification", () => {
  it("is absent from the returned view and from the serialized bytes", () => {
    const source = buildIdentityBearingFile();
    // Control: the fixture really does carry it, so the assertions below are not
    // vacuous. A PHI test whose payload is not present is green against the
    // defect it exists to catch.
    expect(parseDicom(source).fileMeta?.sourceApplicationEntityTitle).toBe(SOURCE.aeTitle);
    expect(source.includes(Buffer.from(SOURCE.aeTitle, "latin1"))).toBe(true);

    const { dataset, bytes } = deidentifyToBytes(source);

    expect(dataset.fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
    expect(fileMetaTagsOnTheWire(bytes)).not.toContain("00020016");
    expect(bytes.includes(Buffer.from(SOURCE.aeTitle, "latin1"))).toBe(false);
    // And it does not come back through the parser either.
    expect(parseDicom(bytes).fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
  });

  it("is omitted rather than blanked, so the output asserts nothing about the sender", () => {
    const { dataset } = deidentifyToBytes(buildIdentityBearingFile());
    expect("sourceApplicationEntityTitle" in (dataset.fileMeta ?? {})).toBe(false);
  });
});

describe("AC2: the implementation identity names this de-identifying application", () => {
  it("replaces both implementation elements with @cosyte/dicom's own", () => {
    const source = buildIdentityBearingFile();
    const parsed = parseDicom(source);
    expect(parsed.fileMeta?.implementationClassUID).toBe(SOURCE.implClassUid);
    expect(parsed.fileMeta?.implementationVersionName).toBe(SOURCE.implVersion);

    const { dataset, bytes } = deidentifyToBytes(source);

    expect(dataset.fileMeta?.implementationClassUID).toBe(COSYTE_IMPLEMENTATION_CLASS_UID);
    expect(dataset.fileMeta?.implementationVersionName).toBe(COSYTE_IMPLEMENTATION_VERSION_NAME);
    const reparsed = parseDicom(bytes);
    expect(reparsed.fileMeta?.implementationClassUID).toBe(COSYTE_IMPLEMENTATION_CLASS_UID);
    expect(reparsed.fileMeta?.implementationVersionName).toBe(COSYTE_IMPLEMENTATION_VERSION_NAME);
  });

  it("holds none of the values the source carried", () => {
    const { bytes } = deidentifyToBytes(buildIdentityBearingFile());
    expect(bytes.includes(Buffer.from(SOURCE.implClassUid, "latin1"))).toBe(false);
    expect(bytes.includes(Buffer.from(SOURCE.implVersion, "latin1"))).toBe(false);
  });

  it("writes both elements even when the source carried neither", () => {
    const bare = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: SOP_CLASS_CT,
      elements: [{ tag: "00100010", vr: "PN", value: pad("DOE^JANE") }],
    });
    expect(parseDicom(bare).fileMeta?.implementationVersionName).toBeUndefined();

    const { dataset } = deidentifyToBytes(bare);
    expect(dataset.fileMeta?.implementationClassUID).toBe(COSYTE_IMPLEMENTATION_CLASS_UID);
    expect(dataset.fileMeta?.implementationVersionName).toBe(COSYTE_IMPLEMENTATION_VERSION_NAME);
  });
});

describe("AC3: the Implementation Version Name this library writes is legal for SH", () => {
  it("is a single value of at most 16 characters", () => {
    expect(COSYTE_IMPLEMENTATION_VERSION_NAME.length).toBeLessThanOrEqual(SH_VALUE_MAX_CHARS);
    // A single Value: `\` is the VALUE delimiter, so one here would make this
    // VM 2 on an element PS3.10 defines as VM 1.
    expect(COSYTE_IMPLEMENTATION_VERSION_NAME).not.toContain("\\");
    expect(COSYTE_IMPLEMENTATION_VERSION_NAME.length).toBeGreaterThan(0);
  });

  it("holds on every file, because it is a constant rather than a composition", () => {
    // The bound cannot depend on the input, so the check is that the emitted
    // bytes are the same length whatever the source carried - including a source
    // whose own version name was over the maximum.
    const overlong = buildIdentityBearingFile({
      implementationVersionName: "ACME_CT_4.1.7-RELEASE-CANDIDATE",
    });
    for (const source of [buildIdentityBearingFile(), overlong]) {
      const { dataset } = deidentifyToBytes(source);
      const written = dataset.fileMeta?.implementationVersionName ?? "";
      expect(written).toBe(COSYTE_IMPLEMENTATION_VERSION_NAME);
      expect(written.length).toBeLessThanOrEqual(SH_VALUE_MAX_CHARS);
    }
  });
});

describe("AC4: non-modeled File Meta elements are not re-emitted", () => {
  it("the serialized group carries only the group length, the object elements and the two implementation elements", () => {
    const source = buildIdentityBearingFile();
    // Control: all four exotic elements are on the wire in the source.
    expect(fileMetaTagsOnTheWire(source)).toEqual(
      expect.arrayContaining(["00020017", "00020018", "00020100", "00020102"]),
    );

    const { bytes } = deidentifyToBytes(source);

    expect(fileMetaTagsOnTheWire(bytes).sort()).toEqual([
      "00020000", // group length, recomputed on write
      "00020001", // File Meta Information Version - object
      "00020002", // Media Storage SOP Class UID - object
      "00020003", // Media Storage SOP Instance UID - object
      "00020010", // Transfer Syntax UID - object
      "00020012", // Implementation Class UID - this application
      "00020013", // Implementation Version Name - this application
    ]);
  });

  it("drops values as well as tags", () => {
    const { bytes } = deidentifyToBytes(buildIdentityBearingFile());
    for (const leak of [
      SOURCE.sendingAe,
      SOURCE.receivingAe,
      SOURCE.privateCreator,
      SOURCE.privateInfo,
    ]) {
      expect(bytes.includes(Buffer.from(leak, "latin1"))).toBe(false);
    }
    expect(parseDicom(bytes).fileMeta?.extraElements).toBeUndefined();
  });

  it("drops an element this library has never heard of, whatever its VR", () => {
    const source = buildIdentityBearingFile({
      fileMetaExtraElements: [
        { tag: "00021234", vr: "LO", value: pad("VENDOR-INVENTED") },
        { tag: "0002FFF0", vr: "UN", value: pad("SITE=ACMEGEN") },
      ],
    });
    const { bytes, report } = deidentifyToBytes(source);
    expect(fileMetaTagsOnTheWire(bytes)).not.toContain("00021234");
    expect(fileMetaTagsOnTheWire(bytes)).not.toContain("0002FFF0");
    expect(report.fileMetaElementsDroppedCount).toBe(2);
  });
});

describe("AC8: a source with no File Meta group is given none", () => {
  /**
   * A Dataset carrying no File Meta at all.
   *
   * It is built rather than parsed, and that is the only route there is:
   * `parseDicom` either projects a File Meta group or throws
   * `INVALID_FILE_META`/`NOT_DICOM_PART_10`, so `Dataset.fileMeta === undefined`
   * is reachable exactly through the public `Dataset` constructor - which
   * `deidentify()` accepts, and which is how a caller assembling a Data Set in
   * memory reaches this function.
   */
  function bareDataset(): Dataset {
    const elements = new Map<Tag, Element>();
    const add = (tag: Tag, vr: VR, value: Buffer): void => {
      elements.set(
        tag,
        new Element({
          tag,
          vr,
          vm: 1,
          length: value.length,
          rawBytes: value,
          byteOffset: 0,
          littleEndian: true,
        }),
      );
    };
    add("00100010", "PN", pad("DOE^JANE"));
    add("00041130", "CS", pad("ACMEGEN_FILESET"));
    return new Dataset({ warnings: [], elements });
  }

  it("returns a dataset with no File Meta and fabricates nothing", () => {
    const parsed = bareDataset();
    expect(parsed.fileMeta).toBeUndefined();

    const { dataset, report } = deidentify(parsed);

    expect(dataset.fileMeta).toBeUndefined();
    expect(report.fileMetaElementsDropped).toEqual([]);
    expect(report.fileMetaElementsDroppedCount).toBe(0);
    // An object that declares no Media Storage SOP Class UID is not a DICOMDIR,
    // so the group-0004 removal applies to it.
    expect(dataset.has("00041130")).toBe(false);
    expect(report.group0004RemovalCount).toBe(1);
    expect(
      report.warnings.some(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED,
      ),
    ).toBe(false);
  });
});

describe("AC9: the replacement is unconditional on how well the source parsed", () => {
  it("clears identity from a group whose (0002,0000) length is absent", () => {
    const source = buildIdentityBearingFile({ fileMetaGroupLength: "omit" });
    const parsed = parseDicom(source);
    expect(
      parsed.warnings.some((w) => w.code === WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISSING),
    ).toBe(true);

    const { dataset, bytes } = deidentifyToBytes(source);
    expect(dataset.fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
    expect(dataset.fileMeta?.implementationClassUID).toBe(COSYTE_IMPLEMENTATION_CLASS_UID);
    expect(bytes.includes(Buffer.from(SOURCE.aeTitle, "latin1"))).toBe(false);
    expect(bytes.includes(Buffer.from(SOURCE.sendingAe, "latin1"))).toBe(false);
  });

  it("clears identity from a group whose (0002,0000) length is wrong", () => {
    const source = buildIdentityBearingFile({ fileMetaGroupLength: "wrong" });
    const parsed = parseDicom(source);
    expect(
      parsed.warnings.some((w) => w.code === WARNING_CODES.DICOM_FILE_META_GROUP_LENGTH_MISMATCH),
    ).toBe(true);

    const { dataset, bytes } = deidentifyToBytes(source);
    expect(dataset.fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
    expect(bytes.includes(Buffer.from(SOURCE.aeTitle, "latin1"))).toBe(false);
    expect(bytes.includes(Buffer.from(SOURCE.privateInfo, "latin1"))).toBe(false);
  });

  it("clears identity from a group carrying a duplicate File Meta element", () => {
    // A second (0002,0016). The parser keeps the FIRST copy and drops the second
    // from the object entirely, which is the shape DICOM_DUPLICATE_FILE_META_ELEMENT
    // exists for. Neither copy may reach the output.
    const source = buildIdentityBearingFile({
      fileMetaExtraElements: [
        { tag: "00020016", vr: "AE", value: pad("ACMEGEN_DUP2") },
        ...SOURCE_EXTRAS,
      ],
    });
    const parsed = parseDicom(source);
    expect(
      parsed.warnings.some((w) => w.code === WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT),
    ).toBe(true);

    const { dataset, bytes } = deidentifyToBytes(source);
    expect(dataset.fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
    expect(bytes.includes(Buffer.from(SOURCE.aeTitle, "latin1"))).toBe(false);
    expect(bytes.includes(Buffer.from("ACMEGEN_DUP2", "latin1"))).toBe(false);
  });
});

describe("AC10: no Annex E Option retains a File Meta identity element", () => {
  const NAMED: readonly DeidentifyOption[] = [
    "RetainUIDs",
    "RetainSafePrivate",
    "RetainDeviceIdentity",
  ];

  it.each([
    ["no options", [] as readonly DeidentifyOption[]],
    ["the three the spec names", NAMED],
    ["every option this library implements", DEIDENTIFY_OPTIONS],
  ])("%s", (_label, retain) => {
    const source = buildIdentityBearingFile({
      elements: [
        { tag: "00100010", vr: "PN", value: pad("DOE^JANE") },
        { tag: "00041130", vr: "CS", value: pad("ACMEGEN_FILESET") },
      ],
    });
    const { dataset, bytes, report } = deidentifyToBytes(source, retain);

    // AC1
    expect(dataset.fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
    // AC2
    expect(dataset.fileMeta?.implementationClassUID).toBe(COSYTE_IMPLEMENTATION_CLASS_UID);
    expect(dataset.fileMeta?.implementationVersionName).toBe(COSYTE_IMPLEMENTATION_VERSION_NAME);
    // AC4
    expect(dataset.fileMeta?.extraElements).toBeUndefined();
    expect(fileMetaTagsOnTheWire(bytes)).not.toContain("00020017");
    expect(fileMetaTagsOnTheWire(bytes)).not.toContain("00020102");
    // AC5
    expect(dataset.has("00041130")).toBe(false);
    expect(report.group0004RemovalCount).toBe(1);
    // and no value survives anywhere in the file
    for (const leak of [
      SOURCE.aeTitle,
      SOURCE.sendingAe,
      SOURCE.receivingAe,
      SOURCE.privateCreator,
      SOURCE.privateInfo,
      SOURCE.implClassUid,
      SOURCE.implVersion,
    ]) {
      expect(bytes.includes(Buffer.from(leak, "latin1"))).toBe(false);
    }
  });

  it("sweeps every single-option run", () => {
    for (const opt of DEIDENTIFY_OPTIONS) {
      const { dataset, bytes } = deidentifyToBytes(buildIdentityBearingFile(), [opt]);
      expect(dataset.fileMeta?.sourceApplicationEntityTitle, opt).toBeUndefined();
      expect(dataset.fileMeta?.extraElements, opt).toBeUndefined();
      expect(bytes.includes(Buffer.from(SOURCE.aeTitle, "latin1")), opt).toBe(false);
    }
  });
});

describe("AC11: the object elements are preserved", () => {
  it("keeps the SOP Class UID, File Meta Information Version and Transfer Syntax UID", () => {
    const source = buildIdentityBearingFile();
    const parsed = parseDicom(source);
    const { dataset } = deidentifyToBytes(source);

    expect(dataset.fileMeta?.mediaStorageSOPClassUID).toBe(SOP_CLASS_CT);
    expect(dataset.fileMeta?.mediaStorageSOPClassUID).toBe(
      parsed.fileMeta?.mediaStorageSOPClassUID,
    );
    expect(dataset.fileMeta?.transferSyntaxUID).toBe(TS_EXPLICIT_LE);
    expect(dataset.fileMeta?.transferSyntaxUID).toBe(parsed.fileMeta?.transferSyntaxUID);
    expect(dataset.fileMeta?.fileMetaInformationVersion).toEqual(
      parsed.fileMeta?.fileMetaInformationVersion,
    );
    expect(dataset.fileMeta?.fileMetaInformationVersion).toEqual(Buffer.from([0x00, 0x01]));
  });

  it("remaps the Media Storage SOP Instance UID with RetainUIDs off", () => {
    const { dataset, report } = deidentifyToBytes(buildIdentityBearingFile());
    const remapped = dataset.fileMeta?.mediaStorageSOPInstanceUID;
    expect(remapped).toBeDefined();
    expect(remapped).not.toBe(SOURCE.sopInstance);
    expect(report.uidMap.get(SOURCE.sopInstance)).toBe(remapped);
  });

  it("keeps the source Media Storage SOP Instance UID with RetainUIDs on", () => {
    const { dataset } = deidentifyToBytes(buildIdentityBearingFile(), ["RetainUIDs"]);
    expect(dataset.fileMeta?.mediaStorageSOPInstanceUID).toBe(SOURCE.sopInstance);
  });

  it("re-parses under the same Transfer Syntax and SOP Class as the source", () => {
    const source = buildIdentityBearingFile();
    const { bytes } = deidentifyToBytes(source);
    const before = parseDicom(source);
    const after = parseDicom(bytes);
    expect(after.fileMeta?.transferSyntaxUID).toBe(before.fileMeta?.transferSyntaxUID);
    expect(after.fileMeta?.mediaStorageSOPClassUID).toBe(before.fileMeta?.mediaStorageSOPClassUID);
    // The Data Set is still readable under that syntax.
    expect(after.get("00100010")).toBeDefined();
  });
});

describe("AC12/AC14 (File Meta half): the drop is recorded and the record is bounded", () => {
  it("names each dropped element and counts them", () => {
    const { report } = deidentifyToBytes(buildIdentityBearingFile());
    expect(report.fileMetaElementsDroppedCount).toBe(SOURCE_EXTRAS.length);
    expect(report.fileMetaElementsDropped.map((d) => d.tag)).toEqual([
      "00020017",
      "00020018",
      "00020100",
      "00020102",
    ]);
    expect(report.fileMetaElementsDropped[0]).toEqual({
      tag: "00020017",
      vr: "AE",
      byteLength: pad(SOURCE.sendingAe).length,
    });
    expect(
      report.warnings.some((w) => w.code === WARNING_CODES.DICOM_DEIDENT_FILE_META_REPLACED),
    ).toBe(true);
  });

  it("records nothing when the source group held only modeled elements", () => {
    const source = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: SOP_CLASS_CT,
      sourceApplicationEntityTitle: SOURCE.aeTitle,
      elements: [{ tag: "00100010", vr: "PN", value: pad("DOE^JANE") }],
    });
    const { report, dataset } = deidentifyToBytes(source);
    expect(report.fileMetaElementsDropped).toEqual([]);
    expect(report.fileMetaElementsDroppedCount).toBe(0);
    expect(
      report.warnings.some((w) => w.code === WARNING_CODES.DICOM_DEIDENT_FILE_META_REPLACED),
    ).toBe(false);
    // The AE Title still goes: it is modeled, so it is AC1's business and not
    // this record's.
    expect(dataset.fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
  });

  it("drops every element past the cap while the finding array stops at it", () => {
    const many = MAX_FILE_META_DROP_FINDINGS * 4;
    const extras: BuildDicomElement[] = [];
    for (let i = 0; i < many; i++) {
      // (0002,1000) upward: non-modeled, and every one a distinct tag so none
      // collides with another.
      const element = 0x1000 + i;
      extras.push({
        tag: `0002${element.toString(16).padStart(4, "0").toUpperCase()}`,
        vr: "LO",
        value: pad("SITE=ACMEGEN"),
      });
    }
    const source = buildIdentityBearingFile({ fileMetaExtraElements: extras });
    expect(parseDicom(source).fileMeta?.extraElements).toHaveLength(many);

    const { report, bytes } = deidentifyToBytes(source);

    // The record is bounded ...
    expect(report.fileMetaElementsDropped).toHaveLength(MAX_FILE_META_DROP_FINDINGS);
    // ... the count is not ...
    expect(report.fileMetaElementsDroppedCount).toBe(many);
    // ... and the ACTION reached every one of them.
    expect(fileMetaTagsOnTheWire(bytes).sort()).toEqual([
      "00020000",
      "00020001",
      "00020002",
      "00020003",
      "00020010",
      "00020012",
      "00020013",
    ]);
    expect(bytes.includes(Buffer.from("SITE=ACMEGEN", "latin1"))).toBe(false);
    // One warning, not one per element: the string is not multiplied by a count
    // the input chose.
    expect(
      report.warnings.filter((w) => w.code === WARNING_CODES.DICOM_DEIDENT_FILE_META_REPLACED),
    ).toHaveLength(1);
  });
});

describe("AC13 (File Meta half): the message text is registry-resolved and value-free", () => {
  it("carries no tag, no value and no count", () => {
    const { report } = deidentifyToBytes(buildIdentityBearingFile());
    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_FILE_META_REPLACED,
    );
    expect(warning).toBeDefined();
    const message = warning?.message ?? "";
    for (const leak of [
      SOURCE.aeTitle,
      SOURCE.sendingAe,
      SOURCE.receivingAe,
      SOURCE.privateCreator,
      SOURCE.privateInfo,
      SOURCE.implClassUid,
      SOURCE.implVersion,
      SOURCE.sopInstance,
      "00020017",
      "0002,0017",
    ]) {
      expect(message).not.toContain(leak);
    }
    // No unsubstituted template token survived either.
    expect(message).not.toMatch(/\{(tag|vr|vr2|n|n2)\}/);
    // Identical text on a file carrying entirely different values: the message
    // is a constant of the code, not a rendering of the input.
    const other = deidentifyToBytes(
      buildIdentityBearingFile({
        fileMetaExtraElements: [{ tag: "00020102", vr: "OB", value: pad("WARD=3A;SITE=OTHER") }],
      }),
    );
    const otherMessage =
      other.report.warnings.find((w) => w.code === WARNING_CODES.DICOM_DEIDENT_FILE_META_REPLACED)
        ?.message ?? "";
    expect(otherMessage).toBe(message);
  });
});

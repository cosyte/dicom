/**
 * Phase 7 metadata de-identification tests (PS3.15 Annex E).
 *
 * Everything is **synthetic** — fixtures are built in memory by `build-dicom`
 * (the repo ships zero curated `.dcm` files). The recognizable-but-fake PHI
 * strings below (`"DOE^JANE"`, `"SECRET-MRN-123"`, …) exist only to prove they
 * are gone from the de-identified output; no real patient data is used.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  Dataset,
  DeidentifyError,
  Element,
  WARNING_CODES,
  defineProfile,
  deidentify,
  makeUidRemapper,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";
import {
  resolveAction,
  dummyBytes,
  remapUidBytes,
  uidValueMultiplicity,
} from "../../src/deident/actions.js";
import { buildDicom, type BuildDicomOptions } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** Even-pad a text value (space) so the fixture builder gets a legal length. */
function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

const PHI = {
  patientName: "DOE^JANE",
  patientId: "SECRET-MRN-123",
  birthDate: "19800101",
  accession: "ACC0099",
  referring: "SMITH^REF^DOC",
  institution: "ACME GENERAL HOSPITAL",
  studyDesc: "CHEST CT W CONTRAST",
} as const;

const UID = {
  sop: "1.2.840.113619.2.55.3.1",
  study: "1.2.840.113619.2.55.3.2",
  series: "1.2.840.113619.2.55.3.3",
} as const;

/** A standard PHI-laden dataset across several VRs + UIDs. */
function buildPhiDataset(extra: BuildDicomOptions["elements"] = []): ReturnType<typeof parseDicom> {
  const buf = buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    mediaStorageSOPInstanceUID: UID.sop,
    elements: [
      { tag: "00080018", vr: "UI", value: pad(UID.sop) },
      { tag: "00080020", vr: "DA", value: pad(PHI.birthDate) },
      { tag: "00080050", vr: "SH", value: pad(PHI.accession) },
      { tag: "00080080", vr: "LO", value: pad(PHI.institution) },
      { tag: "00080090", vr: "PN", value: pad(PHI.referring) },
      { tag: "00081030", vr: "LO", value: pad(PHI.studyDesc) },
      { tag: "00100010", vr: "PN", value: pad(PHI.patientName) },
      { tag: "00100020", vr: "LO", value: pad(PHI.patientId) },
      { tag: "00100030", vr: "DA", value: pad(PHI.birthDate) },
      { tag: "00100040", vr: "CS", value: pad("F") },
      { tag: "00101010", vr: "AS", value: pad("045Y") },
      { tag: "0020000D", vr: "UI", value: pad(UID.study) },
      { tag: "0020000E", vr: "UI", value: pad(UID.series) },
      ...extra,
    ],
  });
  return parseDicom(buf);
}

describe("resolveAction (conditional collapse)", () => {
  it("takes the leftmost branch of every conditional code", () => {
    expect(resolveAction("Z/D")).toBe("Z");
    expect(resolveAction("X/Z")).toBe("X");
    expect(resolveAction("X/D")).toBe("X");
    expect(resolveAction("X/Z/D")).toBe("X");
    expect(resolveAction("X/Z/U*")).toBe("X");
    expect(resolveAction("C/X")).toBe("C");
  });

  it("passes single codes through unchanged", () => {
    for (const c of ["D", "Z", "X", "K", "C", "U"] as const) expect(resolveAction(c)).toBe(c);
  });
});

describe("dummyBytes", () => {
  it("returns an even-length VR-consistent dummy for text VRs", () => {
    expect(dummyBytes("DA")?.toString("latin1")).toBe("10000101");
    expect(dummyBytes("PN")?.toString("latin1")).toBe("Anonymized");
    const sh = dummyBytes("SH");
    expect(sh).not.toBeNull();
    expect((sh?.length ?? 1) % 2).toBe(0);
  });

  it("returns null for binary/UID/SQ VRs (caller empties instead)", () => {
    expect(dummyBytes("US")).toBeNull();
    expect(dummyBytes("UI")).toBeNull();
    expect(dummyBytes("SQ")).toBeNull();
  });

  it("pads an odd-length dummy to even length", () => {
    // DS / IS dummy is the single char "0" → padded to two bytes.
    const ds = dummyBytes("DS");
    expect(ds?.length).toBe(2);
    expect(ds?.[0]).toBe(0x30); // "0"
    expect(ds?.[1]).toBe(0x20); // space pad
  });
});

describe("remapUidBytes", () => {
  it("remaps each backslash-separated UID and null-pads to even length", () => {
    const out = remapUidBytes(Buffer.from("1.2\\3.4"), (uid) => `9.${uid}`);
    const text = out.toString("latin1").replace(/\0+$/, "");
    expect(text).toBe("9.1.2\\9.3.4");
    expect(out.length % 2).toBe(0);
  });

  it("strips trailing NULs from the source before remapping", () => {
    const out = remapUidBytes(Buffer.from("1.2.3\0"), (uid) => uid);
    expect(out.toString("latin1").replace(/\0+$/, "")).toBe("1.2.3");
  });
});

describe("uidValueMultiplicity", () => {
  it("counts backslash-separated UIDs and handles empty", () => {
    expect(uidValueMultiplicity(Buffer.from("1.2\\3.4"))).toBe(2);
    expect(uidValueMultiplicity(Buffer.from("1.2"))).toBe(1);
    expect(uidValueMultiplicity(Buffer.alloc(0))).toBe(0);
  });
});

describe("makeUidRemapper", () => {
  it("is deterministic and caches", () => {
    const r = makeUidRemapper();
    const a = r.map(UID.sop);
    expect(r.map(UID.sop)).toBe(a);
    expect(a.startsWith("2.25.")).toBe(true);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(r.cache.get(UID.sop)).toBe(a);
  });

  it("produces the same replacement across independent remappers (no shared state)", () => {
    expect(makeUidRemapper().map(UID.sop)).toBe(makeUidRemapper().map(UID.sop));
  });

  it("rejects a malformed root", () => {
    expect(() => makeUidRemapper("2.25.")).toThrow(DeidentifyError);
    expect(() => makeUidRemapper("not a uid")).toThrow(/dotted-decimal/);
  });

  it("rejects a root too long to leave room for a value component", () => {
    expect(() => makeUidRemapper("1".repeat(63))).toThrow(/64-character limit/);
  });
});

describe("deidentify — Basic Profile actions", () => {
  it("empties Z attributes and removes X attributes", () => {
    const { dataset } = deidentify(buildPhiDataset());
    expect(dataset.get("00100010")?.rawBytes.length).toBe(0); // PatientName Z
    expect(dataset.get("00100020")?.rawBytes.length).toBe(0); // PatientID Z/D → Z
    expect(dataset.get("00080050")?.rawBytes.length).toBe(0); // Accession Z
    expect(dataset.has("00080080")).toBe(false); // InstitutionName X/Z/D → X
    expect(dataset.has("00081030")).toBe(false); // StudyDescription X
    expect(dataset.has("00101010")).toBe(false); // PatientAge X
  });

  it("remaps every U-coded UID to a consistent 2.25 UID", () => {
    const { dataset, report } = deidentify(buildPhiDataset());
    const sop = dataset.get("00080018")?.rawBytes.toString("latin1").replace(/\0+$/, "");
    expect(sop).toBeDefined();
    expect(sop).not.toBe(UID.sop);
    expect(sop?.startsWith("2.25.")).toBe(true);
    expect(report.uidMap.get(UID.sop)).toBe(sop);
    expect(report.uidMap.get(UID.study)).toBeDefined();
    expect(report.uidMap.get(UID.series)).toBeDefined();
  });

  it("writes the required de-identification metadata", () => {
    const { dataset } = deidentify(buildPhiDataset());
    expect(dataset.get("00120062")?.rawBytes.toString("latin1").trim()).toBe("YES");
    expect(dataset.get("00120063")?.rawBytes.length ?? 0).toBeGreaterThan(0);
  });

  it("honours a caller-supplied de-identification method string", () => {
    const { dataset } = deidentify(buildPhiDataset(), { deidentificationMethod: "MyTool v1" });
    expect(dataset.get("00120063")?.rawBytes.toString("latin1").trim()).toBe("MyTool v1");
  });

  it("records a value-free audit entry per acted-on attribute", () => {
    const { report } = deidentify(buildPhiDataset());
    const name = report.attributes.find((a) => a.tag === "00100010");
    expect(name).toEqual({
      tag: "00100010",
      keyword: "Patient's Name",
      action: "Z",
      applied: "emptied",
    });
    const inst = report.attributes.find((a) => a.tag === "00080080");
    expect(inst?.action).toBe("X");
    expect(inst?.applied).toBe("removed");
    const serialized = JSON.stringify(report.attributes);
    for (const v of Object.values(PHI)) expect(serialized).not.toContain(v);
  });
});

describe("deidentify — UID referential integrity", () => {
  it("maps the same source UID to the same replacement across files", () => {
    const a = deidentify(buildPhiDataset()).dataset.get("00080018")?.rawBytes.toString("latin1");
    const b = deidentify(buildPhiDataset()).dataset.get("00080018")?.rawBytes.toString("latin1");
    expect(a).toBe(b);
  });

  it("remaps the File Meta SOP Instance UID consistently with the dataset", () => {
    const { dataset } = deidentify(buildPhiDataset());
    const fmUid = dataset.fileMeta?.mediaStorageSOPInstanceUID;
    const dsUid = dataset.get("00080018")?.rawBytes.toString("latin1").replace(/\0+$/, "");
    expect(fmUid).toBe(dsUid);
  });
});

describe("deidentify — Retain / Clean options", () => {
  it("RetainUIDs keeps UIDs verbatim", () => {
    const { dataset } = deidentify(buildPhiDataset(), { retain: ["RetainUIDs"] });
    expect(
      dataset
        .get("00080018")
        ?.rawBytes.toString("latin1")
        .replace(/[\0 ]+$/, ""),
    ).toBe(UID.sop);
    expect(dataset.fileMeta?.mediaStorageSOPInstanceUID).toBe(UID.sop);
  });

  it("RetainLongitudinalTemporal keeps dates", () => {
    const { dataset } = deidentify(buildPhiDataset(), { retain: ["RetainLongitudinalTemporal"] });
    expect(dataset.get("00080020")?.rawBytes.toString("latin1").trim()).toBe(PHI.birthDate);
  });

  it("RetainPatientCharacteristics keeps sex and age", () => {
    const { dataset } = deidentify(buildPhiDataset(), { retain: ["RetainPatientCharacteristics"] });
    expect(dataset.get("00100040")?.rawBytes.toString("latin1").trim()).toBe("F");
    expect(dataset.has("00101010")).toBe(true);
  });

  it("RetainInstitutionIdentity keeps the institution name", () => {
    const { dataset } = deidentify(buildPhiDataset(), { retain: ["RetainInstitutionIdentity"] });
    expect(dataset.get("00080080")?.rawBytes.toString("latin1").trim()).toBe(PHI.institution);
  });

  it("CleanDescriptors cleans Study Description (C) rather than removing it", () => {
    const { dataset, report } = deidentify(buildPhiDataset(), { retain: ["CleanDescriptors"] });
    expect(dataset.has("00081030")).toBe(true);
    expect(dataset.get("00081030")?.rawBytes.length).toBe(0);
    expect(report.attributes.find((a) => a.tag === "00081030")?.applied).toBe("cleaned");
  });

  it("rejects an unknown retain option", () => {
    // @ts-expect-error — not a valid option
    expect(() => deidentify(buildPhiDataset(), { retain: ["RetainEverything"] })).toThrow(
      DeidentifyError,
    );
  });

  it("reports the active options it retained", () => {
    const { report } = deidentify(buildPhiDataset(), { retain: ["RetainUIDs"] });
    expect(report.retained).toEqual(["RetainUIDs"]);
  });
});

describe("deidentify — private attributes", () => {
  const withPrivate: BuildDicomOptions["elements"] = [
    { tag: "00090010", vr: "LO", value: pad("ACME PRIVATE 01") },
    { tag: "00091001", vr: "LO", value: pad("VENDOR-SECRET") },
  ];

  it("removes all private attributes by default", () => {
    const { dataset, report } = deidentify(buildPhiDataset(withPrivate));
    expect(dataset.has("00091001")).toBe(false);
    expect(dataset.has("00090010")).toBe(false);
    expect(report.removedPrivateTags).toContain("00091001");
  });

  it("RetainSafePrivate keeps creator-recognized private attributes", () => {
    const profile = defineProfile({
      name: "acme",
      privateTags: {
        "ACME PRIVATE 01": { "0009XX01": { vr: "LO", keyword: "AcmeThing", name: "Acme Thing" } },
      },
    });
    const ds = buildPhiDataset(withPrivate);
    const { dataset } = deidentify(ds, { retain: ["RetainSafePrivate"], profile });
    expect(dataset.has("00091001")).toBe(true);
    expect(dataset.has("00090010")).toBe(true); // recognized creator kept too
  });

  it("RetainSafePrivate without a profile keeps nothing (fail-safe)", () => {
    const { dataset } = deidentify(buildPhiDataset(withPrivate), { retain: ["RetainSafePrivate"] });
    expect(dataset.has("00091001")).toBe(false);
  });
});

describe("deidentify — nested sequences", () => {
  const nameInItem = { tag: "00100010" as Tag, vr: "PN" as const, value: pad("NESTED^PATIENT") };
  // (0008,1115) Referenced Series Sequence is not in Annex E → kept + recursed.
  const seq = { tag: "00081115" as Tag, items: [{ elements: [nameInItem] }] };

  it("de-identifies attributes nested inside a kept sequence", () => {
    const buf = buildDicom({ transferSyntax: TS_EXPLICIT_LE, elements: [seq] });
    const { dataset, report } = deidentify(parseDicom(buf));
    const item = dataset.get("00081115")?.items?.[0];
    expect(item?.get("00100010")?.rawBytes.length).toBe(0);
    const nested = report.attributes.find((a) => a.tag === "00100010");
    expect(nested?.contextPath).toEqual(["00081115[0]"]);
  });

  it("removes nested PHI from the serialized bytes (re-encoded sequence)", () => {
    const buf = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPInstanceUID: UID.sop,
      elements: [seq],
    });
    const { dataset } = deidentify(parseDicom(buf));
    const out = serializeDicom(dataset);
    expect(out.includes(Buffer.from("NESTED^PATIENT", "latin1"))).toBe(false);
    // Round-trips: re-parse and confirm the nested name is empty.
    const reparsed = parseDicom(out);
    expect(reparsed.get("00081115")?.items?.[0]?.get("00100010")?.rawBytes.length).toBe(0);
  });
});

describe("deidentify — sequence actions", () => {
  const phiItem = {
    elements: [{ tag: "00100010" as Tag, vr: "PN" as const, value: pad("NESTED^PATIENT") }],
  };
  function seqDataset(tag: Tag, ts = TS_EXPLICIT_LE): ReturnType<typeof parseDicom> {
    return parseDicom(buildDicom({ transferSyntax: ts, elements: [{ tag, items: [phiItem] }] }));
  }

  it("removes an X-coded sequence outright", () => {
    // (0008,1120) Referenced Patient Sequence — basic profile X.
    const { dataset, report } = deidentify(seqDataset("00081120"));
    expect(dataset.has("00081120")).toBe(false);
    const audit = report.attributes.find((a) => a.tag === "00081120");
    expect(audit).toMatchObject({ action: "X", applied: "removed" });
  });

  it("empties a Z-coded sequence (kept tag, zero items)", () => {
    // (0040,0513) Issuer of the Container Identifier Sequence — basic profile Z.
    const { dataset, report } = deidentify(seqDataset("00400513"));
    expect(dataset.has("00400513")).toBe(true);
    expect(dataset.get("00400513")?.items?.length).toBe(0);
    expect(report.attributes.find((a) => a.tag === "00400513")?.applied).toBe("emptied");
  });

  it("empties a D-coded sequence (no VR-consistent dummy for SQ)", () => {
    // (0040,A073) Verifying Observer Sequence — basic profile D.
    const { dataset, report } = deidentify(seqDataset("0040A073"));
    expect(dataset.get("0040A073")?.items?.length).toBe(0);
    const audit = report.attributes.find((a) => a.tag === "0040A073");
    expect(audit).toMatchObject({ action: "D", applied: "emptied" });
  });

  it("cleans a sequence (C) by recursing, not emptying it", () => {
    // (0040,0275) Request Attributes Sequence — CleanDescriptors overrides X→C.
    const { dataset, report } = deidentify(seqDataset("00400275"), {
      retain: ["CleanDescriptors"],
    });
    const item = dataset.get("00400275")?.items?.[0];
    expect(item).toBeDefined();
    expect(item?.get("00100010")?.rawBytes.length).toBe(0); // nested PHI de-identified
    expect(report.attributes.find((a) => a.tag === "00400275")?.applied).toBe("cleaned");
  });

  it("keeps a K-coded sequence but still de-identifies its contents", () => {
    // (0008,1120) basic profile X, RetainUIDs overrides to K → kept + recursed.
    const { dataset, report } = deidentify(seqDataset("00081120"), { retain: ["RetainUIDs"] });
    expect(dataset.has("00081120")).toBe(true);
    expect(dataset.get("00081120")?.items?.[0]?.get("00100010")?.rawBytes.length).toBe(0);
    expect(report.attributes.find((a) => a.tag === "00081120")?.applied).toBe("kept");
  });

  it("removes private attributes nested inside a kept sequence", () => {
    // (0008,1115) Referenced Series Sequence is not in Annex E → kept + recursed.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "00081115",
            items: [
              {
                elements: [
                  { tag: "00090010", vr: "LO", value: pad("ACME PRIVATE 01") },
                  { tag: "00091001", vr: "LO", value: pad("VENDOR-SECRET") },
                ],
              },
            ],
          },
        ],
      }),
    );
    const { dataset, report } = deidentify(ds);
    expect(dataset.get("00081115")?.items?.[0]?.has("00091001")).toBe(false);
    expect(report.removedPrivateTags).toContain("00091001");
  });
});

describe("deidentify — scalar D action", () => {
  it("dummies a D-coded text attribute with a VR-consistent value", () => {
    // (0012,0010) Clinical Trial Sponsor Name — LO, basic profile D.
    const { dataset, report } = deidentify(
      buildPhiDataset([{ tag: "00120010", vr: "LO", value: pad("ACME TRIALS INC") }]),
    );
    expect(dataset.get("00120010")?.rawBytes.toString("latin1").trim()).toBe("ANONYMIZED");
    expect(report.attributes.find((a) => a.tag === "00120010")?.applied).toBe("dummied");
  });

  it("empties a D-coded binary attribute when no safe dummy exists", () => {
    // (0034,0002) Flow Identifier — OB, basic profile D; dummyBytes(OB) is null.
    const { dataset, report } = deidentify(
      buildPhiDataset([
        { tag: "00340002", vr: "OB", value: Buffer.from([0x01, 0x02, 0x03, 0x04]) },
      ]),
    );
    expect(dataset.get("00340002")?.rawBytes.length).toBe(0);
    const audit = report.attributes.find((a) => a.tag === "00340002");
    expect(audit).toMatchObject({ action: "D", applied: "emptied" });
  });
});

describe("deidentify — transfer syntaxes", () => {
  const nestedName = { tag: "00100010" as Tag, vr: "PN" as const, value: pad("NESTED^PATIENT") };
  // (0008,1115) Referenced Series Sequence — not in Annex E → kept + recursed.

  it("re-encodes a kept sequence under Implicit VR LE", () => {
    // Implicit VR LE only descends *undefined-length* SQ, so encode it that way.
    const seq = {
      tag: "00081115" as Tag,
      undefinedLength: true,
      items: [{ undefinedLength: true, elements: [nestedName] }],
    };
    const buf = buildDicom({ transferSyntax: TS_IMPLICIT_LE, elements: [seq] });
    const { dataset } = deidentify(parseDicom(buf));
    // The rebuilt sequence holds the cleaned (empty) nested value in-model …
    expect(dataset.get("00081115")?.items?.[0]?.get("00100010")?.rawBytes.length).toBe(0);
    // … and the re-encoded Implicit-LE bytes carry no nested PHI.
    const out = serializeDicom(dataset);
    expect(out.includes(Buffer.from("NESTED^PATIENT", "latin1"))).toBe(false);
  });

  it("re-encodes a kept sequence under Explicit VR BE", () => {
    const seq = { tag: "00081115" as Tag, items: [{ elements: [nestedName] }] };
    const buf = buildDicom({ transferSyntax: TS_EXPLICIT_BE, elements: [seq] });
    const { dataset } = deidentify(parseDicom(buf));
    const out = serializeDicom(dataset);
    expect(out.includes(Buffer.from("NESTED^PATIENT", "latin1"))).toBe(false);
    const reparsed = parseDicom(out);
    expect(reparsed.get("00081115")?.items?.[0]?.get("00100010")?.rawBytes.length).toBe(0);
  });
});

describe("deidentify — burned-in annotation safety", () => {
  const pixel: BuildDicomOptions["elements"] = [
    { tag: "7FE00010", vr: "OW", value: Buffer.from([0x00, 0x01, 0x02, 0x03]) },
  ];

  it("warns when pixel data is present and burned-in status is unknown", () => {
    const { report } = deidentify(buildPhiDataset(pixel));
    expect(
      report.warnings.some((w) => w.code === WARNING_CODES.DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED),
    ).toBe(true);
  });

  it("does not warn when Burned In Annotation is affirmatively NO", () => {
    const { report } = deidentify(
      buildPhiDataset([...pixel, { tag: "00280301", vr: "CS", value: pad("NO") }]),
    );
    expect(report.warnings.length).toBe(0);
  });

  it("does not warn when no pixel data is present", () => {
    expect(deidentify(buildPhiDataset()).report.warnings.length).toBe(0);
  });
});

describe("deidentify — dataset without File Meta", () => {
  function elem(tag: Tag, vr: "PN", value: Buffer): Element {
    return new Element({
      tag,
      vr,
      vm: 1,
      length: value.length,
      rawBytes: value,
      byteOffset: 0,
      littleEndian: true,
    });
  }

  it("de-identifies and defaults the encoding when no File Meta is present", () => {
    const ds = new Dataset({
      warnings: [],
      elements: new Map<Tag, Element>([["00100010", elem("00100010", "PN", pad(PHI.patientName))]]),
    });
    const { dataset, report } = deidentify(ds);
    expect(dataset.fileMeta).toBeUndefined();
    expect(dataset.get("00100010")?.rawBytes.length).toBe(0); // PatientName Z
    expect(dataset.get("00120062")?.rawBytes.toString("latin1").trim()).toBe("YES");
    expect(report.attributes.find((a) => a.tag === "00100010")?.applied).toBe("emptied");
  });
});

describe("deidentify — PHI-free output", () => {
  it("leaves no recognizable PHI in the serialized buffer", () => {
    const { dataset } = deidentify(buildPhiDataset());
    const out = serializeDicom(dataset);
    for (const v of Object.values(PHI)) {
      expect(out.includes(Buffer.from(v, "latin1"))).toBe(false);
    }
    for (const u of Object.values(UID)) {
      expect(out.includes(Buffer.from(u, "latin1"))).toBe(false);
    }
  });

  it("does not mutate the input dataset", () => {
    const ds = buildPhiDataset();
    deidentify(ds);
    expect(ds.get("00100010")?.rawBytes.toString("latin1").trim()).toBe(PHI.patientName);
  });
});

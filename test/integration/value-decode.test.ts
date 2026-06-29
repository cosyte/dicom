/**
 * Phase 3 capstone — end-to-end value decode through the public surface.
 *
 * Exercises `Element.value` + the `Dataset.get/has/elements/getAll`
 * navigation API over full Part 10 fixtures built by `build-dicom.ts`,
 * including `(0008,0005)` Specific Character Set threading and big-endian
 * numeric decode (signedness from VR, endianness from transfer syntax).
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { parseDicom } from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

describe("Element.value — end-to-end decode", () => {
  it("decodes PN to its structured form via Dataset.get", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100010", vr: "PN", value: Buffer.from("Doe^Jane", "ascii") }],
      }),
    );
    const v = ds.get("00100010")?.value;
    expect(v?.kind).toBe("personName");
    if (v?.kind === "personName") expect(v.values[0]?.alphabetic.givenName).toBe("Jane");
  });

  it("decodes US (Rows) — endianness honored for Explicit BE", () => {
    // US=512 → caller passes native LE bytes; encoder swaps to BE for the BE TS.
    const value = Buffer.from([0x00, 0x02]);
    for (const ts of [TS_EXPLICIT_LE, TS_EXPLICIT_BE]) {
      const ds = parseDicom(
        buildDicom({ transferSyntax: ts, elements: [{ tag: "00280010", vr: "US", value }] }),
      );
      const v = ds.get("00280010")?.value;
      expect(v?.kind).toBe("numbers");
      if (v?.kind === "numbers") expect(v.values[0]).toBe(512);
    }
  });

  it("memoizes — repeated .value access returns the same object", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") }],
      }),
    );
    const el = ds.get("00080060");
    expect(el?.value).toBe(el?.value);
  });

  it("an unknown (0008,0005) term emits DICOM_UNSUPPORTED_CHARSET; text still decodes best-effort", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 9999", "ascii") },
          { tag: "00080080", vr: "LO", value: Buffer.from("Clinic", "utf-8") },
        ],
      }),
    );
    expect(ds.warnings.some((w) => w.code === "DICOM_UNSUPPORTED_CHARSET")).toBe(true);
    expect(ds.get("00080080")?.value).toMatchObject({ kind: "strings", values: ["Clinic"] });
  });

  it("threads (0008,0005) so a later LO decodes as UTF-8", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 192", "ascii") },
          { tag: "00080080", vr: "LO", value: Buffer.from("Müller-Klinik", "utf-8") },
        ],
      }),
    );
    const v = ds.get("00080080")?.value;
    expect(v).toMatchObject({ kind: "strings", values: ["Müller-Klinik"] });
  });

  it("navigation: has / getAll / elements over a parsed dataset", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") },
          { tag: "00100010", vr: "PN", value: Buffer.from("Doe^Jane", "ascii") },
        ],
      }),
    );
    expect(ds.has("00080060")).toBe(true);
    expect(ds.has("7FE00010")).toBe(false);
    expect(ds.getAll("00100010")).toHaveLength(1);
    expect(ds.getAll("7FE00010")).toEqual([]);
    expect(ds.elements().length).toBeGreaterThanOrEqual(2);
  });

  it("a root (0008,0005) charset is inherited by SQ items and restored after the sequence", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          { tag: "00080005", vr: "CS", value: Buffer.from("ISO_IR 192", "ascii") },
          {
            tag: "00081140",
            items: [
              {
                elements: [{ tag: "00080080", vr: "LO", value: Buffer.from("Müller", "utf-8") }],
              },
            ],
          },
          { tag: "00100020", vr: "LO", value: Buffer.from("Müller", "utf-8") },
        ],
      }),
    );
    const sq = ds.get("00081140")?.value;
    if (sq?.kind === "sequence") {
      expect(sq.items[0]?.get("00080080")?.value).toMatchObject({ values: ["Müller"] });
    }
    // A sibling AFTER the SQ still sees the parent charset (restored, not leaked away).
    expect(ds.get("00100020")?.value).toMatchObject({ kind: "strings", values: ["Müller"] });
  });

  it("navigates into a parsed SQ item via Element.value → Item.get", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [
          {
            tag: "00081140", // Referenced Image Sequence
            items: [
              {
                elements: [{ tag: "00080060", vr: "CS", value: Buffer.from("CT", "ascii") }],
              },
            ],
          },
        ],
      }),
    );
    const sq = ds.get("00081140")?.value;
    expect(sq?.kind).toBe("sequence");
    if (sq?.kind === "sequence") {
      const inner = sq.items[0]?.get("00080060")?.value;
      expect(inner).toMatchObject({ kind: "strings", values: ["CT"] });
    }
  });
});

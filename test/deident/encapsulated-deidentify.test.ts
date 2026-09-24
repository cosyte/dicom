/**
 * `deidentify()` on objects under every PS3.5 2026c section A.4 encapsulation Transfer Syntax,
 * graded against the Explicit-LE twin: the byte-identical Data Set under `1.2.840.10008.1.2.1`.
 *
 * The payload is name-bearing on purpose (`DOE^JANE`, `MRN-42`, both synthetic), and each run
 * asserts the name and the identifier are in the parsed input BEFORE the run, so a clean result
 * after it is a removal and not a fixture that never carried them. The two File Meta groups differ
 * in length, so every file-absolute byte offset differs by a constant between the two runs; the
 * comparisons exclude offsets and nothing else.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { deidentify, readPixelDataFragments, WARNING_CODES } from "../../src/index.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import type { DeidentifyReport } from "../../src/deident/types.js";
import { parseDicom } from "../../src/parser/index.js";
import {
  DEFAULT_FRAGMENT,
  PATIENT_ID,
  PATIENT_NAME,
  encapsulatedObject,
  explicitLeTwin,
} from "../fixtures/encapsulated/objects.js";
import { ENCAPSULATION_SET } from "../helpers/ps35-section-a4.js";

/** One element as the comparison sees it: tag, VR and value bytes, with its items at every depth. */
interface Shape {
  readonly tag: string;
  readonly vr: string;
  readonly bytes: string;
  readonly items?: readonly (readonly Shape[])[];
}

function shape(ds: Dataset): Shape[] {
  return ds.elements().map((el) => ({
    tag: el.tag,
    vr: el.vr,
    bytes: el.rawBytes.toString("hex"),
    ...(el.items !== undefined ? { items: el.items.map((item) => shape(item)) } : {}),
  }));
}

/** Every element value at every depth, for the "absent after the run" sweep. */
function allValues(ds: Dataset): Buffer[] {
  return ds
    .elements()
    .flatMap((el) => [el.rawBytes, ...(el.items ?? []).flatMap((item) => allValues(item))]);
}

/** The report with every `byteOffset` removed at any depth, and Maps as entry lists. */
function withoutOffsets(value: unknown): unknown {
  if (value instanceof Map) return [...value.entries()].map((e) => withoutOffsets(e));
  if (Array.isArray(value)) return value.map((v) => withoutOffsets(v));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "byteOffset")
        .map(([key, v]) => [key, withoutOffsets(v)]),
    );
  }
  return value;
}

function reportedBurnedIn(report: DeidentifyReport): boolean {
  return report.warnings.some(
    (w) => w.code === WARNING_CODES.DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED,
  );
}

const NAME = Buffer.from(PATIENT_NAME, "latin1");
const ID = Buffer.from(PATIENT_ID, "latin1");

describe("AC-13: deidentify() on every section A.4 syntax equals its Explicit-LE twin", () => {
  it("AC-13: the set under test is the whole of section A.4", () => {
    expect(ENCAPSULATION_SET).toHaveLength(35);
  });

  it.each(ENCAPSULATION_SET)("AC-13: %s", (uid) => {
    const source = parseDicom(encapsulatedObject({ transferSyntax: uid }));
    const twinSource = parseDicom(explicitLeTwin({ transferSyntax: uid }));

    // Mutation control: the planted name and identifier are there before the run.
    expect(source.get("00100010")?.rawBytes.equals(NAME)).toBe(true);
    expect(source.get("00100020")?.rawBytes.equals(ID)).toBe(true);

    const run = deidentify(source);
    const twin = deidentify(twinSource);

    // Data Set elements: tag, VR and value bytes at every depth.
    expect(shape(run.dataset)).toStrictEqual(shape(twin.dataset));
    // The report, field by field, byte offsets excluded.
    expect(withoutOffsets(run.report)).toStrictEqual(withoutOffsets(twin.report));

    // The planted name and identifier are gone from every element value.
    for (const value of allValues(run.dataset)) {
      expect(value.includes(NAME)).toBe(false);
      expect(value.includes(ID)).toBe(false);
    }

    // The fragments are the input's, byte for byte.
    const before = readPixelDataFragments(source);
    const after = readPixelDataFragments(run.dataset);
    expect(after?.basicOffsetTable?.equals(before?.basicOffsetTable ?? Buffer.alloc(1))).toBe(true);
    expect(after?.fragments.map((f) => f.toString("hex"))).toStrictEqual([
      DEFAULT_FRAGMENT.toString("hex"),
    ]);

    // (0028,0301) is absent here, so the burned-in disclosure is owed.
    expect(source.has("00280301")).toBe(false);
    expect(reportedBurnedIn(run.report)).toBe(true);
  });

  it.each(ENCAPSULATION_SET)(
    "AC-13: burned-in annotation is reported when (0028,0301) is not NO, under %s",
    (uid) => {
      const yes = deidentify(
        parseDicom(encapsulatedObject({ transferSyntax: uid, burnedInAnnotation: "YES" })),
      );
      expect(reportedBurnedIn(yes.report)).toBe(true);
      // Control: NO is the one value that owes nothing, so the rows above are
      // measuring the attribute and not a warning that fires on everything.
      const no = deidentify(
        parseDicom(encapsulatedObject({ transferSyntax: uid, burnedInAnnotation: "NO" })),
      );
      expect(reportedBurnedIn(no.report)).toBe(false);
    },
  );
});

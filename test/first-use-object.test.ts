import { describe, expect, it } from "vitest";

import { parseDicom } from "../src/index.js";
import { FIRST_USE_CT_NO_PREAMBLE, FIRST_USE_CT_OBJECT } from "./fixtures/first-use/ct-object.js";

/**
 * Executing the README's first usage example replaced a placeholder claim ("1.2.840.…") with the
 * value the package produces for the object the example reads. This pins those values at the
 * package's own surface, independent of any document, so the correction cannot drift back.
 */
describe("the first-use CT object at the package surface", () => {
  it("AC-DI8: the preamble-less object reads the values the README now claims", () => {
    const ds = parseDicom(FIRST_USE_CT_NO_PREAMBLE);
    expect(ds.patient.id).toBe("MRN-42");
    expect(ds.patient.issuerOfId).toBe("SAMPLE-HOSP");
    expect(ds.study.instanceUid).toBe("1.2.826.0.1.3680043.8.498.1.1");
    expect(ds.series.modality).toBe("CT");
    expect(ds.image.rows).toBe(512);
    expect(ds.image.rescaleSlope).toBe(1);
    expect(ds.warnings.map((w) => w.code)).toEqual(["DICOM_MISSING_PREAMBLE"]);
  });

  it("AC-DI8: the same object with its preamble tolerates nothing", () => {
    expect(parseDicom(FIRST_USE_CT_OBJECT).warnings).toEqual([]);
  });
});

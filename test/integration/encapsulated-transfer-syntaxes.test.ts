/**
 * `parseDicom` under every PS3.5 2026c section A.4 encapsulation Transfer Syntax, and under every
 * registered Transfer Syntax that stays refused (the JPIP Referenced syntaxes are read, in
 * `jpip-referenced.test.ts`).
 *
 * The expected sets are read out of the vendored PS3.5 and the generated PS3.6 registry by
 * `test/helpers/ps35-section-a4.ts`, never typed here, and every row runs over the WHOLE set, not a
 * sample. The oracle for the metadata is the Explicit-LE twin: the byte-identical Data Set under
 * `1.2.840.10008.1.2.1`, which the parser read before any section A.4 syntax was supported.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { Dictionary, profiles } from "../../src/index.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import { DicomParseError, FATAL_CODES } from "../../src/parser/errors.js";
import { parseDicom } from "../../src/parser/index.js";
import {
  BITS_ALLOCATED,
  COLUMNS,
  MODALITY,
  PATIENT_ID,
  PATIENT_NAME,
  PHOTOMETRIC_INTERPRETATION,
  ROWS,
  SERIES_INSTANCE_UID,
  STUDY_INSTANCE_UID,
  encapsulatedObject,
  explicitLeTwin,
} from "../fixtures/encapsulated/objects.js";
import { ENCAPSULATION_SET, JPIP_SET, UNSUPPORTED_SET } from "../helpers/ps35-section-a4.js";

/** The AC-1 metadata, read through the domain views. */
function metadata(ds: Dataset): Record<string, unknown> {
  return {
    patientName: ds.patient.name,
    patientId: ds.patient.id,
    studyInstanceUid: ds.study.instanceUid,
    seriesInstanceUid: ds.series.instanceUid,
    modality: ds.series.modality,
    rows: ds.image.rows,
    columns: ds.image.columns,
    bitsAllocated: ds.image.bitsAllocated,
    photometricInterpretation: ds.image.photometricInterpretation,
  };
}

/** Every string an error carries, own fields and inherited `message` / `stack` alike. */
function errorStrings(err: DicomParseError): string[] {
  const own = Object.values(err as unknown as Record<string, unknown>).map((v) =>
    typeof v === "string" ? v : String(JSON.stringify(v)),
  );
  return [...own, err.message, err.stack ?? "", err.name];
}

describe("AC-1: every section A.4 syntax parses under Explicit VR LE rules and reads as its twin", () => {
  it("AC-1: the set under test is the whole of section A.4, not a sample", () => {
    expect(ENCAPSULATION_SET).toHaveLength(35);
  });

  it.each(ENCAPSULATION_SET)("AC-1: %s", (uid) => {
    const ds = parseDicom(encapsulatedObject({ transferSyntax: uid }));
    const twin = parseDicom(explicitLeTwin({ transferSyntax: uid }));

    expect(ds.fileMeta?.transferSyntaxUID).toBe(uid);
    // Against the twin: the differential oracle, every field at once.
    expect(metadata(ds)).toStrictEqual(metadata(twin));
    // Against the fixture: so a twin that also read wrong cannot pass.
    expect(ds.patient.name?.alphabetic.familyName).toBe(PATIENT_NAME.split("^")[0]);
    expect(ds.patient.name?.alphabetic.givenName).toBe(PATIENT_NAME.split("^")[1]);
    expect(ds.patient.id).toBe(PATIENT_ID);
    expect(ds.study.instanceUid).toBe(STUDY_INSTANCE_UID);
    expect(ds.series.instanceUid).toBe(SERIES_INSTANCE_UID);
    expect(ds.series.modality).toBe(MODALITY);
    expect(ds.image.rows).toBe(ROWS);
    expect(ds.image.columns).toBe(COLUMNS);
    expect(ds.image.bitsAllocated).toBe(BITS_ALLOCATED);
    expect(ds.image.photometricInterpretation).toBe(PHOTOMETRIC_INTERPRETATION);
  });
});

describe("AC-2: a conformant encapsulated fixture raises nothing, strict or profiled", () => {
  it.each(ENCAPSULATION_SET)("AC-2: %s", (uid) => {
    const bytes = encapsulatedObject({ transferSyntax: uid });
    const strict = parseDicom(bytes, { strict: true });
    expect(strict.fileMeta?.transferSyntaxUID).toBe(uid);
    expect(strict.warnings).toStrictEqual([]);
    const profiled = parseDicom(bytes, { profile: profiles.strict });
    expect(profiled.fileMeta?.transferSyntaxUID).toBe(uid);
    expect(profiled.warnings).toStrictEqual([]);
  });
});

describe("AC-12: every registered Transfer Syntax outside the supported set is refused by name, never by UID", () => {
  it("AC-12: the refused set is every registered UID neither native, nor in section A.4, nor JPIP Referenced", () => {
    // Pinned to its size at `755e408` so an extraction that silently shrank the
    // supported sets cannot pass; the set itself is derived, never typed.
    expect(UNSUPPORTED_SET).toHaveLength(20);
    for (const uid of JPIP_SET) {
      expect(UNSUPPORTED_SET).not.toContain(uid);
    }
    expect(UNSUPPORTED_SET).toContain("1.2.840.10008.1.2.7.1");
  });

  it.each(UNSUPPORTED_SET)("AC-12: %s", (uid) => {
    const name = Dictionary.uid(uid)?.name ?? "";
    expect(name.length).toBeGreaterThan(0);

    let ds: Dataset | undefined;
    let thrown: unknown;
    try {
      ds = parseDicom(encapsulatedObject({ transferSyntax: uid }));
    } catch (err) {
      thrown = err;
    }
    expect(ds).toBeUndefined();
    expect(thrown).toBeInstanceOf(DicomParseError);
    const err = thrown as DicomParseError;
    expect(err.code).toBe(FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX);
    expect(err.message).toContain(name);
    expect(err.snippet).toBe(name);
    for (const text of errorStrings(err)) {
      expect(text).not.toContain(uid);
    }
  });

  it("AC-12: SMPTE ST 2110-20 Uncompressed Progressive Active Video is named as PS3.6 names it", () => {
    const name = "SMPTE ST 2110-20 Uncompressed Progressive Active Video";
    try {
      parseDicom(encapsulatedObject({ transferSyntax: "1.2.840.10008.1.2.7.1" }));
      expect.fail("expected UNSUPPORTED_TRANSFER_SYNTAX");
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      expect(err.code).toBe(FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX);
      expect(err.snippet).toBe(name);
      expect(err.message).toContain(name);
    }
  });
});

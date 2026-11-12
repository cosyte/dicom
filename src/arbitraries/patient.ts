/**
 * Files carrying the non-human patient attributes a veterinary header holds, conformant and not.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import type { Arbitrary } from "fast-check";

import {
  EXPLICIT_LE,
  IMPLICIT_LE,
  type LeafElement,
  type SequenceElement,
  writePart10,
} from "./encode.js";

/** A value padded with one space to an even length, as a text VR is. */
function padded(text: string): Buffer {
  return Buffer.from(text.length % 2 === 0 ? text : `${text} `);
}

/** A plainly invented text value, `SYNTHETIC` and a short suffix. */
function syntheticText(): Arbitrary<string> {
  return fc
    .string({ unit: fc.constantFrom(..."ABCDEFGHIJ0123456789"), maxLength: 6, size: "max" })
    .map((suffix) => `SYNTHETIC ${suffix}`.trimEnd());
}

/**
 * A text attribute: its dictionary VR, or `OB`, a VR its value does not decode from. Under
 * Implicit VR the dictionary's VR is used either way.
 */
function textAttribute(tag: string, vr: string, text: Arbitrary<string>): Arbitrary<LeafElement> {
  return fc
    .tuple(text, fc.boolean())
    .map(([value, wrongVr]) => ({ tag, vr: wrongVr ? "OB" : vr, value: padded(value) }));
}

/** One code item: each part of the triplet present or not, from an invented `99SYNTH` scheme. */
function codeItem(): Arbitrary<readonly LeafElement[]> {
  return fc
    .record(
      {
        value: fc.constantFrom("SYNCODEA", "SYNCODEB", "SYNCODEC0"),
        designator: fc.constantFrom("99SYNTH", "SCT"),
        meaning: fc.constantFrom("Synthetic concept", "Another synthetic concept"),
      },
      { requiredKeys: [] },
    )
    .map(({ value, designator, meaning }) => [
      ...(value === undefined ? [] : [{ tag: "00080100", vr: "SH", value: padded(value) }]),
      ...(designator === undefined
        ? []
        : [{ tag: "00080102", vr: "SH", value: padded(designator) }]),
      ...(meaning === undefined ? [] : [{ tag: "00080104", vr: "LO", value: padded(meaning) }]),
    ]);
}

/**
 * A code sequence of none, one or two items, or, under Explicit VR, the same tag written as an
 * `OB` leaf. Implicit VR has no VR on the wire to get wrong, so there the sequence is always one.
 */
function codeSequence(tag: string, explicit: boolean): Arbitrary<LeafElement | SequenceElement> {
  const sequence = fc
    .array(codeItem(), { maxLength: 2 })
    .map((items): SequenceElement => ({ tag, items }));
  if (!explicit) return sequence;
  return fc.oneof(
    { weight: 4, arbitrary: sequence },
    {
      weight: 1,
      arbitrary: fc.constant<LeafElement>({ tag, vr: "OB", value: padded("SYNCODEA") }),
    },
  );
}

/**
 * Files carrying the non-human patient attributes: Patient Species Description `(0010,2201)` and
 * Code Sequence `(0010,2202)`, Patient's Sex Neutered `(0010,2203)`, Patient Breed Description
 * `(0010,2292)` and Code Sequence `(0010,2293)`, Responsible Person `(0010,2297)`, its Role
 * `(0010,2298)` and Responsible Organization `(0010,2299)`. Each is present or not; a value may be
 * written in a VR it does not decode from, a neutered status may be outside `ALTERED` and
 * `UNALTERED`, and a code sequence may hold no item, two, or an item missing a part. Every file
 * reads with no fatal error, and its `patient` view never throws and reports what it could not
 * read on `patient.issues` with a code from `PATIENT_ISSUE_CODES`. Every value is invented.
 *
 * @returns The generator.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseDicom, PATIENT_ISSUE_CODES } from "@cosyte/dicom";
 * import { animalPatientInput } from "@cosyte/dicom/arbitraries";
 *
 * const codes = new Set<string>(Object.values(PATIENT_ISSUE_CODES));
 * fc.assert(
 *   fc.property(animalPatientInput(), (bytes) =>
 *     (parseDicom(bytes).patient.issues ?? []).every((issue) => codes.has(issue.code)),
 *   ),
 * );
 * ```
 */
export function animalPatientInput(): Arbitrary<Buffer> {
  return fc
    .constantFrom(IMPLICIT_LE, EXPLICIT_LE)
    .chain((transferSyntax) =>
      attributes(transferSyntax === EXPLICIT_LE).map((elements) =>
        writePart10({ transferSyntax, elements }),
      ),
    );
}

/**
 * The attributes of one file, each present or not. `fc.record` keeps its keys in the order they
 * are written, which is ascending tag order, so the Data Set is written in that order.
 */
function attributes(explicit: boolean): Arbitrary<(LeafElement | SequenceElement)[]> {
  return fc
    .record(
      {
        speciesDescription: textAttribute("00102201", "LO", syntheticText()),
        speciesCode: codeSequence("00102202", explicit),
        sexNeutered: textAttribute(
          "00102203",
          "CS",
          fc.constantFrom("ALTERED", "UNALTERED", "YES", "N", "altered"),
        ),
        breedDescription: textAttribute("00102292", "LO", syntheticText()),
        breedCode: codeSequence("00102293", explicit),
        responsiblePerson: textAttribute(
          "00102297",
          "PN",
          syntheticText().map((text) => text.replace(" ", "^")),
        ),
        responsiblePersonRole: textAttribute(
          "00102298",
          "CS",
          fc.constantFrom("OWNER", "VETERINARIAN", "KEEPER"),
        ),
        responsibleOrganization: textAttribute("00102299", "LO", syntheticText()),
      },
      { requiredKeys: [] },
    )
    .map((present) => Object.values(present));
}

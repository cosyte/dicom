/**
 * Round-trip property test — the Postel's-Law *serialize* side, via the shared
 * `@cosyte/test-utils` `roundTripProperty` runner.
 *
 * dicom's serializer is Phase 5; Phase 2 has no `write()`. The `buildDicom`
 * test-helper encoder stands in as the writer here (Phase 5's serializer will
 * subsume it), so the invariant proved is: for a well-formed dataset,
 * `parse(write(model))` is structurally equal to `model`, and re-encoding the
 * re-projected model is byte-stable.
 *
 * Model type `T` = {@link DicomModel} — a tag-keyed structural projection
 * (transfer syntax + per-element tag/VR/value-hex). The runner's pipeline is:
 *
 *   arbitrary → wellFormedModel()
 *   serialize → encodeModel()    (model → on-wire bytes → latin1 string)
 *   parse     → parseDicom()     (latin1 → Buffer → Dataset → projectDataset())
 *   equals    → deep structural compare of the two DicomModels
 *
 * Explicit-BE is excluded from generation (the encoder byte-swaps numeric VRs
 * while the parser stores rawBytes verbatim — a sanctioned lossy transform, not
 * a fidelity bug); it is covered by the lenient + fuzz invariants instead.
 *
 * @module
 */

import { describe, it } from "vitest";
import { roundTripProperty } from "@cosyte/test-utils";

import { parseDicom } from "../../src/index.js";

import {
  type DicomModel,
  encodeModel,
  projectDataset,
  wellFormedModel,
  wireToBuffer,
} from "./_arbitraries.js";

/** Stable run budget so any counterexample reproduces deterministically. */
const NUM_RUNS = 400;

/** Structural equality over the projected model: same TS + same element set. */
function modelsEqual(a: DicomModel, b: DicomModel): boolean {
  if (a.transferSyntax !== b.transferSyntax) return false;
  const aTags = Object.keys(a.elements).sort();
  const bTags = Object.keys(b.elements).sort();
  if (aTags.length !== bTags.length) return false;
  for (let i = 0; i < aTags.length; i++) {
    const tag = aTags[i];
    if (tag === undefined || tag !== bTags[i]) return false;
    const ae = a.elements[tag];
    const be = b.elements[tag];
    if (ae === undefined || be === undefined) return false;
    if (ae.tag !== be.tag || ae.vr !== be.vr || ae.valueHex !== be.valueHex) return false;
  }
  return true;
}

describe("dicom conformance: round-trip (parse(write(model)) is structurally stable)", () => {
  it("parse(encode(model)) structurally equals model, and re-encoding is byte-stable", () => {
    roundTripProperty<DicomModel>({
      arbitrary: wellFormedModel(),
      serialize: (model) => encodeModel(model),
      parse: (wire) => projectDataset(parseDicom(wireToBuffer(wire))),
      equals: modelsEqual,
      numRuns: NUM_RUNS,
    });
  });
});

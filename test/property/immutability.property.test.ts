/**
 * Immutability property tests for the parsed `Dataset` model.
 *
 * Phase 2 NOTE — dicom's mutation API (`setElement` / `addElement` /
 * `removeElement` / `addItem` / `removeItem`, copy-on-write returning a NEW
 * document) is a Phase 3 surface and does not exist yet. The two immutability
 * guarantees the model makes TODAY are:
 *
 *   1. `Dataset.warnings` is frozen at the constructor boundary — a mutation
 *      attempt (e.g. `Array.prototype.push`) throws and leaves it unchanged.
 *      This is wired to the shared `immutabilityProperty` runner: `mutate`
 *      attempts the push (the runner tolerates the throw as a valid frozen
 *      response) and `getSnapshot` captures the warning codes by value.
 *   2. Copy-on-read detachment: with `{ copyValues: true }`, each
 *      `Element.rawBytes` is `Buffer.from(slice)` — independent of the source
 *      buffer — so mutating the source post-parse never perturbs a parsed
 *      Element (the byte-parser analogue of "the original stays byte-identical").
 *      This is the closest standing invariant to the prompt's copy-on-write
 *      requirement; the full new-document COW lands with the Phase 3 mutation
 *      API and should adopt `immutabilityProperty` directly then.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { immutabilityProperty } from "@cosyte/test-utils";

import { parseDicom, type Dataset, type DicomParseWarning, type Element } from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";

import { encodeModel, recoverableInput, TS_DEFLATED_LE, wellFormedModel } from "./_arbitraries.js";

/** Stable run budget so any counterexample reproduces deterministically. */
const NUM_RUNS = 300;

/** Test-only structural accessor for the protected `Dataset._elements` map. */
interface DatasetWithElements {
  readonly _elements: ReadonlyMap<Tag, Element>;
}
function elementsOf(ds: Dataset): ReadonlyMap<Tag, Element> {
  return (ds as unknown as DatasetWithElements)._elements;
}

describe("dicom conformance: parsed-model immutability", () => {
  it("Dataset.warnings is frozen — a mutation attempt throws or no-ops, never edits in place", () => {
    immutabilityProperty<Dataset>({
      // Recoverable inputs maximize the chance the warnings array is non-empty,
      // but the invariant holds for empty arrays too. Inputs that throw a fatal
      // are filtered out so `parse` always yields a model for this runner.
      arbitrary: recoverableInput()
        .map((buf) => buf.toString("latin1"))
        .filter((wire) => parsesWithoutThrowing(wire)),
      parse: (wire: string) => parseDicom(Buffer.from(wire, "latin1")),
      // The frozen warnings array must reject a push (throws in strict-mode JS).
      mutate: (ds) => {
        const frozen: readonly DicomParseWarning[] = ds.warnings;
        Array.prototype.push.call(frozen, {
          code: "DICOM_MISSING_PREAMBLE",
          message: "injected",
          position: { byteOffset: 0 },
        });
      },
      getSnapshot: (ds) => ds.warnings.map((w) => w.code),
      numRuns: NUM_RUNS,
    });
  });

  it("warnings array is frozen on every parsed Dataset (runtime freeze probe)", () => {
    fc.assert(
      fc.property(wellFormedModel(), (model) => {
        const ds = parseDicom(Buffer.from(encodeModel(model), "latin1"));
        expect(Object.isFrozen(ds.warnings)).toBe(true);
        const frozen: readonly DicomParseWarning[] = ds.warnings;
        expect(() => {
          Array.prototype.push.call(frozen, {
            code: "DICOM_MISSING_PREAMBLE",
            message: "x",
            position: { byteOffset: 0 },
          });
        }).toThrow(TypeError);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("copyValues:true detaches rawBytes — mutating the source never perturbs a parsed Element", () => {
    fc.assert(
      fc.property(wellFormedModel(), (model) => {
        const source = Buffer.from(encodeModel(model), "latin1");
        const ds = parseDicom(source, { copyValues: true });

        // Snapshot every element's bytes by value BEFORE mutating the source.
        const before = new Map<string, string>();
        for (const [tag, el] of elementsOf(ds)) before.set(tag, el.rawBytes.toString("hex"));

        // Scribble over the entire source buffer.
        source.fill(0xff);

        // With copyValues:true the parsed Elements keep their own bytes.
        for (const [tag, el] of elementsOf(ds)) {
          expect(el.rawBytes.toString("hex")).toBe(before.get(tag));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("copyValues:false (default) views the source — mutating the source DOES perturb the view", () => {
    // The behavioral complement of the copyValues:true test: a default-mode
    // parse yields rawBytes that ARE a live view of the source, so scribbling
    // the source is reflected in the parsed Element. (We assert behavior, not
    // ArrayBuffer identity — Node pools small Buffers into a shared backing
    // store, so `.buffer` identity is not a reliable copy-vs-view discriminator.)
    //
    // Scoped to NON-deflated syntaxes: under Deflated Explicit VR LE the view is
    // over the inflated dataset buffer (D-27), not the on-disk source, so
    // flipping the source bytes legitimately does not reach it. The
    // copyValues:true detachment test above covers Deflated correctly (copy
    // detaches from whatever buffer it views).
    fc.assert(
      fc.property(
        wellFormedModel()
          .filter((m) => Object.keys(m.elements).length > 0)
          .filter((m) => m.transferSyntax !== TS_DEFLATED_LE),
        (model) => {
          const source = Buffer.from(encodeModel(model), "latin1");
          const ds = parseDicom(source, { copyValues: false });
          const before = new Map<string, string>();
          for (const [tag, el] of elementsOf(ds)) before.set(tag, el.rawBytes.toString("hex"));

          // Flip every byte of the source. A genuine view sees the change.
          for (let i = 0; i < source.length; i++) source[i] = (source[i] ?? 0) ^ 0xff;

          let sawAnyChange = false;
          for (const [tag, el] of elementsOf(ds)) {
            if (el.rawBytes.length === 0) continue; // empty values can't observe a flip
            const now = el.rawBytes.toString("hex");
            if (now !== before.get(tag)) sawAnyChange = true;
          }
          // At least one non-empty element must have observed the source flip,
          // proving default-mode rawBytes are views (not copies).
          expect(sawAnyChange).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

/** True when `parseDicom` returns (does not throw a Tier-3 fatal) for `wire`. */
function parsesWithoutThrowing(wire: string): boolean {
  try {
    parseDicom(Buffer.from(wire, "latin1"));
    return true;
  } catch {
    return false;
  }
}

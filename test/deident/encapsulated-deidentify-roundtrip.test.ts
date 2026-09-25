/**
 * `deidentify()` then `serializeDicom` then `parseDicom`, under every PS3.5 2026c section A.4
 * encapsulation Transfer Syntax: the written file re-reads to the de-identified Dataset, and the
 * planted identity is nowhere in its bytes.
 *
 * The payload is name-bearing on purpose (`DOE^JANE`, `MRN-42`, both synthetic, from the
 * declared-synthetic `encapsulatedObject` fixture). The byte sweep is only evidence of a removal
 * because the same test first shows the writer's output for the source under the same UID DOES
 * carry both, so the check cannot pass on a fixture that never held them.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { deidentify, parseDicom, readPixelDataFragments, serializeDicom } from "../../src/index.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import type { Element } from "../../src/dataset/element.js";
import { PATIENT_ID, PATIENT_NAME, encapsulatedObject } from "../fixtures/encapsulated/objects.js";
import { ENCAPSULATION_SET } from "../helpers/ps35-section-a4.js";

/** One element as the comparison sees it: tag, VR and value bytes, with its items at every depth. */
interface Shape {
  readonly tag: string;
  readonly vr: string;
  readonly bytes: string;
  readonly items?: readonly (readonly Shape[])[];
}

/** The VRs PS3.5 2026c section 6.2 pads with NULL; every other odd-length value takes SPACE. */
const NULL_PADDED: ReadonlySet<string> = new Set(["UI", "OB", "OW", "OF", "OD", "OL", "OV", "UN"]);

/**
 * `el`'s value bytes as a conformant writer emits them: an odd-length defined-length value gains
 * the one pad byte PS3.5 2026c section 6.2 requires, the one change `serializeDicom` documents
 * making to any value ("odd-length values are padded even"). `deidentify()` writes some values
 * odd (`YES` into `(0012,0062)`, for one), so the expectation carries the pad.
 */
function padded(el: Element): Buffer {
  const raw = el.rawBytes;
  if (el.vr === "SQ" || el.length === 0xffffffff || raw.length % 2 === 0) return raw;
  return Buffer.concat([raw, Buffer.from([NULL_PADDED.has(el.vr) ? 0x00 : 0x20])]);
}

/**
 * Every element of `ds` at every depth, sorted by tag (a Data Set is a set of tags). `pad` applies
 * {@link padded} to each value, for the side the writer has not yet written.
 */
function shape(ds: Dataset, pad: boolean): Shape[] {
  return ds
    .elements()
    .map((el) => ({
      tag: el.tag,
      vr: el.vr,
      bytes: (pad ? padded(el) : el.rawBytes).toString("hex"),
      ...(el.items !== undefined ? { items: el.items.map((item) => shape(item, pad)) } : {}),
    }))
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

const NAME = Buffer.from(PATIENT_NAME, "latin1");
const ID = Buffer.from(PATIENT_ID, "latin1");

describe("AC-5: de-identified output under every section A.4 syntax re-reads to itself", () => {
  it("AC-5: the set under test is the whole of section A.4", () => {
    expect(ENCAPSULATION_SET).toHaveLength(35);
  });

  it.each(ENCAPSULATION_SET)("AC-5: %s", (uid) => {
    const source = parseDicom(encapsulatedObject({ transferSyntax: uid }));
    const { dataset } = deidentify(source);
    const reread = parseDicom(serializeDicom(dataset));

    expect(reread.fileMeta?.transferSyntaxUID).toBe(uid);
    // Tag, VR and value bytes of every element, at every depth.
    expect(shape(reread, false)).toStrictEqual(shape(dataset, true));

    // The Basic Offset Table and the fragments are the source's, byte for byte.
    const before = readPixelDataFragments(source);
    const after = readPixelDataFragments(reread);
    expect(before?.fragments.length).toBeGreaterThan(0);
    expect(after?.basicOffsetTable?.equals(before?.basicOffsetTable ?? Buffer.alloc(1))).toBe(true);
    expect(after?.fragments.map((f) => f.toString("hex"))).toStrictEqual(
      before?.fragments.map((f) => f.toString("hex")),
    );
  });
});

describe("AC-6: the written de-identified file carries neither planted identifier", () => {
  it.each(ENCAPSULATION_SET)("AC-6: %s", (uid) => {
    const source = parseDicom(encapsulatedObject({ transferSyntax: uid }));

    // Mutation control: the writer's output for the un-de-identified source carries both.
    const control = serializeDicom(source);
    expect(control.includes(NAME)).toBe(true);
    expect(control.includes(ID)).toBe(true);

    const out = serializeDicom(deidentify(source).dataset);
    expect(out.includes(NAME)).toBe(false);
    expect(out.includes(ID)).toBe(false);
  });
});

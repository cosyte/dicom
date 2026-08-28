/**
 * `(0028,0303) Longitudinal Temporal Information Modified` - the object's own
 * statement about what the run did to its dates.
 *
 * ## What the standard requires, quoted rather than paraphrased
 *
 * PS3.15 2026c §E.2, Basic Application Level Confidentiality Profile: "The
 * Attribute Longitudinal Temporal Information Modified (0028,0303) shall be added
 * to the Data Set with a Value of "REMOVED" if none of the Retain Longitudinal
 * Temporal Information Options is applied." §E.3.6, the Full Dates branch: the
 * same attribute "shall be added to the Data Set with a Value of "UNMODIFIED"".
 * Both sentences are in the hash-pinned copy under `vendor/nema/part15/`, and
 * `test/docs/spec-citations.test.ts` re-derives both against it rather than
 * trusting this comment.
 *
 * 🛑 **THE THIRD VALUE IS NOT REACHABLE AND THE SWEEP BELOW IS WHAT SAYS SO.**
 * §E.3.6's Modified Dates branch requires `MODIFIED`, and it asserts that the run
 * resolved Table E.1-1's modified-dates column and that the object's dates were
 * aggregated or transformed. `DEIDENTIFY_OPTIONS` exposes one temporal name, it
 * carries the full-dates column, and this package transforms no dates - so a
 * `MODIFIED` here would be a claim about work nobody did. The whole point of this
 * attribute is that a recipient acts on it without being able to re-derive it, so
 * a wrong value is worse than an absent one, and the never-`MODIFIED` assertion
 * is swept over the entire option domain rather than sampled.
 *
 * ## Why "exactly one" is measured in the SERIALIZED BYTES
 *
 * A `Dataset` is a `Map<Tag, Element>`, so `getAll` can only ever answer 0 or 1
 * and an object-model count of "exactly one" is true by construction and proves
 * nothing. The failure this attribute is exposed to is the shape `(0012,0063)`
 * takes deliberately - a prior value **joined** to this run's with a `5CH`
 * delimiter - which is one element carrying two values, invisible to any element
 * count. So every "exactly one" row here counts the encoded element header in the
 * Part 10 output AND asserts the decoded value is a single-element array, and the
 * mutation controls below prove both halves can go red.
 *
 * ## Why the last describe block exists
 *
 * Two §E.1.1 rules landed on this same de-identify path from another slice - the
 * File Meta group is replaced, and group 0004 is removed from everything that is
 * not a DICOMDIR. Neither touches `(0028,0303)`: one rewrites `(0002,xxxx)`,
 * which is not the Data Set, and the other tests a Group Number this attribute
 * does not have. That is an argument, and an argument is not a measurement, so
 * the final block runs the two rules and this one in the **same call** and pins
 * that each still does its own job. It asserts the other rule actually fired
 * rather than assuming it, because a fixture that quietly stopped triggering it
 * would make the whole block vacuous.
 *
 * Everything is synthetic: fixtures are built in memory by `build-dicom` and no
 * real patient data is used.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import type { Dataset } from "../../src/dataset/dataset.js";
import { DEIDENTIFY_OPTIONS, type DeidentifyOption } from "../../src/deident/types.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { COSYTE_IMPLEMENTATION_CLASS_UID } from "../../src/serialize/file-meta.js";
import { buildDicom, type BuildDicomOptions } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
/** Media Storage Directory Storage - the one SOP Class the group-0004 carve-out is keyed to. */
const SOP_CLASS_DICOMDIR = "1.2.840.10008.1.3.10";
/** Anything else; here, CT Image Storage. */
const SOP_CLASS_CT = "1.2.840.10008.5.1.4.1.1.2";

/** `(0028,0303)`, the attribute under test. */
const TEMPORAL: Tag = "00280303";
/** `(0008,0020)` Study Date and `(0008,0030)` Study Time - `K` under the temporal option. */
const STUDY_DATE: Tag = "00080020";
const STUDY_TIME: Tag = "00080030";
/** `(0008,1115)` Referenced Series Sequence - a `K` sequence, so its items are walked. */
const REF_SERIES_SQ: Tag = "00081115";
/** `(0012,0063)` De-identification Method - the joined attribute, used as a contrast control. */
const DEIDENT_METHOD: Tag = "00120063";

/** The one option name PS3.15 §E.3.6 is exposed under; it carries the full-dates column. */
const TEMPORAL_OPTION: DeidentifyOption = "RetainLongitudinalTemporal";

/** Even-pad a text value (space) so the fixture builder gets a legal length. */
function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

/** A dataset carrying dates and times, plus whatever the caller adds. */
function buildDated(extra: BuildDicomOptions["elements"] = []): Dataset {
  return parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: STUDY_DATE, vr: "DA", value: pad("20240115") },
        { tag: STUDY_TIME, vr: "TM", value: pad("101500") },
        { tag: "00100010", vr: "PN", value: pad("DOE^JANE") },
        ...extra,
      ],
    }),
  );
}

/**
 * A dataset with **no date or time attribute at all**, which is the input that
 * makes the attribute worth writing: without it, "this study had no dates" and
 * "this run took the dates out" produce byte-identical output.
 */
function buildUndated(): Dataset {
  return parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN", value: pad("DOE^JANE") },
        { tag: "00080060", vr: "CS", value: pad("CT") },
      ],
    }),
  );
}

/** The date/time VRs, for asserting what a run actually left in the output. */
const DATE_TIME_VRS: ReadonlySet<string> = new Set(["DA", "TM", "DT"]);

/** True when any date or time attribute survived with a non-empty value. */
function hasAnyDateOrTime(ds: Dataset): boolean {
  return ds.elements().some((el) => DATE_TIME_VRS.has(el.vr) && el.rawBytes.length > 0);
}

/** The decoded Values of an element, as the strings a recipient reads. */
function decodedValues(ds: Dataset, tag: Tag): readonly string[] {
  const v = ds.get(tag)?.value;
  return v?.kind === "strings" ? v.values : [];
}

/** The single decoded Value, or `undefined` when the element is absent or multi-valued. */
function soleValue(ds: Dataset, tag: Tag): string | undefined {
  const values = decodedValues(ds, tag);
  return values.length === 1 ? values[0] : undefined;
}

/**
 * How many times an Explicit VR LE element header for `tag` under `vr` appears in
 * a Part 10 buffer: the tag's two 16-bit halves little-endian, then the two VR
 * bytes. This is the count that can actually go wrong, and the mutation control
 * `the header count can see a second element` proves it discriminates.
 */
function countHeaders(buf: Buffer, tag: Tag, vr: VR): number {
  const group = Number.parseInt(tag.slice(0, 4), 16);
  const element = Number.parseInt(tag.slice(4, 8), 16);
  const needle = Buffer.alloc(6);
  needle.writeUInt16LE(group, 0);
  needle.writeUInt16LE(element, 2);
  needle.write(vr, 4, "ascii");
  let count = 0;
  for (let i = buf.indexOf(needle); i !== -1; i = buf.indexOf(needle, i + 1)) count++;
  return count;
}

/** The 512 subsets of the nine option names - the entire domain of `retain`. */
function everySubset(): readonly (readonly DeidentifyOption[])[] {
  const out: (readonly DeidentifyOption[])[] = [];
  for (let mask = 0; mask < 1 << DEIDENTIFY_OPTIONS.length; mask++) {
    out.push(DEIDENTIFY_OPTIONS.filter((_, i) => ((mask >> i) & 1) === 1));
  }
  return out;
}

describe("(0028,0303): the two states this library can be in", () => {
  it("writes REMOVED, VR CS, when no temporal option is active", () => {
    const { dataset } = deidentify(buildDated());
    const el = dataset.get(TEMPORAL);
    expect(el).toBeDefined();
    expect(el?.vr).toBe("CS");
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);
    expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
  });

  it("writes UNMODIFIED, VR CS, with the temporal option active", () => {
    const { dataset } = deidentify(buildDated(), { retain: [TEMPORAL_OPTION] });
    const el = dataset.get(TEMPORAL);
    expect(el).toBeDefined();
    expect(el?.vr).toBe("CS");
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["UNMODIFIED"]);
    expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
  });

  it("the two states are distinguishable, and each matches what the run did to the dates", () => {
    // The non-vacuity row: if both branches emitted the same value the assertions
    // above would still pass and the attribute would carry no information. This
    // pins that the declaration tracks the run - `REMOVED` beside an output with
    // no dates left, `UNMODIFIED` beside one that kept the real ones.
    const off = deidentify(buildDated()).dataset;
    const on = deidentify(buildDated(), { retain: [TEMPORAL_OPTION] }).dataset;
    expect(soleValue(off, TEMPORAL)).not.toBe(soleValue(on, TEMPORAL));

    expect(hasAnyDateOrTime(off)).toBe(false);
    // `DA`/`TM` decode to `dates`/`times` rather than `strings`, so the real
    // values are read off the wire bytes here.
    expect(on.get(STUDY_DATE)?.rawBytes.toString("latin1").trim()).toBe("20240115");
    expect(on.get(STUDY_TIME)?.rawBytes.toString("latin1").trim()).toBe("101500");
  });
});

describe("(0028,0303): the whole option domain, swept rather than sampled", () => {
  it("all 512 subsets: the temporal option decides the value and nothing else does", () => {
    let swept = 0;
    const unexpected: string[] = [];

    for (const retain of everySubset()) {
      const { dataset } = deidentify(buildDated(), { retain });
      const want = retain.includes(TEMPORAL_OPTION) ? "UNMODIFIED" : "REMOVED";
      const got = soleValue(dataset, TEMPORAL);
      if (got !== want)
        unexpected.push(`${retain.join("+") || "(none)"}: ${String(got)} != ${want}`);
      swept++;
    }

    expect(swept).toBe(512);
    expect(unexpected).toStrictEqual([]);
  });

  it("all 512 subsets: MODIFIED is never produced, and both reachable values are", () => {
    // 🛑 The out-of-scope state, asserted over the entire domain because it is the
    // one wrong value a recipient cannot detect: `MODIFIED` claims the dates were
    // transformed, and this package transforms none. The `seen` set beside it is
    // the non-vacuity half - a sweep that produced nothing at all would also
    // "never produce MODIFIED".
    const seen = new Set<string | undefined>();
    for (const retain of everySubset()) {
      seen.add(soleValue(deidentify(buildDated(), { retain }).dataset, TEMPORAL));
    }
    expect(seen.has("MODIFIED")).toBe(false);
    expect([...seen].sort()).toStrictEqual(["REMOVED", "UNMODIFIED"]);
  });

  it("no option name other than the temporal one moves the value (the sweep can discriminate)", () => {
    // The mutation control for the sweep: each of the other eight names, alone,
    // must leave the Basic Profile state in place. A sweep whose measurement was
    // blind to `retain` would pass the two rows above and fail this one.
    for (const option of DEIDENTIFY_OPTIONS) {
      const { dataset } = deidentify(buildDated(), { retain: [option] });
      const want = option === TEMPORAL_OPTION ? "UNMODIFIED" : "REMOVED";
      expect(soleValue(dataset, TEMPORAL), option).toBe(want);
    }
  });
});

describe("(0028,0303): a value the source already carried is REPLACED, never joined", () => {
  it("discards the prior state and leaves exactly one element with one value", () => {
    // The source says UNMODIFIED; this run removes the dates. Carrying the
    // sender's claim through would be a false safety declaration - the object
    // would tell a recipient its real dates are present when they are gone.
    const ds = buildDated([{ tag: TEMPORAL, vr: "CS", value: pad("UNMODIFIED") }]);
    expect(soleValue(ds, TEMPORAL)).toBe("UNMODIFIED");

    const { dataset } = deidentify(ds);
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);
    expect(dataset.get(TEMPORAL)?.rawBytes.includes(0x5c)).toBe(false);
    expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
  });

  it("replaces in the other direction too, so the value is the run's and not the file's", () => {
    const ds = buildDated([{ tag: TEMPORAL, vr: "CS", value: pad("REMOVED") }]);
    const { dataset } = deidentify(ds, { retain: [TEMPORAL_OPTION] });
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["UNMODIFIED"]);
    expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
  });

  it("contrast: (0012,0063) DOES join, so the replace here is a choice and not an accident", () => {
    // 🛑 The two attributes take opposite verbs from the standard and this row
    // pins the difference. §E.1.1 says the method text is "inserted in or added
    // to" `(0012,0063)`, which is `1-n`; §E.2 and §E.3.6 say `(0028,0303)` "shall
    // be added to the Data Set with a Value of" one named state, and it is `VM 1`.
    // A future refactor that unified the two write sites would go red here.
    const ds = buildDated([
      { tag: TEMPORAL, vr: "CS", value: pad("UNMODIFIED") },
      { tag: DEIDENT_METHOD, vr: "LO", value: pad("EARLIER TOOL v1") },
    ]);
    const { dataset } = deidentify(ds);
    expect(decodedValues(dataset, DEIDENT_METHOD)).toContain("EARLIER TOOL v1");
    expect(decodedValues(dataset, DEIDENT_METHOD).length).toBeGreaterThan(1);
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);
  });

  it("the header count can see a second element (the exactly-one check can go red)", () => {
    // Constructed control. `countHeaders` is the only non-vacuous half of every
    // "exactly one" row above, since a `Map<Tag, Element>` cannot hold two of a
    // tag; if it could not count to two, those rows would be decoration.
    const { dataset } = deidentify(buildDated());
    const twice = Buffer.concat([serializeDicom(dataset), serializeDicom(dataset)]);
    expect(countHeaders(twice, TEMPORAL, "CS")).toBe(2);
    expect(countHeaders(serializeDicom(dataset), "00100010", "PN")).toBe(1);
  });
});

describe("(0028,0303): a prior element this run cannot take at face value", () => {
  it("a prior value under a VR other than CS is replaced, and the output VR is CS", () => {
    // `(0028,0303)` has no row in Table E.1-1, so nothing in the per-element pass
    // audits or re-types a source-supplied one: this write is the only thing that
    // settles it. `LO` is a real VR the parser reads, so the element survives the
    // pass intact and is genuinely overwritten rather than merely swept up.
    const ds = buildDated([{ tag: TEMPORAL, vr: "LO", value: pad("UNMODIFIED") }]);
    expect(ds.get(TEMPORAL)?.vr).toBe("LO");

    const { dataset } = deidentify(ds);
    expect(dataset.get(TEMPORAL)?.vr).toBe("CS");
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);
    expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
    expect(countHeaders(serializeDicom(dataset), TEMPORAL, "LO")).toBe(0);
  });

  it("a prior value outside the standard's three-value vocabulary is replaced", () => {
    const ds = buildDated([{ tag: TEMPORAL, vr: "CS", value: pad("SHIFTED") }]);
    expect(soleValue(ds, TEMPORAL)).toBe("SHIFTED");

    const { dataset } = deidentify(ds, { retain: [TEMPORAL_OPTION] });
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["UNMODIFIED"]);
    expect(serializeDicom(dataset).includes(Buffer.from("SHIFTED", "latin1"))).toBe(false);
  });

  it("a prior value that is both wrong-VR and out-of-vocabulary is still replaced", () => {
    const ds = buildDated([{ tag: TEMPORAL, vr: "SH", value: pad("MAYBE-KEPT") }]);
    const { dataset } = deidentify(ds);
    expect(dataset.get(TEMPORAL)?.vr).toBe("CS");
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);
    expect(serializeDicom(dataset).includes(Buffer.from("MAYBE-KEPT", "latin1"))).toBe(false);
  });
});

describe("(0028,0303): a nested occurrence does not become the object's declaration", () => {
  it("writes the run's state at the TOP LEVEL when the source only carried a nested one", () => {
    const ds = buildDated([
      {
        tag: REF_SERIES_SQ,
        items: [{ elements: [{ tag: TEMPORAL, vr: "CS", value: pad("UNMODIFIED") }] }],
      },
    ]);
    expect(ds.has(TEMPORAL)).toBe(false);
    expect(ds.get(REF_SERIES_SQ)?.items?.[0]?.has(TEMPORAL)).toBe(true);

    const { dataset } = deidentify(ds);
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);
  });

  it("the top-level declaration is the run's even when a nested one contradicts it", () => {
    // 🩺 THE NESTED COPY IS RETAINED BY OMISSION AND THIS ROW SAYS SO RATHER THAN
    // GLOSSING IT. `(0028,0303)` is not in Table E.1-1, so a copy the sender put
    // inside a Sequence Item is kept exactly as every other unlisted attribute is
    // kept - it still says whatever that sender wrote. What this change
    // guarantees is the Data Set's OWN declaration, which is where §E.2 and
    // §E.3.6 put it and where a recipient reads it. Documented as a known
    // limitation in `docs-content/limitations.md`.
    const ds = buildDated([
      { tag: TEMPORAL, vr: "CS", value: pad("UNMODIFIED") },
      {
        tag: REF_SERIES_SQ,
        items: [{ elements: [{ tag: TEMPORAL, vr: "CS", value: pad("UNMODIFIED") }] }],
      },
    ]);
    const { dataset } = deidentify(ds);
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);

    const nested = dataset.get(REF_SERIES_SQ)?.items?.[0]?.get(TEMPORAL);
    expect(nested?.rawBytes.toString("latin1").trim()).toBe("UNMODIFIED");
  });
});

describe("(0028,0303): what the run was permitted to do, not what the input held", () => {
  it("writes REMOVED on a Data Set that carries no date or time attribute at all", () => {
    const ds = buildUndated();
    expect(hasAnyDateOrTime(ds)).toBe(false);

    const { dataset } = deidentify(ds);
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["REMOVED"]);
    expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
  });

  it("writes UNMODIFIED on the same dateless Data Set when the option is active", () => {
    // The attribute records the run's permission, so a dateless input under the
    // temporal option says UNMODIFIED: there was nothing to modify and nothing
    // was. A recipient reading it learns that any dates present are real.
    const { dataset } = deidentify(buildUndated(), { retain: [TEMPORAL_OPTION] });
    expect(decodedValues(dataset, TEMPORAL)).toStrictEqual(["UNMODIFIED"]);
  });
});

describe("(0028,0303): de-identifying an already de-identified object", () => {
  it("a second run under a different state leaves ONE element holding the SECOND state", () => {
    const first = deidentify(buildDated(), { retain: [TEMPORAL_OPTION] }).dataset;
    expect(decodedValues(first, TEMPORAL)).toStrictEqual(["UNMODIFIED"]);

    // Round-trip through the wire so the second run reads a real parsed element
    // rather than an in-memory one this module built.
    const second = deidentify(parseDicom(serializeDicom(first))).dataset;
    expect(decodedValues(second, TEMPORAL)).toStrictEqual(["REMOVED"]);
    expect(second.get(TEMPORAL)?.rawBytes.includes(0x5c)).toBe(false);
    expect(countHeaders(serializeDicom(second), TEMPORAL, "CS")).toBe(1);
  });

  it("and in the other order, so neither state is a special case", () => {
    const first = deidentify(buildDated()).dataset;
    const second = deidentify(parseDicom(serializeDicom(first)), {
      retain: [TEMPORAL_OPTION],
    }).dataset;
    expect(decodedValues(second, TEMPORAL)).toStrictEqual(["UNMODIFIED"]);
    expect(countHeaders(serializeDicom(second), TEMPORAL, "CS")).toBe(1);
  });

  it("is a fixed point when the state does not change: four passes, one element, one value", () => {
    let ds = buildDated();
    for (let pass = 0; pass < 4; pass++) {
      ds = parseDicom(serializeDicom(deidentify(ds).dataset));
      expect(decodedValues(ds, TEMPORAL)).toStrictEqual(["REMOVED"]);
      expect(countHeaders(serializeDicom(ds), TEMPORAL, "CS")).toBe(1);
    }
  });
});

describe("(0028,0303): survives serialize-then-reparse, with no pad in the compared value", () => {
  it("REMOVED compares equal after a round trip, and the pad stays on the wire", () => {
    // 🛑 THE TWO VALUES DIFFER IN PARITY AND THAT IS WHY BOTH ARE HERE.
    // `REMOVED` is seven bytes, so PS3.5 §7.1.1 obliges the writer to pad it to
    // eight with a SPACE; `UNMODIFIED` is ten and is written as-is. A comparison
    // that read `rawBytes` without accounting for the pad would pass on one state
    // and fail on the other, which is exactly the shape a recipient's `=== `
    // check has.
    const { dataset } = deidentify(buildDated());
    const reparsed = parseDicom(serializeDicom(dataset));
    const el = reparsed.get(TEMPORAL);

    expect(el?.vr).toBe("CS");
    expect(decodedValues(reparsed, TEMPORAL)).toStrictEqual(["REMOVED"]);
    expect(soleValue(reparsed, TEMPORAL)).toBe("REMOVED");
    // The pad is really there: 7 characters occupy 8 on-wire bytes.
    expect(el?.rawBytes.length).toBe(8);
    expect(el?.rawBytes.toString("latin1")).toBe("REMOVED ");
  });

  it("UNMODIFIED compares equal after a round trip, and needs no pad", () => {
    const { dataset } = deidentify(buildDated(), { retain: [TEMPORAL_OPTION] });
    const reparsed = parseDicom(serializeDicom(dataset));
    const el = reparsed.get(TEMPORAL);

    expect(el?.vr).toBe("CS");
    expect(soleValue(reparsed, TEMPORAL)).toBe("UNMODIFIED");
    expect(el?.rawBytes.length).toBe(10);
    expect(el?.rawBytes.toString("latin1")).toBe("UNMODIFIED");
  });

  it("the round trip raises no warning, on either state", () => {
    // 🛑 A NEW ELEMENT THAT MADE A CONFORMANT FILE WARN WOULD COST EVERY
    // `{ strict: true }` CALLER THE OBJECT, because strict turns every Tier-2
    // warning into a throw. Both states are checked because only one of them is
    // odd-length, and the odd one is where a pad-related code would fire.
    const codes: string[] = [];
    for (const retain of [[], [TEMPORAL_OPTION]]) {
      const { dataset } = deidentify(buildDated(), { retain });
      const reparsed = parseDicom(serializeDicom(dataset));
      codes.push(...reparsed.warnings.map((w) => w.code));
      const decoded = reparsed.get(TEMPORAL)?.value;
      if (decoded?.kind === "strings") codes.push(...(decoded.warnings ?? []).map((w) => w.code));
    }
    expect(codes).toStrictEqual([]);
  });
});

describe("(0028,0303) beside the other PS3.15 §E.1.1 rules on this path", () => {
  /**
   * A dated object that also carries `(0004,xxxx)` at the root and inside a
   * Sequence Item, plus an identity-bearing File Meta group.
   *
   * The nested `(0004,xxxx)` sits inside `(0008,1115)` and not inside a
   * `(0004,xxxx)` carrier, so it is reached by descent rather than removed with
   * its parent.
   */
  function buildDirectoryBearingDated(
    overrides: Partial<BuildDicomOptions> = {},
  ): BuildDicomOptions {
    return {
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: SOP_CLASS_CT,
      mediaStorageSOPInstanceUID: "1.2.840.113619.2.55.3.1",
      sourceApplicationEntityTitle: "ACMEGEN_CT01",
      fileMetaExtraElements: [{ tag: "00020017", vr: "AE", value: pad("ACMEGEN_SEND") }],
      elements: [
        { tag: STUDY_DATE, vr: "DA", value: pad("20240115") },
        { tag: STUDY_TIME, vr: "TM", value: pad("101500") },
        { tag: "00100010", vr: "PN", value: pad("DOE^JANE") },
        { tag: "00041130", vr: "CS", value: pad("ACMEGEN_FILESET") },
        {
          tag: REF_SERIES_SQ,
          // The Series Instance UID keeps the item non-empty once the
          // `(0004,xxxx)` beside it is removed: an item emptied by that removal
          // reparses with `DICOM_EMPTY_ITEM_IN_SEQUENCE`, which is a fact about
          // the fixture rather than about either rule under test.
          items: [
            {
              elements: [
                { tag: "0020000E", vr: "UI", value: pad("1.2.840.113619.2.55.3.3") },
                { tag: "00041500", vr: "CS", value: pad("DICOM/PAT001") },
              ],
            },
          ],
        },
      ],
      ...overrides,
    };
  }

  it("group-0004 removal fires in the same run, and the declaration is still written", () => {
    for (const retain of [[], [TEMPORAL_OPTION]] as readonly (readonly DeidentifyOption[])[]) {
      const { dataset, report } = deidentify(parseDicom(buildDicom(buildDirectoryBearingDated())), {
        retain,
      });
      const want = retain.includes(TEMPORAL_OPTION) ? "UNMODIFIED" : "REMOVED";

      // Non-vacuity: the other rule really ran on this input, at both depths.
      expect(report.group0004RemovalCount).toBe(2);
      expect(dataset.has("00041130")).toBe(false);

      expect(decodedValues(dataset, TEMPORAL)).toStrictEqual([want]);
      expect(dataset.get(TEMPORAL)?.vr).toBe("CS");
      expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
    }
  });

  it("the DICOMDIR carve-out keeps group 0004 and does not suppress the declaration", () => {
    // The other rule's opposite branch: when the object declares Media Storage
    // Directory Storage its `(0004,xxxx)` elements stay. The temporal
    // declaration is a Data Set statement either way, so it is written here too
    // - if the two rules shared a predicate, this is the row that would go red.
    for (const retain of [[], [TEMPORAL_OPTION]] as readonly (readonly DeidentifyOption[])[]) {
      const { dataset, report } = deidentify(
        parseDicom(
          buildDicom(buildDirectoryBearingDated({ mediaStorageSOPClassUID: SOP_CLASS_DICOMDIR })),
        ),
        { retain },
      );
      const want = retain.includes(TEMPORAL_OPTION) ? "UNMODIFIED" : "REMOVED";

      expect(report.group0004RemovalCount).toBe(0);
      expect(dataset.has("00041130")).toBe(true);

      expect(decodedValues(dataset, TEMPORAL)).toStrictEqual([want]);
      expect(countHeaders(serializeDicom(dataset), TEMPORAL, "CS")).toBe(1);
    }
  });

  it("survives the replaced File Meta group, through serialize and reparse", () => {
    // The File Meta group is rebuilt rather than edited, and `(0028,0303)` is a
    // Data Set element rather than a `(0002,xxxx)` one. This runs both in one
    // call and reads the result back off the wire, so "different groups, no
    // interaction" is measured on the bytes a recipient actually gets.
    for (const retain of [[], [TEMPORAL_OPTION]] as readonly (readonly DeidentifyOption[])[]) {
      const { dataset, report } = deidentify(parseDicom(buildDicom(buildDirectoryBearingDated())), {
        retain,
      });
      const want = retain.includes(TEMPORAL_OPTION) ? "UNMODIFIED" : "REMOVED";

      // Non-vacuity: the File Meta replacement really ran on this input.
      expect(dataset.fileMeta?.sourceApplicationEntityTitle).toBeUndefined();
      expect(dataset.fileMeta?.implementationClassUID).toBe(COSYTE_IMPLEMENTATION_CLASS_UID);
      expect(report.fileMetaElementsDroppedCount).toBe(1);

      const bytes = serializeDicom(dataset);
      const reparsed = parseDicom(bytes);
      expect(reparsed.get(TEMPORAL)?.vr).toBe("CS");
      expect(soleValue(reparsed, TEMPORAL)).toBe(want);
      expect(countHeaders(bytes, TEMPORAL, "CS")).toBe(1);
      expect(reparsed.warnings.map((w) => w.code)).toStrictEqual([]);
    }
  });

  it("neither rule moves the value: the temporal option is still the only input to it", () => {
    // The mutation control for this block. Each of the other eight names, alone,
    // must leave the Basic Profile state in place on an input that exercises
    // both of the other rules - a sweep blind to `retain` would pass every row
    // above and fail this one.
    const source = parseDicom(buildDicom(buildDirectoryBearingDated()));
    for (const option of DEIDENTIFY_OPTIONS) {
      const { dataset } = deidentify(source, { retain: [option] });
      const want = option === TEMPORAL_OPTION ? "UNMODIFIED" : "REMOVED";
      expect(soleValue(dataset, TEMPORAL), option).toBe(want);
    }
  });
});

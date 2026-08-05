/**
 * `DICOM-TAG-COLLISION-DESTROYS-ELEMENT` - a Data Set that holds one tag twice
 * loses the first element's value at parse time, and until this slice it lost it
 * in silence.
 *
 * A parsed Data Set is a `Map<Tag, Element>`. `Map.set` on a key the map already
 * holds overwrites in place, so the earlier element is gone from the object and
 * the survivor is indistinguishable from an element the sender wrote once: no
 * warning, no report entry, nothing a reader can query and nothing a round trip
 * can reveal. In a de-identification tool that is the mirror of a leak - an
 * element the sender wrote, dropped without a word.
 *
 * **The remedy is a disclosure and nothing else.** Every insert into a Data Set
 * map goes through `defineElement`, which emits
 * `DICOM_DUPLICATE_TAG_IN_DATA_SET` when it is about to replace an element. The
 * reading does not move: the last element read still wins, no value is invented
 * for the one that lost, and no bound is chosen. That is deliberate. The two
 * files a bound would have to tell apart are the same file (see
 * `explicit-sq-item-bound.test.ts`), so reporting at the site that decides is
 * the only remedy the format admits.
 *
 * PS3.5 2026c says a tag occurs at most once, twice, about the two Data Sets
 * this covers. Both were read from the vendored, SHA-pinned
 * `vendor/nema/part05/`, and each sentence occurs exactly once in the document.
 *
 * Section **7.1** "Data Elements", about the Data Set: "The Data Elements in a
 * Data Set shall be ordered by increasing Data Element Tag Number and shall
 * occur at most once in a Data Set."
 *
 * Section **7.5.1** "Item Encoding Rules", about an Item's contents: "Within the
 * context of each Item, these Data Elements shall be ordered by increasing Data
 * Element Tag value and appear only once."
 *
 * So the code cannot fire on a conformant file, which is what makes it safe to
 * add under the `{ strict: true }` escalation every Tier-2 code takes. The
 * measured cost of that escalation is in the changeset, from the grid.
 *
 * **What these tests are evidence of, stated because the grid cannot stand in
 * for them.** `scripts/measure-sq-bound-grid.ts` sweeps length fields and
 * records the warning channels, so it can count where the collision fires -
 * 345 of its 83,037 cells, all in the two hoist-collision families, silent on
 * base - but every fixture that reaches it there is reached through a length
 * lie. The plain duplicate, the collision inside an Item, the collision that
 * swallows a whole `SQ`, the frame the byte offset is in, and the `{ strict:
 * true }` behaviour are pinned here or nowhere.
 *
 * Every fixture is synthetic and built in memory by `build-dicom`; the
 * deliberately fake identifiers exist only so a substitution is observable.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { DicomParseError, WARNING_CODES, parseDicom } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { strict as strictProfile } from "../../src/profiles/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** Synthetic, deliberately fake. Present only so a substitution is observable. */
const FIRST = "MRN-11111";
const SECOND = "MRN-99999";
const PATIENT_ID = "00100020" as Tag;
/** `(0040,A730)` Content Sequence: `SQ` in PS3.6, and above `(0010,0020)`. */
const CONTENT_SEQUENCE = "0040A730" as Tag;

/** Latin-1 bytes padded to the even length PS3.5 section 7.1 requires. */
function val(text: string): Buffer {
  const raw = Buffer.from(text, "latin1");
  return raw.length % 2 === 0 ? raw : Buffer.concat([raw, Buffer.from([0x20])]);
}

/** Explicit VR short form: tag(4) + VR(2) + length(2) + value. */
function shortFormWireSize(value: Buffer): number {
  return 8 + value.length;
}

const collisions = (ds: { readonly warnings: readonly { readonly code: string }[] }): number =>
  ds.warnings.filter((w) => w.code === WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET).length;

describe("a Data Set that holds one tag twice", () => {
  it.each([
    ["Explicit VR LE", EXPLICIT_LE],
    ["Explicit VR BE", EXPLICIT_BE],
    ["Implicit VR LE", IMPLICIT_LE],
  ])("%s: the replacement is reported, and the replaced value is gone", (_label, ts) => {
    const buf = buildDicom({
      transferSyntax: ts,
      elements: [
        { tag: PATIENT_ID, vr: "LO" as VR, value: val(FIRST) },
        { tag: PATIENT_ID, vr: "LO" as VR, value: val(SECOND) },
      ],
    });
    const ds = parseDicom(buf);

    // The disclosure: exactly one, at the offset of the header that replaced.
    expect(collisions(ds)).toBe(1);
    const warning = ds.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
    );

    // The reading is unchanged and is asserted, not assumed: last wins, and the
    // first element's value is not anywhere in the object.
    const survivor = ds.get(PATIENT_ID);
    expect(survivor?.rawBytes.toString("latin1")).toBe(val(SECOND).toString("latin1"));
    expect([...ds.elements()].map((el) => el.rawBytes.toString("latin1"))).not.toContain(
      val(FIRST).toString("latin1"),
    );

    // 🛑 THE ONLY ROUTE FROM THE WARNING BACK TO WHAT WAS LOST, and it is a
    // relationship rather than a numeral: the offset is the survivor's own
    // `Element.byteOffset`, so a consumer reads the tag off the model instead of
    // out of a message built from bytes the file chose. The replaced element's
    // tag IS the survivor's tag - that is what a collision means.
    expect(warning?.position.byteOffset).toBe(survivor?.byteOffset);
  });

  it("a file with no duplicate raises nothing (the control that makes the row above non-vacuous)", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          { tag: PATIENT_ID, vr: "LO" as VR, value: val(FIRST) },
          { tag: "00100021", vr: "LO" as VR, value: val(SECOND) },
        ],
      }),
    );
    expect(collisions(ds)).toBe(0);
    expect(ds.get(PATIENT_ID)?.rawBytes.toString("latin1")).toBe(val(FIRST).toString("latin1"));
  });

  it("the count follows the file: three collisions on one tag report three times", () => {
    // Not a bound, and deliberately not asserted as one. `ds.warnings` is
    // uncapped package-wide (#48's disclosed, pre-existing posture), so this
    // pins the growth rather than a cap.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          { tag: PATIENT_ID, vr: "LO" as VR, value: val(FIRST) },
          { tag: PATIENT_ID, vr: "LO" as VR, value: val("MRN-22222") },
          { tag: PATIENT_ID, vr: "LO" as VR, value: val("MRN-33333") },
          { tag: PATIENT_ID, vr: "LO" as VR, value: val(SECOND) },
        ],
      }),
    );
    expect(collisions(ds)).toBe(3);
  });

  it("inside an Item it reports too, in the Item's own frame", () => {
    // PS3.5 section 7.5.1 carries the same obligation one level down, and the
    // per-item Data Set is built by the same loop, so the disclosure reaches it
    // for free. The FRAME is the part worth pinning: `Element.byteOffset` inside
    // a defined-length item is relative to the item's own slice, not to the
    // file, and this warning's offset is in whatever frame the element it names
    // is in. Measured rather than described - no frame-of-reference contract is
    // documented for either.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          {
            tag: CONTENT_SEQUENCE,
            items: [
              {
                elements: [
                  { tag: PATIENT_ID, vr: "LO" as VR, value: val(FIRST) },
                  { tag: PATIENT_ID, vr: "LO" as VR, value: val(SECOND) },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(collisions(ds)).toBe(1);
    const item = ds.get(CONTENT_SEQUENCE)?.items?.[0];
    expect(item?.get(PATIENT_ID)?.rawBytes.toString("latin1")).toBe(val(SECOND).toString("latin1"));
    const warning = ds.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
    );
    expect(warning?.position.byteOffset).toBe(item?.get(PATIENT_ID)?.byteOffset);
    // The item frame is not the file frame: the same element is far into the
    // file and near the start of its own item. The inequality is the assertion,
    // not the numerals, which move with the File Meta group's size.
    expect(warning?.position.byteOffset).toBeLessThan(ds.get(CONTENT_SEQUENCE)?.byteOffset ?? 0);
  });
});

describe("the collision an under-declared length produces, which is the ordinary one", () => {
  // An `(FFFE,E000)` Item that declares FEWER bytes than its contents occupy
  // ends early, so the elements the sender encoded as Item content are read as
  // elements of the ENCLOSING Data Set. #69 closed the private-retention leak
  // that route opens; the element it lands on top of is what this slice is
  // about. The root's own element is written BEFORE the sequence, so the file's
  // tag ordering is otherwise conformant and the length lie is the only defect.
  //
  // 🛑 THE TWO SYNTAXES NEED DIFFERENT LIES, and the difference is #69's second
  // predicate rather than a fixture detail. Under Explicit VR the item stream is
  // bounded against the buffer, so the SQ's own field and the Item's both give
  // way and the trailing element is read at the root. Under Implicit VR LE the
  // defined-length SQ path SLICES the item stream to the declared Value Length,
  // so an honest Item inside an under-declaring SQ no longer fits its slice: the
  // descent is refused (`DICOM_SQ_NOT_DESCENDED`) and the leftover bytes are read
  // at the root. Measured, not assumed - an Item-only lie under Implicit VR LE
  // ejects nothing at all, which is why this fixture is parameterised by both
  // deltas rather than one.
  const ejectFixture = (ts: string, sqDelta: number, itemDelta: number): Buffer =>
    buildDicom({
      transferSyntax: ts,
      elements: [
        { tag: PATIENT_ID, vr: "LO" as VR, value: val(FIRST) },
        {
          tag: CONTENT_SEQUENCE,
          declaredLengthDelta: sqDelta,
          items: [
            {
              declaredLengthDelta: itemDelta,
              elements: [
                { tag: "00080008", vr: "CS" as VR, value: val("ORIGINAL") },
                { tag: PATIENT_ID, vr: "LO" as VR, value: val(SECOND) },
              ],
            },
          ],
        },
      ],
    });
  const EJECTED_WIRE = shortFormWireSize(val(SECOND));

  it.each([
    ["Explicit VR LE", EXPLICIT_LE, -EJECTED_WIRE, -EJECTED_WIRE],
    ["Implicit VR LE", IMPLICIT_LE, -EJECTED_WIRE, 0],
  ])(
    "%s: an ejected element that lands on the root's own tag is reported",
    (_label, ts, sqDelta, itemDelta) => {
      // The honest control first: nothing falls out, so the root keeps its own
      // value and no collision is reported. Without it this row proves only that
      // some warning exists somewhere.
      const honest = parseDicom(ejectFixture(ts, 0, 0));
      expect(collisions(honest)).toBe(0);
      expect(honest.get(PATIENT_ID)?.rawBytes.toString("latin1")).toBe(
        val(FIRST).toString("latin1"),
      );
      expect(honest.get(CONTENT_SEQUENCE)?.items?.[0]?.get(PATIENT_ID)).toBeDefined();

      const lying = parseDicom(ejectFixture(ts, sqDelta, itemDelta));
      expect(collisions(lying)).toBe(1);
      // The substitution itself, unchanged by this slice: the root now reads the
      // Item's value. What is new is that the object says so.
      expect(lying.get(PATIENT_ID)?.rawBytes.toString("latin1")).toBe(
        val(SECOND).toString("latin1"),
      );
      const warning = lying.warnings.find(
        (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
      );
      expect(warning?.position.byteOffset).toBe(lying.get(PATIENT_ID)?.byteOffset);

      // The mirror of the honest control, and the reason the parameterisation
      // is not cosmetic: with the Item's field lying alone, neither syntax
      // reaches this collision, and they miss it differently.
      if (ts === IMPLICIT_LE) {
        // The slice is cut at the SQ's honest length, the short Item fits
        // inside it, and the trailing element stays where the sender put it.
        expect(collisions(parseDicom(ejectFixture(ts, 0, -EJECTED_WIRE)))).toBe(0);
      } else {
        // The SQ's honest length still covers the ejected bytes, so the item
        // loop meets a non-Item tag inside the sequence and the file is refused
        // outright: a Tier-3 fatal, which is loud rather than silent.
        expect(() => parseDicom(ejectFixture(ts, 0, -EJECTED_WIRE))).toThrow(DicomParseError);
      }
    },
  );

  it("an ejected element carrying the SEQUENCE's own tag replaces the whole sequence, and that is reported too", () => {
    // The shape #51's pass-4 refuter graded a blocker (F1): the `SQ` element is
    // inserted AFTER its own descent returns, so an element ejected out of it
    // whose tag is the sequence's own tag lands on top of the sequence itself.
    // Everything nested inside it leaves the object at once - `items` goes from
    // an array to `undefined` - which is the largest loss this defect produces.
    const ejected = { tag: CONTENT_SEQUENCE, vr: "LO" as VR, value: val("EJECTED-OVER-THE-SQ") };
    const delta = -shortFormWireSize(ejected.value);
    const build = (lie: boolean): Buffer =>
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          {
            tag: CONTENT_SEQUENCE,
            declaredLengthDelta: lie ? delta : 0,
            items: [
              {
                declaredLengthDelta: lie ? delta : 0,
                elements: [{ tag: "00080008", vr: "CS" as VR, value: val("ORIGINAL") }, ejected],
              },
            ],
          },
        ],
      });

    const honest = parseDicom(build(false));
    expect(collisions(honest)).toBe(0);
    expect(honest.get(CONTENT_SEQUENCE)?.vr).toBe("SQ");
    expect(honest.get(CONTENT_SEQUENCE)?.items).toHaveLength(1);

    const lying = parseDicom(build(true));
    expect(collisions(lying)).toBe(1);
    const survivor = lying.get(CONTENT_SEQUENCE);
    expect(survivor?.vr).toBe("LO");
    expect(survivor?.items).toBeUndefined();
    expect(survivor?.rawBytes.toString("latin1")).toBe(
      val("EJECTED-OVER-THE-SQ").toString("latin1"),
    );
  });
});

describe("the diagnostic itself", () => {
  const duplicate = buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [
      { tag: PATIENT_ID, vr: "LO" as VR, value: val("SMITHSON-11111") },
      { tag: PATIENT_ID, vr: "LO" as VR, value: val("SMITHSON-99999") },
    ],
  });

  it("names no tag and reproduces no value", () => {
    // 🩺 The condition that raises this code is "a header appeared where the
    // file's own structure did not put one", so the four tag bytes can be
    // fragments of somebody's value. The factory takes no tag, and the message
    // is the registry entry verbatim - `test/integration/phi-diagnostic-surface`
    // holds the slot that proves a planted marker cannot reach it, with the
    // runner that can fail. This is the local, name-bearing check.
    const warning = parseDicom(duplicate).warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
    );
    expect(warning?.message).not.toContain("SMITHSON");
    expect(warning?.message).not.toContain(PATIENT_ID);
    expect(warning?.message).toContain("Tag withheld");
  });

  it("🛑 the byte offset is NOT a key: an in-Item collision reports an offset a ROOT element holds", () => {
    // The refutation this test exists for. The message withholds the tag and
    // the docs offer `position.byteOffset` instead - but `Element.byteOffset` is
    // frame-dependent (file-absolute at the root, item-relative inside a
    // defined-length Item), so "find the element at that offset" can name an
    // element that was never touched. Derived at run time rather than written as
    // a numeral: the padding that makes the two frames coincide is computed from
    // this fixture's own measurements, because the file's File Meta size decides
    // them and a hard-coded number goes stale with any fixture edit.
    const build = (pad: number): Buffer =>
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          { tag: "00080008", vr: "CS" as VR, value: val("ORIGINAL") },
          {
            tag: CONTENT_SEQUENCE,
            items: [
              {
                elements: [
                  { tag: "00080018", vr: "UI" as VR, value: Buffer.alloc(pad, 0x30) },
                  { tag: PATIENT_ID, vr: "LO" as VR, value: val(FIRST) },
                  { tag: PATIENT_ID, vr: "LO" as VR, value: val(SECOND) },
                ],
              },
            ],
          },
        ],
      });

    const probe = parseDicom(build(2));
    const probeWarning = probe.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
    );
    const rootOffset = probe.get("00080008")?.byteOffset ?? -1;
    // The frames disagree, which is the premise: the same collision is "near the
    // start" in the item's frame and the root filler is far into the file.
    expect(probeWarning?.position.byteOffset).toBeLessThan(rootOffset);

    const pad = 2 + (rootOffset - (probeWarning?.position.byteOffset ?? 0));
    expect(pad % 2).toBe(0);
    const collided = parseDicom(build(pad));
    const warning = collided.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
    );

    // The offset now names TWO different elements in two different frames, and
    // the root one is intact. Any consumer recipe that searches the root by this
    // offset gets `(0008,0008)` and no indication it is wrong, so the docs say
    // root-only and `position.contextPath` is left for a slice that gives every
    // parser warning one.
    const rootMatches = [...collided.elements()].filter(
      (el) => el.byteOffset === warning?.position.byteOffset,
    );
    expect(rootMatches.map((el) => el.tag)).toStrictEqual(["00080008"]);
    expect(rootMatches[0]?.rawBytes.toString("latin1")).toBe(val("ORIGINAL").toString("latin1"));
    // The element actually destroyed is inside the item, under a different tag.
    const item = collided.get(CONTENT_SEQUENCE)?.items?.[0];
    expect(item?.get(PATIENT_ID)?.byteOffset).toBe(warning?.position.byteOffset);
    expect(item?.get(PATIENT_ID)?.rawBytes.toString("latin1")).toBe(val(SECOND).toString("latin1"));
    expect(warning?.position.contextPath).toBeUndefined();
  });

  it("a rolled-back descent streams the code to `onWarning` while `ds.warnings` never gets it", () => {
    // The one shape where the code fires and NOTHING was lost, and it is a
    // false alarm rather than a silence. Under Implicit VR LE a defined-length
    // `SQ` whose value holds a duplicate and then a non-Item tag makes
    // `tryParseDefinedLengthSQ` roll the parse back: the map that took the
    // collision is discarded, and both values survive in `Element.rawBytes`.
    // `makeEmitter` streams to `onWarning` BEFORE the pop that undoes it (the
    // pre-existing D-03 ordering), so the two channels disagree. Pinned rather
    // than described, because this is exactly the disclosure a later slice would
    // otherwise have to rediscover.
    const trailing = { tag: "00080060" as const, vr: "CS" as VR, value: val("MR") };
    const buf = buildDicom({
      transferSyntax: IMPLICIT_LE,
      elements: [
        {
          tag: CONTENT_SEQUENCE,
          declaredLengthDelta: shortFormWireSize(trailing.value),
          items: [
            {
              elements: [
                { tag: PATIENT_ID, vr: "LO" as VR, value: val(FIRST) },
                { tag: PATIENT_ID, vr: "LO" as VR, value: val(SECOND) },
              ],
            },
          ],
        },
        trailing,
      ],
    });
    const streamed: string[] = [];
    const ds = parseDicom(buf, { onWarning: (w) => streamed.push(w.code) });

    expect(streamed).toContain(WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET);
    expect(ds.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
    );
    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_SQ_NOT_DESCENDED);

    // 🩺 AND THE STRICT CHANNEL SUBSTITUTES THE CODE ON THIS FILE, which is the
    // one place the new code is the LESS accurate diagnosis. Measured on both
    // trees: `0ead071` throws `DICOM_SQ_NOT_DESCENDED` here, this tree throws the
    // collision - on a file where nothing was destroyed. Both refuse it, so no
    // caller loses an object. Disclosed rather than fixed: not emitting during a
    // trial descent is a change to the chokepoint's contract and a wider slice.
    try {
      parseDicom(buf, { strict: true });
      expect.unreachable("strict mode must refuse this file on both trees");
    } catch (err) {
      expect((err as { readonly code: string }).code).toBe(
        WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
      );
    }

    // Nothing was lost on that file: the sequence was not descended, so both
    // values are still in the object as bytes.
    const raw = ds.get(CONTENT_SEQUENCE)?.rawBytes.toString("latin1") ?? "";
    expect(raw).toContain(FIRST);
    expect(raw).toContain(SECOND);
    expect(ds.get(CONTENT_SEQUENCE)?.items).toBeUndefined();
  });

  it("escalates under { strict: true }, which is the chokepoint's contract and not a choice made here", () => {
    expect(() => parseDicom(duplicate, { strict: true })).toThrow(DicomParseError);
    try {
      parseDicom(duplicate, { strict: true });
      expect.unreachable("strict mode must escalate");
    } catch (err) {
      expect((err as { readonly code: string }).code).toBe(
        WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
      );
    }
  });

  it("🩺 the message names no tag, but the STRICT channel's snippet carries one (D-10, pre-existing)", () => {
    // The sentence this pins is "the MESSAGE names no tag", never "this code
    // cannot surface one". `makeEmitter`'s escalate path builds
    // `DicomParseError.snippet` from 16 raw source bytes at the same offset -
    // the replacing element's header - and renders them as hex, which the
    // PHI-diagnostic runner structurally cannot match. That is D-10, package-wide
    // and reachable on `0ead071` through other codes - this file does not throw
    // there at all, but the same file without its even-length padding gives the
    // identical bytes via `DICOM_ODD_LENGTH_VALUE_PADDED`, one length byte apart
    // (`0d` for `0e`). So it is NOT this slice's to fix; it is asserted so the
    // guarantee cannot drift into the wider claim.
    //
    // The WHOLE 16 bytes are pinned, not two substrings around the interesting
    // one. A pass-3 grade caught this exact artifact carrying `0a` where the
    // fixture's declared length is `0e`, with a substring assertion green either
    // way: a literal quoted in the docs has to be the literal a test compares.
    try {
      parseDicom(duplicate, { strict: true });
      expect.unreachable("strict mode must escalate");
    } catch (err) {
      const thrown = err as { readonly message: string; readonly snippet?: string };
      expect(thrown.message).not.toContain("SMITHSON");
      expect(thrown.message).not.toContain(PATIENT_ID);
      // `(0010,0020)`, VR `LO`, declared length 14, then "SMITHSON" - the tag the
      // message withheld and eight bytes of the value, exactly as the CHANGELOG,
      // the factory's JSDoc and `agent-notes.md` quote it.
      expect(thrown.snippet).toBe("10 00 20 00 4c 4f 0e 00 53 4d 49 54 48 53 4f 4e");
    }
  });

  it("the shipped `profiles.strict` preset does NOT escalate it", () => {
    // Adding a code to a shipped preset moves every `profiles.strict`
    // consumer's parse and is a measured behaviour change of its own, not a
    // side effect of adding a code.
    expect(strictProfile.escalations.has(WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET)).toBe(
      false,
    );
    expect(collisions(parseDicom(duplicate, { profile: strictProfile }))).toBe(1);
  });
});

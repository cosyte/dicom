/**
 * `DICOM-PRIVATE-CREATOR-RESERVATION-LEAK` - a private value retained on a
 * §7.8.1 block reservation the file does not unambiguously give it.
 *
 * ## The defect, as it shipped (measured on the published `0.0.8` tarball)
 *
 * `deidentify(ds, { retain: ["RetainSafePrivate"], profile: profiles.ge })` on a
 * file whose Item declares more bytes than its enclosing Sequence does: the Item
 * absorbs the element that follows the sequence, so a private data element the
 * sender wrote at the **root** - where no Private Creator reserved its block, and
 * where the Basic Profile therefore removes it - lands beside a creator that
 * genuinely is Item content and is kept verbatim. Measured on `164eb39`:
 * `report.removedPrivateTags` is `[]`, `SECRET-PRIVATE-PHI` is in the serialized
 * output, and `(0012,0062) Patient Identity Removed` is `YES`. **A stamp that
 * outruns the redaction**, which is the worst shape this class has: a consumer
 * trusting the attestation has no signal at all.
 *
 * Found by `#51`'s pass-6 `conformance-refuter` and measured **identical on
 * `origin/main`**, so the leak is `PRE-EXISTING` and was never introduced by that
 * branch. It needs the opt-in `RetainSafePrivate` plus a vendor profile.
 *
 * ## What the remedy is, and what it is NOT
 *
 * It is **not a parser bound.** An over-declaring Item and an under-declaring
 * Sequence are byte-identical - `#51` established that three times, and its
 * refuter could construct no input-derived predicate separating them. Nothing
 * here changes a reading: the grid reads **0 cells whose READING differs** and
 * **0 cells differing in any PARSE respect** across 83,037 cells.
 *
 * The remedy is at the de-identify boundary and it removes rather than
 * downgrading the stamp. PS3.5 2026c §7.8.1 makes an Item a self-contained Data
 * Set and scopes a private block reservation to it ("The scope of the reservation
 * is just within the Item. Items do not inherit the Private Data Element
 * reservations made by Private Creator Data Elements in the Data Set in which the
 * Item is nested"), so when the file contradicts itself about where the Item ends
 * there is no determined answer to which reservation covers an element. PS3.15
 * 2026c §E.3.10 licenses retention only for what is **known** safe - "Private
 * Attributes that are known by the de-identifier to be safe from identity leakage
 * shall be retained, together with the Private Creator IDs that are required to
 * fully define the retained Private Attributes; all other Private Attributes
 * shall be removed **or processed in the element-specific manner recommended by
 * Deidentification Action (0008,0307), if present within Private Data Element
 * Characteristics Sequence (0008,0300)**" - a two-branch clause, of which removal
 * is the branch available here (`(0008,0307)` is not implemented). So the
 * standard's own default applies and the value goes.
 *
 * ## The EJECT direction, closed by `DICOM-ITEM-EJECT-ROUTE`
 *
 * `#66` shipped with two routes open, both found by its pass-1
 * `conformance-refuter` grade and both pinned here as residual tests that
 * asserted the **leaking** behaviour. The **eject** direction - an Item that
 * *under*-declares pushing its trailing elements out into the enclosing Data
 * Set, which `#66` did not narrow - is now closed by `settledBound`, and those two
 * residuals were rewritten to assert the closure. The
 * **private-`SQ` carve-out** (`keepsPrivate` decides before the descent, so a
 * vouched-for private `SQ` is kept verbatim and never walked) is **untouched and
 * still leaks**, pinned at the bottom of this file. Read the headline as "the
 * absorb and eject directions are closed", never as "the class is closed".
 *
 * The eject remedy is a **positional** cut inside each Data Set, at every depth:
 * everything a Data Set holds after the first sequence whose own contents
 * contradict its declared extent is refused a private reservation, and anything
 * ahead of it is untouched. Two predicates are needed, because the parser records
 * the same contradiction two ways: `rawBytes.length > length` under Explicit VR,
 * and a refused descent (`items === undefined`, `DICOM_SQ_NOT_DESCENDED`) under
 * Implicit VR LE, where nothing over-runs at all. And the cut needs **two bounds**
 * rather than one, because a Data Set is a `Map<Tag, Element>`: an ejected element
 * whose tag the Data Set already holds overwrites in place and inherits the
 * earlier position, so `Element.byteOffset` is checked beside the index.
 *
 * ## The direction argument is FALSE and is not restated
 *
 * `#51` asserted in five artifacts that following §7.5.1 is the *fail-safe* half
 * of the ambiguity. It is not: the direction is a property of **where the sender
 * put the Private Creator relative to the disputed bytes**, not of the two
 * readings. Both **absorb** placements are pinned below (`creator in the Item`
 * and `creator at the root`) and both are refused, as is the **eject** placement
 * since `DICOM-ITEM-EJECT-ROUTE`. **That is still not "the ambiguity is safe in
 * one direction"** - each direction was closed by its own measured remedy, and
 * the private-`SQ` carve-out shows the class is not closed by either.
 *
 * ## The price, and it is measured
 *
 * `scripts/measure-sq-bound-grid.ts` gained a `priv|` family - the first
 * population in that harness to run `RetainSafePrivate` at all, which is why
 * three earlier refuter passes read "0 PHI regressions" off it while this was
 * live. Against `164eb39`: **58 -> 0** cells keep a private value inside an Item
 * on a file that contradicts itself, **20 of those 58 are `both-in-item`** - the
 * creator and the data element were both genuine Item content and the
 * reservation was real, so those 20 pay for the guarantee and gain nothing.
 * Retention on files that do **not** contradict themselves is unchanged: 6 -> 6
 * inside an Item, 9 -> 9 at the root, and 0 -> 0 rows kept with no creator in
 * scope. 0 Implicit VR LE cells changed (a free control - that path slices the
 * item stream, so no Item can over-run its sequence).
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import type { DeidentifyOptions } from "../../src/deident/types.js";
import {
  Dataset,
  DicomParseError,
  WARNING_CODES,
  deidentify,
  parseDicom,
  profiles,
  serializeDicom,
} from "../../src/index.js";
import { buildDicom } from "../helpers/build-dicom.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** Synthetic. `profiles.ge` documents `(0009,xx01)` under this creator as `LO FullFidelity`. */
const CREATOR = "GEMS_IDEN_01";
const CREATOR_TAG = "00090010";
const PRIVATE_TAG = "00091001";
const SECRET = "SECRET-PRIVATE-PHI";

/**
 * A second, distinct private value the ROOT's own reservation carries, so the
 * `Map<Tag, Element>` collision shapes can tell "the Item's copy survived" apart
 * from "the root's own copy survived". One marker for both would make those
 * tests vacuous.
 */
const ROOT_PRIVATE = "ROOT-PRIVATE-VALUE";

/** `(0008,1115)` has no Table E.1-1 row, so `deidentify()` recurses into it. */
const CARRIER = "00081115";

const GE_RETAIN: DeidentifyOptions = { retain: ["RetainSafePrivate"], profile: profiles.ge };

function ascii(s: string): Buffer {
  return Buffer.from(s.length % 2 === 0 ? s : `${s} `, "ascii");
}

/**
 * On-wire size of a short-form Explicit VR element: 8-byte header + even value.
 * Implicit VR LE's header is 8 bytes too, so one number covers all three
 * syntaxes for the `LO` elements used here.
 */
function wireSize(value: string): number {
  return 8 + ascii(value).length;
}

const creatorEl = { tag: CREATOR_TAG, vr: "LO" as const, value: ascii(CREATOR) };
const secretEl = { tag: PRIVATE_TAG, vr: "LO" as const, value: ascii(SECRET) };
const sopEl = { tag: "00080018", vr: "UI" as const, value: Buffer.from("1.2.3.4\0") };
const nameEl = { tag: "00100010", vr: "PN" as const, value: ascii("ROOT^PATIENT") };

interface Outcome {
  readonly removedPrivateTags: readonly string[];
  readonly secretInOutput: boolean;
  readonly rootPrivateInOutput: boolean;
  readonly identityRemoved: string | undefined;
  readonly parseWarnings: readonly string[];
}

function run(buf: Buffer, options: DeidentifyOptions = GE_RETAIN): Outcome {
  const ds = parseDicom(buf);
  const { dataset, report } = deidentify(ds, options);
  const bytes = serializeDicom(dataset);
  return {
    removedPrivateTags: report.removedPrivateTags,
    secretInOutput: bytes.includes(ascii(SECRET)),
    rootPrivateInOutput: bytes.includes(ascii(ROOT_PRIVATE)),
    identityRemoved: dataset.get("00120062")?.rawBytes.toString("latin1").trimEnd(),
    parseWarnings: ds.warnings.map((w) => w.code),
  };
}

/**
 * The leaking arrangement and its honest counterpart, differing **only** in the
 * Item's declared length. `itemDelta` of `wireSize(SECRET)` makes the Item absorb
 * the root's `(0009,1001)`; `0` leaves it at the root.
 */
function creatorInItem(ts: string, itemDelta: number, sqDelta = 0): Buffer {
  return buildDicom({
    transferSyntax: ts,
    elements: [
      nameEl,
      {
        tag: CARRIER,
        declaredLengthDelta: sqDelta,
        items: [{ declaredLengthDelta: itemDelta, elements: [sopEl, creatorEl] }],
      },
      secretEl,
    ] as never,
  });
}

/** The mirror: the data element is genuine Item content and the CREATOR follows the sequence. */
function creatorAtRoot(ts: string, itemDelta: number): Buffer {
  return buildDicom({
    transferSyntax: ts,
    elements: [
      nameEl,
      {
        tag: CARRIER,
        items: [{ declaredLengthDelta: itemDelta, elements: [sopEl, secretEl] }],
      },
      creatorEl,
    ] as never,
  });
}

/** Both elements genuine Item content: a conformant reservation inside the Item. */
function bothInItem(ts: string, itemDelta = 0, sqDelta = 0): Buffer {
  return buildDicom({
    transferSyntax: ts,
    elements: [
      nameEl,
      {
        tag: CARRIER,
        declaredLengthDelta: sqDelta,
        items: [{ declaredLengthDelta: itemDelta, elements: [sopEl, creatorEl, secretEl] }],
      },
    ] as never,
  });
}

describe("DICOM-PRIVATE-CREATOR-RESERVATION-LEAK", () => {
  describe("the reproduction: a Private Creator inside an Item's genuine content", () => {
    it.each([
      ["Explicit VR LE", EXPLICIT_LE],
      ["Explicit VR BE", EXPLICIT_BE],
    ])(
      "%s: an Item that over-runs its sequence does not lend its reservation to the swallowed element",
      (_label, ts) => {
        const out = run(creatorInItem(ts, wireSize(SECRET)));

        expect(out.removedPrivateTags).toContain(PRIVATE_TAG);
        expect(out.secretInOutput).toBe(false);
        // The stamp stays YES because the redaction it attests to now happened.
        expect(out.identityRemoved).toBe("YES");
      },
    );

    it.each([
      ["Explicit VR LE", EXPLICIT_LE],
      ["Explicit VR BE", EXPLICIT_BE],
    ])("%s: the honest control removes it the same way, and parses silently", (_label, ts) => {
      const out = run(creatorInItem(ts, 0));

      expect(out.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(out.secretInOutput).toBe(false);
      expect(out.parseWarnings).toEqual([]);
    });

    it("the lying file now announces itself, and `#66` still did not rely on that", () => {
      // 🛑 THIS TEST USED TO ASSERT `parseWarnings` WAS EMPTY, and that was true
      // when `#66` shipped: nothing about the file announced itself, so
      // `report.removedPrivateTags` had to be the audit channel and the remedy
      // had to be structural. `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` then added
      // `DICOM_ITEM_CROSSES_SEQUENCE_END`, which fires on exactly this shape.
      //
      // `#66`'s argument is unchanged by that and deliberately so: it reads two
      // fields the parser recorded, never `ds.warnings`. What moved is the
      // operator's visibility, not the remedy.
      const out = run(creatorInItem(EXPLICIT_LE, wireSize(SECRET)));
      expect(out.parseWarnings).toEqual(["DICOM_ITEM_CROSSES_SEQUENCE_END"]);
      expect(out.removedPrivateTags).toContain(PRIVATE_TAG);
    });
  });

  describe("the mirror direction, which the refused `#51` claimed was fail-safe", () => {
    it.each([
      ["Explicit VR LE", EXPLICIT_LE],
      ["Explicit VR BE", EXPLICIT_BE],
    ])("%s: an Item that swallows the ROOT's creator gains no reservation", (_label, ts) => {
      const out = run(creatorAtRoot(ts, wireSize(CREATOR)));

      expect(out.removedPrivateTags).toContain(PRIVATE_TAG);
      expect(out.secretInOutput).toBe(false);
      expect(out.identityRemoved).toBe("YES");
    });

    it("its honest control removes it too: an Item declaring no creator of its own has none", () => {
      const out = run(creatorAtRoot(EXPLICIT_LE, 0));
      expect(out.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(out.secretInOutput).toBe(false);
    });
  });

  describe("what must NOT change - the over-removal controls", () => {
    it.each([
      ["Explicit VR LE", EXPLICIT_LE],
      ["Explicit VR BE", EXPLICIT_BE],
      ["Implicit VR LE", IMPLICIT_LE],
    ])("%s: a conformant reservation inside an Item is still retained", (_label, ts) => {
      const out = run(bothInItem(ts));

      expect(out.removedPrivateTags).toEqual([]);
      expect(out.secretInOutput).toBe(true);
    });

    it("a file whose two length fields lie by the SAME amount does not contradict itself", () => {
      // The Item's declared end still coincides with the sequence's declared end,
      // so this is a conformant file that simply puts both elements in the Item.
      // A remedy keyed on "any non-zero delta" would empty it; this one does not.
      const delta = wireSize(SECRET);
      const out = run(creatorInItem(EXPLICIT_LE, delta, delta));

      expect(out.removedPrivateTags).toEqual([]);
      expect(out.secretInOutput).toBe(true);
    });

    it("a root reservation the sender wrote at the root survives an over-running sequence", () => {
      // Narrow, and deliberately so. An earlier version of this test was named
      // "the ROOT Data Set's reservations survive an over-running sequence
      // elsewhere" and was cited as the pin for the claim that nothing is ever
      // moved OUT of an Item into the enclosing Data Set. That claim is false
      // (see the `eject` residual below) and this test could never have caught
      // it: the creator here is already at the root and the item only absorbs.
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          creatorEl,
          secretEl,
          {
            tag: CARRIER,
            items: [{ declaredLengthDelta: wireSize("MR"), elements: [sopEl] }],
          },
          { tag: "00080060", vr: "CS", value: ascii("MR") },
        ] as never,
      });
      const out = run(buf);

      expect(out.removedPrivateTags).toEqual([]);
      expect(out.secretInOutput).toBe(true);
    });

    it("Implicit VR LE is untouched: its item stream is sliced, so no Item can over-run", () => {
      const lying = run(creatorInItem(IMPLICIT_LE, wireSize(SECRET)));
      const honest = run(creatorInItem(IMPLICIT_LE, 0));

      expect(lying.removedPrivateTags).toEqual(honest.removedPrivateTags);
      expect(lying.secretInOutput).toBe(false);
      expect(honest.secretInOutput).toBe(false);
    });
  });

  describe("the refusal propagates to every depth below the disputed Item", () => {
    it("a creator and its block two levels down are removed when the OUTER sequence over-runs", () => {
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          {
            tag: CARRIER,
            items: [
              {
                declaredLengthDelta: wireSize("MR"),
                elements: [{ tag: "00089215", items: [{ elements: [creatorEl, secretEl] }] }],
              },
            ],
          },
          { tag: "00080060", vr: "CS", value: ascii("MR") },
        ] as never,
      });
      const out = run(buf);

      expect(out.removedPrivateTags).toContain(PRIVATE_TAG);
      expect(out.secretInOutput).toBe(false);
    });

    it("the same nesting with no length lie retains it", () => {
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          {
            tag: CARRIER,
            items: [
              {
                elements: [{ tag: "00089215", items: [{ elements: [creatorEl, secretEl] }] }],
              },
            ],
          },
          { tag: "00080060", vr: "CS", value: ascii("MR") },
        ] as never,
      });
      const out = run(buf);

      expect(out.removedPrivateTags).toEqual([]);
      expect(out.secretInOutput).toBe(true);
    });
  });

  describe("no other option or profile reopens it", () => {
    it("the Basic Profile alone (no RetainSafePrivate) removes it on the lying file", () => {
      const out = run(creatorInItem(EXPLICIT_LE, wireSize(SECRET)), {});
      expect(out.removedPrivateTags).toContain(PRIVATE_TAG);
      expect(out.secretInOutput).toBe(false);
    });

    it.each([
      ["RetainUIDs"],
      ["RetainDeviceIdentity"],
      ["RetainInstitutionIdentity"],
      ["RetainPatientCharacteristics"],
      ["RetainLongitudinalTemporal"],
    ])("%s + a profile does not retain it (RetainSafePrivate is the only such route)", (opt) => {
      const out = run(creatorInItem(EXPLICIT_LE, wireSize(SECRET)), {
        retain: [opt] as never,
        profile: profiles.ge,
      });
      expect(out.removedPrivateTags).toContain(PRIVATE_TAG);
      expect(out.secretInOutput).toBe(false);
    });

    it("`RetainSafePrivate` with NO profile retains nothing, lying file or not", () => {
      for (const delta of [0, wireSize(SECRET)]) {
        const out = run(creatorInItem(EXPLICIT_LE, delta), { retain: ["RetainSafePrivate"] });
        expect(out.removedPrivateTags).toContain(PRIVATE_TAG);
        expect(out.secretInOutput).toBe(false);
      }
    });

    it("a Siemens block behaves identically under `profiles.siemens`", () => {
      // Same mechanism, a different vendor overlay: the rule is about the Data
      // Set boundary, not about which profile vouched.
      const siemensCreator = {
        tag: "00290010",
        vr: "LO" as const,
        value: ascii("SIEMENS MEDCOM HEADER"),
      };
      const siemensPrivate = { tag: "00291009", vr: "LO" as const, value: ascii(SECRET) };
      const opts: DeidentifyOptions = {
        retain: ["RetainSafePrivate"],
        profile: profiles.siemens,
      };
      const build = (itemDelta: number): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            {
              tag: CARRIER,
              items: [{ declaredLengthDelta: itemDelta, elements: [sopEl, siemensCreator] }],
            },
            siemensPrivate,
          ] as never,
        });

      // Control first: the profile really does vouch for this tag, so the test
      // below cannot pass vacuously.
      const conformant = parseDicom(
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [nameEl, siemensCreator, siemensPrivate] as never,
        }),
      );
      expect(deidentify(conformant, opts).report.removedPrivateTags).toEqual([]);

      const out = run(build(wireSize(SECRET)), opts);
      expect(out.removedPrivateTags).toContain("00291009");
      expect(out.secretInOutput).toBe(false);
    });
  });

  describe("the adjacent shapes, pinned so they cannot regress silently", () => {
    it("a Private Creator that over-declares and swallows its own block is removed", () => {
      // Pre-existing and fail-safe by construction rather than by this rule: the
      // swallowed bytes are inside the creator's VALUE, so the decoded creator is
      // no longer `GEMS_IDEN_01` and no profile entry matches it.
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          { ...creatorEl, declaredLengthDelta: wireSize(SECRET) },
          secretEl,
        ] as never,
      });
      const out = run(buf);

      expect(out.removedPrivateTags).toEqual([CREATOR_TAG]);
      expect(out.secretInOutput).toBe(false);
    });

    it("the creator of a disputed Item is removed with its block", () => {
      // PS3.5 2026c §7.8.1, in a `<note>` and therefore INFORMATIVE (measured:
      // one unclosed `<note` between the section start and the sentence): "if a
      // block of Private Data Elements is entirely removed, **such as during
      // de-identification,** the corresponding Private Creator Data Element does
      // not need to be removed, though it may be." Cited as a Note, so it
      // permits rather than requires. Removing it keeps the output
      // self-consistent.
      const out = run(creatorInItem(EXPLICIT_LE, wireSize(SECRET)));
      expect(out.removedPrivateTags).toContain(CREATOR_TAG);
    });
  });

  /**
   * `DICOM-ITEM-EJECT-ROUTE`: the mirror direction, closed here.
   *
   * These tests were the **residuals** this file shipped with. They asserted the
   * leaking behaviour so that closing the route would turn them red, and it did;
   * what follows is the same fixtures with the outcome inverted, plus the two
   * shapes the residual never covered. The private-`SQ` carve-out below is
   * untouched and still leaks.
   */
  describe("the EJECT direction: what a disputed sequence pushes OUT", () => {
    it.each([
      ["Explicit VR LE", EXPLICIT_LE],
      ["Explicit VR BE", EXPLICIT_BE],
    ])(
      "%s: an Item that UNDER-declares ejects its creator into the root, which reserves nothing there",
      (_label, ts) => {
        // Measured on `300af87` before the remedy: `removedPrivateTags: []`, the
        // value in the serialized output, `(0012,0062) = YES`. The creator the
        // sender wrote as Item content lands at the root, where the private data
        // element genuinely is, and vouches for it on a reservation PS3.5 2026c
        // §7.8.1 scopes to the Item it was written in.
        const buf = buildDicom({
          transferSyntax: ts,
          elements: [
            nameEl,
            {
              tag: CARRIER,
              declaredLengthDelta: -24,
              items: [
                {
                  declaredLengthDelta: -wireSize(CREATOR),
                  elements: [{ tag: "00080008", vr: "CS", value: ascii("ORIGINAL") }, creatorEl],
                },
              ],
            },
            secretEl,
          ] as never,
        });
        const out = run(buf);

        expect(out.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
        expect(out.secretInOutput).toBe(false);
        // The stamp stays YES because the redaction it attests to now happens.
        expect(out.identityRemoved).toBe("YES");

        // The posture of the file itself is unchanged by this slice - nothing
        // here touches the parser. Pinned because the item filed for this route
        // described it as silent on every channel including `{ strict: true }`,
        // which was true when `#66` filed it and is not true now:
        // `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` added the disclosure that
        // fires on this shape. Do not carry the old sentence forward.
        expect(out.parseWarnings).toEqual(["DICOM_ITEM_CROSSES_SEQUENCE_END"]);
        expect(() => parseDicom(buf, { strict: true })).toThrow(DicomParseError);
      },
    );

    it("Implicit VR LE ejects the same way with NO over-run recorded, which is why it is a second predicate", () => {
      // 🩺 THE MECHANISM THAT MADE THIS ITS OWN SLICE RATHER THAN A WIDENING OF
      // THE ABSORB RULE. `itemStreamOverrunsSequence` reads `false` here: the
      // Implicit VR LE path slices the item stream to the sequence's declared
      // Value Length, so `rawBytes.length === length` and nothing over-runs.
      // What happens instead is that the item does not fit the slice, the
      // descent is refused (`DICOM_SQ_NOT_DESCENDED`, `items === undefined`),
      // and the 20 bytes the sender encoded as Item content are read as ROOT
      // elements. Measured on `300af87`: `removedPrivateTags: []` with the value
      // in the output.
      const build = (sqDelta: number): Buffer =>
        buildDicom({
          transferSyntax: IMPLICIT_LE,
          elements: [
            nameEl,
            {
              tag: CARRIER,
              declaredLengthDelta: sqDelta,
              items: [
                {
                  elements: [{ tag: "00080008", vr: "CS", value: ascii("ORIGINAL") }, creatorEl],
                },
              ],
            },
            secretEl,
          ] as never,
        });

      // 🛑 NON-VACUITY CONTROL, AND IT IS NOT THE HONEST FILE. The honest
      // control here removes the secret for an unrelated reason - the creator
      // really is inside the Item, so the root's private element has no creator
      // at all - which would let this test pass against a build that retains
      // nothing under Implicit VR LE. So the control is a CONFORMANT file whose
      // reservation and data element are both at the root: it must be RETAINED,
      // proving `RetainSafePrivate` + `profiles.ge` can keep a value under this
      // transfer syntax.
      const conformant = run(
        buildDicom({
          transferSyntax: IMPLICIT_LE,
          elements: [nameEl, creatorEl, secretEl] as never,
        }),
      );
      expect(conformant.removedPrivateTags).toEqual([]);
      expect(conformant.secretInOutput).toBe(true);

      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(honest.secretInOutput).toBe(false);

      const lying = run(build(-wireSize(CREATOR)));
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.secretInOutput).toBe(false);
      expect(lying.parseWarnings).toContain("DICOM_SQ_NOT_DESCENDED");
    });

    it("it is EVERY still-usable Data Set, not the root: an inner sequence ejects into the enclosing Item", () => {
      // 🛑 THE SCOPE REQUIREMENT THE ITEM WAS FILED WITH, AND A ROOT-SCOPED
      // REMEDY WOULD READ GREEN WITHOUT IT. The disputed sequence is one level
      // down; the Data Set that receives the ejected creator is the enclosing
      // Item, which no flag narrows - `reservationsUsable` is still `true` there
      // because the OUTER sequence is honest. Measured on `300af87`:
      // `removedPrivateTags: []` with the value in the output.
      const build = (innerDelta: number, itemDelta: number): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            {
              tag: CARRIER,
              items: [
                {
                  elements: [
                    sopEl,
                    {
                      tag: "00089215",
                      declaredLengthDelta: innerDelta,
                      items: [
                        {
                          declaredLengthDelta: itemDelta,
                          elements: [
                            { tag: "00080008", vr: "CS", value: ascii("ORIGINAL") },
                            creatorEl,
                          ],
                        },
                      ],
                    },
                    secretEl,
                  ],
                },
              ],
            },
          ] as never,
        });

      // Control: with no length lie the creator stays in the inner Item, so the
      // outer Item's private element has no reservation and is removed. Note
      // what this control does and does not prove - the "both in the same Item"
      // retention is proved by the conformant control in the over-removal block
      // above, not here.
      const honest = run(build(0, 0));
      expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(honest.secretInOutput).toBe(false);

      const lying = run(build(-24, -wireSize(CREATOR)));
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.secretInOutput).toBe(false);
      expect(lying.identityRemoved).toBe("YES");
    });

    it.each([
      ["Explicit VR LE", EXPLICIT_LE, -30, -26],
      ["Implicit VR LE", IMPLICIT_LE, -26, 0],
    ])(
      "%s: an ejected element that COLLIDES with a tag the Data Set already holds is refused too",
      (_label, ts, sqDelta, itemDelta) => {
        // 🛑 THE SHAPE AN INDEX CUT ALONE CANNOT SEE, AND IT IS WHY
        // `settledBound` CARRIES A BYTE OFFSET AS WELL. The enclosing Data Set is
        // a `Map<Tag, Element>`: when the ejected element carries a tag the Data
        // Set already holds, `Map.set` overwrites in place and the newcomer
        // inherits the earlier element's POSITION, ahead of the sequence it came
        // out of. Measured here: the ejected `(0009,1001)` sits at index 2 with
        // `byteOffset` 274 while the sequence sits at index 3 with `byteOffset`
        // 238. Those two numbers are properties of THIS fixture's File Meta
        // length; a pass-2 grade read 292 off a fixture carrying more of it. The
        // argument is the inequality, not the numerals. `Element.byteOffset` is the position the parser counted and the
        // overwrite cannot move it. `PRE-EXISTING` and leaking on `300af87`
        // (`removedPrivateTags: []`, the value in the output).
        //
        // 🩺 AND IT DESTROYS THE ROOT'S OWN VALUE ON THE WAY IN. The overwrite
        // replaces the reservation's genuine root element with the Item's, at
        // parse time - the `Map<Tag, Element>` substitution already recorded for
        // `(0010,0020)`, reached here on the private path. `#69` did not fix it
        // and it is asserted below so it cannot be mistaken for something that
        // remedy handled. **It is no longer SILENT:**
        // `DICOM-TAG-COLLISION-DESTROYS-ELEMENT` made the parse report it as
        // `DICOM_DUPLICATE_TAG_IN_DATA_SET`, asserted here as well, and the
        // substitution itself is unchanged. Full coverage of the disclosure is
        // in `test/integration/tag-collision.test.ts`.
        const build = (sq: number, item: number): Buffer =>
          buildDicom({
            transferSyntax: ts,
            elements: [
              nameEl,
              creatorEl,
              { tag: PRIVATE_TAG, vr: "LO", value: ascii(ROOT_PRIVATE) },
              {
                tag: CARRIER,
                declaredLengthDelta: sq,
                items: [{ declaredLengthDelta: item, elements: [sopEl, secretEl] }],
              },
            ] as never,
          });

        // Control: no lie, so the Item's copy stays inside the Item and the
        // root's own reservation is retained with its own value intact.
        // The Item's own copy has no creator inside the Item, so it is removed
        // on both files; the root's own reservation is what differs.
        const honest = run(build(0, 0));
        expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG]);
        expect(honest.secretInOutput).toBe(false);
        expect(honest.rootPrivateInOutput).toBe(true);

        const lying = run(build(sqDelta, itemDelta));
        expect(lying.removedPrivateTags).toEqual([PRIVATE_TAG]);
        expect(lying.secretInOutput).toBe(false);
        // The substitution, pinned rather than described: the root's own value
        // is gone from the parsed object before `deidentify()` is ever called,
        // so no remedy at this boundary can bring it back - and the parse now
        // says so, on the honest control as well (it must NOT fire there).
        const lyingParse = parseDicom(build(sqDelta, itemDelta));
        expect(lyingParse.get(PRIVATE_TAG)?.rawBytes.toString("latin1")).toBe(SECRET);
        expect(lyingParse.warnings.map((w) => w.code)).toContain(
          WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
        );
        expect(parseDicom(build(0, 0)).warnings.map((w) => w.code)).not.toContain(
          WARNING_CODES.DICOM_DUPLICATE_TAG_IN_DATA_SET,
        );
        expect(lying.rootPrivateInOutput).toBe(false);
      },
    );

    it("the same collision on the CREATOR flips a genuine root element from removed to retained on base", () => {
      // The mirror of the shape above: the root's creator is one no profile
      // vouches for, and the ejected creator that overwrites it IS vouched for -
      // so on `300af87` the root's own private element went from removed to
      // retained (`removedPrivateTags: []`, `ROOT-PRIVATE-VALUE` in the output).
      // The creator map is now built from the settled run only, so an ejected
      // creator reserves nothing.
      const build = (delta: number): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            { tag: CREATOR_TAG, vr: "LO", value: ascii("NOT_A_KNOWN_CRTR") },
            { tag: PRIVATE_TAG, vr: "LO", value: ascii(ROOT_PRIVATE) },
            {
              tag: CARRIER,
              declaredLengthDelta: delta === 0 ? 0 : -24,
              items: [{ declaredLengthDelta: delta, elements: [sopEl, creatorEl] }],
            },
          ] as never,
        });

      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(honest.rootPrivateInOutput).toBe(false);

      const lying = run(build(-wireSize(CREATOR)));
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.rootPrivateInOutput).toBe(false);
    });

    it("THE PRICE, pinned: a genuine ROOT reservation written AFTER the sequence is refused too", () => {
      // 🩺 THE COST OF THIS SLICE, AND IT IS NOT ZERO. Both the creator and its
      // data element are at the root and the reservation is real, but they were
      // read from bytes the file's own contents do not settle the ownership of,
      // so they are refused. Over-removal, in the fail-safe direction, and named
      // on `report.removedPrivateTags` rather than dropped silently.
      //
      // The mirror control - the same reservation written BEFORE the sequence -
      // is the "a root reservation the sender wrote at the root survives an
      // over-running sequence" test above, which stays green. That pair is what
      // makes the cut POSITIONAL rather than per-Data-Set, and the grid cannot
      // see the difference: every `priv|` fixture puts the private block after
      // the sequence, so the whole-Data-Set variant measures identically there
      // and differs on exactly 5 tests over the full suite: the mirror control
      // named above ("a root reservation the sender wrote at the root survives
      // an over-running sequence"), both collision rows, and both private-SQ
      // carve-out residuals (the second in
      // `deident-unauditable-sequence.test.ts`, which belongs to a different
      // item). NOT this test, which passes under that variant. Count it over the
      // suite, never over this file.
      const build = (itemDelta: number): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            { tag: CARRIER, items: [{ declaredLengthDelta: itemDelta, elements: [sopEl] }] },
            { tag: "00080060", vr: "CS", value: ascii("MR") },
            creatorEl,
            secretEl,
          ] as never,
        });

      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual([]);
      expect(honest.secretInOutput).toBe(true);

      const lying = run(build(wireSize("MR")));
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.secretInOutput).toBe(false);
    });
  });

  /**
   * The route this slice does NOT close, pinned as a residual rather than
   * asserted away. It is `PRE-EXISTING`, reproduces identically on `164eb39`,
   * and puts a private value into output stamped `PatientIdentityRemoved = YES`
   * with `report.removedPrivateTags: []`.
   *
   * This test asserts the CURRENT, LEAKING behaviour on purpose. When it is
   * fixed it goes red, which is the point: a residual nobody can see is how the
   * defect this file exists for survived three refuter passes.
   */
  describe("still leaking, measured, and its own item", () => {
    it("RESIDUAL - a private SQ the profile vouches for is kept verbatim, so the descent never runs", () => {
      // `keepsPrivate` decides before `descendSequence`, so `reservationsUsable`
      // is never carried into this carrier's items. Exactly the carve-out `#54`
      // was refused for asserting away, and it is why the "every private element
      // in such an Item is removed" sentence is qualified everywhere it appears.
      const build = (itemDelta: number): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            creatorEl,
            // (0009,1001) is `LO FullFidelity` in profiles.ge, so the profile
            // vouches for this carrier and it is kept whole.
            { tag: PRIVATE_TAG, items: [{ declaredLengthDelta: itemDelta, elements: [sopEl] }] },
            // A different group, with no creator reserving block 0x11 anywhere.
            { tag: "00291101", vr: "LO", value: ascii(SECRET) },
          ] as never,
        });

      // Control: with no length lie the orphan private element is removed.
      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual(["00291101"]);
      expect(honest.secretInOutput).toBe(false);
      expect(honest.parseWarnings).toEqual([]);

      // Residual: the over-run pulls it inside the vouched-for carrier, which is
      // blitted verbatim.
      const lying = run(build(wireSize(SECRET)));
      expect(lying.removedPrivateTags).toEqual([]);
      expect(lying.secretInOutput).toBe(true);
      expect(lying.identityRemoved).toBe("YES");

      // 🛑 PIN THE WARNING CHANNEL, AND THIS ASSERTION IS WHY THE ROW ABOVE IT
      // EXISTS. This test asserted the leak and never the warnings, so a
      // troubleshooting sentence calling this shape "silent" went unchecked and
      // shipped. It is NOT silent: this fixture is an Explicit VR LE
      // defined-length `SQ` whose item over-declares with a trailing root
      // element, which is exactly `DICOM_ITEM_CROSSES_SEQUENCE_END`'s trigger.
      // Read it with the three lines above: a warning fires AND the object is
      // stamped `PatientIdentityRemoved=YES` while still carrying the private
      // value, so the warning is the only signal and is not an all-clear.
      expect(lying.parseWarnings).toEqual(["DICOM_ITEM_CROSSES_SEQUENCE_END"]);
    });
  });

  /**
   * Two costs the pass-2 gate found that the priced 20 does not include. Both are
   * over-removal (fail-safe), both are named on `report.removedPrivateTags`, and
   * both are pinned because a sentence would not survive the next slice that adds
   * a transfer syntax or a second item shape.
   */
  describe("costs outside the priced 20, pinned", () => {
    it("the unit is the SEQUENCE, not the Item: an honest item loses its block when a sibling over-runs", () => {
      const build = (siblingDelta: number): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            {
              tag: CARRIER,
              items: [
                // Item 0 is honest and carries a genuine, fully reserved block.
                { elements: [creatorEl, secretEl] },
                // Item 1 over-runs by exactly the trailing root element's size.
                {
                  declaredLengthDelta: siblingDelta,
                  elements: [{ tag: "00080008", vr: "CS", value: ascii("ORIGINAL") }],
                },
              ],
            },
            { tag: "00080060", vr: "CS", value: ascii("MR") },
          ] as never,
        });

      // Control: nobody lies, item 0's block is retained.
      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual([]);
      expect(honest.secretInOutput).toBe(true);

      // `descendSequence` decides once for the whole sequence, so item 0 pays for
      // item 1's lie. Disclosed as a cost, not defended as a virtue.
      const lying = run(build(wireSize("MR")));
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.secretInOutput).toBe(false);
    });

    it("`ctx.encoding` must be the parse encoding, and nothing enforces it", () => {
      // `itemStreamOverrunsSequence` subtracts a 12-byte header under Explicit VR
      // and none under Implicit, while `rawBytes` was filled under whatever
      // syntax the parser actually read. `deidentify` takes the encoding from
      // `fileMeta.transferSyntaxUID`, so a caller who re-labels a parsed object
      // gets silent over-removal on a fully CONFORMANT file. Not reachable from
      // `parseDicom` - all four supported syntaxes map consistently - but the
      // next transfer syntax or a transcoder inherits this.
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [nameEl, { tag: CARRIER, items: [{ elements: [creatorEl, secretEl] }] }] as never,
      });
      const ds = parseDicom(buf);
      expect(deidentify(ds, GE_RETAIN).report.removedPrivateTags).toEqual([]);

      const fileMeta = ds.fileMeta;
      if (fileMeta === undefined) throw new Error("fixture must carry File Meta");
      const relabelled = new Dataset({
        warnings: ds.warnings,
        elements: new Map(ds.elements().map((el) => [el.tag, el])),
        fileMeta: { ...fileMeta, transferSyntaxUID: IMPLICIT_LE },
      });
      expect(deidentify(relabelled, GE_RETAIN).report.removedPrivateTags).toEqual([
        CREATOR_TAG,
        PRIVATE_TAG,
      ]);
    });
  });
});

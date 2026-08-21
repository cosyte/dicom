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
 * **private-`SQ` carve-out** (`keepsPrivate` decided before the descent, so a
 * vouched-for private `SQ` was kept verbatim and never walked) is closed too, by
 * `DICOM-PRIVATE-SQ-CARVE-OUT`, and its residual at the bottom of this file was
 * rewritten the same way. Read the headline as "these three routes are closed",
 * never as "the class is closed" - `CLAUDE.md`'s residual list is the census,
 * and the undefined-length `UN` whose CP-246 descent was refused is still on it.
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
 * the private-`SQ` carve-out needed a third one on top of both.
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

import type { DeidentifyOptions, UnenumerablePrivateRemoval } from "../../src/deident/types.js";
import {
  Dataset,
  DicomParseError,
  WARNING_CODES,
  defineProfile,
  deidentify,
  parseDicom,
  profiles,
  serializeDicom,
} from "../../src/index.js";
import { MAX_UNAUDITABLE_SEQUENCE_FINDINGS } from "../../src/deident/deidentify.js";
import { WARNING_MESSAGES } from "../../src/parser/warnings.js";
import type { BuildDicomOptions } from "../helpers/build-dicom.js";
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
  /**
   * The tags of `report.unenumerablePrivateRemovals`, and **the field that keeps
   * every over-removal control in this file discriminating** now that a vouched
   * carrier whose value nothing walked is removed rather than kept.
   *
   * Before that change a control asserted "the value ships" against "the value
   * goes", and the two mechanisms were told apart by the bytes. They are told
   * apart here instead, and more sharply: a reservation this run REFUSED puts
   * the tag in `removedPrivateTags` with **nothing** here (the Basic Profile
   * removed it, per PS3.15 §E.3.10's "all other Private Attributes"), while a
   * reservation it ACCEPTED and then could not enumerate puts the tag in both,
   * with a reason. A remedy that broke the reservation rule would empty this
   * array on exactly the files these controls are about.
   */
  readonly unenumerable: readonly string[];
  /** The whole removal record, for the tests that assert its per-instance shape. */
  readonly unenumerableEntries: readonly UnenumerablePrivateRemoval[];
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
    unenumerable: report.unenumerablePrivateRemovals.map((r) => r.tag),
    unenumerableEntries: report.unenumerablePrivateRemovals,
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

  /**
   * 🛑 **THESE CONTROLS NOW READ "the reservation was ACCEPTED", NOT "the value
   * ships".** An ordinary vendor scalar a profile vouches for is removed since
   * `DICOM-DEIDENT-UNENUMERATED-PRIVATE`, because nothing enumerated its value,
   * so "the value is in the output" is no longer available as the control for a
   * reservation this rule must not break. The discriminator is
   * `report.unenumerablePrivateRemovals`: a reservation this run REFUSED removes
   * the tag with no entry there, an accepted one that could not be enumerated
   * removes it WITH an entry. Weaken that to `removedPrivateTags` alone and
   * every test in this block passes against a guard that refuses every
   * reservation, which is exactly the degeneration they exist to catch.
   */
  describe("what must NOT change - the over-removal controls", () => {
    it.each([
      ["Explicit VR LE", EXPLICIT_LE],
      ["Explicit VR BE", EXPLICIT_BE],
      ["Implicit VR LE", IMPLICIT_LE],
    ])("%s: a conformant reservation inside an Item is still accepted", (_label, ts) => {
      const out = run(bothInItem(ts));

      // The value goes, because nothing walked it. What the reservation rule
      // must not do is refuse the block: the removal is recorded as
      // unenumerable, from inside the Item it lived in.
      expect(out.secretInOutput).toBe(false);
      expect(out.unenumerableEntries).toEqual([
        {
          tag: PRIVATE_TAG,
          applied: "removed",
          reason: "unenumerable",
          contextPath: [`${CARRIER}[0]`],
        },
      ]);
      // The creator itself is enumerated - its whole decoded value is a member
      // of the profile's dictionary - so it is retained and never recorded.
      expect(out.removedPrivateTags).toEqual([PRIVATE_TAG]);
    });

    it("a file whose two length fields lie by the SAME amount does not contradict itself", () => {
      // The Item's declared end still coincides with the sequence's declared end,
      // so this is a conformant file that simply puts both elements in the Item.
      // A remedy keyed on "any non-zero delta" would refuse the reservation; this
      // one does not, and the removal below says `unenumerable` rather than
      // reading as a refusal.
      const delta = wireSize(SECRET);
      const out = run(creatorInItem(EXPLICIT_LE, delta, delta));

      expect(out.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(out.unenumerable).toEqual([PRIVATE_TAG]);
      expect(out.secretInOutput).toBe(false);
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

      // The root's own reservation is untouched by the sequence's lie: the
      // removal that follows is the unenumerable one, at the root (no
      // `contextPath`), not a refusal of the block.
      expect(out.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(out.unenumerableEntries).toEqual([
        { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
      ]);
      expect(out.secretInOutput).toBe(false);
    });

    it("Implicit VR LE is untouched: its item stream is sliced, so no Item can over-run", () => {
      const lying = run(creatorInItem(IMPLICIT_LE, wireSize(SECRET)));
      const honest = run(creatorInItem(IMPLICIT_LE, 0));

      expect(lying.removedPrivateTags).toEqual(honest.removedPrivateTags);
      expect(lying.unenumerable).toEqual(honest.unenumerable);
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

    it("the same nesting with no length lie accepts the reservation", () => {
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

      // Two levels down, the reservation is real and is accepted; the value goes
      // for being unenumerable, and the record names the Data Set it was in.
      expect(out.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(out.unenumerableEntries).toEqual([
        {
          tag: PRIVATE_TAG,
          applied: "removed",
          reason: "unenumerable",
          contextPath: [`${CARRIER}[0]`, "00089215[0]"],
        },
      ]);
      expect(out.secretInOutput).toBe(false);
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
      // below cannot pass vacuously. Vouching no longer means the value ships -
      // nothing walked it, so it is removed - and the control is that the
      // removal is the UNENUMERABLE one rather than a refused reservation.
      const conformant = parseDicom(
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [nameEl, siemensCreator, siemensPrivate] as never,
        }),
      );
      const vouched = deidentify(conformant, opts).report;
      expect(vouched.unenumerablePrivateRemovals.map((r) => r.tag)).toEqual(["00291009"]);

      const out = run(build(wireSize(SECRET)), opts);
      expect(out.removedPrivateTags).toContain("00291009");
      // The disputed file's removal is a REFUSAL, so it carries no record entry:
      // the reservation was never accepted, and that is the difference this test
      // is about.
      expect(out.unenumerable).toEqual([]);
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
      // ACCEPTED, which is the property this control needs: the removal that
      // follows is the unenumerable one and not a refused reservation. The
      // creator stays, so `RetainSafePrivate` + `profiles.ge` demonstrably
      // reaches a retention decision under this transfer syntax.
      expect(conformant.unenumerable).toEqual([PRIVATE_TAG]);
      expect(conformant.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(conformant.secretInOutput).toBe(false);

      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(honest.unenumerable).toEqual([]);
      expect(honest.secretInOutput).toBe(false);

      const lying = run(build(-wireSize(CREATOR)));
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.unenumerable).toEqual([]);
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
        // root's own reservation is ACCEPTED.
        //
        // 🩺 AND THIS IS THE PER-INSTANCE SHAPE, MEASURED. Both Data Sets hold
        // `(0009,1001)` and the two are judged separately: the Item's copy has
        // no creator inside the Item, so it is REFUSED and removed with no
        // record entry, while the root's copy is vouched for, could not be
        // enumerated, and is removed WITH one - at the root, so with no
        // `contextPath`. One tag, two occurrences, two different reasons.
        const honest = run(build(0, 0));
        expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG, PRIVATE_TAG]);
        expect(honest.unenumerableEntries).toEqual([
          { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
        ]);
        expect(honest.secretInOutput).toBe(false);
        expect(honest.rootPrivateInOutput).toBe(false);

        const lying = run(build(sqDelta, itemDelta));
        expect(lying.removedPrivateTags).toEqual([PRIVATE_TAG]);
        // The ejected element is refused rather than judged, so nothing is
        // recorded as unenumerable on this row.
        expect(lying.unenumerable).toEqual([]);
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
      // an over-running sequence"), both collision rows, and both private-`SQ`
      // carve-out tests (the second in
      // `deident-unauditable-sequence.test.ts`, which belongs to a different
      // item). NOT this test, which passes under that variant. Count it over the
      // suite, never over this file.
      // Re-measured on this tree after `DICOM-PRIVATE-SQ-CARVE-OUT` rewrote two
      // of those five from asserting the leak to asserting the closure: still
      // exactly 5, and still the same five. The figure is quoted per-sha because
      // its base moves - it was taken again rather than reworded.
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
      // Accepted: the reservation is real and the removal is the unenumerable
      // one, so the creator survives beside it.
      expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(honest.unenumerable).toEqual([PRIVATE_TAG]);
      expect(honest.secretInOutput).toBe(false);

      const lying = run(build(wireSize("MR")));
      // Refused: the creator goes too, and nothing is recorded as unenumerable.
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.unenumerable).toEqual([]);
      expect(lying.secretInOutput).toBe(false);
    });
  });

  /**
   * `DICOM-PRIVATE-SQ-CARVE-OUT`, closed. These two tests asserted the
   * **leaking** behaviour until this slice; they assert the closure now, and the
   * rewrite is the argument, not a flip.
   *
   * What was live on `0.0.10`: `keepsPrivate` decided before the descent, so a
   * private `SQ` a {@link profiles} entry vouched for was handed to
   * `keepOrEmpty` and written into output **verbatim**. Nothing inside it was
   * ever examined - not the private elements the file's own length fields pulled
   * into its items, and not the plain Table E.1-1 attributes the vendor encoded
   * there. `report.removedPrivateTags` read `[]` and `(0012,0062)` read `YES`
   * over both.
   *
   * The remedy is not a widened guard: `keepsPrivate` still decides retention and
   * the profile is still the only vouching authority. A vouched-for private `SQ`
   * is simply routed through the two branches every other `SQ` in the module
   * already takes. PS3.15 2026c §E.3.10 licenses retention for "Private
   * Attributes that are known by the de-identifier to be safe from identity
   * leakage" - one private attribute, not the Data Sets nested in its value - and
   * PS3.15 2026c §E.1.1 obliges protecting Table E.1-1 attributes "whether
   * contained in the top level Data Set or embedded in an Item of a Sequence of
   * Items", which a private carrier is.
   */
  describe("DICOM-PRIVATE-SQ-CARVE-OUT: the descent runs inside a vouched-for private SQ", () => {
    it("a private element the file pulls INTO a vouched-for private SQ is refused there", () => {
      // `keepsPrivate` decides before `descendSequence` and used to end the
      // matter; `reservationsUsable` is now carried into this carrier's items,
      // so the "every private element in such an Item is removed" sentence no
      // longer needs the qualification it carried everywhere it appeared.
      const build = (itemDelta: number): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            creatorEl,
            // (0009,1001) is `LO FullFidelity` in profiles.ge, so the profile
            // vouches for this carrier. It is still retained - what changed is
            // that its items are walked rather than blitted.
            { tag: PRIVATE_TAG, items: [{ declaredLengthDelta: itemDelta, elements: [sopEl] }] },
            // A different group, with no creator reserving block 0x11 anywhere.
            { tag: "00291101", vr: "LO", value: ascii(SECRET) },
          ] as never,
        });

      // Control: with no length lie the orphan private element is removed at the
      // root, and this row was green before the slice too. It is here to keep the
      // pair honest - a lying fixture with no honest twin proves nothing about
      // which input the code is reacting to.
      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual(["00291101"]);
      expect(honest.secretInOutput).toBe(false);
      expect(honest.parseWarnings).toEqual([]);

      // Closed: the over-run pulls it inside the vouched-for carrier, and the
      // descent refuses it there. `removedPrivateTags` names it from inside the
      // Item rather than reading `[]`, so the attestation is earned.
      const lying = run(build(wireSize(SECRET)));
      expect(lying.removedPrivateTags).toEqual(["00291101"]);
      expect(lying.secretInOutput).toBe(false);
      expect(lying.identityRemoved).toBe("YES");

      // 🛑 PIN THE WARNING CHANNEL ON BOTH ROWS, AND THIS ASSERTION IS WHY THE
      // PAIR EXISTS. The predecessor asserted the leak and never the warnings, so
      // a troubleshooting sentence calling this shape "silent" went unchecked and
      // shipped. It is NOT silent, and it is not silent now either: an Explicit VR
      // LE defined-length `SQ` whose item over-declares with a trailing root
      // element is exactly `DICOM_ITEM_CROSSES_SEQUENCE_END`'s trigger. The
      // warning is unchanged by this slice - nothing here touches a reading - so
      // it is still the parse-side signal, and the de-identify side no longer
      // contradicts it.
      expect(lying.parseWarnings).toEqual(["DICOM_ITEM_CROSSES_SEQUENCE_END"]);
    });

    it("🩺 a NAME the vendor encoded inside a vouched-for private SQ is de-identified, on a CONFORMANT file", () => {
      // The half of this defect that needs no length lie at all, and the sharper
      // half: PS3.15 §E.1.1 obliges protecting Table E.1-1 attributes "embedded
      // in an Item of a Sequence of Items", and a private carrier is one. On
      // `0.0.10` this file parsed clean, warned nothing, and wrote the patient's
      // name into de-identified output under `PatientIdentityRemoved = YES`.
      //
      // Name-bearing on purpose. A payload with no name cannot fail this
      // assertion for the reason it claims to, and this repo has shipped two PHI
      // pins that were vacuous by fixture.
      const NESTED_NAME = "BOND^JAMES";
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          creatorEl,
          {
            tag: PRIVATE_TAG,
            items: [
              {
                elements: [
                  sopEl,
                  { tag: "00100010", vr: "PN", value: ascii(NESTED_NAME) },
                  { tag: "00100020", vr: "LO", value: ascii("MRN-11111") },
                ],
              },
            ],
          },
        ] as never,
      });

      // Non-vacuity, first: the name really is in the file, really is inside the
      // sequence's item, and the file really is conformant. Without these three
      // the assertions below could pass on a fixture that never posed the
      // question.
      const ds = parseDicom(buf);
      expect(ds.warnings).toEqual([]);
      expect(serializeDicom(ds).toString("latin1")).toContain(NESTED_NAME);
      expect(
        ds
          .get(PRIVATE_TAG)
          ?.items?.[0]?.elements()
          .map((el) => el.tag),
      ).toEqual(["00080018", "00100010", "00100020"]);

      const { dataset, report } = deidentify(ds, GE_RETAIN);
      const bytes = serializeDicom(dataset).toString("latin1");
      expect(bytes).not.toContain(NESTED_NAME);
      expect(bytes).not.toContain("MRN-11111");
      expect(dataset.get("00120062")?.rawBytes.toString("latin1").trimEnd()).toBe("YES");

      // The carrier is still RETAINED - the profile's vouching is untouched, and
      // a remedy that dropped the whole private element would be a different,
      // over-removing change. It is the contents that were acted on, and the
      // audit says so with the nested `contextPath`.
      expect(dataset.get(PRIVATE_TAG)?.vr).toBe("SQ");
      expect(dataset.get(PRIVATE_TAG)?.items).toHaveLength(1);
      expect(
        report.attributes
          .filter((a) => a.contextPath?.[0] === `${PRIVATE_TAG}[0]`)
          .map((a) => [a.tag, a.applied]),
      ).toEqual([
        ["00080018", "uid-remapped"],
        ["00100010", "emptied"],
        ["00100020", "emptied"],
      ]);
      expect(report.removedPrivateTags).toEqual([]);
    });

    it("THE PRICE, pinned: a nested private block reserved INSIDE the item survives, one reserved only OUTSIDE does not", () => {
      // 🩺 THE COST OF THIS SLICE. Walking the carrier means PS3.5 §7.8.1's
      // per-Data-Set reservation scope now applies inside it, and items do not
      // inherit the enclosing Data Set's reservations. So a vendor who nests a
      // private element inside a private `SQ` and reserves its block only at the
      // root loses it. That is the standard's rule and not a choice made here,
      // but it is over-removal against what `0.0.10` did, it is named on
      // `report.removedPrivateTags` rather than dropped silently, and it is
      // pinned so the next slice cannot rediscover it as a surprise.
      const build = (reserveInsideItem: boolean): Buffer =>
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            creatorEl,
            {
              tag: PRIVATE_TAG,
              items: [
                {
                  elements: reserveInsideItem
                    ? [creatorEl, { tag: "00091002", vr: "SH", value: ascii(SECRET) }]
                    : [{ tag: "00091002", vr: "SH", value: ascii(SECRET) }],
                },
              ],
            },
          ] as never,
        });

      // §7.8.1-conformant: the Item carries its own Private Creator, so the
      // reservation is real inside the Item and the nested element is judged
      // rather than refused. Its value goes for being unenumerable - nothing
      // walked a `SH` scalar - and the record says so from inside the Item.
      const conformant = run(build(true));
      expect(conformant.removedPrivateTags).toEqual(["00091002"]);
      expect(conformant.unenumerableEntries).toEqual([
        {
          tag: "00091002",
          applied: "removed",
          reason: "unenumerable",
          contextPath: [`${PRIVATE_TAG}[0]`],
        },
      ]);
      expect(conformant.secretInOutput).toBe(false);

      // Reserved only at the root: the Item never had that block, so it is
      // REFUSED - removed with no record entry, which is the difference this
      // test is pinning.
      const inherited = run(build(false));
      expect(inherited.removedPrivateTags).toEqual(["00091002"]);
      expect(inherited.unenumerable).toEqual([]);
      expect(inherited.secretInOutput).toBe(false);
    });

    it("a profile that arrives only at deidentify() no longer leaks the carrier it declared SQ", () => {
      // 🩺 `DICOM-PRIVATE-SQ-PARSE-VR`, CLOSED. This test asserted the LEAK until
      // the slice that closed it; it now asserts the closure, and the row that
      // changed is `unresolved.leaks`.
      //
      // `keepRetainedPrivate` used to branch on `el.vr === "SQ"` alone, which is
      // the VR on the PARSE TREE. Under Implicit VR LE a private tag has no VR
      // on the wire, so `SQ` is a `Profile`-resolved inference made at parse
      // time: pass the profile to `parseDicom` and the element arrives as an
      // `SQ` with items and is walked; pass it only to `deidentify()` and the
      // same bytes arrive as `UN` with no items. The second authority is the
      // profile's own DECLARED VR, which is identical on both rows because it is
      // the same profile object, so the carrier is now emptied on the terms any
      // un-auditable sequence is emptied.
      //
      // Name-bearing payload and a control pair, because a fixture whose payload
      // carries no name cannot fail for the reason it claims to.
      const NESTED_NAME = "BOND^JAMES";
      const profile = defineProfile({
        name: "acme-parse-vr",
        description: "Synthetic vendor block declared SQ, written under Implicit VR LE.",
        privateTags: {
          ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } },
        },
      });
      const buf = buildDicom({
        transferSyntax: IMPLICIT_LE,
        elements: [
          nameEl,
          { tag: "00090010", vr: "LO", value: ascii("ACME") },
          {
            tag: "00091001",
            items: [{ elements: [{ tag: "00100010", vr: "PN", value: ascii(NESTED_NAME) }] }],
          },
        ] as never,
      });
      const deidOptions: DeidentifyOptions = { retain: ["RetainSafePrivate"], profile };
      const outcome = (
        parseOptions: { profile: typeof profile } | undefined,
      ): {
        vr: string | undefined;
        items: number | undefined;
        leaks: boolean;
        codes: string[];
        deidCodes: string[];
        unauditable: readonly string[];
        applied: readonly string[];
        identityRemoved: string | undefined;
      } => {
        const ds = parseOptions === undefined ? parseDicom(buf) : parseDicom(buf, parseOptions);
        const el = ds.get("00091001");
        const { dataset, report } = deidentify(ds, deidOptions);
        return {
          vr: el?.vr,
          items: el?.items?.length,
          leaks: serializeDicom(dataset).toString("latin1").includes(NESTED_NAME),
          codes: ds.warnings.map((w) => w.code),
          deidCodes: report.warnings.map((w) => w.code),
          unauditable: report.unauditableSequences.map((f) => f.tag),
          applied: report.unauditableSequences.map((f) => f.applied),
          identityRemoved: dataset.get("00120062")?.rawBytes.toString("latin1").trimEnd(),
        };
      };

      // Non-vacuity: the name really is on the wire before either call.
      expect(serializeDicom(parseDicom(buf)).toString("latin1")).toContain(NESTED_NAME);

      // Control: profile at parse time. The element resolves to `SQ`, is WALKED
      // rather than emptied - the more informative of the two answers, and the
      // reason to keep passing the profile to `parseDicom`. Nothing is warned and
      // nothing is reported un-auditable.
      const resolved = outcome({ profile });
      expect(resolved.vr).toBe("SQ");
      expect(resolved.items).toBe(1);
      expect(resolved.leaks).toBe(false);
      expect(resolved.codes).toEqual([]);
      expect(resolved.unauditable).toEqual([]);
      // 🩺 THE STRONGEST NEGATIVE CONTROL FOR
      // `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE`, AND THE ONLY ONE THAT
      // ISOLATES ITS PREDICATE. This is a retained private carrier, reached with
      // `RetainSafePrivate` + the same profile, on the SAME BYTES as the row
      // below - and it is silent, because the run WALKED it: the items were
      // materialized, every nested element went through the action table, and
      // the `(0010,0010)` inside is gone from the output. That is an enumeration
      // actually performed, so there is nothing to disclose. A detector that
      // also fired here would be measuring "a private element was retained"
      // rather than "a private value was shipped unexamined".
      expect(resolved.deidCodes).not.toContain(
        WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
      );

      // Identical bytes, profile withheld from the parse. The element is still
      // `UN` with no items - no parser file is touched and no reading changes -
      // but the profile still declares `(0009,xx01)` an `SQ`, so the carrier is
      // emptied instead of kept verbatim, and the drop is named.
      const unresolved = outcome(undefined);
      expect(unresolved.vr).toBe("UN");
      expect(unresolved.items).toBeUndefined();
      expect(unresolved.leaks).toBe(false);
      expect(unresolved.unauditable).toEqual(["00091001"]);
      // Emptied, on the emptied class's own code. The two classes share this
      // array and are told apart by `applied`, never by the array alone.
      expect(unresolved.applied).toEqual(["emptied"]);
      expect(unresolved.deidCodes).toContain(WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE);
      expect(unresolved.deidCodes).not.toContain(
        WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
      );
      // 🛑 THE STAMP IS STILL `YES` ON BOTH ROWS, and that is the point of
      // reporting the drop: the attestation alone never distinguished them.
      expect(resolved.identityRemoved).toBe("YES");
      expect(unresolved.identityRemoved).toBe("YES");
      // 🛑 PIN THE WARNING CHANNEL ON BOTH ROWS. Parsing a private tag with no VR
      // on the wire and no profile to resolve it still raises this code, and it
      // is unchanged by this remedy - the de-identify channel is where the drop
      // is reported. Never call this shape silent without re-running it.
      expect(unresolved.codes).toEqual(["DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR"]);
    });

    it("the honest-length carrier surface is a MATRIX, and only a profile-declared SQ empties it", () => {
      // 🩺 THE SECOND SHAPE OF THE SAME RETAIN ROUTE (pass-1 `F2` of `#77`), and
      // the residual it leaves - measured across the whole surface rather than
      // enumerated in a sentence. Nothing in any cell is malformed: the
      // carrier's Value Length is HONEST and its value is a well-formed
      // `(FFFE,E000)` item stream. Under Explicit VR the wire VR wins in the
      // parser, so the element arrives with the sender's VR and no items however
      // the profile describes it - which is why the parsed-VR branch alone never
      // reached this, and why the grid's `carrier|` family cannot either (it
      // runs `deidentify()` with no options, and `RetainSafePrivate` + a
      // `Profile` is the only route in the package that writes a private value
      // into de-identified output).
      //
      // 🛑 THE AXES ARE NOT SYMMETRIC, AND A GRADED PASS CAUGHT A DRAFT THAT
      // PRETENDED THEY WERE. **Implicit VR LE writes no VR at all** (PS3.5 2026c
      // §7.1.3), so there is no wire-VR axis there: crossing one in would have
      // measured a single file four times and billed it as four cells. The
      // Implicit rows vary only the profile, which is the whole point of them,
      // and they say so in their key.
      //
      // 🛑 THE PROSE ENUMERATION THIS TEST REPLACES WAS WRONG, AND IT IS DELETED
      // RATHER THAN REWORDED FOR A THIRD TIME. Four artifacts described the
      // residual as "a profile entry that declares a BINARY VR (`OB`/`OW`/`UN`)".
      // The measured set is not narrower than that and not wider than it either:
      // the two are INCOMPARABLE. A profile entry declaring `LO` over a carrier
      // the sender wrote `OB` leaks, and a profile entry declaring `OB` over a
      // carrier the sender wrote `LO` does not. The predicate has two conjuncts,
      // and the deleted wording named neither: the profile does not declare `SQ`
      // (so this branch does not answer it) **and** the embedded-attribute
      // scanner cannot read the value (so `keepOrEmpty` does not empty it). That
      // scanner reads string carriers only and decodes tiles in the file's own
      // encoding. `#78` was refused on exactly this shape of defect, where the
      // enumeration was the defect and the guard was right; the fixture is the
      // enumeration now, and no artifact carries a list.
      //
      // 🛑 THE SURVIVING SET IS NOT CLOSED HERE AND MUST NOT BE. Separating a
      // well-formed item stream from a legitimate binary blob needs a content
      // test on exactly the VRs arbitrary bytes are for, and the one remedy that
      // does not need one - refusing retention wherever the profile's declared
      // VR and the parse tree disagree - would drop the vendor value out of every
      // ordinary `UN`-converted private element, which is over-redaction and a
      // PRODUCT call (`DICOM-DEIDENT-OVER-REDACTION`), not a bug fix. Open,
      // disclosed and undecided. Do not close a row here by widening the guard.
      const NESTED_NAME = "BOND^JAMES";
      const itemStream = ((): Buffer => {
        const body = Buffer.concat([
          Buffer.from([0x10, 0x00, 0x10, 0x00]),
          Buffer.from("PN", "ascii"),
          Buffer.from([NESTED_NAME.length, 0x00]),
          Buffer.from(NESTED_NAME, "ascii"),
        ]);
        const header = Buffer.alloc(8);
        header.writeUInt16LE(0xfffe, 0);
        header.writeUInt16LE(0xe000, 2);
        header.writeUInt32LE(body.length, 4);
        return Buffer.concat([header, body]);
      })();

      interface Cell {
        readonly key: string;
        readonly parsedVr: string | undefined;
        readonly declaredLength: number | undefined;
        readonly rawLength: number | undefined;
        readonly keptVerbatim: boolean;
        /** `undefined` when the Data Set holds no element bearing that tag at all. */
        readonly outputLength: number | undefined;
        /** AC4's distinction: an element present with a zero-length value is EMPTIED, not removed. */
        readonly present: boolean;
        readonly leaks: boolean;
        readonly identityRemoved: string | undefined;
        readonly unauditable: readonly string[];
        readonly unauditableApplied: readonly string[];
        readonly removals: readonly UnenumerablePrivateRemoval[];
        readonly removedPrivateTags: readonly string[];
        readonly parseCodes: readonly string[];
        readonly deidCodes: readonly string[];
        readonly deidMessages: readonly string[];
      }

      const outcome = (
        declaredVr: "SQ" | "OB" | "OW" | "UN" | "LO" | "ST",
        wireVr: "OB" | "OW" | "UN" | "LO" | undefined,
      ): Cell => {
        const profile = defineProfile({
          name: `acme-${declaredVr}`,
          description: "Synthetic vendor block, honest Value Length.",
          privateTags: {
            ACME: { "0009XX01": { vr: declaredVr, keyword: "AcmeBlob", name: "Acme Blob" } },
          },
        });
        // Implicit VR LE carries no VR on the wire, so `wireVr` is `undefined`
        // there and `buildDicom`'s Implicit encoder never writes one. The `LO`
        // passed below is what the helper's element shape requires; it reaches
        // no byte of the file.
        const options: BuildDicomOptions = {
          transferSyntax: wireVr === undefined ? IMPLICIT_LE : EXPLICIT_LE,
          elements: [
            nameEl,
            { tag: "00090010", vr: "LO", value: ascii("ACME") },
            { tag: PRIVATE_TAG, vr: wireVr ?? "LO", value: itemStream },
          ],
        };
        const ds = parseDicom(buildDicom(options), { profile });
        const el = ds.get(PRIVATE_TAG);
        const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile });
        const out = dataset.get(PRIVATE_TAG);
        return {
          key:
            wireVr === undefined
              ? `decl=${declaredVr} ILE (no wire VR)`
              : `decl=${declaredVr} wire=${wireVr} ELE`,
          parsedVr: el?.vr,
          declaredLength: el?.length,
          rawLength: el?.rawBytes.length,
          // The strong form of "leaks": the retained carrier reaches output as
          // the SAME BYTES the file carried, nested Patient's Name and all.
          keptVerbatim: out?.rawBytes.equals(itemStream) ?? false,
          outputLength: out?.rawBytes.length,
          present: out !== undefined,
          leaks: serializeDicom(dataset).toString("latin1").includes(NESTED_NAME),
          identityRemoved: dataset.get("00120062")?.rawBytes.toString("latin1").trimEnd(),
          unauditable: report.unauditableSequences.map((f) => f.tag),
          unauditableApplied: report.unauditableSequences.map((f) => f.applied),
          removals: report.unenumerablePrivateRemovals,
          removedPrivateTags: report.removedPrivateTags,
          parseCodes: ds.warnings.map((w) => w.code),
          // The de-identify channel. It is NOT `ds.warnings` and never was:
          // `deidentify()` builds the output object with the SOURCE dataset's
          // parse warnings, so everything this run has to say about its own
          // decisions is on `report.warnings`. Reading the wrong one is how this
          // surface got called silent while a code was firing.
          deidCodes: report.warnings.map((w) => w.code),
          deidMessages: report.warnings.map((w) => w.message),
        };
      };

      const declaredVrs = ["SQ", "OB", "OW", "UN", "LO", "ST"] as const;
      const cells = declaredVrs.flatMap((declaredVr) =>
        (["OB", "OW", "UN", "LO", undefined] as const).map((wireVr) => outcome(declaredVr, wireVr)),
      );

      // Non-vacuity by fixture, because a PHI test whose payload carries no name
      // proves nothing. The payload really does carry a `(0010,0010)`, and every
      // Explicit cell really does present a different wire VR to the parser.
      expect(itemStream.toString("latin1")).toContain(NESTED_NAME);
      expect(
        new Set(cells.filter((cell) => cell.key.endsWith("ELE")).map((cell) => cell.parsedVr)),
      ).toEqual(new Set(["OB", "OW", "UN", "LO"]));

      // "Honest" is measured, not asserted in prose: on every cell the parser
      // consumed exactly the bytes the element declared, so no cell is an
      // over-declare and no over-run is recordable on any of them.
      for (const cell of cells) {
        expect(cell.declaredLength, cell.key).toBe(itemStream.length);
        expect(cell.rawLength, cell.key).toBe(itemStream.length);
      }

      // The closure (`DICOM-PRIVATE-SQ-PARSE-VR`), now proven on every wire VR
      // the Explicit axis can present and on the VR-less Implicit encoding,
      // rather than on the single `OB`/Explicit cell that opened it: a
      // profile-declared `SQ` is emptied to zero bytes and named, every time.
      const declaredSq = cells.filter((cell) => cell.key.startsWith("decl=SQ "));
      expect(declaredSq).toHaveLength(5);
      for (const cell of declaredSq) {
        expect(cell.leaks, cell.key).toBe(false);
        expect(cell.outputLength, cell.key).toBe(0);
        expect(cell.unauditable, cell.key).toEqual([PRIVATE_TAG]);
        // 🩺 NEGATIVE CONTROL FOR THE NEW CODE, AND THE REASON THE FINDING NOW
        // CARRIES `applied`. These carriers were EMPTIED. A caller reading
        // `unauditableSequences` has always been entitled to read an entry as
        // "this content is not in the output", and the new class must not
        // silently re-scope that. The emptied class keeps its own code.
        expect(cell.unauditableApplied, cell.key).toEqual(["emptied"]);
        expect(cell.deidCodes, cell.key).toContain(
          WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE,
        );
        expect(cell.deidCodes, cell.key).not.toContain(
          WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
        );
      }

      // 🩺 THE SECOND NEGATIVE CONTROL, AND THE ONE THAT PROVES THE REMOVAL RULE
      // IS NOT SIMPLY "always". These five cells are vouched-for private
      // carriers too, reached by the identical route with the identical
      // options - and the embedded-attribute scanner READ their values and
      // EMPTIED them before the removal rule could be reached. No value of
      // theirs is in the output either, so they are outside the class this slice
      // converts, and they keep the code and the outcome they always had. A rule
      // that fired on every cell would measure nothing.
      const scannerCaught = cells.filter(
        (cell) => cell.present && !cell.key.startsWith("decl=SQ "),
      );
      expect(scannerCaught.map((cell) => cell.key).sort()).toEqual([
        "decl=LO wire=LO ELE",
        "decl=OB wire=LO ELE",
        "decl=OW wire=LO ELE",
        "decl=ST wire=LO ELE",
        "decl=UN wire=LO ELE",
      ]);
      for (const cell of scannerCaught) {
        expect(cell.outputLength, cell.key).toBe(0);
        expect(cell.unauditable, cell.key).toEqual([]);
        expect(cell.removals, cell.key).toEqual([]);
        expect(cell.deidCodes, cell.key).toContain(
          WARNING_CODES.DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED,
        );
        expect(cell.deidCodes, cell.key).not.toContain(
          WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
        );
      }

      // 🩺 THE EMPTIED SET, AS A MEASURED SET, AND IT IS UNCHANGED BY THIS
      // SLICE. These ten cells leave an element bearing the tag in the output
      // carrying a ZERO-LENGTH value: the five the profile declares `SQ`, and
      // the five the embedded-attribute scanner could read and caught. They are
      // NOT removals, and AC4's distinction is exactly that - `present` is still
      // true here, so a reader of this matrix can tell an intentional
      // zero-length residual from a missed removal.
      const emptied = cells.filter((cell) => cell.present && cell.outputLength === 0);
      expect(emptied.map((cell) => cell.key).sort()).toEqual([
        "decl=LO wire=LO ELE",
        "decl=OB wire=LO ELE",
        "decl=OW wire=LO ELE",
        "decl=SQ ILE (no wire VR)",
        "decl=SQ wire=LO ELE",
        "decl=SQ wire=OB ELE",
        "decl=SQ wire=OW ELE",
        "decl=SQ wire=UN ELE",
        "decl=ST wire=LO ELE",
        "decl=UN wire=LO ELE",
      ]);
      for (const cell of emptied) {
        // No value of theirs reached the output before this slice either, so
        // none of them is in the removal record: the class this slice converts
        // is the one that SHIPPED a value.
        expect(cell.removals, cell.key).toEqual([]);
      }

      // 🛑 THE 20 CELLS THAT SHIPPED THE NESTED NAME ARE NOW REMOVALS. Every one
      // of them kept the carrier VERBATIM under `(0012,0062) = YES` through
      // `0.0.19`, with the run disclosing that it had done so; the attribute is
      // gone now, and the record says removed-for-being-unenumerable.
      //
      // 🩺 THE PREDICATE IS "THIS RUN DID NOT ENUMERATE THE VALUE", NOT "THE
      // SCANNER COULD NOT READ IT" AND NOT THE VR. Two of these twenty -
      // `decl=LO ILE` and `decl=ST ILE` - are perfectly SCANNABLE string
      // carriers whose values the scanner did read and found nothing in, because
      // the nested tiles are Explicit VR and the file is Implicit. A rule keyed
      // on the scanner's reach would leave exactly those two shipping. And the
      // set spans every declared VR including `LO` and `ST`, so a rule keyed on
      // binary VRs would leave them shipping too.
      const removed = cells.filter((cell) => !cell.present);
      expect(removed).toHaveLength(20);
      expect(
        removed.filter(
          (cell) =>
            cell.key === "decl=LO ILE (no wire VR)" || cell.key === "decl=ST ILE (no wire VR)",
        ),
      ).toHaveLength(2);
      // Every declared VR the profile can carry that is not `SQ` is in this set,
      // string VRs included: a rule keyed on binary VRs would leave `LO` and
      // `ST` shipping, and the deleted prose enumeration named exactly those.
      expect(
        new Set(removed.map((cell) => cell.key.slice("decl=".length, "decl=".length + 2))),
      ).toEqual(new Set(["OB", "OW", "UN", "LO", "ST"]));
      for (const cell of removed) {
        // THE FLIP. Was `keptVerbatim: true` with the nested name in the output
        // on every one of these twenty cells.
        expect(cell.keptVerbatim, cell.key).toBe(false);
        expect(cell.outputLength, cell.key).toBeUndefined();
        expect(cell.identityRemoved, cell.key).toBe("YES");
        // Unchanged: the file is conformant, so the PARSE still says nothing.
        // Adding a Tier-2 code here would throw under `{ strict: true }` on a
        // conformant file, which this package does not do.
        expect(cell.parseCodes, cell.key).toEqual([]);
        // The findings array no longer carries this class at all - it is not
        // "emptied" and there is no "kept" outcome to carry it.
        expect(cell.unauditable, cell.key).toEqual([]);
        expect(cell.unauditableApplied, cell.key).toEqual([]);
        // The removal record is where the duty is discharged, per instance, with
        // the reason on it and no `contextPath` because the carrier is at the
        // root of these files.
        expect(cell.removals, cell.key).toEqual([
          { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
        ]);
        // ...and the pin's own private removal list still names it, unchanged in
        // meaning: every removed private tag, whichever rule removed it.
        expect(cell.removedPrivateTags, cell.key).toEqual([PRIVATE_TAG]);
        expect(cell.deidCodes, cell.key).toContain(
          WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
        );
      }

      // 🛑 AND THE WHOLE POINT, ON EVERY CELL OF THE MATRIX AT ONCE: the nested
      // `(0010,0010)` bytes are in NO cell's serialized output, by removal on
      // twenty cells and by emptying on ten.
      for (const cell of cells) {
        expect(cell.leaks, cell.key).toBe(false);
      }

      // 🛑 A DIAGNOSTIC ABOUT A PHI LEAK IS ITSELF A PHI SURFACE, and this
      // fixture is name-bearing, so the question is answerable here rather than
      // in prose. No message on any cell may quote the payload, any run of it,
      // or the byte count the carrier's header declared - `#91` bound that
      // number out of the two sibling factories and a new one must not reopen
      // it. The tag is a private one, so `renderTag`'s membership test renders
      // `<withheld>` and no element number is published either.
      for (const cell of cells) {
        for (const message of cell.deidMessages) {
          expect(message, cell.key).not.toContain(NESTED_NAME);
          expect(message, cell.key).not.toContain("BOND");
          expect(message, cell.key).not.toContain("JAMES");
          expect(message, cell.key).not.toContain(String(itemStream.length));
          expect(message, cell.key).not.toContain(PRIVATE_TAG);
        }
      }
      // Non-vacuity for the sweep above: the payload really is what the messages
      // are about, and a message really is being produced to sweep.
      expect(
        removed.flatMap((cell) => cell.deidMessages).filter((m) => m.includes("<withheld>")).length,
      ).toBeGreaterThan(0);
    });

    it("THE MUTATION CONTROL: reverting the retention decision reds the matrix's own assertions", () => {
      // 🛑 THE MATRIX ABOVE IS SATISFIABLE BY AN ASSERTION EDIT AND THIS TEST IS
      // WHY IT IS NOT SATISFIED BY ONE. It takes the acceptance predicate the
      // matrix applies to each of its twenty converted cells, feeds it the
      // outcome the package produced BEFORE this slice - the carrier retained,
      // its value verbatim in the output, and no removal recorded - and requires
      // that predicate to THROW. If the retention decision is ever reverted, the
      // matrix reds; if the matrix's assertions are ever weakened to something a
      // retained carrier also satisfies, this test reds instead.
      //
      // The mutant is reconstructed from the real run rather than hand-written:
      // the source element is put back into the de-identified object, which is
      // exactly what "retain it" did, and the record it never wrote is the empty
      // array. Nothing about the fixture, the profile or the parse changes.
      const NESTED_NAME = "BOND^JAMES";
      const itemStream = ((): Buffer => {
        const body = Buffer.concat([
          Buffer.from([0x10, 0x00, 0x10, 0x00]),
          Buffer.from("PN", "ascii"),
          Buffer.from([NESTED_NAME.length, 0x00]),
          Buffer.from(NESTED_NAME, "ascii"),
        ]);
        const header = Buffer.alloc(8);
        header.writeUInt16LE(0xfffe, 0);
        header.writeUInt16LE(0xe000, 2);
        header.writeUInt32LE(body.length, 4);
        return Buffer.concat([header, body]);
      })();
      const profile = defineProfile({
        name: "acme-mutation-control",
        description: "Synthetic vendor block, honest Value Length, declared OB.",
        privateTags: { ACME: { "0009XX01": { vr: "OB", keyword: "AcmeBlob", name: "Acme Blob" } } },
      });
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          { tag: "00090010", vr: "LO", value: ascii("ACME") },
          { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
        ],
      });

      /** The matrix's acceptance predicate for a converted cell, applied to one run. */
      const acceptRemoved = (
        object: Dataset,
        removals: readonly UnenumerablePrivateRemoval[],
      ): void => {
        expect(object.get(PRIVATE_TAG)).toBeUndefined();
        expect(serializeDicom(object).toString("latin1")).not.toContain(NESTED_NAME);
        expect(removals).toEqual([
          { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
        ]);
      };

      const ds = parseDicom(buf, { profile });
      const source = ds.get(PRIVATE_TAG);
      if (source === undefined) throw new Error("fixture must carry the private carrier");
      const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile });

      // The current decision passes the predicate.
      acceptRemoved(dataset, report.unenumerablePrivateRemovals);

      // The reverted decision: the same run, with the retention put back.
      const fileMeta = dataset.fileMeta;
      const mutant = new Dataset({
        warnings: dataset.warnings,
        elements: new Map([
          ...dataset.elements().map((el) => [el.tag, el] as const),
          [PRIVATE_TAG, source] as const,
        ]),
        ...(fileMeta !== undefined ? { fileMeta } : {}),
      });
      // Non-vacuity: retaining it really does put the nested name back on the
      // wire, so the mutant is the leak and not merely a different object.
      expect(serializeDicom(mutant).toString("latin1")).toContain(NESTED_NAME);
      expect(mutant.get("00120062")?.rawBytes.toString("latin1").trimEnd()).toBe("YES");

      expect(() => {
        acceptRemoved(mutant, []);
      }).toThrow();
    });

    it("a FABRICATED header keeps the tag-free diagnostic only when its VR is outside the 34", () => {
      // 🩺 THE BOUND A GRADED PASS CAUGHT THIS SLICE BREAKING, AND THE HALF OF
      // IT THAT IS STILL OPEN. `emptyUndefinedVrElement` is the one path in the
      // module that deliberately names NO TAG, because the condition raising it
      // is that the header was fabricated from bytes inside some element's
      // value - so its four tag bytes ARE document content. Three warning codes
      // have been refused for echoing exactly that.
      //
      // The profile-declared-`SQ` branch sits in front of `keepOrEmpty` and
      // would preempt it: an under-declared length upstream resynchronizes the
      // reader onto four bytes that here spell `(0009,1001)`, the caller's own
      // vendor block, whose Private Creator is genuine and whose position is
      // inside the settled run. `!hasUndefinedVr(el)` is what keeps the tag-free
      // route - for the `Zz` row. Delete that conjunct and the `Zz` row reds
      // with the fabricated tag on both the warning and the report.
      //
      // 🛑 THE TWO ROWS DIFFER IN TWO BYTES OF THE FABRICATED VR AND NOTHING
      // ELSE, AND THAT IS THE POINT: the bound is partial. Fabricate `OB` and
      // `hasUndefinedVr` is false, so this branch answers it and the fabricated
      // tag DOES reach the diagnostic. It is disclosed rather than guarded,
      // because a fabricated `OB` header and a genuine one are byte-identical -
      // this package's permanent fact, five refused slices - and because on this
      // very input the base tree kept the carrier VERBATIM and shipped the whole
      // nested name. Four bytes of tag on a report beats a `(0010,0010)` in the
      // output. Do not grow the guard for the `OB` row.
      const NESTED_NAME = "BOND^JAMES";
      const profile = defineProfile({
        name: "acme-fabricated",
        description: "Synthetic vendor block declared SQ.",
        privateTags: {
          ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } },
        },
      });

      const outcome = (
        fabricatedVr: "Zz" | "OB",
      ): {
        parsedVr: string | undefined;
        leaksBeforeDeident: boolean;
        leaks: boolean;
        undefinedVrLengths: readonly number[];
        unauditable: readonly string[];
        warningsNamingTag: readonly string[];
        allWarningCodes: readonly string[];
      } => {
        // A complete long-form header (tag + VR + reserved + a 32-bit length)
        // followed by a name, all of it INSIDE a legitimate `LO` value that
        // under-declares its own length by exactly that much.
        const fabricated = Buffer.concat([
          Buffer.from([0x09, 0x00, 0x01, 0x10]),
          Buffer.from(fabricatedVr, "ascii"),
          Buffer.from([0x00, 0x00]),
          Buffer.from([NESTED_NAME.length, 0x00, 0x00, 0x00]),
          Buffer.from(NESTED_NAME, "ascii"),
        ]);
        const buf = buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [
            nameEl,
            { tag: "00090010", vr: "LO", value: ascii("ACME") },
            {
              tag: "00080080",
              vr: "LO",
              value: Buffer.concat([ascii("MERCY GENERAL HOSPITAL "), fabricated]),
              declaredLengthDelta: -fabricated.length,
            },
          ],
        });
        const ds = parseDicom(buf);
        const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile });
        return {
          parsedVr: ds.get("00091001")?.vr,
          leaksBeforeDeident: serializeDicom(parseDicom(buf))
            .toString("latin1")
            .includes(NESTED_NAME),
          leaks: serializeDicom(dataset).toString("latin1").includes(NESTED_NAME),
          undefinedVrLengths: report.undefinedVrElements.map((f) => f.byteLength),
          unauditable: report.unauditableSequences.map((f) => f.tag),
          warningsNamingTag: report.warnings
            .filter((w) => w.message.includes("00091001"))
            .map((w) => w.code),
          allWarningCodes: report.warnings.map((w) => w.code),
        };
      };

      // The `Zz` row: the VR is outside the 34, so the tag-free route answers it.
      const outside = outcome("Zz");
      // Non-vacuity: the reader really did resynchronize onto the fabricated
      // header, it really is the block this caller's profile declares `SQ`, and
      // the name really is on the wire beforehand.
      expect(outside.parsedVr).toBe("Zz");
      expect(outside.leaksBeforeDeident).toBe(true);
      expect(outside.leaks).toBe(false);
      // 🛑 ANSWERED BY THE TAG-FREE ROUTE. `undefinedVrElements` carries a byte
      // offset and no tag; `unauditableSequences` would carry `00091001`.
      expect(outside.undefinedVrLengths).toEqual([NESTED_NAME.length]);
      expect(outside.unauditable).toEqual([]);
      expect(outside.warningsNamingTag).toEqual([]);

      // The `OB` row: the residual. Same fixture, two bytes different.
      const inside = outcome("OB");
      expect(inside.parsedVr).toBe("OB");
      expect(inside.leaksBeforeDeident).toBe(true);
      // The value is still emptied - the improvement over base, which kept this
      // carrier verbatim and shipped the name.
      expect(inside.leaks).toBe(false);
      // The bound DID move, deliberately, and this row records which half moved.
      // `DICOM-DIAGNOSTIC-PHI-RESIDUALS` made `renderTag` a MEMBERSHIP test, so
      // no message renders a tag PS3.6's registry does not carry a literal row
      // for - and `00091001` is private, so no closed table can vouch for it.
      // The REPORT field is untouched: `report.unauditableSequences[].tag` still
      // carries the fabricated tag, it is a model field rather than a message,
      // and it sits in the item's open residual list beside
      // `report.removedPrivateTags`. Asserting both halves separately is what
      // stops one closure being read as the other's.
      expect(inside.undefinedVrLengths).toEqual([]);
      expect(inside.unauditable).toEqual(["00091001"]);
      expect(inside.warningsNamingTag).toEqual([]);
      // Non-vacuity on the half that closed: the run really did raise that code,
      // so the empty list above is a withheld tag and not an absent warning.
      expect(inside.allWarningCodes).toContain("DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE");
    });

    it("an undefined-length UN whose CP-246 descent was refused IS covered when a profile declared it SQ", () => {
      // The enumeration a graded pass refused: this remedy does not test the
      // length FIELD, so it reaches the CP-246 shape too whenever a `Profile`
      // declared that private attribute a Sequence. Say it that way and not "no
      // length condition" - `el.length > 0` is one of the three conjuncts, and
      // the assertion below shows why it passes here: a refused CP-246 descent
      // carries 0xFFFFFFFF. The undefined-length `UN`
      // residual survives everywhere else - it is a statement about elements no
      // profile named - and no artifact may call this shape exempt.
      const NESTED_NAME = "BOND^JAMES";
      const profile = defineProfile({
        name: "acme-cp246",
        description: "Synthetic vendor block declared SQ, written UN undefined-length.",
        privateTags: {
          ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } },
        },
      });
      // An item header whose length is nonsense, so the CP-246 descent is
      // refused and the element stays `UN` with no items.
      const payload = Buffer.concat([
        Buffer.from([0xfe, 0xff, 0x00, 0xe0]),
        Buffer.from([0x99, 0x99, 0x99, 0x99]),
        Buffer.from(NESTED_NAME, "ascii"),
      ]);
      const buf = Buffer.concat([
        buildDicom({
          transferSyntax: EXPLICIT_LE,
          elements: [nameEl, { tag: "00090010", vr: "LO", value: ascii("ACME") }],
        }),
        Buffer.from([0x09, 0x00, 0x01, 0x10]),
        Buffer.from("UN", "ascii"),
        Buffer.from([0x00, 0x00]),
        Buffer.from([0xff, 0xff, 0xff, 0xff]),
        payload,
      ]);
      const ds = parseDicom(buf);
      // Non-vacuity: this is the refused-descent shape, not a resolved one.
      expect(ds.get("00091001")?.vr).toBe("UN");
      expect(ds.get("00091001")?.items).toBeUndefined();
      expect(ds.get("00091001")?.length).toBe(0xffffffff);

      const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile });
      expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED_NAME);
      expect(report.unauditableSequences.map((f) => f.tag)).toEqual(["00091001"]);
    });

    it("de-identifying the output again reports no second drop", () => {
      // `deidentify()` is a fixed point on its own output
      // (`DICOM-DEIDENT-NOT-A-FIXED-POINT`), and that has to include the AUDIT
      // and not just the bytes: the emptied carrier still satisfies every other
      // conjunct of the new branch, so without the `el.length > 0` test pass two
      // reports a drop where there is nothing left to drop. A report claiming
      // work it did not do is the false-audit class this module has been refused
      // for before.
      const profile = defineProfile({
        name: "acme-fixed-point",
        description: "Synthetic vendor block declared SQ, written OB.",
        privateTags: {
          ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeBlob", name: "Acme Blob" } },
        },
      });
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          { tag: "00090010", vr: "LO", value: ascii("ACME") },
          { tag: "00091001", vr: "OB", value: Buffer.from("PRIVATE-BLOB-BYTES!!", "ascii") },
        ],
      });
      const options: DeidentifyOptions = { retain: ["RetainSafePrivate"], profile };
      const first = deidentify(parseDicom(buf), options);
      const second = deidentify(first.dataset, options);

      expect(first.report.unauditableSequences.map((f) => f.tag)).toEqual(["00091001"]);
      expect(second.report.unauditableSequences).toEqual([]);
      expect(serializeDicom(second.dataset).equals(serializeDicom(first.dataset))).toBe(true);
    });

    it("the warning for this class names no VR, because its two producers disagree about it", () => {
      // The message is shared by both producers and one of them is an element
      // the profile declares a Sequence while the wire says `OB`. It used to
      // read "is VR=SQ", which states a fact the file contradicts - on the one
      // channel this class designates.
      expect(WARNING_MESSAGES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE).not.toContain("VR=SQ");
      expect(WARNING_MESSAGES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE).toContain("{tag}");
    });

    it("a declared LO the profile vouches for is REMOVED, and emptying stays reserved for a declared SQ", () => {
      // 🛑 THE ORDINARY VENDOR VALUE, AND THE SIZE OF THIS SLICE IN ONE ROW.
      // `profiles.ge` documents `(0009,xx01)` as `LO`, the file writes `LO`,
      // there is nothing hidden in the value, and it is REMOVED - because
      // nothing enumerated it, and decoding a value under the VR the profile
      // resolved is not enumeration. Through `0.0.19` it shipped with a
      // disclosure. A reader looking for the cost of this change should read
      // this test first: it is not a corner of `RetainSafePrivate`, it is nearly
      // all of it.
      //
      // What the row still controls is that removal and EMPTYING stay different
      // outcomes: this carrier is gone, while a declared `SQ` leaves a
      // zero-length element behind (the tests above).
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [nameEl, creatorEl, secretEl],
      });
      const ds = parseDicom(buf);
      const { dataset, report } = deidentify(ds, GE_RETAIN);
      expect(serializeDicom(dataset).includes(ascii(SECRET))).toBe(false);
      expect(dataset.get(PRIVATE_TAG)).toBeUndefined();
      expect(report.removedPrivateTags).toEqual([PRIVATE_TAG]);

      // The findings array is not where this is said - it carries dropped
      // carriers that are still present as zero-length elements - and the
      // removal record is.
      expect(report.unauditableSequences).toEqual([]);
      expect(report.unenumerablePrivateRemovals).toEqual([
        { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
      ]);
      expect(report.warnings.map((w) => w.code)).toContain(
        WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
      );

      // 🛑 THE PRIVATE CREATOR IS RETAINED HERE TOO AND IS DELIBERATELY NOT
      // REPORTED. `keepsPrivate` retains a `(gggg,00EE)` only when its whole
      // decoded value is a MEMBER of the profile's private dictionary, a closed
      // table the caller supplied - so that value was read and matched, which is
      // an enumeration, and a creator carrying anything else fails the lookup and
      // is removed instead. One entry, not two.
      expect(dataset.get(CREATOR_TAG)?.rawBytes.toString("latin1").trimEnd()).toBe(CREATOR);
      expect(report.unauditableSequences.map((f) => f.tag)).not.toContain(CREATOR_TAG);
    });

    it("a creator whose value carries more than the profile's entry is REMOVED, not kept unreported", () => {
      // The claim the exclusion above rests on, measured rather than asserted:
      // there is no room in a retained Private Creator for an unexamined Data
      // Set, because a creator value that is not exactly a dictionary member is
      // never retained in the first place. Same file, same profile, four extra
      // bytes on the creator.
      const buf = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          nameEl,
          { tag: CREATOR_TAG, vr: "LO", value: ascii("GEMS_PETD_01 ZZZZ") },
          secretEl,
        ],
      });
      const { report } = deidentify(parseDicom(buf), GE_RETAIN);
      expect(report.removedPrivateTags).toContain(CREATOR_TAG);
      expect(report.unauditableSequences.map((f) => f.tag)).not.toContain(CREATOR_TAG);
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

      // Control: nobody lies, so item 0's block is ACCEPTED. Its value goes for
      // being unenumerable, which is a different mechanism and says so.
      const honest = run(build(0));
      expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(honest.unenumerable).toEqual([PRIVATE_TAG]);
      expect(honest.secretInOutput).toBe(false);

      // `descendSequence` decides once for the whole sequence, so item 0 pays for
      // item 1's lie: the block is REFUSED, the creator goes with it, and nothing
      // is recorded as unenumerable. Disclosed as a cost, not defended as a
      // virtue.
      const lying = run(build(wireSize("MR")));
      expect(lying.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(lying.unenumerable).toEqual([]);
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
      // Honestly labelled: the reservation is ACCEPTED, so the only removal is
      // the unenumerable one and the creator survives.
      const honest = deidentify(ds, GE_RETAIN).report;
      expect(honest.removedPrivateTags).toEqual([PRIVATE_TAG]);
      expect(honest.unenumerablePrivateRemovals.map((r) => r.tag)).toEqual([PRIVATE_TAG]);

      const fileMeta = ds.fileMeta;
      if (fileMeta === undefined) throw new Error("fixture must carry File Meta");
      const relabelled = new Dataset({
        warnings: ds.warnings,
        elements: new Map(ds.elements().map((el) => [el.tag, el])),
        fileMeta: { ...fileMeta, transferSyntaxUID: IMPLICIT_LE },
      });
      // Re-labelled: the block is REFUSED, which is the over-removal this test
      // exists to disclose, and the empty record is how the two are told apart.
      const mislabelled = deidentify(relabelled, GE_RETAIN).report;
      expect(mislabelled.removedPrivateTags).toEqual([CREATOR_TAG, PRIVATE_TAG]);
      expect(mislabelled.unenumerablePrivateRemovals).toEqual([]);
    });
  });
});

/**
 * `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE` - the **removal** of a private
 * value this run did not enumerate, and the record of it.
 *
 * 🛑 **THE CODE IS THE PIN'S AND ITS MEANING IS NOT: "shipped unexamined"
 * BECAME "removed unexamined".** Through `0.0.19` every assertion in this block
 * said "still in the output" and the package called that a disclosure rather
 * than a fix. The value is gone now, `report.unenumerablePrivateRemovals` says
 * which attribute went and why, and the warning-code SET is unchanged - so a
 * consumer narrowing on this code keeps compiling and has to re-read what it
 * means.
 *
 * The price is over-redaction and it is not a corner of `RetainSafePrivate`:
 * with the option plus a `Profile`, the values that still reach the output are a
 * carrier the run walked as Data Elements, a Private Creator the profile's
 * dictionary matched, and a zero-length value. Each of those three is pinned
 * below, beside the classes that must NOT be recorded here.
 */
describe("DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE", () => {
  const NESTED = "BOND^JAMES";

  /** A well-formed `(FFFE,E000)` Item holding one `(0010,0010)`, Explicit VR LE. */
  const itemStream = ((): Buffer => {
    const body = Buffer.concat([
      Buffer.from([0x10, 0x00, 0x10, 0x00]),
      Buffer.from("PN", "ascii"),
      Buffer.from([NESTED.length, 0x00]),
      Buffer.from(NESTED, "ascii"),
    ]);
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0xfffe, 0);
    header.writeUInt16LE(0xe000, 2);
    header.writeUInt32LE(body.length, 4);
    return Buffer.concat([header, body]);
  })();

  const acme = defineProfile({
    name: "acme-ob",
    description: "Synthetic vendor block, honest Value Length, declared OB.",
    privateTags: { ACME: { "0009XX01": { vr: "OB", keyword: "AcmeBlob", name: "Acme Blob" } } },
  });

  const file = buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: [
      nameEl,
      { tag: "00090010", vr: "LO", value: ascii("ACME") },
      { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
    ],
  });

  const codes = (report: { warnings: readonly { code: string }[] }): readonly string[] =>
    report.warnings.map((w) => w.code);

  it("REMOVES the leaking shape, in the returned dataset and in the serialized bytes", () => {
    // Non-vacuity by fixture: the payload is a real `(0010,0010)` carrying a real
    // name, and it is on the wire before either call. A PHI test whose payload
    // carries no name proves nothing.
    expect(itemStream.toString("latin1")).toContain(NESTED);
    expect(serializeDicom(parseDicom(file, { profile: acme })).toString("latin1")).toContain(
      NESTED,
    );

    const ds = parseDicom(file, { profile: acme });
    const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acme });

    // The file is fully conformant: the Value Length is honest on every element,
    // so the PARSE says nothing. It did not before this slice either, and adding
    // a Tier-2 code here would throw under `{ strict: true }` on a conformant
    // file.
    expect(ds.warnings).toEqual([]);

    // 🛑 THE LEAK IS CLOSED, AND ON BOTH SURFACES A CALLER CAN SEE: no element
    // bearing that tag in the returned Data Set, and none in the bytes. An
    // element present with a zero-length value would NOT satisfy this.
    expect(dataset.get(PRIVATE_TAG)).toBeUndefined();
    expect(dataset.has(PRIVATE_TAG)).toBe(false);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED);
    expect(dataset.get("00120062")?.rawBytes.toString("latin1").trimEnd()).toBe("YES");
    // The Private Creator that reserved the block is untouched: the profile's
    // dictionary matched its whole decoded value, which is an enumeration.
    expect(dataset.get("00090010")?.rawBytes.toString("latin1").trimEnd()).toBe("ACME");

    // ...and it is recorded, on BOTH channels, as removed for being unenumerable
    // rather than as retained.
    expect(codes(report)).toContain(WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE);
    expect(report.unenumerablePrivateRemovals).toEqual([
      { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
    ]);
    expect(report.removedPrivateTags).toEqual([PRIVATE_TAG]);
    // 🩺 AC6's sweep, run over the whole report rather than over one field: no
    // entry, no field and no message says a private value reached the output
    // unenumerated. The retired `kept` outcome is the shape that did.
    expect(report.unauditableSequences).toEqual([]);
    expect(report.attributes.map((a) => a.tag)).not.toContain(PRIVATE_TAG);
    expect(report.attributes.filter((a) => a.applied === "kept").map((a) => a.tag)).not.toContain(
      PRIVATE_TAG,
    );

    // The diagnostic is not itself a PHI surface: no payload, no run of it, and
    // not the byte count off the carrier's own header (`#91` bound that number
    // out of the two sibling factories). The tag is private, so `renderTag`'s
    // membership test publishes `<withheld>` rather than an element number.
    const message =
      report.warnings.find(
        (w) => w.code === WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
      )?.message ?? "";
    expect(message).toContain("<withheld>");
    expect(message).not.toContain(NESTED);
    expect(message).not.toContain("BOND");
    expect(message).not.toContain(String(itemStream.length));
    // The strongest form available: the message IS its registry entry with the
    // one structural token filled in. Any interpolation of anything else, from
    // any slot, breaks this regardless of what was planted - the `transform`
    // property the package's PHI sweep is built on.
    expect(message).toBe(
      WARNING_MESSAGES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE.replace("{tag}", "<withheld>"),
    );
  });

  it("records NOTHING when the option is off or the profile is absent - every private tag goes anyway", () => {
    // The record has to be able to be empty, and the two runs that empty it are
    // the two that never reach a retention decision. `RetainSafePrivate` plus a
    // `Profile` is the only route in this package that retains a private value,
    // so with either missing the Basic Profile removes every private attribute
    // and names it in `removedPrivateTags` - unchanged from the pin, and NOT
    // recorded as unenumerable, because nothing was ever vouched for.
    const ds = parseDicom(file, { profile: acme });

    const noRetain = deidentify(ds, { profile: acme });
    expect(serializeDicom(noRetain.dataset).toString("latin1")).not.toContain(NESTED);
    expect(noRetain.report.removedPrivateTags).toEqual(["00090010", PRIVATE_TAG]);
    expect(noRetain.report.unenumerablePrivateRemovals).toEqual([]);
    expect(noRetain.report.unauditableSequences).toEqual([]);
    expect(codes(noRetain.report)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
    );

    // And with the option but no profile: `keepsPrivate` has nothing to vouch
    // with, so again nothing is retained and nothing is recorded here.
    const noProfile = deidentify(ds, { retain: ["RetainSafePrivate"] });
    expect(serializeDicom(noProfile.dataset).toString("latin1")).not.toContain(NESTED);
    expect(noProfile.report.removedPrivateTags).toEqual(["00090010", PRIVATE_TAG]);
    expect(noProfile.report.unenumerablePrivateRemovals).toEqual([]);
    expect(codes(noProfile.report)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
    );
  });

  it("lets a caller separate the three outcomes FROM THE REMOVAL RECORD ALONE", () => {
    // 🛑 THE GUARANTEE THE FAIL-SAFE'S AUDIT HALF IS BUILT ON. One file, three
    // outcomes at once: an attribute the Annex E action table REMOVED, a private
    // carrier this run EMPTIED, and a private instance removed for being
    // UNENUMERABLE. A caller holding only `unenumerablePrivateRemovals` must be
    // able to tell the third from the other two, which is why the entry carries
    // both a `applied` and a `reason` rather than being a bare tag list.
    const mixed = defineProfile({
      name: "acme-mixed",
      description: "One block declared OB and one declared SQ.",
      privateTags: {
        ACME: {
          "0009XX01": { vr: "OB", keyword: "AcmeBlob", name: "Acme Blob" },
          "0009XX02": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" },
        },
      },
    });
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        // `(0010,1000)` Other Patient IDs is an `X` row of Table E.1-1 with no
        // option override, so the action table removes it on every run.
        { tag: "00101000", vr: "LO", value: ascii("MRN-22222") },
        { tag: "00090010", vr: "LO", value: ascii("ACME") },
        { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
        { tag: "00091002", vr: "OB", value: itemStream },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(buf, { profile: mixed }), {
      retain: ["RetainSafePrivate"],
      profile: mixed,
    });

    // Non-vacuity: all three outcomes really did happen on this one file.
    expect(dataset.has("00101000")).toBe(false);
    expect(dataset.get("00091002")?.rawBytes.length).toBe(0);
    expect(dataset.has(PRIVATE_TAG)).toBe(false);

    // FROM THE RECORD ALONE: exactly the unenumerable removal, stamped with its
    // outcome and its reason.
    expect(report.unenumerablePrivateRemovals).toEqual([
      { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
    ]);
    // The Annex E removal is on its own surface and is NOT in the record.
    expect(report.attributes.filter((a) => a.applied === "removed").map((a) => a.tag)).toContain(
      "00101000",
    );
    expect(report.unenumerablePrivateRemovals.map((r) => r.tag)).not.toContain("00101000");
    // The emptied carrier is on its own surface and is NOT in the record.
    expect(report.unauditableSequences).toEqual([
      { tag: "00091002", applied: "emptied", byteLength: itemStream.length },
    ]);
    expect(report.unenumerablePrivateRemovals.map((r) => r.tag)).not.toContain("00091002");
    // 🩺 AC6's other half: nothing on this report says a private value reached
    // the output unexamined. The retired outcome is the one that did.
    expect(report.unauditableSequences.every((f) => f.applied === "emptied")).toBe(true);
    for (const message of report.warnings.map((w) => w.message)) {
      expect(message).not.toContain("KEPT");
      expect(message).not.toContain("reaches the output");
    }
  });

  it("removes ONE INSTANCE of a tag and leaves its sibling in another Data Set alone", () => {
    // 🛑 EVERY PREDICATE HERE IS PER OCCURRENCE, NEVER PER TAG. Private blocks
    // are reserved per Data Set (PS3.5 §7.8.1), so the same private tag can
    // occur several times in one object with different enumerability. The root's
    // occurrence is zero-length, which encodes no Data Set and is retained; the
    // one inside the sequence item carries the nested name and is removed. A
    // rule keyed on the tag would take both or neither, and the record names
    // the Data Set precisely so a reader can tell which occurrence went.
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        { tag: "00090010", vr: "LO", value: ascii("ACME") },
        { tag: PRIVATE_TAG, vr: "OB", value: Buffer.alloc(0) },
        {
          tag: CARRIER,
          items: [
            {
              elements: [
                { tag: "00090010", vr: "LO", value: ascii("ACME") },
                { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
              ],
            },
          ],
        },
      ] as never,
    });
    const ds = parseDicom(buf, { profile: acme });
    // Non-vacuity: both occurrences really are on the wire, in two Data Sets.
    expect(ds.get(PRIVATE_TAG)?.rawBytes.length).toBe(0);
    expect(ds.get(CARRIER)?.items?.[0]?.get(PRIVATE_TAG)?.rawBytes.length).toBe(itemStream.length);

    const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acme });
    // The root's occurrence survives, zero-length, exactly as it arrived.
    expect(dataset.get(PRIVATE_TAG)).toBeDefined();
    expect(dataset.get(PRIVATE_TAG)?.rawBytes.length).toBe(0);
    // The item's occurrence is gone, and so are its bytes.
    expect(dataset.get(CARRIER)?.items?.[0]?.has(PRIVATE_TAG)).toBe(false);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED);
    // One entry, naming the Data Set that held it.
    expect(report.unenumerablePrivateRemovals).toEqual([
      {
        tag: PRIVATE_TAG,
        applied: "removed",
        reason: "unenumerable",
        contextPath: [`${CARRIER}[0]`],
      },
    ]);
    expect(report.removedPrivateTags).toEqual([PRIVATE_TAG]);
  });

  it("a profile dictionary lookup that MISSES is removed by the Basic Profile, never recorded here", () => {
    // 🛑 THE UNENUMERABLE CLASS IS A STRICT SUBSET OF THE CLASS THE PROFILE
    // VOUCHED FOR, and this is the row that keeps it strict. The option is on
    // and a profile is passed, but its dictionary has no entry for this block:
    // the creator is not a member, so nothing is vouched for, nothing is
    // retained, and the removal is the Basic Profile's ordinary one. Recording
    // it as unenumerable would make the record mean "every private tag that
    // went", which is what `removedPrivateTags` already means.
    const otherVendor = defineProfile({
      name: "acme-other-block",
      description: "Vouches for a DIFFERENT creator, so this file's block misses.",
      privateTags: {
        ZEISS: { "0009XX01": { vr: "OB", keyword: "ZeissBlob", name: "Zeiss Blob" } },
      },
    });
    const { dataset, report } = deidentify(parseDicom(file, { profile: otherVendor }), {
      retain: ["RetainSafePrivate"],
      profile: otherVendor,
    });
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED);
    expect(report.removedPrivateTags).toEqual(["00090010", PRIVATE_TAG]);
    expect(report.unenumerablePrivateRemovals).toEqual([]);
    expect(codes(report)).not.toContain(WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE);
  });

  it("RETAINS a zero-length retained value, which encodes no Data Set, and records nothing", () => {
    // The second of the three values that still reach the output, measured
    // rather than asserted. It is also what keeps the audit a fixed point over
    // an object some other rule already emptied: without it, a carrier emptied
    // on run one is REMOVED on run two, which would take an attribute out of an
    // object that had nothing left to hide.
    const empty = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        { tag: "00090010", vr: "LO", value: ascii("ACME") },
        { tag: PRIVATE_TAG, vr: "OB", value: Buffer.alloc(0) },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(empty, { profile: acme }), {
      retain: ["RetainSafePrivate"],
      profile: acme,
    });
    // Non-vacuity: the attribute really is retained, so the silence is the
    // exclusion and not a removal.
    expect(dataset.get(PRIVATE_TAG)).toBeDefined();
    expect(dataset.get(PRIVATE_TAG)?.rawBytes.length).toBe(0);
    expect(report.removedPrivateTags).not.toContain(PRIVATE_TAG);
    expect(report.unenumerablePrivateRemovals).toEqual([]);
    expect(report.unauditableSequences).toEqual([]);
    expect(codes(report)).not.toContain(WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE);
  });

  it("RETAINS a vouched private SQ that parses cleanly, and the DESCENT takes the nested name", () => {
    // 🩺 THE THIRD VALUE THAT STILL REACHES THE OUTPUT, AND THE ONE THAT MAKES
    // "enumerated" MEAN SOMETHING. Same profile block, same nested
    // `(0010,0010)`, but the profile declares it `SQ` and the parse resolved it
    // as one, so the run WALKED the value: every nested element went through the
    // Annex E action table on its own merits. That is an enumeration performed,
    // so the attribute is retained as an attribute - it keeps its tag, its VR
    // and its items - while the nested name is taken by the descent rather than
    // by a removal. Retaining the attribute is not a licence for a Table E.1-1
    // row inside it.
    const asSq = defineProfile({
      name: "acme-walked-sq",
      description: "Same block, declared SQ, and written as a real Sequence.",
      privateTags: { ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } } },
    });
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        { tag: "00090010", vr: "LO", value: ascii("ACME") },
        {
          tag: PRIVATE_TAG,
          items: [
            {
              elements: [
                { tag: "00100010", vr: "PN", value: ascii(NESTED) },
                { tag: "00080018", vr: "UI", value: Buffer.from("1.2.3.4\0") },
              ],
            },
          ],
        },
      ] as never,
    });
    const ds = parseDicom(buf, { profile: asSq });
    // Non-vacuity: the parser really materialized the items, and the name really
    // is on the wire before the call.
    expect(ds.get(PRIVATE_TAG)?.vr).toBe("SQ");
    expect(ds.get(PRIVATE_TAG)?.items).toHaveLength(1);
    expect(serializeDicom(ds).toString("latin1")).toContain(NESTED);

    const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: asSq });
    expect(dataset.get(PRIVATE_TAG)?.vr).toBe("SQ");
    expect(dataset.get(PRIVATE_TAG)?.items).toHaveLength(1);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED);
    expect(dataset.get("00120062")?.rawBytes.toString("latin1").trimEnd()).toBe("YES");
    // Enumerated, so nothing is recorded and nothing is warned: the record is
    // about values this run could not account for, and it accounted for this one.
    expect(report.unenumerablePrivateRemovals).toEqual([]);
    expect(report.unauditableSequences).toEqual([]);
    expect(codes(report)).not.toContain(WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE);
    // The descent's own audit, which is where the nested name went.
    expect(
      report.attributes
        .filter((a) => a.contextPath?.[0] === `${PRIVATE_TAG}[0]`)
        .map((a) => [a.tag, a.applied]),
    ).toEqual([
      ["00100010", "emptied"],
      ["00080018", "uid-remapped"],
    ]);
  });

  it("removes the same attribute on its own output only once, so the audit is a fixed point too", () => {
    // `DICOM-DEIDENT-NOT-A-FIXED-POINT` is about the bytes; this is the audit
    // half of it. The carrier is gone after pass one, so pass two has nothing to
    // remove and must say nothing - a record that reproduced itself over an
    // object that no longer holds the attribute would be describing the first
    // run rather than the object in front of it.
    const opts: DeidentifyOptions = { retain: ["RetainSafePrivate"], profile: acme };
    const first = deidentify(parseDicom(file, { profile: acme }), opts);
    const second = deidentify(first.dataset, opts);
    expect(first.report.unenumerablePrivateRemovals.map((r) => r.tag)).toEqual([PRIVATE_TAG]);
    expect(second.report.unenumerablePrivateRemovals).toEqual([]);
    expect(second.report.removedPrivateTags).toEqual([]);
    expect(second.report.unauditableSequences).toEqual([]);
    expect(codes(second.report)).not.toContain(
      WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
    );
    // The bytes are a fixed point too, which is what makes the audit's silence
    // the right answer rather than a second, different object.
    expect(serializeDicom(second.dataset).equals(serializeDicom(first.dataset))).toBe(true);
  });

  it("keeps the block's Private Creator after every element in it is removed - and only if vouched", () => {
    // PS3.5 §7.8.1's Note permits removing the creator of an emptied block and
    // does not require it. What this pins is the rule that decides: the creator
    // is retained if and only if the caller's dictionary vouches for it, and the
    // removal of every data element in its block does not enter into it.
    const orphaned = deidentify(parseDicom(file, { profile: acme }), {
      retain: ["RetainSafePrivate"],
      profile: acme,
    });
    expect(orphaned.report.unenumerablePrivateRemovals.map((r) => r.tag)).toEqual([PRIVATE_TAG]);
    expect(orphaned.dataset.get("00090010")?.rawBytes.toString("latin1").trimEnd()).toBe("ACME");

    // The mirror: a creator value that is not a member of the dictionary is not
    // vouched for, so it is removed with the block rather than left orphaned.
    const strangerCreator = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        { tag: "00090010", vr: "LO", value: ascii("ACME BUT LONGER") },
        { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
      ],
    });
    const stranger = deidentify(parseDicom(strangerCreator, { profile: acme }), {
      retain: ["RetainSafePrivate"],
      profile: acme,
    });
    expect(stranger.dataset.get("00090010")).toBeUndefined();
    expect(stranger.report.removedPrivateTags).toEqual(["00090010", PRIVATE_TAG]);
    expect(stranger.report.unenumerablePrivateRemovals).toEqual([]);
  });

  it("a sequence whose item stream contradicts its declared length still removes and NAMES, unchanged", () => {
    // AC13's shape, pinned against this slice rather than by it: the private
    // element is reached inside a sequence the file does not settle the extent
    // of, so the reservation is refused and the Basic Profile removes it under
    // PS3.15 §E.3.10's other branch. It is named in `removedPrivateTags`, it is
    // NOT recorded as unenumerable - nothing was vouched for - and the behaviour
    // is the pin's.
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        {
          tag: CARRIER,
          items: [
            {
              declaredLengthDelta: 8 + ascii("MR").length,
              elements: [
                { tag: "00090010", vr: "LO", value: ascii("ACME") },
                { tag: PRIVATE_TAG, vr: "OB", value: itemStream },
              ],
            },
          ],
        },
        { tag: "00080060", vr: "CS", value: ascii("MR") },
      ] as never,
    });
    const ds = parseDicom(buf);
    const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: acme });
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED);
    expect(report.removedPrivateTags).toContain(PRIVATE_TAG);
    expect(report.unenumerablePrivateRemovals).toEqual([]);
  });

  it("is not raised over an emptied carrier, so the two classes never double-count", () => {
    // The same element, the same options, the profile declaring `SQ` instead of
    // `OB`: it is emptied through the sibling route. Exactly one finding, and it
    // is the EMPTIED one - a carrier must never be reported as both dropped and
    // kept.
    const asSq = defineProfile({
      name: "acme-sq",
      description: "Same block, declared SQ.",
      privateTags: { ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } } },
    });
    const { dataset, report } = deidentify(parseDicom(file, { profile: asSq }), {
      retain: ["RetainSafePrivate"],
      profile: asSq,
    });
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED);
    expect(report.unauditableSequences).toEqual([
      { tag: PRIVATE_TAG, applied: "emptied", byteLength: itemStream.length },
    ]);
    expect(codes(report)).not.toContain(WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE);
  });

  it("removes and RECORDS every one past the cap, while the diagnostics stay bounded", () => {
    // 🛑 THE CAP IS ON WHAT IS SAID AND NEVER ON WHAT IS DONE - AND SINCE THE
    // RECORD CARRIES A DUTY, NEVER ON THE RECORD EITHER. A crafted file can
    // carry an attacker-chosen number of unenumerable private attributes, so the
    // WARNINGS are budgeted; the removals are not, and neither is
    // `unenumerablePrivateRemovals`, because AC7's guarantee (tell an
    // unenumerable removal from an Annex E one, from the record alone) would
    // otherwise evaporate on exactly the files that need it. The emptied carrier
    // is written LAST here, after more than a full budget of removals, so a
    // shared counter would silence it and red this test.
    const many = MAX_UNAUDITABLE_SEQUENCE_FINDINGS * 2;
    const privateTags: Record<string, { vr: "OB" | "SQ"; keyword: string; name: string }> = {
      "0009XXFF": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" },
    };
    for (let i = 0; i < many; i += 1) {
      privateTags[`0009XX${(0x10 + i).toString(16).toUpperCase().padStart(2, "0")}`] = {
        vr: "OB",
        keyword: `AcmeBlob${String(i)}`,
        name: `Acme Blob ${String(i)}`,
      };
    }
    const flooded = defineProfile({
      name: "acme-flood",
      description: "Synthetic vendor block with many retained attributes.",
      privateTags: { ACME: privateTags },
    });
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        nameEl,
        { tag: "00090010", vr: "LO", value: ascii("ACME") },
        ...Array.from({ length: many }, (_unused, i) => ({
          tag: `0009${(0x1010 + i).toString(16).toUpperCase().padStart(4, "0")}`,
          vr: "OB" as const,
          value: itemStream,
        })),
        { tag: "000910FF", vr: "OB" as const, value: itemStream },
      ],
    });
    const { dataset, report } = deidentify(parseDicom(buf, { profile: flooded }), {
      retain: ["RetainSafePrivate"],
      profile: flooded,
    });

    const removals = report.unenumerablePrivateRemovals;
    const warned = codes(report).filter(
      (c) => c === WARNING_CODES.DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE,
    );
    // Non-vacuity: the flood really is bigger than one budget, so the cap really
    // is the thing being exercised.
    expect(many).toBeGreaterThan(MAX_UNAUDITABLE_SEQUENCE_FINDINGS);

    // THE ACTION: every one of them is gone from the object, cap or no cap.
    for (let i = 0; i < many; i += 1) {
      const tag = `0009${(0x1010 + i).toString(16).toUpperCase().padStart(4, "0")}`;
      expect(dataset.get(tag), tag).toBeUndefined();
    }
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(NESTED);

    // THE RECORD: complete, uncapped, one entry per instance, and every one of
    // them stamped removed-for-being-unenumerable.
    expect(removals).toHaveLength(many);
    expect(new Set(removals.map((r) => r.tag))).toHaveLength(many);
    expect(new Set(removals.map((r) => `${r.applied}/${r.reason}`))).toEqual(
      new Set(["removed/unenumerable"]),
    );
    expect(report.removedPrivateTags).toHaveLength(many);

    // THE DIAGNOSTICS: bounded, at the pin's own bound, on their own counter.
    expect(warned).toHaveLength(MAX_UNAUDITABLE_SEQUENCE_FINDINGS);
    // THE POINT of the separate counter: the emptied carrier is still named,
    // behind a full budget of removals.
    expect(report.unauditableSequences.map((f) => f.tag)).toEqual(["000910FF"]);
    expect(report.unauditableSequences.map((f) => f.applied)).toEqual(["emptied"]);
  });
});

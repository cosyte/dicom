/**
 * `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` - an item inside a defined-length `SQ`
 * read under an Explicit VR transfer syntax can declare a length that reaches
 * past the end the `SQ` itself declared, and take the enclosing Data Set's bytes
 * with it. **This slice discloses that. It does not re-frame the object.**
 *
 * `parseSequence` computes the sequence's `endLimit` from the declared length but
 * bounds each item's value read against `buffer.length`. The Explicit VR
 * strategies are the only callers that read a defined-length sequence **in
 * place** in the caller's buffer - every other defined-length descent in
 * `sequence.ts` is handed a slice already cut at the declared end - so they are
 * the only ones where an item's own length field is free to reach past the
 * sequence and into the enclosing Data Set. That reach is silent on every
 * released version: no warning, and none under `{ strict: true }`.
 *
 * PS3.5 2026c, read from the vendored SHA-pinned `vendor/nema/part05/`, states
 * the two obligations in two sections about two different length fields:
 *
 * Section **7.5.2** "Delimitation of The Sequence of Items" governs the `SQ`
 * element's own Value Length: "This length shall include the total length
 * resulting from the sequence of zero or more items conveyed by this Data
 * Element."
 *
 * Section **7.5.1** "Item Encoding Rules" governs each `(FFFE,E000)` Item's own
 * length field.
 *
 * ## 🛑 THE FACT THAT DECIDES THE SHAPE OF THIS SLICE, PROVEN BY A TEST RATHER
 * THAN ARGUED
 *
 * A file where the **item over-declares** and a file where the **sequence
 * under-declares** are **the same bytes**. The first test below builds both from
 * `build-dicom` and asserts `Buffer.equals`. So "which of the two length fields
 * is the lie?" has no answer on the wire, and any bound that prefers section
 * 7.5.2's extent for the first file imposes it on the second one too, because
 * there is no second file.
 *
 * That is why this slice adds no bound, and that one fact is sufficient on its
 * own. Five graded attempts at a bound are on `#51`; the last was refused on a
 * **measured PHI leak** that the indistinguishability makes unavoidable rather
 * than incidental. Preferring 7.5.2 moves the disputed bytes out of the item and
 * into the enclosing Data Set, and when those bytes are a **Private Creator**
 * that crosses the PS3.5 section 7.8.1 block-reservation boundary
 * `DICOM-PARSE-CREATORS-SCOPE` established: the enclosing Data Set gains a
 * reservation it did not have, `RetainSafePrivate` + `profiles.ge` then vouches
 * for a root private element that was previously removed, and a source value
 * ships inside output stamped `PatientIdentityRemoved=YES`. `privateCreatorLeak`
 * below is that exact file, kept as a regression pin.
 *
 * ## 🛑 THE FAIL-SAFE-DIRECTION ARGUMENT IS DELETED. DO NOT PUT IT BACK.
 *
 * This docstring, four other artifacts, and the PR body all used to say that
 * following the ITEM's field is the **fail-safe** half of the ambiguity, because
 * a Private Creator swallowed INTO an item leaves the enclosing block
 * **unclaimed** and an unclaimed block is removed. **That is false and it is
 * what refused this slice a sixth time.** Which direction leaks is a property of
 * **where the sender put the Private Creator**, not of which length field a
 * reader follows. Move the creator into the item's genuine content and the
 * absorb direction leaks as well - `DICOM-PRIVATE-CREATOR-RESERVATION-LEAK`,
 * measured on `164eb39`, closed at the **de-identify boundary** by `#66` and
 * never in the parser. The eject direction is still open and still leaks
 * (`deident-private-reservation.test.ts` pins it as a residual).
 *
 * So `privateCreatorLeak` below proves one narrow thing and is labelled as
 * proving one narrow thing: **on this file, with this creator placement, a
 * clamp would have retained a private element that the released reading
 * removes.** It is not evidence that the released reading is safe in general,
 * and no test here claims that.
 *
 * ## 🛑 THE "contextPath NAMES AN ITEM IT WAS NEVER IN" DISCLOSURE IS DELETED,
 * NOT REWORDED A THIRD TIME
 *
 * It said: on a file whose item genuinely over-declares, the element that
 * follows the sequence is read as a per-item attribute and `deidentify()`
 * reports it under a `contextPath` naming an item it was never in - a residual
 * awaiting a fix.
 *
 * **"An item it was never in" asserts which of two byte-identical files you
 * have**, which is the one thing the test above says the wire does not carry. On
 * the partner file - `sqUnderDeclares()`, the same bytes - the element genuinely
 * *is* inside the item and the identical `contextPath` is exactly right. So the
 * sentence privileges one of two indistinguishable intents, and calling it an
 * unfixed residual promises a repair that would have to invent the distinction
 * five graded attempts at a bound already failed to find. It was narrowed once
 * in the troubleshooting row (from unconditional to shape-specific) and left
 * standing everywhere else; this repo's rule for a disclosure reworded twice is
 * to delete it, and that is what happened.
 *
 * **What replaces it is the pair of measurements below, and nothing else.** One
 * shape puts the element in the item with a `contextPath`, the other leaves it
 * at the root with none; both are asserted, neither is labelled the mistake.
 *
 * ## What IS left on `contextPath`, and it is not this
 *
 * The field is documented as structural and it is not: its segment tags are read
 * off the wire, bound by nothing, so a fabricated `SQ` header the reader was
 * desynchronized onto is published there while the rest of the output stays
 * silent. That is a decidable defect on a different route (any length lie, no
 * sequence-vs-item disagreement required), it is measured with a name-bearing
 * payload and a mutation control in
 * `test/integration/phi-diagnostic-surface.test.ts`, and its remedy was to
 * correct the claim rather than widen a guard.
 *
 * ## The fixture precision is the trap, and it is why this file exists
 *
 * An item over-declaring **past the end of the buffer** already threw
 * `INVALID_FILE_META` before this slice, so a test written that way is green
 * against the defect. The item must over-declare by **exactly** the on-wire size
 * of the element that follows the sequence, so the over-read lands on an element
 * boundary and the parse quietly succeeds with the wrong structure. That size is
 * `TRAILING_ON_WIRE` and it is **18** bytes: an 8-byte Explicit VR short-form
 * header plus a 9-character value padded to 10. Not the value length.
 *
 * ## Where the disclosure does and does not fire
 *
 * `endLimit < buffer.length` is a conjunct of the trigger, not decoration. It is
 * what says the sequence is being read inside a larger Data Set whose bytes are
 * there to be taken. A sequence handed a slice cut at its declared end (Implicit
 * VR LE's `tryParseDefinedLengthSQ`, CP-246's `tryParseUnAsSQ`), an
 * undefined-length sequence, and a sequence that is the last thing in its buffer
 * all have nothing to reach into, and none of them warns. Each is a test below,
 * because a warning that fires where nothing can go wrong is a `{ strict: true }`
 * caller losing the object for a file that harms nobody.
 *
 * **13 of the 36 tests here run red against `src/` at `origin/main` (`2f0abd9`)**
 * - the thirteen that assert the disclosure itself, its slots, its withholding,
 * its escalation posture, its offset frame and its amplification. The other 23
 * assert that the reading, the report, the depth cap, the one-pass cost and the
 * four no-loss controls are exactly what `origin/main` gives, which is the bar
 * this slice had to clear and the property that makes the pass-5 leak
 * impossible: the leak assertions are among them, green on both trees, which is
 * the whole claim.
 * **Re-measure that figure if you add a test rather than carrying it forward.**
 * Earlier drafts read 11 of 53, then 10 of 60, then 10 of 67, then 7 of 30, then
 * 11 of 34, and every one of them went stale.
 *
 * Every fixture is **synthetic** and built in memory by `build-dicom`; the
 * deliberately fake name and the deliberately fake private value below exist
 * only so their handling is observable.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DicomParseError,
  WARNING_CODES,
  deidentify,
  parseDicom,
  profiles,
  serializeDicom,
} from "../../src/index.js";
import { WARNING_MESSAGES } from "../../src/parser/warnings.js";
import { buildDicom } from "../helpers/build-dicom.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** Synthetic, deliberately fake. */
const ROOT_NAME = "ROOT^PATIENT";

/**
 * `(0008,1115)` Referenced Series Sequence is `SQ` in PS3.6 and carries no Table
 * E.1-1 row, so `deidentify()` keeps it and recurses into it. Nothing about the
 * sequence is redacted, only what descent finds inside.
 */
const CARRIER = "00081115" as const;

/**
 * `(0010,0020)` Patient ID sits at the ROOT, immediately after the sequence, and
 * is the element an over-declaring item swallows. It is `Z` in Table E.1-1, so
 * `deidentify()` reports it - and the report is where the mis-structure becomes
 * a false statement rather than a curiosity.
 */
const TRAILING = "00100020" as const;
const TRAILING_VALUE = "ID-000123";

/** `(0008,0008)` Image Type, the item's own legitimate content. */
const ITEM_TAG = "00080008" as const;
const ITEM_VALUE = "ORIGINAL";

/**
 * On-wire size of the trailing root element, which is exactly what the item must
 * over-declare by. Explicit VR short form: tag(4) + VR(2) + length(2) + value.
 * `TRAILING_VALUE` is 9 characters, padded to 10.
 */
const TRAILING_ON_WIRE = 8 + TRAILING_VALUE.length + (TRAILING_VALUE.length % 2);

/** On-wire size of `(0008,0008) CS "ORIGINAL"`, the item's own content. */
const ITEM_ON_WIRE = 8 + ITEM_VALUE.length;

/** Even-length value bytes; the odd-length path is a different warning's subject. */
function ascii(s: string): Buffer {
  return Buffer.from(s.length % 2 === 0 ? s : `${s} `, "ascii");
}

/**
 * Root PN, a defined-length `SQ` whose single defined-length item over-declares
 * by `itemDelta`, then a root `(0010,0020)`.
 */
function fixture(transferSyntax: string, itemDelta: number, sqDelta = 0): Buffer {
  return buildDicom({
    transferSyntax,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
      {
        tag: CARRIER,
        declaredLengthDelta: sqDelta,
        items: [
          {
            declaredLengthDelta: itemDelta,
            elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }],
          },
        ],
      },
      { tag: TRAILING, vr: "LO", value: ascii(TRAILING_VALUE) },
    ],
  });
}

/**
 * The same shape as {@link fixture}, but with the Item's four Value Length bytes
 * overwritten by `bytes` after the file is assembled.
 *
 * That is what a desynchronized read hands `parseSequence`: an `(FFFE,E000)` the
 * parser recognised, followed by four bytes of somebody's value standing in for
 * a length. Four ASCII characters always read as a length past the end of the
 * buffer, so the parse then dies on the pre-existing truncation guard - the
 * warning reaches `onWarning` and never reaches `ds.warnings`. That asymmetry is
 * the D-03 ordering residual this repo already discloses, and it is exactly the
 * channel an operator's log is wired to.
 */
function fabricatedItemHeader(bytes: Buffer): Buffer {
  if (bytes.length < 4) throw new Error("fabricatedItemHeader: need at least 4 bytes");
  const buf = fixture(EXPLICIT_LE, TRAILING_ON_WIRE);
  const itemTag = Buffer.from([0xfe, 0xff, 0x00, 0xe0]);
  const at = buf.indexOf(itemTag);
  if (at < 0) throw new Error("fabricatedItemHeader: item header not located");
  bytes.copy(buf, at + 4, 0, 4);
  return buf;
}

/**
 * `count` sibling `[SQ][trailing]` pairs, each `SQ` holding one item that
 * over-declares by exactly the trailing element's on-wire size. Each item
 * swallows its own trailing element and the cursor resumes on the next pair, so
 * the file parses and every sequence contributes one warning.
 *
 * The tags repeat, which is deliberate: a `Dataset` is a `Map<Tag, Element>` and
 * keeps the last, while `ds.warnings` keeps every one. That is the amplification
 * being measured.
 */
function manyOverrunningSequences(count: number): Buffer {
  const elements: unknown[] = [{ tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) }];
  for (let i = 0; i < count; i++) {
    elements.push({
      tag: CARRIER,
      items: [
        {
          declaredLengthDelta: TRAILING_ON_WIRE,
          elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }],
        },
      ],
    });
    elements.push({ tag: TRAILING, vr: "LO", value: ascii(TRAILING_VALUE) });
  }
  return buildDicom({
    transferSyntax: EXPLICIT_LE,
    elements: elements as never,
  });
}

/**
 * The overrunning sequence one level down: an outer defined-length `SQ` whose
 * item holds the inner `SQ` plus a trailing element for the inner item to
 * swallow. `parseSequence` reads the inner one inside the outer item's slice, so
 * the warning's `position.byteOffset` is measured in that slice.
 */
function nestedFixture(): Buffer {
  return buildDicom({
    transferSyntax: EXPLICIT_LE,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
      {
        tag: "00089215",
        items: [
          {
            elements: [
              {
                tag: CARRIER,
                items: [
                  {
                    declaredLengthDelta: TRAILING_ON_WIRE,
                    elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }],
                  },
                ],
              },
              { tag: TRAILING, vr: "LO", value: ascii(TRAILING_VALUE) },
            ],
          },
        ],
      },
    ] as never,
  });
}

describe("DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ - one file, two stories, no way to tell", () => {
  const UID = Buffer.from("1.2.826.0.1.3680043.10.1338.10", "ascii");
  /** `(0009,0010)` `LO` "GEMS_IDEN_01": 12 characters, 20 bytes on the wire. */
  const CREATOR = "00090010" as const;
  const CREATOR_VALUE = "GEMS_IDEN_01";
  const CREATOR_ON_WIRE = 20;

  /** The item is honest and holds both elements; the `SQ` is 20 bytes short. */
  function sqUnderDeclares(): Buffer {
    return buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        {
          tag: CARRIER,
          declaredLengthDelta: -CREATOR_ON_WIRE,
          items: [
            {
              elements: [
                { tag: "00080018", vr: "UI", value: UID },
                { tag: CREATOR, vr: "LO", value: ascii(CREATOR_VALUE) },
              ],
            },
          ],
        },
        { tag: "00091001", vr: "LO", value: ascii("SECRET-PRIVATE-PHI") },
      ],
    });
  }

  /** The `SQ` is honest; the item is 20 bytes long and swallows a root element. */
  function itemOverDeclares(): Buffer {
    return buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        {
          tag: CARRIER,
          items: [
            {
              declaredLengthDelta: CREATOR_ON_WIRE,
              elements: [{ tag: "00080018", vr: "UI", value: UID }],
            },
          ],
        },
        { tag: CREATOR, vr: "LO", value: ascii(CREATOR_VALUE) },
        { tag: "00091001", vr: "LO", value: ascii("SECRET-PRIVATE-PHI") },
      ],
    });
  }

  it("builds byte-identical files from an over-declaring item and an under-declaring SQ", () => {
    // **The load-bearing test in this file.** Two contradictory intentions,
    // assembled independently, produce one buffer. If this ever goes red the two
    // cases have become distinguishable and a bound is worth re-opening. Until
    // then "narrow the fix to over-declaring items only" is not something the
    // parser can be asked to do: there is one file, not two.
    expect(sqUnderDeclares().equals(itemOverDeclares())).toBe(true);
  });

  it("gives that one file exactly one reading, with the disagreement disclosed", () => {
    const ds = parseDicom(sqUnderDeclares());

    // The item's length field wins, so the creator stays inside the item. That
    // is `origin/main`'s reading, unchanged.
    expect([...(ds.get(CARRIER)?.items?.[0]?.elements() ?? [])].map((el) => el.tag)).toEqual([
      "00080018",
      CREATOR,
    ]);
    expect(ds.get(CREATOR)).toBeUndefined();
    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END);
  });
});

describe("DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ - the PHI leak a bound would open", () => {
  const SECRET = "SECRET-PRIVATE-PHI";
  const PRIVATE_TAG = "00091001" as const;

  /**
   * The refuted pass-5 file, kept verbatim as a regression pin.
   *
   * `(0009,0010)` `LO` "GEMS_IDEN_01" is a **Private Creator**: under PS3.5
   * section 7.8.1 it reserves block `0x10` of group `0009` **in the Data Set it
   * appears in**. This file puts it inside a sequence item, so the ROOT never
   * reserves that block and the root's `(0009,1001)` is a private element with no
   * creator - which `deidentify()` removes even under `RetainSafePrivate` +
   * `profiles.ge`, because nothing vouches for it.
   *
   * A clamp preferring section 7.5.2's extent hoists that creator to the root.
   * The root block becomes reserved, `profiles.ge` recognises `GEMS_IDEN_01`'s
   * `0009XX01` as safe, `(0009,1001)` is kept verbatim, and `SECRET-PRIVATE-PHI`
   * ships inside a de-identified object. Measured on the refused `e1e9515`:
   * `report.removedPrivateTags` went `["00091001"]` -> `[]`, and the value went
   * absent -> present.
   */
  function privateCreatorLeak(): Buffer {
    return buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        {
          tag: CARRIER,
          declaredLengthDelta: -20,
          items: [
            {
              elements: [
                {
                  tag: "00080018",
                  vr: "UI",
                  value: Buffer.from("1.2.826.0.1.3680043.10.1338.1\0", "ascii"),
                },
                { tag: "00090010", vr: "LO", value: ascii("GEMS_IDEN_01") },
              ],
            },
          ],
        },
        { tag: PRIVATE_TAG, vr: "LO", value: ascii(SECRET) },
      ],
    });
  }

  it("keeps the Private Creator inside the item, so the root block stays unreserved", () => {
    // Non-vacuity: this is the shape that reaches the section 7.8.1 boundary at
    // all. If the creator stopped landing in the item, the leak assertions below
    // could pass for the wrong reason.
    const ds = parseDicom(privateCreatorLeak(), { profile: profiles.ge });

    expect([...ds.elements()].map((el) => el.tag)).toEqual([CARRIER, PRIVATE_TAG]);
    expect(ds.get(CARRIER)?.items?.[0]?.get("00090010")).toBeDefined();
    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END);
  });

  it("still REMOVES the root private element under RetainSafePrivate + profiles.ge", () => {
    const ds = parseDicom(privateCreatorLeak(), { profile: profiles.ge });
    const { report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: profiles.ge });

    // `[]` on the refused `e1e9515`. This is the audit half of the leak: a
    // report saying nothing was removed, about a file that still carries the
    // value.
    //
    // The **creator itself** is in this list too, and that is `#66` landing
    // rather than anything this slice does. `origin/main` now refuses a private
    // block reservation an Item's disputed boundary never gave it, so
    // `(0009,0010)` is removed alongside `(0009,1001)`. Before the rebase this
    // pin read `[PRIVATE_TAG]` alone. Re-measure it rather than carrying it
    // forward.
    expect(report.removedPrivateTags).toEqual(["00090010", PRIVATE_TAG]);
  });

  it("keeps the private value out of the de-identified bytes", () => {
    const ds = parseDicom(privateCreatorLeak(), { profile: profiles.ge });
    const { dataset } = deidentify(ds, { retain: ["RetainSafePrivate"], profile: profiles.ge });

    // `true` on the refused branch, inside output stamped
    // `PatientIdentityRemoved=YES`.
    expect(serializeDicom(dataset).includes(Buffer.from(SECRET, "ascii"))).toBe(false);
  });

  it("removes it for the RIGHT reason - a control that reds if the creator is at the root", () => {
    // The mirror, and the proof the assertion above is not vacuous: the same
    // creator declared at the ROOT - which is exactly what a clamp manufactures -
    // DOES get the private element vouched for. So "removed" above is the block
    // reservation doing its work, not `deidentify()` removing everything private
    // regardless of the options.
    //
    // 🩺 THE DISCRIMINATOR IS THE RECORD, NOT THE BYTES, SINCE
    // `DICOM-DEIDENT-UNENUMERATED-PRIVATE`. A vouched-for value nothing walked
    // is removed too, so both rows now remove the element; what tells them apart
    // is that a vouched-for removal is stamped `unenumerable` on
    // `report.unenumerablePrivateRemovals` while a refused reservation is not
    // recorded there at all.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          { tag: "00090010", vr: "LO", value: ascii("GEMS_IDEN_01") },
          { tag: PRIVATE_TAG, vr: "LO", value: ascii(SECRET) },
        ],
      }),
      { profile: profiles.ge },
    );
    const { dataset, report } = deidentify(ds, {
      retain: ["RetainSafePrivate"],
      profile: profiles.ge,
    });

    expect(report.unenumerablePrivateRemovals).toEqual([
      { tag: PRIVATE_TAG, applied: "removed", reason: "unenumerable" },
    ]);
    expect(dataset.has("00090010")).toBe(true);
    expect(serializeDicom(dataset).includes(Buffer.from(SECRET, "ascii"))).toBe(false);
  });
});

describe("DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ - the disagreement, disclosed", () => {
  it("says so out loud instead of succeeding silently", () => {
    // The defect: `ds.warnings` was EMPTY on every released version. A
    // confident, wrong structural read with nothing to triage.
    const ds = parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE));

    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END);
  });

  it("throws under { strict: true } rather than parsing a file it cannot vouch for", () => {
    // Two normative length fields contradict each other and the reader has to
    // pick one. Under the strict posture that is the object, not a note.
    expect(() => parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE), { strict: true })).toThrow(
      DicomParseError,
    );
  });

  it("applies the same disclosure under Explicit VR Big Endian", () => {
    // Both Explicit strategies share `_parseExplicit`, so BE is the check that
    // this landed in the shared body and not in an LE-only branch.
    const ds = parseDicom(fixture(EXPLICIT_BE, TRAILING_ON_WIRE));

    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END);
  });

  it("carries the constant Item tag and NEITHER of the two disagreeing lengths", () => {
    const w = parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE)).warnings.find(
      (x) => x.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
    );

    // The item declares its 16 bytes of content plus the 18-byte element that
    // follows the sequence. The Item's declared 34 was withheld from the start;
    // the 16 that remained inside the sequence went with it in the eighth
    // instance, because that count is the SEQUENCE's declared length less the
    // bytes of the sequence already consumed. Both are absent - see the PHI rows
    // below.
    expect(w?.message).not.toContain(String(ITEM_ON_WIRE + TRAILING_ON_WIRE));
    expect(w?.message).not.toContain(String(ITEM_ON_WIRE));
    // The `{tag}` slot is the Item tag, a constant this parser recognised - not
    // four bytes read out of somebody's value, which is the trap
    // `DICOM_NONZERO_RESERVED_BYTES` and
    // `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` were both remediated for.
    expect(w?.message).toContain("FFFEE000");
    // No VERBATIM echo. That is a narrower claim than "no bytes off the wire",
    // which this test used to assert in its own title and which the next test
    // refutes.
    expect(w?.message).not.toContain(ITEM_VALUE);
    expect(w?.message).not.toContain(TRAILING_VALUE);
  });

  it("PHI: the Item's declared length is a verbatim wire read and NEVER reaches the message", () => {
    // 🛑 This code shipped with the Item's Value Length in a `{n}` slot, under
    // the claim that the message carries no bytes off the wire. Both were
    // refuted. The length is a verbatim 32-bit read, and the condition that
    // raises this code is exactly "these length fields are not what they claim
    // to be" - so on a desynchronized read those four bytes are somebody's
    // value. The remedy is `#64`'s and `#55`'s: bind it out of the FACTORY
    // SIGNATURE, so no call site can put it back without changing the signature.
    //
    // The fixture is NAME-BEARING on purpose. `#55`'s pinning test was vacuous
    // BY FIXTURE - its payload carried no name, so it could not have failed
    // either way. This one goes red the moment the binding is removed, because
    // the decimal it asserts absent is exactly what a `{n}` slot would render.
    //
    // Four ASCII bytes always read as a length past the end of the buffer, so
    // the parse dies on the pre-existing truncation guard AFTER this warning has
    // already reached `onWarning`. `ds.warnings` never carries it. That is the
    // channel a consumer logs, and it is why the message is what matters.
    const streamOf = (buf: Buffer): string[] => {
      const seen: string[] = [];
      expect(() =>
        parseDicom(buf, {
          onWarning: (x) => {
            if (x.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END) seen.push(x.message);
          },
        }),
      ).toThrow(DicomParseError);
      return seen;
    };

    const NAME = "SMITHSON";
    const nameBytes = Buffer.from(NAME, "ascii");
    // The four bytes that land in the Item's length field, read the way the
    // parser reads them.
    const asDeclaredLength = nameBytes.readUInt32LE(0);
    const messages = streamOf(fabricatedItemHeader(nameBytes));

    // Non-vacuity first: the code has to actually fire, or the assertions below
    // are about nothing.
    expect(messages).toHaveLength(1);
    // The measurement that makes the withholding necessary rather than tidy:
    // `"SMIT"` little-endian IS 1414090067, so a `{n}` slot would render four
    // letters of the surname, losslessly reversible with one readUInt32LE.
    expect(asDeclaredLength).toBe(1414090067);
    // ...and it is absent. This is the assertion the binding holds up.
    expect(messages[0]).not.toContain(String(asDeclaredLength));
    expect(messages[0]).not.toContain(NAME);
    expect(messages[0]).not.toContain("SMIT");

    // Mutation control, and it is what stops this passing on a constant: a
    // DIFFERENT name yields a DIFFERENT decimal, and that one is absent too. A
    // message hard-coded to omit one number would pass the assertion above and
    // fail here.
    const other = Buffer.from("JOHNSTON", "ascii");
    const otherLength = other.readUInt32LE(0);
    expect(otherLength).not.toBe(asDeclaredLength);
    const others = streamOf(fabricatedItemHeader(other));
    expect(others).toHaveLength(1);
    expect(others[0]).not.toContain(String(otherLength));
    expect(others[0]).not.toContain("JOHN");
    // The two messages are IDENTICAL. Nothing the fabricated bytes changed
    // survives into the diagnostic, which is the whole property.
    expect(others[0]).toBe(messages[0]);
    // And the registry entry itself has no numeric slot at all, so the binding
    // is not one call site remembering to omit an argument.
    expect(WARNING_MESSAGES.DICOM_ITEM_CROSSES_SEQUENCE_END).not.toContain("{n}");
    expect(WARNING_MESSAGES.DICOM_ITEM_CROSSES_SEQUENCE_END).not.toContain("{n2}");
  });

  it("the emit site says nothing at all when the fabricated SQ length is PRINTABLE, and that class is unreachable", () => {
    // 🛑 THIS ROW USED TO BE TITLED "`{n2}` stays because the emit site's own
    // conjunct bounds it by the buffer" AND ITS CONCLUSION IS RETRACTED. What it
    // measures is true and is kept; what it was read as concluding is refuted by
    // the row directly below, which a graded pass required and this slice then
    // acted on: `{n2}` is gone from the registry entirely.
    //
    // What it really shows: a fabricated SEQUENCE length composed of four
    // PRINTABLE bytes exceeds 538,976,288, so `endLimit` lands past the buffer,
    // the `endLimit < buffer.length` conjunct refuses and nothing is emitted.
    // That is a fact about a payload class this package has since proved
    // UNREACHABLE - a declared length only survives a parse if the buffer really
    // holds that many bytes - so it clears nothing. "The conjunct bounds it" was
    // green by fixture.
    const name = Buffer.from("SMITHSON", "ascii");
    const base = fixture(EXPLICIT_LE, TRAILING_ON_WIRE);
    const sqTagBytes = Buffer.from([0x08, 0x00, 0x15, 0x11]);
    const sqAt = base.indexOf(sqTagBytes);
    expect(sqAt).toBeGreaterThan(0);
    const fabricated = Buffer.from(base);
    // Explicit VR `SQ`: tag(4) + VR(2) + reserved(2), then the 4-byte length.
    name.copy(fabricated, sqAt + 8, 0, 4);

    const seen: string[] = [];
    expect(() =>
      parseDicom(fabricated, {
        onWarning: (x) => {
          if (x.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END) seen.push(x.message);
        },
      }),
    ).toThrow(DicomParseError);
    expect(seen).toEqual([]);

    // Non-vacuity: the unfabricated file DOES fire, so the empty array above is
    // the conjunct refusing rather than the fixture being wrong.
    const control = parseDicom(base).warnings.filter(
      (x) => x.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
    );
    expect(control).toHaveLength(1);
    // And the control's message is the frozen registry string with the constant
    // Item tag substituted and nothing else, so "nothing was emitted" above is
    // the only difference between the two runs.
    expect(control[0]?.message).toBe(
      WARNING_MESSAGES.DICOM_ITEM_CROSSES_SEQUENCE_END.replace("{tag}", "FFFEE000"),
    );
  });

  it("🩺 CLOSED: the remaining-bytes count is gone, on the REACHABLE class", () => {
    // 🩺 THE EIGHTH INSTANCE OF "a diagnostic about a PHI leak is itself a PHI
    // surface", CLOSED. Through `0.0.14` this row ASSERTED the leak.
    //
    // `{n2}` was `endLimit - cursor.position`, and `endLimit` is
    // `valueStart + explicitLength` - the enclosing SEQUENCE's declared Value
    // Length off its own header - while `cursor.position` is the crossing item's
    // header start plus 8. So `{n2}` WAS that declared length less the bytes of
    // the sequence already consumed, and an addition the reader can compute
    // reversed it. On the FIRST item the shift is just the 8-byte Item header
    // (PS3.5 7.1.1's 4-byte tag plus 7.5.1's 4-byte Item Length); the row below
    // measures a second item, where it is 32. "Less 8" as a universal was
    // refused by a graded pass.
    //
    // The row above could never see this because it fabricated the length out of
    // four PRINTABLE bytes. Every such window exceeds 538,976,288 and the
    // conjunct refuses it - but a length that big is unreachable by construction,
    // because the buffer has to hold that many bytes. The reachable class has
    // zero high-order bytes, so the decimal is SHORT.
    //
    // The slot is bound out of `itemCrossesSequenceEnd`'s signature now, which is
    // the remedy this package takes every time: a raw wire number has neither a
    // shape nor a membership for a renderer to check, and a wire number shifted
    // by a computable amount is the wire number. Every measurement this row made
    // while it asserted the leak is kept, because the numbers are what make the
    // absence below mean something.
    const RESIDUAL_NAME = "MR BRAIN SMITHSON ";
    const probe = (
      pair: string,
    ): {
      readonly declaredSq: number;
      /** The message as shipped, or `""` if the code did not fire. */
      readonly message: string;
      /** Every maximal digit run in that message. */
      readonly digitRuns: readonly string[];
      /** True only when the message was found on a `Dataset` the parse RETURNED. */
      readonly fromDatasetWarnings: boolean;
      /** True only when the planted surname is really in the built buffer. */
      readonly plantedInBuffer: boolean;
      /** The four length bytes read back OUT of the built SQ header. */
      readonly lengthBytesOffTheWire: string;
    } => {
      // Two letters of a planted surname, then the two zero high bytes every
      // reachable fabricated length carries.
      const lenBytes = Buffer.concat([Buffer.from(pair, "latin1"), Buffer.alloc(2)]);
      const declaredSq = lenBytes.readUInt32LE(0);
      const ITEM_PHYSICAL = 16; // (0008,0008) CS "ORIGINAL": 8 header + 8 value
      // The trailing element is sized so the Item's declared length ends exactly
      // on ITS end: what the Item swallows is then a valid Data Set, so the parse
      // SURVIVES and the warning reaches `ds.warnings` rather than only
      // `onWarning`.
      const trailingValueLen = declaredSq - 8 - ITEM_PHYSICAL + 4;
      const itemDeclared = ITEM_PHYSICAL + 8 + trailingValueLen;
      const raw = buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          { tag: "00100010", vr: "PN", value: Buffer.from(RESIDUAL_NAME, "latin1") },
          {
            tag: "0040A730",
            declaredLengthDelta: declaredSq - (8 + ITEM_PHYSICAL),
            items: [
              {
                declaredLengthDelta: itemDeclared - ITEM_PHYSICAL,
                elements: [{ tag: "00080008", vr: "CS", value: Buffer.from("ORIGINAL") }],
              },
            ],
          },
          { tag: "00080080", vr: "LO", value: Buffer.alloc(trailingValueLen, 0x41) },
        ],
      });
      // 🛑 READ THE LENGTH FIELD BACK OFF THE WIRE rather than trusting that
      // `declaredLengthDelta` put it there. A draft asserted the payload with
      // `expect("MR BRAIN SMITHSON ").toContain("SO")` - a literal against a
      // literal, which never opens the fixture - and a graded pass named it.
      // Explicit VR `SQ`: tag(4) + VR(2) + reserved(2), then the 4-byte length.
      const sqAt = raw.indexOf(Buffer.from([0x40, 0x00, 0x30, 0xa7]));
      const lengthBytesOffTheWire =
        sqAt > 0 ? raw.subarray(sqAt + 8, sqAt + 12).toString("latin1") : "";
      // `parseDicom` is called WITHOUT a try/catch on purpose: if it threw, this
      // row would fail here. So a message recovered from the returned Dataset's
      // own array IS the survival measurement, where a hardcoded `true` was not.
      const ds = parseDicom(raw);
      const message = ds.warnings.find(
        (w) => w.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
      )?.message;
      return {
        declaredSq,
        message: message ?? "",
        digitRuns: (message ?? "").match(/[0-9]+/gu) ?? [],
        fromDatasetWarnings: message !== undefined,
        plantedInBuffer: raw.includes(Buffer.from(RESIDUAL_NAME, "latin1")),
        lengthBytesOffTheWire,
      };
    };

    // Non-vacuity on the payload, measured off the fixture rather than typed:
    // the surname really is in the built buffer, the SQ's length field really
    // holds those two letters plus two zero high bytes, and they really do
    // decode to 20307.
    const so = probe("SO");
    expect(so.plantedInBuffer).toBe(true);
    expect(RESIDUAL_NAME).toContain("SO");
    expect(so.lengthBytesOffTheWire).toBe("SO\0\0");
    expect(so.declaredSq).toBe(20307);
    expect(String(so.declaredSq).length).toBeLessThan(7);

    // It reaches `ds.warnings` on a SURVIVING parse, which is why this instance
    // matters more than the two that only ever reached `onWarning`: the message
    // came off the returned Dataset's own array, not off a callback on a file
    // that then died. Assert that first, or an absent number below could just
    // mean an absent message.
    expect(so.fromDatasetWarnings).toBe(true);
    expect(so.message).toContain("FFFEE000");

    // 🩺 THE CLOSURE. Neither the fabricated length nor that length shifted by
    // the Item header size appears as a whole digit run of the message.
    expect(so.digitRuns).not.toContain(String(so.declaredSq));
    expect(so.digitRuns).not.toContain(String(so.declaredSq - 8));

    // Non-vacuity on the search, rebuilt rather than borrowed: `0.0.14`'s own
    // template really did carry `20299`, and `20299 + 8` really is `20307`,
    // whose low two bytes really are the planted letters. So the two assertions
    // above are ones that CAN go red.
    const shipped = `Item (FFFEE000) declares a length reaching past its enclosing sequence's declared end, so it reads the enclosing Data Set's bytes; ${String(so.declaredSq - 8)} bytes remained inside the sequence.`;
    expect(shipped.match(/[0-9]+/gu) ?? []).toContain("20299");
    expect(so.declaredSq - 8).toBe(20299);
    expect(
      Buffer.from([so.declaredSq & 0xff, (so.declaredSq >> 8) & 0xff]).toString("latin1"),
    ).toBe("SO");

    // The mutation control, so this cannot pass on a constant: change the two
    // letters and the fabricated length changes with them, while the MESSAGE
    // does not move at all. Byte-identical messages across three different
    // planted payloads is the property; a message hard-coded to omit one number
    // would pass the assertions above and fail here.
    for (const [pair, declared] of [
      ["ON", 20047],
      ["TH", 18516],
    ] as const) {
      const r = probe(pair);
      expect(r.declaredSq).toBe(declared);
      expect(r.lengthBytesOffTheWire).toBe(`${pair}\0\0`);
      expect(r.digitRuns).not.toContain(String(declared));
      expect(r.digitRuns).not.toContain(String(declared - 8));
      expect(r.message).toBe(so.message);
    }
    expect(probe("ON").declaredSq).not.toBe(so.declaredSq);
  });

  it("🩺 CLOSED for a crossing item that is NOT the first, where the shift is 32 and not 8", () => {
    // 🛑 "THE COUNT IS THE DECLARED LENGTH LESS 8" WAS REFUSED AS A UNIVERSAL BY
    // A GRADED PASS, AND THIS ROW IS WHY IT MATTERS. `endLimit` is
    // `valueStart + explicitLength` and `cursor.position` is the crossing item's
    // header start plus 8, so the shift is 8 ONLY when that item is the
    // sequence's first. With one 24-byte item ahead of it the shift is 32 - and
    // a guard scoped to a single offset would not have caught the base leak on
    // this shape at all, which is the same disease as the digit floor.
    //
    // The remedy is the SIGNATURE, so it does not depend on the shift's size:
    // there is no parameter to pass in either shape. That is what this row
    // proves, on the class the single-item row cannot reach.
    const RESIDUAL_NAME = "MR BRAIN SMITHSON ";
    const lenBytes = Buffer.concat([Buffer.from("SO", "latin1"), Buffer.alloc(2)]);
    const declaredSq = lenBytes.readUInt32LE(0);
    const FIRST_PHYSICAL = 8 + 16; // Item header + (0008,0008) CS "ORIGINAL"
    const ITEM_PHYSICAL = 16;
    const trailingValueLen = declaredSq - FIRST_PHYSICAL - 8 - ITEM_PHYSICAL + 4;
    const raw = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN", value: Buffer.from(RESIDUAL_NAME, "latin1") },
        {
          tag: "0040A730",
          declaredLengthDelta: declaredSq - (FIRST_PHYSICAL + 8 + ITEM_PHYSICAL),
          items: [
            // An honest first item, which is what moves the crossing item's
            // header away from the sequence's value start.
            { elements: [{ tag: "00080008", vr: "CS", value: Buffer.from("ORIGINAL") }] },
            {
              declaredLengthDelta: ITEM_PHYSICAL + 8 + trailingValueLen - ITEM_PHYSICAL,
              elements: [{ tag: "00080008", vr: "CS", value: Buffer.from("ORIGINAL") }],
            },
          ],
        },
        { tag: "00080080", vr: "LO", value: Buffer.alloc(trailingValueLen, 0x41) },
      ],
    });

    // Read the SQ's length field back OFF THE WIRE rather than trusting the
    // helper put it there, as the row above does.
    const sqAt = raw.indexOf(Buffer.from([0x40, 0x00, 0x30, 0xa7]));
    expect(sqAt).toBeGreaterThan(0);
    expect(raw.subarray(sqAt + 8, sqAt + 12).toString("latin1")).toBe("SO\0\0");
    expect(declaredSq).toBe(20307);

    const ds = parseDicom(raw);
    const w = ds.warnings.find((x) => x.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END);
    // Non-vacuity: the code fires, on a parse that SURVIVED.
    expect(w).toBeDefined();
    const runs = w?.message.match(/[0-9]+/gu) ?? [];

    // The shift really is 32 here, not 8, which is the whole point of the row.
    const SHIFT = FIRST_PHYSICAL + 8;
    expect(SHIFT).toBe(32);
    expect(declaredSq - SHIFT).toBe(20275);
    // Non-vacuity on the search: `0.0.14`'s template over the number THIS shape
    // produced really did carry it, so the assertion below can go red.
    expect(
      `...; ${String(declaredSq - SHIFT)} bytes remained inside the sequence.`.match(/[0-9]+/gu) ??
        [],
    ).toContain("20275");
    // ...and neither the shifted number nor the raw one is in the message.
    expect(runs).not.toContain(String(declaredSq - SHIFT));
    expect(runs).not.toContain(String(declaredSq - 8));
    expect(runs).not.toContain(String(declaredSq));
    // The message is the frozen template with the constant Item tag and nothing
    // else, so it cannot depend on the shape at all.
    expect(w?.message).toBe(
      WARNING_MESSAGES.DICOM_ITEM_CROSSES_SEQUENCE_END.replace("{tag}", "FFFEE000"),
    );
  });

  it("emits once per sequence, which is a SHAPE and NOT an amplification bound", () => {
    // An overrunning item consumes to its own declared end, so the item loop
    // exits immediately afterwards: at most one warning per sequence.
    const codes = parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE)).warnings.map((w) => w.code);

    expect(codes.filter((c) => c === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END)).toHaveLength(
      1,
    );
  });

  it("is UNCAPPED across sequences, and that is measured rather than claimed away", () => {
    // 🛑 "At most one per sequence" was shipped as "the amplification bound".
    // It is not one: a file may carry as many sequences as it can encode, and
    // `ds.warnings` is uncapped - `#48`'s pre-existing, package-wide posture for
    // parser warnings, not something this code introduces. Asserting the GROWTH
    // is the honest pin; asserting a cap would pin a cap that does not exist.
    const few = parseDicom(manyOverrunningSequences(8));
    const many = parseDicom(manyOverrunningSequences(64));
    const count = (ds: { warnings: readonly { code: string }[] }): number =>
      ds.warnings.filter((w) => w.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END).length;

    expect(count(few)).toBe(8);
    expect(count(many)).toBe(64);
    // Linear in the sequence count, with no ceiling in between.
    expect(count(many)).toBeGreaterThan(count(few));
  });

  it("does NOT escalate under profiles.strict, only under the { strict: true } option", () => {
    // Disclosed rather than fixed. Adding a code to a shipped preset moves every
    // `profiles.strict` consumer's parse and is a measured behaviour change of
    // its own, not a side effect of adding a code.
    const buf = fixture(EXPLICIT_LE, TRAILING_ON_WIRE);

    expect(() => parseDicom(buf, { profile: profiles.strict })).not.toThrow();
    expect(() => parseDicom(buf, { strict: true })).toThrow(DicomParseError);
    // Non-vacuity: the preset IS active and does escalate what it lists, so
    // "does not throw" above is the code's absence rather than a dead profile.
    expect(profiles.strict.escalations.has(WARNING_CODES.DICOM_VR_MISMATCH)).toBe(true);
    expect(profiles.strict.escalations.has(WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END)).toBe(
      false,
    );
  });

  it("reports a position.byteOffset in the frame parseSequence was handed, not the file", () => {
    // Same frame-dependence as `Element.byteOffset`, and neither documents a
    // contract. Measured in both frames rather than described.
    const flat = parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE)).warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
    );
    const nested = parseDicom(nestedFixture()).warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
    );

    expect(flat?.position.byteOffset).toBeGreaterThan(0);
    // The inner sequence sits deeper in the file than the outer one does, yet
    // reports a SMALLER offset: it is measured inside the enclosing item's
    // slice. That inequality is the whole point and cannot hold by accident.
    expect(nested?.position.byteOffset).toBeLessThan(flat?.position.byteOffset ?? 0);
  });

  it("tells a streaming consumer exactly what the parsed result says", () => {
    // `makeEmitter` hands a warning to `onWarning` BEFORE the push (D-03
    // ordering), so any primitive that emits from a reading it may abandon
    // leaves the two channels disagreeing. Nothing is abandoned here, because
    // nothing is tried.
    const streamed: string[] = [];
    const ds = parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE), {
      onWarning: (w) => streamed.push(w.code),
    });

    expect(streamed).toEqual(ds.warnings.map((w) => w.code));
  });
});

describe("DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ - the reading is untouched, which IS the bar", () => {
  it("reads the over-declaring file exactly as every released version does", () => {
    // Not an aspiration - the whole safety argument. `deidentify()` sees the
    // object `origin/main` gives it, so no de-identification action can move.
    const ds = parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE));

    expect(ds.get("00100010")?.rawBytes.toString("latin1")).toBe(ROOT_NAME);
    expect(ds.get(TRAILING)).toBeUndefined();
    expect([...(ds.get(CARRIER)?.items?.[0]?.elements() ?? [])].map((el) => el.tag)).toEqual([
      ITEM_TAG,
      TRAILING,
    ]);
  });

  it("still finds, acts on and reports the swallowed identifier - nothing leaks", () => {
    // The mis-structure is an AUDIT defect, not a leak, and saying which is the
    // difference between a residual and a blocker. The attribute is inside an
    // item and `deidentify()` recurses into items, so Table E.1-1 reaches it.
    const { dataset, report } = deidentify(parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE)));

    expect(report.attributes.filter((a) => a.tag === TRAILING)).toHaveLength(1);
    expect(serializeDicom(dataset).includes(Buffer.from(TRAILING_VALUE, "ascii"))).toBe(false);
  });

  it("reports it under a contextPath naming the item the reading put it in", () => {
    // Half one of the two-row measurement that REPLACED the deleted "an item it
    // was never in" disclosure. This row is a fact about the reading, not an
    // accusation: the partner file `sqUnderDeclares()` is these same bytes with
    // the element genuinely inside the item, where this contextPath is right.
    const { report } = deidentify(parseDicom(fixture(EXPLICIT_LE, TRAILING_ON_WIRE)));

    expect(report.attributes.find((a) => a.tag === TRAILING)?.contextPath).toEqual([
      `${CARRIER}[0]`,
    ]);
  });

  it("but on the UNDER-DECLARING half the same warning comes with a ROOT attribute and NO contextPath", () => {
    // 🛑 THE MEASUREMENT ROW THAT REPLACES A SENTENCE, AND IT IS WHY THERE IS NO
    // SENTENCE. The troubleshooting row used to promise, unconditionally, that
    // the element following the sequence is read as a per-item attribute under a
    // `contextPath` naming an item it was never in. That is the test ABOVE, and
    // it is only one of the two halves. Here the item is honest and the `SQ` is
    // 6 bytes short: the same code fires on the same bytes-level disagreement,
    // and `(0010,0020)` is at the ROOT with `contextPath` undefined.
    //
    // The two halves are indistinguishable on the wire, so no summary of "what
    // to expect" can be right for both, and neither row is the wrong one. Read
    // the tree, do not read a sentence.
    const ds = parseDicom(fixture(EXPLICIT_LE, 0, -6));

    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END);
    expect([...ds.elements()].map((el) => el.tag)).toEqual(["00100010", CARRIER, TRAILING]);

    const { report } = deidentify(ds);

    expect(report.attributes.find((a) => a.tag === TRAILING)?.contextPath).toBeUndefined();
  });

  it("leaves an honest item under an under-declaring SQ completely alone", () => {
    // The other half of the ambiguity, on files `origin/main` reads correctly.
    // Every one is read exactly as before; what changed is only that the deltas
    // which make an item cross the declared end now say so.
    for (const sqDelta of [-2, -4, -6, -8, -10, -12, -14, -16, -18, -20, -22]) {
      const ds = parseDicom(fixture(EXPLICIT_LE, 0, sqDelta));

      expect(ds.get("00100010")?.rawBytes.toString("latin1")).toBe(ROOT_NAME);
      expect(ds.get(TRAILING)?.rawBytes.toString("latin1").trimEnd()).toBe(TRAILING_VALUE);
      expect(ds.get(CARRIER)?.items?.[0]?.get(ITEM_TAG)?.rawBytes.toString("latin1")).toBe(
        ITEM_VALUE,
      );
    }
  });

  it("keeps the root Patient ID out of de-identified output when the SQ under-declares", () => {
    const { dataset, report } = deidentify(parseDicom(fixture(EXPLICIT_LE, 0, -6)));

    expect(report.attributes.some((a) => a.tag === TRAILING)).toBe(true);
    expect(serializeDicom(dataset).includes(Buffer.from(TRAILING_VALUE, "ascii"))).toBe(false);
  });

  it("still refuses an item declaring past the end of the buffer", () => {
    // Base threw `Item length=N exceeds remaining buffer` and still refuses on
    // the same input; since `DICOM-FATAL-MESSAGE-REGISTRY` the message no longer
    // prints `N`, because that field is four bytes of the document on precisely
    // the files this code fires for. The
    // disclosure fires first and is discarded with the object.
    expect(() => parseDicom(fixture(EXPLICIT_LE, 4096))).toThrow(DicomParseError);
  });
});

describe("DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ - where it deliberately says nothing", () => {
  it("says nothing when the sequence's declared end IS the end of its buffer", () => {
    // `endLimit === buffer.length` is the case with no enclosing Data Set bytes
    // to take. On the in-place path that means the `SQ` ends the Data Set and
    // its declared length is honest, so an item overrunning it also overruns the
    // buffer and the pre-existing truncation guard is the whole story - the same
    // `INVALID_FILE_META` base gives, and no Tier-2 code promoted into a
    // `{ strict: true }` refusal for it. Be exact about the scope: the conjunct
    // is what keeps the slice-bounded callers silent, and that is the test below
    // and the Implicit VR LE one after it, not this one.
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
        {
          tag: CARRIER,
          items: [
            {
              declaredLengthDelta: TRAILING_ON_WIRE,
              elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }],
            },
          ],
        },
      ],
    });

    expect(() => parseDicom(buf)).toThrow(
      /\(FFFE,E000\) Item declares a length reaching past the end/u,
    );
  });

  it("says nothing about an item that stays inside the sequence's declared end", () => {
    // An item ending exactly on the declared end is conformant; an item ending
    // BEFORE it is a different malformation entirely (the sequence's declared
    // extent is not tiled) and this code says nothing about it. Under-declaring
    // the ITEM by 6 leaves the reader mid-value and desynchronizes it, which is
    // `origin/main`'s behaviour and stays that way.
    expect(() => parseDicom(fixture(EXPLICIT_LE, -6))).toThrow(
      /An element declares a Value Length reaching past the end/u,
    );
  });

  it("says nothing about an UNDEFINED-length item with no ItemDelim - a disclosed residual", () => {
    // The same unbounded read in the other item form: with no `(FFFE,E00D)` the
    // inner parser runs to the end of the BUFFER and the trailing root element
    // ends up inside the item. There is no declared item length here, so there
    // is no disagreement to disclose - the item form itself is the residual.
    const buf = buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [
        {
          tag: CARRIER,
          items: [
            {
              undefinedLength: true,
              omitItemDelim: true,
              elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }],
            },
          ],
        },
        { tag: TRAILING, vr: "LO", value: ascii(TRAILING_VALUE) },
      ],
    });
    const ds = parseDicom(buf);

    expect(ds.get(TRAILING)).toBeUndefined();
    expect(ds.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
    );
  });

  it("says nothing on the Implicit VR LE path, which is slice-bounded already", () => {
    // Implicit VR LE routes a defined-length SQ through `tryParseDefinedLengthSQ`,
    // which is handed a slice cut at the declared end - `endLimit ===
    // buffer.length` inside it, so an item cannot reach anything and the descent
    // simply refuses. That asymmetry is deliberate: there `SQ` is this parser's
    // inference from PS3.6, not something the sender wrote. Unchanged by this
    // slice; `#50`'s behaviour is the pin.
    const ds = parseDicom(fixture(IMPLICIT_LE, TRAILING_ON_WIRE));

    expect(ds.get(TRAILING)?.rawBytes.toString("latin1").trimEnd()).toBe(TRAILING_VALUE);
    expect(ds.warnings.map((w) => w.code)).toContain(WARNING_CODES.DICOM_SQ_NOT_DESCENDED);
    expect(ds.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
    );
    expect(ds.get(CARRIER)?.items).toBeUndefined();
  });
});

describe("DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ - one pass, which is a security property", () => {
  /**
   * `depth` defined-length `SQ`s nested one inside the other, each declaring its
   * own length `sqDelta` bytes off, with a leaf `CS` at the bottom.
   */
  function nested(depth: number, sqDelta: number): Buffer {
    let inner: Parameters<typeof buildDicom>[0]["elements"][number] = {
      tag: ITEM_TAG,
      vr: "CS",
      value: ascii(ITEM_VALUE),
    };
    for (let i = 0; i < depth; i++) {
      inner = {
        tag: CARRIER,
        ...(sqDelta === 0 ? {} : { declaredLengthDelta: sqDelta }),
        items: [{ elements: [inner] }],
      };
    }
    return buildDicom({
      transferSyntax: EXPLICIT_LE,
      elements: [inner, { tag: TRAILING, vr: "LO", value: ascii(TRAILING_VALUE) }],
    });
  }

  /**
   * Deliberately loose. The measurement this pins is orders of magnitude apart,
   * not a few percent: the same 20-deep file took **49,476 ms** on a
   * try-then-fallback draft running inside this very suite, against **0.7 ms**
   * on a single pass. Two seconds is a slow CI box and still 25,000x under the
   * regression; a tight budget here would be a flaky test that says nothing
   * extra.
   */
  const ONE_PASS_BUDGET_MS = 2_000;

  it.each([
    ["well-formed", 0],
    ["each SQ over-declaring by 2", 2],
    ["each SQ under-declaring by 2", -2],
  ] as const)("parses 20 nested sequences, %s, in one pass over each level", (_label, sqDelta) => {
    // T-02-04-03, reached by a route the module header did not name. A
    // primitive that runs a reading, discards it and re-reads costs 2x at one
    // level and 2^depth across nested sequences: ~700 bytes of
    // attacker-controlled input against unbounded CPU, with
    // `NESTING_DEPTH_LIMIT` (64) as the only ceiling. **Keep this pin even
    // though the slice no longer contains a candidate reading** - it is what
    // stops one being reintroduced.
    const buf = nested(20, sqDelta);
    expect(buf.length).toBeLessThan(1_000);

    const started = performance.now();
    try {
      parseDicom(buf);
    } catch (err) {
      // Whether these particular bytes parse or refuse is base's business and
      // is pinned elsewhere; what is pinned here is that deciding takes one
      // pass either way.
      expect(err).toBeInstanceOf(DicomParseError);
    }

    expect(performance.now() - started).toBeLessThan(ONE_PASS_BUDGET_MS);
  });

  it("still refuses the 65-level nest, because there is no catch to swallow it", () => {
    // The depth cap is a resource guard (T-02-04-02), not a statement about the
    // bytes. A draft that tried a reading and fell back needed a distinguishable
    // error subclass to stop a catch-all rollback turning the guard into
    // "descend one level less and carry on". There is no catch in this path at
    // all, and this is what proves the guard propagates untouched.
    let nest: Parameters<typeof buildDicom>[0]["elements"][number] = {
      tag: ITEM_TAG,
      vr: "CS",
      value: ascii(ITEM_VALUE),
    };
    for (let i = 0; i < 65; i++) {
      nest = { tag: CARRIER, items: [{ elements: [nest] }] };
    }

    expect(() => parseDicom(buildDicom({ transferSyntax: EXPLICIT_LE, elements: [nest] }))).toThrow(
      /depth exceeds 64/u,
    );
  });
});

describe("DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ - no-loss controls (green on base by design)", () => {
  it("leaves a well-formed defined-length SQ exactly as it was", () => {
    const ds = parseDicom(fixture(EXPLICIT_LE, 0));

    expect(ds.get(TRAILING)?.rawBytes.toString("latin1").trimEnd()).toBe(TRAILING_VALUE);
    expect(ds.get(CARRIER)?.items).toHaveLength(1);
    expect(ds.get(CARRIER)?.items?.[0]?.get(ITEM_TAG)?.rawBytes.toString("latin1")).toBe(
      ITEM_VALUE,
    );
    expect(ds.warnings).toHaveLength(0);
  });

  it("leaves an undefined-length item that DOES carry its ItemDelim alone", () => {
    const ds = parseDicom(
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          {
            tag: CARRIER,
            items: [
              {
                undefinedLength: true,
                elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }],
              },
            ],
          },
          { tag: TRAILING, vr: "LO", value: ascii(TRAILING_VALUE) },
        ],
      }),
    );

    expect(ds.get(TRAILING)?.rawBytes.toString("latin1").trimEnd()).toBe(TRAILING_VALUE);
    expect(ds.get(CARRIER)?.items?.[0]?.get(ITEM_TAG)?.rawBytes.toString("latin1")).toBe(
      ITEM_VALUE,
    );
    // An item ending exactly at the sequence's declared end is conformant, and
    // warning on it would promote a legal file to a throw under `{strict:true}`.
    expect(ds.warnings).toHaveLength(0);
  });

  it("leaves the UNDEFINED-length sequence form alone", () => {
    // An undefined-length SQ has no declared end for an item to cross; its items
    // are terminated by `(FFFE,E0DD)`.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          {
            tag: CARRIER,
            undefinedLength: true,
            items: [{ elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }] }],
          },
          { tag: TRAILING, vr: "LO", value: ascii(TRAILING_VALUE) },
        ],
      }),
    );

    expect(ds.get(TRAILING)?.rawBytes.toString("latin1").trimEnd()).toBe(TRAILING_VALUE);
    expect(ds.get(CARRIER)?.items?.[0]?.get(ITEM_TAG)?.rawBytes.toString("latin1")).toBe(
      ITEM_VALUE,
    );
    expect(ds.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.DICOM_ITEM_CROSSES_SEQUENCE_END,
    );
  });

  it("leaves a well-formed nested defined-length SQ inside an item alone", () => {
    // `_parseExplicit` runs on the item's own slice, so a nested sequence's
    // enclosing Data Set is the item, and the `endLimit < buffer.length`
    // conjunct is evaluated in that frame - the right one. On a well-formed nest
    // nothing fires.
    const ds = parseDicom(
      buildDicom({
        transferSyntax: EXPLICIT_LE,
        elements: [
          {
            tag: CARRIER,
            items: [
              {
                elements: [
                  {
                    tag: "00081140",
                    items: [{ elements: [{ tag: ITEM_TAG, vr: "CS", value: ascii(ITEM_VALUE) }] }],
                  },
                  { tag: "00080060", vr: "CS", value: ascii("CT") },
                ],
              },
            ],
          },
        ],
      }),
    );

    expect(ds.warnings).toHaveLength(0);
    expect(
      ds
        .get(CARRIER)
        ?.items?.[0]?.get("00081140")
        ?.items?.[0]?.get(ITEM_TAG)
        ?.rawBytes.toString("latin1"),
    ).toBe(ITEM_VALUE);
  });
});

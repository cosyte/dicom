/**
 * `renderTag`: the membership bound `DICOM-DIAGNOSTIC-PHI-RESIDUALS` closed its
 * fifth and sixth instances with.
 *
 * The integration rows in `test/integration/fatal-diagnostic-surface.test.ts`
 * prove the leak is gone off real fixtures. These are the direct unit rows for
 * the predicate itself, and they exist because the predicate has exactly one
 * interesting property and it is not "does it render a tag": it is **which
 * closed set vouches, and what that set does NOT contain**.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { TAGS } from "../../src/dictionary/generated/tags.js";
import { WITHHELD, renderTag, renderVr } from "../../src/parser/tokens.js";

describe("renderTag is a MEMBERSHIP test against PS3.6, not a shape test", () => {
  it("renders a tag the registry carries a literal row for", () => {
    expect(renderTag("00100010")).toBe("00100010");
    expect(renderTag("7FE00010")).toBe("7FE00010");
    // `(FFFE,E000)` Item is a registry row too, which is what keeps
    // `DICOM_ITEM_CROSSES_SEQUENCE_END` and `DICOM_EMPTY_ITEM_IN_SEQUENCE`
    // naming the constant they were always naming.
    expect(renderTag("FFFEE000")).toBe("FFFEE000");
  });

  it("withholds the two fabricated tags this item measured", () => {
    // `"IN S"` and `" BRA"` in wire order: four letters each, out of
    // `"MR BRAIN SMITHSON "`, composed by a desynchronized Explicit VR LE read
    // and rendered verbatim by `DICOM_ODD_LENGTH_VALUE_PADDED` through `0.0.14`.
    expect(renderTag("4E495320")).toBe(WITHHELD);
    expect(renderTag("42204152")).toBe(WITHHELD);
  });

  it("🛑 withholds a REPEATING-GROUP MASK hit, and that cost a graded pass to learn", () => {
    // A mask match proves a RULE exists; it does not make membership finite.
    // `(50xx,xxxx)` Curve Data leaves the whole 16-bit element number free, so a
    // family test admits 16 x 65,536 tags whose free bits are raw document
    // bytes. `500C5241` is `"\fPAR"` - a form feed and three letters of a
    // surname - and it is the counterexample that refuted the sibling half of
    // this item's second instance.
    expect(renderTag("500C5241")).toBe(WITHHELD);
    // Non-vacuity on the PREMISE, not just the outcome: this really is a tag the
    // `50xx` family covers, so the row cannot pass because it stopped being a
    // counterexample.
    expect(TAGS["50xx5241"]).toBeUndefined();
    expect(TAGS["50xx3000"]).toBeDefined();
    expect(TAGS["50xx3000"]?.repeatingGroup).toBe(true);
    expect(Buffer.from([0x0c, 0x50, 0x41, 0x52]).toString("latin1")).toBe("\fPAR");
  });

  it("withholds a genuine repeating-group member too, and that is a real cost", () => {
    // `(6000,3000)` Overlay Data is a real attribute on real files. PS3.6 names
    // it only through the `60xx3000` family row, so no literal row vouches for
    // this tag and the message loses it. Stated rather than minimised: the
    // element is still in the Data Set under that tag and the warning's
    // `position.byteOffset` locates the header.
    expect(renderTag("60003000")).toBe(WITHHELD);
    expect(TAGS["60003000"]).toBeUndefined();
    expect(TAGS["60xx3000"]).toBeDefined();
  });

  it("withholds a private tag and a Group Length tag", () => {
    expect(renderTag("00091001")).toBe(WITHHELD);
    expect(renderTag("00080000")).toBe(WITHHELD);
    // Exactly one registry row ends `0000`, and it is File Meta - which is why
    // `groupLengthInDataset`'s slot could never render and was bound out of the
    // signature instead of left to print `<withheld>` forever.
    expect(Object.keys(TAGS).filter((k) => k.endsWith("0000"))).toStrictEqual(["00020000"]);
  });

  it("still refuses a token that is not tag-shaped at all", () => {
    // The shape conjunct is kept beside the membership one. It is what caught
    // `unParsedAsSQ` passing the literal string "UN" in the tag slot.
    expect(renderTag(undefined)).toBe(WITHHELD);
    expect(renderTag("UN")).toBe(WITHHELD);
    expect(renderTag("00100010extra")).toBe(WITHHELD);
    // Lower case is not the shape this parser composes, so it is refused before
    // the lookup rather than normalized into one.
    expect(renderTag("0040a730")).toBe(WITHHELD);
    expect(renderTag("0040A730")).toBe("0040A730");
  });

  it("the closed set is enumerable, which is the whole argument", () => {
    // `renderVr` renders against 34 members; this renders against the literal
    // rows of PS3.6's registry. Both are published sets a reader can hold in
    // their hand, which is what separates them from a shape test over 2^32.
    const literal = Object.keys(TAGS).filter((k) => /^[0-9A-F]{8}$/u.test(k));
    const masked = Object.keys(TAGS).filter((k) => !/^[0-9A-F]{8}$/u.test(k));
    expect(literal.length).toBe(5221);
    expect(masked.length).toBe(88);
    // Every masked key is flagged, and no literal key is: the two populations do
    // not overlap, so "literal row" and "not a repeating-group family" are the
    // same test here rather than two tests that happen to agree today.
    expect(masked.every((k) => TAGS[k]?.repeatingGroup === true)).toBe(true);
    expect(literal.some((k) => TAGS[k]?.repeatingGroup === true)).toBe(false);
    expect(renderVr("PN")).toBe("PN");
  });
});

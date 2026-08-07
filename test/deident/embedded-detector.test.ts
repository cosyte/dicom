/**
 * Unit coverage for the embedded-Data-Element detector itself
 * (`src/deident/embedded.ts`).
 *
 * The integration behaviour lives in `embedded-attribute.test.ts`; this file
 * exercises the decoder's refusals one at a time. Every refusal here is a case
 * where the bytes *nearly* look like a swallowed element, and each one exists so
 * that a value is never emptied on a coincidence: the cost of a false positive
 * is deleting data a caller needed, which is a different failure from the leak
 * this module closes but still a real one.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { findEmbeddedAttributes, MAX_SCAN_BYTES } from "../../src/deident/embedded.js";
import { annexE } from "../../src/dictionary/annex-e.js";
import { ANNEX_E } from "../../src/dictionary/generated/annex-e.js";
import type { Tag, VR } from "../../src/dictionary/types.js";

const PATIENT_ID_TAG: Tag = "00100020";
const always = (): boolean => true;

/**
 * The run's `hidden` list, or `undefined` when there was no run.
 *
 * Most rows in this file grade the DECODER - which byte patterns are a swallow -
 * and `isActionable` is `always` in them, so `hidden` is the whole run and this
 * reads exactly as the pre-`DICOM-DIAGNOSTIC-PHI-RESIDUALS` return did. The
 * filter itself is graded in its own describe block below, where `isActionable`
 * is not `always`.
 */
function hiddenOf(run: ReturnType<typeof findEmbeddedAttributes>): readonly Tag[] | undefined {
  return run?.hidden;
}

/** An Explicit VR LE short-form element: 4-byte tag, 2-byte VR, 2-byte length. */
function shortForm(group: number, element: number, vr: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, "latin1");
  head.writeUInt16LE(body.length, 6);
  return Buffer.concat([head, body]);
}

/** An Explicit VR LE long-form element: 4-byte tag, 2-byte VR, 2 reserved, 4-byte length. */
function longForm(group: number, element: number, vr: string, body: Buffer, reserved = 0): Buffer {
  const head = Buffer.alloc(12);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, "latin1");
  head.writeUInt16LE(reserved, 6);
  head.writeUInt32LE(body.length, 8);
  return Buffer.concat([head, body]);
}

/** An implicit-VR element: 4-byte tag, 4-byte length, no VR field. */
function implicit(group: number, element: number, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

const ID = Buffer.from("MRN-11111 ", "latin1");

describe("findEmbeddedAttributes: what it refuses", () => {
  it("finds a short-form Explicit VR LE element at the end of a value", () => {
    const value = Buffer.concat([Buffer.from("ORIGINAL"), shortForm(0x0010, 0x0020, "LO", ID)]);
    expect(hiddenOf(findEmbeddedAttributes(value, "CS", "explicitLE", always))).toEqual([
      PATIENT_ID_TAG,
    ]);
  });

  it("finds a long-form element, and refuses the same bytes with non-zero reserved bytes", () => {
    const body = Buffer.from("2.25.1234567890 ", "latin1");
    const ok = Buffer.concat([Buffer.from("ORIGINAL"), longForm(0x0010, 0x0020, "UC", body)]);
    expect(hiddenOf(findEmbeddedAttributes(ok, "CS", "explicitLE", always))).toEqual([
      PATIENT_ID_TAG,
    ]);
    // PS3.5 Table 7.1-2 fixes those two bytes at 0000H, so a non-zero pair is
    // not something a conformant encoder produced.
    const bad = Buffer.concat([
      Buffer.from("ORIGINAL"),
      longForm(0x0010, 0x0020, "UC", body, 0x01),
    ]);
    expect(findEmbeddedAttributes(bad, "CS", "explicitLE", always)).toBeUndefined();
  });

  it("refuses an odd declared length in either header form", () => {
    // PS3.5 section 7.1: every Value Field is an even number of bytes.
    const odd = shortForm(0x0010, 0x0020, "LO", ID);
    odd.writeUInt16LE(ID.length - 1, 6);
    expect(
      findEmbeddedAttributes(Buffer.concat([Buffer.from("AB"), odd]), "CS", "explicitLE", always),
    ).toBeUndefined();
    const oddLong = longForm(0x0010, 0x0020, "UC", ID);
    oddLong.writeUInt32LE(ID.length - 1, 8);
    expect(
      findEmbeddedAttributes(
        Buffer.concat([Buffer.from("AB"), oddLong]),
        "CS",
        "explicitLE",
        always,
      ),
    ).toBeUndefined();
  });

  it("refuses an undefined length in either header form", () => {
    // 0xFFFFFFFF says "look for a delimiter", which a value cannot promise.
    const undef = longForm(0x0010, 0x0020, "UC", ID);
    undef.writeUInt32LE(0xffffffff, 8);
    expect(findEmbeddedAttributes(undef, "CS", "explicitLE", always)).toBeUndefined();
    const undefImplicit = implicit(0x0010, 0x0020, ID);
    undefImplicit.writeUInt32LE(0xffffffff, 4);
    expect(findEmbeddedAttributes(undefImplicit, "CS", "implicit", always)).toBeUndefined();
  });

  it("refuses a declared length that runs past the end of the value", () => {
    const over = shortForm(0x0010, 0x0020, "LO", ID);
    over.writeUInt16LE(ID.length + 2, 6);
    expect(findEmbeddedAttributes(over, "CS", "explicitLE", always)).toBeUndefined();
    const overLong = longForm(0x0010, 0x0020, "UC", ID);
    overLong.writeUInt32LE(ID.length + 2, 8);
    expect(findEmbeddedAttributes(overLong, "CS", "explicitLE", always)).toBeUndefined();
    const overImplicit = implicit(0x0010, 0x0020, ID);
    overImplicit.writeUInt32LE(ID.length + 2, 4);
    expect(findEmbeddedAttributes(overImplicit, "CS", "implicit", always)).toBeUndefined();
  });

  it("refuses a long-form header the value is too short to hold", () => {
    const truncated = longForm(0x0010, 0x0020, "UC", Buffer.alloc(0)).subarray(0, 10);
    expect(findEmbeddedAttributes(truncated, "CS", "explicitLE", always)).toBeUndefined();
  });

  it("refuses two bytes that are not one of the 34 VRs", () => {
    const value = Buffer.concat([Buffer.from("ORIGINAL"), shortForm(0x0010, 0x0020, "ZZ", ID)]);
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", always)).toBeUndefined();
  });

  it("refuses (0000,0000), so a run of NUL padding cannot tile", () => {
    // Eight NULs decode as tag (0000,0000) with length 0 under implicit VR, and
    // would otherwise chain to the end of any NUL-padded value.
    expect(findEmbeddedAttributes(Buffer.alloc(64), "CS", "implicit", always)).toBeUndefined();
  });

  it("refuses an odd declared length under implicit VR", () => {
    const odd = implicit(0x0010, 0x0020, ID);
    odd.writeUInt32LE(ID.length - 1, 4);
    expect(findEmbeddedAttributes(odd, "CS", "implicit", always)).toBeUndefined();
  });

  it("walks an item stream, stepping over the (FFFE,xxxx) markers", () => {
    // The shape a swallowed *sequence* leaves behind: item header, elements,
    // item delimiter. The markers carry no tag of their own, so only the real
    // element is reported.
    const itemBody = shortForm(0x0010, 0x0020, "LO", ID);
    const itemHeader = Buffer.alloc(8);
    itemHeader.writeUInt16LE(0xfffe, 0);
    itemHeader.writeUInt16LE(0xe000, 2);
    itemHeader.writeUInt32LE(itemBody.length, 4);
    const delim = Buffer.alloc(8);
    delim.writeUInt16LE(0xfffe, 0);
    delim.writeUInt16LE(0xe0dd, 2);
    const value = Buffer.concat([Buffer.from("ORIGINAL"), itemHeader, itemBody, delim]);
    expect(hiddenOf(findEmbeddedAttributes(value, "CS", "explicitLE", always))).toEqual([
      PATIENT_ID_TAG,
    ]);
  });

  it("decodes big-endian headers when the file is Explicit VR BE", () => {
    const head = Buffer.alloc(8);
    head.writeUInt16BE(0x0010, 0);
    head.writeUInt16BE(0x0020, 2);
    head.write("LO", 4, "latin1");
    head.writeUInt16BE(ID.length, 6);
    const value = Buffer.concat([Buffer.from("ORIGINAL"), head, ID]);
    expect(hiddenOf(findEmbeddedAttributes(value, "CS", "explicitBE", always))).toEqual([
      PATIENT_ID_TAG,
    ]);
    // The same bytes read little-endian are tag (1000,2000), which nothing here
    // recognises - the endianness is not guessed.
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", (t) => t === PATIENT_ID_TAG)).toBe(
      undefined,
    );
  });

  it("refuses a value too short to hold any header at all", () => {
    expect(findEmbeddedAttributes(Buffer.from("ABCD"), "CS", "explicitLE", always)).toBeUndefined();
  });

  it("scans the trailing window of an over-long value", () => {
    // The window bound exists so the memo arrays are sized here rather than by a
    // declared length. A swallow ends at the end of the value, so it is inside
    // the window by construction - which this proves rather than assumes.
    const embedded = shortForm(0x0010, 0x0020, "LO", ID);
    const filler = Buffer.alloc(MAX_SCAN_BYTES, 0x41);
    const value = Buffer.concat([filler, embedded]);
    expect(hiddenOf(findEmbeddedAttributes(value, "UT", "explicitLE", always))).toEqual([
      PATIENT_ID_TAG,
    ]);
  });
});

// ---------------------------------------------------------------------------
// `DICOM-DIAGNOSTIC-PHI-RESIDUALS`: what a reported run may NAME.
// ---------------------------------------------------------------------------

describe("findEmbeddedAttributes: hidden carries only the tags the run acts on", () => {
  /**
   * The fixture the residual was measured on, rebuilt here as a unit. Synthetic
   * and **name-bearing**: `#55` paid a blocker for a PHI pin whose payload
   * carried no name, so nothing it asserted could have caught the leak.
   *
   * `"SMIT"` is the surname's first four bytes wearing a Data Element header's
   * clothes; `(0010,0020)` beside it is the genuine, actionable attribute that
   * makes the whole run reportable and used to drag `"SMIT"` onto the report.
   */
  function fabricatedBesideGenuine(): Buffer {
    return Buffer.concat([
      Buffer.from("BRAIN ", "latin1"),
      // Group and element are the LITTLE-ENDIAN reads of `S M I T`, so the four
      // bytes on the wire spell the surname and the tag this parser composes
      // from them is `SMIT_AS_TAG`. Writing 0x534D here instead would put
      // `"MSTI"` on the wire and the fixture would prove nothing.
      shortForm(0x4d53, 0x5449, "SH", Buffer.from("ASHTON", "latin1")),
      shortForm(0x0010, 0x0020, "LO", ID),
    ]);
  }

  /** How this parser composes `"SMIT"` into a tag - recovered, not typed. */
  const SMIT_AS_TAG: Tag = "4D535449";

  it("the fabricated neighbour is not named, and the actionable tag still is", () => {
    const run = findEmbeddedAttributes(
      fabricatedBesideGenuine(),
      "CS",
      "explicitLE",
      (t) => t === PATIENT_ID_TAG,
    );
    expect(run).toBeDefined();
    expect(run?.hidden).toEqual([PATIENT_ID_TAG]);
    expect(run?.hidden).not.toContain(SMIT_AS_TAG);
  });

  it("non-vacuity: those four bytes ARE the planted surname's, and the run really holds them", () => {
    // Without this the row above could pass because the fixture never carried
    // the thing it claims to bound - vacuous BY FIXTURE, this repo's own trap.
    const smit = Buffer.from("SMIT", "latin1");
    const composed =
      smit.readUInt16LE(0).toString(16).padStart(4, "0").toUpperCase() +
      smit.readUInt16LE(2).toString(16).padStart(4, "0").toUpperCase();
    expect(composed).toBe(SMIT_AS_TAG);
    // And the fixture really does carry those bytes, in that order, inside the
    // carrier's value - the fact the whole row rests on.
    expect(fabricatedBesideGenuine().includes(smit)).toBe(true);
    // The scanner really does reach the fabricated element: it is counted in the
    // run. So `hidden` naming one tag is the filter working, not the fixture
    // failing to produce two - which is the distinction a vacuous pin loses.
    const run = findEmbeddedAttributes(fabricatedBesideGenuine(), "CS", "explicitLE", always);
    expect(run?.elementCount).toBe(2);
    expect(run?.hidden).toEqual([PATIENT_ID_TAG]);
  });

  it("a REPEATING-GROUP MASK hit is excluded, and an even group alone would have admitted it", () => {
    // 🩺 THE COUNTEREXAMPLE A GRADED PASS FOUND, against a draft of this filter
    // whose second conjunct was "the group is even". `annexE()` falls through to
    // the repeating-group rules, and `(50xx,xxxx)` Curve Data leaves the whole
    // 16-bit element number free: 16 groups x 65,536 elements against 652
    // literal rows. So an even-group test admits a million tags whose free bits
    // are raw document bytes, and this window is one of them.
    //
    // `"\fPAR"` is a form feed (one of the five C0 controls PS3.5 Table 6.1-1
    // admits) plus three letters of a synthetic surname. It composes `500C5241`,
    // and the composition is a bijection, so admitting it returns all four bytes
    // with one typed read - exactly the leak `"SMIT"` was.
    const window = "\fPAR";
    const bytes = Buffer.from(window, "latin1");
    const composed =
      bytes.readUInt16LE(0).toString(16).padStart(4, "0").toUpperCase() +
      bytes.readUInt16LE(2).toString(16).padStart(4, "0").toUpperCase();
    expect(composed).toBe("500C5241");
    // Non-vacuity on the premise, not just on the outcome: this tag really is
    // actionable, really is an EVEN group, and really resolves only by a mask.
    expect(parseInt(composed.slice(0, 4), 16) % 2).toBe(0);
    const action = annexE(composed);
    expect(action).toBeDefined();
    expect(action?.repeatingGroup).toBe("50xxxxxx");

    const value = Buffer.concat([
      Buffer.from("BRAIN ", "latin1"),
      shortForm(
        bytes.readUInt16LE(0),
        bytes.readUInt16LE(2),
        "SH",
        Buffer.from("ASHTON", "latin1"),
      ),
      shortForm(0x0010, 0x0020, "LO", ID),
    ]);
    const run = findEmbeddedAttributes(value, "CS", "explicitLE", always);
    expect(run?.elementCount).toBe(2);
    expect(run?.hidden).not.toContain(composed);
    expect(run?.hidden).toEqual([PATIENT_ID_TAG]);
  });

  it("no literal Table E.1-1 row is an odd group, so the bound needs no second test for private", () => {
    // The filter is one conjunct rather than two because of this fact about the
    // generated table. Asserted rather than assumed: if a future edition adds an
    // odd-group literal row, this reds and the reasoning gets re-derived.
    const odd = Object.keys(ANNEX_E).filter((tag) => parseInt(tag.slice(0, 4), 16) % 2 === 1);
    expect(odd).toStrictEqual([]);
    expect(Object.keys(ANNEX_E).length).toBeGreaterThan(600);
  });

  it("an odd group is excluded even when the run's own action table acts on it", () => {
    // The measured hole in the first draft of this filter, and the reason it has
    // two conjuncts. The Basic Profile removes private attributes as a CLASS, so
    // the caller's `isActionable` answers `true` for every odd-group tag - which
    // is exactly what a fabricated header lands on. `always` here stands in for
    // that, and `SMIT_AS_TAG`'s group `4D53` is odd.
    expect(parseInt(SMIT_AS_TAG.slice(0, 4), 16) % 2).toBe(1);
    const run = findEmbeddedAttributes(fabricatedBesideGenuine(), "CS", "explicitLE", always);
    expect(run?.hidden).not.toContain(SMIT_AS_TAG);
  });

  it("a run whose only actionable tags are private reports a finding with an empty hidden", () => {
    // The consequence, stated rather than hidden: the carrier is still emptied
    // and still counted, and `hidden` is empty because nothing in the run is a
    // tag a published table names. A consumer must not read `hidden.length === 0`
    // as "nothing was hidden here".
    const value = Buffer.concat([
      Buffer.from("BRAIN ", "latin1"),
      shortForm(0x4d53, 0x5449, "SH", Buffer.from("ASH ON", "latin1")),
    ]);
    const run = findEmbeddedAttributes(value, "CS", "explicitLE", always);
    expect(run).toBeDefined();
    expect(run?.elementCount).toBe(1);
    expect(run?.hidden).toStrictEqual([]);
  });

  it("elementCount counts the whole run, so the warning's {n} did not silently re-scope", () => {
    const run = findEmbeddedAttributes(
      fabricatedBesideGenuine(),
      "CS",
      "explicitLE",
      (t) => t === PATIENT_ID_TAG,
    );
    // Two whole Data Elements were swallowed; one of them is an attribute this
    // run acts on. Both numbers are reported, by different fields.
    expect(run?.elementCount).toBe(2);
    expect(run?.hidden).toHaveLength(1);
  });

  it("the filter does not decide WHETHER a run is reported, only what it names", () => {
    // `isActionable` was always the reportability test; this slice gave it a
    // second job. A run with nothing actionable in it is still not a finding.
    expect(
      findEmbeddedAttributes(fabricatedBesideGenuine(), "CS", "explicitLE", () => false),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PS3.5 §6.1.3 + Table 6.1-1 permit five C0 control characters in DICOM text;
// **Table 6.2-1 decides which of the five each VR may hold**, and it is three
// tiers rather than two. Getting the split wrong is unsafe in both directions:
// too tolerant and a header byte reads as legitimate content, too strict and a
// conformant value looks like evidence of a swallow.
// ---------------------------------------------------------------------------

describe("findEmbeddedAttributes: the per-VR control-character tiers of Table 6.2-1", () => {
  /** A `(0010,0020)` swallowed at the end of a value, prefixed by `prefix`. */
  function withEmbedded(prefix: Buffer): Buffer {
    return Buffer.concat([prefix, shortForm(0x0010, 0x0020, "LO", ID)]);
  }

  it.each([
    ["LT", "\t"],
    ["ST", "\r\n"],
    ["UT", "\f"],
  ])(
    "%s may contain TAB/CR/LF/FF/ESC, so those alone are not evidence of a swallow",
    (vr, controls) => {
      // Table 6.2-1, verbatim for all three: "It may contain the Graphic
      // Character set and the Control Characters, TAB, CR, LF, FF, and ESC."
      const body = Buffer.from(`LINE ONE${controls}LINE TWO `, "latin1");
      const value = body.length % 2 === 0 ? body : Buffer.concat([body, Buffer.from(" ")]);
      expect(findEmbeddedAttributes(value, vr as VR, "explicitLE", always)).toBeUndefined();
      // ...and a real header inside such a value is still caught: the tolerance
      // is for the five bytes, not for NULs.
      expect(
        hiddenOf(findEmbeddedAttributes(withEmbedded(value), vr as VR, "explicitLE", always)),
      ).toEqual([PATIENT_ID_TAG]);
    },
  );

  /**
   * A run whose every byte is graphic **except one control character**, so the
   * repertoire conjunct - and only it - decides the answer. `code` lands in the
   * tag's low byte; every other header byte is `20` (SPACE), the VR is `LO` and
   * the declared length is `0x2020`, which tiles exactly.
   */
  function tiledRunWhoseOnlyControlByteIs(code: number): Buffer {
    const head = Buffer.from([code, 0x20, 0x20, 0x20, 0x4c, 0x4f, 0x20, 0x20]);
    return Buffer.concat([head, Buffer.alloc(0x2020, 0x41)]);
  }

  it.each(["LO", "SH", "UC", "PN"])("%s permits ESC and nothing else", (vr) => {
    // Table 6.2-1: "shall not have Control Characters except ESC". ESC is how
    // ISO 2022 code extension is invoked under (0008,0005), so a conformant
    // Japanese or Korean patient name legitimately carries one - treating it as
    // evidence of a swallow would put a false positive on exactly the attributes
    // that hold names. Deliberate consequence, stated rather than hidden: a run
    // whose ONLY non-graphic byte is ESC is not detected in these four.
    expect(
      findEmbeddedAttributes(tiledRunWhoseOnlyControlByteIs(0x1b), vr as VR, "explicitLE", always),
    ).toBeUndefined();
    // TAB is not permitted here, and `UC` is why this test exists: it was
    // grouped with LT/ST/UT until Table 6.2-1 was re-derived, which made it
    // fail-open on TAB/CR/LF/FF - a swallowed run exactly like this one went
    // undetected in a text VR.
    // `elementCount` rather than `hidden`, because this run's tag `(2009,2020)`
    // is an ODD group and `hidden` names only tags a published table vouches
    // for. The row grades the repertoire conjunct - was the run DETECTED - and
    // the count is what carries that now.
    const run = findEmbeddedAttributes(
      tiledRunWhoseOnlyControlByteIs(0x09),
      vr as VR,
      "explicitLE",
      always,
    );
    expect(run?.elementCount).toBe(1);
    expect(hiddenOf(run)).toStrictEqual([]);
  });

  it.each(["LT", "ST", "UT"])("%s permits TAB, so the same run is not evidence there", (vr) => {
    expect(
      findEmbeddedAttributes(tiledRunWhoseOnlyControlByteIs(0x09), vr as VR, "explicitLE", always),
    ).toBeUndefined();
  });

  it("CS, AE, UI and the other narrow VRs admit no control character at all", () => {
    // `AE`'s Table 6.2-1 row is explicit - "and all control characters" are
    // excluded; the numeric, date/time and identifier VRs are restricted to
    // narrow graphic subsets, so even an ESC is already non-conformant there.
    for (const vr of ["CS", "AE", "UI", "DA", "TM", "DS", "IS", "AS", "DT", "UR"] as const) {
      // As above: `(201B,2020)` is an odd group, so detection is graded by the
      // count and `hidden` is empty by design.
      const run = findEmbeddedAttributes(
        tiledRunWhoseOnlyControlByteIs(0x1b),
        vr,
        "explicitLE",
        always,
      );
      expect(run?.elementCount, vr).toBe(1);
      expect(hiddenOf(run), vr).toStrictEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Cost. The sibling sequence slice was refused twice for a remedy whose work
// was exponential in nesting depth; this module's first round shipped a
// quadratic second loop for the same reason - a plausible per-candidate check
// that nobody had built an adversarial input for.
// ---------------------------------------------------------------------------

describe("findEmbeddedAttributes: cost on an adversarial value", () => {
  /**
   * A value whose **every even offset** is a tiling candidate: `FE FF` repeated
   * decodes as an `(FFFE,xxxx)` marker wherever you start, and both bytes are
   * graphic so no repertoire test can short-circuit on them. It is terminated by
   * one all-graphic element header so the run reaches an actionable tag.
   *
   * Under the pre-remedy forward loop this cost one full tail scan per candidate
   * - measured at 22.5 s for 256 KiB and 257 s at the 1 MiB cap, against 2-4 ms
   * to parse the same file. It is a few hundred bytes of attacker-chosen input.
   */
  function everyOffsetIsACandidate(bytes: number): Buffer {
    const markers = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i += 2) {
      markers[i] = 0xfe;
      markers[i + 1] = 0xff;
    }
    // (2021,2020) VR "DA" length 0x2020 - every header byte >= 0x20.
    const head = Buffer.from([0x21, 0x20, 0x20, 0x20, 0x44, 0x41, 0x20, 0x20]);
    return Buffer.concat([markers, head, Buffer.alloc(0x2020, 0x41)]);
  }

  it.each([
    [1 << 14, "16 KiB"],
    [1 << 18, "256 KiB"],
  ])("stays flat at %i bytes (%s) of marker bytes", (bytes) => {
    const value = everyOffsetIsACandidate(bytes);
    const started = performance.now();
    findEmbeddedAttributes(value, "SH", "explicitLE", always);
    // Generous by two orders of magnitude against the pre-remedy 22.5 s at this
    // size: the assertion is "not quadratic", not a benchmark.
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

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
import type { Tag, VR } from "../../src/dictionary/types.js";

const PATIENT_ID_TAG: Tag = "00100020";
const always = (): boolean => true;

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
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
  });

  it("finds a long-form element, and refuses the same bytes with non-zero reserved bytes", () => {
    const body = Buffer.from("2.25.1234567890 ", "latin1");
    const ok = Buffer.concat([Buffer.from("ORIGINAL"), longForm(0x0010, 0x0020, "UC", body)]);
    expect(findEmbeddedAttributes(ok, "CS", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
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
    expect(findEmbeddedAttributes(value, "CS", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
  });

  it("decodes big-endian headers when the file is Explicit VR BE", () => {
    const head = Buffer.alloc(8);
    head.writeUInt16BE(0x0010, 0);
    head.writeUInt16BE(0x0020, 2);
    head.write("LO", 4, "latin1");
    head.writeUInt16BE(ID.length, 6);
    const value = Buffer.concat([Buffer.from("ORIGINAL"), head, ID]);
    expect(findEmbeddedAttributes(value, "CS", "explicitBE", always)).toEqual([PATIENT_ID_TAG]);
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
    expect(findEmbeddedAttributes(value, "UT", "explicitLE", always)).toEqual([PATIENT_ID_TAG]);
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
      expect(findEmbeddedAttributes(withEmbedded(value), vr as VR, "explicitLE", always)).toEqual([
        PATIENT_ID_TAG,
      ]);
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
    expect(
      findEmbeddedAttributes(tiledRunWhoseOnlyControlByteIs(0x09), vr as VR, "explicitLE", always),
    ).toEqual(["20092020"]);
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
      expect(
        findEmbeddedAttributes(tiledRunWhoseOnlyControlByteIs(0x1b), vr, "explicitLE", always),
      ).toEqual(["201B2020"]);
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

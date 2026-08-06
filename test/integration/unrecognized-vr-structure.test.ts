/**
 * `DICOM-UNRECOGNIZED-VR-SHORT-FORM` - an Explicit VR this edition of PS3.5
 * does not define is read (and written) **long-form**, per section 6.2's
 * normative "shall".
 *
 * ## The clause, read from the pin and not from memory
 *
 * PS3.5 2026c section 6.2 "Value Representation (VR)", body text, one occurrence
 * in the vendored document (`vendor/nema/part05`, `4dfd7b8c…`): "All new VRs
 * defined in future versions of DICOM **shall** be of the same Data Element
 * Structure as defined in [section 7.1.2] with reserved bytes after the VR and a
 * 32-bit unsigned integer VL (i.e., following the format for VRs such as OB or
 * UT), and may or may not permit Undefined Length."
 *
 * Section 6.2's **note** ("an implementation may choose to ignore VRs not
 * recognized by applying the rules stated in [section 7.1.2]") is informative
 * and is deliberately **not** what these tests rest on. Cite the "shall".
 *
 * ## What a conformant future-VR file used to do: NO SENTENCE, ON PURPOSE
 *
 * Four attempts have now been made to summarize that in one sentence and all
 * four were wrong, the fourth by this very file. It is **shape-specific**: the
 * old short-form read took the carrier's length from the two bytes section 7.1.2
 * reserves, got `0`, and resumed inside the 32-bit VL field - so what happened
 * next depended on the payload's own bytes. Sometimes a whole-object
 * `INVALID_FILE_META`; sometimes a **clean parse into a tree the sender did not
 * write**, with a zero-length carrier plus an element manufactured out of the
 * payload and, under Explicit VR BE, **no warning on either channel**
 * (`long-payload-tiles` in `scripts/measure-unrecognized-vr.ts`).
 *
 * That script prints the per-shape table for both trees. **Add a shape rather
 * than writing a sentence.**
 *
 * ## The trade, which is the reason this is a fixed slice and not a fixed line
 *
 * The mirror shape pays for it: a sender that ignores section 6.2 and writes an
 * unrecognized VR in the 8-byte short form **parsed on `66f0c95` and is refused
 * now**. That is deliberate and is pinned below rather than left to be
 * discovered. On the 76,611-cell grid the two populations are **1,221 cells
 * recovered** against **932 newly refused**, and **all 932** of the newly refused
 * had an unrecognized VR in their `66f0c95` parse tree - i.e. every file it
 * refuses is one the old reader only "read" by manufacturing a Data Element
 * header out of the middle of somebody's value. The grid also reads **0 cells
 * that parse on both trees and read differently**; read that as a statement
 * about the grid's fixtures and **not** as "nothing is silently re-read", which
 * is false - `long-payload-tiles` is exactly such a cell, and it is outside
 * anything the grid sweeps.
 *
 * ## The controls, which are half the file
 *
 * The rule is **set membership**, not header shape. `UN` is one of the 34 and
 * must keep its long form; `LO` is one of the 34 and must keep its short form
 * **even when the sender writes it with a 12-byte header**. Those two are what
 * separate "one more VR class routed into the existing long-form branch" from
 * "the header reader now guesses".
 *
 * ## What this file is and is not evidence of, counted rather than claimed
 *
 * Against `src/` at `66f0c95` this file runs **21 red, 7 green**. Six of the
 * seven are the `UN` / `LO` control blocks, green on both trees by design - that
 * is what makes them controls. The seventh is the `removedPrivateTags`
 * disclosure, which is `PRE-EXISTING` and green on both trees on purpose: it
 * pins a channel this slice does **not** close.
 *
 * A first version of this note said "every expectation except the controls" and
 * read 16/10, because the two refusal pins were asserting a bare `toThrow` that
 * base also satisfies for an unrelated reason; they now pin the carrier's own
 * byte offset. Re-count rather than carrying the figure forward if you add a
 * test.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { deidentify } from "../../src/deident/deidentify.js";
import { DicomParseError } from "../../src/parser/errors.js";
import { parseDicom } from "../../src/parser/index.js";
import { serializeDicom } from "../../src/serialize/serialize.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

/**
 * Two bytes outside the 34 VRs PS3.5 2026c defines - what section 6.2 is
 * written about. Synthetic; no edition of DICOM defines it.
 */
const FUTURE_VR = "ZZ";

/** Synthetic throughout. No real identifier appears in this file. */
const ROOT_NAME = "ROOT^PATIENT";
const PATIENT_ID = "ID-000123";
/**
 * A **name-bearing** carrier payload, used wherever a test makes a claim about
 * PHI. `#55` shipped a pinning test whose payload was the benign
 * `"CARRIER-VALUE"`, so the assertion could not have failed either way: a PHI
 * claim tested on a fixture that cannot express the harm proves nothing.
 */
const NAME_PAYLOAD = "MR BRAIN  SMITHSON";

/** `(0009,0001)`: odd group, so neither PS3.6 nor Table E.1-1 answers for it. */
const CARRIER_TAG = "00090001";
/**
 * `(2010,0010)`: an **even** tag PS3.6 publishes and Table E.1-1 does not list,
 * so `deidentify()` resolves "keep" and reaches `keepOrEmpty`. The odd-group
 * carrier above never gets that far - private-by-default removal decides first.
 */
const EVEN_CARRIER_TAG = "20100010";

function u16(n: number, littleEndian: boolean): Buffer {
  const b = Buffer.alloc(2);
  if (littleEndian) b.writeUInt16LE(n, 0);
  else b.writeUInt16BE(n, 0);
  return b;
}

function u32(n: number, littleEndian: boolean): Buffer {
  const b = Buffer.alloc(4);
  if (littleEndian) b.writeUInt32LE(n, 0);
  else b.writeUInt32BE(n, 0);
  return b;
}

interface Carrier {
  readonly vr: string;
  /** `"long"` writes 2 reserved bytes + a 32-bit VL; `"short"` writes a 16-bit VL. */
  readonly form: "long" | "short";
  readonly value: Buffer;
  /** Declared Value Length; defaults to `value.length`. */
  readonly declared?: number;
  readonly reserved?: readonly [number, number];
  readonly tag?: string;
}

/**
 * The carrier element's on-wire bytes, hand-assembled: `test/helpers/build-dicom.ts`
 * types its `vr` as the closed `VR` union and applies its own copy of the
 * long-form set, so it can express neither an unrecognized VR nor a deliberate
 * disagreement between the VR and the header shape. Both are the subject here.
 */
function carrierBytes(c: Carrier, littleEndian: boolean): Buffer {
  const tag = c.tag ?? CARRIER_TAG;
  const declared = c.declared ?? c.value.length;
  const head = Buffer.concat([
    u16(parseInt(tag.slice(0, 4), 16), littleEndian),
    u16(parseInt(tag.slice(4, 8), 16), littleEndian),
    Buffer.from(c.vr, "ascii"),
  ]);
  if (c.form === "long") {
    return Buffer.concat([
      head,
      Buffer.from(c.reserved ?? [0x00, 0x00]),
      u32(declared, littleEndian),
      c.value,
    ]);
  }
  return Buffer.concat([head, u16(declared & 0xffff, littleEndian), c.value]);
}

/** `(0010,0020)` Patient ID as a complete Explicit-VR Data Element. */
function patientIdBytes(littleEndian: boolean): Buffer {
  const value = Buffer.from(`${PATIENT_ID} `, "ascii");
  return Buffer.concat([
    u16(0x0010, littleEndian),
    u16(0x0020, littleEndian),
    Buffer.from("LO", "ascii"),
    u16(value.length, littleEndian),
    value,
  ]);
}

/** The carrier's own four-byte value, used wherever the payload does not matter. */
const ABCD = Buffer.from("ABCD", "ascii");

/**
 * The byte offset at which the carrier's header starts in {@link fixture}'s
 * output, derived from the bytes rather than counted by hand so a change to the
 * File Meta the builder writes cannot silently make a pin meaningless.
 */
function carrierOffset(ts: string, c: Carrier): number {
  const littleEndian = ts === TS_EXPLICIT_LE;
  const buf = fixture(ts, c);
  const at = buf.indexOf(carrierBytes(c, littleEndian).subarray(0, 6));
  if (at < 0) throw new Error("fixture does not contain its own carrier header");
  return at;
}

/** `(0010,0010) PN` + the carrier + (unless `last`) `(0010,0020) LO`. */
function fixture(ts: string, c: Carrier, opts: { last?: boolean } = {}): Buffer {
  const littleEndian = ts === TS_EXPLICIT_LE;
  return buildDicom({
    transferSyntax: ts,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN", value: Buffer.from(`${ROOT_NAME} `, "ascii") },
    ] as never,
    trailingBytes: Buffer.concat([
      carrierBytes(c, littleEndian),
      opts.last === true ? Buffer.alloc(0) : patientIdBytes(littleEndian),
    ]),
  });
}

describe("PS3.5 2026c section 6.2 - an unrecognized Explicit VR is long-form", () => {
  for (const ts of [TS_EXPLICIT_LE, TS_EXPLICIT_BE]) {
    const syntax = ts === TS_EXPLICIT_LE ? "Explicit VR LE" : "Explicit VR BE";

    it(`reads a conformant future-VR element and the element after it (${syntax})`, () => {
      const ds = parseDicom(
        fixture(ts, { vr: FUTURE_VR, form: "long", value: Buffer.from("ABCD") }),
      );
      const carrier = ds.get(CARRIER_TAG);
      expect(carrier).toBeDefined();
      expect(carrier?.vr).toBe(FUTURE_VR);
      expect(carrier?.length).toBe(4);
      expect(carrier?.rawBytes.toString("latin1")).toBe("ABCD");
      // The half that the short-form read destroyed: the element that follows
      // is still a root element, with its own value.
      expect(ds.get("00100020")?.rawBytes.toString("latin1").trimEnd()).toBe(PATIENT_ID);
      // ...and nothing was invented between them.
      expect(ds.elements().map((e) => e.tag)).toEqual(["00100010", CARRIER_TAG, "00100020"]);
    });

    it(`reads a zero-length conformant future-VR element (${syntax})`, () => {
      const ds = parseDicom(fixture(ts, { vr: FUTURE_VR, form: "long", value: Buffer.alloc(0) }));
      expect(ds.get(CARRIER_TAG)?.length).toBe(0);
      expect(ds.get("00100020")?.rawBytes.toString("latin1").trimEnd()).toBe(PATIENT_ID);
    });

    it(`reads a conformant future-VR element that ends the file (${syntax})`, () => {
      const ds = parseDicom(
        fixture(ts, { vr: FUTURE_VR, form: "long", value: Buffer.from("ABCD") }, { last: true }),
      );
      expect(ds.get(CARRIER_TAG)?.rawBytes.toString("latin1")).toBe("ABCD");
      expect(ds.get("00100020")).toBeUndefined();
    });

    it(`still reports non-zero reserved bytes on a future VR (${syntax})`, () => {
      const ds = parseDicom(
        fixture(ts, {
          vr: FUTURE_VR,
          form: "long",
          value: Buffer.from("ABCD"),
          reserved: [0x01, 0x02],
        }),
      );
      // The existing long-form guard now covers the unrecognized VRs too,
      // rather than a new code being minted for them.
      expect(ds.warnings.map((w) => w.code)).toContain("DICOM_NONZERO_RESERVED_BYTES");
      expect(ds.get(CARRIER_TAG)?.length).toBe(4);
    });

    it(`refuses a future VR whose 32-bit VL exceeds the buffer (${syntax})`, () => {
      // Not a new bound: this is the refusal `OB` / `UT` / `UN` already take,
      // reached because the VL is now read from the field section 6.2 names.
      //
      // A bare `toThrow` would be green on `66f0c95` too - the short-form read
      // desynchronizes and dies somewhere else - so the refusal is pinned to the
      // CARRIER's own offset. That is what separates "refused for this reason"
      // from "refused".
      const carrierAt = carrierOffset(ts, { vr: FUTURE_VR, form: "long", value: ABCD });
      expect(() =>
        parseDicom(fixture(ts, { vr: FUTURE_VR, form: "long", value: ABCD, declared: 0x10_0000 })),
      ).toThrow(
        expect.objectContaining({ code: "INVALID_FILE_META", byteOffset: carrierAt }) as Error,
      );
    });

    it(`refuses an undefined length on a future VR (${syntax})`, () => {
      // Section 6.2 says a future VR "may or may not permit Undefined Length";
      // nothing on the wire says where such a value ends, so this parser
      // refuses rather than guessing. Same refusal any non-SQ VR gets, and
      // pinned to the carrier's offset for the same reason as above.
      const carrierAt = carrierOffset(ts, { vr: FUTURE_VR, form: "long", value: ABCD });
      expect(() =>
        parseDicom(
          fixture(ts, { vr: FUTURE_VR, form: "long", value: ABCD, declared: 0xffff_ffff }),
        ),
      ).toThrow(
        expect.objectContaining({ code: "INVALID_FILE_META", byteOffset: carrierAt }) as Error,
      );
    });

    // ---------------------------------------------------------------------
    // The disclosed loss. Pinned so it is a decision, not a discovery.
    // ---------------------------------------------------------------------

    it(`refuses a future VR a sender wrote SHORT-form, which parsed before (${syntax})`, () => {
      expect(() =>
        parseDicom(fixture(ts, { vr: FUTURE_VR, form: "short", value: Buffer.from("ABCD") })),
      ).toThrow(DicomParseError);
      expect(() =>
        parseDicom(fixture(ts, { vr: FUTURE_VR, form: "short", value: Buffer.alloc(0) })),
      ).toThrow(DicomParseError);
    });

    // ---------------------------------------------------------------------
    // Controls: green on both trees. The rule is membership in the 34, not a
    // guess from the header's shape.
    // ---------------------------------------------------------------------

    it(`control: UN keeps the long form (${syntax})`, () => {
      const ds = parseDicom(fixture(ts, { vr: "UN", form: "long", value: Buffer.from("ABCD") }));
      expect(ds.get(CARRIER_TAG)?.vr).toBe("UN");
      expect(ds.get(CARRIER_TAG)?.length).toBe(4);
      expect(ds.get("00100020")?.rawBytes.toString("latin1").trimEnd()).toBe(PATIENT_ID);
    });

    it(`control: LO keeps the short form (${syntax})`, () => {
      const ds = parseDicom(fixture(ts, { vr: "LO", form: "short", value: Buffer.from("ABCD") }));
      expect(ds.get(CARRIER_TAG)?.vr).toBe("LO");
      expect(ds.get(CARRIER_TAG)?.length).toBe(4);
      expect(ds.get("00100020")?.rawBytes.toString("latin1").trimEnd()).toBe(PATIENT_ID);
    });

    it(`control: LO written with a 12-byte header is still read short-form (${syntax})`, () => {
      // The membership test, stated as a fixture: if the reader picked the form
      // from the header's shape instead of from the VR, this file would read
      // cleanly. It must not - `LO` is one of the 34 and its length field is 16
      // bits, so these bytes are a lie about a known VR and desynchronize.
      expect(() =>
        parseDicom(fixture(ts, { vr: "LO", form: "long", value: Buffer.from("ABCD") })),
      ).toThrow(DicomParseError);
    });
  }
});

describe("the writer applies the same section 6.2 rule as the reader", () => {
  it("re-emits a future-VR element with a 12-byte header, and the tree survives the round trip", () => {
    const ds = parseDicom(
      fixture(TS_EXPLICIT_LE, { vr: FUTURE_VR, form: "long", value: Buffer.from("ABCD") }),
    );
    const written = serializeDicom(ds);
    const reread = parseDicom(written);
    expect(reread.get(CARRIER_TAG)?.vr).toBe(FUTURE_VR);
    expect(reread.get(CARRIER_TAG)?.length).toBe(4);
    expect(reread.get(CARRIER_TAG)?.rawBytes.toString("latin1")).toBe("ABCD");
    expect(reread.elements().map((e) => e.tag)).toEqual(ds.elements().map((e) => e.tag));
    // The header form is asserted on the bytes, not inferred from the re-read:
    // tag + "ZZ" + two zero reserved bytes + a 32-bit VL.
    const at = written.indexOf(Buffer.concat([u16(0x0009, true), u16(0x0001, true)]));
    expect(at).toBeGreaterThan(0);
    expect(written.toString("latin1", at + 4, at + 6)).toBe(FUTURE_VR);
    expect(written.readUInt16LE(at + 6)).toBe(0);
    expect(written.readUInt32LE(at + 8)).toBe(4);
  });

  it("does not truncate a future-VR value the 16-bit length field cannot hold", () => {
    // The reason the writer had to move with the reader rather than after it:
    // the short form's length field is 16 bits, so a 70,000-byte value written
    // through it would declare 4,464 and the re-read would be silently short.
    const big = Buffer.alloc(70_000, 0x41);
    const ds = parseDicom(fixture(TS_EXPLICIT_LE, { vr: FUTURE_VR, form: "long", value: big }));
    expect(ds.get(CARRIER_TAG)?.length).toBe(70_000);
    const reread = parseDicom(serializeDicom(ds));
    expect(reread.get(CARRIER_TAG)?.length).toBe(70_000);
    expect(reread.get(CARRIER_TAG)?.rawBytes.length).toBe(70_000);
  });
});

describe("the File Meta group reads an unrecognized VR long-form too", () => {
  it("keeps reading (0002,xxxx) past a future-VR element, and preserves it verbatim", () => {
    // PS3.10 section 7.1 fixes File Meta at Explicit VR LE, so section 6.2's
    // structure rule governs it identically. `buildDicom` cannot write this
    // element, so the group is assembled here and the group length computed
    // from the bytes actually emitted.
    const extra = carrierBytes(
      { vr: FUTURE_VR, form: "long", value: Buffer.from("FMEX"), tag: "00021234" },
      true,
    );
    const base = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      elements: [
        { tag: "00100010", vr: "PN", value: Buffer.from(`${ROOT_NAME} `, "ascii") },
      ] as never,
    });
    // Splice `extra` in after the File Meta group and re-declare (0002,0000).
    const groupLengthAt = base.indexOf(Buffer.from([0x02, 0x00, 0x00, 0x00])) + 8;
    const declared = base.readUInt32LE(groupLengthAt);
    const fmEnd = groupLengthAt + 4 + declared;
    const spliced = Buffer.concat([base.subarray(0, fmEnd), extra, base.subarray(fmEnd)]);
    spliced.writeUInt32LE(declared + extra.length, groupLengthAt);

    const ds = parseDicom(spliced);
    expect(ds.fileMeta?.transferSyntaxUID).toBe(TS_EXPLICIT_LE);
    const kept = ds.fileMeta?.extraElements?.find((e) => e.tag === "00021234");
    expect(kept?.vr).toBe(FUTURE_VR);
    expect(kept?.value.toString("latin1")).toBe("FMEX");
    // The dataset after the group is intact, which is what a short-form read of
    // that element would have destroyed.
    expect(ds.get("00100010")?.rawBytes.toString("latin1").trimEnd()).toBe(ROOT_NAME);
  });
});

describe("what the structure rule does to the fabricated-header shape", () => {
  /**
   * The under-declare `#55` was raised about, on a **name-bearing** payload.
   * `"MR BRAIN  SMITHSON"` under-declared by 6 leaves `"ITHSON"` to be read as
   * the next Data Element header: on `66f0c95` that produced a root element
   * `(5449,5348)` - the bytes `"ITHS"` in wire order, four letters of the
   * surname - with the VR bytes `"ON"`.
   */
  const fabricated = (): Buffer =>
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements: [
        { tag: "00100010", vr: "PN", value: Buffer.from(`${ROOT_NAME} `, "ascii") },
        {
          tag: "20100010",
          vr: "ST",
          value: Buffer.from(NAME_PAYLOAD, "ascii"),
          declaredLengthDelta: -6,
        },
        { tag: "00100020", vr: "LO", value: Buffer.from(`${PATIENT_ID} `, "ascii") },
      ] as never,
    });

  it("refuses the file rather than manufacturing an element out of a surname", () => {
    expect(() => parseDicom(fabricated())).toThrow(DicomParseError);
  });

  it("streams no warning carrying the surname on the way to that refusal", () => {
    // The channel a refuter pass found, and it is the reason
    // `nonzeroReservedBytes` no longer takes a tag at all.
    //
    // Reading this shape long-form lands on the two bytes section 7.1.2 reserves
    // and finds `0x10 0x00` - the next element's group - so
    // `DICOM_NONZERO_RESERVED_BYTES` fires BEFORE the fatal, on a header that was
    // fabricated out of the payload. On `66f0c95` this file parsed and emitted
    // nothing naming that element (only `DICOM_ODD_LENGTH_VALUE_PADDED`, on a
    // genuine `(0010,0010)`), so the code is newly reachable here; with the tag
    // still in the message it rendered `54495348`, four letters of the surname,
    // straight onto `onWarning`.
    const streamed: { code: string; message: string }[] = [];
    expect(() => parseDicom(fabricated(), { onWarning: (w) => streamed.push({ ...w }) })).toThrow(
      DicomParseError,
    );
    // Non-vacuous: the channel really is reached. Without this the assertions
    // below would pass against a parser that emitted nothing.
    expect(streamed.map((w) => w.code)).toContain("DICOM_NONZERO_RESERVED_BYTES");
    for (const w of streamed) {
      expect(w.message).not.toContain("ITHS");
      expect(w.message).not.toContain("54495348");
      expect(w.message).not.toContain("SMITHSON");
    }
    // And the code that fires on a fabricated header renders no tag at all -
    // not "a different tag", none. Other codes here name genuine elements
    // (`(0010,0010)` is really where the file says it is) and keep theirs.
    const reserved = streamed.filter((w) => w.code === "DICOM_NONZERO_RESERVED_BYTES");
    expect(reserved).not.toHaveLength(0);
    for (const w of reserved) expect(w.message).not.toMatch(/[0-9A-F]{8}/u);
  });

  it("emits no warning carrying the payload on the conformant shape", () => {
    // The bound this slice must not break: no new Tier-2 code was minted, and
    // the existing ones take structural tokens only, so a name in the carrier
    // cannot reach a warning message. Run on a name-bearing payload for the
    // same reason the test above is.
    const ds = parseDicom(
      fixture(TS_EXPLICIT_LE, {
        vr: FUTURE_VR,
        form: "long",
        value: Buffer.from(NAME_PAYLOAD, "ascii"),
        reserved: [0x01, 0x02],
      }),
    );
    expect(ds.warnings.map((w) => w.code)).toContain("DICOM_NONZERO_RESERVED_BYTES");
    for (const w of ds.warnings) {
      expect(w.message).not.toContain("SMITHSON");
      expect(w.message).not.toContain(FUTURE_VR);
    }
  });

  it("still lets a fabricated ODD-group tag reach report.removedPrivateTags", () => {
    // `PRE-EXISTING`, deliberately NOT closed, and pinned here because a
    // disclosure nothing reproduces is a claim rather than a measurement.
    //
    // `removedPrivateTags` pushes `el.tag` for every removed private element,
    // and a private element can be fabricated: this `OB` carrier's tail is a
    // complete odd-group header whose VR is one of the 34, so the structure rule
    // has nothing to say about it. The reported tag `41534342` is the bytes
    // `"SABC"` in wire order - four bytes of the carrier's own value.
    //
    // It is reported anyway because *which* private tags were removed is the
    // field's whole audit value on a well-formed file. The CLAIM was corrected
    // (`DeidentifyReport` names three non-value-free fields, not one); narrowing
    // the field is a product call that has not been made.
    const tail = Buffer.from([0x53, 0x41, 0x42, 0x43, 0x53, 0x48, 0x00, 0x00]);
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements: [
        { tag: "00100010", vr: "PN", value: Buffer.from(`${ROOT_NAME} `, "ascii") },
        {
          tag: "40101006",
          vr: "OB",
          value: Buffer.concat([Buffer.from("SECRET-NOTE-", "ascii"), tail]),
          declaredLengthDelta: -tail.length,
        },
        { tag: "00100020", vr: "LO", value: Buffer.from(`${PATIENT_ID} `, "ascii") },
      ] as never,
    });
    const ds = parseDicom(raw);
    // Precondition: the fabricated element exists and its VR is a real one, so
    // this is not the structure rule's population.
    expect(ds.get("41534342")?.vr).toBe("SH");
    const { report } = deidentify(ds);
    expect([...report.removedPrivateTags]).toContain("41534342");
    const wire = Buffer.from("41534342", "hex");
    expect(
      Buffer.from([wire[1] ?? 0, wire[0] ?? 0, wire[3] ?? 0, wire[2] ?? 0]).toString("latin1"),
    ).toBe("SABC");
  });

  it("still empties an unrecognized-VR value at the de-identify boundary", () => {
    // `#55`'s rule is untouched, and this is the cost that moved: a section 6.2
    // conformant future-VR element now PARSES, so `deidentify()` reaches it and
    // empties it - where before the whole file was refused. Strictly better than
    // base (which returned nothing at all), and a real instance of the
    // `DICOM-DEIDENT-OVER-REDACTION` trade rather than a hypothetical one.
    //
    // An **even** group is load-bearing here: `(0009,0001)` is private, and
    // private-by-default removal decides before `keepOrEmpty` is reached, so the
    // odd-group carrier used above would never exercise the rule at all.
    const ds = parseDicom(
      fixture(TS_EXPLICIT_LE, {
        vr: FUTURE_VR,
        form: "long",
        value: Buffer.from(NAME_PAYLOAD, "ascii"),
        tag: EVEN_CARRIER_TAG,
      }),
    );
    expect(ds.get(EVEN_CARRIER_TAG)?.rawBytes.toString("latin1")).toBe(NAME_PAYLOAD);
    // Trap #3, on the channel this shape does raise: the VR-mismatch warning
    // fires here (an even tag has a dictionary VR), and its `{vr}` token is two
    // bytes the sender chose. It must render as withheld, not as `ZZ`.
    for (const w of ds.warnings) expect(w.message).not.toContain(FUTURE_VR);
    const { dataset, report } = deidentify(ds);
    expect(report.undefinedVrElements.length).toBe(1);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain("SMITHSON");
  });
});

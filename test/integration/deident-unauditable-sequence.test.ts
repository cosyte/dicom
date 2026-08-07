/**
 * `DICOM-DEIDENT-RAWBYTES-PASSTHROUGH` - `deidentify()` must not pass the raw
 * bytes of a sequence it could not walk into de-identified output.
 *
 * ## The defect
 *
 * When `parseDicom` resolves an element to `SQ` from PS3.6 under Implicit VR LE
 * and the defined-length value turns out not to be a valid `(FFFE,E000)` item
 * stream, it refuses the descent: `Element.items` stays `undefined`, the
 * declared span stays on `Element.rawBytes`, and `DICOM_SQ_NOT_DESCENDED` goes
 * on `Dataset.warnings` (`DICOM-IMPLICIT-SQ-NOT-DESCENDED`, `#50`). That is the
 * right posture for a parser.
 *
 * `deidentify()` then kept those bytes verbatim, because it recurses into a
 * sequence only when its items exist and `(0008,1115)` carries no Table E.1-1
 * row of its own. So a `(0010,0020)` Patient ID inside that span was written
 * straight into `serializeDicom()` output, next to the
 * `(0012,0062) PatientIdentityRemoved = YES` this function inserts, with a
 * report that named it nowhere. Measured on `scripts/measure-sq-bound-grid.ts`
 * at `d1031f5` (published `0.0.6` plus `#53`): **1,155 of the 6,348 cells that
 * parse**, every one of them Implicit VR LE and carrying exactly
 * `["DICOM_SQ_NOT_DESCENDED"]`.
 *
 * ## The remedy, and why it is not a content test
 *
 * PS3.5 2026c §7.5.1 "Item Encoding Rules", read from the vendored SHA-pinned
 * `vendor/nema/part05/` and occurring exactly once in that document: "Each Item
 * Value shall contain a DICOM Data Set composed of Data Elements." An `SQ`
 * value is therefore never legitimately opaque - unlike an `OB` value, where
 * arbitrary bytes are the point.
 *
 * PS3.15 2026c §E.1.1 "De-identifier", read from the vendored SHA-pinned
 * `vendor/nema/part15/` and likewise unique in that document: "An implementation
 * claiming conformance to the Basic Application Level Confidentiality Profile as
 * a de-identifier shall protect or retain all instances of the Attributes listed
 * in [Table E.1-1], whether contained in the top level Data Set or embedded in
 * an Item of a Sequence of Items." A run that cannot enumerate the items cannot
 * discharge that obligation inside them, so it discharges it on the carrier -
 * the escalation §E.1.1 makes itself for a SOP Instance UID inside a Sequence
 * ("the enclosing Attribute in the top-level Data Set must be encrypted in its
 * entirety"), there stated about the encrypt-and-replace mechanism rather than
 * about Table E.1-1 in general.
 *
 * So the trigger is **the parser's recorded refusal** (`items === undefined`),
 * not an inspection of the bytes. That is the whole difference from the sibling
 * `./embedded.ts` scan, which has to prove a value is not what its VR says
 * because an over-declaring string element and a well-formed one are
 * byte-identical. Here nothing is proved and nothing is scanned - which is also
 * why the cost tests below can hold a fixture that is maximally adversarial for
 * a scan and still expect a flat number.
 *
 * Every fixture is **synthetic** and built in memory by `build-dicom`; the
 * deliberately fake identifiers exist only so their absence from output is
 * observable.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  defineProfile,
  deidentify,
  parseDicom,
  serializeDicom,
} from "../../src/index.js";
import { MAX_UNAUDITABLE_SEQUENCE_FINDINGS } from "../../src/deident/deidentify.js";
import { buildDicom } from "../helpers/build-dicom.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Synthetic, deliberately fake. Present only so its absence is testable. */
const ROOT_NAME = "ROOT^PATIENT";
const PATIENT_ID = "ID-000123";
/** Non-PHI item content, so "what the remedy costs" is observable separately. */
const ITEM_VALUE = "ORIGINAL";

/**
 * `(0008,1115)` Referenced Series Sequence: `SQ` in PS3.6 with **no** Table
 * E.1-1 row, so `deidentify()` resolves "keep" for the carrier itself. That is
 * what makes it the sharp case - nothing about the sequence is redacted, and
 * before this slice nothing inside it was either.
 */
const CARRIER = "00081115" as const;

/**
 * `(0008,1120)` Referenced Patient Sequence: `X` under the Basic Profile, but
 * `K` with `RetainUIDs` active. The path where a *listed* sequence is kept.
 */
const LISTED_CARRIER = "00081120" as const;

/**
 * `(0008,0110)` Coding Scheme Identification Sequence: `SQ` in PS3.6 with no
 * Table E.1-1 row, exactly like {@link CARRIER}. The healthy sibling.
 */
const HEALTHY_CARRIER = "00080110" as const;
const SIBLING_VALUE = "DERIVED";

const TRAILING = "00100020" as const;

/** The builder's element-list type, so no fixture asserts on an object literal. */
type Elements = Parameters<typeof buildDicom>[0]["elements"];

function ascii(s: string): Buffer {
  return Buffer.from(s.length % 2 === 0 ? s : `${s} `, "ascii");
}

/**
 * A root `PN`, a sequence, and a trailing root `(0010,0020)` Patient ID.
 *
 * `sqDelta` is the lie in the sequence's own Value Length field. **`18` is the
 * load-bearing value and the precision is the trap**: it is exactly the trailing
 * `(0010,0020)`'s on-wire size under Implicit VR LE (8-byte header + 10-byte
 * padded value), so the sequence's declared span ends *after* that element and
 * the parse stays self-consistent. Over-declaring past the end of the buffer
 * instead trips the truncation guard, which already yields
 * `DICOM_SQ_NOT_DESCENDED` on the **broken** code - a fixture written that way
 * is green against the defect.
 */
function fixture(transferSyntax: string, sqDelta: number, carrier: string = CARRIER): Buffer {
  return buildDicom({
    transferSyntax,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
      {
        tag: carrier,
        declaredLengthDelta: sqDelta,
        items: [{ elements: [{ tag: "00080008", vr: "CS", value: ascii(ITEM_VALUE) }] }],
      },
      { tag: TRAILING, vr: "LO", value: ascii(PATIENT_ID) },
    ] as never as Elements,
  });
}

/**
 * A carrier whose value is **maximally adversarial for a scan**: filled with the
 * two bytes `FE FF`, so *every even offset* in it reads as group `0xFFFE` and
 * would be a tiling candidate. That is precisely the shape `#53`'s first round
 * was refused on, where re-scanning the tail once per candidate turned 256 KiB
 * into 22.5 s inside `deidentify()` - and its cost test was green because its
 * fixture produced exactly **one** candidate. The property is asserted below
 * rather than asserted in prose, so this fixture cannot quietly stop being
 * adversarial.
 */
function adversarialCarrier(size: number): Buffer {
  const value = Buffer.alloc(size);
  value.fill(Buffer.from([0xfe, 0xff]));
  return buildDicom({
    transferSyntax: IMPLICIT_LE,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
      { tag: CARRIER, vr: "UN", value },
    ] as never as Elements,
  });
}

describe("DICOM-DEIDENT-RAWBYTES-PASSTHROUGH: an undescended sequence is not passed through", () => {
  it("the parse this all rests on: the descent is refused and the identifier is inside the span", () => {
    // Not a behaviour claim about the remedy - a check that the fixture builds
    // the situation at all. If this ever goes green for the wrong reason (the
    // sequence descends, or nothing is swallowed) every assertion below becomes
    // vacuous, which is the failure mode `#50`'s "explicit-length SQ also
    // descends" shipped with.
    const ds = parseDicom(fixture(IMPLICIT_LE, 18));
    expect(ds.warnings.map((w) => w.code)).toEqual([WARNING_CODES.DICOM_SQ_NOT_DESCENDED]);
    const el = ds.get(CARRIER);
    expect(el?.items).toBeUndefined();
    expect(el?.rawBytes.toString("latin1")).toContain(PATIENT_ID);
    // Swallowed: there is no root (0010,0020) left for Table E.1-1 to match.
    expect(ds.get(TRAILING)).toBeUndefined();
  });

  it("the swallowed Patient ID does not reach de-identified output", () => {
    const { dataset } = deidentify(parseDicom(fixture(IMPLICIT_LE, 18)));
    const bytes = serializeDicom(dataset).toString("latin1");
    expect(bytes).not.toContain(PATIENT_ID);
    expect(bytes).not.toContain(ROOT_NAME);
  });

  it("the report names the sequence it could not audit, instead of staying silent", () => {
    const { report } = deidentify(parseDicom(fixture(IMPLICIT_LE, 18)));
    expect(report.unauditableSequences).toHaveLength(1);
    expect(report.unauditableSequences[0]?.tag).toBe(CARRIER);
    // The byte length of the value that was dropped: structural, and the number
    // a caller needs to tell "a sequence went missing" from "the file had none".
    expect(report.unauditableSequences[0]?.byteLength).toBeGreaterThan(0);
    expect(report.unauditableSequences[0]?.contextPath).toBeUndefined();
    // `report.attributes` still cannot name (0010,0020): after the swallow there
    // is no such attribute in the object. Saying so here keeps the audit's real
    // shape on the record rather than implying the tag reappears.
    expect(report.attributes.map((a) => a.tag)).not.toContain(TRAILING);
  });

  it("and raises DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE, which renders no number the header supplied", () => {
    // 🩺 THIS ROW WAS TITLED "carrying no value" AND DID NOT CHECK THE ONE
    // THING THE CODE WAS DISCLOSED AS PUBLISHING. It asserted that three values
    // planted elsewhere in the file were absent, which a message built from a
    // frozen registry cannot carry in any case, while the message rendered
    // `Element.rawBytes.length` - the declared Value Length off the element
    // header, and on a fabricated header four document bytes. A title asserting
    // the opposite of a live disclosure occupies the slot a real check would
    // have. The number is bound out of `sequenceNotAuditable`'s signature now
    // and the row asks about it.
    const { report } = deidentify(parseDicom(fixture(IMPLICIT_LE, 18)));
    const warning = report.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE,
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toContain(CARRIER);
    // The message is composed from the registry plus structural parameters, so
    // no document value can travel on it verbatim.
    expect(warning?.message).not.toContain(PATIENT_ID);
    expect(warning?.message).not.toContain(ROOT_NAME);
    expect(warning?.message).not.toContain(ITEM_VALUE);

    // The row that was missing. The dropped byte span is a header-derived
    // number, and it is not a whole digit run of the message any more. Matching
    // whole runs rather than substrings is what stops `PS3.15` and the tag's own
    // digits from answering this question by accident.
    const dropped = report.unauditableSequences[0]?.byteLength;
    expect(dropped).toBeGreaterThan(0);
    const runs = warning?.message.match(/[0-9]+/gu) ?? [];
    expect(runs).not.toContain(String(dropped));

    // Non-vacuity: rebuild `0.0.14`'s own template over this fixture's number
    // and assert the same search still finds it there. A green row must not be
    // able to mean "the number stopped existing" or "the search is broken".
    const shipped = `Element (${CARRIER}) is a Sequence carrier with no parsed items, so its ${String(dropped)} recorded bytes could not be audited (PS3.15 E.1.1); emptied. See report.unauditableSequences.`;
    expect(shipped.match(/[0-9]+/gu) ?? []).toContain(String(dropped));
  });

  it("empties the carrier rather than removing it, so the attribute still exists", () => {
    const { dataset } = deidentify(parseDicom(fixture(IMPLICIT_LE, 18)));
    const el = dataset.get(CARRIER);
    expect(el).toBeDefined();
    expect(el?.vr).toBe("SQ");
    expect(el?.items).toEqual([]);
  });

  it("fires on the parser's refusal, not on the content: a PHI-free span is emptied too", () => {
    // There is no listed attribute anywhere in this sequence's bytes. It is
    // still emptied, which is the point: the remedy reads `items === undefined`
    // and never inspects the value, so it has no content test to be fooled by
    // and no per-offset loop to blow up. A version that only acted when it
    // could *find* something would be fail-open on exactly the bytes it just
    // admitted it cannot read.
    const buf = buildDicom({
      transferSyntax: IMPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements: [
        { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
        {
          // 10 = the on-wire size of the trailing `(0008,0060)` under Implicit
          // VR LE (8-byte header + 2-byte value), so the span ends exactly after
          // it and the parse stays self-consistent, as at 18 above.
          tag: CARRIER,
          declaredLengthDelta: 10,
          items: [{ elements: [{ tag: "00080008", vr: "CS", value: ascii(ITEM_VALUE) }] }],
        },
        { tag: "00080060", vr: "CS", value: ascii("CT") },
      ] as never as Elements,
    });
    const ds = parseDicom(buf);
    expect(ds.get(CARRIER)?.items).toBeUndefined();
    const { dataset, report } = deidentify(ds);
    expect(report.unauditableSequences.map((s) => s.tag)).toEqual([CARRIER]);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(ITEM_VALUE);
  });

  it("a listed sequence kept by a Retain option is emptied, and the audit says emptied", () => {
    // Before this slice `descendSequence` rebuilt the element from
    // `el.items ?? []`, so the content vanished anyway - while the report said
    // `kept`. A report claiming an attribute was retained when its content was
    // dropped is the same class of false audit as one claiming a scrub it did
    // not perform.
    const ds = parseDicom(fixture(IMPLICIT_LE, 18, LISTED_CARRIER));
    const { dataset, report } = deidentify(ds, { retain: ["RetainUIDs"] });
    const audited = report.attributes.find((a) => a.tag === LISTED_CARRIER);
    expect(audited?.action).toBe("K");
    expect(audited?.applied).toBe("emptied");
    expect(report.unauditableSequences.map((s) => s.tag)).toEqual([LISTED_CARRIER]);
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(PATIENT_ID);
  });
});

describe("DICOM-DEIDENT-RAWBYTES-PASSTHROUGH: the no-loss controls", () => {
  it("a well-formed defined-length sequence is descended and kept, not emptied", () => {
    // The whole risk of this remedy is over-removal, so this is the control that
    // has to stay green: a healthy file must be untouched by it.
    const ds = parseDicom(fixture(IMPLICIT_LE, 0));
    expect(ds.warnings).toEqual([]);
    expect(ds.get(CARRIER)?.items).toHaveLength(1);
    const { dataset, report } = deidentify(ds);
    expect(report.unauditableSequences).toEqual([]);
    const bytes = serializeDicom(dataset).toString("latin1");
    // Non-PHI item content survives; the listed attributes are gone.
    expect(bytes).toContain(ITEM_VALUE);
    expect(bytes).not.toContain(PATIENT_ID);
    expect(bytes).not.toContain(ROOT_NAME);
  });

  it("a materialized EMPTY sequence is not un-auditable - nothing hides in zero items", () => {
    const buf = buildDicom({
      transferSyntax: IMPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements: [
        { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
        { tag: CARRIER, items: [] },
      ] as never as Elements,
    });
    const ds = parseDicom(buf);
    expect(ds.get(CARRIER)?.items).toEqual([]);
    expect(deidentify(ds).report.unauditableSequences).toEqual([]);
  });

  it("keys on the ELEMENT's refusal, not on the file: a healthy sibling sequence is kept", () => {
    // One file, two sequences: `(0008,1115)` over-declares and is refused,
    // `(0040,A730)` Content Sequence is well-formed. If the trigger were "this
    // file looked odd" both would be emptied. It is `items === undefined`, per
    // element, so exactly one is.
    const buf = buildDicom({
      transferSyntax: IMPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements: [
        { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
        {
          tag: CARRIER,
          declaredLengthDelta: 18,
          items: [{ elements: [{ tag: "00080008", vr: "CS", value: ascii(ITEM_VALUE) }] }],
        },
        { tag: TRAILING, vr: "LO", value: ascii(PATIENT_ID) },
        {
          // `(0008,0110)` Coding Scheme Identification Sequence: `SQ`, and like
          // `(0008,1115)` it carries no Table E.1-1 row, so the action table
          // keeps it and the only thing deciding its fate is the descent.
          tag: HEALTHY_CARRIER,
          items: [{ elements: [{ tag: "00080008", vr: "CS", value: ascii(SIBLING_VALUE) }] }],
        },
      ] as never as Elements,
    });
    const ds = parseDicom(buf);
    expect(ds.get(CARRIER)?.items).toBeUndefined();
    expect(ds.get(HEALTHY_CARRIER)?.items).toHaveLength(1);
    const { dataset, report } = deidentify(ds);
    expect(report.unauditableSequences.map((s) => s.tag)).toEqual([CARRIER]);
    const bytes = serializeDicom(dataset).toString("latin1");
    expect(bytes).toContain(SIBLING_VALUE);
    expect(bytes).not.toContain(PATIENT_ID);
  });

  it("is inert on a well-formed Explicit VR LE file", () => {
    // The Explicit VR path reads a defined-length SQ in place, so nothing is
    // ever refused there and this remedy has nothing to act on. (That path has
    // its own open defect, `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`; this slice
    // neither fixes nor touches it.)
    const ds = parseDicom(fixture(EXPLICIT_LE, 0));
    expect(ds.get(CARRIER)?.items).toHaveLength(1);
    const { dataset, report } = deidentify(ds);
    expect(report.unauditableSequences).toEqual([]);
    expect(serializeDicom(dataset).toString("latin1")).toContain(ITEM_VALUE);
  });
});

describe("DICOM-PRIVATE-SQ-CARVE-OUT: the rule reaches a vouched-for private SQ too", () => {
  it("🩺 a private SQ vouched for by RetainSafePrivate is emptied when its items cannot be walked", () => {
    // This test asserted the LEAK until `DICOM-PRIVATE-SQ-CARVE-OUT`. On
    // `0.0.10` `keepsPrivate` decided before this rule was consulted, so a
    // profile naming the element by creator and tag kept its bytes unaudited,
    // `report.unauditableSequences` read `[]`, and the payload went into
    // de-identified output whole.
    //
    // The vouching is still the profile's to give, and this slice does not
    // second-guess it with a content test. What it withdraws is the *implication*
    // that vouching for a private attribute also vouches for whatever Data Set
    // the sender encoded inside it. PS3.15 2026c §E.3.10's licence is for
    // "Private Attributes that are known by the de-identifier to be safe from
    // identity leakage" - and when the parser could not materialize the items,
    // nothing inside is known at all, which is exactly the condition
    // `emptyUnauditableSequence` exists for.
    //
    // Name-bearing payload on purpose: `ID-000123` alone would let this pass for
    // the wrong reason, and a vacuous-by-fixture PHI pin is this repo's
    // recurring failure.
    const NESTED_NAME = "DOE^JANE";
    const profile = defineProfile({
      name: "acme-test",
      description: "Synthetic vendor block whose private element is an SQ.",
      privateTags: {
        ACME: {
          "0009XX01": { vr: "SQ", keyword: "AcmePrivateSequence", name: "Acme Private Seq" },
        },
      },
    });
    const buf = buildDicom({
      transferSyntax: IMPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements: [
        { tag: "00090010", vr: "LO", value: ascii("ACME") },
        {
          tag: "00091001",
          vr: "UN",
          value: Buffer.concat([
            Buffer.from("JUNK", "ascii"),
            ascii(NESTED_NAME),
            ascii(PATIENT_ID),
          ]),
        },
      ] as never as Elements,
    });
    const ds = parseDicom(buf, { profile });
    expect(ds.get("00091001")?.vr).toBe("SQ");
    expect(ds.get("00091001")?.items).toBeUndefined();
    // Non-vacuity: both markers really are on the wire before de-identification.
    const before = serializeDicom(ds).toString("latin1");
    expect(before).toContain(NESTED_NAME);
    expect(before).toContain(PATIENT_ID);

    const { dataset, report } = deidentify(ds, { retain: ["RetainSafePrivate"], profile });
    // Closed: the finding is raised and the bytes are gone.
    expect(report.unauditableSequences.map((s) => s.tag)).toEqual(["00091001"]);
    const after = serializeDicom(dataset).toString("latin1");
    expect(after).not.toContain(NESTED_NAME);
    expect(after).not.toContain(PATIENT_ID);
    // 🛑 PIN THE WARNING CHANNEL. The predecessor asserted only the bytes, and
    // "it is silent" claims about this family have shipped unchecked twice. The
    // de-identify channel says why, on both the report and the warning list.
    expect(report.warnings.map((w) => w.code)).toContain("DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE");
    // The attribute keeps existing as a zero-item `SQ` - emptied, not removed -
    // so a consumer diffing tags does not read this as the element vanishing.
    expect(dataset.get("00091001")?.vr).toBe("SQ");
    expect(dataset.get("00091001")?.items).toEqual([]);

    // ...and without the vouching option the same element is removed as a
    // private attribute. Both routes now drop the payload, by different rules:
    // `removedPrivateTags` there, `unauditableSequences` here.
    const plain = deidentify(parseDicom(buf, { profile }));
    expect(plain.report.removedPrivateTags).toContain("00091001");
    expect(serializeDicom(plain.dataset).toString("latin1")).not.toContain(NESTED_NAME);
  });
});

describe("DICOM-DEIDENT-RAWBYTES-PASSTHROUGH: cost, on a fixture that can actually blow up", () => {
  it("the cost fixture is maximally adversarial: EVERY even offset is a candidate", () => {
    // `#53` shipped a cost claim backed by a fixture that produced exactly one
    // candidate offset, which is why it was green while the code was quadratic.
    // This asserts the property that makes the two timing tests below mean
    // something, so the fixture cannot silently stop being the worst case.
    const value = Buffer.alloc(1 << 16);
    value.fill(Buffer.from([0xfe, 0xff]));
    let candidates = 0;
    for (let i = 0; i + 2 <= value.length; i += 2) {
      if (value.readUInt16LE(i) === 0xfffe) candidates++;
    }
    expect(candidates).toBe(value.length / 2);
  });

  it("deidentify() does not follow an attacker-chosen value length", () => {
    // Be precise about what this proves and what it does not. The code under
    // test never traverses these bytes at all: an `SQ` with no items goes
    // straight to `emptyUnauditableSequence`, which reads `.length`. So this is
    // a FORWARD TRIPWIRE, not a measurement of an existing loop - it fails the
    // day someone adds a content test on this path, and a quadratic re-scan of
    // this shape measured 22.5 s at 256 KiB and ~257 s at 1 MiB, so the ceiling
    // has roughly three orders of magnitude of headroom.
    const ds = parseDicom(adversarialCarrier(1 << 20));
    expect(ds.get(CARRIER)?.items).toBeUndefined();
    const started = performance.now();
    const { report } = deidentify(ds);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(report.unauditableSequences).toHaveLength(1);
  });

  it("the diagnostic is bounded by the element count, not by the value length", () => {
    // The discipline `#48` established, and the one `#53`'s own
    // `embeddedAttributes[].hidden` missed: a consumer-controlled diagnostic
    // must not grow with attacker-chosen input. One un-auditable element yields
    // exactly one finding whether its value is 42 bytes or a megabyte.
    const small = deidentify(parseDicom(fixture(IMPLICIT_LE, 18))).report;
    const large = deidentify(parseDicom(adversarialCarrier(1 << 20))).report;
    expect(small.unauditableSequences).toHaveLength(1);
    expect(large.unauditableSequences).toHaveLength(1);
    expect(large.unauditableSequences[0]?.byteLength).toBe(1 << 20);
  });

  it("caps the RECORD across the run, and never the removal", () => {
    // `#48` bound every consumer-controlled diagnostic in this package, and
    // `#53` then shipped a new unbounded one (`embeddedAttributes[].hidden`).
    // The element COUNT is attacker-chosen just as a value's length is, so a
    // finding-per-element is an amplification even though each finding is small.
    //
    // The cap has to span the run, not one Data Set: `processElements` builds a
    // fresh result per Data Set and merges upward, so a per-result cap would
    // bound each item independently and not the file. Hence the nesting here.
    const many = MAX_UNAUDITABLE_SEQUENCE_FINDINGS * 4;
    const items = Array.from({ length: many }, () => ({
      elements: [
        {
          tag: HEALTHY_CARRIER,
          declaredLengthDelta: 10,
          items: [{ elements: [{ tag: "00080008", vr: "CS", value: ascii(ITEM_VALUE) }] }],
        },
        { tag: "00080060", vr: "CS", value: ascii("CT") },
      ],
    }));
    const buf = buildDicom({
      transferSyntax: IMPLICIT_LE,
      mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
      mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
      elements: [
        { tag: "00100010", vr: "PN", value: ascii(ROOT_NAME) },
        { tag: CARRIER, items },
      ] as never as Elements,
    });
    const ds = parseDicom(buf);
    expect(ds.get(CARRIER)?.items).toHaveLength(many);

    const { dataset, report } = deidentify(ds);
    expect(report.unauditableSequences).toHaveLength(MAX_UNAUDITABLE_SEQUENCE_FINDINGS);
    expect(
      report.warnings.filter((w) => w.code === WARNING_CODES.DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE),
    ).toHaveLength(MAX_UNAUDITABLE_SEQUENCE_FINDINGS);

    // The action is NOT capped: every one of the `many` un-auditable sequences
    // is emptied, including the ones past the reporting cap. A bound on what we
    // will say must never become a bound on what we will remove.
    expect(serializeDicom(dataset).toString("latin1")).not.toContain(ITEM_VALUE);
  });

  it("drops the whole un-auditable megabyte rather than serializing it", () => {
    const { dataset } = deidentify(parseDicom(adversarialCarrier(1 << 20)));
    expect(serializeDicom(dataset).length).toBeLessThan(4_096);
  });
});

/**
 * `DICOM-FATAL-MESSAGE-REGISTRY`: the Tier-3 half of "a diagnostic about a PHI
 * leak is itself a PHI surface".
 *
 * Two things are proved here, and they are the two halves of the item.
 *
 * ## 1. No document byte reaches a Tier-3 `err.message`
 *
 * The shared `assertNoDiagnosticPhiLeak` runner cannot answer this. It hunts a
 * **verbatim** marker, and the leak this item is about is a **re-encoding**: four
 * bytes of a name rendered as an 8-hex-char tag, or as the decimal a
 * `readUInt32LE` of them gives. `phi-diagnostic-surface.test.ts` says so in as
 * many words about `snippet`, and the same blind spot covers the message. So the
 * detector below is purpose-built: plant a name, then search every fatal message
 * for **every 4-byte window of that name rendered as a tag, every 4-byte window
 * rendered as a 32-bit length, and every 2-byte window rendered as a VR.**
 *
 * `leakingMessage` is the non-vacuity control. It reconstructs `0a8c6e3`'s own
 * template for one of these codes and asserts the detector catches it, so a green
 * run here cannot mean "the search found nothing because the search is broken".
 *
 * ## 2. The `{ strict: true }` snippet is cut in the frame its offset names
 *
 * Folded in from `#75`, where it was found and disclosed rather than fixed. The
 * snippet was always cut from the **whole file** while the offset it was cut at
 * moved with the frame, so inside a defined-length Sequence Item the 16 bytes
 * came back from wherever that item-relative number happened to land measured
 * from byte 0. The `oneFileTwoFrames` fixture engineers exactly that collision
 * with a name at the colliding root offset, so the test is red on base for the
 * right reason rather than by luck.
 *
 * **Neither half makes `DicomParseError` safe to log.** `snippet` is still 16 raw
 * source bytes (D-10). What changed is that it is now the bytes at the offset the
 * error names, instead of an unrelated element's.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { deidentify } from "../../src/deident/index.js";
import type { DeidentifyReport } from "../../src/deident/types.js";
import { defineProfile } from "../../src/profiles/index.js";
import type { VR } from "../../src/dictionary/types.js";
import { KNOWN_VRS } from "../../src/parser/endian.js";
import { DicomParseError, FATAL_CODES } from "../../src/parser/errors.js";
import { FATAL_MESSAGES, elementLengthExceedsBuffer } from "../../src/parser/fatals.js";
import { parseDicom } from "../../src/parser/index.js";
import { renderTag } from "../../src/parser/tokens.js";
import { WARNING_MESSAGES } from "../../src/parser/warnings.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_IMPLICIT_LE = "1.2.840.10008.1.2";

/**
 * Synthetic and name-bearing. `#55` paid a blocker for a pinning test that was
 * **vacuous by fixture** - its payload carried no name, so nothing it asserted
 * could have caught the leak it was written for.
 */
const NAME = "MR BRAIN SMITHSON ";

function even(bytes: Buffer): Buffer {
  return bytes.length % 2 === 0 ? bytes : Buffer.concat([bytes, Buffer.from([0x20])]);
}
function val(text: string): Buffer {
  return even(Buffer.from(text, "latin1"));
}

// ---------------------------------------------------------------------------
// The detector.
// ---------------------------------------------------------------------------

interface Leak {
  readonly kind: "tag" | "length" | "length-less-item-header" | "vr" | "byte";
  readonly rendered: string;
  readonly bytes: string;
}

/**
 * The 8-byte Item header: PS3.5 2026c section 7.1.1's 4-byte Data Element Tag
 * plus section 7.5.1's 4-byte Value (Item) Length. **Both citations are needed
 * and a graded pass caught the draft that used only 7.5.1**, which fixes the
 * length field alone.
 *
 * **🛑 THIS IS ONE OFFSET, NOT THE OFFSET, AND SAYING SO IS THE POINT.** The
 * `length-less-item-header` arm hunts a rendering shifted by exactly this much,
 * which is what `DICOM_ITEM_CROSSES_SEQUENCE_END` rendered **when the crossing
 * item was its sequence's first**. Put one 24-byte item ahead of it and the
 * shift is 32, and this arm would not have seen it - measured on base `src/`,
 * the same `"SO\0\0"` sequence length rendered `20275` rather than `20299`. A
 * draft of this constant claimed 8 was "the only structural constant any
 * registry template has ever subtracted", and that was false twice over:
 * `./fatals.ts` already discloses `{n} = buffer.length - cursor.position`, a
 * **variable** shift the message publishes beside the offset it needs.
 *
 * The arm is not widened to a range, deliberately. A range has no non-vacuity
 * control - the same reason the missing 2-byte-as-`uint16` arm below is named
 * rather than armed - and the slot it hunted is gone from the registry, so a
 * wider arm would be machinery guarding nothing. **What clears the class is the
 * factory signature, not this arm; this arm is the measurement that the
 * detector could not see the shift at all.**
 */
const ITEM_HEADER_BYTES = 8;

/**
 * Every way four or two bytes of `payload` could surface in a message, and the
 * bytes each rendering came from.
 *
 * - **tag**: `joinTag(readUInt16LE(i), readUInt16LE(i + 2))`, which is how this
 *   parser composes an 8-hex-char tag out of a header's four bytes.
 * - **length**: `readUInt32LE(i)`, printed as a decimal. Reversible with one
 *   typed read, which is why "it is only a number" was never an argument.
 * - **vr**: two bytes as ASCII, in a `VR=` slot.
 * - **byte**: ONE byte as a decimal, in a slot that carries a raw header byte.
 *   Added by the sixth instance of `DICOM-DIAGNOSTIC-PHI-RESIDUALS`, which this
 *   detector could not see for the whole of its previous life:
 *   `DICOM_NONZERO_RESERVED_BYTES` printed the two reserved bytes as
 *   `first byte 78, second byte 32` - two letters of a surname - and nothing
 *   here hunted a single byte. **A detector that has never looked for a shape
 *   has not cleared it.**
 *
 * **🛑 THE `length` ARM'S 7-DIGIT FLOOR IS GONE, AND ITS REMOVAL IS WHY THE
 * SEVENTH INSTANCE OF `DICOM-DIAGNOSTIC-PHI-RESIDUALS` BECAME VISIBLE.** The
 * floor read "a short decimal could collide with a legitimate byte count", and
 * the sentence beside it - "every 4-byte window of a printable-ASCII payload
 * exceeds 1,000,000,000, so nothing in this fixture set is skipped" - was true
 * and was the whole defect. A declared Value Length is only *reachable* through
 * a parse if the buffer really holds that many bytes, so every fabricated length
 * a fixture can drive through this library has **high-order zero bytes** and
 * therefore a SHORT decimal. `"SO\0\0"` renders `20307`: five digits, two of
 * them letters of a surname, and structurally under the floor. The floor was not
 * a conservative filter on an arm that worked; it excluded the entire class of
 * length leak that can actually happen.
 *
 * **A GUARD THAT HAS NEVER BEEN POINTED AT AN INPUT HAS NOT CLEARED THAT INPUT,
 * AND A GUARD WITH A FLOOR HAS NOT CLEARED ANYTHING BELOW THE FLOOR.** The same
 * shape has now cost this ecosystem a `phi-scan` printing clean over a root it
 * never opened and an em-dash gate accounting skipped paths into an unreconciled
 * bucket. Widening the detector before touching any code is how instance six was
 * found and how instance seven's real extent was measured.
 *
 * The collision the floor was worried about is answered by MATCHING, not by
 * skipping: a rendering of seven digits or more keeps the original substring
 * search unchanged, so nothing this detector caught before can stop being
 * caught, and a shorter one must equal a WHOLE maximal digit run of the message
 * rather than appear anywhere inside one. See {@link leaksIn}.
 *
 * **🛑 AND THE `length-less-item-header` ARM EXISTS BECAUSE THE FLOOR'S REMOVAL
 * WAS NOT ENOUGH: POINTED AT THE EIGHTH INSTANCE, THE WIDENED DETECTOR RETURNED
 * CLEAN.** `DICOM_ITEM_CROSSES_SEQUENCE_END` rendered `endLimit -
 * cursor.position`, which is the enclosing sequence's declared Value Length less
 * {@link ITEM_HEADER_BYTES}. Every arm above hunts a rendering **equal** to a
 * typed read of a payload window, so a **shifted** rendering was invisible to
 * all of them: measured on the `"SO\0\0"` payload this file already carries, the
 * shipped template returned `[]` while a direct render of the same length
 * returned the `length` hit. **A wire number shifted by an amount the reader can
 * compute is the wire number** - an addition puts it back - so this is the digit
 * floor's disease one level up, and a detector that has never looked for a shape
 * has not cleared it.
 *
 * **The arm covers ONE offset and is not a general shifted-rendering net** - see
 * {@link ITEM_HEADER_BYTES}, which measures the case it would still miss. Its
 * control is the reconstructed `0.0.14` template in
 * `itemCrossesSequenceEndNoLongerRendersTheSequenceLengthLessTheItemHeader`.
 *
 * **🛑 THERE IS STILL NO 2-BYTE-AS-`uint16` ARM, AND THAT IS A STATED GAP RATHER
 * THAN A CLEARED ONE.** A short-form Explicit VR Value Length is exactly that
 * shape. No registry entry renders one today, so an arm for it would have
 * nothing to hunt and no non-vacuity control. If a future call site renders a
 * short-form length, this detector will not see it. Named here so the next
 * reader does not infer coverage from silence.
 */
function renderings(payload: string): readonly Leak[] {
  const bytes = Buffer.from(payload, "latin1");
  const out: Leak[] = [];
  for (let i = 0; i + 4 <= bytes.length; i += 1) {
    const group = bytes.readUInt16LE(i).toString(16).padStart(4, "0").toUpperCase();
    const element = bytes
      .readUInt16LE(i + 2)
      .toString(16)
      .padStart(4, "0")
      .toUpperCase();
    const window = bytes.subarray(i, i + 4).toString("latin1");
    out.push({ kind: "tag", rendered: group + element, bytes: window });
    // NO FLOOR. Every 4-byte window is hunted, however short its decimal, and
    // the collision question is settled in `leaksIn` by how the match is made.
    out.push({ kind: "length", rendered: String(bytes.readUInt32LE(i)), bytes: window });
    // ...and the same window shifted by {@link ITEM_HEADER_BYTES}, which states
    // both what that covers and what it does not.
    const shifted = bytes.readUInt32LE(i) - ITEM_HEADER_BYTES;
    if (shifted >= 0) {
      out.push({ kind: "length-less-item-header", rendered: String(shifted), bytes: window });
    }
  }
  for (let i = 0; i + 2 <= bytes.length; i += 1) {
    out.push({
      kind: "vr",
      rendered: bytes.subarray(i, i + 2).toString("latin1"),
      bytes: bytes.subarray(i, i + 2).toString("latin1"),
    });
  }
  for (let i = 0; i < bytes.length; i += 1) {
    out.push({
      kind: "byte",
      rendered: String(bytes[i]),
      bytes: bytes.subarray(i, i + 1).toString("latin1"),
    });
  }
  return out;
}

/**
 * Every leak of `payload` present in `message`.
 *
 * **The `vr` arm hunts only windows that are NOT one of the 34, and that is the
 * honest scope rather than a weakening.** `renderVr` bounds a VR by **membership
 * in a closed set**, which is the posture `./warnings.ts` ratified and this
 * registry copies: two document bytes that happen to spell `OB` render as `OB`,
 * deliberately, because refusing them would cost every message its VR while
 * withholding nothing an attacker could not have guessed from 34 options. What
 * must never appear is a window the set does **not** contain. So a payload
 * fragment that IS a VR is out of scope here by design, and `fatals.test.ts`
 * carries the direct unit rows for both directions instead.
 *
 * Both slot phrasings are matched. The registry renders `{vr}` as `VR=xx` in one
 * entry and as `resolved to xx` in the other, and a first draft of this function
 * knew only the first, so a document byte in the Implicit VR LE message would
 * have read clean. A graded pass caught it.
 *
 * **The `byte` arm is SLOT-SCOPED, and that is a stated limit rather than a
 * quiet one.** A single byte is a decimal between 0 and 255, so a bare-number
 * search cannot tell one from a legitimate count - `DICOM_DEIDENT_SEQUENCE_NOT_
 * AUDITABLE` prints a byte span, `DICOM_UNSUPPORTED_CHARSET` prints a value
 * index, and both are small. So this arm hunts the phrasings that carry a raw
 * header byte, which is what the shipped registry had. The structural net for
 * the same class is not here at all: it is the FACTORY SIGNATURES asserted in
 * `test/parser/warnings.test.ts`, where a slot that does not exist cannot be
 * filled by any call site. This arm is the measurement; the signature is the
 * bound.
 *
 * **The `length` arm is ADDITIVE over what it did before, which is the property
 * that makes the floor's removal safe to reason about.** A rendering of seven
 * digits or more is still hunted with the same `String.includes` search, so
 * every leak the shipped detector could catch it still catches. A shorter one is
 * new, and it must equal a whole maximal digit run of the message: `20307` is a
 * hit against `"its 20307 recorded bytes"` and not against `"offset=120307"`.
 * That is what keeps a five-digit rendering from matching a substring of some
 * unrelated count, without excluding the five-digit renderings that are the only
 * ones a real parse can reach. **`length-less-item-header` is matched exactly the
 * same way**, for the same reason: the shifted renderings a real parse can reach
 * are short too, because the unshifted one was.
 */
function digitRuns(message: string): readonly string[] {
  return message.match(/[0-9]+/gu) ?? [];
}

function leaksIn(message: string, payload: string): readonly Leak[] {
  const runs = digitRuns(message);
  return renderings(payload).filter((leak) => {
    if (leak.kind === "vr") {
      return (
        !KNOWN_VRS.has(leak.rendered) &&
        new RegExp(
          `VR=${leak.rendered}(?![A-Za-z])|resolved to ${leak.rendered}(?![A-Za-z])`,
          "u",
        ).test(message)
      );
    }
    if (leak.kind === "byte") {
      return new RegExp(`(?:first|second) byte ${leak.rendered}(?![0-9])`, "u").test(message);
    }
    if (
      (leak.kind === "length" || leak.kind === "length-less-item-header") &&
      leak.rendered.length < 7
    ) {
      return runs.includes(leak.rendered);
    }
    return message.includes(leak.rendered);
  });
}

/** The registry entries as anchored patterns, with the structural slots opened up. */
const REGISTRY_PATTERNS: readonly RegExp[] = Object.values(FATAL_MESSAGES).map((entry) => {
  const escaped = entry.message.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = escaped
    .replace(/\\\{vr\\\}/gu, "(?:[A-Z]{2}|<withheld>)")
    .replace(/\\\{zlib\\\}/gu, "(?:[A-Z0-9_]+|<withheld>)")
    .replace(/\\\{ts\\\}/gu, "(?:Transfer Syntax .+|The Transfer Syntax UID)")
    .replace(/\\\{n\\\}/gu, "\\d+");
  // `NOT_DICOM_PART_10` carries digits, so the code class is not `[A-Z_]+`.
  return new RegExp(`^\\[[A-Z0-9_]+\\] ${pattern}(?: \\(offset=\\d+\\))?$`, "u");
});

/** Strip the `[CODE] ` prefix and ` (offset=N)` suffix `DicomParseError` adds. */
function isRegistryEntry(message: string): boolean {
  return REGISTRY_PATTERNS.some((pattern) => pattern.test(message));
}

// ---------------------------------------------------------------------------
// The fixtures. Each one drives a distinct Tier-3 message off a name-bearing
// payload, and `everyFixtureReachesADistinctMessage` is what stops the table
// silently collapsing onto one code and proving nothing about the rest.
// ---------------------------------------------------------------------------

/**
 * An `ST` carrier whose Value Length under-declares by `delta`, desynchronizing
 * the reader onto a fabricated header **inside the name**. This is the shape
 * every measured leak came from: `#55`'s, `#64`'s, and all four of this item's.
 */
function desynchronized(transferSyntax: string, delta: number): Buffer {
  return buildDicom({
    transferSyntax,
    elements: [{ tag: "00084000", vr: "ST" as VR, value: val(NAME), declaredLengthDelta: delta }],
  });
}

/** A defined-length `SQ` whose value area is the name, so no item header is real. */
function sequenceOverAName(): Buffer {
  return buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [{ tag: "0040A730", vr: "SQ" as VR, value: val(NAME) }],
  });
}

/** A well-formed prefix, so a hand-assembled tail is reached rather than refused early. */
function prefix(): Buffer {
  return buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [{ tag: "00080060", vr: "CS" as VR, value: val("CT") }],
  });
}

/** An undefined-length `SQ` whose Item length field IS four bytes of the name. */
function itemLengthFromAName(): Buffer {
  const name = Buffer.from(NAME, "latin1");
  const itemHeader = Buffer.alloc(8);
  itemHeader.writeUInt16LE(0xfffe, 0);
  itemHeader.writeUInt16LE(0xe000, 2);
  name.copy(itemHeader, 4, 0, 4);
  return Buffer.concat([
    prefix(),
    Buffer.from([0x40, 0x00, 0x30, 0xa7]),
    Buffer.from("SQ", "ascii"),
    Buffer.from([0x00, 0x00]),
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    itemHeader,
    name,
  ]);
}

/** A stray delimitation item at Data Set level whose length field is the name. */
function strayDelimiter(): Buffer {
  const name = Buffer.from(NAME, "latin1");
  const stray = Buffer.alloc(8);
  stray.writeUInt16LE(0xfffe, 0);
  stray.writeUInt16LE(0xe00d, 2);
  name.copy(stray, 4, 0, 4);
  return Buffer.concat([prefix(), stray]);
}

/**
 * A `(0002,0000)` group length declaring more bytes than the file holds, beside
 * a name in the Data Set. `buildDicom`'s `"wrong"` knob is a mismatch the parser
 * tolerates with a warning; this needs the over-run that refuses, so the four
 * value bytes are patched in place. They sit at a fixed offset: 128 preamble +
 * `DICM` + the 8-byte `(0002,0000) UL 4` header.
 */
function fileMetaGroupLengthOverruns(): Buffer {
  const raw = buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [{ tag: "00100010", vr: "PN" as VR, value: val(NAME) }],
  });
  const groupLengthValueAt = 128 + 4 + 8;
  // Guard the offset rather than trusting it: `buildDicom` owns this layout.
  if (raw.subarray(128, 132).toString("ascii") !== "DICM") {
    throw new Error("fileMetaGroupLengthOverruns: no DICM at 128");
  }
  const patched = Buffer.from(raw);
  patched.writeUInt32LE(0xffff, groupLengthValueAt);
  return patched;
}

/**
 * The four bytes a fabricated **Item** Length is built from: two letters of the
 * planted surname, then the two zero high bytes every reachable fabricated
 * length carries. `"HS"` rather than `"SO"` because an Item Length is even on
 * any file this parser will have got this far into, and `0x53` is odd.
 */
const ITEM_LEN_BYTES = Buffer.from([0x48, 0x53, 0x00, 0x00]);
const FABRICATED_ITEM_LENGTH = ITEM_LEN_BYTES.readUInt32LE(0);

/**
 * A defined-length `SQ` holding one defined-length Item whose Value (Item)
 * Length field is {@link ITEM_LEN_BYTES}, with an element inside the Item that
 * over-declares past the Item's end.
 *
 * This is the frame the ninth instance of `DICOM-DIAGNOSTIC-PHI-RESIDUALS`
 * lives in. `parseSequence` parses a defined-length Item from a **slice**, so
 * inside it `buffer.length` is the Item's own 32-bit declared length, and
 * `ELEMENT_LENGTH_EXCEEDS_BUFFER` rendered `buffer.length - cursor.position`.
 *
 * `lead` is the size in bytes of a well-formed element placed **ahead** of the
 * over-declaring one, which is what moves `cursor.position` and therefore makes
 * the shift variable rather than the fixed 8 the eighth instance had.
 */
function overDeclareInsideAnItem(lead: number): { readonly raw: Buffer; readonly payload: string } {
  const parts: Buffer[] = [];
  if (lead > 0) {
    const leadValue = Buffer.alloc(lead - 8, 0x41);
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x0008, 0);
    header.writeUInt16LE(0x0080, 2);
    header.write("LO", 4, "ascii");
    header.writeUInt16LE(leadValue.length, 6);
    parts.push(header, leadValue);
  }
  // The element that over-declares: a short-form Explicit VR header whose 16-bit
  // Value Length reaches past the end of the Item's slice but not past the file.
  const over = Buffer.alloc(8);
  over.writeUInt16LE(0x0008, 0);
  over.writeUInt16LE(0x0060, 2);
  over.write("CS", 4, "ascii");
  over.writeUInt16LE(0xfffe, 6);
  parts.push(over);
  const used = parts.reduce((n, b) => n + b.length, 0);
  parts.push(Buffer.alloc(FABRICATED_ITEM_LENGTH - used, 0x41));

  const itemHeader = Buffer.alloc(8);
  itemHeader.writeUInt16LE(0xfffe, 0);
  itemHeader.writeUInt16LE(0xe000, 2);
  ITEM_LEN_BYTES.copy(itemHeader, 4);

  const sqHeader = Buffer.alloc(12);
  sqHeader.writeUInt16LE(0x0040, 0);
  sqHeader.writeUInt16LE(0xa730, 2);
  sqHeader.write("SQ", 4, "ascii");
  sqHeader.writeUInt16LE(0, 6);
  sqHeader.writeUInt32LE(ITEM_HEADER_BYTES + FABRICATED_ITEM_LENGTH, 8);

  const itemBytes = Buffer.concat([itemHeader, ...parts]);
  return {
    raw: Buffer.concat([prefix(), sqHeader, itemBytes]),
    // 🛑 THE PAYLOAD INCLUDES THE ITEM HEADER, AND IT HAS TO. The fabricated
    // length's four bytes are contiguous only there: the two zero high bytes are
    // not part of the surname, so a payload cut to `NAME` alone makes every
    // `length` arm below vacuous - including the DIRECT-render control, measured.
    payload: itemBytes.subarray(0, 128).toString("latin1"),
  };
}

/** The offset of the Item Length field in {@link overDeclareInsideAnItem}'s output. */
const ITEM_LENGTH_FIELD_AT = prefix().length + 12 + 4;

// ---------------------------------------------------------------------------
// The `deidentify()` channel. Both `DICOM_DEIDENT_*_NOT_AUDITABLE` codes are
// raised there and nowhere else, so the `onWarning` sweep above cannot reach
// either, and each has its own producer - a graded pass caught a draft asserting
// one code while five artifacts said the PAIR was pinned.
// ---------------------------------------------------------------------------

/**
 * The four bytes a fabricated Value Length is built from here: two letters of
 * the planted surname, then the two zero high bytes **every reachable
 * fabricated length must carry**, because the buffer has to hold that many
 * bytes for the parse to reach the element at all.
 */
const LEN_BYTES = Buffer.from([0x53, 0x4f, 0x00, 0x00]);
const FABRICATED_LENGTH = LEN_BYTES.readUInt32LE(0);

/** The institution-name carrier the fabricated headers are written inside. */
const CARRIER_TEXT = "MERCY GENERAL HOSPITALS ";

/**
 * A root `LO` carrier whose Value Length under-declares by exactly the tail that
 * follows it, so the reader finishes the carrier early and resynchronizes onto
 * `fabricatedHeader` as though it were the next Data Element.
 */
function underDeclaringCarrier(
  fabricatedHeader: Buffer,
  filler: Buffer,
  extra: readonly { tag: string; vr: string; value: Buffer }[] = [],
): { readonly raw: Buffer; readonly payload: string } {
  const tail = Buffer.concat([fabricatedHeader, filler]);
  const raw = buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [
      { tag: "00100010", vr: "PN" as VR, value: val(NAME) },
      ...extra.map((e) => ({ tag: e.tag, vr: e.vr as VR, value: e.value })),
      {
        tag: "00080080",
        vr: "LO" as VR,
        value: Buffer.concat([Buffer.from(CARRIER_TEXT, "ascii"), tail]),
        declaredLengthDelta: -tail.length,
      },
    ],
  });
  // 🛑 THE PAYLOAD IS THE CARRIER'S WHOLE VALUE, FILLER INCLUDED. A draft cut it
  // at the end of the fabricated header "because the filler is a constant byte
  // and would only make the rendering set larger without making it more
  // adversarial" - and a graded pass measured that false: the sequence fixture's
  // filler OPENS WITH A NAME (`"BOND^JAMES"`), so the narrowing excluded a
  // name-bearing region of the very value under test. It hid nothing on this
  // tree, which is exactly why it had to go: an unmeasured reason for narrowing
  // a search is the shape this repo loses passes to.
  return {
    raw,
    payload: Buffer.concat([Buffer.from(CARRIER_TEXT, "ascii"), tail]).toString("latin1"),
  };
}

/** Producer 1's payload, hoisted so the reconstructed templates can search it. */
const UNDEFINED_VR_PAYLOAD = underDeclaringCarrier(
  Buffer.concat([
    Buffer.from([0x08, 0x00, 0x08, 0x00]),
    Buffer.from("Zz", "ascii"),
    Buffer.from([0x00, 0x00]),
    LEN_BYTES,
  ]),
  Buffer.alloc(0),
).payload;

interface UnauditableFixture {
  readonly report: DeidentifyReport;
  readonly payload: string;
}

/**
 * One fixture per code, keyed by the code it must raise.
 *
 * Producer 1 is an element whose on-wire VR is outside the 34; producer 2 is a
 * private element a caller `Profile` declares `SQ` while the wire says `OB`, so
 * it needs the profile and the retain option. Both fabricated headers carry the
 * same {@link LEN_BYTES}, so one payload shape covers both.
 */
function unauditableFixtures(): Readonly<Record<string, UnauditableFixture>> {
  const undefinedVr = underDeclaringCarrier(
    Buffer.concat([
      Buffer.from([0x08, 0x00, 0x08, 0x00]),
      Buffer.from("Zz", "ascii"),
      Buffer.from([0x00, 0x00]),
      LEN_BYTES,
    ]),
    Buffer.alloc(FABRICATED_LENGTH, 0x41),
  );
  const profile = defineProfile({
    name: "acme-fabricated",
    description: "Synthetic vendor block declared SQ.",
    privateTags: { ACME: { "0009XX01": { vr: "SQ", keyword: "AcmeSeq", name: "Acme Seq" } } },
  });
  const sequence = underDeclaringCarrier(
    Buffer.concat([
      Buffer.from([0x09, 0x00, 0x01, 0x10]),
      Buffer.from("OB", "ascii"),
      Buffer.from([0x00, 0x00]),
      LEN_BYTES,
    ]),
    Buffer.concat([Buffer.from("BOND^JAMES", "ascii"), Buffer.alloc(FABRICATED_LENGTH - 10, 0x41)]),
    [{ tag: "00090010", vr: "LO", value: Buffer.from("ACME", "ascii") }],
  );
  return {
    DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE: {
      report: deidentify(parseDicom(undefinedVr.raw)).report,
      payload: undefinedVr.payload,
    },
    DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE: {
      report: deidentify(parseDicom(sequence.raw), { retain: ["RetainSafePrivate"], profile })
        .report,
      payload: sequence.payload,
    },
  };
}

const FIXTURES: readonly (readonly [string, Buffer])[] = [
  // Explicit VR LE, every under-declare delta that desynchronizes rather than
  // truncating. -12, -14 and -16 are the three that reached a fabricated header
  // on `0a8c6e3`; the shallower ones land on the truncation guard and are kept
  // because a message that says nothing is still a message this table sweeps.
  ...([-2, -4, -6, -8, -10, -12, -14, -16] as const).map(
    (d) => [`explicit-le desync ${String(d)}`, desynchronized(TS_EXPLICIT_LE, d)] as const,
  ),
  ...([-2, -4, -6, -8, -10, -12, -14, -16] as const).map(
    (d) => [`implicit-le desync ${String(d)}`, desynchronized(TS_IMPLICIT_LE, d)] as const,
  ),
  ["sequence over a name", sequenceOverAName()],
  ["item length from a name", itemLengthFromAName()],
  ["stray delimitation item", strayDelimiter()],
  ["over-declare inside a defined-length item", overDeclareInsideAnItem(0).raw],
  ["over-declare 40 bytes into a defined-length item", overDeclareInsideAnItem(40).raw],
  ["file meta group length over-declares", fileMetaGroupLengthOverruns()],
  [
    "truncated mid-name",
    (() => {
      const whole = buildDicom({
        transferSyntax: TS_EXPLICIT_LE,
        elements: [{ tag: "00100010", vr: "PN" as VR, value: val(NAME) }],
      });
      return whole.subarray(0, whole.length - 6);
    })(),
  ],
  ["not a Part 10 file at all", Buffer.from(NAME.repeat(8), "latin1")],
];

/** Parse and return whatever `DicomParseError` came out, failing if none did. */
function errorFrom(raw: Buffer, strict = false): DicomParseError {
  try {
    parseDicom(raw, strict ? { strict: true } : {});
  } catch (err) {
    if (err instanceof DicomParseError) return err;
    throw err;
  }
  throw new Error("fixture did not throw");
}

/**
 * `true` when the error is a Tier-3 structural fatal rather than a `{ strict:
 * true }` escalation of a Tier-2 warning.
 *
 * The distinction is the scope of this file, and it is not a convenience.
 * `makeEmitter` throws the SAME class for an escalated Tier-2 code (D-35), so a
 * sweep that did not separate them would be grading `./warnings.ts`'s registry
 * under this item's name - and one of those messages is measured leaking here,
 * `PRE-EXISTING`. See `tierTwoEscalationStillNamesAFabricatedTag` below, which
 * pins that as open rather than letting this file imply it is closed.
 */
function isTierThree(err: DicomParseError): boolean {
  return (Object.values(FATAL_CODES) as readonly string[]).includes(err.code);
}

/** Parse and return the Tier-3 fatal, failing loudly if the fixture reached none. */
function fatalFrom(raw: Buffer, strict = false): DicomParseError {
  const err = errorFrom(raw, strict);
  if (!isTierThree(err)) {
    throw new Error(`fixture reached a Tier-2 escalation, not a Tier-3 fatal: ${err.code}`);
  }
  return err;
}

// ---------------------------------------------------------------------------

describe("PHI: Tier-3 fatal messages carry no document bytes", () => {
  it.each(FIXTURES.map(([name, raw]) => [name, raw] as const))("%s", (_name, raw) => {
    for (const strict of [false, true]) {
      const err = errorFrom(raw, strict);
      // A strict escalation carries a Tier-2 registry message through this class
      // and is graded by `./warnings.ts`'s own suite, not here.
      if (!isTierThree(err)) continue;
      const leaks = leaksIn(err.message, NAME);
      expect(
        leaks,
        `leaked ${leaks.map((l) => `${l.kind} ${l.rendered} == ${JSON.stringify(l.bytes)}`).join("; ")} in ${JSON.stringify(err.message)}`,
      ).toStrictEqual([]);
    }
  });

  it("every fatal message is exactly a registry entry with structural tokens filled in", () => {
    // The `transform` property, copied from the Tier-2 twin in
    // `phi-diagnostic-surface.test.ts`. It is the one shape that cannot be
    // defeated by a cleverer plant, because it compares the message to the
    // registry instead of searching it for something.
    for (const [name, raw] of FIXTURES) {
      for (const strict of [false, true]) {
        const err = errorFrom(raw, strict);
        if (!isTierThree(err)) continue;
        expect(isRegistryEntry(err.message), `${name}: ${JSON.stringify(err.message)}`).toBe(true);
      }
    }
  });

  it("tierTwoEscalationNoLongerNamesAFabricatedTag", () => {
    // 🩺 CLOSED by `DICOM-DIAGNOSTIC-PHI-RESIDUALS`. Through `0.0.13` this row
    // asserted the leak: the same desynchronized read that used to put `"RAIN"`
    // into a Tier-3 message lands on an ODD group, so `resolveImplicitVR` calls
    // the fabricated header a private element and `DICOM_PRIVATE_TAG_NO_CREATOR`
    // rendered its tag - `4E495320`, `"IN S"`, four bytes from inside the name.
    //
    // The remedy is the one this package has taken five times: the tag is bound
    // out of the FACTORY SIGNATURE rather than behind a branch, because
    // `renderTag` shape-checks and cannot refuse. What is specific here is the
    // reason it is a bound and not the product call the item leaves open for
    // `report.removedPrivateTags`: this code fires only on an ODD group, and an
    // odd group is the one class of tag no closed table this library holds can
    // vouch for. See `privateTagNoCreator`'s JSDoc.
    //
    // The row still asserts the CODE, so the escalation channel is unchanged and
    // this file cannot quietly stop exercising it.
    const err = errorFrom(desynchronized(TS_IMPLICIT_LE, -12), true);
    expect(err.code).toBe("DICOM_PRIVATE_TAG_NO_CREATOR");
    expect(isTierThree(err)).toBe(false);
    expect(leaksIn(err.message, NAME)).toStrictEqual([]);
    // Non-vacuity, and it is the whole point of the row: the payload really does
    // reach this parse, and `"IN S"` really is four of its bytes. Rebuild the
    // template `0.0.13` shipped and assert the detector still catches THAT.
    const bytes = Buffer.from(NAME, "latin1");
    // `"IN S"` is `NAME[6..10)` - the four bytes the desynchronized reader lands
    // on at delta -12. Composed the way the parser composes a tag, not typed.
    expect(bytes.subarray(6, 10).toString("latin1")).toBe("IN S");
    const fabricated =
      bytes.readUInt16LE(6).toString(16).padStart(4, "0").toUpperCase() +
      bytes.readUInt16LE(8).toString(16).padStart(4, "0").toUpperCase();
    expect(fabricated).toBe("4E495320");
    const oldTemplate = `Private element (${fabricated}) has no Private Creator registered for its block; treating as VR=UN.`;
    expect(leaksIn(oldTemplate, NAME).map((l) => l.bytes)).toContain("IN S");
  });

  it("bothPrivateTagCodesAreClosed, not just the one that was named", () => {
    // The trap this slice would otherwise have walked into. `resolveImplicitVR`
    // emits `DICOM_PRIVATE_TAG_NO_CREATOR` and
    // `DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR` from the SAME branch on the
    // SAME element, so the fixture above rendered `"IN S"` into both messages on
    // one parse. Closing the code the item named and leaving its twin would have
    // relocated the leak, not closed it - the code-level form of "a line-based
    // grep corrects two carriers of four".
    //
    // Non-strict, through `onWarning`, because that is the channel the leak
    // actually travels on: the fixture's parse dies at the truncation guard, so
    // the warnings never land on a surviving `ds.warnings`.
    const seen: string[] = [];
    try {
      parseDicom(desynchronized(TS_IMPLICIT_LE, -12), {
        onWarning: (w) => seen.push(`${w.code} ${w.message}`),
      });
    } catch {
      // The fatal is this fixture's designed end; the warnings are what is graded.
    }
    const codes = seen.map((entry) => entry.split(" ")[0]);
    expect(codes).toContain("DICOM_PRIVATE_TAG_NO_CREATOR");
    expect(codes).toContain("DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR");
    for (const entry of seen) {
      const message = entry.slice(entry.indexOf(" ") + 1);
      const leaks = leaksIn(message, NAME);
      expect(
        leaks,
        `${entry.split(" ")[0]} leaked ${leaks.map((l) => JSON.stringify(l.bytes)).join(", ")}`,
      ).toStrictEqual([]);
    }
  });

  it("oddLengthValuePaddedNoLongerNamesAFabricatedTagOrLength", () => {
    // 🩺 CLOSED. This is the FIFTH instance the sibling half of
    // `DICOM-DIAGNOSTIC-PHI-RESIDUALS` measured open and deliberately left,
    // because closing it needed a package-wide change rather than a rider.
    // Through `0.0.14` this row ASSERTED the leak.
    //
    // Under Explicit VR LE an under-declare desynchronizes the reader onto a
    // fabricated header whose declared length happens to be odd, and
    // `DICOM_ODD_LENGTH_VALUE_PADDED` rendered BOTH four bytes as `{tag}` and a
    // further four as the decimal `{n}` - eight consecutive payload bytes in one
    // message, each reversible with one typed read. It was the worst of the six.
    //
    // The two halves closed differently, and that split is the slice:
    //   `{tag}` - `renderTag` is a MEMBERSHIP test now. PS3.6's registry either
    //     carries a literal row for the tag or it does not, and `4E495320` is
    //     not one of the 5,221 it does. This code fires on ANY tag, so a
    //     withhold-always bound was never available; a membership bound is,
    //     and it keeps the tag on every well-formed file.
    //   `{n}` - bound out of the FACTORY SIGNATURE. A raw length has neither a
    //     shape nor a membership to test, so there is nothing for a renderer to
    //     check and the only bound available is the absence of the slot.
    const seen: string[] = [];
    try {
      parseDicom(desynchronized(TS_EXPLICIT_LE, -12), {
        onWarning: (w) => seen.push(`${w.code} ${w.message}`),
      });
    } catch {
      // Designed: the parse dies after the warning is handed to `onWarning`.
    }
    const padded = seen.find((entry) => entry.startsWith("DICOM_ODD_LENGTH_VALUE_PADDED "));
    // Non-vacuity, first half: the code really does still fire on this fixture,
    // so an empty leak list below cannot mean the message stopped existing.
    expect(padded).toBeDefined();
    const message = (padded ?? "").slice((padded ?? "").indexOf(" ") + 1);
    expect(leaksIn(message, NAME)).toStrictEqual([]);

    // Non-vacuity, second half: rebuild `0.0.14`'s own template over the bytes
    // this fixture really lands on and assert the detector still catches THAT,
    // on both slots. A green row must not mean the search is broken.
    const bytes = Buffer.from(NAME, "latin1");
    expect(bytes.subarray(6, 10).toString("latin1")).toBe("IN S");
    const fabricatedTag =
      bytes.readUInt16LE(6).toString(16).padStart(4, "0").toUpperCase() +
      bytes.readUInt16LE(8).toString(16).padStart(4, "0").toUpperCase();
    expect(fabricatedTag).toBe("4E495320");
    // The fabricated header is long-form: tag at [6,10), an unrecognized VR
    // "MI" at [10,12), the reserved pair "TH" at [12,14), and the 32-bit length
    // at [14,18). Every offset here is measured off this fixture, not typed.
    expect(bytes.subarray(14, 18).toString("latin1")).toBe("SON ");
    const fabricatedLength = String(bytes.readUInt32LE(14));
    expect(fabricatedLength).toBe("542003027");
    const shipped = `Element (${fabricatedTag}) has odd declared length ${fabricatedLength}; cursor advanced by one padding byte to maintain alignment.`;
    const wouldLeak = leaksIn(shipped, NAME);
    expect(wouldLeak.map((l) => l.kind)).toContain("tag");
    expect(wouldLeak.map((l) => l.kind)).toContain("length");
    expect(wouldLeak.map((l) => l.bytes)).toContain("IN S");
    expect(wouldLeak.map((l) => l.bytes)).toContain("SON ");
  });

  it("nonzeroReservedBytesNoLongerNamesItsTwoRawHeaderBytes", () => {
    // 🔴 THE SIXTH INSTANCE, FILED NOWHERE BEFORE THIS SLICE AND FOUND ONLY
    // BECAUSE THE DETECTOR WAS WIDENED BEFORE THE CODE WAS TOUCHED.
    //
    // `DICOM_NONZERO_RESERVED_BYTES` already withheld its tag, and the reason it
    // gave was that its trigger IS "this header may not be a header". It then
    // printed the two reserved bytes off that same header as two decimals. The
    // bound was half a bound, and no shipped detector could see the other half:
    // this file hunted four-byte and two-byte windows, never a single byte.
    //
    // Measured on `0.0.14`: six under-declare deltas each put two letters of the
    // name into this message. Delta -8 is the row pinned here.
    const seen: string[] = [];
    try {
      parseDicom(desynchronized(TS_EXPLICIT_LE, -8), {
        onWarning: (w) => seen.push(`${w.code} ${w.message}`),
      });
    } catch {
      // Designed: the parse dies after the warning is handed to `onWarning`.
    }
    const reserved = seen.find((entry) => entry.startsWith("DICOM_NONZERO_RESERVED_BYTES "));
    expect(reserved).toBeDefined();
    const message = (reserved ?? "").slice((reserved ?? "").indexOf(" ") + 1);
    expect(leaksIn(message, NAME)).toStrictEqual([]);

    // Non-vacuity: `0.0.14`'s template over the bytes this delta really lands
    // on. At delta -8 the fabricated long-form header starts at NAME[10], so its
    // reserved pair is NAME[16..18) - `"N "`, the last letter of the surname and
    // the pad byte after it. Measured off the fixture, not typed from memory.
    const bytes = Buffer.from(NAME, "latin1");
    expect(bytes.subarray(16, 18).toString("latin1")).toBe("N ");
    expect([bytes[16], bytes[17]]).toStrictEqual([78, 32]);
    const shipped = `Non-zero reserved bytes between VR and length (first byte ${String(bytes[16])}, second byte ${String(bytes[17])}); ignoring. Tag withheld; the byte offset identifies the element.`;
    const wouldLeak = leaksIn(shipped, NAME);
    expect(wouldLeak.map((l) => l.kind)).toContain("byte");
    expect([...new Set(wouldLeak.map((l) => l.bytes))].sort()).toStrictEqual([" ", "N"]);
  });

  it("every PARSER Tier-2 warning this desync sweep reaches is clean, on both syntaxes", () => {
    // The sweep that found instance six, kept as the standing net rather than
    // thrown away with the finding. Ten under-declare deltas x two transfer
    // syntaxes, every warning that reaches `onWarning`, every rendering arm.
    //
    // 🛑 ITS CHANNEL IS `parseDicom` AND ONLY `parseDicom`, AND THAT LIMIT IS
    // STATED BECAUSE A GRADED PASS FOUND IT UNSTATED. Several registry codes are
    // emitted by `deidentify()` and by nothing else, so no `onWarning` sweep can
    // ever reach them - and two of those still render a raw wire length. Do not
    // read a green run here as a fact about the registry. The row directly below
    // is what covers that channel, and it asserts the leak rather than its
    // absence.
    //
    // 🩺 `-20` LEFT THE DELTA LIST, AND THE REASON IS THE SAME CLASS OF DEFECT
    // AS THE DIGIT FLOOR. The payload is 18 bytes, so `-20` asks `buildDicom`
    // for a negative Value Length and it throws while the FIXTURE is being
    // built - inside the `try`, which was there to swallow the parse failures
    // these fixtures are designed to end in. So both `-20` rows never reached a
    // parse and were counted as swept. The fixture is built outside the `try`
    // now, so a delta this helper cannot express fails loudly instead of
    // reading as clean.
    const offenders: string[] = [];
    let messagesSeen = 0;
    for (const ts of [TS_EXPLICIT_LE, TS_IMPLICIT_LE]) {
      for (const delta of [-2, -4, -6, -8, -10, -12, -14, -16, -18]) {
        const raw = desynchronized(ts, delta);
        try {
          parseDicom(raw, {
            onWarning: (w) => {
              messagesSeen += 1;
              const leaks = leaksIn(w.message, NAME);
              if (leaks.length > 0) {
                offenders.push(
                  `${w.code} @ ${ts} ${String(delta)}: ${leaks
                    .map((l) => `${l.kind} ${JSON.stringify(l.bytes)}`)
                    .join(", ")}`,
                );
              }
            },
          });
        } catch {
          // Most of these fixtures are designed to die; the warnings are graded.
        }
      }
    }
    // Non-vacuity: the sweep really did exercise messages. On `0.0.14` it
    // produced eight offending rows across two codes.
    expect(messagesSeen).toBeGreaterThan(20);
    expect(offenders).toStrictEqual([]);
  });

  it("deidentUnauditableCodesNoLongerRenderARawWireLength", () => {
    // 🩺 THE SEVENTH INSTANCE OF "a diagnostic about a PHI leak is itself a PHI
    // surface", CLOSED. Through `0.0.14` this row ASSERTED the leak.
    //
    // `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` and
    // `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` rendered `{n}` from
    // `Element.rawBytes.length`, which is not a count this parser invented: it
    // EQUALS the declared Value Length off the element header. When that header
    // is fabricated - the same under-declare construction every instance of this
    // item uses - the decimal is four document bytes, reversible with one
    // `readUInt32LE`. The first message was the sharper one: it withheld tag and
    // VR on the stated ground that the header may be fabricated, then printed
    // the length off that same header.
    //
    // Both are bound out of the factory signatures now, which is the remedy this
    // package has taken every time: a raw length has neither a shape nor a
    // membership for a renderer to check, so the only bound available is the
    // absence of the parameter.
    for (const [code, { report, payload }] of Object.entries(unauditableFixtures())) {
      const warning = report.warnings.find((w) => w.code === code);
      expect(warning, code).toBeDefined();
      const leaks = leaksIn(warning?.message ?? "", payload).filter((l) => l.kind === "length");
      expect(
        leaks,
        `${code} leaked ${leaks.map((l) => `${l.rendered} == ${JSON.stringify(l.bytes)}`).join("; ")}`,
      ).toStrictEqual([]);
    }

    // Non-vacuity on the payload: those four bytes really are "SO" out of
    // "SMITHSON" followed by the zero high bytes any reachable length carries,
    // and they really do render as 20307.
    expect(LEN_BYTES.subarray(0, 2).toString("latin1")).toBe("SO");
    expect(NAME).toContain("SO");
    expect(FABRICATED_LENGTH).toBe(20307);

    // Non-vacuity on the search: rebuild `0.0.14`'s own templates and assert the
    // detector catches THEM. A green row must not mean the search is broken.
    const shippedUndefinedVr = `An element at byte offset 230 carries an on-wire VR that is not one of the 34 PS3.5 6.2 defines, so its ${String(FABRICATED_LENGTH)} value bytes are not a Value Field this library decoded; emptied (PS3.15 E.1.1).`;
    const shippedSequence = `Element (00090110) is a Sequence carrier with no parsed items, so its ${String(FABRICATED_LENGTH)} recorded bytes could not be audited (PS3.15 E.1.1); emptied.`;
    for (const shipped of [shippedUndefinedVr, shippedSequence]) {
      const wouldLeak = leaksIn(shipped, UNDEFINED_VR_PAYLOAD).filter((l) => l.kind === "length");
      expect(
        wouldLeak.map((l) => l.rendered),
        shipped,
      ).toContain(String(FABRICATED_LENGTH));
      expect(wouldLeak.map((l) => l.bytes)).toContain("SO\0\0");
    }

    // 🩺 AND THE TRIPWIRE FINDING, PINNED SO IT CANNOT COME BACK. The shipped
    // detector's `length` arm skipped any rendering under seven digits, and
    // `20307` is five, so neither template above could ever have gone red here.
    // That was not a conservative filter on an arm that worked: a declared
    // length only survives a parse if the buffer really holds that many bytes,
    // so every fabricated length a fixture can drive through this library has
    // zero high-order bytes and therefore a SHORT decimal. The floor excluded
    // the whole reachable class.
    expect(String(FABRICATED_LENGTH).length).toBeLessThan(7);
    expect(LEN_BYTES[2]).toBe(0);
    expect(LEN_BYTES[3]).toBe(0);

    // The deferred half, asserted rather than implied shut: the number is still
    // published on the MODEL. `report.undefinedVrElements[].byteLength` and
    // `report.unauditableSequences[].byteLength` are model fields on the same
    // standing product call as `removedPrivateTags` and `contextPath` - a bound
    // there empties the field on every well-formed file - so this slice moved
    // the number off the message and left the fields alone, and says so.
    const fixtures = unauditableFixtures();
    const undefinedVrReport = fixtures["DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE"]?.report;
    const sequenceReport = fixtures["DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE"]?.report;
    expect(undefinedVrReport?.undefinedVrElements.map((u) => u.byteLength)).toContain(
      FABRICATED_LENGTH,
    );
    expect(sequenceReport?.unauditableSequences.map((s) => s.byteLength)).toContain(
      FABRICATED_LENGTH,
    );
  });

  it("itemCrossesSequenceEndNoLongerRendersTheSequenceLengthLessTheItemHeader", () => {
    // 🩺 THE EIGHTH INSTANCE, AND THE HALF THAT TRANSFERS IS THAT THE DETECTOR
    // WAS CLEAN ON IT. Through `0.0.14` `DICOM_ITEM_CROSSES_SEQUENCE_END`
    // rendered `endLimit - cursor.position` into a `{n2}` slot, defended by the
    // emit site's `endLimit < buffer.length` conjunct "bounding it by the
    // buffer". That bounds the number's MAGNITUDE. `endLimit` is the enclosing
    // sequence's declared Value Length off its own header, so the rendered count
    // is that declared length less the bytes of the sequence already consumed -
    // {@link ITEM_HEADER_BYTES} when the crossing item is the first, and more
    // when items precede it, which that constant states rather than hides. The
    // template rebuilt below is the first-item case.
    //
    // The floor's removal did not surface it, because every arm hunted a
    // rendering EQUAL to a typed read of a payload window. This row measures
    // that gap rather than describing it: the shipped template is clean under
    // every other arm and caught only by `length-less-item-header`.
    const shipped = `Item (FFFEE000) declares a length reaching past its enclosing sequence's declared end, so it reads the enclosing Data Set's bytes; ${String(FABRICATED_LENGTH - ITEM_HEADER_BYTES)} bytes remained inside the sequence. The file's two length fields disagree.`;

    // Non-vacuity on the payload: `UNDEFINED_VR_PAYLOAD` really carries the four
    // length bytes contiguously, and they really are two letters of a surname
    // followed by the zero high bytes any reachable length must have.
    expect(UNDEFINED_VR_PAYLOAD).toContain(LEN_BYTES.toString("latin1"));
    expect(LEN_BYTES.subarray(0, 2).toString("latin1")).toBe("SO");
    expect(NAME).toContain("SO");
    expect(FABRICATED_LENGTH).toBe(20307);

    // The gap, pinned: no OTHER arm sees the shipped template.
    const onShipped = leaksIn(shipped, UNDEFINED_VR_PAYLOAD);
    expect(onShipped.filter((l) => l.kind !== "length-less-item-header")).toStrictEqual([]);
    // ...and the new arm does, on the right four bytes.
    const shifted = onShipped.filter((l) => l.kind === "length-less-item-header");
    expect(shifted.map((l) => l.rendered)).toContain(String(FABRICATED_LENGTH - ITEM_HEADER_BYTES));
    expect(shifted.map((l) => l.bytes)).toContain("SO\0\0");

    // And the arm is a hunt, not a wildcard: a DIRECT render of the same length
    // is the `length` arm's, not this one's, so the two do not shadow each other.
    const direct = leaksIn(
      `... ${String(FABRICATED_LENGTH)} bytes remained ...`,
      UNDEFINED_VR_PAYLOAD,
    );
    expect(direct.map((l) => l.kind)).toContain("length");
    expect(direct.map((l) => l.kind)).not.toContain("length-less-item-header");

    // The closure itself: the registry template has no numeric slot at all now,
    // so there is nothing for any arm to find and no call site can put one back.
    expect(WARNING_MESSAGES.DICOM_ITEM_CROSSES_SEQUENCE_END).not.toContain("{n}");
    expect(WARNING_MESSAGES.DICOM_ITEM_CROSSES_SEQUENCE_END).not.toContain("{n2}");
    // The live channel is `ds.warnings` on a SURVIVING parse, which no fixture
    // in this file reaches; `test/integration/explicit-sq-item-bound.test.ts`
    // carries that measurement with its own name-bearing payload and mutation
    // control. This row is about the detector.
  });

  it("elementLengthExceedsBufferNoLongerRendersTheItemLengthLessTheCursor", () => {
    // 🩺 THE NINTH INSTANCE, AND THE FIRST WHOSE SHIFT IS NOT A CONSTANT.
    // Through `0.0.14` `ELEMENT_LENGTH_EXCEEDS_BUFFER` rendered
    // `buffer.length - cursor.position`, disclosed in `./fatals.ts` as bounded
    // by bytes actually present. That bounds the number's MAGNITUDE. Both
    // element loops also run over a defined-length Item's SLICE, where
    // `buffer.length` IS that Item's 32-bit declared Value (Item) Length, and
    // the message publishes `byteOffset` beside the count - so `n + byteOffset +
    // 8` returns the declared length. The shift is `cursor.position`, so it
    // moves with wherever inside the Item the over-declaring element sits.
    //
    // The reversal below is run over EVERY digit run of the message rather than
    // over a slot this test names, so it cannot pass by looking at the wrong
    // number.
    const recovered = (message: string, byteOffset: number): readonly number[] =>
      digitRuns(message)
        .map((run) => Number(run) + byteOffset + ITEM_HEADER_BYTES)
        .filter((value) => value === FABRICATED_ITEM_LENGTH);

    // The planted length is read back OFF THE WIRE, not asserted against a
    // literal: this is the field the recovery has to return.
    const { raw: firstShape, payload } = overDeclareInsideAnItem(0);
    expect(firstShape.readUInt32LE(ITEM_LENGTH_FIELD_AT)).toBe(FABRICATED_ITEM_LENGTH);
    expect(NAME).toContain(ITEM_LEN_BYTES.subarray(0, 2).toString("latin1"));

    // THE CLOSURE. Three positions inside the Item, three different shifts.
    for (const lead of [0, 24, 40]) {
      const err = fatalFrom(overDeclareInsideAnItem(lead).raw);
      expect(err.code).toBe(FATAL_CODES.INVALID_FILE_META);
      expect(err.byteOffset, `lead ${String(lead)}`).toBe(lead);
      expect(recovered(err.message, err.byteOffset), `lead ${String(lead)}`).toStrictEqual([]);
      expect(leaksIn(err.message, overDeclareInsideAnItem(lead).payload)).toStrictEqual([]);
    }

    // NON-VACUITY, AND IT IS THE ROW THAT MAKES THE THREE ABOVE MEAN ANYTHING:
    // `0.0.14`'s own template, rebuilt per shape, IS reversed by the same
    // arithmetic, and the two low bytes of what comes back are two letters of
    // the planted surname.
    const shippedTemplate = (lead: number): string =>
      `An element declares a Value Length reaching past the end of the bytes being read; ${String(
        FABRICATED_ITEM_LENGTH - lead - ITEM_HEADER_BYTES,
      )} bytes remain. Its tag and its declared length are withheld; the byte offset locates it.`;
    for (const lead of [0, 24, 40]) {
      expect(recovered(shippedTemplate(lead), lead), `lead ${String(lead)}`).toStrictEqual([
        FABRICATED_ITEM_LENGTH,
      ]);
    }
    const back = Buffer.alloc(4);
    back.writeUInt32LE(FABRICATED_ITEM_LENGTH, 0);
    expect(back.equals(ITEM_LEN_BYTES)).toBe(true);
    expect(NAME).toContain(back.subarray(0, 2).toString("latin1"));

    // 🛑 AND WHAT THE DETECTOR CAN AND CANNOT SEE HERE, MEASURED RATHER THAN
    // ASSUMED. `#92`'s `length-less-item-header` arm subtracts exactly
    // {@link ITEM_HEADER_BYTES}, so it catches the shape where the
    // over-declaring element is the Item's first and NOTHING else. The other two
    // shapes are the same leak, on the same fixture, invisible to every arm.
    // **A zero from this detector is a gap, not a clearance.**
    expect(leaksIn(shippedTemplate(0), payload).map((l) => l.kind)).toContain(
      "length-less-item-header",
    );
    expect(leaksIn(shippedTemplate(24), payload)).toStrictEqual([]);
    expect(leaksIn(shippedTemplate(40), payload)).toStrictEqual([]);
    // ...and the payload is not the reason: a DIRECT render of the same length
    // is caught, so the two clean results above are the arms' limit.
    expect(
      leaksIn(`declared length=${String(FABRICATED_ITEM_LENGTH)}`, payload).map((l) => l.kind),
    ).toContain("length");

    // The closure itself, at the level that survives a refactor of the prose:
    // the template has no numeric slot and the factory has no parameter for one.
    expect(FATAL_MESSAGES.ELEMENT_LENGTH_EXCEEDS_BUFFER.message).not.toContain("{n}");
    expect(elementLengthExceedsBuffer.length).toBe(2);
  });

  it("the deidentify() channel is swept, with the floor off, and the only tags left are PS3.6 rows", () => {
    // 🩺 THE SWEEP THE `parseDicom` ONE ABOVE STATES IT CANNOT DO, AND THE
    // REASON THIS SLICE EXISTS. Every code these two producers raise travels on
    // `report.warnings` and on nothing else, so no `onWarning` sweep reaches
    // them; the desync family dies at a Tier-3 fatal before `deidentify()` ever
    // runs. Pointed here with the seven-digit floor removed, the detector
    // returned exactly the two `{n}` slots this slice closed and nothing else.
    //
    // 🛑 A `tag` HIT WHOSE FOUR BYTES ARE A LITERAL PS3.6 ROW IS OUT OF SCOPE,
    // BY THE DECISION `#90` RATIFIED, and it is excluded here rather than
    // quietly passing. `renderTag` is a MEMBERSHIP test: a tag PS3.6 carries a
    // literal row for is rendered on every file, deliberately, because refusing
    // it would cost every message its tag while withholding nothing an attacker
    // could not have read off the closed registry. These fixtures plant
    // `(0008,0008)` as the fabricated tag precisely so the fabricated header
    // parses, so that membership hit is designed behaviour. Anything else - a
    // tag PS3.6 has no row for, a length, a VR, a raw byte - is a finding.
    const offenders: string[] = [];
    let messagesSeen = 0;
    for (const [code, { report, payload }] of Object.entries(unauditableFixtures())) {
      for (const w of report.warnings) {
        messagesSeen += 1;
        const leaks = leaksIn(w.message, payload).filter(
          (l) => !(l.kind === "tag" && renderTag(l.rendered) !== "<withheld>"),
        );
        if (leaks.length > 0) {
          offenders.push(
            `${code}/${w.code}: ${leaks.map((l) => `${l.kind} ${l.rendered} == ${JSON.stringify(l.bytes)}`).join(", ")}`,
          );
        }
      }
    }
    // Non-vacuity: the sweep really did exercise messages on this channel.
    expect(messagesSeen).toBeGreaterThan(0);
    expect(offenders).toStrictEqual([]);

    // And the exclusion is a scope, not a hole: a fabricated tag PS3.6 has no
    // row for is still a finding, which is what stops the filter above from
    // being a way to pass.
    expect(renderTag("4E495320")).toBe("<withheld>");
    expect(renderTag("00080008")).toBe("00080008");
    const fabricatedTagMessage = "Element (4E495320) was emptied.";
    expect(
      leaksIn(fabricatedTagMessage, NAME)
        .filter((l) => !(l.kind === "tag" && renderTag(l.rendered) !== "<withheld>"))
        .map((l) => l.bytes),
    ).toContain("IN S");
  });

  it("embeddedAttributesHiddenNoLongerCarriesValueBytes", () => {
    // 🩺 CLOSED by `DICOM-DIAGNOSTIC-PHI-RESIDUALS`. Through `0.0.13`
    // `report.embeddedAttributes[].hidden` listed EVERY tag in the run the
    // scanner found inside a kept carrier's Value Field, and a run needs only
    // ONE actionable attribute to be reported - so a fabricated header sitting
    // beside a real one was listed too, and its four tag bytes are bytes from
    // inside that value. Measured: `"SMIT"` in wire order rendered as
    // `4D535449`, four letters of a surname, beside the genuine `00100020`.
    //
    // `hidden` now carries only the tags the run's own resolved Annex E action
    // fired on. That is a MEMBERSHIP bound, not a shape one: a surviving entry
    // names a member of PS3.15 Table E.1-1 as this run resolved it, which is a
    // published table. It is NOT the `report.removedPrivateTags` product call -
    // there, narrowing would empty the field on every well-formed file, because
    // a private tag is in no such table. Here the field's whole job is "which
    // actionable attributes were hidden in this value", and the neighbours it
    // used to list were attributes this run would have KEPT.
    const embedded = (tag: Buffer, vr: string, value: Buffer): Buffer => {
      const length = Buffer.alloc(2);
      length.writeUInt16LE(value.length, 0);
      return Buffer.concat([tag, Buffer.from(vr, "latin1"), length, value]);
    };
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          // `(0008,0008)` ImageType is KEPT by the action table, which is what
          // puts it on the scanner's path at all.
          tag: "00080008",
          vr: "CS" as VR,
          value: Buffer.concat([
            Buffer.from("BRAIN ", "latin1"),
            // A fabricated header whose tag bytes are four letters of a surname.
            embedded(Buffer.from("SMIT", "latin1"), "SH", Buffer.from("ASHTON", "latin1")),
            // A genuine, actionable `(0010,0020)`, which is what makes the run
            // reportable and used to drag the fabricated tag along with it.
            embedded(
              Buffer.from([0x10, 0x00, 0x20, 0x00]),
              "LO",
              Buffer.from("MRN-11111 ", "latin1"),
            ),
          ]),
        },
        { tag: "00080060", vr: "CS" as VR, value: val("CT") },
      ],
    });

    const { report } = deidentify(parseDicom(raw));
    const hidden = report.embeddedAttributes.flatMap((found) => found.hidden);
    // The genuine, actionable attribute is still named: the field keeps the
    // audit value it exists for.
    expect(hidden).toContain("00100020");
    // The row that matters: four bytes of the value, wearing a tag's clothes,
    // are no longer on the report.
    expect(hidden).not.toContain("4D535449");
    // ...and the whole run is still counted, on the warning rather than here.
    expect(
      report.warnings.filter((w) => w.code === "DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED"),
    ).not.toStrictEqual([]);
    // Non-vacuity: those four bytes really are the planted surname's, recovered
    // the same way the parser composed them.
    const smit = Buffer.from("SMIT", "latin1");
    const asTag =
      smit.readUInt16LE(0).toString(16).padStart(4, "0").toUpperCase() +
      smit.readUInt16LE(2).toString(16).padStart(4, "0").toUpperCase();
    expect(asTag).toBe("4D535449");
  });

  it("the detector can actually fail: 0a8c6e3's own template is caught", () => {
    // The non-vacuity control, and it is reconstructed rather than borrowed. A
    // control that happens not to contain what is hunted returns clean and
    // proves nothing.
    const bytes = Buffer.from(NAME, "latin1");
    const tag =
      bytes.readUInt16LE(4).toString(16).padStart(4, "0").toUpperCase() +
      bytes.readUInt16LE(6).toString(16).padStart(4, "0").toUpperCase();
    const length = String(bytes.readUInt32LE(8));
    const asBase = `Element ${tag} declared length=${length} exceeds remaining buffer (0 bytes).`;

    const caught = leaksIn(asBase, NAME);
    expect(caught.some((l) => l.kind === "tag")).toBe(true);
    expect(caught.some((l) => l.kind === "length")).toBe(true);
    // And the bytes it recovers really are the payload's, not a coincidence.
    expect(caught.map((l) => l.bytes)).toContain("RAIN");

    // The third arm needs its own control, and it had none: no 2-byte window of
    // this payload is one of the 34, so the arm cannot fire on any fixture here
    // and a green run said nothing about it. Both registry phrasings of the slot
    // are exercised, because a draft that knew only `VR=` would have read the
    // Implicit VR LE message clean.
    for (const phrasing of [`An element with VR=IN declares`, `whose VR resolved to IN declares`]) {
      const vrLeaks = leaksIn(phrasing, NAME).filter((l) => l.kind === "vr");
      expect(
        vrLeaks.map((l) => l.bytes),
        phrasing,
      ).toContain("IN");
    }
    // And the ratified direction: a window that IS one of the 34 is out of scope,
    // so the arm stays quiet on it rather than redding on designed behaviour.
    expect(
      leaksIn("An element with VR=OB declares", "ROBE").filter((l) => l.kind === "vr"),
    ).toStrictEqual([]);
  });

  it("every fixture reaches a fatal, and between them at least six distinct messages", () => {
    // A table that collapsed onto one code would pass the sweep above while
    // saying nothing about the other twenty-two entries. Six is what this set
    // actually reaches; it is asserted as a floor rather than an equality so
    // that adding a fixture is never a reason to edit a number.
    const seen = new Set<string>();
    for (const [, raw] of FIXTURES) {
      seen.add(
        fatalFrom(raw)
          .message.replace(/ \(offset=\d+\)$/u, "")
          .replace(/\d+/gu, "N"),
      );
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Half 2: the strict-mode snippet frame.
// ---------------------------------------------------------------------------

/**
 * One file, two frames, engineered to collide.
 *
 * A defined-length Sequence Item is padded so the element that raises
 * `DICOM_ODD_LENGTH_VALUE_PADDED` sits at an item-relative offset that also
 * lands **inside the root `(0010,0010)` Patient Name's value** when counted from
 * byte 0 of the file. On `0a8c6e3` the strict escalation cut its 16 bytes from
 * the file at that item-relative number, so it returned the surname. It now cuts
 * them from the item.
 *
 * The padding length is searched for rather than hard-coded, because the File
 * Meta group's size is `buildDicom`'s business and a magic number here would go
 * stale the first time that helper changed.
 */
function oneFileTwoFrames(): { readonly raw: Buffer; readonly padding: number } {
  for (let padding = 8; padding < 400; padding += 2) {
    const raw = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        { tag: "00100010", vr: "PN" as VR, value: val(NAME.repeat(24)) },
        {
          tag: "0040A730",
          items: [
            {
              elements: [
                { tag: "00080008", vr: "CS" as VR, value: Buffer.alloc(padding, 0x41) },
                {
                  tag: "00100020",
                  vr: "LO" as VR,
                  value: Buffer.from("MRN-1111", "latin1"),
                  declaredLengthDelta: -1,
                },
              ],
            },
          ],
        },
      ],
    });
    let offset: number;
    try {
      parseDicom(raw, { strict: true });
      continue;
    } catch (err) {
      if (!(err instanceof DicomParseError)) throw err;
      offset = err.byteOffset;
    }
    // The collision we need: that same number, read as a file offset, must land
    // inside the root Patient Name's value.
    const nameStart = raw.indexOf(Buffer.from(NAME.repeat(2), "latin1"));
    if (offset > nameStart + 4 && offset + 16 < nameStart + NAME.length * 20) {
      return { raw, padding };
    }
  }
  throw new Error("oneFileTwoFrames: no padding produced the frame collision");
}

function snippetAscii(snippet: string): string {
  return snippet
    .split(" ")
    .filter((part) => part.length === 2)
    .map((part) => String.fromCharCode(Number.parseInt(part, 16)))
    .join("");
}

describe("PHI: the {strict:true} snippet is cut in the frame its offset names", () => {
  const { raw } = oneFileTwoFrames();

  it("the fixture really does collide, so this suite is not vacuous", () => {
    // The positive control for the whole block. If the item-relative offset did
    // not land inside the root name, `0a8c6e3` would have returned harmless
    // bytes and every assertion below would pass on base too.
    const err = errorFrom(raw, true);
    const atSameOffsetInTheFile = raw
      .subarray(err.byteOffset, err.byteOffset + 16)
      .toString("latin1");
    expect(atSameOffsetInTheFile).toContain("SMITHSON");
  });

  it("returns the element it names, not whatever sits at that offset in the file", () => {
    const err = errorFrom(raw, true);
    const ascii = snippetAscii(err.snippet);

    // What the code is about: the `(0010,0020)` header and its value, read in
    // the item's own frame. `LO` plus the odd-length `MRN-1111` is the element
    // the warning was raised for.
    expect(ascii).toContain("LO");
    expect(ascii).toContain("MRN-1111");

    // What it must NOT be: the root Patient Name that shares the number.
    expect(ascii).not.toContain("SMITHSON");
    expect(ascii).not.toContain("BRAIN");
    expect(err.snippet).not.toBe(
      Buffer.from(raw.subarray(err.byteOffset, err.byteOffset + 16))
        .toJSON()
        .data.map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
    );
  });

  it("is unchanged at the root, where the two frames were always the same", () => {
    // The other direction, so the fix is not mistaken for one that moved every
    // snippet. A root-level odd-length element still reports file-absolute bytes.
    const rootOnly = buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [{ tag: "00100020", vr: "LO" as VR, value: Buffer.from("MRN-1111X", "latin1") }],
    });
    const err = errorFrom(rootOnly, true);
    const expected = [...rootOnly.subarray(err.byteOffset, err.byteOffset + 16)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    expect(err.snippet).toBe(expected);
  });

  it("still carries raw source bytes, and the docs must keep saying so", () => {
    // The claim this slice does NOT make. `snippet` is 16 unredacted bytes
    // (D-10); making the frame honest made it MORE certainly the element's own
    // content, not less. A future reader who takes "the frame is fixed" for "the
    // snippet is safe" is the failure this test exists to name.
    const err = errorFrom(raw, true);
    expect(err.snippet).toMatch(/^(?:[0-9a-f]{2} )*[0-9a-f]{2}$/u);
    expect(snippetAscii(err.snippet)).toContain("MRN-1111");
  });
});

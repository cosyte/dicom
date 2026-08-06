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
import type { VR } from "../../src/dictionary/types.js";
import { KNOWN_VRS } from "../../src/parser/endian.js";
import { DicomParseError, FATAL_CODES } from "../../src/parser/errors.js";
import { FATAL_MESSAGES } from "../../src/parser/fatals.js";
import { parseDicom } from "../../src/parser/index.js";
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
  readonly kind: "tag" | "length" | "vr";
  readonly rendered: string;
  readonly bytes: string;
}

/**
 * Every way four or two bytes of `payload` could surface in a message, and the
 * bytes each rendering came from.
 *
 * - **tag**: `joinTag(readUInt16LE(i), readUInt16LE(i + 2))`, which is how this
 *   parser composes an 8-hex-char tag out of a header's four bytes.
 * - **length**: `readUInt32LE(i)`, printed as a decimal. Reversible with one
 *   typed read, which is why "it is only a number" was never an argument.
 * - **vr**: two bytes as ASCII, in a `VR=` slot.
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
    // A short decimal could collide with a legitimate byte count, so only
    // renderings too long to be one are searched for. Every 4-byte window of a
    // printable-ASCII payload exceeds 1,000,000,000 in this direction, so
    // nothing in this fixture set is skipped by the floor - it is there so the
    // detector stays honest if a future payload includes control bytes.
    const asLength = String(bytes.readUInt32LE(i));
    if (asLength.length >= 7) out.push({ kind: "length", rendered: asLength, bytes: window });
  }
  for (let i = 0; i + 2 <= bytes.length; i += 1) {
    out.push({
      kind: "vr",
      rendered: bytes.subarray(i, i + 2).toString("latin1"),
      bytes: bytes.subarray(i, i + 2).toString("latin1"),
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
 */
function leaksIn(message: string, payload: string): readonly Leak[] {
  return renderings(payload).filter((leak) =>
    leak.kind === "vr"
      ? !KNOWN_VRS.has(leak.rendered) &&
        new RegExp(
          `VR=${leak.rendered}(?![A-Za-z])|resolved to ${leak.rendered}(?![A-Za-z])`,
          "u",
        ).test(message)
      : message.includes(leak.rendered),
  );
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

  it("tierTwoEscalationStillNamesAFabricatedTag", () => {
    // 🛑 PRE-EXISTING, MEASURED OPEN, AND THIS REGISTRY DOES NOT CLOSE IT.
    //
    // The exact same desynchronized read that used to put `"RAIN"` into a
    // Tier-3 message also lands on an ODD group, so `resolveImplicitVR` calls
    // the fabricated header a private element and `DICOM_PRIVATE_TAG_NO_CREATOR`
    // names its tag: `4E495320` is `"IN S"`. That is a **Tier-2** message, built
    // from `./warnings.ts`'s registry through `renderTag` - which shape-checks a
    // tag and therefore cannot refuse a fabricated one. It reproduces
    // byte-identically on `0a8c6e3`.
    //
    // It is the `#78` fabricated-header residual, one layer up, and it is NOT
    // this slice's to close: narrowing `DICOM_PRIVATE_TAG_NO_CREATOR` would
    // withhold the tag from every private element in every well-formed file,
    // which is the same product call the item names for
    // `report.removedPrivateTags` and explicitly does not take. Pinned as an
    // asserted row so no artifact can read this file as an all-clear over the
    // strict channel.
    const err = errorFrom(desynchronized(TS_IMPLICIT_LE, -12), true);
    expect(err.code).toBe("DICOM_PRIVATE_TAG_NO_CREATOR");
    expect(isTierThree(err)).toBe(false);
    const leaks = leaksIn(err.message, NAME);
    expect(leaks.map((l) => l.bytes)).toContain("IN S");
  });

  it("embeddedAttributesHiddenStillCarriesValueBytes", () => {
    // 🛑 PRE-EXISTING, MEASURED OPEN, AND UNTOUCHED BY THIS SLICE. The second of
    // the two residuals filed under this item, and it is here because a graded
    // pass caught the disclosure claiming it was pinned when it was not - which
    // is `#78`'s own defect, a residual written up as guarded with no guard.
    //
    // `report.embeddedAttributes[].hidden` lists every tag in the run the
    // scanner found inside a kept carrier's Value Field. A run only has to
    // contain ONE actionable attribute to be reported, so a fabricated header
    // sitting beside a real one is listed too - and a fabricated header's four
    // tag bytes are bytes from inside that value. Measured here: `"SMIT"` in
    // wire order renders as `4D535449`, four letters of a surname, beside the
    // genuine `00100020` that made the run actionable.
    //
    // Not narrowed, for the same reason as the Tier-2 row above and as
    // `report.removedPrivateTags`: on every well-formed file these are the real
    // tags of real swallowed attributes, and withholding them would destroy the
    // field's audit value to close a shape that only a crafted file produces.
    // That is a product call.
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
            // reportable and drags the fabricated tag along with it.
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
    expect(hidden).toContain("00100020");
    // The row that matters: four bytes of the value, wearing a tag's clothes.
    expect(hidden).toContain("4D535449");
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

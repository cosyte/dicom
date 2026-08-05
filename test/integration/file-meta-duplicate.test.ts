/**
 * `DICOM-FILE-META-DROPS-DUPLICATE` - a second copy of a MODELED `(0002,xxxx)`
 * element left the parsed object with no warning and no residue, and
 * `(0002,xxxx)` is the group that decides how every following byte is read.
 *
 * This is `#70`'s shape one group over, and it is lossy by a different route.
 * `parseFileMeta` collects the group into an **array**, so nothing is
 * overwritten and `DICOM_DUPLICATE_TAG_IN_DATA_SET` never fires here - `#70`'s
 * JSDoc said exactly that, and reading it as an all-clear was the defect. The
 * eight tags in `MODELED_FM_TAGS` are answered by a **first-match** search and
 * are **excluded** from `extraElements`, the verbatim residue that gives the
 * group its byte-exact round trip. A second copy of one is therefore in neither.
 *
 * So the two codes resolve a repeat the opposite way round, deliberately,
 * because the two readings do: the **FIRST** copy wins in the File Meta group,
 * the **LAST** read wins in a Data Set. Neither reading moves in this slice.
 * `DICOM_DUPLICATE_FILE_META_ELEMENT` is a disclosure at the site that drops,
 * and nothing else - no value is guessed for the copy that lost, no residue is
 * invented for it (that would make the conservative serializer re-emit a group
 * it should not write), and no bound is chosen.
 *
 * **Why this half is the more dangerous one.** `(0002,0010)` Transfer Syntax UID
 * selects the encoding of every byte after the group. Two copies carrying
 * different UIDs are two different readings of the same file, and until this
 * slice the library picked one and said nothing. `the stakes` below pins that:
 * the same dataset bytes, with only the ORDER of the two UIDs swapped, parse to
 * two different trees, and on base both files were silent.
 *
 * PS3.5 2026c section 7.1 "Data Elements", read from the SHA-pinned
 * `vendor/nema/part05/` and occurring exactly once in that document: "The Data
 * Elements in a Data Set shall be ordered by increasing Data Element Tag Number
 * and shall occur at most once in a Data Set."
 *
 * **What is NOT claimed, because it was looked for and not found.** PS3.10 -
 * which governs the File Meta Information group - is **not vendored in this
 * repo**, so no PS3.10 sentence is cited here and this file makes no conformance
 * verdict about a repeated `(0002,xxxx)`. The code's trigger is narrower than
 * one and does not need it: it fires exactly when a value the file carried does
 * not reach the parsed object. A `{ strict: true }` caller has asked to be
 * thrown at rather than handed a lenient reading, and silently dropping one of
 * two candidate Transfer Syntax UIDs is a lenient reading.
 *
 * Every fixture is synthetic and built in memory by `build-dicom`; the
 * deliberately fake names and identifiers exist only so a drop is observable.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { DicomParseError, WARNING_CODES, parseDicom } from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import { WARNING_MESSAGES, duplicateFileMetaElement } from "../../src/parser/warnings.js";
import { buildDicom, type BuildDicomElement } from "../helpers/build-dicom.js";

const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const IMPLICIT_LE = "1.2.840.10008.1.2";

const TS_UID = "00020010" as Tag;
const SOP_CLASS_UID = "00020002" as Tag;
const SOURCE_AE = "00020016" as Tag;
const GROUP_LENGTH = "00020000" as Tag;
/** `(0002,0102)` Private Information - a real `(0002,xxxx)` this parser does NOT model. */
const PRIVATE_INFORMATION = "00020102" as Tag;
const PATIENT_NAME = "00100010" as Tag;

/**
 * Synthetic and deliberately fake. `#55` shipped a PHI claim whose payload
 * carried no name at all, which made its pinning test vacuous BY FIXTURE; every
 * PHI assertion below runs against this string and asserts it is really present
 * before asserting it is absent from a diagnostic.
 */
const PATIENT = "MR BRAIN SMITHSON";
/** An `AE` is 16 characters at most, so the surname is the part that fits. */
const AE_TITLE = "SMITHSON";

/** Latin-1 bytes padded to the even length PS3.5 section 7.1 requires. */
function val(text: string): Buffer {
  const raw = Buffer.from(text, "latin1");
  return raw.length % 2 === 0 ? raw : Buffer.concat([raw, Buffer.from([0x00])]);
}

/** Explicit VR short form, which every fixture here uses: tag(4) + VR(2) + length(2). */
const FM_HEADER_BYTES = 8;
/** 128-byte preamble + `DICM`, then `(0002,0000)` UL 4, then the group body. */
const FM_BODY_START = 128 + 4 + FM_HEADER_BYTES + 4;

const fmDuplicates = (warnings: readonly { readonly code: string }[]): readonly unknown[] =>
  warnings.filter((w) => w.code === WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT);

/**
 * Count the disclosures through `onWarning`, which reaches a caller even when
 * the reading the File Meta group selected then fails outright.
 */
function disclosures(buf: Buffer): number {
  let seen = 0;
  try {
    parseDicom(buf, {
      onWarning: (w) => {
        if (w.code === WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT) seen++;
      },
    });
  } catch {
    // The dataset may be unreadable under the UID this group selected; the
    // disclosure is emitted before that is discovered.
  }
  return seen;
}

/** Build a Part 10 file whose whole File Meta body is `fm`, in that exact order. */
function withFileMeta(
  fm: readonly BuildDicomElement[],
  datasetSyntax: string = EXPLICIT_LE,
): Buffer {
  return buildDicom({
    transferSyntax: datasetSyntax,
    skipTransferSyntaxUID: true,
    fileMetaExtraElements: fm,
    elements: [{ tag: PATIENT_NAME, vr: "PN" as VR, value: val(PATIENT) }],
  });
}

const tsElement = (uid: string): BuildDicomElement => ({
  tag: TS_UID,
  vr: "UI",
  value: val(uid),
});

describe("a File Meta group that carries one modeled (0002,xxxx) tag twice", () => {
  it("reports the copy it drops, keeps the FIRST, and leaves no residue for the loser", () => {
    const buf = withFileMeta([tsElement(EXPLICIT_LE), tsElement(IMPLICIT_LE)]);
    const ds = parseDicom(buf);

    expect(fmDuplicates(ds.warnings)).toHaveLength(1);

    // The reading is asserted, not assumed: FIRST wins in this group.
    expect(ds.fileMeta?.transferSyntaxUID).toBe(EXPLICIT_LE);

    // And nothing anywhere in the object carries the copy that lost. This is the
    // half `#70` did not cover: an array cannot overwrite, but the projection
    // never asks it for a second copy and `extraElements` excludes the tag.
    const residue = (ds.fileMeta?.extraElements ?? []).map((e) => e.tag);
    expect(residue).not.toContain(TS_UID);
    expect((ds.fileMeta?.extraElements ?? []).map((e) => e.value.toString("latin1"))).not.toContain(
      val(IMPLICIT_LE).toString("latin1"),
    );
  });

  it("the stakes: only the ORDER of two Transfer Syntax UIDs decides how the whole dataset reads", () => {
    // Identical dataset bytes (Explicit VR LE) under both files. The only
    // difference is which copy of (0002,0010) comes first.
    const explicitFirst = withFileMeta([tsElement(EXPLICIT_LE), tsElement(IMPLICIT_LE)]);
    const implicitFirst = withFileMeta([tsElement(IMPLICIT_LE), tsElement(EXPLICIT_LE)]);

    const read = (buf: Buffer): string | null => {
      try {
        return parseDicom(buf).get(PATIENT_NAME)?.rawBytes.toString("latin1") ?? null;
      } catch {
        return null;
      }
    };

    expect(read(explicitFirst)).toBe(val(PATIENT).toString("latin1"));
    // Under the other UID the same bytes are not that attribute at all. Measured
    // rather than asserted loosely: this file raises INVALID_FILE_META out of
    // `parseImplicitLE`, because a length field read in the wrong encoding
    // declares 1,199,696 bytes. Losing the whole object is the far end of the
    // same defect.
    expect(read(implicitFirst)).toBeNull();

    // Both files disclose the drop now, and the disclosure precedes the reading
    // that fails, so it is collected through `onWarning` rather than off an
    // object one of these two parses never returns. Both were silent before this
    // slice, and that silence is the defect: a reader could not tell them apart.
    expect(disclosures(explicitFirst)).toBe(1);
    expect(disclosures(implicitFirst)).toBe(1);
  });

  it("a repeated NON-modeled (0002,xxxx) is silent, because every copy of one is kept", () => {
    const first = val("PRIVATE-A");
    const second = val("PRIVATE-B");
    const ds = parseDicom(
      withFileMeta([
        tsElement(EXPLICIT_LE),
        { tag: PRIVATE_INFORMATION, vr: "OB", value: first },
        { tag: PRIVATE_INFORMATION, vr: "OB", value: second },
      ]),
    );

    expect(fmDuplicates(ds.warnings)).toHaveLength(0);
    // Non-vacuity for the row above: both copies really are in the residue, so
    // "silent" is "nothing was dropped" and not "the check missed it".
    const kept = (ds.fileMeta?.extraElements ?? [])
      .filter((e) => e.tag === PRIVATE_INFORMATION)
      .map((e) => e.value.toString("latin1"));
    expect(kept).toEqual([first.toString("latin1"), second.toString("latin1")]);
  });

  it("a file with no repeat raises nothing (the control that makes every row above non-vacuous)", () => {
    const ds = parseDicom(
      withFileMeta([
        tsElement(EXPLICIT_LE),
        { tag: SOP_CLASS_UID, vr: "UI", value: val("1.2.840.10008.5.1.4.1.1.7") },
        { tag: PRIVATE_INFORMATION, vr: "OB", value: val("PRIVATE-A") },
      ]),
    );
    expect(fmDuplicates(ds.warnings)).toHaveLength(0);
    expect(ds.fileMeta?.transferSyntaxUID).toBe(EXPLICIT_LE);
  });

  it("a repeated (0002,0002) is reported and the first is projected", () => {
    const first = "1.2.840.10008.5.1.4.1.1.7";
    const second = "1.2.840.10008.5.1.4.1.1.2";
    const ds = parseDicom(
      withFileMeta([
        tsElement(EXPLICIT_LE),
        { tag: SOP_CLASS_UID, vr: "UI", value: val(first) },
        { tag: SOP_CLASS_UID, vr: "UI", value: val(second) },
      ]),
    );
    expect(fmDuplicates(ds.warnings)).toHaveLength(1);
    expect(ds.fileMeta?.mediaStorageSOPClassUID).toBe(first);
  });

  it("a third copy raises a second warning - one per copy dropped, not one per tag", () => {
    const ds = parseDicom(
      withFileMeta([tsElement(EXPLICIT_LE), tsElement(IMPLICIT_LE), tsElement(EXPLICIT_LE)]),
    );
    expect(fmDuplicates(ds.warnings)).toHaveLength(2);
    expect(ds.fileMeta?.transferSyntaxUID).toBe(EXPLICIT_LE);
  });

  it("a SECOND (0002,0000) group length is reported too, and it never reaches the array twice", () => {
    // The first (0002,0000) is consumed as the declared length and is never
    // pushed, so a plain scan of the collected array cannot see this repeat.
    // The seeded seen-set is what covers it.
    const groupLengthValue = Buffer.alloc(4);
    groupLengthValue.writeUInt32LE(0, 0);
    const ds = parseDicom(
      withFileMeta([
        tsElement(EXPLICIT_LE),
        { tag: GROUP_LENGTH, vr: "UL", value: groupLengthValue },
      ]),
    );
    expect(fmDuplicates(ds.warnings)).toHaveLength(1);
    expect(ds.fileMeta?.transferSyntaxUID).toBe(EXPLICIT_LE);
  });

  it("the byte offset is file-absolute, locates the DROPPED copy, and is above the survivor's", () => {
    const survivor = tsElement(EXPLICIT_LE);
    const dropped = tsElement(IMPLICIT_LE);
    const ds = parseDicom(withFileMeta([survivor, dropped]));

    const survivorOffset = FM_BODY_START;
    const droppedOffset = survivorOffset + FM_HEADER_BYTES + survivor.value.length;

    const warning = ds.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT,
    );
    expect(warning?.position.byteOffset).toBe(droppedOffset);
    expect(warning?.position.fileMeta).toBe(true);

    // Not the survivor's offset, and this is the structural difference from
    // `#70`: there the offset IS the survivor's, because the survivor is the
    // element that replaced. Here the survivor came first.
    expect(droppedOffset).toBeGreaterThan(survivorOffset);

    // File-absolute is not a coincidence here. `parseFileMeta` is called once
    // per parse with the whole buffer, and the File Meta group is never nested,
    // so none of `Element.byteOffset`'s frame ambiguity can reach it. Read the
    // header back out of the file at that index to prove the frame rather than
    // to restate the arithmetic.
    const buf = withFileMeta([survivor, dropped]);
    expect(buf.readUInt16LE(droppedOffset)).toBe(0x0002);
    expect(buf.readUInt16LE(droppedOffset + 2)).toBe(0x0010);
    expect(buf.subarray(droppedOffset + 4, droppedOffset + 6).toString("ascii")).toBe("UI");
  });

  it("{ strict: true } escalates it, carrying the code", () => {
    const buf = withFileMeta([tsElement(EXPLICIT_LE), tsElement(IMPLICIT_LE)]);
    expect(() => parseDicom(buf, { strict: true })).toThrow(DicomParseError);
    try {
      parseDicom(buf, { strict: true });
      expect.unreachable("strict mode must escalate the disclosure");
    } catch (err) {
      expect(err).toBeInstanceOf(DicomParseError);
      expect((err as DicomParseError).code).toBe(WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT);
    }
  });
});

/**
 * 🛑 **THE TITLE OF THIS BLOCK IS NARROWER THAN IT WAS, AND THAT IS THE POINT.**
 * It used to read "the diagnostic is not itself a PHI surface" while every row
 * in it read `warning.message` and nothing else. The message is clean; the
 * **diagnostic** is not, because `{ strict: true }` replaces the whole warning
 * with a `DicomParseError` whose `snippet` is 16 raw bytes of the file, read at
 * the warning's own offset - and **for this code**, whose group is never nested
 * so no frame ambiguity can reach it, that offset is the header of the element
 * that was dropped. So the snippet renders the first bytes of the value the
 * message deliberately withholds. A claim that big, tested that narrowly, is the
 * shape `#55` shipped and `#64` repeated.
 *
 * So the claim is cut to what the rows prove and the rest is pinned as the
 * measured residual it is, in `the strict-mode escalation` block below. **That
 * block is about THIS code and generalises to none other**, and two graded
 * passes are why: a warning's `byteOffset` is file-absolute here but
 * slice-relative inside a defined-length Sequence or Item (and into the inflated
 * stream under Deflated Explicit VR LE), while the snippet is cut from whichever
 * buffer the parse is holding, so which element a snippet's bytes belong to is
 * **not contracted** anywhere in this package. The snippet is a documented,
 * package-wide design (D-10) rather than a defect in this code, and redacting it
 * is a decision about every Tier-3 fatal in the library, not a rider on a File
 * Meta disclosure.
 */
describe("the warning MESSAGE is not itself a PHI surface", () => {
  it("a name-bearing dropped value reaches no part of the message", () => {
    const dropped = val(AE_TITLE);
    const ds = parseDicom(
      withFileMeta([
        tsElement(EXPLICIT_LE),
        { tag: SOURCE_AE, vr: "AE", value: val("CT-SCANNER-1") },
        { tag: SOURCE_AE, vr: "AE", value: dropped },
      ]),
    );

    // NON-VACUITY, first: the fixture really does carry the name, in the very
    // element that is dropped, and in the dataset. `#55`'s pinning test asserted
    // an absence over a payload with no name in it and proved nothing.
    expect(dropped.toString("latin1")).toContain("SMITHSON");
    expect(ds.get(PATIENT_NAME)?.rawBytes.toString("latin1")).toContain("SMITHSON");

    const warning = ds.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT,
    );
    expect(warning).toBeDefined();

    // Not "does not contain the whole name" - `#55` rendered FOUR letters of a
    // surname. Every 4-character window of the payload is refused.
    for (const window of windows(PATIENT, 4)) {
      expect(warning?.message).not.toContain(window);
    }
    // And the message is the frozen registry string, with nothing substituted.
    expect(warning?.message).toBe(WARNING_MESSAGES.DICOM_DUPLICATE_FILE_META_ELEMENT);
  });

  it("the bound is the factory SIGNATURE, so no call site can put a tag back", () => {
    // The mutation control for the row above. Adding a tag or value parameter
    // makes this red before any message assertion has to notice.
    expect(duplicateFileMetaElement).toHaveLength(1);
    expect(duplicateFileMetaElement({ byteOffset: 152, fileMeta: true }).message).toBe(
      WARNING_MESSAGES.DICOM_DUPLICATE_FILE_META_ELEMENT,
    );
  });

  it("a fabricated File Meta header cannot compose a MODELED tag out of readable text", () => {
    // This is why the ordinary route to `DICOM_DUPLICATE_TAG_IN_DATA_SET` - a
    // length lie that makes value bytes read as a header - is a NARROWER route
    // here, and it is a fact about the eight tags rather than an argument.
    // The group loop only continues while the next two bytes read 0x0002, and
    // every modeled element number is below 0x0100, so each modeled tag needs at
    // least two NUL bytes on the wire (three, for the group length). No
    // printable name supplies one. The VR, the length and the value that follow
    // such a header still come out of somebody's value, which is why the message
    // names nothing regardless.
    for (const tag of [
      "00020000",
      "00020001",
      "00020002",
      "00020003",
      "00020010",
      "00020012",
      "00020013",
      "00020016",
    ]) {
      const wire = wireBytes(tag);
      expect(wire.filter((b) => b === 0x00).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("the strict-mode escalation of THIS diagnostic DOES carry source bytes", () => {
  /**
   * The fixture the block above uses, with the surname where a snippet at the
   * dropped element's own offset can reach it: header (8 bytes) then the first 8
   * bytes of the value.
   *
   * 🛑 **NOTHING HERE GENERALISES TO ANOTHER CODE, AND A GRADED PASS REFUTED THE
   * DRAFT THAT SAID IT DID.** The reach below holds because the File Meta group
   * is never nested, so this warning's `byteOffset` is unambiguously
   * file-absolute and unambiguously the dropped copy's header. Inside a
   * defined-length Sequence Item that offset is relative to the item's own slice
   * while `buildSnippet` still reads the whole file, so for a code that can fire
   * in there the snippet may be an unrelated element's value entirely. Measure
   * it per code; do not reason from this row.
   */
  const named = (): Buffer =>
    withFileMeta([
      tsElement(EXPLICIT_LE),
      { tag: SOURCE_AE, vr: "AE", value: val("CT-SCANNER-1") },
      { tag: SOURCE_AE, vr: "AE", value: val(`AE-${AE_TITLE}`) },
    ]);

  it("🩺 `err.snippet` renders the dropped value's bytes, and this pins it rather than denying it", () => {
    // NON-VACUITY FIRST, and by fixture: the lenient parse of these same bytes
    // produces a warning whose message holds no window of the name. Without this
    // the row below could pass against a build that never carried the name at
    // all - which is exactly how `#55`'s pin proved nothing.
    const lenient = parseDicom(named());
    const warning = lenient.warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT,
    );
    expect(warning).toBeDefined();
    for (const window of windows(AE_TITLE, 4)) {
      expect(warning?.message).not.toContain(window);
    }

    let thrown: DicomParseError | undefined;
    try {
      parseDicom(named(), { strict: true });
      expect.unreachable("strict mode must escalate the disclosure");
    } catch (err) {
      thrown = err as DicomParseError;
    }

    expect(thrown?.code).toBe(WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT);
    // The thrown MESSAGE is still the registry string, so the escalation adds no
    // interpolation of its own.
    expect(thrown?.message).toContain(WARNING_MESSAGES.DICOM_DUPLICATE_FILE_META_ELEMENT);
    for (const window of windows(AE_TITLE, 4)) {
      expect(thrown?.message).not.toContain(window);
    }

    // And the snippet beside it is the source, unredacted. Asserted as an exact
    // byte string rather than "contains something": a pin that asserts the wrong
    // bytes is worse than no pin, and only decoding it proves what a consumer
    // logging `err.snippet` actually writes down.
    const decoded = Buffer.from((thrown?.snippet ?? "").replaceAll(" ", ""), "hex");
    expect(thrown?.snippet).toBe("02 00 16 00 41 45 0c 00 41 45 2d 53 4d 49 54 48");
    expect(decoded.subarray(0, 8)).toStrictEqual(
      Buffer.from([0x02, 0x00, 0x16, 0x00, 0x41, 0x45, 0x0c, 0x00]),
    );
    expect(decoded.subarray(8).toString("latin1")).toBe("AE-SMITH");
    // Five letters of the surname, from a value the message withholds. `#55`
    // shipped on four.
    expect(decoded.toString("latin1")).toContain("SMITH");
  });

  it("the lenient path carries no snippet at all, which is what makes the two paths differ", () => {
    // The control. `DicomParseWarning` has no `snippet` field by design (D-07),
    // so "review the message" is a complete review of the lenient path and an
    // incomplete one of the strict path. That asymmetry is the finding.
    const warning = parseDicom(named()).warnings.find(
      (w) => w.code === WARNING_CODES.DICOM_DUPLICATE_FILE_META_ELEMENT,
    );
    expect(warning).toBeDefined();
    expect(Object.keys(warning ?? {})).not.toContain("snippet");
  });
});

/** Every `size`-character window of `text`. */
function windows(text: string, size: number): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i + size <= text.length; i++) out.push(text.slice(i, i + size));
  return out;
}

/** The four on-wire bytes of a tag, little-endian group then little-endian element. */
function wireBytes(tag: string): readonly number[] {
  const group = Number.parseInt(tag.slice(0, 4), 16);
  const element = Number.parseInt(tag.slice(4), 16);
  return [group & 0xff, group >> 8, element & 0xff, element >> 8];
}

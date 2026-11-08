/**
 * Every trailing-pad trim a file reaches in `deidentify()` and `Dataset.directory` runs in linear
 * time.
 *
 * Seven patterns trimmed file-controlled text with a regular expression that re-scans a run of pad
 * bytes from every position in it when the run ends in any other byte, which is quadratic in a
 * length the file chooses:
 *
 *   - `src/deident/actions.ts`: `/\0+$/` in `remapUidBytes` and `uidValueMultiplicity`, so every
 *     UID `deidentify()` remaps;
 *   - `src/deident/deidentify.ts`: `/[\0 ]+$/` in the Private Creator read, the Block Identifying
 *     Information Status read, and the Burned In Annotation read;
 *   - `src/dataset/directory.ts`: `/[\0 ]+$/u` and `/^ +| +$/gu` in the DICOMDIR's `CS` reads.
 *
 * The nightly fuzz harness found the first: a SOP Instance UID of 14,562 NULLs and one space took
 * `deidentify()` 595 ms, and doubling the run quadrupled the time. The rest are the same pattern,
 * found by reading for it. `src/dataset/vr/decode.ts` and `charset.ts` replaced the same shapes
 * for `Element.value` earlier; these are the ones that remained.
 *
 * Each timed case below runs one 50,000-character run through the public API and must finish in a
 * second; the property cases hold each linear helper to the pattern it replaced, as the oracle.
 * Every object is synthetic: pad bytes, a letter, and invented creator and file names.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { stripTrailingPad, trimSpaces } from "../../src/dataset/directory.js";
import {
  remapUidBytes,
  stripTrailingNulls,
  uidValueMultiplicity,
} from "../../src/deident/actions.js";
import { deidentify, parseDicom } from "../../src/index.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";
import { buildDicomdir } from "../helpers/build-dicomdir.js";

const EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Long enough that the quadratic patterns took seconds; the linear scans take a millisecond. */
const RUN = 50_000;

/** A pad run that ends in a byte other than pad: the shape the patterns backtracked on. */
const NULL_RUN = `${"\0".repeat(RUN)}X`;

/** Even-length bytes of `text`, padded with a SPACE. */
function ascii(text: string): Buffer {
  const b = Buffer.from(text, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from(" ")]);
}

/** Run `work` and return how long it took, in milliseconds. */
function timed(work: () => unknown): number {
  const started = performance.now();
  work();
  return performance.now() - started;
}

function file(elements: readonly (BuildDicomElement | BuildDicomSqElement)[]): Buffer {
  return buildDicom({ transferSyntax: EXPLICIT_LE, elements: [...elements] });
}

describe("deidentify() trims a long pad run in linear time (polynomial backtracking)", () => {
  it("remaps a UID that is a long NULL run and one byte, the fuzz case", () => {
    const ds = parseDicom(file([{ tag: "00080018", vr: "UI", value: ascii(NULL_RUN) }]));
    let remapped: Buffer | undefined;
    const ms = timed(() => {
      remapped = deidentify(ds).dataset.get("00080018")?.rawBytes;
    });
    expect(ms).toBeLessThan(1_000);
    // One fresh UID in place of the run: digits and dots, less its NULL pad.
    expect(/^[0-9.]+$/u.test(stripTrailingNulls(remapped?.toString("latin1") ?? ""))).toBe(true);
  });

  it("reads a Private Creator that is a long pad run and one byte", () => {
    const ds = parseDicom(
      file([
        { tag: "00090010", vr: "LO", value: ascii(NULL_RUN) },
        { tag: "00091001", vr: "LO", value: ascii("SYNTH VALUE") },
      ]),
    );
    expect(timed(() => deidentify(ds))).toBeLessThan(1_000);
  });

  it("reads a Block Identifying Information Status that is a long pad run and one byte", () => {
    const creator = "SYNTH DECLARED CREATOR";
    const ds = parseDicom(
      file([
        {
          tag: "00080300",
          items: [
            {
              elements: [
                { tag: "00080301", vr: "US", value: Buffer.from([0x09, 0x00]) },
                { tag: "00080302", vr: "LO", value: ascii(creator) },
                { tag: "00080303", vr: "CS", value: ascii(NULL_RUN) },
              ],
            },
          ],
        },
        { tag: "00090010", vr: "LO", value: ascii(creator) },
        { tag: "00091001", vr: "LO", value: ascii("SYNTH VALUE") },
      ]),
    );
    expect(timed(() => deidentify(ds, { retain: ["RetainSafePrivate"] }))).toBeLessThan(1_000);
  });

  it("reads a Burned In Annotation that is a long pad run and one byte", () => {
    const ds = parseDicom(
      file([
        { tag: "00280301", vr: "CS", value: ascii(NULL_RUN) },
        { tag: "7FE00010", vr: "OW", value: Buffer.alloc(16, 0x11) },
      ]),
    );
    expect(timed(() => deidentify(ds))).toBeLessThan(1_000);
  });
});

describe("Dataset.directory reads a long CS run in linear time (polynomial backtracking)", () => {
  it("builds the tree when a record's type ends a NULL run and its file ID holds a SPACE run", () => {
    const { bytes } = buildDicomdir({
      transferSyntax: EXPLICIT_LE,
      records: [{ type: NULL_RUN, fileId: ["SYNTH", `A${" ".repeat(RUN)}B`] }],
    });
    const ds = parseDicom(bytes);
    let records = -1;
    const ms = timed(() => {
      records = ds.directory?.records.length ?? -1;
    });
    expect(ms).toBeLessThan(1_000);
    expect(records).toBe(1);
  });
});

describe("each linear trim returns exactly what the pattern it replaced returned", () => {
  /** Short strings over the pad bytes, a delimiter and a letter: every edge the patterns had. */
  const padded = fc.string({ unit: fc.constantFrom("\0", " ", "\\", "A"), maxLength: 24 });
  const RUNS = 10_000;

  it("stripTrailingNulls matches /\\0+$/", () => {
    fc.assert(
      fc.property(padded, (s) => stripTrailingNulls(s) === s.replace(/\0+$/, "")),
      { numRuns: RUNS },
    );
  });

  it("remapUidBytes and uidValueMultiplicity match the /\\0+$/ versions", () => {
    const remap = (uid: string): string => `9.${uid}`;
    fc.assert(
      fc.property(padded, (s) => {
        const bytes = Buffer.from(s, "latin1");
        const raw = s.replace(/\0+$/, "");
        const remapped = Buffer.from(
          raw
            .split("\\")
            .map((uid) => remap(uid.trim()))
            .join("\\"),
          "latin1",
        );
        const expected =
          remapped.length % 2 === 0 ? remapped : Buffer.concat([remapped, Buffer.from([0x00])]);
        return (
          remapUidBytes(bytes, remap).equals(expected) &&
          uidValueMultiplicity(bytes) === (raw.length === 0 ? 0 : raw.split("\\").length)
        );
      }),
      { numRuns: RUNS },
    );
  });

  it("stripTrailingPad matches /[\\0 ]+$/u", () => {
    fc.assert(
      fc.property(padded, (s) => stripTrailingPad(s) === s.replace(/[\0 ]+$/u, "")),
      { numRuns: RUNS },
    );
  });

  it("trimSpaces matches /^ +| +$/gu", () => {
    fc.assert(
      fc.property(padded, (s) => trimSpaces(s) === s.replace(/^ +| +$/gu, "")),
      { numRuns: RUNS },
    );
  });
});

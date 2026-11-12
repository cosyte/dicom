/**
 * A correctness differential against dcmjs: every document of a synthetic corpus is read by
 * `parseDicom` and by dcmjs, and the two readings must agree on every tag, VR and value at every
 * depth, File Meta included, except where `known-differences.ts` lists the difference with its
 * reason and the clause of the standard that settles it.
 *
 * Every other correctness test here holds the reader to this repository's own expectations; this
 * one holds it to an implementation written by other people from the same standard. A difference
 * the list does not name fails the test, and so does a listed difference that no longer occurs in
 * every document it names, so the list is the whole of where the two readers part.
 *
 * Each document is read by dcmjs as it ships. Where dcmjs refuses one, that refusal is itself a
 * difference to explain, and the document is read again with dcmjs's `ignoreErrors` so that what it
 * does read is still compared.
 *
 * dcmjs is a development dependency of this test only: nothing under `src/` imports it.
 */

import { Buffer } from "node:buffer";

import { data, log } from "dcmjs";
import { describe, expect, it } from "vitest";

import { parseDicom } from "../../src/index.js";
import {
  compareNodes,
  cosyteMetaNodes,
  cosyteNodes,
  dcmjsNodes,
  type Difference,
  type Node,
} from "./_compare.js";
import { differentialCorpus, type DifferentialDocument } from "./_corpus.js";
import { KNOWN_DIFFERENCES, type KnownDifference } from "./known-differences.js";

log.setLevel("silent");
log.getLogger("validation.dcmjs").setLevel("silent");

/** Every difference between the two readings of one document. */
function differencesOf(doc: DifferentialDocument): Difference[] {
  const out: Difference[] = [];
  const document = doc.name;
  let ours;
  try {
    ours = parseDicom(doc.bytes);
  } catch (error) {
    return [{ document, path: "", kind: "refused-by-cosyte", detail: String(error) }];
  }
  const buffer = doc.bytes.buffer.slice(
    doc.bytes.byteOffset,
    doc.bytes.byteOffset + doc.bytes.length,
  ) as ArrayBuffer;
  let theirs;
  try {
    theirs = data.DicomMessage.readFile(buffer);
  } catch (error) {
    out.push({ document, path: "", kind: "refused-by-dcmjs", detail: String(error) });
    try {
      theirs = data.DicomMessage.readFile(buffer, { ignoreErrors: true });
    } catch (lenientError) {
      out.push({ document, path: "", kind: "unreadable-by-dcmjs", detail: String(lenientError) });
      return out;
    }
  }
  const meta = ours.fileMeta === undefined ? [] : cosyteMetaNodes(ours.fileMeta);
  // dcmjs keeps the Group Length it read; we model the group without it.
  const theirMeta = dcmjsNodes(theirs.meta).filter((node) => node.tag !== "00020000");
  out.push(...compareNodes(document, "meta:", meta, theirMeta));
  out.push(...compareNodes(document, "", cosyteNodes(ours), dcmjsNodes(theirs.dict)));
  return out;
}

/** `true` when `path` is one of the entry's paths, `[*]` standing for any Item index. */
function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  const source = pattern
    .split("[*]")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\[\\d+\\]");
  return new RegExp(`^${source}$`, "u").test(path);
}

function explains(entry: KnownDifference, difference: Difference): boolean {
  return (
    entry.kind === difference.kind &&
    entry.documents.includes(difference.document) &&
    entry.paths.some((pattern) => pathMatches(pattern, difference.path))
  );
}

const CORPUS = differentialCorpus();
const OBSERVED = new Map(CORPUS.map((doc) => [doc.name, differencesOf(doc)]));

describe("differential against dcmjs", () => {
  it("reads a corpus with each encoding, structure and character set the reader supports", () => {
    const names = CORPUS.map((doc) => doc.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of [
      "seed/rich-implicit-le",
      "seed/rich-explicit-le",
      "seed/rich-explicit-be",
      "seed/rich-deflated-le",
      "seed/encapsulated-jpeg-2000",
      "seed/encapsulated-rle",
      "seed/nested-explicit-le",
      "seed/nested-implicit-le",
      "seed/private-ge-implicit-le",
      "seed/private-siemens-explicit-le",
      "seed/private-sequence-implicit-le",
      "seed/charset-utf8",
      "seed/charset-latin1",
      "seed/charset-gb18030",
      ...KNOWN_DIFFERENCES.flatMap((entry) => entry.documents),
    ]) {
      expect(names, name).toContain(name);
    }
  });

  it.each(CORPUS.map((doc) => [doc.name]))("%s: every difference is a known one", (name) => {
    const unexplained = (OBSERVED.get(name) ?? []).filter(
      (difference) => !KNOWN_DIFFERENCES.some((entry) => explains(entry, difference)),
    );
    expect(unexplained).toEqual([]);
  });

  it("every known difference still occurs in each document it lists", () => {
    const stale: string[] = [];
    for (const entry of KNOWN_DIFFERENCES) {
      for (const document of entry.documents) {
        const seen = (OBSERVED.get(document) ?? []).some((d) => explains(entry, d));
        if (!seen) stale.push(`${entry.id} in ${document}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("every known difference names its reason and the clause that settles it", () => {
    const ids = KNOWN_DIFFERENCES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of KNOWN_DIFFERENCES) {
      expect(entry.reason.length, entry.id).toBeGreaterThan(0);
      expect(entry.citation, entry.id).toMatch(/^PS3\.(?:3|5|6|10) (?:section|Table) [A-Z0-9]/u);
      expect(entry.documents.length, entry.id).toBeGreaterThan(0);
      expect(entry.paths.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("agrees with dcmjs on most of what it reads, so the comparison is not vacuous", () => {
    // A reduction that dropped every value would agree on everything; count what was compared.
    let compared = 0;
    const count = (nodes: readonly Node[]): void => {
      for (const node of nodes) {
        compared++;
        if (node.value.kind === "items") node.value.items.forEach(count);
      }
    };
    for (const doc of CORPUS) {
      try {
        count(cosyteNodes(parseDicom(doc.bytes)));
      } catch {
        // A document we refuse is reported by the test above.
      }
    }
    const differing = [...OBSERVED.values()].reduce((n, list) => n + list.length, 0);
    expect(compared).toBeGreaterThan(500);
    expect(differing).toBeLessThan(compared / 5);
  });

  it("reports a value that differs by one byte, a VR, and an element only one side has", () => {
    const ours: Node[] = [
      { tag: "00100010", vr: "PN", value: { kind: "text", text: "Doe^Jane" } },
      { tag: "00280010", vr: "US", value: { kind: "bytes", hex: "0002" } },
      { tag: "00280011", vr: "US", value: { kind: "bytes", hex: "0002" } },
    ];
    const theirs: Node[] = [
      { tag: "00100010", vr: "PN", value: { kind: "text", text: "Doe^Jane" } },
      { tag: "00280010", vr: "US", value: { kind: "bytes", hex: "0102" } },
      { tag: "00280011", vr: "SS", value: { kind: "bytes", hex: "0002" } },
      {
        tag: "00280030",
        vr: "DS",
        value: { kind: "bytes", hex: Buffer.from("1").toString("hex") },
      },
    ];
    expect(compareNodes("t", "", ours, theirs).map((d) => [d.path, d.kind])).toEqual([
      ["00280010", "value"],
      ["00280011", "vr"],
      ["00280030", "only-in-dcmjs"],
    ]);
  });
});

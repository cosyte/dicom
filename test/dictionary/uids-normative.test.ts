/**
 * The shipped UID registry, graded against the NORMATIVE PS3.6 Annex A bytes.
 *
 * WHY THIS FILE EXISTS. `@cosyte/dicom` shipped 174 wrong SOP Class UID names in `0.0.1`
 * through `0.0.3`: a generator appended " Storage" to a `sops.json` name that was already the
 * full PS3.6 UID Name. Nothing was mis-routed, because dispatch is by UID VALUE and never by
 * name, and those registry copies stay wrong permanently. What made it possible to ship was
 * that nothing compared the emitted names against the normative table, and for the UID half
 * there WAS no comparison to make: the Transfer Syntax and Well-Known UIDs were a hand-typed
 * table in the generator, and PS3.6 Annex A was vendored but never read for UIDs.
 *
 * WHAT THIS FILE IS, AND WHAT IT IS NOT. It re-parses `vendor/nema/part06/<sha>/part06.xml`
 * here, from scratch, and compares the result to the `UIDS` the package actually exports. It
 * deliberately does NOT call the generator or import its internals: a test that re-runs the
 * generator proves the generator agrees with itself, and would keep passing through the change
 * that broke it. The byte-identical regen gate already covers "the committed file is what the
 * generator emits". This covers the other question, which is whether either one is RIGHT.
 *
 * THE TWO DELIBERATE DEVIATIONS ARE PART OF THE SUBJECT, NOT EXEMPTIONS FROM IT. This
 * dictionary departs from Annex A in exactly two ways, both on purpose, and a naive overlay
 * would have undone both:
 *
 *   1. Retirement is a structured `retired` boolean, not a trailing " (Retired)" in the name.
 *   2. Four Transfer Syntax names keep the short form every DICOM toolkit prints, cut from the
 *      normative name at its ": Default Transfer Syntax for ..." clause.
 *
 * Each is asserted here as a POSITIVE property with its own control, so "the deviation is
 * still applied" and "the deviation has not spread" are both measured. The short-form cases
 * prove the normative name really does carry the clause, which is what stops the deviation
 * quietly becoming a no-op if PS3.6 rewords it.
 *
 * SCOPE, NAMED FOR WHAT IT CHECKS RATHER THAN AS A UNIVERSAL. This grades NAMES, TYPES and
 * RETIREMENT for the UIDs in Annex A Tables A-1 and A-2. It says nothing about Tables A-3 and
 * A-4 (Context Group and Template UID values), which this package deliberately does not carry,
 * and nothing about whether any UID is DISPATCHED correctly anywhere in the parser.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { UIDS } from "../../src/dictionary/generated/uids.js";
import * as Dictionary from "../../src/dictionary/index.js";

const PART06_ROOT = join(process.cwd(), "vendor", "nema", "part06");

/**
 * Read the pinned DocBook and PROVE it is the pinned bytes, exactly as the generator does.
 *
 * Without this the whole file grades against whatever happens to be on disk, which is the one
 * failure mode a vendored normative source has. This test only ever READS under `vendor/`;
 * nothing here writes a pin.
 */
function readPinnedPart06(): string {
  const pinned = readFileSync(join(PART06_ROOT, "SHA.txt"), "utf8").trim().split(/\s+/)[0] ?? "";
  expect(pinned).toMatch(/^[0-9a-f]{64}$/);
  const buf = readFileSync(join(PART06_ROOT, pinned, "part06.xml"));
  expect(createHash("sha256").update(buf).digest("hex")).toBe(pinned);
  return buf.toString("utf8");
}

const xml = readPinnedPart06();

/** Slice one `<table>` by `xml:id`, counting nesting rather than taking the first close. */
function extractTable(id: string): string {
  const marker = `xml:id="${id}"`;
  const at = xml.indexOf(marker);
  expect(at, `part06.xml carries ${marker}`).toBeGreaterThanOrEqual(0);
  const open = xml.lastIndexOf("<table", at);
  const scan = /<table\b[^>]*?>|<\/table>/g;
  scan.lastIndex = open;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(xml)) !== null) {
    if (m[0] === "</table>") {
      depth -= 1;
      if (depth === 0) return xml.slice(open, m.index + m[0].length);
    } else {
      depth += 1;
    }
  }
  throw new Error(`unterminated <table> for ${id}`);
}

/**
 * Cell markup to text. PS3.6 sprinkles ZERO WIDTH SPACE (U+200B) through the UID and keyword
 * columns as a line-break hint; leaving one in yields a UID that looks right and matches
 * nothing, so this strips them the same way the generator does.
 */
function cellText(markup: string): string {
  let s = markup;
  for (;;) {
    const next = s.replace(/<[^<>]*>/g, "");
    if (next === s) break;
    s = next;
  }
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\u200B/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

interface AnnexARow {
  readonly uid: string;
  /** The UID Name cell exactly as PS3.6 publishes it, retirement marker and all. */
  readonly rawName: string;
  /** The UID Type cell, or the table's own type for Table A-2. */
  readonly rawType: string;
}

function rowsOf(id: string, columns: number, tableType?: string): AnnexARow[] {
  const table = extractTable(id);
  const out: AnnexARow[] = [];
  for (const row of table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (row.match(/<td\b[^>]*?(?:\/>|>[\s\S]*?<\/td>)/g) ?? []).map(cellText);
    if (cells.length === 0) continue; // the header row carries `<th>`, not `<td>`
    expect(cells.length, `${id} row shape`).toBe(columns);
    out.push({
      uid: cells[0] ?? "",
      rawName: cells[1] ?? "",
      rawType: tableType ?? cells[3] ?? "",
    });
  }
  return out;
}

/** Table A-1 "UID Values" (5 columns) and Table A-2 "Well-known Frames of Reference" (4). */
const annexA: readonly AnnexARow[] = [
  ...rowsOf("table_A-1", 5),
  ...rowsOf("table_A-2", 4, "Well-known Frame of Reference"),
];

const RETIRED_SUFFIX = " (Retired)";
/** A row whose whole UID Name is the retirement marker: PS3.6 withdrew the name with the class. */
const UNNAMED_RETIRED = "(Retired)";

/**
 * The four Transfer Syntaxes whose normative name is cut at its first ": ".
 *
 * Listed here as UIDS ONLY, never as expected names. A test that hard-codes the four short
 * forms would agree with a generator that hard-codes them, and the whole point of the deviation
 * being derived is that neither side types the string.
 */
const SHORT_FORM_UIDS = [
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.4.50",
  "1.2.840.10008.1.2.4.51",
  "1.2.840.10008.1.2.4.70",
] as const;

/** PS3.6's UID Type vocabulary to the published union. Mirrors the generator's closed map. */
const TYPE_MAP: Readonly<Record<string, string>> = {
  "SOP Class": "SOPClass",
  "Meta SOP Class": "MetaSOPClass",
  "Transfer Syntax": "TransferSyntax",
  "Well-known SOP Instance": "WellKnownSOPInstance",
  "Coding Scheme": "CodingScheme",
  "DICOM UIDs as a Coding Scheme": "CodingScheme",
  "Application Context Name": "ApplicationContext",
  "Service Class": "ServiceClass",
  "Application Hosting Model": "Other",
  "Mapping Resource": "Other",
  "LDAP OID": "Other",
  "Synchronization Frame of Reference": "Other",
  "Well-known Frame of Reference": "WellKnownFrameOfReference",
};

/** The normative row set, minus the rows PS3.6 leaves unnamed. */
const named = annexA.filter((r) => r.rawName !== UNNAMED_RETIRED);
const unnamed = annexA.filter((r) => r.rawName === UNNAMED_RETIRED);

/** What PS3.6 says this UID's name and retirement are, with deviation 1 applied. */
function normative(row: AnnexARow): { name: string; retired: boolean } {
  const retired = row.rawName.endsWith(RETIRED_SUFFIX);
  const stripped = retired ? row.rawName.slice(0, -RETIRED_SUFFIX.length).trimEnd() : row.rawName;
  if (!SHORT_FORM_UIDS.includes(row.uid as (typeof SHORT_FORM_UIDS)[number])) {
    return { name: stripped, retired };
  }
  const cut = stripped.indexOf(": ");
  return { name: cut < 0 ? stripped : stripped.slice(0, cut), retired };
}

describe("the vendored Annex A parses into a registry worth grading against", () => {
  it("reads both normative tables and no rows from anywhere else", () => {
    // A floor, not an equality: a new edition legitimately appends UIDs. The point is that a
    // parse which silently matched a fraction of the table cannot pass as a clean sweep.
    expect(annexA.length).toBeGreaterThanOrEqual(450);
    expect(new Set(annexA.map((r) => r.uid)).size).toBe(annexA.length);
    for (const r of annexA) expect(r.uid).toMatch(/^[0-9]+(?:\.[0-9]+)*$/);
  });

  it("maps every UID Type PS3.6 actually publishes, with nothing falling through", () => {
    // The generator's map is CLOSED: an unrecognized type throws rather than defaulting to
    // "Other". This is the case that would go red the day PS3.6 adds a category, which is the
    // moment a human should decide where it belongs rather than a default deciding silently.
    const unmapped = [...new Set(annexA.map((r) => r.rawType))].filter((t) => !(t in TYPE_MAP));
    expect(unmapped).toEqual([]);
  });
});

describe("every shipped UID matches the normative Annex A text", () => {
  it("carries the normative name for every UID Annex A names", () => {
    const wrong: string[] = [];
    for (const row of named) {
      const entry = UIDS[row.uid];
      if (!entry) continue; // coverage is a separate case below
      const { name } = normative(row);
      if (entry.name !== name) wrong.push(`${row.uid}: shipped ${entry.name}, PS3.6 ${name}`);
    }
    expect(wrong).toEqual([]);
  });

  it("carries the normative UID type for every UID Annex A types", () => {
    const wrong: string[] = [];
    for (const row of named) {
      const entry = UIDS[row.uid];
      if (!entry) continue;
      const expectedType = TYPE_MAP[row.rawType];
      if (entry.type !== expectedType) {
        expect(expectedType, `${row.uid} has a mapped type`).toBeDefined();
        wrong.push(`${row.uid}: shipped ${entry.type}, PS3.6 ${String(expectedType)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("covers every UID Annex A names, so the registry is the table and not a sample", () => {
    // Before this slice the registry carried 268 of these and the absence was invisible: a
    // Transfer Syntax the current standard defines resolved to `undefined` with no signal.
    const missing = named.filter((row) => !UIDS[row.uid]).map((r) => r.uid);
    expect(missing).toEqual([]);
  });

  it("adds nothing Annex A does not carry, and prints the mirror-only set if it ever does", () => {
    // THE AUTHORITY RULE'S STANDING ASSUMPTION, MEASURED RATHER THAN ASSERTED. An entry the
    // Innolitics mirror carries and PS3.6 does not is KEPT, never dropped, because PS3.6
    // RETIRES rather than deletes and an absence is far more likely a parse gap here than a
    // withdrawal there. That set is empty today. If this case ever reds, the finding is the
    // LIST it prints, and the answer is to work out which source is missing an entry, NOT to
    // delete the entry to get green.
    const known = new Set(annexA.map((r) => r.uid));
    expect(Object.keys(UIDS).filter((uid) => !known.has(uid))).toEqual([]);
  });
});

describe("deviation 1: retirement is a boolean, not a name suffix", () => {
  it("agrees with PS3.6 on which UIDs are retired", () => {
    const wrong: string[] = [];
    for (const row of named) {
      const entry = UIDS[row.uid];
      if (!entry) continue;
      const { retired } = normative(row);
      if (entry.retired !== retired) wrong.push(`${row.uid}: shipped ${String(entry.retired)}`);
    }
    expect(wrong).toEqual([]);
    // Non-vacuous in both directions, so a registry that marked everything (or nothing) retired
    // could not pass the case above by accident.
    const shippedRetired = Object.values(UIDS).filter((u) => u.retired).length;
    expect(shippedRetired).toBeGreaterThan(0);
    expect(shippedRetired).toBeLessThan(Object.keys(UIDS).length);
  });

  it("spells retirement in no shipped name, which is the deviation", () => {
    // The control that gives the case above meaning: PS3.6 really does put the marker in the
    // name, so a registry that had simply copied the column would fail this.
    expect(annexA.filter((r) => r.rawName.endsWith(RETIRED_SUFFIX)).length).toBeGreaterThan(0);
    expect(Object.values(UIDS).filter((u) => /\(Retired\)/.test(u.name))).toEqual([]);
  });

  it("omits the rows PS3.6 retired AND left unnamed, rather than shipping an empty name", () => {
    // Two rows in Table A-1 carry the retirement marker as their WHOLE UID Name. An entry whose
    // `name` is "" is a SUCCESSFUL lookup, so a consumer's `uid(x)?.name ?? "<unknown>"` would
    // print nothing instead of "<unknown>". They are excluded for that reason, and named here
    // so the exclusion cannot quietly grow.
    expect(unnamed.map((r) => r.uid).sort()).toEqual([
      "1.2.840.10008.5.1.4.1.1.12.77",
      "1.2.840.10008.5.1.4.1.1.40",
    ]);
    for (const row of unnamed) {
      expect(UIDS[row.uid]).toBeUndefined();
      expect(Dictionary.uid(row.uid)).toBeUndefined();
    }
  });
});

describe("deviation 2: four Transfer Syntax names keep their toolkit short form", () => {
  it("ships the short form for those four, cut from the normative name", () => {
    for (const uid of SHORT_FORM_UIDS) {
      const row = named.find((r) => r.uid === uid);
      expect(row, `Annex A carries ${uid}`).toBeDefined();
      const full = row?.rawName ?? "";
      // THE CONTROL THAT MAKES THIS A MEASUREMENT: the normative name really does carry the
      // clause. If a future edition drops it, this reds here rather than the deviation silently
      // becoming a no-op that nothing would notice.
      expect(full, `${uid} normative name carries a ": " clause`).toContain(": ");
      const short = full.slice(0, full.indexOf(": "));
      expect(short).not.toBe(full);
      expect(UIDS[uid]?.name).toBe(short);
      expect(UIDS[uid]?.type).toBe("TransferSyntax");
    }
  });

  it("names every Annex A entry that carries the clause, so the list is not an arbitrary four", () => {
    // MEASURED, AND IT REPLACED A WEAKER CONTROL THIS FILE FIRST TRIED. The first draft assumed
    // other Annex A names also contain a ": " and would demonstrate the cut by staying whole.
    // None do. The whole of Tables A-1 and A-2 contains exactly four names with a ": " clause,
    // and they are exactly the four cut, so the deviation is the complete set rather than a
    // subset somebody chose. If a future edition gives a fifth UID such a name this reds, which
    // is the point at which a human decides whether it belongs in the list.
    const carryClause = named
      .filter((r) => {
        const retired = r.rawName.endsWith(RETIRED_SUFFIX);
        const stripped = retired ? r.rawName.slice(0, -RETIRED_SUFFIX.length).trimEnd() : r.rawName;
        return stripped.includes(": ");
      })
      .map((r) => r.uid)
      .sort();
    expect(carryClause).toEqual([...SHORT_FORM_UIDS].sort());
  });

  it("leaves every other shipped name whole, cut at nothing", () => {
    // The cut is applied per UID, not as a blanket transform. Names carrying other punctuation
    // that a sloppier rule might have split on (a colon with no space, a dash clause) come
    // through intact.
    const withDash = named.filter((r) => normative(r).name.includes(" - "));
    expect(withDash.length).toBeGreaterThan(0);
    for (const row of withDash) expect(UIDS[row.uid]?.name).toBe(normative(row).name);
  });
});

describe("the UIDs a current DICOM file can actually carry now resolve", () => {
  /**
   * The consumer-visible half of the coverage gap, named one by one rather than as a count.
   *
   * Every one of these is a Transfer Syntax the CURRENT edition defines and none of them was in
   * the registry before this slice: a Part 10 file encoded in any of them had its Transfer
   * Syntax UID resolve to `undefined`. Nothing mis-read a value (dispatch is by UID value, and
   * this package refuses a transfer syntax it cannot decode by value too), but a caller asking
   * the dictionary what it was holding got no answer.
   */
  const NEWLY_RESOLVING: ReadonlyArray<readonly [string, string]> = [
    ["1.2.840.10008.1.2.4.201", "High-Throughput JPEG 2000 Image Compression (Lossless Only)"],
    [
      "1.2.840.10008.1.2.4.202",
      "High-Throughput JPEG 2000 with RPCL Options Image Compression (Lossless Only)",
    ],
    ["1.2.840.10008.1.2.4.203", "High-Throughput JPEG 2000 Image Compression"],
    ["1.2.840.10008.1.2.4.204", "JPIP HTJ2K Referenced"],
    ["1.2.840.10008.1.2.4.205", "JPIP HTJ2K Referenced Deflate"],
    ["1.2.840.10008.1.2.8.1", "Deflated Image Frame Compression"],
  ];

  it.each(NEWLY_RESOLVING)("resolves %s through the public dictionary surface", (uid, name) => {
    const entry = Dictionary.uid(uid);
    expect(entry).toBeDefined();
    expect(entry?.name).toBe(name);
    expect(entry?.type).toBe("TransferSyntax");
    expect(entry?.retired).toBe(false);
    // And the expected name is not a string this file invented: it is what the pinned DocBook
    // publishes for that row.
    const row = named.find((r) => r.uid === uid);
    expect(normative(row ?? { uid, rawName: "", rawType: "" }).name).toBe(name);
  });

  it("resolves the Well-known Frames of Reference that live in Table A-2, not A-1", () => {
    // These seven were in the registry already and are the reason Table A-2 is read at all: a
    // sweep against Table A-1 alone reported them as entries the normative source had dropped.
    // They had not been dropped. That is the mirror-only rule earning its keep.
    for (const uid of ["1.2.840.10008.1.4.1.1", "1.2.840.10008.1.4.2.1", "1.2.840.10008.1.4.2.2"]) {
      expect(Dictionary.uid(uid)?.type).toBe("WellKnownFrameOfReference");
    }
    expect(rowsOf("table_A-2", 4, "Well-known Frame of Reference").length).toBeGreaterThan(7);
  });
});

#!/usr/bin/env tsx
/**
 * Phase 1 Plan 02 generator: Innolitics dicom-standard JSON, overlaid per field
 * by the normative NEMA PS3.6 DocBook, → committed TypeScript modules under
 * `src/dictionary/generated/`.
 *
 * Runs via `pnpm gen:dictionary` (devDep `tsx`). Writes:
 *   - src/dictionary/generated/tags.ts     (Tag → DictionaryEntry)
 *   - src/dictionary/generated/keywords.ts (Keyword → Tag reverse map)
 *   - src/dictionary/generated/uids.ts     (UID → UidEntry)
 *
 * Reads:
 *   - vendor/innolitics/<short-sha>/attributes.json (where <short-sha> = first 7 chars of vendor/innolitics/SHA.txt)
 *   - vendor/innolitics/<short-sha>/sops.json
 *   - vendor/nema/part06/<sha-256>/part06.xml (the PS3.6 DocBook, normative)
 *
 * Authority for the element registry (tags.ts / keywords.ts):
 *   NEMA's PS3.6 DocBook is the normative publication of the Registry of DICOM
 *   Data Elements. Innolitics' `attributes.json` is a convenient regenerated
 *   mirror of it, and its regeneration cadence is not ours to control: at the
 *   pinned revision it is grounded in PS3.6 2024b. So the DocBook is applied as
 *   a **per-field overlay** over the Innolitics base:
 *
 *     - For a tag both sources carry, PS3.6 wins on every field it publishes:
 *       name, keyword, VR, VM, retirement.
 *     - A tag PS3.6 carries and Innolitics does not is ADDED from PS3.6.
 *     - A tag Innolitics carries and PS3.6 does not is KEPT. PS3.6 retires
 *       elements, it does not delete them, so a tag missing from the DocBook is
 *       far more likely to be a parse gap here than a withdrawal there, and
 *       dropping it would turn a decoded element into an unknown one. That is
 *       the wrong direction to fail in. (Today the set is empty.)
 *
 *   No entry is ever hand-corrected. A correction that cannot be derived from
 *   fetched normative bytes does not get made here.
 *
 * Authority for the UID registry (uids.ts):
 *   THE SAME RULE, ON THE SAME TERMS. PS3.6 Annex A is the normative registry of
 *   DICOM UIDs: Table A-1 (UID Values) and Table A-2 (Well-known Frames of
 *   Reference). Innolitics' `sops.json` covers SOP Classes only, so it is the
 *   base and Annex A is the per-field overlay, exactly as above: shared entries
 *   take the normative name, type and retirement; Annex-A-only entries are
 *   ADDED; entries only the mirror carries are KEPT, and that count is printed
 *   every run rather than assumed.
 *
 *   THE TWO DELIBERATE DEVIATIONS, PRESERVED BY CONSTRUCTION AND ASSERTED, NOT
 *   UNDONE. This is the whole reason the UID half was previously kept off the
 *   overlay, and a naive overlay would in fact undo both:
 *
 *     1. RETIREMENT IS A STRUCTURED BOOLEAN, NOT A NAME SUFFIX. Every retired
 *        row in Table A-1 carries " (Retired)" at the end of its UID Name. That
 *        suffix is stripped and carried in `retired` instead, so a consumer
 *        branches on a field rather than on a string match. A name that still
 *        spells "(Retired)" after the strip throws.
 *
 *        SAID AS AN OBSERVATION OF TABLE A-1, WHICH IS WHAT IT IS. PS3.6
 *        publishes THREE retirement signals and this derives from one of them.
 *        The governing clause is section 5, "Conventions", one paragraph of four
 *        sentences: "'RET' is used to indicate that the corresponding Data
 *        Element, SOP Class, or Transfer Syntax has been retired. Retired items
 *        are shown ITALICIZED. For retired items, the edition of the Standard in
 *        parentheses is the edition in which the item last appeared before it
 *        was retired. When the name of a retired DATA ELEMENT has been reused,
 *        the retired element has the qualifier '(Retired)' added ..." So the
 *        italic and the parenthesised edition are the markings and both reach
 *        UIDs; the "(Retired)" qualifier sentence is scoped to a reused Data
 *        Element name and does not. Annex A's own intro RESTATES the third
 *        narrowed to UIDs ("For retired UIDs, ..."); it does not add it - the
 *        fifth column. Italic and column are CORROBORATIONS and not the
 *        source; the column especially, for the reason the element registry
 *        learned one table over, where it also carries DICOS/DICONDE markers and
 *        reading it as a boolean retires live entries. All three agree on every
 *        A-1 row of this edition, and `test/dictionary/uids-normative.test.ts`
 *        measures that, so an edition which retires by italic or column alone
 *        reds instead of shipping `retired: false`.
 *     2. FOUR TRANSFER SYNTAX NAMES KEEP THEIR TOOLKIT SHORT FORM. PS3.6 gives
 *        four Transfer Syntaxes a name with a trailing ": Default Transfer
 *        Syntax for ..." clause that no DICOM toolkit prints and no consumer
 *        expects. Those four, and only those four, are cut at their first ": ".
 *        The short form is DERIVED from the normative name rather than typed
 *        here, so it cannot drift away from it, and a listed UID whose normative
 *        name stops carrying that clause throws instead of silently keeping a
 *        stale hand-written string. See `TOOLKIT_SHORT_FORM_UIDS`.
 *
 *   Neither deviation is a correction of PS3.6, and neither is applied to any
 *   other entry. Everything else in the file is the normative text.
 *
 *   Annex A's Table A-3 (Context Group UID Values) and Table A-4 (Template UID
 *   Values) are deliberately NOT read. They register the codes of DICOM's
 *   content mapping resource rather than the UIDs a Part 10 file's headers
 *   carry, and folding thousands of them into the same flat lookup would bury
 *   the entries this package exists to resolve. Out of scope, stated rather
 *   than overlooked.
 *
 * Determinism (DICT-05):
 *   - The header comment uses ONLY the pinned Innolitics SHA + the input file
 *     SHA-256 - NEVER `Date.now()` or `new Date()`.
 *   - Entries are sorted lexicographically (tag/keyword/UID).
 *   - All Object.entries / iteration is explicit-sorted before emit.
 *   - Re-running the generator with unchanged inputs produces byte-identical output.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// -----------------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_ROOT = join(REPO_ROOT, "vendor", "innolitics");
const SHA_FILE = join(VENDOR_ROOT, "SHA.txt");
const NEMA_PART06_ROOT = join(REPO_ROOT, "vendor", "nema", "part06");
const NEMA_SHA_FILE = join(NEMA_PART06_ROOT, "SHA.txt");
const OUT_DIR = join(REPO_ROOT, "src", "dictionary", "generated");

// -----------------------------------------------------------------------------
// UID types.
//
// The union this dictionary publishes. PS3.6's own "UID Type" column carries a
// wider vocabulary than this (LDAP OID, Mapping Resource, Application Hosting
// Model, ...); `NEMA_UID_TYPES` below is the closed translation, and a value it
// does not name throws rather than silently becoming "Other".
// -----------------------------------------------------------------------------

type UidType =
  | "TransferSyntax"
  | "SOPClass"
  | "MetaSOPClass"
  | "WellKnownFrameOfReference"
  | "WellKnownSOPInstance"
  | "CodingScheme"
  | "ApplicationContext"
  | "ServiceClass"
  | "Other";

// -----------------------------------------------------------------------------
// Standard VR set (PS3.5 §6.2). Includes 64-bit additions OV/SV/UV (DICOM 2018+).
// -----------------------------------------------------------------------------

const STANDARD_VRS: ReadonlySet<string> = new Set([
  "AE",
  "AS",
  "AT",
  "CS",
  "DA",
  "DS",
  "DT",
  "FL",
  "FD",
  "IS",
  "LO",
  "LT",
  "OB",
  "OD",
  "OF",
  "OL",
  "OV",
  "OW",
  "PN",
  "SH",
  "SL",
  "SQ",
  "SS",
  "ST",
  "SV",
  "TM",
  "UC",
  "UI",
  "UL",
  "UN",
  "UR",
  "US",
  "UT",
  "UV",
]);

// -----------------------------------------------------------------------------
// Innolitics raw shape (subset of fields we consume)
// -----------------------------------------------------------------------------

interface InnoliticsAttribute {
  readonly tag: string; // e.g., "(0010,0010)" or "(0020,31XX)"
  readonly name: string; // human display name
  readonly keyword: string; // e.g., "PatientName" or "" for repeating-group/retired
  readonly valueRepresentation: string; // VR or "VR1 or VR2" or "" or "See Note 2"
  readonly valueMultiplicity: string; // VM string preserved verbatim
  readonly retired: "Y" | "N";
  readonly id: string; // 8-char id, lowercase x for repeating groups
}

interface InnoliticsSop {
  readonly name: string;
  readonly id: string; // UID
  readonly ciod: string; // CIOD name (unused for v1)
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function readSha(): { full: string; short: string } {
  const raw = readFileSync(SHA_FILE, "utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(raw)) {
    throw new Error(`vendor/innolitics/SHA.txt must contain a 40-char hex SHA, got: ${raw}`);
  }
  // 7-char short SHA - aligned with plan 01-03 (which committed first using 7-char).
  // Both worktrees converge on the same vendor/innolitics/<short>/ directory at merge.
  return { full: raw, short: raw.slice(0, 7) };
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function readJson<T>(path: string): { data: T; sha: string } {
  const buf = readFileSync(path);
  const data = JSON.parse(buf.toString("utf8")) as T;
  return { data, sha: sha256(buf) };
}

function escape(s: string): string {
  // Emit JSON.stringify form for safe TS string literal embedding.
  return JSON.stringify(s);
}

/**
 * Map an Innolitics id (8-char, possibly with lowercase `x`) to the Tag string
 * we emit. For concrete tags we uppercase. For repeating-group families we
 * preserve lowercase `x` placeholders verbatim - these are NOT lookable up by
 * concrete tag and are flagged via `repeatingGroup: true`.
 */
function normalizeId(id: string): { tag: string; repeatingGroup: boolean } {
  // The `x` alternative admits A-F too: PS3.6 prints repeating-group tags with
  // uppercase hex ((50xx,200A)), and only the mirror happens to be all-lowercase.
  if (!/^[0-9a-fA-F]{8}$/.test(id) && !/^[0-9a-fA-FxX]{8}$/.test(id)) {
    throw new Error(`malformed id: ${id}`);
  }
  if (/[xX]/.test(id)) {
    return { tag: id.toLowerCase(), repeatingGroup: true };
  }
  return { tag: id.toUpperCase(), repeatingGroup: false };
}

/**
 * Parse Innolitics' valueRepresentation field into a VR list.
 *  - "PN" → ["PN"]
 *  - "US or SS" → ["US", "SS"]
 *  - "US or SS or OW" → ["US", "SS", "OW"]
 *  - "" → [] (some retired entries have no VR)
 *  - "See Note 2" → [] (special non-VR entries; flagged with VM but no VR)
 *  - "ALL" / "OB or OW" with non-standard token → filtered to standard-only.
 */
function parseVr(raw: string): string[] {
  if (!raw || raw === "See Note 2") return [];
  const tokens = raw.split(/\s+or\s+/).map((t) => t.trim());
  const valid = tokens.filter((t) => STANDARD_VRS.has(t));
  return valid;
}

// -----------------------------------------------------------------------------
// NEMA PS3.6 DocBook reader (normative source for the element registry).
//
// The four registry tables. Every one of them has the same six columns:
// Tag | Name | Keyword | VR | VM | (retirement / dictionary marker).
// -----------------------------------------------------------------------------

// The character the founder directive bans (U+2014), built from its code point on
// purpose. `scripts/check-no-emdash.sh` scans tracked files for the backslash-u
// escape as well as for the literal byte, so a detector for the character cannot
// spell it either way without reddening the gate that bans it. Do not "simplify"
// this into a string literal. A numeric entity in a future PS3.6 edition would
// decode to this character and land in a generated name, so the check is real.
const EM_DASH = String.fromCodePoint(0x2014);

const NEMA_REGISTRY_TABLES = ["table_6-1", "table_7-1", "table_8-1", "table_9-1"] as const;

/** How the element registry's provenance header names its source tables. */
const NEMA_ELEMENT_TABLES_LABEL = "Tables 6-1, 7-1, 8-1, 9-1";

/** How the UID registry's provenance header names its source tables. */
const NEMA_UID_TABLES_LABEL = "Annex A, Tables A-1 and A-2";

/** Lower bound on total registry rows. 2026c has 5,309; a parse that silently
 *  matched a fraction of them must fail rather than quietly shrink the overlay. */
const NEMA_MIN_ROWS = 5000;

interface NormativeElement {
  /** Emitted tag key: uppercase for concrete tags, lowercase for `x` families. */
  readonly tag: string;
  readonly repeatingGroup: boolean;
  readonly name: string;
  readonly keyword: string;
  readonly vr: readonly string[];
  readonly vm: string;
  readonly retired: boolean;
}

function readNemaSha(): string {
  const raw = readFileSync(NEMA_SHA_FILE, "utf8").trim().split(/\s+/)[0] ?? "";
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      `vendor/nema/part06/SHA.txt must contain a 64-char hex SHA-256, got: ${JSON.stringify(raw)}`,
    );
  }
  return raw.toLowerCase();
}

/**
 * Read the pinned DocBook and prove it is the pinned bytes.
 *
 * The Innolitics inputs are hashed only for the provenance header; here the hash
 * is a precondition. A dictionary is exactly the artifact where "the input was
 * swapped and nobody noticed" is unacceptable, and the check costs one hash of a
 * file already being read.
 */
function readNemaPart06(pinnedSha: string): string {
  const path = join(NEMA_PART06_ROOT, pinnedSha, "part06.xml");
  const buf = readFileSync(path);
  const actual = sha256(buf);
  if (actual !== pinnedSha) {
    throw new Error(
      `vendor/nema/part06 pin mismatch:\n  pinned:   ${pinnedSha}\n  on disk:  ${actual}\n` +
        `  file:     ${path}\n` +
        `Re-fetch the DocBook and update SHA.txt, or restore the pinned bytes.`,
    );
  }
  return buf.toString("utf8");
}

/** Pull the edition string out of `<subtitle>DICOM PS3.6 2026c - Data Dictionary</subtitle>`. */
function nemaEdition(xml: string): string {
  const m = /<subtitle>\s*DICOM PS3\.6 ([0-9]{4}[a-z]?) - Data Dictionary\s*<\/subtitle>/.exec(xml);
  if (!m?.[1]) {
    throw new Error(
      "part06.xml: cannot find the `<subtitle>DICOM PS3.6 <edition> - Data Dictionary</subtitle>` " +
        "line. Refusing to generate from a document that does not identify itself as PS3.6.",
    );
  }
  return m[1];
}

/** Slice out one `<table>...</table>` by `xml:id`, counting nesting rather than
 *  taking the first closing tag. */
function extractTable(xml: string, id: string): string {
  const marker = `xml:id="${id}"`;
  const at = xml.indexOf(marker);
  if (at < 0) throw new Error(`part06.xml: no element carries ${marker}`);
  const open = xml.lastIndexOf("<table", at);
  if (open < 0) throw new Error(`part06.xml: ${marker} is not on a <table> element`);
  // The marker must live in that opening tag, not in some later element the
  // backward search happened to skip over. A wrong `open` slices a wrong table.
  const openTag = xml.slice(open, xml.indexOf(">", open) + 1);
  if (!openTag.includes(marker)) {
    throw new Error(`part06.xml: ${marker} is not inside the nearest preceding <table ...>`);
  }

  const scan = /<table\b[^>]*?(\/?)>|<\/table>/g;
  scan.lastIndex = open;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(xml)) !== null) {
    if (m[0] === "</table>") {
      depth -= 1;
      if (depth === 0) return xml.slice(open, m.index + m[0].length);
    } else if (m[1] === "/") {
      // Self-closing <table/> - not a container, and never seen in PS3.6.
      if (m.index === open) throw new Error(`part06.xml: ${id} is a self-closing <table/>`);
    } else {
      depth += 1;
    }
  }
  throw new Error(`part06.xml: unterminated <table> for ${id}`);
}

/** Decode the entity forms DocBook actually uses, and refuse any other. */
function decodeEntities(s: string, where: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    switch (body) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        throw new Error(`part06.xml (${where}): unrecognized entity ${whole}`);
    }
  });
}

/**
 * Cell markup to text. PS3.6 wraps every cell in `<para>` and marks retired rows
 * with `<emphasis role="italic">`; note references are empty `<xref/>` elements.
 * The keyword column carries ZERO WIDTH SPACE (U+200B) as a line-break hint,
 * 13,470 of them in 2026c, and leaving even one in would produce a keyword that
 * looks right and never matches.
 */
function cellText(markup: string, where: string): string {
  // Strip markup to a fixpoint rather than in one pass. A single pass can leave
  // a residue that reassembles into another tag, which is why CodeQL treats a
  // one-shot tag strip as incomplete sanitization. This is a build-time reader
  // of SHA-256-pinned normative bytes and not an HTML sink, so the injection
  // framing does not apply, but the underlying failure does: residue here would
  // become a dictionary keyword. So strip until stable, then refuse anything
  // still carrying markup. Measured on 2026c: identical output to the one-pass
  // form across all 31,854 cells, and no cell legitimately holds `<` or `>`.
  // The check runs BEFORE entity decoding, so a literal `&lt;` cannot trip it.
  let withoutTags = markup;
  for (;;) {
    const next = withoutTags.replace(/<[^<>]*>/g, "");
    if (next === withoutTags) break;
    withoutTags = next;
  }
  if (/[<>]/.test(withoutTags)) {
    throw new Error(
      `part06.xml (${where}): cell still carries markup after stripping: ` +
        JSON.stringify(withoutTags),
    );
  }
  return decodeEntities(withoutTags, where)
    .replace(/\u200B/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Same normalization as {@link normalizeId}, from a PS3.6 `(gggg,eeee)` cell. */
function normalizeNemaTag(cell: string, where: string): { tag: string; repeatingGroup: boolean } {
  const m = /^\(([0-9A-Fa-fxX]{4}),([0-9A-Fa-fxX]{4})\)$/.exec(cell);
  if (!m) throw new Error(`part06.xml (${where}): malformed tag cell ${JSON.stringify(cell)}`);
  return normalizeId(`${m[1]}${m[2]}`);
}

/**
 * VR cell to VR list, strictly. `parseVr` silently drops tokens it does not
 * recognize, which is tolerable for a mirror we are only reading for shape but
 * not for the normative source: a dropped VR is exactly how a dictionary starts
 * mis-reading bytes. An unknown token throws instead.
 */
function parseNemaVr(raw: string, where: string): string[] {
  if (raw === "" || /^See Note/.test(raw)) return [];
  const tokens = raw.split(/\s+or\s+/).map((t) => t.trim());
  for (const t of tokens) {
    if (!STANDARD_VRS.has(t)) {
      throw new Error(`part06.xml (${where}): unknown VR token ${JSON.stringify(t)} in ${raw}`);
    }
  }
  return tokens;
}

/**
 * Parse the four registry tables into normative entries, keyed by lowercase tag
 * so the merge never depends on the hex casing either side happens to print.
 */
function parseNemaRegistry(xml: string): Map<string, NormativeElement> {
  const out = new Map<string, NormativeElement>();

  for (const id of NEMA_REGISTRY_TABLES) {
    const table = extractTable(xml, id);

    // Collect EVERY `<tbody>` section. PS3.6 uses exactly one per table today,
    // but the guard must not assume it: slicing to the first `</tbody>` and then
    // counting `<tr>` opens on that already-truncated slice cannot see rows past
    // it, so a table split across two bodies would drop the second in silence.
    const bodies: string[] = [];
    const bodyScan = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g;
    let bm: RegExpExecArray | null;
    while ((bm = bodyScan.exec(table)) !== null) bodies.push(bm[1] ?? "");
    if (bodies.length === 0) throw new Error(`part06.xml: ${id} has no <tbody>`);
    const bodyOpens = (table.match(/<tbody\b/g) ?? []).length;
    if (bodyOpens !== bodies.length) {
      throw new Error(
        `part06.xml: ${id} has ${bodyOpens} <tbody> opens but ${bodies.length} closed sections`,
      );
    }

    const rows: string[] = [];
    for (const body of bodies) {
      rows.push(...(body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? []));
    }
    if (rows.length === 0) throw new Error(`part06.xml: ${id} has no <tr> rows`);

    // Every `<tr>` in the table must be accounted for as a body row we matched or
    // a header row. That covers all three silent-drop shapes at once: a row the
    // matcher does not recognize (a self-closing `<tr/>`), a row in a second
    // `<tbody>`, and a row sitting outside any `<tbody>` at all.
    const headRows = (table.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/g) ?? []).reduce(
      (n, head) => n + (head.match(/<tr\b/g) ?? []).length,
      0,
    );
    const trOpens = (table.match(/<tr\b/g) ?? []).length;
    if (trOpens !== rows.length + headRows) {
      throw new Error(
        `part06.xml: ${id} has ${trOpens} <tr> opens but matched ${rows.length} body rows ` +
          `plus ${headRows} header rows`,
      );
    }

    for (const row of rows) {
      const cells = (row.match(/<td\b[^>]*?(?:\/>|>[\s\S]*?<\/td>)/g) ?? []).map((c) =>
        cellText(c, id),
      );
      if (cells.length !== 6) {
        throw new Error(
          `part06.xml: ${id} row has ${cells.length} cells, expected 6 ` +
            `(Tag | Name | Keyword | VR | VM | marker): ${JSON.stringify(cells)}`,
        );
      }
      const [tagCell = "", name = "", keyword = "", vrCell = "", vm = "", marker = ""] = cells;
      const { tag, repeatingGroup } = normalizeNemaTag(tagCell, id);

      if (keyword !== "" && !/^[A-Za-z][A-Za-z0-9]*$/.test(keyword)) {
        throw new Error(`part06.xml: ${id} ${tagCell} has a non-identifier keyword: ${keyword}`);
      }
      for (const [field, value] of [
        ["name", name],
        ["keyword", keyword],
      ] as const) {
        if (value.includes(EM_DASH)) {
          throw new Error(
            `part06.xml: ${id} ${tagCell} ${field} carries a banned em dash: ${value}`,
          );
        }
      }

      const key = tag.toLowerCase();
      if (out.has(key)) throw new Error(`part06.xml: duplicate tag ${tagCell} in ${id}`);

      out.set(key, {
        tag,
        repeatingGroup,
        name,
        keyword,
        vr: parseNemaVr(vrCell, `${id} ${tagCell}`),
        vm,
        // The sixth column carries "RET", "RET (2025a)", or a dictionary marker
        // ("DICOS", "DICONDE") that is NOT a retirement. Only RET retires.
        retired: /^RET\b/.test(marker),
      });
    }
  }

  if (out.size < NEMA_MIN_ROWS) {
    throw new Error(
      `part06.xml: parsed only ${out.size} registry rows, expected at least ${NEMA_MIN_ROWS}. ` +
        `The DocBook table shape has probably changed; fix the parser rather than lowering this.`,
    );
  }
  return out;
}

// -----------------------------------------------------------------------------
// NEMA PS3.6 Annex A reader (normative source for the UID registry).
//
// Two tables, and they do NOT have the same shape:
//   Table A-1 "UID Values"                    - 5 columns, and column 4 names the UID Type.
//   Table A-2 "Well-known Frames of Reference" - 4 columns, and the TABLE is the type: it has
//                                                no UID Type column at all.
// Reading A-2 with A-1's column contract would take its "Normative Reference" cell as a type.
// So the column count and the type source are declared per table and asserted per row.
//
// A-2 is read because leaving it out is what made this dictionary look, on measurement, as
// though it carried seven UIDs the normative source had dropped. It had not: they are in A-2.
// That is the mirror-only rule doing its job, and it is why the rule says an absence is more
// likely a parse gap here than a withdrawal there.
// -----------------------------------------------------------------------------

interface NemaUidTable {
  readonly id: string;
  readonly columns: number;
  /** `undefined` means the row's UID Type cell decides; otherwise every row in the table is this. */
  readonly type?: UidType;
}

const NEMA_UID_TABLES: readonly NemaUidTable[] = [
  { id: "table_A-1", columns: 5 },
  { id: "table_A-2", columns: 4, type: "WellKnownFrameOfReference" },
];

/** Lower bound on total Annex A rows. 2026c has 496; see `NEMA_MIN_ROWS` for the argument. */
const NEMA_MIN_UIDS = 450;

/**
 * PS3.6's "UID Type" vocabulary to this dictionary's `UidType`, CLOSED.
 *
 * A cell this map does not name throws. The alternative - defaulting an unrecognized type to
 * "Other" - is the shape that lets a future edition quietly reclassify a Transfer Syntax into
 * the bucket a consumer filters out, with nothing to notice. Four of PS3.6's categories have no
 * counterpart in the published union and map to "Other" DELIBERATELY and explicitly, which is a
 * different act from defaulting there.
 */
const NEMA_UID_TYPES: Readonly<Record<string, UidType>> = {
  "SOP Class": "SOPClass",
  "Meta SOP Class": "MetaSOPClass",
  "Transfer Syntax": "TransferSyntax",
  "Well-known SOP Instance": "WellKnownSOPInstance",
  "Coding Scheme": "CodingScheme",
  // The registry of DICOM's own UIDs used as a coding scheme (`1.2.840.10008.2.6.1`, DCMUID).
  // PS3.6 spells its type as a sentence; it is a coding scheme.
  "DICOM UIDs as a Coding Scheme": "CodingScheme",
  "Application Context Name": "ApplicationContext",
  "Service Class": "ServiceClass",
  // No counterpart in the published union. Mapped explicitly rather than by default.
  "Application Hosting Model": "Other",
  "Mapping Resource": "Other",
  "LDAP OID": "Other",
  "Synchronization Frame of Reference": "Other",
};

/**
 * The Transfer Syntax UIDs whose PS3.6 name is cut at its first ": ".
 *
 * PS3.6 names these four with a trailing ": Default Transfer Syntax for ..." clause recording
 * which Storage class defaults to them. No DICOM toolkit prints that clause and no consumer of
 * this package expects it, so the short form is what ships. Deliberate, closed, and applied to
 * nothing else in the file.
 *
 * The short form is DERIVED (cut at ": ") rather than typed here on purpose: a hand-written
 * string is exactly what silently rots when a future edition rewords the name, and this package
 * has already shipped 174 wrong UID names once. If a listed UID's normative name stops carrying
 * the clause, `parseNemaUidRegistry` throws instead of keeping a stale short form.
 */
const TOOLKIT_SHORT_FORM_UIDS: ReadonlySet<string> = new Set([
  "1.2.840.10008.1.2", // Implicit VR Little Endian
  "1.2.840.10008.1.2.4.50", // JPEG Baseline (Process 1)
  "1.2.840.10008.1.2.4.51", // JPEG Extended (Process 2 & 4)
  "1.2.840.10008.1.2.4.70", // JPEG Lossless, Non-Hierarchical, First-Order Prediction (...)
]);

/** How PS3.6 spells a retired UID: the marker is IN the UID Name, not in a column of its own. */
const RETIRED_SUFFIX = " (Retired)";

/**
 * Two Table A-1 rows carry the retirement marker AS their whole UID Name, with no name at all
 * (`1.2.840.10008.5.1.4.1.1.12.77` and `1.2.840.10008.5.1.4.1.1.40`, both last published in
 * 2015c). PS3.6 withdrew the name along with the class.
 *
 * They are EXCLUDED rather than emitted with an empty `name`, and the exclusion is counted and
 * printed every run rather than silently dropped. The reason is the direction each option fails
 * in: an entry whose `name` is `""` is a SUCCESSFUL lookup, so a consumer's
 * `uid(x)?.name ?? "<unknown>"` fallback stops firing and it prints nothing at all, where
 * `undefined` prints `<unknown>` and is true. Inventing a name from another toolkit's table is
 * not available either: this generator makes no correction it cannot derive from the pinned
 * normative bytes, and the bytes publish no name here.
 */
const UNNAMED_RETIRED_MARKER = "(Retired)";

interface NormativeUid {
  readonly uid: string;
  readonly name: string;
  readonly type: UidType;
  readonly retired: boolean;
}

/** Parse PS3.6 Annex A Tables A-1 and A-2 into normative UID entries, keyed by UID value. */
function parseNemaUidRegistry(xml: string): {
  uids: Map<string, NormativeUid>;
  unnamedRetired: readonly string[];
} {
  const out = new Map<string, NormativeUid>();
  const shortFormsSeen = new Set<string>();
  const unnamedRetired: string[] = [];

  for (const { id, columns, type: tableType } of NEMA_UID_TABLES) {
    const table = extractTable(xml, id);

    // Same body/row accounting as the element registry: every `<tr>` is either a header row or
    // a body row we matched, so a row in a second `<tbody>` or outside one cannot vanish.
    const bodies: string[] = [];
    const bodyScan = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g;
    let bm: RegExpExecArray | null;
    while ((bm = bodyScan.exec(table)) !== null) bodies.push(bm[1] ?? "");
    if (bodies.length === 0) throw new Error(`part06.xml: ${id} has no <tbody>`);
    const bodyOpens = (table.match(/<tbody\b/g) ?? []).length;
    if (bodyOpens !== bodies.length) {
      throw new Error(
        `part06.xml: ${id} has ${bodyOpens} <tbody> opens but ${bodies.length} closed sections`,
      );
    }

    const rows: string[] = [];
    for (const body of bodies) {
      rows.push(...(body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? []));
    }
    if (rows.length === 0) throw new Error(`part06.xml: ${id} has no <tr> rows`);

    const headRows = (table.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/g) ?? []).reduce(
      (n, head) => n + (head.match(/<tr\b/g) ?? []).length,
      0,
    );
    const trOpens = (table.match(/<tr\b/g) ?? []).length;
    if (trOpens !== rows.length + headRows) {
      throw new Error(
        `part06.xml: ${id} has ${trOpens} <tr> opens but matched ${rows.length} body rows ` +
          `plus ${headRows} header rows`,
      );
    }

    for (const row of rows) {
      const cells = (row.match(/<td\b[^>]*?(?:\/>|>[\s\S]*?<\/td>)/g) ?? []).map((c) =>
        cellText(c, id),
      );
      if (cells.length !== columns) {
        throw new Error(
          `part06.xml: ${id} row has ${cells.length} cells, expected ${columns}: ` +
            JSON.stringify(cells),
        );
      }
      const [uidCell = "", rawName = ""] = cells;

      // A UID is digits and dots. PS3.6 writes them with ZERO WIDTH SPACE line-break hints,
      // which `cellText` has already removed; this proves it did.
      if (!/^[0-9]+(?:\.[0-9]+)*$/.test(uidCell)) {
        throw new Error(`part06.xml: ${id} has a malformed UID cell ${JSON.stringify(uidCell)}`);
      }

      let type: UidType;
      if (tableType !== undefined) {
        type = tableType;
      } else {
        const typeCell = cells[3] ?? "";
        const mapped = NEMA_UID_TYPES[typeCell];
        if (mapped === undefined) {
          throw new Error(
            `part06.xml: ${id} ${uidCell} has an unrecognized UID Type ${JSON.stringify(typeCell)}. ` +
              `Add it to NEMA_UID_TYPES deliberately rather than defaulting it.`,
          );
        }
        type = mapped;
      }

      // A row PS3.6 retired AND unnamed. Excluded deliberately; see UNNAMED_RETIRED_MARKER.
      if (rawName === UNNAMED_RETIRED_MARKER) {
        unnamedRetired.push(uidCell);
        continue;
      }

      // DEVIATION 1: retirement becomes a boolean and leaves the name.
      const retired = rawName.endsWith(RETIRED_SUFFIX);
      let name = retired ? rawName.slice(0, -RETIRED_SUFFIX.length).trimEnd() : rawName;
      if (name.includes("(Retired)")) {
        throw new Error(
          `part06.xml: ${id} ${uidCell} still spells retirement in its name after the strip: ` +
            JSON.stringify(name),
        );
      }

      // DEVIATION 2: the four toolkit short forms, derived rather than typed.
      if (TOOLKIT_SHORT_FORM_UIDS.has(uidCell)) {
        const cut = name.indexOf(": ");
        if (cut < 0) {
          throw new Error(
            `part06.xml: ${id} ${uidCell} is listed in TOOLKIT_SHORT_FORM_UIDS but its normative ` +
              `name carries no ": " clause to cut: ${JSON.stringify(name)}. The deviation is no ` +
              `longer derivable from the normative text - re-decide it rather than hand-writing ` +
              `the short form.`,
          );
        }
        name = name.slice(0, cut);
        shortFormsSeen.add(uidCell);
      }

      if (name === "") throw new Error(`part06.xml: ${id} ${uidCell} has an empty UID Name`);
      if (name.includes(EM_DASH)) {
        throw new Error(`part06.xml: ${id} ${uidCell} name carries a banned em dash: ${name}`);
      }
      if (out.has(uidCell)) throw new Error(`part06.xml: duplicate UID ${uidCell} in ${id}`);

      out.set(uidCell, { uid: uidCell, name, type, retired });
    }
  }

  // A short form that matched nothing is a rule that has stopped applying, and it would go on
  // "passing" forever. Fail rather than carry a dead entry.
  for (const uid of TOOLKIT_SHORT_FORM_UIDS) {
    if (!shortFormsSeen.has(uid)) {
      throw new Error(
        `part06.xml: TOOLKIT_SHORT_FORM_UIDS names ${uid}, which Annex A does not carry. ` +
          `Re-decide the deviation rather than leaving a rule that matches nothing.`,
      );
    }
  }

  if (out.size < NEMA_MIN_UIDS) {
    throw new Error(
      `part06.xml: parsed only ${out.size} Annex A UID rows, expected at least ${NEMA_MIN_UIDS}. ` +
        `The DocBook table shape has probably changed; fix the parser rather than lowering this.`,
    );
  }
  return { uids: out, unnamedRetired };
}

// -----------------------------------------------------------------------------
// Emitters
// -----------------------------------------------------------------------------

function emitHeader(
  generatorName: string,
  sources: ReadonlyArray<{ path: string; sha256: string }>,
  innoSha: string,
  normative?: { edition: string; sha256: string; tables: string; subject: string },
): string {
  const lines: string[] = [
    "/* eslint-disable */",
    "// generated - do not edit by hand.",
    "//",
    `// Generator: scripts/${generatorName}`,
    `// Innolitics dicom-standard SHA (pinned, full): ${innoSha}`,
  ];
  if (normative) {
    lines.push(
      `// Normative source: NEMA DICOM PS3.6 ${normative.edition} DocBook (${normative.tables}).`,
      `//   vendor/nema/part06/<sha>/part06.xml → ${normative.sha256}`,
      `//   PS3.6 wins per field over the Innolitics mirror on every ${normative.subject} it publishes.`,
    );
  }
  lines.push("// Inputs (path → SHA-256):");
  for (const s of sources) {
    lines.push(`//   - ${s.path} → ${s.sha256}`);
  }
  lines.push(
    "//",
    "// Re-generate via `pnpm gen:dictionary`. CI gates byte-identical output.",
    normative
      ? "// See vendor/innolitics/README.md and vendor/nema/README.md for re-pinning."
      : "// See vendor/innolitics/README.md for re-pinning procedure.",
    "",
  );
  return lines.join("\n");
}

interface BuiltEntry {
  readonly tagOrKey: string;
  readonly literal: string;
}

interface OverlayStats {
  readonly shared: number;
  readonly added: number;
  readonly innoliticsOnly: readonly string[];
  readonly overridden: Readonly<Record<"name" | "keyword" | "vr" | "vm" | "retired", number>>;
  readonly vrOverrides: readonly string[];
}

function buildTagsTs(
  attrs: ReadonlyArray<InnoliticsAttribute>,
  normative: ReadonlyMap<string, NormativeElement>,
  innoSha: string,
  attrSha: string,
  nema: { edition: string; sha256: string },
): { ts: string; tagCount: number; keywordCount: number; stats: OverlayStats } {
  // Build entries keyed by tag (concrete or repeating-group placeholder).
  // Multiple attributes can share an id ONLY in retired shadow-cases - collapse
  // by preferring non-retired, then alphabetical keyword for stability.
  const seen = new Map<string, InnoliticsAttribute>();
  for (const a of attrs) {
    const existing = seen.get(a.id);
    if (!existing) {
      seen.set(a.id, a);
      continue;
    }
    // Prefer current (retired === "N") over retired duplicates; on tie, prefer
    // alphabetically earlier keyword (deterministic).
    const existingRetired = existing.retired === "Y";
    const candRetired = a.retired === "Y";
    if (existingRetired && !candRetired) {
      seen.set(a.id, a);
    } else if (existingRetired === candRetired && a.keyword < existing.keyword) {
      seen.set(a.id, a);
    }
  }

  const entries: BuiltEntry[] = [];
  const keywordPairs: Array<{ keyword: string; tag: string }> = [];

  // Merge: Innolitics supplies the base row, PS3.6 overrides every field it
  // publishes, and PS3.6-only tags are appended below.
  const consumed = new Set<string>();
  const innoliticsOnly: string[] = [];
  const vrOverrides: string[] = [];
  const overridden = { name: 0, keyword: 0, vr: 0, vm: 0, retired: 0 };
  let shared = 0;

  const emit = (
    tag: string,
    repeatingGroup: boolean,
    keyword: string,
    name: string,
    vr: readonly string[],
    vm: string,
    retired: boolean,
  ): void => {
    const fields: string[] = [
      `tag: ${escape(tag)}`,
      `keyword: ${escape(keyword)}`,
      `name: ${escape(name)}`,
      `vr: [${vr.map(escape).join(", ")}] as const`,
      `vm: ${escape(vm)}`,
      `retired: ${retired}`,
    ];
    if (repeatingGroup) fields.push("repeatingGroup: true as const");

    entries.push({ tagOrKey: tag, literal: `{ ${fields.join(", ")} }` });

    // Build reverse map only for concrete tags with non-empty keyword.
    if (!repeatingGroup && keyword.length > 0) {
      keywordPairs.push({ keyword, tag });
    }
  };

  for (const [, a] of seen) {
    const { tag, repeatingGroup } = normalizeId(a.id);
    const norm = normative.get(tag.toLowerCase());

    if (!norm) {
      innoliticsOnly.push(tag);
      emit(
        tag,
        repeatingGroup,
        a.keyword,
        a.name,
        parseVr(a.valueRepresentation),
        a.valueMultiplicity,
        a.retired === "Y",
      );
      continue;
    }

    consumed.add(tag.toLowerCase());
    shared += 1;
    const baseVr = parseVr(a.valueRepresentation);
    if (a.name !== norm.name) overridden.name += 1;
    if (a.keyword !== norm.keyword) overridden.keyword += 1;
    if (baseVr.join("|") !== norm.vr.join("|")) {
      overridden.vr += 1;
      vrOverrides.push(`${tag}: [${baseVr.join(", ")}] -> [${norm.vr.join(", ")}]`);
    }
    if (a.valueMultiplicity !== norm.vm) overridden.vm += 1;
    if ((a.retired === "Y") !== norm.retired) overridden.retired += 1;

    emit(tag, repeatingGroup, norm.keyword, norm.name, norm.vr, norm.vm, norm.retired);
  }

  // PS3.6 tags the mirror has not caught up to yet.
  let added = 0;
  for (const [key, norm] of normative) {
    if (consumed.has(key)) continue;
    added += 1;
    emit(norm.tag, norm.repeatingGroup, norm.keyword, norm.name, norm.vr, norm.vm, norm.retired);
  }

  const stats: OverlayStats = {
    shared,
    added,
    innoliticsOnly: innoliticsOnly.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    overridden,
    vrOverrides,
  };

  // A keyword must resolve to exactly one tag; the reverse map cannot represent
  // a collision, and silently keeping the last one would break `byKeyword`.
  const byKeyword = new Map<string, string>();
  for (const p of keywordPairs) {
    const prior = byKeyword.get(p.keyword);
    if (prior !== undefined && prior !== p.tag) {
      throw new Error(`keyword ${p.keyword} maps to both ${prior} and ${p.tag}`);
    }
    byKeyword.set(p.keyword, p.tag);
  }

  // Deterministic sort.
  entries.sort((a, b) => (a.tagOrKey < b.tagOrKey ? -1 : a.tagOrKey > b.tagOrKey ? 1 : 0));
  keywordPairs.sort((a, b) => (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0));

  const tagsTs =
    emitHeader(
      "generate-dictionary.ts",
      [{ path: "vendor/innolitics/<sha>/attributes.json", sha256: attrSha }],
      innoSha,
      { ...nema, tables: NEMA_ELEMENT_TABLES_LABEL, subject: "tag" },
    ) +
    `import type { DictionaryEntry } from "../types.js";\n\n` +
    `export const TAGS: { readonly [tag: string]: DictionaryEntry } = {\n` +
    entries.map((e) => `  ${escape(e.tagOrKey)}: ${e.literal},`).join("\n") +
    `\n};\n`;

  const keywordsTs =
    emitHeader(
      "generate-dictionary.ts",
      [{ path: "vendor/innolitics/<sha>/attributes.json", sha256: attrSha }],
      innoSha,
      { ...nema, tables: NEMA_ELEMENT_TABLES_LABEL, subject: "tag" },
    ) +
    `export const KEYWORDS: { readonly [keyword: string]: string } = {\n` +
    keywordPairs.map((p) => `  ${escape(p.keyword)}: ${escape(p.tag)},`).join("\n") +
    `\n};\n`;

  // We're emitting two files in this single function - return TS for tags and
  // pass keywordsTs out via a side channel by writing directly. Cleaner: split.
  // Keep clean by writing keywords inline here and returning both:
  writeFileSync(join(OUT_DIR, "keywords.ts"), keywordsTs, "utf8");

  return { ts: tagsTs, tagCount: entries.length, keywordCount: keywordPairs.length, stats };
}

interface UidOverlayStats {
  readonly shared: number;
  readonly added: number;
  readonly mirrorOnly: readonly string[];
  readonly overridden: Readonly<Record<"name" | "type" | "retired", number>>;
  readonly shortForms: readonly string[];
}

function buildUidsTs(
  sops: ReadonlyArray<InnoliticsSop>,
  normative: ReadonlyMap<string, NormativeUid>,
  innoSha: string,
  sopsSha: string,
  nema: { edition: string; sha256: string },
): { ts: string; uidCount: number; stats: UidOverlayStats } {
  interface BuiltUid {
    readonly uid: string;
    readonly name: string;
    readonly type: UidType;
    readonly retired: boolean;
  }

  // The Innolitics mirror supplies the base row. PS3.6 Annex A overrides every field it
  // publishes, Annex-A-only UIDs are appended, and a UID only the mirror carries is KEPT.
  const merged = new Map<string, BuiltUid>();
  const consumed = new Set<string>();
  const mirrorOnly: string[] = [];
  const overridden = { name: 0, type: 0, retired: 0 };
  let shared = 0;

  for (const s of sops) {
    if (!/^[0-9]+(?:\.[0-9]+)*$/.test(s.id)) {
      throw new Error(`Invalid UID in sops.json: ${s.id}`);
    }
    // `sops.json`'s `name` is already the full PS3.6 Table A-1 "UID Name", e.g.
    // "CT Image Storage" and "Digital X-Ray Image Storage - For Presentation".
    // Appending " Storage" here produced "CT Image Storage Storage" for the 164
    // entries whose name already ends in "Storage", and an equally wrong
    // "... - For Presentation Storage" / "Macular Grid Thickness and Volume
    // Report Storage" for the other 11. It touched 175 entries and 174 came out
    // wrong: it landed on the right string for exactly one, whose PS3.6 name
    // really is "Macular Grid Thickness and Volume Report Storage". "175 wrong"
    // sat here contradicting the 174 stated everywhere else; the 174 is right. The
    // sibling `ciod` field is the bare CIOD name ("Computed Radiography Image");
    // `name` is not, and never needed a suffix. That defect is why this path is
    // now overlaid by the normative table instead of trusted.
    const base: BuiltUid = { uid: s.id, name: s.name, type: "SOPClass", retired: false };
    const norm = normative.get(s.id);
    if (!norm) {
      mirrorOnly.push(s.id);
      merged.set(s.id, base);
      continue;
    }
    consumed.add(s.id);
    shared += 1;
    if (base.name !== norm.name) overridden.name += 1;
    if (base.type !== norm.type) overridden.type += 1;
    if (base.retired !== norm.retired) overridden.retired += 1;
    merged.set(s.id, { uid: norm.uid, name: norm.name, type: norm.type, retired: norm.retired });
  }

  let added = 0;
  for (const [uid, norm] of normative) {
    if (consumed.has(uid)) continue;
    added += 1;
    merged.set(uid, { uid: norm.uid, name: norm.name, type: norm.type, retired: norm.retired });
  }

  // The published shape of the two deviations, so a reader of the run log sees them applied
  // rather than taking the docblock's word for it.
  const shortForms = [...TOOLKIT_SHORT_FORM_UIDS]
    .map((uid) => `${uid} -> ${merged.get(uid)?.name ?? "<missing>"}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const stats: UidOverlayStats = {
    shared,
    added,
    mirrorOnly: mirrorOnly.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    overridden,
    shortForms,
  };

  const sorted = [...merged.values()].sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

  const lines = sorted.map((u) => {
    const fields = [
      `uid: ${escape(u.uid)}`,
      `name: ${escape(u.name)}`,
      `type: ${escape(u.type)}`,
      `retired: ${u.retired}`,
    ];
    return `  ${escape(u.uid)}: { ${fields.join(", ")} },`;
  });

  const ts =
    emitHeader(
      "generate-dictionary.ts",
      [{ path: "vendor/innolitics/<sha>/sops.json", sha256: sopsSha }],
      innoSha,
      { ...nema, tables: NEMA_UID_TABLES_LABEL, subject: "UID" },
    ) +
    `import type { UidEntry } from "../types.js";\n\n` +
    `export const UIDS: { readonly [uid: string]: UidEntry } = {\n` +
    lines.join("\n") +
    `\n};\n`;

  return { ts, uidCount: sorted.length, stats };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  console.log("[gen:dictionary] resolving pinned Innolitics SHA...");
  const { full, short } = readSha();
  console.log(`[gen:dictionary] SHA: ${full} (short: ${short})`);

  const inputDir = join(VENDOR_ROOT, short);
  const attrPath = join(inputDir, "attributes.json");
  const sopsPath = join(inputDir, "sops.json");

  console.log(`[gen:dictionary] reading ${attrPath}`);
  const { data: attrs, sha: attrSha } = readJson<InnoliticsAttribute[]>(attrPath);
  if (!Array.isArray(attrs) || attrs.length < 3000) {
    throw new Error(
      `attributes.json sanity check failed: expected ≥ 3000 entries, got ${attrs.length}`,
    );
  }
  for (const a of attrs.slice(0, 5)) {
    for (const k of [
      "tag",
      "name",
      "keyword",
      "valueRepresentation",
      "valueMultiplicity",
      "retired",
      "id",
    ] as const) {
      if (!(k in a)) {
        throw new Error(`attributes.json entry missing field "${k}": ${JSON.stringify(a)}`);
      }
    }
  }

  console.log(`[gen:dictionary] reading ${sopsPath}`);
  const { data: sops, sha: sopsSha } = readJson<InnoliticsSop[]>(sopsPath);
  if (!Array.isArray(sops) || sops.length < 100) {
    throw new Error(`sops.json sanity check failed: expected ≥ 100 entries, got ${sops.length}`);
  }

  console.log("[gen:dictionary] resolving pinned NEMA PS3.6 DocBook...");
  const nemaSha = readNemaSha();
  const nemaXml = readNemaPart06(nemaSha);
  const edition = nemaEdition(nemaXml);
  console.log(`[gen:dictionary] PS3.6 edition: ${edition} (sha256 ${nemaSha.slice(0, 12)})`);
  const normative = parseNemaRegistry(nemaXml);
  console.log(`[gen:dictionary] normative registry rows: ${normative.size}`);
  const { uids: normativeUids, unnamedRetired } = parseNemaUidRegistry(nemaXml);
  console.log(
    `[gen:dictionary] normative Annex A UID rows: ${normativeUids.size} ` +
      `(${unnamedRetired.length} retired-and-unnamed rows excluded: ${unnamedRetired.join(", ")})`,
  );

  mkdirSync(OUT_DIR, { recursive: true });

  console.log("[gen:dictionary] building tags + keywords...");
  const {
    ts: tagsTs,
    tagCount,
    keywordCount,
    stats,
  } = buildTagsTs(attrs, normative, full, attrSha, { edition, sha256: nemaSha });
  writeFileSync(join(OUT_DIR, "tags.ts"), tagsTs, "utf8");

  // Print the overlay, so a re-pin shows exactly what the normative source moved
  // rather than burying it in a 5,000-line diff.
  console.log(
    `[gen:dictionary] overlay vs PS3.6 ${edition}: ${stats.shared} shared, ${stats.added} added, ` +
      `${stats.innoliticsOnly.length} mirror-only kept`,
  );
  console.log(
    `[gen:dictionary] fields overridden by PS3.6 - name: ${stats.overridden.name}, ` +
      `keyword: ${stats.overridden.keyword}, vr: ${stats.overridden.vr}, ` +
      `vm: ${stats.overridden.vm}, retired: ${stats.overridden.retired}`,
  );
  for (const line of stats.vrOverrides) {
    console.log(`[gen:dictionary]   VR override ${line}`);
  }
  if (stats.innoliticsOnly.length > 0) {
    console.log(`[gen:dictionary]   mirror-only: ${stats.innoliticsOnly.join(", ")}`);
  }

  console.log("[gen:dictionary] building uids...");
  const {
    ts: uidsTs,
    uidCount,
    stats: uidStats,
  } = buildUidsTs(sops, normativeUids, full, sopsSha, { edition, sha256: nemaSha });
  writeFileSync(join(OUT_DIR, "uids.ts"), uidsTs, "utf8");

  // The same printout the element overlay gets, for the same reason: a re-pin should show what
  // the normative source moved rather than burying it in the diff. `mirror-only kept` is the
  // assumption the authority rule rests on, so it is MEASURED every run rather than asserted.
  console.log(
    `[gen:dictionary] UID overlay vs PS3.6 ${edition} Annex A: ${uidStats.shared} shared, ` +
      `${uidStats.added} added, ${uidStats.mirrorOnly.length} mirror-only kept`,
  );
  console.log(
    `[gen:dictionary] UID fields overridden by PS3.6 - name: ${uidStats.overridden.name}, ` +
      `type: ${uidStats.overridden.type}, retired: ${uidStats.overridden.retired}`,
  );
  for (const line of uidStats.shortForms) {
    console.log(`[gen:dictionary]   toolkit short form ${line}`);
  }
  if (uidStats.mirrorOnly.length > 0) {
    console.log(`[gen:dictionary]   mirror-only UIDs: ${uidStats.mirrorOnly.join(", ")}`);
  }

  console.log(
    `[gen:dictionary] done - tags: ${tagCount}, keywords: ${keywordCount}, uids: ${uidCount}`,
  );
}

try {
  main();
} catch (err) {
  console.error("[gen:dictionary] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
}

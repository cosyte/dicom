#!/usr/bin/env tsx
//
// PS3.15 Annex E action table -> committed TS module.
//
// Runs via `pnpm gen:annex-e` (devDep `tsx`). Writes:
//   - src/dictionary/generated/annex-e.ts  (Tag -> AnnexEAction map)
//
// Two inputs, and the normative one wins:
//
//   - Normative: vendor/nema/part15/<sha256>/part15.xml, PS3.15 Table E.1-1.
//     NEMA publishes the standard; this is the standard.
//   - Mirror:    vendor/innolitics/<short-sha>/confidentiality_profile_attributes.json.
//     A third-party parse of the same table, kept as the base row.
//
// The overlay is applied PER FIELD, not wholesale: for a tag PS3.15 publishes,
// PS3.15 supplies the attribute name, the Basic Profile action code, and the
// whole option-set row. A tag PS3.15 carries and the mirror does not is added.
// A tag the mirror carries and PS3.15 does not is KEPT, because PS3.15 retires
// rows rather than deleting them, so an absence is far more likely to be a parse
// gap here than a withdrawal there, and dropping one would turn an attribute the
// de-identifier acts on into one it silently keeps. That set is empty today; the
// generator prints its size on every run so the assumption stays observable.
//
// There is deliberately NO staleness clock. A date gate fires the day it is
// written, demands an action nobody can take on demand, and reds unrelated pull
// requests. "Has NEMA moved" is one content-comparing command in
// vendor/nema/README.md; what CI gates is byte-identical regen, offline.
//
// Output is deterministic (no wall-clock, sorted by tag, frozen literals). The
// byte-identical regen gate lives in .github/workflows/dictionary-regen.yml.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INNOLITICS_ROOT = join(REPO_ROOT, "vendor", "innolitics");
const NEMA_PART15_ROOT = join(REPO_ROOT, "vendor", "nema", "part15");
const NEMA_SHA_FILE = join(NEMA_PART15_ROOT, "SHA.txt");

// ----------------------------------------------------------------------------
// Closed unions -- must match src/dictionary/annex-e.ts exactly.
// ----------------------------------------------------------------------------

const ACTION_CODES = new Set([
  "D",
  "Z",
  "X",
  "K",
  "C",
  "U",
  "Z/D",
  "X/Z",
  "X/D",
  "X/Z/D",
  "X/Z/U*",
  "C/X",
]);

// Innolitics field name -> AnnexEOption name (PS3.15 Annex E Table E.1-1 columns).
// CleanPixelData (E.3.1) and CleanRecognizableVisual (E.3.2) are pixel-level options
// with no per-attribute overrides in Table E.1-1; they remain in the AnnexEOption
// union but never appear in the generated optionSet keys.
const INNOLITICS_FIELD_TO_OPTION: Readonly<Record<string, string>> = Object.freeze({
  cleanGraphOpt: "CleanGraphics",
  cleanStructContOpt: "CleanStructuredContent",
  cleanDescOpt: "CleanDescriptors",
  rtnLongFullDatesOpt: "RetainLongitudinalTemporal",
  // rtnLongModifDatesOpt collapsed into RetainLongitudinalTemporal -- see discovery doc.
  rtnPatCharsOpt: "RetainPatientCharacteristics",
  rtnDevIdOpt: "RetainDeviceIdentity",
  rtnUIDsOpt: "RetainUIDs",
  rtnSafePrivOpt: "RetainSafePrivate",
  rtnInstIdOpt: "RetainInstitutionIdentity",
});

// ----------------------------------------------------------------------------
// Shared shapes.
// ----------------------------------------------------------------------------

interface NormalizedEntry {
  readonly tag: string;
  readonly keyword: string;
  readonly basicProfile: string;
  readonly optionSet: ReadonlyArray<readonly [string, string]>;
}

function fail(message: string): never {
  console.error("generate-annex-e: " + message);
  process.exit(1);
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function sortPairs(pairs: Array<[string, string]>): Array<[string, string]> {
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs;
}

/** `[["A","X"]]` -> `A=X` -- stable, printable, comparable. */
function renderOptionSet(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs.length === 0 ? "{}" : pairs.map(([k, v]) => k + "=" + v).join(" ");
}

// ----------------------------------------------------------------------------
// Innolitics mirror (base rows).
// ----------------------------------------------------------------------------

interface RawInnoliticsEntry {
  readonly id: string;
  readonly tag: string;
  readonly name: string;
  readonly basicProfile?: string;
}

function readInnoliticsSha(): { full: string; short: string } {
  const shaPath = join(INNOLITICS_ROOT, "SHA.txt");
  let raw: string;
  try {
    raw = readFileSync(shaPath, "utf8").trim().split(/\s+/)[0] ?? "";
  } catch (err) {
    fail("cannot read " + shaPath + ": " + String(err));
  }
  if (!/^[0-9a-f]{40}$/i.test(raw)) {
    fail("vendor/innolitics/SHA.txt does not contain a 40-char hex SHA-1 (got: '" + raw + "')");
  }
  const full = raw.toLowerCase();
  return { full, short: full.slice(0, 7) };
}

function normalizeTag(rawId: string): string {
  if (typeof rawId !== "string") return "";
  if (rawId.includes(":")) return "";
  if (!/^[0-9a-f]{8}$/i.test(rawId)) return "";
  return rawId.toUpperCase();
}

function parseInnolitics(jsonText: string): NormalizedEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    fail("input JSON parse failed: " + String(err));
  }
  if (!Array.isArray(raw)) fail("expected top-level JSON array");

  const out: NormalizedEntry[] = [];
  for (const entry of raw as RawInnoliticsEntry[]) {
    if (entry === null || typeof entry !== "object") continue;
    const tag = normalizeTag(entry.id);
    if (tag.length === 0) continue;

    const basicProfile = entry.basicProfile;
    if (typeof basicProfile !== "string" || basicProfile.length === 0) {
      fail("entry " + entry.id + " (" + String(entry.name) + ") missing basicProfile");
    }
    if (!ACTION_CODES.has(basicProfile)) {
      fail("entry " + entry.id + " has unknown basicProfile action code '" + basicProfile + "'");
    }

    const optionPairs: Array<[string, string]> = [];
    for (const [innoField, optionName] of Object.entries(INNOLITICS_FIELD_TO_OPTION)) {
      const v = (entry as unknown as Record<string, unknown>)[innoField];
      if (typeof v !== "string" || v.length === 0) continue;
      if (!ACTION_CODES.has(v)) {
        fail("entry " + entry.id + " field " + innoField + " has unknown action code '" + v + "'");
      }
      optionPairs.push([optionName, v]);
    }

    out.push({
      tag,
      keyword: typeof entry.name === "string" ? entry.name : "",
      basicProfile,
      optionSet: sortPairs(optionPairs),
    });
  }

  const seen = new Set<string>();
  for (const e of out) {
    if (seen.has(e.tag)) fail("duplicate tag " + e.tag + " in the Innolitics mirror");
    seen.add(e.tag);
  }
  return out;
}

// ----------------------------------------------------------------------------
// NEMA PS3.15 DocBook reader (normative source for the action table).
//
// Table E.1-1 has fifteen columns, in this order:
//   Attribute Name | Tag | Retd. | In Std. Comp. IOD | Basic Prof. |
//   Rtn. Safe Priv. | Rtn. UIDs | Rtn. Dev. Id. | Rtn. Inst. Id. |
//   Rtn. Pat. Chars. | Rtn. Long. Full Dates | Rtn. Long. Modif. Dates |
//   Clean Desc. | Clean Struct. Cont. | Clean Graph.
// ----------------------------------------------------------------------------

/** The character the founder directive bans (U+2014), built from its code point
 *  on purpose: `scripts/check-no-emdash.sh` scans tracked files for the literal
 *  byte AND for the backslash-u escape, so a detector for it cannot spell it
 *  either way. A numeric entity in a future PS3.15 edition would decode to this
 *  character and land in a generated attribute name, so the check is real. */
const EM_DASH = String.fromCodePoint(0x2014);

const ANNEX_E_TABLE = "table_E.1-1";

/** Lower bound on Table E.1-1 rows. PS3.15 2026c has 656; a parse that silently
 *  matched a fraction of them must fail rather than quietly shrink the overlay. */
const NEMA_MIN_ROWS = 600;

/** Column order of Table E.1-1. Index 10 (`Rtn. Long. Full Dates`) supplies
 *  `RetainLongitudinalTemporal`; index 11 (`Rtn. Long. Modif. Dates`) is the
 *  second E.3.6 sub-option and is collapsed away, exactly as the Innolitics
 *  path did. Its divergence from index 10 is counted and printed. */
const NEMA_OPTION_COLUMNS: ReadonlyArray<readonly [number, string]> = [
  [5, "RetainSafePrivate"],
  [6, "RetainUIDs"],
  [7, "RetainDeviceIdentity"],
  [8, "RetainInstitutionIdentity"],
  [9, "RetainPatientCharacteristics"],
  [10, "RetainLongitudinalTemporal"],
  [12, "CleanDescriptors"],
  [13, "CleanStructuredContent"],
  [14, "CleanGraphics"],
];

const NEMA_COLUMN_COUNT = 15;
const NEMA_MODIFIED_DATES_COLUMN = 11;

/**
 * What each column of Table E.1-1 must be called, in order.
 *
 * Every index above is positional, and a positional index is only as trustworthy
 * as the header it assumes. A cell count of 15 catches an inserted or a dropped
 * column; it does NOT catch a REORDER, and a reorder is the change that would
 * silently read `Rtn. Pat. Chars.` as `Rtn. Long. Full Dates` and hand a caller
 * the wrong action code for an attribute. That is the exact failure every other
 * guard in this file exists to refuse, so it is refused here too, against the
 * document's own header row rather than against a comment.
 *
 * Compared with `startsWith`, not equality: the "Retd." and "In Std. Comp. IOD"
 * headers carry an `<olink/>` cross-reference that strips to a trailing
 * `(from )`, and a future edition retargeting that link is not a column move.
 * Any reorder still moves a label off its index and reds the run.
 */
const NEMA_HEADER_LABELS: readonly string[] = [
  "Attribute Name",
  "Tag",
  "Retd.",
  "In Std. Comp. IOD",
  "Basic Prof.",
  "Rtn. Safe Priv. Opt.",
  "Rtn. UIDs Opt.",
  "Rtn. Dev. Id. Opt.",
  "Rtn. Inst. Id. Opt.",
  "Rtn. Pat. Chars. Opt.",
  "Rtn. Long. Full Dates Opt.",
  "Rtn. Long. Modif. Dates Opt.",
  "Clean Desc. Opt.",
  "Clean Struct. Cont. Opt.",
  "Clean Graph. Opt.",
];

interface NemaTable {
  readonly entries: readonly NormalizedEntry[];
  /** Tag cells Table E.1-1 states as a family rather than one tag, kept verbatim
   *  for reporting. An exact-tag map cannot represent them. */
  readonly maskedTags: readonly string[];
  /** Rows where the two E.3.6 date sub-options disagree, hence rows the collapse
   *  to `Rtn. Long. Full Dates` loses information about. */
  readonly dateOptionDivergence: number;
}

function readNemaSha(): string {
  let raw: string;
  try {
    raw = readFileSync(NEMA_SHA_FILE, "utf8").trim().split(/\s+/)[0] ?? "";
  } catch (err) {
    fail("cannot read " + NEMA_SHA_FILE + ": " + String(err));
  }
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    fail("vendor/nema/part15/SHA.txt must contain a 64-char hex SHA-256 (got: '" + raw + "')");
  }
  return raw.toLowerCase();
}

/**
 * Read the pinned DocBook and prove it is the pinned bytes.
 *
 * The mirror is hashed only for the provenance header; here the hash is a
 * precondition. This table decides whether a patient identifier survives
 * `deidentify()`, so "the input was swapped and nobody noticed" is not an
 * acceptable outcome, and the check costs one hash of a file already being read.
 */
function readNemaPart15(pinnedSha: string): string {
  const path = join(NEMA_PART15_ROOT, pinnedSha, "part15.xml");
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch (err) {
    fail("cannot read " + path + ": " + String(err));
  }
  const actual = sha256(buf);
  if (actual !== pinnedSha) {
    fail(
      "vendor/nema/part15 pin mismatch:\n  pinned:   " +
        pinnedSha +
        "\n  on disk:  " +
        actual +
        "\n  file:     " +
        path +
        "\nRe-fetch the DocBook and update SHA.txt, or restore the pinned bytes.",
    );
  }
  return buf.toString("utf8");
}

/** Pull the edition out of `<subtitle>DICOM PS3.15 2026c - Security ...</subtitle>`. */
function nemaEdition(xml: string): string {
  const m = /<subtitle>\s*DICOM PS3\.15 ([0-9]{4}[a-z]?) - [^<]*<\/subtitle>/.exec(xml);
  if (!m?.[1]) {
    fail(
      "part15.xml: cannot find the `<subtitle>DICOM PS3.15 <edition> - ...</subtitle>` line. " +
        "Refusing to generate from a document that does not identify itself as PS3.15.",
    );
  }
  return m[1];
}

/** Slice out one `<table>...</table>` by `xml:id`, counting nesting rather than
 *  taking the first closing tag. */
function extractTable(xml: string, id: string): string {
  const marker = 'xml:id="' + id + '"';
  const at = xml.indexOf(marker);
  if (at < 0) fail("part15.xml: no element carries " + marker);
  const open = xml.lastIndexOf("<table", at);
  if (open < 0) fail("part15.xml: " + marker + " is not on a <table> element");
  // The marker must live in that opening tag, not in some later element the
  // backward search happened to skip over. A wrong `open` slices a wrong table.
  const openTag = xml.slice(open, xml.indexOf(">", open) + 1);
  if (!openTag.includes(marker)) {
    fail("part15.xml: " + marker + " is not inside the nearest preceding <table ...>");
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
      if (m.index === open) fail("part15.xml: " + id + " is a self-closing <table/>");
    } else {
      depth += 1;
    }
  }
  fail("part15.xml: unterminated <table> for " + id);
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
        return fail("part15.xml (" + where + "): unrecognized entity " + whole);
    }
  });
}

/**
 * Cell markup to text.
 *
 * Stripped to a fixpoint rather than in one pass: a single pass can leave a
 * residue that reassembles into another tag. This is a build-time reader of
 * SHA-256-pinned normative bytes and not an HTML sink, so the injection framing
 * does not apply, but the underlying failure does -- residue here would become
 * an attribute name in a de-identification audit report. Strip until stable,
 * then refuse anything still carrying markup. The check runs BEFORE entity
 * decoding, so a literal `&lt;` cannot trip it.
 *
 * ZERO WIDTH SPACE is dropped for the same reason as in the PS3.6 reader: it is
 * a line-break hint, not content.
 */
function cellText(markup: string, where: string): string {
  let withoutTags = markup;
  for (;;) {
    const next = withoutTags.replace(/<[^<>]*>/g, "");
    if (next === withoutTags) break;
    withoutTags = next;
  }
  if (/[<>]/.test(withoutTags)) {
    fail(
      "part15.xml (" +
        where +
        "): cell still carries markup after stripping: " +
        JSON.stringify(withoutTags),
    );
  }
  return decodeEntities(withoutTags, where)
    .replace(/\u200B/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Read the action code out of one option column, strictly.
 *
 * An empty cell means "no override for this option" and is the common case. A
 * cell holding anything that is not a Table E.1-1a action code is a parse gap,
 * and a parse gap here silently downgrades a removal, so it throws.
 */
function parseActionCell(raw: string, where: string): string | undefined {
  if (raw === "") return undefined;
  if (!ACTION_CODES.has(raw)) {
    fail("part15.xml (" + where + "): unknown action code " + JSON.stringify(raw));
  }
  return raw;
}

/**
 * Parse Table E.1-1 into normative entries.
 *
 * Tag cells that name a family rather than one attribute -- the repeating-group
 * `(50xx,xxxx)` / `(60xx,3000)` / `(60xx,4000)` rows and the "(gggg,eeee) where
 * gggg is odd" private-attribute row -- cannot be keys in an exact-tag map. They
 * are collected and printed rather than dropped in silence: private attributes
 * are removed by `deidentify()` through a separate path, and the repeating-group
 * rows are a known gap that this generator does not close. Any OTHER unparseable
 * tag cell is a parser bug and throws.
 */
function parseNemaAnnexE(xml: string): NemaTable {
  const table = extractTable(xml, ANNEX_E_TABLE);

  // Collect EVERY `<tbody>`. PS3.15 uses one today, but slicing to the first
  // `</tbody>` and counting `<tr>` opens on that already-truncated slice cannot
  // see rows past it, so a table split across two bodies would lose the second
  // in silence. (PS3.6 Table 6-1 did exactly that, and cost 5,102 rows.)
  const bodies: string[] = [];
  const bodyScan = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g;
  let bm: RegExpExecArray | null;
  while ((bm = bodyScan.exec(table)) !== null) bodies.push(bm[1] ?? "");
  if (bodies.length === 0) fail("part15.xml: " + ANNEX_E_TABLE + " has no <tbody>");
  const bodyOpens = (table.match(/<tbody\b/g) ?? []).length;
  if (bodyOpens !== bodies.length) {
    fail(
      "part15.xml: " +
        ANNEX_E_TABLE +
        " has " +
        String(bodyOpens) +
        " <tbody> opens but " +
        String(bodies.length) +
        " closed sections",
    );
  }

  const rows: string[] = [];
  for (const body of bodies) {
    rows.push(...(body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? []));
  }
  if (rows.length === 0) fail("part15.xml: " + ANNEX_E_TABLE + " has no <tr> rows");

  // Every `<tr>` in the table must be accounted for as a body row we matched or
  // a header row. That covers all three silent-drop shapes at once: a row the
  // matcher does not recognize, a row in a second `<tbody>`, and a row sitting
  // outside any `<tbody>` at all.
  const headRows = (table.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/g) ?? []).reduce(
    (n, head) => n + (head.match(/<tr\b/g) ?? []).length,
    0,
  );
  // Prove the columns are where the indices above say they are, before reading
  // a single action code by index.
  const heads = table.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/g) ?? [];
  if (heads.length !== 1) {
    fail(
      "part15.xml: " +
        ANNEX_E_TABLE +
        " has " +
        String(heads.length) +
        " <thead> sections, expected exactly 1",
    );
  }
  const headerCells = (heads[0]?.match(/<th\b[^>]*?(?:\/>|>[\s\S]*?<\/th>)/g) ?? []).map((c) =>
    cellText(c, ANNEX_E_TABLE + " header"),
  );
  if (headerCells.length !== NEMA_COLUMN_COUNT) {
    fail(
      "part15.xml: " +
        ANNEX_E_TABLE +
        " header has " +
        String(headerCells.length) +
        " cells, expected " +
        String(NEMA_COLUMN_COUNT) +
        ": " +
        JSON.stringify(headerCells),
    );
  }
  NEMA_HEADER_LABELS.forEach((expected, i) => {
    const actual = headerCells[i] ?? "";
    if (!actual.startsWith(expected)) {
      fail(
        "part15.xml: " +
          ANNEX_E_TABLE +
          " column " +
          String(i) +
          " is " +
          JSON.stringify(actual) +
          ", expected one starting " +
          JSON.stringify(expected) +
          ". The table's columns have moved; fix the column indices in this file " +
          "rather than relaxing this check.",
      );
    }
  });

  const trOpens = (table.match(/<tr\b/g) ?? []).length;
  if (trOpens !== rows.length + headRows) {
    fail(
      "part15.xml: " +
        ANNEX_E_TABLE +
        " has " +
        String(trOpens) +
        " <tr> opens but matched " +
        String(rows.length) +
        " body rows plus " +
        String(headRows) +
        " header rows",
    );
  }

  const entries: NormalizedEntry[] = [];
  const maskedTags: string[] = [];
  const seen = new Set<string>();
  let dateOptionDivergence = 0;

  for (const row of rows) {
    const cells = (row.match(/<td\b[^>]*?(?:\/>|>[\s\S]*?<\/td>)/g) ?? []).map((c) =>
      cellText(c, ANNEX_E_TABLE),
    );
    if (cells.length !== NEMA_COLUMN_COUNT) {
      fail(
        "part15.xml: " +
          ANNEX_E_TABLE +
          " row has " +
          String(cells.length) +
          " cells, expected " +
          String(NEMA_COLUMN_COUNT) +
          ": " +
          JSON.stringify(cells),
      );
    }

    const name = cells[0] ?? "";
    const tagCell = cells[1] ?? "";
    const where = ANNEX_E_TABLE + " " + tagCell;

    if (name.includes(EM_DASH)) {
      fail("part15.xml: " + where + " attribute name carries a banned em dash: " + name);
    }

    const concrete = /^\(([0-9A-Fa-f]{4}),([0-9A-Fa-f]{4})\)$/.exec(tagCell);
    if (!concrete) {
      // A family row, or a parser bug. Only the two shapes PS3.15 actually uses
      // are tolerated; anything else means the tag column moved and the fix is
      // the parser, not a wider regex.
      const masked =
        /^\([0-9A-Fa-fxX]{4},[0-9A-Fa-fxX]{4}\)$/.test(tagCell) ||
        /^\(gggg,eeee\) where gggg is odd$/.test(tagCell);
      if (!masked) {
        fail("part15.xml: " + where + " has an unparseable tag cell " + JSON.stringify(tagCell));
      }
      maskedTags.push(tagCell + " [" + name + "]");
      continue;
    }

    const tag = ((concrete[1] ?? "") + (concrete[2] ?? "")).toUpperCase();
    if (seen.has(tag)) fail("part15.xml: duplicate tag " + tagCell + " in " + ANNEX_E_TABLE);
    seen.add(tag);

    const basicProfile = parseActionCell(cells[4] ?? "", where + " Basic Prof.");
    if (basicProfile === undefined) {
      fail("part15.xml: " + where + " has an empty Basic Prof. cell");
    }

    const optionPairs: Array<[string, string]> = [];
    for (const [index, option] of NEMA_OPTION_COLUMNS) {
      const code = parseActionCell(cells[index] ?? "", where + " " + option);
      if (code !== undefined) optionPairs.push([option, code]);
    }

    // The second E.3.6 sub-option. Validated like every other column so a shape
    // change cannot hide in the one column the emitter discards, then compared
    // against the full-dates column that `RetainLongitudinalTemporal` carries.
    const modifiedDates = parseActionCell(
      cells[NEMA_MODIFIED_DATES_COLUMN] ?? "",
      where + " Rtn. Long. Modif. Dates",
    );
    const fullDates = parseActionCell(cells[10] ?? "", where + " Rtn. Long. Full Dates");
    if (modifiedDates !== fullDates) dateOptionDivergence += 1;

    entries.push({ tag, keyword: name, basicProfile, optionSet: sortPairs(optionPairs) });
  }

  if (entries.length < NEMA_MIN_ROWS) {
    fail(
      "part15.xml: parsed only " +
        String(entries.length) +
        " Table E.1-1 rows, expected at least " +
        String(NEMA_MIN_ROWS) +
        ". The DocBook table shape has probably changed; fix the parser rather than lowering this.",
    );
  }

  return { entries, maskedTags, dateOptionDivergence };
}

// ----------------------------------------------------------------------------
// Per-field overlay.
// ----------------------------------------------------------------------------

interface OverlayStats {
  readonly shared: number;
  readonly added: number;
  readonly mirrorOnly: readonly string[];
  readonly overriddenName: number;
  readonly basicProfileOverrides: readonly string[];
  readonly optionSetOverrides: readonly string[];
}

function overlay(
  mirror: ReadonlyArray<NormalizedEntry>,
  normative: ReadonlyArray<NormalizedEntry>,
): { entries: NormalizedEntry[]; stats: OverlayStats } {
  const byTag = new Map<string, NormalizedEntry>();
  for (const n of normative) byTag.set(n.tag, n);

  const entries: NormalizedEntry[] = [];
  const consumed = new Set<string>();
  const mirrorOnly: string[] = [];
  const basicProfileOverrides: string[] = [];
  const optionSetOverrides: string[] = [];
  let overriddenName = 0;
  let shared = 0;

  for (const m of mirror) {
    const n = byTag.get(m.tag);
    if (!n) {
      // PS3.15 retires rather than deletes. Keep it.
      mirrorOnly.push(m.tag);
      entries.push(m);
      continue;
    }
    consumed.add(m.tag);
    shared += 1;
    if (m.keyword !== n.keyword) overriddenName += 1;
    if (m.basicProfile !== n.basicProfile) {
      basicProfileOverrides.push(m.tag + ": " + m.basicProfile + " -> " + n.basicProfile);
    }
    const mOpts = renderOptionSet(m.optionSet);
    const nOpts = renderOptionSet(n.optionSet);
    if (mOpts !== nOpts) {
      optionSetOverrides.push(m.tag + ": " + mOpts + " -> " + nOpts);
    }
    entries.push(n);
  }

  let added = 0;
  for (const n of normative) {
    if (consumed.has(n.tag)) continue;
    added += 1;
    entries.push(n);
  }

  entries.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  return {
    entries,
    stats: {
      shared,
      added,
      mirrorOnly: mirrorOnly.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
      overriddenName,
      basicProfileOverrides,
      optionSetOverrides,
    },
  };
}

// ----------------------------------------------------------------------------
// Output emission.
// ----------------------------------------------------------------------------

function escapeJsString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    const code = s.charCodeAt(i);
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20) out += "\\u" + code.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out;
}

interface Provenance {
  readonly innoliticsSha: string;
  readonly innoliticsInputSha: string;
  readonly nemaEdition: string;
  readonly nemaSha: string;
}

function emit(entries: ReadonlyArray<NormalizedEntry>, p: Provenance): string {
  const lines: string[] = [];
  lines.push("/* eslint-disable */");
  lines.push("// AUTO-GENERATED by scripts/generate-annex-e.ts -- DO NOT EDIT BY HAND.");
  lines.push("// Regen: pnpm gen:annex-e");
  lines.push("//");
  lines.push("// Normative source: NEMA DICOM PS3.15 " + p.nemaEdition + " DocBook, Table E.1-1.");
  lines.push("//   vendor/nema/part15/<sha>/part15.xml -> " + p.nemaSha);
  lines.push("//   PS3.15 wins per field over the Innolitics mirror on every tag it publishes.");
  lines.push("// Mirror: innolitics/dicom-standard@" + p.innoliticsSha.slice(0, 7));
  lines.push(
    "//   vendor/innolitics/<sha>/confidentiality_profile_attributes.json -> " +
      p.innoliticsInputSha,
  );
  lines.push("//");
  lines.push("// PS3.15 Annex E attribute-action table -- Basic Profile + 9 metadata-affecting");
  lines.push("// retention/clean option columns from Table E.1-1. Pixel-level options (E.3.1");
  lines.push("// CleanPixelData, E.3.2 CleanRecognizableVisual) are not represented per-attribute");
  lines.push("// here; they are enforced at the pixel-decode layer.");
  lines.push("");
  lines.push('import type { AnnexEAction } from "../annex-e.js";');
  lines.push("");
  lines.push("export const ANNEX_E: Readonly<Record<string, AnnexEAction>> = Object.freeze({");
  for (const e of entries) {
    const optionSetEntries = e.optionSet.map(
      ([k, v]) => '"' + escapeJsString(k) + '": "' + escapeJsString(v) + '"',
    );
    const optionSetLiteral =
      optionSetEntries.length === 0
        ? "Object.freeze({})"
        : "Object.freeze({ " + optionSetEntries.join(", ") + " })";
    lines.push(
      '  "' +
        e.tag +
        '": Object.freeze({ tag: "' +
        e.tag +
        '", keyword: "' +
        escapeJsString(e.keyword) +
        '", basicProfile: "' +
        escapeJsString(e.basicProfile) +
        '", optionSet: ' +
        optionSetLiteral +
        " }),",
    );
  }
  lines.push("});");
  lines.push("");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Main.
// ----------------------------------------------------------------------------

function main(): void {
  const inno = readInnoliticsSha();
  const innoPath = join(INNOLITICS_ROOT, inno.short, "confidentiality_profile_attributes.json");
  console.log("[gen:annex-e] mirror: " + innoPath);
  let innoBuf: Buffer;
  try {
    innoBuf = readFileSync(innoPath);
  } catch (err) {
    fail("cannot read mirror input " + innoPath + ": " + String(err));
  }
  const mirror = parseInnolitics(innoBuf.toString("utf8"));
  console.log("[gen:annex-e] mirror rows: " + String(mirror.length));

  const nemaSha = readNemaSha();
  const nemaXml = readNemaPart15(nemaSha);
  const edition = nemaEdition(nemaXml);
  console.log(
    "[gen:annex-e] PS3.15 edition: " + edition + " (sha256 " + nemaSha.slice(0, 12) + ")",
  );
  const nema = parseNemaAnnexE(nemaXml);
  console.log("[gen:annex-e] normative Table E.1-1 rows: " + String(nema.entries.length));

  const { entries, stats } = overlay(mirror, nema.entries);

  // Print the overlay, so a re-pin shows exactly what the normative source moved
  // rather than burying it in a 600-line diff.
  console.log(
    "[gen:annex-e] overlay vs PS3.15 " +
      edition +
      ": " +
      String(stats.shared) +
      " shared, " +
      String(stats.added) +
      " added, " +
      String(stats.mirrorOnly.length) +
      " mirror-only kept",
  );
  console.log(
    "[gen:annex-e] fields overridden by PS3.15 - attribute name: " +
      String(stats.overriddenName) +
      ", basic profile: " +
      String(stats.basicProfileOverrides.length) +
      ", option set: " +
      String(stats.optionSetOverrides.length),
  );
  // Every action-code override is printed individually. A changed action code is
  // the one difference that decides whether an identifier survives the call.
  for (const line of stats.basicProfileOverrides) {
    console.log("[gen:annex-e]   basic-profile override " + line);
  }
  for (const line of stats.optionSetOverrides) {
    console.log("[gen:annex-e]   option-set override " + line);
  }
  if (stats.mirrorOnly.length > 0) {
    console.log("[gen:annex-e]   mirror-only: " + stats.mirrorOnly.join(", "));
  }
  // Both are assumptions this generator makes on purpose. Printed every run so
  // they stay observable rather than assumed.
  console.log(
    "[gen:annex-e] family tag rows not representable as exact tags: " +
      String(nema.maskedTags.length),
  );
  for (const t of nema.maskedTags) {
    console.log("[gen:annex-e]   family row " + t);
  }
  console.log(
    "[gen:annex-e] E.3.6 rows where full-dates and modified-dates columns differ: " +
      String(nema.dateOptionDivergence) +
      " (RetainLongitudinalTemporal carries the full-dates column)",
  );

  const outDir = join(REPO_ROOT, "src", "dictionary", "generated");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "annex-e.ts");
  writeFileSync(
    outPath,
    emit(entries, {
      innoliticsSha: inno.full,
      innoliticsInputSha: sha256(innoBuf),
      nemaEdition: edition,
      nemaSha,
    }),
    "utf8",
  );

  console.log("[gen:annex-e] done - wrote " + String(entries.length) + " entries to " + outPath);
}

main();

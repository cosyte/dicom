import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { extractRunnableSnippets } from "@cosyte/vitest-config/snippets";

/**
 * Structural conformance gate for `docs-content/`, the narrative bundle
 * `scripts/build-docs-artifacts.sh` tars into the release artifact that
 * `cosyte/docs` ingests.
 *
 * The sibling `docs-content.test.ts` gate proves the documented CODE still runs.
 * This one proves the documented SITE still holds together: every public export
 * reaches a page or a reasoned exemption, every sidebar id resolves to exactly
 * one page and every page is reached by exactly one id, page frontmatter is
 * uniform, page order has a single source, no two entries share a name (a
 * category label included, since it renders as an entry of its own), the
 * "do not over-trust" material has exactly one owning page, no page ships empty
 * or with entirely unexecuted code, and no page states a release version, a
 * count of the warning or fatal code registries, or a Node engine floor the
 * package does not declare.
 *
 * Where the two gates overlap - what counts as a fenced TypeScript block, and
 * which blocks are executed - this one asks the runner (`extractRunnableSnippets`)
 * rather than deciding again, so the set of blocks the structural rule judges
 * cannot drift from the set that actually runs.
 *
 * Every rule below is a pure function over strings plus one assertion against
 * the live tree, and each pure function carries its own synthetic red case. A
 * gate that only ever sees a green tree cannot show that it fires, and this
 * repository's recurring failure mode is a check that passes for the wrong
 * reason.
 *
 * Two numerals in particular must never be written into a page: a
 * `@cosyte/dicom` release version (`npm view @cosyte/dicom version` is the only
 * source of truth) and a count of the warning or fatal codes (the frozen
 * `WARNING_CODES` / `FATAL_CODES` registries are). Both go stale in silence, and
 * both have been corrected in this repository more than once and then deleted
 * rather than corrected again.
 */

const root = join(import.meta.dirname, "..");
const DOCS_DIR = join(root, "docs-content");
const ENTRY = join(root, "src", "index.ts");
const SIDEBARS_FILE = join(DOCS_DIR, "sidebars.json");
const EXEMPTIONS_FILE = join(root, "docs-content-exemptions.json");
const PACKAGE_FILE = join(root, "package.json");

/** Frontmatter keys every page carries, and the only ones any page carries. */
const REQUIRED_FRONTMATTER_KEYS = ["id", "title", "sidebar_label"] as const;

/**
 * The per-page order declaration. `sidebars.json` fixes the order explicitly, so
 * a second, disagreeing source of it is what this gate exists to refuse.
 */
const ORDER_KEY = "sidebar_position";

/** The page that owns the "do not over-trust" material, by file stem. */
const LIMITATIONS_STEM = "limitations";

// ---------------------------------------------------------------------------
// Page model
// ---------------------------------------------------------------------------

interface Page {
  /** File name, e.g. `intro.md`. */
  readonly file: string;
  /** File name without its extension, e.g. `intro`. */
  readonly stem: string;
  /** Frontmatter keys in declaration order, mapped to their raw scalar values. */
  readonly frontmatter: ReadonlyMap<string, string>;
  /** Everything after the closing frontmatter fence. */
  readonly body: string;
}

/**
 * Split a page into its frontmatter map and its body. Deliberately strict: a
 * page whose frontmatter is missing, unterminated, or not a flat `key: value`
 * block throws rather than being silently read as an empty map, because an
 * unparsed page would pass every rule below by vacancy.
 */
export function parsePage(file: string, text: string): Page {
  const stem = file.replace(/\.md$/u, "");
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    throw new Error(`${file}: no opening frontmatter fence`);
  }
  const closing = lines.indexOf("---", 1);
  if (closing === -1) {
    throw new Error(`${file}: unterminated frontmatter`);
  }
  const frontmatter = new Map<string, string>();
  for (let i = 1; i < closing; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/u.exec(line);
    if (match === null) {
      throw new Error(`${file}: frontmatter line ${String(i + 1)} is not "key: value": ${line}`);
    }
    const key = match[1] ?? "";
    // A YAML scalar carrying a colon is quoted; the quotes are syntax, not value.
    const value = (match[2] ?? "").trim().replace(/^"(.*)"$/su, "$1");
    if (frontmatter.has(key)) {
      throw new Error(`${file}: duplicate frontmatter key "${key}"`);
    }
    frontmatter.set(key, value);
  }
  return { file, stem, frontmatter, body: lines.slice(closing + 1).join("\n") };
}

function loadPages(): readonly Page[] {
  return readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parsePage(f, readFileSync(join(DOCS_DIR, f), "utf8")));
}

// ---------------------------------------------------------------------------
// Public export surface
// ---------------------------------------------------------------------------

/** Code-unit order: locale-independent, so a report reads the same everywhere. */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** True when a statement carries the `export` modifier. */
function isExported(statement: ts.Statement): boolean {
  if (!ts.canHaveModifiers(statement)) return false;
  return (ts.getModifiers(statement) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

/**
 * The names one `export`-modified declaration introduces. A form this function
 * does not model throws: a declaration that is cheaper to skip than to model is
 * exactly how an export ships undocumented behind a green suite.
 */
function declaredNames(fileName: string, statement: ts.Statement): readonly string[] {
  const kind = ts.SyntaxKind[statement.kind];
  const unmodelled = (detail: string): Error =>
    new Error(`${fileName}: exported ${kind} cannot be enumerated (${detail}); name the exports`);

  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((declaration) => {
      if (!ts.isIdentifier(declaration.name)) throw unmodelled("binding pattern");
      return declaration.name.text;
    });
  }
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    const name = statement.name;
    if (name === undefined || !ts.isIdentifier(name)) throw unmodelled("no declared identifier");
    return [name.text];
  }
  throw unmodelled("unmodelled declaration form");
}

/**
 * Every name the package entry point exports, values and types alike, read off
 * the entry point with the TypeScript parser rather than a regex. Both halves of
 * the surface count: the re-export forms a barrel is made of (`export { a } from
 * "..."`, `export * as N from "..."`) and every form the entry point declares
 * and exports itself (`export const`, `export function`, `export class`,
 * `export type`, `export interface`, `export enum`, `export namespace`).
 *
 * An export form this function does not model throws instead of contributing
 * nothing, so the gate cannot silently narrow the surface it is checking. That
 * property is what the rule is worth: `src/index.ts` is a pure barrel today, so
 * a walker that saw re-exports only would be green by accident of style, and the
 * first `export const` added to the entry point would ship undocumented.
 *
 * Reported re-exports first, then the entry point's own declarations, each group
 * in code-unit order.
 */
export function exportedNames(fileName: string, source: string): readonly string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);
  const reexported: string[] = [];
  const declared: string[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause === undefined) {
        throw new Error(
          `${fileName}: bare "export * from" re-export cannot be enumerated; name the exports`,
        );
      }
      if (ts.isNamespaceExport(clause)) {
        reexported.push(clause.name.text);
        continue;
      }
      for (const element of clause.elements) reexported.push(element.name.text);
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      throw new Error(
        `${fileName}: a default export carries no name to document; name the exports`,
      );
    }
    if (!isExported(statement)) continue;
    declared.push(...declaredNames(fileName, statement));
  }
  return [...reexported.sort(byCodeUnit), ...declared.sort(byCodeUnit)];
}

/** An export deliberately left out of the narrative docs, with the reason why. */
interface Exemption {
  readonly name: string;
  readonly reason: string;
}

/**
 * Read the committed exemption list. A malformed file throws: an exemption list
 * that fails open would excuse every undocumented export at once.
 */
export function parseExemptions(source: string): readonly Exemption[] {
  const parsed: unknown = JSON.parse(source);
  if (typeof parsed !== "object" || parsed === null || !("exemptions" in parsed)) {
    throw new Error('exemption file must be an object with an "exemptions" array');
  }
  const list: unknown = parsed.exemptions;
  if (!Array.isArray(list)) {
    throw new Error('"exemptions" must be an array');
  }
  return list.map((entry: unknown, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`exemption ${String(index)} is not an object`);
    }
    const name: unknown = (entry as { name?: unknown }).name;
    const reason: unknown = (entry as { reason?: unknown }).reason;
    if (typeof name !== "string" || name === "") {
      throw new Error(`exemption ${String(index)} has no "name"`);
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error(`exemption "${name}" has no "reason"`);
    }
    return { name, reason };
  });
}

/** Exported names that appear on no page, minus the ones an exemption excuses. */
export function findUndocumentedExports(
  names: readonly string[],
  corpus: string,
  exempt: readonly string[],
): readonly string[] {
  const excused = new Set(exempt);
  return names.filter(
    (name) => !excused.has(name) && !new RegExp(`\\b${name}\\b`, "u").test(corpus),
  );
}

/** Exemptions naming something the entry point no longer exports. */
export function findStaleExemptions(
  names: readonly string[],
  exempt: readonly string[],
): readonly string[] {
  const exported = new Set(names);
  return exempt.filter((name) => !exported.has(name));
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/**
 * Every document id the sidebar declares, in declaration order, including
 * repeats. The file is a Docusaurus sidebar: a map of sidebar name to item
 * list, where an item is a bare doc id, a `{ type: "doc", id }` entry, or a
 * category whose own `items` nest. An entry shape this walker does not model
 * throws rather than being skipped, so an id can never go unchecked.
 */
export function sidebarIds(source: string): readonly string[] {
  const parsed: unknown = JSON.parse(source);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("sidebars.json must be a map of sidebar name to item list");
  }
  const ids: string[] = [];
  const walkItem = (node: unknown): void => {
    if (typeof node === "string") {
      ids.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walkItem(child);
      return;
    }
    if (typeof node === "object" && node !== null) {
      const record = node as Record<string, unknown>;
      const id: unknown = record["id"];
      if (record["type"] === "doc" && typeof id === "string") ids.push(id);
      if ("items" in record) walkItem(record["items"]);
      if (record["type"] === "category" || record["type"] === "doc" || record["type"] === "link") {
        return;
      }
    }
    throw new Error(`sidebars.json: unrecognized entry ${JSON.stringify(node)}`);
  };
  for (const list of Object.values(parsed as Record<string, unknown>)) walkItem(list);
  return ids;
}

/**
 * Every category label the sidebar declares, in declaration order. A category is
 * a rendered entry with a name of its own, so a category whose label repeats the
 * label of a page inside it renders that name twice down one branch of the tree.
 *
 * An entry shape this walker does not model is refused by {@link sidebarIds},
 * which parses the same file and throws on one, so nothing goes unchecked by
 * being skipped here.
 */
export function sidebarCategoryLabels(source: string): readonly string[] {
  const parsed: unknown = JSON.parse(source);
  const labels: string[] = [];
  const walkItem = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walkItem(child);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const label: unknown = record["label"];
    if (record["type"] === "category" && typeof label === "string") labels.push(label);
    if ("items" in record) walkItem(record["items"]);
  };
  for (const list of Object.values(parsed as Record<string, unknown>)) walkItem(list);
  return labels;
}

/** Values that occur more than once, each reported once, in first-seen order. */
export function findDuplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  return [...duplicated];
}

// ---------------------------------------------------------------------------
// Fenced code blocks
// ---------------------------------------------------------------------------

interface Fence {
  /** The info string after the opening marker, e.g. `ts runnable throws`. */
  readonly info: string;
  /** 1-based line of the opening marker, within the body it was read from. */
  readonly line: number;
}

/**
 * The fence grammar `extractRunnableSnippets` opens on: three or more backticks
 * or tildes, at any indentation. A code block indented under a list item and a
 * `~~~` block are both real blocks it extracts and runs.
 */
const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*(.*)$/u;

/** Its closing grammar: the same marker character, no shorter, same indent. */
const FENCE_CLOSE = /^(\s*)(`{3,}|~{3,})\s*$/u;

/**
 * Every fenced block on a page, in order, with its info string.
 *
 * The runner extracts only the blocks it will execute, so enumerating the rest
 * cannot be delegated to it; its grammar is mirrored here instead, and the
 * mirror is pinned by "agrees with the doc-snippet runner about which blocks it
 * executes" below, which compares this scanner's executed blocks to the runner's
 * own extraction, page by page and line by line. Classification is delegated
 * outright: {@link isTypeScript} and {@link isExecuted} ask the runner.
 *
 * A structural gate that reads a NARROWER set of fences than the gate that
 * executes them decides criterion 13 on a different set of blocks than the one
 * that runs: a page whose only TypeScript is indented would pass while violating
 * it, and a page whose only executed block is indented would be reported
 * unverified while the runner was running it.
 */
export function fences(body: string): readonly Fence[] {
  const lines = body.split(/\r?\n/u);
  const found: Fence[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i] ?? "");
    if (open === null) {
      i += 1;
      continue;
    }
    const indent = open[1] ?? "";
    const marker = open[2] ?? "";
    found.push({ info: (open[3] ?? "").trim(), line: i + 1 });
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      const close = FENCE_CLOSE.exec(lines[j] ?? "");
      const marks = close?.[2] ?? "";
      if (
        close !== null &&
        marks[0] === marker[0] &&
        marks.length >= marker.length &&
        (close[1] ?? "").length === indent.length
      ) {
        closed = true;
        break;
      }
      j += 1;
    }
    i = closed ? j + 1 : j;
  }
  return found;
}

/** The opt-in tag the doc-snippet runner executes on, its own default. */
const RUNNABLE_TAG = "runnable";

/**
 * Ask the runner itself whether it would extract a block carrying this info
 * string, by handing it a one-block document. Both classifiers below are that
 * question, so the executable language set and the placement of the opt-in tag
 * are read off the runner rather than restated here, where they would drift:
 * the runner takes `ts`, `typescript` and `tsx`, and accepts `runnable`
 * anywhere in the info string rather than first.
 */
function runnerExtracts(info: string): boolean {
  return extractRunnableSnippets(["```" + info, "```", ""].join("\n")).length === 1;
}

/** A TypeScript block: one the runner would execute if it were tagged runnable. */
function isTypeScript(fence: Fence): boolean {
  return runnerExtracts(`${fence.info} ${RUNNABLE_TAG}`);
}

/** An EXECUTED block: one the runner extracts and runs as it stands. */
function isExecuted(fence: Fence): boolean {
  return runnerExtracts(fence.info);
}

// ---------------------------------------------------------------------------
// Numerals that go stale in silence
// ---------------------------------------------------------------------------

/**
 * Spans that look like a dotted version but are a citation of the standard: a
 * PS3 part, a section or table number, a DICOM UID (four or more components),
 * or a NEMA edition marker. Masked before the version scan so a spec citation
 * is never reported as a release.
 */
const CITATION_PATTERNS: readonly RegExp[] = [
  /PS3\.\d+(?:-\d{4})?/gu,
  /§\s?[0-9A-Z][-0-9A-Za-z.]*/gu,
  /\b(?:[Ss]ection|Table|Annex|Figure|Part)\s+[0-9A-Z][-0-9A-Za-z.]*/gu,
  /\b\d+(?:\.\d+){3,}\b/gu,
  /\b20\d{2}[a-z]\b/gu,
];

/** A release of this package: `1.2.3`, `v1.2.3`, `1.2.3-rc.1`. */
const RELEASE_VERSION = /(?<![\w.])v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?(?![\d.])/gu;

function mask(text: string, patterns: readonly RegExp[]): string {
  let masked = text;
  for (const pattern of patterns) {
    masked = masked.replace(pattern, (found) => " ".repeat(found.length));
  }
  return masked;
}

/** Every `@cosyte/dicom` release version a page names. */
export function findVersionMentions(text: string): readonly string[] {
  return [...mask(text, CITATION_PATTERNS).matchAll(RELEASE_VERSION)].map((m) => m[0]);
}

/**
 * Spans whose digits belong to a term rather than to a count: the tolerance
 * tiers, Part 10, a PS3 part or section, a `(gggg,eeee)` tag, and any code span
 * (an identifier, not prose). Masked before the code-count scan.
 */
const NON_COUNT_PATTERNS: readonly RegExp[] = [
  /`[^`]*`/gu,
  /\bTier-\d\b/gu,
  /\bPart\s+10\b/gu,
  /PS3\.\d+(?:-\d{4})?/gu,
  /§\s?[0-9A-Z][-0-9A-Za-z.]*/gu,
  /\b(?:[Ss]ection|Table|Annex|Figure)\s+[0-9A-Z][-0-9A-Za-z.]*/gu,
  /\(\s?[0-9A-Fa-fx]{4},[0-9A-Fa-fx]{4}\s?\)/gu,
];

const CARDINAL = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d{1,4})";
const CODE_QUALIFIER =
  "(?:unrecoverable|structural|fatal|warning|tolerated|distinct|separate|different|stable|remaining|other|new)";
const CODE_NOUN = "(?:codes?|conditions?|errors?|warnings?|fatals?)";
const CODE_COUNT = new RegExp(
  `\\b${CARDINAL}\\b(?:\\s+${CODE_QUALIFIER}\\b){0,3}\\s+${CODE_NOUN}\\b`,
  "giu",
);

/**
 * Every literal count of the warning or fatal code registries a page states.
 * Markdown emphasis is stripped first so `**four** fatal codes` reads the same
 * as `four fatal codes`.
 */
export function findCodeCountMentions(text: string): readonly string[] {
  const flattened = mask(text, NON_COUNT_PATTERNS).replace(/[*_]/gu, " ");
  return [...flattened.replace(/\s+/gu, " ").matchAll(CODE_COUNT)].map((m) => m[0]);
}

/** Every Node engine floor major version a page states. */
export function findNodeFloors(text: string): readonly string[] {
  const patterns: readonly RegExp[] = [
    /Node(?:\.js)?\s*(?:>=|&gt;=)\s*(\d+)/gu,
    /Node(?:\.js)?\s+(\d+)\+/gu,
  ];
  const floors: string[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const major = match[1];
      if (major !== undefined) floors.push(major);
    }
  }
  return floors;
}

/** The major version of the package's own `engines.node` range. */
export function declaredNodeFloor(packageJson: string): string {
  const parsed: unknown = JSON.parse(packageJson);
  const engines: unknown = (parsed as { engines?: unknown }).engines;
  const node: unknown = (engines as { node?: unknown } | undefined)?.node;
  if (typeof node !== "string") {
    throw new Error("package.json declares no engines.node");
  }
  const match = /(\d+)/u.exec(node);
  if (match?.[1] === undefined) {
    throw new Error(`package.json engines.node has no major version: ${node}`);
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// The live tree
// ---------------------------------------------------------------------------

const pages = loadPages();
const corpus = pages.map((p) => p.body).join("\n");
const exports_ = exportedNames(ENTRY, readFileSync(ENTRY, "utf8"));
const exemptions = parseExemptions(readFileSync(EXEMPTIONS_FILE, "utf8"));
const exemptNames = exemptions.map((e) => e.name);
const declaredIds = sidebarIds(readFileSync(SIDEBARS_FILE, "utf8"));
const categoryLabels = sidebarCategoryLabels(readFileSync(SIDEBARS_FILE, "utf8"));

describe("docs-content: public surface coverage", () => {
  it("documents every name the package entry point exports, or exempts it with a reason", () => {
    expect(findUndocumentedExports(exports_, corpus, exemptNames)).toEqual([]);
  });

  it("reports an undocumented export, and stops reporting it once exempted", () => {
    const names = ["documented", "orphanExport"];
    expect(findUndocumentedExports(names, "the documented one", [])).toEqual(["orphanExport"]);
    expect(findUndocumentedExports(names, "the documented one", ["orphanExport"])).toEqual([]);
  });

  it("carries no exemption for a name the entry point no longer exports", () => {
    expect(findStaleExemptions(exports_, exemptNames)).toEqual([]);
  });

  it("names a stale exemption, so an exemption cannot outlive the export it excused", () => {
    expect(findStaleExemptions(["stillExported"], ["stillExported", "wasRemoved"])).toEqual([
      "wasRemoved",
    ]);
  });

  it("enumerates the forms the entry point declares itself, not only the ones it re-exports", () => {
    const source = [
      'export { reexported } from "./elsewhere.js";',
      'export * as ns from "./namespace.js";',
      "export const DIRECT_CONST = 1;",
      "export function directFunction(): void {}",
      "export class DirectClass {}",
      "export type DirectType = string;",
      "export interface DirectInterface {",
      "  a: string;",
      "}",
      "export enum DirectEnum {",
      "  A,",
      "}",
      "const notExported = 1;",
      'import { unused } from "./unused.js";',
    ].join("\n");

    expect(exportedNames("index.ts", source)).toEqual([
      "ns",
      "reexported",
      "DIRECT_CONST",
      "DirectClass",
      "DirectEnum",
      "DirectInterface",
      "DirectType",
      "directFunction",
    ]);
  });

  it("throws on an export form it does not model, rather than narrowing the surface", () => {
    expect(() => exportedNames("index.ts", 'export * from "./everything.js";\n')).toThrow(
      /cannot be enumerated/u,
    );
    expect(() => exportedNames("index.ts", "export default 1;\n")).toThrow(/carries no name/u);
    expect(() => exportedNames("index.ts", "export const [first, second] = [1, 2];\n")).toThrow(
      /binding pattern/u,
    );
  });
});

describe("docs-content: sidebar and pages are a bijection", () => {
  it("resolves every declared id to exactly one page file", () => {
    const stems = new Set(pages.map((p) => p.stem));
    expect(declaredIds.filter((id) => !stems.has(id))).toEqual([]);
    expect(findDuplicates(declaredIds)).toEqual([]);
  });

  it("reaches every page file from the sidebar", () => {
    const declared = new Set(declaredIds);
    expect(pages.map((p) => p.stem).filter((stem) => !declared.has(stem))).toEqual([]);
  });

  it("names an orphaned page and a dangling id", () => {
    const stems = ["intro", "orphan"];
    const ids = sidebarIds(
      JSON.stringify({
        docs: ["intro", { type: "category", label: "Guides", items: ["dangling"] }],
      }),
    );
    expect(ids).toEqual(["intro", "dangling"]);
    expect(ids.filter((id) => !stems.includes(id))).toEqual(["dangling"]);
    expect(stems.filter((stem) => !ids.includes(stem))).toEqual(["orphan"]);
  });

  it("registers a page for spec-clean Part 10 output and one for de-identification", () => {
    const declared = new Set(declaredIds);
    const reachable = pages.filter((p) => declared.has(p.stem));
    const titled = (pattern: RegExp): readonly Page[] =>
      reachable.filter((p) => pattern.test(p.frontmatter.get("title") ?? ""));

    const serialization = titled(/serializ/iu);
    const deidentification = titled(/de-identif/iu);
    expect(serialization.length, "no sidebar page owns spec-clean Part 10 output").toBeGreaterThan(
      0,
    );
    expect(
      deidentification.length,
      "no sidebar page owns metadata de-identification",
    ).toBeGreaterThan(0);

    for (const page of serialization) {
      expect(page.body).toMatch(/\bserializeDicom\b/u);
      expect(fences(page.body).filter(isExecuted).length).toBeGreaterThan(0);
    }
    for (const page of deidentification) {
      expect(page.body).toMatch(/\bdeidentify\b/u);
      expect(fences(page.body).filter(isExecuted).length).toBeGreaterThan(0);
    }
  });
});

describe("docs-content: page frontmatter", () => {
  it("carries the same required key set on every page", () => {
    const expected = [...REQUIRED_FRONTMATTER_KEYS].sort((a, b) => a.localeCompare(b));
    const actual = pages.map((p) => ({
      file: p.file,
      keys: [...p.frontmatter.keys()].sort((a, b) => a.localeCompare(b)),
    }));
    expect(actual.filter((p) => p.keys.join(",") !== expected.join(","))).toEqual([]);
  });

  it("declares an id equal to the file stem, unique across the directory", () => {
    expect(pages.filter((p) => p.frontmatter.get("id") !== p.stem).map((p) => p.file)).toEqual([]);
    expect(findDuplicates(pages.map((p) => p.frontmatter.get("id") ?? ""))).toEqual([]);
  });

  it("takes page order from exactly one source", () => {
    const declared = pages
      .filter((p) => p.frontmatter.has(ORDER_KEY))
      .map((p) => ({ file: p.file, order: p.frontmatter.get(ORDER_KEY) ?? "" }));
    if (declared.length === 0) return;
    expect(declared.length).toBe(pages.length);
    expect(findDuplicates(declared.map((d) => d.order))).toEqual([]);
  });

  it("presents no two sidebar entries under the same name", () => {
    expect(findDuplicates(pages.map((p) => p.frontmatter.get("title") ?? ""))).toEqual([]);
    expect(findDuplicates(pages.map((p) => p.frontmatter.get("sidebar_label") ?? ""))).toEqual([]);
  });

  it("gives every sidebar category a name no page inside the tree already uses", () => {
    const pageNames = new Set(
      pages
        .flatMap((p) => [
          p.frontmatter.get("title") ?? "",
          p.frontmatter.get("sidebar_label") ?? "",
        ])
        .map((n) => n.toLowerCase()),
    );
    expect(findDuplicates(categoryLabels)).toEqual([]);
    expect(categoryLabels.filter((label) => pageNames.has(label.toLowerCase()))).toEqual([]);
  });

  it("names a category that repeats a page's own name", () => {
    const source = JSON.stringify({
      docs: [
        { type: "category", label: "Installation", items: ["installation"] },
        { type: "category", label: "Guides", items: ["cookbook"] },
      ],
    });
    const labels = sidebarCategoryLabels(source);
    expect(labels).toEqual(["Installation", "Guides"]);
    expect(labels.filter((label) => label.toLowerCase() === "installation")).toEqual([
      "Installation",
    ]);
  });

  it("reports a repeated title and a colliding order declaration", () => {
    expect(findDuplicates(["Quickstart", "Cookbook", "Quickstart"])).toEqual(["Quickstart"]);
    expect(findDuplicates(["1", "1", "2"])).toEqual(["1"]);
  });
});

describe("docs-content: one owner for the do-not-over-trust material", () => {
  it("names limitations in exactly one page's title or sidebar label", () => {
    const owners = pages.filter(
      (p) =>
        /limitation/iu.test(p.frontmatter.get("title") ?? "") ||
        /limitation/iu.test(p.frontmatter.get("sidebar_label") ?? ""),
    );
    expect(owners.map((p) => p.stem)).toEqual([LIMITATIONS_STEM]);
  });

  it("links to that page from every other page that refers to the material", () => {
    const referring = pages.filter(
      (p) => p.stem !== LIMITATIONS_STEM && /\blimitations?\b/iu.test(p.body),
    );
    expect(
      referring.filter((p) => !p.body.includes(`](./${LIMITATIONS_STEM}`)).map((p) => p.file),
    ).toEqual([]);
  });

  it("states the metadata-first scope boundary on the landing page and links onward", () => {
    const intro = pages.find((p) => p.stem === "intro");
    expect(intro).toBeDefined();
    const body = intro?.body ?? "";
    expect(body).toMatch(/pixel data/iu);
    expect(body).toMatch(/\bnot\s+decoded\b/iu);
    expect(body).toMatch(/\bDIMSE\b/u);
    expect(body).toMatch(/\bDICOMweb\b/u);
    expect(body).toContain(`](./${LIMITATIONS_STEM}`);
  });
});

describe("docs-content: every page carries content and verified code", () => {
  it("publishes no page whose body is empty", () => {
    expect(pages.filter((p) => p.body.trim() === "").map((p) => p.file)).toEqual([]);
  });

  it("executes at least one block on every page that shows TypeScript", () => {
    const unverified = pages.filter((p) => {
      const blocks = fences(p.body);
      return blocks.some(isTypeScript) && !blocks.some(isExecuted);
    });
    expect(unverified.map((p) => p.file)).toEqual([]);
  });

  it("counts a runnable block as executed and a plain ts block as illustrative", () => {
    const blocks = fences("```ts\nillustrative\n```\n\n```ts runnable throws\nexecuted\n```\n");
    expect(blocks.map((b) => b.info)).toEqual(["ts", "ts runnable throws"]);
    expect(blocks.filter(isTypeScript).length).toBe(2);
    expect(blocks.filter(isExecuted).length).toBe(1);
  });

  it("agrees with the doc-snippet runner about which blocks it executes", () => {
    for (const page of pages) {
      // The runner's `line` is the first BODY line of the block; the scanner's
      // is the opening fence, one above it.
      const executed = fences(page.body)
        .filter(isExecuted)
        .map((f) => f.line + 1);
      expect(executed, page.file).toEqual(extractRunnableSnippets(page.body).map((s) => s.line));
    }
  });

  it("reads the fence forms the runner reads, not only an unindented triple backtick", () => {
    const indented = [
      "1. A recipe step, with its code indented under the list item:",
      "",
      "   ```ts runnable",
      "   const answer = 1; // => 1",
      "   ```",
      "",
    ].join("\n");
    expect(extractRunnableSnippets(indented)).toHaveLength(1);
    expect(fences(indented).map((f) => f.info)).toEqual(["ts runnable"]);
    expect(fences(indented).filter(isExecuted)).toHaveLength(1);

    const tilde = ["~~~ts", "const illustrative = 1;", "~~~", ""].join("\n");
    expect(fences(tilde).map((f) => f.info)).toEqual(["ts"]);
    expect(fences(tilde).filter(isTypeScript)).toHaveLength(1);
    expect(fences(tilde).filter(isExecuted)).toHaveLength(0);
  });

  it("classifies a block the way the runner does, by language and by tag position", () => {
    const info = (text: string): Fence => ({ info: text, line: 1 });
    for (const lang of ["ts", "typescript", "tsx"]) {
      expect(isTypeScript(info(lang)), lang).toBe(true);
      expect(isExecuted(info(`${lang} runnable`)), lang).toBe(true);
    }
    // `runnable` counts wherever it sits in the info string, as the runner has it.
    expect(isExecuted(info("ts throws runnable"))).toBe(true);
    expect(isExecuted(info("ts"))).toBe(false);
    expect(isTypeScript(info("bash"))).toBe(false);
    expect(isTypeScript(info(""))).toBe(false);
  });

  it("names a page whose only TypeScript sits in a fence a naive scanner cannot see", () => {
    const page = ["- A step:", "", "   ```ts", "   const illustrative = 1;", "   ```", ""].join(
      "\n",
    );
    const blocks = fences(page);
    expect(blocks.some(isTypeScript)).toBe(true);
    expect(blocks.some(isExecuted)).toBe(false);
  });
});

describe("docs-content: numerals that go stale in silence", () => {
  it("names no @cosyte/dicom release version", () => {
    const offenders = pages.flatMap((p) =>
      findVersionMentions(p.body).map((v) => `${p.file}: ${v}`),
    );
    expect(offenders).toEqual([]);
  });

  it("names no literal count of warning or fatal codes", () => {
    const offenders = pages.flatMap((p) =>
      findCodeCountMentions(p.body).map((c) => `${p.file}: ${c}`),
    );
    expect(offenders).toEqual([]);
  });

  it("reports a release version while leaving a standard citation and a UID alone", () => {
    expect(findVersionMentions("kept verbatim through `0.0.19`")).toEqual(["0.0.19"]);
    expect(findVersionMentions("PS3.5 2026c §7.5.2 and section 7.1.1 and Table 6.2-1")).toEqual([]);
    expect(findVersionMentions("1.2.840.10008.1.2.1 is Explicit VR LE")).toEqual([]);
  });

  it("reports a code count while leaving a tier name and an unrelated count alone", () => {
    expect(findCodeCountMentions("Only **four** unrecoverable Tier-3 conditions throw")).toEqual([
      "four unrecoverable conditions",
    ]);
    expect(findCodeCountMentions("one of the four fatal codes")).toEqual(["four fatal codes"]);
    expect(findCodeCountMentions("Tier-2 warning codes promoted to a throw")).toEqual([]);
    expect(findCodeCountMentions("the nine metadata-affecting Annex E Options")).toEqual([]);
    expect(findCodeCountMentions("a transfer syntax outside the four supported ones")).toEqual([]);
  });

  it("states the same Node engine floor the package declares", () => {
    const declared = declaredNodeFloor(readFileSync(PACKAGE_FILE, "utf8"));
    const stated = pages.flatMap((p) => findNodeFloors(p.body).map((f) => `${p.file}: ${f}`));
    expect(stated.length, "docs-content states no Node engine floor at all").toBeGreaterThan(0);
    expect(stated.filter((s) => !s.endsWith(`: ${declared}`))).toEqual([]);
  });

  it("reports both values when a stated floor disagrees with the package", () => {
    expect(declaredNodeFloor('{"engines":{"node":">=22.0.0"}}')).toBe("22");
    expect(findNodeFloors("Node.js >= 20. The suite targets Node 20+.")).toEqual(["20", "20"]);
  });
});

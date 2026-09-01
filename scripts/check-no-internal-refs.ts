#!/usr/bin/env node
/**
 * scripts/check-no-internal-refs.ts
 *
 * PUBLIC-SURFACE GATE. Founder directive of 2026-07-27: no internal project
 * bookkeeping on any surface a consumer of `@cosyte/dicom` reads. Work-item
 * ids, phase and wave language, roadmap and plan citations, ADR numbers,
 * meta-repo paths and commentary about how the work is being run are all
 * internal. They belong in the changelog, the changesets, commit messages, pull
 * request text, the tests and this repository's own agent-context docs, and
 * nowhere a consumer looks.
 *
 * WHY A GATE AND NOT A ONE-OFF SWEEP. The rule regrows the first time somebody
 * writes a plan id into a doc comment, and the surface where it regrows unseen
 * is JSDoc: no documentation review reads it, and `tsup` copies it verbatim into
 * the published `dist/index.d.ts` and `dist/index.d.cts`. Measured with these
 * rules against this repository's tree at `91b2c33`, immediately before the
 * sweep that landed with this file: 530 findings, 526 of them under `src/`,
 * against 4 in the markdown a documentation review does read. A sweep alone
 * does not hold, and the surface that needed it most is the unread one.
 *
 * Run it with `pnpm check:no-internal-refs`. `.github/workflows/no-internal-refs.yml`
 * runs the same entry point on every pull request and every push to `main`.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE REFUSES TO DO, because a gate that prints OK from a scan that
 * proved nothing is worse than no gate:
 *
 *   * It SELF-TESTS before it reports. Every rule has to match its own positive
 *     sample, every rule has to leave a DICOM reference corpus untouched, and
 *     the scope function has to classify a fixed set of paths the way criteria
 *     3 and 4 say it must. Any of those failing exits 1 and prints no scan
 *     result at all, clean or otherwise.
 *   * It refuses an EMPTY corpus. If `git ls-files` yields nothing, or a
 *     declared surface selects no tracked file (a renamed directory, a moved
 *     `docs-content/`), the run reds rather than reporting a clean tree it
 *     never read.
 *   * It refuses an UNREADABLE file. A file in scope that cannot be opened, or
 *     whose bytes do not round-trip through UTF-8, fails the run. `readFileSync`
 *     with an encoding substitutes U+FFFD silently, so the round-trip is the
 *     check, not the absence of a throw.
 *
 * WHAT IT WILL NOT GROW. There is no list of excused occurrences and there must
 * never be one. When a finding sits on a surface this rule does not govern, the
 * fix is to exclude that SURFACE in `EXCLUSIONS` below and add the path to
 * `SCOPE_SELF_TEST`. When a token is a standards designator rather than a
 * project id (`CP-246` is a DICOM Change Proposal, not a work item), the fix is
 * `DOMAIN_DESIGNATOR_PREFIXES` plus a `DICOM_CORPUS` entry that pins it: the
 * self-test refuses an exemption prefix that no corpus entry exercises, so the
 * set cannot grow unproven. Neither route can excuse one line of prose.
 *
 * WHY `scripts/` IS NOT IN SCOPE, stated because this file necessarily spells
 * out the samples it bans: `scripts/` is contributor tooling, not a surface a
 * consumer of the package reads, so it is outside every entry in `SURFACES`.
 * That is a scope fact and not a self-exemption; nothing here would be excused
 * if the scope ever widened to cover it.
 *
 * WHY COMMIT MESSAGES AND PULL REQUEST TEXT ARE NOT COVERED. They are the
 * surfaces the identifiers BELONG on, so unlike `scripts/check-no-emdash.sh`
 * this gate has no `--stdin` mode and the workflow feeds it nothing. A gate
 * that flagged a changeset would be enforcing the opposite of the rule.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/* -------------------------------------------------------------------------- */
/* Rules: what counts as internal bookkeeping                                  */
/* -------------------------------------------------------------------------- */

interface Rule {
  /** Stable id, printed with every finding. */
  readonly id: string;
  /** One line a reader can act on. */
  readonly what: string;
  /** Global regular expression. Fresh state is taken per scan. */
  readonly pattern: RegExp;
  /**
   * Optional second opinion on a raw match, given the whole text being scanned
   * and the match's offset within it. Used only where the token itself is
   * genuinely ambiguous and the text around it is what settles the reading.
   */
  readonly keep?: (text: string, index: number, matched: string) => boolean;
  /** A sample this rule MUST match, asserted by the self-test. */
  readonly positive: string;
}

/**
 * Prefixes that are NOT project prefixes, in two families:
 *
 *   * standards-body, cryptographic and encoding designators (`CP-246` is a
 *     DICOM Change Proposal, `IEEE-754` is a floating-point standard);
 *   * clinical and interoperability identifier prefixes that appear in example
 *     VALUES a consumer is meant to copy (`MRN-42`, `ACC-0001`, `OBR-18`).
 *
 * Every prefix here has to be exercised by a `DICOM_CORPUS` entry or the
 * self-test refuses to run, which is what stops this set quietly absorbing a
 * real project prefix. It excuses a VOCABULARY, never an occurrence: adding a
 * prefix exempts that token everywhere, including in text this gate has never
 * seen, so the corpus entry is the price of admission.
 */
const DOMAIN_DESIGNATOR_PREFIXES: ReadonlySet<string> = new Set([
  "ACC",
  "AES",
  "CP",
  "ICD",
  "IEC",
  "IEEE",
  "ISO",
  "JPEG",
  "MPEG",
  "MRN",
  "OBR",
  "RFC",
  "SHA",
  "UTF",
]);

/**
 * Text that reads as a citation of a published document rather than of an
 * internal plan. A section sign whose own paragraph names one of these is
 * citing a standard, which is exactly what this repository is supposed to do;
 * a section sign with no document anywhere in its paragraph is citing the
 * roadmap and the reader has nothing to look it up in.
 *
 * Deliberately NOT in this set: the bare words "DICOM" and "standard". Over a
 * paragraph-sized window every file in this repository contains both, and a
 * guard every paragraph satisfies is a rule that never fires.
 */
const SPEC_CITATION_CONTEXT =
  /PS\s?3\.|Part\s\d|\bAnnex\b|\bTable\s|\bRFC\s?\d|\bISO\b|\bIEC\b|\bCP-\d/;
const CITATION_WINDOW = 600;

/**
 * The text a section citation gets to hang on: back to the nearest paragraph
 * boundary, and no further than `CITATION_WINDOW` characters. A document named
 * three paragraphs earlier is not this sentence's citation.
 */
function citationContext(text: string, index: number): string {
  const slice = text.slice(Math.max(0, index - CITATION_WINDOW), index);
  let start = 0;
  for (const boundary of [/\n[ \t]*\n/g, /\n[ \t]*\*[ \t]*\n/g, /\/\*+/g, /\*\//g]) {
    let hit = boundary.exec(slice);
    while (hit !== null) {
      start = Math.max(start, hit.index + hit[0].length);
      hit = boundary.exec(slice);
    }
  }
  return slice.slice(start);
}

const RULES: readonly Rule[] = [
  {
    id: "umbrella-item-id",
    what: "a work-item id from the umbrella's spec queue",
    pattern: /\bS\d{4}(?:-[A-Za-z0-9]+)*\b/g,
    positive: "tracked as S0228-github-profile-ci-drift",
  },
  {
    id: "issue-reference",
    what: "a bare issue or pull request number",
    // The trailing lookahead keeps a markdown anchor out of it: `#4-de-identify`
    // is a link into this document, not a reference to issue 4.
    pattern: /(?<![\w&#])#\d{1,4}(?![-\w])/g,
    positive: "refused by the gate in #51",
  },
  {
    id: "project-item-id",
    what: "a project prefix followed by a number (a work-item or plan id)",
    pattern: /\b([A-Z][A-Z0-9]{1,9})-\d{1,4}\b/g,
    keep: (_text, _index, matched) => {
      const prefix = matched.slice(0, matched.lastIndexOf("-"));
      return !DOMAIN_DESIGNATOR_PREFIXES.has(prefix);
    },
    positive: "the TOL-03 tolerance catalog",
  },
  {
    id: "plan-decision-id",
    what: "a plan decision or threat-model id from this repository's build plans",
    // A one-letter prefix cannot be told from ordinary prose by shape alone, so
    // this rule names the two families the plans actually used rather than
    // guessing at a general form and flagging every "D" in the tree.
    pattern: /\b(?:D-\d{2}|T-\d{2}-\d{2}-\d{2})\b/g,
    positive: "threaded per D-45 by the parser",
  },
  {
    id: "adr-number",
    what: "an architecture decision record number",
    pattern: /\b(?:ADRs?\s*[-#]?\s*\d{2,4}|decisions?\/\d{4}-[a-z0-9-]+)\b/gi,
    positive: "the measured history in ADR 0023",
  },
  {
    id: "phase-language",
    what: "delivery-phase language",
    pattern:
      /\bphases?\s+(?:\d+|[A-E])\b|\b(?:subsequent|later|earlier|future|upcoming|next|previous|remaining)\s+phases?\b/gi,
    positive: "Phase 2 core-parser context",
  },
  {
    id: "wave-language",
    what: "delivery-wave language",
    pattern:
      /\b(?:subsequent|later|earlier|future|upcoming|next|previous|remaining)\s+wave\b|\bwaves?\s+\d+\b/gi,
    positive: "arrives in a later wave",
  },
  {
    id: "roadmap-citation",
    what: "a roadmap, backlog or build-plan citation",
    // `\broadmaps?\b` on its own is too wide: a README section called "Roadmap"
    // tells a consumer what the PACKAGE will do next, which is product
    // information rather than project bookkeeping. What is banned is CITING the
    // roadmap, a plan or the backlog as an authority the reader cannot open.
    pattern:
      /\b(?:the|this|its|our)\s+(?:\w+\s+)?roadmaps?\b|\bbacklog\b|\bplans?\s+\d+(?:-\d+)*\b|\b(?:\d{2}-)?CONTEXT\.md\b|\bREQUIREMENTS\.md\b|\bPITFALLS\.md\b/gi,
    positive: "committed by Plan 05, per the dicom roadmap",
  },
  {
    id: "bare-section-citation",
    what: "a section citation with no published document to hang it on",
    pattern: /§\s*\d+(?:\.\d+)*/g,
    keep: (text, index) => !SPEC_CITATION_CONTEXT.test(citationContext(text, index)),
    positive: "the domain helper surface (§4)",
  },
  {
    id: "meta-repo-path",
    what: "a path into the meta-repo or a sibling checkout",
    pattern:
      /\bmeta[-\s]repo\b|\bumbrella\s+repo\b|\bdocumentation\/(?:conventions|agent-notes|decisions)\b|(?:\.\.\/)+(?:hl7|x12|deid|config|fhir|ncpdp|astm|synth|cli|terminology|transform|mllp|ccda|dates|docs|crew|knowledgebase)\b|\bwork\/(?:specs|backlog|inbox|archive)\/|\bcards\/[a-z-]+\.md\b/gi,
    positive: "the meta-repo's documentation/conventions.md",
  },
  {
    id: "process-commentary",
    what: "commentary about how the work is being run",
    // Two words this rule deliberately does NOT key on, both pinned by
    // `DICOM_CORPUS` entries so a later widening is refused by the self-test:
    //
    //   "deferred to" - "pixel cleaning is deferred to `@cosyte/dicom-pixel`"
    //   tells a consumer which package does the job, which is product
    //   information. It is the units of WORK that are internal, not the word.
    //
    //   "slice" - in a DICOM parser it is a `Buffer.subarray` and an imaging
    //   term (Slice Thickness, Slice Location) far more often than it is a
    //   unit of work, so "this slice" cannot be told apart by shape. The
    //   work-unit sense is caught through its neighbours instead.
    pattern:
      /\bthis\s+(?:spec|work item|changeset|change set|PR|pull request|session|port)\b|\b(?:a|the|another|one)\s+(?:later|future|separate|follow-up|subsequent)\s+(?:spec|PR|pull request|work item|changeset)\b|\bout\s+of\s+scope\s+for\s+(?:this|the)\s+(?:slice|item|change|spec|pass)\b|\bbacklog\s+line\b/gi,
    positive: "landed by a later spec, and out of scope for this change",
  },
];

/**
 * Grounded DICOM and medical-terminology text that must survive every rule
 * untouched. The first six entries are the ones the specification names; the
 * rest pin the exemptions in `DOMAIN_DESIGNATOR_PREFIXES` and the spec-citation
 * context, so no exemption in this file is unproven.
 */
const DICOM_CORPUS: readonly string[] = [
  "PS3.6 Table 6-1 is the element registry",
  "Patient Name is (0010,0010) and Patient ID is (0010,0020)",
  "the VR is PN, and a UID value takes VR UI",
  "a DICOM-SR structured report document",
  "Explicit VR Little Endian is 1.2.840.10008.1.2.1",
  "coding scheme designator ICD-10-CM",
  "PS3.5 §6.2 says a new VR shall use the long form",
  "PS3.15 §E.3.10 has two branches",
  "the CP-246 fallback descends an Implicit VR sequence",
  "ISO-8859-15 sits behind the ISO_IR 148 term",
  "ISO/IEC-10646 defines the universal character set",
  "the URI form in RFC-3986",
  "the vendored document is pinned by SHA-256",
  "an AES-256 wrapped attribute",
  "text values are decoded as UTF-8 or UTF-16",
  "JPEG-2000 and MPEG-4 transfer syntaxes are encapsulated",
  "FL and FD decode as IEEE-754 binary floating point",
  "Table E.1-1 of PS3.15 Annex E lists the actions",
  "an item delimiter is (FFFE,E00D)",
  "MONOCHROME2 photometric interpretation, 16 bits allocated",
  "the Basic Offset Table precedes the pixel-data fragments",
  "waveform sequences and multi-frame functional groups",
  "part-10, metadata, medical-imaging, interoperability",
  'ds.patient.id reads "MRN-42" and is meaningless without its issuer',
  'ds.study.accessionNumber reads "ACC-0001"',
  "the accession number usually arrives as HL7 v2 OBR-18 or OBR-19",
  "the item is parsed from a subarray, so ctx.frame has to be this slice",
  "Slice Thickness and Slice Location describe the next slice in the volume",
  "pixel cleaning is deferred to @cosyte/dicom-pixel",
];

/* -------------------------------------------------------------------------- */
/* Scope: where to look, and where not to                                      */
/* -------------------------------------------------------------------------- */

interface PathRule {
  readonly id: string;
  readonly what: string;
  readonly match: (path: string) => boolean;
}

/**
 * Checked FIRST, so a path an exclusion names can never be pulled back in by a
 * surface. `CHANGELOG.md` is root markdown and `src/dictionary/generated/README.md`
 * is not, which is exactly the ordering these two rules have to produce.
 */
const EXCLUSIONS: readonly PathRule[] = [
  {
    id: "changelog",
    what: "CHANGELOG.md: generated release history, where version and item context belongs",
    match: (path) => path === "CHANGELOG.md",
  },
  {
    id: "changesets",
    what: ".changeset/: release notes in flight, the source of the changelog above",
    match: (path) => path.startsWith(".changeset/"),
  },
  {
    id: "tests",
    what: "test/: never published, never read by a consumer, and it asserts on internal ids",
    match: (path) => path === "test" || path.startsWith("test/"),
  },
  {
    id: "repo-github",
    what: ".github/: this repository's own CI, ownership and metadata",
    match: (path) => path.startsWith(".github/"),
  },
  {
    id: "agent-context",
    what: "agent-context docs: CLAUDE.md, AGENTS.md, .claude/, documentation/",
    match: (path) =>
      path === "CLAUDE.md" ||
      path === "AGENTS.md" ||
      path.startsWith(".claude/") ||
      path.startsWith("documentation/"),
  },
];

/** Every surface a consumer of `@cosyte/dicom` can read. */
const SURFACES: readonly PathRule[] = [
  {
    id: "root-markdown",
    what: "published markdown at the repository root (README, TRADEMARKS, and the rest)",
    match: (path) => path.endsWith(".md") && !path.includes("/"),
  },
  {
    id: "docs-content",
    what: "docs-content/: the documentation site's source",
    match: (path) => path.startsWith("docs-content/"),
  },
  {
    id: "package-metadata",
    what: "package.json: the `description` and `keywords` npm renders",
    match: (path) => path === "package.json",
  },
  {
    id: "src-tree",
    what: "src/: comment blocks the build copies into the declaration files, and every string a consumer sees at runtime",
    match: (path) => path.startsWith("src/"),
  },
];

/**
 * Fixed classification cases, asserted before any scan. These are the machine
 * form of "where to look" and "where not to look": change a surface or an
 * exclusion and this list has to change with it.
 */
const SCOPE_SELF_TEST: readonly { readonly path: string; readonly inScope: boolean }[] = [
  { path: "README.md", inScope: true },
  { path: "TRADEMARKS.md", inScope: true },
  { path: "phi-scan-overrides.md", inScope: true },
  { path: "docs-content/intro.md", inScope: true },
  { path: "docs-content/sidebars.json", inScope: true },
  { path: "package.json", inScope: true },
  { path: "src/parser/warnings.ts", inScope: true },
  { path: "src/dictionary/generated/README.md", inScope: true },
  { path: "CHANGELOG.md", inScope: false },
  { path: ".changeset/brave-pandas-remove.md", inScope: false },
  { path: "test/parser/index.test.ts", inScope: false },
  { path: "test/fixtures/phi-scan/README.md", inScope: false },
  { path: ".github/workflows/no-internal-refs.yml", inScope: false },
  { path: ".github/CODEOWNERS", inScope: false },
  { path: "CLAUDE.md", inScope: false },
  { path: "documentation/agent-notes.md", inScope: false },
  { path: "scripts/check-no-internal-refs.ts", inScope: false },
  { path: "vendor/nema/README.md", inScope: false },
  { path: "pnpm-lock.yaml", inScope: false },
];

/* -------------------------------------------------------------------------- */
/* Machinery                                                                   */
/* -------------------------------------------------------------------------- */

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly ruleId: string;
  readonly matched: string;
  readonly context: string;
}

/**
 * A run of text scanned in one piece. A whole file is one unit, so a rule's
 * `keep` can look at the paragraph a match sits in rather than at its line
 * alone. `baseLine` and `baseColumn` are the 1-based position of `text[0]` in
 * the file, which is how a finding inside a `package.json` field still reports
 * the line a reader can open.
 */
interface ScanUnit {
  readonly file: string;
  readonly text: string;
  readonly baseLine: number;
  readonly baseColumn: number;
}

function fail(lines: readonly string[]): never {
  for (const line of lines) {
    process.stderr.write(`${line}\n`);
  }
  process.exit(1);
}

function findMatches(rule: Rule, text: string): readonly { index: number; matched: string }[] {
  const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
  const re = new RegExp(rule.pattern.source, flags);
  const out: { index: number; matched: string }[] = [];
  let hit = re.exec(text);
  while (hit !== null) {
    const matched = hit[0];
    if (matched.length === 0) {
      re.lastIndex += 1;
    } else if (rule.keep === undefined || rule.keep(text, hit.index, matched)) {
      out.push({ index: hit.index, matched });
    }
    hit = re.exec(text);
  }
  return out;
}

function classify(path: string): { readonly inScope: boolean; readonly ruleId: string } {
  for (const exclusion of EXCLUSIONS) {
    if (exclusion.match(path)) {
      return { inScope: false, ruleId: exclusion.id };
    }
  }
  for (const surface of SURFACES) {
    if (surface.match(path)) {
      return { inScope: true, ruleId: surface.id };
    }
  }
  return { inScope: false, ruleId: "not-a-consumer-surface" };
}

/* ---- self-test ----------------------------------------------------------- */

function selfTest(): void {
  const problems: string[] = [];

  for (const rule of RULES) {
    if (findMatches(rule, rule.positive).length === 0) {
      problems.push(
        `  rule ${rule.id} no longer matches its own positive sample: ${rule.positive}`,
      );
    }
  }

  for (const entry of DICOM_CORPUS) {
    for (const rule of RULES) {
      for (const hit of findMatches(rule, entry)) {
        problems.push(
          `  rule ${rule.id} flags DICOM reference text as internal: "${hit.matched}" in ${entry}`,
        );
      }
    }
  }

  for (const prefix of DOMAIN_DESIGNATOR_PREFIXES) {
    const exercised = DICOM_CORPUS.some((entry) => new RegExp(`\\b${prefix}-\\d`).test(entry));
    if (!exercised) {
      problems.push(`  exemption prefix ${prefix} is not exercised by any DICOM_CORPUS entry`);
    }
  }

  for (const expectation of SCOPE_SELF_TEST) {
    const actual = classify(expectation.path);
    if (actual.inScope !== expectation.inScope) {
      problems.push(
        `  scope: ${expectation.path} should be ${expectation.inScope ? "in" : "out of"} scope, ` +
          `but rule ${actual.ruleId} put it ${actual.inScope ? "in" : "out of"} scope`,
      );
    }
  }

  if (problems.length > 0) {
    fail([
      "ERROR: check-no-internal-refs - the self-test failed, so nothing was scanned.",
      ...problems,
      "",
      "       A gate that cannot prove it still sees what it is meant to see, and",
      "       still ignores what it is meant to ignore, reports nothing at all.",
    ]);
  }
}

/* ---- reading ------------------------------------------------------------- */

function readTextOrFail(root: string, path: string): string {
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(root, path));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail([
      `ERROR: check-no-internal-refs - cannot read ${path}, which is in scope.`,
      `       ${reason}`,
      "",
      "       Refusing to report a result from a scan that did not read all of its input.",
    ]);
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    return fail([
      `ERROR: check-no-internal-refs - ${path} is in scope but does not decode as UTF-8.`,
      "       Its bytes do not survive a UTF-8 round trip, so the scan read a substituted",
      "       replacement character rather than the file's own text.",
      "",
      "       Refusing to report a result from a scan that did not read all of its input.",
    ]);
  }
  return text;
}

/* ---- units --------------------------------------------------------------- */

function positionOf(
  unit: ScanUnit,
  index: number,
): { readonly line: number; readonly column: number } {
  const before = unit.text.slice(0, index);
  const lastBreak = before.lastIndexOf("\n");
  if (lastBreak < 0) {
    return { line: unit.baseLine, column: unit.baseColumn + index };
  }
  return { line: unit.baseLine + before.split("\n").length - 1, column: index - lastBreak };
}

/** The whole line a match sits on, for a report a reader can act on. */
function lineAt(unit: ScanUnit, index: number): string {
  const start = unit.text.lastIndexOf("\n", index) + 1;
  const end = unit.text.indexOf("\n", index);
  return unit.text.slice(start, end < 0 ? unit.text.length : end).trim();
}

function wholeFileUnit(file: string, text: string): readonly ScanUnit[] {
  return [{ file, text, baseLine: 1, baseColumn: 1 }];
}

/**
 * package.json is scanned field by field rather than line by line: `scripts`,
 * `devDependencies` and the rest are build configuration, while `description`
 * and `keywords` are what npm renders on the package page.
 */
function packageMetadataUnits(file: string, raw: string): readonly ScanUnit[] {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail([`ERROR: check-no-internal-refs - ${file} is not a JSON object.`]);
  }
  const record = parsed as Record<string, unknown>;

  const locate = (keyName: string, value: string): ScanUnit => {
    const keyAt = raw.indexOf(`"${keyName}"`);
    const valueAt = keyAt < 0 ? -1 : raw.indexOf(JSON.stringify(value), keyAt);
    if (valueAt < 0) {
      return fail([
        `ERROR: check-no-internal-refs - cannot locate ${keyName} value ${JSON.stringify(value)} in ${file}.`,
        "       Refusing to report a finding it cannot point at, or a clean result it cannot vouch for.",
      ]);
    }
    const before = raw.slice(0, valueAt);
    const lastBreak = before.lastIndexOf("\n");
    return {
      file,
      text: value,
      baseLine: before.split("\n").length,
      // +1 to step over the opening quote of the JSON string.
      baseColumn: valueAt - lastBreak + 1,
    };
  };

  const description = record["description"];
  if (typeof description !== "string") {
    return fail([`ERROR: check-no-internal-refs - ${file} has no string "description".`]);
  }
  const keywords = record["keywords"];
  if (!Array.isArray(keywords) || keywords.some((keyword) => typeof keyword !== "string")) {
    return fail([`ERROR: check-no-internal-refs - ${file} has no string array "keywords".`]);
  }

  return [
    locate("description", description),
    ...(keywords as readonly string[]).map((keyword) => locate("keywords", keyword)),
  ];
}

/* ---- main ---------------------------------------------------------------- */

function main(): void {
  selfTest();

  // Anchored on this file's own location, never on the working directory.
  // `git ls-files` is relative to where it runs, so a run from a subdirectory
  // would list a subtree and report OK having skipped the rest of the tree.
  const root = resolve(import.meta.dirname, "..");
  const toplevel = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  if (resolve(toplevel) !== root) {
    fail([
      `ERROR: check-no-internal-refs - ${root} is not the top level of its git repository.`,
      `       git reports ${toplevel}. Refusing to scan a tree this gate cannot delimit.`,
    ]);
  }
  const listing = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  const tracked = listing.split("\0").filter((path) => path.length > 0);

  if (tracked.length === 0) {
    fail([
      "ERROR: check-no-internal-refs - git lists no tracked files.",
      "       Refusing to report green from a scan that read nothing.",
    ]);
  }

  const inScope = tracked
    .map((path) => ({ path, decision: classify(path) }))
    .filter((entry) => entry.decision.inScope);

  const emptySurfaces = SURFACES.filter(
    (surface) => !inScope.some((entry) => entry.decision.ruleId === surface.id),
  );
  if (emptySurfaces.length > 0) {
    fail([
      "ERROR: check-no-internal-refs - a declared surface selected no tracked file:",
      ...emptySurfaces.map((surface) => `  ${surface.id} - ${surface.what}`),
      "",
      "       A surface that matches nothing has been renamed or moved, and a scan that",
      "       skipped it silently would report green over text it never read.",
    ]);
  }

  const findings: Finding[] = [];
  for (const entry of inScope) {
    const raw = readTextOrFail(root, entry.path);
    const units =
      entry.decision.ruleId === "package-metadata"
        ? packageMetadataUnits(entry.path, raw)
        : wholeFileUnit(entry.path, raw);

    for (const unit of units) {
      for (const rule of RULES) {
        for (const hit of findMatches(rule, unit.text)) {
          const position = positionOf(unit, hit.index);
          findings.push({
            file: unit.file,
            line: position.line,
            column: position.column,
            ruleId: rule.id,
            matched: hit.matched,
            context: lineAt(unit, hit.index),
          });
        }
      }
    }
  }

  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column,
  );

  if (findings.length > 0) {
    const rendered = findings.map(
      (finding) =>
        `${finding.file}:${finding.line}:${finding.column}: [${finding.ruleId}] ${finding.matched}\n` +
        `    ${finding.context}`,
    );
    const byRule = new Map<string, number>();
    for (const finding of findings) {
      byRule.set(finding.ruleId, (byRule.get(finding.ruleId) ?? 0) + 1);
    }
    fail([
      ...rendered,
      "",
      `ERROR: check-no-internal-refs - ${findings.length} internal reference(s) on a consumer surface.`,
      ...[...byRule.entries()].sort().map(([ruleId, count]) => {
        const rule = RULES.find((candidate) => candidate.id === ruleId);
        return `       ${count} x ${ruleId}: ${rule === undefined ? "" : rule.what}`;
      }),
      "",
      "       Rewrite the text. Work-item ids, phases, waves, plans, ADR numbers,",
      "       meta-repo paths and process commentary belong in the changeset, the",
      "       commit message, the pull request, or this repository's agent-context",
      "       docs, never on a surface a consumer of @cosyte/dicom reads.",
    ]);
  }

  const perSurface = SURFACES.map((surface) => {
    const count = inScope.filter((entry) => entry.decision.ruleId === surface.id).length;
    return `${surface.id}=${count}`;
  }).join(" ");
  process.stdout.write(
    `check-no-internal-refs: OK (no internal references on ${inScope.length} of ${tracked.length} ` +
      `tracked files; ${perSurface})\n`,
  );
}

main();

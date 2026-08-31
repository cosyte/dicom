import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The README structure gate.
 *
 * `README.md` ships to two surfaces that are frozen the moment the package publishes: the npm
 * package page, where the file is baked into the tarball and cannot be corrected without cutting
 * another release, and the GitHub repo front page. The house skeleton for that file names the
 * elements a reader has to meet inside the first screen (banner, name, tagline, badges, the one-line
 * description that is also the package metadata, then why / status / install / usage / PHI), and
 * until now nothing held them in place. This test is what turns that skeleton from a convention into
 * a gate, so an edit that drops a required section reds CI instead of shipping.
 *
 * ## Why the checks are functions over a string rather than assertions over the file
 *
 * Two of the obligations are about the check ITSELF going red: a missing, out-of-order or
 * empty-bodied section has to fail with a message NAMING the section at fault, and a table-of-contents
 * link that points at no heading has to fail NAMING the unresolved link. A gate asserted directly
 * against the shipped file cannot demonstrate either, because the shipped file passes. So
 * `structureProblems` and `tocProblems` are pure functions from markdown to a list of named
 * problems, the live file is required to produce none, and the mutation controls below feed each one
 * a deliberately broken document and require the right name to come back. This repository has
 * shipped a gate with no red path before; one is decoration.
 *
 * ## What is NOT checked here, deliberately
 *
 * Whether the prose is well chosen. No test reads English. `Why this exists` naming the nearest
 * alternative, and `PHI and safety` covering logging / retention / disk / what the consumer owns,
 * are graded by a reader against the file. What is mechanical is checked: the sections exist, are in
 * order, are non-empty, and the load-bearing literals (the version, the settled-API claim, the engine
 * floor, the module format) are present.
 *
 * ## The banner is pinned byte for byte, including its alt text
 *
 * The tiles sit behind a `cosyte.com` deploy and the URLs are absolute for that reason, so a moved
 * path breaks the banner in every already-published README at once and is fixable only by
 * republishing. The `alt` string is generated centrally in the `assets` repo (`assets/alt-text.json`)
 * and must never be hand-written here. Both are pinned as literals below: changing either has to be a
 * deliberate, cross-repo act that reds this file first.
 *
 * @module
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const README = join(REPO_ROOT, "README.md");
const ENTRY = join(REPO_ROOT, "src", "index.ts");

/** The centrally generated banner alt string. NEVER hand-edit: it is owned by the `assets` repo. */
const BANNER_ALT =
  "Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark";

const TILE_BASE = "https://cosyte.com/tile/";
const DARK_TILE = `${TILE_BASE}cosyte-lockup-tile-on-dark-1200x300.png`;
const LIGHT_TILE = `${TILE_BASE}cosyte-lockup-tile-on-light-1200x300.png`;

/** The H2 sections the house skeleton requires, in the relative order it requires them in. */
const REQUIRED_H2 = [
  "Why this exists",
  "Status",
  "Install",
  "Usage",
  "PHI and safety",
  "Contributing",
  "License",
] as const;

/** The house badge set: four, in this order, and four is the ceiling. */
const BADGE_ORDER = ["npm version", "CI", "License", "Node"] as const;

/** The tagline is a hook, and a hook that does not fit on one line is not one. */
const TAGLINE_MAX = 120;

function readme(): string {
  return readFileSync(README, "utf8");
}

function packageDescription(): string {
  const pkg: unknown = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  const description =
    typeof pkg === "object" && pkg !== null && "description" in pkg ? pkg.description : undefined;
  if (typeof description !== "string") throw new Error("package.json has no string description");
  return description;
}

/**
 * Blank every fenced code block, keeping the line count so an index still reads.
 *
 * The ASCII wire-layout diagram and several snippets carry `#` characters at the start of a line
 * (shell comments), and a heading scan that read one as an H1 would report a document nobody wrote.
 */
function stripFences(md: string): string[] {
  let fenced = false;
  return md.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return "";
    }
    return fenced ? "" : line;
  });
}

interface Heading {
  readonly level: number;
  readonly text: string;
  readonly line: number;
}

/** Every ATX heading outside a code fence, in document order. */
function headings(md: string): Heading[] {
  const out: Heading[] = [];
  for (const [line, text] of stripFences(md).entries()) {
    const m = /^(#{1,6}) +(.+?) *$/.exec(text);
    if (m?.[1] !== undefined && m[2] !== undefined) {
      out.push({ level: m[1].length, text: m[2], line });
    }
  }
  return out;
}

function h2s(md: string): Heading[] {
  return headings(md).filter((h) => h.level === 2);
}

/**
 * GitHub's heading anchor: lowercase, drop everything that is not a letter, a digit, a space, a
 * hyphen or an underscore, then spaces become hyphens.
 *
 * `Known limitations & non-goals` is the case worth stating: the ampersand is DROPPED rather than
 * replaced, and the space either side of it survives, so the anchor carries a double hyphen
 * (`#known-limitations--non-goals`). A slug function that collapsed the run would produce a link
 * that resolves nowhere on the rendered page.
 */
function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replaceAll(" ", "-");
}

/** The body of the heading at `index`: everything up to the next heading of ANY level. */
function bodyOf(md: string, all: readonly Heading[], index: number): string {
  const self = all[index];
  if (self === undefined) return "";
  const next = all[index + 1];
  const lines = md.split("\n");
  return lines.slice(self.line + 1, next?.line ?? lines.length).join("\n");
}

/** The named import bindings each `import ... from "@cosyte/dicom"` in `md` pulls in. */
function importedIdentifiers(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@cosyte\/dicom"/g)) {
    for (const raw of (m[1] ?? "").split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name !== undefined && name !== "") out.push(name);
    }
  }
  return out;
}

/**
 * The export set of `src/index.ts`, read from its own syntax tree.
 *
 * No `ts.createProgram` and no type checker: the barrel is a flat list of re-export declarations, so
 * one source file answers the question, and a full program over this package costs tens of seconds
 * that buy nothing here.
 */
function publicExports(): ReadonlySet<string> {
  const source = ts.createSourceFile(
    ENTRY,
    readFileSync(ENTRY, "utf8"),
    ts.ScriptTarget.ES2023,
    true,
  );
  const out = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const clause = statement.exportClause;
    if (clause === undefined) continue;
    if (ts.isNamespaceExport(clause)) out.add(clause.name.text);
    else for (const element of clause.elements) out.add(element.name.text);
  }
  return out;
}

/** The ```ts fenced blocks that live under the H2 named `section`. */
function tsBlocksUnder(md: string, section: string): string[] {
  const all = h2s(md);
  const index = all.findIndex((h) => h.text === section);
  if (index === -1) return [];
  const lines = md.split("\n");
  const start = all[index]?.line ?? 0;
  const end = all[index + 1]?.line ?? lines.length;
  const out: string[] = [];
  let open: number | null = null;
  for (let i = start; i < end; i += 1) {
    const line = lines[i] ?? "";
    if (open === null) {
      if (/^```ts\b/.test(line)) open = i + 1;
    } else if (/^```\s*$/.test(line)) {
      out.push(lines.slice(open, i).join("\n"));
      open = null;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The two checkers. Pure markdown in, named problems out.
// ---------------------------------------------------------------------------

/**
 * Every structural obligation the house skeleton places on the file, as a list of problems.
 *
 * Each problem NAMES the element at fault, which is the obligation itself: a structure gate that
 * reds saying only "the README is wrong" costs the next reader the bisect this check exists to save.
 */
function structureProblems(md: string, description: string): string[] {
  const problems: string[] = [];
  const lines = md.split("\n");
  const all = headings(md);
  const tops = h2s(md);

  // --- banner: first content in the file, before any heading, with both tiles absolute ---
  const firstHeading = all[0];
  const beforeHeading = lines.slice(0, firstHeading?.line ?? lines.length).join("\n");
  if (!beforeHeading.trimStart().startsWith('<a href="https://cosyte.com">')) {
    problems.push("banner: the file does not open with the cosyte.com lockup link");
  }
  if (!beforeHeading.includes('media="(prefers-color-scheme: dark)"')) {
    problems.push("banner: no prefers-color-scheme: dark <source>");
  }
  if (!beforeHeading.includes(`srcset="${DARK_TILE}"`)) {
    problems.push("banner: the dark tile is not on the <source> srcset, absolute under the deploy");
  }
  if (!beforeHeading.includes(`src="${LIGHT_TILE}"`)) {
    problems.push("banner: the LIGHT tile is not on the <img> fallback, absolute under the deploy");
  }
  if (!beforeHeading.includes(`alt="${BANNER_ALT}"`)) {
    problems.push("banner: the alt string is not the one assets/alt-text.json generates");
  }

  // --- H1: exactly one, equal to the npm package name ---
  const h1 = all.filter((h) => h.level === 1);
  if (h1.length !== 1) {
    problems.push(`H1: found ${String(h1.length)} level-1 headings, require exactly 1`);
  } else if (h1[0]?.text !== "@cosyte/dicom") {
    problems.push(`H1: reads ${JSON.stringify(h1[0]?.text ?? "")}, require "@cosyte/dicom"`);
  }

  // --- tagline: a one-line blockquote immediately after the H1, under the hook ceiling ---
  const afterH1 = (h1[0]?.line ?? -1) + 1;
  let cursor = afterH1;
  while (cursor < lines.length && (lines[cursor] ?? "").trim() === "") cursor += 1;
  const tagline = lines[cursor] ?? "";
  if (!tagline.startsWith("> ")) {
    problems.push("tagline: the H1 is not followed by a blockquote tagline");
  } else {
    if ((lines[cursor + 1] ?? "").trim() !== "") {
      problems.push("tagline: the blockquote runs past one line");
    }
    const text = tagline.slice(2);
    if (text.length >= TAGLINE_MAX) {
      problems.push(
        `tagline: ${String(text.length)} characters, require fewer than ${String(TAGLINE_MAX)}`,
      );
    }
  }

  // --- badges: exactly four, newline-delimited, under no heading, in the house order ---
  let badgeCursor = cursor + 1;
  while (badgeCursor < lines.length && (lines[badgeCursor] ?? "").trim() === "") badgeCursor += 1;
  const badges: string[] = [];
  while (badgeCursor < lines.length && (lines[badgeCursor] ?? "").startsWith("[![")) {
    badges.push(lines[badgeCursor] ?? "");
    badgeCursor += 1;
  }
  if (badges.length !== 4) {
    problems.push(`badges: found ${String(badges.length)} badges after the tagline, require 4`);
  } else {
    for (const [i, expected] of BADGE_ORDER.entries()) {
      const label = /^\[!\[([^\]]*)\]/.exec(badges[i] ?? "")?.[1] ?? "";
      if (!label.startsWith(expected)) {
        problems.push(
          `badges: position ${String(i + 1)} is ${JSON.stringify(label)}, require ${JSON.stringify(expected)}`,
        );
      }
    }
  }

  // --- description: one plain line, byte-identical to package.json, one string for three surfaces ---
  let descCursor = badgeCursor;
  while (descCursor < lines.length && (lines[descCursor] ?? "").trim() === "") descCursor += 1;
  if (lines[descCursor] !== description) {
    problems.push(
      `description: the paragraph after the badges is not byte-identical to package.json description`,
    );
  }

  // --- the required H2 set: present, in relative order, and none with an empty body ---
  const present = tops.map((h) => h.text);
  let previous = -1;
  for (const required of REQUIRED_H2) {
    const at = present.indexOf(required);
    if (at === -1) {
      problems.push(`section "${required}": missing`);
      continue;
    }
    if (at < previous) {
      problems.push(`section "${required}": out of order`);
    }
    previous = at;
    const index = all.findIndex((h) => h.level === 2 && h.text === required);
    if (bodyOf(md, all, index).trim() === "") {
      problems.push(`section "${required}": empty body`);
    }
  }
  const last = tops.at(-1)?.text;
  if (last !== "License") {
    problems.push(`section "License": must be the last H2, found ${JSON.stringify(last ?? "")}`);
  }

  // --- Status: the version, what the version CLAIMS, and a surface that is not covered ---
  const statusIndex = all.findIndex((h) => h.level === 2 && h.text === "Status");
  if (statusIndex !== -1) {
    const body = bodyOf(md, all, statusIndex);
    if (!body.includes("0.1.0")) problems.push('section "Status": does not name the version 0.1.0');
    if (!body.includes("The public API is settled and safe to depend on")) {
      problems.push(
        'section "Status": does not state that the public API is settled, in the words',
      );
    }
    if (!/not covered|still moving/i.test(body)) {
      problems.push('section "Status": names no surface that is still moving or not covered');
    }
  }

  // --- Install: a copy-pasteable command, the engine floor, the module format ---
  const installIndex = all.findIndex((h) => h.level === 2 && h.text === "Install");
  if (installIndex !== -1) {
    const body = bodyOf(md, all, installIndex);
    if (!/^pnpm add @cosyte\/dicom$/m.test(body)) {
      problems.push('section "Install": no copy-pasteable `pnpm add @cosyte/dicom` command');
    }
    if (!body.includes(">=22")) {
      problems.push('section "Install": does not state the Node engine floor of >=22');
    }
    if (!/dual ESM and CJS/.test(body)) {
      problems.push('section "Install": does not state the module format as dual ESM and CJS');
    }
  }

  // --- Usage: a runnable-looking example whose output is shown inline ---
  const blocks = tsBlocksUnder(md, "Usage");
  if (blocks.length === 0) {
    problems.push('section "Usage": carries no ```ts example');
  } else if (!blocks.some((b) => /\S.*;\s*\/\/ \S/.test(b))) {
    problems.push('section "Usage": no example shows its output inline');
  }

  return problems;
}

/**
 * The table of contents: present past the size the house rules set, listing every H2 in document
 * order, with every link resolving to a heading the same file carries.
 */
function tocProblems(md: string): string[] {
  const problems: string[] = [];
  const lines = md.split("\n");
  if (lines.length <= 100) return problems; // no table of contents is owed below the threshold

  const anchors = new Set(headings(md).map((h) => `#${slug(h.text)}`));
  const tops = h2s(md);
  const firstH2 = tops[0]?.line ?? lines.length;
  const head = lines.slice(0, firstH2).join("\n");

  const entries = [...head.matchAll(/^- \[([^\]]+)\]\((#[^)]*)\)\s*$/gm)].map((m) => ({
    label: m[1] ?? "",
    href: m[2] ?? "",
  }));

  if (entries.length === 0) {
    problems.push("table of contents: the file is over 100 lines and carries none");
    return problems;
  }

  for (const entry of entries) {
    if (!anchors.has(entry.href)) {
      problems.push(
        `table of contents: link ${entry.href} (${JSON.stringify(entry.label)}) resolves to no heading in the file`,
      );
    }
  }

  const listed = entries.map((e) => e.href);
  const expected = tops.map((h) => `#${slug(h.text)}`);
  if (listed.join("\n") !== expected.join("\n")) {
    const missing = expected.filter((a) => !listed.includes(a));
    for (const anchor of missing) {
      problems.push(`table of contents: does not list the H2 ${anchor}`);
    }
    if (missing.length === 0) {
      problems.push("table of contents: lists the H2 sections out of document order");
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe("README structure", () => {
  it("the shipped README satisfies every structural obligation", () => {
    expect(structureProblems(readme(), packageDescription())).toStrictEqual([]);
  });

  it("carries a table of contents whose every link resolves", () => {
    expect(tocProblems(readme())).toStrictEqual([]);
  });

  it("pins the banner byte for byte, alt string included", () => {
    // Stated as a whole-block equality as well as through the checker, because the tiles are
    // absolute for a deploy reason and the alt text is generated in another repo: a diff here has to
    // be deliberate and cross-repo, never a passing edit.
    const md = readme();
    expect(md.startsWith('<a href="https://cosyte.com">\n')).toBe(true);
    expect(md).toContain(
      [
        '<a href="https://cosyte.com">',
        "  <picture>",
        `    <source media="(prefers-color-scheme: dark)" srcset="${DARK_TILE}">`,
        `    <img alt="${BANNER_ALT}" src="${LIGHT_TILE}">`,
        "  </picture>",
        "</a>",
      ].join("\n"),
    );
    // Absolute, because npm does not resolve a relative image.
    expect(DARK_TILE.startsWith(TILE_BASE) && LIGHT_TILE.startsWith(TILE_BASE)).toBe(true);
  });

  it("every identifier the Usage examples import from the package is a public export", () => {
    // An LLM lifting a Usage block verbatim has to get code that resolves, so the bar is the export
    // set of the published barrel rather than "it looks right".
    const exported = publicExports();
    expect(exported.size).toBeGreaterThan(20);
    const imported = importedIdentifiers(tsBlocksUnder(readme(), "Usage").join("\n"));
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.filter((name) => !exported.has(name))).toStrictEqual([]);
  });

  it("still carries the technical claims the restructure relocated rather than removed", () => {
    // The restructure moved eight sections; a later edit that quietly drops one of them would leave
    // the required skeleton intact and pass every check above. These are the headings that content
    // lives under, so their absence is the detectable half of a deletion.
    const present = new Set(headings(readme()).map((h) => h.text));
    for (const heading of [
      "Known limitations & non-goals",
      "Real-World Tolerance",
      "Error Handling",
      "Profiles",
      "Cookbook",
      "Access patterns",
      "Roadmap",
      "Trademarks",
      "Supported transfer syntaxes",
    ]) {
      expect(present, heading).toContain(heading);
    }
  });

  // --- the mutation controls: each checker has to be able to go red, and to name what is wrong ---

  it("names the section at fault when a required section is MISSING", () => {
    const broken = readme().replace("## Status\n", "## Staus\n");
    expect(structureProblems(broken, packageDescription())).toContain('section "Status": missing');
  });

  it("names the section at fault when a required section is OUT OF ORDER", () => {
    // A REAL reshuffle, not a rename: both sections are still present and non-empty, and only their
    // order moved. A control that renamed one would exercise the `missing` arm instead and leave the
    // ordering arm certified by nothing, which is the shape this file's header refuses.
    const md = readme();
    const status = md.indexOf("## Status\n");
    const install = md.indexOf("## Install\n");
    const usage = md.indexOf("## Usage\n");
    expect(status).toBeLessThan(install);
    expect(install).toBeLessThan(usage);
    const broken = [
      md.slice(0, status),
      md.slice(install, usage), // Install
      md.slice(status, install), // Status
      md.slice(usage),
    ].join("");

    const problems = structureProblems(broken, packageDescription());
    expect(problems).toContain('section "Install": out of order');
    // And nothing else went wrong: the ordering arm is what reported, on its own.
    expect(problems.filter((p) => p.includes("missing") || p.includes("empty body"))).toStrictEqual(
      [],
    );
  });

  it("names the section at fault when a required section has an EMPTY BODY", () => {
    const md = readme();
    const start = md.indexOf("## Why this exists\n");
    const end = md.indexOf("## Status\n");
    const broken = `${md.slice(0, start)}## Why this exists\n\n${md.slice(end)}`;
    expect(structureProblems(broken, packageDescription())).toContain(
      'section "Why this exists": empty body',
    );
  });

  it("names the section at fault when License is no longer the last H2", () => {
    const broken = `${readme()}\n## Appendix\n\nSomething after the licence.\n`;
    expect(structureProblems(broken, packageDescription())).toContain(
      'section "License": must be the last H2, found "Appendix"',
    );
  });

  it("names the banner element at fault when the alt string is hand-edited", () => {
    const broken = readme().replace(BANNER_ALT, "Cosyte logo");
    expect(structureProblems(broken, packageDescription())).toContain(
      "banner: the alt string is not the one assets/alt-text.json generates",
    );
  });

  it("names the banner element at fault when a tile URL is made relative", () => {
    const broken = readme().replace(DARK_TILE, "./tile/cosyte-lockup-tile-on-dark-1200x300.png");
    expect(structureProblems(broken, packageDescription())).toContain(
      "banner: the dark tile is not on the <source> srcset, absolute under the deploy",
    );
  });

  it("refuses a description that has drifted from package.json", () => {
    const problems = structureProblems(readme(), "Something else entirely.");
    expect(problems.some((p) => p.startsWith("description: the paragraph after the badges"))).toBe(
      true,
    );
  });

  it("refuses a tagline of 120 characters or more", () => {
    const md = readme();
    const original = /^> .*$/m.exec(md)?.[0] ?? "";
    const broken = md.replace(original, `> ${"x".repeat(TAGLINE_MAX)}`);
    const problems = structureProblems(broken, packageDescription());
    expect(problems.some((p) => p.startsWith("tagline:"))).toBe(true);
  });

  it("refuses a badge set that is not the house four, in the house order", () => {
    const md = readme();
    const broken = md.replace(
      "[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/dicom/ci.yml?branch=main&label=CI)](https://github.com/cosyte/dicom/actions/workflows/ci.yml)\n",
      "",
    );
    expect(structureProblems(broken, packageDescription())).toContain(
      "badges: found 3 badges after the tagline, require 4",
    );
  });

  it("names the unresolved link when a table-of-contents entry points at no heading", () => {
    const broken = readme().replace("(#phi-and-safety)", "(#phi-safety)");
    const problems = tocProblems(broken);
    expect(
      problems.some((p) => p.includes("#phi-safety") && p.includes("resolves to no heading")),
    ).toBe(true);
  });

  it("names the H2 a table of contents forgets to list", () => {
    const broken = readme().replace("- [Cookbook](#cookbook)\n", "");
    expect(tocProblems(broken)).toContain("table of contents: does not list the H2 #cookbook");
  });

  it("the slug function reproduces GitHub's anchors, double hyphen included", () => {
    // The comparator's own control. A slug that collapsed the run left by a dropped `&` would
    // certify a link that resolves nowhere, which is the exact failure the TOC check exists for.
    expect(slug("Known limitations & non-goals")).toBe("known-limitations--non-goals");
    expect(slug("PHI and safety")).toBe("phi-and-safety");
    expect(slug("API")).toBe("api");
    expect(slug("Why this exists")).toBe("why-this-exists");
  });
});

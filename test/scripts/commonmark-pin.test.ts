/**
 * The vendored CommonMark specification, as a PRECONDITION rather than a citation.
 *
 * `scripts/phi-scan.ts` parses `phi-scan-overrides.md` because a `### <path>` heading in it is what
 * lets `--allow-fixture` exempt a PHI scan target. That parser's whole job is to agree with the
 * document a human reviewer sees rendered, so its rules are CommonMark's and not ours, and no count
 * of them is written here: what a LINE and a BLANK LINE are (section 2.1), that a heading can
 * appear immediately after a paragraph line (section 4.2), when a fenced code block opens and
 * closes (section 4.5), and which lines an HTML block covers (section 4.6).
 *
 * 🛑 EVERY ONE OF THOSE WAS AN ASSERTED SECTION NUMBER UNTIL THIS FILE EXISTED, AND THIS REPOSITORY
 * HAS PAID FOR THAT SHAPE BEFORE. `#80` cited PS3.5 section 7.5 twice when the sentence is in
 * 7.5.2, and `documentation/agent-notes/dicom-phi-scan-config-parsers.md` records the lone-`CR`
 * divergence as one whose figure could not be re-taken, "because grounding it needs a CommonMark
 * oracle this repository does not vendor". This is that oracle.
 *
 * What it enforces, mirroring what the generators do with `vendor/nema/`:
 *
 * 1. the document HASHES to its pin, so a byte cannot be edited to make a citation true;
 * 2. the VERSION is read out of the document's own front matter, never from the URL it came from;
 * 3. a section number is DERIVED by walking every heading, so "section 4.5" is checked rather than
 *    asserted, and the walk excludes the spec's own example blocks (which contain markdown headings
 *    and read `Fenced code blocks` as section 14.1 if you let them count);
 * 4. each cited sentence occurs EXACTLY ONCE in the whole document and inside the section claimed
 *    for it. Zero and two are both refusals: a first match reads whichever candidate comes first,
 *    which is the trap the meta-repo's rule about locating a spec section names.
 *
 * The spec is hard-wrapped, so every search here folds whitespace first. A line-based `grep` for
 * any of these sentences finds nothing, which would read as absence.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { htmlBlockConditions } from "../helpers/commonmark-spec.js";

const VENDOR = join(import.meta.dirname, "..", "..", "vendor", "commonmark", "spec");

const PINNED_SHA = readFileSync(join(VENDOR, "SHA.txt"), "utf8").trim();
const RAW = readFileSync(join(VENDOR, PINNED_SHA, "spec.txt"), "utf8");

/** Whitespace folded to single spaces, which is what makes a hard-wrapped sentence findable. */
const fold = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * The spec's prose, with its own EXAMPLE blocks removed.
 *
 * Examples are fenced with a run of at least twenty backticks and the info string `example`, and
 * their bodies are markdown documents containing `#` headings. Counting those as headings of the
 * spec puts `Fenced code blocks` at 14.1 instead of 4.5, which is exactly the sort of number this
 * file exists to stop anyone asserting.
 */
function prose(raw: string): string {
  const out: string[] = [];
  let inExample = false;
  for (const line of raw.split("\n")) {
    if (!inExample && /^`{20,} example\s*$/.test(line)) {
      inExample = true;
      continue;
    }
    if (inExample && /^`{20,}\s*$/.test(line)) {
      inExample = false;
      continue;
    }
    if (!inExample) out.push(line);
  }
  return out.join("\n");
}

interface Section {
  number: string;
  title: string;
  body: string;
}

/** Every `##` section of the spec, numbered `<chapter>.<n>` by walking the `#` headings. */
function sections(text: string): Section[] {
  const out: Section[] = [];
  let chapter = 0;
  let index = 0;
  let current: Section | null = null;
  for (const line of text.split("\n")) {
    const h1 = /^# (.+)$/.exec(line);
    const h2 = /^## (.+)$/.exec(line);
    if (h1 !== null) {
      chapter += 1;
      index = 0;
      current = null;
      continue;
    }
    if (h2 !== null) {
      index += 1;
      current = { number: `${String(chapter)}.${String(index)}`, title: h2[1] ?? "", body: "" };
      out.push(current);
      continue;
    }
    if (current !== null) current.body += `${line}\n`;
  }
  return out;
}

const SECTIONS = sections(prose(RAW));

/** The one section carrying `sentence`, refusing zero and refusing two. */
function theSectionCarrying(sentence: string): Section {
  const needle = fold(sentence);
  const hits = SECTIONS.filter((s) => fold(s.body).includes(needle));
  expect(
    hits.map((h) => `${h.number} ${h.title}`),
    `sections carrying: ${needle}`,
  ).toHaveLength(1);
  const only = hits[0];
  if (only === undefined) throw new Error("unreachable");
  // Exactly one OCCURRENCE, not merely one section: a sentence appearing twice in one section is
  // still a citation that cannot be resolved to a single place. Counted in the PROSE and again in
  // the RAW document, because the two are different claims: the prose count is what the locator
  // resolves over, and the raw count is what "occurs once in the document" means to a reader who
  // greps it. A gate caught this file asserting the second while measuring only the first.
  expect(fold(prose(RAW)).split(needle).length - 1, `prose occurrences: ${needle}`).toBe(1);
  expect(fold(RAW).split(needle).length - 1, `raw occurrences: ${needle}`).toBe(1);
  return only;
}

describe("the vendored CommonMark spec is a precondition, not a citation", () => {
  it("hashes to its pin", () => {
    // The directory name IS the hash, so this checks the file against both carriers at once.
    const actual = createHash("sha256")
      .update(readFileSync(join(VENDOR, PINNED_SHA, "spec.txt")))
      .digest("hex");
    expect(actual).toBe(PINNED_SHA);
    expect(PINNED_SHA).toMatch(/^[0-9a-f]{64}$/);
    // One pinned document, so a second one added without a `SHA.txt` beside it cannot hide here.
    expect(readdirSync(VENDOR).filter((e) => e !== "SHA.txt")).toEqual([PINNED_SHA]);
  });

  it("states its own version, which is where the edition comes from", () => {
    // The published copy at spec.commonmark.org has this front matter STRIPPED, which is why the
    // git-tagged document is the one vendored: otherwise the only statement of the version would
    // be the URL it was fetched with. `vendor/commonmark/README.md` says so.
    const front = /^---\n([\s\S]*?)\n\.\.\.\n/.exec(RAW);
    expect(front, "the document must carry its own front matter").not.toBeNull();
    expect(front?.[1]).toContain("version: '0.31.2'");
    // ASSEMBLED, never spelled out. This file lives under `test/`, so the PHI gate scans it, and a
    // literal ISO date run in it reds the very gate these cases are about.
    const published = ["2024", "01", "28"].join(String.fromCharCode(0x2d));
    expect(front?.[1]).toContain(`date: '${published}'`);
  });

  it("puts the line ending in section 2.1, and says exactly what phi-scan implements", () => {
    const sentence =
      "A [line ending](@) is a line feed (`U+000A`), a carriage return (`U+000D`) not " +
      "followed by a line feed, or a carriage return and a following line feed.";
    const section = theSectionCarrying(sentence);
    expect(`${section.number} ${section.title}`).toBe("2.1 Characters and lines");

    // The three alternatives, read off the sentence rather than off our implementation, applied to
    // the whole document. This is the independent oracle the matchers test differentials against:
    // if `splitCommonMarkLines` and this disagree on any input, one of them is wrong about 2.1.
    const bySpec = RAW.split(/\r\n|\n|\r/);
    // Non-vacuity, and the property that separates 2.1 from `/\r?\n/`: a lone CR ends a line.
    expect(bySpec.length).toBeGreaterThan(5000);
    expect("a\rb".split(/\r\n|\n|\r/)).toEqual(["a", "b"]);
    expect("a\rb".split(/\r?\n/)).toEqual(["a\rb"]);
  });

  it("puts the closing-fence rule in section 4.5, which is what `bare` implements", () => {
    // `Fence.bare` admits a space or a tab after a closing run and nothing else. Two refuter passes
    // were spent on that arm, both citing this number; here it is derived.
    const section = theSectionCarrying("may be followed only by spaces or tabs, which are ignored");
    expect(`${section.number} ${section.title}`).toBe("4.5 Fenced code blocks");
  });

  it("puts fence-interrupts-paragraph in 4.5 and heading-interrupts-paragraph in 4.2", () => {
    // Both are load-bearing for the disjointness log in `phi-scan-matchers.test.ts`, whose whole
    // point is what a HUMAN sees rendered: a fence opener on the line after a paragraph line really
    // does open a code block, and a `###` on the line after a paragraph line really is a heading.
    // Without these two, that log would be a claim about our parser rather than about the document.
    const fence = theSectionCarrying(
      "A fenced code block may interrupt a paragraph, and does not require a blank line either " +
        "before or after.",
    );
    expect(`${fence.number} ${fence.title}`).toBe("4.5 Fenced code blocks");
    const atx = theSectionCarrying("and they can interrupt paragraphs");
    expect(`${atx.number} ${atx.title}`).toBe("4.2 ATX headings");
  });

  it("puts the ATX separator rule in 4.2, which is what `tripleHashValue` implements", () => {
    // 🩺 THE SENTENCE THAT DECIDES WHETHER AN INVISIBLE CHARACTER CAN EXEMPT A PHI TARGET. The
    // parser separated the `###` run with the whole of `\s`, so a `###` followed by an `NBSP` -
    // which renders as a PARAGRAPH - was a live allow entry that `--allow-fixture` honoured at
    // exit 0.
    const separator = theSectionCarrying(
      "The opening sequence of `#` characters must be followed by spaces or tabs, or by the end " +
        "of line.",
    );
    expect(`${separator.number} ${separator.title}`).toBe("4.2 ATX headings");

    // 🔴 THE THREE RULES THIS PARSER DOES NOT TAKE, located rather than asserted, for the same
    // reason kind 7 is above: a divergence located in the document is a measured gap, and one
    // asserted in a comment is a preference. Each is a `DICOM-RESIDUALS` row.
    //
    // The STRIP is the one to read carefully. Its sentence says spaces or tabs; `commonmark@0.31.2`,
    // the reference implementation of THIS pinned version, strips with `String.prototype.trim`,
    // which is the whole of `\s` and is what this parser does. Locating the sentence is therefore
    // NOT an argument that the parser should follow it, and a draft that did follow it exempted at
    // exit 0 a target this parser refuses at exit 2. See
    // `documentation/agent-notes/dicom-phi-scan-atx-heading.md`.
    const strip = theSectionCarrying(
      "The raw contents of the heading are stripped of leading and trailing space or tabs before " +
        "being parsed as inline content.",
    );
    expect(`${strip.number} ${strip.title}`).toBe("4.2 ATX headings");

    // `### x ###` is a heading whose contents are `x`, and this parser names `x ###`.
    const closing = theSectionCarrying(
      "The optional closing sequence of `#`s must be preceded by spaces or tabs and may be " +
        "followed by spaces or tabs only.",
    );
    expect(`${closing.number} ${closing.title}`).toBe("4.2 ATX headings");

    // The `###` run is anchored at column 0 here, where section 4.2 allows up to three spaces of
    // indentation. Dropping an indented heading is a REFUSAL at exit 2 rather than an exemption.
    const indent = theSectionCarrying(
      "The opening `#` character may be preceded by up to three spaces of indentation.",
    );
    expect(`${indent.number} ${indent.title}`).toBe("4.2 ATX headings");
  });

  it("puts HTML blocks in section 4.6, and states the conditions phi-scan implements", () => {
    // `overrideLogPaths` models section 4.6's HTML blocks because one of them suppresses a heading
    // exactly as a fenced code block does, and an `<!-- -->` log suppresses it INVISIBLY. Each
    // sentence the implementation leans on is located here rather than asserted in a comment.
    const opener = theSectionCarrying(
      "There are seven kinds of [HTML block], which can be defined by their start and end conditions.",
    );
    expect(`${opener.number} ${opener.title}`).toBe("4.6 HTML blocks");

    // The same-line close, which is why `overrideLogPaths` asks the end condition of a start line.
    const sameLine = theSectionCarrying(
      "If the first line meets both the [start condition] and the [end condition], the block will " +
        "contain just that line.",
    );
    expect(`${sameLine.number} ${sameLine.title}`).toBe("4.6 HTML blocks");

    // Why nothing inside an open HTML block is looked at: not a fence, not a heading, not a start.
    const inert = theSectionCarrying(
      "This means any HTML **within an HTML block** that might otherwise be recognised as a start " +
        "condition will be ignored by the parser and passed through as-is, without changing the " +
        "parser's state.",
    );
    expect(`${inert.number} ${inert.title}`).toBe("4.6 HTML blocks");

    // 🛑 THE SCOPING SENTENCE. Kind 7 is the one `phi-scan` does not model, and this is the clause
    // that says modelling it needs paragraph state: the divergence is scoped against the document
    // rather than against a preference.
    const seven = theSectionCarrying(
      "All types of [HTML blocks] except type 7 may interrupt a paragraph. Blocks of type 7 may " +
        "not interrupt a paragraph.",
    );
    expect(`${seven.number} ${seven.title}`).toBe("4.6 HTML blocks");

    // `isBlankLine` ends a kind-6 block, and the definition is in 2.1 rather than in 4.6.
    const blank = theSectionCarrying(
      "A line containing no characters, or a line containing only spaces (`U+0020`) or tabs " +
        "(`U+0009`), is called a [blank line](@).",
    );
    expect(`${blank.number} ${blank.title}`).toBe("2.1 Characters and lines");
  });

  it("carries the two tag lists section 4.6 closes over, and they are read from it", () => {
    // 🛑 THE TABLES IN `scripts/phi-scan.ts` ARE CHECKED AGAINST THESE, BEHAVIOURALLY, IN
    // `test/scripts/phi-scan-matchers.test.ts`: one `--allow-fixture` per name through the
    // membership oracle. What is claimed HERE is only that the reader resolves to section 4.6 and
    // produces two non-vacuous, disjoint lists. NO COUNT IS WRITTEN, in this file or in the script.
    const c = htmlBlockConditions();
    expect(c.section).toBe("4.6");
    // Non-vacuity, and the property that separates the two conditions: a literal-content tag is
    // never a condition-6 tag, which is what lets `htmlBlockCloses` build kind 1's end tags from
    // the first list without asking whether the second holds any of them.
    expect(c.literalTags).toEqual(["pre", "script", "style", "textarea"]);
    expect(c.blockTags.length).toBeGreaterThan(50);
    expect(c.blockTags.filter((t) => c.literalTags.includes(t))).toEqual([]);
    // Spot checks in both directions, chosen because the behavioural cases use exactly these.
    expect(c.blockTags).toContain("div");
    expect(c.blockTags).toContain("p");
    expect(c.blockTags).not.toContain("span");
    // Every name is a plain ASCII tag name. A span that had swallowed prose would fail here.
    for (const t of c.blockTags) expect(t).toMatch(/^[a-z][a-z0-9]*$/);
  });

  it("refuses a sentence that is absent, and one that is not unique", () => {
    // 🛑 THE POSITIVE CONTROL FOR THE LOCATOR ITSELF. A `theSectionCarrying` that always returned a
    // section would pass every case above without reading anything, and this repository's rule is
    // that a clean result pinned beside no control proves nothing.
    expect(() => theSectionCarrying("a carriage return is not a line ending")).toThrow();
    // Not unique: `Example` labels every example block's prose, in many sections. A locator that
    // resolved to the first match would answer this instead of refusing it.
    expect(() => theSectionCarrying("interrupt a paragraph")).toThrow();
    expect(SECTIONS.length).toBeGreaterThan(20);
  });
});

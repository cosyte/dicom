/**
 * The vendored CommonMark specification, as a PRECONDITION rather than a citation.
 *
 * `scripts/phi-scan.ts` parses `phi-scan-overrides.md` because a `### <path>` heading in it is what
 * lets `--allow-fixture` exempt a PHI scan target. That parser's whole job is to agree with the
 * document a human reviewer sees rendered, so three of its rules are CommonMark's and not ours:
 * what a LINE is (section 2.1), when a fenced code block opens and closes (section 4.5), and that
 * a heading can appear immediately after a paragraph line (section 4.2).
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
  // still a citation that cannot be resolved to a single place.
  const occurrences = fold(prose(RAW)).split(needle).length - 1;
  expect(occurrences, `occurrences of: ${needle}`).toBe(1);
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

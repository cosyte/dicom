/**
 * The vendored CommonMark specification, read as a PRECONDITION by anything that needs a list out
 * of it rather than a sentence.
 *
 * `test/scripts/commonmark-pin.test.ts` is what makes the document a precondition for the sentences
 * `scripts/phi-scan.ts` cites: it re-hashes the file, reads the version out of its own front
 * matter, derives every section number by walking the headings, and requires each cited sentence to
 * occur exactly once. This module exists for the one thing a sentence cannot carry: section 4.6's
 * two TAG LISTS, which `phi-scan.ts` holds as closed tables and which have to be checked against the
 * document rather than against whoever typed them.
 *
 * 🛑 IT RE-HASHES ON LOAD AND THROWS. A list read out of an edited document would be a fact about
 * the edit, and `vendor/nema/`'s generators refuse to run on a mismatch for the same reason.
 *
 * 🛑 EVERY ANCHOR IS REQUIRED TO OCCUR EXACTLY ONCE, in the section AND in the whole document. A
 * first match reads whichever candidate comes first, which is the trap the meta-repo's rule about
 * locating a spec section names, and this repository has paid for it: `#80` cited PS3.5 section 7.5
 * twice when the sentence is in 7.5.2.
 *
 * The spec is hard-wrapped, so everything here folds whitespace first. A line-based search for any
 * of these anchors finds nothing, which would read as absence.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VENDOR = join(import.meta.dirname, "..", "..", "vendor", "commonmark", "spec");

const PINNED_SHA = readFileSync(join(VENDOR, "SHA.txt"), "utf8").trim();

/** The pinned document, verified against its own pin before a single byte of it is believed. */
export const RAW: string = (() => {
  const bytes = readFileSync(join(VENDOR, PINNED_SHA, "spec.txt"));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== PINNED_SHA) {
    throw new Error(
      `vendored CommonMark spec does not match its pin: ${actual} against ${PINNED_SHA}`,
    );
  }
  return bytes.toString("utf8");
})();

/** Whitespace folded to single spaces, which is what makes a hard-wrapped sentence findable. */
export function fold(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The spec's prose, with its own EXAMPLE blocks removed.
 *
 * Their bodies are markdown documents containing `#` headings. Counting those as headings of the
 * spec puts `Fenced code blocks` at 14.1 instead of 4.5, and section 4.6's examples contain HTML
 * blocks whose text would be read as more of the normative list.
 */
export function prose(raw: string): string {
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

export interface Section {
  number: string;
  title: string;
  body: string;
}

/** Every `##` section of the spec, numbered `<chapter>.<n>` by walking the `#` headings. */
export function sections(text: string): Section[] {
  const out: Section[] = [];
  let chapter = 0;
  let index = 0;
  let current: Section | null = null;
  for (const line of text.split("\n")) {
    if (/^# .+$/.test(line)) {
      chapter += 1;
      index = 0;
      current = null;
      continue;
    }
    const h2 = /^## (.+)$/.exec(line);
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

const PROSE = prose(RAW);
const SECTIONS = sections(PROSE);

/** The one section whose title is `title`, refusing zero and refusing two. */
function theSectionTitled(title: string): Section {
  const hits = SECTIONS.filter((s) => s.title === title);
  if (hits.length !== 1) {
    throw new Error(`expected exactly one section titled ${title}, found ${String(hits.length)}`);
  }
  const only = hits[0];
  if (only === undefined) throw new Error("unreachable");
  return only;
}

/** The span of `body` between two anchors, each required to occur exactly once in the document. */
function spanBetween(body: string, from: string, to: string): string {
  for (const anchor of [from, to]) {
    const inSection = body.split(anchor).length - 1;
    const inDocument = fold(PROSE).split(anchor).length - 1;
    if (inSection !== 1 || inDocument !== 1) {
      throw new Error(
        `anchor ${JSON.stringify(anchor)} occurs ${String(inSection)} times in the section and ` +
          `${String(inDocument)} times in the document; exactly one of each is required`,
      );
    }
  }
  const start = body.indexOf(from) + from.length;
  const end = body.indexOf(to);
  if (end <= start) throw new Error(`anchors are out of order: ${JSON.stringify([from, to])}`);
  return body.slice(start, end);
}

/** Every `` `token` `` in `span`, in the document's order. */
function backticked(span: string): string[] {
  return [...span.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
}

export interface HtmlBlockConditions {
  /** The section number, DERIVED by walking the headings rather than asserted. */
  section: string;
  /** Start condition 1's names, with the leading `<` of each string stripped. */
  literalTags: string[];
  /** Start condition 6's names. */
  blockTags: string[];
}

/**
 * Section 4.6's two tag lists, read out of the pinned document.
 *
 * The anchors are the normative sentences' own words, and the two spans are told apart by the fact
 * that condition 1 ends "the string `>`, or the end of the line" while condition 6 ends "the end of
 * the line, the string `>`, or the string `/>`". Both are required to be unique in the document, so
 * neither can silently resolve to the other or to an example block.
 */
export function htmlBlockConditions(): HtmlBlockConditions {
  const section = theSectionTitled("HTML blocks");
  const body = fold(section.body);
  const literal = backticked(
    spanBetween(
      body,
      "**Start condition:** line begins with the string `<pre`",
      "(case-insensitive), followed by a space, a tab, the string `>`, or the end of the line.",
    ),
  );
  const block = backticked(
    spanBetween(
      body,
      "followed by one of the strings (case-insensitive) `address`",
      ", followed by a space, a tab, the end of the line, the string `>`, or the string `/>`.",
    ),
  );
  return {
    section: section.number,
    // The anchors are chosen to sit INSIDE the lists rather than around them, because a sentence
    // that names the first element is what makes the anchor unique. Each list's first name is
    // therefore restored here rather than being read twice.
    literalTags: ["pre", ...literal].map((t) => (t.startsWith("<") ? t.slice(1) : t)),
    blockTags: ["address", ...block],
  };
}

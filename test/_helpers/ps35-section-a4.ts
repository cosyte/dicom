/**
 * The Transfer Syntax UIDs PS3.5 2026c section A.4 names, and the four JPIP
 * Referenced UIDs its sections A.6, A.7, A.11 and A.12 name, read out of the
 * SHA-pinned vendored DocBook rather than typed into a test.
 *
 * This is the ORACLE the accepted-set and refused-set tests grade against, so it
 * is written independently of `scripts/generate-encapsulated-transfer-syntaxes.ts`
 * and of `src/parser/jpip-referenced.ts`: a defect in either that shipped a wrong
 * list would otherwise be copied into the expectation that is supposed to catch
 * it.
 *
 * Each section is located the way this repository locates every spec section:
 * never first-match. Every `xml:id="<id>"` is collected and exactly one is
 * required, then the section is cut at its MATCHING close tag, so nested
 * subsections (A.4.1 to A.4.x) are inside it. UIDs are matched on the
 * `1.2.840.10008.1.2` arc after removing U+200B ZERO WIDTH SPACE, which PS3.5's
 * DocBook uses as a line-break hint inside long UIDs; a trailing space after a
 * quoted UID is outside the match by construction. The closing quote in the
 * searched attribute is what keeps `sect_A.1` from matching `sect_A.11`.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UIDS } from "../../src/dictionary/generated/uids.js";

const PART05 = join(import.meta.dirname, "..", "..", "vendor", "nema", "part05");

/** The `xml:id`s of the four JPIP Referenced sections: A.6, A.7 and their HTJ2K pair A.11, A.12. */
export const JPIP_SECTION_IDS: readonly string[] = [
  "sect_A.6",
  "sect_A.7",
  "sect_A.11",
  "sect_A.12",
];

/** The four Transfer Syntaxes `parseDicom` accepted at `9de3bf8`, each with its own reader. */
export const NATIVE_TRANSFER_SYNTAXES: readonly string[] = [
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
  "1.2.840.10008.1.2.1.99",
];

/** Read the vendored PS3.5 whose SHA-256 `vendor/nema/part05/SHA.txt` pins. */
function part05Xml(): string {
  const sha = readFileSync(join(PART05, "SHA.txt"), "utf8").trim();
  return readFileSync(join(PART05, sha, "part05.xml"), "utf8");
}

/**
 * The text of the section whose `xml:id` is `id`, nested subsections included.
 * Throws unless exactly one section carries that `xml:id`.
 */
export function sectionById(id: string, xml: string = part05Xml()): string {
  const attribute = `xml:id="${id}"`;
  const hits: number[] = [];
  for (let at = xml.indexOf(attribute); at >= 0; at = xml.indexOf(attribute, at + 1)) {
    hits.push(at);
  }
  if (hits.length !== 1 || hits[0] === undefined) {
    throw new Error(`expected exactly one ${attribute}, found ${String(hits.length)}`);
  }
  const open = xml.lastIndexOf("<section", hits[0]);
  const tags = /<section\b|<\/section>/gu;
  tags.lastIndex = open;
  let depth = 0;
  for (let m = tags.exec(xml); m !== null; m = tags.exec(xml)) {
    depth += m[0] === "</section>" ? -1 : 1;
    if (depth === 0) return xml.slice(open, m.index + m[0].length);
  }
  throw new Error(`${id} has no matching </section>`);
}

/** The text of section A.4, nested subsections included. Throws unless exactly one section matches. */
export function sectionA4(xml: string = part05Xml()): string {
  return sectionById("sect_A.4", xml);
}

/** Every distinct Transfer Syntax UID the section text names, sorted by code units. */
export function transferSyntaxesIn(section: string): readonly string[] {
  const text = section.split(String.fromCharCode(0x200b)).join("");
  const found = new Set(text.match(/1\.2\.840\.10008\.1\.2(?:\.[0-9]+)*/gu) ?? []);
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Every distinct Transfer Syntax UID section A.4 names, sorted by code units. */
export function sectionA4TransferSyntaxes(section: string = sectionA4()): readonly string[] {
  return transferSyntaxesIn(section);
}

/**
 * The JPIP Referenced UIDs: the one UID each of sections A.6, A.7, A.11 and A.12
 * names, sorted by code units. Throws unless every section is located exactly
 * once and names exactly one Transfer Syntax UID.
 */
export function jpipTransferSyntaxes(xml: string = part05Xml()): readonly string[] {
  const uids = JPIP_SECTION_IDS.map((id) => {
    const named = transferSyntaxesIn(sectionById(id, xml));
    if (named.length !== 1 || named[0] === undefined) {
      throw new Error(`expected ${id} to name exactly one UID, found ${String(named.length)}`);
    }
    return named[0];
  });
  return [...new Set(uids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Every `TransferSyntax` row of the generated PS3.6 registry, retired or not. */
export function registeredTransferSyntaxes(): readonly string[] {
  return Object.values(UIDS)
    .filter((row) => row.type === "TransferSyntax")
    .map((row) => row.uid);
}

/** The encapsulation set: the UIDs section A.4 names. */
export const ENCAPSULATION_SET: readonly string[] = sectionA4TransferSyntaxes();

/** The JPIP set: the UIDs sections A.6, A.7, A.11 and A.12 name, one each. */
export const JPIP_SET: readonly string[] = jpipTransferSyntaxes();

/**
 * The unsupported set: every registered Transfer Syntax that is neither native,
 * nor in section A.4, nor one of the four JPIP Referenced UIDs.
 */
export const UNSUPPORTED_SET: readonly string[] = registeredTransferSyntaxes().filter(
  (uid) =>
    !NATIVE_TRANSFER_SYNTAXES.includes(uid) &&
    !ENCAPSULATION_SET.includes(uid) &&
    !JPIP_SET.includes(uid),
);

/**
 * The Transfer Syntax UIDs PS3.5 2026c section A.4 names, read out of the
 * SHA-pinned vendored DocBook rather than typed into a test.
 *
 * This is the ORACLE the encapsulation-set tests grade against, so it is written
 * independently of `scripts/generate-encapsulated-transfer-syntaxes.ts`: a
 * defect in the generator that shipped a wrong list would otherwise be copied
 * into the expectation that is supposed to catch it.
 *
 * The section is located the way this repository locates every spec section:
 * never first-match. Every `xml:id="sect_A.4"` is collected and exactly one is
 * required, then the section is cut at its MATCHING close tag, so the nested
 * A.4.1 to A.4.x subsections are inside it. UIDs are matched on the
 * `1.2.840.10008.1.2` arc after removing U+200B ZERO WIDTH SPACE, which PS3.5's
 * DocBook uses as a line-break hint inside long UIDs; a trailing space after a
 * quoted UID is outside the match by construction.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UIDS } from "../../src/dictionary/generated/uids.js";

const PART05 = join(import.meta.dirname, "..", "..", "vendor", "nema", "part05");
const SECTION_ID = 'xml:id="sect_A.4"';

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

/** The text of section A.4, nested subsections included. Throws unless exactly one section matches. */
export function sectionA4(xml: string = part05Xml()): string {
  const hits: number[] = [];
  for (let at = xml.indexOf(SECTION_ID); at >= 0; at = xml.indexOf(SECTION_ID, at + 1)) {
    hits.push(at);
  }
  if (hits.length !== 1 || hits[0] === undefined) {
    throw new Error(`expected exactly one ${SECTION_ID}, found ${String(hits.length)}`);
  }
  const open = xml.lastIndexOf("<section", hits[0]);
  const tags = /<section\b|<\/section>/gu;
  tags.lastIndex = open;
  let depth = 0;
  for (let m = tags.exec(xml); m !== null; m = tags.exec(xml)) {
    depth += m[0] === "</section>" ? -1 : 1;
    if (depth === 0) return xml.slice(open, m.index + m[0].length);
  }
  throw new Error("section A.4 has no matching </section>");
}

/** Every distinct Transfer Syntax UID section A.4 names, sorted by code units. */
export function sectionA4TransferSyntaxes(section: string = sectionA4()): readonly string[] {
  const text = section.split(String.fromCharCode(0x200b)).join("");
  const found = new Set(text.match(/1\.2\.840\.10008\.1\.2(?:\.[0-9]+)*/gu) ?? []);
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Every `TransferSyntax` row of the generated PS3.6 registry, retired or not. */
export function registeredTransferSyntaxes(): readonly string[] {
  return Object.values(UIDS)
    .filter((row) => row.type === "TransferSyntax")
    .map((row) => row.uid);
}

/** The encapsulation set: the UIDs section A.4 names. */
export const ENCAPSULATION_SET: readonly string[] = sectionA4TransferSyntaxes();

/** The unsupported set: every registered Transfer Syntax that is neither native nor in section A.4. */
export const UNSUPPORTED_SET: readonly string[] = registeredTransferSyntaxes().filter(
  (uid) => !NATIVE_TRANSFER_SYNTAXES.includes(uid) && !ENCAPSULATION_SET.includes(uid),
);

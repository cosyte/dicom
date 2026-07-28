#!/usr/bin/env tsx
//
// PS3.5 section 7.6 Repeating Groups -> committed TS module.
//
// Runs via `pnpm gen:repeating-groups` (devDep `tsx`). Writes:
//   - src/dictionary/generated/repeating-groups.ts  (REPEATING_GROUP_RANGES)
//
// WHY THIS GENERATOR EXISTS
//
// `(50xx,xxxx)`, `(60xx,3000)` and `(60xx,4000)` are marked X by PS3.15 Table
// E.1-1, and `deidentify()` removes every concrete tag a mask covers. Which
// concrete tags a mask covers is therefore a safety bound in both directions:
// too wide deletes data the standard never marked, too narrow leaves a patient
// identifier in a file whose whole contract is that it does not. That bound used
// to be TRANSCRIBED into src/dictionary/repeating-groups.ts with citations. A
// transcription is a claim; this generator makes it a fact, read out of the same
// normative documents PS3.6 and PS3.15 are already read out of.
//
// TWO NORMATIVE INPUTS, AND WHY THERE ARE TWO
//
//   - vendor/nema/part05/<sha256>/part05.xml -- PS3.5 current DocBook.
//     Publishes the OVERLAY bound directly: "Repeating Groups shall only be
//     allowed in the even numbered Groups 6000-601E."
//
//   - vendor/nema/part05-2004/<sha256>/04_05pu.pdf -- PS3.5-2004.
//     Publishes the CURVE bound: "... the even Groups (6000-601E,eeee) and even
//     Groups (5000-501E,eeee) cases."
//
// The current edition does NOT state the curve bound. It retired curve encoding
// and delegates, in section 7.6's own Note, to PS3.5-2004 at an explicit URL.
// So the second document is not a convenience: it is the authority the first one
// names, and vendoring only the first would leave half the bound transcribed.
// This generator PROVES the delegation rather than assuming it -- it requires
// section 7.6 to carry a link to exactly the URL of the document vendored under
// part05-2004/, so a future edition that re-states the bound inline, or points
// somewhere else, fails here instead of being silently overridden by a stale PDF.
//
// THE CROSS-CHECK
//
// Both documents state the OVERLAY bound. The generator parses it from each
// independently and requires them to agree. That is a real gate, not ceremony:
// it is what makes a mutation of either document red, and it is the reason the
// 2004 PDF cannot quietly drift away from the edition in force.
//
// There is deliberately NO staleness clock, for the same reasons written down in
// vendor/nema/README.md for PS3.6 and PS3.15: a date gate fires the day it is
// written, demands an action nobody can take on demand, and reds unrelated pull
// requests. What CI gates is byte-identical regen, offline and deterministic.
//
// Output is deterministic (no wall-clock, sorted by prefix, frozen literals).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync, constants as zlibConstants } from "node:zlib";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PART05_ROOT = join(REPO_ROOT, "vendor", "nema", "part05");
const PART05_2004_ROOT = join(REPO_ROOT, "vendor", "nema", "part05-2004");

/**
 * The URL PS3.5 section 7.6's Note delegates the curve bound to. The document
 * vendored under `part05-2004/` is the document at this URL, and the generator
 * refuses to run unless the current edition still points here.
 */
const PS35_2004_URL = "http://medical.nema.org/MEDICAL/Dicom/2004/printed/04_05pu.pdf";

function fail(message: string): never {
  console.error("generate-repeating-groups: " + message);
  process.exit(1);
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// ----------------------------------------------------------------------------
// Pinned-input plumbing. The pin is a precondition, not a comment.
// ----------------------------------------------------------------------------

function readPinnedSha(root: string, label: string): string {
  const shaFile = join(root, "SHA.txt");
  let raw: string;
  try {
    raw = readFileSync(shaFile, "utf8").trim().split(/\s+/)[0] ?? "";
  } catch (err) {
    fail("cannot read " + shaFile + ": " + String(err));
  }
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    fail(label + "/SHA.txt must contain a 64-char hex SHA-256 (got: '" + raw + "')");
  }
  return raw.toLowerCase();
}

function readPinnedFile(root: string, label: string, sha: string, filename: string): Buffer {
  const path = join(root, sha, filename);
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch (err) {
    fail("cannot read " + path + ": " + String(err));
  }
  const actual = sha256(buf);
  if (actual !== sha) {
    fail(
      label +
        " pin mismatch:\n  pinned:   " +
        sha +
        "\n  on disk:  " +
        actual +
        "\n  file:     " +
        path +
        "\nRe-fetch the document and update SHA.txt, or restore the pinned bytes.",
    );
  }
  return buf;
}

// ----------------------------------------------------------------------------
// PS3.5 current edition (DocBook XML).
// ----------------------------------------------------------------------------

/** Pull the edition out of `<subtitle>DICOM PS3.5 2026c - Data Structures ...</subtitle>`. */
function part05Edition(xml: string): string {
  const m = /<subtitle>\s*DICOM PS3\.5 ([0-9]{4}[a-z]?) - [^<]*<\/subtitle>/.exec(xml);
  if (!m?.[1]) {
    fail(
      "part05.xml: cannot find the `<subtitle>DICOM PS3.5 <edition> - ...</subtitle>` line. " +
        "Refusing to generate from a document that does not identify itself as PS3.5.",
    );
  }
  return m[1];
}

/**
 * Slice out `<section ... xml:id="sect_7.6"> ... </section>`.
 *
 * Scoped deliberately. `04_05pu.pdf` is linked from seven places in the current
 * edition and the phrase "Repeating Groups" appears outside section 7.6 too;
 * reading the whole document would let an unrelated paragraph satisfy a check
 * that is supposed to be about the normative bound.
 */
function part05Section76(xml: string): string {
  const at = xml.indexOf('xml:id="sect_7.6"');
  if (at < 0) {
    fail('part05.xml: no section carrying `xml:id="sect_7.6"` (Repeating Groups).');
  }
  const open = xml.lastIndexOf("<section", at);
  const close = xml.indexOf("</section>", at);
  if (open < 0 || close < 0) {
    fail("part05.xml: section 7.6 is not a well-formed <section> element.");
  }
  const frag = xml.slice(open, close + "</section>".length);
  // Section 7.6 has no nested subsections. If a future edition adds one, the
  // slice above would stop at the inner close tag and silently read a fragment,
  // so refuse rather than parse a partial section.
  if (frag.slice("<section".length).includes("<section")) {
    fail(
      "part05.xml: section 7.6 now contains a nested <section>; the slice would be partial. " +
        "Re-read this generator's section slicing before trusting its bound.",
    );
  }
  if (!/<title>\s*Repeating Groups\s*<\/title>/.test(frag)) {
    fail(
      "part05.xml: section 7.6 is not titled 'Repeating Groups'. Refusing to read a bound from it.",
    );
  }
  return frag;
}

/** Strip DocBook markup to running text, so a sentence can be matched across tags. */
function xmlText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------------------------
// PS3.5-2004 (PDF).
//
// The 2004 edition predates NEMA's DocBook sources; it is published only as PDF,
// which is why this reader exists at all. It is intentionally minimal and it is
// NOT a general PDF parser: it inflates the Flate-compressed content streams and
// concatenates the literal strings shown by the text operators. That is enough to
// recover a sentence verbatim, which is the only thing asked of it, and the
// result is checked against a precise expected shape rather than trusted.
// ----------------------------------------------------------------------------

function pdfText(buf: Buffer): string {
  // `stream` also occurs as the tail of `endstream`; require a non-letter before
  // it so the second is never mistaken for the first.
  const latin = buf.toString("latin1");
  const marker = /(?<![A-Za-z])stream\r?\n/g;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    try {
      // Inflate from the stream start and let zlib stop at the end of the deflate
      // data. Trailing bytes are ignored, so this never depends on `/Length` being
      // right or on locating `endstream`, both of which a mutation would disturb.
      const inflated = inflateSync(buf.subarray(start), {
        finishFlush: zlibConstants.Z_SYNC_FLUSH,
      });
      chunks.push(inflated.toString("latin1"));
    } catch {
      // Not a deflate stream (image data, or an object with a different filter).
    }
  }
  if (chunks.length === 0) {
    fail("04_05pu.pdf: no inflatable content streams found. Refusing to read a bound from it.");
  }
  // Literal strings shown by Tj / TJ. Escapes are unwrapped so `\(` inside a
  // string does not terminate it, which matters here: every tag in the sentence
  // being read is parenthesised.
  const content = chunks.join("\n");
  let out = "";
  const literal = /\((?:\\.|[^\\()])*\)/gs;
  let s: RegExpExecArray | null;
  while ((s = literal.exec(content)) !== null) {
    out += s[0].slice(1, -1).replace(/\\([()\\])/g, "$1");
  }
  return out.replace(/\s+/g, " ").trim();
}

// ----------------------------------------------------------------------------
// The bound itself.
// ----------------------------------------------------------------------------

interface DerivedRange {
  readonly prefix: number;
  readonly lowMin: number;
  readonly lowMax: number;
  readonly label: string;
  /** Verbatim sentence the bound was read from, for the emitted citation. */
  readonly citation: string;
  /** Which document supplied it. */
  readonly source: string;
}

/**
 * Turn a `GGGG`-`GGGG` pair into a validated range.
 *
 * Every property the runtime matcher relies on is checked here rather than
 * assumed, because this is the one place a malformed read could widen a removal:
 * one shared high byte, both ends even, and a non-empty ascending span.
 */
function toRange(
  lo: string,
  hi: string,
  label: string,
  citation: string,
  source: string,
  where: string,
): DerivedRange {
  const loN = Number.parseInt(lo, 16);
  const hiN = Number.parseInt(hi, 16);
  const prefix = loN >> 8;
  if (hiN >> 8 !== prefix) {
    fail(where + ": bound " + lo + "-" + hi + " spans two group prefixes; refusing to expand it.");
  }
  const lowMin = loN & 0xff;
  const lowMax = hiN & 0xff;
  if (lowMin % 2 !== 0 || lowMax % 2 !== 0) {
    fail(where + ": bound " + lo + "-" + hi + " is not even at both ends.");
  }
  if (lowMax <= lowMin) {
    fail(where + ": bound " + lo + "-" + hi + " is not an ascending, non-empty range.");
  }
  return { prefix, lowMin, lowMax, label, citation, source };
}

function expand(r: DerivedRange): number[] {
  const out: number[] = [];
  for (let low = r.lowMin; low <= r.lowMax; low += 2) out.push((r.prefix << 8) | low);
  return out;
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

// ----------------------------------------------------------------------------
// Emit.
// ----------------------------------------------------------------------------

function escapeJsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function emit(
  ranges: readonly DerivedRange[],
  prov: {
    readonly edition: string;
    readonly part05Sha: string;
    readonly part052004Sha: string;
  },
): string {
  const lines: string[] = [];
  lines.push("/* eslint-disable */");
  lines.push("// AUTO-GENERATED by scripts/generate-repeating-groups.ts -- DO NOT EDIT BY HAND.");
  lines.push("// Regen: pnpm gen:repeating-groups");
  lines.push("//");
  lines.push("// Normative sources, both pinned by SHA-256 and re-hashed before use:");
  lines.push("//   NEMA DICOM PS3.5 " + prov.edition + " DocBook, section 7.6 (Repeating Groups).");
  lines.push("//     vendor/nema/part05/<sha>/part05.xml -> " + prov.part05Sha);
  lines.push("//   NEMA DICOM PS3.5-2004, section 7.6, the edition the current one's Note");
  lines.push("//   delegates the retired curve bound to.");
  lines.push("//     vendor/nema/part05-2004/<sha>/04_05pu.pdf -> " + prov.part052004Sha);
  lines.push("//");
  lines.push("// Which concrete group numbers a `50xx` / `60xx` mask covers, on the");
  lines.push("// DE-IDENTIFY path. Sixteen even groups per mask, not 256. The bound is read");
  lines.push("// out of the documents above, not transcribed; the sentences it was read from");
  lines.push("// are reproduced verbatim on each entry below.");
  lines.push("");
  lines.push('import type { RepeatingGroupRange } from "../repeating-groups.js";');
  lines.push("");
  lines.push("/**");
  lines.push(" * Every group-number mask PS3.5 section 7.6 defines, keyed by the printed");
  lines.push(" * two-hex-digit prefix. A mask on any other prefix is not a repeating group and");
  lines.push(" * must not be expanded: `(7Fxx,0010)` Variable Pixel Data, for instance, is a");
  lines.push(" * retired registry mask with no PS3.5 repeating-group semantics behind it.");
  lines.push(" *");
  lines.push(" * Each entry carries, verbatim above it, the normative sentence its bound was");
  lines.push(" * read from and which pinned edition supplied it.");
  lines.push(" *");
  lines.push(" * @example");
  lines.push(" * ```ts");
  lines.push(' * REPEATING_GROUP_RANGES["60"]?.lowMax; // 0x1e');
  lines.push(' * REPEATING_GROUP_RANGES["7F"];         // undefined - not a repeating group');
  lines.push(" * ```");
  lines.push(" */");
  lines.push(
    "export const REPEATING_GROUP_RANGES: Readonly<Record<string, RepeatingGroupRange>> = Object.freeze({",
  );
  for (const r of ranges) {
    const groups = expand(r);
    lines.push("  // " + r.source + ", verbatim: " + '"' + r.citation + '"');
    lines.push(
      "  // -> " +
        hex4(groups[0] ?? 0) +
        "-" +
        hex4(groups[groups.length - 1] ?? 0) +
        " even (" +
        String(groups.length) +
        " groups)",
    );
    lines.push(
      '  "' +
        r.prefix.toString(16).toUpperCase().padStart(2, "0") +
        '": Object.freeze({ prefix: 0x' +
        r.prefix.toString(16) +
        ", lowMin: 0x" +
        r.lowMin.toString(16).padStart(2, "0") +
        ", lowMax: 0x" +
        r.lowMax.toString(16).padStart(2, "0") +
        ', label: "' +
        escapeJsString(r.label) +
        '" }),',
    );
  }
  lines.push("});");
  lines.push("");
  lines.push(
    '/** The printed prefixes {@link REPEATING_GROUP_RANGES} covers, e.g. `["50", "60"]`. */',
  );
  lines.push("export const REPEATING_GROUP_PREFIXES: readonly string[] = Object.freeze(");
  lines.push("  Object.keys(REPEATING_GROUP_RANGES).sort(),");
  lines.push(");");
  lines.push("");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Main.
// ----------------------------------------------------------------------------

function main(): void {
  // --- PS3.5, current edition -------------------------------------------------
  const part05Sha = readPinnedSha(PART05_ROOT, "vendor/nema/part05");
  const part05Buf = readPinnedFile(PART05_ROOT, "vendor/nema/part05", part05Sha, "part05.xml");
  const xml = part05Buf.toString("utf8");
  const edition = part05Edition(xml);
  console.log(
    "[gen:repeating-groups] PS3.5 edition: " + edition + " (sha256 " + part05Sha.slice(0, 12) + ")",
  );

  const sec76 = part05Section76(xml);
  const sec76Text = xmlText(sec76);

  // The word "even" in the patterns below is load-bearing, not incidental phrasing.
  // The bound is a range PLUS a step, and the step is what excludes the odd groups;
  // `expandRepeatingGroups` walks by 2 and `matchesRepeatingPattern` rejects an odd
  // low byte. Requiring the literal "even numbered Groups" / "even Groups" wording to
  // be present is how that step stays anchored to the document: an edition that
  // stopped saying it would fail to match here rather than silently leaving the
  // runtime stepping by 2 on its own authority. `toRange` additionally proves both
  // endpoints are even, so a matched sentence with an odd endpoint is still refused.

  // The overlay bound, stated normatively by the current edition.
  const overlayShall =
    /Repeating Groups shall only be allowed in the even numbered Groups ([0-9A-F]{4})-([0-9A-F]{4})\./.exec(
      sec76Text,
    );
  if (!overlayShall?.[1] || !overlayShall[2]) {
    fail(
      "part05.xml section 7.6: cannot find the normative sentence " +
        '"Repeating Groups shall only be allowed in the even numbered Groups GGGG-GGGG." ' +
        "Refusing to fall back to a transcribed bound.",
    );
  }

  // The family label, read from the document rather than named here.
  const overlayLabelM =
    /Standard Data Elements with even Group Numbers ([0-9A-F]{4})-([0-9A-F]{4}) represent (Overlay Planes)\./.exec(
      sec76Text,
    );
  if (!overlayLabelM?.[3]) {
    fail(
      "part05.xml section 7.6: cannot find the sentence naming what the even Groups " +
        "GGGG-GGGG represent. The label would otherwise be asserted here rather than read.",
    );
  }
  if (overlayLabelM[1] !== overlayShall[1] || overlayLabelM[2] !== overlayShall[2]) {
    fail(
      "part05.xml section 7.6: the descriptive sentence bounds " +
        overlayLabelM[1] +
        "-" +
        overlayLabelM[2] +
        ' but the normative "shall" sentence bounds ' +
        overlayShall[1] +
        "-" +
        overlayShall[2] +
        ". The section contradicts itself; refusing to pick one.",
    );
  }

  const overlayCurrent = toRange(
    overlayShall[1],
    overlayShall[2],
    overlayLabelM[3],
    "Repeating Groups shall only be allowed in the even numbered Groups " +
      overlayShall[1] +
      "-" +
      overlayShall[2] +
      ".",
    "PS3.5 " + edition + " section 7.6",
    "part05.xml section 7.6",
  );

  // The odd groups. Not a range this generator emits -- it is the sentence that
  // makes the EXCLUSION of `6001`-`601F` normative rather than inferred from
  // "even", and `(6001,4000)` not matching is a tested property of the matcher.
  const oddNote =
    /Private Groups in the odd Group Numbers ([0-9A-F]{4})-([0-9A-F]{4}) may still be used, but there is no implication of repeating semantics/.exec(
      sec76Text,
    );
  if (!oddNote?.[1]) {
    fail(
      "part05.xml section 7.6: cannot find the Note excluding the odd Group Numbers from " +
        "repeating semantics. That exclusion is why (6001,4000) must not match.",
    );
  }
  console.log(
    "[gen:repeating-groups] odd groups excluded by section 7.6 Note: " +
      oddNote[1] +
      "-" +
      oddNote[2] +
      " (no repeating semantics)",
  );

  // --- The delegation, proved rather than assumed ------------------------------
  const curveRetired =
    /Encoding of Curves in the even Group Numbers ([0-9A-F]{2})xx was previously defined but has been retired\./.exec(
      sec76Text,
    );
  if (!curveRetired?.[1]) {
    fail(
      "part05.xml section 7.6: cannot find the Note retiring curve encoding in the even " +
        "Group Numbers NNxx. If the current edition now states the curve bound inline, read it " +
        "from there instead of from the 2004 edition.",
    );
  }
  if (!sec76.includes(PS35_2004_URL)) {
    fail(
      "part05.xml section 7.6 does not link " +
        PS35_2004_URL +
        ", which is the document vendored under vendor/nema/part05-2004/. The curve bound is " +
        "only taken from the 2004 edition because the edition in force delegates to it; without " +
        "that link the delegation is unproven and the 2004 bound must not be used.",
    );
  }
  console.log(
    "[gen:repeating-groups] section 7.6 retires curves in " +
      curveRetired[1] +
      "xx and delegates to " +
      PS35_2004_URL,
  );

  // --- PS3.5-2004 --------------------------------------------------------------
  const p2004Sha = readPinnedSha(PART05_2004_ROOT, "vendor/nema/part05-2004");
  const p2004Buf = readPinnedFile(
    PART05_2004_ROOT,
    "vendor/nema/part05-2004",
    p2004Sha,
    "04_05pu.pdf",
  );
  const text2004 = pdfText(p2004Buf);
  if (!text2004.includes("PS 3.5-2004")) {
    fail(
      "04_05pu.pdf: the extracted text never says 'PS 3.5-2004'. Refusing to read a bound " +
        "from a document that does not identify itself as the 2004 edition of Part 5.",
    );
  }
  // Scope to section 7.6, the same way the DocBook read is scoped, and for the same
  // reason: reading all 106 pages would let an unrelated paragraph anywhere in the
  // document satisfy a check that is supposed to be about the normative bound, and
  // `.exec` takes the FIRST match. That matters more here than on the XML side,
  // because the curve bound is the half NO second document cross-checks.
  // The heading appears TWICE: once in the table of contents (with a dotted leader
  // and a page number) and once on the section itself. Taking the first match reads
  // a 130-character TOC entry and finds no bound at all -- which this generator did,
  // and refused, before this was narrowed. So do not guess which occurrence is the
  // body: take every candidate section and require EXACTLY ONE to carry the
  // normative sentence. That rejects the TOC by content rather than by heuristic,
  // and it also proves the sentence is unique, which is the property `.exec` would
  // otherwise silently assume.
  const HEADING_2004 = "7.6 REPEATING GROUPS";
  const NEXT_HEADING_2004 = "7.7 RETIRED DATA ELEMENTS";
  const SHALL_LEAD_2004 = "Repeating Groups shall only be allowed";
  const candidates2004: string[] = [];
  for (
    let at = text2004.indexOf(HEADING_2004);
    at !== -1;
    at = text2004.indexOf(HEADING_2004, at + 1)
  ) {
    const end = text2004.indexOf(NEXT_HEADING_2004, at);
    if (end < 0) continue;
    const slice = text2004.slice(at, end);
    if (slice.includes(SHALL_LEAD_2004)) candidates2004.push(slice);
  }
  if (candidates2004.length !== 1) {
    fail(
      "04_05pu.pdf: expected exactly one section 7.6 carrying the normative repeating-group " +
        "sentence, found " +
        String(candidates2004.length) +
        ". Refusing to pick one, and refusing to fall back to an unscoped search.",
    );
  }
  const sec762004 = candidates2004[0] ?? "";
  console.log(
    "[gen:repeating-groups] PS3.5-2004 (sha256 " +
      p2004Sha.slice(0, 12) +
      "), " +
      String(text2004.length) +
      " chars extracted, section 7.6 is " +
      String(sec762004.length) +
      " of them",
  );

  const shall2004 =
    /Repeating Groups shall only be allowed in the even Groups \(([0-9A-F]{4})-([0-9A-F]{4}),eeee\) and even Groups \(([0-9A-F]{4})-([0-9A-F]{4}),eeee\) cases\./.exec(
      sec762004,
    );
  if (!shall2004?.[1] || !shall2004[2] || !shall2004[3] || !shall2004[4]) {
    fail(
      "04_05pu.pdf section 7.6: cannot find the normative sentence " +
        '"Repeating Groups shall only be allowed in the even Groups (GGGG-GGGG,eeee) and even ' +
        'Groups (GGGG-GGGG,eeee) cases." Refusing to fall back to a transcribed curve bound.',
    );
  }
  const citation2004 =
    "Repeating Groups shall only be allowed in the even Groups (" +
    shall2004[1] +
    "-" +
    shall2004[2] +
    ",eeee) and even Groups (" +
    shall2004[3] +
    "-" +
    shall2004[4] +
    ",eeee) cases.";

  // The 2004 sentence lists overlays first, curves second. Do not rely on that
  // order: pick the pair by the prefix the current edition retired for curves.
  const pairs: Array<{ lo: string; hi: string }> = [
    { lo: shall2004[1], hi: shall2004[2] },
    { lo: shall2004[3], hi: shall2004[4] },
  ];
  const curvePrefix = curveRetired[1].toUpperCase();
  const curvePair = pairs.find((p) => p.lo.slice(0, 2).toUpperCase() === curvePrefix);
  const overlayPair = pairs.find(
    (p) => p.lo.slice(0, 2).toUpperCase() === hex4(overlayCurrent.prefix << 8).slice(0, 2),
  );
  if (!curvePair) {
    fail(
      "04_05pu.pdf section 7.6: no bound on the " +
        curvePrefix +
        "xx groups, which is the prefix the current edition retires for Curves.",
    );
  }
  if (!overlayPair) {
    fail(
      "04_05pu.pdf section 7.6: no bound on the " +
        hex4(overlayCurrent.prefix << 8).slice(0, 2) +
        "xx groups, so the two editions cannot be cross-checked.",
    );
  }

  // The family label. To be exact about what this proves: `Curves` is a literal in
  // the pattern below, so the document is checked AGAINST it rather than asked for
  // it. That is enough for a display string, and it does mean an edition that
  // renamed the family would fail here rather than mislabel it. The BOUND is what
  // is genuinely read out of the document; the label is not, and saying otherwise
  // would overstate this generator.
  const curveLabelM = new RegExp(
    "Standard Data Elements with even Group Numbers \\(" +
      curvePair.lo +
      "-" +
      curvePair.hi +
      ",eeee\\) represent (Curves),",
  ).exec(sec762004);
  if (!curveLabelM?.[1]) {
    fail(
      "04_05pu.pdf section 7.6: cannot find the sentence naming what the even Groups (" +
        curvePair.lo +
        "-" +
        curvePair.hi +
        ",eeee) represent.",
    );
  }

  // --- The cross-check ---------------------------------------------------------
  //
  // Both editions bound the overlay groups. They must agree. This is what turns a
  // mutation of EITHER vendored document red, and it is why the 2004 PDF cannot
  // drift away from the edition in force while still supplying the curve bound.
  const overlay2004 = toRange(
    overlayPair.lo,
    overlayPair.hi,
    overlayCurrent.label,
    citation2004,
    "PS3.5-2004 section 7.6",
    "04_05pu.pdf section 7.6",
  );
  if (
    overlay2004.prefix !== overlayCurrent.prefix ||
    overlay2004.lowMin !== overlayCurrent.lowMin ||
    overlay2004.lowMax !== overlayCurrent.lowMax
  ) {
    fail(
      "the two pinned editions disagree on the overlay repeating-group bound:\n" +
        "  PS3.5 " +
        edition +
        ": " +
        hex4((overlayCurrent.prefix << 8) | overlayCurrent.lowMin) +
        "-" +
        hex4((overlayCurrent.prefix << 8) | overlayCurrent.lowMax) +
        "\n  PS3.5-2004:  " +
        hex4((overlay2004.prefix << 8) | overlay2004.lowMin) +
        "-" +
        hex4((overlay2004.prefix << 8) | overlay2004.lowMax) +
        "\nOne of the two vendored documents is not what it claims to be, or the bound really " +
        "moved. Resolve it deliberately; do not average them.",
    );
  }
  console.log(
    "[gen:repeating-groups] cross-check OK: both editions bound the overlay groups to " +
      hex4((overlayCurrent.prefix << 8) | overlayCurrent.lowMin) +
      "-" +
      hex4((overlayCurrent.prefix << 8) | overlayCurrent.lowMax),
  );

  const curves = toRange(
    curvePair.lo,
    curvePair.hi,
    curveLabelM[1] + " (retired)",
    citation2004,
    "PS3.5-2004 section 7.6",
    "04_05pu.pdf section 7.6",
  );

  // Sorted by printed prefix, so the emitted file is order-stable.
  const ranges = [curves, overlayCurrent].sort((a, b) => a.prefix - b.prefix);

  let total = 0;
  for (const r of ranges) {
    const groups = expand(r);
    total += groups.length;
    console.log(
      "[gen:repeating-groups]   " +
        r.prefix.toString(16).toUpperCase().padStart(2, "0") +
        "xx [" +
        r.label +
        "] " +
        hex4(groups[0] ?? 0) +
        "-" +
        hex4(groups[groups.length - 1] ?? 0) +
        " even (" +
        String(groups.length) +
        " groups), from " +
        r.source,
    );
  }
  console.log(
    "[gen:repeating-groups] " +
      String(ranges.length) +
      " repeating-group masks covering " +
      String(total) +
      " concrete group numbers",
  );

  const outDir = join(REPO_ROOT, "src", "dictionary", "generated");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "repeating-groups.ts");
  writeFileSync(outPath, emit(ranges, { edition, part05Sha, part052004Sha: p2004Sha }), "utf8");
  console.log("[gen:repeating-groups] done - wrote " + outPath);
}

main();

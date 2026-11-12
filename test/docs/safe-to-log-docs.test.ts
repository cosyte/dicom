import { Buffer } from "node:buffer";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import type { Dataset } from "../../src/dataset/dataset.js";
import { annexE } from "../../src/dictionary/annex-e.js";
import { parseDicom } from "../../src/index.js";

/**
 * What the pages show of the synthetic data, and what they say is safe to log.
 *
 * `example-print.test.ts` reads what a sample passes to a printer. This suite reads the values a
 * page shows without printing them: a `// =>` annotation, a trailing comment that shows a value,
 * and the lines of an output block. A shown value that holds an identifying value of the
 * repository's synthetic data carries the mark `synthetic` in its comment, and an output block, which
 * is what an example printed, holds none. It also holds the page that says which fields of a parsed
 * data set, a warning and each error can hold file content, against the classes in `src/`.
 */
const root = join(import.meta.dirname, "..", "..");
const docsDir = join(root, "docs-content");

/** The README, the examples README and the hand-written pages, as `[label, text]`. */
function pages(): [string, string][] {
  const out: [string, string][] = [
    ["README.md", readFileSync(join(root, "README.md"), "utf8")],
    ["examples/README.md", readFileSync(join(root, "examples", "README.md"), "utf8")],
  ];
  for (const name of readdirSync(docsDir).sort()) {
    if (name.endsWith(".md")) out.push([name, readFileSync(join(docsDir, name), "utf8")]);
  }
  return out;
}

/** The `.ts` files that hold or build the synthetic objects the pages and examples read. */
function fixtureSources(): [string, string][] {
  const files = [
    join(root, "examples", "data", "ct-object.ts"),
    join(root, "test", "fixtures", "first-use", "ct-object.ts"),
    join(root, "test", "fixtures", "encapsulated", "objects.ts"),
    ...readdirSync(join(root, "examples"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => join(root, "examples", name)),
  ];
  return files.map((file) => [relative(root, file), readFileSync(file, "utf8")]);
}

/**
 * The identifying values the synthetic data carries, read from the data and not from the
 * expression that shows them, so a shown value is caught however it was reached.
 */
interface Identifying {
  /** Whole words matched case-insensitively: the parts of a person's name. */
  words: Set<string>;
  /** Substrings matched exactly: ids, accession numbers, institutions, UIDs, free text. */
  literals: Set<string>;
  /** Dates as `YYYYMMDD`, matched in every written form `datePatterns` builds. */
  dates: Set<string>;
}

/**
 * A UID under the example root every synthetic object here uses, with an instance part after it:
 * a Study, Series or SOP Instance UID read from a file. The root alone, given as a `uidRoot`
 * option, is not one.
 */
const INSTANCE_UID = /(?<![\d.])1\.2\.826\.0\.1\.3680043\.8\.498(?:\.\d+)+(?![\d.])/u;

/** Every `"<base64>"` literal long enough to be a DICOM object, from source text. */
const BASE64_LITERAL = /"([A-Za-z0-9+/]{48,}={0,2})"/gu;

/** Each data set and Item under `ds`, the root first. */
function allDataSets(ds: Dataset): Dataset[] {
  const out: Dataset[] = [ds];
  for (const el of ds.elements()) {
    const value = el.value;
    if (value.kind === "sequence") for (const item of value.items) out.push(...allDataSets(item));
  }
  return out;
}

/** Add what one parsed object carries in the attributes PS3.15 Annex E names. */
function readObject(ds: Dataset, into: Identifying): void {
  for (const set of allDataSets(ds)) {
    for (const el of set.elements()) {
      if (annexE(el.tag) === undefined) continue;
      const value = el.value;
      if (value.kind === "personName") {
        for (const pn of value.values) {
          for (const group of [pn.alphabetic, pn.ideographic, pn.phonetic]) {
            for (const part of [group?.familyName, group?.givenName, group?.middleName]) {
              if (part !== undefined && part.length >= 3) into.words.add(part.toLowerCase());
            }
          }
        }
      } else if (value.kind === "strings" && el.vr !== "CS") {
        // A code string (CS) is a code from a defined list, such as a sex or a role: not read.
        for (const s of value.values) if (s.trim().length >= 4) into.literals.add(s.trim());
      } else if (value.kind === "text") {
        if (value.value.trim().length >= 6) into.literals.add(value.value.trim());
      } else if (value.kind === "dates") {
        for (const d of value.values) if (/^\d{8}$/u.test(d.raw)) into.dates.add(d.raw);
      }
    }
  }
}

/** Every identifying value the synthetic data carries. */
function identifying(): Identifying {
  const out: Identifying = { words: new Set(), literals: new Set(), dates: new Set() };
  for (const line of readFileSync(join(root, "scripts", "phi-allow-list.txt"), "utf8").split(
    "\n",
  )) {
    const entry = line.trim();
    // A `DATE:` entry excuses a date a test fixture uses; the dates the pages show are read from
    // the objects they parse, below.
    if (entry === "" || entry.startsWith("#") || entry.startsWith("DATE:")) continue;
    for (const part of entry.split("^")) if (part.length >= 3) out.words.add(part.toLowerCase());
  }
  const sources = [...pages(), ...fixtureSources()];
  for (const [, text] of sources) {
    for (const m of text.matchAll(BASE64_LITERAL)) {
      const bytes = Buffer.from(m[1] ?? "", "base64");
      let ds: Dataset;
      try {
        ds = parseDicom(bytes);
      } catch {
        continue;
      }
      readObject(ds, out);
    }
  }
  return out;
}

/** A date in the forms a page can show it: DICOM, ISO, both slash orders, and its parts. */
function datePatterns(yyyymmdd: string): RegExp[] {
  const [y, mm, dd] = [yyyymmdd.slice(0, 4), yyyymmdd.slice(4, 6), yyyymmdd.slice(6, 8)];
  const [m, d] = [String(Number(mm)), String(Number(dd))];
  return [
    new RegExp(`(?<!\\d)${yyyymmdd}(?!\\d)`, "u"),
    new RegExp(`(?<!\\d)${y}-${mm}-${dd}(?!\\d)`, "u"),
    new RegExp(`(?<!\\d)0?${m}/0?${d}/${y}(?!\\d)`, "u"),
    new RegExp(`(?<!\\d)0?${d}/0?${m}/${y}(?!\\d)`, "u"),
    new RegExp(`year:\\s*${y},\\s*month:\\s*${m},\\s*day:\\s*${d}(?!\\d)`, "u"),
  ];
}

/**
 * Synthetic name parts that are also words a page uses in another sense: a VR, a profile, a test, a
 * placeholder the de-identifier writes. A shown value holding one of these as a name is still caught
 * by the record number or the UID beside it, or by the print check (`patient.name`).
 */
const ORDINARY_WORDS = new Set([
  "anon",
  "test",
  "patient",
  "synthetic",
  "fixture",
  "root",
  "nested",
  "deeper",
  "deflate",
  "brain",
  "ref",
  // The Responsible Person Role code the veterinary object carries beside the name.
  "owner",
]);

/** Whether `value` holds `token` with no word character either side. */
function holdsToken(value: string, token: string): boolean {
  for (let i = value.indexOf(token); i !== -1; i = value.indexOf(token, i + 1)) {
    const before = value[i - 1] ?? "";
    const after = value[i + token.length] ?? "";
    if (!/\w/u.test(before) && !/\w/u.test(after)) return true;
  }
  return false;
}

/** What in a shown value identifies a person or a data set, or `[]` when nothing does. */
function findIdentifying(value: string, ids: Identifying, patterns: RegExp[]): string[] {
  const found: string[] = [];
  // A word is a run of letters: `DOE^JANE` is two, and `SAMPLE_HOSP`, a code, is one.
  for (const word of value.toLowerCase().match(/[\p{L}_]+/gu) ?? []) {
    if (ids.words.has(word) && !ORDINARY_WORDS.has(word)) found.push(word);
  }
  for (const literal of ids.literals) if (holdsToken(value, literal)) found.push(literal);
  for (const p of patterns) if (p.test(value)) found.push(p.source);
  if (INSTANCE_UID.test(value)) found.push("instance UID");
  return found;
}

/** Info strings of a fence that shows output rather than code. */
const OUTPUT_FENCE = /^(?:|text|console|output)$/u;

/** The info strings of a fence that holds code a value can be shown in. */
const CODE_FENCE = /^(?:ts|typescript|js|javascript|mjs|tsx)$/u;

/**
 * A plain trailing comment that shows a value after code: `x.id; // "MRN-42"`. A comment on a line
 * of its own is prose, and `https://` is not a comment.
 */
const TRAILING_VALUE = /\S\s*\/\/\s+(["[{].*)$/u;

type Shown = readonly [where: string, value: string, output: boolean];

/**
 * Every shown value on the pages: `// =>` annotations, plain trailing comments that show a value,
 * and the lines of output blocks, the last flagged `output`.
 */
function shownValues(): Shown[] {
  const out: Shown[] = [];
  for (const [label, text] of pages()) {
    let fence: string | undefined;
    text.split("\n").forEach((line, i) => {
      const where = `${label}:${String(i + 1)}`;
      const open = /^\s*```(.*)$/u.exec(line);
      if (open) {
        fence = fence === undefined ? ((open[1] ?? "").trim().split(/\s/u)[0] ?? "") : undefined;
        return;
      }
      if (fence === undefined) return;
      if (CODE_FENCE.test(fence)) {
        const at = line.indexOf("// =>");
        const trailing = TRAILING_VALUE.exec(line);
        if (at !== -1) out.push([where, line.slice(at + "// =>".length).trim(), false]);
        else if (trailing) out.push([where, (trailing[1] ?? "").trim(), false]);
      } else if (OUTPUT_FENCE.test(fence) && line.trim() !== "") {
        out.push([where, line.trim(), true]);
      }
    });
  }
  return out;
}

/** The mark a shown synthetic value carries at the end of its comment. */
const SYNTHETIC_MARK = /(?:\/\* synthetic \*\/|, synthetic\b.*)$/u;

describe("a shown value holding the synthetic data's identifying values", () => {
  const ids = identifying();
  const patterns = [...ids.dates].flatMap(datePatterns);
  const shown = shownValues();

  it("reads the data and the pages, so it cannot pass on nothing", () => {
    expect(ids.words.has("doe")).toBe(true);
    expect(ids.words.has("jane")).toBe(true);
    expect(ids.literals.has("MRN-42")).toBe(true);
    expect(ids.literals.has("SAMPLE-HOSP")).toBe(true);
    expect(ids.dates.has("19000101")).toBe(true);
    expect(shown.filter(([, , output]) => !output).length).toBeGreaterThan(250);
    expect(shown.filter(([, , output]) => output).length).toBeGreaterThan(5);
  });

  it("finds each kind of identifying value in a planted shown value", () => {
    const dob = datePatterns("19000101");
    for (const form of [
      '"MRN-42"',
      '"Doe^Jane"',
      '{ familyName: "Doe", givenName: "Jane" }',
      '"SAMPLE-HOSP"',
      '"19000101"',
      '"1900-01-01"',
      "{ year: 1900, month: 1, day: 1 }",
      '"1.2.826.0.1.3680043.8.498.1.1"',
    ]) {
      expect(findIdentifying(form, ids, dob), form).not.toEqual([]);
    }
    for (const safe of [
      '"CT"',
      '"1.2.840.10008.1.2.1"',
      '"1.2.826.0.1.3680043.8.498"',
      '["DICOM_MISSING_PREAMBLE"]',
      "512",
      '"MRN-420"',
    ]) {
      expect(findIdentifying(safe, ids, dob), safe).toEqual([]);
    }
  });

  it("carries the synthetic mark in an annotation or a comment", () => {
    const unmarked = shown
      .filter(([, , output]) => !output)
      .filter(([, value]) => !SYNTHETIC_MARK.test(value))
      .filter(([, value]) => findIdentifying(value, ids, patterns).length > 0)
      .map(([where, value]) => `${where} ${value}`);
    expect(unmarked, unmarked.join("\n")).toEqual([]);
  });

  it("is never printed: an output block holds none", () => {
    const printed = shown
      .filter(([, , output]) => output)
      .filter(([, value]) => findIdentifying(value, ids, patterns).length > 0)
      .map(([where, value]) => `${where} ${value}`);
    expect(printed, printed.join("\n")).toEqual([]);
  });
});

/** The text of a `## heading` section of a page, up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return "";
  const end = text.indexOf("\n## ", start + 4);
  return text.slice(start, end === -1 ? undefined : end);
}

/** The public fields an error class declares in its source file, by name. */
function errorFields(file: string, className: string): string[] {
  const text = readFileSync(join(root, "src", file), "utf8");
  const start = text.indexOf(`export class ${className} extends Error {`);
  expect(start, `${className} in src/${file}`).not.toBe(-1);
  const end = text.indexOf("\n}\n", start);
  const body = text.slice(start, end);
  return [...body.matchAll(/^\s+(?:public\s+)?readonly\s+(\w+)\??:/gmu)].map((m) => m[1] ?? "");
}

describe("What is safe to log", () => {
  const text = section(
    readFileSync(join(docsDir, "error-handling.md"), "utf8"),
    "What is safe to log",
  );

  it("exists on the error-handling page", () => {
    expect(text).not.toBe("");
  });

  /** The line of the section that names `name` in backticks, or `undefined`. */
  const lineOf = (name: string): string | undefined =>
    text.split("\n").find((line) => line.includes(`\`${name}\``));

  it.each([
    ["parser/errors.ts", "DicomParseError"],
    ["dataset/helpers/errors.ts", "DicomValueError"],
    ["serialize/errors.ts", "DicomSerializeError"],
    ["json/errors.ts", "DicomJsonError"],
    ["profiles/errors.ts", "ProfileDefinitionError"],
    ["deident/types.ts", "DeidentifyError"],
  ])("names %s's %s and each of its fields", (file, className) => {
    expect(lineOf(className), className).toBeDefined();
    for (const field of ["message", ...errorFields(file, className)]) {
      expect(text, `${className}.${field}`).toContain(`\`${className}.${field}\``);
    }
  });

  it("names every class in src/ that extends Error", () => {
    const classes: string[] = [];
    for (const d of readdirSync(join(root, "src"), { withFileTypes: true, recursive: true })) {
      if (!d.isFile() || !d.name.endsWith(".ts")) continue;
      const source = readFileSync(join(d.parentPath, d.name), "utf8");
      for (const m of source.matchAll(/export class (\w+) extends Error\b/gu)) {
        classes.push(m[1] ?? "");
      }
    }
    expect(classes.length).toBeGreaterThanOrEqual(6);
    for (const name of classes) expect(text, name).toContain(`\`${name}\``);
  });

  /**
   * What the section claims of `field`: `safe` when it is named in a table's "Safe to log" column or
   * in a sentence that says "safe to log", `content` when it is named in the "File content" column or
   * in a sentence that says "file content". A sentence that says neither claims nothing.
   */
  function claimsOf(field: string): Set<"safe" | "content"> {
    const name = `\`${field}\``;
    const out = new Set<"safe" | "content">();
    const prose: string[] = [];
    for (const line of text.split("\n")) {
      if (!line.startsWith("|")) {
        prose.push(line);
        continue;
      }
      const cells = line.split("|");
      if ((cells[2] ?? "").includes(name)) out.add("safe");
      if ((cells[3] ?? "").includes(name)) out.add("content");
    }
    const flat = prose.join(" ").replace(/\s+/gu, " ");
    for (const sentence of flat.split(/(?<=[.:])\s+(?=[A-Z`*-])/u)) {
      if (!sentence.includes(name)) continue;
      if (/safe to log/u.test(sentence)) out.add("safe");
      if (/file content/u.test(sentence)) out.add("content");
    }
    return out;
  }

  it.each([
    "DicomParseError.snippet",
    "DeidentifyReport.uidMap",
    "Element.rawBytes",
    "Element.value",
    "FileMeta.mediaStorageSOPInstanceUID",
    "DirectoryRecord.referencedFileId",
  ])("says %s can hold file content", (field) => {
    expect([...claimsOf(field)], field).toEqual(["content"]);
  });

  it.each([
    "DicomParseWarning.code",
    "DicomParseWarning.message",
    "DicomParseWarning.position.byteOffset",
    "DicomParseWarning.position.contextPath",
    "DicomParseError.code",
    "DicomParseError.message",
    "DicomParseError.byteOffset",
    "DicomParseError.offsetFrame",
    "DicomParseError.contextPath",
    "DicomValueError.message",
    "DicomSerializeError.message",
    "DicomJsonError.tag",
    "ProfileDefinitionError.profileName",
    "DeidentifyError.message",
    "Element.privateCreator",
    "FileMeta.transferSyntaxUID",
  ])("says %s is safe to log", (field) => {
    expect([...claimsOf(field)], field).toEqual(["safe"]);
  });

  it("reads a claim from a table cell and from a sentence, so it cannot pass on nothing", () => {
    expect(claimsOf("NoSuchError.field").size).toBe(0);
  });

  it.each([
    "Dataset.patient",
    "Dataset.study",
    "Dataset.series",
    "Dataset.image",
    "Dataset.elements()",
    "Dataset.fileMeta",
    "Dataset.warnings",
  ])("names the parsed data set's %s", (field) => {
    expect(lineOf(field), field).toBeDefined();
  });
});

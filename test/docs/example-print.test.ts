import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import {
  readPrintConfig,
  sampleBlocks,
  samplePrintFindings,
} from "@cosyte/script-utils/docs-content";
import { describe, expect, it } from "vitest";

/**
 * No example prints a value that identifies a person or a whole data set.
 *
 * The rule is the shared one from `@cosyte/script-utils` (`example-print`), with this library's own
 * names added in `cosyte-docs-content.config.json`: the views' identifying fields (`patient.id`,
 * `study.instanceUid`, `accessionNumber`, the descriptions), the report and error fields that carry
 * file bytes (`uidMap`, `snippet`, `contextPath`), and the names a whole data set, element or JSON
 * model goes by (`ds`, `dataset`, `element`, `value`, `toDicomJson`). This suite holds every place a
 * reader copies from to that rule: the README, the hand-written pages at the top of `docs-content/`,
 * the examples README, and the runnable scripts in `examples/`. What an example prints is a tag, a
 * VR, a code, a count, a length, a transfer syntax or a boolean; a field that identifies a person or
 * a data set is read into a variable or asserted on instead, with its synthetic value in a comment.
 */
const root = join(import.meta.dirname, "..", "..");
const settings = readPrintConfig(root);
const extra = {
  accessors: settings.accessors,
  wholeValues: settings.wholeValues,
  printers: settings.printers,
};

interface Sample {
  readonly where: string;
  readonly code: string;
}

/** The TypeScript and JavaScript samples of one Markdown file. */
function markdownSamples(file: string): Sample[] {
  return sampleBlocks(readFileSync(file, "utf8")).map((b) => ({
    where: `${relative(root, file)}:${String(b.line)}`,
    code: b.code,
  }));
}

/** The README, the examples README and every hand-written page, as Markdown files. */
function markdownFiles(): string[] {
  const docs = join(root, "docs-content");
  return [
    join(root, "README.md"),
    join(root, "examples", "README.md"),
    ...readdirSync(docs)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => join(docs, name)),
  ];
}

/** Each runnable script at the top of `examples/`, whole. */
function exampleScripts(): Sample[] {
  const dir = join(root, "examples");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".ts"))
    .map((d) => join(dir, d.name))
    .sort()
    .map((file) => ({ where: relative(root, file), code: readFileSync(file, "utf8") }));
}

/** Every `.ts` file under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(".ts"))
    .map((d) => join(d.parentPath, d.name))
    .sort();
}

/** The fenced samples inside the `/** *\/` comments of a TypeScript text, comment stars removed. */
function commentSamples(label: string, source: string): Sample[] {
  const out: Sample[] = [];
  let body: string[] | undefined;
  let start = 0;
  source.split("\n").forEach((line, i) => {
    const text = /^\s*\*\s?(.*)$/u.exec(line)?.[1];
    if (text === undefined) {
      body = undefined;
      return;
    }
    if (/^\s*```/u.test(text)) {
      if (body === undefined) {
        body = [];
        start = i + 2;
      } else {
        out.push({ where: `${label}:${String(start)}`, code: body.join("\n") });
        body = undefined;
      }
      return;
    }
    body?.push(text);
  });
  return out;
}

function findings(samples: readonly Sample[]): string[] {
  return samples.flatMap((s) =>
    samplePrintFindings(s.code, extra).map(
      (f) => `${s.where} (sample line ${String(f.line)}): ${f.message}`,
    ),
  );
}

describe("no example prints a value that identifies a person or a whole data set", () => {
  it("is required, so the docs-content check fails on a finding too", () => {
    expect(settings.required).toBe(true);
  });

  it("the README, the examples README and the hand-written pages", () => {
    const samples = markdownFiles().flatMap(markdownSamples);
    expect(samples.length).toBeGreaterThanOrEqual(60);
    const found = findings(samples);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("the runnable scripts in examples/", () => {
    const samples = exampleScripts();
    expect(samples.length).toBeGreaterThanOrEqual(5);
    const found = findings(samples);
    expect(found, found.join("\n")).toEqual([]);
  });

  // The doc comments under src/ ship in dist/*.d.ts and the API pages. They follow the rule one
  // directory at a time; a directory joins this list once its comments do.
  it.each(["src/deident"])("the doc comments under %s", (dir) => {
    const samples = sourceFiles(join(root, dir)).flatMap((file) =>
      commentSamples(relative(root, file), readFileSync(file, "utf8")),
    );
    expect(samples.length).toBeGreaterThan(10);
    const found = findings(samples);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("reads a doc-comment sample, so a print planted in one is found", () => {
    const planted = [
      "/**",
      " * @example",
      " * ```ts",
      " * const { report } = deidentify(parseDicom(buf));",
      " * console.log(report.uidMap);",
      " * ```",
      " */",
    ].join("\n");
    const samples = commentSamples("planted.ts", planted);
    expect(samples).toEqual([
      {
        where: "planted.ts:4",
        code: "const { report } = deidentify(parseDicom(buf));\nconsole.log(report.uidMap);",
      },
    ]);
    expect(findings(samples)).toEqual([expect.stringContaining("planted.ts:4 (sample line 2)")]);
  });

  it.each([
    ["the patient ID", "console.log(ds.patient.id);"],
    ["the Patient ID's issuer", "console.log(ds.patient.issuerOfId);"],
    ["the accession number", "console.log(ds.study.accessionNumber);"],
    ["a Study Instance UID", "console.log(`study ${ds.study.instanceUid}`);"],
    ["a SOP Instance UID", "logger.info(ds.image.sopInstanceUid);"],
    ["a free-text description", "console.log(ds.series.description);"],
    ["the report's UID map", "console.log(report.uidMap);"],
    ["a parse error's raw bytes", "console.error(err.snippet);"],
    ["a whole data set", "console.log(ds);"],
    ["a whole element", "console.log(element);"],
    ["a decoded value", "console.log(ds.get(tag)?.value);"],
    ["a JSON model", "console.log(JSON.stringify(toDicomJson(ds)));"],
  ])("holds this library's own names, so printing %s is found", (_, code) => {
    expect(findings([{ where: "own.ts", code }])).toHaveLength(1);
  });

  it.each([
    ["a count", "console.log(ds.warnings.length);"],
    ["a code", "console.log(ds.warnings.map((w) => w.code));"],
    ["a modality", "console.log(ds.series.modality);"],
    ["a transfer syntax", "console.log(ds.fileMeta?.transferSyntaxUID);"],
    ["a tag and a VR", "console.log(element.tag, element.vr);"],
    ["a value's kind", "console.log(element.value.kind);"],
  ])("allows %s", (_, code) => {
    expect(findings([{ where: "own.ts", code }])).toEqual([]);
  });
});

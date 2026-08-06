/**
 * The CHANGELOG generation contract: `.changeset/config.json`, plus the shape of `CHANGELOG.md`
 * that makes generated output land where a reader expects it.
 *
 * WHY THIS FILE EXISTS. `CHANGELOG.md` is listed in `package.json#files`, so it is inside every
 * published tarball. For the whole of this package's published history the release wrote no
 * version heading into it, because `.changeset/config.json` set `"changelog": false`, and the
 * file was hand-maintained under one `[Unreleased]` heading that nothing ever rolled over. Ten
 * versions shipped a changelog describing already-released work as unreleased. That is not
 * prose to correct by hand: correcting it leaves the mechanism that produced it, and it drifts
 * again on the very next release. THE REMEDY IS THE FLAG, NOT THE FILE.
 *
 * WHAT EACH GROUP PINS:
 *
 *  1. THE FLAG ITSELF. `changelog` must name a generator that really resolves and really
 *     exports the two functions Changesets calls, and the release script must actually invoke
 *     the tool that reads it. `false` is a legal value that silently produces nothing.
 *  2. THE DEFECT, ASSERTED DIRECTLY. No `[Unreleased]` heading and no `[Unreleased]` link
 *     definition survive. With generation ON a surviving one is WORSE than before: the release
 *     prepends its version section ABOVE it, leaving released content under "Unreleased"
 *     permanently.
 *  3. THE PRETTIER PASS, DERIVED FOR THIS REPO AND NOT COPIED FROM A SIBLING. This value has
 *     gone four different ways across the sibling packages and it is wrong in BOTH directions,
 *     so it is measured here rather than inherited. See the group's own comment.
 *  4. THE SHAPE RULE. Changesets prepends by replacing the FIRST newline, so exactly one line
 *     can sit above generated output. The rule is NOTHING BUT THE H1 SITS ABOVE THE FIRST
 *     HEADING. It is deliberately NOT "the archive heading comes second": a release puts its own
 *     version heading there, and that assertion would wedge the first Version PR this
 *     configuration ever opens.
 *  5. END TO END, AGAINST THE REAL TOOL, TWICE. The repo's real `CHANGELOG.md` and real
 *     `.changeset/config.json` go into a throwaway git package and the real `changeset version`
 *     runs. A test that reimplements where Changesets inserts text proves only that it agrees
 *     with itself. TWO CONSECUTIVE releases, because `## 0.0.1` is a SUBSTRING of `## 0.0.10`:
 *     any `indexOf`/substring check over a version heading passes on the first release and reds
 *     on the second, inside a Version PR, with the changeset already consumed. Every
 *     version-heading comparison here is a whole-line match for that reason.
 *  6. THE ARCHIVED HISTORY IS FROZEN AGAINST A CONSTANT. Every other case compares an archive a
 *     release PRODUCED against the archive in the working tree, and that is exactly the
 *     comparison a hand-edit cancels out of: edit the committed file and both sides move
 *     together, green. A digest is the one assertion whose other side does not move.
 *  7. THE REGION ABOVE THE DIVIDER, WHICH A SIBLING MEASURED AS OPEN AND LEFT OPEN. See the
 *     group's own comment for exactly what it closes and what it does not.
 *
 * WHAT IS NOT COVERED HERE, STATED SO THE SUITE IS NOT READ AS MORE THAN IT IS. The release
 * BODY is rendered by `release-notes.mjs`, which lives in the shared `cosyte/.github`
 * repository and not in this one, so nothing here exercises it. A changeset summary that reads
 * badly once that renderer has stripped an internal identifier out of it is invisible to this
 * file.
 *
 * SECURITY: every subprocess call uses `spawnSync` with array args. No `exec`, no shell form.
 * Every case runs in a temp directory built from scratch and every mutation happens there:
 * nothing here writes into the repo, bumps its version, or consumes a real changeset.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import prettier from "prettier";
import { describe, it, expect, afterAll } from "vitest";

const REPO_ROOT = process.cwd();
const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const CONFIG_PATH = join(REPO_ROOT, ".changeset", "config.json");
const PACKAGE_PATH = join(REPO_ROOT, "package.json");
const IGNORE_PATH = join(REPO_ROOT, ".prettierignore");
const CHANGESET_BIN = join(REPO_ROOT, "node_modules", "@changesets", "cli", "bin.js");

/** The heading the hand-written history was moved under. Generated sections sit above it. */
const ARCHIVE_HEADING = "## Released before this file was generated";
const PROBE_SUMMARY = "A synthetic entry written by the changelog generation test.";
/**
 * The probe's summary deliberately QUOTES THE ARCHIVE HEADING on a line of its own, because a
 * changeset CAN do it by accident and every helper below has to survive it: a quoted copy lands
 * in generated output ABOVE the real heading, where a substring search finds it first and
 * measures the wrong block. `getReleaseLine` indents every line of a summary after the first by
 * two spaces, so a quoted copy cannot start at column 0, which is what makes the whole-line
 * anchors below safe.
 *
 * DO NOT COPY THIS SHAPE INTO A REAL CHANGESET. Two spaces is EXACTLY the content column of the
 * `- ` bullet, so an indented `## ...` line is a real ATX heading nested in that list item and
 * it renders as a second divider inside a release section that is permanent once published. The
 * changeset shipping this change writes the divider as an inline code span for that reason.
 */
const QUOTING_PROBE_BODY = `${PROBE_SUMMARY}\n\n${ARCHIVE_HEADING}\n`;
/**
 * The ordinary probe: one paragraph, no heading anywhere in it. This is the shape a real
 * changeset has, and it is what every case about WHERE A RELEASE LANDS runs on, so those cases
 * measure generated output rather than the deliberate abuse above.
 */
const PROBE_BODY = `${PROBE_SUMMARY}\n`;

const changelog = readFileSync(CHANGELOG_PATH, "utf8");
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as {
  changelog?: unknown;
  prettier?: unknown;
};
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
  name?: string;
  version?: string;
  files?: string[];
  scripts?: Record<string, string>;
};

/** The two functions Changesets calls on whatever `changelog` names. */
interface ChangelogFunctions {
  getReleaseLine?: unknown;
  getDependencyReleaseLine?: unknown;
}
type ChangelogModule = ChangelogFunctions & { default?: ChangelogFunctions };

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/**
 * Would `pnpm format:check` accept this text as the repo's `CHANGELOG.md`?
 *
 * The repo's own config is resolved against the REAL changelog path, so this asks the question
 * CI asks rather than a question about Prettier's defaults.
 */
async function formatCheckAccepts(text: string): Promise<boolean> {
  const options = await prettier.resolveConfig(CHANGELOG_PATH);
  const formatted = await prettier.format(text, {
    ...options,
    filepath: CHANGELOG_PATH,
    parser: "markdown",
  });
  return formatted === text;
}

/**
 * Build a throwaway single-package git repo and run the real `changeset version` in it.
 * Returns the resulting `CHANGELOG.md` and the version `package.json` was bumped to.
 */
function runVersion(opts: {
  changelogBody: string;
  /**
   * Applied ON TOP of the repo's real `.changeset/config.json`. The base is read rather than
   * retyped so a setting added to the real config is exercised here by default.
   */
  configOverrides?: Record<string, unknown>;
  /** Version the throwaway package starts at. A `patch` changeset bumps it by one. */
  from?: string;
  /** The changeset summary. Defaults to the ordinary one-paragraph shape. */
  probeBody?: string;
}): { changelog: string; version: string } {
  const dir = mkdtempSync(join(tmpdir(), "dicom-changelog-"));
  roots.push(dir);
  mkdirSync(join(dir, ".changeset"));
  writeFileSync(join(dir, "CHANGELOG.md"), opts.changelogBody);
  writeFileSync(
    join(dir, ".changeset", "config.json"),
    JSON.stringify({ ...config, ...(opts.configOverrides ?? {}) }),
  );
  writeFileSync(
    join(dir, ".changeset", "probe.md"),
    `---\n"@cosyte/dicom": patch\n---\n\n${opts.probeBody ?? PROBE_BODY}`,
  );
  // `private` keeps the throwaway package unpublishable even if it escaped the temp dir.
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@cosyte/dicom",
      version: opts.from ?? "0.0.0",
      private: true,
      prettier: "@cosyte/prettier-config",
    }),
  );
  // LOAD-BEARING, NOT TIDY. Changesets resolves Prettier from the tree it is writing into and
  // falls back to its own BUNDLED copy when it finds none. That fallback ignores this repo's
  // config, so a tree without these links would exercise a formatter no release has ever used
  // and the Prettier arms below would prove nothing about what lands on a Version PR.
  //
  // And worse than "proves nothing": a declared config that cannot be RESOLVED makes Changesets
  // bump the version, consume the changeset and write NO changelog at all, with a `console.warn`
  // as the only signal. That is upstream and nothing here can prevent it. Remember it before
  // diagnosing a release that published with an unchanged changelog as a reverted flag: it is a
  // swallowed write failure, not a setting that came undone.
  mkdirSync(join(dir, "node_modules", "@cosyte"), { recursive: true });
  symlinkSync(join(REPO_ROOT, "node_modules", "prettier"), join(dir, "node_modules", "prettier"));
  symlinkSync(
    join(REPO_ROOT, "node_modules", "@cosyte", "prettier-config"),
    join(dir, "node_modules", "@cosyte", "prettier-config"),
  );

  // THE TEMP TREE IS A REAL GIT REPO, AND THAT IS LOAD-BEARING. The default generator calls
  // `getCommitThatAddsFile` on each changeset and prefixes the entry with that commit's short
  // sha, so the line a release really writes is `- <sha>: <summary>` and not the summary alone.
  // With no git history the lookup returns nothing and the prefix never appears, which would
  // leave every case below asserting against a shape no release produces. `core.hooksPath` is
  // emptied per invocation because containers here really do set a global one, and it would
  // point this temp repo's commit at hooks the suite never meant to run.
  const git = (...args: string[]): void => {
    const g = spawnSync(
      "git",
      [
        "-c",
        "user.name=changelog test",
        "-c",
        "user.email=changelog@example.com",
        "-c",
        "core.hooksPath=",
        ...args,
      ],
      { cwd: dir, encoding: "utf8", timeout: 60_000 },
    );
    expect(g.status, `git ${args.join(" ")}: ${g.stdout ?? ""}${g.stderr ?? ""}`).toBe(0);
  };
  writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  git("init", "--quiet");
  git("add", "--all");
  git("commit", "--quiet", "--no-gpg-sign", "-m", "seed");

  const r = spawnSync(process.execPath, [CHANGESET_BIN, "version"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 60_000,
  });
  expect(r.status, `${r.stdout ?? ""}${r.stderr ?? ""}`).toBe(0);

  const bumped = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
  return { changelog: readFileSync(join(dir, "CHANGELOG.md"), "utf8"), version: bumped.version };
}

/** Every ATX heading in a markdown document, in document order. */
const headings = (text: string): string[] =>
  text.split("\n").filter((line) => /^#{1,6} /.test(line));

/**
 * The one structural rule this file has to keep, stated so that it survives a release.
 *
 * Returns a description of the violation, or `undefined` if the document is well shaped.
 */
function shapeViolation(text: string): string | undefined {
  const lines = text.split("\n");
  if (lines[0] !== "# Changelog") return `line 1 is ${JSON.stringify(lines[0])}, not the H1`;
  const next = lines.slice(1).find((line) => line.trim() !== "");
  if (next === undefined) return "the document has no content below the H1";
  if (!/^## /.test(next)) return `prose above the first heading: ${JSON.stringify(next)}`;
  const anchors = lines.filter((line) => line === ARCHIVE_HEADING).length;
  if (anchors !== 1) return `expected exactly one archived-history heading, found ${anchors}`;
  return undefined;
}

/**
 * The header block of the archived half: from its heading down to its first entry section.
 *
 * The heading is located as a WHOLE LINE, never with `indexOf`. A changeset summary may quote
 * it (this slice's own does), and the quoted copy sits ABOVE the real heading in generated
 * output, so a substring search would slice a few characters out of a release section instead.
 */
function archivePreamble(text: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(ARCHIVE_HEADING);
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && line.startsWith("### "));
  return (end === -1 ? lines.slice(start) : lines.slice(start, end)).join("\n");
}

/** Everything from the archived-history heading down, located the same whole-line way. */
function archivedHistory(text: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(ARCHIVE_HEADING);
  return start === -1 ? "" : lines.slice(start).join("\n");
}

/** Everything ABOVE the archived-history heading: the region a release generates into. */
function generatedRegion(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(ARCHIVE_HEADING);
  return start === -1 ? lines : lines.slice(0, start);
}

/** A line that opens a list item, which cannot also be the text of a setext heading. */
const LIST_MARKER = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?: |$)/;

/**
 * Every line of the region that markdown RENDERS as a heading, however it is spelled.
 *
 * 🔴 `headings()` above lists what the generator WROTE, and a plain `/^#{1,6} /` filter is the
 * right tool for that. It is the wrong tool for asking "could a heading have been smuggled in
 * here", and the difference was measured on this exact document rather than reasoned about:
 * against the naive filter, ` ## 0.0.99` (ONE leading space) and a setext `0.0.99` over a row of
 * dashes both sail past `generatedRegionViolation` untouched, while rendering as an `<h2>`
 * carrying that version. CommonMark allows an ATX heading up to three leading spaces, and a
 * setext underline needs no `#` at all. So the guard reads both.
 *
 * NAMED FOR WHAT IT CHECKS, NOT AS A UNIVERSAL. It reads ATX with up to three leading spaces and
 * a setext underline under a top-level paragraph. Three leading spaces spans the `- ` bullet's
 * two-space content column, so a changeset summary that opens a line with an ATX heading is
 * refused BY THIS FILE and not only by a doc comment - the case at the end of this describe
 * block runs one through the real generator to prove it. What it does NOT read is a setext
 * underline inside a list item, because the paragraph above such an underline is the bullet's
 * own text and treating that as a heading would refuse ordinary release output.
 */
function renderedHeadings(region: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < region.length; i += 1) {
    const line = region[i] ?? "";
    if (/^ {0,3}#{1,6}(?: |$)/.test(line)) {
      out.push(line.replace(/^ {0,3}/, "").trimEnd());
      continue;
    }
    const under = region[i + 1];
    if (
      line.trim() !== "" &&
      /^ {0,3}\S/.test(line) &&
      !LIST_MARKER.test(line) &&
      under !== undefined &&
      /^ {0,3}(?:=+|-+)[ \t]*$/.test(under)
    ) {
      // Normalised to how it renders: `=` is an h1, `-` an h2. Written as ATX so the version
      // and shape rules below read it the same way they read a `## x.y.z` a release wrote.
      out.push(`${under.trimStart().startsWith("=") ? "#" : "##"} ${line.trim()}`);
    }
  }
  return out;
}

const VERSION_HEADING = /^## (\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

/** The numeric triple of a `## x.y.z` heading, for ordering. */
function triple(heading: string): [number, number, number] {
  const m = VERSION_HEADING.exec(heading);
  if (!m) throw new Error(`not a version heading: ${heading}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareTriple(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Does the region above the divider contain only what a release generates, in the order a
 * release generates it, topped by the version this package is actually at?
 *
 * Returns a description of the violation, or `undefined`.
 */
function generatedRegionViolation(text: string, packageVersion: string): string | undefined {
  const region = generatedRegion(text);
  // EVERY SPELLING, not `/^#{1,6} /`. See `renderedHeadings`: a single leading space and a
  // setext underline each defeat the naive filter, and both were reproduced on this document.
  const found = renderedHeadings(region);
  const [h1, ...rest] = found;
  if (h1 !== "# Changelog") return `the region above the divider does not open on the H1`;
  for (const heading of rest) {
    if (!VERSION_HEADING.test(heading) && !/^### (Major|Minor|Patch) Changes$/.test(heading)) {
      return `heading above the divider is not generated output: ${JSON.stringify(heading)}`;
    }
  }
  const versions = rest.filter((h) => VERSION_HEADING.test(h));
  for (let i = 1; i < versions.length; i += 1) {
    const prev = versions[i - 1];
    const cur = versions[i];
    if (prev === undefined || cur === undefined) continue;
    if (compareTriple(triple(prev), triple(cur)) < 0) {
      return `version headings are not newest first: ${prev} sits above ${cur}`;
    }
  }
  const top = versions[0];
  if (top !== undefined && top !== `## ${packageVersion}`) {
    return `the newest release section is ${top}, but package.json says ${packageVersion}`;
  }
  return undefined;
}

describe("changelog generation is on", () => {
  it("names a changelog generator that resolves and exports what Changesets calls", () => {
    // `false` is the value this package shipped its whole published history under, and it is
    // the reason no release ever wrote a version heading.
    expect(config.changelog).not.toBe(false);
    expect(typeof config.changelog).toBe("string");

    const require = createRequire(CONFIG_PATH);
    const mod = require(config.changelog as string) as ChangelogModule;
    const fns = mod.default ?? mod;
    expect(typeof fns.getReleaseLine).toBe("function");
    expect(typeof fns.getDependencyReleaseLine).toBe("function");
  });

  it("runs `changeset version` from the release `version` script, so the flag is reached", () => {
    // The flag only does anything if the release invokes the tool that reads it. This repo's
    // `version` script is a chain and only the first link writes a changelog.
    expect(pkg.scripts?.["version"] ?? "").toMatch(/(^|&&\s*)changeset\s+version(\s|$|&)/);
  });

  it("keeps CHANGELOG.md in the published tarball, which is why any of this matters", () => {
    expect(pkg.files ?? []).toContain("CHANGELOG.md");
  });
});

describe("CHANGELOG.md carries no hand-maintained Unreleased section", () => {
  it("has no [Unreleased] heading", () => {
    // With generation on this is not merely stale: the release prepends its version section
    // ABOVE this heading, so released content would sit under "Unreleased" permanently, in the
    // tarball.
    expect(headings(changelog).filter((h) => h.includes("[Unreleased]"))).toEqual([]);
  });

  it("has no [Unreleased] link definition left behind", () => {
    expect(changelog).not.toMatch(/^\[Unreleased\]:/m);
  });

  it("says what the archived half is, in a preamble that promises no future release", () => {
    // The block is located by the ARCHIVE HEADING, not by the first `### ` in the document.
    // Anchoring on the first `### ` measures the whole header today and a couple of dozen bytes
    // of generated output after the first release, at which point this would silently stop
    // reading the preamble it guards.
    const preamble = archivePreamble(changelog);
    expect(preamble.length).toBeGreaterThan(200);
    expect(preamble).not.toMatch(/will ship/i);
  });
});

describe("the Prettier pass, derived for this repo rather than copied", () => {
  it("leaves the release's Prettier pass on, because this repo's markdown IS Prettier-managed", () => {
    // THE DISCRIMINATOR, DERIVED HERE. This value has gone four different ways across the
    // sibling packages and it is wrong in BOTH directions, so it is measured rather than
    // inherited: a sibling whose `.prettierignore` lists `*.md` needs `"prettier": false`, and
    // leaving it ON there rewrote roughly 1,240 lines of already-published text and corrupted a
    // shipped tarball. THIS repo HAS a `.prettierignore` but it does not cover markdown, so
    // copying that sibling's value here would be the wrong answer.
    //
    // Asked of PRETTIER ITSELF rather than by pattern-matching the ignore file, because a
    // hand-rolled reading of ignore semantics is its own way to get this wrong.
    expect(config.prettier).toBeUndefined();
    expect(pkg.scripts?.["format:check"] ?? "").toContain('"*.{json,md,yml,yaml}"');
  });

  it("has a .prettierignore that does not take CHANGELOG.md out of the formatting gate", async () => {
    const info = await prettier.getFileInfo(CHANGELOG_PATH, {
      ignorePath: IGNORE_PATH,
      resolveConfig: true,
    });
    expect(info.ignored).toBe(false);
    expect(info.inferredParser).toBe("markdown");
  });

  it("keeps the committed changelog Prettier-canonical, which is what makes leaving it on safe", async () => {
    await expect(formatCheckAccepts(changelog)).resolves.toBe(true);
  });

  it("has NO second net in the version script, which is why the pass must stay on", () => {
    // THIS IS WHERE THIS REPO DIFFERS FROM THREE OF ITS SIBLINGS AND THE DIFFERENCE DECIDES THE
    // ARGUMENT. In `deid`, `transform` and `synth` the `version` chain ends with a
    // `prettier --write` that names `CHANGELOG.md`, so a later link repairs the document before
    // the Version PR opens and the case for leaving the pass on is only that it is free. Here
    // the trailing pass names `package.json` and `src/version.ts` and NOTHING ELSE, so there is
    // no repair: with the pass off, the Version PR really does open red on a file no human
    // touched. The arm below measures that. If someone ever adds `CHANGELOG.md` to this list,
    // this case reds and the argument above has to be re-read rather than assumed.
    const version = pkg.scripts?.["version"] ?? "";
    expect(version).toMatch(/prettier --write\b/);
    expect(version).not.toMatch(/prettier --write [^&]*\bCHANGELOG\.md\b/);
  });
});

describe("the archived history is frozen", () => {
  /**
   * The digest of the archived block as it was moved under the divider, unchanged.
   *
   * WHY A DIGEST AND NOT A SHAPE RULE. Every other case here compares an archive a release
   * PRODUCED against the archive in the working tree, which is exactly the comparison a
   * hand-edit cancels out of: edit the committed file and both sides move together and the
   * suite stays green while the defect this slice exists to remove walks back in. This is the
   * one assertion whose other side is a constant.
   *
   * IF THIS REDS, the archived history changed. That is almost certainly either a hand-edit
   * that should have been a changeset, or a formatter reflowing already-published text, which
   * is what corrupted a sibling's tarball. Do not re-baseline the constant to get green: work
   * out which of the two happened. Re-baselining is legitimate only for a deliberate, reviewed
   * correction of the historical record, and then the diff is the review.
   */
  const FROZEN_ARCHIVE_SHA256 = "f8453784e58ca16c219d81c26bcd44152b71aebb1ea01fef802b2b2c3a13acdc";
  const FROZEN_ARCHIVE_BYTES = 202_681;

  it("has not been hand-edited since generation was turned on", () => {
    const archive = archivedHistory(changelog);
    expect(archive).not.toBe("");
    expect(Buffer.byteLength(archive, "utf8")).toBe(FROZEN_ARCHIVE_BYTES);
    expect(createHash("sha256").update(archive, "utf8").digest("hex")).toBe(FROZEN_ARCHIVE_SHA256);
  });
});

describe("the region ABOVE the divider, which the frozen digest cannot see", () => {
  /**
   * WHAT THIS GROUP IS FOR, AND WHY IT IS NEW.
   *
   * A sibling measured this gap and left it open, in terms worth repeating: its frozen digest
   * covers the archive BELOW the divider and nothing else, so a hand-written `## 0.0.99` block
   * inserted between the H1 and the divider passed EVERY case in that file. It was measured by
   * inserting one. That ships a tarball announcing a release that never happened.
   *
   * WHAT THESE CASES CLOSE. The region above the divider may contain only headings a release
   * generates (`## <version>` and `### <Major|Minor|Patch> Changes`); the version headings must
   * run newest first; and the topmost must be the version `package.json` is actually at. A
   * fabricated `## 0.0.99` fails all three ways it could be placed: at the top it disagrees with
   * `package.json`, and anywhere lower it sits below a smaller version. So the shape the sibling
   * measured as passing is closed here.
   *
   * AND IT IS CLOSED ACROSS SPELLINGS, NOT JUST PLACEMENTS, WHICH COST A SECOND MEASUREMENT.
   * The first draft of this group found headings with `/^#{1,6} /`, and ` ## 0.0.99` with a
   * single leading space walked straight through it, as did a setext `0.0.99` over a row of
   * dashes. Both were reproduced on this document. `renderedHeadings` reads what markdown
   * renders instead of what a column-0 filter sees; the case below runs every spelling.
   *
   * WHAT THEY DO NOT CLOSE, NAMED FOR WHAT THEY CHECK RATHER THAN AS A UNIVERSAL. These are
   * shape and ordering rules, not provenance. A fabricated section carrying a version LOWER than
   * every real one, placed in correct descending order immediately above the divider, is
   * indistinguishable from generated output by anything in the document, and it passes. Closing
   * that needs a source of truth about which versions were really released, which this file
   * deliberately does not reach for: deriving it from git tags is one `push --delete` away from
   * making a released version look fabricated, and that is the wrong direction to fail in.
   */
  it("carries only generated headings above the divider, newest first, topped by this version", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(generatedRegionViolation(changelog, pkg.version ?? "")).toBeUndefined();
  });

  it("rejects a fabricated release section wherever it is placed (the control)", () => {
    // The rule proved load-bearing rather than asserted, on the exact shape the sibling
    // measured as passing. Both placements are reproduced.
    const lines = changelog.split("\n");
    const divider = lines.indexOf(ARCHIVE_HEADING);
    const fabricated = [
      "## 0.0.99",
      "",
      "### Patch Changes",
      "",
      "- deadbee: A release that never happened.",
      "",
    ];

    const atTop = [...lines.slice(0, divider), ...fabricated, ...lines.slice(divider)].join("\n");
    expect(generatedRegionViolation(atTop, pkg.version ?? "")).toMatch(/package\.json says/);

    // And below a real release section, where the ordering rule is what catches it.
    const released = runVersionCached();
    const rl = released.split("\n");
    const rd = rl.indexOf(ARCHIVE_HEADING);
    const belowReal = [...rl.slice(0, rd), ...fabricated, ...rl.slice(rd)].join("\n");
    expect(generatedRegionViolation(belowReal, "0.0.13")).toMatch(/not newest first/);
  });

  it("rejects a fabricated section spelled to dodge a column-0 heading filter", () => {
    // 🔴 BOTH OF THESE WERE REPRODUCED AGAINST THIS DOCUMENT BEFORE THE GUARD READ THEM, and
    // both render as an `<h2>` carrying the fabricated version. A `/^#{1,6} /` filter - the
    // obvious way to write this rule, and what `headings()` above still uses for the different
    // question of what the generator WROTE - sees neither, so the whole group passed on a
    // document announcing a release that never happened. CommonMark allows an ATX heading up to
    // three leading spaces, and a setext heading needs no `#` at all.
    const lines = changelog.split("\n");
    const divider = lines.indexOf(ARCHIVE_HEADING);
    const smuggle = (frag: readonly string[]): string =>
      [...lines.slice(0, divider), ...frag, ...lines.slice(divider)].join("\n");

    for (const indent of [" ", "  ", "   "]) {
      expect(
        generatedRegionViolation(
          smuggle([`${indent}## 0.0.99`, "", "### Patch Changes", "", "- deadbee: never.", ""]),
          pkg.version ?? "",
        ),
        `ATX indented by ${indent.length}`,
      ).toMatch(/package\.json says/);
    }

    // The setext spelling, which carries no `#` anywhere.
    expect(
      generatedRegionViolation(
        smuggle(["0.0.99", "-------", "", "- deadbee: never.", ""]),
        pkg.version ?? "",
      ),
    ).toMatch(/package\.json says/);
    expect(
      generatedRegionViolation(smuggle(["Notes", "=====", "", "Prose.", ""]), pkg.version ?? ""),
    ).toMatch(/not generated output/);
  });

  it("rejects a hand-written narrative section above the divider", () => {
    const lines = changelog.split("\n");
    const divider = lines.indexOf(ARCHIVE_HEADING);
    const smuggled = [
      ...lines.slice(0, divider),
      "## Notes",
      "",
      "Prose.",
      "",
      ...lines.slice(divider),
    ].join("\n");
    expect(generatedRegionViolation(smuggled, pkg.version ?? "")).toMatch(/not generated output/);
  });

  it("accepts what a real release actually produces, so the rule cannot wedge one", () => {
    // The rule has to be satisfied by generated output or it reds the first Version PR this
    // configuration ever opens, which is the failure mode a sibling's shape assertion had.
    expect(generatedRegionViolation(runVersionCached(), "0.0.13")).toBeUndefined();
  });

  it("still passes before any release has been generated, which is today", () => {
    // There are no version headings above the divider yet. The rule is conditional on there
    // being one, deliberately: asserting the archive heading comes second would wedge the first
    // release, which is the trap this whole shape exists to avoid.
    expect(generatedRegion(changelog).filter((l) => VERSION_HEADING.test(l))).toEqual([]);
    expect(generatedRegionViolation(changelog, pkg.version ?? "")).toBeUndefined();
  });
});

/**
 * One real `changeset version` run, reused by the cases above.
 *
 * `runVersion` spawns git and Changesets, which is the expensive part of this file. Bumping
 * from `0.0.12` is what this package is actually at, so the section a release writes here is
 * `## 0.0.13`, the one the first real Version PR will write.
 */
let cachedRelease: string | undefined;
function runVersionCached(): string {
  cachedRelease ??= runVersion({ changelogBody: changelog, from: "0.0.12" }).changelog;
  return cachedRelease;
}

describe("the shape that makes generated output land correctly", () => {
  it("puts nothing but the H1 above the first heading", () => {
    expect(shapeViolation(changelog)).toBeUndefined();
  });

  it(
    "writes the new version section between the H1 and the archived history",
    { timeout: 90_000 },
    async () => {
      const result = runVersion({ changelogBody: changelog });

      expect(result.version).not.toBe("0.0.0");
      expect(headings(result.changelog).slice(0, 3)).toEqual([
        "# Changelog",
        `## ${result.version}`,
        "### Patch Changes",
      ]);
      // The archived history survives below the release just written. Compared as HEADINGS,
      // not as string offsets, for the reason the collision case proves.
      const order = headings(result.changelog);
      expect(order).toContain(ARCHIVE_HEADING);
      expect(order.indexOf(`## ${result.version}`)).toBeLessThan(order.indexOf(ARCHIVE_HEADING));
      // The changeset's own summary landed as the entry, in the exact line shape a release
      // writes: the default generator prefixes it with the short sha of the commit that added
      // the changeset. "The changeset summary is the changelog entry" is true of the TEXT; this
      // pins the LINE, so a generator swap that dropped the prefix is visible here rather than
      // first seen in a published tarball.
      expect(result.changelog).toContain(PROBE_SUMMARY);
      expect(result.changelog).toMatch(
        new RegExp(
          `^- [0-9a-f]{7,40}: ${PROBE_SUMMARY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "m",
        ),
      );
      // AND THE INVARIANT IS CLOSED UNDER A RELEASE: the file a release produces is itself a
      // file the next release can be prepended to. Without this the suite would only ever prove
      // the shape of a file no release had touched, which is exactly the file that stops
      // existing the moment this configuration works.
      expect(shapeViolation(result.changelog)).toBeUndefined();
      // THE BYTE-IDENTITY CONTROL, and the reason the Prettier pass can be left on. The release
      // reformats the WHOLE document through Prettier, so text the archive already carried must
      // survive that pass unchanged. This is the assertion that catches a Prettier pass
      // rewriting already-published text, which is corruption inside a tarball rather than a
      // formatting preference.
      expect(archivedHistory(result.changelog)).toBe(archivedHistory(changelog));
      expect(archivePreamble(result.changelog)).toBe(archivePreamble(changelog));
      // And what the release produces is a document this repo's own `format:check` accepts, so
      // the Version PR is not red on a file nobody edited.
      await expect(formatCheckAccepts(result.changelog)).resolves.toBe(true);
    },
  );

  it(
    "keeps the whole-line anchors correct when a summary QUOTES the archive heading",
    { timeout: 90_000 },
    () => {
      // THE ABUSE CASE, RUN THROUGH THE REAL GENERATOR RATHER THAN DESCRIBED. A changeset CAN
      // put the archive heading on a line of its own, and `getReleaseLine` indents it by two
      // spaces - EXACTLY the `- ` bullet's content column - so the quoted copy is a real ATX
      // heading nested in the release section, sitting ABOVE the real divider.
      const result = runVersion({ changelogBody: changelog, probeBody: QUOTING_PROBE_BODY });
      const quoted = `  ${ARCHIVE_HEADING}`;
      expect(result.changelog.split("\n")).toContain(quoted);

      // 1. THE ANCHORS SURVIVE IT, which is why every helper here matches whole lines. A
      //    substring search for the heading would find the quoted copy first and measure a few
      //    dozen bytes of a release section as if it were the archived history.
      expect(result.changelog.indexOf(quoted)).toBeLessThan(
        result.changelog.indexOf(`\n${ARCHIVE_HEADING}`),
      );
      expect(archivedHistory(result.changelog)).toBe(archivedHistory(changelog));
      expect(archivePreamble(result.changelog)).toBe(archivePreamble(changelog));
      expect(shapeViolation(result.changelog)).toBeUndefined();

      // 2. AND IT IS NOW REFUSED, which is the part that is new. The repo-wide rule against
      //    opening a changeset summary line at column 0 with an ATX heading used to be a doc
      //    comment and nothing else, in this repo and in every sibling. The region rule reads
      //    an indented heading as the heading it renders as, so this shape reds in the Version
      //    PR - before it is published and permanent - instead of shipping in a tarball.
      expect(generatedRegionViolation(result.changelog, result.version)).toMatch(
        /not generated output/,
      );
    },
  );

  it(
    "survives the version-heading prefix collision, across two consecutive releases",
    // Above the two 60s `spawnSync` ceilings this case can spend, so a hung subprocess reports
    // as itself rather than as a case timeout.
    { timeout: 150_000 },
    () => {
      // `## 0.0.1` is a PREFIX of `## 0.0.10`, and this package has already published past
      // both. So a document whose only version heading is `## 0.0.10` answers TRUE to a
      // substring search for a heading it does not have. An assertion written that way goes
      // wrong inside a Version PR with the changeset already consumed, and `prepublishOnly`
      // runs this same suite under `changeset publish`.
      const first = runVersion({ changelogBody: changelog, from: "0.0.9" });
      expect(first.version).toBe("0.0.10");

      // The collision, demonstrated on real generator output rather than asserted.
      expect(first.changelog).toContain("## 0.0.1"); // a substring check is satisfied ...
      expect(headings(first.changelog)).not.toContain("## 0.0.1"); // ... by a heading not there.
      expect(headings(first.changelog)).toContain("## 0.0.10");

      // A second release onto a document that already carries generated output.
      const second = runVersion({ changelogBody: first.changelog, from: first.version });
      expect(second.version).toBe("0.0.11");

      expect(headings(second.changelog).slice(0, 5)).toEqual([
        "# Changelog",
        "## 0.0.11",
        "### Patch Changes",
        "## 0.0.10",
        "### Patch Changes",
      ]);
      // Newest first, the archive last, and the history untouched by either release.
      const order = headings(second.changelog);
      expect(order.indexOf("## 0.0.10")).toBeLessThan(order.indexOf(ARCHIVE_HEADING));
      expect(shapeViolation(second.changelog)).toBeUndefined();
      expect(generatedRegionViolation(second.changelog, "0.0.11")).toBeUndefined();
      expect(archivePreamble(second.changelog)).toBe(archivePreamble(changelog));
      expect(archivedHistory(second.changelog)).toBe(archivedHistory(changelog));
    },
  );

  it(
    "writes no version heading at all when the generator is off (the control)",
    { timeout: 90_000 },
    () => {
      const result = runVersion({
        changelogBody: changelog,
        configOverrides: { changelog: false },
      });

      expect(result.version).not.toBe("0.0.0");
      // The version bump still happens. The changelog is simply never touched, which is the
      // whole defect: nothing tells a reader the release went out.
      expect(result.changelog).toBe(changelog);
      // As a HEADING, not a substring, for the reason the collision case proves.
      expect(headings(result.changelog)).not.toContain(`## ${result.version}`);
      expect(result.changelog).not.toContain(PROBE_SUMMARY);
    },
  );

  it(
    "writes markdown this repo's own Prettier rejects when the pass is off (the other arm)",
    { timeout: 90_000 },
    async () => {
      // THE SETTING PROVED LOAD-BEARING, IN THE DIRECTION THAT APPLIES HERE. `"prettier": false`
      // is the right answer in a sibling whose `.prettierignore` lists `*.md`; it is the wrong
      // answer in this repo. With the pass off the generator writes `## <version>` and
      // `### Patch Changes` on adjacent lines with no blank between them, which this repo's
      // Prettier config rejects, and NOTHING later in this repo's `version` chain repairs it,
      // so the Version PR opens red on a file no human touched.
      const off = runVersion({ changelogBody: changelog, configOverrides: { prettier: false } });

      expect(headings(off.changelog).slice(0, 2)).toEqual(["# Changelog", `## ${off.version}`]);
      await expect(formatCheckAccepts(off.changelog)).resolves.toBe(false);
      // Named concretely rather than left as "something is off": the two headings collide.
      expect(off.changelog).toContain(`## ${off.version}\n### Patch Changes`);
      // THE BYTE-IDENTITY ASSERTION ON THE ARCHIVED HISTORY, IN BOTH ARMS. This is the one that
      // caught a sibling's corruption, where the ON arm ate the spaces around a backticked
      // literal inside a bold span in already-published text. Here both arms leave the archive
      // byte identical, which is what makes leaving the pass on cost this repo nothing.
      expect(archivedHistory(off.changelog)).toBe(archivedHistory(changelog));
    },
  );

  it(
    "splits the header when prose follows the H1 (the negative control)",
    { timeout: 90_000 },
    () => {
      const oldShape = [
        "# Changelog",
        "",
        "All notable changes to this project will be documented in this file.",
        "",
        "## [Unreleased]",
        "",
        "### Fixed",
        "",
        "- something that has already shipped",
        "",
      ].join("\n");

      const result = runVersion({ changelogBody: oldShape });

      // The release section is inserted between the H1 and the preamble, so the preamble now
      // reads as part of the release, and `[Unreleased]` still holds shipped content below it.
      // This is the exact document this package published for ten versions.
      expect(headings(result.changelog)).toEqual([
        "# Changelog",
        `## ${result.version}`,
        "### Patch Changes",
        "## [Unreleased]",
        "### Fixed",
      ]);
      expect(result.changelog.indexOf("All notable changes")).toBeGreaterThan(
        result.changelog.indexOf(PROBE_SUMMARY),
      );
    },
  );
});

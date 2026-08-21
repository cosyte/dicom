import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The released prose about `RetainSafePrivate`, gated mechanically.
 *
 * **No test can check a semantic claim about English**, and this one does not pretend to. What it
 * checks is the part that IS mechanical: three retired claims are absent from every released prose
 * surface, and the sentences the change obliges the package to publish are present in each of them.
 * The doc/code-agreement suite beside it (`test/docs-content.test.ts`) covers the executable half by
 * compiling and running every runnable block under `docs-content/`.
 *
 * ## Why these three strings
 *
 * Each was a load-bearing claim of the behaviour this release replaced, and each would read as a
 * lie in a shipped package: `"disclosure, not a fix"` was the package conceding that a retained
 * private value still shipped, `applied: "kept"` was the report field that said so, and
 * `KEPT unchanged` was the warning message that said so. A prose surface still carrying one of them
 * is describing a package the reader does not have.
 *
 * **A retirement announcement is not a retired claim, and the two are separated by shape rather
 * than by intent.** The prose is required to TELL a consumer that the `kept` outcome is gone, so
 * the retired token is named there in a form that is not the literal the code produced. That is why
 * the assertion is over the exact literal `applied: "kept"` and not over the word "kept".
 *
 * ## Why the phrasing is asserted rather than left to a reviewer
 *
 * The over-redaction this release trades for the closed leak is the fact a reader is most likely to
 * be surprised by in production, and the previous wording of these pages priced it as "opaque
 * vendor values". It is not: an ordinary vendor scalar under an ordinary string VR is removed too.
 * A test is the only thing that keeps that sentence from being softened back out.
 *
 * @module
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const DOCS_DIR = join(REPO_ROOT, "docs-content");

/** Every released prose surface: the README plus every page of the docs site. */
function prosePages(): readonly { readonly name: string; readonly text: string }[] {
  const docs = readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: `docs-content/${f}`, text: readFileSync(join(DOCS_DIR, f), "utf8") }));
  return [{ name: "README.md", text: readFileSync(join(REPO_ROOT, "README.md"), "utf8") }, ...docs];
}

/**
 * Markdown emphasis, code fencing and the hard wrap are formatting rather than content, so a claim
 * must not be able to hide from this gate by growing a `**` in the middle of it or by falling
 * across a line break. The retired-claim assertions above deliberately do NOT normalize: those
 * strings are code literals a prose file should carry verbatim or not at all.
 */
function plain(text: string): string {
  return text.replaceAll("*", "").replaceAll("`", "").replaceAll(/\s+/gu, " ");
}

/** The release note, wherever it currently lives: unreleased changesets, or the generated log. */
function releaseNotes(): string {
  const dir = join(REPO_ROOT, ".changeset");
  const pending = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => readFileSync(join(dir, f), "utf8"));
  return [readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8"), ...pending].join("\n");
}

describe("released prose: a retained private value this run did not enumerate", () => {
  const RETIRED = ["disclosure, not a fix", 'applied: "kept"', "KEPT unchanged"];

  it.each(RETIRED)("no released prose still claims %j", (claim) => {
    // Non-vacuity: the needle really is findable by this reader, so an empty
    // result is an absent claim rather than a broken search.
    expect(prosePages().length).toBeGreaterThan(1);
    expect(`a ${claim} b`).toContain(claim);

    for (const page of prosePages()) {
      expect(page.text, page.name).not.toContain(claim);
    }
  });

  it("the pages that document RetainSafePrivate price the over-redaction at its real size", () => {
    // 🛑 NOT "opaque vendor values". The retained class collapses to three, and
    // the sentence has to say which value a reader will actually miss.
    const collapse = "ordinary vendor scalar under an ordinary string VR is removed";
    for (const name of [
      "README.md",
      "docs-content/limitations.md",
      "docs-content/troubleshooting.md",
    ]) {
      const page = prosePages().find((p) => p.name === name);
      expect(page, name).toBeDefined();
      expect(plain(page?.text ?? ""), name).toContain(collapse);
    }
  });

  it("names the new removal record on every surface a consumer would look at", () => {
    // The guarantee AC7 gives runs through a surface that did not exist before
    // this release, so a consumer who is never told it exists cannot exercise it.
    for (const name of [
      "README.md",
      "docs-content/limitations.md",
      "docs-content/troubleshooting.md",
    ]) {
      const page = prosePages().find((p) => p.name === name);
      expect(plain(page?.text ?? ""), name).toContain("unenumerablePrivateRemovals");
    }
    expect(plain(releaseNotes())).toContain("unenumerablePrivateRemovals");
  });

  it("the release note carries all three things a consumer must act on", () => {
    const notes = plain(releaseNotes());
    // 1. The over-redaction, at the size AC17 states.
    expect(notes).toContain("ordinary vendor scalar under an ordinary string VR is removed");
    // 2. The retirement of the findings array's kept outcome.
    expect(notes).toContain("no longer produces its retired kept outcome");
    // 3. The change of meaning of the warning code, plus the fact that the
    //    published code SET did not move, which is what keeps a consumer
    //    compiling.
    expect(notes).toContain("DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE changes meaning");
    expect(notes).toContain("shipped unexamined");
    expect(notes).toContain("removed unexamined");
    expect(notes).toContain("warning-code SET is unchanged");
  });
});

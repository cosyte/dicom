import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The released prose about `(0028,0303) Longitudinal Temporal Information Modified`, gated
 * mechanically.
 *
 * **No test can check a semantic claim about English**, and this one does not pretend to - it is the
 * same instrument as `private-removal-prose.test.ts` beside it, pointed at a different obligation.
 * What it checks is the mechanical part: the pages a reader actually consults for the de-identify
 * path name **both** states the object can be in, and the known-limitations material says the third
 * state is not produced here.
 *
 * ## Why a prose gate and not just the snippet runner
 *
 * `test/docs-content.test.ts` compiles and runs every ```` ```ts runnable ```` block under
 * `docs-content/` - which covers the half of this obligation that is code, and **none** of the half
 * that is prose. A page that documented only `REMOVED`, never mentioned `UNMODIFIED`, and dropped the
 * `MODIFIED` limitation entirely would still execute its snippets and still pass that suite. The
 * assertion a de-identify consumer relies on is exactly the one the snippet runner cannot see, so it
 * gets a check that reads the pages.
 *
 * ## Why the third state is the load-bearing sentence
 *
 * `REMOVED` and `UNMODIFIED` are checkable by a reader against their own output. `MODIFIED` is not:
 * it is an **absence**, and a consumer who is never told this library cannot produce it will read the
 * `UNMODIFIED` on an object whose dates they shifted themselves as a true statement. That is the one
 * failure of this attribute a recipient acts on and never re-derives, so the sentence that prevents
 * it is asserted rather than left to a reviewer.
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
 * must not be able to hide from this gate by growing a `**` in the middle of it or by falling across
 * a line break.
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

/** The pages a reader consults for the de-identify path, and which this obligation binds. */
const DEIDENT_PAGES = [
  "README.md",
  "docs-content/cookbook.md",
  "docs-content/limitations.md",
  "docs-content/troubleshooting.md",
] as const;

describe("released prose: the temporal declaration the de-identified object carries", () => {
  it("names the attribute and BOTH states on every page that documents the de-identify path", () => {
    // Non-vacuity: the pages really are found and really are read by this reader.
    expect(prosePages().length).toBeGreaterThan(1);

    for (const name of DEIDENT_PAGES) {
      const page = prosePages().find((p) => p.name === name);
      expect(page, name).toBeDefined();
      const text = plain(page?.text ?? "");
      expect(text, name).toContain("(0028,0303)");
      expect(text, name).toContain("REMOVED");
      expect(text, name).toContain("UNMODIFIED");
    }
  });

  it("says which option produces which state, so the two are not merely both mentioned", () => {
    // 🛑 "Contains the word UNMODIFIED" is satisfied by a page that only quotes the standard.
    // A reader needs the mapping from the option set they pass to the value they will read.
    for (const name of DEIDENT_PAGES) {
      const page = prosePages().find((p) => p.name === name);
      expect(plain(page?.text ?? ""), name).toContain("RetainLongitudinalTemporal");
    }
    const readme = plain(prosePages().find((p) => p.name === "README.md")?.text ?? "");
    expect(readme).toContain(
      "REMOVED when no Retain Longitudinal Temporal Information Option was active",
    );
  });

  it("records in the known-limitations material that MODIFIED is not produced", () => {
    // The absence a consumer cannot detect from their own output. Both the npm-visible README's
    // limitations section and the docs site's limitations page carry it, because a reader arriving
    // from either route has to meet it.
    const claim = "never produces it";
    for (const name of ["README.md", "docs-content/limitations.md"]) {
      const page = prosePages().find((p) => p.name === name);
      const text = plain(page?.text ?? "");
      expect(text, name).toContain("MODIFIED");
      expect(text, name).toContain(claim);
    }
  });

  it("tells a caller who shifts dates themselves that the output declaration is then wrong", () => {
    // The one action this limitation obliges. A limitation a reader cannot act on is a disclaimer.
    for (const name of ["README.md", "docs-content/limitations.md"]) {
      const page = prosePages().find((p) => p.name === name);
      expect(plain(page?.text ?? ""), name).toContain("If you shift dates yourself after the call");
    }
  });

  it("states that a source value is REPLACED rather than joined", () => {
    // The behavioural difference from `(0012,0063)`, which a reader of these pages has just been
    // told is added to. Getting the two backwards costs a prior sender's declaration or produces a
    // multi-valued `VM 1` attribute, so the pages have to separate them.
    const readme = plain(prosePages().find((p) => p.name === "README.md")?.text ?? "");
    expect(readme).toContain("It is REPLACED, not added to");
  });

  it("the release note names the attribute and both of its values", () => {
    // 🛑 `CHANGELOG.md` IS GENERATED HERE - the changeset summary IS the entry, so this reads the
    // pending changesets and the generated log together, exactly as its sibling gate does.
    const notes = plain(releaseNotes());
    expect(notes).toContain("(0028,0303)");
    expect(notes).toContain("REMOVED");
    expect(notes).toContain("UNMODIFIED");
    expect(notes).toContain("MODIFIED");
  });

  it("the reader can go red (the needles are not matched by everything)", () => {
    // The mutation control. A `plain`/`toContain` gate that matched anything would certify every
    // assertion above without reading a page.
    const readme = prosePages().find((p) => p.name === "README.md");
    expect(readme).toBeDefined();
    expect(plain(readme?.text ?? "")).not.toContain("(0028,0304)");
    expect(plain("a **REMOVED** b")).toContain("REMOVED");
    expect(plain("a *REM*OVED b")).toContain("REMOVED");
  });
});

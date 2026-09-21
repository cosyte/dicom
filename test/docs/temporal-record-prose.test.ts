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
 * path name **all three** states the object can be in, and the known-limitations material says under
 * which Option `MODIFIED` is produced and that this library transforms no date.
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
 * `REMOVED` and `UNMODIFIED` are checkable by a reader against their own output. `MODIFIED` is not.
 * It is produced now, and what it asserts is **narrower than it reads**: PS3.15 §E.3.6 requires both
 * that the modified-dates column be resolved and that the dates themselves be modified, and this
 * library does only the first. A consumer who is never told that will read the `MODIFIED` on an
 * object whose dates nobody shifted as a true statement. That is the one failure of this attribute a
 * recipient acts on and never re-derives, so the two sentences that prevent it - which Option
 * produces `MODIFIED`, and that this library performs no date transformation - are asserted rather
 * than left to a reviewer.
 *
 * 🛑 **THIS GATE USED TO ASSERT THE OPPOSITE AND THE PAGES USED TO SAY IT.** It required the phrase
 * "never produces it" about `MODIFIED` on the README and the limitations page; that claim became
 * false when the second E.3.6 column landed, and leaving the gate green by leaving the pages alone
 * would have shipped a false limitation. The assertion moved in the same commit as the behaviour.
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
  it("AC-16: names the attribute and ALL THREE states on every page that documents the de-identify path", () => {
    // Non-vacuity: the pages really are found and really are read by this reader.
    expect(prosePages().length).toBeGreaterThan(1);

    for (const name of DEIDENT_PAGES) {
      const page = prosePages().find((p) => p.name === name);
      expect(page, name).toBeDefined();
      const text = plain(page?.text ?? "");
      expect(text, name).toContain("(0028,0303)");
      expect(text, name).toContain("REMOVED");
      expect(text, name).toContain("UNMODIFIED");
      expect(text, name).toContain("MODIFIED");
    }
  });

  it("AC-16: says which option produces which state, so the three are not merely all mentioned", () => {
    // 🛑 "Contains the word UNMODIFIED" is satisfied by a page that only quotes the standard.
    // A reader needs the mapping from the option set they pass to the value they will read, and
    // both option names are in the substring of the longer one, so the mapping sentences below are
    // what separate them.
    for (const name of DEIDENT_PAGES) {
      const page = prosePages().find((p) => p.name === name);
      const text = plain(page?.text ?? "");
      expect(text, name).toContain("RetainLongitudinalTemporal");
      expect(text, name).toContain("RetainLongitudinalTemporalModifiedDates");
    }
    const readme = plain(prosePages().find((p) => p.name === "README.md")?.text ?? "");
    expect(readme).toContain(
      "REMOVED when no Retain Longitudinal Temporal Information Option was active",
    );
    expect(readme).toContain("MODIFIED when RetainLongitudinalTemporalModifiedDates was");
  });

  it("AC-16: records in the known-limitations material the condition under which MODIFIED is produced", () => {
    // 🛑 THIS ROW REPLACES THE "never produces it" ASSERTION. The claim it used to make became
    // false with the second E.3.6 column, so what is asserted now is the condition: the Option
    // whose name earns the state. Both the npm-visible README's limitations section and the docs
    // site's limitations page carry it, because a reader arriving from either route has to meet it.
    for (const name of ["README.md", "docs-content/limitations.md"]) {
      const page = prosePages().find((p) => p.name === name);
      const text = plain(page?.text ?? "");
      expect(text, name).toContain("MODIFIED");
      expect(text, name).toContain("RetainLongitudinalTemporalModifiedDates");
      expect(text, name).toContain("mutually exclusive");
    }
  });

  it("AC-16: records that this library performs no date transformation, beside the capability", () => {
    // The half of §E.3.6 the library does not deliver, stated on the same pages as the Option that
    // delivers the other half. A `MODIFIED` a reader believes means "the dates were shifted" is the
    // one failure of this attribute a recipient acts on and never re-derives, so the sentence is
    // asserted and the stable code that says the same thing at run time is named beside it.
    for (const name of ["README.md", "docs-content/limitations.md"]) {
      const page = prosePages().find((p) => p.name === name);
      const text = plain(page?.text ?? "");
      expect(text, name).toContain("performs no date transformation");
      expect(text, name).toContain("DICOM_DEIDENT_DATES_NOT_TRANSFORMED");
    }
  });

  it("AC-16: tells a caller who shifts dates themselves that the output declaration is then wrong", () => {
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

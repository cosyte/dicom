import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * The documentation citation gate.
 *
 * Phase 8 of this package's roadmap requires that every cookbook recipe "cites the PS3 clause for
 * the attributes it reads". A citation nobody re-derives is a claim, and this repository's refusals
 * have overwhelmingly been claim defects, so the citations are checked mechanically against the
 * SHA-pinned normative documents under `vendor/nema/` rather than read once by a human.
 *
 * 🛑 WHAT IS CHECKED IS A CLAUSE WRITTEN WITH ITS PART BESIDE IT, and no name or comment in this
 * file may round that up to "every citation". `CITATION_RE` keys on a label adjacent to its `PS3.N`
 * token, so a second label in a list (`PS3.5 §7.5.1, §7.8.1`) and a bare `section X` whose part was
 * named a sentence earlier are read by a human and not by this gate. Widening the regex to rescue
 * the word "every" is the wrong direction and was refused deliberately; `docs-content/cookbook.md`
 * states the same boundary where a reader meets it.
 *
 * FOUR CHECKS, AND WHY EACH ONE EXISTS:
 *
 *  1. THE PIN IS A PRECONDITION. Every part is re-hashed before it is read, exactly as the
 *     generators under `scripts/` do. A gate that reads whatever bytes happen to be on disk proves
 *     nothing about the published standard.
 *
 *  2. A CLAUSE LABEL RESOLVES TO EXACTLY ONE SECTION. 🛑 A SECTION HEADING CAN APPEAR TWICE, so the
 *     check collects EVERY candidate carrying the cited label and requires exactly one. Zero and two
 *     are both refusals. A first-match read once took the table of contents in this repository and
 *     failed closed; never re-introduce one.
 *
 *  3. 🛑 A LABEL PROVES THE LABEL EXISTS, NOT THAT ITS BODY CARRIES THE SENTENCE. For every clause
 *     the docs lean on for a normative statement, `LOAD_BEARING` names the sentence the text relies
 *     on, and the check requires the cited section's own body to carry it, and requires that exactly
 *     one candidate section does. A prior slice in this package cited PS3.5 §7.5 twice when the
 *     sentence it needed lives in §7.5.2; this is the net for that class.
 *
 *  4. AN ATTRIBUTE IS NAMED THE WAY THE REGISTRY NAMES IT. Every `(gggg,eeee) Some Name` pair
 *     written in `README.md` or `docs-content/` is looked up in the shipped data dictionary, which
 *     CI regenerates byte-identically from the pinned PS3.6, and the name must be the registry's.
 *
 * AND ONE REFUSAL: a numbered clause of a part this repository does NOT vendor (PS3.3, PS3.4,
 * PS3.10, PS3.16, ...) may not be cited at all. There is nothing here to check it against, and the
 * package already takes that position in prose ("PS3.10 governs that group and is not vendored in
 * this repo, so no conformance verdict is claimed here"). Naming the part without a clause number is
 * fine and is what the docs do.
 *
 * The gate is deliberately about the DOCS. It says nothing about citations in `src/` JSDoc, which
 * are reviewed with the code that carries them.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const VENDOR = join(REPO_ROOT, "vendor", "nema");

/** Parts vendored here, keyed by the `PS3.N` token the docs write. */
const VENDORED_PARTS = { "PS3.5": "part05", "PS3.6": "part06", "PS3.15": "part15" } as const;
type VendoredPart = keyof typeof VENDORED_PARTS;

/** Parts a doc may NAME but may not cite a numbered clause of, because nothing here can check one. */
const UNVENDORED_PART_RE = /\bPS3\.(?:1|2|3|4|7|8|9|10|11|12|13|14|16|17|18|19|20|21|22)\b/;

interface Section {
  readonly label: string;
  readonly start: number;
}

interface PinnedDoc {
  readonly text: string;
  readonly sections: readonly Section[];
}

/**
 * Read a vendored part, refusing on a hash mismatch.
 *
 * The directory holds `SHA.txt` beside a single `<sha256>/` tree, and the hash of the document is
 * its own directory name, so a mismatch is detectable without trusting either side alone.
 */
function readPinned(part: string): string {
  const dir = join(VENDOR, part);
  const sha = readFileSync(join(dir, "SHA.txt"), "utf8").trim().split(/\s+/)[0];
  if (sha === undefined || !/^[0-9a-f]{64}$/.test(sha)) {
    throw new Error(`vendor/nema/${part}/SHA.txt does not hold a sha256`);
  }
  const subdir = join(dir, sha);
  const entries = readdirSync(subdir);
  const name = entries[0];
  if (entries.length !== 1 || name === undefined) {
    throw new Error(`vendor/nema/${part}/${sha}/ must hold exactly one document`);
  }
  const bytes = readFileSync(join(subdir, name));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha) {
    throw new Error(`vendor/nema/${part}: pinned ${sha}, on disk ${actual}`);
  }
  return bytes.toString("utf8");
}

/** Every labelled DocBook division, in document order. */
function readSections(text: string): Section[] {
  const out: Section[] = [];
  const re = /<(?:section|chapter|appendix)\b[^>]*\blabel="([^"]*)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const label = m[1];
    if (label !== undefined && label !== "") out.push({ label, start: m.index });
  }
  return out;
}

/**
 * The OWN text of `sections[index]`: everything up to the very next division, whatever its depth.
 *
 * 🛑 IT MUST NOT INCLUDE SUBSECTIONS, AND A FIRST DRAFT OF THIS FILE DID. Running to the next
 * same-or-shallower division makes a parent's body a superset of every child's, so `PS3.5 §7.5`
 * passes for a sentence that lives in §7.5.2 and `PS3.15 §E.1` passes for one that lives in §E.1.1:
 * verbatim the two confusions `CLAUDE.md` records as having each cost a refusal here, certified
 * green by the very check written to catch them. Own-text-only is what makes "the CITED clause
 * carries the sentence" mean the cited clause. Both parent cases are pinned as controls below.
 */
function bodyOf(doc: PinnedDoc, index: number): string {
  const self = doc.sections[index];
  if (self === undefined) return "";
  const next = doc.sections[index + 1];
  return next === undefined ? doc.text.slice(self.start) : doc.text.slice(self.start, next.start);
}

/** Strip DocBook markup and collapse whitespace, so a sentence match is not defeated by tagging. */
function plainText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ");
}

function loadPinned(part: VendoredPart): PinnedDoc {
  const text = readPinned(VENDORED_PARTS[part]);
  return { text, sections: readSections(text) };
}

const DOCS: Record<VendoredPart, PinnedDoc> = {
  "PS3.5": loadPinned("PS3.5"),
  "PS3.6": loadPinned("PS3.6"),
  "PS3.15": loadPinned("PS3.15"),
};

/** Collect every candidate section carrying `label`, as indices into the part's section list. */
function candidates(part: VendoredPart, label: string): number[] {
  const doc = DOCS[part];
  const out: number[] = [];
  for (const [i, s] of doc.sections.entries()) if (s.label === label) out.push(i);
  return out;
}

/**
 * The clauses the documentation leans on for a normative statement, and the sentence each one is
 * relied on for. Adding a clause citation to the docs does not require an entry here; adding one
 * that carries an argument's weight does.
 */
const LOAD_BEARING: readonly { part: VendoredPart; clause: string; sentence: string }[] = [
  {
    part: "PS3.5",
    clause: "6.2",
    sentence: "shall be of the same Data Element Structure",
  },
  {
    part: "PS3.5",
    clause: "7.1.1",
    sentence: "An even number of bytes containing the Value",
  },
  {
    part: "PS3.5",
    clause: "7.8.1",
    sentence: "The scope of the reservation is just within the Item",
  },
  {
    part: "PS3.15",
    clause: "E.1.1",
    sentence: "inserted in or added to",
  },
  {
    // The overlay half of the repeating-group bound, and ONLY the overlay half: this clause retires
    // curve encoding and delegates the `50xx` bound to PS3.5-2004 by URL, which is why that edition
    // is vendored beside the current one. Any text citing this clause for the curve range is wrong.
    part: "PS3.5",
    clause: "7.6",
    sentence: "Repeating Groups shall only be allowed in the even numbered Groups 6000-601E",
  },
  {
    // 🛑 QUOTE THIS CLAUSE WHOLE: it has two branches and a gate caught it truncated at "removed",
    // which reads a permissive clause as an absolute. The second branch is the one this library does
    // not implement, so the sentence pinned here is the one that names it.
    part: "PS3.15",
    clause: "E.3.10",
    sentence: "Private Data Element Characteristics Sequence",
  },
  {
    // The `REMOVED` half of the temporal declaration. The docs state this as an obligation on the
    // Basic Profile, so the Basic Profile's own clause has to carry it: §E.3.6 carries the other two
    // states and citing it for this one would be the §7.5/§7.5.2 confusion again.
    part: "PS3.15",
    clause: "E.2",
    sentence: 'shall be added to the Data Set with a Value of "REMOVED"',
  },
  {
    // The `UNMODIFIED` half, and the clause that also defines the third state this library does not
    // produce. Pinning the Full Dates sentence rather than the bare attribute name is what keeps the
    // docs' two-states claim tied to the branch that earns it.
    part: "PS3.15",
    clause: "E.3.6",
    sentence: 'shall be added to the Data Set with a Value of "UNMODIFIED"',
  },
];

/** Markdown the gate covers: the npm-visible README plus everything the docs site ships. */
function docFiles(): string[] {
  const out = [join(REPO_ROOT, "README.md")];
  const dir = join(REPO_ROOT, "docs-content");
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name.endsWith(".md") && statSync(full).isFile()) out.push(full);
  }
  return out.sort();
}

const FILES = docFiles();

/**
 * `PS3.5 §7.8.1`, `PS3.15 2026c section E.1.1`, `PS3.15 Annex E`: the citation forms the docs use.
 *
 * 🛑 THE LABEL ALTERNATIVE MUST ADMIT AN ANNEX LABEL. A first draft required a digit in second
 * position (`[A-Z]?[0-9]...`), which matches `7.8.1` and `6.2` and cannot match `E.1.1`, `E.2` or
 * `E.3.10`. Every PS3.15 Annex E citation on the site was therefore invisible to this gate,
 * including `§E.3.10`, the one clause `CLAUDE.md` singles out as having been caught truncated, and
 * a fabricated `§E.99.99` passed. The `checked` floor did not catch it either: the PS3.5 citations
 * alone carried it.
 */
const CITATION_RE =
  /\bPS3\.(5|6|15)\b(?:\s+\d{4}[a-z])?\s*(?:(?:§|section\s+)([A-Z0-9][0-9A-Za-z.]*)|Annex\s+([A-Z])\b)/g;

/** `(0010,0020) Patient ID`. Repeating-group masks (`60xx`) and bare tags are not name claims. */
const TAG_NAME_RE =
  /\((\d[0-9A-Fa-f]{3}),([0-9A-Fa-f]{4})\)[`\s]+((?:[A-Z][A-Za-z0-9'’-]*)(?:\s+(?:of|the|from|to|per|and|a)\s+[A-Za-z0-9'’-]+|\s+[A-Z][A-Za-z0-9'’-]*)*)/g;

/**
 * A bare two-letter capital token after a tag is the element's VR, not its name: prose routinely
 * writes "an `(0008,4000)` `ST` carrying ...". No attribute in the registry is named with two
 * capitals, so skipping the shape costs no coverage.
 */
const VR_TOKEN_RE = /^[A-Z]{2}$/;

/**
 * Blank out fenced code blocks, keeping the line count so an offset still reads.
 *
 * A wire-layout diagram writes an attribute's KEYWORD beside its VR as two columns
 * (`(0010,0010) PatientName  PN`), which is neither a registry name nor a claim to be one; the same
 * goes for a `// (0028,1053)` comment marking which attribute a line reads. The registry check is a
 * check on PROSE, where naming an attribute is an assertion about the standard.
 */
function stripFences(md: string): string {
  let fenced = false;
  return md
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        return "";
      }
      return fenced ? "" : line;
    })
    .join("\n");
}

interface RegistryEntry {
  readonly name: string;
  readonly keyword: string;
}

/**
 * The shipped registry, read as source rather than imported, so the gate does not depend on a build.
 * CI already proves this file regenerates byte-identically from the pinned PS3.6, which is what
 * makes it a faithful projection of the normative document rather than a second authority.
 */
const REGISTRY: ReadonlyMap<string, RegistryEntry> = (() => {
  const src = readFileSync(join(REPO_ROOT, "src", "dictionary", "generated", "tags.ts"), "utf8");
  const out = new Map<string, RegistryEntry>();
  for (const m of src.matchAll(/"([0-9A-F]{8})":\s*\{([^}]*)\}/g)) {
    const tag = m[1];
    const body = m[2];
    if (tag === undefined || body === undefined) continue;
    const name = /name:\s*"((?:[^"\\]|\\.)*)"/.exec(body)?.[1];
    const keyword = /keyword:\s*"((?:[^"\\]|\\.)*)"/.exec(body)?.[1];
    if (name !== undefined && keyword !== undefined) out.set(tag, { name, keyword });
  }
  return out;
})();

/** Compare a documented attribute name to a registry one: case, spacing and apostrophes are noise. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string): string => s.replace(/[\s'’]|\u200B/g, "").toLowerCase();
  return norm(a) === norm(b);
}

describe("documentation spec citations", () => {
  test("the vendored parts hash to their pins, and the gate has documents to read", () => {
    // Re-hashing happens in readPinned; reaching here at all means all three matched.
    // PS3.6 is a registry of tables and carries far fewer labelled divisions than the prose parts,
    // so the floors are per part rather than one number that would have to be the smallest.
    expect(DOCS["PS3.5"].sections.length).toBeGreaterThan(50);
    expect(DOCS["PS3.15"].sections.length).toBeGreaterThan(50);
    expect(DOCS["PS3.6"].sections.length).toBeGreaterThan(10);
    expect(REGISTRY.size).toBeGreaterThan(4000);
    expect(FILES.length).toBeGreaterThan(1);
  });

  test("a clause cited WITH ITS PART, in a vendored prose part, resolves to exactly one section", () => {
    // The scope is in the name rather than in a comment, because a name that overstates is the
    // thing this whole file is about, and an earlier name here did: it said "every cited clause"
    // over a check that never sees a label written away from its part. PS3.6 is a registry of
    // tables, not numbered prose: the docs cite it for attribute identity, checked by its own case.
    const refusals: string[] = [];
    const seen = new Set<string>();
    let checked = 0;
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(CITATION_RE)) {
        const part = `PS3.${m[1] ?? ""}` as VendoredPart;
        const clause = (m[2] ?? m[3] ?? "").replace(/\.$/, "");
        if (part === "PS3.6") continue;
        checked++;
        seen.add(`${part} ${clause}`);
        const found = candidates(part, clause);
        if (found.length !== 1) {
          refusals.push(
            `${relative(REPO_ROOT, file)}: ${part} ${clause} resolved to ${String(found.length)} sections (require exactly 1)`,
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
    // The docs cite BOTH prose parts, and an Annex-labelled clause among them. A `checked` floor
    // alone is carried by whichever part happens to be cited most, which is how every PS3.15 Annex
    // E citation went unseen behind a regex that could not match one.
    expect([...seen].some((c) => c.startsWith("PS3.5 "))).toBe(true);
    expect([...seen].some((c) => c.startsWith("PS3.15 E"))).toBe(true);
    expect(refusals).toStrictEqual([]);
  });

  test("every load-bearing clause carries the sentence the docs rely on, in exactly one section", () => {
    const refusals: string[] = [];
    for (const { part, clause, sentence } of LOAD_BEARING) {
      const found = candidates(part, clause);
      const carrying = found.filter((i) => plainText(bodyOf(DOCS[part], i)).includes(sentence));
      if (found.length !== 1 || carrying.length !== 1) {
        refusals.push(
          `${part} ${clause}: ${String(found.length)} candidate section(s), ${String(carrying.length)} carrying ${JSON.stringify(sentence)}`,
        );
      }
    }
    expect(refusals).toStrictEqual([]);
  });

  test("a sentence that is NOT in the cited clause is refused (the gate can go red)", () => {
    // The mutation control. Without it, a checker that silently matched everything would read
    // green, which is precisely the failure the LOAD_BEARING table exists to prevent.
    const found = candidates("PS3.5", "7.1.1");
    expect(found).toHaveLength(1);
    const carrying = found.filter((i) =>
      plainText(bodyOf(DOCS["PS3.5"], i)).includes("The scope of the reservation is just within"),
    );
    expect(carrying).toStrictEqual([]);
  });

  test("a PARENT clause is refused for a sentence that lives in its subsection", () => {
    // The control for `bodyOf` reading own text only. Both pairs are the exact confusions
    // `CLAUDE.md` records as having cost a refusal in this package: §7.5 quoted for a §7.5.2 fact,
    // and §E.1 quoted for an §E.1.1 one. A body that swallowed subsections would pass both.
    //
    // 🛑 THE CHILD MUST REALLY BE THE PARENT'S SUBSECTION, OR THE CONTROL IS INERT. A first draft
    // paired §7.5 with §7.8.1, which is not under §7.5 at all, so the WIDE body a revert restores
    // stops at §7.6 and answers `0` for it too: the case could not go red on a revert while three
    // artifacts described it as the net for that class. Check the labels, not the story. Re-measure
    // it by reverting `bodyOf` to same-or-shallower; with §7.5.2 this case reds, with §7.8.1 it did
    // not.
    const cases: readonly {
      part: VendoredPart;
      parent: string;
      child: string;
      sentence: string;
    }[] = [
      {
        part: "PS3.5",
        parent: "7.5",
        child: "7.5.2",
        sentence: "Delimitation of the last Item of a Sequence of Items",
      },
      { part: "PS3.15", parent: "E.1", child: "E.1.1", sentence: "inserted in or added to" },
    ];
    for (const { part, parent, child, sentence } of cases) {
      const parents = candidates(part, parent);
      const children = candidates(part, child);
      expect(parents).toHaveLength(1);
      expect(children).toHaveLength(1);
      const inParent = parents.filter((i) => plainText(bodyOf(DOCS[part], i)).includes(sentence));
      const inChild = children.filter((i) => plainText(bodyOf(DOCS[part], i)).includes(sentence));
      expect({ clause: `${part} ${parent}`, carrying: inParent.length }).toStrictEqual({
        clause: `${part} ${parent}`,
        carrying: 0,
      });
      expect({ clause: `${part} ${child}`, carrying: inChild.length }).toStrictEqual({
        clause: `${part} ${child}`,
        carrying: 1,
      });
    }
  });

  test("every documented attribute is named the way the registry names it", () => {
    const refusals: string[] = [];
    let checked = 0;
    for (const file of FILES) {
      const text = stripFences(readFileSync(file, "utf8"));
      for (const m of text.matchAll(TAG_NAME_RE)) {
        const tag = `${m[1] ?? ""}${m[2] ?? ""}`.toUpperCase();
        const documented = (m[3] ?? "").trim();
        if (VR_TOKEN_RE.test(documented)) continue;
        if (/X/i.test(`${m[1] ?? ""}${m[2] ?? ""}`.replace(/[0-9A-Fa-f]/g, ""))) continue;
        const entry = REGISTRY.get(tag);
        if (entry === undefined) continue; // not a registry tag (private, or a mask): nothing to check
        checked++;
        if (!sameName(documented, entry.name) && !sameName(documented, entry.keyword)) {
          refusals.push(
            `${relative(REPO_ROOT, file)}: (${tag}) documented as ${JSON.stringify(documented)}, registry says ${JSON.stringify(entry.name)}`,
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(refusals).toStrictEqual([]);
  });

  test("the attribute-name comparator discriminates (the gate can go red)", () => {
    // The mutation control for the check above. A comparator that normalized too hard would call
    // every pair a match and the check would be decoration.
    const patientId = REGISTRY.get("00100020");
    expect(patientId?.name).toBe("Patient ID");
    expect(sameName("Patient ID", patientId?.name ?? "")).toBe(true);
    expect(sameName("patientid", patientId?.name ?? "")).toBe(true); // case and spacing are noise
    expect(sameName("Patient Name", patientId?.name ?? "")).toBe(false);
    expect(sameName("Issuer of Patient ID", patientId?.name ?? "")).toBe(false);
  });

  test("no numbered clause of an un-vendored part is cited", () => {
    const refusals: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!UNVENDORED_PART_RE.test(line)) continue;
        // A numbered clause looks like `PS3.3 C.7.1.1`, `PS3.10 §7.1`, `PS3.16 section 8`.
        const cite =
          /\bPS3\.(?:1|2|3|4|7|8|9|10|11|12|13|14|16|17|18|19|20|21|22)\b[^\n]{0,12}?(?:§|section\s+|\s)([A-Z]\.\d|\d+\.\d)/.exec(
            line,
          );
        if (cite !== null)
          refusals.push(`${relative(REPO_ROOT, file)}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(refusals).toStrictEqual([]);
  });
});

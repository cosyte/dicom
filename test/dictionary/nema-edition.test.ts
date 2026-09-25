/**
 * AC-1: the dictionary and Annex E generators read PS3.6 and PS3.15 DocBook of ONE
 * edition, 2026d or later, each re-hashed against its vendored `SHA.txt`.
 *
 * The two parts are pinned separately, one directory each under `vendor/nema/`, so
 * nothing in the layout stops one of them being re-pinned alone. That is the trap this
 * file closes: a de-identifier whose action table lags the dictionary keeps, with a
 * clean report, every attribute the newer dictionary knows and the older table does
 * not list. So the edition is read from each document's own `<subtitle>`, with the
 * generators' own patterns, and the two must agree.
 *
 * The generated headers are held to the same pin: each names the edition and SHA-256
 * of the document it was generated from, and both must be the vendored ones, or the
 * committed artifacts answer for a document that is no longer here.
 *
 * READ ONLY. Nothing here writes to the tree.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const GENERATED = join(REPO_ROOT, "src", "dictionary", "generated");

/** The earliest edition whose Table E.1-1 carries (3004,007F). */
const EDITION_FLOOR = "2026d";

interface Part {
  readonly dir: "part06" | "part15";
  readonly file: string;
  /** The generator's own `<subtitle>` pattern for this part. */
  readonly subtitle: RegExp;
  /** The generated artifacts whose header names this part. */
  readonly artifacts: readonly string[];
  /** How those headers spell the part, e.g. `PS3.6`. */
  readonly label: string;
}

const PARTS: readonly Part[] = [
  {
    dir: "part06",
    file: "part06.xml",
    subtitle: /<subtitle>\s*DICOM PS3\.6 ([0-9]{4}[a-z]?) - Data Dictionary\s*<\/subtitle>/,
    artifacts: ["tags.ts", "keywords.ts", "uids.ts"],
    label: "PS3.6",
  },
  {
    dir: "part15",
    file: "part15.xml",
    subtitle: /<subtitle>\s*DICOM PS3\.15 ([0-9]{4}[a-z]?) - [^<]*<\/subtitle>/,
    artifacts: ["annex-e.ts"],
    label: "PS3.15",
  },
];

interface Vendored {
  readonly pinned: string;
  readonly actual: string;
  readonly edition: string | undefined;
}

function readVendored(part: Part): Vendored {
  const root = join(REPO_ROOT, "vendor", "nema", part.dir);
  const pinned = readFileSync(join(root, "SHA.txt"), "utf8").trim().split(/\s+/)[0] ?? "";
  const bytes = readFileSync(join(root, pinned, part.file));
  const actual = createHash("sha256").update(bytes).digest("hex");
  const edition = part.subtitle.exec(bytes.toString("utf8"))?.[1];
  return { pinned, actual, edition };
}

/** Year first, then the letter; an edition with no letter sorts before `a`. */
function atOrAfter(edition: string, floor: string): boolean {
  const parse = (e: string): readonly [number, string] => {
    const m = /^([0-9]{4})([a-z]?)$/.exec(e);
    expect(m, `edition ${JSON.stringify(e)} must read as <year><letter>`).not.toBeNull();
    return [Number(m?.[1]), m?.[2] ?? ""];
  };
  const [year, letter] = parse(edition);
  const [floorYear, floorLetter] = parse(floor);
  return year !== floorYear ? year > floorYear : letter >= floorLetter;
}

/** The `//` header block that opens a generated artifact. */
function headerOf(artifact: string): string {
  const text = readFileSync(join(GENERATED, artifact), "utf8");
  return text
    .split("\n")
    .filter((line) => line.startsWith("//"))
    .join("\n");
}

const vendored = new Map(PARTS.map((part) => [part.dir, readVendored(part)]));

describe("the vendored PS3.6 and PS3.15 DocBook (AC-1)", () => {
  it("AC-1: each document re-hashes to the SHA-256 in its SHA.txt", () => {
    for (const part of PARTS) {
      const v = vendored.get(part.dir);
      expect(v?.pinned, part.dir).toMatch(/^[0-9a-f]{64}$/);
      expect(v?.actual, part.dir).toBe(v?.pinned);
    }
  });

  it("AC-1: both documents name one edition, and it sorts at or after 2026d", () => {
    const ps36 = vendored.get("part06")?.edition;
    const ps315 = vendored.get("part15")?.edition;
    expect(ps36, "part06.xml must identify its edition in <subtitle>").toBeDefined();
    expect(ps315, "part15.xml must identify its edition in <subtitle>").toBeDefined();
    expect(ps315, "PS3.6 and PS3.15 advance together or the gap only widens").toBe(ps36);
    expect(atOrAfter(ps36 ?? "", EDITION_FLOOR), `${String(ps36)} >= ${EDITION_FLOOR}`).toBe(true);
  });

  it("AC-1: every generated header names the vendored edition and SHA-256", () => {
    for (const part of PARTS) {
      const v = vendored.get(part.dir);
      for (const artifact of part.artifacts) {
        const header = headerOf(artifact);
        const edition = new RegExp(
          `NEMA DICOM ${part.label.replace(".", "\\.")} (\\S+) DocBook`,
        ).exec(header)?.[1];
        const sha = new RegExp(`${part.file.replace(".", "\\.")} \\S+ ([0-9a-f]{64})`).exec(
          header,
        )?.[1];
        expect(edition, `${artifact} edition`).toBe(v?.edition);
        expect(sha, `${artifact} SHA-256`).toBe(v?.pinned);
      }
    }
  });
});

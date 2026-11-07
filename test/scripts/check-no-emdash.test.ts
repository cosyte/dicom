/**
 * Tests for the CHANGELOG.md region rule in scripts/check-no-emdash.sh.
 *
 * The dash gate scans every tracked file, but `CHANGELOG.md` only ABOVE its
 * `## Released before this file was generated` divider. Below it is the frozen
 * archive that `test/scripts/changelog-generation.test.ts` pins by digest, and it
 * carries an en dash in a released entry. These cases pin both halves of the rule:
 *
 *  1. An en dash (or an em dash) above the divider reds, named by the file's own
 *     line number.
 *  2. An en dash below the divider is not read, so the gate stays green. The
 *     control in the same fixture puts the same character in another tracked file
 *     and reds, so the green is the region rule and not a scanner that cannot see.
 *  3. The real CHANGELOG.md, whose archive really does hold an en dash, scans green
 *     on its own, and the en dash really is below the divider.
 *  4. A missing divider, or a divider on line 1, refuses rather than guessing a
 *     boundary.
 *
 * The fixtures are throwaway git repos holding a copy of the real script, so nothing
 * here depends on the state of this tree beyond the script and CHANGELOG.md. The
 * dashes are built from their code points, because this file is itself scanned by
 * the gate under test.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no
 * shell-form.
 */

import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "check-no-emdash.sh");

const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);
const DIVIDER = "## Released before this file was generated";

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const repos: string[] = [];

afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if ((r.status ?? -1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

/** A throwaway repo holding the real gate, a README and the given CHANGELOG.md, all tracked. */
function makeRepo(changelog: string, readme = "# throwaway\n"): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dicom-no-emdash-")));
  repos.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-no-emdash.sh"));
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  writeFileSync(join(root, "README.md"), readme);
  git(root, ["init", "-q", "."]);
  git(root, ["add", "scripts/check-no-emdash.sh", "CHANGELOG.md", "README.md"]);
  return root;
}

function runGate(cwd: string): RunResult {
  const r = spawnSync("bash", ["scripts/check-no-emdash.sh"], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A changelog with one generated section above the divider and an archive below it. */
function changelog(above: string, below: string): string {
  return `# Changelog\n\n## 0.1.0\n\n- ${above}\n\n${DIVIDER}\n\n## 0.0.1\n\n- ${below}\n`;
}

describe("check-no-emdash: CHANGELOG.md above the archive divider", () => {
  it("is green over a clean changelog, and names the divider line it used", () => {
    const r = runGate(makeRepo(changelog("Plain text.", "Plain text.")));
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("plus CHANGELOG.md above its archive divider at line 7");
  });

  it("reds on an en dash above the divider, at the file's own line number", () => {
    const r = runGate(makeRepo(changelog(`Pages 2${EN_DASH}3.`, "Plain text.")));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`./CHANGELOG.md:5:- Pages 2${EN_DASH}3.`);
    expect(r.stderr).toContain("em or en dash");
  });

  it("reds on an em dash above the divider", () => {
    const r = runGate(makeRepo(changelog(`One ${EM_DASH} two.`, "Plain text.")));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("./CHANGELOG.md:5:");
  });
});

describe("check-no-emdash: the frozen archive below the divider is not read", () => {
  it("stays green with an en dash below the divider", () => {
    const r = runGate(makeRepo(changelog("Plain text.", `Phase 1${EN_DASH}7 shipped.`)));
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("control: the same en dash in another tracked file reds, so the green above is the region rule", () => {
    const r = runGate(
      makeRepo(
        changelog("Plain text.", `Phase 1${EN_DASH}7 shipped.`),
        `Phase 1${EN_DASH}7 shipped.\n`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("./README.md:1:");
    expect(r.stderr).not.toContain("./CHANGELOG.md:");
  });

  it("is green over the real CHANGELOG.md, whose archive holds an en dash below the divider", () => {
    const real = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");
    const lines = real.split("\n");
    const divider = lines.indexOf(DIVIDER);
    expect(divider).toBeGreaterThan(0);
    expect(lines.slice(0, divider).some((l) => l.includes(EN_DASH))).toBe(false);
    expect(lines.slice(divider + 1).some((l) => l.includes(EN_DASH))).toBe(true);
    const r = runGate(makeRepo(real));
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`archive divider at line ${String(divider + 1)}`);
  });
});

describe("check-no-emdash: the divider must be there to be applied", () => {
  it("refuses when the divider is missing, rather than scanning all or none of the file", () => {
    const r = runGate(makeRepo("# Changelog\n\n## 0.1.0\n\n- Plain text.\n"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("the archive divider is missing");
  });

  it("refuses when the divider is on line 1, leaving nothing above it to scan", () => {
    const r = runGate(makeRepo(`${DIVIDER}\n\n- Plain text.\n`));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("leaving nothing above it");
  });
});

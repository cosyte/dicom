/**
 * Unit tests for scripts/phi-scan.ts.
 *
 * Each fixture exercises one branch of the scanner:
 *   - clean (PN + DA both in allow-list)
 *   - recent-date violator
 *   - recent-PN violator
 *   - non-DICOM JSON (clean)
 *   - non-DICOM TXT (recent-date hit)
 *   - override-log validation
 *
 * The scanner is invoked via spawnSync (array args, no shell) so we exercise
 * the full CLI path (argv parsing, exit code, stderr capture).
 *
 * SECURITY: All subprocess calls in these tests use spawnSync with array args.
 * No exec, no execSync, no shell-form. (D-15/T-01-04-07.)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  appendFileSync,
  existsSync,
  rmSync,
  copyFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const FIX_DIR = join(REPO_ROOT, "test", "fixtures", "phi-scan");
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const OVERRIDES_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

// ---------------------------------------------------------------------------
// DICOM Part 10 fixture assembler
// ---------------------------------------------------------------------------

/**
 * Produce a minimal valid DICOM Part 10 buffer with the supplied StudyDate (DA)
 * and PatientName (PN). Transfer syntax is Explicit VR LE
 * (UID `1.2.840.10008.1.2.1`).
 */
function buildDicomFixture(studyDate: string, patientName: string): Buffer {
  // Pad PN to even length with trailing space (DICOM requires even-length values).
  const pnPadded = patientName.length % 2 === 0 ? patientName : patientName + " ";
  // Pad DA - DICOM DA is always 8 chars YYYYMMDD; that's already even.
  if (studyDate.length !== 8) {
    throw new Error(`buildDicomFixture: studyDate must be 8 chars, got ${studyDate}`);
  }

  // ---- Dataset (Explicit VR LE) ----
  // (0008,0020) DA length=8 value=studyDate
  const daBuf = Buffer.alloc(8 + 8);
  daBuf.writeUInt16LE(0x0008, 0);
  daBuf.writeUInt16LE(0x0020, 2);
  daBuf.write("DA", 4, "ascii");
  daBuf.writeUInt16LE(8, 6);
  daBuf.write(studyDate, 8, "ascii");

  // (0010,0010) PN length=pnPadded.length value=pnPadded
  const pnBuf = Buffer.alloc(8 + pnPadded.length);
  pnBuf.writeUInt16LE(0x0010, 0);
  pnBuf.writeUInt16LE(0x0010, 2);
  pnBuf.write("PN", 4, "ascii");
  pnBuf.writeUInt16LE(pnPadded.length, 6);
  pnBuf.write(pnPadded, 8, "ascii");

  const dataset = Buffer.concat([daBuf, pnBuf]);

  // ---- File Meta (Explicit VR LE) ----
  // We assemble the file-meta elements AFTER the (0002,0000) group-length
  // element. Group length value = byte length of all subsequent file-meta
  // elements.

  // (0002,0001) OB length=2 value="\x00\x01" - long-form: 2 reserved + 4-byte length
  const fileMetaInfoVersion = Buffer.alloc(12 + 2);
  fileMetaInfoVersion.writeUInt16LE(0x0002, 0);
  fileMetaInfoVersion.writeUInt16LE(0x0001, 2);
  fileMetaInfoVersion.write("OB", 4, "ascii");
  // bytes 6-7 reserved (zero)
  fileMetaInfoVersion.writeUInt32LE(2, 8);
  fileMetaInfoVersion[12] = 0x00;
  fileMetaInfoVersion[13] = 0x01;

  // Helper to emit a UI element (short-form Explicit VR LE).
  function uiElement(group: number, element: number, value: string): Buffer {
    const padded = value.length % 2 === 0 ? value : value + "\0";
    const out = Buffer.alloc(8 + padded.length);
    out.writeUInt16LE(group, 0);
    out.writeUInt16LE(element, 2);
    out.write("UI", 4, "ascii");
    out.writeUInt16LE(padded.length, 6);
    out.write(padded, 8, "ascii");
    return out;
  }

  // (0002,0002) Media Storage SOP Class UID - CT Image Storage
  const sopClass = uiElement(0x0002, 0x0002, "1.2.840.10008.5.1.4.1.1.2");
  // (0002,0003) Media Storage SOP Instance UID
  const sopInstance = uiElement(0x0002, 0x0003, "1.2.3.4");
  // (0002,0010) Transfer Syntax UID - Explicit VR Little Endian
  const transferSyntax = uiElement(0x0002, 0x0010, "1.2.840.10008.1.2.1");
  // (0002,0012) Implementation Class UID
  const implClass = uiElement(0x0002, 0x0012, "1.2.3.4.5");

  const fileMetaRest = Buffer.concat([
    fileMetaInfoVersion,
    sopClass,
    sopInstance,
    transferSyntax,
    implClass,
  ]);

  // (0002,0000) UL length=4 value=fileMetaRest.length
  const groupLength = Buffer.alloc(8 + 4);
  groupLength.writeUInt16LE(0x0002, 0);
  groupLength.writeUInt16LE(0x0000, 2);
  groupLength.write("UL", 4, "ascii");
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(fileMetaRest.length, 8);

  // ---- Preamble + magic ----
  const preamble = Buffer.alloc(128); // zero-filled
  const magic = Buffer.from("DICM", "ascii");

  return Buffer.concat([preamble, magic, groupLength, fileMetaRest, dataset]);
}

function writeDicomFixture(path: string, studyDate: string, patientName: string): void {
  writeFileSync(path, buildDicomFixture(studyDate, patientName));
}

// ---------------------------------------------------------------------------
// Scanner runner
// ---------------------------------------------------------------------------

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Invoke the scanner via spawnSync (array args, no shell). Uses the local
 * `tsx` from node_modules to run the TypeScript scanner directly.
 */
function runScanner(args: string[]): RunResult {
  const tsxBin = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsxBin, [SCANNER_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  mkdirSync(FIX_DIR, { recursive: true });
  writeDicomFixture(join(FIX_DIR, "synthetic-pn-anon.dcm"), "19500101", "ANON^PATIENT");
  writeDicomFixture(join(FIX_DIR, "synthetic-pn-doe.dcm"), "19000101", "DOE^JANE");
  writeDicomFixture(join(FIX_DIR, "old-date-1900.dcm"), "19000101", "ANON^PATIENT");
  writeDicomFixture(join(FIX_DIR, "recent-date-violator.dcm"), "20250612", "ANON^PATIENT");
  writeDicomFixture(join(FIX_DIR, "recent-pn-violator.dcm"), "19000101", "SMITH^JOHN");
  writeFileSync(
    join(FIX_DIR, "non-dicom-clean.json"),
    JSON.stringify({ date: "1850-01-01", patient: "ANON^PATIENT" }),
  );
  writeFileSync(
    join(FIX_DIR, "non-dicom-violator.txt"),
    "Sample DOB record: 1990-04-15 (recent - should fail)",
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("phi-scan: synthetic / allow-listed fixtures (D-15 + TEST-09)", () => {
  it("synthetic-pn-anon.dcm exits 0", () => {
    const r = runScanner([join(FIX_DIR, "synthetic-pn-anon.dcm")]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("synthetic-pn-doe.dcm exits 0", () => {
    const r = runScanner([join(FIX_DIR, "synthetic-pn-doe.dcm")]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("old-date-1900.dcm exits 0 (older than 120 years)", () => {
    const r = runScanner([join(FIX_DIR, "old-date-1900.dcm")]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan: recent-date / non-allow-listed-PN violations (TEST-09)", () => {
  it("recent-date-violator.dcm exits 1 with structured stderr", () => {
    const r = runScanner([join(FIX_DIR, "recent-date-violator.dcm")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/0008,0020/);
    expect(r.stderr).toMatch(/20250612/);
  });

  it("recent-pn-violator.dcm exits 1 with structured stderr", () => {
    const r = runScanner([join(FIX_DIR, "recent-pn-violator.dcm")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/0010,0010/);
    expect(r.stderr).toMatch(/SMITH\^JOHN/);
  });
});

describe("phi-scan: non-DICOM file regex sweep", () => {
  it("non-dicom-clean.json exits 0", () => {
    const r = runScanner([join(FIX_DIR, "non-dicom-clean.json")]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("non-dicom-violator.txt exits 1 (1990 date)", () => {
    const r = runScanner([join(FIX_DIR, "non-dicom-violator.txt")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/1990/);
  });
});

describe("phi-scan: --allow-fixture override (D-17)", () => {
  it("rejects --allow-fixture without an override-log entry (exit 2)", () => {
    const r = runScanner(["--allow-fixture", join(FIX_DIR, "recent-date-violator.dcm")]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/phi-scan-overrides\.md/);
  });

  it("honors --allow-fixture WITH an override-log entry (exit 0)", () => {
    if (!existsSync(OVERRIDES_PATH)) {
      throw new Error("phi-scan-overrides.md must exist before this test runs");
    }
    const original = readFileSync(OVERRIDES_PATH, "utf8");
    try {
      const entry =
        "\n### test/fixtures/phi-scan/recent-date-violator.dcm\n\n" +
        "- **Date:** 2026-05-01\n" +
        "- **Reason:** unit test\n" +
        "- **Approved by:** vitest\n" +
        "- **Expires:** permanent\n";
      appendFileSync(OVERRIDES_PATH, entry);
      const r = runScanner(["--allow-fixture", "test/fixtures/phi-scan/recent-date-violator.dcm"]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    } finally {
      writeFileSync(OVERRIDES_PATH, original);
    }
  });
});

// ---------------------------------------------------------------------------
// Entries that are not regular files, on BOTH enumerating routes
// ---------------------------------------------------------------------------
//
// The walk enumerates `Dirent.isFile()`, an lstat answer, so a symbolic link is
// neither a file nor a directory; `--staged` reads content with
// `git show :<path>`, and git stores a link as its TARGET PATH under mode
// 120000. A link under `test/fixtures/` pointing at a PHI-bearing file therefore
// used to scan CLEAN on both. These cases pin the refusal on each route, the
// negative controls that keep ordinary files scanned on each route, and the rule
// that a refusal never echoes what is on the other side of the link.
//
// Every case runs against a THROWAWAY GIT REPOSITORY, never against this one:
// the scanner roots everything at `process.cwd()`, so a synthetic tree is enough
// and no link or violator is ever written into the committed corpus.

/**
 * Synthetic, name-bearing payload. A payload with no name proves nothing about a
 * claim that names do not leak, so this one carries a person name in DICOM PN
 * form, an ISO date and a compact `YYYYMMDD` date - the three shapes this
 * scanner's text pass detects. Every value is invented.
 */
const SYNTHETIC_PHI =
  ["Patient: RIVERA^JUANITA", "DOB: 1978-03-14", "StudyDate: 20240115"].join("\n") + "\n";

/** The link target's own name carries a synthetic name, so an echo of it is visible. */
const TARGET_NAME = "RIVERA-JUANITA-1978-03-14.txt";

/** Tokens that must never appear in a refusal message. */
const PHI_TOKENS = ["RIVERA", "JUANITA", "1978-03-14", "20240115", TARGET_NAME];

function expectNoPhi(stderr: string): void {
  for (const t of PHI_TOKENS) expect(stderr).not.toContain(t);
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if ((r.status ?? -1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function gitOut(cwd: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return r.stdout ?? "";
}

function runIn(cwd: string, args: string[]): RunResult {
  const tsxBin = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsxBin, [SCANNER_PATH, ...args], { cwd, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const repos: string[] = [];

/**
 * A throwaway git repo laid out the way this scanner expects: an allow-list under
 * `scripts/`, the `test/fixtures/` walk root, and one ordinary fixture so the
 * walk has something legitimate to find.
 */
function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-repo-")));
  repos.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "test", "fixtures"), { recursive: true });
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "test", "fixtures", "ordinary.txt"), "synthetic corpus placeholder\n");
  git(root, ["init", "-q", "."]);
  return root;
}

afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
});

describe("phi-scan: the scanner under test is THIS package's", () => {
  // Negative control against a cross-worker file collision. Several agents share
  // one scratch area in this environment, and a scanner belonging to a sibling
  // package would answer most of the cases below plausibly while proving nothing
  // about `@cosyte/dicom`. Assert the identity rather than assume it.
  it("is @cosyte/dicom's scanner, not a sibling's", () => {
    const pkg: unknown = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const name = (pkg as { name?: unknown }).name;
    expect(name).toBe("@cosyte/dicom");
    expect(name).not.toBe("@cosyte/terminology");
    expect(existsSync(SCANNER_PATH)).toBe(true);
    // The DICOM-specific detector this repo's floor is built on. A sibling's
    // scanner has no PN tag table.
    expect(readFileSync(SCANNER_PATH, "utf8")).toContain("PN_TAGS");
  });
});

describe("phi-scan: the synthetic payload is genuinely detectable", () => {
  // Guards against proving nothing by fixture: every refusal case below rests on
  // this payload being something the scanner would otherwise catch.
  it("as a plain regular file under the walk root it is a hit (exit 1)", () => {
    const root = makeRepo();
    writeFileSync(join(root, "test", "fixtures", "violator.txt"), SYNTHETIC_PHI);
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("RIVERA^JUANITA");
    expect(r.stderr).toContain("1978-03-14");
  });

  it("a repo with no link and no violator scans clean (exit 0)", () => {
    const root = makeRepo();
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });
});

describe("phi-scan: the all-mode walk refuses a non-regular entry", () => {
  it("refuses a symlink under the walk root pointing at PHI (exit 2), and reports no PHI", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "leak.txt"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.txt");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("refuses a symlinked DIRECTORY too, which isDirectory() also answers false for", () => {
    const root = makeRepo();
    mkdirSync(join(root, "elsewhere"));
    writeFileSync(join(root, "elsewhere", TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", "elsewhere"), join(root, "test", "fixtures", "linked-dir"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/linked-dir");
    expectNoPhi(r.stderr);
  });

  it("refuses a link named README.md, which the file route's exemption would have skipped", () => {
    // The `readme.md` exemption is a judgement about a file whose bytes the walk
    // could have read. A link's NAME is no evidence about what is on the other
    // side of it, so the exemption deliberately does not reach one.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "README.md"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/README.md");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("names EVERY offender, not just the first", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "one.txt"));
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "two.txt"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/one.txt");
    expect(r.stderr).toContain("test/fixtures/two.txt");
    expect(r.stderr).toContain("2 entries");
    expectNoPhi(r.stderr);
  });

  it("an ignored link is out of scope, by the same rule that already excludes an ignored fixture", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "leak.txt"));
    writeFileSync(join(root, ".gitignore"), "test/fixtures/leak.txt\n");

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("but an entry already in the index cannot be excused that way", () => {
    // `git check-ignore` does not answer for a tracked path, so force-adding the
    // link puts it back in scope. The exemption tracks what git would actually
    // let you commit rather than what a `.gitignore` line claims.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "leak.txt"));
    writeFileSync(join(root, ".gitignore"), "test/fixtures/leak.txt\n");
    git(root, ["add", "-f", "test/fixtures/leak.txt"]);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.txt");
    expectNoPhi(r.stderr);
  });

  it("a link OUTSIDE the walk root is not reached (the walk root is unchanged)", () => {
    // All-mode has only ever walked `test/fixtures/`. Narrowing what that root
    // admits is not the same as widening the root, and saying otherwise would
    // overstate what this closes.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    mkdirSync(join(root, "src"));
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan: the --staged route refuses a staged non-regular entry", () => {
  it("git really does store the link as its target path, not the target's bytes", () => {
    // The measurement the refusal rests on. If git ever changed this, the
    // refusal below would be arguing from a premise that no longer holds.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "leak.txt"));
    git(root, ["add", "test/fixtures/leak.txt"]);

    expect(gitOut(root, ["ls-files", "--stage", "test/fixtures/leak.txt"])).toMatch(/^120000 /);
    const shown = gitOut(root, ["show", ":test/fixtures/leak.txt"]);
    expect(shown.trim()).toBe(`../../${TARGET_NAME}`);
    expect(shown).not.toContain("RIVERA^JUANITA");
  });

  it("refuses a staged symlink (exit 2), and reports no PHI", () => {
    const root = makeRepo();
    writeFileSync(join(root, "payload.txt"), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", "payload.txt"), join(root, "test", "fixtures", "leak.txt"));
    git(root, ["add", "test/fixtures/leak.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.txt");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("refuses without echoing a target path that itself carries PHI", () => {
    // Measured on the base scanner: with this target name the route exited 1 and
    // printed a hit whose value was the DATE OUT OF THE LINK TARGET'S FILENAME -
    // a report about the working tree's own text, never about the target's
    // contents. The refusal must not restore that channel.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "leak.txt"));
    git(root, ["add", "test/fixtures/leak.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.txt");
    expectNoPhi(r.stderr);
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("refuses a TYPECHANGE - a tracked regular fixture replaced by a link (exit 2)", () => {
    // The shape `--diff-filter=AM` used to delete before any mode could be read.
    // Replacing a TRACKED file with a link is neither an add nor a modify: git
    // raises `:100644 120000 <sha> <sha> T`, and without `T` in the filter the
    // record never existed, so the pre-commit hook passed the link green.
    const root = makeRepo();
    git(root, ["add", "test/fixtures/ordinary.txt"]);
    git(root, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "base"]);

    writeFileSync(join(root, "payload.txt"), SYNTHETIC_PHI);
    rmSync(join(root, "test", "fixtures", "ordinary.txt"));
    symlinkSync(join("..", "..", "payload.txt"), join(root, "test", "fixtures", "ordinary.txt"));
    git(root, ["add", "test/fixtures/ordinary.txt"]);

    // The premise: git really does raise this as a typechange, not A or M, and
    // the old `--name-only --diff-filter=AM` list was therefore EMPTY.
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AM"]).trim()).toBe("");
    expect(gitOut(root, ["diff", "--cached", "--name-only", "--diff-filter=AM"]).trim()).toBe("");
    expect(gitOut(root, ["diff", "--cached", "--raw"])).toContain(" 120000 ");

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/ordinary.txt");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("scans the other direction of a typechange - a link replaced by a real file (exit 1)", () => {
    const root = makeRepo();
    symlinkSync("ordinary.txt", join(root, "test", "fixtures", "link.txt"));
    git(root, ["add", "test/fixtures/link.txt"]);
    git(root, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "base"]);

    rmSync(join(root, "test", "fixtures", "link.txt"));
    writeFileSync(join(root, "test", "fixtures", "link.txt"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/link.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("RIVERA^JUANITA");
  });

  it("refuses a staged gitlink under the scanned prefix (exit 2)", () => {
    const root = makeRepo();
    const nested = join(root, "test", "fixtures", "nested");
    mkdirSync(nested);
    git(nested, ["init", "-q", "."]);
    writeFileSync(join(nested, "payload.txt"), SYNTHETIC_PHI);
    git(nested, ["add", "payload.txt"]);
    git(nested, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "n"]);
    git(root, ["add", "test/fixtures/nested"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/nested");
    expect(r.stderr).toContain("a gitlink");
    expectNoPhi(r.stderr);
  });

  it("still catches a staged ORDINARY file carrying the same payload (exit 1)", () => {
    // The regression control on the `--raw -z` reparse: reading the mode must not
    // cost the route the ordinary files it was already enumerating.
    const root = makeRepo();
    writeFileSync(join(root, "test", "fixtures", "violator.txt"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/violator.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/violator.txt");
    expect(r.stderr).toContain("RIVERA^JUANITA");
  });

  it("passes a staged ordinary clean fixture (exit 0)", () => {
    const root = makeRepo();
    git(root, ["add", "test/fixtures/ordinary.txt"]);
    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });

  it("a staged link OUTSIDE the route's scope is left alone (the scope is unchanged)", () => {
    // `--staged` has only ever covered `test/fixtures/**`. The mode check narrows
    // what that scope admits; it does not widen the scope.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(TARGET_NAME, join(root, "docs-link.txt"));
    git(root, ["add", "docs-link.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

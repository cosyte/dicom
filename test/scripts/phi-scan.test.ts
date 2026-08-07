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

import { runRepoScript } from "../helpers/run-script.js";

/**
 * This repository's root, from **this file's own location** rather than from
 * `process.cwd()`.
 *
 * It was `process.cwd()`, and that is a real defect rather than a style point:
 * the fixtures below are WRITTEN to `join(REPO_ROOT, "test/fixtures/phi-scan")`,
 * so a `vitest` invoked from anywhere other than the package root planted seven
 * synthetic `.dcm`/`.json`/`.txt` files in **that** directory instead - outside
 * the tree `.gitignore` exempts them in, where they are untracked and un-ignored
 * and the next `git add -A` sweeps them up. Measured: a run whose cwd was the
 * enclosing meta-repo left them at `<meta-repo>/test/fixtures/phi-scan/`.
 *
 * `test/helpers/run-script.ts` already derives its root this way and defaults the
 * child's `cwd` to it, so the scanner subprocess was always rooted correctly;
 * this line is what made the two disagree.
 */
const REPO_ROOT = join(import.meta.dirname, "..", "..");
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

/** Invoke the scanner in a subprocess. Runner choice and its cost: `run-script.ts`. */
function runScanner(args: string[]): RunResult {
  return runRepoScript("phi-scan.ts", args);
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

/**
 * THE DOC-FIXTURE ROUTE.
 *
 * The documentation ships DICOM objects the same way the test suite does, as base64-encoded Part 10
 * buffers pasted inline in markdown, and until this route existed the scanner never opened one: to
 * the text sweep a base64 run is one long alphanumeric token with no `FAMILY^GIVEN` and no
 * `YYYYMMDD` in it. That is the shape of a gate that reports clean over a corpus it never read.
 *
 * EVERY PAYLOAD HERE CARRIES A NAME. A PHI test whose fixture holds nothing identifying is vacuous
 * by construction, so the violators use `SMITH^JOHN`, which is not on the allow-list, and each is
 * paired with the control that turns the same run green.
 */
describe("phi-scan: doc fixtures (base64 DICOM inside markdown)", () => {
  let docDir: string;

  beforeAll(() => {
    docDir = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-docs-")));
  });

  afterAll(() => {
    rmSync(docDir, { recursive: true, force: true });
  });

  /** A markdown page shaped like this package's own docs: prose, then a runnable base64 fixture. */
  function writeDoc(name: string, object: Buffer): string {
    const path = join(docDir, name);
    writeFileSync(
      path,
      [
        "# Recipe",
        "",
        "```ts runnable",
        'import { parseDicom } from "@cosyte/dicom";',
        "",
        "const buf = Buffer.from(",
        `  "${object.toString("base64")}",`,
        '  "base64",',
        ");",
        "",
        "parseDicom(buf);",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    return path;
  }

  it("a non-allow-listed PN inside a base64 doc fixture is a hit (exit 1)", () => {
    const path = writeDoc("violator.md", buildDicomFixture("19000101", "SMITH^JOHN"));
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  it("a recent StudyDate inside a base64 doc fixture is a hit (exit 1)", () => {
    const path = writeDoc("recent.md", buildDicomFixture("20250612", "ANON^PATIENT"));
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0008,0020\)/);
  });

  it("a PREAMBLE-LESS object is scanned too, which is the shape the cookbook ships", () => {
    // `docs-content/cookbook.md` demonstrates DICOM_MISSING_PREAMBLE with an object whose File Meta
    // group starts at byte 0. Recognizing only the `DICM`-at-128 shape would leave that one
    // unscanned while the gate reported clean.
    const bare = buildDicomFixture("19000101", "SMITH^JOHN").subarray(132);
    expect(bare.toString("ascii", 0, 4)).not.toBe("DICM");
    const path = writeDoc("no-preamble.md", bare);
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  /**
   * 🛑 THE SHAPE THE COOKBOOK ACTUALLY SHIPS, TAKEN FROM THE COOKBOOK.
   *
   * The case above builds its preamble-less object with `buildDicomFixture`, whose File Meta group
   * is larger than the doc's. A first draft of this route floored a base64 run at 120 characters;
   * the cookbook's own preamble-less fixture encodes to 88, so the route skipped the exact file its
   * comments named as the reason it existed, and every test here still passed. A fixture built by
   * the test cannot catch that. This one reads the shipped doc, takes its shortest DICOM-shaped run,
   * appends a name-bearing element to it, and requires the scanner to find it.
   */
  it("reaches the SHORTEST real fixture in docs-content, not just a test-built one", () => {
    const cookbook = readFileSync(join(REPO_ROOT, "docs-content", "cookbook.md"), "utf8");
    const objects = [...cookbook.matchAll(/[A-Za-z0-9+/]{16,}={0,2}/g)]
      .map((m) => Buffer.from(m[0], "base64"))
      .filter((b) => b.length >= 8 && b.readUInt16LE(0) === 0x0002)
      .sort((a, b) => a.length - b.length);

    const shortest = objects[0];
    expect(shortest, "cookbook.md ships no preamble-less object any more").toBeDefined();
    if (shortest === undefined) return;

    // Explicit VR LE `(0010,0010) PN 10 "SMITH^JOHN"`, appended to the real object's dataset.
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x0010, 0);
    header.writeUInt16LE(0x0010, 2);
    header.write("PN", 4, "ascii");
    header.writeUInt16LE(10, 6);
    const seeded = Buffer.concat([shortest, header, Buffer.from("SMITH^JOHN", "latin1")]);

    const path = writeDoc("shortest-real.md", seeded);
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  it("the same doc with an allow-listed payload scans clean (exit 0)", () => {
    const path = writeDoc("clean.md", buildDicomFixture("19000101", "ANON^PATIENT"));
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("the TEXT sweep alone would not have caught it, so the decode is what does the work", () => {
    // The control that makes the three hits above mean something. The violating name is present in
    // the file only as base64, so a scanner without the decode route reads the page as clean.
    const object = buildDicomFixture("19000101", "SMITH^JOHN");
    const path = writeDoc("evidence.md", object);
    expect(readFileSync(path, "utf8")).not.toMatch(/SMITH\^JOHN/);
    expect(object.toString("latin1")).toMatch(/SMITH\^JOHN/);
  });

  it("a base64 run that is not a DICOM object is dropped in silence, not guessed at", () => {
    const path = join(docDir, "not-dicom.md");
    // A long base64 run of arbitrary bytes: an image, a checksum, a key. Nothing in it is evidence
    // about what it is, so a scanner that guessed would spend its credibility on false hits.
    writeFileSync(path, `\`\`\`\n${Buffer.alloc(400, 0x41).toString("base64")}\n\`\`\`\n`, "utf8");
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
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
  return runRepoScript("phi-scan.ts", args, { cwd });
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

  it("refuses a link RENAMED into the scan root, which rename detection hid entirely", () => {
    // `git mv <link> test/fixtures/<name>` is an ordinary developer action, and
    // with rename detection on git stages it as a TWO-PATH `R100` record that
    // `--diff-filter=AMT` then deletes outright. `--no-renames` makes the
    // destination arrive as a single-path `A` instead.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(TARGET_NAME, join(root, "toplink.txt"));
    git(root, ["add", "toplink.txt", "test/fixtures/ordinary.txt"]);
    git(root, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "base"]);
    git(root, ["mv", "toplink.txt", "test/fixtures/toplink.txt"]);

    // The premise, in both directions: with detection on the record is a
    // two-path rename the status filter drops; with it off it is a plain add.
    expect(gitOut(root, ["diff", "--cached", "--raw"])).toContain("R100");
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");
    expect(
      gitOut(root, ["diff", "--cached", "--raw", "--no-renames", "--diff-filter=AMT"]),
    ).toMatch(/^:000000 120000 /);
    expect(gitOut(root, ["ls-files", "--stage", "test/fixtures/toplink.txt"])).toMatch(/^120000 /);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/toplink.txt");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("still scans a CLEAN file renamed into the scan root, rather than dropping it", () => {
    // The other half of turning rename detection off: the destination of an
    // ordinary rename is now enumerated where it used to be skipped entirely.
    const root = makeRepo();
    writeFileSync(join(root, "loose.txt"), SYNTHETIC_PHI);
    git(root, ["add", "loose.txt", "test/fixtures/ordinary.txt"]);
    git(root, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "base"]);
    git(root, ["mv", "loose.txt", "test/fixtures/loose.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/loose.txt");
    expect(r.stderr).toContain("RIVERA^JUANITA");
  });

  it("refuses the fixture ROOT itself staged as a link, not just entries under it", () => {
    // An index entry at exactly `test/fixtures` is the corpus root replaced by a
    // blob or a link; git records no index entry for a directory, so this path
    // can only mean that. A prefix test that requires the trailing slash lets it
    // through, and the whole corpus then goes unscanned.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    rmSync(join(root, "test", "fixtures"), { recursive: true });
    symlinkSync(join("..", TARGET_NAME), join(root, "test", "fixtures"));
    git(root, ["add", "test/fixtures"]);

    expect(gitOut(root, ["ls-files", "--stage", "test/fixtures"])).toMatch(/^120000 /);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
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

    // The premise the refusal's WORDING rests on, and it is not the symlink one:
    // `git show` does not hand back a target path for a gitlink, it fails
    // outright. A `why` clause asserting otherwise would be false for every mode
    // this refusal covers except 120000.
    const shown = spawnSync("git", ["show", ":test/fixtures/nested"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    expect(shown.status).not.toBe(0);
    expect(shown.stderr).toContain("bad object");

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/nested");
    expect(r.stderr).toContain("a gitlink");
    expect(r.stderr).not.toContain("hands back its target path");
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

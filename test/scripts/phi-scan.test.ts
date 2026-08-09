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
import { spawn, spawnSync } from "node:child_process";
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
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runRepoScript } from "../helpers/run-script.js";
import {
  VIOLATOR_PN,
  CARET_PN,
  PN_SHAPE,
  RECENT_DA,
  VIOLATOR_DOB,
  TEXT_VIOLATOR_DATE,
  OVERRIDE_LOG_DATE,
  ALLOWED_DA,
  TARGET_NAME,
} from "../helpers/phi-scan-violators.js";

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
  writeDicomFixture(join(FIX_DIR, "recent-date-violator.dcm"), RECENT_DA, "ANON^PATIENT");
  writeDicomFixture(join(FIX_DIR, "recent-pn-violator.dcm"), "19000101", VIOLATOR_PN);
  writeFileSync(
    join(FIX_DIR, "non-dicom-clean.json"),
    JSON.stringify({ date: "1850-01-01", patient: "ANON^PATIENT" }),
  );
  writeFileSync(
    join(FIX_DIR, "non-dicom-violator.txt"),
    `Sample DOB record: ${TEXT_VIOLATOR_DATE} (recent - should fail)`,
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
    expect(r.stderr).toContain(RECENT_DA);
  });

  it("recent-pn-violator.dcm exits 1 with structured stderr", () => {
    const r = runScanner([join(FIX_DIR, "recent-pn-violator.dcm")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/0010,0010/);
    expect(r.stderr).toContain(VIOLATOR_PN);
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
 * the text sweep a base64 run is one long alphanumeric token with no `PN_SHAPE` token and no
 * `YYYYMMDD` in it. That is the shape of a gate that reports clean over a corpus it never read.
 *
 * EVERY PAYLOAD HERE CARRIES A NAME. A PHI test whose fixture holds nothing identifying is vacuous
 * by construction, so the violators use `VIOLATOR_PN`, which is not on the allow-list, and each is
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
    const path = writeDoc("violator.md", buildDicomFixture("19000101", VIOLATOR_PN));
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  it("a recent StudyDate inside a base64 doc fixture is a hit (exit 1)", () => {
    const path = writeDoc("recent.md", buildDicomFixture(RECENT_DA, "ANON^PATIENT"));
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0008,0020\)/);
  });

  it("a PREAMBLE-LESS object is scanned too, which is the shape the cookbook ships", () => {
    // `docs-content/cookbook.md` demonstrates DICOM_MISSING_PREAMBLE with an object whose File Meta
    // group starts at byte 0. Recognizing only the `DICM`-at-128 shape would leave that one
    // unscanned while the gate reported clean.
    const bare = buildDicomFixture("19000101", VIOLATOR_PN).subarray(132);
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

    // Explicit VR LE `(0010,0010) PN`, carrying `VIOLATOR_PN`, appended to the real object's dataset.
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x0010, 0);
    header.writeUInt16LE(0x0010, 2);
    header.write("PN", 4, "ascii");
    header.writeUInt16LE(VIOLATOR_PN.length, 6);
    const seeded = Buffer.concat([shortest, header, Buffer.from(VIOLATOR_PN, "latin1")]);

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
    const object = buildDicomFixture("19000101", VIOLATOR_PN);
    const path = writeDoc("evidence.md", object);
    expect(readFileSync(path, "utf8")).not.toContain(VIOLATOR_PN);
    expect(object.toString("latin1")).toContain(VIOLATOR_PN);
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
        `- **Date:** ${OVERRIDE_LOG_DATE}\n` +
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
  [`Patient: ${CARET_PN}`, `DOB: ${VIOLATOR_DOB}`, `StudyDate: ${ALLOWED_DA}`].join("\n") + "\n";

/** Tokens that must never appear in a refusal message. */
const PHI_TOKENS = [...CARET_PN.split("^"), VIOLATOR_DOB, ALLOWED_DA, TARGET_NAME];

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
 * `scripts/`, EVERY declared root, and one ordinary fixture so the walk has
 * something legitimate to find.
 *
 * All three roots are created, not just the one a given case exercises. The
 * scanner refuses a declared root that is not there, which is the point of
 * `a declared root that does not exist is refused` below, so a helper that left
 * `README.md` or `docs-content/` out would make every case here refuse for a
 * reason none of them is about.
 */
function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-repo-")));
  repos.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "test", "fixtures"), { recursive: true });
  mkdirSync(join(root, "docs-content"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "test", "fixtures", "ordinary.txt"), "synthetic corpus placeholder\n");
  writeFileSync(join(root, "README.md"), "# throwaway\n");
  writeFileSync(join(root, "docs-content", "intro.md"), "# throwaway doc\n");
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
    expect(r.stderr).toContain(CARET_PN);
    expect(r.stderr).toContain(VIOLATOR_DOB);
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

  it("a link OUTSIDE every declared root is not reached", () => {
    // The declared roots are `test`, `README.md` and `docs-content`. `src/` is
    // not one of them, and `PHI-SCAN-WALK-ROOT-SCOPE` widened the corpus root to
    // `test/` rather than to the whole repository. Saying otherwise would
    // overstate what that closes.
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
    expect(shown).not.toContain(CARET_PN);
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
    expect(r.stderr).toContain(CARET_PN);
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
    expect(r.stderr).toContain(CARET_PN);
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
    expect(r.stderr).toContain(CARET_PN);
  });

  it("passes a staged ordinary clean fixture (exit 0)", () => {
    const root = makeRepo();
    git(root, ["add", "test/fixtures/ordinary.txt"]);
    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });

  it("a staged link OUTSIDE the route's scope is left alone", () => {
    // `--staged` covers the same three roots the walk does, and a loose file at
    // the repository root is under none of them.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(TARGET_NAME, join(root, "docs-link.txt"));
    git(root, ["add", "docs-link.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A PREAMBLE-LESS OBJECT ON DISK (DICOM-SCANTARGET-PREAMBLELESS)
// ---------------------------------------------------------------------------
//
// `scanTarget` gated a `.dcm`/`.bin`/unknown-extension file on `isDicom` before
// handing it to `scanDicom`. `isDicom` is the 128-byte-preamble + `DICM` test, one
// of the TWO shapes this package reads, so a preamble-less object on disk went to
// `scanText` instead and the DICOM-aware sweep never ran on it. `scanDicom` itself
// had asked `fileMetaStart` (which knows both shapes) since the doc route was
// written, so the two disagreed only at this one gate.
//
// EVERY PAYLOAD BELOW CARRIES A NAME, AND IT IS ONE THE TEXT SWEEP CANNOT SEE.
// The text pass matches PN only in `PN_SHAPE` form; a single-component
// `(0010,0010)` has no caret, so the fallback route has nothing to match, and a
// hit therefore proves the DICOM route ran rather than proving the bytes were
// merely present. `fallback-visible.txt` below is that control - the same bytes
// with one byte in front, so `fileMetaStart` does not recognize them - and each
// clean result is pinned beside a positive on the same route.

/** Synthetic. Single-component, so the text sweep's `PN_SHAPE` regex cannot match it. */
const BARE_PN = "WESTERGAARD";

/** The same fixture assembler as everywhere else in this file, minus preamble and `DICM`. */
function buildPreamblelessFixture(studyDate: string, patientName: string): Buffer {
  return buildDicomFixture(studyDate, patientName).subarray(132);
}

/** One short-form Explicit VR LE element. */
function shortElement(group: number, element: number, vr: string, value: string): Buffer {
  const padded = value.length % 2 === 0 ? value : value + " ";
  const out = Buffer.alloc(8 + padded.length);
  out.writeUInt16LE(group, 0);
  out.writeUInt16LE(element, 2);
  out.write(vr, 4, "ascii");
  out.writeUInt16LE(padded.length, 6);
  out.write(padded, 8, "latin1");
  return out;
}

/**
 * One short-form Explicit VR **Big Endian** element. Written out rather than reusing the LE writer
 * with a different `(0002,0010)`, because a fixture LABELLED big-endian while carrying little-endian
 * bytes proves nothing: the tag walk reads it happily and the case passes for the wrong reason. It
 * did, on the first draft of this block.
 */
function shortElementBE(group: number, element: number, vr: string, value: string): Buffer {
  const padded = value.length % 2 === 0 ? value : value + " ";
  const out = Buffer.alloc(8 + padded.length);
  out.writeUInt16BE(group, 0);
  out.writeUInt16BE(element, 2);
  out.write(vr, 4, "ascii");
  out.writeUInt16BE(padded.length, 6);
  out.write(padded, 8, "latin1");
  return out;
}

/**
 * An UNDEFINED-LENGTH Sequence, immediately delimited. PS3.5 2026c §7.5.2 defines `0xFFFFFFFF` as one
 * of TWO Sequence delimitations, the encoder's choice, and says both "shall be supported by
 * decoders" - so this is a conformant file, not a malformed one. `readElementExplicit` answers `null`
 * for it, so the tag walk stops dead here. This is the shape that turns an exclusive dispatch into a
 * silent regression.
 */
function undefinedLengthSq(group: number, element: number): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16LE(group, 0);
  header.writeUInt16LE(element, 2);
  header.write("SQ", 4, "ascii");
  header.writeUInt32LE(0xffffffff, 8);
  const delimiter = Buffer.alloc(8);
  delimiter.writeUInt16LE(0xfffe, 0);
  delimiter.writeUInt16LE(0xe0dd, 2);
  return Buffer.concat([header, delimiter]);
}

/** The preamble-less File Meta group of `buildDicomFixture`, with a caller-chosen transfer syntax. */
function preamblelessFileMeta(transferSyntaxUid: string): Buffer {
  const whole = buildDicomFixture("19000101", "ANON^PATIENT").subarray(132);
  // Everything up to the first dataset element, with (0002,0010)'s value replaced in place. The two
  // UIDs are the same length, so no group-length recomputation is needed.
  const shipped = "1.2.840.10008.1.2.1";
  if (transferSyntaxUid.length !== shipped.length) {
    throw new Error(`preamblelessFileMeta: expected a ${String(shipped.length)}-char UID`);
  }
  const at = whole.indexOf(shipped, 0, "latin1");
  if (at < 0) throw new Error("preamblelessFileMeta: transfer syntax UID not found");
  const copy = Buffer.from(whole);
  copy.write(transferSyntaxUid, at, "latin1");
  // Drop the two dataset elements the assembler appends; callers supply their own.
  return copy.subarray(0, copy.length - (8 + 8) - (8 + 12));
}

describe("phi-scan: a preamble-less object ON DISK reaches the DICOM route", () => {
  let diskDir: string;

  beforeAll(() => {
    diskDir = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-disk-")));
  });

  afterAll(() => {
    rmSync(diskDir, { recursive: true, force: true });
  });

  function writeObject(name: string, buf: Buffer): string {
    const path = join(diskDir, name);
    writeFileSync(path, buf);
    return path;
  }

  it("the payload is invisible to the text sweep, so a hit can only come from the DICOM route", () => {
    // The non-vacuity control for every case below.
    //
    // 🛑 THE MECHANISM CHANGED AND THE PROPERTY DID NOT. This wrote the same bytes
    // as `.txt` and expected exit 0, on the reasoning that a text EXTENSION sent a
    // file to the text route. That was true, and it was the defect
    // `DICOM-PHI-SCAN-RESIDUALS` closed: nothing is dispatched by name any more,
    // so a `.txt` whose bytes are a Part 10 object now reaches `scanDicom` like
    // any other. Using the extension to disable the DICOM route would be asserting
    // the leak, so the route is disabled by CONTENT instead - one byte in front of
    // the stream, which makes `fileMetaStart` answer `null` and leaves every other
    // byte, including the name, exactly where it was.
    const pnShapeRe = /\b[A-Z][A-Za-z\-']+\^[A-Z][A-Za-z\-']+\b/;
    // The regex is the scanner's own text-sweep pattern, so pin that it is live
    // before asserting a payload does not match it: a pattern that matched
    // nothing would make the line below true for the wrong reason.
    expect(PN_SHAPE).toMatch(pnShapeRe);

    const bare = buildPreamblelessFixture("19000101", BARE_PN);
    expect(bare.toString("ascii", 0, 4)).not.toBe("DICM");
    expect(bare.toString("latin1")).toContain(BARE_PN);
    expect(bare.toString("utf8")).not.toMatch(pnShapeRe);

    // One byte in front: not a preamble, not group `0002`, so neither shape of
    // `fileMetaStart` recognizes it and only the text sweep runs.
    const disguised = Buffer.concat([Buffer.from("x", "ascii"), bare]);
    expect(disguised.toString("latin1")).toContain(BARE_PN);

    const r = runScanner([writeObject("fallback-visible.txt", disguised)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);

    // And the pin that stops the line above being a claim about the extension:
    // the UNSHIFTED bytes under the SAME name are a hit, under their tag.
    const recognized = runScanner([writeObject("fallback-recognized.txt", bare)]);
    expect(recognized.code, `stderr: ${recognized.stderr}`).toBe(1);
    expect(recognized.stderr).toMatch(/\(0010,0010\)/);
  });

  it("a preamble-less .dcm is a hit (exit 1)", () => {
    const r = runScanner([writeObject("bare.dcm", buildPreamblelessFixture("19000101", BARE_PN))]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
    expect(r.stderr).toContain(BARE_PN);
  });

  it("a preamble-less .bin is a hit (exit 1)", () => {
    const r = runScanner([writeObject("bare.bin", buildPreamblelessFixture("19000101", BARE_PN))]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  it("a preamble-less object under an UNKNOWN extension is a hit too (exit 1)", () => {
    // The unknown-extension branch carried the identical `isDicom` gate, so it
    // had the identical blind spot. A fixture is not obliged to be named `.dcm`.
    const r = runScanner([writeObject("bare.dat", buildPreamblelessFixture("19000101", BARE_PN))]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  it("a preamble-less recent StudyDate is a hit on the DA route as well (exit 1)", () => {
    const r = runScanner([
      writeObject("bare-date.dcm", buildPreamblelessFixture(RECENT_DA, "ANON^PATIENT")),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0008,0020\)/);
    expect(r.stderr).toContain(RECENT_DA);
  });

  it("a preamble-less object with an ALLOW-LISTED payload scans clean (exit 0)", () => {
    // The clean result that means something only because it sits beside the
    // positives above: the route runs, and it still says nothing about a name the
    // allow-list carries.
    const r = runScanner([
      writeObject("bare-clean.dcm", buildPreamblelessFixture("19000101", "ANON^PATIENT")),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("a .dcm that is NOT a DICOM stream still gets the text sweep (exit 1)", () => {
    // The regression control on the else branch. Neither shape recognizes these
    // bytes, and the fallback that used to catch a preamble-less object by
    // accident is the route that must still catch a genuinely non-DICOM one.
    const r = runScanner([writeObject("not-dicom.dcm", Buffer.from(SYNTHETIC_PHI, "utf8"))]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("a preamble-FUL object is still scanned as DICOM (exit 1)", () => {
    const r = runScanner([
      writeObject("with-preamble.dcm", buildDicomFixture("19000101", BARE_PN)),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  it("the ALL-MODE walk catches one under test/fixtures, which is the shape CI runs", () => {
    // The cases above go through the paths route. This is the route the gate
    // itself uses, over a corpus root, in a throwaway repo.
    const root = makeRepo();
    writeFileSync(
      join(root, "test", "fixtures", "bare.dcm"),
      buildPreamblelessFixture("19000101", BARE_PN),
    );

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/bare.dcm");
    expect(r.stderr).toContain(BARE_PN);
  });

  it("and the same corpus with an allow-listed payload is still clean (exit 0)", () => {
    const root = makeRepo();
    writeFileSync(
      join(root, "test", "fixtures", "bare.dcm"),
      buildPreamblelessFixture("19000101", "ANON^PATIENT"),
    );

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });

  // -------------------------------------------------------------------------
  // ADDING THE DICOM ROUTE MUST NOT SUBTRACT THE TEXT ONE
  // -------------------------------------------------------------------------
  //
  // The first draft of this fix made the binary branch an if/else: recognized ->
  // `scanDicom`, otherwise -> `scanText`. A `conformance-refuter` pass refused it,
  // and the finding reproduced: `scanDicom` gives up quietly at the first header it
  // cannot read, and an undefined-length `SQ` (PS3.5 2026c §7.5.2 - one of two
  // delimitations, both of which decoders shall support) is one of those. A file
  // carrying one is conformant, not malformed. §7.1 orders tags ascending, so a
  // conformant file puts `(0008,1110) SQ` BEFORE `(0010,0010)`. Measured on the
  // refused draft: exit 1 on base `5ae8fe4`, exit 0 and `OK - no hits` on the
  // draft, over a name-bearing PatientName. The branch runs BOTH routes now, and
  // these cases are why.

  it("runs BOTH routes: the tag walk stops at an undefined-length SQ and the text sweep continues", () => {
    // One file, two names, one reachable by each route and NEITHER by the other.
    //   (0008,0090) PN WESTERGAARD  - before the SQ, single-component: tag walk only.
    //   (0008,1110) SQ undefined    - the tag walk stops dead here.
    //   (0010,0010) PN CARET_PN     - past the stop, caret-bearing: text sweep only.
    // Both must be reported, and each one alone would leave the other route unproven.
    const object = Buffer.concat([
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      shortElement(0x0008, 0x0090, "PN", BARE_PN),
      undefinedLengthSq(0x0008, 0x1110),
      shortElement(0x0010, 0x0010, "PN", CARET_PN),
    ]);

    const r = runScanner([writeObject("sq-undefined.dcm", object)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr, "the tag walk did not run, or did not reach (0008,0090)").toContain(BARE_PN);
    expect(r.stderr, "the text sweep was subtracted: this is the refuted regression").toContain(
      CARET_PN,
    );
  });

  it("the same object as .bin is a hit too, so the regression is not extension-specific", () => {
    const object = Buffer.concat([
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      undefinedLengthSq(0x0008, 0x1110),
      shortElement(0x0010, 0x0010, "PN", CARET_PN),
    ]);

    const r = runScanner([writeObject("sq-undefined.bin", object)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("a non-LE transfer syntax stops the tag walk the same way, and is caught the same way", () => {
    // `scanDicom` walks the dataset as Explicit VR LE unless (0002,0010) is Implicit
    // VR LE, so an Explicit VR BE dataset is read as noise: the length field reads
    // 0x0E00 instead of 0x000E, overruns the buffer, and `readElementExplicit`
    // answers `null`. The text sweep is what covers it, exactly as it did on base.
    // The File Meta group stays LE whatever the dataset's transfer syntax says. That
    // rule is **PS3.10 §7.1, not PS3.5** - an earlier draft of this comment cited
    // PS3.5 and PS3.5 does not state it. PS3.10 is NOT vendored under `vendor/nema/`,
    // so this citation is named rather than re-verified against a pin, and it is the
    // fixture's shape that the assertion below actually rests on.
    const object = Buffer.concat([
      preamblelessFileMeta("1.2.840.10008.1.2.2"), // Explicit VR Big Endian
      shortElementBE(0x0010, 0x0010, "PN", CARET_PN),
    ]);

    const r = runScanner([writeObject("explicit-be.dcm", object)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("a PREAMBLE-FUL object gets BOTH routes now, and the DICOM one is unchanged", () => {
    // 🛑 THIS TEST PINNED THE OPPOSITE UNTIL `DICOM-SCANDICOM-SILENT-HALT`. It read
    // "scanned by the DICOM route ALONE, byte-for-byte as before" and asserted exit
    // 0 over the first fixture below, on the reasoning that sweeping every Part 10
    // object as text was a separate product call. It was, it has been taken, and
    // this is the boundary MOVED deliberately rather than a regression: the halt
    // that made the old green a FALSE green is a property of the DATASET, so the
    // preamble must not decide who is owed a text sweep. See the block below.
    //
    // What has NOT moved is the DICOM route: `isDicom` true still reaches
    // `scanDicom`, and the second half asserts the tag-borne hit that proves it.
    const description = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "ascii"),
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      shortElement(0x0008, 0x1030, "LO", CARET_PN), // StudyDescription: not a PN tag
    ]);
    const swept = runScanner([writeObject("preambleful-lo.dcm", description)]);
    expect(swept.code, `stderr: ${swept.stderr}`).toBe(1);
    // Only the text route can report this one: `(0008,1030)` is in no tag table here.
    expect(swept.stderr).toMatch(/tag=\(text\)/);
    expect(swept.stderr).toContain(CARET_PN);

    // The DICOM route, unchanged: the SAME value at a PN tag is still reported
    // UNDER ITS TAG, which the text sweep cannot do.
    const named = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "ascii"),
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      shortElement(0x0010, 0x0010, "PN", CARET_PN),
    ]);
    const hit = runScanner([writeObject("preambleful-pn.dcm", named)]);
    expect(hit.code, `stderr: ${hit.stderr}`).toBe(1);
    expect(hit.stderr).toMatch(/\(0010,0010\)/);
    expect(hit.stderr).toContain(CARET_PN);
  });
});

// ---------------------------------------------------------------------------
// A PREAMBLE-FUL OBJECT'S SILENT HALT (DICOM-SCANDICOM-SILENT-HALT)
// ---------------------------------------------------------------------------
//
// `scanDicom` gives up quietly - its walk `break`s at the first header it cannot
// read - and while the text sweep was an `isDicom`-false `else`, a preamble-FUL
// Part 10 object had nothing behind it. So the identical dataset was caught
// WITHOUT a preamble and missed WITH one, and the gate printed `OK - no hits`
// over a name-bearing `(0010,0010)`.
//
// Measured on `21e25a0`, one object per row, `(0008,1110)` undefined-length `SQ`
// (PS3.5 2026c §7.5.2: one of two delimitations, both of which decoders shall
// support) before a name-bearing `(0010,0010)` (§7.1 orders tags ascending, so
// that is the conformant order):
//
//   | target                                     | base | here |
//   |--------------------------------------------|------|------|
//   | preamble-FUL, SQ then PN                   |  0   |  1   |
//   | preamble-FUL, caret name at (0008,1030) LO |  0   |  1   |
//   | the same object base64'd into a `.md`      |  0   |  1   |
//   | preamble-LESS, SQ then PN  (control)       |  1   |  1   |
//   | preamble-FUL, PN, no SQ    (control)       |  1   |  1   |
//   | preamble-FUL, allow-listed PN (control)    |  0   |  0   |
//
// The last three rows are what make the first three evidence. Two are positives
// the detector already caught on base, so a green here would be a GAP rather than
// a clearance; the third is a clean result pinned BESIDE them.
//
// THE ACCEPTED COST, STATED SO IT IS NOT DISCOVERED: the text sweep now runs over
// binary values, so its recognizers fire on image noise. WHICH recognizer, and how
// often, is a property of the payload's byte histogram and NOT of the scanner, so
// no sentence here names one. Two drafts of this comment did - one naming the
// compact-date pass, one naming the PN-shape pass - and a refuter refuted both;
// a claim reworded twice is deleted rather than written a third time. The measured
// table, which spans 0 to five figures over the same 8 MiB, is in
// `documentation/agent-notes/dicom-scandicom-silent-halt.md`. NO RATE IS QUOTED
// HERE - it is a property of a corpus, not of this suite.
//
// 🛑 AND THE SHAPE IS NAMED, NEVER SPELLED. A draft of this paragraph wrote the
// two-component token out and `pnpm phi-scan` reported it against this very file,
// which is the gate working: `test/` is its walk root. `test/helpers/
// phi-scan-violators.ts` exists so this suite carries no literal THE SCANNER MUST
// REJECT - allow-listed ones like `ANON^PATIENT` are here in plain sight, and the
// distinction is the whole point of that helper's header.

describe("phi-scan: a preamble-FUL object's silent halt", () => {
  let dir: string;

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-halt-")));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeObject(name: string, buf: Buffer): string {
    const path = join(dir, name);
    writeFileSync(path, buf);
    return path;
  }

  /** The same assembler the block above uses, with the 132 bytes back on the front. */
  function withPreamble(...parts: Buffer[]): Buffer {
    return Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "ascii"),
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      ...parts,
    ]);
  }

  /** One Part 10 object, base64-encoded into a markdown page, as `docs-content/` ships them. */
  function asDocPage(buf: Buffer): Buffer {
    return Buffer.from(`# fixture\n\n\`\`\`\n${buf.toString("base64")}\n\`\`\`\n`, "utf8");
  }

  const HALTED_NAME = Buffer.concat([
    undefinedLengthSq(0x0008, 0x1110),
    shortElement(0x0010, 0x0010, "PN", CARET_PN),
  ]);

  it("THE DEFECT: a name behind an undefined-length SQ is reported (exit 1)", () => {
    const r = runScanner([writeObject("halt-sq.dcm", withPreamble(HALTED_NAME))]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("CONTROL: the identical dataset WITHOUT the preamble was caught on base too", () => {
    // The row that makes the row above a routing defect rather than an undetectable
    // payload: the same bytes, minus 132, exit 1 on base and here alike.
    const bare = Buffer.concat([preamblelessFileMeta("1.2.840.10008.1.2.1"), HALTED_NAME]);
    const r = runScanner([writeObject("halt-sq-bare.dcm", bare)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("CONTROL: a preamble-FUL PN with NO halt in front of it is caught under its TAG", () => {
    // The detector-is-live control. `scanDicom` reaches this one, so the hit names
    // `(0010,0010)`; a green anywhere in this block therefore cannot be an absent
    // detector.
    const r = runScanner([
      writeObject("no-halt.dcm", withPreamble(shortElement(0x0010, 0x0010, "PN", CARET_PN))),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  it("CLEAN: a preamble-FUL object whose payload is allow-listed is still clean (exit 0)", () => {
    // Pinned beside the positives above, and it carries a DA the allow-list holds as
    // well as an allow-listed PN, because the text sweep now reads both.
    const r = runScanner([
      writeObject(
        "halt-clean.dcm",
        withPreamble(
          undefinedLengthSq(0x0008, 0x1110),
          shortElement(0x0010, 0x0010, "PN", "ANON^PATIENT"),
          shortElement(0x0008, 0x0020, "DA", ALLOWED_DA),
        ),
      ),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });

  it("a non-LE transfer syntax halts the same way and is caught the same way", () => {
    // The halt does not need a Sequence. `scanDicom` reads the dataset as Explicit
    // VR LE unless (0002,0010) says Implicit VR LE, so a Big Endian dataset stops it
    // at the first element - and with a preamble in front, nothing used to follow.
    const object = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "ascii"),
      preamblelessFileMeta("1.2.840.10008.1.2.2"), // Explicit VR Big Endian
      shortElementBE(0x0010, 0x0010, "PN", CARET_PN),
    ]);
    const r = runScanner([writeObject("halt-be.dcm", object)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  // -------------------------------------------------------------------------
  // THE SAME HALT, ONE LEVEL DOWN: A BASE64 OBJECT INSIDE A DOC PAGE
  // -------------------------------------------------------------------------
  //
  // `scanEmbeddedObjects` decodes a run and hands it to `scanDicom` ALONE, so the
  // halt is silent there too - and the enclosing page's own text sweep cannot
  // stand in for it, because the name is inside the BASE64 and matches nothing in
  // the page's bytes. Measured on `21e25a0`: exit 0, `OK - no hits`.

  it("THE DEFECT, EMBEDDED: the same object base64'd into a .md is reported (exit 1)", () => {
    const r = runScanner([writeObject("halt-sq.md", asDocPage(withPreamble(HALTED_NAME)))]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("CONTROL: the page's OWN text sweep cannot see the name, so the hit came from the decode", () => {
    // Non-vacuity for the case above. The identical page with the base64 run
    // REMOVED carries nothing to match, so a hit there would have meant the name
    // was legible in the page's own bytes and the embedded route proved nothing.
    const page = asDocPage(withPreamble(HALTED_NAME));
    expect(page.toString("utf8")).not.toContain(CARET_PN);
    const stripped = Buffer.from(page.toString("utf8").replace(/[A-Za-z0-9+/]{16,}={0,2}/g, ""));
    const r = runScanner([writeObject("halt-sq-stripped.md", stripped)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("CONTROL EMBEDDED: an unhalted object in a .md is still reported under its TAG", () => {
    const r = runScanner([
      writeObject(
        "no-halt.md",
        asDocPage(withPreamble(shortElement(0x0010, 0x0010, "PN", CARET_PN))),
      ),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
  });

  // -------------------------------------------------------------------------
  // A MULTI-MEGABYTE BASE64 RUN MUST NOT REFUSE THE SCAN
  // -------------------------------------------------------------------------
  //
  // The run matcher was `new RegExp("[A-Za-z0-9+/]{16,}={0,2}", "g")`, and V8 keeps
  // per-character backtrack state for a greedy quantifier: ONE long run threw
  // `RangeError: Maximum call stack size exceeded`, which `run()` turns into exit 2
  // - the scan refusing outright rather than reporting anything. `PRE-EXISTING` and
  // measured on `21e25a0` over a plain `.md` carrying one run: 0.5/1/2/4 MiB exit 0,
  // 8 MiB exits 2. It is closed here because this item sends whole Part 10 objects
  // down that route and a Part 10 object is routinely megabytes of pixel data.
  //
  // 🛑 THE EXACT THRESHOLD IS A PROPERTY OF V8'S STACK, NOT OF THIS SCRIPT, so this
  // asserts the PROPERTY (a multi-megabyte run is scanned, and the object after it
  // is still found) and not the threshold. On a build with a larger stack the old
  // matcher would have passed it too; that is fine, because the assertion that
  // carries the weight is the HIT, which is what a refusal would have lost.

  it("a 6 MiB base64 run is swept without refusing, and the object after it is found", () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    // Deterministic, and NOT a `Math.random()` fixture: a run that differs per run
    // makes a failure unreproducible. xorshift32 via `Math.imul` stays inside 32
    // bits - a plain `x * 1103515245` LCG silently loses precision past 2^53 and
    // produces structured bytes that a measurement then reports as a finding.
    let x = 0x9e3779b9;
    const run = Buffer.alloc(6 * 1024 * 1024);
    for (let i = 0; i < run.length; i += 1) {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      run[i] = alphabet.charCodeAt(x % 64);
    }
    const page = Buffer.concat([
      Buffer.from("# big\n\n", "utf8"),
      run,
      Buffer.from("\n\n", "utf8"),
      Buffer.from(withPreamble(shortElement(0x0010, 0x0010, "PN", CARET_PN)).toString("base64")),
      Buffer.from("\n", "utf8"),
    ]);

    const r = runScanner([writeObject("big-run.md", page)]);
    expect(r.code, `the scan refused instead of scanning; stderr: ${r.stderr}`).not.toBe(2);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });
});

// ---------------------------------------------------------------------------
// A TEXT EXTENSION WAS DISPATCHED BY NAME (DICOM-PHI-SCAN-RESIDUALS)
// ---------------------------------------------------------------------------
//
// `scanTarget` branched on the file's EXTENSION before it read a byte: `.json`,
// `.txt`, `.md` and `.csv` ran `scanText` and `scanEmbeddedObjects` and RETURNED,
// so `scanDicom` never ran on one whatever its bytes were. That is the same
// defect as the two above wearing a NAME instead of a preamble - the halt, the
// preamble and the filename are all things that do not decide what the bytes
// are - and it has a plausible real path: a de-identification report, a bug
// repro, or a fixture saved under the wrong extension carries a patient
// identifier past the gate entirely.
//
// Measured on `08ed3ee`, one Part 10 object per row carrying a SINGLE-COMPONENT
// `(0010,0010)`. That shape has no caret, so the text sweep's PN pass cannot
// match it and the tag table is the only route that can see it:
//
//   | target                                       | base | here |
//   |----------------------------------------------|------|------|
//   | preamble-FUL object named `.md`              |  0   |  1   |
//   | the same, `.txt` / `.json` / `.csv`          |  0   |  1   |
//   | preamble-LESS object named `.md`             |  0   |  1   |
//   | the same object named `.dcm`      (control)  |  1   |  1   |
//   | allow-listed payload, `.md`       (control)  |  0   |  0   |
//
// The last two rows are what make the first three evidence: one is a positive
// the detector already caught on base, so a green here would be a GAP rather
// than a clearance, and the other is a clean result pinned beside it.
//
// 🛑 THE REMEDY IS A DELETION, WHICH IS WHY IT IS NOT THE NET LEAK `#97` PAID
// FOR. The removed branch's two calls were `scanText` and `scanEmbeddedObjects`;
// the branch that replaces it makes the SAME two unconditionally and adds
// `scanDicom`, and `hits` is only ever appended to. The three NOT-SUBTRACTED
// cases below put that under test instead of asserting it: the base64 decode,
// the plain text sweep, and the halted object an exclusive swap would have taken
// from exit 1 to exit 0.
//
// The full before/after matrix is 11 objects x 7 extensions; it is in
// `documentation/agent-notes/dicom-phi-scan-name-dispatch.md`. NO SUMMARY OF IT
// IS RESTATED HERE, because the rows this suite pins are the rows it asserts.

describe("phi-scan: a target is dispatched by CONTENT, never by its extension", () => {
  let dir: string;

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-name-")));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeObject(name: string, buf: Buffer): string {
    const path = join(dir, name);
    writeFileSync(path, buf);
    return path;
  }

  /** The four extensions the deleted branch claimed. */
  const TEXT_EXTS = [".md", ".txt", ".json", ".csv"];

  /** A preamble-FUL Part 10 object whose only payload the tag table alone can see. */
  const FUL = buildDicomFixture("19000101", BARE_PN);
  /** The identical dataset with the 132 bytes off the front. */
  const LESS = buildPreamblelessFixture("19000101", BARE_PN);

  it("the payload is invisible to the text sweep, so a hit can only come from the DICOM route", () => {
    // Non-vacuity for every case below, and it is the whole reason `BARE_PN` is
    // single-component: if the text sweep could see this name, a green under a
    // text extension would prove nothing about which route ran.
    const pnShapeRe = /\b[A-Z][A-Za-z\-']+\^[A-Z][A-Za-z\-']+\b/;
    expect(
      PN_SHAPE,
      "the sweep's own pattern must be live before a non-match means anything",
    ).toMatch(pnShapeRe);
    for (const buf of [FUL, LESS]) {
      expect(buf.toString("latin1")).toContain(BARE_PN);
      expect(buf.toString("utf8")).not.toMatch(pnShapeRe);
    }
    // The object's OTHER bytes must not be producing the hit either. The same
    // assembler with an allow-listed name scans clean under the same extension,
    // so what the cases below detect is the name and not the file meta group.
    const r = runScanner([
      writeObject("by-name-nonvacuity.md", buildDicomFixture("19000101", "ANON^PATIENT")),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("CONTROL: the identical object named .dcm was a hit on base too", () => {
    // The detector-is-live row. Every green below sits beside this one.
    const r = runScanner([writeObject("by-name-control.dcm", FUL)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/\(0010,0010\)/);
    expect(r.stderr).toContain(BARE_PN);
  });

  for (const ext of TEXT_EXTS) {
    it(`THE DEFECT: the same bytes named ${ext} are reported (exit 1)`, () => {
      const r = runScanner([writeObject(`by-name-ful${ext}`, FUL)]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      // Under its TAG, which is the half the text sweep cannot produce. Asserting
      // the exit code alone would pass on a hit from any recognizer at all.
      expect(r.stderr).toMatch(/\(0010,0010\)/);
      expect(r.stderr).toContain(BARE_PN);
    });

    it(`THE DEFECT, PREAMBLE-LESS: the same dataset named ${ext} is reported (exit 1)`, () => {
      const r = runScanner([writeObject(`by-name-less${ext}`, LESS)]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      expect(r.stderr).toMatch(/\(0010,0010\)/);
    });
  }

  it("CLEAN: an allow-listed object named .md is still clean (exit 0)", () => {
    const r = runScanner([
      writeObject("by-name-clean.md", buildDicomFixture(ALLOWED_DA, "ANON^PATIENT")),
    ]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });

  it("NOT SUBTRACTED: a .md that is NOT a DICOM stream still gets the text sweep", () => {
    const r = runScanner([writeObject("by-name-prose.md", Buffer.from(SYNTHETIC_PHI, "utf8"))]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("NOT SUBTRACTED: a .md carrying a base64 object is still decoded", () => {
    // `scanEmbeddedObjects` was the deleted branch's other call. A page whose own
    // bytes carry nothing matchable proves the decode ran rather than the sweep.
    const embedded = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "ascii"),
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      shortElement(0x0010, 0x0010, "PN", CARET_PN),
    ]);
    const page = Buffer.from(
      `# fixture\n\n\`\`\`\n${embedded.toString("base64")}\n\`\`\`\n`,
      "utf8",
    );
    expect(page.toString("utf8")).not.toContain(CARET_PN);

    const r = runScanner([writeObject("by-name-embedded.md", page)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("NOT SUBTRACTED: a .md whose name hides behind an undefined-length SQ is still reported", () => {
    // 🛑 THIS IS `#97`'s CASE, ON THIS BRANCH. `scanDicom` gives up quietly at an
    // undefined-length `SQ` (PS3.5 2026c §7.5.2), and §7.1 orders tags ascending,
    // so `(0008,1110)` sits before `(0010,0010)` in a conformant file. Routing
    // this file to `scanDicom` INSTEAD of the text sweep would have taken it from
    // exit 1 to exit 0 - the fix making the leak worse. It is an addition, so it
    // does not, and this case is what says so.
    const halted = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "ascii"),
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      undefinedLengthSq(0x0008, 0x1110),
      shortElement(0x0010, 0x0010, "PN", CARET_PN),
    ]);
    const r = runScanner([writeObject("by-name-halt.md", halted)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
  });

  it("BOTH ROUTES: one .md, one name per route, and neither route can see the other's", () => {
    // The superset in a single file. `(0008,0090)` is single-component and before
    // the halt, so only the tag walk reaches it; `(0010,0010)` is caret-bearing
    // and past the halt, so only the text sweep does. On base this file reported
    // the second alone.
    const both = Buffer.concat([
      Buffer.alloc(128),
      Buffer.from("DICM", "ascii"),
      preamblelessFileMeta("1.2.840.10008.1.2.1"),
      shortElement(0x0008, 0x0090, "PN", BARE_PN),
      undefinedLengthSq(0x0008, 0x1110),
      shortElement(0x0010, 0x0010, "PN", CARET_PN),
    ]);
    const r = runScanner([writeObject("by-name-both.md", both)]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr, "the tag walk did not run on a text-named file").toContain(BARE_PN);
    expect(r.stderr, "the text sweep was subtracted, which is the net-leak shape").toContain(
      CARET_PN,
    );
  });

  it("the ALL-MODE walk catches one too, which is the route CI runs", () => {
    // The cases above go through the paths route. This is the gate's own route,
    // over a corpus root, in a throwaway repo.
    const root = makeRepo();
    writeFileSync(join(root, "test", "fixtures", "report.md"), FUL);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/report.md");
    expect(r.stderr).toContain(BARE_PN);
  });

  it("and the same corpus with an allow-listed payload is still clean (exit 0)", () => {
    const root = makeRepo();
    writeFileSync(
      join(root, "test", "fixtures", "report.md"),
      buildDicomFixture(ALLOWED_DA, "ANON^PATIENT"),
    );

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });
});

// ---------------------------------------------------------------------------
// THE WALK ROOT IS `test/`, AND A DECLARED ROOT IS RECONCILED WITH GIT
// (PHI-SCAN-WALK-ROOT-SCOPE)
// ---------------------------------------------------------------------------
//
// Measured on base `8982a16`: all-mode opened THIRTEEN files, and none of them
// was under `test/`. Every file this package commits under `test/fixtures/` is
// gitignored (they are regenerated by the suite above), so the fixture root
// contributed zero and the corpus was `README.md` plus `docs-content/`. Against
// 226 tracked files, 213 were scanned by neither route, 82 of them under `test/`.
//
// That mattered here more than the shape of the number suggests: this package
// ships NO `.dcm` files at all, so its whole committed fixture corpus is PN and
// date literals inside `.ts` sources under `test/`. Pointing the same scanner at
// that root finds 81 PN/date hits across 20 files (83 across 21 if the one
// corpus-exempt README is named by path, which all-mode does not open).
//
// Four separate shapes let a declared root go unopened while the gate printed
// `OK - no hits`, and each is pinned below with a positive beside it:
//   - the root MISSING entirely (`terminology`'s worst instance);
//   - the root a DANGLING symlink - `existsSync` FOLLOWS the link and answers
//     false, so the walk returned before `readdirSync` and the not-a-regular-file
//     rule never fired;
//   - the root a REGULAR FILE - an uncaught `ENOTDIR`, which exits 1, the code
//     that means "hits found";
//   - the root present but EMPTIED, which no existence check can see at all.

describe("phi-scan: the walk root is test/, not test/fixtures/", () => {
  it("finds a violator in a tracked test file OUTSIDE test/fixtures (exit 1)", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "unit"));
    writeFileSync(join(root, "test", "unit", "leak.test.ts"), `const x = \`${SYNTHETIC_PHI}\`;\n`);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/unit/leak.test.ts");
    expect(r.stderr).toContain(CARET_PN);
  });

  it("the same file with an allow-listed payload is clean, so the root is not just always red", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "unit"));
    writeFileSync(join(root, "test", "unit", "ok.test.ts"), 'const x = "ANON^PATIENT";\n');

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK - no hits/);
  });

  it("exempts ONE literal path in all-mode, and no other README anywhere", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "fixtures", "phi-scan"), { recursive: true });
    mkdirSync(join(root, "test", "smoke"));
    writeFileSync(join(root, "test", "fixtures", "phi-scan", "README.md"), SYNTHETIC_PHI);
    writeFileSync(join(root, "test", "smoke", "README.md"), 'const x = "ANON^PATIENT";\n');

    const clean = runIn(root, []);
    expect(clean.code, `stderr: ${clean.stderr}`).toBe(0);
    expect(clean.stdout).toContain("corpus exemption in force");
    expect(clean.stdout).toContain("test/fixtures/phi-scan/README.md");

    // The pin that stops the line above being vacuous: the SAME payload one
    // directory across is scanned, so the exemption is one path rather than a
    // rule about the file name.
    writeFileSync(join(root, "test", "smoke", "README.md"), SYNTHETIC_PHI);
    const hit = runIn(root, []);
    expect(hit.code, `stderr: ${hit.stderr}`).toBe(1);
    expect(hit.stderr).toContain("test/smoke/README.md");
  });

  it("🛑 the exemption is a PATH and not a rule, so a README ONE LEVEL UP is scanned", () => {
    // A draft wrote the exemption as "a `readme.md` under `test/fixtures/`" on
    // the reasoning that a rule cannot go stale, and a refuter refused it. The
    // directions are not symmetric: a stale exact path fails CLOSED (the moved
    // file is scanned and the gate reds), a predicate fails OPEN (every future
    // README under that prefix, at any depth, is exempt until somebody notices).
    const root = makeRepo();
    writeFileSync(join(root, "test", "fixtures", "README.md"), SYNTHETIC_PHI);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/README.md");
    expect(r.stderr).toContain(CARET_PN);
  });

  it("🛑 --staged does NOT apply the exemption, because base did not and that is a detection", () => {
    // `package.json`'s `pre-commit` is `pnpm phi-scan --staged`, so this is the
    // commit-blocking route. Base scanned a README under `test/fixtures/` on it
    // and exited 1; a draft of this change taught the route the exemption and
    // took the same input to exit 0, which is the one direction this item
    // forbids. The two routes therefore disagree about exactly one file, they
    // disagreed on base too, and the disagreement fails closed.
    const root = makeRepo();
    mkdirSync(join(root, "test", "fixtures", "phi-scan"), { recursive: true });
    writeFileSync(join(root, "test", "fixtures", "phi-scan", "README.md"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/phi-scan/README.md"]);

    const staged = runIn(root, ["--staged"]);
    expect(staged.code, `stderr: ${staged.stderr}`).toBe(1);
    expect(staged.stderr).toContain("test/fixtures/phi-scan/README.md");
    expect(staged.stderr).toContain(CARET_PN);

    // And the other half of the disagreement, on the same tree, so the pair is
    // one measurement rather than two claims.
    const all = runIn(root, []);
    expect(all.code, `stderr: ${all.stderr}`).toBe(0);
    expect(all.stdout).toContain("corpus exemption in force");
  });

  it("--staged covers test/ outside test/fixtures too (exit 1)", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "unit"));
    writeFileSync(join(root, "test", "unit", "leak.test.ts"), SYNTHETIC_PHI);
    git(root, ["add", "test/unit/leak.test.ts"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/unit/leak.test.ts");
    expect(r.stderr).toContain(CARET_PN);
  });
});

describe("phi-scan: an embedded base64 object is decoded outside markdown too", () => {
  /** A Part 10 object as a base64 literal in a TypeScript source, which is how fixtures ship here. */
  function writeTsFixture(root: string, name: string, object: Buffer): void {
    mkdirSync(join(root, "test", "unit"), { recursive: true });
    writeFileSync(
      join(root, "test", "unit", name),
      `export const OBJECT = "${object.toString("base64")}";\n`,
    );
  }

  it("a name-bearing object base64-encoded in a .ts file is a hit (exit 1)", () => {
    // Measured on base `8982a16`: the identical object was found as `probe.md`
    // and as `probe.dcm`, and printed `OK - no hits` as `probe.ts`, because
    // `scanEmbeddedObjects` ran only for a name in the text-extension set that
    // `DICOM-PHI-SCAN-RESIDUALS` has since deleted. Widening the walk root
    // without this would have opened 81 `.ts` files and still read past every
    // object encoded in one.
    const root = makeRepo();
    writeTsFixture(root, "object.ts", buildDicomFixture("19000101", VIOLATOR_PN));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/unit/object.ts");
    expect(r.stderr).toMatch(/\(0010,0010\)/);
    expect(r.stderr).toContain(VIOLATOR_PN);
  });

  it("the text sweep alone cannot see it, so the decode is what does the work", () => {
    // The control that makes the case above mean something: the name is present
    // in the source only as base64, so the `.ts` file's own bytes carry no
    // caret-joined token for `scanText` to match.
    const object = buildDicomFixture("19000101", VIOLATOR_PN);
    const encoded = object.toString("base64");
    expect(encoded).not.toContain(VIOLATOR_PN);
    expect(object.toString("latin1")).toContain(VIOLATOR_PN);
  });

  it("the same .ts with an allow-listed payload scans clean (exit 0)", () => {
    const root = makeRepo();
    writeTsFixture(root, "object.ts", buildDicomFixture("19000101", "ANON^PATIENT"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("a base64 run in a .ts that is not a DICOM object is still dropped in silence", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "unit"), { recursive: true });
    writeFileSync(
      join(root, "test", "unit", "noise.ts"),
      `export const BLOB = "${Buffer.alloc(400, 0x41).toString("base64")}";\n`,
    );

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan: a declared root that cannot be walked refuses the scan", () => {
  it("refuses a MISSING declared root (exit 2), naming it", () => {
    const root = makeRepo();
    rmSync(join(root, "docs-content"), { recursive: true });

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("docs-content");
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("refuses a DANGLING SYMLINK at a root, which existsSync follows and answers false for", () => {
    // The sharpest case, and the reason the root is `lstat`ed rather than
    // `existsSync`ed: the link resolves to nothing, `existsSync` says false, and
    // the old code skipped the root without a word. Measured on base `8982a16`:
    // exit 0 and `OK - no hits`.
    const root = makeRepo();
    rmSync(join(root, "test"), { recursive: true });
    symlinkSync(join(root, "no-such-target"), join(root, "test"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("refuses a root symlinked at a REAL directory too, so it is the link that is refused", () => {
    const root = makeRepo();
    mkdirSync(join(root, "elsewhere"));
    writeFileSync(join(root, "elsewhere", TARGET_NAME), SYNTHETIC_PHI);
    rmSync(join(root, "test"), { recursive: true });
    symlinkSync(join(root, "elsewhere"), join(root, "test"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("refuses a REGULAR FILE where a directory root is declared, with exit 2 and not 1", () => {
    // The exit code is derived from THIS script's own contract (0 clean, 1 hits,
    // 2 invocation error), not ported from a sibling. Base `8982a16` answered
    // this shape TWO different wrong ways, both measured, and neither is 2: with
    // a regular file at `test` the old root `test/fixtures` simply did not
    // exist, so the run exited 0 and printed `OK - no hits`; with a regular file
    // at `test/fixtures` itself, `readdirSync` raised an uncaught `ENOTDIR` and
    // the process exited 1 - the one code that means "PHI was found".
    const root = makeRepo();
    rmSync(join(root, "test"), { recursive: true });
    writeFileSync(join(root, "test"), SYNTHETIC_PHI);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.code).not.toBe(1);
    expect(r.stderr).toContain("a regular file, where a directory is declared");
    expect(r.stderr).not.toContain("ENOTDIR");
    expectNoPhi(r.stderr);
  });

  it("refuses a DIRECTORY where a file root is declared", () => {
    const root = makeRepo();
    rmSync(join(root, "README.md"));
    mkdirSync(join(root, "README.md"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("a directory, where a regular file is declared");
  });
});

describe("phi-scan: the walk is reconciled against git ls-files", () => {
  it("refuses when a root is EMPTIED, which no existence check can see (exit 2)", () => {
    // Existence is not observation. The root is present, `lstat` is happy, the
    // walk enumerates nothing, and every count of what WAS reached reads clean.
    // `git ls-files` is the second source that notices.
    const root = makeRepo();
    git(root, ["add", "test/fixtures/ordinary.txt"]);
    rmSync(join(root, "test", "fixtures", "ordinary.txt"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/ordinary.txt");
    expect(r.stderr).toContain("did not open");
  });

  it("does not refuse when every tracked file IS opened, so the check is not always red", () => {
    const root = makeRepo();
    git(root, ["add", "test/fixtures/ordinary.txt", "README.md", "docs-content/intro.md"]);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("accounts for the corpus exemption rather than reporting it as a miss", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "fixtures", "phi-scan"), { recursive: true });
    writeFileSync(join(root, "test", "fixtures", "phi-scan", "README.md"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/phi-scan/README.md"]);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("corpus exemption in force");
  });

  it("🔴 DOES NOT close the decoy-contents escape, and this pins that it does not", () => {
    // DISCLOSED, NOT FIXED, and no repo in this org has closed it. The
    // reconciliation compares PATH SETS, not the bytes git carries at those
    // paths, so a working tree whose files are clean reconciles and exits 0 even
    // when the INDEX at the same paths holds PHI. Widening the root makes this
    // narrower rather than safer: a decoy now has to mirror every tracked name
    // under `test/`, not the handful under `test/fixtures/`.
    const root = makeRepo();
    writeFileSync(join(root, "test", "fixtures", "ordinary.txt"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/ordinary.txt"]);
    // The index now carries the payload. Replace the working-tree copy.
    writeFileSync(join(root, "test", "fixtures", "ordinary.txt"), "clean\n");

    const escaped = runIn(root, []);
    expect(escaped.code, `stderr: ${escaped.stderr}`).toBe(0);

    // And the control proving the payload is one this scanner would otherwise
    // catch: the very same bytes, in the working tree, are a hit.
    const staged = runIn(root, ["--staged"]);
    expect(staged.code, `stderr: ${staged.stderr}`).toBe(1);
    expect(staged.stderr).toContain(CARET_PN);
  });
});

// ---------------------------------------------------------------------------
// The hit report's per-file print cap
// ---------------------------------------------------------------------------
//
// `DICOM-SCANDICOM-SILENT-HALT` made the text sweep run over every Part 10
// object's bytes, and its recognizers fire on image noise at a rate that is a
// property of the payload's byte histogram. Re-measured on `b784c38`: 8 MiB of
// synthetic `(7FE0,0010) OW` pixel data uniform over `0x41-0x60` produced tens of
// thousands of hits and one stderr line each. The figures and the generator are
// in `documentation/agent-notes/dicom-phi-scan-report-cap.md`.
//
// 🛑 THE CAP IS THE PLACE A FIX BECOMES A NET LEAK, so the cases below pin the
// three properties that stop it being one, and the one thing it genuinely costs:
// the exit code and the totals are computed off the hits and not off what was
// printed; the cap is PER FILE, so no path goes unnamed however loud another file
// is; a file with lines withheld says so with an exact count; and a withheld line
// IS withheld, which the last pair of cases states rather than claims away.

/**
 * A PN-shaped token the text sweep matches, distinct per index.
 *
 * Assembled from parts, never written as a literal, for the reason
 * `test/helpers/phi-scan-violators.ts` gives at length: every tracked file under
 * `test/` is in this scanner's own corpus, so a caret-joined person-name token in
 * this source would red the gate on the suite that proves the gate works. The PN
 * recognizer admits letters only, so the index is spelled in letters.
 */
function pnNoiseToken(i: number): string {
  const caret = String.fromCharCode(0x5e);
  const hi = String.fromCharCode(0x41 + Math.floor(i / 26));
  const lo = String.fromCharCode(0x41 + (i % 26));
  return `Noise${hi}${lo}${caret}Given${hi}${lo}`;
}

/** How many hit-bearing lines a `pnNoiseToken` file carries. One hit each, so this IS the count. */
const FLOOD_HITS = 200;

function floodText(): string {
  const lines: string[] = [];
  for (let i = 0; i < FLOOD_HITS; i += 1) lines.push(pnNoiseToken(i));
  return lines.join("\n") + "\n";
}

/** Hit DETAIL lines only: the per-hit lines, not the `HIT:` headers or the summary. */
function countHitLines(stderr: string): number {
  return stderr.split("\n").filter((l) => /^ {2}tag=/.test(l)).length;
}

describe("phi-scan: the hit report is capped PER FILE, and the cap cannot move the verdict", () => {
  it("prints an exact count of what it did not print, and the true total", () => {
    const root = makeRepo();
    writeFileSync(join(root, "test", "fixtures", "flood.txt"), floodText());

    const r = runIn(root, ["--max-hit-lines", "3", join(root, "test", "fixtures", "flood.txt")]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(countHitLines(r.stderr)).toBe(3);
    expect(r.stderr).toContain(`... and ${String(FLOOD_HITS - 3)} more hit(s) in this file`);
    // The total is over the hits, not over the lines printed.
    expect(r.stderr).toContain(`${String(FLOOD_HITS)} hits across 1 file(s).`);
    expect(r.stderr).toContain(`${String(FLOOD_HITS - 3)} hit line(s) were not printed`);
  });

  it("`--max-hit-lines 0` prints every one, so nothing is lost, only unprinted", () => {
    const root = makeRepo();
    writeFileSync(join(root, "test", "fixtures", "flood.txt"), floodText());

    const r = runIn(root, ["--max-hit-lines", "0", join(root, "test", "fixtures", "flood.txt")]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(countHitLines(r.stderr)).toBe(FLOOD_HITS);
    expect(r.stderr).not.toContain("more hit(s) in this file");
    expect(r.stderr).not.toContain("were not printed");
  });

  it("🛑 THE NET-LEAK CONTROL: a loud file does not push a later file's name off the report", () => {
    // This is the case a GLOBAL cap would fail, and it is why the cap is per
    // file. The flood is scanned FIRST (paths mode preserves argv order, so the
    // ordering is the test's and not the filesystem's), and it carries far more
    // hits than the cap. A global budget would be spent inside it and the second
    // file, whose hit names a person, would never be reached.
    const root = makeRepo();
    const flood = join(root, "test", "fixtures", "flood.txt");
    const named = join(root, "test", "fixtures", "named.txt");
    writeFileSync(flood, floodText());
    writeFileSync(named, SYNTHETIC_PHI);

    const r = runIn(root, ["--max-hit-lines", "3", flood, named]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("flood.txt");
    expect(r.stderr).toContain("named.txt");
    expect(r.stderr).toContain(CARET_PN);
  });

  it("does not cap a file whose hits fit, so the suppression line is not always on", () => {
    const root = makeRepo();
    const named = join(root, "test", "fixtures", "named.txt");
    writeFileSync(named, SYNTHETIC_PHI);

    const r = runIn(root, ["--max-hit-lines", "3", named]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(CARET_PN);
    expect(r.stderr).not.toContain("more hit(s) in this file");
    expect(r.stderr).not.toContain("were not printed");
  });

  it("cannot turn a hit into a clean run, at any cap including one", () => {
    // The property the whole cap rests on: `main` derives the exit code from the
    // hits, never from what `report` wrote. A cap of 1 over a 200-hit file prints
    // one line and still refuses.
    const root = makeRepo();
    const flood = join(root, "test", "fixtures", "flood.txt");
    writeFileSync(flood, floodText());

    const r = runIn(root, ["--max-hit-lines", "1", flood]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(countHitLines(r.stderr)).toBe(1);
    expect(r.stdout).not.toContain("OK - no hits");
  });

  it("🛑 A WITHHELD LINE IS WITHHELD: the name is off the default report and one flag away", () => {
    // Stated rather than claimed away. The cap's cost is real: a hit line that
    // names a person, sitting behind more hits than the cap, is NOT printed by
    // default. What makes that acceptable is the other half of this case. The
    // run still refuses, the count still includes it, the file is still named,
    // and `--max-hit-lines 0` prints it. What is never acceptable is a green run,
    // and the case above pins that this cannot produce one.
    const root = makeRepo();
    const mixed = join(root, "test", "fixtures", "mixed.txt");
    writeFileSync(mixed, floodText() + SYNTHETIC_PHI);

    const capped = runIn(root, ["--max-hit-lines", "3", mixed]);
    expect(capped.code, `stderr: ${capped.stderr}`).toBe(1);
    expect(capped.stderr).not.toContain(CARET_PN);
    expect(capped.stderr).toContain("more hit(s) in this file");

    const uncapped = runIn(root, ["--max-hit-lines", "0", mixed]);
    expect(uncapped.code, `stderr: ${uncapped.stderr}`).toBe(1);
    expect(uncapped.stderr).toContain(CARET_PN);
    // Same verdict, same total, different amount printed. That is the whole
    // difference the flag makes.
    expect(countHitLines(uncapped.stderr)).toBeGreaterThan(countHitLines(capped.stderr));
  });

  it("🛑 WHICH lines survive is SCAN order, not file order, and that is not obvious", () => {
    // Measured, and it contradicts the reading a reviewer arrives with. In the
    // fixture below the person name is at offset 0 of the appended block and the
    // DOB two lines after it, yet the DOB is printed and the name is not. "The
    // first n hits" is therefore not "the first n in the file", and a reader who
    // assumed otherwise would mis-read every capped report.
    //
    // 🛑 AN EARLIER DRAFT ENUMERATED THAT ORDER HERE AND ARGUED FROM IT THAT
    // PER-RECOGNIZER CAP SLOTS BUY NO SAFETY. A refuter falsified both halves and
    // both are DELETED rather than reworded. Do not write either again; see
    // `documentation/agent-notes/dicom-phi-scan-report-cap.md`. The assertions
    // below are unchanged: they are the measurement, not the explanation.
    const root = makeRepo();
    const mixed = join(root, "test", "fixtures", "mixed.txt");
    writeFileSync(mixed, floodText() + SYNTHETIC_PHI);

    const capped = runIn(root, ["--max-hit-lines", "3", mixed]);
    expect(capped.code, `stderr: ${capped.stderr}`).toBe(1);
    expect(capped.stderr).toContain(VIOLATOR_DOB);
    expect(capped.stderr).not.toContain(CARET_PN);

    // The suppression line itself carries a count and the flag, and nothing off
    // the hits it stands for: no tag, no VR, no value, no offset. A diagnostic
    // about a PHI leak is itself a PHI surface.
    // The remainder is derived from the run's own total rather than written as a
    // numeral, so the two cannot drift apart and be quoted as each other.
    const total = Number(/(\d+) hits across/.exec(capped.stderr)?.[1]);
    expect(total).toBeGreaterThan(3);
    const line = capped.stderr.split("\n").find((l) => l.includes("more hit(s) in this file"));
    expect(line).toBe(
      `  ... and ${String(total - 3)} more hit(s) in this file, not printed. ` +
        "Re-run with --max-hit-lines 0 to print every one.",
    );
  });

  it("caps by DEFAULT, with no flag, which is the run CI and the pre-commit hook make", () => {
    // The default's VALUE is not written here. A numeral copied into a test is a
    // second source of truth that drifts from the constant. What is pinned is
    // that a default run prints strictly fewer lines than an uncapped one over
    // the same corpus while reporting the same total. This assumes the default
    // sits below `FLOOD_HITS`, and it fails CLOSED if a future raise passes it.
    const root = makeRepo();
    const flood = join(root, "test", "fixtures", "flood.txt");
    writeFileSync(flood, floodText());

    const dflt = runIn(root, [flood]);
    const uncapped = runIn(root, ["--max-hit-lines", "0", flood]);
    expect(dflt.code, `stderr: ${dflt.stderr}`).toBe(1);
    expect(uncapped.code, `stderr: ${uncapped.stderr}`).toBe(1);
    expect(countHitLines(uncapped.stderr)).toBe(FLOOD_HITS);
    expect(countHitLines(dflt.stderr)).toBeLessThan(FLOOD_HITS);
    expect(dflt.stderr).toContain(`${String(FLOOD_HITS)} hits across 1 file(s).`);
  });

  it("refuses a bad --max-hit-lines (exit 2) rather than falling back to the default", () => {
    // A run that quietly printed a different amount than it was told to is the
    // same shape of unobservable behaviour this script exists to close. Exit 2
    // is the invocation-error code, and it is NOT 1: nothing was scanned, so the
    // run says nothing about the corpus.
    const root = makeRepo();
    const flood = join(root, "test", "fixtures", "flood.txt");
    writeFileSync(flood, floodText());

    for (const bad of ["-1", "1.5", "abc", "1e9", " 3", ""]) {
      const r = runIn(root, ["--max-hit-lines", bad, flood]);
      expect(r.code, `value ${JSON.stringify(bad)} stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain("--max-hit-lines expects a non-negative integer");
      expect(countHitLines(r.stderr)).toBe(0);
    }

    const missing = runIn(root, ["--max-hit-lines"]);
    expect(missing.code, `stderr: ${missing.stderr}`).toBe(2);
    expect(missing.stderr).toContain("--max-hit-lines requires a count argument");
  });

  it("the flag alone does not flip the run into paths mode, so all-mode still walks", () => {
    // `parseArgs` selects `paths` mode from POSITIONAL paths and `--allow-fixture`
    // only. A flag that silently emptied the corpus would report clean over it.
    const root = makeRepo();
    git(root, ["add", "test/fixtures/ordinary.txt", "README.md", "docs-content/intro.md"]);
    writeFileSync(join(root, "docs-content", "leak.md"), SYNTHETIC_PHI);

    const r = runIn(root, ["--max-hit-lines", "0"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("docs-content/leak.md");
  });
});

// ---------------------------------------------------------------------------
// The report's tail, when stderr is a pipe the reader is not draining
// ---------------------------------------------------------------------------

/**
 * Enough hits that the uncapped report cannot fit in a pipe TWICE OVER.
 *
 * A Linux pipe holds 64 KiB. The case below reads one chunk and then stalls, so
 * a truncating scanner can still deliver up to one chunk plus one full pipe -
 * about 128 KiB - and a smaller fixture would let it pass. 25 x `floodText()` is
 * 5,000 hits and roughly 400 KB of report, so the margin is about threefold.
 * Measured at 1,500 hits, one draw in five reached 79,592 bytes; that is the
 * fixture size this constant exists to avoid.
 */
const STALL_FLOODS = 25;
const STALL_HITS = FLOOD_HITS * STALL_FLOODS;

describe("phi-scan: the report's TAIL survives a stderr pipe the reader is not draining", () => {
  it("prints every hit line and the total, with the reader stalled mid-report", async () => {
    // 🛑 THE DEFECT THIS PINS IS A PHI-GATE DEFECT, NOT A COSMETIC ONE. The exit
    // code is computed off `hits` and was always right, so the failure mode is a
    // run that REFUSES while under-naming what it found - and the bytes it drops
    // are the END of the report, the last hit lines and the total, which is the
    // part a reader trusts to say how much there was.
    //
    // `scripts/phi-scan.ts` ended `process.exit(run())`. That tears the process
    // down without waiting for stdio libuv has accepted but not yet written, and
    // stderr is a PIPE under every caller that matters: `spawnSync` here, and the
    // shell pipeline CI runs the script in. Once one write cannot complete
    // immediately, every later one queues behind it and only a loop turn flushes
    // it - which `process.exit()` never allows.
    //
    // On `main` this fired as a ~50% flake in `ci / verify (24)` on the two
    // `--max-hit-lines 0` cases above: 191 and 193 of 200 hit lines, exit 1 both
    // times, `verify (22)` green, and unreproducible under an idle reader. This
    // case makes it deterministic by stalling the reader instead of hoping the
    // scheduler does. Measured against `21d42f5`: 5 of 5 runs short (171-1,006 of
    // 1,500 hit lines at that fixture size), 0 of 5 carrying the total. With
    // `process.exitCode`: 5 of 5 complete.
    //
    // SECURITY, and it is the file header's rule not an exception to it: array
    // args, no shell. `spawn` rather than `spawnSync` because the whole point is
    // to control WHEN the parent reads, which a synchronous call cannot express.
    const root = makeRepo();
    const flood = join(root, "test", "fixtures", "flood.txt");
    writeFileSync(flood, floodText().repeat(STALL_FLOODS));

    const child = spawn(process.execPath, [SCANNER_PATH, "--max-hit-lines", "0", flood], {
      cwd: root,
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });

    // Read the first chunk, then stop reading for long enough that the child
    // fills the pipe and has to queue the rest. A scanner that exits on its own
    // terms blocks here and finishes once reading resumes; one that calls
    // `process.exit()` drops whatever it queued.
    let stderr = "";
    let stalled = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (!stalled) {
        stalled = true;
        child.stderr.pause();
        setTimeout(() => child.stderr.resume(), 500);
      }
    });

    const code = await new Promise<number | null>((resolve) => {
      child.on("close", resolve);
    });

    expect(stalled, "the reader never saw a first chunk, so nothing was stalled").toBe(true);
    expect(code, `stderr: ${stderr.slice(-400)}`).toBe(1);
    expect(countHitLines(stderr)).toBe(STALL_HITS);
    expect(stderr).toContain(`${String(STALL_HITS)} hits across 1 file(s).`);
  });

  it("🛑 A VANISHED READER DOES NOT BECOME EXIT 1, WHICH IS THE CODE THAT MEANS PHI", async () => {
    // The cost of not calling `process.exit()`, and it was REFUTED into existence
    // rather than anticipated. `process.exit()` hid every late stdio error; without
    // it, a write to a pipe whose reader has gone fails with `EPIPE` on a LATER
    // tick, after `run()` has returned, so `run()`'s try/catch cannot see it and
    // Node's default unhandled-`'error'` path exits 1.
    //
    // 1 is the one code that means "PHI was found". Measured against `21d42f5`
    // before the listeners were added, reader closed: a clean corpus went 0 -> 1
    // and an invocation error went 2 -> 1, turning "the scan did not complete, so
    // it says nothing about the corpus" into a confident wrong answer.
    //
    // Both codes are asserted, because the two say opposite things and only one of
    // them is about the corpus at all.
    const root = makeRepo();

    const runWithNoReader = async (args: string[]): Promise<number | null> => {
      const child = spawn(process.execPath, [SCANNER_PATH, ...args], {
        cwd: root,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      // Close both read ends at once, so whichever stream the run writes to is
      // the one that breaks. This is what `| head -n 0` does to it.
      child.stdout.destroy();
      child.stderr.destroy();
      return new Promise<number | null>((resolve) => {
        child.on("close", resolve);
      });
    };

    // A clean corpus writes to STDOUT and must stay 0.
    expect(await runWithNoReader([])).toBe(0);
    // An invocation error writes to STDERR and must stay 2. Not 1.
    expect(await runWithNoReader(["--max-hit-lines", "banana"])).toBe(2);
  });
});

describe("phi-scan: an unexpected error is an invocation error, never a hit", () => {
  it("exits 2 on an unreadable directory under the walk root, not 1", () => {
    // The contract is 0 clean / 1 hits / 2 invocation error, and an uncaught
    // throw exits 1 on Node - the one code that means "PHI was found", to a CI
    // job that reads exit codes rather than stderr. Widening the walk root from
    // `test/fixtures/` to `test/` enlarged the surface this can happen on.
    // Measured before the top-level catch existed: exit 1.
    const root = makeRepo();
    const denied = join(root, "test", "denied");
    mkdirSync(denied);
    chmodSync(denied, 0o000);
    try {
      const r = runIn(root, []);
      // A root-owned runner can read a mode-000 directory, so the premise is
      // asserted rather than assumed: if the walk succeeded there is nothing
      // here to catch and the case would otherwise pass for the wrong reason.
      if (r.code === 0) {
        expect(process.getuid?.()).toBe(0);
        return;
      }
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.code).not.toBe(1);
      expect(r.stderr).toContain("This is not a hit");
    } finally {
      chmodSync(denied, 0o755);
    }
  });
});

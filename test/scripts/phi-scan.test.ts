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

import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

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
  // Pad DA — DICOM DA is always 8 chars YYYYMMDD; that's already even.
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

  // (0002,0001) OB length=2 value="\x00\x01" — long-form: 2 reserved + 4-byte length
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

  // (0002,0002) Media Storage SOP Class UID — CT Image Storage
  const sopClass = uiElement(0x0002, 0x0002, "1.2.840.10008.5.1.4.1.1.2");
  // (0002,0003) Media Storage SOP Instance UID
  const sopInstance = uiElement(0x0002, 0x0003, "1.2.3.4");
  // (0002,0010) Transfer Syntax UID — Explicit VR Little Endian
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
    "Sample DOB record: 1990-04-15 (recent — should fail)",
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
    const r = runScanner([
      "--allow-fixture",
      join(FIX_DIR, "recent-date-violator.dcm"),
    ]);
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
      const r = runScanner([
        "--allow-fixture",
        "test/fixtures/phi-scan/recent-date-violator.dcm",
      ]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    } finally {
      writeFileSync(OVERRIDES_PATH, original);
    }
  });
});

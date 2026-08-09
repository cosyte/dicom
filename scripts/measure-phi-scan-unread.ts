/**
 * The superset matrix behind `DICOM-PHI-SCAN-RESIDUALS`'s unread-tail disclosure.
 *
 * ## Why this file exists rather than a table in a note
 *
 * The note `documentation/agent-notes/dicom-phi-scan-unread-tail.md` quotes a 195-cell result, and
 * a refuter's objection to the first draft was exact: **a figure only its author can produce is not
 * evidence.** The 13 objects, the 5 carriers and the 3 cap settings live here, so the table is
 * re-derivable by anyone, against any base.
 *
 * It is a **measurement harness, not a test**, and is not wired into CI. What it proves that a test
 * cannot is the comparison against a DIFFERENT TREE, per cell:
 *
 *   - the exit code must be IDENTICAL (this change must not be able to move a verdict);
 *   - the hit detail lines must be IDENTICAL as a multiset (`hits` is untouched by construction);
 *   - every base output line must survive, with ONE deliberate exception: `[phi-scan] OK - no hits`
 *     is withdrawn where a `PARTIAL:` line replaces it, and a cell qualifies for that exception
 *     only when the missing set is exactly that line and the replacement is present.
 *
 * ## Running it
 *
 * ```
 * git show <base>:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
 * pnpm measure:phi-scan-unread /tmp/base-phi-scan.ts
 * ```
 *
 * With no argument it verifies the generator and prints each object's halt reason, without a base
 * comparison. **The verification is not optional and runs either way:** `#102` caught two of its own
 * fixture generators wrong, so every object here is put through `@cosyte/dicom`'s own `parseDicom`
 * and CLASSIFIED BY WHAT THE PARSE PRODUCED, never by the label on the fixture. That is not
 * decoration: it is how `08-big-endian` was found to be well formed rather than malformed.
 *
 * **`tsx`, not `node`.** This script imports `../src/index.js`, and Node's ESM resolver will not
 * rewrite that `.js` specifier onto the `.ts` file. `scripts/measure-unrecognized-vr.ts` records
 * the same fact at length.
 *
 * **Every value planted here is synthetic and invented.** The caret is written as
 * `String.fromCharCode(0x5e)`, the technique `test/helpers/phi-scan-violators.ts` uses, so this
 * file's own bytes carry no PN-shaped token. That is the whole of the shared provenance: the names
 * themselves are this file's, not that helper's.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDicom } from "../src/index.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const SHIPPED = join(REPO_ROOT, "scripts", "phi-scan.ts");

/** The one line this change deliberately withdraws. Nothing else may go missing. */
const OK_LINE = "[phi-scan] OK - no hits";

const CARET = String.fromCharCode(0x5e);
/** Synthetic. Caret-bearing, so the text sweep's PN pass can match it. */
const CARET_PN = `WESTERGAARD${CARET}INGRID`;
/** Synthetic. SINGLE COMPONENT, so only the tag table can see it. */
const BARE_PN = "WESTERGAARD";
/** In the allow-list, so an object carrying it is a clean run rather than a hit. */
const ALLOWED_PN = `ANON${CARET}PATIENT`;
const RECENT_DA = "20240712";
const OLD_DA = "19000101";

// ---------------------------------------------------------------------------
// Object assembly
// ---------------------------------------------------------------------------

function shortEl(group: number, element: number, vr: string, value: string): Buffer {
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
 * with a different `(0002,0010)`: a fixture LABELLED big-endian while carrying little-endian bytes
 * is read happily by the tag walk and passes for the wrong reason.
 */
function shortElBE(group: number, element: number, vr: string, value: string): Buffer {
  const padded = value.length % 2 === 0 ? value : value + " ";
  const out = Buffer.alloc(8 + padded.length);
  out.writeUInt16BE(group, 0);
  out.writeUInt16BE(element, 2);
  out.write(vr, 4, "ascii");
  out.writeUInt16BE(padded.length, 6);
  out.write(padded, 8, "latin1");
  return out;
}

function uiEl(group: number, element: number, value: string): Buffer {
  const padded = value.length % 2 === 0 ? value : value + "\0";
  const out = Buffer.alloc(8 + padded.length);
  out.writeUInt16LE(group, 0);
  out.writeUInt16LE(element, 2);
  out.write("UI", 4, "ascii");
  out.writeUInt16LE(padded.length, 6);
  out.write(padded, 8, "ascii");
  return out;
}

function fileMeta(tsUid: string): Buffer {
  const version = Buffer.alloc(12 + 2);
  version.writeUInt16LE(0x0002, 0);
  version.writeUInt16LE(0x0001, 2);
  version.write("OB", 4, "ascii");
  version.writeUInt32LE(2, 8);
  version[12] = 0x00;
  version[13] = 0x01;
  const rest = Buffer.concat([
    version,
    uiEl(0x0002, 0x0002, "1.2.840.10008.5.1.4.1.1.2"),
    uiEl(0x0002, 0x0003, "1.2.3.4"),
    uiEl(0x0002, 0x0010, tsUid),
    uiEl(0x0002, 0x0012, "1.2.3.4.5"),
  ]);
  const groupLength = Buffer.alloc(8 + 4);
  groupLength.writeUInt16LE(0x0002, 0);
  groupLength.writeUInt16LE(0x0000, 2);
  groupLength.write("UL", 4, "ascii");
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(rest.length, 8);
  return Buffer.concat([groupLength, rest]);
}

const PREAMBLE = Buffer.concat([Buffer.alloc(128), Buffer.from("DICM", "ascii")]);

interface Part10Options {
  preamble?: boolean;
  ts?: string;
}

function part10(dataset: Buffer[], opts: Part10Options = {}): Buffer {
  const { preamble = true, ts = "1.2.840.10008.1.2.1" } = opts;
  const body = Buffer.concat([fileMeta(ts), ...dataset]);
  return preamble ? Buffer.concat([PREAMBLE, body]) : body;
}

/** An undefined-length Sequence, immediately delimited. PS3.5 2026c section 7.5.2: legal. */
function undefSq(group: number, element: number): Buffer {
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

/** `(7FE0,0010) OB` with an undefined length: encapsulated pixel data, also legal. */
function encapsulatedPixelData(): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16LE(0x7fe0, 0);
  header.writeUInt16LE(0x0010, 2);
  header.write("OB", 4, "ascii");
  header.writeUInt32LE(0xffffffff, 8);
  const item = Buffer.alloc(8);
  item.writeUInt16LE(0xfffe, 0);
  item.writeUInt16LE(0xe000, 2);
  item.writeUInt32LE(0, 4);
  return Buffer.concat([header, item]);
}

/** A short-form element whose declared length runs `extra` bytes past the end of the object. */
function overDeclared(value: string, extra: number): Buffer {
  const padded = value.length % 2 === 0 ? value : value + " ";
  const out = Buffer.alloc(8 + padded.length);
  out.writeUInt16LE(0x0008, 0);
  out.writeUInt16LE(0x1030, 2);
  out.write("LO", 4, "ascii");
  out.writeUInt16LE(padded.length + extra, 6);
  out.write(padded, 8, "latin1");
  return out;
}

/** A dataset element whose VR bytes are not two uppercase letters. */
function garbageVr(): Buffer {
  const out = Buffer.alloc(8 + 2);
  out.writeUInt16LE(0x0009, 0);
  out.writeUInt16LE(0x0001, 2);
  out.write("z9", 4, "ascii");
  out.writeUInt16LE(2, 6);
  out.write("ab", 8, "ascii");
  return out;
}

/** Exactly eight bytes of a TWELVE-byte long-form header: the walk enters, the form does not fit. */
function longFormStub(): Buffer {
  const out = Buffer.alloc(8);
  out.writeUInt16LE(0x7fe0, 0);
  out.writeUInt16LE(0x0010, 2);
  out.write("OB", 4, "ascii");
  return out;
}

interface ProbeObject {
  id: string;
  /**
   * Whether the tag walk is expected to stop before the last byte.
   *
   * CHECKED, NOT TRUSTED, and the check is in `runMatrix`: a cell whose observed `PARTIAL` line
   * disagrees with this label is a VIOLATION. A draft documented it as checked and only ever
   * interpolated it into a report line, which a refuter caught. This is the one axis the
   * identical-versus-more split is about, so a silently wrong label here would be a wrong table.
   */
  halts: boolean;
  /** Synthetic values that must be present in the RAW BYTES. */
  plants: string[];
  /** Whether `parseDicom` is expected to accept it. Checked, not trusted. */
  parses: boolean;
  buf: Buffer;
}

const OBJECTS: ProbeObject[] = [
  {
    id: "01-complete-allowlisted",
    halts: false,
    plants: [ALLOWED_PN, OLD_DA],
    parses: true,
    buf: part10([shortEl(0x0008, 0x0020, "DA", OLD_DA), shortEl(0x0010, 0x0010, "PN", ALLOWED_PN)]),
  },
  {
    id: "02-complete-bare-pn",
    halts: false,
    plants: [BARE_PN],
    parses: true,
    buf: part10([shortEl(0x0008, 0x0020, "DA", OLD_DA), shortEl(0x0010, 0x0010, "PN", BARE_PN)]),
  },
  {
    id: "03-complete-recent-da",
    halts: false,
    plants: [RECENT_DA],
    parses: true,
    buf: part10([
      shortEl(0x0008, 0x0020, "DA", RECENT_DA),
      shortEl(0x0010, 0x0010, "PN", ALLOWED_PN),
    ]),
  },
  {
    id: "04-undefsq-then-caret-pn",
    halts: true,
    plants: [CARET_PN],
    parses: true,
    buf: part10([undefSq(0x0008, 0x1110), shortEl(0x0010, 0x0010, "PN", CARET_PN)]),
  },
  {
    // The money shape: the tag table is the only route that can see a single-component PN, and the
    // halt sits in front of it. Exit 0 on both trees; only the disclosure changes.
    id: "05-undefsq-then-bare-pn",
    halts: true,
    plants: [BARE_PN],
    parses: true,
    buf: part10([undefSq(0x0008, 0x1110), shortEl(0x0010, 0x0010, "PN", BARE_PN)]),
  },
  {
    id: "06-undefsq-then-bare-pn-preambleless",
    halts: true,
    plants: [BARE_PN],
    parses: true,
    buf: part10([undefSq(0x0008, 0x1110), shortEl(0x0010, 0x0010, "PN", BARE_PN)], {
      preamble: false,
    }),
  },
  {
    id: "07-encapsulated-pixeldata-after-name",
    halts: true,
    plants: [BARE_PN],
    parses: true,
    buf: part10([shortEl(0x0010, 0x0010, "PN", BARE_PN), encapsulatedPixelData()]),
  },
  {
    // WELL FORMED UNDER A RETIRED SYNTAX, NOT CONFORMANT. PS3.5 2026c section A.3 retires Explicit
    // VR Big Endian, and this package's generated UID registry marks it `retired: true`. The
    // verification below is what corrected the label: `parseDicom` accepts it with zero warnings.
    id: "08-big-endian-dataset",
    halts: true,
    plants: [CARET_PN],
    parses: true,
    buf: part10(
      [shortElBE(0x0008, 0x0020, "DA", OLD_DA), shortElBE(0x0010, 0x0010, "PN", CARET_PN)],
      { ts: "1.2.840.10008.1.2.2" },
    ),
  },
  {
    id: "09-value-past-end",
    halts: true,
    plants: [BARE_PN],
    parses: false,
    buf: part10([shortEl(0x0010, 0x0010, "PN", BARE_PN), overDeclared("STUDY", 64)]),
  },
  {
    id: "10-garbage-vr-mid-dataset",
    halts: true,
    plants: [BARE_PN],
    parses: false,
    buf: part10([
      shortEl(0x0010, 0x0010, "PN", BARE_PN),
      garbageVr(),
      shortEl(0x0008, 0x0020, "DA", RECENT_DA),
    ]),
  },
  {
    id: "11-short-tail",
    halts: true,
    plants: [BARE_PN],
    parses: false,
    buf: Buffer.concat([
      part10([shortEl(0x0010, 0x0010, "PN", BARE_PN)]),
      Buffer.from([0x01, 0x02, 0x03, 0x04]),
    ]),
  },
  {
    id: "12-not-a-dicom-stream",
    halts: false,
    plants: [CARET_PN],
    parses: false,
    buf: Buffer.from(`clinic note for ${CARET_PN} seen 2024-07-12\n`, "utf8"),
  },
  {
    id: "13-truncated-long-form-header",
    halts: true,
    plants: [BARE_PN],
    parses: false,
    buf: Buffer.concat([part10([shortEl(0x0010, 0x0010, "PN", BARE_PN)]), longFormStub()]),
  },
];

// ---------------------------------------------------------------------------
// The generator is an instrument: verify it before believing a zero it produces
// ---------------------------------------------------------------------------

function verifyGenerator(): number {
  let failures = 0;
  for (const o of OBJECTS) {
    const raw = o.buf.toString("latin1");
    for (const p of o.plants) {
      if (!raw.includes(p)) {
        process.stdout.write(`FAIL ${o.id}: planted value is not in the bytes\n`);
        failures += 1;
      }
    }

    let note: string;
    if (o.id === "12-not-a-dicom-stream") {
      note = "not a DICOM stream (deliberate)";
    } else {
      try {
        const ds = parseDicom(o.buf);
        const els = ds.elements();
        const flat = els
          .map((e) => (e.rawBytes === undefined ? "" : Buffer.from(e.rawBytes).toString("latin1")))
          .join("|");
        const missing = o.plants.filter((p) => !flat.includes(p));
        note =
          `parsed: ${String(els.length)} element(s), ${String(ds.warnings.length)} warning(s), ` +
          `read-back=${missing.length === 0 ? "ALL" : "MISSING"}`;
        if (o.parses && missing.length > 0) {
          process.stdout.write(`FAIL ${o.id}: parseDicom did not read the planted value back\n`);
          failures += 1;
        }
        if (!o.parses) {
          process.stdout.write(`FAIL ${o.id}: labelled malformed but parseDicom accepted it\n`);
          failures += 1;
        }
      } catch (err) {
        const code = err instanceof Error ? ((err as { code?: string }).code ?? err.name) : "?";
        note = `FATAL ${code}`;
        if (o.parses) {
          process.stdout.write(`FAIL ${o.id}: expected a parse, got ${note}\n`);
          failures += 1;
        }
      }
    }
    process.stdout.write(
      `${o.id.padEnd(38)} len=${String(o.buf.length).padStart(5)} ` +
        `halts=${String(o.halts).padEnd(5)} ${note}\n`,
    );
  }
  return failures;
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

interface Carrier {
  id: string;
  bytes: (o: ProbeObject) => Buffer;
  ext: string;
}

const CARRIERS: Carrier[] = [
  { id: "dcm", ext: ".dcm", bytes: (o) => o.buf },
  { id: "md", ext: ".md", bytes: (o) => o.buf },
  { id: "bin", ext: ".bin", bytes: (o) => o.buf },
  {
    id: "b64-md",
    ext: ".md",
    bytes: (o) => Buffer.from(`# page\n\n\`\`\`\n${o.buf.toString("base64")}\n\`\`\`\n`, "utf8"),
  },
  {
    id: "b64-ts",
    ext: ".ts",
    bytes: (o) => Buffer.from(`export const OBJ = "${o.buf.toString("base64")}";\n`, "utf8"),
  },
];

const CAPS: { id: string; args: string[] }[] = [
  { id: "default", args: [] },
  { id: "cap0", args: ["--max-hit-lines", "0"] },
  { id: "cap1", args: ["--max-hit-lines", "1"] },
];

interface RunOut {
  code: number;
  out: string;
}

function runScanner(script: string, args: string[]): RunOut {
  // SECURITY: array-form spawnSync, no shell.
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { code: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function hitLines(out: string): string {
  return out
    .split("\n")
    .filter((l) => /^ {2}tag=/.test(l))
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

function lineMultiset(out: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of out.split("\n")) {
    if (l.length === 0) continue;
    m.set(l, (m.get(l) ?? 0) + 1);
  }
  return m;
}

function totalLines(m: Map<string, number>): number {
  let n = 0;
  for (const v of m.values()) n += v;
  return n;
}

function runMatrix(basePath: string): number {
  const dir = mkdtempSync(join(tmpdir(), "dicom-phi-scan-unread-matrix-"));
  let identical = 0;
  let more = 0;
  let claimCut = 0;
  let partialCells = 0;
  const violations: string[] = [];
  const rows: string[] = [];

  try {
    for (const [i, o] of OBJECTS.entries()) {
      const marks: string[] = [];
      for (const carrier of CARRIERS) {
        const path = join(dir, `o${String(i)}-${carrier.id}${carrier.ext}`);
        writeFileSync(path, carrier.bytes(o));
        for (const cap of CAPS) {
          const b = runScanner(basePath, [...cap.args, path]);
          const s = runScanner(SHIPPED, [...cap.args, path]);
          const cell = `${o.id}/${carrier.id}/${cap.id}`;
          let clean = true;

          if (b.code !== s.code) {
            violations.push(`${cell}: exit ${String(b.code)} -> ${String(s.code)}`);
            clean = false;
          }
          if (hitLines(b.out) !== hitLines(s.out)) {
            violations.push(`${cell}: hit detail lines changed`);
            clean = false;
          }

          const bm = lineMultiset(b.out);
          const sm = lineMultiset(s.out);
          const missing: [string, number][] = [];
          for (const [line, n] of bm) {
            const have = sm.get(line) ?? 0;
            if (have < n) missing.push([line, n - have]);
          }

          const partial = s.out.includes("[phi-scan] PARTIAL:");
          if (partial) partialCells += 1;

          // The label is an assertion, not a caption. If an object declared `halts` and no cell of
          // it prints a PARTIAL line (or the reverse), the split this table reports is wrong.
          if (partial !== o.halts) {
            violations.push(`${cell}: halts=${String(o.halts)} but PARTIAL=${String(partial)}`);
            clean = false;
          }

          // The ONE withdrawal this change is allowed, and it is tested for rather than read off
          // a table: the missing set must be exactly the `OK` line, once, with the replacement
          // present. Anything else missing is a violation.
          const onlyOkCut =
            missing.length === 1 &&
            missing[0]?.[0] === OK_LINE &&
            missing[0][1] === 1 &&
            partial &&
            s.out.includes("This run is not an all-clear.");
          if (missing.length > 0 && !onlyOkCut) {
            for (const [line, n] of missing) {
              violations.push(`${cell}: lost x${String(n)} ${JSON.stringify(line)}`);
            }
            clean = false;
          }

          if (clean) {
            if (onlyOkCut) claimCut += 1;
            else if (totalLines(sm) > totalLines(bm)) more += 1;
            else identical += 1;
          }
          if (cap.id === "default") {
            marks.push(`${carrier.id}:${String(b.code)}${String(s.code)}${partial ? "P" : "-"}`);
          }
        }
      }
      rows.push(`${o.id.padEnd(38)} halts=${String(o.halts).padEnd(5)} ${marks.join("  ")}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  process.stdout.write("\n=== default cap: base exit, shipped exit, P = a PARTIAL line ===\n");
  for (const r of rows) process.stdout.write(`${r}\n`);

  const total = OBJECTS.length * CARRIERS.length * CAPS.length;
  process.stdout.write(
    `\n=== ${String(total)} cells (${String(OBJECTS.length)} objects x ` +
      `${String(CARRIERS.length)} carriers x ${String(CAPS.length)} cap settings) ===\n` +
      `identical:     ${String(identical)}\n` +
      `strictly more: ${String(more)}\n` +
      `claim-cut:     ${String(claimCut)}  (only ${JSON.stringify(OK_LINE)} withdrawn)\n` +
      `violations:    ${String(violations.length)}\n` +
      `cells printing a PARTIAL line: ${String(partialCells)}\n`,
  );
  for (const v of violations.slice(0, 25)) process.stdout.write(`  VIOLATION ${v}\n`);
  return violations.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function reportReasons(): void {
  const dir = mkdtempSync(join(tmpdir(), "dicom-phi-scan-unread-reasons-"));
  try {
    process.stdout.write("\n=== the reason each object reports (shipped tree) ===\n");
    for (const [i, o] of OBJECTS.entries()) {
      const path = join(dir, `r${String(i)}.dcm`);
      writeFileSync(path, o.buf);
      const r = runScanner(SHIPPED, [path]);
      const line = r.out.split("\n").find((l) => l.startsWith("[phi-scan] PARTIAL:"));
      // "read to the end" is wrong for an object the DICOM route never ENTERS: `fileMetaStart`
      // answers null for `12-not-a-dicom-stream`, so there is no walk to reach an end of. The two
      // are distinguished rather than collapsed, because collapsing them is what made the note's
      // detector-zero paragraph overstate one of its four legs.
      const entered = o.id !== "12-not-a-dicom-stream";
      const reason =
        line === undefined
          ? entered
            ? "(none: the walk read to the end)"
            : "(none: the DICOM route is never entered)"
          : line.replace(/^.*read: /, "");
      process.stdout.write(`${o.id.padEnd(38)} exit=${String(r.code)} ${reason}\n`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const basePath = process.argv[2];
const generatorFailures = verifyGenerator();
if (generatorFailures > 0) {
  process.stdout.write(`\nGENERATOR FAILURES: ${String(generatorFailures)}. Nothing below is\n`);
  process.stdout.write("evidence: a zero from an unverified instrument is not a measurement.\n");
  process.exit(1);
}
process.stdout.write("\nGENERATOR VERIFIED: 0 failures\n");

reportReasons();

if (basePath === undefined) {
  process.stdout.write(
    "\nNo base scanner given, so no matrix was run. Pass one to compare trees:\n" +
      "  git show <base>:scripts/phi-scan.ts > /tmp/base-phi-scan.ts\n" +
      "  pnpm measure:phi-scan-unread /tmp/base-phi-scan.ts\n",
  );
  process.exit(0);
}

process.exit(runMatrix(basePath) === 0 ? 0 : 1);
